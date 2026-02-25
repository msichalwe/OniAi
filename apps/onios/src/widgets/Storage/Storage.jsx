/**
 * Storage Widget — Browse, inspect, and manage all OniOS storage.
 *
 * Categories:
 *   - System stores (Zustand persisted: commands, tasks, workflows, etc.)
 *   - App storage (namespaced key-value via StorageService)
 *   - Widget states (per-instance persistence)
 *   - Other (any remaining localStorage keys)
 *
 * Features:
 *   - Usage stats with quota bar
 *   - Table view with key, type, size, preview
 *   - Inspector panel to view full JSON content
 *   - Add / delete keys
 *   - Export / import all data
 *   - Search across all keys
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Database,
  HardDrive,
  Layers,
  Box,
  MoreHorizontal,
  Trash2,
  Eye,
  X,
  Plus,
  Download,
  Upload,
  RefreshCw,
  Copy,
  Clipboard,
  Brain,
  Shell,
} from "lucide-react";
import useStorageStore from "../../stores/storageStore.js";
import { storageService } from "../../core/StorageService.js";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./Storage.css";

const BASE_CATEGORIES = [
  { id: "all", label: "All Storage", icon: Database },
  { id: "system", label: "System Stores", icon: HardDrive },
  { id: "storage", label: "App Storage", icon: Layers },
  { id: "widgetState", label: "Widget States", icon: Box },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

function formatDate(ts) {
  if (!ts) return "--";
  const d = new Date(ts);
  return (
    d.toLocaleDateString() +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

export default function Storage({ windowId, widgetType }) {
  const stats = useStorageStore((s) => s.stats);
  const entries = useStorageStore((s) => s.entries);
  const namespaces = useStorageStore((s) => s.namespaces);
  const selectedCategory = useStorageStore((s) => s.selectedCategory);
  const selectedNamespace = useStorageStore((s) => s.selectedNamespace);
  const searchQuery = useStorageStore((s) => s.searchQuery);
  const inspectingKey = useStorageStore((s) => s.inspectingKey);
  const refresh = useStorageStore((s) => s.refresh);
  const setCategory = useStorageStore((s) => s.setCategory);
  const setNamespace = useStorageStore((s) => s.setNamespace);
  const setSearch = useStorageStore((s) => s.setSearch);
  const setInspecting = useStorageStore((s) => s.setInspecting);
  const deleteKey = useStorageStore((s) => s.deleteKey);
  const deleteAIItem = useStorageStore((s) => s.deleteAIItem);
  const aiData = useStorageStore((s) => s.aiData);
  const oniData = useStorageStore((s) => s.oniData);
  const aiMode = useStorageStore((s) => s.aiMode);
  const getFilteredEntries = useStorageStore((s) => s.getFilteredEntries);
  const getRawValue = useStorageStore((s) => s.getRawValue);
  const exportData = useStorageStore((s) => s.exportData);
  const importData = useStorageStore((s) => s.importData);

  // Build categories based on AI mode
  const CATEGORIES = React.useMemo(() => {
    const cats = [...BASE_CATEGORIES];
    if (aiMode === "oni") {
      cats.push({ id: "oni", label: "OniAI Brain", icon: Shell });
    } else {
      cats.push({ id: "aiMemory", label: "AI Memory", icon: Brain });
    }
    return cats;
  }, [aiMode]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ namespace: "", key: "", value: "" });
  const fileInputRef = useRef(null);

  // Report live context for AI agents
  useWidgetContext(windowId, "storage", {
    totalKeys: stats?.totalKeys || 0,
    totalSize: stats?.totalSizeFormatted || "0 B",
    usagePercent: stats?.usagePercent || 0,
    systemKeys: stats?.systemKeys || 0,
    storageKeys: stats?.storageKeys || 0,
    widgetStateKeys: stats?.widgetStateKeys || 0,
    namespaces,
    selectedCategory,
    selectedNamespace,
    inspectingKey,
  });

  // Initial load
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const filteredEntries = entries ? getFilteredEntries() : [];

  // AI stats
  const aiMemoryCount = aiData?.memoryTotal || 0;
  const aiConvCount = aiData?.conversations?.length || 0;
  const aiKnowledgeCount = aiData?.knowledge?.length || 0;
  const aiTotalItems =
    aiMemoryCount +
    aiConvCount +
    aiKnowledgeCount +
    (aiData?.personality?.name ? 1 : 0);

  // Get inspected value
  const inspectedRaw = inspectingKey ? getRawValue(inspectingKey) : null;
  let inspectedPretty = "";
  let inspectedMeta = null;
  if (inspectedRaw) {
    try {
      const parsed = JSON.parse(inspectedRaw);
      inspectedPretty = JSON.stringify(parsed, null, 2);
    } catch {
      inspectedPretty = inspectedRaw;
    }
    // Find entry for meta
    const allItems = [
      ...(entries?.system || []),
      ...(entries?.storage || []),
      ...(entries?.widgetState || []),
      ...(entries?.other || []),
    ];
    inspectedMeta = allItems.find((e) => e.key === inspectingKey);
  }

  const handleExport = useCallback(() => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onios-storage-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportData]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const result = importData(data, "merge");
          alert(`Imported ${result.imported} keys, skipped ${result.skipped}`);
        } catch (err) {
          alert("Invalid import file: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [importData],
  );

  const handleAdd = useCallback(() => {
    if (!addForm.namespace || !addForm.key) return;
    let value;
    try {
      value = JSON.parse(addForm.value);
    } catch {
      value = addForm.value;
    }
    storageService.set(addForm.namespace, addForm.key, value);
    refresh();
    setShowAddModal(false);
    setAddForm({ namespace: "", key: "", value: "" });
  }, [addForm, refresh]);

  const handleDelete = useCallback(
    (fullKey, e) => {
      e.stopPropagation();
      deleteKey(fullKey);
      if (inspectingKey === fullKey) setInspecting(null);
    },
    [deleteKey, inspectingKey, setInspecting],
  );

  const handleCopyValue = useCallback(() => {
    if (inspectedRaw) {
      navigator.clipboard.writeText(inspectedPretty || inspectedRaw);
    }
  }, [inspectedRaw, inspectedPretty]);

  return (
    <div className="storage-widget">
      {/* Sidebar */}
      <div className="storage-sidebar">
        <div className="storage-sidebar-header">
          <h3>Storage</h3>
          {stats && (
            <>
              <div className="storage-usage-bar">
                <div
                  className="storage-usage-fill"
                  style={{ width: `${Math.min(stats.usagePercent, 100)}%` }}
                />
              </div>
              <div className="storage-usage-text">
                {stats.totalSizeFormatted} / {stats.quotaFormatted} (
                {stats.usagePercent}%)
              </div>
            </>
          )}
        </div>

        <div className="storage-nav">
          {CATEGORIES.map((cat) => {
            const ocCount = oniData?.totalFiles || 0;
            const brainCount = aiMode === "oni" ? ocCount : aiTotalItems;
            const count = entries
              ? cat.id === "all"
                ? entries.system.length +
                  entries.storage.length +
                  entries.widgetState.length +
                  entries.other.length +
                  brainCount
                : cat.id === "oni"
                  ? ocCount
                  : cat.id === "aiMemory"
                    ? aiTotalItems
                    : (entries[cat.id] || []).length
              : 0;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                className={`storage-nav-item ${selectedCategory === cat.id && !selectedNamespace ? "active" : ""}`}
                onClick={() => setCategory(cat.id)}
              >
                <Icon size={14} />
                {cat.label}
                <span className="count">{count}</span>
              </button>
            );
          })}

          {namespaces.length > 0 && (
            <>
              <div className="storage-nav-sep" />
              {namespaces.map((ns) => (
                <button
                  key={ns}
                  className={`storage-nav-item storage-nav-sub ${selectedNamespace === ns ? "active" : ""}`}
                  onClick={() => {
                    setCategory("storage");
                    setNamespace(ns);
                  }}
                >
                  <Layers size={12} />
                  {ns}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="storage-sidebar-actions">
          <button onClick={handleExport}>
            <Download size={12} /> Export All
          </button>
          <button onClick={handleImport}>
            <Upload size={12} /> Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".json"
            onChange={handleFileImport}
          />
        </div>
      </div>

      {/* Main */}
      <div className="storage-main">
        {/* Stats */}
        {stats && (
          <div className="storage-stats">
            <div className="storage-stat-card">
              <div className="stat-value">{stats.totalKeys}</div>
              <div className="stat-label">Total Keys</div>
            </div>
            <div className="storage-stat-card">
              <div className="stat-value">{stats.totalSizeFormatted}</div>
              <div className="stat-label">Used</div>
            </div>
            <div className="storage-stat-card">
              <div className="stat-value">
                {stats.systemKeys + stats.storageKeys}
              </div>
              <div className="stat-label">OniOS Keys</div>
            </div>
            <div className="storage-stat-card">
              <div className="stat-value">{stats.widgetStateKeys}</div>
              <div className="stat-label">Widget States</div>
            </div>
            <div className="storage-stat-card">
              <div className="stat-value">
                {aiMode === "oni"
                  ? oniData?.totalFiles || 0
                  : aiMemoryCount}
              </div>
              <div className="stat-label">
                {aiMode === "oni" ? "OniAI Files" : "AI Memories"}
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="storage-toolbar">
          <div className="storage-search">
            <Search size={14} />
            <input
              placeholder="Search keys..."
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="storage-toolbar-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={14} /> Add
          </button>
          <button className="storage-toolbar-btn" onClick={refresh}>
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Table */}
        <div className="storage-table-wrap">
          {filteredEntries.length === 0 ? (
            <div className="storage-empty">
              <Database size={40} />
              <p>No storage entries found</p>
            </div>
          ) : (
            <table className="storage-table">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Key</th>
                  <th style={{ width: "10%" }}>Type</th>
                  <th style={{ width: "30%" }}>Preview</th>
                  <th style={{ width: "10%", textAlign: "right" }}>Size</th>
                  <th style={{ width: "10%", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr
                    key={entry.key}
                    className={inspectingKey === entry.key ? "selected" : ""}
                    onClick={() => setInspecting(entry.key)}
                  >
                    <td>
                      <div className="storage-key">
                        {entry.namespace && (
                          <span className="storage-namespace-badge">
                            {entry.namespace}
                          </span>
                        )}
                        {entry.shortKey || entry.key}
                      </div>
                    </td>
                    <td>
                      <span className="storage-type-badge">{entry.type}</span>
                    </td>
                    <td>
                      <div className="storage-preview">{entry.preview}</div>
                    </td>
                    <td className="storage-size">{entry.sizeFormatted}</td>
                    <td className="storage-actions-cell">
                      <button
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (entry.key.startsWith("ai:")) {
                            deleteAIItem(entry.key);
                            if (inspectingKey === entry.key)
                              setInspecting(null);
                          } else {
                            handleDelete(entry.key, e);
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Inspector */}
      {inspectingKey && inspectedRaw && (
        <div className="storage-inspector">
          <div className="storage-inspector-header">
            <h3>Inspector</h3>
            <button onClick={() => setInspecting(null)}>
              <X size={14} />
            </button>
          </div>
          <div className="storage-inspector-meta">
            <div className="storage-inspector-meta-row">
              <span className="label">Key</span>
              <span className="value">{inspectingKey}</span>
            </div>
            <div className="storage-inspector-meta-row">
              <span className="label">Size</span>
              <span className="value">
                {storageService._formatBytes(inspectedRaw.length)}
              </span>
            </div>
            {inspectedMeta?.meta?.created && (
              <div className="storage-inspector-meta-row">
                <span className="label">Created</span>
                <span className="value">
                  {formatDate(inspectedMeta.meta.created)}
                </span>
              </div>
            )}
            {inspectedMeta?.meta?.updated && (
              <div className="storage-inspector-meta-row">
                <span className="label">Updated</span>
                <span className="value">
                  {formatDate(inspectedMeta.meta.updated)}
                </span>
              </div>
            )}
          </div>
          <div className="storage-inspector-content">
            <pre>{inspectedPretty}</pre>
          </div>
          <div className="storage-inspector-actions">
            <button onClick={handleCopyValue}>
              <Copy size={12} /> Copy
            </button>
            <button
              className="danger"
              onClick={() => {
                deleteKey(inspectingKey);
                setInspecting(null);
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div
          className="storage-modal-overlay"
          onClick={() => setShowAddModal(false)}
        >
          <div className="storage-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Storage Entry</h3>
            <div className="storage-modal-field">
              <label>Namespace</label>
              <input
                placeholder="e.g. cache, user, mywidget"
                value={addForm.namespace}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, namespace: e.target.value }))
                }
                autoFocus
              />
            </div>
            <div className="storage-modal-field">
              <label>Key</label>
              <input
                placeholder="e.g. settings, data, config"
                value={addForm.key}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, key: e.target.value }))
                }
              />
            </div>
            <div className="storage-modal-field">
              <label>Value (JSON or string)</label>
              <textarea
                placeholder='{"hello": "world"} or plain text'
                value={addForm.value}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, value: e.target.value }))
                }
              />
            </div>
            <div className="storage-modal-actions">
              <button
                className="cancel-btn"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button className="save-btn" onClick={handleAdd}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
