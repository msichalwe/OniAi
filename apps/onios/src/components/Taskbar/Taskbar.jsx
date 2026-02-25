import React, { useState, useEffect } from "react";
import {
  Search,
  Wifi,
  Activity,
  Settings,
  Terminal,
  Command,
  X,
  Minimize2,
  Maximize2,
  Focus,
} from "lucide-react";
import useWindowStore from "../../stores/windowStore";
import useCommandStore from "../../stores/commandStore";
import useDesktopStore from "../../stores/desktopStore";
import { WIDGET_REGISTRY } from "../../core/widgetRegistry";
import AppDrawer from "../AppDrawer/AppDrawer";
import DesktopSwitcher from "../DesktopSwitcher/DesktopSwitcher";
import ContextMenu from "../ContextMenu/ContextMenu";
import "./Taskbar.css";

export default function Taskbar() {
  const windows = useWindowStore((s) => s.windows);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow);
  const restoreWindow = useWindowStore((s) => s.restoreWindow);
  const openWindow = useWindowStore((s) => s.openWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow);
  const openCommandBar = useCommandStore((s) => s.openCommandBar);
  const activeDesktopId = useDesktopStore((s) => s.activeDesktopId);
  const [time, setTime] = useState(new Date());
  const [showDrawer, setShowDrawer] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (d) => {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleTabClick = (win) => {
    if (win.isMinimized) {
      restoreWindow(win.id);
    } else {
      const topZ = Math.max(...windows.map((w) => w.zIndex));
      if (win.zIndex === topZ) {
        minimizeWindow(win.id);
      } else {
        focusWindow(win.id);
      }
    }
  };

  const getWidgetIcon = (type) => {
    const reg = WIDGET_REGISTRY[type];
    if (reg?.icon) {
      const Icon = reg.icon;
      return <Icon />;
    }
    return null;
  };

  const handleTabContextMenu = (e, win) => {
    e.preventDefault();
    e.stopPropagation();
    const reg = WIDGET_REGISTRY[win.widgetType];
    const commands = reg?.commands || [];

    const items = [
      {
        label: "Focus",
        icon: <Focus size={14} />,
        onClick: () => focusWindow(win.id),
      },
      {
        label: win.isMinimized ? "Restore" : "Minimize",
        icon: <Minimize2 size={14} />,
        onClick: () =>
          win.isMinimized ? restoreWindow(win.id) : minimizeWindow(win.id),
      },
      {
        label: "Maximize",
        icon: <Maximize2 size={14} />,
        onClick: () => maximizeWindow(win.id),
      },
      { type: "separator" },
      {
        label: "Show All Commands",
        icon: <Command size={14} />,
        onClick: () => openCommandBar(),
      },
    ];

    if (commands.length > 0) {
      items.push({ type: "separator" });
      items.push({
        label: `Commands (${win.widgetType})`,
        icon: <Terminal size={14} />,
        disabled: true,
      });
      commands.slice(0, 8).forEach((cmd) => {
        items.push({
          label: cmd,
          onClick: () => {
            openCommandBar();
          },
        });
      });
    }

    items.push({ type: "separator" });
    items.push({
      label: "Close",
      icon: <X size={14} />,
      onClick: () => closeWindow(win.id),
    });

    setContextMenu({
      x: e.clientX,
      y: e.clientY - (items.length * 28 + 20),
      items,
    });
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY - 140, // offset upward since it's at the bottom
      items: [
        {
          label: "Task Manager",
          icon: <Activity size={14} />,
          onClick: () =>
            openWindow("activity-log", {}, WIDGET_REGISTRY["activity-log"]),
        },
        {
          label: "Terminal",
          icon: <Terminal size={14} />,
          onClick: () =>
            openWindow("terminal", {}, WIDGET_REGISTRY["terminal"]),
        },
        { type: "separator" },
        {
          label: "System Settings",
          icon: <Settings size={14} />,
          onClick: () =>
            openWindow("settings", {}, WIDGET_REGISTRY["settings"]),
        },
      ],
    });
  };

  return (
    <>
      <div className="taskbar" onContextMenu={handleContextMenu}>
        <div className="taskbar-left">
          <div
            className={`taskbar-logo ${showDrawer ? "active" : ""}`}
            onClick={() => setShowDrawer(!showDrawer)}
            title="App Drawer"
          >
            O
          </div>
          <div className="taskbar-divider" />
          <DesktopSwitcher />
          <div className="taskbar-divider" />
        </div>

        <div className="taskbar-center">
          {windows
            .filter((win) => win.desktopId === activeDesktopId)
            .map((win) => (
              <button
                key={win.id}
                className={`taskbar-tab ${!win.isMinimized ? "active" : "minimized"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTabClick(win);
                }}
                onContextMenu={(e) => handleTabContextMenu(e, win)}
              >
                <span className="taskbar-tab-icon">
                  {getWidgetIcon(win.widgetType)}
                </span>
                <span className="taskbar-tab-title">{win.title}</span>
              </button>
            ))}
        </div>

        <div className="taskbar-right">
          <button
            className="taskbar-cmd-btn"
            onClick={(e) => {
              e.stopPropagation();
              openCommandBar();
            }}
          >
            <Search />
            <span>⌘K</span>
          </button>
          <div className="taskbar-divider" />
          <div className="taskbar-status">
            <Wifi />
            <span className="taskbar-dot" />
          </div>
          <div className="taskbar-divider" />
          <div className="taskbar-clock">
            <div>{formatTime(time)}</div>
          </div>
        </div>
      </div>
      {showDrawer && <AppDrawer onClose={() => setShowDrawer(false)} />}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
