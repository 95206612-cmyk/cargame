export class SaveManager {
  constructor() {
    this.storageKey = 'cargame_save';
    this.version = 3;
    this.configs = {};
    this.saveData = null;
  }

  // ---- LocalStorage save/load ----

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        this.saveData = this._defaultSave();
        this.save();
        return this.saveData;
      }

      let data = JSON.parse(raw);

      // Version check + migration
      if (data.version !== this.version) {
        data = this._migrate(data);
      }

      // Integrity check
      if (!this._validate(data)) {
        console.warn('[SaveManager] Save data corrupted, resetting to defaults');
        this.saveData = this._defaultSave();
        this.save();
        return this.saveData;
      }

      data.settings = { ...this._defaultSave().settings, ...data.settings };
      data.settings.adaptiveResolution = data.settings.adaptiveResolution !== false;
      this.saveData = data;
      return data;
    } catch (e) {
      console.warn('[SaveManager] Save data parse error, resetting:', e.message);
      this.saveData = this._defaultSave();
      this.save();
      return this.saveData;
    }
  }

  save() {
    try {
      if (!this.saveData) this.saveData = this._defaultSave();
      this.saveData.version = this.version;
      this.saveData.lastSaved = Date.now();
      localStorage.setItem(this.storageKey, JSON.stringify(this.saveData));
    } catch (e) {
      console.warn('[SaveManager] Failed to save:', e.message);
    }
  }

  _defaultSave() {
    return {
      version: this.version,
      credits: 0,
      ownedVehicles: ['tuner'],
      unlockedTracks: ['city_circuit', 'city_circuit_01', 'mountain_pass', 'coastal_highway'],
      bestTimes: {},
      playerName: null,
      playerProfile: {
        loggedIn: false,
        name: '',
        club: '',
        avatar: 'street_rookie',
        title: '街头新秀',
        racerId: '',
        createdAt: 0,
        lastLoginAt: 0,
      },
      vehicleCustomization: {
        color: '#e74c3c',
        skin: 'clean',
        pendant: 'none',
        underglow: 'none',
        plate: 'STREET',
      },
      totalRaces: 0,
      totalWins: 0,
      playerLevel: 1,
      xp: 0,
      carTuning: {},
      carPaints: {},
      currentCarId: 'tuner',
      currentTrackId: 'city_circuit',
      premiumPoints: 0,
      unlockedEvents: [],
      dailyChallengeBest: {},
      settings: {
        quality: 'auto',
        musicVolume: 0.7,
        sfxVolume: 1.0,
        envVolume: 0.8,
        uiVolume: 1.0,
        masterMuted: false,
        controlScheme: 'auto',
        steerSensitivity: 0.5,
        cameraMode: 'chase',
        dynamicCamera: true,
        cameraCollisionAvoidance: true,
        cameraShake: 1.0,
        fpsLimit: 0,
        particlesEnabled: true,
        shadowQuality: 'auto',
        textureQuality: 'auto',
        lodDistance: 1.0,
        adaptiveResolution: true,
        weather: 'clear_noon',
        accelMultiplier: 1.0,
        brakeMultiplier: 1.0,
        gripMultiplier: 1.0,
        topSpeedMultiplier: 1.0,
        nitroMultiplier: 1.0,
        handbrakeTurnMultiplier: 1.0,
        airGlideMultiplier: 1.0,
        mobileLayoutPreference: 'auto',
      },
      lastSaved: Date.now(),
    };
  }

  _validate(data) {
    if (!data || typeof data !== 'object') return false;
    // Required fields check
    const required = ['version', 'credits', 'ownedVehicles', 'settings'];
    for (const key of required) {
      if (!(key in data)) return false;
    }
    if (!Array.isArray(data.ownedVehicles)) return false;
    if (typeof data.settings !== 'object') return false;
    return true;
  }

  _migrate(data) {
    const oldVersion = data.version || 0;

    if (oldVersion < 1) {
      data.totalRaces = data.totalRaces || 0;
      data.totalWins = data.totalWins || 0;
      data.bestTimes = data.bestTimes || {};
    }
    if (oldVersion < 2) {
      data.premiumPoints = data.premiumPoints || 0;
      data.unlockedEvents = data.unlockedEvents || [];
      data.dailyChallengeBest = data.dailyChallengeBest || {};
      data.playerLevel = data.playerLevel || 1;
      data.xp = data.xp || 0;
      data.carTuning = data.carTuning || {};
      data.carPaints = data.carPaints || {};
      data.currentCarId = data.currentCarId || 'tuner';
      data.currentTrackId = data.currentTrackId || 'city_circuit';
      if (!data.settings) data.settings = {};
      data.settings.quality = data.settings.quality || 'auto';
      data.settings.musicVolume = data.settings.musicVolume ?? 0.7;
      data.settings.sfxVolume = data.settings.sfxVolume ?? 1.0;
      data.settings.envVolume = data.settings.envVolume ?? 0.8;
      data.settings.uiVolume = data.settings.uiVolume ?? 1.0;
      data.settings.masterMuted = data.settings.masterMuted || false;
      data.settings.controlScheme = data.settings.controlScheme || 'auto';
      data.settings.steerSensitivity = data.settings.steerSensitivity ?? 0.5;
      data.settings.cameraMode = data.settings.cameraMode || 'chase';
      data.settings.dynamicCamera = data.settings.dynamicCamera !== false;
      data.settings.cameraCollisionAvoidance = data.settings.cameraCollisionAvoidance !== false;
      data.settings.cameraShake = data.settings.cameraShake ?? 1.0;
      data.settings.fpsLimit = data.settings.fpsLimit || 0;
      data.settings.particlesEnabled = data.settings.particlesEnabled !== false;
    }
    data.settings.steerSensitivity = Math.max(0.1, Math.min(2.0, Number(data.settings.steerSensitivity) || 0.5));
    if (oldVersion < 3) {
      data.playerProfile = data.playerProfile || {};
      data.vehicleCustomization = data.vehicleCustomization || {};
    }
    data.playerProfile = {
      ...this._defaultSave().playerProfile,
      ...(data.playerProfile || {}),
    };
    if (data.playerName && !data.playerProfile.name) {
      data.playerProfile.name = data.playerName;
      data.playerProfile.loggedIn = true;
    }
    if (!data.playerProfile.racerId) data.playerProfile.racerId = this._makeRacerId(data.playerProfile.name);
    data.vehicleCustomization = {
      ...this._defaultSave().vehicleCustomization,
      ...(data.vehicleCustomization || {}),
    };
    data.settings.weather = data.settings.weather || 'clear_noon';
    data.settings.shadowQuality = data.settings.shadowQuality || 'auto';
    data.settings.textureQuality = data.settings.textureQuality || 'auto';
    data.settings.lodDistance = data.settings.lodDistance ?? 1.0;
    data.settings.adaptiveResolution = data.settings.adaptiveResolution !== false;
    data.settings.accelMultiplier = data.settings.accelMultiplier ?? 1.0;
    data.settings.brakeMultiplier = data.settings.brakeMultiplier ?? 1.0;
    data.settings.gripMultiplier = data.settings.gripMultiplier ?? 1.0;
    data.settings.topSpeedMultiplier = data.settings.topSpeedMultiplier ?? 1.0;
    data.settings.nitroMultiplier = data.settings.nitroMultiplier ?? 1.0;
    data.settings.handbrakeTurnMultiplier = data.settings.handbrakeTurnMultiplier ?? 1.0;
    data.settings.airGlideMultiplier = data.settings.airGlideMultiplier ?? 1.0;
    data.settings.mobileLayoutPreference = ['auto', 'portrait', 'landscape'].includes(data.settings.mobileLayoutPreference)
      ? data.settings.mobileLayoutPreference
      : 'auto';
    data.currentTrackId = data.currentTrackId || 'city_circuit';
    data.unlockedTracks = Array.isArray(data.unlockedTracks) ? data.unlockedTracks : ['city_circuit'];
    if (!data.unlockedTracks.includes('city_circuit_01')) {
      data.unlockedTracks.push('city_circuit_01');
    }
    data.settings = { ...this._defaultSave().settings, ...data.settings };

    data.version = this.version;
    return data;
  }

  updateSetting(key, value) {
    if (!this.saveData) this.saveData = this._defaultSave();
    if (!this.saveData.settings) this.saveData.settings = {};
    this.saveData.settings[key] = value;
    this.save();
  }

  updatePlayerProfile(profile = {}) {
    if (!this.saveData) this.saveData = this._defaultSave();
    this.saveData.playerProfile = {
      ...this._defaultSave().playerProfile,
      ...(this.saveData.playerProfile || {}),
      ...profile,
      loggedIn: profile.loggedIn ?? true,
      lastLoginAt: Date.now(),
    };
    if (!this.saveData.playerProfile.createdAt) this.saveData.playerProfile.createdAt = Date.now();
    if (!this.saveData.playerProfile.racerId) {
      this.saveData.playerProfile.racerId = this._makeRacerId(this.saveData.playerProfile.name);
    }
    this.saveData.playerName = this.saveData.playerProfile.name;
    this.save();
    return this.saveData.playerProfile;
  }

  updateVehicleCustomization(customization = {}) {
    if (!this.saveData) this.saveData = this._defaultSave();
    this.saveData.vehicleCustomization = {
      ...this._defaultSave().vehicleCustomization,
      ...(this.saveData.vehicleCustomization || {}),
      ...customization,
    };
    this.save();
    return this.saveData.vehicleCustomization;
  }

  _makeRacerId(name = 'RACER') {
    const prefix = String(name || 'RACER').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'RACE';
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${suffix}`;
  }

  // ---- Export / Import ----

  exportJSON() {
    const data = this.saveData || this._defaultSave();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `cargame_save_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!this._validate(data)) {
            reject(new Error('Invalid save file format'));
            return;
          }
          this.saveData = this._migrate(data);
          this.save();
          resolve(this.saveData);
        } catch (e) {
          reject(new Error('Failed to parse save file: ' + e.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // ---- Config loading (retained from DataManager) ----

  async loadConfig(name) {
    const url = `./config/${name}.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      this.configs[name] = json;
      return json;
    } catch (e) {
      console.warn(`[SaveManager] Failed to load config "${name}":`, e.message);
      return null;
    }
  }

  async loadAllConfigs() {
    const results = await Promise.allSettled([
      this.loadConfig('vehicle-params'),
      this.loadConfig('physics'),
      this.loadConfig('tracks'),
      this.loadConfig('quality-settings'),
    ]);
    return results;
  }

  getConfig(name) {
    return this.configs[name] || null;
  }

  // ---- Best lap times ----

  getBestLap(trackId) {
    if (!this.saveData?.bestTimes) return null;
    return this.saveData.bestTimes[trackId] || null;
  }

  setBestLap(trackId, timeSeconds) {
    if (!this.saveData) this.saveData = this._defaultSave();
    if (!this.saveData.bestTimes) this.saveData.bestTimes = {};

    const current = this.saveData.bestTimes[trackId];
    if (!current || timeSeconds < current.time) {
      this.saveData.bestTimes[trackId] = {
        time: timeSeconds,
        date: Date.now(),
      };
      this.save();
      return true; // New record
    }
    return false; // Not a record
  }

  getBestLaps() {
    return this.saveData?.bestTimes || {};
  }

  // ---- Daily Challenge Leaderboard ----

  getDailyChallengeBest(trackId) {
    if (!this.saveData?.dailyChallengeBest) return [];
    return this.saveData.dailyChallengeBest[trackId] || [];
  }

  addDailyChallengeTime(trackId, timeSeconds, carId, playerName) {
    if (!this.saveData) this.saveData = this._defaultSave();
    if (!this.saveData.dailyChallengeBest) this.saveData.dailyChallengeBest = {};

    const entries = this.saveData.dailyChallengeBest[trackId] || [];
    entries.push({
      time: timeSeconds,
      car: carId,
      name: playerName || 'Racer',
      date: Date.now(),
    });
    // Sort by time ascending, keep top 20
    entries.sort((a, b) => a.time - b.time);
    const trimmed = entries.slice(0, 20);
    this.saveData.dailyChallengeBest[trackId] = trimmed;
    this.save();
    return trimmed;
  }

  // ---- Career Unlock ----

  isEventUnlocked(eventId) {
    return (this.saveData?.unlockedEvents || []).includes(eventId);
  }

  unlockEvent(eventId) {
    if (!this.saveData) return;
    if (!this.saveData.unlockedEvents) this.saveData.unlockedEvents = [];
    if (!this.saveData.unlockedEvents.includes(eventId)) {
      this.saveData.unlockedEvents.push(eventId);
      this.save();
    }
  }

  getUnlockedEvents() {
    return this.saveData?.unlockedEvents || [];
  }
}
