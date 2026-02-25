/**
 * DocumentViewer — View, edit, and create documents.
 *
 * Supports: PDF, Word (.docx), Excel (.xlsx/.xls), CSV, TXT, MD, and code files.
 *
 * Features:
 * - Content extraction via /api/docs/read
 * - In-document text search (Ctrl+F)
 * - Spreadsheet view for Excel/CSV
 * - Text editing for plain text files
 * - Document indexing for universal search
 * - Exposed instance API for command system
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Table,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Loader2,
  FileSpreadsheet,
  File,
  Save,
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import { eventBus } from "../../core/EventBus";
import { contextEngine } from "../../core/ContextEngine";
import "./DocumentViewer.css";

// Shared instance for command API
let _docViewerInstance = null;

export function getDocViewerInstance() {
  return _docViewerInstance;
}

export default function DocumentViewer({ filePath: initialPath }) {
  const [filePath, setFilePath] = useState(initialPath || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [docText, setDocText] = useState(null);
  const [docMeta, setDocMeta] = useState(null);
  const [sheetData, setSheetData] = useState(null);
  const [activeSheet, setActiveSheet] = useState(null);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchIndex, setSearchIndex] = useState(0);

  // Edit state (for plain text)
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Open file picker
  const [showPicker, setShowPicker] = useState(!initialPath);
  const [pickerPath, setPickerPath] = useState("");

  const contentRef = useRef(null);
  const searchInputRef = useRef(null);

  const isSpreadsheet = docMeta && (docMeta.ext === "xlsx" || docMeta.ext === "xls" || docMeta.ext === "csv");
  const isPlainText = docMeta && !isSpreadsheet && docMeta.ext !== "pdf";

  // ─── Load Document ───────────────────────────────────────

  const loadDocument = useCallback(async (path) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    setDocText(null);
    setSheetData(null);
    setDocMeta(null);
    setShowPicker(false);

    try {
      const res = await fetch(`/api/docs/read?path=${encodeURIComponent(path)}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setDocText(data.text);
      setDocMeta(data.meta);
      setFilePath(path);

      // Handle spreadsheet data
      if (data.meta?.sheets) {
        setSheetData(data.meta.sheets);
        setActiveSheet(data.meta.sheetNames?.[0] || null);
      }

      // Register in context engine
      if (data.text) {
        contextEngine.registerDocument(path, data.text, data.meta);
        eventBus.emit("document:opened", { path, meta: data.meta });
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialPath) loadDocument(initialPath);
  }, [initialPath]);

  // ─── Instance API ────────────────────────────────────────

  useEffect(() => {
    _docViewerInstance = {
      getFilePath: () => filePath,
      getText: () => docText,
      getMeta: () => docMeta,
      find: (needle) => performSearch(needle),
      isEditing: () => isEditing,
      getEditContent: () => editContent,
      openFile: (path) => loadDocument(path),
    };
    return () => { _docViewerInstance = null; };
  });

  // ─── Search ──────────────────────────────────────────────

  const performSearch = useCallback((needle) => {
    if (!docText || !needle) {
      setSearchResults([]);
      return { matches: [], total: 0 };
    }

    const text = docText.toLowerCase();
    const search = needle.toLowerCase();
    const matches = [];
    let idx = 0;

    while ((idx = text.indexOf(search, idx)) !== -1) {
      const before = docText.substring(0, idx);
      const lines = before.split("\n");
      const line = lines.length;
      const start = Math.max(0, idx - 30);
      const end = Math.min(docText.length, idx + search.length + 30);
      let snippet = docText.substring(start, end).replace(/\n/g, " ");
      if (start > 0) snippet = "..." + snippet;
      if (end < docText.length) snippet += "...";

      matches.push({ line, position: idx, snippet });
      idx += search.length;
      if (matches.length >= 200) break;
    }

    setSearchResults(matches);
    setSearchIndex(0);
    return { matches, total: matches.length };
  }, [docText]);

  useEffect(() => {
    if (searchQuery) performSearch(searchQuery);
    else setSearchResults([]);
  }, [searchQuery, performSearch]);

  // ─── Keyboard Shortcuts ──────────────────────────────────

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && isEditing && isDirty) {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showSearch, isEditing, isDirty]);

  // ─── Save (plain text) ──────────────────────────────────

  const saveFile = async () => {
    if (!filePath || !isDirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/fs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content: editContent }),
      });
      const data = await res.json();
      if (data.success) {
        setDocText(editContent);
        setIsDirty(false);
        contextEngine.registerDocument(filePath, editContent, docMeta);
      }
    } catch {}
    setSaving(false);
  };

  // ─── Open File ───────────────────────────────────────────

  const openFilePath = (path) => {
    if (path.trim()) {
      loadDocument(path.trim());
    }
  };

  // ─── Highlight search matches in text ────────────────────

  const highlightText = (text) => {
    if (!searchQuery || searchResults.length === 0) return text;
    const parts = [];
    const lower = text.toLowerCase();
    const needle = searchQuery.toLowerCase();
    let lastIdx = 0;

    // Only highlight in visible portion to avoid perf issues
    const maxHighlights = 100;
    let count = 0;
    let idx = 0;

    while ((idx = lower.indexOf(needle, idx)) !== -1 && count < maxHighlights) {
      if (idx > lastIdx) parts.push(text.substring(lastIdx, idx));
      parts.push(
        <mark key={idx} className="dv-highlight">
          {text.substring(idx, idx + searchQuery.length)}
        </mark>
      );
      lastIdx = idx + searchQuery.length;
      idx = lastIdx;
      count++;
    }

    if (lastIdx < text.length) parts.push(text.substring(lastIdx));
    return parts;
  };

  // ─── Render ──────────────────────────────────────────────

  const renderDocType = () => {
    if (!docMeta) return null;
    const ext = docMeta.ext?.toUpperCase() || "FILE";
    const icons = {
      PDF: <FileText size={14} />,
      DOCX: <BookOpen size={14} />,
      XLSX: <FileSpreadsheet size={14} />,
      XLS: <FileSpreadsheet size={14} />,
      CSV: <Table size={14} />,
    };
    return (
      <span className="dv-doctype">
        {icons[ext] || <File size={14} />}
        {ext}
      </span>
    );
  };

  const renderSpreadsheet = () => {
    if (!sheetData || !activeSheet) return null;
    const sheet = sheetData[activeSheet];
    if (!sheet) return null;

    const rows = sheet.json || [];
    if (rows.length === 0) return <div className="dv-empty-sheet">Empty sheet</div>;

    const headers = Object.keys(rows[0]);

    return (
      <div className="dv-spreadsheet">
        {Object.keys(sheetData).length > 1 && (
          <div className="dv-sheet-tabs">
            {Object.keys(sheetData).map((name) => (
              <button
                key={name}
                className={`dv-sheet-tab ${activeSheet === name ? "active" : ""}`}
                onClick={() => setActiveSheet(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="dv-table-wrap">
          <table className="dv-table">
            <thead>
              <tr>
                <th className="dv-row-num">#</th>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((row, i) => (
                <tr key={i}>
                  <td className="dv-row-num">{i + 1}</td>
                  {headers.map((h) => (
                    <td key={h}>{row[h] != null ? String(row[h]) : ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && (
            <div className="dv-truncated">
              Showing 500 of {rows.length} rows
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTextContent = () => {
    if (!docText) return null;

    if (isEditing) {
      return (
        <textarea
          className="dv-edit-area"
          value={editContent}
          onChange={(e) => {
            setEditContent(e.target.value);
            setIsDirty(true);
          }}
          spellCheck={false}
        />
      );
    }

    const lines = docText.split("\n");
    return (
      <div className="dv-text-content" ref={contentRef}>
        {lines.map((line, i) => (
          <div key={i} className="dv-text-line">
            <span className="dv-line-num">{i + 1}</span>
            <span className="dv-line-text">{highlightText(line)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="document-viewer">
      {/* Toolbar */}
      <div className="dv-toolbar">
        <div className="dv-toolbar-left">
          {renderDocType()}
          {docMeta && (
            <span className="dv-filename" title={filePath}>
              {docMeta.name}
            </span>
          )}
          {isDirty && <span className="dv-dirty-badge">MODIFIED</span>}
        </div>
        <div className="dv-toolbar-right">
          {isPlainText && docText && (
            <button
              className={`dv-tool-btn ${isEditing ? "active" : ""}`}
              onClick={() => {
                if (!isEditing) {
                  setEditContent(docText);
                  setIsEditing(true);
                } else {
                  setIsEditing(false);
                }
              }}
              title={isEditing ? "View mode" : "Edit mode"}
            >
              {isEditing ? <BookOpen size={14} /> : <FileText size={14} />}
              {isEditing ? "View" : "Edit"}
            </button>
          )}
          {isEditing && isDirty && (
            <button className="dv-tool-btn save" onClick={saveFile} disabled={saving}>
              <Save size={14} />
              {saving ? "Saving..." : "Save"}
            </button>
          )}
          <button
            className={`dv-tool-btn ${showSearch ? "active" : ""}`}
            onClick={() => {
              setShowSearch(!showSearch);
              if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            title="Search (Ctrl+F)"
          >
            <Search size={14} />
          </button>
          <button
            className="dv-tool-btn"
            onClick={() => {
              setShowPicker(true);
              setFilePath("");
              setDocText(null);
              setDocMeta(null);
              setSheetData(null);
              setError(null);
            }}
            title="Open another file"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="dv-searchbar">
          <Search size={14} />
          <input
            ref={searchInputRef}
            className="dv-search-input"
            placeholder="Find in document..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearchIndex((i) => (i + 1) % Math.max(searchResults.length, 1));
              }
              if (e.key === "Escape") {
                setShowSearch(false);
                setSearchQuery("");
              }
            }}
          />
          {searchResults.length > 0 && (
            <span className="dv-search-count">
              {searchIndex + 1} / {searchResults.length}
            </span>
          )}
          <button className="dv-search-nav" onClick={() => setSearchIndex((i) => Math.max(i - 1, 0))}>
            <ChevronLeft size={14} />
          </button>
          <button className="dv-search-nav" onClick={() => setSearchIndex((i) => Math.min(i + 1, searchResults.length - 1))}>
            <ChevronRight size={14} />
          </button>
          <button className="dv-search-nav" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="dv-content">
        {showPicker && !loading && !docText ? (
          <div className="dv-picker">
            <div className="dv-picker-icon">
              <FolderOpen size={48} />
            </div>
            <span className="dv-picker-title">Open Document</span>
            <span className="dv-picker-hint">PDF, Word, Excel, CSV, and text files</span>
            <div className="dv-picker-input-row">
              <input
                className="dv-picker-input"
                placeholder="/path/to/document"
                value={pickerPath}
                onChange={(e) => setPickerPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openFilePath(pickerPath);
                }}
                autoFocus
              />
              <button className="dv-picker-btn" onClick={() => openFilePath(pickerPath)}>
                Open
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="dv-loading">
            <Loader2 size={24} className="dv-spinner" />
            <span>Parsing document...</span>
          </div>
        ) : error ? (
          <div className="dv-error">
            <AlertTriangle size={24} />
            <span>{error}</span>
          </div>
        ) : isSpreadsheet ? (
          renderSpreadsheet()
        ) : docText ? (
          renderTextContent()
        ) : (
          <div className="dv-empty">
            <FileText size={32} />
            <span>No content to display</span>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="dv-statusbar">
        <span>{filePath || "No document"}</span>
        {docMeta && (
          <>
            {docMeta.lineCount && <span>{docMeta.lineCount} lines</span>}
            {docMeta.pages && <span>{docMeta.pages} pages</span>}
            {isSpreadsheet && activeSheet && (
              <span>{sheetData[activeSheet]?.rowCount || 0} rows</span>
            )}
            <span>{(docMeta.size / 1024).toFixed(1)} KB</span>
          </>
        )}
        {searchResults.length > 0 && (
          <span className="dv-status-search">{searchResults.length} matches</span>
        )}
      </div>
    </div>
  );
}
