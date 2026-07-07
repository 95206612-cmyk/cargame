export class UIManager {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'ui-container';
    this.container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;color:#fff;font-family:"Segoe UI",system-ui,-apple-system,sans-serif;';
    document.body.appendChild(this.container);

    this._trackPoints = [];
    this._mapBounds = null;
    this._messageTimer = 0;
    this._boostOpacity = 0;
    this._hidden = false;

    this._createHUD();
  }

  _createHUD() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.style.cssText = 'position:absolute;inset:0;display:block;';

    this.mode = this._el('div', 'hud-mode', 'STREET RACE',
      'position:absolute;top:18px;left:22px;font-size:0.78rem;font-weight:800;letter-spacing:1.5px;color:#66e8ff;text-shadow:0 2px 10px rgba(0,0,0,0.7);');
    hud.appendChild(this.mode);

    this.lap = this._el('div', 'hud-lap', 'LAP 1/3',
      'position:absolute;top:42px;left:22px;font-size:0.95rem;font-weight:800;letter-spacing:1px;color:#ffd166;text-shadow:0 2px 10px rgba(0,0,0,0.7);');
    hud.appendChild(this.lap);

    this.timer = this._el('div', 'hud-timer', '00:00.00',
      'position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:1.85rem;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:0;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,0.85);');
    hud.appendChild(this.timer);

    this.best = this._el('div', 'hud-best-lap', '',
      'position:absolute;top:58px;left:50%;transform:translateX(-50%);font-size:0.76rem;font-weight:700;color:#69f0ae;text-shadow:0 2px 10px rgba(0,0,0,0.7);');
    hud.appendChild(this.best);

    this.rank = this._el('div', 'hud-rank', 'P1/6',
      'position:absolute;top:18px;right:24px;font-size:1.55rem;font-weight:950;font-variant-numeric:tabular-nums;color:#ffd166;text-shadow:0 2px 14px rgba(0,0,0,0.85);');
    hud.appendChild(this.rank);

    this.wanted = this._el('div', 'hud-wanted', '-----',
      'position:absolute;top:56px;right:24px;font-size:1.05rem;font-weight:900;letter-spacing:2px;color:#ff4d6d;text-shadow:0 2px 12px rgba(0,0,0,0.8);');
    hud.appendChild(this.wanted);

    this.speedWrap = this._el('div', 'hud-speed-wrap', '',
      'position:absolute;right:28px;bottom:34px;min-width:150px;text-align:right;text-shadow:0 3px 18px rgba(0,0,0,0.88);');
    this.speed = this._el('div', 'hud-speed', '0',
      'font-size:4.25rem;font-weight:950;font-variant-numeric:tabular-nums;line-height:0.92;color:#fff;');
    this.speedUnit = this._el('div', 'hud-speed-unit', 'KM/H',
      'font-size:0.78rem;font-weight:900;letter-spacing:2px;color:#b7c7d8;');
    this.speedWrap.appendChild(this.speed);
    this.speedWrap.appendChild(this.speedUnit);
    hud.appendChild(this.speedWrap);

    this.nitroWrap = this._el('div', 'hud-nitro-wrap', '',
      'position:absolute;left:24px;bottom:34px;width:14px;height:150px;border:1px solid rgba(255,255,255,0.24);background:rgba(2,8,18,0.58);overflow:hidden;box-shadow:0 0 16px rgba(0,0,0,0.35);');
    this.nitroFill = this._el('div', 'hud-nitro-fill', '',
      'position:absolute;left:0;right:0;bottom:0;height:100%;background:linear-gradient(to top,#ff3d00,#ffb703,#5ee7ff);box-shadow:0 0 18px rgba(94,231,255,0.68);');
    this.nitroLabel = this._el('div', 'hud-nitro-label', 'NOS',
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.58rem;font-weight:950;letter-spacing:2px;writing-mode:vertical-rl;color:#07101d;text-shadow:none;');
    this.nitroWrap.appendChild(this.nitroFill);
    this.nitroWrap.appendChild(this.nitroLabel);
    hud.appendChild(this.nitroWrap);

    this.minimap = document.createElement('canvas');
    this.minimap.id = 'hud-minimap';
    this.minimap.width = 180;
    this.minimap.height = 124;
    this.minimap.style.cssText = 'position:absolute;left:50px;bottom:34px;width:180px;height:124px;background:rgba(2,8,18,0.58);border:1px solid rgba(255,255,255,0.18);box-shadow:0 0 18px rgba(0,0,0,0.35);';
    hud.appendChild(this.minimap);
    this.minimapCtx = this.minimap.getContext('2d');

    this.progress = this._el('div', 'hud-progress', '',
      'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(460px,56vw);height:6px;background:rgba(255,255,255,0.16);overflow:hidden;');
    this.progressFill = this._el('div', 'hud-progress-fill', '',
      'height:100%;width:0%;background:linear-gradient(90deg,#66e8ff,#ffd166,#ff4d6d);box-shadow:0 0 14px rgba(102,232,255,0.6);');
    this.progress.appendChild(this.progressFill);
    hud.appendChild(this.progress);

    this.status = this._el('div', 'hud-status', '',
      'position:absolute;left:50%;bottom:42px;transform:translateX(-50%);font-size:0.78rem;font-weight:900;letter-spacing:1.4px;color:#b7c7d8;text-shadow:0 2px 12px rgba(0,0,0,0.85);');
    hud.appendChild(this.status);

    this.message = this._el('div', 'hud-message', '',
      'position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);min-width:180px;text-align:center;font-size:clamp(2.6rem,7vw,6rem);font-weight:950;letter-spacing:0;color:#fff;text-shadow:0 5px 24px rgba(0,0,0,0.88),0 0 34px rgba(255,77,109,0.55);opacity:0;transition:opacity 0.18s ease;');
    hud.appendChild(this.message);

    this.leftLines = this._el('div', 'speed-lines-left', '',
      'position:absolute;inset:0;background:radial-gradient(ellipse at 12% 52%,rgba(102,232,255,0.20),rgba(102,232,255,0.055) 30%,rgba(102,232,255,0) 58%),linear-gradient(90deg,rgba(102,232,255,0.12),rgba(102,232,255,0) 38%);opacity:0;mix-blend-mode:screen;filter:blur(1px);');
    this.rightLines = this._el('div', 'speed-lines-right', '',
      'position:absolute;inset:0;background:radial-gradient(ellipse at 88% 52%,rgba(255,209,102,0.18),rgba(255,209,102,0.05) 30%,rgba(255,209,102,0) 58%),linear-gradient(270deg,rgba(255,209,102,0.10),rgba(255,209,102,0) 38%);opacity:0;mix-blend-mode:screen;filter:blur(1px);');
    hud.appendChild(this.leftLines);
    hud.appendChild(this.rightLines);

    this.container.appendChild(hud);
    this._hud = hud;
  }

  _el(tag, id, text, style) {
    const el = document.createElement(tag);
    el.id = id;
    el.textContent = text;
    el.style.cssText = style;
    return el;
  }

  setSpeed(kmh) {
    this.speed.textContent = String(Math.max(0, Math.round(kmh)));
  }

  setLap(current, total) {
    this.lap.textContent = `LAP ${current}/${total}`;
  }

  setTimer(seconds) {
    this.timer.textContent = this._formatTime(seconds);
  }

  setBestLap(seconds) {
    this.best.textContent = Number.isFinite(seconds) ? `BEST ${this._formatTime(seconds)}` : '';
  }

  setNitro(percent) {
    const pct = Math.max(0, Math.min(1, percent));
    this.nitroFill.style.height = `${pct * 100}%`;
  }

  setRank(rank, total) {
    this.rank.textContent = `P${rank}/${Math.max(rank, total || rank)}`;
  }

  setMode(label) {
    this.mode.textContent = label;
  }

  setWanted(level, progress = 0) {
    const clamped = Math.max(0, Math.min(5, Math.round(level || 0)));
    const stars = ''.padStart(clamped, '*').padEnd(5, '-');
    this.wanted.textContent = stars;
    this.wanted.style.opacity = clamped > 0 || progress > 0 ? '1' : '0.32';
  }

  setCheckpointProgress(percent) {
    this.progressFill.style.width = `${Math.max(0, Math.min(100, percent * 100))}%`;
  }

  setStatus(text, color = '#b7c7d8') {
    this.status.textContent = text || '';
    this.status.style.color = color;
  }

  setCountdown(value) {
    if (value == null || value === '') {
      this.message.style.opacity = '0';
      this.message.textContent = '';
      return;
    }
    this.message.textContent = String(value);
    this.message.style.opacity = '1';
    this._messageTimer = 0;
  }

  flashMessage(text, seconds = 1.4) {
    this.message.textContent = text;
    this.message.style.opacity = '1';
    this._messageTimer = seconds;
  }

  setBoostActive(active, speedFactor = 0) {
    const target = active ? 0.24 : Math.max(0, Math.min(0.14, speedFactor * 0.14));
    this._boostOpacity += (target - this._boostOpacity) * 0.16;
    const value = this._boostOpacity.toFixed(3);
    this.leftLines.style.opacity = value;
    this.rightLines.style.opacity = value;
  }

  setMinimapTrack(points) {
    this._trackPoints = (points || []).map(p => ({ x: p.x, z: p.z }));
    if (!this._trackPoints.length) {
      this._mapBounds = null;
      return;
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of this._trackPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const pad = 18;
    this._mapBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }

  drawMinimap(playerPos, aiStates = [], copStates = []) {
    const ctx = this.minimapCtx;
    if (!ctx || !this._mapBounds) return;

    const w = this.minimap.width;
    const h = this.minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(2,8,18,0.72)';
    ctx.fillRect(0, 0, w, h);

    const map = (p) => {
      const b = this._mapBounds;
      return {
        x: 10 + ((p.x - b.minX) / Math.max(1, b.maxX - b.minX)) * (w - 20),
        y: 10 + ((p.z - b.minZ) / Math.max(1, b.maxZ - b.minZ)) * (h - 20),
      };
    };

    if (this._trackPoints.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < this._trackPoints.length; i++) {
        const p = map(this._trackPoints[i]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(102,232,255,0.58)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const ai of aiStates) this._drawMapDot(ctx, map(ai.position || ai), '#ffd166', 2.5);
    for (const cop of copStates) this._drawMapDot(ctx, map(cop.position || cop), '#ff4d6d', 3);
    if (playerPos) this._drawMapDot(ctx, map(playerPos), '#66e8ff', 4.2);
  }

  _drawMapDot(ctx, p, color, radius) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  showHUD() {
    this._hidden = false;
    if (this._hud) this._hud.style.display = 'block';
  }

  hideHUD() {
    this._hidden = true;
    if (this._hud) this._hud.style.display = 'none';
  }

  resize(width, height, layout = 'desktop') {
    const mode = layout || 'desktop';
    const mobilePortrait = mode === 'portrait';
    const mobileLandscape = mode === 'landscape';
    this.container.dataset.layout = mode;

    if (mobilePortrait) {
      this._applyPortraitHUD(width, height);
    } else if (mobileLandscape) {
      this._applyLandscapeHUD(width, height);
    } else {
      this._applyDesktopHUD(width, height);
    }
  }

  _applyDesktopHUD(width, height) {
    const compact = width < 720;
    this._setStyles(this.mode, {
      top: '18px', left: '22px', right: '', transform: '', fontSize: '0.78rem',
    });
    this._setStyles(this.lap, {
      top: '42px', left: '22px', right: '', transform: '', fontSize: '0.95rem',
    });
    this._setStyles(this.timer, {
      top: '18px', left: '50%', right: '', transform: 'translateX(-50%)', fontSize: compact ? '1.45rem' : '1.85rem',
    });
    this._setStyles(this.best, {
      top: compact ? '52px' : '58px', left: '50%', right: '', transform: 'translateX(-50%)', fontSize: '0.76rem',
    });
    this._setStyles(this.rank, {
      top: '18px', right: '24px', left: '', transform: '', fontSize: compact ? '1.25rem' : '1.55rem',
    });
    this._setStyles(this.wanted, {
      top: '56px', right: '24px', left: '', transform: '', fontSize: compact ? '0.9rem' : '1.05rem',
    });
    this._setStyles(this.speedWrap, {
      right: '28px', bottom: '34px', left: '', top: '', transform: '', minWidth: compact ? '110px' : '150px', textAlign: 'right',
    });
    this._setStyles(this.speed, { fontSize: compact ? '3rem' : '4.25rem' });
    this._setStyles(this.speedUnit, { fontSize: compact ? '0.68rem' : '0.78rem' });
    this._setStyles(this.nitroWrap, {
      left: '24px', bottom: '34px', right: '', top: '', width: '14px', height: compact ? '118px' : '150px',
    });
    this._setMinimapSize(compact ? 132 : 180, compact ? 92 : 124);
    this._setStyles(this.minimap, {
      left: compact ? '40px' : '50px', bottom: '34px', right: '', top: '', width: `${compact ? 132 : 180}px`, height: `${compact ? 92 : 124}px`,
    });
    this._setStyles(this.progress, {
      left: '50%', bottom: '24px', right: '', top: '', transform: 'translateX(-50%)', width: compact ? '42vw' : 'min(460px,56vw)', height: '6px',
    });
    this._setStyles(this.status, {
      left: '50%', bottom: '42px', right: '', top: '', transform: 'translateX(-50%)', fontSize: '0.78rem',
    });
    this._setStyles(this.message, {
      top: '42%', fontSize: 'clamp(2.6rem,7vw,6rem)',
    });
  }

  _applyLandscapeHUD(width, height) {
    this._setStyles(this.mode, {
      top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 70px)',
      right: '',
      transform: '',
      fontSize: '0.66rem',
    });
    this._setStyles(this.lap, {
      top: 'calc(env(safe-area-inset-top, 0px) + 32px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 70px)',
      right: '',
      transform: '',
      fontSize: '0.78rem',
    });
    this._setStyles(this.timer, {
      top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
      left: '50%',
      right: '',
      transform: 'translateX(-50%)',
      fontSize: '1.42rem',
    });
    this._setStyles(this.best, {
      top: 'calc(env(safe-area-inset-top, 0px) + 42px)',
      left: '50%',
      right: '',
      transform: 'translateX(-50%)',
      fontSize: '0.62rem',
    });
    this._setStyles(this.rank, {
      top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
      right: 'calc(env(safe-area-inset-right, 0px) + 92px)',
      left: '',
      transform: '',
      fontSize: '1.18rem',
    });
    this._setStyles(this.wanted, {
      top: 'calc(env(safe-area-inset-top, 0px) + 40px)',
      right: 'calc(env(safe-area-inset-right, 0px) + 92px)',
      left: '',
      transform: '',
      fontSize: '0.78rem',
    });
    this._setStyles(this.speedWrap, {
      right: 'calc(env(safe-area-inset-right, 0px) + 28px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 132px)',
      left: '',
      top: '',
      transform: '',
      minWidth: '104px',
      textAlign: 'right',
    });
    this._setStyles(this.speed, { fontSize: '2.65rem' });
    this._setStyles(this.speedUnit, { fontSize: '0.58rem' });
    this._setStyles(this.nitroWrap, {
      left: 'calc(env(safe-area-inset-left, 0px) + 18px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      right: '',
      top: '',
      width: '10px',
      height: '112px',
    });
    this._setMinimapSize(138, 84);
    this._setStyles(this.minimap, {
      left: 'calc(env(safe-area-inset-left, 0px) + 174px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      right: '',
      top: '',
      width: '138px',
      height: '84px',
    });
    this._setStyles(this.progress, {
      left: '50%',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
      right: '',
      top: '',
      transform: 'translateX(-50%)',
      width: 'min(340px,42vw)',
      height: '5px',
    });
    this._setStyles(this.status, {
      left: '50%',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
      right: '',
      top: '',
      transform: 'translateX(-50%)',
      fontSize: '0.62rem',
    });
    this._setStyles(this.message, {
      top: '43%',
      fontSize: 'clamp(2rem,6vw,4.2rem)',
    });
  }

  _applyPortraitHUD(width, height) {
    this._setStyles(this.mode, {
      top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
      right: '',
      transform: '',
      fontSize: '0.64rem',
    });
    this._setStyles(this.lap, {
      top: 'calc(env(safe-area-inset-top, 0px) + 32px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
      right: '',
      transform: '',
      fontSize: '0.76rem',
    });
    this._setStyles(this.timer, {
      top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
      left: '50%',
      right: '',
      transform: 'translateX(-50%)',
      fontSize: '1.28rem',
    });
    this._setStyles(this.best, {
      top: 'calc(env(safe-area-inset-top, 0px) + 42px)',
      left: '50%',
      right: '',
      transform: 'translateX(-50%)',
      fontSize: '0.58rem',
    });
    this._setStyles(this.rank, {
      top: 'calc(env(safe-area-inset-top, 0px) + 74px)',
      right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
      left: '',
      transform: '',
      fontSize: '1rem',
    });
    this._setStyles(this.wanted, {
      top: 'calc(env(safe-area-inset-top, 0px) + 104px)',
      right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
      left: '',
      transform: '',
      fontSize: '0.74rem',
    });
    this._setStyles(this.speedWrap, {
      right: 'calc(env(safe-area-inset-right, 0px) + 18px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 154px)',
      left: '',
      top: '',
      transform: '',
      minWidth: '98px',
      textAlign: 'right',
    });
    this._setStyles(this.speed, { fontSize: '2.5rem' });
    this._setStyles(this.speedUnit, { fontSize: '0.58rem' });
    this._setStyles(this.nitroWrap, {
      left: 'calc(env(safe-area-inset-left, 0px) + 18px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 228px)',
      right: '',
      top: '',
      width: '10px',
      height: '104px',
    });
    this._setMinimapSize(126, 86);
    this._setStyles(this.minimap, {
      left: 'calc(env(safe-area-inset-left, 0px) + 18px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 176px)',
      right: '',
      top: '',
      width: '126px',
      height: '86px',
    });
    this._setStyles(this.progress, {
      left: '50%',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 144px)',
      right: '',
      top: '',
      transform: 'translateX(-50%)',
      width: '46vw',
      height: '5px',
    });
    this._setStyles(this.status, {
      left: '50%',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 158px)',
      right: '',
      top: '',
      transform: 'translateX(-50%)',
      fontSize: '0.62rem',
    });
    this._setStyles(this.message, {
      top: '38%',
      fontSize: 'clamp(2.1rem,12vw,4.4rem)',
    });
  }

  _setStyles(el, styles) {
    if (!el) return;
    Object.assign(el.style, styles);
  }

  _setMinimapSize(width, height) {
    if (!this.minimap) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const canvasWidth = Math.max(1, Math.round(width * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(height * pixelRatio));
    if (this.minimap.width !== canvasWidth) this.minimap.width = canvasWidth;
    if (this.minimap.height !== canvasHeight) this.minimap.height = canvasHeight;
  }

  update(delta) {
    if (this._messageTimer > 0) {
      this._messageTimer -= delta;
      if (this._messageTimer <= 0) {
        this.message.style.opacity = '0';
      }
    }
  }

  _formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '--:--.--';
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${String(m).padStart(2, '0')}:${s}`;
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
