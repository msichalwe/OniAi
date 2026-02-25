/**
 * Desktop — The root shell component that renders the desktop environment.
 * Contains the window manager, taskbar, dock, and wallpaper.
 */

import { useState } from "react";
import { gatewayBridge } from "../bridge/OniGatewayBridge";
import type { ConnectionStatus } from "../bridge/OniGatewayBridge";

export function Desktop() {
  const [gatewayStatus, setGatewayStatus] = useState<ConnectionStatus>("disconnected");

  const handleConnect = async () => {
    try {
      await gatewayBridge.connect("ws://127.0.0.1:19100", "");
      setGatewayStatus("connected");
    } catch {
      setGatewayStatus("error");
    }
  };

  return (
    <div className="desktop">
      <div className="desktop-content">
        <div className="desktop-welcome">
          <h1>🦊 OniOS</h1>
          <p className="subtitle">AI-Powered Desktop Operating System</p>
          <div className="status-bar">
            <span className={`status-dot ${gatewayStatus}`} />
            <span className="status-text">
              Gateway: {gatewayStatus}
            </span>
          </div>
          {gatewayStatus === "disconnected" && (
            <button className="connect-btn" onClick={handleConnect}>
              Connect to Oni Gateway
            </button>
          )}
          <div className="info-grid">
            <div className="info-card">
              <h3>🖥️ 24 Widgets</h3>
              <p>Terminal, Browser, Code Editor, File Explorer, and more</p>
            </div>
            <div className="info-card">
              <h3>⌘ Command Pallet</h3>
              <p>Every action is a command — chainable, observable, AI-driven</p>
            </div>
            <div className="info-card">
              <h3>🔌 Gateway Bridge</h3>
              <p>Connected to Oni — same agent across all channels</p>
            </div>
            <div className="info-card">
              <h3>🧠 79 AI Skills</h3>
              <p>The AI sees what you see and acts through the same interface</p>
            </div>
          </div>
        </div>
      </div>
      <div className="taskbar">
        <div className="taskbar-left">
          <span className="taskbar-logo">🦊 OniOS</span>
        </div>
        <div className="taskbar-center">
          {/* Window tabs will go here */}
        </div>
        <div className="taskbar-right">
          <span className={`gateway-indicator ${gatewayStatus}`}>
            {gatewayStatus === "connected" ? "🟢" : "🔴"} Gateway
          </span>
          <span className="taskbar-time">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}
