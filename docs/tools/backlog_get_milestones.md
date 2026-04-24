# `backlog_get_milestones`

## When to Use

Call this tool to discover milestones (also called "versions" in the Backlog API) for a project and obtain their IDs. Use the returned IDs in the `milestoneId` parameter of `backlog_get_issue_list`.

By default only **active** (non-archived) milestones are returned. Set `archived: true` to also include archived milestones.

---

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectIdOrKey` | `string` | ✅ Yes | — | Project key (e.g. `MYPROJ`) or numeric project ID |
| `archived` | `boolean` | No | `false` | `true` = include archived milestones; `false` = active only |

---

## Output

A Markdown table listing milestones for the project.

```
# Active Milestones — MYPROJ

| ID  | Name   | Start Date | Due Date   | Archived |
|-----|--------|------------|------------|----------|
| 201 | v1.0   | 2024-01-01 | 2024-03-31 |          |
| 202 | v1.1   | 2024-04-01 | 2024-06-30 |          |
```

When `archived: true`:

```
# All Milestones — MYPROJ

| ID  | Name   | Start Date | Due Date   | Archived |
|-----|--------|------------|------------|----------|
| 200 | v0.9   | 2023-10-01 | 2023-12-31 | ✓        |
| 201 | v1.0   | 2024-01-01 | 2024-03-31 |          |
| 202 | v1.1   | 2024-04-01 | 2024-06-30 |          |
```

---

## Error Cases

| Error Code | Cause | Example Message |
|------------|-------|-----------------|
| `INVALID_INPUT` | Missing or empty `projectIdOrKey` | `Invalid input: projectIdOrKey is required` |
| `INVALID_INPUT` | Non-boolean value for `archived` | `Invalid input: ...` |
| `BACKLOG_HTTP_ERROR` | Project not found or no access | `Backlog HTTP 404 from .../versions` |
| `BACKLOG_HTTP_ERROR` | Invalid API key | `Backlog HTTP 401 from .../versions` |

---

## Examples

### Request — active milestones only (default)

```json
{
  "projectIdOrKey": "MYPROJ"
}
```

### Request — all milestones including archived

```json
{
  "projectIdOrKey": "MYPROJ",
  "archived": true
}
```

### Expected Output (active only)

```
# Active Milestones — MYPROJ

| ID  | Name | Start Date | Due Date   | Archived |
|-----|------|------------|------------|----------|
| 201 | v1.0 | 2024-01-01 | 2024-03-31 |          |
| 202 | v1.1 | 2024-04-01 | —          |          |
```

### Using the result

Pass the `ID` values to `backlog_get_issue_list`:
```json
{
  "projectId": [12345],
  "milestoneId": [201]
}
```
