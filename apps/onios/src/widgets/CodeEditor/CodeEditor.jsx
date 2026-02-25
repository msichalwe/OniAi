import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  File,
  FileText,
  FileCode,
  FileImage,
  FileJson,
  Database,
  Terminal,
  Folder,
  Save,
  Plus,
  Search,
  RotateCw,
} from "lucide-react";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./CodeEditor.css";

const EXT_ICONS = {
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  css: FileImage,
  html: FileCode,
  py: FileCode,
  rb: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  json: FileJson,
  yaml: FileJson,
  yml: FileJson,
  md: FileText,
  txt: FileText,
  sh: Terminal,
  sql: Database,
  svg: FileImage,
  vue: FileCode,
  svelte: FileCode,
};

const getIcon = (name, isDir) => {
  if (isDir) return <Folder size={14} className="ce-icon-folder" />;
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const Icon = EXT_ICONS[ext] || File;
  return <Icon size={14} className="ce-icon-file" />;
};

// Shared instance ref so commands can interact with the active editor
let _editorInstance = null;

export function getEditorInstance() {
  return _editorInstance;
}

export default function CodeEditor({
  projectPath,
  filePath: initialFile,
  windowId,
  widgetType,
}) {
  // Derive initial root: explicit projectPath > file's parent dir > empty (shows picker)
  const deriveRoot = () => {
    if (projectPath) return projectPath;
    if (initialFile) {
      const parts = initialFile.split("/");
      parts.pop();
      return parts.join("/");
    }
    return "";
  };

  const [tree, setTree] = useState([]);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [fileContents, setFileContents] = useState({});
  const [originalContents, setOriginalContents] = useState({});
  const [dirtyFiles, setDirtyFiles] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [rootPath, setRootPath] = useState(deriveRoot);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [quickFolders, setQuickFolders] = useState([]);
  const editorRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  // Report live context for AI agents
  useWidgetContext(windowId, "code-editor", {
    rootPath,
    activeFile: activeTab,
    openFiles: openTabs.map((t) => t.path),
    dirtyFiles: Array.from(dirtyFiles),
    fileCount: openTabs.length,
    loading,
    saving,
    hasActiveContent: !!(activeTab && fileContents[activeTab]),
    activeContentPreview:
      activeTab && fileContents[activeTab]
        ? fileContents[activeTab].slice(0, 300)
        : null,
  });

  // Expose instance for command API
  useEffect(() => {
    _editorInstance = {
      openFile: (path) => openFileByPath(path),
      saveFile: () => saveActiveFile(),
      saveAll: () => saveAllFiles(),
      getContent: (path) => fileContents[path || activeTab] || null,
      setContent: (path, content) => {
        const target = path || activeTab;
        if (!target) return false;
        setFileContents((prev) => ({ ...prev, [target]: content }));
        setDirtyFiles((prev) => new Set(prev).add(target));
        return true;
      },
      getActiveFile: () => activeTab,
      getOpenFiles: () => openTabs.map((t) => t.path),
      getRootPath: () => rootPath,
      isDirty: (path) => dirtyFiles.has(path || activeTab),
      closeFile: (path) => {
        const target = path || activeTab;
        if (target) closeTabByPath(target);
      },
    };
    return () => {
      _editorInstance = null;
    };
  });

  // Load project directory
  const loadDir = useCallback(async (dirPath) => {
    try {
      const res = await fetch(
        `/api/fs/list?path=${encodeURIComponent(dirPath)}`,
      );
      const data = await res.json();
      if (data.error) return [];
      return data.items
        .map((item) => ({
          ...item,
          children: item.isDirectory ? null : undefined,
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  }, []);

  // Load tree when rootPath is set (either from props or folder picker)
  useEffect(() => {
    if (!rootPath) return;
    let active = true;
    setTreeLoading(true);

    loadDir(rootPath)
      .then((items) => {
        if (active) {
          setTree(items || []);
          setTreeLoading(false);
        }
      })
      .catch(() => {
        if (active) setTreeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rootPath]);

  // Load quick-access folders for the picker (only when no root)
  useEffect(() => {
    if (rootPath) return;
    fetch("/api/fs/home")
      .then((r) => r.json())
      .then((data) => {
        const home = data.homedir;
        // Show common project directories
        return fetch(`/api/fs/list?path=${encodeURIComponent(home)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.items) {
              const dirs = d.items
                .filter((i) => i.isDirectory && !i.name.startsWith("."))
                .sort((a, b) => a.name.localeCompare(b.name))
                .slice(0, 20);
              setQuickFolders(dirs);
              setFolderInput(home);
            }
          });
      })
      .catch(() => {});
  }, [rootPath]);

  // Open initial file if provided
  useEffect(() => {
    if (initialFile) {
      openFileByPath(initialFile);
    }
  }, [initialFile]);

  const toggleDir = useCallback(
    async (dirPath) => {
      const newExpanded = new Set(expandedDirs);
      if (newExpanded.has(dirPath)) {
        newExpanded.delete(dirPath);
        setExpandedDirs(newExpanded);
      } else {
        newExpanded.add(dirPath);
        setExpandedDirs(newExpanded);
        const children = await loadDir(dirPath);
        setTree((prev) => updateTreeChildren(prev, dirPath, children));
      }
    },
    [expandedDirs, loadDir],
  );

  const updateTreeChildren = (items, targetPath, children) => {
    return items.map((item) => {
      if (item.path === targetPath) {
        return { ...item, children };
      }
      if (item.children && Array.isArray(item.children)) {
        return {
          ...item,
          children: updateTreeChildren(item.children, targetPath, children),
        };
      }
      return item;
    });
  };

  const openFileByPath = async (filePath) => {
    const name = filePath.split("/").pop();
    if (!openTabs.find((t) => t.path === filePath)) {
      setOpenTabs((prev) => [...prev, { path: filePath, name }]);
    }
    setActiveTab(filePath);

    if (!fileContents[filePath]) {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/fs/read?path=${encodeURIComponent(filePath)}`,
        );
        const data = await res.json();
        const content =
          data.content ?? `Error: ${data.error || "Could not read file"}`;
        setFileContents((prev) => ({ ...prev, [filePath]: content }));
        setOriginalContents((prev) => ({ ...prev, [filePath]: content }));
      } catch (err) {
        setFileContents((prev) => ({
          ...prev,
          [filePath]: `Error: ${err.message}`,
        }));
      }
      setLoading(false);
    }
  };

  const openFile = useCallback(
    (item) => {
      if (item.isDirectory) {
        toggleDir(item.path);
        return;
      }
      openFileByPath(item.path);
    },
    [toggleDir],
  );

  const closeTabByPath = (path) => {
    const newTabs = openTabs.filter((t) => t.path !== path);
    setOpenTabs(newTabs);
    if (activeTab === path) {
      setActiveTab(
        newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null,
      );
    }
    setFileContents((prev) => {
      const copy = { ...prev };
      delete copy[path];
      return copy;
    });
    setOriginalContents((prev) => {
      const copy = { ...prev };
      delete copy[path];
      return copy;
    });
    setDirtyFiles((prev) => {
      const copy = new Set(prev);
      copy.delete(path);
      return copy;
    });
  };

  const closeTab = (path, e) => {
    e.stopPropagation();
    closeTabByPath(path);
  };

  // Save active file
  const saveActiveFile = async () => {
    if (!activeTab || !dirtyFiles.has(activeTab)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/fs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: activeTab,
          content: fileContents[activeTab],
        }),
      });
      const data = await res.json();
      if (!data.error) {
        setOriginalContents((prev) => ({
          ...prev,
          [activeTab]: fileContents[activeTab],
        }));
        setDirtyFiles((prev) => {
          const copy = new Set(prev);
          copy.delete(activeTab);
          return copy;
        });
      }
    } catch {
      // Save failed silently
    }
    setSaving(false);
  };

  // Save all dirty files
  const saveAllFiles = async () => {
    const dirty = Array.from(dirtyFiles);
    for (const path of dirty) {
      try {
        const res = await fetch("/api/fs/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content: fileContents[path] }),
        });
        const data = await res.json();
        if (!data.error) {
          setOriginalContents((prev) => ({
            ...prev,
            [path]: fileContents[path],
          }));
          setDirtyFiles((prev) => {
            const copy = new Set(prev);
            copy.delete(path);
            return copy;
          });
        }
      } catch {
        // continue
      }
    }
  };

  // Handle content editing
  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setFileContents((prev) => ({ ...prev, [activeTab]: newContent }));
    if (newContent !== originalContents[activeTab]) {
      setDirtyFiles((prev) => new Set(prev).add(activeTab));
    } else {
      setDirtyFiles((prev) => {
        const copy = new Set(prev);
        copy.delete(activeTab);
        return copy;
      });
    }
  };

  // Keyboard shortcuts
  const handleEditorKeyDown = (e) => {
    // Ctrl/Cmd + S — Save
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      saveActiveFile();
      return;
    }
    // Ctrl/Cmd + Shift + S — Save All
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
      e.preventDefault();
      saveAllFiles();
      return;
    }
    // Tab key — insert 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);
      setFileContents((prev) => ({ ...prev, [activeTab]: newVal }));
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  // Sync scroll between textarea and line numbers
  const handleEditorScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const renderTree = (items, depth = 0) => {
    if (!items) return null;
    return items.map((item) => {
      const isExpanded = expandedDirs.has(item.path);
      // Filter by search
      if (searchQuery && !item.isDirectory) {
        if (!item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return null;
        }
      }
      return (
        <React.Fragment key={item.path}>
          <button
            className={`ce-tree-item ${item.isDirectory ? "directory" : ""} ${activeTab === item.path ? "active" : ""}`}
            onClick={() => openFile(item)}
            style={{ paddingLeft: 12 + depth * 12 }}
          >
            {item.isDirectory &&
              (isExpanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              ))}
            <span className="ce-tree-icon">
              {getIcon(item.name, item.isDirectory)}
            </span>
            <span className="ce-tree-name">{item.name}</span>
          </button>
          {item.isDirectory &&
            isExpanded &&
            item.children &&
            renderTree(item.children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  const activeContent = activeTab ? fileContents[activeTab] : null;
  const activeFileName = activeTab ? activeTab.split("/").pop() : "";
  const activeExt = activeFileName.includes(".")
    ? activeFileName.split(".").pop().toLowerCase()
    : "";
  const lineCount = activeContent ? activeContent.split("\n").length : 0;
  const isActiveDirty = activeTab ? dirtyFiles.has(activeTab) : false;
  const cursorInfo = textareaRef.current
    ? (() => {
        const pos = textareaRef.current.selectionStart;
        const text = (fileContents[activeTab] || "").substring(0, pos);
        const line = text.split("\n").length;
        const col = pos - text.lastIndexOf("\n");
        return `Ln ${line}, Col ${col}`;
      })()
    : "";

  // Open a folder as the project root
  const openFolder = (path) => {
    setRootPath(path);
    setTree([]);
    setExpandedDirs(new Set());
  };

  // State for the folder picker dialog
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  return (
    <div className="code-editor">
      {/* Sidebar — only visible when a project is open */}
      {rootPath && (
        <div className="ce-sidebar">
          <div className="ce-sidebar-header">
            <FolderOpen size={14} />
            <span className="ce-sidebar-title">
              {rootPath.split("/").pop() || "Explorer"}
            </span>
            <button
              className="ce-sidebar-btn"
              onClick={() => setShowSearch(!showSearch)}
              title="Search files"
            >
              <Search size={12} />
            </button>
            <button
              className="ce-sidebar-btn"
              onClick={() => {
                setTreeLoading(true);
                loadDir(rootPath).then((items) => {
                  setTree(items || []);
                  setTreeLoading(false);
                });
              }}
              title="Refresh"
            >
              <RotateCw size={12} />
            </button>
            <button
              className="ce-sidebar-btn"
              onClick={() => {
                setRootPath("");
                setTree([]);
                setExpandedDirs(new Set());
              }}
              title="Change folder"
            >
              <X size={12} />
            </button>
          </div>
          {showSearch && (
            <div className="ce-search-box">
              <input
                className="ce-search-input"
                placeholder="Filter files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="ce-tree">
            {treeLoading ? (
              <div className="ce-loading">
                <Loader2 size={16} className="ce-spinner" />
              </div>
            ) : (
              renderTree(tree)
            )}
          </div>
        </div>
      )}

      {/* Folder picker overlay */}
      {showFolderPicker && !rootPath && (
        <div
          className="ce-picker-overlay"
          onClick={() => setShowFolderPicker(false)}
        >
          <div
            className="ce-picker-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ce-picker-dialog-header">
              <FolderOpen size={16} />
              <span>Open Project Folder</span>
            </div>
            <div className="ce-picker-input-row">
              <input
                className="ce-picker-path-input"
                placeholder="/path/to/project"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && folderInput.trim()) {
                    openFolder(folderInput.trim());
                    setShowFolderPicker(false);
                  }
                }}
                autoFocus
              />
              <button
                className="ce-picker-open-btn"
                onClick={() => {
                  if (folderInput.trim()) {
                    openFolder(folderInput.trim());
                    setShowFolderPicker(false);
                  }
                }}
              >
                Open
              </button>
            </div>
            {quickFolders.length > 0 && (
              <>
                <div className="ce-picker-label">Quick Access</div>
                <div className="ce-picker-list">
                  {quickFolders.map((dir) => (
                    <button
                      key={dir.path}
                      className="ce-picker-item"
                      onClick={() => {
                        openFolder(dir.path);
                        setShowFolderPicker(false);
                      }}
                    >
                      <Folder size={14} />
                      <span>{dir.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="ce-main">
        {/* Tabs */}
        {openTabs.length > 0 && (
          <div className="ce-tabs">
            {openTabs.map((tab) => {
              const isDirty = dirtyFiles.has(tab.path);
              return (
                <button
                  key={tab.path}
                  className={`ce-tab ${activeTab === tab.path ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.path)}
                  title={tab.path}
                >
                  <span className="ce-tab-icon">
                    {getIcon(tab.name, false)}
                  </span>
                  <span className="ce-tab-name">{tab.name}</span>
                  {isDirty && <span className="ce-tab-dirty" />}
                  <span
                    className="ce-tab-close"
                    onClick={(e) => closeTab(tab.path, e)}
                  >
                    <X />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Editor area */}
        {loading ? (
          <div className="ce-loading">
            <Loader2 size={20} className="ce-spinner" />
            <span>Loading...</span>
          </div>
        ) : activeContent != null ? (
          <div className="ce-editor" ref={editorRef}>
            <div className="ce-line-numbers" ref={lineNumbersRef}>
              {activeContent.split("\n").map((_, i) => (
                <div key={i} className="ce-gutter-line">
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="ce-textarea"
              value={activeContent}
              onChange={handleContentChange}
              onKeyDown={handleEditorKeyDown}
              onScroll={handleEditorScroll}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-gramm="false"
            />
          </div>
        ) : (
          <div className="ce-empty">
            <div className="ce-empty-icon">
              <FolderOpen size={48} />
            </div>
            {!rootPath ? (
              <>
                <span>No project open</span>
                <button
                  className="ce-open-project-btn"
                  onClick={() => setShowFolderPicker(true)}
                >
                  <FolderOpen size={16} />
                  Open Project
                </button>
                <span className="ce-empty-hint">
                  or use code.openProject("/path")
                </span>
              </>
            ) : (
              <>
                <span>Select a file to edit</span>
                <span className="ce-empty-hint">
                  {openTabs.length === 0
                    ? "Browse the file tree or use code.openFile()"
                    : "Click a tab above"}
                </span>
              </>
            )}
          </div>
        )}

        {/* Status bar */}
        <div className="ce-statusbar">
          <div className="ce-statusbar-left">
            {activeTab && (
              <>
                <span>{activeTab}</span>
                {isActiveDirty && (
                  <span className="ce-status-dirty">MODIFIED</span>
                )}
                {saving && <span className="ce-status-saving">Saving...</span>}
              </>
            )}
            {!activeTab && <span>No file open</span>}
          </div>
          <div className="ce-statusbar-right">
            {cursorInfo && <span>{cursorInfo}</span>}
            {activeExt && <span>{activeExt.toUpperCase()}</span>}
            {lineCount > 0 && <span>{lineCount} lines</span>}
            <span>UTF-8</span>
            {isActiveDirty && (
              <button className="ce-save-btn" onClick={saveActiveFile}>
                <Save size={11} /> Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
