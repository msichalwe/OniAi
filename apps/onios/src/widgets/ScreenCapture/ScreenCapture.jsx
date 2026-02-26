/**
 * ScreenCapture — Native screenshot & screen recording widget.
 *
 * Features:
 *   - Screenshot: full screen or specific window via getDisplayMedia
 *   - Screen recording: full screen or window with start/stop/save
 *   - Gallery of recent captures (screenshots + recordings)
 *   - Countdown timer before capture
 *   - Save to ~/Pictures/OniOS/Screenshots/ and ~/Videos/OniOS/Recordings/
 *   - AI can trigger captures programmatically via eventBus
 *
 * Uses the Screen Capture API (getDisplayMedia) which works in
 * Electron/Tauri/modern browsers.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MonitorUp,
  Camera,
  Video,
  VideoOff,
  Square,
  Download,
  Trash2,
  Timer,
  Image,
  Film,
  AppWindow,
} from "lucide-react";
import { useWidgetContext } from "../../core/useWidgetContext";
import { eventBus } from "../../core/EventBus";
import "./ScreenCapture.css";

const SCREENSHOT_DIR = "~/Pictures/OniOS/Screenshots";
const RECORDING_DIR = "~/Videos/OniOS/Recordings";

export default function ScreenCapture({ windowId, widgetType }) {
  const [mode, setMode] = useState("screenshot"); // screenshot | recording
  const [captures, setCaptures] = useState([]);
  const [selectedCapture, setSelectedCapture] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flash, setFlash] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [timerSetting, setTimerSetting] = useState(0);
  const [status, setStatus] = useState("Ready");

  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const streamRef = useRef(null);

  useWidgetContext(windowId, widgetType, {
    mode,
    isRecording,
    captureCount: captures.length,
    recordingTime,
    lastCapture: captures[0]?.name || null,
  });

  // Load saved captures on mount
  useEffect(() => {
    loadCaptures();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const loadCaptures = async () => {
    const items = [];
    // Load screenshots
    try {
      const res = await fetch(
        `/api/fs/list?path=${encodeURIComponent(SCREENSHOT_DIR.replace("~", ""))}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          data.items
            .filter(
              (f) =>
                !f.isDirectory && /\.(png|jpg|jpeg|webp)$/i.test(f.name),
            )
            .forEach((f) => items.push({ ...f, type: "screenshot" }));
        }
      }
    } catch {
      /* dir may not exist */
    }
    // Load recordings
    try {
      const res = await fetch(
        `/api/fs/list?path=${encodeURIComponent(RECORDING_DIR.replace("~", ""))}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          data.items
            .filter(
              (f) => !f.isDirectory && /\.(webm|mp4)$/i.test(f.name),
            )
            .forEach((f) => items.push({ ...f, type: "recording" }));
        }
      }
    } catch {
      /* dir may not exist */
    }
    items.sort((a, b) => (b.modified || 0) - (a.modified || 0));
    setCaptures(items);
  };

  // ─── Request screen stream ───────────────────
  const getScreenStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: mode === "recording",
      });
      streamRef.current = stream;
      return stream;
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setStatus("Screen sharing denied");
      } else {
        setStatus(`Error: ${err.message}`);
      }
      return null;
    }
  }, [mode]);

  // ─── Screenshot ──────────────────────────────
  const takeScreenshot = useCallback(async () => {
    setStatus("Requesting screen access...");
    const stream = await getScreenStream();
    if (!stream) return;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        // Wait a frame for the video to render
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      };
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    // Stop stream immediately after capture
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Flash
    setFlash(true);
    setTimeout(() => setFlash(false), 250);

    const dataUrl = canvas.toDataURL("image/png");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `screenshot-${timestamp}.png`;

    // Save to disk
    try {
      setStatus("Saving screenshot...");
      const res = await fetch("/api/fs/write-binary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `${SCREENSHOT_DIR}/${filename}`,
          data: dataUrl,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setStatus(`Saved: ${filename}`);
        await loadCaptures();
        // Select the new capture
        setSelectedCapture({ name: filename, type: "screenshot", dataUrl });
        eventBus.emit("screenshot:captured", { filename, path: result.path });
      } else {
        setStatus("Save failed");
      }
    } catch (err) {
      console.error("[ScreenCapture] Save error:", err);
      setStatus("Save error");
    }
  }, [getScreenStream]);

  // ─── Screenshot with optional countdown ──────
  const takeScreenshotWithTimer = useCallback(() => {
    if (timerSetting === 0) {
      takeScreenshot();
      return;
    }

    let remaining = timerSetting;
    setCountdown(remaining);

    countdownRef.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        setCountdown(0);
        takeScreenshot();
      }
    }, 1000);
  }, [timerSetting, takeScreenshot]);

  // ─── Start recording ────────────────────────
  const startRecording = useCallback(async () => {
    setStatus("Requesting screen access...");
    const stream = await getScreenStream();
    if (!stream) return;

    recordedChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      await saveRecording(blob);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    // Stop if user ends screen share via browser UI
    stream.getVideoTracks()[0].onended = () => {
      if (mediaRecorderRef.current?.state === "recording") {
        stopRecording();
      }
    };

    recorder.start(1000); // capture in 1s chunks
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingTime(0);
    setStatus("Recording...");

    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);
  }, [getScreenStream]);

  // ─── Stop recording ─────────────────────────
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setStatus("Saving recording...");
  }, []);

  // ─── Save recording blob ───────────────────
  const saveRecording = async (blob) => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `recording-${timestamp}.webm`;

    try {
      // Convert blob to base64
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      const res = await fetch("/api/fs/write-binary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `${RECORDING_DIR}/${filename}`,
          data: dataUrl,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setStatus(`Saved: ${filename}`);
        await loadCaptures();
        eventBus.emit("recording:saved", { filename, path: result.path });
      } else {
        setStatus("Save failed");
      }
    } catch (err) {
      console.error("[ScreenCapture] Recording save error:", err);
      setStatus("Save error");
    }
  };

  // ─── Delete capture ─────────────────────────
  const deleteCapture = useCallback(
    async (capture) => {
      const dir =
        capture.type === "screenshot" ? SCREENSHOT_DIR : RECORDING_DIR;
      try {
        await fetch("/api/fs/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: `${dir}/${capture.name}` }),
        });
        if (selectedCapture?.name === capture.name) {
          setSelectedCapture(null);
        }
        await loadCaptures();
        setStatus("Deleted");
      } catch {
        setStatus("Delete failed");
      }
    },
    [selectedCapture],
  );

  // ─── Download capture ───────────────────────
  const downloadCapture = useCallback((capture) => {
    const dir =
      capture.type === "screenshot" ? SCREENSHOT_DIR : RECORDING_DIR;
    const link = document.createElement("a");
    link.href = `/api/fs/read?path=${encodeURIComponent(`${dir}/${capture.name}`.replace("~", ""))}`;
    link.download = capture.name;
    link.click();
  }, []);

  // ─── Listen for AI commands ─────────────────
  const screenshotRef = useRef(null);
  screenshotRef.current = takeScreenshot;
  const startRecRef = useRef(null);
  startRecRef.current = startRecording;
  const stopRecRef = useRef(null);
  stopRecRef.current = stopRecording;

  useEffect(() => {
    const handleScreenshot = () => screenshotRef.current?.();
    const handleStartRec = () => startRecRef.current?.();
    const handleStopRec = () => stopRecRef.current?.();

    eventBus.on("screen:screenshot", handleScreenshot);
    eventBus.on("screen:record:start", handleStartRec);
    eventBus.on("screen:record:stop", handleStopRec);
    return () => {
      eventBus.off("screen:screenshot", handleScreenshot);
      eventBus.off("screen:record:start", handleStartRec);
      eventBus.off("screen:record:stop", handleStopRec);
    };
  }, []);

  // Format recording time
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Get thumbnail URL for a capture
  const getThumbnailUrl = (capture) => {
    if (capture.dataUrl) return capture.dataUrl;
    const dir =
      capture.type === "screenshot" ? SCREENSHOT_DIR : RECORDING_DIR;
    return `/api/fs/read?path=${encodeURIComponent(`${dir}/${capture.name}`.replace("~", ""))}`;
  };

  return (
    <div className="screen-capture">
      {/* Toolbar */}
      <div className="sc-toolbar">
        <div className="sc-mode-toggle">
          <button
            className={mode === "screenshot" ? "active" : ""}
            onClick={() => setMode("screenshot")}
          >
            <Camera size={13} />
            Screenshot
          </button>
          <button
            className={mode === "recording" ? "active" : ""}
            onClick={() => setMode("recording")}
          >
            <Video size={13} />
            Record
          </button>
        </div>

        <div className="sc-toolbar-divider" />

        {mode === "screenshot" && (
          <div className="sc-toolbar-group">
            <button
              className="sc-btn sc-btn-primary"
              onClick={takeScreenshotWithTimer}
              disabled={countdown > 0}
            >
              <MonitorUp size={13} />
              Capture
            </button>
            <button
              className="sc-btn"
              onClick={() =>
                setTimerSetting((t) => (t === 0 ? 3 : t === 3 ? 5 : t === 5 ? 10 : 0))
              }
              title="Countdown timer"
            >
              <Timer size={12} />
              {timerSetting > 0 ? `${timerSetting}s` : "Off"}
            </button>
          </div>
        )}

        {mode === "recording" && (
          <div className="sc-toolbar-group">
            {!isRecording ? (
              <button
                className="sc-btn sc-btn-primary"
                onClick={startRecording}
              >
                <Video size={13} />
                Start
              </button>
            ) : (
              <button className="sc-btn sc-btn-danger" onClick={stopRecording}>
                <Square size={13} />
                Stop ({formatTime(recordingTime)})
              </button>
            )}
          </div>
        )}

        {selectedCapture && (
          <>
            <div className="sc-toolbar-divider" />
            <div className="sc-toolbar-group">
              <button
                className="sc-btn"
                onClick={() => downloadCapture(selectedCapture)}
              >
                <Download size={12} />
              </button>
              <button
                className="sc-btn"
                onClick={() => deleteCapture(selectedCapture)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Preview */}
      <div className="sc-preview">
        {countdown > 0 && <div className="sc-countdown">{countdown}</div>}
        {flash && <div className="sc-flash" />}

        {isRecording && (
          <div className="sc-recording-indicator">
            <div className="sc-rec-dot" />
            REC {formatTime(recordingTime)}
          </div>
        )}

        {selectedCapture ? (
          selectedCapture.type === "recording" ? (
            <video
              src={getThumbnailUrl(selectedCapture)}
              controls
              autoPlay={false}
            />
          ) : (
            <img
              src={getThumbnailUrl(selectedCapture)}
              alt={selectedCapture.name}
            />
          )
        ) : (
          <div className="sc-preview-empty">
            <div className="sc-preview-empty-icon">
              {mode === "screenshot" ? (
                <MonitorUp size={48} strokeWidth={1} />
              ) : (
                <Film size={48} strokeWidth={1} />
              )}
            </div>
            <div>
              {mode === "screenshot"
                ? "Click Capture to take a screenshot"
                : isRecording
                  ? "Recording in progress..."
                  : "Click Start to begin recording"}
            </div>
            <div className="sc-preview-empty-hint">
              You can capture the entire screen or select a specific window.
              The AI can also trigger captures automatically.
            </div>
          </div>
        )}
      </div>

      {/* Gallery */}
      <div className="sc-gallery">
        {captures.length === 0 ? (
          <div className="sc-gallery-empty">No captures yet</div>
        ) : (
          captures.map((c, i) => (
            <div
              key={c.name || i}
              className={`sc-gallery-item ${c.type === "recording" ? "sc-gallery-item-video" : ""} ${selectedCapture?.name === c.name ? "active" : ""}`}
              onClick={() => setSelectedCapture(c)}
              title={c.name}
            >
              {c.type === "screenshot" ? (
                <img src={getThumbnailUrl(c)} alt={c.name} loading="lazy" />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "rgba(255,255,255,0.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Film size={20} style={{ opacity: 0.4 }} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Status bar */}
      <div className={`sc-status ${isRecording ? "sc-status-recording" : ""}`}>
        <span>{status}</span>
        <span>{captures.length} capture{captures.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
