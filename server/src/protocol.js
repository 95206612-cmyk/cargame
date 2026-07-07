// Binary message opcodes
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
 * Decode TRANSFORM_SNAPSHOT from client (48 bytes)
 * [opcode:1][timestamp:4][pos:12][rot:16][vel:12][flags:1][seq:2]
 */
export function decodeSnapshot(buffer) {
  const view = new DataView(buffer);
  let off = 1;
  const timestamp = view.getUint32(off, true); off += 4;
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
  const seq = view.getUint16(off, true);
  return { timestamp, position, rotation, velocity, flags, seq };
}

/**
 * Encode TRANSFORM_BROADCAST to all clients
 * [opcode:1][count:1][serverTime:4] + N*[playerId:1][pos:12][rot:16][vel:12][flags:1][rank:1]
 * Per-player block = 43 bytes
 */
export function encodeBroadcast(players, serverTime) {
  const count = players.length;
  const buf = new ArrayBuffer(6 + count * 43);
  const view = new DataView(buf);
  view.setUint8(0, OP.TRANSFORM_BROADCAST);
  view.setUint8(1, count);
  view.setUint32(2, serverTime, true);
  let off = 6;
  for (const p of players) {
    const s = p.lastSnapshot;
    view.setUint8(off, p.id); off += 1;
    if (s) {
      view.setFloat32(off, s.position.x, true);
      view.setFloat32(off + 4, s.position.y, true);
      view.setFloat32(off + 8, s.position.z, true);
      off += 12;
      view.setFloat32(off, s.rotation.x, true);
      view.setFloat32(off + 4, s.rotation.y, true);
      view.setFloat32(off + 8, s.rotation.z, true);
      view.setFloat32(off + 12, s.rotation.w, true);
      off += 16;
      view.setFloat32(off, s.velocity.x, true);
      view.setFloat32(off + 4, s.velocity.y, true);
      view.setFloat32(off + 8, s.velocity.z, true);
      off += 12;
      view.setUint8(off, s.flags); off += 1;
    } else {
      off += 42; // skip all fields except rank
    }
    view.setUint8(off, p.rank); off += 1;
  }
  return buf;
}

/**
 * Encode RANK_UPDATE
 * [opcode:1][count:1] + N*[playerId:1][rank:1]
 */
export function encodeRankUpdate(players) {
  const count = players.length;
  const buf = new ArrayBuffer(2 + count * 2);
  const view = new DataView(buf);
  view.setUint8(0, OP.RANK_UPDATE);
  view.setUint8(1, count);
  let off = 2;
  for (const p of players) {
    view.setUint8(off, p.id); off += 1;
    view.setUint8(off, p.rank); off += 1;
  }
  return buf;
}

/**
 * Encode RACE_FINISH
 * [opcode:1][count:1] + N*[playerId:1][rank:1][totalTime:8]
 */
export function encodeRaceFinish(players) {
  const count = players.length;
  const buf = new ArrayBuffer(2 + count * 10);
  const view = new DataView(buf);
  view.setUint8(0, OP.RACE_FINISH);
  view.setUint8(1, count);
  let off = 2;
  for (const p of players) {
    view.setUint8(off, p.id); off += 1;
    view.setUint8(off, p.rank); off += 1;
    view.setFloat64(off, p.totalTime, true); off += 8;
  }
  return buf;
}

/**
 * Encode PONG response
 * [opcode:1][clientTime:4][serverTime:4]
 */
export function encodePong(clientTime, serverTime) {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, OP.PONG);
  view.setUint32(1, clientTime, true);
  view.setUint32(5, serverTime, true);
  return buf;
}

/**
 * Encode ERROR message
 * [opcode:1][codeLen:1][code...][msgLen:2][msg...]
 */
export function encodeError(code, message) {
  const codeBytes = new TextEncoder().encode(code);
  const msgBytes = new TextEncoder().encode(message);
  const buf = new ArrayBuffer(2 + codeBytes.length + 2 + msgBytes.length);
  const view = new DataView(buf);
  let off = 0;
  view.setUint8(off, OP.ERROR); off += 1;
  view.setUint8(off, codeBytes.length); off += 1;
  new Uint8Array(buf).set(codeBytes, off); off += codeBytes.length;
  view.setUint16(off, msgBytes.length, true); off += 2;
  new Uint8Array(buf).set(msgBytes, off);
  return buf;
}
