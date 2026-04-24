import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import type { Config } from "../config.js";
import type { BacklogMilestone } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getMilestonesSchema = z.object({
  projectIdOrKey: z
    .string()
    .min(1, "projectIdOrKey is required")
    .describe("Project key (e.g. MYPROJ) or numeric project ID"),
  archived: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include archived milestones. Default: false (active only)"),
});

export type GetMilestonesInput = z.infer<typeof getMilestonesSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetMilestones(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getMilestonesSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const milestones = await client.getMilestones(
      parsed.data.projectIdOrKey,
      parsed.data.archived
    );
    return {
      content: [
        {
          type: "text",
          text: formatMilestones(parsed.data.projectIdOrKey, milestones, parsed.data.archived),
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
// Formatting
// ---------------------------------------------------------------------------

function formatMilestones(
  projectIdOrKey: string,
  milestones: BacklogMilestone[],
  archived: boolean
): string {
  const lines: string[] = [];
  const label = archived ? "All Milestones" : "Active Milestones";
  lines.push(`# ${label} — ${projectIdOrKey}`);
  lines.push(``);

  if (milestones.length === 0) {
    lines.push("_No milestones found for this project._");
    return lines.join("\n");
  }

  lines.push(`| ID | Name | Start Date | Due Date | Archived |`);
  lines.push(`|----|------|------------|----------|----------|`);
  for (const m of milestones) {
    const start = m.startDate ?? "—";
    const due = m.releaseDueDate ?? "—";
    const arc = m.archived ? "✓" : "";
    lines.push(`| ${m.id} | ${m.name} | ${start} | ${due} | ${arc} |`);
  }

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
