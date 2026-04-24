# AGENTS.md — Agent Instructions for backlog-mcp

> This file is the canonical instruction set for any AI agent working on this project.
> Read this file in full before starting any task.

---

## What Is This Project?

`backlog-mcp` is a TypeScript MCP (Model Context Protocol) server that provides AI agents with read access to a Backlog (Nulab) space. Authentication uses a static **API Key** stored in `.env` — no browser or Playwright session required.

## Architecture Rules

1. **Server uses factory pattern.** Each incoming MCP request gets a new `McpServer` + `StreamableHTTPServerTransport` pair. Never reuse a server instance across requests.

2. **Auth is a config concern, not a tool concern.** The `BacklogHttpClient` receives `apiKey` from `config` at construction time. Tool handlers never touch auth directly.

3. **HTTP-first for Backlog access.** All Backlog REST API calls go through `src/backlog/http-client.ts` using Axios. The API Key is injected automatically via `axios.create({ params: { apiKey } })`.

4. **Zod validates everything.** Environment variables (`src/config.ts`) and tool inputs (each tool's schema) are all validated with Zod before use.

5. **Two-layer type system.** Raw Backlog API response types live in `src/types/backlog-api.ts`. Normalized domain types used by handlers live in `src/types.ts`. Mappers in `src/backlog/mappers.ts` bridge the two. Never use raw types outside of `http-client.ts` and `mappers.ts`.

## Coding Standards

- **TypeScript strict mode.** No `any`. No implicit types.
- **ESM with `.js` extensions.** All imports must end in `.js` (NodeNext module resolution).
- **Errors use `McpError`.** Every business error must use the `McpError` class with a typed code. Use factory helpers from `src/errors.ts`.
- **Tool errors set `isError: true`.** MCP clients rely on this flag. Never return an error as normal content.
- **401/403 from Backlog = invalid API key.** `assertOk()` in the HTTP client handles this — tool handlers just catch `McpError`.
- **Utility functions in `src/utils.ts`.** Shared helpers (e.g. date formatting, string manipulation) must live in `src/utils.ts`, not inline in tool or handler files.
- **Prefer libraries over hand-rolled code.** For common tasks (date formatting, etc.), use well-known npm packages instead of writing custom implementations.
- **Raw API response types in `src/types/backlog-api.ts`.** Types that mirror the exact shape of Backlog REST API responses must live there, separate from the normalized application interfaces in `src/types.ts`.

## File Conventions

| Area | Location | Notes |
|------|----------|-------|
| MCP server entry | `src/server.ts` | Factory pattern, tool registration |
| Tool handlers | `src/tools/*.ts` | One file per tool |
| Tool documentation | `docs/tools/*.md` | One doc per tool — required for every tool |
| Backlog HTTP layer | `src/backlog/` | endpoints, mappers, http-client |
| Tests | `src/tests/` | Vitest, `vi.mock()` hoisted |
| Config | `src/config.ts` | Zod schema, env vars |
| Types (domain) | `src/types.ts` | Normalized domain interfaces |
| Types (raw API) | `src/types/backlog-api.ts` | Raw Backlog API response shapes |
| Errors | `src/errors.ts` | McpError class, factory helpers |
| Utilities | `src/utils.ts` | Shared helpers (dates, strings, etc.) |

## Testing Requirements

- Run `npx tsc --noEmit` after every code change.
- Run `npx vitest run` before every commit.
- When adding a new tool, add corresponding tests in `src/tests/`.
- Mocks: use `vi.mock()` at file top level (Vitest hoists them). Set per-test behavior with `mockImplementation()`.

## Documentation Requirements

- **Every tool must have a doc file** at `docs/tools/<tool_name>.md`.
- Doc must include: **When to Use**, **Input** (table), **Output** (described), **Error Cases** (table), **Examples** (at least 1 request + expected output).
- Keep the doc in sync with the tool's Zod schema — any param added/removed must be reflected in the doc.

## Available MCP Tools

### `backlog_get_issue_list`
- **Purpose:** Fetch a list of Backlog issues with optional filters.
- **Key inputs:** `projectId[]`, `statusId[]`, `priorityId[]`, `assigneeId[]`, `keyword`, `count`, `offset`, `sort`, `order`
- **Output:** Markdown table + detailed summaries per issue.
- **Docs:** `docs/tools/backlog_get_issue_list.md`

### `backlog_get_issue`
- **Purpose:** Fetch full details for one issue by key or numeric ID.
- **Input:** `{ issueIdOrKey: string }` — e.g. `BLG-123` or `12345`.
- **Output:** Markdown with summary, description, status, priority, type, assignee, reporter, dates, hours, URL.
- **Docs:** `docs/tools/backlog_get_issue.md`

### `backlog_get_comments`
- **Purpose:** Fetch comments for an issue, including changelog (field change history).
- **Input:** `{ issueIdOrKey: string, count?, order?, minId?, maxId? }`
- **Output:** Markdown list of comments with author, date, text, and field changes.
- **Docs:** `docs/tools/backlog_get_comments.md`

### `backlog_get_statuses`
- **Purpose:** Fetch all statuses defined for a project. Use IDs to filter `backlog_get_issue_list`.
- **Input:** `{ projectIdOrKey: string }`
- **Output:** Markdown table with ID, name, color per status.
- **Docs:** `docs/tools/backlog_get_statuses.md`

### `backlog_get_priorities`
- **Purpose:** Fetch global issue priorities (space-wide, not project-specific). Use IDs to filter `backlog_get_issue_list`.
- **Input:** _(none)_
- **Output:** Markdown table with ID and name per priority.
- **Docs:** `docs/tools/backlog_get_priorities.md`

### `backlog_get_categories`
- **Purpose:** Fetch all categories defined for a project. Use IDs to filter `backlog_get_issue_list`.
- **Input:** `{ projectIdOrKey: string }`
- **Output:** Markdown table with ID and name per category.
- **Docs:** `docs/tools/backlog_get_categories.md`

### `backlog_get_milestones`
- **Purpose:** Fetch milestones (versions) for a project. Use IDs to filter `backlog_get_issue_list`.
- **Input:** `{ projectIdOrKey: string, archived?: boolean }` — `archived` defaults to `false` (active only).
- **Output:** Markdown table with ID, name, start date, due date, archived flag.
- **Docs:** `docs/tools/backlog_get_milestones.md`

## Adding a New Tool

1. Create `src/tools/<name>.ts` — export a Zod schema + async handler.
2. Handler signature: `async function handle<Name>(rawInput: unknown, cfg: Config): Promise<{ content: [...], isError?: boolean }>`.
3. Handler returns `{ content: [{ type: "text", text }] }` on success, `{ content: [...], isError: true }` on failure.
4. Register in `createMcpServer()` in `src/server.ts`.
5. Write docs at `docs/tools/<tool_name>.md` — include When to Use, Input, Output, Error Cases, Examples.
6. Add tests in `src/tests/<name>.test.ts`.
7. Update `README.md` with the new tool.
8. Verify: `npx tsc --noEmit && npx vitest run`.

## Common Pitfalls

| Mistake | Correct Approach |
|---------|----------------|
| Reusing a single McpServer for concurrent requests | Create a new one per request via factory |
| Returning errors as normal `content` | Always include `isError: true` |
| Using `import "./foo"` without `.js` | Must use `import "./foo.js"` (NodeNext) |
| Throwing `new Error(...)` for business logic | Use `McpError` with typed code |
| Using raw Backlog types in tool handlers | Map through `mappers.ts` first; handlers only see domain types |
| Mocking inside `vi.mock()` factory with outer variables | Vitest hoists mocks — keep factories self-contained |
| Sending array params as `projectId: [1]` | Backlog requires `projectId[]: [1]` — use the `[]` suffix in query params |
