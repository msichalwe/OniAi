import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "./bus.js";
import type { EventBusDeps } from "./bus.js";

function tmpStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-event-bus-"));
  return path.join(dir, "event-triggers.json");
}

function createMockDeps(): EventBusDeps & {
  systemEvents: { text: string; opts: Record<string, unknown> }[];
  heartbeatWakes: Record<string, unknown>[];
} {
  const systemEvents: { text: string; opts: Record<string, unknown> }[] = [];
  const heartbeatWakes: Record<string, unknown>[] = [];
  return {
    systemEvents,
    heartbeatWakes,
    enqueueSystemEvent: (text, opts) => {
      systemEvents.push({ text, opts: opts ?? {} });
    },
    requestHeartbeatNow: (opts) => {
      heartbeatWakes.push(opts ?? {});
    },
  };
}

describe("EventBus", () => {
  let storePath: string;
  let deps: ReturnType<typeof createMockDeps>;
  let bus: EventBus;

  beforeEach(() => {
    storePath = tmpStorePath();
    deps = createMockDeps();
    bus = new EventBus(deps, storePath);
  });

  afterEach(() => {
    try {
      fs.rmSync(path.dirname(storePath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("trigger management", () => {
    it("adds a trigger", () => {
      const trigger = bus.addTrigger({
        name: "Disk Alert",
        enabled: true,
        source: "system-monitor",
        config: { kind: "system-monitor", metric: "disk-usage", threshold: 90 },
      });
      expect(trigger.id).toMatch(/^evt_/);
      expect(trigger.name).toBe("Disk Alert");
      expect(trigger.enabled).toBe(true);
    });

    it("persists triggers to disk", () => {
      bus.addTrigger({
        name: "Persist Test",
        enabled: true,
        source: "webhook",
        config: { kind: "webhook", path: "github" },
      });
      const bus2 = new EventBus(deps, storePath);
      const triggers = bus2.listTriggers();
      expect(triggers).toHaveLength(1);
      expect(triggers[0]!.name).toBe("Persist Test");
    });

    it("updates a trigger", () => {
      const trigger = bus.addTrigger({
        name: "Original",
        enabled: true,
        source: "file-watcher",
        config: { kind: "file-watcher", patterns: ["*.ts"] },
      });
      const updated = bus.updateTrigger(trigger.id, { name: "Updated", enabled: false });
      expect(updated!.name).toBe("Updated");
      expect(updated!.enabled).toBe(false);
    });

    it("removes a trigger", () => {
      const trigger = bus.addTrigger({
        name: "Remove Me",
        enabled: true,
        source: "custom",
        config: { kind: "custom", type: "test" },
      });
      expect(bus.removeTrigger(trigger.id)).toBe(true);
      expect(bus.listTriggers()).toHaveLength(0);
    });

    it("returns undefined for unknown trigger", () => {
      expect(bus.getTrigger("nonexistent")).toBeUndefined();
    });

    it("lists triggers with filters", () => {
      bus.addTrigger({ name: "A", enabled: true, source: "webhook", config: { kind: "webhook", path: "a" } });
      bus.addTrigger({ name: "B", enabled: false, source: "webhook", config: { kind: "webhook", path: "b" } });
      bus.addTrigger({ name: "C", enabled: true, source: "file-watcher", config: { kind: "file-watcher", patterns: ["*"] } });

      expect(bus.listTriggers({ enabled: true })).toHaveLength(2);
      expect(bus.listTriggers({ enabled: false })).toHaveLength(1);
      expect(bus.listTriggers({ source: "webhook" })).toHaveLength(2);
      expect(bus.listTriggers({ source: "file-watcher" })).toHaveLength(1);
    });
  });

  describe("fire", () => {
    it("fires an event and enqueues system event + heartbeat", () => {
      const trigger = bus.addTrigger({
        name: "Deploy Alert",
        enabled: true,
        source: "webhook",
        agentId: "agent1",
        sessionKey: "session1",
        config: { kind: "webhook", path: "deploy" },
      });
      const record = bus.fire(trigger.id, { repo: "oni", branch: "main" });
      expect(record).toBeDefined();
      expect(record!.triggerId).toBe(trigger.id);
      expect(record!.delivered).toBe(true);
      expect(deps.systemEvents).toHaveLength(1);
      expect(deps.systemEvents[0]!.opts).toEqual(
        expect.objectContaining({ agentId: "agent1", sessionKey: "session1" }),
      );
      expect(deps.heartbeatWakes).toHaveLength(1);
      expect(deps.heartbeatWakes[0]).toEqual(
        expect.objectContaining({ agentId: "agent1", sessionKey: "session1" }),
      );
    });

    it("uses promptTemplate with {event} placeholder", () => {
      const trigger = bus.addTrigger({
        name: "Custom Prompt",
        enabled: true,
        source: "custom",
        promptTemplate: "🔔 Alert: {event}",
        config: { kind: "custom", type: "test" },
      });
      bus.fire(trigger.id, { message: "hello" });
      expect(deps.systemEvents[0]!.text).toContain("🔔 Alert:");
      expect(deps.systemEvents[0]!.text).toContain('"message": "hello"');
    });

    it("does not fire disabled triggers", () => {
      const trigger = bus.addTrigger({
        name: "Disabled",
        enabled: false,
        source: "custom",
        config: { kind: "custom", type: "test" },
      });
      const record = bus.fire(trigger.id, {});
      expect(record).toBeUndefined();
      expect(deps.systemEvents).toHaveLength(0);
    });

    it("returns undefined for unknown trigger", () => {
      expect(bus.fire("nonexistent", {})).toBeUndefined();
    });
  });

  describe("emit", () => {
    it("fires all matching triggers for a source", () => {
      bus.addTrigger({ name: "WH1", enabled: true, source: "webhook", config: { kind: "webhook", path: "a" } });
      bus.addTrigger({ name: "WH2", enabled: true, source: "webhook", config: { kind: "webhook", path: "b" } });
      bus.addTrigger({ name: "FW1", enabled: true, source: "file-watcher", config: { kind: "file-watcher", patterns: ["*"] } });

      const records = bus.emit("webhook", { payload: "test" });
      expect(records).toHaveLength(2);
      expect(deps.systemEvents).toHaveLength(2);
      expect(deps.heartbeatWakes).toHaveLength(2);
    });
  });

  describe("event log", () => {
    it("maintains event log", () => {
      const trigger = bus.addTrigger({
        name: "Log Test",
        enabled: true,
        source: "custom",
        config: { kind: "custom", type: "test" },
      });
      bus.fire(trigger.id, { a: 1 });
      bus.fire(trigger.id, { a: 2 });
      const log = bus.getEventLog();
      expect(log).toHaveLength(2);
    });

    it("respects limit on event log retrieval", () => {
      const trigger = bus.addTrigger({
        name: "Limit Test",
        enabled: true,
        source: "custom",
        config: { kind: "custom", type: "test" },
      });
      for (let i = 0; i < 10; i++) {
        bus.fire(trigger.id, { i });
      }
      expect(bus.getEventLog(3)).toHaveLength(3);
    });
  });

  describe("stats", () => {
    it("returns accurate stats", () => {
      bus.addTrigger({ name: "A", enabled: true, source: "webhook", config: { kind: "webhook", path: "a" } });
      bus.addTrigger({ name: "B", enabled: false, source: "webhook", config: { kind: "webhook", path: "b" } });
      const trigger = bus.addTrigger({ name: "C", enabled: true, source: "custom", config: { kind: "custom", type: "t" } });
      bus.fire(trigger.id, {});

      const stats = bus.stats();
      expect(stats.totalTriggers).toBe(3);
      expect(stats.enabledTriggers).toBe(2);
      expect(stats.totalEvents).toBe(1);
    });
  });
});
