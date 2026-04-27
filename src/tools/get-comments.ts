import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import { formatDate, navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { BacklogComment } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getCommentsSchema = z.object({
  issueIdOrKey: z
    .string()
    .min(1, "issueIdOrKey is required")
    .describe("Backlog issue key (e.g. BLG-123) or numeric issue ID"),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe("Number of comments to return (1–100, default 20)"),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .default("desc")
    .describe("Sort order: asc (oldest first) or desc (newest first, default)"),
  minId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Return comments with ID >= minId (for pagination forward)"),
  maxId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Return comments with ID <= maxId (for pagination backward)"),
});

export type GetCommentsInput = z.infer<typeof getCommentsSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetComments(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getCommentsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { issueIdOrKey, count, order, minId, maxId } = parsed.data;

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const comments = await client.getComments(issueIdOrKey, {
      count,
      order,
      minId,
      maxId,
    });

    return {
      content: [{ type: "text", text: formatComments(issueIdOrKey, comments, order, count) }],
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

function formatComments(
  issueIdOrKey: string,
  comments: BacklogComment[],
  order: string,
  count: number
): string {
  const lines: string[] = [];

  lines.push(`# Comments — ${issueIdOrKey}`);
  lines.push(``);
  lines.push(`**Total returned:** ${comments.length} | **Order:** ${order === "desc" ? "newest first" : "oldest first"}`);
  lines.push(``);

  if (comments.length === 0) {
    lines.push("_No comments found._");
    return lines.join("\n");
  }

  for (const c of comments) {
    lines.push(`---`);
    lines.push(`**Comment #${c.id}** by **${c.author ?? "Unknown"}** — ${formatDate(c.created)}`);
    if (c.updated !== c.created) {
      lines.push(`_(updated: ${formatDate(c.updated)})_`);
    }
    lines.push(``);

    // Show text content if present
    if (c.content) {
      lines.push(c.content);
      lines.push(``);
    } else if (c.changeLog.length === 0) {
      lines.push("_No text content._");
      lines.push(``);
    }

    // Show changelog (field changes) if present
    if (c.changeLog.length > 0) {
      lines.push(`**Field changes:**`);
      lines.push(``);
      lines.push(`| Field | From | To |`);
      lines.push(`|-------|------|----|`);
      for (const cl of c.changeLog) {
        const from = cl.originalValue ?? "—";
        const to = cl.newValue ?? "—";
        lines.push(`| ${cl.field} | ${from} | ${to} |`);
      }
      lines.push(``);
    }
  }

  // Navigation hints
  const hints: string[] = [
    `\`backlog_get_issue(issueIdOrKey: "${issueIdOrKey}")\` — go back to issue overview`,
  ];
  if (comments.length === count) {
    if (order === "desc") {
      const oldestId = comments[comments.length - 1].id;
      hints.push(`\`backlog_get_comments(issueIdOrKey: "${issueIdOrKey}", order: "desc", maxId: ${oldestId - 1})\` — load older comments`);
    } else {
      const newestId = comments[comments.length - 1].id;
      hints.push(`\`backlog_get_comments(issueIdOrKey: "${issueIdOrKey}", order: "asc", minId: ${newestId + 1})\` — load newer comments`);
    }
  }
  lines.push(navigationHint(hints));

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
