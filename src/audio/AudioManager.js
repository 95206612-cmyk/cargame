export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.buffers = {};
    this.currentMusic = null;
    this.initialized = false;
  }

  async init() {
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);

      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = 0.7;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.masterGain);

      this.initialized = true;
    } catch (e) {
      console.warn('[AudioManager] AudioContext not available:', e.message);
    }
  }

  async unlock() {
    if (!this.initialized) return false;
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    return this.context.state === 'running';
  }

  async loadSound(name, url) {
    if (!this.initialized) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      this.buffers[name] = await this.context.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn(`[AudioManager] Failed to load sound "${name}":`, e.message);
    }
  }

  playSFX(name, loop = false) {
    if (!this.initialized || !this.buffers[name]) return null;
    const source = this.context.createBufferSource();
    source.buffer = this.buffers[name];
    source.loop = loop;
    source.connect(this.sfxGain);
    source.start();
    return source;
  }

  playMusic(name) {
    if (this.currentMusic) {
      try { this.currentMusic.stop(); } catch {}
    }
    this.currentMusic = this.playSFX(name, true);
  }

  stopMusic() {
    if (this.currentMusic) {
      try { this.currentMusic.stop(); } catch {}
      this.currentMusic = null;
    }
  }

  setMusicVolume(v) {
    if (this.musicGain) this.musicGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setSFXVolume(v) {
    if (this.sfxGain) this.sfxGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setMasterVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  suspend() {
    if (this.context?.state === 'running') {
      this.context.suspend();
    }
  }

  resume() {
    if (this.context?.state === 'suspended') {
      return this.context.resume();
    }
    return Promise.resolve();
  }

  get isSuspended() {
    return this.context?.state === 'suspended';
  }

  playTone(options = {}) {
    if (!this.initialized || !this.context || !this.sfxGain) return null;
    if (this.context.state !== 'running') return null;
    const ctx = this.context;
    const now = ctx.currentTime + (options.delay || 0);
    const duration = Math.max(0.02, options.duration ?? 0.18);
    const attack = Math.max(0.005, options.attack ?? 0.01);
    const release = Math.max(0.01, options.release ?? 0.08);
    const gainValue = Math.max(0.0001, options.gain ?? 0.12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(options.frequency || 440, now);
    if (Number.isFinite(options.endFrequency)) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), now + duration);
    }
    if (Number.isFinite(options.detune)) {
      osc.detune.setValueAtTime(options.detune, now);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + attack);
    gain.gain.setTargetAtTime(0.0001, now + Math.max(attack, duration - release), release);

    osc.connect(gain);
    gain.connect(options.destination || this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + release * 2);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    return osc;
  }

  playNoise(options = {}) {
    if (!this.initialized || !this.context || !this.sfxGain) return null;
    if (this.context.state !== 'running') return null;
    const ctx = this.context;
    const now = ctx.currentTime + (options.delay || 0);
    const duration = Math.max(0.03, options.duration ?? 0.2);
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = options.filterType || 'bandpass';
    filter.frequency.value = options.filterFrequency || 900;
    filter.Q.value = options.q || 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain ?? 0.12), now + (options.attack ?? 0.01));
    gain.gain.setTargetAtTime(0.0001, now + duration * 0.45, options.release ?? 0.08);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(options.destination || this.sfxGain);
    source.start(now);
    source.stop(now + duration + 0.15);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    return source;
  }

  playCountdownTick(step = 1) {
    const base = 520 + Math.max(0, Math.min(3, step)) * 45;
    this.playTone({ frequency: base, endFrequency: base * 0.72, type: 'square', duration: 0.16, gain: 0.18 });
    this.playTone({ frequency: base * 2, type: 'sine', duration: 0.08, gain: 0.08, delay: 0.02 });
  }

  playGo() {
    this.playTone({ frequency: 620, endFrequency: 980, type: 'sawtooth', duration: 0.28, gain: 0.2 });
    this.playTone({ frequency: 1240, endFrequency: 1680, type: 'triangle', duration: 0.32, gain: 0.11, delay: 0.03 });
    this.playNoise({ filterType: 'highpass', filterFrequency: 1800, duration: 0.2, gain: 0.05, delay: 0.02 });
  }

  playLap() {
    this.playTone({ frequency: 660, type: 'triangle', duration: 0.12, gain: 0.14 });
    this.playTone({ frequency: 880, type: 'triangle', duration: 0.12, gain: 0.14, delay: 0.12 });
    this.playTone({ frequency: 1320, type: 'sine', duration: 0.16, gain: 0.1, delay: 0.24 });
  }

  playFinish() {
    this.playTone({ frequency: 523.25, type: 'triangle', duration: 0.16, gain: 0.14 });
    this.playTone({ frequency: 659.25, type: 'triangle', duration: 0.16, gain: 0.14, delay: 0.15 });
    this.playTone({ frequency: 783.99, type: 'triangle', duration: 0.18, gain: 0.14, delay: 0.3 });
    this.playTone({ frequency: 1046.5, type: 'sine', duration: 0.34, gain: 0.16, delay: 0.47 });
  }

  playHorn(intensity = 1) {
    const gain = 0.08 + Math.max(0, Math.min(1, intensity)) * 0.11;
    this.playTone({ frequency: 390, type: 'square', duration: 0.22, gain });
    this.playTone({ frequency: 470, type: 'square', duration: 0.22, gain: gain * 0.7 });
    this.playTone({ frequency: 390, type: 'square', duration: 0.18, gain: gain * 0.9, delay: 0.28 });
    this.playTone({ frequency: 470, type: 'square', duration: 0.18, gain: gain * 0.6, delay: 0.28 });
  }

  playEngineStart() {
    this.playNoise({ filterType: 'lowpass', filterFrequency: 420, duration: 0.22, gain: 0.08 });
    this.playTone({ frequency: 58, endFrequency: 142, type: 'sawtooth', duration: 0.46, gain: 0.12, delay: 0.04 });
    this.playTone({ frequency: 36, endFrequency: 72, type: 'sine', duration: 0.42, gain: 0.07, delay: 0.02 });
  }

  playEngineStop() {
    this.playTone({ frequency: 140, endFrequency: 48, type: 'sawtooth', duration: 0.46, gain: 0.09 });
    this.playNoise({ filterType: 'lowpass', filterFrequency: 320, duration: 0.16, gain: 0.035, delay: 0.12 });
  }

  playGearShift() {
    this.playTone({ frequency: 185, endFrequency: 128, type: 'sawtooth', duration: 0.11, gain: 0.06 });
    this.playNoise({ filterType: 'bandpass', filterFrequency: 760, duration: 0.07, gain: 0.028 });
  }

  playCheckpoint() {
    this.playTone({ frequency: 980, type: 'sine', duration: 0.08, gain: 0.07 });
  }

  playImpact(intensity = 0.5) {
    const gain = 0.08 + Math.max(0, Math.min(1, intensity)) * 0.14;
    this.playNoise({ filterType: 'lowpass', filterFrequency: 520, duration: 0.18, gain });
    this.playTone({ frequency: 86, endFrequency: 46, type: 'square', duration: 0.16, gain: gain * 0.8 });
  }
}
