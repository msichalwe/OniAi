/**
 * TabletDesktop — Netflix-style tablet/kiosk layout.
 *
 * Left panel (~32%):  Oni AI Chat — full height, always visible
 * Right panel (~68%): CSS grid of widget tiles — fixed, non-draggable, scrollable
 * Top bar:            Time, status indicators
 *
 * Renders existing widgets from windowStore as compact tiles.
 * Also shows quick-launch tiles for common widgets when no windows are open.
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  Cloud,
  Globe,
  FileText,
  Clock,
  Calculator,
  BookOpen,
  Settings,
  Code,
  Activity,
  Database,
  HardDrive,
  Folder,
  Terminal,
  Mic,
  Plus,
  X,
} from "lucide-react";
import useWindowStore from "../../stores/windowStore";
import useThemeStore from "../../stores/themeStore";
import { WIDGET_REGISTRY } from "../../core/widgetRegistry";
import { voiceEngine } from "../../core/VoiceEngine";
import OniChatWidget from "../../widgets/OniAssistant/OniChatWidget";
import "./TabletDesktop.css";

const WALLPAPER_STYLES = {
  "gradient-dusk":
    "linear-gradient(145deg, #0a0a1a 0%, #0f0f2d 30%, #1a0a2e 60%, #0a0a1a 100%)",
  "gradient-ocean":
    "linear-gradient(145deg, #0a1628 0%, #0d3b66 40%, #1a5276 70%, #0a1628 100%)",
  "gradient-aurora":
    "linear-gradient(145deg, #0f2027 0%, #203a43 30%, #2c5364 60%, #0f2027 100%)",
  "gradient-sunset":
    "linear-gradient(145deg, #1a0a1e 0%, #2d1b3d 30%, #4a2040 60%, #1a0a1e 100%)",
  "gradient-forest":
    "linear-gradient(145deg, #0a1a0f 0%, #1a3a1f 30%, #2a4a2f 60%, #0a1a0f 100%)",
  "gradient-light":
    "linear-gradient(145deg, #e8ecf1 0%, #d5dbe3 30%, #c8d0da 60%, #e8ecf1 100%)",
  "gradient-warm":
    "linear-gradient(145deg, #f5f0e8 0%, #e8ddd0 30%, #ddd0c0 60%, #f5f0e8 100%)",
  "gradient-sky":
    "linear-gradient(145deg, #dce8f5 0%, #b0c8e8 30%, #89b0d8 60%, #dce8f5 100%)",
  "gradient-lavender":
    "linear-gradient(145deg, #e8e0f0 0%, #d0c0e8 30%, #b8a8d8 60%, #e8e0f0 100%)",
};

const QUICK_TILES = [
  { type: "weather", icon: Cloud, label: "Weather", gradient: "linear-gradient(135deg, #4FC3F7, #0288D1)" },
  { type: "notes", icon: FileText, label: "Notes", gradient: "linear-gradient(135deg, #FFCA28, #FFB300)" },
  { type: "terminal", icon: Terminal, label: "Terminal", gradient: "linear-gradient(135deg, #1B1B1B, #333333)" },
  { type: "browser", icon: Globe, label: "Browser", gradient: "linear-gradient(135deg, #4285F4, #34A853)" },
  { type: "file-explorer", icon: Folder, label: "Files", gradient: "linear-gradient(135deg, #2196F3, #1565C0)" },
  { type: "code-editor", icon: Code, label: "Code", gradient: "linear-gradient(135deg, #007ACC, #1E9DE7)" },
  { type: "calculator", icon: Calculator, label: "Calc", gradient: "linear-gradient(135deg, #78909C, #546E7A)" },
  { type: "clock", icon: Clock, label: "Clock", gradient: "linear-gradient(135deg, #AB47BC, #7B1FA2)" },
  { type: "docs", icon: BookOpen, label: "Docs", gradient: "linear-gradient(135deg, #FF7043, #E64A19)" },
  { type: "activity-log", icon: Activity, label: "Activity", gradient: "linear-gradient(135deg, #AB47BC, #7B1FA2)" },
  { type: "storage", icon: Database, label: "Storage", gradient: "linear-gradient(135deg, #26A69A, #00897B)" },
  { type: "settings", icon: Settings, label: "Settings", gradient: "linear-gradient(135deg, #78909C, #455A64)" },
];

export default function TabletDesktop() {
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const wallpaper = useThemeStore((s) => s.wallpaper);
  const customWallpaper = useThemeStore((s) => s.customWallpaper);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [voiceState, setVoiceState] = useState({ state: "OFF" });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = voiceEngine.onStateChange((data) =>
      setVoiceState({ ...data }),
    );
    return unsub;
  }, []);

  const handleOrbClick = useCallback(() => {
    voiceEngine.activate();
  }, []);

  const handleOpenTile = useCallback(
    (type) => {
      const reg = WIDGET_REGISTRY[type];
      if (!reg) return;
      openWindow(type, {}, {
        title: reg.title,
        icon: reg.icon,
        defaultWidth: reg.defaultWidth,
        defaultHeight: reg.defaultHeight,
        minWidth: reg.minWidth,
        minHeight: reg.minHeight,
      });
    },
    [openWindow],
  );

  const handleCloseTile = useCallback(
    (e, winId) => {
      e.stopPropagation();
      closeWindow(winId);
    },
    [closeWindow],
  );

  // Active windows that have widget components
  const activeTiles = useMemo(() => {
    return windows
      .filter((w) => !w.isMinimized && WIDGET_REGISTRY[w.widgetType])
      .filter((w) => w.widgetType !== "oni-chat");
  }, [windows]);

  // Quick tiles that aren't already open (for singleton widgets)
  const availableQuickTiles = useMemo(() => {
    const openTypes = new Set(activeTiles.map((w) => w.widgetType));
    return QUICK_TILES.filter((t) => {
      const reg = WIDGET_REGISTRY[t.type];
      if (!reg) return false;
      if (reg.singleton && openTypes.has(t.type)) return false;
      return true;
    });
  }, [activeTiles]);

  const bgStyle =
    WALLPAPER_STYLES[wallpaper] || WALLPAPER_STYLES["gradient-dusk"];
  const desktopStyle =
    wallpaper === "custom" && customWallpaper
      ? {
          backgroundImage: `url(${customWallpaper})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : { background: bgStyle };

  const timeStr = currentTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = currentTime.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="tablet-desktop" style={desktopStyle}>
      {/* Top Status Bar */}
      <div className="tablet-status-bar">
        <div className="tablet-status-left">
          <span className="tablet-status-logo">OniOS</span>
        </div>
        <div className="tablet-status-center">
          <span className="tablet-status-time">{timeStr}</span>
          <span className="tablet-status-date">{dateStr}</span>
        </div>
        <div className="tablet-status-right">
          <div
            className={`tablet-voice-indicator tablet-voice-${voiceState.state.toLowerCase()}`}
            onClick={handleOrbClick}
            title={voiceState.state === "OFF" ? "Click to speak" : "Listening..."}
          >
            <Mic size={14} />
          </div>
        </div>
      </div>

      {/* Main Content: Chat + Tiles */}
      <div className="tablet-main">
        {/* Left: AI Chat Panel */}
        <div className="tablet-chat-panel">
          <OniChatWidget />
        </div>

        {/* Right: Tile Grid */}
        <div className="tablet-tiles-panel">
          {/* Active widget tiles */}
          {activeTiles.map((win) => {
            const reg = WIDGET_REGISTRY[win.widgetType];
            if (!reg) return null;
            const WidgetComponent = reg.component;
            const IconComponent = reg.icon;

            return (
              <div key={win.id} className="tablet-tile tablet-tile-active">
                <div className="tablet-tile-header">
                  <div className="tablet-tile-title">
                    {IconComponent && <IconComponent size={13} />}
                    <span>{win.title || reg.title}</span>
                  </div>
                  <button
                    className="tablet-tile-close"
                    onClick={(e) => handleCloseTile(e, win.id)}
                    title="Close"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="tablet-tile-content">
                  <WidgetComponent
                    {...win.props}
                    windowId={win.id}
                    widgetType={win.widgetType}
                  />
                </div>
              </div>
            );
          })}

          {/* Quick-launch tiles */}
          {activeTiles.length === 0 && (
            <div className="tablet-tiles-welcome">
              <h2 className="tablet-tiles-greeting">Good {getGreeting()}</h2>
              <p className="tablet-tiles-sub">
                Tap a tile to open, or ask Oni anything
              </p>
            </div>
          )}

          <div className="tablet-quick-grid">
            {availableQuickTiles.map(({ type, icon: Icon, label, gradient }) => (
              <div
                key={type}
                className="tablet-quick-tile"
                onClick={() => handleOpenTile(type)}
              >
                <div
                  className="tablet-quick-icon"
                  style={{ background: gradient }}
                >
                  <Icon size={20} />
                </div>
                <span className="tablet-quick-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
