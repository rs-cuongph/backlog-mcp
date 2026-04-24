import { describe, it, expect, vi } from "vitest";
import { getStatusesSchema } from "../tools/get-statuses.js";

// ---------------------------------------------------------------------------
// Schema: backlog_get_statuses
// ---------------------------------------------------------------------------

describe("getStatusesSchema", () => {
  it("accepts a project key string", () => {
    const result = getStatusesSchema.safeParse({ projectIdOrKey: "MYPROJ" });
    expect(result.success).toBe(true);
  });

  it("accepts a numeric project ID as string", () => {
    const result = getStatusesSchema.safeParse({ projectIdOrKey: "12345" });
    expect(result.success).toBe(true);
  });

  it("rejects empty projectIdOrKey", () => {
    const result = getStatusesSchema.safeParse({ projectIdOrKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing projectIdOrKey", () => {
    const result = getStatusesSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler: handleGetStatuses — HTTP error propagation (mocked)
// ---------------------------------------------------------------------------

describe("handleGetStatuses — HTTP error propagation", () => {
  vi.mock("../backlog/http-client.js", () => ({
    BacklogHttpClient: vi.fn().mockImplementation(() => ({
      getStatuses: vi.fn().mockImplementation(async () => {
        const { McpError } = await import("../errors.js");
        throw new McpError("BACKLOG_HTTP_ERROR", "Backlog HTTP 403 from /api/v2/projects/MYPROJ/statuses");
      }),
    })),
  }));

  it("returns error content when API returns 403", async () => {
    const { handleGetStatuses } = await import("../tools/get-statuses.js");
    const mockConfig = {
      BACKLOG_BASE_URL: "https://space.backlog.com",
      BACKLOG_API_KEY: "test-key",
      MCP_PORT: 3100,
      LOG_LEVEL: "info",
    };

    const result = await handleGetStatuses({ projectIdOrKey: "MYPROJ" }, mockConfig as never);
    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("BACKLOG_HTTP_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// Handler: handleGetStatuses — invalid input
// ---------------------------------------------------------------------------

describe("handleGetStatuses — invalid input", () => {
  it("returns error content for missing projectIdOrKey", async () => {
    const { handleGetStatuses } = await import("../tools/get-statuses.js");
    const mockConfig = {
      BACKLOG_BASE_URL: "https://space.backlog.com",
      BACKLOG_API_KEY: "test-key",
      MCP_PORT: 3100,
      LOG_LEVEL: "info",
    };
    const result = await handleGetStatuses({}, mockConfig as never);
    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("Invalid input");
    }
  });
});
