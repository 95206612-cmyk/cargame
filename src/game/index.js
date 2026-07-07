export { TimerSystem } from './TimerSystem.js';
export { GameModeManager } from './GameModeManager.js';
export { PursuitManager } from './PursuitManager.js';

export class GameManager {
  constructor() {
    this.mode = 'freerun'; // 'freerun' | 'race' | 'time_trial' | 'pursuit'
    this.state = 'menu';   // 'menu' | 'countdown' | 'racing' | 'finished' | 'paused'
    this.lap = 1;
    this.totalLaps = 3;
    this.checkpoints = [];
    this.nextCheckpoint = 0;
    this.timer = 0;
    this.bestLap = Infinity;
    this.lapTimes = [];
    this.aiDrivers = [];
    this.playerPosition = 1;
  }

  startRace(trackId, totalLaps = 3, mode = 'race') {
    this.mode = mode;
    this.totalLaps = totalLaps;
    this.lap = 1;
    this.nextCheckpoint = 0;
    this.timer = 0;
    this.bestLap = Infinity;
    this.lapTimes = [];
    this.state = 'countdown';
  }

  onCheckpoint(index) {
    if (index === this.nextCheckpoint) {
      this.nextCheckpoint++;
      if (this.nextCheckpoint >= this.checkpoints.length) {
        this.nextCheckpoint = 0;
        this.onLapComplete();
      }
    }
  }

  onLapComplete() {
    this.lapTimes.push(this.timer);
    if (this.timer < this.bestLap) {
      this.bestLap = this.timer;
    }
    this.timer = 0;
    this.lap++;
    if (this.lap > this.totalLaps) {
      this.state = 'finished';
    }
  }

  getPlayerRank() {
    return this.playerPosition;
  }

  pause() {
    if (this.state === 'racing') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = 'racing';
  }

  update(delta) {
    if (this.state !== 'racing') return;
    this.timer += delta;
  }
}
