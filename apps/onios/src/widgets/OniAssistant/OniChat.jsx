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
  Info,
  Mic,
  MicOff,
} from "lucide-react";
import { eventBus } from "../../core/EventBus";
import "./OniChat.css";

// Custom markdown renderers to handle file paths, blank elements, and OniOS integration
const markdownComponents = {
  // Collapse empty paragraphs
  p: ({ children }) => {
    if (
      !children ||
      (Array.isArray(children) &&
        children.every(
          (c) => c === null || c === undefined || c === "" || c === "\n",
        ))
    )
      return null;
    return <p>{children}</p>;
  },
  // Handle images — open in media player if local, otherwise render normally
  img: ({ src, alt }) => {
    if (!src) return null;
    const isLocal =
      src.startsWith("/") || src.startsWith("~") || src.startsWith("file://");
    if (isLocal) {
      return (
        <button
          className="oni-chat-file-link"
          onClick={() =>
            eventBus.emit("command:execute", `system.media.playVideo("${src}")`)
          }
          title="Open in Media Player"
        >
          {alt || src.split("/").pop()}
        </button>
      );
    }
    return (
      <img
        src={src}
        alt={alt || ""}
        style={{ maxWidth: "100%", borderRadius: 6 }}
      />
    );
  },
  // Make links that point to local files open in OniOS widgets
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    const isFilePath =
      href.startsWith("/") ||
      href.startsWith("~") ||
      href.startsWith("file://");
    if (isFilePath) {
      return (
        <button
          className="oni-chat-file-link"
          onClick={() => openFileInOniOS(href)}
          title={`Open: ${href}`}
        >
          {children || href.split("/").pop()}
        </button>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  // Collapse empty pre blocks (wraps fenced code blocks)
  pre: ({ children }) => {
    if (!children) return null;
    // Check if the inner code element is empty
    if (React.isValidElement(children)) {
      const codeChildren = children.props?.children;
      if (!codeChildren || String(codeChildren).trim() === "") return null;
    }
    return <pre>{children}</pre>;
  },
  // Collapse empty code blocks
  code: ({ children, className }) => {
    const text = String(children || "").trim();
    if (!text) return null;
    if (className) {
      return <code className={className}>{children}</code>;
    }
    // Check if it's a file path
    if (/^[\/~].*\.\w+$/.test(text) || /^\/Users\//.test(text)) {
      return (
        <button
          className="oni-chat-file-link oni-chat-file-path"
          onClick={() => openFileInOniOS(text)}
          title={`Open: ${text}`}
        >
          {text}
        </button>
      );
    }
    return <code>{children}</code>;
  },
};

// Route file opens to appropriate OniOS widget
function openFileInOniOS(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];
  const videoExts = ["mp4", "webm", "mov", "avi", "mkv"];
  const audioExts = ["mp3", "wav", "ogg", "flac", "aac"];
  const codeExts = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "c",
    "cpp",
    "h",
    "css",
    "html",
    "json",
    "yaml",
    "yml",
    "toml",
    "md",
    "sh",
    "sql",
  ];

  if (
    imageExts.includes(ext) ||
    videoExts.includes(ext) ||
    audioExts.includes(ext)
  ) {
    eventBus.emit("command:execute", `system.media.playVideo("${path}")`);
  } else if (codeExts.includes(ext)) {
    eventBus.emit("command:execute", `code.openFile("${path}")`);
  } else if (ext === "pdf" || ext === "doc" || ext === "docx") {
    eventBus.emit("command:execute", `document.open("${path}")`);
  } else if (!ext) {
    // Likely a directory
    eventBus.emit("command:execute", `system.files.navigate("${path}")`);
  } else {
    eventBus.emit("command:execute", `viewer.openFile("${path}")`);
  }
}

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
  voiceState = null,
  onVoiceToggle,
  onVoiceMic,
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
            <div className="oni-chat-empty-emoji">✨</div>
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
              ) : msg.statusType === "info" ? (
                <Info size={12} className="oni-status-icon oni-status-info" />
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
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
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
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
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

      {/* Voice indicator bar */}
      {voiceState && voiceState.state !== "OFF" && (
        <div
          className={`oni-voice-bar oni-voice-${voiceState.state.toLowerCase()}`}
        >
          <div className="oni-voice-pulse" />
          <span className="oni-voice-label">
            {voiceState.state === "ACTIVATED" &&
              !voiceState.transcript &&
              !voiceState.interimTranscript &&
              "Listening... speak now"}
            {voiceState.state === "ACTIVATED" &&
              (voiceState.transcript || voiceState.interimTranscript) && (
                <>
                  {voiceState.transcript}
                  {voiceState.interimTranscript && (
                    <span className="oni-voice-interim">
                      {voiceState.transcript ? " " : ""}
                      {voiceState.interimTranscript}
                    </span>
                  )}
                </>
              )}
            {voiceState.state === "PROCESSING" && "Sending to Oni..."}
            {voiceState.state === "FOLLOW_UP" && "Anything else?"}
          </span>
        </div>
      )}

      {/* Input */}
      <div className="oni-chat-input-wrap">
        <textarea
          ref={inputRef}
          className="oni-chat-input"
          placeholder={
            voiceState?.state === "ACTIVATED"
              ? "Listening..."
              : "Ask Oni anything..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isStreaming}
        />
        {onVoiceMic && (
          <button
            className={`oni-chat-mic-btn ${voiceState?.state === "ACTIVATED" ? "oni-mic-active" : ""} ${voiceState?.state === "FOLLOW_UP" ? "oni-mic-on" : ""}`}
            onClick={onVoiceMic}
            title={
              voiceState?.state === "ACTIVATED"
                ? "Click to send"
                : voiceState?.state === "FOLLOW_UP"
                  ? "Listening for follow-up..."
                  : "Click to speak"
            }
          >
            {voiceState?.state === "ACTIVATED" ? (
              <MicOff size={16} />
            ) : (
              <Mic size={16} />
            )}
          </button>
        )}
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
