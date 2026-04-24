import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import type { Config } from "../config.js";
import type { BacklogStatus } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getStatusesSchema = z.object({
  projectIdOrKey: z
    .string()
    .min(1, "projectIdOrKey is required")
    .describe("Project key (e.g. MYPROJ) or numeric project ID"),
});

export type GetStatusesInput = z.infer<typeof getStatusesSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetStatuses(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getStatusesSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const statuses = await client.getStatuses(parsed.data.projectIdOrKey);
    return { content: [{ type: "text", text: formatStatuses(parsed.data.projectIdOrKey, statuses) }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatStatuses(projectIdOrKey: string, statuses: BacklogStatus[]): string {
  const lines: string[] = [];
  lines.push(`# Statuses — ${projectIdOrKey}`);
  lines.push(``);

  if (statuses.length === 0) {
    lines.push("_No statuses found for this project._");
    return lines.join("\n");
  }

  lines.push(`| ID | Name | Color | Display Order |`);
  lines.push(`|----|------|-------|---------------|`);
  for (const s of statuses) {
    lines.push(`| ${s.id} | ${s.name} | ${s.color} | ${s.displayOrder} |`);
  }

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
