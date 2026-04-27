import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import { formatFileSize } from "../backlog/mappers.js";
import { navigationHint } from "../utils.js";
import type { Config } from "../config.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const downloadAttachmentSchema = z.object({
  issueIdOrKey: z
    .string()
    .min(1)
    .describe(
      "Issue key or numeric ID that owns the attachment. " +
      "Examples: \"BLG-123\", \"12345\"."
    ),
  attachmentId: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric attachment ID from backlog_get_attachments. Example: 42"
    ),
});

export type DownloadAttachmentInput = z.infer<typeof downloadAttachmentSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleDownloadAttachment(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = downloadAttachmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const { issueIdOrKey, attachmentId } = parsed.data;
  const outputDir = cfg.ATTACHMENT_WORKSPACE;
  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const { data, filename } = await client.downloadAttachment(issueIdOrKey, attachmentId);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, data);

    const sizeFormatted = formatFileSize(data.length);
    const absolutePath = path.resolve(outputPath);

    const text = [
      `# Download Complete`,
      ``,
      `**File:** ${filename}`,
      `**Size:** ${sizeFormatted} (${data.length} bytes)`,
      `**Saved to:** ${absolutePath}`,
      `**Issue:** ${issueIdOrKey}`,
      `**Attachment ID:** ${attachmentId}`,
      navigationHint([
        `\`backlog_get_attachments(issueIdOrKey: "${issueIdOrKey}")\` — view all attachments on this issue`,
        `\`backlog_get_issue(issueIdOrKey: "${issueIdOrKey}")\` — go back to issue overview`,
      ]),
    ].join("\n");

    return { content: [{ type: "text", text }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
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
