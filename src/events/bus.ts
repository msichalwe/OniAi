import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  EventBusConfig,
  EventRecord,
  EventTrigger,
  EventPriority,
  EventSourceKind,
} from "./types.js";

const MAX_EVENT_LOG = 200;

export type EventBusDeps = {
  enqueueSystemEvent: (
    text: string,
    opts?: { agentId?: string; sessionKey?: string; contextKey?: string },
  ) => void;
  requestHeartbeatNow: (opts?: { reason?: string; agentId?: string; sessionKey?: string }) => void;
};

export type EventBusState = {
  triggers: Map<string, EventTrigger>;
  eventLog: EventRecord[];
  deps: EventBusDeps;
  storePath: string;
};

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadTriggers(storePath: string): EventTrigger[] {
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.triggers)) {
      return parsed.triggers;
    }
  } catch {
    // missing or invalid
  }
  return [];
}

function saveTriggers(storePath: string, triggers: EventTrigger[]) {
  ensureDir(storePath);
  fs.writeFileSync(storePath, JSON.stringify({ version: 1, triggers }, null, 2), "utf-8");
}

function buildEventPrompt(trigger: EventTrigger, data: Record<string, unknown>): string {
  const template = trigger.promptTemplate ?? "[Event] {event}";
  const eventSummary = JSON.stringify(data, null, 2);
  return template.replace(/\{event\}/g, eventSummary);
}

export function resolveEventBusStorePath(): string {
  const base = process.env.ONI_DATA_DIR ?? path.join(process.env.HOME ?? "~", ".oni");
  return path.join(base, "event-triggers.json");
}

export class EventBus {
  private state: EventBusState;

  constructor(deps: EventBusDeps, storePath?: string) {
    const resolvedPath = storePath ?? resolveEventBusStorePath();
    const triggers = loadTriggers(resolvedPath);
    this.state = {
      triggers: new Map(triggers.map((t) => [t.id, t])),
      eventLog: [],
      deps,
      storePath: resolvedPath,
    };
  }

  private persist() {
    saveTriggers(this.state.storePath, Array.from(this.state.triggers.values()));
  }

  addTrigger(trigger: Omit<EventTrigger, "id" | "createdAtMs" | "updatedAtMs">): EventTrigger {
    const now = Date.now();
    const full: EventTrigger = {
      ...trigger,
      id: `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.state.triggers.set(full.id, full);
    this.persist();
    return full;
  }

  updateTrigger(id: string, patch: Partial<EventTrigger>): EventTrigger | undefined {
    const existing = this.state.triggers.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id: existing.id, updatedAtMs: Date.now() };
    this.state.triggers.set(id, updated);
    this.persist();
    return updated;
  }

  removeTrigger(id: string): boolean {
    const deleted = this.state.triggers.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  getTrigger(id: string): EventTrigger | undefined {
    return this.state.triggers.get(id);
  }

  listTriggers(opts?: { enabled?: boolean; source?: EventSourceKind }): EventTrigger[] {
    let triggers = Array.from(this.state.triggers.values());
    if (opts?.enabled !== undefined) {
      triggers = triggers.filter((t) => t.enabled === opts.enabled);
    }
    if (opts?.source) {
      triggers = triggers.filter((t) => t.source === opts.source);
    }
    return triggers;
  }

  /**
   * Fire an event from a trigger. Enqueues as a system event and wakes the agent.
   */
  fire(triggerId: string, data: Record<string, unknown>): EventRecord | undefined {
    const trigger = this.state.triggers.get(triggerId);
    if (!trigger || !trigger.enabled) return undefined;

    const prompt = buildEventPrompt(trigger, data);
    const record: EventRecord = {
      id: `evr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      triggerId: trigger.id,
      triggerName: trigger.name,
      source: trigger.source,
      priority: trigger.priority ?? "normal",
      data,
      prompt,
      firedAtMs: Date.now(),
      delivered: false,
    };

    // Enqueue as system event for the agent
    this.state.deps.enqueueSystemEvent(prompt, {
      agentId: trigger.agentId,
      sessionKey: trigger.sessionKey,
      contextKey: `event:${record.id}`,
    });

    // Wake the agent to process the event
    this.state.deps.requestHeartbeatNow({
      reason: `event:${trigger.source}:${trigger.name}`,
      agentId: trigger.agentId,
      sessionKey: trigger.sessionKey,
    });

    record.delivered = true;
    record.deliveredAtMs = Date.now();

    // Append to event log with rotation
    this.state.eventLog.push(record);
    if (this.state.eventLog.length > MAX_EVENT_LOG) {
      this.state.eventLog = this.state.eventLog.slice(-MAX_EVENT_LOG);
    }

    return record;
  }

  /**
   * Fire an event by matching source kind + data against triggers.
   */
  emit(source: EventSourceKind, data: Record<string, unknown>): EventRecord[] {
    const records: EventRecord[] = [];
    for (const trigger of this.state.triggers.values()) {
      if (trigger.source === source && trigger.enabled) {
        const record = this.fire(trigger.id, data);
        if (record) records.push(record);
      }
    }
    return records;
  }

  getEventLog(limit?: number): EventRecord[] {
    if (limit && limit > 0) {
      return this.state.eventLog.slice(-limit);
    }
    return [...this.state.eventLog];
  }

  stats(): { totalTriggers: number; enabledTriggers: number; totalEvents: number } {
    const triggers = Array.from(this.state.triggers.values());
    return {
      totalTriggers: triggers.length,
      enabledTriggers: triggers.filter((t) => t.enabled).length,
      totalEvents: this.state.eventLog.length,
    };
  }
}
