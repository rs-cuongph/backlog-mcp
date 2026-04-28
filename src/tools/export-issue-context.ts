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

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const exportIssueContextSchema = z.object({
  issueIdOrKey: z
    .string()
    .min(1, "issueIdOrKey is required")
    .describe("Backlog issue key or numeric issue ID. Example: BLG-10474"),
  outputDir: z
    .string()
    .optional()
    .describe("Root directory for export output. Default: ATTACHMENT_WORKSPACE config value."),
  includeComments: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include all issue comments. Default: true."),
  includeAttachments: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include issue attachment metadata. Default: true."),
  downloadAttachments: z
    .boolean()
    .optional()
    .default(true)
    .describe("Download attachment files to the export folder. Default: true."),
  extractReadableFiles: z
    .boolean()
    .optional()
    .default(false)
    .describe("Extract text-like attachment contents into markdown. Default: false."),
  maxAttachmentBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .default(DEFAULT_MAX_ATTACHMENT_BYTES)
    .describe("Skip downloading attachments larger than this many bytes. Default: 10485760."),
  placementWindowMinutes: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .optional()
    .default(DEFAULT_PLACEMENT_WINDOW_MINUTES)
    .describe("Time window (minutes) for inferred comment attachment placement. Default: 10."),
  skipChangelogOnlyComments: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Skip comments that have no text content (only field changes). Useful for translation/export workflows. Default: false."
    ),
});

export type ExportIssueContextInput = z.infer<typeof exportIssueContextSchema>;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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
    const attachments = input.includeAttachments
      ? await client.getIssueAttachments(input.issueIdOrKey)
      : [];

    const exportRoot = input.outputDir ?? cfg.ATTACHMENT_WORKSPACE;
    const exportDir = path.resolve(exportRoot, sanitizePathSegment(issue.issueKey));
    const attachmentsDir = path.join(exportDir, "attachments");

    await fs.mkdir(exportDir, { recursive: true });
    if (input.includeAttachments && input.downloadAttachments && attachments.length > 0) {
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

    const rawMarkdown = formatRawMarkdown(
      issue,
      comments,
      exportedAttachments,
      input.skipChangelogOnlyComments
    );
    const manifest = formatManifest(issue, comments, exportedAttachments);
    const rawPath = path.join(exportDir, "raw.md");
    const manifestPath = path.join(exportDir, "manifest.json");

    await fs.writeFile(rawPath, rawMarkdown, "utf8");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return {
      content: [
        {
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
        },
      ],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Comment pagination
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Attachment download + placement
// ---------------------------------------------------------------------------

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
    const placement = placeAttachment(
      attachment,
      args.issue,
      args.comments,
      args.placementWindowMinutes
    );
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
      exported.push({
        ...base,
        skippedReason: `size ${attachment.size} exceeds maxAttachmentBytes ${args.maxAttachmentBytes}`,
      });
      continue;
    }

    const downloaded = await args.client.downloadAttachment(args.issue.issueKey, attachment.id);
    const filename = `${attachment.id}_${sanitizePathSegment(downloaded.filename)}`;
    const localPath = path.join(args.attachmentsDir, filename);
    await fs.writeFile(localPath, downloaded.data);

    const relativePath = path.posix.join("attachments", filename);
    const extractedText =
      args.extractReadableFiles && isTextReadableFile(filename)
        ? downloaded.data.toString("utf8")
        : null;

    exported.push({ ...base, localPath, relativePath, extractedText });
  }

  return exported;
}

function placeAttachment(
  attachment: BacklogAttachment,
  issue: BacklogIssue,
  comments: BacklogComment[],
  placementWindowMinutes: number
): Pick<
  ExportedAttachment,
  "placementTarget" | "placementConfidence" | "placementReason" | "commentId"
> {
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
    placementReason:
      "Backlog API does not expose commentId for this attachment and no reliable text/time match was found.",
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
    .map((comment) => ({
      comment,
      diff: Math.abs(new Date(comment.created).getTime() - attachmentTime),
    }))
    .filter((candidate) => Number.isFinite(candidate.diff) && candidate.diff <= windowMs)
    .sort((a, b) => a.diff - b.diff);

  return candidates[0]?.comment ?? null;
}

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

function formatRawMarkdown(
  issue: BacklogIssue,
  comments: BacklogComment[],
  attachments: ExportedAttachment[],
  skipChangelogOnly = false
): string {
  const lines: string[] = [];

  lines.push(`# [${issue.issueKey}] ${issue.summary}`);
  lines.push("");
  lines.push(`**URL:** ${issue.url}`);
  lines.push(`**Type:** ${issue.issueType}`);
  lines.push(`**Status:** ${issue.status}`);
  lines.push(`**Resolution:** ${issue.resolution ?? "—"}`);
  lines.push(`**Priority:** ${issue.priority ?? "—"}`);
  lines.push(
    `**Parent:** ${issue.parentIssueId != null ? `#${issue.parentIssueId}` : "—"}`
  );
  lines.push(`**Assignee:** ${issue.assignee ?? "Unassigned"}`);
  lines.push(`**Reporter:** ${issue.reporter ?? "—"}`);
  lines.push(
    `**Categories:** ${issue.categories.length > 0 ? issue.categories.join(", ") : "—"}`
  );
  lines.push(
    `**Milestones:** ${issue.milestones.length > 0 ? issue.milestones.join(", ") : "—"}`
  );
  lines.push(
    `**Versions:** ${issue.versions.length > 0 ? issue.versions.join(", ") : "—"}`
  );
  lines.push(`**Created:** ${formatDate(issue.created)}`);
  lines.push(`**Updated:** ${formatDate(issue.updated)}`);
  lines.push(`**Start Date:** ${issue.startDate ?? "—"}`);
  lines.push(`**Due Date:** ${issue.dueDate ?? "—"}`);
  lines.push(
    `**Estimated:** ${issue.estimatedHours != null ? `${issue.estimatedHours}h` : "—"}`
  );
  lines.push(
    `**Actual:** ${issue.actualHours != null ? `${issue.actualHours}h` : "—"}`
  );
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(issue.description ?? "_No description provided._");
  appendPlacedAttachments(
    lines,
    attachments.filter((item) => item.placementTarget === "description")
  );

  const issueLevel = attachments.filter((item) => item.placementTarget === "issue");
  lines.push("");
  lines.push("## Issue Attachments");
  lines.push("");
  appendAttachmentTable(lines, issueLevel.length > 0 ? issueLevel : attachments);

  lines.push("");
  lines.push("## Comments Timeline");
  lines.push("");
  const visibleComments = skipChangelogOnly
    ? comments.filter((c) => c.content != null && c.content.trim().length > 0)
    : comments;

  if (visibleComments.length === 0) {
    lines.push("_No comments exported._");
  }

  for (const comment of visibleComments) {
    lines.push(
      `### Comment #${comment.id} — ${comment.author ?? "Unknown"} — ${formatDate(comment.created)}`
    );
    lines.push("");
    lines.push(comment.content ?? "_No text content._");
    appendChangeLog(lines, comment);
    appendPlacedAttachments(
      lines,
      attachments.filter((item) => item.commentId === comment.id)
    );
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
    const ext = item.attachment.name.includes(".")
      ? item.attachment.name.split(".").pop()!
      : "text";
    lines.push(`### ${item.attachment.name}`);
    lines.push("");
    lines.push(`\`\`\`${ext}`);
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
    lines.push(
      `| ${item.attachment.id} | ${item.attachment.name} | ${item.attachment.sizeFormatted} | ${item.attachment.uploadedBy ?? "—"} | ${formatDate(item.attachment.created)} | ${item.relativePath ?? "—"} | ${item.placementConfidence} |`
    );
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

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function errorContent(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}
