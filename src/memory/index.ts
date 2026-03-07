export { MemoryIndexManager } from "./manager.js";
export type {
  MemoryEmbeddingProbeResult,
  MemorySearchManager,
  MemorySearchResult,
} from "./types.js";
export { getMemorySearchManager, type MemorySearchManagerResult } from "./search-manager.js";
export { UnifiedMemoryStore } from "./unified-store.js";
export { BubbleStore } from "./bubbles/store.js";
export type {
  MemoryBubble,
  MemoryBubbleStore,
  BubbleSource,
  BubbleCategory,
  BubbleQuery,
  Entity,
  EntityType,
  EntityQuery,
  Relationship,
  RelationType,
  Preference,
  PreferenceCategory,
  UserProfile,
} from "./bubbles/types.js";
