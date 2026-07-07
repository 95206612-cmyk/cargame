/**
 * Global main menu UI.
 * Uses native <button> elements for reliable click, touch, and keyboard support.
 */
export class MainMenu {
  constructor(container) {
    this._container = container;
    this._panel = null;
    this._visible = false;
    this._btns = [];  // { el, cb }

    // Callbacks
    this.onGarage = null;
    this.onFreeDrive = null;
    this.onRaceEvent = null;
    this.onPursuit = null;
    this.onDailyChallenge = null;
    this.onSettings = null;
    this.onMultiplayer = null;

    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'main-menu';
    panel.style.cssText = `
      display:none;position:fixed;inset:0;z-index:200;
      background:linear-gradient(135deg, #0a0a1e 0%, #1a1a3e 50%, #0d0d2b 100%);
      color:#fff;font-family:'Segoe UI',system-ui,sans-serif;
      flex-direction:column;align-items:center;justify-content:center;
      pointer-events:auto;overflow-y:auto;
    `;
    this._panel = panel;

    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = 'position:absolute;top:20px;left:0;right:0;display:flex;justify-content:center;gap:32px;pointer-events:none;';
    const levelEl = document.createElement('div');
    levelEl.id = 'menu-player-level';
    levelEl.style.cssText = 'font-size:0.9rem;color:#ffd700;font-weight:bold;';
    levelEl.textContent = 'LV.1';
    header.appendChild(levelEl);
    const creditsEl = document.createElement('div');
    creditsEl.id = 'menu-player-credits';
    creditsEl.style.cssText = 'font-size:0.9rem;color:#f39c12;';
    creditsEl.textContent = '0 CR';
    header.appendChild(creditsEl);
    const premiumEl = document.createElement('div');
    premiumEl.id = 'menu-player-premium';
    premiumEl.style.cssText = 'font-size:0.9rem;color:#3498db;';
    premiumEl.textContent = '0 PP';
    header.appendChild(premiumEl);
    panel.appendChild(header);

    // --- Title ---
    const title = document.createElement('div');
    title.style.cssText = 'font-size:3rem;font-weight:900;letter-spacing:6px;color:#ffd700;margin-bottom:8px;text-shadow:0 0 40px rgba(255,215,0,0.3);pointer-events:none;';
    title.textContent = 'STREET RACER';
    panel.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:0.8rem;color:#888;letter-spacing:4px;margin-bottom:32px;pointer-events:none;';
    subtitle.textContent = 'UNDERGROUND PURSUIT';
    panel.appendChild(subtitle);

    // --- Button grid ---
    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;justify-content:center;max-width:500px;padding:0 20px;';

    const defs = [
      { id: 'btn-garage', label: 'GARAGE', icon: '🏎', desc: '车库', color: '#3498db', cb: 'onGarage' },
      { id: 'btn-freedrive', label: 'FREE DRIVE', icon: '🛣', desc: '自由试驾', color: '#2ecc71', cb: 'onFreeDrive' },
      { id: 'btn-race', label: 'RACE EVENT', icon: '🏁', desc: '单人赛事', color: '#e74c3c', cb: 'onRaceEvent' },
      { id: 'btn-pursuit', label: 'PURSUIT', icon: '🚔', desc: '街头追逃', color: '#ff6600', cb: 'onPursuit' },
      { id: 'btn-daily', label: 'DAILY', icon: '⏱', desc: '每日挑战', color: '#9b59b6', cb: 'onDailyChallenge' },
      { id: 'btn-settings', label: 'SETTINGS', icon: '⚙', desc: '游戏设置', color: '#95a5a6', cb: 'onSettings' },
      { id: 'btn-multiplayer', label: 'MULTIPLAYER', icon: '🌐', desc: '多人联机', color: '#1abc9c', cb: 'onMultiplayer' },
    ];

    for (const d of defs) {
      const btn = document.createElement('button');
      btn.id = d.id;
      btn.setAttribute('type', 'button');
      btn.style.cssText = `
        width:140px;height:120px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:6px;
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
        border-radius:12px;cursor:pointer;transition:all 0.2s;
        color:#fff;font-family:inherit;padding:8px;
        -webkit-tap-highlight-color:transparent;
        outline:none;appearance:none;-webkit-appearance:none;
      `;

      // Hover effect
      btn.addEventListener('pointerenter', () => {
        btn.style.background = 'rgba(255,255,255,0.08)';
        btn.style.borderColor = d.color;
        btn.style.transform = 'translateY(-3px)';
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.background = 'rgba(255,255,255,0.03)';
        btn.style.borderColor = 'rgba(255,255,255,0.08)';
        btn.style.transform = 'translateY(0)';
      });

      const iconEl = document.createElement('span');
      iconEl.style.cssText = 'font-size:1.8rem;pointer-events:none;';
      iconEl.textContent = d.icon;
      btn.appendChild(iconEl);

      const labelEl = document.createElement('span');
      labelEl.style.cssText = `font-size:0.7rem;font-weight:bold;color:${d.color};letter-spacing:1px;pointer-events:none;`;
      labelEl.textContent = d.label;
      btn.appendChild(labelEl);

      const descEl = document.createElement('span');
      descEl.style.cssText = 'font-size:0.6rem;color:#666;pointer-events:none;';
      descEl.textContent = d.desc;
      btn.appendChild(descEl);

      // Click handler
      btn.addEventListener('click', () => {
        console.log('[MainMenu] Click:', d.cb);
        if (this[d.cb]) this[d.cb]();
      });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        console.log('[MainMenu] Touch:', d.cb);
        if (this[d.cb]) this[d.cb]();
      });

      grid.appendChild(btn);
      this._btns.push({ el: btn, cb: d.cb, color: d.color });
    }

    // --- Keyboard hint ---
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:24px;font-size:0.65rem;color:#555;pointer-events:none;';
    hint.textContent = 'Tab 切换按钮  ·  Enter 确认  ·  鼠标点击';
    panel.appendChild(hint);

    panel.appendChild(grid);

    // --- Footer ---
    const footer = document.createElement('div');
    footer.style.cssText = 'position:absolute;bottom:16px;font-size:0.6rem;color:#444;pointer-events:none;';
    footer.textContent = 'v1.0 — Single Player Edition';
    panel.appendChild(footer);

    // --- Keyboard: Enter/Space to activate focused button ---
    panel.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        const focused = document.activeElement;
        if (focused && focused.tagName === 'BUTTON' && panel.contains(focused)) {
          e.preventDefault();
          focused.click();
        }
      }
    });

    this._container.appendChild(panel);
    console.log('[MainMenu] Built with', this._btns.length, 'buttons');
  }

  show(playerData) {
    this._panel.style.display = 'flex';
    this._visible = true;
    this._updatePlayerInfo(playerData);

    // Prevent WebGL canvas from intercepting clicks (GPU compositor workaround)
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.style.pointerEvents = 'none';
      console.log('[MainMenu] Canvas pointer-events disabled');
    }

    // Auto-focus first button so keyboard works immediately
    setTimeout(() => {
      if (this._btns.length > 0) this._btns[0].el.focus();
    }, 100);

    console.log('[MainMenu] Shown');
  }

  hide() {
    this._panel.style.display = 'none';
    this._visible = false;

    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.style.pointerEvents = '';
    }
  }

  get visible() {
    return this._visible;
  }

  _updatePlayerInfo(pd) {
    if (!pd) return;
    const levelEl = document.getElementById('menu-player-level');
    if (levelEl) levelEl.textContent = `LV.${pd.level}`;
    const creditsEl = document.getElementById('menu-player-credits');
    if (creditsEl) creditsEl.textContent = `${(pd.credits || 0).toLocaleString()} CR`;
    const premiumEl = document.getElementById('menu-player-premium');
    if (premiumEl) premiumEl.textContent = `${(pd.premiumPoints || 0).toLocaleString()} PP`;
  }

  updatePlayerInfo(playerData) {
    this._updatePlayerInfo(playerData);
  }
}
