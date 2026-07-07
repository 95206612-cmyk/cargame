/**
 * Game mode manager — orchestrates all single-player game modes.
 *
 * Modes:
 *   'freerun'   — Free drive: no opponents, no police, test cars freely
 *   'race'      — Race event: 3 AI opponents, ranked finish
 *   'pursuit'   — Street pursuit: Phase 6 wanted/cop system
 *   'daily'     — Daily challenge: fixed car, time trial, leaderboard
 *
 * Provides mode start/end hooks and unified result data for settlement UI.
 */
export class GameModeManager {
  constructor() {
    this._mode = null;
    this._modeData = null;

    // AI opponent race data
    this._aiOpponents = [];
    this._playerFinishTime = null;
    this._playerFinishRank = 0;
    this._totalOpponents = 3;

    // Daily challenge
    this._dailyCarId = 'coupe';
    this._dailyWeather = 'clear';
    this._dailyTrack = 'city_circuit';
    this._dailyBestLap = Infinity;
  }

  get mode() { return this._mode; }
  get modeData() { return this._modeData; }

  // ==================== Mode Start ====================

  /**
   * Start free drive mode.
   */
  startFreeDrive(carId) {
    this._mode = 'freerun';
    this._modeData = {
      carId,
      opponents: 0,
      policeEnabled: false,
      timed: false,
    };
    return this._modeData;
  }

  /**
   * Start race event mode with AI opponents.
   * @param {string} eventId - Event identifier
   * @param {Object} eventConfig - { track, laps, reward, xpReward }
   */
  startRaceEvent(eventId, eventConfig, carId) {
    this._mode = 'race';
    this._modeData = {
      eventId,
      carId,
      track: eventConfig.track || 'city_circuit',
      laps: eventConfig.laps || 3,
      reward: eventConfig.reward || 500,
      xpReward: eventConfig.xpReward || 200,
      opponents: this._totalOpponents,
      policeEnabled: false,
      timed: true,
    };

    // Generate AI opponents
    this._aiOpponents = [];
    const aiNames = ['Ryo', 'Takeshi', 'Maria', 'Alex', 'Sam', 'Luna'];
    for (let i = 0; i < this._totalOpponents; i++) {
      this._aiOpponents.push({
        id: `ai_${i}`,
        name: aiNames[i % aiNames.length],
        speed: 18 + Math.random() * 8,  // m/s base speed
        finishTime: null,
        rank: 0,
      });
    }

    return this._modeData;
  }

  /**
   * Start pursuit mode.
   */
  startPursuit(carId) {
    this._mode = 'pursuit';
    this._modeData = {
      carId,
      track: 'city_circuit',
      opponents: 0,
      policeEnabled: true,
      timed: false,
    };
    return this._modeData;
  }

  /**
   * Start daily challenge mode.
   */
  startDailyChallenge(carId) {
    this._mode = 'daily';
    this._dailyBestLap = Infinity;
    this._modeData = {
      carId: this._dailyCarId,
      track: this._dailyTrack,
      weather: this._dailyWeather,
      laps: 1,
      opponents: 0,
      policeEnabled: false,
      timed: true,
      timeTrial: true,
    };
    return this._modeData;
  }

  // ==================== AI Opponent Simulation ====================

  /**
   * Get current AI opponent states for HUD or positioning.
   */
  getAIOpponents() {
    return this._aiOpponents;
  }

  /**
   * Simulate AI opponent finish times.
   * Called when the player finishes the race.
   * @param {number} playerTime - Player's total time in seconds
   */
  simulateAIFinishTimes(playerTime) {
    for (const ai of this._aiOpponents) {
      if (ai.finishTime === null) {
        // AI finish time = player time +/- random variation
        const variation = (Math.random() - 0.35) * 25; // Bias toward player winning
        ai.finishTime = playerTime + variation;
      }
    }

    // Rank all racers
    const allRacers = [
      { id: 'player', name: 'You', time: playerTime },
      ...this._aiOpponents.map(ai => ({ id: ai.id, name: ai.name, time: ai.finishTime })),
    ];
    allRacers.sort((a, b) => a.time - b.time);

    this._playerFinishRank = allRacers.findIndex(r => r.id === 'player') + 1;

    // Assign ranks to AI
    for (const ai of this._aiOpponents) {
      ai.rank = allRacers.findIndex(r => r.id === ai.id) + 1;
    }

    return {
      rank: this._playerFinishRank,
      playerTime,
      opponents: this._aiOpponents.map(ai => ({
        name: ai.name,
        time: ai.finishTime,
        rank: ai.rank,
      })),
    };
  }

  // ==================== Mode End / Result ====================

  get playerFinishRank() { return this._playerFinishRank; }

  /**
   * Build result data for the settlement UI.
   */
  buildResultData(extra = {}) {
    const base = {
      mode: this._mode,
      carId: this._modeData?.carId,
      reward: this._modeData?.reward || 0,
      xpReward: this._modeData?.xpReward || 0,
      ...extra,
    };

    if (this._mode === 'race') {
      return {
        ...base,
        rank: this._playerFinishRank,
        totalTime: extra.totalTime || 0,
        bestLap: extra.bestLap || Infinity,
        opponents: this._aiOpponents.map(ai => ({
          name: ai.name,
          time: ai.finishTime || 0,
          rank: ai.rank,
        })),
      };
    }

    if (this._mode === 'pursuit') {
      return {
        ...base,
        result: extra.result || 'escape',
        starLevel: extra.starLevel || 0,
        reward: extra.reward || 0,
        penalty: extra.penalty || 0,
      };
    }

    if (this._mode === 'daily') {
      return {
        ...base,
        bestLap: this._dailyBestLap,
        isNewRecord: extra.isNewRecord || false,
        leaderboard: extra.leaderboard || [],
      };
    }

    return base;
  }

  /**
   * Set daily challenge best lap.
   */
  setDailyBestLap(time) {
    this._dailyBestLap = time;
  }

  /**
   * End current mode.
   */
  endMode() {
    const result = this._modeData;
    this._mode = null;
    this._modeData = null;
    this._aiOpponents = [];
    this._playerFinishRank = 0;
    return result;
  }
}
