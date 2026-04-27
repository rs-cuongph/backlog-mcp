import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// We test config validation by manipulating process.env
// and re-importing the module via dynamic import (vi.resetModules() ensures fresh evaluation).
//
// IMPORTANT: bootstrap.ts runs dotenv as a side-effect on import. We mock it
// entirely so the real .env file is never loaded during tests — preventing env
// var bleed from the developer's local environment.

vi.mock("../bootstrap.js", () => ({
  projectRoot: "/project",
  fromRoot: (p: string) => `/project/${p}`,
  defaultDownloadsDir: "/project/downloads",
}));

const MOCK_DOWNLOADS_DIR = "/project/downloads";

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    // Ensure each test starts with only the vars it explicitly sets
    delete process.env.BACKLOG_BASE_URL;
    delete process.env.BACKLOG_API_KEY;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("parses valid configuration with defaults applied", async () => {
    process.env.BACKLOG_BASE_URL = "https://yourspace.backlog.com";
    process.env.BACKLOG_API_KEY = "test-api-key";

    const { config } = await import("../config.js");

    expect(config.BACKLOG_BASE_URL).toBe("https://yourspace.backlog.com");
    expect(config.BACKLOG_API_KEY).toBe("test-api-key");
    expect(config.ATTACHMENT_WORKSPACE).toBe(MOCK_DOWNLOADS_DIR);
  });

  it("throws CONFIG_ERROR when BACKLOG_BASE_URL is missing", async () => {
    process.env.BACKLOG_API_KEY = "some-key";

    await expect(import("../config.js")).rejects.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });

  it("throws CONFIG_ERROR when BACKLOG_BASE_URL is not a valid URL", async () => {
    process.env.BACKLOG_BASE_URL = "not-a-url";
    process.env.BACKLOG_API_KEY = "some-key";

    await expect(import("../config.js")).rejects.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });

  it("throws CONFIG_ERROR when BACKLOG_API_KEY is missing", async () => {
    process.env.BACKLOG_BASE_URL = "https://space.backlog.com";

    await expect(import("../config.js")).rejects.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });
});
