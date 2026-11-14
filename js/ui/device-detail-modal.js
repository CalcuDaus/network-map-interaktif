/**
 * NetMap — Device Detail, Inventory & Network Config Modal
 * Structured school asset documentation (purchase year, DAK/BOS funding source,
 * hardware specifications) & full IP/VLAN/SSID configuration viewer and editor.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { DEVICE_CATEGORIES, DEVICE_STATUSES, getDeviceDefByType } from '../devices/device-library.js';
import { getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import {
  FUNDING_SOURCE_PRESETS,
  DEVICE_CONDITION_OPTIONS,
  getDefaultHardwareSpecs,
  validateIp,
  validateMac,
  validateVlan
} from '../devices/device-schema.js';
import { CABLE_CATEGORIES } from '../connections/cable-library.js';

const SUBNET_PRESETS = [
  { label: '/24 (255.255.255.0)', mask: '255.255.255.0' },
  { label: '/25 (255.255.255.128)', mask: '255.255.255.128' },
  { label: '/23 (255.255.254.0)', mask: '255.255.254.0' },
  { label: '/16 (255.255.0.0)', mask: '255.255.0.0' }
];

const YEAR_PRESETS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];

export class DeviceDetailModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} [options.cableManager]
   * @param {import('./viewport-navigator.js').ViewportNavigator} [options.viewportNavigator]
   */
  constructor({ deviceManager, cableManager = null, viewportNavigator = null }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.viewportNavigator = viewportNavigator;

    this.modalEl = null;
    this.currentDeviceId = null;
    this.activeTab = 'overview'; // 'overview' | 'inventory' | 'network' | 'ports'
    this.draft = null;
    this._statusTimer = null;

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'device-detail-modal';
    this.modalEl.className = 'ddm-backdrop';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10050;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background-color: rgba(15, 23, 42, 0.62);
      backdrop-filter: blur(6px);
    `;
    this.modalEl.setAttribute('aria-hidden', 'true');

    this.modalEl.innerHTML = `
      <div class="ddm-dialog" role="dialog" aria-modal="true" aria-labelledby="ddm-title">
        <!-- Modal Header -->
        <div class="ddm-header">
          <div class="ddm-header-left">
            <div id="ddm-icon-box" class="ddm-icon-box"></div>
            <div class="ddm-title-wrap">
              <div class="ddm-title-row">
                <h2 id="ddm-title" class="ddm-title">Detail Perangkat</h2>
                <span id="ddm-status-badge" class="ddm-badge"></span>
                <span id="ddm-category-badge" class="ddm-badge"></span>
              </div>
              <div id="ddm-subtitle" class="ddm-subtitle"></div>
            </div>
          </div>

          <div class="ddm-header-actions">
            <button type="button" id="btn-dd-close" class="btn btn-icon btn-sm" title="Tutup (Esc)">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        </div>

        <!-- Tab Navigation Bar -->
        <div class="ddm-tabs" role="tablist">
          <button type="button" class="ddm-tab-btn active" data-dd-tab="overview" role="tab">
            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>
            <span>Ringkasan &amp; Lembar Info</span>
          </button>
          <button type="button" class="ddm-tab-btn" data-dd-tab="inventory" role="tab">
            <i data-lucide="briefcase" style="width: 14px; height: 14px;"></i>
            <span>Inventaris, Anggaran &amp; Spek</span>
          </button>
          <button type="button" class="ddm-tab-btn" data-dd-tab="network" role="tab">
            <i data-lucide="wifi" style="width: 14px; height: 14px;"></i>
            <span>Konfigurasi IP, VLAN &amp; SSID</span>
          </button>
          <button type="button" class="ddm-tab-btn" data-dd-tab="ports" role="tab">
            <i data-lucide="network" style="width: 14px; height: 14px;"></i>
            <span>Port Fisik &amp; Kabel</span>
          </button>
        </div>

        <!-- Scrollable Body -->
        <div id="ddm-body" class="ddm-body"></div>

        <!-- Footer Bar -->
        <div class="ddm-footer">
          <div class="ddm-footer-left">
            <button type="button" id="btn-dd-copy-summary" class="btn btn-secondary btn-sm" title="Salin ringkasan lengkap ke clipboard">
              <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
              <span>Salin Ringkasan</span>
            </button>
            <button type="button" id="btn-dd-focus" class="btn btn-secondary btn-sm" title="Pusatkan kamera ke perangkat ini">
              <i data-lucide="crosshair" style="width: 13px; height: 13px;"></i>
              <span>Fokus di Peta</span>
            </button>
            <span id="ddm-feedback-msg" class="ddm-feedback-msg" aria-live="polite"></span>
          </div>
          <div class="ddm-footer-right">
            <button type="button" id="btn-dd-close-footer" class="btn btn-secondary btn-sm">
              Tutup
            </button>
            <button type="button" id="btn-dd-save" class="btn btn-primary btn-sm">
              <i data-lucide="check" style="width: 14px; height: 14px;"></i>
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    eventBus.on('modal:open-device-detail', ({ deviceId, device, tab } = {}) => {
      const targetId = deviceId || device?.id || this.deviceManager?.selectedDeviceId;
      if (targetId) {
        this.show(targetId, tab || 'overview');
      }
    });

    this.modalEl.querySelector('#btn-dd-close')?.addEventListener('click', () => this.hide());
    this.modalEl.querySelector('#btn-dd-close-footer')?.addEventListener('click', () => this.hide());

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.hide();
      }
    });

    this.modalEl.querySelectorAll('.ddm-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = btn.getAttribute('data-dd-tab');
        if (!nextTab) return;
        this.captureCurrentTabInputs();
        this.switchTab(nextTab);
      });
    });

    this.modalEl.querySelector('#btn-dd-save')?.addEventListener('click', () => {
      this.saveChanges();
    });

    this.modalEl.querySelector('#btn-dd-copy-summary')?.addEventListener('click', () => {
      this.captureCurrentTabInputs();
      this.copySummaryToClipboard();
    });

    this.modalEl.querySelector('#btn-dd-focus')?.addEventListener('click', () => {
      const dev = this.deviceManager?.getDeviceById(this.currentDeviceId);
      if (!dev) return;
      this.hide();
      if (stateManager.getViewMode() === '3d') {
        eventBus.emit('map3d:focus-device', { deviceId: dev.id });
      } else if (this.viewportNavigator) {
        this.viewportNavigator.focusOnDevice(dev, 1.4);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.hide();
      }
    });
  }

  isOpen() {
    return this.modalEl && this.modalEl.style.display === 'flex';
  }

  /**
   * Open modal for a device at the requested tab.
   * @param {string} deviceId
   * @param {'overview'|'inventory'|'network'|'ports'} [tab='overview']
   */
  show(deviceId, tab = 'overview') {
    const dev = this.deviceManager?.getDeviceById(deviceId);
    if (!dev) return;

    if (this.modalEl && typeof document !== 'undefined' && document.body && !document.body.contains?.(this.modalEl)) {
      document.body.appendChild(this.modalEl);
    }

    this.currentDeviceId = dev.id;
    this.draft = this.cloneDeviceDraft(dev);
    this.modalEl.style.display = 'flex';
    this.modalEl.setAttribute('aria-hidden', 'false');

    this.updateHeader(this.draft);
    this.switchTab(tab || 'overview');

    const body = this.modalEl.querySelector?.('#ddm-body');
    if (body) body.scrollTop = 0;
  }

  hide() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'none';
    this.modalEl.setAttribute('aria-hidden', 'true');
  }

  cloneDeviceDraft(dev) {
    const inv = dev.inventory || {};
    const sp = dev.specs || {};
    const net = dev.network || {};
    return {
      id: dev.id,
      name: dev.name || 'Perangkat',
      type: dev.type || 'router',
      category: dev.category || 'core',
      brand: dev.brand || '',
      model: dev.model || '',
      status: dev.status || 'unknown',
      location: dev.location || '',
      firmware: dev.firmware || '',
      installedAt: dev.installedAt || '',
      notes: dev.notes || '',
      customImage: dev.customImage || '',
      customIcon: dev.customIcon || '',
      ports: Array.isArray(dev.ports) ? dev.ports.map((p) => ({ ...p })) : [],
      spatial3d: { ...(dev.spatial3d || {}) },
      inventory: {
        purchaseYear: String(inv.purchaseYear ?? ''),
        fundingSource: String(inv.fundingSource ?? ''),
        inventoryCode: String(inv.inventoryCode ?? ''),
        condition: inv.condition || 'baik',
        serialNumber: String(inv.serialNumber ?? ''),
        unitPrice: String(inv.unitPrice ?? ''),
        vendor: String(inv.vendor ?? ''),
        responsiblePerson: String(inv.responsiblePerson ?? '')
      },
      specs: {
        processor: String(sp.processor ?? ''),
        ramStorage: String(sp.ramStorage ?? ''),
        portsSummary: String(sp.portsSummary ?? ''),
        powerSupply: String(sp.powerSupply ?? ''),
        throughput: String(sp.throughput ?? ''),
        dimensions: String(sp.dimensions ?? ''),
        summary: String(sp.summary ?? '')
      },
      network: {
        ip: net.ip || '',
        subnet: net.subnet || '255.255.255.0',
        gateway: net.gateway || '',
        dns: net.dns || '',
        connectionMode: net.connectionMode || 'static',
        vlan: net.vlan !== undefined ? Number(net.vlan) : 1,
        vlanList: net.vlanList || '',
        mac: net.mac || '',
        hostname: net.hostname || '',
        ssid: net.ssid || '',
        ssidSecondary: net.ssidSecondary || '',
        wifiBand: net.wifiBand || '',
        wifiChannel: net.wifiChannel || '',
        wifiSecurity: net.wifiSecurity || '',
        wifiPasswordHint: net.wifiPasswordHint || '',
        managementAccess: net.managementAccess || '',
        managementUser: net.managementUser || '',
        services: net.services || '',
        configSnippet: net.configSnippet || ''
      }
    };
  }

  updateHeader(dev) {
    const iconBox = this.modalEl.querySelector('#ddm-icon-box');
    const titleEl = this.modalEl.querySelector('#ddm-title');
    const subEl = this.modalEl.querySelector('#ddm-subtitle');
    const statusBadge = this.modalEl.querySelector('#ddm-status-badge');
    const catBadge = this.modalEl.querySelector('#ddm-category-badge');

    const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
    const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;
    const devDef = getDeviceDefByType(dev.type);

    if (iconBox) {
      if (dev.customImage) {
        iconBox.innerHTML = `<img src="${this.escapeAttr(dev.customImage)}" alt="${this.escapeAttr(dev.name)}">`;
      } else {
        const iconKey = dev.customIcon || getDefaultIconForType(dev.type);
        iconBox.innerHTML = getDeviceIconSvg(iconKey, { color: cat.color || '#2a7c13', size: 24 });
      }
    }

    if (titleEl) {
      titleEl.textContent = dev.name || 'Perangkat Jaringan';
    }

    if (statusBadge) {
      statusBadge.textContent = `● ${statusDef.name || 'Unknown'}`;
      statusBadge.style.color = statusDef.color || '#64748b';
      statusBadge.style.background = statusDef.bg || 'rgba(100,116,139,0.15)';
      statusBadge.style.borderColor = `${statusDef.color || '#64748b'}44`;
    }

    if (catBadge) {
      catBadge.textContent = cat.name || dev.category;
      catBadge.style.color = cat.color || '#2a7c13';
      catBadge.style.background = cat.badgeBg || 'rgba(42,124,19,0.12)';
      catBadge.style.borderColor = `${cat.color || '#2a7c13'}44`;
    }

    if (subEl) {
      const modelLabel = [dev.brand, dev.model].filter(Boolean).join(' ') || devDef?.name || dev.type;
      const parts = [modelLabel];
      if (dev.inventory?.purchaseYear) parts.push(`Thn ${dev.inventory.purchaseYear}`);
      if (dev.inventory?.fundingSource) parts.push(`Anggaran: ${dev.inventory.fundingSource}`);
      if (dev.network?.ip) parts.push(`IP: ${dev.network.ip}`);
      if (dev.network?.ssid) parts.push(`SSID: ${dev.network.ssid}`);
      subEl.textContent = parts.join(' • ');
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    this.modalEl.querySelectorAll('.ddm-tab-btn').forEach((btn) => {
      const isActive = btn.getAttribute('data-dd-tab') === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const body = this.modalEl.querySelector('#ddm-body');
    if (!body || !this.draft) return;

    if (tabName === 'overview') {
      body.innerHTML = this.renderOverviewTab(this.draft);
      this.bindOverviewTabEvents(body);
    } else if (tabName === 'inventory') {
      body.innerHTML = this.renderInventoryTab(this.draft);
      this.bindInventoryTabEvents(body);
    } else if (tabName === 'network') {
      body.innerHTML = this.renderNetworkTab(this.draft);
      this.bindNetworkTabEvents(body);
    } else if (tabName === 'ports') {
      body.innerHTML = this.renderPortsTab(this.draft);
      this.bindPortsTabEvents(body);
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.modalEl });
    }
  }

  captureCurrentTabInputs() {
    if (!this.draft) return;
    const q = (id) => this.modalEl.querySelector(`#${id}`);

    if (this.activeTab === 'inventory') {
      this.draft.inventory.purchaseYear = q('dd-inv-year')?.value.trim() ?? this.draft.inventory.purchaseYear;
      this.draft.inventory.fundingSource = q('dd-inv-funding')?.value.trim() ?? this.draft.inventory.fundingSource;
      this.draft.inventory.inventoryCode = q('dd-inv-code')?.value.trim() ?? this.draft.inventory.inventoryCode;
      this.draft.inventory.condition = q('dd-inv-condition')?.value ?? this.draft.inventory.condition;
      this.draft.inventory.serialNumber = q('dd-inv-sn')?.value.trim() ?? this.draft.inventory.serialNumber;
      this.draft.inventory.unitPrice = q('dd-inv-price')?.value.trim() ?? this.draft.inventory.unitPrice;
      this.draft.inventory.vendor = q('dd-inv-vendor')?.value.trim() ?? this.draft.inventory.vendor;
      this.draft.inventory.responsiblePerson = q('dd-inv-pic')?.value.trim() ?? this.draft.inventory.responsiblePerson;

      this.draft.location = q('dd-location')?.value.trim() ?? this.draft.location;
      this.draft.installedAt = q('dd-installed')?.value ?? this.draft.installedAt;
      this.draft.brand = q('dd-brand')?.value.trim() ?? this.draft.brand;
      this.draft.model = q('dd-model')?.value.trim() ?? this.draft.model;
      this.draft.firmware = q('dd-firmware')?.value.trim() ?? this.draft.firmware;

      this.draft.specs.processor = q('dd-spec-cpu')?.value.trim() ?? this.draft.specs.processor;
      this.draft.specs.ramStorage = q('dd-spec-ram')?.value.trim() ?? this.draft.specs.ramStorage;
      this.draft.specs.portsSummary = q('dd-spec-ports')?.value.trim() ?? this.draft.specs.portsSummary;
      this.draft.specs.powerSupply = q('dd-spec-power')?.value.trim() ?? this.draft.specs.powerSupply;
      this.draft.specs.throughput = q('dd-spec-throughput')?.value.trim() ?? this.draft.specs.throughput;
      this.draft.specs.dimensions = q('dd-spec-dim')?.value.trim() ?? this.draft.specs.dimensions;
      this.draft.specs.summary = q('dd-spec-summary')?.value.trim() ?? this.draft.specs.summary;
    } else if (this.activeTab === 'network') {
      this.draft.network.ip = q('dd-net-ip')?.value.trim() ?? this.draft.network.ip;
      this.draft.network.subnet = q('dd-net-subnet')?.value.trim() || '255.255.255.0';
      this.draft.network.gateway = q('dd-net-gateway')?.value.trim() ?? this.draft.network.gateway;
      this.draft.network.dns = q('dd-net-dns')?.value.trim() ?? this.draft.network.dns;
      this.draft.network.connectionMode = q('dd-net-mode')?.value ?? this.draft.network.connectionMode;
      const vlanVal = q('dd-net-vlan')?.value;
      if (vlanVal !== undefined && vlanVal !== '') {
        this.draft.network.vlan = parseInt(vlanVal, 10) || 1;
      }
      this.draft.network.vlanList = q('dd-net-vlan-list')?.value.trim() ?? this.draft.network.vlanList;
      this.draft.network.mac = q('dd-net-mac')?.value.trim() ?? this.draft.network.mac;
      this.draft.network.hostname = q('dd-net-hostname')?.value.trim() ?? this.draft.network.hostname;

      this.draft.network.ssid = q('dd-net-ssid')?.value.trim() ?? this.draft.network.ssid;
      this.draft.network.ssidSecondary = q('dd-net-ssid2')?.value.trim() ?? this.draft.network.ssidSecondary;
      this.draft.network.wifiBand = q('dd-net-wifi-band')?.value ?? this.draft.network.wifiBand;
      this.draft.network.wifiChannel = q('dd-net-wifi-channel')?.value.trim() ?? this.draft.network.wifiChannel;
      this.draft.network.wifiSecurity = q('dd-net-wifi-security')?.value ?? this.draft.network.wifiSecurity;
      this.draft.network.wifiPasswordHint = q('dd-net-wifi-pass')?.value.trim() ?? this.draft.network.wifiPasswordHint;

      this.draft.network.managementAccess = q('dd-net-mgmt')?.value.trim() ?? this.draft.network.managementAccess;
      this.draft.network.managementUser = q('dd-net-mgmt-user')?.value.trim() ?? this.draft.network.managementUser;
      this.draft.network.services = q('dd-net-services')?.value.trim() ?? this.draft.network.services;
      this.draft.network.configSnippet = q('dd-net-config-snippet')?.value ?? this.draft.network.configSnippet;
      this.draft.notes = q('dd-notes')?.value.trim() ?? this.draft.notes;
    }

    this.updateHeader(this.draft);
  }

  getConnectedCableLinks(deviceId) {
    const cables = this.cableManager?.getConnectionsByDeviceId?.(deviceId) || [];
    return cables.map((cab) => {
      const isSource = cab.source === deviceId;
      const peerId = isSource ? cab.destination : cab.source;
      const peerDev = this.deviceManager?.getDeviceById(peerId);
      const localPort = isSource ? cab.sourcePort : cab.destinationPort;
      const peerPort = isSource ? cab.destinationPort : cab.sourcePort;
      const catDef = CABLE_CATEGORIES[cab.category] || CABLE_CATEGORIES.cat6;
      return {
        cable: cab,
        localPort: localPort || '',
        peerPort: peerPort || '',
        peerName: peerDev ? peerDev.name : peerId,
        peerIp: peerDev?.network?.ip || '',
        cableTypeName: catDef?.name || cab.category || 'Kabel',
        lengthStr: cab.length ? `${cab.length.toFixed(1)} m` : '-'
      };
    });
  }

  renderKvRow(label, value, { mono = false, badgeColor = null, mutedIfEmpty = true } = {}) {
    const hasVal = value !== undefined && value !== null && String(value).trim() !== '';
    const display = hasVal ? this.escapeHtml(String(value)) : 'Belum diisi';
    let valHtml = '';
    if (hasVal && badgeColor) {
      valHtml = `<span class="ddm-kv-pill" style="color: ${badgeColor}; background: ${badgeColor}1a; border-color: ${badgeColor}44;">${display}</span>`;
    } else {
      valHtml = `<span class="ddm-kv-val ${mono ? 'mono' : ''} ${(!hasVal && mutedIfEmpty) ? 'is-empty' : ''}">${display}</span>`;
    }
    return `
      <div class="ddm-kv-row">
        <span class="ddm-kv-label">${this.escapeHtml(label)}</span>
        ${valHtml}
      </div>
    `;
  }

  renderOverviewTab(dev) {
    const inv = dev.inventory || {};
    const sp = dev.specs || {};
    const net = dev.network || {};
    const defaultSpecs = getDefaultHardwareSpecs(dev);
    const condObj = DEVICE_CONDITION_OPTIONS.find((c) => c.id === inv.condition) || DEVICE_CONDITION_OPTIONS[0];
    const fundingBadgeColor = getFundingBadgeColor(inv.fundingSource);
    const links = this.getConnectedCableLinks(dev.id);
    const hasCustomSpecs = Boolean(
      sp.processor || sp.ramStorage || sp.portsSummary || sp.powerSupply || sp.throughput || sp.dimensions || sp.summary
    );

    const specDisplay = {
      processor: sp.processor || defaultSpecs.processor,
      ramStorage: sp.ramStorage || defaultSpecs.ramStorage,
      portsSummary: sp.portsSummary || defaultSpecs.portsSummary,
      powerSupply: sp.powerSupply || defaultSpecs.powerSupply,
      throughput: sp.throughput || defaultSpecs.throughput,
      dimensions: sp.dimensions || defaultSpecs.dimensions,
      summary: sp.summary || defaultSpecs.summary
    };

    const linksHtml = links.length > 0
      ? links.map((l) => `
          <div class="ddm-link-row">
            <div class="ddm-link-main">
              <span class="ddm-link-port">${this.escapeHtml(l.localPort || 'Auto')}</span>
              <span style="color: var(--text-muted); font-size: 11px;">→</span>
              <span class="ddm-link-peer">${this.escapeHtml(l.peerName)}</span>
              ${l.peerPort ? `<span class="ddm-link-port">${this.escapeHtml(l.peerPort)}</span>` : ''}
            </div>
            <div class="ddm-link-meta">
              ${this.escapeHtml(l.cableTypeName)} • ${l.lengthStr}${l.peerIp ? ` • ${this.escapeHtml(l.peerIp)}` : ''}
            </div>
          </div>
        `).join('')
      : `<div class="ddm-empty-inline">Belum ada jalur kabel terhubung ke perangkat ini.</div>`;

    return `
      <div class="ddm-overview-highlights">
        <div class="ddm-stat-box">
          <span class="ddm-stat-label">Tahun Pembelian</span>
          <span class="ddm-stat-value">${inv.purchaseYear ? this.escapeHtml(inv.purchaseYear) : '<em class="muted">-</em>'}</span>
        </div>
        <div class="ddm-stat-box">
          <span class="ddm-stat-label">Sumber Anggaran</span>
          <span class="ddm-stat-value">
            ${inv.fundingSource
              ? `<span class="ddm-kv-pill" style="color: ${fundingBadgeColor}; background: ${fundingBadgeColor}1a; border-color: ${fundingBadgeColor}44;">${this.escapeHtml(inv.fundingSource)}</span>`
              : '<em class="muted">-</em>'}
          </span>
        </div>
        <div class="ddm-stat-box">
          <span class="ddm-stat-label">Alamat IP / VLAN</span>
          <span class="ddm-stat-value mono">${net.ip ? this.escapeHtml(net.ip) : '<em class="muted">Tanpa IP</em>'}${net.vlan ? ` (VLAN ${net.vlan})` : ''}</span>
        </div>
        <div class="ddm-stat-box">
          <span class="ddm-stat-label">SSID / Mode</span>
          <span class="ddm-stat-value">${net.ssid ? this.escapeHtml(net.ssid) : this.escapeHtml((net.connectionMode || 'static').toUpperCase())}</span>
        </div>
      </div>

      <div class="ddm-overview-grid">
        <!-- Card 1: Pengadaan & Inventaris Sekolah -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="briefcase" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Inventaris &amp; Pengadaan Sekolah</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm ddm-jump-btn" data-jump-tab="inventory">
              Edit Inventaris
            </button>
          </div>
          <div class="ddm-kv-list">
            ${this.renderKvRow('Tahun Pembelian', inv.purchaseYear)}
            ${this.renderKvRow('Sumber Anggaran', inv.fundingSource, { badgeColor: inv.fundingSource ? fundingBadgeColor : null })}
            ${this.renderKvRow('Kode Inventaris / NUP', inv.inventoryCode, { mono: true })}
            ${this.renderKvRow('Kondisi Fisik', condObj.label, { badgeColor: condObj.color })}
            ${this.renderKvRow('Nomor Seri (S/N)', inv.serialNumber, { mono: true })}
            ${this.renderKvRow('Nilai Perolehan', inv.unitPrice)}
            ${this.renderKvRow('Penyedia / Vendor', inv.vendor)}
            ${this.renderKvRow('Penanggung Jawab (PIC)', inv.responsiblePerson)}
            ${this.renderKvRow('Lokasi Ruangan', dev.location)}
            ${this.renderKvRow('Tgl Pemasangan', dev.installedAt, { mono: true })}
          </div>
        </div>

        <!-- Card 2: Spesifikasi Hardware -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="cpu" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Spesifikasi Perangkat Keras</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm ddm-jump-btn" data-jump-tab="inventory">
              Edit Spek
            </button>
          </div>
          ${!hasCustomSpecs ? `<div class="ddm-hint-banner">Menampilkan rekomendasi spesifikasi standar model (klik <strong>Edit Spek</strong> untuk menyesuaikan atau menyimpan).</div>` : ''}
          <div class="ddm-kv-list">
            ${this.renderKvRow('Merek / Model', [dev.brand, dev.model].filter(Boolean).join(' '))}
            ${this.renderKvRow('Firmware / OS', dev.firmware, { mono: true })}
            ${this.renderKvRow('Prosesor / Chipset', specDisplay.processor)}
            ${this.renderKvRow('RAM &amp; Storage', specDisplay.ramStorage)}
            ${this.renderKvRow('Interface / Port', specDisplay.portsSummary)}
            ${this.renderKvRow('Catu Daya / PoE', specDisplay.powerSupply)}
            ${this.renderKvRow('Throughput / Kapasitas', specDisplay.throughput)}
            ${this.renderKvRow('Dimensi / Chassis', specDisplay.dimensions)}
          </div>
          ${specDisplay.summary ? `
            <div class="ddm-note-box">
              <div class="ddm-note-title">Ringkasan Spesifikasi</div>
              <div>${this.escapeHtml(specDisplay.summary)}</div>
            </div>
          ` : ''}
        </div>

        <!-- Card 3: Konfigurasi Jaringan & Wireless (SSID) -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="wifi" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Konfigurasi IP, VLAN &amp; Wireless (SSID)</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm ddm-jump-btn" data-jump-tab="network">
              Edit Konfigurasi
            </button>
          </div>
          <div class="ddm-kv-list">
            ${this.renderKvRow('IP Address', net.ip, { mono: true })}
            ${this.renderKvRow('Subnet Mask', net.subnet, { mono: true })}
            ${this.renderKvRow('Default Gateway', net.gateway, { mono: true })}
            ${this.renderKvRow('DNS Server', net.dns, { mono: true })}
            ${this.renderKvRow('Mode Interface', net.connectionMode)}
            ${this.renderKvRow('VLAN Utama / Trunk', net.vlanList ? `VLAN ${net.vlan || 1} (${net.vlanList})` : `VLAN ${net.vlan || 1}`, { mono: true })}
            ${this.renderKvRow('MAC Address', net.mac, { mono: true })}
            ${this.renderKvRow('Hostname / DNS Lokal', net.hostname, { mono: true })}
            ${this.renderKvRow('SSID Utama', net.ssid)}
            ${this.renderKvRow('SSID Kedua / Tamu', net.ssidSecondary)}
            ${this.renderKvRow('Band &amp; Channel Wi-Fi', [net.wifiBand, net.wifiChannel].filter(Boolean).join(' • '))}
            ${this.renderKvRow('Keamanan &amp; Password Hint', [net.wifiSecurity, net.wifiPasswordHint].filter(Boolean).join(' • '))}
            ${this.renderKvRow('Akses Manajemen', [net.managementAccess, net.managementUser].filter(Boolean).join(' • '))}
            ${this.renderKvRow('Layanan Aktif', net.services)}
          </div>
          ${net.configSnippet ? `
            <div class="ddm-code-wrap">
              <div class="ddm-note-title">Catatan Konfigurasi / CLI</div>
              <pre class="ddm-code-block">${this.escapeHtml(net.configSnippet)}</pre>
            </div>
          ` : ''}
        </div>

        <!-- Card 4: Port Fisik & Koneksi Kabel -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="network" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Koneksi Kabel &amp; Port (${links.length} Link • ${(dev.ports || []).length} Port)</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm ddm-jump-btn" data-jump-tab="ports">
              Lihat Semua Port
            </button>
          </div>
          <div class="ddm-links-list">
            ${linksHtml}
          </div>
          ${dev.notes ? `
            <div class="ddm-note-box" style="margin-top: 10px;">
              <div class="ddm-note-title">Catatan Teknis Umum</div>
              <div>${this.escapeHtml(dev.notes)}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderInventoryTab(dev) {
    const inv = dev.inventory || {};
    const sp = dev.specs || {};
    return `
      <div class="ddm-form-sections">
        <!-- Section 1: Pengadaan & Aset Sekolah -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="briefcase" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Data Pengadaan &amp; Inventaris Sekolah</span>
            </div>
          </div>

          <div class="ddm-form-grid">
            <div class="ddm-field">
              <label for="dd-inv-year">Tahun Pembelian</label>
              <input type="text" id="dd-inv-year" placeholder="contoh: 2020" value="${this.escapeAttr(inv.purchaseYear)}">
              <div class="ddm-chip-row">
                ${YEAR_PRESETS.map((yr) => `
                  <button type="button" class="ddm-chip ${inv.purchaseYear === yr ? 'active' : ''}" data-fill-input="dd-inv-year" data-fill-val="${yr}">${yr}</button>
                `).join('')}
              </div>
            </div>

            <div class="ddm-field">
              <label for="dd-inv-funding">Sumber Anggaran (DAK / BOS / dll.)</label>
              <input type="text" id="dd-inv-funding" placeholder="contoh: DAK 2020 / BOS Reguler" value="${this.escapeAttr(inv.fundingSource)}">
              <div class="ddm-chip-row">
                ${FUNDING_SOURCE_PRESETS.map((src) => `
                  <button type="button" class="ddm-chip ${inv.fundingSource === src ? 'active' : ''}" data-fill-input="dd-inv-funding" data-fill-val="${this.escapeAttr(src)}">${this.escapeHtml(src)}</button>
                `).join('')}
              </div>
            </div>

            <div class="ddm-field">
              <label for="dd-inv-code">Kode Inventaris / KIB / NUP</label>
              <input type="text" id="dd-inv-code" placeholder="contoh: INV-TIK-2020-001" value="${this.escapeAttr(inv.inventoryCode)}">
            </div>

            <div class="ddm-field">
              <label for="dd-inv-condition">Kondisi Perangkat</label>
              <select id="dd-inv-condition">
                ${DEVICE_CONDITION_OPTIONS.map((c) => `
                  <option value="${c.id}" ${inv.condition === c.id ? 'selected' : ''}>${this.escapeHtml(c.label)}</option>
                `).join('')}
              </select>
            </div>

            <div class="ddm-field">
              <label for="dd-inv-sn">Nomor Seri (Serial Number / S/N)</label>
              <input type="text" id="dd-inv-sn" placeholder="S/N fisik pada stiker unit" value="${this.escapeAttr(inv.serialNumber)}">
            </div>

            <div class="ddm-field">
              <label for="dd-inv-price">Nilai / Harga Perolehan</label>
              <input type="text" id="dd-inv-price" placeholder="contoh: Rp 4.850.000" value="${this.escapeAttr(inv.unitPrice)}">
            </div>

            <div class="ddm-field">
              <label for="dd-inv-vendor">Penyedia / Rekanan Pengadaan</label>
              <input type="text" id="dd-inv-vendor" placeholder="Nama toko / CV / PT" value="${this.escapeAttr(inv.vendor)}">
            </div>

            <div class="ddm-field">
              <label for="dd-inv-pic">Penanggung Jawab (PIC / Lab)</label>
              <input type="text" id="dd-inv-pic" placeholder="Tim IT / Teknisi / Kepala Lab" value="${this.escapeAttr(inv.responsiblePerson)}">
            </div>

            <div class="ddm-field">
              <label for="dd-location">Lokasi Ruangan / Titik Pasang</label>
              <input type="text" id="dd-location" placeholder="Ruang Server / Lab RPL / Koridor Lt. 2" value="${this.escapeAttr(dev.location)}">
            </div>

            <div class="ddm-field">
              <label for="dd-installed">Tanggal Pemasangan / Update</label>
              <input type="date" id="dd-installed" value="${this.escapeAttr(dev.installedAt)}">
            </div>
          </div>
        </div>

        <!-- Section 2: Spesifikasi Hardware -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="cpu" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Spesifikasi Perangkat Keras (Hardware)</span>
            </div>
            <button type="button" id="btn-dd-autofill-specs" class="btn btn-secondary btn-sm">
              <i data-lucide="sparkles" style="width: 13px; height: 13px;"></i>
              <span>Isi Otomatis Spesifikasi Model Ini</span>
            </button>
          </div>

          <div class="ddm-form-grid">
            <div class="ddm-field">
              <label for="dd-brand">Merek / Brand</label>
              <input type="text" id="dd-brand" placeholder="MikroTik, Ruijie, TP-Link..." value="${this.escapeAttr(dev.brand)}">
            </div>
            <div class="ddm-field">
              <label for="dd-model">Seri / Model</label>
              <input type="text" id="dd-model" placeholder="RB1100AHx4, RG-RAP2260(G)..." value="${this.escapeAttr(dev.model)}">
            </div>
            <div class="ddm-field">
              <label for="dd-firmware">Versi Firmware / OS</label>
              <input type="text" id="dd-firmware" placeholder="RouterOS v7.14 / ReyeeOS..." value="${this.escapeAttr(dev.firmware)}">
            </div>
            <div class="ddm-field">
              <label for="dd-spec-cpu">Prosesor / Chipset</label>
              <input type="text" id="dd-spec-cpu" placeholder="Quad-Core 1.4 GHz..." value="${this.escapeAttr(sp.processor)}">
            </div>
            <div class="ddm-field">
              <label for="dd-spec-ram">RAM &amp; Storage</label>
              <input type="text" id="dd-spec-ram" placeholder="1 GB RAM • 128 MB NAND..." value="${this.escapeAttr(sp.ramStorage)}">
            </div>
            <div class="ddm-field">
              <label for="dd-spec-ports">Ringkasan Interface / Port</label>
              <input type="text" id="dd-spec-ports" placeholder="13x Gigabit + PoE Out..." value="${this.escapeAttr(sp.portsSummary)}">
            </div>
            <div class="ddm-field">
              <label for="dd-spec-power">Catu Daya / PoE</label>
              <input type="text" id="dd-spec-power" placeholder="802.3at PoE+ / Dual AC PSU" value="${this.escapeAttr(sp.powerSupply)}">
            </div>
            <div class="ddm-field">
              <label for="dd-spec-throughput">Throughput / Kecepatan Maks</label>
              <input type="text" id="dd-spec-throughput" placeholder="AX1800 / 7.5 Gbps Routing..." value="${this.escapeAttr(sp.throughput)}">
            </div>
            <div class="ddm-field ddm-span-2">
              <label for="dd-spec-dim">Dimensi / Form Factor</label>
              <input type="text" id="dd-spec-dim" placeholder="1U Rackmount / Ceiling Dome..." value="${this.escapeAttr(sp.dimensions)}">
            </div>
            <div class="ddm-field ddm-span-2">
              <label for="dd-spec-summary">Catatan Spesifikasi Lengkap</label>
              <textarea id="dd-spec-summary" rows="3" placeholder="Tuliskan detail spesifikasi tambahan yang dibutuhkan sekolah (kapasitas klien, fitur failover, garansi, dll.)">${this.escapeHtml(sp.summary)}</textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderNetworkTab(dev) {
    const net = dev.network || {};
    return `
      <div class="ddm-form-sections">
        <!-- Section 1: IP, Gateway, DNS & VLAN -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="globe" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Pengalamatan IP, Gateway, DNS &amp; VLAN</span>
            </div>
          </div>

          <div class="ddm-form-grid">
            <div class="ddm-field">
              <label for="dd-net-ip">IP Address Manajemen / LAN</label>
              <input type="text" id="dd-net-ip" class="mono" placeholder="192.168.10.1" value="${this.escapeAttr(net.ip)}">
              <span id="dd-ip-error" class="ddm-error-text" style="display: none;">Format IPv4 tidak valid</span>
            </div>

            <div class="ddm-field">
              <label for="dd-net-subnet">Subnet Mask</label>
              <input type="text" id="dd-net-subnet" class="mono" placeholder="255.255.255.0" value="${this.escapeAttr(net.subnet || '255.255.255.0')}">
              <div class="ddm-chip-row">
                ${SUBNET_PRESETS.map((s) => `
                  <button type="button" class="ddm-chip ${net.subnet === s.mask ? 'active' : ''}" data-fill-input="dd-net-subnet" data-fill-val="${s.mask}">${s.label}</button>
                `).join('')}
              </div>
            </div>

            <div class="ddm-field">
              <label for="dd-net-gateway">Default Gateway</label>
              <input type="text" id="dd-net-gateway" class="mono" placeholder="192.168.10.254" value="${this.escapeAttr(net.gateway)}">
            </div>

            <div class="ddm-field">
              <label for="dd-net-dns">DNS Server</label>
              <input type="text" id="dd-net-dns" class="mono" placeholder="1.1.1.1, 8.8.8.8 / DNS Lokal" value="${this.escapeAttr(net.dns)}">
            </div>

            <div class="ddm-field">
              <label for="dd-net-mode">Mode Konfigurasi / Port Uplink</label>
              <select id="dd-net-mode">
                <option value="static" ${net.connectionMode === 'static' ? 'selected' : ''}>Static IP</option>
                <option value="dhcp" ${net.connectionMode === 'dhcp' ? 'selected' : ''}>DHCP Client</option>
                <option value="pppoe" ${net.connectionMode === 'pppoe' ? 'selected' : ''}>PPPoE Client / ISP</option>
                <option value="bridge" ${net.connectionMode === 'bridge' ? 'selected' : ''}>Bridge / Transparent</option>
                <option value="trunk" ${net.connectionMode === 'trunk' ? 'selected' : ''}>VLAN Trunk / LACP</option>
              </select>
            </div>

            <div class="ddm-field">
              <label for="dd-net-vlan">VLAN ID Utama (Management)</label>
              <input type="number" id="dd-net-vlan" class="mono" min="1" max="4094" value="${Number(net.vlan || 1)}">
              <span id="dd-vlan-error" class="ddm-error-text" style="display: none;">VLAN harus angka 1 - 4094</span>
            </div>

            <div class="ddm-field ddm-span-2">
              <label for="dd-net-vlan-list">Daftar VLAN / Trunk yang Dilewatkan</label>
              <input type="text" id="dd-net-vlan-list" placeholder="contoh: VLAN 10 (Guru), VLAN 20 (Siswa/Lab), VLAN 30 (CCTV)" value="${this.escapeAttr(net.vlanList)}">
            </div>

            <div class="ddm-field">
              <label for="dd-net-mac">MAC Address</label>
              <input type="text" id="dd-net-mac" class="mono" placeholder="00:1A:2B:3C:4D:5E" value="${this.escapeAttr(net.mac)}">
              <span id="dd-mac-error" class="ddm-error-text" style="display: none;">Format MAC tidak valid (cth: AA:BB:CC:DD:EE:FF)</span>
            </div>

            <div class="ddm-field">
              <label for="dd-net-hostname">Hostname / System Identity</label>
              <input type="text" id="dd-net-hostname" class="mono" placeholder="ap-lab-rpl.smk.sch.id" value="${this.escapeAttr(net.hostname)}">
            </div>
          </div>
        </div>

        <!-- Section 2: Wireless / SSID -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="wifi" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Konfigurasi Wireless &amp; SSID</span>
            </div>
          </div>

          <div class="ddm-form-grid">
            <div class="ddm-field">
              <label for="dd-net-ssid">Nama SSID Utama</label>
              <input type="text" id="dd-net-ssid" placeholder="contoh: SMKN1_HOTSPOT / GURU_STAFF" value="${this.escapeAttr(net.ssid)}">
            </div>

            <div class="ddm-field">
              <label for="dd-net-ssid2">SSID Tambahan / Guest / Lab</label>
              <input type="text" id="dd-net-ssid2" placeholder="contoh: SISWA_CBT / TAMU_SEKOLAH" value="${this.escapeAttr(net.ssidSecondary)}">
            </div>

            <div class="ddm-field">
              <label for="dd-net-wifi-band">Frekuensi / Band Wi-Fi</label>
              <select id="dd-net-wifi-band">
                <option value="" ${!net.wifiBand ? 'selected' : ''}>- Tidak / Kabel Saja -</option>
                <option value="Dual-Band (2.4 & 5 GHz)" ${net.wifiBand === 'Dual-Band (2.4 & 5 GHz)' ? 'selected' : ''}>Dual-Band (2.4 &amp; 5 GHz)</option>
                <option value="5 GHz Only" ${net.wifiBand === '5 GHz Only' ? 'selected' : ''}>5 GHz Only (High Density)</option>
                <option value="2.4 GHz Only" ${net.wifiBand === '2.4 GHz Only' ? 'selected' : ''}>2.4 GHz Only (Jangkauan Luas)</option>
                <option value="PtP Bridge 5 GHz" ${net.wifiBand === 'PtP Bridge 5 GHz' ? 'selected' : ''}>PtP Wireless Bridge 5 GHz</option>
              </select>
            </div>

            <div class="ddm-field">
              <label for="dd-net-wifi-channel">Channel / Lebar Pita</label>
              <input type="text" id="dd-net-wifi-channel" placeholder="Auto / Ch 1, 6, 11 / 36 (80MHz)" value="${this.escapeAttr(net.wifiChannel)}">
            </div>

            <div class="ddm-field">
              <label for="dd-net-wifi-security">Keamanan Wireless</label>
              <select id="dd-net-wifi-security">
                <option value="" ${!net.wifiSecurity ? 'selected' : ''}>- Pilih Keamanan -</option>
                <option value="WPA2-PSK (AES)" ${net.wifiSecurity === 'WPA2-PSK (AES)' ? 'selected' : ''}>WPA2-PSK (AES)</option>
                <option value="WPA2/WPA3-PSK" ${net.wifiSecurity === 'WPA2/WPA3-PSK' ? 'selected' : ''}>WPA2 / WPA3-PSK</option>
                <option value="Hotspot Captive Portal" ${net.wifiSecurity === 'Hotspot Captive Portal' ? 'selected' : ''}>Hotspot Captive Portal / Voucher</option>
                <option value="Open / Portal RADIUS" ${net.wifiSecurity === 'Open / Portal RADIUS' ? 'selected' : ''}>Open / Portal RADIUS</option>
                <option value="WPA2-Enterprise (802.1X)" ${net.wifiSecurity === 'WPA2-Enterprise (802.1X)' ? 'selected' : ''}>WPA2-Enterprise (802.1X)</option>
              </select>
            </div>

            <div class="ddm-field">
              <label for="dd-net-wifi-pass">Petunjuk Sandi / Kebijakan Akses Wi-Fi</label>
              <input type="text" id="dd-net-wifi-pass" placeholder="Gunakan petunjuk aman (hindari sandi polos bila sensitif)" value="${this.escapeAttr(net.wifiPasswordHint)}">
            </div>
          </div>
        </div>

        <!-- Section 3: Manajemen, Layanan & CLI -->
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="terminal" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Akses Manajemen, Layanan &amp; Catatan CLI</span>
            </div>
          </div>

          <div class="ddm-form-grid">
            <div class="ddm-field">
              <label for="dd-net-mgmt">Protokol / URL Manajemen</label>
              <input type="text" id="dd-net-mgmt" class="mono" placeholder="Winbox 8291, Web https://..., Ruijie Cloud, SSH" value="${this.escapeAttr(net.managementAccess)}">
            </div>

            <div class="ddm-field">
              <label for="dd-net-mgmt-user">Akun Admin / Catatan Login</label>
              <input type="text" id="dd-net-mgmt-user" placeholder="contoh: admin-it (lihat arsip brankas)" value="${this.escapeAttr(net.managementUser)}">
            </div>

            <div class="ddm-field ddm-span-2">
              <label for="dd-net-services">Layanan / Fitur Aktif</label>
              <input type="text" id="dd-net-services" placeholder="contoh: DHCP Server, Hotspot, Queue Simple, NTP, SNMP, PoE Watchdog" value="${this.escapeAttr(net.services)}">
            </div>

            <div class="ddm-field ddm-span-2">
              <label for="dd-net-config-snippet">Cuplikan Konfigurasi / Aturan Routing / CLI</label>
              <textarea id="dd-net-config-snippet" class="mono" rows="4" placeholder="/ip address add address=192.168.10.1/24 interface=bridge-lan&#10;/ip dhcp-server ...">${this.escapeHtml(net.configSnippet)}</textarea>
            </div>

            <div class="ddm-field ddm-span-2">
              <label for="dd-notes">Catatan Pemeliharaan / Histori Konfigurasi</label>
              <textarea id="dd-notes" rows="2" placeholder="Riwayat perbaikan, jadwal maintenance, atau catatan khusus admin sekolah...">${this.escapeHtml(dev.notes)}</textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPortsTab(dev) {
    const ports = Array.isArray(dev.ports) ? dev.ports : [];
    const links = this.getConnectedCableLinks(dev.id);
    const linkByPort = new Map();
    links.forEach((l) => {
      if (l.localPort) {
        linkByPort.set(l.localPort.toLowerCase(), l);
      }
    });

    const rowsHtml = ports.length > 0
      ? ports.map((p, idx) => {
          const matched = linkByPort.get(String(p.name || '').toLowerCase());
          return `
            <tr>
              <td class="mono">${idx + 1}</td>
              <td class="mono" style="font-weight: 600;">${this.escapeHtml(p.name)}</td>
              <td><span class="ddm-chip-static">${this.escapeHtml(String(p.type || 'rj45').toUpperCase())}</span></td>
              <td class="mono">${this.escapeHtml(p.speed || '1G')}</td>
              <td>
                ${matched
                  ? `<span class="ddm-port-used">Terhubung ke <strong>${this.escapeHtml(matched.peerName)}</strong>${matched.peerPort ? ` (${this.escapeHtml(matched.peerPort)})` : ''} • ${this.escapeHtml(matched.cableTypeName)}</span>`
                  : `<span class="ddm-port-free">Tersedia / Kosong</span>`}
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">Belum ada port fisik terdefinisi pada perangkat ini.</td></tr>`;

    return `
      <div class="ddm-form-sections">
        <div class="ddm-card">
          <div class="ddm-card-head">
            <div class="ddm-card-title">
              <i data-lucide="network" style="width: 15px; height: 15px; color: var(--accent-blue);"></i>
              <span>Daftar Port Fisik &amp; Status Koneksi (${ports.length} Port)</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-dd-draw-cable" class="btn btn-secondary btn-sm">
                <i data-lucide="git-commit" style="width: 13px; height: 13px;"></i>
                <span>Tarik Kabel Baru</span>
              </button>
              <button type="button" id="btn-dd-open-3d" class="btn btn-secondary btn-sm">
                <i data-lucide="cpu" style="width: 13px; height: 13px;"></i>
                <span>Atur Model 3D &amp; Port (.GLB)</span>
              </button>
            </div>
          </div>

          <div class="ddm-table-wrap">
            <table class="ddm-ports-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nama Port</th>
                  <th>Tipe</th>
                  <th>Kecepatan</th>
                  <th>Status / Perangkat Tujuan</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  bindOverviewTabEvents(body) {
    body.querySelectorAll('[data-jump-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-jump-tab');
        if (target) this.switchTab(target);
      });
    });
  }

  bindInventoryTabEvents(body) {
    body.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', () => this.captureCurrentTabInputs());
      el.addEventListener('change', () => this.captureCurrentTabInputs());
    });

    body.querySelectorAll('[data-fill-input]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const inputId = chip.getAttribute('data-fill-input');
        const val = chip.getAttribute('data-fill-val') ?? '';
        const input = body.querySelector(`#${inputId}`);
        if (input) {
          input.value = val;
          this.captureCurrentTabInputs();
          chip.parentElement?.querySelectorAll('.ddm-chip').forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
        }
      });
    });

    body.querySelector('#btn-dd-autofill-specs')?.addEventListener('click', () => {
      this.captureCurrentTabInputs();
      const rec = getDefaultHardwareSpecs(this.draft);
      const map = {
        'dd-spec-cpu': rec.processor,
        'dd-spec-ram': rec.ramStorage,
        'dd-spec-ports': rec.portsSummary,
        'dd-spec-power': rec.powerSupply,
        'dd-spec-throughput': rec.throughput,
        'dd-spec-dim': rec.dimensions,
        'dd-spec-summary': rec.summary
      };
      Object.entries(map).forEach(([id, val]) => {
        const el = body.querySelector(`#${id}`);
        if (el) el.value = val || '';
      });
      this.captureCurrentTabInputs();
      this.showFeedback('Spesifikasi default model diisi — klik Simpan Perubahan untuk menyimpan.');
    });
  }

  bindNetworkTabEvents(body) {
    body.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', () => this.captureCurrentTabInputs());
      el.addEventListener('change', () => this.captureCurrentTabInputs());
    });

    body.querySelectorAll('[data-fill-input]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const inputId = chip.getAttribute('data-fill-input');
        const val = chip.getAttribute('data-fill-val') ?? '';
        const input = body.querySelector(`#${inputId}`);
        if (input) {
          input.value = val;
          this.captureCurrentTabInputs();
          chip.parentElement?.querySelectorAll('.ddm-chip').forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
        }
      });
    });
  }

  bindPortsTabEvents(body) {
    body.querySelector('#btn-dd-draw-cable')?.addEventListener('click', () => {
      const devId = this.currentDeviceId;
      this.hide();
      if (!devId) return;
      stateManager.setMode('draw-cable');
      this.deviceManager.selectDevice(devId);
      eventBus.emit('map3d:start-cable', { deviceId: devId });
    });

    body.querySelector('#btn-dd-open-3d')?.addEventListener('click', () => {
      const devId = this.currentDeviceId;
      this.hide();
      if (devId) {
        eventBus.emit('modal:open-device-3d', { deviceId: devId });
      }
    });
  }

  saveChanges() {
    if (!this.currentDeviceId || !this.draft) return;
    this.captureCurrentTabInputs();

    const ip = this.draft.network.ip || '';
    const mac = this.draft.network.mac || '';
    const vlan = this.draft.network.vlan;

    if (!validateIp(ip)) {
      this.switchTab('network');
      const err = this.modalEl.querySelector('#dd-ip-error');
      if (err) err.style.display = 'block';
      this.showFeedback('Format IPv4 tidak valid!', true);
      return;
    }
    if (!validateVlan(vlan)) {
      this.switchTab('network');
      const err = this.modalEl.querySelector('#dd-vlan-error');
      if (err) err.style.display = 'block';
      this.showFeedback('VLAN harus antara 1 - 4094!', true);
      return;
    }
    if (!validateMac(mac)) {
      this.switchTab('network');
      const err = this.modalEl.querySelector('#dd-mac-error');
      if (err) err.style.display = 'block';
      this.showFeedback('Format MAC Address tidak valid!', true);
      return;
    }

    const updated = this.deviceManager.updateDevice(this.currentDeviceId, {
      brand: this.draft.brand,
      model: this.draft.model,
      location: this.draft.location,
      firmware: this.draft.firmware,
      installedAt: this.draft.installedAt,
      notes: this.draft.notes,
      inventory: { ...this.draft.inventory },
      specs: { ...this.draft.specs },
      network: { ...this.draft.network }
    });

    if (updated) {
      this.draft = this.cloneDeviceDraft(updated);
      this.updateHeader(this.draft);
      if (this.activeTab === 'overview') {
        this.switchTab('overview');
      }
      this.showFeedback('Detail perangkat & konfigurasi berhasil disimpan!');
    }
  }

  showFeedback(msg, isError = false) {
    const el = this.modalEl.querySelector('#ddm-feedback-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('visible');
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, 3200);
  }

  async copySummaryToClipboard() {
    if (!this.draft) return;
    const d = this.draft;
    const inv = d.inventory || {};
    const sp = d.specs || {};
    const net = d.network || {};
    const defaultSpecs = getDefaultHardwareSpecs(d);

    const lines = [
      `=== DETAIL PERANGKAT: ${d.name} ===`,
      `Brand / Model    : ${[d.brand, d.model].filter(Boolean).join(' ') || '-'}`,
      `Lokasi           : ${d.location || '-'}`,
      `Firmware         : ${d.firmware || '-'}`,
      `--- INVENTARIS SEKOLAH ---`,
      `Tahun Pembelian  : ${inv.purchaseYear || '-'}`,
      `Sumber Anggaran  : ${inv.fundingSource || '-'}`,
      `Kode Inventaris  : ${inv.inventoryCode || '-'}`,
      `Kondisi          : ${inv.condition || 'baik'}`,
      `Nomor Seri (S/N) : ${inv.serialNumber || '-'}`,
      `Penyedia / PIC   : ${[inv.vendor, inv.responsiblePerson].filter(Boolean).join(' / ') || '-'}`,
      `--- SPESIFIKASI ---`,
      `Ringkasan        : ${sp.summary || defaultSpecs.summary || '-'}`,
      `CPU / RAM        : ${[sp.processor || defaultSpecs.processor, sp.ramStorage || defaultSpecs.ramStorage].filter(Boolean).join(' | ') || '-'}`,
      `Port & Daya      : ${[sp.portsSummary || defaultSpecs.portsSummary, sp.powerSupply || defaultSpecs.powerSupply].filter(Boolean).join(' | ') || '-'}`,
      `--- KONFIGURASI JARINGAN & WIRELESS ---`,
      `IP / Subnet      : ${net.ip || '-'} / ${net.subnet || '255.255.255.0'}`,
      `Gateway / DNS    : ${net.gateway || '-'} / ${net.dns || '-'}`,
      `VLAN / Mode      : VLAN ${net.vlan || 1}${net.vlanList ? ` (${net.vlanList})` : ''} | ${net.connectionMode || 'static'}`,
      `MAC / Hostname   : ${net.mac || '-'} | ${net.hostname || '-'}`,
      `SSID Wi-Fi       : ${[net.ssid, net.ssidSecondary].filter(Boolean).join(', ') || '-'}`,
      `Akses Manajemen  : ${[net.managementAccess, net.managementUser].filter(Boolean).join(' | ') || '-'}`
    ];

    const text = lines.join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.showFeedback('Ringkasan perangkat disalin ke clipboard!');
    } catch (err) {
      this.showFeedback('Gagal menyalin ke clipboard.', true);
    }
  }

  escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  escapeAttr(str) {
    return this.escapeHtml(str);
  }
}

function getFundingBadgeColor(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('dak')) return '#2563eb';
  if (s.includes('bos')) return '#059669';
  if (s.includes('apbd') || s.includes('apbn')) return '#7c3aed';
  if (s.includes('komite') || s.includes('hibah')) return '#d97706';
  return '#2a7c13';
}
