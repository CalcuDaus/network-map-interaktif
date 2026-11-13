/**
 * NetMap — Interactive Network Topology Modal (Cytoscape.js)
 * Fullscreen visualizer for Physical (Dagre) and Logical (VLAN) topology
 */

import { TopologyGenerator } from './topology-generator.js';
import { TOPOLOGY_STYLESHEET, getDagreLayoutOptions } from './topology-layout.js';

export class TopologyModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('../ui/viewport-navigator.js').ViewportNavigator} options.viewportNavigator
   */
  constructor({ deviceManager, cableManager, viewportNavigator }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.viewportNavigator = viewportNavigator;

    this.generator = new TopologyGenerator(this.deviceManager, this.cableManager);
    this.cy = null;
    this.activeMode = 'physical'; // physical | logical
    this.modalEl = null;

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'network-topology-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      flex-direction: column;
    `;

    this.modalEl.innerHTML = `
      <!-- Modal Header -->
      <div style="height: 54px; border-bottom: 1px solid var(--border-light); background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="git-fork" style="width: 20px; height: 20px; color: var(--accent-sky);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Topologi Jaringan</span>
          </div>

          <!-- Mode Switcher -->
          <div class="segmented-control">
            <button id="topo-tab-physical" class="segmented-item active">
              <i data-lucide="network" style="width: 13px; height: 13px;"></i>
              <span>Topologi Fisik</span>
            </button>
            <button id="topo-tab-logical" class="segmented-item">
              <i data-lucide="layers" style="width: 13px; height: 13px;"></i>
              <span>Topologi Logis (VLAN)</span>
            </button>
          </div>
        </div>

        <!-- Controls -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="topo-btn-fit" class="btn btn-secondary btn-sm" title="Sesuaikan Tampilan">
            <i data-lucide="maximize" style="width: 13px; height: 13px;"></i>
            <span>Fit</span>
          </button>
          <button id="topo-btn-zoom-in" class="btn btn-icon btn-sm" title="Zoom In">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
          </button>
          <button id="topo-btn-zoom-out" class="btn btn-icon btn-sm" title="Zoom Out">
            <i data-lucide="minus" style="width: 14px; height: 14px;"></i>
          </button>
          <div class="divider-vertical"></div>
          <button id="topo-btn-export-png" class="btn btn-secondary btn-sm" title="Ekspor Gambar PNG">
            <i data-lucide="download" style="width: 13px; height: 13px;"></i>
            <span>Ekspor PNG</span>
          </button>
          <button id="topo-btn-close" class="btn btn-icon" title="Tutup Modal">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>
      </div>

      <!-- Main Cytoscape Viewport -->
      <div id="cy-topology-container" style="flex: 1; width: 100%; height: 100%; position: relative; background: var(--bg-primary);"></div>

      <!-- Bottom Inspector Bar inside Modal -->
      <div id="topo-inspector-bar" style="height: 48px; border-top: 1px solid var(--border-light); background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-size: 12px; color: var(--text-muted);">
        <div id="topo-selected-info" style="display: flex; align-items: center; gap: 12px;">
          <span>Klik node perangkat atau kabel pada diagram untuk melihat relasi.</span>
        </div>
        <div id="topo-focus-btn-container" style="display: none;">
          <button id="topo-btn-focus-map" class="btn btn-primary btn-sm">
            <i data-lucide="map-pin" style="width: 13px; height: 13px;"></i>
            <span>Fokus pada Denah Peta</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    // Open/Close
    document.getElementById('topo-btn-close')?.addEventListener('click', () => this.hide());

    // Switch Tabs
    const tabPhys = document.getElementById('topo-tab-physical');
    const tabLog = document.getElementById('topo-tab-logical');

    tabPhys?.addEventListener('click', () => {
      this.activeMode = 'physical';
      tabPhys.classList.add('active');
      tabLog?.classList.remove('active');
      this.renderGraph();
    });

    tabLog?.addEventListener('click', () => {
      this.activeMode = 'logical';
      tabLog.classList.add('active');
      tabPhys?.classList.remove('active');
      this.renderGraph();
    });

    // Zoom Controls
    document.getElementById('topo-btn-fit')?.addEventListener('click', () => {
      if (this.cy) this.cy.fit(undefined, 40);
    });

    document.getElementById('topo-btn-zoom-in')?.addEventListener('click', () => {
      if (this.cy) this.cy.zoom(this.cy.zoom() * 1.25);
    });

    document.getElementById('topo-btn-zoom-out')?.addEventListener('click', () => {
      if (this.cy) this.cy.zoom(this.cy.zoom() / 1.25);
    });

    // Export PNG
    document.getElementById('topo-btn-export-png')?.addEventListener('click', () => {
      if (!this.cy) return;
      const png64 = this.cy.png({ full: true, scale: 2, bg: '#0a0e17' });
      const a = document.createElement('a');
      a.href = png64;
      a.download = `netmap-topologi-${this.activeMode}-${Date.now()}.png`;
      a.click();
    });

    // ESC to close
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl.style.display === 'flex') {
        this.hide();
      }
    });
  }

  /**
   * Open and initialize topology modal
   */
  show() {
    this.modalEl.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
    this.initCytoscape();
  }

  /**
   * Hide topology modal
   */
  hide() {
    this.modalEl.style.display = 'none';
  }

  /**
   * Initialize or update Cytoscape graph
   */
  initCytoscape() {
    const container = document.getElementById('cy-topology-container');
    if (!container || !window.cytoscape) {
      console.warn('[TopologyModal] Cytoscape library not found on window');
      return;
    }

    if (!this.cy) {
      this.cy = window.cytoscape({
        container: container,
        style: TOPOLOGY_STYLESHEET,
        boxSelectionEnabled: false,
        wheelSensitivity: 0.25
      });

      // Node selection event
      this.cy.on('tap', 'node[!isGroup]', (e) => {
        const node = e.target;
        const devId = node.id();
        const dev = this.deviceManager.getDeviceById(devId);
        this.handleNodeSelected(dev);
      });

      // Background click
      this.cy.on('tap', (e) => {
        if (e.target === this.cy) {
          this.resetSelectedInfo();
        }
      });
    }

    this.renderGraph();
  }

  renderGraph() {
    if (!this.cy) return;

    this.cy.elements().remove();

    const elements = this.activeMode === 'logical'
      ? this.generator.generateLogicalElements()
      : this.generator.generatePhysicalElements();

    this.cy.add(elements);

    // Apply layout
    const layout = this.cy.layout(getDagreLayoutOptions('TB'));
    layout.run();
    this.cy.fit(undefined, 40);
  }

  handleNodeSelected(device) {
    if (!device) return;

    const infoEl = document.getElementById('topo-selected-info');
    const focusBtnContainer = document.getElementById('topo-focus-btn-container');

    if (infoEl) {
      infoEl.innerHTML = `
        <span style="font-weight: 700; color: #f8fafc;">${device.name}</span>
        <span style="color: var(--accent-sky); font-family: var(--font-mono);">${device.network?.ip || 'No IP'}</span>
        <span style="color: var(--text-muted);">${device.brand} ${device.model}</span>
        <span style="color: var(--text-muted);">Lokasi: ${device.location || '-'}</span>
      `;
    }

    if (focusBtnContainer) {
      focusBtnContainer.style.display = 'block';
      const focusBtn = document.getElementById('topo-btn-focus-map');
      if (focusBtn) {
        focusBtn.onclick = () => {
          this.hide();
          this.viewportNavigator.focusOnDevice(device, 1.4);
        };
      }
    }
  }

  resetSelectedInfo() {
    const infoEl = document.getElementById('topo-selected-info');
    const focusBtnContainer = document.getElementById('topo-focus-btn-container');

    if (infoEl) {
      infoEl.innerHTML = `<span>Klik node perangkat atau kabel pada diagram untuk melihat relasi.</span>`;
    }
    if (focusBtnContainer) {
      focusBtnContainer.style.display = 'none';
    }
  }
}

