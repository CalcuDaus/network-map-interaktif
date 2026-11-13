/**
 * NetMap — 3D Device Model Manager Modal
 * Mengelola model 3D kustom (.glb / .gltf) untuk perangkat jaringan (Router, Server, Switch, AP, CCTV, dll),
 * elevasi Z, posisi pemasangan, skala, rotasi, serta opsi terapkan massal ke tipe perangkat yang sama.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { getDefaultSpatial3d } from '../devices/device-schema.js';

export class Device3DModelModal {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   */
  constructor({ deviceManager, map3DEngine = null }) {
    this.deviceManager = deviceManager;
    this.map3DEngine = map3DEngine;
    this.modalEl = null;
    this.activeDeviceId = null;

    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'device-3d-modal';
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
      <div style="background-color: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color, #e5cca0); border-radius: 12px; width: 100%; max-width: 640px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;">
        <!-- Header -->
        <div style="height: 54px; border-bottom: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 30px; height: 30px; border-radius: 7px; background: rgba(59, 130, 246, 0.16); display: flex; align-items: center; justify-content: center; color: var(--accent-blue, #2a7c13);">
              <i data-lucide="cpu" style="width: 17px; height: 17px;"></i>
            </div>
            <div>
              <span style="font-size: 15px; font-weight: 700; color: var(--text-primary, #18350d); display: block; line-height: 1.2;">Model 3D Perangkat (.GLB / .GLTF)</span>
              <span style="font-size: 11px; color: var(--text-muted, #678458);">Pasang model 3D nyata untuk Router, Server, Switch, AP, CCTV, atau perangkat lain</span>
            </div>
          </div>
          <button id="btn-dev3d-close" class="btn btn-icon btn-sm" title="Tutup">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
          <!-- Target Device Picker -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11.5px; font-weight: 700; color: var(--text-primary);">1. Pilih Perangkat Target</label>
            <select id="dev3d-select-device" style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 7px; padding: 8px 10px; font-size: 12.5px; color: var(--text-primary); font-family: inherit;">
            </select>
          </div>

          <!-- 3D Model File / URL -->
          <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 9px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11.5px; font-weight: 700; color: var(--text-primary);">2. Sumber Model 3D (.glb / .gltf)</span>
              <span id="dev3d-model-badge" style="font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: rgba(100,116,139,0.14); color: var(--text-muted);">
                Model Bawaan 3D
              </span>
            </div>

            <input type="file" id="dev3d-file-input" accept=".glb,.gltf" style="display: none;">
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button type="button" id="btn-dev3d-upload" class="btn btn-primary btn-sm" style="font-size: 12px; padding: 6px 12px;">
                <i data-lucide="upload" style="width: 14px; height: 14px;"></i>
                <span>Unggah File .GLB / .GLTF...</span>
              </button>
              <button type="button" id="btn-dev3d-reset-model" class="btn btn-secondary btn-sm" style="font-size: 12px; padding: 6px 12px;">
                Pakai Bentuk 3D Bawaan
              </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 3px;">
              <label style="font-size: 11px; color: var(--text-muted);">Atau masukkan URL / path model 3D (contoh: <code style="font-size: 10.5px;">assets/models/mikrotik.glb</code>)</label>
              <input type="text" id="dev3d-model-url" placeholder="https://... atau assets/models/device.glb (kosong = model prosedural bawaan)"
                     style="background: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 9px; font-size: 11.5px; color: var(--text-primary); font-family: var(--font-mono);">
            </div>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--text-primary); cursor: pointer; padding-top: 2px;">
              <input type="checkbox" id="dev3d-apply-same-type" style="accent-color: var(--accent-blue); width: 15px; height: 15px;">
              <span>Terapkan model 3D (.glb/.gltf) ini ke <strong>semua perangkat bertipe sama</strong> (<span id="dev3d-same-type-count">0</span> perangkat)</span>
            </label>
          </div>

          <!-- Spatial 3D Transform -->
          <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 9px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
            <span style="font-size: 11.5px; font-weight: 700; color: var(--text-primary);">3. Posisi & Ukuran di Ruang 3D</span>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; color: var(--text-muted);">Elevasi Z (m)</label>
                <input type="number" id="dev3d-elevation" min="0" max="50" step="0.1" value="0.5"
                       style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 7px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; color: var(--text-muted);">Posisi Pasang</label>
                <select id="dev3d-mount" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 6px; font-size: 11.5px; color: var(--text-primary);">
                  <option value="rack">Rack Cabinet</option>
                  <option value="floor">Lantai / Meja</option>
                  <option value="wall">Dinding</option>
                  <option value="ceiling">Plafon</option>
                  <option value="pole">Tiang / Tower</option>
                </select>
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; color: var(--text-muted);">Skala Model</label>
                <input type="number" id="dev3d-scale" min="0.2" max="10" step="0.1" value="1"
                       style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 7px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono);">
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 10.5px; color: var(--text-muted);">Rotasi Y (°)</label>
                <input type="number" id="dev3d-rotation" min="0" max="360" step="15" value="0"
                       style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 7px; font-size: 12px; color: var(--text-primary); font-family: var(--font-mono);">
              </div>
            </div>
          </div>

          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5;">
            Tip: Anda bisa memakai file <strong>.glb / .gltf</strong> (ukuran ideal &lt; 5 MB) dari Sketchfab, Poly Pizza, Blender, atau ekspor SketchUp ke GLB. Model otomatis diskalakan proporsional ke ukuran perangkat.
          </div>
        </div>

        <!-- Footer -->
        <div style="height: 54px; border-top: 1px solid var(--border-color, #e5cca0); background: var(--bg-tertiary, #f2dac8); display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 0 20px; flex-shrink: 0;">
          <button type="button" id="btn-dev3d-cancel" class="btn btn-secondary btn-sm">Tutup</button>
          <button type="button" id="btn-dev3d-save-focus" class="btn btn-primary btn-sm">
            <i data-lucide="check" style="width: 14px; height: 14px;"></i>
            <span>Terapkan & Lihat di 3D</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    this.modalEl.querySelector('#btn-dev3d-close')?.addEventListener('click', () => this.hide());
    this.modalEl.querySelector('#btn-dev3d-cancel')?.addEventListener('click', () => this.hide());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.hide();
    });

    const selectDev = this.modalEl.querySelector('#dev3d-select-device');
    selectDev?.addEventListener('change', (e) => {
      this.loadDeviceIntoForm(e.target.value);
    });

    const fileInput = this.modalEl.querySelector('#dev3d-file-input');
    const urlInput = this.modalEl.querySelector('#dev3d-model-url');

    this.modalEl.querySelector('#btn-dev3d-upload')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 12 * 1024 * 1024) {
        alert('Ukuran file model 3D terlalu besar (> 12 MB). Gunakan file .glb yang lebih ringkas (< 5 MB) agar lancar di browser.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (urlInput) urlInput.value = ev.target.result;
        this.updateModelBadge(ev.target.result, file.name);
      };
      reader.readAsDataURL(file);
    });

    urlInput?.addEventListener('input', (e) => {
      this.updateModelBadge(e.target.value.trim());
    });

    this.modalEl.querySelector('#btn-dev3d-reset-model')?.addEventListener('click', () => {
      if (urlInput) urlInput.value = '';
      if (fileInput) fileInput.value = '';
      this.updateModelBadge('');
    });

    this.modalEl.querySelector('#btn-dev3d-save-focus')?.addEventListener('click', () => {
      this.applyChanges(true);
    });

    eventBus.on('modal:open-device-3d', ({ deviceId } = {}) => {
      this.show(deviceId);
    });
  }

  updateModelBadge(url, fileName = '') {
    const badge = this.modalEl.querySelector('#dev3d-model-badge');
    if (!badge) return;
    if (url) {
      badge.textContent = fileName ? `Custom: ${fileName}` : 'Model Kustom (.GLB/.GLTF)';
      badge.style.background = 'rgba(42, 124, 19, 0.16)';
      badge.style.color = 'var(--accent-blue, #2a7c13)';
    } else {
      badge.textContent = 'Model Bawaan 3D';
      badge.style.background = 'rgba(100,116,139,0.14)';
      badge.style.color = 'var(--text-muted)';
    }
  }

  loadDeviceIntoForm(deviceId) {
    const dev = this.deviceManager.getDeviceById(deviceId);
    if (!dev) return;
    this.activeDeviceId = dev.id;

    const spatial = { ...getDefaultSpatial3d(dev.type), ...(dev.spatial3d || {}) };
    this.modalEl.querySelector('#dev3d-model-url').value = spatial.customModelUrl || '';
    this.modalEl.querySelector('#dev3d-elevation').value = Number(spatial.elevationMeters ?? 0).toFixed(1);
    this.modalEl.querySelector('#dev3d-mount').value = spatial.mountType || 'floor';
    this.modalEl.querySelector('#dev3d-scale').value = Number(spatial.modelScale || 1);
    this.modalEl.querySelector('#dev3d-rotation').value = Number(spatial.rotationY || 0);
    this.modalEl.querySelector('#dev3d-apply-same-type').checked = false;

    const sameTypeCount = this.deviceManager.getAllDevices().filter((d) => d.type === dev.type).length;
    const countSpan = this.modalEl.querySelector('#dev3d-same-type-count');
    if (countSpan) countSpan.textContent = String(sameTypeCount);

    this.updateModelBadge(spatial.customModelUrl || '');
  }

  show(preferredDeviceId = null) {
    const devices = this.deviceManager.getAllDevices();
    if (devices.length === 0) {
      alert('Belum ada perangkat di peta. Tambahkan perangkat terlebih dahulu sebelum mengatur model 3D-nya.');
      return;
    }

    const selectDev = this.modalEl.querySelector('#dev3d-select-device');
    selectDev.innerHTML = devices.map((d) => {
      const hasGlb = d.spatial3d?.customModelUrl ? ' [Custom GLB]' : '';
      return `<option value="${d.id}">${d.name} (${d.type})${hasGlb}</option>`;
    }).join('');

    const targetId = preferredDeviceId || this.deviceManager.selectedDeviceId || devices[0].id;
    selectDev.value = targetId;
    this.loadDeviceIntoForm(selectDev.value);

    this.modalEl.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  }

  hide() {
    this.modalEl.style.display = 'none';
  }

  applyChanges(focusIn3d = true) {
    const dev = this.deviceManager.getDeviceById(this.activeDeviceId);
    if (!dev) return;

    const customModelUrl = this.modalEl.querySelector('#dev3d-model-url').value.trim();
    const elevationMeters = parseFloat(this.modalEl.querySelector('#dev3d-elevation').value) || 0;
    const mountType = this.modalEl.querySelector('#dev3d-mount').value || 'floor';
    const modelScale = parseFloat(this.modalEl.querySelector('#dev3d-scale').value) || 1;
    const rotationY = parseFloat(this.modalEl.querySelector('#dev3d-rotation').value) || 0;
    const applySameType = Boolean(this.modalEl.querySelector('#dev3d-apply-same-type').checked);

    const baseSpatial = {
      ...getDefaultSpatial3d(dev.type),
      ...(dev.spatial3d || {}),
      elevationMeters,
      mountType,
      modelScale,
      rotationY,
      customModelUrl
    };

    this.deviceManager.updateDevice(dev.id, { spatial3d: baseSpatial });

    if (applySameType) {
      this.deviceManager.getAllDevices().forEach((other) => {
        if (other.id !== dev.id && other.type === dev.type) {
          const otherSpatial = {
            ...getDefaultSpatial3d(other.type),
            ...(other.spatial3d || {}),
            customModelUrl,
            modelScale
          };
          this.deviceManager.updateDevice(other.id, { spatial3d: otherSpatial });
        }
      });
    }

    this.deviceManager.selectDevice(dev.id);
    this.hide();

    if (focusIn3d) {
      if (stateManager.getViewMode() !== '3d') {
        stateManager.setViewMode('3d');
      }
      setTimeout(() => {
        this.map3DEngine?.focusOnDevice(dev.id);
      }, 80);
    }
  }
}

