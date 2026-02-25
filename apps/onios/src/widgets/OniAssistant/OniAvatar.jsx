/**
 * OniAvatar — Animated SVG character for the Oni AI assistant.
 *
 * Warm brown blob with expressive eyes, animated mouth,
 * emotion bubbles, and smooth expression transitions.
 *
 * Props:
 *   emotion  — emotion name from OniEmotions (default: 'neutral')
 *   action   — current action name (maps to emotion via ACTION_EMOTIONS)
 *   size     — avatar size in px (default: 120)
 *   speaking — whether the AI is currently outputting text
 *   onClick  — click handler
 *   mini     — compact mode for inline chat use (default: false)
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { getEmotion, getEmotionForAction } from "./OniEmotions";
import "./OniAvatar.css";

export default function OniAvatar({
  emotion = "neutral",
  action = null,
  size = 120,
  speaking = false,
  onClick,
  mini = false,
}) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [prevEmotion, setPrevEmotion] = useState(emotion);
  const [transitioning, setTransitioning] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const svgRef = useRef(null);
  const blinkTimerRef = useRef(null);
  const bubbleTimerRef = useRef(null);

  const resolvedEmotionName = action
    ? getEmotionForAction(action).name
    : emotion;

  const emo = useMemo(
    () => getEmotion(resolvedEmotionName),
    [resolvedEmotionName],
  );

  // Emotion transition + bubble trigger
  useEffect(() => {
    if (resolvedEmotionName !== prevEmotion) {
      setTransitioning(true);
      const t = setTimeout(() => {
        setPrevEmotion(resolvedEmotionName);
        setTransitioning(false);
      }, 200);

      // Show emotion bubble briefly on emotion change
      if (emo.bubble) {
        setShowBubble(true);
        clearTimeout(bubbleTimerRef.current);
        bubbleTimerRef.current = setTimeout(() => setShowBubble(false), 2500);
      } else {
        setShowBubble(false);
      }

      return () => clearTimeout(t);
    }
  }, [resolvedEmotionName, prevEmotion, emo.bubble]);

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

  // Pupil follow mouse
  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    const maxShift = mini ? 2 : 4;
    setPupilOffset({
      x: Math.max(-maxShift, Math.min(maxShift, dx * maxShift * 2)),
      y: Math.max(-maxShift, Math.min(maxShift, dy * maxShift * 2)),
    });
  }, [mini]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  // Cleanup bubble timer
  useEffect(() => {
    return () => clearTimeout(bubbleTimerRef.current);
  }, []);

  // Dimensions
  const s = size;
  const w = s;
  const h = s;
  const cx = w / 2;
  const cy = h / 2;
  const sc = s / 120;

  // Body blob path — organic rounded shape
  const blobR = 38 * sc;
  const blobPath = `
    M ${cx} ${cy - blobR * 1.05}
    C ${cx + blobR * 0.6} ${cy - blobR * 1.08},
      ${cx + blobR * 1.08} ${cy - blobR * 0.5},
      ${cx + blobR * 1.02} ${cy + blobR * 0.1}
    C ${cx + blobR * 0.98} ${cy + blobR * 0.65},
      ${cx + blobR * 0.55} ${cy + blobR * 1.08},
      ${cx} ${cy + blobR * 1.05}
    C ${cx - blobR * 0.55} ${cy + blobR * 1.08},
      ${cx - blobR * 0.98} ${cy + blobR * 0.65},
      ${cx - blobR * 1.02} ${cy + blobR * 0.1}
    C ${cx - blobR * 1.08} ${cy - blobR * 0.5},
      ${cx - blobR * 0.6} ${cy - blobR * 1.08},
      ${cx} ${cy - blobR * 1.05}
    Z
  `;

  // Eye positions
  const eyeSpread = mini ? 14 : 18;
  const leftEyeX = cx - eyeSpread * sc;
  const rightEyeX = cx + eyeSpread * sc;
  const eyeY = cy - 4 * sc;

  const eyeScaleY = isBlinking ? 0.08 : 1;
  const pOff = emo.pupil;
  const pupilDx = (pOff.offsetX + pupilOffset.x) * sc;
  const pupilDy = (pOff.offsetY + pupilOffset.y) * sc;

  // Mouth position
  const mouthY = cy + 14 * sc;

  // Brow
  const browLen = 12 * sc;
  const browY = eyeY - (emo.leftEye.ry + 4) * sc + (emo.brow.offsetY || 0) * sc;

  return (
    <div
      className={`oni-avatar-wrap ${emo.bodyAnim || ""} ${transitioning ? "oni-transitioning" : ""} ${speaking ? "oni-speaking" : ""} ${mini ? "oni-avatar-mini" : ""}`}
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
          {/* Brown body gradient */}
          <radialGradient id="oniBlobGrad" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#b8956a" />
            <stop offset="50%" stopColor="#9a7650" />
            <stop offset="100%" stopColor="#7a5a3a" />
          </radialGradient>
          {/* Highlight on top of body */}
          <radialGradient id="oniBlobHighlight" cx="45%" cy="20%" r="40%">
            <stop offset="0%" stopColor="rgba(255,230,200,0.35)" />
            <stop offset="100%" stopColor="rgba(255,230,200,0)" />
          </radialGradient>
          {/* Pupil gradient — dark brown */}
          <radialGradient id="oniPupilGrad" cx="40%" cy="35%" r="50%">
            <stop offset="0%" stopColor="#5c3a1e" />
            <stop offset="60%" stopColor="#3a2010" />
            <stop offset="100%" stopColor="#1a0a00" />
          </radialGradient>
          {/* Shadow under blob */}
          <radialGradient id="oniShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.15)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          {/* Glow filter */}
          {emo.glow && (
            <filter id="oniGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        {/* Shadow */}
        <ellipse
          cx={cx}
          cy={cy + blobR * 1.1}
          rx={blobR * 0.7}
          ry={blobR * 0.15}
          fill="url(#oniShadow)"
          className="oni-shadow"
        />

        {/* Glow aura */}
        {emo.glow && (
          <ellipse
            cx={cx}
            cy={cy}
            rx={blobR * 1.4}
            ry={blobR * 1.4}
            fill={emo.glow}
            className="oni-glow-aura"
          />
        )}

        {/* Body blob */}
        <path
          d={blobPath}
          fill="url(#oniBlobGrad)"
          className="oni-body"
          filter={emo.glow ? "url(#oniGlow)" : undefined}
        />
        {/* Body highlight */}
        <path
          d={blobPath}
          fill="url(#oniBlobHighlight)"
          className="oni-body-highlight"
        />

        {/* Left eye white */}
        <ellipse
          cx={leftEyeX}
          cy={eyeY + emo.leftEye.offsetY * sc}
          rx={emo.leftEye.rx * sc * 0.8}
          ry={emo.leftEye.ry * sc * 0.8 * eyeScaleY}
          fill="#fff"
          className="oni-eye oni-eye-left"
        />
        {/* Right eye white */}
        <ellipse
          cx={rightEyeX}
          cy={eyeY + emo.rightEye.offsetY * sc}
          rx={emo.rightEye.rx * sc * 0.8}
          ry={emo.rightEye.ry * sc * 0.8 * eyeScaleY}
          fill="#fff"
          className="oni-eye oni-eye-right"
        />

        {/* Left pupil */}
        {!isBlinking && (
          <ellipse
            cx={leftEyeX + pupilDx}
            cy={eyeY + emo.leftEye.offsetY * sc + pupilDy}
            rx={pOff.rx * sc * 0.8}
            ry={pOff.ry * sc * 0.8}
            fill="url(#oniPupilGrad)"
            className="oni-pupil oni-pupil-left"
          />
        )}
        {/* Right pupil */}
        {!isBlinking && (
          <ellipse
            cx={rightEyeX + pupilDx}
            cy={eyeY + emo.rightEye.offsetY * sc + pupilDy}
            rx={pOff.rx * sc * 0.8}
            ry={pOff.ry * sc * 0.8}
            fill="url(#oniPupilGrad)"
            className="oni-pupil oni-pupil-right"
          />
        )}

        {/* Eye highlights (specular) */}
        {!isBlinking && (
          <>
            <circle
              cx={leftEyeX - 2 * sc}
              cy={eyeY + emo.leftEye.offsetY * sc - 3 * sc}
              r={3 * sc}
              fill="rgba(255,255,255,0.7)"
              className="oni-eye-highlight"
            />
            <circle
              cx={rightEyeX - 2 * sc}
              cy={eyeY + emo.rightEye.offsetY * sc - 3 * sc}
              r={3 * sc}
              fill="rgba(255,255,255,0.7)"
              className="oni-eye-highlight"
            />
          </>
        )}

        {/* Eyebrows */}
        {!mini && (
          <>
            <line
              x1={leftEyeX - browLen * 0.5}
              y1={browY}
              x2={leftEyeX + browLen * 0.5}
              y2={browY}
              stroke="#6b4a2a"
              strokeWidth={2 * sc}
              strokeLinecap="round"
              transform={`rotate(${emo.brow.leftAngle}, ${leftEyeX}, ${browY})`}
              className="oni-brow oni-brow-left"
            />
            <line
              x1={rightEyeX - browLen * 0.5}
              y1={browY}
              x2={rightEyeX + browLen * 0.5}
              y2={browY}
              stroke="#6b4a2a"
              strokeWidth={2 * sc}
              strokeLinecap="round"
              transform={`rotate(${emo.brow.rightAngle}, ${rightEyeX}, ${browY})`}
              className="oni-brow oni-brow-right"
            />
          </>
        )}

        {/* Mouth */}
        <g transform={`translate(${cx}, ${mouthY})`}>
          <path
            d={emo.mouth}
            fill="none"
            stroke="#5c3a20"
            strokeWidth={2 * sc}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`oni-mouth ${speaking ? "oni-mouth-speaking" : ""}`}
          />
        </g>

        {/* Special effects */}
        {emo.special === "hearts" && (
          <g className="oni-special-hearts">
            <text x={cx - 22 * sc} y={cy - blobR - 2 * sc} fontSize={9 * sc} className="oni-heart oni-heart-1">♥</text>
            <text x={cx + 12 * sc} y={cy - blobR - 8 * sc} fontSize={7 * sc} className="oni-heart oni-heart-2">♥</text>
            <text x={cx + 2 * sc} y={cy - blobR - 16 * sc} fontSize={11 * sc} className="oni-heart oni-heart-3">♥</text>
          </g>
        )}
        {emo.special === "sparkles" && (
          <g className="oni-special-sparkles">
            <text x={cx - 28 * sc} y={cy - blobR} fontSize={7 * sc} className="oni-sparkle oni-sparkle-1">✦</text>
            <text x={cx + 22 * sc} y={cy - blobR - 6 * sc} fontSize={5 * sc} className="oni-sparkle oni-sparkle-2">✦</text>
            <text x={cx - 4 * sc} y={cy - blobR - 14 * sc} fontSize={9 * sc} className="oni-sparkle oni-sparkle-3">✦</text>
          </g>
        )}
        {emo.special === "thought-bubble" && (
          <g className="oni-special-thought">
            <circle cx={cx + 24 * sc} cy={cy - blobR + 2 * sc} r={2.5 * sc} fill="#c4a882" opacity={0.5} className="oni-thought-dot-1" />
            <circle cx={cx + 30 * sc} cy={cy - blobR - 8 * sc} r={3.5 * sc} fill="#c4a882" opacity={0.4} className="oni-thought-dot-2" />
            <circle cx={cx + 34 * sc} cy={cy - blobR - 18 * sc} r={5 * sc} fill="#c4a882" opacity={0.3} className="oni-thought-dot-3" />
          </g>
        )}
        {emo.special === "question-mark" && (
          <text x={cx + 26 * sc} y={cy - blobR + 2 * sc} fontSize={16 * sc} fill="#c4a882" className="oni-question-mark">?</text>
        )}
        {emo.special === "tears" && (
          <g className="oni-special-tears">
            <ellipse cx={leftEyeX + 2 * sc} cy={eyeY + 16 * sc} rx={1.5 * sc} ry={3.5 * sc} fill="rgba(100,180,255,0.6)" className="oni-tear oni-tear-left" />
            <ellipse cx={rightEyeX - 2 * sc} cy={eyeY + 16 * sc} rx={1.5 * sc} ry={3.5 * sc} fill="rgba(100,180,255,0.6)" className="oni-tear oni-tear-right" />
          </g>
        )}
        {emo.special === "blush" && (
          <>
            <ellipse cx={leftEyeX - 4 * sc} cy={eyeY + 10 * sc} rx={7 * sc} ry={3.5 * sc} fill="rgba(255,130,130,0.2)" className="oni-blush" />
            <ellipse cx={rightEyeX + 4 * sc} cy={eyeY + 10 * sc} rx={7 * sc} ry={3.5 * sc} fill="rgba(255,130,130,0.2)" className="oni-blush" />
          </>
        )}
      </svg>

      {/* Emotion bubble */}
      {showBubble && emo.bubble && (
        <div className="oni-emotion-bubble">
          <span className="oni-bubble-content">{emo.bubble}</span>
        </div>
      )}
    </div>
  );
}
