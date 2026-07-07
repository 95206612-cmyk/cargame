import * as THREE from 'three';

export class EffectManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.particlePool = [];
    this.maxParticles = 1000;

    this.weather = 'clear'; // 'clear' | 'rain' | 'fog'
    this.rainSystem = null;
    this.fogTarget = null;
  }

  // ---- Particles ----

  emitParticles(position, count = 10, config = {}) {
    const {
      color = 0xffffff,
      size = 0.1,
      lifetime = 1.0,
      spread = 0.5,
      velocity = 2.0,
      direction = null,
      directionJitter = 0.45,
      upward = 0.5,
      gravity = 0,
      grow = 1,
      opacity = 1,
      fadePower = 1,
    } = config;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        // Recycle oldest
        const old = this.particles.shift();
        if (old) {
          this.scene.remove(old.mesh);
          old.mesh.geometry?.dispose();
          old.mesh.material?.dispose();
        }
      }

      const geo = new THREE.SphereGeometry(size, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * spread;
      mesh.position.y += (Math.random() - 0.5) * spread;
      mesh.position.z += (Math.random() - 0.5) * spread;

      let vel;
      if (direction?.isVector3) {
        vel = direction.clone().normalize().multiplyScalar(velocity * (0.65 + Math.random() * 0.7));
        vel.x += (Math.random() - 0.5) * directionJitter;
        vel.y += (Math.random() - 0.5) * directionJitter + Math.random() * upward;
        vel.z += (Math.random() - 0.5) * directionJitter;
      } else {
        vel = new THREE.Vector3(
          (Math.random() - 0.5) * velocity,
          Math.random() * velocity * 0.5,
          (Math.random() - 0.5) * velocity,
        );
      }

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: lifetime,
        maxLife: lifetime,
        baseSize: size,
        grow,
        gravity,
        startOpacity: opacity,
        fadePower,
      });
    }
  }

  setParticleLimit(max) {
    this.maxParticles = max;
  }

  // ---- Weather ----

  setWeather(type) {
    this.weather = type;
    if (type === 'rain') this._startRain();
    else this._stopRain();

    if (type === 'fog') {
      this.fogTarget = 0.003; // dense fog
    } else {
      this.fogTarget = 0.001; // light/default fog
    }
  }

  _startRain() {
    if (this.rainSystem) return;

    const count = 2000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x8899cc,
      size: 0.08,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.rainSystem = new THREE.Points(geo, mat);
    this.scene.add(this.rainSystem);
  }

  _stopRain() {
    if (this.rainSystem) {
      this.scene.remove(this.rainSystem);
      this.rainSystem.geometry.dispose();
      this.rainSystem.material.dispose();
      this.rainSystem = null;
    }
  }

  // ---- Vehicle effects ----

  updateNitro(vehicleMesh, active) {
    if (!vehicleMesh) return;
    // Placeholder: nitro glow effect
    // Will emit particles from exhaust position in future
  }

  updateHeadlights(vehicleMesh, on) {
    // Placeholder for headlight cone/sphere
  }

  updateBrakeLights(vehicleMesh, braking) {
    // Placeholder for brake light glow
  }

  // ---- Update loop ----

  update(delta) {
    // Update active particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry?.dispose();
        p.mesh.material?.dispose();
        this.particles.splice(i, 1);
        this.particlePool.push(p);
      } else {
        p.velocity.y += (p.gravity || 0) * delta;
        p.mesh.position.x += p.velocity.x * delta;
        p.mesh.position.y += p.velocity.y * delta;
        p.mesh.position.z += p.velocity.z * delta;
        const age = 1 - p.life / p.maxLife;
        const opacity = Math.pow(Math.max(0, p.life / p.maxLife), p.fadePower || 1);
        p.mesh.material.opacity = (p.startOpacity ?? 1) * opacity;
        const scale = (p.baseSize || 1) * (1 + Math.max(0, p.grow || 1) * age);
        p.mesh.scale.setScalar(scale / Math.max(p.baseSize || 1, 0.0001));
      }
    }

    // Rain animation
    if (this.rainSystem && this.weather === 'rain') {
      const pos = this.rainSystem.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= 12 * delta;
        if (pos[i + 1] < -5) {
          pos[i + 1] = 30;
          pos[i] = (Math.random() - 0.5) * 80;
          pos[i + 2] = (Math.random() - 0.5) * 80;
        }
      }
      this.rainSystem.geometry.attributes.position.needsUpdate = true;
    }

    // Fog transition
    if (this.scene.fog && this.fogTarget !== null) {
      const current = this.scene.fog.density || 0.001;
      const target = this.fogTarget;
      if (Math.abs(current - target) > 0.0001) {
        this.scene.fog.density = current + (target - current) * Math.min(delta * 2, 1);
      }
    }
  }
}
