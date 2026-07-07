/**
 * Smooth interpolation for remote vehicle positions and rotations.
 * Each remote player has a snapshot buffer. The render loop queries
 * interpolated state offset 100ms behind current time to absorb network jitter.
 */
export class InterpolationManager {
  constructor() {
    this.buffers = new Map();       // playerId -> SnapshotBuffer
    this.interpolationDelay = 0.100; // 100ms render delay
    this.maxBufferSize = 5;
  }

  /**
   * Feed a received snapshot into the buffer for a remote player.
   * @param {number} playerId
   * @param {object} snapshot - { position: vec3, rotation: quat, velocity: vec3, flags: number, timestamp: number, seq: number }
   */
  receiveSnapshot(playerId, snapshot) {
    let buf = this.buffers.get(playerId);
    if (!buf) {
      buf = new SnapshotBuffer(this.maxBufferSize);
      this.buffers.set(playerId, buf);
    }
    buf.push(snapshot);
  }

  /**
   * Get the interpolated state for a remote player at the given time.
   * @param {number} playerId
   * @param {number} currentTime - elapsed game time in seconds
   * @returns {object|null} - { position, rotation, velocity, flags } or null if no data
   */
  getInterpolatedState(playerId, currentTime) {
    const buf = this.buffers.get(playerId);
    if (!buf || buf.snapshots.length === 0) return null;

    const renderTime = currentTime - this.interpolationDelay;

    const snapshots = buf.snapshots;

    // If only one snapshot, use it directly
    if (snapshots.length === 1) {
      const s = snapshots[0];
      return {
        position: { x: s.position.x, y: s.position.y, z: s.position.z },
        rotation: { x: s.rotation.x, y: s.rotation.y, z: s.rotation.z, w: s.rotation.w },
        velocity: { x: s.velocity.x, y: s.velocity.y, z: s.velocity.z },
        flags: s.flags,
      };
    }

    // Find the two snapshots bracketing renderTime
    let a = snapshots[0];
    let b = snapshots[snapshots.length - 1];

    for (let i = 0; i < snapshots.length - 1; i++) {
      if (snapshots[i].timestamp <= renderTime && snapshots[i + 1].timestamp >= renderTime) {
        a = snapshots[i];
        b = snapshots[i + 1];
        break;
      }
    }

    // If renderTime is before the first snapshot, use the first
    if (renderTime <= a.timestamp) {
      return {
        position: { x: a.position.x, y: a.position.y, z: a.position.z },
        rotation: { x: a.rotation.x, y: a.rotation.y, z: a.rotation.z, w: a.rotation.w },
        velocity: { x: a.velocity.x, y: a.velocity.y, z: a.velocity.z },
        flags: a.flags,
      };
    }

    // If renderTime is after the last snapshot, use the last
    if (renderTime >= b.timestamp || a.timestamp === b.timestamp) {
      return {
        position: { x: b.position.x, y: b.position.y, z: b.position.z },
        rotation: { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z, w: b.rotation.w },
        velocity: { x: b.velocity.x, y: b.velocity.y, z: b.velocity.z },
        flags: b.flags,
      };
    }

    // Interpolate
    const range = b.timestamp - a.timestamp;
    const t = (renderTime - a.timestamp) / range;

    return {
      position: lerpV3(a.position, b.position, t),
      rotation: slerpQuat(a.rotation, b.rotation, t),
      velocity: lerpV3(a.velocity, b.velocity, t),
      flags: b.flags,
    };
  }

  removePlayer(playerId) {
    this.buffers.delete(playerId);
  }

  reset() {
    this.buffers.clear();
  }
}

class SnapshotBuffer {
  constructor(maxSize = 5) {
    this.maxSize = maxSize;
    this.snapshots = [];
    this.lastSeq = -1;
  }

  push(snapshot) {
    // Drop out-of-order or duplicate packets
    if (snapshot.seq !== undefined && snapshot.seq <= this.lastSeq) {
      return;
    }
    this.lastSeq = snapshot.seq;

    // Use serverTime if available; fall back to local time
    const ts = snapshot.serverTime !== undefined
      ? snapshot.serverTime / 1000
      : performance.now() / 1000;
    snapshot.timestamp = ts;

    this.snapshots.push(snapshot);

    // Maintain sorted order by timestamp
    this.snapshots.sort((a, b) => a.timestamp - b.timestamp);

    // Trim oldest
    while (this.snapshots.length > this.maxSize) {
      this.snapshots.shift();
    }
  }
}

function lerpV3(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function slerpQuat(qa, qb, t) {
  // Normalize inputs
  let ax = qa.x, ay = qa.y, az = qa.z, aw = qa.w;
  let bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;

  // Compute cosine
  let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;

  // If negative, flip one quaternion to take the shorter path
  if (cosHalfTheta < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }

  // If they are very close, use linear interpolation
  if (cosHalfTheta > 0.9995) {
    return {
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      z: az + (bz - az) * t,
      w: aw + (bw - aw) * t,
    };
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sin(halfTheta);
  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return {
    x: ax * ratioA + bx * ratioB,
    y: ay * ratioA + by * ratioB,
    z: az * ratioA + bz * ratioB,
    w: aw * ratioA + bw * ratioB,
  };
}
