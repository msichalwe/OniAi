import React, { useEffect, useRef } from "react";
import "./ContextMenu.css";

/**
 * ContextMenu — A reusable right-click context menu.
 *
 * Usage:
 *   <ContextMenu
 *     x={300} y={200}
 *     items={[
 *       { label: 'Open', icon: '📂', onClick: () => {} },
 *       { type: 'separator' },
 *       { label: 'Delete', icon: '🗑️', onClick: () => {}, danger: true },
 *     ]}
 *     onClose={() => setShowMenu(false)}
 *   />
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (rect.right > vw) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > vh) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return <div key={i} className="context-menu-separator" />;
        }
        return (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
            disabled={item.disabled}
          >
            {item.icon && (
              <span className="context-menu-item-icon">{item.icon}</span>
            )}
            <span className="context-menu-item-label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu-item-shortcut">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
