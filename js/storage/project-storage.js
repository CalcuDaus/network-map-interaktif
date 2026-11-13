/**
 * NetMap — Project Storage & Debounced Auto-Save
 * Coordinates serialization of devices, connections, and state to IndexedDB
 */

import { database } from './database.js';
import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { debounce } from '../utils/helpers.js';

export class ProjectStorage {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   */
  constructor({ deviceManager, cableManager }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.isAutoSaveEnabled = true;

    // Create debounced auto-save function (1500ms)
    this.debouncedSave = debounce(() => {
      this.saveCurrentProject();
    }, 1500);

    this.initMutationListeners();
  }

  initMutationListeners() {
    const handleMutation = () => {
      if (!this.isAutoSaveEnabled) return;
      this.updateStatusIndicator('saving');
      this.debouncedSave();
    };

    // Watch all data mutations
    eventBus.on('device:added', handleMutation);
    eventBus.on('device:updated', handleMutation);
    eventBus.on('device:deleted', handleMutation);
    eventBus.on('device:moved', handleMutation);

    eventBus.on('connection:added', handleMutation);
    eventBus.on('connection:updated', handleMutation);
    eventBus.on('connection:deleted', handleMutation);
  }

  /**
   * Serialize current project to a plain JSON object
   * @returns {Object}
   */
  serializeProject() {
    const state = stateManager.getState();
    const devices = this.deviceManager.getAllDevices();
    const connections = this.cableManager.getAllConnections();

    return {
      version: '1.0',
      id: state.project.id || 'proj-default',
      name: state.project.name || 'Campus Network Infrastructure',
      map: {
        image: 'assets/maps/campus-map.jpg',
        version: state.project.map.version,
        naturalWidth: state.project.map.naturalWidth || 1024,
        naturalHeight: state.project.map.naturalHeight || 1024
      },
      layers: { ...state.layers },
      scaleWidthMeters: this.cableManager.mapWidthMeters || 400,
      devices: devices,
      connections: connections,
      customTemplates: (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('netmap_custom_templates') || '[]') : []),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Save current project to IndexedDB
   * @returns {Promise<boolean>}
   */
  async saveCurrentProject() {
    try {
      this.updateStatusIndicator('saving');
      const projectData = this.serializeProject();
      await database.saveProject(projectData);
      this.updateStatusIndicator('saved');
      eventBus.emit('project:saved', { id: projectData.id });
      return true;
    } catch (err) {
      console.error('[ProjectStorage] Failed to save project to IndexedDB:', err);
      this.updateStatusIndicator('error');
      return false;
    }
  }

  /**
   * Load project from IndexedDB and populate manager collections
   * @param {string} id 
   * @returns {Promise<boolean>}
   */
  async loadProject(id) {
    try {
      const projectData = await database.getProject(id);
      if (!projectData) return false;

      // Layout was saved against a different base map — positions would be wrong, re-seed instead
      const currentMapVersion = stateManager.getState().project.map.version;
      if (projectData.map?.version !== currentMapVersion) {
        console.info(`[ProjectStorage] Saved project uses map "${projectData.map?.version || 'legacy'}", current is "${currentMapVersion}". Ignoring stale layout.`);
        return false;
      }

      this.deserializeProject(projectData);
      return true;
    } catch (err) {
      console.error('[ProjectStorage] Failed to load project:', err);
      return false;
    }
  }

  /**
   * Deserialize project data into application managers
   * @param {Object} projectData 
   */
  deserializeProject(projectData) {
    // Clear current devices and cables
    const currentDevs = this.deviceManager.getAllDevices();
    currentDevs.forEach((d) => this.deviceManager.deleteDevice(d.id));

    // Update project state
    stateManager.getState().project.id = projectData.id;
    stateManager.getState().project.name = projectData.name;

    // Load scale calibration if present
    if (projectData.scaleWidthMeters && typeof projectData.scaleWidthMeters === 'number') {
      this.cableManager.setMapScale(projectData.scaleWidthMeters);
    }

    // Load devices
    if (Array.isArray(projectData.devices)) {
      projectData.devices.forEach((dev) => {
        this.deviceManager.addDevice(dev);
      });
    }

    // Load cables
    if (Array.isArray(projectData.connections)) {
      projectData.connections.forEach((cable) => {
        this.cableManager.addConnection(cable);
      });
    }

    // Restore custom device templates if present
    if (Array.isArray(projectData.customTemplates) && typeof localStorage !== 'undefined') {
      localStorage.setItem('netmap_custom_templates', JSON.stringify(projectData.customTemplates));
    }

    this.updateStatusIndicator('saved');
    eventBus.emit('project:loaded', projectData);
  }

  updateStatusIndicator(status) {
    const statusPill = document.querySelector('#app-status-bar .status-pill');
    if (!statusPill) return;

    if (status === 'saving') {
      statusPill.innerHTML = '⟳ MENYIMPAN...';
      statusPill.style.color = 'var(--accent-sky)';
      statusPill.style.background = 'rgba(56, 189, 248, 0.15)';
    } else if (status === 'saved') {
      statusPill.innerHTML = '● TERSIMPAN (OFFLINE)';
      statusPill.style.color = 'var(--status-online)';
      statusPill.style.background = 'rgba(34, 197, 94, 0.15)';
    } else if (status === 'error') {
      statusPill.innerHTML = '⚠ GAGAL SIMPAN';
      statusPill.style.color = 'var(--status-offline)';
      statusPill.style.background = 'rgba(239, 68, 68, 0.15)';
    }
  }
}

