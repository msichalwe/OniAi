import { requiresExecApproval, type ExecAsk, type ExecSecurity } from "../infra/exec-approvals.js";
import { classifyCommand, appendTrustJournalEntry } from "../infra/exec-supervised.js";

export type ExecApprovalDecision = "allow-once" | "allow-always" | null;

export type SystemRunPolicyDecision = {
  analysisOk: boolean;
  allowlistSatisfied: boolean;
  shellWrapperBlocked: boolean;
  windowsShellWrapperBlocked: boolean;
  requiresAsk: boolean;
  approvalDecision: ExecApprovalDecision;
  approvedByAsk: boolean;
  /** Set when supervised mode auto-approved a read-only command. */
  supervisedAutoApproved?: boolean;
} & (
  | {
      allowed: true;
    }
  | {
      allowed: false;
      eventReason: "security=deny" | "approval-required" | "allowlist-miss" | "supervised-blocked";
      errorMessage: string;
    }
);

export function resolveExecApprovalDecision(value: unknown): ExecApprovalDecision {
  if (value === "allow-once" || value === "allow-always") {
    return value;
  }
  return null;
}

export function formatSystemRunAllowlistMissMessage(params?: {
  shellWrapperBlocked?: boolean;
  windowsShellWrapperBlocked?: boolean;
}): string {
  if (params?.windowsShellWrapperBlocked) {
    return (
      "SYSTEM_RUN_DENIED: allowlist miss " +
      "(Windows shell wrappers like cmd.exe /c require approval; " +
      "approve once/always or run with --ask on-miss|always)"
    );
  }
  if (params?.shellWrapperBlocked) {
    return (
      "SYSTEM_RUN_DENIED: allowlist miss " +
      "(shell wrappers like sh/bash/zsh -c require approval; " +
      "approve once/always or run with --ask on-miss|always)"
    );
  }
  return "SYSTEM_RUN_DENIED: allowlist miss";
}

export function evaluateSystemRunPolicy(params: {
  security: ExecSecurity;
  ask: ExecAsk;
  analysisOk: boolean;
  allowlistSatisfied: boolean;
  approvalDecision: ExecApprovalDecision;
  approved?: boolean;
  isWindows: boolean;
  cmdInvocation: boolean;
  shellWrapperInvocation: boolean;
  /** argv of the command being evaluated (used for supervised mode classification). */
  argv?: string[];
  /** Agent id for trust journal entries. */
  agentId?: string;
  /** Session key for trust journal entries. */
  sessionKey?: string;
}): SystemRunPolicyDecision {
  const shellWrapperBlocked = params.security === "allowlist" && params.shellWrapperInvocation;
  const windowsShellWrapperBlocked =
    shellWrapperBlocked && params.isWindows && params.cmdInvocation;
  const analysisOk = shellWrapperBlocked ? false : params.analysisOk;
  const allowlistSatisfied = shellWrapperBlocked ? false : params.allowlistSatisfied;
  const approvedByAsk = params.approvalDecision !== null || params.approved === true;

  if (params.security === "deny") {
    return {
      allowed: false,
      eventReason: "security=deny",
      errorMessage: "SYSTEM_RUN_DISABLED: security=deny",
      analysisOk,
      allowlistSatisfied,
      shellWrapperBlocked,
      windowsShellWrapperBlocked,
      requiresAsk: false,
      approvalDecision: params.approvalDecision,
      approvedByAsk,
    };
  }

  // Supervised mode: auto-approve read-only commands, require approval for mutating/unknown.
  if (params.security === "supervised" && params.argv && params.argv.length > 0) {
    const classification = classifyCommand(params.argv);
    const commandText = params.argv.join(" ");
    if (classification === "read-only") {
      appendTrustJournalEntry({
        timestampMs: Date.now(),
        command: commandText,
        classification,
        decision: "auto-approved",
        agentId: params.agentId,
        sessionKey: params.sessionKey,
      });
      return {
        allowed: true,
        analysisOk: true,
        allowlistSatisfied: true,
        shellWrapperBlocked: false,
        windowsShellWrapperBlocked: false,
        requiresAsk: false,
        approvalDecision: params.approvalDecision,
        approvedByAsk: true,
        supervisedAutoApproved: true,
      };
    }
    // Mutating or unknown → require approval (fall through to ask logic).
    if (!approvedByAsk) {
      appendTrustJournalEntry({
        timestampMs: Date.now(),
        command: commandText,
        classification,
        decision: "prompted",
        agentId: params.agentId,
        sessionKey: params.sessionKey,
      });
      return {
        allowed: false,
        eventReason: "supervised-blocked",
        errorMessage: `SYSTEM_RUN_SUPERVISED: ${classification} command requires approval`,
        analysisOk,
        allowlistSatisfied,
        shellWrapperBlocked: false,
        windowsShellWrapperBlocked: false,
        requiresAsk: true,
        approvalDecision: params.approvalDecision,
        approvedByAsk,
      };
    }
    // Approved by ask — allow through.
    appendTrustJournalEntry({
      timestampMs: Date.now(),
      command: commandText,
      classification,
      decision: "auto-approved",
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    });
  }

  const requiresAsk = requiresExecApproval({
    ask: params.ask,
    security: params.security,
    analysisOk,
    allowlistSatisfied,
  });
  if (requiresAsk && !approvedByAsk) {
    return {
      allowed: false,
      eventReason: "approval-required",
      errorMessage: "SYSTEM_RUN_DENIED: approval required",
      analysisOk,
      allowlistSatisfied,
      shellWrapperBlocked,
      windowsShellWrapperBlocked,
      requiresAsk,
      approvalDecision: params.approvalDecision,
      approvedByAsk,
    };
  }

  if (params.security === "allowlist" && (!analysisOk || !allowlistSatisfied) && !approvedByAsk) {
    return {
      allowed: false,
      eventReason: "allowlist-miss",
      errorMessage: formatSystemRunAllowlistMissMessage({
        shellWrapperBlocked,
        windowsShellWrapperBlocked,
      }),
      analysisOk,
      allowlistSatisfied,
      shellWrapperBlocked,
      windowsShellWrapperBlocked,
      requiresAsk,
      approvalDecision: params.approvalDecision,
      approvedByAsk,
    };
  }

  return {
    allowed: true,
    analysisOk,
    allowlistSatisfied,
    shellWrapperBlocked,
    windowsShellWrapperBlocked,
    requiresAsk,
    approvalDecision: params.approvalDecision,
    approvedByAsk,
  };
}
