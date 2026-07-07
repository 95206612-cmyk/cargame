/**
 * Game settings panel.
 *
 * Quality presets, audio sliders, control settings, camera options.
 * Settings persist to SaveManager and apply in real-time.
 */
export class SettingsUI {
  constructor(container, saveManager) {
    this._container = container;
    this._save = saveManager;
    this._panel = null;

    this.onQualityChange = null;
    this.onGraphicsChange = null;
    this.onVolumeChange = null;
    this.onControlChange = null;
    this.onDrivingChange = null;
    this.onWeatherChange = null;
    this.onCameraChange = null;
    this.onClose = null;

    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.style.cssText = `
      display:none;position:fixed;inset:0;z-index:260;
      background:rgba(0,0,0,0.94);
      flex-direction:column;
      pointer-events:auto;overflow-y:auto;
      font-family:'Segoe UI',system-ui,sans-serif;color:#fff;
    `;
    this._panel = panel;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);';
    const title = document.createElement('span');
    title.textContent = '设置';
    title.style.cssText = 'font-size:1.2rem;font-weight:bold;color:#ffd700;letter-spacing:3px;';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.id = 'settings-close';
    closeBtn.className = 'panel-close-under-esc';
    closeBtn.textContent = '关闭';
    closeBtn.style.cssText = 'padding:6px 16px;border:1px solid #e74c3c;background:transparent;color:#e74c3c;border-radius:4px;cursor:pointer;font-weight:bold;';
    closeBtn.onclick = () => { this.hide(); if (this.onClose) this.onClose(); };
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;padding:20px 24px;max-width:500px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:24px;';

    content.appendChild(this._sectionTitle('画面质量'));
    content.appendChild(this._buttonSelect('quality', [
      { label: '自动', value: 'auto' },
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' },
      { label: '高', value: 'high' },
      { label: '极高', value: 'ultra' },
    ], (v) => {
      this._save.updateSetting('quality', v);
      if (this.onQualityChange) this.onQualityChange(v);
    }));

    content.appendChild(this._choiceSelect('shadowQuality', [
      { label: '阴影自动', value: 'auto' },
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' },
      { label: '高', value: 'high' },
      { label: '极高', value: 'ultra' },
    ], (v) => {
      this._save.updateSetting('shadowQuality', v);
      if (this.onGraphicsChange) this.onGraphicsChange('shadowQuality', v);
    }));

    content.appendChild(this._choiceSelect('textureQuality', [
      { label: '贴图自动', value: 'auto' },
      { label: '低', value: 'low' },
      { label: '中', value: 'medium' },
      { label: '高', value: 'high' },
      { label: '极高', value: 'ultra' },
    ], (v) => {
      this._save.updateSetting('textureQuality', v);
      if (this.onGraphicsChange) this.onGraphicsChange('textureQuality', v);
    }));

    content.appendChild(this._slider('模型 LOD 距离', 'lodDistance', 0.5, 2.0, 0.05, (v) => {
      this._save.updateSetting('lodDistance', v);
      if (this.onGraphicsChange) this.onGraphicsChange('lodDistance', v);
    }));

    content.appendChild(this._toggle('动态分辨率', 'adaptiveResolution', (v) => {
      this._save.updateSetting('adaptiveResolution', v);
      if (this.onGraphicsChange) this.onGraphicsChange('adaptiveResolution', v);
    }));

    content.appendChild(this._slider('帧率上限（0=不限）', 'fpsLimit', 0, 144, 1, (v) => {
      this._save.updateSetting('fpsLimit', v);
    }));

    content.appendChild(this._toggle('粒子特效', 'particlesEnabled', (v) => {
      this._save.updateSetting('particlesEnabled', v);
      if (this.onQualityChange) this.onQualityChange(this._save.saveData.settings.quality);
    }));

    content.appendChild(this._sectionTitle('天气 / 时间'));
    content.appendChild(this._choiceSelect('weather', [
      { label: '清晨', value: 'clear_morning' },
      { label: '正午', value: 'clear_noon' },
      { label: '黄昏', value: 'clear_evening' },
      { label: '雨天', value: 'rain' },
      { label: '雪天', value: 'snow' },
    ], (v) => {
      this._save.updateSetting('weather', v);
      if (this.onWeatherChange) this.onWeatherChange(v);
    }));

    content.appendChild(this._sectionTitle('音频'));
    content.appendChild(this._toggle('总静音', 'masterMuted', (v) => {
      this._save.updateSetting('masterMuted', v);
      if (this.onVolumeChange) this.onVolumeChange('master', v ? 0 : 1);
    }));
    content.appendChild(this._slider('音乐音量', 'musicVolume', 0, 1, 0.05, (v) => {
      this._save.updateSetting('musicVolume', v);
      if (this.onVolumeChange) this.onVolumeChange('music', v);
    }));
    content.appendChild(this._slider('引擎音效', 'sfxVolume', 0, 1, 0.05, (v) => {
      this._save.updateSetting('sfxVolume', v);
      if (this.onVolumeChange) this.onVolumeChange('sfx', v);
    }));
    content.appendChild(this._slider('环境音效', 'envVolume', 0, 1, 0.05, (v) => {
      this._save.updateSetting('envVolume', v);
      if (this.onVolumeChange) this.onVolumeChange('env', v);
    }));
    content.appendChild(this._slider('界面音效', 'uiVolume', 0, 1, 0.05, (v) => {
      this._save.updateSetting('uiVolume', v);
      if (this.onVolumeChange) this.onVolumeChange('ui', v);
    }));

    content.appendChild(this._sectionTitle('控制 / 驾驶'));
    content.appendChild(this._slider('转向灵敏度', 'steerSensitivity', 0.1, 2.0, 0.1, (v) => {
      this._save.updateSetting('steerSensitivity', v);
      if (this.onControlChange) this.onControlChange('steerSensitivity', v);
    }));
    content.appendChild(this._slider('加速力度', 'accelMultiplier', 0.6, 1.8, 0.05, (v) => {
      this._save.updateSetting('accelMultiplier', v);
      if (this.onDrivingChange) this.onDrivingChange('accelMultiplier', v);
    }));
    content.appendChild(this._slider('刹车力度', 'brakeMultiplier', 0.6, 1.8, 0.05, (v) => {
      this._save.updateSetting('brakeMultiplier', v);
      if (this.onDrivingChange) this.onDrivingChange('brakeMultiplier', v);
    }));
    content.appendChild(this._slider('路面抓地力', 'gripMultiplier', 0.6, 1.5, 0.05, (v) => {
      this._save.updateSetting('gripMultiplier', v);
      if (this.onDrivingChange) this.onDrivingChange('gripMultiplier', v);
    }));
    content.appendChild(this._slider('极速倍率', 'topSpeedMultiplier', 0.7, 1.4, 0.05, (v) => {
      this._save.updateSetting('topSpeedMultiplier', v);
      if (this.onDrivingChange) this.onDrivingChange('topSpeedMultiplier', v);
    }));
    content.appendChild(this._slider('氮气动力', 'nitroMultiplier', 0.6, 1.8, 0.05, (v) => {
      this._save.updateSetting('nitroMultiplier', v);
      if (this.onDrivingChange) this.onDrivingChange('nitroMultiplier', v);
    }));
    content.appendChild(this._slider('手刹转向', 'handbrakeTurnMultiplier', 0.6, 1.8, 0.05, (v) => {
      this._save.updateSetting('handbrakeTurnMultiplier', v);
      if (this.onDrivingChange) this.onDrivingChange('handbrakeTurnMultiplier', v);
    }));
    content.appendChild(this._slider('空中滑翔', 'airGlideMultiplier', 0.5, 1.8, 0.05, (v) => {
      this._save.updateSetting('airGlideMultiplier', v);
      if (this.onDrivingChange) this.onDrivingChange('airGlideMultiplier', v);
    }));
    content.appendChild(this._buttonSelect('controlScheme', [
      { label: '自动', value: 'auto' },
      { label: '触控', value: 'touch' },
      { label: '重力感应', value: 'tilt' },
    ], (v) => {
      this._save.updateSetting('controlScheme', v);
      if (this.onControlChange) this.onControlChange('controlScheme', v);
    }));

    content.appendChild(this._sectionTitle('镜头'));
    content.appendChild(this._buttonSelect('cameraMode', [
      { label: '追尾', value: 'chase' },
      { label: '驾驶舱', value: 'cockpit' },
      { label: '远景', value: 'far' },
      { label: '动态', value: 'dynamic' },
    ], (v) => {
      this._save.updateSetting('cameraMode', v);
      if (this.onCameraChange) this.onCameraChange('cameraMode', v);
    }));
    content.appendChild(this._toggle('动态镜头', 'dynamicCamera', (v) => {
      this._save.updateSetting('dynamicCamera', v);
      if (this.onCameraChange) this.onCameraChange('dynamicCamera', v);
    }));
    content.appendChild(this._toggle('镜头碰撞避让', 'cameraCollisionAvoidance', (v) => {
      this._save.updateSetting('cameraCollisionAvoidance', v);
      if (this.onCameraChange) this.onCameraChange('cameraCollisionAvoidance', v);
    }));
    content.appendChild(this._slider('镜头震动', 'cameraShake', 0, 2.0, 0.1, (v) => {
      this._save.updateSetting('cameraShake', v);
      if (this.onCameraChange) this.onCameraChange('cameraShake', v);
    }));

    panel.appendChild(content);
    this._container.appendChild(panel);
  }

  _sectionTitle(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'font-size:0.7rem;color:#888;letter-spacing:2px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:4px;';
    return el;
  }

  _slider(label, key, min, max, step, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:0.75rem;color:#aaa;min-width:140px;';
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const rawSavedVal = this._save.saveData?.settings?.[key] ?? ((max + min) / 2);
    const savedVal = Math.max(min, Math.min(max, Number(rawSavedVal)));
    input.value = String(savedVal);
    input.style.cssText = 'flex:1;';
    row.appendChild(input);

    const valEl = document.createElement('span');
    valEl.textContent = String(savedVal);
    valEl.style.cssText = 'font-size:0.65rem;color:#888;min-width:36px;text-align:right;';
    row.appendChild(valEl);

    input.oninput = () => {
      const v = parseFloat(input.value);
      valEl.textContent = String(v);
      onChange(v);
    };

    return row;
  }

  _toggle(label, key, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:4px 0;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:0.75rem;color:#aaa;min-width:140px;';
    row.appendChild(labelEl);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this._save.saveData?.settings?.[key] !== false;
    checkbox.onchange = () => onChange(checkbox.checked);
    row.appendChild(checkbox);

    return row;
  }

  _buttonSelect(key, options, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    const first = this._normalizeOption(options[0]);
    const currentVal = String(this._save.saveData?.settings?.[key] || first.value).toLowerCase();

    for (const rawOpt of options) {
      const opt = this._normalizeOption(rawOpt);
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      const isActive = String(opt.value).toLowerCase() === currentVal;
      this._paintButton(btn, isActive, '#3498db');
      btn.onclick = () => {
        for (const child of row.children) this._paintButton(child, false, '#3498db');
        this._paintButton(btn, true, '#3498db');
        onChange(opt.value);
      };
      row.appendChild(btn);
    }

    return row;
  }

  _choiceSelect(key, options, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    const currentVal = this._save.saveData?.settings?.[key] || options[0]?.value;

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      this._paintButton(btn, opt.value === currentVal, '#f1c40f');
      btn.onclick = () => {
        for (const child of row.children) this._paintButton(child, false, '#f1c40f');
        this._paintButton(btn, true, '#f1c40f');
        onChange(opt.value);
      };
      row.appendChild(btn);
    }

    return row;
  }

  _paintButton(btn, active, color) {
    btn.style.cssText = `
      padding:6px 14px;font-size:0.7rem;font-weight:bold;
      border:1px solid ${active ? color : 'rgba(255,255,255,0.15)'};
      background:${active ? `${color}33` : 'transparent'};
      color:${active ? color : '#aaa'};
      border-radius:4px;cursor:pointer;transition:all 0.15s;
    `;
  }

  _normalizeOption(option) {
    if (option && typeof option === 'object') {
      return {
        label: String(option.label ?? option.value ?? ''),
        value: String(option.value ?? option.label ?? '').toLowerCase(),
      };
    }
    return {
      label: String(option ?? ''),
      value: String(option ?? '').toLowerCase(),
    };
  }

  show() {
    this._panel.style.display = 'flex';
  }

  hide() {
    this._panel.style.display = 'none';
  }

  get visible() {
    return this._panel?.style.display === 'flex';
  }

  refresh() {
    // Rebuild to pick up saved values.
  }
}
