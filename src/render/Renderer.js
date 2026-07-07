import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const QUALITY_PRESETS = {
  ultra: {
    pixelRatio: 2,
    shadowMapSize: 4096,
    shadowRange: 170,
    anisotropy: 16,
    exposure: 1.08,
    environmentIntensity: 0.42,
    materialScanInterval: 45,
    shadowFrameInterval: 1,
    minPixelRatioScale: 0.78,
  },
  high: {
    pixelRatio: 1.5,
    shadowMapSize: 4096,
    shadowRange: 145,
    anisotropy: 12,
    exposure: 1.06,
    environmentIntensity: 0.36,
    materialScanInterval: 60,
    shadowFrameInterval: 2,
    minPixelRatioScale: 0.72,
  },
  medium: {
    pixelRatio: 1,
    shadowMapSize: 2048,
    shadowRange: 120,
    anisotropy: 8,
    exposure: 1.04,
    environmentIntensity: 0.3,
    materialScanInterval: 90,
    shadowFrameInterval: 3,
    minPixelRatioScale: 0.7,
  },
  low: {
    pixelRatio: 1,
    shadowMapSize: 1024,
    shadowRange: 95,
    anisotropy: 2,
    exposure: 1.0,
    environmentIntensity: 0.22,
    materialScanInterval: 120,
    shadowFrameInterval: 4,
    minPixelRatioScale: 0.65,
  },
};

const SHADOW_QUALITY = {
  off: { enabled: false, mapSize: 0, rangeScale: 1 },
  low: { enabled: true, mapSize: 1024, rangeScale: 0.8 },
  medium: { enabled: true, mapSize: 2048, rangeScale: 0.9 },
  high: { enabled: true, mapSize: 4096, rangeScale: 1 },
  ultra: { enabled: true, mapSize: 4096, rangeScale: 1.08 },
};

const TEXTURE_QUALITY = {
  low: { anisotropyScale: 0.25 },
  medium: { anisotropyScale: 0.5 },
  high: { anisotropyScale: 0.75 },
  ultra: { anisotropyScale: 1 },
};

const COLOR_MAPS = ['map', 'emissiveMap', 'sheenColorMap', 'iridescenceMap'];
const DATA_MAPS = [
  'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap',
  'alphaMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'transmissionMap', 'thicknessMap',
];

const PBR_DEFAULTS = {
  road: { metalness: 0.02, roughness: 0.74, envMapIntensity: 0.32 },
  terrain: { metalness: 0.0, roughness: 0.94, envMapIntensity: 0.18 },
  car: { metalness: 0.58, roughness: 0.28, envMapIntensity: 0.9 },
  glass: { metalness: 0.02, roughness: 0.04, envMapIntensity: 1.0 },
  metal: { metalness: 0.82, roughness: 0.3, envMapIntensity: 0.72 },
  emissive: { metalness: 0.0, roughness: 0.36, envMapIntensity: 0.44 },
  prop: { metalness: 0.08, roughness: 0.66, envMapIntensity: 0.36 },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = 'high';
    this._detectedPerformance = null;
    this._frame = 0;
    this._shadowMapSize = QUALITY_PRESETS.high.shadowMapSize;
    this._shadowQualityOverride = 'auto';
    this._textureQualityOverride = 'auto';
    this._textureQualityScale = 1;
    this._lodDistanceScale = 1;
    this._basePixelRatio = 1;
    this._dynamicPixelRatio = 1;
    this._pixelRatioCap = Infinity;
    this._pixelRatioPresetFloor = 0;
    this._minPixelRatioScaleOverride = null;
    this._adaptivePixelRatioEnabled = true;
    this._frameTimeEma = 16.7;
    this._lastFrameTimestamp = performance.now();
    this._adaptiveCooldown = 0;
    this._shadowUpdateCountdown = 0;
    this._shadowAnchorFrame = 0;
    this._maxAnisotropy = 1;
    this._materialCache = new WeakMap();
    this._preparedMeshes = new WeakSet();
    this._preparedLights = new WeakSet();
    this._scenePrepareRequested = true;
    this._shadowLightCache = [];
    this._shadowLightCacheDirty = true;
    this._shadowFollowTarget = null;
    this._tmpPosition = new THREE.Vector3();
    this._tmpOffset = new THREE.Vector3();
    this._tmpWorldPosition = new THREE.Vector3();
    this._pmremGenerator = null;
    this._environmentTarget = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfefff);
    this.scene.fog = new THREE.FogExp2(0xcfefff, 0.0018);

    this.renderer = this._createRenderer(canvas);
    this._configureRenderer();
    this._setupPBREnvironment();
    this._autoDetectPerformance();

    console.log('[Renderer] New PBR render engine active');
  }

  _createRenderer(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    return new THREE.WebGLRenderer({
      canvas,
      context: gl || undefined,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  }

  _configureRenderer() {
    this._basePixelRatio = this._resolveBasePixelRatio(QUALITY_PRESETS.high.pixelRatio);
    this._dynamicPixelRatio = this._basePixelRatio;
    this.renderer.setPixelRatio(this._dynamicPixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = QUALITY_PRESETS.high.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    if ('useLegacyLights' in this.renderer) this.renderer.useLegacyLights = false;
  }

  _setupPBREnvironment() {
    try {
      this._pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this._pmremGenerator.compileEquirectangularShader();
      const room = new RoomEnvironment();
      this._environmentTarget = this._pmremGenerator.fromScene(room, 0.04);
      room.dispose?.();
      this.scene.environment = this._environmentTarget.texture;
      this.scene.environmentIntensity = QUALITY_PRESETS.high.environmentIntensity;
    } catch (err) {
      console.warn('[Renderer] PBR environment disabled:', err.message);
    }
  }

  setQuality(preset) {
    const cfg = QUALITY_PRESETS[preset];
    if (!cfg) return;

    this.quality = preset;
    this._shadowMapSize = cfg.shadowMapSize;
    this._basePixelRatio = this._resolveBasePixelRatio(cfg.pixelRatio);
    this._dynamicPixelRatio = THREE.MathUtils.clamp(
      this._dynamicPixelRatio || this._basePixelRatio,
      this._basePixelRatio * this._getMinPixelRatioScale(cfg),
      this._basePixelRatio,
    );
    this.renderer.setPixelRatio(this._dynamicPixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = cfg.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this._maxAnisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy?.() || cfg.anisotropy, cfg.anisotropy);
    if (this._textureQualityOverride === 'auto') {
      this._textureQualityScale = TEXTURE_QUALITY[this.quality]?.anisotropyScale ?? 1;
    }
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = cfg.environmentIntensity;
    this._requestScenePrepare();
    this._applyShadowQualityToScene(this.scene);
  }

  setShadowQualityOverride(value = 'auto') {
    this._shadowQualityOverride = value || 'auto';
    this._applyShadowQualityToScene(this.scene);
  }

  setTextureQuality(value = 'auto') {
    this._textureQualityOverride = value || 'auto';
    const key = this._textureQualityOverride === 'auto' ? this.quality : this._textureQualityOverride;
    this._textureQualityScale = TEXTURE_QUALITY[key]?.anisotropyScale ?? 1;
    this._preparedMeshes = new WeakSet();
    this._materialCache = new WeakMap();
    this._requestScenePrepare();
  }

  setLodDistanceScale(value = 1) {
    const n = Number(value);
    this._lodDistanceScale = Number.isFinite(n) ? THREE.MathUtils.clamp(n, 0.5, 2.0) : 1;
  }

  setPixelRatioCap(value = Infinity) {
    this.setPixelRatioPolicy({ cap: value });
  }

  setPixelRatioPolicy({ cap = this._pixelRatioCap, presetFloor = this._pixelRatioPresetFloor, minScale = this._minPixelRatioScaleOverride } = {}) {
    const capValue = Number(cap);
    const floorValue = Number(presetFloor);
    const minScaleValue = Number(minScale);
    this._pixelRatioCap = Number.isFinite(capValue) && capValue > 0 ? capValue : Infinity;
    this._pixelRatioPresetFloor = Number.isFinite(floorValue) && floorValue > 0 ? floorValue : 0;
    this._minPixelRatioScaleOverride = Number.isFinite(minScaleValue) && minScaleValue > 0
      ? THREE.MathUtils.clamp(minScaleValue, 0.5, 1)
      : null;
    const cfg = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.high;
    this._basePixelRatio = this._resolveBasePixelRatio(cfg.pixelRatio);
    this._dynamicPixelRatio = THREE.MathUtils.clamp(
      Math.min(this._dynamicPixelRatio || this._basePixelRatio, this._basePixelRatio),
      this._basePixelRatio * this._getMinPixelRatioScale(cfg),
      this._basePixelRatio,
    );
    this.renderer.setPixelRatio(this._dynamicPixelRatio);
  }

  _resolveBasePixelRatio(presetMax = 1) {
    const presetTarget = Math.max(presetMax, this._pixelRatioPresetFloor);
    return Math.max(0.5, Math.min(window.devicePixelRatio || 1, presetTarget, this._pixelRatioCap));
  }

  _getMinPixelRatioScale(cfg) {
    return this._minPixelRatioScaleOverride ?? cfg.minPixelRatioScale ?? 0.7;
  }

  getShadowMapSize() {
    return this._shadowMapSize;
  }

  getQuality() {
    return this.quality;
  }

  setShadowFollowTarget(target) {
    this._shadowFollowTarget = target || null;
  }

  setRealtimeShadowsEnabled(enabled) {
    this.renderer.shadowMap.enabled = Boolean(enabled);
    this._applyShadowQualityToScene(this.scene);
  }

  _requestScenePrepare() {
    this._scenePrepareRequested = true;
    this._shadowLightCacheDirty = true;
  }

  setEnvironmentIntensity(value) {
    if ('environmentIntensity' in this.scene) {
      this.scene.environmentIntensity = Math.max(0, value);
    }
  }

  _autoDetectPerformance() {
    let score = 0;

    try {
      const gl = this.renderer.getContext();
      const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbgInfo) {
        const gpu = gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
        if (/rtx|nvidia|radeon|rx\s*[67-9]|arc\s*a\d/i.test(gpu)) score += 3;
        else if (/iris\s*xe|radeon\s*(graphics|vega|780m|680m)|apple\s*m\d/i.test(gpu)) score += 2;
        else score += 1;
      } else {
        score += 1;
      }
    } catch { score += 1; }

    if ((window.devicePixelRatio || 1) < 1.75) score += 2;
    else if ((window.devicePixelRatio || 1) < 2.5) score += 1;

    if (navigator.deviceMemory) {
      if (navigator.deviceMemory >= 8) score += 2;
      else if (navigator.deviceMemory >= 4) score += 1;
    }

    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isMobile) score += 1;

    this._detectedPerformance = 'low';

    this.setQuality(this._detectedPerformance);
    console.log(`[Renderer] PBR performance: score=${score}, preset=${this._detectedPerformance}`);
  }

  getDetectedPerformance() {
    return this._detectedPerformance;
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
  }

  render(scene = this.scene, camera) {
    this._frame += 1;
    this._updateAdaptivePixelRatio();
    if (this._frame === 1 || this._scenePrepareRequested) {
      this._prepareSceneForPBR(scene);
      this._scenePrepareRequested = false;
    }
    this._updateRealtimeShadows(scene, camera);
    this.renderer.render(scene, camera);
  }

  getContext() {
    return this.renderer.getContext();
  }

  getSize() {
    return this.renderer.getSize(new THREE.Vector2());
  }

  setAdaptivePixelRatioEnabled(enabled) {
    this._adaptivePixelRatioEnabled = Boolean(enabled);
    if (!enabled) {
      this._dynamicPixelRatio = this._basePixelRatio;
      this.renderer.setPixelRatio(this._dynamicPixelRatio);
    }
  }

  getPerformanceInfo() {
    return {
      quality: this.quality,
      basePixelRatio: this._basePixelRatio,
      dynamicPixelRatio: this._dynamicPixelRatio,
      pixelRatioCap: this._pixelRatioCap,
      pixelRatioPresetFloor: this._pixelRatioPresetFloor,
      minPixelRatioScaleOverride: this._minPixelRatioScaleOverride,
      frameTimeMs: this._frameTimeEma,
      shadowMapSize: this._shadowMapSize,
      shadowQuality: this._shadowQualityOverride,
      textureQuality: this._textureQualityOverride,
      textureQualityScale: this._textureQualityScale,
      lodDistanceScale: this._lodDistanceScale,
    };
  }

  _updateAdaptivePixelRatio() {
    const now = performance.now();
    const dt = Math.min(100, Math.max(0, now - this._lastFrameTimestamp));
    this._lastFrameTimestamp = now;
    if (dt <= 0) return;

    this._frameTimeEma += (dt - this._frameTimeEma) * 0.05;
    if (!this._adaptivePixelRatioEnabled || this._adaptiveCooldown > 0) {
      this._adaptiveCooldown = Math.max(0, this._adaptiveCooldown - 1);
      return;
    }

    const cfg = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.high;
    const minRatio = this._basePixelRatio * this._getMinPixelRatioScale(cfg);
    let nextRatio = this._dynamicPixelRatio;

    if (this._frameTimeEma > 24.5 && nextRatio > minRatio + 0.01) {
      nextRatio = Math.max(minRatio, nextRatio - 0.04);
      this._adaptiveCooldown = 150;
    } else if (this._frameTimeEma < 14.2 && nextRatio < this._basePixelRatio - 0.01) {
      nextRatio = Math.min(this._basePixelRatio, nextRatio + 0.02);
      this._adaptiveCooldown = 240;
    }

    if (Math.abs(nextRatio - this._dynamicPixelRatio) > 0.005) {
      this._dynamicPixelRatio = nextRatio;
      this.renderer.setPixelRatio(this._dynamicPixelRatio);
    }
  }

  _prepareSceneForPBR(scene) {
    scene.traverse((object) => {
      if (object.isLight) {
        this._prepareLight(object);
        return;
      }
      if (object.userData?.skipPBRPrepare) return;
      if (!object.isMesh) return;
      this._prepareMesh(object);
    });
    this._shadowLightCacheDirty = true;
  }

  _prepareMesh(mesh) {
    if (!this._preparedMeshes.has(mesh)) {
      const transparent = this._materialIsMostlyTransparent(mesh.material);
      if (!transparent) {
        mesh.castShadow = mesh.castShadow || this._shouldCastShadow(mesh);
        mesh.receiveShadow = mesh.receiveShadow || this._shouldReceiveShadow(mesh);
      }
      this._preparedMeshes.add(mesh);
    }

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => this._prepareMaterial(material, mesh));
    } else {
      mesh.material = this._prepareMaterial(mesh.material, mesh);
    }
  }

  _prepareMaterial(material, mesh) {
    if (!material) return material;
    const cached = this._materialCache.get(material);
    if (cached) {
      this._configureMaterialMaps(cached);
      return cached;
    }

    const role = this._inferMaterialRole(mesh, material);
    const prepared = this._upgradeMaterial(material, role);
    prepared.userData = prepared.userData || {};
    prepared.userData.pbrRole = prepared.userData.pbrRole || role;
    this._configurePBRMaterial(prepared, role);
    this._configureMaterialMaps(prepared);
    this._materialCache.set(material, prepared);
    return prepared;
  }

  _upgradeMaterial(material, role) {
    if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) return material;
    if (this._shouldKeepUnlit(material)) return material;

    const roughness = material.shininess !== undefined
      ? THREE.MathUtils.clamp(1 - material.shininess / 120, 0.18, 0.86)
      : PBR_DEFAULTS[role]?.roughness ?? 0.62;

    const pbr = role === 'glass'
      ? new THREE.MeshPhysicalMaterial({
          color: material.color?.clone?.() || new THREE.Color(0xffffff),
          map: material.map || null,
          alphaMap: material.alphaMap || null,
          emissive: material.emissive?.clone?.() || new THREE.Color(0x000000),
          emissiveMap: material.emissiveMap || null,
          emissiveIntensity: material.emissiveIntensity ?? 0,
          transparent: material.transparent || material.opacity < 1,
          opacity: material.opacity ?? 1,
          side: material.side,
          depthWrite: material.depthWrite,
          metalness: 0.02,
          roughness: 0.04,
          transmission: 0.2,
          clearcoat: 0.35,
          envMapIntensity: 1.0,
        })
      : new THREE.MeshStandardMaterial({
          color: material.color?.clone?.() || new THREE.Color(0xffffff),
          map: material.map || null,
          normalMap: material.normalMap || null,
          bumpMap: material.bumpMap || null,
          alphaMap: material.alphaMap || null,
          emissive: material.emissive?.clone?.() || new THREE.Color(0x000000),
          emissiveMap: material.emissiveMap || null,
          emissiveIntensity: material.emissiveIntensity ?? 0,
          transparent: material.transparent || material.opacity < 1,
          opacity: material.opacity ?? 1,
          side: material.side,
          depthWrite: material.depthWrite,
          vertexColors: material.vertexColors,
          metalness: PBR_DEFAULTS[role]?.metalness ?? 0.05,
          roughness,
          envMapIntensity: PBR_DEFAULTS[role]?.envMapIntensity ?? 0.4,
        });

    pbr.name = material.name || `${role}-pbr`;
    pbr.userData = { ...(material.userData || {}), pbrConvertedFrom: material.type };
    return pbr;
  }

  _configurePBRMaterial(material, role) {
    const defaults = PBR_DEFAULTS[role] || PBR_DEFAULTS.prop;
    let changed = false;

    if (material.map?.isTexture && material.color) {
      if (material.color.getHex() !== 0xffffff) {
        material.color.set(0xffffff);
        changed = true;
      }
    }
    if ('metalness' in material && !material.metalnessMap) {
      const next = this._chooseMaterialValue(material.metalness, defaults.metalness);
      if (material.metalness !== next) {
        material.metalness = next;
        changed = true;
      }
    }
    if ('roughness' in material && !material.roughnessMap) {
      const next = this._chooseMaterialValue(material.roughness, defaults.roughness);
      if (material.roughness !== next) {
        material.roughness = next;
        changed = true;
      }
    }
    if ('envMapIntensity' in material) {
      const next = Math.max(material.envMapIntensity || 0, defaults.envMapIntensity);
      if (material.envMapIntensity !== next) {
        material.envMapIntensity = next;
        changed = true;
      }
    }
    if (role === 'car' && material.isMeshPhysicalMaterial) {
      const nextClearcoat = Math.max(material.clearcoat || 0, 0.35);
      if (material.clearcoat !== nextClearcoat) {
        material.clearcoat = nextClearcoat;
        changed = true;
      }
      if (material.clearcoatRoughness === undefined || material.clearcoatRoughness === null) {
        material.clearcoatRoughness = 0.18;
        changed = true;
      }
    }
    if (material.normalMap && material.normalScale) {
      if (material.normalScale.x !== 0.85 || material.normalScale.y !== 0.85) {
        material.normalScale.setScalar(0.85);
        changed = true;
      }
    }
    if (changed) material.needsUpdate = true;
  }

  _configureMaterialMaps(material) {
    for (const key of COLOR_MAPS) {
      this._configureTexture(material[key], true);
    }
    for (const key of DATA_MAPS) {
      this._configureTexture(material[key], false);
    }
  }

  _configureTexture(texture, isColorMap) {
    if (!texture?.isTexture) return;

    let changed = false;
    const colorSpace = isColorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (texture.colorSpace !== colorSpace) {
      texture.colorSpace = colorSpace;
      changed = true;
    }
    const anisotropyLimit = Math.max(1, Math.round(this._maxAnisotropy * this._textureQualityScale));
    const anisotropy = Math.min(Math.max(texture.anisotropy || 1, 1), anisotropyLimit);
    if (texture.anisotropy !== anisotropy) {
      texture.anisotropy = anisotropy;
      changed = true;
    }
    if (texture.magFilter !== THREE.LinearFilter) {
      texture.magFilter = THREE.LinearFilter;
      changed = true;
    }
    const minFilter = texture.generateMipmaps === false
      ? THREE.LinearFilter
      : THREE.LinearMipmapLinearFilter;
    if (texture.minFilter !== minFilter) {
      texture.minFilter = minFilter;
      changed = true;
    }
    if (changed) texture.needsUpdate = true;
  }

  _prepareLight(light) {
    if (this._preparedLights.has(light)) return;

    if (light.isDirectionalLight) {
      light.castShadow = true;
      this._configureDirectionalShadow(light);
    } else if (light.isSpotLight) {
      light.castShadow = true;
      light.shadow.mapSize.setScalar(Math.min(this._shadowMapSize, 2048));
      light.shadow.bias = -0.00012;
      light.shadow.normalBias = 0.02;
    }

    this._preparedLights.add(light);
  }

  _applyShadowQualityToScene(scene) {
    scene.traverse((object) => {
      if (object.isDirectionalLight) this._configureDirectionalShadow(object);
      if (object.isSpotLight && object.shadow) {
        object.shadow.mapSize.setScalar(Math.min(this._shadowMapSize, 2048));
        object.shadow.needsUpdate = true;
      }
    });
    this._shadowLightCacheDirty = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  _configureDirectionalShadow(light) {
    const cfg = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.high;
    const override = this._shadowQualityOverride === 'auto' ? null : SHADOW_QUALITY[this._shadowQualityOverride];
    if (override && !override.enabled) {
      light.castShadow = false;
      return;
    }
    light.castShadow = true;
    const shadow = light.shadow;
    const size = override?.mapSize || cfg.shadowMapSize;
    const rangeScale = override?.rangeScale || 1;
    shadow.mapSize.set(size, size);
    shadow.camera.near = 0.5;
    shadow.camera.far = 420;
    shadow.camera.left = -cfg.shadowRange * rangeScale;
    shadow.camera.right = cfg.shadowRange * rangeScale;
    shadow.camera.top = cfg.shadowRange * rangeScale;
    shadow.camera.bottom = -cfg.shadowRange * rangeScale;
    shadow.bias = -0.00008;
    shadow.normalBias = 0.025;
    shadow.radius = this.quality === 'ultra' ? 1.8 : this.quality === 'high' ? 1.4 : 1.1;
    if ('blurSamples' in shadow) shadow.blurSamples = this.quality === 'ultra' ? 6 : this.quality === 'high' ? 5 : 4;
    shadow.camera.updateProjectionMatrix();
    shadow.needsUpdate = true;
  }

  _updateRealtimeShadows(scene, camera) {
    if (!this.renderer.shadowMap.enabled) return;

    const followPosition = this._getShadowFollowPosition(camera);
    this._shadowAnchorFrame += 1;
    for (const light of this._getShadowLights(scene)) {
      this._updateDirectionalLightAnchor(light, followPosition);
    }

    const cfg = QUALITY_PRESETS[this.quality] || QUALITY_PRESETS.high;
    if (this._frame === 1 || this._shadowUpdateCountdown <= 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this._shadowUpdateCountdown = cfg.shadowFrameInterval || 2;
    } else {
      this._shadowUpdateCountdown -= 1;
    }
  }

  _getShadowLights(scene) {
    if (!this._shadowLightCacheDirty) {
      return this._shadowLightCache.filter(light => light?.parent && light.castShadow);
    }

    const lights = [];
    scene.traverse((object) => {
      if (!object.isDirectionalLight || !object.castShadow) return;
      this._prepareLight(object);
      lights.push(object);
    });
    this._shadowLightCache = lights;
    this._shadowLightCacheDirty = false;
    return lights;
  }

  _getShadowFollowPosition(camera) {
    if (this._shadowFollowTarget?.getWorldPosition) {
      return this._shadowFollowTarget.getWorldPosition(this._tmpPosition);
    }
    if (camera?.getWorldPosition) {
      return camera.getWorldPosition(this._tmpPosition);
    }
    return this._tmpPosition.set(0, 0, 0);
  }

  _updateDirectionalLightAnchor(light, followPosition) {
    const offset = light.userData?.pbrShadowOffset;
    if (offset?.isVector3) {
      this._tmpOffset.copy(offset);
    } else if (Array.isArray(offset)) {
      this._tmpOffset.set(offset[0], offset[1], offset[2]);
    } else {
      this._tmpOffset.copy(light.position).sub(light.target.position);
      if (this._tmpOffset.lengthSq() < 1) this._tmpOffset.set(35, 95, 25);
      light.userData.pbrShadowOffset = this._tmpOffset.clone();
    }

    light.target.position.copy(followPosition);
    light.position.copy(followPosition).add(this._tmpOffset);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
  }

  _inferMaterialRole(mesh, material) {
    const explicitRole = mesh.userData?.pbrRole || material.userData?.pbrRole;
    if (explicitRole) return explicitRole;

    const label = `${mesh.name || ''} ${material.name || ''}`.toLowerCase();
    if (/road|asphalt|track|street|lane|curb|kerb/.test(label)) return 'road';
    if (/grass|terrain|sand|dirt|soil|ground|earth/.test(label)) return 'terrain';
    if (/glass|window|windscreen|windshield/.test(label)) return 'glass';
    if (/car|body|paint|chassis|coupe|wheel|tire|tyre/.test(label)) return 'car';
    if (/metal|rail|barrier|fence|guard|post|sign|rim|hub/.test(label)) return 'metal';
    if (/light|lamp|neon|emissive|head|tail|brake/.test(label)) return 'emissive';
    return 'prop';
  }

  _shouldKeepUnlit(material) {
    return material.isShaderMaterial
      || material.isSpriteMaterial
      || material.isPointsMaterial
      || material.userData?.keepUnlit
      || material.toneMapped === false;
  }

  _materialIsMostlyTransparent(material) {
    const materials = Array.isArray(material) ? material : [material];
    return materials.some((mat) => mat?.transparent && (mat.opacity ?? 1) < 0.35);
  }

  _shouldCastShadow(mesh) {
    const role = this._inferMaterialRole(mesh, Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
    return role !== 'road' && role !== 'terrain';
  }

  _shouldReceiveShadow(mesh) {
    const role = this._inferMaterialRole(mesh, Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
    return role !== 'glass' && role !== 'emissive';
  }

  _chooseMaterialValue(current, fallback) {
    if (current === undefined || current === null) return fallback;
    if (current === 0 || Number.isNaN(current)) return fallback;
    return current;
  }

  dispose() {
    this._environmentTarget?.dispose?.();
    this._pmremGenerator?.dispose?.();
    this._materialCache = new WeakMap();
    this.renderer.dispose();
    this.scene.clear();
  }
}
