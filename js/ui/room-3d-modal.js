/**
 * NetMap — 3D Rooms & Custom 3D Model Manager Modal
 * Mengelola kotak ruangan/gedung 3D (seperti Ruang Control Utama) beserta dimensi meter,
 * transparansi dinding, warna, serta upload model 3D eksternal (.glb / .gltf).
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { clamp, generateId } from '../utils/helpers.js';

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
      <div style="background-color: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color, #e5cca0); border-radius: 12px; width: 100%; max-width: 780px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
        <!-- Header -->
        <div style="height: 54px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 30px; height: 30px; border-radius: 7px; background: rgba(42, 124, 19, 0.16); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13);">
              <i data-lucide="box" style="width: 17px; height: 17px;"></i>
            </div>
            <div>
              <span style="font-size: 15px; font-weight: 700; color: var(--text-primary, #18350d); display: block; line-height: 1.2;">Kelola Ruangan 3D & Model Kustom (.GLB)</span>
              <span style="font-size: 11px; color: var(--text-muted, #678458);">Buat dinding ruangan 3D transparan atau unggah model 3D ruangan Anda sendiri</span>
            </div>
          </div>
          <button id="btn-room3d-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 16px 20px; overflow-y: auto; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 16px; flex: 1;">
          <!-- Left: Room Form -->
          <div style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span id="room3d-form-title" style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">Tambah Ruangan 3D Baru</span>
              <button type="button" id="btn-room3d-preset-noc" class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 2px 8px;">
                + Isi Preset Ruang Control
              </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 3px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Nama Ruangan *</label>
              <input type="text" id="r3d-name" placeholder="contoh: Ruang Control Utama"
                     style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary);">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Koordinat X (0 - 1)</label>
                <input type="number" id="r3d-x" step="0.005" min="0" max="1" value="0.635"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--text-primary);">Koordinat Y (0 - 1)</label>
                <input type="number" id="r3d-y" step="0.005" min="0" max="1" value="0.195"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: var(--font-mono);">
              </div>
            </div>

            <button type="button" id="btn-room3d-use-selected" class="btn btn-secondary btn-sm" style="font-size: 11px;">
              Ambil Koordinat dari Perangkat Terpilih
            </button>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Lebar (m)</label>
                <input type="number" id="r3d-width" min="2" max="200" step="1" value="28"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Panjang (m)</label>
                <input type="number" id="r3d-depth" min="2" max="200" step="1" value="22"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Tinggi (m)</label>
                <input type="number" id="r3d-height" min="2" max="40" step="0.5" value="5"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: var(--font-mono);">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Dinding</label>
                <input type="color" id="r3d-wall-color" value="#2a7c13" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid var(--border-color);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Lantai</label>
                <input type="color" id="r3d-floor-color" value="#1e293b" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid var(--border-color);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-primary);">Opasitas (%)</label>
                <input type="number" id="r3d-opacity" min="5" max="80" value="20"
                       style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 6px; font-size: 12px; font-family: var(--font-mono);">
              </div>
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
                     style="background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #e5cca0); border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--text-primary);">
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

          <!-- Right: Existing Rooms List & 3D Prep Guide -->
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color, #e5cca0); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; flex: 1;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue, #2a7c13);">Daftar Ruangan 3D Tersimpan</span>
              <div id="r3d-list-container" style="display: flex; flex-direction: column; gap: 6px; max-height: 250px; overflow-y: auto;"></div>
            </div>

            <div style="background: rgba(42, 124, 19, 0.08); border: 1px solid rgba(42, 124, 19, 0.25); border-radius: 8px; padding: 10px; font-size: 11px; color: var(--text-secondary); line-height: 1.45;">
              <strong style="color: var(--accent-blue); display: block; margin-bottom: 4px;">Tips Penumpukan Perangkat 3D:</strong>
              Klik perangkat apa pun di peta (2D atau 3D), lalu atur <strong>Ketinggian Z (Meter)</strong> di Panel Properti kanan. Misal:
              <br>• Server 1: <code>0.4m</code>, Server 2: <code>0.9m</code>
              <br>• Router 1: <code>1.4m</code>, Router 2: <code>1.9m</code>
              <br>• Access Point Plafon: <code>2.8m</code>
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
      this.modalEl.querySelector('#r3d-wall-color').value = '#2a7c13';
      this.modalEl.querySelector('#r3d-floor-color').value = '#1e293b';
      this.modalEl.querySelector('#r3d-opacity').value = '18';
    });

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

    this.modalEl.querySelector('#btn-room3d-save')?.addEventListener('click', () => this.saveRoomFromForm());
    this.modalEl.querySelector('#btn-room3d-reset-form')?.addEventListener('click', () => this.resetForm());

    eventBus.on('modal:open-room-3d', () => this.show());
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

    const roomData = {
      id: this.editingRoomId || generateId('room3d'),
      name,
      x: clamp(parseFloat(this.modalEl.querySelector('#r3d-x')?.value) || 0.5, 0, 1),
      y: clamp(parseFloat(this.modalEl.querySelector('#r3d-y')?.value) || 0.5, 0, 1),
      widthMeters: clamp(parseFloat(this.modalEl.querySelector('#r3d-width')?.value) || 20, 2, 200),
      depthMeters: clamp(parseFloat(this.modalEl.querySelector('#r3d-depth')?.value) || 16, 2, 200),
      heightMeters: clamp(parseFloat(this.modalEl.querySelector('#r3d-height')?.value) || 4.5, 1.5, 40),
      wallColor: this.modalEl.querySelector('#r3d-wall-color')?.value || '#2a7c13',
      floorColor: this.modalEl.querySelector('#r3d-floor-color')?.value || '#1e293b',
      opacity: clamp((parseFloat(this.modalEl.querySelector('#r3d-opacity')?.value) || 20) / 100, 0.05, 0.85),
      customModelUrl
    };

    const existing = [...stateManager.getRooms3d()];
    const idx = existing.findIndex((r) => r.id === roomData.id);
    if (idx >= 0) {
      existing[idx] = roomData;
    } else {
      existing.push(roomData);
    }

    stateManager.setRooms3d(existing);
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

    container.innerHTML = rooms.map((r) => `
      <div style="background: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="min-width: 0;">
          <div style="font-size: 12px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${r.name}
          </div>
          <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
            ${r.widthMeters}x${r.depthMeters}x${r.heightMeters}m • (${r.x.toFixed(2)}, ${r.y.toFixed(2)})${r.customModelUrl ? ' • GLB' : ''}
          </div>
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0;">
          <button type="button" class="btn btn-secondary btn-sm btn-r3d-edit" data-id="${r.id}" style="font-size: 10px; padding: 2px 6px;">Edit</button>
          <button type="button" class="btn btn-sm btn-r3d-del" data-id="${r.id}" style="font-size: 10px; padding: 2px 6px; background: rgba(239,68,68,0.14); color: #dc2626;">Hapus</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-r3d-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const room = rooms.find((r) => r.id === btn.getAttribute('data-id'));
        if (!room) return;
        this.editingRoomId = room.id;
        this.uploadedRoomGlbUrl = room.customModelUrl?.startsWith('data:') ? room.customModelUrl : '';
        this.modalEl.querySelector('#room3d-form-title').textContent = `Edit Ruangan: ${room.name}`;
        this.modalEl.querySelector('#r3d-name').value = room.name;
        this.modalEl.querySelector('#r3d-x').value = room.x;
        this.modalEl.querySelector('#r3d-y').value = room.y;
        this.modalEl.querySelector('#r3d-width').value = room.widthMeters;
        this.modalEl.querySelector('#r3d-depth').value = room.depthMeters;
        this.modalEl.querySelector('#r3d-height').value = room.heightMeters;
        this.modalEl.querySelector('#r3d-wall-color').value = room.wallColor || '#2a7c13';
        this.modalEl.querySelector('#r3d-floor-color').value = room.floorColor || '#1e293b';
        this.modalEl.querySelector('#r3d-opacity').value = Math.round((room.opacity ?? 0.2) * 100);
        this.modalEl.querySelector('#r3d-glb-url').value = this.uploadedRoomGlbUrl ? '[File GLB Lokal Terpilih]' : (room.customModelUrl || '');
        this.modalEl.querySelector('#btn-r3d-clear-glb').style.display = room.customModelUrl ? 'inline-flex' : 'none';
      });
    });

    container.querySelectorAll('.btn-r3d-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const next = rooms.filter((r) => r.id !== id);
        stateManager.setRooms3d(next);
        this.renderRoomList();
      });
    });
  }

  show() {
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

