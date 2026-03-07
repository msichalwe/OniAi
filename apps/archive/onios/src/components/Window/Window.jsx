import React, { useCallback, useRef } from "react";
import useWindowStore from "../../stores/windowStore";
import "./Window.css";

const RESIZE_DIRS = ["n", "s", "w", "e", "nw", "ne", "sw", "se"];

export default function Window({ windowData, isFocused, children }) {
  const { id, title, icon, position, size, isMinimized, isMaximized, minSize } =
    windowData;

  // Individual selectors to avoid re-renders from unrelated store changes
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow);
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow);
  const moveWindow = useWindowStore((s) => s.moveWindow);
  const resizeWindow = useWindowStore((s) => s.resizeWindow);
  const moveAndResizeWindow = useWindowStore((s) => s.moveAndResizeWindow);

  const windowRef = useRef(null);
  const rafRef = useRef(null);

  const handleMouseDown = useCallback(() => {
    focusWindow(id);
  }, [id, focusWindow]);

  // --- Dragging (direct DOM during move, commit on mouseup) ---
  const handleDragStart = useCallback(
    (e) => {
      if (isMaximized) return;
      e.preventDefault();
      focusWindow(id);

      const el = windowRef.current;
      if (!el) return;

      const startX = e.clientX - position.x;
      const startY = e.clientY - position.y;
      let lastX = position.x;
      let lastY = position.y;

      el.classList.add("dragging");

      const handleDrag = (e) => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          const maxX = window.innerWidth - 100;
          const maxY = window.innerHeight - 64;
          lastX = Math.max(
            -size.width + 100,
            Math.min(maxX, e.clientX - startX),
          );
          lastY = Math.max(0, Math.min(maxY, e.clientY - startY));
          el.style.left = lastX + "px";
          el.style.top = lastY + "px";
          rafRef.current = null;
        });
      };

      const handleDragEnd = () => {
        document.removeEventListener("mousemove", handleDrag);
        document.removeEventListener("mouseup", handleDragEnd);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        el.classList.remove("dragging");
        moveWindow(id, { x: lastX, y: lastY });
      };

      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", handleDragEnd);
    },
    [id, position, size, isMaximized, focusWindow, moveWindow],
  );

  // --- Resizing (direct DOM during resize, commit on mouseup) ---
  const handleResizeStart = useCallback(
    (dir, e) => {
      if (isMaximized) return;
      e.preventDefault();
      e.stopPropagation();
      focusWindow(id);

      const el = windowRef.current;
      if (!el) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.width;
      const startH = size.height;
      const startPosX = position.x;
      const startPosY = position.y;
      const minW = minSize?.width || 320;
      const minH = minSize?.height || 240;

      let curW = startW;
      let curH = startH;
      let curX = startPosX;
      let curY = startPosY;

      el.classList.add("dragging");

      const handleResize = (e) => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          curW = startW;
          curH = startH;
          curX = startPosX;
          curY = startPosY;

          if (dir.includes("e")) curW = Math.max(minW, startW + dx);
          if (dir.includes("w")) {
            curW = Math.max(minW, startW - dx);
            curX = startPosX + (startW - curW);
          }
          if (dir.includes("s")) curH = Math.max(minH, startH + dy);
          if (dir.includes("n")) {
            curH = Math.max(minH, startH - dy);
            curY = startPosY + (startH - curH);
          }

          el.style.width = curW + "px";
          el.style.height = curH + "px";
          el.style.left = curX + "px";
          el.style.top = curY + "px";
          rafRef.current = null;
        });
      };

      const handleResizeEnd = () => {
        document.removeEventListener("mousemove", handleResize);
        document.removeEventListener("mouseup", handleResizeEnd);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        el.classList.remove("dragging");
        moveAndResizeWindow(
          id,
          { x: curX, y: curY },
          { width: curW, height: curH },
        );
      };

      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", handleResizeEnd);
    },
    [
      id,
      size,
      position,
      isMaximized,
      minSize,
      focusWindow,
      moveAndResizeWindow,
    ],
  );

  const handleDoubleClickHeader = useCallback(() => {
    maximizeWindow(id);
  }, [id, maximizeWindow]);

  const style = isMaximized
    ? {
        top: 0,
        left: 0,
        width: "100%",
        height: `calc(100% - 64px)`,
        zIndex: windowData.zIndex,
      }
    : {
        top: position.y,
        left: position.x,
        width: size.width,
        height: size.height,
        zIndex: windowData.zIndex,
      };

  const classNames = [
    "oni-window",
    isFocused && "focused",
    isMinimized && "minimized",
    isMaximized && "maximized",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={windowRef}
      className={classNames}
      style={style}
      onMouseDown={handleMouseDown}
    >
      {/* Title Bar */}
      <div
        className="oni-window-header"
        onMouseDown={handleDragStart}
        onDoubleClick={handleDoubleClickHeader}
      >
        <div
          className="oni-window-controls"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="oni-window-btn oni-window-btn-close"
            onClick={() => closeWindow(id)}
          >
            <svg viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" fill="none" />
            </svg>
          </button>
          <button
            className="oni-window-btn oni-window-btn-minimize"
            onClick={() => minimizeWindow(id)}
          >
            <svg viewBox="0 0 12 12">
              <path d="M2 6h8" fill="none" />
            </svg>
          </button>
          <button
            className="oni-window-btn oni-window-btn-maximize"
            onClick={() => maximizeWindow(id)}
          >
            <svg viewBox="0 0 12 12">
              <rect x="2" y="2" width="8" height="8" rx="1" fill="none" />
            </svg>
          </button>
        </div>

        {icon && <div className="oni-window-icon">{icon}</div>}
        <span className="oni-window-title">{title}</span>
        {/* Spacer for centering title */}
        <div style={{ width: 52 }} />
      </div>

      {/* Content */}
      <div className="oni-window-content">{children}</div>

      {/* Resize Handles */}
      {!isMaximized &&
        RESIZE_DIRS.map((dir) => (
          <div
            key={dir}
            className={`oni-resize-handle oni-resize-${dir}`}
            onMouseDown={(e) => handleResizeStart(dir, e)}
          />
        ))}
    </div>
  );
}
