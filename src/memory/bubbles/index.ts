export { BubbleStore, resolveStorePath } from "./store.js";
export {
  resolveHeartbeatMemoryWork,
  buildMemoryInsightsPrompt,
} from "./heartbeat-surfacing.js";
export {
  isNodeScanDue,
  buildNodeScanCommands,
  processScanResults,
} from "./node-scanner.js";
export type { NodeScanStore } from "./node-scanner.js";
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
} from "./types.js";
