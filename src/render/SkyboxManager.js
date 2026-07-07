import * as THREE from 'three';

const SUNNY_WEATHERS = new Set(['clear_morning', 'clear_noon', 'clear_evening']);
const CLOUD_SKYBOX_ID = 'city-circuit-cloud';
const CLOUD_SKYBOX_RENDER_ORDER = -999;
const CLOUD_SKYBOX_TARGET_RADIUS = 1450;
const SUN_RENDER_ORDER = -998;
const SUN_DISTANCE = 1120;

const SKY_PRESETS = {
  clear_morning: {
    top: 0x6fb7ff,
    horizon: 0xffd0a2,
    bottom: 0xbfe7ff,
    sunColor: 0xffc37a,
    sunDirection: [-0.62, 0.46, 0.28],
    sunIntensity: 1.15,
    cloudColor: 0xffffff,
    cloudOpacity: 0.08,
  },
  clear_noon: {
    top: 0x4fa8ff,
    horizon: 0xbfefff,
    bottom: 0xeaf8ff,
    sunColor: 0xffffff,
    sunDirection: [0.33, 0.88, 0.24],
    sunIntensity: 1.25,
    cloudColor: 0xffffff,
    cloudOpacity: 0.05,
  },
  clear_evening: {
    top: 0x344c95,
    horizon: 0xff9d63,
    bottom: 0xffc08a,
    sunColor: 0xff8844,
    sunDirection: [0.82, 0.2, -0.52],
    sunIntensity: 0.92,
    cloudColor: 0xffb48a,
    cloudOpacity: 0.18,
  },
  rain: {
    top: 0x516170,
    horizon: 0x9eb4c4,
    bottom: 0xb9c7d0,
    sunColor: 0xc7d8e8,
    sunDirection: [0.3, 0.62, 0.38],
    sunIntensity: 0.28,
    cloudColor: 0x50606d,
    cloudOpacity: 0.56,
  },
  snow: {
    top: 0xb8cee4,
    horizon: 0xd8e7f1,
    bottom: 0xf4fbff,
    sunColor: 0xe9f6ff,
    sunDirection: [0.24, 0.72, 0.42],
    sunIntensity: 0.48,
    cloudColor: 0xffffff,
    cloudOpacity: 0.36,
  },
};

export class SkyboxManager {
  constructor(scene, assetLoader = null) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.currentWeather = 'clear_noon';
    this._target = { ...SKY_PRESETS.clear_noon };
    this._time = 0;
    this._cloudSkybox = null;
    this._cloudSkyboxUrl = null;
    this._cloudSkyboxLoading = null;
    this._cloudSkyboxVisibleTarget = SUNNY_WEATHERS.has(this.currentWeather);
    this._cloudSkyboxOffset = new THREE.Vector3();
    this._tmpBox = new THREE.Box3();
    this._tmpSize = new THREE.Vector3();
    this._tmpCenter = new THREE.Vector3();

    this.material = new THREE.ShaderMaterial({
      name: 'procedural-weather-skybox',
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(SKY_PRESETS.clear_noon.top) },
        horizonColor: { value: new THREE.Color(SKY_PRESETS.clear_noon.horizon) },
        bottomColor: { value: new THREE.Color(SKY_PRESETS.clear_noon.bottom) },
        sunColor: { value: new THREE.Color(SKY_PRESETS.clear_noon.sunColor) },
        sunDirection: { value: new THREE.Vector3(...SKY_PRESETS.clear_noon.sunDirection).normalize() },
        sunIntensity: { value: SKY_PRESETS.clear_noon.sunIntensity },
        cloudColor: { value: new THREE.Color(SKY_PRESETS.clear_noon.cloudColor) },
        cloudOpacity: { value: SKY_PRESETS.clear_noon.cloudOpacity },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vec4 mvPosition = viewMatrix * worldPosition;
          gl_Position = projectionMatrix * mvPosition;
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform vec3 cloudColor;
        uniform float sunIntensity;
        uniform float cloudOpacity;
        uniform float time;

        float softNoise(vec2 p) {
          float a = sin(p.x * 4.1 + time * 0.028) * 0.5 + 0.5;
          float b = sin((p.x + p.y) * 7.3 - time * 0.021) * 0.5 + 0.5;
          float c = sin((p.x * 0.7 - p.y) * 11.0 + time * 0.015) * 0.5 + 0.5;
          return (a + b + c) / 3.0;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 sky = mix(bottomColor, horizonColor, smoothstep(0.0, 0.46, height));
          sky = mix(sky, topColor, smoothstep(0.42, 1.0, height));

          float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
          float sunDisc = pow(sunDot, 520.0) * sunIntensity;
          float sunGlow = pow(sunDot, 8.0) * sunIntensity * 0.18;
          sky += sunColor * (sunDisc + sunGlow);

          float cloudMask = smoothstep(0.18, 0.82, softNoise(dir.xz * 1.35 + dir.y));
          cloudMask *= smoothstep(0.16, 0.72, height) * (1.0 - smoothstep(0.86, 1.0, height));
          sky = mix(sky, cloudColor, cloudMask * cloudOpacity);

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.material);
    this.mesh.name = 'procedural-skybox';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.scale.setScalar(1800);
    this.mesh.userData.skipPBRPrepare = true;
    this.scene.add(this.mesh);

    this._sunGroup = this._createSunGroup();
    this.scene.add(this._sunGroup);
  }

  setWeather(weather) {
    const key = weather === 'clear' ? 'clear_noon' : weather;
    const preset = SKY_PRESETS[key] || SKY_PRESETS.clear_noon;
    this.currentWeather = key;
    this._target = { ...preset };
    this._cloudSkyboxVisibleTarget = SUNNY_WEATHERS.has(key);
    if (this._cloudSkybox) {
      this._cloudSkybox.visible = this._cloudSkyboxVisibleTarget;
    } else if (this._cloudSkyboxVisibleTarget) {
      this._ensureCloudSkybox();
    }
    if (this._sunGroup) this._sunGroup.visible = this._cloudSkyboxVisibleTarget;
  }

  setTrackSkybox(url) {
    const nextUrl = typeof url === 'string' && url.trim() ? url.trim() : null;
    if (nextUrl === this._cloudSkyboxUrl) return;

    this._cloudSkyboxUrl = nextUrl;
    this._cloudSkyboxLoading = null;
    this._removeCloudSkybox();
    if (this._cloudSkyboxVisibleTarget && nextUrl) {
      this._ensureCloudSkybox();
    }
  }

  update(camera, delta = 0.016) {
    this._time += delta;
    if (camera?.position) this.mesh.position.copy(camera.position);
    if (camera?.position && this._cloudSkybox) {
      this._cloudSkybox.position.copy(camera.position);
      this._cloudSkybox.position.add(this._cloudSkyboxOffset);
      this._cloudSkybox.visible = this._cloudSkyboxVisibleTarget;
      this._cloudSkybox.rotation.y += delta * 0.0018;
    }
    if (camera?.position && this._sunGroup) {
      this._updateSun(camera);
    }

    const uniforms = this.material.uniforms;
    const lerp = Math.min(delta * 2.2, 1);
    uniforms.topColor.value.lerp(new THREE.Color(this._target.top), lerp);
    uniforms.horizonColor.value.lerp(new THREE.Color(this._target.horizon), lerp);
    uniforms.bottomColor.value.lerp(new THREE.Color(this._target.bottom), lerp);
    uniforms.sunColor.value.lerp(new THREE.Color(this._target.sunColor), lerp);
    uniforms.cloudColor.value.lerp(new THREE.Color(this._target.cloudColor), lerp);
    uniforms.sunDirection.value.lerp(new THREE.Vector3(...this._target.sunDirection).normalize(), lerp).normalize();
    uniforms.sunIntensity.value += (this._target.sunIntensity - uniforms.sunIntensity.value) * lerp;
    uniforms.cloudOpacity.value += (this._target.cloudOpacity - uniforms.cloudOpacity.value) * lerp;
    uniforms.time.value = this._time;
  }

  async _ensureCloudSkybox() {
    if (this._cloudSkybox || this._cloudSkyboxLoading || !this.assetLoader || !this._cloudSkyboxUrl) return;

    this._cloudSkyboxLoading = this._loadCloudSkybox()
      .catch((err) => {
        console.warn('[SkyboxManager] Cloud skybox load failed:', err);
      })
      .finally(() => {
        this._cloudSkyboxLoading = null;
      });

    await this._cloudSkyboxLoading;
  }

  async _loadCloudSkybox() {
    const paths = this.assetLoader.get?.('asset-paths') || {};
    const modelUrl = this._cloudSkyboxUrl || paths?.models?.skyboxes?.[CLOUD_SKYBOX_ID];
    if (!modelUrl) {
      throw new Error(`Missing asset path: models.skyboxes.${CLOUD_SKYBOX_ID}`);
    }

    const requestedUrl = modelUrl;
    const model = await this.assetLoader._loadGLB(modelUrl, { _progress: null });
    if (requestedUrl !== this._cloudSkyboxUrl) {
      this._disposeObject(model);
      return;
    }
    model.name = 'sunny-cloud-skybox';
    model.userData.skipPBRPrepare = true;
    model.frustumCulled = false;
    model.renderOrder = CLOUD_SKYBOX_RENDER_ORDER;

    this._configureCloudSkybox(model);
    this._fitCloudSkybox(model);
    model.visible = this._cloudSkyboxVisibleTarget;

    this._cloudSkybox = model;
    this.scene.add(model);
  }

  _configureCloudSkybox(root) {
    root.traverse((child) => {
      child.frustumCulled = false;
      child.renderOrder = CLOUD_SKYBOX_RENDER_ORDER;
      child.userData.skipPBRPrepare = true;

      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.material = this._prepareSkyboxMaterial(child.material);
    });
  }

  _prepareSkyboxMaterial(material) {
    if (Array.isArray(material)) {
      return material.map(item => this._prepareSkyboxMaterial(item));
    }
    if (!material) return material;

    const skyMaterial = new THREE.MeshBasicMaterial({
      name: material.name || 'skybox-unlit-material',
      color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
      map: material.map || null,
      alphaMap: material.alphaMap || null,
      transparent: material.transparent || material.opacity < 1 || Boolean(material.alphaMap),
      opacity: material.opacity ?? 1,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    skyMaterial.userData = {
      ...(material.userData || {}),
      keepUnlit: true,
      skyboxMaterial: true,
    };
    return skyMaterial;
  }

  _fitCloudSkybox(model) {
    model.updateMatrixWorld(true);
    this._tmpBox.setFromObject(model);
    this._tmpBox.getSize(this._tmpSize);
    const maxSize = Math.max(this._tmpSize.x, this._tmpSize.y, this._tmpSize.z);
    if (Number.isFinite(maxSize) && maxSize > 0) {
      const scale = CLOUD_SKYBOX_TARGET_RADIUS / maxSize;
      model.scale.multiplyScalar(scale);
    }

    this._tmpBox.setFromObject(model);
    this._tmpBox.getCenter(this._tmpCenter);
    const minY = this._tmpBox.min.y;
    this._cloudSkyboxOffset.set(-this._tmpCenter.x, 0, -this._tmpCenter.z);
    if (Number.isFinite(minY)) {
      this._cloudSkyboxOffset.y = -(minY + 18);
      model.position.y = this._cloudSkyboxOffset.y;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this._removeCloudSkybox();
    if (this._sunGroup) {
      this.scene.remove(this._sunGroup);
      this._disposeObject(this._sunGroup);
      this._sunGroup = null;
    }
  }

  _removeCloudSkybox() {
    if (!this._cloudSkybox) return;
    this.scene.remove(this._cloudSkybox);
    this._disposeObject(this._cloudSkybox);
    this._cloudSkybox = null;
    this._cloudSkyboxOffset.set(0, 0, 0);
  }

  _createSunGroup() {
    const group = new THREE.Group();
    group.name = 'sky-sun-glow';
    group.frustumCulled = false;
    group.renderOrder = SUN_RENDER_ORDER;
    group.userData.skipPBRPrepare = true;

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._createRadialTexture([
        [0.0, 'rgba(255,245,190,0.95)'],
        [0.28, 'rgba(255,210,100,0.42)'],
        [1.0, 'rgba(255,190,70,0.0)'],
      ]),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    }));
    glow.name = 'sun-glow';
    glow.scale.set(155, 155, 1);
    glow.renderOrder = SUN_RENDER_ORDER;

    const disc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._createRadialTexture([
        [0.0, 'rgba(255,255,245,1.0)'],
        [0.58, 'rgba(255,245,190,1.0)'],
        [1.0, 'rgba(255,220,110,0.0)'],
      ]),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    }));
    disc.name = 'sun-disc';
    disc.scale.set(34, 34, 1);
    disc.renderOrder = SUN_RENDER_ORDER + 1;

    group.add(glow, disc);
    group.visible = this._cloudSkyboxVisibleTarget;
    return group;
  }

  _createRadialTexture(stops) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [offset, color] of stops) {
      gradient.addColorStop(offset, color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _updateSun(camera) {
    const direction = new THREE.Vector3(...this._target.sunDirection).normalize();
    this._sunGroup.position.copy(camera.position).addScaledVector(direction, SUN_DISTANCE);
    this._sunGroup.visible = this._cloudSkyboxVisibleTarget;

    const intensity = Math.max(0, this.material.uniforms.sunIntensity.value || 0);
    const glow = this._sunGroup.children[0];
    const disc = this._sunGroup.children[1];
    if (glow?.material) glow.material.opacity = THREE.MathUtils.clamp(intensity * 0.72, 0.18, 0.95);
    if (disc?.material) disc.material.opacity = THREE.MathUtils.clamp(intensity, 0.4, 1);
  }

  _disposeObject(object) {
    object.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        for (const material of child.material) material?.dispose?.();
      } else {
        child.material?.dispose?.();
      }
    });
  }
}
