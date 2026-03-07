import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { OniAIConfig } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import { UnifiedMemoryStore } from "../../memory/unified-store.js";
import { resolveStorePath as resolveJsonStorePath } from "../../memory/bubbles/store.js";
import { resolveSessionAgentId, resolveAgentWorkspaceDir } from "../agent-scope.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam } from "./common.js";

const MemoryBubbleSchema = Type.Object({
  action: Type.String(),
  content: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  source: Type.Optional(Type.String()),
  entity_ids: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  importance: Type.Optional(Type.Number()),
  session_key: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
  // Entity params
  entity_type: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  aliases: Type.Optional(Type.Array(Type.String())),
  facts: Type.Optional(Type.Array(Type.String())),
  // Relationship params
  from_entity_id: Type.Optional(Type.String()),
  to_entity_id: Type.Optional(Type.String()),
  relation_type: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  strength: Type.Optional(Type.Number()),
  // Preference params
  pref_category: Type.Optional(Type.String()),
  subject: Type.Optional(Type.String()),
  value: Type.Optional(Type.String()),
  confidence: Type.Optional(Type.Number()),
  // Query params
  text: Type.Optional(Type.String()),
  categories: Type.Optional(Type.Array(Type.String())),
  sources: Type.Optional(Type.Array(Type.String())),
  entity_id: Type.Optional(Type.String()),
  after: Type.Optional(Type.Number()),
  before: Type.Optional(Type.Number()),
  min_importance: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Number()),
  sort_by: Type.Optional(Type.String()),
  // Entity query params
  types: Type.Optional(Type.Array(Type.String())),
  // Profile params
  active_projects: Type.Optional(Type.Array(Type.String())),
  interests: Type.Optional(Type.Array(Type.String())),
  goals: Type.Optional(Type.Array(Type.String())),
  // Graph traversal
  depth: Type.Optional(Type.Number()),
  // Patch for update
  patch: Type.Optional(Type.Object({})),
});

function resolveUnifiedDbPath(cfg: OniAIConfig, agentId: string): string {
  const stateDir = resolveStateDir(process.env, os.homedir);
  return path.join(stateDir, "memory", `${agentId}-bubbles.sqlite`);
}

const STORE_CACHE = new Map<string, UnifiedMemoryStore>();

function getOrCreateStore(cfg: OniAIConfig, agentId: string): UnifiedMemoryStore {
  const dbPath = resolveUnifiedDbPath(cfg, agentId);
  const cached = STORE_CACHE.get(dbPath);
  if (cached) {return cached;}

  const store = new UnifiedMemoryStore(dbPath);

  // Auto-migrate from legacy JSON store if it exists and DB is empty
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const jsonPath = resolveJsonStorePath(workspaceDir);
  const stats = store.stats();
  if (stats.bubbles === 0 && stats.entities === 0) {
    try {
      store.migrateFromJson(jsonPath);
    } catch {
      // migration failure is non-fatal
    }
  }

  STORE_CACHE.set(dbPath, store);
  return store;
}

export function createMemoryBubbleTool(options: {
  config?: OniAIConfig;
  agentSessionKey?: string;
  workspaceDir?: string;
}): AnyAgentTool | null {
  const cfg = options.config;
  if (!cfg) {return null;}

  const agentId = resolveSessionAgentId({
    sessionKey: options.agentSessionKey,
    config: cfg,
  });

  return {
    label: "Memory Bubble",
    name: "memory_bubble",
    description:
      "Structured memory system for persistent facts, entities, relationships, preferences, and user profile. " +
      "Actions: add_bubble, query_bubbles, delete_bubble, " +
      "add_entity, find_entity, fuzzy_find_entity, query_entities, delete_entity, " +
      "add_relationship, get_relationships, graph_traverse, graph_summary, entity_detail, " +
      "set_preference, get_preferences, delete_preference, " +
      "get_profile, update_profile, stats, decay_importance. " +
      "Use this to remember important facts, track entities (people/projects/tools), " +
      "build a knowledge graph with relationships, and maintain user preferences across sessions. " +
      "IMPORTANT: Always find_entity before add_entity to avoid duplicates. " +
      "Auto-extract entities and relationships from every conversation.",
    parameters: MemoryBubbleSchema,
    execute: async (_toolCallId, params) => {
      const action = readStringParam(params as Record<string, unknown>, "action", { required: true });

      try {
        const store = getOrCreateStore(cfg, agentId);
        return jsonResult(executeAction(store, action, params as Record<string, unknown>, agentId));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ error: message });
      }
    },
  };
}

function executeAction(
  store: UnifiedMemoryStore,
  action: string,
  params: Record<string, unknown>,
  agentId: string,
): unknown {
  switch (action) {
    // ─── Bubbles ───
    case "add_bubble": {
      const content = readStringParam(params, "content", { required: true });
      const category = readStringParam(params, "category", { required: true }) as Parameters<UnifiedMemoryStore["addBubble"]>[0]["category"];
      const source = (readStringParam(params, "source") || "agent-observation") as Parameters<UnifiedMemoryStore["addBubble"]>[0]["source"];
      const entityIds = params.entity_ids as string[] | undefined;
      const tags = params.tags as string[] | undefined;
      const importance = readNumberParam(params, "importance") ?? undefined;
      const sessionKey = readStringParam(params, "session_key") ?? undefined;
      const bubble = store.addBubble({
        content,
        category,
        source,
        entityIds,
        tags,
        importance,
        sessionKey,
        agentId,
      });
      return { ok: true, bubble };
    }

    case "query_bubbles": {
      const text = readStringParam(params, "text") ?? undefined;
      const categories = params.categories as string[] | undefined;
      const sources = params.sources as string[] | undefined;
      const entityId = readStringParam(params, "entity_id") ?? undefined;
      const tags = params.tags as string[] | undefined;
      const after = readNumberParam(params, "after") ?? undefined;
      const before = readNumberParam(params, "before") ?? undefined;
      const minImportance = readNumberParam(params, "min_importance") ?? undefined;
      const limit = readNumberParam(params, "limit") ?? undefined;
      const sortBy = readStringParam(params, "sort_by") ?? undefined;
      const bubbles = store.queryBubbles(
        {
          text,
          categories: categories as Parameters<UnifiedMemoryStore["queryBubbles"]>[0]["categories"],
          sources: sources as Parameters<UnifiedMemoryStore["queryBubbles"]>[0]["sources"],
          entityId,
          tags,
          after,
          before,
          minImportance,
          limit,
          sortBy: sortBy as Parameters<UnifiedMemoryStore["queryBubbles"]>[0]["sortBy"],
        },
        { agentId },
      );
      // Touch returned bubbles to track recall
      for (const b of bubbles) {store.touchBubble(b.id);}
      return { ok: true, count: bubbles.length, bubbles };
    }

    case "delete_bubble": {
      const id = readStringParam(params, "id", { required: true });
      const deleted = store.deleteBubble(id);
      return { ok: deleted, id };
    }

    // ─── Entities ───
    case "add_entity": {
      const type = readStringParam(params, "entity_type", { required: true }) as Parameters<UnifiedMemoryStore["addEntity"]>[0]["type"];
      const name = readStringParam(params, "name", { required: true });
      const aliases = params.aliases as string[] | undefined;
      const facts = params.facts as string[] | undefined;
      const entity = store.addEntity({ type, name, aliases, facts });
      return { ok: true, entity };
    }

    case "find_entity": {
      const name = readStringParam(params, "name", { required: true });
      const type = readStringParam(params, "entity_type") as Parameters<UnifiedMemoryStore["addEntity"]>[0]["type"] | undefined;
      const entity = store.findEntity(name, type ?? undefined);
      return entity ? { ok: true, entity } : { ok: false, message: "entity not found" };
    }

    case "query_entities": {
      const text = readStringParam(params, "text") ?? undefined;
      const types = params.types as string[] | undefined;
      const minImportance = readNumberParam(params, "min_importance") ?? undefined;
      const limit = readNumberParam(params, "limit") ?? undefined;
      const entities = store.queryEntities({
        text,
        types: types as Parameters<UnifiedMemoryStore["queryEntities"]>[0]["types"],
        minImportance,
        limit,
      });
      return { ok: true, count: entities.length, entities };
    }

    case "delete_entity": {
      const id = readStringParam(params, "id", { required: true });
      const deleted = store.deleteEntity(id);
      return { ok: deleted, id };
    }

    // ─── Relationships ───
    case "add_relationship": {
      const fromEntityId = readStringParam(params, "from_entity_id", { required: true });
      const toEntityId = readStringParam(params, "to_entity_id", { required: true });
      const type = readStringParam(params, "relation_type", { required: true }) as Parameters<UnifiedMemoryStore["addRelationship"]>[0]["type"];
      const context = readStringParam(params, "context") ?? undefined;
      const strength = readNumberParam(params, "strength") ?? undefined;
      const relationship = store.addRelationship({ fromEntityId, toEntityId, type, context, strength });
      return { ok: true, relationship };
    }

    case "get_relationships": {
      const entityId = readStringParam(params, "entity_id", { required: true });
      const relationships = store.getRelationships(entityId);
      return { ok: true, count: relationships.length, relationships };
    }

    case "graph_traverse": {
      const entityId = readStringParam(params, "entity_id", { required: true });
      const depth = readNumberParam(params, "depth") ?? 2;
      const related = store.getRelatedEntities(entityId, Math.min(depth, 4));
      return { ok: true, count: related.length, entities: related };
    }

    case "graph_summary": {
      const maxEntities = readNumberParam(params, "limit") ?? 30;
      const summary = store.graphSummary(Math.min(maxEntities, 50));
      return { ok: true, ...summary };
    }

    case "entity_detail": {
      const entityId = readStringParam(params, "entity_id") ?? readStringParam(params, "id");
      if (!entityId) {return { error: "entity_id or id is required" };}
      const detail = store.entityDetail(entityId);
      if (!detail) {return { ok: false, message: "entity not found" };}
      return { ok: true, ...detail };
    }

    case "fuzzy_find_entity": {
      const query = readStringParam(params, "text") ?? readStringParam(params, "name") ?? "";
      const limit = readNumberParam(params, "limit") ?? 5;
      const entities = store.fuzzyFindEntity(query, limit);
      return { ok: true, count: entities.length, entities };
    }

    // ─── Preferences ───
    case "set_preference": {
      const category = readStringParam(params, "pref_category", { required: true }) as Parameters<UnifiedMemoryStore["setPreference"]>[0]["category"];
      const subject = readStringParam(params, "subject", { required: true });
      const value = readStringParam(params, "value", { required: true });
      const confidence = readNumberParam(params, "confidence") ?? undefined;
      const pref = store.setPreference({ category, subject, value, confidence });
      return { ok: true, preference: pref };
    }

    case "get_preferences": {
      const category = readStringParam(params, "pref_category") as Parameters<UnifiedMemoryStore["getPreferences"]>[0] | undefined;
      const prefs = store.getPreferences(category ?? undefined);
      return { ok: true, count: prefs.length, preferences: prefs };
    }

    case "delete_preference": {
      const id = readStringParam(params, "id", { required: true });
      const deleted = store.deletePreference(id);
      return { ok: deleted, id };
    }

    // ─── User Profile ───
    case "get_profile": {
      const profile = store.getProfile();
      return { ok: true, profile };
    }

    case "update_profile": {
      const patch: Record<string, unknown> = {};
      const name = readStringParam(params, "name");
      if (name) {patch.name = name;}
      const activeProjects = params.active_projects as string[] | undefined;
      if (activeProjects) {patch.activeProjects = activeProjects;}
      const interests = params.interests as string[] | undefined;
      if (interests) {patch.interests = interests;}
      const goals = params.goals as string[] | undefined;
      if (goals) {patch.goals = goals;}
      store.updateProfile(patch);
      return { ok: true, profile: store.getProfile() };
    }

    // ─── Stats & Maintenance ───
    case "stats": {
      return { ok: true, ...store.stats() };
    }

    case "decay_importance": {
      store.decayImportance();
      return { ok: true, message: "importance decay applied" };
    }

    default:
      return {
        error: `Unknown action: ${action}. Valid actions: add_bubble, query_bubbles, delete_bubble, add_entity, find_entity, fuzzy_find_entity, query_entities, delete_entity, add_relationship, get_relationships, graph_traverse, graph_summary, entity_detail, set_preference, get_preferences, delete_preference, get_profile, update_profile, stats, decay_importance`,
      };
  }
}
