/**
 * NetMap — Packet Tracer 3D Simulation & Dual CLI Modal
 * Menyediakan simulasi Ping/Traceroute (Realtime + 3D packet flow + OSI PDU)
 * serta Terminal CLI Cisco IOS dan MikroTik RouterOS.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { escapeHtml } from '../utils/helpers.js';

export class PacketTracerPanel {
  /**
   * @param {Object} options
   * @param {import('../simulation/network-simulator.js').NetworkSimulator} options.simulator
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   */
  constructor({ simulator, deviceManager, map3DEngine = null } = {}) {
    this.simulator = simulator;
    this.deviceManager = deviceManager;
    this.map3DEngine = map3DEngine;
    this.modalEl = null;
    this.activeTab = 'sim'; // 'sim' | 'cli'
    this.cliHistory = [];

    if (typeof document !== 'undefined' && document.body) {
      this.createModalDOM();
      this.bindEvents();
    }
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'packet-tracer-modal';
    this.modalEl.className = 'modal-overlay packet-tracer-modal';
    this.modalEl.style.display = 'none';
    this.modalEl.innerHTML = `
      <div class="modal-card packet-tracer-card">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <span>⚡</span>
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Simulasi Jaringan &amp; Terminal CLI (Packet Tracer)</div>
              <div style="font-size:11px;color:var(--text-muted);">Uji Ping/Traceroute, inspeksi OSI Layer 1–3, &amp; konfigurasi Cisco IOS / MikroTik RouterOS</div>
            </div>
          </div>
          <button type="button" id="btn-pt-close" class="btn btn-icon btn-sm" title="Tutup">✕</button>
        </div>

        <div class="pt-tab-bar" role="tablist">
          <button type="button" class="pt-tab-btn active" data-pt-tab="sim">⚡ Simulasi Paket &amp; PDU (OSI L1–L3)</button>
          <button type="button" class="pt-tab-btn" data-pt-tab="cli">💻 Terminal CLI (Cisco IOS &amp; MikroTik)</button>
        </div>

        <div id="pt-panel-sim" class="pt-tab-panel">
          <div class="pt-sim-grid">
            <label class="pt-field">
              <span>Perangkat Sumber</span>
              <select id="pt-sim-source" class="pt-select"></select>
            </label>
            <label class="pt-field">
              <span>Tujuan (Perangkat atau IP)</span>
              <select id="pt-sim-target" class="pt-select"></select>
            </label>
          </div>
          <div class="pt-sim-actions">
            <button type="button" id="btn-pt-run-ping" class="btn btn-primary btn-sm">▶ Kirim Paket Ping (Animasi 3D)</button>
            <button type="button" id="btn-pt-run-trace" class="btn btn-secondary btn-sm">🧭 Traceroute</button>
          </div>
          <div id="pt-sim-result" class="pt-sim-result">
            Pilih perangkat sumber &amp; tujuan lalu klik <strong>Kirim Paket Ping</strong> untuk melihat rute fisik &amp; PDU OSI Layer 1–3.
          </div>
        </div>

        <div id="pt-panel-cli" class="pt-tab-panel hidden" style="display:none;">
          <div class="pt-sim-grid">
            <label class="pt-field">
              <span>Target Perangkat</span>
              <select id="pt-cli-device" class="pt-select"></select>
            </label>
            <label class="pt-field">
              <span>Sintaks CLI</span>
              <select id="pt-cli-flavor" class="pt-select">
                <option value="auto" selected>Auto (Cisco IOS / MikroTik)</option>
                <option value="cisco">Cisco IOS</option>
                <option value="mikrotik">MikroTik RouterOS</option>
              </select>
            </label>
          </div>
          <div class="pt-cli-presets">
            <button type="button" class="pt-chip" data-cli-cmd="show ip interface brief">show ip int brief</button>
            <button type="button" class="pt-chip" data-cli-cmd="show vlan brief">show vlan brief</button>
            <button type="button" class="pt-chip" data-cli-cmd="/ip address print">/ip address print</button>
            <button type="button" class="pt-chip" data-cli-cmd="/interface print">/interface print</button>
            <button type="button" class="pt-chip" data-cli-cmd="help">help (?)</button>
          </div>
          <pre id="pt-cli-output" class="pt-cli-output">SmartSchool NetMap Dual-CLI Terminal siap.\nKetik "help" atau klik pintasan perintah di atas.</pre>
          <form id="pt-cli-form" class="pt-cli-form">
            <input type="text" id="pt-cli-input" class="pt-cli-input" placeholder="Ketik perintah (mis. ip address 192.168.10.1 255.255.255.0 atau /ip address print)..." autocomplete="off">
            <button type="submit" class="btn btn-primary btn-sm">Jalankan</button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(this.modalEl);
  }

  bindEvents() {
    if (!this.modalEl) return;

    this.modalEl.querySelector('#btn-pt-close')?.addEventListener('click', () => this.hide());
    this.modalEl.addEventListener('click', (ev) => {
      if (ev.target === this.modalEl) this.hide();
    });

    this.modalEl.querySelectorAll('[data-pt-tab]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setActiveTab(btn.getAttribute('data-pt-tab') || 'sim');
      });
    });

    this.modalEl.querySelector('#btn-pt-run-ping')?.addEventListener('click', () => {
      this.runPingFromUI();
    });

    this.modalEl.querySelector('#btn-pt-run-trace')?.addEventListener('click', () => {
      this.runTracerouteFromUI();
    });

    this.modalEl.querySelectorAll('[data-cli-cmd]')?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cli-cmd') || '';
        const inp = this.modalEl.querySelector('#pt-cli-input');
        if (inp) inp.value = cmd;
        this.runCliFromUI(cmd);
      });
    });

    this.modalEl.querySelector('#pt-cli-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const inp = this.modalEl.querySelector('#pt-cli-input');
      const cmd = inp?.value || '';
      this.runCliFromUI(cmd);
      if (inp) inp.value = '';
    });

    eventBus.on('device:added', () => this.refreshDeviceSelects());
    eventBus.on('device:updated', () => this.refreshDeviceSelects());
    eventBus.on('device:deleted', () => this.refreshDeviceSelects());
  }

  setActiveTab(tab) {
    this.activeTab = tab === 'cli' ? 'cli' : 'sim';
    this.modalEl?.querySelectorAll('[data-pt-tab]')?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-pt-tab') === this.activeTab);
    });
    const simPanel = this.modalEl?.querySelector('#pt-panel-sim');
    const cliPanel = this.modalEl?.querySelector('#pt-panel-cli');
    if (simPanel) {
      simPanel.classList.toggle('hidden', this.activeTab !== 'sim');
      simPanel.style.display = this.activeTab === 'sim' ? 'flex' : 'none';
    }
    if (cliPanel) {
      cliPanel.classList.toggle('hidden', this.activeTab !== 'cli');
      cliPanel.style.display = this.activeTab === 'cli' ? 'flex' : 'none';
    }
  }

  refreshDeviceSelects() {
    if (!this.modalEl) return;
    const devices = this.deviceManager?.getAllDevices?.() || [];
    const selectedId = this.deviceManager?.selectedDeviceId || '';
    const opts = devices
      .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.network?.ip || 'no IP')})</option>`)
      .join('');

    const srcSel = this.modalEl.querySelector('#pt-sim-source');
    const dstSel = this.modalEl.querySelector('#pt-sim-target');
    const cliSel = this.modalEl.querySelector('#pt-cli-device');

    if (srcSel) {
      const prev = srcSel.value;
      srcSel.innerHTML = opts || '<option value="">(belum ada perangkat)</option>';
      if (prev && devices.some((d) => d.id === prev)) srcSel.value = prev;
      else if (selectedId && devices.some((d) => d.id === selectedId)) srcSel.value = selectedId;
    }

    if (dstSel) {
      const prev = dstSel.value;
      dstSel.innerHTML = opts || '<option value="">(belum ada perangkat)</option>';
      if (prev && devices.some((d) => d.id === prev)) dstSel.value = prev;
      else if (devices.length > 1) {
        const alt = devices.find((d) => d.id !== srcSel?.value) || devices[devices.length - 1];
        dstSel.value = alt.id;
      }
    }

    if (cliSel) {
      const prev = cliSel.value;
      cliSel.innerHTML = opts || '<option value="">(belum ada perangkat)</option>';
      if (prev && devices.some((d) => d.id === prev)) cliSel.value = prev;
      else if (selectedId && devices.some((d) => d.id === selectedId)) cliSel.value = selectedId;
    }
  }

  show(tab = 'sim') {
    if (!this.modalEl) return;
    this.refreshDeviceSelects();
    this.setActiveTab(tab);
    this.modalEl.style.display = 'flex';
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  runPingFromUI() {
    const srcId = this.modalEl?.querySelector('#pt-sim-source')?.value || '';
    const dstId = this.modalEl?.querySelector('#pt-sim-target')?.value || '';
    const res = this.simulator?.simulatePing(srcId, dstId);
    if (!res) return;
    if (stateManager.getViewMode() === '3d' && res.hops?.length > 0) {
      this.map3DEngine?.animatePacketPath3D?.(res.hops, { success: res.success });
    }
    this.renderSimulationResult(res);
    return res;
  }

  runTracerouteFromUI() {
    const srcId = this.modalEl?.querySelector('#pt-sim-source')?.value || '';
    const dstId = this.modalEl?.querySelector('#pt-sim-target')?.value || '';
    const res = this.simulator?.simulateTraceroute(srcId, dstId);
    if (!res) return;
    if (stateManager.getViewMode() === '3d' && res.hops?.length > 0) {
      this.map3DEngine?.animatePacketPath3D?.(res.hops, { success: res.success });
    }
    this.renderSimulationResult(res, { showTrace: true });
    return res;
  }

  renderSimulationResult(res, { showTrace = false } = {}) {
    const box = this.modalEl?.querySelector('#pt-sim-result');
    if (!box) return;
    const hopNames = (res.hops || []).map((id) => {
      const d = this.deviceManager?.getDeviceById?.(id);
      return `<span class="pt-hop-pill">${escapeHtml(d?.name || id)}</span>`;
    }).join(' ➔ ');

    const traceHtml = showTrace && res.traceHops?.length
      ? `<div class="pt-pdu-row"><strong>Hops Traceroute:</strong><br>${res.traceHops.map((h) => `#${h.hopIndex} ${escapeHtml(h.deviceName)} (${escapeHtml(h.ip)}) — ${h.rttMs} ms`).join('<br>')}</div>`
      : '';

    box.innerHTML = `
      <div class="pt-status-banner ${res.success ? 'is-ok' : 'is-fail'}">
        <span>${res.success ? '✅ PING BERHASIL' : '❌ PING GAGAL'}</span>
        <span>${escapeHtml(res.summary || res.reason || '')}</span>
      </div>
      ${hopNames ? `<div class="pt-hops-row">${hopNames}</div>` : ''}
      <div class="pt-osi-stack">
        <div class="pt-pdu-row"><strong>Layer 1 (Fisik):</strong> ${escapeHtml(res.osiLayers?.l1 || '-')}</div>
        <div class="pt-pdu-row"><strong>Layer 2 (Data Link / VLAN):</strong> ${escapeHtml(res.osiLayers?.l2 || '-')}</div>
        <div class="pt-pdu-row"><strong>Layer 3 (Network / ICMP):</strong> ${escapeHtml(res.osiLayers?.l3 || '-')}</div>
        ${traceHtml}
      </div>
    `;
  }

  runCliFromUI(rawCmd) {
    const devId = this.modalEl?.querySelector('#pt-cli-device')?.value || '';
    const flavor = this.modalEl?.querySelector('#pt-cli-flavor')?.value || 'auto';
    const cmd = String(rawCmd || '').trim();
    if (!cmd) return null;

    const result = this.simulator?.executeCliCommand(devId, cmd, flavor);
    const outBox = this.modalEl?.querySelector('#pt-cli-output');
    if (result && outBox) {
      this.cliHistory.push(`> ${cmd}\n${result.output}`);
      if (this.cliHistory.length > 40) this.cliHistory.shift();
      outBox.textContent = this.cliHistory.join('\n\n');
      outBox.scrollTop = outBox.scrollHeight;
    }
    if (result?.updated) {
      this.refreshDeviceSelects();
    }
    return result;
  }
}
