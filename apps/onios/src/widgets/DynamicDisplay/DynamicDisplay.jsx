/**
 * DynamicDisplay — Universal JSON renderer widget.
 *
 * Takes structured JSON data and renders it as rich content:
 * hero banners, stat cards, card grids, tables, lists, images,
 * videos, galleries, embeds, markdown text, progress bars, quotes,
 * code blocks, key-value pairs, timelines, and more.
 *
 * The AI sends JSON to /api/oni/actions/display → server stores it
 * with an ID → this widget opens and fetches the data by ID.
 *
 * Multiple instances can be open simultaneously with different data.
 */

import React, { useState, useEffect, useRef } from "react";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import "./DynamicDisplay.css";

// ─── Section Renderers ────────────────────────────────

function HeroSection({ data }) {
  const style = {};
  if (data.background) {
    style.background = data.background.startsWith("http")
      ? `url(${data.background}) center/cover`
      : data.background;
  }
  if (data.image && !data.background) {
    style.background = `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.7)), url(${data.image}) center/cover`;
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
        <div key={i} className="dd-stat" style={item.color ? { borderColor: item.color } : undefined}>
          {item.icon && <span className="dd-stat-icon">{item.icon}</span>}
          <div className="dd-stat-value" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </div>
          <div className="dd-stat-label">{item.label}</div>
          {item.change && (
            <div className={`dd-stat-change ${item.change.startsWith("+") || item.change.startsWith("↑") ? "positive" : "negative"}`}>
              {item.change}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CardsSection({ data }) {
  const items = data.items || [];
  const cols = data.columns || 3;
  return (
    <div className="dd-cards" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((card, i) => (
        <div key={i} className="dd-card" style={card.background ? { background: card.background } : undefined}>
          {card.image && (
            <div className="dd-card-img" style={{ backgroundImage: `url(${card.image})` }}>
              {card.badge && <span className="dd-card-badge">{card.badge}</span>}
            </div>
          )}
          <div className="dd-card-body">
            {card.icon && <span className="dd-card-icon">{card.icon}</span>}
            {card.title && <div className="dd-card-title">{card.title}</div>}
            {card.subtitle && <div className="dd-card-subtitle">{card.subtitle}</div>}
            {card.description && <div className="dd-card-desc">{card.description}</div>}
            {card.tags && (
              <div className="dd-card-tags">
                {card.tags.map((t, j) => <span key={j} className="dd-tag">{t}</span>)}
              </div>
            )}
            {card.value && <div className="dd-card-value">{card.value}</div>}
            {card.link && (
              <a className="dd-card-link" href={card.link} target="_blank" rel="noopener noreferrer">
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
            <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {(Array.isArray(row) ? row : Object.values(row)).map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSection({ data }) {
  const items = data.items || [];
  return (
    <div className="dd-list">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {items.map((item, i) => (
        <div key={i} className="dd-list-item">
          {item.icon && <span className="dd-list-icon">{item.icon}</span>}
          {item.image && <img className="dd-list-img" src={item.image} alt="" />}
          <div className="dd-list-content">
            {item.title && <div className="dd-list-title">{item.title}</div>}
            {item.description && <div className="dd-list-desc">{item.description}</div>}
            {item.meta && <div className="dd-list-meta">{item.meta}</div>}
          </div>
          {item.value && <div className="dd-list-value">{item.value}</div>}
          {item.badge && <span className="dd-list-badge">{item.badge}</span>}
        </div>
      ))}
    </div>
  );
}

function TextSection({ data }) {
  // Simple markdown-ish rendering
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

function ImageSection({ data }) {
  return (
    <div className="dd-image">
      <img src={data.src} alt={data.caption || ""} style={data.width ? { width: data.width } : undefined} />
      {data.caption && <div className="dd-image-caption">{data.caption}</div>}
    </div>
  );
}

function VideoSection({ data }) {
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

function GallerySection({ data }) {
  const images = data.images || [];
  const cols = data.columns || 3;
  return (
    <div className="dd-gallery" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {images.map((img, i) => (
        <div key={i} className="dd-gallery-item">
          <img src={typeof img === "string" ? img : img.src} alt={img.caption || ""} />
          {img.caption && <div className="dd-gallery-caption">{img.caption}</div>}
        </div>
      ))}
    </div>
  );
}

function EmbedSection({ data }) {
  return (
    <div className="dd-embed">
      <iframe
        src={data.url}
        title={data.title || "Embed"}
        style={{ width: "100%", height: data.height || 400, border: "none", borderRadius: 8 }}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}

function ProgressSection({ data }) {
  const items = data.items || [{ label: data.label, value: data.value, max: data.max }];
  return (
    <div className="dd-progress-section">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {items.map((item, i) => {
        const pct = Math.min(100, Math.max(0, ((item.value || 0) / (item.max || 100)) * 100));
        return (
          <div key={i} className="dd-progress">
            <div className="dd-progress-header">
              <span>{item.label}</span>
              <span>{item.value}{item.unit || ""} / {item.max}{item.unit || ""}</span>
            </div>
            <div className="dd-progress-bar">
              <div className="dd-progress-fill" style={{ width: `${pct}%`, background: item.color || undefined }} />
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
  return (
    <div className="dd-code">
      {data.title && <div className="dd-code-header">{data.title}{data.language && <span className="dd-code-lang">{data.language}</span>}</div>}
      <pre className="dd-code-block"><code>{data.code || data.content}</code></pre>
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
          <span className="dd-kv-value">{item.value}</span>
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
          <div className="dd-timeline-dot" style={item.color ? { background: item.color } : undefined} />
          <div className="dd-timeline-content">
            {item.time && <div className="dd-timeline-time">{item.time}</div>}
            {item.title && <div className="dd-timeline-title">{item.title}</div>}
            {item.description && <div className="dd-timeline-desc">{item.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertSection({ data }) {
  const typeClass = data.variant || data.type || "info"; // info, warning, error, success
  return (
    <div className={`dd-alert dd-alert-${typeClass}`}>
      {data.icon && <span className="dd-alert-icon">{data.icon}</span>}
      <div>
        {data.title && <div className="dd-alert-title">{data.title}</div>}
        <div className="dd-alert-text">{data.text || data.content || data.message}</div>
      </div>
    </div>
  );
}

function WeatherSection({ data }) {
  // Specialized weather rendering with dynamic backgrounds
  const items = data.items || data.days || [];
  return (
    <div className="dd-weather">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {data.current && (
        <div className="dd-weather-current">
          <span className="dd-weather-icon">{data.current.icon || "🌤"}</span>
          <span className="dd-weather-temp">{data.current.temp}</span>
          <span className="dd-weather-desc">{data.current.description}</span>
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
  // Simple bar chart using CSS
  const items = data.items || [];
  const maxVal = Math.max(...items.map((i) => Number(i.value) || 0), 1);
  return (
    <div className="dd-chart">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      <div className="dd-chart-bars">
        {items.map((item, i) => (
          <div key={i} className="dd-chart-bar-group">
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
            <div className="dd-chart-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DividerSection() {
  return <hr className="dd-divider" />;
}

// ─── Section Router ───────────────────────────────────

function RenderSection({ section }) {
  switch (section.type) {
    case "hero": return <HeroSection data={section} />;
    case "stats": return <StatsSection data={section} />;
    case "cards": return <CardsSection data={section} />;
    case "table": return <TableSection data={section} />;
    case "list": return <ListSection data={section} />;
    case "text": return <TextSection data={section} />;
    case "image": return <ImageSection data={section} />;
    case "video": return <VideoSection data={section} />;
    case "gallery": return <GallerySection data={section} />;
    case "embed": return <EmbedSection data={section} />;
    case "progress": return <ProgressSection data={section} />;
    case "quote": return <QuoteSection data={section} />;
    case "code": return <CodeSection data={section} />;
    case "kv": case "key_value": return <KeyValueSection data={section} />;
    case "timeline": return <TimelineSection data={section} />;
    case "alert": return <AlertSection data={section} />;
    case "weather": return <WeatherSection data={section} />;
    case "chart": case "bar_chart": return <ChartSection data={section} />;
    case "divider": return <DividerSection />;
    default:
      return <div className="dd-unknown">Unknown section type: {section.type}</div>;
  }
}

// ─── Main Widget ──────────────────────────────────────

export default function DynamicDisplay({ windowId, displayId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      if (!res.ok) {throw new Error(`Failed to load display data (${res.status})`);}
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="dd-widget dd-loading">
        <Loader2 size={24} className="dd-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dd-widget dd-error">
        <div className="dd-error-text">{error}</div>
        <button className="dd-retry" onClick={loadData}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!data || !data.sections) {
    return <div className="dd-widget dd-empty">No content to display</div>;
  }

  const widgetStyle = {};
  if (data.background) {
    widgetStyle.background = data.background.startsWith("http")
      ? `url(${data.background}) center/cover`
      : data.background;
  }

  return (
    <div className="dd-widget" style={widgetStyle} ref={containerRef}>
      <div className="dd-content">
        {data.sections.map((section, i) => (
          <RenderSection key={i} section={section} />
        ))}
      </div>
      {data.footer && <div className="dd-footer">{data.footer}</div>}
    </div>
  );
}
