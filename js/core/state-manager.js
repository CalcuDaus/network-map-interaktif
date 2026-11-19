/**
 * NetMap — Central State Manager
 * Maintains reactive state for mode, project, layers, viewport, and selection
 */

import { eventBus } from './event-bus.js';

class StateManager {
  constructor() {
    this.state = {
      project: {
        id: 'proj-default',
        name: 'SmartSchool NetMap',
        version: '1.0',
        map: {
          image: 'assets/maps/campus-map.jpg',
          // Bump this whenever the base map image changes so stale saved layouts are re-seeded
          version: 'campus-v2-1024',
          naturalWidth: 1024,
          naturalHeight: 1024,
          isLoaded: false
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rooms3d: [],
        objects3d: [],
        roads3d: []
      },
      // Active primary workspace mode: 'network' (Simulasi Jaringan, default) | 'build' (Edit Bangunan)
      workspaceMode: 'network',
      // Active viewport renderer mode: '2d' | '3d'
      viewMode: '2d',
      // Current interaction mode: 'navigate' | 'select' | 'add-device' | 'draw-cable' | 'edit' | 'delete'
      mode: 'navigate',
      // Selected 3D builder object ID
      selectedObject3dId: null,
      // Selected 3D room ID
      selectedRoom3dId: null,
      // Selected 3D road ID
      selectedRoad3dId: null,
      // Viewport transform
      viewport: {
        x: 0,
        y: 0,
        scale: 1.0,
        minScale: 0.1,
        maxScale: 6.0
      },
      // Selected entity (device or connection)
      selectedEntity: null,
      // Layer visibility states (PRD Section 2.2 & 3.7)
      layers: {
        background: true,
        buildings: true,
        infrastructure: true,
        devices: true,
        connections: true,
        annotations: true,
        interaction: true
      },
      // Pointer position and normalized coordinate tracking
      pointer: {
        screenX: 0,
        screenY: 0,
        imageX: 0,
        imageY: 0,
        normalizedX: 0,
        normalizedY: 0,
        isInsideMap: false
      },
      // UI panel states
      ui: {
        leftSidebarOpen: true,
        rightSidebarOpen: false
      }
    };
  }

  /**
   * Get current state (shallow copy or specific key)
   */
  getState() {
    return this.state;
  }

  /**
   * Set application interaction mode
   * @param {string} mode 
   */
  setMode(mode) {
    if (this.state.mode === mode) return;
    const prevMode = this.state.mode;
    this.state.mode = mode;
    eventBus.emit('mode:changed', { mode, prevMode });
  }

  getMode() {
    return this.state.mode;
  }

  setViewMode(viewMode) {
    if (this.state.viewMode === viewMode) return;
    const prevViewMode = this.state.viewMode;
    this.state.viewMode = viewMode;
    eventBus.emit('viewmode:changed', { viewMode, prevViewMode });
  }

  getViewMode() {
    return this.state.viewMode;
  }

  /**
   * Switch primary educational workspace mode ('network' = Simulasi Jaringan [default] | 'build' = Edit Bangunan)
   * @param {'build'|'network'} workspaceMode
   * @returns {'build'|'network'}
   */
  setWorkspaceMode(workspaceMode) {
    const normalized = workspaceMode === 'build' ? 'build' : 'network';
    if (this.state.workspaceMode === normalized) return normalized;
    const prevWorkspaceMode = this.state.workspaceMode || 'network';
    this.state.workspaceMode = normalized;
    eventBus.emit('workspace:changed', {
      workspaceMode: normalized,
      prevWorkspaceMode
    });
    return normalized;
  }

  getWorkspaceMode() {
    return this.state.workspaceMode === 'build' ? 'build' : 'network';
  }

  setRooms3d(rooms) {
    this.state.project.rooms3d = Array.isArray(rooms) ? rooms : [];
    if (
      this.state.selectedRoom3dId &&
      !this.state.project.rooms3d.some((r) => r.id === this.state.selectedRoom3dId)
    ) {
      this.state.selectedRoom3dId = null;
      eventBus.emit('room3d:deselected', {});
    }
    eventBus.emit('room3d:changed', { rooms: this.state.project.rooms3d });
  }

  getRooms3d() {
    return this.state.project.rooms3d || [];
  }

  getRoom3dById(id) {
    return this.getRooms3d().find((r) => r.id === id) || null;
  }

  updateRoom3d(id, updates) {
    const list = [...this.getRooms3d()];
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const updated = { ...list[idx], ...updates, id };
    list[idx] = updated;
    this.state.project.rooms3d = list;
    eventBus.emit('room3d:changed', { rooms: list });
    if (this.state.selectedRoom3dId === id) {
      eventBus.emit('room3d:selected', updated);
    }
    return updated;
  }

  deleteRoom3d(id) {
    const list = this.getRooms3d();
    const next = list.filter((r) => r.id !== id);
    if (next.length === list.length) return false;
    const wasSelected = this.state.selectedRoom3dId === id;
    this.state.project.rooms3d = next;
    if (wasSelected) {
      this.state.selectedRoom3dId = null;
      eventBus.emit('room3d:deselected', { id });
    }
    eventBus.emit('room3d:changed', { rooms: next });
    return true;
  }

  selectRoom3d(id) {
    const room = this.getRoom3dById(id);
    if (!room) return;
    if (this.state.selectedRoom3dId === id) return;
    this.state.selectedRoom3dId = id;
    eventBus.emit('room3d:selected', room);
  }

  deselectRoom3d() {
    if (!this.state.selectedRoom3dId) return;
    const prevId = this.state.selectedRoom3dId;
    this.state.selectedRoom3dId = null;
    eventBus.emit('room3d:deselected', { id: prevId });
  }

  getSelectedRoom3dId() {
    return this.state.selectedRoom3dId || null;
  }

  getObjects3d() {
    return this.state.project.objects3d || [];
  }

  setObjects3d(objects) {
    this.state.project.objects3d = Array.isArray(objects) ? objects : [];
    if (
      this.state.selectedObject3dId &&
      !this.state.project.objects3d.some((o) => o.id === this.state.selectedObject3dId)
    ) {
      this.state.selectedObject3dId = null;
      eventBus.emit('object3d:deselected', {});
    }
    eventBus.emit('object3d:changed', { objects: this.state.project.objects3d });
  }

  getObject3dById(id) {
    return this.getObjects3d().find((o) => o.id === id) || null;
  }

  addObject3d(objData) {
    if (!objData || !objData.id) return null;
    const list = [...this.getObjects3d(), objData];
    this.state.project.objects3d = list;
    eventBus.emit('object3d:changed', { objects: list });
    this.selectObject3d(objData.id);
    return objData;
  }

  updateObject3d(id, updates) {
    const list = [...this.getObjects3d()];
    const idx = list.findIndex((o) => o.id === id);
    if (idx < 0) return null;
    const updated = { ...list[idx], ...updates, id };
    list[idx] = updated;
    this.state.project.objects3d = list;
    eventBus.emit('object3d:changed', { objects: list });
    if (this.state.selectedObject3dId === id) {
      eventBus.emit('object3d:selected', updated);
    }
    return updated;
  }

  deleteObject3d(id) {
    const list = this.getObjects3d();
    const next = list.filter((o) => o.id !== id);
    if (next.length === list.length) return false;
    const wasSelected = this.state.selectedObject3dId === id;
    this.state.project.objects3d = next;
    if (wasSelected) {
      this.state.selectedObject3dId = null;
      eventBus.emit('object3d:deselected', { id });
    }
    eventBus.emit('object3d:changed', { objects: next });
    return true;
  }

  selectObject3d(id) {
    const obj = this.getObject3dById(id);
    if (!obj) return;
    this.state.selectedObject3dId = id;
    eventBus.emit('object3d:selected', obj);
  }

  deselectObject3d() {
    if (!this.state.selectedObject3dId) return;
    const prevId = this.state.selectedObject3dId;
    this.state.selectedObject3dId = null;
    eventBus.emit('object3d:deselected', { id: prevId });
  }

  getSelectedObject3dId() {
    return this.state.selectedObject3dId || null;
  }

  getRoads3d() {
    return this.state.project.roads3d || [];
  }

  setRoads3d(roads) {
    this.state.project.roads3d = Array.isArray(roads) ? roads : [];
    if (
      this.state.selectedRoad3dId &&
      !this.state.project.roads3d.some((r) => r.id === this.state.selectedRoad3dId)
    ) {
      this.state.selectedRoad3dId = null;
      eventBus.emit('road3d:deselected', {});
    }
    eventBus.emit('road3d:changed', { roads: this.state.project.roads3d });
  }

  getRoad3dById(id) {
    return this.getRoads3d().find((r) => r.id === id) || null;
  }

  addRoad3d(roadData) {
    if (!roadData || !roadData.id) return null;
    const list = [...this.getRoads3d(), roadData];
    this.state.project.roads3d = list;
    eventBus.emit('road3d:changed', { roads: list });
    this.selectRoad3d(roadData.id);
    return roadData;
  }

  updateRoad3d(id, updates) {
    const list = [...this.getRoads3d()];
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const updated = { ...list[idx], ...updates, id };
    list[idx] = updated;
    this.state.project.roads3d = list;
    eventBus.emit('road3d:changed', { roads: list });
    if (this.state.selectedRoad3dId === id) {
      eventBus.emit('road3d:selected', updated);
    }
    return updated;
  }

  deleteRoad3d(id) {
    const list = this.getRoads3d();
    const next = list.filter((r) => r.id !== id);
    if (next.length === list.length) return false;
    const wasSelected = this.state.selectedRoad3dId === id;
    this.state.project.roads3d = next;
    if (wasSelected) {
      this.state.selectedRoad3dId = null;
      eventBus.emit('road3d:deselected', { id });
    }
    eventBus.emit('road3d:changed', { roads: next });
    return true;
  }

  selectRoad3d(id) {
    const road = this.getRoad3dById(id);
    if (!road) return;
    this.state.selectedRoad3dId = id;
    eventBus.emit('road3d:selected', road);
  }

  deselectRoad3d() {
    if (!this.state.selectedRoad3dId) return;
    const prevId = this.state.selectedRoad3dId;
    this.state.selectedRoad3dId = null;
    eventBus.emit('road3d:deselected', { id: prevId });
  }

  getSelectedRoad3dId() {
    return this.state.selectedRoad3dId || null;
  }

  /**
   * Update viewport scale and position
   * @param {number} scale 
   * @param {number} x 
   * @param {number} y 
   */
  setViewport(scale, x, y) {
    this.state.viewport.scale = scale;
    this.state.viewport.x = x;
    this.state.viewport.y = y;
    eventBus.emit('viewport:changed', { scale, x, y });
  }

  /**
   * Update pointer tracking coordinates
   * @param {Object} coords 
   */
  setPointerCoordinates(coords) {
    Object.assign(this.state.pointer, coords);
    eventBus.emit('pointer:moved', this.state.pointer);
  }

  /**
   * Toggle visibility of a specific map layer
   * @param {string} layerKey 
   * @param {boolean} [isVisible] 
   */
  toggleLayer(layerKey, isVisible) {
    if (this.state.layers[layerKey] === undefined) return;
    const newVisibility = isVisible !== undefined ? isVisible : !this.state.layers[layerKey];
    this.state.layers[layerKey] = newVisibility;
    eventBus.emit('layer:visibility-changed', { layer: layerKey, visible: newVisibility });
  }

  /**
   * Toggle sidebar collapse state
   * @param {'left'|'right'} side 
   */
  toggleSidebar(side, forceOpen = undefined) {
    const hasForce = typeof forceOpen === 'boolean';
    if (side === 'left') {
      const next = hasForce ? forceOpen : !this.state.ui.leftSidebarOpen;
      if (!hasForce && next === this.state.ui.leftSidebarOpen) return;
      this.state.ui.leftSidebarOpen = next;
      eventBus.emit('ui:sidebar-toggled', { side: 'left', open: this.state.ui.leftSidebarOpen });
    } else if (side === 'right') {
      const next = hasForce ? forceOpen : !this.state.ui.rightSidebarOpen;
      if (!hasForce && next === this.state.ui.rightSidebarOpen) return;
      this.state.ui.rightSidebarOpen = next;
      eventBus.emit('ui:sidebar-toggled', { side: 'right', open: this.state.ui.rightSidebarOpen });
    }
  }

  /**
   * Set map image loaded status and dimensions
   * @param {number} width 
   * @param {number} height 
   */
  setMapLoaded(width, height) {
    this.state.project.map.naturalWidth = width;
    this.state.project.map.naturalHeight = height;
    this.state.project.map.isLoaded = true;
    eventBus.emit('map:loaded', { width, height });
  }
}

export const stateManager = new StateManager();
