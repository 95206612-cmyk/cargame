import * as THREE from 'three';

/**
 * Lightweight weather system.
 * - Full-screen rain particle effect
 * - Wet road surface overlay
 * - Fog density control
 * - Physics friction sync callback
 */
export class WeatherSystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this._renderer = renderer;

    this.weather = 'clear_noon';
    this._rainSystem = null;
    this._snowSystem = null;
    this._snowTexture = null;
    this._rainCount = 2200;
    this._snowCount = 1200;
    this._rainArea = 78;        // Rain follows the camera
    this._rainHeight = 32;
    this._rainSpeed = 18;
    this._rainLength = 1.45;
    this._snowSpeed = 2.3;

    // Wet road overlay
    this._wetOverlay = null;
    this._wetOverlayOpacity = 0;

    // Fog
    this._baseFogDensity = 0.0003;
    this._rainFogDensity = 0.0022;
    this._snowFogDensity = 0.0028;
    this._targetFogDensity = this._baseFogDensity;

    // Callbacks
    this.onFrictionChange = null;  // Called with multiplier when weather changes

    // Rain sound reference
    this._rainSoundEnabled = false;
  }

  /**
   * Set the current weather.
   * @param {'clear_morning'|'clear_noon'|'clear_evening'|'rain'|'snow'} type
   */
  setWeather(type) {
    if (type === 'clear') type = 'clear_noon';
    if (type === this.weather) return;
    this.weather = type;

    if (type === 'rain') {
      this._startRain();
      this._stopSnow();
      this._showWetRoad();
      this._targetFogDensity = this._rainFogDensity;
      if (this.onFrictionChange) this.onFrictionChange(0.7);
    } else if (type === 'snow') {
      this._stopRain();
      this._startSnow();
      this._showWetRoad(0xdfefff, 0.22);
      this._targetFogDensity = this._snowFogDensity;
      if (this.onFrictionChange) this.onFrictionChange(0.58);
    } else {
      this._stopRain();
      this._stopSnow();
      this._hideWetRoad();
      this._targetFogDensity = this._baseFogDensity;
      if (this.onFrictionChange) this.onFrictionChange(1.0);
    }
  }

  /**
   * Get current weather type.
   */
  getWeather() {
    return this.weather;
  }

  /**
   * Enable/disable rain ambient sound.
   */
  setRainSound(enabled) {
    this._rainSoundEnabled = enabled;
  }

  // ==================== Rain Particles ====================

  _startRain() {
    if (this._rainSystem) return;

    const count = this._rainCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 2 * 3);
    const velocities = new Float32Array(count); // Per-drop fall speed variation

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * this._rainArea;
      const y = Math.random() * this._rainHeight;
      const z = (Math.random() - 0.5) * this._rainArea;
      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x - 0.18;
      positions[idx + 4] = y - this._rainLength;
      positions[idx + 5] = z + 0.08;
      velocities[i] = this._rainSpeed * (0.7 + Math.random() * 0.6);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData = { velocities };

    const mat = new THREE.LineBasicMaterial({
      color: 0x9fb5d0,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });

    this._rainSystem = new THREE.LineSegments(geo, mat);
    this._rainSystem.name = 'rain-system';
    this._rainSystem.frustumCulled = false;
    this.scene.add(this._rainSystem);
  }

  _stopRain() {
    if (this._rainSystem) {
      this.scene.remove(this._rainSystem);
      this._rainSystem.geometry.dispose();
      this._rainSystem.material.dispose();
      this._rainSystem = null;
    }
  }

  _startSnow() {
    if (this._snowSystem) return;

    const count = this._snowCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const drift = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this._rainArea;
      positions[i * 3 + 1] = Math.random() * this._rainHeight;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this._rainArea;
      velocities[i] = this._snowSpeed * (0.55 + Math.random() * 0.9);
      drift[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData = { velocities, drift };

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      map: this._getSnowTexture(),
      size: 0.18,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      alphaTest: 0.04,
      sizeAttenuation: true,
    });

    this._snowSystem = new THREE.Points(geo, mat);
    this._snowSystem.name = 'snow-system';
    this._snowSystem.frustumCulled = false;
    this.scene.add(this._snowSystem);
  }

  _stopSnow() {
    if (this._snowSystem) {
      this.scene.remove(this._snowSystem);
      this._snowSystem.geometry.dispose();
      this._snowSystem.material.dispose();
      this._snowSystem = null;
    }
  }

  // ==================== Wet Road Overlay ====================

  _showWetRoad(color = 0x334455, opacity = 0.35) {
    if (this._wetOverlay) {
      this._wetOverlay.material.color.set(color);
      this._wetOverlayOpacity = opacity;
      return;
    }

    const overlayGeo = new THREE.PlaneGeometry(300, 300);
    const overlayMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });

    this._wetOverlay = new THREE.Mesh(overlayGeo, overlayMat);
    this._wetOverlay.rotation.x = -Math.PI / 2;
    this._wetOverlay.position.y = 0.25;
    this._wetOverlay.name = 'wet-road-overlay';
    this._wetOverlay.renderOrder = 1;
    this._wetOverlay.material.depthTest = false;
    this.scene.add(this._wetOverlay);

    this._wetOverlayOpacity = opacity;
  }

  _hideWetRoad() {
    if (this._wetOverlay) {
      this.scene.remove(this._wetOverlay);
      this._wetOverlay.geometry.dispose();
      this._wetOverlay.material.dispose();
      this._wetOverlay = null;
    }
    this._wetOverlayOpacity = 0;
  }

  // ==================== Fog ====================

  /**
   * Override base fog density (used when weather is clear).
   */
  setBaseFogDensity(density) {
    this._baseFogDensity = density;
    if (this.weather === 'clear') {
      this._targetFogDensity = density;
    }
  }

  /**
   * Set rain fog density.
   */
  setRainFogDensity(density) {
    this._rainFogDensity = density;
    if (this.weather === 'rain') {
      this._targetFogDensity = density;
    }
  }

  // ==================== Update ====================

  /**
   * Update per frame.
   * @param {number} delta
   * @param {{x:number, y:number, z:number}} [cameraPos] - Camera position for rain follow
   */
  update(delta, cameraPos) {
    // Rain animation
    if (this._rainSystem) {
      const pos = this._rainSystem.geometry.attributes.position.array;
      const vels = this._rainSystem.geometry.userData.velocities;
      const area = this._rainArea;
      const height = this._rainHeight;

      for (let vi = 0; vi < vels.length; vi++) {
        const i = vi * 6;
        pos[i + 1] -= vels[vi] * delta;
        pos[i + 4] -= vels[vi] * delta;

        if (pos[i + 4] < -1) {
          const x = (Math.random() - 0.5) * area;
          const y = height;
          const z = (Math.random() - 0.5) * area;
          pos[i] = x;
          pos[i + 1] = y;
          pos[i + 2] = z;
          pos[i + 3] = x - 0.18;
          pos[i + 4] = y - this._rainLength;
          pos[i + 5] = z + 0.08;
          vels[vi] = this._rainSpeed * (0.7 + Math.random() * 0.6);
        }
      }

      // Follow camera
      if (cameraPos) {
        this._rainSystem.position.x = cameraPos.x;
        this._rainSystem.position.z = cameraPos.z;
      }

      this._rainSystem.geometry.attributes.position.needsUpdate = true;
    }

    if (this._snowSystem) {
      const pos = this._snowSystem.geometry.attributes.position.array;
      const vels = this._snowSystem.geometry.userData.velocities;
      const drift = this._snowSystem.geometry.userData.drift;
      const area = this._rainArea;
      const height = this._rainHeight;

      for (let i = 0; i < pos.length; i += 3) {
        const vi = i / 3;
        drift[vi] += delta * 1.1;
        pos[i] += Math.sin(drift[vi]) * delta * 0.7;
        pos[i + 1] -= vels[vi] * delta;
        pos[i + 2] += Math.cos(drift[vi] * 0.7) * delta * 0.45;

        if (pos[i + 1] < -1) {
          pos[i + 1] = height;
          pos[i] = (Math.random() - 0.5) * area;
          pos[i + 2] = (Math.random() - 0.5) * area;
        }
      }

      if (cameraPos) {
        this._snowSystem.position.x = cameraPos.x;
        this._snowSystem.position.z = cameraPos.z;
      }
      this._snowSystem.geometry.attributes.position.needsUpdate = true;
    }

    // Wet overlay opacity lerp
    if (this._wetOverlay) {
      const current = this._wetOverlay.material.opacity;
      const target = this._wetOverlayOpacity;
      if (Math.abs(current - target) > 0.001) {
        this._wetOverlay.material.opacity += (target - current) * Math.min(delta * 3, 1);
      }
      // Follow camera
      if (cameraPos) {
        this._wetOverlay.position.x = cameraPos.x;
        this._wetOverlay.position.z = cameraPos.z;
      }
    }

    // Fog transition
    if (this.scene.fog) {
      const current = this.scene.fog.density || this._baseFogDensity;
      const target = this._targetFogDensity;
      if (Math.abs(current - target) > 0.00005) {
        this.scene.fog.density = current + (target - current) * Math.min(delta * 2, 1);
      }
    }
  }

  // ==================== Cleanup ====================

  dispose() {
    this._stopRain();
    this._stopSnow();
    this._hideWetRoad();
    this._snowTexture?.dispose?.();
    this._snowTexture = null;
    this.onFrictionChange = null;
  }

  _getSnowTexture() {
    if (this._snowTexture) return this._snowTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.78)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    this._snowTexture = new THREE.CanvasTexture(canvas);
    this._snowTexture.colorSpace = THREE.SRGBColorSpace;
    return this._snowTexture;
  }
}
