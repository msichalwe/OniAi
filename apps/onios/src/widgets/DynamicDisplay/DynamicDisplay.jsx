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
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  Expand,
  Download,
  Share2,
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
import { eventBus } from "../../core/EventBus";
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

const isElectron =
  typeof window !== "undefined" &&
  (window.process?.type === "renderer" ||
    navigator.userAgent.includes("Electron"));

function openUrl(url, e) {
  if (!url) return;
  if (e) e.preventDefault();
  if (isElectron) {
    // In Electron: use shell.openExternal for system browser, or open in OniOS browser widget
    try {
      const { shell } = window.require("electron");
      shell.openExternal(url);
    } catch {
      // Fallback: open in OniOS browser widget via command
      eventBus.emit(
        "command:execute",
        `browser.open("${url.replace(/"/g, '\\"')}")`,
      );
    }
  } else {
    // Web: open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

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

// ─── Send item context to AI Chat ────────────────────

function sendToChat(item, action = "expand") {
  const summary = [
    item.title || item.name || item.label,
    item.subtitle,
    item.description || item.snippet || item.text,
    item.value,
    item.price,
    item.source,
    item.url || item.link,
  ]
    .filter(Boolean)
    .join(" | ");

  eventBus.emit("chat:addContext", {
    item,
    summary,
    action,
  });
}

// ─── Detail Overlay ───────────────────────────────────

function DetailOverlay({ item, onClose }) {
  if (!item) return null;

  const handleAskAI = (prompt) => {
    sendToChat(item, prompt);
    onClose();
  };

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
          <div className="dd-detail-actions">
            <button
              className="dd-action-btn dd-action-primary"
              onClick={() => handleAskAI("expand")}
            >
              Expand on this
            </button>
            <button
              className="dd-action-btn"
              onClick={() => handleAskAI("explain")}
            >
              Explain
            </button>
            <button
              className="dd-action-btn"
              onClick={() => handleAskAI("deeper")}
            >
              Go deeper
            </button>
            {item.link && (
              <button
                className="dd-action-btn dd-action-link"
                onClick={(e) => {
                  e.stopPropagation();
                  openUrl(item.link);
                }}
              >
                Open Link <ExternalLink size={12} />
              </button>
            )}
          </div>
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
              <button
                className="dd-card-link"
                onClick={(e) => {
                  e.stopPropagation();
                  openUrl(card.link);
                }}
              >
                View <ExternalLink size={10} />
              </button>
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
        // Handle string items
        if (typeof item === "string") {
          if (!item.trim()) return null;
          return (
            <div key={i} className="dd-list-item">
              {ordered && <span className="dd-list-num">{i + 1}</span>}
              <div className="dd-list-content">
                <div className="dd-list-title">{item}</div>
              </div>
            </div>
          );
        }
        const title = item.title || item.label || item.name;
        const desc = item.description || item.text;
        const val = item.value;
        const hasDetail = item.details && typeof item.details === "object";
        // Skip empty items
        if (!title && !desc && !val && !item.image && !hasDetail) return null;
        return (
          <div
            key={i}
            className={`dd-list-item ${hasDetail ? "dd-list-clickable" : ""}`}
            onClick={() => hasDetail && onSelect(item)}
          >
            {ordered && <span className="dd-list-num">{i + 1}</span>}
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
  const handleOpen = () => {
    eventBus.emit("command:execute", `system.media.playVideo("${data.src}")`);
  };
  return (
    <div className="dd-image-immersive">
      <div
        className="dd-image-bg"
        style={{ backgroundImage: `url(${data.src})` }}
      />
      <div className="dd-image-glass">
        <div
          className="dd-image-main"
          onClick={() => onSelect?.({ image: data.src, title: data.caption })}
        >
          <Img
            src={data.src}
            alt={data.caption}
            style={data.width ? { maxWidth: data.width } : undefined}
          />
        </div>
        {(data.caption || data.title || data.description) && (
          <div className="dd-image-info">
            {(data.caption || data.title) && (
              <div className="dd-image-title">{data.caption || data.title}</div>
            )}
            {data.description && (
              <div className="dd-image-desc">{data.description}</div>
            )}
            <div className="dd-image-actions">
              <button
                className="dd-media-btn"
                onClick={handleOpen}
                title="Open full size"
              >
                <Expand size={13} /> Open
              </button>
              {data.source && (
                <span className="dd-image-source">{data.source}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoSection({ data }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const isYoutube =
    data.youtube ||
    (data.src &&
      (data.src.includes("youtube") || data.src.includes("youtu.be")));
  const isVimeo = data.src && data.src.includes("vimeo.com");
  const isEmbed = isYoutube || isVimeo || data.embed;

  // Extract YouTube embed URL
  const getYoutubeEmbed = () => {
    const vid = data.youtube || data.src;
    if (vid.includes("embed/")) return vid;
    const videoId = vid.includes("youtu.be/")
      ? vid.split("youtu.be/")[1]?.split("?")[0]
      : vid.split("v=").pop()?.split("&")[0];
    return `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`;
  };

  // Extract YouTube thumbnail
  const getYoutubeThumbnail = () => {
    const vid = data.youtube || data.src || "";
    const videoId = vid.includes("youtu.be/")
      ? vid.split("youtu.be/")[1]?.split("?")[0]
      : vid.split("v=").pop()?.split("&")[0];
    return videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
  };

  const thumbnail =
    data.poster || data.thumbnail || (isYoutube ? getYoutubeThumbnail() : null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => setDuration(v.duration);
    const onEnd = () => setIsPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("ended", onEnd);
    };
  }, [data.src]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.pause();
    else v.play();
    setIsPlaying(!isPlaying);
  };

  const seek = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const fmtTime = (t) => {
    if (!t || isNaN(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const openExternal = () => {
    const url = data.youtube || data.src;
    if (url) openUrl(url);
  };

  return (
    <div className="dd-video-immersive">
      {thumbnail && (
        <div
          className="dd-video-bg"
          style={{ backgroundImage: `url(${thumbnail})` }}
        />
      )}
      <div className="dd-video-glass">
        <div className="dd-video-viewport">
          {isEmbed ? (
            <iframe
              src={isYoutube ? getYoutubeEmbed() : data.src}
              title={data.title || data.caption || "Video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="dd-video-iframe"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                src={data.src}
                poster={thumbnail}
                playsInline
                preload="metadata"
                className="dd-video-element"
                onClick={togglePlay}
              />
              {!isPlaying && (
                <button className="dd-video-play-overlay" onClick={togglePlay}>
                  <Play size={36} fill="white" />
                </button>
              )}
            </>
          )}
        </div>

        <div className="dd-video-info-bar">
          <div className="dd-video-meta">
            {(data.title || data.caption) && (
              <div className="dd-video-title">{data.title || data.caption}</div>
            )}
            {data.channel && (
              <div className="dd-video-channel">{data.channel}</div>
            )}
            {data.description && (
              <div className="dd-video-desc">{data.description}</div>
            )}
            {(data.views || data.date || data.duration) && (
              <div className="dd-video-stats">
                {data.views && <span>{data.views} views</span>}
                {data.date && <span>{data.date}</span>}
                {data.duration && <span>{data.duration}</span>}
              </div>
            )}
          </div>

          {!isEmbed && (
            <div className="dd-video-controls">
              <div className="dd-video-progress" onClick={seek}>
                <div
                  className="dd-video-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="dd-video-ctrl-row">
                <button
                  className="dd-ctrl-btn"
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime -= 10;
                  }}
                >
                  <SkipBack size={14} />
                </button>
                <button
                  className="dd-ctrl-btn dd-ctrl-play"
                  onClick={togglePlay}
                >
                  {isPlaying ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} fill="white" />
                  )}
                </button>
                <button
                  className="dd-ctrl-btn"
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime += 10;
                  }}
                >
                  <SkipForward size={14} />
                </button>
                <span className="dd-video-time">
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
                <div style={{ flex: 1 }} />
                <button
                  className="dd-ctrl-btn"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) {
                      v.muted = !isMuted;
                      setIsMuted(!isMuted);
                    }
                  }}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button
                  className="dd-ctrl-btn"
                  onClick={() => {
                    if (videoRef.current?.requestFullscreen)
                      videoRef.current.requestFullscreen();
                  }}
                >
                  <Maximize size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="dd-video-action-row">
            {(data.youtube || data.src) && (
              <button className="dd-media-btn" onClick={openExternal}>
                <ExternalLink size={12} /> Open
              </button>
            )}
            {data.url && (
              <button
                className="dd-media-btn"
                onClick={() => openUrl(data.url)}
              >
                <ExternalLink size={12} /> Source
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GallerySection({ data, onSelect }) {
  const images = data.images || data.items || [];
  const [activeIdx, setActiveIdx] = useState(null);

  const cols =
    data.columns ||
    (images.length <= 2 ? images.length : images.length <= 4 ? 2 : 3);

  const handleClick = (img, i) => {
    const src = typeof img === "string" ? img : img.src || img.url || img.image;
    const item =
      typeof img === "string" ? { image: img } : { ...img, image: src };
    setActiveIdx(i);
    onSelect?.(item);
  };

  return (
    <div className="dd-gallery-immersive">
      {data.title && <div className="dd-gallery-header">{data.title}</div>}
      <div
        className="dd-gallery-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {images.map((img, i) => {
          const src =
            typeof img === "string" ? img : img.src || img.url || img.image;
          const caption =
            typeof img === "string" ? null : img.caption || img.title;
          return (
            <div
              key={i}
              className={`dd-gallery-card ${activeIdx === i ? "dd-gallery-active" : ""}`}
              onClick={() => handleClick(img, i)}
            >
              <div className="dd-gallery-img-wrap">
                <Img src={src} alt={caption} />
                <div className="dd-gallery-hover">
                  <Expand size={18} />
                </div>
              </div>
              {caption && <div className="dd-gallery-label">{caption}</div>}
            </div>
          );
        })}
      </div>
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

function SearchResultsSection({ data }) {
  const results = data.items || data.results || [];
  return (
    <div className="dd-search-results">
      {data.title && <div className="dd-section-title">{data.title}</div>}
      {data.query && (
        <div className="dd-search-query">
          Results for <strong>{data.query}</strong>
        </div>
      )}
      {results.length === 0 && (
        <div className="dd-search-empty">No results found</div>
      )}
      {results.map((r, i) => {
        const title = r.title || r.name;
        const desc = r.description || r.snippet || r.text;
        const url = r.url || r.link;
        const source =
          r.source || (url ? new URL(url).hostname.replace("www.", "") : null);
        if (!title && !desc) return null;
        return (
          <div key={i} className="dd-search-result">
            {source && <div className="dd-search-source">{source}</div>}
            {title &&
              (url ? (
                <span
                  className="dd-search-title"
                  style={{ cursor: "pointer" }}
                  onClick={() => openUrl(url)}
                >
                  {title}
                </span>
              ) : (
                <div className="dd-search-title">{title}</div>
              ))}
            {desc && <div className="dd-search-desc">{desc}</div>}
            {r.date && <div className="dd-search-date">{r.date}</div>}
          </div>
        );
      })}
    </div>
  );
}

function ArticleSection({ data }) {
  const content = data.content || data.body || "";
  const html = content
    .replace(/^#### (.+)$/gm, "<h5>$1</h5>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  const hasBanner = data.image || data.banner;
  const bannerSrc = data.banner || data.image;
  const hasMultipleItems = data.items && data.items.length > 0;

  return (
    <div className="dd-article-immersive">
      {hasBanner && (
        <div className="dd-article-banner">
          <div
            className="dd-article-banner-bg"
            style={{ backgroundImage: `url(${bannerSrc})` }}
          />
          <div className="dd-article-banner-overlay" />
          <div className="dd-article-banner-content">
            {data.category && (
              <span className="dd-article-category">{data.category}</span>
            )}
            {data.title && <h1 className="dd-article-title">{data.title}</h1>}
            {data.subtitle && (
              <p className="dd-article-subtitle">{data.subtitle}</p>
            )}
            <div className="dd-article-meta-row">
              {data.author && (
                <span className="dd-article-author">{data.author}</span>
              )}
              {data.date && (
                <span className="dd-article-date">{data.date}</span>
              )}
              {data.source && (
                <span className="dd-article-source-badge">{data.source}</span>
              )}
              {data.read_time && (
                <span className="dd-article-read-time">{data.read_time}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasBanner && (
        <div className="dd-article-header-simple">
          {data.category && (
            <span className="dd-article-category">{data.category}</span>
          )}
          {data.title && <h1 className="dd-article-title">{data.title}</h1>}
          {data.subtitle && (
            <p className="dd-article-subtitle">{data.subtitle}</p>
          )}
          <div className="dd-article-meta-row">
            {data.author && (
              <span className="dd-article-author">{data.author}</span>
            )}
            {data.date && <span className="dd-article-date">{data.date}</span>}
            {data.source && (
              <span className="dd-article-source-badge">{data.source}</span>
            )}
            {data.read_time && (
              <span className="dd-article-read-time">{data.read_time}</span>
            )}
          </div>
        </div>
      )}

      {content && (
        <div className="dd-article-content">
          <div
            className="dd-article-body"
            dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
          />
        </div>
      )}

      {hasMultipleItems && (
        <div className="dd-article-items">
          {data.items.map((item, i) => (
            <div
              key={i}
              className="dd-article-item"
              onClick={() => sendToChat(item, "expand")}
            >
              {item.image && (
                <div className="dd-article-item-img">
                  <Img src={item.image} alt={item.title} />
                </div>
              )}
              <div className="dd-article-item-body">
                {item.title && (
                  <h3 className="dd-article-item-title">{item.title}</h3>
                )}
                {item.description && (
                  <p className="dd-article-item-desc">{item.description}</p>
                )}
                <div className="dd-article-item-meta">
                  {item.source && <span>{item.source}</span>}
                  {item.date && <span>{item.date}</span>}
                  {item.author && <span>{item.author}</span>}
                </div>
              </div>
              <ChevronRight size={14} className="dd-article-item-arrow" />
            </div>
          ))}
        </div>
      )}

      {data.key_points && (
        <div className="dd-article-key-points">
          <div className="dd-article-kp-title">Key Points</div>
          {data.key_points.map((point, i) => (
            <div key={i} className="dd-article-kp-item">
              <span className="dd-article-kp-num">{i + 1}</span>
              <span>{point}</span>
            </div>
          ))}
        </div>
      )}

      {data.tags && (
        <div className="dd-article-tags">
          {data.tags.map((t, i) => (
            <span key={i} className="dd-tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="dd-article-footer">
        {data.source_url && (
          <button
            className="dd-media-btn"
            onClick={() => openUrl(data.source_url)}
          >
            Read original <ExternalLink size={11} />
          </button>
        )}
        {(data.url || data.link) && !data.source_url && (
          <button
            className="dd-media-btn"
            onClick={() => openUrl(data.url || data.link)}
          >
            View source <ExternalLink size={11} />
          </button>
        )}
        <button
          className="dd-media-btn"
          onClick={() => sendToChat(data, "deeper")}
        >
          Go deeper
        </button>
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
    case "search_results":
    case "search":
      return <SearchResultsSection data={section} />;
    case "article":
      return <ArticleSection data={section} />;
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
