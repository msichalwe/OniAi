/**
 * OniAvatar — Animated SVG character for the Oni AI assistant.
 *
 * Props:
 *   emotion  — emotion name from OniEmotions (default: 'neutral')
 *   action   — current action name (maps to emotion via ACTION_EMOTIONS)
 *   size     — avatar size in px (default: 120)
 *   speaking — whether the AI is currently outputting text
 *   onClick  — click handler
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { getEmotion, getEmotionForAction, EMOTIONS } from "./OniEmotions";
import "./OniAvatar.css";

export default function OniAvatar({
  emotion = "neutral",
  action = null,
  size = 120,
  speaking = false,
  onClick,
}) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [prevEmotion, setPrevEmotion] = useState(emotion);
  const [transitioning, setTransitioning] = useState(false);
  const svgRef = useRef(null);
  const blinkTimerRef = useRef(null);

  // Resolve emotion from action or direct prop
  const resolvedEmotionName = action
    ? getEmotionForAction(action).name
    : emotion;

  const emo = useMemo(
    () => getEmotion(resolvedEmotionName),
    [resolvedEmotionName],
  );

  // Emotion transition
  useEffect(() => {
    if (resolvedEmotionName !== prevEmotion) {
      setTransitioning(true);
      const t = setTimeout(() => {
        setPrevEmotion(resolvedEmotionName);
        setTransitioning(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [resolvedEmotionName, prevEmotion]);

  // Blinking
  useEffect(() => {
    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    };

    const scheduleNext = () => {
      const rate = emo.blinkRate || 3500;
      const jitter = (Math.random() - 0.5) * rate * 0.5;
      blinkTimerRef.current = setTimeout(() => {
        blink();
        scheduleNext();
      }, rate + jitter);
    };

    scheduleNext();
    return () => clearTimeout(blinkTimerRef.current);
  }, [emo.blinkRate]);

  // Pupil follow mouse (subtle)
  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    const maxShift = 4;
    setPupilOffset({
      x: Math.max(-maxShift, Math.min(maxShift, dx * maxShift * 2)),
      y: Math.max(-maxShift, Math.min(maxShift, dy * maxShift * 2)),
    });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  // Dimensions
  const w = size;
  const h = size * 1.1;
  const centerX = w / 2;
  const centerY = h / 2;
  const scale = size / 120;

  // Eye positions
  const leftEyeX = centerX - 20 * scale;
  const rightEyeX = centerX + 20 * scale;
  const eyeY = centerY - 8 * scale;

  // Blink scale for eyes
  const eyeScaleY = isBlinking ? 0.08 : 1;

  // Pupil positions
  const pOff = emo.pupil;
  const pupilDx = (pOff.offsetX + pupilOffset.x) * scale;
  const pupilDy = (pOff.offsetY + pupilOffset.y) * scale;

  // Brow positions
  const browLen = 14 * scale;
  const browY = eyeY - (emo.leftEye.ry + 6) * scale + emo.brow.offsetY * scale;

  // Body
  const bodyW = 70 * scale;
  const bodyH = 80 * scale;
  const bodyX = centerX - bodyW / 2;
  const bodyY = centerY - bodyH / 2 + 4 * scale;
  const bodyR = 20 * scale;

  return (
    <div
      className={`oni-avatar-wrap ${emo.bodyAnim || ""} ${transitioning ? "oni-transitioning" : ""} ${speaking ? "oni-speaking" : ""}`}
      style={{ width: w, height: h, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        className="oni-avatar-svg"
      >
        <defs>
          {/* Eye highlight gradient */}
          <radialGradient id="eyeHighlight" cx="35%" cy="30%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          {/* Body gradient */}
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a2a2e" />
            <stop offset="100%" stopColor="#1a1a1e" />
          </linearGradient>
          {/* Glow filter */}
          {emo.glow && (
            <filter id="oniGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
          {/* Pupil gradient */}
          <radialGradient id="pupilGrad" cx="40%" cy="35%" r="50%">
            <stop offset="0%" stopColor="#5c3a1e" />
            <stop offset="60%" stopColor="#3a2010" />
            <stop offset="100%" stopColor="#1a0a00" />
          </radialGradient>
        </defs>

        {/* Glow aura */}
        {emo.glow && (
          <ellipse
            cx={centerX}
            cy={centerY}
            rx={bodyW * 0.7}
            ry={bodyH * 0.7}
            fill={emo.glow}
            className="oni-glow-aura"
          />
        )}

        {/* Body */}
        <rect
          x={bodyX}
          y={bodyY}
          width={bodyW}
          height={bodyH}
          rx={bodyR}
          fill="url(#bodyGrad)"
          stroke="#3a3a40"
          strokeWidth={1.5 * scale}
          className="oni-body"
          filter={emo.glow ? "url(#oniGlow)" : undefined}
        />

        {/* Left eye white */}
        <ellipse
          cx={leftEyeX}
          cy={eyeY + emo.leftEye.offsetY * scale}
          rx={emo.leftEye.rx * scale}
          ry={emo.leftEye.ry * scale * eyeScaleY}
          fill="#fff"
          className="oni-eye oni-eye-left"
        />
        {/* Right eye white */}
        <ellipse
          cx={rightEyeX}
          cy={eyeY + emo.rightEye.offsetY * scale}
          rx={emo.rightEye.rx * scale}
          ry={emo.rightEye.ry * scale * eyeScaleY}
          fill="#fff"
          className="oni-eye oni-eye-right"
        />

        {/* Left pupil (brown) */}
        {!isBlinking && (
          <ellipse
            cx={leftEyeX + pupilDx}
            cy={eyeY + emo.leftEye.offsetY * scale + pupilDy}
            rx={pOff.rx * scale}
            ry={pOff.ry * scale}
            fill="url(#pupilGrad)"
            className="oni-pupil oni-pupil-left"
          />
        )}
        {/* Right pupil (brown) */}
        {!isBlinking && (
          <ellipse
            cx={rightEyeX + pupilDx}
            cy={eyeY + emo.rightEye.offsetY * scale + pupilDy}
            rx={pOff.rx * scale}
            ry={pOff.ry * scale}
            fill="url(#pupilGrad)"
            className="oni-pupil oni-pupil-right"
          />
        )}

        {/* Eye highlights */}
        {!isBlinking && (
          <>
            <ellipse
              cx={leftEyeX - 3 * scale}
              cy={eyeY + emo.leftEye.offsetY * scale - 4 * scale}
              rx={4 * scale}
              ry={5 * scale}
              fill="rgba(255,255,255,0.6)"
              className="oni-eye-highlight"
            />
            <ellipse
              cx={rightEyeX - 3 * scale}
              cy={eyeY + emo.rightEye.offsetY * scale - 4 * scale}
              rx={4 * scale}
              ry={5 * scale}
              fill="rgba(255,255,255,0.6)"
              className="oni-eye-highlight"
            />
          </>
        )}

        {/* Eyebrows */}
        <line
          x1={leftEyeX - browLen * 0.5}
          y1={browY}
          x2={leftEyeX + browLen * 0.5}
          y2={browY}
          stroke="#666"
          strokeWidth={2.5 * scale}
          strokeLinecap="round"
          transform={`rotate(${emo.brow.leftAngle}, ${leftEyeX}, ${browY})`}
          className="oni-brow oni-brow-left"
        />
        <line
          x1={rightEyeX - browLen * 0.5}
          y1={browY}
          x2={rightEyeX + browLen * 0.5}
          y2={browY}
          stroke="#666"
          strokeWidth={2.5 * scale}
          strokeLinecap="round"
          transform={`rotate(${emo.brow.rightAngle}, ${rightEyeX}, ${browY})`}
          className="oni-brow oni-brow-right"
        />

        {/* Special effects */}
        {emo.special === "hearts" && (
          <g className="oni-special-hearts">
            <text
              x={centerX - 25 * scale}
              y={bodyY - 5 * scale}
              fontSize={10 * scale}
              className="oni-heart oni-heart-1"
            >
              ♥
            </text>
            <text
              x={centerX + 15 * scale}
              y={bodyY - 10 * scale}
              fontSize={8 * scale}
              className="oni-heart oni-heart-2"
            >
              ♥
            </text>
            <text
              x={centerX + 5 * scale}
              y={bodyY - 18 * scale}
              fontSize={12 * scale}
              className="oni-heart oni-heart-3"
            >
              ♥
            </text>
          </g>
        )}
        {emo.special === "sparkles" && (
          <g className="oni-special-sparkles">
            <text
              x={centerX - 30 * scale}
              y={bodyY - 2 * scale}
              fontSize={8 * scale}
              className="oni-sparkle oni-sparkle-1"
            >
              ✦
            </text>
            <text
              x={centerX + 25 * scale}
              y={bodyY - 8 * scale}
              fontSize={6 * scale}
              className="oni-sparkle oni-sparkle-2"
            >
              ✦
            </text>
            <text
              x={centerX - 5 * scale}
              y={bodyY - 20 * scale}
              fontSize={10 * scale}
              className="oni-sparkle oni-sparkle-3"
            >
              ✦
            </text>
          </g>
        )}
        {emo.special === "thought-bubble" && (
          <g className="oni-special-thought">
            <circle
              cx={centerX + 28 * scale}
              cy={bodyY - 5 * scale}
              r={3 * scale}
              fill="#555"
              opacity={0.5}
              className="oni-thought-dot-1"
            />
            <circle
              cx={centerX + 34 * scale}
              cy={bodyY - 14 * scale}
              r={4 * scale}
              fill="#555"
              opacity={0.4}
              className="oni-thought-dot-2"
            />
            <circle
              cx={centerX + 38 * scale}
              cy={bodyY - 24 * scale}
              r={6 * scale}
              fill="#555"
              opacity={0.3}
              className="oni-thought-dot-3"
            />
          </g>
        )}
        {emo.special === "question-mark" && (
          <text
            x={centerX + 30 * scale}
            y={bodyY - 5 * scale}
            fontSize={18 * scale}
            fill="#888"
            className="oni-question-mark"
          >
            ?
          </text>
        )}
        {emo.special === "tears" && (
          <g className="oni-special-tears">
            <ellipse
              cx={leftEyeX + 2 * scale}
              cy={eyeY + 18 * scale}
              rx={2 * scale}
              ry={4 * scale}
              fill="rgba(100,180,255,0.6)"
              className="oni-tear oni-tear-left"
            />
            <ellipse
              cx={rightEyeX - 2 * scale}
              cy={eyeY + 18 * scale}
              rx={2 * scale}
              ry={4 * scale}
              fill="rgba(100,180,255,0.6)"
              className="oni-tear oni-tear-right"
            />
          </g>
        )}
        {emo.special === "blush" && (
          <>
            <ellipse
              cx={leftEyeX - 5 * scale}
              cy={eyeY + 12 * scale}
              rx={8 * scale}
              ry={4 * scale}
              fill="rgba(255,120,120,0.25)"
              className="oni-blush"
            />
            <ellipse
              cx={rightEyeX + 5 * scale}
              cy={eyeY + 12 * scale}
              rx={8 * scale}
              ry={4 * scale}
              fill="rgba(255,120,120,0.25)"
              className="oni-blush"
            />
          </>
        )}
      </svg>
    </div>
  );
}
