/**
 * Player data and progression system.
 *
 * Manages driver level, XP, dual currency, level-based unlocks,
 * career event progression, and daily challenge leaderboard.
 */
export class PlayerData {
  constructor(saveManager, carLibrary) {
    this._save = saveManager;
    this._lib = carLibrary;
  }

  // ==================== Level & XP ====================

  get level() {
    return this._save.saveData?.playerLevel || 1;
  }

  get xp() {
    return this._save.saveData?.xp || 0;
  }

  get xpToNextLevel() {
    const levels = this._lib._tuneConfig?.playerLevels || [];
    const next = levels.find(l => l.level === this.level + 1);
    if (!next) return Infinity;
    const current = levels.find(l => l.level === this.level) || { xpRequired: 0 };
    return next.xpRequired - current.xpRequired;
  }

  get xpProgressInLevel() {
    const levels = this._lib._tuneConfig?.playerLevels || [];
    const current = levels.find(l => l.level === this.level) || { xpRequired: 0 };
    const total = this.xpToNextLevel;
    if (total === Infinity) return 1;
    return Math.min(1, (this.xp - current.xpRequired) / (total || 1));
  }

  addXP(amount) {
    const result = this._lib.addXP(amount);
    // Check for new unlocks at the new level
    if (result.leveledUp) {
      this._checkUnlocks(result.newLevel);
    }
    return result;
  }

  _checkUnlocks(newLevel) {
    const cars = this._lib.getAllCarIds();
    for (const carId of cars) {
      const car = this._lib.getCar(carId);
      if (car && car.unlockLevel === newLevel) {
        console.log(`[PlayerData] Level ${newLevel}: Car unlocked — ${car.name}`);
      }
    }
    // Unlock events at certain levels
    const eventUnlocks = {
      2: ['race_event_1'],
      3: ['race_event_2'],
      5: ['race_event_3', 'daily_challenge'],
      7: ['race_event_4'],
    };
    const newEvents = eventUnlocks[newLevel] || [];
    for (const evt of newEvents) {
      this._save.unlockEvent(evt);
    }
  }

  // ==================== Dual Currency ====================

  get credits() {
    return this._save.saveData?.credits || 0;
  }

  get premiumPoints() {
    return this._save.saveData?.premiumPoints || 0;
  }

  addCredits(amount) {
    if (!this._save.saveData) return;
    this._save.saveData.credits = Math.max(0, (this._save.saveData.credits || 0) + amount);
    this._save.save();
  }

  addPremiumPoints(amount) {
    if (!this._save.saveData) return;
    this._save.saveData.premiumPoints = Math.max(0, (this._save.saveData.premiumPoints || 0) + amount);
    this._save.save();
  }

  // ==================== Career Events ====================

  isEventUnlocked(eventId) {
    return this._save.isEventUnlocked(eventId);
  }

  getUnlockedEvents() {
    return this._save.getUnlockedEvents();
  }

  /**
   * Get available race events based on player level and event unlocks.
   */
  getAvailableEvents() {
    const allEvents = [
      { id: 'race_event_1', name: '新手杯', track: 'city_circuit', laps: 2, reward: 500, xpReward: 200, unlockLevel: 0 },
      { id: 'race_event_2', name: '城市竞速', track: 'city_circuit', laps: 3, reward: 1000, xpReward: 500, unlockLevel: 2 },
      { id: 'race_event_3', name: '高速狂飙', track: 'city_circuit', laps: 4, reward: 2000, xpReward: 1000, unlockLevel: 5 },
      { id: 'race_event_4', name: '终极挑战', track: 'city_circuit', laps: 5, reward: 5000, xpReward: 2500, unlockLevel: 7 },
    ];

    const unlocked = this._save.getUnlockedEvents();
    // Event 1 is always available
    if (!unlocked.includes('race_event_1')) {
      this._save.unlockEvent('race_event_1');
    }

    return allEvents.map(e => ({
      ...e,
      unlocked: unlocked.includes(e.id) || e.unlockLevel === 0,
      completed: this._save.saveData?.completedEvents?.includes(e.id) || false,
    }));
  }

  completeEvent(eventId) {
    if (!this._save.saveData) return;
    if (!this._save.saveData.completedEvents) this._save.saveData.completedEvents = [];
    if (!this._save.saveData.completedEvents.includes(eventId)) {
      this._save.saveData.completedEvents.push(eventId);
    }

    // Unlock next tier after completing certain events
    const nextUnlock = {
      race_event_1: 'race_event_2',
      race_event_2: 'race_event_3',
      race_event_3: 'race_event_4',
    };
    const next = nextUnlock[eventId];
    if (next) {
      this._save.unlockEvent(next);
    }

    this._save.saveData.totalRaces = (this._save.saveData.totalRaces || 0) + 1;
    this._save.save();
  }

  // ==================== Daily Challenge ====================

  getDailyChallengeBest(trackId) {
    return this._save.getDailyChallengeBest(trackId);
  }

  addDailyChallengeTime(trackId, timeSeconds, carId) {
    const name = this._save.saveData?.playerName || 'Racer';
    return this._save.addDailyChallengeTime(trackId, timeSeconds, carId, name);
  }

  // ==================== Settings ====================

  get settings() {
    return this._save.saveData?.settings || {};
  }

  updateSetting(key, value) {
    if (!this._save.saveData?.settings) return;
    this._save.saveData.settings[key] = value;
    this._save.save();
  }

  // ==================== Stats ====================

  get totalRaces() {
    return this._save.saveData?.totalRaces || 0;
  }

  get totalWins() {
    return this._save.saveData?.totalWins || 0;
  }

  addWin() {
    if (!this._save.saveData) return;
    this._save.saveData.totalWins = (this._save.saveData.totalWins || 0) + 1;
    this._save.save();
  }
}
