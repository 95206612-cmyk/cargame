import * as THREE from 'three';

/**
 * Centralized PBR material factory.
 * All material creation goes through this class so quality presets,
 * livery swaps, and paint modifications can be applied uniformly.
 */
export class MaterialFactory {
  constructor() {
    this.quality = 'high';
    this._anisotropy = 4;
  }

  // ==================== Quality ====================

  setQuality(preset) {
    this.quality = preset;
    switch (preset) {
      case 'low':
        this._anisotropy = 1;
        break;
      case 'medium':
        this._anisotropy = 2;
        break;
      case 'high':
      case 'ultra':
      default:
        this._anisotropy = 4;
        break;
    }
  }

  setAnisotropy(value) {
    this._anisotropy = value;
  }

  // ==================== Standard PBR ====================

  /**
   * Create a standard PBR material from parameterized config.
   * @param {Object} cfg
   * @param {string|number} cfg.color - Base color (hex or CSS string)
   * @param {number} [cfg.metalness=0.5]
   * @param {number} [cfg.roughness=0.4]
   * @param {THREE.Texture} [cfg.map] - Albedo/basecolor texture
   * @param {THREE.Texture} [cfg.normalMap] - Normal map
   * @param {THREE.Texture} [cfg.metalnessMap] - Metallic map (R channel)
   * @param {THREE.Texture} [cfg.roughnessMap] - Roughness map (R channel)
   * @param {THREE.Texture} [cfg.aoMap] - Ambient occlusion map
   * @param {THREE.Texture} [cfg.emissiveMap] - Emission map
   * @param {string|number} [cfg.emissive] - Emissive color
   * @param {number} [cfg.emissiveIntensity=0]
   * @param {boolean} [cfg.transparent=false]
   * @param {number} [cfg.opacity=1]
   * @returns {THREE.MeshStandardMaterial}
   */
  createPBR(cfg = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.color || 0xffffff),
      metalness: cfg.metalness ?? 0.5,
      roughness: cfg.roughness ?? 0.4,
      transparent: cfg.transparent || false,
      opacity: cfg.opacity ?? 1,
    });

    if (cfg.map) {
      mat.map = cfg.map;
      mat.map.colorSpace = THREE.SRGBColorSpace;
    }
    if (cfg.normalMap) {
      mat.normalMap = cfg.normalMap;
      mat.normalMap.wrapS = THREE.RepeatWrapping;
      mat.normalMap.wrapT = THREE.RepeatWrapping;
    }
    if (cfg.metalnessMap) mat.metalnessMap = cfg.metalnessMap;
    if (cfg.roughnessMap) mat.roughnessMap = cfg.roughnessMap;
    if (cfg.aoMap) mat.aoMap = cfg.aoMap;
    if (cfg.emissiveMap) {
      mat.emissiveMap = cfg.emissiveMap;
      mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    }
    if (cfg.emissive) {
      mat.emissive = new THREE.Color(cfg.emissive);
      mat.emissiveIntensity = cfg.emissiveIntensity ?? 1;
    }

    // Apply anisotropy to all texture maps
    _setAnisotropy(mat, this._anisotropy);

    return mat;
  }

  /**
   * Create a car body material from a livery texture set.
   * @param {Object} textures - { basecolor, normal, metallic, roughness, ao? }
   * @param {Object} [overrides] - Optional color/metallic/roughness overrides
   */
  createCarBodyMaterial(textures, overrides = {}) {
    return this.createPBR({
      map: textures.basecolor || null,
      normalMap: textures.normal || null,
      metalnessMap: textures.metallic || null,
      roughnessMap: textures.roughness || null,
      aoMap: textures.ao || null,
      color: overrides.color || 0xffffff,
      metalness: overrides.metalness ?? 0.6,
      roughness: overrides.roughness ?? 0.3,
    });
  }

  /**
   * Create a chrome/metallic trim material.
   * @param {Object} [overrides]
   */
  createTrimMaterial(overrides = {}) {
    return this.createPBR({
      color: overrides.color || 0xcccccc,
      metalness: overrides.metalness ?? 1.0,
      roughness: overrides.roughness ?? 0.15,
    });
  }

  /**
   * Create a glass/cockpit material.
   * @param {Object} [overrides]
   */
  createGlassMaterial(overrides = {}) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(overrides.color || 0x8899cc),
      metalness: 0.05,
      roughness: 0.05,
      transparent: true,
      opacity: overrides.opacity ?? 0.4,
      clearcoat: 0.2,
      envMapIntensity: 0.5,
    });
  }

  /**
   * Create a tire rubber material.
   */
  createTireMaterial() {
    return this.createPBR({
      color: 0x1a1a1a,
      metalness: 0,
      roughness: 0.85,
    });
  }

  // ==================== Car Paint Modification ====================

  /**
   * Dynamically modify car body color at runtime.
   * Target specific material(s) on a mesh by name or index.
   * @param {THREE.Mesh|THREE.Group} target - The car mesh
   * @param {Object} overrides - { color?, metalness?, roughness? }
   * @param {string} [materialName] - Optional: only modify material matching this name
   */
  setCarPaint(target, overrides, materialName) {
    target.traverse((child) => {
      if (!child.isMesh) return;
      if (materialName && child.material.name !== materialName) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (overrides.color !== undefined) {
          mat.color.set(overrides.color);
        }
        if (overrides.metalness !== undefined) {
          mat.metalness = overrides.metalness;
        }
        if (overrides.roughness !== undefined) {
          mat.roughness = overrides.roughness;
        }
        mat.needsUpdate = true;
      }
    });
  }

  /**
   * Replace textures on a car mesh at runtime (livery swap).
   * @param {THREE.Mesh|THREE.Group} target - The car mesh
   * @param {Object} textureSet - { basecolor?, normal?, metallic?, roughness?, ao? }
   * @param {string} [materialName] - Optional: only modify material matching this name
   */
  applyLivery(target, textureSet, materialName) {
    const mapMapping = {
      basecolor: 'map',
      normal: 'normalMap',
      metallic: 'metalnessMap',
      roughness: 'roughnessMap',
      ao: 'aoMap',
    };

    target.traverse((child) => {
      if (!child.isMesh) return;
      if (materialName && child.material.name !== materialName) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        for (const [texKey, matKey] of Object.entries(mapMapping)) {
          if (textureSet[texKey]) {
            // Dispose old texture if it was dynamically set
            if (mat[matKey] && mat[matKey] !== textureSet[texKey]) {
              // Only dispose if we own it (not from shared cache)
            }
            mat[matKey] = textureSet[texKey];
            if (matKey === 'map' && textureSet[texKey]) {
              mat[matKey].colorSpace = THREE.SRGBColorSpace;
            }
          }
        }
        mat.needsUpdate = true;
      }
    });
  }

  /**
   * Get the current body color from a car mesh.
   * Returns the color of the first MeshStandardMaterial found on the body.
   * @param {THREE.Mesh|THREE.Group} target
   * @returns {THREE.Color|null}
   */
  getCarColor(target) {
    let result = null;
    target.traverse((child) => {
      if (result) return;
      if (!child.isMesh) return;
      const mat = Array.isArray(child.material) ? child.material[0] : child.material;
      if (mat && mat.isMeshStandardMaterial) {
        result = mat.color.clone();
      }
    });
    return result;
  }

  // ==================== Track / Environment ====================

  /**
   * Create a tiling track surface material.
   * @param {Object} textures - { basecolor, normal, roughness }
   * @param {number} repeatU - Texture repeat in U direction
   * @param {number} repeatV - Texture repeat in V direction
   */
  createTrackSurface(textures, repeatU = 4, repeatV = 4) {
    const mat = this.createPBR({
      map: textures.basecolor || null,
      normalMap: textures.normal || null,
      roughnessMap: textures.roughness || null,
      roughness: 0.7,
      metalness: 0,
    });

    // Apply tiling
    const repeatMaps = ['map', 'normalMap', 'roughnessMap', 'aoMap'];
    for (const key of repeatMaps) {
      if (mat[key]) {
        mat[key].wrapS = THREE.RepeatWrapping;
        mat[key].wrapT = THREE.RepeatWrapping;
        mat[key].repeat.set(repeatU, repeatV);
      }
    }

    return mat;
  }
}

// ==================== Internal Helpers ====================

function _setAnisotropy(material, value) {
  if (value <= 1) return;
  const maps = [
    material.map, material.normalMap, material.metalnessMap,
    material.roughnessMap, material.aoMap, material.emissiveMap,
  ];
  for (const map of maps) {
    if (map && map.anisotropy !== undefined) {
      map.anisotropy = value;
    }
  }
}
