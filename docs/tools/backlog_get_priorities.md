# `backlog_get_priorities`

## When to Use

Call this tool to discover the issue priority IDs available in your Backlog space. Priorities are **global** (not project-specific). Use the returned IDs in the `priorityId` parameter of `backlog_get_issue_list`.

---

## Input

This tool takes **no input parameters**.

---

## Output

A Markdown table listing all available priorities.

```
# Priorities (Global)

> Priorities are space-wide and apply to all projects.

| ID | Name   |
|----|--------|
| 2  | High   |
| 3  | Normal |
| 4  | Low    |
```

---

## Error Cases

| Error Code | Cause | Example Message |
|------------|-------|-----------------|
| `BACKLOG_HTTP_ERROR` | Invalid API key | `Backlog HTTP 401 from .../priorities` |
| `BACKLOG_HTTP_ERROR` | Server error | `Backlog HTTP 500 from .../priorities` |

---

## Examples

### Request

```json
{}
```

### Expected Output

```
# Priorities (Global)

> Priorities are space-wide and apply to all projects.

| ID | Name   |
|----|--------|
| 2  | High   |
| 3  | Normal |
| 4  | Low    |
```

### Using the result

Pass the `ID` values to `backlog_get_issue_list`:
```json
{
  "projectId": [12345],
  "priorityId": [2]
}
```
