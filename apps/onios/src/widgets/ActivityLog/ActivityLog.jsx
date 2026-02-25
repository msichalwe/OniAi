import React, { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Bot,
  User,
  ClipboardList,
  CheckCircle2,
} from "lucide-react";
import useCommandStore from "../../stores/commandStore";
import "./ActivityLog.css";

export default function ActivityLog() {
  const activityLog = useCommandStore((s) => s.activityLog);
  const clearActivityLog = useCommandStore((s) => s.clearActivityLog);
  const [filter, setFilter] = useState("all");
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [activityLog]);

  const filteredLog =
    filter === "all"
      ? activityLog
      : activityLog.filter((entry) => {
          if (filter === "errors") return entry.type === "error";
          return entry.source === filter;
        });

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getSourceEmoji = (entry) => {
    if (entry.type === "error") return <AlertTriangle size={14} />;
    if (entry.source === "ai") return <Bot size={14} />;
    return <User size={14} />;
  };

  const getSourceClass = (entry) => {
    if (entry.type === "error") return "system";
    return entry.source || "human";
  };

  return (
    <div className="activity-log">
      <div className="activity-header">
        <span className="activity-title">Activity Log</span>
        <button className="activity-clear-btn" onClick={clearActivityLog}>
          Clear
        </button>
      </div>

      <div className="activity-filters">
        {["all", "human", "ai", "errors"].map((f) => (
          <button
            key={f}
            className={`activity-filter ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? (
              "All"
            ) : f === "human" ? (
              <span className="activity-filter-label">
                <User size={12} /> Human
              </span>
            ) : f === "ai" ? (
              <span className="activity-filter-label">
                <Bot size={12} /> AI
              </span>
            ) : (
              <span className="activity-filter-label">
                <AlertTriangle size={12} /> Errors
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="activity-list" ref={listRef}>
        {filteredLog.length > 0 ? (
          filteredLog.map((entry, i) => (
            <div key={entry.id || i} className="activity-entry">
              <div className={`activity-source ${getSourceClass(entry)}`}>
                {getSourceEmoji(entry)}
              </div>
              <div className="activity-body">
                <span className="activity-command">
                  {entry.command || entry.raw || "Unknown command"}
                </span>
                {entry.type === "error" ? (
                  <span className="activity-result error">{entry.error}</span>
                ) : entry.result !== undefined ? (
                  <span className="activity-result success">
                    <CheckCircle2 size={12} className="activity-result-icon" />{" "}
                    Success
                  </span>
                ) : null}
              </div>
              <span className="activity-time">
                {formatTime(entry.timestamp)}
              </span>
            </div>
          ))
        ) : (
          <div className="activity-empty">
            <div className="activity-empty-icon">
              <ClipboardList size={32} />
            </div>
            <span>No activity yet. Run some commands!</span>
          </div>
        )}
      </div>
    </div>
  );
}
