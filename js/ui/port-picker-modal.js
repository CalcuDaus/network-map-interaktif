/**
 * NetMap — Cisco Packet Tracer-Style Port Picker Modal (Mobile Portrait Wizard + Desktop 2-Column)
 * Muncul saat menarik kabel baru (2D/3D) atau dari panel properti kabel
 * untuk memetakan kabel ke port fisik spesifik (beserta validasi port terpakai & anchor 3D).
 * Di layar HP portrait (<= 680px), berubah otomatis menjadi Wizard 2-Langkah ramah jari (>= 44px).
 */

import { eventBus } from '../core/event-bus.js';
import { getDefaultDevicePorts } from '../devices/device-schema.js';
import { uiIcon } from '../utils/helpers.js';

export class PortPickerModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   */
  constructor({ deviceManager, cableManager }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.modalEl = null;
    this.activeCableId = null;
    this.selectedSrcPort = '';
    this.selectedDstPort = '';
    this.activeMobileStep = 'src'; // 'src' | 'dst'

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    if (typeof document === 'undefined') return;
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'port-picker-modal';
    this.modalEl.className = 'ppm-modal-overlay';
    this.modalEl.style.display = 'none';

    this.modalEl.innerHTML = `
      <div class="ppm-modal-card" data-active-step="src">
        <!-- Header -->
        <div class="ppm-header">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div class="ppm-header-icon">
              <i data-lucide="plug-zap" style="width: 17px; height: 17px;"></i>
            </div>
            <div style="min-width: 0;">
              <span class="ppm-title">Pilih Interface / Port Koneksi</span>
              <span id="ppm-subtitle" class="ppm-subtitle">Hubungkan kabel ke soket port fisik spesifik pada kedua perangkat</span>
            </div>
          </div>
          <button id="btn-ppm-close" class="btn btn-icon btn-sm" title="Lewati / Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Mobile Portrait 2-Step Wizard Tabs (visible <= 680px via CSS) -->
        <div id="ppm-mobile-steps" class="ppm-mobile-steps" role="tablist">
          <button type="button" class="ppm-step-tab active" data-ppm-step="src">
            <span class="ppm-step-num">1</span>
            <span class="ppm-step-label">Port Sumber</span>
            <span id="ppm-step-src-badge" class="ppm-step-badge">--</span>
          </button>
          <button type="button" class="ppm-step-tab" data-ppm-step="dst">
            <span class="ppm-step-num">2</span>
            <span class="ppm-step-label">Port Tujuan</span>
            <span id="ppm-step-dst-badge" class="ppm-step-badge">--</span>
          </button>
        </div>

        <!-- Body: Desktop Two-Column / Mobile Wizard Single-Column -->
        <div class="ppm-body-grid">
          <!-- Source Column -->
          <div class="ppm-col ppm-col-src">
            <div class="ppm-col-head">
              <div style="min-width: 0;">
                <span class="ppm-col-kicker is-src">PERANGKAT SUMBER (SOURCE)</span>
                <div id="ppm-src-device-name" class="ppm-col-devname">Source Device</div>
              </div>
              <button type="button" id="btn-ppm-edit-src-ports" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 3px 8px;" title="Atur / Scan Port 3D .GLB Perangkat Sumber">
                Atur Port 3D
              </button>
            </div>
            <div id="ppm-src-port-list" class="ppm-port-list"></div>
            <div class="ppm-custom-row">
              <label class="ppm-custom-label">Port Sumber Terpilih / Kustom:</label>
              <input type="text" id="ppm-src-custom-input" class="ppm-custom-input" placeholder="Contoh: ether1, Gi0/1, sfp-sfpplus1"
                     autocorrect="off" autocapitalize="off" autocomplete="off">
            </div>
          </div>

          <!-- Destination Column -->
          <div class="ppm-col ppm-col-dst">
            <div class="ppm-col-head">
              <div style="min-width: 0;">
                <span class="ppm-col-kicker is-dst">PERANGKAT TUJUAN (DESTINATION)</span>
                <div id="ppm-dst-device-name" class="ppm-col-devname">Destination Device</div>
              </div>
              <button type="button" id="btn-ppm-edit-dst-ports" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 3px 8px;" title="Atur / Scan Port 3D .GLB Perangkat Tujuan">
                Atur Port 3D
              </button>
            </div>
            <div id="ppm-dst-port-list" class="ppm-port-list"></div>
            <div class="ppm-custom-row">
              <label class="ppm-custom-label">Port Tujuan Terpilih / Kustom:</label>
              <input type="text" id="ppm-dst-custom-input" class="ppm-custom-input" placeholder="Contoh: ether2, Gi0/24, sfp-sfpplus1"
                     autocorrect="off" autocapitalize="off" autocomplete="off">
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="ppm-footer">
          <button type="button" id="btn-ppm-auto" class="btn btn-secondary btn-sm ppm-touch-btn" title="Pilih otomatis port kosong pertama di kedua perangkat">
            ${uiIcon('zap', 12)} <span>Auto-Pilih</span>
          </button>
          <div class="ppm-footer-right">
            <button type="button" id="btn-ppm-skip" class="btn btn-secondary btn-sm ppm-touch-btn">Lewati</button>
            <button type="button" id="btn-ppm-apply" class="btn btn-primary btn-sm ppm-touch-btn">
              <i data-lucide="check" style="width: 14px; height: 14px;"></i>
              <span>Hubungkan Kabel</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    if (!this.modalEl) return;
    this.modalEl.querySelector('#btn-ppm-close')?.addEventListener('click', () => this.hide());
    this.modalEl.querySelector('#btn-ppm-skip')?.addEventListener('click', () => this.hide());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.hide();
    });

    this.modalEl.querySelectorAll('[data-ppm-step]')?.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.setActiveMobileStep(tab.getAttribute('data-ppm-step') || 'src');
      });
    });

    this.modalEl.querySelector('#ppm-src-custom-input')?.addEventListener('input', (e) => {
      this.selectedSrcPort = e.target.value.trim();
      this.highlightActivePortButtons();
    });
    this.modalEl.querySelector('#ppm-dst-custom-input')?.addEventListener('input', (e) => {
      this.selectedDstPort = e.target.value.trim();
      this.highlightActivePortButtons();
    });

    this.modalEl.querySelector('#btn-ppm-auto')?.addEventListener('click', () => {
      this.autoSelectFirstAvailablePorts();
    });

    this.modalEl.querySelector('#btn-ppm-apply')?.addEventListener('click', () => {
      this.applyPortSelection();
    });

    this.modalEl.querySelector('#btn-ppm-edit-src-ports')?.addEventListener('click', () => {
      const cable = this.cableManager.getConnectionById(this.activeCableId);
      if (cable) {
        this.hide();
        eventBus.emit('modal:open-device-3d', { deviceId: cable.source });
      }
    });

    this.modalEl.querySelector('#btn-ppm-edit-dst-ports')?.addEventListener('click', () => {
      const cable = this.cableManager.getConnectionById(this.activeCableId);
      if (cable) {
        this.hide();
        eventBus.emit('modal:open-device-3d', { deviceId: cable.destination });
      }
    });

    eventBus.on('cable:prompt-port-picker', ({ cableId } = {}) => {
      if (cableId) this.show(cableId);
    });
  }

  /**
   * Switch active step in Mobile Portrait 2-Step Wizard ('src' | 'dst').
   */
  setActiveMobileStep(step = 'src') {
    const normalized = step === 'dst' ? 'dst' : 'src';
    this.activeMobileStep = normalized;
    const card = this.modalEl?.querySelector('.ppm-modal-card');
    if (card) card.setAttribute('data-active-step', normalized);
    this.modalEl?.querySelectorAll('[data-ppm-step]')?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-ppm-step') === normalized);
    });
  }

  _syncStepBadges() {
    const srcBadge = this.modalEl?.querySelector('#ppm-step-src-badge');
    const dstBadge = this.modalEl?.querySelector('#ppm-step-dst-badge');
    if (srcBadge) srcBadge.textContent = this.selectedSrcPort || 'Pilih';
    if (dstBadge) dstBadge.textContent = this.selectedDstPort || 'Pilih';
  }

  /**
   * Build map of occupied ports on a given device excluding activeCableId
   */
  getOccupiedPortsMap(deviceId, excludeCableId) {
    const map = new Map();
    const cables = this.cableManager.getAllConnections();
    cables.forEach((cab) => {
      if (cab.id === excludeCableId) return;
      if (cab.source === deviceId && cab.details?.portSource) {
        const peer = this.deviceManager.getDeviceById(cab.destination);
        map.set(cab.details.portSource, {
          cableName: cab.name,
          peerName: peer ? peer.name : cab.destination
        });
      }
      if (cab.destination === deviceId && cab.details?.portDestination) {
        const peer = this.deviceManager.getDeviceById(cab.source);
        map.set(cab.details.portDestination, {
          cableName: cab.name,
          peerName: peer ? peer.name : cab.source
        });
      }
    });
    return map;
  }

  getDevicePorts(device) {
    if (!device) return [];
    return Array.isArray(device.ports) && device.ports.length > 0
      ? device.ports
      : getDefaultDevicePorts(device.type);
  }

  show(cableId) {
    if (!this.modalEl) return;
    const cable = this.cableManager.getConnectionById(cableId);
    if (!cable) return;

    const srcDev = this.deviceManager.getDeviceById(cable.source);
    const dstDev = this.deviceManager.getDeviceById(cable.destination);
    if (!srcDev || !dstDev) return;

    this.activeCableId = cable.id;
    const srcPorts = this.getDevicePorts(srcDev);
    const dstPorts = this.getDevicePorts(dstDev);
    const srcOccupied = this.getOccupiedPortsMap(srcDev.id, cable.id);
    const dstOccupied = this.getOccupiedPortsMap(dstDev.id, cable.id);

    const firstFreeSrc = srcPorts.find((p) => !srcOccupied.has(p.name))?.name || '';
    const firstFreeDst = dstPorts.find((p) => !dstOccupied.has(p.name))?.name || '';

    this.selectedSrcPort = cable.details?.portSource || firstFreeSrc;
    this.selectedDstPort = cable.details?.portDestination || firstFreeDst;

    this.modalEl.querySelector('#ppm-src-device-name').textContent = `${srcDev.name} (${srcDev.type})`;
    this.modalEl.querySelector('#ppm-dst-device-name').textContent = `${dstDev.name} (${dstDev.type})`;
    this.modalEl.querySelector('#ppm-src-custom-input').value = this.selectedSrcPort;
    this.modalEl.querySelector('#ppm-dst-custom-input').value = this.selectedDstPort;

    this.setActiveMobileStep('src');
    this.renderPortColumn('src', srcPorts, srcOccupied);
    this.renderPortColumn('dst', dstPorts, dstOccupied);

    this.modalEl.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  }

  renderPortColumn(side, ports, occupiedMap) {
    const listEl = this.modalEl.querySelector(side === 'src' ? '#ppm-src-port-list' : '#ppm-dst-port-list');
    if (!listEl) return;

    const typeColors = {
      'rj45': '#2563eb',
      'sfp+': '#0284c7',
      'sfp': '#0284c7',
      'fiber': '#0d9488',
      'wireless': '#16a34a',
      'coax': '#d97706'
    };

    listEl.innerHTML = ports.map((p) => {
      const occ = occupiedMap.get(p.name);
      const isOccupied = Boolean(occ);
      const badgeColor = typeColors[p.type] || '#475569';
      const coordText = p.local3d ? `(${p.local3d.x}, ${p.local3d.y}, ${p.local3d.z})` : '';

      return `
        <button type="button"
                class="ppm-port-btn ${isOccupied ? 'is-occupied' : ''}"
                data-side="${side}"
                data-port-name="${p.name}"
                ${isOccupied ? 'disabled' : ''}>
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
            <span class="ppm-port-led ${isOccupied ? 'is-busy' : 'is-free'}"></span>
            <span style="font-family: var(--font-mono); font-size: 12.5px; font-weight: 700;">${p.name}</span>
            <span style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: ${badgeColor}22; color: ${badgeColor};">${p.type || 'rj45'} • ${p.speed || '1G'}</span>
          </div>
          <div style="font-size: 10.5px; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap; margin-left: 6px;">
            ${isOccupied ? `Terpakai → ${occ.peerName}` : coordText}
          </div>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('.ppm-port-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const portName = btn.getAttribute('data-port-name') || '';
        if (side === 'src') {
          this.selectedSrcPort = portName;
          this.modalEl.querySelector('#ppm-src-custom-input').value = portName;
          // Auto-advance to Step 2 in Mobile Portrait Wizard
          if (typeof window !== 'undefined' && window.innerWidth <= 680) {
            this.setActiveMobileStep('dst');
          }
        } else {
          this.selectedDstPort = portName;
          this.modalEl.querySelector('#ppm-dst-custom-input').value = portName;
        }
        this.highlightActivePortButtons();
      });
    });

    this.highlightActivePortButtons();
  }

  highlightActivePortButtons() {
    if (!this.modalEl) return;
    this.modalEl.querySelectorAll('.ppm-port-btn').forEach((btn) => {
      const side = btn.getAttribute('data-side');
      const portName = btn.getAttribute('data-port-name');
      const isSelected = (side === 'src' && portName === this.selectedSrcPort) ||
                         (side === 'dst' && portName === this.selectedDstPort);
      btn.classList.toggle('is-selected', isSelected);
    });
    this._syncStepBadges();
  }

  autoSelectFirstAvailablePorts() {
    const cable = this.cableManager.getConnectionById(this.activeCableId);
    if (!cable) return;
    const srcDev = this.deviceManager.getDeviceById(cable.source);
    const dstDev = this.deviceManager.getDeviceById(cable.destination);
    const srcPorts = this.getDevicePorts(srcDev);
    const dstPorts = this.getDevicePorts(dstDev);
    const srcOccupied = this.getOccupiedPortsMap(srcDev.id, cable.id);
    const dstOccupied = this.getOccupiedPortsMap(dstDev.id, cable.id);

    this.selectedSrcPort = srcPorts.find((p) => !srcOccupied.has(p.name))?.name || '';
    this.selectedDstPort = dstPorts.find((p) => !dstOccupied.has(p.name))?.name || '';
    this.modalEl.querySelector('#ppm-src-custom-input').value = this.selectedSrcPort;
    this.modalEl.querySelector('#ppm-dst-custom-input').value = this.selectedDstPort;
    this.highlightActivePortButtons();
  }

  applyPortSelection() {
    const cable = this.cableManager.getConnectionById(this.activeCableId);
    if (!cable) {
      this.hide();
      return;
    }

    const portSource = (this.modalEl.querySelector('#ppm-src-custom-input')?.value || this.selectedSrcPort || '').trim();
    const portDestination = (this.modalEl.querySelector('#ppm-dst-custom-input')?.value || this.selectedDstPort || '').trim();

    const srcDev = this.deviceManager.getDeviceById(cable.source);
    const dstDev = this.deviceManager.getDeviceById(cable.destination);
    const srcPortObj = this.getDevicePorts(srcDev).find((p) => p.name === portSource);
    const dstPortObj = this.getDevicePorts(dstDev).find((p) => p.name === portDestination);

    const nextDetails = {
      ...(cable.details || {}),
      portSource,
      portDestination
    };

    const updates = { details: nextDetails };

    // Auto-match fiber/SFP+ media category if both selected ports are optical/SFP+
    const isOptical = (p) => p && (p.type === 'sfp+' || p.type === 'sfp' || p.type === 'fiber');
    if (isOptical(srcPortObj) && isOptical(dstPortObj) && cable.cableCategory === 'cat6') {
      updates.type = 'fiber';
      updates.cableCategory = 'fiber-sm';
    }

    if (portSource && portDestination && srcDev && dstDev) {
      updates.name = `${srcDev.name} [${portSource}] -> ${dstDev.name} [${portDestination}]`;
    }

    this.cableManager.updateConnection(cable.id, updates);
    this.cableManager.selectConnection(cable.id);
    this.hide();
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }
}
