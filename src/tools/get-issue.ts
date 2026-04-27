import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import { formatDate, formatHours, navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { BacklogIssue } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getIssueSchema = z.object({
  issueIdOrKey: z
    .string()
    .min(1, "issueIdOrKey is required")
    .describe("Backlog issue key (e.g. BLG-123) or numeric issue ID"),
});

export type GetIssueInput = z.infer<typeof getIssueSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetIssue(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getIssueSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const issue = await client.getIssue(parsed.data.issueIdOrKey);
    return { content: [{ type: "text", text: formatIssue(issue) }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatIssue(issue: BacklogIssue): string {
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(`# [${issue.issueKey}] ${issue.summary}`);
  lines.push(``);
  lines.push(`**URL:** ${issue.url}`);
  lines.push(``);

  // ── Classification ───────────────────────────────────────────────────────
  lines.push(`## Details`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Type** | ${issue.issueType} |`);
  lines.push(`| **Status** | ${issue.status} |`);
  if (issue.resolution) {
    lines.push(`| **Resolution** | ${issue.resolution} |`);
  }
  lines.push(`| **Priority** | ${issue.priority ?? "—"} |`);
  if (issue.parentIssueId) {
    lines.push(`| **Parent Issue ID** | ${issue.parentIssueId} |`);
  }
  if (issue.categories.length > 0) {
    lines.push(`| **Categories** | ${issue.categories.join(", ")} |`);
  }
  if (issue.versions.length > 0) {
    lines.push(`| **Versions** | ${issue.versions.join(", ")} |`);
  }
  if (issue.milestones.length > 0) {
    lines.push(`| **Milestones** | ${issue.milestones.join(", ")} |`);
  }
  lines.push(``);

  // ── People ───────────────────────────────────────────────────────────────
  lines.push(`## People`);
  lines.push(``);
  lines.push(`| Role | Name |`);
  lines.push(`|------|------|`);
  lines.push(`| **Assignee** | ${issue.assignee ?? "Unassigned"} |`);
  lines.push(`| **Reporter** | ${issue.reporter ?? "—"} |`);
  lines.push(``);

  // ── Dates ────────────────────────────────────────────────────────────────
  lines.push(`## Dates`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Created** | ${formatDate(issue.created)} |`);
  lines.push(`| **Updated** | ${formatDate(issue.updated)} |`);
  if (issue.startDate) {
    lines.push(`| **Start Date** | ${issue.startDate} |`);
  }
  if (issue.dueDate) {
    lines.push(`| **Due Date** | ${issue.dueDate} |`);
  }
  lines.push(``);

  // ── Time ─────────────────────────────────────────────────────────────────
  const est = formatHours(issue.estimatedHours);
  const act = formatHours(issue.actualHours);
  if (est || act) {
    lines.push(`## Time`);
    lines.push(``);
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    if (est) lines.push(`| **Estimated** | ${est} |`);
    if (act) lines.push(`| **Actual** | ${act} |`);
    lines.push(``);
  }

  // ── Description ──────────────────────────────────────────────────────────
  lines.push(`## Description`);
  lines.push(``);
  lines.push(issue.description ?? "_No description provided._");

  // ── Navigation hints ─────────────────────────────────────────────────────
  lines.push(navigationHint([
    `\`backlog_get_comments(issueIdOrKey: "${issue.issueKey}")\` — read discussion & change history`,
    `\`backlog_get_attachments(issueIdOrKey: "${issue.issueKey}")\` — list attached files`,
    `\`backlog_export_issue_context(issueIdOrKey: "${issue.issueKey}")\` — export full context bundle (comments + attachments)`,
  ]));

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
