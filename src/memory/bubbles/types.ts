/**
 * Memory Bubble System — Pickle-inspired structured memory for Oni.
 *
 * Architecture:
 * - Bubbles: discrete memory units (a fact, event, interaction, observation)
 * - Entities: people, projects, places, topics, tools — extracted from bubbles
 * - Graph: typed relationships between entities (knows, works-on, mentioned-in, etc.)
 * - Temporal index: every bubble has a timestamp, queryable by time range
 * - Preferences: structured user preferences auto-extracted from conversations
 * - User profile: dynamic model of the user that evolves over time
 */

// ─── Bubbles ───

export type BubbleSource =
  | "conversation"
  | "heartbeat"
  | "node-scan"
  | "calendar"
  | "email"
  | "clipboard"
  | "file-change"
  | "web-browse"
  | "agent-observation"
  | "manual";

export type BubbleCategory =
  | "fact"
  | "decision"
  | "event"
  | "interaction"
  | "observation"
  | "preference"
  | "correction"
  | "task-outcome"
  | "error-fix"
  | "idea"
  | "question"
  | "mood";

export type MemoryBubble = {
  id: string;
  /** What happened / what was learned. */
  content: string;
  /** Category of this memory. */
  category: BubbleCategory;
  /** Where this memory came from. */
  source: BubbleSource;
  /** Entity IDs this bubble relates to. */
  entityIds: string[];
  /** IDs of other bubbles this one connects to. */
  linkedBubbleIds: string[];
  /** Tags for filtering. */
  tags: string[];
  /** Importance score (0-1). Higher = more important to recall. */
  importance: number;
  /** Session key where this bubble was created. */
  sessionKey?: string;
  /** Timestamps. */
  createdAtMs: number;
  /** When this bubble was last accessed/referenced. */
  lastAccessedAtMs?: number;
  /** Number of times this bubble was recalled. */
  recallCount: number;
};

// ─── Entities ───

export type EntityType =
  | "person"
  | "project"
  | "place"
  | "topic"
  | "tool"
  | "organization"
  | "device"
  | "url"
  | "file";

export type Entity = {
  id: string;
  /** Entity type. */
  type: EntityType;
  /** Primary name. */
  name: string;
  /** Alternative names / aliases. */
  aliases: string[];
  /** Key facts about this entity. */
  facts: string[];
  /** First time this entity was mentioned. */
  firstSeenAtMs: number;
  /** Last time this entity was mentioned. */
  lastSeenAtMs: number;
  /** Number of times this entity has been mentioned. */
  mentionCount: number;
  /** Importance score (0-1), based on mention frequency and recency. */
  importance: number;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
};

// ─── Graph Relationships ───

export type RelationType =
  | "knows"           // person <-> person
  | "works-on"        // person -> project
  | "located-at"      // entity -> place
  | "mentioned-in"    // entity -> bubble
  | "related-to"      // entity <-> entity (generic)
  | "depends-on"      // project -> project
  | "uses"            // person/project -> tool
  | "owns"            // person -> device/project
  | "created-by"      // entity -> person
  | "part-of"         // entity -> entity (hierarchical)
  | "prefers"         // person -> topic/tool
  | "dislikes"        // person -> topic/tool
  | "spouse"          // person <-> person (marriage/partner)
  | "parent"          // person -> person (parent of)
  | "child"           // person -> person (child of)
  | "sibling"         // person <-> person (brother/sister)
  | "manages"         // person -> person/project
  | "reports-to";     // person -> person

export type Relationship = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: RelationType;
  /** Optional context / description. */
  context?: string;
  /** Strength of the relationship (0-1). */
  strength: number;
  createdAtMs: number;
  lastReinforcedAtMs: number;
};

// ─── Preferences ───

export type PreferenceCategory =
  | "communication"   // how user likes to be spoken to
  | "technical"       // coding style, tools, frameworks
  | "personal"        // food, music, hobbies
  | "workflow"        // how they work, processes
  | "opinion"         // views on topics
  | "correction";     // things the user corrected the agent on

export type Preference = {
  id: string;
  category: PreferenceCategory;
  /** What the preference is about. */
  subject: string;
  /** The actual preference/opinion. */
  value: string;
  /** Confidence (0-1). Higher after repeated mentions. */
  confidence: number;
  /** Number of times this preference was reinforced. */
  reinforcements: number;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
};

// ─── User Profile ───

export type UserProfile = {
  /** Display name. */
  name?: string;
  /** Active projects the user is working on. */
  activeProjects: string[];
  /** Current interests / topics. */
  interests: string[];
  /** Communication style preferences. */
  communicationStyle: {
    formality: "casual" | "mixed" | "formal";
    verbosity: "brief" | "moderate" | "detailed";
    humor: boolean;
    language?: string;
  };
  /** Work patterns. */
  workPatterns: {
    activeHoursStart?: number; // 0-23
    activeHoursEnd?: number;
    timezone?: string;
    primaryDevice?: string;
  };
  /** Recurring themes from conversations. */
  recurringThemes: string[];
  /** Goals the user has mentioned. */
  goals: string[];
  lastUpdatedAtMs: number;
};

// ─── Store ───

export type MemoryBubbleStore = {
  version: 2;
  bubbles: MemoryBubble[];
  entities: Entity[];
  relationships: Relationship[];
  preferences: Preference[];
  userProfile: UserProfile;
  /** Last time a full node scan was performed. */
  lastNodeScanAtMs?: number;
  /** Last time ambient context was captured. */
  lastAmbientCaptureAtMs?: number;
};

// ─── Query ───

export type BubbleQuery = {
  /** Text search across bubble content. */
  text?: string;
  /** Filter by category. */
  categories?: BubbleCategory[];
  /** Filter by source. */
  sources?: BubbleSource[];
  /** Filter by entity ID. */
  entityId?: string;
  /** Filter by tag. */
  tags?: string[];
  /** Time range filter. */
  after?: number;
  before?: number;
  /** Minimum importance. */
  minImportance?: number;
  /** Max results. */
  limit?: number;
  /** Sort by. */
  sortBy?: "recency" | "importance" | "recall";
};

export type EntityQuery = {
  text?: string;
  types?: EntityType[];
  minImportance?: number;
  limit?: number;
};
