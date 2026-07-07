export class MatchManager {
  constructor(room) {
    this.room = room;
    this.totalLaps = 3;
    this.totalCheckpoints = 4;   // Number of checkpoints per lap
    this.raceStartTime = 0;
    this._countdownTimer = null;
    this._raceTimeout = null;
  }

  startCountdown() {
    let remaining = 3;
    this.room.broadcast(JSON.stringify({ type: 'match_start' }));
    this.room.broadcast(JSON.stringify({ type: 'countdown', seconds: remaining }));

    this._countdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        this.room.startRace();
        this._startRaceTimeout();
      } else {
        this.room.broadcast(JSON.stringify({ type: 'countdown', seconds: remaining }));
      }
    }, 1000);
  }

  cancelCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  }

  _startRaceTimeout() {
    this.raceStartTime = Date.now();
    // 5-minute race timeout
    this._raceTimeout = setTimeout(() => {
      if (this.room.state === 'racing') {
        // Force-finish: mark all non-finished players as DNF
        for (const p of this.room.players.values()) {
          if (!p.finished) {
            p.finished = true;
            p.totalTime = -1;
          }
        }
        this.room._endRace();
      }
    }, 300000);
  }
}
