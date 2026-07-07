import * as THREE from 'three';

const LIGHT_PRESETS = {
  morning: {
    ambient:     { color: 0xfff0d8, intensity: 0.42 },
    hemisphere:  { sky: 0xbfe4ff, ground: 0x8aa06d, intensity: 0.74 },
    sun:         { color: 0xffc37a, intensity: 2.22 },
    background:  0xbfe7ff,
    fog:         0xdcefff,
    sunPosition: [-55, 42, 15],
  },
  day: {
    ambient:     { color: 0xffffff, intensity: 0.44 },
    hemisphere:  { sky: 0xcfefff, ground: 0x8ca36a, intensity: 0.82 },
    sun:         { color: 0xffffff, intensity: 2.9 },
    background:  0xbfefff,
    fog:         0xcfefff,
    sunPosition: [35, 95, 25],
  },
  dusk: {
    ambient:     { color: 0x604040, intensity: 0.4 },
    hemisphere:  { sky: 0xff8844, ground: 0x221100, intensity: 0.5 },
    sun:         { color: 0xff9944, intensity: 1.0 },
    background:  0xff8844,
    fog:         0xff8844,
    sunPosition: [50, 15, -80],
  },
  evening: {
    ambient:     { color: 0xffb08a, intensity: 0.5 },
    hemisphere:  { sky: 0xff9d63, ground: 0x35301f, intensity: 0.5 },
    sun:         { color: 0xff8844, intensity: 1.38 },
    background:  0xffa05f,
    fog:         0xffb076,
    sunPosition: [65, 18, -55],
  },
  rain: {
    ambient:     { color: 0x9fb5c8, intensity: 0.38 },
    hemisphere:  { sky: 0x8fa8ba, ground: 0x4d5f64, intensity: 0.64 },
    sun:         { color: 0xbdd2e4, intensity: 1.08 },
    background:  0x9eb4c4,
    fog:         0x9eb4c4,
    sunPosition: [25, 55, 35],
  },
  snow: {
    ambient:     { color: 0xffffff, intensity: 0.84 },
    hemisphere:  { sky: 0xdcecff, ground: 0xcfd8df, intensity: 0.72 },
    sun:         { color: 0xdff2ff, intensity: 0.9 },
    background:  0xd8e7f1,
    fog:         0xd8e7f1,
    sunPosition: [20, 62, 40],
  },
  night: {
    ambient:     { color: 0x2b4f7a, intensity: 0.72 },
    hemisphere:  { sky: 0x1e3a5f, ground: 0x111827, intensity: 0.62 },
    sun:         { color: 0x8fb9ff, intensity: 0.82 },
    background:  0x101827,
    fog:         0x101827,
    sunPosition: [30, 60, 50],
  },
};

const LUMEN_PROFILES = {
  morning: {
    sky: { color: 0xffead2, ground: 0x6f8c68, intensity: 0.32 },
    bounce: { color: 0xffd1a0, intensity: 0.18, position: [-28, 16, -18] },
    rim: { color: 0x9fd2ff, intensity: 0.22, position: [42, 28, -64] },
  },
  day: {
    sky: { color: 0xd7f0ff, ground: 0x8fb070, intensity: 0.34 },
    bounce: { color: 0xdaf8ff, intensity: 0.2, position: [-35, 18, -30] },
    rim: { color: 0xcce8ff, intensity: 0.24, position: [55, 34, -70] },
  },
  evening: {
    sky: { color: 0xffb477, ground: 0x443520, intensity: 0.3 },
    bounce: { color: 0xff8f50, intensity: 0.22, position: [-50, 13, 20] },
    rim: { color: 0x6277ff, intensity: 0.28, position: [56, 24, -62] },
  },
  dusk: {
    sky: { color: 0xff8f50, ground: 0x1f1720, intensity: 0.24 },
    bounce: { color: 0xff7a3d, intensity: 0.16, position: [-45, 12, 25] },
    rim: { color: 0x5c73ff, intensity: 0.24, position: [48, 22, -58] },
  },
  rain: {
    sky: { color: 0x9eb4c4, ground: 0x3f4f52, intensity: 0.26 },
    bounce: { color: 0x9fb5c8, intensity: 0.12, position: [-22, 15, -26] },
    rim: { color: 0xd7ecff, intensity: 0.34, position: [36, 32, -56] },
  },
  snow: {
    sky: { color: 0xf0fbff, ground: 0xd9e8f0, intensity: 0.42 },
    bounce: { color: 0xffffff, intensity: 0.28, position: [-26, 14, -22] },
    rim: { color: 0xcce9ff, intensity: 0.3, position: [36, 34, -54] },
  },
  night: {
    sky: { color: 0x294c7a, ground: 0x0d1322, intensity: 0.22 },
    bounce: { color: 0x23355f, intensity: 0.1, position: [-24, 14, -22] },
    rim: { color: 0x78aaff, intensity: 0.36, position: [32, 28, -48] },
  },
};

const SHADOW_CONTRAST = {
  ambient: 0.38,
  hemisphere: 0.46,
  fill: 0.28,
  lumenSky: 0.34,
  lumenBounce: 0.22,
  lumenRim: 0.5,
  sun: 1.12,
};

export class LightManager {
  constructor(scene) {
    this.scene = scene;
    this.preset = 'day';
    this.lumenEnabled = true;

    // Ambient
    this.ambient = new THREE.AmbientLight(0x406080, 0.45);
    this.scene.add(this.ambient);

    // Hemisphere (sky + ground)
    this.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.4);
    this.scene.add(this.hemisphere);

    // Directional sun
    this.sun = new THREE.DirectionalLight(0xfff5e6, 1.5);
    this.sun.position.set(50, 80, 30);
    this.sun.userData.pbrShadowOffset = new THREE.Vector3(50, 80, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 8192;
    this.sun.shadow.mapSize.height = 8192;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.camera.left = -120;
    this.sun.shadow.camera.right = 120;
    this.sun.shadow.camera.top = 120;
    this.sun.shadow.camera.bottom = -120;
    this.sun.shadow.bias = -0.00005;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 1.8;
    if ('blurSamples' in this.sun.shadow) this.sun.shadow.blurSamples = 6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sun.target.position.set(0, 0, 0);

    this.fill = new THREE.DirectionalLight(0xbfd8ff, 0.28);
    this.fill.position.set(-45, 38, -55);
    this.fill.castShadow = false;
    this.scene.add(this.fill);

    this.lumenSky = new THREE.HemisphereLight(0xd7f0ff, 0x8fb070, 0.34);
    this.lumenSky.name = 'lumen-sky-bounce';
    this.scene.add(this.lumenSky);

    this.lumenBounce = new THREE.DirectionalLight(0xdaf8ff, 0.2);
    this.lumenBounce.name = 'lumen-ground-bounce';
    this.lumenBounce.position.set(-35, 18, -30);
    this.lumenBounce.castShadow = false;
    this.scene.add(this.lumenBounce);

    this.lumenRim = new THREE.DirectionalLight(0xcce8ff, 0.24);
    this.lumenRim.name = 'lumen-rim-probe';
    this.lumenRim.position.set(55, 34, -70);
    this.lumenRim.castShadow = false;
    this.scene.add(this.lumenRim);

    // Point light pool
    this.maxPointLights = 8;
    this._pointLights = [];
  }

  // ---- Preset switching ----

  setPreset(preset) {
    const cfg = LIGHT_PRESETS[preset];
    if (!cfg) return;

    this.preset = preset;

    this.ambient.color.set(cfg.ambient.color);
    this.ambient.intensity = cfg.ambient.intensity * SHADOW_CONTRAST.ambient;

    this.hemisphere.color.set(cfg.hemisphere.sky);
    this.hemisphere.groundColor?.set?.(cfg.hemisphere.ground); // Ground color if supported
    this.hemisphere.intensity = cfg.hemisphere.intensity * SHADOW_CONTRAST.hemisphere;

    this.sun.color.set(cfg.sun.color);
    this.sun.intensity = cfg.sun.intensity * SHADOW_CONTRAST.sun;
    this.sun.position.set(...cfg.sunPosition);
    this.sun.userData.pbrShadowOffset = new THREE.Vector3(...cfg.sunPosition);
    this.fill.intensity = Math.max(0.06, cfg.hemisphere.intensity * 0.28 * SHADOW_CONTRAST.fill);
    this._applyLumenProfile(preset);

    this.scene.background = new THREE.Color(cfg.background);
    if (this.scene.fog) {
      this.scene.fog.color = new THREE.Color(cfg.fog);
    }
  }

  getPreset() {
    return this.preset;
  }

  // ---- Point light management ----

  addPointLight(position, color = 0xffffff, intensity = 1.0, distance = 20) {
    // Evict excess lights
    while (this._pointLights.length >= this.maxPointLights) {
      const removed = this._pointLights.shift();
      this.scene.remove(removed);
      if (removed.dispose) removed.dispose();
    }

    const light = new THREE.PointLight(color, intensity, distance);
    light.position.copy(position);
    this.scene.add(light);
    this._pointLights.push(light);
    return light;
  }

  removePointLight(light) {
    const idx = this._pointLights.indexOf(light);
    if (idx !== -1) {
      this._pointLights.splice(idx, 1);
      this.scene.remove(light);
      if (light.dispose) light.dispose();
    }
  }

  setMaxPointLights(max) {
    this.maxPointLights = Math.max(0, max);
    // Evict if over limit
    while (this._pointLights.length > this.maxPointLights) {
      const removed = this._pointLights.shift();
      this.scene.remove(removed);
      if (removed.dispose) removed.dispose();
    }
  }

  // ---- Shadow quality ----

  setShadowQuality(level) {
    if (level <= 0) {
      this.sun.castShadow = false;
    } else {
      this.sun.castShadow = true;
      const sizes = [512, 1024, 2048, 4096, 4096];
      const size = sizes[Math.min(level, sizes.length - 1)] || 2048;
      this.sun.shadow.mapSize.width = size;
      this.sun.shadow.mapSize.height = size;
      this.sun.shadow.needsUpdate = true;
    }
  }

  setShadowsEnabled(enabled) {
    this.sun.castShadow = enabled;
  }

  setLumenEnabled(enabled) {
    this.lumenEnabled = Boolean(enabled);
    this._applyLumenProfile(this.preset);
  }

  _applyLumenProfile(preset) {
    const profile = LUMEN_PROFILES[preset] || LUMEN_PROFILES.day;
    const scale = this.lumenEnabled ? 1 : 0;

    this.lumenSky.color.set(profile.sky.color);
    this.lumenSky.groundColor?.set?.(profile.sky.ground);
    this.lumenSky.intensity = profile.sky.intensity * SHADOW_CONTRAST.lumenSky * scale;

    this.lumenBounce.color.set(profile.bounce.color);
    this.lumenBounce.intensity = profile.bounce.intensity * SHADOW_CONTRAST.lumenBounce * scale;
    this.lumenBounce.position.set(...profile.bounce.position);

    this.lumenRim.color.set(profile.rim.color);
    this.lumenRim.intensity = profile.rim.intensity * SHADOW_CONTRAST.lumenRim * scale;
    this.lumenRim.position.set(...profile.rim.position);
  }

  // ---- Update ----

  update(delta) {
    // Sun target follows origin; track if needed
  }

  dispose() {
    this.scene.remove(this.ambient);
    this.scene.remove(this.hemisphere);
    this.scene.remove(this.sun);
    this.scene.remove(this.fill);
    this.scene.remove(this.lumenSky);
    this.scene.remove(this.lumenBounce);
    this.scene.remove(this.lumenRim);
    for (const light of this._pointLights) {
      this.scene.remove(light);
      if (light.dispose) light.dispose();
    }
    this._pointLights = [];
  }
}
