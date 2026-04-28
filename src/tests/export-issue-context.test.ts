import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizePathSegment,
  isTextReadableFile,
  normalizeWhitespaceForMatch,
} from "../utils.js";

// ---------------------------------------------------------------------------
// Utility tests
// ---------------------------------------------------------------------------

describe("export issue context utilities", () => {
  it("sanitizes path segments for local export paths", () => {
    expect(sanitizePathSegment("BLG/10474:spec?.png")).toBe("BLG_10474_spec_.png");
  });

  it("detects text-readable attachment names", () => {
    expect(isTextReadableFile("notes.md")).toBe(true);
    expect(isTextReadableFile("api.json")).toBe(true);
    expect(isTextReadableFile("screenshot.png")).toBe(false);
    expect(isTextReadableFile("spec.pdf")).toBe(false);
  });

  it("normalizes text for case-insensitive matching", () => {
    expect(normalizeWhitespaceForMatch(" Error   Screenshot.PNG ")).toBe(
      "error screenshot.png"
    );
  });
});

// ---------------------------------------------------------------------------
// Handler mocks
// ---------------------------------------------------------------------------

vi.mock("../backlog/http-client.js", () => {
  const MockBacklogHttpClient = vi.fn();
  MockBacklogHttpClient.prototype.getIssue = vi.fn();
  MockBacklogHttpClient.prototype.getComments = vi.fn();
  MockBacklogHttpClient.prototype.getIssueAttachments = vi.fn();
  MockBacklogHttpClient.prototype.downloadAttachment = vi.fn();
  return { BacklogHttpClient: MockBacklogHttpClient };
});

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("attachment text")),
}));

import { handleExportIssueContext } from "../tools/export-issue-context.js";
import { BacklogHttpClient } from "../backlog/http-client.js";
import * as fsMock from "node:fs/promises";
import type { Config } from "../config.js";

const MOCK_CFG: Config = {
  BACKLOG_BASE_URL: "https://test.backlog.com",
  BACKLOG_API_KEY: "test-key",
  ATTACHMENT_WORKSPACE: "/tmp/backlog-exports",
};

const MOCK_ISSUE = {
  id: 100,
  issueKey: "BLG-10474",
  issueType: "Task",
  summary: "Implement payment callback fix",
  status: "In Progress",
  priority: "High",
  resolution: null,
  assignee: "Alice",
  categories: ["Payment"],
  versions: [],
  milestones: ["Sprint 12"],
  startDate: null,
  dueDate: "2026-04-30",
  estimatedHours: null,
  actualHours: null,
  parentIssueId: null,
  created: "2026-04-20T01:00:00Z",
  updated: "2026-04-24T02:00:00Z",
  url: "https://test.backlog.com/view/BLG-10474",
  description: "Please check screenshot.png and implement callback timeout handling.",
  reporter: "Bob",
};

const MOCK_COMMENTS = [
  {
    id: 1,
    author: "Alice",
    content: "The callback blocks on fraud service. See notes.md.",
    created: "2026-04-21T10:00:00Z",
    updated: "2026-04-21T10:00:00Z",
    changeLog: [],
  },
];

const MOCK_ATTACHMENTS = [
  {
    id: 10,
    name: "screenshot.png",
    size: 100,
    sizeFormatted: "100 B",
    uploadedBy: "Bob",
    created: "2026-04-20T01:05:00Z",
  },
  {
    id: 11,
    name: "notes.md",
    size: 50,
    sizeFormatted: "50 B",
    uploadedBy: "Alice",
    created: "2026-04-21T10:01:00Z",
  },
];

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe("handleExportIssueContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (BacklogHttpClient.prototype.getIssue as ReturnType<typeof vi.fn>).mockResolvedValue(
      MOCK_ISSUE
    );
    (BacklogHttpClient.prototype.getComments as ReturnType<typeof vi.fn>).mockResolvedValue(
      MOCK_COMMENTS
    );
    (BacklogHttpClient.prototype.getIssueAttachments as ReturnType<typeof vi.fn>).mockResolvedValue(
      MOCK_ATTACHMENTS
    );
    (BacklogHttpClient.prototype.downloadAttachment as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from("attachment text"),
      filename: "downloaded.md",
    });
  });

  it("exports issue context markdown and manifest", async () => {
    const result = await handleExportIssueContext({ issueIdOrKey: "BLG-10474" }, MOCK_CFG);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Export Complete");
    expect(result.content[0].text).toContain("raw.md");
    expect(result.content[0].text).toContain("manifest.json");
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("raw.md"),
      expect.stringContaining("# [BLG-10474] Implement payment callback fix"),
      "utf8"
    );
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("manifest.json"),
      expect.stringContaining('"issueKey": "BLG-10474"'),
      "utf8"
    );
  });

  it("returns isError=true for invalid input", async () => {
    const result = await handleExportIssueContext({ issueIdOrKey: "" }, MOCK_CFG);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });

  it("fetches all comments with asc pagination", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...MOCK_COMMENTS[0],
      id: index + 1,
    }));
    const secondPage = [{ ...MOCK_COMMENTS[0], id: 101 }];
    (BacklogHttpClient.prototype.getComments as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    await handleExportIssueContext({ issueIdOrKey: "BLG-10474" }, MOCK_CFG);

    expect(BacklogHttpClient.prototype.getComments).toHaveBeenNthCalledWith(1, "BLG-10474", {
      count: 100,
      order: "asc",
      minId: undefined,
    });
    expect(BacklogHttpClient.prototype.getComments).toHaveBeenNthCalledWith(2, "BLG-10474", {
      count: 100,
      order: "asc",
      minId: 101,
    });
  });

  it("records exact and inferred attachment placement in manifest", async () => {
    await handleExportIssueContext({ issueIdOrKey: "BLG-10474" }, MOCK_CFG);

    const manifestCall = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).endsWith("manifest.json")
    );
    expect(manifestCall).toBeDefined();
    expect(String(manifestCall?.[1])).toContain("\"placementConfidence\": \"exact\"");
    expect(String(manifestCall?.[1])).toContain("\"commentId\": 1");
  });

  it("skips attachments larger than maxAttachmentBytes", async () => {
    await handleExportIssueContext(
      { issueIdOrKey: "BLG-10474", maxAttachmentBytes: 10 },
      MOCK_CFG
    );

    expect(BacklogHttpClient.prototype.downloadAttachment).not.toHaveBeenCalled();
    const manifestCall = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).endsWith("manifest.json")
    );
    expect(String(manifestCall?.[1])).toContain("exceeds maxAttachmentBytes");
  });

  it("includes all metadata fields in raw.md", async () => {
    await handleExportIssueContext({ issueIdOrKey: "BLG-10474" }, MOCK_CFG);

    const rawCall = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).endsWith("raw.md")
    );
    const rawContent = String(rawCall?.[1]);
    expect(rawContent).toContain("**Type:** Task");
    expect(rawContent).toContain("**Resolution:** —");
    expect(rawContent).toContain("**Categories:** Payment");
    expect(rawContent).toContain("**Milestones:** Sprint 12");
    expect(rawContent).toContain("**Versions:** —");
    expect(rawContent).toContain("**Due Date:** 2026-04-30");
    expect(rawContent).toContain("**Start Date:** —");
    expect(rawContent).toContain("**Estimated:** —");
    expect(rawContent).toContain("**Actual:** —");
    expect(rawContent).toContain("**Parent:** —");
  });

  it("skips changelog-only comments when skipChangelogOnlyComments is true", async () => {
    const commentsWithChangelog = [
      {
        id: 1,
        author: "Alice",
        content: "This is a real comment with text",
        created: "2026-04-21T10:00:00Z",
        updated: "2026-04-21T10:00:00Z",
        changeLog: [],
      },
      {
        id: 2,
        author: "Bob",
        content: null,
        created: "2026-04-22T08:00:00Z",
        updated: "2026-04-22T08:00:00Z",
        changeLog: [{ field: "status", originalValue: "Open", newValue: "InProgress" }],
      },
      {
        id: 3,
        author: "Carol",
        content: "   ",
        created: "2026-04-22T09:00:00Z",
        updated: "2026-04-22T09:00:00Z",
        changeLog: [{ field: "assignee", originalValue: null, newValue: "Alice" }],
      },
    ];
    (BacklogHttpClient.prototype.getComments as ReturnType<typeof vi.fn>).mockResolvedValue(
      commentsWithChangelog
    );

    await handleExportIssueContext(
      { issueIdOrKey: "BLG-10474", skipChangelogOnlyComments: true },
      MOCK_CFG
    );

    const rawCall = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).endsWith("raw.md")
    );
    const rawContent = String(rawCall?.[1]);
    expect(rawContent).toContain("Comment #1");
    expect(rawContent).not.toContain("Comment #2");
    expect(rawContent).not.toContain("Comment #3");
  });

  it("uses file extension for syntax highlighting in extracted content", async () => {
    (BacklogHttpClient.prototype.getIssueAttachments as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 20, name: "config.json", size: 30, sizeFormatted: "30 B", uploadedBy: "Alice", created: "2026-04-21T10:01:00Z" },
    ]);
    (BacklogHttpClient.prototype.downloadAttachment as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from('{"key": "value"}'),
      filename: "config.json",
    });

    await handleExportIssueContext(
      { issueIdOrKey: "BLG-10474", extractReadableFiles: true },
      MOCK_CFG
    );

    const rawCall = (fsMock.writeFile as ReturnType<typeof vi.fn>).mock.calls.find((call) =>
      String(call[0]).endsWith("raw.md")
    );
    const rawContent = String(rawCall?.[1]);
    expect(rawContent).toContain("```json");
    expect(rawContent).not.toContain("```text");
  });
});
