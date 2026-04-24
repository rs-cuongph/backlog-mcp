import { z } from "zod";
import { BacklogHttpClient } from "../backlog/http-client.js";
import { isMcpError } from "../errors.js";
import type { Config } from "../config.js";
import type { BacklogCategory } from "../types.js";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const getCategoriesSchema = z.object({
  projectIdOrKey: z
    .string()
    .min(1, "projectIdOrKey is required")
    .describe("Project key (e.g. MYPROJ) or numeric project ID"),
});

export type GetCategoriesInput = z.infer<typeof getCategoriesSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetCategories(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = getCategoriesSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  const client = new BacklogHttpClient(cfg.BACKLOG_BASE_URL, cfg.BACKLOG_API_KEY);

  try {
    const categories = await client.getCategories(parsed.data.projectIdOrKey);
    return { content: [{ type: "text", text: formatCategories(parsed.data.projectIdOrKey, categories) }] };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatCategories(projectIdOrKey: string, categories: BacklogCategory[]): string {
  const lines: string[] = [];
  lines.push(`# Categories — ${projectIdOrKey}`);
  lines.push(``);

  if (categories.length === 0) {
    lines.push("_No categories found for this project._");
    return lines.join("\n");
  }

  lines.push(`| ID | Name |`);
  lines.push(`|----|------|`);
  for (const c of categories) {
    lines.push(`| ${c.id} | ${c.name} |`);
  }

  return lines.join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
