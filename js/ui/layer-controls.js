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
  constructor({ mapLayers, mapEngine, deviceManager, cableManager, map3DEngine = null }) {
    this.mapLayers = mapLayers;
    this.mapEngine = mapEngine;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.map3DEngine = map3DEngine;

    this.filters = {
      showCctv: true,
      showFiber: true,
      showWireless: true,
      showCoverage: true,
      dimOnSelection: true
    };

    this.bindEvents();
  }

  /** Attach or update the 3D Map Engine instance so view filters & layers mirror to 3D mode. */
  setMap3DEngine(engine) {
    this.map3DEngine = engine || null;
    this.map3DEngine?.setViewFilters?.({ ...this.filters });
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

    // Keep layer checkboxes & View badge synced when state changes programmatically (e.g. 3D Label button)
    eventBus.on('layer:visibility-changed', ({ layer, visible }) => {
      const cb = document.querySelector(`#navbar-view-filter-dropdown input[data-layer="${layer}"]`);
      if (cb && cb.checked !== Boolean(visible)) {
        cb.checked = Boolean(visible);
      }
      this.syncViewFilterBadge();
    });

    // Toggle dim background on object selection (Focus Mode)
    const toggleDim = document.getElementById('toggle-dim-bg-on-select');
    toggleDim?.addEventListener('change', (e) => {
      const checked = Boolean(e.target.checked);
      this.filters.dimOnSelection = checked;
      if (this.mapEngine) {
        this.mapEngine.dimOnSelection = checked;
        if (!checked) {
          this.mapEngine.restoreBackground();
        } else {
          const hasSelectedDevice = Boolean(this.deviceManager?.selectedDeviceId);
          const hasSelectedCable = Boolean(this.cableManager?.selectedCableId);
          if (hasSelectedDevice || hasSelectedCable) {
            this.mapEngine.dimBackground();
          }
        }
      }
      this.map3DEngine?.setViewFilters?.({ dimOnSelection: checked });
    });

    // Sub-filters (CCTV, Fiber Optic, Wireless)
    const filterCctv = document.getElementById('filter-toggle-cctv');
    filterCctv?.addEventListener('change', (e) => {
      this.filters.showCctv = e.target.checked;
      this.applyDeviceFilter();
      this.map3DEngine?.setViewFilters?.({ showCctv: this.filters.showCctv });
    });

    const filterFiber = document.getElementById('filter-toggle-fiber');
    filterFiber?.addEventListener('change', (e) => {
      this.filters.showFiber = e.target.checked;
      this.applyCableFilter();
      this.map3DEngine?.setViewFilters?.({ showFiber: this.filters.showFiber });
    });

    const filterWireless = document.getElementById('filter-toggle-wireless');
    filterWireless?.addEventListener('change', (e) => {
      this.filters.showWireless = e.target.checked;
      this.applyCableFilter();
      this.map3DEngine?.setViewFilters?.({ showWireless: this.filters.showWireless });
    });

    const filterCoverage = document.getElementById('filter-toggle-coverage');
    filterCoverage?.addEventListener('change', (e) => {
      this.filters.showCoverage = e.target.checked;
      this.deviceManager.renderer.setCoverageVisibility(e.target.checked);
      this.map3DEngine?.setViewFilters?.({ showCoverage: this.filters.showCoverage });
    });

    const toggleBuildingLabels = document.getElementById('layer-toggle-building-labels');
    toggleBuildingLabels?.addEventListener('change', (e) => {
      this.map3DEngine?.setShowBuildingSignboards?.(Boolean(e.target.checked));
    });

    // Track hidden-layer / filter badge & quick reset inside Top Bar dropdown
    const allViewCheckboxes = document.querySelectorAll('#navbar-view-filter-dropdown input[type="checkbox"]');
    allViewCheckboxes.forEach((cb) => {
      cb.addEventListener('change', () => this.syncViewFilterBadge());
    });

    const resetBtn = document.getElementById('btn-view-filter-reset');
    resetBtn?.addEventListener('click', () => this.resetAllViewFilters());

    this.syncViewFilterBadge();
  }

  /** Updates badge counter on top-bar View dropdown showing how many layers/filters are hidden. */
  syncViewFilterBadge() {
    const badge = document.getElementById('badge-navbar-view-filter');
    if (!badge) return;
    const boxes = document.querySelectorAll('#navbar-view-filter-dropdown input[type="checkbox"]');
    let offCount = 0;
    boxes.forEach((cb) => {
      if (!cb.checked) offCount += 1;
    });
    badge.textContent = offCount > 0 ? String(offCount) : '';
    badge.classList.toggle('hidden', offCount === 0);
  }

  /** Re-enables all visibility layers, sub-filters & focus mode in one click. */
  resetAllViewFilters() {
    document.querySelectorAll('input[data-layer]').forEach((cb) => {
      if (!cb.checked) {
        cb.checked = true;
        stateManager.toggleLayer(cb.getAttribute('data-layer'), true);
      }
    });
    ['filter-toggle-cctv', 'filter-toggle-fiber', 'filter-toggle-wireless', 'filter-toggle-coverage', 'toggle-dim-bg-on-select', 'layer-toggle-building-labels'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.checked) {
        el.checked = true;
      }
    });
    this.filters.showCctv = true;
    this.filters.showFiber = true;
    this.filters.showWireless = true;
    this.filters.showCoverage = true;
    this.filters.dimOnSelection = true;
    this.applyDeviceFilter();
    this.applyCableFilter();
    this.deviceManager?.renderer?.setCoverageVisibility?.(true);
    if (this.mapEngine) {
      this.mapEngine.dimOnSelection = true;
      if (this.deviceManager?.selectedDeviceId || this.cableManager?.selectedCableId) {
        this.mapEngine.dimBackground();
      }
    }
    this.map3DEngine?.setShowLabels?.(true);
    this.map3DEngine?.setShowBuildingSignboards?.(true);
    this.map3DEngine?.setViewFilters?.({ ...this.filters });
    this.syncViewFilterBadge();
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

