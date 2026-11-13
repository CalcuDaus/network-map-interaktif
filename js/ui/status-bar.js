/**
 * NetMap — Bottom Status Bar
 * Displays real-time normalized coordinates, scale, mode, map resolution, and scale calibration
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { formatDecimals, formatZoomPercentage } from '../utils/helpers.js';

export class StatusBar {
  constructor() {
    this.initElements();
    this.bindEvents();
    this.renderInitial();
  }

  initElements() {
    this.coordNormDisplay = document.getElementById('status-coord-normalized');
    this.coordPixelDisplay = document.getElementById('status-coord-pixel');
    this.modeDisplay = document.getElementById('status-active-mode');
    this.zoomDisplay = document.getElementById('status-zoom-level');
    this.mapSizeDisplay = document.getElementById('status-map-size');
    this.scaleBtn = document.getElementById('status-map-scale-btn');
    this.scaleText = document.getElementById('status-map-scale-text');
  }

  renderInitial() {
    const state = stateManager.getState();
    if (this.modeDisplay) {
      this.modeDisplay.textContent = state.mode.toUpperCase();
    }
    if (this.zoomDisplay) {
      this.zoomDisplay.textContent = formatZoomPercentage(state.viewport.scale);
    }
    if (this.mapSizeDisplay) {
      this.mapSizeDisplay.textContent = `${state.project.map.naturalWidth} × ${state.project.map.naturalHeight} px`;
    }

    let savedScale = 400;
    try {
      const stored = localStorage.getItem('netmap_scale_width_meters');
      if (stored && !isNaN(parseFloat(stored))) {
        savedScale = parseFloat(stored);
      }
    } catch (e) {}

    const natW = state.project.map.naturalWidth || 1024;
    const mPerPx = savedScale / natW;
    if (this.scaleText) {
      this.scaleText.textContent = `📐 Skala: ${savedScale}m (1px = ${mPerPx.toFixed(2)}m)`;
    }
  }

  bindEvents() {
    // Click scale button to open scale calibration modal
    this.scaleBtn?.addEventListener('click', () => {
      eventBus.emit('modal:open-map-scale');
    });

    // Real-time pointer movement
    eventBus.on('pointer:moved', (pointer) => {
      if (pointer.isInsideMap) {
        if (this.coordNormDisplay) {
          this.coordNormDisplay.textContent = `X: ${formatDecimals(pointer.normalizedX, 4)}  Y: ${formatDecimals(pointer.normalizedY, 4)}`;
        }
        if (this.coordPixelDisplay) {
          this.coordPixelDisplay.textContent = `(${pointer.imageX}px, ${pointer.imageY}px)`;
        }
      } else {
        if (this.coordNormDisplay) {
          this.coordNormDisplay.textContent = 'X: --  Y: --';
        }
        if (this.coordPixelDisplay) {
          this.coordPixelDisplay.textContent = '(di luar denah)';
        }
      }
    });

    // Scale calibrated event
    eventBus.on('map:scale-calibrated', ({ mapWidthMeters, metersPerPixel }) => {
      if (this.scaleText) {
        this.scaleText.textContent = `📐 Skala: ${mapWidthMeters}m (1px = ${metersPerPixel.toFixed(2)}m)`;
      }
    });

    // Viewport zoom changes
    eventBus.on('viewport:changed', ({ scale }) => {
      const formatted = formatZoomPercentage(scale);
      if (this.zoomDisplay && this.zoomDisplay.textContent !== formatted) {
        this.zoomDisplay.textContent = formatted;
      }
    });

    // Interaction mode changes
    eventBus.on('mode:changed', ({ mode }) => {
      if (this.modeDisplay) {
        this.modeDisplay.textContent = mode.toUpperCase();
      }
    });

    // Map loaded
    eventBus.on('map:loaded', ({ width, height }) => {
      if (this.mapSizeDisplay) {
        this.mapSizeDisplay.textContent = `${width} × ${height} px`;
      }
      let savedScale = 400;
      try {
        const stored = localStorage.getItem('netmap_scale_width_meters');
        if (stored && !isNaN(parseFloat(stored))) {
          savedScale = parseFloat(stored);
        }
      } catch (e) {}
      if (this.scaleText && width > 0) {
        const mPerPx = savedScale / width;
        this.scaleText.textContent = `📐 Skala: ${savedScale}m (1px = ${mPerPx.toFixed(2)}m)`;
      }
    });
  }
}
