/**
 * OniChatWidget — Standalone AI chat widget (opens as a regular window).
 *
 * This is separate from the floating Oni bubble.
 * AI runs in the kernel (server-side) — this widget just sends messages
 * and renders streaming responses. No direct OpenAI calls from frontend.
 *
 * Uses SkillsRegistry for typed tool calls with real execution + lifecycle.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import OniChat from "./OniChat";
import { aiMemory } from "../../core/AIMemoryService";
import { skillsRegistry } from "../../core/SkillsRegistry";
import { eventBus } from "../../core/EventBus";
import useWindowStore from "../../stores/windowStore";
import useDesktopStore from "../../stores/desktopStore";
import useThemeStore from "../../stores/themeStore";
import { widgetContext } from "../../core/WidgetContextProvider";
import { agentManager } from "../../core/AgentManager";
import "./OniChatWidget.css";

let _nanoid = 0;
const nanoid = () => `oni_${++_nanoid}_${Date.now().toString(36)}`;

// Action → emotion mapping for skill groups
const GROUP_ACTIONS = {
  terminal: { action: "running_command", emotion: "determined" },
  files: { action: "writing", emotion: "focused" },
  browser: { action: "browsing", emotion: "curious" },
  search: { action: "searching", emotion: "curious" },
  tasks: { action: "scheduling", emotion: "determined" },
  calendar: { action: "scheduling", emotion: "determined" },
  code: { action: "coding", emotion: "focused" },
  notes: { action: "writing", emotion: "focused" },
  documents: { action: "reading", emotion: "curious" },
  calculator: { action: "thinking", emotion: "thinking" },
  settings: { action: "executing", emotion: "playful" },
  weather: { action: "searching", emotion: "curious" },
  passwords: { action: "executing", emotion: "focused" },
  workflows: { action: "executing", emotion: "determined" },
  scheduler: { action: "scheduling", emotion: "determined" },
  windows: { action: "executing", emotion: "energetic" },
  desktops: { action: "executing", emotion: "energetic" },
  system: { action: "executing", emotion: "happy" },
  media: { action: "executing", emotion: "playful" },
  maps: { action: "browsing", emotion: "curious" },
  storage: { action: "executing", emotion: "focused" },
  camera: { action: "executing", emotion: "playful" },
  agents: { action: "executing", emotion: "determined" },
  context: { action: "thinking", emotion: "curious" },
};

export default function OniChatWidget() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [emotion, setEmotion] = useState("neutral");
  const [action, setAction] = useState("idle");
  const [conversationId, setConversationId] = useState(null);
  const [aiMode, setAiMode] = useState("personal"); // 'personal' | 'oni'
  const abortRef = useRef(null);

  const CONV_KEY = "onios_chat_conversation_id";

  // Initialize conversation + AbortController + check AI mode (run once)
  useEffect(() => {
    async function initConversation() {
      // Try to restore the last conversation
      const savedId = localStorage.getItem(CONV_KEY);
      if (savedId) {
        try {
          const conv = await aiMemory.getConversation(savedId);
          if (conv?.messages?.length > 0) {
            // Restore messages (filter out tool/status messages for clean display)
            const restored = conv.messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                id: nanoid(),
                role: m.role,
                content: m.content || "",
                timestamp: m.timestamp
                  ? new Date(m.timestamp).getTime()
                  : Date.now(),
              }));
            if (restored.length > 0) {
              setMessages(restored);
            }
            setConversationId(savedId);
            return;
          }
        } catch {
          /* conversation not found or error — create new */
        }
      }

      // No saved conversation or it was empty — create new
      const res = await aiMemory.createConversation("Oni Chat");
      if (res?.conversation?.id) {
        setConversationId(res.conversation.id);
        localStorage.setItem(CONV_KEY, res.conversation.id);
      }
    }

    initConversation();
    fetch("/api/oni/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg?.mode) setAiMode(cfg.mode);
      })
      .catch(() => {});
    abortRef.current = new AbortController();
    return () => abortRef.current?.abort();
  }, []);

  // Persist conversationId to localStorage whenever it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(CONV_KEY, conversationId);
    }
  }, [conversationId]);

  // New chat — clear messages, create fresh conversation
  const handleNewChat = useCallback(async () => {
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
    setEmotion("neutral");
    setAction("idle");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const res = await aiMemory.createConversation("Oni Chat");
      if (res?.conversation?.id) {
        setConversationId(res.conversation.id);
        localStorage.setItem(CONV_KEY, res.conversation.id);
      }
    } catch {
      setConversationId(null);
    }
  }, []);

  // Listen to kernel events for emotion changes
  const streamingRef = useRef(false);
  streamingRef.current = isStreaming;
  useEffect(() => {
    const handlers = {
      "command:executed": () => {
        if (!streamingRef.current) {
          setEmotion("happy");
          setAction("complete");
        }
      },
      "command:error": () => {
        if (!streamingRef.current) {
          setEmotion("frustrated");
          setAction("error");
        }
      },
      "task:created": () => {
        if (!streamingRef.current) {
          setEmotion("determined");
          setAction("scheduling");
        }
      },
      "task:completed": () => {
        if (!streamingRef.current) {
          setEmotion("proud");
          setAction("success");
        }
      },
      "window:opened": () => {
        if (!streamingRef.current) setEmotion("excited");
      },
    };
    Object.entries(handlers).forEach(([evt, fn]) => eventBus.on(evt, fn));
    return () => {
      Object.entries(handlers).forEach(([evt, fn]) => eventBus.off(evt, fn));
    };
  }, []);

  // Idle emotion timeout
  useEffect(() => {
    if (action === "idle" || action === "complete" || action === "success") {
      const t = setTimeout(() => {
        setEmotion("neutral");
        setAction("idle");
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [action]);

  // Gather live kernel state for context (includes open widget context + live state)
  const getKernelState = useCallback(() => {
    const windows = useWindowStore.getState().windows || [];
    const desktops = useDesktopStore.getState().desktops || [];
    const activeDesktop = useDesktopStore.getState().activeDesktop ?? 0;
    const theme = useThemeStore.getState().theme || "dark";
    const focused = windows.find((w) => w.focused);
    return {
      windows:
        windows
          .map(
            (w) =>
              `${w.title || w.widgetType} (${w.id?.slice(0, 6)}, type:${w.widgetType})`,
          )
          .join(", ") || "none",
      desktops: `${desktops.length} desktops, active: ${desktops[activeDesktop]?.name || activeDesktop}`,
      theme,
      time: new Date().toLocaleString(),
      focusedWindow: focused
        ? `${focused.title || focused.widgetType}`
        : "none",
      openWidgets: skillsRegistry.getOpenWidgetContext(),
      // Live widget state — includes terminal output, browser URL, file paths, etc.
      liveWidgetState: widgetContext.getSummary(),
      // Sub-agent status
      subAgents: agentManager.getSummary(),
    };
  }, []);

  // ─── Add a lifecycle status message to the chat ─
  const addStatusMessage = useCallback((content, type = "status") => {
    setMessages((prev) => [
      ...prev,
      {
        id: nanoid(),
        role: "status",
        content,
        statusType: type,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // ─── Parse an SSE stream and return { text, toolCalls, responseId } ─
  const parseSSEStream = useCallback(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let toolCallsAccum = {};
    let buffer = "";
    let currentEvent = "";
    let responseId = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const evtName = currentEvent || "unknown";
          try {
            const data = JSON.parse(line.slice(6));

            if (evtName === "response_id" && data.id) {
              responseId = data.id;
            } else if (evtName === "text_delta" && data.delta) {
              fullText += data.delta;
              setStreamingText(fullText);
            } else if (evtName === "text_done") {
              if (data.text) fullText = data.text;
            } else if (evtName === "tool_delta") {
              const idx = data.index || 0;
              if (!toolCallsAccum[idx])
                toolCallsAccum[idx] = { name: "", arguments: "", callId: "" };
              if (data.name) toolCallsAccum[idx].name = data.name;
              if (data.callId) toolCallsAccum[idx].callId = data.callId;
              if (data.arguments_delta)
                toolCallsAccum[idx].arguments += data.arguments_delta;
            } else if (evtName === "tool_done") {
              const idx = data.index || 0;
              if (!toolCallsAccum[idx])
                toolCallsAccum[idx] = { name: "", arguments: "", callId: "" };
              toolCallsAccum[idx].name =
                data.name || toolCallsAccum[idx].name || "";
              toolCallsAccum[idx].arguments =
                data.arguments || toolCallsAccum[idx].arguments || "";
              if (data.callId) toolCallsAccum[idx].callId = data.callId;
            } else if (evtName === "done") {
              if (data.responseId) responseId = data.responseId;
            } else if (evtName === "error") {
              throw new Error(data.error || "AI response error");
            }
          } catch (e) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        } else if (line.trim() === "") {
          currentEvent = "";
        }
      }
    }

    const toolCalls = Object.values(toolCallsAccum).filter((tc) => tc.name);
    return { text: fullText, toolCalls, responseId };
  }, []);

  // ─── Execute skills and return results for the agent loop ─
  const executeSkills = useCallback(
    async (toolCalls) => {
      const results = [];
      const total = toolCalls.length;

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const skillId = tc.name;
        const skill = skillsRegistry.get(skillId);

        let params = {};
        try {
          params = JSON.parse(tc.arguments || "{}");
        } catch {
          /* empty */
        }

        // Set emotion based on skill group
        const groupState = GROUP_ACTIONS[skill?.group] || {
          action: "executing",
          emotion: "energetic",
        };
        setAction(groupState.action);
        setEmotion(groupState.emotion);

        // Lifecycle: NOTIFY
        const stepPrefix = total > 1 ? `Step ${i + 1}/${total}: ` : "";
        const skillLabel = skill?.description || skillId;
        const paramSummary = Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(
            ([k, v]) =>
              `${k}: ${typeof v === "string" && v.length > 40 ? v.slice(0, 40) + "..." : v}`,
          )
          .join(", ");
        addStatusMessage(
          `${stepPrefix}${skillLabel}${paramSummary ? ` (${paramSummary})` : ""}`,
          "working",
        );

        // Lifecycle: EXECUTE
        const result = await skillsRegistry.execute(skillId, params);

        // Lifecycle: REPORT
        if (result.success) {
          addStatusMessage(
            `${stepPrefix}${result.result || "Done"}`,
            "success",
          );
        } else {
          addStatusMessage(`${stepPrefix}Failed: ${result.error}`, "error");
        }

        results.push({
          callId: tc.callId || `call_${i}`,
          name: skillId,
          arguments: tc.arguments || "{}",
          result: result.result || result.error || "Done",
          success: result.success,
        });
      }

      return results;
    },
    [addStatusMessage],
  );

  // ─── AGENT LOOP: Send message → get response → execute tools → continue → repeat ─
  const MAX_AGENT_TURNS = 15;

  const handleSend = useCallback(
    async (text) => {
      const userMsg = {
        id: nanoid(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setEmotion("thinking");
      setAction("thinking");
      setIsStreaming(true);
      setStreamingText("");

      try {
        const tools = skillsRegistry.toPrimaryTools();
        const isOni = aiMode === "oni";
        // Always use native agent loop — workspace mode handled server-side
        const chatEndpoint = "/api/ai/chat";

        // ─── Turn 1: Initial request ─────────────────────────
        setAction("generating");
        setEmotion("focused");
        if (isOni) addStatusMessage("Sending to Hailey...", "working");

        const requestBody = {
          userMessage: text,
          conversationId,
          kernelState: getKernelState(),
          tools: tools.length > 0 ? tools : undefined,
          ...(isOni && { aiMode: "oni" }),
        };

        const response = await fetch(chatEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: abortRef.current?.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${response.status}`);
        }

        let parsed = await parseSSEStream(response);
        let allExecutedTools = [];
        let finalText = parsed.text;
        let responseId = parsed.responseId;

        // ─── Check for respond_to_user escape-hatch ─────────────
        // When tool_choice is 'required', the model calls respond_to_user
        // for conversational messages. Extract the message and skip the loop.
        const respondCall = parsed.toolCalls.find(
          (tc) => tc.name === "respond_to_user",
        );
        if (respondCall) {
          try {
            const params = JSON.parse(respondCall.arguments || "{}");
            finalText = params.message || finalText;
          } catch {
            /* use finalText as-is */
          }
          // Clear tool calls so we skip the agent loop
          parsed.toolCalls = [];
        }

        // ─── Agent loop: execute tools → send results → verify goal → repeat ─
        let turn = 0;
        while (parsed.toolCalls.length > 0 && turn < MAX_AGENT_TURNS) {
          turn++;
          setStreamingText("");

          // Execute skills
          setAction("executing");
          setEmotion("energetic");
          const toolResults = await executeSkills(parsed.toolCalls);
          allExecutedTools.push(...toolResults);

          // Send results back to LLM — it will verify the goal and either
          // call more tools (continue) or respond with text (done)
          setAction("generating");
          setEmotion("thinking");
          addStatusMessage(
            turn > 1
              ? `Agent turn ${turn} — verifying goal...`
              : "Evaluating results...",
            "working",
          );

          const continueResponse = await fetch("/api/ai/chat/continue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId,
              toolResults,
              tools: tools.length > 0 ? tools : undefined,
              previousResponseId: responseId,
              kernelState: getKernelState(),
              ...(isOni && { aiMode: "oni" }),
            }),
            signal: abortRef.current?.signal,
          });

          if (!continueResponse.ok) {
            const errData = await continueResponse.json().catch(() => ({}));
            console.warn("[OniChat] Continue error:", errData);
            break;
          }

          parsed = await parseSSEStream(continueResponse);
          if (parsed.text) finalText = parsed.text;
          if (parsed.responseId) responseId = parsed.responseId;

          // Check if the AI signaled "goal achieved" via respond_to_user
          const doneCall = parsed.toolCalls.find(
            (tc) => tc.name === "respond_to_user",
          );
          if (doneCall) {
            try {
              const params = JSON.parse(doneCall.arguments || "{}");
              finalText = params.message || finalText;
            } catch {
              /* use finalText */
            }
            parsed.toolCalls = []; // Stop looping
          }
        }

        // ─── Build final assistant message ─────────────────────
        const assistantMsg = {
          id: nanoid(),
          role: "assistant",
          content:
            finalText ||
            (allExecutedTools.length > 0
              ? allExecutedTools
                  .map((t) => `**${t.name}**: ${t.result}`)
                  .join("\n")
              : "Done!"),
          toolCalls: allExecutedTools.length > 0 ? allExecutedTools : undefined,
          timestamp: Date.now(),
        };

        // Remove working status messages, then add the assistant message
        setMessages((prev) => [
          ...prev.filter(
            (m) => m.role !== "status" || m.statusType !== "working",
          ),
          assistantMsg,
        ]);
        setAction("success");
        setEmotion("happy");
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("[OniChat] Error:", err);
        setAction("error");
        setEmotion("frustrated");

        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: `Oops! Something went wrong: ${err.message}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsStreaming(false);
        setStreamingText("");
      }
    },
    [
      conversationId,
      aiMode,
      getKernelState,
      addStatusMessage,
      parseSSEStream,
      executeSkills,
    ],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsStreaming(false);
    setStreamingText("");
    setAction("cancelled");
    setEmotion("relieved");
  }, []);

  return (
    <div className="oni-chat-widget">
      <OniChat
        messages={messages}
        onSend={handleSend}
        isStreaming={isStreaming}
        streamingText={streamingText}
        onStop={handleStop}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
