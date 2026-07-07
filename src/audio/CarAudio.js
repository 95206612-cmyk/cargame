/**
 * Car engine sound synthesis using Web Audio API.
 *
 * Generates engine noise procedurally — no audio files needed.
 * Speed-linked: higher speed = higher pitch + louder.
 * Includes engine, brake squeal, and nitro boost effects.
 */
export class CarAudio {
  constructor(audioManager) {
    this._audio = audioManager;
    this.ctx = audioManager?.context || null;
    this._ready = false;

    // Master gain for car sounds
    this._masterGain = null;

    // Engine synthesis nodes
    this._engineOsc = null;       // Main oscillator (sawtooth for growl)
    this._engineOsc2 = null;      // Secondary (square for harmonics)
    this._engineSubOsc = null;
    this._engineSubGain = null;
    this._engineGain = null;
    this._engineFilter = null;    // Low-pass filter
    this._engineResonance = null;

    // Nitro sound
    this._nitroOsc = null;
    this._nitroGain = null;
    this._nitroActive = false;

    // Brake squeal
    this._brakeOsc = null;
    this._brakeGain = null;
    this._brakeActive = false;

    // State
    this._currentRPM = 0;
    this._targetRPM = 0;
    this._speed = 0;
    this._nitroLevel = 0;
  }

  /**
   * Initialize the synthesis graph. Must be called after AudioManager.init().
   */
  init() {
    const ctx = this.ctx || this._audio?.context;
    if (!ctx) {
      console.warn('[CarAudio] No AudioContext available.');
      return;
    }
    this.ctx = ctx;

    // Master car gain node → connects to AudioManager's SFX gain
    this._masterGain = ctx.createGain();
    this._masterGain.gain.value = 0.46;

    if (this._audio?.sfxGain) {
      this._masterGain.connect(this._audio.sfxGain);
    } else {
      this._masterGain.connect(ctx.destination);
    }

    // --- Engine: dual-oscillator with low-pass filter ---
    // Main oscillator — sawtooth for aggressive growl
    this._engineOsc = ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 68;

    // Secondary oscillator — square for harmonic richness
    this._engineOsc2 = ctx.createOscillator();
    this._engineOsc2.type = 'triangle';
    this._engineOsc2.frequency.value = 102;

    this._engineSubOsc = ctx.createOscillator();
    this._engineSubOsc.type = 'sine';
    this._engineSubOsc.frequency.value = 34;
    this._engineSubGain = ctx.createGain();
    this._engineSubGain.gain.value = 0.28;
    this._engineSubOsc.connect(this._engineSubGain);

    // Mix oscillators
    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.44;
    this._engineOsc.connect(oscMix);
    this._engineOsc2.connect(oscMix);
    this._engineSubGain.connect(oscMix);

    this._engineResonance = ctx.createBiquadFilter();
    this._engineResonance.type = 'peaking';
    this._engineResonance.frequency.value = 185;
    this._engineResonance.Q.value = 0.9;
    this._engineResonance.gain.value = 4.0;

    // Low-pass filter — muffles at low RPM, opens at high RPM
    this._engineFilter = ctx.createBiquadFilter();
    this._engineFilter.type = 'lowpass';
    this._engineFilter.frequency.value = 650;
    this._engineFilter.Q.value = 0.75;

    oscMix.connect(this._engineResonance);
    this._engineResonance.connect(this._engineFilter);

    // Engine gain
    this._engineGain = ctx.createGain();
    this._engineGain.gain.value = 0.24;
    this._engineFilter.connect(this._engineGain);
    this._engineGain.connect(this._masterGain);

    // Start oscillators (run continuously)
    this._engineOsc.start();
    this._engineOsc2.start();
    this._engineSubOsc.start();

    // --- Nitro: high-frequency hiss ---
    this._nitroGain = ctx.createGain();
    this._nitroGain.gain.value = 0;

    this._nitroOsc = ctx.createOscillator();
    this._nitroOsc.type = 'sawtooth';
    this._nitroOsc.frequency.value = 600;
    this._nitroOsc.connect(this._nitroGain);
    this._nitroGain.connect(this._masterGain);
    this._nitroOsc.start();

    // --- Brake squeal: very high frequency ---
    this._brakeGain = ctx.createGain();
    this._brakeGain.gain.value = 0;

    this._brakeOsc = ctx.createOscillator();
    this._brakeOsc.type = 'sine';
    this._brakeOsc.frequency.value = 1800;
    this._brakeOsc.connect(this._brakeGain);
    this._brakeGain.connect(this._masterGain);
    this._brakeOsc.start();

    this._ready = true;
  }

  /**
   * Update engine sound parameters each frame.
   * @param {number} delta
   * @param {number} speedKmh - Current vehicle speed
   * @param {number} throttle - 0..1 throttle input
   * @param {boolean} braking - Brake active
   * @param {boolean} nitroActive - Nitro boost active
   * @param {boolean} isDrifting - Currently drifting
   */
  update(delta, speedKmh, throttle, braking, nitroActive, isDrifting) {
    if (!this._ready || !this.ctx) return;

    this._speed = speedKmh;

    // Map speed to target RPM (0-1)
    const maxSpeed = 260;
    this._targetRPM = Math.min(1, speedKmh / maxSpeed);

    // Blend RPM with heavier throttle influence at low speed
    const loadFactor = throttle > 0.1 ? 1.0 : 0.3;
    this._currentRPM += (this._targetRPM - this._currentRPM) * Math.min(delta * (loadFactor > 0.5 ? 4 : 2), 1);

    const rpm = this._currentRPM;

    // --- Engine frequency ---
    // Lower, rounder sports-car band instead of a sharp race-car scream.
    const idleFreq = 62;
    const redlineFreq = 285;
    const freq = idleFreq + (redlineFreq - idleFreq) * rpm;
    this._engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    this._engineOsc2.frequency.setTargetAtTime(freq * 1.52, this.ctx.currentTime, 0.06);
    this._engineSubOsc.frequency.setTargetAtTime(freq * 0.5, this.ctx.currentTime, 0.08);
    this._engineSubGain.gain.setTargetAtTime(0.22 + throttle * 0.1, this.ctx.currentTime, 0.08);

    // --- Filter cutoff ---
    const cutoff = 520 + rpm * 1350 + throttle * 240;
    this._engineFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.08);
    this._engineResonance.frequency.setTargetAtTime(150 + rpm * 180, this.ctx.currentTime, 0.1);
    this._engineResonance.gain.setTargetAtTime(3.0 + throttle * 2.0, this.ctx.currentTime, 0.08);

    // --- Engine volume ---
    let engineVol = 0.13 + rpm * 0.20 + throttle * 0.18;
    if (isDrifting) engineVol += 0.055;
    this._engineGain.gain.setTargetAtTime(engineVol, this.ctx.currentTime, 0.07);

    // --- Nitro sound ---
    if (nitroActive && !this._nitroActive) {
      this._nitroActive = true;
      this._nitroGain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.02);
      this._nitroOsc.frequency.setTargetAtTime(800, this.ctx.currentTime, 0.05);
    } else if (!nitroActive && this._nitroActive) {
      this._nitroActive = false;
      this._nitroGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    if (nitroActive) {
      // Modulate nitro hiss frequency
      this._nitroOsc.frequency.setTargetAtTime(520 + Math.random() * 260, this.ctx.currentTime, 0.1);
    }

    // --- Brake squeal ---
    if (braking && speedKmh > 30 && !this._brakeActive) {
      this._brakeActive = true;
      this._brakeGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.02);
    } else if ((!braking || speedKmh < 10) && this._brakeActive) {
      this._brakeActive = false;
      this._brakeGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    if (this._brakeActive) {
      this._brakeOsc.frequency.setTargetAtTime(
        1500 + (speedKmh / 260) * 2000 + Math.random() * 300,
        this.ctx.currentTime, 0.1
      );
    }
  }

  /**
   * Brief sound burst for collision.
   */
  playCrash(intensity = 0.5) {
    if (!this._ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Quick noise burst through master
    const oldGain = this._masterGain.gain.value;
    this._masterGain.gain.setValueAtTime(oldGain + intensity * 0.4, now);
    this._masterGain.gain.exponentialRampToValueAtTime(oldGain, now + 0.3);
  }

  /**
   * Play nitro activation burst.
   */
  playNitroBurst() {
    if (!this._ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    this._nitroGain.gain.setValueAtTime(0.2, now);
    this._nitroGain.gain.exponentialRampToValueAtTime(0.08, now + 0.4);
  }

  setMasterVolume(v) {
    if (this._masterGain) this._masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  get isReady() {
    return this._ready;
  }

  dispose() {
    if (!this._ready) return;
    try {
      this._engineOsc?.stop();
      this._engineOsc2?.stop();
      this._engineSubOsc?.stop();
      this._nitroOsc?.stop();
      this._brakeOsc?.stop();
    } catch {}
    this._engineOsc?.disconnect();
    this._engineOsc2?.disconnect();
    this._engineSubOsc?.disconnect();
    this._engineSubGain?.disconnect();
    this._nitroOsc?.disconnect();
    this._brakeOsc?.disconnect();
    this._engineResonance?.disconnect();
    this._engineFilter?.disconnect();
    this._engineGain?.disconnect();
    this._nitroGain?.disconnect();
    this._brakeGain?.disconnect();
    this._masterGain?.disconnect();
    this._ready = false;
  }
}
