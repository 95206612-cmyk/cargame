const DEFAULT_ROOM_SETTINGS = {
  mode: 'speed',
  trackId: 'city_circuit',
  laps: 3,
  maxPlayers: 6,
  itemMode: false,
  collisions: true,
};

const MODE_OPTIONS = [
  { value: 'speed', label: '竞速赛' },
  { value: 'item', label: '道具赛' },
  { value: 'team', label: '组队赛' },
  { value: 'time', label: '计时赛' },
];

const TRACK_OPTIONS = [
  { value: 'city_circuit', label: '城市环道' },
  { value: 'city_circuit_01', label: '城市环道 01' },
  { value: 'mountain_pass', label: '山路挑战' },
  { value: 'coastal_highway', label: '海岸公路' },
];

const CONNECTION_LABELS = {
  idle: '未连接',
  testing: '检测中',
  online: '服务器在线',
  offline: '服务器离线',
  connecting: '连接中',
  connected: '已连接',
  disconnected: '已断开',
  error: '连接错误',
};

export class MultiplayerUI {
  constructor(container) {
    this._container = container;
    this._panel = null;
    this._content = null;
    this._visible = false;
    this._roomCode = '';
    this._roomSettings = { ...DEFAULT_ROOM_SETTINGS };
    this._isHost = false;
    this._lastPlayers = [];
    this._serverUrl = localStorage.getItem('cargame_ws_url') || 'ws://localhost:8080';
    this._connectionState = 'idle';
    this._connectionDetail = '请先启动或选择一台联机服务器';
    this._rooms = [];
    this._latency = 0;

    this.onCreateRoom = null;
    this.onJoinRoom = null;
    this.onReady = null;
    this.onLeave = null;
    this.onCancelMatch = null;
    this.onRoomSettingsChange = null;
    this.onServerUrlChange = null;
    this.onTestServer = null;
    this.onRefreshRooms = null;

    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'multiplayer-panel';
    panel.style.cssText = `
      display:none;position:fixed;inset:0;z-index:170;pointer-events:auto;overflow:auto;color:#fff;
      font-family:"Segoe UI",system-ui,sans-serif;
      background:
        radial-gradient(circle at 15% 10%, rgba(26,188,156,0.2), transparent 28%),
        radial-gradient(circle at 82% 18%, rgba(255,209,102,0.16), transparent 30%),
        linear-gradient(135deg,#07101d 0%,#121b33 52%,#080b14 100%);
    `;
    this._panel = panel;
    panel.innerHTML = `
      <div style="min-height:100%;display:flex;flex-direction:column;">
        <header style="display:flex;align-items:center;gap:14px;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:1.2rem;font-weight:950;color:#1abc9c;letter-spacing:3px;">网络比赛</div>
          <div style="font-size:0.78rem;color:#9fb2c2;">真实服务器 / 房间模式 / 准备后倒计时开赛</div>
          <button id="mp-back" class="panel-close-under-esc" type="button" style="margin-left:auto;padding:7px 18px;border:1px solid #95a5a6;background:transparent;color:#c8d6e2;border-radius:4px;font-weight:900;cursor:pointer;">返回</button>
        </header>
        <main id="mp-content" style="flex:1;display:grid;place-items:center;padding:18px;"></main>
      </div>
    `;
    panel.querySelector('#mp-back').addEventListener('click', () => {
      this.hide();
      this.onLeave?.();
    });
    this._content = panel.querySelector('#mp-content');

    this._countdownOverlay = this._buildCountdownOverlay();
    panel.appendChild(this._countdownOverlay);
    this._errorBar = document.createElement('div');
    this._errorBar.style.cssText = 'display:none;position:absolute;bottom:34px;left:50%;transform:translateX(-50%);padding:10px 24px;background:rgba(231,76,60,0.92);border-radius:8px;font-size:0.85rem;max-width:560px;text-align:center;box-shadow:0 10px 32px rgba(0,0,0,0.35);';
    panel.appendChild(this._errorBar);
    this._container.appendChild(panel);
  }

  show(options = {}) {
    if (options.serverUrl) this._serverUrl = options.serverUrl;
    this._panel.style.display = 'block';
    this._visible = true;
    this._renderJoinScreen();
  }

  hide() {
    this._panel.style.display = 'none';
    this._visible = false;
    this._hideCountdown();
    this._hideError();
  }

  get visible() {
    return this._visible;
  }

  setServerInfo(url, state = this._connectionState, detail = this._connectionDetail, latency = this._latency) {
    if (url) this._serverUrl = url;
    this._connectionState = state;
    this._connectionDetail = detail || '';
    this._latency = latency || 0;
    this._updateServerStatus();
  }

  setRooms(rooms = []) {
    this._rooms = rooms;
    this._renderRoomList();
  }

  _renderJoinScreen() {
    const savedName = localStorage.getItem('cargame_mp_name') || localStorage.getItem('cargame_profile_name') || '';
    this._content.innerHTML = `
      <section style="width:min(1180px,96vw);display:grid;grid-template-columns:minmax(310px,0.9fr) minmax(360px,1.05fr) minmax(320px,0.95fr);gap:18px;align-items:start;">
        <div class="mp-card">
          <div class="mp-title">服务器</div>
          <label class="mp-field">服务器地址
            <input id="mp-server-input" value="${this._escape(this._serverUrl)}" placeholder="ws://192.168.1.23:8080 或 wss://game.example.com">
          </label>
          <div id="mp-server-status" class="mp-server-status ${this._connectionState}">${this._statusMarkup()}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
            <button id="mp-test-server-btn" class="mp-btn secondary" type="button">测试连接</button>
            <button id="mp-refresh-rooms-btn" class="mp-btn secondary" type="button">刷新房间</button>
          </div>
          <div style="margin-top:12px;color:#7f92a3;font-size:0.76rem;line-height:1.6;">
            局域网示例：<b>ws://192.168.1.23:8080</b><br>
            公网建议：<b>wss://你的域名</b><br>
            APK 同一 Wi-Fi 可直连局域网 IP，跨网络需要云服务器。
          </div>
        </div>

        <div class="mp-card">
          <div class="mp-title">车手信息</div>
          <label class="mp-field">昵称<input id="mp-name-input" maxlength="16" value="${this._escape(savedName)}" placeholder="输入你的车手名"></label>
          <label class="mp-field">房间号<input id="mp-code-input" maxlength="4" placeholder="加入房间用，4 位代码"></label>
          <button id="mp-join-btn" class="mp-btn secondary" type="button">加入房间</button>
          <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
            <div class="mp-title" style="margin-bottom:8px;">公开房间</div>
            <div id="mp-room-list" class="mp-room-list"></div>
          </div>
        </div>

        <div class="mp-card">
          <div class="mp-title">创建房间</div>
          ${this._settingsFields(this._roomSettings, true)}
          <button id="mp-create-btn" class="mp-btn primary" type="button">创建比赛房间</button>
        </div>
      </section>
    `;
    this._injectStyle();
    this._bindJoinScreenEvents();
    this._renderRoomList();
    this._updateServerStatus();
  }

  _bindJoinScreenEvents() {
    const serverInput = this._content.querySelector('#mp-server-input');
    const codeInput = this._content.querySelector('#mp-code-input');

    serverInput.addEventListener('change', () => this._commitServerUrl());
    serverInput.addEventListener('blur', () => this._commitServerUrl());
    codeInput.addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
    });

    this._content.querySelector('#mp-test-server-btn').addEventListener('click', () => {
      const url = this._commitServerUrl();
      this.setServerInfo(url, 'testing', '正在请求 /health ...');
      this.onTestServer?.(url);
    });
    this._content.querySelector('#mp-refresh-rooms-btn').addEventListener('click', () => {
      const url = this._commitServerUrl();
      this.setServerInfo(url, this._connectionState, '正在刷新房间列表...');
      this.onRefreshRooms?.(url);
    });
    this._content.querySelector('#mp-create-btn').addEventListener('click', () => {
      const name = this._readName();
      if (!name) return;
      const url = this._commitServerUrl();
      const settings = this._readSettings();
      this._roomSettings = settings;
      localStorage.setItem('cargame_mp_name', name);
      this.onCreateRoom?.(name, settings, url);
    });
    this._content.querySelector('#mp-join-btn').addEventListener('click', () => {
      const name = this._readName();
      if (!name) return;
      const url = this._commitServerUrl();
      const code = codeInput.value.trim().toUpperCase();
      if (code.length !== 4) {
        this.showError('房间号需要 4 位字符');
        return;
      }
      localStorage.setItem('cargame_mp_name', name);
      this.onJoinRoom?.(code, name, url);
    });
  }

  _commitServerUrl() {
    const input = this._content?.querySelector('#mp-server-input');
    const raw = (input?.value || this._serverUrl || '').trim() || 'ws://localhost:8080';
    const normalized = this._normalizeServerUrl(raw);
    this._serverUrl = normalized;
    if (input) input.value = normalized;
    localStorage.setItem('cargame_ws_url', normalized);
    this.onServerUrlChange?.(normalized);
    return normalized;
  }

  showLobby(roomCode, players = [], settings = this._roomSettings, isHost = this._isHost) {
    this._roomCode = roomCode;
    this._roomSettings = { ...DEFAULT_ROOM_SETTINGS, ...(settings || {}) };
    this._isHost = Boolean(isHost);
    this._renderLobby(players);
  }

  updatePlayers(players = [], settings = this._roomSettings, isHost = this._isHost) {
    this._roomSettings = { ...DEFAULT_ROOM_SETTINGS, ...(settings || {}) };
    this._isHost = Boolean(isHost);
    this._renderLobby(players);
  }

  applyRoomSettings(settings = {}) {
    this._roomSettings = { ...DEFAULT_ROOM_SETTINGS, ...settings };
    if (this._roomCode) this._renderLobby(this._lastPlayers || []);
  }

  _renderLobby(players = []) {
    this._lastPlayers = players;
    const settings = this._roomSettings;
    const readyCount = players.filter(p => p.ready).length;
    const status = players.length < 2
      ? 'Need at least 2 players / 至少需要 2 名玩家'
      : `已准备 ${readyCount}/${players.length}`;
    this._content.innerHTML = `
      <section style="width:min(1100px,96vw);display:grid;grid-template-columns:280px minmax(420px,1fr) 280px;gap:16px;align-items:start;">
        <aside class="mp-card">
          <div class="mp-title">房间号</div>
          <div style="font-size:2.5rem;font-weight:950;letter-spacing:9px;color:#ffd166;text-align:center;">${this._escape(this._roomCode || 'ROOM')}</div>
          <div style="text-align:center;color:#8294a4;font-size:0.76rem;">分享给好友加入</div>
          <div style="margin-top:14px;font-size:0.78rem;color:#9fb2c2;line-height:1.6;">
            服务器：${this._escape(this._serverUrl)}<br>
            <b>${this._modeLabel(settings.mode)}</b><br>
            ${this._trackLabel(settings.trackId)}<br>
            ${settings.laps} 圈 · ${settings.maxPlayers} 人<br>
            ${settings.itemMode ? '道具开启' : '纯竞速'} · ${settings.collisions ? '碰撞开启' : '幽灵模式'}
          </div>
        </aside>
        <main class="mp-card">
          <div class="mp-title">玩家席位</div>
          <div id="mp-player-list" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;">${this._playerRows(players, settings.maxPlayers)}</div>
          <div id="mp-lobby-status" style="margin-top:12px;text-align:center;color:#9fb2c2;font-size:0.82rem;">${status}</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;">
            <button id="mp-ready-btn" class="mp-btn primary" data-ready="0" type="button">${this._localReady(players) ? '取消准备' : '准备'}</button>
            <button id="mp-leave-btn" class="mp-btn secondary" type="button">离开房间</button>
          </div>
        </main>
        <aside class="mp-card">
          <div class="mp-title">房间规则</div>
          ${this._settingsFields(settings, this._isHost)}
          <div style="color:#8294a4;font-size:0.72rem;line-height:1.5;margin-top:8px;">${this._isHost ? '房主修改后会同步给房间内所有玩家。' : '只有房主可以修改房间规则。'}</div>
        </aside>
      </section>
    `;
    this._injectStyle();
    const readyBtn = this._content.querySelector('#mp-ready-btn');
    readyBtn.dataset.ready = this._localReady(players) ? '1' : '0';
    readyBtn.addEventListener('click', () => {
      const next = readyBtn.dataset.ready !== '1';
      readyBtn.dataset.ready = next ? '1' : '0';
      readyBtn.textContent = next ? '取消准备' : '准备';
      this.onReady?.(next);
    });
    this._content.querySelector('#mp-leave-btn').addEventListener('click', () => this.onLeave?.());
    if (this._isHost) {
      for (const el of this._content.querySelectorAll('[data-room-setting]')) {
        el.addEventListener('change', () => {
          const next = this._readSettings();
          this._roomSettings = next;
          this.onRoomSettingsChange?.(next);
        });
      }
    }
  }

  showCountdown(seconds) {
    this._countdownOverlay.style.display = 'flex';
    const text = this._countdownOverlay.querySelector('#mp-countdown-text');
    text.textContent = seconds === 0 ? 'GO!' : String(seconds);
    text.style.color = seconds === 0 ? '#2ecc71' : '#fff';
    text.style.transform = 'scale(1.22)';
    setTimeout(() => { text.style.transform = 'scale(1)'; }, 60);
  }

  hideCountdown() {
    this._hideCountdown();
  }

  showError(message) {
    this._errorBar.textContent = message;
    this._errorBar.style.display = 'block';
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => this._hideError(), 4200);
  }

  _buildCountdownOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'mp-countdown';
    overlay.style.cssText = 'display:none;position:absolute;inset:0;background:rgba(0,0,0,0.72);align-items:center;justify-content:center;pointer-events:none;';
    overlay.innerHTML = '<div id="mp-countdown-text" style="font-size:8rem;font-weight:950;color:#fff;text-shadow:0 0 60px rgba(255,255,255,0.5);transition:transform 0.15s;"></div>';
    return overlay;
  }

  _settingsFields(settings, enabled) {
    const disabled = enabled ? '' : 'disabled';
    return `
      <label class="mp-field">模式<select data-room-setting="mode" id="mp-setting-mode" ${disabled}>${this._options(MODE_OPTIONS, settings.mode)}</select></label>
      <label class="mp-field">赛道<select data-room-setting="trackId" id="mp-setting-track" ${disabled}>${this._options(TRACK_OPTIONS, settings.trackId)}</select></label>
      <label class="mp-field">圈数<input data-room-setting="laps" id="mp-setting-laps" type="number" min="1" max="5" value="${Number(settings.laps) || 3}" ${disabled}></label>
      <label class="mp-field">人数<input data-room-setting="maxPlayers" id="mp-setting-max" type="number" min="2" max="6" value="${Number(settings.maxPlayers) || 6}" ${disabled}></label>
      <label class="mp-check"><input data-room-setting="itemMode" id="mp-setting-items" type="checkbox" ${settings.itemMode ? 'checked' : ''} ${disabled}> 开启道具</label>
      <label class="mp-check"><input data-room-setting="collisions" id="mp-setting-collisions" type="checkbox" ${settings.collisions !== false ? 'checked' : ''} ${disabled}> 开启车辆碰撞</label>
    `;
  }

  _readName() {
    const name = (this._content.querySelector('#mp-name-input')?.value || '').trim();
    if (!name) {
      this.showError('请输入车手昵称');
      return '';
    }
    return name;
  }

  _readSettings() {
    return {
      mode: this._content.querySelector('#mp-setting-mode')?.value || 'speed',
      trackId: this._content.querySelector('#mp-setting-track')?.value || 'city_circuit',
      laps: Math.max(1, Math.min(5, Number(this._content.querySelector('#mp-setting-laps')?.value) || 3)),
      maxPlayers: Math.max(2, Math.min(6, Number(this._content.querySelector('#mp-setting-max')?.value) || 6)),
      itemMode: Boolean(this._content.querySelector('#mp-setting-items')?.checked),
      collisions: this._content.querySelector('#mp-setting-collisions')?.checked !== false,
    };
  }

  _renderRoomList() {
    const list = this._content?.querySelector('#mp-room-list');
    if (!list) return;
    if (!this._rooms.length) {
      list.innerHTML = '<div class="mp-empty">暂无公开房间，创建一个房间后好友就能刷新看到。</div>';
      return;
    }

    list.innerHTML = this._rooms.map(room => {
      const settings = room.settings || DEFAULT_ROOM_SETTINGS;
      const disabled = room.joinable === false ? 'disabled' : '';
      const state = this._stateLabel(room.state);
      return `
        <button class="mp-room-row" type="button" data-room-code="${this._escape(room.code)}" ${disabled}>
          <b>${this._escape(room.code)}</b>
          <span>${this._escape(room.hostName || '房主')} · ${this._trackLabel(settings.trackId)}</span>
          <small>${this._modeLabel(settings.mode)} · ${room.playerCount}/${room.maxPlayers} · ${state}</small>
        </button>
      `;
    }).join('');

    for (const row of list.querySelectorAll('[data-room-code]')) {
      row.addEventListener('click', () => {
        const code = row.getAttribute('data-room-code');
        const input = this._content.querySelector('#mp-code-input');
        if (input) input.value = code;
      });
    }
  }

  _updateServerStatus() {
    const status = this._content?.querySelector('#mp-server-status');
    if (!status) return;
    status.className = `mp-server-status ${this._connectionState}`;
    status.innerHTML = this._statusMarkup();
  }

  _statusMarkup() {
    const label = CONNECTION_LABELS[this._connectionState] || this._connectionState;
    const latency = this._latency ? ` · ${this._latency}ms` : '';
    return `<b>${label}${latency}</b><span>${this._escape(this._connectionDetail || '')}</span>`;
  }

  _playerRows(players, maxPlayers = 6) {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
    let html = '';
    for (let i = 0; i < Math.min(maxPlayers, 6); i++) {
      const p = players[i];
      if (p) {
        html += `<div class="mp-slot" style="border-color:${p.ready ? 'rgba(46,204,113,0.5)' : 'rgba(255,255,255,0.1)'};">
          <span style="width:12px;height:12px;border-radius:50%;background:${colors[i % colors.length]};"></span>
          <b>${this._escape(p.name || `玩家 ${i + 1}`)}</b>
          <small>${this._carName(p.vehicleType)} · ${p.ready ? '已准备' : '等待中'}</small>
        </div>`;
      } else {
        html += '<div class="mp-slot empty"><b>空位</b><small>等待玩家加入...</small></div>';
      }
    }
    return html;
  }

  _localReady(players) {
    const local = players.find(p => String(p.name || '').includes('(You)') || p.local);
    return Boolean(local?.ready);
  }

  _normalizeServerUrl(value) {
    const raw = String(value || '').trim() || 'ws://localhost:8080';
    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '');
    }
    if (/^wss?:\/\//i.test(raw)) return raw.replace(/\/$/, '');
    return `ws://${raw.replace(/\/$/, '')}`;
  }

  _stateLabel(state) {
    return ({ lobby: '等待中', countdown: '倒计时', racing: '比赛中', finished: '已结束' })[state] || state || '未知';
  }

  _carName(vehicleType) {
    return ['Tuner', 'Coupe', 'Supercar', 'Muscle', 'Classic'][vehicleType] || 'Car';
  }

  _modeLabel(mode) {
    return MODE_OPTIONS.find(item => item.value === mode)?.label || '竞速赛';
  }

  _trackLabel(trackId) {
    return TRACK_OPTIONS.find(item => item.value === trackId)?.label || trackId || '城市环道';
  }

  _options(list, selected) {
    return list.map(item => `<option value="${item.value}" ${item.value === selected ? 'selected' : ''}>${item.label}</option>`).join('');
  }

  _hideCountdown() {
    if (this._countdownOverlay) this._countdownOverlay.style.display = 'none';
  }

  _hideError() {
    this._errorBar.style.display = 'none';
  }

  _injectStyle() {
    if (document.getElementById('mp-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'mp-ui-style';
    style.textContent = `
      .mp-card{border:1px solid rgba(255,255,255,0.14);background:rgba(7,15,28,0.82);padding:16px;box-shadow:0 18px 60px rgba(0,0,0,0.32);backdrop-filter:blur(12px);border-radius:2px;}
      .mp-title{font-size:0.8rem;color:#ffd166;font-weight:950;letter-spacing:2px;margin-bottom:12px;}
      .mp-field{display:flex;flex-direction:column;gap:6px;margin:10px 0;color:#9fb2c2;font-size:0.75rem;font-weight:800;}
      .mp-field input,.mp-field select{padding:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#fff;border-radius:7px;outline:none;min-width:0;}
      .mp-field option{color:#111;}
      .mp-check{display:flex;align-items:center;gap:8px;margin:9px 0;color:#c8d6e2;font-size:0.76rem;}
      .mp-btn{padding:11px 18px;border-radius:8px;font-weight:950;cursor:pointer;border:1px solid rgba(255,255,255,0.18);}
      .mp-btn.primary{background:#1abc9c;border-color:#1abc9c;color:#05110f;}
      .mp-btn.secondary{background:rgba(255,255,255,0.06);color:#d8e7f5;}
      .mp-server-status{display:flex;flex-direction:column;gap:2px;padding:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);font-size:0.76rem;color:#9fb2c2;}
      .mp-server-status b{color:#d8e7f5;}
      .mp-server-status.online b,.mp-server-status.connected b{color:#2ecc71;}
      .mp-server-status.offline b,.mp-server-status.error b,.mp-server-status.disconnected b{color:#e74c3c;}
      .mp-room-list{display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto;padding-right:2px;}
      .mp-room-row{display:grid;grid-template-columns:70px 1fr;gap:2px 8px;text-align:left;padding:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:#fff;cursor:pointer;}
      .mp-room-row:hover{border-color:rgba(26,188,156,0.7);background:rgba(26,188,156,0.12);}
      .mp-room-row:disabled{opacity:0.5;cursor:not-allowed;}
      .mp-room-row b{color:#ffd166;letter-spacing:2px;}
      .mp-room-row span{font-size:0.76rem;color:#d8e7f5;}
      .mp-room-row small{grid-column:2;color:#8fa2b3;font-size:0.68rem;}
      .mp-empty{padding:14px;border:1px dashed rgba(255,255,255,0.14);color:#7f92a3;font-size:0.76rem;line-height:1.55;}
      .mp-slot{min-height:58px;display:grid;grid-template-columns:16px 1fr;grid-template-rows:auto auto;gap:2px 8px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);}
      .mp-slot small{grid-column:2;color:#8fa2b3;font-size:0.68rem;}
      .mp-slot.empty{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;border-style:dashed;color:#586878;}
      @media (max-width: 980px){#mp-content section{grid-template-columns:1fr!important;width:min(560px,94vw)!important;}.mp-room-list{max-height:190px;}}
    `;
    document.head.appendChild(style);
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

  dispose() {
    this._panel?.parentNode?.removeChild(this._panel);
  }
}
