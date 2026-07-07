import * as THREE from 'three';

export const CameraMode = Object.freeze({
  CHASE:   'chase',    // Close trailing third-person
  COCKPIT: 'cockpit',  // Interior driver view
  FAR:     'far',      // Distant third-person
  DYNAMIC: 'dynamic',  // Cinematic auto-switching
});

const MODE_CONFIGS = {
  [CameraMode.CHASE]:   { fov: 60, offsetY: 3.8, offsetZ: -8.4, lookAhead: 5.2, smoothSpeed: 10.5 },
  [CameraMode.COCKPIT]: { fov: 75, offsetY: 1.4, offsetZ: 0.3,  lookAhead: 15.0, smoothSpeed: 20.0 },
  [CameraMode.FAR]:     { fov: 50, offsetY: 8.0, offsetZ: -20.0, lookAhead: 4.0, smoothSpeed: 5.0 },
  [CameraMode.DYNAMIC]: { fov: 65, offsetY: 5.0, offsetZ: -12.0, lookAhead: 8.0, smoothSpeed: 6.0 },
};

export class CameraManager {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 2000);
    this.camera.position.set(0, 3.6, -7.3);
    this.camera.lookAt(0, 0, 20);

    this.mode = CameraMode.CHASE;
    this.target = null;
    this._currentPos = new THREE.Vector3(0, 3.6, -7.3);
    this._currentLookAt = new THREE.Vector3(0, 0, 20);

    // Shake state
    this._shakeIntensity = 0;
    this._shakeDuration = 0;
    this._shakeElapsed = 0;

    // Tilt state
    this._tiltAngle = 0;        // radians
    this._tiltTarget = 0;

    // FOV animation
    this._baseFOV = 60;
    this._targetFOV = 60;

    // Zoom
    this._zoomLevel = 0;       // -1 (far) to 1 (close)

    // Manual orbit
    this._orbitAngle = 0;        // current orbit yaw (radians)
    this._orbitTarget = 0;       // target orbit yaw
    this._orbitPitch = 0;        // current orbit pitch (radians)
    this._orbitPitchTarget = 0;  // target orbit pitch
    this._orbitSpeed = 0.028;     // radians per pixel dragged (yaw)
    this._orbitPitchSpeed = 0.018; // radians per pixel dragged (pitch)
    this._orbitReturnSpeed = 6;  // smooth return speed

    // Camera collision
    this._collisionProvider = null;
    this._occlusionMeshProvider = null;
    this._groundMeshProvider = null;
    this._groundHeightProvider = null;
    this._collisionAvoidanceEnabled = true;
    this._meshRaycastsEnabled = false;
    this._collisionPadding = 0.24;
    this._collisionMinT = 0.08;
    this._groundClearance = 0.55;
    this._groundRayHeight = 80;
    this._groundRayDepth = 180;
    this._groundPathBackoff = 0.42;
    this._raycaster = new THREE.Raycaster();
    this._occlusionReturnTimer = 0;
    this._occlusionBackoff = 0.12;
    this._groundContactTimer = 0;
  }

  // ---- Mode switching ----

  setMode(mode) {
    if (!MODE_CONFIGS[mode]) return;
    this.mode = mode;
    const cfg = MODE_CONFIGS[mode];
    this._baseFOV = cfg.fov;
    this._targetFOV = cfg.fov;
  }

  getMode() {
    return this.mode;
  }

  getConfig() {
    return MODE_CONFIGS[this.mode] || MODE_CONFIGS[CameraMode.CHASE];
  }

  setCollisionProvider(provider) {
    this._collisionProvider = typeof provider === 'function' ? provider : null;
  }

  setOcclusionMeshProvider(provider) {
    this._occlusionMeshProvider = typeof provider === 'function' ? provider : null;
  }

  setGroundMeshProvider(provider) {
    this._groundMeshProvider = typeof provider === 'function' ? provider : null;
  }

  setGroundHeightProvider(provider) {
    this._groundHeightProvider = typeof provider === 'function' ? provider : null;
  }

  setCollisionAvoidanceEnabled(enabled) {
    this._collisionAvoidanceEnabled = enabled !== false;
  }

  setMeshRaycastsEnabled(enabled) {
    this._meshRaycastsEnabled = enabled === true;
  }

  // ---- Snap camera immediately behind target (no interpolation) ----

  snapToTarget(target) {
    this.target = target;
    if (!target) return;

    const cfg = this.getConfig();
    const targetPos = target.position ? target.position.clone() : new THREE.Vector3();
    const targetQuat = target.quaternion || new THREE.Quaternion();

    const backDir = new THREE.Vector3(0, 0, 1).applyQuaternion(targetQuat);
    const upDir = new THREE.Vector3(0, 1, 0);

    this._currentPos.copy(targetPos)
      .addScaledVector(backDir, cfg.offsetZ)
      .addScaledVector(upDir, cfg.offsetY);

    this._currentLookAt.copy(targetPos).addScaledVector(backDir, cfg.lookAhead);
    this._currentPos.copy(this._resolveGroundCollision(this._currentPos));

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);
  }

  // ---- Follow target with smooth interpolation ----

  follow(target, delta) {
    this.target = target;
    if (!target) return;

    const cfg = this.getConfig();

    // Compute target position: behind and above the target
    const targetPos = target.position ? target.position.clone() : new THREE.Vector3();
    const targetQuat = target.quaternion || new THREE.Quaternion();

    const backDir = new THREE.Vector3(0, 0, 1).applyQuaternion(targetQuat);
    const upDir = new THREE.Vector3(0, 1, 0);

    // Manual orbit: smoothly track orbit targets, then reset when released
    if (Math.abs(this._orbitAngle - this._orbitTarget) > 0.001) {
      this._orbitAngle += (this._orbitTarget - this._orbitAngle) * Math.min(delta * this._orbitReturnSpeed, 1);
    } else {
      this._orbitAngle = this._orbitTarget;
    }
    if (Math.abs(this._orbitPitch - this._orbitPitchTarget) > 0.001) {
      this._orbitPitch += (this._orbitPitchTarget - this._orbitPitch) * Math.min(delta * this._orbitReturnSpeed, 1);
    } else {
      this._orbitPitch = this._orbitPitchTarget;
    }

    // Apply orbit yaw around world up axis
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), this._orbitAngle
    );
    let orbitedDir = backDir.clone().applyQuaternion(yawQuat);

    // Apply orbit pitch around car's right axis
    const right = new THREE.Vector3().crossVectors(upDir, orbitedDir).normalize();
    if (Math.abs(this._orbitPitch) > 0.001) {
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, this._orbitPitch);
      orbitedDir = orbitedDir.clone().applyQuaternion(pitchQuat);
    }

    const desiredPos = targetPos.clone()
      .addScaledVector(orbitedDir, cfg.offsetZ)
      .addScaledVector(upDir, cfg.offsetY);

    // Look ahead
    const lookTarget = targetPos.clone().addScaledVector(orbitedDir, cfg.lookAhead);
    const collisionAnchor = targetPos.clone().addScaledVector(upDir, 1.1);
    const useCollisionAvoidance = this._collisionAvoidanceEnabled && this.mode === CameraMode.CHASE;
    const orbitActive = Math.abs(this._orbitAngle) > 0.002 || Math.abs(this._orbitTarget) > 0.002 ||
      Math.abs(this._orbitPitch) > 0.002 || Math.abs(this._orbitPitchTarget) > 0.002;
    const cameraPlacement = useCollisionAvoidance
      ? this._resolveCameraPlacement(collisionAnchor, desiredPos, { orbitActive })
      : { position: desiredPos, hit: false };

    // Smooth interpolation: exponential ease-out
    const dt = Math.min(delta, 0.1);
    if (cameraPlacement.hit) {
      this._occlusionReturnTimer = 0.55;
    } else {
      this._occlusionReturnTimer = Math.max(0, this._occlusionReturnTimer - dt);
    }

    const posSpeed = cameraPlacement.hit
      ? 18
      : this._occlusionReturnTimer > 0 ? Math.min(cfg.smoothSpeed, 4.8) : cfg.smoothSpeed;
    const t = 1 - Math.exp(-posSpeed * dt);
    this._currentPos.lerp(cameraPlacement.position, t);
    this._currentLookAt.lerp(lookTarget, t * 1.5);

    // Apply shake
    if (this._shakeElapsed < this._shakeDuration) {
      const progress = this._shakeElapsed / this._shakeDuration;
      const decay = 1 - progress;
      const shakeX = (Math.random() - 0.5) * 2 * this._shakeIntensity * decay;
      const shakeY = (Math.random() - 0.5) * 2 * this._shakeIntensity * decay;
      this._currentPos.x += shakeX;
      this._currentPos.y += shakeY;
      this._shakeElapsed += delta;
    }

    const groundedPos = this._resolveGroundCollision(this._currentPos);
    if (!groundedPos.equals(this._currentPos)) this._groundContactTimer = 0.35;
    else this._groundContactTimer = Math.max(0, this._groundContactTimer - dt);
    this._currentPos.copy(groundedPos);

    // Apply tilt (roll camera around look direction)
    if (Math.abs(this._tiltAngle - this._tiltTarget) > 0.001) {
      this._tiltAngle += (this._tiltTarget - this._tiltAngle) * Math.min(delta * 10, 1);
    }

    // Update camera
    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);

    // Apply tilt (rotate camera up vector)
    if (Math.abs(this._tiltAngle) > 0.001) {
      const forward = new THREE.Vector3().subVectors(this._currentLookAt, this._currentPos).normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      this.camera.up.crossVectors(right, forward).normalize();
      this.camera.up.applyAxisAngle(forward, this._tiltAngle);
    }

    // FOV animation
    if (Math.abs(this.camera.fov - this._targetFOV) > 0.1) {
      this.camera.fov += (this._targetFOV - this.camera.fov) * Math.min(delta * 8, 1);
      this.camera.updateProjectionMatrix();
    }
  }

  // ---- Camera effects ----

  applyShake(intensity = 1.0, duration = 0.3) {
    this._shakeIntensity = intensity;
    this._shakeDuration = duration;
    this._shakeElapsed = 0;
  }

  applyTilt(angle) {
    this._tiltTarget = THREE.MathUtils.clamp(angle, -0.5, 0.5);
  }

  setFOV(fov) {
    this._targetFOV = THREE.MathUtils.clamp(fov, 35, 120);
  }

  resetFOV() {
    this._targetFOV = this._baseFOV;
  }

  zoomIn() {
    this._zoomLevel = Math.min(this._zoomLevel + 0.2, 1);
    this._applyZoom();
  }

  zoomOut() {
    this._zoomLevel = Math.max(this._zoomLevel - 0.2, -1);
    this._applyZoom();
  }

  // ---- Manual orbit ----

  addOrbitDelta(dxPixels, dyPixels) {
    this._orbitTarget += (dxPixels || 0) * this._orbitSpeed;
    this._orbitPitchTarget += (dyPixels || 0) * this._orbitPitchSpeed;
    this._orbitPitchTarget = Math.max(-1.2, Math.min(1.2, this._orbitPitchTarget));
  }

  releaseOrbit() {
    this._orbitTarget = 0;
    this._orbitPitchTarget = 0;
  }

  _applyZoom() {
    const cfg = MODE_CONFIGS[this.mode];
    if (!cfg) return;
    // Zoom changes effective offset
    const zoomFactor = 1 - this._zoomLevel * 0.5;
    this.camera.fov = this._baseFOV / zoomFactor;
    this.camera.updateProjectionMatrix();
  }

  _resolveCameraCollision(anchor, desiredPos) {
    const colliders = this._getCollisionColliders();
    if (!colliders.length) return desiredPos;

    let nearestT = 1;
    for (const collider of colliders) {
      const hitT = this._segmentOBBHit(anchor, desiredPos, collider, this._collisionPadding);
      if (hitT !== null && hitT < nearestT) nearestT = hitT;
    }

    let resolved = desiredPos.clone();
    if (nearestT < 1) {
      const safeT = Math.max(this._collisionMinT, nearestT - 0.055);
      resolved = anchor.clone().lerp(desiredPos, safeT);
      if (safeT <= this._collisionMinT + 0.001) {
        resolved.y += 0.35;
      }
    }

    return this._pushPointOutOfColliders(resolved, colliders);
  }

  _resolveCameraPlacement(anchor, desiredPos, options = {}) {
    const useMeshRaycasts = this._meshRaycastsEnabled === true;
    const shouldTraceGroundPath = useMeshRaycasts && (options.orbitActive || this._groundContactTimer > 0);
    if (shouldTraceGroundPath) {
      const groundPathHit = this._raycastGroundPathCollision(anchor, desiredPos);
      if (groundPathHit) return { position: groundPathHit, hit: true };
    }

    if (useMeshRaycasts) {
      const rayHit = this._raycastCameraOcclusion(anchor, desiredPos);
      if (rayHit) return { position: rayHit, hit: true };
    }

    const colliderPosition = this._resolveCameraCollision(anchor, desiredPos);
    if (!colliderPosition.equals(desiredPos)) return { position: colliderPosition, hit: true };

    const groundPosition = this._resolveGroundCollision(desiredPos);
    if (!groundPosition.equals(desiredPos)) return { position: groundPosition, hit: true };

    return { position: desiredPos, hit: false };
  }

  _raycastGroundPathCollision(anchor, desiredPos) {
    const groundMeshes = this._getGroundMeshes();
    if (!groundMeshes.length) return null;

    const offset = new THREE.Vector3().subVectors(desiredPos, anchor);
    const maxDistance = offset.length();
    if (maxDistance < 0.35) return null;

    const direction = offset.multiplyScalar(1 / maxDistance);
    this._raycaster.set(anchor, direction);
    this._raycaster.near = 0.25;
    this._raycaster.far = maxDistance;

    const hits = this._intersectCameraSurfaces(groundMeshes, false)
      .filter(hit => hit.distance > 0.25 && hit.distance < maxDistance - 0.02);
    if (!hits.length) return null;

    const hit = hits[0];
    const safeDistance = Math.max(0.45, hit.distance - this._groundPathBackoff);
    const resolved = anchor.clone().addScaledVector(direction, safeDistance);
    const surfaceY = hit.point?.y;
    if (Number.isFinite(surfaceY)) {
      resolved.y = Math.max(resolved.y, surfaceY + this._groundClearance);
    }
    return this._resolveGroundCollision(resolved);
  }

  _raycastCameraOcclusion(anchor, desiredPos) {
    const occluders = this._getOcclusionMeshes();
    if (!occluders.length) return null;

    const offset = new THREE.Vector3().subVectors(desiredPos, anchor);
    const maxDistance = offset.length();
    if (maxDistance < 0.25) return null;

    const direction = offset.multiplyScalar(1 / maxDistance);
    this._raycaster.set(anchor, direction);
    this._raycaster.near = 0.35;
    this._raycaster.far = maxDistance;

    const hits = this._raycaster.intersectObjects(occluders, false)
      .filter(hit => hit.distance > 0.35 && hit.distance < maxDistance - 0.05);
    if (!hits.length) return null;

    const hit = hits[0];
    const safeDistance = Math.max(0.38, hit.distance - this._occlusionBackoff);
    return anchor.clone().addScaledVector(direction, safeDistance);
  }

  _intersectCameraSurfaces(objects, recursive = false) {
    const changed = [];
    for (const object of objects) {
      object.traverse?.((child) => {
        if (!child?.isMesh || !child.userData?.cameraSurface) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!material || material.side === THREE.DoubleSide) continue;
          changed.push([material, material.side]);
          material.side = THREE.DoubleSide;
        }
      });
    }

    try {
      return this._raycaster.intersectObjects(objects, recursive);
    } finally {
      for (const [material, side] of changed) {
        material.side = side;
      }
    }
  }

  _getOcclusionMeshes() {
    if (!this._occlusionMeshProvider) return [];
    try {
      const meshes = this._occlusionMeshProvider();
      return Array.isArray(meshes) ? meshes.filter(mesh => mesh?.isMesh && mesh.visible !== false) : [];
    } catch {
      return [];
    }
  }

  _resolveGroundCollision(position) {
    const fastGroundY = this._sampleGroundHeight(position);
    if (Number.isFinite(fastGroundY)) {
      const minY = fastGroundY + this._groundClearance;
      if (position.y >= minY) return position;
      const resolved = position.clone();
      resolved.y = minY;
      return resolved;
    }

    const groundMeshes = this._getGroundMeshes();
    if (!groundMeshes.length) return position;

    const origin = position.clone();
    origin.y += this._groundRayHeight;
    this._raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    this._raycaster.near = 0;
    this._raycaster.far = this._groundRayHeight + this._groundRayDepth;

    const hits = this._raycaster.intersectObjects(groundMeshes, false)
      .filter(hit => hit?.point && hit.point.y <= origin.y + 0.001);
    if (!hits.length) return position;

    const groundY = hits[0].point.y;
    const minY = groundY + this._groundClearance;
    if (position.y >= minY) return position;

    const resolved = position.clone();
    resolved.y = minY;
    return resolved;
  }

  _sampleGroundHeight(position) {
    if (!this._groundHeightProvider || !position) return null;
    try {
      const y = this._groundHeightProvider(position);
      return Number.isFinite(y) ? y : null;
    } catch {
      return null;
    }
  }

  _getGroundMeshes() {
    if (!this._groundMeshProvider) return [];
    try {
      const meshes = this._groundMeshProvider();
      return Array.isArray(meshes) ? meshes.filter(mesh => mesh?.isMesh && mesh.visible !== false) : [];
    } catch {
      return [];
    }
  }

  _getCollisionColliders() {
    if (!this._collisionProvider) return [];
    try {
      const colliders = this._collisionProvider();
      return Array.isArray(colliders) ? colliders : [];
    } catch {
      return [];
    }
  }

  _segmentOBBHit(start, end, collider, padding = 0) {
    const pos = collider?.position;
    const half = collider?.halfExtents;
    if (!pos || !half) return null;

    const yaw = collider.rotationY || 0;
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    const toLocal = (point) => {
      const dx = point.x - pos.x;
      const dz = point.z - pos.z;
      return {
        x: dx * cos - dz * sin,
        y: point.y - pos.y,
        z: dx * sin + dz * cos,
      };
    };

    const a = toLocal(start);
    const b = toLocal(end);
    const dir = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ext = {
      x: (half.x || 0) + padding,
      y: (half.y || 0) + padding,
      z: (half.z || 0) + padding,
    };

    let tMin = 0;
    let tMax = 1;
    for (const axis of ['x', 'y', 'z']) {
      const origin = a[axis];
      const delta = dir[axis];
      const limit = ext[axis];
      if (Math.abs(delta) < 0.00001) {
        if (origin < -limit || origin > limit) return null;
        continue;
      }

      let t1 = (-limit - origin) / delta;
      let t2 = (limit - origin) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    return tMin >= 0 && tMin <= 1 ? tMin : null;
  }

  _pushPointOutOfColliders(point, colliders) {
    const resolved = point.clone();
    const padding = this._collisionPadding * 0.65;

    for (const collider of colliders) {
      const pos = collider?.position;
      const half = collider?.halfExtents;
      if (!pos || !half) continue;

      const yaw = collider.rotationY || 0;
      const cos = Math.cos(-yaw);
      const sin = Math.sin(-yaw);
      const dx = resolved.x - pos.x;
      const dz = resolved.z - pos.z;
      const local = {
        x: dx * cos - dz * sin,
        y: resolved.y - pos.y,
        z: dx * sin + dz * cos,
      };
      const ext = {
        x: (half.x || 0) + padding,
        y: (half.y || 0) + padding,
        z: (half.z || 0) + padding,
      };

      if (Math.abs(local.x) > ext.x || Math.abs(local.y) > ext.y || Math.abs(local.z) > ext.z) {
        continue;
      }

      const penX = ext.x - Math.abs(local.x);
      const penY = ext.y - Math.abs(local.y);
      const penZ = ext.z - Math.abs(local.z);
      const minPen = Math.min(penX, penY, penZ);

      if (minPen === penY) {
        resolved.y += (local.y >= 0 ? 1 : -1) * (penY + 0.04);
      } else {
        const axisX = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
        const axisZ = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
        if (minPen === penX) {
          resolved.addScaledVector(axisX, (local.x >= 0 ? 1 : -1) * (penX + 0.04));
        } else {
          resolved.addScaledVector(axisZ, (local.z >= 0 ? 1 : -1) * (penZ + 0.04));
        }
      }
    }

    return resolved;
  }

  // ---- Resize ----

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // ---- Update ----

  update(delta) {
    if (this.target) {
      this.follow(this.target, delta);
    }
  }
}
