/**
 * Post-game settlement popup.
 *
 * Displays race results (rank, time, best lap, XP, credits),
 * pursuit results (escape/busted, reward), daily challenge leaderboard.
 * Handles new record flash animation and action buttons.
 */
export class ResultPopup {
  constructor(container) {
    this._container = container;
    this._panel = null;

    // Callbacks
    this.onBackToMenu = null;
    this.onRetry = null;
    this.onGarage = null;

    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.id = 'result-popup';
    panel.style.cssText = `
      display:none;position:fixed;inset:0;z-index:150;
      background:rgba(0,0,0,0.92);
      flex-direction:column;align-items:center;justify-content:center;
      pointer-events:auto;
      font-family:'Segoe UI',system-ui,sans-serif;color:#fff;
    `;
    this._panel = panel;

    // --- Content area ---
    const content = document.createElement('div');
    content.id = 'result-content';
    content.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;max-width:420px;width:100%;padding:20px;';
    panel.appendChild(content);

    // Icon
    const icon = document.createElement('div');
    icon.id = 'result-icon';
    icon.style.cssText = 'font-size:4rem;margin-bottom:4px;';
    content.appendChild(icon);

    // Title
    const title = document.createElement('div');
    title.id = 'result-title';
    title.style.cssText = 'font-size:2rem;font-weight:bold;margin-bottom:4px;';
    content.appendChild(title);

    // Stats area (dynamic based on mode)
    const stats = document.createElement('div');
    stats.id = 'result-stats';
    stats.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:6px;margin-bottom:8px;';
    content.appendChild(stats);

    // Record flash
    const recordFlash = document.createElement('div');
    recordFlash.id = 'result-record-flash';
    recordFlash.style.cssText = 'display:none;font-size:1rem;color:#ffd700;font-weight:bold;animation:resultPulse 0.5s ease-in-out infinite alternate;';
    recordFlash.textContent = 'NEW RECORD!';
    content.appendChild(recordFlash);

    // Add keyframes for pulse animation
    const style = document.createElement('style');
    style.textContent = '@keyframes resultPulse { from { opacity:0.4;transform:scale(0.95); } to { opacity:1;transform:scale(1.05); } }';
    document.head.appendChild(style);

    // XP bar
    const xpContainer = document.createElement('div');
    xpContainer.id = 'result-xp-container';
    xpContainer.style.cssText = 'width:100%;display:flex;align-items:center;gap:8px;';
    const xpLabel = document.createElement('span');
    xpLabel.textContent = 'XP';
    xpLabel.style.cssText = 'font-size:0.7rem;color:#aaa;min-width:24px;';
    xpContainer.appendChild(xpLabel);
    const xpBarBg = document.createElement('div');
    xpBarBg.style.cssText = 'flex:1;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;';
    const xpBarFill = document.createElement('div');
    xpBarFill.id = 'result-xp-fill';
    xpBarFill.style.cssText = 'width:0%;height:100%;background:#9b59b6;border-radius:3px;transition:width 0.8s ease-out;';
    xpBarBg.appendChild(xpBarFill);
    xpContainer.appendChild(xpBarBg);
    const xpText = document.createElement('span');
    xpText.id = 'result-xp-text';
    xpText.style.cssText = 'font-size:0.7rem;color:#9b59b6;min-width:60px;text-align:right;';
    xpContainer.appendChild(xpText);
    content.appendChild(xpContainer);

    // Level up flash
    const levelUp = document.createElement('div');
    levelUp.id = 'result-levelup';
    levelUp.style.cssText = 'display:none;font-size:1.2rem;color:#ffd700;font-weight:bold;margin-top:8px;';
    levelUp.textContent = 'LEVEL UP!';
    content.appendChild(levelUp);

    // --- Buttons ---
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;justify-content:center;';

    const retryBtn = this._createButton('RETRY', '#2ecc71', () => {
      if (this.onRetry) this.onRetry();
    });
    btnRow.appendChild(retryBtn);

    const garageBtn = this._createButton('GARAGE', '#3498db', () => {
      if (this.onGarage) this.onGarage();
    });
    btnRow.appendChild(garageBtn);

    const menuBtn = this._createButton('MENU', '#95a5a6', () => {
      if (this.onBackToMenu) this.onBackToMenu();
    });
    btnRow.appendChild(menuBtn);

    content.appendChild(btnRow);
    this._container.appendChild(panel);
  }

  _createButton(label, color, cb) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      padding:10px 24px;font-size:0.85rem;font-weight:bold;
      border:1px solid ${color};background:transparent;color:${color};
      border-radius:6px;cursor:pointer;transition:all 0.15s;
    `;
    btn.onmouseenter = () => { btn.style.background = color; btn.style.color = '#fff'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.color = color; };
    btn.onclick = cb;
    return btn;
  }

  // ==================== Show Results ====================

  /**
   * Show race event results.
   */
  showRaceResult(data, xpResult) {
    this._panel.style.display = 'flex';
    const icon = document.getElementById('result-icon');
    const title = document.getElementById('result-title');
    const stats = document.getElementById('result-stats');
    const recordFlash = document.getElementById('result-record-flash');

    const isWin = data.rank === 1;
    if (icon) { icon.textContent = isWin ? '🏆' : data.rank <= 3 ? '🥉' : '🏁'; }
    if (title) { title.textContent = isWin ? 'VICTORY!' : `FINISHED #${data.rank}`; title.style.color = isWin ? '#ffd700' : '#fff'; }

    // Stats
    if (stats) {
      stats.innerHTML = '';
      const statItems = [
        { label: 'Total Time', value: this._formatTime(data.totalTime) },
        { label: 'Best Lap', value: data.bestLap < Infinity ? this._formatTime(data.bestLap) : '--:--.--' },
        { label: 'XP Earned', value: `+${data.xpReward}`, color: '#9b59b6' },
        { label: 'Credits', value: `+${data.reward.toLocaleString()}`, color: '#f39c12' },
      ];

      if (data.rank === 1) {
        statItems.push({ label: 'Bonus', value: `WINNER`, color: '#ffd700' });
      }

      for (const item of statItems) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        const labelEl = document.createElement('span');
        labelEl.textContent = item.label;
        labelEl.style.cssText = 'font-size:0.8rem;color:#888;';
        row.appendChild(labelEl);
        const valEl = document.createElement('span');
        valEl.textContent = item.value;
        valEl.style.cssText = `font-size:0.8rem;font-weight:bold;color:${item.color || '#fff'};`;
        row.appendChild(valEl);
        stats.appendChild(row);
      }

      // Opponent times
      if (data.opponents) {
        const sep = document.createElement('div');
        sep.style.cssText = 'font-size:0.65rem;color:#555;margin-top:6px;';
        sep.textContent = 'OPPONENTS';
        stats.appendChild(sep);
        for (const opp of data.opponents) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;padding:2px 0;';
          const nameEl = document.createElement('span');
          nameEl.textContent = `#${opp.rank} ${opp.name}`;
          nameEl.style.cssText = 'font-size:0.7rem;color:#aaa;';
          row.appendChild(nameEl);
          const timeEl = document.createElement('span');
          timeEl.textContent = this._formatTime(opp.time);
          timeEl.style.cssText = 'font-size:0.7rem;color:#aaa;';
          row.appendChild(timeEl);
          stats.appendChild(row);
        }
      }
    }

    // Record flash
    if (recordFlash) {
      recordFlash.style.display = data.isNewRecord ? 'block' : 'none';
    }

    // XP bar
    this._updateXP(xpResult);
  }

  /**
   * Show pursuit result.
   */
  showPursuitResult(data, xpResult) {
    this._panel.style.display = 'flex';
    const icon = document.getElementById('result-icon');
    const title = document.getElementById('result-title');
    const stats = document.getElementById('result-stats');
    const recordFlash = document.getElementById('result-record-flash');
    if (recordFlash) recordFlash.style.display = 'none';

    const isEscape = data.result === 'escape';
    if (icon) { icon.textContent = isEscape ? '✅' : '🚨'; }
    if (title) { title.textContent = isEscape ? 'ESCAPED!' : 'BUSTED!'; title.style.color = isEscape ? '#2ecc71' : '#e74c3c'; }

    if (stats) {
      stats.innerHTML = '';
      const items = [
        { label: 'Star Level', value: `${data.starLevel} ★`, color: '#ff6600' },
      ];
      if (isEscape) {
        items.push({ label: 'Reward', value: `+${data.reward.toLocaleString()} CR`, color: '#2ecc71' });
        items.push({ label: 'XP', value: `+${data.xpReward}`, color: '#9b59b6' });
      } else {
        items.push({ label: 'Penalty', value: `-${data.penalty.toLocaleString()} CR`, color: '#e74c3c' });
      }

      for (const item of items) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        const l = document.createElement('span'); l.textContent = item.label; l.style.cssText = 'font-size:0.8rem;color:#888;'; row.appendChild(l);
        const v = document.createElement('span'); v.textContent = item.value; v.style.cssText = `font-size:0.8rem;font-weight:bold;color:${item.color}`; row.appendChild(v);
        stats.appendChild(row);
      }
    }

    this._updateXP(xpResult);
  }

  /**
   * Show daily challenge result.
   */
  showDailyResult(data, xpResult) {
    this._panel.style.display = 'flex';
    const icon = document.getElementById('result-icon');
    const title = document.getElementById('result-title');
    const stats = document.getElementById('result-stats');
    const recordFlash = document.getElementById('result-record-flash');

    if (icon) { icon.textContent = '⏱'; }
    if (title) { title.textContent = 'DAILY CHALLENGE'; title.style.color = '#9b59b6'; }
    if (recordFlash) { recordFlash.style.display = data.isNewRecord ? 'block' : 'none'; }

    if (stats) {
      stats.innerHTML = '';
      const items = [
        { label: 'Best Lap', value: this._formatTime(data.bestLap), color: '#fff' },
        { label: 'Reward', value: `+${data.reward || 50} PP`, color: '#3498db' },
      ];
      for (const item of items) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        const l = document.createElement('span'); l.textContent = item.label; l.style.cssText = 'font-size:0.8rem;color:#888;'; row.appendChild(l);
        const v = document.createElement('span'); v.textContent = item.value; v.style.cssText = `font-size:0.8rem;font-weight:bold;color:${item.color}`; row.appendChild(v);
        stats.appendChild(row);
      }

      // Leaderboard
      if (data.leaderboard && data.leaderboard.length > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = 'font-size:0.65rem;color:#555;margin-top:6px;';
        sep.textContent = 'LEADERBOARD';
        stats.appendChild(sep);
        for (let i = 0; i < Math.min(5, data.leaderboard.length); i++) {
          const entry = data.leaderboard[i];
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;padding:2px 0;';
          const rankEl = document.createElement('span');
          rankEl.textContent = `#${i + 1}`;
          rankEl.style.cssText = `font-size:0.7rem;font-weight:bold;color:${i === 0 ? '#ffd700' : '#aaa'};min-width:24px;`;
          row.appendChild(rankEl);
          const nameEl = document.createElement('span');
          nameEl.textContent = entry.name || 'Racer';
          nameEl.style.cssText = 'font-size:0.7rem;color:#aaa;flex:1;';
          row.appendChild(nameEl);
          const timeEl = document.createElement('span');
          timeEl.textContent = this._formatTime(entry.time);
          timeEl.style.cssText = 'font-size:0.7rem;color:#aaa;';
          row.appendChild(timeEl);
          stats.appendChild(row);
        }
      }
    }

    this._updateXP(xpResult);
  }

  /**
   * Show free drive summary (no real结算, just info).
   */
  showFreeDriveSummary() {
    this._panel.style.display = 'flex';
    const icon = document.getElementById('result-icon');
    const title = document.getElementById('result-title');
    const stats = document.getElementById('result-stats');
    const recordFlash = document.getElementById('result-record-flash');
    if (recordFlash) recordFlash.style.display = 'none';

    if (icon) { icon.textContent = '🛣'; }
    if (title) { title.textContent = 'FREE DRIVE'; title.style.color = '#2ecc71'; }
    if (stats) { stats.innerHTML = '<div style="font-size:0.8rem;color:#888;text-align:center;">No rewards in Free Drive mode</div>'; }
    this._updateXP(null);
  }

  _updateXP(xpResult) {
    const fill = document.getElementById('result-xp-fill');
    const text = document.getElementById('result-xp-text');
    const levelUpEl = document.getElementById('result-levelup');

    if (xpResult) {
      if (fill) fill.style.width = `${(xpResult.progress || 0) * 100}%`;
      if (text) text.textContent = `${xpResult.currentXP || 0} / ${xpResult.nextXP || 'MAX'}`;
      if (levelUpEl) levelUpEl.style.display = xpResult.leveledUp ? 'block' : 'none';
    } else {
      if (fill) fill.style.width = '0%';
      if (text) text.textContent = '';
      if (levelUpEl) levelUpEl.style.display = 'none';
    }
  }

  _formatTime(seconds) {
    if (!seconds || seconds === Infinity) return '--:--.--';
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${String(m).padStart(2, '0')}:${s}`;
  }

  hide() {
    this._panel.style.display = 'none';
  }

  dispose() {
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
  }
}
