/**
 * Unified network sync layer for multiplayer races.
 *
 * This wraps NetworkManager + InterpolationManager and also owns the selected
 * multiplayer server URL so UI code can test servers and list public rooms.
 */
export class NetworkSync {
  constructor(networkManager, interpolationManager) {
    this._net = networkManager;
    this._interp = interpolationManager;
    this._snapshotTimer = 0;
    this._snapshotInterval = 1 / 30;
    this._connected = false;
    this._roomId = null;
    this._playerId = null;
    this._pendingRoomSettings = null;
  }

  get connected() { return this._connected; }
  get roomId() { return this._roomId; }
  get playerId() { return this._playerId; }
  get playerCount() { return this._net ? this._net.getPlayerCount() : 1; }
  get remotePlayers() { return this._net ? this._net.remotePlayers : new Map(); }
  get serverUrl() { return this._resolveServerUrl(); }
  get httpBaseUrl() { return this._toHttpBaseUrl(this.serverUrl); }
  get ping() { return this._net?.ping || 0; }

  // ==================== Connection ====================

  createRoom(playerName, vehicleType = 0, roomSettings = null) {
    const code = this._generateRoomCode();
    this._pendingRoomSettings = roomSettings;
    this._connectAndJoin(code, playerName, vehicleType);
    return code;
  }

  joinRoom(roomCode, playerName, vehicleType = 0) {
    this._connectAndJoin(String(roomCode || '').toUpperCase(), playerName, vehicleType);
  }

  setServerUrl(url) {
    const normalized = this._normalizeServerUrl(url);
    globalThis.localStorage?.setItem?.('cargame_ws_url', normalized);
    return normalized;
  }

  async testServer(url = this.serverUrl, timeoutMs = 3500) {
    const wsUrl = this._normalizeServerUrl(url);
    const healthUrl = `${this._toHttpBaseUrl(wsUrl)}/health`;
    const now = () => performance.now?.() || Date.now();
    const started = now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller?.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return {
        ok: Boolean(data?.ok),
        url: wsUrl,
        healthUrl,
        latency: Math.round(now() - started),
        data,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async fetchRooms(url = this.serverUrl) {
    const wsUrl = this._normalizeServerUrl(url);
    const response = await fetch(`${this._toHttpBaseUrl(wsUrl)}/rooms`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data?.rooms) ? data.rooms : [];
  }

  _connectAndJoin(roomCode, playerName, vehicleType) {
    if (!this._net.connected) {
      this._net.connect(this._resolveServerUrl());
    }
    this._net.joinRoom(roomCode, playerName, vehicleType);
  }

  disconnect() {
    this._pendingRoomSettings = null;
    this._net.disconnect();
    this._connected = false;
    this._roomId = null;
    this._playerId = null;
    this._interp.reset();
  }

  // ==================== Per-Frame Update ====================

  update(delta, elapsed, position, rotation, velocity, flags = 0) {
    if (!this._connected) return;

    this._snapshotTimer += delta;
    if (this._snapshotTimer >= this._snapshotInterval) {
      this._snapshotTimer -= this._snapshotInterval;
      this._net.sendSnapshot(position, rotation, velocity, flags);
    }
  }

  getRemoteState(playerId, currentTime) {
    return this._interp.getInterpolatedState(playerId, currentTime);
  }

  sendCheckpoint(index) {
    if (this._connected) {
      this._net.sendCheckpoint(index);
    }
  }

  setReady(ready) {
    if (this._connected) {
      this._net.setReady(ready);
    }
  }

  setRoomSettings(settings) {
    if (this._connected) {
      this._net.setRoomSettings(settings);
    } else {
      this._pendingRoomSettings = settings;
    }
  }

  // ==================== Callback Wiring ====================

  wireCallbacks(handlers) {
    this._net.onRoomJoined = (roomId, playerId, players) => {
      this._connected = true;
      this._roomId = roomId;
      this._playerId = playerId;
      if (handlers.onRoomJoined) handlers.onRoomJoined(roomId, playerId, players);
      if (playerId === 1 && this._pendingRoomSettings) {
        this._net.setRoomSettings(this._pendingRoomSettings);
        this._pendingRoomSettings = null;
      }
    };

    this._net.onPlayerJoined = (playerId, name, vehicleType) => {
      if (handlers.onPlayerJoined) handlers.onPlayerJoined(playerId, name, vehicleType);
    };

    this._net.onPlayerLeft = (playerId) => {
      this._interp.removePlayer(playerId);
      if (handlers.onPlayerLeft) handlers.onPlayerLeft(playerId);
    };

    this._net.onReadyState = (readyMap) => {
      if (handlers.onReadyState) handlers.onReadyState(readyMap);
    };

    this._net.onRoomSettings = (settings) => {
      if (handlers.onRoomSettings) handlers.onRoomSettings(settings);
    };

    this._net.onMatchStart = () => {
      if (handlers.onMatchStart) handlers.onMatchStart();
    };

    this._net.onCountdown = (seconds) => {
      if (handlers.onCountdown) handlers.onCountdown(seconds);
    };

    this._net.onRaceStart = () => {
      if (handlers.onRaceStart) handlers.onRaceStart();
    };

    this._net.onRankUpdate = (ranks) => {
      if (handlers.onRankUpdate) handlers.onRankUpdate(ranks);
    };

    this._net.onRaceFinish = (results) => {
      if (handlers.onRaceFinish) handlers.onRaceFinish(results);
    };

    this._net.onReturnToLobby = () => {
      if (handlers.onReturnToLobby) handlers.onReturnToLobby();
    };

    this._net.onError = (code, message) => {
      if (handlers.onError) handlers.onError(code, message);
    };

    this._net.onDisconnect = (reason) => {
      this._connected = false;
      this._roomId = null;
      this._playerId = null;
      if (handlers.onDisconnect) handlers.onDisconnect(reason);
    };

    this._net.onConnectionStatus = (status, detail) => {
      if (handlers.onConnectionStatus) handlers.onConnectionStatus(status, detail);
    };

    this._net.onRemoteSnapshot = (playerId, snapshot) => {
      this._interp.receiveSnapshot(playerId, snapshot);
    };
  }

  // ==================== Helpers ====================

  _generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  _resolveServerUrl() {
    const fromQuery = new URLSearchParams(globalThis.location?.search || '').get('ws');
    const fromStorage = globalThis.localStorage?.getItem?.('cargame_ws_url');
    return this._normalizeServerUrl(fromQuery || fromStorage || 'ws://localhost:8080');
  }

  _normalizeServerUrl(value) {
    const raw = String(value || '').trim() || 'ws://localhost:8080';
    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '');
    }
    if (/^wss?:\/\//i.test(raw)) return raw.replace(/\/$/, '');
    return `ws://${raw.replace(/\/$/, '')}`;
  }

  _toHttpBaseUrl(wsUrl) {
    return this._normalizeServerUrl(wsUrl)
      .replace(/^ws:/i, 'http:')
      .replace(/^wss:/i, 'https:')
      .replace(/\/$/, '');
  }

  buildPlayerList() {
    const players = [{
      id: this._playerId || 0,
      name: 'You',
      vehicleType: 0,
      ready: false,
    }];

    for (const [id, rp] of this._net.remotePlayers) {
      players.push({
        id,
        name: rp.name || `Player ${id}`,
        vehicleType: rp.vehicleType || 0,
        ready: rp.ready || false,
      });
    }
    return players;
  }
}
