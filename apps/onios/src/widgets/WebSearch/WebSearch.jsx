import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Search,
  ExternalLink,
  Loader2,
  Globe,
  Image,
  Clock,
} from "lucide-react";
import "./WebSearch.css";

export default function WebSearch({ query: initialQuery }) {
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    const apiKey = localStorage.getItem("onios-api-brave");
    if (!apiKey) {
      setError(
        "No Brave Search API key set. Go to Settings → API Keys to add one.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setSearchedQuery(query);

    try {
      const res = await fetch(
        `/api/brave-search?q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`,
      );
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setResults([]);
      } else {
        setResults(data.results || []);
      }
    } catch (err) {
      setError(`Search failed: ${err.message}`);
      setResults([]);
    }
    setLoading(false);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="websearch-widget">
      {/* Search Bar */}
      <div className="websearch-bar">
        <Search size={16} />
        <input
          ref={inputRef}
          className="websearch-input"
          placeholder="Search the web…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="websearch-search-btn"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="websearch-spin" size={14} />
          ) : (
            "Search"
          )}
        </button>
      </div>

      {/* Error */}
      {error && <div className="websearch-error">{error}</div>}

      {/* Results */}
      <div className="websearch-results">
        {results.length > 0 && (
          <div className="websearch-result-count">
            {results.length} results for "{searchedQuery}"
          </div>
        )}

        {results.map((result, i) => (
          <a
            key={i}
            className="websearch-result"
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="websearch-result-header">
              <Globe size={12} />
              <span className="websearch-result-url">
                {result.url ? new URL(result.url).hostname : ""}
              </span>
              <ExternalLink size={10} />
            </div>
            <h3 className="websearch-result-title">{result.title}</h3>
            <p className="websearch-result-snippet">{result.description}</p>
          </a>
        ))}

        {!loading && results.length === 0 && !error && (
          <div className="websearch-empty">
            <Search size={40} />
            <span>Search the web using Brave Search API</span>
            <span className="websearch-empty-hint">
              Set your API key in Settings → API Keys
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
