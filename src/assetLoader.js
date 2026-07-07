import * as THREE from 'three';

const ASSET_REVISION = '20260707-scene-skybox-physics-refresh';

const MATERIAL_TEXTURE_KEYS = [
  'map', 'lightMap', 'bumpMap', 'normalMap', 'displacementMap',
  'specularMap', 'envMap', 'alphaMap', 'aoMap', 'roughnessMap',
  'metalnessMap', 'emissiveMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'transmissionMap', 'thicknessMap',
];

let _gltfLoader = null;
function _getGLTFLoader() {
  if (!_gltfLoader) {
    return import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      _gltfLoader = new GLTFLoader();
      return _gltfLoader;
    });
  }
  return Promise.resolve(_gltfLoader);
}

export class AssetLoader {
  constructor() {
    this.queue = [];
    this.loaded = new Map();       // id -> asset (generic)
    this.modelCache = new Map();   // url -> THREE.Group (cloneable)
    this.textureCache = new Map(); // url -> THREE.Texture (shared ref)
    this.totalItems = 0;
    this.completedItems = 0;
    this.failedItems = 0;
    this.isLoading = false;

    this.onProgress = null;  // (percent, currentId)
    this.onComplete = null;  // ()
    this.onError = null;     // (id, error, retriesLeft)

    // Image bitmap support check (WebP detection)
    this._supportsWebP = null;
  }

  // ==================== Enqueue ====================

  enqueue(id, type, url, maxRetries = 2) {
    this.queue.push({ id, type, url, maxRetries, retries: 0 });
    this.totalItems++;
  }

  enqueueBatch(items) {
    for (const item of items) {
      this.enqueue(item.id, item.type, item.url, item.maxRetries);
    }
  }

  // ==================== Load all ====================

  async loadAll() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.completedItems = 0;
    this.failedItems = 0;

    const batchSize = 6;
    const queue = [...this.queue];

    for (let i = 0; i < queue.length; i += batchSize) {
      const batch = queue.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(item => this._loadItem(item)));
    }

    this.isLoading = false;
    if (this.onComplete) this.onComplete();
  }

  /**
   * Batch preload: load a list of asset IDs, return overall progress.
   * Designed to plug into the homepage loading bar.
   * @param {Array<{id, type, url}>} items
   * @param {function} onProgress - (overallPercent, currentId)
   * @returns {Promise<Map>} loaded assets
   */
  async batchPreload(items, onProgress) {
    const startTotal = this.totalItems;
    this.enqueueBatch(items);
    const newTotal = this.totalItems - startTotal;

    if (onProgress) {
      const orig = this.onProgress;
      this.onProgress = (percent, id) => {
        const localPercent = Math.round(
          ((this.completedItems - (this.totalItems - newTotal)) / newTotal) * 100
        );
        onProgress(Math.min(localPercent, 100), id);
        if (orig) orig(percent, id);
      };
    }

    await this.loadAll();
    return this.loaded;
  }

  // ==================== Internal loaders ====================

  async _loadItem(item) {
    try {
      let asset;
      switch (item.type) {
        case 'texture':
          asset = await this._loadTexture(item.url, item);
          break;
        case 'glb':
        case 'gltf':
          asset = await this._loadGLB(item.url, item);
          break;
        case 'audio':
          asset = await this._loadAudio(item.url);
          break;
        case 'json':
          asset = await this._loadJSON(item.url);
          break;
        default:
          throw new Error(`Unknown asset type: ${item.type}`);
      }
      this.loaded.set(item.id, asset);
      this.completedItems++;
      this._reportProgress(item.id);
    } catch (err) {
      if (item.retries < item.maxRetries) {
        item.retries++;
        if (this.onError) this.onError(item.id, err, item.maxRetries - item.retries);
        await new Promise(r => setTimeout(r, 500));
        return this._loadItem(item);
      }
      this.failedItems++;
      this.completedItems++;
      this._reportProgress(item.id);
      console.error(`[AssetLoader] Failed "${item.id}" after ${item.maxRetries} retries:`, err.message);
      if (!this.loaded.has(item.id)) {
        this.loaded.set(item.id, null);
      }
    }
  }

  // ---- Texture ----

  _resolveAssetUrl(url, { version = false } = {}) {
    if (typeof url !== 'string') return url;

    let resolved = url;
    const isLocalAsset = /^(?:\/|\.{1,2}\/)/.test(url);
    const hasWindowLocation = typeof window !== 'undefined' && window.location?.href;

    if (isLocalAsset && hasWindowLocation) {
      const relativeUrl = window.location.protocol === 'file:' && url.startsWith('/')
        ? `.${url}`
        : url;

      try {
        resolved = new URL(relativeUrl, window.location.href).href;
      } catch {
        resolved = relativeUrl;
      }
    }

    if (!version) return resolved;
    if (!/\.(?:json|glb|gltf|bin|png|jpe?g|webp|ktx2|wav|mp3)(?:[?#]|$)/i.test(resolved)) {
      return resolved;
    }

    const hashIndex = resolved.indexOf('#');
    const base = hashIndex >= 0 ? resolved.slice(0, hashIndex) : resolved;
    const hash = hashIndex >= 0 ? resolved.slice(hashIndex) : '';
    const joiner = base.includes('?') ? '&' : '?';
    return `${base}${joiner}v=${ASSET_REVISION}${hash}`;
  }

  async _loadTexture(url, item) {
    // Check texture cache first
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url);
    }

    // Detect WebP support once
    if (this._supportsWebP === null) {
      this._supportsWebP = await this._detectWebP();
    }

    // Try WebP variant if supported and URL is not already .webp
    const cleanUrl = url.split(/[?#]/)[0];
    const webpUrl = this._supportsWebP && !cleanUrl.endsWith('.webp')
      ? url.replace(/\.(png|jpg|jpeg)$/i, '.webp')
      : null;

    const texture = await new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      const tryUrl = webpUrl || url;
      const requestUrl = this._resolveAssetUrl(tryUrl, { version: true });

      loader.load(
        requestUrl,
        (tex) => {
          this._configureTexture(tex);
          resolve(tex);
        },
        (progress) => {
          // TextureLoader progress: { loaded, total } if server sends Content-Length
          if (item._progress) {
            item._progress(progress.loaded / (progress.total || 1));
          }
        },
        () => {
          // Fallback to original URL if WebP variant failed
          if (webpUrl && tryUrl === webpUrl) {
            loader.load(
              this._resolveAssetUrl(url, { version: true }),
              (tex) => {
                this._configureTexture(tex);
                resolve(tex);
              },
              undefined,
              () => reject(new Error(`Texture load failed: ${url}`))
            );
          } else {
            reject(new Error(`Texture load failed: ${url}`));
          }
        }
      );
    });

    this.textureCache.set(url, texture);
    return texture;
  }

  _configureTexture(texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    // Anisotropic filtering — cap at renderer max
    const maxAniso = this._maxAnisotropy || 4;
    if (texture.anisotropy !== undefined && maxAniso > 1) {
      texture.anisotropy = maxAniso;
    }
  }

  setMaxAnisotropy(value) {
    this._maxAnisotropy = value;
  }

  async _detectWebP() {
    // Quick feature test for WebP support
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAEAAQAcJaQAA3AA/vp9AA==';
      // Timeout fallback
      setTimeout(() => resolve(false), 200);
    });
  }

  // ---- GLB / GLTF ----

  async _loadGLB(url, item, options = {}) {
    const shareResources = options.cloneMode === 'shared';
    // Check model cache first
    if (this.modelCache.has(url)) {
      // Return a cloned scene so each caller gets independent transforms
      return cloneModelScene(this.modelCache.get(url), { shareResources });
    }

    const loader = await _getGLTFLoader();
    const requestUrl = this._resolveAssetUrl(url, { version: true });

    const gltf = await new Promise((resolve, reject) => {
      loader.load(
        requestUrl,
        (gltf) => resolve(gltf),
        (progress) => {
          if (item._progress && progress.total) {
            item._progress(progress.loaded / progress.total);
          }
        },
        () => reject(new Error(`GLB load failed: ${url}`))
      );
    });

    // Cache the original scene for future cloning
    this.modelCache.set(url, gltf.scene);
    // Return a clone so callers own their copy
    return cloneModelScene(gltf.scene, { shareResources });
  }

  /**
   * Load a GLB/GLTF and return the full gltf object (scene + animations + cameras).
   * Caches the scene for cloning; animations are not cloned.
   */
  async loadGLBFull(url) {
    if (this.modelCache.has(url)) {
      const scene = cloneModelScene(this.modelCache.get(url));
      return { scene, animations: [], cameras: [] };
    }

    const loader = await _getGLTFLoader();
    const requestUrl = this._resolveAssetUrl(url, { version: true });
    const gltf = await new Promise((resolve, reject) => {
      loader.load(requestUrl, resolve, undefined, () => reject(new Error(`GLB load failed: ${url}`)));
    });

    this.modelCache.set(url, gltf.scene);
    return {
      scene: cloneModelScene(gltf.scene),
      animations: gltf.animations || [],
      cameras: gltf.cameras || [],
    };
  }

  // ---- Audio ----

  _loadAudio(url) {
    return this._fetchWithTimeout(url, 8000, { version: true })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .catch(err => { throw new Error(`Audio load failed: ${url} (${err.message})`); });
  }

  // ---- JSON ----

  _loadJSON(url) {
    return this._fetchWithTimeout(url, 8000, { version: true })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .catch(err => { throw new Error(`JSON load failed: ${url} (${err.message})`); });
  }

  _fetchWithTimeout(url, timeoutMs = 8000, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(this._resolveAssetUrl(url, options), { signal: controller.signal, cache: 'no-store' })
      .finally(() => clearTimeout(timer));
  }

  async assetExists(url, timeoutMs = 1500) {
    if (!url) return false;
    const requestUrl = this._resolveAssetUrl(url);

    const tryFetch = async (method) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(requestUrl, { method, signal: controller.signal, cache: 'no-store' });
        res.body?.cancel?.();
        return res.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    };

    return (await tryFetch('HEAD')) || (await tryFetch('GET'));
  }

  // ==================== Access ====================

  get(id) {
    return this.loaded.get(id);
  }

  getModel(url) {
    if (this.modelCache.has(url)) {
      return cloneModelScene(this.modelCache.get(url));
    }
    return null;
  }

  getTexture(url) {
    return this.textureCache.get(url) || null;
  }

  getProgress() {
    return this.totalItems > 0 ? this.completedItems / this.totalItems : 0;
  }

  // ==================== Cache management ====================

  clearModelCache() {
    for (const [url, model] of this.modelCache) {
      disposeMesh(model);
    }
    this.modelCache.clear();
  }

  clearTextureCache() {
    for (const [url, tex] of this.textureCache) {
      tex.dispose();
    }
    this.textureCache.clear();
  }

  clear() {
    this.queue = [];
    this.loaded.clear();
    this.clearModelCache();
    this.clearTextureCache();
    this.totalItems = 0;
    this.completedItems = 0;
    this.failedItems = 0;
  }

  // ==================== Progress ====================

  _reportProgress(currentId) {
    if (!this.onProgress) return;
    const percent = this.totalItems > 0
      ? Math.round((this.completedItems / this.totalItems) * 100)
      : 0;
    this.onProgress(percent, currentId);
    const fill = document.getElementById('loading-bar-fill');
    const text = document.getElementById('loading-percent');
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }
}

// ==================== Disposal Utilities ====================

function cloneModelScene(scene, options = {}) {
  const clone = scene.clone(true);
  if (options.shareResources) {
    clone.traverse((child) => {
      if (!child.isMesh) return;
      child.userData = {
        ...(child.userData || {}),
        sharedGeometry: true,
        sharedMaterial: true,
      };
    });
    return clone;
  }

  const sourceMeshes = [];
  const cloneMeshes = [];

  scene.traverse((child) => {
    if (child.isMesh) sourceMeshes.push(child);
  });
  clone.traverse((child) => {
    if (child.isMesh) cloneMeshes.push(child);
  });

  for (let i = 0; i < cloneMeshes.length; i++) {
    const source = sourceMeshes[i];
    const target = cloneMeshes[i];
    if (!source || !target) continue;
    if (source.geometry) target.geometry = source.geometry.clone();
    if (source.material) target.material = cloneMaterial(source.material);
  }

  return clone;
}

function cloneMaterial(material) {
  if (Array.isArray(material)) {
    return material.map(item => cloneMaterial(item));
  }
  if (!material) return material;

  const clone = material.clone();
  for (const key of MATERIAL_TEXTURE_KEYS) {
    const texture = clone[key];
    if (texture?.isTexture) {
      clone[key] = texture.clone();
      clone[key].needsUpdate = true;
    }
  }
  return clone;
}

/**
 * Recursively dispose a Three.js mesh or group, freeing all GPU memory.
 * Traverses children, disposes geometries, materials, and textures.
 * @param {THREE.Object3D} obj - The root object to dispose
 */
export function disposeMesh(obj) {
  if (!obj) return;

  obj.traverse((child) => {
    if (child.geometry && !child.userData?.sharedGeometry) {
      child.geometry.dispose();
    }

    if (child.material && !child.userData?.sharedMaterial) {
      _disposeMaterial(child.material);
    }

    // Dispose any directly attached textures
    if (child.texture) {
      child.texture.dispose();
    }
  });

  // Remove from parent if any
  if (obj.parent) {
    obj.parent.remove(obj);
  }
}

function _disposeMaterial(mat) {
  if (Array.isArray(mat)) {
    for (const m of mat) _disposeMaterial(m);
    return;
  }
  if (!mat) return;

  // Dispose all texture maps on the material
  const mapKeys = [
    'map', 'lightMap', 'bumpMap', 'normalMap', 'displacementMap',
    'specularMap', 'envMap', 'alphaMap', 'aoMap', 'roughnessMap',
    'metalnessMap', 'emissiveMap', 'clearcoatMap', 'clearcoatNormalMap',
    'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
    'transmissionMap', 'thicknessMap',
  ];

  if (!mat.userData?.sharedTextureMaps) {
    for (const key of mapKeys) {
      if (mat[key]) {
        mat[key].dispose();
      }
    }
  }

  mat.dispose();
}

/**
 * Dispose a single texture from the texture cache.
 * @param {string} url - Texture URL to evict from cache and dispose
 * @param {AssetLoader} loader - AssetLoader instance
 */
export function disposeTexture(url, loader) {
  const tex = loader.textureCache.get(url);
  if (tex) {
    tex.dispose();
    loader.textureCache.delete(url);
  }
}
