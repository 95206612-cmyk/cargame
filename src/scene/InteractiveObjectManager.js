import * as THREE from 'three';

const STORAGE_KEY = 'cargame_level_editor_v1';

const ROAD_PROFILE_TYPES = {
  asphalt_2lane: {
    label: '沥青双车道',
    color: 0x2f3438,
    edgeColor: 0xd7d0b7,
    roughness: 0.82,
  },
  concrete_service: {
    label: '混凝土道路',
    color: 0x8b9290,
    edgeColor: 0xf0e6bf,
    roughness: 0.9,
  },
  dirt_rally: {
    label: '土路拉力',
    color: 0x8f6540,
    edgeColor: 0xb88b52,
    roughness: 0.96,
  },
};

const ROAD_DEFAULTS = {
  profile: 'asphalt_2lane',
  generationMode: 'module',
  moduleId: 'asphalt_straight',
  moduleSpacing: 7.8,
  moduleScale: 1,
  moduleLateralOffset: 0,
  moduleYOffset: 0.04,
  moduleYawOffset: 0,
  stitchModules: true,
  width: 8,
  segmentLength: 2.5,
  textureScale: 8,
  banking: 0,
  snapToGround: true,
  generateCollision: true,
  generateAiLine: true,
  closed: false,
  layer: 'default',
  note: '',
};

const ROAD_GENERATION_MODES = new Set(['strip', 'module', 'deformModule']);

const TERRAIN_DEFAULTS = {
  width: 160,
  depth: 160,
  segmentsX: 32,
  segmentsZ: 32,
  baseHeight: -0.04,
  color: 0x52724a,
  roughness: 0.96,
  metalness: 0,
  generateCollision: true,
  visible: true,
  layer: 'default',
  note: '',
};

const DEFAULT_ROAD_MODULES = {
  asphalt_straight: {
    id: 'asphalt_straight',
    label: '沥青直道模块',
    profile: 'asphalt_2lane',
    url: 'builtin:asphalt',
    length: 8,
    width: 8,
    spacing: 7.8,
    scale: 1,
    yOffset: 0.04,
    yawOffset: 0,
  },
  concrete_straight: {
    id: 'concrete_straight',
    label: '混凝土直道模块',
    profile: 'concrete_service',
    url: 'builtin:concrete',
    length: 8,
    width: 8,
    spacing: 7.8,
    scale: 1,
    yOffset: 0.04,
    yawOffset: 0,
  },
  dirt_straight: {
    id: 'dirt_straight',
    label: '土路直道模块',
    profile: 'dirt_rally',
    url: 'builtin:dirt',
    length: 8,
    width: 7,
    spacing: 7.6,
    scale: 1,
    yOffset: 0.05,
    yawOffset: 0,
  },
};

export const INTERACTIVE_OBJECT_TYPES = {
  traffic_cone: {
    label: '交通锥',
    category: 'breakable',
    baseType: 'traffic_cone',
    color: 0xff7a1a,
    mass: 8,
    durability: 18,
    collisionRadius: 0.85,
    breakable: true,
    snapToGround: true,
    debrisColor: 0xff9d2e,
  },
  barrel: {
    label: '防撞桶',
    category: 'breakable',
    baseType: 'barrel',
    color: 0xd12f2f,
    mass: 28,
    durability: 42,
    collisionRadius: 1.05,
    breakable: true,
    snapToGround: true,
    debrisColor: 0xffc857,
  },
  wood_crate: {
    label: '木箱',
    category: 'breakable',
    baseType: 'wood_crate',
    color: 0x9c6a3c,
    mass: 36,
    durability: 58,
    collisionRadius: 1.15,
    breakable: true,
    snapToGround: true,
    debrisColor: 0xc58a4a,
  },
  tire_stack: {
    label: '轮胎堆',
    category: 'solid',
    baseType: 'tire_stack',
    color: 0x1f2428,
    mass: 48,
    durability: 75,
    collisionRadius: 1.2,
    breakable: false,
    snapToGround: true,
    debrisColor: 0x24292f,
  },
  road_barrier: {
    label: '路障护栏',
    category: 'solid',
    baseType: 'road_barrier',
    color: 0xe7edf2,
    mass: 120,
    durability: 160,
    collisionRadius: 1.85,
    breakable: false,
    snapToGround: true,
    debrisColor: 0xd7dde5,
  },
  breakable_sign: {
    label: '可破坏路牌',
    category: 'breakable',
    baseType: 'breakable_sign',
    color: 0x55d6ff,
    mass: 18,
    durability: 32,
    collisionRadius: 0.9,
    breakable: true,
    snapToGround: true,
    debrisColor: 0x7de3ff,
  },
  boost_pad: {
    label: '加速板',
    category: 'function',
    baseType: 'boost_pad',
    color: 0x2cff9a,
    mass: 0,
    durability: 999,
    collisionRadius: 1.7,
    breakable: false,
    snapToGround: true,
    effect: 'boost',
    debrisColor: 0x2cff9a,
  },
  roadside_building: {
    label: '路边建筑',
    category: 'decorative',
    baseType: 'roadside_building',
    color: 0x6f7f8f,
    mass: 0,
    durability: 999,
    collisionRadius: 5.2,
    breakable: false,
    snapToGround: true,
    debrisColor: 0x8fa0aa,
  },
  tree_cluster: {
    label: '树丛装饰',
    category: 'decorative',
    baseType: 'tree_cluster',
    color: 0x3f7d3f,
    mass: 22,
    durability: 48,
    collisionRadius: 2.1,
    breakable: true,
    snapToGround: true,
    debrisColor: 0x4f8d43,
  },
  lamp_post: {
    label: '路灯',
    category: 'solid',
    baseType: 'lamp_post',
    color: 0xd7dde5,
    mass: 80,
    durability: 120,
    collisionRadius: 0.75,
    breakable: false,
    snapToGround: true,
    debrisColor: 0xb9c2c9,
  },
};

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function cloneVectorLike(value, fallback = { x: 0, y: 0, z: 0 }) {
  return {
    x: Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback.x,
    y: Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback.y,
    z: Number.isFinite(Number(value?.z)) ? Number(value.z) : fallback.z,
  };
}

function distanceXZ(a, b) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dz = (a?.z || 0) - (b?.z || 0);
  return Math.hypot(dx, dz);
}

function normalizeColor(value, fallback = 0xffffff) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/^#/, '0x');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export class InteractiveObjectManager {
  constructor(scene, trackManager, effects = null) {
    this.scene = scene;
    this.trackManager = trackManager;
    this.effects = effects;
    this.group = new THREE.Group();
    this.group.name = 'interactive-objects';
    this.scene.add(this.group);

    this.objects = [];
    this.roads = [];
    this.terrains = [];
    this.roadGroup = new THREE.Group();
    this.roadGroup.name = 'editor-spline-roads';
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'editor-terrains';
    this.currentTrackId = 'city_circuit';
    this._idCounter = 1;
    this._roadIdCounter = 1;
    this._terrainIdCounter = 1;
    this._hitCooldown = new Map();
    this._objectTypes = { ...INTERACTIVE_OBJECT_TYPES };
    this._roadModules = { ...DEFAULT_ROAD_MODULES };
    this._roadModuleCache = new Map();
    this._roadModuleLoads = new Map();
    this._storage = this._loadStorage();
    this._attachRoadGroup();
    this._attachTerrainGroup();
  }

  setTrackManager(trackManager) {
    this.trackManager = trackManager;
    this._attachRoadGroup();
    this._attachTerrainGroup();
    this._syncEditorRoadProfiles();
  }

  setEffects(effects) {
    this.effects = effects;
  }

  loadTrack(trackId = 'city_circuit') {
    this.currentTrackId = String(trackId || 'city_circuit').replace(/-/g, '_');
    this._attachRoadGroup();
    this._attachTerrainGroup();
    this._storage = this._loadStorage();
    this.clear();
    const saved = this._storage.tracks?.[this.currentTrackId];
    const state = this._normalizeTrackEntry(saved);
    for (const data of state.terrains) this.addTerrain(data, { save: false, preserveId: true });
    for (const data of state.roads) this.addRoad(data, { save: false, preserveId: true });
    for (const data of state.objects) this.addObject(data, { save: false, preserveId: true });
    this._idCounter = this.objects.length + 1;
    this._roadIdCounter = this.roads.length + 1;
    this._terrainIdCounter = this.terrains.length + 1;
    this._syncEditorRoadProfiles();
  }

  clear() {
    for (const obj of this.objects) this._disposeObject(obj);
    this.objects = [];
    this.clearRoads();
    this.clearTerrains();
    this._hitCooldown.clear();
  }

  clearRoads() {
    for (const road of this.roads) this._disposeRoad(road);
    this.roads = [];
    this._roadIdCounter = 1;
    this._syncEditorRoadProfiles();
    this._invalidateTrackRoadCaches();
  }

  clearTerrains() {
    for (const terrain of this.terrains) this._disposeTerrain(terrain);
    this.terrains = [];
    this._terrainIdCounter = 1;
    this._invalidateTrackRoadCaches();
  }

  getStorageKey() {
    return STORAGE_KEY;
  }

  getTypes() {
    return Object.entries(this._objectTypes).map(([id, config]) => ({ id, ...config }));
  }

  registerObjectTypes(configs = []) {
    const entries = Array.isArray(configs)
      ? configs.map(item => [item?.id, item])
      : Object.entries(configs || {});

    for (const [rawId, rawConfig] of entries) {
      const id = String(rawId || rawConfig?.id || '').trim();
      if (!id || !rawConfig || typeof rawConfig !== 'object') continue;
      const baseType = this._hasType(rawConfig.baseType)
        ? rawConfig.baseType
        : this._hasType(rawConfig.type)
          ? rawConfig.type
          : this._hasType(id)
            ? id
            : 'traffic_cone';
      const base = this._getTypeConfig(baseType);
      this._objectTypes[id] = {
        ...base,
        ...rawConfig,
        id,
        baseType,
        color: normalizeColor(rawConfig.color, base.color),
        debrisColor: normalizeColor(rawConfig.debrisColor, base.debrisColor),
      };
    }

    return this.getTypes();
  }

  async loadObjectConfig(url = './config/objects.json') {
    if (typeof fetch !== 'function') return { ok: false, error: new Error('当前环境不支持加载物体配置。') };
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return { ok: false, status: response.status };
      const payload = await response.json();
      const configs = Array.isArray(payload) ? payload : payload.objects || payload.types || payload;
      const types = this.registerObjectTypes(configs);
      return { ok: true, count: types.length };
    } catch (err) {
      console.warn('[InteractiveObjectManager] Object config load failed:', err);
      return { ok: false, error: err };
    }
  }

  getObject(id) {
    return this.objects.find(obj => obj.id === id) || null;
  }

  getEditableObjects() {
    return this.objects.map(obj => this.serializeObject(obj));
  }

  getCurrentLayout() {
    return this.getEditableObjects();
  }

  getCurrentEditorState() {
    return {
      version: 4,
      objects: this.getEditableObjects(),
      roads: this.getEditableRoads(),
      terrains: this.getEditableTerrains(),
    };
  }

  getRoadProfiles() {
    return Object.entries(ROAD_PROFILE_TYPES).map(([id, config]) => ({ id, ...config }));
  }

  getRoadModules() {
    return Object.entries(this._roadModules).map(([id, config]) => ({ id, ...config }));
  }

  registerRoadModules(configs = []) {
    const entries = Array.isArray(configs)
      ? configs.map(item => [item?.id, item])
      : Object.entries(configs || {});

    for (const [rawId, rawConfig] of entries) {
      const id = String(rawId || rawConfig?.id || '').trim();
      if (!id || !rawConfig || typeof rawConfig !== 'object') continue;
      const fallback = DEFAULT_ROAD_MODULES[id] || DEFAULT_ROAD_MODULES.asphalt_straight;
      this._roadModules[id] = {
        ...fallback,
        ...rawConfig,
        id,
        label: rawConfig.label || fallback.label || id,
        profile: ROAD_PROFILE_TYPES[rawConfig.profile] ? rawConfig.profile : (fallback.profile || ROAD_DEFAULTS.profile),
        url: String(rawConfig.url || fallback.url || 'builtin:asphalt'),
        length: clamp(rawConfig.length, 1, 40, fallback.length || 8),
        width: clamp(rawConfig.width, 1, 40, fallback.width || 8),
        spacing: clamp(rawConfig.spacing, 0.5, 40, fallback.spacing || fallback.length || 8),
        scale: clamp(rawConfig.scale, 0.05, 20, fallback.scale || 1),
        yOffset: clamp(rawConfig.yOffset, -5, 5, fallback.yOffset || 0),
        yawOffset: clamp(rawConfig.yawOffset, -Math.PI * 2, Math.PI * 2, fallback.yawOffset || 0),
      };
    }

    return this.getRoadModules();
  }

  async loadRoadModuleConfig(url = './config/road-modules.json') {
    if (typeof fetch !== 'function') return { ok: false, error: new Error('当前环境不支持加载道路模块配置。') };
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return { ok: false, status: response.status };
      const payload = await response.json();
      const configs = Array.isArray(payload) ? payload : payload.modules || payload.roadModules || payload;
      const modules = this.registerRoadModules(configs);
      for (const road of this.roads) {
        if (!this._roadModules[road.moduleId]) road.moduleId = this._defaultModuleForProfile(road.profile);
        this._rebuildRoadMesh(road);
      }
      return { ok: true, count: modules.length };
    } catch (err) {
      console.warn('[InteractiveObjectManager] Road module config load failed:', err);
      return { ok: false, error: err };
    }
  }

  getRoad(id) {
    return this.roads.find(road => road.id === id) || null;
  }

  getRoads() {
    return this.roads;
  }

  getEditableRoads() {
    return this.roads.map(road => this.serializeRoad(road));
  }

  getRoadMeshes() {
    const meshes = [];
    for (const road of this.roads) {
      road.mesh?.traverse?.(child => {
        if (child.isMesh && child.userData?.editorRoadSurface) meshes.push(child);
      });
    }
    return meshes;
  }

  getTerrain(id) {
    return this.terrains.find(terrain => terrain.id === id) || null;
  }

  getTerrains() {
    return this.terrains;
  }

  getEditableTerrains() {
    return this.terrains.map(terrain => this.serializeTerrain(terrain));
  }

  getTerrainMeshes() {
    const meshes = [];
    for (const terrain of this.terrains) {
      if (terrain.mesh?.isMesh) meshes.push(terrain.mesh);
    }
    return meshes;
  }

  getTerrainPhysicsMeshes() {
    return this.getTerrainMeshes().filter(mesh => mesh.userData?.editorTerrainCollision !== false);
  }

  getMeshes() {
    const meshes = [];
    for (const obj of this.objects) {
      obj.mesh.traverse(child => {
        if (child.isMesh) meshes.push(child);
      });
    }
    for (const terrain of this.terrains) {
      if (terrain.mesh?.isMesh) meshes.push(terrain.mesh);
    }
    return meshes;
  }

  createPreviewMesh(type = 'traffic_cone') {
    return this._buildMesh({
      id: `preview-${type}`,
      type: this._hasType(type) ? type : 'traffic_cone',
    });
  }

  addObject(data = {}, options = {}) {
    const type = this._resolveTypeId(data.type);
    const defaults = this._getTypeConfig(type);
    const id = options.preserveId && data.id ? String(data.id) : this._makeId(type);
    const position = this._snapPosition(cloneVectorLike(data.position), data.snapToGround ?? defaults.snapToGround);
    const obj = {
      id,
      type,
      position,
      rotationY: clamp(data.rotationY, -Math.PI * 2, Math.PI * 2, 0),
      scale: clamp(data.scale, 0.35, 4, 1),
      snapToGround: data.snapToGround ?? defaults.snapToGround,
      mass: clamp(data.mass, 0, 500, defaults.mass),
      durability: clamp(data.durability, 1, 999, defaults.durability),
      maxDurability: clamp(data.maxDurability ?? data.durability, 1, 999, defaults.durability),
      collisionRadius: clamp(data.collisionRadius, 0.25, 5, defaults.collisionRadius),
      breakable: data.breakable ?? defaults.breakable,
      respawn: Boolean(data.respawn),
      respawnSeconds: clamp(data.respawnSeconds, 1, 120, 12),
      effect: data.effect || defaults.effect || 'none',
      layer: data.layer || 'default',
      note: data.note || '',
      destroyed: Boolean(data.destroyed) && !Boolean(data.respawn),
      respawnTimer: 0,
      mesh: null,
    };

    obj.mesh = this._buildMesh(obj);
    this.group.add(obj.mesh);
    this.objects.push(obj);
    this._applyTransform(obj);
    if (obj.destroyed) obj.mesh.visible = false;
    if (options.save !== false) this.saveCurrentTrack();
    return obj;
  }

  updateObject(id, patch = {}, options = {}) {
    const obj = this.getObject(id);
    if (!obj) return null;
    const prevType = obj.type;
    if (patch.type && this._hasType(patch.type)) obj.type = patch.type;
    if (patch.position) obj.position = this._snapPosition(cloneVectorLike(patch.position, obj.position), patch.snapToGround ?? obj.snapToGround);
    if ('rotationY' in patch) obj.rotationY = clamp(patch.rotationY, -Math.PI * 2, Math.PI * 2, obj.rotationY);
    if ('scale' in patch) obj.scale = clamp(patch.scale, 0.35, 4, obj.scale);
    if ('snapToGround' in patch) obj.snapToGround = Boolean(patch.snapToGround);
    if ('mass' in patch) obj.mass = clamp(patch.mass, 0, 500, obj.mass);
    if ('durability' in patch) {
      obj.durability = clamp(patch.durability, 1, 999, obj.durability);
      obj.maxDurability = obj.durability;
    }
    if ('collisionRadius' in patch) obj.collisionRadius = clamp(patch.collisionRadius, 0.25, 5, obj.collisionRadius);
    if ('breakable' in patch) obj.breakable = Boolean(patch.breakable);
    if ('respawn' in patch) obj.respawn = Boolean(patch.respawn);
    if ('respawnSeconds' in patch) obj.respawnSeconds = clamp(patch.respawnSeconds, 1, 120, obj.respawnSeconds);
    if ('effect' in patch) obj.effect = patch.effect || 'none';
    if ('layer' in patch) obj.layer = patch.layer || 'default';
    if ('note' in patch) obj.note = String(patch.note || '');

    if (obj.snapToGround) obj.position = this._snapPosition(obj.position, true);
    if (prevType !== obj.type) {
      this.group.remove(obj.mesh);
      this._disposeMesh(obj.mesh);
      obj.mesh = this._buildMesh(obj);
      this.group.add(obj.mesh);
    }
    this._applyTransform(obj);
    if (options.save !== false) this.saveCurrentTrack();
    return obj;
  }

  removeObject(id, options = {}) {
    const index = this.objects.findIndex(obj => obj.id === id);
    if (index < 0) return false;
    const [obj] = this.objects.splice(index, 1);
    this._disposeObject(obj);
    if (options.save !== false) this.saveCurrentTrack();
    return true;
  }

  duplicateObject(id, options = {}) {
    const obj = this.getObject(id);
    if (!obj) return null;
    const copy = this.serializeObject(obj);
    copy.id = undefined;
    copy.position = { x: copy.position.x + 2, y: copy.position.y, z: copy.position.z + 2 };
    return this.addObject(copy, options);
  }

  addRoad(data = {}, options = {}) {
    const road = this._normalizeRoad(data, options.preserveId);
    this.roads.push(road);
    this._rebuildRoadMesh(road);
    if (options.save !== false) this.saveCurrentTrack();
    return road;
  }

  updateRoad(id, patch = {}, options = {}) {
    const road = this.getRoad(id);
    if (!road) return null;

    if ('profile' in patch) road.profile = ROAD_PROFILE_TYPES[patch.profile] ? patch.profile : road.profile;
    if ('generationMode' in patch) road.generationMode = ROAD_GENERATION_MODES.has(patch.generationMode) ? patch.generationMode : road.generationMode;
    if ('moduleId' in patch) road.moduleId = this._roadModules[patch.moduleId] ? patch.moduleId : road.moduleId;
    if ('moduleSpacing' in patch) road.moduleSpacing = clamp(patch.moduleSpacing, 0.5, 40, road.moduleSpacing);
    if ('moduleScale' in patch) road.moduleScale = clamp(patch.moduleScale, 0.05, 20, road.moduleScale);
    if ('moduleLateralOffset' in patch) road.moduleLateralOffset = clamp(patch.moduleLateralOffset, -30, 30, road.moduleLateralOffset);
    if ('moduleYOffset' in patch) road.moduleYOffset = clamp(patch.moduleYOffset, -5, 5, road.moduleYOffset);
    if ('moduleYawOffset' in patch) road.moduleYawOffset = clamp(patch.moduleYawOffset, -Math.PI * 2, Math.PI * 2, road.moduleYawOffset);
    if ('stitchModules' in patch) road.stitchModules = Boolean(patch.stitchModules);
    if ('width' in patch) road.width = clamp(patch.width, 2, 32, road.width);
    if ('segmentLength' in patch) road.segmentLength = clamp(patch.segmentLength, 0.75, 12, road.segmentLength);
    if ('textureScale' in patch) road.textureScale = clamp(patch.textureScale, 1, 40, road.textureScale);
    if ('banking' in patch) road.banking = clamp(patch.banking, -20, 20, road.banking);
    if ('snapToGround' in patch) road.snapToGround = Boolean(patch.snapToGround);
    if ('generateCollision' in patch) road.generateCollision = Boolean(patch.generateCollision);
    if ('generateAiLine' in patch) road.generateAiLine = Boolean(patch.generateAiLine);
    if ('closed' in patch) road.closed = Boolean(patch.closed);
    if ('layer' in patch) road.layer = patch.layer || 'default';
    if ('note' in patch) road.note = String(patch.note || '');
    if (Array.isArray(patch.points)) road.points = patch.points.map(point => this._snapRoadPoint(point, road.snapToGround));
    if (road.snapToGround) road.points = road.points.map(point => this._snapRoadPoint(point, true));

    this._rebuildRoadMesh(road);
    if (options.save !== false) this.saveCurrentTrack();
    return road;
  }

  addRoadPoint(id, point, options = {}) {
    const road = this.getRoad(id);
    if (!road) return null;
    const insertAt = Number.isInteger(options.index)
      ? Math.max(0, Math.min(road.points.length, options.index))
      : road.points.length;
    road.points.splice(insertAt, 0, this._snapRoadPoint(point, road.snapToGround));
    this._rebuildRoadMesh(road);
    if (options.save !== false) this.saveCurrentTrack();
    return road;
  }

  updateRoadPoint(id, index, point, options = {}) {
    const road = this.getRoad(id);
    if (!road || !road.points[index]) return null;
    road.points[index] = this._snapRoadPoint(point, options.snapToGround ?? road.snapToGround);
    this._rebuildRoadMesh(road);
    if (options.save !== false) this.saveCurrentTrack();
    return road;
  }

  removeRoadPoint(id, index, options = {}) {
    const road = this.getRoad(id);
    if (!road || !road.points[index]) return null;
    road.points.splice(index, 1);
    this._rebuildRoadMesh(road);
    if (options.save !== false) this.saveCurrentTrack();
    return road;
  }

  removeRoad(id, options = {}) {
    const index = this.roads.findIndex(road => road.id === id);
    if (index < 0) return false;
    const [road] = this.roads.splice(index, 1);
    this._disposeRoad(road);
    this._syncEditorRoadProfiles();
    this._invalidateTrackRoadCaches();
    if (options.save !== false) this.saveCurrentTrack();
    return true;
  }

  duplicateRoad(id, options = {}) {
    const road = this.getRoad(id);
    if (!road) return null;
    const copy = this.serializeRoad(road);
    copy.id = undefined;
    copy.points = copy.points.map(point => ({ x: point.x + 3, y: point.y, z: point.z + 3 }));
    return this.addRoad(copy, options);
  }

  addTerrain(data = {}, options = {}) {
    const terrain = this._normalizeTerrain(data, options.preserveId);
    this.terrains.push(terrain);
    this._rebuildTerrainMesh(terrain);
    if (options.save !== false) this.saveCurrentTrack();
    return terrain;
  }

  updateTerrain(id, patch = {}, options = {}) {
    const terrain = this.getTerrain(id);
    if (!terrain) return null;
    if ('width' in patch) terrain.width = clamp(patch.width, 16, 1024, terrain.width);
    if ('depth' in patch) terrain.depth = clamp(patch.depth, 16, 1024, terrain.depth);
    if ('segmentsX' in patch || 'segmentsZ' in patch) {
      const nextX = Math.round(clamp(patch.segmentsX ?? terrain.segmentsX, 4, 128, terrain.segmentsX));
      const nextZ = Math.round(clamp(patch.segmentsZ ?? terrain.segmentsZ, 4, 128, terrain.segmentsZ));
      if (nextX !== terrain.segmentsX || nextZ !== terrain.segmentsZ) this._resampleTerrainHeights(terrain, nextX, nextZ);
    }
    if ('position' in patch) terrain.position = cloneVectorLike(patch.position, terrain.position);
    if ('baseHeight' in patch) {
      const nextBase = clamp(patch.baseHeight, -50, 80, terrain.baseHeight);
      const delta = nextBase - terrain.baseHeight;
      terrain.baseHeight = nextBase;
      terrain.heights = terrain.heights.map(height => height + delta);
    }
    if ('color' in patch) terrain.color = normalizeColor(patch.color, terrain.color);
    if ('roughness' in patch) terrain.roughness = clamp(patch.roughness, 0, 1, terrain.roughness);
    if ('metalness' in patch) terrain.metalness = clamp(patch.metalness, 0, 1, terrain.metalness);
    if ('generateCollision' in patch) terrain.generateCollision = Boolean(patch.generateCollision);
    if ('visible' in patch) terrain.visible = Boolean(patch.visible);
    if ('layer' in patch) terrain.layer = patch.layer || 'default';
    if ('note' in patch) terrain.note = String(patch.note || '');
    if (Array.isArray(patch.vertexColors)) {
      const expected = (terrain.segmentsX + 1) * (terrain.segmentsZ + 1) * 3;
      terrain.vertexColors = patch.vertexColors.slice(0, expected).map(value => clamp(value, 0, 1, 0));
      while (terrain.vertexColors.length < expected) terrain.vertexColors.push(1);
    }
    if (Array.isArray(patch.weightMap)) {
      const expected = (terrain.segmentsX + 1) * (terrain.segmentsZ + 1) * 4;
      terrain.weightMap = patch.weightMap.slice(0, expected).map(value => clamp(value, 0, 1, 0));
      while (terrain.weightMap.length < expected) terrain.weightMap.push(0);
    }
    if (Array.isArray(patch.heights)) {
      const expected = (terrain.segmentsX + 1) * (terrain.segmentsZ + 1);
      terrain.heights = patch.heights.slice(0, expected).map(value => clamp(value, -80, 120, terrain.baseHeight));
      while (terrain.heights.length < expected) terrain.heights.push(terrain.baseHeight);
    }
    this._rebuildTerrainMesh(terrain);
    if (options.save !== false) this.saveCurrentTrack();
    return terrain;
  }

  removeTerrain(id, options = {}) {
    const index = this.terrains.findIndex(terrain => terrain.id === id);
    if (index < 0) return false;
    const [terrain] = this.terrains.splice(index, 1);
    this._disposeTerrain(terrain);
    this._invalidateTrackRoadCaches();
    if (options.save !== false) this.saveCurrentTrack();
    return true;
  }

  paintTerrainAtPoint(id, worldPoint, brush = {}, options = {}) {
    const terrain = this.getTerrain(id);
    if (!terrain || !worldPoint) return null;
    const radius = Math.max(0.5, Number(brush.radius) || 8);
    const strength = Math.max(0, Number(brush.strength) || 0.35);
    const mode = brush.mode || 'raise';
    const targetHeight = Number.isFinite(Number(brush.targetHeight)) ? Number(brush.targetHeight) : terrain.baseHeight;
    const localX = (worldPoint.x || 0) - (terrain.position.x || 0);
    const localZ = (worldPoint.z || 0) - (terrain.position.z || 0);
    const halfW = terrain.width * 0.5;
    const halfD = terrain.depth * 0.5;
    const stepX = terrain.width / Math.max(1, terrain.segmentsX);
    const stepZ = terrain.depth / Math.max(1, terrain.segmentsZ);
    const before = terrain.heights.slice();
    const next = terrain.heights.slice();
    const sampleAvg = (x, z) => {
      let sum = 0;
      let count = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.max(0, Math.min(terrain.segmentsX, x + dx));
          const sz = Math.max(0, Math.min(terrain.segmentsZ, z + dz));
          sum += before[sz * (terrain.segmentsX + 1) + sx] ?? terrain.baseHeight;
          count++;
        }
      }
      return count ? sum / count : terrain.baseHeight;
    };
    let changed = false;
    for (let z = 0; z <= terrain.segmentsZ; z++) {
      const vz = -halfD + z * stepZ;
      for (let x = 0; x <= terrain.segmentsX; x++) {
        const vx = -halfW + x * stepX;
        const dist = Math.hypot(vx - localX, vz - localZ);
        if (dist > radius) continue;
        const falloff = (1 - dist / radius) ** 1.65;
        const idx = z * (terrain.segmentsX + 1) + x;
        const current = before[idx] ?? terrain.baseHeight;
        let value = current;
        if (mode === 'lower') value = current - strength * falloff;
        else if (mode === 'smooth') value = current + (sampleAvg(x, z) - current) * Math.min(1, strength * falloff);
        else if (mode === 'flatten') value = current + (targetHeight - current) * Math.min(1, strength * falloff);
        else value = current + strength * falloff;
        next[idx] = clamp(value, -80, 120, current);
        if (Math.abs(next[idx] - current) > 0.0001) changed = true;
      }
    }
    if (!changed) return terrain;
    terrain.heights = next;
    this._rebuildTerrainMesh(terrain);
    if (options.save !== false) this.saveCurrentTrack();
    return terrain;
  }

  replaceCurrentTrackLayout(layout = [], options = {}) {
    const normalized = this.normalizeTrackState(layout);
    if (!normalized.ok) {
      return { ok: false, trackId: this.currentTrackId || 'city_circuit', count: this.objects.length, roadCount: this.roads.length, error: normalized.error };
    }

    this.clear();
    for (const data of normalized.layout.terrains) this.addTerrain(data, { save: false, preserveId: true });
    for (const data of normalized.layout.roads) this.addRoad(data, { save: false, preserveId: true });
    for (const data of normalized.layout.objects) this.addObject(data, { save: false, preserveId: true });
    this._idCounter = this.objects.length + 1;
    this._roadIdCounter = this.roads.length + 1;
    this._terrainIdCounter = this.terrains.length + 1;

    if (options.save !== false) return this.saveCurrentTrack();
    return { ok: true, trackId: this.currentTrackId || 'city_circuit', count: this.objects.length, roadCount: this.roads.length, terrainCount: this.terrains.length };
  }

  resetCurrentTrack(options = {}) {
    this.clear();
    this._idCounter = 1;
    this._roadIdCounter = 1;
    this._terrainIdCounter = 1;
    if (options.save !== false) return this.saveCurrentTrack();
    return { ok: true, trackId: this.currentTrackId || 'city_circuit', count: 0, roadCount: 0, terrainCount: 0 };
  }

  normalizeImportPayload(payload) {
    if (Array.isArray(payload)) return this.normalizeTrackState(payload);
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: new Error('JSON 必须是数组，或包含 objects/layout/tracks 的对象。') };
    }

    if (Array.isArray(payload.objects) || Array.isArray(payload.roads) || Array.isArray(payload.terrains)) return this.normalizeTrackState(payload);
    if (Array.isArray(payload.layout)) return this.normalizeTrackState(payload.layout);
    const trackId = String(payload.trackId || this.currentTrackId || 'city_circuit').replace(/-/g, '_');
    if (payload.tracks?.[trackId]) return this.normalizeTrackState(payload.tracks[trackId]);
    return { ok: false, error: new Error('没有找到可导入的物体数组。') };
  }

  normalizeTrackState(layout = []) {
    const entry = this._normalizeTrackEntry(layout);
    const objectResult = this.normalizeLayout(entry.objects);
    if (!objectResult.ok) return objectResult;
    const roadResult = this.normalizeRoadLayout(entry.roads);
    if (!roadResult.ok) return roadResult;
    const terrainResult = this.normalizeTerrainLayout(entry.terrains);
    if (!terrainResult.ok) return terrainResult;
    return {
      ok: true,
      layout: {
        version: 4,
        objects: objectResult.layout,
        roads: roadResult.layout,
        terrains: terrainResult.layout,
      },
    };
  }

  normalizeLayout(layout = []) {
    if (!Array.isArray(layout)) {
      return { ok: false, error: new Error('关卡布局必须是数组。') };
    }

    const normalized = [];
    for (let i = 0; i < layout.length; i++) {
      const item = layout[i];
      if (!item || typeof item !== 'object') {
        return { ok: false, error: new Error(`第 ${i + 1} 个物体不是有效对象。`) };
      }
      const type = this._resolveTypeId(item.type);
      const defaults = this._getTypeConfig(type);
      normalized.push({
        id: item.id ? String(item.id) : undefined,
        type,
        position: cloneVectorLike(item.position),
        rotationY: clamp(item.rotationY, -Math.PI * 2, Math.PI * 2, 0),
        scale: clamp(item.scale, 0.35, 4, 1),
        snapToGround: item.snapToGround ?? defaults.snapToGround,
        mass: clamp(item.mass, 0, 500, defaults.mass),
        durability: clamp(item.durability ?? item.maxDurability, 1, 999, defaults.durability),
        maxDurability: clamp(item.maxDurability ?? item.durability, 1, 999, defaults.durability),
        collisionRadius: clamp(item.collisionRadius, 0.25, 5, defaults.collisionRadius),
        breakable: item.breakable ?? defaults.breakable,
        respawn: Boolean(item.respawn),
        respawnSeconds: clamp(item.respawnSeconds, 1, 120, 12),
        effect: item.effect || defaults.effect || 'none',
        layer: item.layer || 'default',
        note: String(item.note || ''),
      });
    }
    return { ok: true, layout: normalized };
  }

  saveCurrentTrack() {
    try {
      const trackId = this.currentTrackId || 'city_circuit';
      const layout = this.objects.map(obj => this.serializeObject(obj));
      const roads = this.getEditableRoads();
      const terrains = this.getEditableTerrains();
      this._storage = this._loadStorage();
      this._storage.tracks = this._storage.tracks || {};
      this._storage.tracks[trackId] = (roads.length || terrains.length)
        ? { version: 4, objects: layout, roads, terrains }
        : layout;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._storage));
      this._storage = this._loadStorage();
      return { ok: true, trackId, count: layout.length, roadCount: roads.length, terrainCount: terrains.length, storageKey: STORAGE_KEY };
    } catch (err) {
      console.warn('[InteractiveObjectManager] Save failed:', err);
      return { ok: false, trackId: this.currentTrackId || 'city_circuit', count: this.objects.length, roadCount: this.roads.length, terrainCount: this.terrains.length, error: err };
    }
  }

  serializeObject(obj) {
    return {
      id: obj.id,
      type: obj.type,
      position: { ...obj.position },
      rotationY: obj.rotationY,
      scale: obj.scale,
      snapToGround: obj.snapToGround,
      mass: obj.mass,
      durability: obj.maxDurability || obj.durability,
      collisionRadius: obj.collisionRadius,
      breakable: obj.breakable,
      respawn: obj.respawn,
      respawnSeconds: obj.respawnSeconds,
      effect: obj.effect || 'none',
      layer: obj.layer || 'default',
      note: obj.note || '',
    };
  }

  serializeRoad(road) {
    return {
      id: road.id,
      profile: road.profile || ROAD_DEFAULTS.profile,
      generationMode: road.generationMode || ROAD_DEFAULTS.generationMode,
      moduleId: road.moduleId || this._defaultModuleForProfile(road.profile),
      moduleSpacing: road.moduleSpacing,
      moduleScale: road.moduleScale,
      moduleLateralOffset: road.moduleLateralOffset,
      moduleYOffset: road.moduleYOffset,
      moduleYawOffset: road.moduleYawOffset,
      stitchModules: road.stitchModules,
      points: road.points.map(point => ({ ...point })),
      width: road.width,
      segmentLength: road.segmentLength,
      textureScale: road.textureScale,
      banking: road.banking,
      snapToGround: road.snapToGround,
      generateCollision: road.generateCollision,
      generateAiLine: road.generateAiLine,
      closed: road.closed,
      layer: road.layer || 'default',
      note: road.note || '',
    };
  }

  serializeTerrain(terrain) {
    const data = {
      id: terrain.id,
      width: terrain.width,
      depth: terrain.depth,
      segmentsX: terrain.segmentsX,
      segmentsZ: terrain.segmentsZ,
      position: { ...terrain.position },
      baseHeight: terrain.baseHeight,
      heights: terrain.heights.map(height => Number(height) || 0),
      vertexColors: Array.isArray(terrain.vertexColors) ? terrain.vertexColors.map(value => Number(value) || 0) : undefined,
      weightMap: Array.isArray(terrain.weightMap) ? terrain.weightMap.map(value => Number(value) || 0) : undefined,
      color: terrain.color,
      roughness: terrain.roughness,
      metalness: terrain.metalness,
      generateCollision: terrain.generateCollision,
      visible: terrain.visible,
      layer: terrain.layer || 'default',
      note: terrain.note || '',
    };
    if (!Array.isArray(terrain.vertexColors)) delete data.vertexColors;
    if (!Array.isArray(terrain.weightMap)) delete data.weightMap;
    return data;
  }

  resolveVehicleContact(vehiclePhysics, delta = 0.016) {
    const body = vehiclePhysics?.chassisBody;
    if (!body) return false;
    const speedKmh = vehiclePhysics.getSpeedKmh?.() || 0;
    const player = body.position;
    let hit = false;

    for (const obj of this.objects) {
      if (obj.destroyed) {
        this._updateRespawn(obj, delta);
        continue;
      }

      const dx = player.x - obj.position.x;
      const dz = player.z - obj.position.z;
      const radius = obj.collisionRadius * obj.scale + 1.15;
      const distSq = dx * dx + dz * dz;
      if (distSq > radius * radius) continue;

      const now = performance.now();
      const last = this._hitCooldown.get(obj.id) || 0;
      if (now - last < 180) continue;
      this._hitCooldown.set(obj.id, now);

      const dist = Math.sqrt(Math.max(0.0001, distSq));
      const nx = dx / dist;
      const nz = dz / dist;
      const impact = Math.max(4, speedKmh * 0.58 + Math.hypot(body.velocity.x, body.velocity.z) * 2);
      const damage = impact / Math.max(0.35, obj.mass / 45);

      if (obj.effect === 'boost') {
        body.velocity.x += nx * 4;
        body.velocity.z += nz * 4;
        this._emitObjectParticles(obj, 0x2cff9a, 10);
        hit = true;
        continue;
      }

      obj.durability -= damage;
      this._flashObject(obj);

      const solidFactor = obj.breakable ? 0.35 : 0.8;
      body.position.x = obj.position.x + nx * radius;
      body.position.z = obj.position.z + nz * radius;
      body.velocity.x += nx * Math.min(impact * 0.08, 12) * solidFactor;
      body.velocity.z += nz * Math.min(impact * 0.08, 12) * solidFactor;
      body.angularVelocity.y += (Math.random() - 0.5) * Math.min(impact * 0.012, 1.2);

      if (obj.breakable && obj.durability <= 0) {
        this._destroyObject(obj);
      } else {
        this._emitObjectParticles(obj, this._getTypeConfig(obj.type)?.debrisColor || 0xffffff, 4);
      }
      hit = true;
    }

    return hit;
  }

  _updateRespawn(obj, delta) {
    if (!obj.respawn) return;
    obj.respawnTimer -= delta;
    if (obj.respawnTimer > 0) return;
    obj.destroyed = false;
    obj.durability = obj.maxDurability;
    obj.mesh.visible = true;
    this._applyTransform(obj);
  }

  _destroyObject(obj) {
    obj.destroyed = true;
    obj.mesh.visible = false;
    obj.respawnTimer = obj.respawn ? obj.respawnSeconds : 0;
    this._emitObjectParticles(obj, this._getTypeConfig(obj.type)?.debrisColor || 0xffffff, 18);
  }

  _flashObject(obj) {
    obj.mesh.traverse(child => {
      if (!child.isMesh || !child.material?.emissive) return;
      child.material.emissive.setHex(0xffffff);
      setTimeout(() => child.material?.emissive?.setHex(0x000000), 80);
    });
  }

  _emitObjectParticles(obj, color, count) {
    if (!this.effects?.emitParticles) return;
    this.effects.emitParticles(new THREE.Vector3(obj.position.x, obj.position.y + 0.7, obj.position.z), count, {
      color,
      size: 0.09,
      lifetime: 0.55,
      spread: 1.2,
      velocity: 4,
    });
  }

  _snapPosition(position, snapToGround = true) {
    const p = { ...position };
    if (!snapToGround) return p;
    const roadPoint = this.trackManager?.getRoadInfoAtPosition?.(p)?.point;
    if (roadPoint && Number.isFinite(roadPoint.y)) {
      p.y = roadPoint.y;
    } else {
      const terrainY = this._sampleTerrainHeightAt(p);
      p.y = Number.isFinite(terrainY) ? terrainY : (Number.isFinite(p.y) ? p.y : 0);
    }
    return p;
  }

  _snapRoadPoint(position, snapToGround = true) {
    const p = cloneVectorLike(position);
    if (!snapToGround) return p;
    const roadPoint = this.trackManager?.getRoadInfoAtPosition?.(p, { preciseHeight: true })?.point;
    if (roadPoint && Number.isFinite(roadPoint.y)) {
      p.y = roadPoint.y + 0.035;
    } else {
      const terrainY = this._sampleTerrainHeightAt(p);
      p.y = Number.isFinite(terrainY) ? terrainY + 0.035 : (Number.isFinite(p.y) ? p.y : 0.035);
    }
    return p;
  }

  _applyTransform(obj) {
    obj.mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    obj.mesh.rotation.set(0, obj.rotationY, 0);
    obj.mesh.scale.setScalar(obj.scale);
    obj.mesh.userData.interactiveId = obj.id;
    obj.mesh.traverse(child => {
      child.userData.interactiveId = obj.id;
      child.castShadow = true;
      child.receiveShadow = true;
    });
  }

  _buildMesh(obj) {
    const group = new THREE.Group();
    group.name = `interactive-${obj.id}`;
    const config = this._getTypeConfig(obj.type);
    const shapeType = config.baseType || obj.type;
    const mat = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.72,
      metalness: shapeType === 'barrel' || shapeType === 'breakable_sign' ? 0.25 : 0.05,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x171a1d, roughness: 0.8 });

    if (shapeType === 'traffic_cone') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.25, 18), mat);
      cone.position.y = 0.65;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), dark);
      base.position.y = 0.06;
      group.add(cone, base);
    } else if (shapeType === 'barrel') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.35, 24), mat);
      barrel.position.y = 0.68;
      group.add(barrel);
    } else if (shapeType === 'wood_crate') {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), mat);
      crate.position.y = 0.63;
      group.add(crate);
    } else if (shapeType === 'tire_stack') {
      for (let i = 0; i < 3; i++) {
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.16, 8, 22), dark);
        tire.rotation.x = Math.PI / 2;
        tire.position.y = 0.22 + i * 0.32;
        group.add(tire);
      }
    } else if (shapeType === 'road_barrier') {
      const block = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 0.48), mat);
      block.position.y = 0.43;
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xff5a3d, roughness: 0.65 });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), stripeMat);
      stripe.position.set(0, 0.62, 0.02);
      group.add(block, stripe);
    } else if (shapeType === 'breakable_sign') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.35, 10), dark);
      pole.position.y = 0.68;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.08), mat);
      plate.position.y = 1.22;
      group.add(pole, plate);
    } else if (shapeType === 'boost_pad') {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.15), mat);
      pad.position.y = 0.04;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.9, 3), new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x136b45,
        roughness: 0.45,
      }));
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = Math.PI / 2;
      arrow.position.y = 0.13;
      group.add(pad, arrow);
    } else if (shapeType === 'roadside_building') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.5, 7.5, 5.4), mat);
      body.position.y = 3.75;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.45, 5.9), new THREE.MeshStandardMaterial({ color: 0x2f3942, roughness: 0.82 }));
      roof.position.y = 7.72;
      const windowMat = new THREE.MeshStandardMaterial({ color: 0x9fd7ff, emissive: 0x102638, roughness: 0.35 });
      for (let row = 0; row < 3; row++) {
        for (let col = -1; col <= 1; col++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.54, 0.05), windowMat);
          win.position.set(col * 1.45, 2.2 + row * 1.45, 2.73);
          group.add(win);
        }
      }
      group.add(body, roof);
    } else if (shapeType === 'tree_cluster') {
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4328, roughness: 0.9 });
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const radius = i === 0 ? 0 : 0.78;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 8), trunkMat);
        trunk.position.set(Math.cos(angle) * radius, 0.7, Math.sin(angle) * radius);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.72 + (i % 2) * 0.18, 12, 8), mat);
        crown.position.set(trunk.position.x, 1.72, trunk.position.z);
        group.add(trunk, crown);
      }
    } else if (shapeType === 'lamp_post') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.2, 12), dark);
      pole.position.y = 2.1;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.08), dark);
      arm.position.set(0.48, 4.02, 0);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({
        color: 0xfff0b6,
        emissive: 0xffcc66,
        emissiveIntensity: 0.7,
        roughness: 0.5,
      }));
      light.position.set(1.05, 3.92, 0);
      group.add(pole, arm, light);
    }

    return group;
  }

  normalizeRoadLayout(layout = []) {
    if (!Array.isArray(layout)) {
      return { ok: false, error: new Error('道路布局必须是数组。') };
    }
    const normalized = [];
    for (let i = 0; i < layout.length; i++) {
      try {
        normalized.push(this._normalizeRoad(layout[i], true));
      } catch (err) {
        return { ok: false, error: new Error(`第 ${i + 1} 条道路无效：${err.message}`) };
      }
    }
    return { ok: true, layout: normalized.map(road => this.serializeRoad(road)) };
  }

  normalizeTerrainLayout(layout = []) {
    if (!Array.isArray(layout)) {
      return { ok: false, error: new Error('地形布局必须是数组。') };
    }
    const normalized = [];
    for (let i = 0; i < layout.length; i++) {
      try {
        normalized.push(this._normalizeTerrain(layout[i], true));
      } catch (err) {
        return { ok: false, error: new Error(`第 ${i + 1} 个地形无效：${err.message}`) };
      }
    }
    return { ok: true, layout: normalized.map(terrain => this.serializeTerrain(terrain)) };
  }

  _normalizeRoad(data = {}, preserveId = false) {
    if (!data || typeof data !== 'object') throw new Error('道路数据必须是对象');
    const rawPoints = Array.isArray(data.points) ? data.points : [];
    const snapToGround = data.snapToGround ?? ROAD_DEFAULTS.snapToGround;
    return {
      id: preserveId && data.id ? String(data.id) : this._makeRoadId(),
      profile: ROAD_PROFILE_TYPES[data.profile] ? data.profile : ROAD_DEFAULTS.profile,
      generationMode: ROAD_GENERATION_MODES.has(data.generationMode) ? data.generationMode : ROAD_DEFAULTS.generationMode,
      moduleId: this._roadModules[data.moduleId] ? data.moduleId : this._defaultModuleForProfile(data.profile),
      moduleSpacing: clamp(data.moduleSpacing, 0.5, 40, ROAD_DEFAULTS.moduleSpacing),
      moduleScale: clamp(data.moduleScale, 0.05, 20, ROAD_DEFAULTS.moduleScale),
      moduleLateralOffset: clamp(data.moduleLateralOffset, -30, 30, ROAD_DEFAULTS.moduleLateralOffset),
      moduleYOffset: clamp(data.moduleYOffset, -5, 5, ROAD_DEFAULTS.moduleYOffset),
      moduleYawOffset: clamp(data.moduleYawOffset, -Math.PI * 2, Math.PI * 2, ROAD_DEFAULTS.moduleYawOffset),
      stitchModules: data.stitchModules !== false,
      points: rawPoints.map(point => this._snapRoadPoint(point, snapToGround)),
      width: clamp(data.width, 2, 32, ROAD_DEFAULTS.width),
      segmentLength: clamp(data.segmentLength, 0.75, 12, ROAD_DEFAULTS.segmentLength),
      textureScale: clamp(data.textureScale, 1, 40, ROAD_DEFAULTS.textureScale),
      banking: clamp(data.banking, -20, 20, ROAD_DEFAULTS.banking),
      snapToGround: Boolean(snapToGround),
      generateCollision: data.generateCollision ?? ROAD_DEFAULTS.generateCollision,
      generateAiLine: data.generateAiLine ?? ROAD_DEFAULTS.generateAiLine,
      closed: Boolean(data.closed),
      layer: data.layer || ROAD_DEFAULTS.layer,
      note: String(data.note || ''),
      mesh: null,
    };
  }

  _normalizeTerrain(data = {}, preserveId = false) {
    if (!data || typeof data !== 'object') throw new Error('地形数据必须是对象');
    const segmentsX = Math.round(clamp(data.segmentsX, 4, 128, TERRAIN_DEFAULTS.segmentsX));
    const segmentsZ = Math.round(clamp(data.segmentsZ, 4, 128, TERRAIN_DEFAULTS.segmentsZ));
    const expected = (segmentsX + 1) * (segmentsZ + 1);
    const baseHeight = clamp(data.baseHeight, -50, 80, TERRAIN_DEFAULTS.baseHeight);
    const heights = Array.isArray(data.heights)
      ? data.heights.slice(0, expected).map(value => clamp(value, -80, 120, baseHeight))
      : [];
    while (heights.length < expected) heights.push(baseHeight);
    const vertexColorExpected = expected * 3;
    const vertexColors = Array.isArray(data.vertexColors)
      ? data.vertexColors.slice(0, vertexColorExpected).map(value => clamp(value, 0, 1, 1))
      : null;
    if (vertexColors) while (vertexColors.length < vertexColorExpected) vertexColors.push(1);
    const weightExpected = expected * 4;
    const weightMap = Array.isArray(data.weightMap)
      ? data.weightMap.slice(0, weightExpected).map(value => clamp(value, 0, 1, 0))
      : null;
    if (weightMap) while (weightMap.length < weightExpected) weightMap.push(0);
    return {
      id: preserveId && data.id ? String(data.id) : this._makeTerrainId(),
      width: clamp(data.width, 16, 1024, TERRAIN_DEFAULTS.width),
      depth: clamp(data.depth, 16, 1024, TERRAIN_DEFAULTS.depth),
      segmentsX,
      segmentsZ,
      position: cloneVectorLike(data.position),
      baseHeight,
      heights,
      vertexColors,
      weightMap,
      color: normalizeColor(data.color, TERRAIN_DEFAULTS.color),
      roughness: clamp(data.roughness, 0, 1, TERRAIN_DEFAULTS.roughness),
      metalness: clamp(data.metalness, 0, 1, TERRAIN_DEFAULTS.metalness),
      generateCollision: data.generateCollision ?? TERRAIN_DEFAULTS.generateCollision,
      visible: data.visible !== false,
      layer: data.layer || TERRAIN_DEFAULTS.layer,
      note: String(data.note || ''),
      mesh: null,
    };
  }

  _rebuildTerrainMesh(terrain) {
    if (!terrain) return;
    if (terrain.mesh) this._disposeMesh(terrain.mesh);
    this._attachTerrainGroup();
    const geometry = this._buildTerrainGeometry(terrain);
    const material = new THREE.MeshStandardMaterial({
      color: terrain.color,
      roughness: terrain.roughness,
      metalness: terrain.metalness,
      side: THREE.DoubleSide,
      vertexColors: Boolean(geometry.getAttribute('color')),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `editor-terrain-${terrain.id}`;
    mesh.position.set(terrain.position.x, terrain.position.y, terrain.position.z);
    mesh.visible = terrain.visible !== false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.editorTerrain = true;
    mesh.userData.editorTerrainId = terrain.id;
    mesh.userData.editorTerrainCollision = terrain.generateCollision !== false;
    this.terrainGroup.add(mesh);
    terrain.mesh = mesh;
    this._invalidateTrackRoadCaches();
  }

  _buildTerrainGeometry(terrain) {
    const sx = terrain.segmentsX;
    const sz = terrain.segmentsZ;
    const cols = sx + 1;
    const rows = sz + 1;
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const halfW = terrain.width * 0.5;
    const halfD = terrain.depth * 0.5;
    for (let z = 0; z < rows; z++) {
      const v = z / Math.max(1, sz);
      for (let x = 0; x < cols; x++) {
        const u = x / Math.max(1, sx);
        const idx = z * cols + x;
        positions.push(-halfW + u * terrain.width, terrain.heights[idx] ?? terrain.baseHeight, -halfD + v * terrain.depth);
        const color = this._terrainVertexColor(terrain, idx);
        if (color) colors.push(color.r, color.g, color.b);
        uvs.push(u * 8, v * 8);
      }
    }
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const a = z * cols + x;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (colors.length === positions.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _terrainVertexColor(terrain, idx) {
    if (Array.isArray(terrain.vertexColors) && terrain.vertexColors.length >= (idx + 1) * 3) {
      return {
        r: terrain.vertexColors[idx * 3],
        g: terrain.vertexColors[idx * 3 + 1],
        b: terrain.vertexColors[idx * 3 + 2],
      };
    }
    if (Array.isArray(terrain.weightMap) && terrain.weightMap.length >= (idx + 1) * 4) {
      const weights = [
        terrain.weightMap[idx * 4],
        terrain.weightMap[idx * 4 + 1],
        terrain.weightMap[idx * 4 + 2],
        terrain.weightMap[idx * 4 + 3],
      ];
      const sum = Math.max(0.0001, weights.reduce((acc, value) => acc + Math.max(0, value), 0));
      const palette = [
        { r: 0.28, g: 0.47, b: 0.22 }, // grass
        { r: 0.50, g: 0.34, b: 0.20 }, // dirt
        { r: 0.48, g: 0.48, b: 0.46 }, // rock
        { r: 0.70, g: 0.62, b: 0.38 }, // sand
      ];
      return palette.reduce((acc, color, channel) => {
        const w = Math.max(0, weights[channel]) / sum;
        acc.r += color.r * w;
        acc.g += color.g * w;
        acc.b += color.b * w;
        return acc;
      }, { r: 0, g: 0, b: 0 });
    }
    return null;
  }

  _resampleTerrainHeights(terrain, nextX, nextZ) {
    const oldX = terrain.segmentsX;
    const oldZ = terrain.segmentsZ;
    const oldHeights = terrain.heights.slice();
    const oldCols = oldX + 1;
    const sample = (u, v) => {
      const x = Math.max(0, Math.min(oldX, u * oldX));
      const z = Math.max(0, Math.min(oldZ, v * oldZ));
      const x0 = Math.floor(x);
      const z0 = Math.floor(z);
      const x1 = Math.min(oldX, x0 + 1);
      const z1 = Math.min(oldZ, z0 + 1);
      const tx = x - x0;
      const tz = z - z0;
      const h00 = oldHeights[z0 * oldCols + x0] ?? terrain.baseHeight;
      const h10 = oldHeights[z0 * oldCols + x1] ?? terrain.baseHeight;
      const h01 = oldHeights[z1 * oldCols + x0] ?? terrain.baseHeight;
      const h11 = oldHeights[z1 * oldCols + x1] ?? terrain.baseHeight;
      const hx0 = h00 + (h10 - h00) * tx;
      const hx1 = h01 + (h11 - h01) * tx;
      return hx0 + (hx1 - hx0) * tz;
    };
    const heights = [];
    for (let z = 0; z <= nextZ; z++) {
      for (let x = 0; x <= nextX; x++) {
        heights.push(sample(x / Math.max(1, nextX), z / Math.max(1, nextZ)));
      }
    }
    terrain.segmentsX = nextX;
    terrain.segmentsZ = nextZ;
    terrain.heights = heights;
  }

  _sampleTerrainHeightAt(worldPoint) {
    let best = null;
    for (const terrain of this.terrains || []) {
      const localX = (worldPoint.x || 0) - (terrain.position.x || 0);
      const localZ = (worldPoint.z || 0) - (terrain.position.z || 0);
      const u = (localX / terrain.width) + 0.5;
      const v = (localZ / terrain.depth) + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const x = u * terrain.segmentsX;
      const z = v * terrain.segmentsZ;
      const x0 = Math.floor(x);
      const z0 = Math.floor(z);
      const x1 = Math.min(terrain.segmentsX, x0 + 1);
      const z1 = Math.min(terrain.segmentsZ, z0 + 1);
      const tx = x - x0;
      const tz = z - z0;
      const cols = terrain.segmentsX + 1;
      const h00 = terrain.heights[z0 * cols + x0] ?? terrain.baseHeight;
      const h10 = terrain.heights[z0 * cols + x1] ?? terrain.baseHeight;
      const h01 = terrain.heights[z1 * cols + x0] ?? terrain.baseHeight;
      const h11 = terrain.heights[z1 * cols + x1] ?? terrain.baseHeight;
      const hx0 = h00 + (h10 - h00) * tx;
      const hx1 = h01 + (h11 - h01) * tx;
      const y = (terrain.position.y || 0) + hx0 + (hx1 - hx0) * tz;
      if (best === null || y > best) best = y;
    }
    return best;
  }

  _rebuildRoadMesh(road) {
    if (!road) return;
    if (road.mesh) this._disposeMesh(road.mesh);
    this._attachRoadGroup();

    const root = new THREE.Group();
    root.name = `editor-road-${road.id}`;
    root.userData.editorRoad = true;
    root.userData.editorRoadId = road.id;

    if (road.points.length >= 2) {
      const samples = this._sampleRoadSpline(road);
      if (samples.length >= 2) {
        const materialConfig = ROAD_PROFILE_TYPES[road.profile] || ROAD_PROFILE_TYPES.asphalt_2lane;
        if (road.generationMode === 'module' || road.generationMode === 'deformModule') {
          const physicsSurface = this._createRoadSurfaceMesh(samples, road, materialConfig, {
            hidden: true,
            name: `editor-road-physics-strip-${road.id}`,
          });
          root.add(physicsSurface);
          if (road.generationMode === 'deformModule') this._populateDeformedRoadModule(root, road, samples);
          else this._populateRoadModuleInstances(root, road, samples);
        } else {
          root.add(this._createRoadSurfaceMesh(samples, road, materialConfig, {
            hidden: false,
            name: `editor-road-surface-${road.id}`,
          }));
        }

        const lineGeometry = new THREE.BufferGeometry().setFromPoints(
          samples.map(point => new THREE.Vector3(point.x, point.y + 0.045, point.z))
        );
        const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
          color: materialConfig.edgeColor,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }));
        line.name = `editor-road-centerline-${road.id}`;
        line.userData.editorRoad = true;
        line.userData.editorRoadId = road.id;
        root.add(line);
      }
    }

    this.roadGroup.add(root);
    road.mesh = root;
    this._syncEditorRoadProfiles();
    this._invalidateTrackRoadCaches();
  }

  _createRoadSurfaceMesh(samples, road, materialConfig, options = {}) {
    const material = new THREE.MeshStandardMaterial({
      color: materialConfig.color,
      roughness: materialConfig.roughness,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });
    if (options.hidden) {
      material.transparent = true;
      material.opacity = 0;
      material.depthWrite = false;
      material.colorWrite = false;
    }
    const surface = new THREE.Mesh(this._buildRoadGeometry(samples, road), material);
    surface.name = options.name || `editor-road-surface-${road.id}`;
    surface.visible = true;
    surface.receiveShadow = !options.hidden;
    surface.castShadow = false;
    surface.userData.editorRoad = true;
    surface.userData.editorRoadId = road.id;
    surface.userData.editorRoadSurface = true;
    surface.userData.editorRoadCollision = road.generateCollision !== false;
    surface.userData.skipCameraCollider = true;
    return surface;
  }

  _populateRoadModuleInstances(root, road, samples) {
    const moduleConfig = this._getRoadModuleConfig(road.moduleId, road.profile);
    const template = this._getRoadModuleTemplate(moduleConfig, road);
    if (!template) return;

    const spacing = Math.max(0.5, road.moduleSpacing || moduleConfig.spacing || moduleConfig.length || 8);
    const placements = this._sampleModulePlacements(samples, spacing, road.closed);
    if (road.stitchModules !== false) this._addModuleStitchMesh(root, road, moduleConfig, placements);
    for (const placement of placements) {
      const instance = template.clone(true);
      instance.name = `editor-road-module-${road.id}-${moduleConfig.id}`;
      this._prepareRoadModuleInstance(instance, road, moduleConfig, placement);
      root.add(instance);
    }
  }

  _populateDeformedRoadModule(root, road, samples) {
    const moduleConfig = this._getRoadModuleConfig(road.moduleId, road.profile);
    const template = this._getRoadModuleTemplate(moduleConfig, road);
    const profile = ROAD_PROFILE_TYPES[road.profile] || ROAD_PROFILE_TYPES.asphalt_2lane;
    const path = this._buildRoadPathFrames(samples, road.closed);
    if (!path || path.totalLength <= 0.01) return;

    const strips = this._extractRoadModuleStrips(template, moduleConfig, profile);
    const usableStrips = strips.length ? strips : this._defaultRoadModuleStrips(moduleConfig, profile);
    usableStrips
      .slice()
      .sort((a, b) => (a.renderOrder || 0) - (b.renderOrder || 0))
      .forEach(strip => {
        const geometry = this._buildDeformedModuleStripGeometry(path, road, moduleConfig, strip);
        if (!geometry) return;
        const material = this._cloneRoadModuleMaterial(strip.material, strip.fallbackColor || profile.color, strip);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `editor-road-deformed-module-${road.id}-${strip.name || strip.kind || 'strip'}`;
        mesh.renderOrder = strip.renderOrder || 0;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.userData.editorRoad = true;
        mesh.userData.editorRoadId = road.id;
        mesh.userData.editorRoadVisualModule = true;
        mesh.userData.skipCameraCollider = true;
        root.add(mesh);
      });
  }

  _extractRoadModuleStrips(template, moduleConfig, profile) {
    if (!template?.traverse) return [];
    template.updateMatrixWorld?.(true);
    const strips = [];
    const moduleLength = Math.max(0.1, moduleConfig.length || moduleConfig.spacing || 8);
    const moduleWidth = Math.max(0.1, moduleConfig.width || 8);

    template.traverse(child => {
      if (!child.isMesh || !child.geometry) return;
      const box = new THREE.Box3().setFromObject(child);
      if (box.isEmpty()) return;
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      if (!Number.isFinite(size.x + size.y + size.z) || size.z < 0.1 || size.x < 0.015) return;

      const name = String(child.name || child.parent?.name || 'module_strip').toLowerCase();
      const isLine = /line|lane|mark/.test(name);
      const isEdge = /edge|curb|side|rail/.test(name);
      const isSurface = /deck|surface|road|asphalt|concrete|dirt/.test(name) || size.x > moduleWidth * 0.45;
      const kind = isLine ? 'line' : isEdge ? 'edge' : isSurface ? 'surface' : 'detail';
      const renderOrder = kind === 'surface' ? 1 : kind === 'edge' ? 2 : kind === 'line' ? 3 : 4;
      const fallbackColor = kind === 'line' ? 0xf7f4dd : kind === 'edge' ? (profile.edgeColor || 0xe8e0c8) : profile.color;
      strips.push({
        name: child.name || kind,
        kind,
        lateralOffset: center.x,
        width: Math.max(0.025, size.x),
        yOffset: box.max.y + (kind === 'surface' ? 0 : 0.012),
        zMin: Math.max(-moduleLength * 0.5, box.min.z),
        zMax: Math.min(moduleLength * 0.5, box.max.z),
        material: child.material,
        fallbackColor,
        renderOrder,
      });
    });

    return strips;
  }

  _defaultRoadModuleStrips(moduleConfig, profile) {
    const width = Math.max(1, moduleConfig.width || 8);
    return [
      {
        name: 'surface',
        kind: 'surface',
        lateralOffset: 0,
        width,
        yOffset: 0.09,
        fallbackColor: profile.color,
        renderOrder: 1,
      },
      {
        name: 'left_edge',
        kind: 'edge',
        lateralOffset: -width * 0.5 + 0.18,
        width: 0.16,
        yOffset: 0.125,
        fallbackColor: profile.edgeColor || 0xe8e0c8,
        renderOrder: 2,
      },
      {
        name: 'right_edge',
        kind: 'edge',
        lateralOffset: width * 0.5 - 0.18,
        width: 0.16,
        yOffset: 0.125,
        fallbackColor: profile.edgeColor || 0xe8e0c8,
        renderOrder: 2,
      },
      {
        name: 'center_line',
        kind: 'line',
        lateralOffset: 0,
        width: 0.12,
        yOffset: 0.13,
        fallbackColor: 0xf7f4dd,
        renderOrder: 3,
      },
    ];
  }

  _cloneRoadModuleMaterial(sourceMaterial, fallbackColor, strip) {
    const source = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
    const material = source?.clone?.() || new THREE.MeshStandardMaterial({
      color: fallbackColor,
      roughness: strip?.kind === 'line' ? 0.65 : 0.82,
      metalness: 0.03,
    });
    material.side = THREE.DoubleSide;
    material.transparent = material.transparent || false;
    material.depthWrite = true;
    material.polygonOffset = strip?.kind !== 'surface';
    material.polygonOffsetFactor = strip?.kind === 'line' ? -4 : -2;
    material.polygonOffsetUnits = strip?.kind === 'line' ? -4 : -2;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
      if (material[key]) {
        material[key].wrapS = THREE.RepeatWrapping;
        material[key].wrapT = THREE.RepeatWrapping;
        material[key].needsUpdate = true;
      }
    }
    return material;
  }

  _buildRoadPathFrames(samples, closed = false) {
    if (!Array.isArray(samples) || samples.length < 2) return null;
    const points = closed && samples.length > 2 ? [...samples, samples[0]] : samples;
    const frames = [];
    let distance = 0;

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      if (i > 0) distance += current.distanceTo(points[i - 1]);
      const prev = closed && i === 0 ? points[points.length - 2] : points[Math.max(0, i - 1)];
      const next = closed && i === points.length - 1 ? points[1] : points[Math.min(points.length - 1, i + 1)];
      const tangent = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z);
      if (tangent.lengthSq() < 0.0001) tangent.set(0, 0, 1);
      tangent.normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
      if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
      right.normalize();
      frames.push({
        position: current.clone(),
        distance,
        right,
      });
    }

    return { frames, totalLength: distance, closed: Boolean(closed && samples.length > 2) };
  }

  _sampleRoadPathFrame(path, rawDistance) {
    const frames = path?.frames || [];
    if (frames.length < 2 || path.totalLength <= 0) return null;
    let distance = Number(rawDistance) || 0;
    if (path.closed) distance = ((distance % path.totalLength) + path.totalLength) % path.totalLength;
    else distance = THREE.MathUtils.clamp(distance, 0, path.totalLength);

    let index = 0;
    while (index < frames.length - 2 && frames[index + 1].distance < distance) index++;
    const a = frames[index];
    const b = frames[Math.min(frames.length - 1, index + 1)];
    const span = Math.max(0.0001, b.distance - a.distance);
    const t = THREE.MathUtils.clamp((distance - a.distance) / span, 0, 1);
    const position = a.position.clone().lerp(b.position, t);
    const right = a.right.clone().lerp(b.right, t);
    if (right.lengthSq() < 0.0001) right.copy(a.right);
    right.normalize();
    return { position, right };
  }

  _buildDeformedModuleStripGeometry(path, road, moduleConfig, strip) {
    const baseScale = (road.moduleScale || 1) * (moduleConfig.scale || 1);
    const widthScale = (road.width && moduleConfig.width)
      ? Math.max(0.05, road.width / moduleConfig.width) * baseScale
      : baseScale;
    const moduleLength = Math.max(0.1, (moduleConfig.length || moduleConfig.spacing || road.moduleSpacing || 8) * baseScale);
    const lateralOffset = (road.moduleLateralOffset || 0) + (strip.lateralOffset || 0) * widthScale;
    const stripWidth = Math.max(0.02, (strip.width || moduleConfig.width || road.width || 8) * widthScale);
    const yOffset = (road.moduleYOffset ?? moduleConfig.yOffset ?? 0) + (strip.yOffset || 0) * baseScale;
    const step = Math.max(0.35, Math.min(2, road.segmentLength || 2.5, moduleLength / 6));
    const total = path.totalLength;
    if (total <= 0.01 || stripWidth <= 0.001) return null;

    const vertices = [];
    const uvs = [];
    const indices = [];
    const distances = [];
    for (let distance = 0; distance < total; distance += step) distances.push(distance);
    if (!distances.length || Math.abs(distances[distances.length - 1] - total) > 0.001) distances.push(total);

    for (let i = 0; i < distances.length; i++) {
      const frame = this._sampleRoadPathFrame(path, distances[i]);
      if (!frame) continue;
      const center = frame.position.clone()
        .addScaledVector(frame.right, lateralOffset)
        .add(new THREE.Vector3(0, yOffset, 0));
      const left = center.clone().addScaledVector(frame.right, -stripWidth * 0.5);
      const right = center.clone().addScaledVector(frame.right, stripWidth * 0.5);
      vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
      const v = distances[i] / moduleLength;
      uvs.push(0, v, 1, v);

      if (i < distances.length - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    if (!indices.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _addModuleStitchMesh(root, road, moduleConfig, placements) {
    if (!root || !Array.isArray(placements) || placements.length < 2) return;
    const geometry = this._buildModuleStitchGeometry(road, moduleConfig, placements);
    if (!geometry) return;
    const profile = ROAD_PROFILE_TYPES[road.profile] || ROAD_PROFILE_TYPES.asphalt_2lane;
    const material = new THREE.MeshStandardMaterial({
      color: profile.color,
      roughness: profile.roughness,
      metalness: 0.03,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `editor-road-module-stitch-${road.id}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.editorRoad = true;
    mesh.userData.editorRoadId = road.id;
    mesh.userData.editorRoadVisualModule = true;
    mesh.userData.skipCameraCollider = true;
    root.add(mesh);
  }

  _buildModuleStitchGeometry(road, moduleConfig, placements) {
    const baseScale = (road.moduleScale || 1) * (moduleConfig.scale || 1);
    const moduleLength = Math.max(0.1, (moduleConfig.length || moduleConfig.spacing || road.moduleSpacing || 8) * baseScale);
    const widthScale = (road.width && moduleConfig.width)
      ? Math.max(0.05, road.width / moduleConfig.width) * baseScale
      : baseScale;
    const stitchWidth = Math.max(0.25, (moduleConfig.width || road.width || 8) * widthScale);
    const halfWidth = stitchWidth * 0.5;
    const halfLength = moduleLength * 0.5;
    const segmentCount = road.closed ? placements.length : placements.length - 1;
    if (segmentCount <= 0) return null;

    const vertices = [];
    const uvs = [];
    const indices = [];
    let index = 0;
    for (let i = 0; i < segmentCount; i++) {
      const current = placements[i];
      const next = placements[(i + 1) % placements.length];
      if (!current || !next) continue;
      const a = this._moduleSection(current, road, halfLength, halfWidth, 1);
      const b = this._moduleSection(next, road, halfLength, halfWidth, -1);
      if (!a || !b) continue;
      const gap = a.center.distanceTo(b.center);
      if (gap < 0.02) continue;

      vertices.push(
        a.left.x, a.left.y, a.left.z,
        a.right.x, a.right.y, a.right.z,
        b.left.x, b.left.y, b.left.z,
        b.right.x, b.right.y, b.right.z,
      );
      uvs.push(0, 0, 1, 0, 0, gap / Math.max(1, moduleLength), 1, gap / Math.max(1, moduleLength));
      indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
      index += 4;
    }

    if (!indices.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _moduleSection(placement, road, halfLength, halfWidth, longitudinalSign) {
    const tangent = placement.tangent?.clone?.() || new THREE.Vector3(0, 0, 1);
    if (tangent.lengthSq() < 0.0001) tangent.set(0, 0, 1);
    tangent.normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
    right.normalize();
    const center = placement.position.clone()
      .addScaledVector(tangent, halfLength * longitudinalSign)
      .addScaledVector(right, road.moduleLateralOffset || 0)
      .add(new THREE.Vector3(0, (road.moduleYOffset ?? 0) + 0.012, 0));
    return {
      center,
      left: center.clone().addScaledVector(right, -halfWidth),
      right: center.clone().addScaledVector(right, halfWidth),
    };
  }

  _sampleModulePlacements(samples, spacing, closed = false) {
    if (!Array.isArray(samples) || samples.length < 2) return [];
    const path = closed ? [...samples, samples[0]] : samples;
    const placements = [];
    let traveled = 0;
    let nextDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const seg = new THREE.Vector3().subVectors(b, a);
      const len = seg.length();
      if (len < 0.001) continue;

      while (nextDistance <= traveled + len + 0.0001) {
        const t = THREE.MathUtils.clamp((nextDistance - traveled) / len, 0, 1);
        const pos = a.clone().lerp(b, t);
        const tangent = seg.clone().normalize();
        placements.push({ position: pos, tangent });
        nextDistance += spacing;
      }
      traveled += len;
    }
    return placements;
  }

  _prepareRoadModuleInstance(instance, road, moduleConfig, placement) {
    const tangent = placement.tangent || new THREE.Vector3(0, 0, 1);
    const horizontal = Math.max(0.0001, Math.hypot(tangent.x, tangent.z));
    const yaw = Math.atan2(tangent.x, tangent.z) + (moduleConfig.yawOffset || 0) + (road.moduleYawOffset || 0);
    const pitch = moduleConfig.pitchToSlope === false ? 0 : -Math.atan2(tangent.y || 0, horizontal);
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const pos = placement.position.clone()
      .addScaledVector(right, road.moduleLateralOffset || 0)
      .add(new THREE.Vector3(0, road.moduleYOffset ?? moduleConfig.yOffset ?? 0, 0));

    const baseScale = (road.moduleScale || 1) * (moduleConfig.scale || 1);
    const widthScale = (road.width && moduleConfig.width)
      ? Math.max(0.05, road.width / moduleConfig.width) * baseScale
      : baseScale;
    instance.position.copy(pos);
    instance.rotation.set(pitch, yaw, 0, 'YXZ');
    instance.scale.set(widthScale, baseScale, baseScale);
    instance.userData.editorRoad = true;
    instance.userData.editorRoadId = road.id;
    instance.userData.editorRoadVisualModule = true;
    instance.userData.skipCameraCollider = true;
    instance.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.editorRoad = true;
      child.userData.editorRoadId = road.id;
      child.userData.editorRoadVisualModule = true;
      child.userData.skipCameraCollider = true;
    });
  }

  _getRoadModuleTemplate(moduleConfig, road) {
    const url = moduleConfig?.url || 'builtin:asphalt';
    if (url.startsWith('builtin:')) {
      if (!this._roadModuleCache.has(url)) this._roadModuleCache.set(url, this._buildBuiltinRoadModuleTemplate(moduleConfig));
      return this._roadModuleCache.get(url);
    }
    if (this._roadModuleCache.has(url)) return this._roadModuleCache.get(url) || this._getBuiltinFallbackModule(road);
    this._requestRoadModuleLoad(moduleConfig);
    return this._getBuiltinFallbackModule(road);
  }

  _requestRoadModuleLoad(moduleConfig) {
    const url = moduleConfig?.url;
    const loader = this.trackManager?._loader;
    if (!url || url.startsWith('builtin:') || !loader?._loadGLB || this._roadModuleLoads.has(url)) return;
    const promise = loader._loadGLB(url, { _progress: null }, { cloneMode: 'shared' })
      .then(model => {
        this._prepareRoadModuleTemplate(model);
        this._roadModuleCache.set(url, model);
        this._roadModuleLoads.delete(url);
        for (const road of this.roads) {
          if ((road.generationMode === 'module' || road.generationMode === 'deformModule') && this._getRoadModuleConfig(road.moduleId, road.profile).url === url) {
            this._rebuildRoadMesh(road);
          }
        }
      })
      .catch(err => {
        console.warn('[InteractiveObjectManager] Road module load failed:', url, err);
        this._roadModuleCache.set(url, null);
        this._roadModuleLoads.delete(url);
      });
    this._roadModuleLoads.set(url, promise);
  }

  _getBuiltinFallbackModule(road) {
    const fallbackId = this._defaultModuleForProfile(road?.profile);
    const fallback = this._getRoadModuleConfig(fallbackId, road?.profile);
    const key = fallback.url || 'builtin:asphalt';
    if (!this._roadModuleCache.has(key)) this._roadModuleCache.set(key, this._buildBuiltinRoadModuleTemplate(fallback));
    return this._roadModuleCache.get(key);
  }

  _buildBuiltinRoadModuleTemplate(moduleConfig = DEFAULT_ROAD_MODULES.asphalt_straight) {
    const group = new THREE.Group();
    group.name = `builtin-road-module-${moduleConfig.id || 'road'}`;
    const profile = ROAD_PROFILE_TYPES[moduleConfig.profile] || ROAD_PROFILE_TYPES.asphalt_2lane;
    const width = moduleConfig.width || 8;
    const length = moduleConfig.length || 8;
    const baseMat = new THREE.MeshStandardMaterial({
      color: profile.color,
      roughness: profile.roughness,
      metalness: 0.03,
    });
    const edgeMat = new THREE.MeshStandardMaterial({ color: profile.edgeColor || 0xe8e0c8, roughness: 0.75 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf7f4dd, roughness: 0.7, emissive: 0x080805 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, length), baseMat);
    deck.position.y = 0.03;
    deck.name = 'road-module-deck';
    const center = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, length * 0.72), lineMat);
    center.position.set(0, 0.105, 0);
    center.name = 'road-module-center-line';
    const leftEdge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, length * 0.92), edgeMat);
    leftEdge.position.set(-width * 0.5 + 0.18, 0.11, 0);
    const rightEdge = leftEdge.clone();
    rightEdge.position.x = width * 0.5 - 0.18;
    group.add(deck, center, leftEdge, rightEdge);
    this._prepareRoadModuleTemplate(group);
    return group;
  }

  _prepareRoadModuleTemplate(model) {
    model.traverse(child => {
      if (!child.isMesh) return;
      child.userData.sharedGeometry = true;
      child.userData.sharedMaterial = true;
      child.castShadow = true;
      child.receiveShadow = true;
    });
  }

  _sampleRoadSpline(road, densityScale = 1) {
    const points = (road.points || []).map(point => new THREE.Vector3(point.x, point.y, point.z));
    if (points.length < 2) return points;
    const closed = road.closed && points.length > 2;
    const length = points.reduce((sum, point, index) => {
      if (index === 0) return sum;
      return sum + distanceXZ(point, points[index - 1]);
    }, closed ? distanceXZ(points[0], points[points.length - 1]) : 0);
    const divisions = Math.max(2, Math.min(240, Math.ceil(length / Math.max(0.75, road.segmentLength || 2.5) * densityScale)));
    const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.28);
    const sampled = curve.getPoints(divisions);
    if (closed && sampled.length > 2 && sampled[0].distanceTo(sampled[sampled.length - 1]) < 0.001) sampled.pop();
    return sampled;
  }

  _buildRoadGeometry(samples, road) {
    const vertices = [];
    const uvs = [];
    const indices = [];
    const halfWidth = Math.max(1, (road.width || ROAD_DEFAULTS.width) * 0.5);
    const banking = THREE.MathUtils.degToRad(road.banking || 0);
    const textureScale = Math.max(1, road.textureScale || ROAD_DEFAULTS.textureScale);
    let distance = 0;

    for (let i = 0; i < samples.length; i++) {
      const prev = samples[Math.max(0, i - 1)];
      const current = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      if (i > 0) distance += current.distanceTo(samples[i - 1]);

      const tangent = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z);
      if (tangent.lengthSq() < 0.0001) tangent.set(0, 0, 1);
      tangent.normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
      const bankRise = Math.sin(banking) * halfWidth;
      const left = new THREE.Vector3(current.x, current.y - bankRise, current.z).addScaledVector(right, -halfWidth);
      const rightPoint = new THREE.Vector3(current.x, current.y + bankRise, current.z).addScaledVector(right, halfWidth);

      vertices.push(left.x, left.y, left.z, rightPoint.x, rightPoint.y, rightPoint.z);
      const u = distance / textureScale;
      uvs.push(0, u, 1, u);

      if (i < samples.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    if (road.closed && samples.length > 2) {
      const a = (samples.length - 1) * 2;
      indices.push(a, a + 1, 0, a + 1, 1, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  _attachRoadGroup() {
    const parent = this.trackManager?.roadGroup || this.group;
    if (this.roadGroup.parent !== parent) parent.add(this.roadGroup);
  }

  _attachTerrainGroup() {
    const parent = this.trackManager?.terrainGroup || this.group;
    if (this.terrainGroup.parent !== parent) parent.add(this.terrainGroup);
  }

  _getRoadModuleConfig(moduleId, profile = ROAD_DEFAULTS.profile) {
    const id = this._roadModules[moduleId] ? moduleId : this._defaultModuleForProfile(profile);
    return this._roadModules[id] || DEFAULT_ROAD_MODULES.asphalt_straight;
  }

  _defaultModuleForProfile(profile = ROAD_DEFAULTS.profile) {
    if (profile === 'concrete_service') return 'concrete_straight';
    if (profile === 'dirt_rally') return 'dirt_straight';
    return 'asphalt_straight';
  }

  _syncEditorRoadProfiles() {
    const profiles = this.roads
      .filter(road => road.points.length >= 2)
      .map(road => {
        const points = this._sampleRoadSpline(road, 0.55).map(point => ({ x: point.x, y: point.y, z: point.z }));
        return {
          id: road.id,
          source: 'editor-road',
          points,
          halfWidths: points.map(() => Math.max(1, road.width * 0.5)),
          closed: road.closed,
          generateAiLine: road.generateAiLine,
        };
      });
    this.trackManager?.setEditorRoadProfiles?.(profiles);
  }

  _invalidateTrackRoadCaches() {
    this.trackManager?.invalidateRoadCaches?.();
  }


  _hasType(type) {
    return Boolean(type && this._objectTypes?.[type]);
  }

  _resolveTypeId(type) {
    const id = String(type || 'traffic_cone');
    return this._hasType(id) ? id : 'traffic_cone';
  }

  _getTypeConfig(type) {
    const id = this._resolveTypeId(type);
    return this._objectTypes?.[id] || INTERACTIVE_OBJECT_TYPES.traffic_cone;
  }

  _defaultLayout() {
    return [];
  }

  _normalizeTrackEntry(entry) {
    if (Array.isArray(entry)) return { objects: entry, roads: [], terrains: [] };
    if (!entry || typeof entry !== 'object') return { objects: this._defaultLayout(), roads: [], terrains: [] };
    return {
      objects: Array.isArray(entry.objects)
        ? entry.objects
        : Array.isArray(entry.layout)
          ? entry.layout
          : [],
      roads: Array.isArray(entry.roads) ? entry.roads : [],
      terrains: Array.isArray(entry.terrains) ? entry.terrains : [],
    };
  }

  _loadStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return this._normalizeStorage(parsed);
    } catch {
      return { tracks: {} };
    }
  }

  _normalizeStorage(parsed) {
    const storage = parsed && typeof parsed === 'object' ? parsed : {};
    const tracks = storage.tracks && typeof storage.tracks === 'object' ? storage.tracks : {};

    // Backward compatibility: if an older save stored track arrays at root,
    // copy them into tracks without deleting the original keys.
    for (const [key, value] of Object.entries(storage)) {
      if (key === 'tracks' || !Array.isArray(value)) continue;
      tracks[String(key).replace(/-/g, '_')] = value;
    }

    return {
      ...storage,
      version: storage.version || 4,
      tracks,
    };
  }

  _makeId(type) {
    return `${type}-${Date.now().toString(36)}-${this._idCounter++}`;
  }

  _makeRoadId() {
    return `road-${Date.now().toString(36)}-${this._roadIdCounter++}`;
  }

  _makeTerrainId() {
    return `terrain-${Date.now().toString(36)}-${this._terrainIdCounter++}`;
  }

  _disposeObject(obj) {
    if (obj.mesh?.parent) obj.mesh.parent.remove(obj.mesh);
    this._disposeMesh(obj.mesh);
  }

  _disposeRoad(road) {
    if (road?.mesh) this._disposeMesh(road.mesh);
    road.mesh = null;
  }

  _disposeTerrain(terrain) {
    if (terrain?.mesh) this._disposeMesh(terrain.mesh);
    terrain.mesh = null;
  }

  _disposeMesh(mesh) {
    mesh?.traverse?.(child => {
      if (!child.userData?.sharedGeometry) child.geometry?.dispose?.();
      if (!child.userData?.sharedMaterial) {
        if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose?.());
        else child.material?.dispose?.();
      }
    });
    if (mesh?.parent) mesh.parent.remove(mesh);
  }
}
