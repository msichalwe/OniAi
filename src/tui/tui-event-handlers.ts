import { asString, extractTextFromMessage, isCommandMessage } from "./tui-formatters.js";
import { TuiStreamAssembler } from "./tui-stream-assembler.js";
import type { AgentEvent, ChatEvent, TuiStateAccess } from "./tui-types.js";

type EventHandlerChatLog = {
  startTool: (toolCallId: string, toolName: string, args: unknown) => void;
  updateToolResult: (
    toolCallId: string,
    result: unknown,
    options?: { partial?: boolean; isError?: boolean },
  ) => void;
  addSystem: (text: string) => void;
  updateAssistant: (text: string, runId: string) => void;
  finalizeAssistant: (text: string, runId: string) => void;
  dropAssistant: (runId: string) => void;
};

type EventHandlerTui = {
  requestRender: () => void;
};

type EventHandlerContext = {
  chatLog: EventHandlerChatLog;
  tui: EventHandlerTui;
  state: TuiStateAccess;
  setActivityStatus: (text: string) => void;
  refreshSessionInfo?: () => Promise<void>;
  loadHistory?: () => Promise<void>;
  isLocalRunId?: (runId: string) => boolean;
  forgetLocalRunId?: (runId: string) => void;
  clearLocalRunIds?: () => void;
};

export function createEventHandlers(context: EventHandlerContext) {
  const {
    chatLog,
    tui,
    state,
    setActivityStatus,
    refreshSessionInfo,
    loadHistory,
    isLocalRunId,
    forgetLocalRunId,
    clearLocalRunIds,
  } = context;
  const finalizedRuns = new Map<string, number>();
  const sessionRuns = new Map<string, number>();
  let streamAssembler = new TuiStreamAssembler();
  let lastSessionKey = state.currentSessionKey;

  const pruneRunMap = (runs: Map<string, number>) => {
    if (runs.size <= 200) {
      return;
    }
    const keepUntil = Date.now() - 10 * 60 * 1000;
    for (const [key, ts] of runs) {
      if (runs.size <= 150) {
        break;
      }
      if (ts < keepUntil) {
        runs.delete(key);
      }
    }
    if (runs.size > 200) {
      for (const key of runs.keys()) {
        runs.delete(key);
        if (runs.size <= 150) {
          break;
        }
      }
    }
  };

  const syncSessionKey = () => {
    if (state.currentSessionKey === lastSessionKey) {
      return;
    }
    lastSessionKey = state.currentSessionKey;
    finalizedRuns.clear();
    sessionRuns.clear();
    streamAssembler = new TuiStreamAssembler();
    clearLocalRunIds?.();
  };

  const noteSessionRun = (runId: string) => {
    sessionRuns.set(runId, Date.now());
    pruneRunMap(sessionRuns);
  };

  const noteFinalizedRun = (runId: string) => {
    finalizedRuns.set(runId, Date.now());
    sessionRuns.delete(runId);
    streamAssembler.drop(runId);
    pruneRunMap(finalizedRuns);
  };

  const clearActiveRunIfMatch = (runId: string) => {
    if (state.activeChatRunId === runId) {
      state.activeChatRunId = null;
    }
  };

  const finalizeRun = (params: {
    runId: string;
    wasActiveRun: boolean;
    status: "idle" | "error";
  }) => {
    noteFinalizedRun(params.runId);
    clearActiveRunIfMatch(params.runId);
    if (params.wasActiveRun) {
      setActivityStatus(params.status);
    }
    void refreshSessionInfo?.();
  };

  const terminateRun = (params: {
    runId: string;
    wasActiveRun: boolean;
    status: "aborted" | "error";
  }) => {
    streamAssembler.drop(params.runId);
    sessionRuns.delete(params.runId);
    clearActiveRunIfMatch(params.runId);
    if (params.wasActiveRun) {
      setActivityStatus(params.status);
    }
    void refreshSessionInfo?.();
  };

  const hasConcurrentActiveRun = (runId: string) => {
    const activeRunId = state.activeChatRunId;
    if (!activeRunId || activeRunId === runId) {
      return false;
    }
    return sessionRuns.has(activeRunId);
  };

  const maybeRefreshHistoryForRun = (runId: string) => {
    if (isLocalRunId?.(runId)) {
      forgetLocalRunId?.(runId);
      return;
    }
    if (hasConcurrentActiveRun(runId)) {
      return;
    }
    void loadHistory?.();
  };

  const handleChatEvent = (payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const evt = payload as ChatEvent;
    syncSessionKey();
    if (evt.sessionKey !== state.currentSessionKey) {
      return;
    }
    if (finalizedRuns.has(evt.runId)) {
      if (evt.state === "delta") {
        return;
      }
      if (evt.state === "final") {
        return;
      }
    }
    noteSessionRun(evt.runId);
    if (!state.activeChatRunId) {
      state.activeChatRunId = evt.runId;
    }
    if (evt.state === "delta") {
      const displayText = streamAssembler.ingestDelta(evt.runId, evt.message, state.showThinking);
      if (!displayText) {
        return;
      }
      chatLog.updateAssistant(displayText, evt.runId);
      setActivityStatus("streaming");
    }
    if (evt.state === "final") {
      const wasActiveRun = state.activeChatRunId === evt.runId;
      if (!evt.message) {
        maybeRefreshHistoryForRun(evt.runId);
        chatLog.dropAssistant(evt.runId);
        finalizeRun({ runId: evt.runId, wasActiveRun, status: "idle" });
        tui.requestRender();
        return;
      }
      if (isCommandMessage(evt.message)) {
        maybeRefreshHistoryForRun(evt.runId);
        const text = extractTextFromMessage(evt.message);
        if (text) {
          chatLog.addSystem(text);
        }
        finalizeRun({ runId: evt.runId, wasActiveRun, status: "idle" });
        tui.requestRender();
        return;
      }
      maybeRefreshHistoryForRun(evt.runId);
      const stopReason =
        evt.message && typeof evt.message === "object" && !Array.isArray(evt.message)
          ? typeof (evt.message as Record<string, unknown>).stopReason === "string"
            ? ((evt.message as Record<string, unknown>).stopReason as string)
            : ""
          : "";

      const finalText = streamAssembler.finalize(evt.runId, evt.message, state.showThinking);
      const suppressEmptyExternalPlaceholder =
        finalText === "(no output)" && !isLocalRunId?.(evt.runId);
      if (suppressEmptyExternalPlaceholder) {
        chatLog.dropAssistant(evt.runId);
      } else {
        chatLog.finalizeAssistant(finalText, evt.runId);
      }
      finalizeRun({
        runId: evt.runId,
        wasActiveRun,
        status: stopReason === "error" ? "error" : "idle",
      });
    }
    if (evt.state === "aborted") {
      const wasActiveRun = state.activeChatRunId === evt.runId;
      chatLog.addSystem("run aborted");
      terminateRun({ runId: evt.runId, wasActiveRun, status: "aborted" });
      maybeRefreshHistoryForRun(evt.runId);
    }
    if (evt.state === "error") {
      const wasActiveRun = state.activeChatRunId === evt.runId;
      chatLog.addSystem(`run error: ${evt.errorMessage ?? "unknown"}`);
      terminateRun({ runId: evt.runId, wasActiveRun, status: "error" });
      maybeRefreshHistoryForRun(evt.runId);
    }
    tui.requestRender();
  };

  const handleAgentEvent = (payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const evt = payload as AgentEvent;
    syncSessionKey();
    // Agent events (tool streaming, lifecycle) are emitted per-run. Filter against the
    // active chat run id, not the session id. Tool results can arrive after the chat
    // final event, so accept finalized runs for tool updates.
    const isActiveRun = evt.runId === state.activeChatRunId;
    const isKnownRun = isActiveRun || sessionRuns.has(evt.runId) || finalizedRuns.has(evt.runId);
    if (!isKnownRun) {
      return;
    }
    if (evt.stream === "tool") {
      const verbose = state.sessionInfo.verboseLevel ?? "off";
      const allowToolEvents = verbose !== "off";
      const allowToolOutput = verbose === "full";
      if (!allowToolEvents) {
        return;
      }
      const data = evt.data ?? {};
      const phase = asString(data.phase, "");
      const toolCallId = asString(data.toolCallId, "");
      const toolName = asString(data.name, "tool");
      if (!toolCallId) {
        return;
      }
      if (phase === "start") {
        chatLog.startTool(toolCallId, toolName, data.args);
      } else if (phase === "update") {
        if (!allowToolOutput) {
          return;
        }
        chatLog.updateToolResult(toolCallId, data.partialResult, {
          partial: true,
        });
      } else if (phase === "result") {
        if (allowToolOutput) {
          chatLog.updateToolResult(toolCallId, data.result, {
            isError: Boolean(data.isError),
          });
        } else {
          chatLog.updateToolResult(toolCallId, { content: [] }, { isError: Boolean(data.isError) });
        }
      }
      tui.requestRender();
      return;
    }
    if (evt.stream === "lifecycle") {
      if (!isActiveRun) {
        return;
      }
      const phase = typeof evt.data?.phase === "string" ? evt.data.phase : "";
      if (phase === "start") {
        setActivityStatus("running");
      }
      if (phase === "end") {
        setActivityStatus("idle");
      }
      if (phase === "error") {
        setActivityStatus("error");
      }
      tui.requestRender();
    }
  };

  // Track capture status for building the status line
  let captureStatus = { mic: "off", screen: "off", camera: "off" } as Record<string, string>;

  const buildInteractiveStatusLine = (mode: string): string => {
    const parts: string[] = [];
    // Mode indicator
    if (mode === "directed") {
      parts.push("DIRECTED");
    } else if (mode === "listening") {
      parts.push("LISTENING");
    } else if (mode === "responding") {
      parts.push("RESPONDING");
    } else if (mode === "processing") {
      parts.push("PROCESSING");
    }
    // Capture indicators
    const mic = captureStatus.mic === "on" ? "mic:ON" : captureStatus.mic === "error" ? "mic:ERR" : "mic:off";
    const scr = captureStatus.screen === "on" ? "screen:ON" : captureStatus.screen === "error" ? "screen:ERR" : "screen:off";
    const cam = captureStatus.camera === "on" ? "cam:ON" : captureStatus.camera === "error" ? "cam:ERR" : "cam:off";
    parts.push(mic, scr, cam);
    return parts.join(" | ");
  };

  const handleInteractiveEvent = (eventType: string, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const data = payload as Record<string, unknown>;

    switch (eventType) {
      case "interactive.preflight": {
        const results = Array.isArray(data.results) ? data.results as {
          input: string;
          available: boolean;
          tool: string | null;
          permission: boolean;
          error: string | null;
          fix: string | null;
        }[] : [];

        if (results.length > 0) {
          chatLog.addSystem("[interactive] --- Pre-flight checks ---");
          for (const r of results) {
            const ok = r.available && r.permission;
            const icon = ok ? "[OK]" : "[FAIL]";
            const toolInfo = r.tool ? ` (${r.tool})` : "";
            chatLog.addSystem(`  ${icon} ${r.input}${toolInfo}${r.error ? ` — ${r.error}` : ""}`);
            if (r.fix && !ok) {
              chatLog.addSystem(`        Fix: ${r.fix}`);
            }
          }
          const passed = results.filter((r) => r.available && r.permission);
          const failed = results.filter((r) => !r.available || !r.permission);
          chatLog.addSystem(
            `[interactive] ${passed.length}/${results.length} inputs ready` +
            (failed.length > 0 ? ` — ${failed.map((f) => f.input).join(", ")} skipped` : ""),
          );
        }
        tui.requestRender();
        break;
      }
      case "interactive.state": {
        const mode = typeof data.mode === "string" ? data.mode : "unknown";
        const inputs = Array.isArray(data.enabledInputs)
          ? (data.enabledInputs as string[]).join(", ")
          : "";
        chatLog.addSystem(`[interactive] ${mode}${inputs ? ` | inputs: ${inputs}` : ""}`);
        if (mode === "idle") {
          setActivityStatus("idle");
        } else {
          setActivityStatus(buildInteractiveStatusLine(mode));
        }
        tui.requestRender();
        break;
      }
      case "interactive.capture.status": {
        const mic = typeof data.mic === "string" ? data.mic : "off";
        const screen = typeof data.screen === "string" ? data.screen : "off";
        const camera = typeof data.camera === "string" ? data.camera : "off";
        const prev = { ...captureStatus };
        captureStatus = { mic, screen, camera };

        // Log notable changes
        if (mic !== prev.mic) {
          if (mic === "on") chatLog.addSystem("[interactive] Microphone active — listening for speech");
          else if (mic === "error") chatLog.addSystem("[interactive] Microphone error — check audio tools (sox/ffmpeg)");
        }
        if (screen !== prev.screen) {
          if (screen === "on") chatLog.addSystem("[interactive] Screen capture active");
          else if (screen === "error") chatLog.addSystem("[interactive] Screen capture error");
        }
        if (camera !== prev.camera) {
          if (camera === "on") chatLog.addSystem("[interactive] Camera capture active");
          else if (camera === "error") chatLog.addSystem("[interactive] Camera error — imagesnap not found");
        }

        // Rebuild status line with new capture info
        const currentMode =
          mic === "on" || screen === "on" || camera === "on" ? "listening" : "idle";
        setActivityStatus(buildInteractiveStatusLine(currentMode));
        tui.requestRender();
        break;
      }
      case "interactive.transcript": {
        const text = typeof data.text === "string" ? data.text : "";
        const directed = Boolean(data.directed);
        const final = Boolean(data.final);
        if (text) {
          const prefix = directed ? "[directed]" : "[heard]";
          const suffix = final ? "" : " ...";
          chatLog.addSystem(`${prefix} ${text}${suffix}`);
          if (directed) {
            setActivityStatus(buildInteractiveStatusLine("directed"));
          }
          tui.requestRender();
        }
        break;
      }
      case "interactive.response.start": {
        setActivityStatus(buildInteractiveStatusLine("responding"));
        tui.requestRender();
        break;
      }
      case "interactive.response.delta": {
        break;
      }
      case "interactive.response.done": {
        const fullText = typeof data.fullText === "string" ? data.fullText : "";
        if (fullText) {
          chatLog.addSystem(`[interactive response] ${fullText}`);
        }
        setActivityStatus(buildInteractiveStatusLine("listening"));
        tui.requestRender();
        break;
      }
      case "interactive.response.audio": {
        chatLog.addSystem("[interactive] audio response received");
        tui.requestRender();
        break;
      }
      case "interactive.action": {
        const transcript = typeof data.transcript === "string" ? data.transcript : "";
        if (transcript) {
          chatLog.addSystem(`[interactive action] "${transcript}"`);
          setActivityStatus(buildInteractiveStatusLine("processing"));
          tui.requestRender();
        }
        break;
      }
    }
  };

  return { handleChatEvent, handleAgentEvent, handleInteractiveEvent };
}
