import React, { useState, useCallback, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  Search,
  X,
  Plus,
  ExternalLink,
  Loader2,
  Lock,
  PlaySquare,
  Github,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { useWidgetState } from "../../core/useWidgetState";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./Browser.css";

const QUICK_LINKS = [
  {
    label: "Google",
    icon: <Search size={24} />,
    url: "https://google.com",
    bg: "rgba(66,133,244,0.15)",
  },
  {
    label: "YouTube",
    icon: <PlaySquare size={24} />,
    url: "https://youtube.com",
    bg: "rgba(255,0,0,0.12)",
  },
  {
    label: "GitHub",
    icon: <Github size={24} />,
    url: "https://github.com",
    bg: "rgba(255,255,255,0.06)",
  },
  {
    label: "Reddit",
    icon: <MessageSquare size={24} />,
    url: "https://reddit.com",
    bg: "rgba(255,69,0,0.12)",
  },
  {
    label: "Wikipedia",
    icon: <BookOpen size={24} />,
    url: "https://en.wikipedia.org",
    bg: "rgba(255,255,255,0.06)",
  },
];

function proxyUrl(url) {
  if (!url) return "";
  return `/api/web-proxy?url=${encodeURIComponent(url)}`;
}

export default function Browser({ initialUrl, windowId, widgetType }) {
  const [savedUrl, setSavedUrl] = useWidgetState(
    windowId,
    "browser",
    "lastUrl",
    null,
  );
  const startUrl = initialUrl || savedUrl || "";
  const [tabs, setTabs] = useState([
    {
      id: 1,
      url: startUrl,
      title: startUrl ? tryHostname(startUrl) : "New Tab",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [urlInput, setUrlInput] = useState(startUrl);
  const [history, setHistory] = useState(startUrl ? [startUrl] : []);
  const [historyIndex, setHistoryIndex] = useState(startUrl ? 0 : -1);
  const [loading, setLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef(null);
  const loadTimerRef = useRef(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Report live context for AI agents
  useWidgetContext(windowId, "browser", {
    currentUrl: activeTab?.url || null,
    pageTitle: activeTab?.title || null,
    tabCount: tabs.length,
    tabs: tabs.map((t) => ({ id: t.id, url: t.url, title: t.title })),
    loading,
    hasError: iframeError,
    historyLength: history.length,
    historyIndex,
  });

  function ensureProtocol(url) {
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) return "https://" + url;
    return url;
  }

  function tryHostname(url) {
    try {
      return new URL(ensureProtocol(url)).hostname;
    } catch {
      return url;
    }
  }

  const navigateTo = useCallback(
    (url) => {
      if (!url) return;
      const fullUrl = ensureProtocol(url);
      const hostname = tryHostname(fullUrl);

      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, url: fullUrl, title: hostname } : t,
        ),
      );
      setUrlInput(fullUrl);
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), fullUrl]);
      setHistoryIndex((prev) => prev + 1);
      setIframeError(false);
      setLoading(true);
      setSavedUrl(fullUrl);
    },
    [activeTabId, historyIndex, setSavedUrl],
  );

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    const input = urlInput.trim();
    if (input.includes(".") || input.startsWith("http")) {
      navigateTo(input);
    } else {
      navigateTo(
        `https://www.google.com/search?q=${encodeURIComponent(input)}`,
      );
    }
  };

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      const url = history[historyIndex - 1];
      setUrlInput(url);
      setIframeError(false);
      setLoading(true);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, url, title: tryHostname(url) } : t,
        ),
      );
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      const url = history[historyIndex + 1];
      setUrlInput(url);
      setIframeError(false);
      setLoading(true);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, url, title: tryHostname(url) } : t,
        ),
      );
    }
  };

  const addTab = () => {
    const newId = Math.max(...tabs.map((t) => t.id)) + 1;
    setTabs((prev) => [...prev, { id: newId, url: "", title: "New Tab" }]);
    setActiveTabId(newId);
    setUrlInput("");
    setIframeError(false);
  };

  const closeTab = (id, e) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }
  };

  const openExternal = () => {
    if (activeTab?.url) window.open(activeTab.url, "_blank");
  };

  const handleIframeLoad = () => {
    clearTimeout(loadTimerRef.current);
    setLoading(false);
  };

  const handleIframeError = () => {
    clearTimeout(loadTimerRef.current);
    setLoading(false);
    setIframeError(true);
  };

  return (
    <div className="browser-widget">
      {/* Tabs */}
      <div className="browser-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`browser-tab ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => {
              setActiveTabId(tab.id);
              setUrlInput(tab.url);
            }}
          >
            <Globe size={12} />
            <span
              style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {tab.title}
            </span>
            {tabs.length > 1 && (
              <span
                className="browser-tab-close"
                onClick={(e) => closeTab(tab.id, e)}
              >
                <X />
              </span>
            )}
          </button>
        ))}
        <button
          className="browser-nav-btn"
          onClick={addTab}
          style={{ margin: "4px" }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="browser-toolbar">
        <button
          className="browser-nav-btn"
          onClick={goBack}
          disabled={historyIndex <= 0}
        >
          <ArrowLeft />
        </button>
        <button
          className="browser-nav-btn"
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
        >
          <ArrowRight />
        </button>
        <button
          className="browser-nav-btn"
          onClick={() => {
            setIframeError(false);
            setLoading(true);
            navigateTo(activeTab?.url);
          }}
        >
          <RotateCw />
        </button>

        <form className="browser-url-bar" onSubmit={handleUrlSubmit}>
          {loading ? (
            <Loader2 size={14} className="browser-url-spinner" />
          ) : (
            <Globe />
          )}
          <input
            className="browser-url-input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Search or enter URL..."
            spellCheck={false}
          />
        </form>

        {activeTab?.url && (
          <button
            className="browser-nav-btn"
            onClick={openExternal}
            title="Open in real browser"
          >
            <ExternalLink />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="browser-content">
        {activeTab?.url ? (
          <>
            {/* iframe for loading pages */}
            <iframe
              ref={iframeRef}
              className="browser-iframe"
              src={proxyUrl(activeTab.url)}
              title={activeTab.title}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              style={{ display: iframeError ? "none" : "block" }}
            />
            {/* Fallback when iframe blocked */}
            {iframeError && (
              <div className="browser-preview">
                <div className="browser-preview-card">
                  <div className="browser-preview-icon">
                    <Lock size={48} />
                  </div>
                  <div className="browser-preview-url">{activeTab.url}</div>
                  <div className="browser-preview-message">
                    This website doesn't allow embedding. Click below to open it
                    in your system browser.
                  </div>
                  <button className="browser-open-btn" onClick={openExternal}>
                    Open in Browser{" "}
                    <ExternalLink size={14} style={{ marginLeft: 6 }} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="browser-newtab">
            <div className="browser-newtab-logo">OniOS Browser</div>
            <form className="browser-search-box" onSubmit={handleUrlSubmit}>
              <Search />
              <input
                className="browser-search-input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Search Google or enter a URL"
                spellCheck={false}
              />
            </form>
            <div className="browser-quick-links">
              {QUICK_LINKS.map((link, i) => (
                <button
                  key={i}
                  className="browser-quick-link"
                  onClick={() => navigateTo(link.url)}
                >
                  <div
                    className="browser-quick-link-icon"
                    style={{ background: link.bg }}
                  >
                    {link.icon}
                  </div>
                  <span className="browser-quick-link-label">{link.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
