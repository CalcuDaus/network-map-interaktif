/**
 * NetMap — 3D Device Model Manager Modal
 * Mengelola model 3D kustom (.glb / .gltf) untuk perangkat jaringan (Router, Server, Switch, AP, CCTV, dll),
 * elevasi Z, posisi pemasangan, skala, rotasi, serta opsi terapkan massal ke tipe perangkat yang sama.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { getDefaultSpatial3d, getDefaultDevicePorts, BUILTIN_GLB_MODELS } from '../devices/device-schema.js';
import { extractGlbCustomPorts } from '../map/map-3d-models.js';

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
    this.editingPorts = [];

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
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 11px; color: var(--text-muted);">Pilih Model 3D .GLB Bawaan (Presisi Port 100%):</label>
              <select id="dev3d-builtin-glb-select" style="background: var(--bg-secondary, #fbe6c2); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 9px; font-size: 11.5px; color: var(--text-primary);">
                <option value="">-- Pilih dari Library Model 3D (.GLB) --</option>
                ${BUILTIN_GLB_MODELS.map((m) => `<option value="${m.url}">${m.label}</option>`).join('')}
              </select>
            </div>
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

          <!-- Custom 3D Port & Interface Mapping (Packet Tracer Style) -->
          <div style="background: var(--bg-primary, #fff8cf); border: 1px solid var(--border-color); border-radius: 9px; padding: 12px; display: flex; flex-direction: column; gap: 9px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
              <div>
                <span style="font-size: 11.5px; font-weight: 700; color: var(--text-primary); display: block;">4. Port Kustom & Soket 3D (Cisco Packet Tracer Mode)</span>
                <span style="font-size: 10.5px; color: var(--text-muted);">Deteksi otomatis node <code style="font-size: 10px;">PORT_*</code> dari Blender .GLB atau atur koordinat soket (X, Y, Z)</span>
              </div>
              <button type="button" id="btn-dev3d-scan-glb-ports" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 10px;">
                🔍 Deteksi Port dari .GLB
              </button>
            </div>

            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <select id="dev3d-port-preset" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 11px; color: var(--text-primary);">
                <option value="">-- Terapkan Preset Port --</option>
                ${BUILTIN_GLB_MODELS.map((m) => `<option value="${m.id}">GLB: ${m.label}</option>`).join('')}
                <option value="router-5p">Prosedural: Router 5-Port (ether1..5)</option>
                <option value="router-ccr">Prosedural: Router Core 8G + 2 SFP+</option>
                <option value="switch-8p">Prosedural: Switch 8-Port + 2 SFP+</option>
                <option value="switch-24p">Prosedural: Switch 24-Port + 4 SFP+</option>
                <option value="ap-2p">Prosedural: Access Point (PoE + LAN + WLAN)</option>
                <option value="server-4p">Prosedural: Server (2x RJ45 + 2x SFP+)</option>
              </select>
              <button type="button" id="btn-dev3d-add-port" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 4px 9px;">
                + Tambah Port
              </button>
              <span id="dev3d-port-scan-status" style="font-size: 10.5px; color: var(--accent-blue, #2a7c13); font-weight: 600;"></span>
            </div>

            <div style="max-height: 175px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary);">
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                  <tr style="background: var(--bg-tertiary); color: var(--text-muted); text-align: left; font-size: 10px;">
                    <th style="padding: 5px 6px;">Nama Port</th>
                    <th style="padding: 5px 4px;">Tipe</th>
                    <th style="padding: 5px 4px;">Speed</th>
                    <th style="padding: 5px 4px;" title="Posisi Kiri/Kanan pada model (-0.5 s/d 0.5)">X</th>
                    <th style="padding: 5px 4px;" title="Tinggi dari alas model (0.05 s/d 0.5)">Y</th>
                    <th style="padding: 5px 4px;" title="Muka Depan/Belakang (+0.36 = depan)">Z</th>
                    <th style="padding: 5px 4px;"></th>
                  </tr>
                </thead>
                <tbody id="dev3d-ports-tbody"></tbody>
              </table>
            </div>
          </div>

          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.5;">
            Tip Blender: Buat objek <strong>Empty (Plain Axes)</strong> di posisi tiap lubang port pada model 3D, beri nama <code style="font-size: 10.5px;">PORT_ether1_rj45_1G</code> atau <code style="font-size: 10.5px;">PORT_sfp1_sfp+_10G</code>, lalu ekspor ke <strong>.glb</strong>.
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
        this.scanGlbPorts(ev.target.result, true);
      };
      reader.readAsDataURL(file);
    });

    urlInput?.addEventListener('input', (e) => {
      this.updateModelBadge(e.target.value.trim());
    });

    this.modalEl.querySelector('#dev3d-builtin-glb-select')?.addEventListener('change', (e) => {
      const selectedUrl = e.target.value;
      if (!selectedUrl) return;
      if (urlInput) urlInput.value = selectedUrl;
      const presetEntry = BUILTIN_GLB_MODELS.find((m) => m.url === selectedUrl);
      this.updateModelBadge(selectedUrl, presetEntry?.label || selectedUrl);
      if (presetEntry) {
        this.editingPorts = presetEntry.ports.map((p) => ({
          ...p,
          local3d: { ...p.local3d }
        }));
        this.renderPortsTable();
        const statusEl = this.modalEl.querySelector('#dev3d-port-scan-status');
        if (statusEl) {
          statusEl.textContent = `✓ ${presetEntry.ports.length} port presisi .GLB dimuat`;
        }
      }
    });

    this.modalEl.querySelector('#btn-dev3d-scan-glb-ports')?.addEventListener('click', () => {
      const currentUrl = urlInput?.value?.trim() || '';
      this.scanGlbPorts(currentUrl, false);
    });

    this.modalEl.querySelector('#dev3d-port-preset')?.addEventListener('change', (e) => {
      const preset = e.target.value;
      if (!preset) return;
      const dev = this.deviceManager.getDeviceById(this.activeDeviceId);
      this.editingPorts = getDefaultDevicePorts(dev?.type || 'router', preset).map((p) => ({
        ...p,
        local3d: { ...p.local3d }
      }));
      this.renderPortsTable();
      e.target.value = '';
    });

    this.modalEl.querySelector('#btn-dev3d-add-port')?.addEventListener('click', () => {
      const idx = this.editingPorts.length + 1;
      const x = Number((-0.36 + ((idx - 1) % 8) * 0.1).toFixed(3));
      this.editingPorts.push({
        name: `ether${idx}`,
        type: 'rj45',
        speed: '1G',
        local3d: { x, y: 0.12, z: 0.36 }
      });
      this.renderPortsTable();
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

    const rawPorts = Array.isArray(dev.ports) && dev.ports.length > 0
      ? dev.ports
      : getDefaultDevicePorts(dev.type);
    this.editingPorts = rawPorts.map((p) => ({
      name: p.name,
      type: p.type || 'rj45',
      speed: p.speed || '1G',
      local3d: {
        x: typeof p.local3d?.x === 'number' ? p.local3d.x : 0,
        y: typeof p.local3d?.y === 'number' ? p.local3d.y : 0.12,
        z: typeof p.local3d?.z === 'number' ? p.local3d.z : 0.36
      }
    }));
    const statusEl = this.modalEl.querySelector('#dev3d-port-scan-status');
    if (statusEl) statusEl.textContent = `${this.editingPorts.length} port aktif`;
    this.renderPortsTable();

    this.updateModelBadge(spatial.customModelUrl || '');
  }

  renderPortsTable() {
    const tbody = this.modalEl.querySelector('#dev3d-ports-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.editingPorts.map((p, idx) => `
      <tr style="border-top: 1px solid var(--border-color);">
        <td style="padding: 4px 5px;">
          <input type="text" data-p-idx="${idx}" data-p-field="name" value="${p.name}"
                 style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 5px; font-size: 11px; font-family: var(--font-mono); color: var(--text-primary); font-weight: 600;">
        </td>
        <td style="padding: 4px 3px;">
          <select data-p-idx="${idx}" data-p-field="type"
                  style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 4px; font-size: 10.5px; color: var(--text-primary);">
            <option value="rj45" ${p.type === 'rj45' ? 'selected' : ''}>RJ45</option>
            <option value="sfp+" ${p.type === 'sfp+' ? 'selected' : ''}>SFP+</option>
            <option value="fiber" ${p.type === 'fiber' ? 'selected' : ''}>Fiber</option>
            <option value="wireless" ${p.type === 'wireless' ? 'selected' : ''}>WLAN</option>
            <option value="coax" ${p.type === 'coax' ? 'selected' : ''}>Coax</option>
          </select>
        </td>
        <td style="padding: 4px 3px;">
          <select data-p-idx="${idx}" data-p-field="speed"
                  style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 4px; font-size: 10.5px; color: var(--text-primary);">
            <option value="100M" ${p.speed === '100M' ? 'selected' : ''}>100M</option>
            <option value="1G" ${p.speed === '1G' ? 'selected' : ''}>1G</option>
            <option value="2.5G" ${p.speed === '2.5G' ? 'selected' : ''}>2.5G</option>
            <option value="10G" ${p.speed === '10G' ? 'selected' : ''}>10G</option>
            <option value="25G" ${p.speed === '25G' ? 'selected' : ''}>25G</option>
            <option value="40G" ${p.speed === '40G' ? 'selected' : ''}>40G</option>
          </select>
        </td>
        <td style="padding: 4px 3px;">
          <input type="number" step="0.02" data-p-idx="${idx}" data-p-coord="x" value="${p.local3d?.x ?? 0}"
                 style="width: 52px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 4px; font-size: 10.5px; font-family: var(--font-mono); color: var(--text-primary);">
        </td>
        <td style="padding: 4px 3px;">
          <input type="number" step="0.02" data-p-idx="${idx}" data-p-coord="y" value="${p.local3d?.y ?? 0.12}"
                 style="width: 52px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 4px; font-size: 10.5px; font-family: var(--font-mono); color: var(--text-primary);">
        </td>
        <td style="padding: 4px 3px;">
          <input type="number" step="0.02" data-p-idx="${idx}" data-p-coord="z" value="${p.local3d?.z ?? 0.36}"
                 style="width: 52px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 4px; font-size: 10.5px; font-family: var(--font-mono); color: var(--text-primary);">
        </td>
        <td style="padding: 4px 5px; text-align: right;">
          <button type="button" data-p-del="${idx}" title="Hapus Port"
                  style="border: none; background: transparent; color: var(--status-offline, #ef4444); cursor: pointer; font-weight: 700; font-size: 12px;">✕</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-p-field]').forEach((el) => {
      el.addEventListener('change', (e) => {
        const idx = Number(el.getAttribute('data-p-idx'));
        const field = el.getAttribute('data-p-field');
        if (this.editingPorts[idx] && field) {
          this.editingPorts[idx][field] = e.target.value.trim();
        }
      });
    });

    tbody.querySelectorAll('[data-p-coord]').forEach((el) => {
      el.addEventListener('change', (e) => {
        const idx = Number(el.getAttribute('data-p-idx'));
        const coord = el.getAttribute('data-p-coord');
        if (this.editingPorts[idx] && coord) {
          this.editingPorts[idx].local3d[coord] = parseFloat(e.target.value) || 0;
        }
      });
    });

    tbody.querySelectorAll('[data-p-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-p-del'));
        this.editingPorts.splice(idx, 1);
        this.renderPortsTable();
      });
    });
  }

  async scanGlbPorts(url, silentIfEmpty = false) {
    const statusEl = this.modalEl.querySelector('#dev3d-port-scan-status');
    if (!url) {
      if (!silentIfEmpty) alert('Masukkan URL atau unggah file .GLB terlebih dahulu untuk memindai port 3D.');
      return;
    }
    try {
      if (statusEl) statusEl.textContent = 'Memindai node .GLB...';
      const { ports, bounds } = await extractGlbCustomPorts(url, 1.3);
      if (ports.length > 0) {
        this.editingPorts = ports;
        this.renderPortsTable();
        if (statusEl) statusEl.textContent = `✅ ${ports.length} node PORT_* ditemukan di .GLB!`;
      } else {
        // Align current ports automatically to the GLB's front bounding face
        const spanX = Math.max(0.24, bounds.width * 0.78);
        const n = this.editingPorts.length;
        this.editingPorts = this.editingPorts.map((p, i) => ({
          ...p,
          local3d: {
            x: n <= 1 ? 0 : Number(((-spanX / 2) + (i * (spanX / (n - 1)))).toFixed(3)),
            y: bounds.midY,
            z: bounds.frontZ
          }
        }));
        this.renderPortsTable();
        if (statusEl) {
          statusEl.textContent = `⚡ ${n} port disejajarkan ke panel depan .GLB (Z=${bounds.frontZ})`;
        }
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '⚠️ Gagal membaca .GLB';
      console.warn('[Device3DModelModal] GLB port scan error:', err);
    }
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

    const cleanPorts = this.editingPorts
      .filter((p) => p && String(p.name || '').trim())
      .map((p) => ({
        name: String(p.name).trim(),
        type: p.type || 'rj45',
        speed: p.speed || '1G',
        local3d: {
          x: Number(p.local3d?.x) || 0,
          y: Number(p.local3d?.y) || 0.12,
          z: Number(p.local3d?.z) || 0.36
        }
      }));

    this.deviceManager.updateDevice(dev.id, {
      spatial3d: baseSpatial,
      ports: cleanPorts
    });

    if (applySameType) {
      this.deviceManager.getAllDevices().forEach((other) => {
        if (other.id !== dev.id && other.type === dev.type) {
          const otherSpatial = {
            ...getDefaultSpatial3d(other.type),
            ...(other.spatial3d || {}),
            customModelUrl,
            modelScale
          };
          this.deviceManager.updateDevice(other.id, {
            spatial3d: otherSpatial,
            ports: cleanPorts.map((p) => ({ ...p, local3d: { ...p.local3d } }))
          });
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

