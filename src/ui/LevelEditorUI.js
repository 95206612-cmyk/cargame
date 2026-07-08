import * as THREE from 'three';

const CONTROL_IGNORE_SELECTOR = '#mobile-controls,#mobile-esc-btn,#orbit-btn,#mobile-layout-toggle';
const EDITOR_INPUT_SELECTOR = 'input,select,textarea,button,[contenteditable="true"]';
const EDITOR_TEXT_INPUT_SELECTOR = 'input,select,textarea,[contenteditable="true"]';
const HISTORY_LIMIT = 50;
const AUTOSAVE_MS = 30000;
const EDITOR_CAMERA_KEY_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
]);

const CATEGORY_LABELS = {
  breakable: '可破坏物',
  solid: '坚固物',
  function: '功能物',
  decorative: '装饰物',
  other: '其他',
};

const MODE_LABELS = { move: '移动', rotate: '旋转', scale: '缩放' };
const TOOL_LABELS = { object: '物体', road: '道路', terrain: '地形', random: '生成' };
const TERRAIN_BRUSH_LABELS = {
  raise: '抬高',
  lower: '压低',
  smooth: '平滑',
  flatten: '夷平',
};
const ROAD_PROFILE_OPTIONS = [
  ['asphalt_2lane', '沥青双车道'],
  ['concrete_service', '混凝土道路'],
  ['dirt_rally', '土路拉力'],
];
const AXIS_COLORS = { x: 0xff4d4d, y: 0x43ff7a, z: 0x4aa3ff };
const EFFECT_OPTIONS = [['none', '无特效'], ['boost', '加速板'], ['spark', '碰撞火花'], ['dust', '尘土']];
const DEFAULT_TRACKS = [
  { id: 'city_circuit', name: '城市环道' },
  { id: 'city_circuit_01', name: '城市环道 01' },
  { id: 'mountain_pass', name: '山路挑战' },
  { id: 'coastal_highway', name: '海岸公路' },
  { id: 'dirt_rally', name: '泥地拉力' },
  { id: 'desert_dash', name: '沙漠冲刺' },
];

function clamp(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function cloneLayout(layout = []) {
  return JSON.parse(JSON.stringify(layout ?? []));
}

function toVector3(value, fallback = { x: 0, y: 0, z: 0 }) {
  return new THREE.Vector3(
    Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback.x,
    Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback.y,
    Number.isFinite(Number(value?.z)) ? Number(value.z) : fallback.z,
  );
}

function cssText(lines) {
  return lines.filter(Boolean).join(';') + ';';
}

export class LevelEditorUI {
  constructor(parent, options = {}) {
    this.parent = parent || document.body;
    this.manager = options.manager;
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.trackManager = options.trackManager;

    this.visible = false;
    this.trackId = 'city_circuit';
    this.tracks = DEFAULT_TRACKS;
    this.toolMode = 'object';
    this.selectedType = 'traffic_cone';
    this.selectedRoadProfile = 'asphalt_2lane';
    this.selectedRoadModuleId = 'asphalt_straight';
    this.selectedIds = [];
    this.selectedRoadId = null;
    this.selectedRoadPointIndex = null;
    this.selectedTerrainId = null;
    this.selectedTerrainId = null;
    this.terrainBrushMode = 'raise';
    this.terrainBrushRadius = 9;
    this.terrainBrushStrength = 0.45;
    this.terrainFlattenHeight = 0;
    this.randomSettings = {
      seed: '',
      size: 220,
      roadPoints: 12,
      roadRadius: 64,
      objectCount: 42,
      terrainHeight: 5.5,
      generateTerrain: true,
      generateRoad: true,
      generateObjects: true,
      closedRoad: true,
    };
    this.randomObjectPool = new Set();
    this.randomRoadModulePool = new Set();
    this._randomPoolsInitialized = false;
    this.editMode = 'move';
    this.spaceMode = 'world';
    this.snapEnabled = true;
    this.gridVisible = true;
    this.collisionVisible = false;
    this.rotationSnap = false;
    this.searchTerm = '';
    this.collapsedCategories = new Set();
    this.layers = [{ id: 'default', name: '默认图层', visible: true, locked: false }];
    this.activeLayer = 'default';

    this.onExit = null;
    this.onSave = null;
    this.onTrackChange = null;
    this.onCameraRotate = null;
    this.onCameraZoom = null;
    this.onCameraReset = null;

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._preview = null;
    this._dirty = false;
    this._eventsBound = false;
    this._history = [];
    this._redoStack = [];
    this._suspendHistory = false;
    this._pointerDrag = null;
    this._collisionHelpers = new Map();
    this._autosaveTimer = null;
    this._lastPointerPoint = null;
    this._lastPropertySnapshot = null;
    this._roadHelperGroup = null;
    this._terrainBrushHelper = null;
    this._cameraKeys = new Set();

    this._build();
    this._buildSceneHelpers();
  }

  setTracks(tracks = []) {
    const normalized = (Array.isArray(tracks) && tracks.length ? tracks : DEFAULT_TRACKS)
      .map(track => ({
        id: String(track.id || track.value || '').replace(/-/g, '_'),
        name: track.name || track.label || track.id || track.value,
        unlocked: track.unlocked !== false,
      }))
      .filter(track => track.id);
    this.tracks = normalized.length ? normalized : DEFAULT_TRACKS;
    this._renderTrackOptions();
  }

  async loadObjectConfig(url = './config/objects.json') {
    const result = await this.manager?.loadObjectConfig?.(url);
    if (result?.ok) {
      this._renderPalette();
      this._setStatus(`已加载自定义物体库，共 ${result.count} 类。`);
    }
    return result;
  }

  async loadRoadModuleConfig(url = './config/road-modules.json') {
    const result = await this.manager?.loadRoadModuleConfig?.(url);
    if (result?.ok) {
      this._renderPalette();
      this._setStatus(`已加载道路模块库，共 ${result.count} 个模块。`);
    }
    return result;
  }

  show(trackId = 'city_circuit') {
    this.trackId = String(trackId || 'city_circuit').replace(/-/g, '_');
    this.visible = true;
    this.root.style.display = 'block';
    this._dirty = false;
    this._history = [];
    this._redoStack = [];
    this.selectedIds = [];
    this.selectedRoadId = null;
    this.selectedRoadPointIndex = null;
    this._removePreview();
    this._clearDrag();
    this._cameraKeys.clear();
    this._bindEvents();
    this._startAutosave();
    this._setStatus('编辑器已开启：左侧选择物体，点击地面放置；右键拖动旋转视角，滚轮缩放。');
    this.refresh();
  }

  hide() {
    if (this._dirty) this._saveCurrentTrack(false, { auto: true });
    this.visible = false;
    this.root.style.display = 'none';
    this._removePreview();
    this._clearDrag();
    this._cameraKeys.clear();
    this._stopAutosave();
    this._unbindEvents();
    this._setGizmoVisible(false);
    this._setGridVisible(false);
    this._clearCollisionHelpers();
    this.selectedIds = [];
    this.selectedRoadId = null;
    this.selectedRoadPointIndex = null;
    this.selectedTerrainId = null;
    this._clearRoadHelpers();
    this._setTerrainBrushHelperVisible(false);
    this._dirty = false;
  }

  refresh() {
    if (!this.root) return;
    this.trackSelect.value = this.trackId || 'city_circuit';
    this.countLabel.textContent = `${this.manager?.objects?.length || 0} 物体 / ${this.manager?.roads?.length || 0} 道路 / ${this.manager?.terrains?.length || 0} 地形`;
    this.dirtyLabel.textContent = this._dirty ? '未保存' : '已保存';
    this.dirtyLabel.style.color = this._dirty ? '#ffd166' : '#78f0c2';
    this._renderPalette();
    this._renderProperties();
    this._renderLayerList();
    this._syncModeButtons();
    this._updateHistoryButtons();
    this._updateSceneHelpers();
  }

  isTypingInEditor() {
    const focused = document.activeElement;
    return Boolean(focused && this.root?.contains(focused) && focused.matches?.(EDITOR_TEXT_INPUT_SELECTOR));
  }

  getCameraInput(fallback = {}) {
    if (!this.visible || this.isTypingInEditor()) return {};
    const down = (...codes) => codes.some(code => this._cameraKeys.has(code));
    const hasKeyboardMove = [...EDITOR_CAMERA_KEY_CODES].some(code => this._cameraKeys.has(code));
    if (!hasKeyboardMove) return fallback || {};
    return {
      ...fallback,
      throttle: down('KeyW', 'ArrowUp') ? 1 : 0,
      brake: down('KeyS', 'ArrowDown') ? 1 : 0,
      steerAxis: (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0),
      handbrake: down('Space'),
      nitro: down('ShiftLeft', 'ShiftRight'),
    };
  }

  hasUnsavedChanges() { return this._dirty; }
  markSaved() { this._dirty = false; this.refresh(); }
  setSelectedObject(id) { this.selectedIds = id ? [id] : []; this._lastPropertySnapshot = this._snapshotSelection(); this.refresh(); }

  _build() {
    this.root = document.createElement('div');
    this.root.id = 'level-editor-panel';
    this.root.style.cssText = cssText([
      'position:fixed', 'inset:0', 'z-index:38', 'display:none', 'pointer-events:none',
      'color:#f7fbff', 'font-family:"Microsoft YaHei","Noto Sans SC","Segoe UI",sans-serif',
      'text-shadow:0 1px 2px rgba(0,0,0,0.32)',
    ]);
    this.root.appendChild(this._createStyles());

    this.topbar = document.createElement('div');
    this.topbar.className = 'le-topbar le-panel';
    this.topbar.innerHTML = `
      <div class="le-brand"><span class="le-brand-title">关卡编辑器 V2</span><span class="le-brand-sub">上帝视角 · 交互物布局</span></div>
      <label class="le-track-field">关卡<select id="le-track-select"></select></label>
      <button class="le-btn" data-action="undo" title="Ctrl+Z">撤销</button>
      <button class="le-btn" data-action="redo" title="Ctrl+Y">重做</button>
      <button class="le-btn" data-action="import">导入</button>
      <button class="le-btn" data-action="export">导出</button>
      <button class="le-btn le-danger" data-action="reset">重置关卡</button>
      <button class="le-btn le-primary" data-action="save">保存</button>
      <button class="le-btn le-primary" data-action="save-exit" title="Save & Exit">保存并退出</button>
      <button class="le-btn le-exit" data-action="exit">退出</button>
      <span id="le-count-label" class="le-count"></span><span id="le-dirty-label" class="le-dirty"></span>
    `;
    this.root.appendChild(this.topbar);

    this.leftPanel = document.createElement('aside');
    this.leftPanel.className = 'le-left le-panel';
    this.leftPanel.innerHTML = `<div class="le-panel-title">物体库</div><input id="le-search" class="le-search" type="search" placeholder="搜索物体，例如：路障 / 加速" /><div id="le-palette" class="le-palette"></div>`;
    this.root.appendChild(this.leftPanel);

    this.rightPanel = document.createElement('aside');
    this.rightPanel.className = 'le-right le-panel';
    this.rightPanel.innerHTML = `
      <div class="le-panel-title">属性面板</div><div id="le-properties" class="le-properties"></div>
      <div class="le-panel-title le-layer-title">图层管理</div><div id="le-layer-list" class="le-layer-list"></div>
      <button class="le-btn le-layer-add" data-action="add-layer">新建图层</button>
    `;
    this.root.appendChild(this.rightPanel);

    this.modeBar = document.createElement('div');
    this.modeBar.className = 'le-modebar le-panel';
    this.modeBar.innerHTML = `
      <button class="le-mode" data-tool="object">物体</button><button class="le-mode" data-tool="road">道路</button><button class="le-mode" data-tool="terrain">地形</button><button class="le-mode" data-tool="random">生成</button>
      <button class="le-mode" data-mode="move">移动</button><button class="le-mode" data-mode="rotate">旋转</button><button class="le-mode" data-mode="scale">缩放</button>
      <button class="le-mode" data-space="toggle">世界</button><button class="le-mode" data-toggle="grid">网格</button><button class="le-mode" data-toggle="collision">碰撞半径</button><button class="le-mode" data-toggle="snap">15°吸附</button>
    `;
    this.root.appendChild(this.modeBar);

    this.statusBar = document.createElement('div');
    this.statusBar.className = 'le-status le-panel';
    this.statusBar.textContent = '准备编辑。';
    this.root.appendChild(this.statusBar);

    this.selectionBoxEl = document.createElement('div');
    this.selectionBoxEl.className = 'le-selection-box';
    this.selectionBoxEl.style.display = 'none';
    this.root.appendChild(this.selectionBoxEl);

    this._importInput = document.createElement('input');
    this._importInput.type = 'file';
    this._importInput.accept = 'application/json,.json';
    this._importInput.style.display = 'none';
    this.root.appendChild(this._importInput);

    this.parent.appendChild(this.root);
    this.trackSelect = this.root.querySelector('#le-track-select');
    this.countLabel = this.root.querySelector('#le-count-label');
    this.dirtyLabel = this.root.querySelector('#le-dirty-label');
    this.searchInput = this.root.querySelector('#le-search');
    this.paletteEl = this.root.querySelector('#le-palette');
    this.propertiesEl = this.root.querySelector('#le-properties');
    this.layerListEl = this.root.querySelector('#le-layer-list');

    this._renderTrackOptions();
    this._wireUiEvents();
  }

  _createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #level-editor-panel * { box-sizing: border-box; }
      #level-editor-panel .le-panel { pointer-events:auto;border:1px solid rgba(178,230,255,0.22);background:linear-gradient(145deg,rgba(5,13,22,0.92),rgba(13,31,43,0.82));box-shadow:0 20px 46px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06);backdrop-filter:blur(14px); }
      #level-editor-panel .le-topbar { position:absolute;left:18px;right:18px;top:14px;min-height:58px;display:flex;align-items:center;gap:9px;padding:9px 11px; }
      #level-editor-panel .le-brand { min-width:150px;display:grid;gap:2px; }
      #level-editor-panel .le-brand-title { font-weight:950;letter-spacing:1px;color:#78f0c2;font-size:0.9rem; }
      #level-editor-panel .le-brand-sub { font-size:0.66rem;color:#8fa6ba; }
      #level-editor-panel .le-track-field { display:grid;gap:3px;font-size:0.65rem;color:#91a6b8;min-width:160px; }
      #level-editor-panel select,#level-editor-panel input,#level-editor-panel textarea { border:1px solid rgba(255,255,255,0.16);border-radius:0;background:rgba(2,9,15,0.78);color:#f7fbff;padding:7px 8px;outline:none;font:inherit;text-shadow:none; }
      #level-editor-panel input[type="range"] { padding:0; accent-color:#78f0c2; }
      #level-editor-panel input[type="checkbox"] { width:16px;height:16px;accent-color:#78f0c2; }
      #level-editor-panel .le-btn,#level-editor-panel .le-mode { border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.075);color:#eaf6ff;padding:8px 10px;font-weight:900;cursor:pointer;white-space:nowrap;letter-spacing:0.2px; }
      #level-editor-panel .le-btn:hover,#level-editor-panel .le-mode:hover { background:rgba(120,240,194,0.14);border-color:rgba(120,240,194,0.44); }
      #level-editor-panel .le-btn:disabled,#level-editor-panel .le-mode:disabled { opacity:0.38;cursor:not-allowed; }
      #level-editor-panel .le-primary { border-color:#78f0c2;color:#78f0c2;background:rgba(120,240,194,0.13); }
      #level-editor-panel .le-danger { border-color:#ff9b5f;color:#ffbd8c; }
      #level-editor-panel .le-exit { border-color:#ff6b6b;color:#ff8a8a; }
      #level-editor-panel .le-count { margin-left:auto;color:#ffd166;font-size:0.78rem;font-weight:900; }
      #level-editor-panel .le-dirty { min-width:48px;font-size:0.75rem;font-weight:900;text-align:right; }
      #level-editor-panel .le-left { position:absolute;left:18px;top:86px;bottom:92px;width:248px;padding:12px;overflow:hidden;display:flex;flex-direction:column; }
      #level-editor-panel .le-right { position:absolute;right:18px;top:86px;bottom:92px;width:310px;padding:12px;overflow:auto; }
      #level-editor-panel .le-panel-title { font-weight:950;color:#bfefff;letter-spacing:1px;margin-bottom:9px; }
      #level-editor-panel .le-search { width:100%;margin-bottom:10px; }
      #level-editor-panel .le-palette { overflow:auto;padding-right:3px; }
      #level-editor-panel .le-category { margin-bottom:9px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.035); }
      #level-editor-panel .le-category-head { width:100%;display:flex;justify-content:space-between;align-items:center;padding:8px 9px;border:0;background:rgba(255,255,255,0.055);color:#f7fbff;font-weight:900;cursor:pointer; }
      #level-editor-panel .le-category-body { display:grid;grid-template-columns:1fr;gap:7px;padding:8px; }
      #level-editor-panel .le-object-card { display:grid;grid-template-columns:42px 1fr;gap:8px;align-items:center;width:100%;padding:7px;border:1px solid rgba(255,255,255,0.11);background:rgba(255,255,255,0.045);color:#fff;text-align:left;cursor:pointer; }
      #level-editor-panel .le-object-card.active { border-color:#78f0c2;background:rgba(120,240,194,0.15); }
      #level-editor-panel .le-thumb { width:42px;height:34px;border:1px solid rgba(255,255,255,0.13);background:linear-gradient(135deg,rgba(120,240,194,0.28),rgba(74,163,255,0.12));display:grid;place-items:center;font-weight:950;color:#fff; }
      #level-editor-panel .le-object-name { font-weight:900;color:#fff;font-size:0.76rem; }
      #level-editor-panel .le-object-meta { color:#91a6b8;font-size:0.65rem;margin-top:2px; }
      #level-editor-panel .le-check-row { display:grid;grid-template-columns:20px 1fr;gap:7px;align-items:center;padding:6px 7px;border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.035);font-size:0.72rem;color:#eaf6ff; }
      #level-editor-panel .le-modebar { position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;gap:7px;padding:9px; }
      #level-editor-panel .le-mode.active { color:#07131c;background:#78f0c2;border-color:#78f0c2;text-shadow:none; }
      #level-editor-panel .le-status { position:absolute;left:282px;right:342px;bottom:78px;min-height:34px;max-height:38px;padding:8px 12px;color:#d6e7f5;font-size:0.74rem;line-height:1.25;pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
      #level-editor-panel .le-properties { display:grid;gap:10px; }
      #level-editor-panel .le-group { border:1px solid rgba(255,255,255,0.11);background:rgba(255,255,255,0.045);padding:9px; }
      #level-editor-panel .le-group-title { color:#ffd166;font-weight:950;font-size:0.78rem;margin-bottom:8px; }
      #level-editor-panel .le-field { display:grid;grid-template-columns:86px 1fr;align-items:center;gap:8px;margin:7px 0;color:#c8d6e2;font-size:0.72rem; }
      #level-editor-panel .le-field-wide { display:grid;gap:6px;margin:8px 0;color:#c8d6e2;font-size:0.72rem; }
      #level-editor-panel .le-range-row { display:grid;grid-template-columns:1fr 72px;gap:7px;align-items:center; }
      #level-editor-panel .le-vector-row { display:grid;grid-template-columns:20px 1fr;gap:6px;align-items:center;margin:5px 0; }
      #level-editor-panel .le-vector-axis { font-weight:950;text-align:center; }
      #level-editor-panel .le-prop-actions { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px; }
      #level-editor-panel .le-empty { color:#9fb2c2;font-size:0.76rem;line-height:1.6;padding:10px;border:1px dashed rgba(255,255,255,0.16); }
      #level-editor-panel .le-layer-title { margin-top:14px; }
      #level-editor-panel .le-layer-list { display:grid;gap:6px; }
      #level-editor-panel .le-layer-row { display:grid;grid-template-columns:1fr 34px 34px;gap:5px;align-items:center;padding:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);font-size:0.72rem; }
      #level-editor-panel .le-layer-add { width:100%;margin-top:8px; }
      #level-editor-panel .le-selection-box { position:fixed;border:1px solid rgba(120,240,194,0.95);background:rgba(120,240,194,0.12);z-index:39;pointer-events:none; }
      @media (max-width: 980px) { #level-editor-panel .le-left { width:212px; } #level-editor-panel .le-right { width:260px; } #level-editor-panel .le-status { left:238px;right:292px;bottom:82px; } #level-editor-panel .le-topbar { overflow-x:auto; } }
    `;
    return style;
  }

  _wireUiEvents() {
    this.root.addEventListener('keydown', event => { if (event.target?.matches?.(EDITOR_INPUT_SELECTOR)) event.stopPropagation(); }, true);
    this.root.addEventListener('keyup', event => { if (event.target?.matches?.(EDITOR_INPUT_SELECTOR)) event.stopPropagation(); }, true);
    this.root.addEventListener('pointerdown', event => { if (event.target?.matches?.(EDITOR_INPUT_SELECTOR) || event.target?.closest?.('.le-panel')) event.stopPropagation(); }, true);
    this.searchInput.addEventListener('input', () => { this.searchTerm = this.searchInput.value.trim().toLowerCase(); this._renderPalette(); });
    this.trackSelect.addEventListener('change', () => this._requestTrackChange(this.trackSelect.value));
    this.topbar.addEventListener('click', event => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'undo') this.undo();
      else if (action === 'redo') this.redo();
      else if (action === 'import') this._importInput.click();
      else if (action === 'export') this._exportJson();
      else if (action === 'reset') this._resetCurrentTrack();
      else if (action === 'save') this._saveCurrentTrack(true);
      else if (action === 'save-exit') this._exitEditor();
      else if (action === 'exit') this._exitEditor();
    });
    this.modeBar.addEventListener('click', event => {
      const tool = event.target?.dataset?.tool;
      const mode = event.target?.dataset?.mode;
      const space = event.target?.dataset?.space;
      const toggle = event.target?.dataset?.toggle;
      if (tool) this._setToolMode(tool);
      if (mode) this._setEditMode(mode);
      if (space) this._toggleSpaceMode();
      if (toggle === 'grid') this._toggleGrid();
      if (toggle === 'collision') this._toggleCollisionHelpers();
      if (toggle === 'snap') this._toggleRotationSnap();
    });
    this.rightPanel.addEventListener('click', event => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === 'delete') this._deleteSelection();
      if (action === 'duplicate' || action === 'copy') this._duplicateSelection();
      if (action === 'new-road') this._startNewRoad();
      if (action === 'select-road-body') this._selectRoad(this.selectedRoadId, null, '已切换为整条道路选择，可用 Gizmo 整体移动、旋转或缩放曲线。');
      if (action === 'delete-road') this._deleteRoadSelection(false);
      if (action === 'delete-road-point') this._deleteRoadSelection(true);
      if (action === 'reverse-road') this._reverseSelectedRoad();
      if (action === 'new-terrain') this._createTerrain();
      if (action === 'delete-terrain') this._deleteTerrain();
      if (action === 'reset-terrain') this._resetTerrainHeights(false);
      if (action === 'flatten-terrain') this._resetTerrainHeights(true);
      if (action === 'generate-random-level') this._generateRandomLevel();
      if (action === 'random-select-all') this._selectAllRandomResources();
      if (action === 'add-layer') this._addLayer();
      if (action === 'toggle-layer') this._toggleLayer(event.target.dataset.layerId, 'visible');
      if (action === 'lock-layer') this._toggleLayer(event.target.dataset.layerId, 'locked');
    });
    this.paletteEl.addEventListener('click', event => {
      const terrainSelect = event.target?.closest?.('[data-terrain-select]')?.dataset?.terrainSelect;
      const brushMode = event.target?.closest?.('[data-brush-mode]')?.dataset?.brushMode;
      const roadSelect = event.target?.closest?.('[data-road-select]')?.dataset?.roadSelect;
      const profile = event.target?.closest?.('[data-road-profile]')?.dataset?.roadProfile;
      const moduleId = event.target?.closest?.('[data-road-module]')?.dataset?.roadModule;
      if (terrainSelect) {
        this._selectTerrain(terrainSelect, '已选中地形，可在场景里拖动笔刷雕刻。');
        return;
      }
      if (brushMode) {
        this.terrainBrushMode = brushMode;
        this._setToolMode('terrain');
        this._setStatus(`地形笔刷：${TERRAIN_BRUSH_LABELS[brushMode] || brushMode}。`);
        return;
      }
      if (!roadSelect && !profile && !moduleId) return;
      if (roadSelect) {
        this._selectRoad(roadSelect, null, '已选中道路，可在右侧二次编辑属性，也可以拖动绿色控制点调整曲线。');
        return;
      }
      if (profile) this.selectedRoadProfile = profile;
      if (moduleId) {
        this.selectedRoadModuleId = moduleId;
        const module = this.manager?.getRoadModules?.().find(item => item.id === moduleId);
        if (module?.profile) this.selectedRoadProfile = module.profile;
      }
      this._setToolMode('road');
      this._setStatus(moduleId
        ? `已选择道路模块：${this._getRoadModuleLabel(moduleId)}。点击地面开始摆放模块道路。`
        : `已选择道路基础类型：${this._getRoadProfileLabel(profile)}。点击地面开始放样道路。`);
      this.refresh();
    });
    this.paletteEl.addEventListener('change', event => {
      const objectId = event.target?.dataset?.randomObject;
      const moduleId = event.target?.dataset?.randomRoadModule;
      if (objectId) {
        event.target.checked ? this.randomObjectPool.add(objectId) : this.randomObjectPool.delete(objectId);
        this.refresh();
      }
      if (moduleId) {
        event.target.checked ? this.randomRoadModulePool.add(moduleId) : this.randomRoadModulePool.delete(moduleId);
        this.refresh();
      }
    });
    this.propertiesEl.addEventListener('focusin', event => {
      this._lastPropertySnapshot = (this.toolMode === 'road' || this.toolMode === 'terrain' || this.toolMode === 'random')
        ? this._snapshotLayout()
        : this._snapshotSelection();
      if (event.target?.matches?.(EDITOR_TEXT_INPUT_SELECTOR)) this._cameraKeys.clear();
    });
    this.propertiesEl.addEventListener('input', event => this._handlePropertyInput(event, false));
    this.propertiesEl.addEventListener('change', event => this._handlePropertyInput(event, true));
    this._importInput.addEventListener('change', () => this._handleImportFile());
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._onPointerMove = event => this._handlePointerMove(event);
    this._onPointerDown = event => this._handlePointerDown(event);
    this._onPointerUp = event => this._handlePointerUp(event);
    this._onWheel = event => this._handleWheel(event);
    this._onKeyDown = event => { this._handleCameraKey(event, true); this._handleKeyDown(event); };
    this._onKeyUp = event => this._handleCameraKey(event, false);
    this._onWindowBlur = () => { this._cameraKeys.clear(); };
    window.addEventListener('pointermove', this._onPointerMove, true);
    window.addEventListener('pointerdown', this._onPointerDown, true);
    window.addEventListener('pointerup', this._onPointerUp, true);
    window.addEventListener('wheel', this._onWheel, { capture: true, passive: false });
    window.addEventListener('keydown', this._onKeyDown, true);
    window.addEventListener('keyup', this._onKeyUp, true);
    window.addEventListener('blur', this._onWindowBlur);
    this._eventsBound = true;
  }

  _unbindEvents() {
    if (!this._eventsBound) return;
    window.removeEventListener('pointermove', this._onPointerMove, true);
    window.removeEventListener('pointerdown', this._onPointerDown, true);
    window.removeEventListener('pointerup', this._onPointerUp, true);
    window.removeEventListener('wheel', this._onWheel, true);
    window.removeEventListener('keydown', this._onKeyDown, true);
    window.removeEventListener('keyup', this._onKeyUp, true);
    window.removeEventListener('blur', this._onWindowBlur);
    this._eventsBound = false;
  }

  _buildSceneHelpers() {
    this._gridHelper = new THREE.GridHelper(240, 48, 0x78f0c2, 0x24465a);
    this._gridHelper.name = 'level-editor-ground-grid';
    this._gridHelper.material.transparent = true;
    this._gridHelper.material.opacity = 0.22;
    this._gridHelper.visible = false;
    this.manager?.group?.add?.(this._gridHelper);
    this._gizmo = this._createGizmo();
    this._gizmo.visible = false;
    this.manager?.group?.add?.(this._gizmo);
    this._roadHelperGroup = new THREE.Group();
    this._roadHelperGroup.name = 'level-editor-road-helpers';
    this._roadHelperGroup.visible = false;
    this.manager?.group?.add?.(this._roadHelperGroup);
    const brushMat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.76,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this._terrainBrushHelper = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 72), brushMat);
    this._terrainBrushHelper.name = 'level-editor-terrain-brush';
    this._terrainBrushHelper.rotation.x = -Math.PI / 2;
    this._terrainBrushHelper.visible = false;
    this._terrainBrushHelper.renderOrder = 30;
    this.manager?.group?.add?.(this._terrainBrushHelper);
  }

  _createGizmo() {
    const group = new THREE.Group();
    group.name = 'level-editor-gizmo';
    group.userData.editorGizmo = true;
    const axes = [
      { axis: 'x', dir: new THREE.Vector3(1, 0, 0), rot: new THREE.Euler(0, 0, -Math.PI / 2), pos: new THREE.Vector3(2, 0, 0) },
      { axis: 'y', dir: new THREE.Vector3(0, 1, 0), rot: new THREE.Euler(0, 0, 0), pos: new THREE.Vector3(0, 2, 0) },
      { axis: 'z', dir: new THREE.Vector3(0, 0, 1), rot: new THREE.Euler(Math.PI / 2, 0, 0), pos: new THREE.Vector3(0, 0, 2) },
    ];
    for (const item of axes) {
      const axisGroup = new THREE.Group();
      axisGroup.name = `gizmo-${item.axis}`;
      axisGroup.userData.gizmoAxis = item.axis;
      const mat = new THREE.MeshBasicMaterial({ color: AXIS_COLORS[item.axis], depthTest: false, transparent: true, opacity: 0.95 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.8, 10), mat);
      shaft.position.copy(item.dir.clone().multiplyScalar(0.9));
      shaft.rotation.copy(item.rot);
      shaft.userData.gizmoAxis = item.axis;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.38, 14), mat);
      head.position.copy(item.pos);
      head.rotation.copy(item.rot);
      head.userData.gizmoAxis = item.axis;
      axisGroup.add(shaft, head);
      group.add(axisGroup);
    }
    return group;
  }

  _renderTrackOptions() {
    if (!this.trackSelect) return;
    this.trackSelect.innerHTML = this.tracks.map(track => {
      const disabled = track.unlocked === false ? 'disabled' : '';
      return `<option value="${this._escape(track.id)}" ${disabled}>${this._escape(track.name || track.id)} (${this._escape(track.id)})</option>`;
    }).join('');
    this.trackSelect.value = this.trackId || 'city_circuit';
  }

  _renderPalette() {
    if (this.toolMode === 'road') {
      this._renderRoadPalette();
      return;
    }
    if (this.toolMode === 'terrain') {
      this._renderTerrainPalette();
      return;
    }
    if (this.toolMode === 'random') {
      this._renderRandomPalette();
      return;
    }
    const types = this.manager?.getTypes?.() || [];
    const filtered = types.filter(type => {
      const text = `${type.id} ${type.label || ''} ${type.category || ''}`.toLowerCase();
      return !this.searchTerm || text.includes(this.searchTerm);
    });
    const groups = new Map();
    for (const type of filtered) {
      const category = type.category || (type.breakable ? 'breakable' : type.effect === 'boost' ? 'function' : 'other');
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(type);
    }
    this.paletteEl.textContent = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'le-empty';
      empty.textContent = '没有找到匹配的物体。';
      this.paletteEl.appendChild(empty);
      return;
    }
    for (const [category, items] of groups.entries()) {
      const section = document.createElement('section');
      section.className = 'le-category';
      const collapsed = this.collapsedCategories.has(category);
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'le-category-head';
      head.innerHTML = `<span>${this._escape(CATEGORY_LABELS[category] || category)}</span><span>${collapsed ? '+' : '-'} ${items.length}</span>`;
      head.addEventListener('click', () => { collapsed ? this.collapsedCategories.delete(category) : this.collapsedCategories.add(category); this._renderPalette(); });
      section.appendChild(head);
      if (!collapsed) {
        const body = document.createElement('div');
        body.className = 'le-category-body';
        for (const type of items) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `le-object-card${this.selectedType === type.id ? ' active' : ''}`;
          btn.dataset.type = type.id;
          btn.innerHTML = `
            <span class="le-thumb">${this._escape((type.label || type.id).slice(0, 1))}</span>
            <span><span class="le-object-name">${this._escape(type.label || type.id)}</span><span class="le-object-meta">质量 ${Number(type.mass) || 0} · 坚固 ${Number(type.durability) || 0} · 半径 ${Number(type.collisionRadius || 0).toFixed(2)}</span></span>
          `;
          btn.addEventListener('click', () => { this.selectedType = type.id; this.selectedIds = []; this._removePreview(); this._setStatus(`已选择 ${type.label || type.id}，点击地面放置。`); this.refresh(); });
          body.appendChild(btn);
        }
        section.appendChild(body);
      }
      this.paletteEl.appendChild(section);
    }
  }

  _renderTerrainPalette() {
    this.paletteEl.textContent = '';
    const info = document.createElement('div');
    info.className = 'le-empty';
    info.textContent = '地形模式：新建地形后，选择笔刷并在地形上拖动。支持抬高、压低、平滑、夷平，地形会保存并可生成车辆物理。';
    this.paletteEl.appendChild(info);

    const terrains = this.manager?.getTerrains?.() || [];
    const section = document.createElement('section');
    section.className = 'le-category';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'le-category-head';
    head.innerHTML = `<span>已有地形</span><span>${terrains.length}</span>`;
    section.appendChild(head);
    const body = document.createElement('div');
    body.className = 'le-category-body';
    if (!terrains.length) {
      const empty = document.createElement('div');
      empty.className = 'le-empty';
      empty.textContent = '还没有编辑器地形。点击右侧“新建地形”创建一个可雕刻地形块。';
      body.appendChild(empty);
    } else {
      for (const terrain of terrains) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `le-object-card${this.selectedTerrainId === terrain.id ? ' active' : ''}`;
        btn.dataset.terrainSelect = terrain.id;
        btn.innerHTML = `
          <span class="le-thumb">地</span>
          <span>
            <span class="le-object-name">${this._escape(terrain.note || terrain.id)}</span>
            <span class="le-object-meta">${Math.round(terrain.width)} x ${Math.round(terrain.depth)} · ${terrain.segmentsX}x${terrain.segmentsZ}</span>
          </span>
        `;
        body.appendChild(btn);
      }
    }
    section.appendChild(body);
    this.paletteEl.appendChild(section);

    const brushSection = document.createElement('section');
    brushSection.className = 'le-category';
    brushSection.innerHTML = `<button type="button" class="le-category-head"><span>笔刷</span><span>${TERRAIN_BRUSH_LABELS[this.terrainBrushMode] || this.terrainBrushMode}</span></button>`;
    const brushBody = document.createElement('div');
    brushBody.className = 'le-category-body';
    for (const [mode, label] of Object.entries(TERRAIN_BRUSH_LABELS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `le-object-card${this.terrainBrushMode === mode ? ' active' : ''}`;
      btn.dataset.brushMode = mode;
      btn.innerHTML = `<span class="le-thumb">${label.slice(0, 1)}</span><span><span class="le-object-name">${label}</span><span class="le-object-meta">半径 ${this.terrainBrushRadius} · 强度 ${this.terrainBrushStrength}</span></span>`;
      brushBody.appendChild(btn);
    }
    brushSection.appendChild(brushBody);
    this.paletteEl.appendChild(brushSection);
  }

  _renderRandomPalette() {
    this._ensureRandomPools();
    this.paletteEl.textContent = '';
    const info = document.createElement('div');
    info.className = 'le-empty';
    info.textContent = '随机关卡生成：选择资源池和参数后，会生成地形、闭合道路、功能点、碰撞物和装饰物。生成会覆盖当前编辑布局，但可用撤销恢复。';
    this.paletteEl.appendChild(info);

    const objectTypes = this.manager?.getTypes?.() || [];
    const objectSection = document.createElement('section');
    objectSection.className = 'le-category';
    objectSection.innerHTML = `<button type="button" class="le-category-head"><span>物体资源池</span><span>${this.randomObjectPool.size}/${objectTypes.length}</span></button>`;
    const objectBody = document.createElement('div');
    objectBody.className = 'le-category-body';
    for (const type of objectTypes) {
      const label = type.label || type.id;
      const row = document.createElement('label');
      row.className = 'le-check-row';
      row.innerHTML = `<input data-random-object="${this._escape(type.id)}" type="checkbox" ${this.randomObjectPool.has(type.id) ? 'checked' : ''}><span>${this._escape(label)}</span>`;
      objectBody.appendChild(row);
    }
    objectSection.appendChild(objectBody);
    this.paletteEl.appendChild(objectSection);

    const modules = this.manager?.getRoadModules?.() || [];
    const moduleSection = document.createElement('section');
    moduleSection.className = 'le-category';
    moduleSection.innerHTML = `<button type="button" class="le-category-head"><span>道路模块池</span><span>${this.randomRoadModulePool.size}/${modules.length}</span></button>`;
    const moduleBody = document.createElement('div');
    moduleBody.className = 'le-category-body';
    for (const module of modules) {
      const row = document.createElement('label');
      row.className = 'le-check-row';
      row.innerHTML = `<input data-random-road-module="${this._escape(module.id)}" type="checkbox" ${this.randomRoadModulePool.has(module.id) ? 'checked' : ''}><span>${this._escape(module.label || module.id)}</span>`;
      moduleBody.appendChild(row);
    }
    moduleSection.appendChild(moduleBody);
    this.paletteEl.appendChild(moduleSection);
  }

  _renderRoadPalette() {
    const profiles = this.manager?.getRoadProfiles?.() || ROAD_PROFILE_OPTIONS.map(([id, label]) => ({ id, label }));
    const modules = this.manager?.getRoadModules?.() || [];
    this.paletteEl.textContent = '';
    const info = document.createElement('div');
    info.className = 'le-empty';
    info.textContent = '道路模式：选择模块后点击地面添加控制点；系统会沿曲线重复摆放基础模型模块，并用简化路面负责车辆物理。';
    this.paletteEl.appendChild(info);

    const roads = this.manager?.getRoads?.() || [];
    const roadSection = document.createElement('section');
    roadSection.className = 'le-category';
    const roadHead = document.createElement('button');
    roadHead.type = 'button';
    roadHead.className = 'le-category-head';
    roadHead.innerHTML = `<span>已有道路</span><span>${roads.length}</span>`;
    roadSection.appendChild(roadHead);
    const roadBody = document.createElement('div');
    roadBody.className = 'le-category-body';
    if (!roads.length) {
      const empty = document.createElement('div');
      empty.className = 'le-empty';
      empty.textContent = '还没有曲线道路。点击地面放第一个控制点，继续点击追加控制点。';
      roadBody.appendChild(empty);
    } else {
      for (const road of roads) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `le-object-card${this.selectedRoadId === road.id ? ' active' : ''}`;
        btn.dataset.roadSelect = road.id;
        const modeLabel = road.generationMode === 'deformModule'
          ? '模块弯曲'
          : road.generationMode === 'strip' ? '程序路面' : '引用模块';
        btn.innerHTML = `
          <span class="le-thumb">路</span>
          <span>
            <span class="le-object-name">${this._escape(road.note || road.id)}</span>
            <span class="le-object-meta">${modeLabel} · ${road.points?.length || 0} 个控制点 · ${this._escape(this._getRoadModuleLabel(road.moduleId))}</span>
          </span>
        `;
        roadBody.appendChild(btn);
      }
    }
    roadSection.appendChild(roadBody);
    this.paletteEl.appendChild(roadSection);

    const moduleSection = document.createElement('section');
    moduleSection.className = 'le-category';
    const moduleHead = document.createElement('button');
    moduleHead.type = 'button';
    moduleHead.className = 'le-category-head';
    moduleHead.innerHTML = `<span>基础模型模块</span><span>${modules.length}</span>`;
    moduleSection.appendChild(moduleHead);
    const moduleBody = document.createElement('div');
    moduleBody.className = 'le-category-body';
    for (const module of modules) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `le-object-card${this.selectedRoadModuleId === module.id ? ' active' : ''}`;
      btn.dataset.roadModule = module.id;
      btn.innerHTML = `
        <span class="le-thumb">模</span>
        <span><span class="le-object-name">${this._escape(module.label || module.id)}</span><span class="le-object-meta">${this._escape(module.url || 'builtin')} · ${Number(module.length || 0).toFixed(1)}m</span></span>
      `;
      moduleBody.appendChild(btn);
    }
    moduleSection.appendChild(moduleBody);
    this.paletteEl.appendChild(moduleSection);

    const section = document.createElement('section');
    section.className = 'le-category';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'le-category-head';
    head.innerHTML = `<span>道路材质/截面</span><span>${profiles.length}</span>`;
    section.appendChild(head);
    const body = document.createElement('div');
    body.className = 'le-category-body';
    for (const profile of profiles) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `le-object-card${this.selectedRoadProfile === profile.id ? ' active' : ''}`;
      btn.dataset.roadProfile = profile.id;
      btn.innerHTML = `
        <span class="le-thumb">路</span>
        <span><span class="le-object-name">${this._escape(profile.label || profile.id)}</span><span class="le-object-meta">${this._escape(profile.id)} · 曲线放样</span></span>
      `;
      body.appendChild(btn);
    }
    section.appendChild(body);
    this.paletteEl.appendChild(section);
  }

  _renderProperties() {
    if (this.toolMode === 'road') {
      this._renderRoadProperties();
      return;
    }
    if (this.toolMode === 'terrain') {
      this._renderTerrainProperties();
      return;
    }
    if (this.toolMode === 'random') {
      this._renderRandomProperties();
      return;
    }
    const selected = this._getSelectedObjects();
    if (!selected.length) {
      this.propertiesEl.innerHTML = '<div class="le-empty">未选中物体。点击场景内物体可编辑；按住 Shift 可多选；空白区域 Shift+拖拽可框选。</div>';
      return;
    }
    if (selected.length > 1) { this._renderMultiProperties(selected); return; }
    const obj = selected[0];
    const types = this.manager?.getTypes?.() || [];
    this.propertiesEl.innerHTML = `
      <div class="le-group"><div class="le-group-title">基础</div>
        <label class="le-field">编号<input value="${this._escape(obj.id)}" disabled></label>
        ${this._selectField('type', '类型', obj.type, types.map(t => [t.id, t.label || t.id]))}
        ${this._vectorFields(obj.position)}
        ${this._rangeField('rotationY', 'Y 旋转', obj.rotationY, -6.283, 6.283, 0.001)}
        ${this._rangeField('scale', '缩放', obj.scale, 0.35, 4, 0.01)}
        ${this._selectField('layer', '图层', obj.layer || 'default', this.layers.map(layer => [layer.id, layer.name]))}
      </div>
      <div class="le-group"><div class="le-group-title">物理</div>
        ${this._checkboxField('snapToGround', '吸附地面', obj.snapToGround)}
        ${this._rangeField('mass', '质量', obj.mass, 0, 500, 1)}
        ${this._rangeField('durability', '坚固度', obj.maxDurability || obj.durability, 1, 999, 1)}
        ${this._rangeField('collisionRadius', '碰撞半径', obj.collisionRadius, 0.25, 5, 0.01)}
        ${this._checkboxField('breakable', '可破坏', obj.breakable)}
        ${this._checkboxField('respawn', '破坏后重生', obj.respawn)}
        ${this._rangeField('respawnSeconds', '重生秒数', obj.respawnSeconds, 1, 120, 1)}
      </div>
      <div class="le-group"><div class="le-group-title">特效</div>
        ${this._selectField('effect', '触发效果', obj.effect || 'none', EFFECT_OPTIONS)}
        <label class="le-field">备注<input data-key="note" value="${this._escape(obj.note || '')}" placeholder="例如：弯道入口提示"></label>
      </div>
      <div class="le-prop-actions"><button class="le-btn" data-action="duplicate">复制</button><button class="le-btn le-danger" data-action="delete">删除</button></div>
    `;
  }

  _renderTerrainProperties() {
    const terrain = this.manager?.getTerrain?.(this.selectedTerrainId);
    if (!terrain) {
      this.propertiesEl.innerHTML = `
        <div class="le-empty">未选中地形。新建地形后，可用笔刷在场景里拖动雕刻。</div>
        <button class="le-btn le-primary" data-action="new-terrain">新建地形</button>
      `;
      return;
    }
    this.propertiesEl.innerHTML = `
      <div class="le-group"><div class="le-group-title">地形基础</div>
        <label class="le-field">编号<input value="${this._escape(terrain.id)}" disabled></label>
        ${this._rangeField('terrain.width', '宽度', terrain.width, 16, 1024, 1)}
        ${this._rangeField('terrain.depth', '深度', terrain.depth, 16, 1024, 1)}
        ${this._rangeField('terrain.segmentsX', '横向网格', terrain.segmentsX, 4, 128, 1)}
        ${this._rangeField('terrain.segmentsZ', '纵向网格', terrain.segmentsZ, 4, 128, 1)}
        ${this._vectorFieldsWithPrefix('terrain.position', terrain.position)}
        ${this._rangeField('terrain.baseHeight', '整体高度', terrain.baseHeight, -10, 20, 0.05)}
      </div>
      <div class="le-group"><div class="le-group-title">笔刷</div>
        ${this._selectField('brush.mode', '模式', this.terrainBrushMode, Object.entries(TERRAIN_BRUSH_LABELS))}
        ${this._rangeField('brush.radius', '半径', this.terrainBrushRadius, 1, 48, 0.5)}
        ${this._rangeField('brush.strength', '强度', this.terrainBrushStrength, 0.02, 3, 0.01)}
        ${this._rangeField('brush.flattenHeight', '夷平高度', this.terrainFlattenHeight, -10, 25, 0.05)}
      </div>
      <div class="le-group"><div class="le-group-title">材质与物理</div>
        <label class="le-field">颜色<input data-key="terrain.color" type="color" value="#${Number(terrain.color || 0).toString(16).padStart(6, '0').slice(-6)}"></label>
        ${this._rangeField('terrain.roughness', '粗糙度', terrain.roughness, 0, 1, 0.01)}
        ${this._checkboxField('terrain.generateCollision', '生成车辆物理', terrain.generateCollision)}
        ${this._checkboxField('terrain.visible', '显示地形', terrain.visible)}
        ${this._selectField('terrain.layer', '图层', terrain.layer || 'default', this.layers.map(layer => [layer.id, layer.name]))}
        <label class="le-field">备注<input data-key="terrain.note" value="${this._escape(terrain.note || '')}" placeholder="例如：山坡 / 草地 / 越野区域"></label>
      </div>
      <div class="le-prop-actions">
        <button class="le-btn" data-action="new-terrain">新建地形</button>
        <button class="le-btn" data-action="flatten-terrain">全部夷平</button>
        <button class="le-btn" data-action="reset-terrain">重置高度</button>
        <button class="le-btn le-danger" data-action="delete-terrain">删除地形</button>
      </div>
    `;
  }

  _renderRandomProperties() {
    this._ensureRandomPools();
    const s = this.randomSettings;
    this.propertiesEl.innerHTML = `
      <div class="le-group"><div class="le-group-title">生成内容</div>
        ${this._checkboxField('random.generateTerrain', '生成地形', s.generateTerrain)}
        ${this._checkboxField('random.generateRoad', '生成道路', s.generateRoad)}
        ${this._checkboxField('random.generateObjects', '生成物体/功能点', s.generateObjects)}
        ${this._checkboxField('random.closedRoad', '闭合跑道', s.closedRoad)}
      </div>
      <div class="le-group"><div class="le-group-title">关卡参数</div>
        <label class="le-field">种子<input data-key="random.seed" value="${this._escape(s.seed || '')}" placeholder="留空则随机"></label>
        ${this._rangeField('random.size', '关卡范围', s.size, 80, 600, 5)}
        ${this._rangeField('random.roadPoints', '道路点数', s.roadPoints, 4, 28, 1)}
        ${this._rangeField('random.roadRadius', '道路半径', s.roadRadius, 24, 240, 2)}
        ${this._rangeField('random.objectCount', '物体数量', s.objectCount, 0, 180, 1)}
        ${this._rangeField('random.terrainHeight', '地形起伏', s.terrainHeight, 0, 24, 0.25)}
      </div>
      <div class="le-group"><div class="le-group-title">资源池状态</div>
        <div class="le-empty">当前可用：${this.randomObjectPool.size} 个物体资源 / ${this.randomRoadModulePool.size} 个道路模块。左侧可勾选资源池。天空沿用当前关卡天空盒和天气设置。</div>
      </div>
      <div class="le-prop-actions">
        <button class="le-btn le-primary" data-action="generate-random-level">生成当前关卡</button>
        <button class="le-btn" data-action="random-select-all">资源全选</button>
      </div>
    `;
  }

  _renderRoadProperties() {
    const road = this.manager?.getRoad?.(this.selectedRoadId);
    if (!road) {
      this.propertiesEl.innerHTML = `
        <div class="le-empty">未选中道路。点击地面会创建一条新道路并添加第一个控制点；继续点击可追加控制点。</div>
        <button class="le-btn le-primary" data-action="new-road">新建道路</button>
      `;
      return;
    }
    const point = Number.isInteger(this.selectedRoadPointIndex) ? road.points[this.selectedRoadPointIndex] : null;
    const center = this._getRoadCenter(road.points || []);
    const profiles = this.manager?.getRoadProfiles?.() || ROAD_PROFILE_OPTIONS.map(([id, label]) => ({ id, label }));
    const modules = this.manager?.getRoadModules?.() || [];
    this.propertiesEl.innerHTML = `
      <div class="le-group"><div class="le-group-title">道路基础</div>
        <label class="le-field">编号<input value="${this._escape(road.id)}" disabled></label>
        ${this._selectField('road.profile', '基础类型', road.profile, profiles.map(profile => [profile.id, profile.label || profile.id]))}
        ${this._selectField('road.generationMode', '生成方式', road.generationMode || 'module', [['module', '引用模型模块'], ['deformModule', '模块跟随曲线弯曲'], ['strip', '程序放样路面']])}
        ${this._selectField('road.moduleId', '引用模块', road.moduleId || this.selectedRoadModuleId, modules.map(module => [module.id, module.label || module.id]))}
        ${this._rangeField('road.width', '道路宽度', road.width, 2, 32, 0.1)}
        ${this._rangeField('road.segmentLength', '放样精度', road.segmentLength, 0.75, 12, 0.25)}
        ${this._rangeField('road.textureScale', '贴图重复', road.textureScale, 1, 40, 0.5)}
        ${this._rangeField('road.banking', '弯道倾斜', road.banking, -20, 20, 0.5)}
        ${this._selectField('road.layer', '图层', road.layer || 'default', this.layers.map(layer => [layer.id, layer.name]))}
      </div>
      <div class="le-group"><div class="le-group-title">模型模块</div>
        ${this._rangeField('road.moduleSpacing', '模块间距', road.moduleSpacing || 7.8, 0.5, 40, 0.1)}
        ${this._rangeField('road.moduleScale', '模块缩放', road.moduleScale || 1, 0.05, 20, 0.01)}
        ${this._rangeField('road.moduleLateralOffset', '左右偏移', road.moduleLateralOffset || 0, -30, 30, 0.1)}
        ${this._rangeField('road.moduleYOffset', '高度偏移', road.moduleYOffset || 0, -5, 5, 0.01)}
        ${this._rangeField('road.moduleYawOffset', '朝向修正', road.moduleYawOffset || 0, -6.283, 6.283, 0.001)}
        ${this._checkboxField('road.stitchModules', '连接模块截面', road.stitchModules !== false)}
      </div>
      <div class="le-group"><div class="le-group-title">生成设置</div>
        ${this._checkboxField('road.snapToGround', '吸附地面', road.snapToGround)}
        ${this._checkboxField('road.closed', '闭合道路', road.closed)}
        ${this._checkboxField('road.generateCollision', '生成车辆物理', road.generateCollision)}
        ${this._checkboxField('road.generateAiLine', '生成 AI 线路', road.generateAiLine)}
        <label class="le-field">控制点<input value="${road.points.length}" disabled></label>
      </div>
      <div class="le-group"><div class="le-group-title">控制点 ${point ? `#${this.selectedRoadPointIndex + 1}` : ''}</div>
        ${point ? this._roadPointFields(point) : '<div class="le-empty">点击道路上的绿色控制点，可编辑它的 X/Y/Z 坐标。</div>'}
      </div>
      <div class="le-group"><div class="le-group-title">整体变换</div>
        <div class="le-empty">${point ? '当前选中的是单个控制点。点击下面“选择整条道路”后，可用底部 W/E/R 切换移动、旋转、缩放，三轴 Gizmo 会整体变换所有控制点。' : '当前选中的是整条道路。底部 W/E/R 可切换移动、旋转、缩放；拖动三轴 Gizmo 会一起变换所有控制点，并重新生成道路模型、车辆物理和 AI 线路。'}</div>
        <label class="le-field">中心 X<input value="${center.x.toFixed(2)}" disabled></label>
        <label class="le-field">中心 Y<input value="${center.y.toFixed(2)}" disabled></label>
        <label class="le-field">中心 Z<input value="${center.z.toFixed(2)}" disabled></label>
      </div>
      <div class="le-group"><div class="le-group-title">备注</div>
        <label class="le-field">备注<input data-key="road.note" value="${this._escape(road.note || '')}" placeholder="例如：主路 / 支路 / 维修区入口"></label>
      </div>
      <div class="le-prop-actions">
        <button class="le-btn" data-action="select-road-body" ${point ? '' : 'disabled'}>选择整条道路</button>
        <button class="le-btn" data-action="new-road">新建道路</button>
        <button class="le-btn" data-action="reverse-road">反转方向</button>
        <button class="le-btn le-danger" data-action="delete-road-point" ${point ? '' : 'disabled'}>删除点</button>
        <button class="le-btn le-danger" data-action="delete-road">删除道路</button>
      </div>
    `;
  }

  _renderMultiProperties(selected) {
    const common = this._getCommonProperties(selected);
    this.propertiesEl.innerHTML = `
      <div class="le-group"><div class="le-group-title">批量编辑 · ${selected.length} 个物体</div>
        <div class="le-empty">只显示公共属性。修改后会同时应用到所有已选物体。</div>
        ${this._selectField('layer', '图层', common.layer ?? '', [['', '保持不变'], ...this.layers.map(layer => [layer.id, layer.name])])}
        ${this._checkboxTriField('snapToGround', '吸附地面', common.snapToGround)}
        ${this._checkboxTriField('breakable', '可破坏', common.breakable)}
        ${this._rangeField('mass', '质量', common.mass ?? 0, 0, 500, 1, common.mass == null)}
        ${this._rangeField('durability', '坚固度', common.durability ?? 1, 1, 999, 1, common.durability == null)}
        ${this._rangeField('collisionRadius', '碰撞半径', common.collisionRadius ?? 1, 0.25, 5, 0.01, common.collisionRadius == null)}
      </div>
      <div class="le-prop-actions"><button class="le-btn" data-action="duplicate">批量复制</button><button class="le-btn le-danger" data-action="delete">批量删除</button></div>
    `;
  }

  _renderLayerList() {
    if (!this.layerListEl) return;
    this.layerListEl.innerHTML = this.layers.map(layer => `
      <div class="le-layer-row"><span>${this._escape(layer.name)}</span><button class="le-btn" data-action="toggle-layer" data-layer-id="${this._escape(layer.id)}">${layer.visible === false ? '隐' : '显'}</button><button class="le-btn" data-action="lock-layer" data-layer-id="${this._escape(layer.id)}">${layer.locked ? '锁' : '开'}</button></div>
    `).join('');
  }

  _handlePointerDown(event) {
    if (!this.visible || this._shouldIgnorePointerEvent(event)) return;
    if (event.button === 2) {
      event.preventDefault(); event.stopPropagation();
      this._pointerDrag = { type: 'camera', pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      this.domElement?.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const gizmoAxis = this._pickGizmo(event);
    const roadTransform = this._canTransformSelectedRoad();
    if (gizmoAxis && (this.selectedIds.length || roadTransform)) {
      event.preventDefault(); event.stopPropagation();
      const point = this._pickAxisPoint(event, gizmoAxis) || this._pickGround(event);
      this._pointerDrag = {
        type: 'gizmo',
        axis: gizmoAxis,
        pointerId: event.pointerId,
        startPoint: point ? point.clone() : null,
        startLayout: this._snapshotLayout(),
        startObjects: roadTransform ? [] : this._snapshotSelection(),
        startRoad: roadTransform ? this._snapshotRoadTransform() : null,
      };
      this.domElement?.setPointerCapture?.(event.pointerId);
      return;
    }
    if (this.toolMode === 'terrain') {
      if (this._handleTerrainPointerDown(event)) return;
    }
    if (this.toolMode === 'road') {
      if (this._handleRoadPointerDown(event)) return;
    }
    const picked = this._pickObject(event);
    if (event.shiftKey && !picked) {
      event.preventDefault(); event.stopPropagation();
      this._pointerDrag = { type: 'selectBox', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
      this._updateSelectionBox();
      return;
    }
    if (picked) {
      event.preventDefault(); event.stopPropagation();
      this._selectObject(picked, event.shiftKey);
      const obj = this.manager?.getObject?.(picked);
      const point = this._pickGround(event);
      this._pointerDrag = { type: 'object', pointerId: event.pointerId, objectId: picked, startPoint: point, startLayout: this._snapshotLayout(), offset: obj && point ? toVector3(obj.position).sub(point) : new THREE.Vector3() };
      this.domElement?.setPointerCapture?.(event.pointerId);
      return;
    }
    const pickedRoad = this._pickRoad(event);
    if (pickedRoad) {
      event.preventDefault(); event.stopPropagation();
      this._selectRoad(pickedRoad, null, '已进入道路编辑：拖动绿色控制点改曲线，右侧可改生成方式、模块、宽度和物理。');
      return;
    }
    const point = this._pickGround(event);
    if (!point) return;
    event.preventDefault(); event.stopPropagation();
    const before = this._snapshotLayout();
    const obj = this.manager?.addObject?.({ type: this.selectedType, position: point, snapToGround: this.snapEnabled }, { save: false });
    if (!obj) return;
    obj.layer = this.activeLayer || 'default';
    this.selectedIds = [obj.id];
    this._markDirty(false);
    this._pushHistory({ label: '放置物体', before, after: this._snapshotLayout() });
    this._removePreview();
    this._setStatus(`已放置 ${this._getTypeLabel(obj.type)}。`);
    this.refresh();
  }

  _handlePointerMove(event) {
    if (!this.visible) return;
    if (this._pointerDrag?.type === 'camera') {
      event.preventDefault(); event.stopPropagation();
      const dx = event.clientX - this._pointerDrag.x;
      const dy = event.clientY - this._pointerDrag.y;
      this._pointerDrag.x = event.clientX;
      this._pointerDrag.y = event.clientY;
      this.onCameraRotate?.(dx, dy);
      return;
    }
    if (this._pointerDrag?.type === 'selectBox') {
      event.preventDefault(); event.stopPropagation();
      this._pointerDrag.x = event.clientX;
      this._pointerDrag.y = event.clientY;
      this._updateSelectionBox();
      return;
    }
    if (this._pointerDrag?.type === 'roadPoint') {
      event.preventDefault(); event.stopPropagation();
      const point = this._pickGround(event);
      if (!point) return;
      const pos = point.clone().add(this._pointerDrag.offset || new THREE.Vector3());
      this.manager?.updateRoadPoint?.(this._pointerDrag.roadId, this._pointerDrag.pointIndex, pos, { save: false, snapToGround: this.snapEnabled });
      this._markDirty(false);
      this._updateRoadHelpers();
      this._renderProperties();
      return;
    }
    if (this._pointerDrag?.type === 'terrainBrush') {
      event.preventDefault(); event.stopPropagation();
      const hit = this._pickTerrain(event);
      if (!hit) return;
      this.selectedTerrainId = hit.terrainId;
      this._paintSelectedTerrain(hit.point);
      return;
    }
    if (this._pointerDrag?.type === 'object') {
      event.preventDefault(); event.stopPropagation();
      const point = this._pickGround(event);
      if (!point) return;
      const pos = point.clone().add(this._pointerDrag.offset || new THREE.Vector3());
      this.manager?.updateObject?.(this._pointerDrag.objectId, { position: pos, snapToGround: this.snapEnabled }, { save: false });
      this._markDirty(false);
      this._syncSelectionHelpers();
      this._renderProperties();
      return;
    }
    if (this._pointerDrag?.type === 'gizmo') {
      event.preventDefault(); event.stopPropagation();
      this._applyGizmoDrag(event);
      return;
    }
    if (this._shouldIgnorePointerEvent(event)) return;
    const point = this._pickGround(event);
    if (!point) return;
    this._lastPointerPoint = point;
    if (this.toolMode === 'terrain') {
      const hit = this._pickTerrain(event);
      this._updateTerrainBrushHelper(hit?.point || point);
      return;
    }
    if (this.toolMode === 'road') return;
    if (this.selectedIds.length) return;
    this._ensurePreview();
    if (this._preview) this._preview.position.copy(point);
  }

  _handlePointerUp(event) {
    if (!this.visible || !this._pointerDrag) return;
    const drag = this._pointerDrag;
    if (drag.type === 'object' || drag.type === 'gizmo' || drag.type === 'roadPoint' || drag.type === 'terrainBrush') {
      const after = this._snapshotLayout();
      if (this._layoutChanged(drag.startLayout, after)) {
        const label = drag.type === 'roadPoint'
          ? '移动道路控制点'
          : drag.type === 'terrainBrush' ? `地形笔刷：${TERRAIN_BRUSH_LABELS[this.terrainBrushMode] || this.terrainBrushMode}`
          : drag.type === 'gizmo' ? `${MODE_LABELS[this.editMode]}${drag.startRoad ? '道路' : '物体'}` : '移动物体';
        this._pushHistory({ label, before: drag.startLayout, after });
        this._markDirty(false);
      }
    } else if (drag.type === 'selectBox') {
      this._finishSelectionBox(event.shiftKey);
    }
    this._clearDrag();
    this.refresh();
  }

  _handleWheel(event) {
    if (!this.visible || this._shouldIgnorePointerEvent(event)) return;
    event.preventDefault(); event.stopPropagation();
    this.onCameraZoom?.(event.deltaY);
  }

  _handleKeyDown(event) {
    if (!this.visible || this.isTypingInEditor()) return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); event.stopPropagation(); this.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyY' || (event.shiftKey && event.code === 'KeyZ'))) { event.preventDefault(); event.stopPropagation(); this.redo(); return; }
    if (this.toolMode === 'road' && (event.code === 'Delete' || event.code === 'Backspace')) { event.preventDefault(); event.stopPropagation(); this._deleteRoadSelection(Boolean(this.selectedRoadPointIndex != null)); return; }
    if (this.toolMode === 'terrain' && (event.code === 'Delete' || event.code === 'Backspace')) { event.preventDefault(); event.stopPropagation(); this._deleteTerrain(); return; }
    if (event.code === 'Delete' || event.code === 'Backspace') { event.preventDefault(); event.stopPropagation(); this._deleteSelection(); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyD') { event.preventDefault(); event.stopPropagation(); this._duplicateSelection(); return; }
    if (event.code === 'KeyW') this._setEditMode('move');
    if (event.code === 'KeyE') this._setEditMode('rotate');
    if (event.code === 'KeyR') this._setEditMode('scale');
    if (event.code === 'KeyF') this.onCameraReset?.();
  }

  _handleCameraKey(event, pressed) {
    if (!this.visible || !EDITOR_CAMERA_KEY_CODES.has(event.code)) return;
    if (event.target?.matches?.(EDITOR_TEXT_INPUT_SELECTOR)) {
      if (!pressed) this._cameraKeys.delete(event.code);
      return;
    }
    if (pressed) this._cameraKeys.add(event.code);
    else this._cameraKeys.delete(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }

  _applyGizmoDrag(event) {
    const drag = this._pointerDrag;
    if (!drag?.axis || (!drag.startObjects?.length && !drag.startRoad)) return;
    const point = this._pickAxisPoint(event, drag.axis) || this._pickGround(event);
    if (!point || !drag.startPoint) return;
    const axisVector = this._getAxisVector(drag.axis);
    const amount = point.clone().sub(drag.startPoint).dot(axisVector);
    if (drag.startRoad) {
      this._applyRoadGizmoTransform(drag, axisVector, amount);
      this._markDirty(false);
      this._syncSelectionHelpers();
      this._updateRoadHelpers();
      this._renderProperties();
      return;
    }
    for (const start of drag.startObjects) {
      const obj = this.manager?.getObject?.(start.id);
      if (!obj || this._isLayerLocked(obj.layer)) continue;
      if (this.editMode === 'move') {
        const pos = toVector3(start.position).add(axisVector.clone().multiplyScalar(amount));
        this.manager.updateObject(obj.id, { position: pos, snapToGround: this.snapEnabled && drag.axis !== 'y' }, { save: false });
      } else if (this.editMode === 'scale') {
        const scale = clamp((start.scale || 1) + amount * 0.08, 0.35, 4, start.scale || 1);
        this.manager.updateObject(obj.id, { scale }, { save: false });
      } else if (this.editMode === 'rotate' && drag.axis === 'y') {
        let rotationY = (start.rotationY || 0) + amount * 0.05;
        if (this.rotationSnap) {
          const step = THREE.MathUtils.degToRad(15);
          rotationY = Math.round(rotationY / step) * step;
        }
        this.manager.updateObject(obj.id, { rotationY }, { save: false });
      }
    }
    this._markDirty(false);
    this._syncSelectionHelpers();
    this._renderProperties();
  }

  _snapshotRoadTransform() {
    const road = this.manager?.getRoad?.(this.selectedRoadId);
    if (!road?.points?.length) return null;
    return {
      id: road.id,
      points: road.points.map(point => ({ x: Number(point.x) || 0, y: Number(point.y) || 0, z: Number(point.z) || 0 })),
      center: this._getRoadCenter(road.points),
      snapToGround: road.snapToGround,
    };
  }

  _applyRoadGizmoTransform(drag, axisVector, amount) {
    const start = drag.startRoad;
    if (!start?.id || !start.points?.length || !start.center) return;
    const center = toVector3(start.center);
    let points = start.points.map(point => toVector3(point));
    const patch = {};
    if (this.editMode === 'move') {
      const offset = axisVector.clone().multiplyScalar(amount);
      points = points.map(point => point.add(offset));
      if (drag.axis === 'y') patch.snapToGround = false;
    } else if (this.editMode === 'scale') {
      const scale = clamp(1 + amount * 0.08, 0.1, 10, 1);
      points = points.map(point => center.clone().add(point.sub(center).multiplyScalar(scale)));
    } else if (this.editMode === 'rotate') {
      if (drag.axis !== 'y') return;
      let angle = amount * 0.05;
      if (this.rotationSnap) {
        const step = THREE.MathUtils.degToRad(15);
        angle = Math.round(angle / step) * step;
      }
      points = points.map(point => point.sub(center).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(center));
    } else {
      return;
    }
    patch.points = points.map(point => ({ x: point.x, y: point.y, z: point.z }));
    this.manager?.updateRoad?.(start.id, patch, { save: false });
  }

  _handleRoadPointerDown(event) {
    const pointHit = this._pickRoadPoint(event);
    if (pointHit) {
      event.preventDefault(); event.stopPropagation();
      const road = this.manager?.getRoad?.(pointHit.roadId);
      const ground = this._pickGround(event);
      const roadPoint = road?.points?.[pointHit.pointIndex];
      this._selectRoad(pointHit.roadId, pointHit.pointIndex);
      this._pointerDrag = {
        type: 'roadPoint',
        pointerId: event.pointerId,
        roadId: pointHit.roadId,
        pointIndex: pointHit.pointIndex,
        startLayout: this._snapshotLayout(),
        offset: roadPoint && ground ? toVector3(roadPoint).sub(ground) : new THREE.Vector3(),
      };
      this.domElement?.setPointerCapture?.(event.pointerId);
      this._setStatus(`已选中道路控制点 #${pointHit.pointIndex + 1}，拖动可调整曲线。`);
      return true;
    }

    const roadId = this._pickRoad(event);
    if (roadId) {
      event.preventDefault(); event.stopPropagation();
      this._selectRoad(roadId, null, '已选中道路。点击地面可继续追加控制点，点击绿色控制点可拖动或精确输入坐标。');
      return true;
    }

    const point = this._pickGround(event);
    if (!point) return false;
    event.preventDefault(); event.stopPropagation();
    const before = this._snapshotLayout();
    let road = this.manager?.getRoad?.(this.selectedRoadId);
    if (!road) {
      road = this.manager?.addRoad?.({
        profile: this.selectedRoadProfile,
        generationMode: 'module',
        moduleId: this.selectedRoadModuleId,
        points: [point],
        snapToGround: this.snapEnabled,
        layer: this.activeLayer || 'default',
      }, { save: false });
    } else {
      road = this.manager?.addRoadPoint?.(road.id, point, { save: false });
    }
    if (!road) return true;
    this.selectedIds = [];
    this.selectedRoadId = road.id;
    this.selectedRoadPointIndex = Math.max(0, road.points.length - 1);
    this._pushHistory({ label: road.points.length <= 1 ? '新建道路' : '添加道路控制点', before, after: this._snapshotLayout() });
    this._markDirty(false);
    this._updateRoadHelpers();
    this._setStatus(`已添加道路控制点 #${this.selectedRoadPointIndex + 1}。`);
    this.refresh();
    return true;
  }

  _handleTerrainPointerDown(event) {
    const hit = this._pickTerrain(event);
    if (!hit) {
      const terrain = this.manager?.getTerrain?.(this.selectedTerrainId);
      if (!terrain) this._setStatus('请先新建或选择一个地形，再使用笔刷。');
      return false;
    }
    event.preventDefault(); event.stopPropagation();
    this._selectTerrain(hit.terrainId);
    this._pointerDrag = {
      type: 'terrainBrush',
      pointerId: event.pointerId,
      terrainId: hit.terrainId,
      startLayout: this._snapshotLayout(),
    };
    this.domElement?.setPointerCapture?.(event.pointerId);
    this._paintSelectedTerrain(hit.point);
    return true;
  }

  _pickRoadPoint(event) {
    if (!this._roadHelperGroup?.visible) return null;
    this._setPointer(event);
    const hits = this._raycaster.intersectObjects(this._roadHelperGroup.children, true);
    const hit = hits.find(item => item.object?.userData?.roadPoint === true);
    if (!hit) return null;
    return {
      roadId: hit.object.userData.roadId,
      pointIndex: hit.object.userData.pointIndex,
    };
  }

  _pickRoad(event) {
    this._setPointer(event);
    const meshes = this.manager?.getRoadMeshes?.() || [];
    const hits = meshes.length ? this._raycaster.intersectObjects(meshes, true) : [];
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        if (node.userData?.editorRoadId) return node.userData.editorRoadId;
        node = node.parent;
      }
    }
    return null;
  }

  _pickTerrain(event) {
    this._setPointer(event);
    const meshes = this.manager?.getTerrainMeshes?.() || [];
    const hits = meshes.length ? this._raycaster.intersectObjects(meshes, true) : [];
    const hit = hits.find(item => item.object?.userData?.editorTerrainId);
    if (!hit) return null;
    return {
      terrainId: hit.object.userData.editorTerrainId,
      point: hit.point?.clone?.() || new THREE.Vector3(),
    };
  }

  _selectTerrain(terrainId, status = '') {
    const terrain = this.manager?.getTerrain?.(terrainId);
    if (!terrain) return false;
    this.toolMode = 'terrain';
    this.selectedIds = [];
    this.selectedRoadId = null;
    this.selectedRoadPointIndex = null;
    this.selectedTerrainId = terrain.id;
    this._removePreview();
    this._lastPropertySnapshot = this._snapshotLayout();
    if (status) this._setStatus(status);
    this.refresh();
    return true;
  }

  _paintSelectedTerrain(point) {
    const terrain = this.manager?.getTerrain?.(this.selectedTerrainId);
    if (!terrain || !point) return;
    this.manager?.paintTerrainAtPoint?.(terrain.id, point, {
      mode: this.terrainBrushMode,
      radius: this.terrainBrushRadius,
      strength: this.terrainBrushStrength,
      targetHeight: this.terrainFlattenHeight,
    }, { save: false });
    this._markDirty(false);
    this._lastPointerPoint = point.clone();
    this._updateTerrainBrushHelper(point);
    this._renderProperties();
  }

  _selectRoad(roadId, pointIndex = null, status = '') {
    const road = this.manager?.getRoad?.(roadId);
    if (!road) return false;
    if (road?.profile) this.selectedRoadProfile = road.profile;
    if (road?.moduleId) this.selectedRoadModuleId = road.moduleId;
    this.toolMode = 'road';
    this.selectedIds = [];
    this.selectedRoadId = road.id;
    this.selectedRoadPointIndex = Number.isInteger(pointIndex) ? pointIndex : null;
    this._removePreview();
    this._lastPropertySnapshot = this._snapshotLayout();
    if (status) this._setStatus(status);
    this.refresh();
    return true;
  }

  _startNewRoad() {
    this._setToolMode('road');
    this.selectedRoadId = null;
    this.selectedRoadPointIndex = null;
    this._setStatus('已准备新建道路：点击地面放置第一个控制点。');
    this.refresh();
  }

  _createTerrain() {
    const before = this._snapshotLayout();
    const center = this._lastPointerPoint || this._getSelectionCenter() || new THREE.Vector3();
    const terrain = this.manager?.addTerrain?.({
      position: { x: center.x || 0, y: 0, z: center.z || 0 },
      width: 160,
      depth: 160,
      segmentsX: 32,
      segmentsZ: 32,
      baseHeight: -0.04,
      note: '编辑器地形',
    }, { save: false });
    if (!terrain) return;
    this.selectedTerrainId = terrain.id;
    this.toolMode = 'terrain';
    const after = this._snapshotLayout();
    this._pushHistory({ label: '新建地形', before, after });
    this._markDirty(false);
    this._setStatus('已新建地形：在地形上拖动鼠标即可雕刻。');
    this.refresh();
  }

  _deleteTerrain() {
    const terrain = this.manager?.getTerrain?.(this.selectedTerrainId);
    if (!terrain) return;
    const before = this._snapshotLayout();
    this.manager?.removeTerrain?.(terrain.id, { save: false });
    this.selectedTerrainId = null;
    const after = this._snapshotLayout();
    this._pushHistory({ label: '删除地形', before, after });
    this._markDirty(false);
    this.refresh();
  }

  _resetTerrainHeights(useFlattenHeight = false) {
    const terrain = this.manager?.getTerrain?.(this.selectedTerrainId);
    if (!terrain) return;
    const before = this._snapshotLayout();
    const height = useFlattenHeight ? this.terrainFlattenHeight : terrain.baseHeight;
    const count = (terrain.segmentsX + 1) * (terrain.segmentsZ + 1);
    this.manager?.updateTerrain?.(terrain.id, {
      heights: Array(count).fill(height),
      baseHeight: height,
    }, { save: false });
    const after = this._snapshotLayout();
    this._pushHistory({ label: useFlattenHeight ? '夷平地形' : '重置地形高度', before, after });
    this._markDirty(false);
    this.refresh();
  }

  _ensureRandomPools() {
    if (this._randomPoolsInitialized) return;
    this.randomObjectPool = new Set((this.manager?.getTypes?.() || []).map(type => type.id));
    this.randomRoadModulePool = new Set((this.manager?.getRoadModules?.() || []).map(module => module.id));
    this._randomPoolsInitialized = true;
  }

  _selectAllRandomResources() {
    this._randomPoolsInitialized = false;
    this._ensureRandomPools();
    this._setStatus('随机关卡资源池已全选。');
    this.refresh();
  }

  _generateRandomLevel() {
    this._ensureRandomPools();
    const settings = this.randomSettings;
    const objectTypes = (this.manager?.getTypes?.() || []).filter(type => this.randomObjectPool.has(type.id));
    const modules = (this.manager?.getRoadModules?.() || []).filter(module => this.randomRoadModulePool.has(module.id));
    if (settings.generateObjects && !objectTypes.length) {
      this._setStatus('生成失败：物体资源池为空。');
      return;
    }
    if (settings.generateRoad && !modules.length) {
      this._setStatus('生成失败：道路模块池为空。');
      return;
    }
    if (!window.confirm('随机关卡会覆盖当前编辑布局，但可以用撤销恢复。继续生成吗？')) return;

    const before = this._snapshotLayout();
    const rng = this._makeRandom(settings.seed || `${Date.now()}-${Math.random()}`);
    const size = Number(settings.size) || 220;
    const roadRadius = Math.min(size * 0.48, Number(settings.roadRadius) || 64);
    const roadPoints = [];
    const pointCount = Math.round(clamp(settings.roadPoints, 4, 28, 12));
    const module = modules[Math.floor(rng() * modules.length)] || modules[0];
    const roadWidth = Math.max(6, Number(module?.width) || 8);

    if (settings.generateRoad) {
      if (settings.closedRoad) {
        for (let i = 0; i < pointCount; i++) {
          const angle = (i / pointCount) * Math.PI * 2;
          const radius = roadRadius * (0.78 + rng() * 0.38);
          roadPoints.push({
            x: Math.cos(angle) * radius,
            y: 0.08,
            z: Math.sin(angle) * radius,
          });
        }
      } else {
        for (let i = 0; i < pointCount; i++) {
          const t = pointCount <= 1 ? 0 : i / (pointCount - 1);
          roadPoints.push({
            x: (t - 0.5) * roadRadius * 2.2,
            y: 0.08,
            z: Math.sin(t * Math.PI * 2.4) * roadRadius * 0.42 + (rng() - 0.5) * 14,
          });
        }
      }
    }

    const terrains = [];
    if (settings.generateTerrain) {
      const segments = 44;
      const heights = [];
      const half = size * 0.5;
      for (let z = 0; z <= segments; z++) {
        const wz = -half + (z / segments) * size;
        for (let x = 0; x <= segments; x++) {
          const wx = -half + (x / segments) * size;
          const noise = this._terrainNoise(wx, wz, rng, settings.terrainHeight);
          const roadDist = roadPoints.length >= 2 ? this._distanceToPolylineXZ({ x: wx, z: wz }, roadPoints, Boolean(settings.closedRoad)) : Infinity;
          const roadBlend = roadDist < roadWidth * 2.6 ? Math.min(1, Math.max(0, (roadDist - roadWidth * 0.65) / Math.max(1, roadWidth * 1.95))) : 1;
          heights.push(noise * roadBlend - 0.06 * (1 - roadBlend));
        }
      }
      terrains.push({
        id: 'terrain-random-main',
        width: size,
        depth: size,
        segmentsX: segments,
        segmentsZ: segments,
        baseHeight: 0,
        position: { x: 0, y: 0, z: 0 },
        heights,
        color: 0x536f45,
        roughness: 0.98,
        generateCollision: true,
        note: '随机关卡地形',
      });
    }

    const roads = [];
    if (settings.generateRoad && roadPoints.length >= 2) {
      roads.push({
        id: 'road-random-main',
        profile: module?.profile || 'asphalt_2lane',
        generationMode: 'deformModule',
        moduleId: module?.id || 'asphalt_straight',
        moduleSpacing: module?.spacing || module?.length || 7.8,
        moduleScale: 1,
        moduleYOffset: 0.06,
        width: roadWidth,
        segmentLength: 1.6,
        textureScale: 9,
        banking: 0,
        snapToGround: false,
        generateCollision: true,
        generateAiLine: true,
        closed: Boolean(settings.closedRoad),
        layer: 'default',
        note: '随机生成主路',
        points: roadPoints,
      });
    }

    const objects = [];
    if (settings.generateObjects && objectTypes.length) {
      const boostTypes = objectTypes.filter(type => type.effect === 'boost' || /boost|nitro|pad/i.test(type.id));
      const count = Math.round(clamp(settings.objectCount, 0, 180, 42));
      for (let i = 0; i < count; i++) {
        const placeBoost = boostTypes.length && roadPoints.length >= 2 && i % 7 === 0;
        const type = placeBoost ? boostTypes[Math.floor(rng() * boostTypes.length)] : objectTypes[Math.floor(rng() * objectTypes.length)];
        let pos;
        let yaw = rng() * Math.PI * 2;
        if (placeBoost) {
          const idx = Math.floor(rng() * roadPoints.length);
          const a = roadPoints[idx];
          const b = roadPoints[(idx + 1) % roadPoints.length] || roadPoints[idx];
          const t = rng();
          pos = { x: a.x + (b.x - a.x) * t, y: 0.14, z: a.z + (b.z - a.z) * t };
          yaw = Math.atan2((b.x - a.x), (b.z - a.z));
        } else {
          for (let attempt = 0; attempt < 18; attempt++) {
            const angle = rng() * Math.PI * 2;
            const radius = (0.18 + rng() * 0.78) * size * 0.5;
            const candidate = { x: Math.cos(angle) * radius, y: 0.12, z: Math.sin(angle) * radius };
            const roadDist = roadPoints.length >= 2 ? this._distanceToPolylineXZ(candidate, roadPoints, Boolean(settings.closedRoad)) : Infinity;
            if (roadDist > roadWidth * 1.35 || attempt > 12) {
              pos = candidate;
              break;
            }
          }
        }
        objects.push({
          type: type.id,
          position: pos || { x: 0, y: 0.12, z: 0 },
          rotationY: yaw,
          scale: 0.85 + rng() * 0.55,
          snapToGround: true,
          layer: 'default',
          note: placeBoost ? '随机功能点' : '随机摆放物',
        });
      }
    }

    const layout = { version: 4, objects, roads, terrains };
    const result = this.manager?.replaceCurrentTrackLayout?.(layout, { save: false });
    if (result?.ok === false) {
      this._setStatus(`随机关卡生成失败：${result.error?.message || '布局无效'}`);
      return;
    }
    this.selectedIds = [];
    this.selectedRoadId = roads[0]?.id || null;
    this.selectedRoadPointIndex = null;
    this.selectedTerrainId = terrains[0]?.id || null;
    this.toolMode = roads.length ? 'road' : terrains.length ? 'terrain' : 'object';
    this._pushHistory({ label: '生成随机关卡', before, after: this._snapshotLayout() });
    this._markDirty(false);
    this._setStatus(`已生成随机关卡：${objects.length} 个物体 / ${roads.length} 条道路 / ${terrains.length} 个地形。保存后写入当前关卡。`);
    this.refresh();
  }

  _makeRandom(seed) {
    let h = 2166136261;
    const text = String(seed || 'street-racer');
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _terrainNoise(x, z, rng, amplitude = 5) {
    const a = Number(amplitude) || 0;
    const wave = Math.sin(x * 0.035 + 1.7) * Math.cos(z * 0.031 - 0.8);
    const ridge = Math.sin((x + z) * 0.018) * 0.55;
    const micro = (rng() - 0.5) * 0.22;
    return (wave * 0.62 + ridge * 0.28 + micro) * a;
  }

  _distanceToPolylineXZ(point, points = [], closed = false) {
    if (points.length < 2) return Infinity;
    let best = Infinity;
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lenSq = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.z - a.z) * abz) / lenSq));
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      best = Math.min(best, Math.hypot(point.x - px, point.z - pz));
    }
    return best;
  }

  _deleteRoadSelection(pointOnly = false) {
    const road = this.manager?.getRoad?.(this.selectedRoadId);
    if (!road) return;
    const before = this._snapshotLayout();
    if (pointOnly && Number.isInteger(this.selectedRoadPointIndex)) {
      this.manager?.removeRoadPoint?.(road.id, this.selectedRoadPointIndex, { save: false });
      const updated = this.manager?.getRoad?.(road.id);
      this.selectedRoadPointIndex = updated?.points?.length
        ? Math.min(this.selectedRoadPointIndex, updated.points.length - 1)
        : null;
    } else {
      this.manager?.removeRoad?.(road.id, { save: false });
      this.selectedRoadId = null;
      this.selectedRoadPointIndex = null;
    }
    const after = this._snapshotLayout();
    if (this._layoutChanged(before, after)) {
      this._pushHistory({ label: pointOnly ? '删除道路控制点' : '删除道路', before, after });
      this._markDirty(false);
    }
    this._updateRoadHelpers();
    this.refresh();
  }

  _reverseSelectedRoad() {
    const road = this.manager?.getRoad?.(this.selectedRoadId);
    if (!road || road.points.length < 2) return;
    const before = this._snapshotLayout();
    this.manager?.updateRoad?.(road.id, { points: [...road.points].reverse() }, { save: false });
    if (Number.isInteger(this.selectedRoadPointIndex)) {
      this.selectedRoadPointIndex = road.points.length - 1 - this.selectedRoadPointIndex;
    }
    const after = this._snapshotLayout();
    this._pushHistory({ label: '反转道路方向', before, after });
    this._markDirty(false);
    this._updateRoadHelpers();
    this.refresh();
  }

  _selectObject(id, additive = false) {
    if (!id) return;
    this.toolMode = 'object';
    this.selectedRoadId = null;
    this.selectedRoadPointIndex = null;
    const obj = this.manager?.getObject?.(id);
    if (obj && this._isLayerLocked(obj.layer)) { this._setStatus('该物体所在图层已锁定，不能选择。'); return; }
    if (additive) {
      const set = new Set(this.selectedIds);
      set.has(id) ? set.delete(id) : set.add(id);
      this.selectedIds = [...set];
    } else {
      this.selectedIds = [id];
    }
    this._lastPropertySnapshot = this._snapshotSelection();
    this.refresh();
  }

  _deleteSelection() {
    if (!this.selectedIds.length) return;
    const before = this._snapshotLayout();
    for (const id of [...this.selectedIds]) {
      const obj = this.manager?.getObject?.(id);
      if (obj && this._isLayerLocked(obj.layer)) continue;
      this.manager?.removeObject?.(id, { save: false });
    }
    this.selectedIds = [];
    const after = this._snapshotLayout();
    if (this._layoutChanged(before, after)) { this._pushHistory({ label: '删除物体', before, after }); this._markDirty(false); this._setStatus('已删除选中物体。'); }
    this.refresh();
  }

  _duplicateSelection() {
    if (!this.selectedIds.length) return;
    const before = this._snapshotLayout();
    const newIds = [];
    for (const id of this.selectedIds) {
      const obj = this.manager?.getObject?.(id);
      if (obj && this._isLayerLocked(obj.layer)) continue;
      const copy = this.manager?.duplicateObject?.(id, { save: false });
      if (copy) { copy.layer = obj?.layer || 'default'; newIds.push(copy.id); }
    }
    if (newIds.length) {
      this.selectedIds = newIds;
      this._pushHistory({ label: '复制物体', before, after: this._snapshotLayout() });
      this._markDirty(false);
      this._setStatus(`已复制 ${newIds.length} 个物体。`);
      this.refresh();
    }
  }

  _handlePropertyInput(event, commit = false) {
    const input = event.target;
    if (!input?.dataset?.key) return;
    const key = input.dataset.key;
    if (key.startsWith('road.')) {
      this._handleRoadPropertyInput(input, commit);
      return;
    }
    if (key.startsWith('terrain.') || key.startsWith('brush.')) {
      this._handleTerrainPropertyInput(input, commit);
      return;
    }
    if (key.startsWith('random.')) {
      this._handleRandomPropertyInput(input);
      return;
    }
    if (!this.selectedIds.length) return;
    const selected = this._getSelectedObjects().filter(obj => !this._isLayerLocked(obj.layer));
    if (!selected.length) return;
    if (input.dataset.mixed === 'true' && !commit) return;
    const value = this._readInputValue(input);
    if (value === undefined) return;
    const patch = {};
    if (key.startsWith('position.')) {
      const axis = key.split('.')[1];
      for (const obj of selected) this.manager.updateObject(obj.id, { position: { ...obj.position, [axis]: value }, snapToGround: axis === 'y' ? false : obj.snapToGround }, { save: false });
    } else if (key === 'durability') patch.durability = value;
    else if (key === 'note' || key === 'layer') { if (value !== '') for (const obj of selected) obj[key] = value; }
    else if (key === 'snapToGround') {
      patch.snapToGround = value;
      if (value) for (const obj of selected) this.manager.updateObject(obj.id, { snapToGround: true, position: obj.position }, { save: false });
    } else patch[key] = value;
    if (Object.keys(patch).length) for (const obj of selected) this.manager.updateObject(obj.id, patch, { save: false });
    this._markDirty(false);
    this._syncLinkedInputs(input);
    this._syncSelectionHelpers();
    if (commit) {
      const before = this._lastPropertySnapshot?.length ? this._replaceSelectionInLayout(this._snapshotLayout(), this._lastPropertySnapshot) : null;
      const after = this._snapshotLayout();
      if (before && this._layoutChanged(before, after)) this._pushHistory({ label: '修改属性', before, after });
      this._lastPropertySnapshot = this._snapshotSelection();
      this.refresh();
    }
  }

  _handleRoadPropertyInput(input, commit = false) {
    const road = this.manager?.getRoad?.(this.selectedRoadId);
    if (!road) return;
    const key = input.dataset.key;
    const value = this._readInputValue(input);
    if (value === undefined) return;

    if (key.startsWith('road.point.')) {
      if (!Number.isInteger(this.selectedRoadPointIndex) || !road.points[this.selectedRoadPointIndex]) return;
      const axis = key.split('.')[2];
      const point = { ...road.points[this.selectedRoadPointIndex], [axis]: value };
      this.manager?.updateRoadPoint?.(road.id, this.selectedRoadPointIndex, point, { save: false, snapToGround: axis === 'y' ? false : road.snapToGround });
    } else {
      const prop = key.replace(/^road\./, '');
      this.manager?.updateRoad?.(road.id, { [prop]: value }, { save: false });
      if (prop === 'profile') this.selectedRoadProfile = value;
      if (prop === 'moduleId') {
        this.selectedRoadModuleId = value;
        const module = this.manager?.getRoadModules?.().find(item => item.id === value);
        if (module?.profile) this.selectedRoadProfile = module.profile;
      }
    }

    this._markDirty(false);
    this._syncLinkedInputs(input);
    this._updateRoadHelpers();
    if (commit) {
      const before = this._lastPropertySnapshot || null;
      const after = this._snapshotLayout();
      if (before && this._layoutChanged(before, after)) this._pushHistory({ label: '修改道路属性', before, after });
      this._lastPropertySnapshot = this._snapshotLayout();
      this.refresh();
    }
  }

  _handleTerrainPropertyInput(input, commit = false) {
    const key = input.dataset.key;
    const value = this._readInputValue(input);
    if (value === undefined) return;
    if (key.startsWith('brush.')) {
      const prop = key.replace(/^brush\./, '');
      if (prop === 'mode') this.terrainBrushMode = value;
      else if (prop === 'radius') this.terrainBrushRadius = value;
      else if (prop === 'strength') this.terrainBrushStrength = value;
      else if (prop === 'flattenHeight') this.terrainFlattenHeight = value;
      this._syncLinkedInputs(input);
      this._updateTerrainBrushHelper(this._lastPointerPoint);
      if (commit) this.refresh();
      return;
    }
    const terrain = this.manager?.getTerrain?.(this.selectedTerrainId);
    if (!terrain) return;
    const before = commit ? this._lastPropertySnapshot : null;
    const prop = key.replace(/^terrain\./, '');
    const patch = {};
    if (key.startsWith('terrain.position.')) {
      const axis = key.split('.')[2];
      patch.position = { ...terrain.position, [axis]: value };
    } else if (prop === 'color') {
      patch.color = value;
    } else {
      patch[prop] = value;
    }
    this.manager?.updateTerrain?.(terrain.id, patch, { save: false });
    this._markDirty(false);
    this._syncLinkedInputs(input);
    this._updateTerrainBrushHelper(this._lastPointerPoint);
    if (commit) {
      const after = this._snapshotLayout();
      if (before && this._layoutChanged(before, after)) this._pushHistory({ label: '修改地形属性', before, after });
      this._lastPropertySnapshot = this._snapshotLayout();
      this.refresh();
    }
  }

  _handleRandomPropertyInput(input) {
    const key = input.dataset.key.replace(/^random\./, '');
    const value = this._readInputValue(input);
    if (value === undefined && key !== 'seed') return;
    this.randomSettings[key] = value ?? '';
    this._syncLinkedInputs(input);
  }

  undo() {
    const entry = this._history.pop();
    if (!entry) return;
    this._redoStack.push({ ...entry, before: cloneLayout(entry.before), after: cloneLayout(entry.after) });
    this._applyLayout(entry.before, { keepDirty: true });
    this._markDirty(false);
    this._setStatus(`已撤销：${entry.label}`);
    this.refresh();
  }

  redo() {
    const entry = this._redoStack.pop();
    if (!entry) return;
    this._history.push({ ...entry, before: cloneLayout(entry.before), after: cloneLayout(entry.after) });
    this._applyLayout(entry.after, { keepDirty: true });
    this._markDirty(false);
    this._setStatus(`已重做：${entry.label}`);
    this.refresh();
  }

  _pushHistory(entry) {
    if (this._suspendHistory || !entry || !this._layoutChanged(entry.before, entry.after)) return;
    this._history.push({ label: entry.label || '编辑', before: cloneLayout(entry.before), after: cloneLayout(entry.after) });
    if (this._history.length > HISTORY_LIMIT) this._history.shift();
    this._redoStack.length = 0;
    this._updateHistoryButtons();
  }

  _applyLayout(layout, options = {}) {
    this._suspendHistory = true;
    this.manager?.replaceCurrentTrackLayout?.(cloneLayout(layout), { save: false });
    this._suspendHistory = false;
    this.selectedIds = this.selectedIds.filter(id => this.manager?.getObject?.(id));
    if (this.selectedRoadId && !this.manager?.getRoad?.(this.selectedRoadId)) {
      this.selectedRoadId = null;
      this.selectedRoadPointIndex = null;
    }
    if (this.selectedTerrainId && !this.manager?.getTerrain?.(this.selectedTerrainId)) this.selectedTerrainId = null;
    if (!options.keepDirty) this._dirty = false;
  }

  _snapshotLayout() { return cloneLayout(this.manager?.getCurrentEditorState?.() || this.manager?.getCurrentLayout?.() || this.manager?.getEditableObjects?.() || []); }
  _snapshotSelection() { return this._getSelectedObjects().map(obj => this.manager?.serializeObject?.(obj) || { ...obj }); }
  _replaceSelectionInLayout(layout, selection) {
    const map = new Map(selection.map(item => [item.id, item]));
    if (Array.isArray(layout)) return layout.map(item => map.get(item.id) || item);
    const copy = cloneLayout(layout);
    copy.objects = (copy.objects || []).map(item => map.get(item.id) || item);
    return copy;
  }
  _layoutChanged(a, b) { return JSON.stringify(a || []) !== JSON.stringify(b || []); }

  _saveCurrentTrack(announce = true, options = {}) {
    const result = this.manager?.saveCurrentTrack?.() || { ok: false, count: 0, trackId: this.trackId };
    if (result.ok !== false) this._dirty = false;
    if (announce) this._setStatus(result.ok === false ? `保存失败：${result.error?.message || '无法写入本地存储'}` : `已保存 ${result.count} 个物体 / ${result.roadCount || 0} 条道路 / ${result.terrainCount || 0} 个地形到 ${result.trackId}。`);
    else if (options.auto && result.ok !== false) this._setStatus(`已自动保存 ${result.count} 个物体 / ${result.roadCount || 0} 条道路 / ${result.terrainCount || 0} 个地形。`);
    this.onSave?.(result);
    this.refresh();
    return result;
  }

  async _requestTrackChange(trackId) {
    const nextTrackId = String(trackId || '').replace(/-/g, '_');
    if (!nextTrackId || nextTrackId === this.trackId) return;
    if (this._dirty) {
      const ok = window.confirm('当前关卡有未保存改动，切换前是否保存？\n确定：保存并切换。取消：不切换。');
      if (!ok) { this.trackSelect.value = this.trackId; return; }
      const result = this._saveCurrentTrack(false);
      if (result.ok === false) { this.trackSelect.value = this.trackId; this._setStatus('保存失败，已取消切换关卡。'); return; }
    }
    this._setStatus(`正在切换到 ${nextTrackId}...`);
    if (this.onTrackChange) {
      const result = await this.onTrackChange(nextTrackId);
      if (result?.ok === false) { this.trackSelect.value = this.trackId; this._setStatus(`切换失败：${result.error?.message || '未知错误'}`); return; }
    }
    this.trackId = nextTrackId;
    this.selectedIds = [];
    this._history = [];
    this._redoStack = [];
    this._dirty = false;
    this._setStatus(`已切换到 ${nextTrackId}。`);
    this.refresh();
  }

  _resetCurrentTrack() {
    if (!window.confirm('确定要清空当前关卡的所有编辑器物体吗？此操作可用撤销恢复。')) return;
    const before = this._snapshotLayout();
    this.manager?.resetCurrentTrack?.({ save: false });
    this.selectedIds = [];
    const after = this._snapshotLayout();
    this._pushHistory({ label: '重置关卡', before, after });
    this._markDirty(false);
    this._setStatus('当前关卡已清空，保存后会写入空布局。');
    this.refresh();
  }

  _exportJson() {
    const layout = this._snapshotLayout();
    const payload = {
      version: 4,
      exportedAt: new Date().toISOString(),
      trackId: this.trackId,
      objects: Array.isArray(layout) ? layout : (layout.objects || []),
      roads: Array.isArray(layout) ? [] : (layout.roads || []),
      terrains: Array.isArray(layout) ? [] : (layout.terrains || []),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `level-layout-${this.trackId}-${this._timestamp()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this._setStatus(`已导出 ${payload.objects.length} 个物体 / ${payload.roads.length} 条道路 / ${payload.terrains.length} 个地形。`);
  }

  async _handleImportFile() {
    const file = this._importInput.files?.[0];
    this._importInput.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const normalized = this.manager?.normalizeImportPayload?.(payload);
      if (!normalized?.ok) throw normalized?.error || new Error('导入格式不正确。');
      const objectCount = Array.isArray(normalized.layout) ? normalized.layout.length : (normalized.layout.objects?.length || 0);
      const roadCount = Array.isArray(normalized.layout) ? 0 : (normalized.layout.roads?.length || 0);
      const terrainCount = Array.isArray(normalized.layout) ? 0 : (normalized.layout.terrains?.length || 0);
      if (!window.confirm(`导入会覆盖当前关卡布局，共 ${objectCount} 个物体 / ${roadCount} 条道路 / ${terrainCount} 个地形。继续吗？`)) return;
      const before = this._snapshotLayout();
      const result = this.manager?.replaceCurrentTrackLayout?.(normalized.layout, { save: false });
      if (result?.ok === false) throw result.error || new Error('导入失败。');
      this.selectedIds = [];
      this._pushHistory({ label: '导入 JSON', before, after: this._snapshotLayout() });
      this._markDirty(false);
      this._setStatus(`导入完成：${objectCount} 个物体 / ${roadCount} 条道路 / ${terrainCount} 个地形。`);
      this.refresh();
    } catch (err) {
      console.warn('[LevelEditorUI] Import failed:', err);
      this._setStatus(`导入失败：${err.message || err}`);
    }
  }

  _exitEditor() { if (this._dirty) this._saveCurrentTrack(false); this.onExit?.(); }
  _startAutosave() { this._stopAutosave(); this._autosaveTimer = window.setInterval(() => { if (this.visible && this._dirty) this._saveCurrentTrack(false, { auto: true }); }, AUTOSAVE_MS); }
  _stopAutosave() { if (this._autosaveTimer) window.clearInterval(this._autosaveTimer); this._autosaveTimer = null; }

  _pickObject(event) {
    this._setPointer(event);
    const meshes = this.manager?.getMeshes?.() || [];
    const hits = this._raycaster.intersectObjects(meshes, true).filter(hit => hit.object?.visible !== false);
    for (const hit of hits) {
      const id = hit.object?.userData?.interactiveId;
      if (!id) continue;
      const obj = this.manager?.getObject?.(id);
      if (obj && this._isLayerVisible(obj.layer)) return id;
    }
    return null;
  }

  _pickGizmo(event) {
    if (!this._gizmo?.visible) return null;
    this._setPointer(event);
    const hits = this._raycaster.intersectObjects(this._gizmo.children, true);
    return hits[0]?.object?.userData?.gizmoAxis || hits[0]?.object?.parent?.userData?.gizmoAxis || null;
  }

  _pickGround(event) {
    this._setPointer(event);
    const groundMeshes = [
      ...(this.manager?.getTerrainMeshes?.() || []),
      ...(this.trackManager?.getCameraGroundMeshes?.() || []),
    ];
    const hits = groundMeshes.length ? this._raycaster.intersectObjects(groundMeshes, true) : [];
    const point = hits[0]?.point?.clone?.() || new THREE.Vector3();
    if (!hits.length && !this._raycaster.ray.intersectPlane(this._groundPlane, point)) return null;
    const roadPoint = this.trackManager?.getRoadInfoAtPosition?.(point, { preciseHeight: true })?.point;
    if (roadPoint && Number.isFinite(roadPoint.y)) point.y = roadPoint.y;
    return point;
  }

  _pickAxisPoint(event, axis) {
    this._setPointer(event);
    const selected = this._getSelectionCenter();
    if (!selected) return null;
    const axisVector = this._getAxisVector(axis);
    const cameraDir = new THREE.Vector3();
    this.camera?.getWorldDirection?.(cameraDir);
    const planeNormal = new THREE.Vector3().crossVectors(axisVector, cameraDir).cross(axisVector).normalize();
    if (planeNormal.lengthSq() < 0.0001) planeNormal.set(0, 1, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, selected);
    const point = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(plane, point) ? point : null;
  }

  _setPointer(event) {
    const rect = this.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
  }

  _ensurePreview() {
    if (this._preview || !this.manager) return;
    this._preview = this.manager.createPreviewMesh(this.selectedType);
    this._preview.name = 'interactive-placement-preview';
    this._preview.traverse(child => {
      if (!child.isMesh) return;
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = 0.44;
      child.material.depthWrite = false;
    });
    this.manager.group.add(this._preview);
  }

  _removePreview() {
    if (!this._preview) return;
    if (this._preview.parent) this._preview.parent.remove(this._preview);
    this._preview.traverse(child => { child.geometry?.dispose?.(); if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose?.()); else child.material?.dispose?.(); });
    this._preview = null;
  }

  _shouldIgnorePointerEvent(event) {
    const target = event.target;
    if (!target) return false;
    if (this.root.contains(target)) return true;
    return Boolean(target.closest?.(CONTROL_IGNORE_SELECTOR));
  }

  _clearDrag() {
    if (this._pointerDrag?.pointerId != null) { try { this.domElement?.releasePointerCapture?.(this._pointerDrag.pointerId); } catch {} }
    this._pointerDrag = null;
    this.selectionBoxEl.style.display = 'none';
  }

  _setToolMode(tool) {
    if (!TOOL_LABELS[tool]) return;
    this.toolMode = tool;
    if (tool === 'road') {
      this.selectedIds = [];
      this.selectedTerrainId = null;
      this._removePreview();
    } else if (tool === 'terrain') {
      this.selectedIds = [];
      this.selectedRoadId = null;
      this.selectedRoadPointIndex = null;
      this._removePreview();
    } else if (tool === 'random') {
      this.selectedIds = [];
      this.selectedRoadId = null;
      this.selectedRoadPointIndex = null;
      this.selectedTerrainId = null;
      this._removePreview();
    } else {
      this.selectedRoadId = null;
      this.selectedRoadPointIndex = null;
      this.selectedTerrainId = null;
      this._setTerrainBrushHelperVisible(false);
    }
    this._setStatus(`编辑工具：${TOOL_LABELS[tool]}。`);
    this._syncModeButtons();
    this._updateRoadHelpers();
    this._updateTerrainBrushHelper(this._lastPointerPoint);
    this.refresh();
  }
  _setEditMode(mode) { if (!MODE_LABELS[mode]) return; this.editMode = mode; this._setStatus(`编辑模式：${MODE_LABELS[mode]}。`); this._syncModeButtons(); this._syncSelectionHelpers(); }
  _toggleSpaceMode() { this.spaceMode = this.spaceMode === 'world' ? 'local' : 'world'; this._setStatus(`Gizmo 空间：${this.spaceMode === 'world' ? '世界' : '本地'}。`); this._syncModeButtons(); }
  _toggleGrid() { this.gridVisible = !this.gridVisible; this._setGridVisible(this.gridVisible); this._syncModeButtons(); }
  _toggleCollisionHelpers() { this.collisionVisible = !this.collisionVisible; this._updateCollisionHelpers(); this._syncModeButtons(); }
  _toggleRotationSnap() { this.rotationSnap = !this.rotationSnap; this._syncModeButtons(); this._setStatus(`旋转角度吸附：${this.rotationSnap ? '开启' : '关闭'}。`); }

  _syncModeButtons() {
    this.modeBar?.querySelectorAll('[data-tool]').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === this.toolMode));
    this.modeBar?.querySelectorAll('[data-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === this.editMode));
    const spaceBtn = this.modeBar?.querySelector('[data-space="toggle"]');
    if (spaceBtn) { spaceBtn.textContent = this.spaceMode === 'world' ? '世界' : '本地'; spaceBtn.classList.toggle('active', this.spaceMode === 'local'); }
    this.modeBar?.querySelector('[data-toggle="grid"]')?.classList.toggle('active', this.gridVisible);
    this.modeBar?.querySelector('[data-toggle="collision"]')?.classList.toggle('active', this.collisionVisible);
    this.modeBar?.querySelector('[data-toggle="snap"]')?.classList.toggle('active', this.rotationSnap);
  }

  _updateHistoryButtons() {
    const undo = this.root?.querySelector('[data-action="undo"]');
    const redo = this.root?.querySelector('[data-action="redo"]');
    if (undo) undo.disabled = this._history.length === 0;
    if (redo) redo.disabled = this._redoStack.length === 0;
  }

  _updateSceneHelpers() { this._setGridVisible(this.gridVisible); this._syncSelectionHelpers(); this._updateCollisionHelpers(); this._updateRoadHelpers(); this._updateTerrainBrushHelper(this._lastPointerPoint); }
  _setGridVisible(visible) { if (this._gridHelper) this._gridHelper.visible = this.visible && visible; const center = this._getSelectionCenter() || this._lastPointerPoint; if (this._gridHelper && center) this._gridHelper.position.set(center.x, center.y + 0.015, center.z); }
  _syncSelectionHelpers() {
    const center = this._getSelectionCenter();
    if (!center || (!this.selectedIds.length && !this._canTransformSelectedRoad())) {
      this._setGizmoVisible(false);
      return;
    }
    this._gizmo.position.copy(center);
    this._gizmo.scale.setScalar(this.editMode === 'scale' ? 1.25 : this.editMode === 'rotate' ? 1.45 : 1);
    this._setGizmoVisible(true);
  }
  _setGizmoVisible(visible) { if (this._gizmo) this._gizmo.visible = this.visible && visible; }

  _updateTerrainBrushHelper(point = null) {
    if (!this._terrainBrushHelper) return;
    if (!this.visible || this.toolMode !== 'terrain' || !this.selectedTerrainId || !point) {
      this._setTerrainBrushHelperVisible(false);
      return;
    }
    this._terrainBrushHelper.position.set(point.x, point.y + 0.08, point.z);
    this._terrainBrushHelper.scale.setScalar(Math.max(0.1, this.terrainBrushRadius || 1));
    this._setTerrainBrushHelperVisible(true);
  }

  _setTerrainBrushHelperVisible(visible) {
    if (this._terrainBrushHelper) this._terrainBrushHelper.visible = this.visible && visible;
  }

  _updateCollisionHelpers() {
    this._clearCollisionHelpers(false);
    if (!this.visible || !this.collisionVisible) return;
    for (const obj of this.manager?.objects || []) {
      if (!this._isLayerVisible(obj.layer)) continue;
      const geometry = new THREE.RingGeometry(Math.max(0.05, obj.collisionRadius * obj.scale - 0.025), obj.collisionRadius * obj.scale + 0.025, 40);
      const material = new THREE.MeshBasicMaterial({ color: obj.breakable ? 0xffd166 : 0x78f0c2, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(geometry, material);
      ring.name = `collision-radius-${obj.id}`;
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(obj.position.x, obj.position.y + 0.045, obj.position.z);
      this.manager?.group?.add?.(ring);
      this._collisionHelpers.set(obj.id, ring);
    }
  }

  _clearCollisionHelpers() { for (const helper of this._collisionHelpers.values()) { if (helper.parent) helper.parent.remove(helper); helper.geometry?.dispose?.(); helper.material?.dispose?.(); } this._collisionHelpers.clear(); }
  _updateRoadHelpers() {
    this._clearRoadHelpers(false);
    if (!this.visible || this.toolMode !== 'road' || !this._roadHelperGroup) {
      if (this._roadHelperGroup) this._roadHelperGroup.visible = false;
      return;
    }
    this._roadHelperGroup.visible = true;
    for (const road of this.manager?.getRoads?.() || []) {
      const selectedRoad = road.id === this.selectedRoadId;
      const points = road.points || [];
      if (points.length >= 2) {
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(point.x, point.y + 0.18, point.z)));
        const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
          color: selectedRoad ? 0xffd166 : 0x78f0c2,
          transparent: true,
          opacity: selectedRoad ? 0.9 : 0.45,
          depthWrite: false,
        }));
        line.userData.roadHelper = true;
        this._roadHelperGroup.add(line);
      }
      points.forEach((point, index) => {
        const selectedPoint = selectedRoad && index === this.selectedRoadPointIndex;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(selectedPoint ? 0.42 : 0.32, 16, 10),
          new THREE.MeshBasicMaterial({
            color: selectedPoint ? 0xffd166 : selectedRoad ? 0x78f0c2 : 0x4aa3ff,
            transparent: true,
            opacity: selectedRoad ? 0.95 : 0.62,
            depthTest: false,
          })
        );
        sphere.position.set(point.x, point.y + 0.35, point.z);
        sphere.renderOrder = 20;
        sphere.userData.roadHelper = true;
        sphere.userData.roadPoint = true;
        sphere.userData.roadId = road.id;
        sphere.userData.pointIndex = index;
        this._roadHelperGroup.add(sphere);
      });
    }
  }

  _clearRoadHelpers(disable = true) {
    if (!this._roadHelperGroup) return;
    while (this._roadHelperGroup.children.length) {
      const child = this._roadHelperGroup.children[0];
      this._roadHelperGroup.remove(child);
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose?.());
      else child.material?.dispose?.();
    }
    if (disable) this._roadHelperGroup.visible = false;
  }
  _getSelectionCenter() {
    if (this.toolMode === 'road') {
      const road = this.manager?.getRoad?.(this.selectedRoadId);
      if (road?.points?.length) {
        if (Number.isInteger(this.selectedRoadPointIndex) && road.points[this.selectedRoadPointIndex]) return toVector3(road.points[this.selectedRoadPointIndex]);
        return this._getRoadCenter(road.points);
      }
    }
    const selected = this._getSelectedObjects();
    if (!selected.length) return null;
    const center = new THREE.Vector3();
    for (const obj of selected) center.add(toVector3(obj.position));
    return center.multiplyScalar(1 / selected.length);
  }
  _canTransformSelectedRoad() {
    return this.toolMode === 'road'
      && Boolean(this.selectedRoadId)
      && this.selectedRoadPointIndex == null
      && Boolean(this.manager?.getRoad?.(this.selectedRoadId)?.points?.length);
  }
  _getRoadCenter(points = []) {
    const valid = points.filter(Boolean);
    const center = new THREE.Vector3();
    if (!valid.length) return center;
    for (const point of valid) center.add(toVector3(point));
    return center.multiplyScalar(1 / valid.length);
  }
  _getSelectedObjects() { return this.selectedIds.map(id => this.manager?.getObject?.(id)).filter(Boolean); }
  _getAxisVector(axis) { if (this.spaceMode === 'local' && this.selectedIds.length === 1) { const obj = this.manager?.getObject?.(this.selectedIds[0]); if (obj && axis !== 'y') { const vector = axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1); return vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), obj.rotationY || 0).normalize(); } } if (axis === 'x') return new THREE.Vector3(1, 0, 0); if (axis === 'y') return new THREE.Vector3(0, 1, 0); return new THREE.Vector3(0, 0, 1); }

  _updateSelectionBox() { const drag = this._pointerDrag; if (!drag || drag.type !== 'selectBox') return; const left = Math.min(drag.startX, drag.x); const top = Math.min(drag.startY, drag.y); const width = Math.abs(drag.x - drag.startX); const height = Math.abs(drag.y - drag.startY); Object.assign(this.selectionBoxEl.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }); }
  _finishSelectionBox(additive = true) { const drag = this._pointerDrag; if (!drag || drag.type !== 'selectBox') return; const rect = { left: Math.min(drag.startX, drag.x), right: Math.max(drag.startX, drag.x), top: Math.min(drag.startY, drag.y), bottom: Math.max(drag.startY, drag.y) }; const ids = []; const canvasRect = this.domElement.getBoundingClientRect(); for (const obj of this.manager?.objects || []) { if (!this._isLayerVisible(obj.layer) || this._isLayerLocked(obj.layer)) continue; const projected = toVector3(obj.position).project(this.camera); const x = canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width; const y = canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height; if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) ids.push(obj.id); } if (ids.length) { this.selectedIds = additive ? [...new Set([...this.selectedIds, ...ids])] : ids; this._setStatus(`已框选 ${ids.length} 个物体。`); } }

  _getCommonProperties(objects) { const result = {}; for (const key of ['layer', 'snapToGround', 'breakable', 'mass', 'durability', 'collisionRadius']) { const values = objects.map(obj => key === 'durability' ? (obj.maxDurability || obj.durability) : obj[key]); result[key] = values.every(value => value === values[0]) ? values[0] : null; } return result; }
  _addLayer() { const name = window.prompt('请输入新图层名称：', `图层 ${this.layers.length + 1}`); if (!name) return; const id = `layer_${Date.now().toString(36)}`; this.layers.push({ id, name: name.trim(), visible: true, locked: false }); this.activeLayer = id; this._renderLayerList(); }
  _toggleLayer(layerId, key) { const layer = this.layers.find(item => item.id === layerId); if (!layer) return; layer[key] = !layer[key]; if (key === 'visible') this._applyLayerVisibility(); this.refresh(); }
  _applyLayerVisibility() {
    for (const obj of this.manager?.objects || []) if (obj.mesh) obj.mesh.visible = obj.destroyed ? false : this._isLayerVisible(obj.layer);
    for (const road of this.manager?.roads || []) if (road.mesh) road.mesh.visible = this._isLayerVisible(road.layer);
    for (const terrain of this.manager?.terrains || []) if (terrain.mesh) terrain.mesh.visible = terrain.visible !== false && this._isLayerVisible(terrain.layer);
  }
  _isLayerVisible(layerId = 'default') { const layer = this.layers.find(item => item.id === (layerId || 'default')); return layer?.visible !== false; }
  _isLayerLocked(layerId = 'default') { const layer = this.layers.find(item => item.id === (layerId || 'default')); return layer?.locked === true; }
  _markDirty(refresh = true) { this._dirty = true; if (refresh) this.refresh(); else { this.dirtyLabel.textContent = '未保存'; this.dirtyLabel.style.color = '#ffd166'; this._updateHistoryButtons(); } }
  _setStatus(text) { if (this.statusBar) this.statusBar.textContent = text; }

  _readInputValue(input) {
    if (input.tagName === 'SELECT' && input.value === '') return undefined;
    if (input.tagName === 'SELECT' && (input.value === 'true' || input.value === 'false')) return input.value === 'true';
    if (input.type === 'checkbox') return input.checked;
    if ([
      'type', 'effect', 'layer', 'note',
      'road.profile', 'road.generationMode', 'road.moduleId', 'road.layer', 'road.note',
      'terrain.color', 'terrain.layer', 'terrain.note',
      'brush.mode', 'random.seed',
    ].includes(input.dataset.key)) return input.value;
    if (input.dataset.mixed === 'true' && input.value === '') return undefined;
    const value = Number(input.value);
    return Number.isFinite(value) ? value : undefined;
  }

  _syncLinkedInputs(input) { const key = input.dataset.key; if (!key) return; const value = input.value; this.propertiesEl.querySelectorAll(`[data-key="${CSS.escape(key)}"]`).forEach(other => { if (other !== input && other.type !== 'checkbox') other.value = value; }); }
  _vectorFields(position = {}) { return `<div class="le-field-wide">坐标${['x', 'y', 'z'].map(axis => `<label class="le-vector-row"><span class="le-vector-axis" style="color:#${AXIS_COLORS[axis].toString(16).padStart(6, '0')}">${axis.toUpperCase()}</span><input data-key="position.${axis}" type="number" step="0.01" value="${Number(position[axis] || 0).toFixed(2)}"></label>`).join('')}</div>`; }
  _vectorFieldsWithPrefix(prefix, position = {}) { return `<div class="le-field-wide">坐标${['x', 'y', 'z'].map(axis => `<label class="le-vector-row"><span class="le-vector-axis" style="color:#${AXIS_COLORS[axis].toString(16).padStart(6, '0')}">${axis.toUpperCase()}</span><input data-key="${prefix}.${axis}" type="number" step="0.01" value="${Number(position[axis] || 0).toFixed(2)}"></label>`).join('')}</div>`; }
  _roadPointFields(position = {}) { return `<div class="le-field-wide">坐标${['x', 'y', 'z'].map(axis => `<label class="le-vector-row"><span class="le-vector-axis" style="color:#${AXIS_COLORS[axis].toString(16).padStart(6, '0')}">${axis.toUpperCase()}</span><input data-key="road.point.${axis}" type="number" step="0.01" value="${Number(position[axis] || 0).toFixed(2)}"></label>`).join('')}</div>`; }
  _rangeField(key, label, value, min, max, step, mixed = false) { const displayValue = mixed ? '' : Number(value || 0).toFixed(step < 1 ? 2 : 0); return `<label class="le-field-wide">${label}<span class="le-range-row"><input data-key="${key}" data-mixed="${mixed ? 'true' : 'false'}" type="range" min="${min}" max="${max}" step="${step}" value="${mixed ? min : value}"><input data-key="${key}" data-mixed="${mixed ? 'true' : 'false'}" type="number" min="${min}" max="${max}" step="${step}" value="${displayValue}" placeholder="混合"></span></label>`; }
  _checkboxField(key, label, checked) { return `<label class="le-field"><span>${label}</span><input data-key="${key}" type="checkbox" ${checked ? 'checked' : ''}></label>`; }
  _checkboxTriField(key, label, value) { if (value === null || value === undefined) return `<label class="le-field"><span>${label}</span><select data-key="${key}"><option value="">保持不变</option><option value="true">开启</option><option value="false">关闭</option></select></label>`; return this._checkboxField(key, label, value); }
  _selectField(key, label, value, options) { const optionHtml = options.map(([id, name]) => `<option value="${this._escape(id)}" ${id === value ? 'selected' : ''}>${this._escape(name)}</option>`).join(''); return `<label class="le-field"><span>${label}</span><select data-key="${key}">${optionHtml}</select></label>`; }
  _getTypeLabel(typeId) { return this.manager?.getTypes?.().find(type => type.id === typeId)?.label || typeId || '物体'; }
  _getRoadProfileLabel(profileId) { return (this.manager?.getRoadProfiles?.() || ROAD_PROFILE_OPTIONS.map(([id, label]) => ({ id, label }))).find(profile => profile.id === profileId)?.label || profileId || '道路'; }
  _getRoadModuleLabel(moduleId) { return (this.manager?.getRoadModules?.() || []).find(module => module.id === moduleId)?.label || moduleId || '道路模块'; }
  _timestamp() { const d = new Date(); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }
  _escape(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
}
