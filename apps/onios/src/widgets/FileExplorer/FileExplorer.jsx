import React, { useState, useCallback, useEffect } from "react";
import ContextMenu from "../../components/ContextMenu/ContextMenu";
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileAudio,
  FileVideo,
  FileArchive,
  FileJson,
  Image,
  Music,
  Film,
  Code,
  Home,
  Download,
  HardDrive,
  ChevronRight,
  Grid3X3,
  List,
  ArrowLeft,
  RefreshCw,
  Eye,
  Loader2,
  FolderPlus,
  FilePlus,
  Trash2,
  Pencil,
  FolderOpen,
  Monitor,
  Clipboard,
  RotateCw,
} from "lucide-react";
import { commandRegistry } from "../../core/CommandRegistry";
import { useWidgetState } from "../../core/useWidgetState";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./FileExplorer.css";

const getFileIcon = (name, isDir) => {
  if (isDir) return <Folder size={48} className="fe-icon-folder" />;
  if (!name.includes(".")) return <File size={48} className="fe-icon-file" />;
  const ext = name.split(".").pop().toLowerCase();

  const textExts = ["txt", "md", "csv", "log"];
  const codeExts = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "css",
    "html",
    "py",
    "rs",
    "go",
    "java",
    "cpp",
    "c",
    "sh",
    "sql",
  ];
  const imgExts = ["jpg", "jpeg", "png", "gif", "svg", "webp", "ico"];
  const audioExts = ["mp3", "wav", "flac", "aac", "ogg"];
  const videoExts = ["mp4", "mov", "webm", "avi", "mkv"];
  const archiveExts = ["zip", "tar", "gz", "rar", "7z", "dmg", "iso"];
  const jsonExts = ["json", "yaml", "yml", "toml"];

  if (textExts.includes(ext) || ext === "pdf" || ext === "docx")
    return <FileText size={48} className="fe-icon-text" />;
  if (codeExts.includes(ext))
    return <FileCode size={48} className="fe-icon-code" />;
  if (imgExts.includes(ext))
    return <FileImage size={48} className="fe-icon-image" />;
  if (audioExts.includes(ext))
    return <FileAudio size={48} className="fe-icon-audio" />;
  if (videoExts.includes(ext))
    return <FileVideo size={48} className="fe-icon-video" />;
  if (archiveExts.includes(ext))
    return <FileArchive size={48} className="fe-icon-archive" />;
  if (jsonExts.includes(ext))
    return <FileJson size={48} className="fe-icon-code" />;

  return <File size={48} className="fe-icon-file" />;
};

const getSmallFileIcon = (name, isDir) => {
  if (isDir) return <Folder size={18} className="fe-icon-folder" />;
  if (!name.includes(".")) return <File size={18} className="fe-icon-file" />;
  const ext = name.split(".").pop().toLowerCase();

  const textExts = ["txt", "md", "csv", "log"];
  const codeExts = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "css",
    "html",
    "py",
    "rs",
    "go",
    "java",
    "cpp",
    "c",
    "sh",
    "sql",
  ];
  const imgExts = ["jpg", "jpeg", "png", "gif", "svg", "webp", "ico"];
  const audioExts = ["mp3", "wav", "flac", "aac", "ogg"];
  const videoExts = ["mp4", "mov", "webm", "avi", "mkv"];
  const archiveExts = ["zip", "tar", "gz", "rar", "7z", "dmg", "iso"];
  const jsonExts = ["json", "yaml", "yml", "toml"];

  if (textExts.includes(ext) || ext === "pdf" || ext === "docx")
    return <FileText size={18} className="fe-icon-text" />;
  if (codeExts.includes(ext))
    return <FileCode size={18} className="fe-icon-code" />;
  if (imgExts.includes(ext))
    return <FileImage size={18} className="fe-icon-image" />;
  if (audioExts.includes(ext))
    return <FileAudio size={18} className="fe-icon-audio" />;
  if (videoExts.includes(ext))
    return <FileVideo size={18} className="fe-icon-video" />;
  if (archiveExts.includes(ext))
    return <FileArchive size={18} className="fe-icon-archive" />;
  if (jsonExts.includes(ext))
    return <FileJson size={18} className="fe-icon-code" />;

  return <File size={18} className="fe-icon-file" />;
};

const formatSize = (bytes) => {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return (
      "Today, " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function FileExplorer({ initialPath, windowId, widgetType }) {
  const [currentPath, setCurrentPath] = useState("");
  const [items, setItems] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const [homedir, setHomedir] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedViewMode, setSavedViewMode] = useWidgetState(
    windowId,
    "file-explorer",
    "viewMode",
    "list",
  );
  const [viewMode, setViewModeRaw] = useState(savedViewMode);
  const setViewMode = (mode) => {
    setViewModeRaw(mode);
    setSavedViewMode(mode);
  };
  const [savedPath, setSavedPath] = useWidgetState(
    windowId,
    "file-explorer",
    "lastPath",
    null,
  );
  const [selected, setSelected] = useState(null);
  const [previewContent, setPreviewContent] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [contextMenu, setContextMenu] = useState(null);
  const [createDialog, setCreateDialog] = useState(null); // { type: 'folder' | 'file' }
  const [renameDialog, setRenameDialog] = useState(null); // { item, newName }
  const [createName, setCreateName] = useState("");
  const [renameName, setRenameName] = useState("");

  // Report live context for AI agents
  useWidgetContext(windowId, "file-explorer", {
    currentPath,
    parentPath,
    viewMode,
    fileCount: items.length,
    directories: items
      .filter((i) => i.isDirectory)
      .map((i) => i.name)
      .slice(0, 30),
    files: items
      .filter((i) => !i.isDirectory)
      .map((i) => i.name)
      .slice(0, 30),
    selectedFile: selected?.name || null,
    hasPreview: !!previewContent,
    loading,
    error,
  });

  const fetchDirectory = useCallback(async (dirPath) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setPreviewContent(null);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const res = await fetch(`/api/fs/list${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setCurrentPath(data.path);
      setParentPath(data.parent);
      setHomedir(data.homedir);
      // Deduplicate items by path to prevent React key errors
      const seen = new Set();
      const deduped = (data.items || []).filter((item) => {
        if (seen.has(item.path || item.name)) return false;
        seen.add(item.path || item.name);
        return true;
      });
      setItems(deduped);
      setSavedPath(data.path);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateNew = useCallback(
    async (type) => {
      const name = createName.trim();
      if (!name) return;
      try {
        if (type === "folder") {
          await fetch("/api/fs/mkdir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: `${currentPath}/${name}` }),
          });
        } else {
          await fetch("/api/fs/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: `${currentPath}/${name}`,
              content: "",
            }),
          });
        }
        setCreateDialog(null);
        setCreateName("");
        fetchDirectory(currentPath);
      } catch (err) {
        console.error("Create failed:", err);
      }
    },
    [createName, currentPath, fetchDirectory],
  );

  const handleRename = useCallback(async () => {
    if (!renameDialog || !renameName.trim()) return;
    const fromPath = renameDialog.item.path;
    const dir = fromPath.substring(0, fromPath.lastIndexOf("/"));
    const toPath = `${dir}/${renameName.trim()}`;
    try {
      await fetch("/api/fs/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      });
      setRenameDialog(null);
      setRenameName("");
      fetchDirectory(currentPath);
    } catch (err) {
      console.error("Rename failed:", err);
    }
  }, [renameDialog, renameName, currentPath, fetchDirectory]);

  const handleDelete = useCallback(
    async (item) => {
      const confirmed = window.confirm(
        `Delete "${item.name}"? This cannot be undone.`,
      );
      if (!confirmed) return;
      try {
        await fetch(`/api/fs/delete?path=${encodeURIComponent(item.path)}`, {
          method: "DELETE",
        });
        fetchDirectory(currentPath);
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [currentPath, fetchDirectory],
  );

  useEffect(() => {
    fetchDirectory(initialPath || savedPath || "");
  }, []);

  const navigateTo = useCallback(
    (path) => {
      // Add to history
      const newHistory = [...history.slice(0, historyIndex + 1), path];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      fetchDirectory(path);
    },
    [history, historyIndex, fetchDirectory],
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      fetchDirectory(history[newIndex]);
    }
  }, [historyIndex, history, fetchDirectory]);

  const goUp = useCallback(() => {
    if (parentPath && parentPath !== currentPath) {
      navigateTo(parentPath);
    }
  }, [parentPath, currentPath, navigateTo]);

  const handleItemClick = useCallback((item) => {
    setSelected(item.name);
    if (!item.isDirectory && item.size && item.size < 512 * 1024) {
      // Try to preview small text files
      const textExts = [
        "txt",
        "md",
        "js",
        "jsx",
        "ts",
        "tsx",
        "css",
        "html",
        "json",
        "yaml",
        "yml",
        "toml",
        "py",
        "rb",
        "go",
        "rs",
        "java",
        "sh",
        "bash",
        "sql",
        "env",
        "log",
        "conf",
        "cfg",
        "ini",
        "xml",
        "csv",
        "c",
        "cpp",
        "h",
      ];
      const imgExts = ["jpg", "jpeg", "png", "gif", "svg", "webp"];
      const videoExts = ["mp4", "mov", "webm", "avi", "mkv"];

      if (item.extension && textExts.includes(item.extension)) {
        setPreviewLoading(true);
        fetch(`/api/fs/read?path=${encodeURIComponent(item.path)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.content)
              setPreviewContent({
                name: item.name,
                type: "text",
                content: data.content,
                ext: item.extension,
              });
            else setPreviewContent(null);
          })
          .catch(() => setPreviewContent(null))
          .finally(() => setPreviewLoading(false));
      } else if (item.extension && imgExts.includes(item.extension)) {
        setPreviewContent({
          name: item.name,
          type: "image",
          src: `/api/fs/media?path=${encodeURIComponent(item.path)}`,
        });
      } else if (item.extension && videoExts.includes(item.extension)) {
        setPreviewContent({
          name: item.name,
          type: "video",
          src: `/api/fs/media?path=${encodeURIComponent(item.path)}`,
        });
      } else {
        setPreviewContent(null);
      }
    } else {
      setPreviewContent(null);
    }
  }, []);

  const handleItemDoubleClick = useCallback(
    (item) => {
      if (item.isDirectory) {
        navigateTo(item.path);
      } else {
        // Open file in the appropriate widget
        const escaped = item.path.replace(/"/g, '\\"');
        try {
          commandRegistry.execute(`system.files.openFile("${escaped}")`);
        } catch {
          // Fallback — just open in file viewer
          commandRegistry.execute(`viewer.openFile("${escaped}")`);
        }
      }
    },
    [navigateTo],
  );

  const handleItemContextMenu = useCallback(
    (e, item) => {
      e.preventDefault();
      e.stopPropagation();
      setSelected(item.name);
      const menuItems = [];

      const escaped = item.path.replace(/"/g, '\\"');

      if (item.isDirectory) {
        menuItems.push(
          {
            label: "Open",
            icon: <FolderOpen size={14} />,
            onClick: () => navigateTo(item.path),
          },
          {
            label: "Open in Code Editor",
            icon: <Monitor size={14} />,
            onClick: () => {
              try {
                commandRegistry.execute(`code.openProject("${escaped}")`);
              } catch {}
            },
          },
        );
      } else {
        menuItems.push(
          {
            label: "Open",
            icon: <File size={14} />,
            onClick: () => {
              try {
                commandRegistry.execute(`system.files.openFile("${escaped}")`);
              } catch {}
            },
          },
          {
            label: "Edit in Code Editor",
            icon: <Code size={14} />,
            onClick: () => {
              try {
                commandRegistry.execute(`code.openFile("${escaped}")`);
              } catch {}
            },
          },
          {
            label: "Open in Viewer",
            icon: <Eye size={14} />,
            onClick: () => {
              try {
                commandRegistry.execute(`viewer.openFile("${escaped}")`);
              } catch {}
            },
          },
        );
      }

      menuItems.push(
        { type: "separator" },
        {
          label: "Rename",
          icon: <Pencil size={14} />,
          onClick: () => {
            setRenameDialog({ item });
            setRenameName(item.name);
          },
        },
        {
          label: "Copy Path",
          icon: <Clipboard size={14} />,
          onClick: () => {
            navigator.clipboard?.writeText(item.path);
          },
        },
        { type: "separator" },
        {
          label: "Delete",
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => handleDelete(item),
        },
        { type: "separator" },
        {
          label: "Refresh",
          icon: <RotateCw size={14} />,
          onClick: () => fetchDirectory(currentPath),
        },
      );

      setContextMenu({ x: e.clientX, y: e.clientY, items: menuItems });
    },
    [navigateTo, currentPath, fetchDirectory],
  );

  // Sidebar quick links
  const sidebarItems = homedir
    ? [
        { label: "Home", path: homedir, icon: Home },
        { label: "Documents", path: `${homedir}/Documents`, icon: FileText },
        { label: "Downloads", path: `${homedir}/Downloads`, icon: Download },
        { label: "Pictures", path: `${homedir}/Pictures`, icon: Image },
        { label: "Music", path: `${homedir}/Music`, icon: Music },
        { label: "Videos", path: `${homedir}/Movies`, icon: Film },
        {
          label: "Projects",
          path: `${homedir}/Documents/Projects`,
          icon: Code,
        },
        { label: "Desktop", path: `${homedir}/Desktop`, icon: HardDrive },
      ]
    : [];

  const pathParts = currentPath ? currentPath.split("/").filter(Boolean) : [];
  const dirCount = items.filter((i) => i.isDirectory).length;
  const fileCount = items.filter((i) => !i.isDirectory).length;

  return (
    <div className="file-explorer">
      {/* Sidebar */}
      <div className="fe-sidebar">
        <div className="fe-sidebar-section">Favorites</div>
        {sidebarItems.map((item) => (
          <button
            key={item.path}
            className={`fe-sidebar-item ${currentPath === item.path ? "active" : ""}`}
            onClick={() => navigateTo(item.path)}
          >
            <item.icon />
            {item.label}
          </button>
        ))}
        <div className="fe-sidebar-section" style={{ marginTop: "auto" }}>
          System
        </div>
        <button className="fe-sidebar-item" onClick={() => navigateTo("/")}>
          <HardDrive />
          Root (/)
        </button>
      </div>

      {/* Main */}
      <div className="fe-main">
        {/* Toolbar */}
        <div className="fe-toolbar">
          <button
            className="fe-nav-btn"
            onClick={goBack}
            disabled={historyIndex <= 0}
            title="Go back"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            className="fe-nav-btn"
            onClick={goUp}
            disabled={!parentPath || parentPath === currentPath}
            title="Go up"
          >
            <ChevronRight size={14} style={{ transform: "rotate(-90deg)" }} />
          </button>
          <button
            className="fe-nav-btn"
            onClick={() => fetchDirectory(currentPath)}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>

          <div className="fe-breadcrumb">
            <button
              className="fe-breadcrumb-item"
              onClick={() => navigateTo("/")}
            >
              /
            </button>
            {pathParts.map((part, i) => (
              <React.Fragment key={i}>
                <ChevronRight className="fe-breadcrumb-sep" size={12} />
                <button
                  className={`fe-breadcrumb-item ${i === pathParts.length - 1 ? "current" : ""}`}
                  onClick={() =>
                    navigateTo("/" + pathParts.slice(0, i + 1).join("/"))
                  }
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>

          <button
            className="fe-nav-btn fe-action-btn"
            onClick={() => {
              setCreateDialog({ type: "folder" });
              setCreateName("");
            }}
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
          <button
            className="fe-nav-btn fe-action-btn"
            onClick={() => {
              setCreateDialog({ type: "file" });
              setCreateName("");
            }}
            title="New File"
          >
            <FilePlus size={14} />
          </button>

          <div className="fe-view-toggle">
            <button
              className={`fe-view-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 />
            </button>
            <button
              className={`fe-view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
            >
              <List />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="fe-content-wrapper">
          <div className={`fe-content ${previewContent ? "with-preview" : ""}`}>
            {loading ? (
              <div className="fe-loading">
                <Loader2 size={24} className="fe-spinner" />
                <span>Loading...</span>
              </div>
            ) : error ? (
              <div className="fe-error">
                <span>⚠️ {error}</span>
                <button
                  className="fe-retry-btn"
                  onClick={() => fetchDirectory(currentPath)}
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="fe-empty">
                <span className="fe-empty-icon">📂</span>
                <span>This folder is empty</span>
              </div>
            ) : viewMode === "grid" ? (
              <div className="fe-grid">
                {items.map((item) => (
                  <button
                    key={item.path || item.name}
                    className={`fe-grid-item ${selected === item.name ? "selected" : ""}`}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => handleItemContextMenu(e, item)}
                  >
                    <span className="fe-grid-item-icon">
                      {item.extension &&
                      ["jpg", "jpeg", "png", "gif", "webp"].includes(
                        item.extension.toLowerCase(),
                      ) ? (
                        <img
                          src={`/api/fs/media?path=${encodeURIComponent(item.path)}`}
                          className="fe-grid-item-thumb"
                          alt={item.name}
                        />
                      ) : (
                        getFileIcon(item.name, item.isDirectory)
                      )}
                    </span>
                    <span className="fe-grid-item-name">{item.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="fe-list">
                <div className="fe-list-header">
                  <span className="fe-list-header-name">Name</span>
                  <span className="fe-list-header-date">Modified</span>
                  <span className="fe-list-header-size">Size</span>
                </div>
                {items.map((item) => (
                  <button
                    key={item.path || item.name}
                    className={`fe-list-item ${selected === item.name ? "selected" : ""}`}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => handleItemContextMenu(e, item)}
                  >
                    <span className="fe-list-item-icon">
                      {getSmallFileIcon(item.name, item.isDirectory)}
                    </span>
                    <span className="fe-list-item-name">{item.name}</span>
                    <span className="fe-list-item-date">
                      {formatDate(item.modified)}
                    </span>
                    <span className="fe-list-item-size">
                      {item.isDirectory ? "—" : formatSize(item.size)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* File Preview Panel */}
          {previewContent && (
            <div className="fe-preview">
              <div className="fe-preview-header">
                <Eye size={14} />
                <span>{previewContent.name}</span>
              </div>
              {previewContent.type === "image" ? (
                <div className="fe-preview-media">
                  <img src={previewContent.src} alt={previewContent.name} />
                </div>
              ) : previewContent.type === "video" ? (
                <div className="fe-preview-media">
                  <video src={previewContent.src} controls />
                </div>
              ) : (
                <pre className="fe-preview-content">
                  {previewContent.content}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="fe-statusbar">
          {dirCount > 0 && `${dirCount} folder${dirCount !== 1 ? "s" : ""}`}
          {dirCount > 0 && fileCount > 0 && ", "}
          {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? "s" : ""}`}
          {items.length === 0 && "Empty folder"}
          {selected ? ` · ${selected}` : ""}
        </div>
      </div>

      {/* Create Dialog */}
      {createDialog && (
        <div
          className="fe-dialog-overlay"
          onClick={() => setCreateDialog(null)}
        >
          <div className="fe-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="fe-dialog-title">
              {createDialog.type === "folder" ? "New Folder" : "New File"}
            </div>
            <input
              className="fe-dialog-input"
              type="text"
              placeholder={
                createDialog.type === "folder" ? "Folder name" : "File name"
              }
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateNew(createDialog.type);
                if (e.key === "Escape") setCreateDialog(null);
              }}
              autoFocus
            />
            <div className="fe-dialog-actions">
              <button
                className="fe-dialog-btn"
                onClick={() => setCreateDialog(null)}
              >
                Cancel
              </button>
              <button
                className="fe-dialog-btn fe-dialog-btn-primary"
                onClick={() => handleCreateNew(createDialog.type)}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <div
          className="fe-dialog-overlay"
          onClick={() => setRenameDialog(null)}
        >
          <div className="fe-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="fe-dialog-title">Rename</div>
            <input
              className="fe-dialog-input"
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setRenameDialog(null);
              }}
              autoFocus
            />
            <div className="fe-dialog-actions">
              <button
                className="fe-dialog-btn"
                onClick={() => setRenameDialog(null)}
              >
                Cancel
              </button>
              <button
                className="fe-dialog-btn fe-dialog-btn-primary"
                onClick={handleRename}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

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
