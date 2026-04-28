#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { handleGetIssueList } from "./tools/get-issue-list.js";
import { handleGetIssue } from "./tools/get-issue.js";
import { handleGetComments } from "./tools/get-comments.js";
import { handleGetStatuses } from "./tools/get-statuses.js";
import { handleGetPriorities } from "./tools/get-priorities.js";
import { handleGetCategories } from "./tools/get-categories.js";
import { handleGetMilestones } from "./tools/get-milestones.js";
import { handleGetProjects } from "./tools/get-projects.js";
import { handleGetUsers } from "./tools/get-users.js";
import { handleGetAttachments } from "./tools/get-attachments.js";
import { handleDownloadAttachment } from "./tools/download-attachment.js";
import { handleExportIssueContext } from "./tools/export-issue-context.js";

// ---------------------------------------------------------------------------
// MCP server factory
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "backlog-mcp",
    version: "0.2.0",
  });

  // ── Tool: backlog_get_issue_list ──────────────────────────────────────────
  server.tool(
    "backlog_get_issue_list",
    `Fetch a list of Backlog issues with optional filters.

Returns a compact table + detailed summaries for each issue.

FILTERS:
- projectIdOrKey: project key (e.g. "MYPROJ") or numeric ID — auto-resolved. Highly recommended.
- statusId: 1=Open, 2=InProgress, 3=Resolved, 4=Closed
- priorityId: 2=High, 3=Normal, 4=Low
- assigneeId: filter by specific user ID(s)
- keyword: full-text search in summary and description
- parentChild: 0=all, 1=child only, 2=parent only, 3=no parent, 4=no child

Array fields accept CSV string ("1,2") or JSON array ([1,2]).
PAGINATION: Use offset + count to paginate. Max 100 per request.`,
    {
      projectIdOrKey: z
        .string()
        .optional()
        .describe(
          "Filter by project key(s) or numeric ID(s). Comma-separated. " +
          "Examples: \"MYPROJ\", \"12345\", \"MYPROJ,OTHER\". Auto-resolved to numeric IDs. Highly recommended."
        ),
      statusId: z
        .preprocess(
          (v) => typeof v === "string" ? v.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0) : v,
          z.array(z.number().int().min(1).max(4))
        )
        .optional()
        .describe("Filter by status: 1=Open, 2=InProgress, 3=Resolved, 4=Closed. Accept [1,2] or \"1,2\""),
      priorityId: z
        .preprocess(
          (v) => typeof v === "string" ? v.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0) : v,
          z.array(z.number().int())
        )
        .optional()
        .describe("Filter by priority: 2=High, 3=Normal, 4=Low. Accept [2,3] or \"2,3\""),
      assigneeId: z
        .preprocess(
          (v) => typeof v === "string" ? v.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0) : v,
          z.array(z.number().int().positive())
        )
        .optional()
        .describe("Filter by assignee user ID(s). Accept [123] or \"123\""),
      categoryId: z
        .preprocess(
          (v) => typeof v === "string" ? v.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0) : v,
          z.array(z.number().int().positive())
        )
        .optional()
        .describe("Filter by category ID(s). Accept [10,11] or \"10,11\""),
      milestoneId: z
        .preprocess(
          (v) => typeof v === "string" ? v.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0) : v,
          z.array(z.number().int().positive())
        )
        .optional()
        .describe("Filter by milestone ID(s). Accept [20] or \"20\""),
      keyword: z
        .string()
        .optional()
        .describe("Search keyword in summary and description"),
      parentChild: z
        .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
        .optional()
        .describe("0=all, 1=child only, 2=parent only, 3=no parent, 4=no child"),
      count: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Number of issues (1–100, default 20)"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Pagination offset (default 0)"),
      sort: z
        .enum([
          "issueType", "category", "version", "milestone", "summary", "status",
          "priority", "attachment", "sharedFile", "created", "createdUser",
          "updated", "updatedUser", "assignee", "startDate", "dueDate",
          "estimatedHours", "actualHours", "childIssue",
        ])
        .optional()
        .describe("Sort field"),
      order: z
        .enum(["asc", "desc"])
        .optional()
        .default("desc")
        .describe("Sort order: asc or desc (default desc)"),
    },

    async (input) => {
      return handleGetIssueList(input, config);
    }
  );

  // ── Tool: backlog_get_issue ───────────────────────────────────────────────
  server.tool(
    "backlog_get_issue",
    `Fetch a single Backlog issue by key or ID and return its full details.

Returns: summary, description, status, priority, type, assignee, reporter,
categories, milestones, versions, dates, estimated/actual hours.

Use backlog_get_comments separately to fetch comments.`,
    {
      issueIdOrKey: z
        .string()
        .min(1)
        .describe("Backlog issue key (e.g. BLG-123) or numeric issue ID"),
    },
    async (input) => {
      return handleGetIssue(input, config);
    }
  );

  // ── Tool: backlog_get_comments ────────────────────────────────────────────
  server.tool(
    "backlog_get_comments",
    `Fetch comments for a Backlog issue.

Returns each comment with: author, date, text content, and field changes
(changelog) showing what fields were modified in that activity entry.

PAGINATION: Use minId/maxId to page through comments:
- For next page (desc order): use maxId = (lowest comment ID from previous page - 1)
- For next page (asc order): use minId = (highest comment ID from previous page + 1)`,
    {
      issueIdOrKey: z
        .string()
        .min(1)
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
        .describe("asc = oldest first, desc = newest first (default)"),
      minId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Return comments with ID >= minId"),
      maxId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Return comments with ID <= maxId"),
    },
    async (input) => {
      return handleGetComments(input, config);
    }
  );

  // ── Tool: backlog_get_statuses ────────────────────────────────────────────
  server.tool(
    "backlog_get_statuses",
    `Fetch all statuses defined for a Backlog project.

Returns each status with its ID, name, and color.
Use the IDs to filter issues via backlog_get_issue_list (statusId param).`,
    {
      projectIdOrKey: z
        .string()
        .min(1)
        .describe("Project key (e.g. MYPROJ) or numeric project ID"),
    },
    async (input) => {
      return handleGetStatuses(input, config);
    }
  );

  // ── Tool: backlog_get_priorities ─────────────────────────────────────────
  server.tool(
    "backlog_get_priorities",
    `Fetch the global list of issue priorities for this Backlog space.

Priorities are space-wide (not project-specific).
Returns each priority with its ID and name.
Use the IDs to filter issues via backlog_get_issue_list (priorityId param).`,
    {},
    async (input) => {
      return handleGetPriorities(input, config);
    }
  );

  // ── Tool: backlog_get_categories ─────────────────────────────────────────
  server.tool(
    "backlog_get_categories",
    `Fetch all categories defined for a Backlog project.

Returns each category with its ID and name.
Use the IDs to filter issues via backlog_get_issue_list (categoryId param).`,
    {
      projectIdOrKey: z
        .string()
        .min(1)
        .describe("Project key (e.g. MYPROJ) or numeric project ID"),
    },
    async (input) => {
      return handleGetCategories(input, config);
    }
  );

  // ── Tool: backlog_get_milestones ─────────────────────────────────────────
  server.tool(
    "backlog_get_milestones",
    `Fetch milestones (versions) for a Backlog project.

Returns each milestone with its ID, name, start date, due date, and archived flag.
By default, only active (non-archived) milestones are returned.
Set archived=true to include all milestones.
Use the IDs to filter issues via backlog_get_issue_list (milestoneId param).`,
    {
      projectIdOrKey: z
        .string()
        .min(1)
        .describe("Project key (e.g. MYPROJ) or numeric project ID"),
      archived: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include archived milestones. Default: false (active only)"),
    },
    async (input) => {
      return handleGetMilestones(input, config);
    }
  );

  // ── Tool: backlog_get_projects ───────────────────────────────────────────
  server.tool(
    "backlog_get_projects",
    `Fetch the list of Backlog projects accessible to the authenticated user.

Returns each project with its numeric ID, project key, name, and archived status.
Use the numeric ID in the projectId[] filter of backlog_get_issue_list.

Optional filter:
- archived: omit = all projects, false = active only (default), true = archived only`,
    {
      archived: z
        .boolean()
        .optional()
        .describe(
          "Filter by archived status. Omit = all, false = active only, true = archived only"
        ),
    },
    async (input) => {
      return handleGetProjects(input, config);
    }
  );

  // ── Tool: backlog_get_users ──────────────────────────────────────────────
  server.tool(
    "backlog_get_users",
    `Fetch project members for a given Backlog project.

Returns a table of users with their numeric ID, userId, display name, email, and role.
Use the ID column as assigneeId in backlog_get_issue_list to filter by assignee.

INPUT:
- projectIdOrKey (required): project key e.g. "MYPROJ" or numeric ID e.g. "12345"
- keyword (optional): filter by display name or userId, case-insensitive

EXAMPLE: List all members of project "MYPROJ" → { projectIdOrKey: "MYPROJ" }
EXAMPLE: Find user named "Nguyen"       → { projectIdOrKey: "MYPROJ", keyword: "nguyen" }`,
    {
      projectIdOrKey: z
        .string()
        .min(1)
        .describe(
          "Project key or numeric ID. Examples: \"MYPROJ\", \"12345\". " +
          "Use backlog_get_projects to discover project keys."
        ),
      keyword: z
        .string()
        .optional()
        .describe(
          "Filter by display name or userId (case-insensitive). " +
          "Example: \"nguyen\" or \"john.doe\""
        ),
    },
    async (input) => {
      return handleGetUsers(input, config);
    }
  );

  // ── Tool: backlog_get_attachments ────────────────────────────────────────
  server.tool(
    "backlog_get_attachments",
    `List all attachments on a Backlog issue.

Returns a table with attachment ID, filename, size, uploader, and upload date.
Use the attachment ID with backlog_download_attachment to download a specific file.

INPUT:
- issueIdOrKey (required): issue key e.g. "BLG-123" or numeric ID e.g. "12345"

EXAMPLE: { issueIdOrKey: "BLG-123" }`,
    {
      issueIdOrKey: z
        .string()
        .min(1)
        .describe(
          "Issue key or numeric ID. Examples: \"BLG-123\", \"12345\". " +
          "Use the attachment ID from this result with backlog_download_attachment."
        ),
    },
    async (input) => {
      return handleGetAttachments(input, config);
    }
  );

  // ── Tool: backlog_download_attachment ─────────────────────────────────────
  server.tool(
    "backlog_download_attachment",
    `Download an attachment from a Backlog issue and save it to the local filesystem.

Returns the absolute path where the file was saved, the filename, and the file size.
Get the attachmentId from backlog_get_attachments first.
The output directory is configured via ATTACHMENT_WORKSPACE in the server's environment.

INPUT:
- issueIdOrKey (required): issue key e.g. "BLG-123" or numeric ID
- attachmentId (required): numeric ID from backlog_get_attachments

EXAMPLE: { issueIdOrKey: "BLG-123", attachmentId: 42 }`,
    {
      issueIdOrKey: z
        .string()
        .min(1)
        .describe("Issue key or numeric ID. Examples: \"BLG-123\", \"12345\"."),
      attachmentId: z
        .number()
        .int()
        .positive()
        .describe("Numeric attachment ID from backlog_get_attachments. Example: 42"),
    },
    async (input) => {
      return handleDownloadAttachment(input, config);
    }
  );

  // ── Tool: backlog_export_issue_context ────────────────────────────────────
  server.tool(
    "backlog_export_issue_context",
    `Export a Backlog issue into a local raw context bundle for LLM summarization.

Fetches issue details, all comments (paginated), attachment metadata, downloads files, and writes:
- raw.md: full markdown context with complete metadata (type, status, resolution, priority, parent, assignee, reporter, categories, milestones, versions, dates, hours), description, attachments, comments, and extracted text
- manifest.json: machine-readable export metadata with placement confidence per attachment

Attachment placement is exact only when issue/comment text references the attachment; otherwise inferred by uploader/time or left unmatched.
The output directory is configured via ATTACHMENT_WORKSPACE in the server's environment.

INPUT:
- issueIdOrKey (required): issue key e.g. "BLG-10474" or numeric ID
- outputDir (optional): override export root directory
- includeComments/includeAttachments/downloadAttachments (optional booleans, default: true)
- extractReadableFiles (optional boolean, default: false)
- skipChangelogOnlyComments (optional boolean, default: false) — skip comments with no text (only field changes)
- maxAttachmentBytes (optional): skip files larger than this (default: 10485760 = 10 MB)
- placementWindowMinutes (optional): time window for inferred comment placement (default: 10)

EXAMPLE: { issueIdOrKey: "BLG-10474" }`,
    {
      issueIdOrKey: z
        .string()
        .min(1)
        .describe("Backlog issue key or numeric issue ID. Example: BLG-10474"),
      outputDir: z
        .string()
        .optional()
        .describe("Root directory for export output. Default: ATTACHMENT_WORKSPACE config value."),
      includeComments: z
        .boolean()
        .optional()
        .describe("Include all issue comments. Default: true."),
      includeAttachments: z
        .boolean()
        .optional()
        .describe("Include issue attachment metadata. Default: true."),
      downloadAttachments: z
        .boolean()
        .optional()
        .describe("Download attachment files. Default: true."),
      extractReadableFiles: z
        .boolean()
        .optional()
        .describe("Extract text-like attachment contents into markdown. Default: false."),
      maxAttachmentBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Skip downloading attachments larger than this many bytes. Default: 10485760."),
      placementWindowMinutes: z
        .number()
        .int()
        .min(0)
        .max(1440)
        .optional()
        .describe("Time window (minutes) for inferred comment attachment placement. Default: 10."),
      skipChangelogOnlyComments: z
        .boolean()
        .optional()
        .describe(
          "Skip comments that have no text content (only field changes). Useful for translation/export workflows. Default: false."
        ),
    },
    async (input) => {
      return handleExportIssueContext(input, config);
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Stdio transport — the MCP client spawns this process
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("backlog-mcp started (stdio)\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[backlog-mcp] Fatal error: ${msg}\n`);
  process.exit(1);
});
