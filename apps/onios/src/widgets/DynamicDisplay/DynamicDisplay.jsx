/**
 * DynamicDisplay — Universal JSON renderer widget.
 *
 * Renders structured JSON as rich, interactive content:
 * hero banners, stat cards, card grids, tables, lists, images,
 * videos, galleries, embeds, markdown text, progress bars, quotes,
 * code blocks, key-value pairs, timelines, alerts, weather, charts.
 *
 * Features:
 * - Clickable cards/gallery items with expanded detail overlay
 * - Image loading states with graceful fallbacks
 * - Frosted glass OS-native design
 * - Multiple instances can be open simultaneously
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Loader2,
  ExternalLink,
  RefreshCw,
  X,
  ChevronRight,
  ImageOff,
  Copy,
  Check,
} from "lucide-react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import diff from "highlight.js/lib/languages/diff";
import markdown from "highlight.js/lib/languages/markdown";
import graphql from "highlight.js/lib/languages/graphql";
import nginx from "highlight.js/lib/languages/nginx";
import "./DynamicDisplay.css";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("graphql", graphql);
hljs.registerLanguage("gql", graphql);
hljs.registerLanguage("nginx", nginx);

// ─── Helpers ──────────────────────────────────────────

function Img({ src, alt, className, style, onClick }) {
  const [status, setStatus] = useState("loading");
  return (
    <div
      className={`dd-img-wrap ${className || ""}`}
      style={style}
      onClick={onClick}
    >
      {status === "loading" && (
        <div className="dd-img-placeholder">
          <Loader2 size={16} className="dd-spin" />
        </div>
      )}
      {status === "error" && (
        <div className="dd-img-placeholder">
          <ImageOff size={18} strokeWidth={1.5} />
          <span>No image</span>
        </div>
      )}
      <img
        src={src}
        alt={alt || ""}
        className={status === "loading" ? "dd-img-hidden" : "dd-img-visible"}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        draggable={false}
      />
    </div>
  );
}

// ─── Detail Overlay ───────────────────────────────────

function DetailOverlay({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="dd-overlay" onClick={onClose}>
      <div className="dd-detail" onClick={(e) => e.stopPropagation()}>
        <button className="dd-detail-close" onClick={onClose}>
          <X size={16} />
        </button>
        {item.image && (
          <Img src={item.image} alt={item.title} className="dd-detail-img" />
        )}
        <div className="dd-detail-body">
          {item.title && <h2 className="dd-detail-title">{item.title}</h2>}
          {item.subtitle && (
            <p className="dd-detail-subtitle">{item.subtitle}</p>
          )}
          {item.price && <div className="dd-detail-price">{item.price}</div>}
          {item.value && !item.price && (
            <div className="dd-detail-price">{item.value}</div>
          )}
          {item.description && (
            <p className="dd-detail-desc">{item.description}</p>
          )}
          {item.tags && (
            <div className="dd-card-tags">
              {item.tags.map((t, j) => (
                <span key={j} className="dd-tag">
                  {t}
                </span>
              ))}
            </div>
          )}
          {item.details && (
            <div className="dd-detail-extra">
              {Object.entries(item.details).map(([k, v]) => (
                <div key={k} className="dd-kv-row">
                  <span className="dd-kv-key">{k}</span>
                  <span className="dd-kv-value">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
          {item.link && (
            <a
              className="dd-detail-link"
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Link <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section Renderers ────────────────────────────────

function HeroSection({ data }) {
  const style = {};
  if (data.background) {
    style.background = data.background.startsWith("http")
      ? `url(${data.background}) center/cover`
      : data.background;
  }
  if (data.image && !data.background) {
    style.background = `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url(${data.image}) center/cover`;
  }
  return (
    <div className="dd-hero" style={style}>
      {data.icon && <span className="dd-hero-icon">{data.icon}</span>}
      {data.title && <h1 className="dd-hero-title">{data.title}</h1>}
      {data.subtitle && <p className="dd-hero-subtitle">{data.subtitle}</p>}
      {data.description && <p className="dd-hero-desc">{data.description}</p>}
    </div>
  );
}

function StatsSection({ data }) {
  const items = data.items || [];
  return (
    <div className="dd-stats">
      {items.map((item, i) => (
        <div key={i} className="dd-stat">
          {item.icon && <span className="dd-stat-icon">{item.icon}</span>}
          <div
            className="dd-stat-value"
            style={item.color ? { color: item.color } : undefined}
          >
            {item.value}
          </div>
          <div className="dd-stat-label">{item.label}</div>
          {item.change && (
            <div
              className={`dd-stat-change ${item.change.startsWith("+") || item.change.startsWith("↑") ? "positive" : "negative"}`}
            >
              {item.change}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CardsSection({ data, onSelect }) {
  const items = data.items || [];
  const cols =
    data.columns ||
    (items.length <= 2 ? items.length : items.length <= 4 ? 2 : 3);
  return (
    <div
      className="dd-cards"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {items.map((card, i) => (
        <div
          key={i}
          className={`dd-card ${card.image || card.description || card.details ? "dd-card-clickable" : ""}`}
          onClick={() =>
            (card.image || card.description || card.details) && onSelect(card)
          }
        >
          {card.image && (
            <Img src={card.image} alt={card.title} className="dd-card-img" />
          )}
          <div className="dd-card-body">
            {card.icon && <span className="dd-card-icon">{card.icon}</span>}
            {card.title && <div className="dd-card-title">{card.title}</div>}
            {card.subtitle && (
              <div className="dd-card-subtitle">{card.subtitle}</div>
            )}
            {card.description && (
              <div className="dd-card-desc">{card.description}</div>
            )}
            {card.tags && (
              <div className="dd-card-tags">
                {card.tags.map((t, j) => (
                  <span key={j} className="dd-tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {card.value && <div className="dd-card-value">{card.value}</div>}
            {card.price && <div className="dd-card-price">{card.price}</div>}
            {card.link && !card.details && (
              <a
                className="dd-card-link"
                href={card.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                View <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSection({ data }) {
  const headers = data.headers || [];
  const rows = data.rows || [];
  return (
    <div className="dd-table-wrap">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      <table className="dd-table">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {(Array.isArray(row) ? row : Object.values(row)).map(
                (cell, j) => (
                  <td key={j}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSection({ data, onSelect }) {
  const items = data.items || [];
  const ordered = data.ordered || data.type === "ordered_list";
  return (
    <div className="dd-list">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {items.map((item, i) => {
        const title = item.title || item.label;
        const desc = item.description || item.text || item.details;
        const hasDetail = item.details && typeof item.details === "object";
        return (
          <div
            key={i}
            className={`dd-list-item ${hasDetail ? "dd-list-clickable" : ""}`}
            onClick={() => hasDetail && onSelect(item)}
          >
            {ordered && <span className="dd-list-num">{i + 1}</span>}
            {item.icon && !ordered && (
              <span className="dd-list-icon">{item.icon}</span>
            )}
            {item.image && (
              <Img src={item.image} alt={title} className="dd-list-img" />
            )}
            <div className="dd-list-content">
              {title && <div className="dd-list-title">{title}</div>}
              {desc && <div className="dd-list-desc">{desc}</div>}
              {item.meta && <div className="dd-list-meta">{item.meta}</div>}
            </div>
            {item.value && <div className="dd-list-value">{item.value}</div>}
            {item.badge && <span className="dd-list-badge">{item.badge}</span>}
            {hasDetail && (
              <ChevronRight size={14} className="dd-list-chevron" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TextSection({ data }) {
  const html = (data.content || "")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");
  return (
    <div className="dd-text">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function ImageSection({ data, onSelect }) {
  return (
    <div
      className="dd-image"
      onClick={() =>
        onSelect && onSelect({ image: data.src, title: data.caption })
      }
    >
      <Img
        src={data.src}
        alt={data.caption}
        style={data.width ? { maxWidth: data.width } : undefined}
      />
      {data.caption && <div className="dd-image-caption">{data.caption}</div>}
    </div>
  );
}

function VideoSection({ data }) {
  if (data.youtube || (data.src && data.src.includes("youtube"))) {
    const vid = data.youtube || data.src;
    const embedUrl = vid.includes("embed")
      ? vid
      : `https://www.youtube.com/embed/${vid.split("v=").pop().split("&")[0]}`;
    return (
      <div className="dd-video">
        <iframe
          src={embedUrl}
          title={data.caption || "Video"}
          style={{
            width: "100%",
            height: 220,
            border: "none",
            borderRadius: 10,
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {data.caption && <div className="dd-video-caption">{data.caption}</div>}
      </div>
    );
  }
  return (
    <div className="dd-video">
      <video
        src={data.src}
        poster={data.poster}
        controls
        style={data.width ? { width: data.width } : undefined}
      />
      {data.caption && <div className="dd-video-caption">{data.caption}</div>}
    </div>
  );
}

function GallerySection({ data, onSelect }) {
  const images = data.images || data.items || [];
  const cols =
    data.columns ||
    (images.length <= 2 ? images.length : images.length <= 4 ? 2 : 3);
  return (
    <div
      className="dd-gallery"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {images.map((img, i) => {
        const src =
          typeof img === "string" ? img : img.src || img.url || img.image;
        const caption =
          typeof img === "string" ? null : img.caption || img.title;
        const item =
          typeof img === "string" ? { image: img } : { ...img, image: src };
        return (
          <div
            key={i}
            className="dd-gallery-item"
            onClick={() => onSelect(item)}
          >
            <Img src={src} alt={caption} />
            {caption && <div className="dd-gallery-caption">{caption}</div>}
          </div>
        );
      })}
    </div>
  );
}

function EmbedSection({ data }) {
  return (
    <div className="dd-embed">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      <iframe
        src={data.url || data.src}
        title={data.title || "Embed"}
        style={{
          width: "100%",
          height: data.height || 400,
          border: "none",
          borderRadius: 10,
        }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}

function ProgressSection({ data }) {
  const items = data.items || [
    { label: data.label, value: data.value, max: data.max },
  ];
  return (
    <div className="dd-progress-section">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {items.map((item, i) => {
        const pct = Math.min(
          100,
          Math.max(0, ((item.value || 0) / (item.max || 100)) * 100),
        );
        return (
          <div key={i} className="dd-progress">
            <div className="dd-progress-header">
              <span>{item.label}</span>
              <span>
                {item.value}
                {item.unit || ""} / {item.max}
                {item.unit || ""}
              </span>
            </div>
            <div className="dd-progress-bar">
              <div
                className="dd-progress-fill"
                style={{
                  width: `${pct}%`,
                  background: item.color || undefined,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuoteSection({ data }) {
  return (
    <blockquote className="dd-quote">
      <div className="dd-quote-text">{data.text || data.content}</div>
      {data.author && <div className="dd-quote-author">— {data.author}</div>}
    </blockquote>
  );
}

function CodeSection({ data }) {
  const [copied, setCopied] = useState(false);
  const code = data.code || data.content || "";
  const lang = (data.language || "").toLowerCase();

  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      const auto = hljs.highlightAuto(code);
      if (auto.relevance > 4) return auto.value;
    } catch {}
    return null;
  }, [code, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <div className="dd-code">
      {(data.title || lang) && (
        <div className="dd-code-header">
          <span>{data.title || lang}</span>
          <div className="dd-code-header-right">
            {data.title && lang && <span className="dd-code-lang">{lang}</span>}
            <button className="dd-code-copy" onClick={handleCopy} title="Copy">
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}
      <pre className="dd-code-block">
        {highlighted ? (
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

function KeyValueSection({ data }) {
  const items = data.items || [];
  return (
    <div className="dd-kv">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {items.map((item, i) => (
        <div key={i} className="dd-kv-row">
          <span className="dd-kv-key">{item.key || item.label}</span>
          <span
            className="dd-kv-value"
            style={item.color ? { color: item.color } : undefined}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function TimelineSection({ data }) {
  const items = data.items || [];
  return (
    <div className="dd-timeline">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {items.map((item, i) => (
        <div key={i} className="dd-timeline-item">
          <div
            className="dd-timeline-dot"
            style={item.color ? { background: item.color } : undefined}
          />
          <div className="dd-timeline-content">
            {item.time && <div className="dd-timeline-time">{item.time}</div>}
            {item.title && (
              <div className="dd-timeline-title">{item.title}</div>
            )}
            {item.description && (
              <div className="dd-timeline-desc">{item.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertSection({ data }) {
  const typeClass = data.variant || data.level || "info";
  return (
    <div className={`dd-alert dd-alert-${typeClass}`}>
      {data.icon && <span className="dd-alert-icon">{data.icon}</span>}
      <div>
        {data.title && <div className="dd-alert-title">{data.title}</div>}
        <div className="dd-alert-text">
          {data.text || data.content || data.message}
        </div>
      </div>
    </div>
  );
}

function WeatherSection({ data }) {
  const items = data.items || data.days || [];
  return (
    <div className="dd-weather">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {data.current && (
        <div className="dd-weather-current">
          <span className="dd-weather-icon">{data.current.icon || "🌤"}</span>
          <div className="dd-weather-info">
            <span className="dd-weather-temp">{data.current.temp}</span>
            <span className="dd-weather-desc">{data.current.description}</span>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className="dd-weather-forecast">
          {items.map((day, i) => (
            <div key={i} className="dd-weather-day">
              <div className="dd-weather-day-name">{day.day || day.date}</div>
              <div className="dd-weather-day-icon">{day.icon || "☀️"}</div>
              <div className="dd-weather-day-temp">{day.high || day.temp}</div>
              {day.low && <div className="dd-weather-day-low">{day.low}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartSection({ data }) {
  const items = data.items || [];
  const maxVal = Math.max(...items.map((i) => Number(i.value) || 0), 1);
  return (
    <div className="dd-chart">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      <div className="dd-chart-bars">
        {items.map((item, i) => (
          <div key={i} className="dd-chart-bar-group">
            <div className="dd-chart-value">{item.value}</div>
            <div className="dd-chart-bar-wrap">
              <div
                className="dd-chart-bar"
                style={{
                  height: `${(Number(item.value) / maxVal) * 100}%`,
                  background: item.color || undefined,
                }}
              />
            </div>
            <div className="dd-chart-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DividerSection({ data }) {
  return (
    <hr className="dd-divider" style={data?.label ? undefined : undefined} />
  );
}

// ─── Section Router ───────────────────────────────────

function RenderSection({ section, onSelect }) {
  switch (section.type) {
    case "hero":
      return <HeroSection data={section} />;
    case "stats":
      return <StatsSection data={section} />;
    case "cards":
      return <CardsSection data={section} onSelect={onSelect} />;
    case "table":
      return <TableSection data={section} />;
    case "list":
    case "ordered_list":
      return <ListSection data={section} onSelect={onSelect} />;
    case "text":
      return <TextSection data={section} />;
    case "image":
      return <ImageSection data={section} onSelect={onSelect} />;
    case "video":
      return <VideoSection data={section} />;
    case "gallery":
      return <GallerySection data={section} onSelect={onSelect} />;
    case "embed":
      return <EmbedSection data={section} />;
    case "progress":
      return <ProgressSection data={section} />;
    case "quote":
      return <QuoteSection data={section} />;
    case "code":
      return <CodeSection data={section} />;
    case "kv":
    case "key_value":
      return <KeyValueSection data={section} />;
    case "timeline":
      return <TimelineSection data={section} />;
    case "alert":
      return <AlertSection data={section} />;
    case "weather":
      return <WeatherSection data={section} />;
    case "chart":
    case "bar_chart":
      return <ChartSection data={section} />;
    case "divider":
      return <DividerSection data={section} />;
    default:
      return (
        <div className="dd-unknown">Unknown section type: {section.type}</div>
      );
  }
}

// ─── Main Widget ──────────────────────────────────────

export default function DynamicDisplay({ windowId, displayId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!displayId) {
      setError("No display ID provided");
      setLoading(false);
      return;
    }
    loadData();
  }, [displayId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/oni/display/${displayId}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleSelect = useCallback((item) => setSelected(item), []);
  const handleClose = useCallback(() => setSelected(null), []);

  if (loading) {
    return (
      <div className="dd-widget dd-loading">
        <Loader2 size={20} className="dd-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dd-widget dd-error">
        <div style={{ fontSize: 13, marginBottom: 8 }}>{error}</div>
        <button className="dd-retry" onClick={loadData}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  if (!data || !data.sections) {
    return <div className="dd-widget dd-empty">No content</div>;
  }

  return (
    <div className="dd-widget" ref={containerRef}>
      <div className="dd-content">
        {data.sections.map((section, i) => (
          <RenderSection key={i} section={section} onSelect={handleSelect} />
        ))}
      </div>
      {data.footer && <div className="dd-footer">{data.footer}</div>}
      {selected && <DetailOverlay item={selected} onClose={handleClose} />}
    </div>
  );
}
