import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Terminal,
  Search,
  FileText,
  Layout,
  File,
  Clock,
  Command,
} from "lucide-react";
import useCommandStore from "../../stores/commandStore";
import useWindowStore from "../../stores/windowStore";
import { commandRegistry } from "../../core/CommandRegistry";
import { contextEngine } from "../../core/ContextEngine";
import { indexService } from "../../core/IndexService";
import "./CommandBar.css";

const CATEGORY_ICONS = {
  command: Terminal,
  window: Layout,
  file: File,
  document: FileText,
  recent: Clock,
};

export default function CommandBar() {
  const { isCommandBarOpen, closeCommandBar, executeCommand, commandHistory } =
    useCommandStore();
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [universalResults, setUniversalResults] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isCommandBarOpen) {
      setQuery("");
      setActiveIndex(0);
      setUniversalResults(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandBarOpen]);

  // Build flat suggestion list from multiple sources
  const suggestions = useMemo(() => {
    const items = [];

    if (!query.trim()) {
      // Show recent commands when empty
      const recent = [...commandHistory].reverse().slice(0, 6);
      recent.forEach((h) => {
        items.push({
          type: "recent",
          path: h.command,
          label: h.command,
          description: "Recent command",
        });
      });
      return items;
    }

    // Commands always
    const cmds = commandRegistry.search(query).slice(0, 6);
    cmds.forEach((c) => {
      items.push({
        type: "command",
        path: c.path,
        label: c.path,
        description: c.description,
      });
    });

    // Open windows
    const windows = contextEngine
      .getWindows()
      .filter(
        (w) =>
          w.title.toLowerCase().includes(query.toLowerCase()) ||
          w.type.toLowerCase().includes(query.toLowerCase()),
      );
    windows.slice(0, 3).forEach((w) => {
      items.push({
        type: "window",
        path: `system.windows.focus("${w.id}")`,
        label: w.title,
        description: `${w.type} window — click to focus`,
        windowId: w.id,
      });
    });

    // Recent files matching query
    const files = contextEngine
      .getRecentFiles()
      .filter((f) => f.path.toLowerCase().includes(query.toLowerCase()));
    files.slice(0, 3).forEach((f) => {
      items.push({
        type: "file",
        path: `document.open("${f.path}")`,
        label: f.path.split("/").pop(),
        description: f.path,
      });
    });

    // Universal results from async search
    if (universalResults) {
      const docs = universalResults.documents || [];
      docs.slice(0, 4).forEach((d) => {
        // Avoid duplicates
        if (!items.find((i) => i.description === d.path)) {
          items.push({
            type: "document",
            path: `document.open("${d.path}")`,
            label: d.name,
            description: d.snippet || d.path,
            score: d.score,
          });
        }
      });
    }

    return items;
  }, [query, commandHistory, universalResults]);

  // Debounced universal search for document content
  const doUniversalSearch = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.trim().length < 2) {
      setUniversalResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await contextEngine.search(q, { backend: true });
        setUniversalResults(results);
      } catch {
        setUniversalResults(null);
      }
    }, 250);
  }, []);

  useEffect(() => {
    doUniversalSearch(query);
  }, [query, doUniversalSearch]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeCommandBar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Tab" && suggestions[activeIndex]) {
      e.preventDefault();
      const s = suggestions[activeIndex];
      if (s.type === "command" || s.type === "recent") {
        setQuery(s.path.replace(/\(.*$/, "") + '("');
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[activeIndex];
      if (s) {
        if (s.windowId) {
          focusWindow(s.windowId);
          closeCommandBar();
          return;
        }
        const raw = s.path || query.trim();
        if (raw) {
          const cmd = raw.includes("(") ? raw : raw + "()";
          executeCommand(cmd);
          closeCommandBar();
        }
      } else {
        const raw = query.trim();
        if (raw) {
          const cmd = raw.includes("(") ? raw : raw + "()";
          executeCommand(cmd);
          closeCommandBar();
        }
      }
    }
  };

  const handleSuggestionClick = (suggestion) => {
    if (suggestion.windowId) {
      focusWindow(suggestion.windowId);
      closeCommandBar();
      return;
    }
    const raw = suggestion.path;
    const cmd = raw.includes("(") ? raw : raw + "()";
    executeCommand(cmd);
    closeCommandBar();
  };

  if (!isCommandBarOpen) return null;

  // Group suggestions by type for section headers
  const grouped = [];
  let lastType = null;
  suggestions.forEach((s, i) => {
    if (s.type !== lastType) {
      const labels = {
        recent: "Recent",
        command: "Commands",
        window: "Open Windows",
        file: "Files",
        document: "Document Content",
      };
      grouped.push({ section: labels[s.type] || s.type, idx: i });
      lastType = s.type;
    }
  });

  return (
    <div className="command-bar-overlay" onClick={closeCommandBar}>
      <div className="command-bar" onClick={(e) => e.stopPropagation()}>
        <div className="command-bar-input-wrapper">
          <span className="command-bar-prompt">
            <Search size={18} />
          </span>
          <input
            ref={inputRef}
            className="command-bar-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, files, documents..."
            spellCheck={false}
            autoComplete="off"
          />
          <span className="command-bar-kbd">ESC</span>
        </div>

        {suggestions.length > 0 && (
          <div className="command-bar-suggestions">
            {suggestions.map((s, i) => {
              const sectionHeader = grouped.find((g) => g.idx === i);
              const IconComp = CATEGORY_ICONS[s.type] || Command;
              return (
                <React.Fragment key={s.path + i}>
                  {sectionHeader && (
                    <div className="command-bar-section-title">
                      {sectionHeader.section}
                    </div>
                  )}
                  <div
                    className={`command-bar-suggestion ${i === activeIndex ? "active" : ""}`}
                    onClick={() => handleSuggestionClick(s)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <div
                      className={`command-bar-suggestion-icon cb-icon-${s.type}`}
                    >
                      <IconComp size={16} />
                    </div>
                    <div className="command-bar-suggestion-text">
                      <span className="command-bar-suggestion-path">
                        {s.label}
                      </span>
                      {s.description && (
                        <span className="command-bar-suggestion-desc">
                          {s.description}
                        </span>
                      )}
                    </div>
                    {s.score && (
                      <span className="command-bar-suggestion-score">
                        {s.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {query.trim() && suggestions.length === 0 && (
          <div className="command-bar-empty">No results for "{query}"</div>
        )}

        <div className="command-bar-footer">
          <div className="command-bar-footer-hints">
            <span className="command-bar-hint">
              <span className="command-bar-kbd">↑↓</span> Navigate
            </span>
            <span className="command-bar-hint">
              <span className="command-bar-kbd">Tab</span> Complete
            </span>
            <span className="command-bar-hint">
              <span className="command-bar-kbd">Enter</span> Execute
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
