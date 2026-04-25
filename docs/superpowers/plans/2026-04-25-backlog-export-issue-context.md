# Backlog Export Issue Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `backlog_export_issue_context` MCP tool that exports a Backlog issue, all comments, attachment metadata, downloaded files, and a raw Markdown context bundle for later LLM summarization.

**Architecture:** Keep the MCP deterministic: it fetches, paginates, downloads, places attachments best-effort, extracts only safe text-like files, and writes `raw.md` plus `manifest.json`. LLM summarization, image OCR, PDF parsing, and source-code reasoning stay outside this MCP and are handled by the agent using the exported bundle plus GitNexus/Serena as needed.

**Tech Stack:** TypeScript strict mode, ESM `.js` imports, Zod schemas, Axios-backed `BacklogHttpClient`, Node `fs/promises` and `path`, Vitest.

---

## File Structure

- Modify: `src/types/backlog-api.ts`
  - Allow `BacklogRawComment.changeLog` to be `null`, matching Backlog docs.
- Modify: `src/utils.ts`
  - Add filesystem-safe filename helpers and text-readable attachment detection.
- Create: `src/tools/export-issue-context.ts`
  - New tool schema, handler, pagination, markdown generation, manifest generation, attachment download/extraction, placement logic.
- Modify: `src/server.ts`
  - Import and register `backlog_export_issue_context`.
- Create: `src/tests/export-issue-context.test.ts`
  - Unit tests for success path, pagination, attachment placement, size skipping, validation, and error handling.
- Modify: `src/tests/tools.test.ts`
  - Schema tests for the new tool.
- Create: `docs/tools/backlog_export_issue_context.md`
  - Tool documentation matching the schema.
- Modify: `README.md`
  - Add feature list entry and MCP tool section.
- Create: `docs/prompts/backlog_issue_summary.md`
  - Agent-facing prompt template for summarizing an exported Backlog issue bundle.
- Optional create after tool verification: `~/.agents/skills/backlog-issue-summarizer/SKILL.md`
  - Local agent skill that codifies the repeatable Backlog issue summary workflow.

## Behavioral Decisions

- Default output root is `cfg.ATTACHMENT_WORKSPACE`; each export writes to `<outputRoot>/<issueKey>/`.
- Comments are fetched oldest-first with `count=100`, paging by `minId = highestCommentId + 1` until a page has fewer than 100 comments.
- Attachments are placed with confidence:
  - `exact`: issue description or comment content contains attachment filename or attachment id.
  - `inferred`: same uploader name and upload time is within `placementWindowMinutes` of a comment timestamp.
  - `unmatched`: no reliable placement; show under `Issue Attachments`.
- Download default is `true`; files larger than `maxAttachmentBytes` are skipped but listed in `manifest.json`.
- Extraction is intentionally conservative:
  - Extract `.txt`, `.md`, `.json`, `.csv`, `.tsv`, `.log`, `.xml`, `.yaml`, `.yml`.
  - Embed local markdown image links for common images.
  - Do not parse PDF/DOCX/XLSX/OCR in this first tool; record them as downloaded but not extracted.
- Phase 2 prompt template and skill come after the MCP tool passes typecheck/tests. The prompt/skill should orchestrate the agent workflow, not add LLM behavior into the MCP server.

---

### Task 1: Normalize Raw Comment Type

**Files:**
- Modify: `src/types/backlog-api.ts`
- Test: `src/tests/mappers.test.ts`

- [ ] **Step 1: Write the failing mapper test**

Add this test inside `describe("mapComment", ...)` or the existing comment mapper test block in `src/tests/mappers.test.ts`:

```ts
it("maps null comment changeLog to an empty array", () => {
  const raw = { ...rawComment, changeLog: null };

  const result = mapComment(raw);

  expect(result.changeLog).toEqual([]);
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
npx vitest run src/tests/mappers.test.ts
```

Expected: TypeScript or test failure because `BacklogRawComment.changeLog` is typed as an array only.

- [ ] **Step 3: Update raw API type**

Change `BacklogRawComment` in `src/types/backlog-api.ts`:

```ts
export interface BacklogRawComment {
  id: number;
  content: string | null;
  changeLog: Array<{
    field: string;
    newValue: string | null;
    originalValue: string | null;
  }> | null;
  createdUser: BacklogRawUser;
  created: string;
  updated: string;
  stars: unknown[];
  notifications: unknown[];
}
```

- [ ] **Step 4: Run the focused test again**

Run:

```bash
npx vitest run src/tests/mappers.test.ts
```

Expected: PASS.

---

### Task 2: Add Export Utility Helpers

**Files:**
- Modify: `src/utils.ts`
- Test: `src/tests/export-issue-context.test.ts`

- [ ] **Step 1: Add utility tests**

Create `src/tests/export-issue-context.test.ts` with placeholder imports that will be used later:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizePathSegment,
  isTextReadableFile,
  normalizeWhitespaceForMatch,
} from "../utils.js";

describe("export issue context utilities", () => {
  it("sanitizes path segments for local export paths", () => {
    expect(sanitizePathSegment("BLG/10474:spec?.png")).toBe("BLG_10474_spec_.png");
  });

  it("detects text-readable attachment names", () => {
    expect(isTextReadableFile("notes.md")).toBe(true);
    expect(isTextReadableFile("api.json")).toBe(true);
    expect(isTextReadableFile("screenshot.png")).toBe(false);
    expect(isTextReadableFile("spec.pdf")).toBe(false);
  });

  it("normalizes text for case-insensitive matching", () => {
    expect(normalizeWhitespaceForMatch(" Error   Screenshot.PNG ")).toBe("error screenshot.png");
  });
});
```

- [ ] **Step 2: Run focused test to verify it fails**

Run:

```bash
npx vitest run src/tests/export-issue-context.test.ts
```

Expected: FAIL because helpers are not exported.

- [ ] **Step 3: Implement helpers**

Add to `src/utils.ts`:

```ts
const TEXT_READABLE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
]);

export function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "unnamed";
}

export function isTextReadableFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_READABLE_EXTENSIONS.has(lower.slice(dot));
}

export function isMarkdownImageFile(filename: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
}

export function normalizeWhitespaceForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Run focused test again**

Run:

```bash
npx vitest run src/tests/export-issue-context.test.ts
```

Expected: PASS for utility tests.

---

### Task 3: Implement Export Handler Core

**Files:**
- Create: `src/tools/export-issue-context.ts`
- Test: `src/tests/export-issue-context.test.ts`

- [ ] **Step 1: Add handler tests with mocks**

Extend `src/tests/export-issue-context.test.ts`:

```ts
import { handleExportIssueContext } from "../tools/export-issue-context.js";
import type { Config } from "../config.js";

vi.mock("../backlog/http-client.js", () => {
  const MockBacklogHttpClient = vi.fn();
  MockBacklogHttpClient.prototype.getIssue = vi.fn();
  MockBacklogHttpClient.prototype.getComments = vi.fn();
  MockBacklogHttpClient.prototype.getIssueAttachments = vi.fn();
  MockBacklogHttpClient.prototype.downloadAttachment = vi.fn();
  return { BacklogHttpClient: MockBacklogHttpClient };
});

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("attachment text")),
}));

import { BacklogHttpClient } from "../backlog/http-client.js";
import * as fsMock from "node:fs/promises";

const MOCK_CFG: Config = {
  BACKLOG_BASE_URL: "https://test.backlog.com",
  BACKLOG_API_KEY: "test-key",
  MCP_PORT: 3100,
  LOG_LEVEL: "info",
  ATTACHMENT_WORKSPACE: "/tmp/backlog-exports",
};

const MOCK_ISSUE = {
  id: 100,
  issueKey: "BLG-10474",
  issueType: "Task",
  summary: "Implement payment callback fix",
  status: "In Progress",
  priority: "High",
  resolution: null,
  assignee: "Alice",
  categories: ["Payment"],
  versions: [],
  milestones: ["Sprint 12"],
  startDate: null,
  dueDate: "2026-04-30",
  estimatedHours: null,
  actualHours: null,
  parentIssueId: null,
  created: "2026-04-20T01:00:00Z",
  updated: "2026-04-24T02:00:00Z",
  url: "https://test.backlog.com/view/BLG-10474",
  description: "Please check screenshot.png and implement callback timeout handling.",
  reporter: "Bob",
};

const MOCK_COMMENTS = [
  {
    id: 1,
    author: "Alice",
    content: "The callback blocks on fraud service. See notes.md.",
    created: "2026-04-21T10:00:00Z",
    updated: "2026-04-21T10:00:00Z",
    changeLog: [],
  },
];

const MOCK_ATTACHMENTS = [
  {
    id: 10,
    name: "screenshot.png",
    size: 100,
    sizeFormatted: "100 B",
    uploadedBy: "Bob",
    created: "2026-04-20T01:05:00Z",
  },
  {
    id: 11,
    name: "notes.md",
    size: 50,
    sizeFormatted: "50 B",
    uploadedBy: "Alice",
    created: "2026-04-21T10:01:00Z",
  },
];

describe("handleExportIssueContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (BacklogHttpClient.prototype.getIssue as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ISSUE);
    (BacklogHttpClient.prototype.getComments as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_COMMENTS);
    (BacklogHttpClient.prototype.getIssueAttachments as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ATTACHMENTS);
    (BacklogHttpClient.prototype.downloadAttachment as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from("attachment text"),
      filename: "downloaded.md",
    });
  });

  it("exports issue context markdown and manifest", async () => {
    const result = await handleExportIssueContext({ issueIdOrKey: "BLG-10474" }, MOCK_CFG);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Export Complete");
    expect(result.content[0].text).toContain("raw.md");
    expect(result.content[0].text).toContain("manifest.json");
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("raw.md"),
      expect.stringContaining("# [BLG-10474] Implement payment callback fix"),
      "utf8"
    );
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("manifest.json"),
      expect.stringContaining("\"issueKey\": \"BLG-10474\""),
      "utf8"
    );
  });

  it("returns isError=true for invalid input", async () => {
    const result = await handleExportIssueContext({ issueIdOrKey: "" }, MOCK_CFG);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });
});
```

- [ ] **Step 2: Run focused test to verify it fails**

Run:

```bash
npx vitest run src/tests/export-issue-context.test.ts
```

Expected: FAIL because `src/tools/export-issue-context.ts` does not exist.

- [ ] **Step 3: Implement schema and handler skeleton**

Create `src/tools/export-issue-context.ts`:

```ts
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import {
  formatDate,
  isMarkdownImageFile,
  isTextReadableFile,
  normalizeWhitespaceForMatch,
  sanitizePathSegment,
} from "../utils.js";
import type { Config } from "../config.js";
import type { BacklogAttachment, BacklogComment, BacklogIssue } from "../types.js";

const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const DEFAULT_PLACEMENT_WINDOW_MINUTES = 10;

export const exportIssueContextSchema = z.object({
  issueIdOrKey: z.string().min(1, "issueIdOrKey is required").describe("Backlog issue key or numeric issue ID"),
  outputDir: z.string().optional().describe("Root directory for export output. Default: ATTACHMENT_WORKSPACE config value."),
  includeComments: z.boolean().optional().default(true).describe("Include all issue comments. Default: true."),
  includeAttachments: z.boolean().optional().default(true).describe("Include issue attachment metadata. Default: true."),
  downloadAttachments: z.boolean().optional().default(true).describe("Download attachment files to the export folder. Default: true."),
  extractReadableFiles: z.boolean().optional().default(true).describe("Extract text-like attachment contents into markdown. Default: true."),
  maxAttachmentBytes: z.number().int().positive().optional().default(DEFAULT_MAX_ATTACHMENT_BYTES).describe("Skip downloading attachments larger than this many bytes. Default: 10485760."),
  placementWindowMinutes: z.number().int().min(0).max(1440).optional().default(DEFAULT_PLACEMENT_WINDOW_MINUTES).describe("Time window for inferred comment attachment placement. Default: 10."),
});

export type ExportIssueContextInput = z.infer<typeof exportIssueContextSchema>;

interface ExportedAttachment {
  attachment: BacklogAttachment;
  localPath: string | null;
  relativePath: string | null;
  extractedText: string | null;
  placementTarget: "description" | "comment" | "issue";
  placementConfidence: "exact" | "inferred" | "unmatched";
  placementReason: string;
  commentId: number | null;
  skippedReason: string | null;
}

export async function handleExportIssueContext(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = exportIssueContextSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const input = parsed.data;
  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const issue = await client.getIssue(input.issueIdOrKey);
    const comments = input.includeComments ? await getAllComments(client, input.issueIdOrKey) : [];
    const attachments = input.includeAttachments ? await client.getIssueAttachments(input.issueIdOrKey) : [];
    const exportDir = path.resolve(input.outputDir ?? cfg.ATTACHMENT_WORKSPACE, sanitizePathSegment(issue.issueKey));
    const attachmentsDir = path.join(exportDir, "attachments");

    await fs.mkdir(exportDir, { recursive: true });
    if (input.includeAttachments && input.downloadAttachments) {
      await fs.mkdir(attachmentsDir, { recursive: true });
    }

    const exportedAttachments = await exportAttachments({
      client,
      issue,
      comments,
      attachments,
      attachmentsDir,
      maxAttachmentBytes: input.maxAttachmentBytes,
      downloadAttachments: input.downloadAttachments,
      extractReadableFiles: input.extractReadableFiles,
      placementWindowMinutes: input.placementWindowMinutes,
    });

    const rawMarkdown = formatRawMarkdown(issue, comments, exportedAttachments);
    const manifest = formatManifest(issue, comments, exportedAttachments);
    const rawPath = path.join(exportDir, "raw.md");
    const manifestPath = path.join(exportDir, "manifest.json");

    await fs.writeFile(rawPath, rawMarkdown, "utf8");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return {
      content: [{
        type: "text",
        text: [
          "# Export Complete",
          "",
          `**Issue:** ${issue.issueKey}`,
          `**Raw Markdown:** ${rawPath}`,
          `**Manifest:** ${manifestPath}`,
          `**Comments:** ${comments.length}`,
          `**Attachments:** ${attachments.length}`,
        ].join("\n"),
      }],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}
```

- [ ] **Step 4: Add pagination and helper implementations**

Append the following helpers to `src/tools/export-issue-context.ts`:

```ts
async function getAllComments(
  client: BacklogHttpClient,
  issueIdOrKey: string
): Promise<BacklogComment[]> {
  const comments: BacklogComment[] = [];
  let minId: number | undefined;

  while (true) {
    const page = await client.getComments(issueIdOrKey, {
      count: 100,
      order: "asc",
      minId,
    });
    comments.push(...page);
    if (page.length < 100) break;
    minId = Math.max(...page.map((comment) => comment.id)) + 1;
  }

  return comments;
}

async function exportAttachments(args: {
  client: BacklogHttpClient;
  issue: BacklogIssue;
  comments: BacklogComment[];
  attachments: BacklogAttachment[];
  attachmentsDir: string;
  maxAttachmentBytes: number;
  downloadAttachments: boolean;
  extractReadableFiles: boolean;
  placementWindowMinutes: number;
}): Promise<ExportedAttachment[]> {
  const exported: ExportedAttachment[] = [];

  for (const attachment of args.attachments) {
    const placement = placeAttachment(attachment, args.issue, args.comments, args.placementWindowMinutes);
    const base: ExportedAttachment = {
      attachment,
      localPath: null,
      relativePath: null,
      extractedText: null,
      ...placement,
      skippedReason: null,
    };

    if (!args.downloadAttachments) {
      exported.push({ ...base, skippedReason: "downloadAttachments=false" });
      continue;
    }

    if (attachment.size > args.maxAttachmentBytes) {
      exported.push({ ...base, skippedReason: `size ${attachment.size} exceeds maxAttachmentBytes ${args.maxAttachmentBytes}` });
      continue;
    }

    const downloaded = await args.client.downloadAttachment(args.issue.issueKey, attachment.id);
    const filename = `${attachment.id}_${sanitizePathSegment(downloaded.filename)}`;
    const localPath = path.join(args.attachmentsDir, filename);
    await fs.writeFile(localPath, downloaded.data);

    const relativePath = path.posix.join("attachments", filename);
    const extractedText = args.extractReadableFiles && isTextReadableFile(filename)
      ? downloaded.data.toString("utf8")
      : null;

    exported.push({
      ...base,
      localPath,
      relativePath,
      extractedText,
    });
  }

  return exported;
}

function placeAttachment(
  attachment: BacklogAttachment,
  issue: BacklogIssue,
  comments: BacklogComment[],
  placementWindowMinutes: number
): Pick<ExportedAttachment, "placementTarget" | "placementConfidence" | "placementReason" | "commentId"> {
  const normalizedName = normalizeWhitespaceForMatch(attachment.name);
  const normalizedId = String(attachment.id);
  const description = normalizeWhitespaceForMatch(issue.description ?? "");

  if (description.includes(normalizedName) || description.includes(normalizedId)) {
    return {
      placementTarget: "description",
      placementConfidence: "exact",
      placementReason: "Issue description contains attachment filename or id.",
      commentId: null,
    };
  }

  for (const comment of comments) {
    const content = normalizeWhitespaceForMatch(comment.content ?? "");
    if (content.includes(normalizedName) || content.includes(normalizedId)) {
      return {
        placementTarget: "comment",
        placementConfidence: "exact",
        placementReason: "Comment content contains attachment filename or id.",
        commentId: comment.id,
      };
    }
  }

  const inferred = inferAttachmentComment(attachment, comments, placementWindowMinutes);
  if (inferred) {
    return {
      placementTarget: "comment",
      placementConfidence: "inferred",
      placementReason: `Same uploader and timestamp within ${placementWindowMinutes} minute(s).`,
      commentId: inferred.id,
    };
  }

  return {
    placementTarget: "issue",
    placementConfidence: "unmatched",
    placementReason: "Backlog API does not expose commentId for this attachment and no reliable text/time match was found.",
    commentId: null,
  };
}

function inferAttachmentComment(
  attachment: BacklogAttachment,
  comments: BacklogComment[],
  placementWindowMinutes: number
): BacklogComment | null {
  if (!attachment.uploadedBy || placementWindowMinutes === 0) return null;
  const attachmentTime = new Date(attachment.created).getTime();
  const windowMs = placementWindowMinutes * 60 * 1000;

  const candidates = comments
    .filter((comment) => comment.author === attachment.uploadedBy)
    .map((comment) => ({ comment, diff: Math.abs(new Date(comment.created).getTime() - attachmentTime) }))
    .filter((candidate) => Number.isFinite(candidate.diff) && candidate.diff <= windowMs)
    .sort((a, b) => a.diff - b.diff);

  return candidates[0]?.comment ?? null;
}
```

- [ ] **Step 5: Add markdown and manifest formatting**

Append:

```ts
function formatRawMarkdown(
  issue: BacklogIssue,
  comments: BacklogComment[],
  attachments: ExportedAttachment[]
): string {
  const lines: string[] = [];

  lines.push(`# [${issue.issueKey}] ${issue.summary}`);
  lines.push("");
  lines.push(`**URL:** ${issue.url}`);
  lines.push(`**Status:** ${issue.status}`);
  lines.push(`**Priority:** ${issue.priority ?? "—"}`);
  lines.push(`**Assignee:** ${issue.assignee ?? "Unassigned"}`);
  lines.push(`**Reporter:** ${issue.reporter ?? "—"}`);
  lines.push(`**Created:** ${formatDate(issue.created)}`);
  lines.push(`**Updated:** ${formatDate(issue.updated)}`);
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(issue.description ?? "_No description provided._");
  appendPlacedAttachments(lines, attachments.filter((item) => item.placementTarget === "description"));

  const issueLevel = attachments.filter((item) => item.placementTarget === "issue");
  lines.push("");
  lines.push("## Issue Attachments");
  lines.push("");
  appendAttachmentTable(lines, issueLevel.length > 0 ? issueLevel : attachments);

  lines.push("");
  lines.push("## Comments Timeline");
  lines.push("");
  if (comments.length === 0) {
    lines.push("_No comments exported._");
  }

  for (const comment of comments) {
    lines.push(`### Comment #${comment.id} — ${comment.author ?? "Unknown"} — ${formatDate(comment.created)}`);
    lines.push("");
    lines.push(comment.content ?? "_No text content._");
    appendChangeLog(lines, comment);
    appendPlacedAttachments(lines, attachments.filter((item) => item.commentId === comment.id));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const extracted = attachments.filter((item) => item.extractedText);
  lines.push("## Extracted Attachment Content");
  lines.push("");
  if (extracted.length === 0) {
    lines.push("_No readable attachment content extracted._");
  }
  for (const item of extracted) {
    lines.push(`### ${item.attachment.name}`);
    lines.push("");
    lines.push("```text");
    lines.push(item.extractedText ?? "");
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function appendAttachmentTable(lines: string[], attachments: ExportedAttachment[]): void {
  if (attachments.length === 0) {
    lines.push("_No attachments._");
    return;
  }

  lines.push("| ID | Name | Size | Uploaded By | Created | Local Path | Placement |");
  lines.push("|---:|---|---:|---|---|---|---|");
  for (const item of attachments) {
    lines.push(`| ${item.attachment.id} | ${item.attachment.name} | ${item.attachment.sizeFormatted} | ${item.attachment.uploadedBy ?? "—"} | ${formatDate(item.attachment.created)} | ${item.relativePath ?? "—"} | ${item.placementConfidence} |`);
  }
}

function appendPlacedAttachments(lines: string[], attachments: ExportedAttachment[]): void {
  if (attachments.length === 0) return;
  lines.push("");
  lines.push("#### Attachments");
  lines.push("");
  for (const item of attachments) {
    if (item.relativePath && isMarkdownImageFile(item.attachment.name)) {
      lines.push(`![${item.attachment.name}](${item.relativePath})`);
    } else if (item.relativePath) {
      lines.push(`- [${item.attachment.name}](${item.relativePath})`);
    } else {
      lines.push(`- ${item.attachment.name} (${item.skippedReason ?? "not downloaded"})`);
    }
    lines.push(`  - Placement: ${item.placementConfidence}; ${item.placementReason}`);
  }
}

function appendChangeLog(lines: string[], comment: BacklogComment): void {
  if (comment.changeLog.length === 0) return;
  lines.push("");
  lines.push("**Field changes:**");
  lines.push("");
  lines.push("| Field | From | To |");
  lines.push("|---|---|---|");
  for (const change of comment.changeLog) {
    lines.push(`| ${change.field} | ${change.originalValue ?? "—"} | ${change.newValue ?? "—"} |`);
  }
}

function formatManifest(
  issue: BacklogIssue,
  comments: BacklogComment[],
  attachments: ExportedAttachment[]
): object {
  return {
    issueKey: issue.issueKey,
    issueUrl: issue.url,
    generatedAt: new Date().toISOString(),
    counts: {
      comments: comments.length,
      attachments: attachments.length,
      downloadedAttachments: attachments.filter((item) => item.localPath).length,
      extractedAttachments: attachments.filter((item) => item.extractedText).length,
    },
    attachments: attachments.map((item) => ({
      id: item.attachment.id,
      name: item.attachment.name,
      size: item.attachment.size,
      uploadedBy: item.attachment.uploadedBy,
      created: item.attachment.created,
      localPath: item.localPath,
      relativePath: item.relativePath,
      placementTarget: item.placementTarget,
      placementConfidence: item.placementConfidence,
      placementReason: item.placementReason,
      commentId: item.commentId,
      skippedReason: item.skippedReason,
      extracted: item.extractedText != null,
    })),
  };
}

function errorContent(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}
```

- [ ] **Step 6: Run focused test**

Run:

```bash
npx vitest run src/tests/export-issue-context.test.ts
```

Expected: PASS or minor assertion updates only. Do not weaken assertions that verify `raw.md` and `manifest.json` are written.

---

### Task 4: Test Pagination, Placement, and Skipping

**Files:**
- Modify: `src/tests/export-issue-context.test.ts`
- Modify if needed: `src/tools/export-issue-context.ts`

- [ ] **Step 1: Add pagination test**

Add:

```ts
it("fetches all comments with asc pagination", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    ...MOCK_COMMENTS[0],
    id: index + 1,
  }));
  const secondPage = [{ ...MOCK_COMMENTS[0], id: 101 }];
  (BacklogHttpClient.prototype.getComments as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce(secondPage);

  await handleExportIssueContext({ issueIdOrKey: "BLG-10474" }, MOCK_CFG);

  expect(BacklogHttpClient.prototype.getComments).toHaveBeenNthCalledWith(1, "BLG-10474", {
    count: 100,
    order: "asc",
    minId: undefined,
  });
  expect(BacklogHttpClient.prototype.getComments).toHaveBeenNthCalledWith(2, "BLG-10474", {
    count: 100,
    order: "asc",
    minId: 101,
  });
});
```

- [ ] **Step 2: Add placement confidence test**

Add:

```ts
it("records exact and inferred attachment placement in manifest", async () => {
  await handleExportIssueContext({ issueIdOrKey: "BLG-10474" }, MOCK_CFG);

  const manifestCall = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
    String(call[0]).endsWith("manifest.json")
  );
  expect(manifestCall).toBeDefined();
  expect(String(manifestCall?.[1])).toContain("\"placementConfidence\": \"exact\"");
  expect(String(manifestCall?.[1])).toContain("\"commentId\": 1");
});
```

- [ ] **Step 3: Add max attachment size skip test**

Add:

```ts
it("skips attachments larger than maxAttachmentBytes", async () => {
  await handleExportIssueContext(
    { issueIdOrKey: "BLG-10474", maxAttachmentBytes: 10 },
    MOCK_CFG
  );

  expect(BacklogHttpClient.prototype.downloadAttachment).not.toHaveBeenCalled();
  const manifestCall = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
    String(call[0]).endsWith("manifest.json")
  );
  expect(String(manifestCall?.[1])).toContain("exceeds maxAttachmentBytes");
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run src/tests/export-issue-context.test.ts
```

Expected: PASS.

---

### Task 5: Register MCP Tool and Schema Tests

**Files:**
- Modify: `src/server.ts`
- Modify: `src/tests/tools.test.ts`

- [ ] **Step 1: Add schema tests**

In `src/tests/tools.test.ts`, import:

```ts
import { exportIssueContextSchema } from "../tools/export-issue-context.js";
```

Add tests:

```ts
describe("Schema: backlog_export_issue_context", () => {
  it("accepts minimal input and applies defaults", () => {
    const result = exportIssueContextSchema.safeParse({ issueIdOrKey: "BLG-10474" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeComments).toBe(true);
      expect(result.data.includeAttachments).toBe(true);
      expect(result.data.downloadAttachments).toBe(true);
      expect(result.data.extractReadableFiles).toBe(true);
    }
  });

  it("rejects empty issueIdOrKey", () => {
    expect(exportIssueContextSchema.safeParse({ issueIdOrKey: "" }).success).toBe(false);
  });

  it("rejects invalid maxAttachmentBytes", () => {
    expect(exportIssueContextSchema.safeParse({
      issueIdOrKey: "BLG-10474",
      maxAttachmentBytes: 0,
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run schema tests to verify failure if not registered/imported correctly**

Run:

```bash
npx vitest run src/tests/tools.test.ts
```

Expected: PASS once schema export exists.

- [ ] **Step 3: Register the tool**

In `src/server.ts`, add import:

```ts
import { handleExportIssueContext } from "./tools/export-issue-context.js";
```

Register near the attachment tools:

```ts
server.tool(
  "backlog_export_issue_context",
  `Export a Backlog issue into a local raw context bundle for LLM summarization.

Fetches issue details, all comments, issue attachments, downloaded files, and writes:
- raw.md: markdown context ordered for reading
- manifest.json: machine-readable export metadata

Attachment placement is exact only when the issue/comment text references the attachment; otherwise placement is inferred by uploader/time or left unmatched.

INPUT:
- issueIdOrKey (required): issue key e.g. "BLG-123" or numeric ID
- outputDir (optional): export root directory
- includeComments/includeAttachments/downloadAttachments/extractReadableFiles (optional booleans)
- maxAttachmentBytes (optional): skip large files
- placementWindowMinutes (optional): inference window for comment-level placement`,
  {
    issueIdOrKey: z.string().min(1).describe("Backlog issue key or numeric issue ID. Example: BLG-10474"),
    outputDir: z.string().optional().describe("Root directory for export output. Default: ATTACHMENT_WORKSPACE config value."),
    includeComments: z.boolean().optional().describe("Include all issue comments. Default: true."),
    includeAttachments: z.boolean().optional().describe("Include issue attachment metadata. Default: true."),
    downloadAttachments: z.boolean().optional().describe("Download attachment files. Default: true."),
    extractReadableFiles: z.boolean().optional().describe("Extract text-like attachment contents. Default: true."),
    maxAttachmentBytes: z.number().int().positive().optional().describe("Skip downloading attachments larger than this many bytes. Default: 10485760."),
    placementWindowMinutes: z.number().int().min(0).max(1440).optional().describe("Time window for inferred comment attachment placement. Default: 10."),
  },
  async (input) => {
    return handleExportIssueContext(input, config);
  }
);
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

---

### Task 6: Add Tool Documentation and README Entry

**Files:**
- Create: `docs/tools/backlog_export_issue_context.md`
- Modify: `README.md`

- [ ] **Step 1: Create tool docs**

Create `docs/tools/backlog_export_issue_context.md`:

```md
# backlog_export_issue_context

## When to Use

Use this tool when an agent needs a complete local context bundle for one Backlog issue before summarizing or planning implementation work.

This tool is useful for prompts like:

> Read BLG-10474, include comments and attachments, then summarize what needs to be done.

The tool does not call an LLM. It exports deterministic raw material for a later LLM step.

## Input

| Parameter | Type | Required | Default | Description |
|---|---|---:|---|---|
| `issueIdOrKey` | `string` | Yes | — | Issue key such as `BLG-10474` or numeric issue ID |
| `outputDir` | `string` | No | `ATTACHMENT_WORKSPACE` | Root directory for the export |
| `includeComments` | `boolean` | No | `true` | Fetch and include all comments |
| `includeAttachments` | `boolean` | No | `true` | Fetch and include attachment metadata |
| `downloadAttachments` | `boolean` | No | `true` | Download attachment files |
| `extractReadableFiles` | `boolean` | No | `true` | Extract text-like files into markdown |
| `maxAttachmentBytes` | `number` | No | `10485760` | Skip downloading files larger than this |
| `placementWindowMinutes` | `number` | No | `10` | Window used for inferred comment-level attachment placement |

## Output

Returns a Markdown response with absolute paths to:

- `raw.md`
- `manifest.json`

The export directory has this shape:

```text
<outputDir>/<issueKey>/
  raw.md
  manifest.json
  attachments/
    <attachmentId>_<filename>
```

## Attachment Placement

Backlog's read APIs expose attachments at issue level, not with a guaranteed `commentId`.

Placement confidence:

| Confidence | Meaning |
|---|---|
| `exact` | Issue description or comment text references the attachment filename or id |
| `inferred` | Same uploader and timestamp are near a comment |
| `unmatched` | No reliable placement was found |

## Error Cases

| Error | Cause |
|---|---|
| `Invalid input: ...` | Missing issue key or invalid numeric limits |
| `[BACKLOG_HTTP_ERROR] ...` | Issue not found, access denied, bad API key, or network failure |
| `EACCES` / `ENOENT` | Filesystem path is invalid or not writable |

## Examples

### Export Default Context

Request:

```json
{
  "issueIdOrKey": "BLG-10474"
}
```

Expected output:

```md
# Export Complete

**Issue:** BLG-10474
**Raw Markdown:** /tmp/backlog-exports/BLG-10474/raw.md
**Manifest:** /tmp/backlog-exports/BLG-10474/manifest.json
**Comments:** 12
**Attachments:** 3
```

### Export Without Downloading Attachments

Request:

```json
{
  "issueIdOrKey": "BLG-10474",
  "downloadAttachments": false
}
```
```

- [ ] **Step 2: Update README feature list**

Add to README feature list:

```md
- 📦 `backlog_export_issue_context` — export issue, comments, and attachments into a local raw Markdown context bundle
```

Add a short MCP tool section after `backlog_download_attachment`:

```md
### `backlog_export_issue_context`

Export a Backlog issue into a local context bundle for LLM summarization.

**Input:** `issueIdOrKey` plus optional export controls for comments, attachments, downloads, readable extraction, max file size, and placement inference.

**Output:** Absolute paths to `raw.md` and `manifest.json`, plus counts for comments and attachments.
```

- [ ] **Step 3: Review documentation checklist**

Open `docs/tools-quality-checklist.md` and verify the new tool has:

- Zod schema and `.describe()` on every field.
- `isError: true` on error paths.
- No credentials in input/output.
- Tool docs with When to Use, Input, Output, Error Cases, Examples.
- README entry.

---

### Task 7: Full Verification

**Files:**
- All modified files

- [ ] **Step 1: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git diff -- src/types/backlog-api.ts src/utils.ts src/tools/export-issue-context.ts src/server.ts src/tests/export-issue-context.test.ts src/tests/tools.test.ts docs/tools/backlog_export_issue_context.md README.md
```

Expected:

- No unrelated changes.
- Imports use `.js`.
- No `any`.
- Business errors return MCP error content with `isError: true`.
- Attachment placement language is explicit about `exact`, `inferred`, and `unmatched`.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/types/backlog-api.ts src/utils.ts src/tools/export-issue-context.ts src/server.ts src/tests/export-issue-context.test.ts src/tests/tools.test.ts docs/tools/backlog_export_issue_context.md README.md
git commit -m "feat: export Backlog issue context bundle"
```

Expected: commit succeeds after tests pass.

---

### Task 8: Add Agent Summary Prompt Template

**Files:**
- Create: `docs/prompts/backlog_issue_summary.md`
- Modify: `README.md`

- [ ] **Step 1: Create prompt template directory**

Run:

```bash
mkdir -p docs/prompts
```

- [ ] **Step 2: Create the summary prompt template**

Create `docs/prompts/backlog_issue_summary.md`:

```md
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
```

- [ ] **Step 3: Add README reference**

Add a short section to `README.md` near the MCP tool list:

```md
## Agent Summary Prompt

After exporting an issue with `backlog_export_issue_context`, use `docs/prompts/backlog_issue_summary.md` as the agent prompt template for summarizing task intent, comments, attachments, inferred acceptance criteria, and optional code context.
```

- [ ] **Step 4: Verify docs are present**

Run:

```bash
test -f docs/prompts/backlog_issue_summary.md
```

Expected: command exits successfully.

---

### Task 9: Decide and Draft Optional Agent Skill

**Files:**
- Optional create outside this repo after Task 7 passes: `~/.agents/skills/backlog-issue-summarizer/SKILL.md`
- Optional create outside this repo: `~/.agents/skills/backlog-issue-summarizer/references/backlog_issue_summary.md`

- [ ] **Step 1: Decision gate**

Create the skill only if at least one of these is true:

- The workflow will be reused often with prompts like "đọc task Backlog rồi summary".
- Multiple agents/users need consistent output.
- The workflow should automatically call `backlog_export_issue_context` before summarizing.
- The workflow should consistently decide when to use GitNexus/Serena.

Do not create the skill if this is a one-off workflow; the prompt template is enough.

- [ ] **Step 2: Recommended decision**

For this project, create the skill after `backlog_export_issue_context` is implemented and verified. Reason: the workflow spans multiple tools, has important caveats around attachment placement, and benefits from a stable output format.

- [ ] **Step 3: Draft skill**

Create `~/.agents/skills/backlog-issue-summarizer/SKILL.md`:

```md
---
name: backlog-issue-summarizer
description: Use this whenever the user asks to read, analyze, summarize, clarify, or plan work from a Backlog issue/task, especially prompts like "đọc task Backlog", "summary task BLG-123", "phân tích comment/attachment", or "nội dung cần làm từ Backlog". This skill exports the issue context first, then summarizes issue description, comments, attachments, inferred acceptance criteria, and optional source-code context using GitNexus/Serena when useful.
---

# Backlog Issue Summarizer

Use this skill to turn one Backlog issue into an engineer-ready task summary.

## Workflow

1. Identify the Backlog issue key or numeric issue ID from the user prompt.
2. Call `backlog_export_issue_context` with:

```json
{
  "issueIdOrKey": "<ISSUE_KEY>",
  "includeComments": true,
  "includeAttachments": true,
  "downloadAttachments": true,
  "extractReadableFiles": true
}
```

3. Read the generated `raw.md` and `manifest.json`.
4. Inspect image attachments if the environment supports image reading. If not, list them as uninspected.
5. Use GitNexus/Serena only when:
   - the user asks for implementation guidance,
   - the issue mentions concrete modules, APIs, symbols, endpoints, or error messages,
   - the issue is ambiguous and code context can reduce uncertainty.
6. Produce the report using the required output structure.

## Attachment Placement

Respect placement confidence from `manifest.json`:

- `exact`: safe to associate with the description/comment.
- `inferred`: useful but mention it is inferred by uploader/time.
- `unmatched`: do not attach it to a specific comment; summarize it under general attachments.

## Required Output Structure

```md
# Summary — <ISSUE_KEY>

## Mục Tiêu

## Bối Cảnh

## Nội Dung Cần Làm

## Acceptance Criteria Suy Luận

## Comment Và Attachment Quan Trọng

## Source Code Có Thể Liên Quan

## Rủi Ro / Điểm Cần Xác Nhận
```

## Rules

- Do not summarize before reading `raw.md`.
- Do not invent requirements.
- Separate confirmed facts from inference.
- Mention unreadable, skipped, or uninspected attachments.
- Keep the answer actionable for implementation.
```

- [ ] **Step 4: Add skill eval prompts if creating the skill**

Create `~/.agents/skills/backlog-issue-summarizer/evals/evals.json`:

```json
{
  "skill_name": "backlog-issue-summarizer",
  "evals": [
    {
      "id": 1,
      "prompt": "Đọc task Backlog BLG-10474 rồi summary nội dung cần làm, bao gồm comment và attachment.",
      "expected_output": "The agent exports the issue context first, reads raw.md and manifest.json, then returns the required Vietnamese summary sections.",
      "files": []
    },
    {
      "id": 2,
      "prompt": "Phân tích BLG-20001 và cho tôi biết source code nào có thể liên quan.",
      "expected_output": "The agent exports context, reads the bundle, uses GitNexus or Serena only when issue content suggests code targets, and separates confirmed facts from source-code inference.",
      "files": []
    }
  ]
}
```

- [ ] **Step 5: Verify skill scope**

Before using the skill broadly, run at least two manual prompts and check:

- It always calls `backlog_export_issue_context` first.
- It mentions attachment placement confidence.
- It does not claim image/PDF contents were read unless they were actually inspected or extracted.
- It does not call GitNexus/Serena when issue content has no code signal.

---

## Self-Review

- Spec coverage: The plan covers issue fetch, full comment pagination, attachment metadata, attachment download, raw markdown, manifest, placement confidence, docs, README, and tests.
- Prompt/skill coverage: The plan adds a reusable prompt template and a gated skill decision after the MCP tool is verified.
- Placeholder scan: No implementation steps rely on TBD/TODO language; unsupported PDF/OCR is explicitly out of scope for this deterministic MCP tool.
- Type consistency: The plan uses existing domain types `BacklogIssue`, `BacklogComment`, and `BacklogAttachment`; new helper names are defined before use.
