import * as THREE from 'three';

const AVATARS = [
  { id: 'street_rookie', label: '街头新人' },
  { id: 'night_racer', label: '夜行车手' },
  { id: 'drift_ace', label: '漂移高手' },
  { id: 'speed_hunter', label: '极速猎手' },
];

const SKINS = [
  { id: 'clean', label: '原厂漆面' },
  { id: 'stripe', label: '双线拉花' },
  { id: 'flame', label: '火焰涂装' },
  { id: 'carbon', label: '碳纤维套件' },
  { id: 'neon', label: '霓虹街头' },
];

const PENDANTS = [
  { id: 'none', label: '无挂件' },
  { id: 'dice', label: '幸运骰子' },
  { id: 'tag', label: '车队铭牌' },
  { id: 'charm', label: '冠军吊坠' },
  { id: 'plush', label: '玩偶挂件' },
];

const UNDERGLOWS = [
  { id: 'none', label: '关闭' },
  { id: 'cyan', label: '电光蓝' },
  { id: 'gold', label: '赛道金' },
  { id: 'red', label: '追击红' },
  { id: 'green', label: '氮气绿' },
];

export class PlayerProfileUI {
  constructor(container) {
    this._container = container;
    this._panel = null;
    this._visible = false;
    this._mode = 'profile';
    this._previewRenderer = null;
    this._previewScene = null;
    this._previewCamera = null;
    this._previewCar = null;
    this._previewCanvas = null;
    this._previewRotation = 0;
    this._profile = null;
    this._customization = null;
    this._stats = null;
    this._car = null;

    this.onLogin = null;
    this.onSaveCustomization = null;
    this.onExit = null;

    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'player-profile-panel';
    panel.style.cssText = `
      display:none;position:fixed;inset:0;z-index:180;pointer-events:auto;color:#fff;
      font-family:"Segoe UI",system-ui,sans-serif;
      background:
        radial-gradient(circle at 18% 12%, rgba(255,209,102,0.18), transparent 28%),
        radial-gradient(circle at 82% 22%, rgba(102,232,255,0.16), transparent 30%),
        linear-gradient(135deg,#070d14 0%,#111a23 46%,#07090d 100%);
    `;
    this._panel = panel;

    const shell = document.createElement('div');
    shell.style.cssText = 'height:100%;display:flex;flex-direction:column;';
    shell.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:1.25rem;font-weight:950;letter-spacing:3px;color:#ffd166;">车手档案</div>
        <div id="profile-subtitle" style="font-size:0.78rem;color:#9fb2c2;">登录 / 车辆信息 / 外观自定义</div>
        <button id="profile-close" class="panel-close-under-esc" type="button" style="margin-left:auto;padding:7px 18px;border:1px solid #ff6b6b;background:transparent;color:#ff6b6b;border-radius:4px;font-weight:900;cursor:pointer;">关闭</button>
      </div>
      <div id="profile-content" style="flex:1;min-height:0;"></div>
    `;
    panel.appendChild(shell);
    this._content = shell.querySelector('#profile-content');
    shell.querySelector('#profile-close').addEventListener('click', () => this.onExit?.());
    this._container.appendChild(panel);
  }

  showLogin(profile = {}) {
    this._mode = 'login';
    this._profile = profile;
    this._panel.style.display = 'block';
    this._visible = true;
    this._renderLogin();
  }

  showProfile(data = {}) {
    this._mode = 'profile';
    this._profile = data.profile || {};
    this._customization = data.customization || {};
    this._stats = data.stats || {};
    this._car = data.car || {};
    this._panel.style.display = 'block';
    this._visible = true;
    this._renderProfile();
    this._resizePreview();
  }

  hide() {
    this._panel.style.display = 'none';
    this._visible = false;
    this.setPreviewCar(null);
  }

  get visible() {
    return this._visible;
  }

  setPreviewCar(carModelGroup) {
    if (this._previewCar?.parent) this._previewCar.parent.remove(this._previewCar);
    this._previewCar = carModelGroup || null;
    if (this._previewCar && this._previewScene) {
      this._previewCar.position.set(0, 0.35, 0);
      this._previewScene.add(this._previewCar);
    }
  }

  _renderLogin() {
    const profile = this._profile || {};
    this._content.innerHTML = `
      <div style="height:100%;display:grid;place-items:center;padding:24px;">
        <div style="width:min(520px,92vw);padding:24px;border:1px solid rgba(255,255,255,0.16);background:rgba(7,13,20,0.86);box-shadow:0 24px 80px rgba(0,0,0,0.45);">
          <div style="font-size:1.8rem;font-weight:950;color:#ffd166;letter-spacing:2px;">创建车手</div>
          <div style="margin:6px 0 20px;color:#9fb2c2;font-size:0.86rem;">输入昵称后进入大厅，资料会保存在本机存档中。</div>
          <label class="profile-field">车手昵称<input id="login-name" maxlength="16" value="${this._escape(profile.name || '')}" placeholder="例如：秋名山车神"></label>
          <label class="profile-field">车队 / 地区<input id="login-club" maxlength="16" value="${this._escape(profile.club || '')}" placeholder="例如：城市漂移队"></label>
          <label class="profile-field">头像风格<select id="login-avatar">${this._options(AVATARS, profile.avatar || 'street_rookie')}</select></label>
          <button id="login-submit" type="button" style="width:100%;margin-top:14px;padding:13px;border:0;background:linear-gradient(90deg,#ffd166,#ff8f3d);color:#101820;font-weight:950;border-radius:8px;cursor:pointer;">登录游戏</button>
          <div id="login-error" style="min-height:18px;margin-top:10px;color:#ff6b6b;font-size:0.78rem;"></div>
        </div>
      </div>
    `;
    this._injectFieldStyle();
    this._content.querySelector('#login-submit').addEventListener('click', () => {
      const name = this._content.querySelector('#login-name').value.trim();
      const club = this._content.querySelector('#login-club').value.trim();
      const avatar = this._content.querySelector('#login-avatar').value;
      if (name.length < 2) {
        this._content.querySelector('#login-error').textContent = '昵称至少需要 2 个字符。';
        return;
      }
      this.onLogin?.({ name, club, avatar });
    });
  }

  _renderProfile() {
    const profile = this._profile || {};
    const custom = this._customization || {};
    const stats = this._stats || {};
    const car = this._car || {};

    this._content.innerHTML = `
      <div style="height:100%;display:grid;grid-template-columns:300px minmax(360px,1fr) 340px;gap:16px;padding:18px;box-sizing:border-box;">
        <aside style="display:flex;flex-direction:column;gap:12px;">
          <section class="profile-card">
            <div style="font-size:0.72rem;color:#9fb2c2;letter-spacing:2px;">车手</div>
            <div style="font-size:1.55rem;font-weight:950;color:#fff;margin-top:4px;">${this._escape(profile.name || '未登录车手')}</div>
            <div style="color:#ffd166;font-size:0.8rem;margin-top:4px;">${this._escape(profile.title || '街头新人')} · ${this._escape(profile.club || '自由车手')}</div>
            <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${this._statCell('等级', stats.level || 1)}
              ${this._statCell('经验', stats.xp || 0)}
              ${this._statCell('胜场', stats.wins || 0)}
              ${this._statCell('赛事', stats.races || 0)}
            </div>
          </section>
          <section class="profile-card">
            <div style="font-weight:900;color:#66e8ff;margin-bottom:8px;">当前车辆</div>
            <div style="font-size:1.05rem;font-weight:900;">${this._escape(car.name || car.id || 'Tuner')}</div>
            <div style="color:#9fb2c2;font-size:0.78rem;">${this._escape(car.category || 'street').toUpperCase()} · ${this._escape(custom.plate || 'STREET')}</div>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:7px;">
              ${this._bar('极速', stats.speed || 68)}
              ${this._bar('加速', stats.accel || 64)}
              ${this._bar('操控', stats.handling || 70)}
              ${this._bar('氮气', stats.nitro || 58)}
            </div>
          </section>
        </aside>

        <main class="profile-card" style="position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
          <canvas id="profile-car-preview" style="width:100%;height:100%;min-height:360px;"></canvas>
          <div style="position:absolute;left:18px;bottom:16px;color:#9fb2c2;font-size:0.78rem;">拖动车辆预览区可旋转车辆</div>
        </main>

        <aside class="profile-card" style="overflow:auto;">
          <div style="font-size:1rem;font-weight:950;color:#ffd166;margin-bottom:12px;">车辆外观</div>
          <label class="profile-field">车身颜色<input id="custom-color" type="color" value="${this._escape(custom.color || '#e74c3c')}"></label>
          <label class="profile-field">车辆皮肤<select id="custom-skin">${this._options(SKINS, custom.skin || 'clean')}</select></label>
          <label class="profile-field">车内挂件<select id="custom-pendant">${this._options(PENDANTS, custom.pendant || 'none')}</select></label>
          <label class="profile-field">底盘灯<select id="custom-underglow">${this._options(UNDERGLOWS, custom.underglow || 'none')}</select></label>
          <label class="profile-field">车牌号<input id="custom-plate" maxlength="10" value="${this._escape(custom.plate || 'STREET')}"></label>
          <label class="profile-field">车手称号<input id="custom-title" maxlength="14" value="${this._escape(profile.title || '街头新人')}"></label>
          <button id="profile-save" type="button" style="width:100%;margin-top:8px;padding:11px;border:1px solid #2cff9a;background:rgba(44,255,154,0.14);color:#2cff9a;font-weight:950;border-radius:8px;cursor:pointer;">保存角色信息</button>
          <button id="profile-switch" type="button" style="width:100%;margin-top:8px;padding:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#d8e7f5;font-weight:800;border-radius:8px;cursor:pointer;">切换 / 重新登录</button>
          <div id="profile-save-status" style="min-height:18px;margin-top:10px;color:#9fb2c2;font-size:0.78rem;"></div>
        </aside>
      </div>
    `;
    this._injectFieldStyle();
    this._initPreview();

    this._content.querySelector('#profile-save').addEventListener('click', () => this._saveCustomization());
    this._content.querySelector('#profile-switch').addEventListener('click', () => this.showLogin(this._profile));
    for (const id of ['custom-color', 'custom-skin', 'custom-pendant', 'custom-underglow', 'custom-plate', 'custom-title']) {
      this._content.querySelector(`#${id}`)?.addEventListener('change', () => this._saveCustomization(true));
    }
  }

  _saveCustomization(silent = false) {
    const next = {
      color: this._content.querySelector('#custom-color')?.value || '#e74c3c',
      skin: this._content.querySelector('#custom-skin')?.value || 'clean',
      pendant: this._content.querySelector('#custom-pendant')?.value || 'none',
      underglow: this._content.querySelector('#custom-underglow')?.value || 'none',
      plate: (this._content.querySelector('#custom-plate')?.value || 'STREET').trim().toUpperCase(),
      title: (this._content.querySelector('#custom-title')?.value || '街头新人').trim(),
    };
    this.onSaveCustomization?.(next);
    if (!silent) this._content.querySelector('#profile-save-status').textContent = '已保存角色和车辆外观。';
  }

  _initPreview() {
    const canvas = this._content.querySelector('#profile-car-preview');
    if (!canvas) return;
    if (this._previewRenderer) {
      this._previewRenderer.dispose?.();
      this._previewRenderer = null;
    }
    this._previewCanvas = canvas;
    this._previewScene = new THREE.Scene();
    this._previewRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this._previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this._previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this._previewCamera = new THREE.PerspectiveCamera(42, 1, 0.5, 100);
    this._previewCamera.position.set(4, 2.4, 6);
    this._previewCamera.lookAt(0, 0.55, 0);

    this._previewScene.add(new THREE.AmbientLight(0x8ea6ba, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 7, 5);
    this._previewScene.add(key);
    const rim = new THREE.DirectionalLight(0x66e8ff, 1.8);
    rim.position.set(-5, 3, -4);
    this._previewScene.add(rim);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.6, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x18232c, roughness: 0.5, metalness: 0.25 }),
    );
    platform.position.y = -0.1;
    this._previewScene.add(platform);

    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons !== 1) return;
      this._previewRotation += event.movementX * 0.01;
    });
    this._animatePreview();
  }

  _animatePreview() {
    if (!this._visible || this._mode !== 'profile' || !this._previewRenderer) return;
    requestAnimationFrame(() => this._animatePreview());
    this._resizePreview();
    if (this._previewCar) this._previewCar.rotation.y = this._previewRotation;
    this._previewRenderer.render(this._previewScene, this._previewCamera);
  }

  _resizePreview() {
    if (!this._previewCanvas || !this._previewRenderer || !this._previewCamera) return;
    const rect = this._previewCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this._previewRenderer.setSize(rect.width, rect.height, false);
    this._previewCamera.aspect = rect.width / Math.max(1, rect.height);
    this._previewCamera.updateProjectionMatrix();
  }

  _injectFieldStyle() {
    if (document.getElementById('profile-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'profile-ui-style';
    style.textContent = `
      .profile-card{border:1px solid rgba(255,255,255,0.14);background:rgba(8,15,23,0.82);box-shadow:0 18px 50px rgba(0,0,0,0.32);padding:16px;backdrop-filter:blur(12px);}
      .profile-field{display:flex;flex-direction:column;gap:6px;margin:10px 0;color:#9fb2c2;font-size:0.76rem;font-weight:800;letter-spacing:0.5px;}
      .profile-field input,.profile-field select{padding:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#fff;border-radius:7px;outline:none;}
      .profile-field option{color:#111;}
    `;
    document.head.appendChild(style);
  }

  _statCell(label, value) {
    return `<div style="padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);"><div style="font-size:0.66rem;color:#8294a4;">${label}</div><b>${value}</b></div>`;
  }

  _bar(label, value) {
    const pct = Math.max(8, Math.min(100, Number(value) || 0));
    return `<div><div style="display:flex;justify-content:space-between;font-size:0.68rem;color:#9fb2c2;"><span>${label}</span><span>${Math.round(pct)}</span></div><div style="height:6px;background:rgba(255,255,255,0.08);overflow:hidden;"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#66e8ff,#ffd166);"></div></div></div>`;
  }

  _options(list, selected) {
    return list.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${item.label}</option>`).join('');
  }

  _escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }
}
