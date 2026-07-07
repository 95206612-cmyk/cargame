import * as THREE from 'three';

/**
 * Full garage UI with:
 * - 3D car preview (rotatable via mouse drag)
 * - Car selection list with lock/own status
 * - Vehicle stats panel (speed, acceleration, drift, grip)
 * - Tuning upgrade tab (6 categories × 5 levels)
 * - Paint customization tab (color, metallic, pearl, decals)
 */
export class GarageUI {
  constructor(container) {
    this._container = container;
    this._panel = null;
    this._visible = false;

    // Callbacks
    this.onCarSelect = null;       // (carId) => void
    this.onTuneUpgrade = null;    // (carId, category) => void
    this.onPaintChange = null;    // (paintState) => void
    this.onPaintSave = null;      // (slot) => void
    this.onPaintLoad = null;      // (slot) => void
    this.onExit = null;           // () => void
    this.onRaceStart = null;      // (carId) => void
    this.onPursuitStart = null;  // (carId) => void

    // 3D preview
    this._previewRenderer = null;
    this._previewScene = null;
    this._previewCamera = null;
    this._previewCar = null;
    this._previewCanvas = null;
    this._isDragging = false;
    this._dragPrev = { x: 0, y: 0 };
    this._previewRotation = 0;
    this._previewAutoRotate = true;

    // State
    this._cars = [];              // Car list from CarLibrary
    this._selectedCarId = null;
    this._tuningLevels = {};
    this._credits = 0;

    this._build();
  }

  // ==================== Build ====================

  _build() {
    const panel = document.createElement('div');
    panel.id = 'garage-panel';
    panel.style.cssText = `
      display:none;position:fixed;inset:0;z-index:100;
      background:rgba(0,0,0,0.92);color:#fff;
      font-family:'Segoe UI',system-ui,sans-serif;
      flex-direction:column;pointer-events:auto;
    `;
    this._panel = panel;

    // --- Top bar ---
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;align-items:center;padding:8px 20px;border-bottom:1px solid rgba(255,255,255,0.1);gap:12px;';
    const title = document.createElement('span');
    title.textContent = 'GARAGE';
    title.style.cssText = 'font-size:1.2rem;font-weight:bold;color:#ffd700;letter-spacing:3px;';
    topBar.appendChild(title);

    const creditsEl = document.createElement('span');
    creditsEl.id = 'garage-credits';
    creditsEl.style.cssText = 'margin-left:auto;color:#f39c12;font-size:0.9rem;';
    creditsEl.textContent = '0 CR';
    topBar.appendChild(creditsEl);

    const exitBtn = document.createElement('button');
    exitBtn.id = 'garage-exit';
    exitBtn.className = 'panel-close-under-esc';
    exitBtn.textContent = 'EXIT';
    exitBtn.style.cssText = 'padding:6px 20px;border:1px solid #e74c3c;background:transparent;color:#e74c3c;border-radius:4px;cursor:pointer;font-weight:bold;';
    exitBtn.onclick = () => { if (this.onExit) this.onExit(); };
    topBar.appendChild(exitBtn);

    panel.appendChild(topBar);

    // --- Main content: sidebar + preview + details ---
    const main = document.createElement('div');
    main.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // -- Car list sidebar --
    const sidebar = document.createElement('div');
    sidebar.id = 'garage-car-list';
    sidebar.style.cssText = 'width:200px;border-right:1px solid rgba(255,255,255,0.1);overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;';
    main.appendChild(sidebar);

    // -- Preview area --
    const previewArea = document.createElement('div');
    previewArea.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;position:relative;min-width:300px;';
    const previewCanvas = document.createElement('canvas');
    previewCanvas.id = 'garage-preview-canvas';
    previewCanvas.style.cssText = 'width:100%;height:100%;';
    previewArea.appendChild(previewCanvas);
    main.appendChild(previewArea);

    // -- Details panel (stats + tuning + paint) --
    const details = document.createElement('div');
    details.id = 'garage-details';
    details.style.cssText = 'width:320px;border-left:1px solid rgba(255,255,255,0.1);padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;';
    main.appendChild(details);

    panel.appendChild(main);

    // --- Bottom bar: Race button ---
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = 'padding:10px 20px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:center;';
    const raceBtn = document.createElement('button');
    raceBtn.id = 'garage-race-btn';
    raceBtn.textContent = 'RACE';
    raceBtn.style.cssText = 'padding:12px 40px;font-size:1.1rem;font-weight:bold;border:none;border-radius:8px;cursor:pointer;background:#2ecc71;color:#fff;margin-right:12px;';
    raceBtn.onclick = () => {
      if (this.onRaceStart && this._selectedCarId) this.onRaceStart(this._selectedCarId);
    };
    bottomBar.appendChild(raceBtn);

    const pursuitBtn = document.createElement('button');
    pursuitBtn.id = 'garage-pursuit-btn';
    pursuitBtn.textContent = 'PURSUIT';
    pursuitBtn.style.cssText = 'padding:12px 40px;font-size:1.1rem;font-weight:bold;border:2px solid #e74c3c;border-radius:8px;cursor:pointer;background:transparent;color:#e74c3c;';
    pursuitBtn.onclick = () => {
      if (this.onPursuitStart && this._selectedCarId) this.onPursuitStart(this._selectedCarId);
    };
    bottomBar.appendChild(pursuitBtn);
    panel.appendChild(bottomBar);

    this._container.appendChild(panel);
    this._previewCanvas = previewCanvas;
    this._creditsEl = creditsEl;
    this._raceBtn = raceBtn;

    // Init 3D preview
    this._initPreview();
    this._buildDetailsPanel(details);
  }

  // ==================== 3D Preview ====================

  _initPreview() {
    const canvas = this._previewCanvas;
    this._previewRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this._previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this._previewScene = new THREE.Scene();
    this._previewScene.background = null;

    // Lighting
    this._previewScene.add(new THREE.AmbientLight(0x404060, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(5, 8, 5);
    this._previewScene.add(key);
    const fill = new THREE.DirectionalLight(0x8899cc, 1.5);
    fill.position.set(-3, 3, -2);
    this._previewScene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 2);
    rim.position.set(0, 2, -5);
    this._previewScene.add(rim);

    this._previewCamera = new THREE.PerspectiveCamera(45, 1, 0.5, 100);
    this._previewCamera.position.set(3, 2, 6);
    this._previewCamera.lookAt(0, 0.5, 0);

    // Rotating platform
    const platformGeo = new THREE.CylinderGeometry(1.2, 1.3, 0.15, 32);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.5 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.1;
    platform.receiveShadow = true;
    this._previewScene.add(platform);

    // Drag handlers
    canvas.addEventListener('pointerdown', (e) => {
      this._isDragging = true;
      this._previewAutoRotate = false;
      this._dragPrev = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this._isDragging || !this._visible) return;
      const dx = e.clientX - this._dragPrev.x;
      this._previewRotation += dx * 0.01;
      this._dragPrev = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => {
      this._isDragging = false;
    });

    // Handle resize
    this._resizePreview();
  }

  _resizePreview() {
    if (!this._previewCanvas || !this._previewRenderer) return;
    const rect = this._previewCanvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;
    this._previewCanvas.width = w * window.devicePixelRatio;
    this._previewCanvas.height = h * window.devicePixelRatio;
    this._previewCanvas.style.width = w + 'px';
    this._previewCanvas.style.height = h + 'px';
    this._previewRenderer.setSize(w, h, false);
    this._previewCamera.aspect = w / Math.max(h, 1);
    this._previewCamera.updateProjectionMatrix();
  }

  /**
   * Set the preview car model.
   */
  setPreviewCar(carModelGroup) {
    if (this._previewCar) {
      this._previewScene.remove(this._previewCar);
      this._previewCar = null;
    }
    if (carModelGroup) {
      this._previewCar = carModelGroup;
      this._previewCar.position.set(0, 0.5, 0);
      this._previewScene.add(this._previewCar);
    }
  }

  // ==================== UI Population ====================

  /**
   * Show the garage with car data.
   */
  show(cars, selectedCarId, credits, tuningLevels) {
    this._cars = cars;
    this._selectedCarId = selectedCarId || cars[0]?.id || null;
    this._credits = credits;
    this._tuningLevels = tuningLevels || {};

    this._panel.style.display = 'flex';
    this._visible = true;
    this._renderCarList();
    this._renderDetails();
    this._updateCredits();
  }

  hide() {
    this._panel.style.display = 'none';
    this._visible = false;
  }

  get visible() {
    return this._visible;
  }

  /**
   * Update credits display.
   */
  setCredits(credits) {
    this._credits = credits;
    this._updateCredits();
  }

  _updateCredits() {
    if (this._creditsEl) {
      this._creditsEl.textContent = `${this._credits.toLocaleString()} CR`;
    }
  }

  // ==================== Car List ====================

  _renderCarList() {
    const sidebar = document.getElementById('garage-car-list');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    for (const car of this._cars) {
      const item = document.createElement('div');
      const isSelected = car.id === this._selectedCarId;
      const isLocked = !car.unlocked && !car.owned;

      item.style.cssText = `
        padding:10px;border-radius:6px;cursor:${isLocked ? 'not-allowed' : 'pointer'};
        background:${isSelected ? 'rgba(52,152,219,0.3)' : 'rgba(255,255,255,0.03)'};
        border:1px solid ${isSelected ? '#3498db' : 'rgba(255,255,255,0.08)'};
        opacity:${isLocked ? '0.35' : '1'};
        transition:background 0.15s;
      `;

      const nameEl = document.createElement('div');
      nameEl.textContent = car.name;
      nameEl.style.cssText = 'font-weight:bold;font-size:0.9rem;';
      item.appendChild(nameEl);

      const catEl = document.createElement('div');
      catEl.textContent = car.category?.toUpperCase() || '';
      catEl.style.cssText = 'font-size:0.65rem;color:#888;';
      item.appendChild(catEl);

      const statusEl = document.createElement('div');
      if (car.owned) {
        statusEl.textContent = 'OWNED';
        statusEl.style.cssText = 'font-size:0.65rem;color:#2ecc71;';
      } else if (isLocked) {
        statusEl.textContent = `LV.${car.unlockLevel} LOCKED`;
        statusEl.style.cssText = 'font-size:0.65rem;color:#e74c3c;';
      } else {
        statusEl.textContent = `${car.price.toLocaleString()} CR`;
        statusEl.style.cssText = 'font-size:0.65rem;color:#f39c12;';
      }
      item.appendChild(statusEl);

      if (!isLocked) {
        item.onclick = () => {
          this._selectedCarId = car.id;
          this._renderCarList();
          this._renderDetails();
          if (this.onCarSelect) this.onCarSelect(car.id);
        };
      }

      sidebar.appendChild(item);
    }
  }

  // ==================== Details Panel ====================

  _buildDetailsPanel(container) {
    // Car name
    const nameEl = document.createElement('div');
    nameEl.id = 'garage-car-name';
    nameEl.style.cssText = 'font-size:1.3rem;font-weight:bold;text-align:center;color:#ffd700;';
    container.appendChild(nameEl);

    // Stats bars
    const statsContainer = document.createElement('div');
    statsContainer.id = 'garage-stats';
    container.appendChild(statsContainer);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.1);margin-top:8px;';
    const tuneTab = document.createElement('button');
    tuneTab.id = 'garage-tab-tuning';
    tuneTab.textContent = 'TUNING';
    tuneTab.style.cssText = 'flex:1;padding:8px;border:none;background:rgba(52,152,219,0.3);color:#fff;cursor:pointer;font-size:0.75rem;font-weight:bold;';
    tuneTab.onclick = () => { this._showTab('tuning'); };
    tabBar.appendChild(tuneTab);

    const paintTab = document.createElement('button');
    paintTab.id = 'garage-tab-paint';
    paintTab.textContent = 'PAINT';
    paintTab.style.cssText = 'flex:1;padding:8px;border:none;background:transparent;color:#aaa;cursor:pointer;font-size:0.75rem;font-weight:bold;';
    paintTab.onclick = () => { this._showTab('paint'); };
    tabBar.appendChild(paintTab);

    container.appendChild(tabBar);

    // Tab content area
    const tabContent = document.createElement('div');
    tabContent.id = 'garage-tab-content';
    tabContent.style.cssText = 'flex:1;overflow-y:auto;';
    container.appendChild(tabContent);

    this._tabTuning = this._buildTuningTab();
    this._tabPaint = this._buildPaintTab();
    tabContent.appendChild(this._tabTuning);
    tabContent.appendChild(this._tabPaint);
  }

  _showTab(tab) {
    const tuneTab = document.getElementById('garage-tab-tuning');
    const paintTab = document.getElementById('garage-tab-paint');
    if (tab === 'tuning') {
      this._tabTuning.style.display = 'flex';
      this._tabPaint.style.display = 'none';
      if (tuneTab) { tuneTab.style.background = 'rgba(52,152,219,0.3)'; tuneTab.style.color = '#fff'; }
      if (paintTab) { paintTab.style.background = 'transparent'; paintTab.style.color = '#aaa'; }
    } else {
      this._tabTuning.style.display = 'none';
      this._tabPaint.style.display = 'flex';
      if (tuneTab) { tuneTab.style.background = 'transparent'; tuneTab.style.color = '#aaa'; }
      if (paintTab) { paintTab.style.background = 'rgba(52,152,219,0.3)'; paintTab.style.color = '#fff'; }
    }
  }

  // ==================== Tuning Tab ====================

  _buildTuningTab() {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-top:8px;';

    const categories = ['engine', 'turbo', 'suspension', 'tires', 'brakes', 'nitroKit'];
    const names = ['ENGINE', 'TURBO', 'SUSPENSION', 'TIRES', 'BRAKES', 'NITRO KIT'];

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:4px;';

      const label = document.createElement('span');
      label.textContent = names[i];
      label.style.cssText = 'font-size:0.7rem;font-weight:bold;min-width:80px;';
      row.appendChild(label);

      const levelBar = document.createElement('div');
      levelBar.style.cssText = 'display:flex;gap:2px;';
      for (let l = 1; l <= 5; l++) {
        const dot = document.createElement('div');
        dot.dataset.level = String(l);
        dot.dataset.category = cat;
        dot.style.cssText = 'width:12px;height:12px;border-radius:2px;background:rgba(255,255,255,0.15);transition:background 0.2s;';
        levelBar.appendChild(dot);
      }
      row.appendChild(levelBar);

      const upgradeBtn = document.createElement('button');
      upgradeBtn.textContent = 'UP';
      upgradeBtn.style.cssText = 'padding:2px 8px;font-size:0.6rem;border:1px solid #2ecc71;background:transparent;color:#2ecc71;border-radius:3px;cursor:pointer;';
      upgradeBtn.onclick = () => {
        if (this.onTuneUpgrade && this._selectedCarId) {
          this.onTuneUpgrade(this._selectedCarId, cat);
        }
      };
      row.appendChild(upgradeBtn);

      div.appendChild(row);
    }

    return div;
  }

  // ==================== Paint Tab ====================

  _buildPaintTab() {
    const div = document.createElement('div');
    div.style.cssText = 'display:none;flex-direction:column;gap:8px;padding-top:8px;';

    // Color input
    const colorLabel = document.createElement('span');
    colorLabel.textContent = 'BODY COLOR';
    colorLabel.style.cssText = 'font-size:0.7rem;color:#888;';
    div.appendChild(colorLabel);

    const colorInput = document.createElement('input');
    colorInput.id = 'garage-color-input';
    colorInput.type = 'color';
    colorInput.value = '#e74c3c';
    colorInput.style.cssText = 'width:100%;height:35px;border:none;border-radius:4px;cursor:pointer;background:#333;';
    colorInput.oninput = () => {
      if (this.onPaintChange) {
        this.onPaintChange({ type: 'color', value: colorInput.value });
      }
    };
    div.appendChild(colorInput);

    // Metallic slider
    const metalLabel = document.createElement('span');
    metalLabel.textContent = 'METALLIC';
    metalLabel.style.cssText = 'font-size:0.7rem;color:#888;';
    div.appendChild(metalLabel);

    const metalSlider = document.createElement('input');
    metalSlider.id = 'garage-metallic-slider';
    metalSlider.type = 'range';
    metalSlider.min = '0';
    metalSlider.max = '1';
    metalSlider.step = '0.05';
    metalSlider.value = '0.6';
    metalSlider.style.cssText = 'width:100%;';
    metalSlider.oninput = () => {
      if (this.onPaintChange) {
        this.onPaintChange({ type: 'metallic', value: parseFloat(metalSlider.value) });
      }
    };
    div.appendChild(metalSlider);

    // Roughness slider
    const roughLabel = document.createElement('span');
    roughLabel.textContent = 'ROUGHNESS';
    roughLabel.style.cssText = 'font-size:0.7rem;color:#888;';
    div.appendChild(roughLabel);

    const roughSlider = document.createElement('input');
    roughSlider.id = 'garage-roughness-slider';
    roughSlider.type = 'range';
    roughSlider.min = '0';
    roughSlider.max = '1';
    roughSlider.step = '0.05';
    roughSlider.value = '0.3';
    roughSlider.style.cssText = 'width:100%;';
    roughSlider.oninput = () => {
      if (this.onPaintChange) {
        this.onPaintChange({ type: 'roughness', value: parseFloat(roughSlider.value) });
      }
    };
    div.appendChild(roughSlider);

    // Pearl toggle
    const pearlRow = document.createElement('div');
    pearlRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const pearlCheck = document.createElement('input');
    pearlCheck.id = 'garage-pearl-check';
    pearlCheck.type = 'checkbox';
    pearlCheck.onchange = () => {
      if (this.onPaintChange) {
        this.onPaintChange({ type: 'pearl', value: pearlCheck.checked });
      }
    };
    pearlRow.appendChild(pearlCheck);
    const pearlLabel = document.createElement('span');
    pearlLabel.textContent = 'PEARL EFFECT';
    pearlLabel.style.cssText = 'font-size:0.7rem;';
    pearlRow.appendChild(pearlLabel);
    div.appendChild(pearlRow);

    // Preset slots
    const presetLabel = document.createElement('span');
    presetLabel.textContent = 'PAINT PRESETS';
    presetLabel.style.cssText = 'font-size:0.7rem;color:#888;margin-top:8px;';
    div.appendChild(presetLabel);

    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:4px;';
    for (let s = 0; s < 5; s++) {
      const slotBtn = document.createElement('button');
      slotBtn.textContent = String(s + 1);
      slotBtn.style.cssText = 'flex:1;padding:6px;font-size:0.7rem;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#aaa;border-radius:4px;cursor:pointer;';
      slotBtn.onclick = (e) => {
        if (e.shiftKey) {
          // Shift+click = save
          if (this.onPaintSave) this.onPaintSave(s);
        } else {
          if (this.onPaintLoad) this.onPaintLoad(s);
        }
      };
      presetRow.appendChild(slotBtn);
    }
    const presetHint = document.createElement('span');
    presetHint.textContent = 'Click=load  Shift+click=save';
    presetHint.style.cssText = 'font-size:0.55rem;color:#555;text-align:center;';
    div.appendChild(presetRow);
    div.appendChild(presetHint);

    return div;
  }

  /**
   * Update paint UI controls from current paint state.
   */
  setPaintState(state) {
    const colorInput = document.getElementById('garage-color-input');
    if (colorInput) colorInput.value = state.color;
    const metalSlider = document.getElementById('garage-metallic-slider');
    if (metalSlider) metalSlider.value = state.metallic;
    const roughSlider = document.getElementById('garage-roughness-slider');
    if (roughSlider) roughSlider.value = state.roughness;
    const pearlCheck = document.getElementById('garage-pearl-check');
    if (pearlCheck) pearlCheck.checked = state.pearlEnabled;
  }

  // ==================== Render Details ====================

  _renderDetails() {
    const car = this._cars.find(c => c.id === this._selectedCarId);
    if (!car) return;

    const nameEl = document.getElementById('garage-car-name');
    if (nameEl) nameEl.textContent = car.name;

    const statsContainer = document.getElementById('garage-stats');
    if (!statsContainer) return;

    const tuneLevels = this._tuningLevels[this._selectedCarId] || { engine: 0, turbo: 0, suspension: 0, tires: 0, brakes: 0, nitroKit: 0 };

    // Compute display stats
    const base = car.baseStats;
    const stats = [
      { label: 'SPEED', value: Math.round(base.maxSpeed), max: 350, color: '#3498db' },
      { label: 'ACCEL', value: Math.round(base.engineForce / 20), max: 300, color: '#e74c3c' },
      { label: 'DRIFT', value: Math.round(base.driftCoefficient * 50), max: 100, color: '#f39c12' },
      { label: 'GRIP', value: Math.round(base.wheelFriction / 10), max: 150, color: '#2ecc71' },
    ];

    statsContainer.innerHTML = '';
    for (const stat of stats) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';

      const label = document.createElement('span');
      label.textContent = stat.label;
      label.style.cssText = `font-size:0.65rem;color:${stat.color};min-width:45px;font-weight:bold;`;
      row.appendChild(label);

      const barBg = document.createElement('div');
      barBg.style.cssText = 'flex:1;height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;';
      const barFill = document.createElement('div');
      barFill.style.cssText = `width:${Math.min(100, (stat.value / stat.max) * 100)}%;height:100%;background:${stat.color};border-radius:4px;`;
      barBg.appendChild(barFill);
      row.appendChild(barBg);

      const val = document.createElement('span');
      val.textContent = String(stat.value);
      val.style.cssText = 'font-size:0.7rem;min-width:35px;text-align:right;';
      row.appendChild(val);

      statsContainer.appendChild(row);
    }

    // Update tuning level dots
    for (const [cat, level] of Object.entries(tuneLevels)) {
      const dots = document.querySelectorAll(`[data-category="${cat}"]`);
      dots.forEach(d => {
        d.style.background = parseInt(d.dataset.level) <= level ? '#2ecc71' : 'rgba(255,255,255,0.15)';
      });
    }
  }

  // ==================== Update Loop ====================

  /**
   * Render the 3D preview. Call each frame when visible.
   */
  updatePreview(delta) {
    if (!this._visible || !this._previewRenderer || !this._previewScene) return;

    // Auto-rotate
    if (this._previewAutoRotate && !this._isDragging) {
      this._previewRotation += delta * 0.5;
    }

    // Apply rotation to preview car
    if (this._previewCar) {
      this._previewCar.rotation.y = this._previewRotation;
    }

    // Render
    this._previewRenderer.render(this._previewScene, this._previewCamera);
  }

  /**
   * Handle window resize.
   */
  resize() {
    this._resizePreview();
  }

  /**
   * Get selected car ID.
   */
  get selectedCarId() {
    return this._selectedCarId;
  }

  dispose() {
    if (this._previewRenderer) {
      this._previewRenderer.dispose();
      this._previewRenderer = null;
    }
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
  }
}
