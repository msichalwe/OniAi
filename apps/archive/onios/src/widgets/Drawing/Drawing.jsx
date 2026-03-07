/**
 * Drawing Widget — AI-driven whiteboard with Draw Command Protocol.
 *
 * Phase 2: auto-layout, simulation engine, brainstorm clustering,
 * session booklet (.oni-board), interactive sliders, scatter charts.
 *
 * Modes: diagram (default), chart, brainstorm, sim
 * Draw commands: shape.add/update/delete, edge.add/update/delete,
 *   board.clear/setView/setMode, chart.create, layout.auto,
 *   sim.create/run/pause, group.create
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useReducer,
} from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Circle,
  Type,
  ArrowRight,
  Move,
  ZoomIn,
  ZoomOut,
  Trash2,
  Download,
  Save,
  RotateCcw,
  Layers,
  BarChart3,
  Lightbulb,
  Grid3X3,
  StickyNote,
  MousePointer2,
  Minus,
  Image as ImageIcon,
  LayoutGrid,
  Sparkles,
  Timer,
  FileArchive,
  FolderOpen,
  Sliders,
} from "lucide-react";
import { eventBus } from "../../core/EventBus";
import "./Drawing.css";

// ─── Constants ────────────────────────────────────────
const GRID = 20;
const SHAPE_DEFAULTS = {
  rect: {
    w: 200,
    h: 80,
    fill: "rgba(80,130,255,0.12)",
    stroke: "rgba(80,130,255,0.5)",
    radius: 8,
  },
  ellipse: {
    w: 160,
    h: 100,
    fill: "rgba(80,200,120,0.12)",
    stroke: "rgba(80,200,120,0.5)",
  },
  diamond: {
    w: 140,
    h: 110,
    fill: "rgba(255,180,50,0.12)",
    stroke: "rgba(255,180,50,0.5)",
  },
  text: { w: 200, h: 30, fill: "transparent", stroke: "transparent" },
  sticky: {
    w: 170,
    h: 130,
    fill: "rgba(255,230,100,0.18)",
    stroke: "rgba(255,200,50,0.35)",
    radius: 4,
  },
  note: {
    w: 220,
    h: 50,
    fill: "rgba(140,100,255,0.1)",
    stroke: "rgba(140,100,255,0.3)",
    radius: 6,
  },
  container: {
    w: 300,
    h: 220,
    fill: "rgba(255,255,255,0.02)",
    stroke: "rgba(255,255,255,0.1)",
    radius: 10,
  },
};

let _uid = 0;
const uid = (prefix = "s") => `${prefix}_${++_uid}_${Date.now().toString(36)}`;

// ─── Board Reducer ────────────────────────────────────

const INITIAL_BOARD = {
  shapes: {},
  edges: {},
  groups: {},
  annotations: [],
  mode: "diagram",
  simulations: {},
};

function boardReducer(state, action) {
  switch (action.type) {
    case "SHAPE_ADD": {
      const defaults =
        SHAPE_DEFAULTS[action.payload.shape] || SHAPE_DEFAULTS.rect;
      const shape = {
        ...defaults,
        x: 100,
        y: 100,
        text: "",
        fontSize: 13,
        fontWeight: 500,
        textColor: "rgba(255,255,255,0.9)",
        ...action.payload,
      };
      if (!shape.id) shape.id = uid("s");
      return { ...state, shapes: { ...state.shapes, [shape.id]: shape } };
    }
    case "SHAPE_UPDATE": {
      const { id, ...updates } = action.payload;
      if (!state.shapes[id]) return state;
      return {
        ...state,
        shapes: { ...state.shapes, [id]: { ...state.shapes[id], ...updates } },
      };
    }
    case "SHAPE_DELETE": {
      const newShapes = { ...state.shapes };
      delete newShapes[action.payload.id];
      const newEdges = {};
      for (const [k, e] of Object.entries(state.edges)) {
        if (e.from !== action.payload.id && e.to !== action.payload.id)
          newEdges[k] = e;
      }
      return { ...state, shapes: newShapes, edges: newEdges };
    }
    case "EDGE_ADD": {
      const edge = {
        strokeWidth: 2,
        stroke: "rgba(255,255,255,0.35)",
        arrow: true,
        label: "",
        ...action.payload,
      };
      if (!edge.id) edge.id = uid("e");
      return { ...state, edges: { ...state.edges, [edge.id]: edge } };
    }
    case "EDGE_UPDATE": {
      const { id, ...updates } = action.payload;
      if (!state.edges[id]) return state;
      return {
        ...state,
        edges: { ...state.edges, [id]: { ...state.edges[id], ...updates } },
      };
    }
    case "EDGE_DELETE": {
      const newEdges = { ...state.edges };
      delete newEdges[action.payload.id];
      return { ...state, edges: newEdges };
    }
    case "ANNOTATION_ADD":
      return { ...state, annotations: [...state.annotations, action.payload] };
    case "SET_MODE":
      return { ...state, mode: action.payload };
    case "SIM_ADD": {
      const sim = {
        id: uid("sim"),
        running: false,
        frame: 0,
        ...action.payload,
      };
      return { ...state, simulations: { ...state.simulations, [sim.id]: sim } };
    }
    case "SIM_UPDATE": {
      const { id, ...updates } = action.payload;
      if (!state.simulations[id]) return state;
      return {
        ...state,
        simulations: {
          ...state.simulations,
          [id]: { ...state.simulations[id], ...updates },
        },
      };
    }
    case "GROUP_CREATE": {
      const group = { id: uid("g"), shapeIds: [], ...action.payload };
      return { ...state, groups: { ...state.groups, [group.id]: group } };
    }
    case "LAYOUT_AUTO": {
      const algo = action.payload?.algorithm || "grid";
      const shapes = { ...state.shapes };
      const ids = Object.keys(shapes);
      if (ids.length === 0) return state;
      const pad = action.payload?.padding || 40;
      if (algo === "grid") {
        const cols = Math.ceil(Math.sqrt(ids.length));
        ids.forEach((id, i) => {
          const col = i % cols,
            row = Math.floor(i / cols);
          shapes[id] = {
            ...shapes[id],
            x: 60 + col * (shapes[id].w + pad),
            y: 60 + row * (shapes[id].h + pad),
          };
        });
      } else if (algo === "vertical") {
        let cy = 60;
        ids.forEach((id) => {
          shapes[id] = { ...shapes[id], x: 200, y: cy };
          cy += shapes[id].h + pad;
        });
      } else if (algo === "horizontal") {
        let cx = 60;
        ids.forEach((id) => {
          shapes[id] = { ...shapes[id], x: cx, y: 200 };
          cx += shapes[id].w + pad;
        });
      } else if (algo === "force") {
        const iterations = 50;
        const positions = {};
        ids.forEach((id) => {
          positions[id] = {
            x: shapes[id].x || Math.random() * 600,
            y: shapes[id].y || Math.random() * 400,
          };
        });
        const edgeList = Object.values(state.edges);
        for (let iter = 0; iter < iterations; iter++) {
          ids.forEach((a) => {
            let fx = 0,
              fy = 0;
            ids.forEach((b) => {
              if (a === b) return;
              const dx = positions[a].x - positions[b].x || 0.1;
              const dy = positions[a].y - positions[b].y || 0.1;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const repulse = 8000 / (dist * dist);
              fx += (dx / dist) * repulse;
              fy += (dy / dist) * repulse;
            });
            edgeList.forEach((e) => {
              let other = null;
              if (e.from === a) other = e.to;
              else if (e.to === a) other = e.from;
              if (!other || !positions[other]) return;
              const dx = positions[other].x - positions[a].x;
              const dy = positions[other].y - positions[a].y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const attract = dist * 0.01;
              fx += (dx / dist) * attract;
              fy += (dy / dist) * attract;
            });
            positions[a].x += Math.max(-20, Math.min(20, fx));
            positions[a].y += Math.max(-20, Math.min(20, fy));
          });
        }
        ids.forEach((id) => {
          shapes[id] = {
            ...shapes[id],
            x: Math.max(20, positions[id].x),
            y: Math.max(20, positions[id].y),
          };
        });
      }
      return { ...state, shapes };
    }
    case "CLEAR":
      return { ...INITIAL_BOARD, mode: state.mode };
    case "LOAD":
      return { ...INITIAL_BOARD, ...action.payload };
    default:
      return state;
  }
}

// ─── Shape SVG Renderers ──────────────────────────────

function ShapeRect({ s, selected, onMouseDown }) {
  return (
    <g
      onMouseDown={onMouseDown}
      className={`dw-shape ${selected ? "dw-shape-selected" : ""}`}
    >
      <rect
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        rx={s.radius || 0}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={1.5}
      />
      {s.text && (
        <text
          x={s.x + s.w / 2}
          y={s.y + s.h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={s.textColor}
          fontSize={s.fontSize}
          fontWeight={s.fontWeight}
          className="dw-shape-text"
        >
          {s.text}
        </text>
      )}
      {selected && (
        <rect
          x={s.x - 2}
          y={s.y - 2}
          width={s.w + 4}
          height={s.h + 4}
          rx={(s.radius || 0) + 2}
          fill="none"
          stroke="rgba(80,130,255,0.6)"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      )}
    </g>
  );
}

function ShapeEllipse({ s, selected, onMouseDown }) {
  const cx = s.x + s.w / 2,
    cy = s.y + s.h / 2;
  return (
    <g
      onMouseDown={onMouseDown}
      className={`dw-shape ${selected ? "dw-shape-selected" : ""}`}
    >
      <ellipse
        cx={cx}
        cy={cy}
        rx={s.w / 2}
        ry={s.h / 2}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={1.5}
      />
      {s.text && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={s.textColor}
          fontSize={s.fontSize}
          fontWeight={s.fontWeight}
          className="dw-shape-text"
        >
          {s.text}
        </text>
      )}
      {selected && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={s.w / 2 + 3}
          ry={s.h / 2 + 3}
          fill="none"
          stroke="rgba(80,130,255,0.6)"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      )}
    </g>
  );
}

function ShapeDiamond({ s, selected, onMouseDown }) {
  const cx = s.x + s.w / 2,
    cy = s.y + s.h / 2;
  const points = `${cx},${s.y} ${s.x + s.w},${cy} ${cx},${s.y + s.h} ${s.x},${cy}`;
  return (
    <g
      onMouseDown={onMouseDown}
      className={`dw-shape ${selected ? "dw-shape-selected" : ""}`}
    >
      <polygon
        points={points}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={1.5}
      />
      {s.text && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={s.textColor}
          fontSize={s.fontSize}
          fontWeight={s.fontWeight}
          className="dw-shape-text"
        >
          {s.text}
        </text>
      )}
    </g>
  );
}

function ShapeSticky({ s, selected, onMouseDown }) {
  return (
    <g
      onMouseDown={onMouseDown}
      className={`dw-shape dw-sticky ${selected ? "dw-shape-selected" : ""}`}
    >
      <rect
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        rx={s.radius || 4}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={1}
      />
      <rect
        x={s.x}
        y={s.y}
        width={s.w}
        height={22}
        rx={s.radius || 4}
        fill="rgba(255,200,50,0.15)"
      />
      {s.text && (
        <foreignObject
          x={s.x + 8}
          y={s.y + 26}
          width={s.w - 16}
          height={s.h - 34}
        >
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            className="dw-sticky-text"
            style={{ fontSize: s.fontSize || 12, color: s.textColor }}
          >
            {s.text}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

function ShapeText({ s, selected, onMouseDown }) {
  return (
    <g
      onMouseDown={onMouseDown}
      className={`dw-shape ${selected ? "dw-shape-selected" : ""}`}
    >
      {s.text && (
        <text
          x={s.x}
          y={s.y + (s.fontSize || 14)}
          fill={s.textColor}
          fontSize={s.fontSize || 14}
          fontWeight={s.fontWeight || 400}
          className="dw-shape-text"
        >
          {s.text}
        </text>
      )}
      {selected && (
        <rect
          x={s.x - 4}
          y={s.y - 2}
          width={s.w + 8}
          height={s.h + 4}
          fill="none"
          stroke="rgba(80,130,255,0.4)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}
    </g>
  );
}

function RenderShape({ s, selected, onMouseDown }) {
  const props = { s, selected, onMouseDown };
  switch (s.shape) {
    case "ellipse":
      return <ShapeEllipse {...props} />;
    case "diamond":
      return <ShapeDiamond {...props} />;
    case "sticky":
      return <ShapeSticky {...props} />;
    case "text":
      return <ShapeText {...props} />;
    case "note":
      return <ShapeRect {...props} />;
    case "container":
      return <ShapeRect {...props} />;
    default:
      return <ShapeRect {...props} />;
  }
}

// ─── Edge Renderer ────────────────────────────────────

function getShapeCenter(s) {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

function getEdgePoints(from, to) {
  const fc = getShapeCenter(from);
  const tc = getShapeCenter(to);
  const dx = tc.x - fc.x,
    dy = tc.y - fc.y;
  const angle = Math.atan2(dy, dx);
  const fx = fc.x + Math.cos(angle) * (from.w / 2);
  const fy = fc.y + Math.sin(angle) * (from.h / 2);
  const tx = tc.x - Math.cos(angle) * (to.w / 2);
  const ty = tc.y - Math.sin(angle) * (to.h / 2);
  return { fx, fy, tx, ty };
}

function RenderEdge({ edge, shapes }) {
  const from = shapes[edge.from];
  const to = shapes[edge.to];
  if (!from || !to) return null;
  const { fx, fy, tx, ty } = getEdgePoints(from, to);
  const mid = { x: (fx + tx) / 2, y: (fy + ty) / 2 };
  return (
    <g className="dw-edge">
      <line
        x1={fx}
        y1={fy}
        x2={tx}
        y2={ty}
        stroke={edge.stroke}
        strokeWidth={edge.strokeWidth}
        markerEnd={edge.arrow ? "url(#dw-arrowhead)" : undefined}
      />
      {edge.label && (
        <text
          x={mid.x}
          y={mid.y - 6}
          textAnchor="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize={11}
          className="dw-edge-label"
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

// ─── Chart Renderer (simple bar/line within SVG) ──────

function RenderChart({ annotation }) {
  const { chartType, data, x, y, w, h, title } = annotation;
  if (!data || !data.length) return null;
  const maxVal = Math.max(...data.map((d) => d.value || 0), 1);
  const barW = (w - 40) / data.length;

  if (chartType === "bar") {
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={8}
          fill="rgba(255,255,255,0.03)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
        {title && (
          <text
            x={x + w / 2}
            y={y + 18}
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize={12}
            fontWeight={600}
          >
            {title}
          </text>
        )}
        <line
          x1={x + 30}
          y1={y + h - 25}
          x2={x + w - 10}
          y2={y + h - 25}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const barH = ((d.value || 0) / maxVal) * (h - 55);
          const bx = x + 35 + i * barW + barW * 0.15;
          const bw = barW * 0.7;
          const by = y + h - 25 - barH;
          return (
            <g key={i}>
              <rect
                x={bx}
                y={by}
                width={bw}
                height={barH}
                rx={3}
                fill={d.color || "rgba(80,130,255,0.5)"}
              />
              <text
                x={bx + bw / 2}
                y={y + h - 10}
                textAnchor="middle"
                fill="rgba(255,255,255,0.4)"
                fontSize={9}
              >
                {d.label || ""}
              </text>
              <text
                x={bx + bw / 2}
                y={by - 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.5)"
                fontSize={9}
              >
                {d.value}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  if (chartType === "line") {
    const padding = 35;
    const chartW = w - padding - 10;
    const chartH = h - 55;
    const points = data
      .map((d, i) => {
        const px = x + padding + (i / Math.max(data.length - 1, 1)) * chartW;
        const py = y + h - 25 - ((d.value || 0) / maxVal) * chartH;
        return `${px},${py}`;
      })
      .join(" ");
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={8}
          fill="rgba(255,255,255,0.03)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
        {title && (
          <text
            x={x + w / 2}
            y={y + 18}
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize={12}
            fontWeight={600}
          >
            {title}
          </text>
        )}
        <polyline
          points={points}
          fill="none"
          stroke="rgba(80,130,255,0.7)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const px = x + padding + (i / Math.max(data.length - 1, 1)) * chartW;
          const py = y + h - 25 - ((d.value || 0) / maxVal) * chartH;
          return (
            <circle key={i} cx={px} cy={py} r={3} fill="rgba(80,130,255,0.9)" />
          );
        })}
      </g>
    );
  }

  return null;
}

// ─── Main Widget ──────────────────────────────────────

export default function DrawingWidget({ windowId }) {
  const [board, dispatch] = useReducer(boardReducer, INITIAL_BOARD);
  const [tool, setTool] = useState("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [panning, setPanning] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [playbackIdx, setPlaybackIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sessionName, setSessionName] = useState("Untitled");
  const svgRef = useRef(null);
  const playTimerRef = useRef(null);

  // Record timeline step
  const record = useCallback((action) => {
    setTimeline((prev) => [...prev, { ...action, ts: Date.now() }]);
  }, []);

  // Execute a draw command (from AI or internal)
  const execCommand = useCallback(
    (cmd) => {
      if (!cmd || !cmd.type) return;
      const [category, verb] = cmd.type.split(".");
      const p = cmd.payload || {};

      switch (cmd.type) {
        case "shape.add":
          dispatch({ type: "SHAPE_ADD", payload: p });
          record({ type: "SHAPE_ADD", payload: p });
          break;
        case "shape.update":
          dispatch({ type: "SHAPE_UPDATE", payload: p });
          record({ type: "SHAPE_UPDATE", payload: p });
          break;
        case "shape.delete":
          dispatch({ type: "SHAPE_DELETE", payload: p });
          record({ type: "SHAPE_DELETE", payload: p });
          break;
        case "edge.add":
          dispatch({ type: "EDGE_ADD", payload: p });
          record({ type: "EDGE_ADD", payload: p });
          break;
        case "edge.update":
          dispatch({ type: "EDGE_UPDATE", payload: p });
          record({ type: "EDGE_UPDATE", payload: p });
          break;
        case "edge.delete":
          dispatch({ type: "EDGE_DELETE", payload: p });
          record({ type: "EDGE_DELETE", payload: p });
          break;
        case "board.clear":
          dispatch({ type: "CLEAR" });
          setTimeline([]);
          setSelectedId(null);
          break;
        case "board.setView":
          if (p.zoom) setZoom(p.zoom);
          if (p.pan) setPan(p.pan);
          break;
        case "board.setMode":
          dispatch({ type: "SET_MODE", payload: p.mode || "diagram" });
          break;
        case "chart.create":
          dispatch({
            type: "ANNOTATION_ADD",
            payload: { ...p, id: p.id || uid("c") },
          });
          record({ type: "ANNOTATION_ADD", payload: p });
          break;
        case "annotation.add":
          dispatch({ type: "ANNOTATION_ADD", payload: p });
          record({ type: "ANNOTATION_ADD", payload: p });
          break;
        case "layout.auto":
          dispatch({ type: "LAYOUT_AUTO", payload: p });
          record({ type: "LAYOUT_AUTO", payload: p });
          break;
        case "group.create":
          dispatch({ type: "GROUP_CREATE", payload: p });
          record({ type: "GROUP_CREATE", payload: p });
          break;
        case "sim.create":
          dispatch({ type: "SIM_ADD", payload: p });
          record({ type: "SIM_ADD", payload: p });
          break;
        case "sim.run":
          dispatch({
            type: "SIM_UPDATE",
            payload: { id: p.id, running: true },
          });
          break;
        case "sim.pause":
          dispatch({
            type: "SIM_UPDATE",
            payload: { id: p.id, running: false },
          });
          break;
        case "sim.frame":
          dispatch({ type: "SIM_UPDATE", payload: p });
          record({ type: "SIM_UPDATE", payload: p });
          break;
        default:
          console.warn("[Drawing] Unknown command:", cmd.type);
      }
    },
    [record],
  );

  // Listen for AI draw commands + drain any queued commands on mount
  useEffect(() => {
    const handler = (cmd) => {
      if (Array.isArray(cmd)) {
        cmd.forEach((c, i) => setTimeout(() => execCommand(c), i * 150));
      } else {
        execCommand(cmd);
      }
    };
    eventBus.on("drawing:command", handler);

    // Drain queued commands that arrived before this widget mounted
    if (eventBus._drawingQueue && eventBus._drawingQueue.length > 0) {
      const queued = [...eventBus._drawingQueue];
      eventBus._drawingQueue = [];
      queued.forEach((cmd, qi) => {
        setTimeout(() => handler(cmd), qi * 200);
      });
    }

    return () => eventBus.off("drawing:command", handler);
  }, [execCommand]);

  // ─── Pan & Zoom ─────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(5, Math.max(0.1, z * delta)));
  }, []);

  const svgPoint = useCallback(
    (clientX, clientY) => {
      return { x: (clientX - pan.x) / zoom, y: (clientY - pan.y) / zoom };
    },
    [pan, zoom],
  );

  const handleCanvasMouseDown = useCallback(
    (e) => {
      if (tool === "select" || tool === "pan") {
        setPanning({
          startX: e.clientX,
          startY: e.clientY,
          panX: pan.x,
          panY: pan.y,
        });
        setSelectedId(null);
      } else if (tool !== "select") {
        // Place a new shape
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pt = svgPoint(e.clientX - rect.left, e.clientY - rect.top);
        const shapeType = tool === "arrow" ? null : tool;
        if (shapeType) {
          const defaults = SHAPE_DEFAULTS[shapeType] || SHAPE_DEFAULTS.rect;
          const newShape = {
            id: uid("s"),
            shape: shapeType,
            x: pt.x - defaults.w / 2,
            y: pt.y - defaults.h / 2,
            text: shapeType === "sticky" ? "Note" : "",
          };
          execCommand({ type: "shape.add", payload: newShape });
          setSelectedId(newShape.id);
          setTool("select");
        }
      }
    },
    [tool, pan, zoom, svgPoint, execCommand],
  );

  const handleCanvasMouseMove = useCallback(
    (e) => {
      if (panning) {
        setPan({
          x: panning.panX + (e.clientX - panning.startX),
          y: panning.panY + (e.clientY - panning.startY),
        });
      }
      if (dragging) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pt = svgPoint(e.clientX - rect.left, e.clientY - rect.top);
        dispatch({
          type: "SHAPE_UPDATE",
          payload: {
            id: dragging.id,
            x: pt.x - dragging.offX,
            y: pt.y - dragging.offY,
          },
        });
      }
    },
    [panning, dragging, svgPoint],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setPanning(null);
    if (dragging) {
      const s = board.shapes[dragging.id];
      if (s)
        record({ type: "SHAPE_UPDATE", payload: { id: s.id, x: s.x, y: s.y } });
    }
    setDragging(null);
  }, [dragging, board.shapes, record]);

  const handleShapeMouseDown = useCallback(
    (e, shapeId) => {
      e.stopPropagation();
      if (tool !== "select") return;
      setSelectedId(shapeId);
      const s = board.shapes[shapeId];
      if (!s) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pt = svgPoint(e.clientX - rect.left, e.clientY - rect.top);
      setDragging({ id: shapeId, offX: pt.x - s.x, offY: pt.y - s.y });
    },
    [tool, board.shapes, svgPoint],
  );

  // ─── Delete selected ───────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId &&
        !e.target.closest("input,textarea")
      ) {
        dispatch({ type: "SHAPE_DELETE", payload: { id: selectedId } });
        record({ type: "SHAPE_DELETE", payload: { id: selectedId } });
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, record]);

  // ─── Playback ───────────────────────────────────────
  const playStep = useCallback(() => {
    setPlaybackIdx((prev) => {
      const next = prev + 1;
      if (next >= timeline.length) {
        setIsPlaying(false);
        return prev;
      }
      const step = timeline[next];
      dispatch(step);
      return next;
    });
  }, [timeline]);

  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(playStep, 400);
    } else {
      clearInterval(playTimerRef.current);
    }
    return () => clearInterval(playTimerRef.current);
  }, [isPlaying, playStep]);

  const startPlayback = () => {
    dispatch({ type: "CLEAR" });
    setPlaybackIdx(-1);
    setIsPlaying(true);
  };

  // ─── Export ─────────────────────────────────────────
  const exportSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionName || "drawing"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    const img = new window.Image();
    img.onload = () => {
      ctx.fillStyle = "#111114";
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.drawImage(img, 0, 0, 1920, 1080);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sessionName || "drawing"}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svgData)));
  };

  // ─── Save/Load Session ──────────────────────────────
  const saveSession = () => {
    const session = { name: sessionName, board, timeline, savedAt: Date.now() };
    const key = `onios_drawing_${sessionName.replace(/\s+/g, "_")}`;
    localStorage.setItem(key, JSON.stringify(session));
    eventBus.emit(
      "command:execute",
      `notification.show("Session saved: ${sessionName}")`,
    );
  };

  const loadSession = () => {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("onios_drawing_"),
    );
    if (keys.length === 0) return;
    const latest = keys.sort().pop();
    try {
      const session = JSON.parse(localStorage.getItem(latest));
      if (session?.board) {
        dispatch({ type: "LOAD", payload: session.board });
        setTimeline(session.timeline || []);
        setSessionName(session.name || "Untitled");
      }
    } catch {
      /* ignore */
    }
  };

  // ─── Session Booklet Export (.oni-board JSON) ──────
  const exportBooklet = () => {
    const booklet = {
      version: 1,
      format: "oni-board",
      name: sessionName,
      savedAt: Date.now(),
      board: {
        shapes: board.shapes,
        edges: board.edges,
        groups: board.groups,
        annotations: board.annotations,
        mode: board.mode,
      },
      timeline,
      metadata: {
        shapeCount: Object.keys(board.shapes).length,
        edgeCount: Object.keys(board.edges).length,
        stepCount: timeline.length,
      },
    };
    const blob = new Blob([JSON.stringify(booklet, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionName || "drawing"}.oni-board.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Auto Layout ──────────────────────────────────
  const [layoutMenu, setLayoutMenu] = useState(false);
  const applyLayout = (algo) => {
    execCommand({ type: "layout.auto", payload: { algorithm: algo } });
    setLayoutMenu(false);
  };

  // ─── Simulation Tick ──────────────────────────────
  const simTimerRef = useRef(null);
  useEffect(() => {
    const runningSims = Object.values(board.simulations).filter(
      (s) => s.running,
    );
    if (runningSims.length > 0) {
      simTimerRef.current = setInterval(() => {
        runningSims.forEach((sim) => {
          const nextFrame = (sim.frame || 0) + 1;
          if (sim.simType === "projectile" && sim.params) {
            const t = nextFrame * 0.05;
            const vx = sim.params.vx || 50;
            const vy = sim.params.vy || -80;
            const g = sim.params.g || 9.8;
            const sx = (sim.params.startX || 100) + vx * t;
            const sy = (sim.params.startY || 400) + vy * t + 0.5 * g * t * t;
            if (sy > (sim.params.groundY || 500)) {
              dispatch({
                type: "SIM_UPDATE",
                payload: { id: sim.id, running: false },
              });
            } else if (sim.shapeId) {
              dispatch({
                type: "SHAPE_UPDATE",
                payload: { id: sim.shapeId, x: sx, y: sy },
              });
              dispatch({
                type: "SIM_UPDATE",
                payload: { id: sim.id, frame: nextFrame },
              });
            }
          } else if (sim.simType === "travel" && sim.params) {
            const total = sim.params.totalFrames || 200;
            const progress = Math.min(nextFrame / total, 1);
            if (sim.shapeId) {
              const sx =
                (sim.params.startX || 100) +
                ((sim.params.endX || 700) - (sim.params.startX || 100)) *
                  progress;
              const sy =
                (sim.params.startY || 250) +
                ((sim.params.endY || 250) - (sim.params.startY || 250)) *
                  progress;
              dispatch({
                type: "SHAPE_UPDATE",
                payload: { id: sim.shapeId, x: sx, y: sy },
              });
            }
            if (progress >= 1) {
              dispatch({
                type: "SIM_UPDATE",
                payload: { id: sim.id, running: false },
              });
            } else {
              dispatch({
                type: "SIM_UPDATE",
                payload: { id: sim.id, frame: nextFrame },
              });
            }
          } else {
            dispatch({
              type: "SIM_UPDATE",
              payload: { id: sim.id, frame: nextFrame },
            });
          }
        });
      }, 30);
    } else {
      clearInterval(simTimerRef.current);
    }
    return () => clearInterval(simTimerRef.current);
  }, [board.simulations]);

  // ─── Toolbar ────────────────────────────────────────
  const tools = [
    { id: "select", icon: <MousePointer2 size={15} />, label: "Select" },
    { id: "rect", icon: <Square size={15} />, label: "Rectangle" },
    { id: "ellipse", icon: <Circle size={15} />, label: "Ellipse" },
    {
      id: "diamond",
      icon: (
        <span style={{ transform: "rotate(45deg)", display: "inline-block" }}>
          <Square size={13} />
        </span>
      ),
      label: "Diamond",
    },
    { id: "text", icon: <Type size={15} />, label: "Text" },
    { id: "sticky", icon: <StickyNote size={15} />, label: "Sticky Note" },
    { id: "pan", icon: <Move size={15} />, label: "Pan" },
  ];

  const shapeCount = Object.keys(board.shapes).length;
  const edgeCount = Object.keys(board.edges).length;

  return (
    <div className="dw-widget">
      {/* ─── Top Toolbar ─── */}
      <div className="dw-toolbar">
        <div className="dw-tool-group">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`dw-tool-btn ${tool === t.id ? "dw-tool-active" : ""}`}
              onClick={() => setTool(t.id)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="dw-toolbar-sep" />
        <div className="dw-tool-group">
          <button
            className="dw-tool-btn"
            onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
            title="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
          <span className="dw-zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            className="dw-tool-btn"
            onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))}
            title="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            className="dw-tool-btn"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Reset view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="dw-toolbar-sep" />
        <div className="dw-tool-group">
          <button
            className="dw-tool-btn"
            onClick={() => execCommand({ type: "board.clear" })}
            title="Clear board"
          >
            <Trash2 size={14} />
          </button>
          <button
            className="dw-tool-btn"
            onClick={saveSession}
            title="Save session"
          >
            <Save size={14} />
          </button>
          <button
            className="dw-tool-btn"
            onClick={exportSVG}
            title="Export SVG"
          >
            <Download size={14} />
          </button>
          <button
            className="dw-tool-btn"
            onClick={exportPNG}
            title="Export PNG"
          >
            <ImageIcon size={14} />
          </button>
          <button
            className="dw-tool-btn"
            onClick={exportBooklet}
            title="Export session booklet (.oni-board)"
          >
            <FileArchive size={14} />
          </button>
          <button
            className="dw-tool-btn"
            onClick={loadSession}
            title="Load session"
          >
            <FolderOpen size={14} />
          </button>
        </div>
        <div className="dw-toolbar-sep" />
        <div className="dw-tool-group" style={{ position: "relative" }}>
          <button
            className="dw-tool-btn"
            onClick={() => setLayoutMenu(!layoutMenu)}
            title="Auto Layout"
          >
            <LayoutGrid size={14} />
          </button>
          {layoutMenu && (
            <div className="dw-layout-menu">
              <button onClick={() => applyLayout("grid")}>Grid</button>
              <button onClick={() => applyLayout("vertical")}>Vertical</button>
              <button onClick={() => applyLayout("horizontal")}>
                Horizontal
              </button>
              <button onClick={() => applyLayout("force")}>Force</button>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div className="dw-mode-badge">{board.mode}</div>
        <span className="dw-info-label">
          {shapeCount} shapes · {edgeCount} edges
        </span>
      </div>

      {/* ─── SVG Canvas ─── */}
      <div
        className="dw-canvas-wrap"
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        <svg
          ref={svgRef}
          className="dw-canvas"
          viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${960 / zoom} ${540 / zoom}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="dw-arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
              fill="rgba(255,255,255,0.4)"
            >
              <polygon points="0 0, 10 3.5, 0 7" />
            </marker>
            <pattern
              id="dw-grid"
              width={GRID}
              height={GRID}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={GRID / 2}
                cy={GRID / 2}
                r={0.5}
                fill="rgba(255,255,255,0.06)"
              />
            </pattern>
          </defs>
          <rect
            x={-5000}
            y={-5000}
            width={10000}
            height={10000}
            fill="url(#dw-grid)"
          />

          {/* Edges */}
          {Object.values(board.edges).map((edge) => (
            <RenderEdge key={edge.id} edge={edge} shapes={board.shapes} />
          ))}

          {/* Shapes */}
          {Object.values(board.shapes).map((s) => (
            <RenderShape
              key={s.id}
              s={s}
              selected={selectedId === s.id}
              onMouseDown={(e) => handleShapeMouseDown(e, s.id)}
            />
          ))}

          {/* Annotations (charts, etc.) */}
          {board.annotations.map((ann, i) =>
            ann.chartType ? (
              <RenderChart key={ann.id || i} annotation={ann} />
            ) : null,
          )}
        </svg>
      </div>

      {/* ─── Timeline Bar ─── */}
      {timeline.length > 0 && (
        <div className="dw-timeline">
          <button
            className="dw-tl-btn"
            onClick={startPlayback}
            title="Replay from start"
          >
            <SkipBack size={13} />
          </button>
          <button
            className="dw-tl-btn"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <div className="dw-tl-track">
            <div
              className="dw-tl-fill"
              style={{
                width: `${timeline.length > 0 ? ((playbackIdx + 1) / timeline.length) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="dw-tl-label">
            {playbackIdx + 1} / {timeline.length} steps
          </span>
        </div>
      )}
    </div>
  );
}
