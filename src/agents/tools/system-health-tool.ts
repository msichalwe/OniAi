import os from "node:os";
import fs from "node:fs";
import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions, type GatewayCallOptions } from "./gateway.js";

const HEALTH_ACTIONS = ["overview", "channels", "disk", "memory", "processes", "deliveries"] as const;
type HealthAction = (typeof HEALTH_ACTIONS)[number];

const HealthToolSchema = Type.Object({
  action: stringEnum(HEALTH_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
});

type SystemHealthToolOptions = {
  agentSessionKey?: string;
};

function getSystemMetrics() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = Math.round((usedMem / totalMem) * 100);
  const loadAvg = os.loadavg();
  const uptime = os.uptime();

  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? "unknown",
    loadAverage: {
      "1m": Math.round(loadAvg[0]! * 100) / 100,
      "5m": Math.round(loadAvg[1]! * 100) / 100,
      "15m": Math.round(loadAvg[2]! * 100) / 100,
    },
    memory: {
      totalMB: Math.round(totalMem / 1024 / 1024),
      usedMB: Math.round(usedMem / 1024 / 1024),
      freeMB: Math.round(freeMem / 1024 / 1024),
      usagePercent: memUsagePercent,
    },
    uptimeSeconds: uptime,
    uptimeHuman: formatUptime(uptime),
    processMemoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

function getDiskUsage(): { path: string; totalGB: number; usedGB: number; freeGB: number; usagePercent: number }[] {
  const results: { path: string; totalGB: number; usedGB: number; freeGB: number; usagePercent: number }[] = [];
  const checkPaths = ["/", os.homedir()];
  const seen = new Set<string>();

  for (const checkPath of checkPaths) {
    try {
      const stats = fs.statfsSync(checkPath);
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bfree;
      const usedBytes = totalBytes - freeBytes;
      const key = `${totalBytes}:${freeBytes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        path: checkPath,
        totalGB: Math.round((totalBytes / 1024 / 1024 / 1024) * 10) / 10,
        usedGB: Math.round((usedBytes / 1024 / 1024 / 1024) * 10) / 10,
        freeGB: Math.round((freeBytes / 1024 / 1024 / 1024) * 10) / 10,
        usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
      });
    } catch {
      // skip inaccessible paths
    }
  }
  return results;
}

function getProcessInfo() {
  const mem = process.memoryUsage();
  return {
    pid: process.pid,
    rssMB: Math.round(mem.rss / 1024 / 1024),
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

export function createSystemHealthTool(opts?: SystemHealthToolOptions): AnyAgentTool {
  return {
    label: "System Health",
    name: "system_health",
    ownerOnly: true,
    description: `Query system and gateway health for self-monitoring and auto-recovery.

ACTIONS:
- overview: Full system health snapshot (CPU, memory, disk, process info)
- channels: List channel statuses (which channels are up/down)
- disk: Disk usage across mounted volumes
- memory: Detailed memory breakdown (system + process)
- processes: OniAI process info (PID, memory, uptime)
- deliveries: Recent delivery failures (messages that failed to send)

Use this tool to:
- Diagnose issues ("why is the agent slow?")
- Monitor resource usage ("am I running low on disk?")
- Check channel health ("which channels are down?")
- Investigate delivery failures ("what messages failed to send?")
- Support self-healing: if a channel is down, try restarting it via gateway tool`,
    parameters: HealthToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as HealthAction;
      const gatewayOpts: GatewayCallOptions = {
        ...readGatewayCallOptions(params),
        timeoutMs:
          typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
            ? params.timeoutMs
            : 30_000,
      };

      switch (action) {
        case "overview": {
          const system = getSystemMetrics();
          const disk = getDiskUsage();
          const process = getProcessInfo();
          let channels: unknown = null;
          try {
            channels = await callGatewayTool("health", gatewayOpts, { probe: false });
          } catch {
            channels = { error: "Could not reach gateway for channel health" };
          }
          return jsonResult({
            system,
            disk,
            process,
            channels,
            alerts: buildAlerts(system, disk),
          });
        }

        case "channels": {
          try {
            const health = await callGatewayTool("health", gatewayOpts, { probe: true });
            return jsonResult(health);
          } catch (err) {
            return jsonResult({ error: `Failed to query channel health: ${String(err)}` });
          }
        }

        case "disk": {
          return jsonResult({ disks: getDiskUsage() });
        }

        case "memory": {
          const system = getSystemMetrics();
          const proc = getProcessInfo();
          return jsonResult({
            system: system.memory,
            process: proc,
          });
        }

        case "processes": {
          return jsonResult(getProcessInfo());
        }

        case "deliveries": {
          try {
            const result = await callGatewayTool("cron.runs", gatewayOpts, {
              scope: "all",
              statuses: ["error"],
              limit: 20,
              sortDir: "desc",
            });
            return jsonResult(result);
          } catch (err) {
            return jsonResult({ error: `Failed to query deliveries: ${String(err)}` });
          }
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}

function buildAlerts(
  system: ReturnType<typeof getSystemMetrics>,
  disk: ReturnType<typeof getDiskUsage>,
): string[] {
  const alerts: string[] = [];
  if (system.memory.usagePercent > 90) {
    alerts.push(`⚠️ High memory usage: ${system.memory.usagePercent}%`);
  }
  if (system.loadAverage["1m"] > system.cpuCount * 2) {
    alerts.push(`⚠️ High CPU load: ${system.loadAverage["1m"]} (${system.cpuCount} cores)`);
  }
  for (const d of disk) {
    if (d.usagePercent > 90) {
      alerts.push(`⚠️ Low disk space on ${d.path}: ${d.freeGB}GB free (${d.usagePercent}% used)`);
    }
  }
  if (system.processMemoryMB > 2048) {
    alerts.push(`⚠️ High process memory: ${system.processMemoryMB}MB RSS`);
  }
  return alerts;
}
