/**
 * OniEmotions — 30 emotion definitions for the Oni avatar.
 *
 * Each emotion defines:
 *   - leftEye / rightEye: { rx, ry, offsetY } (ellipse radii + vertical offset)
 *   - pupil: { rx, ry, offsetX, offsetY } (pupil position shift)
 *   - mouth: SVG path data (d attribute)
 *   - brow: { leftAngle, rightAngle, offsetY } (eyebrow rotation + position)
 *   - bodyAnim: CSS animation class name
 *   - glow: optional glow color
 *   - blinkRate: ms between blinks (lower = more frequent)
 */

const BASE_EYE = { rx: 18, ry: 22, offsetY: 0 };
const BASE_PUPIL = { rx: 8, ry: 10, offsetX: 0, offsetY: 0 };
const BASE_BROW = { leftAngle: 0, rightAngle: 0, offsetY: 0 };

// Mouth paths (relative to mouth center)
const MOUTHS = {
    smile: 'M-12,0 Q0,10 12,0',
    bigSmile: 'M-14,0 Q0,16 14,0',
    grin: 'M-16,-2 Q0,18 16,-2 Q0,8 -16,-2',
    neutral: 'M-10,0 L10,0',
    frown: 'M-12,4 Q0,-8 12,4',
    bigFrown: 'M-14,6 Q0,-14 14,6',
    open: 'M-10,-4 Q0,12 10,-4 Q0,4 -10,-4',
    bigOpen: 'M-14,-6 Q0,18 14,-6 Q0,6 -14,-6',
    tiny: 'M-4,0 Q0,4 4,0',
    wavy: 'M-12,0 Q-6,-4 0,0 Q6,4 12,0',
    flat: 'M-8,0 L8,0',
    ooh: 'M-6,-3 Q0,8 6,-3 Q0,2 -6,-3',
    smirk: 'M-10,2 Q-2,-2 4,-4 Q8,-2 12,2',
    tongue: 'M-12,0 Q0,10 12,0 M-4,6 Q0,12 4,6',
    worried: 'M-10,3 Q-4,-4 0,-2 Q4,-4 10,3',
};

export const EMOTIONS = {
    // ─── Positive ────────────────────────────
    happy: {
        leftEye: { rx: 18, ry: 20, offsetY: -1 },
        rightEye: { rx: 18, ry: 20, offsetY: -1 },
        pupil: { rx: 9, ry: 11, offsetX: 0, offsetY: -1 },
        mouth: MOUTHS.bigSmile,
        brow: { leftAngle: -5, rightAngle: 5, offsetY: -3 },
        bodyAnim: 'oni-bounce-gentle',
        glow: 'rgba(255,200,50,0.15)',
        blinkRate: 4000,
        bubble: '😊',
    },
    excited: {
        leftEye: { rx: 22, ry: 26, offsetY: -2 },
        rightEye: { rx: 22, ry: 26, offsetY: -2 },
        pupil: { rx: 10, ry: 12, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.bigOpen,
        brow: { leftAngle: -10, rightAngle: 10, offsetY: -6 },
        bodyAnim: 'oni-bounce-excited',
        glow: 'rgba(255,220,0,0.25)',
        blinkRate: 2500,
        bubble: '🎉',
    },
    proud: {
        leftEye: { rx: 16, ry: 12, offsetY: 2 },
        rightEye: { rx: 16, ry: 12, offsetY: 2 },
        pupil: { rx: 8, ry: 7, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.smirk,
        brow: { leftAngle: -8, rightAngle: 8, offsetY: -4 },
        bodyAnim: 'oni-puff-chest',
        glow: 'rgba(255,180,0,0.12)',
        blinkRate: 5000,
        bubble: '💪',
    },
    love: {
        leftEye: { rx: 20, ry: 24, offsetY: 0 },
        rightEye: { rx: 20, ry: 24, offsetY: 0 },
        pupil: { rx: 12, ry: 14, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.bigSmile,
        brow: { leftAngle: -5, rightAngle: 5, offsetY: -2 },
        bodyAnim: 'oni-heartbeat',
        glow: 'rgba(255,100,150,0.2)',
        blinkRate: 3500,
        special: 'hearts',
        bubble: '❤️',
    },
    grateful: {
        leftEye: { rx: 16, ry: 14, offsetY: 2 },
        rightEye: { rx: 16, ry: 14, offsetY: 2 },
        pupil: { rx: 8, ry: 8, offsetX: 0, offsetY: 1 },
        mouth: MOUTHS.smile,
        brow: { leftAngle: -3, rightAngle: 3, offsetY: -2 },
        bodyAnim: 'oni-nod',
        glow: 'rgba(200,255,200,0.12)',
        blinkRate: 4500,
        bubble: '🙏',
    },
    playful: {
        leftEye: { rx: 20, ry: 22, offsetY: -1 },
        rightEye: { rx: 16, ry: 18, offsetY: 1 },
        pupil: { rx: 9, ry: 10, offsetX: 3, offsetY: -2 },
        mouth: MOUTHS.grin,
        brow: { leftAngle: -8, rightAngle: 2, offsetY: -3 },
        bodyAnim: 'oni-wiggle',
        glow: 'rgba(150,220,255,0.15)',
        blinkRate: 3000,
        bubble: '😜',
    },
    laughing: {
        leftEye: { rx: 18, ry: 8, offsetY: 2 },
        rightEye: { rx: 18, ry: 8, offsetY: 2 },
        pupil: { rx: 8, ry: 4, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.bigOpen,
        brow: { leftAngle: -5, rightAngle: 5, offsetY: -5 },
        bodyAnim: 'oni-laugh-shake',
        glow: 'rgba(255,255,100,0.2)',
        blinkRate: 2000,
        bubble: '😂',
    },
    relieved: {
        leftEye: { rx: 16, ry: 14, offsetY: 3 },
        rightEye: { rx: 16, ry: 14, offsetY: 3 },
        pupil: { rx: 7, ry: 7, offsetX: 0, offsetY: 2 },
        mouth: MOUTHS.smile,
        brow: { leftAngle: 0, rightAngle: 0, offsetY: 0 },
        bodyAnim: 'oni-sigh',
        glow: 'rgba(180,220,255,0.1)',
        blinkRate: 5000,
    },
    hopeful: {
        leftEye: { rx: 20, ry: 24, offsetY: -3 },
        rightEye: { rx: 20, ry: 24, offsetY: -3 },
        pupil: { rx: 9, ry: 11, offsetX: 0, offsetY: -3 },
        mouth: MOUTHS.tiny,
        brow: { leftAngle: -6, rightAngle: 6, offsetY: -5 },
        bodyAnim: 'oni-float-up',
        glow: 'rgba(200,230,255,0.15)',
        blinkRate: 3500,
    },
    amazed: {
        leftEye: { rx: 24, ry: 28, offsetY: -2 },
        rightEye: { rx: 24, ry: 28, offsetY: -2 },
        pupil: { rx: 6, ry: 6, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.ooh,
        brow: { leftAngle: -12, rightAngle: 12, offsetY: -8 },
        bodyAnim: 'oni-gasp',
        glow: 'rgba(255,255,200,0.25)',
        blinkRate: 6000,
    },

    // ─── Neutral / Working ───────────────────
    neutral: {
        leftEye: { ...BASE_EYE },
        rightEye: { ...BASE_EYE },
        pupil: { ...BASE_PUPIL },
        mouth: MOUTHS.neutral,
        brow: { ...BASE_BROW },
        bodyAnim: 'oni-breathe',
        glow: null,
        blinkRate: 3500,
    },
    thinking: {
        leftEye: { rx: 16, ry: 20, offsetY: -2 },
        rightEye: { rx: 18, ry: 22, offsetY: -4 },
        pupil: { rx: 7, ry: 9, offsetX: 4, offsetY: -6 },
        mouth: MOUTHS.flat,
        brow: { leftAngle: 5, rightAngle: -8, offsetY: -2 },
        bodyAnim: 'oni-think-sway',
        glow: 'rgba(100,180,255,0.12)',
        blinkRate: 5000,
        special: 'thought-bubble',
        bubble: '🤔',
    },
    focused: {
        leftEye: { rx: 16, ry: 18, offsetY: 1 },
        rightEye: { rx: 16, ry: 18, offsetY: 1 },
        pupil: { rx: 9, ry: 10, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.flat,
        brow: { leftAngle: 6, rightAngle: -6, offsetY: 2 },
        bodyAnim: 'oni-focus-steady',
        glow: 'rgba(100,150,255,0.1)',
        blinkRate: 6000,
        bubble: '💡',
    },
    curious: {
        leftEye: { rx: 20, ry: 24, offsetY: 0 },
        rightEye: { rx: 16, ry: 20, offsetY: 2 },
        pupil: { rx: 9, ry: 11, offsetX: 3, offsetY: -2 },
        mouth: MOUTHS.tiny,
        brow: { leftAngle: -10, rightAngle: 0, offsetY: -4 },
        bodyAnim: 'oni-tilt-head',
        glow: null,
        blinkRate: 3000,
        bubble: '🧐',
    },
    determined: {
        leftEye: { rx: 16, ry: 16, offsetY: 2 },
        rightEye: { rx: 16, ry: 16, offsetY: 2 },
        pupil: { rx: 9, ry: 10, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.flat,
        brow: { leftAngle: 10, rightAngle: -10, offsetY: 3 },
        bodyAnim: 'oni-power-up',
        glow: 'rgba(255,150,50,0.15)',
        blinkRate: 7000,
        bubble: '⚡',
    },
    serious: {
        leftEye: { rx: 16, ry: 14, offsetY: 2 },
        rightEye: { rx: 16, ry: 14, offsetY: 2 },
        pupil: { rx: 8, ry: 8, offsetX: 0, offsetY: 1 },
        mouth: MOUTHS.flat,
        brow: { leftAngle: 8, rightAngle: -8, offsetY: 2 },
        bodyAnim: 'oni-still',
        glow: null,
        blinkRate: 5000,
    },
    listening: {
        leftEye: { rx: 20, ry: 24, offsetY: 0 },
        rightEye: { rx: 20, ry: 24, offsetY: 0 },
        pupil: { rx: 9, ry: 11, offsetX: 0, offsetY: 2 },
        mouth: MOUTHS.tiny,
        brow: { leftAngle: -5, rightAngle: 5, offsetY: -3 },
        bodyAnim: 'oni-lean-in',
        glow: 'rgba(100,200,255,0.08)',
        blinkRate: 4000,
    },

    // ─── Negative ────────────────────────────
    sad: {
        leftEye: { rx: 16, ry: 20, offsetY: 4 },
        rightEye: { rx: 16, ry: 20, offsetY: 4 },
        pupil: { rx: 8, ry: 9, offsetX: 0, offsetY: 3 },
        mouth: MOUTHS.frown,
        brow: { leftAngle: -8, rightAngle: 8, offsetY: 3 },
        bodyAnim: 'oni-droop',
        glow: 'rgba(100,100,200,0.1)',
        blinkRate: 5000,
        bubble: '😢',
    },
    angry: {
        leftEye: { rx: 18, ry: 14, offsetY: 2 },
        rightEye: { rx: 18, ry: 14, offsetY: 2 },
        pupil: { rx: 7, ry: 7, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.bigFrown,
        brow: { leftAngle: 15, rightAngle: -15, offsetY: 5 },
        bodyAnim: 'oni-tremble',
        glow: 'rgba(255,50,50,0.15)',
        blinkRate: 8000,
    },
    frustrated: {
        leftEye: { rx: 16, ry: 14, offsetY: 2 },
        rightEye: { rx: 18, ry: 16, offsetY: 1 },
        pupil: { rx: 8, ry: 8, offsetX: -2, offsetY: 1 },
        mouth: MOUTHS.wavy,
        brow: { leftAngle: 12, rightAngle: -8, offsetY: 4 },
        bodyAnim: 'oni-huff',
        glow: 'rgba(255,100,50,0.1)',
        blinkRate: 3000,
        bubble: '😤',
    },
    confused: {
        leftEye: { rx: 22, ry: 24, offsetY: 0 },
        rightEye: { rx: 14, ry: 18, offsetY: 3 },
        pupil: { rx: 8, ry: 10, offsetX: -3, offsetY: 0 },
        mouth: MOUTHS.wavy,
        brow: { leftAngle: -12, rightAngle: 5, offsetY: -2 },
        bodyAnim: 'oni-tilt-head',
        glow: null,
        blinkRate: 3500,
        special: 'question-mark',
        bubble: '❓',
    },
    scared: {
        leftEye: { rx: 24, ry: 28, offsetY: -3 },
        rightEye: { rx: 24, ry: 28, offsetY: -3 },
        pupil: { rx: 5, ry: 5, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.open,
        brow: { leftAngle: -15, rightAngle: 15, offsetY: -8 },
        bodyAnim: 'oni-tremble',
        glow: 'rgba(150,150,255,0.15)',
        blinkRate: 1500,
    },
    nervous: {
        leftEye: { rx: 18, ry: 22, offsetY: -1 },
        rightEye: { rx: 18, ry: 22, offsetY: -1 },
        pupil: { rx: 7, ry: 8, offsetX: 2, offsetY: -1 },
        mouth: MOUTHS.worried,
        brow: { leftAngle: -8, rightAngle: 8, offsetY: -2 },
        bodyAnim: 'oni-fidget',
        glow: null,
        blinkRate: 2000,
    },
    embarrassed: {
        leftEye: { rx: 14, ry: 12, offsetY: 3 },
        rightEye: { rx: 14, ry: 12, offsetY: 3 },
        pupil: { rx: 7, ry: 7, offsetX: -3, offsetY: 2 },
        mouth: MOUTHS.wavy,
        brow: { leftAngle: -5, rightAngle: 5, offsetY: 0 },
        bodyAnim: 'oni-shrink',
        glow: 'rgba(255,100,100,0.15)',
        blinkRate: 2500,
        special: 'blush',
    },
    bored: {
        leftEye: { rx: 18, ry: 10, offsetY: 4 },
        rightEye: { rx: 18, ry: 10, offsetY: 4 },
        pupil: { rx: 8, ry: 6, offsetX: -2, offsetY: 2 },
        mouth: MOUTHS.flat,
        brow: { leftAngle: 0, rightAngle: 0, offsetY: 3 },
        bodyAnim: 'oni-droop',
        glow: null,
        blinkRate: 2000,
    },
    crying: {
        leftEye: { rx: 18, ry: 14, offsetY: 2 },
        rightEye: { rx: 18, ry: 14, offsetY: 2 },
        pupil: { rx: 8, ry: 7, offsetX: 0, offsetY: 2 },
        mouth: MOUTHS.bigFrown,
        brow: { leftAngle: -10, rightAngle: 10, offsetY: 4 },
        bodyAnim: 'oni-sob',
        glow: 'rgba(100,150,255,0.15)',
        blinkRate: 1500,
        special: 'tears',
    },

    // ─── Special States ──────────────────────
    sleepy: {
        leftEye: { rx: 18, ry: 6, offsetY: 6 },
        rightEye: { rx: 18, ry: 6, offsetY: 6 },
        pupil: { rx: 8, ry: 4, offsetX: 0, offsetY: 3 },
        mouth: MOUTHS.tiny,
        brow: { leftAngle: 0, rightAngle: 0, offsetY: 4 },
        bodyAnim: 'oni-drowsy',
        glow: null,
        blinkRate: 1200,
    },
    tired: {
        leftEye: { rx: 18, ry: 10, offsetY: 4 },
        rightEye: { rx: 16, ry: 8, offsetY: 5 },
        pupil: { rx: 8, ry: 6, offsetX: 0, offsetY: 2 },
        mouth: MOUTHS.flat,
        brow: { leftAngle: 0, rightAngle: 0, offsetY: 3 },
        bodyAnim: 'oni-droop',
        glow: null,
        blinkRate: 2000,
    },
    energetic: {
        leftEye: { rx: 22, ry: 26, offsetY: -2 },
        rightEye: { rx: 22, ry: 26, offsetY: -2 },
        pupil: { rx: 10, ry: 12, offsetX: 0, offsetY: -1 },
        mouth: MOUTHS.grin,
        brow: { leftAngle: -8, rightAngle: 8, offsetY: -5 },
        bodyAnim: 'oni-bounce-excited',
        glow: 'rgba(0,255,150,0.2)',
        blinkRate: 2000,
        special: 'sparkles',
        bubble: '⚡',
    },
    surprised: {
        leftEye: { rx: 24, ry: 28, offsetY: -3 },
        rightEye: { rx: 24, ry: 28, offsetY: -3 },
        pupil: { rx: 6, ry: 6, offsetX: 0, offsetY: 0 },
        mouth: MOUTHS.ooh,
        brow: { leftAngle: -12, rightAngle: 12, offsetY: -8 },
        bodyAnim: 'oni-gasp',
        glow: 'rgba(255,255,200,0.2)',
        blinkRate: 8000,
        bubble: '😮',
    },
    mischievous: {
        leftEye: { rx: 16, ry: 14, offsetY: 1 },
        rightEye: { rx: 20, ry: 18, offsetY: -1 },
        pupil: { rx: 8, ry: 8, offsetX: 3, offsetY: -2 },
        mouth: MOUTHS.smirk,
        brow: { leftAngle: 5, rightAngle: -12, offsetY: -2 },
        bodyAnim: 'oni-sneak',
        glow: 'rgba(200,100,255,0.12)',
        blinkRate: 4000,
    },
    shy: {
        leftEye: { rx: 14, ry: 16, offsetY: 3 },
        rightEye: { rx: 14, ry: 16, offsetY: 3 },
        pupil: { rx: 7, ry: 8, offsetX: -4, offsetY: 2 },
        mouth: MOUTHS.tiny,
        brow: { leftAngle: -3, rightAngle: 3, offsetY: 0 },
        bodyAnim: 'oni-shrink',
        glow: 'rgba(255,150,150,0.08)',
        blinkRate: 2500,
    },
};

/**
 * Action → emotion + animation mapping.
 * Used to automatically set avatar state based on what the AI is doing.
 */
export const ACTION_EMOTIONS = {
    idle: 'neutral',
    thinking: 'thinking',
    generating: 'focused',
    writing: 'determined',
    reading: 'curious',
    searching: 'curious',
    executing: 'energetic',
    opening_widget: 'excited',
    closing_widget: 'neutral',
    creating_file: 'determined',
    deleting_file: 'serious',
    running_command: 'focused',
    browsing: 'curious',
    error: 'frustrated',
    success: 'happy',
    greeting: 'happy',
    waiting: 'listening',
    listening: 'listening',
    processing: 'thinking',
    downloading: 'focused',
    uploading: 'determined',
    calculating: 'thinking',
    scheduling: 'serious',
    notifying: 'playful',
    camera: 'excited',
    music: 'happy',
    weather: 'curious',
    coding: 'focused',
    saving: 'determined',
    loading: 'hopeful',
    complete: 'proud',
    failed: 'sad',
    timeout: 'tired',
    cancelled: 'relieved',
};

/**
 * Get emotion data by name, with fallback to neutral.
 */
export function getEmotion(name) {
    return EMOTIONS[name] || EMOTIONS.neutral;
}

/**
 * Get emotion for an action.
 */
export function getEmotionForAction(action) {
    const emotionName = ACTION_EMOTIONS[action] || 'neutral';
    return { name: emotionName, ...getEmotion(emotionName) };
}

export const EMOTION_NAMES = Object.keys(EMOTIONS);
export const ACTION_NAMES = Object.keys(ACTION_EMOTIONS);

export default EMOTIONS;
