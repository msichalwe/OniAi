/**
 * DesktopSwitcher — Compact UI for switching between virtual desktops.
 * Sits in the Taskbar between the logo and window tabs.
 *
 * Features:
 * - Numbered buttons for each desktop
 * - Active desktop highlighted
 * - Green dot on desktops that have windows
 * - "+" button to add a new desktop
 * - Right-click a desktop to rename/remove
 * - Keyboard: Ctrl+1-9 to switch (handled in App.jsx)
 */

import React, { useState } from "react";
import { Plus, X, Pencil } from "lucide-react";
import useDesktopStore from "../../stores/desktopStore";
import useWindowStore from "../../stores/windowStore";
import ContextMenu from "../ContextMenu/ContextMenu";
import "./DesktopSwitcher.css";

export default function DesktopSwitcher() {
  const desktops = useDesktopStore((s) => s.desktops);
  const activeDesktopId = useDesktopStore((s) => s.activeDesktopId);
  const switchDesktop = useDesktopStore((s) => s.switchDesktop);
  const addDesktop = useDesktopStore((s) => s.addDesktop);
  const removeDesktop = useDesktopStore((s) => s.removeDesktop);
  const renameDesktop = useDesktopStore((s) => s.renameDesktop);
  const windows = useWindowStore((s) => s.windows);
  const moveWindowToDesktop = useWindowStore((s) => s.moveWindowToDesktop);

  const [contextMenu, setContextMenu] = useState(null);

  const sorted = [...desktops].sort((a, b) => a.order - b.order);

  const windowCountByDesktop = (desktopId) =>
    windows.filter((w) => w.desktopId === desktopId).length;

  const handleContextMenu = (e, desktop, index) => {
    e.preventDefault();
    e.stopPropagation();

    const winCount = windowCountByDesktop(desktop.id);
    const otherDesktops = sorted.filter((d) => d.id !== desktop.id);

    const items = [
      {
        label: `${desktop.name} (${winCount} windows)`,
        disabled: true,
      },
      { type: "separator" },
      {
        label: "Rename",
        icon: <Pencil size={14} />,
        onClick: () => {
          const name = prompt("Desktop name:", desktop.name);
          if (name && name.trim()) renameDesktop(desktop.id, name.trim());
        },
      },
    ];

    // Move all windows options
    if (winCount > 0 && otherDesktops.length > 0) {
      items.push({ type: "separator" });
      otherDesktops.forEach((d) => {
        items.push({
          label: `Move windows to ${d.name}`,
          onClick: () => {
            windows
              .filter((w) => w.desktopId === desktop.id)
              .forEach((w) => moveWindowToDesktop(w.id, d.id));
          },
        });
      });
    }

    if (desktops.length > 1) {
      items.push({ type: "separator" });
      items.push({
        label: "Remove Desktop",
        icon: <X size={14} />,
        onClick: () => {
          const fallbackId = removeDesktop(desktop.id);
          if (fallbackId) {
            // Move orphaned windows
            windows
              .filter((w) => w.desktopId === desktop.id)
              .forEach((w) => moveWindowToDesktop(w.id, fallbackId));
          }
        },
      });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY - (items.length * 28 + 20),
      items,
    });
  };

  return (
    <>
      <div className="desktop-switcher">
        {sorted.map((desktop, index) => {
          const isActive = desktop.id === activeDesktopId;
          const winCount = windowCountByDesktop(desktop.id);
          return (
            <button
              key={desktop.id}
              className={`desktop-switcher-btn ${isActive ? "active" : ""}`}
              onClick={() => switchDesktop(desktop.id)}
              onContextMenu={(e) => handleContextMenu(e, desktop, index)}
              title={`${desktop.name} (${winCount} windows)`}
            >
              {index + 1}
              <span
                className={`dot-count ${winCount > 0 ? "has-windows" : ""}`}
              />
            </button>
          );
        })}
        <button
          className="desktop-switcher-add"
          onClick={() => addDesktop()}
          title="Add desktop"
        >
          <Plus size={12} />
        </button>
      </div>

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
