import fs from "node:fs";
import path from "node:path";

/**
 * Auto-memory extraction: automatically extract and persist key facts
 * from agent conversations. Called after significant agent turns to
 * capture decisions, discoveries, and context that should survive
 * across sessions and compactions.
 *
 * This complements the existing memory flush (pre-compaction) by
 * extracting facts incrementally rather than only at compaction time.
 */

const MEMORY_DIR = "memory";
const MAX_ENTRY_LENGTH = 500;
const MAX_ENTRIES_PER_FILE = 100;

export type MemoryEntry = {
  timestampMs: number;
  category: MemoryCategory;
  content: string;
  source?: string;
  sessionKey?: string;
};

export type MemoryCategory =
  | "decision"
  | "discovery"
  | "preference"
  | "error-fix"
  | "project-context"
  | "task-outcome"
  | "correction"
  | "general";

/**
 * Append a structured memory entry to the daily memory file.
 * Creates memory/ directory and file if needed.
 */
export function appendMemoryEntry(
  workspaceDir: string,
  entry: MemoryEntry,
): boolean {
  try {
    const memoryDir = path.join(workspaceDir, MEMORY_DIR);
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    const date = new Date(entry.timestampMs);
    const dateStr = date.toISOString().slice(0, 10);
    const filePath = path.join(memoryDir, `${dateStr}.md`);

    const content = entry.content.trim().slice(0, MAX_ENTRY_LENGTH);
    const time = date.toISOString().slice(11, 16);
    const categoryTag = `[${entry.category}]`;
    const sourceTag = entry.source ? ` (${entry.source})` : "";
    const line = `- ${time} ${categoryTag}${sourceTag}: ${content}\n`;

    // Check if file exists and has too many entries
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8");
      const lineCount = existing.split("\n").filter((l) => l.startsWith("- ")).length;
      if (lineCount >= MAX_ENTRIES_PER_FILE) {
        // Rotate: keep last half of entries
        const lines = existing.split("\n");
        const header = lines.filter((l) => !l.startsWith("- ") && l.trim());
        const entries = lines.filter((l) => l.startsWith("- "));
        const kept = entries.slice(Math.floor(entries.length / 2));
        fs.writeFileSync(filePath, [...header, ...kept, line].join("\n"), "utf-8");
        return true;
      }
    }

    fs.appendFileSync(filePath, line, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Append a fact to MEMORY.md (the main memory file).
 * Only appends if the fact isn't already present (deduplication).
 */
export function appendToMainMemory(
  workspaceDir: string,
  section: string,
  fact: string,
): boolean {
  try {
    const memoryPath = path.join(workspaceDir, "MEMORY.md");
    const trimmedFact = fact.trim();
    if (!trimmedFact) return false;

    let existing = "";
    if (fs.existsSync(memoryPath)) {
      existing = fs.readFileSync(memoryPath, "utf-8");
      // Skip if already present (exact match)
      if (existing.includes(trimmedFact)) {
        return false;
      }
    }

    // Find or create the section
    const sectionHeader = `## ${section}`;
    if (existing.includes(sectionHeader)) {
      // Append under existing section
      const sectionIdx = existing.indexOf(sectionHeader);
      const nextSectionIdx = existing.indexOf("\n## ", sectionIdx + sectionHeader.length);
      const insertAt = nextSectionIdx === -1 ? existing.length : nextSectionIdx;
      const before = existing.slice(0, insertAt).trimEnd();
      const after = existing.slice(insertAt);
      fs.writeFileSync(memoryPath, `${before}\n- ${trimmedFact}\n${after}`, "utf-8");
    } else {
      // Add new section
      const newSection = `\n\n${sectionHeader}\n\n- ${trimmedFact}\n`;
      fs.appendFileSync(memoryPath, newSection, "utf-8");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a pre-turn memory context from recent memory entries.
 * Returns relevant memory snippets to inject into the agent's context.
 */
export function buildRecentMemoryContext(
  workspaceDir: string,
  maxEntries = 10,
): string | null {
  try {
    const memoryDir = path.join(workspaceDir, MEMORY_DIR);
    if (!fs.existsSync(memoryDir)) return null;

    // Read the most recent memory files (last 3 days)
    const files = fs.readdirSync(memoryDir)
      .filter((f) => f.endsWith(".md") && /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 3);

    if (files.length === 0) return null;

    const entries: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(memoryDir, file), "utf-8");
      const lines = content.split("\n").filter((l) => l.startsWith("- "));
      // Take most recent entries from each file
      entries.push(...lines.slice(-Math.ceil(maxEntries / files.length)));
    }

    if (entries.length === 0) return null;

    const recent = entries.slice(-maxEntries);
    return [
      "[Recent memories]",
      ...recent,
    ].join("\n");
  } catch {
    return null;
  }
}

/**
 * Build a session bridge context — summarize key facts from MEMORY.md
 * that should be available at the start of every new session.
 */
export function buildSessionBridgeContext(
  workspaceDir: string,
  maxChars = 2000,
): string | null {
  try {
    const memoryPath = path.join(workspaceDir, "MEMORY.md");
    if (!fs.existsSync(memoryPath)) return null;

    const content = fs.readFileSync(memoryPath, "utf-8").trim();
    if (!content || content.length < 10) return null;

    // If the file is small enough, include it all
    if (content.length <= maxChars) {
      return `[Session memory bridge — loaded from MEMORY.md]\n\n${content}`;
    }

    // Otherwise, take the first section + last section (most recent)
    const sections = content.split(/\n(?=## )/);
    if (sections.length <= 2) {
      return `[Session memory bridge — loaded from MEMORY.md]\n\n${content.slice(0, maxChars)}...`;
    }

    const first = sections[0]!.trim();
    const last = sections[sections.length - 1]!.trim();
    const combined = `${first}\n\n...\n\n${last}`;

    if (combined.length <= maxChars) {
      return `[Session memory bridge — loaded from MEMORY.md]\n\n${combined}`;
    }

    return `[Session memory bridge — loaded from MEMORY.md]\n\n${combined.slice(0, maxChars)}...`;
  } catch {
    return null;
  }
}
