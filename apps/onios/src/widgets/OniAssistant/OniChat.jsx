/**
 * OniChat — Chat interface for the Oni AI assistant.
 *
 * Props:
 *   messages     — array of { id, role, content, toolCalls?, timestamp }
 *   onSend       — (text) => void
 *   isStreaming   — whether AI is currently generating
 *   streamingText — partial text being streamed
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Square,
  Loader2,
  Wrench,
  ChevronDown,
  CheckCircle,
  XCircle,
  Zap,
  MessageSquarePlus,
} from "lucide-react";
import "./OniChat.css";

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function OniChat({
  messages = [],
  onSend,
  isStreaming = false,
  streamingText = "",
  onStop,
  onNewChat,
}) {
  const [input, setInput] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Show scroll button when not at bottom
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setShowScrollBtn(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend?.(text);
    setInput("");
    inputRef.current?.focus();
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="oni-chat">
      {/* Header */}
      <div className="oni-chat-header">
        <span className="oni-chat-header-title">Oni Assistant</span>
        <button
          className="oni-chat-new-btn"
          onClick={onNewChat}
          title="New conversation"
          disabled={isStreaming}
        >
          <MessageSquarePlus size={14} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Messages */}
      <div
        className="oni-chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messages.length === 0 && !isStreaming && (
          <div className="oni-chat-empty">
            <div className="oni-chat-empty-emoji">🪁</div>
            <p>
              Hey! I'm <strong>Hailey</strong> — your AI sidekick.
              <br />
              <span className="oni-chat-empty-sub">
                What chaos shall we cause today?
              </span>
            </p>
            <div className="oni-chat-suggestions">
              <button onClick={() => onSend?.("What can you do?")}>
                ✨ What can you do?
              </button>
              <button onClick={() => onSend?.("Show my tasks and calendar")}>
                📋 Tasks & Calendar
              </button>
              <button
                onClick={() =>
                  onSend?.("Open the terminal and check disk space")
                }
              >
                💻 Terminal
              </button>
              <button
                onClick={() => onSend?.("Search the web for today's news")}
              >
                🔍 Search the web
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          // Status messages (lifecycle: working/success/error)
          if (msg.role === "status") {
            const icon =
              msg.statusType === "working" ? (
                <Zap size={12} className="oni-status-icon oni-status-working" />
              ) : msg.statusType === "success" ? (
                <CheckCircle
                  size={12}
                  className="oni-status-icon oni-status-success"
                />
              ) : (
                <XCircle
                  size={12}
                  className="oni-status-icon oni-status-error"
                />
              );
            return (
              <div
                key={msg.id}
                className={`oni-chat-status oni-chat-status-${msg.statusType}`}
              >
                {icon}
                <span className="oni-status-text">{msg.content}</span>
              </div>
            );
          }

          // Regular messages (user/assistant)
          return (
            <div
              key={msg.id}
              className={`oni-chat-msg oni-chat-msg-${msg.role}`}
            >
              <div className="oni-chat-msg-content">
                {msg.role === "assistant" && msg.toolCalls?.length > 0 && (
                  <div className="oni-chat-tool-calls">
                    {msg.toolCalls.map((tc, i) => (
                      <div
                        key={i}
                        className={`oni-chat-tool-call ${tc.success === false ? "oni-tool-failed" : ""}`}
                      >
                        <Wrench size={11} />
                        <span className="oni-tool-name">{tc.name}</span>
                        {tc.result && (
                          <span className="oni-tool-result">
                            {typeof tc.result === "string"
                              ? tc.result.substring(0, 80)
                              : "Done"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="oni-chat-msg-text">
                  {msg.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content || ""}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
              <div className="oni-chat-msg-time">
                {formatTime(msg.timestamp)}
              </div>
            </div>
          );
        })}

        {/* Streaming message */}
        {isStreaming && streamingText && (
          <div className="oni-chat-msg oni-chat-msg-assistant oni-chat-msg-streaming">
            <div className="oni-chat-msg-content">
              <div className="oni-chat-msg-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingText || ""}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isStreaming && !streamingText && (
          <div className="oni-chat-msg oni-chat-msg-assistant oni-chat-typing">
            <div className="oni-chat-msg-content">
              <div className="oni-typing-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button className="oni-chat-scroll-btn" onClick={scrollToBottom}>
          <ChevronDown size={14} />
        </button>
      )}

      {/* Input */}
      <div className="oni-chat-input-wrap">
        <textarea
          ref={inputRef}
          className="oni-chat-input"
          placeholder="Ask Oni anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            className="oni-chat-send-btn oni-chat-stop-btn"
            onClick={onStop}
            title="Stop"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            className="oni-chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            title="Send"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
