import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractFromText, runPostTurnExtraction } from "./auto-entity-extract.js";
import { UnifiedMemoryStore } from "../unified-store.js";

// ─── extractFromText unit tests ───

describe("extractFromText", () => {
  it("extracts 'my wife <Name>' pattern", () => {
    const result = extractFromText("I was talking to my wife Chioni today");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe("Chioni");
    expect(result.entities[0]!.type).toBe("person");
    expect(result.entities[0]!.relation?.type).toBe("spouse");
  });

  it("extracts 'my husband <Name>' pattern", () => {
    const result = extractFromText("my husband James went to work");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe("James");
    expect(result.entities[0]!.relation?.type).toBe("spouse");
  });

  it("extracts '<Name> is my wife' pattern", () => {
    const result = extractFromText("Chioni is my wife");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe("Chioni");
    expect(result.entities[0]!.relation?.type).toBe("spouse");
  });

  it("extracts 'my son/daughter <Name>' pattern", () => {
    const result = extractFromText("my son Jamie was super happy today and my daughter Sara won");
    expect(result.entities.length).toBeGreaterThanOrEqual(2);
    const names = result.entities.map((e) => e.name);
    expect(names).toContain("Jamie");
    expect(names).toContain("Sara");
    for (const entity of result.entities) {
      expect(entity.relation?.type).toBe("parent");
    }
  });

  it("extracts 'my friend <Name>' pattern", () => {
    const result = extractFromText("I met my friend David at the park");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe("David");
    expect(result.entities[0]!.relation?.type).toBe("knows");
  });

  it("deduplicates entities mentioned multiple times", () => {
    const result = extractFromText("my wife Chioni loves cooking. Chioni is my wife");
    const names = result.entities.map((e) => e.name);
    const uniqueNames = [...new Set(names)];
    expect(uniqueNames.length).toBe(names.length);
  });

  it("extracts 'call me <Name>' preference", () => {
    const result = extractFromText("please call me Mr S from now on");
    expect(result.preferences.length).toBeGreaterThanOrEqual(1);
    const namePref = result.preferences.find((p) => p.subject === "Preferred name");
    expect(namePref).toBeDefined();
  });

  it("extracts 'I prefer ...' preference", () => {
    const result = extractFromText("I prefer dark mode for all my editors");
    expect(result.preferences.length).toBeGreaterThanOrEqual(1);
    expect(result.preferences[0]!.category).toBe("personal");
  });

  it("extracts 'I always ...' workflow preference", () => {
    const result = extractFromText("I always start my day with a standup meeting");
    expect(result.preferences.length).toBeGreaterThanOrEqual(1);
    expect(result.preferences[0]!.category).toBe("workflow");
  });

  it("returns empty for text with no extractable entities or preferences", () => {
    const result = extractFromText("what is the weather today?");
    expect(result.entities).toHaveLength(0);
    expect(result.preferences).toHaveLength(0);
  });

  it("handles empty text", () => {
    const result = extractFromText("");
    expect(result.entities).toHaveLength(0);
    expect(result.preferences).toHaveLength(0);
    expect(result.facts).toHaveLength(0);
  });
});

// ─── UnifiedMemoryStore new methods ───

describe("UnifiedMemoryStore graph methods", () => {
  let store: UnifiedMemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-graph-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    store = new UnifiedMemoryStore(dbPath);
  });

  afterEach(() => {
    try { store.close(); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  describe("fuzzyFindEntity", () => {
    it("finds entity by exact name", () => {
      store.addEntity({ type: "person", name: "Chioni", facts: ["Wife of owner"] });
      const results = store.fuzzyFindEntity("Chioni");
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("Chioni");
    });

    it("finds entity by partial name", () => {
      store.addEntity({ type: "person", name: "Chioni Sichalwe", facts: [] });
      const results = store.fuzzyFindEntity("Chio");
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("Chioni Sichalwe");
    });

    it("finds entity by alias substring", () => {
      store.addEntity({ type: "person", name: "Chioni", aliases: ["Chi", "wifey"], facts: [] });
      const results = store.fuzzyFindEntity("wif");
      expect(results).toHaveLength(1);
    });

    it("finds entity by fact content", () => {
      store.addEntity({ type: "person", name: "Jamie", facts: ["Loves ice cream"] });
      const results = store.fuzzyFindEntity("ice cream");
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("Jamie");
    });

    it("returns empty for no match", () => {
      store.addEntity({ type: "person", name: "Chioni", facts: [] });
      const results = store.fuzzyFindEntity("zzzzzzz");
      expect(results).toHaveLength(0);
    });

    it("returns empty for empty query", () => {
      store.addEntity({ type: "person", name: "Chioni", facts: [] });
      const results = store.fuzzyFindEntity("");
      expect(results).toHaveLength(0);
    });
  });

  describe("graphSummary", () => {
    it("returns empty graph when no entities exist", () => {
      const summary = store.graphSummary();
      expect(summary.entities).toHaveLength(0);
      expect(summary.totalEntities).toBe(0);
      expect(summary.totalRelationships).toBe(0);
    });

    it("returns all entities with their relationships", () => {
      const owner = store.addEntity({ type: "person", name: "Mr S", facts: ["Owner"] });
      const wife = store.addEntity({ type: "person", name: "Chioni", facts: ["Wife of owner"] });
      const child = store.addEntity({ type: "person", name: "Jamie", facts: ["Son of owner"] });
      store.addRelationship({ fromEntityId: owner.id, toEntityId: wife.id, type: "spouse", context: "married" });
      store.addRelationship({ fromEntityId: owner.id, toEntityId: child.id, type: "parent", context: "father" });

      const summary = store.graphSummary();
      expect(summary.totalEntities).toBe(3);
      expect(summary.totalRelationships).toBe(2);
      expect(summary.entities).toHaveLength(3);

      const ownerNode = summary.entities.find((e) => e.name === "Mr S");
      expect(ownerNode).toBeDefined();
      expect(ownerNode!.relationships.length).toBe(2);
    });

    it("respects maxEntities limit", () => {
      for (let i = 0; i < 10; i++) {
        store.addEntity({ type: "person", name: `Person ${i}`, facts: [] });
      }
      const summary = store.graphSummary(3);
      expect(summary.entities).toHaveLength(3);
      expect(summary.totalEntities).toBe(10);
    });
  });

  describe("entityDetail", () => {
    it("returns null for non-existent entity", () => {
      const detail = store.entityDetail("nonexistent");
      expect(detail).toBeNull();
    });

    it("returns entity with relationships and linked bubbles", () => {
      const owner = store.addEntity({ type: "person", name: "Mr S", facts: ["Owner"] });
      const wife = store.addEntity({ type: "person", name: "Chioni", facts: ["Wife of owner", "Loves ice cream"] });
      store.addRelationship({ fromEntityId: owner.id, toEntityId: wife.id, type: "spouse", context: "married" });
      store.addBubble({ content: "Chioni loves ice cream", category: "fact", source: "conversation", entityIds: [wife.id] });

      const detail = store.entityDetail(wife.id);
      expect(detail).not.toBeNull();
      expect(detail!.entity.name).toBe("Chioni");
      expect(detail!.relationships).toHaveLength(1);
      expect(detail!.relationships[0]!.otherEntity?.name).toBe("Mr S");
      expect(detail!.linkedBubbles).toHaveLength(1);
      expect(detail!.linkedBubbles[0]!.content).toContain("ice cream");
    });

    it("returns relationships with resolved other entity names", () => {
      const a = store.addEntity({ type: "person", name: "Alice", facts: [] });
      const b = store.addEntity({ type: "person", name: "Bob", facts: [] });
      const c = store.addEntity({ type: "project", name: "ProjectX", facts: [] });
      store.addRelationship({ fromEntityId: a.id, toEntityId: b.id, type: "knows" });
      store.addRelationship({ fromEntityId: a.id, toEntityId: c.id, type: "works-on" });

      const detail = store.entityDetail(a.id);
      expect(detail!.relationships).toHaveLength(2);
      const otherNames = detail!.relationships.map((r) => r.otherEntity?.name).sort();
      expect(otherNames).toEqual(["Bob", "ProjectX"]);
    });
  });
});

// ─── runPostTurnExtraction integration ───

describe("runPostTurnExtraction", () => {
  let dbPath: string;
  let store: UnifiedMemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-extract-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    store = new UnifiedMemoryStore(dbPath);
    // Seed an owner entity so relationships can be created
    store.addEntity({ type: "person", name: "Owner", facts: ["The user"] });
    store.close();
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it("does not crash on empty message", () => {
    const result = runPostTurnExtraction({
      cfg: {} as any,
      agentId: "main",
      userMessage: "",
    });
    expect(result.extracted).toBe(0);
  });

  it("does not crash on text with no entities", () => {
    const result = runPostTurnExtraction({
      cfg: {} as any,
      agentId: "main",
      userMessage: "what is the weather?",
    });
    expect(result.extracted).toBe(0);
  });
});
