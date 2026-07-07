import * as THREE from 'three';

const BODY_STYLES = {
  compact: {
    chassisW: 1.7, chassisH: 0.50, chassisL: 3.8, chassisY: 0.60,
    cabinW: 1.5, cabinH: 0.38, cabinL: 1.8, cabinY: 0.92, cabinZ: -0.2,
    wheelRadius: 0.30, wheelW: 0.24, wheelY: 0.30,
    wheelX: 0.85, wheelZFront: 1.4, wheelZRear: -1.4,
    spoilerW: 0, spoilerH: 0, spoilerD: 0, spoilerY: 0, spoilerZ: 0,
    windshieldAngle: -0.45,
  },
  sports: {
    chassisW: 1.9, chassisH: 0.55, chassisL: 4.4, chassisY: 0.62,
    cabinW: 1.7, cabinH: 0.42, cabinL: 2.1, cabinY: 0.95, cabinZ: -0.3,
    wheelRadius: 0.33, wheelW: 0.28, wheelY: 0.35,
    wheelX: 0.95, wheelZFront: 1.6, wheelZRear: -1.6,
    spoilerW: 2.0, spoilerH: 0.08, spoilerD: 0.35, spoilerY: 0.70, spoilerZ: -1.95,
    windshieldAngle: -0.55,
  },
  supercar: {
    chassisW: 2.0, chassisH: 0.46, chassisL: 4.6, chassisY: 0.58,
    cabinW: 1.8, cabinH: 0.34, cabinL: 1.9, cabinY: 0.82, cabinZ: -0.05,
    wheelRadius: 0.34, wheelW: 0.30, wheelY: 0.34,
    wheelX: 1.0, wheelZFront: 1.7, wheelZRear: -1.7,
    spoilerW: 2.1, spoilerH: 0.10, spoilerD: 0.45, spoilerY: 0.65, spoilerZ: -2.1,
    windshieldAngle: -0.65,
  },
  muscle: {
    chassisW: 2.0, chassisH: 0.62, chassisL: 4.8, chassisY: 0.65,
    cabinW: 1.75, cabinH: 0.46, cabinL: 2.4, cabinY: 1.02, cabinZ: -0.4,
    wheelRadius: 0.36, wheelW: 0.30, wheelY: 0.36,
    wheelX: 1.0, wheelZFront: 1.8, wheelZRear: -1.8,
    spoilerW: 0, spoilerH: 0, spoilerD: 0, spoilerY: 0, spoilerZ: 0,
    windshieldAngle: -0.4,
  },
  truck: {
    chassisW: 2.2, chassisH: 0.80, chassisL: 5.6, chassisY: 0.80,
    cabinW: 2.0, cabinH: 0.55, cabinL: 2.8, cabinY: 1.25, cabinZ: -0.6,
    wheelRadius: 0.42, wheelW: 0.36, wheelY: 0.42,
    wheelX: 1.1, wheelZFront: 2.0, wheelZRear: -2.0,
    spoilerW: 0, spoilerH: 0, spoilerD: 0, spoilerY: 0, spoilerZ: 0,
    windshieldAngle: -0.3,
  },
};

const WHEEL_NAMES = ['fl', 'fr', 'rl', 'rr'];
export const VEHICLE_MODEL_SCALE = 1.17;

export class CarModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.scale.setScalar(VEHICLE_MODEL_SCALE);
    this.root.userData.vehicleModelScale = VEHICLE_MODEL_SCALE;
    this.body = null;
    this.wheels = [];
    this._wheelRadius = 0.33;
    this._wheelCenterY = 0.35;
    this._taillightMeshes = [];
    this._steerAngleVis = 0;
    this._bodyPitchCurrent = 0;
    this._bodyPitchTarget = 0;
    this._externalModel = null;
  }

  useExternalModel(model, bodyStyle = 'sports') {
    this.dispose();

    const dims = BODY_STYLES[bodyStyle] || BODY_STYLES.sports;
    this._wheelRadius = dims.wheelRadius;
    this._wheelCenterY = dims.wheelY;
    this._externalModel = model;
    this._externalModel.name = this._externalModel.name || 'car_root';

    this._externalModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.body = this._findNode(['body', 'car-body', 'chassis', 'Body']) || this._externalModel;
    this.wheels = [
      this._findNode(['wheel_fl', 'wheel-fl', 'wheelFL', 'front_left_wheel']),
      this._findNode(['wheel_fr', 'wheel-fr', 'wheelFR', 'front_right_wheel']),
      this._findNode(['wheel_rl', 'wheel-rl', 'wheelRL', 'rear_left_wheel']),
      this._findNode(['wheel_rr', 'wheel-rr', 'wheelRR', 'rear_right_wheel']),
    ].filter(Boolean);
    this._taillightMeshes = [];
    this._externalModel.traverse((child) => {
      if (/tail|brake/i.test(child.name || '') && child.material) {
        this._taillightMeshes.push(child);
      }
    });

    this.root.add(this._externalModel);
  }


  /**
   * Load car from separate body + wheel GLB files.
   * @param {THREE.Group} bodyModel - body GLB scene
   * @param {THREE.Group[]} wheelModels - [fl, fr, rl, rr] wheel GLB scenes
   * @param {string} bodyStyle - body style key
   */
  useExternalModelFromParts(bodyModel, wheelModels, bodyStyle = 'sports') {
    this.dispose();

    const dims = BODY_STYLES[bodyStyle] || BODY_STYLES.sports;
    this._wheelRadius = dims.wheelRadius;
    this._wheelCenterY = dims.wheelY;

    // Body
    this._externalModel = bodyModel;
    bodyModel.name = bodyModel.name || 'car_root';
    bodyModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.body = bodyModel;
    this.root.add(bodyModel);

    // Wheels — loaded from separate GLB files
    this.wheels = [];
    const wPositions = [
      { x: -dims.wheelX, z: dims.wheelZFront },
      { x:  dims.wheelX, z: dims.wheelZFront },
      { x: -dims.wheelX, z: dims.wheelZRear },
      { x:  dims.wheelX, z: dims.wheelZRear },
    ];

    for (let i = 0; i < 4; i++) {
      const wheelGLB = wheelModels[i];
      if (!wheelGLB) continue;

      const wg = new THREE.Group();
      wg.name = 'wheel-' + WHEEL_NAMES[i];

      // Auto-scale wheel to match expected radius
      const bbox = new THREE.Box3().setFromObject(wheelGLB);
      const modelSize = Math.max(bbox.max.y - bbox.min.y, bbox.max.x - bbox.min.x);
      if (modelSize > 0.001) {
        const scale = (dims.wheelRadius * 2) / modelSize;
        wheelGLB.scale.setScalar(scale);
      }

      wheelGLB.position.set(0, 0, 0);
      wheelGLB.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      wg.add(wheelGLB);

      wg.position.set(wPositions[i].x, dims.wheelY, wPositions[i].z);
      this.wheels.push(wg);
      this.root.add(wg);
    }

    // Taillights
    this._taillightMeshes = [];
    bodyModel.traverse((child) => {
      if (/tail|brake/i.test(child.name || '') && child.material) {
        this._taillightMeshes.push(child);
      }
    });
  }

  buildProcedural(colors = {}, bodyStyle = 'sports') {
    this.dispose();

    const dims = BODY_STYLES[bodyStyle] || BODY_STYLES.sports;
    const bodyColor = colors.body || 0xe74c3c;
    const cabinColor = colors.cabin || 0x1a1a2e;
    const trimColor = colors.trim || 0x333333;
    const wheelColor = colors.wheel || 0x111111;

    this._wheelRadius = dims.wheelRadius;
    this._wheelCenterY = dims.wheelY;

    this.body = new THREE.Group();
    this.body.name = 'car-body';

    // --- Chassis ---
    const chassisGeo = new THREE.BoxGeometry(dims.chassisW, dims.chassisH, dims.chassisL);
    const chassisMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.6 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = dims.chassisY;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    chassis.name = 'chassis';
    this.body.add(chassis);

    // --- Cabin ---
    const cabinGeo = new THREE.BoxGeometry(dims.cabinW, dims.cabinH, dims.cabinL);
    const cabinMat = new THREE.MeshStandardMaterial({ color: cabinColor, roughness: 0.1, metalness: 0.3 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, dims.cabinY, dims.cabinZ);
    cabin.castShadow = true;
    cabin.name = 'cabin';
    this.body.add(cabin);

    // --- Windshield ---
    const wsGeo = new THREE.BoxGeometry(dims.cabinW - 0.15, 0.5, 0.06);
    const wsMat = new THREE.MeshPhysicalMaterial({
      color: 0x8899cc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55,
    });
    const windshield = new THREE.Mesh(wsGeo, wsMat);
    windshield.position.set(0, dims.cabinY + 0.05, dims.cabinZ + dims.cabinL / 2 + 0.04);
    windshield.rotation.x = dims.windshieldAngle;
    windshield.name = 'windshield';
    this.body.add(windshield);

    // --- Rear window ---
    const rearWindow = new THREE.Mesh(wsGeo.clone(), wsMat.clone());
    rearWindow.position.set(0, dims.cabinY + 0.05, dims.cabinZ - dims.cabinL / 2 - 0.04);
    rearWindow.rotation.x = -dims.windshieldAngle * 0.7;
    this.body.add(rearWindow);

    // --- Spoiler ---
    if (dims.spoilerW > 0) {
      const spGeo = new THREE.BoxGeometry(dims.spoilerW, dims.spoilerH, dims.spoilerD);
      const spMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.3, metalness: 0.5 });
      const spoiler = new THREE.Mesh(spGeo, spMat);
      spoiler.position.set(0, dims.spoilerY, dims.spoilerZ);
      spoiler.castShadow = true;
      spoiler.name = 'spoiler';
      this.body.add(spoiler);
      // Stands
      for (const sx of [-dims.spoilerW * 0.3, dims.spoilerW * 0.3]) {
        const standGeo = new THREE.BoxGeometry(0.08, dims.spoilerH * 2.2, 0.06);
        const stand = new THREE.Mesh(standGeo, spMat);
        stand.position.set(sx, dims.spoilerY - dims.spoilerH * 1.3, dims.spoilerZ);
        this.body.add(stand);
      }
    }

    // --- Bumpers ---
    const bumperMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.2, metalness: 0.4 });
    const fbGeo = new THREE.BoxGeometry(dims.chassisW + 0.12, 0.18, 0.16);
    const frontBumper = new THREE.Mesh(fbGeo, bumperMat);
    frontBumper.position.set(0, 0.18, dims.chassisL / 2 + 0.06);
    frontBumper.name = 'bumper-front';
    this.body.add(frontBumper);

    const rbGeo = new THREE.BoxGeometry(dims.chassisW + 0.12, 0.18, 0.16);
    const rearBumper = new THREE.Mesh(rbGeo, bumperMat);
    rearBumper.position.set(0, 0.18, -(dims.chassisL / 2 + 0.06));
    rearBumper.name = 'bumper-rear';
    this.body.add(rearBumper);

    // --- Headlights ---
    const lightGeo = new THREE.SphereGeometry(0.14, 8, 6);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, roughness: 0.05, emissive: 0xffffcc, emissiveIntensity: 0.5 });
    for (const lx of [-dims.chassisW * 0.3, dims.chassisW * 0.3]) {
      const hl = new THREE.Mesh(lightGeo, lightMat);
      hl.position.set(lx, dims.chassisY + 0.02, dims.chassisL / 2 - 0.02);
      hl.name = 'headlight';
      this.body.add(hl);
    }

    // --- Taillights ---
    this._taillightMeshes = [];
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.1, emissive: 0xff0000, emissiveIntensity: 0.3 });
    for (const lx of [-dims.chassisW * 0.3, dims.chassisW * 0.3]) {
      const tl = new THREE.Mesh(lightGeo.clone(), tailMat);
      tl.position.set(lx, dims.chassisY + 0.02, -(dims.chassisL / 2 - 0.02));
      tl.name = 'taillight';
      this._taillightMeshes.push(tl);
      this.body.add(tl);
    }

    // --- Exhaust ---
    const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.2, 8);
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.2, metalness: 0.9 });
    for (const ex of [-dims.chassisW * 0.16, dims.chassisW * 0.16]) {
      const ep = new THREE.Mesh(exhaustGeo, exhaustMat);
      ep.rotation.x = Math.PI / 2;
      ep.position.set(ex, 0.22, -(dims.chassisL / 2 + 0.12));
      ep.name = 'exhaust';
      this.body.add(ep);
    }

    // --- Side mirrors ---
    if (bodyStyle === 'sports' || bodyStyle === 'supercar') {
      const mirrorGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
      const mirrorMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.6 });
      for (const mx of [-(dims.chassisW / 2 + 0.04), dims.chassisW / 2 + 0.04]) {
        const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
        mirror.position.set(mx, dims.chassisY + 0.22, dims.cabinZ);
        mirror.name = 'mirror';
        this.body.add(mirror);
      }
    }

    this.root.add(this.body);

    // --- Wheels ---
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(dims.wheelRadius, dims.wheelRadius, dims.wheelW, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: wheelColor, roughness: 0.7, metalness: 0.1 });
    const hubGeo = new THREE.CylinderGeometry(dims.wheelRadius * 0.45, dims.wheelRadius * 0.45, dims.wheelW + 0.02, 8);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.9 });

    const wPositions = [
      { x: -dims.wheelX, z: dims.wheelZFront },
      { x:  dims.wheelX, z: dims.wheelZFront },
      { x: -dims.wheelX, z: dims.wheelZRear },
      { x:  dims.wheelX, z: dims.wheelZRear },
    ];

    for (let i = 0; i < 4; i++) {
      const wg = new THREE.Group();
      wg.name = `wheel-${WHEEL_NAMES[i]}`;

      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wg.add(tire);

      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);

      wg.position.set(wPositions[i].x, dims.wheelY, wPositions[i].z);
      this.wheels.push(wg);
      this.root.add(wg);
    }
  }

  // ==================== Animation ====================

  animateWheels(delta, speedKmh, steerAngle, braking) {
    if (this.wheels.length < 4) return;

    const dt = Math.min(delta, 0.1);
    const wheelRadius = this.getWheelVisualRadius() || 0.33;
    const angularSpeed = (speedKmh / 3.6) / wheelRadius;

    // Smooth steering visual
    this._steerAngleVis += (steerAngle - this._steerAngleVis) * Math.min(dt * 12, 1);

    for (let i = 0; i < this.wheels.length; i++) {
      const wheel = this.wheels[i];
      if (!wheel || wheel.children.length === 0) continue;

      const tire = wheel.children[0];
      const spinTarget = tire || wheel;
      spinTarget.rotation.x += angularSpeed * dt;

      if (i < 2) {
        const visualSteer = Math.max(-0.78, Math.min(0.78, this._steerAngleVis * 1.35));
        wheel.rotation.y = visualSteer;
      }
    }

    // Brake lights
    const intensity = braking ? 0.9 : 0.3;
    for (const tl of this._taillightMeshes) {
      tl.material.emissiveIntensity += (intensity - tl.material.emissiveIntensity) * Math.min(dt * 10, 1);
    }
  }

  animateBodyPitch(delta, nitroActive, braking) {
    if (!this.body) return;

    if (nitroActive) {
      this._bodyPitchTarget = 0.06;
    } else if (braking) {
      this._bodyPitchTarget = -0.04;
    } else {
      this._bodyPitchTarget = 0;
    }

    const dt = Math.min(delta, 0.1);
    this._bodyPitchCurrent += (this._bodyPitchTarget - this._bodyPitchCurrent) * Math.min(dt * 8, 1);
    this.body.rotation.x = this._bodyPitchCurrent;
  }

  // ==================== Helpers ====================

  getWheelWorldPositions() {
    const positions = [];
    for (const wheel of this.wheels) {
      const pos = new THREE.Vector3();
      wheel.getWorldPosition(pos);
      positions.push(pos);
    }
    return positions;
  }

  getWheelVisualRadius() {
    const scale = Number(this.root?.userData?.vehicleModelScale || this.root?.scale?.x || 1);
    return this._wheelRadius * scale;
  }

  getWheelGroundOffset() {
    if (!this.wheels.length) return this._wheelCenterY - this._wheelRadius;

    this.root.updateWorldMatrix(true, true);
    const rootPos = new THREE.Vector3();
    this.root.getWorldPosition(rootPos);

    let lowest = Infinity;
    for (const wheel of this.wheels) {
      const bbox = new THREE.Box3().setFromObject(wheel);
      if (Number.isFinite(bbox.min.y)) {
        lowest = Math.min(lowest, bbox.min.y - rootPos.y);
      }
    }

    if (Number.isFinite(lowest)) return lowest;
    return this._wheelCenterY - this._wheelRadius;
  }

  dispose() {
    if (this._externalModel) {
      this._externalModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this._externalModel = null;
      this.body = null;
      this.wheels = [];
      this._taillightMeshes = [];
    }

    if (this.body) {
      this.body.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.body = null;
    }
    for (const wheel of this.wheels) {
      wheel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    this.wheels = [];
    this._taillightMeshes = [];
    this._wheelCenterY = 0.35;
    this.root.scale.setScalar(VEHICLE_MODEL_SCALE);
    this.root.userData.vehicleModelScale = VEHICLE_MODEL_SCALE;
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
  }

  _findNode(names) {
    if (!this._externalModel) return null;
    const lowered = names.map(name => String(name).toLowerCase());
    let found = null;
    this._externalModel.traverse((child) => {
      if (found) return;
      const name = String(child.name || '').toLowerCase();
      if (lowered.includes(name)) found = child;
    });
    return found;
  }
}
