import { Player } from './player.js';
import { MatchManager } from './match.js';
import { OP, encodeBroadcast, encodeRankUpdate, encodeRaceFinish, encodeError } from './protocol.js';

export class Room {
  constructor(code, options = {}) {
    this.code = code;
    this.players = new Map();      // playerId -> Player
    this.maxPlayers = Math.max(2, Math.min(12, Number(options.maxPlayers) || 6));
    this.state = 'lobby';          // lobby | countdown | racing | finished
    this.settings = {
      mode: 'speed',
      trackId: 'city_circuit',
      laps: 3,
      maxPlayers: this.maxPlayers,
      itemMode: false,
      collisions: true,
    };
    this.createdAt = Date.now();
    this.idleSince = Date.now();
    this.match = new MatchManager(this);
    this.nextPlayerId = 1;
    this._relayInterval = null;
  }

  addPlayer(ws, name, vehicleType) {
    if (this.state !== 'lobby') {
      this._sendTo(ws, encodeError('race_in_progress', 'Race is in progress. Please wait.'));
      return null;
    }
    if (this.players.size >= this.settings.maxPlayers) {
      this._sendTo(ws, encodeError('room_full', `Room is full (max ${this.settings.maxPlayers} players).`));
      return null;
    }

    const id = this.nextPlayerId++;
    const player = new Player(id, ws, name, vehicleType);
    this.players.set(id, player);
    this.idleSince = 0;

    // Send JOIN_ACK to the new player
    this._sendTo(ws, JSON.stringify({
      type: 'join_ack',
      roomId: this.code,
      playerId: id,
      players: [...this.players.values()].map(p => p.toJSON()),
      settings: this.settings,
    }));

    // Broadcast PLAYER_JOINED to others
    this.broadcast(JSON.stringify({
      type: 'player_joined',
      player: player.toJSON(),
    }), id);
    this._broadcastReadyState();

    console.log(`[Room ${this.code}] Player ${id} (${name}) joined. ${this.players.size}/${this.settings.maxPlayers}`);
    return id;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;

    player.connected = false;
    this.players.delete(playerId);

    // If room was in countdown and we drop below 2, cancel
    if (this.state === 'countdown' && this.players.size < 2) {
      this.match.cancelCountdown();
      this.state = 'lobby';
      this.broadcast(JSON.stringify({ type: 'match_cancelled', reason: 'Not enough players.' }));
    }

    // If racing, check if all finished
    if (this.state === 'racing') {
      const active = [...this.players.values()].filter(p => p.connected && !p.finished);
      if (active.length === 0) {
        this._endRace();
      }
    }

    this.broadcast(JSON.stringify({
      type: 'player_left',
      playerId: playerId,
      playerCount: this.players.size,
    }));
    this._broadcastReadyState();

    // Mark as idle when empty
    if (this.players.size === 0) {
      this.idleSince = Date.now();
      this._stopRelay();
    }

    console.log(`[Room ${this.code}] Player ${playerId} left. ${this.players.size}/${this.settings.maxPlayers}`);
  }

  setReady(playerId, value) {
    const player = this.players.get(playerId);
    if (!player || this.state !== 'lobby') return;

    player.ready = value;
    this._broadcastReadyState();

    // Check if all ready
    const allReady = [...this.players.values()].every(p => p.ready);
    if (allReady && this.players.size >= 2) {
      this._startCountdown();
    }
  }

  updateSettings(playerId, settings = {}) {
    if (this.state !== 'lobby') return false;
    if (playerId !== 1) {
      const player = this.players.get(playerId);
      if (player?.ws) this._sendTo(player.ws, encodeError('not_host', 'Only host can change room settings.'));
      return false;
    }
    this.settings = {
      ...this.settings,
      mode: ['speed', 'item', 'team', 'time'].includes(settings.mode) ? settings.mode : this.settings.mode,
      trackId: String(settings.trackId || this.settings.trackId),
      laps: Math.max(1, Math.min(5, Number(settings.laps) || this.settings.laps)),
      maxPlayers: Math.max(this.players.size, 2, Math.min(6, Number(settings.maxPlayers) || this.settings.maxPlayers)),
      itemMode: Boolean(settings.itemMode),
      collisions: settings.collisions !== false,
    };
    this.maxPlayers = this.settings.maxPlayers;
    this.match.totalLaps = this.settings.laps;
    this.broadcast(JSON.stringify({ type: 'room_settings', settings: this.settings }));
    this._broadcastReadyState();
    return true;
  }

  _startCountdown() {
    this.state = 'countdown';
    this.match.totalLaps = this.settings.laps;
    this.match.startCountdown();
  }

  startRace() {
    this.state = 'racing';
    // Reset race state for all players
    for (const p of this.players.values()) {
      p.lap = 0;
      p.checkpointIndex = 0;
      p.rank = 1;
      p.totalTime = 0;
      p.finished = false;
    }
    this.broadcast(JSON.stringify({ type: 'race_start' }));
    this._startRelay();
    console.log(`[Room ${this.code}] Race started!`);
  }

  collectSnapshots() {
    if (this.state !== 'racing') return;
    const players = [...this.players.values()].filter(p => p.connected && p.lastSnapshot && !p.finished);
    if (players.length === 0) return;
    const buf = encodeBroadcast(players, Date.now());
    this.broadcast(buf, null, true);
  }

  handleSnapshot(playerId, snapshot) {
    const player = this.players.get(playerId);
    if (!player || player.finished) return;
    player.lastSnapshot = snapshot;
    player.snapshotSeq = snapshot.seq;
  }

  handleCheckpoint(playerId, checkpointIndex) {
    const player = this.players.get(playerId);
    if (!player || player.finished || this.state !== 'racing') return;

    if (checkpointIndex === player.checkpointIndex) {
      player.checkpointIndex = checkpointIndex + 1;

      // Check if lap complete (checkpoint wrapped around)
      if (player.checkpointIndex >= this.match.totalCheckpoints) {
        player.checkpointIndex = 0;
        this._onLapComplete(player);
      }
    }
  }

  _onLapComplete(player) {
    player.lap++;
    this.broadcast(JSON.stringify({
      type: 'lap_complete',
      playerId: player.id,
      lap: player.lap,
      totalLaps: this.match.totalLaps,
    }));

    if (player.lap >= this.match.totalLaps) {
      player.finished = true;
      player.totalTime = Date.now() - this.match.raceStartTime;

      this._updateRanks();

      // Check if all players finished
      const allFinished = [...this.players.values()].every(p => !p.connected || p.finished);
      if (allFinished) {
        this._endRace();
      }
    }
  }

  _updateRanks() {
    // Sort by lap desc, then by time asc (finished first), then checkpoint desc
    const sorted = [...this.players.values()]
      .filter(p => p.connected)
      .sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.lap !== b.lap) return b.lap - a.lap;
        if (a.finished && b.finished) return a.totalTime - b.totalTime;
        return b.checkpointIndex - a.checkpointIndex;
      });

    sorted.forEach((p, i) => { p.rank = i + 1; });

    // Broadcast rank update
    if (sorted.length > 0) {
      const buf = encodeRankUpdate(sorted);
      this.broadcast(buf, null, true);
    }
  }

  _endRace() {
    this.state = 'finished';
    this._stopRelay();
    this._updateRanks();

    const results = [...this.players.values()]
      .filter(p => p.finished)
      .sort((a, b) => a.totalTime - b.totalTime)
      .map((p, i) => ({
        playerId: p.id,
        name: p.name,
        rank: i + 1,
        totalTime: p.totalTime,
      }));

    // Add DNF players
    for (const p of this.players.values()) {
      if (!p.finished) {
        results.push({
          playerId: p.id,
          name: p.name,
          rank: results.length + 1,
          totalTime: -1,
        });
      }
    }

    this.broadcast(JSON.stringify({ type: 'race_finish', results }));

    // Return to lobby after 15 seconds
    setTimeout(() => {
      if (this.state === 'finished') {
        this.state = 'lobby';
        for (const p of this.players.values()) {
          p.ready = false;
          p.lap = 0;
          p.checkpointIndex = 0;
          p.lastSnapshot = null;
          p.finished = false;
        }
        this.broadcast(JSON.stringify({ type: 'return_to_lobby' }));
        console.log(`[Room ${this.code}] Returned to lobby.`);
      }
    }, 15000);
  }

  _startRelay() {
    if (this._relayInterval) return;
    this._relayInterval = setInterval(() => {
      this.collectSnapshots();
      if (this.state === 'racing') {
        this._updateRanks();
      }
    }, 33); // ~30 Hz
  }

  _stopRelay() {
    if (this._relayInterval) {
      clearInterval(this._relayInterval);
      this._relayInterval = null;
    }
  }

  broadcast(data, excludeId = null, isBinary = false) {
    for (const [id, player] of this.players) {
      if (id === excludeId) continue;
      if (player.ws.readyState === 1) { // WebSocket.OPEN
        player.ws.send(data);
      }
    }
  }

  _sendTo(ws, data) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }

  _broadcastReadyState() {
    this.broadcast(JSON.stringify({
      type: 'ready_state',
      readyStates: [...this.players.values()].map(p => ({ playerId: p.id, ready: p.ready })),
    }));
  }

  isStale(maxAgeMs = 300000) {
    return this.idleSince > 0 && (Date.now() - this.idleSince) > maxAgeMs;
  }

  getPlayerCount() {
    return this.players.size;
  }
  toSummary() {
    const players = [...this.players.values()];
    const host = players.find(p => p.id === 1) || players[0] || null;
    const readyCount = players.filter(p => p.ready).length;
    return {
      code: this.code,
      state: this.state,
      playerCount: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      readyCount,
      hostName: host?.name || '',
      settings: { ...this.settings },
      createdAt: this.createdAt,
      ageSeconds: Math.max(0, Math.round((Date.now() - this.createdAt) / 1000)),
      joinable: this.state === 'lobby' && this.players.size < this.settings.maxPlayers,
    };
  }
}

