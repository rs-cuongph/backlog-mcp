# `backlog_get_statuses`

## When to Use

Call this tool before filtering issues by status to discover which statuses exist in a project and obtain their IDs. Use the returned IDs in the `statusId` parameter of `backlog_get_issue_list`.

---

## Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectIdOrKey` | `string` | ✅ Yes | — | Project key (e.g. `MYPROJ`) or numeric project ID |

---

## Output

A Markdown table listing all statuses for the project.

```
# Statuses — MYPROJ

| ID | Name       | Color   | Display Order |
|----|------------|---------|---------------|
| 1  | Open       | #ed8077 | 1000          |
| 2  | In Progress| #7ea8d8 | 2000          |
| 3  | Resolved   | #8fde97 | 3000          |
| 4  | Closed     | #b0b0b0 | 4000          |
```

---

## Error Cases

| Error Code | Cause | Example Message |
|------------|-------|-----------------|
| `INVALID_INPUT` | Missing or empty `projectIdOrKey` | `Invalid input: projectIdOrKey is required` |
| `BACKLOG_HTTP_ERROR` | Project not found or no access | `Backlog HTTP 404 from .../statuses` |
| `BACKLOG_HTTP_ERROR` | Invalid API key | `Backlog HTTP 401 from .../statuses` |

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
# Statuses — MYPROJ

| ID | Name        | Color   | Display Order |
|----|-------------|---------|---------------|
| 1  | Open        | #ed8077 | 1000          |
| 2  | In Progress | #7ea8d8 | 2000          |
| 3  | Resolved    | #8fde97 | 3000          |
| 4  | Closed      | #b0b0b0 | 4000          |
```

### Using the result

Pass the `ID` values to `backlog_get_issue_list`:
```json
{
  "projectId": [12345],
  "statusId": [1, 2]
}
```
