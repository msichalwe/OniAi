/**
 * OniChatWidget — Gateway-native AI chat widget.
 *
 * All AI processing happens through the Oni gateway.
 * No local OpenAI calls, no local agent loop, no API keys.
 * The gateway handles: agent brain, skills, memory, tool execution, streaming.
 *
 * Flow:
 *   User types → gateway.chatSend(message, sessionKey) → gateway processes →
 *   gateway streams deltas via /api/oni/chat SSE → widget renders response
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import OniChat from "./OniChat";
import { gateway } from "../../gateway/GatewayClient";
import { skillsRegistry } from "../../core/SkillsRegistry";
import { eventBus } from "../../core/EventBus";
import useWindowStore from "../../stores/windowStore";
import useDesktopStore from "../../stores/desktopStore";
import useThemeStore from "../../stores/themeStore";
import { widgetContext } from "../../core/WidgetContextProvider";
import "./OniChatWidget.css";

let _nanoid = 0;
const nanoid = () => `oni_${++_nanoid}_${Date.now().toString(36)}`;

const SESSION_KEY = "onios:main";

export default function OniChatWidget() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [emotion, setEmotion] = useState("neutral");
  const [action, setAction] = useState("idle");
  const abortRef = useRef(null);

  // Initialize AbortController
  useEffect(() => {
    abortRef.current = new AbortController();
    return () => abortRef.current?.abort();
  }, []);

  // Listen to kernel events for emotion changes
  const streamingRef = useRef(false);
  streamingRef.current = isStreaming;
  useEffect(() => {
    const handlers = {
      "command:executed": () => {
        if (!streamingRef.current) { setEmotion("happy"); setAction("complete"); }
      },
      "command:error": () => {
        if (!streamingRef.current) { setEmotion("frustrated"); setAction("error"); }
      },
      "task:created": () => {
        if (!streamingRef.current) { setEmotion("determined"); setAction("scheduling"); }
      },
      "task:completed": () => {
        if (!streamingRef.current) { setEmotion("proud"); setAction("success"); }
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
      const t = setTimeout(() => { setEmotion("neutral"); setAction("idle"); }, 8000);
      return () => clearTimeout(t);
    }
  }, [action]);

  // Gather live desktop context to send with chat messages
  const getDesktopContext = useCallback(() => {
    const windows = useWindowStore.getState().windows || [];
    const desktops = useDesktopStore.getState().desktops || [];
    const theme = useThemeStore.getState().theme || "dark";
    const focused = windows.find((w) => w.focused);
    return {
      windows: windows.map((w) => `${w.title || w.widgetType} (${w.widgetType})`).join(", ") || "none",
      desktops: `${desktops.length} desktops`,
      theme,
      time: new Date().toLocaleString(),
      focusedWindow: focused ? `${focused.title || focused.widgetType}` : "none",
    };
  }, []);

  // Add a status message to the chat
  const addStatusMessage = useCallback((content, type = "status") => {
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), role: "status", content, statusType: type, timestamp: Date.now() },
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

    // Try to reset gateway session
    if (gateway.connected) {
      try {
        await gateway.resetSession(SESSION_KEY);
        addStatusMessage("New session started", "success");
      } catch {
        // Gateway not connected — that's OK, just clear local state
      }
    }
  }, [addStatusMessage]);

  // ─── SEND MESSAGE — Gateway-native flow ────────────────

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
        // Build context for the gateway
        const context = getDesktopContext();

        // Send via Oni plugin chat endpoint (which calls `oni agent` CLI)
        // This goes through the gateway's full agent loop with skills, memory, etc.
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
                } else if (currentEvent === "done") {
                  // Response complete
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

        // Remove working status messages, add the assistant message
        setMessages((prev) => [
          ...prev.filter((m) => m.role !== "status" || m.statusType !== "working"),
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
          ...prev.filter((m) => m.role !== "status" || m.statusType !== "working"),
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
