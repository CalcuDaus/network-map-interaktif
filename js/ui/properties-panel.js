/**
 * NetMap — Device Properties Panel (Right Sidebar Component)
 * Comprehensive inspection and editing panel for network devices
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { DEVICE_CATEGORIES, DEVICE_STATUSES, DEVICE_CATALOG } from '../devices/device-library.js';
import { validateIp, validateMac, validateVlan } from '../devices/device-schema.js';
import { formatDecimals } from '../utils/helpers.js';
import { NETWORK_ICON_DEFS, getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { metersToPixels, calculateCoverageArea, formatCoverageArea } from '../devices/wireless-coverage.js';

export class PropertiesPanel {
  /**
   * @param {HTMLElement} container 
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
   */
  constructor(container, deviceManager) {
    this.container = container;
    this.deviceManager = deviceManager;
    this.currentDevice = null;

    this.renderEmpty();
    this.bindEvents();
  }

  renderEmpty() {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="mouse-pointer-click" style="width: 22px; height: 22px;"></i>
        </div>
        <div class="empty-state-text">Belum ada perangkat terpilih</div>
        <div class="empty-state-hint">
          Klik salah satu marker perangkat pada denah atau drag perangkat dari panel kiri untuk membuka konfigurasi teknis.
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Render the form for the selected device
   * @param {Object} device 
   */
  renderDeviceForm(device) {
    this.currentDevice = device;
    const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
    const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;

    // Wireless coverage calculations
    const cov = device.wirelessCoverage || null;
    const radiusMeters = cov?.radiusMeters || 25;
    const radiusPixels = metersToPixels(radiusMeters);
    const areaM2 = calculateCoverageArea(radiusMeters);

    // Open right sidebar if collapsed
    if (!stateManager.getState().ui.rightSidebarOpen) {
      stateManager.toggleSidebar('right');
    }

    this.container.innerHTML = `
      <div class="properties-form-wrapper" style="display: flex; flex-direction: column; gap: 14px;">
        
        <!-- Header Info Card -->
        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div style="flex: 1;">
              <div style="font-size: 10px; font-weight: 700; color: ${cat.color}; text-transform: uppercase; font-family: var(--font-mono);">
                ${cat.name}
              </div>
              <input type="text" id="prop-device-name" value="${this.escapeHtml(device.name)}" 
                     style="background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--text-primary); font-size: 15px; font-weight: 700; width: 100%; padding: 2px 4px; margin-top: 2px;"
                     onfocus="this.style.borderColor='var(--border-focus)'; this.style.backgroundColor='var(--bg-tertiary)';"
                     onblur="this.style.borderColor='transparent'; this.style.backgroundColor='transparent';">
            </div>
            <button id="btn-prop-close" class="btn btn-icon btn-sm" title="Tutup / Batalkan Seleksi">
              <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <span style="font-family: var(--font-mono); color: var(--text-muted); cursor: pointer;" id="btn-copy-id" title="Klik untuk salin ID">
              ID: ${device.id} 📋
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusDef.color};"></span>
              <select id="prop-status" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 2px 6px;">
                <option value="online" ${device.status === 'online' ? 'selected' : ''}>Online</option>
                <option value="offline" ${device.status === 'offline' ? 'selected' : ''}>Offline</option>
                <option value="warning" ${device.status === 'warning' ? 'selected' : ''}>Warning</option>
                <option value="unknown" ${device.status === 'unknown' ? 'selected' : ''}>Unknown</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Section: Ikon & Tampilan Marker -->
        <div class="panel-section">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span class="section-label" style="margin-bottom: 0;">Ikon & Gambar Perangkat</span>
            <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">Kustomisasi Marker</span>
          </div>

          <div class="info-card" style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Live Marker Preview & Style Selector -->
            <div style="display: flex; align-items: center; gap: 12px; background: var(--bg-tertiary); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
              <div id="prop-marker-preview" style="width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: #18350d; border: 2px solid ${cat.color}; border-radius: ${device.markerStyle === 'circle' ? '50%' : device.markerStyle === 'icon-only' ? '4px' : '10px'}; position: relative; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
                ${device.customImage 
                  ? `<img src="${device.customImage}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;" alt="Custom">`
                  : `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">${getDeviceIconSvg(device.customIcon || getDefaultIconForType(device.type), { color: cat.color, size: 28 })}</div>`
                }
                <span style="position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; border-radius: 50%; background-color: ${statusDef.color}; border: 2px solid #18350d;"></span>
              </div>

              <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Bentuk / Desain Marker</label>
                <select id="prop-marker-style" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; padding: 5px 8px; width: 100%;">
                  <option value="rounded" ${(device.markerStyle || 'rounded') === 'rounded' ? 'selected' : ''}>Kotak Melengkung (Default)</option>
                  <option value="circle" ${device.markerStyle === 'circle' ? 'selected' : ''}>Lingkaran / Badge Bulat</option>
                  <option value="icon-only" ${device.markerStyle === 'icon-only' ? 'selected' : ''}>Ikon Melayang (Tanpa Bingkai)</option>
                </select>
                <span style="font-size: 10px; color: var(--text-muted);">Ubah bentuk card perangkat pada denah</span>
              </div>
            </div>

            <!-- Icon Picker Gallery -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Pilih Ikon Vektor Jaringan</label>
                <span style="font-size: 10px; color: var(--text-muted);">18+ Ikon Tersedia</span>
              </div>
              <div id="prop-icon-gallery" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; max-height: 140px; overflow-y: auto; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px;">
                ${Object.keys(NETWORK_ICON_DEFS).map(key => {
                  const def = NETWORK_ICON_DEFS[key];
                  const isCurrent = (!device.customImage && (device.customIcon || getDefaultIconForType(device.type)) === key);
                  return `
                    <button type="button" class="btn-icon-choice ${isCurrent ? 'active' : ''}" 
                            data-icon-key="${key}" title="${def.name}"
                            style="display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1; border-radius: 5px; border: 1px solid ${isCurrent ? 'var(--accent-sky)' : 'transparent'}; background: ${isCurrent ? 'rgba(118, 196, 87, 0.25)' : 'var(--bg-primary)'}; cursor: pointer; padding: 4px; transition: all 120ms ease;">
                      <div style="width: 22px; height: 22px; pointer-events: none; display: flex; align-items: center; justify-content: center;">
                        ${getDeviceIconSvg(key, { color: isCurrent ? 'var(--accent-moss)' : 'var(--text-primary)', size: 20 })}
                      </div>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Insert Custom Image / File Upload -->
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">
                Atau Masukkan Gambar / Foto Sendiri
              </label>

              <div style="display: flex; gap: 6px;">
                <input type="file" id="prop-file-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display: none;">
                <button type="button" id="btn-trigger-upload" class="btn btn-secondary btn-sm" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;">
                  <i data-lucide="upload" style="width: 13px; height: 13px;"></i>
                  <span>Unggah File Gambar...</span>
                </button>
                ${device.customImage ? `
                  <button type="button" id="btn-remove-custom-img" class="btn btn-sm" style="background: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 8px;" title="Hapus Gambar Kustom & Kembali ke Ikon">
                    <i data-lucide="trash" style="width: 13px; height: 13px;"></i>
                  </button>
                ` : ''}
              </div>

              <!-- Custom URL -->
              <div style="display: flex; gap: 6px; margin-top: 2px;">
                <input type="text" id="prop-image-url" placeholder="Atau URL gambar (https://...)" 
                       value="${(device.customImage && !device.customImage.startsWith('data:')) ? this.escapeHtml(device.customImage) : ''}"
                       style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 8px; flex: 1;">
                <button type="button" id="btn-apply-img-url" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 8px;">
                  Terapkan
                </button>
              </div>
              <span style="font-size: 10px; color: var(--text-muted);">Mendukung file PNG, JPG, SVG, WebP. Tersimpan otomatis di IndexedDB.</span>
            </div>

          </div>
        </div>

        <!-- Section: Area Cakupan Nirkabel (Wi-Fi) -->
        <div class="panel-section">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span class="section-label" style="margin-bottom: 0;">Area Cakupan Nirkabel</span>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; color: var(--accent-moss); font-weight: 600;">
              <input type="checkbox" id="prop-coverage-enable" ${cov?.enabled ? 'checked' : ''} style="accent-color: var(--accent-blue);">
              <span>Aktif</span>
            </label>
          </div>

          <div id="prop-coverage-controls" class="info-card" style="display: ${cov?.enabled ? 'flex' : 'none'}; flex-direction: column; gap: 10px;">
            
            <!-- Real-Time Metrics Highlight Box -->
            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Jarak / Radius</span>
                <span id="metric-radius-val" style="font-size: 16px; font-weight: 700; color: ${cov?.color || '#76c457'}; font-family: var(--font-mono);">
                  ${radiusMeters} m
                </span>
                <span id="metric-pixels-val" style="font-size: 10px; color: var(--text-muted);">
                  ≈ ${Math.round(radiusPixels)} px di denah
                </span>
              </div>
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Luas Area Cakupan</span>
                <span id="metric-area-val" style="font-size: 16px; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono);">
                  ${formatCoverageArea(areaM2)}
                </span>
                <span id="metric-diameter-val" style="font-size: 10px; color: var(--text-muted);">
                  Diameter: ${radiusMeters * 2} m
                </span>
              </div>
            </div>

            <!-- Radius Slider & Input -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Atur Jarak Jangkauan (Radius)</label>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <input type="number" id="prop-coverage-meters-input" min="5" max="150" value="${radiusMeters}"
                         style="width: 55px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 2px 4px; text-align: right; font-family: var(--font-mono);">
                  <span style="font-size: 11px; color: var(--text-muted);">Meter</span>
                </div>
              </div>
              <input type="range" id="prop-coverage-radius-slider" min="5" max="150" step="1" value="${radiusMeters}" 
                     style="width: 100%; accent-color: var(--accent-blue); cursor: pointer;">
              <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted);">
                <span>5m</span>
                <span>25m (AP)</span>
                <span>50m (Outdoor)</span>
                <span>150m (PtP)</span>
              </div>
            </div>

            <!-- Quick Presets -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Preset Cepat Jangkauan</label>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="15" data-band="5ghz" title="Indoor 15m (Luas: 707 m²)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  🏢 Indoor 15m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="25" data-band="dual-band" title="Standar AP 25m (Luas: 1.964 m²)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  📶 Standar AP 25m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="40" data-band="dual-band" title="Gedung 40m (Luas: 5.027 m²)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  🏛 Gedung 40m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="60" data-band="2.4ghz" title="Outdoor 60m (Luas: 11.310 m²)" style="font-size: 10px; padding: 4px 6px; justify-content: flex-start;">
                  🌳 Outdoor 60m
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-preset-cov" data-meters="100" data-band="ptp" title="PtP Wireless Bridge 100m (Luas: 31.416 m²)" style="grid-column: span 2; font-size: 10px; padding: 4px 6px; justify-content: center;">
                  📡 PtP Wireless Bridge 100m
                </button>
              </div>
            </div>

            <!-- Band & Visual Options -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; color: var(--text-muted);">Frekuensi / Band</label>
                <select id="prop-coverage-band" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                  <option value="dual-band" ${(cov?.band || 'dual-band') === 'dual-band' ? 'selected' : ''}>Dual-Band (2.4 + 5G)</option>
                  <option value="5ghz" ${cov?.band === '5ghz' ? 'selected' : ''}>5 GHz High-Speed</option>
                  <option value="2.4ghz" ${cov?.band === '2.4ghz' ? 'selected' : ''}>2.4 GHz Wide Range</option>
                  <option value="ptp" ${cov?.band === 'ptp' ? 'selected' : ''}>PtP Wireless Link</option>
                </select>
              </div>

              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; color: var(--text-muted);">Warna Sinyal</label>
                <div style="display: flex; gap: 4px; align-items: center; margin-top: 2px;">
                  ${['#76c457', '#06b6d4', '#f59e0b', '#2a7c13', '#a855f7'].map(c => `
                    <button type="button" class="btn-cov-color ${(cov?.color || '#76c457') === c ? 'active' : ''}" data-color="${c}"
                            style="width: 20px; height: 20px; border-radius: 50%; background: ${c}; border: 2px solid ${(cov?.color || '#76c457') === c ? 'var(--text-primary)' : 'transparent'}; cursor: pointer; padding: 0;"></button>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Toggles: Hatching & Label -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 8px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                <input type="checkbox" id="prop-coverage-hatch" ${cov?.hatch !== false ? 'checked' : ''} style="accent-color: var(--accent-blue);">
                <span>Arsiran Diagonal</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                <input type="checkbox" id="prop-coverage-label" ${cov?.showLabel !== false ? 'checked' : ''} style="accent-color: var(--accent-blue);">
                <span>Label di Denah</span>
              </label>
            </div>

          </div>
        </div>

        <!-- Section: Identitas & Hardware -->
        <div class="panel-section">
          <span class="section-label">Identitas Perangkat</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Merek / Brand</label>
              <input type="text" id="prop-brand" value="${this.escapeHtml(device.brand || '')}" placeholder="Cisco, MikroTik..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Model</label>
              <input type="text" id="prop-model" value="${this.escapeHtml(device.model || '')}" placeholder="RB4011, SG300..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Lokasi Fisik / Ruangan</label>
              <input type="text" id="prop-location" value="${this.escapeHtml(device.location || '')}" placeholder="Gedung Utama Lt. 2 Ruang Server..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
          </div>
        </div>

        <!-- Section: Konfigurasi Jaringan -->
        <div class="panel-section">
          <span class="section-label">Konfigurasi Jaringan</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">IP Address</label>
              <input type="text" id="prop-ip" value="${this.escapeHtml(device.network?.ip || '')}" placeholder="192.168.1.1"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
              <span id="ip-error" style="color: var(--status-offline); font-size: 10px; display: none;">Format IPv4 tidak valid</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Subnet</label>
              <input type="text" id="prop-subnet" value="${this.escapeHtml(device.network?.subnet || '255.255.255.0')}" placeholder="255.255.255.0"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">VLAN ID</label>
              <input type="number" id="prop-vlan" min="1" max="4094" value="${device.network?.vlan || 1}"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">MAC Address</label>
              <input type="text" id="prop-mac" value="${this.escapeHtml(device.network?.mac || '')}" placeholder="00:1A:2B:3C:4D:5E"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono);">
              <span id="mac-error" style="color: var(--status-offline); font-size: 10px; display: none;">Format MAC tidak valid</span>
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Hostname</label>
              <input type="text" id="prop-hostname" value="${this.escapeHtml(device.network?.hostname || '')}" placeholder="router-core.campus.net"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
          </div>
        </div>

        <!-- Section: Operasional & Koordinat -->
        <div class="panel-section">
          <span class="section-label">Operasional & Lokasi Peta</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Firmware</label>
              <input type="text" id="prop-firmware" value="${this.escapeHtml(device.firmware || '')}" placeholder="v7.12..."
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Tgl Instalasi</label>
              <input type="date" id="prop-installed" value="${device.installedAt || ''}"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px;">
            </div>
            <div style="grid-column: span 2; font-size: 11px; color: var(--text-muted); background: var(--bg-secondary); padding: 6px; border-radius: 4px; font-family: var(--font-mono);">
              Koordinat: X=${formatDecimals(device.position.x, 4)}, Y=${formatDecimals(device.position.y, 4)}
            </div>
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Catatan Teknis</label>
              <textarea id="prop-notes" rows="2" placeholder="Catatan maintenance, konfigurasi port, atau riwayat..."
                        style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; resize: vertical;">${this.escapeHtml(device.notes || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          <button id="btn-save-device" class="btn btn-primary" style="width: 100%;">
            <i data-lucide="check" style="width: 15px; height: 15px;"></i>
            <span>Simpan Perubahan</span>
          </button>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="btn-center-device" class="btn btn-secondary btn-sm" title="Pusatkan Kamera ke Perangkat Ini">
              <i data-lucide="crosshair" style="width: 13px; height: 13px;"></i>
              <span>Pusatkan</span>
            </button>
            <button id="btn-duplicate-device" class="btn btn-secondary btn-sm" title="Duplikasi Perangkat">
              <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
              <span>Duplikasi</span>
            </button>
          </div>

          <button id="btn-delete-device" class="btn btn-sm" style="background-color: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3); width: 100%;">
            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            <span>Hapus Perangkat</span>
          </button>
        </div>

      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.bindFormHandlers();
  }

  bindFormHandlers() {
    if (!this.currentDevice) return;
    const devId = this.currentDevice.id;

    // Close button
    document.getElementById('btn-prop-close')?.addEventListener('click', () => {
      this.deviceManager.deselectDevice();
    });

    // Copy ID
    document.getElementById('btn-copy-id')?.addEventListener('click', () => {
      navigator.clipboard.writeText(devId).then(() => {
        alert(`ID "${devId}" berhasil disalin ke clipboard`);
      });
    });

    // Center on map
    document.getElementById('btn-center-device')?.addEventListener('click', () => {
      eventBus.emit('viewport:center-on', this.currentDevice.position);
    });

    // Marker shape style change
    document.getElementById('prop-marker-style')?.addEventListener('change', (e) => {
      const style = e.target.value;
      this.currentDevice.markerStyle = style;
      const updated = this.deviceManager.updateDevice(devId, { markerStyle: style });
      if (updated) this.renderDeviceForm(updated);
    });

    // Icon gallery button click
    const iconButtons = this.container.querySelectorAll('.btn-icon-choice');
    iconButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const iconKey = btn.dataset.iconKey;
        this.currentDevice.customIcon = iconKey;
        this.currentDevice.customImage = '';
        const updated = this.deviceManager.updateDevice(devId, { customIcon: iconKey, customImage: '' });
        if (updated) this.renderDeviceForm(updated);
      });
    });

    // Custom image file upload
    const fileInput = document.getElementById('prop-file-input');
    const uploadBtn = document.getElementById('btn-trigger-upload');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) {
          alert('Ukuran berkas terlalu besar. Silakan pilih gambar di bawah 3MB.');
          return;
        }
        const reader = new FileReader();
        reader.onload = (loadEvt) => {
          const dataUrl = loadEvt.target.result;
          this.currentDevice.customImage = dataUrl;
          const updated = this.deviceManager.updateDevice(devId, { customImage: dataUrl });
          if (updated) this.renderDeviceForm(updated);
        };
        reader.readAsDataURL(file);
      });
    }

    // Remove custom image
    document.getElementById('btn-remove-custom-img')?.addEventListener('click', () => {
      this.currentDevice.customImage = '';
      const updated = this.deviceManager.updateDevice(devId, { customImage: '' });
      if (updated) this.renderDeviceForm(updated);
    });

    // Apply custom image URL
    document.getElementById('btn-apply-img-url')?.addEventListener('click', () => {
      const urlInput = document.getElementById('prop-image-url');
      const url = urlInput?.value.trim();
      if (!url) return;
      this.currentDevice.customImage = url;
      const updated = this.deviceManager.updateDevice(devId, { customImage: url });
      if (updated) this.renderDeviceForm(updated);
    });

    // Wireless Coverage Handlers
    const covEnable = document.getElementById('prop-coverage-enable');
    const covControls = document.getElementById('prop-coverage-controls');
    covEnable?.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      if (covControls) covControls.style.display = isEnabled ? 'flex' : 'none';

      const currentCov = this.currentDevice.wirelessCoverage || {
        radiusMeters: 25,
        color: '#76c457',
        opacity: 0.18,
        hatch: true,
        band: 'dual-band',
        showLabel: true
      };
      this.currentDevice.wirelessCoverage = {
        ...currentCov,
        enabled: isEnabled
      };
      this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
    });

    // Coverage Radius Slider & Number Input
    const covSlider = document.getElementById('prop-coverage-radius-slider');
    const covMetersInput = document.getElementById('prop-coverage-meters-input');
    const updateMetricsDisplay = (meters) => {
      const radiusPx = metersToPixels(meters);
      const area = calculateCoverageArea(meters);
      const metricRadius = document.getElementById('metric-radius-val');
      const metricPixels = document.getElementById('metric-pixels-val');
      const metricArea = document.getElementById('metric-area-val');
      const metricDiameter = document.getElementById('metric-diameter-val');

      if (metricRadius) metricRadius.textContent = `${meters} m`;
      if (metricPixels) metricPixels.textContent = `≈ ${Math.round(radiusPx)} px di denah`;
      if (metricArea) metricArea.textContent = formatCoverageArea(area);
      if (metricDiameter) metricDiameter.textContent = `Diameter: ${meters * 2} m`;
    };

    const handleRadiusChange = (meters) => {
      const validMeters = clamp(parseInt(meters, 10) || 25, 5, 150);
      if (covSlider) covSlider.value = validMeters;
      if (covMetersInput) covMetersInput.value = validMeters;
      updateMetricsDisplay(validMeters);

      if (!this.currentDevice.wirelessCoverage) {
        this.currentDevice.wirelessCoverage = { enabled: true, color: '#76c457', opacity: 0.18, hatch: true, band: 'dual-band', showLabel: true };
      }
      this.currentDevice.wirelessCoverage.radiusMeters = validMeters;
      this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
    };

    covSlider?.addEventListener('input', (e) => handleRadiusChange(e.target.value));
    covMetersInput?.addEventListener('change', (e) => handleRadiusChange(e.target.value));

    // Preset buttons
    this.container.querySelectorAll('.btn-preset-cov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const meters = parseInt(btn.dataset.meters, 10);
        const band = btn.dataset.band;
        if (!this.currentDevice.wirelessCoverage) {
          this.currentDevice.wirelessCoverage = { enabled: true, color: '#76c457', opacity: 0.18, hatch: true, band: 'dual-band', showLabel: true };
        }
        this.currentDevice.wirelessCoverage.enabled = true;
        this.currentDevice.wirelessCoverage.radiusMeters = meters;
        if (band) this.currentDevice.wirelessCoverage.band = band;
        const updated = this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
        if (updated) this.renderDeviceForm(updated);
      });
    });

    // Band select
    document.getElementById('prop-coverage-band')?.addEventListener('change', (e) => {
      if (!this.currentDevice.wirelessCoverage) return;
      this.currentDevice.wirelessCoverage.band = e.target.value;
      this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
    });

    // Color buttons
    this.container.querySelectorAll('.btn-cov-color').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.currentDevice.wirelessCoverage) return;
        const color = btn.dataset.color;
        this.currentDevice.wirelessCoverage.color = color;
        const updated = this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
        if (updated) this.renderDeviceForm(updated);
      });
    });

    // Hatch toggle
    document.getElementById('prop-coverage-hatch')?.addEventListener('change', (e) => {
      if (!this.currentDevice.wirelessCoverage) return;
      this.currentDevice.wirelessCoverage.hatch = e.target.checked;
      this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
    });

    // Label toggle
    document.getElementById('prop-coverage-label')?.addEventListener('change', (e) => {
      if (!this.currentDevice.wirelessCoverage) return;
      this.currentDevice.wirelessCoverage.showLabel = e.target.checked;
      this.deviceManager.updateDevice(devId, { wirelessCoverage: this.currentDevice.wirelessCoverage });
    });

    // Duplicate
    document.getElementById('btn-duplicate-device')?.addEventListener('click', () => {
      this.deviceManager.duplicateDevice(devId);
    });

    // Delete
    document.getElementById('btn-delete-device')?.addEventListener('click', () => {
      if (confirm(`Yakin ingin menghapus perangkat "${this.currentDevice.name}"?`)) {
        this.deviceManager.deleteDevice(devId);
      }
    });

    // Save changes
    document.getElementById('btn-save-device')?.addEventListener('click', () => {
      this.saveForm(devId);
    });
  }

  saveForm(devId) {
    const nameInput = document.getElementById('prop-device-name');
    const brandInput = document.getElementById('prop-brand');
    const modelInput = document.getElementById('prop-model');
    const locInput = document.getElementById('prop-location');
    const statusSelect = document.getElementById('prop-status');
    const ipInput = document.getElementById('prop-ip');
    const subnetInput = document.getElementById('prop-subnet');
    const vlanInput = document.getElementById('prop-vlan');
    const macInput = document.getElementById('prop-mac');
    const hostnameInput = document.getElementById('prop-hostname');
    const fwInput = document.getElementById('prop-firmware');
    const installedInput = document.getElementById('prop-installed');
    const notesInput = document.getElementById('prop-notes');

    const ip = ipInput?.value.trim() || '';
    const mac = macInput?.value.trim() || '';
    const vlan = vlanInput?.value ? parseInt(vlanInput.value, 10) : 1;

    // Validate IP
    let hasError = false;
    const ipError = document.getElementById('ip-error');
    if (!validateIp(ip)) {
      if (ipError) ipError.style.display = 'block';
      hasError = true;
    } else {
      if (ipError) ipError.style.display = 'none';
    }

    // Validate MAC
    const macError = document.getElementById('mac-error');
    if (!validateMac(mac)) {
      if (macError) macError.style.display = 'block';
      hasError = true;
    } else {
      if (macError) macError.style.display = 'none';
    }

    if (hasError) return;

    const styleSelect = document.getElementById('prop-marker-style');
    const markerStyle = styleSelect ? styleSelect.value : (this.currentDevice.markerStyle || 'rounded');

    const updates = {
      name: nameInput?.value.trim() || 'Unnamed Device',
      brand: brandInput?.value.trim() || '',
      model: modelInput?.value.trim() || '',
      location: locInput?.value.trim() || '',
      status: statusSelect?.value || 'unknown',
      customIcon: this.currentDevice.customIcon,
      customImage: this.currentDevice.customImage,
      markerStyle: markerStyle,
      wirelessCoverage: this.currentDevice.wirelessCoverage,
      network: {
        ip: ip,
        subnet: subnetInput?.value.trim() || '255.255.255.0',
        vlan: vlan,
        mac: mac,
        hostname: hostnameInput?.value.trim() || ''
      },
      firmware: fwInput?.value.trim() || '',
      installedAt: installedInput?.value || '',
      notes: notesInput?.value.trim() || ''
    };

    const updated = this.deviceManager.updateDevice(devId, updates);
    if (updated) {
      this.renderDeviceForm(updated);
    }
  }

  bindEvents() {
    eventBus.on('device:selected', (device) => {
      this.renderDeviceForm(device);
    });

    eventBus.on('device:deselected', () => {
      this.currentDevice = null;
      this.renderEmpty();
    });

    eventBus.on('device:deleted', ({ deviceId }) => {
      if (this.currentDevice?.id === deviceId) {
        this.currentDevice = null;
        this.renderEmpty();
      }
    });

    // Update coordinates display if moved while panel is open
    eventBus.on('device:moved', ({ deviceId, position }) => {
      if (this.currentDevice?.id === deviceId) {
        this.currentDevice.position = position;
        const coordEl = this.container.querySelector('[style*="Koordinat:"]');
        if (coordEl) {
          coordEl.textContent = `Koordinat: X=${formatDecimals(position.x, 4)}, Y=${formatDecimals(position.y, 4)}`;
        }
      }
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }
}
