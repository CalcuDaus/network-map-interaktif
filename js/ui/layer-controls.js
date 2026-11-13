/**
 * NetMap — Layer Controls & Sub-Filter Component
 * Manages visibility toggles for Konva layers and sub-category filtering (CCTV, FO, Wireless)
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';

export class LayerControls {
  /**
   * @param {Object} options
   * @param {import('../map/map-layers.js').MapLayers} options.mapLayers
   * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   */
  constructor({ mapLayers, mapEngine, deviceManager, cableManager }) {
    this.mapLayers = mapLayers;
    this.mapEngine = mapEngine;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;

    this.filters = {
      showCctv: true,
      showFiber: true,
      showWireless: true,
      showCoverage: true
    };

    this.bindEvents();
  }

  bindEvents() {
    // Primary layer checkboxes
    const layerCheckboxes = document.querySelectorAll('input[data-layer]');
    layerCheckboxes.forEach((cb) => {
      const layerName = cb.getAttribute('data-layer');
      cb.addEventListener('change', (e) => {
        stateManager.toggleLayer(layerName, e.target.checked);
      });
    });

    // Toggle dim background on object selection (Focus Mode)
    const toggleDim = document.getElementById('toggle-dim-bg-on-select');
    toggleDim?.addEventListener('change', (e) => {
      if (this.mapEngine) {
        this.mapEngine.dimOnSelection = e.target.checked;
        if (!e.target.checked) {
          this.mapEngine.restoreBackground();
        } else {
          const hasSelectedDevice = Boolean(this.deviceManager?.selectedDeviceId);
          const hasSelectedCable = Boolean(this.cableManager?.selectedCableId);
          if (hasSelectedDevice || hasSelectedCable) {
            this.mapEngine.dimBackground();
          }
        }
      }
    });

    // Sub-filters (CCTV, Fiber Optic, Wireless)
    const filterCctv = document.getElementById('filter-toggle-cctv');
    filterCctv?.addEventListener('change', (e) => {
      this.filters.showCctv = e.target.checked;
      this.applyDeviceFilter();
    });

    const filterFiber = document.getElementById('filter-toggle-fiber');
    filterFiber?.addEventListener('change', (e) => {
      this.filters.showFiber = e.target.checked;
      this.applyCableFilter();
    });

    const filterWireless = document.getElementById('filter-toggle-wireless');
    filterWireless?.addEventListener('change', (e) => {
      this.filters.showWireless = e.target.checked;
      this.applyCableFilter();
    });

    const filterCoverage = document.getElementById('filter-toggle-coverage');
    filterCoverage?.addEventListener('change', (e) => {
      this.filters.showCoverage = e.target.checked;
      this.deviceManager.renderer.setCoverageVisibility(e.target.checked);
    });
  }

  applyDeviceFilter() {
    this.deviceManager.renderer.markerMap.forEach((group, deviceId) => {
      const dev = this.deviceManager.getDeviceById(deviceId);
      if (dev && dev.type === 'cctv') {
        group.visible(this.filters.showCctv);
      }
    });
    this.mapLayers.deviceLayer.batchDraw();
  }

  applyCableFilter() {
    this.cableManager.renderer.lineMap.forEach((line, cableId) => {
      const cable = this.cableManager.getConnectionById(cableId);
      if (cable) {
        let isVis = true;
        if (cable.type === 'fiber') {
          isVis = this.filters.showFiber;
          line.visible(isVis);
        } else if (cable.type === 'wireless') {
          isVis = this.filters.showWireless;
          line.visible(isVis);
        }
        const badge = this.cableManager.renderer.labelMap?.get(cableId);
        if (badge) {
          badge.visible(isVis && (this.cableManager.renderer.showDistanceLabels !== false));
        }
      }
    });
    this.mapLayers.connectionLayer.batchDraw();
  }
}

