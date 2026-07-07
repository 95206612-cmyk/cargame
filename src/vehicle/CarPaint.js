import * as THREE from 'three';

/**
 * Car paint and livery customization.
 * - Solid/metallic/pearl paint with RGB color picker
 * - Decal sticker system with position/scale/rotation
 * - Up to 5 paint preset slots saved per car
 */
export class CarPaint {
  constructor(saveManager) {
    this._save = saveManager;
    this._currentCarId = null;

    // Current paint state
    this.color = new THREE.Color(0xe74c3c);
    this.metallic = 0.6;
    this.roughness = 0.3;
    this.pearlEnabled = false;
    this.pearlColor = new THREE.Color(0xffffff);

    // Decals
    this.decals = []; // { id, texture, position, scale, rotation, opacity }

    // Body material references (set by applyToCar)
    this._bodyMaterials = [];
  }

  /**
   * Load saved paint presets for a car.
   * @param {string} carId
   */
  load(carId) {
    this._currentCarId = carId;
    const presets = this._save.saveData?.carPaints || {};
    const saved = normalizePaintSave(presets[carId]);

    if (saved?.current) {
      this._applyState(saved.current);
    } else {
      // Default from car config
      this.resetToDefault(carId);
    }

    return this.getState();
  }

  _applyState(state) {
    this.color = new THREE.Color(state.color || '#e74c3c');
    this.metallic = state.metallic ?? 0.6;
    this.roughness = state.roughness ?? 0.3;
    this.pearlEnabled = state.pearlEnabled || false;
    this.pearlColor = new THREE.Color(state.pearlColor || '#ffffff');
    this.decals = (state.decals || []).map(d => ({
        ...d,
        texture: null, // Can't serialize textures; will need reload
      }));
  }

  /**
   * Reset to car's default paint.
   */
  resetToDefault(carId) {
    this._currentCarId = carId;
    this.color = new THREE.Color(0xe74c3c);
    this.metallic = 0.6;
    this.roughness = 0.3;
    this.pearlEnabled = false;
    this.pearlColor = new THREE.Color(0xffffff);
    this.decals = [];
  }

  /**
   * Save current paint to a preset slot (0-4).
   */
  savePreset(slot) {
    if (slot < 0 || slot > 4) return false;
    if (!this._save.saveData) return false;
    if (!this._save.saveData.carPaints) this._save.saveData.carPaints = {};
    const entry = normalizePaintSave(this._save.saveData.carPaints[this._currentCarId]) || { current: null, presets: {} };
    entry.current = this.getState();
    entry.presets[slot] = this.getState();
    this._save.saveData.carPaints[this._currentCarId] = entry;

    this._save.save();
    return true;
  }

  saveCurrent() {
    if (!this._save.saveData || !this._currentCarId) return false;
    if (!this._save.saveData.carPaints) this._save.saveData.carPaints = {};
    const entry = normalizePaintSave(this._save.saveData.carPaints[this._currentCarId]) || { current: null, presets: {} };
    entry.current = this.getState();
    this._save.saveData.carPaints[this._currentCarId] = entry;
    this._save.save();
    return true;
  }

  /**
   * Load a saved paint preset.
   */
  loadPreset(slot) {
    const entry = normalizePaintSave(this._save.saveData?.carPaints?.[this._currentCarId]);
    const preset = entry?.presets?.[slot];
    if (!preset) return false;

    this._applyState(preset);
    this._applyToBodyMaterials();
    this.saveCurrent();
    return true;
  }

  /**
   * Get all saved presets for the current car.
   */
  getPresets() {
    const entry = normalizePaintSave(this._save.saveData?.carPaints?.[this._currentCarId]);
    const presets = entry?.presets || {};
    const result = [];
    for (let i = 0; i < 5; i++) {
      result.push(presets[i] ? { slot: i, ...presets[i] } : null);
    }
    return result;
  }

  /**
   * Get current paint state for serialization.
   */
  getState() {
    return {
      color: '#' + this.color.getHexString(),
      metallic: this.metallic,
      roughness: this.roughness,
      pearlEnabled: this.pearlEnabled,
      pearlColor: '#' + this.pearlColor.getHexString(),
      decals: this.decals.map(d => ({
        id: d.id,
        position: { x: d.position?.x || 0, y: d.position?.y || 0 },
        scale: d.scale || 1,
        rotation: d.rotation || 0,
        opacity: d.opacity ?? 1,
      })),
    };
  }

  /**
   * Set body color from hex string or Color.
   */
  setColor(hexOrColor) {
    if (typeof hexOrColor === 'string') {
      this.color.set(hexOrColor);
    } else {
      this.color.copy(hexOrColor);
    }
    this._applyToBodyMaterials();
  }

  /**
   * Set metallic level (0-1).
   */
  setMetallic(value) {
    this.metallic = Math.max(0, Math.min(1, value));
    this._applyToBodyMaterials();
  }

  /**
   * Set roughness level (0-1).
   */
  setRoughness(value) {
    this.roughness = Math.max(0, Math.min(1, value));
    this._applyToBodyMaterials();
  }

  /**
   * Enable/disable pearl effect.
   */
  setPearlEnabled(enabled) {
    this.pearlEnabled = enabled;
    this._applyToBodyMaterials();
  }

  /**
   * Set pearl color.
   */
  setPearlColor(hexOrColor) {
    if (typeof hexOrColor === 'string') {
      this.pearlColor.set(hexOrColor);
    } else {
      this.pearlColor.copy(hexOrColor);
    }
    this._applyToBodyMaterials();
  }

  /**
   * Add a decal sticker.
   * @param {Object} decal — { id, texture?, position: {x,y}, scale, rotation, opacity }
   */
  addDecal(decal) {
    this.decals.push({
      id: decal.id || `decal_${Date.now()}`,
      texture: decal.texture || null,
      position: decal.position || { x: 0, y: 0 },
      scale: decal.scale || 1,
      rotation: decal.rotation || 0,
      opacity: decal.opacity ?? 1,
    });
    this._applyDecals();
  }

  /**
   * Remove a decal by ID.
   */
  removeDecal(id) {
    this.decals = this.decals.filter(d => d.id !== id);
    this._applyDecals();
  }

  /**
   * Clear all decals.
   */
  clearDecals() {
    this.decals = [];
    this._applyDecals();
  }

  /**
   * Set decal properties.
   */
  setDecalProps(id, props) {
    const decal = this.decals.find(d => d.id === id);
    if (!decal) return;
    if (props.position) decal.position = { ...decal.position, ...props.position };
    if (props.scale !== undefined) decal.scale = props.scale;
    if (props.rotation !== undefined) decal.rotation = props.rotation;
    if (props.opacity !== undefined) decal.opacity = props.opacity;
    this._applyDecals();
  }

  /**
   * Apply current paint to a car model's body materials.
   * @param {THREE.Group} carRoot - The car root group
   */
  applyToCar(carRoot) {
    if (!carRoot) return;

    this._bodyMaterials = [];

    carRoot.traverse((child) => {
      if (!child.isMesh) return;
      const name = (child.name || '').toLowerCase();

      // Apply to body/chassis/cabin parts
      if (/chassis|body|cabin|bumper|spoiler|mirror/i.test(name) &&
          !/headlight|taillight|windshield|window/i.test(name)) {
        if (child.material && !child.material.isMeshPhysicalMaterial) {
          // Convert to MeshPhysicalMaterial for pearl support
          const oldMat = child.material;
          child.material = new THREE.MeshPhysicalMaterial({
            color: this.color,
            metalness: this.metallic,
            roughness: this.roughness,
            clearcoat: this.pearlEnabled ? 0.3 : 0,
            clearcoatRoughness: 0.2,
          });
          child.material.name = oldMat.name;
          if (oldMat.map) child.material.map = oldMat.map;
          oldMat.dispose();
        }
        if (child.material.color) {
          this._bodyMaterials.push(child.material);
        }
      }
    });

    this._applyToBodyMaterials();
  }

  _applyToBodyMaterials() {
    for (const mat of this._bodyMaterials) {
      if (!mat) continue;
      mat.color.copy(this.color);
      mat.metalness = this.metallic;
      mat.roughness = this.roughness;

      // Pearl via clearcoat on MeshPhysicalMaterial
      if (mat.clearcoat !== undefined) {
        mat.clearcoat = this.pearlEnabled ? 0.3 : 0;
        if (this.pearlEnabled) {
          mat.clearcoatRoughness = 0.15;
        }
      }
    }
  }

  _applyDecals() {
    // Decal implementation: positions are stored as UV offsets for a future shader-based system
    // Full decal rendering would require multi-material or projected textures
    // For now, store the data and log
    if (this.decals.length > 0) {
      console.log(`[CarPaint] ${this.decals.length} decals configured (GPU decal rendering: future phase)`);
    }
  }
}

function normalizePaintSave(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.current || entry.presets) {
    return {
      current: entry.current || null,
      presets: entry.presets || {},
    };
  }

  // Legacy support: older builds stored either the current paint state directly
  // or a raw slot map under carPaints[carId].
  if (entry.color) {
    return { current: entry, presets: {} };
  }

  const presets = {};
  for (const key of Object.keys(entry)) {
    if (/^[0-4]$/.test(key) && entry[key]?.color) presets[key] = entry[key];
  }
  return { current: presets[0] || null, presets };
}
