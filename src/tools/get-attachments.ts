import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";
import type { BacklogAttachment } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getAttachmentsSchema = z.object({
  issueIdOrKey: z
    .string()
    .min(1)
    .describe(
      "Issue key or numeric ID to list attachments for. " +
      "Examples: \"BLG-123\", \"12345\". " +
      "Use the attachment ID from this result with backlog_download_attachment."
    ),
});

export type GetAttachmentsInput = z.infer<typeof getAttachmentsSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetAttachments(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getAttachmentsSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { issueIdOrKey } = parsed.data;
  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const attachments = await client.getIssueAttachments(issueIdOrKey);
    return {
      content: [{ type: "text", text: formatAttachments(attachments, issueIdOrKey) }],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatAttachments(attachments: BacklogAttachment[], issueIdOrKey: string): string {
  const lines: string[] = [];

  lines.push(`# Attachments — ${issueIdOrKey}`);
  lines.push(``);
  lines.push(`**Issue:** ${issueIdOrKey}`);
  lines.push(`**Total:** ${attachments.length} attachment(s)`);
  lines.push(``);

  if (attachments.length === 0) {
    lines.push("_No attachments found on this issue._");
    return lines.join("\n");
  }

  lines.push(`| ID | Name | Size | Uploaded By | Created At |`);
  lines.push(`|----|------|------|-------------|------------|`);

  for (const a of attachments) {
    const uploadedBy = a.uploadedBy ?? "—";
    const created = a.created.slice(0, 10); // YYYY-MM-DD
    lines.push(`| ${a.id} | ${a.name} | ${a.sizeFormatted} | ${uploadedBy} | ${created} |`);
  }

  const exampleId = attachments[0].id;
  lines.push(navigationHint([
    `\`backlog_download_attachment(issueIdOrKey: "${issueIdOrKey}", attachmentId: ${exampleId})\` — download the first file`,
    `\`backlog_export_issue_context(issueIdOrKey: "${issueIdOrKey}")\` — export full issue bundle (all attachments + comments)`,
  ]));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function errorContent(msg: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: msg }], isError: true };
}
