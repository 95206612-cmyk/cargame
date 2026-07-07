import * as CANNON from 'cannon-es';

export class VehiclePhysics {
  constructor(physicsWorld) {
    this._pw = physicsWorld;

    this.chassisBody = null;
    this.raycastVehicle = null;
    this.wheelCount = 4;

    // Config sections loaded from carPhysics.json
    this._vehiclesCfg = {};
    this._handlingCfg = {};
    this._driftCfg = {};
    this._nitroCfg = {};
    this._airborneCfg = {};
    this._resetCfg = {};

    // Active vehicle config
    this.cfg = null;

    // Runtime state
    this.speedKmh = 0;
    this.steerAngle = 0;
    this._arcadeSpeed = 0;
    this._tuning = {
      steerSensitivity: 0.5,
      accelMultiplier: 1,
      brakeMultiplier: 1,
      gripMultiplier: 1,
      topSpeedMultiplier: 1,
      nitroMultiplier: 1,
      handbrakeTurnMultiplier: 1,
    };

    // Drift
    this.isDrifting = false;
    this._driftTimer = 0;
    this._driftAngle = 0;
    this._exitDriftBlend = 0;

    // Nitro
    this.nitroActive = false;
    this.nitroCapacity = 100;
    this._nitroCooldown = 0;

    // Airborne
    this.isAirborne = false;
    this._airborneTimer = 0;
    this._groundedWheels = 0;
    this._landingBlend = 0;

    // Surface
    this.currentSurface = 'asphalt';
    this._surfaceFrictionScale = 1.0;
    this._rollingResistanceScale = 1.0;
    this._weatherFrictionScale = 1.0;

    // Suspension data for animation
    this.suspensionCompression = [0, 0, 0, 0];

    // Reset
    this._resetPending = false;
    this._resetTimer = 0;
    this._resetSpawnPos = null;
  }

  // ==================== Config ====================

  loadConfig(assets) {
    const raw = assets.get('carPhysics');
    if (!raw) { this._setDefaults(); return; }
    this._vehiclesCfg = raw.vehicles || {};
    this._handlingCfg = raw.handling || {};
    this._driftCfg = raw.drift || {};
    this._nitroCfg = raw.nitro || {};
    this._airborneCfg = raw.airborne || {};
    this._resetCfg = raw.reset || {};
    this._pw.loadSurfaceConfig(raw.surfaceFriction);
  }

  _setDefaults() {
    this._vehiclesCfg = { sports: this._defaultVehicleCfg() };
    this._driftCfg = { handbrakeRearFrictionReduction: 0.18, driftSideAngleThreshold: 12,
      driftMinDuration: 0.3, driftRearFrictionReduction: 0.25, driftFrontFrictionBoost: 1.3,
      driftStabilizationForce: 0.3, driftExitBlendTime: 0.5, driftNitroGainPerSecond: 8,
      maxNitroFromDrift: 100, driftingSteerAssist: 1.4 };
    this._nitroCfg = { boostForceMultiplier: 2.2, maxSpeedBoost: 1.25, maxNitroCapacity: 100,
      nitroConsumptionRate: 25, nitroRefillRate: 5, minNitroToActivate: 15,
      nitroCooldownAfterEmpty: 1.5 };
    this._airborneCfg = { steeringMultiplierAir: 0.08, angularDampingAir: 0.99,
      landingSuspensionBoost: 1.8, landingBlendTime: 0.4 };
    this._resetCfg = { resetDelay: 1.5, resetHeight: 2.0, resetSpeedZeroing: true, resetNitroZeroing: true };
  }

  setTuning(settings = {}) {
    this._tuning = {
      ...this._tuning,
      steerSensitivity: clampSetting(settings.steerSensitivity, 0.1, 3, 0.5),
      accelMultiplier: clampSetting(settings.accelMultiplier, 0.2, 3, 1),
      brakeMultiplier: clampSetting(settings.brakeMultiplier, 0.2, 3, 1),
      gripMultiplier: clampSetting(settings.gripMultiplier, 0.2, 3, 1),
      topSpeedMultiplier: clampSetting(settings.topSpeedMultiplier, 0.4, 2, 1),
      nitroMultiplier: clampSetting(settings.nitroMultiplier, 0.2, 3, 1),
      handbrakeTurnMultiplier: clampSetting(settings.handbrakeTurnMultiplier, 0.2, 3, 1),
    };
  }

  _defaultVehicleCfg() {
    return {
      mass: 1100, centerOfMass: { x: 0, y: -0.15, z: -0.3 },
      chassisHalfExtents: { x: 0.95, y: 0.28, z: 2.2 },
      wheelRadiusFront: 0.33, wheelRadiusRear: 0.35,
      suspensionRestLength: 0.08, suspensionTravel: 0.015,
      suspensionStiffness: 500, suspensionDamping: 60, suspensionCompression: 50,
      rollInfluence: 0.04, maxSteeringAngle: 0.58,
      steeringSpeed: 60, steeringReturnSpeed: 60, engineForce: 3800, brakeForce: 45,
      dragCoefficient: 0.38, maxSpeed: 260, wheelFriction: 1200, frictionSlip: 6.5,
      wheelRaycastOffsetY: 0.04,
      wheelAxle: { fl: [-0.95, -0.15, 1.6], fr: [0.95, -0.15, 1.6],
                    rl: [-0.95, -0.15, -1.6], rr: [0.95, -0.15, -1.6] },
    };
  }

  // ==================== Create ====================

  create(vehicleType, spawnPos, spawnYaw, scale = 1) {
    if (!this._pw.world) { console.warn('[VehiclePhysics] Physics world not ready.'); return false; }

    if (this.raycastVehicle) this.dispose();

    this.cfg = scaleVehicleConfig(this._vehiclesCfg[vehicleType] || this._defaultVehicleCfg(), scale);
    const h = this.cfg.chassisHalfExtents;

    // Chassis rigid body
    const shape = new CANNON.Box(new CANNON.Vec3(h.x, h.y, h.z));
    const quat = new CANNON.Quaternion();
    quat.setFromEuler(0, spawnYaw, 0, 'YXZ');

    this.chassisBody = new CANNON.Body({
      mass: this.cfg.mass,
      shape,
      position: new CANNON.Vec3(spawnPos.x, spawnPos.y, spawnPos.z),
      quaternion: quat,
      linearDamping: 0.5,
      angularDamping: 0.8,
    });
    this.chassisBody.sleepSpeedLimit = 0;
    this.chassisBody.allowSleep = false;

    // Center of mass offset
    const com = this.cfg.centerOfMass;
    if (com && (com.x !== 0 || com.y !== 0 || com.z !== 0)) {
      this.chassisBody.shapeOffsets[0] = new CANNON.Vec3(com.x, com.y, com.z);
    }

    this._pw.world.addBody(this.chassisBody);
    this._pw.bodies.push(this.chassisBody);

    // Raycast vehicle
    this.raycastVehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const axle = this.cfg.wheelAxle;
    const wheelDir = new CANNON.Vec3(0, -1, 0);
    const axleDir = new CANNON.Vec3(-1, 0, 0);
    const suspensionMax = this.cfg.suspensionRestLength + (this.cfg.suspensionTravel || 0.18);
    const raycastOffsetY = clampNumber(this.cfg.wheelRaycastOffsetY, 0, 0.12, 0.04);

    const wheelSpecs = [
      { pos: axle.fl, isFront: true,  radius: this.cfg.wheelRadiusFront },
      { pos: axle.fr, isFront: true,  radius: this.cfg.wheelRadiusFront },
      { pos: axle.rl, isFront: false, radius: this.cfg.wheelRadiusRear },
      { pos: axle.rr, isFront: false, radius: this.cfg.wheelRadiusRear },
    ];

    for (const ws of wheelSpecs) {
      this.raycastVehicle.addWheel({
        localPosition: new CANNON.Vec3(ws.pos[0], ws.pos[1] + raycastOffsetY, ws.pos[2]),
        direction: wheelDir,
        axleLocal: axleDir,
        suspensionRestLength: this.cfg.suspensionRestLength,
        suspensionMaxLength: suspensionMax,
        radius: ws.radius,
        isFrontWheel: ws.isFront,
        suspensionStiffness: this.cfg.suspensionStiffness,
        dampingCompression: this.cfg.suspensionCompression,
        dampingRelaxation: this.cfg.suspensionDamping,
        frictionSlip: this.cfg.frictionSlip,
        rollInfluence: this.cfg.rollInfluence,
      });
    }

    this.raycastVehicle.addToWorld(this._pw.world);

    // Reset runtime state
    this.nitroCapacity = this._nitroCfg.maxNitroCapacity || 100;
    this.nitroActive = false;
    this._nitroCooldown = 0;
    this.speedKmh = 0;
    this.steerAngle = 0;
    this._arcadeSpeed = 0;
    this.isDrifting = false;
    this._driftTimer = 0;
    this._driftAngle = 0;
    this._exitDriftBlend = 0;
    this.isAirborne = false;
    this._airborneTimer = 0;
    this._landingBlend = 0;
    this._resetPending = false;
    this._resetTimer = 0;
    this._resetSpawnPos = spawnPos ? { ...spawnPos, yaw: spawnYaw } : null;

    return true;
  }

  // ==================== Per-frame: apply forces ====================

  applyForces(delta, input) {
    if (!this.raycastVehicle || !this.chassisBody) return;

    const dt = Math.min(delta, 0.1);

    // Compute speed
    const v = this.chassisBody.velocity;
    this.speedKmh = Math.sqrt(v.x * v.x + v.z * v.z) * 3.6;

    // Update subsystems
    this._updateSurface();
    this._updateDriftState(dt, input.handbrake);
    this._updateNitroState(dt, input.nitro, input.throttle);
    this._updateAirborneState(dt);

    // Apply steering
    this._applySteering(dt, input.steerAxis);

    // Apply engine
    this._applyEngine(dt, input.throttle, input.brake);

    // Apply braking
    this._applyBraking(dt, input.brake, input.handbrake);

    // Apply drag
    this._applyDrag(dt);

    // Update wheel friction (drift/surface/landing)
    this._updateWheelFriction(dt);

    // Browser-friendly driving assist. The raycast vehicle still supplies
    // suspension/friction behavior, while this guarantees responsive input.
    this._applyArcadeDrive(dt, input);

    // Handle reset request
    if (input.resetRequested) {
      this._resetPending = true;
      this._resetTimer = 0;
    }
    if (this._resetPending) {
      this._resetTimer += dt;
      if (this._resetTimer >= (this._resetCfg.resetDelay || 1.5)) {
        this._doReset();
      }
    }

    // Required before world.step: update raycast vehicle suspension
    this.raycastVehicle.updateVehicle(1 / 120);

    // Dampen vertical bounce
    this.chassisBody.velocity.y *= 0.2;

    // Lock pitch and roll — car stays level, only yaw allowed
    this.chassisBody.quaternion.x = 0;
    this.chassisBody.quaternion.z = 0;
    this.chassisBody.quaternion.normalize();
    this.chassisBody.angularVelocity.x = 0;
    this.chassisBody.angularVelocity.z = 0;
  }

  // ==================== Steering ====================

  _applySteering(dt, steerInput) {
    const curve = this._handlingCfg.steeringCurve || { '0': 1, '60': 0.85, '100': 0.65, '150': 0.45, '200': 0.3, '260': 0.2 };
    const speedFactor = this._interpCurve(curve, this.speedKmh);

    const airborneFactor = this.isAirborne ? (this._airborneCfg.steeringMultiplierAir || 0.08) : 1.0;
    let maxAngle = this.cfg.maxSteeringAngle * speedFactor * airborneFactor;

    if (this.isDrifting) {
      maxAngle *= (this._driftCfg.driftingSteerAssist || 1.4);
    }

    const targetAngle = -steerInput * maxAngle;

    // Instant steering — no smoothing
    this.steerAngle = targetAngle;

    for (let i = 0; i < this.wheelCount; i++) {
      if (this.raycastVehicle.wheelInfos[i].isFrontWheel) {
        this.raycastVehicle.setSteeringValue(this.steerAngle, i);
      }
    }
  }

  // ==================== Engine ====================

  _applyEngine(dt, throttleInput, brakeInput) {
    if (throttleInput <= 0 || brakeInput > 0) {
      for (let i = 0; i < this.wheelCount; i++) {
        this.raycastVehicle.applyEngineForce(0, i);
      }
      return;
    }

    const accelCurve = this._handlingCfg.accelerationCurve ||
      { '0': 1, '30': 1, '80': 0.85, '120': 0.65, '170': 0.45, '220': 0.25, '260': 0.12 };
    const torqueFactor = this._interpCurve(accelCurve, this.speedKmh);

    let force = this.cfg.engineForce * throttleInput * torqueFactor;

    let maxSpeed = this.cfg.maxSpeed;
    if (this.nitroActive) {
      force *= (this._nitroCfg.boostForceMultiplier || 2.2);
      maxSpeed *= (this._nitroCfg.maxSpeedBoost || 1.25);
    }

    if (this.speedKmh >= maxSpeed) force = 0;

    // RWD: engine force to rear wheels
    for (let i = 0; i < this.wheelCount; i++) {
      if (!this.raycastVehicle.wheelInfos[i].isFrontWheel) {
        this.raycastVehicle.applyEngineForce(force, i);
      } else {
        this.raycastVehicle.applyEngineForce(0, i);
      }
    }

  }

  // ==================== Braking ====================

  _applyBraking(dt, brakeInput, handbrakeInput) {
    const brakeCurve = this._handlingCfg.brakingCurve ||
      { '0': 1, '100': 1, '180': 0.85, '260': 0.7 };
    const brakeFactor = this._interpCurve(brakeCurve, this.speedKmh);
    const forward = this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    const v = this.chassisBody.velocity;
    const forwardSpeed = v.x * forward.x + v.z * forward.z;
    const reversingFromStop = brakeInput > 0 && (forwardSpeed < 0.45 || this._arcadeSpeed <= 0.5);

    for (let i = 0; i < this.wheelCount; i++) {
      let bf = reversingFromStop ? 0 : brakeInput * this.cfg.brakeForce * brakeFactor;
      if (handbrakeInput && !this.raycastVehicle.wheelInfos[i].isFrontWheel) {
        bf = this.cfg.brakeForce * 1.5;
      }
      this.raycastVehicle.setBrake(bf, i);
    }
  }

  // ==================== Drag ====================

  _applyDrag(dt) {
    const v = this.chassisBody.velocity;
    const speed = Math.sqrt(v.x * v.x + v.z * v.z);
    if (speed < 0.5) return;

    const dragForce = this.cfg.dragCoefficient * this.speedKmh * this.speedKmh * 0.001;

    // Use exponential decay for frame-rate independence
    const dragDecay = Math.max(0, 1 - dragForce * dt / speed);
    this.chassisBody.velocity.x *= dragDecay;
    this.chassisBody.velocity.z *= dragDecay;
  }

  _applyArcadeDrive(dt, input) {
    if (!this.chassisBody || !this.cfg) return;

    let forward = this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    let right = this.chassisBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    const velocity = this.chassisBody.velocity;
    const maxSpeed = (this.cfg.maxSpeed * this._tuning.topSpeedMultiplier *
      (this.nitroActive ? (this._nitroCfg.maxSpeedBoost || 1.25) : 1)) / 3.6;

    if (input.throttle > 0) {
      const nitroAccel = this.nitroActive ? this._tuning.nitroMultiplier : 1;
      const rollingPenalty = 1 / Math.max(1, this._rollingResistanceScale);
      const launchGrip = clampNumber(0.55 + this._surfaceFrictionScale * 0.45, 0.42, 1.05, 1);
      const weatherAccel = clampNumber(this._weatherFrictionScale, 0.55, 1.15, 1);
      const accel = (this.nitroActive ? 18 : 10) *
        rollingPenalty *
        launchGrip *
        weatherAccel *
        this._tuning.accelMultiplier *
        nitroAccel;
      this._arcadeSpeed += accel * input.throttle * dt;
    }

    if (input.brake > 0) {
      const brakeDecel = (this._arcadeSpeed > 1 ? 18 : 8) * this._tuning.brakeMultiplier;
      this._arcadeSpeed -= brakeDecel * input.brake * dt;
    } else if (input.throttle <= 0) {
      const coastDecay = clampNumber(0.985 - Math.max(0, this._rollingResistanceScale - 1) * 0.01, 0.972, 0.988, 0.985);
      this._arcadeSpeed *= Math.pow(coastDecay, dt * 60);
    }

    this._arcadeSpeed = Math.max(-8, Math.min(maxSpeed, this._arcadeSpeed));

    const speedFactor = Math.min(Math.abs(this._arcadeSpeed) / 35, 1);
    const steerPower = (input.handbrake ? 1.34 * this._tuning.handbrakeTurnMultiplier : 0.86) * this._tuning.steerSensitivity;
    const airborneSteer = this.isAirborne ? 0.34 : 1;
    const yawDelta = -input.steerAxis * steerPower * airborneSteer * (0.28 + speedFactor * 0.82) * 0.15;
    if (Math.abs(yawDelta) > 0.0001) {
      const turn = new CANNON.Quaternion();
      turn.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yawDelta);
      const rotated = turn.mult(this.chassisBody.quaternion);
      this.chassisBody.quaternion.copy(rotated);
      this.chassisBody.angularVelocity.y *= 0.35;
      forward = this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
      right = this.chassisBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    }

    const currentForward = velocity.x * forward.x + velocity.z * forward.z;
    const currentSide = velocity.x * right.x + velocity.z * right.z;
    const lateralGrip = clampNumber(
      this._surfaceFrictionScale * this._weatherFrictionScale * this._tuning.gripMultiplier,
      0.06,
      1.45,
      1
    );
    const baseSideDamping = (this.isDrifting || input.handbrake) ? 0.035 : 0.18;
    const sideDamping = 1 - Math.exp(-baseSideDamping * lateralGrip * dt * 60);
    const maxSide = Math.max(3, Math.abs(this._arcadeSpeed) * 0.85);
    const sideSpeed = clampNumber(currentSide * (1 - sideDamping), -maxSide, maxSide, 0);
    const forwardFollow = 1 - Math.exp(-30 * dt);
    const forwardSpeed = currentForward + (this._arcadeSpeed - currentForward) * forwardFollow;

    velocity.x = forward.x * forwardSpeed + right.x * sideSpeed;
    velocity.z = forward.z * forwardSpeed + right.z * sideSpeed;
    this.speedKmh = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) * 3.6;
  }

  // ==================== Drift ====================

  _updateDriftState(dt, handbrakeInput) {
    const v = this.chassisBody.velocity;
    const speed = Math.sqrt(v.x * v.x + v.z * v.z);
    if (speed < 2.0) { this._endDrift(); return; }

    // Side slip angle
    const fwd = new CANNON.Vec3(0, 0, 1);
    const fwdRot = this.chassisBody.quaternion.vmult(fwd);
    const velNormX = v.x / speed;
    const velNormZ = v.z / speed;
    const dot = velNormX * fwdRot.x + velNormZ * fwdRot.z;
    const cross = velNormX * fwdRot.z - velNormZ * fwdRot.x;
    this._driftAngle = Math.atan2(cross, dot) * (180 / Math.PI);

    const angleThreshold = this._driftCfg.driftSideAngleThreshold || 12;

    // Drift entry: handbrake + speed
    if (handbrakeInput && speed > 30 && !this.isDrifting) {
      this.isDrifting = true;
      this._driftTimer = 0;
    }

    if (this.isDrifting) {
      this._driftTimer += dt;

      // Nitro gain from drift
      const gain = (this._driftCfg.driftNitroGainPerSecond || 8) * dt;
      this.nitroCapacity = Math.min(this._nitroCfg.maxNitroCapacity || 100, this.nitroCapacity + gain);

      // Exit conditions
      const angleBelow = Math.abs(this._driftAngle) < angleThreshold * 0.5;
      const tooSlow = speed < 15;
      const tooLong = this._driftTimer > 8.0;

      if ((angleBelow && this._driftTimer > (this._driftCfg.driftMinDuration || 0.3)) || tooSlow || tooLong) {
        this._endDrift();
      }
    }
  }

  _endDrift() {
    if (!this.isDrifting) return;
    this.isDrifting = false;
    this._driftTimer = 0;
    this._exitDriftBlend = this._driftCfg.driftExitBlendTime || 0.5;
  }

  // ==================== Nitro ====================

  _updateNitroState(dt, nitroInput, throttleInput) {
    if (this._nitroCooldown > 0) {
      this._nitroCooldown -= dt;
      this.nitroActive = false;
      return;
    }

    if (!this.isDrifting && !this.nitroActive) {
      this.nitroCapacity = Math.min(
        this._nitroCfg.maxNitroCapacity || 100,
        this.nitroCapacity + (this._nitroCfg.nitroRefillRate || 5) * dt
      );
    }

    const minNitro = this._nitroCfg.minNitroToActivate || 15;
    if (nitroInput && throttleInput > 0 && this.nitroCapacity >= minNitro) {
      this.nitroActive = true;
    }

    if (this.nitroActive) {
      this.nitroCapacity -= (this._nitroCfg.nitroConsumptionRate || 25) * dt;
      if (this.nitroCapacity <= 0) {
        this.nitroCapacity = 0;
        this.nitroActive = false;
        this._nitroCooldown = this._nitroCfg.nitroCooldownAfterEmpty || 1.5;
      }
    }
  }

  // ==================== Airborne ====================

  _updateAirborneState(dt) {
    let grounded = 0;
    for (let i = 0; i < this.wheelCount; i++) {
      const wheelInfo = this.raycastVehicle.wheelInfos[i];
      if (wheelInfo?.raycastInfo?.isInContact) grounded++;
    }
    this._groundedWheels = grounded;

    if (grounded === 0) {
      if (!this.isAirborne) { this.isAirborne = true; this._airborneTimer = 0; }
      this._airborneTimer += dt;

      // Angular damping in air
      const damp = Math.pow(this._airborneCfg.angularDampingAir || 0.99, dt * 60);
      const av = this.chassisBody.angularVelocity;
      this.chassisBody.angularVelocity.set(av.x * damp, av.y * damp, av.z * damp);
    } else {
      if (this.isAirborne) {
        this._landingBlend = this._airborneCfg.landingBlendTime || 0.4;
      }
      this.isAirborne = false;
      this._airborneTimer = 0;
    }
  }

  // ==================== Surface ====================

  _updateSurface() {
    // Surface is set externally by TrackManager
    const s = this._pw.getSurfaceFriction(this.currentSurface);
    this._surfaceFrictionScale = clampNumber(s?.friction, 0.04, 2.0, 1.0);
    this._rollingResistanceScale = clampNumber(s?.rollingResistance, 0.35, 3.0, 1.0);
  }

  setSurface(name) {
    this.currentSurface = name || 'asphalt';
  }

  setWeatherFrictionMultiplier(multiplier) {
    const value = Number(multiplier);
    this._weatherFrictionScale = Number.isFinite(value) ? Math.max(0.2, Math.min(1.2, value)) : 1.0;
  }

  // ==================== Wheel Friction ====================

  _updateWheelFriction(dt) {
    // Frame-rate independent blend for drift exit
    if (this._exitDriftBlend > 0) {
      this._exitDriftBlend = Math.max(0, this._exitDriftBlend - dt);
    }
    if (this._landingBlend > 0) {
      this._landingBlend = Math.max(0, this._landingBlend - dt);
    }

    for (let i = 0; i < this.wheelCount; i++) {
      const wi = this.raycastVehicle.wheelInfos[i];
      const isRear = !wi.isFrontWheel;

      let slip = this.cfg.frictionSlip * this._surfaceFrictionScale * this._weatherFrictionScale;
      let friction = this.cfg.wheelFriction * this._surfaceFrictionScale * this._weatherFrictionScale;

      if (this.isDrifting) {
        if (isRear) {
          friction *= (this._driftCfg.driftRearFrictionReduction || 0.25);
          slip *= (this._driftCfg.driftRearFrictionReduction || 0.25);
        } else {
          friction *= (this._driftCfg.driftFrontFrictionBoost || 1.3);
        }
      }

      if (this.isDrifting && Math.abs(this._driftAngle) > 30) {
        friction *= (1.0 - (this._driftCfg.driftStabilizationForce || 0.3));
      }

      // Drift exit blend: interpolate rear friction back to normal
      if (this._exitDriftBlend > 0 && isRear) {
        const totalTime = this._driftCfg.driftExitBlendTime || 0.5;
        const t = totalTime > 0 ? this._exitDriftBlend / totalTime : 0;
        const normalFriction = this.cfg.wheelFriction * this._surfaceFrictionScale * this._weatherFrictionScale;
        friction += (normalFriction - friction) * (1 - t);
      }

      // Landing suspension boost
      if (this._landingBlend > 0) {
        const totalTime = this._airborneCfg.landingBlendTime || 0.4;
        const t = totalTime > 0 ? this._landingBlend / totalTime : 0;
        const boost = 1 + (this._airborneCfg.landingSuspensionBoost - 1 || 0.8) * t;
        wi.suspensionStiffness = this.cfg.suspensionStiffness * boost;
      } else {
        wi.suspensionStiffness = this.cfg.suspensionStiffness;
      }

      wi.frictionSlip = slip;
      wi.customSlidingRotationalSpeed = -friction * 0.01;
    }
  }

  // ==================== Suspension Readback (call after world.step) ====================

  updateSuspension() {
    for (let i = 0; i < this.wheelCount; i++) {
      const wi = this.raycastVehicle.wheelInfos[i];
      if (wi?.raycastInfo?.isInContact) {
        const travel = this.cfg.suspensionTravel || 0.18;
        this.suspensionCompression[i] = Math.max(0, Math.min(1,
          (this.cfg.suspensionRestLength - wi.suspensionLength) / travel
        ));
      } else {
        this.suspensionCompression[i] = 0;
      }
    }
  }

  // ==================== Reset ====================

  _doReset() {
    if (!this.chassisBody) return;
    this._resetPending = false;

    const sp = this._resetSpawnPos || { x: 0, y: this._resetCfg.resetHeight || 2, z: 0, yaw: 0 };
    this.chassisBody.position.set(sp.x, sp.y, sp.z);
    const q = new CANNON.Quaternion();
    q.setFromEuler(0, sp.yaw || 0, 0, 'YXZ');
    this.chassisBody.quaternion.copy(q);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this._arcadeSpeed = 0;

    if (this._resetCfg.resetNitroZeroing) {
      this.nitroCapacity = this._nitroCfg.maxNitroCapacity || 100;
    }
    this.nitroActive = false;
    this.isDrifting = false;
    this._driftTimer = 0;
    this._exitDriftBlend = 0;
    this.isAirborne = false;
    this._nitroCooldown = 0;
  }

  resetTo(spawnPos) {
    this._resetSpawnPos = spawnPos ? { ...spawnPos, yaw: spawnPos.yaw || 0 } : null;
    this._resetPending = true;
    this._resetTimer = 0;
  }

  // ==================== Sync to Mesh ====================

  syncToMesh(meshRoot, delta = 0) {
    if (!meshRoot || !this.chassisBody) return;
    const p = this.chassisBody.position;
    const q = this.chassisBody.quaternion;
    const visualOffsetY = Number(meshRoot.userData?.physicsVisualOffsetY) || 0;

    // Local player visuals must stay locked to the authoritative physics body.
    // Extra render-side lerp creates a growing follow lag, then snaps when the
    // gap gets large enough, which reads as a periodic backward hitch.
    meshRoot.position.set(p.x, p.y + visualOffsetY, p.z);
    meshRoot.quaternion.set(q.x, q.y, q.z, q.w);
    meshRoot.userData._visualSyncReady = true;
  }

  // ==================== Getters ====================

  getPosition() {
    if (!this.chassisBody) return { x: 0, y: 0, z: 0 };
    return { x: this.chassisBody.position.x, y: this.chassisBody.position.y, z: this.chassisBody.position.z };
  }

  getRotation() {
    if (!this.chassisBody) return { x: 0, y: 0, z: 0, w: 1 };
    const q = this.chassisBody.quaternion;
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  }

  getSpeedKmh() {
    return this.speedKmh;
  }

  getSteerAngle() {
    return this.steerAngle;
  }

  getNitroPercent() {
    return this.nitroCapacity / (this._nitroCfg.maxNitroCapacity || 100);
  }

  get isDriftActive() {
    return this.isDrifting;
  }

  get driftAngle() {
    return this._driftAngle;
  }

  // ==================== Curve Interpolation ====================

  _interpCurve(curve, speed) {
    const keys = Object.keys(curve).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return 1.0;
    if (speed <= keys[0]) return curve[keys[0]];
    if (speed >= keys[keys.length - 1]) return curve[keys[keys.length - 1]];

    for (let i = 0; i < keys.length - 1; i++) {
      if (speed >= keys[i] && speed <= keys[i + 1]) {
        const t = (speed - keys[i]) / (keys[i + 1] - keys[i]);
        return curve[keys[i]] + (curve[keys[i + 1]] - curve[keys[i]]) * t;
      }
    }
    return 1.0;
  }

  // ==================== Cleanup ====================

  dispose() {
    if (this.raycastVehicle && this._pw.world) {
      this.raycastVehicle.removeFromWorld(this._pw.world);
    }
    if (this.chassisBody && this._pw.world) {
      this._pw.removeBody(this.chassisBody);
    }
    this.raycastVehicle = null;
    this.chassisBody = null;
  }
}

function clampSetting(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function scaleVehicleConfig(source, scale = 1) {
  const s = clampNumber(scale, 0.25, 5, 1);
  const cfg = {
    ...source,
    centerOfMass: { ...(source.centerOfMass || {}) },
    chassisHalfExtents: { ...(source.chassisHalfExtents || {}) },
    wheelAxle: Object.fromEntries(
      Object.entries(source.wheelAxle || {}).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])
    ),
  };

  if (Math.abs(s - 1) < 0.0001) return cfg;

  const scaleObject = (obj, keys) => {
    if (!obj) return;
    for (const key of keys) {
      if (Number.isFinite(obj[key])) obj[key] *= s;
    }
  };

  scaleObject(cfg.centerOfMass, ['x', 'y', 'z']);
  scaleObject(cfg.chassisHalfExtents, ['x', 'y', 'z']);
  cfg.wheelRadiusFront *= s;
  cfg.wheelRadiusRear *= s;
  cfg.suspensionRestLength *= s;
  cfg.suspensionTravel *= s;
  cfg.wheelRaycastOffsetY *= s;

  for (const key of Object.keys(cfg.wheelAxle || {})) {
    const pos = cfg.wheelAxle[key];
    if (Array.isArray(pos)) cfg.wheelAxle[key] = pos.map(v => Number.isFinite(v) ? v * s : v);
  }

  return cfg;
}
