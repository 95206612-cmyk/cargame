import * as THREE from 'three';

/**
 * Vehicle lighting system.
 * - Headlights: two PointLight sources that illuminate the road ahead
 * - Taillights: emissive material intensity control (brake = 2x brightness)
 * - Turn signals: blinking interface (reserved for future upgrades)
 *
 * Integrates with LightManager for night auto-activation.
 */
export class CarLight {
  constructor(scene) {
    this.scene = scene;
    this._ready = false;

    // Headlight point lights
    this._headlightLeft = null;
    this._headlightRight = null;
    this._headlightsOn = false;

    // Taillight emissive materials
    this._taillightMeshes = [];
    this._taillightBaseIntensity = 0.4;
    this._brakeIntensityMultiplier = 2.5;

    // Turn signal state
    this._turnSignal = 'off'; // 'off' | 'left' | 'right' | 'hazard'
    this._blinkTimer = 0;
    this._blinkOn = false;

    // Simple light cone meshes (low-poly cones for visual flair)
    this._lightCones = [];

    // Whether environmental conditions require headlights
    this._envRequiresHeadlights = false;
  }

  /**
   * Initialize headlights on a car body group.
   * Call after the car model is built and added to scene.
   * @param {THREE.Group} carRoot - The car's root group
   * @param {Object} [options]
   * @param {number} [options.headlightColor=0xffffcc] - Color of headlights
   * @param {number} [options.headlightIntensity=15] - Point light intensity
   * @param {number} [options.headlightDistance=30] - Point light distance
   */
  init(carRoot, options = {}) {
    const {
      headlightColor = 0xffffcc,
      headlightIntensity = 15,
      headlightDistance = 30,
    } = options;

    // Find headlight meshes in the car body
    const headlightPositions = [];
    const taillightMeshes = [];

    carRoot.traverse((child) => {
      if (!child.isMesh) return;
      const name = (child.name || '').toLowerCase();

      if (name === 'headlight') {
        const pos = new THREE.Vector3();
        child.getWorldPosition(pos);
        headlightPositions.push(pos);
      } else if (name === 'taillight') {
        taillightMeshes.push(child);
      }
    });

    // Create headlight point lights
    if (headlightPositions.length >= 2) {
      // Sort left/right by x position
      headlightPositions.sort((a, b) => a.x - b.x);

      this._headlightLeft = new THREE.PointLight(headlightColor, 0, headlightDistance);
      this._headlightLeft.position.copy(headlightPositions[0]);
      this._headlightLeft.position.y += 0.1;
      carRoot.add(this._headlightLeft);

      this._headlightRight = new THREE.PointLight(headlightColor, 0, headlightDistance);
      this._headlightRight.position.copy(headlightPositions[headlightPositions.length - 1]);
      this._headlightRight.position.y += 0.1;
      carRoot.add(this._headlightRight);
    }

    // Store taillight meshes for brake light control
    this._taillightMeshes = taillightMeshes;
    for (const mesh of taillightMeshes) {
      if (mesh.material && mesh.material.emissiveIntensity !== undefined) {
        mesh.material.emissiveIntensity = this._taillightBaseIntensity;
      }
    }

    this._ready = true;
  }

  /**
   * Set headlights on/off.
   */
  setHeadlights(on) {
    this._headlightsOn = on;
    this._updateHeadlightIntensity();
  }

  /**
   * Toggle headlights.
   */
  toggleHeadlights() {
    this.setHeadlights(!this._headlightsOn);
  }

  /**
   * Signal that environment requires headlights (night mode).
   */
  setEnvRequiresHeadlights(required) {
    this._envRequiresHeadlights = required;
    if (!this._headlightsOn && required) {
      this.setHeadlights(true);
    }
  }

  /**
   * Update brake light state.
   * @param {boolean} braking - Whether brakes are applied
   */
  setBraking(braking) {
    if (!this._ready) return;
    const intensity = braking
      ? this._taillightBaseIntensity * this._brakeIntensityMultiplier
      : this._taillightBaseIntensity;

    for (const mesh of this._taillightMeshes) {
      if (mesh.material && mesh.material.emissiveIntensity !== undefined) {
        mesh.material.emissiveIntensity +=
          (intensity - mesh.material.emissiveIntensity) * 0.3;
      }
    }
  }

  /**
   * Set turn signal state.
   * @param {'off'|'left'|'right'|'hazard'} direction
   */
  setTurnSignal(direction) {
    this._turnSignal = direction;
    this._blinkTimer = 0;
    this._blinkOn = false;
  }

  // ==================== Frame Update ====================

  /**
   * Update per frame. Handles turn signal blinking.
   */
  update(delta) {
    if (!this._ready) return;

    // Turn signal blink
    if (this._turnSignal !== 'off') {
      this._blinkTimer += delta;
      if (this._blinkTimer >= 0.4) {
        this._blinkTimer = 0;
        this._blinkOn = !this._blinkOn;

        // Find turn signal meshes (amber lights on corners)
        // For now, just toggle — future: actual mesh targeting
      }
    }

    // Update headlight intensity based on state
    this._updateHeadlightIntensity();
  }

  _updateHeadlightIntensity() {
    const targetIntensity = this._headlightsOn ? 15 : 0;
    const lerp = 0.15;

    if (this._headlightLeft) {
      this._headlightLeft.intensity +=
        (targetIntensity - this._headlightLeft.intensity) * lerp;
    }
    if (this._headlightRight) {
      this._headlightRight.intensity +=
        (targetIntensity - this._headlightRight.intensity) * lerp;
    }
  }

  // ==================== Accessors ====================

  get headlightsOn() {
    return this._headlightsOn;
  }

  get isReady() {
    return this._ready;
  }

  // ==================== Cleanup ====================

  dispose() {
    if (this._headlightLeft) {
      this._headlightLeft.parent?.remove(this._headlightLeft);
      this._headlightLeft.dispose();
      this._headlightLeft = null;
    }
    if (this._headlightRight) {
      this._headlightRight.parent?.remove(this._headlightRight);
      this._headlightRight.dispose();
      this._headlightRight = null;
    }
    this._taillightMeshes = [];
    this._ready = false;
  }
}
