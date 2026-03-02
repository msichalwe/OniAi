import fs from "node:fs";
import path from "node:path";
import { expandHomePrefix } from "./home-dir.js";

/**
 * Read-only command classification for the "supervised" exec security mode.
 *
 * Supervised mode auto-approves commands classified as read-only (no side effects)
 * and requires approval for commands that may mutate state.
 */

const READ_ONLY_EXECUTABLES = new Set([
  // filesystem reads
  "ls", "cat", "head", "tail", "less", "more", "wc", "file", "stat",
  "find", "fd", "locate", "which", "whereis", "type", "readlink",
  "du", "df", "tree", "exa", "eza", "lsd", "bat", "batcat",
  // text processing (read-only)
  "grep", "rg", "ripgrep", "ag", "ack", "sed", "awk", "sort", "uniq",
  "cut", "tr", "diff", "comm", "join", "paste", "column", "jq", "yq",
  "xargs", "tee",
  // git reads
  "git",
  // system info
  "echo", "printf", "date", "cal", "uptime", "uname", "hostname",
  "whoami", "id", "groups", "env", "printenv", "set",
  "ps", "top", "htop", "free", "vmstat", "iostat", "lsof", "ss", "netstat",
  "ifconfig", "ip", "dig", "nslookup", "host", "ping", "traceroute",
  "curl", "wget",
  // package info reads
  "npm", "pnpm", "yarn", "bun", "pip", "pip3", "cargo", "go", "ruby", "gem",
  "python", "python3", "node", "deno",
  // dev tools reads
  "tsc", "eslint", "prettier", "oxlint", "biome",
  "make", "cmake",
  "docker", "kubectl", "helm",
]);

const GIT_READ_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "branch", "tag", "describe",
  "remote", "config", "rev-parse", "ls-files", "ls-tree", "ls-remote",
  "shortlog", "reflog", "blame", "stash", "worktree",
]);

const GIT_MUTATING_SUBCOMMANDS = new Set([
  "push", "commit", "merge", "rebase", "reset", "checkout", "switch",
  "pull", "fetch", "clone", "init", "add", "rm", "mv",
  "cherry-pick", "revert", "tag", "stash",
]);

const NPM_READ_SUBCOMMANDS = new Set([
  "list", "ls", "ll", "la", "view", "info", "show", "outdated",
  "search", "audit", "doctor", "explain", "why", "fund",
  "config", "get", "prefix", "root", "bin", "version", "help",
]);

const DOCKER_READ_SUBCOMMANDS = new Set([
  "ps", "images", "logs", "inspect", "stats", "top", "port",
  "version", "info", "system", "volume", "network",
]);

const ALWAYS_MUTATING_EXECUTABLES = new Set([
  "rm", "rmdir", "mv", "cp", "mkdir", "touch", "chmod", "chown", "chgrp",
  "ln", "install", "mktemp", "truncate", "shred",
  "kill", "killall", "pkill",
  "sudo", "su", "doas",
  "apt", "apt-get", "brew", "dnf", "yum", "pacman", "snap", "flatpak",
  "systemctl", "service", "launchctl",
  "reboot", "shutdown", "halt", "poweroff",
  "dd", "mount", "umount", "fdisk", "mkfs",
  "iptables", "ufw", "firewall-cmd",
  "crontab", "at",
]);

function resolveFirstArg(argv: string[]): string | undefined {
  for (const arg of argv) {
    if (!arg.startsWith("-")) {
      return arg.toLowerCase();
    }
  }
  return undefined;
}

export type CommandClassification = "read-only" | "mutating" | "unknown";

/**
 * Classify a command as read-only, mutating, or unknown.
 * Conservative: if uncertain, returns "unknown" (which requires approval).
 */
export function classifyCommand(argv: string[]): CommandClassification {
  if (argv.length === 0) {
    return "unknown";
  }

  const executable = path.basename(argv[0]!).toLowerCase();
  const restArgv = argv.slice(1);

  if (ALWAYS_MUTATING_EXECUTABLES.has(executable)) {
    return "mutating";
  }

  if (!READ_ONLY_EXECUTABLES.has(executable)) {
    return "unknown";
  }

  // Git subcommand classification
  if (executable === "git") {
    const subcommand = resolveFirstArg(restArgv);
    if (!subcommand) {
      return "read-only";
    }
    if (GIT_MUTATING_SUBCOMMANDS.has(subcommand)) {
      return "mutating";
    }
    if (GIT_READ_SUBCOMMANDS.has(subcommand)) {
      return "read-only";
    }
    return "unknown";
  }

  // npm/pnpm/yarn subcommand classification
  if (executable === "npm" || executable === "pnpm" || executable === "yarn" || executable === "bun") {
    const subcommand = resolveFirstArg(restArgv);
    if (!subcommand) {
      return "read-only";
    }
    if (NPM_READ_SUBCOMMANDS.has(subcommand)) {
      return "read-only";
    }
    if (subcommand === "install" || subcommand === "i" || subcommand === "add" ||
        subcommand === "remove" || subcommand === "uninstall" || subcommand === "update" ||
        subcommand === "upgrade" || subcommand === "publish" || subcommand === "unpublish" ||
        subcommand === "link" || subcommand === "unlink" || subcommand === "exec" ||
        subcommand === "dlx" || subcommand === "create") {
      return "mutating";
    }
    // run/test/build/start may have side effects but are common dev tasks
    if (subcommand === "run" || subcommand === "test" || subcommand === "build" ||
        subcommand === "start" || subcommand === "dev") {
      return "unknown";
    }
    return "unknown";
  }

  // Docker subcommand classification
  if (executable === "docker") {
    const subcommand = resolveFirstArg(restArgv);
    if (!subcommand) {
      return "read-only";
    }
    if (DOCKER_READ_SUBCOMMANDS.has(subcommand)) {
      return "read-only";
    }
    return "mutating";
  }

  // curl/wget with method check
  if (executable === "curl" || executable === "wget") {
    const hasMethod = restArgv.some((arg, i) =>
      (arg === "-X" || arg === "--request") && restArgv[i + 1] &&
      restArgv[i + 1]!.toUpperCase() !== "GET" && restArgv[i + 1]!.toUpperCase() !== "HEAD"
    );
    const hasData = restArgv.some((arg) =>
      arg === "-d" || arg === "--data" || arg.startsWith("--data-") ||
      arg === "-F" || arg === "--form" || arg.startsWith("--form-")
    );
    if (hasMethod || hasData) {
      return "mutating";
    }
    return "read-only";
  }

  // python/node with -c flag could do anything
  if (executable === "python" || executable === "python3" || executable === "node" || executable === "deno") {
    const hasEval = restArgv.some((arg) => arg === "-c" || arg === "--eval" || arg === "-e");
    if (hasEval) {
      return "unknown";
    }
    return "unknown";
  }

  // tsc/eslint/prettier are read-only by default (lint/check mode)
  if (executable === "tsc" || executable === "eslint" || executable === "prettier" ||
      executable === "oxlint" || executable === "biome") {
    const hasFix = restArgv.some((arg) =>
      arg === "--fix" || arg === "--write" || arg === "-w"
    );
    return hasFix ? "mutating" : "read-only";
  }

  return "read-only";
}

/**
 * Determine if a command should be auto-approved under supervised mode.
 */
export function isSupervisedAutoApprove(argv: string[]): boolean {
  return classifyCommand(argv) === "read-only";
}

// ─── Trust Journal ───

export type TrustJournalEntry = {
  timestampMs: number;
  command: string;
  classification: CommandClassification;
  decision: "auto-approved" | "prompted" | "denied";
  agentId?: string;
  sessionKey?: string;
};

const DEFAULT_TRUST_JOURNAL_PATH = "~/.oni/trust-journal.jsonl";
const MAX_JOURNAL_ENTRIES = 1000;

export function resolveTrustJournalPath(): string {
  return expandHomePrefix(
    process.env.ONI_TRUST_JOURNAL_PATH ?? DEFAULT_TRUST_JOURNAL_PATH,
  );
}

export function appendTrustJournalEntry(entry: TrustJournalEntry) {
  try {
    const journalPath = resolveTrustJournalPath();
    const dir = path.dirname(journalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(journalPath, JSON.stringify(entry) + "\n", "utf-8");
    // Best-effort rotation: if file is too large, truncate to last N entries
    try {
      const content = fs.readFileSync(journalPath, "utf-8");
      const lines = content.trim().split("\n");
      if (lines.length > MAX_JOURNAL_ENTRIES) {
        const trimmed = lines.slice(-MAX_JOURNAL_ENTRIES).join("\n") + "\n";
        fs.writeFileSync(journalPath, trimmed, "utf-8");
      }
    } catch {
      // rotation is best-effort
    }
  } catch {
    // Journal is non-critical — never block exec on journal failure
  }
}

export function readTrustJournal(limit?: number): TrustJournalEntry[] {
  try {
    const journalPath = resolveTrustJournalPath();
    if (!fs.existsSync(journalPath)) {
      return [];
    }
    const content = fs.readFileSync(journalPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = lines
      .map((line) => {
        try {
          return JSON.parse(line) as TrustJournalEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is TrustJournalEntry => e !== null);
    if (limit && limit > 0) {
      return entries.slice(-limit);
    }
    return entries;
  } catch {
    return [];
  }
}
