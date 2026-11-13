/**
 * NetMap — Connection Properties Panel (Right Sidebar Component)
 * Comprehensive inspection, physical engineering calculator & network metrics panel
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { 
  CABLE_CATEGORIES, 
  CABLE_STATUSES, 
  getMediaTypeByCableCategory, 
  estimateFiberAttenuation, 
  checkEthernetLengthLimit,
  calculateAccurateCableLength,
  calculateNetworkPerformanceMetrics
} from '../connections/cable-library.js';

export class ConnectionPanel {
  /**
   * @param {HTMLElement} container 
   * @param {import('../connections/cable-manager.js').CableManager} cableManager 
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
   */
  constructor(container, cableManager, deviceManager) {
    this.container = container;
    this.cableManager = cableManager;
    this.deviceManager = deviceManager;
    this.currentCable = null;

    this.bindEvents();
  }

  /**
   * Render the form for the selected cable
   * @param {Object} cable 
   */
  renderCableForm(cable) {
    this.currentCable = cable;
    const catDef = CABLE_CATEGORIES[cable.cableCategory] || CABLE_CATEGORIES['cat6'];
    const statusDef = CABLE_STATUSES[cable.status] || CABLE_STATUSES.active;
    const isCustomColor = Boolean(cable.customColor && cable.customColor.trim());
    const activeColor = isCustomColor ? cable.customColor.trim() : catDef.color;

    const sourceDev = this.deviceManager.getDeviceById(cable.source);
    const destDev = this.deviceManager.getDeviceById(cable.destination);

    // Open right sidebar if collapsed
    if (!stateManager.getState().ui.rightSidebarOpen) {
      stateManager.toggleSidebar('right');
    }

    const details = cable.details || {};
    const vSrc = typeof details.verticalDropSource === 'number' ? details.verticalDropSource : 1.5;
    const vDest = typeof details.verticalDropDest === 'number' ? details.verticalDropDest : 1.5;
    const vTotal = typeof details.verticalTotal === 'number' ? details.verticalTotal : (vSrc + vDest);
    const sLoop = typeof details.serviceLoopMeters === 'number' ? details.serviceLoopMeters : 2.0;
    const sMargin = typeof details.slackMarginPercent === 'number' ? details.slackMarginPercent : 5;
    const horizontalLen = typeof details.horizontalLength === 'number' ? details.horizontalLength : (cable.length || 0);
    const sAmount = typeof details.slackAmount === 'number' ? details.slackAmount : ((horizontalLen + vTotal + sLoop) * (sMargin / 100));
    const totalPhysical = typeof details.totalPhysicalLength === 'number' && details.totalPhysicalLength > 0 ? details.totalPhysicalLength : (cable.length || 0);
    const segments = Array.isArray(details.segmentLengths) ? details.segmentLengths : [];
    const waypointsCount = Array.isArray(cable.route) ? cable.route.length : 0;

    this.container.innerHTML = `
      <div class="connection-form-wrapper" style="display: flex; flex-direction: column; gap: 14px;">
        
        <!-- Header Info Card -->
        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div style="flex: 1;">
              <div style="font-size: 10px; font-weight: 700; color: ${activeColor}; text-transform: uppercase; font-family: var(--font-mono); display: flex; align-items: center; gap: 5px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${activeColor};"></span>
                <span>${catDef.name}</span>
                ${isCustomColor ? '<span style="font-size: 9px; opacity: 0.85;">(Custom)</span>' : ''}
              </div>
              <input type="text" id="prop-cable-name" value="${this.escapeHtml(cable.name)}" 
                     style="background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--text-primary); font-size: 14px; font-weight: 700; width: 100%; padding: 2px 4px; margin-top: 2px;"
                     onfocus="this.style.borderColor='var(--border-focus)'; this.style.backgroundColor='var(--bg-tertiary)';"
                     onblur="this.style.borderColor='transparent'; this.style.backgroundColor='transparent';">
            </div>
            <button id="btn-cable-close" class="btn btn-icon btn-sm" title="Tutup / Batalkan Seleksi">
              <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <span style="font-family: var(--font-mono); color: var(--text-muted); cursor: pointer;" id="btn-copy-cable-id" title="Klik untuk salin ID">
              ID: ${cable.id} 📋
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusDef.color};"></span>
              <select id="prop-cable-status" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 2px 6px;">
                <option value="active" ${cable.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="damaged" ${cable.status === 'damaged' ? 'selected' : ''}>Damaged / Cut</option>
                <option value="maintenance" ${cable.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                <option value="inactive" ${cable.status === 'inactive' ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Section: Endpoint Koneksi -->
        <div class="panel-section">
          <span class="section-label">Endpoint Koneksi</span>
          <div class="info-card" style="display: flex; flex-direction: column; gap: 8px;">
            <!-- Source Device -->
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--bg-tertiary); border-radius: 6px;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--accent-sky); font-weight: 600;">SUMBER (SOURCE)</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${sourceDev ? this.escapeHtml(sourceDev.name) : 'Unknown'}</span>
                <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${sourceDev?.network?.ip || ''}</span>
              </div>
              <button id="btn-goto-source" class="btn btn-icon btn-sm" title="Lompat ke Perangkat Sumber">
                <i data-lucide="crosshair" style="width: 14px; height: 14px;"></i>
              </button>
            </div>

            <!-- Arrow Indicator -->
            <div style="display: flex; justify-content: center; color: var(--text-muted); font-size: 12px;">
              <i data-lucide="arrow-down" style="width: 14px; height: 14px;"></i>
            </div>

            <!-- Destination Device -->
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--bg-tertiary); border-radius: 6px;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 10px; color: var(--accent-blue); font-weight: 600;">TUJUAN (DESTINATION)</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${destDev ? this.escapeHtml(destDev.name) : 'Unknown'}</span>
                <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${destDev?.network?.ip || ''}</span>
              </div>
              <button id="btn-goto-dest" class="btn btn-icon btn-sm" title="Lompat ke Perangkat Tujuan">
                <i data-lucide="crosshair" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Section: Spesifikasi Jalur & Fisik -->
        <div class="panel-section">
          <span class="section-label">Spesifikasi Jalur</span>
          <div class="info-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Kategori / Tipe Media</label>
              <select id="prop-cable-category" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; padding: 6px 8px; font-weight: 500;">
                <option value="cat5e" ${cable.cableCategory === 'cat5e' ? 'selected' : ''}>UTP Cat5e (Biru - 1 Gbps)</option>
                <option value="cat6" ${cable.cableCategory === 'cat6' ? 'selected' : ''}>UTP Cat6 (Biru Tua - 10 Gbps)</option>
                <option value="cat6a" ${cable.cableCategory === 'cat6a' ? 'selected' : ''}>UTP Cat6A Shielded (Ungu - 10 Gbps)</option>
                <option value="fiber-sm" ${cable.cableCategory === 'fiber-sm' ? 'selected' : ''}>Fiber Optic Single Mode (Kuning OS2)</option>
                <option value="fiber-mm" ${cable.cableCategory === 'fiber-mm' ? 'selected' : ''}>Fiber Optic Multi Mode (Oranye OM3)</option>
                <option value="wireless-link" ${cable.cableCategory === 'wireless-link' ? 'selected' : ''}>Wireless Link PtP (Cyan Nirkabel)</option>
                <option value="coaxial" ${cable.cableCategory === 'coaxial' ? 'selected' : ''}>Coaxial (Abu-abu RG6/RG11)</option>
              </select>
            </div>

            <!-- Box Pengaturan Warna Kabel -->
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color);">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                  <span id="cable-color-preview-dot" style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${activeColor}; border: 1px solid rgba(0,0,0,0.25); box-shadow: 0 0 6px ${activeColor}88;"></span>
                  Warna Garis Kabel
                </label>
                <span id="prop-cable-color-mode-badge" style="font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; ${isCustomColor ? 'background: rgba(245, 158, 11, 0.15); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.3);' : 'background: rgba(42, 124, 19, 0.15); color: var(--accent-green); border: 1px solid rgba(42, 124, 19, 0.3);'}">
                  ${isCustomColor ? '🎨 Custom' : '⚡ Otomatis (Standar Tipe)'}
                </span>
              </div>

              <!-- Color picker input + Hex + Reset Button -->
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <div id="cable-color-picker-box" style="position: relative; width: 34px; height: 28px; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-color); cursor: pointer; flex-shrink: 0; background: ${activeColor};" title="Klik untuk pilih warna custom">
                  <input type="color" id="prop-cable-custom-color" value="${activeColor}" 
                         style="position: absolute; top: -10px; left: -10px; width: 60px; height: 50px; border: none; cursor: pointer; opacity: 0;">
                </div>
                
                <input type="text" id="prop-cable-custom-hex" value="${activeColor}" maxlength="7" placeholder="#HEX"
                       style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; font-family: var(--font-mono); width: 70px; padding: 4px 6px; text-transform: uppercase;">

                <button type="button" id="btn-reset-cable-color" class="btn btn-secondary btn-sm" 
                        title="Kembalikan warna kabel ke standar tipe (${catDef.name})"
                        style="flex: 1; min-width: 100px; font-size: 10px; height: 28px; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; ${isCustomColor ? 'font-weight: 600;' : 'opacity: 0.6;'}">
                  <i data-lucide="rotate-ccw" style="width: 12px; height: 12px;"></i>
                  <span>Reset Standar</span>
                </button>
              </div>

              <!-- Quick Swatches Palette -->
              <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
                <span style="font-size: 10px; color: var(--text-muted); font-weight: 500;">Palet Cepat:</span>
                <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                  <button type="button" class="cable-swatch-btn" data-color="#3b82f6" title="Cat5e Blue (#3b82f6)" style="width: 20px; height: 20px; border-radius: 4px; background: #3b82f6; border: 2px solid ${activeColor.toLowerCase() === '#3b82f6' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#2563eb" title="Cat6 Royal Blue (#2563eb)" style="width: 20px; height: 20px; border-radius: 4px; background: #2563eb; border: 2px solid ${activeColor.toLowerCase() === '#2563eb' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#8b5cf6" title="Cat6A Purple (#8b5cf6)" style="width: 20px; height: 20px; border-radius: 4px; background: #8b5cf6; border: 2px solid ${activeColor.toLowerCase() === '#8b5cf6' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#eab308" title="FO Single Mode Yellow (#eab308)" style="width: 20px; height: 20px; border-radius: 4px; background: #eab308; border: 2px solid ${activeColor.toLowerCase() === '#eab308' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#f97316" title="FO Multi Mode Orange (#f97316)" style="width: 20px; height: 20px; border-radius: 4px; background: #f97316; border: 2px solid ${activeColor.toLowerCase() === '#f97316' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#06b6d4" title="Wireless Cyan (#06b6d4)" style="width: 20px; height: 20px; border-radius: 4px; background: #06b6d4; border: 2px solid ${activeColor.toLowerCase() === '#06b6d4' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#64748b" title="Coaxial Slate (#64748b)" style="width: 20px; height: 20px; border-radius: 4px; background: #64748b; border: 2px solid ${activeColor.toLowerCase() === '#64748b' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <span style="display: inline-block; width: 1px; height: 16px; background: var(--border-color); margin: 0 1px;"></span>
                  <button type="button" class="cable-swatch-btn" data-color="#2a7c13" title="Tema Forest Green (#2a7c13)" style="width: 20px; height: 20px; border-radius: 4px; background: #2a7c13; border: 2px solid ${activeColor.toLowerCase() === '#2a7c13' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#22c55e" title="Success Green (#22c55e)" style="width: 20px; height: 20px; border-radius: 4px; background: #22c55e; border: 2px solid ${activeColor.toLowerCase() === '#22c55e' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#ef4444" title="Critical Red (#ef4444)" style="width: 20px; height: 20px; border-radius: 4px; background: #ef4444; border: 2px solid ${activeColor.toLowerCase() === '#ef4444' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#ec4899" title="Neon Pink (#ec4899)" style="width: 20px; height: 20px; border-radius: 4px; background: #ec4899; border: 2px solid ${activeColor.toLowerCase() === '#ec4899' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                  <button type="button" class="cable-swatch-btn" data-color="#1e293b" title="Dark Slate (#1e293b)" style="width: 20px; height: 20px; border-radius: 4px; background: #1e293b; border: 2px solid ${activeColor.toLowerCase() === '#1e293b' ? 'var(--text-primary)' : 'transparent'}; cursor: pointer;"></button>
                </div>
              </div>
            </div>

            <!-- Sub-section: Parameter Drop Teknis & Real-World BOM -->
            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color);">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 5px;">
                  <i data-lucide="ruler" style="width: 14px; height: 14px; color: var(--accent-green);"></i>
                  Kalkulasi Fisik Rute & Drop Teknis
                </span>
                <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
                  Standar TIA/EIA-568
                </span>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Jarak vertikal dari tray/plafon ke port perangkat sumber">
                    Drop Vertikal Sumber (A)
                  </label>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" id="prop-cable-v-src" min="0" max="50" step="0.5" value="${vSrc}"
                           style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono); width: 100%;">
                    <span style="font-size: 10px; color: var(--text-muted);">m</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Jarak vertikal dari tray/plafon ke port perangkat tujuan">
                    Drop Vertikal Tujuan (B)
                  </label>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" id="prop-cable-v-dest" min="0" max="50" step="0.5" value="${vDest}"
                           style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono); width: 100%;">
                    <span style="font-size: 10px; color: var(--text-muted);">m</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Cadangan gulungan kabel di termination box / rack untuk maintenance">
                    Service Loop Cadangan
                  </label>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" id="prop-cable-loop" min="0" max="30" step="0.5" value="${sLoop}"
                           style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono); width: 100%;">
                    <span style="font-size: 10px; color: var(--text-muted);">m</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <label style="font-size: 10px; color: var(--text-muted); font-weight: 600;" title="Margin kelonggaran tarikan kabel akibat belokan conduit / tray">
                    Slack Margin Tarikan
                  </label>
                  <select id="prop-cable-slack" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                    <option value="0" ${sMargin == 0 ? 'selected' : ''}>0% (Jalur Kaku)</option>
                    <option value="5" ${sMargin == 5 ? 'selected' : ''}>5% (Standar Tray)</option>
                    <option value="10" ${sMargin == 10 ? 'selected' : ''}>10% (Pipa Conduit)</option>
                    <option value="15" ${sMargin == 15 ? 'selected' : ''}>15% (Rute Berkelok)</option>
                  </select>
                </div>
              </div>

              <!-- Real-Time BOM Breakdown Card -->
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px;">
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                  Rincian Panjang Fisik (BOM Penarikan):
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">• Rute Horizontal 2D (Denah):</span>
                  <span id="bom-horizontal-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">${horizontalLen.toFixed(1)} m</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">• Drop Vertikal (Src + Dest):</span>
                  <span id="bom-vertical-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-blue);">+${vTotal.toFixed(1)} m</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">• Cadangan Service Loop:</span>
                  <span id="bom-loop-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-sky);">+${sLoop.toFixed(1)} m</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                  <span style="color: var(--text-secondary);">• Slack Margin Tarikan (${sMargin}%):</span>
                  <span id="bom-slack-val" style="font-family: var(--font-mono); font-weight: 600; color: var(--text-muted);">+${sAmount.toFixed(1)} m</span>
                </div>

                <div style="margin-top: 4px; padding-top: 6px; border-top: 1px dashed var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 11px; font-weight: 700; color: var(--text-primary);">Total Panjang Fisik:</span>
                  <span id="bom-total-badge" style="font-size: 12px; font-weight: 700; font-family: var(--font-mono); padding: 3px 8px; border-radius: 4px; background: rgba(42, 124, 19, 0.15); color: var(--accent-green); border: 1px solid rgba(42, 124, 19, 0.35);">
                    ${totalPhysical.toFixed(1)} Meter
                  </span>
                </div>
              </div>
            </div>

            <!-- Panjang Akhir & Mode -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Total Panjang (Meter)</label>
              <input type="number" id="prop-cable-length" step="0.1" value="${cable.length || 0}"
                     style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; font-family: var(--font-mono); font-weight: 600;">
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Mode Panjang</label>
              <select id="prop-cable-len-mode" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; padding: 5px 8px;">
                <option value="auto" ${cable.lengthMode === 'auto' ? 'selected' : ''}>Auto (Kalkulasi Fisik)</option>
                <option value="manual" ${cable.lengthMode === 'manual' ? 'selected' : ''}>Manual (Override Bebas)</option>
              </select>
            </div>

            <!-- Per-Segment Breakdown Table / Waypoint Info -->
            ${segments.length > 1 ? `
              <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 11px; font-weight: 600; color: var(--text-primary);">
                    📏 Jarak Antar Segmen Belokan (${segments.length} segmen)
                  </span>
                  <button id="btn-straighten-cable" class="btn btn-secondary btn-sm" style="font-size: 10px; height: 22px; padding: 2px 6px;">
                    Luruskan Jalur
                  </button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 3px; max-height: 110px; overflow-y: auto; margin-top: 2px; padding-right: 2px;">
                  ${segments.map((seg, idx) => `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; padding: 2px 6px; background: var(--bg-secondary); border-radius: 4px;">
                      <span style="color: var(--text-secondary);">${idx === 0 ? 'Sumber ➔ Belokan 1' : (idx === segments.length - 1 ? `Belokan ${idx} ➔ Tujuan` : `Belokan ${idx} ➔ Belokan ${idx + 1}`)}:</span>
                      <span style="font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">${seg.toFixed(1)} m</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div style="grid-column: span 2; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-muted); background: var(--bg-secondary); padding: 6px 10px; border-radius: 4px;">
                <span>Titik Belok (Waypoints): <strong>0 titik (Jalur Lurus)</strong></span>
                <span style="font-size: 10px; color: var(--text-muted);">Klik jalur untuk buat belokan</span>
              </div>
            `}

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-muted);">Catatan Rute / Ducting</label>
              <textarea id="prop-cable-notes" rows="2" placeholder="Jalur tray kabel, pipa bawah tanah, atau core FO ke..."
                        style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 12px; padding: 5px 8px; resize: vertical;">${this.escapeHtml(cable.notes || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Section: Detail Spesifikasi & Analisis Rekayasa Jaringan -->
        <div class="panel-section">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span class="section-label" style="margin-bottom: 0;">Detail Spesifikasi & Analisis</span>
            <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">Metrik Jaringan</span>
          </div>
          <div id="prop-media-details-container">
            ${this.renderMediaDetailsHtml(cable.cableCategory, cable.length || 0, cable.details || {})}
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          <button id="btn-save-cable" class="btn btn-primary" style="width: 100%;">
            <i data-lucide="check" style="width: 15px; height: 15px;"></i>
            <span>Simpan Perubahan Jalur</span>
          </button>

          <button id="btn-delete-cable" class="btn btn-sm" style="background-color: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3); width: 100%;">
            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            <span>Hapus Jalur Kabel</span>
          </button>
        </div>

      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.bindFormHandlers();
  }

  bindFormHandlers() {
    if (!this.currentCable) return;
    const cableId = this.currentCable.id;

    // Close
    document.getElementById('btn-cable-close')?.addEventListener('click', () => {
      this.cableManager.deselectConnection();
    });

    // Copy ID
    document.getElementById('btn-copy-cable-id')?.addEventListener('click', () => {
      navigator.clipboard.writeText(cableId).then(() => {
        alert(`ID Kabel "${cableId}" berhasil disalin`);
      });
    });

    // Go to source
    document.getElementById('btn-goto-source')?.addEventListener('click', () => {
      const srcDev = this.deviceManager.getDeviceById(this.currentCable.source);
      if (srcDev) {
        eventBus.emit('viewport:center-on', srcDev.position);
      }
    });

    // Go to destination
    document.getElementById('btn-goto-dest')?.addEventListener('click', () => {
      const destDev = this.deviceManager.getDeviceById(this.currentCable.destination);
      if (destDev) {
        eventBus.emit('viewport:center-on', destDev.position);
      }
    });

    // Straighten cable (clear waypoints)
    document.getElementById('btn-straighten-cable')?.addEventListener('click', () => {
      this.cableManager.updateConnection(cableId, { route: [] });
      this.renderCableForm(this.cableManager.getConnectionById(cableId));
    });

    // Delete cable
    document.getElementById('btn-delete-cable')?.addEventListener('click', () => {
      if (confirm(`Yakin ingin menghapus jalur kabel "${this.currentCable.name}"?`)) {
        this.cableManager.deleteConnection(cableId);
      }
    });

    // Status select change -> update status live on canvas immediately
    document.getElementById('prop-cable-status')?.addEventListener('change', (e) => {
      const newStatus = e.target.value;
      this.cableManager.updateConnection(cableId, { status: newStatus });
      const updatedCable = this.cableManager.getConnectionById(cableId);
      this.renderCableForm(updatedCable);
    });

    // Category change -> update cable category & automatically change color to new category color
    document.getElementById('prop-cable-category')?.addEventListener('change', (e) => {
      const newCat = e.target.value;
      const catDef = CABLE_CATEGORIES[newCat] || CABLE_CATEGORIES['cat6'];
      const mediaType = getMediaTypeByCableCategory(newCat);

      this.cableManager.updateConnection(cableId, {
        cableCategory: newCat,
        type: catDef.type || mediaType,
        customColor: '' // Reset custom color to follow standard category color
      });

      const updatedCable = this.cableManager.getConnectionById(cableId);
      this.renderCableForm(updatedCable);
    });

    // Custom Color Handlers
    const colorPicker = document.getElementById('prop-cable-custom-color');
    const hexInput = document.getElementById('prop-cable-custom-hex');
    const previewDot = document.getElementById('cable-color-preview-dot');
    const colorBadge = document.getElementById('prop-cable-color-mode-badge');
    const pickerBox = document.getElementById('cable-color-picker-box');

    const applyCustomColor = (hexVal) => {
      if (!/^#[0-9A-Fa-f]{6}$/.test(hexVal)) return;

      this.cableManager.updateConnection(cableId, { customColor: hexVal });
      this.currentCable.customColor = hexVal;

      if (colorPicker) colorPicker.value = hexVal;
      if (hexInput) hexInput.value = hexVal.toUpperCase();
      if (pickerBox) pickerBox.style.backgroundColor = hexVal;
      if (previewDot) {
        previewDot.style.backgroundColor = hexVal;
        previewDot.style.boxShadow = `0 0 6px ${hexVal}88`;
      }
      if (colorBadge) {
        colorBadge.innerText = '🎨 Custom';
        colorBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        colorBadge.style.color = '#b45309';
        colorBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      }
      const resetBtn = document.getElementById('btn-reset-cable-color');
      if (resetBtn) resetBtn.style.opacity = '1';

      document.querySelectorAll('.cable-swatch-btn').forEach((btn) => {
        const swatchCol = btn.getAttribute('data-color');
        btn.style.borderColor = (swatchCol && swatchCol.toLowerCase() === hexVal.toLowerCase()) 
          ? 'var(--text-primary)' 
          : 'transparent';
      });
    };

    colorPicker?.addEventListener('input', (e) => applyCustomColor(e.target.value));
    colorPicker?.addEventListener('change', (e) => applyCustomColor(e.target.value));

    hexInput?.addEventListener('input', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#') && val.length > 0) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        applyCustomColor(val);
      }
    });

    document.querySelectorAll('.cable-swatch-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const col = btn.getAttribute('data-color');
        if (col) applyCustomColor(col);
      });
    });

    document.getElementById('btn-reset-cable-color')?.addEventListener('click', () => {
      this.cableManager.updateConnection(cableId, { customColor: '' });
      this.currentCable.customColor = '';
      const updatedCable = this.cableManager.getConnectionById(cableId);
      this.renderCableForm(updatedCable);
    });

    // Real-Time Physical Engineering Parameter Handlers
    const vSrcInput = document.getElementById('prop-cable-v-src');
    const vDestInput = document.getElementById('prop-cable-v-dest');
    const loopInput = document.getElementById('prop-cable-loop');
    const slackSelect = document.getElementById('prop-cable-slack');

    const recalculatePhysicalValues = () => {
      const vSrc = Math.max(0, parseFloat(vSrcInput?.value || '0'));
      const vDest = Math.max(0, parseFloat(vDestInput?.value || '0'));
      const sLoop = Math.max(0, parseFloat(loopInput?.value || '0'));
      const sMargin = Math.max(0, parseFloat(slackSelect?.value || '5'));

      const updated = this.cableManager.updateConnection(cableId, {
        details: {
          verticalDropSource: vSrc,
          verticalDropDest: vDest,
          serviceLoopMeters: sLoop,
          slackMarginPercent: sMargin
        }
      });

      if (updated) {
        this.currentCable = updated;
        const details = updated.details || {};
        const vTotal = typeof details.verticalTotal === 'number' ? details.verticalTotal : (vSrc + vDest);
        const sAmount = typeof details.slackAmount === 'number' ? details.slackAmount : 0;
        const total = updated.length || 0;

        // Update BOM Card
        const vEl = document.getElementById('bom-vertical-val');
        if (vEl) vEl.textContent = `+${vTotal.toFixed(1)} m`;

        const loopEl = document.getElementById('bom-loop-val');
        if (loopEl) loopEl.textContent = `+${sLoop.toFixed(1)} m`;

        const slackEl = document.getElementById('bom-slack-val');
        if (slackEl) slackEl.textContent = `+${sAmount.toFixed(1)} m`;

        const badgeEl = document.getElementById('bom-total-badge');
        if (badgeEl) badgeEl.textContent = `${total.toFixed(1)} Meter`;

        const lenInput = document.getElementById('prop-cable-length');
        if (lenInput && updated.lengthMode === 'auto') {
          lenInput.value = total.toFixed(1);
        }

        // Refresh technical network metrics box
        const cat = document.getElementById('prop-cable-category')?.value || 'cat6';
        const mediaContainer = document.getElementById('prop-media-details-container');
        if (mediaContainer) {
          mediaContainer.innerHTML = this.renderMediaDetailsHtml(cat, total, updated.details || {});
          if (window.lucide) window.lucide.createIcons();
        }
      }
    };

    vSrcInput?.addEventListener('input', recalculatePhysicalValues);
    vDestInput?.addEventListener('input', recalculatePhysicalValues);
    loopInput?.addEventListener('input', recalculatePhysicalValues);
    slackSelect?.addEventListener('change', recalculatePhysicalValues);

    // Length change handler (Manual mode or override)
    document.getElementById('prop-cable-length')?.addEventListener('input', (e) => {
      const newLen = parseFloat(e.target.value || '0');
      const cat = document.getElementById('prop-cable-category')?.value || 'cat6';
      const container = document.getElementById('prop-media-details-container');
      if (container) {
        container.innerHTML = this.renderMediaDetailsHtml(cat, newLen, this.currentCable.details || {});
        if (window.lucide) window.lucide.createIcons();
      }
    });

    // Length mode change
    document.getElementById('prop-cable-len-mode')?.addEventListener('change', (e) => {
      const mode = e.target.value;
      if (mode === 'auto') {
        const sourceDev = this.deviceManager.getDeviceById(this.currentCable.source);
        const destDev = this.deviceManager.getDeviceById(this.currentCable.destination);
        const autoLen = this.cableManager.calculateEstimatedLength(this.currentCable, sourceDev, destDev);
        this.cableManager.updateConnection(cableId, { lengthMode: 'auto', length: autoLen });
        const updatedCable = this.cableManager.getConnectionById(cableId);
        this.renderCableForm(updatedCable);
      } else {
        this.cableManager.updateConnection(cableId, { lengthMode: 'manual' });
      }
    });

    // Save changes
    document.getElementById('btn-save-cable')?.addEventListener('click', () => {
      const nameInput = document.getElementById('prop-cable-name');
      const statusSelect = document.getElementById('prop-cable-status');
      const catSelect = document.getElementById('prop-cable-category');
      const lengthInput = document.getElementById('prop-cable-length');
      const lenModeSelect = document.getElementById('prop-cable-len-mode');
      const notesInput = document.getElementById('prop-cable-notes');

      const currentCategory = catSelect?.value || 'cat6';
      const mediaType = getMediaTypeByCableCategory(currentCategory);
      const details = { ...(this.currentCable.details || {}) };

      // Collect technical media properties
      if (mediaType === 'fiber') {
        const coreCountEl = document.getElementById('detail-fiber-cores');
        const tubeEl = document.getElementById('detail-fiber-tube');
        const connSrcEl = document.getElementById('detail-fiber-conn-src');
        const connDestEl = document.getElementById('detail-fiber-conn-dest');
        const activeCoresEl = document.getElementById('detail-fiber-active-cores');
        const waveEl = document.getElementById('detail-fiber-wave');

        if (coreCountEl) details.fiberCoreCount = parseInt(coreCountEl.value, 10);
        if (tubeEl) details.tubeColor = tubeEl.value;
        if (connSrcEl) details.connectorSource = connSrcEl.value;
        if (connDestEl) details.connectorDest = connDestEl.value;
        if (activeCoresEl) details.fiberActiveCores = activeCoresEl.value.trim();
        if (waveEl) details.wavelength = waveEl.value;
      } else if (mediaType === 'twisted-pair') {
        const shieldEl = document.getElementById('detail-lan-shield');
        const standardEl = document.getElementById('detail-lan-standard');
        const poeEl = document.getElementById('detail-lan-poe');
        const jacketEl = document.getElementById('detail-lan-jacket');
        const portSrcEl = document.getElementById('detail-lan-port-src');
        const portDestEl = document.getElementById('detail-lan-port-dest');

        if (shieldEl) details.shielding = shieldEl.value;
        if (standardEl) details.wiringStandard = standardEl.value;
        if (poeEl) details.poeSupport = poeEl.value;
        if (jacketEl) details.jacketType = jacketEl.value;
        if (portSrcEl) details.portSource = portSrcEl.value.trim();
        if (portDestEl) details.portDestination = portDestEl.value.trim();
      } else if (mediaType === 'coaxial') {
        const coaxTypeEl = document.getElementById('detail-coax-type');
        const impedanceEl = document.getElementById('detail-coax-impedance');
        const coaxConnEl = document.getElementById('detail-coax-conn');
        const siameseEl = document.getElementById('detail-coax-siamese');

        if (coaxTypeEl) details.coaxType = coaxTypeEl.value;
        if (impedanceEl) details.impedance = impedanceEl.value;
        if (coaxConnEl) details.coaxConnector = coaxConnEl.value;
        if (siameseEl) details.isSiamese = siameseEl.checked;
      } else if (mediaType === 'wireless') {
        const freqEl = document.getElementById('detail-wireless-freq');
        const widthEl = document.getElementById('detail-wireless-width');
        const rssiEl = document.getElementById('detail-wireless-rssi');

        if (freqEl) details.frequency = freqEl.value;
        if (widthEl) details.channelWidth = widthEl.value;
        if (rssiEl) details.signalRssi = rssiEl.value.trim();
      }

      const updates = {
        name: nameInput?.value.trim() || 'Cable Link',
        status: statusSelect?.value || 'active',
        cableCategory: currentCategory,
        customColor: this.currentCable.customColor || '',
        length: parseFloat(lengthInput?.value || '0'),
        lengthMode: lenModeSelect?.value || 'auto',
        details: details,
        notes: notesInput?.value.trim() || ''
      };

      const updated = this.cableManager.updateConnection(cableId, updates);
      if (updated) {
        this.renderCableForm(updated);
      }
    });
  }

  bindEvents() {
    eventBus.on('connection:selected', (cable) => {
      this.renderCableForm(cable);
    });

    eventBus.on('connection:deselected', () => {
      if (!this.deviceManager.selectedDeviceId) {
        this.renderEmpty();
      }
    });

    eventBus.on('connection:deleted', ({ connectionId }) => {
      if (this.currentCable?.id === connectionId) {
        this.currentCable = null;
        this.renderEmpty();
      }
    });

    eventBus.on('map:scale-calibrated', () => {
      if (this.currentCable) {
        const updated = this.cableManager.getConnectionById(this.currentCable.id);
        if (updated) this.renderCableForm(updated);
      }
    });
  }

  renderEmpty() {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="mouse-pointer-click" style="width: 22px; height: 22px;"></i>
        </div>
        <div class="empty-state-text">Belum ada perangkat terpilih</div>
        <div class="empty-state-hint">
          Klik salah satu marker perangkat pada denah atau garis koneksi kabel untuk membuka konfigurasi teknis.
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Render dynamic technical detail form & network performance analysis
   * @param {string} category 
   * @param {number} length 
   * @param {Object} details 
   * @returns {string}
   */
  renderMediaDetailsHtml(category, length, details = {}) {
    const mediaType = getMediaTypeByCableCategory(category);
    const catDef = CABLE_CATEGORIES[category] || CABLE_CATEGORIES.cat6;
    const len = Number(length) || 0;

    // Calculate network performance metrics
    const metrics = calculateNetworkPerformanceMetrics({
      totalLength: len,
      horizontalLength: details.horizontalLength || len,
      category,
      poeSupport: details.poeSupport || 'poe+'
    });

    if (mediaType === 'fiber') {
      const fiberType = category === 'fiber-mm' ? 'mm' : 'sm';
      const estLoss = metrics.attenuationDb;
      const coreCount = details.fiberCoreCount || (category === 'fiber-mm' ? 4 : 12);
      const activeCores = details.fiberActiveCores || 'Core 1-2 (Uplink Tx/Rx)';
      const connSrc = details.connectorSource || 'LC/UPC';
      const connDest = details.connectorDest || 'LC/UPC';
      const wave = details.wavelength || (fiberType === 'sm' ? '1310/1550nm (OS2)' : '850/1300nm (OM3)');
      const tube = details.tubeColor || 'Biru (Tube 1)';

      return `
        <!-- Fiber Optic Details Card -->
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
                ${fiberType === 'sm' ? 'Fiber Optik Single Mode (OS2)' : 'Fiber Optik Multi Mode (OM3/OM4)'}
              </span>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
              ${fiberType === 'sm' ? '9/125 µm' : '50/125 µm'}
            </span>
          </div>

          <!-- Real-Time Optical Budget & Latency Box -->
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="color: var(--text-muted);">Estimasi Redaman (Optical Loss):</span>
              <span style="font-weight: 700; color: ${estLoss > 3.0 ? 'var(--status-warning)' : 'var(--status-online)'}; font-family: var(--font-mono);">
                ${estLoss.toFixed(2)} dB (${len.toFixed(1)}m)
              </span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="color: var(--text-muted);">Latensi Propagasi Fisik:</span>
              <span style="font-weight: 600; color: var(--text-primary); font-family: var(--font-mono);">
                ${metrics.latency.delayNanoseconds} ns (${metrics.latency.delayMicroseconds} µs)
              </span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Jumlah Core</label>
              <select id="detail-fiber-cores" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="2" ${coreCount == 2 ? 'selected' : ''}>2 Core (Duplex)</option>
                <option value="4" ${coreCount == 4 ? 'selected' : ''}>4 Core</option>
                <option value="6" ${coreCount == 6 ? 'selected' : ''}>6 Core</option>
                <option value="8" ${coreCount == 8 ? 'selected' : ''}>8 Core</option>
                <option value="12" ${coreCount == 12 ? 'selected' : ''}>12 Core (Standar)</option>
                <option value="24" ${coreCount == 24 ? 'selected' : ''}>24 Core (Backbone)</option>
                <option value="48" ${coreCount == 48 ? 'selected' : ''}>48 Core (Trunk)</option>
                <option value="96" ${coreCount == 96 ? 'selected' : ''}>96 Core (High Dens)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Warna Tube (TIA-598)</label>
              <select id="detail-fiber-tube" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="Biru (Tube 1)" ${tube.includes('Biru') ? 'selected' : ''}>🔵 Biru (Tube 1)</option>
                <option value="Oranye (Tube 2)" ${tube.includes('Oranye') ? 'selected' : ''}>🟠 Oranye (Tube 2)</option>
                <option value="Hijau (Tube 3)" ${tube.includes('Hijau') ? 'selected' : ''}>🟢 Hijau (Tube 3)</option>
                <option value="Cokelat (Tube 4)" ${tube.includes('Cokelat') ? 'selected' : ''}>🟤 Cokelat (Tube 4)</option>
                <option value="Abu-abu (Tube 5)" ${tube.includes('Abu-abu') ? 'selected' : ''}>⚪ Abu-abu (Tube 5)</option>
                <option value="Putih (Tube 6)" ${tube.includes('Putih') ? 'selected' : ''}>⚪ Putih (Tube 6)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Konektor Sumber (A)</label>
              <select id="detail-fiber-conn-src" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="LC/UPC" ${connSrc === 'LC/UPC' ? 'selected' : ''}>LC/UPC (Biru)</option>
                <option value="LC/APC" ${connSrc === 'LC/APC' ? 'selected' : ''}>LC/APC (Hijau)</option>
                <option value="SC/UPC" ${connSrc === 'SC/UPC' ? 'selected' : ''}>SC/UPC (Biru)</option>
                <option value="SC/APC" ${connSrc === 'SC/APC' ? 'selected' : ''}>SC/APC (Hijau)</option>
                <option value="FC/UPC" ${connSrc === 'FC/UPC' ? 'selected' : ''}>FC/UPC (Ulir)</option>
                <option value="ST" ${connSrc === 'ST' ? 'selected' : ''}>ST (Bayonet)</option>
                <option value="MPO/MTP" ${connSrc === 'MPO/MTP' ? 'selected' : ''}>MPO/MTP (Multi)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Konektor Tujuan (B)</label>
              <select id="detail-fiber-conn-dest" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="LC/UPC" ${connDest === 'LC/UPC' ? 'selected' : ''}>LC/UPC (Biru)</option>
                <option value="LC/APC" ${connDest === 'LC/APC' ? 'selected' : ''}>LC/APC (Hijau)</option>
                <option value="SC/UPC" ${connDest === 'SC/UPC' ? 'selected' : ''}>SC/UPC (Biru)</option>
                <option value="SC/APC" ${connDest === 'SC/APC' ? 'selected' : ''}>SC/APC (Hijau)</option>
                <option value="FC/UPC" ${connDest === 'FC/UPC' ? 'selected' : ''}>FC/UPC (Ulir)</option>
                <option value="ST" ${connDest === 'ST' ? 'selected' : ''}>ST (Bayonet)</option>
                <option value="MPO/MTP" ${connDest === 'MPO/MTP' ? 'selected' : ''}>MPO/MTP (Multi)</option>
              </select>
            </div>

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Alokasi / Label Core Aktif</label>
              <input type="text" id="detail-fiber-active-cores" value="${this.escapeHtml(activeCores)}" placeholder="Core 1-2: Uplink SW-Core..."
                     style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px;">
            </div>

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Panjang Gelombang (Wavelength)</label>
              <select id="detail-fiber-wave" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="1310/1550nm (OS2)" ${wave.includes('1310') ? 'selected' : ''}>1310 / 1550 nm (Single Mode OS2)</option>
                <option value="850/1300nm (OM3)" ${wave.includes('850') ? 'selected' : ''}>850 / 1300 nm (Multi Mode OM3)</option>
                <option value="1270-1610nm (CWDM)" ${wave.includes('CWDM') ? 'selected' : ''}>CWDM (1270-1610 nm)</option>
                <option value="DWDM C-Band" ${wave.includes('DWDM') ? 'selected' : ''}>DWDM C-Band Dense</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }

    if (mediaType === 'twisted-pair') {
      const ethComp = metrics.ethernetCompliance;
      const poeData = metrics.poeAnalysis;
      const shield = details.shielding || (category === 'cat6a' ? 'S/FTP' : 'U/UTP');
      const standard = details.wiringStandard || 'T568B';
      const poe = details.poeSupport || 'poe+';
      const portSrc = details.portSource || '';
      const portDest = details.portDestination || '';
      const jacket = details.jacketType || 'indoor-pvc';

      return `
        <!-- LAN / Twisted Pair Details Card -->
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
                ${catDef.name}
              </span>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
              4 Pair 100Ω
            </span>
          </div>

          <!-- IEEE 802.3 100-Meter Compliance Box -->
          <div style="background: ${ethComp.status === 'exceeded' ? 'rgba(239, 68, 68, 0.12)' : (ethComp.status === 'warning' ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-primary)')}; 
                      border: 1px solid ${ethComp.status === 'exceeded' ? 'rgba(239, 68, 68, 0.4)' : (ethComp.status === 'warning' ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)')}; 
                      border-radius: 6px; padding: 8px 10px; font-size: 11px; display: flex; flex-direction: column; gap: 5px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 700; color: ${ethComp.badgeColor}; display: flex; align-items: center; gap: 5px;">
                ${ethComp.status === 'exceeded' ? '⚠️' : (ethComp.status === 'warning' ? '⚠️' : '✓')}
                ${ethComp.badgeText}
              </span>
              <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">
                ${ethComp.marginMeters >= 0 ? `Sisa Margin: ${ethComp.marginMeters}m` : `Kelebihan: ${Math.abs(ethComp.marginMeters)}m`}
              </span>
            </div>
            <div style="color: ${ethComp.status === 'exceeded' ? 'var(--status-offline)' : (ethComp.status === 'warning' ? 'var(--status-warning)' : 'var(--text-secondary)')}; font-size: 10.5px; line-height: 1.4;">
              ${ethComp.message}
            </div>
            ${ethComp.status === 'exceeded' ? `
              <div style="margin-top: 2px; padding: 4px 6px; background: rgba(239, 68, 68, 0.15); border-radius: 4px; font-size: 10px; color: var(--text-primary);">
                💡 <strong>Solusi Rekayasa:</strong> Tambahkan PoE Extender, Switch Distribusi perantara di titik &lt;90m, atau ganti link ini ke Fiber Optic Single Mode.
              </div>
            ` : ''}
          </div>

          <!-- Network Performance Metrics (Latency & Attenuation) -->
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="color: var(--text-muted); font-size: 10px;">Latensi Propagasi Fisik</span>
              <span style="font-family: var(--font-mono); font-weight: 700; color: var(--text-primary);">
                ${metrics.latency.delayNanoseconds} ns <span style="font-size: 9px; font-weight: normal; color: var(--text-muted);">(${metrics.latency.delayMicroseconds} µs)</span>
              </span>
              <span style="font-size: 9.5px; color: var(--text-muted);">NVP: ${metrics.latency.nvpPercent}% kecepatan cahaya</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="color: var(--text-muted); font-size: 10px;">Redaman Sinyal (Loss)</span>
              <span style="font-family: var(--font-mono); font-weight: 700; color: ${metrics.attenuationDb > 20 ? 'var(--status-warning)' : 'var(--status-online)'};">
                ${metrics.attenuationDb.toFixed(2)} dB
              </span>
              <span style="font-size: 9.5px; color: var(--text-muted);">Termasuk 2x RJ45 Term</span>
            </div>
          </div>

          <!-- PoE Analysis Card (if PoE enabled) -->
          ${poeData ? `
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 4px;">
                  <i data-lucide="zap" style="width: 12px; height: 12px; color: var(--accent-orange);"></i>
                  Analisis Drop Daya PoE (${poeData.standard.toUpperCase()})
                </span>
                <span style="font-size: 10px; font-weight: 700; color: ${poeData.efficiencyPercent < 80 ? 'var(--status-warning)' : 'var(--status-online)'}; font-family: var(--font-mono);">
                  Efisiensi: ${poeData.efficiencyPercent}%
                </span>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10.5px; margin-top: 2px;">
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Hambatan Loop:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600;">${poeData.totalResistanceOhm} Ω</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Drop Voltase:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600; color: ${poeData.voltageDropVolts > 5 ? 'var(--status-warning)' : 'var(--text-primary)'};">-${poeData.voltageDropVolts} V</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Voltase Tiba:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600;">${poeData.deliveredVoltageVolts} V</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: var(--bg-secondary); border-radius: 3px;">
                  <span style="color: var(--text-muted);">Daya Diterima:</span>
                  <span style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-green);">${poeData.deliveredPowerWatts} W</span>
                </div>
              </div>
            </div>
          ` : ''}

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Shielding (Pelindung)</label>
              <select id="detail-lan-shield" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="U/UTP" ${shield === 'U/UTP' ? 'selected' : ''}>U/UTP (Unshielded)</option>
                <option value="F/UTP" ${shield === 'F/UTP' ? 'selected' : ''}>F/UTP (Foiled Luar)</option>
                <option value="S/FTP" ${shield === 'S/FTP' ? 'selected' : ''}>S/FTP (Shielded)</option>
                <option value="SF/UTP" ${shield === 'SF/UTP' ? 'selected' : ''}>SF/UTP (Screened)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Standar Crimping</label>
              <select id="detail-lan-standard" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="T568B" ${standard === 'T568B' ? 'selected' : ''}>T568B (Straight)</option>
                <option value="T568A" ${standard === 'T568A' ? 'selected' : ''}>T568A (Straight)</option>
                <option value="Crossover" ${standard === 'Crossover' ? 'selected' : ''}>Crossover (D2D)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Dukungan PoE (Daya)</label>
              <select id="detail-lan-poe" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="none" ${poe === 'none' ? 'selected' : ''}>Non-PoE (Data)</option>
                <option value="poe" ${poe === 'poe' ? 'selected' : ''}>PoE 802.3af (15.4W)</option>
                <option value="poe+" ${poe === 'poe+' ? 'selected' : ''}>PoE+ 802.3at (30W)</option>
                <option value="poe++" ${poe === 'poe++' ? 'selected' : ''}>PoE++ 802.3bt (60-90W)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Material Jaket</label>
              <select id="detail-lan-jacket" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="indoor-pvc" ${jacket === 'indoor-pvc' ? 'selected' : ''}>PVC (Indoor)</option>
                <option value="lszh" ${jacket === 'lszh' ? 'selected' : ''}>LSZH (Low Smoke)</option>
                <option value="outdoor-pe" ${jacket === 'outdoor-pe' ? 'selected' : ''}>Outdoor UV PE</option>
                <option value="armored" ${jacket === 'armored' ? 'selected' : ''}>Steel Armored</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Port Sumber (A)</label>
              <input type="text" id="detail-lan-port-src" value="${this.escapeHtml(portSrc)}" placeholder="Gi0/1, Eth1..."
                     style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono);">
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Port Tujuan (B)</label>
              <input type="text" id="detail-lan-port-dest" value="${this.escapeHtml(portDest)}" placeholder="Eth0, LAN1..."
                     style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; font-family: var(--font-mono);">
            </div>
          </div>
        </div>
      `;
    }

    if (mediaType === 'coaxial') {
      const coaxType = details.coaxType || 'RG-6';
      const impedance = details.impedance || '75 Ohm';
      const coaxConn = details.coaxConnector || 'BNC Compression';
      const isSiamese = details.isSiamese !== undefined ? details.isSiamese : true;

      return `
        <!-- Coaxial Details Card -->
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
                Coaxial RF & CCTV Video
              </span>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
              ${impedance}
            </span>
          </div>

          <!-- Coaxial Metrics -->
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <span style="color: var(--text-muted);">Redaman RF (${len.toFixed(1)}m):</span>
            <span style="font-weight: 700; color: ${metrics.attenuationDb > 15 ? 'var(--status-warning)' : 'var(--status-online)'}; font-family: var(--font-mono);">
              ${metrics.attenuationDb.toFixed(2)} dB
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Tipe Coaxial</label>
              <select id="detail-coax-type" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 4px 6px;">
                <option value="RG-59" ${coaxType === 'RG-59' ? 'selected' : ''}>RG-59 (&lt;150m)</option>
                <option value="RG-6" ${coaxType === 'RG-6' ? 'selected' : ''}>RG-6 (Std &lt;300m)</option>
                <option value="RG-11" ${coaxType === 'RG-11' ? 'selected' : ''}>RG-11 (Trunk &lt;600m)</option>
              </select>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Impedansi</label>
              <select id="detail-coax-impedance" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
                <option value="75 Ohm" ${impedance === '75 Ohm' ? 'selected' : ''}>75 Ohm (CCTV / TV)</option>
                <option value="50 Ohm" ${impedance === '50 Ohm' ? 'selected' : ''}>50 Ohm (RF / Radio)</option>
              </select>
            </div>

            <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
              <label style="font-size: 10px; color: var(--text-muted);">Tipe Konektor Ujung</label>
              <select id="detail-coax-conn" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
                <option value="BNC Compression" ${coaxConn.includes('Compression') ? 'selected' : ''}>BNC Male Compression (Pro)</option>
                <option value="BNC Crimp-On" ${coaxConn.includes('Crimp') ? 'selected' : ''}>BNC Crimp-On</option>
                <option value="BNC Twist-On" ${coaxConn.includes('Twist') ? 'selected' : ''}>BNC Twist-On</option>
                <option value="F-Connector" ${coaxConn.includes('F-') ? 'selected' : ''}>F-Connector Drat</option>
                <option value="SMA Male" ${coaxConn.includes('SMA') ? 'selected' : ''}>SMA / RP-SMA (RF)</option>
              </select>
            </div>

            <div style="grid-column: span 2; display: flex; align-items: center; gap: 6px; padding: 4px 0;">
              <input type="checkbox" id="detail-coax-siamese" ${isSiamese ? 'checked' : ''} style="accent-color: var(--accent-blue);">
              <label for="detail-coax-siamese" style="font-size: 11px; color: var(--text-primary); cursor: pointer;">
                Kabel Siamese (Kombinasi Coax + 2-Core Kabel Power DC 12V)
              </label>
            </div>
          </div>
        </div>
      `;
    }

    // Wireless Link
    const freq = details.frequency || '5 GHz';
    const chWidth = details.channelWidth || '40 MHz';
    const rssi = details.signalRssi || '-58 dBm';

    return `
      <!-- Wireless Link Details Card -->
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${catDef.color};"></span>
            <span style="font-size: 11px; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">
              Wireless Point-to-Point Link
            </span>
          </div>
          <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
            AirMax / PtP
          </span>
        </div>

        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
          <span style="color: var(--text-muted);">Jarak Udara LoS:</span>
          <span style="font-weight: 700; color: var(--accent-sky); font-family: var(--font-mono);">
            ${len.toFixed(1)} Meter
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <label style="font-size: 10px; color: var(--text-muted);">Frekuensi Radio</label>
            <select id="detail-wireless-freq" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
              <option value="5 GHz" ${freq.includes('5') ? 'selected' : ''}>5 GHz AC/AX (Standar PtP)</option>
              <option value="2.4 GHz" ${freq.includes('2.4') ? 'selected' : ''}>2.4 GHz (Jarak Jauh/Halangan)</option>
              <option value="60 GHz" ${freq.includes('60') ? 'selected' : ''}>60 GHz Terragraph (Multi-Gigabit)</option>
              <option value="24 GHz" ${freq.includes('24') ? 'selected' : ''}>24 GHz License-Free Backhaul</option>
            </select>
          </div>

          <div style="display: flex; flex-direction: column; gap: 2px;">
            <label style="font-size: 10px; color: var(--text-muted);">Lebar Kanal</label>
            <select id="detail-wireless-width" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; padding: 3px 6px;">
              <option value="20 MHz" ${chWidth === '20 MHz' ? 'selected' : ''}>20 MHz (Tahan Interferensi)</option>
              <option value="40 MHz" ${chWidth === '40 MHz' ? 'selected' : ''}>40 MHz (Standar Seimbang)</option>
              <option value="80 MHz" ${chWidth === '80 MHz' ? 'selected' : ''}>80 MHz (High Throughput)</option>
              <option value="160 MHz" ${chWidth === '160 MHz' ? 'selected' : ''}>160 MHz (Ultra Speed)</option>
            </select>
          </div>

          <div style="grid-column: span 2; display: flex; flex-direction: column; gap: 2px;">
            <label style="font-size: 10px; color: var(--text-muted);">Kualitas Sinyal Target (RSSI)</label>
            <input type="text" id="detail-wireless-rssi" value="${this.escapeHtml(rssi)}" placeholder="-55 dBm..."
                   style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 11px; padding: 3px 6px; font-family: var(--font-mono);">
          </div>
        </div>
      </div>
    `;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }
}
