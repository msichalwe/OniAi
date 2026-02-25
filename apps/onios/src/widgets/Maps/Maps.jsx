import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MapPin,
  Search,
  Navigation,
  ZoomIn,
  ZoomOut,
  Layers,
} from "lucide-react";
import "./Maps.css";

const DEFAULT_LAT = -15.4167;
const DEFAULT_LNG = 28.2833;
const DEFAULT_ZOOM = 13;

export default function Maps() {
  const mapRef = useRef(null);
  const [center, setCenter] = useState({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [mapLayer, setMapLayer] = useState("standard"); // standard, satellite, topo

  const getTileUrl = useCallback(
    (x, y, z) => {
      switch (mapLayer) {
        case "satellite":
          return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
        case "topo":
          return `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
        default:
          return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      }
    },
    [mapLayer],
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          searchQuery,
        )}&format=json&limit=8&addressdetails=1`,
      );
      const data = await res.json();
      setSearchResults(
        data.map((r) => ({
          id: r.place_id,
          name: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: r.type,
          category: r.class,
        })),
      );
    } catch (err) {
      console.error("Search failed:", err);
      setSearchResults([]);
    }
    setSearching(false);
  }, [searchQuery]);

  const handleResultClick = (result) => {
    setCenter({ lat: result.lat, lng: result.lng });
    setZoom(16);
    setSelectedResult(result);
    setMarkers((prev) => [
      ...prev.filter((m) => m.id !== result.id),
      { id: result.id, lat: result.lat, lng: result.lng, name: result.name },
    ]);
    setSearchResults([]);
  };

  const handleMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setZoom(15);
        },
        () => {
          // Default to Lusaka if geolocation fails
        },
      );
    }
  };

  return (
    <div className="maps-widget">
      {/* Search Bar */}
      <div className="maps-search-area">
        <div className="maps-search-bar">
          <Search size={14} />
          <input
            className="maps-search-input"
            placeholder="Search locations, POIs…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            className="maps-search-btn"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? "…" : "Go"}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="maps-search-results">
            {searchResults.map((r) => (
              <button
                key={r.id}
                className="maps-search-result"
                onClick={() => handleResultClick(r)}
              >
                <MapPin size={12} />
                <span className="maps-result-name">
                  {r.name.length > 80 ? r.name.slice(0, 80) + "…" : r.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Container */}
      <div className="maps-container" ref={mapRef}>
        <iframe
          className="maps-iframe"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${center.lng - 0.02 * (20 - zoom)}%2C${center.lat - 0.01 * (20 - zoom)}%2C${center.lng + 0.02 * (20 - zoom)}%2C${center.lat + 0.01 * (20 - zoom)}&layer=mapnik&marker=${center.lat}%2C${center.lng}`}
          style={{ border: 0, width: "100%", height: "100%" }}
          allowFullScreen
          loading="lazy"
        />

        {/* Map Controls */}
        <div className="maps-controls">
          <button
            className="maps-control-btn"
            onClick={() => setZoom((z) => Math.min(z + 1, 19))}
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="maps-control-btn"
            onClick={() => setZoom((z) => Math.max(z - 1, 1))}
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <div className="maps-control-divider" />
          <button
            className="maps-control-btn"
            onClick={handleMyLocation}
            title="My location"
          >
            <Navigation size={16} />
          </button>
        </div>

        {/* Selected Result Info */}
        {selectedResult && (
          <div className="maps-info-card">
            <div className="maps-info-title">
              <MapPin size={14} />
              <span>{selectedResult.name.split(",")[0]}</span>
            </div>
            <div className="maps-info-detail">{selectedResult.name}</div>
            <div className="maps-info-coords">
              {selectedResult.lat.toFixed(5)}, {selectedResult.lng.toFixed(5)}
            </div>
            <button
              className="maps-info-close"
              onClick={() => setSelectedResult(null)}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
