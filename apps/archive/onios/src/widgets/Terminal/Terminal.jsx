import React, { useRef, useEffect, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useWidgetContext } from "../../core/useWidgetContext";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";

// Global registry so command system can send input to terminal instances
const terminalInstances = new Map();
let instanceCounter = 0;
const _readyWaiters = [];

export function getTerminalInstance(id) {
  if (id) return terminalInstances.get(id);
  // Return the most recent instance
  const entries = [...terminalInstances.values()];
  return entries[entries.length - 1] || null;
}

export function sendTerminalInput(data, id) {
  const inst = getTerminalInstance(id);
  if (inst?.ws?.readyState === WebSocket.OPEN) {
    inst.ws.send(JSON.stringify({ type: "input", data }));
    return true;
  }
  return false;
}

/**
 * Wait for any terminal instance to become ready (WebSocket open).
 * Resolves immediately if one is already open. Times out after `ms`.
 */
export function waitForTerminalReady(ms = 8000) {
  // Check if any instance is already ready
  for (const inst of terminalInstances.values()) {
    if (inst?.ws?.readyState === WebSocket.OPEN) return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const idx = _readyWaiters.indexOf(resolve);
      if (idx >= 0) _readyWaiters.splice(idx, 1);
      resolve(false); // timed out
    }, ms);
    _readyWaiters.push((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}

function _notifyReady() {
  while (_readyWaiters.length > 0) {
    const cb = _readyWaiters.shift();
    cb(true);
  }
}

export default function TerminalWidget({ windowId, widgetType }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);
  const mountedRef = useRef(true);
  const instanceIdRef = useRef(null);
  const [status, setStatus] = useState("connecting"); // connecting | connected | error
  const reconnectTimerRef = useRef(null);
  const outputBufferRef = useRef([]);
  const MAX_CONTEXT_LINES = 30;
  const [recentOutput, setRecentOutput] = useState([]);

  const connectWs = useCallback((term) => {
    if (!mountedRef.current) return;
    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/terminal`,
    );
    wsRef.current = ws;

    // Register this instance for command API
    if (instanceIdRef.current !== null) {
      terminalInstances.set(instanceIdRef.current, { ws, term });
    }

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      ws._wasConnected = true;
      setStatus("connected");
      // Update instance registry with live ws reference
      if (instanceIdRef.current !== null) {
        terminalInstances.set(instanceIdRef.current, { ws, term });
      }
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        }),
      );
      // Signal any callers waiting for terminal to be ready
      _notifyReady();
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output") {
          term.write(msg.data);
          // Capture output for context awareness
          const lines = msg.data.split(/\r?\n/).filter((l) => l.trim());
          if (lines.length > 0) {
            const buf = outputBufferRef.current;
            buf.push(
              ...lines
                .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
                .filter(Boolean),
            );
            if (buf.length > MAX_CONTEXT_LINES)
              outputBufferRef.current = buf.slice(-MAX_CONTEXT_LINES);
            setRecentOutput([...outputBufferRef.current]);
          }
        } else if (msg.type === "exit") {
          term.writeln(
            `\r\n\x1b[33m[Process exited with code ${msg.exitCode}]\x1b[0m`,
          );
        }
      } catch {
        term.write(event.data);
      }
    };

    ws.onerror = () => {
      // Suppress errors from strict-mode cleanup (unmount before connect)
      if (!mountedRef.current || ws._intentionalClose) return;
    };

    ws.onclose = () => {
      // If this was an intentional close (cleanup/unmount), don't reconnect
      if (ws._intentionalClose || !mountedRef.current) return;
      setStatus((prev) => {
        if (prev === "connected") return "error";
        return prev;
      });
      const delay = ws._wasConnected ? 2000 : 500;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          if (ws._wasConnected) {
            term.writeln("\r\n\x1b[90m[Reconnecting...]\x1b[0m");
          }
          connectWs(term);
        }
      }, delay);
    };

    // Terminal → WebSocket
    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    return () => {
      dataDisposable.dispose();
      // Mark as intentional so onclose/onerror don't trigger reconnect or errors
      ws._intentionalClose = true;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    mountedRef.current = true;
    instanceIdRef.current = ++instanceCounter;

    const term = new Terminal({
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      theme: {
        background: "transparent",
        foreground: "#e0e0e0",
        cursor: "#667eea",
        cursorAccent: "#1a1a2e",
        selectionBackground: "rgba(102, 126, 234, 0.3)",
        black: "#1a1a2e",
        red: "#ff5f57",
        green: "#28c840",
        yellow: "#ffbd2e",
        blue: "#667eea",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e0e0e0",
        brightBlack: "#555570",
        brightRed: "#ff6b6b",
        brightGreen: "#30d158",
        brightYellow: "#ffd60a",
        brightBlue: "#818cf8",
        brightMagenta: "#e879f9",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    const cleanupWs = connectWs(term);

    // Handle resize
    const handleResize = () => {
      try {
        fitAddon.fit();
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: term.cols,
              rows: term.rows,
            }),
          );
        }
      } catch {}
    };

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(containerRef.current);

    term.focus();

    // Report live context for AI agents
    // (context hook is called below, outside useEffect)

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      terminalInstances.delete(instanceIdRef.current);
      resizeObserver.disconnect();
      cleanupWs?.();
      term.dispose();
    };
  }, [connectWs]);

  // Report live context for AI agents
  useWidgetContext(windowId, "terminal", {
    status,
    instanceId: instanceIdRef.current,
    recentOutput: recentOutput.slice(-20),
    lineCount: recentOutput.length,
  });

  return (
    <div className="terminal-widget" onClick={() => termRef.current?.focus()}>
      <div className="terminal-xterm-container" ref={containerRef} />
      {status === "error" && (
        <div className="terminal-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: "6px" }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          Connection failed — retrying…
        </div>
      )}
      {status === "connecting" && (
        <div className="terminal-connecting">Connecting…</div>
      )}
    </div>
  );
}
