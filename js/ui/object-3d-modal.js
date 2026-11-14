/**
 * NetMap — SketchUp-Style 3D Object Builder & Push/Pull Inspector Studio
 * Floating non-blocking panel to create, draw, extrude (Push/Pull), scale, rotate,
 * and mount devices onto procedural 3D objects (CCTV poles, custom server racks, towers, walls, etc.).
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { OBJECT3D_PRESETS } from '../map/map-3d-models.js';
import { clamp, generateId } from '../utils/helpers.js';

const PRESET_LIST = [
  { id: 'pole', label: 'Tiang CCTV', icon: 'flag' },
  { id: 'server-rack', label: 'Rak Server', icon: 'server' },
  { id: 'tower-lattice', label: 'Tower Antena', icon: 'radio-tower' },
  { id: 'box', label: 'Balok 3D', icon: 'box' },
  { id: 'cylinder', label: 'Silinder', icon: 'cylinder' },
  { id: 'wall', label: 'Dinding', icon: 'brick-wall' },
  { id: 'table', label: 'Meja NOC', icon: 'table-2' },
  { id: 'cabinet', label: 'Box Panel ODP', icon: 'archive' }
];

/**
 * Mount all currently selected devices onto a target 3D object with automatic Z elevation
 * @param {import('../devices/device-manager.js').DeviceManager} deviceManager
 * @param {Object} obj
 * @returns {Object[]} Updated devices
 */
export function mountDevicesOntoObject3d(deviceManager, obj) {
  if (!deviceManager || !obj) return [];
  const selected = deviceManager.getSelectedDevices?.() || [];
  if (selected.length === 0) return [];

  const elevBase = Number(obj.elevationMeters) || 0;
  const height = Math.max(0.15, Number(obj.heightMeters) || 2);
  const posX = clamp(Number(obj.x) || 0.5, 0, 1);
  const posY = clamp(Number(obj.y) || 0.5, 0, 1);
  const updated = [];

  selected.forEach((dev, idx) => {
    let targetElev;
    if (obj.shape === 'server-rack') {
      const maxShelf = elevBase + Math.max(0.2, height - 0.15);
      targetElev = Number(Math.min(maxShelf, elevBase + 0.35 + idx * 0.4).toFixed(2));
    } else {
      targetElev = Number((elevBase + height).toFixed(2));
    }

    const nextSpatial = {
      ...(dev.spatial3d || {}),
      elevationMeters: targetElev
    };
    const res = deviceManager.updateDevice(dev.id, {
      position: { x: posX, y: posY },
      spatial3d: nextSpatial
    });
    if (res) {
      deviceManager.updateDevicePosition(dev.id, { x: posX, y: posY }, { syncRenderer: true });
      updated.push(res);
    }
  });

  return updated;
}

export class Object3DModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   */
  constructor({ deviceManager, map3DEngine = null }) {
    this.deviceManager = deviceManager;
    this.map3DEngine = map3DEngine;
    this.panelEl = null;
    this.isVisible = false;
    this.activePresetId = 'pole';
    this.draft = {
      ...OBJECT3D_PRESETS.pole,
      x: 0.5,
      y: 0.5
    };

    this.createPanelDOM();
    this.bindEvents();
    this.syncFormFromSelectionOrDraft();
    this.renderObjectList();
  }

  createPanelDOM() {
    this.panelEl = document.createElement('aside');
    this.panelEl.id = 'object-3d-builder-panel';
    this.panelEl.style.cssText = `
      position: fixed;
      top: 72px;
      right: 20px;
      width: 350px;
      max-height: calc(100vh - 110px);
      z-index: 950;
      display: none;
      flex-direction: column;
      background-color: var(--bg-secondary, #fbe6c2);
      border: 1px solid var(--border-color, #e5cca0);
      border-radius: 12px;
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
      overflow: hidden;
      font-family: 'Poppins', sans-serif;
    `;

    this.panelEl.innerHTML = `
      <!-- Header -->
      <div style="height: 46px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 14px; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 26px; height: 26px; border-radius: 6px; background: rgba(42, 124, 19, 0.18); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13);">
            <i data-lucide="boxes" style="width: 15px; height: 15px;"></i>
          </div>
          <div>
            <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); line-height: 1.15;">Studio Objek 3D (SketchUp)</div>
            <div id="o3d-mode-badge" style="font-size: 10px; color: var(--text-muted); line-height: 1.1;">Buat &amp; Push/Pull Objek 3D</div>
          </div>
        </div>
        <button type="button" id="btn-o3d-close" class="btn btn-icon btn-sm" title="Tutup Panel">
          <i data-lucide="x" style="width: 16px; height: 16px;"></i>
        </button>
      </div>

      <!-- Scrollable Body -->
      <div style="padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; flex: 1;">

        <!-- Section 1: Draw Mode & 8 Preset Library -->
        <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <button type="button" id="btn-o3d-toggle-draw" class="btn btn-secondary btn-sm" style="width: 100%; justify-content: center; font-weight: 700; font-size: 11.5px;">
            ✏️ Mode Tarik / Taruh di Lantai 3D (Nonaktif)
          </button>

          <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.03em;">
            Pilih Bentuk / Preset 3D
          </div>
          <div id="o3d-preset-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
            ${PRESET_LIST.map((p) => `
              <button type="button" class="btn btn-secondary btn-sm o3d-preset-btn" data-preset="${p.id}"
                      style="justify-content: flex-start; gap: 6px; padding: 6px 8px; font-size: 11px; text-align: left;">
                <i data-lucide="${p.icon}" style="width: 13px; height: 13px; flex-shrink: 0;"></i>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.label}</span>
              </button>
            `).join('')}
          </div>

          <button type="button" id="btn-o3d-add-now" class="btn btn-primary btn-sm" style="width: 100%; font-weight: 700; font-size: 11.5px;">
            + Tambahkan ke Peta 3D Sekarang
          </button>
        </div>

        <!-- Section 2: Live Parametric Editor & Push/Pull Controls -->
        <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <span id="o3d-editor-title" style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">
              Parameter Draft Objek Baru
            </span>
            <button type="button" id="btn-o3d-deselect" class="btn btn-secondary btn-sm" style="display: none; font-size: 10px; padding: 2px 6px;">
              Buat Baru
            </button>
          </div>

          <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 6px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; font-weight: 600; color: var(--text-primary);">Nama Objek</label>
              <input type="text" id="o3d-name" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color); border-radius: 5px; padding: 4px 7px; font-size: 11.5px; color: var(--text-primary);">
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; font-weight: 600; color: var(--text-primary);">Bentuk</label>
              <select id="o3d-shape" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color); border-radius: 5px; padding: 4px 6px; font-size: 11px; color: var(--text-primary);">
                ${PRESET_LIST.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; font-weight: 600; color: var(--text-primary);">Posisi X (0-1)</label>
              <input type="number" id="o3d-x" step="0.005" min="0" max="1" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color); border-radius: 5px; padding: 4px 6px; font-size: 11px; font-family: var(--font-mono);">
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; font-weight: 600; color: var(--text-primary);">Posisi Y (0-1)</label>
              <input type="number" id="o3d-y" step="0.005" min="0" max="1" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color); border-radius: 5px; padding: 4px 6px; font-size: 11px; font-family: var(--font-mono);">
            </div>
          </div>

          <button type="button" id="btn-o3d-pick-device-pos" class="btn btn-secondary btn-sm" style="font-size: 10.5px;">
            📍 Ambil Posisi Perangkat Terpilih
          </button>

          <!-- Dimension Sliders -->
          ${this.renderSliderRow('o3d-width', 'Lebar X (m)', 0.2, 40, 0.1)}
          ${this.renderSliderRow('o3d-depth', 'Panjang Z (m)', 0.2, 40, 0.1)}
          ${this.renderSliderRow('o3d-height', 'Tinggi Push/Pull (m)', 0.2, 40, 0.1)}
          ${this.renderSliderRow('o3d-elev', 'Elevasi Dasar (m)', 0, 30, 0.1)}

          <!-- Rotation -->
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 600;">
              <span>Rotasi (°)</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <button type="button" id="btn-o3d-rot-45" class="btn btn-secondary btn-sm" style="font-size: 9.5px; padding: 1px 5px;">+45°</button>
                <button type="button" id="btn-o3d-rot-90" class="btn btn-secondary btn-sm" style="font-size: 9.5px; padding: 1px 5px;">+90°</button>
                <input type="number" id="o3d-rot-num" min="0" max="360" step="5" style="width: 52px; background: var(--bg-elevated, #fff); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; font-size: 10.5px; font-family: var(--font-mono);">
              </div>
            </div>
            <input type="range" id="o3d-rot-range" min="0" max="360" step="5" style="accent-color: var(--accent-blue, #2a7c13); width: 100%;">
          </div>

          <!-- Material & Options -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding-top: 4px; border-top: 1px dashed var(--border-color);">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; font-weight: 600;">Warna</label>
              <input type="color" id="o3d-color" style="width: 100%; height: 26px; border: 1px solid var(--border-color); border-radius: 4px;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; font-weight: 600;">Aksen/Tepi</label>
              <input type="color" id="o3d-accent" style="width: 100%; height: 26px; border: 1px solid var(--border-color); border-radius: 4px;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; font-weight: 600;">Opasitas (%)</label>
              <input type="number" id="o3d-opacity" min="10" max="100" step="5" style="height: 26px; background: var(--bg-elevated, #fff); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; font-size: 11px; font-family: var(--font-mono);">
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 10.5px;">
            <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="o3d-show-edges" checked style="accent-color: var(--accent-blue);">
              <span>Garis Tepi SketchUp</span>
            </label>
            <label id="o3d-has-arm-wrap" style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="o3d-has-arm" checked style="accent-color: var(--accent-blue);">
              <span>Lengan Tiang</span>
            </label>
            <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="o3d-show-label" checked style="accent-color: var(--accent-blue);">
              <span>Label 3D</span>
            </label>
          </div>
        </div>

        <!-- Section 3: Smart Mount Devices -->
        <div style="background: rgba(42, 124, 19, 0.1); border: 1px solid rgba(42, 124, 19, 0.3); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 10.5px; font-weight: 700; color: var(--accent-blue, #2a7c13);">
            Smart Mount Perangkat ke Objek 3D
          </div>
          <div style="font-size: 10.5px; color: var(--text-secondary); line-height: 1.35;">
            Otomatis memindahkan perangkat terpilih ke atas Tiang CCTV / ke dalam Rak Server Custom dengan elevasi Z yang pas.
          </div>
          <button type="button" id="btn-o3d-mount-devices" class="btn btn-primary btn-sm" style="width: 100%; font-weight: 700; font-size: 11px;">
            📌 Pasang Perangkat Terpilih di Objek Ini
          </button>
        </div>

        <!-- Section 4: Created Objects List -->
        <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Daftar Objek 3D di Peta</span>
            <span id="o3d-list-count" style="font-size: 10px; font-family: var(--font-mono); color: var(--accent-blue);">0 objek</span>
          </div>
          <div id="o3d-list-container" style="display: flex; flex-direction: column; gap: 5px; max-height: 180px; overflow-y: auto;"></div>
        </div>

      </div>
    `;

    document.body.appendChild(this.panelEl);
  }

  renderSliderRow(baseId, label, min, max, step) {
    return `
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 600;">
          <span>${label}</span>
          <input type="number" id="${baseId}-num" min="${min}" max="${max}" step="${step}"
                 style="width: 58px; background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 5px; font-size: 10.5px; font-family: var(--font-mono);">
        </div>
        <input type="range" id="${baseId}-range" min="${min}" max="${max}" step="${step}" style="accent-color: var(--accent-blue, #2a7c13); width: 100%;">
      </div>
    `;
  }

  bindEvents() {
    this.panelEl.querySelector('#btn-o3d-close')?.addEventListener('click', () => this.hide());

    this.panelEl.querySelector('#btn-o3d-deselect')?.addEventListener('click', () => {
      stateManager.deselectObject3d();
    });

    // Toggle Draw 3D Tool
    this.panelEl.querySelector('#btn-o3d-toggle-draw')?.addEventListener('click', () => {
      if (!this.map3DEngine) return;
      if (stateManager.getViewMode() !== '3d') {
        stateManager.setViewMode('3d');
      }
      const nextTool = this.map3DEngine.navTool === 'draw3d' ? 'orbit' : 'draw3d';
      if (nextTool === 'draw3d') {
        this.map3DEngine.activeDraw3dTemplate = { ...this.draft };
      }
      this.map3DEngine.setNavTool(nextTool);
    });

    // Preset Picker
    this.panelEl.querySelectorAll('.o3d-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetId = btn.getAttribute('data-preset');
        const preset = OBJECT3D_PRESETS[presetId];
        if (!preset) return;
        this.activePresetId = presetId;
        stateManager.deselectObject3d();
        this.draft = {
          ...preset,
          x: this.draft.x ?? 0.5,
          y: this.draft.y ?? 0.5
        };
        if (this.map3DEngine) {
          this.map3DEngine.activeDraw3dTemplate = { ...this.draft };
        }
        this.syncFormFromSelectionOrDraft();
        this.highlightActivePresetButton();
      });
    });

    // Add Now button
    this.panelEl.querySelector('#btn-o3d-add-now')?.addEventListener('click', () => {
      this.addObjectFromDraftNow();
    });

    // Pick selected device coordinates
    this.panelEl.querySelector('#btn-o3d-pick-device-pos')?.addEventListener('click', () => {
      const selDevId = this.deviceManager?.selectedDeviceId;
      const dev = selDevId ? this.deviceManager.getDeviceById(selDevId) : null;
      if (!dev?.position) {
        alert('Pilih salah satu perangkat di peta terlebih dahulu.');
        return;
      }
      this.panelEl.querySelector('#o3d-x').value = dev.position.x.toFixed(3);
      this.panelEl.querySelector('#o3d-y').value = dev.position.y.toFixed(3);
      this.commitFormPatch({ x: dev.position.x, y: dev.position.y });
    });

    // Smart Mount button
    this.panelEl.querySelector('#btn-o3d-mount-devices')?.addEventListener('click', () => {
      this.handleMountButtonClick();
    });

    // Bind parametric controls for live updates
    const textAndNumBindings = [
      ['#o3d-name', 'input', (el) => ({ name: el.value })],
      ['#o3d-shape', 'change', (el) => ({ shape: el.value })],
      ['#o3d-x', 'change', (el) => ({ x: clamp(parseFloat(el.value) || 0.5, 0, 1) })],
      ['#o3d-y', 'change', (el) => ({ y: clamp(parseFloat(el.value) || 0.5, 0, 1) })],
      ['#o3d-color', 'input', (el) => ({ color: el.value })],
      ['#o3d-accent', 'input', (el) => ({ accentColor: el.value })],
      ['#o3d-opacity', 'input', (el) => ({ opacity: clamp((parseFloat(el.value) || 100) / 100, 0.05, 1) })],
      ['#o3d-show-edges', 'change', (el) => ({ showEdges: Boolean(el.checked) })],
      ['#o3d-has-arm', 'change', (el) => ({ hasArm: Boolean(el.checked) })],
      ['#o3d-show-label', 'change', (el) => ({ showLabel: Boolean(el.checked) })]
    ];

    textAndNumBindings.forEach(([sel, evtName, extract]) => {
      this.panelEl.querySelector(sel)?.addEventListener(evtName, (e) => {
        const patch = extract(e.target);
        if (sel === '#o3d-shape') {
          this.toggleArmCheckboxVisibility(patch.shape);
        }
        this.commitFormPatch(patch);
      });
    });

    const sliderConfigs = [
      ['o3d-width', 'widthMeters', 0.15, 120],
      ['o3d-depth', 'depthMeters', 0.15, 120],
      ['o3d-height', 'heightMeters', 0.15, 80],
      ['o3d-elev', 'elevationMeters', 0, 50],
      ['o3d-rot', 'rotationY', 0, 360]
    ];

    sliderConfigs.forEach(([baseId, field, min, max]) => {
      const rangeEl = this.panelEl.querySelector(`#${baseId}-range`);
      const numEl = this.panelEl.querySelector(`#${baseId}-num`);
      rangeEl?.addEventListener('input', (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, min, max);
        if (numEl) numEl.value = v;
        this.commitFormPatch({ [field]: v });
      });
      numEl?.addEventListener('change', (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, min, max);
        e.target.value = v;
        if (rangeEl) rangeEl.value = v;
        this.commitFormPatch({ [field]: v });
      });
    });

    const rotateBy = (deg) => {
      const numEl = this.panelEl.querySelector('#o3d-rot-num');
      const rangeEl = this.panelEl.querySelector('#o3d-rot-range');
      const cur = parseFloat(numEl?.value || '0') || 0;
      const next = (cur + deg) % 360;
      if (numEl) numEl.value = next;
      if (rangeEl) rangeEl.value = next;
      this.commitFormPatch({ rotationY: next });
    };
    this.panelEl.querySelector('#btn-o3d-rot-45')?.addEventListener('click', () => rotateBy(45));
    this.panelEl.querySelector('#btn-o3d-rot-90')?.addEventListener('click', () => rotateBy(90));

    // Global state synchronization
    eventBus.on('object3d:selected', () => {
      this.syncFormFromSelectionOrDraft();
      this.renderObjectList();
    });
    eventBus.on('object3d:deselected', () => {
      this.syncFormFromSelectionOrDraft();
      this.renderObjectList();
    });
    eventBus.on('object3d:changed', () => {
      if (!this.map3DEngine?.object3dDragState) {
        this.syncFormFromSelectionOrDraft();
      }
      this.renderObjectList();
    });
    eventBus.on('map3d:navtool-changed', ({ tool }) => {
      this.updateDrawToggleState(tool === 'draw3d');
    });
    eventBus.on('device:selected', () => this.updateMountButtonLabel());
    eventBus.on('device:selection-changed', () => this.updateMountButtonLabel());
    eventBus.on('device:deselected', () => this.updateMountButtonLabel());
  }

  commitFormPatch(patch) {
    const selId = stateManager.getSelectedObject3dId();
    if (selId) {
      stateManager.updateObject3d(selId, patch);
    } else {
      Object.assign(this.draft, patch);
      if (this.map3DEngine) {
        this.map3DEngine.activeDraw3dTemplate = { ...this.draft };
      }
    }
  }

  addObjectFromDraftNow() {
    if (stateManager.getViewMode() !== '3d') {
      stateManager.setViewMode('3d');
    }

    const selDevId = this.deviceManager?.selectedDeviceId;
    const selDev = selDevId ? this.deviceManager.getDeviceById(selDevId) : null;
    const x = selDev?.position?.x ?? clamp(parseFloat(this.panelEl.querySelector('#o3d-x')?.value) || 0.5, 0, 1);
    const y = selDev?.position?.y ?? clamp(parseFloat(this.panelEl.querySelector('#o3d-y')?.value) || 0.5, 0, 1);

    const count = stateManager.getObjects3d().length + 1;
    const shape = this.panelEl.querySelector('#o3d-shape')?.value || this.draft.shape || 'pole';
    const presetDefaults = OBJECT3D_PRESETS[shape] || OBJECT3D_PRESETS.box;
    const rawName = (this.panelEl.querySelector('#o3d-name')?.value || '').trim();

    const newObj = {
      ...presetDefaults,
      ...this.draft,
      id: generateId('obj3d'),
      name: rawName || `${presetDefaults.name} #${count}`,
      shape,
      x,
      y
    };

    stateManager.addObject3d(newObj);
    if (this.map3DEngine?.isActive) {
      this.focusCameraOnObject(newObj);
    }
    this.syncFormFromSelectionOrDraft();
    this.renderObjectList();
  }

  handleMountButtonClick() {
    const selectedDevices = this.deviceManager?.getSelectedDevices?.() || [];
    if (selectedDevices.length === 0) {
      alert('Pilih satu atau lebih perangkat (CCTV, AP, Switch, Server) di peta terlebih dahulu.');
      return;
    }
    const selObjId = stateManager.getSelectedObject3dId();
    const obj = selObjId ? stateManager.getObject3dById(selObjId) : null;
    if (!obj) {
      alert('Pilih objek 3D tujuan terlebih dahulu (klik objek di peta 3D atau dari Daftar Objek 3D).');
      return;
    }

    const updated = mountDevicesOntoObject3d(this.deviceManager, obj);
    if (updated.length > 0) {
      if (this.map3DEngine?.isActive) {
        this.map3DEngine.syncAll();
        this.map3DEngine.showStatusHint(
          `📌 ${updated.length} perangkat dipasang pada "${obj.name}".`
        );
      }
    }
  }

  focusCameraOnObject(obj) {
    if (!this.map3DEngine?.isActive || !obj) return;
    const world = this.map3DEngine.normToWorld(obj.x ?? 0.5, obj.y ?? 0.5);
    const centerY = (Number(obj.elevationMeters) || 0) + (Number(obj.heightMeters) || 2) * 0.55;
    const target = { x: world.x, y: centerY, z: world.z };
    const span = Math.max(8, (Number(obj.heightMeters) || 3) * 2.5, (Number(obj.widthMeters) || 2) * 2.5);
    if (typeof this.map3DEngine.animateCameraTo === 'function' && this.map3DEngine.camera?.position) {
      const targetVec = this.map3DEngine.controls.target.clone().set(target.x, target.y, target.z);
      const endPos = targetVec.clone().add({ x: span * 0.75, y: span * 0.55, z: span * 0.85 });
      this.map3DEngine.animateCameraTo(endPos, targetVec, 380);
    }
  }

  syncFormFromSelectionOrDraft() {
    if (!this.panelEl) return;
    const selId = stateManager.getSelectedObject3dId();
    const obj = selId ? stateManager.getObject3dById(selId) : null;
    const src = obj || this.draft;

    const editorTitle = this.panelEl.querySelector('#o3d-editor-title');
    const deselectBtn = this.panelEl.querySelector('#btn-o3d-deselect');
    if (obj) {
      if (editorTitle) editorTitle.textContent = `Mengedit: ${obj.name || 'Objek 3D'}`;
      if (deselectBtn) deselectBtn.style.display = 'inline-flex';
    } else {
      if (editorTitle) editorTitle.textContent = 'Parameter Draft Objek Baru';
      if (deselectBtn) deselectBtn.style.display = 'none';
    }

    const setVal = (sel, val) => {
      const el = this.panelEl.querySelector(sel);
      if (el && document.activeElement !== el) el.value = val;
    };

    setVal('#o3d-name', src.name || '');
    setVal('#o3d-shape', src.shape || 'box');
    setVal('#o3d-x', (src.x ?? 0.5).toFixed(3));
    setVal('#o3d-y', (src.y ?? 0.5).toFixed(3));
    setVal('#o3d-width-num', src.widthMeters ?? 1);
    setVal('#o3d-width-range', Math.min(40, src.widthMeters ?? 1));
    setVal('#o3d-depth-num', src.depthMeters ?? 1);
    setVal('#o3d-depth-range', Math.min(40, src.depthMeters ?? 1));
    setVal('#o3d-height-num', src.heightMeters ?? 2);
    setVal('#o3d-height-range', Math.min(40, src.heightMeters ?? 2));
    setVal('#o3d-elev-num', src.elevationMeters ?? 0);
    setVal('#o3d-elev-range', Math.min(30, src.elevationMeters ?? 0));
    setVal('#o3d-rot-num', src.rotationY ?? 0);
    setVal('#o3d-rot-range', src.rotationY ?? 0);
    setVal('#o3d-color', src.color || '#64748b');
    setVal('#o3d-accent', src.accentColor || '#2a7c13');
    setVal('#o3d-opacity', Math.round((src.opacity ?? 1) * 100));

    const edgesCb = this.panelEl.querySelector('#o3d-show-edges');
    if (edgesCb) edgesCb.checked = src.showEdges !== false;
    const armCb = this.panelEl.querySelector('#o3d-has-arm');
    if (armCb) armCb.checked = src.hasArm !== false;
    const labelCb = this.panelEl.querySelector('#o3d-show-label');
    if (labelCb) labelCb.checked = Boolean(src.showLabel);

    this.toggleArmCheckboxVisibility(src.shape || 'box');
    this.highlightActivePresetButton();
    this.updateMountButtonLabel();
  }

  toggleArmCheckboxVisibility(shape) {
    const wrap = this.panelEl?.querySelector('#o3d-has-arm-wrap');
    if (wrap) {
      wrap.style.display = shape === 'pole' ? 'inline-flex' : 'none';
    }
  }

  highlightActivePresetButton() {
    const selId = stateManager.getSelectedObject3dId();
    this.panelEl?.querySelectorAll('.o3d-preset-btn').forEach((btn) => {
      const pId = btn.getAttribute('data-preset');
      const active = !selId && pId === this.activePresetId;
      btn.style.borderColor = active ? 'var(--accent-blue, #2a7c13)' : 'var(--border-color)';
      btn.style.backgroundColor = active ? 'rgba(42, 124, 19, 0.14)' : '';
    });
  }

  updateDrawToggleState(isDrawActive) {
    const btn = this.panelEl?.querySelector('#btn-o3d-toggle-draw');
    const badge = this.panelEl?.querySelector('#o3d-mode-badge');
    if (btn) {
      btn.classList.toggle('btn-primary', isDrawActive);
      btn.classList.toggle('btn-secondary', !isDrawActive);
      btn.textContent = isDrawActive
        ? '✏️ Mode Gambar 3D AKTIF (Klik/Drag di Lantai)'
        : '✏️ Mode Tarik / Taruh di Lantai 3D (Nonaktif)';
    }
    if (badge) {
      badge.textContent = isDrawActive
        ? 'Klik lantai 3D untuk taruh objek'
        : 'Tarik panah biru di 3D untuk Push/Pull tinggi';
    }
  }

  updateMountButtonLabel() {
    const btn = this.panelEl?.querySelector('#btn-o3d-mount-devices');
    if (!btn) return;
    const count = this.deviceManager?.getSelectedDeviceIds?.().length || 0;
    const selObj = stateManager.getObject3dById(stateManager.getSelectedObject3dId());
    if (count > 0 && selObj) {
      btn.textContent = `📌 Pasang ${count} Perangkat ke "${selObj.name}"`;
    } else if (count > 0) {
      btn.textContent = `📌 Pasang ${count} Perangkat ke Objek 3D`;
    } else {
      btn.textContent = '📌 Pasang Perangkat Terpilih di Objek Ini';
    }
  }

  renderObjectList() {
    const container = this.panelEl?.querySelector('#o3d-list-container');
    const countBadge = this.panelEl?.querySelector('#o3d-list-count');
    if (!container) return;

    const list = stateManager.getObjects3d();
    const selId = stateManager.getSelectedObject3dId();
    if (countBadge) countBadge.textContent = `${list.length} objek`;

    if (list.length === 0) {
      container.innerHTML = `
        <div style="padding: 12px; text-align: center; font-size: 11px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 6px;">
          Belum ada objek 3D custom. Pilih preset di atas lalu klik di lantai 3D atau tekan <strong>+ Tambahkan ke Peta 3D Sekarang</strong>.
        </div>
      `;
      return;
    }

    container.innerHTML = list.map((o) => {
      const isSel = o.id === selId;
      const dim = `${Number(o.widthMeters || 1).toFixed(1)}×${Number(o.depthMeters || 1).toFixed(1)}×${Number(o.heightMeters || 2).toFixed(1)}m`;
      return `
        <div class="o3d-list-item" data-id="${o.id}"
             style="background: ${isSel ? 'rgba(42, 124, 19, 0.14)' : 'var(--bg-secondary, #fbe6c2)'}; border: 1px solid ${isSel ? 'var(--accent-blue, #2a7c13)' : 'var(--border-color)'}; border-radius: 6px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px; cursor: pointer;">
          <div style="min-width: 0;">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${this.escapeHtml(o.name || 'Objek 3D')}
            </div>
            <div style="font-size: 9.5px; color: var(--text-muted); font-family: var(--font-mono);">
              ${this.escapeHtml(o.shape || 'box')} • ${dim} • Z:${Number(o.elevationMeters || 0).toFixed(1)}m
            </div>
          </div>
          <div style="display: flex; gap: 3px; flex-shrink: 0;">
            <button type="button" class="btn btn-secondary btn-sm btn-o3d-dup" data-id="${o.id}" title="Duplikat" style="font-size: 10px; padding: 2px 5px;">Dup</button>
            <button type="button" class="btn btn-sm btn-o3d-del" data-id="${o.id}" title="Hapus" style="font-size: 10px; padding: 2px 5px; background: rgba(239,68,68,0.14); color: #dc2626;">Hapus</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.o3d-list-item').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-o3d-dup') || e.target.closest('.btn-o3d-del')) return;
        const id = row.getAttribute('data-id');
        const obj = stateManager.getObject3dById(id);
        if (!obj) return;
        this.deviceManager?.deselectDevice();
        stateManager.selectObject3d(id);
        if (this.map3DEngine?.isActive) {
          this.focusCameraOnObject(obj);
        }
      });
    });

    container.querySelectorAll('.btn-o3d-dup').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const src = stateManager.getObject3dById(btn.getAttribute('data-id'));
        if (!src) return;
        const clone = {
          ...JSON.parse(JSON.stringify(src)),
          id: generateId('obj3d'),
          name: `${src.name} (Copy)`,
          x: clamp((src.x ?? 0.5) + 0.015, 0, 1),
          y: clamp((src.y ?? 0.5) + 0.015, 0, 1)
        };
        stateManager.addObject3d(clone);
      });
    });

    container.querySelectorAll('.btn-o3d-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        stateManager.deleteObject3d(id);
      });
    });
  }

  show() {
    this.isVisible = true;
    this.panelEl.style.display = 'flex';
    this.updateDrawToggleState(this.map3DEngine?.navTool === 'draw3d');
    this.syncFormFromSelectionOrDraft();
    this.renderObjectList();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.panelEl });
    }
  }

  hide() {
    this.isVisible = false;
    this.panelEl.style.display = 'none';
  }

  toggle() {
    if (this.isVisible) this.hide();
    else this.show();
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
