/**
 * OniChatWidget — Gateway-native AI chat widget with live action updates.
 *
 * Architecture:
 *   1. User types a message
 *   2. Message is sent to /api/oni/chat (which calls `oni agent` CLI)
 *   3. Gateway AI processes and may call /api/oni/actions/* (terminal, notes, etc.)
 *   4. GatewayClient receives action events via /api/oni/events SSE
 *   5. Action events trigger local commandRegistry commands (widgets open/update)
 *   6. Chat UI shows live status of each action as it happens
 *   7. Final AI text response streams back via SSE
 *
 * This widget subscribes to gateway.onAction() to see what the AI is doing
 * in real-time, and shows status messages + executes widget commands.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import OniChat from "./OniChat";
import { gateway } from "../../gateway/GatewayClient";
import { commandRegistry } from "../../core/CommandRegistry";
import { eventBus } from "../../core/EventBus";
import useWindowStore from "../../stores/windowStore";
import useDesktopStore from "../../stores/desktopStore";
import useThemeStore from "../../stores/themeStore";
import { widgetContext } from "../../core/WidgetContextProvider";
import "./OniChatWidget.css";

let _nanoid = 0;
const nanoid = () => `oni_${++_nanoid}_${Date.now().toString(36)}`;

const SESSION_KEY = "onios:main";
const CHAT_STORAGE_KEY = "onios_chat_messages";
const MAX_STORED_MESSAGES = 100;

// Action type → human-readable label + emotion
const ACTION_LABELS = {
  task: { label: "Managing tasks", emotion: "determined" },
  window: { label: "Managing windows", emotion: "energetic" },
  note: { label: "Writing notes", emotion: "focused" },
  terminal: { label: "Running commands", emotion: "determined" },
  file: { label: "Working with files", emotion: "focused" },
  notification: { label: "Sending notification", emotion: "happy" },
  search: { label: "Searching the web", emotion: "curious" },
  calendar: { label: "Managing calendar", emotion: "determined" },
  storage: { label: "Accessing storage", emotion: "focused" },
  system: { label: "System operations", emotion: "energetic" },
  scheduler: { label: "Setting up scheduler", emotion: "determined" },
  workflow: { label: "Managing workflows", emotion: "determined" },
};

export default function OniChatWidget() {
  // Restore messages from localStorage on mount
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) return JSON.parse(saved).filter((m) => m.role !== "status");
    } catch {
      /* corrupt */
    }
    return [];
  });

  // Persist messages to localStorage on every change
  useEffect(() => {
    try {
      const toSave = messages
        .filter((m) => m.role !== "status")
        .slice(-MAX_STORED_MESSAGES);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      /* quota exceeded */
    }
  }, [messages]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [emotion, setEmotion] = useState("neutral");
  const [action, setAction] = useState("idle");
  const abortRef = useRef(null);
  const chatStartTimeRef = useRef(null);

  // Initialize AbortController
  useEffect(() => {
    abortRef.current = new AbortController();
    return () => abortRef.current?.abort();
  }, []);

  // ─── Subscribe to gateway action events ────────────────
  // This is how we see what the AI is doing in real-time
  const streamingRef = useRef(false);
  streamingRef.current = isStreaming;

  useEffect(() => {
    const unsub = gateway.onAction((event) => {
      // Only show events that happened during an active chat
      if (!streamingRef.current) return;
      if (!chatStartTimeRef.current) return;
      if (event.timestamp < chatStartTimeRef.current) return;

      const actionInfo = ACTION_LABELS[event.actionType] || {
        label: event.actionType,
        emotion: "energetic",
      };

      if (event.type === "action_start") {
        setEmotion(actionInfo.emotion);
        setAction("executing");

        // Build descriptive status message
        const desc = describeAction(event.actionType, event.params);
        addStatusMessage(desc, "working");
      }

      if (event.type === "action_done") {
        const resultDesc =
          event.result?.message || event.result?.success ? "Done" : "Failed";
        addStatusMessage(
          `${actionInfo.label}: ${resultDesc}`,
          event.result?.success !== false ? "success" : "error",
        );
      }

      if (event.type === "action_error") {
        addStatusMessage(`${actionInfo.label}: ${event.error}`, "error");
        setEmotion("frustrated");
      }
    });

    return unsub;
  }, []);

  // Listen to kernel events for emotion changes
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
      "gateway:command:executed": () => {
        if (streamingRef.current) {
          setEmotion("happy");
        }
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

  // Gather live desktop context to send with chat messages
  const getDesktopContext = useCallback(() => {
    const windows = useWindowStore.getState().windows || [];
    const desktops = useDesktopStore.getState().desktops || [];
    const theme = useThemeStore.getState().theme || "dark";
    const focused = windows.find((w) => w.focused);
    const liveState = widgetContext?.getSummary?.() || "";
    return {
      windows:
        windows
          .map((w) => `${w.title || w.widgetType} (${w.widgetType})`)
          .join(", ") || "none",
      desktops: `${desktops.length} desktops`,
      theme,
      time: new Date().toLocaleString(),
      focusedWindow: focused
        ? `${focused.title || focused.widgetType}`
        : "none",
      liveWidgetState: liveState,
    };
  }, []);

  // Add a status message to the chat
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

  // New chat — clear messages
  const handleNewChat = useCallback(async () => {
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
    setEmotion("neutral");
    setAction("idle");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    gateway.clearHistory();
  }, []);

  // ─── SEND MESSAGE ─────────────────────────────────────

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
      chatStartTimeRef.current = Date.now();

      try {
        const context = getDesktopContext();

        addStatusMessage("Sending to Oni gateway...", "working");
        setAction("generating");
        setEmotion("focused");

        const response = await fetch("/api/oni/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId: SESSION_KEY,
            context,
          }),
          signal: abortRef.current?.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Gateway error: ${response.status}`);
        }

        // Parse SSE stream from gateway
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        let currentEvent = "";

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
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEvent === "text_delta" && data.delta) {
                  fullText += data.delta;
                  setStreamingText(fullText);
                  // Once text starts flowing, switch emotion
                  if (fullText.length === data.delta.length) {
                    setEmotion("focused");
                    setAction("generating");
                  }
                } else if (currentEvent === "done") {
                  if (data.model) {
                    addStatusMessage(`Model: ${data.model}`, "info");
                  }
                } else if (currentEvent === "error") {
                  throw new Error(data.error || "Gateway response error");
                }
              } catch (e) {
                if (e.message && !e.message.includes("JSON")) throw e;
              }
            } else if (line.trim() === "") {
              currentEvent = "";
            }
          }
        }

        // Build final assistant message
        const assistantMsg = {
          id: nanoid(),
          role: "assistant",
          content: fullText || "Done!",
          timestamp: Date.now(),
        };

        // Remove "working" status messages, keep success/error/info, add the assistant message
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
          ...prev.filter(
            (m) => m.role !== "status" || m.statusType !== "working",
          ),
          {
            id: nanoid(),
            role: "assistant",
            content: `Oops! ${err.message}\n\nMake sure the Oni gateway is running (\`oni gateway run\`) and configured in Settings.`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsStreaming(false);
        setStreamingText("");
        chatStartTimeRef.current = null;
      }
    },
    [getDesktopContext, addStatusMessage],
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

// ─── Helper: Describe an action in human-readable text ───

function describeAction(actionType, params) {
  const action = params?.action || actionType;
  switch (actionType) {
    case "task":
      if (action === "create")
        return `Creating task: "${params.title || "Untitled"}"`;
      if (action === "list") return "Listing tasks...";
      if (action === "complete") return `Completing task ${params.id}`;
      return `Task: ${action}`;
    case "window":
      if (action === "open")
        return `Opening ${params.widgetType || "widget"}...`;
      if (action === "close") return `Closing window ${params.windowId}`;
      if (action === "list") return "Listing windows...";
      return `Window: ${action}`;
    case "note":
      if (action === "create")
        return `Creating note: "${params.title || "Untitled"}"`;
      if (action === "list") return "Listing notes...";
      if (action === "read") return `Reading note...`;
      return `Note: ${action}`;
    case "terminal":
      if (action === "open") return "Opening terminal...";
      if (action === "run")
        return `Running: ${params.command?.substring(0, 60) || "command"}`;
      return `Terminal: ${action}`;
    case "file":
      if (action === "list") return `Listing files in ${params.path || "~"}`;
      if (action === "read") return `Reading ${params.path}`;
      if (action === "write") return `Writing to ${params.path}`;
      return `File: ${action}`;
    case "notification":
      return `Sending notification: "${params.message || params.title || ""}"`;
    case "search":
      return `Searching: "${params.query || ""}"`;
    case "calendar":
      if (params.title) return `Adding event: "${params.title}"`;
      return "Calendar operation...";
    case "scheduler":
      if (action === "create_job")
        return `Creating job: "${params.name || ""}"`;
      return `Scheduler: ${action}`;
    case "workflow":
      return `Workflow: ${action}`;
    default:
      return `${actionType}: ${action}`;
  }
}
