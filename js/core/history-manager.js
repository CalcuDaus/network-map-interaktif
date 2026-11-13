/**
 * NetMap — Undo / Redo History Manager
 * Implements Memento-based state history tracking with Ctrl+Z / Ctrl+Y shortcuts
 */

import { eventBus } from './event-bus.js';
import { debounce } from '../utils/helpers.js';

export class HistoryManager {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {number} [options.maxHistory=50]
   */
  constructor({ deviceManager, cableManager, maxHistory = 50 }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.maxHistory = maxHistory;

    this.undoStack = [];
    this.redoStack = [];
    this.isRestoring = false;

    // Debounced snapshot recording so cascading events (like deleting a device + connected cables)
    // coalesce into a single atomic undo step
    this.debouncedRecord = debounce((actionName) => {
      if (this.isRestoring) return;
      this.pushSnapshot(actionName || 'Perubahan Peta');
    }, 60);

    this.initMutationListeners();
  }

  /**
   * Capture a deep clone snapshot of devices and connections
   * @returns {Object}
   */
  captureSnapshot() {
    return {
      devices: JSON.parse(JSON.stringify(this.deviceManager.getAllDevices())),
      connections: JSON.parse(JSON.stringify(this.cableManager.getAllConnections()))
    };
  }

  /**
   * Initialize initial baseline state
   */
  initBaseline() {
    this.undoStack = [];
    this.redoStack = [];
    const initial = this.captureSnapshot();
    initial.actionName = 'Kondisi Awal';
    this.undoStack.push(initial);
    this.updateUI();
  }

  /**
   * Push a new snapshot to undo stack
   * @param {string} actionName 
   */
  pushSnapshot(actionName = 'Perubahan') {
    if (this.isRestoring) return;

    const current = this.captureSnapshot();
    current.actionName = actionName;

    // Avoid pushing duplicate states
    if (this.undoStack.length > 0) {
      const top = this.undoStack[this.undoStack.length - 1];
      if (JSON.stringify(top.devices) === JSON.stringify(current.devices) &&
          JSON.stringify(top.connections) === JSON.stringify(current.connections)) {
        return;
      }
    }

    this.undoStack.push(current);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // Any new action clears the redo stack
    this.redoStack = [];
    this.updateUI();
  }

  /**
   * Listen to mutation events from device and cable managers
   */
  initMutationListeners() {
    const handleMutation = (actionName) => {
      if (this.isRestoring) return;
      this.debouncedRecord(actionName);
    };

    eventBus.on('device:added', (dev) => {
      handleMutation(`Tambah Perangkat "${dev?.name || 'Baru'}"`);
    });

    eventBus.on('device:updated', (dev) => {
      handleMutation(`Edit Perangkat "${dev?.name || ''}"`);
    });

    eventBus.on('device:deleted', () => {
      handleMutation('Hapus Perangkat');
    });

    eventBus.on('device:moved', () => {
      handleMutation('Geser Perangkat');
    });

    eventBus.on('connection:added', (cable) => {
      handleMutation(`Tambah Kabel "${cable?.name || ''}"`);
    });

    eventBus.on('connection:updated', (cable) => {
      handleMutation(`Ubah Jalur Kabel "${cable?.name || ''}"`);
    });

    eventBus.on('connection:deleted', () => {
      handleMutation('Hapus Kabel');
    });
  }

  /**
   * Perform Undo (Ctrl + Z)
   * @returns {boolean}
   */
  undo() {
    if (this.undoStack.length <= 1) {
      this.showToast('Tidak ada tindakan untuk di-undo');
      return false;
    }

    this.isRestoring = true;

    // Pop current state and push to redo stack
    const currentState = this.undoStack.pop();
    this.redoStack.push(currentState);

    // Target state to restore
    const targetState = this.undoStack[this.undoStack.length - 1];
    this.restoreSnapshot(targetState);

    this.updateUI();
    this.showToast(`↶ Undo: ${currentState.actionName || 'Tindakan Sebelumnya'}`);
    eventBus.emit('history:undo', { action: currentState.actionName });

    setTimeout(() => {
      this.isRestoring = false;
    }, 120);
    return true;
  }

  /**
   * Perform Redo (Ctrl + Y or Ctrl + Shift + Z)
   * @returns {boolean}
   */
  redo() {
    if (this.redoStack.length === 0) {
      this.showToast('Tidak ada tindakan untuk di-redo');
      return false;
    }

    this.isRestoring = true;

    // Pop state from redo stack and push to undo stack
    const targetState = this.redoStack.pop();
    this.undoStack.push(targetState);

    this.restoreSnapshot(targetState);

    this.updateUI();
    this.showToast(`↷ Redo: ${targetState.actionName || 'Tindakan Diterapkan Kembali'}`);
    eventBus.emit('history:redo', { action: targetState.actionName });

    setTimeout(() => {
      this.isRestoring = false;
    }, 120);
    return true;
  }

  /**
   * Restore application state to a given snapshot
   * @param {Object} snapshot 
   */
  restoreSnapshot(snapshot) {
    if (!snapshot) return;

    // Deselect any selected entity
    this.deviceManager.deselectDevice();
    this.cableManager.deselectConnection();

    // 1. Restore Devices:
    // Remove devices not in snapshot
    const targetDevMap = new Map(snapshot.devices.map((d) => [d.id, d]));
    const currentDevs = this.deviceManager.getAllDevices();

    currentDevs.forEach((dev) => {
      if (!targetDevMap.has(dev.id)) {
        this.deviceManager.deleteDevice(dev.id);
      }
    });

    // Add or update devices in snapshot
    snapshot.devices.forEach((dev) => {
      const existing = this.deviceManager.getDeviceById(dev.id);
      if (existing) {
        this.deviceManager.updateDevice(dev.id, dev);
        this.deviceManager.updateDevicePosition(dev.id, dev.position);
      } else {
        this.deviceManager.addDevice(dev);
      }
    });

    // 2. Restore Connections:
    const targetCableMap = new Map(snapshot.connections.map((c) => [c.id, c]));
    const currentCables = this.cableManager.getAllConnections();

    currentCables.forEach((c) => {
      if (!targetCableMap.has(c.id)) {
        this.cableManager.deleteConnection(c.id);
      }
    });

    snapshot.connections.forEach((cable) => {
      const existing = this.cableManager.getConnectionById(cable.id);
      if (existing) {
        this.cableManager.updateConnection(cable.id, cable);
      } else {
        this.cableManager.addConnection(cable);
      }
    });

    // Redraw all layers
    this.deviceManager.renderAll();
    this.cableManager.renderAll();
  }

  canUndo() {
    return this.undoStack.length > 1;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  updateUI() {
    if (typeof document === 'undefined') return;
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) {
      btnUndo.disabled = !this.canUndo();
      btnUndo.style.opacity = this.canUndo() ? '1' : '0.4';
      btnUndo.style.pointerEvents = this.canUndo() ? 'auto' : 'none';
      const prevAction = this.undoStack.length > 1 ? this.undoStack[this.undoStack.length - 1].actionName : '';
      btnUndo.title = this.canUndo() ? `Undo: ${prevAction} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
    }

    if (btnRedo) {
      btnRedo.disabled = !this.canRedo();
      btnRedo.style.opacity = this.canRedo() ? '1' : '0.4';
      btnRedo.style.pointerEvents = this.canRedo() ? 'auto' : 'none';
      const nextAction = this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].actionName : '';
      btnRedo.title = this.canRedo() ? `Redo: ${nextAction} (Ctrl+Y)` : 'Redo (Ctrl+Y)';
    }
  }

  showToast(message) {
    if (typeof document === 'undefined') return;
    let toast = document.getElementById('netmap-action-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'netmap-action-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 45px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-focus);
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        transition: opacity 200ms ease, transform 200ms ease;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(8px)';
    }, 1800);
  }
}
