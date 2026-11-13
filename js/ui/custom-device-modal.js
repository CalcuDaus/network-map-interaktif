/**
 * NetMap — Custom Device Modal
 * Interactive dialog to create custom network devices with vector icons or custom uploaded images,
 * save them to the custom device library palette, and directly place them onto the map.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';
import { NETWORK_ICON_DEFS, getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { clamp } from '../utils/helpers.js';

export class CustomDeviceModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('./device-palette.js').DevicePalette} options.devicePalette
   * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
   */
  constructor({ deviceManager, devicePalette, mapEngine = null }) {
    this.deviceManager = deviceManager;
    this.devicePalette = devicePalette;
    this.mapEngine = mapEngine;

    this.modalEl = null;
    this.targetCoords = null; // { normX, normY } if opened from map click / context menu

    // Form state
    this.activeVisualTab = 'icon'; // 'icon' | 'image'
    this.selectedIcon = 'router';
    this.uploadedImageDataUrl = '';
    this.markerStyle = 'rounded'; // 'rounded' | 'circle' | 'icon-only'
    this.markerColor = '#2a7c13';

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'custom-device-modal';
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
      <div style="background-color: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color, #e5cca0); border-radius: 12px; width: 100%; max-width: 780px; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 54px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(42, 124, 19, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13);">
              <i data-lucide="sparkles" style="width: 17px; height: 17px;"></i>
            </div>
            <div>
              <span style="font-size: 15px; font-weight: 700; color: var(--text-primary, #18350d); display: block; line-height: 1.2;">Tambah Perangkat Kustom</span>
              <span style="font-size: 11px; color: var(--text-muted, #678458);">Buat perangkat baru dengan ikon vektor atau gambar kustom Anda sendiri</span>
            </div>
          </div>
          <button id="btn-custom-dev-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Scrollable Body with 2-Column Grid -->
        <div style="padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; flex: 1;">
          
          <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 16px;">
            
            <!-- Column 1: Device Metadata & Network Config -->
            <div style="display: flex; flex-direction: column; gap: 12px;">
              
              <!-- Basic Info Card -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                <span class="section-label" style="font-size: 11px; font-weight: 700; color: var(--accent-blue, #2a7c13); text-transform: uppercase; margin-bottom: 2px;">
                  1. Identitas Perangkat
                </span>

                <div style="display: flex; flex-direction: column; gap: 3px;">
                  <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Nama Perangkat *</label>
                  <input type="text" id="cd-name" placeholder="contoh: OLT GPON Gedung A / Smart TV" 
                         style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 7px 10px; font-size: 12.5px; color: var(--text-primary); font-family: inherit;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Kategori Jaringan</label>
                    <select id="cd-category" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                      <option value="core">Core Network</option>
                      <option value="distribution" selected>Distribution</option>
                      <option value="infrastructure">Infrastructure</option>
                      <option value="endDevice">End Device</option>
                    </select>
                  </div>

                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Tipe / Basis</label>
                    <select id="cd-type" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                      <option value="router">Router</option>
                      <option value="main-router">Core Router / CCR</option>
                      <option value="switch">Switch</option>
                      <option value="core-switch">Core / L3 Switch</option>
                      <option value="poe-switch">PoE Switch</option>
                      <option value="access-point">Access Point (Wi-Fi)</option>
                      <option value="wireless-bridge">Wireless Bridge PtP</option>
                      <option value="server">Physical Server</option>
                      <option value="cctv">IP Camera / CCTV</option>
                      <option value="computer">Computer / PC</option>
                      <option value="storage">NAS / SAN Storage</option>
                      <option value="firewall">Firewall</option>
                      <option value="gateway">Internet Gateway</option>
                      <option value="network-pole">Tiang / Tower</option>
                      <option value="odp">ODP / OTB Fiber</option>
                      <option value="network-rack">Network Rack</option>
                      <option value="printer">Printer</option>
                      <option value="ip-phone">VoIP Phone</option>
                      <option value="iot">IoT Device</option>
                      <option value="laptop">Laptop</option>
                      <option value="custom">Perangkat Kustom Lainnya</option>
                      <optgroup label="MikroTik Hardware">
                        <option value="mikrotik-ccr2004">MikroTik CCR (Rack Router)</option>
                        <option value="mikrotik-rb5009">MikroTik RB5009 / RB4011</option>
                        <option value="mikrotik-hex">MikroTik hEX / L009</option>
                        <option value="mikrotik-crs326">MikroTik CRS Switch</option>
                        <option value="mikrotik-crs328">MikroTik CRS PoE Switch</option>
                        <option value="mikrotik-cap-ax">MikroTik cAP / hAP Wi-Fi</option>
                        <option value="mikrotik-lhg5">MikroTik LHG PtP Dish</option>
                        <option value="mikrotik-sxtsq">MikroTik SXTsq / mANTBox</option>
                      </optgroup>
                      <optgroup label="Ruijie / Reyee Hardware">
                        <option value="ruijie-eg210g">Ruijie EG210G-P / EG310GH Gateway</option>
                        <option value="ruijie-nbr6210">Ruijie NBR6210 Enterprise Gateway</option>
                        <option value="ruijie-s5750">Ruijie RG-S5750 Core L3 Switch</option>
                        <option value="ruijie-nbs5200">Ruijie NBS5200 / NBS3100 Switch</option>
                        <option value="ruijie-es218gc">Ruijie ES218GC-P / ES209GC-P PoE</option>
                        <option value="ruijie-rap2260">Ruijie RAP2260 / RAP2200 Ceiling AP</option>
                        <option value="ruijie-rap1200">Ruijie RAP1200 In-Wall AP</option>
                        <option value="ruijie-rap6260">Ruijie RAP6260 Outdoor Wi-Fi 6</option>
                        <option value="ruijie-est350">Ruijie RG-EST350 Wireless Bridge</option>
                      </optgroup>
                      <optgroup label="TP-Link Switch & Hub">
                        <option value="tplink-ls1005g">TP-Link LS1005G / SG1008D Hub</option>
                        <option value="tplink-sg108pe">TP-Link TL-SG108E / SG108PE PoE+</option>
                        <option value="tplink-sg1016d">TP-Link TL-SG1016D / SG1024D Switch</option>
                        <option value="tplink-sg2428p">TP-Link Omada SG2210MP / SG2428P</option>
                        <option value="tplink-sg3428x">TP-Link JetStream SG3428X / SX3016F</option>
                      </optgroup>
                      <optgroup label="Ruijie / Reyee Hardware">
                        <option value="ruijie-eg210g">Ruijie EG210G-P / EG310GH Gateway</option>
                        <option value="ruijie-nbr6210">Ruijie NBR6210 Enterprise Gateway</option>
                        <option value="ruijie-s5750">Ruijie RG-S5750 Core L3 Switch</option>
                        <option value="ruijie-nbs5200">Ruijie NBS5200 / NBS3100 Switch</option>
                        <option value="ruijie-es218gc">Ruijie ES218GC-P / ES209GC-P PoE</option>
                        <option value="ruijie-rap2260">Ruijie RAP2260 / RAP2200 Ceiling AP</option>
                        <option value="ruijie-rap1200">Ruijie RAP1200 In-Wall AP</option>
                        <option value="ruijie-rap6260">Ruijie RAP6260 Outdoor Wi-Fi 6</option>
                        <option value="ruijie-est350">Ruijie RG-EST350 Wireless Bridge</option>
                      </optgroup>
                      <optgroup label="TP-Link Switch & Hub">
                        <option value="tplink-ls1005g">TP-Link LS1005G / SG1008D Hub</option>
                        <option value="tplink-sg108pe">TP-Link TL-SG108E / SG108PE PoE+</option>
                        <option value="tplink-sg1016d">TP-Link TL-SG1016D / SG1024D Switch</option>
                        <option value="tplink-sg2428p">TP-Link Omada SG2210MP / SG2428P</option>
                        <option value="tplink-sg3428x">TP-Link JetStream SG3428X / SX3016F</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Merk / Brand</label>
                    <input type="text" id="cd-brand" placeholder="contoh: MikroTik, Cisco, Ruijie" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Model / Seri</label>
                    <input type="text" id="cd-model" placeholder="contoh: CCR2004, RG-ES205" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 3px;">
                  <label style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">Status Operasional Awal</label>
                  <select id="cd-status" style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); font-family: inherit;">
                    <option value="online">Online (Aktif / Normal)</option>
                    <option value="warning">Warning (Dalam Perawatan / Waspada)</option>
                    <option value="offline">Offline (Tidak Aktif)</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <!-- Network Config Card -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 8px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                <span class="section-label" style="font-size: 11px; font-weight: 700; color: var(--accent-blue, #2a7c13); text-transform: uppercase; margin-bottom: 2px;">
                  2. Konfigurasi Jaringan (Opsional)
                </span>
                
                <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 10px;">
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Alamat IP (IPv4)</label>
                    <input type="text" id="cd-ip" placeholder="192.168.1.100" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; font-family: var(--font-mono); color: var(--text-primary);">
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">VLAN ID</label>
                    <input type="number" id="cd-vlan" min="1" max="4094" placeholder="1" value="1" 
                           style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; font-family: var(--font-mono); color: var(--text-primary);">
                  </div>
                </div>
              </div>

              <!-- Wireless Coverage Card -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                  <input type="checkbox" id="cd-wireless-enable" style="accent-color: var(--accent-blue, #2a7c13); width: 15px; height: 15px;">
                  <span style="font-size: 11.5px; font-weight: 700; color: var(--text-primary);">Aktifkan Area Cakupan Sinyal Nirkabel</span>
                </label>

                <div id="cd-wireless-controls" style="display: none; flex-direction: column; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--border-light, #edd8b5);">
                  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
                    <span style="font-weight: 600; color: var(--text-primary);">Radius Jangkauan:</span>
                    <span id="cd-radius-display" style="font-weight: 700; color: var(--accent-blue, #2a7c13); font-family: var(--font-mono);">30 meter</span>
                  </div>
                  <input type="range" id="cd-wireless-radius" min="10" max="250" step="5" value="30" style="accent-color: var(--accent-blue, #2a7c13); width: 100%;">
                  
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <select id="cd-wireless-band" style="background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 6px; font-size: 11px;">
                      <option value="dual-band">Dual-Band (2.4 & 5 GHz)</option>
                      <option value="5ghz">5 GHz High-Speed</option>
                      <option value="2.4ghz">2.4 GHz Long-Range</option>
                      <option value="ptp">PtP Bridge Directive</option>
                    </select>
                    <input type="color" id="cd-wireless-color" value="#76c457" title="Warna Lingkaran Sinyal" style="width: 100%; height: 26px; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; padding: 1px;">
                  </div>
                </div>
              </div>

            </div>

            <!-- Column 2: Visual Marker, Icon & Custom Image Selection -->
            <div style="display: flex; flex-direction: column; gap: 12px;">
              
              <!-- Live Preview Card -->
              <div class="info-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 14px; text-align: center;">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
                  Live Marker Preview (Tampilan Peta)
                </span>

                <div id="cd-marker-preview-box" style="width: 68px; height: 68px; display: flex; align-items: center; justify-content: center; background: #18350d; border: 2.5px solid var(--accent-cyan, #76c457); border-radius: 12px; position: relative; box-shadow: 0 6px 14px rgba(0,0,0,0.3); transition: all 0.2s ease;">
                  <div id="cd-preview-graphic" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                    <!-- Injected via updatePreview -->
                  </div>
                  <span id="cd-preview-status-dot" style="position: absolute; top: -4px; right: -4px; width: 11px; height: 11px; border-radius: 50%; background-color: #22c55e; border: 2px solid #18350d;"></span>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
                  <span id="cd-preview-name" style="font-size: 12px; font-weight: 700; color: var(--text-primary); line-height: 1.2;">
                    Perangkat Kustom
                  </span>
                  <span id="cd-preview-sub" style="font-size: 10.5px; color: var(--text-muted);">
                    Brand Model
                  </span>
                </div>

                <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-light, #edd8b5); padding-top: 8px;">
                  <label style="font-size: 11px; font-weight: 600; color: var(--text-primary); text-align: left;">Bentuk Marker</label>
                  <select id="cd-marker-style" style="background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; color: var(--text-primary);">
                    <option value="rounded">Kotak Melengkung (Default)</option>
                    <option value="circle">Lingkaran (Circular Badge)</option>
                    <option value="icon-only">Hanya Ikon Transparan</option>
                  </select>
                </div>
              </div>

              <!-- Visual Selector: Tabs for Icon vs Image -->
              <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
                
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span class="section-label" style="font-size: 11px; font-weight: 700; color: var(--accent-blue); text-transform: uppercase; margin: 0;">
                    3. Desain Visual
                  </span>

                  <!-- Visual Mode Switcher -->
                  <div class="segmented-control" style="font-size: 11px;">
                    <button type="button" id="tab-btn-icon" class="segmented-item active" style="padding: 2px 8px; font-size: 11px;">
                      <i data-lucide="shapes" style="width: 12px; height: 12px;"></i>
                      <span>Ikon</span>
                    </button>
                    <button type="button" id="tab-btn-image" class="segmented-item" style="padding: 2px 8px; font-size: 11px;">
                      <i data-lucide="image" style="width: 12px; height: 12px;"></i>
                      <span>Upload Foto</span>
                    </button>
                  </div>
                </div>

                <!-- Tab 1: Vector Icons Grid -->
                <div id="tab-content-icon" style="display: flex; flex-direction: column; gap: 6px;">
                  <span style="font-size: 10.5px; color: var(--text-muted);">Pilih salah satu ikon jaringan di bawah:</span>
                  <div id="cd-icon-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; max-height: 140px; overflow-y: auto; padding: 4px; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-elevated);">
                    <!-- Injected dynamically -->
                  </div>
                </div>

                <!-- Tab 2: Custom Image Upload -->
                <div id="tab-content-image" style="display: none; flex-direction: column; gap: 8px;">
                  <div id="cd-dropzone" style="border: 2px dashed var(--accent-blue); border-radius: 8px; padding: 14px; text-align: center; background: rgba(42, 124, 19, 0.05); cursor: pointer; transition: all 0.2s ease;">
                    <i data-lucide="upload-cloud" style="width: 26px; height: 26px; color: var(--accent-blue); margin: 0 auto 6px auto; display: block;"></i>
                    <span style="font-size: 11.5px; font-weight: 600; color: var(--text-primary); display: block;">Pilih File Gambar Komputer</span>
                    <span style="font-size: 10px; color: var(--text-muted); display: block;">PNG, JPG, SVG, WebP (maks 2MB)</span>
                    <input type="file" id="cd-file-input" accept="image/*" style="display: none;">
                  </div>

                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 10px; color: var(--text-muted);">atau URL:</span>
                    <input type="text" id="cd-url-input" placeholder="https://.../icon.png" style="flex: 1; font-size: 11px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-elevated);">
                    <button type="button" id="btn-apply-url" class="btn btn-secondary btn-sm" style="font-size: 10.5px; padding: 4px 8px;">Gunakan</button>
                  </div>

                  <div id="cd-image-preview-row" style="display: none; align-items: center; justify-content: space-between; background: var(--bg-tertiary); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <img id="cd-image-thumb" src="" style="width: 24px; height: 24px; object-fit: contain; border-radius: 3px;" alt="Custom">
                      <span style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Gambar Kustom Terpasang</span>
                    </div>
                    <button type="button" id="btn-remove-image" class="btn btn-danger btn-sm" style="font-size: 10.5px; padding: 2px 6px;" title="Hapus gambar & gunakan ikon">
                      Hapus
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>

          <!-- Bottom Option: Save to Palette Template -->
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="cd-save-template-check" checked style="accent-color: var(--accent-blue); width: 16px; height: 16px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">
                ⭐ Simpan ke Library Perangkat Kustom (Sidebar) agar bisa digunakan berulang kali
              </span>
            </label>
            <span style="font-size: 10.5px; color: var(--text-muted);">
              Tersimpan permanen di Library
            </span>
          </div>

        </div>

        <!-- Footer Actions -->
        <div style="height: 58px; border-top: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <button id="btn-custom-dev-cancel" class="btn btn-secondary btn-sm" style="font-size: 12px; padding: 6px 14px;">
            Batal
          </button>
          
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btn-custom-dev-save-only" class="btn btn-secondary btn-sm" style="font-size: 12px; padding: 6px 14px;" title="Hanya simpan template ke sidebar tanpa menaruh ke peta sekarang">
              <i data-lucide="bookmark" style="width: 14px; height: 14px;"></i>
              <span>Simpan ke Library Saja</span>
            </button>
            <button id="btn-custom-dev-place-now" class="btn btn-primary btn-sm" style="font-size: 12px; padding: 6px 16px; background-color: var(--accent-blue, #2a7c13); color: #fff8cf; font-weight: 600;">
              <i data-lucide="check" style="width: 14px; height: 14px;"></i>
              <span>Pasang ke Peta Sekarang</span>
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(this.modalEl);
    this.populateIconGrid();
  }

  /**
   * Populate the selectable vector network icons in the grid
   */
  populateIconGrid() {
    const grid = this.modalEl.querySelector('#cd-icon-grid');
    if (!grid) return;

    let html = '';
    const availableKeys = Object.keys(NETWORK_ICON_DEFS);

    availableKeys.forEach((key) => {
      const def = NETWORK_ICON_DEFS[key];
      const isSelected = key === this.selectedIcon;
      const activeBorder = isSelected ? 'border: 2px solid var(--accent-blue, #2a7c13); background: rgba(42,124,19,0.12);' : 'border: 1px solid var(--border-light, #edd8b5); background: var(--bg-primary, #fff8cf);';

      html += `
        <div class="custom-icon-choice" data-icon-key="${key}" title="${def.name}"
             style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 6px 4px; border-radius: 6px; cursor: pointer; transition: all 0.12s ease; ${activeBorder}">
          <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
            ${getDeviceIconSvg(key, { color: '#2a7c13', size: 22 })}
          </div>
          <span style="font-size: 9px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
            ${def.name.split(' ')[0]}
          </span>
        </div>
      `;
    });

    grid.innerHTML = html;

    // Attach click events
    grid.querySelectorAll('.custom-icon-choice').forEach((el) => {
      el.addEventListener('click', () => {
        const iconKey = el.getAttribute('data-icon-key');
        this.selectedIcon = iconKey;
        this.uploadedImageDataUrl = '';
        this.activeVisualTab = 'icon';
        this.updateIconSelectionUI();
        this.updateLivePreview();
      });
    });
  }

  updateIconSelectionUI() {
    const grid = this.modalEl.querySelector('#cd-icon-grid');
    if (!grid) return;

    grid.querySelectorAll('.custom-icon-choice').forEach((el) => {
      const key = el.getAttribute('data-icon-key');
      const isSelected = key === this.selectedIcon && !this.uploadedImageDataUrl;
      if (isSelected) {
        el.style.border = '2px solid var(--accent-blue, #2a7c13)';
        el.style.background = 'rgba(42,124,19,0.12)';
      } else {
        el.style.border = '1px solid var(--border-light, #edd8b5)';
        el.style.background = 'var(--bg-primary, #fff8cf)';
      }
    });
  }

  bindEvents() {
    // 1. Close buttons
    this.modalEl.querySelector('#btn-custom-dev-close')?.addEventListener('click', () => this.hide());
    this.modalEl.querySelector('#btn-custom-dev-cancel')?.addEventListener('click', () => this.hide());

    // 2. Backdrop click
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.hide();
    });

    // 3. Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl.style.display === 'flex') {
        this.hide();
      }
    });

    // 4. Input live preview bindings
    const inputs = ['#cd-name', '#cd-brand', '#cd-model', '#cd-category', '#cd-type', '#cd-status', '#cd-marker-style'];
    inputs.forEach((sel) => {
      const el = this.modalEl.querySelector(sel);
      if (el) {
        el.addEventListener('input', () => this.updateLivePreview());
        el.addEventListener('change', () => this.updateLivePreview());
      }
    });

    // When base type changes, auto-select corresponding icon if not manually altered
    this.modalEl.querySelector('#cd-type')?.addEventListener('change', (e) => {
      const baseType = e.target.value;
      const defaultIcon = getDefaultIconForType(baseType);
      if (defaultIcon && !this.uploadedImageDataUrl) {
        this.selectedIcon = defaultIcon;
        this.updateIconSelectionUI();
        this.updateLivePreview();
      }
    });

    // 5. Visual Mode Switcher (Icon vs Image)
    const tabIcon = this.modalEl.querySelector('#tab-btn-icon');
    const tabImage = this.modalEl.querySelector('#tab-btn-image');
    const contentIcon = this.modalEl.querySelector('#tab-content-icon');
    const contentImage = this.modalEl.querySelector('#tab-content-image');

    tabIcon?.addEventListener('click', () => {
      this.activeVisualTab = 'icon';
      tabIcon.classList.add('active');
      tabImage.classList.remove('active');
      contentIcon.style.display = 'flex';
      contentImage.style.display = 'none';
      this.updateLivePreview();
    });

    tabImage?.addEventListener('click', () => {
      this.activeVisualTab = 'image';
      tabImage.classList.add('active');
      tabIcon.classList.remove('active');
      contentImage.style.display = 'flex';
      contentIcon.style.display = 'none';
      this.updateLivePreview();
    });

    // 6. File Upload Handling
    const dropzone = this.modalEl.querySelector('#cd-dropzone');
    const fileInput = this.modalEl.querySelector('#cd-file-input');

    dropzone?.addEventListener('click', () => fileInput?.click());

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent-cyan)';
      dropzone.style.background = 'rgba(118, 196, 87, 0.15)';
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--accent-blue)';
      dropzone.style.background = 'rgba(42, 124, 19, 0.05)';
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent-blue)';
      dropzone.style.background = 'rgba(42, 124, 19, 0.05)';
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        this.processImageFile(file);
      }
    });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        this.processImageFile(file);
      }
    });

    // 7. URL image handling
    this.modalEl.querySelector('#btn-apply-url')?.addEventListener('click', () => {
      const urlInput = this.modalEl.querySelector('#cd-url-input');
      const url = urlInput?.value?.trim();
      if (url) {
        this.setImageSource(url);
      }
    });

    // 8. Remove image button
    this.modalEl.querySelector('#btn-remove-image')?.addEventListener('click', () => {
      this.uploadedImageDataUrl = '';
      const previewRow = this.modalEl.querySelector('#cd-image-preview-row');
      if (previewRow) previewRow.style.display = 'none';
      this.updateLivePreview();
    });

    // 9. Wireless Coverage Toggle
    const wirelessToggle = this.modalEl.querySelector('#cd-wireless-enable');
    const wirelessControls = this.modalEl.querySelector('#cd-wireless-controls');
    const wirelessRadius = this.modalEl.querySelector('#cd-wireless-radius');
    const radiusDisplay = this.modalEl.querySelector('#cd-radius-display');

    wirelessToggle?.addEventListener('change', () => {
      wirelessControls.style.display = wirelessToggle.checked ? 'flex' : 'none';
    });

    wirelessRadius?.addEventListener('input', () => {
      if (radiusDisplay) radiusDisplay.textContent = `${wirelessRadius.value} meter`;
    });

    // 10. Action: Save to Library Only
    this.modalEl.querySelector('#btn-custom-dev-save-only')?.addEventListener('click', () => {
      this.saveCustomDevice(false);
    });

    // 11. Action: Place Now
    this.modalEl.querySelector('#btn-custom-dev-place-now')?.addEventListener('click', () => {
      this.saveCustomDevice(true);
    });

    // 12. Listen to global event to open custom device modal
    eventBus.on('modal:open-custom-device', (coords) => {
      this.show(coords);
    });
  }

  processImageFile(file) {
    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file gambar melebihi batas 2MB. Pilih file gambar yang lebih kecil.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      this.setImageSource(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  setImageSource(src) {
    this.uploadedImageDataUrl = src;
    const previewRow = this.modalEl.querySelector('#cd-image-preview-row');
    const thumb = this.modalEl.querySelector('#cd-image-thumb');
    if (previewRow && thumb) {
      thumb.src = src;
      previewRow.style.display = 'flex';
    }
    this.updateLivePreview();
  }

  updateLivePreview() {
    const nameInput = this.modalEl.querySelector('#cd-name');
    const brandInput = this.modalEl.querySelector('#cd-brand');
    const modelInput = this.modalEl.querySelector('#cd-model');
    const catSelect = this.modalEl.querySelector('#cd-category');
    const statusSelect = this.modalEl.querySelector('#cd-status');
    const styleSelect = this.modalEl.querySelector('#cd-marker-style');

    const name = nameInput?.value?.trim() || 'Perangkat Kustom';
    const brand = brandInput?.value?.trim() || '';
    const model = modelInput?.value?.trim() || '';
    const category = catSelect?.value || 'core';
    const status = statusSelect?.value || 'online';
    const shape = styleSelect?.value || 'rounded';

    const catDef = DEVICE_CATEGORIES[category] || DEVICE_CATEGORIES.core;
    const statusDef = DEVICE_STATUSES[status] || DEVICE_STATUSES.online;

    // Update text labels
    const prevName = this.modalEl.querySelector('#cd-preview-name');
    const prevSub = this.modalEl.querySelector('#cd-preview-sub');
    if (prevName) prevName.textContent = name;
    if (prevSub) prevSub.textContent = brand ? `${brand} ${model}` : (model || catDef.name);

    // Update marker box appearance
    const box = this.modalEl.querySelector('#cd-marker-preview-box');
    const dot = this.modalEl.querySelector('#cd-preview-status-dot');
    const graphicContainer = this.modalEl.querySelector('#cd-preview-graphic');

    if (box) {
      box.style.borderColor = catDef.color;
      if (shape === 'circle') {
        box.style.borderRadius = '50%';
      } else if (shape === 'icon-only') {
        box.style.borderRadius = '6px';
        box.style.background = 'transparent';
        box.style.borderColor = 'transparent';
        box.style.boxShadow = 'none';
      } else {
        box.style.borderRadius = '12px';
        box.style.background = '#18350d';
        box.style.boxShadow = '0 6px 14px rgba(0,0,0,0.3)';
      }
    }

    if (dot) {
      dot.style.backgroundColor = statusDef.color;
      dot.style.display = shape === 'icon-only' ? 'none' : 'block';
    }

    // Render graphic inside marker
    if (graphicContainer) {
      if (this.uploadedImageDataUrl) {
        graphicContainer.innerHTML = `<img src="${this.uploadedImageDataUrl}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;" alt="Custom">`;
      } else {
        const svg = getDeviceIconSvg(this.selectedIcon, { color: catDef.color, size: 28 });
        graphicContainer.innerHTML = svg;
      }
    }
  }

  /**
   * Save and process the custom device creation
   * @param {boolean} placeNow 
   */
  saveCustomDevice(placeNow = true) {
    const nameInput = this.modalEl.querySelector('#cd-name');
    const name = nameInput?.value?.trim();

    if (!name) {
      alert('Silakan masukkan Nama Perangkat terlebih dahulu.');
      nameInput?.focus();
      return;
    }

    const category = this.modalEl.querySelector('#cd-category')?.value || 'core';
    const type = this.modalEl.querySelector('#cd-type')?.value || 'custom';
    const brand = this.modalEl.querySelector('#cd-brand')?.value?.trim() || '';
    const model = this.modalEl.querySelector('#cd-model')?.value?.trim() || '';
    const status = this.modalEl.querySelector('#cd-status')?.value || 'online';
    const markerStyle = this.modalEl.querySelector('#cd-marker-style')?.value || 'rounded';

    // Network fields
    const ip = this.modalEl.querySelector('#cd-ip')?.value?.trim() || '';
    const vlan = parseInt(this.modalEl.querySelector('#cd-vlan')?.value || '1', 10);

    // Wireless coverage
    const wirelessEnabled = Boolean(this.modalEl.querySelector('#cd-wireless-enable')?.checked);
    let wirelessCoverage = null;
    if (wirelessEnabled) {
      const radius = parseFloat(this.modalEl.querySelector('#cd-wireless-radius')?.value || '30');
      const band = this.modalEl.querySelector('#cd-wireless-band')?.value || 'dual-band';
      const color = this.modalEl.querySelector('#cd-wireless-color')?.value || '#76c457';
      wirelessCoverage = {
        enabled: true,
        radiusMeters: radius,
        band,
        color,
        opacity: 0.18,
        hatch: true,
        showLabel: true
      };
    }

    // Build custom payload
    const customDeviceData = {
      name,
      category,
      type,
      brand,
      model,
      status,
      markerStyle,
      customIcon: this.selectedIcon,
      customImage: this.uploadedImageDataUrl || '',
      network: {
        ip: ip,
        vlan: isNaN(vlan) ? 1 : vlan,
        subnet: '255.255.255.0'
      },
      wirelessCoverage
    };

    // 1. Save to DevicePalette Library if checked
    const saveToTemplate = Boolean(this.modalEl.querySelector('#cd-save-template-check')?.checked);
    if (saveToTemplate && this.devicePalette) {
      this.devicePalette.addCustomTemplate(customDeviceData);
    }

    // 2. Place on canvas if requested
    if (placeNow) {
      let position = { x: 0.5, y: 0.5 };

      if (this.targetCoords && typeof this.targetCoords.normX === 'number') {
        position = {
          x: clamp(this.targetCoords.normX, 0.05, 0.95),
          y: clamp(this.targetCoords.normY, 0.05, 0.95)
        };
      } else if (this.mapEngine?.stage) {
        // Calculate center of visible viewport
        const stage = this.mapEngine.stage;
        const scale = stage.scaleX() || 1;
        const naturalW = this.mapEngine.mapDimensions?.width || 1024;
        const naturalH = this.mapEngine.mapDimensions?.height || 1024;
        position = {
          x: clamp((-stage.x() + stage.width() / 2) / (scale * naturalW), 0.05, 0.95),
          y: clamp((-stage.y() + stage.height() / 2) / (scale * naturalH), 0.05, 0.95)
        };
      }

      const placedDevice = this.deviceManager.addDevice({
        ...customDeviceData,
        position
      });

      this.deviceManager.selectDevice(placedDevice.id);
      stateManager.setMode('select');

      this.showToast(`✨ Perangkat kustom "${name}" berhasil ditambahkan ke peta!`);
    } else {
      this.showToast(`⭐ Perangkat kustom "${name}" berhasil disimpan ke Library Sidebar!`);
    }

    this.hide();
  }

  /**
   * Open and display the modal dialog
   * @param {Object} [options]
   * @param {number} [options.normX]
   * @param {number} [options.normY]
   */
  show(options = null) {
    this.targetCoords = options && typeof options.normX === 'number' ? options : null;

    // Reset default form state
    const nameInput = this.modalEl.querySelector('#cd-name');
    if (nameInput) {
      nameInput.value = '';
    }

    this.uploadedImageDataUrl = '';
    const previewRow = this.modalEl.querySelector('#cd-image-preview-row');
    if (previewRow) previewRow.style.display = 'none';

    // Default icon
    this.selectedIcon = 'router';
    this.updateIconSelectionUI();

    // Default tab
    const tabIcon = this.modalEl.querySelector('#tab-btn-icon');
    const tabImage = this.modalEl.querySelector('#tab-btn-image');
    const contentIcon = this.modalEl.querySelector('#tab-content-icon');
    const contentImage = this.modalEl.querySelector('#tab-content-image');
    if (tabIcon && tabImage && contentIcon && contentImage) {
      tabIcon.classList.add('active');
      tabImage.classList.remove('active');
      contentIcon.style.display = 'flex';
      contentImage.style.display = 'none';
    }

    this.updateLivePreview();

    this.modalEl.style.display = 'flex';
    if (window.lucide) {
      window.lucide.createIcons({ root: this.modalEl });
    }

    setTimeout(() => {
      nameInput?.focus();
    }, 50);
  }

  hide() {
    this.modalEl.style.display = 'none';
    this.targetCoords = null;
  }

  showToast(message) {
    let toast = document.getElementById('netmap-action-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'netmap-action-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(8px)';
    }, 2400);
  }
}

