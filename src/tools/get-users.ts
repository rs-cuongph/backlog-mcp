import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { BacklogUser } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getUsersSchema = z.object({
  projectIdOrKey: z
    .string()
    .min(1)
    .describe(
      "Project key or numeric ID to list members for. " +
      "Examples: \"MYPROJ\", \"12345\". " +
      "Use backlog_get_projects to discover project keys."
    ),
  keyword: z
    .string()
    .optional()
    .describe(
      "Optional keyword to filter users client-side. " +
      "Matches against display name (name) or user ID (userId), case-insensitive. " +
      "Example: \"nguyen\" or \"john.doe\""
    ),
});

export type GetUsersInput = z.infer<typeof getUsersSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetUsers(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getUsersSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { projectIdOrKey, keyword } = parsed.data;
  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    let users = await client.getProjectUsers(projectIdOrKey);

    // Client-side keyword filter
    if (keyword) {
      const kw = keyword.toLowerCase();
      users = users.filter(
        (u) =>
          (u.name ?? "").toLowerCase().includes(kw) ||
          (u.userId ?? "").toLowerCase().includes(kw)
      );
    }

    return {
      content: [{ type: "text", text: formatUsers(users, projectIdOrKey, keyword) }],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatUsers(
  users: BacklogUser[],
  projectIdOrKey: string,
  keyword: string | undefined
): string {
  const lines: string[] = [];

  lines.push(`# Backlog Project Members`);
  lines.push(``);
  lines.push(`**Project:** ${projectIdOrKey}`);
  if (keyword) lines.push(`**Filter:** keyword="${keyword}"`);
  lines.push(`**Total:** ${users.length} user(s)`);
  lines.push(``);

  if (users.length === 0) {
    lines.push("_No users found matching your criteria._");
    return lines.join("\n");
  }

  // Table
  lines.push(`| ID | User ID | Name | Email | Role |`);
  lines.push(`|----|---------|------|-------|------|`);

  for (const u of users) {
    const email = u.mailAddress ?? "—";
    const name = u.name ?? "—";
    const userId = u.userId ?? "—";
    lines.push(
      `| ${u.id} | ${userId} | ${name} | ${email} | ${u.roleName} |`
    );
  }

  const exampleUserId = users[0].id;
  lines.push(navigationHint([
    `\`backlog_get_issue_list(projectIdOrKey: "${projectIdOrKey}", assigneeId: [${exampleUserId}])\` — filter issues assigned to the first user`,
    `\`backlog_get_issue_list(projectIdOrKey: "${projectIdOrKey}")\` — browse all issues in this project`,
  ]));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function errorContent(msg: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: msg }], isError: true };
}
