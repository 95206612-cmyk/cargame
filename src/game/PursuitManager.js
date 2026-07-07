/**
 * Pursuit game mode manager.
 *
 * Tracks wanted star level from player infractions, manages escape countdown,
 * capture detection, and pursuit resolution (escape/busted).
 *
 * Infractions that raise wanted level:
 *   - Speeding (>130 km/h): small increment
 *   - Hitting civilian vehicle: medium increment
 *   - Hitting barrier/guardrail: small increment
 *   - Extended drift (>2s continuous): small increment
 *
 * Escape: when no cop within detection range, countdown starts.
 * After 10s, star level decreases by 1. At 0 stars, pursuit ends.
 *
 * Capture: >=3 cop cars within 6m of player for 5s → busted.
 */
export class PursuitManager {
  constructor(policeAI) {
    this._police = policeAI;
    this._starLevel = 0;
    this._starProgress = [0, 0, 0, 0, 0, 0]; // Progress toward next star per level

    // Star thresholds: infraction points needed to reach each star
    this._starThresholds = [0, 50, 120, 220, 350, 520];

    // Escape
    this._escapeTimer = 0;
    this._escapeRequired = 10;       // Seconds to drop one star
    this._escapeCooldown = 0;        // Delay before escape countdown starts after last sighting
    this._escapeCooldownRequired = 3; // Seconds of no cop sighting before countdown
    this._escaped = false;

    // Capture
    this._captureTimer = 0;
    this._captureRequired = 5;       // Seconds surrounded to trigger capture
    this._captured = false;

    // Drift tracking
    this._driftAccumulator = 0;

    // Infraction cooldowns (prevent spam)
    this._speedingCooldown = 0;
    this._civHitCooldown = 0;
    this._barrierHitCooldown = 0;

    // Reward
    this.rewardCredits = 0;
    this.penaltyCredits = 0;
  }

  get starLevel() { return this._starLevel; }
  get escaped() { return this._escaped; }
  get captured() { return this._captured; }
  get escapeProgress() { return this._escapeTimer / this._escapeRequired; }
  get captureProgress() { return this._captureTimer / this._captureRequired; }
  get isActive() { return this._starLevel > 0 || this._escapeTimer > 0; }

  /**
   * Start pursuit mode.
   */
  start() {
    this._starLevel = 0;
    this._starProgress = [0, 0, 0, 0, 0, 0];
    this._escapeTimer = 0;
    this._escapeCooldown = 0;
    this._captureTimer = 0;
    this._escaped = false;
    this._captured = false;
    this._driftAccumulator = 0;
    this._speedingCooldown = 0;
    this._civHitCooldown = 0;
    this._barrierHitCooldown = 0;
    this.rewardCredits = 0;
    this.penaltyCredits = 0;
    this._police.starLevel = 0;
  }

  /**
   * Force-set star level (for debug/testing).
   */
  setStarLevel(level) {
    this._starLevel = Math.max(0, Math.min(5, level));
    this._starProgress = this._starProgress.map(() => 0);
    this._police.starLevel = this._starLevel;
    this._escapeTimer = 0;
    this._escapeCooldown = 0;
  }

  /**
   * Main update. Called every frame.
   * @param {number} delta
   * @param {Object} playerState — { position: {x,y,z}, speedKmh, isDrifting, yaw }
   * @param {boolean} hitCiv - Whether player hit a civilian car this frame
   * @param {boolean} hitBarrier - Whether player hit a barrier this frame
   */
  update(delta, playerState, hitCiv = false, hitBarrier = false) {
    if (this._escaped || this._captured) return;

    const speedKmh = playerState.speedKmh || 0;
    const pos = playerState.position || { x: 0, y: 0, z: 0 };

    // --- Process infractions ---
    this._speedingCooldown = Math.max(0, this._speedingCooldown - delta);
    this._civHitCooldown = Math.max(0, this._civHitCooldown - delta);
    this._barrierHitCooldown = Math.max(0, this._barrierHitCooldown - delta);

    // Speeding infraction
    if (speedKmh > 130 && this._speedingCooldown <= 0 && this._starLevel < 5) {
      const overSpeed = (speedKmh - 130) / 50; // 130→1x, 180→2x, 230→3x
      this._addInfractionPoints(overSpeed * 1.5 * delta * 10);
      this._speedingCooldown = 1.0; // Check every second
    }

    // Hit civilian car
    if (hitCiv && this._civHitCooldown <= 0 && this._starLevel < 5) {
      this._addInfractionPoints(35);
      this._civHitCooldown = 3.0;
    }

    // Hit barrier
    if (hitBarrier && this._barrierHitCooldown <= 0 && this._starLevel < 5) {
      this._addInfractionPoints(15);
      this._barrierHitCooldown = 2.0;
    }

    // Extended drift
    if (playerState.isDrifting) {
      this._driftAccumulator += delta;
      if (this._driftAccumulator > 2.0 && this._starLevel < 5) {
        this._addInfractionPoints(delta * 8);
      }
    } else {
      this._driftAccumulator = Math.max(0, this._driftAccumulator - delta * 2);
    }

    // --- Star decay (slowly lose infraction points when not committing infractions) ---
    if (this._starLevel > 0 && this._starProgress[this._starLevel] > 0) {
      this._starProgress[this._starLevel] -= delta * 2; // Slow decay
      if (this._starProgress[this._starLevel] < 0) this._starProgress[this._starLevel] = 0;
    }

    // --- Escape logic ---
    const nearestCopDist = this._police.getNearestCopDistance(pos);
    const detectionRange = 100;

    if (this._starLevel > 0) {
      if (nearestCopDist > detectionRange) {
        // No cops in sight — start cooldown then escape countdown
        this._escapeCooldown += delta;
        if (this._escapeCooldown >= this._escapeCooldownRequired) {
          this._escapeTimer += delta;
          if (this._escapeTimer >= this._escapeRequired) {
            // Drop one star
            this._starLevel--;
            this._starProgress[this._starLevel + 1] = 0;
            this._escapeTimer = 0;
            this._escapeCooldown = 0;
            this._police.starLevel = this._starLevel;

            if (this._starLevel <= 0) {
              // Successfully escaped!
              this._escaped = true;
              this._police.starLevel = 0;
              this._police.clear();
              this.rewardCredits = this._calculateEscapeReward();
            }
          }
        }
      } else {
        // Cops in sight — reset escape
        this._escapeCooldown = 0;
        if (this._escapeTimer > 0) {
          this._escapeTimer = Math.max(0, this._escapeTimer - delta * 1.5);
        }
      }
    }

    // --- Capture logic ---
    if (this._starLevel >= 2) {
      const closeCops = this._police.getCloseCopCount(pos, 6);
      if (closeCops >= 3) {
        this._captureTimer += delta;
        if (this._captureTimer >= this._captureRequired) {
          // Busted!
          this._captured = true;
          this._police.starLevel = 0;
          this._police.clear();
          this.penaltyCredits = this._calculateCapturePenalty();
        }
      } else {
        this._captureTimer = Math.max(0, this._captureTimer - delta * 0.5);
      }
    }
  }

  /**
   * Add infraction points toward the next star level.
   */
  _addInfractionPoints(amount) {
    if (this._starLevel >= 5) return;
    this._starProgress[this._starLevel] += amount;

    const threshold = this._starThresholds[this._starLevel + 1] - this._starThresholds[this._starLevel];
    if (this._starProgress[this._starLevel] >= threshold) {
      // Level up!
      this._starProgress[this._starLevel] = 0;
      this._starLevel++;
      this._starProgress[this._starLevel] = 0;
      this._escapeTimer = 0;
      this._escapeCooldown = 0;
      this._police.starLevel = this._starLevel;
    }
  }

  /**
   * Get progress toward next star (0-1).
   */
  getNextStarProgress() {
    if (this._starLevel >= 5) return 1;
    const threshold = this._starThresholds[this._starLevel + 1] - this._starThresholds[this._starLevel];
    return Math.min(1, this._starProgress[this._starLevel] / threshold);
  }

  _calculateEscapeReward() {
    // Higher star escape = bigger reward
    return 500 + this._starLevel * 400;
  }

  _calculateCapturePenalty() {
    return 200 + this._starLevel * 150;
  }
}
