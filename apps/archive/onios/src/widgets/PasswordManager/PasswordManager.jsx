/**
 * PasswordManager — Secure password vault with generator.
 *
 * Features:
 * - Master password lock/unlock
 * - Add/edit/delete credential entries
 * - Password generator with strength meter
 * - Copy to clipboard
 * - Search and filter by category
 * - Favorites
 * - Show/hide password toggle
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Lock,
  Unlock,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Star,
  Search,
  RefreshCw,
  Globe,
  User,
  Key,
  Shield,
  X,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import usePasswordStore, {
  generatePassword,
  calculateStrength,
  strengthLabel,
} from "../../stores/passwordStore";
import "./PasswordManager.css";

function StrengthBar({ score }) {
  const label = strengthLabel(score);
  const color =
    score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : score >= 30 ? "#f97316" : "#ef4444";
  return (
    <div className="pm-strength">
      <div className="pm-strength-bar">
        <div
          className="pm-strength-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="pm-strength-label" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

export default function PasswordManager() {
  const entries = usePasswordStore((s) => s.entries);
  const vaultLocked = usePasswordStore((s) => s.vaultLocked);
  const masterHash = usePasswordStore((s) => s.masterHash);
  const setMasterPassword = usePasswordStore((s) => s.setMasterPassword);
  const unlock = usePasswordStore((s) => s.unlock);
  const lock = usePasswordStore((s) => s.lock);
  const addEntry = usePasswordStore((s) => s.addEntry);
  const updateEntry = usePasswordStore((s) => s.updateEntry);
  const deleteEntry = usePasswordStore((s) => s.deleteEntry);
  const toggleFavorite = usePasswordStore((s) => s.toggleFavorite);
  const getDecryptedPassword = usePasswordStore((s) => s.getDecryptedPassword);
  const getCategories = usePasswordStore((s) => s.getCategories);

  const [masterInput, setMasterInput] = useState("");
  const [masterError, setMasterError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [showGenerator, setShowGenerator] = useState(false);

  // Form state
  const [form, setForm] = useState({
    title: "", username: "", password: "", url: "", notes: "", category: "general",
  });

  // Generator state
  const [genLength, setGenLength] = useState(16);
  const [genOptions, setGenOptions] = useState({
    uppercase: true, lowercase: true, numbers: true, symbols: true,
  });
  const [generatedPw, setGeneratedPw] = useState("");

  const isSetup = masterHash !== null;
  const categories = useMemo(() => getCategories(), [entries]);

  const filteredEntries = useMemo(() => {
    let list = [...entries];
    if (selectedCategory !== "all") {
      list = list.filter((e) => e.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.username.toLowerCase().includes(q) ||
          e.url.toLowerCase().includes(q)
      );
    }
    // Favorites first, then by updatedAt
    list.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [entries, selectedCategory, searchQuery]);

  // ─── Lock Screen ─────────────────────────────────────

  const handleUnlock = () => {
    if (!isSetup) {
      if (masterInput.length < 4) {
        setMasterError("Master password must be at least 4 characters");
        return;
      }
      setMasterPassword(masterInput);
      setMasterInput("");
      setMasterError("");
    } else {
      const ok = unlock(masterInput);
      if (!ok) {
        setMasterError("Wrong master password");
        return;
      }
      setMasterInput("");
      setMasterError("");
    }
  };

  // ─── CRUD ────────────────────────────────────────────

  const handleSave = () => {
    if (!form.title.trim()) return;
    if (editingId) {
      updateEntry(editingId, form);
      setEditingId(null);
    } else {
      addEntry(form);
    }
    setForm({ title: "", username: "", password: "", url: "", notes: "", category: "general" });
    setShowAdd(false);
  };

  const handleEdit = (entry) => {
    const pw = getDecryptedPassword(entry.id);
    setForm({
      title: entry.title,
      username: entry.username,
      password: pw || "",
      url: entry.url,
      notes: entry.notes,
      category: entry.category,
    });
    setEditingId(entry.id);
    setShowAdd(true);
  };

  const handleCopy = (id, field) => {
    let text;
    if (field === "password") {
      text = getDecryptedPassword(id);
    } else {
      const entry = entries.find((e) => e.id === id);
      text = entry?.[field] || "";
    }
    if (text) {
      navigator.clipboard.writeText(text);
      setCopiedId(`${id}-${field}`);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = () => {
    const pw = generatePassword(genLength, genOptions);
    setGeneratedPw(pw);
  };

  const useGenerated = () => {
    setForm({ ...form, password: generatedPw });
    setShowGenerator(false);
  };

  // ─── Lock Screen Render ──────────────────────────────

  if (vaultLocked) {
    return (
      <div className="password-manager">
        <div className="pm-lock-screen">
          <div className="pm-lock-icon">
            <Shield size={48} />
          </div>
          <h2 className="pm-lock-title">
            {isSetup ? "Vault Locked" : "Set Up Your Vault"}
          </h2>
          <p className="pm-lock-hint">
            {isSetup
              ? "Enter your master password to unlock"
              : "Create a master password to secure your vault"}
          </p>
          <div className="pm-lock-form">
            <input
              className="pm-lock-input"
              type="password"
              placeholder="Master password..."
              value={masterInput}
              onChange={(e) => { setMasterInput(e.target.value); setMasterError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              autoFocus
            />
            <button className="pm-lock-btn" onClick={handleUnlock}>
              <Unlock size={16} />
              {isSetup ? "Unlock" : "Create Vault"}
            </button>
          </div>
          {masterError && <span className="pm-lock-error">{masterError}</span>}
        </div>
      </div>
    );
  }

  // ─── Unlocked Vault ──────────────────────────────────

  return (
    <div className="password-manager">
      {/* Toolbar */}
      <div className="pm-toolbar">
        <div className="pm-toolbar-left">
          <div className="pm-search-box">
            <Search size={14} />
            <input
              className="pm-search-input"
              placeholder="Search vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {categories.length > 1 && (
            <select
              className="pm-category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
        <div className="pm-toolbar-right">
          <button className="pm-tool-btn" onClick={() => setShowGenerator(!showGenerator)} title="Password Generator">
            <Key size={14} /> Generate
          </button>
          <button className="pm-tool-btn primary" onClick={() => { setShowAdd(true); setEditingId(null); setForm({ title: "", username: "", password: "", url: "", notes: "", category: "general" }); }}>
            <Plus size={14} /> Add
          </button>
          <button className="pm-tool-btn lock" onClick={lock} title="Lock vault">
            <Lock size={14} />
          </button>
        </div>
      </div>

      {/* Generator Panel */}
      {showGenerator && (
        <div className="pm-generator">
          <div className="pm-gen-header">
            <Key size={14} />
            <span>Password Generator</span>
            <button className="pm-gen-close" onClick={() => setShowGenerator(false)}><X size={12} /></button>
          </div>
          <div className="pm-gen-output">
            <input
              className="pm-gen-password"
              readOnly
              value={generatedPw}
              placeholder="Click Generate..."
            />
            <button className="pm-gen-btn" onClick={handleGenerate}>
              <RefreshCw size={12} /> Generate
            </button>
            <button
              className="pm-gen-btn"
              onClick={() => { if (generatedPw) { navigator.clipboard.writeText(generatedPw); } }}
            >
              <Copy size={12} />
            </button>
          </div>
          {generatedPw && <StrengthBar score={calculateStrength(generatedPw)} />}
          <div className="pm-gen-options">
            <label className="pm-gen-opt">
              <input type="range" min="6" max="64" value={genLength} onChange={(e) => setGenLength(Number(e.target.value))} />
              <span>{genLength} chars</span>
            </label>
            {[
              ["uppercase", "A-Z"],
              ["lowercase", "a-z"],
              ["numbers", "0-9"],
              ["symbols", "!@#"],
            ].map(([key, label]) => (
              <label key={key} className="pm-gen-opt">
                <input
                  type="checkbox"
                  checked={genOptions[key]}
                  onChange={() => setGenOptions({ ...genOptions, [key]: !genOptions[key] })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {generatedPw && showAdd && (
            <button className="pm-gen-use" onClick={useGenerated}>Use this password</button>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showAdd && (
        <div className="pm-add-form">
          <div className="pm-form-header">
            <span>{editingId ? "Edit Entry" : "New Entry"}</span>
            <button className="pm-gen-close" onClick={() => { setShowAdd(false); setEditingId(null); }}><X size={12} /></button>
          </div>
          <input
            className="pm-form-input"
            placeholder="Title (e.g. GitHub)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          <input
            className="pm-form-input"
            placeholder="Username / email"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <div className="pm-form-pw-row">
            <input
              className="pm-form-input"
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button className="pm-form-gen-btn" onClick={() => { setShowGenerator(true); handleGenerate(); }}>
              <Key size={12} />
            </button>
          </div>
          {form.password && <StrengthBar score={calculateStrength(form.password)} />}
          <input
            className="pm-form-input"
            placeholder="URL (optional)"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
          <div className="pm-form-row">
            <select
              className="pm-form-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="general">General</option>
              <option value="social">Social</option>
              <option value="work">Work</option>
              <option value="finance">Finance</option>
              <option value="email">Email</option>
              <option value="dev">Development</option>
              <option value="shopping">Shopping</option>
            </select>
          </div>
          <textarea
            className="pm-form-input pm-form-notes"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
          <div className="pm-form-actions">
            <button className="pm-form-submit" onClick={handleSave}>
              {editingId ? "Update" : "Save"}
            </button>
            <button className="pm-form-cancel" onClick={() => { setShowAdd(false); setEditingId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Entry List */}
      <div className="pm-list">
        {filteredEntries.length === 0 ? (
          <div className="pm-empty">
            <Shield size={32} />
            <span>{searchQuery ? "No matches" : "Vault is empty"}</span>
            <span className="pm-empty-hint">Add your first password entry</span>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isVisible = visiblePasswords.has(entry.id);
            const pw = isVisible ? getDecryptedPassword(entry.id) : "••••••••";
            return (
              <div key={entry.id} className="pm-entry">
                <div className="pm-entry-icon">
                  {entry.url ? <Globe size={18} /> : <Key size={18} />}
                </div>
                <div className="pm-entry-body" onClick={() => handleEdit(entry)}>
                  <div className="pm-entry-header">
                    <span className="pm-entry-title">{entry.title}</span>
                    <span className="pm-entry-category">{entry.category}</span>
                  </div>
                  <div className="pm-entry-details">
                    {entry.username && (
                      <span className="pm-entry-user">
                        <User size={10} /> {entry.username}
                      </span>
                    )}
                    <span className="pm-entry-pw">
                      {pw}
                    </span>
                  </div>
                </div>
                <div className="pm-entry-actions">
                  <button
                    className="pm-entry-btn"
                    onClick={() => togglePasswordVisibility(entry.id)}
                    title={isVisible ? "Hide" : "Show"}
                  >
                    {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    className={`pm-entry-btn ${copiedId === `${entry.id}-password` ? "copied" : ""}`}
                    onClick={() => handleCopy(entry.id, "password")}
                    title="Copy password"
                  >
                    {copiedId === `${entry.id}-password` ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  </button>
                  <button
                    className={`pm-entry-btn ${entry.favorite ? "fav-active" : ""}`}
                    onClick={() => toggleFavorite(entry.id)}
                    title="Favorite"
                  >
                    <Star size={14} />
                  </button>
                  <button
                    className="pm-entry-btn danger"
                    onClick={() => deleteEntry(entry.id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Status bar */}
      <div className="pm-statusbar">
        <span>{entries.length} entries</span>
        <span>{categories.length} categories</span>
        <span className="pm-status-lock" onClick={lock}>
          <Lock size={10} /> Lock Vault
        </span>
      </div>
    </div>
  );
}
