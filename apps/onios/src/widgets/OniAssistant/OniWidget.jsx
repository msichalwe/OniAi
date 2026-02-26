/**
 * OniWidget — Floating AI avatar bubble.
 *
 * This is ONLY the animated character bubble. It floats above everything.
 * Clicking the bubble opens the Oni Chat as a separate widget window.
 * The bubble reacts to OS events with emotion changes.
 *
 * Chat lives in OniChatWidget (registered in widgetRegistry).
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { MessageSquare } from "lucide-react";
// import OniAvatar from "./OniAvatar"; // Commented out — replaced with Siri-like orb
import { eventBus } from "../../core/EventBus";
import useWindowStore from "../../stores/windowStore";
import { WIDGET_REGISTRY } from "../../core/widgetRegistry";
import "./OniWidget.css";

export default function OniWidget({ visible, onClose }) {
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [position, setPosition] = useState({ x: null, y: null });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef(null);

  // ─── Listen to OS events and pulse the orb ───
  useEffect(() => {
    const pulse = (intensity = 1, duration = 2000) => {
      setGlowIntensity(intensity);
      setTimeout(() => setGlowIntensity(0), duration);
    };

    const handlers = {
      "command:executed": () => pulse(1, 2000),
      "command:error": () => pulse(0.8, 3000),
      "window:opened": () => pulse(0.6, 1500),
      "window:closed": () => pulse(0.3, 1000),
      "task:created": () => pulse(0.7, 2000),
      "task:completed": () => pulse(1, 2500),
      "notification:created": () => pulse(0.5, 2000),
      "system:boot": () => pulse(1, 4000),
    };

    Object.entries(handlers).forEach(([ev, fn]) => eventBus.on(ev, fn));
    return () =>
      Object.entries(handlers).forEach(([ev, fn]) => eventBus.off(ev, fn));
  }, []);

  // ─── Dragging ────────────────────────────
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    const el = widgetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  // ─── Open chat widget ────────────────────
  const openChat = useCallback(() => {
    const { openWindow } = useWindowStore.getState();
    const reg = WIDGET_REGISTRY["oni-chat"];
    if (!reg) return;
    openWindow(
      "oni-chat",
      {},
      {
        title: reg.title,
        icon: reg.icon,
        defaultWidth: reg.defaultWidth,
        defaultHeight: reg.defaultHeight,
        minWidth: reg.minWidth,
        minHeight: reg.minHeight,
      },
    );
  }, []);

  if (!visible) return null;

  const style = {};
  if (position.x !== null) {
    style.left = position.x;
    style.top = position.y;
    style.right = "auto";
    style.bottom = "auto";
  }

  return (
    <div
      ref={widgetRef}
      className={`oni-widget oni-widget-collapsed ${isDragging ? "oni-widget-dragging" : ""}`}
      style={style}
      onMouseDown={handleDragStart}
    >
      <div className="oni-widget-bubble oni-orb" onClick={openChat}>
        <div
          className={`oni-orb-core ${glowIntensity > 0 ? "oni-orb-active" : ""}`}
          style={{ "--orb-glow": glowIntensity }}
        />
      </div>
    </div>
  );
}
