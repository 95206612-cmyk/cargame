import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

/**
 * Professional post-processing pipeline using Three.js EffectComposer.
 *
 * Pipeline: RenderPass → UnrealBloomPass → AfterimagePass(motion blur)
 *           → ShaderPass(vignette+color) → SMAAPass → OutputPass
 *
 * All effects toggleable. Quality presets control which effects are active.
 * Replaces the old ping-pong manual blend approach.
 */
export class PostProcess {
  constructor(renderer, scene, camera) {
    this._renderer = renderer.renderer || renderer;
    this._scene = scene;
    this._camera = camera;

    this._enabled = false;
    this._initialized = false;

    // Composer and passes
    this._composer = null;
    this._renderPass = null;
    this._bloomPass = null;
    this._afterimagePass = null;
    this._vignettePass = null;
    this._smaaPass = null;
    this._outputPass = null;

    // Effect flags
    this.bloomEnabled = false;
    this.motionBlurEnabled = false;
    this.vignetteEnabled = true;
    this.smaaEnabled = true;

    // Parameters
    this._bloomStrength = 1.5;
    this._bloomRadius = 0.4;
    this._bloomThreshold = 0.6;
    this._motionBlurTarget = 0;
    this._motionBlurCurrent = 0;
    this._vignetteStrength = 0.35;
    this._contrast = 1.0;
    this._saturation = 1.0;

    // CSS vignette overlay (supplement)
    this._vignetteOverlay = null;
    this._createVignetteOverlay();

    // Resolution tracking
    this._width = 0;
    this._height = 0;
  }

  // ==================== Initialization ====================

  init() {
    if (this._initialized) return;

    const size = this._renderer.getSize(new THREE.Vector2());
    this._width = size.x;
    this._height = size.y;

    // --- Composer ---
    this._composer = new EffectComposer(this._renderer);
    this._composer.setSize(this._width, this._height);

    // --- RenderPass ---
    this._renderPass = new RenderPass(this._scene, this._camera);
    this._composer.addPass(this._renderPass);

    // --- UnrealBloomPass (glow for lights, nitro, etc.) ---
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this._width, this._height),
      this._bloomStrength, this._bloomRadius, this._bloomThreshold,
    );
    this._bloomPass.renderToScreen = false;
    this._composer.addPass(this._bloomPass);

    // --- AfterimagePass (motion blur via frame blending) ---
    this._afterimagePass = new AfterimagePass(0.9);
    this._afterimagePass.renderToScreen = false;
    this._composer.addPass(this._afterimagePass);

    // --- Vignette + Color Grading ShaderPass ---
    this._vignettePass = new ShaderPass(this._createVignetteShader());
    this._vignettePass.renderToScreen = false;
    this._composer.addPass(this._vignettePass);

    // --- SMAAPass (anti-aliasing) ---
    this._smaaPass = new SMAAPass(this._width, this._height);
    this._smaaPass.renderToScreen = false;
    this._composer.addPass(this._smaaPass);

    // --- OutputPass (handles color space conversion to screen) ---
    this._outputPass = new OutputPass();
    this._composer.addPass(this._outputPass);

    this._initialized = true;

    // Apply initial effect states
    this._applyEffectStates();
  }

  // ==================== Effect Toggles ====================

  setEnabled(enabled) {
    this._enabled = enabled;
    if (this._vignetteOverlay) {
      this._vignetteOverlay.style.display = enabled && this.vignetteEnabled ? 'block' : 'none';
    }
  }

  setBloom(enabled, strength = 1.5) {
    this.bloomEnabled = enabled;
    this._bloomStrength = strength;
    if (this._bloomPass) {
      this._bloomPass.strength = enabled ? strength : 0;
    }
  }

  setMotionBlurFromSpeed(speedKmh) {
    if (speedKmh < 10) {
      this._motionBlurTarget = 0.95; // Almost no trail
    } else if (speedKmh < 80) {
      this._motionBlurTarget = 0.92 - (speedKmh / 80) * 0.07; // 0.92 → 0.85
    } else if (speedKmh < 200) {
      this._motionBlurTarget = 0.85 - ((speedKmh - 80) / 120) * 0.15; // 0.85 → 0.70
    } else {
      this._motionBlurTarget = 0.65; // Strong trail at max speed
    }
    this._motionBlurTarget = Math.max(0.55, Math.min(0.95, this._motionBlurTarget));
  }

  setVignette(strength) {
    this.vignetteEnabled = strength > 0;
    this._vignetteStrength = strength;
    if (this._vignetteOverlay) {
      this._vignetteOverlay.style.opacity = String(strength * 0.6);
    }
  }

  setColorGrading(contrast = 1.0, saturation = 1.0) {
    this._contrast = contrast;
    this._saturation = saturation;
  }

  /**
   * Apply all effect states to the passes. Called after quality preset changes.
   */
  _applyEffectStates() {
    if (!this._initialized) return;

    // Bloom
    if (this._bloomPass) {
      this._bloomPass.strength = this.bloomEnabled ? this._bloomStrength : 0;
    }

    // Afterimage
    if (this._afterimagePass) {
      this._afterimagePass.enabled = this.motionBlurEnabled;
    }

    // SMAA
    if (this._smaaPass) {
      this._smaaPass.enabled = this.smaaEnabled;
    }

    // Vignette overlay
    if (this._vignetteOverlay) {
      this._vignetteOverlay.style.display =
        this._enabled && this.vignetteEnabled ? 'block' : 'none';
      this._vignetteOverlay.style.opacity = String(this._vignetteStrength * 0.6);
    }
  }

  // ==================== Quality Presets ====================

  /**
   * Apply quality preset — enables/disables effects based on device tier.
   * @param {'ultra'|'high'|'medium'|'low'} preset
   */
  setQuality(preset) {
    switch (preset) {
      case 'ultra':
        this.bloomEnabled = true;
        this._bloomStrength = 1.8;
        this._bloomRadius = 0.5;
        this._bloomThreshold = 0.5;
        this.motionBlurEnabled = true;
        this.smaaEnabled = true;
        this.vignetteEnabled = true;
        break;
      case 'high':
        this.bloomEnabled = true;
        this._bloomStrength = 1.5;
        this._bloomRadius = 0.4;
        this._bloomThreshold = 0.6;
        this.motionBlurEnabled = true;
        this.smaaEnabled = true;
        this.vignetteEnabled = true;
        break;
      case 'medium':
        this.bloomEnabled = true;
        this._bloomStrength = 1.0;
        this._bloomRadius = 0.3;
        this._bloomThreshold = 0.7;
        this.motionBlurEnabled = false;
        this.smaaEnabled = true;
        this.vignetteEnabled = true;
        break;
      case 'low':
      default:
        this.bloomEnabled = false;
        this.motionBlurEnabled = false;
        this.smaaEnabled = false;
        this.vignetteEnabled = false;
        break;
    }

    this._applyEffectStates();

    // Update bloom pass parameters if initialized
    if (this._bloomPass && this.bloomEnabled) {
      this._bloomPass.strength = this._bloomStrength;
      this._bloomPass.radius = this._bloomRadius;
      this._bloomPass.threshold = this._bloomThreshold;
    }
  }

  // ==================== Render ====================

  /**
   * Render the scene through the effect pipeline.
   */
  render() {
    if (!this._initialized) this.init();
    if (!this._enabled) return false;

    // Smooth motion blur transition
    this._motionBlurCurrent += (this._motionBlurTarget - this._motionBlurCurrent) * 0.12;
    if (this._afterimagePass && this.motionBlurEnabled) {
      this._afterimagePass.uniforms['damp'].value = this._motionBlurCurrent;
    }

    // Update vignette uniform
    if (this._vignettePass) {
      this._vignettePass.uniforms['uVignette'].value =
        this.vignetteEnabled ? this._vignetteStrength : 0;
      this._vignettePass.uniforms['uContrast'].value = this._contrast;
      this._vignettePass.uniforms['uSaturation'].value = this._saturation;
    }

    this._composer.render();
    return true;
  }

  // ==================== Public API (compatible with old interface) ====================

  /** @deprecated No-op — composer doesn't need manual capture */
  capture() {}

  /** @deprecated No-op — composer doesn't need manual release */
  releaseCapture() {}

  // ==================== Resize ====================

  resize() {
    if (!this._initialized) return;
    const size = this._renderer.getSize(new THREE.Vector2());
    this._width = size.x;
    this._height = size.y;

    this._composer.setSize(this._width, this._height);
    if (this._bloomPass) {
      this._bloomPass.resolution.set(this._width, this._height);
    }
    if (this._smaaPass) {
      this._smaaPass.setSize(this._width, this._height);
    }
  }

  // ==================== Vignette Shader ====================

  _createVignetteShader() {
    return {
      uniforms: {
        tDiffuse: { value: null },
        uVignette: { value: this._vignetteStrength },
        uContrast: { value: 1.0 },
        uSaturation: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uVignette;
        uniform float uContrast;
        uniform float uSaturation;

        vec3 adjustSaturation(vec3 color, float sat) {
          float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
          return mix(vec3(lum), color, sat);
        }

        void main() {
          vec4 color = texture2D(tDiffuse, vUv);

          // Saturation
          color.rgb = adjustSaturation(color.rgb, uSaturation);

          // Contrast
          color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

          // Vignette (darken edges)
          float dist = distance(vUv, vec2(0.5));
          float vignette = 1.0 - dist * uVignette * 1.2;
          vignette = smoothstep(0.0, 1.0, vignette);
          color.rgb *= vignette;

          gl_FragColor = color;
        }
      `,
    };
  }

  // ==================== Vignette Overlay ====================

  _createVignetteOverlay() {
    const el = document.createElement('div');
    el.id = 'vignette-overlay';
    el.style.cssText = `
      position:fixed;inset:0;pointer-events:none;z-index:4;
      display:none;
      background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%);
    `;
    document.body.appendChild(el);
    this._vignetteOverlay = el;
  }

  // ==================== Cleanup ====================

  dispose() {
    if (this._composer) {
      this._composer.dispose();
      this._composer = null;
    }
    this._renderPass = null;
    this._bloomPass = null;
    this._afterimagePass = null;
    this._vignettePass = null;
    this._smaaPass = null;
    this._outputPass = null;
    this._initialized = false;
  }
}
