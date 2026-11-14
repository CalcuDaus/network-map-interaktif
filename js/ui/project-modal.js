/**
 * NetMap — Project Management Modal
 * Allows renaming project, clearing project, switching projects, or resetting demo data
 */

import { stateManager } from '../core/state-manager.js';

export class ProjectModal {
  /**
   * @param {Object} options
   * @param {import('../storage/project-storage.js').ProjectStorage} options.projectStorage
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   */
  constructor({ projectStorage, deviceManager, cableManager }) {
    this.projectStorage = projectStorage;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;

    this.modalEl = null;
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'project-manager-modal';
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
      <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-lg); width: 100%; max-width: 520px; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden;">
        
        <!-- Header -->
        <div style="height: 52px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="folder" style="width: 18px; height: 18px; color: var(--accent-sky);"></i>
            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Kelola Proyek Jaringan</span>
          </div>
          <button id="project-modal-btn-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
          
          <div class="panel-section">
            <span class="section-label">Informasi Proyek Aktif</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 11px; color: var(--text-muted);">Nama Proyek / Wilayah</label>
                <input type="text" id="project-name-input" value="" 
                       style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 13px; font-weight: 600; padding: 6px 10px;">
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: var(--text-secondary); background: var(--bg-secondary); padding: 8px 10px; border-radius: 4px;">
                <div>ID: <span id="project-id-display" style="font-family: var(--font-mono); color: var(--accent-sky);">-</span></div>
                <div>Format: <span style="color: var(--text-primary);">Offline IndexedDB</span></div>
                <div>Perangkat: <span id="project-dev-count" style="font-weight: 600; color: var(--status-online);">-</span></div>
                <div>Kabel: <span id="project-cab-count" style="font-weight: 600; color: var(--accent-sky);">-</span></div>
              </div>

              <button id="btn-save-project-name" class="btn btn-primary btn-sm" style="width: 100%;">
                <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                <span>Perbarui Nama Proyek</span>
              </button>
            </div>
          </div>

          <div class="panel-section">
            <span class="section-label">Tindakan Cepat</span>
            <div class="info-card" style="display: flex; flex-direction: column; gap: 8px;">
              <button id="btn-force-save" class="btn btn-secondary btn-sm" style="justify-content: flex-start;">
                <i data-lucide="save" style="width: 14px; height: 14px;"></i>
                <span>Simpan Sekarang (Paksa Tulis ke IndexedDB)</span>
              </button>
              
              <button id="btn-reset-demo" class="btn btn-secondary btn-sm" style="justify-content: flex-start; color: var(--status-warning);">
                <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
                <span>Muat Ulang Data Sampel Default Kampus</span>
              </button>

              <button id="btn-clear-all" class="btn btn-sm" style="justify-content: flex-start; background: rgba(239, 68, 68, 0.15); color: var(--status-offline); border: 1px solid rgba(239, 68, 68, 0.3);">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                <span>Kosongkan Seluruh Perangkat & Kabel (Proyek Baru Kosong)</span>
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
    document.getElementById('project-modal-btn-close')?.addEventListener('click', () => this.hide());

    // Update Project Name
    document.getElementById('btn-save-project-name')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('project-name-input');
      const newName = nameInput?.value.trim();
      if (newName) {
        stateManager.getState().project.name = newName;
        // Update brand in toolbar
        const brandBadge = document.querySelector('.brand-badge');
        if (brandBadge) brandBadge.textContent = newName;
        await this.projectStorage.saveCurrentProject();
        alert('Nama proyek berhasil diperbarui!');
        this.hide();
      }
    });

    // Force Save
    document.getElementById('btn-force-save')?.addEventListener('click', async () => {
      await this.projectStorage.saveCurrentProject();
      alert('Proyek berhasil disimpan ke IndexedDB!');
    });

    // Reset Demo Data
    document.getElementById('btn-reset-demo')?.addEventListener('click', async () => {
      if (confirm('Muat ulang 8 perangkat & 7 kabel sampel kampus default? Perubahan yang belum diekspor akan hilang.')) {
        window.__netmap?.seedSampleTopology();
        await this.projectStorage.saveCurrentProject();
        alert('Data sampel berhasil dimuat ulang!');
        this.hide();
      }
    });

    // Clear All
    document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
      if (confirm('PERINGATAN: Yakin ingin menghapus SELURUH perangkat dan kabel untuk membuat proyek kosong baru?')) {
        const devs = this.deviceManager.getAllDevices();
        devs.forEach((d) => this.deviceManager.deleteDevice(d.id));
        await this.projectStorage.saveCurrentProject();
        alert('Semua perangkat dan kabel telah dikosongkan.');
        this.hide();
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
    const state = stateManager.getState();
    const nameInput = document.getElementById('project-name-input');
    const idDisplay = document.getElementById('project-id-display');
    const devCount = document.getElementById('project-dev-count');
    const cabCount = document.getElementById('project-cab-count');

    if (nameInput) nameInput.value = state.project.name || 'SmartSchool NetMap';
    if (idDisplay) idDisplay.textContent = state.project.id || 'proj-default';
    if (devCount) devCount.textContent = `${this.deviceManager.getAllDevices().length} unit`;
    if (cabCount) cabCount.textContent = `${this.cableManager.getAllConnections().length} jalur`;

    this.modalEl.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  }

  hide() {
    this.modalEl.style.display = 'none';
  }
}

