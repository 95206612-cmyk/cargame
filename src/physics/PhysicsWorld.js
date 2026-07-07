import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 10;
    this.world.allowSleep = true;

    this.bodies = [];
    this.fixedTimeStep = 1 / 120;
    this.maxSubSteps = 8;
    this._surfaceFriction = new Map();
    this._initSurfaceDefaults();
  }

  _initSurfaceDefaults() {
    const s = this._surfaceFriction;
    s.set('asphalt',     { friction: 1.0,  rollingResistance: 1.0 });
    s.set('concrete',    { friction: 0.95, rollingResistance: 1.05 });
    s.set('dirt',        { friction: 0.50, rollingResistance: 1.18 });
    s.set('grass',       { friction: 0.46, rollingResistance: 1.08 });
    s.set('sand',        { friction: 0.34, rollingResistance: 1.35 });
    s.set('wet_asphalt', { friction: 0.62, rollingResistance: 1.08 });
    s.set('ice',         { friction: 0.08, rollingResistance: 1.0 });
  }

  loadSurfaceConfig(surfaceCfg) {
    if (!surfaceCfg) return;
    for (const [name, cfg] of Object.entries(surfaceCfg)) {
      this._surfaceFriction.set(name, {
        friction: cfg.friction ?? 1.0,
        rollingResistance: cfg.rollingResistance ?? 1.0,
      });
    }
  }

  step(delta) {
    const dt = Math.min(delta, 0.1);
    this.world.step(this.fixedTimeStep, dt, this.maxSubSteps);
  }

  addGround(height = 0) {
    const shape = new CANNON.Plane();
    const body = new CANNON.Body({ mass: 0, shape });
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    body.position.set(0, height - 0.1, 0);
    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  addBody(mass, shape, pos, quat) {
    const body = new CANNON.Body({
      mass,
      shape,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      quaternion: quat ? new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w) : new CANNON.Quaternion(),
    });
    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  addTrimeshFromThreeMesh(mesh, options = {}) {
    const geometry = mesh?.geometry;
    const position = geometry?.getAttribute?.('position');
    if (!position?.count) return null;

    mesh.updateWorldMatrix?.(true, false);
    const matrix = mesh.matrixWorld?.elements;
    if (!matrix) return null;

    const triangleCount = geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(position.count / 3);
    const maxTriangles = Number.isFinite(options.maxTriangles) ? options.maxTriangles : 120000;
    if (triangleCount <= 0 || triangleCount > maxTriangles) {
      console.warn(`[PhysicsWorld] Skipping road trimesh "${mesh.name || 'unnamed'}": triangles=${triangleCount}`);
      return null;
    }

    const vertices = new Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const out = i * 3;
      vertices[out] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      vertices[out + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      vertices[out + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    }

    const sourceIndex = geometry.index;
    const indexCount = sourceIndex ? sourceIndex.count : position.count;
    const indices = new Array(indexCount);
    for (let i = 0; i < indexCount; i++) {
      indices[i] = sourceIndex ? sourceIndex.getX(i) : i;
    }

    const shape = new CANNON.Trimesh(vertices, indices);
    shape.updateTree?.();
    const body = new CANNON.Body({ mass: 0, shape });
    body.allowSleep = true;
    body.userData = {
      source: options.source || 'road-trimesh',
      name: mesh.name || 'road',
      triangles: triangleCount,
    };
    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  removeBody(body) {
    if (!body || !this.world) return;
    this.world.removeBody(body);
    const idx = this.bodies.indexOf(body);
    if (idx !== -1) this.bodies.splice(idx, 1);
  }

  box(hx, hy, hz) {
    return new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
  }

  cylinder(radius, height) {
    return new CANNON.Cylinder(radius, radius, height, 16);
  }

  sphere(radius) {
    return new CANNON.Sphere(radius);
  }

  getSurfaceFriction(name) {
    return this._surfaceFriction.get(name) || this._surfaceFriction.get('asphalt');
  }

  destroy() {
    if (!this.world) return;
    for (const body of this.bodies) {
      this.world.removeBody(body);
    }
    this.bodies = [];
    this.world = null;
  }
}
