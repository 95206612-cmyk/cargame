import * as THREE from 'three';

/**
 * Particle effect manager with texture-atlas support.
 * Loads particle textures from asset-path.json config, supports
 * smoke, fire, spark, dust, and nitro particle types.
 *
 * Usage:
 *   const pm = new ParticleManager(assetLoader, scene);
 *   await pm.loadTextures();
 *   pm.emit('smoke-puff', position, 20);
 */
export class ParticleManager {
  constructor(assetLoader, scene) {
    this._loader = assetLoader;
    this.scene = scene;
    this.textures = new Map();   // typeId -> THREE.Texture
    this._activeSystems = [];
    this.maxParticles = 1000;
    this._particles = [];

    // Object pool — recycled sprites and materials
    this._pool = [];
    this._poolMax = 200; // Max pooled items (excess gets disposed)

    // Per-type emission throttle (for particle caps)
    this._emitCounters = {};
    this._emitThrottle = 1.0;    // Multiplier: 1.0 = normal, 0.0 = off

    // Procedural texture cache for built-in types
    this._proceduralTextures = new Map();
  }

  /**
   * Load all particle textures defined in asset-path.json.
   * @param {string[]} [types] - Specific texture IDs to load. Loads all if omitted.
   */
  async loadTextures(types) {
    const paths = await this._loadAssetPaths();
    const particlePaths = paths?.textures?.particles || {};

    const ids = types || Object.keys(particlePaths);
    for (const id of ids) {
      const url = particlePaths[id];
      if (!url) {
        console.warn(`[ParticleManager] Unknown particle texture: "${id}"`);
        continue;
      }

      if (this.textures.has(id)) continue;

      try {
        const texture = await this._loader._loadTexture(url, { _progress: null });
        this.textures.set(id, texture);
      } catch (err) {
        console.warn(`[ParticleManager] Failed to load particle texture "${id}":`, err.message);
      }
    }
  }

  /**
   * Emit a burst of particles.
   * @param {string} type - Particle texture ID (matches asset-path.json textures.particles keys)
   * @param {THREE.Vector3|Object} position - Emission origin
   * @param {number} [count=10]
   * @param {Object} [options]
   * @param {number} [options.lifetime=1.0] - Seconds each particle lives
   * @param {number} [options.spread=0.5] - Spawn radius
   * @param {number} [options.speed=2.0] - Base particle velocity
   * @param {number|string} [options.color=0xffffff] - Particle tint color
   * @param {number} [options.size=0.2] - Particle size
   * @param {THREE.Vector3} [options.direction] - Base emission direction (normalized)
   * @param {number} [options.coneAngle=Math.PI] - Spread cone half-angle
   */
  emit(type, position, count = 10, options = {}) {
    if (this._emitThrottle <= 0) return;
    const actualCount = Math.floor(count * this._emitThrottle);
    if (actualCount <= 0) return;

    const texture = this.textures.get(type) || this._getProceduralTexture(type);
    const {
      lifetime = 1.0,
      spread = 0.5,
      speed = 2.0,
      color = 0xffffff,
      size = 0.2,
      direction = null,
      coneAngle = Math.PI,
    } = options;

    for (let i = 0; i < actualCount; i++) {
      // Try pool first, then create new
      let sprite, mat;
      const pooled = this._pool.pop();
      if (pooled) {
        sprite = pooled.sprite;
        mat = pooled.material;
        mat.color.set(color);
        mat.opacity = 1;
        sprite.material = mat;
        sprite.visible = true;
      } else {
        if (this._particles.length >= this.maxParticles) {
          // Recycle oldest active particle instead of disposing
          const old = this._particles.shift();
          if (old) {
            sprite = old.mesh;
            mat = old.mesh.material;
            mat.color.set(color);
            mat.opacity = 1;
            sprite.visible = true;
          } else {
            mat = new THREE.SpriteMaterial({
              map: texture || null,
              color: new THREE.Color(color),
              transparent: true,
              opacity: 1,
              blending: THREE.NormalBlending,
              depthWrite: false,
            });
            sprite = new THREE.Sprite(mat);
            this.scene.add(sprite);
          }
        } else {
          mat = new THREE.SpriteMaterial({
            map: texture || null,
            color: new THREE.Color(color),
            transparent: true,
            opacity: 1,
            blending: THREE.NormalBlending,
            depthWrite: false,
          });
          sprite = new THREE.Sprite(mat);
          this.scene.add(sprite);
        }
      }
      sprite.position.copy(position);

      // Random spread within cone
      let vel;
      if (direction) {
        const baseDir = direction.clone().normalize();
        // Random direction within cone
        const randAxis = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        if (randAxis.dot(baseDir) < 0) randAxis.negate();
        const angle = Math.random() * coneAngle;
        vel = baseDir.clone().applyAxisAngle(randAxis, angle).multiplyScalar(speed * (0.5 + Math.random()));
      } else {
        vel = new THREE.Vector3(
          (Math.random() - 0.5) * speed,
          Math.random() * speed,
          (Math.random() - 0.5) * speed
        );
      }

      sprite.position.x += (Math.random() - 0.5) * spread;
      sprite.position.y += (Math.random() - 0.5) * spread;
      sprite.position.z += (Math.random() - 0.5) * spread;

      sprite.scale.setScalar(size);

      // Only add to scene if newly created (not from pool/recycle)
      if (!sprite.parent) {
        this.scene.add(sprite);
      }

      this._particles.push({
        mesh: sprite,
        velocity: vel,
        life: lifetime,
        maxLife: lifetime,
        baseSize: size,
      });
    }
  }

  /**
   * Create a continuous particle trail system (e.g., smoke from tires).
   * @returns {Object} trail controller with update() and stop() methods
   */
  createTrail(type, options = {}) {
    const {
      emitRate = 30,        // particles per second
      lifetime = 0.8,
      size = 0.3,
      color = 0x888888,
      speed = 0.5,
      spread = 0.1,
    } = options;

    let active = true;
    let accumulator = 0;

    const controller = {
      update: (delta, position) => {
        if (!active) return;
        accumulator += delta * emitRate;
        while (accumulator >= 1) {
          accumulator -= 1;
          this.emit(type, position, 1, {
            lifetime, size, color, speed, spread,
          });
        }
      },
      stop: () => { active = false; },
      get active() { return active; },
    };

    this._activeSystems.push(controller);
    return controller;
  }

  /**
   * Emit drift smoke from wheel position.
   * Auto-throttled by particle count.
   * @param {THREE.Vector3|Object} position
   * @param {number} [intensity=1] - Emission rate multiplier
   */
  emitDriftSmoke(position, intensity = 1) {
    if (this._emitThrottle <= 0) return;
    const count = Math.floor(2 * intensity * this._emitThrottle);
    if (count <= 0) return;

    this.emit('smoke-puff', position, count, {
      lifetime: 0.4 + Math.random() * 0.3,
      size: 0.2 + Math.random() * 0.2,
      speed: 0.3 + Math.random() * 0.5,
      color: 0xcccccc,
      spread: 0.15,
    });
  }

  /**
   * Emit collision/grinding sparks.
   * @param {THREE.Vector3|Object} position
   * @param {number} [count=5]
   */
  emitSparks(position, count = 5) {
    if (this._emitThrottle <= 0) return;
    const n = Math.floor(count * this._emitThrottle);
    if (n <= 0) return;

    this.emit('spark', position, n, {
      lifetime: 0.15 + Math.random() * 0.25,
      size: 0.04 + Math.random() * 0.06,
      speed: 4 + Math.random() * 6,
      color: 0xffaa00,
      spread: 0.1,
    });
  }

  /**
   * Emit nitro flame burst from exhaust.
   * @param {THREE.Vector3|Object} position
   * @param {number} [count=3]
   */
  emitNitroFlame(position, count = 3) {
    if (this._emitThrottle <= 0) return;
    const n = Math.floor(count * this._emitThrottle);
    if (n <= 0) return;

    this.emit('fire-burst', position, n, {
      lifetime: 0.15 + Math.random() * 0.2,
      size: 0.3 + Math.random() * 0.3,
      speed: 2 + Math.random() * 3,
      color: 0xff6600,
      spread: 0.12,
    });
  }

  /**
   * Emit high-speed road dust from wheels.
   * @param {THREE.Vector3|Object} position
   * @param {number} [speedKmh=0]
   */
  emitRoadDust(position, speedKmh = 0) {
    if (this._emitThrottle <= 0 || speedKmh < 40) return;
    const intensity = Math.min(1, (speedKmh - 40) / 120);
    const count = Math.floor(1 * intensity * this._emitThrottle);
    if (count <= 0) return;

    this.emit('dust', position, count, {
      lifetime: 0.6 + Math.random() * 0.4,
      size: 0.08 + Math.random() * 0.1,
      speed: 0.2 + Math.random() * 0.4,
      color: 0xbbaa88,
      spread: 0.2,
    });
  }

  // ==================== Quality control ====================

  /**
   * Set quality level — controls particle throttle.
   * @param {'ultra'|'high'|'medium'|'low'} quality
   * @param {number} [particleLimit] - Optional override from quality-settings.json
   */
  setQuality(quality, particleLimit) {
    if (particleLimit !== undefined) {
      this.maxParticles = particleLimit;
    }

    switch (quality) {
      case 'ultra':
        this._emitThrottle = 1.0;
        break;
      case 'high':
        this._emitThrottle = 1.0;
        break;
      case 'medium':
        this._emitThrottle = 0.6;
        break;
      case 'low':
      default:
        this._emitThrottle = 0;  // Disable all particles on low
        this._particles.forEach(p => {
          this.scene.remove(p.mesh);
          p.mesh.material?.dispose();
        });
        this._particles = [];
        this._pool.forEach(p => p.material?.dispose());
        this._pool = [];
        break;
    }
  }

  // ==================== Update ====================

  update(delta) {
    // Update all particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= delta;

      if (p.life <= 0) {
        // Recycle into pool instead of dispose
        if (this._pool.length < this._poolMax) {
          p.mesh.visible = false;
          this.scene.remove(p.mesh);
          this._pool.push({ sprite: p.mesh, material: p.mesh.material });
        } else {
          this.scene.remove(p.mesh);
          p.mesh.material?.dispose();
        }
        this._particles.splice(i, 1);
      } else {
        p.mesh.position.x += p.velocity.x * delta;
        p.mesh.position.y += p.velocity.y * delta;
        p.mesh.position.z += p.velocity.z * delta;

        // Fade out
        const opacity = p.life / p.maxLife;
        p.mesh.material.opacity = opacity;
        // Shrink
        p.mesh.scale.setScalar(p.baseSize * (0.5 + 0.5 * opacity));
      }
    }

    // Clean up stopped trails
    this._activeSystems = this._activeSystems.filter(s => s.active);
  }

  // ==================== Helpers ====================

  setParticleLimit(max) {
    this.maxParticles = max;
  }

  /**
   * Generate a procedural texture for built-in particle types.
   * Avoids requiring external texture files for smoke, spark, fire, dust.
   */
  _getProceduralTexture(type) {
    if (this._proceduralTextures.has(type)) {
      return this._proceduralTextures.get(type);
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Radial gradient for soft particle
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

    switch (type) {
      case 'smoke-puff':
      case 'dust':
        gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
        gradient.addColorStop(0.3, 'rgba(200,200,200,0.5)');
        gradient.addColorStop(0.7, 'rgba(100,100,100,0.1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        break;
      case 'spark':
        gradient.addColorStop(0, 'rgba(255,255,200,1)');
        gradient.addColorStop(0.2, 'rgba(255,200,50,0.8)');
        gradient.addColorStop(0.5, 'rgba(255,100,0,0.3)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        break;
      case 'fire-burst':
        gradient.addColorStop(0, 'rgba(255,255,180,1)');
        gradient.addColorStop(0.15, 'rgba(255,180,30,0.9)');
        gradient.addColorStop(0.4, 'rgba(255,80,0,0.6)');
        gradient.addColorStop(0.7, 'rgba(200,20,0,0.15)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        break;
      default:
        gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    this._proceduralTextures.set(type, texture);
    return texture;
  }

  get activeCount() {
    return this._particles.length;
  }

  async _loadAssetPaths() {
    const cached = this._loader.get('asset-paths');
    if (cached) return cached;

    try {
      const paths = await this._loader._loadJSON('./config/asset-path.json');
      this._loader.loaded.set('asset-paths', paths);
      return paths;
    } catch {
      return { textures: { particles: {} } };
    }
  }

  dispose() {
    for (const p of this._particles) {
      this.scene.remove(p.mesh);
      p.mesh.material?.dispose();
    }
    this._particles = [];
    for (const p of this._pool) {
      p.material?.dispose();
    }
    this._pool = [];
    this._activeSystems = [];
    for (const [id, tex] of this.textures) {
      tex.dispose();
    }
    this.textures.clear();
  }
}
