# Backlog Issue Summary Prompt Template

Use this prompt after `backlog_export_issue_context` has produced `raw.md` and `manifest.json`.

## Prompt

You are analyzing a Backlog issue context export.

Inputs:

- Raw Markdown: `<RAW_MD_PATH>`
- Manifest JSON: `<MANIFEST_JSON_PATH>`
- User goal: `<USER_GOAL>`

Read `raw.md` and `manifest.json` first. Treat `raw.md` as the source of truth for issue description, comments, changelog, attachment list, and extracted attachment text. Treat `manifest.json` as the source of truth for attachment placement confidence.

If image attachments are present and the current environment supports image reading or OCR, inspect the image files referenced in the manifest. If image reading is not available, explicitly list those images as uninspected.

Use source-code tools only when the issue content suggests implementation impact or the user asks for code-aware analysis:

- Use GitNexus for execution-flow, symbol, or impact analysis.
- Use Serena for precise symbol/file lookup.
- Do not guess file paths when code search tools return no evidence.

Return the summary in this format:

```md
# Summary — <ISSUE_KEY>

## Mục Tiêu
One short paragraph describing the real goal of the task.

## Bối Cảnh
- Key facts from the issue description.
- Key facts from comments.
- Key facts from attachments.

## Nội Dung Cần Làm
1. Concrete implementation requirement.
2. Concrete implementation requirement.
3. Concrete implementation requirement.

## Acceptance Criteria Suy Luận
- Verifiable expected behavior.
- Verifiable expected behavior.

## Comment Và Attachment Quan Trọng
- Comment #<id>: why it matters.
- Attachment `<name>`: what useful information it contains.
- For inferred/unmatched attachment placement, mention the confidence.

## Source Code Có Thể Liên Quan
- `path/or/symbol`: reason this is likely relevant.
- If no code was inspected, write: "Chưa đọc source code; chưa có đủ tín hiệu từ task hoặc user chưa yêu cầu."

## Rủi Ro / Điểm Cần Xác Nhận
- Open question.
- Ambiguous requirement.
```

Rules:

- Do not invent requirements that are not supported by the issue, comments, attachments, or inspected source code.
- Distinguish confirmed facts from inference.
- Mention skipped, unreadable, or uninspected attachments.
- Keep the final answer actionable for an engineer who will implement the task.
