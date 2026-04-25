# Backlog To Jira Migration Prompt Template

Use this prompt when a user asks an agent to fetch a Backlog issue, translate it, analyze it, and upload the result to Jira.

## Prompt

You are migrating one Backlog issue into Jira using available Backlog MCP and Jira MCP tools.

Inputs:

- Backlog issue: `<BACKLOG_ISSUE_KEY>`
- Jira project: `<JIRA_PROJECT_KEY>`
- Jira issue type: `<JIRA_ISSUE_TYPE>`
- Optional Jira fields: `<OPTIONAL_FIELDS>`
- User goal: `<USER_GOAL>`

## Required Workflow

1. Fetch Backlog context with `backlog_export_issue_context`.
2. Read the generated `raw.md` and `manifest.json`.
3. Generate two separate Vietnamese documents:
   - Translation only: no analysis or implementation suggestions.
   - Analysis only: implementation analysis, impact, tests, risks.
4. Create local upload files with clear names:
   - `backlog-<ISSUE_KEY>-raw.md`
   - `backlog-<ISSUE_KEY>-translation-vi.md`
   - `backlog-<ISSUE_KEY>-analysis-vi.md`
   - `backlog-<ISSUE_KEY>-manifest.json`
5. Create the Jira issue.
6. Upload files and Backlog attachments to Jira.
7. Build an attachment mapping from local Backlog attachment names/paths/ids to Jira attachment filenames or URLs.
8. Rewrite inline attachment references in raw, translation, and analysis before posting comments.
9. Add Jira comments in this order:
   - `[RAW]`
   - `[VI]`
   - `[ANALYSIS]`
10. Return the Jira key/link, uploaded files, and warnings.

Do not paste local filesystem paths into Jira comments. Replace local paths with Jira attachment references after upload. If the Jira MCP returns attachment URLs, use those URLs. If it only confirms upload without URLs, reference the uploaded filename exactly.

## Jira Tool Selection

Use available Jira MCP tools for:

- Create issue.
- Add comment.
- Add attachment.

If exact tool names are unknown, inspect/list available Jira MCP tools first. Do not proceed if create issue, add comment, or add attachment capability is missing.

## Jira Title Format

Use this title format unless the user explicitly requests another one:

```txt
[Backlog <ISSUE_KEY>] <Vietnamese short title>
```

If the user specifies a team/prefix, use:

```txt
[<PREFIX>] [Backlog <ISSUE_KEY>] <Vietnamese short title>
```

## Jira Description Format

Keep the Jira description short and index-like. Raw content, translation, and analysis belong in comments and attachments.

```md
# Backlog Migration

*Source:* <ISSUE_KEY>
*Backlog URL:* <BACKLOG_URL>
*Raw context:* see comment `[RAW]` and attachment `backlog-<ISSUE_KEY>-raw.md`
*Vietnamese translation:* see comment `[VI]` and attachment `backlog-<ISSUE_KEY>-translation-vi.md`
*Analysis:* see comment `[ANALYSIS]` and attachment `backlog-<ISSUE_KEY>-analysis-vi.md`

## Nội Dung Chính
<1-3 câu tóm tắt ngắn bằng tiếng Việt>

## Migration Notes
- Imported from Backlog by LLM workflow.
- Attachment placement follows manifest confidence: exact / inferred / unmatched.
```

## Comment 1: Raw

```md
# [RAW] Backlog <ISSUE_KEY>

Raw Backlog context is attached as:

`backlog-<ISSUE_KEY>-raw.md`

## Raw Content

<raw.md content, rewritten so inline attachment references point to Jira attachments>

## Attachments
- `backlog-<ISSUE_KEY>-raw.md`
- `backlog-<ISSUE_KEY>-manifest.json`
- Original Backlog attachments uploaded to Jira with `backlog-<ISSUE_KEY>-attachment-<ATTACHMENT_ID>-<FILENAME>` naming.
```

## Comment 2: Vietnamese Translation

Translate content into Vietnamese. Do not add analysis in this comment.

```md
# [VI] Bản Dịch Tiếng Việt — <ISSUE_KEY>

## Mô Tả Gốc Đã Dịch

## Comment Timeline Đã Dịch

## Changelog Đã Dịch

## Attachment Content Đã Dịch
- Attachment `<name>`:
  - Nội dung đã dịch.
  - Placement confidence: exact / inferred / unmatched.
```

## Comment 3: Analysis

Write the analysis in Vietnamese.

```md
# [ANALYSIS] Phân Tích Và Gợi Ý Triển Khai — <ISSUE_KEY>

## Mục Tiêu

## Nội Dung Cần Làm

## Phạm Vi
### Trong Scope
### Cần Xác Nhận / Có Thể Ngoài Scope

## Gợi Ý Triển Khai
### Phân Tích Sâu
- Đoạn/module/file/API/symbol có khả năng cần sửa:
- Lý do:
- Hướng sửa logic:

### Logic Có Thể Bị Ảnh Hưởng
- Luồng xử lý/node logic:
- File/path/module:
- Upstream/downstream impact:

### Testcase Gợi Ý
- Luồng chính:
- Edge cases:
- Các luồng/module bị ảnh hưởng:

## Mức Độ Chắc Chắn
- Đã xác nhận:
- Suy luận:
- Chưa đủ dữ liệu:

## Rủi Ro / Câu Hỏi Cần Xác Nhận
```

## Attachment Naming

Use stable Jira upload filenames:

```txt
backlog-<ISSUE_KEY>-raw.md
backlog-<ISSUE_KEY>-translation-vi.md
backlog-<ISSUE_KEY>-analysis-vi.md
backlog-<ISSUE_KEY>-manifest.json
backlog-<ISSUE_KEY>-attachment-<ATTACHMENT_ID>-<SANITIZED_ORIGINAL_FILENAME>
```

## Final Response To User

Return:

- Jira issue key/link.
- Source Backlog issue key/link.
- Uploaded files.
- Comment sections created.
- Warnings, including uninspected images, skipped attachments, unmatched placement, or missing Jira attachment URLs.
