import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Sun,
  Moon,
  Upload,
  X,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  Download,
  Cog,
  Unplug,
  Plug,
  Info,
  Mic,
  MicOff,
  Monitor,
  Tablet,
  Layers,
  Minus,
  Plus,
} from "lucide-react";
import useThemeStore from "../../stores/themeStore";
import useWindowStore from "../../stores/windowStore";
import { gateway } from "../../gateway/GatewayClient";
import { voiceEngine } from "../../core/VoiceEngine";
import "./Settings.css";

const WALLPAPERS = [
  {
    id: "gradient-dusk",
    label: "Dusk",
    color: "linear-gradient(135deg, #0a0a1a, #1a0a2e)",
  },
  {
    id: "gradient-ocean",
    label: "Ocean",
    color: "linear-gradient(135deg, #0a1628, #1a5276)",
  },
  {
    id: "gradient-aurora",
    label: "Aurora",
    color: "linear-gradient(135deg, #0f2027, #2c5364)",
  },
  {
    id: "gradient-sunset",
    label: "Sunset",
    color: "linear-gradient(135deg, #1a0a1e, #4a2040)",
  },
  {
    id: "gradient-forest",
    label: "Forest",
    color: "linear-gradient(135deg, #0a1a0f, #2a4a2f)",
  },
  {
    id: "gradient-light",
    label: "Light",
    color: "linear-gradient(135deg, #e8ecf1, #c8d0da)",
  },
  {
    id: "gradient-warm",
    label: "Warm",
    color: "linear-gradient(135deg, #f5f0e8, #ddd0c0)",
  },
  {
    id: "gradient-sky",
    label: "Sky",
    color: "linear-gradient(135deg, #dce8f5, #89b0d8)",
  },
  {
    id: "gradient-lavender",
    label: "Lavender",
    color: "linear-gradient(135deg, #e8e0f0, #b8a8d8)",
  },
];

// ─── Gateway Settings Section ────────────────────────────

function GatewaySettings() {
  const [gwStatus, setGwStatus] = useState(null);
  const [gwConfig, setGwConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");
  const [agentIdentity, setAgentIdentity] = useState(null);
  const [macosInfo, setMacosInfo] = useState(null);

  const loadGateway = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, configRes, macosRes] = await Promise.all([
        fetch("/api/oni/status")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/oni/config")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/macos/system")
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setGwStatus(statusRes);
      setGwConfig(configRes);
      setMacosInfo(macosRes);

      if (gateway.connected) {
        try {
          const identity = await gateway.getAgentIdentity();
          setAgentIdentity(identity);
        } catch {
          /* not connected yet */
        }
      }
    } catch {
      /* server not ready */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGateway();
    const unsub = gateway.onStatusChange(() => loadGateway());
    return unsub;
  }, [loadGateway]);

  const handleConnect = async () => {
    setSaving(true);
    try {
      gateway.connect();
      showMsg("Connected to action event stream");
      loadGateway();
    } catch (err) {
      showMsg("Connection failed: " + err.message);
    }
    setSaving(false);
  };

  const handleDisconnect = () => {
    gateway.disconnect();
    showMsg("Disconnected");
    loadGateway();
  };

  const updateGatewayUrl = (url) => {
    setGwConfig((prev) => ({ ...prev, gatewayUrl: url }));
  };

  const saveGatewayUrl = async () => {
    setSaving(true);
    await fetch("/api/oni/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gwConfig),
    });
    setSaving(false);
    showMsg("Gateway URL saved");
    loadGateway();
  };

  const installSkills = async () => {
    setInstalling(true);
    try {
      const res = await fetch("/api/oni/install-skills", { method: "POST" });
      const data = await res.json();
      showMsg(data.success ? "OniOS skill installed!" : data.error);
    } catch (err) {
      showMsg("Install failed: " + err.message);
    }
    setInstalling(false);
    loadGateway();
  };

  const syncIdentity = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/oni/sync-identity", { method: "POST" });
      const data = await res.json();
      showMsg(data.success ? "Identity synced to workspace" : data.error);
    } catch (err) {
      showMsg("Sync failed: " + err.message);
    }
    setSaving(false);
  };

  const showMsg = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  if (loading) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">
          <Cog size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          🦊 Oni Gateway
        </h3>
        <div className="settings-row-desc" style={{ padding: 8 }}>
          <Loader2
            size={14}
            className="oni-spin"
            style={{ display: "inline", marginRight: 6 }}
          />
          Loading...
        </div>
      </div>
    );
  }

  const isConnected = gateway.connected || gwStatus?.gatewayRunning;

  return (
    <>
      {/* Gateway Connection */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <Cog size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          🦊 Oni Gateway
        </h3>

        <div style={{ marginBottom: 10 }}>
          <div
            className={`settings-ai-auth-badge ${isConnected ? "connected" : "disconnected"}`}
          >
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>
              Gateway:{" "}
              <strong>{isConnected ? "connected" : "disconnected"}</strong>
            </span>
          </div>

          {(gwStatus?.agentName || agentIdentity) && (
            <div className="settings-row-desc" style={{ marginTop: 4 }}>
              Agent:{" "}
              <strong>
                {agentIdentity?.name || gwStatus?.agentName || "OniAI"}
              </strong>
              {(agentIdentity?.model || gwStatus?.agentModel) && (
                <span style={{ opacity: 0.6 }}>
                  {" "}
                  ({agentIdentity?.model || gwStatus?.agentModel})
                </span>
              )}
            </div>
          )}

          {gwStatus?.oniInstalled === false && (
            <div
              className="settings-row-desc"
              style={{ color: "#e88", marginTop: 4 }}
            >
              OniAI not detected at ~/.oni —{" "}
              <a
                href="https://github.com/msichalwe/OniAi"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#88f" }}
              >
                Install OniAI
              </a>
            </div>
          )}
        </div>

        {/* Gateway URL */}
        <div className="settings-api-key" style={{ marginBottom: 10 }}>
          <div className="settings-api-key-info">
            <span className="settings-row-label">Gateway URL</span>
            <span className="settings-row-desc">
              WebSocket address of your Oni gateway
            </span>
          </div>
          <div className="settings-api-key-input-row">
            <input
              className="settings-api-key-input"
              value={gwConfig?.gatewayUrl || ""}
              onChange={(e) => updateGatewayUrl(e.target.value)}
              placeholder="ws://127.0.0.1:19100"
            />
            <button
              className="settings-api-key-save"
              onClick={saveGatewayUrl}
              disabled={saving}
            >
              {saving ? "..." : "Save"}
            </button>
          </div>
        </div>

        {/* Connect / Disconnect */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {!isConnected ? (
            <button
              className="settings-api-key-save"
              onClick={handleConnect}
              disabled={saving}
              style={{ flex: 1 }}
            >
              <Plug size={12} style={{ marginRight: 4 }} /> Connect
            </button>
          ) : (
            <button
              className="settings-api-key-save"
              onClick={handleDisconnect}
              style={{
                flex: 1,
                background: "rgba(220,60,60,0.15)",
                borderColor: "rgba(220,60,60,0.3)",
                color: "#e55",
              }}
            >
              <Unplug size={12} style={{ marginRight: 4 }} /> Disconnect
            </button>
          )}
          <button
            className="settings-api-key-save"
            onClick={() => loadGateway()}
            style={{ width: 40 }}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* OniOS Skill */}
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span className="settings-row-label">OniOS Skill</span>
            {gwStatus?.skillInstalled ? (
              <span
                style={{
                  fontSize: 11,
                  color: "#6d8",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <CheckCircle2 size={11} /> Installed
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "#e88" }}>Not installed</span>
            )}
          </div>
          <span
            className="settings-row-desc"
            style={{ display: "block", marginBottom: 6 }}
          >
            Install the OniOS skill so the gateway agent can control your
            desktop
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="settings-api-key-save"
              onClick={installSkills}
              disabled={installing}
              style={{ flex: 1 }}
            >
              {installing ? (
                <Loader2
                  size={12}
                  className="oni-spin"
                  style={{ marginRight: 4 }}
                />
              ) : (
                <Download size={12} style={{ marginRight: 4 }} />
              )}
              {gwStatus?.skillInstalled ? "Reinstall" : "Install Skill"}
            </button>
            <button
              className="settings-api-key-save"
              onClick={syncIdentity}
              disabled={saving}
              style={{ flex: 1 }}
            >
              <RefreshCw size={12} style={{ marginRight: 4 }} /> Sync Identity
            </button>
          </div>
        </div>

        {message && (
          <div
            className="settings-row-desc"
            style={{ padding: "6px 0", color: "#8d8", fontWeight: 500 }}
          >
            {message}
          </div>
        )}
      </div>

      {/* System Info */}
      {macosInfo && (
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Info
              size={14}
              style={{ verticalAlign: "middle", marginRight: 6 }}
            />
            System
          </h3>
          <div className="settings-row-desc" style={{ lineHeight: 1.8 }}>
            <div>
              Platform:{" "}
              <strong>
                {macosInfo.platform} {macosInfo.version}
              </strong>
            </div>
            <div>
              Chip: <strong>{macosInfo.chip}</strong>
            </div>
            <div>
              CPUs: <strong>{macosInfo.cpus}</strong> · Memory:{" "}
              <strong>
                {Math.round(macosInfo.totalMemory / 1073741824)}GB
              </strong>
            </div>
            {macosInfo.battery && (
              <div>
                Battery: <strong>{macosInfo.battery.level}%</strong> (
                {macosInfo.battery.source})
              </div>
            )}
            {macosInfo.disk && (
              <div>
                Disk: <strong>{macosInfo.disk.available}</strong> free of{" "}
                {macosInfo.disk.total} ({macosInfo.disk.usedPercent} used)
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Settings Component ─────────────────────────────

export default function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const wallpaper = useThemeStore((s) => s.wallpaper);
  const customWallpaper = useThemeStore((s) => s.customWallpaper);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setWallpaper = useThemeStore((s) => s.setWallpaper);
  const setCustomWallpaper = useThemeStore((s) => s.setCustomWallpaper);
  const clearCustomWallpaper = useThemeStore((s) => s.clearCustomWallpaper);
  const layoutMode = useThemeStore((s) => s.layoutMode);
  const layoutSwitching = useThemeStore((s) => s.layoutSwitching);
  const setLayoutMode = useThemeStore((s) => s.setLayoutMode);
  const maxWindows = useWindowStore((s) => s.maxWindows);
  const setMaxWindows = useWindowStore((s) => s.setMaxWindows);
  const isDark = theme === "dark";
  const isTablet = layoutMode === "tablet";
  const fileInputRef = useRef(null);

  // Voice always-listening state
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try {
      return localStorage.getItem("onios_voice_enabled") !== "false";
    } catch {
      return true;
    }
  });
  const [voiceState, setVoiceState] = useState(voiceEngine.state || "OFF");

  useEffect(() => {
    const unsub = voiceEngine.onStateChange((data) =>
      setVoiceState(data.state),
    );
    return unsub;
  }, []);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    try {
      localStorage.setItem("onios_voice_enabled", String(next));
    } catch {
      /* quota */
    }
    if (next) {
      voiceEngine.start();
    } else {
      voiceEngine.stop();
    }
  };

  const handleCustomWallpaper = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => setCustomWallpaper(evt.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="settings-widget">
      {/* Appearance */}
      <div className="settings-section">
        <h3 className="settings-section-title">Appearance</h3>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Dark Mode</span>
            <span className="settings-row-desc">
              Toggle between dark and light themes
            </span>
          </div>
          <button
            className={`settings-toggle ${isDark ? "active" : ""}`}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            <div className="settings-toggle-thumb">
              {isDark ? <Moon size={12} /> : <Sun size={12} />}
            </div>
          </button>
        </div>
      </div>

      {/* Layout Mode */}
      <div className="settings-section">
        <h3 className="settings-section-title">Layout Mode</h3>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">
              {isTablet ? "Tablet Mode" : "Desktop Mode"}
            </span>
            <span className="settings-row-desc">
              {isTablet
                ? "Full-screen tiles with persistent AI chat"
                : "Free-form draggable windows"}
            </span>
          </div>
          <button
            className={`settings-toggle ${isTablet ? "active" : ""}`}
            onClick={() => setLayoutMode(isTablet ? "desktop" : "tablet")}
            disabled={layoutSwitching}
          >
            <div className="settings-toggle-thumb">
              {layoutSwitching ? (
                <Loader2 size={12} className="oni-spin" />
              ) : isTablet ? (
                <Tablet size={12} />
              ) : (
                <Monitor size={12} />
              )}
            </div>
          </button>
        </div>
        <div className="settings-layout-preview">
          <div
            className={`settings-layout-card ${!isTablet ? "selected" : ""}`}
            onClick={() =>
              !layoutSwitching &&
              layoutMode !== "desktop" &&
              setLayoutMode("desktop")
            }
          >
            <div className="settings-layout-icon">
              <Monitor size={20} />
            </div>
            <span className="settings-layout-label">Desktop</span>
            <span className="settings-layout-desc">Windows & taskbar</span>
          </div>
          <div
            className={`settings-layout-card ${isTablet ? "selected" : ""}`}
            onClick={() =>
              !layoutSwitching &&
              layoutMode !== "tablet" &&
              setLayoutMode("tablet")
            }
          >
            <div className="settings-layout-icon">
              <Tablet size={20} />
            </div>
            <span className="settings-layout-label">Tablet</span>
            <span className="settings-layout-desc">Tiles + AI chat</span>
          </div>
        </div>
      </div>

      {/* Max Widgets */}
      <div className="settings-section">
        <h3 className="settings-section-title">Windows</h3>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Max Widgets</span>
            <span className="settings-row-desc">
              Oldest auto-closes when limit is reached (1–12)
            </span>
          </div>
          <div className="settings-stepper">
            <button
              className="settings-stepper-btn"
              onClick={() => setMaxWindows(maxWindows - 1)}
              disabled={maxWindows <= 1}
            >
              <Minus size={14} />
            </button>
            <span className="settings-stepper-value">{maxWindows}</span>
            <button
              className="settings-stepper-btn"
              onClick={() => setMaxWindows(maxWindows + 1)}
              disabled={maxWindows >= 12}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Voice */}
      <div className="settings-section">
        <h3 className="settings-section-title">Voice Assistant</h3>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Always Listening</span>
            <span className="settings-row-desc">
              Say "Oni" to activate —{" "}
              {voiceEngine.isSupported
                ? voiceState !== "OFF"
                  ? `Active (${voiceState})`
                  : "Off"
                : "Not supported in this browser"}
            </span>
          </div>
          <button
            className={`settings-toggle ${voiceEnabled ? "active" : ""}`}
            onClick={toggleVoice}
            disabled={!voiceEngine.isSupported}
          >
            <div className="settings-toggle-thumb">
              {voiceEnabled ? <Mic size={12} /> : <MicOff size={12} />}
            </div>
          </button>
        </div>
      </div>

      {/* Wallpaper */}
      <div className="settings-section">
        <h3 className="settings-section-title">Wallpaper</h3>
        <div className="settings-wallpaper-grid">
          {WALLPAPERS.map((wp) => (
            <button
              key={wp.id}
              className={`settings-wallpaper-item ${wallpaper === wp.id ? "active" : ""}`}
              onClick={() => setWallpaper(wp.id)}
              title={wp.label}
            >
              <div
                className="settings-wallpaper-preview"
                style={{ background: wp.color }}
              />
              <span className="settings-wallpaper-label">{wp.label}</span>
            </button>
          ))}
          {customWallpaper ? (
            <button
              className={`settings-wallpaper-item ${wallpaper === "custom" ? "active" : ""}`}
              onClick={() => setWallpaper("custom")}
              title="Custom"
            >
              <div
                className="settings-wallpaper-preview"
                style={{
                  backgroundImage: `url(${customWallpaper})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <span className="settings-wallpaper-label">Custom</span>
              <button
                className="settings-wallpaper-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCustomWallpaper();
                }}
                title="Remove"
              >
                <X size={10} />
              </button>
            </button>
          ) : (
            <button
              className="settings-wallpaper-item upload"
              onClick={() => fileInputRef.current?.click()}
              title="Upload custom wallpaper"
            >
              <div className="settings-wallpaper-preview settings-upload-preview">
                <Upload size={18} />
              </div>
              <span className="settings-wallpaper-label">Upload</span>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleCustomWallpaper}
        />
      </div>

      {/* Gateway Integration (replaces API Keys + AI Auth) */}
      <GatewaySettings />

      {/* About */}
      <div className="settings-section">
        <h3 className="settings-section-title">About</h3>
        <div className="settings-about">
          <div className="settings-about-logo">🦊 OniOS</div>
          <span className="settings-about-version">Version 0.1.0</span>
          <span className="settings-about-desc">
            AI-powered desktop OS — gateway-native
          </span>
        </div>
      </div>
    </div>
  );
}
