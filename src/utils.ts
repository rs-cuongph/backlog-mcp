// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

import dayjs from "dayjs";

/**
 * Formats an ISO timestamp to a human-readable local date-time string.
 * Returns "—" for null/empty input.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Formats a numeric hours value to a human-readable string.
 * e.g. 1.5 → "1.5h", 8 → "8h", null → null
 */
export function formatHours(hours: number | null | undefined): string | null {
  if (hours == null) return null;
  return `${hours}h`;
}

/**
 * Truncates a string to the given max length, appending "…" if truncated.
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/**
 * Returns today's date in yyyy-MM-dd format using the local timezone.
 */
export function todayLocalDate(): string {
  return dayjs().format("YYYY-MM-DD");
}

// ---------------------------------------------------------------------------
// Export / filesystem helpers
// ---------------------------------------------------------------------------

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

/**
 * Strips characters that are unsafe in filesystem path segments.
 * Replaces `<>:"/\|?*` and control characters with `_`.
 */
export function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "unnamed";
}

/**
 * Returns true if the filename has a text-readable extension (safe to embed as UTF-8).
 */
export function isTextReadableFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_READABLE_EXTENSIONS.has(lower.slice(dot));
}

/**
 * Returns true if the filename is a common image format that can be embedded in Markdown.
 */
export function isMarkdownImageFile(filename: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
}

/**
 * Lowercases and collapses whitespace for fuzzy text matching.
 */
export function normalizeWhitespaceForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Navigation hints
// ---------------------------------------------------------------------------

/**
 * Renders a navigation hint block appended to the end of tool output.
 * Helps LLMs know which tool to call next for agentic chaining.
 *
 * @param hints - Each entry is one suggested next action (plain text or inline code)
 * @returns A formatted markdown block, or empty string if no hints provided
 *
 * @example
 * navigationHint([
 *   "`backlog_get_comments(issueIdOrKey: \"BLG-123\")` — read discussion",
 *   "`backlog_get_attachments(issueIdOrKey: \"BLG-123\")` — list files",
 * ])
 */
export function navigationHint(hints: string[]): string {
  if (hints.length === 0) return "";
  const lines = hints.map((h) => `- ${h}`);
  return `\n\n---\n💡 **Next:**\n${lines.join("\n")}`;
}
