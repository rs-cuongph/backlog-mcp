import { describe, it, expect, vi } from "vitest";
import { getPrioritiesSchema } from "../tools/get-priorities.js";

// ---------------------------------------------------------------------------
// Schema: backlog_get_priorities
// ---------------------------------------------------------------------------

describe("getPrioritiesSchema", () => {
  it("accepts empty object (no input required)", () => {
    const result = getPrioritiesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("ignores extra fields gracefully", () => {
    // Zod strips unknown keys by default
    const result = getPrioritiesSchema.safeParse({ unexpected: "field" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Handler: handleGetPriorities — HTTP error propagation (mocked)
// ---------------------------------------------------------------------------

describe("handleGetPriorities — HTTP error propagation", () => {
  vi.mock("../backlog/http-client.js", () => ({
    BacklogHttpClient: vi.fn().mockImplementation(() => ({
      getPriorities: vi.fn().mockImplementation(async () => {
        const { McpError } = await import("../errors.js");
        throw new McpError("BACKLOG_HTTP_ERROR", "Backlog HTTP 401 from /api/v2/priorities");
      }),
    })),
  }));

  it("returns error content when API returns 401", async () => {
    const { handleGetPriorities } = await import("../tools/get-priorities.js");
    const mockConfig = {
      BACKLOG_BASE_URL: "https://space.backlog.com",
      BACKLOG_API_KEY: "invalid-key",
      MCP_PORT: 3100,
      LOG_LEVEL: "info",
    };

    const result = await handleGetPriorities({}, mockConfig as never);
    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("BACKLOG_HTTP_ERROR");
    }
  });
});
