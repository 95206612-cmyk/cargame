import * as THREE from 'three';

/**
 * Checkpoint/lap timing system.
 * - Defines checkpoint trigger zones along the track
 * - Detects when the player vehicle passes through checkpoints in order
 * - Tracks lap times, best lap, split times
 * - Detects shortcut usage (skipped checkpoints → either penalty or reward)
 */
export class TimerSystem {
  constructor() {
    this.checkpoints = [];       // { position, radius, index }
    this.finishLine = null;      // { position, direction, width }
    this.currentLap = 1;
    this.totalLaps = 3;
    this.lapStartTime = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.splitTimes = [];
    this.lastSplitTime = 0;
    this.nextCheckpointIndex = 0;
    this.checkpointsHitThisLap = 0;
    this.totalCheckpoints = 0;

    // Shortcut detection
    this.shortcutDetected = false;
    this.shortcutCheckpointsSkipped = 0;
    this.shortcutNitroReward = 0;

    // Cooldown to prevent double-trigger
    this._triggerCooldown = 0;
    this._triggerCooldownTime = 0.5;
  }

  /**
   * Set up checkpoints from an array of positions.
   * @param {Array<{x:number, y:number, z:number, radius?:number}>} points
   * @param {number} totalLaps
   */
  setupCheckpoints(points, totalLaps = 3) {
    this.checkpoints = points.map((p, i) => ({
      position: new THREE.Vector3(p.x, p.y, p.z),
      radius: p.radius || 8.0,
      index: i,
      isFinishLine: i === 0,
    }));
    this.finishLine = this.checkpoints[0] || null;
    this.totalCheckpoints = this.checkpoints.length;
    this.totalLaps = totalLaps;
    this.reset();
  }

  reset() {
    this.currentLap = 1;
    this.lapStartTime = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.splitTimes = [];
    this.lastSplitTime = 0;
    this.nextCheckpointIndex = 0;
    this.checkpointsHitThisLap = 0;
    this.shortcutDetected = false;
    this.shortcutCheckpointsSkipped = 0;
    this.shortcutNitroReward = 0;
    this._triggerCooldown = 0;
  }

  /**
   * Update each frame. Checks vehicle position against checkpoints.
   * @param {number} delta
   * @param {{x:number, y:number, z:number}} vehiclePos
   * @param {number} elapsedTime - total race elapsed time in seconds
   * @returns {{ lapCompleted: boolean, checkpointHit: number|null, isFinish: boolean, shortcutDetected: boolean }}
   */
  update(delta, vehiclePos, elapsedTime) {
    this._triggerCooldown = Math.max(0, this._triggerCooldown - delta);

    const result = {
      lapCompleted: false,
      checkpointHit: null,
      isFinish: false,
      shortcutDetected: false,
      shortcutNitroReward: 0,
    };

    if (!this.checkpoints.length) return result;

    const pos = new THREE.Vector3(vehiclePos.x, vehiclePos.y, vehiclePos.z);

    // Check each checkpoint
    for (const cp of this.checkpoints) {
      const dist = pos.distanceTo(cp.position);

      if (dist < cp.radius) {
        if (cp.index === this.nextCheckpointIndex && this._triggerCooldown <= 0) {
          this._triggerCooldown = this._triggerCooldownTime;

          if (cp.isFinishLine) {
            // Start/finish line
            if (this.checkpointsHitThisLap >= this.totalCheckpoints - 1) {
              // Completed full lap
              const lapTime = elapsedTime - this.lapStartTime;
              this.lapTimes.push(lapTime);
              if (lapTime < this.bestLap) {
                this.bestLap = lapTime;
              }
              this.currentLap++;
              this.lapStartTime = elapsedTime;
              this.checkpointsHitThisLap = 0;
              this.nextCheckpointIndex = 0;

              result.lapCompleted = true;
              result.lapTime = lapTime;
              result.isFinish = this.currentLap > this.totalLaps;
              result.currentLap = Math.min(this.currentLap, this.totalLaps);
              result.bestLap = this.bestLap;
            } else if (this.checkpointsHitThisLap === 0 && this.currentLap === 1) {
              // First time crossing start line — begin timing
              this.lapStartTime = elapsedTime;
              this.nextCheckpointIndex = 1;
              this.checkpointsHitThisLap = 1;
              result.checkpointHit = 0;
              result.checkpointProgress = this.checkpointsHitThisLap / this.totalCheckpoints;
            }
          } else {
            // Regular checkpoint
            this.checkpointsHitThisLap++;
            this.nextCheckpointIndex = (this.nextCheckpointIndex + 1) % this.totalCheckpoints;

            // Split time
            const splitTime = elapsedTime - this.lastSplitTime;
            this.splitTimes.push({ checkpoint: cp.index, split: splitTime });
            this.lastSplitTime = elapsedTime;

            result.checkpointHit = cp.index;
            result.checkpointProgress = this.checkpointsHitThisLap / this.totalCheckpoints;
          }
        } else if (cp.index !== this.nextCheckpointIndex && cp.isFinishLine && this._triggerCooldown <= 0) {
          // Crossed finish line out of order — possible shortcut
          const skipped = this.totalCheckpoints - 1 - this.checkpointsHitThisLap;
          if (skipped > 0) {
            this.shortcutDetected = true;
            this.shortcutCheckpointsSkipped += skipped;
            this.shortcutNitroReward += skipped * 15; // 15 nitro per skipped checkpoint

            result.shortcutDetected = true;
            result.shortcutCheckpointsSkipped = skipped;
            result.shortcutNitroReward = this.shortcutNitroReward;

            // Still count the lap but mark shortcut
            const lapTime = elapsedTime - this.lapStartTime;
            this.lapTimes.push({ time: lapTime, shortcut: true, skipped });
            if (lapTime < this.bestLap) {
              this.bestLap = lapTime;
            }
            this.currentLap++;
            this.lapStartTime = elapsedTime;
            this.checkpointsHitThisLap = 0;
            this.nextCheckpointIndex = 0;
            this._triggerCooldown = this._triggerCooldownTime;

            result.lapCompleted = true;
            result.lapTime = lapTime;
            result.isFinish = this.currentLap > this.totalLaps;
            result.currentLap = Math.min(this.currentLap, this.totalLaps);
          }
        }
        break; // Only detect one checkpoint per frame
      }
    }

    return result;
  }

  /**
   * Get formatted time string.
   */
  static formatTime(seconds) {
    if (seconds === Infinity || seconds == null) return '--:--.--';
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${String(m).padStart(2, '0')}:${s}`;
  }

  get progress() {
    if (this.totalCheckpoints === 0) return 0;
    return this.checkpointsHitThisLap / this.totalCheckpoints;
  }
}
