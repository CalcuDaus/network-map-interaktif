/**
 * NetMap — Device Manager (CRUD & Collection Controller)
 * Orchestrates device lifecycle, state synchronization, and canvas rendering
 */

import { eventBus } from '../core/event-bus.js';
import { DeviceSchema } from './device-schema.js';
import { DeviceRenderer } from './device-renderer.js';
import { getDeviceDefByType } from './device-library.js';
import { clamp } from '../utils/helpers.js';

export class DeviceManager {
  /**
   * @param {Object} options
   * @param {Konva.Layer} options.deviceLayer
   * @param {number} options.naturalWidth
   * @param {number} options.naturalHeight
   */
  constructor({ deviceLayer, naturalWidth = 1024, naturalHeight = 1024 }) {
    this.deviceLayer = deviceLayer;
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;

    this.devices = new Map(); // id -> device object
    this.selectedDeviceId = null;
    this.selectedDeviceIds = new Set();

    // Initialize renderer
    this.renderer = new DeviceRenderer({
      naturalWidth: this.naturalWidth,
      naturalHeight: this.naturalHeight,
      deviceLayer: this.deviceLayer,
      onSelect: (id, options) => this.selectDevice(id, options),
      onMove: (id, position) => this.updateDevicePosition(id, position),
      onGroupMove: (moves) => this.moveDeviceGroup(moves),
      onRadiusChange: (id, meters) => {
        const dev = this.devices.get(id);
        if (dev) {
          const currentCov = dev.wirelessCoverage || {};
          this.updateDevice(id, {
            wirelessCoverage: {
              ...currentCov,
              enabled: true,
              radiusMeters: meters
            }
          });
        }
      },
      onContextMenu: (device, clientX, clientY) => {
        eventBus.emit('contextmenu:device', { device, screenX: clientX, screenY: clientY });
      }
    });
  }

  /**
   * Add a new device to the manager and render it
   * @param {Object} deviceData 
   * @returns {Object} Created device
   */
  addDevice(deviceData) {
    // If only type is provided, lookup catalog defaults
    const def = getDeviceDefByType(deviceData.type);
    const resolvedCoverage = deviceData.wirelessCoverage !== undefined
      ? deviceData.wirelessCoverage
      : (def?.defaultWirelessCoverage ? { ...def.defaultWirelessCoverage } : undefined);

    const enrichedData = {
      name: deviceData.name || (def ? def.name : 'New Device'),
      category: deviceData.category || (def ? def.category : 'core'),
      brand: deviceData.brand || (def ? def.defaultBrand : ''),
      model: deviceData.model || (def ? def.defaultModel : ''),
      ...deviceData,
      ...(resolvedCoverage !== undefined ? { wirelessCoverage: resolvedCoverage } : {})
    };

    const device = DeviceSchema.create(enrichedData);
    const validation = DeviceSchema.validate(device);

    if (!validation.isValid) {
      console.warn('[DeviceManager] Device validation failed:', validation.errors);
    }

    this.devices.set(device.id, device);

    // Render on canvas
    const group = this.renderer.renderDevice(device);
    if (!group.getParent()) {
      this.deviceLayer.add(group);
    }
    this.deviceLayer.batchDraw();

    eventBus.emit('device:added', device);
    return device;
  }

  /**
   * Update properties of an existing device
   * @param {string} id 
   * @param {Object} updates 
   * @returns {Object|null}
   */
  updateDevice(id, updates) {
    const existing = this.devices.get(id);
    if (!existing) return null;

    // Deep merge network fields if provided
    const updatedNetwork = updates.network
      ? { ...existing.network, ...updates.network }
      : existing.network;

    const updatedDevice = {
      ...existing,
      ...updates,
      network: updatedNetwork,
      updatedAt: new Date().toISOString()
    };

    this.devices.set(id, updatedDevice);

    // Update visuals
    this.renderer.renderDevice(updatedDevice);
    this.deviceLayer.batchDraw();

    eventBus.emit('device:updated', updatedDevice);
    return updatedDevice;
  }

  /**
   * Update position coordinates of a device
   * @param {string} id 
   * @param {{x: number, y: number}} position (Normalized 0 - 1)
   * @param {{syncRenderer?: boolean}} [options]
   */
  updateDevicePosition(id, position, { syncRenderer = false } = {}) {
    const device = this.devices.get(id);
    if (!device) return;

    device.position.x = clamp(position.x, 0, 1);
    device.position.y = clamp(position.y, 0, 1);
    device.updatedAt = new Date().toISOString();

    if (syncRenderer && typeof this.renderer?.setDevicePosition === 'function') {
      this.renderer.setDevicePosition(id, device.position);
      this.deviceLayer?.batchDraw();
    }

    eventBus.emit('device:moved', { deviceId: id, position: device.position });
  }

  /**
   * Update coordinates for multiple devices in a single group move operation
   * @param {Array<{id: string, position: {x: number, y: number}}>} moves
   * @param {{syncRenderer?: boolean}} [options]
   * @returns {Object[]} Updated devices
   */
  moveDeviceGroup(moves, { syncRenderer = false } = {}) {
    if (!Array.isArray(moves) || moves.length === 0) return [];
    const now = new Date().toISOString();
    const movedEntries = [];

    moves.forEach(({ id, position }) => {
      const device = this.devices.get(id);
      if (!device || device.layerLocked || !position) return;

      device.position.x = clamp(position.x, 0, 1);
      device.position.y = clamp(position.y, 0, 1);
      device.updatedAt = now;

      if (syncRenderer && typeof this.renderer?.setDevicePosition === 'function') {
        this.renderer.setDevicePosition(id, device.position);
      }

      movedEntries.push({ device, deviceId: id, position: { ...device.position } });
    });

    if (movedEntries.length === 0) return [];

    if (syncRenderer) {
      this.deviceLayer?.batchDraw();
    }

    movedEntries.forEach(({ deviceId, position }) => {
      eventBus.emit('device:moved', { deviceId, position });
    });

    eventBus.emit('devices:group-moved', {
      moves: movedEntries.map(({ deviceId, position }) => ({ deviceId, position }))
    });

    return movedEntries.map((m) => m.device);
  }

  /**
   * Duplicate a device near its current position
   * @param {string} id 
   * @returns {Object|null}
   */
  duplicateDevice(id) {
    const source = this.devices.get(id);
    if (!source) return null;

    const cloneData = JSON.parse(JSON.stringify(source));
    delete cloneData.id;
    cloneData.name = `${source.name} (Copy)`;
    // Slight offset
    cloneData.position = {
      x: clamp(source.position.x + 0.02, 0, 1),
      y: clamp(source.position.y + 0.02, 0, 1)
    };

    const newDevice = this.addDevice(cloneData);
    this.selectDevice(newDevice.id);
    return newDevice;
  }

  /**
   * Delete a device from the manager and canvas
   * @param {string} id 
   * @returns {boolean}
   */
  deleteDevice(id) {
    const device = this.devices.get(id);
    if (!device) return false;

    const wasSelected = this.selectedDeviceIds.has(id) || this.selectedDeviceId === id;
    if (wasSelected) {
      this.selectedDeviceIds.delete(id);
    }

    this.renderer.removeDevice(id);
    this.devices.delete(id);

    if (wasSelected) {
      if (this.selectedDeviceIds.size === 0) {
        this.selectedDeviceId = null;
        this.renderer.setSelectedDevices(this.selectedDeviceIds, null);
        eventBus.emit('device:selection-changed', { selectedIds: [], primaryId: null, devices: [] });
        eventBus.emit('device:deselected', { deviceId: id });
      } else {
        const remaining = Array.from(this.selectedDeviceIds);
        const nextPrimaryId = this.selectedDeviceIds.has(this.selectedDeviceId)
          ? this.selectedDeviceId
          : remaining[remaining.length - 1];
        this.selectedDeviceId = nextPrimaryId;
        const primaryDev = this.devices.get(nextPrimaryId) || null;
        this.renderer.setSelectedDevices(this.selectedDeviceIds, nextPrimaryId);
        eventBus.emit('device:selection-changed', {
          selectedIds: remaining,
          primaryId: nextPrimaryId,
          devices: this.getSelectedDevices()
        });
        if (primaryDev) {
          eventBus.emit('device:selected', primaryDev);
        }
      }
    }

    this.deviceLayer?.batchDraw();

    eventBus.emit('device:deleted', { deviceId: id });
    return true;
  }

  /**
   * Delete all currently selected devices and return count deleted
   * @returns {number}
   */
  deleteSelectedDevices() {
    const idsToDelete = this.getSelectedDeviceIds();
    if (idsToDelete.length === 0) return 0;

    let deletedCount = 0;
    idsToDelete.forEach((id) => {
      if (this.deleteDevice(id)) {
        deletedCount += 1;
      }
    });
    return deletedCount;
  }

  /**
   * Sync renderer selection visuals and notify listeners
   * @param {Object|null} primaryDevice
   * @private
   */
  _commitSelectionState(primaryDevice) {
    const selectedIds = Array.from(this.selectedDeviceIds);
    this.selectedDeviceId = primaryDevice ? primaryDevice.id : (selectedIds[selectedIds.length - 1] || null);

    if (typeof this.renderer?.setSelectedDevices === 'function') {
      this.renderer.setSelectedDevices(this.selectedDeviceIds, this.selectedDeviceId);
    } else if (typeof this.renderer?.setSelectedDevice === 'function') {
      this.renderer.setSelectedDevice(this.selectedDeviceId);
    }
    this.deviceLayer?.batchDraw();

    const activePrimary = this.selectedDeviceId ? this.devices.get(this.selectedDeviceId) || null : null;
    eventBus.emit('device:selection-changed', {
      selectedIds,
      primaryId: this.selectedDeviceId,
      devices: this.getSelectedDevices()
    });

    if (activePrimary) {
      eventBus.emit('device:selected', activePrimary);
    }
  }

  /**
   * Select a device by ID with optional multi-select modifiers
   * @param {string} id
   * @param {{toggle?: boolean, additive?: boolean, preserveMultiOnDrag?: boolean}} [options]
   */
  selectDevice(id, options = {}) {
    const device = this.devices.get(id);
    if (!device) return;

    const { toggle = false, additive = false, preserveMultiOnDrag = false } = options || {};

    if (preserveMultiOnDrag && this.selectedDeviceIds.has(id)) {
      this._commitSelectionState(device);
      return;
    }

    if (toggle) {
      if (this.selectedDeviceIds.has(id)) {
        this.selectedDeviceIds.delete(id);
        if (this.selectedDeviceIds.size === 0) {
          this.deselectDevice();
          return;
        }
        const remaining = Array.from(this.selectedDeviceIds);
        const fallbackPrimary = this.devices.get(remaining[remaining.length - 1]) || null;
        this._commitSelectionState(fallbackPrimary);
        return;
      }
      this.selectedDeviceIds.add(id);
      this._commitSelectionState(device);
      return;
    }

    if (additive) {
      this.selectedDeviceIds.add(id);
      this._commitSelectionState(device);
      return;
    }

    this.selectedDeviceIds.clear();
    this.selectedDeviceIds.add(id);
    this._commitSelectionState(device);
  }

  /**
   * Select multiple devices at once (e.g. from box/marquee selection)
   * @param {string[]} ids
   * @param {{additive?: boolean, primaryId?: string}} [options]
   */
  selectMultipleDevices(ids, options = {}) {
    const { additive = false, primaryId = null } = options || {};
    const validIds = (Array.isArray(ids) ? ids : []).filter((id) => this.devices.has(id));

    if (!additive) {
      this.selectedDeviceIds.clear();
    }
    validIds.forEach((id) => this.selectedDeviceIds.add(id));

    if (this.selectedDeviceIds.size === 0) {
      this.deselectDevice();
      return;
    }

    const allSelected = Array.from(this.selectedDeviceIds);
    const chosenPrimaryId = (primaryId && this.selectedDeviceIds.has(primaryId))
      ? primaryId
      : (validIds[validIds.length - 1] || allSelected[allSelected.length - 1]);

    this._commitSelectionState(this.devices.get(chosenPrimaryId) || null);
  }

  /**
   * Select all visible devices on canvas
   * @param {{onlyVisible?: boolean}} [options]
   * @returns {number} Count selected
   */
  selectAllDevices({ onlyVisible = true } = {}) {
    const matchingIds = [];
    this.devices.forEach((dev, id) => {
      if (!onlyVisible || dev.layerVisible !== false) {
        matchingIds.push(id);
      }
    });
    if (matchingIds.length === 0) return 0;
    this.selectMultipleDevices(matchingIds, { additive: false });
    return matchingIds.length;
  }

  /**
   * Deselect all active devices
   */
  deselectDevice() {
    if (this.selectedDeviceIds.size === 0 && !this.selectedDeviceId) return;
    const prevId = this.selectedDeviceId;
    this.selectedDeviceIds.clear();
    this.selectedDeviceId = null;

    if (typeof this.renderer?.setSelectedDevices === 'function') {
      this.renderer.setSelectedDevices(this.selectedDeviceIds, null);
    } else if (typeof this.renderer?.setSelectedDevice === 'function') {
      this.renderer.setSelectedDevice(null);
    }
    this.deviceLayer?.batchDraw();

    eventBus.emit('device:selection-changed', { selectedIds: [], primaryId: null, devices: [] });
    eventBus.emit('device:deselected', { deviceId: prevId });
  }

  /**
   * Check whether a device is currently selected
   * @param {string} id
   * @returns {boolean}
   */
  isDeviceSelected(id) {
    return this.selectedDeviceIds.has(id);
  }

  /**
   * Get selected device IDs in selection order
   * @returns {string[]}
   */
  getSelectedDeviceIds() {
    return Array.from(this.selectedDeviceIds);
  }

  /**
   * Get array of selected device objects
   * @returns {Object[]}
   */
  getSelectedDevices() {
    return Array.from(this.selectedDeviceIds)
      .map((id) => this.devices.get(id))
      .filter(Boolean);
  }

  /**
   * Get device by ID
   * @param {string} id 
   * @returns {Object|null}
   */
  getDeviceById(id) {
    return this.devices.get(id) || null;
  }

  /**
   * Get all devices as an array
   * @returns {Object[]}
   */
  getAllDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Re-render all devices in current collection
   */
  renderAll() {
    this.devices.forEach((device) => {
      const group = this.renderer.renderDevice(device);
      if (!group.getParent()) {
        this.deviceLayer.add(group);
      }
    });
    this.deviceLayer.batchDraw();
  }
}
