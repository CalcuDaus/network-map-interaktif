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

    // Initialize renderer
    this.renderer = new DeviceRenderer({
      naturalWidth: this.naturalWidth,
      naturalHeight: this.naturalHeight,
      deviceLayer: this.deviceLayer,
      onSelect: (id) => this.selectDevice(id),
      onMove: (id, position) => this.updateDevicePosition(id, position),
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
   */
  updateDevicePosition(id, position) {
    const device = this.devices.get(id);
    if (!device) return;

    device.position.x = clamp(position.x, 0, 1);
    device.position.y = clamp(position.y, 0, 1);
    device.updatedAt = new Date().toISOString();

    eventBus.emit('device:moved', { deviceId: id, position: device.position });
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

    if (this.selectedDeviceId === id) {
      this.deselectDevice();
    }

    this.renderer.removeDevice(id);
    this.devices.delete(id);
    this.deviceLayer.batchDraw();

    eventBus.emit('device:deleted', { deviceId: id });
    return true;
  }

  /**
   * Select a device by ID
   * @param {string} id 
   */
  selectDevice(id) {
    const device = this.devices.get(id);
    if (!device) return;

    this.selectedDeviceId = id;
    this.renderer.setSelectedDevice(id);
    this.deviceLayer.batchDraw();

    eventBus.emit('device:selected', device);
  }

  /**
   * Deselect active device
   */
  deselectDevice() {
    if (!this.selectedDeviceId) return;
    const prevId = this.selectedDeviceId;
    this.selectedDeviceId = null;
    this.renderer.setSelectedDevice(null);
    this.deviceLayer.batchDraw();

    eventBus.emit('device:deselected', { deviceId: prevId });
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
