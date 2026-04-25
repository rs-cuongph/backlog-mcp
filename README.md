# backlog-mcp

An MCP (Model Context Protocol) server for Backlog (Nulab), providing AI agents with read access to Backlog issues and comments via API Key authentication.

## Stack

- **TypeScript** — strict, ESM (NodeNext)
- **@modelcontextprotocol/sdk** — MCP server + Streamable HTTP transport
- **Express** — HTTP layer for the MCP endpoint
- **Zod** — config and tool input validation
- **Axios** — Backlog REST API HTTP client

## Features

- 🔑 Simple API Key authentication (no browser or SSO required)
- 🔎 `backlog_get_issue_list` — list issues with rich filtering (project, status, priority, assignee, keyword, etc.)
- 🔍 `backlog_get_issue` — fetch a single issue's full details
- 💬 `backlog_get_comments` — fetch issue comments with changelog entries
- 🗂️ `backlog_get_projects` — list all accessible projects (with IDs and keys for filtering)
- 👥 `backlog_get_users` — list project members (get user IDs for assignee filtering)
- 📎 `backlog_get_attachments` — list attachments on an issue (with IDs for downloading)
- ⬇️ `backlog_download_attachment` — download an attachment to the local filesystem
- 📦 `backlog_export_issue_context` — export issue, comments, and attachments into a local raw Markdown context bundle for LLM summarization
- 🏷️ `backlog_get_statuses` — list all statuses in a project (with IDs for filtering)
- ⚡ `backlog_get_priorities` — list global issue priorities (with IDs for filtering)
- 📂 `backlog_get_categories` — list all categories in a project (with IDs for filtering)
- 🎯 `backlog_get_milestones` — list milestones/versions in a project (with IDs for filtering)

## Requirements

- Node.js >= 20
- A Backlog space with API access
- A Backlog API Key (generate at **Account Settings → API → Register API key**)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your Backlog space URL and API Key:

```env
BACKLOG_BASE_URL=https://yourspace.backlog.com
BACKLOG_API_KEY=your_api_key_here
```

### 3. Start the MCP server

```bash
npm run dev
```

The server will be available at:

- **MCP endpoint:** `http://localhost:3100/mcp`
- **Health check:** `http://localhost:3100/health`

## Agent Summary Prompt

After exporting an issue with `backlog_export_issue_context`, use `docs/prompts/backlog_issue_summary.md` as the agent prompt template for summarizing task intent, comments, attachments, inferred acceptance criteria, and optional code context.

## MCP Tools

### `backlog_get_issue_list`

Fetch a list of Backlog issues with optional filters.

**Input:**
| Field | Type | Description |
|---|---|---|
| `projectIdOrKey` | `string` | Filter by project key ("MYPROJ") or numeric ID ("12345") — comma-separated, auto-resolved |
| `statusId` | `number[] or string` | Filter by status: 1=Open, 2=InProgress, 3=Resolved, 4=Closed. Accept `[1,2]` or `"1,2"` |
| `priorityId` | `number[] or string` | Filter by priority: 2=High, 3=Normal, 4=Low. Accept `[2,3]` or `"2,3"` |
| `assigneeId` | `number[] or string` | Filter by assignee user ID(s). Get IDs from `backlog_get_users` |
| `categoryId` | `number[] or string` | Filter by category ID(s) |
| `milestoneId` | `number[] or string` | Filter by milestone ID(s) |
| `keyword` | `string` | Search keyword in summary and description |
| `parentChild` | `0\|1\|2\|3\|4` | 0=all, 1=child only, 2=parent only, 3=no parent, 4=no child |
| `count` | `number` | Number of issues (1–100, default 20) |
| `offset` | `number` | Pagination offset (default 0) |
| `sort` | `string` | Sort field (created, updated, status, priority, dueDate, ...) |
| `order` | `asc\|desc` | Sort order (default desc) |

**Output:** Compact table + detailed summaries for each issue (key, type, status, priority, assignee, dates, hours).

---

### `backlog_get_issue`

Fetch a single Backlog issue by key or numeric ID.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueIdOrKey` | `string` | Issue key (e.g. `BLG-123`) or numeric issue ID |

**Output:** Full issue details — summary, description, status, priority, type, assignee, reporter, categories, milestones, versions, dates, estimated/actual hours, URL.

---

### `backlog_get_comments`

Fetch comments for a Backlog issue.

**Input:**
| Field | Type | Description |
|---|---|---|
| `issueIdOrKey` | `string` | Issue key (e.g. `BLG-123`) or numeric issue ID |
| `count` | `number` | Number of comments (1–100, default 20) |
| `order` | `asc\|desc` | `asc` = oldest first, `desc` = newest first (default) |
| `minId` | `number` | Return comments with ID >= minId |
| `maxId` | `number` | Return comments with ID <= maxId |

**Output:** List of comments with author, date, text content, and field changes (changelog).

---

### `backlog_get_projects`

Fetch the list of Backlog projects accessible to the current API Key.

**Input:**
| Field | Type | Description |
|---|---|---|
| `archived` | `boolean` | Omit = all, `false` = active only, `true` = archived only |

**Output:** Table of projects with ID, key, name, and archived flag. Use the key in project-scoped tools or `projectIdOrKey` in `backlog_get_issue_list`.

---

### `backlog_get_users`

Fetch project members for a given Backlog project.

**Input:**
| Field | Type | Description |
|---|---|---|
| `projectIdOrKey` | `string` | **Required.** Project key (e.g. `MYPROJ`) or numeric ID |
| `keyword` | `string` | Filter by display name or userId (case-insensitive) |

**Output:** Table of project members with numeric ID, userId, name, email, and role. Use the **ID** as `assigneeId` in `backlog_get_issue_list`.

---

### `backlog_get_statuses`

Fetch all statuses defined for a Backlog project.

**Input:**
| Field | Type | Description |
|---|---|---|
| `projectIdOrKey` | `string` | Project key (e.g. `MYPROJ`) or numeric project ID |

**Output:** Table of statuses with ID, name, and color. Use IDs in `statusId` filter of `backlog_get_issue_list`.

---

### `backlog_get_priorities`

Fetch the global list of issue priorities (space-wide, not project-specific).

**Input:** None required.

**Output:** Table of priorities with ID and name. Use IDs in `priorityId` filter of `backlog_get_issue_list`.

---

### `backlog_get_categories`

Fetch all categories defined for a Backlog project.

**Input:**
| Field | Type | Description |
|---|---|---|
| `projectIdOrKey` | `string` | Project key (e.g. `MYPROJ`) or numeric project ID |

**Output:** Table of categories with ID and name. Use IDs in `categoryId` filter of `backlog_get_issue_list`.

---

### `backlog_get_milestones`

Fetch milestones (versions) for a Backlog project.

**Input:**
| Field | Type | Description |
|---|---|---|
| `projectIdOrKey` | `string` | Project key (e.g. `MYPROJ`) or numeric project ID |
| `archived` | `boolean` | Include archived milestones (default: `false`) |

**Output:** Table of milestones with ID, name, start date, due date, and archived flag. Use IDs in `milestoneId` filter of `backlog_get_issue_list`.

---

## Project Structure

```
src/
├── server.ts                # MCP server entry point (factory pattern + Express)
├── config.ts                # Env var validation (Zod)
├── errors.ts                # Typed error classes & factories
├── utils.ts                 # Shared helpers (dates, string formatting)
├── types.ts                 # Normalized domain types (BacklogIssue, BacklogComment, ...)
├── types/
│   └── backlog-api.ts       # Raw Backlog API response types
├── backlog/
│   ├── endpoints.ts         # URL builders (API v2)
│   ├── mappers.ts           # Raw API payload → domain types
│   └── http-client.ts       # API Key-authenticated Backlog HTTP client
├── tools/
│   ├── get-issue-list.ts    # backlog_get_issue_list handler
│   ├── get-issue.ts         # backlog_get_issue handler
│   ├── get-comments.ts      # backlog_get_comments handler
│   ├── get-statuses.ts      # backlog_get_statuses handler
│   ├── get-priorities.ts    # backlog_get_priorities handler
│   ├── get-categories.ts    # backlog_get_categories handler
│   └── get-milestones.ts    # backlog_get_milestones handler
└── tests/                   # Unit tests (Vitest)
```

## Development

```bash
# Type check (no emit)
npx tsc --noEmit

# Run tests
npm test

# Watch mode
npm run test:watch

# Build for production
npm run build

# Run dev server
npm run dev
```

## Integrating with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "backlog": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

## Error Codes

| Code | Meaning |
|---|---|
| `API_KEY_MISSING` | `BACKLOG_API_KEY` is not set in environment |
| `BACKLOG_HTTP_ERROR` | Unexpected HTTP error from Backlog REST API (e.g. 401, 403, 404) |
| `BACKLOG_RESPONSE_ERROR` | Backlog returned an unexpected response shape |
| `CONFIG_ERROR` | Invalid or missing environment variable |
| `INVALID_INPUT` | Tool input failed validation |

## Security Notes

- `.env` is **git-ignored** and must never be committed.
- Your API Key grants full access to your Backlog space as the associated user — treat it like a password.
- The API Key is only stored locally in `.env` and sent as a query parameter over HTTPS.
