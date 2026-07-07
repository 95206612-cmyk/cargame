import * as THREE from 'three';

const AI_GROUND_OFFSET = 0.03;

/**
 * AI civilian traffic system.
 *
 * Spawns NPC cars that drive around the track on a predefined loop.
 * Features:
 * - Waypoint-following with speed variation
 * - Basic collision avoidance between AI cars
 * - Procedural low-poly car meshes (cheaper than player car)
 * - Respawn on fall-off or stuck detection
 * - Density control — max active cars configurable
 */
export class AITraffic {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.cars = [];
    this.maxCars = 8;
    this.waypoints = [];          // Array of THREE.Vector3 for navigation
    this._carColors = [
      0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22,
      0x95a5a6, 0x34495e, 0xc0392b, 0x16a085,
    ];

    // Density config
    this._density = 'medium';
    this._densityCounts = { off: 0, low: 4, medium: 8, high: 14 };

    // LOD
    this._sleepDistance = 200;    // Distance beyond which AI cars sleep
    this._wakeDistance = 160;     // Hysteresis for re-awakening
    this._baseSleepDistance = this._sleepDistance;
    this._baseWakeDistance = this._wakeDistance;

    // Collision callback
    this.onPlayerCollision = null; // (aiCar, playerPos) => void
    this._groundSampler = null;
    this._roadInfoSampler = null;
  }

  /**
   * Set the navigation waypoints (typically track center-line samples).
   */
  setWaypoints(points) {
    this.waypoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  setGroundSampler(sampler) {
    this._groundSampler = typeof sampler === 'function' ? sampler : null;
  }

  setRoadInfoSampler(sampler) {
    this._roadInfoSampler = typeof sampler === 'function' ? sampler : null;
  }

  /**
   * Set traffic density.
   * @param {'off'|'low'|'medium'|'high'} level
   */
  setDensity(level) {
    this._density = level;
    this.maxCars = this._densityCounts[level] || 8;
    // Respawn with new count
    if (this.waypoints.length > 0) {
      this.spawnAll(this.maxCars);
    }
  }

  get density() {
    return this._density;
  }

  setLodDistanceScale(scale = 1) {
    const n = Number(scale);
    const value = Number.isFinite(n) ? Math.max(0.5, Math.min(2.0, n)) : 1;
    this._sleepDistance = this._baseSleepDistance * value;
    this._wakeDistance = this._baseWakeDistance * value;
  }

  /**
   * Spawn all AI cars at distributed positions along the track.
   * @param {number} [count=8] - Number of AI cars to spawn
   */
  spawnAll(count = 8) {
    this.clear();
    this.maxCars = Math.min(count, 12);

    if (this.waypoints.length < 10) {
      console.warn('[AITraffic] Not enough waypoints for AI spawning.');
      return;
    }

    const spacing = Math.floor(this.waypoints.length / this.maxCars);

    for (let i = 0; i < this.maxCars; i++) {
      const wpIndex = (i * spacing) % this.waypoints.length;
      const wp = this.waypoints[wpIndex];

      // Find next waypoint for initial facing direction
      const nextWp = this.waypoints[(wpIndex + 1) % this.waypoints.length];
      const yaw = Math.atan2(nextWp.x - wp.x, nextWp.z - wp.z);

      const car = this._createCar(wp, yaw, i);
      car.currentWaypoint = wpIndex;
      this.cars.push(car);
      this.scene.add(car.mesh);
    }
  }

  /**
   * Update all AI cars.
   * @param {number} delta
   * @param {{x:number, y:number, z:number}} playerPos - for avoidance
   */
  update(delta, playerPos) {
    for (const car of this.cars) {
      this._updateCar(car, delta, playerPos);
    }
  }

  // ==================== Car Creation ====================

  _createCar(position, yaw, index) {
    const mesh = this._buildMesh(index);
    const startPosition = position.clone();
    startPosition.y = this._sampleGroundY(startPosition, position.y) + AI_GROUND_OFFSET;

    const car = {
      mesh,
      position: startPosition.clone(),
      yaw,
      speed: 8 + Math.random() * 14,        // m/s (~30-80 km/h)
      currentWaypoint: 0,
      targetWaypoint: 1,
      waypointReachDist: 4,
      stuckTimer: 0,
      stuckThreshold: 5,
      lastPosition: startPosition.clone(),
      colorIndex: index,
      laneOffset: (Math.random() - 0.5) * 4, // Slight lane variation
    };

    mesh.position.copy(startPosition);
    mesh.rotation.y = yaw;

    return car;
  }

  _buildMesh(index) {
    const group = new THREE.Group();
    group.name = `ai-car-${index}`;

    const color = this._carColors[index % this._carColors.length];

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.5, 3.8);
    const chassisMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.3, metalness: 0.5,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.45;
    chassis.castShadow = true;
    group.add(chassis);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.35, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x222233, roughness: 0.1, metalness: 0.2,
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.8, -0.25);
    cabin.castShadow = true;
    group.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const wheelPositions = [
      [-1.0, 0.32, 1.3], [1.0, 0.32, 1.3],
      [-1.0, 0.32, -1.3], [1.0, 0.32, -1.3],
    ];
    for (const [wx, wy, wz] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      group.add(wheel);
    }

    return group;
  }

  // ==================== AI Logic ====================

  _updateCar(car, delta, playerPos) {
    if (!this.waypoints.length) return;

    const pos = car.mesh.position;

    // LOD: sleep distant cars
    if (playerPos) {
      const pv = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
      const distToPlayer = pos.distanceTo(pv);
      if (car._sleeping) {
        if (distToPlayer < this._wakeDistance) {
          car._sleeping = false;
          car.mesh.visible = true;
        } else {
          return; // Still sleeping
        }
      } else {
        if (distToPlayer > this._sleepDistance) {
          car._sleeping = true;
          car.mesh.visible = false;
          return;
        }
      }
    }

    // Find nearest waypoint and target the one ahead
    const nearest = this._nearestWaypointNearCar(car, pos);
    let nearestIdx = nearest.index;
    let nearestDist = nearest.distSq;
    const roadInfo = this._sampleRoadInfo(pos);
    if (roadInfo && Math.abs(this._progressDelta(roadInfo.index, car.currentWaypoint)) < 18) {
      nearestIdx = roadInfo.index;
      nearestDist = roadInfo.distSq ?? nearestDist;
    }

    car.currentWaypoint = this._advanceWaypoint(car.currentWaypoint, nearestIdx);

    // Target waypoint ahead by several indices (look-ahead)
    const lookAhead = 3 + Math.floor(car.speed / 5);
    const targetIdx = (car.currentWaypoint + lookAhead) % this.waypoints.length;
    const target = this.waypoints[targetIdx].clone();

    // Apply lane offset (perpendicular to path direction)
    if (car.laneOffset !== 0) {
      const prevWp = this.waypoints[(targetIdx - 1 + this.waypoints.length) % this.waypoints.length];
      const dir = new THREE.Vector3().subVectors(target, prevWp).normalize();
      const halfWidth = this._sampleRoadInfo(target)?.halfWidth || 6;
      const laneOffset = THREE.MathUtils.clamp(car.laneOffset, -halfWidth * 0.42, halfWidth * 0.42);
      target.x += -dir.z * laneOffset;
      target.z += dir.x * laneOffset;
    }

    // Steer toward target
    const desiredYaw = Math.atan2(target.x - pos.x, target.z - pos.z);
    let yawDiff = desiredYaw - car.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    const steerRate = 2.5;
    car.yaw += yawDiff * Math.min(delta * steerRate, 1);

    // Speed control: slow down in tight turns
    const turnSharpness = Math.abs(yawDiff);
    let targetSpeed = car.speed;
    if (turnSharpness > 0.5) {
      targetSpeed = car.speed * (1 - (turnSharpness - 0.5) * 0.6);
    }

    // Avoid player — push away on close contact
    if (playerPos) {
      const playerVec = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
      const distToPlayer = pos.distanceTo(playerVec);
      if (distToPlayer < 8) {
        targetSpeed *= Math.max(0.3, distToPlayer / 8);
        const awayAngle = Math.atan2(pos.x - playerVec.x, pos.z - playerVec.z);
        car.yaw += (awayAngle - car.yaw) * delta * 1.5 * (1 - distToPlayer / 8);

        // Collision push-back on very close contact
        if (distToPlayer < 2.5) {
          const pushStrength = (1 - distToPlayer / 2.5) * 2.0;
          const pushX = (pos.x - playerVec.x) / Math.max(distToPlayer, 0.01) * pushStrength * delta;
          const pushZ = (pos.z - playerVec.z) / Math.max(distToPlayer, 0.01) * pushStrength * delta;
          pos.x += pushX;
          pos.z += pushZ;
          car.mesh.position.x += pushX;
          car.mesh.position.z += pushZ;
          // Notify collision
          if (distToPlayer < 1.8 && this.onPlayerCollision) {
            this.onPlayerCollision(car, playerPos);
          }
        }
      }
    }

    // Avoid other AI cars
    for (const other of this.cars) {
      if (other === car || other._sleeping) continue;
      const dist = pos.distanceTo(other.mesh.position);
      if (dist < 5) {
        targetSpeed *= Math.max(0.4, dist / 5);
        const awayAngle = Math.atan2(pos.x - other.mesh.position.x, pos.z - other.mesh.position.z);
        car.yaw += (awayAngle - car.yaw) * delta * 1.0;
      }
    }

    // Move forward
    const currentSpeed = targetSpeed;
    pos.x += Math.sin(car.yaw) * currentSpeed * delta;
    pos.z += Math.cos(car.yaw) * currentSpeed * delta;

    this._nudgeBackOntoRoad(car, pos, delta);

    // Height: follow the continuous road surface instead of snapping to a waypoint.
    const nearWp = this.waypoints[car.currentWaypoint] || this.waypoints[nearestIdx];
    const groundY = this._sampleGroundY(pos, nearWp?.y ?? pos.y);
    const heightFollow = 1 - Math.exp(-Math.min(delta, 0.1) * 18);
    pos.y += (groundY + AI_GROUND_OFFSET - pos.y) * heightFollow;

    // Update mesh
    car.mesh.position.copy(pos);
    car.mesh.rotation.y = car.yaw;

    // Wheel spin visual
    const wheelAngularSpeed = currentSpeed / 0.32;
    for (let i = 0; i < 4; i++) {
      const wheel = car.mesh.children[i + 2];
      if (wheel) wheel.rotation.x += wheelAngularSpeed * delta;
    }

    // Stuck detection
    const movedDist = pos.distanceTo(car.lastPosition);
    if (movedDist < 0.3 * delta) {
      car.stuckTimer += delta;
      if (car.stuckTimer > car.stuckThreshold) {
        this._respawnCar(car);
      }
    } else {
      car.stuckTimer = Math.max(0, car.stuckTimer - delta * 2);
    }
    car.lastPosition.copy(pos);

    // Off-track detection
    const offRoadLimit = Math.max(28, ((roadInfo?.halfWidth || 6) + 18) ** 2);
    if (nearestDist > offRoadLimit) {
      this._respawnCar(car);
    }
  }

  _respawnCar(car) {
    const rp = this.waypoints[Math.floor(Math.random() * this.waypoints.length)];
    const groundY = this._sampleGroundY(rp, rp.y);
    car.mesh.position.set(rp.x, groundY + AI_GROUND_OFFSET, rp.z);
    car.lastPosition.copy(car.mesh.position);
    car.currentWaypoint = this._nearestWaypointIndex(rp);
    car.stuckTimer = 0;

    // Randomize speed slightly
    car.speed = 8 + Math.random() * 14;
  }

  // ==================== Public API ====================

  /**
   * Get all AI car positions for collision/rendering.
   */
  getCarStates() {
    return this.cars.map(c => ({
      position: c.mesh.position.clone(),
      yaw: c.yaw,
      speed: c.speed,
    }));
  }

  /**
   * Get AI car meshes for frustum culling / shadow casting.
   */
  getMeshes() {
    return this.cars.map(c => c.mesh);
  }

  clear() {
    for (const car of this.cars) {
      this.scene.remove(car.mesh);
      car.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    this.cars = [];
  }

  get count() {
    return this.cars.length;
  }

  _sampleGroundY(pos, fallbackY = 0) {
    if (!this._groundSampler) return fallbackY;
    try {
      const sample = this._groundSampler(pos);
      return Number.isFinite(sample?.y) ? sample.y : fallbackY;
    } catch {
      return fallbackY;
    }
  }

  _sampleRoadInfo(pos) {
    if (!this._roadInfoSampler) return null;
    try {
      return this._roadInfoSampler(pos);
    } catch {
      return null;
    }
  }

  _nearestWaypointNearCar(car, pos) {
    const count = this.waypoints.length;
    if (count === 0) return { index: 0, distSq: Infinity };
    const center = Math.max(0, Math.min(count - 1, Math.floor(car.currentWaypoint || 0)));
    const searchRadius = Math.min(count, 18);
    let bestIndex = center;
    let bestDist = Infinity;

    for (let step = -4; step <= searchRadius; step++) {
      const index = (center + step + count) % count;
      const d = this._distanceToWaypointSq(pos, index);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = index;
      }
    }

    return { index: bestIndex, distSq: bestDist };
  }

  _nearestWaypointIndex(pos) {
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.waypoints.length; i++) {
      const d = this._distanceToWaypointSq(pos, i);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  _distanceToWaypointSq(pos, index) {
    const wp = this.waypoints[index];
    if (!wp) return Infinity;
    const dx = pos.x - wp.x;
    const dz = pos.z - wp.z;
    return dx * dx + dz * dz;
  }

  _advanceWaypoint(current, nearest) {
    const count = this.waypoints.length;
    if (count <= 0) return 0;
    const forward = this._progressDelta(nearest, current);
    if (forward >= -3 && forward <= 16) return nearest;
    if (forward < -3) return current;
    return nearest;
  }

  _progressDelta(next, current) {
    const count = this.waypoints.length || 1;
    let delta = next - current;
    if (delta > count * 0.5) delta -= count;
    if (delta < -count * 0.5) delta += count;
    return delta;
  }

  _nudgeBackOntoRoad(car, pos, delta) {
    const info = this._sampleRoadInfo(pos);
    if (!info?.point) return;

    const halfWidth = info.halfWidth || 6;
    const maxLateral = halfWidth * 0.72;
    const lateral = Number(info.lateral) || 0;
    if (Math.abs(lateral) <= maxLateral) return;

    const right = info.right || new THREE.Vector3(Math.cos(info.yaw || car.yaw), 0, -Math.sin(info.yaw || car.yaw));
    const correction = (Math.abs(lateral) - maxLateral) * Math.sign(lateral);
    const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 5.5);
    pos.x -= right.x * correction * blend;
    pos.z -= right.z * correction * blend;

    const tangentYaw = info.yaw ?? car.yaw;
    let yawDiff = tangentYaw - car.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    car.yaw += yawDiff * blend * 0.45;
  }

  dispose() {
    this.clear();
  }
}
