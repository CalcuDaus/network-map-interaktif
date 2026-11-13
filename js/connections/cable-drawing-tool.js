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

    this.previewLine = null;
    this.guideDots = [];

    this.initEventListeners();
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

    // Keyboard ESC to cancel
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && stateManager.getMode() === 'draw-cable') {
        this.cancelDrawing();
        stateManager.setMode('navigate');
      }
    });
  }

  startDrawing() {
    this.cancelDrawing();
    this.state = 'AWAITING_SOURCE';
    this.sourceDeviceId = null;
    this.waypoints = [];

    this.showToast('Langkah 1: Klik perangkat SUMBER (titik awal kabel)');
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
    this.waypoints.push(normalizedPoint);

    // Render guide dot
    const dot = new Konva.Circle({
      name: 'guide-dot',
      x: normalizedPoint.x * this.naturalWidth,
      y: normalizedPoint.y * this.naturalHeight,
      radius: 4,
      fill: '#76c457',
      stroke: '#18350d',
      strokeWidth: 1.5,
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

    const points = [
      srcDev.position.x * this.naturalWidth,
      srcDev.position.y * this.naturalHeight
    ];

    this.waypoints.forEach((wp) => {
      points.push(wp.x * this.naturalWidth, wp.y * this.naturalHeight);
    });

    points.push(stagePointer.x, stagePointer.y);

    this.previewLine.points(points);
    this.interactionLayer.batchDraw();
  }

  handleDestinationSelected(destDeviceId) {
    if (destDeviceId === this.sourceDeviceId) {
      alert('Perangkat tujuan tidak boleh sama dengan perangkat sumber!');
      return;
    }

    const srcDev = this.deviceManager.getDeviceById(this.sourceDeviceId);
    const destDev = this.deviceManager.getDeviceById(destDeviceId);

    // Create the connection
    const newCable = this.cableManager.addConnection({
      name: `Link ${srcDev.name} ➔ ${destDev.name}`,
      source: this.sourceDeviceId,
      destination: destDeviceId,
      cableCategory: this.selectedCategory,
      route: [...this.waypoints],
      status: 'active'
    });

    this.showToast(`Koneksi berhasil dibuat: "${newCable.name}"`);

    this.cancelDrawing();
    stateManager.setMode('select');

    if (newCable) {
      this.cableManager.selectConnection(newCable.id);
    }
  }

  cancelDrawing() {
    this.state = 'IDLE';
    this.sourceDeviceId = null;
    this.waypoints = [];

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

