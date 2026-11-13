/**
 * NetMap — IP Address Inventory (IPAM) & VLAN Documentation Modal
 * Structured tables and segmentation explorer
 */

import { DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';

export class IpVlanModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('./viewport-navigator.js').ViewportNavigator} options.viewportNavigator
   */
  constructor({ deviceManager, viewportNavigator }) {
    this.deviceManager = deviceManager;
    this.viewportNavigator = viewportNavigator;

    this.activeTab = 'ipam'; // ipam | vlan
    this.modalEl = null;

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'ip-vlan-documentation-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    `;

    this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 900px; height: 85vh; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i data-lucide="file-spreadsheet" style="width: 18px; height: 18px; color: var(--accent-sky);"></i>
              <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Dokumentasi IP & VLAN</span>
            </div>

            <!-- Tab Switcher -->
            <div class="segmented-control">
              <button id="ipam-tab-btn" class="segmented-item active">
                <i data-lucide="hash" style="width: 13px; height: 13px;"></i>
                <span>Tabel IP Address (IPAM)</span>
              </button>
              <button id="vlan-tab-btn" class="segmented-item">
                <i data-lucide="layers" style="width: 13px; height: 13px;"></i>
                <span>Segmentasi VLAN</span>
              </button>
            </div>
          </div>

          <button id="ip-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Filter / Search Subheader -->
        <div style="padding: 10px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div class="search-box" style="width: 280px;">
            <i data-lucide="search" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
            <input type="text" id="ip-table-search-input" placeholder="Filter IP, perangkat, atau VLAN...">
          </div>
          <span id="ip-table-count-label" style="font-size: 12px; color: var(--text-muted);">
            Menampilkan 0 data
          </span>
        </div>

        <!-- Content Area -->
        <div id="ip-modal-content" style="flex: 1; overflow-y: auto; padding: 16px;"></div>

      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    // Close button
    document.getElementById('ip-modal-btn-close')?.addEventListener('click', () => this.hide());

    // Switch Tabs
    const ipamTab = document.getElementById('ipam-tab-btn');
    const vlanTab = document.getElementById('vlan-tab-btn');

    ipamTab?.addEventListener('click', () => {
      this.activeTab = 'ipam';
      ipamTab.classList.add('active');
      vlanTab?.classList.remove('active');
      this.render();
    });

    vlanTab?.addEventListener('click', () => {
      this.activeTab = 'vlan';
      vlanTab.classList.add('active');
      ipamTab?.classList.remove('active');
      this.render();
    });

    // Search input
    document.getElementById('ip-table-search-input')?.addEventListener('input', (e) => {
      this.render(e.target.value);
    });

    // ESC to close
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl.style.display === 'flex') {
        this.hide();
      }
    });
  }

  show() {
    this.modalEl.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
    this.render();
  }

  hide() {
    this.modalEl.style.display = 'none';
  }

  render(filterQuery = '') {
    const content = document.getElementById('ip-modal-content');
    const countLabel = document.getElementById('ip-table-count-label');
    if (!content) return;

    const devices = this.deviceManager.getAllDevices();

    if (this.activeTab === 'ipam') {
      this.renderIpamTable(content, devices, filterQuery, countLabel);
    } else {
      this.renderVlanCards(content, devices, filterQuery, countLabel);
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderIpamTable(container, devices, filterQuery, countLabel) {
    // Filter devices with an IP
    let ipDevices = devices.filter((d) => d.network?.ip);

    if (filterQuery && filterQuery.trim() !== '') {
      const q = filterQuery.toLowerCase();
      ipDevices = ipDevices.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.network.ip.toLowerCase().includes(q) ||
        String(d.network.vlan).includes(q) ||
        (d.location && d.location.toLowerCase().includes(q))
      );
    }

    // Natural sort by IP address octets
    ipDevices.sort((a, b) => {
      const numA = a.network.ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
      const numB = b.network.ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
      return numA - numB;
    });

    if (countLabel) {
      countLabel.textContent = `Menampilkan ${ipDevices.length} dari ${devices.length} perangkat`;
    }

    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-light); color: var(--text-muted); font-size: 11px; text-transform: uppercase;">
            <th style="padding: 10px 12px;">IP Address</th>
            <th style="padding: 10px 12px;">Subnet</th>
            <th style="padding: 10px 12px;">Nama Perangkat</th>
            <th style="padding: 10px 12px;">Kategori</th>
            <th style="padding: 10px 12px;">VLAN</th>
            <th style="padding: 10px 12px;">Status</th>
            <th style="padding: 10px 12px;">Lokasi</th>
            <th style="padding: 10px 12px; text-align: right;">Aksi</th>
          </tr>
        </thead>
        <tbody>
    `;

    ipDevices.forEach((dev) => {
      const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;

      html += `
        <tr style="border-bottom: 1px solid var(--border-color); transition: background 120ms ease;">
          <td style="padding: 10px 12px; font-family: var(--font-mono); color: #38bdf8; font-weight: 600;">
            ${dev.network.ip}
          </td>
          <td style="padding: 10px 12px; font-family: var(--font-mono); color: var(--text-muted);">
            ${dev.network.subnet || '255.255.255.0'}
          </td>
          <td style="padding: 10px 12px; font-weight: 600; color: var(--text-primary);">
            ${this.escapeHtml(dev.name)}
          </td>
          <td style="padding: 10px 12px;">
            <span style="font-size: 10px; font-weight: 700; color: ${cat.color}; background: var(--bg-primary); padding: 2px 6px; border-radius: 4px;">
              ${cat.name}
            </span>
          </td>
          <td style="padding: 10px 12px; font-family: var(--font-mono); color: var(--text-secondary);">
            VLAN ${dev.network.vlan || 1}
          </td>
          <td style="padding: 10px 12px;">
            <span style="font-size: 10px; color: ${statusDef.color}; font-weight: 600;">
              ● ${statusDef.name}
            </span>
          </td>
          <td style="padding: 10px 12px; color: var(--text-muted);">
            ${this.escapeHtml(dev.location || '-')}
          </td>
          <td style="padding: 10px 12px; text-align: right;">
            <button class="btn btn-secondary btn-sm" data-goto-id="${dev.id}" style="font-size: 11px;">
              Fokus
            </button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;

    // Attach goto click
    container.querySelectorAll('[data-goto-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-goto-id');
        const dev = this.deviceManager.getDeviceById(id);
        if (dev) {
          this.hide();
          this.viewportNavigator.focusOnDevice(dev, 1.4);
        }
      });
    });
  }

  renderVlanCards(container, devices, filterQuery, countLabel) {
    const vlanMap = new Map();

    devices.forEach((dev) => {
      const vlanId = dev.network?.vlan || 1;
      if (!vlanMap.has(vlanId)) {
        vlanMap.set(vlanId, []);
      }
      vlanMap.get(vlanId).push(dev);
    });

    const vlanNames = {
      1: { name: 'Default Management VLAN', subnet: '192.168.1.0/24' },
      10: { name: 'Servers & IT Infrastructure', subnet: '192.168.1.0/24' },
      20: { name: 'Dosen & Staff Kantor', subnet: '192.168.20.0/24' },
      30: { name: 'Mahasiswa & Guest Wi-Fi', subnet: '192.168.30.0/24' },
      100: { name: 'CCTV Surveillance & Security', subnet: '192.168.100.0/24' }
    };

    if (countLabel) {
      countLabel.textContent = `Menampilkan ${vlanMap.size} segmen VLAN aktif`;
    }

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px;">`;

    Array.from(vlanMap.keys()).sort((a, b) => a - b).forEach((vlanId) => {
      const devs = vlanMap.get(vlanId);
      const meta = vlanNames[vlanId] || { name: `VLAN ${vlanId}`, subnet: 'Custom Subnet' };

      html += `
        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 700; color: #38bdf8; background: var(--bg-tertiary); padding: 3px 8px; border-radius: 4px; font-family: var(--font-mono);">
                VLAN ${vlanId}
              </span>
              <span style="font-size: 13px; font-weight: 700; color: var(--text-primary);">
                ${meta.name}
              </span>
            </div>
            <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
              ${meta.subnet}
            </span>
          </div>

          <div style="font-size: 11px; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
            <div style="font-weight: 600; color: var(--text-muted);">
              Perangkat Terhubung (${devs.length}):
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
      `;

      devs.forEach((dev) => {
        html += `
          <span style="background: var(--bg-tertiary); padding: 3px 8px; border-radius: 4px; font-size: 11px; color: #f8fafc; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" data-goto-id="${dev.id}" title="Klik untuk fokus di denah">
            <span>${this.escapeHtml(dev.name)}</span>
            <span style="color: var(--accent-sky); font-family: var(--font-mono); font-size: 10px;">(${dev.network?.ip || ''})</span>
          </span>
        `;
      });

      html += `
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Attach goto click
    container.querySelectorAll('[data-goto-id]').forEach((tag) => {
      tag.addEventListener('click', () => {
        const id = tag.getAttribute('data-goto-id');
        const dev = this.deviceManager.getDeviceById(id);
        if (dev) {
          this.hide();
          this.viewportNavigator.focusOnDevice(dev, 1.4);
        }
      });
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

