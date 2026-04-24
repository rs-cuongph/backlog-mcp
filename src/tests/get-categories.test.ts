import { describe, it, expect, vi } from "vitest";
import { getCategoriesSchema } from "../tools/get-categories.js";

// ---------------------------------------------------------------------------
// Schema: backlog_get_categories
// ---------------------------------------------------------------------------

describe("getCategoriesSchema", () => {
  it("accepts a project key string", () => {
    const result = getCategoriesSchema.safeParse({ projectIdOrKey: "MYPROJ" });
    expect(result.success).toBe(true);
  });

  it("accepts a numeric project ID as string", () => {
    const result = getCategoriesSchema.safeParse({ projectIdOrKey: "42" });
    expect(result.success).toBe(true);
  });

  it("rejects empty projectIdOrKey", () => {
    const result = getCategoriesSchema.safeParse({ projectIdOrKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing projectIdOrKey", () => {
    const result = getCategoriesSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler: handleGetCategories — HTTP error propagation (mocked)
// ---------------------------------------------------------------------------

describe("handleGetCategories — HTTP error propagation", () => {
  vi.mock("../backlog/http-client.js", () => ({
    BacklogHttpClient: vi.fn().mockImplementation(() => ({
      getCategories: vi.fn().mockImplementation(async () => {
        const { McpError } = await import("../errors.js");
        throw new McpError("BACKLOG_HTTP_ERROR", "Backlog HTTP 404 from /api/v2/projects/UNKNOWN/categories");
      }),
    })),
  }));

  it("returns error content when project is not found", async () => {
    const { handleGetCategories } = await import("../tools/get-categories.js");
    const mockConfig = {
      BACKLOG_BASE_URL: "https://space.backlog.com",
      BACKLOG_API_KEY: "test-key",
      MCP_PORT: 3100,
      LOG_LEVEL: "info",
    };

    const result = await handleGetCategories({ projectIdOrKey: "UNKNOWN" }, mockConfig as never);
    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("BACKLOG_HTTP_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// Handler: handleGetCategories — invalid input
// ---------------------------------------------------------------------------

describe("handleGetCategories — invalid input", () => {
  it("returns error content for missing projectIdOrKey", async () => {
    const { handleGetCategories } = await import("../tools/get-categories.js");
    const mockConfig = {
      BACKLOG_BASE_URL: "https://space.backlog.com",
      BACKLOG_API_KEY: "test-key",
      MCP_PORT: 3100,
      LOG_LEVEL: "info",
    };
    const result = await handleGetCategories({}, mockConfig as never);
    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("Invalid input");
    }
  });
});
