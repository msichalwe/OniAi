import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { UnifiedMemoryStore } from "../unified-store.js";
import type { NodeScanStore } from "./node-scanner.js";
import { isNodeScanDue, buildNodeScanCommands } from "./node-scanner.js";
import { BubbleStore, resolveStorePath } from "./store.js";

type HeartbeatStore = NodeScanStore & {
  surfaceRelevant(context: string, limit?: number): { bubbles: { createdAtMs: number; content: string }[]; entities: unknown[]; connections: string[] };
  queryEntities(query: { minImportance?: number; limit?: number }): { lastSeenAtMs: number; name: string; mentionCount: number }[];
  buildContextPrompt(maxChars?: number): string | null;
};

/**
 * Proactive Memory Surfacing for Heartbeat
 *
 * During heartbeat cycles, this module:
 * 1. Checks if a node scan is due (every 12h)
 * 2. Surfaces relevant memories based on recent context
 * 3. Builds proactive insights the agent can share with the user
 */

export type HeartbeatMemoryResult = {
  /** Whether a node scan should be triggered. */
  nodeScanDue: boolean;
  /** Commands to run on connected nodes for ambient capture. */
  nodeScanCommands?: { label: string; command: string }[];
  /** Proactive memory insights to inject into heartbeat. */
  insights: string[];
  /** Memory context prompt for injection. */
  contextPrompt: string | null;
};

/**
 * Resolve memory-related work for a heartbeat cycle.
 */
export function resolveHeartbeatMemoryWork(params: {
  workspaceDir: string;
  recentContext?: string;
}): HeartbeatMemoryResult {
  try {
    const store = resolveMemoryStoreCompat(params.workspaceDir);
    const nodeScanDue = isNodeScanDue(store);
    const insights: string[] = [];

    // Surface relevant memories if we have recent context
    if (params.recentContext) {
      const surfaced = store.surfaceRelevant(params.recentContext, 3);
      if (surfaced.connections.length > 0) {
        insights.push(`Memory connections found: ${surfaced.connections.join("; ")}`);
      }
      if (surfaced.bubbles.length > 0) {
        const recentBubble = surfaced.bubbles[0]!;
        const daysAgo = Math.floor((Date.now() - recentBubble.createdAtMs) / 86_400_000);
        if (daysAgo > 0) {
          insights.push(`Related memory from ${daysAgo}d ago: ${recentBubble.content.slice(0, 100)}`);
        }
      }
    }

    // Check for stale entities (mentioned often but not recently)
    const entities = store.queryEntities({ minImportance: 0.6, limit: 5 });
    const now = Date.now();
    for (const entity of entities) {
      const daysSinceSeen = (now - entity.lastSeenAtMs) / 86_400_000;
      if (daysSinceSeen > 7 && entity.mentionCount > 3) {
        insights.push(`Haven't heard about "${entity.name}" in ${Math.floor(daysSinceSeen)} days (mentioned ${entity.mentionCount} times before)`);
        break; // Only one stale entity hint per heartbeat
      }
    }

    // Build context prompt for injection
    const contextPrompt = store.buildContextPrompt(1500);

    return {
      nodeScanDue,
      nodeScanCommands: nodeScanDue ? buildNodeScanCommands() : undefined,
      insights,
      contextPrompt,
    };
  } catch {
    return {
      nodeScanDue: false,
      insights: [],
      contextPrompt: null,
    };
  }
}

function resolveMemoryStoreCompat(workspaceDir: string): HeartbeatStore {
  try {
    const stateDir = resolveStateDir(process.env, os.homedir);
    // Use a generic db path for heartbeat (not agent-scoped)
    const dbPath = path.join(stateDir, "memory", "bubbles-heartbeat.sqlite");
    const store = new UnifiedMemoryStore(dbPath);
    // Auto-migrate from legacy JSON if the unified store is empty
    const stats = store.stats();
    if (stats.bubbles === 0 && stats.entities === 0) {
      const jsonPath = resolveStorePath(workspaceDir);
      try { store.migrateFromJson(jsonPath); } catch { /* non-fatal */ }
    }
    return store as unknown as HeartbeatStore;
  } catch {
    // Fall back to legacy JSON store
    return new BubbleStore(workspaceDir) as unknown as HeartbeatStore;
  }
}

/**
 * Build a heartbeat prompt section with memory insights.
 */
export function buildMemoryInsightsPrompt(insights: string[]): string | null {
  if (insights.length === 0) return null;
  const lines = [
    "[Memory insights — proactive surfacing]",
    ...insights.map((i) => `- ${i}`),
    "",
    "If any of these are relevant to the user's current work, mention them naturally.",
    "Don't force it — only bring up insights that are genuinely useful right now.",
  ];
  return lines.join("\n");
}
