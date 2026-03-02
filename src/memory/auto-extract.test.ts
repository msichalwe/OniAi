import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendMemoryEntry,
  appendToMainMemory,
  buildRecentMemoryContext,
  buildSessionBridgeContext,
} from "./auto-extract.js";

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oni-auto-mem-"));
}

describe("appendMemoryEntry", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = tmpWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("creates memory/ dir and daily file", () => {
    const ok = appendMemoryEntry(workspaceDir, {
      timestampMs: new Date("2026-03-02T14:30:00Z").getTime(),
      category: "decision",
      content: "Use postgres for the database",
      source: "chat",
    });
    expect(ok).toBe(true);
    const filePath = path.join(workspaceDir, "memory", "2026-03-02.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("[decision]");
    expect(content).toContain("Use postgres for the database");
    expect(content).toContain("(chat)");
  });

  it("appends multiple entries to same file", () => {
    const ts = new Date("2026-03-02T10:00:00Z").getTime();
    appendMemoryEntry(workspaceDir, { timestampMs: ts, category: "discovery", content: "Found bug in auth" });
    appendMemoryEntry(workspaceDir, { timestampMs: ts + 60000, category: "error-fix", content: "Fixed by adding null check" });
    const filePath = path.join(workspaceDir, "memory", "2026-03-02.md");
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(2);
  });

  it("truncates long content", () => {
    const longContent = "x".repeat(1000);
    appendMemoryEntry(workspaceDir, { timestampMs: Date.now(), category: "general", content: longContent });
    const files = fs.readdirSync(path.join(workspaceDir, "memory"));
    const content = fs.readFileSync(path.join(workspaceDir, "memory", files[0]!), "utf-8");
    expect(content.length).toBeLessThan(600);
  });
});

describe("appendToMainMemory", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = tmpWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("creates MEMORY.md with new section", () => {
    const ok = appendToMainMemory(workspaceDir, "Preferences", "User prefers dark mode");
    expect(ok).toBe(true);
    const content = fs.readFileSync(path.join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("## Preferences");
    expect(content).toContain("- User prefers dark mode");
  });

  it("appends to existing section", () => {
    fs.writeFileSync(
      path.join(workspaceDir, "MEMORY.md"),
      "## Preferences\n\n- Likes TypeScript\n",
    );
    appendToMainMemory(workspaceDir, "Preferences", "Prefers pnpm over npm");
    const content = fs.readFileSync(path.join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("- Likes TypeScript");
    expect(content).toContain("- Prefers pnpm over npm");
  });

  it("deduplicates exact matches", () => {
    appendToMainMemory(workspaceDir, "Facts", "Sky is blue");
    const ok = appendToMainMemory(workspaceDir, "Facts", "Sky is blue");
    expect(ok).toBe(false);
  });

  it("skips empty facts", () => {
    expect(appendToMainMemory(workspaceDir, "Facts", "")).toBe(false);
    expect(appendToMainMemory(workspaceDir, "Facts", "  ")).toBe(false);
  });
});

describe("buildRecentMemoryContext", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = tmpWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("returns null when no memory dir", () => {
    expect(buildRecentMemoryContext(workspaceDir)).toBeNull();
  });

  it("returns null when memory dir is empty", () => {
    fs.mkdirSync(path.join(workspaceDir, "memory"));
    expect(buildRecentMemoryContext(workspaceDir)).toBeNull();
  });

  it("returns recent entries from daily files", () => {
    const memDir = path.join(workspaceDir, "memory");
    fs.mkdirSync(memDir);
    fs.writeFileSync(
      path.join(memDir, "2026-03-01.md"),
      "- 10:00 [decision]: Use postgres\n- 11:00 [discovery]: Found API docs\n",
    );
    fs.writeFileSync(
      path.join(memDir, "2026-03-02.md"),
      "- 09:00 [task-outcome]: Deployed v2\n",
    );
    const context = buildRecentMemoryContext(workspaceDir);
    expect(context).not.toBeNull();
    expect(context).toContain("[Recent memories]");
    expect(context).toContain("Use postgres");
    expect(context).toContain("Deployed v2");
  });

  it("respects maxEntries limit", () => {
    const memDir = path.join(workspaceDir, "memory");
    fs.mkdirSync(memDir);
    const lines = Array.from({ length: 20 }, (_, i) => `- ${i}:00 [general]: Entry ${i}`).join("\n");
    fs.writeFileSync(path.join(memDir, "2026-03-02.md"), lines + "\n");
    const context = buildRecentMemoryContext(workspaceDir, 5);
    const entryLines = context!.split("\n").filter((l) => l.startsWith("- "));
    expect(entryLines.length).toBeLessThanOrEqual(5);
  });
});

describe("buildSessionBridgeContext", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = tmpWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("returns null when no MEMORY.md", () => {
    expect(buildSessionBridgeContext(workspaceDir)).toBeNull();
  });

  it("includes full MEMORY.md when small", () => {
    fs.writeFileSync(
      path.join(workspaceDir, "MEMORY.md"),
      "## Preferences\n\n- Likes TypeScript\n- Uses pnpm\n",
    );
    const context = buildSessionBridgeContext(workspaceDir);
    expect(context).toContain("[Session memory bridge");
    expect(context).toContain("Likes TypeScript");
    expect(context).toContain("Uses pnpm");
  });

  it("truncates large MEMORY.md", () => {
    const bigContent = "## Section\n\n" + "- fact ".repeat(500) + "\n";
    fs.writeFileSync(path.join(workspaceDir, "MEMORY.md"), bigContent);
    const context = buildSessionBridgeContext(workspaceDir, 200);
    expect(context!.length).toBeLessThan(300);
    expect(context).toContain("...");
  });
});
