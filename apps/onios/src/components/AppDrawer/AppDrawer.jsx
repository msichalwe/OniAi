import React from "react";
import useWindowStore from "../../stores/windowStore";
import { WIDGET_REGISTRY } from "../../core/widgetRegistry";
import "./AppDrawer.css";

const WIDGET_GRADIENTS = {
  "file-explorer": "linear-gradient(135deg, #2196F3, #1565C0)",
  terminal: "linear-gradient(135deg, #1B1B1B, #333333)",
  weather: "linear-gradient(135deg, #4FC3F7, #0288D1)",
  browser: "linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)",
  "web-search": "linear-gradient(135deg, #FF7043, #F4511E)",
  maps: "linear-gradient(135deg, #66BB6A, #2E7D32)",
  "media-player": "linear-gradient(135deg, #E91E63, #AD1457)",
  notes: "linear-gradient(135deg, #FFCA28, #FFB300)",
  clock: "linear-gradient(135deg, #1A1A2E, #16213E)",
  calculator: "linear-gradient(135deg, #78909C, #546E7A)",
  "activity-log": "linear-gradient(135deg, #AB47BC, #7B1FA2)",
  docs: "linear-gradient(135deg, #FF7043, #E64A19)",
  settings: "linear-gradient(135deg, #78909C, #455A64)",
  "code-editor": "linear-gradient(135deg, #007ACC, #1E9DE7)",
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

  const widgets = Object.entries(WIDGET_REGISTRY)
    .filter(([key]) => key !== "file-viewer") // hide internal viewers
    .map(([key, val]) => ({
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
