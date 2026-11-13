/**
 * NetMap — Cable Connection Manager (CRUD & Dynamic Routing Controller)
 * Orchestrates connection lifecycle, dynamic endpoint anchoring, and automatic length calculation
 */

import { eventBus } from '../core/event-bus.js';
import { CableSchema } from './cable-schema.js';
import { CableRenderer } from './cable-renderer.js';
import { calculateAccurateCableLength, calculateNetworkPerformanceMetrics } from './cable-library.js';

export class CableManager {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {Konva.Layer} options.connectionLayer
   * @param {Konva.Layer} options.interactionLayer
   * @param {number} options.naturalWidth
   * @param {number} options.naturalHeight
   */
  constructor({
    deviceManager,
    connectionLayer,
    interactionLayer,
    naturalWidth = 1024,
    naturalHeight = 1024
  }) {
    this.deviceManager = deviceManager;
    this.connectionLayer = connectionLayer;
    this.interactionLayer = interactionLayer;
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;

    this.connections = new Map(); // id -> cable
    this.selectedCableId = null;

    // Scale calibration: load saved map width in meters or default to 400m
    let savedScale = 400;
    try {
      const stored = localStorage.getItem('netmap_scale_width_meters');
      if (stored && !isNaN(parseFloat(stored))) {
        savedScale = parseFloat(stored);
      }
    } catch (e) {}
    this.mapWidthMeters = savedScale;
    this.metersPerPixel = this.mapWidthMeters / this.naturalWidth;

    // Initialize renderer
    this.renderer = new CableRenderer({
      connectionLayer: this.connectionLayer,
      interactionLayer: this.interactionLayer,
      naturalWidth: this.naturalWidth,
      naturalHeight: this.naturalHeight,
      onSelect: (id) => this.selectConnection(id),
      onContextMenu: (cable, clientX, clientY) => {
        eventBus.emit('contextmenu:cable', { cable, screenX: clientX, screenY: clientY });
      },
      onWaypointMoved: (id, idx, norm) => this.updateWaypoint(id, idx, norm),
      onWaypointDeleted: (id, idx) => this.deleteWaypoint(id, idx)
    });

    this.initDeviceSyncListeners();
  }

  /**
   * Listen to device events for dynamic endpoint binding and cascade deletion
   */
  initDeviceSyncListeners() {
    // When a device marker moves, automatically re-anchor and redraw connected cables
    eventBus.on('device:moved', ({ deviceId }) => {
      this.refreshCablesForDevice(deviceId);
    });

    // When a device is deleted, cascade delete all cables connected to it
    eventBus.on('device:deleted', ({ deviceId }) => {
      const affected = this.getConnectionsByDeviceId(deviceId);
      affected.forEach((cable) => {
        this.deleteConnection(cable.id);
      });
    });

    // Deselect cable when an empty area or device is selected
    eventBus.on('canvas:clicked-empty', () => {
      this.deselectConnection();
    });

    eventBus.on('device:selected', () => {
      this.deselectConnection();
    });
  }

  /**
   * Add a new connection and render it
   * @param {Object} connectionData 
   * @returns {Object|null}
   */
  addConnection(connectionData) {
    const cable = CableSchema.create(connectionData);

    const sourceDev = this.deviceManager.getDeviceById(cable.source);
    const destDev = this.deviceManager.getDeviceById(cable.destination);

    if (!sourceDev || !destDev) {
      console.warn('[CableManager] Cannot create connection: Source or Destination device not found');
      return null;
    }

    if (cable.lengthMode === 'auto' || cable.length === 0) {
      cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
    }

    this.connections.set(cable.id, cable);

    this.renderer.renderCable(cable, sourceDev, destDev);
    this.connectionLayer.batchDraw();

    eventBus.emit('connection:added', cable);
    return cable;
  }

  /**
   * Update properties of an existing connection
   * @param {string} id 
   * @param {Object} updates 
   * @returns {Object|null}
   */
  updateConnection(id, updates) {
    const existing = this.connections.get(id);
    if (!existing) return null;

    const updatedDetails = updates.details
      ? { ...existing.details, ...updates.details }
      : existing.details;

    const updatedCable = {
      ...existing,
      ...updates,
      details: updatedDetails,
      updatedAt: new Date().toISOString()
    };

    const sourceDev = this.deviceManager.getDeviceById(updatedCable.source);
    const destDev = this.deviceManager.getDeviceById(updatedCable.destination);

    if (updatedCable.lengthMode === 'auto') {
      updatedCable.length = this.calculateEstimatedLength(updatedCable, sourceDev, destDev);
    } else {
      if (!updatedCable.details) updatedCable.details = {};
      updatedCable.details.calculatedMetrics = calculateNetworkPerformanceMetrics({
        totalLength: updatedCable.length || 0,
        horizontalLength: updatedCable.details.horizontalLength || updatedCable.length || 0,
        category: updatedCable.cableCategory,
        poeSupport: updatedCable.details.poeSupport || 'poe+'
      });
    }

    this.connections.set(id, updatedCable);

    this.renderer.renderCable(updatedCable, sourceDev, destDev);
    this.connectionLayer.batchDraw();

    eventBus.emit('connection:updated', updatedCable);
    return updatedCable;
  }

  /**
   * Update an intermediate waypoint position
   * @param {string} cableId 
   * @param {number} waypointIndex 
   * @param {{x: number, y: number}} newNormalized 
   */
  updateWaypoint(cableId, waypointIndex, newNormalized) {
    const cable = this.connections.get(cableId);
    if (!cable || !Array.isArray(cable.route) || !cable.route[waypointIndex]) return;

    cable.route[waypointIndex] = newNormalized;
    cable.updatedAt = new Date().toISOString();

    const sourceDev = this.deviceManager.getDeviceById(cable.source);
    const destDev = this.deviceManager.getDeviceById(cable.destination);

    if (cable.lengthMode === 'auto') {
      cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
    }

    this.renderer.renderCable(cable, sourceDev, destDev);
    this.connectionLayer.batchDraw();

    eventBus.emit('connection:updated', cable);
  }

  /**
   * Delete an intermediate waypoint
   * @param {string} cableId 
   * @param {number} waypointIndex 
   */
  deleteWaypoint(cableId, waypointIndex) {
    const cable = this.connections.get(cableId);
    if (!cable || !Array.isArray(cable.route)) return;

    cable.route.splice(waypointIndex, 1);
    cable.updatedAt = new Date().toISOString();

    const sourceDev = this.deviceManager.getDeviceById(cable.source);
    const destDev = this.deviceManager.getDeviceById(cable.destination);

    if (cable.lengthMode === 'auto') {
      cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
    }

    this.renderer.renderCable(cable, sourceDev, destDev);
    this.connectionLayer.batchDraw();

    eventBus.emit('connection:updated', cable);
  }

  /**
   * Delete a connection
   * @param {string} id 
   * @returns {boolean}
   */
  deleteConnection(id) {
    const cable = this.connections.get(id);
    if (!cable) return false;

    if (this.selectedCableId === id) {
      this.deselectConnection();
    }

    this.renderer.removeCable(id);
    this.connections.delete(id);
    this.connectionLayer.batchDraw();

    eventBus.emit('connection:deleted', { connectionId: id });
    return true;
  }

  /**
   * Select a connection by ID
   * @param {string} id 
   */
  selectConnection(id) {
    const cable = this.connections.get(id);
    if (!cable) return;

    this.deviceManager.deselectDevice(); // Deselect any active device

    this.selectedCableId = id;
    this.renderer.setSelectedCable(id);

    const sourceDev = this.deviceManager.getDeviceById(cable.source);
    const destDev = this.deviceManager.getDeviceById(cable.destination);

    this.renderer.renderCable(cable, sourceDev, destDev);
    this.connectionLayer.batchDraw();

    eventBus.emit('connection:selected', cable);
  }

  /**
   * Deselect active connection
   */
  deselectConnection() {
    if (!this.selectedCableId) return;
    const prevId = this.selectedCableId;
    const cable = this.connections.get(prevId);

    this.selectedCableId = null;
    this.renderer.setSelectedCable(null);

    if (cable) {
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      this.renderer.renderCable(cable, sourceDev, destDev);
    }

    this.connectionLayer.batchDraw();
    eventBus.emit('connection:deselected', { connectionId: prevId });
  }

  /**
   * Re-render all cables connected to a specific device
   * @param {string} deviceId 
   */
  refreshCablesForDevice(deviceId) {
    const affected = this.getConnectionsByDeviceId(deviceId);
    affected.forEach((cable) => {
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      if (sourceDev && destDev) {
        if (cable.lengthMode === 'auto') {
          cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
        }
        this.renderer.renderCable(cable, sourceDev, destDev);
      }
    });
    this.connectionLayer.batchDraw();
  }

  /**
   * Find all cables connected to a device ID
   * @param {string} deviceId 
   * @returns {Object[]}
   */
  getConnectionsByDeviceId(deviceId) {
    return Array.from(this.connections.values()).filter(
      (c) => c.source === deviceId || c.destination === deviceId
    );
  }

  /**
   * Calculate accurate physical cable length in meters along polyline,
   * factoring in 2D horizontal route, vertical drops, service loop, and slack margin.
   * @param {Object} cable 
   * @param {Object} sourceDev 
   * @param {Object} destDev 
   * @returns {number} Accurate physical length in meters rounded to 1 decimal
   */
  calculateEstimatedLength(cable, sourceDev, destDev) {
    if (!sourceDev || !destDev) return cable.length || 0;

    const pts = [
      sourceDev.position,
      ...(cable.route || []),
      destDev.position
    ];

    let totalPixels = 0;
    const segments = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = (p2.x - p1.x) * this.naturalWidth;
      const dy = (p2.y - p1.y) * this.naturalHeight;
      const segPix = Math.sqrt(dx * dx + dy * dy);
      totalPixels += segPix;
      segments.push(Math.round(segPix * this.metersPerPixel * 10) / 10);
    }

    const horizontalMeters = Math.round(totalPixels * this.metersPerPixel * 10) / 10;

    if (!cable.details) cable.details = {};
    cable.details.segmentLengths = segments;
    cable.details.horizontalLength = horizontalMeters;

    const vSrc = typeof cable.details.verticalDropSource === 'number' ? cable.details.verticalDropSource : 1.5;
    const vDest = typeof cable.details.verticalDropDest === 'number' ? cable.details.verticalDropDest : 1.5;
    const sLoop = typeof cable.details.serviceLoopMeters === 'number' ? cable.details.serviceLoopMeters : 2.0;
    const sMargin = typeof cable.details.slackMarginPercent === 'number' ? cable.details.slackMarginPercent : 5;

    const accurate = calculateAccurateCableLength({
      horizontalMeters,
      verticalDropSource: vSrc,
      verticalDropDest: vDest,
      serviceLoopMeters: sLoop,
      slackMarginPercent: sMargin
    });

    cable.details.verticalTotal = accurate.verticalTotal;
    cable.details.serviceLoopMeters = accurate.serviceLoopMeters;
    cable.details.slackAmount = accurate.slackAmount;
    cable.details.slackMarginPercent = accurate.slackMarginPercent;
    cable.details.totalPhysicalLength = accurate.totalPhysical;

    cable.details.calculatedMetrics = calculateNetworkPerformanceMetrics({
      totalLength: accurate.totalPhysical,
      horizontalLength: horizontalMeters,
      category: cable.cableCategory,
      poeSupport: cable.details.poeSupport || 'poe+'
    });

    return accurate.totalPhysical;
  }

  /**
   * Calibrate map scale (meters represented by natural map width)
   * @param {number} realWorldWidthMeters 
   */
  setMapScale(realWorldWidthMeters) {
    const widthVal = parseFloat(realWorldWidthMeters);
    if (isNaN(widthVal) || widthVal <= 0) return;

    this.mapWidthMeters = widthVal;
    this.metersPerPixel = this.mapWidthMeters / this.naturalWidth;

    try {
      localStorage.setItem('netmap_scale_width_meters', String(widthVal));
    } catch (e) {}

    // Recalculate all auto cables with the new scale
    this.connections.forEach((cable) => {
      if (cable.lengthMode === 'auto') {
        const sourceDev = this.deviceManager.getDeviceById(cable.source);
        const destDev = this.deviceManager.getDeviceById(cable.destination);
        if (sourceDev && destDev) {
          cable.length = this.calculateEstimatedLength(cable, sourceDev, destDev);
          this.renderer.renderCable(cable, sourceDev, destDev);
        }
      }
    });

    this.connectionLayer.batchDraw();

    eventBus.emit('map:scale-calibrated', {
      mapWidthMeters: this.mapWidthMeters,
      metersPerPixel: this.metersPerPixel
    });
  }

  /**
   * Get connection by ID
   * @param {string} id 
   * @returns {Object|null}
   */
  getConnectionById(id) {
    return this.connections.get(id) || null;
  }

  /**
   * Get all connections
   * @returns {Object[]}
   */
  getAllConnections() {
    return Array.from(this.connections.values());
  }

  /**
   * Render all connections
   */
  renderAll() {
    this.connections.forEach((cable) => {
      const sourceDev = this.deviceManager.getDeviceById(cable.source);
      const destDev = this.deviceManager.getDeviceById(cable.destination);
      if (sourceDev && destDev) {
        this.renderer.renderCable(cable, sourceDev, destDev);
      }
    });
    this.connectionLayer.batchDraw();
  }
}

