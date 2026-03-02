import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyCommand,
  isSupervisedAutoApprove,
  appendTrustJournalEntry,
  readTrustJournal,
} from "./exec-supervised.js";

describe("classifyCommand", () => {
  describe("read-only commands", () => {
    it.each([
      [["ls", "-la"]],
      [["cat", "file.txt"]],
      [["head", "-n", "10", "file.txt"]],
      [["tail", "-f", "log.txt"]],
      [["grep", "-r", "pattern", "."]],
      [["rg", "pattern"]],
      [["find", ".", "-name", "*.ts"]],
      [["wc", "-l", "file.txt"]],
      [["stat", "file.txt"]],
      [["du", "-sh", "."]],
      [["df", "-h"]],
      [["tree", "."]],
      [["echo", "hello"]],
      [["date"]],
      [["whoami"]],
      [["ps", "aux"]],
      [["uname", "-a"]],
      [["which", "node"]],
      [["env"]],
      [["jq", ".name", "package.json"]],
    ])("classifies %j as read-only", (argv) => {
      expect(classifyCommand(argv)).toBe("read-only");
    });
  });

  describe("git subcommands", () => {
    it("classifies git status as read-only", () => {
      expect(classifyCommand(["git", "status"])).toBe("read-only");
    });
    it("classifies git log as read-only", () => {
      expect(classifyCommand(["git", "log", "--oneline"])).toBe("read-only");
    });
    it("classifies git diff as read-only", () => {
      expect(classifyCommand(["git", "diff"])).toBe("read-only");
    });
    it("classifies git push as mutating", () => {
      expect(classifyCommand(["git", "push"])).toBe("mutating");
    });
    it("classifies git commit as mutating", () => {
      expect(classifyCommand(["git", "commit", "-m", "msg"])).toBe("mutating");
    });
    it("classifies git add as mutating", () => {
      expect(classifyCommand(["git", "add", "."])).toBe("mutating");
    });
  });

  describe("npm subcommands", () => {
    it("classifies npm list as read-only", () => {
      expect(classifyCommand(["npm", "list"])).toBe("read-only");
    });
    it("classifies npm install as mutating", () => {
      expect(classifyCommand(["npm", "install"])).toBe("mutating");
    });
    it("classifies npm run as unknown", () => {
      expect(classifyCommand(["npm", "run", "build"])).toBe("unknown");
    });
    it("classifies pnpm install as mutating", () => {
      expect(classifyCommand(["pnpm", "install"])).toBe("mutating");
    });
  });

  describe("mutating commands", () => {
    it.each([
      [["rm", "-rf", "dir"]],
      [["mkdir", "newdir"]],
      [["mv", "a", "b"]],
      [["cp", "a", "b"]],
      [["chmod", "755", "file"]],
      [["kill", "-9", "1234"]],
      [["sudo", "apt", "install"]],
      [["brew", "install", "pkg"]],
    ])("classifies %j as mutating", (argv) => {
      expect(classifyCommand(argv)).toBe("mutating");
    });
  });

  describe("curl classification", () => {
    it("classifies GET curl as read-only", () => {
      expect(classifyCommand(["curl", "https://example.com"])).toBe("read-only");
    });
    it("classifies POST curl as mutating", () => {
      expect(classifyCommand(["curl", "-X", "POST", "https://example.com"])).toBe("mutating");
    });
    it("classifies curl with data as mutating", () => {
      expect(classifyCommand(["curl", "-d", "data", "https://example.com"])).toBe("mutating");
    });
  });

  describe("linter/formatter classification", () => {
    it("classifies tsc as read-only", () => {
      expect(classifyCommand(["tsc", "--noEmit"])).toBe("read-only");
    });
    it("classifies eslint as read-only", () => {
      expect(classifyCommand(["eslint", "src/"])).toBe("read-only");
    });
    it("classifies eslint --fix as mutating", () => {
      expect(classifyCommand(["eslint", "--fix", "src/"])).toBe("mutating");
    });
    it("classifies prettier --write as mutating", () => {
      expect(classifyCommand(["prettier", "--write", "src/"])).toBe("mutating");
    });
  });

  describe("docker classification", () => {
    it("classifies docker ps as read-only", () => {
      expect(classifyCommand(["docker", "ps"])).toBe("read-only");
    });
    it("classifies docker run as mutating", () => {
      expect(classifyCommand(["docker", "run", "image"])).toBe("mutating");
    });
  });

  describe("edge cases", () => {
    it("returns unknown for empty argv", () => {
      expect(classifyCommand([])).toBe("unknown");
    });
    it("returns unknown for unknown executables", () => {
      expect(classifyCommand(["my-custom-script"])).toBe("unknown");
    });
  });
});

describe("isSupervisedAutoApprove", () => {
  it("returns true for read-only commands", () => {
    expect(isSupervisedAutoApprove(["ls", "-la"])).toBe(true);
  });
  it("returns false for mutating commands", () => {
    expect(isSupervisedAutoApprove(["rm", "-rf", "/"])).toBe(false);
  });
  it("returns false for unknown commands", () => {
    expect(isSupervisedAutoApprove(["my-script"])).toBe(false);
  });
});

describe("trust journal", () => {
  let cleanupDir: string;

  beforeEach(() => {
    cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-trust-journal-"));
    vi.stubEnv("ONI_TRUST_JOURNAL_PATH", path.join(cleanupDir, "trust-journal.jsonl"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    try {
      fs.rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("appends and reads entries", () => {
    appendTrustJournalEntry({
      timestampMs: Date.now(),
      command: "ls -la",
      classification: "read-only",
      decision: "auto-approved",
    });
    appendTrustJournalEntry({
      timestampMs: Date.now(),
      command: "rm -rf /tmp/test",
      classification: "mutating",
      decision: "prompted",
    });
    const entries = readTrustJournal();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.command).toBe("ls -la");
    expect(entries[0]!.decision).toBe("auto-approved");
    expect(entries[1]!.command).toBe("rm -rf /tmp/test");
    expect(entries[1]!.decision).toBe("prompted");
  });

  it("returns empty array when no journal exists", () => {
    vi.stubEnv("ONI_TRUST_JOURNAL_PATH", path.join(cleanupDir, "nonexistent.jsonl"));
    expect(readTrustJournal()).toEqual([]);
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      appendTrustJournalEntry({
        timestampMs: Date.now(),
        command: `cmd-${i}`,
        classification: "read-only",
        decision: "auto-approved",
      });
    }
    const entries = readTrustJournal(3);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.command).toBe("cmd-7");
  });
});
