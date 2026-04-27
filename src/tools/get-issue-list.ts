import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import { formatDate, formatHours, navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { BacklogIssueSummary } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Accepts either:
 *  - a JSON array of numbers:  [12345, 67890]
 *  - a comma-separated string: "12345, 67890"  or  "12345"
 * Produces: number[]
 */
function coerceIds(describe: string) {
  return z
    .preprocess((val) => {
      if (typeof val === "string") {
        return val
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => !isNaN(n) && n > 0);
      }
      return val;
    }, z.array(z.number().int().positive()))
    .optional()
    .describe(describe);
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getIssueListSchema = z.object({
  projectIdOrKey: z
    .string()
    .optional()
    .describe(
      "Filter by project key(s) or numeric ID(s). Accepts a single value or comma-separated list. " +
      "Examples: \"MYPROJ\", \"12345\", \"MYPROJ,OTHER\", \"12345,67890\". " +
      "Project keys are automatically resolved to numeric IDs. " +
      "Highly recommended — omitting fetches all visible issues."
    ),
  statusId: coerceIds(
    "Filter by status ID(s). Accept [1,2] or \"1,2\". Values: 1=Open, 2=InProgress, 3=Resolved, 4=Closed"
  ),
  priorityId: coerceIds(
    "Filter by priority ID(s). Accept [2,3] or \"2,3\". Values: 2=High, 3=Normal, 4=Low"
  ),
  assigneeId: coerceIds(
    "Filter by assignee user ID(s). Accept [123] or \"123\"."
  ),
  categoryId: coerceIds(
    "Filter by category ID(s). Accept [10,11] or \"10,11\". Use backlog_get_categories to look up IDs."
  ),
  milestoneId: coerceIds(
    "Filter by milestone ID(s). Accept [20] or \"20\". Use backlog_get_milestones to look up IDs."
  ),
  keyword: z
    .string()
    .optional()
    .describe("Search keyword — matches against issue summary and description"),
  parentChild: z
    .union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ])
    .optional()
    .describe("Parent/child filter: 0=all, 1=child only, 2=parent only, 3=no parent, 4=no child"),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe("Number of issues to return (1–100, default 20)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Pagination offset (0-based, default 0)"),
  sort: z
    .enum([
      "issueType",
      "category",
      "version",
      "milestone",
      "summary",
      "status",
      "priority",
      "attachment",
      "sharedFile",
      "created",
      "createdUser",
      "updated",
      "updatedUser",
      "assignee",
      "startDate",
      "dueDate",
      "estimatedHours",
      "actualHours",
      "childIssue",
    ])
    .optional()
    .describe("Sort field (default: created)"),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .default("desc")
    .describe("Sort order: asc or desc (default desc)"),
});

export type GetIssueListInput = z.infer<typeof getIssueListSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a CSV string of project keys / numeric IDs and returns an array of
 * numeric project IDs ready for use in the Backlog issues API.
 * Non-numeric entries (e.g. "MYPROJ") are resolved via GET /projects/:key.
 */
async function resolveProjectIds(
  input: string | undefined,
  client: BacklogHttpClient
): Promise<number[] | undefined> {
  if (!input) return undefined;

  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ids: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!isNaN(n) && n > 0) {
      ids.push(n);
    } else {
      // Project key — resolve to numeric ID
      const project = await client.getProject(part);
      ids.push(project.id);
    }
  }

  return ids.length > 0 ? ids : undefined;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetIssueList(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getIssueListSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { projectIdOrKey, statusId, priorityId, assigneeId, categoryId, milestoneId,
    keyword, parentChild, count, offset, sort, order } = parsed.data;

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    // Resolve projectIdOrKey (keys/IDs) → numeric IDs required by the API
    const projectId = await resolveProjectIds(projectIdOrKey, client);

    const issues = await client.getIssueList({
      projectId,
      statusId,
      priorityId,
      assigneeId,
      categoryId,
      milestoneId,
      keyword,
      parentChild,
      count,
      offset,
      sort,
      order,
    });

    return { content: [{ type: "text", text: formatIssueList(issues, offset ?? 0, count) }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatIssueList(issues: BacklogIssueSummary[], offset: number, count: number): string {
  const lines: string[] = [];

  lines.push(`# Backlog Issue List`);
  lines.push(``);
  lines.push(`**Showing:** ${issues.length} issue(s) (offset: ${offset})`);
  lines.push(``);

  if (issues.length === 0) {
    lines.push("_No issues found matching your filters._");
    return lines.join("\n");
  }

  lines.push(`| Key | Type | Status | Priority | Assignee | Due | Updated |`);
  lines.push(`|-----|------|--------|----------|----------|-----|---------|`);

  for (const issue of issues) {
    const due = issue.dueDate ?? "—";
    const assignee = issue.assignee ?? "Unassigned";
    const priority = issue.priority ?? "—";
    const updated = formatDate(issue.updated);

    lines.push(
      `| [${issue.issueKey}](${issue.url}) | ${issue.issueType} | ${issue.status} | ${priority} | ${assignee} | ${due} | ${updated} |`
    );
  }

  lines.push(``);
  lines.push(`## Issue Summaries`);
  lines.push(``);

  for (const issue of issues) {
    lines.push(`### [${issue.issueKey}] ${issue.summary}`);
    lines.push(``);
    lines.push(`- **URL:** ${issue.url}`);
    lines.push(`- **Status:** ${issue.status} | **Priority:** ${issue.priority ?? "—"} | **Type:** ${issue.issueType}`);
    if (issue.assignee) lines.push(`- **Assignee:** ${issue.assignee}`);
    if (issue.milestones.length > 0) lines.push(`- **Milestone:** ${issue.milestones.join(", ")}`);
    if (issue.categories.length > 0) lines.push(`- **Category:** ${issue.categories.join(", ")}`);
    if (issue.startDate || issue.dueDate) {
      lines.push(`- **Dates:** ${issue.startDate ?? "—"} → ${issue.dueDate ?? "—"}`);
    }
    const est = formatHours(issue.estimatedHours);
    const act = formatHours(issue.actualHours);
    if (est || act) {
      lines.push(`- **Hours:** Estimated ${est ?? "—"} / Actual ${act ?? "—"}`);
    }
    lines.push(`- **Created:** ${formatDate(issue.created)} | **Updated:** ${formatDate(issue.updated)}`);
    lines.push(``);
  }

  // Navigation hints
  const hints: string[] = [];
  if (issues.length > 0) {
    const firstKey = issues[0].issueKey;
    hints.push(`\`backlog_get_issue(issueIdOrKey: "${firstKey}")\` — view full details of the first issue`);
  }
  if (issues.length === count) {
    const nextOffset = offset + count;
    hints.push(`\`backlog_get_issue_list(offset: ${nextOffset})\` — load the next page (${count} more results possible)`);
  }
  if (hints.length > 0) {
    lines.push(navigationHint(hints));
  }

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
