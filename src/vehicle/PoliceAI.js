import * as THREE from 'three';

/**
 * Police pursuit AI system.
 *
 * Manages police car spawning, pursuit behaviors (chase/intercept/ram/pincer),
 * roadblock and spike strip placement. Star level 1-5 controls police count
 * and aggression. All police use simplified kinematics — no Ammo.js bodies.
 */
export class PoliceAI {
  constructor(scene) {
    this.scene = scene;
    this.cops = [];               // Active police cars
    this.roadblocks = [];         // Active roadblock entities
    this.spikeStrips = [];        // Active spike strip entities

    // Config
    this.maxCopCount = [0, 1, 2, 4, 6, 8]; // indexed by star level 0-5
    this.detectionRange = 120;    // Max distance for pursuit engagement
    this.chaseSpeedBase = 22;     // m/s base chase speed
    this.ramSpeed = 28;           // Ramming speed
    this.interceptLead = 40;      // Meters ahead for intercept targeting
    this._sleepDistance = 240;
    this._wakeDistance = 190;
    this._baseSleepDistance = this._sleepDistance;
    this._baseWakeDistance = this._wakeDistance;

    // Spawn management
    this._spawnCooldown = 0;
    this._spawnInterval = [0, 8, 5, 3, 2, 1.5]; // seconds between spawns per star

    // Waypoints from track
    this.waypoints = [];
    this._groundSampler = null;

    // Cop car mesh templates
    this._copColors = [0xffffff, 0x111111, 0x1a1a3e];
  }

  /**
   * Set navigation waypoints (track center-line).
   */
  setWaypoints(points) {
    this.waypoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  setGroundSampler(sampler) {
    this._groundSampler = typeof sampler === 'function' ? sampler : null;
  }

  setLodDistanceScale(scale = 1) {
    const n = Number(scale);
    const value = Number.isFinite(n) ? Math.max(0.5, Math.min(2.0, n)) : 1;
    this._sleepDistance = this._baseSleepDistance * value;
    this._wakeDistance = this._baseWakeDistance * value;
  }

  /**
   * Current star level. Set externally by PursuitManager.
   */
  set starLevel(level) {
    this._starLevel = Math.max(0, Math.min(5, level));
  }

  get starLevel() {
    return this._starLevel || 0;
  }

  /**
   * Update all police units.
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {number} playerSpeed - m/s
   * @param {number} playerYaw
   */
  update(delta, playerPos, playerSpeed, playerYaw) {
    if (this.starLevel === 0) return;

    const targetCount = this.maxCopCount[this.starLevel];

    // Spawn new cops if needed
    this._spawnCooldown -= delta;
    if (this._spawnCooldown <= 0 && this.cops.length < targetCount) {
      this._spawnCop(playerPos);
      this._spawnCooldown = this._spawnInterval[this.starLevel];
    }

    // Remove excess cops (star level dropped)
    while (this.cops.length > targetCount) {
      this._despawnCop(this.cops[this.cops.length - 1]);
    }

    // Update each cop
    for (const cop of this.cops) {
      this._updateCop(cop, delta, playerPos, playerSpeed, playerYaw);
    }

    // Update roadblocks
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      rb.life -= delta;
      if (rb.life <= 0) {
        this._removeRoadblock(rb);
        this.roadblocks.splice(i, 1);
      }
    }

    // Update spike strips
    for (let i = this.spikeStrips.length - 1; i >= 0; i--) {
      const ss = this.spikeStrips[i];
      ss.life -= delta;
      if (ss.life <= 0) {
        this._removeSpikeStrip(ss);
        this.spikeStrips.splice(i, 1);
      }
    }
  }

  // ==================== Spawning ====================

  _spawnCop(playerPos) {
    // Spawn from behind the player or from a random waypoint out of sight
    let spawnPos;
    const playerVec = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);

    if (this.waypoints.length > 0) {
      // Find a waypoint 200-300m behind the player's direction
      let behindIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < this.waypoints.length; i++) {
        const d = playerVec.distanceTo(this.waypoints[i]);
        if (d > 150 && d < 350 && d < minDist) {
          minDist = d;
          behindIdx = i;
        }
      }
      if (minDist === Infinity) {
        behindIdx = Math.floor(Math.random() * this.waypoints.length);
      }
      const wp = this.waypoints[behindIdx];
      spawnPos = new THREE.Vector3(wp.x + (Math.random() - 0.5) * 20, wp.y, wp.z + (Math.random() - 0.5) * 20);
      spawnPos.y = this._sampleGroundY(spawnPos, wp.y) + 0.4;
    } else {
      spawnPos = new THREE.Vector3(
        playerPos.x + (Math.random() - 0.5) * 200,
        playerPos.y,
        playerPos.z + (Math.random() - 0.5) * 200,
      );
    }

    const mesh = this._buildCopMesh();
    mesh.position.copy(spawnPos);

    const cop = {
      mesh,
      position: spawnPos.clone(),
      yaw: Math.random() * Math.PI * 2,
      speed: this.chaseSpeedBase + Math.random() * 5,
      behavior: 'chase',       // chase | intercept | ram | pincer
      behaviorTimer: 0,
      behaviorDuration: 3 + Math.random() * 4,
      stuckTimer: 0,
      lastPosition: spawnPos.clone(),
      ramCooldown: 0,
      sidePreference: Math.random() > 0.5 ? 1 : -1, // for pincer
    };

    this.scene.add(mesh);
    this.cops.push(cop);
  }

  _despawnCop(cop) {
    const idx = this.cops.indexOf(cop);
    if (idx !== -1) this.cops.splice(idx, 1);
    this.scene.remove(cop.mesh);
    this._disposeMesh(cop.mesh);
  }

  _buildCopMesh() {
    const group = new THREE.Group();
    group.name = 'police-car';

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(1.9, 0.5, 4.0);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x111133, roughness: 0.3, metalness: 0.5 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.45;
    chassis.castShadow = true;
    group.add(chassis);

    // White doors
    const doorGeo = new THREE.BoxGeometry(1.85, 0.35, 2.4);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 });
    const doors = new THREE.Mesh(doorGeo, doorMat);
    doors.position.set(0, 0.48, 0);
    group.add(doors);

    // Light bar on roof
    const barGeo = new THREE.BoxGeometry(1.6, 0.1, 0.4);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.2, emissive: 0xff0000, emissiveIntensity: 0.8 });
    const lightBar = new THREE.Mesh(barGeo, barMat);
    lightBar.position.set(0, 0.95, -0.3);
    group.add(lightBar);

    // Blue strobe
    const strobeGeo = new THREE.SphereGeometry(0.12, 4, 4);
    const strobeMat = new THREE.MeshStandardMaterial({ color: 0x0033ff, roughness: 0.1, emissive: 0x0033ff, emissiveIntensity: 1.2 });
    const strobeL = new THREE.Mesh(strobeGeo, strobeMat);
    strobeL.position.set(-0.7, 1.0, -0.3);
    group.add(strobeL);
    const strobeR = new THREE.Mesh(strobeGeo, strobeMat);
    strobeR.position.set(0.7, 1.0, -0.3);
    group.add(strobeR);

    // Red strobe
    const redStrobeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.1, emissive: 0xff0000, emissiveIntensity: 1.2 });
    const redStrobeL = new THREE.Mesh(strobeGeo, redStrobeMat);
    redStrobeL.position.set(-0.7, 1.0, -0.05);
    group.add(redStrobeL);
    const redStrobeR = new THREE.Mesh(strobeGeo, redStrobeMat);
    redStrobeR.position.set(0.7, 1.0, -0.05);
    group.add(redStrobeR);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.35, 1.7);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.1, metalness: 0.2 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.82, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // Push bar (front bull bar)
    const pushBarGeo = new THREE.BoxGeometry(2.0, 0.12, 0.15);
    const pushBarMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.2, metalness: 0.9 });
    const pushBar = new THREE.Mesh(pushBarGeo, pushBarMat);
    pushBar.position.set(0, 0.3, 2.05);
    group.add(pushBar);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const wheelPositions = [
      [-1.05, 0.34, 1.5], [1.05, 0.34, 1.5],
      [-1.05, 0.34, -1.5], [1.05, 0.34, -1.5],
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

  // ==================== Cop AI ====================

  _updateCop(cop, delta, playerPos, playerSpeed, playerYaw) {
    const playerVec = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    const distToPlayer = cop.position.distanceTo(playerVec);

    if (distToPlayer <= this.detectionRange * 1.5) {
      if (cop._sleeping) {
        if (distToPlayer < this._wakeDistance) {
          cop._sleeping = false;
          cop.mesh.visible = true;
        } else {
          return;
        }
      } else if (distToPlayer > this._sleepDistance) {
        cop._sleeping = true;
        cop.mesh.visible = false;
        return;
      }
    }

    // Too far from player → teleport closer
    if (distToPlayer > this.detectionRange * 1.5) {
      cop._sleeping = false;
      cop.mesh.visible = true;
      this._teleportCloser(cop, playerVec);
      return;
    }

    // Behavior switching
    cop.behaviorTimer -= delta;
    if (cop.behaviorTimer <= 0) {
      cop.behavior = this._pickBehavior(cop, distToPlayer);
      cop.behaviorTimer = 2 + Math.random() * 4;
    }

    // Execute behavior
    let targetPos, targetSpeed;
    switch (cop.behavior) {
      case 'intercept':
        ({ targetPos, targetSpeed } = this._steerIntercept(cop, playerVec, playerSpeed, playerYaw));
        break;
      case 'ram':
        ({ targetPos, targetSpeed } = this._steerRam(cop, playerVec, playerSpeed, delta));
        break;
      case 'pincer':
        ({ targetPos, targetSpeed } = this._steerPincer(cop, playerVec, playerSpeed, playerYaw));
        break;
      case 'block':
        ({ targetPos, targetSpeed } = this._steerBlock(cop, playerVec, playerYaw));
        break;
      case 'chase':
      default:
        ({ targetPos, targetSpeed } = this._steerChase(cop, playerVec));
        break;
    }

    // Steer toward target
    const desiredYaw = Math.atan2(targetPos.x - cop.position.x, targetPos.z - cop.position.z);
    let yawDiff = desiredYaw - cop.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    const steerRate = this.starLevel >= 4 ? 3.5 : 2.8;
    cop.yaw += yawDiff * Math.min(delta * steerRate, 1);

    // Speed management
    const turnSharpness = Math.abs(yawDiff);
    let currentSpeed = targetSpeed;
    if (turnSharpness > 0.6) {
      currentSpeed *= 0.7;
    }

    // Avoid other cops
    for (const other of this.cops) {
      if (other === cop) continue;
      const dist = cop.position.distanceTo(other.position);
      if (dist < 4) {
        currentSpeed *= 0.6;
        const awayAngle = Math.atan2(cop.position.x - other.position.x, cop.position.z - other.position.z);
        cop.yaw += (awayAngle - cop.yaw) * delta * 1.2;
      }
    }

    // Move
    cop.position.x += Math.sin(cop.yaw) * currentSpeed * delta;
    cop.position.z += Math.cos(cop.yaw) * currentSpeed * delta;
    cop.speed = currentSpeed;

    // Follow the continuous road surface instead of snapping to the nearest waypoint.
    if (this.waypoints.length > 0) {
      let nearestY = cop.position.y;
      let nearestDist = Infinity;
      for (const wp of this.waypoints) {
        const d = Math.abs(cop.position.x - wp.x) + Math.abs(cop.position.z - wp.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestY = wp.y;
        }
      }
      const groundY = this._sampleGroundY(cop.position, nearestY);
      const heightFollow = 1 - Math.exp(-Math.min(delta, 0.1) * 18);
      cop.position.y += (groundY + 0.4 - cop.position.y) * heightFollow;
    }

    // Update mesh
    cop.mesh.position.copy(cop.position);
    cop.mesh.rotation.y = cop.yaw;

    // Wheel spin
    const wheelSpinRate = currentSpeed / 0.34;
    for (let i = 2; i < 6; i++) {
      const wheel = cop.mesh.children[i];
      if (wheel) wheel.rotation.x += wheelSpinRate * delta;
    }

    // Strobe blink
    const blinkVal = Math.sin(this._elapsed * 12 + cop.position.x) * 0.5 + 0.5;
    for (const child of cop.mesh.children) {
      if (child.name === 'strobe' || (child.material && child.material.emissiveIntensity > 0.8)) {
        child.material.emissiveIntensity = 0.3 + blinkVal * 1.2;
      }
    }

    // Stuck detection
    const movedDist = cop.position.distanceTo(cop.lastPosition);
    if (movedDist < 0.2 * delta) {
      cop.stuckTimer += delta;
      if (cop.stuckTimer > 4) {
        this._teleportCloser(cop, playerVec);
        cop.stuckTimer = 0;
      }
    } else {
      cop.stuckTimer = Math.max(0, cop.stuckTimer - delta * 2);
    }
    cop.lastPosition.copy(cop.position);

    // Ram cooldown
    cop.ramCooldown = Math.max(0, cop.ramCooldown - delta);
  }

  _pickBehavior(cop, distToPlayer) {
    if (this.starLevel >= 5) {
      const roll = Math.random();
      if (roll < 0.2) return 'pincer';
      if (roll < 0.45) return 'ram';
      if (roll < 0.7) return 'intercept';
      return 'chase';
    }
    if (this.starLevel >= 4) {
      const roll = Math.random();
      if (roll < 0.3) return 'ram';
      if (roll < 0.55) return 'intercept';
      return 'chase';
    }
    if (this.starLevel >= 3) {
      const roll = Math.random();
      if (roll < 0.25) return 'intercept';
      if (roll < 0.15) return 'block';
      return 'chase';
    }
    // 1-2 stars: mostly chase
    return Math.random() < 0.15 ? 'intercept' : 'chase';
  }

  // ==================== Steering Behaviors ====================

  _steerChase(cop, playerVec) {
    return {
      targetPos: playerVec,
      targetSpeed: this.chaseSpeedBase + this.starLevel * 1.5,
    };
  }

  _steerIntercept(cop, playerVec, playerSpeed, playerYaw) {
    // Predict player position ahead
    const leadTime = this.interceptLead / Math.max(playerSpeed, 5);
    const predictX = playerVec.x + Math.sin(playerYaw) * playerSpeed * leadTime;
    const predictZ = playerVec.z + Math.cos(playerYaw) * playerSpeed * leadTime;
    return {
      targetPos: new THREE.Vector3(predictX, playerVec.y, predictZ),
      targetSpeed: this.chaseSpeedBase + this.starLevel * 2,
    };
  }

  _steerRam(cop, playerVec, playerSpeed, delta) {
    // Charge directly at player, higher speed
    const behind = new THREE.Vector3(
      playerVec.x - Math.sin(cop.yaw) * 3,
      playerVec.y,
      playerVec.z - Math.cos(cop.yaw) * 3,
    );
    return {
      targetPos: playerVec, // Aim directly at player
      targetSpeed: this.ramSpeed + this.starLevel,
    };
  }

  _steerPincer(cop, playerVec, playerSpeed, playerYaw) {
    // Approach from the side
    const sideOffset = cop.sidePreference * 12;
    const sideX = Math.cos(playerYaw) * sideOffset;
    const sideZ = -Math.sin(playerYaw) * sideOffset;
    return {
      targetPos: new THREE.Vector3(playerVec.x + sideX, playerVec.y, playerVec.z + sideZ),
      targetSpeed: this.chaseSpeedBase + this.starLevel * 2,
    };
  }

  _steerBlock(cop, playerVec, playerYaw) {
    // Get 30m ahead of player and slow down
    const aheadX = playerVec.x + Math.sin(playerYaw) * 30;
    const aheadZ = playerVec.z + Math.cos(playerYaw) * 30;
    return {
      targetPos: new THREE.Vector3(aheadX, playerVec.y, aheadZ),
      targetSpeed: 8, // Slow to block
    };
  }

  _teleportCloser(cop, playerVec) {
    // Teleport to a position behind the player
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 80;
    cop.position.set(
      playerVec.x + Math.cos(angle) * dist,
      playerVec.y + 0.4,
      playerVec.z + Math.sin(angle) * dist,
    );
    cop.lastPosition.copy(cop.position);
    cop.stuckTimer = 0;
  }

  // ==================== Roadblocks & Spike Strips ====================

  /**
   * Place a roadblock ahead of the player.
   * @returns {Object|null} roadblock data (position, radius)
   */
  placeRoadblock(playerPos, playerYaw) {
    if (this.starLevel < 3) return null;
    if (this.roadblocks.length >= this.starLevel) return null;

    const aheadDist = 50 + Math.random() * 40;
    const pos = new THREE.Vector3(
      playerPos.x + Math.sin(playerYaw) * aheadDist,
      playerPos.y + 0.2,
      playerPos.z + Math.cos(playerYaw) * aheadDist,
    );

    // Visual: barrier boxes
    const blockGroup = new THREE.Group();
    blockGroup.name = 'roadblock';
    const barGeo = new THREE.BoxGeometry(2.5, 0.5, 0.8);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.5 });
    for (let x = -3; x <= 3; x += 1.5) {
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.set(x, 0.25, 0);
      bar.castShadow = true;
      blockGroup.add(bar);
    }

    // Blinking lights
    const lightGeo = new THREE.SphereGeometry(0.15, 4, 4);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.1, emissive: 0xffaa00, emissiveIntensity: 1.5 });
    for (const lx of [-3.5, 3.5]) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(lx, 0.6, 0);
      blockGroup.add(light);
    }

    blockGroup.position.copy(pos);
    blockGroup.rotation.y = playerYaw;
    this.scene.add(blockGroup);

    const rb = {
      mesh: blockGroup,
      position: pos,
      yaw: playerYaw,
      life: 20, // seconds
      radius: 4.5,
    };
    this.roadblocks.push(rb);
    return rb;
  }

  /**
   * Place spike strips ahead of the player.
   */
  placeSpikeStrip(playerPos, playerYaw) {
    if (this.starLevel < 4) return null;
    if (this.spikeStrips.length >= 2) return null;

    const aheadDist = 40 + Math.random() * 30;
    const pos = new THREE.Vector3(
      playerPos.x + Math.sin(playerYaw) * aheadDist,
      playerPos.y + 0.05,
      playerPos.z + Math.cos(playerYaw) * aheadDist,
    );

    // Visual: flat strip with spikes
    const stripGroup = new THREE.Group();
    stripGroup.name = 'spike-strip';
    const stripGeo = new THREE.BoxGeometry(6, 0.03, 0.3);
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.y = 0.02;
    stripGroup.add(strip);

    // Spikes
    const spikeGeo = new THREE.ConeGeometry(0.04, 0.12, 4);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9 });
    for (let x = -2.5; x <= 2.5; x += 0.5) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(x, 0.06, 0);
      stripGroup.add(spike);
    }

    stripGroup.position.copy(pos);
    stripGroup.rotation.y = playerYaw;
    this.scene.add(stripGroup);

    const ss = {
      mesh: stripGroup,
      position: pos,
      yaw: playerYaw,
      life: 15,
      radius: 3.5,
      active: true,
    };
    this.spikeStrips.push(ss);
    return ss;
  }

  _removeRoadblock(rb) {
    this.scene.remove(rb.mesh);
    this._disposeMesh(rb.mesh);
  }

  _removeSpikeStrip(ss) {
    this.scene.remove(ss.mesh);
    this._disposeMesh(ss.mesh);
  }

  // ==================== Queries ====================

  /**
   * Get all police car states (for pursuit logic).
   */
  getCopStates() {
    return this.cops.map(c => ({
      position: c.position.clone(),
      yaw: c.yaw,
      speed: c.speed,
      behavior: c.behavior,
      ramCooldown: c.ramCooldown,
    }));
  }

  /**
   * Get roadblock positions and radii.
   */
  getRoadblocks() {
    return this.roadblocks.filter(rb => rb.mesh).map(rb => ({
      position: rb.position,
      radius: rb.radius,
      life: rb.life,
    }));
  }

  /**
   * Get active spike strip positions and radii.
   */
  getSpikeStrips() {
    return this.spikeStrips.filter(ss => ss.active && ss.mesh).map(ss => ({
      position: ss.position,
      radius: ss.radius,
      life: ss.life,
    }));
  }

  /**
   * Mark a spike strip as consumed (player drove over it).
   */
  consumeSpikeStrip(index) {
    if (index >= 0 && index < this.spikeStrips.length) {
      this.spikeStrips[index].active = false;
    }
  }

  /**
   * Get number of cops close to the player (for capture detection).
   */
  getCloseCopCount(playerPos, radius = 8) {
    const pv = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    let count = 0;
    for (const cop of this.cops) {
      if (cop.position.distanceTo(pv) < radius) count++;
    }
    return count;
  }

  /**
   * Get minimum distance from player to nearest cop.
   */
  getNearestCopDistance(playerPos) {
    if (this.cops.length === 0) return Infinity;
    const pv = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    let minDist = Infinity;
    for (const cop of this.cops) {
      const d = cop.position.distanceTo(pv);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  /**
   * Check if any cop is ramming the player.
   */
  getRammingCops(playerPos, radius = 4) {
    const pv = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    const rammers = [];
    for (const cop of this.cops) {
      if (cop.behavior === 'ram' && cop.position.distanceTo(pv) < radius && cop.ramCooldown <= 0) {
        rammers.push(cop);
      }
    }
    return rammers;
  }

  // ==================== Lifecycle ====================

  set elapsed(t) {
    this._elapsed = t;
  }

  clear() {
    while (this.cops.length > 0) {
      this._despawnCop(this.cops[0]);
    }
    for (const rb of this.roadblocks) {
      this._removeRoadblock(rb);
    }
    this.roadblocks = [];
    for (const ss of this.spikeStrips) {
      this._removeSpikeStrip(ss);
    }
    this.spikeStrips = [];
    this._starLevel = 0;
  }

  _disposeMesh(mesh) {
    mesh.traverse((child) => {
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

  _sampleGroundY(pos, fallbackY = 0) {
    if (!this._groundSampler) return fallbackY;
    try {
      const sample = this._groundSampler(pos);
      return Number.isFinite(sample?.y) ? sample.y : fallbackY;
    } catch {
      return fallbackY;
    }
  }

  dispose() {
    this.clear();
  }
}
