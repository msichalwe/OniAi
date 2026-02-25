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
import OniAvatar from "./OniAvatar";
import { eventBus } from "../../core/EventBus";
import useWindowStore from "../../stores/windowStore";
import { WIDGET_REGISTRY } from "../../core/widgetRegistry";
import "./OniWidget.css";

export default function OniWidget({ visible, onClose }) {
  const [emotion, setEmotion] = useState("neutral");
  const [action, setAction] = useState("idle");
  const [position, setPosition] = useState({ x: null, y: null });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef(null);

  // ─── Listen to OS events and react with emotions ───
  useEffect(() => {
    const setTemp = (emo, act, duration = 5000) => {
      setEmotion(emo);
      setAction(act);
      setTimeout(() => {
        setEmotion("neutral");
        setAction("idle");
      }, duration);
    };

    const handlers = {
      "command:executed": () => setTemp("happy", "success", 3000),
      "command:error": () => setTemp("frustrated", "error", 4000),
      "window:opened": () => setTemp("excited", "opening_widget", 3000),
      "window:closed": () => setTemp("neutral", "idle", 2000),
      "task:created": () => setTemp("determined", "scheduling", 3000),
      "task:completed": () => setTemp("proud", "complete", 4000),
      "notification:created": () => setTemp("curious", "listening", 3000),
      "theme:changed": () => setTemp("playful", "idle", 3000),
      "system:boot": () => setTemp("happy", "greeting", 5000),
    };

    Object.entries(handlers).forEach(([ev, fn]) => eventBus.on(ev, fn));
    return () =>
      Object.entries(handlers).forEach(([ev, fn]) => eventBus.off(ev, fn));
  }, []);

  // Sleepy after 60s idle
  useEffect(() => {
    if (action === "idle") {
      const t = setTimeout(() => setEmotion("sleepy"), 60000);
      return () => clearTimeout(t);
    }
  }, [action]);

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
      <div className="oni-widget-bubble" onClick={openChat}>
        <OniAvatar emotion={emotion} action={action} size={52} />
      </div>
    </div>
  );
}
