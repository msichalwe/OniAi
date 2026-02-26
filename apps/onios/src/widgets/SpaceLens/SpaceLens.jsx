import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  HardDrive,
  Folder,
  File,
  ChevronRight,
  Trash2,
  Eye,
  RotateCcw,
  Check,
  Search,
  ArrowLeft,
  FolderOpen,
  Image,
  Film,
  Music,
  FileText,
  Code,
  Archive,
  Download,
  Monitor,
  Package,
  X,
} from "lucide-react";
import "./SpaceLens.css";

// ─── Helpers ───────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + " " + units[i];
}

const BUBBLE_COLORS = [
  "rgba(99,102,241,0.35)",
  "rgba(139,92,246,0.35)",
  "rgba(59,130,246,0.35)",
  "rgba(16,185,129,0.35)",
  "rgba(245,158,11,0.35)",
  "rgba(239,68,68,0.30)",
  "rgba(236,72,153,0.30)",
  "rgba(14,165,233,0.35)",
  "rgba(168,85,247,0.35)",
  "rgba(34,197,94,0.35)",
];

function getFileIcon(item) {
  if (item.isDir) {
    const n = item.name.toLowerCase();
    if (n === "applications") return <Package size={13} />;
    if (n === "downloads") return <Download size={13} />;
    if (n === "pictures" || n === "photos") return <Image size={13} />;
    if (n === "movies" || n === "videos") return <Film size={13} />;
    if (n === "music") return <Music size={13} />;
    if (n === "documents") return <FileText size={13} />;
    if (n === "desktop") return <Monitor size={13} />;
    if (n === "library") return <Archive size={13} />;
    return <Folder size={13} />;
  }
  const ext = item.ext || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "tiff", "ico"].includes(ext)) return <Image size={13} />;
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return <Film size={13} />;
  if (["mp3", "wav", "flac", "aac", "ogg"].includes(ext)) return <Music size={13} />;
  if (["js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "c", "cpp", "h", "css", "html", "json", "yaml", "toml", "sh"].includes(ext)) return <Code size={13} />;
  if (["zip", "tar", "gz", "rar", "7z", "dmg"].includes(ext)) return <Archive size={13} />;
  if (["pdf", "doc", "docx", "txt", "md", "rtf", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return <FileText size={13} />;
  return <File size={13} />;
}

function getIconBg(item, index) {
  if (item.isDir) {
    const n = item.name.toLowerCase();
    if (n === "applications") return "rgba(99,102,241,0.2)";
    if (n === "downloads") return "rgba(59,130,246,0.2)";
    if (n === "pictures" || n === "photos") return "rgba(236,72,153,0.2)";
    if (n === "movies" || n === "videos") return "rgba(245,158,11,0.2)";
    if (n === "music") return "rgba(239,68,68,0.2)";
    if (n === "library") return "rgba(168,85,247,0.2)";
    return "rgba(99,102,241,0.12)";
  }
  return "rgba(255,255,255,0.06)";
}

// ─── Bubble Layout (circle packing) ────────────────────

function layoutBubbles(items, containerW, containerH) {
  if (!items.length || !containerW || !containerH) return [];
  const maxSize = items[0]?.size || 1;
  const totalSize = items.reduce((s, i) => s + i.size, 0) || 1;
  const area = containerW * containerH;
  const padding = 6;
  const maxR = Math.min(containerW, containerH) * 0.28;
  const minR = 16;

  const bubbles = items.slice(0, 30).map((item, i) => {
    const ratio = item.size / totalSize;
    const r = Math.max(minR, Math.min(maxR, Math.sqrt((ratio * area) / Math.PI) * 0.65));
    return { ...item, r, index: i, color: BUBBLE_COLORS[i % BUBBLE_COLORS.length] };
  });

  // Simple force-directed placement
  const cx = containerW / 2;
  const cy = containerH / 2;

  // Initial positions — spiral from center
  bubbles.forEach((b, i) => {
    const angle = i * 2.4; // golden angle
    const dist = 30 + i * 12;
    b.x = cx + Math.cos(angle) * dist;
    b.y = cy + Math.sin(angle) * dist;
  });

  // Run collision resolution
  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const dx = bubbles[j].x - bubbles[i].x;
        const dy = bubbles[j].y - bubbles[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = bubbles[i].r + bubbles[j].r + padding;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          bubbles[i].x -= nx * overlap;
          bubbles[i].y -= ny * overlap;
          bubbles[j].x += nx * overlap;
          bubbles[j].y += ny * overlap;
        }
      }
      // Gravity toward center
      const gx = cx - bubbles[i].x;
      const gy = cy - bubbles[i].y;
      bubbles[i].x += gx * 0.02;
      bubbles[i].y += gy * 0.02;

      // Contain within bounds
      bubbles[i].x = Math.max(bubbles[i].r, Math.min(containerW - bubbles[i].r, bubbles[i].x));
      bubbles[i].y = Math.max(bubbles[i].r, Math.min(containerH - bubbles[i].r, bubbles[i].y));
    }
  }

  return bubbles;
}

// ─── Main Component ────────────────────────────────────

export default function SpaceLens({ windowId }) {
  const [loading, setLoading] = useState(false);
  const [disk, setDisk] = useState(null);
  const [items, setItems] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  const [pathHistory, setPathHistory] = useState([]);
  const [selected, setSelected] = useState(null); // hovered/focused item path
  const [checked, setChecked] = useState(new Set()); // items selected for deletion
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState(null);
  const bubblesRef = useRef(null);
  const [bubbleSize, setBubbleSize] = useState({ w: 0, h: 0 });

  // Measure bubble container
  useEffect(() => {
    if (!bubblesRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        setBubbleSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    obs.observe(bubblesRef.current);
    return () => obs.disconnect();
  }, []);

  // ─── API Calls ─────────────────────────────────────

  const scan = useCallback(async (targetPath) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oni/actions/spacelens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", path: targetPath }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setDisk(data.disk);
        setItems(data.items || []);
        setCurrentPath(data.path);
        setSelected(null);
        setChecked(new Set());
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  const drillInto = useCallback(async (dirPath) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oni/actions/spacelens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drill", path: dirPath }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setPathHistory((h) => [...h, currentPath]);
        setItems(data.items || []);
        setCurrentPath(dirPath);
        setSelected(null);
        setChecked(new Set());
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [currentPath]);

  const goBack = useCallback(() => {
    if (pathHistory.length === 0) return;
    const prev = pathHistory[pathHistory.length - 1];
    setPathHistory((h) => h.slice(0, -1));
    scan(prev);
  }, [pathHistory, scan]);

  const navigateTo = useCallback((targetPath) => {
    if (targetPath === currentPath) return;
    // Find index in breadcrumb
    const crumbs = buildBreadcrumb(currentPath);
    const idx = crumbs.findIndex((c) => c.path === targetPath);
    if (idx >= 0) {
      // Going back — trim history
      setPathHistory((h) => h.slice(0, idx));
    }
    scan(targetPath);
  }, [currentPath, scan]);

  const deleteItems = useCallback(async (paths, trash = true) => {
    for (const p of paths) {
      try {
        await fetch("/api/oni/actions/spacelens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", path: p, trash }),
        });
      } catch { /* ignore */ }
    }
    setChecked(new Set());
    setConfirmDelete(null);
    // Re-scan current dir
    if (currentPath) scan(currentPath);
  }, [currentPath, scan]);

  const revealInFinder = useCallback(async (filePath) => {
    try {
      await fetch("/api/oni/actions/spacelens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", path: filePath }),
      });
    } catch { /* ignore */ }
  }, []);

  // Auto-scan home on mount
  useEffect(() => {
    scan(null);
  }, [scan]);

  // Close context menu on click elsewhere
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // ─── Derived ────────────────────────────────────────

  const totalDirSize = useMemo(() => items.reduce((s, i) => s + (i.size || 0), 0), [items]);
  const bubbles = useMemo(() => layoutBubbles(items, bubbleSize.w, bubbleSize.h), [items, bubbleSize]);
  const checkedSize = useMemo(() => {
    return items.filter((i) => checked.has(i.path)).reduce((s, i) => s + (i.size || 0), 0);
  }, [items, checked]);

  function buildBreadcrumb(p) {
    if (!p) return [];
    const home = p.match(/^\/Users\/[^/]+/)?.[0] || "";
    const parts = p.replace(home, "~").split("/").filter(Boolean);
    const crumbs = [];
    let acc = home || "/";
    crumbs.push({ name: parts[0] || "/", path: acc });
    for (let i = 1; i < parts.length; i++) {
      acc = i === 1 && home ? home + "/" + parts[i] : acc + "/" + parts[i];
      crumbs.push({ name: parts[i], path: acc.replace("~", home) });
    }
    return crumbs;
  }

  const breadcrumbs = useMemo(() => buildBreadcrumb(currentPath), [currentPath]);

  const toggleCheck = (path, e) => {
    e?.stopPropagation();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleItemClick = (item) => {
    if (item.isDir) {
      drillInto(item.path);
    } else {
      setSelected(item.path === selected ? null : item.path);
    }
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // ─── Render ─────────────────────────────────────────

  if (!currentPath && !loading) {
    return (
      <div className="sl-widget">
        <div className="sl-empty">
          <HardDrive size={40} style={{ opacity: 0.3 }} />
          <span>Click Scan to analyze your storage</span>
          <button className="sl-scan-btn" onClick={() => scan(null)}>
            Scan Storage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sl-widget">
      {/* ─── Header ─── */}
      <div className="sl-header">
        <div className="sl-header-icon">
          <HardDrive size={18} color="#fff" />
        </div>
        <div className="sl-header-info">
          <div className="sl-header-title">Space Lens</div>
          <div className="sl-header-sub">
            {disk
              ? `${formatSize(disk.used)} used of ${formatSize(disk.total)} — ${formatSize(disk.available)} free`
              : "Analyzing storage..."}
          </div>
        </div>
        {pathHistory.length > 0 && (
          <button
            className="sl-action-btn sl-btn-secondary"
            onClick={goBack}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <ArrowLeft size={13} /> Back
          </button>
        )}
        <button
          className="sl-scan-btn"
          onClick={() => scan(currentPath)}
          disabled={loading}
        >
          <RotateCcw size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
          {loading ? "Scanning..." : "Rescan"}
        </button>
      </div>

      {/* ─── Disk Usage Bar ─── */}
      {disk && (
        <div className="sl-disk-bar">
          <div className="sl-disk-labels">
            <span>{formatSize(disk.used)} used</span>
            <span>{disk.percent}%</span>
            <span>{formatSize(disk.available)} free</span>
          </div>
          <div className="sl-disk-track">
            <div
              className={`sl-disk-fill ${disk.percent > 85 ? "sl-warn" : ""}`}
              style={{ width: `${disk.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── Breadcrumb ─── */}
      <div className="sl-breadcrumb">
        {breadcrumbs.map((c, i) => (
          <React.Fragment key={c.path}>
            {i > 0 && <ChevronRight size={11} className="sl-crumb-sep" />}
            <span
              className={i === breadcrumbs.length - 1 ? "sl-crumb-active" : "sl-crumb"}
              onClick={() => i < breadcrumbs.length - 1 && navigateTo(c.path)}
            >
              {c.name}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* ─── Main Content ─── */}
      {loading ? (
        <div className="sl-loading">
          <div className="sl-spinner" />
          <div className="sl-loading-text">Scanning directory...</div>
        </div>
      ) : error ? (
        <div className="sl-empty">
          <span style={{ color: "#f87171" }}>{error}</span>
          <button className="sl-scan-btn" onClick={() => scan(currentPath)}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="sl-empty">
          <FolderOpen size={40} style={{ opacity: 0.3 }} />
          <span>This directory is empty</span>
        </div>
      ) : (
        <div className="sl-content">
          {/* ─── Bubbles ─── */}
          <div className="sl-bubbles" ref={bubblesRef}>
            {bubbles.map((b) => (
              <div
                key={b.path}
                className={`sl-bubble ${selected === b.path ? "sl-bubble-selected" : ""}`}
                style={{
                  left: b.x - b.r,
                  top: b.y - b.r,
                  width: b.r * 2,
                  height: b.r * 2,
                  background: b.color,
                }}
                onClick={() => handleItemClick(b)}
                onContextMenu={(e) => handleContextMenu(e, b)}
                onMouseEnter={() => setSelected(b.path)}
                onMouseLeave={() => setSelected(null)}
                title={`${b.name} — ${formatSize(b.size)}`}
              >
                {b.r > 28 && (
                  <span className="sl-bubble-name">{b.name}</span>
                )}
                {b.r > 36 && (
                  <span className="sl-bubble-size">{formatSize(b.size)}</span>
                )}
              </div>
            ))}
          </div>

          {/* ─── File List ─── */}
          <div className="sl-list">
            <div className="sl-list-header">
              <span>{items.length} items — {formatSize(totalDirSize)}</span>
            </div>
            {items.map((item, i) => {
              const sizeRatio = totalDirSize > 0 ? (item.size / totalDirSize) * 100 : 0;
              const isChecked = checked.has(item.path);
              const isSelected = selected === item.path;

              return (
                <div
                  key={item.path}
                  className={`sl-item ${isSelected ? "sl-item-selected" : ""}`}
                  onClick={() => handleItemClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onMouseEnter={() => setSelected(item.path)}
                  onMouseLeave={() => setSelected(null)}
                >
                  <div
                    className={`sl-item-check ${isChecked ? "sl-checked" : ""}`}
                    onClick={(e) => toggleCheck(item.path, e)}
                  >
                    {isChecked && <Check size={11} color="#fff" />}
                  </div>
                  <div
                    className="sl-item-icon"
                    style={{ background: getIconBg(item, i), color: BUBBLE_COLORS[i % BUBBLE_COLORS.length].replace("0.35", "0.9").replace("0.30", "0.9") }}
                  >
                    {getFileIcon(item)}
                  </div>
                  <div className="sl-item-info">
                    <div className="sl-item-name">{item.name}</div>
                    <div className="sl-item-meta">
                      {item.isDir
                        ? `${item.childCount || 0} items`
                        : item.ext
                          ? `.${item.ext} file`
                          : "File"}
                    </div>
                  </div>
                  <div className="sl-item-size">{formatSize(item.size)}</div>
                  <div className="sl-item-bar-wrap">
                    <div
                      className="sl-item-bar"
                      style={{
                        width: `${Math.max(2, sizeRatio)}%`,
                        background: BUBBLE_COLORS[i % BUBBLE_COLORS.length],
                      }}
                    />
                  </div>
                  {item.isDir && (
                    <ChevronRight size={13} className="sl-item-arrow" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Footer ─── */}
      <div className="sl-footer">
        <div className="sl-footer-left">
          {checked.size > 0
            ? `${checked.size} selected — ${formatSize(checkedSize)}`
            : currentPath || ""}
        </div>
        <div className="sl-footer-right">
          {checked.size > 0 && (
            <>
              <button
                className="sl-action-btn sl-btn-secondary"
                onClick={() => setChecked(new Set())}
              >
                Clear
              </button>
              <button
                className="sl-action-btn sl-btn-danger"
                onClick={() =>
                  setConfirmDelete({
                    paths: [...checked],
                    count: checked.size,
                    size: checkedSize,
                  })
                }
              >
                <Trash2 size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                Move to Trash
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Context Menu ─── */}
      {contextMenu && (
        <div
          className="sl-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.item.isDir && (
            <button
              className="sl-ctx-item"
              onClick={() => {
                drillInto(contextMenu.item.path);
                setContextMenu(null);
              }}
            >
              <FolderOpen size={13} /> Open
            </button>
          )}
          <button
            className="sl-ctx-item"
            onClick={() => {
              revealInFinder(contextMenu.item.path);
              setContextMenu(null);
            }}
          >
            <Eye size={13} /> Reveal in Finder
          </button>
          <button
            className="sl-ctx-item"
            onClick={() => {
              toggleCheck(contextMenu.item.path);
              setContextMenu(null);
            }}
          >
            <Check size={13} /> {checked.has(contextMenu.item.path) ? "Deselect" : "Select for Removal"}
          </button>
          <div className="sl-ctx-sep" />
          <button
            className="sl-ctx-item sl-ctx-danger"
            onClick={() => {
              setConfirmDelete({
                paths: [contextMenu.item.path],
                count: 1,
                size: contextMenu.item.size,
                name: contextMenu.item.name,
              });
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} /> Move to Trash
          </button>
        </div>
      )}

      {/* ─── Confirm Delete Dialog ─── */}
      {confirmDelete && (
        <div className="sl-confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="sl-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="sl-confirm-title">
              Move to Trash?
            </div>
            <div className="sl-confirm-msg">
              {confirmDelete.name
                ? `"${confirmDelete.name}" (${formatSize(confirmDelete.size)})`
                : `${confirmDelete.count} items (${formatSize(confirmDelete.size)})`}
              <br />
              will be moved to the Trash. You can restore them from Trash if needed.
            </div>
            <div className="sl-confirm-actions">
              <button
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}
                onClick={() => deleteItems(confirmDelete.paths)}
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
