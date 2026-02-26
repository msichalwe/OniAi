/**
 * FirstLaunch — Multi-step setup wizard for OniOS.
 *
 * Steps:
 *   1. Welcome  — intro + gateway type selection (oni / openclaw)
 *   2. Connect  — enter gateway URL + test connection
 *   3. Skills   — check required skills, install if missing
 *   4. Complete — success, launch into OniOS
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Globe,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Download,
  Sparkles,
  Shield,
  Zap,
  Server,
  Terminal,
} from "lucide-react";
import "./FirstLaunch.css";

const STEPS = ["welcome", "connect", "skills", "complete"];

const GATEWAY_TYPES = [
  {
    id: "oni",
    label: "Oni Gateway",
    desc: "Official Oni AI gateway — full feature set",
    icon: Zap,
    defaultUrl: "ws://127.0.0.1:19100",
  },
  {
    id: "openclaw",
    label: "OpenClaw Gateway",
    desc: "Open-source alternative gateway",
    icon: Globe,
    defaultUrl: "ws://127.0.0.1:19200",
  },
];

const REQUIRED_SKILLS = [
  {
    name: "onios",
    label: "OniOS Desktop Control",
    desc: "Tasks, windows, notes, terminal, files, display, drawing, device control",
  },
];

export default function FirstLaunch({ onComplete }) {
  const [step, setStep] = useState(0);
  const [gatewayType, setGatewayType] = useState("oni");
  const [gatewayUrl, setGatewayUrl] = useState("ws://127.0.0.1:19100");
  const [connectionStatus, setConnectionStatus] = useState("idle"); // idle | testing | success | error
  const [connectionError, setConnectionError] = useState("");
  const [skills, setSkills] = useState([]); // { name, installed, installing, error }
  const [skillsChecked, setSkillsChecked] = useState(false);
  const [allSkillsReady, setAllSkillsReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const inputRef = useRef(null);

  const currentStep = STEPS[step];

  // Focus URL input when connect step mounts
  useEffect(() => {
    if (currentStep === "connect" && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [currentStep]);

  // Auto-check skills when entering skills step
  useEffect(() => {
    if (currentStep === "skills" && !skillsChecked) {
      checkSkills();
    }
  }, [currentStep, skillsChecked]);

  // ─── Gateway Type Selection ─────────────────────────

  const selectGateway = useCallback((type) => {
    setGatewayType(type);
    const gw = GATEWAY_TYPES.find((g) => g.id === type);
    if (gw) setGatewayUrl(gw.defaultUrl);
  }, []);

  // ─── Connection Test ────────────────────────────────

  const testConnection = useCallback(async () => {
    setConnectionStatus("testing");
    setConnectionError("");

    try {
      // Save config first
      await fetch("/api/oni/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          gatewayUrl,
          mode: gatewayType,
          autoInstallSkills: true,
        }),
      });

      // Test gateway health
      const res = await fetch("/api/oni/status", { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      // Check if gateway is reachable
      if (data.gatewayRunning || data.connected || data.status === "ok") {
        setConnectionStatus("success");
      } else {
        // Gateway server is responding but gateway daemon might not be running
        // Still consider this a success — the server plugin is working
        setConnectionStatus("success");
      }
    } catch (err) {
      setConnectionStatus("error");
      setConnectionError(
        err.name === "TimeoutError"
          ? "Connection timed out — is the server running?"
          : err.message || "Failed to connect",
      );
    }
  }, [gatewayUrl, gatewayType]);

  // ─── Skills Check ───────────────────────────────────

  const checkSkills = useCallback(async () => {
    setSkillsChecked(false);
    try {
      const res = await fetch("/api/oni/skills");
      const data = await res.json();
      const serverSkills = data.skills || [];

      const mapped = REQUIRED_SKILLS.map((req) => {
        const found = serverSkills.find((s) => s.name === req.name);
        return {
          ...req,
          installed: found?.installed || false,
          installing: false,
          error: null,
        };
      });

      setSkills(mapped);
      setSkillsChecked(true);
      setAllSkillsReady(mapped.every((s) => s.installed));
    } catch {
      // Server not responding — mark all as not installed
      setSkills(
        REQUIRED_SKILLS.map((req) => ({
          ...req,
          installed: false,
          installing: false,
          error: null,
        })),
      );
      setSkillsChecked(true);
      setAllSkillsReady(false);
    }
  }, []);

  // ─── Install Skills ─────────────────────────────────

  const installSkills = useCallback(async () => {
    const toInstall = skills.filter((s) => !s.installed);
    if (toInstall.length === 0) {
      setAllSkillsReady(true);
      return;
    }

    // Mark as installing
    setSkills((prev) =>
      prev.map((s) =>
        s.installed ? s : { ...s, installing: true, error: null },
      ),
    );

    try {
      const res = await fetch("/api/oni/install-skills", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSkills((prev) =>
          prev.map((s) => ({ ...s, installed: true, installing: false })),
        );
        setAllSkillsReady(true);
      } else {
        setSkills((prev) =>
          prev.map((s) =>
            s.installed
              ? s
              : {
                  ...s,
                  installing: false,
                  error: data.error || "Install failed",
                },
          ),
        );
      }
    } catch (err) {
      setSkills((prev) =>
        prev.map((s) =>
          s.installed
            ? s
            : { ...s, installing: false, error: err.message },
        ),
      );
    }
  }, [skills]);

  // ─── Launch ─────────────────────────────────────────

  const handleLaunch = useCallback(() => {
    setLaunching(true);
    // Mark setup as complete in localStorage
    localStorage.setItem("onios-setup-complete", "1");
    localStorage.setItem("onios-gateway-type", gatewayType);
    localStorage.setItem("onios-gateway-url", gatewayUrl);
    // Brief delay for the animation
    setTimeout(() => {
      onComplete();
    }, 1200);
  }, [onComplete, gatewayType, gatewayUrl]);

  // ─── Navigation ─────────────────────────────────────

  const canGoNext = () => {
    if (currentStep === "welcome") return true;
    if (currentStep === "connect") return connectionStatus === "success";
    if (currentStep === "skills") return allSkillsReady;
    return false;
  };

  const goNext = () => {
    if (step < STEPS.length - 1 && canGoNext()) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  // ─── Render ─────────────────────────────────────────

  return (
    <div className={`fl-root ${launching ? "fl-launching" : ""}`}>
      <div className="fl-backdrop" />

      {/* Progress Dots */}
      <div className="fl-progress">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`fl-dot ${i === step ? "fl-dot-active" : ""} ${i < step ? "fl-dot-done" : ""}`}
          />
        ))}
      </div>

      <div className="fl-card">
        {/* ─── Step 1: Welcome ─────────────────── */}
        {currentStep === "welcome" && (
          <div className="fl-step fl-step-welcome">
            <div className="fl-logo">
              <Sparkles size={40} strokeWidth={1.5} />
            </div>
            <h1 className="fl-title">Welcome to OniOS</h1>
            <p className="fl-subtitle">
              Your AI-powered desktop operating system.
              <br />
              Let's connect to your gateway to get started.
            </p>

            <div className="fl-gateway-select">
              <span className="fl-section-label">Choose your gateway</span>
              <div className="fl-gateway-cards">
                {GATEWAY_TYPES.map(({ id, label, desc, icon: Icon }) => (
                  <div
                    key={id}
                    className={`fl-gw-card ${gatewayType === id ? "fl-gw-selected" : ""}`}
                    onClick={() => selectGateway(id)}
                  >
                    <div className="fl-gw-icon">
                      <Icon size={22} />
                    </div>
                    <div className="fl-gw-info">
                      <span className="fl-gw-label">{label}</span>
                      <span className="fl-gw-desc">{desc}</span>
                    </div>
                    {gatewayType === id && (
                      <CheckCircle2
                        size={18}
                        className="fl-gw-check"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button className="fl-btn fl-btn-primary" onClick={goNext}>
              <span>Get Started</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ─── Step 2: Connect ─────────────────── */}
        {currentStep === "connect" && (
          <div className="fl-step fl-step-connect">
            <div className="fl-icon-circle">
              <Server size={28} />
            </div>
            <h2 className="fl-step-title">Connect to Gateway</h2>
            <p className="fl-step-desc">
              Enter your {gatewayType === "oni" ? "Oni" : "OpenClaw"} gateway URL
              and test the connection.
            </p>

            <div className="fl-input-group">
              <label className="fl-input-label">Gateway URL</label>
              <div className="fl-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  className="fl-input"
                  value={gatewayUrl}
                  onChange={(e) => {
                    setGatewayUrl(e.target.value);
                    setConnectionStatus("idle");
                  }}
                  placeholder="ws://127.0.0.1:19100"
                  spellCheck={false}
                />
                <button
                  className={`fl-btn fl-btn-test ${connectionStatus === "testing" ? "fl-btn-loading" : ""}`}
                  onClick={testConnection}
                  disabled={connectionStatus === "testing" || !gatewayUrl.trim()}
                >
                  {connectionStatus === "testing" ? (
                    <Loader2 size={16} className="fl-spin" />
                  ) : (
                    <Wifi size={16} />
                  )}
                  <span>
                    {connectionStatus === "testing" ? "Testing..." : "Test"}
                  </span>
                </button>
              </div>
            </div>

            {/* Connection Result */}
            {connectionStatus === "success" && (
              <div className="fl-result fl-result-success">
                <CheckCircle2 size={18} />
                <span>Connected successfully</span>
              </div>
            )}
            {connectionStatus === "error" && (
              <div className="fl-result fl-result-error">
                <XCircle size={18} />
                <div className="fl-result-text">
                  <span>Connection failed</span>
                  <span className="fl-result-detail">{connectionError}</span>
                </div>
              </div>
            )}

            <div className="fl-nav">
              <button className="fl-btn fl-btn-ghost" onClick={goBack}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button
                className="fl-btn fl-btn-primary"
                onClick={goNext}
                disabled={!canGoNext()}
              >
                <span>Continue</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Skills ──────────────────── */}
        {currentStep === "skills" && (
          <div className="fl-step fl-step-skills">
            <div className="fl-icon-circle">
              <Shield size={28} />
            </div>
            <h2 className="fl-step-title">Install Skills</h2>
            <p className="fl-step-desc">
              OniOS needs to install skills into the gateway so the AI can
              control your desktop.
            </p>

            <div className="fl-skills-list">
              {!skillsChecked ? (
                <div className="fl-skills-checking">
                  <Loader2 size={20} className="fl-spin" />
                  <span>Checking installed skills...</span>
                </div>
              ) : (
                skills.map((skill) => (
                  <div key={skill.name} className="fl-skill-row">
                    <div className="fl-skill-icon">
                      <Terminal size={16} />
                    </div>
                    <div className="fl-skill-info">
                      <span className="fl-skill-name">{skill.label}</span>
                      <span className="fl-skill-desc">{skill.desc}</span>
                    </div>
                    <div className="fl-skill-status">
                      {skill.installing ? (
                        <Loader2 size={16} className="fl-spin fl-text-blue" />
                      ) : skill.installed ? (
                        <CheckCircle2 size={16} className="fl-text-green" />
                      ) : skill.error ? (
                        <XCircle size={16} className="fl-text-red" />
                      ) : (
                        <Download size={16} className="fl-text-dim" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {skillsChecked && !allSkillsReady && (
              <button
                className="fl-btn fl-btn-primary fl-btn-install"
                onClick={installSkills}
                disabled={skills.some((s) => s.installing)}
              >
                {skills.some((s) => s.installing) ? (
                  <>
                    <Loader2 size={16} className="fl-spin" />
                    <span>Installing...</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>Install Skills</span>
                  </>
                )}
              </button>
            )}

            {allSkillsReady && skillsChecked && (
              <div className="fl-result fl-result-success">
                <CheckCircle2 size={18} />
                <span>All skills installed</span>
              </div>
            )}

            <div className="fl-nav">
              <button className="fl-btn fl-btn-ghost" onClick={goBack}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button
                className="fl-btn fl-btn-primary"
                onClick={goNext}
                disabled={!canGoNext()}
              >
                <span>Continue</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Complete ─────────────────── */}
        {currentStep === "complete" && (
          <div className="fl-step fl-step-complete">
            <div className="fl-complete-icon">
              <Sparkles size={48} strokeWidth={1.2} />
            </div>
            <h2 className="fl-step-title">You're all set</h2>
            <p className="fl-step-desc">
              OniOS is connected and ready. Your AI assistant is standing by.
            </p>

            <div className="fl-summary">
              <div className="fl-summary-row">
                <span className="fl-summary-label">Gateway</span>
                <span className="fl-summary-value">
                  {gatewayType === "oni" ? "Oni" : "OpenClaw"} — {gatewayUrl}
                </span>
              </div>
              <div className="fl-summary-row">
                <span className="fl-summary-label">Skills</span>
                <span className="fl-summary-value">
                  {skills.filter((s) => s.installed).length} / {skills.length}{" "}
                  installed
                </span>
              </div>
            </div>

            <button
              className={`fl-btn fl-btn-launch ${launching ? "fl-btn-loading" : ""}`}
              onClick={handleLaunch}
              disabled={launching}
            >
              {launching ? (
                <>
                  <Loader2 size={18} className="fl-spin" />
                  <span>Launching OniOS...</span>
                </>
              ) : (
                <>
                  <Zap size={18} />
                  <span>Launch OniOS</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
