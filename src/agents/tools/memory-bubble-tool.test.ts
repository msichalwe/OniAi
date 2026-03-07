import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnifiedMemoryStore } from "../../memory/unified-store.js";

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-bubble-tool-"));
  return path.join(dir, "test-bubbles.sqlite");
}

describe("UnifiedMemoryStore — new methods", () => {
  let dbPath: string;
  let store: UnifiedMemoryStore;

  beforeEach(() => {
    dbPath = tmpDbPath();
    store = new UnifiedMemoryStore(dbPath);
  });

  afterEach(() => {
    const dir = path.dirname(dbPath);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ─── surfaceRelevant ───

  describe("surfaceRelevant", () => {
    it("finds relevant bubbles and entities for context", () => {
      const entity = store.addEntity({ type: "project", name: "OniAI" });
      store.addBubble({
        content: "OniAI needs better memory system",
        category: "idea",
        source: "conversation",
        entityIds: [entity.id],
        importance: 0.8,
      });
      store.addBubble({
        content: "Weather is sunny today",
        category: "observation",
        source: "node-scan",
        importance: 0.2,
      });

      const result = store.surfaceRelevant("working on memory for OniAI");
      expect(result.bubbles.length).toBeGreaterThan(0);
      expect(result.bubbles[0]!.content).toContain("memory");
    });

    it("returns empty for unrelated context", () => {
      store.addBubble({ content: "Decided to use postgres", category: "decision", source: "conversation" });
      const result = store.surfaceRelevant("qwfp zxcv");
      expect(result.bubbles).toHaveLength(0);
    });

    it("returns empty for short words", () => {
      store.addBubble({ content: "Test content here", category: "fact", source: "conversation" });
      const result = store.surfaceRelevant("a b c");
      expect(result.bubbles).toHaveLength(0);
    });
  });

  // ─── buildContextPrompt ───

  describe("buildContextPrompt", () => {
    it("returns null for empty store", () => {
      expect(store.buildContextPrompt()).toBeNull();
    });

    it("builds context with entities and bubbles", () => {
      store.addEntity({ type: "person", name: "Mr S", facts: ["Owner"] });
      store.addBubble({ content: "Important decision made", category: "decision", source: "conversation", importance: 0.8 });
      store.setPreference({ category: "technical", subject: "Language", value: "TypeScript", confidence: 0.8 });
      store.updateProfile({ activeProjects: ["OniAI"] });

      const prompt = store.buildContextPrompt();
      expect(prompt).not.toBeNull();
      expect(prompt).toContain("Mr S");
      expect(prompt).toContain("Important decision");
      expect(prompt).toContain("TypeScript");
      expect(prompt).toContain("OniAI");
    });

    it("respects maxChars", () => {
      store.addEntity({ type: "person", name: "Mr S", facts: ["Owner"] });
      store.addBubble({ content: "A very important fact that should be included", category: "fact", source: "conversation", importance: 0.8 });
      const prompt = store.buildContextPrompt(50);
      expect(prompt).not.toBeNull();
      expect(prompt!.length).toBeLessThanOrEqual(54); // 50 + "\n..."
    });
  });

  // ─── Node scan tracking ───

  describe("getLastNodeScanAt / recordNodeScan", () => {
    it("returns undefined when no scan recorded", () => {
      expect(store.getLastNodeScanAt()).toBeUndefined();
    });

    it("records and returns scan timestamp", () => {
      const before = Date.now();
      store.recordNodeScan();
      const ts = store.getLastNodeScanAt();
      expect(ts).toBeDefined();
      expect(ts!).toBeGreaterThanOrEqual(before);
    });

    it("returns most recent scan", () => {
      store.recordNodeScan();
      const first = store.getLastNodeScanAt();
      // Small delay to ensure different timestamp
      store.recordNodeScan();
      const second = store.getLastNodeScanAt();
      expect(second).toBeGreaterThanOrEqual(first!);
    });
  });

  // ─── Delete operations ───

  describe("deleteBubble", () => {
    it("deletes an existing bubble", () => {
      const bubble = store.addBubble({ content: "To be deleted", category: "fact", source: "conversation" });
      expect(store.queryBubbles({})).toHaveLength(1);
      const result = store.deleteBubble(bubble.id);
      expect(result).toBe(true);
      expect(store.queryBubbles({})).toHaveLength(0);
    });

    it("returns false for non-existent bubble", () => {
      expect(store.deleteBubble("nonexistent")).toBe(false);
    });
  });

  describe("deleteEntity", () => {
    it("deletes an entity and its relationships", () => {
      const a = store.addEntity({ type: "person", name: "Alice" });
      const b = store.addEntity({ type: "person", name: "Bob" });
      store.addRelationship({ fromEntityId: a.id, toEntityId: b.id, type: "knows" });

      expect(store.getRelationships(a.id)).toHaveLength(1);
      const result = store.deleteEntity(a.id);
      expect(result).toBe(true);
      expect(store.findEntity("Alice")).toBeUndefined();
      // Relationship should also be gone
      expect(store.getRelationships(b.id)).toHaveLength(0);
    });

    it("returns false for non-existent entity", () => {
      expect(store.deleteEntity("nonexistent")).toBe(false);
    });
  });

  describe("deletePreference", () => {
    it("deletes an existing preference", () => {
      const pref = store.setPreference({ category: "technical", subject: "Language", value: "TypeScript" });
      expect(store.getPreferences()).toHaveLength(1);
      const result = store.deletePreference(pref.id);
      expect(result).toBe(true);
      expect(store.getPreferences()).toHaveLength(0);
    });

    it("returns false for non-existent preference", () => {
      expect(store.deletePreference("nonexistent")).toBe(false);
    });
  });

  // ─── Graph traversal ───

  describe("getRelatedEntities", () => {
    it("traverses multi-hop relationships", () => {
      const a = store.addEntity({ type: "person", name: "Alice" });
      const b = store.addEntity({ type: "person", name: "Bob" });
      const c = store.addEntity({ type: "project", name: "OniAI" });
      store.addRelationship({ fromEntityId: a.id, toEntityId: b.id, type: "knows" });
      store.addRelationship({ fromEntityId: b.id, toEntityId: c.id, type: "works-on" });

      // depth=1: should only find Bob
      const depth1 = store.getRelatedEntities(a.id, 1);
      expect(depth1.map((e) => e.name)).toContain("Bob");
      expect(depth1.map((e) => e.name)).not.toContain("OniAI");

      // depth=2: should find Bob AND OniAI
      const depth2 = store.getRelatedEntities(a.id, 2);
      expect(depth2.map((e) => e.name)).toContain("Bob");
      expect(depth2.map((e) => e.name)).toContain("OniAI");
    });
  });

  // ─── Migration from JSON ───

  describe("migrateFromJson", () => {
    it("imports data from legacy JSON store", () => {
      const jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-legacy-"));
      const jsonPath = path.join(jsonDir, ".oni", "memory-bubbles.json");
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, JSON.stringify({
        version: 2,
        bubbles: [{
          id: "bub_legacy1",
          content: "Legacy fact",
          category: "fact",
          source: "conversation",
          entityIds: [],
          linkedBubbleIds: [],
          tags: ["test"],
          importance: 0.7,
          createdAtMs: Date.now(),
          recallCount: 0,
        }],
        entities: [{
          id: "ent_legacy1",
          type: "person",
          name: "LegacyUser",
          aliases: [],
          facts: ["From legacy"],
          firstSeenAtMs: Date.now(),
          lastSeenAtMs: Date.now(),
          mentionCount: 1,
          importance: 0.5,
          metadata: {},
        }],
        relationships: [],
        preferences: [],
        userProfile: {
          activeProjects: [],
          interests: [],
          communicationStyle: { formality: "casual", verbosity: "moderate", humor: true },
          workPatterns: {},
          recurringThemes: [],
          goals: [],
          lastUpdatedAtMs: Date.now(),
        },
      }));

      store.migrateFromJson(jsonPath);
      expect(store.queryBubbles({})).toHaveLength(1);
      expect(store.queryBubbles({})[0]!.content).toBe("Legacy fact");
      expect(store.findEntity("LegacyUser")).toBeDefined();

      fs.rmSync(jsonDir, { recursive: true, force: true });
    });
  });

  // ─── Stats ───

  describe("stats", () => {
    it("returns accurate stats", () => {
      store.addEntity({ type: "person", name: "Alice" });
      store.addEntity({ type: "project", name: "OniAI" });
      store.addBubble({ content: "Fact 1", category: "fact", source: "conversation" });
      store.addBubble({ content: "Fact 2", category: "fact", source: "conversation" });
      store.setPreference({ category: "technical", subject: "X", value: "Y" });

      const stats = store.stats();
      expect(stats.entities).toBe(2);
      expect(stats.bubbles).toBe(2);
      expect(stats.preferences).toBe(1);
      expect(stats.topEntities).toHaveLength(2);
    });
  });

  // ─── Agent scoping ───

  describe("agent scoping", () => {
    it("scopes bubbles by agentId", () => {
      store.addBubble({ content: "Agent A fact", category: "fact", source: "conversation", agentId: "agentA" });
      store.addBubble({ content: "Agent B fact", category: "fact", source: "conversation", agentId: "agentB" });

      const agentA = store.queryBubbles({}, { agentId: "agentA" });
      expect(agentA).toHaveLength(1);
      expect(agentA[0]!.content).toBe("Agent A fact");
    });

    it("includes shared bubbles for any agent", () => {
      store.addBubble({ content: "Shared fact", category: "fact", source: "conversation", agentId: "agentA", shared: true });
      store.addBubble({ content: "Private fact", category: "fact", source: "conversation", agentId: "agentA" });

      const agentB = store.queryBubbles({}, { agentId: "agentB" });
      expect(agentB).toHaveLength(1);
      expect(agentB[0]!.content).toBe("Shared fact");
    });
  });
});
