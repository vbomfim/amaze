/**
 * AudioManager — Web Audio API synthesized sound effects.
 *
 * Zero audio files — all sounds are generated via OscillatorNode + GainNode chains.
 * Lazy initialization: AudioContext is created on first user interaction to satisfy
 * browser autoplay policies.
 *
 * [TDD] [CLEAN-CODE] [SOLID] — Single responsibility: audio playback only
 */

/** Musical note frequencies (C4 octave base) for jingles */
const NOTES = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392.00, A4: 440.00, B4: 493.88, C5: 523.25,
};

class AudioManager {
  /**
   * @param {Object} [options]
   * @param {Function} [options.AudioContextClass] — injectable AudioContext (for testing)
   * @param {boolean} [options.muted] — initial muted state
   */
  constructor(options = {}) {
    this._AudioContextClass = options.AudioContextClass || null;
    this._muted = typeof options.muted === 'boolean' ? options.muted : false;
    this._ctx = null;
    this._wakaToggle = false;

    // Active looping sound references for stop control
    this._powerUpSirenNodes = null;
    this._ghostSirenNodes = null;
  }

  // ── Mute Property ──────────────────────────────────────────

  get muted() {
    return this._muted;
  }

  set muted(value) {
    this._muted = Boolean(value);
  }

  /**
   * Toggle mute state.
   * @returns {boolean} new muted state
   */
  toggleMute() {
    this._muted = !this._muted;
    // Stop looping sounds when muting
    if (this._muted) {
      this.stopPowerUpSiren();
      this.stopGhostSiren();
    }
    return this._muted;
  }

  // ── Initialization ─────────────────────────────────────────

  /**
   * Initialize the AudioContext. Safe to call multiple times — idempotent.
   * Should be called on first user interaction (click/keypress).
   */
  init() {
    if (this._ctx) return;

    const ACClass = this._AudioContextClass
      || (typeof AudioContext !== 'undefined' ? AudioContext : null);

    if (!ACClass) return; // No Web Audio support

    this._ctx = new ACClass();
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  // ── Private Helpers ────────────────────────────────────────

  /** @returns {boolean} true if sound can be played */
  #canPlay() {
    return this._ctx !== null && !this._muted;
  }

  /**
   * Create an oscillator→gain→destination chain.
   * @param {string} type — oscillator type (sine, square, sawtooth, triangle)
   * @param {number} frequency — Hz
   * @param {number} volume — 0..1
   * @returns {{ osc: OscillatorNode, gain: GainNode }}
   */
  #createOscGain(type, frequency, volume) {
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    return { osc, gain };
  }

  /**
   * Play a short tone with optional frequency sweep.
   * @param {Object} config
   * @param {string} config.type — oscillator type
   * @param {number} config.freq — start frequency
   * @param {number} [config.freqEnd] — end frequency (for sweep)
   * @param {number} config.duration — seconds
   * @param {number} config.volume — 0..1
   */
  #playTone({ type, freq, freqEnd, duration, volume }) {
    if (!this.#canPlay()) return;
    const t = this._ctx.currentTime;
    const { osc, gain } = this.#createOscGain(type, freq, volume);

    if (freqEnd !== undefined) {
      osc.frequency.linearRampToValueAtTime(freqEnd, t + duration);
    }
    gain.gain.setValueAtTime(volume, t);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    osc.start(t);
    osc.stop(t + duration);
  }

  /**
   * Play a sequence of notes (jingle).
   * @param {Array<{ freq: number, duration: number }>} notes
   * @param {string} type — oscillator type
   * @param {number} volume
   */
  #playJingle(notes, type, volume) {
    if (!this.#canPlay()) return;
    let offset = this._ctx.currentTime;

    for (const note of notes) {
      const { osc, gain } = this.#createOscGain(type, note.freq, 0);
      gain.gain.setValueAtTime(volume, offset);
      gain.gain.linearRampToValueAtTime(0, offset + note.duration * 0.9);
      osc.start(offset);
      osc.stop(offset + note.duration);
      offset += note.duration;
    }
  }

  // ── Maze Mode Sounds ───────────────────────────────────────

  /** Short click: square wave 80Hz, 30ms, low volume */
  playFootstep() {
    this.#playTone({ type: 'square', freq: 80, duration: 0.03, volume: 0.08 });
  }

  /** Low thud: sine 60Hz, 50ms, quick decay */
  playWallBump() {
    this.#playTone({ type: 'sine', freq: 60, duration: 0.05, volume: 0.15 });
  }

  /** Chime: sine 800→1200Hz sweep, 200ms */
  playHintActivate() {
    this.#playTone({ type: 'sine', freq: 800, freqEnd: 1200, duration: 0.2, volume: 0.2 });
  }

  /** Ascending jingle: C-E-G-C notes, 150ms each */
  playLevelComplete() {
    this.#playJingle([
      { freq: NOTES.C4, duration: 0.15 },
      { freq: NOTES.E4, duration: 0.15 },
      { freq: NOTES.G4, duration: 0.15 },
      { freq: NOTES.C5, duration: 0.15 },
    ], 'sine', 0.25);
  }

  /** Sparkle: triangle 2000Hz, very quiet, pulsing */
  playPortalProximity() {
    this.#playTone({ type: 'triangle', freq: 2000, duration: 0.1, volume: 0.03 });
  }

  // ── PAC-MAN Mode Sounds ────────────────────────────────────

  /** Alternating square wave 200/300Hz, 60ms each, on dot eat */
  playWakaWaka() {
    if (!this.#canPlay()) return;
    const t = this._ctx.currentTime;
    // Alternating chomping sound — frequency sweeps down then up
    this._wakaToggle = !this._wakaToggle;

    const baseFreq = this._wakaToggle ? 260 : 330;
    const endFreq = this._wakaToggle ? 80 : 100;

    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.08);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.setValueAtTime(0.5, t + 0.04);
    gain.gain.linearRampToValueAtTime(0, t + 0.09);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  /** Descending sawtooth 500→200Hz single sweep while active [Fix 6] — renamed from playPowerUpSiren */
  playPowerUpSiren() {
    if (!this.#canPlay()) return;
    this.stopPowerUpSiren();
    const { osc, gain } = this.#createOscGain('sawtooth', 500, 0.25);
    const t = this._ctx.currentTime;
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.linearRampToValueAtTime(200, t + 2);
    osc.start(t);
    this._powerUpSirenNodes = { osc, gain };
  }

  /** Stop the power-up siren loop */
  stopPowerUpSiren() {
    if (this._powerUpSirenNodes) {
      try {
        this._powerUpSirenNodes.osc.stop();
        this._powerUpSirenNodes.gain.disconnect();
      } catch (_e) { /* already stopped */ }
      this._powerUpSirenNodes = null;
    }
  }

  /** Quick ascending sine 400→1200Hz, 100ms */
  playGhostEaten() {
    this.#playTone({ type: 'sine', freq: 400, freqEnd: 1200, duration: 0.15, volume: 0.4 });
  }

  /** Descending sine 600→100Hz, 1 second, fade out */
  playDeath() {
    this.#playTone({ type: 'sine', freq: 600, freqEnd: 100, duration: 1.0, volume: 0.5 });
  }

  /** Longer ascending jingle: C-D-E-F-G-A-B-C, 100ms each */
  playPacmanLevelClear() {
    this.#playJingle([
      { freq: NOTES.C4, duration: 0.1 },
      { freq: NOTES.D4, duration: 0.1 },
      { freq: NOTES.E4, duration: 0.1 },
      { freq: NOTES.F4, duration: 0.1 },
      { freq: NOTES.G4, duration: 0.1 },
      { freq: NOTES.A4, duration: 0.1 },
      { freq: NOTES.B4, duration: 0.1 },
      { freq: NOTES.C5, duration: 0.1 },
    ], 'sine', 0.25);
  }

  /** Low sine 150Hz sustained tone while active [Fix 6] — renamed from playGhostSiren */
  playGhostSiren() {
    if (!this.#canPlay()) return;
    this.stopGhostSiren();
    const { osc, gain } = this.#createOscGain('sine', 150, 0.12);
    osc.start(this._ctx.currentTime);
    this._ghostSirenNodes = { osc, gain };
  }

  /** Stop the ghost siren loop */
  stopGhostSiren() {
    if (this._ghostSirenNodes) {
      try {
        this._ghostSirenNodes.osc.stop();
        this._ghostSirenNodes.gain.disconnect();
      } catch (_e) { /* already stopped */ }
      this._ghostSirenNodes = null;
    }
  }
}

export { AudioManager, NOTES };
