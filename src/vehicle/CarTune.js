/**
 * Performance tuning system.
 * Manages per-car upgrade levels, handles purchase/install,
 * applies tuning multipliers to VehiclePhysics config in real time.
 */
export class CarTune {
  constructor(carLibrary, saveManager) {
    this._lib = carLibrary;
    this._save = saveManager;
  }

  /**
   * Get current tuning levels for a car.
   * @returns {{ engine: number, turbo: number, suspension: number, tires: number, brakes: number, nitroKit: number }}
   */
  getTuningLevels(carId) {
    const tuning = this._save.saveData?.carTuning || {};
    return tuning[carId] || {
      engine: 0, turbo: 0, suspension: 0, tires: 0, brakes: 0, nitroKit: 0,
    };
  }

  /**
   * Get the upgrade level for a specific category on a car.
   */
  getLevel(carId, category) {
    return this.getTuningLevels(carId)[category] || 0;
  }

  /**
   * Purchase next upgrade level for a category on a car.
   * @returns {{ success: boolean, reason?: string, newLevel?: number }}
   */
  purchaseUpgrade(carId, category) {
    const currentLevel = this.getLevel(carId, category);
    if (currentLevel >= 5) return { success: false, reason: 'max level' };

    const nextLevel = currentLevel + 1;
    const tuneInfo = this._lib.getTuneLevel(category, nextLevel);
    if (!tuneInfo) return { success: false, reason: 'invalid category' };

    const credits = this._lib.getCredits();
    if (credits < tuneInfo.cost) return { success: false, reason: 'insufficient credits' };

    // Deduct credits
    if (!this._save.saveData) return { success: false, reason: 'no save data' };
    this._save.saveData.credits -= tuneInfo.cost;

    // Store tuning
    if (!this._save.saveData.carTuning) this._save.saveData.carTuning = {};
    if (!this._save.saveData.carTuning[carId]) {
      this._save.saveData.carTuning[carId] = { engine: 0, turbo: 0, suspension: 0, tires: 0, brakes: 0, nitroKit: 0 };
    }
    this._save.saveData.carTuning[carId][category] = nextLevel;
    this._save.save();

    return { success: true, newLevel: nextLevel, category, cost: tuneInfo.cost };
  }

  /**
   * Compute the final VehiclePhysics-compatible config for a car
   * with all tuning upgrades applied.
   * @param {string} carId
   * @returns {Object} Physics config merged with base carPhysics vehicle template
   */
  computePhysicsConfig(carId) {
    const levels = this.getTuningLevels(carId);
    const finalStats = this._lib.computeFinalStats(carId, levels);
    if (!finalStats) return null;

    // Map to vehicle-params.json format + carPhysics.json format
    return {
      mass: finalStats.mass,
      engineForce: finalStats.engineForce,
      brakeForce: finalStats.brakeForce,
      maxSteeringAngle: finalStats.maxSteeringAngle,
      maxSpeed: finalStats.maxSpeed,
      wheelFriction: finalStats.wheelFriction,
      frictionSlip: finalStats.frictionSlip,
      suspensionStiffness: finalStats.suspensionStiffness,
      suspensionDamping: finalStats.suspensionDamping,
      rollInfluence: finalStats.rollInfluence,
      driftCoefficient: finalStats.driftCoefficient,
      // Nitro modifiers (applied separately by VehiclePhysics)
      nitroCapacity: finalStats.nitroCapacity,
      nitroRefillRate: finalStats.nitroRefillRate,
      nitroBoostMult: finalStats.nitroBoostMult || 1.0,
      nitroMaxSpeedMult: finalStats.nitroMaxSpeedMult || 1.0,
    };
  }

  /**
   * Apply computed tuning to the VehiclePhysics instance in real time.
   * @param {Object} vehiclePhysics - The VehiclePhysics instance
   * @param {string} carId
   */
  applyToVehicle(vehiclePhysics, carId) {
    const config = this.computePhysicsConfig(carId);
    if (!config || !vehiclePhysics.cfg) return false;

    // Override the vehicle physics config with tuned values
    const cfg = vehiclePhysics.cfg;

    cfg.engineForce = config.engineForce;
    cfg.brakeForce = config.brakeForce;
    cfg.maxSteeringAngle = config.maxSteeringAngle;
    cfg.maxSpeed = config.maxSpeed;
    cfg.wheelFriction = config.wheelFriction;
    cfg.frictionSlip = config.frictionSlip;
    cfg.suspensionStiffness = config.suspensionStiffness;
    cfg.suspensionDamping = config.suspensionDamping;
    cfg.rollInfluence = config.rollInfluence;

    // Nitro config
    if (vehiclePhysics.nitroCfg) {
      vehiclePhysics.nitroCfg.maxNitroCapacity = config.nitroCapacity;
      vehiclePhysics.nitroCfg.nitroRefillRate = config.nitroRefillRate;
      vehiclePhysics.nitroCfg.boostForceMultiplier = 2.2 * config.nitroBoostMult;
      vehiclePhysics.nitroCfg.maxSpeedBoost = 1.25 * config.nitroMaxSpeedMult;
    }

    // Reset nitro capacity to new max
    vehiclePhysics.nitroCapacity = config.nitroCapacity;

    return true;
  }

  /**
   * Get the total cost of all current upgrades on a car.
   */
  getTotalSpent(carId) {
    const levels = this.getTuningLevels(carId);
    let total = 0;
    for (const [cat, lvl] of Object.entries(levels)) {
      for (let i = 1; i <= lvl; i++) {
        const info = this._lib.getTuneLevel(cat, i);
        if (info) total += info.cost;
      }
    }
    return total;
  }

  /**
   * Reset all tuning for a car (for testing/debug).
   */
  resetTuning(carId) {
    if (!this._save.saveData?.carTuning) return;
    this._save.saveData.carTuning[carId] = { engine: 0, turbo: 0, suspension: 0, tires: 0, brakes: 0, nitroKit: 0 };
    this._save.save();
  }
}
