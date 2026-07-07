import * as THREE from 'three';

/**
 * Procedural city street circuit generator.
 * Builds a closed-loop track from Three.js primitives — no GLB files needed.
 *
 * Features:
 * - Closed loop with straights, curves, elevation changes
 * - Road surface with lane markings
 * - Concrete barriers on both sides
 * - Buildings along the track exterior
 * - Wet/dry surface zones
 * - Props: lamp posts, traffic cones, tire stacks
 * - Checkpoint zone definitions for TimerSystem
 */
export class TrackBuilder {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'track-root';

    // Sub-groups
    this.roadGroup = new THREE.Group();
    this.roadGroup.name = 'track-road';
    this.barrierGroup = new THREE.Group();
    this.barrierGroup.name = 'track-barriers';
    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = 'track-buildings';
    this.propGroup = new THREE.Group();
    this.propGroup.name = 'track-props';
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'track-terrain';

    this.root.add(this.roadGroup);
    this.root.add(this.barrierGroup);
    this.root.add(this.buildingGroup);
    this.root.add(this.propGroup);
    this.root.add(this.terrainGroup);

    // Generated data for game logic
    this.checkpoints = [];
    this.surfaceZones = [];     // { position, radius, type }
    this.roadCenterPoints = []; // Sampled center-line points
    this.spawnPoints = [];      // Possible respawn positions
    this.rampZones = [];        // Jump ramp trigger and height zones
  }

  /**
   * Build the full city circuit track.
   * @returns {{ checkpoints: Array, surfaceZones: Array, spawnPoints: Array }}
   */
  build() {
    this._clear();

    // Generate road center path
    const path = this._generateTrackPath(this._trackId || 'city_circuit');

    // Build road surface along path
    this._buildRoad(path);

    // Build barriers along road edges
    this._buildBarriers(path);

    // Place buildings along the outside
    this._buildBuildings(path);

    // Place props (lamps, cones)
    this._buildProps(path);

    // Race atmosphere: start gate, neon boards, corner markers
    this._buildRaceDecor(path);

    // Jump ramps for airborne moments
    // Ramps disabled
    // this._buildJumpRamps(path);

    // Place terrain/ground
    this._buildTerrain(path);

    // Define checkpoint zones
    this._defineCheckpoints(path);

    // Define surface zones (wet patches)
    this._defineSurfaceZones(path);

    return {
      checkpoints: this.checkpoints,
      surfaceZones: this.surfaceZones,
      spawnPoints: this.spawnPoints,
      roadCenterPoints: this.roadCenterPoints,
      rampZones: this.rampZones,
    };
  }

  // ==================== Path Generation ====================

  _generateTrackPath(trackId) {
    switch (trackId) {
      case 'mountain_pass':
        return this._generateMountainPath();
      case 'coastal_highway':
        return this._generateCoastalPath();
      case 'dirt_rally':
        return this._generateRallyPath();
      case 'desert_dash':
        return this._generateDesertPath();
      default:
        return this._generateCityPath();
    }
  }

  _generateCityPath() {
    // City block circuit: figure-8 style with elevation
    // Control points in XZ plane (Y is elevation)
    const scale = 1.0;
    const raw = [
      // Start straight (south)
      { x: 0, y: 0, z: 60 },
      { x: 0, y: 0, z: 30 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -30 },
      // Curve to east
      { x: 15, y: 0.5, z: -50 },
      { x: 40, y: 1, z: -55 },
      // Straight east
      { x: 70, y: 1, z: -50 },
      { x: 90, y: 1, z: -40 },
      // Curve to north
      { x: 100, y: 1.5, z: -20 },
      { x: 95, y: 2, z: 10 },
      // North straight (elevated)
      { x: 85, y: 2, z: 40 },
      { x: 70, y: 2, z: 60 },
      // Curve to west
      { x: 50, y: 2.5, z: 70 },
      { x: 30, y: 3, z: 65 },
      // West descent
      { x: 10, y: 2, z: 70 },
      { x: -10, y: 1, z: 60 },
      // Curve back to start
      { x: -20, y: 0.5, z: 40 },
      { x: -15, y: 0, z: 20 },
      { x: -5, y: 0, z: 10 },
      { x: 0, y: 0, z: 60 }, // Close loop
    ];

    return raw.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  _generateMountainPath() {
    const raw = [
      { x: -10, y: 0, z: 70 }, { x: 25, y: 1.0, z: 58 }, { x: 60, y: 3.0, z: 34 },
      { x: 78, y: 5.0, z: -4 }, { x: 54, y: 7.0, z: -42 }, { x: 8, y: 8.0, z: -60 },
      { x: -42, y: 6.5, z: -48 }, { x: -76, y: 4.5, z: -14 }, { x: -64, y: 2.2, z: 30 },
      { x: -10, y: 0, z: 70 },
    ];
    return raw.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  _generateCoastalPath() {
    const raw = [
      { x: 0, y: 0, z: 90 }, { x: 60, y: 0.2, z: 78 }, { x: 116, y: 0.1, z: 38 },
      { x: 130, y: 0, z: -16 }, { x: 90, y: 0, z: -70 }, { x: 20, y: 0.2, z: -88 },
      { x: -60, y: 0.1, z: -62 }, { x: -110, y: 0, z: -12 }, { x: -92, y: 0, z: 52 },
      { x: 0, y: 0, z: 90 },
    ];
    return raw.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  _generateRallyPath() {
    const raw = [
      { x: -20, y: 0, z: 78 }, { x: 34, y: 0.4, z: 70 }, { x: 72, y: 0.1, z: 22 },
      { x: 38, y: -0.2, z: -18 }, { x: 80, y: 0.1, z: -62 }, { x: 8, y: 0.3, z: -82 },
      { x: -58, y: 0, z: -48 }, { x: -86, y: 0.2, z: 4 }, { x: -56, y: 0, z: 46 },
      { x: -20, y: 0, z: 78 },
    ];
    return raw.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  _generateDesertPath() {
    const raw = [
      { x: 0, y: 0, z: 110 }, { x: 78, y: 0, z: 94 }, { x: 138, y: 0, z: 28 },
      { x: 118, y: 0, z: -58 }, { x: 42, y: 0, z: -112 }, { x: -42, y: 0, z: -106 },
      { x: -128, y: 0, z: -42 }, { x: -118, y: 0, z: 42 }, { x: -56, y: 0, z: 92 },
      { x: 0, y: 0, z: 110 },
    ];
    return raw.map(p => new THREE.Vector3(p.x, p.y, p.z));
  }

  // ==================== Road Surface ====================

  _buildRoad(path) {
    const roadWidth = 12;
    const roadThickness = 0.15;
    const sampleCount = 300;

    // Sample the path
    const curve = new THREE.CatmullRomCurve3(path, true);
    const samples = curve.getPoints(sampleCount);
    this.roadCenterPoints = samples.map(p => p.clone());

    // Road material
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x5f6875, roughness: 0.72, metalness: 0.05,
      emissive: 0x000000, emissiveIntensity: 0,
    });

    // Create road segments — closed loop: connect each sample to next, including wrap-around
    const N = samples.length;
    for (let i = 0; i < N; i++) {
      const a = samples[i];
      const b = samples[(i + 1) % N];
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(b, a);
      const length = dir.length();
      if (length < 0.1) continue;

      const angle = Math.atan2(dir.x, dir.z);

      const segGeo = new THREE.BoxGeometry(roadWidth, roadThickness, length);
      const seg = new THREE.Mesh(segGeo, asphaltMat);
      seg.position.copy(mid);
      seg.rotation.y = angle;
      seg.receiveShadow = true;
      seg.castShadow = true;
      seg.name = 'road-segment';
      this.roadGroup.add(seg);

      // Lane markings (dashed center line) — skip wrap-around dash to avoid double
      if (i % 5 === 0 && i < N - 1) {
        const dashGeo = new THREE.BoxGeometry(0.15, 0.02, 2.5);
        const dashMat = new THREE.MeshStandardMaterial({
          color: 0xffff00, roughness: 0.3, emissive: 0xffff00, emissiveIntensity: 0.3,
        });
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.copy(mid);
        dash.position.y += roadThickness / 2 + 0.02;
        dash.rotation.y = angle;
        dash.name = 'lane-dash';
        this.roadGroup.add(dash);
      }
    }

    // Curb strips on edges
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, roughness: 0.5, metalness: 0.1,
    });

    for (const side of [-1, 1]) {
      for (let i = 0; i < samples.length - 1; i += 4) {
        const a = samples[i];
        const b = samples[Math.min(i + 4, samples.length - 1)];
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(b, a);
        const length = dir.length();
        const angle = Math.atan2(dir.x, dir.z);

        // Offset to side
        const offsetX = Math.cos(angle) * (roadWidth / 2 + 0.2) * side;
        const offsetZ = -Math.sin(angle) * (roadWidth / 2 + 0.2) * side;

        const curbGeo = new THREE.BoxGeometry(0.3, 0.2, length);
        const curb = new THREE.Mesh(curbGeo, curbMat);
        curb.position.set(mid.x + offsetX, mid.y + 0.15, mid.z + offsetZ);
        curb.rotation.y = angle;
        curb.receiveShadow = true;
        curb.name = 'curb';
        this.roadGroup.add(curb);
      }
    }
  }

  // ==================== Barriers ====================

  _buildBarriers(path) {
    const roadWidth = 12;
    const curve = new THREE.CatmullRomCurve3(path, true);
    const samples = curve.getPoints(100);

    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0x888888, roughness: 0.4, metalness: 0.3,
    });
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x666666, roughness: 0.3, metalness: 0.5,
    });

    for (const side of [-1, 1]) {
      for (let i = 0; i < samples.length - 1; i += 2) {
        const a = samples[i];
        const b = samples[Math.min(i + 2, samples.length - 1)];
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(b, a);
        const length = dir.length();
        const angle = Math.atan2(dir.x, dir.z);

        const offsetX = Math.cos(angle) * (roadWidth / 2 + 1.5) * side;
        const offsetZ = -Math.sin(angle) * (roadWidth / 2 + 1.5) * side;

        // Concrete barrier block
        const barrierGeo = new THREE.BoxGeometry(0.5, 0.8, length);
        const barrier = new THREE.Mesh(barrierGeo, barrierMat);
        barrier.position.set(mid.x + offsetX, mid.y + 0.5, mid.z + offsetZ);
        barrier.rotation.y = angle;
        barrier.castShadow = true;
        barrier.receiveShadow = true;
        barrier.name = 'barrier-wall';
        this.barrierGroup.add(barrier);

        // Posts at segment joints
        if (i % 8 === 0) {
          const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.2, 6);
          const post = new THREE.Mesh(postGeo, postMat);
          post.position.set(a.x + offsetX, a.y + 0.7, a.z + offsetZ);
          post.castShadow = true;
          post.name = 'barrier-post';
          this.barrierGroup.add(post);
        }
      }
    }

    // Store barrier collision data (positions + radii for proximity checks)
    this.barrierPositions = [];
    for (const child of this.barrierGroup.children) {
      if (child.name === 'barrier-wall') {
        this.barrierPositions.push({
          position: child.position.clone(),
          halfExtents: new THREE.Vector3(0.5, 0.8, child.geometry.parameters.depth / 2),
          rotationY: child.rotation.y,
        });
      }
    }
  }

  // ==================== Buildings ====================

  _buildBuildings(path) {
    const curve = new THREE.CatmullRomCurve3(path, true);
    const samples = curve.getPoints(60);

    const buildingColors = [0x5a6a7a, 0x6b7b8b, 0x4a5a6a, 0x7a8a9a, 0x3a4a5a, 0x8a9aaa, 0x556677, 0x445566];
    const glassColor = 0x8899bb;

    const roadWidth = 12;

    for (let i = 0; i < samples.length; i += 4) {
      const pt = samples[i];
      // Direction at this point
      const next = samples[Math.min(i + 1, samples.length - 1)];
      const dir = new THREE.Vector3().subVectors(next, pt);
      const angle = Math.atan2(dir.x, dir.z);

      for (const side of [-1, 1]) {
        // 70% chance of building at this spot
        if (Math.random() < 0.3) continue;

        const buildingDist = roadWidth / 2 + 4 + Math.random() * 15;
        const offsetX = Math.cos(angle) * buildingDist * side;
        const offsetZ = -Math.sin(angle) * buildingDist * side;

        const bw = 3 + Math.random() * 8;
        const bh = 5 + Math.random() * 30;
        const bd = 3 + Math.random() * 8;

        const bodyGeo = new THREE.BoxGeometry(bw, bh, bd);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
          roughness: 0.6, metalness: 0.2,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(pt.x + offsetX, bh / 2, pt.z + offsetZ);
        body.rotation.y = (Math.random() - 0.5) * 0.3;
        body.castShadow = true;
        body.receiveShadow = true;
        body.name = 'building';
        this.buildingGroup.add(body);

        // Windows (rows of small boxes on facade)
        const windowMat = new THREE.MeshStandardMaterial({
          color: glassColor, roughness: 0.1, metalness: 0.1,
          emissive: 0x334455, emissiveIntensity: 0.3,
        });
        const floors = Math.floor(bh / 3);
        const windowsPerFloor = Math.floor(bw / 2.5);
        for (let f = 0; f < floors; f++) {
          for (let w = 0; w < windowsPerFloor; w++) {
            if (Math.random() < 0.3) continue;
            const winGeo = new THREE.BoxGeometry(1.2, 1.5, 0.1);
            const win = new THREE.Mesh(winGeo, windowMat);
            win.position.set(
              body.position.x + (w - windowsPerFloor / 2 + 0.5) * 2.5,
              2 + f * 3,
              body.position.z + bd / 2 + 0.05
            );
            win.rotation.y = body.rotation.y;
            win.name = 'window';
            this.buildingGroup.add(win);
          }
        }
      }
    }
  }

  // ==================== Props ====================

  _buildProps(path) {
    const curve = new THREE.CatmullRomCurve3(path, true);
    const samples = curve.getPoints(100);
    const roadWidth = 12;

    // Lamp posts along the road
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.6 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc, roughness: 0.1, emissive: 0xffffcc, emissiveIntensity: 0.8,
    });

    for (let i = 0; i < samples.length; i += 6) {
      const pt = samples[i];
      const next = samples[Math.min(i + 1, samples.length - 1)];
      const dir = new THREE.Vector3().subVectors(next, pt);
      const angle = Math.atan2(dir.x, dir.z);

      for (const side of [-1, 1]) {
        const offsetX = Math.cos(angle) * (roadWidth / 2 + 2.8) * side;
        const offsetZ = -Math.sin(angle) * (roadWidth / 2 + 2.8) * side;

        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 6, 6);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(pt.x + offsetX, 3, pt.z + offsetZ);
        pole.castShadow = true;
        pole.name = 'lamp-pole';
        this.propGroup.add(pole);

        // Lamp head
        const lampGeo = new THREE.SphereGeometry(0.25, 6, 4);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(pt.x + offsetX, 6.2, pt.z + offsetZ);
        lamp.name = 'lamp-head';
        this.propGroup.add(lamp);
      }
    }

    // Traffic cones at curve entries
    for (let i = 0; i < samples.length; i += 20) {
      const pt = samples[i];
      const next = samples[Math.min(i + 1, samples.length - 1)];
      const dir = new THREE.Vector3().subVectors(next, pt);
      const angle = Math.atan2(dir.x, dir.z);

      // 3 cones on inside of curve
      for (let c = 0; c < 3; c++) {
        const side = 1;
        const offsetX = Math.cos(angle) * (roadWidth / 2 - 1.5 - c * 1.2) * side;
        const offsetZ = -Math.sin(angle) * (roadWidth / 2 - 1.5 - c * 1.2) * side;

        const coneGeo = new THREE.ConeGeometry(0.25, 0.7, 8);
        const coneMat = new THREE.MeshStandardMaterial({
          color: 0xff6600, roughness: 0.5, metalness: 0.1,
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(pt.x + offsetX, 0.4, pt.z + offsetZ);
        cone.castShadow = true;
        cone.name = 'traffic-cone';
        this.propGroup.add(cone);
      }
    }

    // Tire stacks at sharp corners
    // (placed manually at specific path indices where curves are tight)
    const tireStackIndices = [8, 12, 28, 35, 50, 60, 72, 85];
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    for (const idx of tireStackIndices) {
      if (idx >= samples.length) continue;
      const pt = samples[idx];
      const next = samples[Math.min(idx + 1, samples.length - 1)];
      const dir = new THREE.Vector3().subVectors(next, pt);
      const angle = Math.atan2(dir.x, dir.z);

      for (const side of [-1, 1]) {
        const offsetX = Math.cos(angle) * (roadWidth / 2 + 1.2) * side;
        const offsetZ = -Math.sin(angle) * (roadWidth / 2 + 1.2) * side;

        // Stack of 3 tires
        for (let t = 0; t < 3; t++) {
          const tireGeo = new THREE.TorusGeometry(0.35, 0.15, 8, 12);
          const tire = new THREE.Mesh(tireGeo, tireMat);
          tire.position.set(pt.x + offsetX, 0.35 + t * 0.6, pt.z + offsetZ);
          tire.rotation.x = Math.PI / 2;
          tire.castShadow = true;
          tire.name = 'tire-stack';
          this.propGroup.add(tire);
        }
      }
    }
  }

  // ==================== Race Decor ====================

  _buildRaceDecor(path) {
    const curve = new THREE.CatmullRomCurve3(path, true);
    const start = curve.getPointAt(0);
    const tangent = curve.getTangentAt(0).normalize();
    const yaw = Math.atan2(tangent.x, tangent.z);

    this._buildStartGate(start, yaw);
    this._buildNeonBoards(curve);
    this._buildCornerChevrons(curve);
  }

  _buildStartGate(position, yaw) {
    const gate = new THREE.Group();
    gate.name = 'start-gate';
    gate.position.set(position.x, position.y, position.z);
    gate.rotation.y = yaw;

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x111827, roughness: 0.35, metalness: 0.7,
      emissive: 0x06131f, emissiveIntensity: 0.35,
    });
    const neonBlue = new THREE.MeshStandardMaterial({
      color: 0x66e8ff, roughness: 0.2, metalness: 0.2,
      emissive: 0x12c8ff, emissiveIntensity: 1.8,
    });
    const neonGold = new THREE.MeshStandardMaterial({
      color: 0xffd166, roughness: 0.25, metalness: 0.2,
      emissive: 0xff9f1c, emissiveIntensity: 1.2,
    });

    const pillarGeo = new THREE.BoxGeometry(0.8, 7.5, 0.8);
    for (const x of [-6.7, 6.7]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(x, 3.75, 0);
      pillar.castShadow = true;
      gate.add(pillar);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.8, 0.92), neonBlue);
      strip.position.set(x * 0.99, 3.8, 0.03);
      gate.add(strip);
    }

    const beam = new THREE.Mesh(new THREE.BoxGeometry(14.3, 0.7, 0.8), pillarMat);
    beam.position.set(0, 7.2, 0);
    beam.castShadow = true;
    gate.add(beam);

    const lightRail = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.12, 0.95), neonGold);
    lightRail.position.set(0, 6.75, 0.08);
    gate.add(lightRail);

    const sign = this._makeTextPanel('START', 0x66e8ff, 0x060b12, 768, 192);
    sign.position.set(0, 6.1, -0.46);
    sign.scale.set(5.2, 1.3, 1);
    gate.add(sign);

    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0.35 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(12, 0.03, 0.55), lineMat);
    line.position.set(0, 0.23, 0);
    gate.add(line);

    const glow = new THREE.PointLight(0x66e8ff, 2.2, 32);
    glow.position.set(0, 6.6, -1.5);
    gate.add(glow);

    this.propGroup.add(gate);
  }

  _buildNeonBoards(curve) {
    const boardSpecs = [
      { t: 0.09, side: -1, text: 'MIDNIGHT', color: 0xff4d6d },
      { t: 0.23, side: 1, text: 'NITRO', color: 0x66e8ff },
      { t: 0.44, side: -1, text: 'APEX', color: 0xffd166 },
      { t: 0.61, side: 1, text: 'DRIFT', color: 0x69f0ae },
      { t: 0.79, side: -1, text: 'OUTRUN', color: 0xf72585 },
    ];

    for (const spec of boardSpecs) {
      const pt = curve.getPointAt(spec.t);
      const tangent = curve.getTangentAt(spec.t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const sideX = Math.cos(yaw) * spec.side;
      const sideZ = -Math.sin(yaw) * spec.side;

      const panel = this._makeTextPanel(spec.text, spec.color, 0x050912, 768, 256);
      panel.position.set(pt.x + sideX * 13, pt.y + 4.5, pt.z + sideZ * 13);
      panel.rotation.y = yaw + (spec.side > 0 ? -Math.PI / 2 : Math.PI / 2);
      panel.scale.set(4.8, 1.6, 1);
      this.propGroup.add(panel);

      const back = new THREE.Mesh(
        new THREE.BoxGeometry(5.1, 1.9, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.65 })
      );
      back.position.copy(panel.position);
      back.rotation.copy(panel.rotation);
      back.position.y -= 0.02;
      back.translateZ(0.08);
      back.castShadow = true;
      this.propGroup.add(back);
    }
  }

  _buildCornerChevrons(curve) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd166, roughness: 0.35, metalness: 0.25,
      emissive: 0xff9f1c, emissiveIntensity: 0.9,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x101820, roughness: 0.5, metalness: 0.35,
    });

    for (const t of [0.17, 0.33, 0.49, 0.66, 0.84]) {
      const pt = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);

      for (const side of [-1, 1]) {
        const sideX = Math.cos(yaw) * side;
        const sideZ = -Math.sin(yaw) * side;
        const baseX = pt.x + sideX * 7.2;
        const baseZ = pt.z + sideZ * 7.2;

        const board = new THREE.Group();
        board.position.set(baseX, pt.y + 1.2, baseZ);
        board.rotation.y = yaw + (side > 0 ? -0.8 : 0.8);

        const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.14), darkMat);
        back.castShadow = true;
        board.add(back);

        for (let i = -1; i <= 1; i++) {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.82, 0.16), mat);
          stripe.position.x = i * 0.48;
          stripe.rotation.z = side > 0 ? -0.7 : 0.7;
          board.add(stripe);
        }

        this.propGroup.add(board);
      }
    }
  }

  _buildJumpRamps(path) {
    const curve = new THREE.CatmullRomCurve3(path, true);
    const rampSpecs = [
      { t: 0.18, width: 7.4, length: 13.5, height: 1.25, launchBoost: 4.6 },
      { t: 0.39, width: 7.8, length: 15.0, height: 1.45, launchBoost: 5.1 },
      { t: 0.73, width: 7.2, length: 12.5, height: 1.15, launchBoost: 4.4 },
    ];

    const rampMat = new THREE.MeshStandardMaterial({
      color: 0xe5b340,
      roughness: 0.48,
      metalness: 0.12,
      emissive: 0x3b2a05,
      emissiveIntensity: 0.18,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x111820,
      roughness: 0.45,
      metalness: 0.1,
    });

    for (const spec of rampSpecs) {
      const pt = curve.getPointAt(spec.t);
      const tangent = curve.getTangentAt(spec.t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);

      const ramp = new THREE.Group();
      ramp.name = 'jump-ramp';
      ramp.position.set(pt.x, pt.y + 0.16, pt.z);
      ramp.rotation.y = yaw;

      const body = new THREE.Mesh(
        this._makeRampGeometry(spec.width, spec.length, spec.height),
        rampMat
      );
      body.castShadow = true;
      body.receiveShadow = true;
      body.name = 'jump-ramp-body';
      ramp.add(body);

      for (const x of [-spec.width * 0.25, spec.width * 0.25]) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.035, spec.length * 0.78),
          stripeMat
        );
        stripe.position.set(x, spec.height * 0.55 + 0.035, spec.length * 0.05);
        stripe.rotation.x = -Math.atan2(spec.height, spec.length);
        stripe.name = 'jump-ramp-stripe';
        ramp.add(stripe);
      }

      this.propGroup.add(ramp);
      this.rampZones.push({
        x: Number(pt.x.toFixed(3)),
        y: Number(pt.y.toFixed(3)),
        z: Number(pt.z.toFixed(3)),
        yaw,
        width: spec.width,
        length: spec.length,
        height: spec.height,
        launchBoost: spec.launchBoost,
        minSpeedKmh: 58,
        glideTime: 1.15,
      });
    }
  }

  _makeRampGeometry(width, length, height) {
    const hw = width / 2;
    const hl = length / 2;
    const vertices = new Float32Array([
      -hw, 0, -hl,
       hw, 0, -hl,
      -hw, height, hl,
       hw, height, hl,
      -hw, -0.08, -hl,
       hw, -0.08, -hl,
      -hw, -0.08, hl,
       hw, -0.08, hl,
    ]);
    const indices = [
      0, 1, 2, 1, 3, 2,
      4, 6, 5, 5, 6, 7,
      0, 2, 4, 4, 2, 6,
      1, 5, 3, 5, 7, 3,
      2, 3, 6, 3, 7, 6,
      0, 4, 1, 1, 4, 5,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  _makeTextPanel(text, color, bgColor, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = `#${bgColor.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = Math.max(6, width * 0.012);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);

    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 22;
    ctx.font = `900 ${Math.floor(height * 0.46)}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2 + height * 0.04);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  }

  // ==================== Terrain ====================

  _buildTerrain(path) {
    // Large ground plane
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4f7d42, roughness: 0.9, metalness: 0,
      emissive: 0x000000, emissiveIntensity: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.terrainGroup.add(ground);

    // City blocks (sidewalks / plaza areas)
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x999999, roughness: 0.7, metalness: 0.05,
    });

    // Place sidewalk blocks near buildings
    for (const building of this.buildingGroup.children) {
      if (building.name !== 'building') continue;
      const sidewalkGeo = new THREE.BoxGeometry(
        building.geometry.parameters.width + 1.5,
        0.1,
        building.geometry.parameters.depth + 1.5
      );
      const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      sidewalk.position.copy(building.position);
      sidewalk.position.y = 0.05;
      sidewalk.receiveShadow = true;
      sidewalk.name = 'sidewalk';
      this.terrainGroup.add(sidewalk);
    }
  }

  // ==================== Checkpoints ====================

  _defineCheckpoints(path) {
    const curve = new THREE.CatmullRomCurve3(path, true);
    const total = 12;
    this.checkpoints = [];

    for (let i = 0; i < total; i++) {
      const t = i / total;
      const pt = curve.getPointAt(t);
      this.checkpoints.push({
        x: pt.x,
        y: pt.y,
        z: pt.z,
        radius: i === 0 ? 10 : 7, // Finish line wider
      });

      // Visual checkpoint marker (invisible in gameplay, debug only)
      // const markerGeo = new THREE.RingGeometry(5, 6, 32);
      // const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide }));
      // marker.rotation.x = -Math.PI / 2;
      // marker.position.copy(pt);
      // marker.position.y += 0.5;
      // this.roadGroup.add(marker);
    }

    // Spawn points at checkpoint 0 (finish line) facing forward
    const startPt = curve.getPointAt(0);
    const startTangent = curve.getTangentAt(0);
    const startAngle = Math.atan2(startTangent.x, startTangent.z);

    this.spawnPoints = [
      { x: startPt.x - 2, y: startPt.y + 1, z: startPt.z - 3, yaw: startAngle },
      { x: startPt.x + 2, y: startPt.y + 1, z: startPt.z - 3, yaw: startAngle },
      { x: startPt.x, y: startPt.y + 1, z: startPt.z - 5, yaw: startAngle },
    ];
  }

  // ==================== Surface Zones ====================

  _defineSurfaceZones(path) {
    const curve = new THREE.CatmullRomCurve3(path, true);

    // Place wet zones at specific positions along the track
    const wetSpots = [
      { t: 0.15, radius: 18, type: 'wet_asphalt' },
      { t: 0.42, radius: 14, type: 'wet_asphalt' },
      { t: 0.68, radius: 16, type: 'wet_asphalt' },
      { t: 0.82, radius: 12, type: 'wet_asphalt' },
    ];

    const wetMat = new THREE.MeshStandardMaterial({
      color: 0x334455, roughness: 0.3, metalness: 0.3,
      transparent: true, opacity: 0.4,
    });

    this.surfaceZones = [];

    for (const spot of wetSpots) {
      const pt = curve.getPointAt(spot.t);
      this.surfaceZones.push({
        x: pt.x, y: pt.y, z: pt.z,
        radius: spot.radius,
        type: spot.type,
      });

      // Visual wet patch
      const patchGeo = new THREE.CircleGeometry(spot.radius, 32);
      const patch = new THREE.Mesh(patchGeo, wetMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(pt.x, 0.2, pt.z);
      patch.receiveShadow = true;
      patch.name = 'wet-zone';
      this.roadGroup.add(patch);
    }

    // Dirt/gravel shortcuts (off-track but usable)
    const dirtSpots = [
      { t: 0.25, radius: 10, type: 'dirt' },
      { t: 0.55, radius: 10, type: 'dirt' },
    ];

    const dirtMat = new THREE.MeshStandardMaterial({
      color: 0x8b7355, roughness: 0.95, metalness: 0,
      transparent: true, opacity: 0.5,
    });

    for (const spot of dirtSpots) {
      const pt = curve.getPointAt(spot.t);
      const tangent = curve.getTangentAt(spot.t);
      // Offset to the inside of the track
      const perpX = -tangent.z;
      const perpZ = tangent.x;
      const offsetDist = 15;

      this.surfaceZones.push({
        x: pt.x + perpX * offsetDist,
        y: pt.y,
        z: pt.z + perpZ * offsetDist,
        radius: spot.radius,
        type: spot.type,
      });

      const patchGeo = new THREE.CircleGeometry(spot.radius, 24);
      const patch = new THREE.Mesh(patchGeo, dirtMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(pt.x + perpX * offsetDist, 0.15, pt.z + perpZ * offsetDist);
      patch.receiveShadow = true;
      patch.name = 'dirt-zone';
      this.roadGroup.add(patch);
    }
  }

  // ==================== Helpers ====================

  /**
   * Get all barrier collider data for physics collision detection.
   */
  getBarrierColliders() {
    return this.barrierPositions || [];
  }

  /**
   * Get road mesh for surface material assignment.
   */
  getRoadMeshes() {
    return this.roadGroup.children.filter(c => c.isMesh && c.name === 'road-segment');
  }

  /**
   * Get collidable objects (barriers + buildings).
   */
  getCollidables() {
    return [
      ...this.barrierGroup.children,
      ...this.buildingGroup.children,
    ].filter(c => c.isMesh);
  }

  // ==================== Cleanup ====================

  _clear() {
    for (const group of [this.roadGroup, this.barrierGroup, this.buildingGroup, this.propGroup, this.terrainGroup]) {
      while (group.children.length > 0) {
        const child = group.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
        group.remove(child);
      }
    }
    this.checkpoints = [];
    this.surfaceZones = [];
    this.roadCenterPoints = [];
    this.spawnPoints = [];
    this.rampZones = [];
    this.barrierPositions = [];
  }

  dispose() {
    this._clear();
    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
