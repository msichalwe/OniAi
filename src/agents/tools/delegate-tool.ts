import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions, type GatewayCallOptions } from "./gateway.js";

const DELEGATE_ACTIONS = ["dispatch", "status", "results", "cancel"] as const;
type DelegateAction = (typeof DELEGATE_ACTIONS)[number];

const DelegateToolSchema = Type.Object({
  action: stringEnum(DELEGATE_ACTIONS),
  // For dispatch
  goal: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  thinking: Type.Optional(Type.String()),
  timeoutSeconds: Type.Optional(Type.Number()),
  context: Type.Optional(Type.String()),
  // For status/results/cancel
  delegationId: Type.Optional(Type.String()),
  sessionKey: Type.Optional(Type.String()),
  // Gateway params
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
});

type DelegateToolOptions = {
  agentSessionKey?: string;
  agentChannel?: string;
  agentAccountId?: string;
};

export function createDelegateTool(opts?: DelegateToolOptions): AnyAgentTool {
  return {
    label: "Delegate",
    name: "delegate",
    ownerOnly: true,
    description: `Delegate tasks to sub-agents with simplified fire-and-forget semantics. Sub-agents auto-announce results when done.

ACTIONS:
- dispatch: Spawn a sub-agent with a goal (returns delegationId). The sub-agent works autonomously and announces results when complete.
- status: Check the status of a delegated task
- results: Get the results/output of a completed delegation
- cancel: Cancel a running delegation

DISPATCH PARAMS:
{
  "goal": "string (required) — what the sub-agent should do",
  "agentId": "optional agent id (defaults to current)",
  "model": "optional model override (e.g. 'anthropic/claude-sonnet-4-20250514')",
  "thinking": "optional thinking level for the sub-agent",
  "timeoutSeconds": "optional timeout (default: 300)",
  "context": "optional context/background info for the sub-agent"
}

The delegate tool is simpler than sessions_spawn — it handles session creation, prompt formatting, and result routing automatically. Use it when you need to parallelize work across multiple sub-agents.

Example: Delegate research to one sub-agent and implementation to another, then collect results.`,
    parameters: DelegateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as DelegateAction;
      const gatewayOpts: GatewayCallOptions = {
        ...readGatewayCallOptions(params),
        timeoutMs:
          typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
            ? params.timeoutMs
            : 120_000,
      };

      switch (action) {
        case "dispatch": {
          const goal = readStringParam(params, "goal", { required: true });
          const agentId = readStringParam(params, "agentId");
          const model = readStringParam(params, "model");
          const thinking = readStringParam(params, "thinking");
          const context = readStringParam(params, "context");
          const timeoutSeconds =
            typeof params.timeoutSeconds === "number" ? params.timeoutSeconds : 300;

          // Build the sub-agent message with structured goal format
          const messageParts: string[] = [];
          messageParts.push(`## Delegated Task\n`);
          messageParts.push(`**Goal:** ${goal}\n`);
          if (context) {
            messageParts.push(`**Context:** ${context}\n`);
          }
          messageParts.push(`**Instructions:**`);
          messageParts.push(`1. Complete the goal described above.`);
          messageParts.push(`2. When done, your final message will be auto-announced to the parent session.`);
          messageParts.push(`3. Include your results/findings in your final message.`);
          messageParts.push(`4. If you cannot complete the task, explain why.`);

          const spawnParams: Record<string, unknown> = {
            action: "spawn",
            message: messageParts.join("\n"),
            timeoutSeconds,
          };
          if (agentId) spawnParams.agentId = agentId;
          if (model) spawnParams.model = model;
          if (thinking) spawnParams.thinking = thinking;

          const result = await callGatewayTool("sessions.spawn", gatewayOpts, spawnParams);
          return jsonResult({
            dispatched: true,
            delegationId: (result as Record<string, unknown>)?.sessionKey ?? null,
            goal,
            message: "Sub-agent spawned. Results will be auto-announced when complete.",
          });
        }

        case "status": {
          const sessionKey =
            readStringParam(params, "delegationId") ??
            readStringParam(params, "sessionKey");
          if (!sessionKey) throw new Error("delegationId or sessionKey required");
          const result = await callGatewayTool("sessions.list", gatewayOpts, {
            filter: { sessionKey },
          });
          return jsonResult(result);
        }

        case "results": {
          const sessionKey =
            readStringParam(params, "delegationId") ??
            readStringParam(params, "sessionKey");
          if (!sessionKey) throw new Error("delegationId or sessionKey required");
          const result = await callGatewayTool("chat.history", gatewayOpts, {
            sessionKey,
            limit: 5,
          });
          return jsonResult(result);
        }

        case "cancel": {
          const sessionKey =
            readStringParam(params, "delegationId") ??
            readStringParam(params, "sessionKey");
          if (!sessionKey) throw new Error("delegationId or sessionKey required");
          // Use subagents kill to cancel
          const result = await callGatewayTool("subagents.kill", gatewayOpts, {
            sessionKey,
          });
          return jsonResult({ cancelled: true, ...((result as Record<string, unknown>) ?? {}) });
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
