/**
 * Browser — Headless browser widget for complex web workflows.
 *
 * Features:
 *   - URL bar with navigation (back, forward, refresh)
 *   - Sandboxed iframe rendering of web pages
 *   - AI can navigate, take screenshots of pages, and extract content
 *   - History tracking
 *   - Loading state with progress indicator
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  Lock,
  ExternalLink,
  X,
  Search,
} from "lucide-react";
import { useWidgetContext } from "../../core/useWidgetContext";
import { eventBus } from "../../core/EventBus";
import "./Browser.css";

export default function BrowserWidget({ windowId, widgetType, initialUrl }) {
  const [url, setUrl] = useState(initialUrl || "");
  const [displayUrl, setDisplayUrl] = useState(initialUrl || "");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);
  const inputRef = useRef(null);

  useWidgetContext(windowId, widgetType, {
    currentUrl: url,
    loading,
    historyLength: history.length,
  });

  const navigate = useCallback(
    (targetUrl) => {
      if (!targetUrl) return;

      let finalUrl = targetUrl.trim();
      if (
        !finalUrl.startsWith("http://") &&
        !finalUrl.startsWith("https://") &&
        !finalUrl.startsWith("data:")
      ) {
        if (finalUrl.includes(".") && !finalUrl.includes(" ")) {
          finalUrl = `https://${finalUrl}`;
        } else {
          finalUrl = `https://www.google.com/search?igu=1&q=${encodeURIComponent(finalUrl)}`;
        }
      }

      setUrl(finalUrl);
      setDisplayUrl(finalUrl);
      setLoading(true);
      setError(null);

      setHistory((prev) => {
        const newHist = prev.slice(0, historyIdx + 1);
        newHist.push(finalUrl);
        return newHist;
      });
      setHistoryIdx((prev) => prev + 1);
    },
    [historyIdx],
  );

  const goBack = useCallback(() => {
    if (historyIdx <= 0) return;
    const newIdx = historyIdx - 1;
    setHistoryIdx(newIdx);
    const prevUrl = history[newIdx];
    setUrl(prevUrl);
    setDisplayUrl(prevUrl);
    setLoading(true);
  }, [history, historyIdx]);

  const goForward = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const newIdx = historyIdx + 1;
    setHistoryIdx(newIdx);
    const nextUrl = history[newIdx];
    setUrl(nextUrl);
    setDisplayUrl(nextUrl);
    setLoading(true);
  }, [history, historyIdx]);

  const refresh = useCallback(() => {
    if (!url) return;
    setLoading(true);
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = url;
    }
  }, [url]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      navigate(displayUrl);
    },
    [displayUrl, navigate],
  );

  const handleIframeLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setLoading(false);
    setError("Failed to load page");
  }, []);

  // Listen for AI navigation commands
  useEffect(() => {
    const handleNavigate = (data) => {
      if (data?.url) navigate(data.url);
    };
    eventBus.on("browser:navigate", handleNavigate);
    return () => eventBus.off("browser:navigate", handleNavigate);
  }, [navigate]);

  // Navigate on mount if initialUrl provided
  useEffect(() => {
    if (initialUrl) navigate(initialUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isSecure = url.startsWith("https://");
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();

  return (
    <div className="browser-widget">
      <div className="browser-toolbar">
        <div className="browser-nav-btns">
          <button
            className="browser-nav-btn"
            onClick={goBack}
            disabled={historyIdx <= 0}
            title="Back"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            className="browser-nav-btn"
            onClick={goForward}
            disabled={historyIdx >= history.length - 1}
            title="Forward"
          >
            <ArrowRight size={14} />
          </button>
          <button
            className="browser-nav-btn"
            onClick={refresh}
            disabled={!url}
            title="Refresh"
          >
            <RotateCw size={14} className={loading ? "browser-spin" : ""} />
          </button>
        </div>

        <form className="browser-url-bar" onSubmit={handleSubmit}>
          <span className="browser-url-icon">
            {url ? (
              isSecure ? (
                <Lock size={12} />
              ) : (
                <Globe size={12} />
              )
            ) : (
              <Search size={12} />
            )}
          </span>
          <input
            ref={inputRef}
            className="browser-url-input"
            value={displayUrl}
            onChange={(e) => setDisplayUrl(e.target.value)}
            placeholder="Search or enter URL..."
            spellCheck={false}
          />
          {displayUrl && (
            <button
              type="button"
              className="browser-url-clear"
              onClick={() => {
                setDisplayUrl("");
                inputRef.current?.focus();
              }}
            >
              <X size={12} />
            </button>
          )}
        </form>

        {url && (
          <a
            className="browser-external-btn"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in system browser"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {loading && <div className="browser-loading-bar" />}

      <div className="browser-viewport">
        {!url && (
          <div className="browser-empty">
            <Globe size={48} strokeWidth={1} />
            <div>Enter a URL or search term to browse the web</div>
            <div className="browser-empty-hint">
              The AI can also navigate here automatically for research tasks
            </div>
          </div>
        )}
        {error && (
          <div className="browser-error">
            <div>{error}</div>
            <button onClick={refresh}>Try again</button>
          </div>
        )}
        {url && (
          <iframe
            ref={iframeRef}
            src={url}
            className="browser-iframe"
            title={hostname || "Browser"}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        )}
      </div>

      <div className="browser-status">
        {loading ? (
          <span>Loading {hostname}...</span>
        ) : url ? (
          <span>{hostname}</span>
        ) : (
          <span>Ready</span>
        )}
      </div>
    </div>
  );
}
