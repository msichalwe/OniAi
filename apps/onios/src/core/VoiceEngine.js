/**
 * VoiceEngine — Manual push-to-talk voice for OniOS.
 *
 * State machine:
 *   OFF         → Not listening. Click mic to start.
 *   ACTIVATED   → Mic on, capturing speech. Silence timer only starts
 *                 AFTER first speech is detected. Click mic again to send.
 *   PROCESSING  → Command sent to AI, waiting for response.
 *   FOLLOW_UP   → AI responded, mic stays hot for follow-up.
 *
 * No wake word. No always-on listening. Pure manual control.
 */

import { eventBus } from './EventBus.js';

const SILENCE_TIMEOUT = 3500;      // ms of silence AFTER speech before auto-sending
const FOLLOW_UP_TIMEOUT = 15000;   // ms to wait for follow-up after AI responds
const MIN_WORD_LENGTH = 2;

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

class VoiceEngine {
  constructor() {
    this.state = 'OFF';
    this.recognition = null;
    this.transcript = '';
    this.interimTranscript = '';
    this.silenceTimer = null;
    this.followUpTimer = null;
    this.supported = !!SpeechRecognition;
    this._listeners = new Set();
    this._onCommand = null;
    this._restartTimeout = null;
    this._stopping = false;
    this._hasSpoken = false;       // True once ANY speech detected in this session
  }

  get isSupported() { return this.supported; }

  onStateChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  setCommandHandler(fn) { this._onCommand = fn; }

  _emit() {
    const data = {
      state: this.state,
      transcript: this.transcript,
      interimTranscript: this.interimTranscript,
    };
    for (const fn of this._listeners) { try { fn(data); } catch {} }
    eventBus.emit('voice:state', data);
  }

  // ─── Public API ──────────────────────────────────────

  /** Click mic: start listening. If already listening, finalize & send. */
  activate() {
    if (!this.supported) return;

    if (this.state === 'ACTIVATED') {
      // Already listening — send whatever we have (or stop if nothing)
      this._finalizeCommand();
      return;
    }

    // Start fresh
    this._stopping = false;
    this._hasSpoken = false;
    this._clearTimers();
    this._killRecognition();
    this.state = 'ACTIVATED';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
    this._startRecognition();
    // NO silence timer here — we wait for user to start speaking first
  }

  /** Stop everything and go to OFF */
  stop() {
    this._stopping = true;
    this._hasSpoken = false;
    this._clearTimers();
    this._killRecognition();
    this.state = 'OFF';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
  }

  // Legacy compat
  start() { this.activate(); }
  toggle() { if (this.state === 'OFF') this.activate(); else this.stop(); }
  activateManual() { this.activate(); }

  // ─── AI Response Hooks ────────────────────────────────

  onProcessingStart() {
    this._clearTimers();
    this._hasSpoken = false;
    this.state = 'PROCESSING';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
  }

  onProcessingEnd() {
    if (this._stopping) return;
    this._hasSpoken = false;
    this.state = 'FOLLOW_UP';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();

    if (!this.recognition) this._startRecognition();

    this.followUpTimer = setTimeout(() => {
      if (this.state === 'FOLLOW_UP') this.stop();
    }, FOLLOW_UP_TIMEOUT);
  }

  // ─── Internal ─────────────────────────────────────────

  _killRecognition() {
    if (this.recognition) {
      try { this.recognition.abort(); } catch {}
      this.recognition = null;
    }
    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout);
      this._restartTimeout = null;
    }
  }

  _startRecognition() {
    if (!this.supported) return;
    this._killRecognition();

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 3;

    rec.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0].transcript;
        if (r.isFinal) {
          if (text.trim().length < MIN_WORD_LENGTH) continue;
          final += text;
        } else {
          interim += text;
        }
      }

      // Any result (interim or final) means user is speaking
      if (final || (interim && interim.trim().length >= MIN_WORD_LENGTH)) {
        this._hasSpoken = true;
      }

      if (final) this._onFinal(final);

      if (interim && interim.trim().length >= MIN_WORD_LENGTH) {
        this.interimTranscript = interim;
        this._emit();
        // Reset silence timer on interim speech too (user still talking)
        if (this.state === 'ACTIVATED' && this._hasSpoken) {
          this._resetSilenceTimer();
        }
        if (this.state === 'FOLLOW_UP' && this.followUpTimer) {
          clearTimeout(this.followUpTimer);
          this.followUpTimer = setTimeout(() => {
            if (this.state === 'FOLLOW_UP') this.stop();
          }, FOLLOW_UP_TIMEOUT);
        }
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'no-speech') {
        // No speech yet — just restart silently, keep waiting
        if (this.state === 'ACTIVATED' || this.state === 'FOLLOW_UP') {
          this._scheduleRestart(200);
        }
        return;
      }
      console.warn('[VoiceEngine] Error:', event.error);
      if (this.state !== 'OFF') this._scheduleRestart(500);
    };

    rec.onend = () => {
      if (this._stopping) return;
      if (this.state === 'ACTIVATED' || this.state === 'FOLLOW_UP') {
        this._scheduleRestart(100);
      }
    };

    this.recognition = rec;
    try { rec.start(); } catch (err) {
      console.warn('[VoiceEngine] Start failed:', err.message);
      if (this.state !== 'OFF') this._scheduleRestart(500);
    }
  }

  _scheduleRestart(delay = 300) {
    if (this._stopping) return;
    if (this._restartTimeout) return;
    this._restartTimeout = setTimeout(() => {
      this._restartTimeout = null;
      if (this.state !== 'OFF' && !this._stopping) {
        this._startRecognition();
      }
    }, delay);
  }

  _onFinal(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.state === 'ACTIVATED') {
      this.transcript = (this.transcript + ' ' + trimmed).trim();
      this.interimTranscript = '';
      this._emit();
      // NOW start silence timer — user has spoken, wait for pause
      this._resetSilenceTimer();
    } else if (this.state === 'FOLLOW_UP') {
      clearTimeout(this.followUpTimer);
      this.state = 'ACTIVATED';
      this.transcript = trimmed;
      this.interimTranscript = '';
      this._hasSpoken = true;
      this._emit();
      this._resetSilenceTimer();
    }
  }

  // ─── Silence Detection ────────────────────────────────

  _startSilenceTimer() {
    this._clearSilenceTimer();
    this.silenceTimer = setTimeout(() => this._finalizeCommand(), SILENCE_TIMEOUT);
  }

  _resetSilenceTimer() {
    if (this.state === 'ACTIVATED' && this._hasSpoken) {
      this._startSilenceTimer();
    }
  }

  _clearSilenceTimer() {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  _clearTimers() {
    this._clearSilenceTimer();
    if (this.followUpTimer) { clearTimeout(this.followUpTimer); this.followUpTimer = null; }
    if (this._restartTimeout) { clearTimeout(this._restartTimeout); this._restartTimeout = null; }
  }

  _finalizeCommand() {
    const command = this.transcript.trim();
    if (!command) {
      // No speech captured — keep listening, don't stop
      return;
    }
    this._killRecognition();
    this.state = 'PROCESSING';
    this._emit();
    if (this._onCommand) this._onCommand(command);
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
  }
}

export const voiceEngine = new VoiceEngine();
export default voiceEngine;
