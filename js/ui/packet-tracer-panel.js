/**
 * NetMap — Packet Tracer 3D Simulation, WinBox Quick-Config & Mobile Dual-CLI Modal
 * Menyediakan:
 *  1) Quick Config (WinBox / WebFig) + Live CLI Mirror
 *  2) Terminal CLI Cisco IOS & MikroTik RouterOS + Mobile Smart Token Bar
 *  3) Simulasi Ping/Traceroute (Realtime + Animasi 3D + OSI PDU + Mobile Peek Banner)
 * Dilengkapi VisualViewport Keyboard Guard & auto-pause render 3D saat modal penuh terbuka.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { escapeHtml, isMobileTouchDevice, uiIcon } from '../utils/helpers.js';
import { WinBoxQuickConfig } from './winbox-quick-config.js';
import { CliTouchBar } from './cli-touch-bar.js';

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
    this.peekBannerEl = null;
    this.activeTab = 'sim'; // 'winbox' | 'cli' | 'sim'
    this.cliHistory = [];
    this.isOpen = false;
    this.isPeeking = false;
    this.lastSimResult = null;
    this.winboxConfig = null;
    this.cliTouchBar = null;
    this._boundViewportSync = null;

    if (typeof document !== 'undefined' && document.body) {
      this.createModalDOM();
      this.createPeekBannerDOM();
      this.initSubModules();
      this.bindEvents();
      this.bindVisualViewportGuard();
    }
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'packet-tracer-modal';
    this.modalEl.className = 'modal-overlay packet-tracer-modal';
    this.modalEl.style.display = 'none';
    this.modalEl.innerHTML = `
      <div class="modal-card packet-tracer-card">
        <div class="modal-header pt-modal-header">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            ${uiIcon('zap', 18)}
            <div style="min-width:0;">
              <div class="pt-modal-title">Simulasi Jaringan, WinBox &amp; CLI</div>
              <div class="pt-modal-subtitle">Konfigurasi IP/VLAN/DHCP/NAT ramah HP, Dual-CLI &amp; Animasi PDU 3D</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <button type="button" id="btn-pt-peek-toggle" class="btn btn-secondary btn-sm pt-peek-header-btn" title="Kecilkan modal untuk melihat peta 3D">
              ${uiIcon('eye', 13)} <span>Lihat 3D</span>
            </button>
            <button type="button" id="btn-pt-close" class="btn btn-icon btn-sm" title="Tutup">${uiIcon('x', 14)}</button>
          </div>
        </div>

        <div class="pt-tab-bar" role="tablist">
          <button type="button" class="pt-tab-btn" data-pt-tab="winbox">${uiIcon('sliders', 13)} <span>Quick Config (WinBox)</span></button>
          <button type="button" class="pt-tab-btn" data-pt-tab="cli">${uiIcon('terminal', 13)} <span>Terminal CLI</span></button>
          <button type="button" class="pt-tab-btn active" data-pt-tab="sim">${uiIcon('zap', 13)} <span>Ping &amp; PDU 3D</span></button>
        </div>

        <div id="pt-panel-winbox" class="pt-tab-panel hidden" style="display:none;">
          <div id="pt-winbox-container"></div>
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
                <option value="mikrotik">MikroTik RouterOS</option>
                <option value="cisco">Cisco IOS</option>
              </select>
            </label>
          </div>
          <div class="pt-cli-presets">
            <button type="button" class="pt-chip" data-cli-cmd="show ip interface brief">show ip int brief</button>
            <button type="button" class="pt-chip" data-cli-cmd="show vlan brief">show vlan brief</button>
            <button type="button" class="pt-chip" data-cli-cmd="/ip address print">/ip address print</button>
            <button type="button" class="pt-chip" data-cli-cmd="/ip route print">/ip route print</button>
            <button type="button" class="pt-chip" data-cli-cmd="/interface print">/interface print</button>
          </div>
          <pre id="pt-cli-output" class="pt-cli-output">SmartSchool NetMap Dual-CLI Terminal siap.\nKetik "help" atau ketuk tombol token di bawah untuk menyusun perintah.</pre>
          <div id="pt-cli-touch-bar-host"></div>
          <form id="pt-cli-form" class="pt-cli-form">
            <input type="text" id="pt-cli-input" class="pt-cli-input"
              placeholder="Ketik perintah atau tap token (mis. /ip address add ...)"
              autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="send">
            <button type="submit" class="btn btn-primary btn-sm pt-cli-run-btn">Jalankan</button>
          </form>
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
            <button type="button" id="btn-pt-run-ping" class="btn btn-primary btn-sm">${uiIcon('play', 12)} Kirim Paket Ping (Animasi 3D)</button>
            <button type="button" id="btn-pt-run-trace" class="btn btn-secondary btn-sm">${uiIcon('compass', 12)} Traceroute</button>
          </div>
          <div id="pt-sim-result" class="pt-sim-result">
            Pilih perangkat sumber &amp; tujuan lalu klik <strong>Kirim Paket Ping</strong> untuk melihat rute fisik &amp; PDU OSI Layer 1–3.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.modalEl);
  }

  createPeekBannerDOM() {
    this.peekBannerEl = document.createElement('div');
    this.peekBannerEl.id = 'pt-peek-banner';
    this.peekBannerEl.className = 'pt-peek-banner hidden';
    this.peekBannerEl.style.display = 'none';
    document.body.appendChild(this.peekBannerEl);
  }

  initSubModules() {
    const wbHost = this.modalEl?.querySelector('#pt-winbox-container');
    if (wbHost) {
      this.winboxConfig = new WinBoxQuickConfig({
        container: wbHost,
        simulator: this.simulator,
        deviceManager: this.deviceManager,
        onOpenInTerminal: (cmd, flavor, deviceId) => {
          const cliSel = this.modalEl?.querySelector('#pt-cli-device');
          const flavSel = this.modalEl?.querySelector('#pt-cli-flavor');
          const inp = this.modalEl?.querySelector('#pt-cli-input');
          if (cliSel && deviceId) cliSel.value = deviceId;
          if (flavSel && flavor) flavSel.value = flavor;
          this.setActiveTab('cli');
          this.cliTouchBar?.render();
          if (inp) {
            inp.value = cmd || '';
            inp.focus?.();
          }
        },
        onApplied: ({ mikrotikCmd, ciscoCmd, summary }) => {
          const outBox = this.modalEl?.querySelector('#pt-cli-output');
          const logEntry = `[WinBox Sync] ${summary}\n  MikroTik: ${mikrotikCmd}\n  Cisco   : ${ciscoCmd}`;
          this.cliHistory.push(logEntry);
          if (this.cliHistory.length > 40) this.cliHistory.shift();
          if (outBox) {
            outBox.textContent = this.cliHistory.join('\n\n');
            outBox.scrollTop = outBox.scrollHeight;
          }
          this.refreshDeviceSelects();
        }
      });
    }

    const touchHost = this.modalEl?.querySelector('#pt-cli-touch-bar-host');
    const cliInput = this.modalEl?.querySelector('#pt-cli-input');
    if (touchHost && cliInput) {
      this.cliTouchBar = new CliTouchBar({
        container: touchHost,
        inputEl: cliInput,
        simulator: this.simulator,
        deviceManager: this.deviceManager,
        getFlavor: () => this.modalEl?.querySelector('#pt-cli-flavor')?.value || 'auto',
        getDeviceId: () => this.modalEl?.querySelector('#pt-cli-device')?.value || '',
        onRunCommand: (cmd) => this.runCliFromUI(cmd),
        onClearOutput: () => {
          this.cliHistory = [];
          const outBox = this.modalEl?.querySelector('#pt-cli-output');
          if (outBox) outBox.textContent = 'Terminal dibersihkan. Ketik "help" untuk melihat daftar perintah.';
        }
      });
    }
  }

  bindEvents() {
    if (!this.modalEl) return;

    this.modalEl.querySelector('#btn-pt-close')?.addEventListener('click', () => this.hide());
    this.modalEl.querySelector('#btn-pt-peek-toggle')?.addEventListener('click', () => {
      this.enterPeekMode(this.lastSimResult);
    });
    this.modalEl.addEventListener('click', (ev) => {
      if (ev.target === this.modalEl) this.hide();
    });

    this.modalEl.querySelectorAll('[data-pt-tab]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setActiveTab(btn.getAttribute('data-pt-tab') || 'sim');
      });
    });

    this.modalEl.querySelector('#btn-pt-run-ping')?.addEventListener('click', () => {
      this.runPingFromUI({ autoPeekOnMobile: true });
    });

    this.modalEl.querySelector('#btn-pt-run-trace')?.addEventListener('click', () => {
      this.runTracerouteFromUI({ autoPeekOnMobile: true });
    });

    this.modalEl.querySelectorAll('[data-cli-cmd]')?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cli-cmd') || '';
        const inp = this.modalEl.querySelector('#pt-cli-input');
        if (inp) inp.value = cmd;
        this.runCliFromUI(cmd);
      });
    });

    this.modalEl.querySelector('#pt-cli-device')?.addEventListener('change', () => {
      this.cliTouchBar?.render();
    });
    this.modalEl.querySelector('#pt-cli-flavor')?.addEventListener('change', () => {
      this.cliTouchBar?.render();
    });

    const cliInp = this.modalEl.querySelector('#pt-cli-input');
    cliInp?.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        this.cliTouchBar?.navigateHistory(-1);
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        this.cliTouchBar?.navigateHistory(1);
      } else if (ev.key === 'Tab') {
        ev.preventDefault();
        this.cliTouchBar?.autocomplete();
      }
    });
    cliInp?.addEventListener('focus', () => {
      this._syncVisualViewportHeight();
      setTimeout(() => {
        cliInp.scrollIntoView?.({ block: 'nearest' });
        const outBox = this.modalEl?.querySelector('#pt-cli-output');
        if (outBox) outBox.scrollTop = outBox.scrollHeight;
      }, 120);
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

  /**
   * Keep modal card cleanly above the Android/iOS virtual soft-keyboard using window.visualViewport.
   */
  bindVisualViewportGuard() {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    this._boundViewportSync = () => this._syncVisualViewportHeight();
    window.visualViewport.addEventListener('resize', this._boundViewportSync);
    window.visualViewport.addEventListener('scroll', this._boundViewportSync);
  }

  _syncVisualViewportHeight() {
    if (!this.modalEl || !this.isOpen || this.isPeeking) return;
    const card = this.modalEl.querySelector('.packet-tracer-card');
    if (!card || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const vvHeight = Math.max(240, Math.round(vv.height));
    const keyboardOpen = vvHeight < window.innerHeight * 0.78;
    this.modalEl.classList.toggle('is-keyboard-open', keyboardOpen);
    card.style.maxHeight = `${Math.max(220, vvHeight - 16)}px`;

    if (keyboardOpen) {
      const outBox = this.modalEl.querySelector('#pt-cli-output');
      if (outBox) outBox.scrollTop = outBox.scrollHeight;
    }
  }

  setActiveTab(tab) {
    const valid = tab === 'winbox' || tab === 'cli' || tab === 'sim' ? tab : 'sim';
    this.activeTab = valid;
    this.modalEl?.querySelectorAll('[data-pt-tab]')?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-pt-tab') === this.activeTab);
    });

    const panels = {
      winbox: this.modalEl?.querySelector('#pt-panel-winbox'),
      cli: this.modalEl?.querySelector('#pt-panel-cli'),
      sim: this.modalEl?.querySelector('#pt-panel-sim')
    };

    Object.entries(panels).forEach(([key, el]) => {
      if (!el) return;
      const active = key === this.activeTab;
      el.classList.toggle('hidden', !active);
      el.style.display = active ? 'flex' : 'none';
    });

    if (this.activeTab === 'winbox') {
      this.winboxConfig?.render();
    } else if (this.activeTab === 'cli') {
      this.cliTouchBar?.render();
    }
  }

  refreshDeviceSelects(preferredDeviceId = null) {
    if (!this.modalEl) return;
    const devices = this.deviceManager?.getAllDevices?.() || [];
    const selectedId = preferredDeviceId || this.deviceManager?.selectedDeviceId || '';
    const opts = devices
      .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.network?.ip || 'no IP')})</option>`)
      .join('');

    const srcSel = this.modalEl.querySelector('#pt-sim-source');
    const dstSel = this.modalEl.querySelector('#pt-sim-target');
    const cliSel = this.modalEl.querySelector('#pt-cli-device');

    if (srcSel) {
      const prev = preferredDeviceId || srcSel.value;
      srcSel.innerHTML = opts || '<option value="">(belum ada perangkat)</option>';
      if (prev && devices.some((d) => d.id === prev)) srcSel.value = prev;
      else if (selectedId && devices.some((d) => d.id === selectedId)) srcSel.value = selectedId;
    }

    if (dstSel) {
      const prev = dstSel.value;
      dstSel.innerHTML = opts || '<option value="">(belum ada perangkat)</option>';
      if (prev && prev !== srcSel?.value && devices.some((d) => d.id === prev)) dstSel.value = prev;
      else if (devices.length > 1) {
        const alt = devices.find((d) => d.id !== srcSel?.value) || devices[devices.length - 1];
        dstSel.value = alt.id;
      }
    }

    if (cliSel) {
      const prev = preferredDeviceId || cliSel.value;
      cliSel.innerHTML = opts || '<option value="">(belum ada perangkat)</option>';
      if (prev && devices.some((d) => d.id === prev)) cliSel.value = prev;
      else if (selectedId && devices.some((d) => d.id === selectedId)) cliSel.value = selectedId;
    }

    if (preferredDeviceId && this.winboxConfig) {
      this.winboxConfig.selectedDeviceId = preferredDeviceId;
    }
    if (this.activeTab === 'winbox') {
      this.winboxConfig?.render();
    } else if (this.activeTab === 'cli') {
      this.cliTouchBar?.render();
    }
  }

  /**
   * Open the simulator modal on the requested tab ('winbox' | 'cli' | 'sim') and optional target device.
   */
  show(tab = 'sim', deviceId = null) {
    if (!this.modalEl) return;
    this.isOpen = true;
    this.isPeeking = false;
    this._hidePeekBanner();
    this.refreshDeviceSelects(deviceId);
    if (deviceId && this.winboxConfig) {
      this.winboxConfig.setDeviceId(deviceId);
    }
    this.setActiveTab(tab);
    this.modalEl.style.display = 'flex';
    this._syncVisualViewportHeight();

    // Pause background 3D loop on mobile / low-end devices while full modal is open
    this.map3DEngine?.setPausedByModal?.(true);
  }

  hide() {
    this.isOpen = false;
    this.isPeeking = false;
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
      this.modalEl.classList.remove('is-keyboard-open');
    }
    this._hidePeekBanner();
    this.map3DEngine?.setPausedByModal?.(false);
  }

  /**
   * Shrink the modal into a sleek compact result banner at the bottom of the screen
   * so students on mobile/desktop can clearly watch the 3D packet orb travel along cables.
   */
  enterPeekMode(res = null) {
    if (!this.modalEl || !this.peekBannerEl) return;
    this.isPeeking = true;
    this.modalEl.style.display = 'none';
    // Resume 3D render loop immediately so 3D packet animation plays smoothly!
    this.map3DEngine?.setPausedByModal?.(false);

    const activeRes = res || this.lastSimResult;
    const isOk = activeRes ? Boolean(activeRes.success) : true;
    const statusLabel = activeRes
      ? (isOk
        ? `PING BERHASIL • ${activeRes.latencyMs ?? 0}ms`
        : `PING GAGAL`)
      : 'Animasi Paket 3D Aktif';
    const statusIcon = activeRes ? uiIcon(isOk ? 'check' : 'x', 13) : uiIcon('zap', 13);
    const detailText = activeRes ? (activeRes.summary || activeRes.reason || '') : 'Klik Buka Kembali untuk melanjutkan konfigurasi.';

    this.peekBannerEl.className = `pt-peek-banner ${activeRes ? (isOk ? 'is-ok' : 'is-fail') : 'is-info'}`;
    this.peekBannerEl.style.display = 'flex';
    this.peekBannerEl.innerHTML = `
      <div class="pt-peek-info">
        <span class="pt-peek-status" style="display:inline-flex;align-items:center;gap:5px;">${statusIcon} ${escapeHtml(statusLabel)}</span>
        <span class="pt-peek-summary">${escapeHtml(detailText)}</span>
      </div>
      <div class="pt-peek-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-pt-peek-action="osi">Detail OSI</button>
        <button type="button" class="btn btn-primary btn-sm" data-pt-peek-action="reopen">Buka Kembali</button>
        <button type="button" class="btn btn-icon btn-sm" data-pt-peek-action="close" title="Tutup">${uiIcon('x', 13)}</button>
      </div>
    `;

    this.peekBannerEl.onclick = (ev) => {
      const btn = ev.target?.closest?.('[data-pt-peek-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-pt-peek-action');
      if (act === 'osi') {
        this.exitPeekMode('sim');
      } else if (act === 'reopen') {
        this.exitPeekMode(this.activeTab);
      } else if (act === 'close') {
        this.hide();
      }
    };
  }

  exitPeekMode(tab = null) {
    this.isPeeking = false;
    this._hidePeekBanner();
    if (!this.modalEl) return;
    this.isOpen = true;
    if (tab) this.setActiveTab(tab);
    this.modalEl.style.display = 'flex';
    this._syncVisualViewportHeight();
    this.map3DEngine?.setPausedByModal?.(true);
  }

  _hidePeekBanner() {
    if (!this.peekBannerEl) return;
    this.peekBannerEl.classList.add('hidden');
    this.peekBannerEl.style.display = 'none';
    this.peekBannerEl.innerHTML = '';
  }

  runPingFromUI({ autoPeekOnMobile = false } = {}) {
    const srcId = this.modalEl?.querySelector('#pt-sim-source')?.value || '';
    const dstId = this.modalEl?.querySelector('#pt-sim-target')?.value || '';
    const res = this.simulator?.simulatePing(srcId, dstId);
    if (!res) return;
    this.lastSimResult = res;
    this.renderSimulationResult(res);

    const in3d = stateManager.getViewMode() === '3d';
    if (in3d && res.hops?.length > 0) {
      this.map3DEngine?.animatePacketPath3D?.(res.hops, { success: res.success });
      if (autoPeekOnMobile && isMobileTouchDevice()) {
        this.enterPeekMode(res);
      }
    }
    return res;
  }

  runTracerouteFromUI({ autoPeekOnMobile = false } = {}) {
    const srcId = this.modalEl?.querySelector('#pt-sim-source')?.value || '';
    const dstId = this.modalEl?.querySelector('#pt-sim-target')?.value || '';
    const res = this.simulator?.simulateTraceroute(srcId, dstId);
    if (!res) return;
    this.lastSimResult = res;
    this.renderSimulationResult(res, { showTrace: true });

    const in3d = stateManager.getViewMode() === '3d';
    if (in3d && res.hops?.length > 0) {
      this.map3DEngine?.animatePacketPath3D?.(res.hops, { success: res.success });
      if (autoPeekOnMobile && isMobileTouchDevice()) {
        this.enterPeekMode(res);
      }
    }
    return res;
  }

  renderSimulationResult(res, { showTrace = false } = {}) {
    const box = this.modalEl?.querySelector('#pt-sim-result');
    if (!box) return;
    const hopNames = (res.hops || []).map((id) => {
      const d = this.deviceManager?.getDeviceById?.(id);
      return `<span class="pt-hop-pill">${escapeHtml(d?.name || id)}</span>`;
    }).join(' -&gt; ');

    const traceHtml = showTrace && res.traceHops?.length
      ? `<div class="pt-pdu-row"><strong>Hops Traceroute:</strong><br>${res.traceHops.map((h) => `#${h.hopIndex} ${escapeHtml(h.deviceName)} (${escapeHtml(h.ip)}) — ${h.rttMs} ms`).join('<br>')}</div>`
      : '';

    const peekBtnHtml = stateManager.getViewMode() === '3d' && res.hops?.length > 0
      ? `<button type="button" id="btn-pt-watch-3d" class="btn btn-secondary btn-sm" style="align-self:flex-start;">${uiIcon('eye', 12)} <span>Tonton Animasi Paket 3D</span></button>`
      : '';

    box.innerHTML = `
      <div class="pt-status-banner ${res.success ? 'is-ok' : 'is-fail'}">
        <span style="display:inline-flex;align-items:center;gap:5px;">${res.success ? `${uiIcon('check', 13)} PING BERHASIL` : `${uiIcon('x', 13)} PING GAGAL`}</span>
        <span>${escapeHtml(res.summary || res.reason || '')}</span>
      </div>
      ${peekBtnHtml}
      ${hopNames ? `<div class="pt-hops-row">${hopNames}</div>` : ''}
      <div class="pt-osi-stack">
        <div class="pt-pdu-row"><strong>Layer 1 (Fisik):</strong> ${escapeHtml(res.osiLayers?.l1 || '-')}</div>
        <div class="pt-pdu-row"><strong>Layer 2 (Data Link / VLAN):</strong> ${escapeHtml(res.osiLayers?.l2 || '-')}</div>
        <div class="pt-pdu-row"><strong>Layer 3 (Network / ICMP):</strong> ${escapeHtml(res.osiLayers?.l3 || '-')}</div>
        ${traceHtml}
      </div>
    `;

    box.querySelector('#btn-pt-watch-3d')?.addEventListener('click', () => {
      this.enterPeekMode(res);
      if (res.hops?.length > 0) {
        this.map3DEngine?.animatePacketPath3D?.(res.hops, { success: res.success });
      }
    });
  }

  runCliFromUI(rawCmd) {
    const devId = this.modalEl?.querySelector('#pt-cli-device')?.value || '';
    const flavor = this.modalEl?.querySelector('#pt-cli-flavor')?.value || 'auto';
    const cmd = String(rawCmd || '').trim();
    if (!cmd) return null;

    this.cliTouchBar?.recordCommand(cmd);
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
