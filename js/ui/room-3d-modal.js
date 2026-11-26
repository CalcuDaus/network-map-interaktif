/**
 * NetMap — 3D Rooms & Custom 3D Model Manager Modal
 * Mengelola kotak ruangan/gedung 3D (seperti Ruang Control Utama) beserta dimensi meter,
 * transparansi dinding, warna, serta upload model 3D eksternal (.glb / .gltf).
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import {
  BUILTIN_ROOM_BUILDING_PRESETS,
  createBuildingRoomPresetData,
  getRoomMinDimensions,
  getDefaultRoomPassThrough
} from '../map/map-3d-models.js';
import { clamp, generateId, uiIcon } from '../utils/helpers.js';

export class Room3DModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   */
  constructor({ deviceManager, map3DEngine = null }) {
    this.deviceManager = deviceManager;
    this.map3DEngine = map3DEngine;
    this.modalEl = null;
    this.editingRoomId = null;
    this.uploadedRoomGlbUrl = '';
    this.formBaseDimensions = { widthMeters: 24, depthMeters: 20, heightMeters: 4.5 };

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'room-3d-modal';
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
      <div style="background-color: var(--bg-secondary, #d4e3e8); border: 1px solid var(--border-color, #9ab7c1); border-radius: 12px; width: 100%; max-width: 780px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
        <!-- Header -->
        <div style="height: 54px; border-bottom: 1px solid var(--border-color, #9ab7c1); background: var(--bg-tertiary, #c4d7df); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 30px; height: 30px; border-radius: 7px; background: rgba(42, 83, 103, 0.16); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a5367);">
              <i data-lucide="box" style="width: 17px; height: 17px;"></i>
            </div>
            <div>
              <span style="font-size: 15px; font-weight: 700; color: var(--text-primary, #0b1620); display: block; line-height: 1.2;">Kelola Ruangan 3D & Model Kustom (.GLB)</span>
              <span style="font-size: 11px; color: var(--text-muted, #537b8e);">Buat dinding ruangan 3D transparan atau unggah model 3D ruangan Anda sendiri</span>
            </div>
          </div>
          <button id="btn-room3d-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 16px 20px; overflow-y: auto; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 16px; flex: 1;">
          <!-- Left: Room Form -->
          <div style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #e3edf0); border: 1px solid var(--border-color, #9ab7c1); border-radius: 8px; padding: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span id="room3d-form-title" style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a5367);">Tambah Ruangan 3D Baru</span>
              <button type="button" id="btn-room3d-preset-noc" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 2px 8px;">
                + Isi Preset Ruang Control
              </button>
            </div>
            <div style="font-size: 10.5px; color: var(--text-muted); line-height: 1.35;">
              Tip: Anda bisa klik ruangan langsung di kanvas 3D lalu seret pakai tool <strong>Move (M)</strong> atau handle oranye, putar pakai <strong>Rotate (R)</strong> / <strong>[ ]</strong>.
            </div>

            <div style="display: flex; flex-direction: column; gap: 3px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Nama Ruangan *</label>
              <input type="text" id="r3d-name" placeholder="contoh: Ruang Control Utama"
                     style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary);">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Koordinat X (0 - 1)</label>
                <input type="number" id="r3d-x" step="0.005" min="0" max="1" value="0.635"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Koordinat Y (0 - 1)</label>
                <input type="number" id="r3d-y" step="0.005" min="0" max="1" value="0.195"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: var(--font-mono);">
              </div>
            </div>

            <button type="button" id="btn-room3d-use-selected" class="btn btn-secondary btn-sm ws-network-only" style="font-size: 11px;">
              Ambil Koordinat dari Perangkat Terpilih
            </button>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Lebar (m)</label>
                <input type="number" id="r3d-width" min="0.35" max="200" step="0.1" value="28"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 6px; font-size: 12px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Panjang (m)</label>
                <input type="number" id="r3d-depth" min="0.35" max="200" step="0.1" value="22"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 6px; font-size: 12px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Tinggi (m)</label>
                <input type="number" id="r3d-height" min="0.35" max="40" step="0.1" value="5"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 6px; font-size: 12px; font-family: var(--font-mono);">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Elevasi Z (m)</label>
                <input type="number" id="r3d-elev" min="0" max="40" step="0.05" value="0"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 6px; font-size: 12px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Rotasi (°)</label>
                <input type="number" id="r3d-rot-y" min="-360" max="360" step="5" value="0"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 6px; font-size: 12px; font-family: var(--font-mono);">
              </div>
            </div>

            <!-- Proportional Scale Slider + Lock Aspect Ratio -->
            <div style="background: rgba(42, 83, 103,0.06); border: 1px solid var(--border-color, #9ab7c1); border-radius: 7px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--text-primary);">Skala Gedung / Ruangan: <strong id="r3d-scale-pct" style="color: var(--accent-blue, #2a5367);">100%</strong></span>
                <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; color: var(--text-primary); cursor: pointer;">
                  <input type="checkbox" id="r3d-lock-aspect" checked>
                  <span>Kunci Rasio Proporsional</span>
                </label>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="range" id="r3d-scale-slider" min="0.25" max="4" step="0.05" value="1" style="flex: 1; accent-color: var(--accent-blue, #2a5367);">
                <input type="number" id="r3d-scale-input" min="0.2" max="5" step="0.05" value="1"
                       style="width: 64px; background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 3px 6px; font-size: 11.5px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => `
                  <button type="button" class="btn btn-secondary btn-sm btn-r3d-scale-preset" data-scale="${s}" style="font-size: 10px; padding: 2px 7px; font-family: var(--font-mono);">${s}x</button>
                `).join('')}
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Dinding</label>
                <input type="color" id="r3d-wall-color" value="#2a5367" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid var(--border-color);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Lantai</label>
                <input type="color" id="r3d-floor-color" value="#1e293b" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid var(--border-color);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Opasitas (%)</label>
                <input type="number" id="r3d-opacity" min="5" max="80" value="20"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 6px; font-size: 12px; font-family: var(--font-mono);">
              </div>
            </div>

            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-primary); cursor: pointer;">
              <input type="checkbox" id="r3d-locked">
              <span>Kunci posisi ruangan ini (tidak ikut tergeser saat klik objek lain)</span>
            </label>
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-primary); cursor: pointer; margin-top: 6px;">
              <input type="checkbox" id="r3d-pass-through">
              <span>Bisa Ditembus Avatar (Pass-Through — cocok untuk pohon kecil / semak; matikan untuk dinding, wastafel, &amp; keran)</span>
            </label>

            <!-- Documentation Metadata (Phase 8: School Digital Twin) -->
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
              <span style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a5367);">Dokumentasi Gedung (Opsional)</span>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <input type="text" id="r3d-doc-code" placeholder="Kode Ruang (mis. GDG-PPLG-01)"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--text-primary);">
                <input type="text" id="r3d-doc-zone" placeholder="Zona / Jurusan (mis. TJKT / PPLG)"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--text-primary);">
              </div>
              <input type="text" id="r3d-doc-pic" placeholder="Penanggung Jawab / PIC (mis. Tim Teknisi TKJ)"
                     style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--text-primary);">
              <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" id="r3d-doc-signboard" checked>
                <span>Tampilkan Papan Nama Gedung 3D di atas atap</span>
              </label>
            </div>

            <!-- Custom .GLB/.GLTF Room Model Upload -->
            <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Model 3D Ruangan Kustom (.glb / .gltf - Opsional)</label>
              <input type="file" id="r3d-glb-file" accept=".glb,.gltf" style="display: none;">
              <div style="display: flex; gap: 6px;">
                <button type="button" id="btn-r3d-upload-glb" class="btn btn-secondary btn-sm" style="flex: 1; font-size: 11px;">
                  Unggah File .GLB/.GLTF
                </button>
                <button type="button" id="btn-r3d-clear-glb" class="btn btn-sm" style="display: none; background: rgba(239,68,68,0.14); color: #dc2626; font-size: 11px;">
                  Hapus Model
                </button>
              </div>
              <input type="text" id="r3d-glb-url" placeholder="Atau URL model .glb (https://...)"
                     style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--text-primary);">
            </div>

            <div style="display: flex; gap: 8px; margin-top: 4px;">
              <button type="button" id="btn-room3d-save" class="btn btn-primary btn-sm" style="flex: 1; font-weight: 700;">
                Simpan Ruangan 3D
              </button>
              <button type="button" id="btn-room3d-reset-form" class="btn btn-secondary btn-sm">
                Reset Form
              </button>
            </div>
          </div>

          <!-- Right: Built-in 3D Building Presets & Existing Rooms List -->
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="background: var(--bg-primary, #e3edf0); border: 1px solid var(--border-color, #9ab7c1); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a5367);">Gedung &amp; Ruangan 3D (.GLB)</span>
                <span style="font-size: 10px; font-weight: 600; color: var(--text-muted);">${BUILTIN_ROOM_BUILDING_PRESETS.length} Model</span>
              </div>
              <div style="display: flex; gap: 4px; align-items: center;">
                <input type="text" id="r3d-preset-search" placeholder="Cari gedung / ruangan..."
                       style="flex: 1; background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 5px; padding: 4px 7px; font-size: 11px; color: var(--text-primary);">
                <button type="button" class="btn btn-primary btn-sm r3d-bldg-filter" data-filter="all" style="font-size: 10px; padding: 3px 6px;">Semua</button>
                <button type="button" class="btn btn-secondary btn-sm r3d-bldg-filter" data-filter="cutaway" style="font-size: 10px; padding: 3px 6px;">Cutaway</button>
                <button type="button" class="btn btn-secondary btn-sm r3d-bldg-filter" data-filter="full" style="font-size: 10px; padding: 3px 6px;">Atap Utuh</button>
              </div>
              <div id="r3d-building-presets" style="display: grid; grid-template-columns: 1fr; gap: 5px; max-height: 230px; overflow-y: auto; padding-right: 2px;">
                ${BUILTIN_ROOM_BUILDING_PRESETS.map((b) => `
                  <div class="r3d-bldg-card" data-bldg-name="${b.name.toLowerCase()}" data-bldg-type="${b.isCutaway ? 'cutaway' : 'full'}" style="background: var(--bg-secondary, #d4e3e8); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                    <div style="min-width: 0;">
                      <div style="font-size: 11.5px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.name}</div>
                      <div style="font-size: 10px; color: var(--text-muted);">${b.subtitle}</div>
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0;">
                      <button type="button" class="btn btn-primary btn-sm btn-r3d-bldg-place" data-bldg-id="${b.id}" style="font-size: 10px; padding: 2px 7px;" title="Pasang langsung ke kanvas 3D dan aktifkan mode Geser">+ Pasang</button>
                      <button type="button" class="btn btn-secondary btn-sm btn-r3d-bldg-fill" data-bldg-id="${b.id}" style="font-size: 10px; padding: 2px 6px;" title="Salin ukuran dan model ke form di sebelah kiri">Isi</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div style="background: var(--bg-primary, #e3edf0); border: 1px solid var(--border-color, #9ab7c1); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; flex: 1;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a5367);">Daftar Ruangan 3D Tersimpan</span>
                <button type="button" id="btn-r3d-lock-all" class="btn btn-secondary btn-sm" style="font-size: 10.5px; padding: 3px 8px;" title="Kunci atau buka kunci posisi semua ruangan 3D">${uiIcon('unlock', 12)} Kunci Semua</button>
              </div>
              <div id="r3d-list-container" style="display: flex; flex-direction: column; gap: 6px; max-height: 190px; overflow-y: auto;"></div>
            </div>

            <div class="ws-network-only" style="background: rgba(42, 83, 103, 0.08); border: 1px solid rgba(42, 83, 103, 0.25); border-radius: 8px; padding: 10px; font-size: 11px; color: var(--text-secondary); line-height: 1.45;">
              <strong style="color: var(--accent-blue); display: block; margin-bottom: 4px;">Tips Penumpukan Perangkat di Dalam Gedung:</strong>
              Pilih model <strong>Cutaway</strong> bila ingin atap terbuka sehingga switch/router/kabel di dalam ruangan tetap mudah diklik. Atur <strong>Ketinggian Z (Meter)</strong> di Panel Properti kanan.
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    this.modalEl.querySelector('#btn-room3d-close')?.addEventListener('click', () => this.hide());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.hide();
    });

    this.modalEl.querySelector('#btn-room3d-preset-noc')?.addEventListener('click', () => {
      this.editingRoomId = null;
      this.modalEl.querySelector('#r3d-name').value = 'Ruang Control Utama (NOC)';
      this.modalEl.querySelector('#r3d-x').value = '0.635';
      this.modalEl.querySelector('#r3d-y').value = '0.195';
      this.modalEl.querySelector('#r3d-width').value = '48';
      this.modalEl.querySelector('#r3d-depth').value = '34';
      this.modalEl.querySelector('#r3d-height').value = '6';
      this.modalEl.querySelector('#r3d-wall-color').value = '#2a5367';
      this.modalEl.querySelector('#r3d-floor-color').value = '#1e293b';
      this.modalEl.querySelector('#r3d-opacity').value = '18';
      this.setFormBaseAndScale({ widthMeters: 48, depthMeters: 34, heightMeters: 6 }, 1);
    });

    const scaleSlider = this.modalEl.querySelector('#r3d-scale-slider');
    const scaleInput = this.modalEl.querySelector('#r3d-scale-input');
    const wInput = this.modalEl.querySelector('#r3d-width');
    const dInput = this.modalEl.querySelector('#r3d-depth');
    const hInput = this.modalEl.querySelector('#r3d-height');
    const lockCb = this.modalEl.querySelector('#r3d-lock-aspect');

    scaleSlider?.addEventListener('input', () => this.applyScaleMultiplierToForm(scaleSlider.value));
    scaleInput?.addEventListener('input', () => this.applyScaleMultiplierToForm(scaleInput.value));
    this.modalEl.querySelectorAll('.btn-r3d-scale-preset').forEach((btn) => {
      btn.addEventListener('click', () => this.applyScaleMultiplierToForm(btn.getAttribute('data-scale')));
    });

    const syncFromAxisInput = (axis) => {
      const val = parseFloat(
        axis === 'w' ? wInput?.value : axis === 'd' ? dInput?.value : hInput?.value
      );
      if (!Number.isFinite(val) || val <= 0) return;
      const base = this.formBaseDimensions;
      if (lockCb?.checked) {
        const refBase = axis === 'w' ? base.widthMeters : axis === 'd' ? base.depthMeters : base.heightMeters;
        if (refBase > 0) {
          this.applyScaleMultiplierToForm(val / refBase, { skipAxis: axis });
          return;
        }
      }
      const { minW, minD, minH } = this.getActiveMinDimensions();
      this.formBaseDimensions = {
        widthMeters: Math.max(minW, parseFloat(wInput?.value) || base.widthMeters),
        depthMeters: Math.max(minD, parseFloat(dInput?.value) || base.depthMeters),
        heightMeters: Math.max(minH, parseFloat(hInput?.value) || base.heightMeters)
      };
      this.updateScaleReadout(1);
      this.previewEditingRoomDimensions();
    };
    wInput?.addEventListener('change', () => syncFromAxisInput('w'));
    dInput?.addEventListener('change', () => syncFromAxisInput('d'));
    hInput?.addEventListener('change', () => syncFromAxisInput('h'));

    this.modalEl.querySelector('#btn-room3d-use-selected')?.addEventListener('click', () => {
      const selId = this.deviceManager?.selectedDeviceId;
      const dev = selId ? this.deviceManager.getDeviceById(selId) : null;
      if (dev?.position) {
        this.modalEl.querySelector('#r3d-x').value = dev.position.x.toFixed(3);
        this.modalEl.querySelector('#r3d-y').value = dev.position.y.toFixed(3);
      } else {
        alert('Pilih salah satu perangkat terlebih dahulu agar koordinatnya dapat disalin.');
      }
    });

    const glbFileInput = this.modalEl.querySelector('#r3d-glb-file');
    const clearGlbBtn = this.modalEl.querySelector('#btn-r3d-clear-glb');
    const glbUrlInput = this.modalEl.querySelector('#r3d-glb-url');

    this.modalEl.querySelector('#btn-r3d-upload-glb')?.addEventListener('click', () => glbFileInput?.click());
    glbFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.uploadedRoomGlbUrl = ev.target.result;
        if (glbUrlInput) glbUrlInput.value = '[File GLB Lokal Terpilih]';
        if (clearGlbBtn) clearGlbBtn.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    });

    clearGlbBtn?.addEventListener('click', () => {
      this.uploadedRoomGlbUrl = '';
      if (glbUrlInput) glbUrlInput.value = '';
      clearGlbBtn.style.display = 'none';
    });

    let activeFilter = 'all';
    const searchInput = this.modalEl.querySelector('#r3d-preset-search');
    const applyPresetFilter = () => {
      const q = String(searchInput?.value || '').trim().toLowerCase();
      this.modalEl.querySelectorAll('.r3d-bldg-card').forEach((card) => {
        const nameMatch = !q || String(card.getAttribute('data-bldg-name') || '').includes(q);
        const typeMatch = activeFilter === 'all' || card.getAttribute('data-bldg-type') === activeFilter;
        card.style.display = (nameMatch && typeMatch) ? 'flex' : 'none';
      });
    };
    searchInput?.addEventListener('input', applyPresetFilter);
    this.modalEl.querySelectorAll('.r3d-bldg-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.getAttribute('data-filter') || 'all';
        this.modalEl.querySelectorAll('.r3d-bldg-filter').forEach((b) => {
          b.className = `btn btn-sm r3d-bldg-filter ${b === btn ? 'btn-primary' : 'btn-secondary'}`;
        });
        applyPresetFilter();
      });
    });

    this.modalEl.querySelectorAll('.btn-r3d-bldg-place').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bId = btn.getAttribute('data-bldg-id');
        if (bId) this.applyBuildingPreset(bId, { autoPlace: true });
      });
    });

    this.modalEl.querySelectorAll('.btn-r3d-bldg-fill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bId = btn.getAttribute('data-bldg-id');
        if (bId) this.applyBuildingPreset(bId, { autoPlace: false });
      });
    });

    this.modalEl.querySelector('#btn-room3d-save')?.addEventListener('click', () => this.saveRoomFromForm());
    this.modalEl.querySelector('#btn-room3d-reset-form')?.addEventListener('click', () => this.resetForm());
    this.modalEl.querySelector('#btn-r3d-lock-all')?.addEventListener('click', () => {
      this.map3DEngine?.toggleRoomsLocked?.();
      this.syncGlobalLockButton();
      this.renderRoomList();
    });

    eventBus.on('modal:open-room-3d', () => this.show());
    eventBus.on('rooms3d:lock-changed', () => {
      this.syncGlobalLockButton();
      if (this.modalEl.style.display === 'flex') {
        this.renderRoomList();
      }
    });
  }

  syncGlobalLockButton() {
    const btn = this.modalEl.querySelector('#btn-r3d-lock-all');
    if (!btn) return;
    const locked = Boolean(this.map3DEngine?.roomsLocked);
    btn.className = `btn btn-sm ${locked ? 'btn-primary' : 'btn-secondary'}`;
    btn.innerHTML = locked ? `${uiIcon('lock', 12)} Semua Terkunci (Klik Buka)` : `${uiIcon('unlock', 12)} Kunci Semua Ruangan`;
  }

  getViewportCenterNorm() {
    if (this.map3DEngine?.controls?.target && typeof this.map3DEngine?.worldToNorm === 'function') {
      const t = this.map3DEngine.controls.target;
      const { normX, normY } = this.map3DEngine.worldToNorm(t.x, t.z);
      return {
        x: clamp(Number(normX.toFixed(3)), 0.05, 0.95),
        y: clamp(Number(normY.toFixed(3)), 0.05, 0.95)
      };
    }
    return { x: 0.5, y: 0.5 };
  }

  applyBuildingPreset(presetId, { autoPlace = false } = {}) {
    const preset = BUILTIN_ROOM_BUILDING_PRESETS.find((b) => b.id === presetId);
    if (!preset) return null;

    const pos = this.getViewportCenterNorm();
    if (!autoPlace) {
      this.editingRoomId = null;
      this.uploadedRoomGlbUrl = '';
      this.modalEl.querySelector('#room3d-form-title').textContent = `Tambah Gedung: ${preset.name}`;
      this.modalEl.querySelector('#r3d-name').value = preset.name;
      this.modalEl.querySelector('#r3d-x').value = pos.x.toFixed(3);
      this.modalEl.querySelector('#r3d-y').value = pos.y.toFixed(3);
      this.modalEl.querySelector('#r3d-width').value = preset.widthMeters;
      this.modalEl.querySelector('#r3d-depth').value = preset.depthMeters;
      this.modalEl.querySelector('#r3d-height').value = preset.heightMeters;
      this.setFormBaseAndScale({ widthMeters: preset.widthMeters, depthMeters: preset.depthMeters, heightMeters: preset.heightMeters }, 1, true);
      const rotInput = this.modalEl.querySelector('#r3d-rot-y');
      if (rotInput) rotInput.value = '0';
      this.modalEl.querySelector('#r3d-wall-color').value = preset.wallColor || '#2a5367';
      this.modalEl.querySelector('#r3d-floor-color').value = preset.floorColor || '#1e293b';
      this.modalEl.querySelector('#r3d-opacity').value = Math.round((preset.opacity ?? 0.18) * 100);
      this.modalEl.querySelector('#r3d-glb-url').value = preset.customModelUrl;
      this.modalEl.querySelector('#btn-r3d-clear-glb').style.display = 'inline-flex';
      const passCb = this.modalEl.querySelector('#r3d-pass-through');
      if (passCb) passCb.checked = getDefaultRoomPassThrough(preset);
      return null;
    }

    const existing = [...stateManager.getRooms3d()];
    const roomData = createBuildingRoomPresetData(preset, {
      x: pos.x,
      y: pos.y,
      existingRooms: existing,
      id: generateId('room3d')
    });
    if (!roomData) return null;

    stateManager.setRooms3d([...existing, roomData]);
    this.renderRoomList();
    this.hide();
    if (stateManager.getViewMode?.() !== '3d') {
      stateManager.setViewMode?.('3d');
    }
    stateManager.selectRoom3d?.(roomData.id);
    this.map3DEngine?.setNavTool?.('move');
    this.map3DEngine?.focusOnRoom3d?.(roomData.id);
    this.map3DEngine?.showStatusHint?.(
      `Gedung "${roomData.name}" dipasang! Seret langsung di kanvas untuk geser (M = Geser, R / [ ] = Putar).`
    );
    return roomData;
  }

  getActiveMinDimensions(explicitCustomUrl = '') {
    const urlVal = (this.modalEl?.querySelector('#r3d-glb-url')?.value || '').trim();
    const customModelUrl =
      explicitCustomUrl ||
      this.uploadedRoomGlbUrl ||
      (urlVal && !urlVal.startsWith('[File GLB') ? urlVal : '');
    return getRoomMinDimensions({ customModelUrl });
  }

  setFormBaseAndScale(baseDims, scale = 1, lockAspect = true) {
    const { minW, minD, minH } = this.getActiveMinDimensions();
    this.formBaseDimensions = {
      widthMeters: Math.max(minW, Number(baseDims?.widthMeters) || 24),
      depthMeters: Math.max(minD, Number(baseDims?.depthMeters) || 20),
      heightMeters: Math.max(minH, Number(baseDims?.heightMeters) || 4.5)
    };
    const lockCb = this.modalEl.querySelector('#r3d-lock-aspect');
    if (lockCb) lockCb.checked = Boolean(lockAspect);
    this.updateScaleReadout(scale);
  }

  updateScaleReadout(scale = 1) {
    const clamped = clamp(Number(scale) || 1, 0.2, 5);
    const slider = this.modalEl.querySelector('#r3d-scale-slider');
    const numInput = this.modalEl.querySelector('#r3d-scale-input');
    const pctEl = this.modalEl.querySelector('#r3d-scale-pct');
    if (slider) slider.value = String(clamp(clamped, 0.25, 4));
    if (numInput) numInput.value = Number(clamped.toFixed(2));
    if (pctEl) pctEl.textContent = `${Math.round(clamped * 100)}%`;
  }

  applyScaleMultiplierToForm(rawScale, { skipAxis = '' } = {}) {
    const scale = clamp(parseFloat(rawScale) || 1, 0.2, 5);
    const base = this.formBaseDimensions || { widthMeters: 24, depthMeters: 20, heightMeters: 4.5 };
    const { minW, minD, minH } = this.getActiveMinDimensions();
    const wEl = this.modalEl.querySelector('#r3d-width');
    const dEl = this.modalEl.querySelector('#r3d-depth');
    const hEl = this.modalEl.querySelector('#r3d-height');
    if (wEl && skipAxis !== 'w') wEl.value = clamp(Number((base.widthMeters * scale).toFixed(2)), minW, 200);
    if (dEl && skipAxis !== 'd') dEl.value = clamp(Number((base.depthMeters * scale).toFixed(2)), minD, 200);
    if (hEl && skipAxis !== 'h') hEl.value = clamp(Number((base.heightMeters * scale).toFixed(2)), minH, 40);
    this.updateScaleReadout(scale);
    this.previewEditingRoomDimensions();
  }

  previewEditingRoomDimensions() {
    if (!this.editingRoomId || !this.map3DEngine?.rebuildSingleRoom3dMesh) return;
    const cur = stateManager.getRoom3dById?.(this.editingRoomId);
    if (!cur) return;
    const { minW, minD, minH } = getRoomMinDimensions(cur);
    const widthMeters = clamp(parseFloat(this.modalEl.querySelector('#r3d-width')?.value) || cur.widthMeters, minW, 200);
    const depthMeters = clamp(parseFloat(this.modalEl.querySelector('#r3d-depth')?.value) || cur.depthMeters, minD, 200);
    const heightMeters = clamp(parseFloat(this.modalEl.querySelector('#r3d-height')?.value) || cur.heightMeters, minH, 40);
    const elevationMeters = clamp(parseFloat(this.modalEl.querySelector('#r3d-elev')?.value) || 0, 0, 40);
    this.map3DEngine.rebuildSingleRoom3dMesh(
      { ...cur, widthMeters, depthMeters, heightMeters, elevationMeters },
      stateManager.getSelectedRoom3dId?.() === cur.id
    );
  }

  resetForm() {
    this.editingRoomId = null;
    this.uploadedRoomGlbUrl = '';
    this.modalEl.querySelector('#room3d-form-title').textContent = 'Tambah Ruangan 3D Baru';
    this.modalEl.querySelector('#r3d-name').value = '';
    this.modalEl.querySelector('#r3d-x').value = '0.500';
    this.modalEl.querySelector('#r3d-y').value = '0.500';
    this.modalEl.querySelector('#r3d-width').value = '24';
    this.modalEl.querySelector('#r3d-depth').value = '20';
    this.modalEl.querySelector('#r3d-height').value = '4.5';
    const elevInput = this.modalEl.querySelector('#r3d-elev');
    if (elevInput) elevInput.value = '0';
    this.setFormBaseAndScale({ widthMeters: 24, depthMeters: 20, heightMeters: 4.5 }, 1, true);
    const rotInput = this.modalEl.querySelector('#r3d-rot-y');
    if (rotInput) rotInput.value = '0';
    const lockedCb = this.modalEl.querySelector('#r3d-locked');
    if (lockedCb) lockedCb.checked = false;
    const passCb = this.modalEl.querySelector('#r3d-pass-through');
    if (passCb) passCb.checked = false;
    const codeInp = this.modalEl.querySelector('#r3d-doc-code');
    if (codeInp) codeInp.value = '';
    const zoneInp = this.modalEl.querySelector('#r3d-doc-zone');
    if (zoneInp) zoneInp.value = '';
    const picInp = this.modalEl.querySelector('#r3d-doc-pic');
    if (picInp) picInp.value = '';
    const signCb = this.modalEl.querySelector('#r3d-doc-signboard');
    if (signCb) signCb.checked = true;
    this.modalEl.querySelector('#r3d-glb-url').value = '';
    this.modalEl.querySelector('#btn-r3d-clear-glb').style.display = 'none';
  }

  saveRoomFromForm() {
    const name = (this.modalEl.querySelector('#r3d-name')?.value || '').trim();
    if (!name) {
      alert('Nama ruangan 3D wajib diisi.');
      return;
    }

    const urlVal = (this.modalEl.querySelector('#r3d-glb-url')?.value || '').trim();
    const customModelUrl = this.uploadedRoomGlbUrl || (urlVal && !urlVal.startsWith('[File GLB') ? urlVal : '');

    const existing = [...stateManager.getRooms3d()];
    const existingItem = this.editingRoomId ? existing.find((r) => r.id === this.editingRoomId) : null;
    const { minW, minD, minH } = getRoomMinDimensions({ customModelUrl });
    const widthMeters = clamp(parseFloat(this.modalEl.querySelector('#r3d-width')?.value) || 20, minW, 200);
    const depthMeters = clamp(parseFloat(this.modalEl.querySelector('#r3d-depth')?.value) || 16, minD, 200);
    const heightMeters = clamp(parseFloat(this.modalEl.querySelector('#r3d-height')?.value) || 4.5, minH, 40);
    const scaleVal = clamp(parseFloat(this.modalEl.querySelector('#r3d-scale-input')?.value) || 1, 0.2, 5);
    const lockAspectRatio = Boolean(this.modalEl.querySelector('#r3d-lock-aspect')?.checked);
    const prevDoc = existingItem?.doc && typeof existingItem.doc === 'object' ? existingItem.doc : {};
    const roomCodeVal = String(this.modalEl.querySelector('#r3d-doc-code')?.value || '').trim();
    const zoneVal = String(this.modalEl.querySelector('#r3d-doc-zone')?.value || '').trim();
    const picVal = String(this.modalEl.querySelector('#r3d-doc-pic')?.value || '').trim();
    const showSignboardVal = Boolean(this.modalEl.querySelector('#r3d-doc-signboard')?.checked);

    const roomData = {
      ...(existingItem || {}),
      id: this.editingRoomId || generateId('room3d'),
      name,
      x: clamp(parseFloat(this.modalEl.querySelector('#r3d-x')?.value) || 0.5, 0, 1),
      y: clamp(parseFloat(this.modalEl.querySelector('#r3d-y')?.value) || 0.5, 0, 1),
      elevationMeters: clamp(parseFloat(this.modalEl.querySelector('#r3d-elev')?.value) || 0, 0, 40),
      widthMeters,
      depthMeters,
      heightMeters,
      baseWidthMeters: this.formBaseDimensions?.widthMeters || widthMeters,
      baseDepthMeters: this.formBaseDimensions?.depthMeters || depthMeters,
      baseHeightMeters: this.formBaseDimensions?.heightMeters || heightMeters,
      modelScale: Number(scaleVal.toFixed(3)),
      lockAspectRatio,
      rotationY: clamp(parseFloat(this.modalEl.querySelector('#r3d-rot-y')?.value) || 0, -360, 360),
      wallColor: this.modalEl.querySelector('#r3d-wall-color')?.value || '#2a5367',
      floorColor: this.modalEl.querySelector('#r3d-floor-color')?.value || '#1e293b',
      opacity: clamp((parseFloat(this.modalEl.querySelector('#r3d-opacity')?.value) || 20) / 100, 0.05, 0.85),
      locked: Boolean(this.modalEl.querySelector('#r3d-locked')?.checked),
      passThrough: Boolean(this.modalEl.querySelector('#r3d-pass-through')?.checked),
      customModelUrl,
      doc: {
        ...prevDoc,
        roomCode: roomCodeVal,
        zone: zoneVal,
        picName: picVal,
        showSignboard: showSignboardVal
      }
    };

    const idx = existing.findIndex((r) => r.id === roomData.id);
    if (idx >= 0) {
      existing[idx] = roomData;
    } else {
      existing.push(roomData);
    }

    stateManager.setRooms3d(existing);
    stateManager.selectRoom3d?.(roomData.id);
    this.map3DEngine?.showStatusHint?.(
      `Ruangan "${roomData.name}" tersimpan — Klik "Geser" atau pakai tool Move (M) / handle oranye di kanvas 3D untuk memindahkannya.`
    );
    this.renderRoomList();
    this.resetForm();
  }

  renderRoomList() {
    const container = this.modalEl.querySelector('#r3d-list-container');
    if (!container) return;

    const rooms = stateManager.getRooms3d();
    if (rooms.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 11.5px; border: 1px dashed var(--border-color); border-radius: 6px;">
          Belum ada ruangan 3D. Klik <strong>"+ Isi Preset Ruang Control"</strong> lalu simpan untuk mencoba!
        </div>
      `;
      return;
    }

    const globalLocked = Boolean(this.map3DEngine?.roomsLocked);
    container.innerHTML = rooms.map((r) => {
      const rotDeg = Math.round(Number(r.rotationY ?? r.rotationDeg) || 0);
      const scalePct = r.baseWidthMeters > 0
        ? Math.round((Number(r.widthMeters) / Number(r.baseWidthMeters)) * 100)
        : Math.round((Number(r.modelScale) || 1) * 100);
      const roomSelfLocked = Boolean(r.locked);
      const isLocked = globalLocked || roomSelfLocked;
      const disabledAttr = isLocked ? 'disabled style="font-size: 10px; padding: 2px 6px; opacity: 0.45; cursor: not-allowed;"' : 'style="font-size: 10px; padding: 2px 6px;"';
      const moveDisabledAttr = isLocked ? 'disabled style="font-size: 10px; padding: 2px 7px; opacity: 0.45; cursor: not-allowed;"' : 'style="font-size: 10px; padding: 2px 7px;"';
      return `
      <div style="background: var(--bg-secondary, #d4e3e8); border: 1px solid ${isLocked ? '#d97706' : 'var(--border-color)'}; border-radius: 6px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="min-width: 0;">
          <div style="font-size: 12px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px;">
            ${isLocked ? uiIcon('lock', 11) : ''}${r.name}
          </div>
          <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
            ${r.widthMeters}x${r.depthMeters}x${r.heightMeters}m • ${scalePct}% • ${rotDeg}°${r.customModelUrl ? ' • GLB' : ''}${getDefaultRoomPassThrough(r) ? ' • Bisa Ditembus' : ''}${isLocked ? ' • Terkunci' : ''}
          </div>
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0; flex-wrap: wrap;">
          <button type="button" class="btn ${roomSelfLocked ? 'btn-primary' : 'btn-secondary'} btn-sm btn-r3d-lock" data-id="${r.id}" style="font-size: 10px; padding: 2px 6px;" title="${roomSelfLocked ? 'Buka kunci ruangan ini' : 'Kunci ruangan ini agar tidak tergeser'}">${uiIcon(roomSelfLocked ? 'lock' : 'unlock', 11)}</button>
          <button type="button" class="btn btn-secondary btn-sm btn-r3d-scale-step" data-id="${r.id}" data-factor="0.9" ${disabledAttr} title="Perkecil skala -10%">-</button>
          <button type="button" class="btn btn-secondary btn-sm btn-r3d-scale-step" data-id="${r.id}" data-factor="1.1" ${disabledAttr} title="Perbesar skala +10%">+</button>
          <button type="button" class="btn btn-primary btn-sm btn-r3d-move" data-id="${r.id}" ${moveDisabledAttr} title="Tutup modal dan langsung geser ruangan di kanvas 3D">Geser</button>
          <button type="button" class="btn btn-secondary btn-sm btn-r3d-edit" data-id="${r.id}" style="font-size: 10px; padding: 2px 6px;">Edit</button>
          <button type="button" class="btn btn-sm btn-r3d-del" data-id="${r.id}" style="font-size: 10px; padding: 2px 6px; background: rgba(239,68,68,0.14); color: #dc2626;">Hapus</button>
        </div>
      </div>
    `;
    }).join('');

    container.querySelectorAll('.btn-r3d-lock').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (this.map3DEngine?.toggleSingleRoomLock) {
          this.map3DEngine.toggleSingleRoomLock(id);
        } else {
          const targetRoom = rooms.find((r) => r.id === id);
          if (targetRoom) stateManager.updateRoom3d?.(id, { locked: !targetRoom.locked });
        }
        this.renderRoomList();
      });
    });

    container.querySelectorAll('.btn-r3d-scale-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const factor = parseFloat(btn.getAttribute('data-factor')) || 1;
        if (this.map3DEngine?.isRoomLocked?.(id)) return;
        stateManager.selectRoom3d?.(id);
        this.map3DEngine?.scaleSelectedRoomIn3D?.(factor);
        this.renderRoomList();
      });
    });

    container.querySelectorAll('.btn-r3d-move').forEach((btn) => {
      btn.addEventListener('click', () => {
        const room = rooms.find((r) => r.id === btn.getAttribute('data-id'));
        if (!room || this.map3DEngine?.isRoomLocked?.(room)) return;
        this.hide();
        if (stateManager.getViewMode?.() !== '3d') {
          stateManager.setViewMode?.('3d');
        }
        stateManager.selectRoom3d?.(room.id);
        this.map3DEngine?.setNavTool?.('move');
        this.map3DEngine?.focusOnRoom3d?.(room.id);
        this.map3DEngine?.showStatusHint?.(
          `Seret ruangan "${room.name}" langsung di kanvas 3D untuk memindahkannya (M = Geser, R = Putar, [ / ] = Putar 15°).`
        );
      });
    });

    container.querySelectorAll('.btn-r3d-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const room = rooms.find((r) => r.id === btn.getAttribute('data-id'));
        if (!room) return;
        this.populateFormForRoom(room);
      });
    });

    container.querySelectorAll('.btn-r3d-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        stateManager.deleteRoom3d?.(id);
        this.renderRoomList();
      });
    });
  }

  populateFormForRoom(room) {
    if (!room || !this.modalEl) return;
    this.editingRoomId = room.id;
    this.uploadedRoomGlbUrl = room.customModelUrl?.startsWith('data:') ? room.customModelUrl : '';
    this.modalEl.querySelector('#room3d-form-title').textContent = `Edit Ruangan: ${room.name}`;
    this.modalEl.querySelector('#r3d-name').value = room.name;
    this.modalEl.querySelector('#r3d-x').value = room.x;
    this.modalEl.querySelector('#r3d-y').value = room.y;
    this.modalEl.querySelector('#r3d-width').value = room.widthMeters;
    this.modalEl.querySelector('#r3d-depth').value = room.depthMeters;
    this.modalEl.querySelector('#r3d-height').value = room.heightMeters;
    const elevInput = this.modalEl.querySelector('#r3d-elev');
    if (elevInput) elevInput.value = Number(room.elevationMeters ?? 0);
    this.modalEl.querySelector('#r3d-glb-url').value = this.uploadedRoomGlbUrl ? '[File GLB Lokal Terpilih]' : (room.customModelUrl || '');
    this.modalEl.querySelector('#btn-r3d-clear-glb').style.display = room.customModelUrl ? 'inline-flex' : 'none';
    const baseW = Number(room.baseWidthMeters) || Number(room.widthMeters) || 20;
    const baseD = Number(room.baseDepthMeters) || Number(room.depthMeters) || 16;
    const baseH = Number(room.baseHeightMeters) || Number(room.heightMeters) || 4.5;
    const curScale = Number(room.modelScale) || (baseW > 0 ? Number(room.widthMeters) / baseW : 1);
    this.setFormBaseAndScale(
      { widthMeters: baseW, depthMeters: baseD, heightMeters: baseH },
      curScale,
      room.lockAspectRatio !== false
    );
    const rotInput = this.modalEl.querySelector('#r3d-rot-y');
    if (rotInput) rotInput.value = Number(room.rotationY ?? room.rotationDeg) || 0;
    this.modalEl.querySelector('#r3d-wall-color').value = room.wallColor || '#2a5367';
    this.modalEl.querySelector('#r3d-floor-color').value = room.floorColor || '#1e293b';
    this.modalEl.querySelector('#r3d-opacity').value = Math.round((room.opacity ?? 0.2) * 100);
    const lockedCb = this.modalEl.querySelector('#r3d-locked');
    if (lockedCb) lockedCb.checked = Boolean(room.locked);
    const passCb = this.modalEl.querySelector('#r3d-pass-through');
    if (passCb) passCb.checked = getDefaultRoomPassThrough(room);
    const codeInp = this.modalEl.querySelector('#r3d-doc-code');
    if (codeInp) codeInp.value = room.doc?.roomCode || '';
    const zoneInp = this.modalEl.querySelector('#r3d-doc-zone');
    if (zoneInp) zoneInp.value = room.doc?.zone || '';
    const picInp = this.modalEl.querySelector('#r3d-doc-pic');
    if (picInp) picInp.value = room.doc?.picName || '';
    const signCb = this.modalEl.querySelector('#r3d-doc-signboard');
    if (signCb) signCb.checked = room.doc?.showSignboard !== false;
  }

  openForRoom(roomId) {
    const room = stateManager.getRoom3dById?.(roomId);
    this.show();
    if (room) {
      this.populateFormForRoom(room);
    }
  }

  show() {
    this.syncGlobalLockButton();
    this.renderRoomList();
    this.modalEl.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.modalEl });
    }
  }

  hide() {
    this.modalEl.style.display = 'none';
  }
}

