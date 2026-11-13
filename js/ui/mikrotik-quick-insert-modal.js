/**
 * NetMap — Vendor Quick & Batch Insert Modal (MikroTik & Ruijie / Reyee)
 * Memudahkan penyisipan banyak perangkat MikroTik atau Ruijie sekaligus ke peta
 * lengkap dengan paket topologi siap pakai, penomoran nama, dan auto-increment IP.
 */

import { eventBus } from '../core/event-bus.js';
import { MIKROTIK_CATALOG, RUIJIE_CATALOG, TPLINK_CATALOG, DEVICE_CATEGORIES } from '../devices/device-library.js';
import { getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { IPv4_REGEX } from '../devices/device-schema.js';
import { coordinateSystem } from '../map/coordinate-system.js';
import { clamp } from '../utils/helpers.js';

const VENDOR_PROFILES = {
  mikrotik: {
    id: 'mikrotik',
    label: 'MikroTik',
    title: 'Insert Cepat Perangkat MikroTik',
    subtitle: 'Pilih paket atau jumlah unit MikroTik (CCR, RB, CRS, cAP, LHG) untuk langsung disisipkan ke peta',
    catalog: MIKROTIK_CATALOG,
    defaultIp: '192.168.88.1',
    defaultCounts: { 'mikrotik-rb5009': 1, 'mikrotik-crs326': 1 },
    stripBrandRegex: /^MikroTik\s+/i,
    presets: [
      {
        id: 'mt-kantor',
        label: 'Kantor / Lab',
        hint: '1x RB5009, 1x CRS326, 2x cAP ax',
        counts: { 'mikrotik-rb5009': 1, 'mikrotik-crs326': 1, 'mikrotik-cap-ax': 2 }
      },
      {
        id: 'mt-kampus',
        label: 'Gedung / Kampus',
        hint: '1x CCR2004, 2x CRS328 PoE, 4x cAP ax',
        counts: { 'mikrotik-ccr2004': 1, 'mikrotik-crs328': 2, 'mikrotik-cap-ax': 4 }
      },
      {
        id: 'mt-ptp',
        label: 'Link PtP Antargedung',
        hint: '1x CCR2004, 2x LHG 5 ac, 1x CRS326',
        counts: { 'mikrotik-ccr2004': 1, 'mikrotik-lhg5': 2, 'mikrotik-crs326': 1 }
      },
      {
        id: 'mt-wisp',
        label: 'Hotspot / Base Station',
        hint: '1x RB4011, 1x mANTBox, 3x SXTsq',
        counts: { 'mikrotik-rb4011': 1, 'mikrotik-mantbox': 1, 'mikrotik-sxtsq': 3 }
      }
    ]
  },
  ruijie: {
    id: 'ruijie',
    label: 'Ruijie / Reyee',
    title: 'Insert Cepat Perangkat Ruijie / Reyee',
    subtitle: 'Pilih paket atau jumlah unit Ruijie (EG, NBR, NBS, ES, RAP, EST) untuk langsung disisipkan ke peta',
    catalog: RUIJIE_CATALOG,
    defaultIp: '192.168.110.1',
    defaultCounts: { 'ruijie-eg210g': 1, 'ruijie-nbs3100-poe': 1 },
    stripBrandRegex: /^Ruijie\s+/i,
    presets: [
      {
        id: 'rj-kantor',
        label: 'Kantor / Ruko',
        hint: '1x EG210G-P, 1x ES218GC-P, 3x RAP2200',
        counts: { 'ruijie-eg210g': 1, 'ruijie-es218gc': 1, 'ruijie-rap2200': 3 }
      },
      {
        id: 'rj-gedung',
        label: 'Gedung / Sekolah',
        hint: '1x EG310GH, 2x NBS3100 PoE+, 6x RAP2260',
        counts: { 'ruijie-eg310gh': 1, 'ruijie-nbs3100-poe': 2, 'ruijie-rap2260': 6 }
      },
      {
        id: 'rj-hotel',
        label: 'Hotel / Asrama',
        hint: '1x NBR6210, 1x NBS5200, 8x RAP1200 In-Wall',
        counts: { 'ruijie-nbr6210': 1, 'ruijie-nbs5200': 1, 'ruijie-rap1200': 8 }
      },
      {
        id: 'rj-outdoor',
        label: 'Outdoor & PtP Bridge',
        hint: '1x EG210G-P, 2x EST350 V2, 2x RAP6260 Out',
        counts: { 'ruijie-eg210g': 1, 'ruijie-est350': 2, 'ruijie-rap6260': 2 }
      }
    ]
  },
  tplink: {
    id: 'tplink',
    label: 'TP-Link Switch & Hub',
    title: 'Insert Cepat Switch & Hub TP-Link',
    subtitle: 'Pilih paket atau jumlah unit Switch / Hub TP-Link (LS, TL-SG, Easy Smart, Omada JetStream)',
    catalog: TPLINK_CATALOG,
    defaultIp: '192.168.0.10',
    defaultCounts: { 'tplink-sg1008d': 1, 'tplink-sg2210mp': 1 },
    stripBrandRegex: /^TP-Link\s+/i,
    presets: [
      {
        id: 'tp-soho',
        label: 'Ruang Kerja / Hub',
        hint: '2x LS1005G (5P), 2x TL-SG1008D (8P)',
        counts: { 'tplink-ls1005g': 2, 'tplink-sg1008d': 2 }
      },
      {
        id: 'tp-poe',
        label: 'Distribusi PoE & CCTV',
        hint: '1x TL-SG1218MP, 2x TL-SG108PE PoE+',
        counts: { 'tplink-sg1218mp': 1, 'tplink-sg108pe': 2 }
      },
      {
        id: 'tp-omada',
        label: 'Omada Gedung / Kampus',
        hint: '1x SG3428X 10G, 2x SG2428P PoE+',
        counts: { 'tplink-sg3428x': 1, 'tplink-sg2428p': 2 }
      },
      {
        id: 'tp-fiber',
        label: 'Core Fiber & Rack',
        hint: '1x SX3016F 10G, 2x TL-SG1024D',
        counts: { 'tplink-sx3016f': 1, 'tplink-sg1024d': 2 }
      }
    ]
  }
};

export class VendorQuickInsertModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
   */
  constructor({ deviceManager, mapEngine = null }) {
    this.deviceManager = deviceManager;
    this.mapEngine = mapEngine;
    this.modalEl = null;
    this.activeVendor = 'mikrotik';
    this.quantities = new Map();

    this.resetQuantitiesForVendor(this.activeVendor);
    this.createModalDOM();
    this.bindStaticEvents();
    this.renderVendorContent();
  }

  getProfile() {
    return VENDOR_PROFILES[this.activeVendor] || VENDOR_PROFILES.mikrotik;
  }

  resetQuantitiesForVendor(vendorId) {
    const profile = VENDOR_PROFILES[vendorId] || VENDOR_PROFILES.mikrotik;
    this.quantities.clear();
    profile.catalog.forEach((item) => {
      this.quantities.set(item.type, profile.defaultCounts[item.type] || 0);
    });
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'vendor-quick-insert-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop, rgba(24, 45, 18, 0.75));
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: 'Poppins', sans-serif;
    `;

    this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color, #e5cca0); border-radius: 12px; width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
        <!-- Header -->
        <div style="min-height: 54px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; gap: 12px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div style="width: 30px; height: 30px; border-radius: 7px; background: rgba(42, 124, 19, 0.16); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13); flex-shrink: 0;">
              <i data-lucide="zap" style="width: 17px; height: 17px;"></i>
            </div>
            <div style="min-width: 0;">
              <span id="vi-modal-title" style="font-size: 15px; font-weight: 700; color: var(--text-primary, #18350d); display: block; line-height: 1.2;">Insert Cepat Perangkat</span>
              <span id="vi-modal-subtitle" style="font-size: 11px; color: var(--text-muted, #678458);">Pilih paket atau jumlah unit perangkat</span>
            </div>
          </div>

          <!-- Vendor Switcher Tabs -->
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <div class="segmented-control" style="padding: 2px;">
              <button type="button" class="segmented-item btn-vi-vendor active" data-vendor="mikrotik" style="font-size: 11px; padding: 4px 10px;">MikroTik</button>
              <button type="button" class="segmented-item btn-vi-vendor" data-vendor="ruijie" style="font-size: 11px; padding: 4px 10px;">Ruijie / Reyee</button>
              <button type="button" class="segmented-item btn-vi-vendor" data-vendor="tplink" style="font-size: 11px; padding: 4px 10px;">TP-Link</button>
            </div>
            <button id="btn-vi-modal-close" class="btn btn-icon btn-sm" title="Tutup">
              <i data-lucide="x" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div style="padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; flex: 1;">
          <!-- Preset Bundles -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">1. Paket Topologi Cepat (Opsional)</span>
              <button type="button" id="btn-vi-clear-all" class="btn btn-secondary btn-sm" style="font-size: 10.5px; padding: 2px 8px;">Reset 0</button>
            </div>
            <div id="vi-presets-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 8px;"></div>
          </div>

          <!-- Hardware List -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span id="vi-catalog-heading" style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">2. Pilih Model & Jumlah Unit</span>
            <div id="vi-catalog-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px;"></div>
          </div>

          <!-- Auto Configuration -->
          <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">3. Pengaturan Otomatis (IP, Prefix & Status)</span>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Prefix Nama (Opsional)</label>
                <input type="text" id="vi-prefix-name" placeholder="misal: Gedung-A"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">IP Awal (Auto Increment)</label>
                <input type="text" id="vi-start-ip" value="192.168.88.1" placeholder="contoh: 192.168.88.1"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">VLAN Default</label>
                <input type="number" id="vi-vlan" value="1" min="1" max="4094"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Status Awal</label>
                <select id="vi-status" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary);">
                  <option value="online" selected>Online</option>
                  <option value="warning">Warning</option>
                  <option value="offline">Offline</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="height: 58px; border-top: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <span id="vi-total-summary" style="font-size: 12px; font-weight: 600; color: var(--text-primary);">Total dipilih: 2 perangkat</span>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-vi-cancel" class="btn btn-secondary btn-sm">Batal</button>
            <button type="button" id="btn-vi-insert" class="btn btn-primary btn-sm" style="padding: 6px 14px; font-weight: 700;">
              <i data-lucide="plus-circle" style="width: 14px; height: 14px;"></i>
              <span id="btn-vi-insert-label">Sisipkan 2 Perangkat ke Peta</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  renderVendorContent() {
    const profile = this.getProfile();

    const titleEl = this.modalEl.querySelector('#vi-modal-title');
    const subEl = this.modalEl.querySelector('#vi-modal-subtitle');
    const headingEl = this.modalEl.querySelector('#vi-catalog-heading');
    const ipInput = this.modalEl.querySelector('#vi-start-ip');

    if (titleEl) titleEl.textContent = profile.title;
    if (subEl) subEl.textContent = profile.subtitle;
    if (headingEl) headingEl.textContent = `2. Pilih Model & Jumlah Unit ${profile.label}`;
    if (ipInput) ipInput.value = profile.defaultIp;

    this.modalEl.querySelectorAll('.btn-vi-vendor').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-vendor') === this.activeVendor);
    });

    const presetsGrid = this.modalEl.querySelector('#vi-presets-grid');
    if (presetsGrid) {
      presetsGrid.innerHTML = profile.presets.map((preset) => `
        <button type="button" class="btn-vi-preset" data-preset-id="${preset.id}"
                style="text-align: left; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color, #e5cca0); background: var(--bg-primary, #fff8cf); cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: all 0.15s ease;">
          <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${preset.label}</span>
          <span style="font-size: 10px; color: var(--text-muted); line-height: 1.25;">${preset.hint}</span>
        </button>
      `).join('');
    }

    const catalogGrid = this.modalEl.querySelector('#vi-catalog-grid');
    if (catalogGrid) {
      catalogGrid.innerHTML = profile.catalog.map((item) => {
        const cat = DEVICE_CATEGORIES[item.category] || DEVICE_CATEGORIES.core;
        const qty = this.quantities.get(item.type) || 0;
        const iconSvg = getDeviceIconSvg(getDefaultIconForType(item.type), { color: cat.color, size: 18 });

        return `
          <div class="vi-qty-card" data-type="${item.type}"
               style="background: var(--bg-primary, #fff8cf); border: 1.5px solid ${qty > 0 ? cat.color : 'var(--border-color, #e5cca0)'}; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: border-color 0.15s ease;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${iconSvg}
              </div>
              <div style="min-width: 0; flex: 1;">
                <div style="font-size: 11.5px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.name}">
                  ${item.name}
                </div>
                <div style="font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.defaultModel} — ${item.description}">
                  ${item.defaultModel}
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <button type="button" class="btn btn-secondary btn-sm btn-vi-dec" data-type="${item.type}" style="width: 22px; height: 22px; padding: 0; font-weight: 700;">-</button>
              <input type="number" class="input-vi-qty" data-type="${item.type}" min="0" max="50" value="${qty}"
                     style="width: 36px; height: 22px; text-align: center; font-size: 11px; font-weight: 700; padding: 0 2px; font-family: var(--font-mono);">
              <button type="button" class="btn btn-secondary btn-sm btn-vi-inc" data-type="${item.type}" style="width: 22px; height: 22px; padding: 0; font-weight: 700;">+</button>
            </div>
          </div>
        `;
      }).join('');
    }

    this.bindDynamicEvents();
    this.updateSummary();
  }

  bindStaticEvents() {
    this.modalEl.querySelector('#btn-vi-modal-close')?.addEventListener('click', () => this.hide());
    this.modalEl.querySelector('#btn-vi-cancel')?.addEventListener('click', () => this.hide());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.hide();
    });

    this.modalEl.querySelectorAll('.btn-vi-vendor').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextVendor = btn.getAttribute('data-vendor');
        if (nextVendor && nextVendor !== this.activeVendor) {
          this.switchVendor(nextVendor);
        }
      });
    });

    this.modalEl.querySelector('#btn-vi-clear-all')?.addEventListener('click', () => {
      this.getProfile().catalog.forEach((item) => this.setQty(item.type, 0));
    });

    this.modalEl.querySelector('#btn-vi-insert')?.addEventListener('click', () => {
      this.handleInsert();
    });

    eventBus.on('modal:open-mikrotik-insert', () => {
      this.show('mikrotik');
    });

    eventBus.on('modal:open-vendor-insert', (payload) => {
      this.show(payload?.vendor || 'mikrotik');
    });
  }

  bindDynamicEvents() {
    const profile = this.getProfile();

    this.modalEl.querySelectorAll('.btn-vi-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = profile.presets.find((p) => p.id === btn.getAttribute('data-preset-id'));
        if (!preset) return;
        profile.catalog.forEach((item) => {
          this.setQty(item.type, preset.counts[item.type] || 0);
        });
      });
    });

    this.modalEl.querySelectorAll('.btn-vi-inc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        this.setQty(type, (this.quantities.get(type) || 0) + 1);
      });
    });

    this.modalEl.querySelectorAll('.btn-vi-dec').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        this.setQty(type, Math.max(0, (this.quantities.get(type) || 0) - 1));
      });
    });

    this.modalEl.querySelectorAll('.input-vi-qty').forEach((input) => {
      input.addEventListener('change', () => {
        const type = input.getAttribute('data-type');
        const parsed = Math.max(0, Math.min(50, parseInt(input.value, 10) || 0));
        this.setQty(type, parsed);
      });
    });
  }

  switchVendor(vendorId) {
    if (!VENDOR_PROFILES[vendorId]) return;
    this.activeVendor = vendorId;
    this.resetQuantitiesForVendor(vendorId);
    this.renderVendorContent();
  }

  setQty(type, qty) {
    const safeQty = Math.max(0, Math.min(50, Number(qty) || 0));
    this.quantities.set(type, safeQty);

    const input = this.modalEl.querySelector(`.input-vi-qty[data-type="${type}"]`);
    if (input) input.value = String(safeQty);

    const card = this.modalEl.querySelector(`.vi-qty-card[data-type="${type}"]`);
    if (card) {
      const def = this.getProfile().catalog.find((i) => i.type === type);
      const cat = DEVICE_CATEGORIES[def?.category] || DEVICE_CATEGORIES.core;
      card.style.borderColor = safeQty > 0 ? cat.color : 'var(--border-color, #e5cca0)';
    }

    this.updateSummary();
  }

  updateSummary() {
    let total = 0;
    this.quantities.forEach((v) => { total += v; });

    const summaryEl = this.modalEl.querySelector('#vi-total-summary');
    const btnLabelEl = this.modalEl.querySelector('#btn-vi-insert-label');
    const insertBtn = this.modalEl.querySelector('#btn-vi-insert');

    if (summaryEl) {
      summaryEl.textContent = `Total dipilih: ${total} perangkat`;
    }
    if (btnLabelEl) {
      btnLabelEl.textContent = total > 0 ? `Sisipkan ${total} Perangkat ke Peta` : 'Pilih Minimal 1 Perangkat';
    }
    if (insertBtn) {
      insertBtn.disabled = total === 0;
      insertBtn.style.opacity = total === 0 ? '0.6' : '1';
    }
  }

  getViewportCenterNormalized() {
    const stage = this.mapEngine?.stage;
    if (!stage) return { x: 0.5, y: 0.5 };
    const screenCenter = { x: stage.width() / 2, y: stage.height() / 2 };
    return coordinateSystem.screenToNormalized(screenCenter, stage, true);
  }

  handleInsert() {
    const profile = this.getProfile();
    const selectedEntries = [];
    profile.catalog.forEach((def) => {
      const qty = this.quantities.get(def.type) || 0;
      if (qty > 0) {
        selectedEntries.push({ def, qty });
      }
    });

    if (selectedEntries.length === 0) return;

    const total = selectedEntries.reduce((acc, e) => acc + e.qty, 0);
    const prefixName = (this.modalEl.querySelector('#vi-prefix-name')?.value || '').trim();
    const startIpRaw = (this.modalEl.querySelector('#vi-start-ip')?.value || '').trim();
    const vlanRaw = parseInt(this.modalEl.querySelector('#vi-vlan')?.value || '1', 10);
    const vlan = !isNaN(vlanRaw) && vlanRaw >= 1 && vlanRaw <= 4094 ? vlanRaw : 1;
    const status = this.modalEl.querySelector('#vi-status')?.value || 'online';

    let ipParts = null;
    if (startIpRaw && IPv4_REGEX.test(startIpRaw)) {
      ipParts = startIpRaw.split('.').map((n) => parseInt(n, 10));
    }

    const center = this.getViewportCenterNormalized();
    const cols = Math.min(5, Math.ceil(Math.sqrt(total)));
    const rows = Math.ceil(total / cols);
    const stepX = 0.065;
    const stepY = 0.075;

    let idx = 0;
    let lastCreated = null;

    selectedEntries.forEach(({ def, qty }) => {
      for (let i = 1; i <= qty; i++) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const offsetX = (col - (cols - 1) / 2) * stepX;
        const offsetY = (row - (rows - 1) / 2) * stepY;
        const normX = clamp(center.x + offsetX, 0.05, 0.95);
        const normY = clamp(center.y + offsetY, 0.05, 0.95);

        const shortModel = def.name.replace(profile.stripBrandRegex, '');
        const label = prefixName
          ? `${prefixName}-${shortModel}${qty > 1 ? `-${i}` : ''}`
          : `${def.name}${qty > 1 ? ` #${i}` : ''}`;

        let ip = '';
        if (ipParts) {
          const baseNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3] + idx;
          const o1 = (baseNum >>> 24) & 255;
          const o2 = (baseNum >>> 16) & 255;
          const o3 = (baseNum >>> 8) & 255;
          const o4 = baseNum & 255;
          ip = `${o1}.${o2}.${o3}.${o4}`;
        }

        lastCreated = this.deviceManager.addDevice({
          type: def.type,
          name: label,
          category: def.category,
          brand: def.defaultBrand,
          model: def.defaultModel,
          status,
          position: { x: normX, y: normY },
          network: {
            ip,
            vlan
          }
        });

        idx++;
      }
    });

    if (lastCreated) {
      this.deviceManager.selectDevice(lastCreated.id);
    }

    this.hide();
  }

  show(vendorId) {
    if (vendorId && VENDOR_PROFILES[vendorId] && vendorId !== this.activeVendor) {
      this.switchVendor(vendorId);
    }
    this.modalEl.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.modalEl });
    }
  }

  hide() {
    this.modalEl.style.display = 'none';
  }
}

export { VendorQuickInsertModal as MikrotikQuickInsertModal };
