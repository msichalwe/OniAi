/**
 * Camera — WebRTC camera widget with photo capture, gallery, and save-to-disk.
 *
 * Features:
 *   - Live camera viewfinder using getUserMedia
 *   - Photo capture with flash animation
 *   - Gallery of recent captures (stored in ~/Pictures/OniOS/)
 *   - Camera switching (front/back on mobile)
 *   - Mirror toggle
 *   - Timer countdown (3s, 5s, 10s)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera as CameraIcon,
  SwitchCamera,
  Download,
  Trash2,
  FlipHorizontal,
  Timer,
  Image,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  AlertCircle,
} from "lucide-react";
import { useWidgetContext } from "../../core/useWidgetContext";
import { eventBus } from "../../core/EventBus";
import "./Camera.css";

const PHOTO_DIR = "~/Pictures/OniOS";

export default function CameraWidget({ windowId, widgetType }) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showGallery, setShowGallery] = useState(false);
  const [flash, setFlash] = useState(false);
  const [mirrored, setMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState("user");
  const [countdown, setCountdown] = useState(0);
  const [timerSetting, setTimerSetting] = useState(0);
  const [devices, setDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownRef = useRef(null);

  // Report widget context
  useWidgetContext(windowId, widgetType, {
    photoCount: photos.length,
    streaming: !!stream,
    lastCapture: photos[0]?.name || null,
  });

  // Load saved photos list on mount
  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      const res = await fetch(
        `/api/fs/list?path=${encodeURIComponent(PHOTO_DIR.replace("~", ""))}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          const imageFiles = data.items
            .filter(
              (f) =>
                !f.isDirectory && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name),
            )
            .sort((a, b) => (b.modified || 0) - (a.modified || 0));
          setPhotos(imageFiles);
        }
      }
    } catch {
      // Directory might not exist yet
    }
  };

  // Start camera
  const startCamera = useCallback(
    async (deviceId) => {
      try {
        // Stop existing stream
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }

        const constraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        };

        const newStream =
          await navigator.mediaDevices.getUserMedia(constraints);
        setStream(newStream);
        setError(null);

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }

        // Get available devices
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoDevices);

        const activeTrack = newStream.getVideoTracks()[0];
        setActiveDeviceId(activeTrack?.getSettings()?.deviceId || null);
      } catch (err) {
        console.error("[Camera] Error:", err);
        setError(
          err.name === "NotAllowedError"
            ? "Camera access denied. Please allow camera permissions."
            : err.name === "NotFoundError"
              ? "No camera found on this device."
              : `Camera error: ${err.message}`,
        );
      }
    },
    [stream, facingMode],
  );

  // Start on mount
  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch camera
  const switchCamera = useCallback(() => {
    if (devices.length <= 1) return;
    const currentIdx = devices.findIndex((d) => d.deviceId === activeDeviceId);
    const nextIdx = (currentIdx + 1) % devices.length;
    startCamera(devices[nextIdx].deviceId);
  }, [devices, activeDeviceId, startCamera]);

  // Capture photo
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    // Get base64 data
    const dataUrl = canvas.toDataURL("image/png");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `capture-${timestamp}.png`;

    // Save to disk
    try {
      const res = await fetch("/api/fs/write-binary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `${PHOTO_DIR}/${filename}`,
          data: dataUrl,
        }),
      });
      const result = await res.json();
      if (result.success) {
        // Reload photos
        await loadPhotos();
      }
    } catch (err) {
      console.error("[Camera] Save error:", err);
    }
  }, [mirrored]);

  // Listen for programmatic capture (from AI via eventBus)
  const captureRef = useRef(null);
  captureRef.current = capturePhoto;
  useEffect(() => {
    const handler = () => {
      if (captureRef.current) captureRef.current();
    };
    eventBus.on("camera:capture", handler);
    return () => eventBus.off("camera:capture", handler);
  }, []);

  // Capture with timer
  const captureWithTimer = useCallback(() => {
    if (timerSetting === 0) {
      capturePhoto();
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
        capturePhoto();
      }
    }, 1000);
  }, [timerSetting, capturePhoto]);

  // Cycle timer setting
  const cycleTimer = useCallback(() => {
    const options = [0, 3, 5, 10];
    const idx = options.indexOf(timerSetting);
    setTimerSetting(options[(idx + 1) % options.length]);
  }, [timerSetting]);

  // Delete photo
  const deletePhoto = useCallback(
    async (photoPath) => {
      try {
        await fetch(`/api/fs/delete?path=${encodeURIComponent(photoPath)}`);
        await loadPhotos();
        if (selectedPhoto?.path === photoPath) setSelectedPhoto(null);
      } catch {
        /* ignore */
      }
    },
    [selectedPhoto],
  );

  // Gallery navigation
  const navigateGallery = useCallback(
    (dir) => {
      if (!selectedPhoto || photos.length === 0) return;
      const idx = photos.findIndex((p) => p.path === selectedPhoto.path);
      const nextIdx = (idx + dir + photos.length) % photos.length;
      setSelectedPhoto(photos[nextIdx]);
    },
    [selectedPhoto, photos],
  );

  return (
    <div className="camera-widget">
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Error state */}
      {error && (
        <div className="camera-error">
          <AlertCircle size={32} />
          <p>{error}</p>
          <button onClick={() => startCamera()}>Try Again</button>
        </div>
      )}

      {/* Fullscreen photo viewer */}
      {selectedPhoto && (
        <div className="camera-viewer">
          <div className="camera-viewer-header">
            <button onClick={() => setSelectedPhoto(null)}>
              <X size={16} />
            </button>
            <span className="camera-viewer-name">{selectedPhoto.name}</span>
            <button onClick={() => deletePhoto(selectedPhoto.path)}>
              <Trash2 size={14} />
            </button>
          </div>
          <div className="camera-viewer-body">
            <button
              className="camera-viewer-nav"
              onClick={() => navigateGallery(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <img
              src={`/api/fs/media?path=${encodeURIComponent(selectedPhoto.path)}`}
              alt={selectedPhoto.name}
              className="camera-viewer-img"
            />
            <button
              className="camera-viewer-nav"
              onClick={() => navigateGallery(1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Camera viewfinder */}
      {!error && !selectedPhoto && (
        <div className="camera-viewfinder">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`camera-video ${mirrored ? "camera-mirrored" : ""}`}
          />

          {/* Flash overlay */}
          {flash && <div className="camera-flash" />}

          {/* Countdown overlay */}
          {countdown > 0 && <div className="camera-countdown">{countdown}</div>}

          {/* Controls overlay */}
          <div className="camera-controls">
            <div className="camera-controls-left">
              <button
                className="camera-ctrl-btn"
                onClick={() => setMirrored(!mirrored)}
                title="Mirror"
              >
                <FlipHorizontal size={16} />
              </button>
              <button
                className={`camera-ctrl-btn ${timerSetting > 0 ? "camera-ctrl-active" : ""}`}
                onClick={cycleTimer}
                title={`Timer: ${timerSetting || "Off"}`}
              >
                <Timer size={16} />
                {timerSetting > 0 && (
                  <span className="camera-timer-badge">{timerSetting}s</span>
                )}
              </button>
            </div>

            <button
              className="camera-capture-btn"
              onClick={captureWithTimer}
              disabled={countdown > 0}
              title="Capture"
            >
              <div className="camera-capture-inner" />
            </button>

            <div className="camera-controls-right">
              {devices.length > 1 && (
                <button
                  className="camera-ctrl-btn"
                  onClick={switchCamera}
                  title="Switch camera"
                >
                  <SwitchCamera size={16} />
                </button>
              )}
              <button
                className={`camera-ctrl-btn ${showGallery ? "camera-ctrl-active" : ""}`}
                onClick={() => setShowGallery(!showGallery)}
                title="Gallery"
              >
                <Image size={16} />
                {photos.length > 0 && (
                  <span className="camera-photo-count">{photos.length}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery strip */}
      {showGallery && !selectedPhoto && (
        <div className="camera-gallery">
          <div className="camera-gallery-header">
            <span>Photos ({photos.length})</span>
          </div>
          <div className="camera-gallery-grid">
            {photos.length === 0 ? (
              <div className="camera-gallery-empty">
                <CameraIcon size={20} />
                <span>No photos yet. Capture one!</span>
              </div>
            ) : (
              photos.map((photo) => (
                <div
                  key={photo.path}
                  className="camera-gallery-item"
                  onClick={() => setSelectedPhoto(photo)}
                >
                  <img
                    src={`/api/fs/media?path=${encodeURIComponent(photo.path)}`}
                    alt={photo.name}
                    loading="lazy"
                  />
                  <button
                    className="camera-gallery-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePhoto(photo.path);
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
