import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
} from "lucide-react";
import "./MediaPlayer.css";

export default function MediaPlayer({ src }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seek = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * duration;
  };

  const changeVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (t) => {
    if (!t || isNaN(t)) return "0:00";
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="media-player">
      <div className="media-player-video-container">
        {src ? (
          <video
            ref={videoRef}
            className="media-player-video"
            src={src}
            onClick={togglePlay}
          />
        ) : (
          <div className="media-player-placeholder">
            <div className="media-player-placeholder-icon">🎬</div>
            <div className="media-player-placeholder-text">
              No media loaded. Use <code>system.media.playVideo("url")</code>
            </div>
          </div>
        )}
      </div>

      <div className="media-player-controls">
        <div className="media-player-progress" onClick={seek}>
          <div
            className="media-player-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="media-player-actions">
          <button
            className="media-player-btn"
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime -= 10;
            }}
          >
            <SkipBack />
          </button>
          <button className="media-player-btn play" onClick={togglePlay}>
            {isPlaying ? <Pause /> : <Play />}
          </button>
          <button
            className="media-player-btn"
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime += 10;
            }}
          >
            <SkipForward />
          </button>

          <span className="media-player-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="media-player-spacer" />

          <div className="media-player-volume">
            <button className="media-player-btn" onClick={toggleMute}>
              {isMuted ? <VolumeX /> : <Volume2 />}
            </button>
            <input
              type="range"
              className="media-player-volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={changeVolume}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
