/**
 * WorkflowBuilder — Visual drag-and-drop workflow editor.
 *
 * Features:
 * - Canvas with draggable nodes and SVG connection lines
 * - Node types: Trigger, Command, Condition, Delay, Output
 * - Click output port → click input port to create connections
 * - Node config panel for editing command/settings
 * - JSON view to inspect full workflow structure
 * - Execute workflow with real-time status on each node
 * - Workflow list sidebar for managing multiple workflows
 */

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  Play,
  Square,
  Plus,
  Trash2,
  Copy,
  Zap,
  Terminal,
  GitBranch,
  Timer,
  MessageSquare,
  X,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Circle,
  Code,
  LayoutGrid,
  Clipboard,
  ScrollText,
  ChevronDown,
  Info,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  ChevronRight,
  Globe,
  Plug,
  Brain,
  Wifi,
  Key,
  FileJson,
} from "lucide-react";
import useWorkflowStore from "../../stores/workflowStore";
import { workflowEngine, KNOWN_EVENTS } from "../../core/WorkflowEngine";
import { commandRegistry } from "../../core/CommandRegistry";
import {
  COMMAND_OUTPUT_SCHEMAS,
  getSchemaPathsFlat,
  getValuePathsFlat,
  resolvePath,
} from "../../core/CommandOutputSchemas";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./WorkflowBuilder.css";

const NODE_TYPES = {
  trigger: { icon: Zap, color: "#22c55e", label: "Trigger" },
  command: { icon: Terminal, color: "#3b82f6", label: "Command" },
  condition: { icon: GitBranch, color: "#f59e0b", label: "Condition" },
  delay: { icon: Timer, color: "#a78bfa", label: "Delay" },
  output: { icon: MessageSquare, color: "#ec4899", label: "Output" },
  http: { icon: Globe, color: "#06b6d4", label: "HTTP" },
  mcp: { icon: Plug, color: "#8b5cf6", label: "MCP" },
  ai: { icon: Brain, color: "#f97316", label: "AI" },
};

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const AUTH_TYPES = [
  { value: "none", label: "No Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "apikey", label: "API Key (Header)" },
];
const AI_MODES = [
  { value: "transform", label: "Transform — restructure/format data" },
  { value: "classify", label: "Classify — categorize input into labels" },
  { value: "extract", label: "Extract — pull specific fields from text" },
  { value: "decide", label: "Decide — route to true/false branch" },
  { value: "generate", label: "Generate — create content from prompt" },
  { value: "summarize", label: "Summarize — condense input data" },
];

const STATUS_COLORS = {
  idle: "#666",
  running: "#3b82f6",
  resolved: "#22c55e",
  rejected: "#ef4444",
};

const NODE_W = 180;
const NODE_H_BASE = 58;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

// ─── Searchable Select ─────────────────────────────────

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  groupBy,
  renderOption,
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = useMemo(() => {
    if (!filter) return options;
    const q = filter.toLowerCase();
    return options.filter((o) => {
      const text = (o.label || o.value || "").toLowerCase();
      const desc = (o.description || "").toLowerCase();
      return text.includes(q) || desc.includes(q);
    });
  }, [options, filter]);

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const g = {};
    filtered.forEach((o) => {
      const key = groupBy(o) || "Other";
      if (!g[key]) g[key] = [];
      g[key].push(o);
    });
    return g;
  }, [filtered, groupBy]);

  const selectedLabel = useMemo(() => {
    const opt = options.find((o) => o.value === value);
    return opt ? opt.label || opt.value : "";
  }, [options, value]);

  return (
    <div className="wf-searchable-select" ref={wrapRef}>
      <button
        className="wf-searchable-trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className={`wf-searchable-value ${!value ? "placeholder" : ""}`}>
          {value ? selectedLabel : placeholder || "Select..."}
        </span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="wf-searchable-dropdown">
          <div className="wf-searchable-search">
            <Search size={12} />
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search..."
              className="wf-searchable-input"
            />
          </div>
          <div className="wf-searchable-list">
            {filtered.length === 0 && (
              <div className="wf-searchable-empty">No matches</div>
            )}
            {grouped
              ? Object.entries(grouped).map(([group, items]) => (
                  <div key={group}>
                    <div className="wf-searchable-group">{group}</div>
                    {items.map((o) => (
                      <button
                        key={o.value}
                        className={`wf-searchable-option ${o.value === value ? "active" : ""}`}
                        onClick={() => {
                          onChange(o.value);
                          setOpen(false);
                          setFilter("");
                        }}
                      >
                        {renderOption ? (
                          renderOption(o)
                        ) : (
                          <>
                            <span className="wf-searchable-opt-label">
                              {o.label || o.value}
                            </span>
                            {o.description && (
                              <span className="wf-searchable-opt-desc">
                                {o.description}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              : filtered.map((o) => (
                  <button
                    key={o.value}
                    className={`wf-searchable-option ${o.value === value ? "active" : ""}`}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setFilter("");
                    }}
                  >
                    {renderOption ? (
                      renderOption(o)
                    ) : (
                      <>
                        <span className="wf-searchable-opt-label">
                          {o.label || o.value}
                        </span>
                        {o.description && (
                          <span className="wf-searchable-opt-desc">
                            {o.description}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Path Picker (deep dot-notation access) ─────────────

function PathPicker({ value, onChange, nodeInput, commandName, placeholder }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Build available paths from runtime data OR schema
  const paths = useMemo(() => {
    const result = [];

    // 1. From actual runtime data (after run)
    if (nodeInput != null && typeof nodeInput === "object") {
      const valuePaths = getValuePathsFlat(nodeInput);
      valuePaths.forEach((p) => {
        const val = resolvePath(nodeInput, p.path);
        const preview =
          val === undefined
            ? ""
            : typeof val === "object"
              ? JSON.stringify(val).substring(0, 40)
              : String(val).substring(0, 40);
        result.push({
          path: p.path,
          type: p.type,
          preview,
          source: "runtime",
        });
      });
    }

    // 2. From schema (before or after run — shows expected shape)
    if (commandName) {
      const cmdBase = commandName.replace(/\(.*\)$/, "");
      const schema = COMMAND_OUTPUT_SCHEMAS[cmdBase];
      if (schema) {
        const schemaPaths = getSchemaPathsFlat(schema);
        schemaPaths.forEach((sp) => {
          // Don't duplicate paths already in runtime
          if (!result.find((r) => r.path === sp.path)) {
            result.push({
              path: sp.path,
              type: sp.schema.type,
              preview:
                sp.schema.example != null
                  ? String(sp.schema.example).substring(0, 40)
                  : sp.schema.description || "",
              source: "schema",
            });
          }
        });
      }
    }

    return result;
  }, [nodeInput, commandName]);

  const filtered = useMemo(() => {
    if (!filter) return paths;
    const q = filter.toLowerCase();
    return paths.filter(
      (p) =>
        p.path.toLowerCase().includes(q) || p.preview.toLowerCase().includes(q),
    );
  }, [paths, filter]);

  const typeIcon = (t) => {
    switch (t) {
      case "string":
        return "𝗔";
      case "number":
        return "#";
      case "boolean":
        return "⊘";
      case "object":
        return "{}";
      case "array":
        return "[]";
      default:
        return "·";
    }
  };

  return (
    <div className="wf-path-picker" ref={wrapRef}>
      <div className="wf-path-input-row">
        <input
          className="wf-config-input wf-config-mono"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "e.g. data.id or files[0].name"}
        />
        <button
          className="wf-path-browse-btn"
          onClick={() => setOpen(!open)}
          title="Browse available fields"
          type="button"
        >
          <ChevronRight size={12} />
        </button>
      </div>
      {open && (
        <div className="wf-path-dropdown">
          <div className="wf-searchable-search">
            <Search size={12} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter paths..."
              className="wf-searchable-input"
              autoFocus
            />
          </div>
          <div className="wf-path-list">
            {filtered.length === 0 && paths.length === 0 && (
              <div className="wf-searchable-empty">
                {nodeInput == null
                  ? "Run the workflow first to see available fields"
                  : "No nested fields available"}
              </div>
            )}
            {filtered.length === 0 && paths.length > 0 && (
              <div className="wf-searchable-empty">No matching paths</div>
            )}
            {filtered.map((p) => (
              <button
                key={p.path + p.source}
                className={`wf-path-option ${value === p.path ? "active" : ""}`}
                onClick={() => {
                  onChange(p.path);
                  setOpen(false);
                  setFilter("");
                }}
              >
                <span className="wf-path-type-icon" title={p.type}>
                  {typeIcon(p.type)}
                </span>
                <span className="wf-path-name">{p.path}</span>
                <span className="wf-path-preview">{p.preview}</span>
                {p.source === "schema" && (
                  <span className="wf-path-badge">schema</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SVG Connection Lines ──────────────────────────────

function ConnectionLines({ nodes, connections, onDeleteConnection, wfId }) {
  if (!connections.length) return null;

  const getPort = (nodeId, port) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    // Estimate real node height: header(26) + body(~32) + extras
    const hasCmd = node.config?.command;
    const hasOutput = node.status === "resolved" && node.output;
    const hasError = node.status === "rejected" && node.output;
    const h =
      NODE_H_BASE +
      (hasCmd ? 12 : 0) +
      (hasOutput ? 12 : 0) +
      (hasError ? 12 : 0);
    const midY = node.y + h / 2;
    if (port === "out") return { x: node.x + NODE_W, y: midY };
    return { x: node.x, y: midY };
  };

  return (
    <svg className="wf-connections-svg">
      {connections.map((conn) => {
        const from = getPort(conn.from, "out");
        const to = getPort(conn.to, "in");
        const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 40);
        const d = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;

        const sourceNode = nodes.find((n) => n.id === conn.from);
        const color = sourceNode
          ? STATUS_COLORS[sourceNode.status] || "#555"
          : "#555";

        // Show label on condition connections
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 8;

        return (
          <g key={conn.id}>
            <path
              d={d}
              className="wf-conn-hitbox"
              onClick={() => onDeleteConnection(wfId, conn.id)}
            />
            <path
              d={d}
              className="wf-conn-line"
              stroke={
                conn.label === "true"
                  ? "#22c55e"
                  : conn.label === "false"
                    ? "#ef4444"
                    : color
              }
            />
            {conn.label && (
              <text
                x={midX}
                y={midY}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={conn.label === "true" ? "#22c55e" : "#ef4444"}
                style={{ pointerEvents: "none" }}
              >
                {conn.label === "true" ? "✓" : "✗"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Single Node ───────────────────────────────────────

function WorkflowNode({
  node,
  selected,
  onSelect,
  onDragStart,
  onPortClick,
  connectingFrom,
  connectionCount,
}) {
  const typeDef = NODE_TYPES[node.type] || NODE_TYPES.command;
  const Icon = typeDef.icon;

  const StatusIcon =
    node.status === "resolved"
      ? CheckCircle2
      : node.status === "rejected"
        ? AlertTriangle
        : node.status === "running"
          ? Loader2
          : Circle;

  const handleMouseDown = useCallback(
    (e) => {
      if (e.target.closest(".wf-port")) return;
      onSelect(node.id);
      onDragStart(e, node.id);
    },
    [node.id, onSelect, onDragStart],
  );

  const handleClick = useCallback(
    (e) => {
      if (!e.target.closest(".wf-port")) onSelect(node.id);
    },
    [node.id, onSelect],
  );

  const handlePortIn = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPortClick(node.id, "in");
    },
    [node.id, onPortClick],
  );

  const handlePortOut = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPortClick(node.id, "out");
    },
    [node.id, onPortClick],
  );

  return (
    <div
      className={`wf-node ${selected ? "wf-node-selected" : ""} wf-node-${node.status}`}
      style={{ left: node.x, top: node.y }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Input port */}
      {node.type !== "trigger" && (
        <div
          className={`wf-port wf-port-in ${connectingFrom ? "wf-port-active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handlePortIn}
        />
      )}

      <div className="wf-node-header" style={{ background: typeDef.color }}>
        <Icon size={12} />
        <span className="wf-node-type">{typeDef.label}</span>
        <StatusIcon
          size={10}
          className={node.status === "running" ? "wf-spin" : ""}
          style={{ color: "#fff", marginLeft: "auto" }}
        />
      </div>
      <div className="wf-node-body">
        <span className="wf-node-label">{node.label}</span>
        {/* Contextual subtitle based on node type */}
        {node.type === "trigger" &&
          node.config?.triggerType === "event" &&
          node.config?.eventName && (
            <span className="wf-node-cmd">⚡ {node.config.eventName}</span>
          )}
        {node.type === "trigger" && node.config?.triggerType === "cron" && (
          <span className="wf-node-cmd">
            ⏰ every {node.config.interval || 1} {node.config.unit || "hours"}
          </span>
        )}
        {node.type === "trigger" &&
          (!node.config?.triggerType ||
            node.config.triggerType === "manual") && (
            <span className="wf-node-cmd">▶ manual</span>
          )}
        {node.type === "command" && node.config?.command && (
          <span className="wf-node-cmd">
            {node.config.command.substring(0, 28)}
          </span>
        )}
        {node.type === "condition" && (
          <span className="wf-node-cmd">
            {OPERATORS[node.config?.operator]?.symbol || "?"}{" "}
            {OPERATORS[node.config?.operator]?.needsValue
              ? `"${(node.config?.value || "...").substring(0, 15)}"`
              : OPERATORS[node.config?.operator]?.label}
          </span>
        )}
        {node.type === "delay" && (
          <span className="wf-node-cmd">⏱ {node.config?.seconds || 1}s</span>
        )}
        {node.type === "output" && (
          <span className="wf-node-cmd">
            {node.config?.action === "notify" ? "🔔 notify" : "📝 log"}
          </span>
        )}
        {node.type === "http" && node.config?.url && (
          <span className="wf-node-cmd">
            {node.config.method || "GET"}{" "}
            {(node.config.url || "")
              .replace(/^https?:\/\//, "")
              .substring(0, 22)}
          </span>
        )}
        {node.type === "mcp" && (
          <span className="wf-node-cmd">
            {node.config?.serverName
              ? `${node.config.serverName}${node.config.toolName ? ` → ${node.config.toolName}` : ""}`.substring(
                  0,
                  28,
                )
              : "Configure..."}
          </span>
        )}
        {node.type === "ai" && (
          <span className="wf-node-cmd">
            {node.config?.mode ? `🧠 ${node.config.mode}` : "Configure..."}
          </span>
        )}
        {/* Status output */}
        {node.status === "resolved" && node.output != null && (
          <span
            className="wf-node-output"
            title={
              typeof node.output === "string"
                ? node.output
                : JSON.stringify(node.output, null, 1)
            }
          >
            {node.output?._condition
              ? node.output.result
                ? "✓ TRUE"
                : "✗ FALSE"
              : node.output?._output
                ? `✓ ${node.output.action === "notify" ? "🔔" : "📝"} ${(node.output.message || "").substring(0, 25)}`
                : typeof node.output === "string"
                  ? `✓ ${node.output.substring(0, 30)}`
                  : "✓ Object"}
          </span>
        )}
        {node.status === "rejected" && node.output && (
          <span className="wf-node-error">
            ✗ {String(node.output).substring(0, 30)}
          </span>
        )}
      </div>
      {connectionCount > 0 && (
        <div className="wf-node-connections">
          {connectionCount} connection{connectionCount > 1 ? "s" : ""}
        </div>
      )}

      {/* Output port */}
      <div
        className="wf-port wf-port-out"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handlePortOut}
      />
    </div>
  );
}

// ─── Operator labels for condition display ────────────

const OPERATORS = {
  equals: { label: "Equals", symbol: "=", needsValue: true },
  notEquals: { label: "Not Equals", symbol: "≠", needsValue: true },
  contains: { label: "Contains", symbol: "∋", needsValue: true },
  notContains: { label: "Not Contains", symbol: "∌", needsValue: true },
  greaterThan: { label: "Greater Than", symbol: ">", needsValue: true },
  lessThan: { label: "Less Than", symbol: "<", needsValue: true },
  exists: { label: "Exists", symbol: "∃", needsValue: false },
  empty: { label: "Is Empty", symbol: "∅", needsValue: false },
};

// ─── Node Config Panel ─────────────────────────────────

function NodeConfigPanel({ node, wfId, onClose }) {
  const updateNode = useWorkflowStore((s) => s.updateNode);
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const [label, setLabel] = useState(node.label);
  const [config, setConfig] = useState({ ...node.config });

  // Commands grouped by namespace for the dropdown
  const commandGroups = useMemo(() => {
    const list = commandRegistry.list();
    const groups = {};
    list.forEach((c) => {
      const ns = c.path.split(".").slice(0, -1).join(".");
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(c);
    });
    return groups;
  }, []);

  const allCommands = useMemo(
    () =>
      commandRegistry
        .list()
        .map((c) => c.path)
        .sort(),
    [],
  );

  const save = useCallback(() => {
    updateNode(wfId, node.id, { label, config });
  }, [wfId, node.id, label, config, updateNode]);

  useEffect(() => {
    setLabel(node.label);
    setConfig({ ...node.config });
  }, [node.id]);

  const updateConfig = useCallback(
    (patch) => {
      const newConfig = { ...config, ...patch };
      setConfig(newConfig);
      setTimeout(
        () => updateNode(wfId, node.id, { label, config: newConfig }),
        0,
      );
    },
    [config, label, wfId, node.id, updateNode],
  );

  // Helper: format output for display
  const fmtOutput = (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === "string") return val;
    if (val?._condition)
      return `${val.result ? "✅ TRUE" : "❌ FALSE"}: "${val.actual}" ${OPERATORS[val.operator]?.symbol || val.operator} "${val.expected}"`;
    return JSON.stringify(val, null, 2);
  };

  return (
    <div className="wf-config-panel">
      <div className="wf-config-header">
        <span>{NODE_TYPES[node.type]?.label || "Node"} Config</span>
        <button className="wf-config-close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="wf-config-body">
        <label className="wf-config-label">Label</label>
        <input
          className="wf-config-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />

        {/* ── Data Flow: show incoming data ── */}
        {node.input !== undefined && node.input !== null && (
          <div className="wf-config-output">
            <label className="wf-config-label">⬇ Incoming Data</label>
            <pre className="wf-config-pre" style={{ borderColor: "#3b82f6" }}>
              {typeof node.input === "string"
                ? node.input
                : JSON.stringify(node.input, null, 2)}
            </pre>
          </div>
        )}

        {/* ═══════ TRIGGER CONFIG ═══════ */}
        {node.type === "trigger" && (
          <>
            <label className="wf-config-label">Trigger Type</label>
            <select
              className="wf-config-input"
              value={config.triggerType || "manual"}
              onChange={(e) => updateConfig({ triggerType: e.target.value })}
            >
              <option value="manual">▶ Manual (click Run)</option>
              <option value="event">⚡ Event (auto-fires on event)</option>
              <option value="cron">⏰ Scheduled (interval)</option>
            </select>

            {config.triggerType === "event" && (
              <>
                <label className="wf-config-label">Listen to Event</label>
                <SearchableSelect
                  options={KNOWN_EVENTS.map((ev) => ({
                    value: ev.name,
                    label: ev.name,
                    description: ev.desc,
                    category: ev.category || "Other",
                  }))}
                  value={config.eventName || ""}
                  onChange={(v) => updateConfig({ eventName: v })}
                  placeholder="Search events..."
                  groupBy={(o) => o.category}
                />
                {config.eventName && (
                  <div className="wf-config-event-info">
                    {(() => {
                      const ev = KNOWN_EVENTS.find(
                        (e) => e.name === config.eventName,
                      );
                      return ev ? (
                        <>
                          <span
                            className="wf-config-hint"
                            style={{ fontWeight: 600 }}
                          >
                            {ev.desc}
                          </span>
                          <span className="wf-config-hint">
                            Payload: <code>{ev.payload}</code>
                          </span>
                          <span className="wf-config-hint">
                            Example: <code>{ev.example}</code>
                          </span>
                        </>
                      ) : null;
                    })()}
                  </div>
                )}
                <span className="wf-config-hint">
                  Workflow auto-fires when this event occurs. The event payload
                  becomes the output of this trigger node.
                </span>
              </>
            )}

            {config.triggerType === "cron" && (
              <>
                <label className="wf-config-label">Run Every</label>
                <div className="wf-config-row">
                  <input
                    className="wf-config-input"
                    type="number"
                    min="1"
                    value={config.interval || 1}
                    onChange={(e) =>
                      setConfig({ ...config, interval: e.target.value })
                    }
                    onBlur={save}
                    style={{ width: 60 }}
                  />
                  <select
                    className="wf-config-input"
                    value={config.unit || "hours"}
                    onChange={(e) => updateConfig({ unit: e.target.value })}
                  >
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </>
            )}

            {config.triggerType === "manual" && (
              <span className="wf-config-hint">
                Click "Run" to execute. Output: trigger metadata object.
              </span>
            )}
          </>
        )}

        {/* ═══════ COMMAND CONFIG ═══════ */}
        {node.type === "command" && (
          <>
            <label className="wf-config-label">Select Command</label>
            <SearchableSelect
              options={allCommands.map((c) => {
                const entry = commandRegistry.list().find((e) => e.path === c);
                const schema = COMMAND_OUTPUT_SCHEMAS[c];
                return {
                  value: c,
                  label: c,
                  description: entry?.description || "",
                  group: c.split(".").slice(0, -1).join("."),
                  outputType: schema?.type || "any",
                };
              })}
              value={config.command?.replace(/\(.*\)$/, "") || ""}
              onChange={(cmd) => {
                updateConfig({ command: cmd ? cmd + "()" : "" });
                if (cmd && label === "Command") {
                  setLabel(cmd.split(".").pop());
                  setTimeout(
                    () =>
                      updateNode(wfId, node.id, {
                        label: cmd.split(".").pop(),
                      }),
                    10,
                  );
                }
              }}
              placeholder="Search commands..."
              groupBy={(o) => o.group}
              renderOption={(o) => (
                <>
                  <span className="wf-searchable-opt-label">
                    {o.value.split(".").pop()}
                    <span style={{ opacity: 0.4, marginLeft: 4, fontSize: 9 }}>
                      {o.outputType !== "any" ? `→ ${o.outputType}` : ""}
                    </span>
                  </span>
                  {o.description && (
                    <span className="wf-searchable-opt-desc">
                      {o.description}
                    </span>
                  )}
                </>
              )}
            />

            {/* Show expected output shape from schema */}
            {(() => {
              const cmdBase = (config.command || "").replace(/\(.*\)$/, "");
              const schema = COMMAND_OUTPUT_SCHEMAS[cmdBase];
              return schema ? (
                <div className="wf-config-output-hint">
                  <span className="wf-config-hint" style={{ fontWeight: 600 }}>
                    Expected output: <code>{schema.type}</code>
                  </span>
                  {schema.description && (
                    <span className="wf-config-hint">{schema.description}</span>
                  )}
                  {schema.example != null && (
                    <code
                      className="wf-config-mono"
                      style={{
                        fontSize: 9,
                        display: "block",
                        padding: "3px 6px",
                        background: "rgba(0,0,0,0.15)",
                        borderRadius: 4,
                      }}
                    >
                      {typeof schema.example === "string"
                        ? schema.example.substring(0, 80)
                        : JSON.stringify(schema.example).substring(0, 80)}
                    </code>
                  )}
                </div>
              ) : null;
            })()}

            <label className="wf-config-label">Full Command (editable)</label>
            <input
              className="wf-config-input wf-config-mono"
              value={config.command || ""}
              onChange={(e) =>
                setConfig({ ...config, command: e.target.value })
              }
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder='e.g. system.notify("hello")'
            />
            <span className="wf-config-hint">
              Use <code>{"{{input}}"}</code> to pass previous node's output as
              argument. E.g. <code>{'system.notify("{{input}}")'}</code>
            </span>
          </>
        )}

        {/* ═══════ CONDITION CONFIG ═══════ */}
        {node.type === "condition" && (
          <>
            {/* Formula preview */}
            <div className="wf-config-condition-preview">
              <span className="wf-config-hint">Formula:</span>
              <div className="wf-config-condition-formula">
                <span style={{ color: "#3b82f6" }}>
                  {config.field || "input"}
                </span>{" "}
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                  {OPERATORS[config.operator || "exists"]?.symbol || "?"}
                </span>{" "}
                {OPERATORS[config.operator || "exists"]?.needsValue && (
                  <span style={{ color: "#22c55e" }}>
                    "{config.value || "..."}"
                  </span>
                )}
              </div>
              <span className="wf-config-hint">
                → TRUE or FALSE branch. Original data passes through.
              </span>
            </div>

            {/* Deep path field picker */}
            <label className="wf-config-label">Field to Check</label>
            <PathPicker
              value={config.field || ""}
              onChange={(path) => updateConfig({ field: path })}
              nodeInput={node.input}
              commandName={(() => {
                // Find upstream command name for schema hints
                const store = useWorkflowStore.getState();
                const wf = store.getWorkflow(wfId);
                if (!wf) return null;
                const inConn = wf.connections.find((c) => c.to === node.id);
                if (!inConn) return null;
                const upstream = wf.nodes.find((n) => n.id === inConn.from);
                return upstream?.type === "command"
                  ? upstream.config?.command
                  : null;
              })()}
              placeholder="e.g. title, priority, data.id, items[0].name"
            />
            <span className="wf-config-hint" style={{ marginTop: 2 }}>
              Leave empty to check the entire input value. Use dot notation for
              nested fields (e.g. <code>data.id</code>) or brackets for arrays
              (e.g. <code>items[0]</code>).
            </span>

            {/* Quick field chips from runtime data */}
            {node.input != null &&
              typeof node.input === "object" &&
              !Array.isArray(node.input) && (
                <div className="wf-config-field-chips" style={{ marginTop: 4 }}>
                  {Object.keys(node.input)
                    .filter((k) => !k.startsWith("_"))
                    .slice(0, 12)
                    .map((key) => (
                      <button
                        key={key}
                        className={`wf-field-chip ${config.field === key ? "active" : ""}`}
                        onClick={() => updateConfig({ field: key })}
                        title={`Value: ${JSON.stringify(node.input[key]).substring(0, 60)}`}
                      >
                        {key}
                        {typeof node.input[key] === "object"
                          ? Array.isArray(node.input[key])
                            ? ` [${node.input[key].length}]`
                            : " {…}"
                          : `: ${String(node.input[key]).substring(0, 15)}`}
                      </button>
                    ))}
                </div>
              )}
            {node.input != null && Array.isArray(node.input) && (
              <div
                className="wf-config-condition-preview"
                style={{ marginTop: 4 }}
              >
                <span className="wf-config-hint">
                  📥 Input is an array with <strong>{node.input.length}</strong>{" "}
                  items. Use <code>[0]</code>, <code>[1]</code>,{" "}
                  <code>.length</code>, etc.
                </span>
              </div>
            )}

            <label className="wf-config-label">Operator</label>
            <SearchableSelect
              options={Object.entries(OPERATORS).map(([key, op]) => ({
                value: key,
                label: `${op.symbol} ${op.label}`,
                description: op.needsValue
                  ? "Requires a compare value"
                  : "No compare value needed",
              }))}
              value={config.operator || "exists"}
              onChange={(v) => updateConfig({ operator: v })}
              placeholder="Select operator..."
            />

            {OPERATORS[config.operator || "exists"]?.needsValue && (
              <>
                <label className="wf-config-label">Compare Against</label>
                <input
                  className="wf-config-input"
                  value={config.value || ""}
                  onChange={(e) =>
                    setConfig({ ...config, value: e.target.value })
                  }
                  onBlur={save}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  placeholder="value to compare against"
                />
              </>
            )}

            <span className="wf-config-hint">
              Connect True and False branches from the output port.
            </span>
          </>
        )}

        {/* ═══════ DELAY CONFIG ═══════ */}
        {node.type === "delay" && (
          <>
            <label className="wf-config-label">Wait Duration</label>
            <div className="wf-config-row">
              <input
                className="wf-config-input"
                type="number"
                min="1"
                value={config.seconds || 1}
                onChange={(e) =>
                  setConfig({ ...config, seconds: e.target.value })
                }
                onBlur={save}
                style={{ width: 70 }}
              />
              <span className="wf-config-hint" style={{ marginTop: 0 }}>
                seconds
              </span>
            </div>
            <span className="wf-config-hint">
              Input data passes through unchanged after the wait.
            </span>
          </>
        )}

        {/* ═══════ OUTPUT CONFIG ═══════ */}
        {node.type === "output" && (
          <>
            <label className="wf-config-label">Action</label>
            <select
              className="wf-config-input"
              value={config.action || "log"}
              onChange={(e) => updateConfig({ action: e.target.value })}
            >
              <option value="log">📝 Log (return value)</option>
              <option value="notify">🔔 Send Notification</option>
            </select>
            <label className="wf-config-label">Message Template</label>
            <input
              className="wf-config-input"
              value={config.message || ""}
              onChange={(e) =>
                setConfig({ ...config, message: e.target.value })
              }
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Use {{input}} for incoming data"
            />
            <span className="wf-config-hint">
              Leave empty to use the raw incoming data as the message.
            </span>
          </>
        )}

        {/* ═══════ HTTP CONFIG ═══════ */}
        {node.type === "http" && (
          <>
            <label className="wf-config-label">Method</label>
            <div className="wf-config-row">
              {HTTP_METHODS.map((m) => (
                <button
                  key={m}
                  className={`wf-field-chip ${config.method === m ? "active" : ""}`}
                  onClick={() => updateConfig({ method: m })}
                  style={
                    config.method === m
                      ? {
                          background:
                            m === "GET"
                              ? "#22c55e"
                              : m === "POST"
                                ? "#3b82f6"
                                : m === "PUT"
                                  ? "#f59e0b"
                                  : m === "DELETE"
                                    ? "#ef4444"
                                    : "#8b5cf6",
                          color: "#fff",
                        }
                      : {}
                  }
                >
                  {m}
                </button>
              ))}
            </div>

            <label className="wf-config-label">URL</label>
            <input
              className="wf-config-input wf-config-mono"
              value={config.url || ""}
              onChange={(e) => setConfig({ ...config, url: e.target.value })}
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="https://api.example.com/data"
            />
            <span className="wf-config-hint">
              Use <code>{"{{input}}"}</code> or <code>{"{{input.id}}"}</code> to
              interpolate incoming data into the URL.
            </span>

            {/* Headers */}
            <label className="wf-config-label">
              Headers{" "}
              <button
                className="wf-field-chip"
                style={{ marginLeft: 6, fontSize: 9 }}
                onClick={() =>
                  updateConfig({
                    headers: [
                      ...(config.headers || []),
                      { key: "", value: "" },
                    ],
                  })
                }
              >
                + Add
              </button>
            </label>
            {(config.headers || []).map((h, i) => (
              <div className="wf-config-row" key={i} style={{ gap: 4 }}>
                <input
                  className="wf-config-input"
                  style={{ flex: 1 }}
                  value={h.key}
                  onChange={(e) => {
                    const hdrs = [...(config.headers || [])];
                    hdrs[i] = { ...hdrs[i], key: e.target.value };
                    setConfig({ ...config, headers: hdrs });
                  }}
                  onBlur={save}
                  placeholder="Header name"
                />
                <input
                  className="wf-config-input"
                  style={{ flex: 2 }}
                  value={h.value}
                  onChange={(e) => {
                    const hdrs = [...(config.headers || [])];
                    hdrs[i] = { ...hdrs[i], value: e.target.value };
                    setConfig({ ...config, headers: hdrs });
                  }}
                  onBlur={save}
                  placeholder="Value"
                />
                <button
                  className="wf-field-chip"
                  style={{ fontSize: 9, padding: "2px 5px" }}
                  onClick={() => {
                    const hdrs = (config.headers || []).filter(
                      (_, j) => j !== i,
                    );
                    updateConfig({ headers: hdrs });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            {/* Body (for POST/PUT/PATCH) */}
            {["POST", "PUT", "PATCH"].includes(config.method) && (
              <>
                <label className="wf-config-label">Request Body (JSON)</label>
                <textarea
                  className="wf-config-input wf-config-mono"
                  value={config.body || ""}
                  onChange={(e) =>
                    setConfig({ ...config, body: e.target.value })
                  }
                  onBlur={save}
                  placeholder={'{"key": "{{input.value}}"}'}
                  rows={4}
                  style={{
                    resize: "vertical",
                    minHeight: 60,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                  }}
                />
                <span className="wf-config-hint">
                  JSON body. Use <code>{"{{input}}"}</code> to inject upstream
                  data.
                </span>
              </>
            )}

            {/* Auth */}
            <label className="wf-config-label">Authentication</label>
            <select
              className="wf-config-input"
              value={config.authType || "none"}
              onChange={(e) => updateConfig({ authType: e.target.value })}
            >
              {AUTH_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            {config.authType === "bearer" && (
              <>
                <label className="wf-config-label">Bearer Token</label>
                <input
                  className="wf-config-input wf-config-mono"
                  type="password"
                  value={config.authToken || ""}
                  onChange={(e) =>
                    setConfig({ ...config, authToken: e.target.value })
                  }
                  onBlur={save}
                  placeholder="sk-..."
                />
              </>
            )}
            {config.authType === "basic" && (
              <>
                <label className="wf-config-label">Username</label>
                <input
                  className="wf-config-input"
                  value={config.authUser || ""}
                  onChange={(e) =>
                    setConfig({ ...config, authUser: e.target.value })
                  }
                  onBlur={save}
                  placeholder="username"
                />
                <label className="wf-config-label">Password</label>
                <input
                  className="wf-config-input"
                  type="password"
                  value={config.authPass || ""}
                  onChange={(e) =>
                    setConfig({ ...config, authPass: e.target.value })
                  }
                  onBlur={save}
                  placeholder="password"
                />
              </>
            )}
            {config.authType === "apikey" && (
              <>
                <label className="wf-config-label">Header Name</label>
                <input
                  className="wf-config-input"
                  value={config.authHeaderName || "X-API-Key"}
                  onChange={(e) =>
                    setConfig({ ...config, authHeaderName: e.target.value })
                  }
                  onBlur={save}
                />
                <label className="wf-config-label">API Key</label>
                <input
                  className="wf-config-input wf-config-mono"
                  type="password"
                  value={config.authToken || ""}
                  onChange={(e) =>
                    setConfig({ ...config, authToken: e.target.value })
                  }
                  onBlur={save}
                  placeholder="your-api-key"
                />
              </>
            )}

            {/* Response path */}
            <label className="wf-config-label">Response Path (optional)</label>
            <input
              className="wf-config-input wf-config-mono"
              value={config.responsePath || ""}
              onChange={(e) =>
                setConfig({ ...config, responsePath: e.target.value })
              }
              onBlur={save}
              placeholder="e.g. data.results or items[0]"
            />
            <span className="wf-config-hint">
              Extract a nested field from the JSON response. Leave empty to pass
              the full response body.
            </span>

            {/* Timeout */}
            <label className="wf-config-label">Timeout</label>
            <div className="wf-config-row">
              <input
                className="wf-config-input"
                type="number"
                min="1"
                max="300"
                value={config.timeout || 30}
                onChange={(e) =>
                  setConfig({ ...config, timeout: e.target.value })
                }
                onBlur={save}
                style={{ width: 60 }}
              />
              <span className="wf-config-hint" style={{ marginTop: 0 }}>
                seconds
              </span>
            </div>
          </>
        )}

        {/* ═══════ MCP CONFIG ═══════ */}
        {node.type === "mcp" && (
          <>
            <label className="wf-config-label">MCP Server</label>
            <input
              className="wf-config-input"
              value={config.serverName || ""}
              onChange={(e) =>
                setConfig({ ...config, serverName: e.target.value })
              }
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. github, slack, notion..."
            />
            <span className="wf-config-hint">
              Name of the MCP server to connect to.{" "}
              <button
                className="wf-field-chip"
                style={{ fontSize: 9 }}
                onClick={async () => {
                  try {
                    const res = await fetch("/api/mcp/servers");
                    const data = await res.json();
                    if (data.servers?.length) {
                      alert(
                        "Available MCP servers:\n\n" +
                          data.servers
                            .map(
                              (s) =>
                                `• ${s.name} (${s.toolCount || "?"} tools)`,
                            )
                            .join("\n"),
                      );
                    } else {
                      alert("No MCP servers configured yet.");
                    }
                  } catch {
                    alert(
                      "Could not discover MCP servers. Make sure the MCP proxy plugin is running.",
                    );
                  }
                }}
              >
                🔍 Discover
              </button>
            </span>

            <label className="wf-config-label">Tool Name</label>
            <input
              className="wf-config-input wf-config-mono"
              value={config.toolName || ""}
              onChange={(e) =>
                setConfig({ ...config, toolName: e.target.value })
              }
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. create_issue, send_message..."
            />
            {config.serverName && (
              <button
                className="wf-field-chip"
                style={{ fontSize: 9, marginTop: 4 }}
                onClick={async () => {
                  try {
                    const res = await fetch(
                      `/api/mcp/tools?server=${encodeURIComponent(config.serverName)}`,
                    );
                    const data = await res.json();
                    if (data.tools?.length) {
                      const selected = prompt(
                        "Available tools:\n\n" +
                          data.tools
                            .map(
                              (t, i) =>
                                `${i + 1}. ${t.name} — ${t.description || ""}`,
                            )
                            .join("\n") +
                          "\n\nEnter tool number:",
                      );
                      if (selected) {
                        const idx = parseInt(selected) - 1;
                        if (data.tools[idx]) {
                          updateConfig({
                            toolName: data.tools[idx].name,
                            toolSchema: data.tools[idx].inputSchema || {},
                          });
                        }
                      }
                    } else {
                      alert("No tools found on this server.");
                    }
                  } catch {
                    alert("Could not list tools. Check server name.");
                  }
                }}
              >
                📋 List Tools
              </button>
            )}

            {/* Input Mapping */}
            <label className="wf-config-label">Input Parameters (JSON)</label>
            <textarea
              className="wf-config-input wf-config-mono"
              value={
                typeof config.inputMapping === "string"
                  ? config.inputMapping
                  : JSON.stringify(config.inputMapping || {}, null, 2)
              }
              onChange={(e) =>
                setConfig({ ...config, inputMapping: e.target.value })
              }
              onBlur={() => {
                try {
                  const parsed =
                    typeof config.inputMapping === "string"
                      ? JSON.parse(config.inputMapping)
                      : config.inputMapping;
                  updateConfig({ inputMapping: parsed });
                } catch {
                  save();
                }
              }}
              placeholder={
                '{"repo": "{{input.repo}}", "title": "{{input.title}}"}'
              }
              rows={4}
              style={{
                resize: "vertical",
                minHeight: 60,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
              }}
            />
            <span className="wf-config-hint">
              Map workflow data to tool parameters using{" "}
              <code>{"{{input.field}}"}</code> syntax. Keys must match the
              tool's expected parameters.
            </span>

            {/* Tool schema hint */}
            {config.toolSchema && (
              <div className="wf-config-output-hint">
                <span className="wf-config-hint" style={{ fontWeight: 600 }}>
                  Tool Parameters:
                </span>
                <code
                  className="wf-config-mono"
                  style={{
                    fontSize: 9,
                    display: "block",
                    padding: "3px 6px",
                    background: "rgba(0,0,0,0.15)",
                    borderRadius: 4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(config.toolSchema, null, 2).substring(0, 300)}
                </code>
              </div>
            )}

            {/* Output path */}
            <label className="wf-config-label">Output Path (optional)</label>
            <input
              className="wf-config-input wf-config-mono"
              value={config.outputPath || ""}
              onChange={(e) =>
                setConfig({ ...config, outputPath: e.target.value })
              }
              onBlur={save}
              placeholder="e.g. content[0].text"
            />
            <span className="wf-config-hint">
              Extract a nested field from the tool response.
            </span>
          </>
        )}

        {/* ═══════ AI CONFIG ═══════ */}
        {node.type === "ai" && (
          <>
            <label className="wf-config-label">Processing Mode</label>
            <SearchableSelect
              options={AI_MODES.map((m) => ({
                value: m.value,
                label: m.label,
              }))}
              value={config.mode || "transform"}
              onChange={(v) => updateConfig({ mode: v })}
              placeholder="Select mode..."
            />
            {config.mode === "decide" && (
              <span className="wf-config-hint">
                ⚡ Decide mode outputs true/false — connect True and False
                branches like a Condition node.
              </span>
            )}

            <label className="wf-config-label">Prompt / Intent</label>
            <textarea
              className="wf-config-input"
              value={config.prompt || ""}
              onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
              onBlur={save}
              placeholder={
                config.mode === "classify"
                  ? "Classify the following into: bug, feature, question"
                  : config.mode === "extract"
                    ? "Extract the name, email, and phone from this text"
                    : config.mode === "decide"
                      ? "Is this a high priority item that needs immediate attention?"
                      : config.mode === "summarize"
                        ? "Summarize the following data in 2-3 sentences"
                        : "Transform this data into a formatted report"
              }
              rows={3}
              style={{ resize: "vertical", minHeight: 50 }}
            />
            <span className="wf-config-hint">
              Describe what the AI should do with the incoming data. The input
              from the previous node is automatically included as context.
            </span>

            {/* API Configuration */}
            <label className="wf-config-label">AI API Endpoint</label>
            <input
              className="wf-config-input wf-config-mono"
              value={config.apiUrl || ""}
              onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
              onBlur={save}
              placeholder="https://api.openai.com/v1/chat/completions"
            />
            <span className="wf-config-hint">
              OpenAI-compatible endpoint. Leave empty to use configured default.
            </span>

            <label className="wf-config-label">API Key</label>
            <input
              className="wf-config-input wf-config-mono"
              type="password"
              value={config.apiKey || ""}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              onBlur={save}
              placeholder="sk-..."
            />

            <label className="wf-config-label">Model</label>
            <input
              className="wf-config-input"
              value={config.model || ""}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              onBlur={save}
              placeholder="gpt-4o-mini, claude-3-haiku, etc."
            />

            {/* Temperature */}
            <label className="wf-config-label">
              Temperature: {config.temperature ?? 0.7}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature ?? 0.7}
              onChange={(e) =>
                updateConfig({ temperature: parseFloat(e.target.value) })
              }
              style={{ width: "100%" }}
            />

            {/* Output format */}
            <label className="wf-config-label">Output Format</label>
            <select
              className="wf-config-input"
              value={config.outputFormat || "json"}
              onChange={(e) => updateConfig({ outputFormat: e.target.value })}
            >
              <option value="json">JSON (structured data)</option>
              <option value="text">Plain Text</option>
            </select>
            <span className="wf-config-hint">
              JSON mode asks the AI to return structured data that downstream
              nodes can process. Text mode returns raw AI output.
            </span>
          </>
        )}

        {/* ── Last Output ── */}
        {node.output !== undefined && node.output !== null && (
          <div className="wf-config-output">
            <label className="wf-config-label">
              ⬆ Output (flows to next node)
            </label>
            <pre className="wf-config-pre">{fmtOutput(node.output)}</pre>
          </div>
        )}

        {/* ── Node ID ── */}
        <label className="wf-config-label">Node ID</label>
        <span
          className="wf-config-hint"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {node.id}
        </span>
      </div>

      <div className="wf-config-footer">
        <button
          className="wf-config-delete"
          onClick={() => {
            deleteNode(wfId, node.id);
            onClose();
          }}
        >
          <Trash2 size={12} /> Delete Node
        </button>
      </div>
    </div>
  );
}

// ─── JSON View Panel ──────────────────────────────────

function JsonViewPanel({ workflow }) {
  const jsonStr = useMemo(() => {
    if (!workflow) return "null";
    const clean = {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      enabled: workflow.enabled,
      lastRunStatus: workflow.lastRunStatus,
      nodes: workflow.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        config: n.config,
        position: { x: n.x, y: n.y },
        status: n.status,
        output: n.output,
      })),
      connections: workflow.connections.map((c) => ({
        id: c.id,
        from: c.from,
        to: c.to,
      })),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
    return JSON.stringify(clean, null, 2);
  }, [workflow]);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonStr);
  };

  return (
    <div className="wf-json-panel">
      <div className="wf-json-header">
        <span>Workflow JSON</span>
        <button onClick={handleCopy}>
          <Clipboard size={10} /> Copy
        </button>
      </div>
      <div className="wf-json-body">
        <pre className="wf-json-pre">{jsonStr}</pre>
      </div>
    </div>
  );
}

// ─── Execution Log Panel ─────────────────────────────

const LOG_COLORS = {
  info: "#3b82f6",
  success: "#22c55e",
  warn: "#f59e0b",
  error: "#ef4444",
};

const EMPTY_LOGS = [];

function LogPanel({ wfId }) {
  const logs = useWorkflowStore(
    useCallback((s) => s.executionLogs[wfId] ?? EMPTY_LOGS, [wfId]),
  );
  const clearLogs = useWorkflowStore((s) => s.clearLogs);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="wf-log-panel">
      <div className="wf-log-header">
        <span>
          <ScrollText size={12} /> Execution Log
          {logs.length > 0 && (
            <span className="wf-log-count">{logs.length}</span>
          )}
        </span>
        <button onClick={() => clearLogs(wfId)} title="Clear logs">
          <Trash2 size={10} /> Clear
        </button>
      </div>
      <div className="wf-log-body">
        {logs.length === 0 ? (
          <div className="wf-log-empty">
            <ScrollText size={32} />
            <span>No logs yet. Run the workflow to see execution details.</span>
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`wf-log-entry wf-log-${log.level}`}
              style={{ borderLeftColor: LOG_COLORS[log.level] || "#666" }}
            >
              <div className="wf-log-entry-header">
                <span className="wf-log-time">{fmtTime(log.ts)}</span>
                <span
                  className="wf-log-level"
                  style={{ color: LOG_COLORS[log.level] }}
                >
                  {log.level.toUpperCase()}
                </span>
              </div>
              <div className="wf-log-message">{log.message}</div>
              {log.input && (
                <div className="wf-log-data">
                  <span className="wf-log-data-label">Input:</span>
                  <code>
                    {typeof log.input === "string"
                      ? log.input
                      : JSON.stringify(log.input)}
                  </code>
                </div>
              )}
              {log.output && (
                <div className="wf-log-data">
                  <span className="wf-log-data-label">Output:</span>
                  <code>
                    {typeof log.output === "string"
                      ? log.output
                      : JSON.stringify(log.output)}
                  </code>
                </div>
              )}
              {log.errors && (
                <div className="wf-log-data wf-log-data-error">
                  <span className="wf-log-data-label">Errors:</span>
                  {log.errors.map((e, j) => (
                    <div key={j} className="wf-log-error-item">
                      <strong>{e.label}:</strong> {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Main Builder ──────────────────────────────────────

export default function WorkflowBuilder({ windowId, widgetType }) {
  const workflows = useWorkflowStore((s) => s.workflows);
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId);
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow);
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow);
  const duplicateWorkflow = useWorkflowStore((s) => s.duplicateWorkflow);
  const setActive = useWorkflowStore((s) => s.setActive);
  const addNode = useWorkflowStore((s) => s.addNode);
  const moveNode = useWorkflowStore((s) => s.moveNode);
  const addConnection = useWorkflowStore((s) => s.addConnection);
  const deleteConnection = useWorkflowStore((s) => s.deleteConnection);
  const updateWorkflow = useWorkflowStore((s) => s.updateWorkflow);

  const activeWf = useMemo(
    () => workflows.find((w) => w.id === activeWorkflowId),
    [workflows, activeWorkflowId],
  );

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addMenuPos, setAddMenuPos] = useState({ x: 300, y: 200 });
  const [isRunning, setIsRunning] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [viewMode, setViewMode] = useState("canvas"); // "canvas" | "json"
  const [zoom, setZoom] = useState(1);
  // Branch picker: when connecting from a condition node, ask true/false
  const [branchPicker, setBranchPicker] = useState(null); // { fromId, toId } or null

  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  // Report live context for AI agents
  useWidgetContext(windowId, "workflow-builder", {
    workflowCount: workflows.length,
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      nodeCount: (w.nodes || []).length,
    })),
    activeWorkflow: activeWf
      ? {
          id: activeWf.id,
          name: activeWf.name,
          nodeCount: (activeWf.nodes || []).length,
          connectionCount: (activeWf.connections || []).length,
          nodes: (activeWf.nodes || []).map((n) => ({
            id: n.id,
            type: n.type,
            label: n.label || n.command || n.event || n.type,
          })),
          connections: (activeWf.connections || []).map((c) => ({
            from: c.from,
            to: c.to,
            branch: c.branch || null,
          })),
        }
      : null,
    isRunning,
    selectedNodeId,
    viewMode,
    zoom,
  });

  // Zoom helpers
  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(1))),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(1))),
    [],
  );
  const zoomReset = useCallback(() => setZoom(1), []);

  const selectedNode = useMemo(
    () => activeWf?.nodes.find((n) => n.id === selectedNodeId) || null,
    [activeWf, selectedNodeId],
  );

  // Connection counts per node
  const connectionCounts = useMemo(() => {
    if (!activeWf) return {};
    const counts = {};
    for (const conn of activeWf.connections) {
      counts[conn.from] = (counts[conn.from] || 0) + 1;
      counts[conn.to] = (counts[conn.to] || 0) + 1;
    }
    return counts;
  }, [activeWf]);

  // ─── Drag Logic (accounts for scroll) ───────────────

  const handleDragStart = useCallback(
    (e, nodeId) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const node = activeWf?.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      dragRef.current = {
        nodeId,
        offsetX: (e.clientX - rect.left + canvas.scrollLeft) / zoom - node.x,
        offsetY: (e.clientY - rect.top + canvas.scrollTop) / zoom - node.y,
      };

      const handleMove = (ev) => {
        if (!dragRef.current || !canvasRef.current) return;
        const c = canvasRef.current;
        const r = c.getBoundingClientRect();
        const x = Math.max(
          0,
          (ev.clientX - r.left + c.scrollLeft) / zoom - dragRef.current.offsetX,
        );
        const y = Math.max(
          0,
          (ev.clientY - r.top + c.scrollTop) / zoom - dragRef.current.offsetY,
        );
        moveNode(activeWorkflowId, dragRef.current.nodeId, x, y);
      };

      const handleUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [activeWf, activeWorkflowId, moveNode],
  );

  // ─── Port Connection Logic ─────────────────────────

  const handlePortClick = useCallback(
    (nodeId, port) => {
      if (!connectingFrom) {
        if (port === "out") {
          setConnectingFrom(nodeId);
        }
      } else {
        if (port === "in" && nodeId !== connectingFrom) {
          // Check if connecting FROM a condition node — prompt for branch label
          const fromNode = activeWf?.nodes.find((n) => n.id === connectingFrom);
          if (fromNode?.type === "condition") {
            setBranchPicker({ fromId: connectingFrom, toId: nodeId });
          } else {
            addConnection(activeWorkflowId, connectingFrom, nodeId);
          }
        }
        setConnectingFrom(null);
      }
    },
    [connectingFrom, activeWorkflowId, addConnection, activeWf],
  );

  // Handle branch picker selection
  const handleBranchSelect = useCallback(
    (label) => {
      if (branchPicker) {
        addConnection(
          activeWorkflowId,
          branchPicker.fromId,
          branchPicker.toId,
          label,
        );
        setBranchPicker(null);
      }
    },
    [branchPicker, activeWorkflowId, addConnection],
  );

  // ─── Add Node ──────────────────────────────────────

  const handleAddNode = useCallback(
    (type) => {
      if (!activeWorkflowId) return;
      const label = NODE_TYPES[type]?.label || type;
      const configDefaults = {
        command: { command: "" },
        condition: { operator: "contains", value: "" },
        delay: { seconds: 3 },
        output: { action: "log" },
        http: {
          method: "GET",
          url: "",
          headers: [],
          body: "",
          authType: "none",
          authToken: "",
          timeout: 30,
          responsePath: "",
        },
        mcp: { serverName: "", toolName: "", inputMapping: {}, outputPath: "" },
        ai: {
          mode: "transform",
          prompt: "",
          model: "",
          apiUrl: "",
          apiKey: "",
          outputFormat: "json",
          temperature: 0.7,
        },
        trigger: { triggerType: "manual" },
      };
      const config = configDefaults[type] || { triggerType: "manual" };
      addNode(activeWorkflowId, {
        type,
        label,
        config,
        x: addMenuPos.x,
        y: addMenuPos.y,
      });
      setShowAddMenu(false);
    },
    [activeWorkflowId, addMenuPos, addNode],
  );

  // ─── Canvas Double-Click to Add ────────────────────

  const handleCanvasDoubleClick = useCallback(
    (e) => {
      if (!activeWorkflowId) return;
      const target = e.target;
      if (target.closest(".wf-node") || target.closest(".wf-add-menu")) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setAddMenuPos({
        x: (e.clientX - rect.left + canvas.scrollLeft) / zoom,
        y: (e.clientY - rect.top + canvas.scrollTop) / zoom,
      });
      setShowAddMenu(true);
    },
    [activeWorkflowId, zoom],
  );

  // Scroll-wheel zoom (Ctrl/Cmd + scroll)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom((z) =>
          Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(1))),
        );
      }
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  // ─── Canvas click: cancel connection ───────────────

  const handleCanvasClick = useCallback(
    (e) => {
      if (e.target.closest(".wf-port") || e.target.closest(".wf-add-menu"))
        return;
      if (connectingFrom) setConnectingFrom(null);
      if (showAddMenu && !e.target.closest(".wf-add-menu"))
        setShowAddMenu(false);
    },
    [connectingFrom, showAddMenu],
  );

  // ─── Execute ───────────────────────────────────────

  const handleExecute = async () => {
    if (!activeWorkflowId) return;
    setIsRunning(true);
    try {
      await workflowEngine.execute(activeWorkflowId);
    } finally {
      setIsRunning(false);
    }
  };

  const handleAbort = () => {
    if (activeWorkflowId) workflowEngine.abort(activeWorkflowId);
    setIsRunning(false);
  };

  // ─── Keyboard shortcuts ────────────────────────────

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setConnectingFrom(null);
        setShowAddMenu(false);
        setSelectedNodeId(null);
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedNodeId &&
        activeWorkflowId
      ) {
        // Don't delete if we're in an input
        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT"
        )
          return;
        const store = useWorkflowStore.getState();
        store.deleteNode(activeWorkflowId, selectedNodeId);
        setSelectedNodeId(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedNodeId, activeWorkflowId]);

  // ─── Render ────────────────────────────────────────

  return (
    <div className="workflow-builder">
      {/* Sidebar: Workflow List */}
      {showSidebar && (
        <div className="wf-sidebar">
          <div className="wf-sidebar-header">
            <span>Workflows</span>
            <button className="wf-sidebar-add" onClick={() => createWorkflow()}>
              <Plus size={14} />
            </button>
          </div>
          <div className="wf-sidebar-list">
            {workflows.length === 0 ? (
              <div className="wf-sidebar-empty">
                No workflows yet.
                <br />
                Click + to create one.
              </div>
            ) : (
              workflows.map((wf) => (
                <div
                  key={wf.id}
                  className={`wf-sidebar-item ${wf.id === activeWorkflowId ? "active" : ""} ${wf.enabled ? "wf-enabled" : "wf-disabled"}`}
                  onClick={() => {
                    setActive(wf.id);
                    setSelectedNodeId(null);
                  }}
                >
                  <div className="wf-sidebar-item-info">
                    <div className="wf-sidebar-item-name-row">
                      <span
                        className={`wf-sidebar-status-dot ${wf.enabled ? "on" : "off"}`}
                        title={
                          wf.enabled
                            ? "Active — listening for events"
                            : "Inactive"
                        }
                      />
                      <span className="wf-sidebar-item-name">{wf.name}</span>
                    </div>
                    <span className="wf-sidebar-item-meta">
                      {wf.nodes.length} nodes ·{" "}
                      {wf.enabled ? "active" : "paused"}
                      {wf.lastRunStatus ? ` · ${wf.lastRunStatus}` : ""}
                    </span>
                  </div>
                  <div className="wf-sidebar-item-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateWorkflow(wf.id, { enabled: !wf.enabled });
                      }}
                      title={
                        wf.enabled ? "Disable workflow" : "Enable workflow"
                      }
                      className={wf.enabled ? "wf-toggle-on" : "wf-toggle-off"}
                    >
                      {wf.enabled ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <Circle size={12} />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateWorkflow(wf.id);
                      }}
                      title="Duplicate"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWorkflow(wf.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="wf-main">
        {/* Toolbar */}
        <div className="wf-toolbar">
          <button
            className="wf-tb-btn"
            onClick={() => setShowSidebar(!showSidebar)}
            title="Toggle sidebar"
          >
            <FolderOpen size={14} />
          </button>

          {activeWf && (
            <>
              <input
                className="wf-toolbar-name"
                value={activeWf.name}
                onChange={(e) =>
                  updateWorkflow(activeWorkflowId, { name: e.target.value })
                }
              />

              {/* View mode tabs */}
              <div className="wf-view-tabs">
                <button
                  className={`wf-view-tab ${viewMode === "canvas" ? "active" : ""}`}
                  onClick={() => setViewMode("canvas")}
                >
                  <LayoutGrid size={10} /> Canvas
                </button>
                <button
                  className={`wf-view-tab ${viewMode === "json" ? "active" : ""}`}
                  onClick={() => setViewMode("json")}
                >
                  <Code size={10} /> JSON
                </button>
                <button
                  className={`wf-view-tab ${viewMode === "logs" ? "active" : ""}`}
                  onClick={() => setViewMode("logs")}
                >
                  <ScrollText size={10} /> Logs
                </button>
              </div>

              {/* Enable/Disable toggle */}
              <button
                className={`wf-tb-btn wf-tb-toggle ${activeWf.enabled ? "wf-tb-on" : "wf-tb-off"}`}
                onClick={() =>
                  updateWorkflow(activeWorkflowId, {
                    enabled: !activeWf.enabled,
                  })
                }
                title={
                  activeWf.enabled
                    ? "Workflow is ACTIVE — click to disable"
                    : "Workflow is PAUSED — click to enable"
                }
              >
                {activeWf.enabled ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <Circle size={12} />
                )}
                {activeWf.enabled ? "Active" : "Paused"}
              </button>

              <div className="wf-toolbar-spacer" />

              {/* Zoom controls */}
              {viewMode === "canvas" && (
                <div className="wf-zoom-controls">
                  <button
                    className="wf-zoom-btn"
                    onClick={zoomOut}
                    title="Zoom out"
                  >
                    <ZoomOut size={12} />
                  </button>
                  <button
                    className="wf-zoom-label"
                    onClick={zoomReset}
                    title="Reset zoom"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    className="wf-zoom-btn"
                    onClick={zoomIn}
                    title="Zoom in"
                  >
                    <ZoomIn size={12} />
                  </button>
                </div>
              )}

              {viewMode === "canvas" && (
                <button
                  className="wf-tb-btn"
                  onClick={() => {
                    const canvas = canvasRef.current;
                    const rect = canvas?.getBoundingClientRect();
                    setAddMenuPos({
                      x:
                        ((canvas ? canvas.scrollLeft : 0) +
                          (rect?.width || 600) / 2 -
                          90) /
                        zoom,
                      y:
                        ((canvas ? canvas.scrollTop : 0) +
                          (rect?.height || 400) / 2) /
                        zoom,
                    });
                    setShowAddMenu(true);
                  }}
                  title="Add node"
                >
                  <Plus size={14} /> Add Node
                </button>
              )}

              {!isRunning ? (
                <button
                  className="wf-tb-btn wf-tb-run"
                  onClick={handleExecute}
                  title="Run workflow"
                >
                  <Play size={14} /> Run
                </button>
              ) : (
                <button
                  className="wf-tb-btn wf-tb-stop"
                  onClick={handleAbort}
                  title="Stop"
                >
                  <Square size={14} /> Stop
                </button>
              )}
            </>
          )}
        </div>

        {/* Content Area */}
        {activeWf ? (
          viewMode === "json" ? (
            <JsonViewPanel workflow={activeWf} />
          ) : viewMode === "logs" ? (
            <LogPanel wfId={activeWorkflowId} />
          ) : (
            <div
              className="wf-canvas"
              ref={canvasRef}
              onDoubleClick={handleCanvasDoubleClick}
              onClick={handleCanvasClick}
            >
              <div
                className="wf-canvas-inner"
                style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}
              >
                <ConnectionLines
                  nodes={activeWf.nodes}
                  connections={activeWf.connections}
                  onDeleteConnection={deleteConnection}
                  wfId={activeWorkflowId}
                />

                {activeWf.nodes.map((node) => (
                  <WorkflowNode
                    key={node.id}
                    node={node}
                    selected={node.id === selectedNodeId}
                    onSelect={setSelectedNodeId}
                    onDragStart={handleDragStart}
                    onPortClick={handlePortClick}
                    connectingFrom={connectingFrom}
                    connectionCount={connectionCounts[node.id] || 0}
                  />
                ))}

                {/* Add Node Menu */}
                {showAddMenu && (
                  <div
                    className="wf-add-menu"
                    style={{ left: addMenuPos.x, top: addMenuPos.y }}
                  >
                    <div className="wf-add-menu-title">Add Node</div>
                    {Object.entries(NODE_TYPES).map(([type, def]) => {
                      const NodeIcon = def.icon;
                      return (
                        <button
                          key={type}
                          className="wf-add-menu-item"
                          onClick={() => handleAddNode(type)}
                        >
                          <NodeIcon size={14} style={{ color: def.color }} />
                          <span>{def.label}</span>
                        </button>
                      );
                    })}
                    <button
                      className="wf-add-menu-cancel"
                      onClick={() => setShowAddMenu(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {connectingFrom && (
                  <div className="wf-connecting-hint">
                    Click an input port to connect — Escape to cancel
                  </div>
                )}

                {/* Branch picker for condition connections */}
                {branchPicker && (
                  <div
                    className="wf-add-menu"
                    style={{
                      left: (() => {
                        const fromNode = activeWf?.nodes.find(
                          (n) => n.id === branchPicker.fromId,
                        );
                        const toNode = activeWf?.nodes.find(
                          (n) => n.id === branchPicker.toId,
                        );
                        return fromNode && toNode
                          ? (fromNode.x + toNode.x) / 2 + 60
                          : 300;
                      })(),
                      top: (() => {
                        const fromNode = activeWf?.nodes.find(
                          (n) => n.id === branchPicker.fromId,
                        );
                        const toNode = activeWf?.nodes.find(
                          (n) => n.id === branchPicker.toId,
                        );
                        return fromNode && toNode
                          ? (fromNode.y + toNode.y) / 2
                          : 200;
                      })(),
                    }}
                  >
                    <div className="wf-add-menu-title">Condition Branch</div>
                    <button
                      className="wf-add-menu-item"
                      onClick={() => handleBranchSelect("true")}
                    >
                      <CheckCircle2 size={14} style={{ color: "#22c55e" }} />
                      <span>✓ True Branch</span>
                    </button>
                    <button
                      className="wf-add-menu-item"
                      onClick={() => handleBranchSelect("false")}
                    >
                      <X size={14} style={{ color: "#ef4444" }} />
                      <span>✗ False Branch</span>
                    </button>
                    <button
                      className="wf-add-menu-cancel"
                      onClick={() => setBranchPicker(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="wf-empty-canvas">
            <Zap size={48} />
            <span className="wf-empty-title">Workflow Builder</span>
            <span className="wf-empty-hint">
              Create a workflow to chain commands, schedule tasks, and automate
              anything. Double-click the canvas to add nodes.
            </span>
            <button className="wf-empty-btn" onClick={() => createWorkflow()}>
              <Plus size={14} /> New Workflow
            </button>
          </div>
        )}
      </div>

      {/* Right: Node Config */}
      {selectedNode && activeWorkflowId && viewMode === "canvas" && (
        <NodeConfigPanel
          node={selectedNode}
          wfId={activeWorkflowId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
