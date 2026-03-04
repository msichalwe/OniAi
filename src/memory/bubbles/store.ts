import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  BubbleCategory,
  BubbleQuery,
  BubbleSource,
  Entity,
  EntityQuery,
  EntityType,
  MemoryBubble,
  MemoryBubbleStore,
  Preference,
  PreferenceCategory,
  Relationship,
  RelationType,
  UserProfile,
} from "./types.js";

const MAX_BUBBLES = 5000;
const MAX_ENTITIES = 500;
const MAX_RELATIONSHIPS = 2000;
const MAX_PREFERENCES = 200;

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyProfile(): UserProfile {
  return {
    activeProjects: [],
    interests: [],
    communicationStyle: { formality: "casual", verbosity: "moderate", humor: true },
    workPatterns: {},
    recurringThemes: [],
    goals: [],
    lastUpdatedAtMs: Date.now(),
  };
}

function emptyStore(): MemoryBubbleStore {
  return {
    version: 2,
    bubbles: [],
    entities: [],
    relationships: [],
    preferences: [],
    userProfile: emptyProfile(),
  };
}

export function resolveStorePath(workspaceDir: string): string {
  return path.join(workspaceDir, ".oni", "memory-bubbles.json");
}

export class BubbleStore {
  private readonly storePath: string;

  constructor(workspaceDir: string) {
    this.storePath = resolveStorePath(workspaceDir);
  }

  private load(): MemoryBubbleStore {
    try {
      const raw = fs.readFileSync(this.storePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed?.version === 2) return parsed as MemoryBubbleStore;
    } catch {
      // missing or invalid
    }
    return emptyStore();
  }

  private save(store: MemoryBubbleStore) {
    ensureDir(this.storePath);
    const tmp = `${this.storePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tmp, this.storePath);
  }

  private mutate(fn: (store: MemoryBubbleStore) => void): MemoryBubbleStore {
    const store = this.load();
    fn(store);
    this.save(store);
    return store;
  }

  // ─── Bubbles ───

  addBubble(params: {
    content: string;
    category: BubbleCategory;
    source: BubbleSource;
    entityIds?: string[];
    linkedBubbleIds?: string[];
    tags?: string[];
    importance?: number;
    sessionKey?: string;
  }): MemoryBubble {
    const bubble: MemoryBubble = {
      id: genId("bub"),
      content: params.content.slice(0, 1000),
      category: params.category,
      source: params.source,
      entityIds: params.entityIds ?? [],
      linkedBubbleIds: params.linkedBubbleIds ?? [],
      tags: params.tags ?? [],
      importance: params.importance ?? 0.5,
      sessionKey: params.sessionKey,
      createdAtMs: Date.now(),
      recallCount: 0,
    };
    this.mutate((store) => {
      store.bubbles.push(bubble);
      // Prune old low-importance bubbles if over limit
      if (store.bubbles.length > MAX_BUBBLES) {
        store.bubbles.sort((a, b) => b.importance - a.importance || b.createdAtMs - a.createdAtMs);
        store.bubbles = store.bubbles.slice(0, MAX_BUBBLES);
      }
    });
    return bubble;
  }

  queryBubbles(query: BubbleQuery): MemoryBubble[] {
    const store = this.load();
    let results = store.bubbles;

    if (query.categories?.length) {
      const cats = new Set(query.categories);
      results = results.filter((b) => cats.has(b.category));
    }
    if (query.sources?.length) {
      const srcs = new Set(query.sources);
      results = results.filter((b) => srcs.has(b.source));
    }
    if (query.entityId) {
      results = results.filter((b) => b.entityIds.includes(query.entityId!));
    }
    if (query.tags?.length) {
      const tagSet = new Set(query.tags);
      results = results.filter((b) => b.tags.some((t) => tagSet.has(t)));
    }
    if (query.after) {
      results = results.filter((b) => b.createdAtMs >= query.after!);
    }
    if (query.before) {
      results = results.filter((b) => b.createdAtMs < query.before!);
    }
    if (query.minImportance) {
      results = results.filter((b) => b.importance >= query.minImportance!);
    }
    if (query.text) {
      const lower = query.text.toLowerCase();
      results = results.filter((b) => b.content.toLowerCase().includes(lower));
    }

    // Sort
    const sortBy = query.sortBy ?? "recency";
    if (sortBy === "recency") {
      results.sort((a, b) => b.createdAtMs - a.createdAtMs);
    } else if (sortBy === "importance") {
      results.sort((a, b) => b.importance - a.importance);
    } else if (sortBy === "recall") {
      results.sort((a, b) => b.recallCount - a.recallCount);
    }

    return results.slice(0, query.limit ?? 50);
  }

  touchBubble(id: string) {
    this.mutate((store) => {
      const bubble = store.bubbles.find((b) => b.id === id);
      if (bubble) {
        bubble.lastAccessedAtMs = Date.now();
        bubble.recallCount++;
      }
    });
  }

  // ─── Entities ───

  addEntity(params: {
    type: EntityType;
    name: string;
    aliases?: string[];
    facts?: string[];
    metadata?: Record<string, unknown>;
  }): Entity {
    const store = this.load();
    // Check for existing entity with same name (case-insensitive)
    const nameLower = params.name.toLowerCase();
    const existing = store.entities.find(
      (e) => e.type === params.type &&
        (e.name.toLowerCase() === nameLower || e.aliases.some((a) => a.toLowerCase() === nameLower)),
    );
    if (existing) {
      // Merge facts and bump mention count
      return this.updateEntity(existing.id, {
        facts: [...new Set([...existing.facts, ...(params.facts ?? [])])],
        mentionCount: existing.mentionCount + 1,
      })!;
    }

    const entity: Entity = {
      id: genId("ent"),
      type: params.type,
      name: params.name,
      aliases: params.aliases ?? [],
      facts: params.facts ?? [],
      firstSeenAtMs: Date.now(),
      lastSeenAtMs: Date.now(),
      mentionCount: 1,
      importance: 0.5,
      metadata: params.metadata ?? {},
    };
    this.mutate((s) => {
      s.entities.push(entity);
      if (s.entities.length > MAX_ENTITIES) {
        s.entities.sort((a, b) => b.importance - a.importance);
        s.entities = s.entities.slice(0, MAX_ENTITIES);
      }
    });
    return entity;
  }

  updateEntity(id: string, patch: Partial<Pick<Entity, "name" | "aliases" | "facts" | "importance" | "mentionCount" | "metadata">>): Entity | undefined {
    let updated: Entity | undefined;
    this.mutate((store) => {
      const entity = store.entities.find((e) => e.id === id);
      if (!entity) return;
      if (patch.name) entity.name = patch.name;
      if (patch.aliases) entity.aliases = patch.aliases;
      if (patch.facts) entity.facts = patch.facts;
      if (patch.importance !== undefined) entity.importance = patch.importance;
      if (patch.mentionCount !== undefined) entity.mentionCount = patch.mentionCount;
      if (patch.metadata) entity.metadata = { ...entity.metadata, ...patch.metadata };
      entity.lastSeenAtMs = Date.now();
      // Recalculate importance based on mentions and recency
      const daysSinceFirst = (Date.now() - entity.firstSeenAtMs) / 86_400_000;
      entity.importance = Math.min(1, (entity.mentionCount / Math.max(1, daysSinceFirst)) * 0.3 + 0.2);
      updated = entity;
    });
    return updated;
  }

  findEntity(name: string, type?: EntityType): Entity | undefined {
    const store = this.load();
    const lower = name.toLowerCase();
    return store.entities.find(
      (e) =>
        (!type || e.type === type) &&
        (e.name.toLowerCase() === lower || e.aliases.some((a) => a.toLowerCase() === lower)),
    );
  }

  queryEntities(query: EntityQuery): Entity[] {
    const store = this.load();
    let results = store.entities;
    if (query.types?.length) {
      const types = new Set(query.types);
      results = results.filter((e) => types.has(e.type));
    }
    if (query.minImportance) {
      results = results.filter((e) => e.importance >= query.minImportance!);
    }
    if (query.text) {
      const lower = query.text.toLowerCase();
      results = results.filter(
        (e) =>
          e.name.toLowerCase().includes(lower) ||
          e.aliases.some((a) => a.toLowerCase().includes(lower)) ||
          e.facts.some((f) => f.toLowerCase().includes(lower)),
      );
    }
    results.sort((a, b) => b.importance - a.importance);
    return results.slice(0, query.limit ?? 50);
  }

  // ─── Relationships ───

  addRelationship(params: {
    fromEntityId: string;
    toEntityId: string;
    type: RelationType;
    context?: string;
    strength?: number;
  }): Relationship {
    const store = this.load();
    // Check for existing relationship
    const existing = store.relationships.find(
      (r) => r.fromEntityId === params.fromEntityId && r.toEntityId === params.toEntityId && r.type === params.type,
    );
    if (existing) {
      // Reinforce
      existing.strength = Math.min(1, existing.strength + 0.1);
      existing.lastReinforcedAtMs = Date.now();
      if (params.context) existing.context = params.context;
      this.save(store);
      return existing;
    }

    const rel: Relationship = {
      id: genId("rel"),
      fromEntityId: params.fromEntityId,
      toEntityId: params.toEntityId,
      type: params.type,
      context: params.context,
      strength: params.strength ?? 0.5,
      createdAtMs: Date.now(),
      lastReinforcedAtMs: Date.now(),
    };
    this.mutate((s) => {
      s.relationships.push(rel);
      if (s.relationships.length > MAX_RELATIONSHIPS) {
        s.relationships.sort((a, b) => b.strength - a.strength);
        s.relationships = s.relationships.slice(0, MAX_RELATIONSHIPS);
      }
    });
    return rel;
  }

  getRelationships(entityId: string): Relationship[] {
    const store = this.load();
    return store.relationships.filter(
      (r) => r.fromEntityId === entityId || r.toEntityId === entityId,
    );
  }

  // ─── Preferences ───

  setPreference(params: {
    category: PreferenceCategory;
    subject: string;
    value: string;
    confidence?: number;
  }): Preference {
    const store = this.load();
    const subjectLower = params.subject.toLowerCase();
    const existing = store.preferences.find(
      (p) => p.category === params.category && p.subject.toLowerCase() === subjectLower,
    );
    if (existing) {
      existing.value = params.value;
      existing.confidence = Math.min(1, existing.confidence + 0.15);
      existing.reinforcements++;
      existing.lastSeenAtMs = Date.now();
      this.save(store);
      return existing;
    }

    const pref: Preference = {
      id: genId("pref"),
      category: params.category,
      subject: params.subject,
      value: params.value,
      confidence: params.confidence ?? 0.5,
      reinforcements: 1,
      firstSeenAtMs: Date.now(),
      lastSeenAtMs: Date.now(),
    };
    this.mutate((s) => {
      s.preferences.push(pref);
      if (s.preferences.length > MAX_PREFERENCES) {
        s.preferences.sort((a, b) => b.confidence - a.confidence);
        s.preferences = s.preferences.slice(0, MAX_PREFERENCES);
      }
    });
    return pref;
  }

  getPreferences(category?: PreferenceCategory): Preference[] {
    const store = this.load();
    let prefs = store.preferences;
    if (category) prefs = prefs.filter((p) => p.category === category);
    return prefs.sort((a, b) => b.confidence - a.confidence);
  }

  // ─── User Profile ───

  getProfile(): UserProfile {
    return this.load().userProfile;
  }

  updateProfile(patch: Partial<UserProfile>) {
    this.mutate((store) => {
      store.userProfile = { ...store.userProfile, ...patch, lastUpdatedAtMs: Date.now() };
    });
  }

  // ─── Node Scan Tracking ───

  getLastNodeScanAt(): number | undefined {
    return this.load().lastNodeScanAtMs;
  }

  recordNodeScan() {
    this.mutate((store) => {
      store.lastNodeScanAtMs = Date.now();
    });
  }

  // ─── Stats ───

  stats(): {
    bubbles: number;
    entities: number;
    relationships: number;
    preferences: number;
    topEntities: { name: string; type: string; mentions: number }[];
  } {
    const store = this.load();
    const topEntities = store.entities
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 10)
      .map((e) => ({ name: e.name, type: e.type, mentions: e.mentionCount }));
    return {
      bubbles: store.bubbles.length,
      entities: store.entities.length,
      relationships: store.relationships.length,
      preferences: store.preferences.length,
      topEntities,
    };
  }

  // ─── Proactive Surfacing ───

  /**
   * Find bubbles and entities relevant to a given context string.
   * Used by heartbeat to proactively surface connections.
   */
  surfaceRelevant(context: string, limit = 5): {
    bubbles: MemoryBubble[];
    entities: Entity[];
    connections: string[];
  } {
    const store = this.load();
    const words = context.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) return { bubbles: [], entities: [], connections: [] };

    // Score bubbles by word overlap — require at least one word match
    const scoredBubbles = store.bubbles.map((b) => {
      const contentLower = b.content.toLowerCase();
      const matchCount = words.filter((w) => contentLower.includes(w)).length;
      if (matchCount === 0) return { bubble: b, score: 0 };
      const recencyBoost = Math.max(0, 1 - (Date.now() - b.createdAtMs) / (30 * 86_400_000));
      return { bubble: b, score: matchCount * 0.6 + b.importance * 0.2 + recencyBoost * 0.2 };
    }).filter((s) => s.score > 0);

    scoredBubbles.sort((a, b) => b.score - a.score);
    const topBubbles = scoredBubbles.slice(0, limit).map((s) => s.bubble);

    // Find mentioned entities
    const entityIds = new Set(topBubbles.flatMap((b) => b.entityIds));
    const entities = store.entities.filter((e) => entityIds.has(e.id));

    // Build connection descriptions
    const connections: string[] = [];
    for (const entity of entities.slice(0, 3)) {
      const rels = store.relationships.filter(
        (r) => r.fromEntityId === entity.id || r.toEntityId === entity.id,
      );
      for (const rel of rels.slice(0, 2)) {
        const other = store.entities.find(
          (e) => e.id === (rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId),
        );
        if (other) {
          connections.push(`${entity.name} ${rel.type} ${other.name}${rel.context ? ` (${rel.context})` : ""}`);
        }
      }
    }

    return { bubbles: topBubbles, entities, connections };
  }

  /**
   * Build a context string for injection into agent prompts.
   * Summarizes recent bubbles, important entities, and active preferences.
   */
  buildContextPrompt(maxChars = 2000): string | null {
    const store = this.load();
    if (store.bubbles.length === 0 && store.entities.length === 0) return null;

    const lines: string[] = [];
    lines.push("[Memory Bubbles — structured context]");

    // Top entities
    const topEntities = store.entities
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 8);
    if (topEntities.length > 0) {
      lines.push("\nKey entities:");
      for (const e of topEntities) {
        const factsStr = e.facts.slice(0, 3).join("; ");
        lines.push(`- ${e.name} (${e.type})${factsStr ? `: ${factsStr}` : ""}`);
      }
    }

    // Recent important bubbles
    const recentBubbles = store.bubbles
      .filter((b) => b.importance >= 0.4)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 10);
    if (recentBubbles.length > 0) {
      lines.push("\nRecent memories:");
      for (const b of recentBubbles) {
        const date = new Date(b.createdAtMs).toISOString().slice(0, 10);
        lines.push(`- [${date}] [${b.category}] ${b.content.slice(0, 120)}`);
      }
    }

    // High-confidence preferences
    const prefs = store.preferences.filter((p) => p.confidence >= 0.6).slice(0, 8);
    if (prefs.length > 0) {
      lines.push("\nKnown preferences:");
      for (const p of prefs) {
        lines.push(`- ${p.subject}: ${p.value}`);
      }
    }

    // User profile summary
    const profile = store.userProfile;
    if (profile.activeProjects.length > 0) {
      lines.push(`\nActive projects: ${profile.activeProjects.join(", ")}`);
    }
    if (profile.goals.length > 0) {
      lines.push(`Goals: ${profile.goals.join(", ")}`);
    }

    const text = lines.join("\n");
    return text.length > maxChars ? text.slice(0, maxChars) + "\n..." : text;
  }
}
