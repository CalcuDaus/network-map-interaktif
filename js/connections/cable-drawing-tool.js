/**
 * NetMap — Interactive Cable Drawing Tool
 * State machine for: Click Source -> Add Waypoints -> Click Destination
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { coordinateSystem } from '../map/coordinate-system.js';

export class CableDrawingTool {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('./cable-manager.js').CableManager} options.cableManager
   * @param {Konva.Stage} options.stage
   * @param {Konva.Layer} options.interactionLayer
   * @param {number} options.naturalWidth
   * @param {number} options.naturalHeight
   */
  constructor({
    deviceManager,
    cableManager,
    stage,
    interactionLayer,
    naturalWidth = 1024,
    naturalHeight = 1024
  }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.stage = stage;
    this.interactionLayer = interactionLayer;
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;

    this.state = 'IDLE'; // IDLE | AWAITING_SOURCE | DRAWING_WAYPOINTS
    this.sourceDeviceId = null;
    this.waypoints = []; // [{x, y}] normalized
    this.selectedCategory = 'cat6'; // Default
    this.pathStyle = 'curve'; // 'curve' (Pen Tool Bezier) | 'straight' (Corner) | 'orthogonal' (90° Tray)
    this.curveTension = 0.38;
    this.isShiftPressed = false;

    this.previewLine = null;
    this.guideDots = [];
    this.penHudEl = null;

    this.createPenToolHud();
    this.initEventListeners();
  }

  createPenToolHud() {
    if (typeof document === 'undefined') return;
    const viewport = document.getElementById('map-viewport');
    if (!viewport) return;

    this.penHudEl = document.createElement('div');
    this.penHudEl.id = 'pen-tool-hud';
    this.penHudEl.style.cssText = `
      display: none;
      position: absolute;
      bottom: 54px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 62;
      background: var(--bg-secondary, #fbe6c2);
      border: 1px solid var(--border-color, #e5cca0);
      border-radius: 999px;
      padding: 6px 14px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11.5px;
      color: var(--text-primary);
    `;

    this.penHudEl.innerHTML = `
      <span style="font-weight: 700; color: var(--accent-blue, #2a7c13); display: inline-flex; align-items: center; gap: 4px;">
        ✒️ Pen Tool Kabel:
      </span>
      <select id="pen-hud-path-style" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 7px; font-size: 11px; color: var(--text-primary); font-weight: 600;">
        <option value="curve" selected>Kurva Bezier Halus (Pen Tool)</option>
        <option value="straight">Sudut Tegas (Polyline)</option>
        <option value="orthogonal">Orthogonal 90° (Jalur Tray)</option>
      </select>
      <select id="pen-hud-category" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 3px 7px; font-size: 11px; color: var(--text-primary);">
        <option value="cat6" selected>UTP Cat6</option>
        <option value="cat6a">UTP Cat6A (10G)</option>
        <option value="fiber-sm">Fiber Single-Mode</option>
        <option value="fiber-mm">Fiber Multi-Mode</option>
        <option value="coaxial">Coaxial RG6</option>
        <option value="wireless-ptp">Wireless PtP</option>
      </select>
      <button type="button" id="btn-pen-hud-undo" class="btn btn-secondary btn-sm" style="font-size: 10.5px; padding: 3px 8px;" title="Hapus titik belok terakhir (Backspace)">
        ↩ Undo Titik
      </button>
      <button type="button" id="btn-pen-hud-cancel" class="btn btn-secondary btn-sm" style="font-size: 10.5px; padding: 3px 8px;" title="Batalkan tarikan kabel (Esc)">
        ✖ Batal
      </button>
      <span style="font-size: 10px; color: var(--text-muted);">
        Klik Kanvas: Titik Anchor • <strong>Shift</strong>: Kunci 45°/90° • <strong>Backspace</strong>: Hapus Titik
      </span>
    `;

    viewport.appendChild(this.penHudEl);

    this.penHudEl.querySelector('#pen-hud-path-style')?.addEventListener('change', (e) => {
      this.pathStyle = e.target.value || 'curve';
      eventBus.emit('pen-tool:options-changed', { pathStyle: this.pathStyle, category: this.selectedCategory });
      this.updateRubberBand();
    });

    this.penHudEl.querySelector('#pen-hud-category')?.addEventListener('change', (e) => {
      this.selectedCategory = e.target.value || 'cat6';
      eventBus.emit('pen-tool:options-changed', { pathStyle: this.pathStyle, category: this.selectedCategory });
    });

    this.penHudEl.querySelector('#btn-pen-hud-undo')?.addEventListener('click', () => {
      if (stateManager.getViewMode() === '3d') {
        eventBus.emit('pen-tool:undo-3d-point');
      } else {
        this.undoLastWaypoint();
      }
    });

    this.penHudEl.querySelector('#btn-pen-hud-cancel')?.addEventListener('click', () => {
      this.cancelDrawing();
      stateManager.setMode('navigate');
    });
  }

  snapPointIfShift(normPt) {
    if (!this.isShiftPressed || !this.sourceDeviceId) return normPt;
    const srcDev = this.deviceManager.getDeviceById(this.sourceDeviceId);
    const prev = this.waypoints.length > 0 ? this.waypoints[this.waypoints.length - 1] : srcDev?.position;
    if (!prev) return normPt;

    const dx = normPt.x - prev.x;
    const dy = normPt.y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return normPt;

    // Snap angle to nearest multiple of 45 degrees (pi / 4) like Photoshop Pen Tool Shift-constraint
    const angle = Math.atan2(dy, dx);
    const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
      x: Math.max(0.01, Math.min(0.99, prev.x + Math.cos(snappedAngle) * dist)),
      y: Math.max(0.01, Math.min(0.99, prev.y + Math.sin(snappedAngle) * dist))
    };
  }

  initEventListeners() {
    // Mode changes
    eventBus.on('mode:changed', ({ mode }) => {
      if (mode === 'draw-cable') {
        this.startDrawing();
      } else {
        this.cancelDrawing();
      }
    });

    // When a device is clicked
    eventBus.on('device:selected', (device) => {
      if (stateManager.getMode() !== 'draw-cable') return;

      if (this.state === 'AWAITING_SOURCE') {
        this.handleSourceSelected(device.id);
      } else if (this.state === 'DRAWING_WAYPOINTS') {
        this.handleDestinationSelected(device.id);
      }
    });

    // When empty stage is clicked in draw mode -> add waypoint
    eventBus.on('canvas:place-device', (coords) => {
      // In draw-cable mode, this event represents a canvas click
      if (stateManager.getMode() === 'draw-cable' && this.state === 'DRAWING_WAYPOINTS') {
        this.addWaypoint({ x: coords.normalizedX, y: coords.normalizedY });
      }
    });

    // Mouse movement on stage for rubber-band preview line
    this.stage.on('mousemove', () => {
      if (stateManager.getMode() === 'draw-cable' && this.state === 'DRAWING_WAYPOINTS') {
        this.updateRubberBand();
      }
    });

    // Keyboard ESC to cancel, Backspace to undo last Pen Tool anchor, Shift for 45°/90° snap
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') {
        this.isShiftPressed = true;
        if (stateManager.getMode() === 'draw-cable' && this.state === 'DRAWING_WAYPOINTS') {
          this.updateRubberBand();
        }
      }
      if (stateManager.getMode() !== 'draw-cable') return;
      if (e.key === 'Escape') {
        this.cancelDrawing();
        stateManager.setMode('navigate');
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (stateManager.getViewMode() === '3d') {
          eventBus.emit('pen-tool:undo-3d-point');
        } else if (this.state === 'DRAWING_WAYPOINTS' && this.waypoints.length > 0) {
          e.preventDefault();
          this.undoLastWaypoint();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        this.isShiftPressed = false;
        if (stateManager.getMode() === 'draw-cable' && this.state === 'DRAWING_WAYPOINTS') {
          this.updateRubberBand();
        }
      }
    });
  }

  startDrawing() {
    this.cancelDrawing();
    this.state = 'AWAITING_SOURCE';
    this.sourceDeviceId = null;
    this.waypoints = [];
    if (this.penHudEl) this.penHudEl.style.display = 'inline-flex';

    this.showToast('Pen Tool Kabel: Klik perangkat SUMBER (titik awal)');
  }

  undoLastWaypoint() {
    if (this.waypoints.length === 0) return;
    this.waypoints.pop();
    const lastDot = this.guideDots.pop();
    if (lastDot) lastDot.destroy();
    this.updateRubberBand();
    this.showToast(`Titik anchor dihapus (${this.waypoints.length} titik tersisa).`);
  }

  handleSourceSelected(deviceId) {
    this.sourceDeviceId = deviceId;
    this.state = 'DRAWING_WAYPOINTS';
    this.waypoints = [];

    const srcDev = this.deviceManager.getDeviceById(deviceId);
    this.showToast(`Sumber: "${srcDev.name}". Klik denah untuk tambah belokan, atau klik perangkat TUJUAN.`);

    // Initialize rubber-band line
    this.previewLine = new Konva.Line({
      name: 'cable-preview-line',
      points: [],
      stroke: '#2a7c13',
      strokeWidth: 3,
      dash: [6, 4],
      lineCap: 'round',
      lineJoin: 'round',
      listening: false
    });
    this.interactionLayer.add(this.previewLine);
    this.updateRubberBand();
  }

  addWaypoint(normalizedPoint) {
    const pt = this.snapPointIfShift(normalizedPoint);
    this.waypoints.push(pt);

    // Render Pen Tool anchor square/circle handle
    const dot = new Konva.Circle({
      name: 'guide-dot',
      x: pt.x * this.naturalWidth,
      y: pt.y * this.naturalHeight,
      radius: 5,
      fill: '#ffffff',
      stroke: '#0284c7',
      strokeWidth: 2,
      listening: false
    });

    this.interactionLayer.add(dot);
    this.guideDots.push(dot);
    this.updateRubberBand();
  }

  updateRubberBand() {
    if (!this.previewLine || !this.sourceDeviceId) return;

    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    const srcDev = this.deviceManager.getDeviceById(this.sourceDeviceId);
    if (!srcDev) return;

    const stagePointer = coordinateSystem.screenToStage(pointer, this.stage);
    const normCursor = this.snapPointIfShift({
      x: stagePointer.x / this.naturalWidth,
      y: stagePointer.y / this.naturalHeight
    });

    const rawNodes = [
      { x: srcDev.position.x * this.naturalWidth, y: srcDev.position.y * this.naturalHeight },
      ...this.waypoints.map((wp) => ({ x: wp.x * this.naturalWidth, y: wp.y * this.naturalHeight })),
      { x: normCursor.x * this.naturalWidth, y: normCursor.y * this.naturalHeight }
    ];

    const points = [];
    if (this.pathStyle === 'orthogonal') {
      for (let i = 0; i < rawNodes.length; i++) {
        const cur = rawNodes[i];
        points.push(cur.x, cur.y);
        if (i < rawNodes.length - 1) {
          const nxt = rawNodes[i + 1];
          if (Math.abs(nxt.x - cur.x) > 2 && Math.abs(nxt.y - cur.y) > 2) {
            points.push(nxt.x, cur.y);
          }
        }
      }
    } else {
      rawNodes.forEach((p) => points.push(p.x, p.y));
    }

    this.previewLine.points(points);
    this.previewLine.tension(this.pathStyle === 'curve' && this.waypoints.length > 0 ? this.curveTension : 0);
    this.interactionLayer.batchDraw();
  }

  handleDestinationSelected(destDeviceId) {
    if (destDeviceId === this.sourceDeviceId) {
      alert('Perangkat tujuan tidak boleh sama dengan perangkat sumber!');
      return;
    }

    const srcDev = this.deviceManager.getDeviceById(this.sourceDeviceId);
    const destDev = this.deviceManager.getDeviceById(destDeviceId);

    // Create the connection with Pen Tool pathStyle & curveTension
    const newCable = this.cableManager.addConnection({
      name: `Link ${srcDev.name} ➔ ${destDev.name}`,
      source: this.sourceDeviceId,
      destination: destDeviceId,
      cableCategory: this.selectedCategory,
      route: [...this.waypoints],
      status: 'active',
      details: {
        pathStyle: this.pathStyle,
        curveTension: this.curveTension
      }
    });

    this.showToast(`Koneksi berhasil dibuat: "${newCable.name}"`);

    this.cancelDrawing();
    stateManager.setMode('select');

    if (newCable) {
      this.cableManager.selectConnection(newCable.id);
      eventBus.emit('cable:prompt-port-picker', { cableId: newCable.id });
    }
  }

  cancelDrawing() {
    this.state = 'IDLE';
    this.sourceDeviceId = null;
    this.waypoints = [];
    if (this.penHudEl && stateManager.getMode() !== 'draw-cable') {
      this.penHudEl.style.display = 'none';
    }

    if (this.previewLine) {
      this.previewLine.destroy();
      this.previewLine = null;
    }

    this.guideDots.forEach((d) => d.destroy());
    this.guideDots = [];

    this.interactionLayer.batchDraw();
  }

  showToast(message) {
    console.info(`[CableDrawingTool] ${message}`);
    const statusHint = document.querySelector('#app-status-bar .status-item:last-child');
    if (statusHint) {
      statusHint.innerHTML = `<span style="color: var(--accent-blue); font-weight: 600;">${message}</span>`;
    }
  }
}

