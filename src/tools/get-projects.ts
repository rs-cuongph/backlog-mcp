import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { BacklogProject } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getProjectsSchema = z.object({
  archived: z
    .boolean()
    .optional()
    .describe(
      "Filter by archived status. Omit to return all projects, true = archived only, false = active only."
    ),
});

export type GetProjectsInput = z.infer<typeof getProjectsSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetProjects(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getProjectsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const projects = await client.getProjects(parsed.data.archived);
    return { content: [{ type: "text", text: formatProjects(projects, parsed.data.archived) }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatProjects(projects: BacklogProject[], archived: boolean | undefined): string {
  const lines: string[] = [];

  const label =
    archived === true ? "Archived Projects" :
    archived === false ? "Active Projects" :
    "All Projects";

  lines.push(`# ${label}`);
  lines.push(``);

  if (projects.length === 0) {
    lines.push("_No projects found._");
    return lines.join("\n");
  }

  lines.push(`| ID | Key | Name | Archived |`);
  lines.push(`|----|-----|------|----------|`);
  for (const p of projects) {
    const arc = p.archived ? "✓" : "";
    lines.push(`| ${p.id} | ${p.projectKey} | ${p.name} | ${arc} |`);
  }

  const exampleKey = projects[0].projectKey;
  lines.push(navigationHint([
    `\`backlog_get_issue_list(projectIdOrKey: "${exampleKey}")\` — browse issues in this project`,
    `\`backlog_get_users(projectIdOrKey: "${exampleKey}")\` — list project members`,
    `\`backlog_get_statuses(projectIdOrKey: "${exampleKey}")\` — get available statuses for filtering`,
  ]));

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
