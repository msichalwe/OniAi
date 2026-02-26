/**
 * VoiceEngine — Manual push-to-talk voice for OniOS.
 *
 * State machine:
 *   OFF         → Not listening. Click mic to start.
 *   ACTIVATED   → Mic button pressed, capturing speech.
 *                 Auto-sends after 2.5s silence. Click mic again to send immediately.
 *   PROCESSING  → Command sent to AI, waiting for response.
 *   FOLLOW_UP   → AI responded, mic stays hot for 12s for follow-up.
 *                 Speak to continue, or let it time out back to OFF.
 *
 * No wake word. No always-on listening. Pure manual control.
 */

import { eventBus } from './EventBus.js';

const SILENCE_TIMEOUT = 2500;
const FOLLOW_UP_TIMEOUT = 12000;
const MIN_CONFIDENCE = 0.35;
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
  }

  get isSupported() { return this.supported; }

  onStateChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  setCommandHandler(fn) { this._onCommand = fn; }

  _emit() {
    const data = { state: this.state, transcript: this.transcript, interimTranscript: this.interimTranscript };
    for (const fn of this._listeners) { try { fn(data); } catch {} }
    eventBus.emit('voice:state', data);
  }

  // ─── Public API ──────────────────────────────────────

  /** Click mic: start listening. If already listening, finalize & send. */
  activate() {
    if (!this.supported) return;

    if (this.state === 'ACTIVATED') {
      // Already listening — finalize whatever we have
      this._finalizeCommand();
      return;
    }

    // Start fresh
    this._stopping = false;
    this._clearTimers();
    this._killRecognition();
    this.state = 'ACTIVATED';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
    this._startRecognition();
    this._startSilenceTimer();
  }

  /** Stop everything and go to OFF */
  stop() {
    this._stopping = true;
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
    this.state = 'PROCESSING';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
  }

  onProcessingEnd() {
    if (this._stopping) return;
    this.state = 'FOLLOW_UP';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();

    // Keep recognition running for follow-up
    if (!this.recognition) this._startRecognition();

    this.followUpTimer = setTimeout(() => {
      if (this.state === 'FOLLOW_UP') {
        this.stop();
      }
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
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0].transcript;
        const conf = r[0].confidence || 0;
        if (r.isFinal) {
          if (conf < MIN_CONFIDENCE && text.trim().length < 4) continue;
          if (text.trim().length < MIN_WORD_LENGTH) continue;
          final += text;
        } else {
          interim += text;
        }
      }

      if (final) this._onFinal(final);
      if (interim && interim.trim().length >= MIN_WORD_LENGTH) {
        this.interimTranscript = interim;
        this._emit();
        // Keep follow-up alive while user is speaking
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
        if (this.state === 'ACTIVATED' || this.state === 'FOLLOW_UP') {
          this._scheduleRestart(100);
        }
        return;
      }
      console.warn('[VoiceEngine] Error:', event.error);
      if (this.state !== 'OFF') this._scheduleRestart(500);
    };

    rec.onend = () => {
      if (this._stopping) return;
      if (this.state === 'ACTIVATED' || this.state === 'FOLLOW_UP') {
        this._scheduleRestart(150);
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
    this._resetSilenceTimer();

    if (this.state === 'ACTIVATED') {
      this.transcript = (this.transcript + ' ' + trimmed).trim();
      this.interimTranscript = '';
      this._emit();
    } else if (this.state === 'FOLLOW_UP') {
      clearTimeout(this.followUpTimer);
      this.state = 'ACTIVATED';
      this.transcript = trimmed;
      this.interimTranscript = '';
      this._emit();
      this._startSilenceTimer();
    }
  }

  // ─── Silence Detection ────────────────────────────────

  _startSilenceTimer() {
    this._clearSilenceTimer();
    this.silenceTimer = setTimeout(() => this._finalizeCommand(), SILENCE_TIMEOUT);
  }

  _resetSilenceTimer() {
    if (this.state === 'ACTIVATED') this._startSilenceTimer();
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
      this.stop();
      return;
    }
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
