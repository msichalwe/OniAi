import { getInteractiveSessionManager } from "../../gateway/server-methods/interactive.js";
import { resolveInteractiveConfig } from "../../interactive/session.js";
import type { InteractiveInput } from "../../interactive/types.js";
import type { CommandHandler, CommandHandlerResult } from "./commands-types.js";

const VALID_INPUTS = new Set<string>(["mic", "camera", "screen", "ambient"]);

const INTERACTIVE_RE = /^\/interactive(?:\s+(.*))?$/i;
const EXIT_INTERACTIVE_RE = /^\/exit\s+interactive(?:\s+mode)?$/i;

function parseInputList(raw: string): InteractiveInput[] | null {
  const parts = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return null;
  for (const p of parts) {
    if (!VALID_INPUTS.has(p)) return null;
  }
  return parts as InteractiveInput[];
}

function reply(text: string): CommandHandlerResult {
  return { shouldContinue: false, reply: { text } };
}

export const handleInteractiveCommand: CommandHandler = async (params, _allowTextCommands) => {
  const body = params.command.commandBodyNormalized.trim();

  // Handle /exit interactive [mode]
  const exitMatch = body.match(EXIT_INTERACTIVE_RE);
  if (exitMatch) {
    const mgr = getInteractiveSessionManager();
    const connId = params.sessionKey;
    mgr.stop(connId);
    return reply("Interactive mode stopped.");
  }

  // Handle /interactive [subcommand]
  const match = body.match(INTERACTIVE_RE);
  if (!match) return null;

  const sub = (match[1] ?? "").trim().toLowerCase();
  const config = resolveInteractiveConfig(params.cfg);
  const mgr = getInteractiveSessionManager();
  const connId = params.sessionKey;
  const agentId = params.agentId ?? "default";

  if (!config.enabled) {
    return reply("Interactive mode is disabled in configuration.");
  }

  // /interactive (no args) — start with defaults
  if (!sub) {
    const snapshot = mgr.start({
      connId,
      sessionKey: params.sessionKey,
      agentId,
      config,
    });
    const inputs = snapshot.enabledInputs.join(", ");
    return reply(
      `Interactive mode active. Inputs: ${inputs}. Say "${config.wakeWords[0]}" or use /interactive to control.\nUse /exit interactive to stop.`,
    );
  }

  // /interactive enable mic,camera,screen,ambient
  if (sub.startsWith("enable")) {
    const rest = sub.slice(6).trim();
    const inputs = parseInputList(rest);
    if (!inputs) {
      return reply("Usage: /interactive enable mic,camera,screen,ambient");
    }
    if (!mgr.isActive(connId)) {
      mgr.start({
        connId,
        sessionKey: params.sessionKey,
        agentId,
        config,
        inputs,
      });
      return reply(`Interactive mode started with: ${inputs.join(", ")}`);
    }
    const snapshot = mgr.enableInputs(connId, inputs);
    return reply(`Enabled: ${inputs.join(", ")}. Active inputs: ${snapshot?.enabledInputs.join(", ") ?? "none"}`);
  }

  // /interactive disable mic,camera,screen,ambient
  if (sub.startsWith("disable")) {
    const rest = sub.slice(7).trim();
    const inputs = parseInputList(rest);
    if (!inputs) {
      return reply("Usage: /interactive disable mic,camera,screen,ambient");
    }
    const snapshot = mgr.disableInputs(connId, inputs);
    if (!snapshot) {
      return reply("No active interactive session.");
    }
    return reply(`Disabled: ${inputs.join(", ")}. Active inputs: ${snapshot.enabledInputs.join(", ") || "none"}`);
  }

  // /interactive status
  if (sub === "status") {
    const snapshot = mgr.getSnapshot(connId);
    if (!snapshot || !mgr.isActive(connId)) {
      return reply("Interactive mode is not active. Use /interactive to start.");
    }
    const lines = [
      `Mode: ${snapshot.mode}`,
      `Inputs: ${snapshot.enabledInputs.join(", ") || "none"}`,
      `Started: ${new Date(snapshot.startedAt).toISOString()}`,
      `Last activity: ${new Date(snapshot.lastActivityAt).toISOString()}`,
    ];
    if (snapshot.directedUntil) {
      lines.push(`Directed until: ${new Date(snapshot.directedUntil).toISOString()}`);
    }
    return reply(lines.join("\n"));
  }

  return null;
};
