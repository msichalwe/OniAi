/**
 * VoiceEngine — Always-on voice control for OniOS.
 *
 * State machine:
 *   IDLE        → Always listening for wake word "Oni"
 *   ACTIVATED   → Wake word detected, now capturing full command
 *   PROCESSING  → Command sent to chat, waiting for AI response
 *   FOLLOW_UP   → AI responded, listening briefly for follow-up
 *
 * Uses Web Speech API (SpeechRecognition) for continuous recognition.
 * Falls back gracefully if not supported (mic button still works).
 *
 * Wake word detection:
 *   In IDLE mode, we listen continuously. When transcript contains "oni"
 *   (case-insensitive), we strip the wake word and switch to ACTIVATED.
 *   Everything after the wake word becomes the command.
 *
 * Silence detection:
 *   After wake word activation, if no speech for SILENCE_TIMEOUT ms,
 *   we finalize the command and send it.
 *
 * Follow-up mode:
 *   After AI responds, we listen for FOLLOW_UP_TIMEOUT ms.
 *   If user speaks, we capture it as a new command.
 *   If silence, we go back to IDLE (wake word mode).
 */

import { eventBus } from './EventBus.js';

const SILENCE_TIMEOUT = 2500;      // ms of silence before finalizing command
const FOLLOW_UP_TIMEOUT = 12000;   // ms to wait for follow-up after AI responds
const MIN_CONFIDENCE = 0.4;        // ignore low-confidence results (background noise)
const MIN_WORD_LENGTH = 2;         // ignore single-character noise
const WAKE_WORDS = ['oni', 'oney', 'onee', 'only', 'oh ni', 'o.n.i', 'on e', 'honey'];

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

class VoiceEngine {
  constructor() {
    this.state = 'OFF';           // OFF | IDLE | ACTIVATED | PROCESSING | FOLLOW_UP
    this.recognition = null;
    this.transcript = '';          // Current accumulated transcript
    this.interimTranscript = '';   // In-progress interim results
    this.silenceTimer = null;
    this.followUpTimer = null;
    this.supported = !!SpeechRecognition;
    this._listeners = new Set();
    this._onCommand = null;        // Callback: (text) => void — sends to chat
    this._restartTimeout = null;
    this._manualStop = false;
  }

  /** Check if Web Speech API is available */
  get isSupported() {
    return this.supported;
  }

  /** Register state change listener */
  onStateChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Set the command handler (called when voice command is finalized) */
  setCommandHandler(fn) {
    this._onCommand = fn;
  }

  /** Notify all listeners of state change */
  _emit() {
    const data = {
      state: this.state,
      transcript: this.transcript,
      interimTranscript: this.interimTranscript,
    };
    for (const fn of this._listeners) {
      try { fn(data); } catch { /* listener error */ }
    }
    eventBus.emit('voice:state', data);
  }

  // ─── Start/Stop ───────────────────────────────────────

  /** Start always-on listening (wake word mode) */
  start() {
    if (!this.supported) return;
    if (this.state !== 'OFF') return;
    this._manualStop = false;
    this.state = 'IDLE';
    this._emit();
    this._startRecognition();
  }

  /** Stop all listening */
  stop() {
    this._manualStop = true;
    this._clearTimers();
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }
    this.state = 'OFF';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
  }

  /** Toggle on/off */
  toggle() {
    if (this.state === 'OFF') this.start();
    else this.stop();
  }

  // ─── Manual mic activation (bypass wake word) ─────────

  /** Activate listening immediately (mic button pressed) */
  activateManual() {
    if (!this.supported) return;
    this._clearTimers();
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }
    this.state = 'ACTIVATED';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
    this._startRecognition();
    this._startSilenceTimer();
  }

  // ─── AI Response Hooks ────────────────────────────────

  /** Call when AI starts processing (pause listening) */
  onProcessingStart() {
    this._clearTimers();
    this.state = 'PROCESSING';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
    // Don't stop recognition — just mark state
  }

  /** Call when AI finishes responding (enter follow-up mode) */
  onProcessingEnd() {
    if (this._manualStop) return;
    this.state = 'FOLLOW_UP';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();

    // Ensure recognition is running
    if (!this.recognition) {
      this._startRecognition();
    }

    // Set follow-up timeout — if no speech, go back to IDLE
    this.followUpTimer = setTimeout(() => {
      if (this.state === 'FOLLOW_UP') {
        this.state = 'IDLE';
        this.transcript = '';
        this.interimTranscript = '';
        this._emit();
      }
    }, FOLLOW_UP_TIMEOUT);
  }

  // ─── Internal Recognition ─────────────────────────────

  _startRecognition() {
    if (!this.supported) return;
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 3;

    rec.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const confidence = result[0].confidence || 0;
        const text = result[0].transcript;

        if (result.isFinal) {
          // Filter out low-confidence noise and very short utterances
          if (confidence < MIN_CONFIDENCE && text.trim().length < 4) continue;
          if (text.trim().length < MIN_WORD_LENGTH) continue;
          final += text;
        } else {
          interim += text;
        }
      }

      if (final) {
        this._handleFinalTranscript(final);
      }
      if (interim && interim.trim().length >= MIN_WORD_LENGTH) {
        this.interimTranscript = interim;
        this._emit();
        // Interim speech during follow-up resets the timeout
        if (this.state === 'FOLLOW_UP' && this.followUpTimer) {
          clearTimeout(this.followUpTimer);
          this.followUpTimer = setTimeout(() => {
            if (this.state === 'FOLLOW_UP') {
              this.state = 'IDLE';
              this.transcript = '';
              this.interimTranscript = '';
              this._emit();
            }
          }, FOLLOW_UP_TIMEOUT);
        }
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      console.warn('[VoiceEngine] Error:', event.error);
      // Auto-restart on recoverable errors
      if (event.error === 'network' || event.error === 'audio-capture') {
        this._scheduleRestart();
      }
    };

    rec.onend = () => {
      // Auto-restart if we're supposed to be listening
      if (this._manualStop) return;
      if (this.state !== 'OFF') {
        this._scheduleRestart();
      }
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch (err) {
      console.warn('[VoiceEngine] Start failed:', err.message);
      this._scheduleRestart();
    }
  }

  _scheduleRestart() {
    if (this._manualStop) return;
    if (this._restartTimeout) return;
    this._restartTimeout = setTimeout(() => {
      this._restartTimeout = null;
      if (this.state !== 'OFF' && !this._manualStop) {
        this._startRecognition();
      }
    }, 300);
  }

  _handleFinalTranscript(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Reset silence timer on any speech
    this._resetSilenceTimer();

    switch (this.state) {
      case 'IDLE': {
        // Check for wake word
        const lower = trimmed.toLowerCase();
        let wakeIdx = -1;
        let wakeLen = 0;
        for (const ww of WAKE_WORDS) {
          const idx = lower.indexOf(ww);
          if (idx !== -1 && (wakeIdx === -1 || idx < wakeIdx)) {
            wakeIdx = idx;
            wakeLen = ww.length;
          }
        }

        if (wakeIdx !== -1) {
          // Extract command after wake word
          const afterWake = trimmed.substring(wakeIdx + wakeLen).trim();
          this.state = 'ACTIVATED';
          this.transcript = afterWake;
          this.interimTranscript = '';
          this._emit();
          this._startSilenceTimer();

          // If there's already content after the wake word, start the timer
          if (afterWake.length > 5) {
            this._resetSilenceTimer();
          }
        }
        break;
      }

      case 'ACTIVATED': {
        // Accumulate command text
        this.transcript = (this.transcript + ' ' + trimmed).trim();
        this.interimTranscript = '';
        this._emit();
        this._resetSilenceTimer();
        break;
      }

      case 'FOLLOW_UP': {
        // User spoke during follow-up — treat as new command
        clearTimeout(this.followUpTimer);
        this.state = 'ACTIVATED';
        this.transcript = trimmed;
        this.interimTranscript = '';
        this._emit();
        this._startSilenceTimer();
        break;
      }

      case 'PROCESSING': {
        // Ignore speech while AI is processing
        break;
      }
    }
  }

  // ─── Silence Detection ────────────────────────────────

  _startSilenceTimer() {
    this._clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this._finalizeCommand();
    }, SILENCE_TIMEOUT);
  }

  _resetSilenceTimer() {
    if (this.state === 'ACTIVATED') {
      this._startSilenceTimer();
    }
  }

  _clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  _clearTimers() {
    this._clearSilenceTimer();
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout);
      this._restartTimeout = null;
    }
  }

  _finalizeCommand() {
    const command = this.transcript.trim();
    if (!command) {
      // No command captured — go back to idle
      this.state = 'IDLE';
      this.transcript = '';
      this.interimTranscript = '';
      this._emit();
      return;
    }

    // Send command
    this.state = 'PROCESSING';
    this._emit();

    if (this._onCommand) {
      this._onCommand(command);
    }

    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
  }
}

// ─── Singleton ───────────────────────────────────────
export const voiceEngine = new VoiceEngine();
export default voiceEngine;
