/**
 * NetMap — Cable Connection Manager (CRUD & Dynamic Routing Controller)
 * Orchestrates connection lifecycle, dynamic endpoint anchoring, and automatic length calculation
 */

import { eventBus } from '../core/event-bus.js';
import { CableSchema } from './cable-schema.js';
import { CableRenderer } from './cable-renderer.js';
import { calculateAccurateCableLength, calculateNetworkPerformanceMetrics } from './cable-library.js';
import {
  compute3DCablePathLengthMeters,
  autoTidyCableRoute,
  evaluateCableNeatness
} from './cable-routing-engine.js';

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

    // Scale calibration: calibrated to Google Maps SMK Negeri 1 Beringin (170m width, 1px = 0.166m)
    let savedScale = 170;
    try {
      const stored = localStorage.getItem('netmap_scale_width_meters');
      if (stored && !isNaN(parseFloat(stored))) {
        const parsed = parseFloat(stored);
        savedScale = parsed === 400 ? 170 : parsed;
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
      onContextMenu: (cable, clientX, clientY, hitCoord = null, waypointIdx = null) => {
        eventBus.emit('contextmenu:cable', { cable, screenX: clientX, screenY: clientY, hitCoord, waypointIdx });
      },
      onWaypointMoved: (id, idx, norm) => this.updateWaypoint(id, idx, norm),
      onWaypointDeleted: (id, idx) => this.deleteWaypoint(id, idx),
      onWaypointInserted: (id, idx, norm) => this.insertWaypoint(id, idx, norm)
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
   * @param {{x: number, y: number, z?: number}} newNormalized 
   */
  updateWaypoint(cableId, waypointIndex, newNormalized) {
    const cable = this.connections.get(cableId);
    if (!cable || !Array.isArray(cable.route) || !cable.route[waypointIndex]) return;

    cable.route[waypointIndex] = {
      ...cable.route[waypointIndex],
      x: Math.max(0.01, Math.min(0.99, Number(newNormalized.x))),
      y: Math.max(0.01, Math.min(0.99, Number(newNormalized.y))),
      ...(typeof newNormalized.z === 'number' && !isNaN(newNormalized.z)
        ? { z: Number(Math.max(0.02, newNormalized.z).toFixed(2)) }
        : {}),
      ...(newNormalized.surface ? { surface: newNormalized.surface } : {}),
      ...(newNormalized.normal ? { normal: { x: Number(newNormalized.normal.x) || 0, y: Number(newNormalized.normal.y) || 0, z: Number(newNormalized.normal.z) || 0 } } : {}),
      ...(newNormalized.clipType ? { clipType: newNormalized.clipType } : {})
    };
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
   * Insert a new intermediate anchor/waypoint at a specific segment index (Pen Tool add-anchor)
   * @param {string} cableId
   * @param {number} insertIndex
   * @param {{x: number, y: number, z?: number}} newNormalized
   */
  insertWaypoint(cableId, insertIndex, newNormalized) {
    const cable = this.connections.get(cableId);
    if (!cable) return;
    if (!Array.isArray(cable.route)) cable.route = [];

    const clampedIdx = Math.max(0, Math.min(cable.route.length, insertIndex));
    const pt = {
      x: Math.max(0.01, Math.min(0.99, Number(newNormalized.x))),
      y: Math.max(0.01, Math.min(0.99, Number(newNormalized.y)))
    };
    if (typeof newNormalized.z === 'number' && !isNaN(newNormalized.z)) {
      pt.z = Number(Math.max(0.02, newNormalized.z).toFixed(2));
    }
    if (newNormalized.surface) pt.surface = newNormalized.surface;
    if (newNormalized.normal && typeof newNormalized.normal === 'object') {
      pt.normal = {
        x: Number(newNormalized.normal.x) || 0,
        y: Number(newNormalized.normal.y) || 0,
        z: Number(newNormalized.normal.z) || 0
      };
    }
    if (newNormalized.clipType) pt.clipType = newNormalized.clipType;
    cable.route.splice(clampedIdx, 0, pt);
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
   * Smartly insert a draggable Pen-Tool waypoint at the nearest segment to hitCoord (or midpoint of longest segment)
   * @param {string} cableId
   * @param {{x: number, y: number, z?: number}|null} [hitCoord]
   * @returns {{x: number, y: number, z?: number}|null}
   */
  addSmartWaypoint(cableId, hitCoord = null) {
    const cable = this.connections.get(cableId);
    if (!cable) return null;
    const sourceDev = this.deviceManager.getDeviceById(cable.source);
    const destDev = this.deviceManager.getDeviceById(cable.destination);
    if (!sourceDev || !destDev) return null;

    const existingRoute = Array.isArray(cable.route) ? cable.route : [];
    const chain = [sourceDev.position, ...existingRoute, destDev.position];
    const hasHit = hitCoord && typeof hitCoord.x === 'number' && !isNaN(hitCoord.x)
      && typeof hitCoord.y === 'number' && !isNaN(hitCoord.y);

    if (hasHit) {
      const px = Math.max(0.01, Math.min(0.99, Number(hitCoord.x)));
      const py = Math.max(0.01, Math.min(0.99, Number(hitCoord.y)));
      let bestSegIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i];
        const b = chain[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 1e-9 ? ((px - a.x) * dx + (py - a.y) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const projX = a.x + t * dx;
        const projY = a.y + t * dy;
        const d = Math.hypot(px - projX, py - projY);
        if (d < bestDist) {
          bestDist = d;
          bestSegIdx = i;
        }
      }

      const zVal = (typeof hitCoord.z === 'number' && !isNaN(hitCoord.z))
        ? Number(Math.max(0.02, hitCoord.z).toFixed(2))
        : (typeof cable.details?.elevationZ === 'number' ? cable.details.elevationZ : 1.2);

      if (existingRoute.length === 0 && typeof hitCoord.z === 'number' && !isNaN(hitCoord.z)) {
        cable.details = {
          ...(cable.details || {}),
          pathStyle: 'curve',
          bowOut: 0,
          sideOffset: 0,
          sagDrop: 0
        };
      }

      const inserted = { x: Number(px.toFixed(4)), y: Number(py.toFixed(4)), z: zVal };
      this.insertWaypoint(cableId, bestSegIdx, inserted);
      return inserted;
    }

    // Fallback when no hitCoord provided: bisect longest segment
    let longestIdx = 0;
    let longestLenSq = -1;
    for (let i = 0; i < chain.length - 1; i++) {
      const lenSq = Math.pow(chain[i + 1].x - chain[i].x, 2) + Math.pow(chain[i + 1].y - chain[i].y, 2);
      if (lenSq > longestLenSq) {
        longestLenSq = lenSq;
        longestIdx = i;
      }
    }
    const segA = chain[longestIdx];
    const segB = chain[longestIdx + 1];
    const midX = Number(Math.max(0.01, Math.min(0.99, (segA.x + segB.x) * 0.5)).toFixed(4));
    const midY = Number(Math.max(0.01, Math.min(0.99, (segA.y + segB.y) * 0.5)).toFixed(4));
    const zVal = (typeof segA.z === 'number' && typeof segB.z === 'number')
      ? Number(Math.max(0.02, (segA.z + segB.z) * 0.5).toFixed(2))
      : (typeof cable.details?.elevationZ === 'number' ? cable.details.elevationZ : 1.2);

    const inserted = { x: midX, y: midY, z: zVal };
    this.insertWaypoint(cableId, longestIdx, inserted);
    return inserted;
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

    const mapH = this.naturalHeight * this.metersPerPixel;
    const path3d = compute3DCablePathLengthMeters(cable, sourceDev, destDev, this.mapWidthMeters, mapH);

    if (!cable.details) cable.details = {};
    const sLoop = typeof cable.details.serviceLoopMeters === 'number' ? cable.details.serviceLoopMeters : 2.0;
    const sMargin = typeof cable.details.slackMarginPercent === 'number' ? cable.details.slackMarginPercent : 5;

    let horizontalMeters = 0;
    let segments = [];
    let accurate = null;

    if (path3d.has3dZ) {
      horizontalMeters = path3d.horizontalMeters;
      segments = path3d.segmentLengths;
      const baseWithLoop = path3d.direct3dMeters + sLoop;
      const slackAmount = Math.round(baseWithLoop * (sMargin / 100) * 10) / 10;
      const totalPhysical = Math.round((baseWithLoop + slackAmount) * 10) / 10;
      accurate = {
        verticalTotal: path3d.verticalTotal,
        serviceLoopMeters: sLoop,
        slackAmount,
        slackMarginPercent: sMargin,
        totalPhysical
      };
    } else {
      const pts = [
        sourceDev.position,
        ...(cable.route || []),
        destDev.position
      ];

      let totalPixels = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = (p2.x - p1.x) * this.naturalWidth;
        const dy = (p2.y - p1.y) * this.naturalHeight;
        const segPix = Math.sqrt(dx * dx + dy * dy);
        totalPixels += segPix;
        segments.push(Math.round(segPix * this.metersPerPixel * 10) / 10);
      }

      horizontalMeters = Math.round(totalPixels * this.metersPerPixel * 10) / 10;

      const vSrc = typeof cable.details.verticalDropSource === 'number' ? cable.details.verticalDropSource : 1.5;
      const vDest = typeof cable.details.verticalDropDest === 'number' ? cable.details.verticalDropDest : 1.5;

      accurate = calculateAccurateCableLength({
        horizontalMeters,
        verticalDropSource: vSrc,
        verticalDropDest: vDest,
        serviceLoopMeters: sLoop,
        slackMarginPercent: sMargin
      });
    }

    cable.details.segmentLengths = segments;
    cable.details.horizontalLength = horizontalMeters;
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

    cable.length = accurate.totalPhysical;
    cable.details.neatnessReport = evaluateCableNeatness(cable, sourceDev, destDev, {
      mapWidthMeters: this.mapWidthMeters
    });

    return accurate.totalPhysical;
  }

  /**
   * Apply 1-click Auto-Tidy 90° orthogonal wall/ceiling routing + parallel bundling to a cable.
   * @param {string} cableId
   * @param {{ preset?: 'ceiling-run'|'skirting-run'|'snap-90-existing', targetElevation?: number, conduitType?: string, wallSnapFn?: Function }} [options]
   * @returns {Object|null}
   */
  applyAutoTidy(cableId, options = {}) {
    const cable = this.connections.get(cableId);
    if (!cable) return null;
    const sourceDev = this.deviceManager.getDeviceById(cable.source);
    const destDev = this.deviceManager.getDeviceById(cable.destination);
    if (!sourceDev || !destDev) return null;

    const { route, detailsPatch } = autoTidyCableRoute(cable, sourceDev, destDev, {
      preset: options.preset || 'ceiling-run',
      targetElevation: options.targetElevation,
      allCables: this.getAllConnections(),
      mapWidthMeters: this.mapWidthMeters,
      wallSnapFn: options.wallSnapFn || null
    });

    const nextDetails = {
      ...(cable.details || {}),
      ...detailsPatch,
      ...(options.conduitType ? { conduitType: options.conduitType } : {})
    };

    return this.updateConnection(cableId, {
      route,
      details: nextDetails
    });
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

