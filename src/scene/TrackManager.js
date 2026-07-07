import * as THREE from 'three';
import { disposeMesh } from '../assetLoader.js';
import { TrackBuilder } from './TrackBuilder.js';

/**
 * Track scene manager.
 * Loads track GLB models via AssetLoader, builds procedural tracks,
 * places props, and handles cleanup on track switch to prevent memory leaks.
 *
 * Usage:
 *   const track = new TrackManager(assetLoader, scene);
 *   await track.load('city-circuit');
 *   // Or build procedural:
 *   const data = track.buildProcedural('city_circuit');
 */
export class TrackManager {
  constructor(assetLoader, scene) {
    this._loader = assetLoader;
    this.scene = scene;
    this.currentTrackId = null;
    this.trackRoot = new THREE.Group();
    this.trackRoot.name = 'track-root';
    this.scene.add(this.trackRoot);

    // Sub-groups for organized traversal
    this.roadGroup = new THREE.Group();
    this.roadGroup.name = 'track-road';
    this.barrierGroup = new THREE.Group();
    this.barrierGroup.name = 'track-barriers';
    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = 'track-buildings';
    this.propGroup = new THREE.Group();
    this.propGroup.name = 'track-props';
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'track-terrain';
    this.skyGroup = new THREE.Group();
    this.skyGroup.name = 'track-sky-models';

    this.trackRoot.add(this.roadGroup);
    this.trackRoot.add(this.barrierGroup);
    this.trackRoot.add(this.buildingGroup);
    this.trackRoot.add(this.propGroup);
    this.trackRoot.add(this.terrainGroup);
    this.trackRoot.add(this.skyGroup);

    this._loadedPropModels = new Map();
    this._builder = null;
    this._trackData = null; // { checkpoints, surfaceZones, spawnPoints, roadCenterPoints }

    // Surface zone spatial data for fast lookups
    this._surfaceZones = [];
    this._barrierColliders = [];
    this._editorRoadProfiles = [];
    this._roadProfile = null;
    this._roadCollisionProfile = null;
    this._sceneryColliders = [];
    this._cameraColliders = null;
    this._cameraOccluderMeshes = null;
    this._cameraGroundMeshes = null;
    this._roadHeightRaycaster = new THREE.Raycaster();
    this._roadHeightMeshes = null;
    this._roadHeightBounds = null;
    this._roadSurfaceSampler = null;
    this._roadHeightCache = new Map();
    this._roadHeightCacheKeys = [];
  }

  /**
   * Load a track by ID (matches config/asset-path.json models.tracks keys).
   * Automatically disposes the previous track.
   * @param {string} trackId - e.g. 'city-circuit', 'mountain-pass'
   * @returns {Promise<void>}
   */
  async load(trackId) {
    const paths = await this._loadAssetPaths();
    const url = paths?.models?.tracks?.[trackId];
    if (!url) {
      throw new Error(`[TrackManager] Unknown track ID: "${trackId}". Add it to config/asset-path.json.`);
    }

    // Dispose old track
    this._disposeTrack();

    // Load new track model
    const model = await this._loader._loadGLB(url, { _progress: null });
    this.currentTrackId = trackId;

    // Sort nodes into sub-groups by name
    this._sortTrackNodes(model);
  }

  /**
   * Sort track model nodes into logical sub-groups.
   */
  _sortTrackNodes(model, options = {}) {
    model.updateMatrixWorld(true);

    // First pass: collect all meshes with geometry info
    const meshes = [];
    model.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      // Deep-clone geometry + material to preserve textures
      const cloneGeo = child.geometry.clone();
      const cloneMat = Array.isArray(child.material)
        ? child.material.map(m => m.clone())
        : child.material.clone();
      const clone = new THREE.Mesh(cloneGeo, cloneMat);
      clone.matrix.copy(child.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      this._applyImportTransform(clone, options);
      clone.castShadow = true;
      clone.receiveShadow = true;
      const bbox = new THREE.Box3().setFromObject(clone);
      const size = new THREE.Vector3(); bbox.getSize(size);
      meshes.push({ mesh: clone, size, bbox, name: (child.name || '').toLowerCase() });
    });

    // Classify by name first, then by geometry
    for (const { mesh, size, bbox, name } of meshes) {
      let classified = false;

      if (/road|track|surface|asphalt|pavement/i.test(name)) {
        this._enhanceImportedMeshMaterial(mesh, 'road');
        this.roadGroup.add(mesh); classified = true;
      } else if (/barrier|fence|wall|guardrail|railing/i.test(name)) {
        this._enhanceImportedMeshMaterial(mesh, 'barrier');
        this.barrierGroup.add(mesh); classified = true;
      } else if (/building|stadium|grandstand|pit|garage/i.test(name)) {
        this._enhanceImportedMeshMaterial(mesh, 'scenery');
        this.buildingGroup.add(mesh); classified = true;
      } else if (/terrain|ground|hill|dirt|grass/i.test(name)) {
        this._enhanceImportedMeshMaterial(mesh, 'terrain');
        this.terrainGroup.add(mesh); classified = true;
      }

      if (classified) continue;

      // Geometry-based classification for unnamed/numeric meshes
      const area = size.x * size.z;
      const flatness = Math.max(size.x, size.z) / Math.max(size.y, 0.01);

      if (flatness > 8 && area > 50) {
        // Large flat surface → road
        this._enhanceImportedMeshMaterial(mesh, 'road');
        this.roadGroup.add(mesh);
      } else if (size.y > size.x * 0.8 && size.y > size.z * 0.8 && size.y > 1.5 && area < 30) {
        // Tall, small footprint → barrier/pillar
        this._enhanceImportedMeshMaterial(mesh, 'barrier');
        this.barrierGroup.add(mesh);
      } else if (size.y > 3 && area > 20) {
        // Tall and large → building
        this._enhanceImportedMeshMaterial(mesh, 'scenery');
        this.buildingGroup.add(mesh);
      } else if (flatness > 5 && area > 200) {
        // Very large flat → terrain
        this._enhanceImportedMeshMaterial(mesh, 'terrain');
        this.terrainGroup.add(mesh);
      } else {
        this._enhanceImportedMeshMaterial(mesh, 'prop');
        this.propGroup.add(mesh);
      }
    }

    this._ensureRoadMeshFromFallback();

    console.log('[TrackManager] Groups: road=' + this.roadGroup.children.length +
      ' barrier=' + this.barrierGroup.children.length +
      ' building=' + this.buildingGroup.children.length +
      ' terrain=' + this.terrainGroup.children.length +
      ' prop=' + this.propGroup.children.length);
  }

  _ensureRoadMeshFromFallback() {
    if (this.roadGroup.children.length > 0) return;

    let best = null;
    const groups = [this.propGroup, this.terrainGroup, this.buildingGroup];
    for (const group of groups) {
      for (const mesh of [...group.children]) {
        if (!mesh.isMesh || !mesh.geometry) continue;
        mesh.updateWorldMatrix(true, false);
        const bbox = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const footprint = size.x * size.z;
        const flatness = Math.max(size.x, size.z) / Math.max(size.y, 0.001);
        const vertexCount = mesh.geometry.getAttribute('position')?.count || 0;
        const score = footprint * Math.min(flatness, 500) + vertexCount * 0.01;
        if (footprint < 0.05 || flatness < 25) continue;
        if (!best || score > best.score) {
          best = { mesh, group, score };
        }
      }
    }

    if (!best) return;
    best.group.remove(best.mesh);
    this._enhanceImportedMeshMaterial(best.mesh, 'road');
    this.roadGroup.add(best.mesh);
    console.log('[TrackManager] Reclassified fallback road mesh: ' + (best.mesh.name || 'unnamed'));
  }

  _enhanceImportedMeshMaterial(mesh, role = 'prop') {
    if (!mesh?.material) return;
    mesh.userData.pbrRole = role;
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = sourceMaterials.map((material) => this._ensurePBRMaterial(material, role));
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];

    for (const material of materials) {
      if (!material) continue;
      this._configureImportedPBR(material, role);
      this._repairImportedMaterialVisibility(material, role);
      this._configureImportedTextureMaps(material, role);
      this._configureImportedCutoutMaterial(material, role);
      material.needsUpdate = true;
    }
  }

  _ensurePBRMaterial(material, role) {
    if (!material) return material;
    if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) return material;

    const pbr = new THREE.MeshStandardMaterial({
      name: material.name || '',
      color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
      map: material.map || null,
      alphaMap: material.alphaMap || null,
      emissive: material.emissive ? material.emissive.clone() : new THREE.Color(0x000000),
      emissiveMap: material.emissiveMap || null,
      emissiveIntensity: material.emissiveIntensity || 0,
      transparent: material.transparent,
      opacity: material.opacity,
      alphaTest: material.alphaTest || 0,
      side: material.side,
      depthWrite: material.depthWrite,
      vertexColors: material.vertexColors || false,
    });
    this._configureImportedPBR(pbr, role);
    return pbr;
  }

  _configureImportedPBR(material, role) {
    if (!material) return;

    if (material.map?.isTexture && material.color) {
      material.color.set(0xffffff);
    }

    const roleParams = {
      road:    { roughness: 0.76, metalness: 0.02, envMapIntensity: 0.22 },
      terrain: { roughness: 0.92, metalness: 0.0,  envMapIntensity: 0.12 },
      barrier: { roughness: 0.58, metalness: 0.08, envMapIntensity: 0.34 },
      scenery: { roughness: 0.68, metalness: 0.04, envMapIntensity: 0.28 },
      prop:    { roughness: 0.70, metalness: 0.05, envMapIntensity: 0.24 },
    }[role] || { roughness: 0.72, metalness: 0.04, envMapIntensity: 0.22 };

    if ('roughness' in material && !material.roughnessMap) material.roughness = roleParams.roughness;
    if ('metalness' in material && !material.metalnessMap) material.metalness = roleParams.metalness;
    if ('envMapIntensity' in material) material.envMapIntensity = roleParams.envMapIntensity;
    if ('normalScale' in material && material.normalMap) material.normalScale.setScalar(role === 'road' ? 0.65 : 0.85);
  }

  _configureImportedCutoutMaterial(material, role = 'prop') {
    if (!this._isImportedCutoutMaterial(material, role)) return;

    material.alphaTest = Math.max(material.alphaTest || 0, 0.38);
    material.transparent = false;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    material.needsUpdate = true;
  }

  _isImportedCutoutMaterial(material, role = 'prop') {
    if (!material) return false;
    if (material.alphaMap?.isTexture || (material.alphaTest || 0) > 0) return true;

    const label = `${role} ${material.name || ''}`.toLowerCase();
    if (/glass|window|windscreen|windshield/.test(label)) return false;
    if (!material.map?.isTexture) return false;

    return /fence|grill|mesh|net|tree|trees|palm|leaf|leaves|grass|banner|brand|sign|wire|railing|baloon|balloon|cutout|alpha|transparent/.test(label);
  }

  _repairImportedMaterialVisibility(material, role) {
    if (!material?.color || material.map?.isTexture) return;

    const color = material.color;
    const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    if (luminance > 0.055) return;

    color.setHex(this._fallbackImportedColor(role, material.name || ''));
    if ('metalness' in material) material.metalness = Math.min(material.metalness || 0, 0.08);
    if ('roughness' in material) material.roughness = Math.max(material.roughness || 0, 0.72);
    if ('vertexColors' in material) material.vertexColors = false;
  }

  _fallbackImportedColor(role, materialName = '') {
    const label = `${role} ${materialName}`.toLowerCase();
    if (/grass|tree|palm|leaf|terrain/.test(label)) return 0x4f7f2f;
    if (/sand|dirt|soil/.test(label)) return 0xb4965d;
    if (/road|track|asphalt|pavement/.test(label)) return 0x858c8d;
    if (/barrier|wall|guardrail|fence/.test(label)) return 0xb8bdb8;
    if (/brand|sign|board/.test(label)) return 0xd8d2bf;
    if (/building|stadium|grandstand|garage|pit/.test(label)) return 0xa89f8b;
    if (role === 'terrain') return 0x4f7f2f;
    if (role === 'road') return 0x858c8d;
    if (role === 'barrier') return 0xb8bdb8;
    if (role === 'scenery') return 0xa89f8b;
    return 0xc0b7a2;
  }

  _configureImportedTextureMaps(material, role) {
    const colorMaps = ['map', 'emissiveMap'];
    const dataMaps = [
      'aoMap', 'bumpMap', 'displacementMap', 'metalnessMap',
      'normalMap', 'roughnessMap', 'alphaMap', 'lightMap',
    ];
    const anisotropy = role === 'road' ? 16 : 8;

    for (const key of colorMaps) {
      const texture = material[key];
      if (!texture?.isTexture) continue;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.max(texture.anisotropy || 1, anisotropy);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }

    for (const key of dataMaps) {
      const texture = material[key];
      if (!texture?.isTexture) continue;
      texture.colorSpace = THREE.NoColorSpace;
      texture.anisotropy = Math.max(texture.anisotropy || 1, anisotropy);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }
  }

  _configureImportedSceneryDrawOrder(mesh) {
    if (!mesh?.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materialNames = materials.map(m => m?.name || '').join(' ');
    const isTrackTrim = /roadtrim|pitlanetrim/i.test(materialNames);
    const isGroundSurface = /grass|sand/i.test(materialNames);
    const isSignOrFence = /brands?|banners?|sign|fence|grill|railing|trees?|palm|leaf|light_|metaltrim|baloo?ns?/i.test(materialNames);

    if (isTrackTrim) {
      mesh.position.y += 0.045;
      mesh.renderOrder = 6;
    } else if (isGroundSurface) {
      mesh.position.y += 0.015;
      mesh.renderOrder = 1;
    } else if (isSignOrFence) {
      mesh.renderOrder = 5;
    }

    for (const material of materials) {
      if (!material) continue;
      if (isTrackTrim || isGroundSurface) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = isTrackTrim ? -4 : -1;
        material.polygonOffsetUnits = isTrackTrim ? -4 : -1;
      }
      if (isSignOrFence) {
        material.side = THREE.DoubleSide;
        this._configureImportedCutoutMaterial(material, 'scenery');
      }
      material.needsUpdate = true;
    }
  }

  /* Debug log kept for mesh name inspection:
    const nameCounts = {};
    model.traverse(c => { if (c.isMesh) { const n = (c.name||'').toLowerCase(); nameCounts[n]=(nameCounts[n]||0)+1; }});
    console.log('[TrackManager] Mesh names:', Object.entries(nameCounts).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([n,c])=>n+'('+c+')').join(' | '));
  */

  /**
   * Place a prop model on the track at a given position.
   * Props are loaded from cache after first use.
   * @param {string} propId - matches config/asset-path.json models.props keys
   * @param {THREE.Vector3|Object} position
   * @param {THREE.Euler|Object} [rotation]
   * @param {number} [scale=1]
   */
  async addProp(propId, position, rotation, scale = 1) {
    const paths = await this._loadAssetPaths();
    const url = paths?.models?.props?.[propId];
    if (!url) {
      console.warn(`[TrackManager] Unknown prop ID: "${propId}"`);
      return null;
    }

    // Use cached prop model if available
    let propModel = this._loadedPropModels.get(propId);
    if (!propModel) {
      propModel = await this._loader._loadGLB(url, { _progress: null });
      this._loadedPropModels.set(propId, propModel);
    }

    const instance = propModel.clone(true);
    instance.position.set(position.x || 0, position.y || 0, position.z || 0);
    if (rotation) {
      instance.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    }
    instance.scale.setScalar(scale);
    this.propGroup.add(instance);
    return instance;
  }

  /**
   * Remove all props from the track.
   */
  clearProps() {
    while (this.propGroup.children.length > 0) {
      const child = this.propGroup.children[0];
      disposeMesh(child);
    }
  }

  /**
   * Get the road mesh for physics surface assignment.
   */
  getRoadMeshes() {
    const meshes = [];
    this.roadGroup.traverse((child) => {
      if (this._isEditorRoadVisualOnlyMesh(child)) return;
      if (child.userData?.editorRoadSurface && child.userData?.editorRoadCollision === false) return;
      if (child.isMesh && child.geometry && child.visible !== false) meshes.push(child);
    });
    return meshes;
  }

  /**
   * Get all collidable track objects (barriers + buildings).
   */
  getCollidables() {
    return [
      ...this.barrierGroup.children,
      ...this.buildingGroup.children,
    ].filter(c => c.isMesh);
  }

  get currentId() {
    return this.currentTrackId;
  }

  // ==================== Procedural Track Building ====================

  /**
   * Build a procedural city circuit track using TrackBuilder.
   * Disposes any previous track first.
   * @param {string} [trackId='city_circuit'] - Track identifier
   * @returns {{ checkpoints, surfaceZones, spawnPoints, roadCenterPoints }}
   */
  buildProcedural(trackId = 'city_circuit') {
    this._disposeTrack();

    // Remove old builder groups from scene if any
    if (this._builder) {
      this._builder.dispose();
    }

    this._builder = new TrackBuilder(this.scene);
    this._builder._trackId = trackId;

    // Transfer builder sub-groups to track root
    this.trackRoot.add(this._builder.roadGroup);
    this.trackRoot.add(this._builder.barrierGroup);
    this.trackRoot.add(this._builder.buildingGroup);
    this.trackRoot.add(this._builder.propGroup);
    this.trackRoot.add(this._builder.terrainGroup);

    this._trackData = this._builder.build();
    this.currentTrackId = trackId;

    // Index surface zones for fast lookup
    this._surfaceZones = this._trackData.surfaceZones || [];
    this._roadProfile = this._profileFromTrackData(this._trackData);
    this._roadCollisionProfile = this._buildContinuousRoadCollisionProfile(this._roadProfile);
    this._barrierColliders = this._builder.getBarrierColliders();

    return this._trackData;
  }

  async buildExternalOrProcedural(trackId = 'city-circuit', proceduralId = 'city_circuit') {
    const paths = await this._loadAssetPaths();
    const assetTrackId = this.resolveAssetTrackId(trackId);
    const proceduralTrackId = proceduralId || this.resolveProceduralTrackId(trackId);
    const cfg = paths?.models?.tracks?.[assetTrackId];
    if (!cfg) {
      return this.buildProcedural(proceduralTrackId);
    }

    // Support both old (string URL) and new ({track, scenery}) format
    let trackUrl, sceneryUrl;
    if (typeof cfg === 'string') {
      trackUrl = cfg;
      sceneryUrl = null;
    } else {
      trackUrl = cfg.track;
      sceneryUrl = cfg.scenery;
      // Backward compat: if new track file missing, try old single-file name
      if (!(await this._loader.assetExists(trackUrl))) {
        const oldUrl = trackUrl.replace(/-track\.glb$/, '.glb');
        if (await this._loader.assetExists(oldUrl)) {
          console.log('[TrackManager] Using legacy single-file track: ' + oldUrl);
          trackUrl = oldUrl;
          sceneryUrl = null;
        }
      }
    }

    if (!(await this._loader.assetExists(trackUrl))) {
      return this.buildProcedural(proceduralTrackId);
    }

    try {
      this.clearCurrentTrack();

      // Load track model (road surface + barriers → physics + navigation)
      const trackModel = await this._loader._loadGLB(trackUrl, { _progress: null });
      this.currentTrackId = trackId;
      const importOptions = this._getTrackImportOptions(cfg);
      this._sortTrackNodes(trackModel, importOptions);
      this._alignToGround();
      this._trackData = this._extractTrackData();
      this._trackData.skyModelUrl = typeof cfg === 'object' ? cfg.skybox || cfg.skyModel || null : null;
      this._trackData.sceneryUnlit = importOptions.sceneryUnlit;
      this._surfaceZones = this._trackData.surfaceZones || [];

      // Load scenery model (buildings + props → visual only, no physics)
      if (sceneryUrl && await this._loader.assetExists(sceneryUrl)) {
        try {
          const sceneryModel = await this._loader._loadGLB(sceneryUrl, { _progress: null }, { cloneMode: 'shared' });
          this._addSceneryNodes(sceneryModel, importOptions);
          this._sceneryColliders = [];
          console.log('[TrackManager] Scenery loaded as visual-only shared geometry');
        } catch (err) {
          console.warn('[TrackManager] Scenery load failed: ' + err.message);
        }
      }

      const skyModelUrl = this._trackData.skyModelUrl;
      if (skyModelUrl && await this._loader.assetExists(skyModelUrl)) {
        try {
          const skyModel = await this._loader._loadGLB(skyModelUrl, { _progress: null }, { cloneMode: 'shared' });
          this._addSkyModelNodes(skyModel, importOptions);
          console.log('[TrackManager] Sky model loaded as scene geometry: ' + skyModelUrl);
        } catch (err) {
          console.warn('[TrackManager] Sky model load failed: ' + err.message);
        }
      }

      console.log('[TrackManager] Track loaded from GLB, route: ' +
        this._trackData.roadCenterPoints.length + ' pts, colliders=' + this._barrierColliders.length);
      return this._trackData;
    } catch (err) {
      console.warn('[TrackManager] External track failed, using procedural fallback: ' + err.message);
      return this.buildProcedural(proceduralTrackId);
    }
  }

  async getAvailableTrackIds() {
    const tracks = await this._loadTrackConfig();
    return tracks.map(track => track.id);
  }

  async getAvailableTracks() {
    return this._loadTrackConfig();
  }

  resolveAssetTrackId(trackId) {
    return String(trackId || 'city_circuit').replace(/_/g, '-');
  }

  resolveProceduralTrackId(trackId) {
    return String(trackId || 'city_circuit').replace(/-/g, '_');
  }

  clearCurrentTrack() {
    if (this._builder) {
      this._builder.dispose();
      this._builder = null;
    }
    this._clearVisualGroups();
    this.currentTrackId = null;
  }

  /**
   * Add scenery-only meshes (buildings, props). No physics or navigation extraction.
   */
  _addSceneryNodes(model, options = {}) {
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const clone = new THREE.Mesh(child.geometry, child.material);
      clone.userData = {
        ...(child.userData || {}),
        sharedGeometry: true,
        sharedMaterial: true,
      };
      clone.matrix.copy(child.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      this._applyImportTransform(clone, options);
      clone.castShadow = options.sceneryUnlit ? false : true;
      clone.receiveShadow = options.sceneryUnlit ? false : true;
      this._enhanceImportedMeshMaterial(clone, 'scenery');
      if (options.sceneryUnlit) {
        clone.material = this._convertMaterialToUnlit(clone.material, 'unlit-scenery');
        this._markMaterialSharedTextures(clone.material);
        clone.userData.sharedMaterial = false;
      }
      this._configureImportedSceneryDrawOrder(clone);
      this.propGroup.add(clone);
    });
  }

  _addSkyModelNodes(model, options = {}) {
    model.updateMatrixWorld(true);
    model.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const clone = new THREE.Mesh(child.geometry, child.material);
      clone.userData = {
        ...(child.userData || {}),
        sharedGeometry: true,
        sharedMaterial: true,
      };
      clone.matrix.copy(child.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      this._applyImportTransform(clone, options);
      clone.castShadow = false;
      clone.receiveShadow = false;
      clone.material = this._convertMaterialToUnlit(clone.material, 'scene-sky-model');
      this._markMaterialSharedTextures(clone.material);
      clone.userData.sharedMaterial = false;
      this._configureSkyModelMaterial(clone.material);
      clone.renderOrder = -1000;
      clone.frustumCulled = false;
      clone.userData.sceneSkyModel = true;
      this.skyGroup.add(clone);
    });
  }

  _getTrackImportOptions(cfg) {
    return {
      scale: clampNumber(cfg?.scale, 0.001, 100, 1),
      rotation: Array.isArray(cfg?.rotation) ? cfg.rotation : null,
      offset: Array.isArray(cfg?.offset) ? cfg.offset : null,
      sceneryUnlit: cfg?.sceneryUnlit === true,
    };
  }

  _convertMaterialToUnlit(material, role = 'unlit') {
    if (Array.isArray(material)) {
      return material.map(item => this._convertMaterialToUnlit(item, role));
    }
    if (!material) return material;

    const basic = new THREE.MeshBasicMaterial({
      name: material.name || role,
      color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
      map: material.map || null,
      alphaMap: material.alphaMap || null,
      transparent: material.transparent || material.opacity < 1 || Boolean(material.alphaMap),
      opacity: material.opacity ?? 1,
      side: material.side ?? THREE.FrontSide,
      depthWrite: material.depthWrite !== false,
      depthTest: material.depthTest !== false,
      fog: false,
      toneMapped: false,
    });
    basic.userData = {
      ...(material.userData || {}),
      keepUnlit: true,
      pbrRole: role,
      sharedTextureMaps: material.userData?.sharedMaterial === true || material.userData?.sharedTextureMaps === true,
    };
    return basic;
  }

  _markMaterialSharedTextures(material) {
    if (Array.isArray(material)) {
      material.forEach(item => this._markMaterialSharedTextures(item));
      return;
    }
    if (!material) return;
    material.userData = {
      ...(material.userData || {}),
      sharedTextureMaps: true,
    };
  }

  _configureSkyModelMaterial(material) {
    if (Array.isArray(material)) {
      material.forEach(item => this._configureSkyModelMaterial(item));
      return;
    }
    if (!material) return;
    material.depthWrite = false;
    material.fog = false;
    material.toneMapped = false;
  }

  _applyImportTransform(mesh, options = {}) {
    const scale = clampNumber(options.scale, 0.001, 100, 1);
    if (Math.abs(scale - 1) >= 0.0001) {
      mesh.position.multiplyScalar(scale);
      mesh.scale.multiplyScalar(scale);
    }

    if (options.rotation) {
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(Number(options.rotation[0]) || 0),
        THREE.MathUtils.degToRad(Number(options.rotation[1]) || 0),
        THREE.MathUtils.degToRad(Number(options.rotation[2]) || 0),
        'XYZ',
      );
      const matrix = new THREE.Matrix4().makeRotationFromEuler(euler);
      mesh.applyMatrix4(matrix);
    }

    if (options.offset) {
      mesh.position.add(new THREE.Vector3(
        Number(options.offset[0]) || 0,
        Number(options.offset[1]) || 0,
        Number(options.offset[2]) || 0,
      ));
    }

    mesh.updateMatrixWorld(true);
  }

  /**
   * Align the track root so road surface sits at y=0 (physics ground level).
   */
  _alignToGround() {
    const roadMeshes = this.roadGroup.children.filter(c => c.isMesh);
    if (roadMeshes.length === 0) return;

    const bbox = new THREE.Box3();
    for (const m of roadMeshes) {
      m.updateWorldMatrix(true, false);
      bbox.expandByObject(m);
    }
    const minY = bbox.min.y;
    // Offset so lowest road point is at y=0.3 (just above physics ground at y≈-0.1)
    const offset = -minY + 0.3;
    this.trackRoot.position.y += offset;
    console.log('[TrackManager] Track Y offset: ' + offset.toFixed(2) + ' (road minY=' + minY.toFixed(2) + ')');
  }

  /**
   * Extract navigation and collision data from loaded GLB meshes.
   */
  _extractTrackData() {
    const profile = this._applyRoadMeshHeightsToProfile(this._extractRoadProfile());
    const roadPoints = profile.points;
    const spawnPoints = this._generateSpawnPoints(roadPoints, profile);
    const checkpoints = this._generateCheckpoints(roadPoints, profile);
    const finishLine = checkpoints[0] || null;

    this._roadProfile = profile;
    this._roadCollisionProfile = this._buildContinuousRoadCollisionProfile(profile);
    this._barrierColliders = [
      ...this._generateRoadBoundaryColliders(profile),
      ...this._extractBarrierColliders(),
    ];
    this._addRaceMarkers(profile, checkpoints);

    return {
      roadCenterPoints: roadPoints,
      spawnPoints,
      checkpoints,
      finishLine,
      startGrid: spawnPoints,
      surfaceZones: [],
      rampZones: [],
    };
  }

  /**
   * Extract road center path and road width from the GLB road mesh.
   */
  _extractRoadProfile() {
    const roadMeshes = this.roadGroup.children.filter(c => c.isMesh && c.geometry);
    if (roadMeshes.length === 0) return { points: [], halfWidths: [] };

    const boundaryLoops = this._extractBoundaryLoops(roadMeshes)
      .filter(loop => loop.length > 16)
      .sort((a, b) => b.length - a.length);

    if (boundaryLoops.length >= 2) {
      const physicalProfile = this._profileFromNearestBoundaryPair(boundaryLoops);
      const refined = this._refineProfileToRoadMesh(physicalProfile);
      if (physicalProfile.points.length >= 24 && refined.meshHits / Math.max(1, physicalProfile.points.length) >= 0.82) {
        console.log(`[TrackManager] Road route selected: physical-boundary-pair (${refined.meshHits}/${physicalProfile.points.length} mesh hits)`);
        return physicalProfile;
      }

      const loopProfile = this._profileFromBoundaryLoops(boundaryLoops[0], boundaryLoops[1]);
      const loopRefined = this._refineProfileToRoadMesh(loopProfile);
      if (loopProfile.points.length >= 24 && loopRefined.meshHits / Math.max(1, loopProfile.points.length) >= 0.82) {
        console.log(`[TrackManager] Road route selected: boundary-loops (${loopRefined.meshHits}/${loopProfile.points.length} mesh hits)`);
        return loopProfile;
      }
    }

    const radialProfile = this._profileByRadialSweep(roadMeshes);
    const radialRefined = this._refineProfileToRoadMesh(radialProfile);
    console.log(`[TrackManager] Road route selected: radial-sweep (${radialRefined.meshHits}/${radialProfile.points.length} mesh hits)`);
    return radialProfile;
  }

  _applyRoadMeshHeightsToProfile(profile) {
    const points = profile?.points || [];
    if (points.length === 0) return profile;

    let adjusted = 0;
    for (const point of points) {
      const y = this.getRoadHeightAtPosition(point);
      if (!Number.isFinite(y)) continue;
      point.y = y;
      adjusted++;
    }

    if (adjusted > 0) {
      console.log(`[TrackManager] Road profile heights sampled from mesh: ${adjusted}/${points.length}`);
    }
    return profile;
  }

  _extractBoundaryLoops(roadMeshes) {
    const keyToPoint = new Map();
    const edgeCounts = new Map();

    const addEdge = (a, b) => {
      if (a === b) return;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      let edge = edgeCounts.get(key);
      if (!edge) {
        edge = { a, b, count: 0 };
        edgeCounts.set(key, edge);
      }
      edge.count++;
    };

    for (const mesh of roadMeshes) {
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) continue;
      mesh.updateWorldMatrix(true, false);

      const keyCache = new Map();
      const vertexKey = (idx) => {
        if (keyCache.has(idx)) return keyCache.get(idx);
        const point = new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx))
          .applyMatrix4(mesh.matrixWorld);
        const key = [
          Math.round(point.x * 1000),
          Math.round(point.y * 1000),
          Math.round(point.z * 1000),
        ].join(',');
        keyCache.set(idx, key);
        if (!keyToPoint.has(key)) keyToPoint.set(key, point);
        return key;
      };

      const index = mesh.geometry.index;
      const readIndex = (i) => index ? index.getX(i) : i;
      const count = index ? index.count : pos.count;
      for (let i = 0; i < count - 2; i += 3) {
        const a = vertexKey(readIndex(i));
        const b = vertexKey(readIndex(i + 1));
        const c = vertexKey(readIndex(i + 2));
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
      }
    }

    const adjacency = new Map();
    for (const edge of edgeCounts.values()) {
      if (edge.count !== 1) continue;
      if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
      if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
      adjacency.get(edge.a).push(edge.b);
      adjacency.get(edge.b).push(edge.a);
    }

    const visited = new Set();
    const loops = [];
    for (const start of adjacency.keys()) {
      if (visited.has(start)) continue;

      const stack = [start];
      const component = [];
      visited.add(start);
      while (stack.length) {
        const key = stack.pop();
        component.push(key);
        for (const next of adjacency.get(key) || []) {
          if (!visited.has(next)) {
            visited.add(next);
            stack.push(next);
          }
        }
      }

      const ordered = this._orderBoundaryComponent(component, adjacency, keyToPoint);
      if (ordered.length) loops.push(ordered);
    }

    return loops;
  }

  _orderBoundaryComponent(component, adjacency, keyToPoint) {
    if (!component.length) return [];
    const componentSet = new Set(component);
    let start = component[0];
    for (const key of component) {
      const point = keyToPoint.get(key);
      const current = keyToPoint.get(start);
      if (point && (!current || point.z < current.z || (point.z === current.z && point.x < current.x))) {
        start = key;
      }
    }

    const ordered = [];
    let previous = null;
    let current = start;
    for (let guard = 0; guard < component.length + 4; guard++) {
      const point = keyToPoint.get(current);
      if (!point) break;
      ordered.push(point.clone());

      const next = (adjacency.get(current) || [])
        .filter(key => key !== previous && componentSet.has(key))[0];
      if (!next || next === start) break;
      previous = current;
      current = next;
    }

    return ordered;
  }

  _profileFromBoundaryLoops(loopA, loopB) {
    const areaA = Math.abs(this._signedAreaXZ(loopA));
    const areaB = Math.abs(this._signedAreaXZ(loopB));
    const outer = areaA >= areaB ? loopA : loopB;
    const inner = areaA >= areaB ? loopB : loopA;
    const alignedInner = this._alignBoundaryLoops(outer, inner);
    const sampleCount = 240;
    const outerSamples = this._resampleClosedLoop(outer, sampleCount);
    const innerSamples = this._resampleClosedLoop(alignedInner, sampleCount);

    let points = [];
    let halfWidths = [];
    for (let i = 0; i < sampleCount; i++) {
      const center = new THREE.Vector3().addVectors(outerSamples[i], innerSamples[i]).multiplyScalar(0.5);
      points.push(center);
      halfWidths.push(clampNumber(outerSamples[i].distanceTo(innerSamples[i]) * 0.5, 3.8, 10.5));
    }

    ({ points, halfWidths } = this._smoothRoadProfile(points, halfWidths));
    return this._rotateProfileToStartLine({ points, halfWidths });
  }

  _profileFromNearestBoundaryPair(boundaryLoops) {
    const loops = [...boundaryLoops]
      .filter(loop => loop.length > 16)
      .sort((a, b) => Math.abs(this._signedAreaXZ(b)) - Math.abs(this._signedAreaXZ(a)));
    if (loops.length < 2) return { points: [], halfWidths: [] };

    const outerSamples = this._resampleClosedLoop(loops[0], 240);
    const innerLoops = loops.slice(1);
    let points = [];
    let halfWidths = [];

    for (const outerPoint of outerSamples) {
      const inner = this._nearestPointOnBoundaryLoops(outerPoint, innerLoops);
      if (!inner) continue;
      const width = Math.sqrt(inner.distSq);
      if (!Number.isFinite(width) || width < 0.4) continue;

      points.push(new THREE.Vector3().addVectors(outerPoint, inner.point).multiplyScalar(0.5));
      halfWidths.push(clampNumber(width * 0.5, 3.8, 18));
    }

    ({ points, halfWidths } = this._smoothRoadProfile(points, halfWidths));
    return this._rotateProfileToStartLine({ points, halfWidths });
  }

  _nearestPointOnBoundaryLoops(point, loops) {
    let best = null;

    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const sx = b.x - a.x;
        const sz = b.z - a.z;
        const lenSq = sx * sx + sz * sz;
        if (lenSq < 0.0001) continue;

        const t = clampNumber(((point.x - a.x) * sx + (point.z - a.z) * sz) / lenSq, 0, 1, 0);
        const candidate = new THREE.Vector3(
          a.x + sx * t,
          a.y + (b.y - a.y) * t,
          a.z + sz * t,
        );
        const dx = point.x - candidate.x;
        const dz = point.z - candidate.z;
        const distSq = dx * dx + dz * dz;

        if (!best || distSq < best.distSq) {
          best = { point: candidate, distSq };
        }
      }
    }

    return best;
  }

  _alignBoundaryLoops(outer, inner) {
    const candidates = [inner, [...inner].reverse()];
    let best = candidates[0];
    let bestScore = Infinity;

    for (const candidate of candidates) {
      const start = outer[0];
      let nearest = 0;
      let bestDist = Infinity;
      for (let i = 0; i < candidate.length; i++) {
        const dist = start.distanceToSquared(candidate[i]);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = i;
        }
      }

      const rotated = [...candidate.slice(nearest), ...candidate.slice(0, nearest)];
      const outerSamples = this._resampleClosedLoop(outer, 48);
      const innerSamples = this._resampleClosedLoop(rotated, 48);
      let score = 0;
      for (let i = 0; i < outerSamples.length; i++) {
        score += outerSamples[i].distanceTo(innerSamples[i]);
      }
      if (score < bestScore) {
        bestScore = score;
        best = rotated;
      }
    }

    return best;
  }

  _profileByRadialSweep(roadMeshes) {
    const allVerts = [];
    for (const mesh of roadMeshes) {
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) continue;
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < pos.count; i++) {
        allVerts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
      }
    }
    if (allVerts.length < 20) return { points: [], halfWidths: [] };

    let cx = 0, cz = 0;
    for (const v of allVerts) { cx += v.x; cz += v.z; }
    cx /= allVerts.length;
    cz /= allVerts.length;

    const steps = 180;
    const slices = new Array(steps).fill(null).map(() => []);
    for (const v of allVerts) {
      const angle = Math.atan2(v.z - cz, v.x - cx);
      const idx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * steps);
      const clamped = Math.max(0, Math.min(steps - 1, idx));
      const dist = Math.sqrt((v.x - cx) ** 2 + (v.z - cz) ** 2);
      slices[clamped].push({ point: v, dist });
    }

    let points = [];
    let halfWidths = [];
    for (let i = 0; i < steps; i++) {
      if (slices[i].length < 3) continue;
      slices[i].sort((a, b) => a.dist - b.dist);
      const inner = slices[i][Math.floor(slices[i].length * 0.12)];
      const outer = slices[i][Math.floor(slices[i].length * 0.88)];
      points.push(new THREE.Vector3().addVectors(inner.point, outer.point).multiplyScalar(0.5));
      halfWidths.push(clampNumber((outer.dist - inner.dist) * 0.5, 3.8, 10.5));
    }

    ({ points, halfWidths } = this._smoothRoadProfile(points, halfWidths));
    return this._rotateProfileToStartLine({ points, halfWidths });
  }

  _selectRoadProfileCandidate(candidates) {
    let best = null;

    for (const candidate of candidates) {
      const profile = this._cloneRoadProfile(candidate.profile);
      if (!profile || profile.points.length < 24) continue;

      const refined = this._refineProfileToRoadMesh(profile);
      const hitRatio = refined.meshHits / Math.max(1, profile.points.length);
      const score = hitRatio * 10000 + profile.points.length - refined.maxSegmentLength * 0.25;

      if (!best || score > best.score) {
        best = {
          source: candidate.source,
          profile,
          score,
          meshHits: refined.meshHits,
          total: profile.points.length,
        };
      }
    }

    if (!best) return null;
    console.log(`[TrackManager] Road route selected: ${best.source} (${best.meshHits}/${best.total} mesh hits)`);
    return best.profile;
  }

  _cloneRoadProfile(profile) {
    const points = (profile?.points || [])
      .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.z))
      .map(point => point.clone ? point.clone() : new THREE.Vector3(point.x, point.y || 0, point.z));
    if (points.length < 2) return null;

    const sourceWidths = profile?.halfWidths || [];
    const halfWidths = points.map((_, index) => clampNumber(sourceWidths[index], 3.8, 18, 6));
    return { points, halfWidths };
  }

  _refineProfileToRoadMesh(profile) {
    const points = profile?.points || [];
    const halfWidths = profile?.halfWidths || [];
    if (points.length < 2) return { meshHits: 0, maxSegmentLength: 0 };

    let meshHits = 0;
    let maxSegmentLength = 0;
    const scanDistance = 56;
    const scanStep = 1;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const directY = this.getRoadHeightAtPosition(point);
      if (Number.isFinite(directY)) {
        point.y = directY;
        meshHits++;
      } else if (this._snapProfilePointToRoadMesh(profile, i, scanDistance, scanStep)) {
        const snappedY = this.getRoadHeightAtPosition(point);
        if (Number.isFinite(snappedY)) {
          point.y = snappedY;
          meshHits++;
        }
      }

      const next = points[(i + 1) % points.length];
      maxSegmentLength = Math.max(maxSegmentLength, point.distanceTo(next));
    }

    return { meshHits, maxSegmentLength };
  }

  _snapProfilePointToRoadMesh(profile, index, scanDistance = 56, scanStep = 1) {
    const points = profile?.points || [];
    const point = points[index];
    if (!point) return false;

    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const tx = next.x - previous.x;
    const tz = next.z - previous.z;
    const len = Math.hypot(tx, tz);
    if (!Number.isFinite(len) || len < 0.001) return false;

    const rightX = tz / len;
    const rightZ = -tx / len;
    const hits = [];
    for (let offset = -scanDistance; offset <= scanDistance; offset += scanStep) {
      const y = this.getRoadHeightAtPosition({
        x: point.x + rightX * offset,
        y: point.y,
        z: point.z + rightZ * offset,
      });
      if (Number.isFinite(y)) hits.push({ offset, y });
    }

    if (!hits.length) return false;

    const run = this._selectRoadScanRun(hits, scanStep);
    if (!run?.length) return false;

    const minOffset = run[0].offset;
    const maxOffset = run[run.length - 1].offset;
    const anchor = run[Math.floor(run.length / 2)];
    point.x += rightX * anchor.offset;
    point.z += rightZ * anchor.offset;
    point.y = anchor.y;

    if (profile.halfWidths) {
      profile.halfWidths[index] = clampNumber((maxOffset - minOffset) * 0.5, 3.8, 18, profile.halfWidths[index] || 6);
    }
    return true;
  }

  _selectRoadScanRun(hits, scanStep = 1) {
    if (!hits.length) return null;

    const runs = [];
    let current = [hits[0]];
    const gap = Math.max(scanStep * 1.6, 0.01);
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].offset - hits[i - 1].offset <= gap) {
        current.push(hits[i]);
      } else {
        runs.push(current);
        current = [hits[i]];
      }
    }
    runs.push(current);

    return runs.sort((a, b) => {
      const widthA = a[a.length - 1].offset - a[0].offset;
      const widthB = b[b.length - 1].offset - b[0].offset;
      const centerA = Math.abs((a[0].offset + a[a.length - 1].offset) * 0.5);
      const centerB = Math.abs((b[0].offset + b[b.length - 1].offset) * 0.5);
      return (widthB - widthA) || (centerA - centerB);
    })[0];
  }

  _smoothRoadProfile(points, halfWidths) {
    if (points.length < 5) return { points, halfWidths };
    const smoothedPoints = [];
    const smoothedWidths = [];
    const window = 2;
    for (let i = 0; i < points.length; i++) {
      const point = new THREE.Vector3();
      let width = 0;
      let count = 0;
      for (let j = -window; j <= window; j++) {
        const idx = (i + j + points.length) % points.length;
        point.add(points[idx]);
        width += halfWidths[idx];
        count++;
      }
      smoothedPoints.push(point.multiplyScalar(1 / count));
      smoothedWidths.push(width / count);
    }
    return { points: smoothedPoints, halfWidths: smoothedWidths };
  }

  _rotateProfileToStartLine(profile) {
    const { points, halfWidths } = profile;
    if (points.length < 12) return profile;

    let bestIndex = 0;
    let bestScore = -Infinity;
    const window = 5;
    for (let i = 0; i < points.length; i++) {
      const before = points[(i - window + points.length) % points.length];
      const current = points[i];
      const after = points[(i + window) % points.length];
      const inDir = new THREE.Vector3().subVectors(current, before);
      const outDir = new THREE.Vector3().subVectors(after, current);
      if (inDir.lengthSq() < 0.001 || outDir.lengthSq() < 0.001) continue;
      const turn = inDir.angleTo(outDir);
      const score = -turn * 12 + Math.min(halfWidths[i], 9) + inDir.length() * 0.02 + outDir.length() * 0.02;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return {
      points: [...points.slice(bestIndex), ...points.slice(0, bestIndex)],
      halfWidths: [...halfWidths.slice(bestIndex), ...halfWidths.slice(0, bestIndex)],
    };
  }

  _resampleClosedLoop(points, count) {
    if (points.length === 0) return [];
    const clean = [...points];
    if (clean.length > 1 && clean[0].distanceToSquared(clean[clean.length - 1]) < 0.0001) {
      clean.pop();
    }

    const cumulative = [0];
    let total = 0;
    for (let i = 0; i < clean.length; i++) {
      const a = clean[i];
      const b = clean[(i + 1) % clean.length];
      total += a.distanceTo(b);
      cumulative.push(total);
    }

    const samples = [];
    let segment = 0;
    for (let i = 0; i < count; i++) {
      const target = (i / count) * total;
      while (segment < clean.length - 1 && cumulative[segment + 1] < target) segment++;
      const a = clean[segment];
      const b = clean[(segment + 1) % clean.length];
      const span = Math.max(cumulative[segment + 1] - cumulative[segment], 0.0001);
      samples.push(new THREE.Vector3().lerpVectors(a, b, (target - cumulative[segment]) / span));
    }
    return samples;
  }

  _signedAreaXZ(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.z - b.x * a.z;
    }
    return area * 0.5;
  }

  _extractRoadPath() {
    return this._extractRoadProfile().points;
  }

  _generateRoadBoundaryColliders(profile) {
    this._roadCollisionProfile = this._buildContinuousRoadCollisionProfile(profile);
    // Road surface/shoulder queries are continuous along the extracted center path.
    // Do not emit invisible segmented edge boxes: wheel rays can catch their seams.
    return [];
  }

  _profileFromTrackData(trackData) {
    const points = (trackData?.roadCenterPoints || [])
      .map((p) => new THREE.Vector3(p.x, p.y || 0, p.z));
    if (points.length < 2) return null;

    return {
      points,
      halfWidths: new Array(points.length).fill(6),
    };
  }

  _buildContinuousRoadCollisionProfile(profile) {
    const points = profile?.points || [];
    if (points.length < 2) return null;

    return {
      points,
      halfWidths: profile.halfWidths || new Array(points.length).fill(6),
      roadShoulder: 0.45,
    };
  }

  _addRaceMarkers(profile, checkpoints) {
    if (!profile.points.length || !checkpoints.length) return;

    const finish = checkpoints[0];
    const width = clampNumber(finish.width || 12, 8, 18);
    const group = new THREE.Group();
    group.name = 'generated-start-finish';
    const worldPos = new THREE.Vector3(finish.x, finish.y + 0.035, finish.z);
    group.position.copy(this.trackRoot.worldToLocal(worldPos.clone()));
    group.rotation.y = finish.yaw || 0;

    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const dark = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });
    const cells = 10;
    const cellWidth = width / cells;
    const rowDepth = 0.55;
    for (let x = 0; x < cells; x++) {
      for (let z = 0; z < 2; z++) {
        const mat = (x + z) % 2 === 0 ? white : dark;
        const tile = new THREE.Mesh(new THREE.BoxGeometry(cellWidth, 0.035, rowDepth), mat);
        tile.position.set(-width / 2 + cellWidth * (x + 0.5), 0, (z - 0.5) * rowDepth);
        tile.name = 'finish-checker';
        group.add(tile);
      }
    }

    this.roadGroup.add(group);
  }

  _extractSceneryColliders() {
    const candidates = [];
    this.propGroup.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.updateWorldMatrix(true, false);
      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      if (!this._isUsefulSceneryCollider(mesh, bbox, size)) return;

      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const materialName = material?.name || '';
      const label = `${mesh.name || ''} ${mesh.parent?.name || ''} ${materialName}`.toLowerCase();
      const footprint = size.x * size.z;
      const priority = /fence|metaltrim|barrier|wall/i.test(materialName) ? 3
        : /brand|trim/i.test(materialName) ? 2
          : 1;
      candidates.push({ mesh, bbox, size, label, priority, footprint, volume: footprint * size.y });
    });

    candidates.sort((a, b) => (b.priority - a.priority) || (b.volume - a.volume));

    const colliders = [];
    const maxColliders = 96;
    for (const item of candidates) {
      if (colliders.length >= maxColliders) break;
      const size = item.size;
      if (item.footprint > 1600 || Math.max(size.x, size.z) > 95) continue;

      const isLong = size.x > 28 || size.z > 28 || item.footprint > 320;
      const source = /sign|brand|banner|light|lamp|pole/i.test(item.label) ? 'scenery-prop' : 'scenery';
      const next = isLong
        ? this._splitColliderBox(item.bbox, source, item.footprint > 900 ? 28 : 18)
        : [this._colliderFromBox(item.bbox, source)];

      for (const collider of next) {
        if (colliders.length >= maxColliders) break;
        if (collider) colliders.push(collider);
      }
    }

    return colliders;
  }

  _isUsefulSceneryCollider(mesh, bbox, size) {
    if (size.y < 0.45) return false;
    if (size.x < 0.12 && size.z < 0.12) return false;

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const materialName = material?.name || '';
    const label = `${mesh.name || ''} ${mesh.parent?.name || ''} ${materialName}`.toLowerCase();
    if (/grass|sand|pitlane|road|asphalt|white[_-]?line|gravel|nurburg_bottom|trees?|leaf|foliage|sky|cloud/i.test(label)) {
      return false;
    }
    if (/brand|banner/i.test(label) && size.y < 1.2) return false;
    if (!/fence|barrier|wall|guard|rail|metal|building|garage|grandstand|pit|stadium|trim|sign|brand|banner|light|pole/i.test(label)) {
      const footprint = size.x * size.z;
      if (size.y < 2.2 || footprint > 180) return false;
    }

    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const road = this._nearestRoadInfo(center);
    const roadY = road?.point?.y ?? 0;
    if (bbox.max.y < roadY + 0.25) return false;
    if (bbox.min.y > roadY + 18 && size.y < 7.5) return false;
    if (/sign|brand|banner|light|lamp|pole/i.test(label) && bbox.min.y > roadY + 2.6) return false;
    if (road && road.distance < road.halfWidth * 0.82) return false;

    return true;
  }

  _gridCollidersFromMesh(mesh, cellSize, source = 'scenery-cell') {
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return [];

    mesh.updateWorldMatrix(true, false);
    const cells = new Map();
    for (let i = 0; i < pos.count; i++) {
      const point = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
        .applyMatrix4(mesh.matrixWorld);
      const key = `${Math.floor(point.x / cellSize)},${Math.floor(point.z / cellSize)}`;
      let box = cells.get(key);
      if (!box) {
        box = new THREE.Box3();
        cells.set(key, box);
      }
      box.expandByPoint(point);
    }

    const colliders = [];
    for (const box of cells.values()) {
      box.expandByScalar(0.25);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y < 0.45 || (size.x < 0.18 && size.z < 0.18)) continue;

      const center = new THREE.Vector3();
      box.getCenter(center);
      const road = this._nearestRoadInfo(center);
      const roadY = road?.point?.y ?? 0;
      if (box.max.y < roadY + 0.25) continue;
      if (box.min.y > roadY + 18 && size.y < 7.5) continue;
      if (road && road.distance < road.halfWidth * 0.82) continue;

      colliders.push(this._colliderFromBox(box, source));
    }

    return colliders;
  }

  _colliderFromBox(box, source) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    return {
      source,
      position: { x: center.x, y: center.y, z: center.z },
      halfExtents: {
        x: Math.max(0.3, size.x * 0.5),
        y: Math.max(0.35, size.y * 0.5),
        z: Math.max(0.3, size.z * 0.5),
      },
      rotationY: 0,
    };
  }

  _nearestRoadInfo(pos) {
    return this.getRoadInfoAtPosition(pos);
  }

  /**
   * Generate spawn points from road path.
   */
  _generateSpawnPoints(roadPoints, profile = null) {
    if (roadPoints.length < 4) return [{ x: 0, y: 3, z: 0, yaw: 0 }];
    const spawns = [];
    const start = roadPoints[0];
    const next = roadPoints[1];
    const yaw = Math.atan2(next.x - start.x, next.z - start.z);
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const lane = Math.min((profile?.halfWidths?.[0] || 6) * 0.28, 2.0);
    const grid = [
      { lane: 0, back: 5 },
      { lane: -lane, back: 10 },
      { lane, back: 10 },
      { lane: -lane, back: 15 },
      { lane, back: 15 },
      { lane: 0, back: 20 },
    ];

    for (const slot of grid) {
      const pos = new THREE.Vector3(start.x, start.y, start.z)
        .addScaledVector(forward, -slot.back)
        .addScaledVector(right, slot.lane);
      spawns.push({ x: pos.x, y: pos.y + 0.65, z: pos.z, yaw });
    }
    return spawns;
  }

  /**
   * Generate checkpoints along the road path.
   */
  _generateCheckpoints(roadPoints, profile = null) {
    if (roadPoints.length < 4) return [];
    const count = Math.min(14, Math.max(8, Math.round(roadPoints.length / 20)));
    const checkpoints = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / count) * roadPoints.length) % roadPoints.length;
      const nextIdx = (idx + 1) % roadPoints.length;
      const pt = roadPoints[idx];
      const next = roadPoints[nextIdx];
      const yaw = Math.atan2(next.x - pt.x, next.z - pt.z);
      const width = (profile?.halfWidths?.[idx] || 6) * 2;
      checkpoints.push({
        index: i,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        yaw,
        width,
        radius: clampNumber(width * (i === 0 ? 0.9 : 0.75), i === 0 ? 9 : 7, i === 0 ? 16 : 13),
        isFinishLine: i === 0,
      });
    }
    return checkpoints;
  }

  /**
   * Build simplified box colliders from barrier mesh bounding boxes.
   */
  _extractBarrierColliders() {
    const colliders = [];
    const barrierMeshes = this.barrierGroup.children.filter(c => c.isMesh);
    for (const mesh of barrierMeshes) {
      mesh.updateWorldMatrix(true, false);
      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      if (size.x < 0.2 && size.y < 0.2 && size.z < 0.2) continue;
      if (size.x > 200 || size.z > 200) continue; // skip huge meshes (terrain)

      const area = size.x * size.z;
      const isLargeOrCurved = size.x > 18 || size.z > 18 || area > 90;
      const vertexCount = mesh.geometry.getAttribute('position')?.count || 0;
      let pieces = [this._colliderFromBox(bbox, 'barrier')];
      if (isLargeOrCurved) {
        pieces = vertexCount > 80
          ? this._gridCollidersFromMesh(mesh, 8, 'barrier-cell')
          : this._splitColliderBox(bbox, 'barrier-cell', 8);
        if (pieces.length === 0) pieces = this._splitColliderBox(bbox, 'barrier-cell', 8);
      }

      for (const collider of pieces) {
        if (collider) colliders.push(collider);
      }
    }
    return colliders;
  }

  _splitColliderBox(box, source, maxSegmentLength = 8) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const axis = size.x >= size.z ? 'x' : 'z';
    const total = Math.max(size[axis], 0.001);
    const count = Math.max(1, Math.min(16, Math.ceil(total / maxSegmentLength)));
    if (count === 1) return [this._colliderFromBox(box, source)];

    const colliders = [];
    for (let i = 0; i < count; i++) {
      const min = box.min.clone();
      const max = box.max.clone();
      const a = box.min[axis] + (total * i) / count;
      const b = box.min[axis] + (total * (i + 1)) / count;
      min[axis] = a;
      max[axis] = b;
      colliders.push(this._colliderFromBox(new THREE.Box3(min, max), source));
    }
    return colliders;
  }

  /**
   * Get physics colliders generated from the track model.
   */
  getBarrierColliders() {
    return this._barrierColliders || [];
  }

  getCameraColliders() {
    if (this._cameraColliders) return this._cameraColliders;

    this._cameraColliders = (this._barrierColliders || []).filter((collider) => {
      if (collider.source === 'road-edge') return false;
      if (collider.ignoreCamera || this._isSuspendedCameraCollider(collider)) return false;
      const half = collider.halfExtents || {};
      const pos = collider.position || {};
      const top = (pos.y || 0) + (half.y || 0);
      return top > 0.75 && (half.y || 0) > 0.25;
    });
    return this._cameraColliders;
  }

  getCameraOccluderMeshes() {
    if (this._cameraOccluderMeshes) return this._cameraOccluderMeshes;

    const occluders = [];
    const groups = [this.barrierGroup, this.buildingGroup, this.propGroup, this.terrainGroup];
    for (const group of groups) {
      group.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;
        if (!this._isCameraOccluderMesh(mesh)) return;
        occluders.push(mesh);
      });
    }

    this._cameraOccluderMeshes = occluders;
    return occluders;
  }

  getCameraGroundMeshes() {
    if (this._cameraGroundMeshes) return this._cameraGroundMeshes;

    const meshes = [];
    const groups = [
      { group: this.roadGroup, force: true },
      { group: this.terrainGroup, force: false },
      { group: this.propGroup, force: false },
      { group: this.buildingGroup, force: false },
    ];
    for (const { group, force } of groups) {
      group.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;
        if (this._isEditorRoadVisualOnlyMesh(mesh)) return;
        if (!force && !this._isCameraGroundMesh(mesh)) return;
        this._prepareCameraSurfaceMesh(mesh);
        meshes.push(mesh);
      });
    }

    this._cameraGroundMeshes = meshes;
    return meshes;
  }

  _isEditorRoadVisualOnlyMesh(mesh) {
    if (!mesh?.isMesh) return false;
    let node = mesh;
    let insideEditorRoad = false;
    while (node) {
      if (node.userData?.editorRoad) {
        insideEditorRoad = true;
        break;
      }
      node = node.parent;
    }
    return insideEditorRoad && mesh.userData?.editorRoadSurface !== true;
  }

  _isCameraGroundMesh(mesh) {
    mesh.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    if (size.x * size.z < 0.8) return false;

    const name = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
    const materialNames = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .map(material => material?.name || '')
      .join(' ');
    const label = `${name} ${materialNames}`.toLowerCase();

    if (size.y > 3.0 && !/road|track|surface|asphalt|pavement|terrain|ground|grass|sand|dirt/i.test(label)) {
      return false;
    }

    if (/barrier|fence|wall|guardrail|railing|sign|brand|light|tree|palm|sky|cloud/i.test(label)) {
      return false;
    }

    return /road|track|surface|asphalt|pavement|terrain|ground|grass|sand|dirt|roadtrim|pitlanetrim/i.test(label) ||
      (size.y < 1.2 && size.x * size.z > 3);
  }

  _prepareCameraSurfaceMesh(mesh) {
    if (mesh.userData.cameraSurfacePrepared) return;
    mesh.userData.cameraSurfacePrepared = true;
    mesh.userData.cameraSurface = true;
  }

  _isCameraOccluderMesh(mesh) {
    mesh.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    if (size.x < 0.15 && size.y < 0.15 && size.z < 0.15) return false;
    if (bbox.max.y < 0.75) return false;
    if (size.y < 0.55 && Math.max(size.x, size.z) > 3) return false;

    const name = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
    const materialNames = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .map(material => material?.name || '')
      .join(' ');
    const label = `${name} ${materialNames}`.toLowerCase();
    if (this._isSuspendedCameraMesh(bbox, size, label)) return false;

    if (/finish-checker|generated-start-finish|road|asphalt|roadtrim|pitlanetrim|grass|sand/i.test(label) && size.y < 1.2) {
      return false;
    }

    return /barrier|fence|wall|guardrail|railing|building|stadium|grandstand|pit|garage|terrain|hill|mount|rock|brand|sign|metal|light|tree|palm/i.test(label) ||
      size.y > 1.4 ||
      (size.y > 0.8 && size.x * size.z > 1.2);
  }

  _isSuspendedCameraCollider(collider) {
    const half = collider?.halfExtents || {};
    const pos = collider?.position || {};
    const bottom = (pos.y || 0) - (half.y || 0);
    const roadY = this._estimateNearbyRoadY(pos);
    const footprint = Math.max(0, (half.x || 0) * 2) * Math.max(0, (half.z || 0) * 2);
    const minSide = Math.min(Math.max(0, (half.x || 0) * 2), Math.max(0, (half.z || 0) * 2));
    const height = Math.max(0, (half.y || 0) * 2);

    // Decorative overhead objects should not shove the camera away. Solid
    // buildings still pass because they normally begin near ground level or
    // have a much larger footprint/height.
    return bottom > roadY + 2.4 && (footprint < 90 || minSide < 0.75 || height < 5.5);
  }

  _estimateNearbyRoadY(pos) {
    const points = this._roadProfile?.points || this._trackData?.roadCenterPoints || [];
    if (!points.length) return 0;

    const px = Number(pos?.x) || 0;
    const pz = Number(pos?.z) || 0;
    let best = points[0];
    let bestDist = Infinity;
    const stride = Math.max(1, Math.floor(points.length / 80));
    for (let i = 0; i < points.length; i += stride) {
      const point = points[i];
      const dx = px - point.x;
      const dz = pz - point.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = point;
      }
    }
    return Number.isFinite(best?.y) ? best.y : 0;
  }

  _isSuspendedCameraMesh(bbox, size, label = '') {
    const decorative = /sign|brand|banner|billboard|board|light|lamp|pole|wire|cable|traffic|gantry|panel|baloo?ns?/i.test(label);
    if (!decorative) return false;

    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const road = this._nearestRoadInfo(center);
    const roadY = road?.point?.y ?? 0;
    const footprint = size.x * size.z;
    const minSide = Math.min(size.x, size.z);

    return bbox.min.y > roadY + 2.2 && (footprint < 140 || minSide < 0.9 || size.y < 6.5);
  }

  /**
   * Get the surface type at a given world position.
   * @param {{x:number, y:number, z:number}} pos
   * @returns {string} - e.g. 'asphalt', 'wet_asphalt', 'dirt'
   */
  getSurfaceAtPosition(pos) {
    const roadInfo = this.getRoadInfoAtPosition(pos);
    const roadShoulder = this._roadCollisionProfile?.roadShoulder ?? 0.45;
    const onRoad = roadInfo
      ? roadInfo.onModelRoad || roadInfo.distance <= (roadInfo.halfWidth || 6) + roadShoulder
      : true;

    for (const zone of this._surfaceZones) {
      const dx = pos.x - zone.x;
      const dz = pos.z - zone.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < zone.radius * zone.radius) {
        if (zone.type === 'wet_asphalt' && !onRoad) continue;
        return zone.type;
      }
    }
    return onRoad ? 'asphalt' : 'grass';
  }

  /**
   * Check collision with track barriers. Returns collision info if hit.
   * @param {{x:number, y:number, z:number}} pos
   * @param {number} carRadius
   * @returns {{ hit: boolean, normal: {x:number, z:number}, penetration: number }|null}
   */
  checkBarrierCollision(pos, carRadius = 1.0) {
    for (const barrier of this._barrierColliders) {
      const bx = barrier.position.x;
      const bz = barrier.position.z;
      const dx = pos.x - bx;
      const dz = pos.z - bz;

      // Rotate into barrier local space for OBB check
      const cos = Math.cos(-barrier.rotationY);
      const sin = Math.sin(-barrier.rotationY);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;

      const hw = barrier.halfExtents.x + carRadius;
      const hd = barrier.halfExtents.z + carRadius;

      if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
        // Compute penetration and normal
        const penX = hw - Math.abs(lx);
        const penZ = hd - Math.abs(lz);

        if (penX < penZ) {
          const sign = lx > 0 ? 1 : -1;
          return {
            hit: true,
            normal: { x: cos * sign, z: -sin * sign },
            penetration: penX,
          };
        } else {
          const sign = lz > 0 ? 1 : -1;
          return {
            hit: true,
            normal: { x: sin * sign, z: cos * sign },
            penetration: penZ,
          };
        }
      }
    }
    return null;
  }

  /**
   * Get checkpoint data for TimerSystem.
   */
  getCheckpoints() {
    return this._trackData?.checkpoints || [];
  }

  /**
   * Get spawn point data.
   */
  getSpawnPoints() {
    return this._trackData?.spawnPoints || [{ x: 0, y: 2, z: 0, yaw: 0 }];
  }

  /**
   * Get road center-line points for AI navigation.
   */
  getRoadCenterPoints() {
    const base = this._trackData?.roadCenterPoints || [];
    const extras = (this._editorRoadProfiles || [])
      .filter(profile => profile.generateAiLine !== false)
      .flatMap(profile => profile.points || []);
    return extras.length ? [...base, ...extras] : base;
  }

  setEditorRoadProfiles(profiles = []) {
    this._editorRoadProfiles = Array.isArray(profiles)
      ? profiles
        .map(profile => ({
          ...profile,
          points: Array.isArray(profile?.points) ? profile.points : [],
          halfWidths: Array.isArray(profile?.halfWidths) ? profile.halfWidths : [],
          closed: profile?.closed === true,
          generateAiLine: profile?.generateAiLine !== false,
        }))
        .filter(profile => profile.points.length >= 2)
      : [];
    this.invalidateRoadCaches();
  }

  invalidateRoadCaches() {
    this._cameraGroundMeshes = null;
    this._resetRoadHeightSampling();
  }

  getFastRoadHeightAtPosition(pos) {
    const info = this.getRoadInfoAtPosition(pos, { preciseHeight: false });
    return Number.isFinite(info?.surfaceY) ? info.surfaceY : null;
  }

  getRoadHeightAtPosition(pos) {
    if (!pos) return null;
    const px = Number(pos.x);
    const py = Number(pos.y);
    const pz = Number(pos.z);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;

    const yBucket = Number.isFinite(py) ? Math.round(py / 8) : 'top';
    const key = `${Math.round(px * 2)},${Math.round(pz * 2)},${yBucket}`;
    if (this._roadHeightCache.has(key)) return this._roadHeightCache.get(key);

    const sampled = this._sampleRoadHeightAtPosition(px, py, pz);
    if (Number.isFinite(sampled)) {
      this._rememberRoadHeight(key, sampled);
      return sampled;
    }
    return null;
  }

  _sampleRoadHeightAtPosition(px, py, pz) {
    const gridHit = this._sampleRoadSurfaceGrid(px, py, pz);
    if (Number.isFinite(gridHit)) return gridHit;

    const meshes = this._getRoadHeightMeshes();
    if (meshes.length === 0) return null;

    const bounds = this._getRoadHeightBounds();
    if (!bounds || !Number.isFinite(bounds.min.y) || !Number.isFinite(bounds.max.y)) return null;

    const raycaster = this._roadHeightRaycaster;
    const down = new THREE.Vector3(0, -1, 0);
    const cast = (originY, far) => {
      raycaster.near = 0;
      raycaster.far = far;
      raycaster.set(new THREE.Vector3(px, originY, pz), down);
      const hits = raycaster.intersectObjects(meshes, false);
      return hits[0]?.point?.y;
    };

    if (Number.isFinite(py)) {
      const localOriginY = py + 18;
      const localHit = cast(localOriginY, 46);
      if (Number.isFinite(localHit)) return localHit;
    }

    const topOriginY = bounds.max.y + 50;
    return cast(topOriginY, Math.max(80, topOriginY - bounds.min.y + 20));
  }

  _sampleRoadSurfaceGrid(px, py, pz) {
    const sampler = this._getRoadSurfaceSampler();
    if (!sampler || sampler.triangles.length === 0) return null;

    const ix = Math.floor((px - sampler.minX) / sampler.cellSize);
    const iz = Math.floor((pz - sampler.minZ) / sampler.cellSize);
    let best = null;
    const seen = new Set();

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = sampler.cells.get(`${ix + dx},${iz + dz}`);
        if (!bucket) continue;
        for (const triIndex of bucket) {
          if (seen.has(triIndex)) continue;
          seen.add(triIndex);
          const tri = sampler.triangles[triIndex];
          if (px < tri.minX || px > tri.maxX || pz < tri.minZ || pz > tri.maxZ) continue;

          const bary = this._barycentricXZ(px, pz, tri);
          if (!bary) continue;
          const y = bary.a * tri.y1 + bary.b * tri.y2 + bary.c * tri.y3;
          if (!Number.isFinite(y)) continue;

          const score = Number.isFinite(py) ? Math.abs(y - py) : -y;
          if (!best || score < best.score) best = { y, score };
        }
      }
    }

    return best ? best.y : null;
  }

  _getRoadSurfaceSampler() {
    if (this._roadSurfaceSampler) return this._roadSurfaceSampler;

    const meshes = this._getRoadHeightMeshes();
    if (meshes.length === 0) return null;

    const triangles = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (const mesh of meshes) {
      const position = mesh.geometry?.getAttribute?.('position');
      if (!position?.count) continue;
      const index = mesh.geometry.index;
      const readIndex = (i) => index ? index.getX(i) : i;
      const count = index ? index.count : position.count;
      mesh.updateWorldMatrix(true, false);

      for (let i = 0; i < count - 2; i += 3) {
        const ia = readIndex(i);
        const ib = readIndex(i + 1);
        const ic = readIndex(i + 2);
        a.set(position.getX(ia), position.getY(ia), position.getZ(ia)).applyMatrix4(mesh.matrixWorld);
        b.set(position.getX(ib), position.getY(ib), position.getZ(ib)).applyMatrix4(mesh.matrixWorld);
        c.set(position.getX(ic), position.getY(ic), position.getZ(ic)).applyMatrix4(mesh.matrixWorld);

        ab.subVectors(b, a);
        ac.subVectors(c, a);
        normal.crossVectors(ab, ac);
        const normalLen = normal.length();
        if (normalLen < 0.0001) continue;
        normal.multiplyScalar(1 / normalLen);
        if (Math.abs(normal.y) < 0.12) continue;

        const tri = {
          x1: a.x, y1: a.y, z1: a.z,
          x2: b.x, y2: b.y, z2: b.z,
          x3: c.x, y3: c.y, z3: c.z,
          minX: Math.min(a.x, b.x, c.x) - 0.001,
          maxX: Math.max(a.x, b.x, c.x) + 0.001,
          minZ: Math.min(a.z, b.z, c.z) - 0.001,
          maxZ: Math.max(a.z, b.z, c.z) + 0.001,
        };
        triangles.push(tri);
        minX = Math.min(minX, tri.minX);
        maxX = Math.max(maxX, tri.maxX);
        minZ = Math.min(minZ, tri.minZ);
        maxZ = Math.max(maxZ, tri.maxZ);
      }
    }

    if (!triangles.length || !Number.isFinite(minX) || !Number.isFinite(maxX)) {
      this._roadSurfaceSampler = { triangles: [], cells: new Map(), minX: 0, minZ: 0, cellSize: 8 };
      return this._roadSurfaceSampler;
    }

    const footprint = Math.max(maxX - minX, maxZ - minZ);
    const cellSize = clampNumber(footprint / 96, 4, 16, 8);
    const cells = new Map();
    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      const ix0 = Math.floor((tri.minX - minX) / cellSize);
      const ix1 = Math.floor((tri.maxX - minX) / cellSize);
      const iz0 = Math.floor((tri.minZ - minZ) / cellSize);
      const iz1 = Math.floor((tri.maxZ - minZ) / cellSize);
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const key = `${ix},${iz}`;
          let bucket = cells.get(key);
          if (!bucket) {
            bucket = [];
            cells.set(key, bucket);
          }
          bucket.push(i);
        }
      }
    }

    this._roadSurfaceSampler = { triangles, cells, minX, minZ, cellSize };
    console.log(`[TrackManager] Road surface sampler: ${triangles.length} triangles, ${cells.size} cells`);
    return this._roadSurfaceSampler;
  }

  _barycentricXZ(px, pz, tri) {
    const denom = (tri.z2 - tri.z3) * (tri.x1 - tri.x3) + (tri.x3 - tri.x2) * (tri.z1 - tri.z3);
    if (Math.abs(denom) < 0.000001) return null;

    const a = ((tri.z2 - tri.z3) * (px - tri.x3) + (tri.x3 - tri.x2) * (pz - tri.z3)) / denom;
    const b = ((tri.z3 - tri.z1) * (px - tri.x3) + (tri.x1 - tri.x3) * (pz - tri.z3)) / denom;
    const c = 1 - a - b;
    const epsilon = -0.0008;
    return a >= epsilon && b >= epsilon && c >= epsilon ? { a, b, c } : null;
  }

  _getRoadHeightMeshes() {
    if (this._roadHeightMeshes) return this._roadHeightMeshes;
    const meshes = [];
    this.roadGroup.traverse((mesh) => {
      if (this._isEditorRoadVisualOnlyMesh(mesh)) return;
      if (mesh.isMesh && mesh.geometry && mesh.visible !== false) meshes.push(mesh);
    });
    this._roadHeightMeshes = meshes;
    return this._roadHeightMeshes;
  }

  _getRoadHeightBounds() {
    if (this._roadHeightBounds) return this._roadHeightBounds;
    const meshes = this._getRoadHeightMeshes();
    if (meshes.length === 0) return null;

    const bounds = new THREE.Box3();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      bounds.expandByObject(mesh);
    }
    this._roadHeightBounds = bounds;
    return bounds;
  }

  _rememberRoadHeight(key, value) {
    const maxEntries = 8000;
    this._roadHeightCache.set(key, value);
    this._roadHeightCacheKeys.push(key);
    if (this._roadHeightCacheKeys.length > maxEntries) {
      const stale = this._roadHeightCacheKeys.shift();
      this._roadHeightCache.delete(stale);
    }
  }

  _resetRoadHeightSampling() {
    this._roadHeightMeshes = null;
    this._roadHeightBounds = null;
    this._roadSurfaceSampler = null;
    this._roadHeightCache.clear();
    this._roadHeightCacheKeys.length = 0;
  }

  getRoadInfoAtPosition(pos, options = {}) {
    if (!pos) return null;
    const profiles = [];
    if ((this._roadProfile?.points || this._trackData?.roadCenterPoints || []).length >= 2) {
      profiles.push({
        source: 'track',
        points: this._roadProfile?.points || this._trackData?.roadCenterPoints || [],
        halfWidths: this._roadProfile?.halfWidths || [],
        closed: this._roadProfile?.closed !== false,
      });
    }
    for (const profile of this._editorRoadProfiles || []) {
      if ((profile.points || []).length >= 2) profiles.push(profile);
    }
    if (!profiles.length) return null;

    let best = null;
    for (const profile of profiles) {
      const info = this._nearestRoadInfoForProfile(profile, pos, options);
      if (info && (!best || info.distSq < best.distSq)) best = info;
    }
    return best;
  }

  _nearestRoadInfoForProfile(profile, pos, options = {}) {
    const points = profile?.points || [];
    if (points.length < 2 || !pos) return null;

    const halfWidths = profile?.halfWidths || [];
    const px = Number(pos.x) || 0;
    const pz = Number(pos.z) || 0;
    const closed = profile?.closed !== false;
    const segmentCount = closed ? points.length : points.length - 1;
    let best = null;

    for (let i = 0; i < segmentCount; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const lenSq = sx * sx + sz * sz;
      if (lenSq < 0.0001) continue;

      const t = clampNumber(((px - a.x) * sx + (pz - a.z) * sz) / lenSq, 0, 1);
      const x = a.x + sx * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + sz * t;
      const dx = px - x;
      const dz = pz - z;
      const distSq = dx * dx + dz * dz;

      if (!best || distSq < best.distSq) {
        const len = Math.sqrt(lenSq);
        const yaw = Math.atan2(sx, sz);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        const wa = halfWidths[i] || 6;
        const wb = halfWidths[(i + 1) % points.length] || wa;
        best = {
          source: profile.source || 'track',
          roadId: profile.id || null,
          index: i,
          nextIndex: (i + 1) % points.length,
          t,
          progress: i + t,
          point: new THREE.Vector3(x, y, z),
          yaw,
          tangent: new THREE.Vector3(sx / len, 0, sz / len),
          right: new THREE.Vector3(rightX, 0, rightZ),
          lateral: dx * rightX + dz * rightZ,
          halfWidth: wa + (wb - wa) * t,
          distance: Math.sqrt(distSq),
          distSq,
        };
      }
    }

    if (best) {
      const surfaceY = options?.preciseHeight === true
        ? this.getRoadHeightAtPosition({ x: px, y: Number(pos.y), z: pz })
        : null;
      if (Number.isFinite(surfaceY)) {
        best.surfaceY = surfaceY;
        best.onModelRoad = true;
        best.point.y = surfaceY;
      } else {
        best.surfaceY = best.point.y;
        const shoulder = this._roadCollisionProfile?.roadShoulder ?? 0.45;
        best.onModelRoad = best.distance <= (best.halfWidth || 6) + shoulder;
      }
    }

    return best;
  }

  /**
   * Get surface zones data.
   */
  getSurfaceZones() {
    return this._surfaceZones;
  }

  getRampZones() {
    return this._trackData?.rampZones || [];
  }

  // ==================== Internal ====================

  async _loadAssetPaths() {
    const cached = this._loader.get('asset-paths');
    if (cached) return cached;

    try {
      const paths = await this._loader._loadJSON('./config/asset-path.json');
      this._loader.loaded.set('asset-paths', paths);
      return paths;
    } catch {
      return { models: { tracks: {}, props: {} }, textures: {}, audio: {} };
    }
  }

  async _loadTrackConfig() {
    try {
      const cfg = this._loader.get('tracks') || await this._loader._loadJSON('./config/tracks.json');
      if (cfg && !this._loader.get('tracks')) this._loader.loaded.set('tracks', cfg);
      return Array.isArray(cfg?.tracks) ? cfg.tracks : [];
    } catch {
      return [];
    }
  }

  _disposeTrack() {
    if (this._builder) {
      this._builder._clear();
    }
    const groups = [
      this.roadGroup, this.barrierGroup, this.buildingGroup,
      this.propGroup, this.terrainGroup, this.skyGroup,
    ];
    for (const group of groups) {
      while (group.children.length > 0) {
        disposeMesh(group.children[0]);
      }
    }
    this.currentTrackId = null;
    this._trackData = null;
    this._surfaceZones = [];
    this._barrierColliders = [];
    this._editorRoadProfiles = [];
    this._roadProfile = null;
    this._roadCollisionProfile = null;
    this._sceneryColliders = [];
    this._cameraColliders = null;
    this._cameraOccluderMeshes = null;
    this._cameraGroundMeshes = null;
    this._resetRoadHeightSampling();
    this.trackRoot.position.set(0, 0, 0);
    this.trackRoot.rotation.set(0, 0, 0);
    this.trackRoot.scale.set(1, 1, 1);
  }

  _clearVisualGroups() {
    const groups = [
      this.roadGroup, this.barrierGroup, this.buildingGroup,
      this.propGroup, this.terrainGroup, this.skyGroup,
    ];
    for (const group of groups) {
      while (group.children.length > 0) {
        disposeMesh(group.children[0]);
      }
    }
    this._trackData = null;
    this._surfaceZones = [];
    this._barrierColliders = [];
    this._editorRoadProfiles = [];
    this._roadProfile = null;
    this._roadCollisionProfile = null;
    this._sceneryColliders = [];
    this._cameraColliders = null;
    this._cameraOccluderMeshes = null;
    this._cameraGroundMeshes = null;
    this._resetRoadHeightSampling();
    this.trackRoot.position.set(0, 0, 0);
    this.trackRoot.rotation.set(0, 0, 0);
    this.trackRoot.scale.set(1, 1, 1);
  }

  _normalizeTrackData(data, fallback) {
    const normalized = { ...fallback, ...data };
    normalized.roadCenterPoints = this._toVectorPoints(data.roadCenterPoints || data.routePoints || fallback.roadCenterPoints);
    normalized.spawnPoints = data.spawnPoints || fallback.spawnPoints || [];
    normalized.checkpoints = data.checkpoints || fallback.checkpoints || [];
    normalized.surfaceZones = data.surfaceZones || fallback.surfaceZones || [];
    normalized.rampZones = data.rampZones || fallback.rampZones || [];
    return normalized;
  }

  _toVectorPoints(points = []) {
    return points.map((point) => {
      if (point?.isVector3) return point.clone();
      if (Array.isArray(point)) return new THREE.Vector3(point[0] || 0, point[1] || 0, point[2] || 0);
      return new THREE.Vector3(point?.x || 0, point?.y || 0, point?.z || 0);
    });
  }

  dispose() {
    this._disposeTrack();
    if (this._builder) {
      this._builder.dispose();
      this._builder = null;
    }
    for (const [id, model] of this._loadedPropModels) {
      disposeMesh(model);
    }
    this._loadedPropModels.clear();
    if (this.trackRoot.parent) {
      this.trackRoot.parent.remove(this.trackRoot);
    }
  }
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
