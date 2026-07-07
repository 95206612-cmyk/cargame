const KEY_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight'],
  reset: ['KeyR'],
};

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this._keys = new Set();
    this._justPressed = new Set();

    this.steerAxis = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.nitro = false;
    this.resetRequested = false;

    this._touchState = {
      steerLeft: false,
      steerRight: false,
      throttle: false,
      brake: false,
      handbrake: false,
      nitro: false,
      reset: false,
      joystickX: 0,
      joystickY: 0,
    };
    this._joystick = null;
    this._mobileButtons = {};
    this._mobileLayout = 'portrait';

    this._isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this._setupKeyboard();
    if (this._isMobile) this._createMobileUI();

    this.canvas.style.touchAction = 'none';
    this.canvas.style.userSelect = 'none';
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('pointerdown', () => this.canvas.focus());
    window.addEventListener('pointerdown', () => this.canvas.focus());
    setTimeout(() => this.canvas.focus(), 0);
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this._shouldIgnoreKeyboardEvent(e)) return;
      if (!this._keys.has(e.code)) this._justPressed.add(e.code);
      this._keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this._shouldIgnoreKeyboardEvent(e)) return;
      this._keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this._keys.clear();
      for (const key of Object.keys(this._touchState)) this._touchState[key] = false;
      this._touchState.joystickX = 0;
      this._touchState.joystickY = 0;
      this._resetJoystickVisual();
    });
  }

  _isDown(...codes) {
    return codes.some(c => this._keys.has(c));
  }

  _wasPressed(...codes) {
    return codes.some(c => this._justPressed.has(c));
  }

  _shouldIgnoreKeyboardEvent(event) {
    const target = event.target;
    if (!target) return false;
    const tag = target.tagName;
    return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag);
  }

  _createMobileUI() {
    const ui = document.createElement('div');
    ui.id = 'mobile-controls';
    ui.style.cssText = 'position:fixed;inset:0;z-index:10;pointer-events:none;';

    const base = [
      'position:absolute',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'border:1px solid rgba(255,255,255,0.22)',
      'box-shadow:0 8px 22px rgba(0,0,0,0.38)',
      'color:#fff',
      'font-family:system-ui,sans-serif',
      'font-weight:900',
      'pointer-events:auto',
      'user-select:none',
      '-webkit-user-select:none',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
      'touch-action:none',
    ].join(';') + ';';

    const leftInset = 'calc(env(safe-area-inset-left, 0px) + 54px)';
    const bottomInset = 'calc(env(safe-area-inset-bottom, 0px) + 72px)';
    const joystick = this._makeJoystick(base, leftInset, bottomInset);

    const buttons = [
      [this._makeIconBtn('throttle', `${base}right:24px;bottom:78px;width:76px;height:76px;border-radius:50%;font-size:18px;background:rgba(46,204,113,0.48);`), 'throttle'],
      [this._makeIconBtn('brake', `${base}right:34px;bottom:18px;width:62px;height:62px;border-radius:50%;font-size:13px;background:rgba(231,76,60,0.48);letter-spacing:0;`), 'brake'],
      [this._makeBtn('N2O', `${base}right:20px;top:32%;width:58px;height:58px;border-radius:50%;font-size:13px;background:rgba(255,107,0,0.5);letter-spacing:0;`), 'nitro'],
      [this._makeBtn('DRIFT', `${base}left:50%;bottom:18px;transform:translateX(-50%);width:104px;height:44px;border-radius:22px;font-size:13px;background:rgba(52,152,219,0.42);letter-spacing:0;`), 'handbrake'],
      [this._makeBtn('R', `${base}left:18px;top:18px;width:38px;height:38px;border-radius:50%;font-size:16px;background:rgba(255,255,255,0.12);`), 'reset'],
    ];

    ui.appendChild(joystick.root);
    this._bindJoystick(joystick.root, joystick.knob);

    for (const [button, action] of buttons) {
      button.dataset.mobileAction = action;
      this._mobileButtons[action] = button;
      ui.appendChild(button);
      this._bindPointer(button, action);
    }

    document.body.appendChild(ui);
    this._mobileUI = ui;
    this.resize(window.innerWidth, window.innerHeight, window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
  }

  _makeJoystick(base, leftInset, bottomInset) {
    const root = document.createElement('div');
    root.setAttribute('aria-label', '移动摇杆');
    root.style.cssText = [
      base,
      `left:${leftInset}`,
      `bottom:${bottomInset}`,
      'width:172px',
      'height:172px',
      'border-radius:50%',
      'background:radial-gradient(circle at 38% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0.08) 58%, rgba(7,14,20,0.32))',
      'border:1px solid rgba(255,255,255,0.24)',
      'box-shadow:0 14px 34px rgba(0,0,0,0.42), inset 0 0 28px rgba(120,240,194,0.08)',
      'backdrop-filter:blur(8px)',
      'opacity:0.86',
    ].join(';') + ';';

    const ring = document.createElement('div');
    ring.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:74px',
      'height:74px',
      'border-radius:50%',
      'transform:translate(-50%, -50%)',
      'border:1px dashed rgba(255,255,255,0.2)',
      'pointer-events:none',
    ].join(';') + ';';

    const label = document.createElement('div');
    label.textContent = '移动';
    label.style.cssText = [
      'position:absolute',
      'left:0',
      'right:0',
      'bottom:18px',
      'text-align:center',
      'font-size:12px',
      'letter-spacing:3px',
      'color:rgba(255,255,255,0.68)',
      'pointer-events:none',
    ].join(';') + ';';

    const knob = document.createElement('div');
    knob.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:82px',
      'height:82px',
      'border-radius:50%',
      'transform:translate(-50%, -50%) translate(0px, 0px)',
      'background:radial-gradient(circle at 35% 26%, rgba(255,255,255,0.58), rgba(120,240,194,0.34) 38%, rgba(28,76,90,0.72))',
      'border:1px solid rgba(255,255,255,0.38)',
      'box-shadow:0 10px 26px rgba(0,0,0,0.45), inset 0 0 16px rgba(255,255,255,0.12)',
      'pointer-events:none',
      'transition:transform 0.08s ease-out',
    ].join(';') + ';';

    root.appendChild(ring);
    root.appendChild(label);
    root.appendChild(knob);
    return { root, knob };
  }

  _makeBtn(label, styleStr) {
    const btn = document.createElement('div');
    btn.textContent = label;
    btn.style.cssText = styleStr;
    btn.style.opacity = '0.78';
    return btn;
  }

  _makeIconBtn(type, styleStr) {
    const btn = this._makeBtn('', styleStr);
    btn.setAttribute('aria-label', type === 'throttle' ? '油门' : '刹车');
    btn.innerHTML = this._mobileControlIcon(type);
    return btn;
  }

  _mobileControlIcon(type) {
    if (type === 'throttle') {
      return `
        <svg width="38" height="38" viewBox="0 0 64 64" aria-hidden="true" style="display:block;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.36));">
          <path d="M16 52h32c4 0 7-3 7-7V19c0-4-3-7-7-7H16c-4 0-7 3-7 7v26c0 4 3 7 7 7Z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.78)" stroke-width="3"/>
          <path d="M32 45V18" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
          <path d="M22 28 32 18l10 10" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20 50h24" fill="none" stroke="rgba(255,255,255,0.48)" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
    }

    return `
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true" style="display:block;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.36));">
        <path d="M18 10h28c3 0 6 3 6 6v32c0 3-3 6-6 6H18c-3 0-6-3-6-6V16c0-3 3-6 6-6Z" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.78)" stroke-width="3"/>
        <path d="M21 19h22M21 29h22M21 39h22" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
        <path d="M18 54h28" fill="none" stroke="rgba(255,255,255,0.48)" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `;
  }

  _bindPointer(el, action) {
    const down = (e) => {
      e.preventDefault();
      try { el.setPointerCapture?.(e.pointerId); } catch {}
      this._touchState[action] = true;
      el.style.opacity = '1';
      el.style.scale = '0.92';
      this.canvas.focus();
    };
    const up = (e) => {
      e.preventDefault();
      this._touchState[action] = false;
      el.style.opacity = '0.78';
      el.style.scale = '1';
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  _bindJoystick(root, knob) {
    this._joystick = {
      root,
      knob,
      pointerId: null,
      radius: 58,
    };

    const move = (event) => {
      if (this._joystick.pointerId !== event.pointerId) return;
      event.preventDefault();
      this._updateJoystick(event);
    };

    const down = (event) => {
      event.preventDefault();
      this._joystick.pointerId = event.pointerId;
      try { root.setPointerCapture?.(event.pointerId); } catch {}
      root.style.opacity = '1';
      knob.style.transition = 'none';
      this._updateJoystick(event);
      this.canvas.focus();
    };

    const up = (event) => {
      if (this._joystick.pointerId !== event.pointerId) return;
      event.preventDefault();
      this._joystick.pointerId = null;
      this._touchState.joystickX = 0;
      this._touchState.joystickY = 0;
      this._resetJoystickVisual();
    };

    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('pointerleave', up);
  }

  _updateJoystick(event) {
    if (!this._joystick) return;
    const rect = this._joystick.root.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const radius = this._joystick.radius;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const len = Math.hypot(dx, dy);
    const scale = len > radius ? radius / Math.max(len, 0.0001) : 1;
    const px = dx * scale;
    const py = dy * scale;
    let nx = px / radius;
    let ny = py / radius;
    const deadzone = 0.13;
    if (Math.abs(nx) < deadzone) nx = 0;
    if (Math.abs(ny) < deadzone) ny = 0;

    this._touchState.joystickX = clampUnit(nx);
    this._touchState.joystickY = clampUnit(ny);
    this._joystick.knob.style.transform = `translate(-50%, -50%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
  }

  _resetJoystickVisual() {
    if (!this._joystick) return;
    this._joystick.root.style.opacity = '0.86';
    this._joystick.knob.style.transition = 'transform 0.12s ease-out';
    this._joystick.knob.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
  }

  resize(width = window.innerWidth, height = window.innerHeight, layout = null) {
    if (!this._isMobile || !this._mobileUI) return;
    const nextLayout = layout === 'landscape' || layout === 'portrait'
      ? layout
      : (width > height ? 'landscape' : 'portrait');
    this._mobileLayout = nextLayout;
    this._mobileUI.dataset.layout = nextLayout;

    if (nextLayout === 'landscape') this._applyLandscapeLayout();
    else this._applyPortraitLayout();

    this._resetJoystickVisual();
  }

  _applyPortraitLayout() {
    if (this._joystick?.root) {
      Object.assign(this._joystick.root.style, {
        left: 'calc(env(safe-area-inset-left, 0px) + 54px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        width: '172px',
        height: '172px',
        opacity: '0.86',
      });
      Object.assign(this._joystick.knob.style, {
        width: '82px',
        height: '82px',
      });
      this._joystick.radius = 58;
    }

    this._styleButton('throttle', {
      right: 'calc(env(safe-area-inset-right, 0px) + 24px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)',
      width: '76px',
      height: '76px',
      top: '',
      left: '',
      transform: '',
    });
    this._styleButton('brake', {
      right: 'calc(env(safe-area-inset-right, 0px) + 34px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
      width: '62px',
      height: '62px',
      top: '',
      left: '',
      transform: '',
    });
    this._styleButton('nitro', {
      right: 'calc(env(safe-area-inset-right, 0px) + 20px)',
      top: '32%',
      bottom: '',
      left: '',
      width: '58px',
      height: '58px',
      transform: '',
    });
    this._styleButton('handbrake', {
      left: '50%',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
      right: '',
      top: '',
      width: '104px',
      height: '44px',
      transform: 'translateX(-50%)',
    });
    this._styleButton('reset', {
      left: 'calc(env(safe-area-inset-left, 0px) + 18px)',
      top: 'calc(env(safe-area-inset-top, 0px) + 18px)',
      right: '',
      bottom: '',
      width: '38px',
      height: '38px',
      transform: '',
    });
  }

  _applyLandscapeLayout() {
    if (this._joystick?.root) {
      Object.assign(this._joystick.root.style, {
        left: 'calc(env(safe-area-inset-left, 0px) + 34px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        width: '148px',
        height: '148px',
        opacity: '0.78',
      });
      Object.assign(this._joystick.knob.style, {
        width: '70px',
        height: '70px',
      });
      this._joystick.radius = 50;
    }

    this._styleButton('throttle', {
      right: 'calc(env(safe-area-inset-right, 0px) + 28px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 52px)',
      width: '70px',
      height: '70px',
      top: '',
      left: '',
      transform: '',
    });
    this._styleButton('brake', {
      right: 'calc(env(safe-area-inset-right, 0px) + 28px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 132px)',
      width: '58px',
      height: '58px',
      top: '',
      left: '',
      transform: '',
    });
    this._styleButton('nitro', {
      right: 'calc(env(safe-area-inset-right, 0px) + 32px)',
      top: 'calc(env(safe-area-inset-top, 0px) + 92px)',
      bottom: '',
      left: '',
      width: '52px',
      height: '52px',
      transform: '',
    });
    this._styleButton('handbrake', {
      right: 'calc(env(safe-area-inset-right, 0px) + 88px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 112px)',
      left: '',
      top: '',
      width: '88px',
      height: '38px',
      transform: '',
    });
    this._styleButton('reset', {
      left: 'calc(env(safe-area-inset-left, 0px) + 18px)',
      top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      right: '',
      bottom: '',
      width: '36px',
      height: '36px',
      transform: '',
    });
  }

  _styleButton(action, styles) {
    const button = this._mobileButtons?.[action];
    if (!button) return;
    Object.assign(button.style, styles);
  }

  update(delta) {
    const ts = this._touchState;
    const joyX = this._isMobile ? clampUnit(ts.joystickX || 0) : 0;
    const joyY = this._isMobile ? clampUnit(ts.joystickY || 0) : 0;
    const joyThrottle = Math.max(0, -joyY);
    const joyBrake = Math.max(0, joyY);

    let steerFromKeys = 0;
    if (this._isDown(...KEY_BINDINGS.steerLeft)) steerFromKeys -= 1;
    if (this._isDown(...KEY_BINDINGS.steerRight)) steerFromKeys += 1;

    if (steerFromKeys !== 0) {
      this.steerAxis = steerFromKeys;
    } else if (Math.abs(joyX) > 0) {
      this.steerAxis = joyX;
    } else if (this._isMobile && (ts.steerLeft || ts.steerRight)) {
      this.steerAxis = ts.steerLeft ? -1 : 1;
    } else {
      this.steerAxis = 0;
    }

    this.throttle = this._isDown(...KEY_BINDINGS.throttle) || ts.throttle ? 1 : joyThrottle;
    this.brake = this._isDown(...KEY_BINDINGS.brake) || ts.brake ? 1 : joyBrake;
    this.handbrake = this._isDown(...KEY_BINDINGS.handbrake) || ts.handbrake;
    this.nitro = this._isDown(...KEY_BINDINGS.nitro) || ts.nitro;
    this.resetRequested = this._wasPressed(...KEY_BINDINGS.reset) || ts.reset;

    this._justPressed.clear();
    ts.reset = false;
  }

  getStandardizedInput() {
    return {
      steerAxis: this.steerAxis,
      throttle: this.throttle,
      brake: this.brake,
      handbrake: this.handbrake,
      nitro: this.nitro,
      resetRequested: this.resetRequested,
    };
  }

  setMobileUIVisible(visible) {
    if (this._mobileUI) this._mobileUI.style.display = visible ? '' : 'none';
  }

  clearActiveInputs() {
    this._keys.clear();
    this._justPressed.clear();
    for (const key of Object.keys(this._touchState)) this._touchState[key] = false;
    this._touchState.joystickX = 0;
    this._touchState.joystickY = 0;
    if (this._joystick) this._joystick.pointerId = null;
    this._resetJoystickVisual();
    this.steerAxis = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.nitro = false;
    this.resetRequested = false;
  }

  destroy() {
    if (this._mobileUI && this._mobileUI.parentNode) {
      this._mobileUI.parentNode.removeChild(this._mobileUI);
    }
    this._mobileUI = null;
    this._joystick = null;
  }
}

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}
