import { describe, it, expect, vi } from "vitest";
import { getMilestonesSchema } from "../tools/get-milestones.js";

// ---------------------------------------------------------------------------
// Schema: backlog_get_milestones
// ---------------------------------------------------------------------------

describe("getMilestonesSchema", () => {
  it("accepts minimal input with defaults applied", () => {
    const result = getMilestonesSchema.safeParse({ projectIdOrKey: "MYPROJ" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.archived).toBe(false);
    }
  });

  it("accepts archived=true", () => {
    const result = getMilestonesSchema.safeParse({ projectIdOrKey: "MYPROJ", archived: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.archived).toBe(true);
    }
  });

  it("rejects empty projectIdOrKey", () => {
    const result = getMilestonesSchema.safeParse({ projectIdOrKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing projectIdOrKey", () => {
    const result = getMilestonesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean archived value", () => {
    const result = getMilestonesSchema.safeParse({ projectIdOrKey: "MYPROJ", archived: "yes" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler: handleGetMilestones — HTTP error propagation (mocked)
// ---------------------------------------------------------------------------

describe("handleGetMilestones — HTTP error propagation", () => {
  vi.mock("../backlog/http-client.js", () => ({
    BacklogHttpClient: vi.fn().mockImplementation(() => ({
      getMilestones: vi.fn().mockImplementation(async () => {
        const { McpError } = await import("../errors.js");
        throw new McpError("BACKLOG_HTTP_ERROR", "Backlog HTTP 404 from /api/v2/projects/UNKNOWN/versions");
      }),
    })),
  }));

  it("returns error content when project is not found", async () => {
    const { handleGetMilestones } = await import("../tools/get-milestones.js");
    const mockConfig = {
      BACKLOG_BASE_URL: "https://space.backlog.com",
      BACKLOG_API_KEY: "test-key",
      MCP_PORT: 3100,
      LOG_LEVEL: "info",
    };

    const result = await handleGetMilestones({ projectIdOrKey: "UNKNOWN" }, mockConfig as never);
    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("BACKLOG_HTTP_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// Handler: handleGetMilestones — invalid input
// ---------------------------------------------------------------------------

describe("handleGetMilestones — invalid input", () => {
  it("returns error content for missing projectIdOrKey", async () => {
    const { handleGetMilestones } = await import("../tools/get-milestones.js");
    const mockConfig = {
      BACKLOG_BASE_URL: "https://space.backlog.com",
      BACKLOG_API_KEY: "test-key",
      MCP_PORT: 3100,
      LOG_LEVEL: "info",
    };
    const result = await handleGetMilestones({}, mockConfig as never);
    expect(result.isError).toBe(true);
    if (result.content[0].type === "text") {
      expect(result.content[0].text).toContain("Invalid input");
    }
  });
});
