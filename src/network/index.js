import {
  OP, encodeJoinRoom, encodeReady, encodeSnapshot, encodeCheckpoint, encodePing,
  decodeBroadcast, decodeRankUpdate, decodePong, decodeError,
} from './protocol.js';

export class NetworkManager {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.roomId = null;
    this.playerId = null;

    // Remote players: id -> { name, vehicleType, ready, meshRef }
    this.remotePlayers = new Map();

    // Snapshot throttling
    this._seq = 0;
    this._lastSnapshotTime = 0;
    this._snapshotInterval = 33; // 30Hz

    // Ping
    this.ping = 0;
    this._pingTimer = null;

    // Pending join (stored until socket opens)
    this._pendingJoin = null;

    // Callbacks set by App
    this.onRoomJoined = null;       // (roomId, playerId, players[])
    this.onPlayerJoined = null;     // (playerId, name, vehicleType)
    this.onPlayerLeft = null;       // (playerId)
    this.onReadyState = null;       // (readyMap: {playerId -> bool})
    this.onMatchStart = null;       // ()
    this.onCountdown = null;        // (seconds: int)
    this.onRaceStart = null;        // ()
    this.onRankUpdate = null;       // (ranks: [{playerId, rank}])
    this.onRaceFinish = null;       // (results: [{playerId, name, rank, totalTime}])
    this.onReturnToLobby = null;    // ()
    this.onRoomSettings = null;     // (settings)
    this.onError = null;            // (code, message)
    this.onDisconnect = null;       // (reason)
    this.onConnectionStatus = null; // (status, detail)

    // Internal snapshot callback for interpolation
    this.onRemoteSnapshot = null;   // (playerId, snapshot)
  }

  // --- Connection ---

  connect(url = 'ws://localhost:8080') {
    if (this.ws) this.disconnect();

    this._connectionUrl = url;
    this._emitConnectionStatus('connecting', { url });
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.connected = true;
      this._emitConnectionStatus('connected', { url: this._connectionUrl });
      if (this._pendingJoin) {
        const { roomCode, playerName, vehicleType } = this._pendingJoin;
        this._pendingJoin = null;
        this._sendJoin(roomCode, playerName, vehicleType);
      }
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this._handleBinary(event.data);
      } else if (typeof event.data === 'string') {
        this._handleJSON(event.data);
      }
    };

    this.ws.onclose = (event) => {
      this.connected = false;
      this._stopPing();
      const reason = event.code === 1000 ? 'normal' : `code=${event.code}`;
      if (this.onDisconnect) this.onDisconnect(reason);
      this._cleanup();
    };

    this.ws.onerror = () => {
      this._emitConnectionStatus('error', { url: this._connectionUrl });
      if (this.onError) this.onError('connection', 'WebSocket connection error');
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this._cleanup();
  }

  // --- Room ---

  /**
   * Join or create a room. If roomCode is null/empty, server generates one.
   * If not yet connected, the join is deferred until onopen.
   */
  joinRoom(roomCode, playerName, vehicleType = 0) {
    if (!this.connected) {
      this._pendingJoin = { roomCode, playerName, vehicleType };
      return;
    }
    this._sendJoin(roomCode, playerName, vehicleType);
  }

  setReady(ready) {
    if (!this.connected || !this.ws) return;
    const buf = encodeReady(ready);
    this.ws.send(buf);
  }

  setRoomSettings(settings) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'room_settings', settings }));
  }

  // --- Per-frame ---

  /**
   * Send a transform snapshot. Internally throttled to 30Hz.
   */
  sendSnapshot(position, rotation, velocity, flags) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;

    const now = performance.now();
    if (now - this._lastSnapshotTime < this._snapshotInterval) return;
    this._lastSnapshotTime = now;

    const buf = encodeSnapshot(position, rotation, velocity, flags, this._seq++);
    this.ws.send(buf);
  }

  sendCheckpoint(index) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
    const buf = encodeCheckpoint(index);
    this.ws.send(buf);
  }

  // --- Internal ---

  _sendJoin(roomCode, playerName, vehicleType) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const code = roomCode || this._generateCode();
    const buf = encodeJoinRoom(code, vehicleType, playerName);
    this.ws.send(buf);
  }

  _handleBinary(buffer) {
    try {
      const view = new DataView(buffer);
      const opcode = view.getUint8(0);

      switch (opcode) {
        case OP.TRANSFORM_BROADCAST: {
          const { serverTime, players } = decodeBroadcast(buffer);
          for (const p of players) {
            if (p.playerId === this.playerId) continue;
            const snapshot = {
              position: p.position,
              rotation: p.rotation,
              velocity: p.velocity,
              flags: p.flags,
              serverTime,
            };
            if (this.onRemoteSnapshot) {
              this.onRemoteSnapshot(p.playerId, snapshot);
            }
          }
          break;
        }
        case OP.RANK_UPDATE: {
          const ranks = decodeRankUpdate(buffer);
          if (this.onRankUpdate) this.onRankUpdate(ranks);
          break;
        }
        case OP.PONG: {
          const { clientTime, serverTime } = decodePong(buffer);
          this.ping = Date.now() - clientTime;
          break;
        }
        case OP.ERROR: {
          const { code, message } = decodeError(buffer);
          console.warn(`Server error [${code}]: ${message}`);
          if (this.onError) this.onError(code, message);
          break;
        }
        case OP.LAP_COMPLETE: {
          // Handled via JSON path; binary lap_complete not used currently
          break;
        }
        default:
          // Unknown binary opcode; ignore it for forward compatibility.
          break;
      }
    } catch (e) {
      console.warn('Binary message parse error:', e.message);
    }
  }

  _handleJSON(data) {
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case 'join_ack':
          this.roomId = msg.roomId;
          this.playerId = msg.playerId;
          for (const p of msg.players) {
            if (p.id !== this.playerId) {
              this.remotePlayers.set(p.id, {
                name: p.name,
                vehicleType: p.vehicleType,
                ready: p.ready,
                meshRef: null,
              });
            }
          }
          if (this.onRoomJoined) this.onRoomJoined(msg.roomId, msg.playerId, msg.players);
          if (msg.settings && this.onRoomSettings) this.onRoomSettings(msg.settings);
          break;

        case 'player_joined':
          this.remotePlayers.set(msg.player.id, {
            name: msg.player.name,
            vehicleType: msg.player.vehicleType,
            ready: msg.player.ready,
            meshRef: null,
          });
          if (this.onPlayerJoined) {
            this.onPlayerJoined(msg.player.id, msg.player.name, msg.player.vehicleType);
          }
          break;

        case 'player_left':
          this.remotePlayers.delete(msg.playerId);
          if (this.onPlayerLeft) this.onPlayerLeft(msg.playerId);
          break;

        case 'ready_state':
          for (const rs of msg.readyStates) {
            const rp = this.remotePlayers.get(rs.playerId);
            if (rp) rp.ready = rs.ready;
          }
          if (this.onReadyState) {
            const map = {};
            for (const rs of msg.readyStates) map[rs.playerId] = rs.ready;
            this.onReadyState(map);
          }
          break;

        case 'room_settings':
          if (this.onRoomSettings) this.onRoomSettings(msg.settings || {});
          break;

        case 'match_start':
          if (this.onMatchStart) this.onMatchStart();
          break;

        case 'countdown':
          if (this.onCountdown) this.onCountdown(msg.seconds);
          break;

        case 'race_start':
          if (this.onRaceStart) this.onRaceStart();
          break;

        case 'match_cancelled':
          if (this.onError) this.onError('match_cancelled', msg.reason || 'Match cancelled');
          break;

        case 'lap_complete':
          // Can be used by UIManager to show lap notification
          break;

        case 'rank_update':
          if (this.onRankUpdate) this.onRankUpdate(msg.ranks);
          break;

        case 'race_finish':
          if (this.onRaceFinish) this.onRaceFinish(msg.results);
          break;

        case 'return_to_lobby':
          if (this.onReturnToLobby) this.onReturnToLobby();
          break;

        case 'error':
          console.warn(`Server error [${msg.code}]: ${msg.message}`);
          if (this.onError) this.onError(msg.code, msg.message);
          break;

        default:
          break;
      }
    } catch (e) {
      // Not valid JSON, ignore
    }
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(encodePing(Date.now()));
      }
    }, 2000);
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  _cleanup() {
    this._stopPing();
    this.roomId = null;
    this.playerId = null;
    this.remotePlayers.clear();
    this._seq = 0;
  }

  _emitConnectionStatus(status, detail = {}) {
    if (this.onConnectionStatus) this.onConnectionStatus(status, detail);
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // --- Queries ---

  isHost() {
    return this.playerId === 1;
  }

  getPlayerCount() {
    return this.remotePlayers.size + 1;
  }
}

export { NetworkSync } from './NetworkSync.js';

