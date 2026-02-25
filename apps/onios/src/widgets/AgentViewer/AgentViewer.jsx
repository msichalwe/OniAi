/**
 * AgentViewer — Shows a sub-agent's live activity, log, and status.
 *
 * Each sub-agent gets its own AgentViewer widget window so the user
 * can watch what the agent is doing in real-time.
 *
 * Props:
 *   agentId   — The agent to display
 *   windowId  — Window ID for widget context
 *   widgetType — Widget type string
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  CheckCircle,
  XCircle,
  Loader2,
  Pause,
  Play,
  Square,
  Wrench,
  MessageSquare,
  Clock,
  ChevronDown,
  Send,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { agentManager, AGENT_STATUS } from "../../core/AgentManager";
import { eventBus } from "../../core/EventBus";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./AgentViewer.css";

const STATUS_CONFIG = {
  [AGENT_STATUS.SPAWNING]: { icon: Loader2, color: "#ffb832", label: "Spawning", spin: true },
  [AGENT_STATUS.WORKING]: { icon: Zap, color: "#5082ff", label: "Working", spin: false },
  [AGENT_STATUS.WAITING]: { icon: Clock, color: "#ffb832", label: "Waiting", spin: false },
  [AGENT_STATUS.PAUSED]: { icon: Pause, color: "#888", label: "Paused", spin: false },
  [AGENT_STATUS.COMPLETED]: { icon: CheckCircle, color: "#50c878", label: "Completed", spin: false },
  [AGENT_STATUS.FAILED]: { icon: XCircle, color: "#ff5050", label: "Failed", spin: false },
  [AGENT_STATUS.CANCELLED]: { icon: Square, color: "#888", label: "Cancelled", spin: false },
};

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AgentViewer({ agentId, windowId, widgetType }) {
  const [agent, setAgent] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef(null);
  const logContainerRef = useRef(null);

  // Report widget context
  useWidgetContext(windowId, widgetType, {
    agentId,
    agentName: agent?.name || "Unknown",
    agentStatus: agent?.status || "unknown",
  });

  // Load agent and subscribe to updates
  useEffect(() => {
    const loadAgent = () => {
      const a = agentManager.get(agentId);
      if (a) setAgent({ ...a });
    };

    loadAgent();

    const onUpdate = (data) => {
      if (data.agentId === agentId) loadAgent();
    };
    const onLog = (data) => {
      if (data.agentId === agentId) loadAgent();
    };
    const onMessage = (data) => {
      if (data.message?.to === agentId || data.message?.from === agentId) loadAgent();
    };
    const onDone = (data) => {
      if (data.agentId === agentId) loadAgent();
    };

    eventBus.on("agent:update", onUpdate);
    eventBus.on("agent:log", onLog);
    eventBus.on("agent:message", onMessage);
    eventBus.on("agent:done", onDone);

    return () => {
      eventBus.off("agent:update", onUpdate);
      eventBus.off("agent:log", onLog);
      eventBus.off("agent:message", onMessage);
      eventBus.off("agent:done", onDone);
    };
  }, [agentId]);

  // Auto-scroll log
  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [agent?.log?.length, autoScroll]);

  // Handle scroll to detect manual scroll-up
  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // Send message to agent
  const sendMessage = useCallback(() => {
    const text = messageInput.trim();
    if (!text || !agentId) return;
    agentManager.sendMessage(null, agentId, text); // null = from main
    setMessageInput("");
  }, [messageInput, agentId]);

  // Cancel agent
  const cancelAgent = useCallback(() => {
    if (agentId) agentManager.cancel(agentId);
  }, [agentId]);

  if (!agent) {
    return (
      <div className="agent-viewer agent-viewer-empty">
        <Bot size={32} />
        <p>Agent not found: {agentId}</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG[AGENT_STATUS.WORKING];
  const StatusIcon = statusCfg.icon;
  const isActive = [AGENT_STATUS.SPAWNING, AGENT_STATUS.WORKING, AGENT_STATUS.WAITING].includes(agent.status);
  const duration = agent.completedAt
    ? formatDuration(agent.completedAt - agent.createdAt)
    : formatDuration(Date.now() - agent.createdAt);

  return (
    <div className="agent-viewer">
      {/* Header */}
      <div className="agent-viewer-header">
        <div className="agent-viewer-header-left">
          <div className="agent-viewer-status-dot" style={{ background: statusCfg.color }} />
          <div className="agent-viewer-info">
            <div className="agent-viewer-name">
              <Bot size={14} />
              <span>{agent.name}</span>
            </div>
            <div className="agent-viewer-meta">
              <StatusIcon
                size={11}
                className={statusCfg.spin ? "agent-spin" : ""}
                style={{ color: statusCfg.color }}
              />
              <span style={{ color: statusCfg.color }}>{statusCfg.label}</span>
              <span className="agent-viewer-duration">{duration}</span>
              <span className="agent-viewer-tools">{agent.toolCalls?.length || 0} tools</span>
            </div>
          </div>
        </div>
        {isActive && (
          <button className="agent-viewer-cancel" onClick={cancelAgent} title="Cancel agent">
            <Square size={12} />
          </button>
        )}
      </div>

      {/* Task */}
      <div className="agent-viewer-task">
        <span className="agent-viewer-task-label">Task:</span>
        <span className="agent-viewer-task-text">{agent.task}</span>
      </div>

      {/* Result (if completed) */}
      {agent.result && (
        <div className="agent-viewer-result">
          <CheckCircle size={12} />
          <span>{agent.result}</span>
        </div>
      )}

      {/* Error (if failed) */}
      {agent.error && (
        <div className="agent-viewer-error">
          <AlertTriangle size={12} />
          <span>{agent.error}</span>
        </div>
      )}

      {/* Activity Log */}
      <div
        className="agent-viewer-log"
        ref={logContainerRef}
        onScroll={handleScroll}
      >
        {(agent.log || []).map((entry) => (
          <div
            key={entry.id}
            className={`agent-log-entry agent-log-${entry.type}`}
          >
            <span className="agent-log-time">{formatTime(entry.timestamp)}</span>
            <span className="agent-log-icon">
              {entry.type === "tool" && <Wrench size={10} />}
              {entry.type === "message" && <MessageSquare size={10} />}
              {entry.type === "status" && <Zap size={10} />}
              {entry.type === "error" && <XCircle size={10} />}
              {entry.type === "result" && <CheckCircle size={10} />}
              {entry.type === "system" && <Bot size={10} />}
              {entry.type === "thinking" && <Loader2 size={10} />}
            </span>
            <span className="agent-log-content">{entry.content}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Scroll indicator */}
      {!autoScroll && (
        <button
          className="agent-viewer-scroll-btn"
          onClick={() => {
            logEndRef.current?.scrollIntoView({ behavior: "smooth" });
            setAutoScroll(true);
          }}
        >
          <ChevronDown size={12} />
        </button>
      )}

      {/* Message input (to communicate with the agent) */}
      {isActive && (
        <div className="agent-viewer-input">
          <input
            type="text"
            placeholder="Send message to agent..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />
          <button onClick={sendMessage} disabled={!messageInput.trim()}>
            <Send size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
