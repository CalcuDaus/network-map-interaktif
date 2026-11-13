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
        name: 'Campus Network Infrastructure',
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
        updatedAt: new Date().toISOString()
      },
      // Current interaction mode: 'navigate' | 'select' | 'add-device' | 'draw-cable' | 'edit' | 'delete'
      mode: 'navigate',
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
  toggleSidebar(side) {
    if (side === 'left') {
      this.state.ui.leftSidebarOpen = !this.state.ui.leftSidebarOpen;
      eventBus.emit('ui:sidebar-toggled', { side: 'left', open: this.state.ui.leftSidebarOpen });
    } else if (side === 'right') {
      this.state.ui.rightSidebarOpen = !this.state.ui.rightSidebarOpen;
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
