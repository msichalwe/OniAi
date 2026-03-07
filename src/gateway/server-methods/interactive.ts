import { loadConfig } from "../../config/io.js";
import {
  InteractiveSessionManager,
  resolveInteractiveConfig,
} from "../../interactive/session.js";
import type { InteractiveInput } from "../../interactive/types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

const VALID_INPUTS = new Set<InteractiveInput>(["mic", "camera", "screen", "ambient"]);

function parseInputs(raw: unknown): InteractiveInput[] | null {
  if (!Array.isArray(raw)) return null;
  const inputs: InteractiveInput[] = [];
  for (const item of raw) {
    const s = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!VALID_INPUTS.has(s as InteractiveInput)) return null;
    inputs.push(s as InteractiveInput);
  }
  return inputs.length > 0 ? inputs : null;
}

// Singleton session manager — shared across all gateway connections.
let sessionManager: InteractiveSessionManager | null = null;

export function getInteractiveSessionManager(): InteractiveSessionManager {
  if (!sessionManager) {
    sessionManager = new InteractiveSessionManager();
  }
  return sessionManager;
}

export const interactiveHandlers: GatewayRequestHandlers = {
  "interactive.start": async ({ params, client, respond, context }) => {
    try {
      const cfg = loadConfig();
      const config = resolveInteractiveConfig(cfg);
      if (!config.enabled) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Interactive mode is disabled in config"));
        return;
      }
      const connId = client?.connId;
      if (!connId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No connection ID"));
        return;
      }
      const agentId = typeof params.agentId === "string" ? params.agentId : "default";
      const sessionKey = typeof params.sessionKey === "string"
        ? params.sessionKey
        : `agent:${agentId}:interactive:${connId}`;
      const inputs = parseInputs(params.inputs) ?? undefined;

      const mgr = getInteractiveSessionManager();
      mgr.onStateChange((id, state) => {
        context.broadcast("interactive.state", {
          mode: state.mode,
          enabledInputs: state.enabledInputs,
          connId: id,
        }, { dropIfSlow: true });
      });

      const snapshot = mgr.start({ connId, sessionKey, agentId, config, inputs });
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.stop": async ({ client, respond }) => {
    try {
      const connId = client?.connId;
      if (!connId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No connection ID"));
        return;
      }
      const mgr = getInteractiveSessionManager();
      mgr.stop(connId);
      respond(true, { stopped: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.enable": async ({ params, client, respond }) => {
    try {
      const connId = client?.connId;
      if (!connId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No connection ID"));
        return;
      }
      const inputs = parseInputs(params.inputs);
      if (!inputs) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "interactive.enable requires inputs: string[] (mic, camera, screen, ambient)"));
        return;
      }
      const mgr = getInteractiveSessionManager();
      const snapshot = mgr.enableInputs(connId, inputs);
      if (!snapshot) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.disable": async ({ params, client, respond }) => {
    try {
      const connId = client?.connId;
      if (!connId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No connection ID"));
        return;
      }
      const inputs = parseInputs(params.inputs);
      if (!inputs) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "interactive.disable requires inputs: string[] (mic, camera, screen, ambient)"));
        return;
      }
      const mgr = getInteractiveSessionManager();
      const snapshot = mgr.disableInputs(connId, inputs);
      if (!snapshot) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.status": async ({ client, respond }) => {
    try {
      const connId = client?.connId;
      if (!connId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No connection ID"));
        return;
      }
      const mgr = getInteractiveSessionManager();
      const snapshot = mgr.getSnapshot(connId);
      respond(true, {
        active: mgr.isActive(connId),
        session: snapshot ?? null,
        activeSessions: mgr.getActiveSessions().length,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.configure": async ({ params, respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveInteractiveConfig(cfg);
      respond(true, {
        enabled: config.enabled,
        wakeWords: config.wakeWords,
        directedWindowMs: config.directedWindowMs,
        silenceResetMs: config.silenceResetMs,
        defaultInputs: config.defaultInputs,
        rateLimits: cfg.interactive?.rateLimits ?? {},
        classifier: cfg.interactive?.classifier ?? {},
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
