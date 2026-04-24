# `backlog_get_categories`

## When to Use

Call this tool to discover which categories are defined in a project and obtain their IDs. Use the returned IDs in the `categoryId` parameter of `backlog_get_issue_list`.

---

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectIdOrKey` | `string` | ✅ Yes | — | Project key (e.g. `MYPROJ`) or numeric project ID |

---

## Output

A Markdown table listing all categories for the project.

```
# Categories — MYPROJ

| ID  | Name     |
|-----|----------|
| 101 | Frontend |
| 102 | Backend  |
| 103 | Infra    |
```

---

## Error Cases

| Error Code | Cause | Example Message |
|------------|-------|-----------------|
| `INVALID_INPUT` | Missing or empty `projectIdOrKey` | `Invalid input: projectIdOrKey is required` |
| `BACKLOG_HTTP_ERROR` | Project not found or no access | `Backlog HTTP 404 from .../categories` |
| `BACKLOG_HTTP_ERROR` | Invalid API key | `Backlog HTTP 401 from .../categories` |

---

## Examples

### Request

```json
{
  "projectIdOrKey": "MYPROJ"
}
```

### Expected Output

```
# Categories — MYPROJ

| ID  | Name     |
|-----|----------|
| 101 | Frontend |
| 102 | Backend  |
| 103 | Infra    |
```

### Using the result

Pass the `ID` values to `backlog_get_issue_list`:
```json
{
  "projectId": [12345],
  "categoryId": [101, 102]
}
```
