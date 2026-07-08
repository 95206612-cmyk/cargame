import * as THREE from 'three';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Renderer, CameraManager, LightManager, SkyboxManager } from './render/index.js';
import { PhysicsWorld, VehiclePhysics } from './physics/index.js';
import { InputManager } from './input/index.js';
import { TrackManager, InteractiveObjectManager } from './scene/index.js';
import { CarModel, VEHICLE_MODEL_SCALE, CarLight, AITraffic, PoliceAI } from './vehicle/index.js';
import { CarLibrary } from './vehicle/CarLibrary.js';
import { CarTune } from './vehicle/CarTune.js';
import { CarPaint } from './vehicle/CarPaint.js';
import { UIManager } from './ui/index.js';
import { SettingsUI } from './ui/SettingsUI.js';
import { GarageUI } from './ui/GarageUI.js';
import { MultiplayerUI } from './ui/MultiplayerUI.js';
import { LevelEditorUI } from './ui/LevelEditorUI.js';
import { PlayerProfileUI } from './ui/PlayerProfileUI.js';
import { AssetLoader } from './assetLoader.js';
import { TimerSystem, GameModeManager, PursuitManager } from './game/index.js';
import { EffectManager, WeatherSystem } from './effect/index.js';
import { SaveManager } from './data/index.js';
import { AudioManager, CarAudio } from './audio/index.js';
import { NetworkManager, NetworkSync } from './network/index.js';
import { InterpolationManager } from './network/interpolation.js';

window.__streetRacerBootStarted = true;

const MODE_LABELS = {
  race: 'STREET RACE',
  freerun: 'FREE DRIVE',
  pursuit: 'PURSUIT',
  daily: 'TIME TRIAL',
  multiplayer: 'MULTIPLAYER',
};

const WEATHER_PRESETS = {
  clear_morning: { light: 'morning', label: 'MORNING', env: 0.36 },
  clear_noon: { light: 'day', label: 'NOON', env: 0.4 },
  clear_evening: { light: 'evening', label: 'EVENING', env: 0.28 },
  rain: { light: 'rain', label: 'RAIN', env: 0.24 },
  snow: { light: 'snow', label: 'SNOW', env: 0.32 },
};

const WEATHER_ORDER = ['clear_morning', 'clear_noon', 'clear_evening', 'rain', 'snow'];

class App {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.clock = new THREE.Clock();
    this.delta = 0;
    this.elapsed = 0;
    this.isRunning = false;
    this._isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    this._mobileThermalMode = this._isTouchDevice;
    this._mobileLayout = this._isTouchDevice ? 'portrait' : 'desktop';
    this._mobileLayoutPreference = 'auto';
    this._mobileEffectScale = this._mobileThermalMode ? 0.48 : 1;

    this.currentMode = 'race';
    this.currentTrackId = 'city_circuit';
    this._availableTracks = [];
    this._trackPhysicsBodies = [];
    this._trackSwitching = false;
    this._editorCameraState = null;
    this.raceElapsed = 0;
    this.raceFinished = false;
    this.totalLaps = 3;
    this._countdown = 0;
    this._currentRank = 1;
    this._raceTotal = 1;
    this._menuVisible = false;

    this._routePoints = [];
    this._rampZones = [];
    this._airGlideTimer = 0;
    this._lastRampLaunch = -10;
    this._playerProgress = this._makeProgressTracker();
    this._aiProgress = [];
    this._roadblockTimer = 0;
    this._spikeTimer = 0;
    this._lastTrafficHit = 0;
    this._lastBarrierHit = 0;
    this._recoveryTimer = 0;
    this._weatherFriction = 1;
    this._usingExternalCarModel = false;
    this._vehicleRideHeight = 0.46 * VEHICLE_MODEL_SCALE;
    this._trafficGroundOffset = 0.03;
    this._smoothedRoadY = null;
    this._stuckTimer = 0;
    this._lastStuckLift = -10;
    this._lastStuckPos = new THREE.Vector3();
    this._lastStuckPosReady = false;
    this._audioUnlocked = false;
    this._lastCountdownCue = null;
    this._lastNitroAudio = false;
    this._lastMovingAudio = false;
    this._lastSpeedBand = 0;
    this._lastGearCue = 0;
    this._lastHornAt = -10;
    this._lastImpactAudio = -10;
    this._dustEffectAccumulator = 0;
    this._exhaustEffectAccumulator = 0;
    this._isBackgrounded = false;
    this._backgroundWasAudioUnlocked = false;
    this._backgroundAudioSuspended = false;
    this._currentCarId = 'tuner';
    this._garagePreviewModel = null;
    this._profilePreviewModel = null;
    this._profilePreviewBuildId = 0;
    this._multiplayerActive = false;
    this._multiplayerReady = false;
    this._multiplayerRoomCode = null;
    this._multiplayerRoomSettings = { mode: 'speed', trackId: 'city_circuit', laps: 3, maxPlayers: 6, itemMode: false, collisions: true };
    this._remoteCarModels = new Map();
  }

  async init() {
    try {
      console.log('[App] Init start');
      this._setupGlobalErrorHandlers();

      this.assets = new AssetLoader();
      this.saveManager = new SaveManager();
      this.saveManager.load();
      this._mobileLayoutPreference = this._resolveMobileLayoutPreference(this.saveManager.saveData?.settings?.mobileLayoutPreference);
      this.audio = new AudioManager();
      this.carAudio = null;
      this.assets.onProgress = (percent) => {
        const pctEl = document.getElementById('loading-percent');
        const barEl = document.getElementById('loading-bar-fill');
        if (pctEl) pctEl.textContent = `${percent}%`;
        if (barEl) barEl.style.width = `${percent}%`;
      };
      this._setLoadingProgress(5);

      this.assets.enqueueBatch([
        { id: 'asset-paths', type: 'json', url: './config/asset-path.json' },
        { id: 'carPhysics', type: 'json', url: './config/carPhysics.json' },
        { id: 'cars', type: 'json', url: './config/cars.json' },
        { id: 'tracks', type: 'json', url: './config/tracks.json' },
      ]);
      await this.assets.loadAll();
      this._setLoadingProgress(100);

      this.carLibrary = new CarLibrary(this.assets, this.saveManager);
      await this.carLibrary.loadConfigs();
      this.carTune = new CarTune(this.carLibrary, this.saveManager);
      this.carPaint = new CarPaint(this.saveManager);
      this._currentCarId = this._resolveSavedCarId(this.saveManager.saveData?.currentCarId);
      this.saveManager.saveData.currentCarId = this._currentCarId;
      this.saveManager.save();

      this.renderer = new Renderer(this.canvas);
      this.renderer.scene.background = new THREE.Color(0xbfefff);
      this.renderer.scene.fog = new THREE.FogExp2(0xcfefff, 0.0018);

      this.camera = new CameraManager();
      this.light = new LightManager(this.renderer.scene);
      this.light.setPreset('day');
      this.light.setLumenEnabled?.(true);
      this.skybox = new SkyboxManager(this.renderer.scene, this.assets);

      this.physicsWorld = new PhysicsWorld();
      this.physicsWorld.addGround(0.3);

      const cpCfg = this.assets.get('carPhysics');
      if (cpCfg?.surfaceFriction) this.physicsWorld.loadSurfaceConfig(cpCfg.surfaceFriction);

      this.trackManager = new TrackManager(this.assets, this.renderer.scene);
      this.camera.setCollisionProvider(() => this.trackManager?.getCameraColliders?.() || []);
      this.camera.setOcclusionMeshProvider(() => this.trackManager?.getCameraOccluderMeshes?.() || []);
      this.camera.setGroundMeshProvider(() => this.trackManager?.getCameraGroundMeshes?.() || []);
      this.camera.setGroundHeightProvider((pos) => this.trackManager?.getFastRoadHeightAtPosition?.(pos));
      this._availableTracks = await this.trackManager.getAvailableTracks();
      const savedTrackId = this._resolveSavedTrackId(this.saveManager.saveData?.currentTrackId);
      await this._loadTrackById(savedTrackId);

      this.input = new InputManager(this.canvas);
      this.vehiclePhysics = new VehiclePhysics(this.physicsWorld);
      this.vehiclePhysics.loadConfig(this.assets);
      this.vehiclePhysics.setTuning(this.saveManager.saveData?.settings);
      this.ui = new UIManager();
      this.ui.setMinimapTrack(this._routePoints);
      this.profileUI = new PlayerProfileUI(document.body);
      this.settingsUI = new SettingsUI(document.body, this.saveManager);
      this.garageUI = new GarageUI(document.body);
      this.multiplayerUI = new MultiplayerUI(document.body);
      this.networkManager = new NetworkManager();
      this.networkSync = new NetworkSync(this.networkManager, new InterpolationManager());

      this.effects = new EffectManager(this.renderer.scene);
      this.effects.setParticleLimit(this._mobileThermalMode ? 260 : 1000);
      this.interactiveObjects = new InteractiveObjectManager(this.renderer.scene, this.trackManager, this.effects);
      this.interactiveObjects.loadTrack(this.currentTrackId);
      this._registerTrackPhysicsBodies();
      this._routePoints = this.trackManager?.getRoadCenterPoints?.() || this._routePoints;
      this.levelEditorUI = new LevelEditorUI(document.body, {
        manager: this.interactiveObjects,
        camera: this.camera.camera,
        domElement: this.canvas,
        trackManager: this.trackManager,
      });
      this.levelEditorUI.setTracks?.(this._availableTracks);
      this.levelEditorUI.loadObjectConfig?.('./config/objects.json');
      this.levelEditorUI.loadRoadModuleConfig?.('./config/road-modules.json');
      this.weather = new WeatherSystem(this.renderer.scene, this.renderer.renderer);
      this.weather.onFrictionChange = (multiplier) => {
        this._weatherFriction = multiplier;
        this.vehiclePhysics?.setWeatherFrictionMultiplier(multiplier);
      };
      this.timer = new TimerSystem();
      this.gameModes = new GameModeManager();
      this.traffic = new AITraffic(this.renderer.scene, this.physicsWorld);
      this.traffic.setGroundSampler((pos) => {
        const info = this.trackManager?.getRoadInfoAtPosition?.(pos);
        if (!info?.point) return null;
        return Number.isFinite(info.surfaceY) ? { ...info.point, y: info.surfaceY } : info.point;
      });
      this.traffic.setRoadInfoSampler?.((pos) => this.trackManager?.getRoadInfoAtPosition?.(pos) || null);
      this.police = new PoliceAI(this.renderer.scene);
      this.police.setGroundSampler((pos) => {
        const info = this.trackManager?.getRoadInfoAtPosition?.(pos);
        if (!info?.point) return null;
        return Number.isFinite(info.surfaceY) ? { ...info.point, y: info.surfaceY } : info.point;
      });
      this.pursuit = new PursuitManager(this.police);
      this._refreshTrackConsumers();

      await this._spawnPlayerCar();
      this._setupCallbacks();
      this._setupProfile();
      this._setupGarage();
      this._setupMultiplayer();
      this._setupSettingsPanel();
      this._applySavedSettings();
      this._setupGameActions();
      this._setupEscapeButton();
      this._setupMobileRotateButton();
      this._setupOrbitButton();
      this._startMode('race', { resetPlayer: true });

      this._hideLoading();
      this.renderer.render(this.renderer.scene, this.camera.camera);
      this._showLoginIfNeeded();

      this.isRunning = true;
      this.clock.getDelta();
      requestAnimationFrame(() => this.loop());
      console.log('[App] Init complete');
    } catch (err) {
      console.error('[App] Init error:', err);
      this._showFatalError(err.message || String(err));
    }
  }

  async _spawnPlayerCar() {
    const carId = this._resolveSavedCarId(this._currentCarId || this.saveManager.saveData?.currentCarId);
    this._currentCarId = carId;
    if (this.saveManager?.saveData) {
      this.saveManager.saveData.currentCarId = carId;
      this.saveManager.save();
    }
    const carData = this.carLibrary?.getCar(carId) || {};
    const bodyStyle = carData.bodyStyle || 'sports';
    const colorStr = carData.defaultColor || '#e74c3c';
    const color = parseInt(colorStr.replace('#', ''), 16);
    const sp = this._getSafeSpawnPoint();

    this.carModel = new CarModel();
    this._usingExternalCarModel = await this._tryLoadExternalCarModel(carData, bodyStyle);
    if (!this._usingExternalCarModel) {
      this.carModel.buildProcedural({ body: color }, bodyStyle);
    }
    this.renderer.scene.add(this.carModel.root);
    this.renderer.setShadowFollowTarget?.(this.carModel.root);

    const ok = this.vehiclePhysics.create(bodyStyle, { x: sp.x, y: sp.y, z: sp.z }, sp.yaw || 0, VEHICLE_MODEL_SCALE);
    if (!ok) throw new Error('Failed to create vehicle physics');
    this._applyVehicleVisualGroundOffset();

    // Let suspension settle before showing
    for (let i = 0; i < 30; i++) {
      this.physicsWorld.step(0.016);
      this.vehiclePhysics.chassisBody.velocity.y *= 0.3;
      this.vehiclePhysics.chassisBody.angularVelocity.set(0, 0, 0);
    }

    this.vehiclePhysics.syncToMesh(this.carModel.root);
    this.camera.snapToTarget(this.carModel.root);
    this.carTune?.applyToVehicle(this.vehiclePhysics, carId);
    this.carPaint?.load(carId);
    this.carPaint?.applyToCar(this.carModel.root);
    this._applyVehicleCustomization(this.saveManager?.saveData?.vehicleCustomization);

    this.carLight = new CarLight(this.renderer.scene);
    this.carLight.init(this.carModel.root);
    this.carLight.setEnvRequiresHeadlights(false);
  }

  async _tryLoadExternalCarModel(carData, bodyStyle) {
    return this._tryLoadConfiguredCarModel(this.carModel, carData, bodyStyle, '[App]');
  }

  async _tryLoadConfiguredCarModel(targetModel, carData, bodyStyle, logPrefix = '[App]') {
    if (!targetModel) return false;
    const assetPaths = this.assets.get('asset-paths') || {};
    const modelId = this._resolveCarModelId(carData, bodyStyle);
    const bodyUrl = assetPaths?.models?.cars?.[modelId];

    if (!bodyUrl) return false;

    // Check if separate body + wheel files exist
    const wheelBase = bodyUrl.replace(/body\.glb$/, '');
    const wheelNames = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
    const wheelUrls = wheelNames.map(n => wheelBase + n + '.glb');
    const hasWheels = (await Promise.all(wheelUrls.map(u => this.assets.assetExists(u)))).every(Boolean);

    if (hasWheels) {
      try {
        const [bodyModel, ...wheelModels] = await Promise.all([
          this.assets._loadGLB(bodyUrl, { _progress: null }),
          ...wheelUrls.map(u => this.assets._loadGLB(u, { _progress: null })),
        ]);
        targetModel.useExternalModelFromParts(bodyModel, wheelModels, bodyStyle);
        console.log(`${logPrefix} Loaded external car from parts: body + 4 wheels`);
        return true;
      } catch (err) {
        console.warn(`${logPrefix} Separate model load failed, trying single body: ${err.message}`);
      }
    }

    if (!(await this.assets.assetExists(bodyUrl))) {
      return false;
    }

    try {
      const model = await this.assets._loadGLB(bodyUrl, { _progress: null });
      targetModel.useExternalModel(model, bodyStyle);
      console.log(`${logPrefix} Loaded external car model: ${modelId}`);
      return true;
    } catch (err) {
      console.warn(`${logPrefix} External car model failed, using procedural fallback: ${err.message}`);
      return false;
    }
  }

  async _loadTrackById(trackId) {
    const normalizedId = this._resolveSavedTrackId(trackId);
    const assetId = this.trackManager.resolveAssetTrackId(normalizedId);
    const trackData = await this.trackManager.buildExternalOrProcedural(assetId, normalizedId);

    this.currentTrackId = normalizedId;
    this._spawnPoints = trackData.spawnPoints || [{ x: 0, y: 3, z: 0, yaw: 0 }];
    this._routePoints = trackData.roadCenterPoints || [];
    this._rampZones = trackData.rampZones || [];
    this._smoothedRoadY = null;
    this.skybox?.setTrackSkybox?.(null);
    this.interactiveObjects?.setTrackManager?.(this.trackManager);
    this.interactiveObjects?.loadTrack?.(normalizedId);
    this._registerTrackPhysicsBodies();
    this._routePoints = this.trackManager?.getRoadCenterPoints?.() || this._routePoints;
    this._refreshTrackConsumers();
    console.log('[App] Track active:', normalizedId, 'route points=', this._routePoints.length);
    return trackData;
  }

  _registerTrackPhysicsBodies() {
    this._clearTrackPhysicsBodies();

    const roadMeshes = this.trackManager?.getRoadMeshes?.() || [];
    let registeredRoadBodies = 0;
    for (const mesh of roadMeshes) {
      const body = this.physicsWorld.addTrimeshFromThreeMesh?.(mesh, {
        source: 'road-trimesh',
        maxTriangles: 120000,
      });
      if (!body) continue;
      this._trackPhysicsBodies.push(body);
      registeredRoadBodies++;
    }

    const terrainMeshes = this.interactiveObjects?.getTerrainPhysicsMeshes?.() || [];
    let registeredTerrainBodies = 0;
    for (const mesh of terrainMeshes) {
      const body = this.physicsWorld.addTrimeshFromThreeMesh?.(mesh, {
        source: 'editor-terrain-trimesh',
        maxTriangles: 90000,
      });
      if (!body) continue;
      this._trackPhysicsBodies.push(body);
      registeredTerrainBodies++;
    }

    const barrierColliders = this.trackManager?.getBarrierColliders?.() || [];
    let registeredTrackBodies = 0;
    for (const bc of barrierColliders) {
      if (bc.source === 'road-edge') continue;
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, bc.rotationY || 0, 0, 'YXZ')
      );
      const body = this.physicsWorld.addBody(0, this.physicsWorld.box(
        bc.halfExtents.x, bc.halfExtents.y, bc.halfExtents.z
      ), bc.position, quat);
      this._trackPhysicsBodies.push(body);
      registeredTrackBodies++;
    }
    console.log('[App] Track physics:', registeredRoadBodies, 'road trimesh bodies,',
      registeredTerrainBodies, 'editor terrain bodies,',
      registeredTrackBodies, 'rigid colliders added,',
      barrierColliders.length, 'logic colliders');
  }

  _clearTrackPhysicsBodies() {
    if (!this.physicsWorld || !this._trackPhysicsBodies?.length) {
      this._trackPhysicsBodies = [];
      return;
    }
    for (const body of this._trackPhysicsBodies) {
      this.physicsWorld.removeBody(body);
    }
    this._trackPhysicsBodies = [];
  }

  _refreshTrackConsumers() {
    this.ui?.setMinimapTrack?.(this._routePoints);
    this.traffic?.setWaypoints?.(this._routePoints);
    this.traffic?.setRoadInfoSampler?.((pos) => this.trackManager?.getRoadInfoAtPosition?.(pos) || null);
    this.police?.setWaypoints?.(this._routePoints);
    if (this.timer && this.trackManager) {
      this.timer.setupCheckpoints(this.trackManager.getCheckpoints(), this.totalLaps);
    }
  }

  _resolveSavedTrackId(trackId) {
    const fallback = 'city_circuit';
    const normalized = String(trackId || fallback).replace(/-/g, '_');
    const available = this._availableTracks?.length
      ? this._availableTracks
      : [{ id: fallback }];
    return available.some(track => track.id === normalized) ? normalized : fallback;
  }

  async _switchTrack(trackId) {
    if (this._trackSwitching) return;
    const nextTrackId = this._resolveSavedTrackId(trackId);
    if (nextTrackId === this.currentTrackId) {
      this._hideTrackSelectDialog();
      this.ui?.flashMessage('TRACK READY', 0.65);
      return;
    }

    this._trackSwitching = true;
    this.ui?.flashMessage('LOADING TRACK', 0.8);
    this._hideTrackSelectDialog();
    this._hideMenu();
    this.levelEditorUI?.hide?.();

    try {
      this.traffic?.clear?.();
      this.police?.clear?.();
      this.pursuit?.start?.();
      this._aiProgress = [];
      this._playerProgress = this._makeProgressTracker();
      this._clearPlayerCar();
      this._clearTrackPhysicsBodies();
      this.interactiveObjects?.clear?.();
      this.trackManager?.clearCurrentTrack?.();
      await this._loadTrackById(nextTrackId);
      await this._spawnPlayerCar();
      this._refreshTrackConsumers();
      this.saveManager.saveData.currentTrackId = nextTrackId;
      this.saveManager.save();
      this._startMode(this.currentMode || 'freerun', { resetPlayer: true });
      const label = this._getTrackLabel(nextTrackId).toUpperCase();
      this.ui?.flashMessage(label, 1.0);
    } catch (err) {
      console.error('[App] Track switch failed:', err);
      this._reportRuntimeError('track switch', err);
      this.ui?.flashMessage('TRACK LOAD FAILED', 1.2);
    } finally {
      this._trackSwitching = false;
    }
  }

  async _switchEditorTrack(trackId) {
    if (this._trackSwitching) return { ok: false, error: new Error('赛道正在切换中') };
    const nextTrackId = this._resolveSavedTrackId(trackId);
    if (nextTrackId === this.currentTrackId) {
      this.levelEditorUI?.show?.(nextTrackId);
      return { ok: true, trackId: nextTrackId };
    }

    this._trackSwitching = true;
    this.ui?.flashMessage('加载编辑关卡', 0.8);
    try {
      this.input?.clearActiveInputs?.();
      this.traffic?.clear?.();
      this.police?.clear?.();
      this._aiProgress = [];
      this._playerProgress = this._makeProgressTracker();
      this._clearPlayerCar();
      this._clearTrackPhysicsBodies();
      this.interactiveObjects?.clear?.();
      this.trackManager?.clearCurrentTrack?.();
      await this._loadTrackById(nextTrackId);
      await this._spawnPlayerCar();
      this._refreshTrackConsumers();
      this.saveManager.saveData.currentTrackId = nextTrackId;
      this.saveManager.save();
      this._freezeVehicleForEditor();
      this._enterLevelEditorCamera();
      this.levelEditorUI?.show?.(nextTrackId);
      return { ok: true, trackId: nextTrackId };
    } catch (err) {
      console.error('[App] Editor track switch failed:', err);
      this._reportRuntimeError('editor track switch', err);
      this.ui?.flashMessage('编辑关卡加载失败', 1.2);
      return { ok: false, error: err };
    } finally {
      this._trackSwitching = false;
      this.clock?.getDelta?.();
    }
  }

  async _loadTrackForMultiplayer(trackId) {
    if (this._trackSwitching) return;
    const nextTrackId = this._resolveSavedTrackId(trackId);
    if (nextTrackId === this.currentTrackId) return;

    this._trackSwitching = true;
    this.ui?.flashMessage('LOADING ROOM TRACK', 0.8);
    try {
      this.traffic?.clear?.();
      this.police?.clear?.();
      this._clearPlayerCar();
      this._clearTrackPhysicsBodies();
      this.interactiveObjects?.clear?.();
      this.trackManager?.clearCurrentTrack?.();
      await this._loadTrackById(nextTrackId);
      await this._spawnPlayerCar();
      this._refreshTrackConsumers();
    } catch (err) {
      console.error('[App] Multiplayer track load failed:', err);
      this._reportRuntimeError('multiplayer track load', err);
      this.ui?.flashMessage('ROOM TRACK FAILED', 1.2);
    } finally {
      this._trackSwitching = false;
    }
  }

  _clearPlayerCar() {
    this.carLight?.dispose?.();
    this.carLight = null;
    this.vehiclePhysics?.dispose?.();

    if (this.carModel?.root?.parent) {
      this.carModel.root.parent.remove(this.carModel.root);
    }
    this.carModel?.dispose?.();
    this.carModel = null;
    this._usingExternalCarModel = false;
  }

  async _rebuildPlayerCar(carId = this._currentCarId, options = {}) {
    const nextCarId = this._resolveSavedCarId(carId);
    this._currentCarId = nextCarId;
    if (this.saveManager?.saveData) {
      this.saveManager.saveData.currentCarId = nextCarId;
      this.saveManager.save();
    }

    this._clearPlayerCar();
    this.vehiclePhysics = new VehiclePhysics(this.physicsWorld);
    this.vehiclePhysics.loadConfig(this.assets);
    this.vehiclePhysics.setTuning(this.saveManager.saveData?.settings);
    this.vehiclePhysics.setWeatherFrictionMultiplier(this._weatherFriction);
    await this._spawnPlayerCar();
    this._applySavedSettings();
    this._refreshTrackConsumers();

    if (options.resetPlayer !== false) {
      this._teleportPlayerToSpawn();
    }
  }

  _getTrackLabel(trackId) {
    const track = (this._availableTracks || []).find(item => item.id === trackId);
    return track?.name || trackId.replace(/_/g, ' ');
  }

  _applyVehicleVisualGroundOffset() {
    if (!this.carModel?.root) return;
    const wheelGroundOffset = this.carModel.getWheelGroundOffset?.() ?? 0;
    this.carModel.root.userData.physicsVisualOffsetY = -this._vehicleRideHeight - wheelGroundOffset;
  }

  _resolveCarModelId(carData, bodyStyle) {
    if (carData.modelId) return carData.modelId;
    if (carData.assetId) return carData.assetId;

    const defaults = {
      compact: 'sedan-01',
      sports: 'sport-01',
      supercar: 'super-01',
      muscle: 'muscle-01',
      truck: 'truck-01',
    };

    return defaults[bodyStyle] || 'sport-01';
  }

  _getSafeSpawnPoint() {
    const spawn = this._spawnPoints?.[0];
    if (spawn) {
      const roadInfo = this.trackManager?.getRoadInfoAtPosition?.(spawn);
      const routePoint = roadInfo?.point || this._routePoints[this._nearestRouteIndex(spawn)];
      const groundY = Number.isFinite(roadInfo?.surfaceY)
        ? roadInfo.surfaceY
        : (Number.isFinite(routePoint?.y) ? routePoint.y : 0);
      return {
        x: spawn.x,
        y: groundY + this._vehicleRideHeight,
        z: spawn.z,
        yaw: spawn.yaw || 0,
      };
    }

    const routeIndex = 0;
    const point = this._routePoints[routeIndex];
    const next = this._routePoints[routeIndex + 1];
    if (point && next) {
      return {
        x: point.x,
        y: point.y + this._vehicleRideHeight,
        z: point.z,
        yaw: Math.atan2(next.x - point.x, next.z - point.z),
      };
    }
    return this._spawnPoints?.[0] || { x: 0, y: 3, z: 0, yaw: 0 };
  }

  loop() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.loop());

    this.delta = Math.min(this.clock.getDelta(), 0.1);
    if (this._isBackgrounded || this._trackSwitching) {
      return;
    }
    this.elapsed += this.delta;

    try {
      this.input.update(this.delta);
      const rawInputData = this.input.getStandardizedInput();
      let inputData = { ...rawInputData };

      const editorActive = this.levelEditorUI?.visible;
      if (this._menuVisible || this._countdown > 0 || editorActive) {
        inputData = {
          ...inputData,
          throttle: 0,
          brake: 0,
          steerAxis: 0,
          handbrake: false,
          nitro: false,
          resetRequested: editorActive ? false : inputData.resetRequested,
        };
      }

      if (inputData.resetRequested) {
        this._teleportPlayerToSpawn();
        this.ui?.flashMessage('RESET', 0.7);
        inputData = { ...inputData, resetRequested: false, throttle: 0, brake: 0, steerAxis: 0, handbrake: false, nitro: false };
      }

      window.__streetRacerDebug = {
        input: { ...inputData },
        countdown: this._countdown,
        menuVisible: this._menuVisible,
        mode: this.currentMode,
        editorActive,
      };

      this._updateCountdown(this.delta);
      if (editorActive) this._freezeVehicleForEditor();

      const preStepPos = this.vehiclePhysics.getPosition();
      const surface = this.trackManager.getSurfaceAtPosition(preStepPos);
      this.vehiclePhysics.setSurface(surface);
      this.vehiclePhysics.applyForces(this.delta, inputData);
      this.physicsWorld.step(this.delta);
      this.vehiclePhysics.updateSuspension();
      this._updateRampAndAirGlide(this.delta);
      if (editorActive) this._freezeVehicleForEditor();

      const barrierHit = editorActive ? false : this._resolveBarrierCollisions();
      const interactiveHit = editorActive ? false : (this.interactiveObjects?.resolveVehicleContact?.(this.vehiclePhysics, this.delta) || false);
      const playerPos = this.vehiclePhysics.getPosition();
      const speedKmh = this.vehiclePhysics.getSpeedKmh();
      const playerYaw = this._getPlayerYaw();
      window.__streetRacerDebug = {
        ...window.__streetRacerDebug,
        speedKmh,
        position: playerPos,
        yaw: playerYaw,
        render: this.renderer?.getPerformanceInfo?.() || null,
        lastError: window.__streetRacerLastError || null,
      };

      if (!editorActive) this._updateTrafficAndPolice(this.delta, playerPos, speedKmh, playerYaw);
      const npcHit = editorActive ? false : this._resolveNPCContacts();
      if (!editorActive) {
        this._stabilizePlayerRide(this.delta);
        this._checkAutoRecovery(this.delta, inputData);
      }

      this.vehiclePhysics.syncToMesh(this.carModel.root, this.delta);

      const steerAngle = this.vehiclePhysics.getSteerAngle();
      this.carModel.animateWheels(this.delta, speedKmh, steerAngle, inputData.brake > 0);
      this.carModel.animateBodyPitch(this.delta, this.vehiclePhysics.nitroActive, inputData.brake > 0);
      this.carLight.update(this.delta);
      this.carLight.setBraking(inputData.brake > 0);

      this._safeFrameStep('game systems', () => {
        this._updateGameSystems(this.delta, inputData, surface, barrierHit || interactiveHit, npcHit);
      });
      this._safeFrameStep('audio update', () => {
        this._updateAudio(this.delta, inputData, speedKmh, barrierHit || interactiveHit, npcHit);
      });
      if (editorActive) {
        this._updateEditorCamera(this.delta, this.levelEditorUI?.getCameraInput?.(rawInputData) || rawInputData);
      } else {
        this._updateCamera(speedKmh, inputData, barrierHit || interactiveHit || npcHit);
        this.camera.follow(this.carModel.root, this.delta);
      }
      this._safeFrameStep('vehicle effects', () => {
        this._emitVehicleEffects(this.delta, inputData);
      });
      this._safeFrameStep('multiplayer sync', () => {
        this._updateMultiplayerSync(this.delta, inputData);
      });

      this._safeFrameStep('effects update', () => this.effects.update(this.delta));
      this._safeFrameStep('weather update', () => this.weather?.update(this.delta, this.camera.camera.position));
      this._safeFrameStep('skybox update', () => this.skybox?.update(this.camera.camera, this.delta));
      this._safeFrameStep('ui update', () => this.ui.update(this.delta));
    } catch (err) {
      console.error('[App] Loop error:', err);
      this._reportRuntimeError('main loop', err);
    } finally {
      this._renderFrame();
    }
  }

  _safeFrameStep(label, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[App] ${label} error:`, err);
      this._reportRuntimeError(label, err);
    }
  }

  _renderFrame() {
    try {
      if (this.renderer?.scene && this.camera?.camera) {
        this.renderer.render(this.renderer.scene, this.camera.camera);
      }
    } catch (err) {
      console.error('[App] Render error:', err);
      this._reportRuntimeError('render', err);
    }
  }

  _reportRuntimeError(label, err) {
    const message = `${label}: ${err?.message || String(err)}`;
    window.__streetRacerLastError = message;
    if (this.ui?.setStatus) {
      this.ui.setStatus(message.slice(0, 64), '#ff4d6d');
    }
  }

  _startMode(mode, options = {}) {
    this.currentMode = mode;
    const carId = this._currentCarId || this._resolveSavedCarId(this.saveManager?.saveData?.currentCarId);
    this.raceElapsed = 0;
    this.raceFinished = false;
    this._currentRank = 1;
    this._playerProgress = this._makeProgressTracker();
    this._aiProgress = [];
    this._roadblockTimer = 4;
    this._spikeTimer = 9;
    this._recoveryTimer = 0;
    this._lastCountdownCue = null;
    this._lastSpeedBand = 0;
    this._lastMovingAudio = false;

    if (mode === 'race') {
      this.totalLaps = this._getTrackLapCount(3);
      this.gameModes.startRaceEvent('midnight_sprint', {
        track: this.currentTrackId || 'city_circuit',
        laps: this.totalLaps,
        reward: 1200,
        xpReward: 300,
      }, carId);
      this._countdown = 3.0;
      this._prepareTraffic(3, true);
    } else if (mode === 'daily') {
      this.totalLaps = 1;
      this.gameModes.startDailyChallenge(carId);
      this._countdown = 3.0;
      this._prepareTraffic(0, false);
    } else if (mode === 'pursuit') {
      this.totalLaps = 1;
      this.gameModes.startPursuit(carId);
      this._countdown = 0;
      this._prepareTraffic(6, false);
      this.pursuit.start();
      this.pursuit.setStarLevel(1);
    } else if (mode === 'multiplayer') {
      this.totalLaps = Math.max(1, Math.min(5, Number(this._multiplayerRoomSettings?.laps) || this._getTrackLapCount(3)));
      this.gameModes.startRaceEvent('multiplayer_room', {
        track: this.currentTrackId || 'city_circuit',
        laps: this.totalLaps,
        reward: 0,
        xpReward: 0,
      }, carId);
      this._countdown = 0;
      this._prepareTraffic(0, false);
    } else {
      this.totalLaps = 1;
      this.gameModes.startFreeDrive(carId);
      this._countdown = 0;
      this._prepareTraffic(4, false);
    }

    if (mode !== 'pursuit') {
      this.police.clear();
      this.pursuit.start();
    }

    this.timer.setupCheckpoints(this.trackManager.getCheckpoints(), this.totalLaps);
    this._raceTotal = mode === 'race'
      ? this.traffic.count + 1
      : mode === 'multiplayer'
        ? Math.max(1, this.networkSync?.playerCount || 1)
        : 1;

    if (options.resetPlayer) this._teleportPlayerToSpawn();

    this.ui.showHUD();
    this._showOrbitBtn();
    this.ui.setMode(MODE_LABELS[mode] || MODE_LABELS.race);
    this.ui.setLap(1, this.totalLaps);
    this.ui.setTimer(0);
    this.ui.setBestLap(Infinity);
    this.ui.setRank(1, this._raceTotal);
    this.ui.setWanted(mode === 'pursuit' ? 1 : 0);
    this.ui.setNitro(this.vehiclePhysics.getNitroPercent());
    this.ui.setCheckpointProgress(0);
    this.ui.setStatus(mode === 'pursuit' ? 'WANTED LEVEL 1' : '');
    if (mode !== 'race' && mode !== 'daily') {
      this.ui.flashMessage(MODE_LABELS[mode] || 'READY', 1.1);
    }
  }

  _getTrackLapCount(fallback = 3) {
    const track = (this._availableTracks || []).find(item => item.id === this.currentTrackId);
    const laps = Number(track?.laps);
    return Number.isFinite(laps) && laps > 0 ? laps : fallback;
  }

  _prepareTraffic(count, raceGrid) {
    this.traffic.clear();
    if (count <= 0) return;

    this.traffic.spawnAll(count);
    this._aiProgress = this.traffic.cars.map(() => this._makeProgressTracker());

    if (!raceGrid) {
      for (const car of this.traffic.cars) {
        car.speed = 12 + Math.random() * 10;
      }
      return;
    }

    for (let i = 0; i < this.traffic.cars.length; i++) {
      const car = this.traffic.cars[i];
      const spawn = this._spawnPoints?.[i + 1];
      const routeIndex = spawn
        ? this._nearestRouteIndex(spawn)
        : Math.min(this._routePoints.length - 2, 4 + i * 3);
      const routePoint = this._routePoints[routeIndex] || this._routePoints[0] || { x: 0, y: 0, z: 0 };
      const nextPoint = this._routePoints[(routeIndex + 1) % this._routePoints.length] || routePoint;
      const yaw = spawn?.yaw ?? Math.atan2(nextPoint.x - routePoint.x, nextPoint.z - routePoint.z);
      const roadInfo = this.trackManager?.getRoadInfoAtPosition?.(spawn || routePoint);
      const groundY = Number.isFinite(roadInfo?.surfaceY) ? roadInfo.surfaceY : routePoint.y;
      const gridPos = spawn
        ? new THREE.Vector3(spawn.x, groundY + this._trafficGroundOffset, spawn.z)
        : new THREE.Vector3(routePoint.x, groundY + this._trafficGroundOffset, routePoint.z);

      car.mesh.position.copy(gridPos);
      car.position.copy(gridPos);
      car.lastPosition.copy(gridPos);
      car.yaw = yaw;
      car.mesh.rotation.y = yaw;
      car.currentWaypoint = routeIndex;
      car.laneOffset = 0;
      car.speed = 18 + i * 1.4 + Math.random() * 3;
    }
  }

  _updateTrafficAndPolice(delta, playerPos, speedKmh, playerYaw) {
    const freezeRaceGrid = this._countdown > 0 && (this.currentMode === 'race' || this.currentMode === 'daily');
    if (!freezeRaceGrid) {
      this.traffic.update(delta, playerPos);
    }

    if (this.currentMode === 'pursuit') {
      this.police.elapsed = this.elapsed;
      this.police.update(delta, playerPos, speedKmh / 3.6, playerYaw);
    }
  }

  _updateGameSystems(delta, inputData, surface, barrierHit, npcHit) {
    const playerPos = this.vehiclePhysics.getPosition();
    const speedKmh = this.vehiclePhysics.getSpeedKmh();

    if (this._countdown <= 0 && !this.raceFinished) {
      this.raceElapsed += delta;
      const timing = this.timer.update(delta, playerPos, this.raceElapsed);
      if (timing.lapCompleted || timing.checkpointHit !== null) {
        this.ui.setCheckpointProgress(this.timer.progress);
      }
      if (timing.checkpointHit !== null && !timing.lapCompleted && !timing.isFinish) {
        this.audio?.playCheckpoint();
        if (this.currentMode === 'multiplayer') {
          this.networkSync?.sendCheckpoint?.(timing.checkpointHit);
        }
      }
      if (timing.lapCompleted) {
        this.ui.flashMessage(`LAP ${Math.min(this.timer.currentLap, this.totalLaps)}`, 0.9);
        this.audio?.playLap();
        if (this.currentMode === 'multiplayer') {
          this.networkSync?.sendCheckpoint?.(0);
        }
      }
      if (timing.isFinish) {
        this.raceFinished = true;
        this.ui.flashMessage(`FINISH P${this._currentRank}`, 2.6);
        this.audio?.playFinish();
        if (this.currentMode === 'race') this.gameModes.simulateAIFinishTimes(this.raceElapsed);
      }
    }

    if (this.currentMode === 'race') {
      this._updateRaceRank(playerPos);
    } else if (this.currentMode === 'multiplayer') {
      this.ui.setRank(this._currentRank, this._raceTotal);
    } else {
      this.ui.setRank(1, 1);
    }

    if (this.currentMode === 'pursuit') {
      this._updatePursuit(delta, playerPos, speedKmh, barrierHit, npcHit);
    }

    this.ui.setSpeed(speedKmh);
    this.ui.setNitro(this.vehiclePhysics.getNitroPercent());
    this.ui.setLap(Math.min(this.timer.currentLap, this.totalLaps), this.totalLaps);
    this.ui.setTimer(this.raceElapsed);
    this.ui.setBestLap(this.timer.bestLap);
    this.ui.setBoostActive(this.vehiclePhysics.nitroActive, Math.min(speedKmh / 280, 1));
    this.ui.drawMinimap(playerPos, this.traffic.getCarStates(), this.police.getCopStates());

    if (this.vehiclePhysics.nitroActive) {
      this.ui.setStatus('NITRO', '#66e8ff');
    } else if (this.vehiclePhysics.isDriftActive) {
      this.ui.setStatus('DRIFT', '#ffd166');
    } else if (surface === 'wet_asphalt') {
      this.ui.setStatus('WET ROAD', '#66e8ff');
    } else if (surface === 'dirt') {
      this.ui.setStatus('DIRT SHORTCUT', '#ffd166');
    } else if (this.currentMode !== 'pursuit') {
      this.ui.setStatus('');
    }
  }

  _updatePursuit(delta, playerPos, speedKmh, barrierHit, npcHit) {
    this.pursuit.update(delta, {
      position: playerPos,
      speedKmh,
      isDrifting: this.vehiclePhysics.isDriftActive,
      yaw: this._getPlayerYaw(),
    }, npcHit, barrierHit);

    const stars = this.pursuit.starLevel;
    this.ui.setWanted(stars, this.pursuit.getNextStarProgress());
    this.ui.setStatus(`WANTED LEVEL ${stars}`, '#ff4d6d');

    if (this.pursuit.escaped) {
      this.ui.flashMessage('ESCAPED', 2.2);
      this._startMode('freerun', { resetPlayer: false });
      return;
    }
    if (this.pursuit.captured) {
      this.ui.flashMessage('BUSTED', 2.2);
      this._startMode('freerun', { resetPlayer: true });
      return;
    }

    this._roadblockTimer -= delta;
    this._spikeTimer -= delta;

    if (stars >= 3 && this._roadblockTimer <= 0) {
      this.police.placeRoadblock(playerPos, this._getPlayerYaw());
      this._roadblockTimer = 11 - Math.min(stars, 5);
    }
    if (stars >= 4 && this._spikeTimer <= 0) {
      this.police.placeSpikeStrip(playerPos, this._getPlayerYaw());
      this._spikeTimer = 13;
    }

    this._resolveRoadHazards();
  }

  _updateRaceRank(playerPos) {
    const racers = [{
      id: 'player',
      score: this._scoreForPosition(playerPos, this._playerProgress),
    }];

    for (let i = 0; i < this.traffic.cars.length; i++) {
      const car = this.traffic.cars[i];
      if (!this._aiProgress[i]) this._aiProgress[i] = this._makeProgressTracker();
      racers.push({
        id: `ai_${i}`,
        score: this._scoreForPosition(car.mesh.position, this._aiProgress[i]),
      });
    }

    racers.sort((a, b) => b.score - a.score);
    this._currentRank = racers.findIndex(r => r.id === 'player') + 1;
    this.ui.setRank(this._currentRank, racers.length);
  }

  _scoreForPosition(pos, tracker) {
    const idx = this._routeProgressForPosition(pos);
    const count = this._routePoints.length || 1;

    if (tracker.lastIndex !== null) {
      if (tracker.lastIndex > count * 0.82 && idx < count * 0.18) {
        tracker.laps++;
      } else if (tracker.lastIndex < count * 0.18 && idx > count * 0.82) {
        tracker.laps = Math.max(0, tracker.laps - 1);
      }
    }

    tracker.lastIndex = idx;
    tracker.score = tracker.laps * count + idx;
    return tracker.score;
  }

  _routeProgressForPosition(pos) {
    const info = this.trackManager?.getRoadInfoAtPosition?.(pos);
    if (info) return info.progress;
    return this._nearestRouteIndex(pos);
  }

  _nearestRouteIndex(pos) {
    const info = this.trackManager?.getRoadInfoAtPosition?.(pos);
    if (info) return info.index;

    if (!this._routePoints.length) return 0;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < this._routePoints.length; i++) {
      const p = this._routePoints[i];
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    return nearest;
  }

  _distanceToRouteCenter(pos) {
    const info = this.trackManager?.getRoadInfoAtPosition?.(pos);
    if (info) return info.distance;

    if (!this._routePoints.length) return Infinity;
    const nearest = this._routePoints[this._nearestRouteIndex(pos)];
    if (!nearest) return Infinity;
    const dx = pos.x - nearest.x;
    const dz = pos.z - nearest.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  _getRampContact(pos) {
    for (const ramp of this._rampZones) {
      const dx = pos.x - ramp.x;
      const dz = pos.z - ramp.z;
      const cos = Math.cos(-ramp.yaw);
      const sin = Math.sin(-ramp.yaw);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const halfWidth = (ramp.width || 7) / 2;
      const halfLength = (ramp.length || 12) / 2;

      if (Math.abs(lx) <= halfWidth && Math.abs(lz) <= halfLength) {
        const progress = (lz + halfLength) / Math.max(ramp.length || 12, 0.001);
        const clamped = Math.max(0, Math.min(1, progress));
        return {
          ramp,
          progress: clamped,
          height: clamped * (ramp.height || 1.2),
        };
      }
    }
    return null;
  }

  _updateRampAndAirGlide(delta) {
    const body = this.vehiclePhysics?.chassisBody;
    if (!body) return;

    if (this._airGlideTimer > 0) {
      const glide = clampNumber(this.saveManager?.saveData?.settings?.airGlideMultiplier, 0.5, 1.8, 1);
      this._airGlideTimer = Math.max(0, this._airGlideTimer - delta);
      body.velocity.y += 5.2 * glide * delta;
      body.angularVelocity.x *= 0.94;
      body.angularVelocity.z *= 0.94;
    }

    const contact = this._getRampContact(body.position);
    const speedKmh = this.vehiclePhysics.getSpeedKmh();
    if (!contact || contact.progress < 0.72 || speedKmh < (contact.ramp.minSpeedKmh || 55)) {
      return;
    }

    if (this.elapsed - this._lastRampLaunch < 1.4) {
      return;
    }

    const boost = (contact.ramp.launchBoost || 4.5) + Math.min(speedKmh / 160, 1) * 1.6;
    body.position.y += 0.18;
    body.velocity.y = Math.max(body.velocity.y, boost);
    body.angularVelocity.x *= 0.35;
    body.angularVelocity.z *= 0.35;
    this.vehiclePhysics.isAirborne = true;
    const glide = clampNumber(this.saveManager?.saveData?.settings?.airGlideMultiplier, 0.5, 1.8, 1);
    this._airGlideTimer = (contact.ramp.glideTime || 1.1) * glide;
    this._lastRampLaunch = this.elapsed;
    this.ui?.flashMessage('AIR', 0.55);
  }

  _makeProgressTracker() {
    return { lastIndex: null, laps: 0, score: 0 };
  }

  _resolveBarrierCollisions() {
    const pos = this.vehiclePhysics.getPosition();
    const roadInfo = this.trackManager?.getRoadInfoAtPosition?.(pos);
    const edgeCheckDistance = roadInfo
      ? Math.max(3.2, (roadInfo.halfWidth || 6) - 0.9)
      : 6.1;
    if (this._distanceToRouteCenter(pos) < edgeCheckDistance) return false;

    const collision = this.trackManager.checkBarrierCollision(pos, 1.2);
    if (!collision?.hit) return false;

    const body = this.vehiclePhysics.chassisBody;
    if (!body) return false;

    const pushStrength = collision.penetration * 0.55 + 0.08;
    body.position.x += collision.normal.x * pushStrength;
    body.position.z += collision.normal.z * pushStrength;

    const v = body.velocity;
    const dot = v.x * collision.normal.x + v.z * collision.normal.z;
    if (dot < 0) {
      v.x -= collision.normal.x * dot * 0.88;
      v.z -= collision.normal.z * dot * 0.88;
    }

    if (this.elapsed - this._lastBarrierHit > 0.45) {
      this.camera.applyShake(0.22, 0.28);
      this.ui.flashMessage('IMPACT', 0.45);
      this._lastBarrierHit = this.elapsed;
    }

    return true;
  }

  _resolveNPCContacts() {
    if (this.currentMode === 'race' && this.raceElapsed < 2.5) return false;

    let hit = false;
    for (const car of this.traffic.cars) {
      hit = this._resolveContactWith(car.mesh.position, 2.25, 2.8, false) || hit;
    }
    for (const cop of this.police.cops) {
      hit = this._resolveContactWith(cop.position, 2.35, 4.4, true) || hit;
    }
    return hit;
  }

  _resolveContactWith(otherPos, radius, impulse, isPolice) {
    const body = this.vehiclePhysics.chassisBody;
    if (!body) return false;

    const dx = body.position.x - otherPos.x;
    const dz = body.position.z - otherPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= radius) return false;

    const nx = dist > 0.001 ? dx / dist : Math.random() - 0.5;
    const nz = dist > 0.001 ? dz / dist : Math.random() - 0.5;
    const penetration = radius - dist;

    body.position.x += nx * penetration * 0.5;
    body.position.z += nz * penetration * 0.5;
    body.velocity.x += nx * impulse;
    body.velocity.z += nz * impulse;
    body.velocity.x *= isPolice ? 0.94 : 0.88;
    body.velocity.z *= isPolice ? 0.94 : 0.88;

    if (this.elapsed - this._lastTrafficHit > 0.5) {
      this.camera.applyShake(isPolice ? 0.32 : 0.24, 0.32);
      this.ui.flashMessage(isPolice ? 'RAMMED' : 'CONTACT', 0.55);
      this._lastTrafficHit = this.elapsed;
    }
    return true;
  }

  _resolveRoadHazards() {
    const body = this.vehiclePhysics.chassisBody;
    if (!body) return;

    const pos = this.vehiclePhysics.getPosition();
    const pv = new THREE.Vector3(pos.x, pos.y, pos.z);

    for (const rb of this.police.getRoadblocks()) {
      if (pv.distanceTo(rb.position) < rb.radius) {
        body.velocity.x *= 0.58;
        body.velocity.z *= 0.58;
        this.camera.applyShake(0.34, 0.38);
        this.ui.flashMessage('ROADBLOCK', 0.9);
      }
    }

    const spikes = this.police.getSpikeStrips();
    for (let i = 0; i < spikes.length; i++) {
      const ss = spikes[i];
      if (pv.distanceTo(ss.position) < ss.radius) {
        body.velocity.x *= 0.68;
        body.velocity.z *= 0.68;
        this.vehiclePhysics.nitroCapacity = 0;
        this.police.consumeSpikeStrip(i);
        this.camera.applyShake(0.22, 0.45);
        this.ui.flashMessage('SPIKES', 0.9);
      }
    }
  }

  _stabilizePlayerRide(delta = 1 / 60) {
    const body = this.vehiclePhysics?.chassisBody;
    if (!body || !this._routePoints.length) return;

    const roadInfo = this.trackManager?.getRoadInfoAtPosition?.(body.position);
    const nearest = roadInfo?.point || this._routePoints[this._nearestRouteIndex(body.position)];
    if (!nearest) return;

    const rampContact = this._getRampContact(body.position);
    const rampHeight = rampContact?.height || 0;
    const groundY = Number.isFinite(roadInfo?.surfaceY) ? roadInfo.surfaceY : nearest.y;
    if (this._smoothedRoadY === null || Math.abs(this._smoothedRoadY - groundY) > 1.5) {
      this._smoothedRoadY = groundY;
    } else {
      const heightFollow = 1 - Math.exp(-Math.min(delta, 0.1) * 18);
      this._smoothedRoadY += (groundY - this._smoothedRoadY) * heightFollow;
    }
    const targetY = this._smoothedRoadY + this._vehicleRideHeight + rampHeight;

    if (this._airGlideTimer > 0) {
      body.angularVelocity.x *= 0.78;
      body.angularVelocity.z *= 0.78;
      return;
    }

    const diffY = targetY - body.position.y;
    if (Math.abs(diffY) > 0.01) {
      const bodyFollow = 1 - Math.exp(-Math.min(delta, 0.1) * 16);
      body.position.y += diffY * bodyFollow;
      body.velocity.y *= Math.pow(0.45, Math.min(delta, 0.1) * 60);
    }

    body.angularVelocity.x *= 0.25;
    body.angularVelocity.z *= 0.25;

    const yaw = this._getPlayerYaw();
    const upY = 1 - 2 * body.quaternion.x * body.quaternion.x - 2 * body.quaternion.z * body.quaternion.z;
    if (upY < 0.92 || Math.abs(body.quaternion.x) > 0.12 || Math.abs(body.quaternion.z) > 0.12) {
      const targetQuat = body.quaternion.clone();
      targetQuat.setFromEuler(0, yaw, 0, 'YXZ');
      body.quaternion.x += (targetQuat.x - body.quaternion.x) * 0.22;
      body.quaternion.y += (targetQuat.y - body.quaternion.y) * 0.22;
      body.quaternion.z += (targetQuat.z - body.quaternion.z) * 0.22;
      body.quaternion.w += (targetQuat.w - body.quaternion.w) * 0.22;
      body.quaternion.normalize();
    }
  }

  _checkAutoRecovery(delta, inputData = {}) {
    const body = this.vehiclePhysics?.chassisBody;
    if (!body || !this._routePoints.length) return;

    const upY = 1 - 2 * body.quaternion.x * body.quaternion.x - 2 * body.quaternion.z * body.quaternion.z;
    const roadInfo = this.trackManager?.getRoadInfoAtPosition?.(body.position);
    const nearest = roadInfo?.point || this._routePoints[this._nearestRouteIndex(body.position)];
    const roadY = Number.isFinite(roadInfo?.surfaceY) ? roadInfo.surfaceY : nearest?.y;
    const hasRoadY = Number.isFinite(roadY);
    const offRoute = roadInfo?.distance ?? this._distanceToRouteCenter(body.position);
    const offRouteLimit = Math.max(38, (roadInfo?.halfWidth || 6) + 30);
    const tooLow = hasRoadY ? body.position.y < roadY - 6 : body.position.y < -2;
    const tooHigh = hasRoadY ? body.position.y > roadY + 28 : body.position.y > 80;
    const needsRecovery = tooLow ||
      tooHigh ||
      upY < 0.35 ||
      (!roadInfo?.onModelRoad && offRoute > offRouteLimit);

    this._checkMinorStuckRecovery(delta, inputData, needsRecovery);

    if (!needsRecovery) {
      this._recoveryTimer = 0;
      return;
    }

    this._recoveryTimer += delta;
    if (this._recoveryTimer > 1.0) {
      this._teleportPlayerToSpawn();
      this.ui?.flashMessage('AUTO RESET', 0.9);
      this._recoveryTimer = 0;
    } else if (this._recoveryTimer > 0.2) {
      this.ui?.setStatus('RESETTING...', '#ff4d6d');
    }
  }

  _checkMinorStuckRecovery(delta, inputData, hardRecoveryPending) {
    const body = this.vehiclePhysics?.chassisBody;
    if (!body) return;

    if (!this._lastStuckPosReady) {
      this._lastStuckPos.set(body.position.x, body.position.y, body.position.z);
      this._lastStuckPosReady = true;
      return;
    }

    const dx = body.position.x - this._lastStuckPos.x;
    const dz = body.position.z - this._lastStuckPos.z;
    const movedSq = dx * dx + dz * dz;
    this._lastStuckPos.set(body.position.x, body.position.y, body.position.z);

    const wantsDrive = !this._menuVisible &&
      this._countdown <= 0 &&
      !hardRecoveryPending &&
      ((inputData.throttle || 0) > 0.35 || (inputData.brake || 0) > 0.5);
    const speedKmh = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.z * body.velocity.z) * 3.6;
    const barelyMoving = speedKmh < 2.5 && movedSq < 0.0036;

    if (wantsDrive && barelyMoving) {
      this._stuckTimer += delta;
    } else {
      this._stuckTimer = Math.max(0, this._stuckTimer - delta * 2.5);
    }

    if (this._stuckTimer < 0.9 || this.elapsed - this._lastStuckLift < 1.15) {
      return;
    }

    const roadInfo = this.trackManager?.getRoadInfoAtPosition?.(body.position);
    const groundY = Number.isFinite(roadInfo?.surfaceY) ? roadInfo.surfaceY : roadInfo?.point?.y;
    const minY = Number.isFinite(groundY)
      ? groundY + this._vehicleRideHeight + 0.26
      : body.position.y + 0.2;
    const yaw = this._getPlayerYaw();

    body.position.y = Math.max(body.position.y + 0.18, minY);
    body.position.x += Math.sin(yaw) * 0.12;
    body.position.z += Math.cos(yaw) * 0.12;
    body.velocity.y = Math.max(body.velocity.y, 0.25);
    body.angularVelocity.x = 0;
    body.angularVelocity.z = 0;
    this._smoothedRoadY = Number.isFinite(groundY) ? groundY : this._smoothedRoadY;
    this._lastStuckLift = this.elapsed;
    this._stuckTimer = 0;
    this.ui?.flashMessage('UNSTUCK', 0.45);
  }

  _updateCamera(speedKmh, inputData, collisionHit) {
    const speedBoost = Math.min(speedKmh / 280, 1);
    const nitroBoost = this.vehiclePhysics.nitroActive ? 6 : 0;
    this.camera.setFOV(60 + speedBoost * 6 + nitroBoost);
    this.camera.applyTilt(-inputData.steerAxis * Math.min(speedKmh / 220, 1) * 0.12);

    if (collisionHit && speedKmh > 45) {
      this.camera.applyShake(Math.min(0.35, speedKmh / 700), 0.2);
    }
  }

  _enterLevelEditorCamera() {
    const playerPos = this.vehiclePhysics?.getPosition?.() || this.carModel?.root?.position || { x: 0, y: 0, z: 0 };
    const target = new THREE.Vector3(playerPos.x || 0, (playerPos.y || 0) + 1.5, playerPos.z || 0);
    this._editorCameraState = {
      target,
      yaw: Math.PI * 0.25,
      pitch: THREE.MathUtils.degToRad(58),
      distance: 54,
    };
    this.camera?.releaseOrbit?.();
    this.camera?.applyTilt?.(0);
    this.camera.camera.fov = 56;
    this.camera.camera.updateProjectionMatrix();
    this._applyEditorCamera(true);
  }

  _exitLevelEditorCamera() {
    this._editorCameraState = null;
    this.camera?.resetFOV?.();
    this.camera?.applyTilt?.(0);
    if (this.carModel?.root) this.camera?.snapToTarget?.(this.carModel.root);
  }

  _updateEditorCamera(delta, inputData = {}) {
    if (!this._editorCameraState) this._enterLevelEditorCamera();
    const state = this._editorCameraState;
    const typingInEditor = this.levelEditorUI?.isTypingInEditor?.() === true;
    const input = typingInEditor ? {} : inputData;

    if (input.resetRequested) {
      const pos = this.vehiclePhysics?.getPosition?.() || { x: 0, y: 0, z: 0 };
      state.target.set(pos.x || 0, (pos.y || 0) + 1.5, pos.z || 0);
    }

    const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize();
    const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).normalize();
    const speed = (input.nitro ? 58 : 34) * (input.handbrake ? 0.45 : 1);
    const moveZ = (input.throttle || 0) - (input.brake || 0);
    const moveX = input.steerAxis || 0;
    const dt = Math.min(delta, 0.1);

    state.target.addScaledVector(forward, moveZ * speed * dt);
    state.target.addScaledVector(right, moveX * speed * dt);

    const roadPoint = this.trackManager?.getRoadInfoAtPosition?.(state.target)?.point;
    if (roadPoint && Number.isFinite(roadPoint.y)) {
      state.target.y += (roadPoint.y + 1.5 - state.target.y) * Math.min(dt * 8, 1);
    }

    this._applyEditorCamera(false);
  }

  _applyEditorCamera(instant = false) {
    const state = this._editorCameraState;
    if (!state || !this.camera?.camera) return;

    const horizontal = Math.cos(state.pitch) * state.distance;
    const height = Math.sin(state.pitch) * state.distance;
    const desired = state.target.clone().add(new THREE.Vector3(
      Math.sin(state.yaw) * horizontal,
      height,
      Math.cos(state.yaw) * horizontal,
    ));
    const cam = this.camera.camera;
    if (instant) cam.position.copy(desired);
    else cam.position.lerp(desired, 1 - Math.exp(-10 * this.delta));
    cam.up.set(0, 1, 0);
    cam.lookAt(state.target);
  }

  _rotateEditorCamera(dx = 0, dy = 0) {
    if (!this._editorCameraState) this._enterLevelEditorCamera();
    const state = this._editorCameraState;
    state.yaw -= (dx || 0) * 0.006;
    state.pitch = THREE.MathUtils.clamp(
      state.pitch + (dy || 0) * 0.004,
      THREE.MathUtils.degToRad(18),
      THREE.MathUtils.degToRad(78)
    );
    this._applyEditorCamera(true);
  }

  _zoomEditorCamera(deltaY = 0) {
    if (!this._editorCameraState) this._enterLevelEditorCamera();
    const state = this._editorCameraState;
    const zoom = Math.exp((deltaY || 0) * 0.0012);
    state.distance = THREE.MathUtils.clamp(state.distance * zoom, 12, 120);
    this._applyEditorCamera(true);
  }

  _resetEditorCameraTarget() {
    if (!this._editorCameraState) this._enterLevelEditorCamera();
    const pos = this.vehiclePhysics?.getPosition?.() || { x: 0, y: 0, z: 0 };
    this._editorCameraState.target.set(pos.x || 0, (pos.y || 0) + 1.5, pos.z || 0);
    this._applyEditorCamera(true);
  }

  _freezeVehicleForEditor() {
    const body = this.vehiclePhysics?.chassisBody;
    if (!body) return;
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    this.vehiclePhysics.nitroActive = false;
    this.vehiclePhysics.isAirborne = false;
    this.vehiclePhysics.speedKmh = 0;
    this.vehiclePhysics._arcadeSpeed = 0;
  }

  _updateAudio(delta, inputData, speedKmh, barrierHit, npcHit) {
    if (this._isBackgrounded) return;
    if (!this._audioUnlocked || !this.audio || !this.carAudio) return;

    const braking = inputData.brake > 0 || inputData.handbrake;
    this.carAudio.update(
      delta,
      speedKmh,
      inputData.throttle || 0,
      braking,
      this.vehiclePhysics.nitroActive,
      this.vehiclePhysics.isDriftActive
    );

    if (this.vehiclePhysics.nitroActive && !this._lastNitroAudio) {
      this.carAudio.playNitroBurst();
    }
    this._lastNitroAudio = this.vehiclePhysics.nitroActive;

    const moving = speedKmh > 8;
    if (moving && !this._lastMovingAudio) {
      this.audio.playEngineStart();
    } else if (!moving && this._lastMovingAudio && speedKmh < 2) {
      this.audio.playEngineStop();
    }
    this._lastMovingAudio = moving;

    const speedBand = Math.floor(Math.max(0, speedKmh) / 45);
    if (speedBand > this._lastSpeedBand && this.elapsed - this._lastGearCue > 0.45 && speedKmh > 25) {
      this.audio.playGearShift();
      this._lastGearCue = this.elapsed;
    }
    this._lastSpeedBand = speedBand;

    if ((barrierHit || npcHit) && this.elapsed - this._lastImpactAudio > 0.35) {
      this.audio.playImpact(Math.min(1, Math.max(0.35, speedKmh / 110)));
      this.carAudio.playCrash(Math.min(0.8, Math.max(0.25, speedKmh / 160)));
      this._lastImpactAudio = this.elapsed;
    }

    this._updateNearbyHornAudio(speedKmh);
  }

  _updateNearbyHornAudio(speedKmh) {
    if (!this.audio || this.elapsed - this._lastHornAt < 3.2) return;
    if (this._countdown > 0 || this.raceElapsed < 0.8) return;
    const playerPos = this.vehiclePhysics?.getPosition();
    if (!playerPos) return;

    let closest = Infinity;
    const consider = (pos, movingSpeed = 0) => {
      if (!pos) return;
      const dx = pos.x - playerPos.x;
      const dz = pos.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 3.2 && dist < closest && dist < 18 && (movingSpeed > 5 || speedKmh > 10)) {
        closest = dist;
      }
    };

    for (const car of this.traffic?.cars || []) {
      if (car._sleeping) continue;
      consider(car.mesh?.position || car.position, car.speed || 0);
    }
    for (const cop of this.police?.cops || []) {
      consider(cop.mesh?.position || cop.position, cop.speed || 0);
    }

    if (closest < Infinity) {
      const intensity = 1 - Math.max(0, Math.min(1, (closest - 3.2) / 14.8));
      this.audio.playHorn(intensity);
      this._lastHornAt = this.elapsed;
    }
  }

  _emitVehicleEffects(delta, inputData) {
    if (!this.effects || !this.carModel?.root) return;
    if (this.saveManager?.saveData?.settings?.particlesEnabled === false) return;

    const root = this.carModel.root;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
    const rearward = forward.clone().negate();
    const speedKmh = Math.abs(this.vehiclePhysics?.getSpeedKmh?.() || 0);
    const throttle = Math.max(0, inputData.throttle || 0);
    const modelScale = Number(root.userData?.vehicleModelScale || root.scale?.x || VEHICLE_MODEL_SCALE);
    const exhaust = root.position.clone().addScaledVector(forward, -1.55 * modelScale);
    exhaust.y += 0.32 * modelScale;
    const effectScale = this._mobileEffectScale || 1;
    const particleCountScale = this._mobileThermalMode ? 0.5 : 1;

    const exhaustRate = (8 + throttle * 10 + Math.min(speedKmh / 120, 1) * 6) * effectScale;
    this._exhaustEffectAccumulator += delta * exhaustRate;
    while (this._exhaustEffectAccumulator >= 1) {
      this._exhaustEffectAccumulator -= 1;
      const pipe = exhaust.clone().addScaledVector(right, (Math.random() < 0.5 ? -1 : 1) * 0.18 * modelScale);
      this.effects.emitParticles(pipe, Math.max(1, Math.round(2 * particleCountScale)), {
        color: speedKmh < 18 ? 0x242522 : 0x34332f,
        size: 0.12 + Math.random() * 0.06,
        lifetime: 1.15 + Math.random() * 0.55,
        spread: 0.18,
        velocity: 0.8 + Math.min(speedKmh / 180, 1) * 0.7,
        direction: rearward,
        directionJitter: 0.42,
        upward: 0.52,
        gravity: 0.08,
        grow: 2.8,
        opacity: 0.52,
        fadePower: 1.35,
      });
    }

    if (this.vehiclePhysics.nitroActive) {
      const left = exhaust.clone().addScaledVector(right, -0.28);
      const rightExhaust = exhaust.clone().addScaledVector(right, 0.28);
      const nitroCount = this._mobileThermalMode ? 1 : 3;
      this.effects.emitParticles(left, nitroCount, {
        color: 0x66e8ff,
        size: 0.08,
        lifetime: 0.42,
        spread: 0.28,
        velocity: 6.5,
      });
      this.effects.emitParticles(rightExhaust, nitroCount, {
        color: 0xffd166,
        size: 0.065,
        lifetime: 0.32,
        spread: 0.22,
        velocity: 5.2,
      });
    }

    const dustActive = speedKmh > 10 || this.vehiclePhysics.isDriftActive || inputData.handbrake;
    if (dustActive) {
      const rearLeft = root.position.clone().addScaledVector(forward, -0.95 * modelScale).addScaledVector(right, -0.6 * modelScale);
      const rearRight = root.position.clone().addScaledVector(forward, -0.95 * modelScale).addScaledVector(right, 0.6 * modelScale);
      rearLeft.y += 0.12 * modelScale;
      rearRight.y += 0.12 * modelScale;
      const driftBoost = (this.vehiclePhysics.isDriftActive || inputData.handbrake) ? 2.6 : 1.25;
      const dustRate = (9 + Math.min(speedKmh / 140, 1) * 22) * driftBoost * effectScale;
      this._dustEffectAccumulator += delta * dustRate;
      while (this._dustEffectAccumulator >= 1) {
        this._dustEffectAccumulator -= 1;
        const color = Math.random() < 0.55 ? 0xcab98e : 0xa59a7f;
        const options = {
          color,
          size: 0.18 + Math.random() * 0.1,
          lifetime: 0.95 + Math.random() * 0.5,
          spread: 0.52,
          velocity: 1.2 + Math.min(speedKmh / 180, 1) * 1.1,
          direction: rearward,
          directionJitter: 0.72,
          upward: 0.34,
          gravity: -0.06,
          grow: 3.1,
          opacity: 0.48 + Math.min(speedKmh / 160, 1) * 0.22,
          fadePower: 1.15,
        };
        const dustCount = Math.max(1, Math.round(2 * particleCountScale));
        this.effects.emitParticles(rearLeft, dustCount, options);
        this.effects.emitParticles(rearRight, dustCount, options);
      }
    } else {
      this._dustEffectAccumulator = Math.min(this._dustEffectAccumulator, 0.5);
    }
  }

  _updateCountdown(delta) {
    if (this._countdown <= 0) return;

    this._countdown -= delta;
    let cue;
    if (this._countdown > 0.2) {
      cue = Math.ceil(Math.min(3, this._countdown));
      this.ui.setCountdown(cue);
    } else {
      cue = 'GO';
      this.ui.setCountdown('GO');
    }

    if (cue !== this._lastCountdownCue) {
      if (cue === 'GO') {
        this.audio?.playGo();
      } else {
        this.audio?.playCountdownTick(cue);
      }
      this._lastCountdownCue = cue;
    }

    if (this._countdown <= 0) {
      this._countdown = 0;
      this.raceElapsed = 0;
      this.timer.reset();
      this.ui.flashMessage('GO', 0.7);
    }
  }

  _teleportPlayerToSpawn() {
    const body = this.vehiclePhysics?.chassisBody;
    const sp = this._getSafeSpawnPoint();
    if (!body) return;

    body.position.set(sp.x, sp.y, sp.z);
    body.quaternion.setFromEuler(0, sp.yaw || 0, 0, 'YXZ');
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    this._airGlideTimer = 0;
    this.vehiclePhysics.nitroCapacity = 100;
    this.vehiclePhysics.nitroActive = false;
    this.vehiclePhysics.isAirborne = false;
    this.vehiclePhysics.speedKmh = 0;
    this.vehiclePhysics._arcadeSpeed = 0;
    this._smoothedRoadY = sp.y - this._vehicleRideHeight;
    this._stuckTimer = 0;
    this._lastStuckPos.set(sp.x, sp.y, sp.z);
    this._lastStuckPosReady = true;
    this.vehiclePhysics.syncToMesh(this.carModel.root);
    this.camera.snapToTarget(this.carModel.root);
  }

  _getPlayerYaw() {
    if (!this.carModel?.root) return 0;
    const e = new THREE.Euler().setFromQuaternion(this.carModel.root.quaternion, 'YXZ');
    return e.y;
  }

  _setupCallbacks() {
    this._setupVisibility();
    this._setupResize();
    this._setupAudioUnlock();
  }

  _setupProfile() {
    if (!this.profileUI) return;

    this.profileUI.onLogin = (profile) => {
      const saved = this.saveManager.updatePlayerProfile({
        ...profile,
        loggedIn: true,
      });
      localStorage.setItem('cargame_mp_name', saved.name || 'Racer');
      this.ui?.flashMessage(`欢迎，${saved.name}`, 1.0);
      this._showPlayerProfile();
    };

    this.profileUI.onSaveCustomization = (customization) => {
      const next = this.saveManager.updateVehicleCustomization(customization);
      if (customization.title) {
        this.saveManager.updatePlayerProfile({ title: customization.title });
      }
      this._applyVehicleCustomization(next);
      this._refreshProfilePanel();
      this.ui?.flashMessage('外观已保存', 0.65);
    };

    this.profileUI.onExit = () => this._hidePlayerProfile();
  }

  _showLoginIfNeeded() {
    const profile = this.saveManager?.saveData?.playerProfile;
    if (!profile?.loggedIn || !profile?.name) {
      this._hideMenu();
      this._hideOrbitBtn();
      this.profileUI?.showLogin(profile || {});
    }
  }

  _showPlayerProfile() {
    this._hideMenu();
    this._hideGarage();
    this._leaveMultiplayer();
    this.settingsUI?.hide?.();
    this._hideTrackSelectDialog();
    this._hideOrbitBtn();
    this.input?.clearActiveInputs?.();
    this._refreshProfilePanel();
  }

  _hidePlayerProfile() {
    this.profileUI?.hide?.();
    this._disposeProfilePreviewModel();
    if (!this._menuVisible) this._showOrbitBtn();
  }

  _refreshProfilePanel() {
    if (!this.profileUI) return;
    const data = this._buildProfileData();
    this.profileUI.showProfile(data);
    this.profileUI.setPreviewCar(this._buildProfilePreviewFallbackCar(this._currentCarId));
    const buildId = ++this._profilePreviewBuildId;
    this._loadProfilePreviewCar(this._currentCarId, buildId);
  }

  _buildProfileData() {
    const save = this.saveManager?.saveData || {};
    const car = this.carLibrary?.getCar(this._currentCarId) || {};
    const tuning = this.carTune?.getTuningLevels?.(this._currentCarId) || {};
    const finalStats = this.carLibrary?.computeFinalStats?.(this._currentCarId, tuning) || {};
    const baseStats = car.baseStats || {};
    return {
      profile: save.playerProfile || {},
      customization: save.vehicleCustomization || {},
      car,
      stats: {
        level: save.playerLevel || 1,
        xp: save.xp || 0,
        wins: save.totalWins || 0,
        races: save.totalRaces || 0,
        speed: Math.min(100, ((finalStats.maxSpeed || baseStats.maxSpeed || 180) / 320) * 100),
        accel: Math.min(100, ((finalStats.engineForce || baseStats.engineForce || 2500) / 5200) * 100),
        handling: Math.min(100, ((finalStats.wheelFriction || baseStats.wheelFriction || 900) / 1500) * 100),
        nitro: Math.min(100, ((finalStats.nitroCapacity || baseStats.nitroCapacity || 100) / 180) * 100),
      },
    };
  }

  _buildProfilePreviewFallbackCar(carId) {
    this._disposeProfilePreviewModel();
    const car = this.carLibrary?.getCar(carId);
    if (!car) return null;
    const preview = new CarModel();
    const custom = this.saveManager?.saveData?.vehicleCustomization || {};
    const color = parseInt(String(custom.color || car.defaultColor || '#e74c3c').replace('#', ''), 16);
    preview.buildProcedural({ body: Number.isFinite(color) ? color : 0xe74c3c }, car.bodyStyle || 'sports');
    this._applyCustomizationToCarRoot(preview.root, custom);
    this._profilePreviewModel = preview;
    return preview.root;
  }

  async _loadProfilePreviewCar(carId, buildId = this._profilePreviewBuildId) {
    const car = this.carLibrary?.getCar(carId);
    if (!car || !this.assets) return;

    const preview = new CarModel();
    const custom = this.saveManager?.saveData?.vehicleCustomization || {};
    const loaded = await this._tryLoadConfiguredCarModel(preview, car, car.bodyStyle || 'sports', '[Profile]');
    if (!loaded) {
      preview.dispose?.();
      return;
    }

    if (buildId !== this._profilePreviewBuildId || !this.profileUI?.visible) {
      preview.dispose?.();
      return;
    }

    this._applyCustomizationToCarRoot(preview.root, custom);
    this._disposeProfilePreviewModel();
    this._profilePreviewModel = preview;
    this.profileUI.setPreviewCar(preview.root);
  }

  _disposeProfilePreviewModel() {
    this._profilePreviewBuildId++;
    if (!this._profilePreviewModel) return;
    this._profilePreviewModel.dispose?.();
    this._profilePreviewModel = null;
  }

  _applyVehicleCustomization(customization = this.saveManager?.saveData?.vehicleCustomization || {}) {
    if (customization.color && this.carPaint) {
      this.carPaint.setColor(customization.color);
      this.carPaint.saveCurrent();
      this.carPaint.applyToCar(this.carModel?.root);
    }
    this._applyCustomizationToCarRoot(this.carModel?.root, customization);
  }

  _applyCustomizationToCarRoot(root, customization = {}) {
    if (!root) return;
    root.userData.vehicleCustomization = { ...customization };
    const color = customization.color ? parseInt(String(customization.color).replace('#', ''), 16) : null;
    root.traverse(child => {
      if (!child.isMesh || !child.material || color == null || !Number.isFinite(color)) return;
      const label = `${child.name || ''} ${child.material?.name || ''}`.toLowerCase();
      if (/body|paint|chassis|hood|door|panel|roof/.test(label) || child.userData?.pbrRole === 'body') {
        child.material.color?.setHex?.(color);
      }
    });
  }

  _setupGarage() {
    if (!this.garageUI || !this.carLibrary) return;

    this.garageUI.onCarSelect = async (carId) => {
      const car = this.carLibrary.getCar(carId);
      if (!car) return;

      if (!this.carLibrary.isCarOwned(carId)) {
        const result = this.carLibrary.purchaseCar(carId);
        if (!result.success) {
          this.ui?.flashMessage(this._formatGarageReason(result.reason), 1.0);
          this._refreshGarage();
          return;
        }
        this.ui?.flashMessage('CAR PURCHASED', 0.9);
      }

      await this._selectPlayerCar(carId, { rebuild: true, resetPlayer: false });
      this._refreshGarage();
    };

    this.garageUI.onTuneUpgrade = (carId, category) => {
      if (!this.carLibrary.isCarOwned(carId)) {
        this.ui?.flashMessage('BUY CAR FIRST', 0.9);
        return;
      }
      const result = this.carTune.purchaseUpgrade(carId, category);
      if (!result.success) {
        this.ui?.flashMessage(this._formatGarageReason(result.reason), 0.9);
        return;
      }
      if (carId === this._currentCarId) {
        this.carTune.applyToVehicle(this.vehiclePhysics, carId);
      }
      this._refreshGarage();
      this.ui?.flashMessage(`${category.toUpperCase()} LV.${result.newLevel}`, 0.9);
    };

    this.garageUI.onPaintChange = (change) => {
      if (!this.carPaint) return;
      if (change.type === 'color') this.carPaint.setColor(change.value);
      if (change.type === 'metallic') this.carPaint.setMetallic(change.value);
      if (change.type === 'roughness') this.carPaint.setRoughness(change.value);
      if (change.type === 'pearl') this.carPaint.setPearlEnabled(change.value);
      this.carPaint.applyToCar(this.carModel?.root);
      this.carPaint.saveCurrent();
      this.garageUI.setPreviewCar(this._buildGaragePreviewCar(this._currentCarId));
    };

    this.garageUI.onPaintSave = (slot) => {
      if (this.carPaint?.savePreset(slot)) this.ui?.flashMessage(`PAINT SAVED ${slot + 1}`, 0.75);
      else this.ui?.flashMessage('SAVE FAILED', 0.8);
    };

    this.garageUI.onPaintLoad = (slot) => {
      if (this.carPaint?.loadPreset(slot)) {
        this.carPaint.applyToCar(this.carModel?.root);
        this.garageUI.setPaintState(this.carPaint.getState());
        this.garageUI.setPreviewCar(this._buildGaragePreviewCar(this._currentCarId));
        this.ui?.flashMessage(`PAINT LOADED ${slot + 1}`, 0.75);
      } else {
        this.ui?.flashMessage('EMPTY PAINT SLOT', 0.75);
      }
    };

    this.garageUI.onExit = () => this._hideGarage();
    this.garageUI.onRaceStart = async (carId) => {
      await this._selectPlayerCar(carId, { rebuild: true, resetPlayer: true });
      this._hideGarage();
      this._startMode('race', { resetPlayer: true });
    };
    this.garageUI.onPursuitStart = async (carId) => {
      await this._selectPlayerCar(carId, { rebuild: true, resetPlayer: true });
      this._hideGarage();
      this._startMode('pursuit', { resetPlayer: true });
    };
  }

  _showGarage() {
    this._hideMenu();
    this._hidePlayerProfile();
    this.settingsUI?.hide?.();
    this._hideTrackSelectDialog();
    this._hideOrbitBtn();
    this.input?.clearActiveInputs?.();
    this._refreshGarage();
  }

  _hideGarage() {
    this.garageUI?.hide?.();
    this.garageUI?.setPreviewCar?.(null);
    this._disposeGaragePreviewModel();
    if (!this._menuVisible) this._showOrbitBtn();
  }

  _refreshGarage() {
    if (!this.garageUI || !this.carLibrary || !this.carTune) return;
    const cars = this.carLibrary.getCarList();
    const tuningLevels = {};
    for (const car of cars) {
      tuningLevels[car.id] = this.carTune.getTuningLevels(car.id);
    }
    this.garageUI.show(cars, this._currentCarId, this.carLibrary.getCredits(), tuningLevels);
    this.garageUI.setPaintState(this.carPaint?.getState?.() || {});
    this.garageUI.setPreviewCar(this._buildGaragePreviewCar(this._currentCarId));
    setTimeout(() => this.garageUI?.resize?.(), 0);
  }

  _buildGaragePreviewCar(carId) {
    this._disposeGaragePreviewModel();
    const car = this.carLibrary?.getCar(carId);
    if (!car) return null;
    const preview = new CarModel();
    const colorHex = this.carPaint?.getState?.().color || car.defaultColor || '#e74c3c';
    const color = parseInt(String(colorHex).replace('#', ''), 16);
    preview.buildProcedural({ body: Number.isFinite(color) ? color : 0xe74c3c }, car.bodyStyle || 'sports');
    this._garagePreviewModel = preview;
    return preview.root;
  }

  _disposeGaragePreviewModel() {
    if (!this._garagePreviewModel) return;
    this._garagePreviewModel.dispose?.();
    this._garagePreviewModel = null;
  }

  async _selectPlayerCar(carId, options = {}) {
    const nextCarId = this._resolveSavedCarId(carId);
    if (!this.carLibrary?.isCarOwned(nextCarId)) return false;

    const changed = nextCarId !== this._currentCarId;
    this._currentCarId = nextCarId;
    this.saveManager.saveData.currentCarId = nextCarId;
    this.saveManager.save();
    this.carPaint?.load(nextCarId);

    if (options.rebuild && changed) {
      await this._rebuildPlayerCar(nextCarId, { resetPlayer: options.resetPlayer });
    } else {
      this.carTune?.applyToVehicle(this.vehiclePhysics, nextCarId);
      this.carPaint?.applyToCar(this.carModel?.root);
      this._applyVehicleCustomization(this.saveManager?.saveData?.vehicleCustomization);
    }
    return true;
  }

  _resolveSavedCarId(carId) {
    const owned = this.saveManager?.saveData?.ownedVehicles || ['tuner'];
    const ids = this.carLibrary?.getAllCarIds?.() || [];
    const requested = String(carId || '').trim();
    if (requested && ids.includes(requested) && owned.includes(requested)) return requested;
    const firstOwned = owned.find(id => ids.includes(id));
    return firstOwned || ids[0] || 'tuner';
  }

  _formatGarageReason(reason) {
    const map = {
      locked: 'LOCKED',
      'already owned': 'ALREADY OWNED',
      'insufficient credits': 'NOT ENOUGH CREDITS',
      'max level': 'MAX LEVEL',
      'invalid category': 'INVALID UPGRADE',
      'car not found': 'CAR NOT FOUND',
    };
    return map[reason] || 'ACTION FAILED';
  }

  _setupMultiplayer() {
    if (!this.multiplayerUI || !this.networkSync) return;

    this.networkSync.wireCallbacks({
      onRoomJoined: (roomId, playerId, players) => {
        this._multiplayerRoomCode = roomId;
        this._multiplayerReady = false;
        this.multiplayerUI.setServerInfo?.(this.networkSync.serverUrl, 'connected', '已进入房间，可以分享房间号给好友。');
        this.multiplayerUI.showLobby(roomId, this._normalizeLobbyPlayers(players, playerId), this._multiplayerRoomSettings, playerId === 1);
        this.ui?.flashMessage(`ROOM ${roomId}`, 0.9);
      },
      onPlayerJoined: () => this._refreshMultiplayerPlayers(),
      onPlayerLeft: (playerId) => {
        this._removeRemoteCar(playerId);
        this._refreshMultiplayerPlayers();
      },
      onReadyState: (readyMap) => {
        if (readyMap && this.networkSync?.playerId in readyMap) {
          this._multiplayerReady = Boolean(readyMap[this.networkSync.playerId]);
        }
        this._refreshMultiplayerPlayers(readyMap);
      },
      onRoomSettings: (settings) => {
        this._multiplayerRoomSettings = { ...this._multiplayerRoomSettings, ...(settings || {}) };
        this.multiplayerUI?.applyRoomSettings?.(this._multiplayerRoomSettings);
        this._refreshMultiplayerPlayers();
      },
      onMatchStart: () => this.ui?.flashMessage('MATCH STARTING', 0.8),
      onCountdown: (seconds) => this.multiplayerUI?.showCountdown(seconds),
      onRaceStart: () => this._startMultiplayerRace(),
      onRankUpdate: (ranks) => this._handleMultiplayerRanks(ranks),
      onRaceFinish: (results) => this._handleMultiplayerFinish(results),
      onReturnToLobby: () => this._returnToMultiplayerLobby(),
      onConnectionStatus: (status, detail) => this._handleNetworkConnectionStatus(status, detail),
      onError: (_code, message) => this.multiplayerUI?.showError(message || 'Network error'),
      onDisconnect: (reason) => {
        this._multiplayerActive = false;
        this._multiplayerReady = false;
        this._clearRemoteCars();
        if (this.multiplayerUI?.visible) {
          this.multiplayerUI.setServerInfo?.(this.networkSync.serverUrl, 'disconnected', `连接已断开：${reason}`);
          this.multiplayerUI.showError(`Disconnected: ${reason}`);
        }
      },
    });

    this.multiplayerUI.onServerUrlChange = (url) => {
      this.networkSync.setServerUrl(url);
      this.multiplayerUI.setServerInfo?.(this.networkSync.serverUrl, 'idle', '服务器地址已保存');
    };
    this.multiplayerUI.onTestServer = (url) => this._testMultiplayerServer(url);
    this.multiplayerUI.onRefreshRooms = (url) => this._refreshMultiplayerRooms(url);
    this.multiplayerUI.onCreateRoom = (playerName, roomSettings, serverUrl) => {
      this.networkSync.setServerUrl(serverUrl || this.networkSync.serverUrl);
      this._multiplayerReady = false;
      this._multiplayerRoomSettings = { ...this._multiplayerRoomSettings, ...(roomSettings || {}) };
      const code = this.networkSync.createRoom(playerName, this._vehicleTypeIndex(this._currentCarId), this._multiplayerRoomSettings);
      this.multiplayerUI.setServerInfo?.(this.networkSync.serverUrl, 'connecting', `正在创建房间 ${code}...`);
      this.multiplayerUI.showError(`Connecting to ${code}...`);
    };
    this.multiplayerUI.onJoinRoom = (roomCode, playerName, serverUrl) => {
      this.networkSync.setServerUrl(serverUrl || this.networkSync.serverUrl);
      this._multiplayerReady = false;
      this.networkSync.joinRoom(roomCode, playerName, this._vehicleTypeIndex(this._currentCarId));
      this.multiplayerUI.setServerInfo?.(this.networkSync.serverUrl, 'connecting', `正在加入房间 ${roomCode}...`);
      this.multiplayerUI.showError(`Joining ${roomCode}...`);
    };
    this.multiplayerUI.onReady = (ready) => {
      this._multiplayerReady = ready;
      this.networkSync.setReady(ready);
      this._refreshMultiplayerPlayers();
    };
    this.multiplayerUI.onRoomSettingsChange = (settings) => {
      this._multiplayerRoomSettings = { ...this._multiplayerRoomSettings, ...(settings || {}) };
      this.networkSync.setRoomSettings(this._multiplayerRoomSettings);
      this._refreshMultiplayerPlayers();
    };
    this.multiplayerUI.onLeave = () => this._leaveMultiplayer();
  }

  _showMultiplayer() {
    this._hideMenu();
    this._hideGarage();
    this._hidePlayerProfile();
    this.settingsUI?.hide?.();
    this._hideTrackSelectDialog();
    this._hideOrbitBtn();
    this.input?.clearActiveInputs?.();
    const profileName = this.saveManager?.saveData?.playerProfile?.name;
    if (profileName) localStorage.setItem('cargame_mp_name', profileName);
    this.multiplayerUI?.setServerInfo?.(this.networkSync.serverUrl, 'idle', '可以测试服务器或刷新公开房间');
    this.multiplayerUI?.show({ serverUrl: this.networkSync.serverUrl });
  }

  _handleNetworkConnectionStatus(status, detail = {}) {
    if (!this.multiplayerUI?.visible) return;
    const labels = {
      connecting: '正在连接服务器...',
      connected: 'WebSocket 已连接，正在同步房间。',
      disconnected: `连接已断开：${detail.reason || 'unknown'}`,
      error: '连接失败，请检查服务器地址、防火墙或公网端口。',
    };
    this.multiplayerUI.setServerInfo?.(this.networkSync.serverUrl, status, labels[status] || status, this.networkSync.ping);
  }

  async _testMultiplayerServer(url = this.networkSync?.serverUrl) {
    if (!this.networkSync || !this.multiplayerUI) return;
    try {
      const normalized = this.networkSync.setServerUrl(url || this.networkSync.serverUrl);
      this.multiplayerUI.setServerInfo?.(normalized, 'testing', '正在检测服务器健康状态...');
      const result = await this.networkSync.testServer(normalized);
      const rooms = result.data?.rooms ?? 0;
      const players = result.data?.players ?? 0;
      this.multiplayerUI.setServerInfo?.(result.url, 'online', `服务器在线：${rooms} 个房间，${players} 名玩家`, result.latency);
      this.ui?.flashMessage('SERVER ONLINE', 0.75);
      await this._refreshMultiplayerRooms(result.url, { quiet: true });
    } catch (err) {
      const message = err?.name === 'AbortError' ? '连接超时' : (err?.message || String(err));
      this.multiplayerUI.setServerInfo?.(url || this.networkSync.serverUrl, 'offline', `服务器不可用：${message}`);
      this.multiplayerUI.showError(`服务器连接失败：${message}`);
    }
  }

  async _refreshMultiplayerRooms(url = this.networkSync?.serverUrl, options = {}) {
    if (!this.networkSync || !this.multiplayerUI) return;
    try {
      const normalized = this.networkSync.setServerUrl(url || this.networkSync.serverUrl);
      const rooms = await this.networkSync.fetchRooms(normalized);
      this.multiplayerUI.setRooms?.(rooms);
      this.multiplayerUI.setServerInfo?.(normalized, 'online', `已刷新 ${rooms.length} 个公开房间`, this.networkSync.ping);
      if (!options.quiet) this.ui?.flashMessage(`ROOMS ${rooms.length}`, 0.65);
    } catch (err) {
      const message = err?.message || String(err);
      this.multiplayerUI.setServerInfo?.(url || this.networkSync.serverUrl, 'offline', `房间列表刷新失败：${message}`);
      if (!options.quiet) this.multiplayerUI.showError(`房间列表刷新失败：${message}`);
    }
  }

  _leaveMultiplayer() {
    this.networkSync?.disconnect?.();
    this.multiplayerUI?.hide?.();
    this._multiplayerActive = false;
    this._multiplayerReady = false;
    this._multiplayerRoomCode = null;
    this._multiplayerRoomSettings = { mode: 'speed', trackId: 'city_circuit', laps: 3, maxPlayers: 6, itemMode: false, collisions: true };
    this._clearRemoteCars();
    if (!this._menuVisible) this._showOrbitBtn();
  }

  _normalizeLobbyPlayers(players = [], localPlayerId = this.networkSync?.playerId) {
    return players.map(player => ({
      id: player.id,
      name: player.id === localPlayerId ? `${player.name || 'You'} (You)` : player.name,
      vehicleType: player.vehicleType || 0,
      ready: Boolean(player.ready),
      local: player.id === localPlayerId,
    }));
  }

  _refreshMultiplayerPlayers(readyMap = null) {
    if (!this.multiplayerUI?.visible || !this.networkSync?.connected) return;
    const players = [{
      id: this.networkSync.playerId || 0,
      name: `${this.saveManager?.saveData?.playerProfile?.name || 'You'} (You)`,
      vehicleType: this._vehicleTypeIndex(this._currentCarId),
      ready: this._multiplayerReady,
      local: true,
    }];

    for (const [id, remote] of this.networkSync.remotePlayers) {
      players.push({
        id,
        name: remote.name || `Player ${id}`,
        vehicleType: remote.vehicleType || 0,
        ready: readyMap ? Boolean(readyMap[id]) : Boolean(remote.ready),
      });
    }

    this.multiplayerUI.updatePlayers(players, this._multiplayerRoomSettings, this.networkSync.playerId === 1);
  }

  async _startMultiplayerRace() {
    this.multiplayerUI?.hideCountdown?.();
    this.multiplayerUI?.hide?.();
    this._multiplayerActive = true;
    this._multiplayerReady = false;
    this._clearRemoteCars();
    if (this._multiplayerRoomSettings?.trackId && this._multiplayerRoomSettings.trackId !== this.currentTrackId) {
      await this._loadTrackForMultiplayer(this._multiplayerRoomSettings.trackId);
    }
    this._startMode('multiplayer', { resetPlayer: true });
    this.ui?.flashMessage('MULTIPLAYER', 1.0);
  }

  _returnToMultiplayerLobby() {
    this._multiplayerActive = false;
    this._clearRemoteCars();
    if (this.networkSync?.connected) {
      this.multiplayerUI?.show();
      this.multiplayerUI?.showLobby(this._multiplayerRoomCode || this.networkSync.roomId || 'ROOM', []);
      this._refreshMultiplayerPlayers();
    }
  }

  _handleMultiplayerRanks(ranks = []) {
    const local = ranks.find(item => item.playerId === this.networkSync?.playerId);
    if (local) {
      this._currentRank = local.rank;
      this.ui?.setRank(local.rank, Math.max(1, ranks.length));
    }
  }

  _handleMultiplayerFinish(results = []) {
    const local = results.find(item => item.playerId === this.networkSync?.playerId);
    const rank = local?.rank || this._currentRank || 1;
    this.ui?.flashMessage(`FINISH P${rank}`, 2.0);
  }

  _vehicleTypeIndex(carId) {
    const ids = this.carLibrary?.getAllCarIds?.() || ['tuner', 'coupe', 'super', 'classic'];
    return Math.max(0, ids.indexOf(carId));
  }

  _carIdFromVehicleType(vehicleType = 0) {
    const ids = this.carLibrary?.getAllCarIds?.() || ['tuner', 'coupe', 'super', 'classic'];
    return ids[Math.max(0, Math.min(ids.length - 1, Number(vehicleType) || 0))] || ids[0] || 'tuner';
  }

  _updateMultiplayerSync(delta, inputData) {
    if (!this._multiplayerActive || !this.networkSync?.connected || !this.vehiclePhysics?.chassisBody) return;

    const body = this.vehiclePhysics.chassisBody;
    const flags = (this.vehiclePhysics.nitroActive ? 1 : 0)
      | (inputData.handbrake ? 2 : 0)
      | (inputData.brake > 0 ? 4 : 0);

    this.networkSync.update(
      delta,
      this.elapsed,
      this.vehiclePhysics.getPosition(),
      this.vehiclePhysics.getRotation(),
      { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z },
      flags,
    );

    this._updateRemoteCars(delta);
  }

  _updateRemoteCars(delta) {
    const remoteStates = [];
    for (const [playerId, player] of this.networkSync.remotePlayers) {
      const state = this.networkSync.getRemoteState(playerId, this.elapsed);
      if (!state) continue;
      const model = this._ensureRemoteCar(playerId, player.vehicleType);
      if (!model?.root) continue;

      model.root.position.set(state.position.x, state.position.y - this._vehicleRideHeight, state.position.z);
      model.root.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
      const speed = Math.sqrt(
        state.velocity.x * state.velocity.x
        + state.velocity.y * state.velocity.y
        + state.velocity.z * state.velocity.z
      ) * 3.6;
      model.animateWheels(delta, speed, 0, Boolean(state.flags & 4));
      model.animateBodyPitch(delta, Boolean(state.flags & 1), Boolean(state.flags & 4));
      remoteStates.push({ position: model.root.position });
    }

    if (this._multiplayerActive) {
      this.ui?.drawMinimap(this.vehiclePhysics?.getPosition?.(), remoteStates, []);
    }
  }

  _ensureRemoteCar(playerId, vehicleType = 0) {
    const existing = this._remoteCarModels.get(playerId);
    if (existing) return existing;

    const carId = this._carIdFromVehicleType(vehicleType);
    const car = this.carLibrary?.getCar(carId) || {};
    const colors = [0xff4d6d, 0x66e8ff, 0x2ecc71, 0xffd166, 0x9b59b6, 0x1abc9c];
    const model = new CarModel();
    model.buildProcedural({ body: colors[this._remoteCarModels.size % colors.length] }, car.bodyStyle || 'sports');
    model.root.name = `remote-player-${playerId}`;
    model.root.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.renderer.scene.add(model.root);
    this._remoteCarModels.set(playerId, model);
    return model;
  }

  _removeRemoteCar(playerId) {
    const model = this._remoteCarModels.get(playerId);
    if (!model) return;
    if (model.root?.parent) model.root.parent.remove(model.root);
    model.dispose?.();
    this._remoteCarModels.delete(playerId);
  }

  _clearRemoteCars() {
    for (const playerId of [...this._remoteCarModels.keys()]) {
      this._removeRemoteCar(playerId);
    }
  }

  _setupSettingsPanel() {
    if (!this.settingsUI) return;

    this.settingsUI.onQualityChange = (preset) => {
      this._applyGraphicsSettings(true);
    };
    this.settingsUI.onGraphicsChange = () => this._applyGraphicsSettings(true);

    const applyDriving = () => {
      const settings = this.saveManager.saveData?.settings || {};
      this.vehiclePhysics?.setTuning(settings);
      this.ui?.flashMessage('HANDLING UPDATED', 0.55);
    };

    this.settingsUI.onControlChange = applyDriving;
    this.settingsUI.onDrivingChange = applyDriving;
    this.settingsUI.onWeatherChange = (weather) => this._applyWeather(weather, true);
    this.settingsUI.onCameraChange = () => this._applyCameraSettings(true);
  }

  _applySavedSettings() {
    const settings = this.saveManager.saveData?.settings || {};
    this._applyGraphicsSettings(false);
    this.vehiclePhysics?.setTuning(settings);
    this._applyCameraSettings(false);
    this._applyWeather(settings.weather || 'clear_noon', false);
  }

  _applyGraphicsSettings(announce = false) {
    const settings = this.saveManager.saveData?.settings || {};
    const quality = this._resolveGraphicsQuality(settings);
    this.renderer.setQuality(quality);
    if (this._mobileThermalMode) {
      this.renderer.setPixelRatioPolicy?.({ cap: 1.35, presetFloor: 1.25, minScale: 0.82 });
    } else {
      this.renderer.setPixelRatioPolicy?.({ cap: Infinity, presetFloor: 0, minScale: null });
    }
    this.renderer.setAdaptivePixelRatioEnabled(settings.adaptiveResolution !== false);
    const shadowQuality = this._resolveMobileSetting(settings.shadowQuality, 'low');
    const textureQuality = this._resolveMobileSetting(settings.textureQuality, 'medium');
    const lodDistance = this._resolveMobileLodDistance(settings.lodDistance);
    this.renderer.setShadowQualityOverride(shadowQuality);
    this.renderer.setTextureQuality(textureQuality);
    this.renderer.setLodDistanceScale(lodDistance);

    const shadowKey = shadowQuality === 'auto' ? quality : shadowQuality;
    const shadowLevel = shadowKey === 'ultra' ? 4 : shadowKey === 'high' ? 3 : shadowKey === 'medium' ? 2 : shadowKey === 'low' ? 1 : 0;
    this.light?.setShadowQuality(shadowLevel);
    this.traffic?.setLodDistanceScale?.(lodDistance);
    this.police?.setLodDistanceScale?.(lodDistance);

    if (announce) {
      this.ui?.flashMessage(`GRAPHICS ${quality.toUpperCase()}`, 0.75);
    }
  }

  _resolveGraphicsQuality(settings = {}) {
    if (settings.quality !== 'auto') return settings.quality || 'medium';
    return 'low';
  }

  _resolveMobileSetting(value, mobileAutoValue) {
    const key = value || 'auto';
    if (!this._mobileThermalMode) return key;
    return key === 'auto' ? mobileAutoValue : key;
  }

  _resolveMobileLodDistance(value) {
    const n = Number(value);
    const resolved = Number.isFinite(n) ? n : 1;
    return this._mobileThermalMode ? Math.min(resolved, 0.82) : resolved;
  }

  _applyCameraSettings(announce = false) {
    const settings = this.saveManager.saveData?.settings || {};
    this.camera?.setMode(settings.cameraMode || 'chase');
    this.camera?.setCollisionAvoidanceEnabled(settings.cameraCollisionAvoidance !== false);
    if (announce) {
      this.ui?.flashMessage('CAMERA UPDATED', 0.55);
    }
  }

  _applyWeather(weather, announce = false) {
    const key = weather || 'clear_noon';
    const cfg = WEATHER_PRESETS[key] || WEATHER_PRESETS.clear_noon;

    this.light?.setPreset(cfg.light);
    this.light?.setLumenEnabled?.(true);
    this.renderer?.setEnvironmentIntensity?.(cfg.env);
    this.skybox?.setWeather(key);
    this.weather?.setWeather(key);
    this.vehiclePhysics?.setWeatherFrictionMultiplier(this._weatherFriction);
    this.carLight?.setEnvRequiresHeadlights(key === 'clear_evening' || key === 'rain' || key === 'snow');
    this._syncWeatherMenu();

    if (announce) {
      this.ui?.flashMessage(cfg.label, 0.75);
    }
  }

  _setWeatherFromMenu(weather) {
    const key = WEATHER_PRESETS[weather] ? weather : 'clear_noon';
    this.saveManager?.updateSetting('weather', key);
    this._applyWeather(key, true);
  }

  _cycleWeather() {
    const current = this.saveManager?.saveData?.settings?.weather || this.weather?.getWeather?.() || 'clear_noon';
    const index = WEATHER_ORDER.indexOf(current);
    const next = WEATHER_ORDER[(index + 1) % WEATHER_ORDER.length] || 'clear_noon';
    this._setWeatherFromMenu(next);
  }

  _syncWeatherMenu() {
    const current = this.saveManager?.saveData?.settings?.weather || this.weather?.getWeather?.() || 'clear_noon';
    const label = document.getElementById('weather-current-label');
    if (label) label.textContent = WEATHER_PRESETS[current]?.label || 'NOON';
    for (const btn of document.querySelectorAll('[data-weather-option]')) {
      const active = btn.getAttribute('data-weather-option') === current;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  _setupGameActions() {
    const start = (mode, resetPlayer = true) => {
      this._hideMenu();
      this._startMode(mode, { resetPlayer });
    };

    window.GameActions = {
      freeDrive: () => start('freerun'),
      raceEvent: () => start('race'),
      pursuit: () => start('pursuit'),
      dailyChallenge: () => start('daily'),
      profile: () => this._showPlayerProfile(),
      garage: () => this._showGarage(),
      trackSelect: () => this._showTrackSelectDialog(),
      selectTrack: (trackId) => this._switchTrack(trackId),
      closeTrackSelect: () => this._hideTrackSelectDialog(),
      setWeather: (weather) => this._setWeatherFromMenu(weather),
      cycleWeather: () => this._cycleWeather(),
      escape: () => this._handleEscapeAction(),
      settings: () => {
        this._hideMenu();
        this._hidePlayerProfile();
        this.settingsUI?.show();
      },
      levelEditor: () => this._showLevelEditor(),
      multiplayer: () => this._showMultiplayer(),
      assetChecker: () => {
        window.location.href = './asset-checker.html';
      },
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this._handleEscapeAction();
      }
    });
  }

  _handleEscapeAction() {
    if (this.levelEditorUI?.visible) {
      this._hideLevelEditor();
      return;
    }
    if (this.profileUI?.visible) {
      this._hidePlayerProfile();
      return;
    }
    const trackDialog = document.getElementById('track-select-dialog');
    if (trackDialog?.classList.contains('show')) {
      this._hideTrackSelectDialog();
      return;
    }
    if (this.garageUI?.visible) {
      this._hideGarage();
      return;
    }
    if (this.multiplayerUI?.visible) {
      this._leaveMultiplayer();
      return;
    }
    if (this.settingsUI?.visible) {
      this.settingsUI.hide();
      return;
    }
    this._toggleMenu();
  }

  _showLevelEditor() {
    this._hideMenu();
    this._hideGarage();
    this._hidePlayerProfile();
    this._leaveMultiplayer();
    this.settingsUI?.hide?.();
    this._hideTrackSelectDialog();
    this._hideOrbitBtn();
    this.input?.clearActiveInputs?.();
    this._freezeVehicleForEditor();
    this._enterLevelEditorCamera();
    this.levelEditorUI.setTracks?.(this._availableTracks);
    this.levelEditorUI.onExit = () => this._hideLevelEditor();
    this.levelEditorUI.onSave = (result) => {
      this.ui?.flashMessage(result?.ok === false ? 'SAVE FAILED' : 'SAVED', 0.65);
      if (result?.ok !== false) this._refreshEditorRoadRuntime();
    };
    this.levelEditorUI.onTrackChange = (trackId) => this._switchEditorTrack(trackId);
    this.levelEditorUI.onCameraRotate = (dx, dy) => this._rotateEditorCamera(dx, dy);
    this.levelEditorUI.onCameraZoom = (deltaY) => this._zoomEditorCamera(deltaY);
    this.levelEditorUI.onCameraReset = () => this._resetEditorCameraTarget();
    this.levelEditorUI?.show?.(this.currentTrackId || 'city_circuit');
    this.ui?.flashMessage('EDITOR', 0.7);
  }

  _hideLevelEditor() {
    this.levelEditorUI?.hide?.();
    this._refreshEditorRoadRuntime();
    this._freezeVehicleForEditor();
    this._exitLevelEditorCamera();
    this.input?.clearActiveInputs?.();
    this.clock?.getDelta?.();
    if (!this._menuVisible) this._showOrbitBtn();
    this.ui?.flashMessage('EDITOR SAVED', 0.7);
  }

  _refreshEditorRoadRuntime() {
    this.trackManager?.invalidateRoadCaches?.();
    this._registerTrackPhysicsBodies();
    this._routePoints = this.trackManager?.getRoadCenterPoints?.() || this._routePoints;
    this._refreshTrackConsumers();
  }

  _showTrackSelectDialog() {
    const dialog = document.getElementById('track-select-dialog');
    const list = document.getElementById('track-select-list');
    if (!dialog || !list) return;

    list.textContent = '';
    const unlocked = new Set(this.saveManager?.saveData?.unlockedTracks || []);
    for (const track of this._availableTracks || []) {
      const id = track.id;
      const isUnlocked = track.unlocked !== false || unlocked.has(id);
      const isActive = id === this.currentTrackId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `track-option${isActive ? ' active' : ''}`;
      btn.disabled = !isUnlocked || this._trackSwitching;
      btn.style.opacity = isUnlocked ? '1' : '0.45';
      const difficulty = '*'.repeat(Math.max(1, Math.min(3, Number(track.difficulty) || 1)));
      btn.innerHTML = `
        <span>
          <span class="track-name">${this._escapeHTML(track.name || id)}</span>
          <span class="track-meta">${this._escapeHTML(id)} | ${track.laps || 1} laps | ${this._escapeHTML(track.surface || 'mixed')} | ${difficulty}</span>
        </span>
        <span class="track-badge">${isActive ? 'ACTIVE' : isUnlocked ? 'LOAD' : 'LOCKED'}</span>
      `;
      btn.addEventListener('click', () => {
        if (isUnlocked) window.GameActions.selectTrack(id);
      });
      list.appendChild(btn);
    }

    dialog.classList.add('show');
    this._hideOrbitBtn();
  }

  _hideTrackSelectDialog() {
    const dialog = document.getElementById('track-select-dialog');
    if (dialog) dialog.classList.remove('show');
    if (!this._menuVisible) this._showOrbitBtn();
  }

  _escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  _cycleQuality() {
    const order = ['low', 'medium', 'high', 'ultra'];
    const current = this.renderer.getQuality();
    const next = order[(order.indexOf(current) + 1) % order.length] || 'high';
    this.renderer.setQuality(next);
    this.ui.flashMessage(next.toUpperCase(), 1.0);
  }

  _toggleMenu() {
    if (this._menuVisible) this._hideMenu();
    else this._showMenu();
  }

  _showMenu() {
    const menu = document.getElementById('main-menu');
    if (!menu) return;
    menu.classList.add('show');
    this._menuVisible = true;
    this._syncWeatherMenu();
    this._hideOrbitBtn();
  }

  _hideMenu() {
    const menu = document.getElementById('main-menu');
    if (!menu) return;
    menu.classList.remove('show');
    this._menuVisible = false;
    this._showOrbitBtn();
  }

  _setupEscapeButton() {
    this._mobileEscBtn = document.getElementById('mobile-esc-btn');
    if (!this._mobileEscBtn) return;
    this._mobileEscBtn.classList.add('show');
    this._mobileEscBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this._handleEscapeAction();
    });
  }

  _setupMobileRotateButton() {
    this._mobileRotateBtn = document.getElementById('mobile-rotate-btn');
    if (!this._mobileRotateBtn) return;
    if (!this._isTouchDevice) {
      this._mobileRotateBtn.classList.remove('show');
      return;
    }

    this._mobileRotateBtn.classList.add('show');
    this._mobileRotateBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this._toggleMobileLayoutPreference();
    });
    this._updateMobileRotateButton();
  }

  async _toggleMobileLayoutPreference() {
    if (!this._isTouchDevice) return;
    const current = this._mobileLayout === 'landscape' ? 'landscape' : 'portrait';
    const next = current === 'landscape' ? 'portrait' : 'landscape';
    this._mobileLayoutPreference = next;
    this.saveManager?.updateSetting?.('mobileLayoutPreference', next);
    this.resize();
    const locked = await this._tryLockScreenOrientation(next);
    this.resize();
    const label = next === 'landscape' ? '横屏' : '竖屏';
    this.ui?.flashMessage(locked ? `${label}已锁定` : `${label}布局`, 0.75);
  }

  async _tryLockScreenOrientation(layout) {
    if (!this._isTouchDevice) return false;
    if (Capacitor?.isNativePlatform?.()) {
      try {
        await ScreenOrientation.lock({ orientation: layout === 'landscape' ? 'landscape' : 'portrait' });
        setTimeout(() => this.resize(), 180);
        return true;
      } catch (err) {
        console.warn('[App] Native orientation lock failed:', err?.message || err);
      }
    }
    if (!window.screen?.orientation?.lock) return false;
    const generic = layout === 'landscape' ? 'landscape' : 'portrait';
    const primary = layout === 'landscape' ? 'landscape-primary' : 'portrait-primary';
    for (const target of [generic, primary]) {
      try {
        await window.screen.orientation.lock(target);
        setTimeout(() => this.resize(), 180);
        return true;
      } catch {}
    }
    return false;
  }

  _resolveMobileLayoutPreference(value) {
    return ['auto', 'portrait', 'landscape'].includes(value) ? value : 'auto';
  }

  _resolveMobileLayout(width, height) {
    if (!this._isTouchDevice) return 'desktop';
    const preference = this._resolveMobileLayoutPreference(this._mobileLayoutPreference);
    if (preference === 'portrait' || preference === 'landscape') return preference;
    return width > height ? 'landscape' : 'portrait';
  }

  _updateMobileRotateButton() {
    if (!this._mobileRotateBtn) return;
    const current = this._mobileLayout === 'landscape' ? 'landscape' : 'portrait';
    const target = current === 'landscape' ? '竖屏' : '横屏';
    this._mobileRotateBtn.setAttribute('aria-label', `切换到${target}`);
    this._mobileRotateBtn.title = `切换到${target}`;
    const label = this._mobileRotateBtn.querySelector('.rotate-mode');
    if (label) label.textContent = current === 'landscape' ? '横屏' : '竖屏';
  }

  // ---- Orbit camera button ----

  _setupOrbitButton() {
    this._orbitBtn = document.getElementById('orbit-btn');
    if (!this._orbitBtn) return;

    let dragging = false;
    let lastX = 0, lastY = 0;

    const onDown = (e) => {
      dragging = true;
      lastX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      lastY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      this._orbitBtn.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!dragging) return;
      const cx = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const cy = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const dx = cx - lastX;
      const dy = cy - lastY;
      lastX = cx;
      lastY = cy;
      if (this.camera) {
        this.camera.addOrbitDelta(dx, dy);
      }
      e.preventDefault();
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (this.camera) this.camera.releaseOrbit();
    };

    this._orbitBtn.addEventListener('pointerdown', onDown);
    this._orbitBtn.addEventListener('pointermove', onMove);
    this._orbitBtn.addEventListener('pointerup', onUp);
    this._orbitBtn.addEventListener('pointerleave', onUp);
    this._orbitBtn.addEventListener('pointercancel', onUp);
  }

  _showOrbitBtn() {
    if (this._orbitBtn) this._orbitBtn.classList.add('show');
  }

  _hideOrbitBtn() {
    if (this._orbitBtn) this._orbitBtn.classList.remove('show');
  }

  _hideLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    if (!loadingScreen) return;
    loadingScreen.classList.add('hidden');
    setTimeout(() => { loadingScreen.style.display = 'none'; }, 600);
  }

  _setLoadingProgress(percent) {
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    const pctEl = document.getElementById('loading-percent');
    const barEl = document.getElementById('loading-bar-fill');
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;
  }

  _setupResize() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const layout = this._resolveMobileLayout(w, h);
    this._mobileLayout = layout;
    document.body.dataset.mobileLayout = layout;
    document.body.classList.toggle('mobile-portrait', layout === 'portrait');
    document.body.classList.toggle('mobile-landscape', layout === 'landscape');
    this._updateMobileRotateButton();

    this.renderer.resize(w, h);
    this.camera.camera.aspect = aspect;
    this.camera.camera.updateProjectionMatrix();

    const rotateHint = document.getElementById('rotate-hint');
    if (rotateHint) rotateHint.style.display = 'none';
    this.input?.resize?.(w, h, layout);
    this.ui?.resize(w, h, layout);
  }

  _setupVisibility() {
    const enter = () => this._enterBackgroundMode();
    const leave = () => this._leaveBackgroundMode();
    const handleVisibility = () => {
      if (document.hidden) enter();
      else leave();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', enter);
    window.addEventListener('pageshow', leave);
    window.addEventListener('blur', enter);
    window.addEventListener('focus', leave);
    document.addEventListener('pause', enter);
    document.addEventListener('resume', leave);
  }

  _enterBackgroundMode() {
    if (this._isBackgrounded) return;
    this._isBackgrounded = true;
    this._backgroundWasAudioUnlocked = this._audioUnlocked;
    this._backgroundAudioSuspended = Boolean(this.audio?.isSuspended);
    this.input?.clearActiveInputs?.();
    this.audio?.suspend?.();
    this._backgroundAudioSuspended = true;
    this.clock?.getDelta?.();
  }

  async _leaveBackgroundMode() {
    if (!this._isBackgrounded) return;
    this._isBackgrounded = false;
    this.input?.clearActiveInputs?.();
    this.clock?.getDelta?.();

    if (this._backgroundWasAudioUnlocked && this._audioUnlocked && this.audio) {
      try {
        await this.audio.resume();
      } catch (err) {
        console.warn('[App] Failed to resume audio after background:', err);
      }
    }
    this._backgroundAudioSuspended = false;
  }

  async _ensureAudioReady() {
    if (!this.audio) this.audio = new AudioManager();
    if (!this.audio.initialized) {
      await this.audio.init();
    }
    await this.audio.unlock?.();
    if (!this.carAudio && this.audio.initialized) {
      this.carAudio = new CarAudio(this.audio);
      this.carAudio.init();
    }
    return Boolean(this.audio.initialized && this.carAudio?.isReady);
  }

  _setupAudioUnlock() {
    const overlay = document.getElementById('audio-unlock');
    const btn = document.getElementById('audio-unlock-btn');
    if (!overlay || !btn) return;
    let done = false;
    const unlock = async () => {
      if (done) return;
      done = true;
      this._audioUnlocked = await this._ensureAudioReady();
      if (this._audioUnlocked) this.audio?.playEngineStart();
      overlay.style.display = 'none';
    };
    btn.addEventListener('click', unlock, { once: true });
    this.canvas?.addEventListener('pointerdown', unlock, { once: true });
  }

  _setupGlobalErrorHandlers() {
    window.addEventListener('error', (e) => {
      console.error('[App] Global error:', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[App] Unhandled rejection:', e.reason);
    });
  }

  _showFatalError(msg) {
    const loading = document.getElementById('loading-screen');
    const overlay = document.getElementById('fatal-error');
    const msgEl = document.getElementById('fatal-error-msg');
    if (loading) {
      loading.classList.add('hidden');
      loading.style.display = 'none';
    }
    if (overlay) overlay.style.display = 'flex';
    if (msgEl) msgEl.textContent = msg;
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const app = new App();
app.init().catch((err) => {
  console.error('[App] Bootstrap failed:', err);
  const loading = document.getElementById('loading-screen');
  const msgEl = document.getElementById('fatal-error-msg');
  const overlay = document.getElementById('fatal-error');
  if (loading) {
    loading.classList.add('hidden');
    loading.style.display = 'none';
  }
  if (msgEl) msgEl.textContent = err.message || String(err);
  if (overlay) overlay.style.display = 'flex';
});


