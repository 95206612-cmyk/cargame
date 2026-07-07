import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { Room } from './room.js';
import { OP, decodeSnapshot, encodePong, encodeError } from './protocol.js';

const CONFIG = {
  host: process.env.HOST || '0.0.0.0',
  port: readInt('PORT', 8080, 1, 65535),
  publicUrl: process.env.PUBLIC_URL || '',
  roomIdleMs: readInt('ROOM_IDLE_MS', 300000, 30000, 86400000),
  maxRooms: readInt('MAX_ROOMS', 100, 1, 10000),
  maxPlayersPerRoom: readInt('MAX_PLAYERS_PER_ROOM', 6, 2, 12),
  heartbeatMs: readInt('HEARTBEAT_MS', 30000, 5000, 120000),
  maxMessageBytes: readInt('MAX_MESSAGE_BYTES', 65536, 1024, 1048576),
  maxMessagesPerSecond: readInt('MAX_MESSAGES_PER_SECOND', 90, 10, 300),
  maxSnapshotsPerSecond: readInt('MAX_SNAPSHOTS_PER_SECOND', 36, 10, 90),
};

const rooms = new Map();
const startedAt = Date.now();

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'street-racer-multiplayer',
      uptime: Math.round((Date.now() - startedAt) / 1000),
      rooms: rooms.size,
      players: getPlayerCount(),
      maxRooms: CONFIG.maxRooms,
      maxPlayersPerRoom: CONFIG.maxPlayersPerRoom,
      websocketUrl: CONFIG.publicUrl || `ws://localhost:${CONFIG.port}`,
    });
    return;
  }

  if (url.pathname === '/rooms') {
    const publicRooms = [...rooms.values()]
      .filter(room => room.getPlayerCount() > 0 || !room.isStale(CONFIG.roomIdleMs))
      .map(room => room.toSummary());
    sendJson(res, 200, { ok: true, rooms: publicRooms, count: publicRooms.length });
    return;
  }

  if (url.pathname === '/') {
    sendJson(res, 200, {
      ok: true,
      name: 'Street Racer Multiplayer Server',
      endpoints: ['/health', '/rooms'],
      websocket: '/',
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not_found' });
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: CONFIG.maxMessageBytes,
  perMessageDeflate: false,
});

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.rateState = makeRateState();
  ws.remoteAddress = req.socket.remoteAddress || 'unknown';

  let currentPlayerId = null;
  let currentRoom = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data, isBinary) => {
    try {
      if (getPayloadSize(data) > CONFIG.maxMessageBytes) {
        sendWsError(ws, 'payload_too_large', 'Message payload is too large.');
        ws.close(1009, 'payload_too_large');
        return;
      }

      if (isBinary) {
        handleBinary(data);
      } else {
        const str = data.toString();
        if (!allowMessage(ws, 'json')) return;
        try {
          handleJSON(JSON.parse(str));
        } catch {
          // Ignore non-JSON legacy text frames.
        }
      }
    } catch (e) {
      console.error('Message handling error:', e.message);
      sendWsError(ws, 'internal', e.message);
    }
  });

  ws.on('close', () => {
    leaveCurrentRoom();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  function leaveCurrentRoom() {
    if (currentRoom && currentPlayerId !== null) {
      currentRoom.removePlayer(currentPlayerId);
      currentPlayerId = null;
      currentRoom = null;
    }
  }

  function handleBinary(raw) {
    const buffer = raw instanceof ArrayBuffer
      ? raw
      : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    if (buffer.byteLength < 1) return;

    const view = new DataView(buffer);
    const opcode = view.getUint8(0);
    if (!allowMessage(ws, opcode === OP.TRANSFORM_SNAPSHOT ? 'snapshot' : 'control')) return;

    switch (opcode) {
      case OP.JOIN_ROOM: {
        if (buffer.byteLength < 7) {
          sendWsError(ws, 'bad_join', 'Join packet is incomplete.');
          return;
        }
        const rawCode = String.fromCharCode(
          view.getUint8(1), view.getUint8(2), view.getUint8(3), view.getUint8(4)
        );
        const roomCode = normalizeRoomCode(rawCode) || generateUniqueCode();
        const vehicleType = view.getUint8(5);
        const nameLen = view.getUint8(6);
        if (buffer.byteLength < 7 + nameLen) {
          sendWsError(ws, 'bad_join', 'Join packet name is incomplete.');
          return;
        }
        const nameBytes = new Uint8Array(buffer, 7, nameLen);
        const name = sanitizeName(new TextDecoder().decode(nameBytes));
        joinRoom(roomCode, name, vehicleType);
        break;
      }

      case OP.PLAYER_READY: {
        const ready = view.byteLength > 1 && view.getUint8(1) === 1;
        if (currentRoom && currentPlayerId !== null) {
          currentRoom.setReady(currentPlayerId, ready);
        }
        break;
      }

      case OP.TRANSFORM_SNAPSHOT: {
        if (currentRoom && currentPlayerId !== null) {
          const snapshot = decodeSnapshot(buffer);
          currentRoom.handleSnapshot(currentPlayerId, snapshot);
        }
        break;
      }

      case OP.CHECKPOINT: {
        const cpIdx = view.byteLength > 1 ? view.getUint8(1) : 0;
        if (currentRoom && currentPlayerId !== null) {
          currentRoom.handleCheckpoint(currentPlayerId, cpIdx);
        }
        break;
      }

      case OP.PING: {
        const clientTime = view.byteLength >= 5 ? view.getUint32(1, true) : Date.now();
        const pong = encodePong(clientTime, Date.now());
        if (ws.readyState === WebSocket.OPEN) ws.send(pong);
        break;
      }

      default:
        sendWsError(ws, 'unknown_opcode', `Unknown opcode ${opcode}.`);
        break;
    }
  }

  function handleJSON(msg) {
    switch (msg.type) {
      case 'join': {
        const roomCode = normalizeRoomCode(msg.roomCode) || generateUniqueCode();
        joinRoom(roomCode, sanitizeName(msg.name || 'Player'), Number(msg.vehicleType) || 0);
        break;
      }
      case 'ready': {
        if (currentRoom && currentPlayerId !== null) {
          currentRoom.setReady(currentPlayerId, msg.ready !== false);
        }
        break;
      }
      case 'room_settings': {
        if (currentRoom && currentPlayerId !== null) {
          currentRoom.updateSettings(currentPlayerId, msg.settings || {});
        }
        break;
      }
      default:
        break;
    }
  }

  function joinRoom(roomCode, playerName, vehicleType) {
    leaveCurrentRoom();

    let room = rooms.get(roomCode);
    if (!room) {
      if (rooms.size >= CONFIG.maxRooms) {
        sendWsError(ws, 'server_full', 'Server has reached the room limit.');
        return;
      }
      room = new Room(roomCode, { maxPlayers: CONFIG.maxPlayersPerRoom });
      rooms.set(roomCode, room);
      console.log(`Room ${roomCode} created. Active rooms: ${rooms.size}`);
    }

    const pid = room.addPlayer(ws, playerName, vehicleType);
    if (pid !== null) {
      currentRoom = room;
      currentPlayerId = pid;
    }
  }
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, CONFIG.heartbeatMs);

const cleanup = setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.isStale(CONFIG.roomIdleMs)) {
      rooms.delete(code);
      console.log(`Room ${code} cleaned up (stale). Active rooms: ${rooms.size}`);
    }
  }
}, 60000);

httpServer.listen(CONFIG.port, CONFIG.host, () => {
  console.log('=== Street Racer Multiplayer Server ===');
  console.log(`Listening: http://${CONFIG.host === '0.0.0.0' ? 'localhost' : CONFIG.host}:${CONFIG.port}`);
  console.log(`WebSocket: ws://localhost:${CONFIG.port}`);
  if (CONFIG.publicUrl) console.log(`Public URL: ${CONFIG.publicUrl}`);
  console.log(`Health:    http://localhost:${CONFIG.port}/health`);
  console.log(`Rooms:     http://localhost:${CONFIG.port}/rooms`);
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  if (res.req?.method === 'HEAD') res.end();
  else res.end(body);
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function getPlayerCount() {
  let total = 0;
  for (const room of rooms.values()) total += room.getPlayerCount();
  return total;
}

function normalizeRoomCode(value) {
  const code = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  return code.length === 4 ? code : '';
}

function generateUniqueCode() {
  let code = _generateCode();
  let guard = 0;
  while (rooms.has(code) && guard < 100) {
    code = _generateCode();
    guard++;
  }
  return code;
}

function _generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function sanitizeName(value) {
  const name = String(value || 'Player').trim().slice(0, 16);
  return name || 'Player';
}

function readInt(name, fallback, min, max) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

function getPayloadSize(data) {
  if (Buffer.isBuffer(data)) return data.byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  return Buffer.byteLength(String(data));
}

function makeRateState() {
  const now = Date.now();
  return {
    windowStart: now,
    messages: 0,
    snapshotWindowStart: now,
    snapshots: 0,
    warnedAt: 0,
  };
}

function allowMessage(ws, kind) {
  const now = Date.now();
  const state = ws.rateState || (ws.rateState = makeRateState());

  if (now - state.windowStart >= 1000) {
    state.windowStart = now;
    state.messages = 0;
  }
  state.messages++;
  if (state.messages > CONFIG.maxMessagesPerSecond) {
    warnRateLimited(ws, 'rate_limited', 'Too many network messages.');
    return false;
  }

  if (kind === 'snapshot') {
    if (now - state.snapshotWindowStart >= 1000) {
      state.snapshotWindowStart = now;
      state.snapshots = 0;
    }
    state.snapshots++;
    if (state.snapshots > CONFIG.maxSnapshotsPerSecond) {
      return false;
    }
  }

  return true;
}

function warnRateLimited(ws, code, message) {
  const state = ws.rateState || (ws.rateState = makeRateState());
  const now = Date.now();
  if (now - state.warnedAt > 2000) {
    state.warnedAt = now;
    sendWsError(ws, code, message);
  }
}

function sendWsError(ws, code, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(encodeError(code, message));
  }
}

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down multiplayer server...`);
  clearInterval(heartbeat);
  clearInterval(cleanup);
  for (const ws of wss.clients) ws.close(1001, 'server_shutdown');
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
