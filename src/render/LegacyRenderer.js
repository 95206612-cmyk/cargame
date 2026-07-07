import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Sealed legacy renderer. Keep this file as a rollback reference while the
// runtime uses the new PBR Renderer in Renderer.js.
const QUALITY_PRESETS = {
  ultra: {
    shadows: true, shadowMapSize: 8192, antialias: true,
    pixelRatio: 2, toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0, outputColorSpace: THREE.SRGBColorSpace,
  },
  high: {
    shadows: true, shadowMapSize: 2048, antialias: true,
    pixelRatio: 1.5, toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0, outputColorSpace: THREE.SRGBColorSpace,
  },
  medium: {
    shadows: true, shadowMapSize: 1024, antialias: true,
    pixelRatio: 1, toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0, outputColorSpace: THREE.SRGBColorSpace,
  },
  low: {
    shadows: false, shadowMapSize: 512, antialias: false,
    pixelRatio: 1, toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1.0, outputColorSpace: THREE.SRGBColorSpace,
  },
};

export class LegacyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = 'high';
    this._detectedPerformance = null;
    this._pmremGenerator = null;
    this._environmentTarget = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 200, 1000);

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl || undefined,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if ('useLegacyLights' in this.renderer) this.renderer.useLegacyLights = false;

    this._setupPBREnvironment();

    this._autoDetectPerformance();
  }

  setQuality(preset) {
    const cfg = QUALITY_PRESETS[preset];
    if (!cfg) return;

    this.quality = preset;
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.renderer.shadowMap.type = cfg.shadows ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.pixelRatio));
    this.renderer.toneMapping = cfg.toneMapping;
    this.renderer.toneMappingExposure = cfg.toneMappingExposure;
    this.renderer.outputColorSpace = cfg.outputColorSpace;
    this._shadowMapSize = cfg.shadowMapSize;
  }

  _setupPBREnvironment() {
    try {
      this._pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this._pmremGenerator.compileEquirectangularShader();
      const room = new RoomEnvironment();
      this._environmentTarget = this._pmremGenerator.fromScene(room, 0.04);
      this.scene.environment = this._environmentTarget.texture;
      this.scene.environmentIntensity = 0.58;
      room.dispose?.();
    } catch (err) {
      console.warn('[LegacyRenderer] PBR environment disabled:', err.message);
    }
  }

  getShadowMapSize() {
    return this._shadowMapSize || 2048;
  }

  getQuality() {
    return this.quality;
  }

  _autoDetectPerformance() {
    let score = 0;

    try {
      const gl = this.renderer.getContext();
      const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbgInfo) {
        const gpu = gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
        if (/rtx|nvidia|radeon|rx\s*[67]|arc\s*a\d/i.test(gpu)) score += 3;
        else if (/iris\s*xe|radeon\s*(graphics|vega|780m|680m)|apple\s*m\d/i.test(gpu)) score += 2;
        else score += 1;
      } else {
        score += 1;
      }
    } catch { score += 1; }

    if (window.devicePixelRatio >= 3) score += 0;
    else if (window.devicePixelRatio >= 2) score += 1;
    else score += 2;

    if (navigator.deviceMemory) {
      if (navigator.deviceMemory >= 8) score += 2;
      else if (navigator.deviceMemory >= 4) score += 1;
    }

    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) score += 1;

    if (score >= 7) this._detectedPerformance = 'ultra';
    else if (score >= 5) this._detectedPerformance = 'high';
    else if (score >= 3) this._detectedPerformance = 'medium';
    else this._detectedPerformance = 'low';

    this.setQuality(this._detectedPerformance);
    console.log(`[LegacyRenderer] Performance: score=${score}, preset=${this._detectedPerformance}`);
  }

  getDetectedPerformance() {
    return this._detectedPerformance;
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  getContext() {
    return this.renderer.getContext();
  }

  getSize() {
    return this.renderer.getSize(new THREE.Vector2());
  }

  dispose() {
    this._environmentTarget?.dispose?.();
    this._pmremGenerator?.dispose?.();
    this.renderer.dispose();
    this.scene.clear();
  }
}
