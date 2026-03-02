export type EventSourceKind =
  | "file-watcher"
  | "webhook"
  | "system-monitor"
  | "channel-event"
  | "schedule"
  | "custom";

export type EventPriority = "critical" | "high" | "normal" | "low";

export type EventTrigger = {
  id: string;
  /** Human-readable name. */
  name: string;
  /** Whether this trigger is active. */
  enabled: boolean;
  /** The kind of event source. */
  source: EventSourceKind;
  /** Agent to notify when the event fires. */
  agentId?: string;
  /** Session key to route the event to. */
  sessionKey?: string;
  /** Priority of generated events. */
  priority?: EventPriority;
  /** Prompt template to inject when the event fires. Supports {event} placeholder. */
  promptTemplate?: string;
  /** Source-specific configuration. */
  config: EventTriggerConfig;
  createdAtMs: number;
  updatedAtMs: number;
};

export type EventTriggerConfig =
  | FileWatcherConfig
  | WebhookConfig
  | SystemMonitorConfig
  | ChannelEventConfig
  | ScheduleConfig
  | CustomConfig;

export type FileWatcherConfig = {
  kind: "file-watcher";
  /** Glob patterns to watch. */
  patterns: string[];
  /** Directory to watch (default: workspace). */
  directory?: string;
  /** Events to listen for. */
  events?: ("create" | "modify" | "delete")[];
  /** Debounce interval in ms to avoid rapid-fire events. */
  debounceMs?: number;
};

export type WebhookConfig = {
  kind: "webhook";
  /** Path segment for the webhook endpoint (e.g., "github" → /webhooks/github). */
  path: string;
  /** Optional secret for webhook signature verification. */
  secret?: string;
  /** HTTP methods to accept (default: POST). */
  methods?: ("GET" | "POST" | "PUT" | "DELETE")[];
  /** Optional jq-style filter to extract relevant data from the payload. */
  payloadFilter?: string;
};

export type SystemMonitorConfig = {
  kind: "system-monitor";
  /** What to monitor. */
  metric: "disk-usage" | "memory-usage" | "cpu-usage" | "process-crash" | "channel-health";
  /** Threshold (percent for usage, ignored for crash/health). */
  threshold?: number;
  /** Check interval in ms. */
  intervalMs?: number;
};

export type ChannelEventConfig = {
  kind: "channel-event";
  /** Channel to monitor (e.g., "telegram", "discord"). */
  channel: string;
  /** Event types to listen for. */
  events: string[];
  /** Optional filter criteria. */
  filter?: Record<string, string>;
};

export type ScheduleConfig = {
  kind: "schedule";
  /** Cron expression. */
  cron: string;
  /** Timezone (default: UTC). */
  timezone?: string;
};

export type CustomConfig = {
  kind: "custom";
  /** Custom event type identifier. */
  type: string;
  /** Arbitrary configuration. */
  params?: Record<string, unknown>;
};

export type EventRecord = {
  id: string;
  triggerId: string;
  triggerName: string;
  source: EventSourceKind;
  priority: EventPriority;
  /** Event data/payload. */
  data: Record<string, unknown>;
  /** Generated prompt text for the agent. */
  prompt: string;
  firedAtMs: number;
  /** Whether the event has been delivered to an agent. */
  delivered: boolean;
  deliveredAtMs?: number;
};

export type EventBusConfig = {
  /** Enable the event bus (default: false). */
  enabled?: boolean;
  /** Max events to retain in the event log. */
  maxEvents?: number;
  /** Triggers configuration. */
  triggers?: EventTrigger[];
};
