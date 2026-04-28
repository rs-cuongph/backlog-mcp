# backlog_export_issue_context

## When to Use

Use this tool when an agent needs a complete local context bundle for one Backlog issue before summarizing or planning implementation work.

This tool is useful for prompts like:

> Read BLG-10474, include comments and attachments, then summarize what needs to be done.

The tool does **not** call an LLM. It exports deterministic raw material for a later LLM step.

---

## Input

| Parameter | Type | Required | Default | Description |
|---|---|---:|---|---|
| `issueIdOrKey` | `string` | Yes | — | Issue key such as `BLG-10474` or numeric issue ID |
| `outputDir` | `string` | No | `ATTACHMENT_WORKSPACE` | Root directory for the export |
| `includeComments` | `boolean` | No | `true` | Fetch and include all comments |
| `includeAttachments` | `boolean` | No | `true` | Fetch and include attachment metadata |
| `downloadAttachments` | `boolean` | No | `true` | Download attachment files |
| `extractReadableFiles` | `boolean` | No | `false` | Extract text-like files into markdown |
| `maxAttachmentBytes` | `number` | No | `10485760` | Skip downloading files larger than this (bytes) |
| `placementWindowMinutes` | `number` | No | `10` | Window (minutes) for inferred comment-level attachment placement |
| `skipChangelogOnlyComments` | `boolean` | No | `false` | Skip comments that have no text content (only field changes). Useful for translation/export workflows. |

> **Output directory:** configured via `ATTACHMENT_WORKSPACE` in `.env`. Use `outputDir` to override for a single call.

---

## Output

Returns a Markdown response with absolute paths to the exported files:

```
# Export Complete

**Issue:** BLG-10474
**Raw Markdown:** /path/to/workspace/BLG-10474/raw.md
**Manifest:** /path/to/workspace/BLG-10474/manifest.json
**Comments:** 12
**Attachments:** 3
```

The export directory has this shape:

```text
<outputDir>/<issueKey>/
  raw.md
  manifest.json
  attachments/
    <attachmentId>_<filename>
```

### `raw.md` structure

1. Issue metadata (type, status, resolution, priority, parent, assignee, reporter, categories, milestones, versions, dates, estimated/actual hours)
2. Description (with placed attachment links/images inline)
3. Issue Attachments table (unmatched or all)
4. Comments Timeline (each comment with field changes and placed attachments)
5. Extracted Attachment Content (text-readable files embedded in code blocks)

### `manifest.json` structure

```json
{
  "issueKey": "BLG-10474",
  "issueUrl": "...",
  "generatedAt": "...",
  "counts": { "comments": 12, "attachments": 3, "downloadedAttachments": 2, "extractedAttachments": 1 },
  "attachments": [
    {
      "id": 42,
      "name": "screenshot.png",
      "placementTarget": "description",
      "placementConfidence": "exact",
      "placementReason": "Issue description contains attachment filename or id.",
      "commentId": null,
      ...
    }
  ]
}
```

---

## Attachment Placement

Backlog's read APIs expose attachments at issue level, not with a guaranteed `commentId`.

| Confidence | Meaning |
|---|---|
| `exact` | Issue description or comment text references the attachment filename or id |
| `inferred` | Same uploader and timestamp are near a comment (within `placementWindowMinutes`) |
| `unmatched` | No reliable placement was found — shown under "Issue Attachments" |

### Text Extraction

Files with these extensions are extracted as UTF-8 text into `raw.md`:
`.txt` `.md` `.markdown` `.json` `.csv` `.tsv` `.log` `.xml` `.yaml` `.yml`

Common images (`.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, `.svg`) are embedded as Markdown image links.

PDF / DOCX / XLSX / binary files are listed in `manifest.json` as downloaded but **not extracted**.

---

## Error Cases

| Error | Cause |
|---|---|
| `Invalid input: ...` | Missing issue key or invalid numeric limits |
| `[BACKLOG_HTTP_ERROR] ...` | Issue not found, access denied, bad API key, or network failure |
| `EACCES` / `ENOENT` | Filesystem path is invalid or not writable |

---

## Examples

### Export Default Context

Request:

```json
{
  "issueIdOrKey": "BLG-10474"
}
```

Output:

```
# Export Complete

**Issue:** BLG-10474
**Raw Markdown:** /Users/me/backlog-exports/BLG-10474/raw.md
**Manifest:** /Users/me/backlog-exports/BLG-10474/manifest.json
**Comments:** 12
**Attachments:** 3
```

---

### Export Without Downloading Attachments

Request:

```json
{
  "issueIdOrKey": "BLG-10474",
  "downloadAttachments": false
}
```

---

### Export to Custom Directory

Request:

```json
{
  "issueIdOrKey": "BLG-10474",
  "outputDir": "/tmp/review-session"
}
```

---

## Typical Workflow

```
1. backlog_export_issue_context { issueIdOrKey: "BLG-10474" }
   → raw.md + manifest.json written to ATTACHMENT_WORKSPACE/BLG-10474/

2. Read /path/to/BLG-10474/raw.md
   → Feed to LLM for summarization or implementation planning

3. Inspect manifest.json
   → Check placementConfidence to understand which attachments were matched
```
