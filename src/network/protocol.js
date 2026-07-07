// Binary message opcodes (mirrors server/server/src/protocol.js)
export const OP = {
  JOIN_ROOM:         0x01,
  JOIN_ACK:          0x02,
  PLAYER_JOINED:     0x03,
  PLAYER_LEFT:       0x04,
  PLAYER_READY:      0x05,
  READY_STATE:       0x06,
  MATCH_START:       0x07,
  COUNTDOWN:         0x08,
  RACE_START:        0x09,
  TRANSFORM_SNAPSHOT: 0x0A,
  TRANSFORM_BROADCAST: 0x0B,
  CHECKPOINT:        0x0C,
  LAP_COMPLETE:      0x0D,
  RANK_UPDATE:       0x0E,
  RACE_FINISH:       0x0F,
  PING:              0x10,
  PONG:              0x11,
  ERROR:             0xFF,
};

/**
 * Encode JOIN_ROOM message (binary)
 * [opcode:1][roomCode:4 ascii][vehicleType:1][nameLen:1][name...]
 */
export function encodeJoinRoom(roomCode, vehicleType, name) {
  const nameBytes = new TextEncoder().encode(name);
  const buf = new ArrayBuffer(7 + nameBytes.length);
  const view = new DataView(buf);
  view.setUint8(0, OP.JOIN_ROOM);
  const code = roomCode.padEnd(4, 'X').slice(0, 4).toUpperCase();
  for (let i = 0; i < 4; i++) view.setUint8(1 + i, code.charCodeAt(i));
  view.setUint8(5, vehicleType & 0xFF);
  view.setUint8(6, nameBytes.length);
  new Uint8Array(buf).set(nameBytes, 7);
  return buf;
}

/**
 * Encode PLAYER_READY message (binary)
 * [opcode:1][ready:1]
 */
export function encodeReady(ready) {
  const buf = new ArrayBuffer(2);
  const view = new DataView(buf);
  view.setUint8(0, OP.PLAYER_READY);
  view.setUint8(1, ready ? 1 : 0);
  return buf;
}

/**
 * Encode TRANSFORM_SNAPSHOT (48 bytes)
 * [opcode:1][timestamp:4][pos:12][rot:16][vel:12][flags:1][seq:2]
 */
export function encodeSnapshot(position, rotation, velocity, flags, seq) {
  const buf = new ArrayBuffer(48);
  const view = new DataView(buf);
  let off = 0;
  view.setUint8(off, OP.TRANSFORM_SNAPSHOT); off += 1;
  view.setUint32(off, Date.now() % 0xFFFFFFFF, true); off += 4;
  view.setFloat32(off, position.x, true); off += 4;
  view.setFloat32(off, position.y, true); off += 4;
  view.setFloat32(off, position.z, true); off += 4;
  view.setFloat32(off, rotation.x, true); off += 4;
  view.setFloat32(off, rotation.y, true); off += 4;
  view.setFloat32(off, rotation.z, true); off += 4;
  view.setFloat32(off, rotation.w, true); off += 4;
  view.setFloat32(off, velocity.x, true); off += 4;
  view.setFloat32(off, velocity.y, true); off += 4;
  view.setFloat32(off, velocity.z, true); off += 4;
  view.setUint8(off, flags & 0xFF); off += 1;
  view.setUint16(off, seq & 0xFFFF, true);
  return buf;
}

/**
 * Encode CHECKPOINT message (binary)
 * [opcode:1][checkpointIndex:1]
 */
export function encodeCheckpoint(index) {
  const buf = new ArrayBuffer(2);
  const view = new DataView(buf);
  view.setUint8(0, OP.CHECKPOINT);
  view.setUint8(1, index & 0xFF);
  return buf;
}

/**
 * Encode PING message (binary)
 * [opcode:1][clientTime:4]
 */
export function encodePing(clientTime) {
  const buf = new ArrayBuffer(5);
  const view = new DataView(buf);
  view.setUint8(0, OP.PING);
  view.setUint32(1, clientTime, true);
  return buf;
}

/**
 * Decode TRANSFORM_BROADCAST from server
 * Returns { serverTime, players: [{ playerId, position, rotation, velocity, flags, rank }] }
 */
export function decodeBroadcast(buffer) {
  const view = new DataView(buffer);
  let off = 1; // skip opcode
  const count = view.getUint8(off); off += 1;
  const serverTime = view.getUint32(off, true); off += 4;

  const players = [];
  for (let i = 0; i < count; i++) {
    const playerId = view.getUint8(off); off += 1;
    const position = {
      x: view.getFloat32(off, true),
      y: view.getFloat32(off + 4, true),
      z: view.getFloat32(off + 8, true),
    };
    off += 12;
    const rotation = {
      x: view.getFloat32(off, true),
      y: view.getFloat32(off + 4, true),
      z: view.getFloat32(off + 8, true),
      w: view.getFloat32(off + 12, true),
    };
    off += 16;
    const velocity = {
      x: view.getFloat32(off, true),
      y: view.getFloat32(off + 4, true),
      z: view.getFloat32(off + 8, true),
    };
    off += 12;
    const flags = view.getUint8(off); off += 1;
    const rank = view.getUint8(off); off += 1;
    players.push({ playerId, position, rotation, velocity, flags, rank, serverTime });
  }

  return { serverTime, players };
}

/**
 * Decode RANK_UPDATE from server
 * Returns [{ playerId, rank }]
 */
export function decodeRankUpdate(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint8(1);
  const ranks = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    ranks.push({
      playerId: view.getUint8(off),
      rank: view.getUint8(off + 1),
    });
    off += 2;
  }
  return ranks;
}

/**
 * Decode PONG from server
 * Returns { clientTime, serverTime }
 */
export function decodePong(buffer) {
  const view = new DataView(buffer);
  return {
    clientTime: view.getUint32(1, true),
    serverTime: view.getUint32(5, true),
  };
}

/**
 * Decode ERROR from server (binary)
 * Returns { code, message }
 */
export function decodeError(buffer) {
  const view = new DataView(buffer);
  let off = 1;
  const codeLen = view.getUint8(off); off += 1;
  const code = new TextDecoder().decode(new Uint8Array(buffer, off, codeLen)); off += codeLen;
  const msgLen = view.getUint16(off, true); off += 2;
  const message = new TextDecoder().decode(new Uint8Array(buffer, off, msgLen));
  return { code, message };
}
