/**
 * Unified Memory Store — SQLite-backed replacement for the JSON BubbleStore.
 * Combines bubble system (entities, relationships, preferences, user profile)
 * with the existing vector/chunk tables in a single database.
 */

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
} from "./bubbles/types.js";

export type {
  BubbleCategory,
  BubbleQuery,
  BubbleSource,
  Entity,
  EntityQuery,
  EntityType,
  MemoryBubble,
  Preference,
  PreferenceCategory,
  Relationship,
  RelationType,
  UserProfile,
};

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
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

// ─── Schema ───

export function ensureUnifiedSchema(db: DatabaseSync): { ftsAvailable: boolean; ftsError?: string } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bubbles (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      entity_ids TEXT NOT NULL DEFAULT '[]',
      linked_bubble_ids TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      importance REAL NOT NULL DEFAULT 0.5,
      session_key TEXT,
      agent_id TEXT,
      shared INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT,
      created_at_ms INTEGER NOT NULL,
      last_accessed_at_ms INTEGER,
      recall_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_bubbles_category ON bubbles(category);
    CREATE INDEX IF NOT EXISTS idx_bubbles_agent_id ON bubbles(agent_id);
    CREATE INDEX IF NOT EXISTS idx_bubbles_importance ON bubbles(importance);
    CREATE INDEX IF NOT EXISTS idx_bubbles_created_at ON bubbles(created_at_ms);

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      facts TEXT NOT NULL DEFAULT '[]',
      first_seen_at_ms INTEGER NOT NULL,
      last_seen_at_ms INTEGER NOT NULL,
      mention_count INTEGER NOT NULL DEFAULT 1,
      importance REAL NOT NULL DEFAULT 0.5,
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      from_entity_id TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      type TEXT NOT NULL,
      context TEXT,
      strength REAL NOT NULL DEFAULT 0.5,
      created_at_ms INTEGER NOT NULL,
      last_reinforced_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_entity_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_entity_id);

    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      reinforcements INTEGER NOT NULL DEFAULT 1,
      first_seen_at_ms INTEGER NOT NULL,
      last_seen_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY DEFAULT 'default',
      data TEXT NOT NULL,
      last_updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_history (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      created_at_ms INTEGER NOT NULL
    );
  `);

  // FTS5 for bubble content search
  let ftsAvailable = false;
  let ftsError: string | undefined;
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bubbles_fts USING fts5(content, id UNINDEXED);
    `);
    ftsAvailable = true;
  } catch (err) {
    ftsError = err instanceof Error ? err.message : String(err);
  }
  return { ftsAvailable, ...(ftsError ? { ftsError } : {}) };
}

// ─── Unified Store ───

export class UnifiedMemoryStore {
  readonly db: DatabaseSync;
  private ftsAvailable: boolean;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    const { ftsAvailable } = ensureUnifiedSchema(this.db);
    this.ftsAvailable = ftsAvailable;
  }

  close() {
    this.db.close();
  }

  private recordHistory(targetId: string, targetType: string, action: string, prev: unknown, next: unknown) {
    this.db.prepare(
      `INSERT INTO memory_history (id, target_id, target_type, action, previous_value, new_value, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(genId("hist"), targetId, targetType, action, prev ? JSON.stringify(prev) : null, next ? JSON.stringify(next) : null, Date.now());
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
    agentId?: string;
    shared?: boolean;
  }): MemoryBubble {
    const now = Date.now();
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
      createdAtMs: now,
      recallCount: 0,
    };
    this.db.prepare(
      `INSERT INTO bubbles (id, content, category, source, entity_ids, linked_bubble_ids, tags, importance, session_key, agent_id, shared, created_at_ms, recall_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(
      bubble.id, bubble.content, bubble.category, bubble.source,
      JSON.stringify(bubble.entityIds), JSON.stringify(bubble.linkedBubbleIds), JSON.stringify(bubble.tags),
      bubble.importance, bubble.sessionKey ?? null, params.agentId ?? null, params.shared ? 1 : 0, now,
    );
    if (this.ftsAvailable) {
      this.db.prepare(`INSERT INTO bubbles_fts (id, content) VALUES (?, ?)`).run(bubble.id, bubble.content);
    }
    this.recordHistory(bubble.id, "bubble", "create", null, bubble);
    return bubble;
  }

  private rowToBubble(row: Record<string, unknown>): MemoryBubble {
    return {
      id: row.id as string,
      content: row.content as string,
      category: row.category as BubbleCategory,
      source: row.source as BubbleSource,
      entityIds: JSON.parse((row.entity_ids as string) || "[]"),
      linkedBubbleIds: JSON.parse((row.linked_bubble_ids as string) || "[]"),
      tags: JSON.parse((row.tags as string) || "[]"),
      importance: row.importance as number,
      sessionKey: (row.session_key as string) ?? undefined,
      createdAtMs: row.created_at_ms as number,
      lastAccessedAtMs: (row.last_accessed_at_ms as number) ?? undefined,
      recallCount: (row.recall_count as number) ?? 0,
    };
  }

  queryBubbles(query: BubbleQuery, opts?: { agentId?: string }): MemoryBubble[] {
    const conditions: string[] = ["superseded_by IS NULL"];
    const params: (string | number | null)[] = [];

    // FTS text search
    if (query.text && this.ftsAvailable) {
      conditions.push("b.id IN (SELECT id FROM bubbles_fts WHERE bubbles_fts MATCH ?)");
      params.push(query.text);
    } else if (query.text) {
      conditions.push("b.content LIKE ?");
      params.push(`%${query.text}%`);
    }
    if (query.categories?.length) {
      conditions.push(`b.category IN (${query.categories.map(() => "?").join(",")})`);
      params.push(...query.categories);
    }
    if (query.sources?.length) {
      conditions.push(`b.source IN (${query.sources.map(() => "?").join(",")})`);
      params.push(...query.sources);
    }
    if (query.entityId) {
      // JSON array contains check
      conditions.push("b.entity_ids LIKE ?");
      params.push(`%"${query.entityId}"%`);
    }
    if (query.tags?.length) {
      const tagConds = query.tags.map(() => "b.tags LIKE ?");
      conditions.push(`(${tagConds.join(" OR ")})`);
      for (const t of query.tags) {params.push(`%"${t}"%`);}
    }
    if (query.after != null) { conditions.push("b.created_at_ms >= ?"); params.push(query.after); }
    if (query.before != null) { conditions.push("b.created_at_ms < ?"); params.push(query.before); }
    if (query.minImportance != null) { conditions.push("b.importance >= ?"); params.push(query.minImportance); }

    // Agent scoping: show own bubbles + shared bubbles
    if (opts?.agentId) {
      conditions.push("(b.agent_id = ? OR b.shared = 1)");
      params.push(opts.agentId);
    }

    const sortCol = query.sortBy === "importance" ? "b.importance" : query.sortBy === "recall" ? "b.recall_count" : "b.created_at_ms";
    const limit = query.limit ?? 50;
    params.push(limit);

    const sql = `SELECT b.* FROM bubbles b WHERE ${conditions.join(" AND ")} ORDER BY ${sortCol} DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBubble(r));
  }

  touchBubble(id: string) {
    const now = Date.now();
    this.db.prepare(`UPDATE bubbles SET last_accessed_at_ms = ?, recall_count = recall_count + 1 WHERE id = ?`).run(now, id);
  }

  supersedeBubble(oldId: string, newParams: Parameters<UnifiedMemoryStore["addBubble"]>[0]): MemoryBubble {
    const oldRow = this.db.prepare(`SELECT * FROM bubbles WHERE id = ?`).get(oldId) as Record<string, unknown> | undefined;
    const oldBubble = oldRow ? this.rowToBubble(oldRow) : null;
    const newBubble = this.addBubble(newParams);
    this.db.prepare(`UPDATE bubbles SET superseded_by = ? WHERE id = ?`).run(newBubble.id, oldId);
    this.recordHistory(oldId, "bubble", "supersede", oldBubble, { supersededBy: newBubble.id });
    return newBubble;
  }

  // ─── Entities ───

  rowToEntity(row: Record<string, unknown>): Entity {
    return {
      id: row.id as string,
      type: row.type as EntityType,
      name: row.name as string,
      aliases: JSON.parse((row.aliases as string) || "[]"),
      facts: JSON.parse((row.facts as string) || "[]"),
      firstSeenAtMs: row.first_seen_at_ms as number,
      lastSeenAtMs: row.last_seen_at_ms as number,
      mentionCount: row.mention_count as number,
      importance: row.importance as number,
      metadata: JSON.parse((row.metadata as string) || "{}"),
    };
  }

  addEntity(params: {
    type: EntityType;
    name: string;
    aliases?: string[];
    facts?: string[];
    metadata?: Record<string, unknown>;
  }): Entity {
    // Check for existing entity (case-insensitive name or alias match)
    const existing = this.findEntity(params.name, params.type);
    if (existing) {
      const mergedFacts = [...new Set([...existing.facts, ...(params.facts ?? [])])];
      return this.updateEntity(existing.id, { facts: mergedFacts, mentionCount: existing.mentionCount + 1 })!;
    }

    const now = Date.now();
    const entity: Entity = {
      id: genId("ent"),
      type: params.type,
      name: params.name,
      aliases: params.aliases ?? [],
      facts: params.facts ?? [],
      firstSeenAtMs: now,
      lastSeenAtMs: now,
      mentionCount: 1,
      importance: 0.5,
      metadata: params.metadata ?? {},
    };
    this.db.prepare(
      `INSERT INTO entities (id, type, name, aliases, facts, first_seen_at_ms, last_seen_at_ms, mention_count, importance, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(entity.id, entity.type, entity.name, JSON.stringify(entity.aliases), JSON.stringify(entity.facts),
      now, now, 1, entity.importance, JSON.stringify(entity.metadata));
    this.recordHistory(entity.id, "entity", "create", null, entity);
    return entity;
  }

  updateEntity(id: string, patch: Partial<Pick<Entity, "name" | "aliases" | "facts" | "importance" | "mentionCount" | "metadata">>): Entity | undefined {
    const row = this.db.prepare(`SELECT * FROM entities WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {return undefined;}
    const prev = this.rowToEntity(row);
    const now = Date.now();

    const name = patch.name ?? prev.name;
    const aliases = patch.aliases ?? prev.aliases;
    const facts = patch.facts ?? prev.facts;
    const mentionCount = patch.mentionCount ?? prev.mentionCount;
    const metadata = patch.metadata ? { ...prev.metadata, ...patch.metadata } : prev.metadata;

    // Recalculate importance
    const daysSinceFirst = (now - prev.firstSeenAtMs) / 86_400_000;
    const importance = patch.importance ?? Math.min(1, (mentionCount / Math.max(1, daysSinceFirst)) * 0.3 + 0.2);

    this.db.prepare(
      `UPDATE entities SET name=?, aliases=?, facts=?, importance=?, mention_count=?, metadata=?, last_seen_at_ms=? WHERE id=?`,
    ).run(name, JSON.stringify(aliases), JSON.stringify(facts), importance, mentionCount, JSON.stringify(metadata), now, id);

    const updated: Entity = { ...prev, name, aliases, facts, importance, mentionCount, metadata, lastSeenAtMs: now };
    this.recordHistory(id, "entity", "update", prev, updated);
    return updated;
  }

  findEntity(name: string, type?: EntityType): Entity | undefined {
    // Check primary name first
    const nameParam = name.toLowerCase();
    let sql = `SELECT * FROM entities WHERE LOWER(name) = ?`;
    const params: (string | number | null)[] = [nameParam];
    if (type) { sql += " AND type = ?"; params.push(type); }
    let row = this.db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
    if (row) {return this.rowToEntity(row);}

    // Fallback: scan aliases (JSON LIKE match, then verify in JS)
    sql = `SELECT * FROM entities WHERE aliases LIKE ?`;
    const aliasParams: (string | number | null)[] = [`%${name}%`];
    if (type) { sql += " AND type = ?"; aliasParams.push(type); }
    const rows = this.db.prepare(sql).all(...aliasParams) as Record<string, unknown>[];
    for (const r of rows) {
      const entity = this.rowToEntity(r);
      if (entity.aliases.some((a) => a.toLowerCase() === nameParam)) {return entity;}
    }
    return undefined;
  }

  /** Fuzzy entity search — matches partial names, substrings in aliases/facts. Returns ranked results. */
  fuzzyFindEntity(query: string, limit = 5): Entity[] {
    const q = query.toLowerCase().trim();
    if (!q) {return [];}
    // 1. Exact name match
    const exact = this.findEntity(query);
    if (exact) {return [exact];}
    // 2. Substring match on name, aliases, facts
    const like = `%${q}%`;
    const rows = this.db.prepare(
      `SELECT * FROM entities WHERE LOWER(name) LIKE ? OR aliases LIKE ? OR facts LIKE ? ORDER BY importance DESC LIMIT ?`,
    ).all(like, like, like, limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEntity(r));
  }

  /** Full graph summary — all entities with their relationships. Useful for "show me everything you know". */
  graphSummary(maxEntities = 30): { entities: (Entity & { relationships: Relationship[] })[]; totalEntities: number; totalRelationships: number } {
    const allEntities = this.db.prepare(
      `SELECT * FROM entities ORDER BY importance DESC LIMIT ?`,
    ).all(maxEntities) as Record<string, unknown>[];
    const totalEntities = (this.db.prepare(`SELECT COUNT(*) as c FROM entities`).get() as { c: number }).c;
    const totalRelationships = (this.db.prepare(`SELECT COUNT(*) as c FROM relationships`).get() as { c: number }).c;

    const entities = allEntities.map((r) => {
      const entity = this.rowToEntity(r);
      const relationships = this.getRelationships(entity.id);
      return { ...entity, relationships };
    });
    return { entities, totalEntities, totalRelationships };
  }

  /** Deep detail on a single entity — all facts, relationships (with names), linked bubbles. */
  entityDetail(entityId: string): { entity: Entity; relationships: { relationship: Relationship; otherEntity: Entity | null }[]; linkedBubbles: MemoryBubble[] } | null {
    const row = this.db.prepare(`SELECT * FROM entities WHERE id = ?`).get(entityId) as Record<string, unknown> | undefined;
    if (!row) {return null;}
    const entity = this.rowToEntity(row);
    const rels = this.getRelationships(entityId);
    const relationships = rels.map((rel) => {
      const otherId = rel.fromEntityId === entityId ? rel.toEntityId : rel.fromEntityId;
      const otherRow = this.db.prepare(`SELECT * FROM entities WHERE id = ?`).get(otherId) as Record<string, unknown> | undefined;
      return { relationship: rel, otherEntity: otherRow ? this.rowToEntity(otherRow) : null };
    });
    // Find bubbles that reference this entity
    const bubbleRows = this.db.prepare(
      `SELECT * FROM bubbles WHERE entity_ids LIKE ? AND superseded_by IS NULL ORDER BY created_at_ms DESC LIMIT 20`,
    ).all(`%"${entityId}"%`) as Record<string, unknown>[];
    const linkedBubbles = bubbleRows.map((r) => this.rowToBubble(r));
    return { entity, relationships, linkedBubbles };
  }

  queryEntities(query: EntityQuery): Entity[] {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];
    if (query.types?.length) {
      conditions.push(`type IN (${query.types.map(() => "?").join(",")})`);
      params.push(...query.types);
    }
    if (query.minImportance != null) { conditions.push("importance >= ?"); params.push(query.minImportance); }
    if (query.text) {
      conditions.push("(LOWER(name) LIKE ? OR aliases LIKE ? OR facts LIKE ?)");
      const like = `%${query.text.toLowerCase()}%`;
      params.push(like, like, like);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 50;
    params.push(limit);
    const rows = this.db.prepare(`SELECT * FROM entities ${where} ORDER BY importance DESC LIMIT ?`).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEntity(r));
  }

  // ─── Relationships ───

  private rowToRelationship(row: Record<string, unknown>): Relationship {
    return {
      id: row.id as string,
      fromEntityId: row.from_entity_id as string,
      toEntityId: row.to_entity_id as string,
      type: row.type as RelationType,
      context: (row.context as string) ?? undefined,
      strength: row.strength as number,
      createdAtMs: row.created_at_ms as number,
      lastReinforcedAtMs: row.last_reinforced_at_ms as number,
    };
  }

  addRelationship(params: {
    fromEntityId: string;
    toEntityId: string;
    type: RelationType;
    context?: string;
    strength?: number;
  }): Relationship {
    // Check for existing
    const existing = this.db.prepare(
      `SELECT * FROM relationships WHERE from_entity_id = ? AND to_entity_id = ? AND type = ?`,
    ).get(params.fromEntityId, params.toEntityId, params.type) as Record<string, unknown> | undefined;

    if (existing) {
      const now = Date.now();
      const newStrength = Math.min(1, (existing.strength as number) + 0.1);
      this.db.prepare(
        `UPDATE relationships SET strength = ?, last_reinforced_at_ms = ?${params.context ? ", context = ?" : ""} WHERE id = ?`,
      ).run(...(params.context ? [newStrength, now, params.context, existing.id as string] : [newStrength, now, existing.id as string]));
      return this.rowToRelationship({ ...existing, strength: newStrength, last_reinforced_at_ms: now, ...(params.context ? { context: params.context } : {}) });
    }

    const now = Date.now();
    const rel: Relationship = {
      id: genId("rel"),
      fromEntityId: params.fromEntityId,
      toEntityId: params.toEntityId,
      type: params.type,
      context: params.context,
      strength: params.strength ?? 0.5,
      createdAtMs: now,
      lastReinforcedAtMs: now,
    };
    this.db.prepare(
      `INSERT INTO relationships (id, from_entity_id, to_entity_id, type, context, strength, created_at_ms, last_reinforced_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(rel.id, rel.fromEntityId, rel.toEntityId, rel.type, rel.context ?? null, rel.strength, now, now);
    this.recordHistory(rel.id, "relationship", "create", null, rel);
    return rel;
  }

  getRelationships(entityId: string): Relationship[] {
    const rows = this.db.prepare(
      `SELECT * FROM relationships WHERE from_entity_id = ? OR to_entity_id = ?`,
    ).all(entityId, entityId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToRelationship(r));
  }

  /** Multi-hop graph traversal using recursive CTE. */
  getRelatedEntities(entityId: string, depth = 2): Entity[] {
    const rows = this.db.prepare(`
      WITH RECURSIVE connected(eid, d) AS (
        SELECT ?, 0
        UNION
        SELECT CASE WHEN r.from_entity_id = connected.eid THEN r.to_entity_id ELSE r.from_entity_id END, connected.d + 1
        FROM relationships r JOIN connected ON (r.from_entity_id = connected.eid OR r.to_entity_id = connected.eid)
        WHERE connected.d < ?
      )
      SELECT DISTINCT e.* FROM entities e JOIN connected c ON e.id = c.eid WHERE e.id != ?
    `).all(entityId, depth, entityId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEntity(r));
  }

  // ─── Preferences ───

  private rowToPreference(row: Record<string, unknown>): Preference {
    return {
      id: row.id as string,
      category: row.category as PreferenceCategory,
      subject: row.subject as string,
      value: row.value as string,
      confidence: row.confidence as number,
      reinforcements: row.reinforcements as number,
      firstSeenAtMs: row.first_seen_at_ms as number,
      lastSeenAtMs: row.last_seen_at_ms as number,
    };
  }

  setPreference(params: {
    category: PreferenceCategory;
    subject: string;
    value: string;
    confidence?: number;
  }): Preference {
    const existing = this.db.prepare(
      `SELECT * FROM preferences WHERE category = ? AND LOWER(subject) = ?`,
    ).get(params.category, params.subject.toLowerCase()) as Record<string, unknown> | undefined;

    if (existing) {
      const now = Date.now();
      const newConf = Math.min(1, (existing.confidence as number) + 0.15);
      const newReinf = (existing.reinforcements as number) + 1;
      this.db.prepare(
        `UPDATE preferences SET value = ?, confidence = ?, reinforcements = ?, last_seen_at_ms = ? WHERE id = ?`,
      ).run(params.value, newConf, newReinf, now, existing.id as string);
      const prev = this.rowToPreference(existing);
      const updated = { ...prev, value: params.value, confidence: newConf, reinforcements: newReinf, lastSeenAtMs: now };
      this.recordHistory(prev.id, "preference", "update", prev, updated);
      return updated;
    }

    const now = Date.now();
    const pref: Preference = {
      id: genId("pref"),
      category: params.category,
      subject: params.subject,
      value: params.value,
      confidence: params.confidence ?? 0.5,
      reinforcements: 1,
      firstSeenAtMs: now,
      lastSeenAtMs: now,
    };
    this.db.prepare(
      `INSERT INTO preferences (id, category, subject, value, confidence, reinforcements, first_seen_at_ms, last_seen_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(pref.id, pref.category, pref.subject, pref.value, pref.confidence, 1, now, now);
    this.recordHistory(pref.id, "preference", "create", null, pref);
    return pref;
  }

  getPreferences(category?: PreferenceCategory): Preference[] {
    const sql = category
      ? `SELECT * FROM preferences WHERE category = ? ORDER BY confidence DESC`
      : `SELECT * FROM preferences ORDER BY confidence DESC`;
    const rows = (category ? this.db.prepare(sql).all(category) : this.db.prepare(sql).all()) as Record<string, unknown>[];
    return rows.map((r) => this.rowToPreference(r));
  }

  // ─── User Profile ───

  getProfile(): UserProfile {
    const row = this.db.prepare(`SELECT data FROM user_profile WHERE id = 'default'`).get() as { data: string } | undefined;
    if (row) {return JSON.parse(row.data) as UserProfile;}
    return emptyProfile();
  }

  updateProfile(patch: Partial<UserProfile>) {
    const current = this.getProfile();
    const updated: UserProfile = { ...current, ...patch, lastUpdatedAtMs: Date.now() };
    this.db.prepare(
      `INSERT INTO user_profile (id, data, last_updated_at_ms) VALUES ('default', ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, last_updated_at_ms = excluded.last_updated_at_ms`,
    ).run(JSON.stringify(updated), updated.lastUpdatedAtMs);
  }

  // ─── History ───

  getHistory(targetId: string): Array<{ id: string; action: string; targetType: string; previousValue: unknown; newValue: unknown; createdAtMs: number }> {
    const rows = this.db.prepare(
      `SELECT * FROM memory_history WHERE target_id = ? ORDER BY created_at_ms DESC`,
    ).all(targetId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      action: r.action as string,
      targetType: r.target_type as string,
      previousValue: r.previous_value ? JSON.parse(r.previous_value as string) : null,
      newValue: r.new_value ? JSON.parse(r.new_value as string) : null,
      createdAtMs: r.created_at_ms as number,
    }));
  }

  // ─── Node Scan Tracking ───

  getLastNodeScanAt(): number | undefined {
    const row = this.db.prepare(
      `SELECT created_at_ms FROM memory_history WHERE target_type = 'system' AND action = 'node-scan' ORDER BY created_at_ms DESC LIMIT 1`,
    ).get() as { created_at_ms: number } | undefined;
    return row?.created_at_ms;
  }

  recordNodeScan() {
    this.db.prepare(
      `INSERT INTO memory_history (id, target_id, target_type, action, previous_value, new_value, created_at_ms)
       VALUES (?, 'system', 'system', 'node-scan', NULL, NULL, ?)`,
    ).run(genId("hist"), Date.now());
  }

  // ─── Proactive Surfacing ───

  surfaceRelevant(context: string, limit = 5): {
    bubbles: MemoryBubble[];
    entities: Entity[];
    connections: string[];
  } {
    const words = context.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) {return { bubbles: [], entities: [], connections: [] };}

    const allBubbles = this.queryBubbles({ limit: 200 });
    const scoredBubbles = allBubbles.map((b) => {
      const contentLower = b.content.toLowerCase();
      const matchCount = words.filter((w) => contentLower.includes(w)).length;
      if (matchCount === 0) {return { bubble: b, score: 0 };}
      const recencyBoost = Math.max(0, 1 - (Date.now() - b.createdAtMs) / (30 * 86_400_000));
      return { bubble: b, score: matchCount * 0.6 + b.importance * 0.2 + recencyBoost * 0.2 };
    }).filter((s) => s.score > 0);

    scoredBubbles.sort((a, b) => b.score - a.score);
    const topBubbles = scoredBubbles.slice(0, limit).map((s) => s.bubble);

    const entityIds = new Set(topBubbles.flatMap((b) => b.entityIds));
    const entities: Entity[] = [];
    for (const eid of entityIds) {
      const row = this.db.prepare(`SELECT * FROM entities WHERE id = ?`).get(eid) as Record<string, unknown> | undefined;
      if (row) {entities.push(this.rowToEntity(row));}
    }

    const connections: string[] = [];
    for (const entity of entities.slice(0, 3)) {
      const rels = this.getRelationships(entity.id).slice(0, 2);
      for (const rel of rels) {
        const otherId = rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId;
        const otherRow = this.db.prepare(`SELECT * FROM entities WHERE id = ?`).get(otherId) as Record<string, unknown> | undefined;
        if (otherRow) {
          const other = this.rowToEntity(otherRow);
          connections.push(`${entity.name} ${rel.type} ${other.name}${rel.context ? ` (${rel.context})` : ""}`);
        }
      }
    }

    return { bubbles: topBubbles, entities, connections };
  }

  buildContextPrompt(maxChars = 2000): string | null {
    const bCount = (this.db.prepare(`SELECT COUNT(*) as c FROM bubbles WHERE superseded_by IS NULL`).get() as { c: number }).c;
    const eCount = (this.db.prepare(`SELECT COUNT(*) as c FROM entities`).get() as { c: number }).c;
    if (bCount === 0 && eCount === 0) {return null;}

    const lines: string[] = [];
    lines.push("[Memory Bubbles — structured context]");

    const topEntities = this.queryEntities({ limit: 8 });
    if (topEntities.length > 0) {
      lines.push("\nKey entities:");
      for (const e of topEntities) {
        const factsStr = e.facts.slice(0, 3).join("; ");
        lines.push(`- ${e.name} (${e.type})${factsStr ? `: ${factsStr}` : ""}`);
      }
    }

    const recentBubbles = this.db.prepare(
      `SELECT * FROM bubbles WHERE superseded_by IS NULL AND importance >= 0.4 ORDER BY created_at_ms DESC LIMIT 10`,
    ).all() as Record<string, unknown>[];
    if (recentBubbles.length > 0) {
      lines.push("\nRecent memories:");
      for (const row of recentBubbles) {
        const b = this.rowToBubble(row);
        const date = new Date(b.createdAtMs).toISOString().slice(0, 10);
        lines.push(`- [${date}] [${b.category}] ${b.content.slice(0, 120)}`);
      }
    }

    const prefs = this.getPreferences().filter((p) => p.confidence >= 0.6).slice(0, 8);
    if (prefs.length > 0) {
      lines.push("\nKnown preferences:");
      for (const p of prefs) {
        lines.push(`- ${p.subject}: ${p.value}`);
      }
    }

    const profile = this.getProfile();
    if (profile.activeProjects.length > 0) {
      lines.push(`\nActive projects: ${profile.activeProjects.join(", ")}`);
    }
    if (profile.goals.length > 0) {
      lines.push(`Goals: ${profile.goals.join(", ")}`);
    }

    const text = lines.join("\n");
    return text.length > maxChars ? text.slice(0, maxChars) + "\n..." : text;
  }

  // ─── Delete ───

  deleteBubble(id: string): boolean {
    const row = this.db.prepare(`SELECT * FROM bubbles WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {return false;}
    const bubble = this.rowToBubble(row);
    this.db.prepare(`DELETE FROM bubbles WHERE id = ?`).run(id);
    if (this.ftsAvailable) {
      try { this.db.prepare(`DELETE FROM bubbles_fts WHERE id = ?`).run(id); } catch { /* fts row may not exist */ }
    }
    this.recordHistory(id, "bubble", "delete", bubble, null);
    return true;
  }

  deleteEntity(id: string): boolean {
    const row = this.db.prepare(`SELECT * FROM entities WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {return false;}
    this.db.prepare(`DELETE FROM entities WHERE id = ?`).run(id);
    this.db.prepare(`DELETE FROM relationships WHERE from_entity_id = ? OR to_entity_id = ?`).run(id, id);
    this.recordHistory(id, "entity", "delete", this.rowToEntity(row), null);
    return true;
  }

  deletePreference(id: string): boolean {
    const row = this.db.prepare(`SELECT * FROM preferences WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {return false;}
    this.db.prepare(`DELETE FROM preferences WHERE id = ?`).run(id);
    this.recordHistory(id, "preference", "delete", this.rowToPreference(row), null);
    return true;
  }

  // ─── Importance Decay ───

  /** Exponential decay on bubble importance based on time since last access. */
  decayImportance(halfLifeDays = 30) {
    const now = Date.now();
    const lambda = Math.LN2 / (halfLifeDays * 86_400_000);
    // Apply decay: importance *= exp(-lambda * (now - lastAccess))
    this.db.prepare(`
      UPDATE bubbles SET importance = importance * EXP(-${lambda} * (${now} - COALESCE(last_accessed_at_ms, created_at_ms)))
      WHERE superseded_by IS NULL
    `).run();
  }

  // ─── Stats ───

  stats(): { bubbles: number; entities: number; relationships: number; preferences: number; topEntities: { name: string; type: string; mentions: number }[] } {
    const bCount = (this.db.prepare(`SELECT COUNT(*) as c FROM bubbles WHERE superseded_by IS NULL`).get() as { c: number }).c;
    const eCount = (this.db.prepare(`SELECT COUNT(*) as c FROM entities`).get() as { c: number }).c;
    const rCount = (this.db.prepare(`SELECT COUNT(*) as c FROM relationships`).get() as { c: number }).c;
    const pCount = (this.db.prepare(`SELECT COUNT(*) as c FROM preferences`).get() as { c: number }).c;
    const topRows = this.db.prepare(`SELECT name, type, mention_count FROM entities ORDER BY mention_count DESC LIMIT 10`).all() as Array<{ name: string; type: string; mention_count: number }>;
    return {
      bubbles: bCount, entities: eCount, relationships: rCount, preferences: pCount,
      topEntities: topRows.map((r) => ({ name: r.name, type: r.type, mentions: r.mention_count })),
    };
  }

  // ─── Migration ───

  /** Import data from a legacy JSON bubble store file. */
  migrateFromJson(jsonStorePath: string) {
    if (!fs.existsSync(jsonStorePath)) {return;}
    const raw = fs.readFileSync(jsonStorePath, "utf-8");
    const store = JSON.parse(raw) as MemoryBubbleStore;
    if (store.version !== 2) {return;}

    const insertBubble = this.db.prepare(
      `INSERT OR IGNORE INTO bubbles (id, content, category, source, entity_ids, linked_bubble_ids, tags, importance, session_key, created_at_ms, last_accessed_at_ms, recall_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertFts = this.ftsAvailable ? this.db.prepare(`INSERT OR IGNORE INTO bubbles_fts (id, content) VALUES (?, ?)`) : null;
    const insertEntity = this.db.prepare(
      `INSERT OR IGNORE INTO entities (id, type, name, aliases, facts, first_seen_at_ms, last_seen_at_ms, mention_count, importance, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertRel = this.db.prepare(
      `INSERT OR IGNORE INTO relationships (id, from_entity_id, to_entity_id, type, context, strength, created_at_ms, last_reinforced_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPref = this.db.prepare(
      `INSERT OR IGNORE INTO preferences (id, category, subject, value, confidence, reinforcements, first_seen_at_ms, last_seen_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.db.exec("BEGIN");
    try {
      for (const b of store.bubbles) {
        insertBubble.run(b.id, b.content, b.category, b.source, JSON.stringify(b.entityIds), JSON.stringify(b.linkedBubbleIds),
          JSON.stringify(b.tags), b.importance, b.sessionKey ?? null, b.createdAtMs, b.lastAccessedAtMs ?? null, b.recallCount);
        insertFts?.run(b.id, b.content);
      }
      for (const e of store.entities) {
        insertEntity.run(e.id, e.type, e.name, JSON.stringify(e.aliases), JSON.stringify(e.facts),
          e.firstSeenAtMs, e.lastSeenAtMs, e.mentionCount, e.importance, JSON.stringify(e.metadata));
      }
      for (const r of store.relationships) {
        insertRel.run(r.id, r.fromEntityId, r.toEntityId, r.type, r.context ?? null, r.strength, r.createdAtMs, r.lastReinforcedAtMs);
      }
      for (const p of store.preferences) {
        insertPref.run(p.id, p.category, p.subject, p.value, p.confidence, p.reinforcements, p.firstSeenAtMs, p.lastSeenAtMs);
      }
      // Migrate user profile
      this.updateProfile(store.userProfile);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}
