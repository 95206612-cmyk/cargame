import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from '../server/node_modules/ws/wrapper.mjs';

const PORT = Number(process.env.NETWORK_TEST_PORT || 18080);
const SERVER_URL = `ws://127.0.0.1:${PORT}`;
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;
const ROOM_CODE = 'TST1';

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: new URL('../server/', import.meta.url),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ROOM_IDLE_MS: '30000',
    MAX_ROOMS: '8',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

try {
  await waitForHealth();
  const health = await fetchJson(HEALTH_URL);
  assert(health.ok === true, 'health endpoint should return ok');

  const host = await connectClient('Host', 0);
  const guest = await connectClient('Guest', 1);

  host.send(JSON.stringify({ type: 'join', roomCode: ROOM_CODE, name: 'Host', vehicleType: 0 }));
  const hostAck = await host.waitFor('join_ack');
  assert(hostAck.roomId === ROOM_CODE, 'host should join requested room');
  assert(hostAck.playerId === 1, 'first player should be host');

  guest.send(JSON.stringify({ type: 'join', roomCode: ROOM_CODE, name: 'Guest', vehicleType: 1 }));
  const guestAck = await guest.waitFor('join_ack');
  assert(guestAck.roomId === ROOM_CODE, 'guest should join same room');
  assert(guestAck.playerId === 2, 'second player should get playerId 2');
  const joined = await host.waitFor('player_joined');
  assert(joined.player.name === 'Guest', 'host should receive player_joined');

  const settings = { mode: 'item', trackId: 'mountain_pass', laps: 2, maxPlayers: 4, itemMode: true, collisions: false };
  host.send(JSON.stringify({ type: 'room_settings', settings }));
  const guestSettings = await guest.waitFor('room_settings');
  assert(guestSettings.settings.trackId === 'mountain_pass', 'room settings should broadcast');
  assert(guestSettings.settings.itemMode === true, 'item mode should broadcast');

  const rooms = await fetchJson(`http://127.0.0.1:${PORT}/rooms`);
  assert(rooms.rooms.some(room => room.code === ROOM_CODE && room.playerCount === 2), 'rooms endpoint should list active room');

  host.send(JSON.stringify({ type: 'ready', ready: true }));
  guest.send(JSON.stringify({ type: 'ready', ready: true }));
  const hostMatch = await host.waitFor('match_start', 2500);
  const guestCountdown = await guest.waitFor('countdown', 2500);
  assert(hostMatch.type === 'match_start', 'host should receive match_start');
  assert(guestCountdown.seconds === 3, 'guest should receive countdown');

  host.close();
  guest.close();
  console.log('Network integration test passed.');
} finally {
  server.kill('SIGTERM');
  await waitForExit(server, 3000);
}

function connectClient(label) {
  const ws = new WebSocket(SERVER_URL);
  const queue = [];
  const waiters = [];

  ws.on('message', data => {
    const text = decodeMessageText(data).trim();
    if (!text.startsWith('{')) return;
    const msg = JSON.parse(text);
    queue.push(msg);
    flush();
  });

  ws.waitFor = (type, timeoutMs = 2000) => new Promise((resolve, reject) => {
    const existingIndex = queue.findIndex(msg => msg.type === type);
    if (existingIndex >= 0) {
      resolve(queue.splice(existingIndex, 1)[0]);
      return;
    }
    const timer = setTimeout(() => {
      const index = waiters.findIndex(item => item.resolve === resolve);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error(`${label} timed out waiting for ${type}. Queue=${JSON.stringify(queue)} ServerLog=${serverLog}`));
    }, timeoutMs);
    waiters.push({ type, resolve, reject, timer });
  });

  function flush() {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const waiter = waiters[i];
      const msgIndex = queue.findIndex(msg => msg.type === waiter.type);
      if (msgIndex >= 0) {
        const [msg] = queue.splice(msgIndex, 1);
        clearTimeout(waiter.timer);
        waiters.splice(i, 1);
        waiter.resolve(msg);
      }
    }
  }

  return once(ws, 'open').then(() => ws);
}

function decodeMessageText(data) {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  return '';
}

async function waitForHealth(timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early with code ${server.exitCode}\n${serverLog}`);
    }
    try {
      const health = await fetchJson(HEALTH_URL);
      if (health.ok) return;
    } catch {
      // Server is still booting.
    }
    await sleep(100);
  }
  throw new Error(`server did not become healthy\n${serverLog}`);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await Promise.race([
    once(child, 'exit'),
    sleep(timeoutMs).then(() => child.kill('SIGKILL')),
  ]);
}

