/**
 * VoiceEngine — Manual push-to-talk voice for OniOS.
 *
 * State machine:
 *   OFF         → Not listening. Click mic to start.
 *   ACTIVATED   → Mic on, capturing speech. Silence timer only starts
 *                 AFTER first speech is detected. Click mic again to send.
 *                 Hard limit: 40s auto-cut.
 *   PROCESSING  → Command sent to AI, waiting for response.
 *   FOLLOW_UP   → AI responded, mic stays hot for follow-up.
 *
 * Emits: { state, transcript, interimTranscript, elapsed, maxDuration }
 */

import { eventBus } from './EventBus.js';

const SILENCE_TIMEOUT = 3500;      // ms of silence AFTER speech before auto-sending
const FOLLOW_UP_TIMEOUT = 15000;   // ms to wait for follow-up after AI responds
const MAX_DURATION = 40000;        // hard limit — auto-cut at 40s
const MIN_WORD_LENGTH = 2;
const TICK_INTERVAL = 250;         // timer tick for UI updates

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
    this._hasSpoken = false;
    this._activatedAt = 0;         // timestamp when ACTIVATED started
    this._tickTimer = null;        // interval for elapsed time updates
    this._maxTimer = null;         // hard 40s auto-cut timer
  }

  get isSupported() { return this.supported; }

  onStateChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  setCommandHandler(fn) { this._onCommand = fn; }
  setTranscriptHandler(fn) { this._onTranscript = fn; }

  _emit() {
    const elapsed = this.state === 'ACTIVATED' && this._activatedAt
      ? Date.now() - this._activatedAt : 0;
    const data = {
      state: this.state,
      transcript: this.transcript,
      interimTranscript: this.interimTranscript,
      elapsed,
      maxDuration: MAX_DURATION,
    };
    for (const fn of this._listeners) { try { fn(data); } catch {} }
    eventBus.emit('voice:state', data);
  }

  // ─── Public API ──────────────────────────────────────

  /** Click mic: start listening. If already listening, finalize & send. */
  activate() {
    if (!this.supported) return;

    if (this.state === 'ACTIVATED') {
      this._finalizeCommand();
      return;
    }

    this._stopping = false;
    this._hasSpoken = false;
    this._clearTimers();
    this._killRecognition();
    this.state = 'ACTIVATED';
    this.transcript = '';
    this.interimTranscript = '';
    this._activatedAt = Date.now();
    this._emit();
    this._startRecognition();

    // Tick timer for elapsed time UI updates
    this._tickTimer = setInterval(() => {
      if (this.state === 'ACTIVATED') this._emit();
    }, TICK_INTERVAL);

    // Hard 40s auto-cut
    this._maxTimer = setTimeout(() => {
      if (this.state === 'ACTIVATED') {
        this._finalizeCommand();
      }
    }, MAX_DURATION);
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
    this._activatedAt = 0;
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
    this._activatedAt = 0;
    this.state = 'PROCESSING';
    this.transcript = '';
    this.interimTranscript = '';
    this._emit();
  }

  onProcessingEnd() {
    if (this._stopping) return;
    this._hasSpoken = false;
    this._activatedAt = 0;
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

      if (final || (interim && interim.trim().length >= MIN_WORD_LENGTH)) {
        this._hasSpoken = true;
      }

      if (final) this._onFinal(final);

      if (interim && interim.trim().length >= MIN_WORD_LENGTH) {
        this.interimTranscript = interim;
        this._emit();
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
      this._resetSilenceTimer();
    } else if (this.state === 'FOLLOW_UP') {
      clearTimeout(this.followUpTimer);
      this.state = 'ACTIVATED';
      this.transcript = trimmed;
      this.interimTranscript = '';
      this._hasSpoken = true;
      this._activatedAt = Date.now();
      this._emit();
      this._resetSilenceTimer();

      // Start tick + max timers for follow-up → activated transition
      this._tickTimer = setInterval(() => {
        if (this.state === 'ACTIVATED') this._emit();
      }, TICK_INTERVAL);
      this._maxTimer = setTimeout(() => {
        if (this.state === 'ACTIVATED') this._finalizeCommand();
      }, MAX_DURATION);
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
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    if (this._maxTimer) { clearTimeout(this._maxTimer); this._maxTimer = null; }
  }

  _finalizeCommand() {
    // Kill recognition FIRST to avoid lag (recognition.abort() is slow if done after state change)
    this._stopping = true;
    this._killRecognition();
    this._clearTimers();
    this._activatedAt = 0;

    // Combine final transcript + any pending interim text the user saw on screen.
    // When user clicks mic quickly, the last speech chunk may still be interim
    // (not yet finalized by the speech API), so we must include it.
    const command = (this.transcript + ' ' + (this.interimTranscript || '')).trim();
    if (!command) {
      // No speech captured — go back to OFF
      this._stopping = false;
      this.state = 'OFF';
      this.transcript = '';
      this.interimTranscript = '';
      this._emit();
      return;
    }

    // Put transcript into text box for review — user clicks send manually
    this.state = 'OFF';
    this.transcript = '';
    this.interimTranscript = '';
    this._stopping = false;
    this._emit();
    if (this._onTranscript) {
      this._onTranscript(command);
    }
  }
}

export const voiceEngine = new VoiceEngine();
export default voiceEngine;
