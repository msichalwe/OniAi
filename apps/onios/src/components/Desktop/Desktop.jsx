import React, { useState, useCallback, useEffect } from "react";
import {
  Folder,
  Terminal,
  Cloud,
  Globe,
  FileText,
  Activity,
  Clock,
  Calculator,
  BookOpen,
  Settings,
  Code,
  Command,
  Sun,
  Moon,
  ClipboardList,
  Database,
  HardDrive,
  Mic,
} from "lucide-react";
import useWindowStore from "../../stores/windowStore";
import useCommandStore from "../../stores/commandStore";
import useThemeStore from "../../stores/themeStore";
import { WIDGET_REGISTRY } from "../../core/widgetRegistry";
import { commandRegistry } from "../../core/CommandRegistry";
import { voiceEngine } from "../../core/VoiceEngine";
import Window from "../Window/Window";
import ContextMenu from "../ContextMenu/ContextMenu";
import "./Desktop.css";

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

const DESKTOP_SHORTCUTS = [
  {
    type: "file-explorer",
    icon: Folder,
    gradient: "linear-gradient(135deg, #2196F3, #1565C0)",
    label: "Files",
  },
  {
    type: "terminal",
    icon: Terminal,
    gradient: "linear-gradient(135deg, #1B1B1B, #333333)",
    label: "Terminal",
  },
  {
    type: "browser",
    icon: Globe,
    gradient: "linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)",
    label: "Browser",
  },
  {
    type: "code-editor",
    icon: Code,
    gradient: "linear-gradient(135deg, #007ACC, #1E9DE7)",
    label: "Code",
  },
  {
    type: "notes",
    icon: FileText,
    gradient: "linear-gradient(135deg, #FFCA28, #FFB300)",
    label: "Notes",
  },
  {
    type: "docs",
    icon: BookOpen,
    gradient: "linear-gradient(135deg, #FF7043, #E64A19)",
    label: "Docs",
  },
  {
    type: "weather",
    icon: Cloud,
    gradient: "linear-gradient(135deg, #4FC3F7, #0288D1)",
    label: "Weather",
  },
  {
    type: "calculator",
    icon: Calculator,
    gradient: "linear-gradient(135deg, #78909C, #546E7A)",
    label: "Calc",
  },
  {
    type: "activity-log",
    icon: Activity,
    gradient: "linear-gradient(135deg, #AB47BC, #7B1FA2)",
    label: "Activity",
  },
  {
    type: "storage",
    icon: Database,
    gradient: "linear-gradient(135deg, #26A69A, #00897B)",
    label: "Storage",
  },
  {
    type: "space-lens",
    icon: HardDrive,
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    label: "Space Lens",
  },
  {
    type: "settings",
    icon: Settings,
    gradient: "linear-gradient(135deg, #78909C, #455A64)",
    label: "Settings",
  },
];

export default function Desktop() {
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const openCommandBar = useCommandStore((s) => s.openCommandBar);
  const wallpaper = useThemeStore((s) => s.wallpaper);
  const customWallpaper = useThemeStore((s) => s.customWallpaper);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const theme = useThemeStore((s) => s.theme);

  const [contextMenu, setContextMenu] = useState(null);
  const [voiceState, setVoiceState] = useState({ state: "OFF" });

  useEffect(() => {
    const unsub = voiceEngine.onStateChange((data) =>
      setVoiceState({ ...data }),
    );
    return unsub;
  }, []);

  const handleOrbClick = useCallback(() => {
    if (voiceState.state === "OFF") {
      voiceEngine.start();
    } else if (
      voiceState.state === "IDLE" ||
      voiceState.state === "FOLLOW_UP"
    ) {
      voiceEngine.activateManual();
    } else if (voiceState.state === "ACTIVATED") {
      voiceEngine._finalizeCommand();
    }
  }, [voiceState.state]);

  const topZIndex =
    windows.length > 0 ? Math.max(...windows.map((w) => w.zIndex)) : 0;

  const handleShortcutClick = (type) => {
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
  };

  const handleDesktopContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: "Open Command Palette",
            icon: <Command size={14} />,
            shortcut: "⌘K",
            onClick: () => openCommandBar(),
          },
          { type: "separator" },
          {
            label: "New Terminal",
            icon: <Terminal size={14} />,
            onClick: () => handleShortcutClick("terminal"),
          },
          {
            label: "File Explorer",
            icon: <Folder size={14} />,
            onClick: () => handleShortcutClick("file-explorer"),
          },
          {
            label: "Code Editor",
            icon: <Code size={14} />,
            onClick: () => handleShortcutClick("code-editor"),
          },
          {
            label: "Browser",
            icon: <Globe size={14} />,
            onClick: () => handleShortcutClick("browser"),
          },
          { type: "separator" },
          {
            label:
              theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
            icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
            onClick: () => toggleTheme(),
          },
          {
            label: "Settings",
            icon: <Settings size={14} />,
            onClick: () => handleShortcutClick("settings"),
          },
          { type: "separator" },
          {
            label: "View Documentation",
            icon: <BookOpen size={14} />,
            onClick: () => handleShortcutClick("docs"),
          },
          {
            label: "Activity Log",
            icon: <ClipboardList size={14} />,
            onClick: () => handleShortcutClick("activity-log"),
          },
        ],
      });
    },
    [openCommandBar, theme, toggleTheme],
  );

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

  return (
    <div
      className="desktop"
      style={desktopStyle}
      onContextMenu={handleDesktopContextMenu}
    >
      <div className="desktop-surface">
        {/* Welcome screen when no windows are visible */}
        {windows.filter((w) => !w.isMinimized).length === 0 && (
          <div className="desktop-welcome">
            <div className="desktop-welcome-logo">OniOS</div>
            <div className="desktop-welcome-sub">
              Your command-driven widget operating system.
              <br />
              Every action is a command. Every command is visual.
            </div>
            <div className="desktop-welcome-hint" onClick={openCommandBar}>
              Press <kbd>⌘</kbd> + <kbd>K</kbd> to open the command palette
            </div>
            <div className="desktop-shortcuts">
              {DESKTOP_SHORTCUTS.map(
                ({ type, icon: Icon, gradient, label }) => (
                  <div
                    key={type}
                    className="desktop-shortcut"
                    onClick={() => handleShortcutClick(type)}
                  >
                    <div
                      className="desktop-shortcut-icon"
                      style={{ background: gradient }}
                    >
                      <Icon />
                    </div>
                    <span className="desktop-shortcut-label">{label}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* Render all windows */}
        {windows.map((win) => {
          const reg = WIDGET_REGISTRY[win.widgetType];
          if (!reg) return null;
          const WidgetComponent = reg.component;
          const IconComponent = reg.icon;

          return (
            <Window
              key={win.id}
              windowData={{
                ...win,
                icon: IconComponent ? <IconComponent size={14} /> : null,
              }}
              isFocused={win.zIndex === topZIndex}
            >
              <WidgetComponent
                {...win.props}
                windowId={win.id}
                widgetType={win.widgetType}
              />
            </Window>
          );
        })}
      </div>

      {/* Oni Voice Orb */}
      <div
        className={`oni-orb oni-orb-${voiceState.state.toLowerCase()}`}
        onClick={handleOrbClick}
        title={
          voiceState.state === "OFF"
            ? "Click to enable voice"
            : voiceState.state === "IDLE"
              ? 'Listening for "Oni"...'
              : voiceState.state === "ACTIVATED"
                ? "Listening... click to send"
                : voiceState.state === "PROCESSING"
                  ? "Processing..."
                  : voiceState.state === "FOLLOW_UP"
                    ? "Anything else?"
                    : "Oni Voice"
        }
      >
        <div className="oni-orb-ring" />
        <div className="oni-orb-ring oni-orb-ring-2" />
        <div className="oni-orb-core">
          {voiceState.state === "ACTIVATED" ? <Mic size={18} /> : "O"}
        </div>
        {voiceState.state === "ACTIVATED" && voiceState.transcript && (
          <div className="oni-orb-tooltip">{voiceState.transcript}</div>
        )}
        {voiceState.state === "FOLLOW_UP" && (
          <div className="oni-orb-tooltip">Anything else?</div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
