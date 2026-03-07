import React, { useState, useEffect } from "react";
import {
  Loader2,
  ExternalLink,
  AlertTriangle,
  Music,
  FileText,
  FileSpreadsheet,
  FileIcon,
  BookOpen,
} from "lucide-react";
import "./FileViewer.css";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "rst",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "css",
  "scss",
  "less",
  "sass",
  "html",
  "htm",
  "xml",
  "svg",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "cpp",
  "h",
  "hpp",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "sql",
  "graphql",
  "gql",
  "env",
  "gitignore",
  "dockerignore",
  "editorconfig",
  "csv",
  "tsv",
  "log",
  "makefile",
  "dockerfile",
  "vue",
  "svelte",
]);

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
]);

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "avi", "mkv"]);

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "aac"]);

const EXT_COLORS = {
  js: "#f7df1e",
  jsx: "#61dafb",
  ts: "#3178c6",
  tsx: "#3178c6",
  py: "#3776ab",
  rb: "#cc342d",
  go: "#00add8",
  rs: "#dea584",
  css: "#264de4",
  html: "#e34c26",
  json: "#5b9bd5",
  md: "#fff",
  txt: "#aaa",
  sh: "#89e051",
};

const formatSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function FileViewer({ filePath }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileInfo, setFileInfo] = useState({});

  const fileName = filePath ? filePath.split("/").pop() : "Unknown";
  const ext = fileName.includes(".")
    ? fileName.split(".").pop().toLowerCase()
    : "";
  const isText = TEXT_EXTENSIONS.has(ext) || ext === "";
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  const isAudio = AUDIO_EXTENSIONS.has(ext);

  const mediaUrl = `/api/fs/media?path=${encodeURIComponent(filePath || "")}`;

  useEffect(() => {
    if (!filePath) {
      setLoading(false);
      return;
    }

    if (isText) {
      setLoading(true);
      fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setError(data.error);
          else {
            setContent(data.content);
            setFileInfo({ size: data.size, modified: data.modified });
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [filePath]);

  if (loading) {
    return (
      <div className="file-viewer">
        <div className="fv-loading">
          <Loader2 size={20} className="fv-spinner" />
          <span>Loading file...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="file-viewer">
      <div className="fv-toolbar">
        <span className="fv-toolbar-path">{filePath}</span>
        <div className="fv-toolbar-info">
          {ext && (
            <span
              className="fv-toolbar-badge"
              style={{
                background: `${EXT_COLORS[ext] || "rgba(255,255,255,0.1)"}20`,
                color: EXT_COLORS[ext] || "var(--text-secondary)",
              }}
            >
              .{ext}
            </span>
          )}
          {fileInfo.size && <span>{formatSize(fileInfo.size)}</span>}
        </div>
      </div>

      <div className="fv-content">
        {error ? (
          <div className="fv-unsupported">
            <div className="fv-unsupported-icon">
              <AlertTriangle size={48} />
            </div>
            <div className="fv-unsupported-name">{error}</div>
          </div>
        ) : isText && content !== null ? (
          <div className="fv-code">
            {content.split("\n").map((line, i) => (
              <div key={i} className="fv-code-line">
                <span className="fv-line-number">{i + 1}</span>
                <span className="fv-line-content">{line}</span>
              </div>
            ))}
          </div>
        ) : isImage ? (
          <div className="fv-image-wrapper">
            <img
              className="fv-image"
              src={mediaUrl}
              alt={fileName}
              onError={(e) => {
                e.target.style.display = "none";
                setError("Failed to load image");
              }}
            />
          </div>
        ) : isVideo ? (
          <div className="fv-video-wrapper">
            <video
              className="fv-video"
              src={mediaUrl}
              controls
              autoPlay={false}
              preload="metadata"
            />
          </div>
        ) : isAudio ? (
          <div className="fv-audio-wrapper">
            <div className="fv-audio-icon">
              <Music size={64} className="fv-audio-svg" />
            </div>
            <div className="fv-audio-name">{fileName}</div>
            <audio
              className="fv-audio"
              src={mediaUrl}
              controls
              preload="metadata"
            />
          </div>
        ) : (
          <div className="fv-unsupported">
            <div className="fv-unsupported-icon">
              {ext === "pdf" ? (
                <BookOpen size={48} />
              ) : ext === "xlsx" || ext === "xls" ? (
                <FileSpreadsheet size={48} />
              ) : ext === "docx" || ext === "doc" ? (
                <FileText size={48} />
              ) : (
                <FileIcon size={48} />
              )}
            </div>
            <div className="fv-unsupported-name">{fileName}</div>
            <div className="fv-unsupported-size">
              {formatSize(fileInfo.size)}
            </div>
            <p
              style={{
                color: "var(--text-tertiary)",
                fontSize: "var(--text-sm)",
                maxWidth: 360,
              }}
            >
              This file type can't be previewed directly. Use the button below
              to open it with your system's default application.
            </p>
            <button
              className="fv-open-external"
              onClick={() => window.open(`file://${filePath}`, "_blank")}
            >
              Open with System App{" "}
              <ExternalLink size={14} style={{ marginLeft: 6 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
