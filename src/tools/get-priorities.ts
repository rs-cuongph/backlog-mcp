import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import type { Config } from "../config.js";
import type { BacklogPriority } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

// Priorities are global — no input required.
export const getPrioritiesSchema = z.object({});

export type GetPrioritiesInput = z.infer<typeof getPrioritiesSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetPriorities(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getPrioritiesSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const priorities = await client.getPriorities();
    return { content: [{ type: "text", text: formatPriorities(priorities) }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatPriorities(priorities: BacklogPriority[]): string {
  const lines: string[] = [];
  lines.push(`# Priorities (Global)`);
  lines.push(``);
  lines.push(`> Priorities are space-wide and apply to all projects.`);
  lines.push(``);

  if (priorities.length === 0) {
    lines.push("_No priorities found._");
    return lines.join("\n");
  }

  lines.push(`| ID | Name |`);
  lines.push(`|----|------|`);
  for (const p of priorities) {
    lines.push(`| ${p.id} | ${p.name} |`);
  }

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
