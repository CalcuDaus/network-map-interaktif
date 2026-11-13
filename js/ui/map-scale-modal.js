/**
 * NetMap — Map Scale Calibration Modal
 * Allows calibrating real-world map dimensions in meters for high-precision
 * cable distance calculations, wireless coverage, and network engineering analysis.
 */

import { eventBus } from '../core/event-bus.js';

export class MapScaleModal {
  /**
   * @param {Object} options
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {number} [options.naturalWidth=1024]
   * @param {number} [options.naturalHeight=1024]
   */
  constructor({ cableManager, naturalWidth = 1024, naturalHeight = 1024 }) {
    this.cableManager = cableManager;
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;

    this.modalEl = null;
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'map-scale-modal';
    this.modalEl.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: var(--modal-backdrop, rgba(0, 0, 0, 0.75));
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    this.modalEl.innerHTML = `
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 580px; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden; animation: modalFadeIn 0.2s ease-out;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="ruler" style="width: 20px; height: 20px; color: var(--accent-green);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Kalibrasi Skala Ukuran Peta</span>
          </div>
          <button id="scale-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: calc(85vh - 110px); overflow-y: auto;">
          
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Sesuaikan lebar denah dunia nyata (dalam meter) agar seluruh kalkulasi <strong>panjang fisik kabel</strong>, <strong>redaman sinyal</strong>, <strong>drop PoE</strong>, dan <strong>cakupan nirkabel</strong> berakurasi tinggi sesuai lingkungan sebenarnya.
          </div>

          <!-- Live Ratio Information Box -->
          <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Status Kalibrasi Aktif</span>
              <span id="scale-info-pixel-size" style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">${this.naturalWidth} × ${this.naturalHeight} px</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 2px;">
              <div style="background: var(--bg-secondary); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="font-size: 10px; color: var(--text-muted);">Lebar Dunia Nyata:</div>
                <div id="scale-preview-meters" style="font-size: 16px; font-weight: 700; color: var(--accent-green); font-family: var(--font-mono);">
                  ${this.cableManager.mapWidthMeters || 400} Meter
                </div>
              </div>

              <div style="background: var(--bg-secondary); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="font-size: 10px; color: var(--text-muted);">Rasio Skala Piksel:</div>
                <div id="scale-preview-ratio" style="font-size: 13px; font-weight: 700; color: var(--accent-blue); font-family: var(--font-mono); margin-top: 2px;">
                  1 px = ${(this.cableManager.metersPerPixel || 0.39).toFixed(3)} m
                </div>
              </div>
            </div>
          </div>

          <!-- Presets Grid -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--text-primary);">Pilihan Skala Standar (Presets):</label>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" id="scale-presets-container">
              
              <button type="button" class="scale-preset-btn" data-meters="25" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Ruang Server / Data Center</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">25 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px ≈ 0.024 m (Detail Rak & Tray)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="60" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Satu Lantai Kantor</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">60 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px ≈ 0.059 m (Kabel AP & PC)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="150" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Satu Gedung Bertingkat</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">150 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px ≈ 0.146 m (Riser & Shaft)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="400" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                  <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Kampus / Kantor Wilayah</span>
                  <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(42, 124, 19, 0.2); color: var(--accent-green); font-weight: 700;">DEFAULT</span>
                </div>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">400 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px ≈ 0.39 m (Antargedung)</span>
              </button>

              <button type="button" class="scale-preset-btn" data-meters="800" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; transition: all 0.15s ease; grid-column: span 2;">
                <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Kawasan Industri / Area Luas</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-green); font-weight: 600; margin-top: 2px;">800 Meter</span>
                <span style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">1 px ≈ 0.78 m (Jalur Backbone FO Panjang)</span>
              </button>

            </div>
          </div>

          <!-- Custom Meter Input -->
          <div style="display: flex; flex-direction: column; gap: 4px; padding: 12px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">
            <label for="scale-input-custom-meters" style="font-size: 11px; font-weight: 700; color: var(--text-primary);">
              Atur Lebar Peta Kustom (Meter):
            </label>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="number" id="scale-input-custom-meters" min="5" max="10000" step="1" 
                     value="${this.cableManager.mapWidthMeters || 400}" 
                     style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 14px; font-weight: 700; font-family: var(--font-mono); padding: 6px 10px; width: 140px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Meter</span>
              <span style="font-size: 11px; color: var(--text-muted); margin-left: auto;">(Rentang 5 - 10,000m)</span>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div style="height: 56px; border-top: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 0 20px;">
          <button id="scale-modal-btn-cancel" class="btn btn-secondary">Batal</button>
          <button id="scale-modal-btn-apply" class="btn btn-primary" style="display: flex; align-items: center; gap: 6px;">
            <i data-lucide="check" style="width: 14px; height: 14px;"></i>
            <span>Terapkan Skala Peta</span>
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    const closeBtn = document.getElementById('scale-modal-btn-close');
    const cancelBtn = document.getElementById('scale-modal-btn-cancel');
    const applyBtn = document.getElementById('scale-modal-btn-apply');
    const customInput = document.getElementById('scale-input-custom-meters');
    const presetsContainer = document.getElementById('scale-presets-container');

    const closeModal = () => this.hide();

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    // Backdrop click dismisses
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) closeModal();
    });

    // Custom input updates preview live
    customInput?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        this.updateLivePreview(val);
      }
    });

    // Preset button clicks
    presetsContainer?.querySelectorAll('.scale-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const meters = parseFloat(btn.getAttribute('data-meters'));
        if (customInput) customInput.value = meters;
        this.updateLivePreview(meters);
      });
    });

    // Apply button
    applyBtn?.addEventListener('click', () => {
      const val = parseFloat(customInput?.value || '400');
      if (isNaN(val) || val <= 0) {
        alert('Harap masukkan angka meter yang valid (> 0)');
        return;
      }

      this.cableManager.setMapScale(val);
      this.hide();

      // Show brief confirmation
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        bottom: 45px;
        right: 24px;
        background: var(--bg-secondary);
        color: var(--accent-green);
        border: 1px solid var(--accent-green);
        border-radius: 6px;
        padding: 10px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: fadeIn 0.2s ease-out;
      `;
      toast.innerHTML = `<span>📐 Skala denah berhasil dikalibrasi ke <strong>${val} Meter</strong>!</span>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    });

    // Event bus trigger
    eventBus.on('modal:open-map-scale', () => {
      this.show();
    });
  }

  updateLivePreview(meters) {
    const previewMeters = document.getElementById('scale-preview-meters');
    const previewRatio = document.getElementById('scale-preview-ratio');
    if (previewMeters) previewMeters.textContent = `${meters} Meter`;
    if (previewRatio) {
      const ratio = meters / this.naturalWidth;
      previewRatio.textContent = `1 px = ${ratio.toFixed(3)} m`;
    }

    // Highlight matching preset button
    document.querySelectorAll('.scale-preset-btn').forEach((btn) => {
      const btnMeters = parseFloat(btn.getAttribute('data-meters'));
      if (btnMeters === meters) {
        btn.style.borderColor = 'var(--accent-green)';
        btn.style.backgroundColor = 'var(--bg-secondary)';
      } else {
        btn.style.borderColor = 'var(--border-color)';
        btn.style.backgroundColor = 'var(--bg-tertiary)';
      }
    });
  }

  show() {
    if (!this.modalEl) return;
    const currentMeters = this.cableManager.mapWidthMeters || 400;
    const customInput = document.getElementById('scale-input-custom-meters');
    if (customInput) customInput.value = currentMeters;
    this.updateLivePreview(currentMeters);

    this.modalEl.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }
}

