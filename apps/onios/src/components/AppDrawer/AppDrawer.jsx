import React from "react";
import useWindowStore from "../../stores/windowStore";
import { WIDGET_REGISTRY } from "../../core/widgetRegistry";
import "./AppDrawer.css";

const WIDGET_GRADIENTS = {
  "file-explorer": "linear-gradient(135deg, #3B82F6, #1D4ED8)",
  terminal: "linear-gradient(135deg, #1E1E2E, #2D2D3D)",
  display: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
  maps: "linear-gradient(135deg, #10B981, #059669)",
  "media-player": "linear-gradient(135deg, #EC4899, #BE185D)",
  notes: "linear-gradient(135deg, #F59E0B, #D97706)",
  clock: "linear-gradient(135deg, #1E293B, #0F172A)",
  calculator: "linear-gradient(135deg, #64748B, #475569)",
  "activity-log": "linear-gradient(135deg, #A855F7, #7C3AED)",
  docs: "linear-gradient(135deg, #F97316, #EA580C)",
  settings: "linear-gradient(135deg, #6B7280, #4B5563)",
  "code-editor": "linear-gradient(135deg, #0EA5E9, #0284C7)",
  "document-viewer": "linear-gradient(135deg, #6366F1, #4F46E5)",
  "password-manager": "linear-gradient(135deg, #14B8A6, #0D9488)",
  storage: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
  camera: "linear-gradient(135deg, #EF4444, #DC2626)",
  "screen-capture": "linear-gradient(135deg, #06B6D4, #0891B2)",
  browser: "linear-gradient(135deg, #3B82F6, #2563EB)",
  drawing: "linear-gradient(135deg, #F472B6, #DB2777)",
  "oni-chat": "linear-gradient(135deg, #6B7280, #374151)",
};

export default function AppDrawer({ onClose }) {
  const openWindow = useWindowStore((s) => s.openWindow);

  const handleOpen = (type) => {
    const reg = WIDGET_REGISTRY[type];
    if (!reg) return;
    openWindow(
      type,
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
    onClose();
  };

  const widgets = Object.entries(WIDGET_REGISTRY).map(([key, val]) => ({
    type: key,
    title: val.title,
    icon: val.icon,
    gradient:
      WIDGET_GRADIENTS[key] || "linear-gradient(135deg, #667eea, #764ba2)",
  }));

  return (
    <div className="app-drawer-overlay" onClick={onClose}>
      <div className="app-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="app-drawer-header">
          <h2 className="app-drawer-title">All Apps</h2>
          <div className="app-drawer-subtitle">
            Click any app to open it as a window
          </div>
        </div>
        <div className="app-drawer-grid">
          {widgets.map(({ type, title, icon: Icon, gradient }) => (
            <button
              key={type}
              className="app-drawer-item"
              onClick={() => handleOpen(type)}
            >
              <div className="app-drawer-icon" style={{ background: gradient }}>
                <Icon />
              </div>
              <span className="app-drawer-label">{title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
