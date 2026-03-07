/**
 * Post-turn auto-extraction: automatically extract entities, relationships,
 * and preferences from conversation text and populate the UnifiedMemoryStore.
 *
 * This runs after each agent turn to build a knowledge graph from natural
 * conversation, similar to how human memory works — extracting people,
 * projects, preferences, and relationships without explicit user commands.
 */

import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import type { OniAIConfig } from "../../config/config.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { UnifiedMemoryStore } from "../unified-store.js";
import { resolveStorePath } from "./store.js";
import type { EntityType, RelationType } from "./types.js";

const STORE_CACHE = new Map<string, UnifiedMemoryStore>();

/** Resolve or create a UnifiedMemoryStore for an agent. */
function getStore(cfg: OniAIConfig, agentId: string): UnifiedMemoryStore {
  const stateDir = resolveStateDir(process.env, os.homedir);
  const dbPath = path.join(stateDir, "memory", `${agentId}-bubbles.sqlite`);
  const cached = STORE_CACHE.get(dbPath);
  if (cached) return cached;

  const store = new UnifiedMemoryStore(dbPath);
  // Auto-migrate from legacy JSON
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const jsonPath = resolveStorePath(workspaceDir);
  const stats = store.stats();
  if (stats.bubbles === 0 && stats.entities === 0) {
    try { store.migrateFromJson(jsonPath); } catch { /* non-fatal */ }
  }
  STORE_CACHE.set(dbPath, store);
  return store;
}

// ─── Pattern-based entity/relationship extractors ───

// Name pattern: capitalized word(s), e.g. "Chioni", "Mr S", "Jamie Lee"
// MUST NOT use 'i' flag — [A-Z] must only match actual uppercase to distinguish names from common words
const NAME_PAT = `[A-Z][a-zA-Z]*(?:\\s+[A-Z][a-zA-Z]*)?`;

/** Relationship patterns: "my <relation> <Name>" or "<Name> is my <relation>" */
// NOTE: use 'g' flag only (NOT 'gi') so [A-Z] only matches uppercase letters (names)
const RELATIONSHIP_PATTERNS: { pattern: RegExp; relation: RelationType; entityType: EntityType }[] = [
  // "my wife/husband/partner <Name>" (My/my)
  { pattern: new RegExp(`\\b[Mm]y\\s+(wife|husband|spouse|partner)\\s+(?:is\\s+)?(${NAME_PAT})\\b`, "g"), relation: "spouse", entityType: "person" },
  // "my son/daughter/child <Name>"
  { pattern: new RegExp(`\\b[Mm]y\\s+(son|daughter|child|kid)\\s+(?:is\\s+)?(${NAME_PAT})\\b`, "g"), relation: "parent", entityType: "person" },
  // "my brother/sister/sibling <Name>"
  { pattern: new RegExp(`\\b[Mm]y\\s+(brother|sister|sibling)\\s+(?:is\\s+)?(${NAME_PAT})\\b`, "g"), relation: "related-to", entityType: "person" },
  // "my friend/colleague/boss/manager <Name>"
  { pattern: new RegExp(`\\b[Mm]y\\s+(friend|colleague|boss|manager|coworker|mentor)\\s+(?:is\\s+)?(${NAME_PAT})\\b`, "g"), relation: "knows", entityType: "person" },
  // "<Name> is my wife/husband/partner"
  { pattern: new RegExp(`\\b(${NAME_PAT})\\s+is\\s+[Mm]y\\s+(wife|husband|spouse|partner)\\b`, "g"), relation: "spouse", entityType: "person" },
  // "<Name> is my son/daughter"
  { pattern: new RegExp(`\\b(${NAME_PAT})\\s+is\\s+[Mm]y\\s+(son|daughter|child|kid)\\b`, "g"), relation: "parent", entityType: "person" },
  // "I have <N> kids/children: <Name> and <Name>"
  { pattern: new RegExp(`\\b(?:kids?|children)\\s+(?:named?\\s+)?(${NAME_PAT})\\s+and\\s+(${NAME_PAT})\\b`, "g"), relation: "parent", entityType: "person" },
];

/** Preference patterns */
const PREFERENCE_PATTERNS: { pattern: RegExp; category: "personal" | "technical" | "communication" | "workflow" }[] = [
  { pattern: /\b(?:I|i)\s+(?:prefer|like|love|enjoy|want|use)\s+(.{5,80})/g, category: "personal" },
  { pattern: /\b(?:I|i)\s+(?:always|usually|typically)\s+(.{5,80})/g, category: "workflow" },
  // "call me Mr S", "my name is John", etc. — allow uppercase single-letter surnames
  { pattern: /\b(?:call me|my name is|I'm|i am|I go by)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)?)(?:\s|$|[.,!?])/gi, category: "personal" },
];

export type ExtractionResult = {
  entities: { name: string; type: EntityType; facts: string[]; relation?: { type: RelationType; context: string } }[];
  preferences: { category: string; subject: string; value: string }[];
  facts: { content: string; category: string; importance: number }[];
};

/** Extract entities, relationships, and preferences from text. */
export function extractFromText(text: string): ExtractionResult {
  const entities: ExtractionResult["entities"] = [];
  const preferences: ExtractionResult["preferences"] = [];
  const facts: ExtractionResult["facts"] = [];
  const seenEntityNames = new Set<string>();

  // Extract relationship-based entities
  for (const { pattern, relation, entityType } of RELATIONSHIP_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Handle "my X <Name>" vs "<Name> is my X" patterns
      const relationWord = match[1]!;
      let name: string;
      if (/kids?|children/i.test(match[0]!) && match[1] && match[2]) {
        // "kids named X and Y" — extract both names from groups 1 and 2
        const name1 = match[1]!.trim();
        const name2 = match[2]!.trim();
        for (const n of [name1, name2]) {
          if (n.length >= 2 && !seenEntityNames.has(n.toLowerCase())) {
            seenEntityNames.add(n.toLowerCase());
            entities.push({
              name: n,
              type: entityType,
              facts: [`Child of owner`],
              relation: { type: "child", context: `child` },
            });
          }
        }
        continue;
      } else if (/^[A-Z]/.test(relationWord)) {
        // "<Name> is my <relation>" pattern — name is in group 1
        name = relationWord.trim();
      } else {
        // "my <relation> <Name>" pattern — name is in group 2
        name = (match[2] ?? "").trim();
      }

      if (name.length < 2 || seenEntityNames.has(name.toLowerCase())) continue;
      seenEntityNames.add(name.toLowerCase());

      const cleanRelation = match[0]!.replace(name, "").replace(/\bmy\s+/i, "").replace(/\s+is\s+/i, "").trim();
      entities.push({
        name,
        type: entityType,
        facts: [`${cleanRelation} of owner`],
        relation: { type: relation, context: cleanRelation },
      });
    }
  }

  // Extract preferences
  for (const { pattern, category } of PREFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1]?.trim();
      if (!value || value.length < 3) continue;

      // "call me X" → name preference
      if (/call me|my name is|I'm|i am|I go by/i.test(match[0]!)) {
        preferences.push({ category: "personal", subject: "Preferred name", value });
        continue;
      }

      // Clean up the value — stop at sentence boundaries
      const cleanValue = value.replace(/[.!?].*$/, "").trim();
      if (cleanValue.length < 3) continue;

      const subject = cleanValue.slice(0, 40).replace(/\s+\S*$/, ""); // First ~40 chars as subject
      preferences.push({ category, subject, value: cleanValue });
    }
  }

  return { entities, preferences, facts };
}

/**
 * Run post-turn extraction: parse the user's message + agent response,
 * extract entities/relationships/preferences, and store them.
 *
 * This is called after each agent turn completes. It runs synchronously
 * and is best-effort — failures are silently ignored.
 */
export function runPostTurnExtraction(params: {
  cfg: OniAIConfig;
  agentId: string;
  userMessage: string;
  agentResponse?: string;
  sessionKey?: string;
}): { extracted: number } {
  try {
    const store = getStore(params.cfg, params.agentId);
    let extracted = 0;

    // Extract from user message (primary source of new information)
    const userExtraction = extractFromText(params.userMessage);

    // Ensure owner entity exists
    const profile = store.getProfile();
    let ownerEntity = profile.name ? store.findEntity(profile.name) : undefined;
    if (!ownerEntity) {
      // Try to find by common owner names
      ownerEntity = store.findEntity("owner") ?? store.queryEntities({ types: ["person"], limit: 1 })[0];
    }

    // Process extracted entities
    for (const entityInfo of userExtraction.entities) {
      const existing = store.findEntity(entityInfo.name);
      if (existing) {
        // Update existing entity with new facts
        if (entityInfo.facts.length > 0) {
          const newFacts = entityInfo.facts.filter((f) => !existing.facts.includes(f));
          if (newFacts.length > 0) {
            store.addEntity({
              type: existing.type,
              name: existing.name,
              facts: newFacts,
            });
            extracted++;
          }
        }
        // Add relationship if specified and owner exists
        if (entityInfo.relation && ownerEntity) {
          store.addRelationship({
            fromEntityId: ownerEntity.id,
            toEntityId: existing.id,
            type: entityInfo.relation.type,
            context: entityInfo.relation.context,
          });
          extracted++;
        }
      } else {
        // Create new entity
        const newEntity = store.addEntity({
          type: entityInfo.type,
          name: entityInfo.name,
          facts: entityInfo.facts,
        });
        extracted++;

        // Add relationship to owner if specified
        if (entityInfo.relation && ownerEntity) {
          store.addRelationship({
            fromEntityId: ownerEntity.id,
            toEntityId: newEntity.id,
            type: entityInfo.relation.type,
            context: entityInfo.relation.context,
          });
          extracted++;
        }
      }
    }

    // Process extracted preferences
    for (const pref of userExtraction.preferences) {
      store.setPreference({
        category: pref.category as "personal" | "technical" | "communication" | "workflow",
        subject: pref.subject,
        value: pref.value,
      });
      extracted++;
    }

    return { extracted };
  } catch {
    return { extracted: 0 };
  }
}
