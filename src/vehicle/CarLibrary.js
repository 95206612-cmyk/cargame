/**
 * Car data library.
 * Manages car definitions, unlock logic, and final stat computation
 * from base config + tuning upgrades + paint presets.
 */
export class CarLibrary {
  constructor(assetLoader, saveManager) {
    this._loader = assetLoader;
    this._save = saveManager;
    this.cars = {};          // carId → car definition
    this._carConfig = null;  // Raw cars.json data
    this._tuneConfig = null; // Raw tuneConfig.json data
  }

  /**
   * Load car and tuning configurations.
   */
  async loadConfigs() {
    // Load cars config
    let carsCfg = this._loader.get('cars');
    if (!carsCfg) {
      try {
        carsCfg = await this._loader._loadJSON('./config/cars.json');
        this._loader.loaded.set('cars', carsCfg);
      } catch {
        console.warn('[CarLibrary] Could not load cars.json');
        carsCfg = this._defaultCars();
      }
    }

    // Load tuning config
    let tuneCfg = this._loader.get('tuneConfig');
    if (!tuneCfg) {
      try {
        tuneCfg = await this._loader._loadJSON('./config/tuneConfig.json');
        this._loader.loaded.set('tuneConfig', tuneCfg);
      } catch {
        console.warn('[CarLibrary] Could not load tuneConfig.json');
        tuneCfg = { categories: {}, playerLevels: [] };
      }
    }

    this._carConfig = carsCfg;
    this._tuneConfig = tuneCfg;
    this.cars = carsCfg;
  }

  /**
   * Get a car definition by ID.
   */
  getCar(carId) {
    return this.cars[carId] || null;
  }

  /**
   * Get all car IDs.
   */
  getAllCarIds() {
    return Object.keys(this.cars);
  }

  /**
   * Get list of all cars with unlock info.
   */
  getCarList() {
    const playerLevel = this._save.saveData?.playerLevel || 1;
    const owned = this._save.saveData?.ownedVehicles || ['tuner'];

    return Object.values(this.cars).map(car => ({
      ...car,
      owned: owned.includes(car.id),
      unlocked: playerLevel >= car.unlockLevel,
    }));
  }

  /**
   * Check if a car is unlocked for the player.
   */
  isCarUnlocked(carId) {
    const car = this.cars[carId];
    if (!car) return false;
    const playerLevel = this._save.saveData?.playerLevel || 1;
    return playerLevel >= car.unlockLevel;
  }

  /**
   * Check if a car is owned.
   */
  isCarOwned(carId) {
    const owned = this._save.saveData?.ownedVehicles || ['tuner'];
    return owned.includes(carId);
  }

  /**
   * Purchase a car (deduct credits, add to owned list).
   * @returns {{ success: boolean, reason?: string }}
   */
  purchaseCar(carId) {
    const car = this.cars[carId];
    if (!car) return { success: false, reason: 'car not found' };
    if (!this.isCarUnlocked(carId)) return { success: false, reason: 'locked' };
    if (this.isCarOwned(carId)) return { success: false, reason: 'already owned' };

    const credits = this._save.saveData?.credits || 0;
    if (credits < car.price) return { success: false, reason: 'insufficient credits' };

    this._save.saveData.credits -= car.price;
    this._save.saveData.ownedVehicles.push(carId);
    this._save.save();
    return { success: true };
  }

  /**
   * Compute final vehicle physics parameters by applying tuning upgrades
   * to the car's base stats.
   * @param {string} carId
   * @param {Object} [tuningLevels] — { engine: 0, turbo: 0, suspension: 0, tires: 0, brakes: 0, nitroKit: 0 }
   * @returns {Object} Final physics params
   */
  computeFinalStats(carId, tuningLevels = {}) {
    const car = this.cars[carId];
    if (!car) return null;

    const base = car.baseStats;
    const tune = this._tuneConfig?.categories || {};

    let engineMult = 1, maxSpeedMult = 1;
    let nitroBoostMult = 1, nitroMaxSpeedMult = 1;
    let steeringMult = 1, suspStiffMult = 1, rollInfMult = 1;
    let frictionMult = 1, tireBrakeMult = 1;
    let brakeForceMult = 1, brakeStabMult = 1;
    let nitroCapMult = 1, nitroRefillMult = 1;

    // Engine
    const engineLvl = tune.engine?.levels?.[tuningLevels.engine || 0];
    if (engineLvl) { engineMult = engineLvl.engineForceMult; maxSpeedMult = engineLvl.maxSpeedMult; }

    // Turbo
    const turboLvl = tune.turbo?.levels?.[tuningLevels.turbo || 0];
    if (turboLvl) { nitroBoostMult = turboLvl.nitroBoostMult; nitroMaxSpeedMult = turboLvl.nitroMaxSpeedMult; }

    // Suspension
    const suspLvl = tune.suspension?.levels?.[tuningLevels.suspension || 0];
    if (suspLvl) { steeringMult = suspLvl.steeringMult; suspStiffMult = suspLvl.suspStiffMult; rollInfMult = suspLvl.rollInfluenceMult; }

    // Tires
    const tireLvl = tune.tires?.levels?.[tuningLevels.tires || 0];
    if (tireLvl) { frictionMult = tireLvl.frictionMult; tireBrakeMult = tireLvl.brakeForceMult; }

    // Brakes
    const brakeLvl = tune.brakes?.levels?.[tuningLevels.brakes || 0];
    if (brakeLvl) { brakeForceMult = brakeLvl.brakeForceMult; brakeStabMult = brakeLvl.brakeStabilityMult; }

    // Nitro kit
    const nitroLvl = tune.nitroKit?.levels?.[tuningLevels.nitroKit || 0];
    if (nitroLvl) { nitroCapMult = nitroLvl.nitroCapMult; nitroRefillMult = nitroLvl.nitroRefillMult; }

    return {
      mass: base.mass,
      engineForce: base.engineForce * engineMult,
      brakeForce: base.brakeForce * brakeForceMult * tireBrakeMult,
      maxSteeringAngle: base.maxSteeringAngle * steeringMult,
      maxSpeed: base.maxSpeed * maxSpeedMult,
      wheelFriction: base.wheelFriction * frictionMult,
      frictionSlip: base.frictionSlip * frictionMult,
      suspensionStiffness: base.suspensionStiffness * suspStiffMult,
      suspensionDamping: base.suspensionDamping,
      nitroCapacity: base.nitroCapacity * nitroCapMult,
      nitroRefillRate: (5.0) * nitroRefillMult,
      nitroBoostMult,
      nitroMaxSpeedMult,
      driftCoefficient: base.driftCoefficient,
      rollInfluence: 0.15 * rollInfMult,
    };
  }

  /**
   * Get tuning category info.
   */
  getTuneCategory(categoryId) {
    return this._tuneConfig?.categories?.[categoryId] || null;
  }

  /**
   * Get all tuning categories.
   */
  getTuneCategories() {
    return this._tuneConfig?.categories || {};
  }

  /**
   * Get tuning level info for a category.
   */
  getTuneLevel(categoryId, level) {
    return this._tuneConfig?.categories?.[categoryId]?.levels?.[level] || null;
  }

  /**
   * Get player level info.
   */
  getPlayerLevelInfo() {
    const level = this._save.saveData?.playerLevel || 1;
    const levels = this._tuneConfig?.playerLevels || [];
    return levels.find(l => l.level === level) || { level: 1, xpRequired: 0 };
  }

  /**
   * Add XP and check for level up.
   * @returns {{ leveledUp: boolean, newLevel?: number }}
   */
  addXP(amount) {
    if (!this._save.saveData) return { leveledUp: false };
    this._save.saveData.xp = (this._save.saveData.xp || 0) + amount;

    const levels = this._tuneConfig?.playerLevels || [];
    let newLevel = this._save.saveData.playerLevel || 1;

    for (const lvl of levels) {
      if (this._save.saveData.xp >= lvl.xpRequired) {
        newLevel = lvl.level;
      }
    }

    if (newLevel > (this._save.saveData.playerLevel || 1)) {
      this._save.saveData.playerLevel = newLevel;
      this._save.save();
      return { leveledUp: true, newLevel };
    }

    this._save.save();
    return { leveledUp: false };
  }

  /**
   * Get credits.
   */
  getCredits() {
    return this._save.saveData?.credits || 0;
  }

  /**
   * Add credits.
   */
  addCredits(amount) {
    if (!this._save.saveData) return;
    this._save.saveData.credits = (this._save.saveData.credits || 0) + amount;
    this._save.save();
  }

  _defaultCars() {
    return {
      tuner: {
        id: 'tuner', name: '街改车', category: 'tuner', unlockLevel: 0, price: 0,
        baseStats: {
          mass: 950, engineForce: 2800, brakeForce: 55, maxSteeringAngle: 1.05,
          maxSpeed: 210, wheelFriction: 1100, frictionSlip: 6.0,
          suspensionStiffness: 32, suspensionDamping: 2.5, nitroCapacity: 100, driftCoefficient: 1.4,
        },
        bodyStyle: 'compact', defaultColor: '#3498db',
      },
    };
  }
}
