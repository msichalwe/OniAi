import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BubbleStore } from "./store.js";

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oni-bubbles-"));
}

describe("BubbleStore", () => {
  let workspaceDir: string;
  let store: BubbleStore;

  beforeEach(() => {
    workspaceDir = tmpWorkspace();
    store = new BubbleStore(workspaceDir);
  });

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  describe("bubbles", () => {
    it("creates and queries bubbles", () => {
      store.addBubble({ content: "Decided to use postgres", category: "decision", source: "conversation", importance: 0.8 });
      store.addBubble({ content: "Fixed auth bug", category: "error-fix", source: "conversation", importance: 0.6 });
      store.addBubble({ content: "Weather is nice", category: "observation", source: "node-scan", importance: 0.2 });

      const all = store.queryBubbles({});
      expect(all).toHaveLength(3);

      const decisions = store.queryBubbles({ categories: ["decision"] });
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.content).toContain("postgres");

      const important = store.queryBubbles({ minImportance: 0.5 });
      expect(important).toHaveLength(2);
    });

    it("queries by text", () => {
      store.addBubble({ content: "John mentioned the new API", category: "fact", source: "conversation" });
      store.addBubble({ content: "Database migration completed", category: "event", source: "conversation" });

      const results = store.queryBubbles({ text: "API" });
      expect(results).toHaveLength(1);
      expect(results[0]!.content).toContain("John");
    });

    it("queries by time range", () => {
      const now = Date.now();
      store.addBubble({ content: "Recent", category: "fact", source: "conversation" });

      const after = store.queryBubbles({ after: now - 1000 });
      expect(after).toHaveLength(1);

      const before = store.queryBubbles({ before: now - 100000 });
      expect(before).toHaveLength(0);
    });

    it("tracks recall count", () => {
      const bubble = store.addBubble({ content: "Important fact", category: "fact", source: "conversation" });
      expect(bubble.recallCount).toBe(0);

      store.touchBubble(bubble.id);
      store.touchBubble(bubble.id);

      const updated = store.queryBubbles({ text: "Important" });
      expect(updated[0]!.recallCount).toBe(2);
      expect(updated[0]!.lastAccessedAtMs).toBeGreaterThan(0);
    });
  });

  describe("entities", () => {
    it("creates entities with dedup", () => {
      const e1 = store.addEntity({ type: "person", name: "John", facts: ["Works at Acme"] });
      const e2 = store.addEntity({ type: "person", name: "john", facts: ["Likes coffee"] });

      // Should merge — same name case-insensitive
      expect(e1.id).toBe(e2.id);
      expect(e2.facts).toContain("Works at Acme");
      expect(e2.facts).toContain("Likes coffee");
      expect(e2.mentionCount).toBe(2);
    });

    it("finds entities by name", () => {
      store.addEntity({ type: "project", name: "OniAI", facts: ["Personal AI assistant"] });
      const found = store.findEntity("oniai");
      expect(found).toBeDefined();
      expect(found!.name).toBe("OniAI");
    });

    it("finds entities by alias", () => {
      store.addEntity({ type: "person", name: "Mr S", aliases: ["Sichalwe", "Boss"] });
      expect(store.findEntity("Sichalwe")).toBeDefined();
      expect(store.findEntity("boss")).toBeDefined();
    });

    it("queries entities by type", () => {
      store.addEntity({ type: "person", name: "John" });
      store.addEntity({ type: "project", name: "OniAI" });
      store.addEntity({ type: "tool", name: "Claude Code" });

      const people = store.queryEntities({ types: ["person"] });
      expect(people).toHaveLength(1);

      const projects = store.queryEntities({ types: ["project"] });
      expect(projects).toHaveLength(1);
    });
  });

  describe("relationships", () => {
    it("creates and queries relationships", () => {
      const person = store.addEntity({ type: "person", name: "John" });
      const project = store.addEntity({ type: "project", name: "OniAI" });

      store.addRelationship({
        fromEntityId: person.id,
        toEntityId: project.id,
        type: "works-on",
        context: "Lead developer",
      });

      const rels = store.getRelationships(person.id);
      expect(rels).toHaveLength(1);
      expect(rels[0]!.type).toBe("works-on");
      expect(rels[0]!.context).toBe("Lead developer");
    });

    it("reinforces existing relationships", () => {
      const a = store.addEntity({ type: "person", name: "Alice" });
      const b = store.addEntity({ type: "person", name: "Bob" });

      const r1 = store.addRelationship({ fromEntityId: a.id, toEntityId: b.id, type: "knows", strength: 0.3 });
      const r2 = store.addRelationship({ fromEntityId: a.id, toEntityId: b.id, type: "knows" });

      expect(r2.id).toBe(r1.id); // Same relationship
      expect(r2.strength).toBeGreaterThan(0.3); // Reinforced
    });
  });

  describe("preferences", () => {
    it("sets and gets preferences", () => {
      store.setPreference({ category: "technical", subject: "Language", value: "TypeScript" });
      store.setPreference({ category: "personal", subject: "Coffee", value: "Black, no sugar" });

      const tech = store.getPreferences("technical");
      expect(tech).toHaveLength(1);
      expect(tech[0]!.value).toBe("TypeScript");

      const all = store.getPreferences();
      expect(all).toHaveLength(2);
    });

    it("reinforces existing preferences", () => {
      store.setPreference({ category: "technical", subject: "Language", value: "TypeScript" });
      store.setPreference({ category: "technical", subject: "language", value: "TypeScript is best" });

      const prefs = store.getPreferences("technical");
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.value).toBe("TypeScript is best");
      expect(prefs[0]!.reinforcements).toBe(2);
      expect(prefs[0]!.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("user profile", () => {
    it("gets and updates profile", () => {
      const profile = store.getProfile();
      expect(profile.communicationStyle.formality).toBe("casual");

      store.updateProfile({
        name: "Mr S",
        activeProjects: ["OniAI", "ChezaTickets"],
        interests: ["AI", "automation", "betting"],
      });

      const updated = store.getProfile();
      expect(updated.name).toBe("Mr S");
      expect(updated.activeProjects).toContain("OniAI");
      expect(updated.interests).toContain("AI");
    });
  });

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
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it("returns empty for unrelated context", () => {
      store.addBubble({ content: "Decided to use postgres", category: "decision", source: "conversation" });
      const result = store.surfaceRelevant("qwfp zxcv");
      expect(result.bubbles).toHaveLength(0);
    });
  });

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
  });

  describe("persistence", () => {
    it("persists across instances", () => {
      store.addEntity({ type: "person", name: "John" });
      store.addBubble({ content: "Test", category: "fact", source: "conversation" });
      store.setPreference({ category: "personal", subject: "Color", value: "Blue" });

      const store2 = new BubbleStore(workspaceDir);
      expect(store2.queryEntities({})).toHaveLength(1);
      expect(store2.queryBubbles({})).toHaveLength(1);
      expect(store2.getPreferences()).toHaveLength(1);
    });
  });

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
});
