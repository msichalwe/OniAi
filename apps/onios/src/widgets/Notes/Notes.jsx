import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./Notes.css";

const DEFAULT_NOTES = [
  {
    id: 1,
    title: "Welcome to OniOS",
    body: 'This is your notes app. Create, edit, and organize your thoughts.\n\nTry these commands:\n• document.create("title")\n• document.list()\n• document.save()',
    updatedAt: Date.now(),
  },
  {
    id: 2,
    title: "Command Cheat Sheet",
    body: 'system.files.openExplorer()\nterminal.open()\nwidgets.weather.getCurrent()\nbrowser.openUrl("example.com")\nsystem.activity.open()',
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 3,
    title: "Ideas",
    body: "- Build a widget marketplace\n- Add AI voice interface\n- Create collaboration mode\n- Widget-to-widget data piping",
    updatedAt: Date.now() - 172800000,
  },
];

export default function Notes({ windowId, widgetType }) {
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem("onios-notes");
    return saved ? JSON.parse(saved) : DEFAULT_NOTES;
  });
  const [activeId, setActiveId] = useState(notes[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    localStorage.setItem("onios-notes", JSON.stringify(notes));
  }, [notes]);

  const activeNote = notes.find((n) => n.id === activeId);

  const filteredNotes = searchQuery
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.body.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : notes;

  const createNote = () => {
    const newNote = {
      id: Date.now(),
      title: "",
      body: "",
      updatedAt: Date.now(),
    };
    setNotes([newNote, ...notes]);
    setActiveId(newNote.id);
  };

  const deleteNote = useCallback(
    (id, e) => {
      e?.stopPropagation();
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      if (activeId === id) {
        setActiveId(remaining[0]?.id || null);
      }
    },
    [notes, activeId],
  );

  const updateNote = (field, value) => {
    setNotes(
      notes.map((n) =>
        n.id === activeId ? { ...n, [field]: value, updatedAt: Date.now() } : n,
      ),
    );
  };

  // Report live context for AI agents
  useWidgetContext(windowId, "notes", {
    noteCount: notes.length,
    noteTitles: notes.map((n) => n.title || "(untitled)"),
    activeNote: activeNote
      ? {
          title: activeNote.title,
          bodyLength: activeNote.body?.length || 0,
          bodyPreview: (activeNote.body || "").slice(0, 200),
        }
      : null,
    searchQuery: searchQuery || null,
  });

  const formatDate = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const wordCount = activeNote
    ? activeNote.body.split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="notes-widget">
      {/* Sidebar */}
      <div className="notes-sidebar">
        <div className="notes-sidebar-header">
          <span className="notes-sidebar-title">Notes</span>
          <div className="notes-sidebar-actions">
            <button
              className="notes-icon-btn"
              onClick={() => setShowSearch(!showSearch)}
              title="Search"
            >
              <Search size={14} />
            </button>
            <button
              className="notes-icon-btn"
              onClick={createNote}
              title="New Note"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="notes-search">
            <input
              className="notes-search-input"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="notes-list">
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              className={`notes-list-item ${note.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(note.id)}
            >
              <div className="notes-list-item-content">
                <span className="notes-list-item-title">
                  {note.title || "Untitled"}
                </span>
                <span className="notes-list-item-preview">
                  {note.body.slice(0, 60) || "Empty note"}
                </span>
                <span className="notes-list-item-date">
                  {formatDate(note.updatedAt)}
                </span>
              </div>
              <button
                className="notes-delete-btn"
                onClick={(e) => deleteNote(note.id, e)}
                title="Delete note"
              >
                <Trash2 size={12} />
              </button>
            </button>
          ))}
          {filteredNotes.length === 0 && searchQuery && (
            <div className="notes-empty-search">No matching notes</div>
          )}
        </div>

        <div className="notes-sidebar-footer">
          {notes.length} note{notes.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Editor */}
      <div className="notes-editor">
        {activeNote ? (
          <>
            <div className="notes-editor-header">
              <input
                className="notes-title-input"
                value={activeNote.title}
                onChange={(e) => updateNote("title", e.target.value)}
                placeholder="Untitled"
              />
            </div>
            <textarea
              className="notes-textarea"
              value={activeNote.body}
              onChange={(e) => updateNote("body", e.target.value)}
              placeholder="Start writing..."
            />
            <div className="notes-editor-footer">
              <span>{wordCount} words</span>
              <span>Last edited: {formatDate(activeNote.updatedAt)}</span>
            </div>
          </>
        ) : (
          <div className="notes-empty">Select a note or create a new one</div>
        )}
      </div>
    </div>
  );
}
