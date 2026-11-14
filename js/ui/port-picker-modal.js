/**
 * NetMap — Cisco Packet Tracer-Style Port Picker Modal
 * Muncul saat menarik kabel baru (2D/3D) atau dari panel properti kabel
 * untuk memetakan kabel ke port fisik spesifik (beserta validasi port terpakai & anchor 3D).
 */

import { eventBus } from '../core/event-bus.js';
import { getDefaultDevicePorts } from '../devices/device-schema.js';

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

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    if (typeof document === 'undefined') return;
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'port-picker-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop, rgba(24, 45, 18, 0.72));
      backdrop-filter: blur(6px);
      z-index: 1050;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: 'Poppins', sans-serif;
    `;

    this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color, #e5cca0); border-radius: 12px; width: 100%; max-width: 720px; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 22px 44px rgba(0,0,0,0.32); overflow: hidden;">
        <!-- Header -->
        <div style="height: 54px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 30px; height: 30px; border-radius: 7px; background: rgba(42, 124, 19, 0.16); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13);">
              <i data-lucide="plug-zap" style="width: 17px; height: 17px;"></i>
            </div>
            <div>
              <span style="font-size: 14.5px; font-weight: 700; color: var(--text-primary, #18350d); display: block; line-height: 1.2;">Pilih Interface / Port Koneksi (Packet Tracer Mode)</span>
              <span id="ppm-subtitle" style="font-size: 11px; color: var(--text-muted, #678458);">Hubungkan kabel ke soket port fisik spesifik pada kedua perangkat</span>
            </div>
          </div>
          <button id="btn-ppm-close" class="btn btn-icon btn-sm" title="Lewati / Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body: Two-Column Port Matrix -->
        <div style="padding: 16px 20px; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <!-- Source Column -->
          <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 9px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
              <div>
                <span style="font-size: 10px; font-weight: 700; color: var(--accent-sky, #0284c7); text-transform: uppercase;">PERANGKAT SUMBER (SOURCE)</span>
                <div id="ppm-src-device-name" style="font-size: 13px; font-weight: 700; color: var(--text-primary);">Source Device</div>
              </div>
              <button type="button" id="btn-ppm-edit-src-ports" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 3px 8px;" title="Atur / Scan Port 3D .GLB Perangkat Sumber">
                Atur Port 3D
              </button>
            </div>
            <div id="ppm-src-port-list" style="display: flex; flex-direction: column; gap: 5px; max-height: 270px; overflow-y: auto; padding-right: 2px;"></div>
            <div style="display: flex; flex-direction: column; gap: 3px; padding-top: 4px; border-top: 1px dashed var(--border-color);">
              <label style="font-size: 10px; color: var(--text-muted);">Port Sumber Terpilih / Kustom:</label>
              <input type="text" id="ppm-src-custom-input" placeholder="Contoh: ether1, Gi0/1, sfp-sfpplus1"
                     style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; color: var(--text-primary); font-family: var(--font-mono); font-weight: 600;">
            </div>
          </div>

          <!-- Destination Column -->
          <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 9px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
              <div>
                <span style="font-size: 10px; font-weight: 700; color: var(--accent-blue, #2a7c13); text-transform: uppercase;">PERANGKAT TUJUAN (DESTINATION)</span>
                <div id="ppm-dst-device-name" style="font-size: 13px; font-weight: 700; color: var(--text-primary);">Destination Device</div>
              </div>
              <button type="button" id="btn-ppm-edit-dst-ports" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 3px 8px;" title="Atur / Scan Port 3D .GLB Perangkat Tujuan">
                Atur Port 3D
              </button>
            </div>
            <div id="ppm-dst-port-list" style="display: flex; flex-direction: column; gap: 5px; max-height: 270px; overflow-y: auto; padding-right: 2px;"></div>
            <div style="display: flex; flex-direction: column; gap: 3px; padding-top: 4px; border-top: 1px dashed var(--border-color);">
              <label style="font-size: 10px; color: var(--text-muted);">Port Tujuan Terpilih / Kustom:</label>
              <input type="text" id="ppm-dst-custom-input" placeholder="Contoh: ether2, Gi0/24, sfp-sfpplus1"
                     style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; color: var(--text-primary); font-family: var(--font-mono); font-weight: 600;">
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="height: 54px; border-top: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <button type="button" id="btn-ppm-auto" class="btn btn-secondary btn-sm" title="Pilih otomatis port kosong pertama di kedua perangkat">
            <span>⚡ Auto-Pilih Port Kosong</span>
          </button>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" id="btn-ppm-skip" class="btn btn-secondary btn-sm">Simpan Tanpa Ganti</button>
            <button type="button" id="btn-ppm-apply" class="btn btn-primary btn-sm">
              <i data-lucide="check" style="width: 14px; height: 14px;"></i>
              <span>Hubungkan ke Port Terpilih</span>
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
   * Build map of occupied ports on a given device excluding activeCableId
   * @param {string} deviceId
   * @param {string} excludeCableId
   * @returns {Map<string, {cableName: string, peerName: string}>}
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

    // Pre-select existing port or first free port
    const firstFreeSrc = srcPorts.find((p) => !srcOccupied.has(p.name))?.name || '';
    const firstFreeDst = dstPorts.find((p) => !dstOccupied.has(p.name))?.name || '';

    this.selectedSrcPort = cable.details?.portSource || firstFreeSrc;
    this.selectedDstPort = cable.details?.portDestination || firstFreeDst;

    this.modalEl.querySelector('#ppm-src-device-name').textContent = `${srcDev.name} (${srcDev.type})`;
    this.modalEl.querySelector('#ppm-dst-device-name').textContent = `${dstDev.name} (${dstDev.type})`;
    this.modalEl.querySelector('#ppm-src-custom-input').value = this.selectedSrcPort;
    this.modalEl.querySelector('#ppm-dst-custom-input').value = this.selectedDstPort;

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
                class="ppm-port-btn"
                data-side="${side}"
                data-port-name="${p.name}"
                ${isOccupied ? 'disabled' : ''}
                style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 7px 10px; border-radius: 7px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); cursor: ${isOccupied ? 'not-allowed' : 'pointer'}; opacity: ${isOccupied ? '0.52' : '1'}; text-align: left; font-family: inherit; transition: all 0.12s ease;">
          <div style="display: flex; align-items: center; gap: 7px; min-width: 0;">
            <span style="width: 9px; height: 9px; border-radius: 50%; background: ${isOccupied ? '#ef4444' : '#22c55e'}; flex-shrink: 0;"></span>
            <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 700;">${p.name}</span>
            <span style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; background: ${badgeColor}22; color: ${badgeColor};">${p.type || 'rj45'} • ${p.speed || '1G'}</span>
          </div>
          <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap; margin-left: 6px;">
            ${isOccupied ? `Terpakai ➔ ${occ.peerName}` : coordText}
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
      btn.style.borderColor = isSelected ? 'var(--accent-blue, #2a7c13)' : 'var(--border-color)';
      btn.style.boxShadow = isSelected ? '0 0 0 2px rgba(42, 124, 19, 0.25)' : 'none';
      btn.style.background = isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)';
    });
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
      updates.name = `${srcDev.name} [${portSource}] ➔ ${dstDev.name} [${portDestination}]`;
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

