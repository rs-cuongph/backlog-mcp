import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "./config.js";
import { handleGetIssueList } from "./tools/get-issue-list.js";
import { handleGetIssue } from "./tools/get-issue.js";
import { handleGetComments } from "./tools/get-comments.js";
import { handleGetStatuses } from "./tools/get-statuses.js";
import { handleGetPriorities } from "./tools/get-priorities.js";
import { handleGetCategories } from "./tools/get-categories.js";
import { handleGetMilestones } from "./tools/get-milestones.js";

// ---------------------------------------------------------------------------
// MCP server factory
// A new McpServer is created per request (stateless Streamable HTTP pattern).
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "backlog-mcp",
    version: "0.1.0",
  });

  // ── Tool: backlog_get_issue_list ──────────────────────────────────────────
  server.tool(
    "backlog_get_issue_list",
    `Fetch a list of Backlog issues with optional filters.

Returns a compact table + detailed summaries for each issue.

FILTERS:
- projectId: required to scope results to a specific project
- statusId: 1=Open, 2=InProgress, 3=Resolved, 4=Closed
- priorityId: 2=High, 3=Normal, 4=Low
- assigneeId: filter by specific user ID(s)
- keyword: full-text search in summary and description
- parentChild: 0=all, 1=child only, 2=parent only, 3=no parent, 4=no child

PAGINATION: Use offset + count to paginate. Max 100 per request.`,
    {
      projectId: z
        .array(z.number().int().positive())
        .optional()
        .describe("Filter by project ID(s). Highly recommended."),
      statusId: z
        .array(z.number().int().min(1).max(4))
        .optional()
        .describe("Filter by status: 1=Open, 2=InProgress, 3=Resolved, 4=Closed"),
      priorityId: z
        .array(z.number().int())
        .optional()
        .describe("Filter by priority: 2=High, 3=Normal, 4=Low"),
      assigneeId: z
        .array(z.number().int().positive())
        .optional()
        .describe("Filter by assignee user ID(s)"),
      categoryId: z
        .array(z.number().int().positive())
        .optional()
        .describe("Filter by category ID(s)"),
      milestoneId: z
        .array(z.number().int().positive())
        .optional()
        .describe("Filter by milestone ID(s)"),
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

  return server;
}

// ---------------------------------------------------------------------------
// Express + Streamable HTTP transport
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

/**
 * MCP endpoint — stateless, per-request server+transport pair.
 */
app.all("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session header
  });

  res.on("close", () => {
    transport.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[MCP] Request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "backlog-mcp",
    version: "0.1.0",
    backlogUrl: config.BACKLOG_BASE_URL,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(config.MCP_PORT, () => {
  console.log(`\n🚀 Backlog MCP server running`);
  console.log(`   Port     : ${config.MCP_PORT}`);
  console.log(`   Endpoint : http://localhost:${config.MCP_PORT}/mcp`);
  console.log(`   Health   : http://localhost:${config.MCP_PORT}/health`);
  console.log(`   Backlog  : ${config.BACKLOG_BASE_URL}\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n⏹  Shutting down...");
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("\n⏹  Shutting down...");
  process.exit(0);
});
