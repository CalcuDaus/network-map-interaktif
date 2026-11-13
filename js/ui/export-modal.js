/**
 * NetMap — Export & Import Manager Modal
 * Handles JSON backup/restore, CSV spreadsheets, High-Res PNG snapshots, and PDF reports
 */

import { JsonImporterExporter } from '../storage/json-importer-exporter.js';
import { CsvExporter } from '../export/csv-exporter.js';
import { SnapshotExporter } from '../export/snapshot-exporter.js';
import { PdfReportGenerator } from '../export/pdf-report-generator.js';

export class ExportModal {
  /**
   * @param {Object} options
   * @param {import('../storage/project-storage.js').ProjectStorage} options.projectStorage
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {Konva.Stage} options.stage
   * @param {Konva.Layer} options.interactionLayer
   */
  constructor({ projectStorage, deviceManager, cableManager, stage, interactionLayer }) {
    this.projectStorage = projectStorage;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.stage = stage;
    this.interactionLayer = interactionLayer;

    this.modalEl = null;
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'export-manager-modal';
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
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 650px; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="download" style="width: 18px; height: 18px; color: var(--accent-sky);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Ekspor & Pencadangan Data</span>
          </div>
          <button id="export-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: 80vh; overflow-y: auto;">
          
          <!-- Section 1: JSON Backup / Restore -->
          <div class="panel-section">
            <span class="section-label">1. Cadangan Proyek (JSON Backup & Restore)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 12px; color: var(--text-secondary);">
                Simpan seluruh konfigurasi peta, perangkat, dan rute kabel ke file JSON untuk dipindahkan ke komputer lain atau dipulihkan.
              </div>
              <div style="display: flex; gap: 10px;">
                <button id="btn-export-json" class="btn btn-primary btn-sm" style="flex: 1;">
                  <i data-lucide="download" style="width: 14px; height: 14px;"></i>
                  <span>Unduh File JSON</span>
                </button>
                <label class="btn btn-secondary btn-sm" style="flex: 1; cursor: pointer; margin: 0;">
                  <i data-lucide="upload" style="width: 14px; height: 14px;"></i>
                  <span>Pulihkan / Impor JSON</span>
                  <input type="file" id="input-import-json" accept=".json" style="display: none;">
                </label>
              </div>
            </div>
          </div>

          <!-- Section 2: CSV Inventaris -->
          <div class="panel-section">
            <span class="section-label">2. Lembar Kerja Inventaris (CSV / Excel)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 12px; color: var(--text-secondary);">
                Ekspor data inventaris tabular perangkat dan koneksi kabel yang kompatibel dengan Microsoft Excel atau Google Sheets.
              </div>
              <div style="display: flex; gap: 10px;">
                <button id="btn-export-csv-devices" class="btn btn-secondary btn-sm" style="flex: 1;">
                  <i data-lucide="table" style="width: 14px; height: 14px;"></i>
                  <span>CSV Perangkat</span>
                </button>
                <button id="btn-export-csv-cables" class="btn btn-secondary btn-sm" style="flex: 1;">
                  <i data-lucide="table" style="width: 14px; height: 14px;"></i>
                  <span>CSV Jalur Kabel</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Section 3: High-Res PNG Snapshot -->
          <div class="panel-section">
            <span class="section-label">3. Tangkapan Layar Denah (PNG Image)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 12px; color: var(--text-secondary);">
                Hasilkan gambar denah beserta seluruh perangkat dan kabel yang terlihat dalam format PNG.
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
                  <label style="color: var(--text-muted);">Kualitas:</label>
                  <select id="export-png-scale" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 8px; font-size: 12px;">
                    <option value="1">1x (Standar Web)</option>
                    <option value="2" selected>2x (Ultra Tajam / Cetak)</option>
                  </select>
                </div>
                <button id="btn-export-png" class="btn btn-secondary btn-sm">
                  <i data-lucide="image" style="width: 14px; height: 14px;"></i>
                  <span>Unduh Gambar PNG</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Section 4: PDF Report -->
          <div class="panel-section">
            <span class="section-label">4. Dokumen Laporan Resmi (PDF Multi-Halaman)</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px; background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.3);">
              <div style="font-size: 12px; color: var(--text-primary); font-weight: 500;">
                Dokumen komprehensif A4 Landscape berisi: Ringkasan Eksekutif, Visual Denah Kampus Resolusi Tinggi, Tabel Inventaris Perangkat, dan Tabel Jalur Kabel.
              </div>
              <button id="btn-export-pdf" class="btn btn-primary" style="width: 100%;">
                <i data-lucide="file-text" style="width: 15px; height: 15px;"></i>
                <span>Hasilkan Dokumen Laporan PDF</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    // Close button
    document.getElementById('export-modal-btn-close')?.addEventListener('click', () => this.hide());

    // Export JSON
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      const projectData = this.projectStorage.serializeProject();
      JsonImporterExporter.exportJson(projectData);
    });

    // Import JSON
    const fileInput = document.getElementById('input-import-json');
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const result = await JsonImporterExporter.importJson(file);
      if (!result.isValid) {
        alert('Gagal memulihkan proyek:\n' + result.errors.join('\n'));
      } else {
        if (confirm(`Pulihkan proyek "${result.project.name}" (${result.project.devices.length} perangkat, ${result.project.connections.length} kabel)? Perubahan lokal yang belum disimpan akan digantikan.`)) {
          this.projectStorage.deserializeProject(result.project);
          await this.projectStorage.saveCurrentProject();
          alert('Proyek berhasil dipulihkan!');
          this.hide();
        }
      }
      fileInput.value = '';
    });

    // Export CSV Devices
    document.getElementById('btn-export-csv-devices')?.addEventListener('click', async () => {
      const devices = this.deviceManager.getAllDevices();
      await CsvExporter.exportDevicesCsv(devices);
    });

    // Export CSV Cables
    document.getElementById('btn-export-csv-cables')?.addEventListener('click', async () => {
      const cables = this.cableManager.getAllConnections();
      await CsvExporter.exportCablesCsv(cables, this.deviceManager);
    });

    // Export PNG
    document.getElementById('btn-export-png')?.addEventListener('click', () => {
      const scaleSelect = document.getElementById('export-png-scale');
      const ratio = parseInt(scaleSelect?.value || '2', 10);
      SnapshotExporter.exportMapPng({
        stage: this.stage,
        interactionLayer: this.interactionLayer,
        pixelRatio: ratio
      });
    });

    // Export PDF Report
    document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-export-pdf');
      const prevHtml = btn.innerHTML;
      btn.innerHTML = '<span>Membuat Laporan PDF...</span>';
      btn.disabled = true;

      try {
        const projectData = this.projectStorage.serializeProject();
        await PdfReportGenerator.generateReport({
          project: projectData,
          devices: projectData.devices,
          connections: projectData.connections,
          deviceManager: this.deviceManager,
          stage: this.stage,
          interactionLayer: this.interactionLayer
        });
      } catch (err) {
        console.error('[ExportModal] PDF generation failed:', err);
        alert('Gagal membuat laporan PDF: ' + err.message);
      } finally {
        btn.innerHTML = prevHtml;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
      }
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
  }

  hide() {
    this.modalEl.style.display = 'none';
  }
}

