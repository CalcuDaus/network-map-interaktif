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
   * @param {import('./auth-manager.js').AuthManager} [options.authManager]
   */
  constructor({ deviceManager, cableManager, authManager = null }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.authManager = authManager;
    this.isAutoSaveEnabled = true;
    this.hasPendingSave = false;

    // Fast debounced auto-save (300ms) so edits persist quickly to Server / Account
    this.debouncedSave = debounce(() => {
      this.saveCurrentProject();
    }, 300);

    this.initMutationListeners();
    this.initUnloadFlush();
  }

  initUnloadFlush() {
    if (typeof window === 'undefined') return;
    const flushNow = () => {
      if (!this.isAutoSaveEnabled || !this.hasPendingSave) return;
      if (this.authManager && !this.authManager.canWriteActiveWorkspace()) return;
      const projectData = this.serializeProject();
      this.saveLocalBackup(projectData);
      this.saveCurrentProject();
    };

    window.addEventListener('beforeunload', flushNow);
    window.addEventListener('pagehide', flushNow);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          flushNow();
        }
      });
    }
  }

  saveLocalBackup(projectData) {
    try {
      if (typeof localStorage === 'undefined' || !projectData?.id) return;
      localStorage.setItem(`netmap_autosave_${projectData.id}`, JSON.stringify(projectData));
    } catch (e) {
      // Ignore quota errors (IndexedDB remains primary)
    }
  }

  loadLocalBackup(id) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(`netmap_autosave_${id}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  initMutationListeners() {
    const handleMutation = () => {
      if (!this.isAutoSaveEnabled) return;
      if (this.authManager && !this.authManager.isAuthenticated()) {
        this.hasPendingSave = false;
        this.updateStatusIndicator(this.authManager.isPublicPreviewActive?.() ? 'public-readonly' : 'guest');
        return;
      }
      if (this.authManager && !this.authManager.canWriteActiveWorkspace()) {
        this.hasPendingSave = false;
        this.updateStatusIndicator('readonly-main');
        return;
      }
      this.hasPendingSave = true;
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
    eventBus.on('room3d:changed', handleMutation);
    eventBus.on('object3d:changed', handleMutation);
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
      rooms3d: state.project.rooms3d || [],
      objects3d: state.project.objects3d || [],
      customTemplates: (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('netmap_custom_templates') || '[]') : []),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Clear active canvas (devices, cables, 3D rooms/objects) without mutating stored server data
   */
  clearCanvasToEmpty(projectName = 'SmartSchool NetMap') {
    const prevAutoSave = this.isAutoSaveEnabled;
    this.isAutoSaveEnabled = false;
    try {
      this.deviceManager?.deselectDevice?.();
      this.cableManager?.deselectConnection?.();
      stateManager.deselectObject3d?.();

      const currentDevs = this.deviceManager.getAllDevices();
      currentDevs.forEach((d) => this.deviceManager.deleteDevice(d.id));
      const remainingCables = this.cableManager.getAllConnections();
      remainingCables.forEach((c) => this.cableManager.deleteConnection(c.id));

      stateManager.getState().project.id = 'proj-default';
      stateManager.getState().project.name = projectName;
      stateManager.setRooms3d([]);
      stateManager.setObjects3d([]);

      this.hasPendingSave = false;
      const idleStatus = !this.authManager || !this.authManager.isAuthenticated()
        ? (this.authManager?.isPublicPreviewActive?.() ? 'public-readonly' : 'guest')
        : (this.authManager.canWriteActiveWorkspace() ? 'saved' : 'readonly-main');
      this.updateStatusIndicator(idleStatus);
      eventBus.emit('project:loaded', { id: 'proj-default', devices: [], connections: [], rooms3d: [], objects3d: [] });
    } finally {
      this.isAutoSaveEnabled = prevAutoSave;
    }
  }

  /**
   * Load Server Utama in public read-only view (without requiring login or password)
   */
  async loadPublicMainWorkspaceProject() {
    if (!this.authManager) return { loaded: false };
    try {
      const ws = await this.authManager.loadPublicMainWorkspace();
      if (ws && ws.projectData && typeof ws.projectData === 'object') {
        this.deserializeProject(ws.projectData);
        this.updateStatusIndicator('public-readonly');
        return {
          loaded: true,
          workspaceKey: 'main',
          readOnly: true,
          updatedBy: ws.updatedBy || null,
          updatedAt: ws.updatedAt || null
        };
      }
      this.clearCanvasToEmpty('Server Utama (Lihat Publik)');
      this.updateStatusIndicator('public-readonly');
      return { loaded: false, workspaceKey: 'main', readOnly: true };
    } catch (err) {
      console.error('[ProjectStorage] Failed to load public Server Utama:', err);
      this.updateStatusIndicator('error');
      return { loaded: false, workspaceKey: 'main', readOnly: true };
    }
  }

  /**
   * Load project for the currently authenticated workspace ('main' or 'user_<username>')
   * @returns {Promise<{ loaded: boolean, workspaceKey?: string, readOnly?: boolean, updatedBy?: string|null, updatedAt?: string|null }>}
   */
  async loadActiveWorkspaceProject() {
    if (!this.authManager || !this.authManager.isAuthenticated()) {
      if (this.authManager?.isPublicPreviewActive?.()) {
        return this.loadPublicMainWorkspaceProject();
      }
      this.clearCanvasToEmpty();
      this.updateStatusIndicator('guest');
      return { loaded: false };
    }

    const activeKey = this.authManager.getActiveWorkspaceKey();
    try {
      const ws = await this.authManager.loadWorkspaceProject(activeKey);
      const isWritable = this.authManager.canWriteActiveWorkspace();
      if (ws && ws.projectData && typeof ws.projectData === 'object') {
        this.deserializeProject(ws.projectData);
        this.updateStatusIndicator(isWritable ? 'saved' : 'readonly-main');
        return {
          loaded: true,
          workspaceKey: activeKey,
          readOnly: !isWritable,
          updatedBy: ws.updatedBy || null,
          updatedAt: ws.updatedAt || null
        };
      }
      this.clearCanvasToEmpty(activeKey === 'main' ? 'Server Utama (Template Bersama)' : `Workspace ${this.authManager.getCurrentUser()?.displayName || ''}`);
      this.updateStatusIndicator(isWritable ? 'saved' : 'readonly-main');
      return { loaded: false, workspaceKey: activeKey, readOnly: !isWritable };
    } catch (err) {
      console.error('[ProjectStorage] Failed to load active workspace:', err);
      this.updateStatusIndicator('error');
      return { loaded: false, workspaceKey: activeKey };
    }
  }

  /**
   * Save current project to authenticated workspace (Server Utama when unlocked / Personal Account) + IndexedDB mirror
   * Refuses persistence in Guest Mode or when Server Utama is still password-locked.
   * @returns {Promise<boolean>}
   */
  async saveCurrentProject() {
    if (this.authManager && !this.authManager.isAuthenticated()) {
      this.hasPendingSave = false;
      this.updateStatusIndicator(this.authManager.isPublicPreviewActive?.() ? 'public-readonly' : 'guest');
      return false;
    }
    if (this.authManager && !this.authManager.canWriteActiveWorkspace()) {
      this.hasPendingSave = false;
      this.updateStatusIndicator('readonly-main');
      return false;
    }

    try {
      this.updateStatusIndicator('saving');
      const projectData = this.serializeProject();
      const activeKey = this.authManager?.getActiveWorkspaceKey?.() || null;

      if (this.authManager && activeKey) {
        projectData.workspaceKey = activeKey;
        await this.authManager.saveWorkspaceProject(activeKey, projectData);
        try {
          if (typeof indexedDB !== 'undefined') {
            await database.saveProject({ ...projectData, id: `netmap_ws_${activeKey}` });
          }
        } catch { /* IndexedDB mirror is best-effort */ }
      } else {
        this.saveLocalBackup(projectData);
        await database.saveProject(projectData);
      }

      this.hasPendingSave = false;
      this.updateStatusIndicator('saved');
      eventBus.emit('project:saved', { id: projectData.id, workspaceKey: activeKey });
      return true;
    } catch (err) {
      console.error('[ProjectStorage] Failed to save project:', err);
      this.updateStatusIndicator('error');
      return false;
    }
  }

  /**
   * Load project from IndexedDB (with synchronous localStorage backup fallback if newer)
   * @param {string} id 
   * @returns {Promise<boolean>}
   */
  async loadProject(id) {
    try {
      const dbData = await database.getProject(id);
      const localBackup = this.loadLocalBackup(id);
      const currentMapVersion = stateManager.getState().project.map.version;

      const validDb = dbData && dbData.map?.version === currentMapVersion ? dbData : null;
      const validLocal = localBackup && localBackup.map?.version === currentMapVersion ? localBackup : null;

      let projectData = validDb;
      if (validLocal && (!validDb || new Date(validLocal.updatedAt || 0) > new Date(validDb.updatedAt || 0))) {
        projectData = validLocal;
      }

      if (!projectData) {
        if (dbData && dbData.map?.version !== currentMapVersion) {
          console.info(`[ProjectStorage] Saved project uses map "${dbData.map?.version || 'legacy'}", current is "${currentMapVersion}". Ignoring stale layout.`);
        }
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
    const prevAutoSave = this.isAutoSaveEnabled;
    this.isAutoSaveEnabled = false;
    try {
      // Clear current devices and cables
      const currentDevs = this.deviceManager.getAllDevices();
      currentDevs.forEach((d) => this.deviceManager.deleteDevice(d.id));

      // Update project state
      stateManager.getState().project.id = projectData.id;
      const loadedName = projectData.name;
      stateManager.getState().project.name =
        (!loadedName || loadedName === 'Campus Network Infrastructure' || loadedName === 'Campus Network')
          ? 'SmartSchool NetMap'
          : loadedName;

      // Load scale calibration if present
      if (projectData.scaleWidthMeters && typeof projectData.scaleWidthMeters === 'number') {
        this.cableManager.setMapScale(projectData.scaleWidthMeters);
      }

      // Load 3D custom rooms & objects
      stateManager.setRooms3d(Array.isArray(projectData.rooms3d) ? projectData.rooms3d : []);
      stateManager.setObjects3d(Array.isArray(projectData.objects3d) ? projectData.objects3d : []);

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

      this.hasPendingSave = false;
      const initialStatus = this.authManager
        ? (!this.authManager.isAuthenticated()
            ? (this.authManager.isPublicPreviewActive?.() ? 'public-readonly' : 'guest')
            : (this.authManager.canWriteActiveWorkspace() ? 'saved' : 'readonly-main'))
        : 'saved';
      this.updateStatusIndicator(initialStatus);
      eventBus.emit('project:loaded', projectData);
    } finally {
      this.isAutoSaveEnabled = prevAutoSave;
    }
  }

  updateStatusIndicator(status) {
    const statusPill = document.querySelector('#app-status-bar .status-pill');
    if (!statusPill) return;

    const isAuthed = Boolean(this.authManager?.isAuthenticated?.());
    if (status === 'public-readonly' || (!isAuthed && this.authManager?.isPublicPreviewActive?.())) {
      statusPill.textContent = '● LIHAT PUBLIK • SERVER UTAMA (READ-ONLY)';
      statusPill.style.color = 'var(--status-warning)';
      statusPill.style.background = 'rgba(217, 119, 6, 0.14)';
      return;
    }

    if (status === 'guest' || (this.authManager && !isAuthed)) {
      statusPill.textContent = '● MODE TAMU (TIDAK TERSIMPAN — LOGIN)';
      statusPill.style.color = 'var(--status-warning)';
      statusPill.style.background = 'rgba(217, 119, 6, 0.14)';
      return;
    }

    if (status === 'readonly-main' || (isAuthed && !this.authManager?.canWriteActiveWorkspace?.())) {
      statusPill.textContent = '● LIHAT PUBLIK • SERVER UTAMA (TERKUNCI — MASUKKAN PASSWORD)';
      statusPill.style.color = 'var(--status-warning)';
      statusPill.style.background = 'rgba(217, 119, 6, 0.14)';
      return;
    }

    if (status === 'saving') {
      statusPill.textContent = '● MENYIMPAN KE SERVER...';
      statusPill.style.color = 'var(--accent-sky)';
      statusPill.style.background = 'rgba(56, 189, 248, 0.15)';
    } else if (status === 'saved') {
      if (this.authManager) {
        const wsMode = this.authManager.getWorkspaceMode();
        const user = this.authManager.getCurrentUser();
        const backendLabel = this.authManager.storageBackend === 'mysql'
          ? 'MySQL'
          : (this.authManager.storageBackend === 'file' ? 'Server' : 'Lokal');
        const wsLabel = wsMode === 'personal'
          ? `AKUN: ${user?.username || 'Teknisi'}`
          : 'SERVER UTAMA';
        statusPill.textContent = `● TERSIMPAN • ${wsLabel} (${backendLabel})`;
      } else {
        statusPill.textContent = '● TERSIMPAN (OFFLINE)';
      }
      statusPill.style.color = 'var(--status-online)';
      statusPill.style.background = 'rgba(34, 197, 94, 0.15)';
    } else if (status === 'error') {
      statusPill.textContent = '! GAGAL SIMPAN';
      statusPill.style.color = 'var(--status-offline)';
      statusPill.style.background = 'rgba(239, 68, 68, 0.15)';
    }
  }
}

