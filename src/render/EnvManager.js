import * as THREE from 'three';

/**
 * Environment manager.
 * Loads skybox cubemaps from asset-path.json and provides day/night
 * skybox switching integrated with LightManager presets.
 *
 * Usage:
 *   const env = new EnvManager(assetLoader, renderer.scene, renderer.renderer);
 *   await env.setSkybox('day-clear');
 *   await env.setSkybox('sunset'); // smooth transition
 */
export class EnvManager {
  constructor(assetLoader, scene, renderer) {
    this._loader = assetLoader;
    this.scene = scene;
    this._renderer = renderer;

    this.currentSkyboxId = null;
    this._skyboxTextures = new Map(); // skyboxId -> { px, nx, py, ny, pz, nz }

    // Scene environment
    this.scene.environment = null;
    this.scene.background = new THREE.Color(0x87ceeb);

    // PMREMGenerator for IBL (shared, expensive to create)
    try {
      this._pmremGenerator = new THREE.PMREMGenerator(this._renderer);
      this._pmremGenerator.compileCubemapShader();
    } catch (err) {
      console.warn('[EnvManager] PMREMGenerator failed, IBL disabled:', err.message);
      this._pmremGenerator = null;
    }

    // Environment state
    this.envPreset = 'day';      // 'day' | 'dusk' | 'night'
    this._lightManager = null;   // Reference to LightManager for sync

    // Streetlights (night-only point lights placed along track)
    this._streetLights = [];
    this._streetLightsOn = false;

    // Callbacks
    this.onEnvChange = null;     // Called with { preset, streetLightsOn, headlightsNeeded }
  }

  /**
   * Set the active skybox by preset ID.
   * @param {string} skyboxId - matches config/asset-path.json textures.skyboxes keys
   * @returns {Promise<void>}
   */
  async setSkybox(skyboxId) {
    if (skyboxId === this.currentSkyboxId) return;

    const paths = await this._loadAssetPaths();
    const facePaths = paths?.textures?.skyboxes?.[skyboxId];
    if (!facePaths) {
      console.warn(`[EnvManager] Unknown skybox: "${skyboxId}"`);
      return;
    }

    // Load cubemap faces (use cache if previously loaded)
    let cubeTexture;
    if (this._skyboxTextures.has(skyboxId)) {
      cubeTexture = this._skyboxTextures.get(skyboxId);
    } else {
      cubeTexture = await this._loadCubeMap(facePaths);
      this._skyboxTextures.set(skyboxId, cubeTexture);
    }

    // Apply as scene background and environment
    this.scene.background = cubeTexture;
    this.scene.environment = cubeTexture;
    this.currentSkyboxId = skyboxId;
  }

  /**
   * Set background to a solid color (removes skybox).
   */
  setBackgroundColor(color) {
    this.scene.background = new THREE.Color(color);
    this.scene.environment = null;
    this.currentSkyboxId = null;
  }

  /**
   * Set environment intensity (IBL contribution).
   * @param {number} value - 0 to 1
   */
  setEnvironmentIntensity(value) {
    this.scene.environmentIntensity = value;
  }

  /**
   * Generate reflection probe from the current skybox.
   * Useful for car body reflections.
   */
  generatePMREM() {
    if (!this._pmremGenerator) return;
    if (this.scene.environment && this.scene.environment.isCubeTexture) {
      const rt = this._pmremGenerator.fromScene(this.scene, 0.04);
      if (this.scene.environment) {
        this.scene.environment.dispose();
      }
      this.scene.environment = rt.texture;
    }
  }

  // ==================== Environment Presets ====================

  /**
   * Set the LightManager reference for synced preset switching.
   */
  setLightManager(lightManager) {
    this._lightManager = lightManager;
  }

  /**
   * Switch environment preset (day/dusk/night).
   * Syncs LightManager, background, fog, and streetlights.
   * @param {'day'|'dusk'|'night'} preset
   * @param {Object} [config] - Optional config from env-presets.json
   */
  async setEnvPreset(preset, config) {
    if (!config) {
      config = await this._loadEnvPresets();
    }
    const cfg = config?.[preset];
    if (!cfg) {
      console.warn(`[EnvManager] Unknown env preset: "${preset}"`);
      return;
    }

    this.envPreset = preset;

    // Sync LightManager
    if (this._lightManager) {
      this._lightManager.setPreset(preset);
    }

    // Background color
    this.scene.background = new THREE.Color(cfg.background);

    // Fog
    if (cfg.fog) {
      if (!this.scene.fog) {
        this.scene.fog = new THREE.Fog(
          new THREE.Color(cfg.fog.color),
          cfg.fog.near,
          cfg.fog.far
        );
      } else {
        this.scene.fog.color = new THREE.Color(cfg.fog.color);
        this.scene.fog.near = cfg.fog.near;
        this.scene.fog.far = cfg.fog.far;
        this.scene.fog.density = 0.0003; // Reset density (used by weather)
      }
    }

    // Tone mapping exposure
    if (cfg.toneMappingExposure !== undefined && this._renderer) {
      this._renderer.toneMappingExposure = cfg.toneMappingExposure;
    }

    // Streetlights
    this._setStreetLights(cfg.streetLights);

    // Skybox
    if (cfg.skybox) {
      try {
        await this.setSkybox(cfg.skybox);
      } catch {
        // Skybox load failed, background color is fallback
      }
    }

    // Notify
    if (this.onEnvChange) {
      this.onEnvChange({
        preset,
        streetLightsOn: cfg.streetLights,
        headlightsNeeded: cfg.headlightsNeeded || false,
      });
    }
  }

  /**
   * Place streetlights along track center points (called after track build).
   * @param {Array<{x:number, y:number, z:number}>} roadPoints
   */
  placeStreetLights(roadPoints) {
    this._clearStreetLights();

    if (!roadPoints || roadPoints.length < 6) return;

    const spacing = Math.max(1, Math.floor(roadPoints.length / 20));

    for (let i = 0; i < roadPoints.length; i += spacing) {
      const pt = roadPoints[i];
      const next = roadPoints[(i + 1) % roadPoints.length];
      const dir = new THREE.Vector3().subVectors(next, pt).normalize();

      // Offset to sides of road
      for (const side of [-1, 1]) {
        const perpX = -dir.z * 7 * side;
        const perpZ = dir.x * 7 * side;

        const light = new THREE.PointLight(0xffdd99, 0, 25, 1);
        light.position.set(pt.x + perpX, pt.y + 6, pt.z + perpZ);
        light.castShadow = false;
        light.name = 'streetlight';
        this.scene.add(light);
        this._streetLights.push(light);
      }
    }
  }

  _setStreetLights(on) {
    this._streetLightsOn = on;
    const targetIntensity = on ? 3 : 0;
    for (const light of this._streetLights) {
      light.intensity = targetIntensity;
    }
  }

  _clearStreetLights() {
    for (const light of this._streetLights) {
      this.scene.remove(light);
      if (light.dispose) light.dispose();
    }
    this._streetLights = [];
  }

  /**
   * Get current env preset.
   */
  getEnvPreset() {
    return this.envPreset;
  }

  // ==================== Internal ====================

  async _loadCubeMap(facePaths) {
    const loader = new THREE.CubeTextureLoader();
    const urls = [
      facePaths.px, facePaths.nx,
      facePaths.py, facePaths.ny,
      facePaths.pz, facePaths.nz,
    ];

    return new Promise((resolve, reject) => {
      loader.load(
        urls,
        (cubeTexture) => {
          cubeTexture.colorSpace = THREE.SRGBColorSpace;
          resolve(cubeTexture);
        },
        undefined,
        () => reject(new Error('CubeMap load failed'))
      );
    });
  }

  async _loadAssetPaths() {
    const cached = this._loader.get('asset-paths');
    if (cached) return cached;

    try {
      const paths = await this._loader._loadJSON('./config/asset-path.json');
      this._loader.loaded.set('asset-paths', paths);
      return paths;
    } catch {
      return { textures: { skyboxes: {} } };
    }
  }

  async _loadEnvPresets() {
    const cached = this._loader.get('env-presets');
    if (cached) return cached;

    try {
      const config = await this._loader._loadJSON('./config/env-presets.json');
      this._loader.loaded.set('env-presets', config);
      return config;
    } catch {
      console.warn('[EnvManager] Could not load env-presets.json');
      return null;
    }
  }

  dispose() {
    this._clearStreetLights();
    for (const [id, tex] of this._skyboxTextures) {
      tex.dispose();
    }
    this._skyboxTextures.clear();
    if (this.scene.background && this.scene.background.isCubeTexture) {
      this.scene.background.dispose();
    }
    if (this.scene.environment && this.scene.environment.isTexture) {
      this.scene.environment.dispose();
    }
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.environment = null;
    if (this._pmremGenerator) this._pmremGenerator.dispose();
  }
}
