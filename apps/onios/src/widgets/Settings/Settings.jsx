import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Sun,
  Moon,
  Upload,
  X,
  Key,
  Eye,
  EyeOff,
  Bot,
  ExternalLink,
  ClipboardPaste,
  CheckCircle2,
  Loader2,
  Trash2,
  RefreshCw,
  LogIn,
  AlertCircle,
  Wifi,
  WifiOff,
  Download,
  Cog,
} from "lucide-react";
import useThemeStore from "../../stores/themeStore";
import { aiMemory } from "../../core/AIMemoryService";
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

const API_KEYS = [
  {
    id: "onios-api-brave",
    label: "Brave Search API",
    description: "Used by the Web Search widget",
    placeholder: "BSAxxxxxxxxxxxxxxxxxx",
    helpUrl: "https://api.search.brave.com/register",
  },
  {
    id: "onios-api-openai",
    label: "OpenAI API Key",
    description: "For AI-powered features",
    placeholder: "sk-xxxxxxxxxxxxxxxxxx",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "onios-api-weather",
    label: "OpenWeather API Key",
    description: "For live weather data",
    placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    helpUrl: "https://openweathermap.org/api",
  },
];

function OniAISettings() {
  const [ocConfig, setOcConfig] = useState(null);
  const [ocStatus, setOcStatus] = useState(null);
  const [ocLoading, setOcLoading] = useState(true);
  const [ocSaving, setOcSaving] = useState(false);
  const [ocInstalling, setOcInstalling] = useState(false);
  const [ocMessage, setOcMessage] = useState("");

  const loadOniAI = useCallback(async () => {
    setOcLoading(true);
    try {
      const [statusRes, configRes] = await Promise.all([
        fetch("/api/oni/status")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/oni/config")
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setOcStatus(statusRes);
      setOcConfig(configRes);
    } catch {
      /* server not ready */
    }
    setOcLoading(false);
  }, []);

  useEffect(() => {
    loadOniAI();
  }, [loadOniAI]);

  const updateMode = async (mode) => {
    setOcSaving(true);
    const updated = { ...ocConfig, mode, enabled: mode === "oni" };
    await fetch("/api/oni/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setOcConfig(updated);
    setOcSaving(false);
    setOcMessage(
      mode === "oni" ? "OniAI mode enabled" : "Personal AI mode enabled",
    );
    setTimeout(() => setOcMessage(""), 3000);
    loadOniAI();
  };

  const updateGatewayUrl = async (url) => {
    setOcConfig((prev) => ({
      ...prev,
      gatewayUrl: url,
      httpUrl: url.replace("ws://", "http://").replace("wss://", "https://"),
    }));
  };

  const saveGatewayUrl = async () => {
    setOcSaving(true);
    await fetch("/api/oni/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ocConfig),
    });
    setOcSaving(false);
    setOcMessage("Gateway URL saved");
    setTimeout(() => setOcMessage(""), 3000);
    loadOniAI();
  };

  const installSkills = async () => {
    setOcInstalling(true);
    try {
      const res = await fetch("/api/oni/install-skills", {
        method: "POST",
      });
      const data = await res.json();
      setOcMessage(
        data.success ? "OniOS skill installed for OniAI!" : data.error,
      );
    } catch (err) {
      setOcMessage("Install failed: " + err.message);
    }
    setOcInstalling(false);
    setTimeout(() => setOcMessage(""), 5000);
    loadOniAI();
  };

  if (ocLoading) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">
          <Cog size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          AI Provider
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

  const isOni = ocConfig?.mode === "oni";

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        <Cog size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
        AI Provider
      </h3>

      {/* Mode Toggle */}
      <div className="settings-row" style={{ marginBottom: 12 }}>
        <div className="settings-row-info">
          <span className="settings-row-label">AI Brain</span>
          <span className="settings-row-desc">
            Choose how Oni processes your requests
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          className={`settings-ai-wizard-option ${!isOni ? "active-provider" : ""}`}
          onClick={() => updateMode("personal")}
          disabled={ocSaving}
          style={{
            flex: 1,
            padding: "10px 12px",
            opacity: !isOni ? 1 : 0.5,
          }}
        >
          <Bot size={18} />
          <div>
            <strong>Personal AI</strong>
            <span
              className="settings-row-desc"
              style={{ display: "block", fontSize: 11 }}
            >
              Direct OpenAI — your keys, your models
            </span>
          </div>
        </button>
        <button
          className={`settings-ai-wizard-option ${isOni ? "active-provider" : ""}`}
          onClick={() => updateMode("oni")}
          disabled={ocSaving}
          style={{
            flex: 1,
            padding: "10px 12px",
            opacity: isOni ? 1 : 0.5,
          }}
        >
          <span style={{ fontSize: 18 }}>🦞</span>
          <div>
            <strong>OniAI</strong>
            <span
              className="settings-row-desc"
              style={{ display: "block", fontSize: 11 }}
            >
              Local AI agent with skills &amp; plugins
            </span>
          </div>
        </button>
      </div>

      {/* OniAI Config (only when OniAI mode) */}
      {isOni && (
        <>
          {/* Connection Status */}
          <div style={{ marginBottom: 10 }}>
            <div
              className={`settings-ai-auth-badge ${ocStatus?.gatewayRunning ? "connected" : "disconnected"}`}
            >
              {ocStatus?.gatewayRunning ? (
                <Wifi size={14} />
              ) : (
                <WifiOff size={14} />
              )}
              <span>
                Gateway:{" "}
                <strong>
                  {ocStatus?.gatewayRunning ? "running" : "stopped"}
                </strong>
              </span>
            </div>
            {ocStatus?.agentName && (
              <div className="settings-row-desc" style={{ marginTop: 4 }}>
                Agent: <strong>{ocStatus.agentName}</strong>
                {ocStatus.agentModel && (
                  <span style={{ opacity: 0.6 }}> ({ocStatus.agentModel})</span>
                )}
              </div>
            )}
            {ocStatus?.oniInstalled === false && (
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
                WebSocket address of your OniAI gateway
              </span>
            </div>
            <div className="settings-api-key-input-row">
              <input
                className="settings-api-key-input"
                value={ocConfig?.gatewayUrl || ""}
                onChange={(e) => updateGatewayUrl(e.target.value)}
                placeholder="ws://127.0.0.1:18789"
              />
              <button
                className="settings-api-key-save"
                onClick={saveGatewayUrl}
                disabled={ocSaving}
              >
                {ocSaving ? "..." : "Save"}
              </button>
            </div>
          </div>

          {/* Install OniOS Skill */}
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
              {ocStatus?.skillInstalled ? (
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
                <span style={{ fontSize: 11, color: "#e88" }}>
                  Not installed
                </span>
              )}
            </div>
            <span
              className="settings-row-desc"
              style={{ display: "block", marginBottom: 6 }}
            >
              Install the OniOS SKILL.md into OniAI so it can control your
              desktop
            </span>
            <button
              className="settings-api-key-save"
              onClick={installSkills}
              disabled={ocInstalling}
              style={{ width: "100%" }}
            >
              {ocInstalling ? (
                <Loader2
                  size={12}
                  className="oni-spin"
                  style={{ marginRight: 4 }}
                />
              ) : (
                <Download size={12} style={{ marginRight: 4 }} />
              )}
              {ocStatus?.skillInstalled
                ? "Reinstall Skill"
                : "Install OniOS Skill"}
            </button>
          </div>
        </>
      )}

      {/* Status Message */}
      {ocMessage && (
        <div
          className="settings-row-desc"
          style={{ padding: "6px 0", color: "#8d8", fontWeight: 500 }}
        >
          {ocMessage}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const wallpaper = useThemeStore((s) => s.wallpaper);
  const customWallpaper = useThemeStore((s) => s.customWallpaper);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setWallpaper = useThemeStore((s) => s.setWallpaper);
  const setCustomWallpaper = useThemeStore((s) => s.setCustomWallpaper);
  const clearCustomWallpaper = useThemeStore((s) => s.clearCustomWallpaper);
  const isDark = theme === "dark";
  const fileInputRef = useRef(null);

  // API Keys state
  const [apiKeys, setApiKeys] = useState(() => {
    const keys = {};
    API_KEYS.forEach((k) => {
      keys[k.id] = localStorage.getItem(k.id) || "";
    });
    return keys;
  });

  const [visibleKeys, setVisibleKeys] = useState({});
  const [savedKeys, setSavedKeys] = useState({});

  // ─── AI Auth Wizard State ───────────────────────────────
  const [authStatus, setAuthStatus] = useState(null); // {method, authenticated, account, ...}
  const [authLoading, setAuthLoading] = useState(true);
  const [wizardStep, setWizardStep] = useState(0); // 0=status, 1=choose, 2=oauth/apikey, 3=paste, 4=models, 5=done
  const [wizardMethod, setWizardMethod] = useState(null); // 'oauth' | 'apikey'
  const [authUrl, setAuthUrl] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [manualApiKey, setManualApiKey] = useState("");
  const [manualKeyVisible, setManualKeyVisible] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [wizardError, setWizardError] = useState("");
  const [wizardBusy, setWizardBusy] = useState(false);

  // Load auth status on mount
  const loadAuthStatus = useCallback(async () => {
    setAuthLoading(true);
    const status = await aiMemory.getAuthStatus();
    const config = await aiMemory.getConfig();
    setAuthStatus(status);
    setSelectedModel(config?.defaultModel || "gpt-4o");
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    loadAuthStatus();
  }, [loadAuthStatus]);

  // Step 1 → Start OAuth flow
  const startOAuth = async () => {
    setWizardBusy(true);
    setWizardError("");
    const result = await aiMemory.startAuth();
    if (result?.authUrl) {
      setAuthUrl(result.authUrl);
      window.open(result.authUrl, "_blank");
      setWizardStep(3); // go to paste step
    } else {
      setWizardError(result?.error || "Failed to start auth flow");
    }
    setWizardBusy(false);
  };

  // Step 3 → Exchange callback URL
  const exchangeCallback = async () => {
    if (!callbackUrl.trim()) return;
    setWizardBusy(true);
    setWizardError("");
    const result = await aiMemory.exchangeAuth(callbackUrl.trim());
    if (result?.ok) {
      // Now load models
      setWizardStep(4);
      loadModels();
    } else {
      setWizardError(result?.error || "Token exchange failed");
    }
    setWizardBusy(false);
  };

  // API Key manual save
  const saveManualApiKey = async () => {
    if (!manualApiKey.trim()) return;
    setWizardBusy(true);
    setWizardError("");
    await aiMemory.updateConfig({ apiKey: manualApiKey.trim() });
    localStorage.setItem("onios-api-openai", manualApiKey.trim());
    // Now load models
    setWizardStep(4);
    loadModels();
    setWizardBusy(false);
  };

  // Step 4 → Load models from OpenAI
  const loadModels = async () => {
    setWizardBusy(true);
    setWizardError("");
    const result = await aiMemory.getModels();
    if (result?.models) {
      setModels(result.models);
    } else {
      setWizardError(result?.error || "Could not load models");
    }
    setWizardBusy(false);
  };

  // Step 5 → Save model + finish
  const finishSetup = async () => {
    setWizardBusy(true);
    await aiMemory.updateConfig({ defaultModel: selectedModel });
    setWizardStep(0);
    await loadAuthStatus();
    setWizardBusy(false);
  };

  // Delete auth
  const handleDeleteAuth = async () => {
    setWizardBusy(true);
    await aiMemory.deleteAuth();
    await aiMemory.updateConfig({ apiKey: "" });
    localStorage.removeItem("onios-api-openai");
    setWizardStep(0);
    await loadAuthStatus();
    setWizardBusy(false);
  };

  // Reset wizard
  const resetWizard = () => {
    setWizardStep(1);
    setWizardMethod(null);
    setAuthUrl("");
    setCallbackUrl("");
    setManualApiKey("");
    setModels([]);
    setWizardError("");
  };

  const handleApiKeyChange = (id, value) => {
    setApiKeys((prev) => ({ ...prev, [id]: value }));
  };

  const saveApiKey = (id) => {
    localStorage.setItem(id, apiKeys[id]);
    setSavedKeys((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setSavedKeys((prev) => ({ ...prev, [id]: false })), 2000);
  };

  const toggleKeyVisibility = (id) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
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

      {/* API Keys */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <Key size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          API Keys
        </h3>

        {API_KEYS.map((apiKey) => (
          <div key={apiKey.id} className="settings-api-key">
            <div className="settings-api-key-info">
              <span className="settings-row-label">{apiKey.label}</span>
              <span className="settings-row-desc">{apiKey.description}</span>
            </div>
            <div className="settings-api-key-input-row">
              <div className="settings-api-key-input-wrapper">
                <input
                  className="settings-api-key-input"
                  type={visibleKeys[apiKey.id] ? "text" : "password"}
                  placeholder={apiKey.placeholder}
                  value={apiKeys[apiKey.id]}
                  onChange={(e) =>
                    handleApiKeyChange(apiKey.id, e.target.value)
                  }
                />
                <button
                  className="settings-api-key-toggle"
                  onClick={() => toggleKeyVisibility(apiKey.id)}
                  title={visibleKeys[apiKey.id] ? "Hide" : "Show"}
                >
                  {visibleKeys[apiKey.id] ? (
                    <EyeOff size={12} />
                  ) : (
                    <Eye size={12} />
                  )}
                </button>
              </div>
              <button
                className={`settings-api-key-save ${savedKeys[apiKey.id] ? "saved" : ""}`}
                onClick={() => saveApiKey(apiKey.id)}
              >
                {savedKeys[apiKey.id] ? "✓ Saved" : "Save"}
              </button>
            </div>
            {apiKey.helpUrl && (
              <a
                className="settings-api-key-help"
                href={apiKey.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get API key →
              </a>
            )}
          </div>
        ))}
      </div>

      {/* AI Authentication */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <Bot size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          AI Authentication
        </h3>

        {authLoading ? (
          <div className="settings-row-desc" style={{ padding: 8 }}>
            <Loader2
              size={14}
              className="oni-spin"
              style={{ display: "inline", marginRight: 6 }}
            />
            Loading...
          </div>
        ) : wizardStep === 0 ? (
          /* ─── Status View ─── */
          <div className="settings-ai-auth-status">
            {authStatus?.authenticated ? (
              <>
                <div className="settings-ai-auth-badge connected">
                  <CheckCircle2 size={14} />
                  <span>
                    Connected via{" "}
                    <strong>
                      {authStatus.method === "oauth"
                        ? "ChatGPT OAuth"
                        : "API Key"}
                    </strong>
                  </span>
                </div>
                {authStatus.account?.email && (
                  <div
                    className="settings-row-desc"
                    style={{ margin: "4px 0" }}
                  >
                    {authStatus.account.name || authStatus.account.email}
                    {authStatus.account.planType && (
                      <span style={{ opacity: 0.6 }}>
                        {" "}
                        ({authStatus.account.planType})
                      </span>
                    )}
                  </div>
                )}
                {authStatus.method === "apikey" && authStatus.keyHint && (
                  <div
                    className="settings-row-desc"
                    style={{ margin: "4px 0" }}
                  >
                    Key: {authStatus.keyHint}
                  </div>
                )}
                <div style={{ margin: "6px 0" }}>
                  <span
                    className="settings-row-desc"
                    style={{ display: "block", marginBottom: 4 }}
                  >
                    Model
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <select
                      className="settings-api-key-input"
                      value={selectedModel}
                      onChange={async (e) => {
                        setSelectedModel(e.target.value);
                        await aiMemory.updateConfig({
                          defaultModel: e.target.value,
                        });
                      }}
                      style={{ flex: 1 }}
                    >
                      <optgroup label="Flagship">
                        <option value="gpt-5.2">gpt-5.2</option>
                        <option value="gpt-5.2-pro">gpt-5.2-pro</option>
                        <option value="gpt-5.1">gpt-5.1</option>
                        <option value="gpt-5">gpt-5</option>
                        <option value="gpt-5-pro">gpt-5-pro</option>
                        <option value="gpt-5-mini">gpt-5-mini</option>
                        <option value="gpt-5-nano">gpt-5-nano</option>
                      </optgroup>
                      <optgroup label="Codex">
                        <option value="gpt-5.3-codex">gpt-5.3-codex</option>
                        <option value="gpt-5.2-codex">gpt-5.2-codex</option>
                        <option value="gpt-5.1-codex">gpt-5.1-codex</option>
                        <option value="gpt-5.1-codex-max">
                          gpt-5.1-codex-max
                        </option>
                        <option value="gpt-5.1-codex-mini">
                          gpt-5.1-codex-mini
                        </option>
                        <option value="gpt-5-codex">gpt-5-codex</option>
                      </optgroup>
                      <optgroup label="Reasoning">
                        <option value="o4-mini">o4-mini</option>
                        <option value="o3">o3</option>
                        <option value="o3-pro">o3-pro</option>
                        <option value="o3-mini">o3-mini</option>
                        <option value="o1">o1</option>
                        <option value="o1-pro">o1-pro</option>
                      </optgroup>
                      <optgroup label="GPT-4.1">
                        <option value="gpt-4.1">gpt-4.1</option>
                        <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                        <option value="gpt-4.1-nano">gpt-4.1-nano</option>
                      </optgroup>
                      <optgroup label="GPT-4o">
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    className="settings-api-key-save"
                    onClick={resetWizard}
                    style={{ flex: 1 }}
                  >
                    <RefreshCw size={11} style={{ marginRight: 4 }} />
                    Reconfigure
                  </button>
                  <button
                    className="settings-api-key-save"
                    onClick={handleDeleteAuth}
                    disabled={wizardBusy}
                    style={{
                      flex: 1,
                      background: "rgba(220,60,60,0.15)",
                      borderColor: "rgba(220,60,60,0.3)",
                      color: "#e55",
                    }}
                  >
                    <Trash2 size={11} style={{ marginRight: 4 }} />
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="settings-ai-auth-badge disconnected">
                  <AlertCircle size={14} />
                  <span>Not connected</span>
                </div>
                <p
                  className="settings-row-desc"
                  style={{ margin: "6px 0 10px" }}
                >
                  Connect your OpenAI account to power Oni AI assistant.
                </p>
                <button
                  className="settings-api-key-save"
                  onClick={resetWizard}
                  style={{ width: "100%" }}
                >
                  <LogIn size={12} style={{ marginRight: 4 }} />
                  Set Up AI
                </button>
              </>
            )}
          </div>
        ) : wizardStep === 1 ? (
          /* ─── Step 1: Choose Method ─── */
          <div className="settings-ai-wizard">
            <div className="settings-ai-wizard-step">
              Step 1 of 4 — Choose sign-in method
            </div>
            <button
              className="settings-ai-wizard-option"
              onClick={() => {
                setWizardMethod("oauth");
                setWizardStep(2);
              }}
            >
              <LogIn size={16} />
              <div>
                <strong>Sign in with ChatGPT</strong>
                <span className="settings-row-desc">
                  Recommended — uses your ChatGPT subscription
                </span>
              </div>
            </button>
            <button
              className="settings-ai-wizard-option"
              onClick={() => {
                setWizardMethod("apikey");
                setWizardStep(2);
              }}
            >
              <Key size={16} />
              <div>
                <strong>Enter API Key</strong>
                <span className="settings-row-desc">
                  Manual — use your OpenAI Platform API key
                </span>
              </div>
            </button>
            <button
              className="settings-ai-wizard-cancel"
              onClick={() => setWizardStep(0)}
            >
              Cancel
            </button>
          </div>
        ) : wizardStep === 2 && wizardMethod === "oauth" ? (
          /* ─── Step 2: OAuth — Open Browser ─── */
          <div className="settings-ai-wizard">
            <div className="settings-ai-wizard-step">
              Step 2 of 4 — Sign in with ChatGPT
            </div>
            <p className="settings-row-desc" style={{ margin: "0 0 10px" }}>
              Click below to open the OpenAI login page. After signing in, your
              browser will redirect to a URL starting with{" "}
              <code>localhost:1455</code>. The page may show an error —
              that&apos;s normal. Copy the <strong>full URL</strong> from your
              browser&apos;s address bar.
            </p>
            {wizardError && (
              <div className="settings-ai-wizard-error">
                <AlertCircle size={12} /> {wizardError}
              </div>
            )}
            <button
              className="settings-api-key-save"
              onClick={startOAuth}
              disabled={wizardBusy}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {wizardBusy ? (
                <Loader2
                  size={12}
                  className="oni-spin"
                  style={{ marginRight: 4 }}
                />
              ) : (
                <ExternalLink size={12} style={{ marginRight: 4 }} />
              )}
              Open ChatGPT Login
            </button>
            <button
              className="settings-ai-wizard-cancel"
              onClick={() => setWizardStep(1)}
            >
              Back
            </button>
          </div>
        ) : wizardStep === 2 && wizardMethod === "apikey" ? (
          /* ─── Step 2: Manual API Key ─── */
          <div className="settings-ai-wizard">
            <div className="settings-ai-wizard-step">
              Step 2 of 4 — Enter API Key
            </div>
            <div className="settings-api-key">
              <div className="settings-api-key-input-row">
                <div className="settings-api-key-input-wrapper">
                  <input
                    className="settings-api-key-input"
                    type={manualKeyVisible ? "text" : "password"}
                    placeholder="sk-xxxxxxxxxxxxxxxxxx"
                    value={manualApiKey}
                    onChange={(e) => setManualApiKey(e.target.value)}
                  />
                  <button
                    className="settings-api-key-toggle"
                    onClick={() => setManualKeyVisible((v) => !v)}
                  >
                    {manualKeyVisible ? (
                      <EyeOff size={12} />
                    ) : (
                      <Eye size={12} />
                    )}
                  </button>
                </div>
              </div>
              <a
                className="settings-api-key-help"
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get API key from OpenAI →
              </a>
            </div>
            {wizardError && (
              <div className="settings-ai-wizard-error">
                <AlertCircle size={12} /> {wizardError}
              </div>
            )}
            <button
              className="settings-api-key-save"
              onClick={saveManualApiKey}
              disabled={wizardBusy || !manualApiKey.trim()}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {wizardBusy ? (
                <Loader2
                  size={12}
                  className="oni-spin"
                  style={{ marginRight: 4 }}
                />
              ) : null}
              Continue
            </button>
            <button
              className="settings-ai-wizard-cancel"
              onClick={() => setWizardStep(1)}
            >
              Back
            </button>
          </div>
        ) : wizardStep === 3 ? (
          /* ─── Step 3: Paste Callback URL ─── */
          <div className="settings-ai-wizard">
            <div className="settings-ai-wizard-step">
              Step 3 of 4 — Paste the redirect URL
            </div>
            <p className="settings-row-desc" style={{ margin: "0 0 8px" }}>
              After signing in, your browser redirected to a URL like:
            </p>
            <code className="settings-ai-wizard-code">
              http://localhost:1455/auth/callback?code=...&amp;state=...
            </code>
            <p className="settings-row-desc" style={{ margin: "8px 0" }}>
              Copy that <strong>entire URL</strong> from your address bar and
              paste it below:
            </p>
            <div className="settings-api-key">
              <div className="settings-api-key-input-row">
                <div className="settings-api-key-input-wrapper">
                  <input
                    className="settings-api-key-input"
                    type="text"
                    placeholder="http://localhost:1455/auth/callback?code=..."
                    value={callbackUrl}
                    onChange={(e) => setCallbackUrl(e.target.value)}
                    style={{ paddingRight: 8 }}
                  />
                </div>
              </div>
            </div>
            {wizardError && (
              <div className="settings-ai-wizard-error">
                <AlertCircle size={12} /> {wizardError}
              </div>
            )}
            <button
              className="settings-api-key-save"
              onClick={exchangeCallback}
              disabled={wizardBusy || !callbackUrl.trim()}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {wizardBusy ? (
                <Loader2
                  size={12}
                  className="oni-spin"
                  style={{ marginRight: 4 }}
                />
              ) : (
                <ClipboardPaste size={12} style={{ marginRight: 4 }} />
              )}
              Verify &amp; Connect
            </button>
            <button
              className="settings-ai-wizard-cancel"
              onClick={() => setWizardStep(2)}
            >
              Back
            </button>
          </div>
        ) : wizardStep === 4 ? (
          /* ─── Step 4: Choose Model ─── */
          <div className="settings-ai-wizard">
            <div className="settings-ai-wizard-step">
              Step 4 of 4 — Choose your model
            </div>
            {wizardBusy ? (
              <div
                className="settings-row-desc"
                style={{ padding: 12, textAlign: "center" }}
              >
                <Loader2
                  size={14}
                  className="oni-spin"
                  style={{ display: "inline", marginRight: 6 }}
                />
                Loading available models...
              </div>
            ) : wizardError ? (
              <div className="settings-ai-wizard-error">
                <AlertCircle size={12} /> {wizardError}
                <button
                  className="settings-ai-wizard-cancel"
                  onClick={loadModels}
                  style={{ marginTop: 6 }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="settings-api-key">
                  <div className="settings-api-key-input-row">
                    <select
                      className="settings-api-key-input"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      {(() => {
                        const hasGroups = models.some((m) => m.group);
                        if (hasGroups) {
                          const groups = [];
                          const seen = new Set();
                          models.forEach((m) => {
                            const g = m.group || "Other";
                            if (!seen.has(g)) {
                              seen.add(g);
                              groups.push(g);
                            }
                          });
                          return groups.map((g) => (
                            <optgroup key={g} label={g}>
                              {models
                                .filter((m) => (m.group || "Other") === g)
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.id}
                                  </option>
                                ))}
                            </optgroup>
                          ));
                        }
                        return models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                  <span className="settings-row-desc" style={{ marginTop: 4 }}>
                    {models.length} models available
                  </span>
                </div>
                <button
                  className="settings-api-key-save"
                  onClick={finishSetup}
                  disabled={wizardBusy}
                  style={{ width: "100%", marginTop: 8 }}
                >
                  <CheckCircle2 size={12} style={{ marginRight: 4 }} />
                  Save &amp; Complete
                </button>
              </>
            )}
            <button
              className="settings-ai-wizard-cancel"
              onClick={() => setWizardStep(1)}
            >
              Start over
            </button>
          </div>
        ) : null}
      </div>

      {/* OniAI Integration */}
      <OniAISettings />

      {/* About */}
      <div className="settings-section">
        <h3 className="settings-section-title">About</h3>
        <div className="settings-about">
          <div className="settings-about-logo">OniOS</div>
          <span className="settings-about-version">Version 1.0.0</span>
          <span className="settings-about-desc">
            A command-driven widget operating system
          </span>
        </div>
      </div>
    </div>
  );
}
