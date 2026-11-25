/**
 * NetMap — Pluggable Cisco Packet Tracer Device Window
 * Menyediakan tab Physical | Config | CLI | Desktop per perangkat.
 * Bagian Terminal (`renderTerminalMount`) dipisahkan total dan hanya memanggil `TerminalSessionEngine`
 * agar desain UI Terminal kustom di masa depan bisa langsung menggantikan bagian ini tanpa ubah logika simulasi.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { escapeHtml, uiIcon } from '../utils/helpers.js';
import { prefixToSubnetMask } from '../simulation/network-simulator.js';

export class PtDeviceWindow {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('../simulation/network-simulator.js').NetworkSimulator} options.simulator
   * @param {import('../simulation/terminal-session-engine.js').TerminalSessionEngine} options.terminalEngine
   * @param {() => import('./device-3d-modal.js').Device3DModelModal} [options.getDevice3DModelModal]
   * @param {() => import('../learning/jobsheet-engine.js').JobsheetEngine} [options.getJobsheetEngine]
   */
  constructor({
    deviceManager,
    cableManager,
    simulator,
    terminalEngine,
    getDevice3DModelModal = null,
    getJobsheetEngine = null
  } = {}) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.simulator = simulator;
    this.terminalEngine = terminalEngine;
    this.getDevice3DModelModal = getDevice3DModelModal;
    this.getJobsheetEngine = getJobsheetEngine;

    this.activeDeviceId = null;
    this.activeTab = 'config'; // 'physical' | 'config' | 'cli' | 'desktop'
    this.desktopApp = 'ipconfig'; // 'ipconfig' | 'cmd' | 'ping'
    this.isOpen = false;
    this.backdropEl = null;

    if (typeof document !== 'undefined' && document.body) {
      this._createDOM();
      this._bindGlobalEvents();
    }
  }

  _createDOM() {
    this.backdropEl = document.createElement('div');
    this.backdropEl.id = 'pt-device-window-backdrop';
    this.backdropEl.className = 'pt-device-window-backdrop hidden';
    this.backdropEl.style.display = 'none';
    this.backdropEl.innerHTML = `<div id="pt-device-window-card" class="pt-device-window" role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(this.backdropEl);

    this.backdropEl.addEventListener('click', (ev) => {
      if (ev.target === this.backdropEl) this.hide();
    });
  }

  _bindGlobalEvents() {
    eventBus.on('workspace:changed', ({ workspaceMode }) => {
      if (workspaceMode === 'build') {
        this.hide();
      }
    });

    eventBus.on('terminal:updated', ({ deviceId }) => {
      if (!this.isOpen || deviceId !== this.activeDeviceId) return;
      if (this.activeTab === 'cli' || (this.activeTab === 'desktop' && this.desktopApp === 'cmd')) {
        this._syncTerminalScreen();
      }
    });

    eventBus.on('device:updated', (dev) => {
      if (this.isOpen && dev?.id === this.activeDeviceId && this.activeTab !== 'cli') {
        this.render();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && this.isOpen) {
          this.hide();
        }
      });
    }
  }

  _isEndHost(dev) {
    const t = String(dev?.type || '').toLowerCase();
    const c = String(dev?.category || '').toLowerCase();
    return ['pc', 'computer', 'workstation', 'laptop', 'smartphone', 'server', 'nvr'].includes(t) || c === 'end-device' || c === 'enddevice';
  }

  /**
   * Open the Packet Tracer Device Window for a specific device and tab.
   * Respects Build-mode isolation (`workspaceMode === 'build'` blocks opening).
   * @param {string} deviceId
   * @param {'physical'|'config'|'cli'|'desktop'|null} [preferredTab=null]
   */
  show(deviceId, preferredTab = null) {
    if (stateManager.getWorkspaceMode?.() === 'build') return false;
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev || !this.backdropEl) return false;

    this.activeDeviceId = dev.id;
    if (preferredTab && ['physical', 'config', 'cli', 'desktop'].includes(preferredTab)) {
      this.activeTab = preferredTab;
    } else {
      this.activeTab = this._isEndHost(dev) ? 'desktop' : 'cli';
    }

    this.isOpen = true;
    this.backdropEl.classList.remove('hidden');
    this.backdropEl.style.display = 'flex';
    this.render();
    return true;
  }

  hide() {
    if (this.activeDeviceId && this.terminalEngine?.isStreaming?.(this.activeDeviceId)) {
      this.terminalEngine.interrupt(this.activeDeviceId);
    }
    this.isOpen = false;
    if (this.backdropEl) {
      this.backdropEl.classList.add('hidden');
      this.backdropEl.style.display = 'none';
    }
  }

  setActiveTab(tab) {
    if (!['physical', 'config', 'cli', 'desktop'].includes(tab)) return;
    this.activeTab = tab;
    this.render();
  }

  render() {
    if (!this.backdropEl) return;
    const card = this.backdropEl.querySelector('#pt-device-window-card');
    const dev = this.deviceManager?.getDeviceById?.(this.activeDeviceId);
    if (!card || !dev) {
      this.hide();
      return;
    }

    const isOnline = dev.status !== 'offline';
    const isEndHost = this._isEndHost(dev);

    card.innerHTML = `
      <div class="pt-dw-header">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span style="width:10px;height:10px;border-radius:50%;background:${isOnline ? '#22c55e' : '#ef4444'};flex-shrink:0;"></span>
          <div style="min-width:0;">
            <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(dev.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml([dev.brand, dev.model].filter(Boolean).join(' ') || dev.type)} &bull; IP: ${escapeHtml(dev.network?.ip || 'Belum diatur')} &bull; VLAN ${Number(dev.network?.vlan || 1)}</div>
          </div>
        </div>
        <button type="button" id="pt-dw-close-btn" class="btn btn-icon btn-sm" title="Tutup (Esc)">${uiIcon('x', 15)}</button>
      </div>

      <div class="pt-dw-tabs" role="tablist">
        <button type="button" class="pt-dw-tab ${this.activeTab === 'physical' ? 'active' : ''}" data-pt-dw-tab="physical">${uiIcon('cpu', 13)} <span>Physical</span></button>
        <button type="button" class="pt-dw-tab ${this.activeTab === 'config' ? 'active' : ''}" data-pt-dw-tab="config">${uiIcon('sliders', 13)} <span>Config</span></button>
        <button type="button" class="pt-dw-tab ${this.activeTab === 'cli' ? 'active' : ''}" data-pt-dw-tab="cli">${uiIcon('terminal', 13)} <span>CLI</span></button>
        ${isEndHost ? `<button type="button" class="pt-dw-tab ${this.activeTab === 'desktop' ? 'active' : ''}" data-pt-dw-tab="desktop">${uiIcon('monitor', 13)} <span>Desktop</span></button>` : ''}
      </div>

      <div id="pt-dw-body" class="pt-dw-body"></div>
    `;

    card.querySelector('#pt-dw-close-btn')?.addEventListener('click', () => this.hide());
    card.querySelectorAll('[data-pt-dw-tab]')?.forEach((btn) => {
      btn.addEventListener('click', () => this.setActiveTab(btn.getAttribute('data-pt-dw-tab')));
    });

    const bodyEl = card.querySelector('#pt-dw-body');
    if (this.activeTab === 'physical') this._renderPhysicalTab(bodyEl, dev);
    else if (this.activeTab === 'config') this._renderConfigTab(bodyEl, dev);
    else if (this.activeTab === 'cli') this.renderTerminalMount(bodyEl, dev);
    else if (this.activeTab === 'desktop') this._renderDesktopTab(bodyEl, dev);
  }

  _renderPhysicalTab(hostEl, dev) {
    const isOnline = dev.status !== 'offline';
    const ports = this.simulator?.getDevicePortList?.(dev) || [];
    const cables = this.cableManager?.getConnectionsByDeviceId?.(dev.id) || [];
    const glbUrl = dev.spatial3d?.customModelUrl || '';

    const portBadges = ports.map((p) => {
      const boundCable = cables.find((c) => (
        (c.source === dev.id && c.details?.portSource === p.name) ||
        (c.destination === dev.id && c.details?.portDestination === p.name)
      ));
      const ifCfg = this.simulator?.getEffectiveInterfaceConfig?.(dev, p.name) || {};
      const up = isOnline && Boolean(boundCable) && boundCable.status !== 'damaged' && boundCable.status !== 'inactive' && ifCfg.status !== 'down';
      const dotColor = !boundCable ? '#94a3b8' : (up ? '#22c55e' : '#ef4444');
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-secondary);font-size:11px;">
          <span style="display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-weight:700;">
            <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};"></span>
            ${escapeHtml(p.name)}
          </span>
          <span style="color:var(--text-muted);font-size:10px;">${escapeHtml(p.type || 'rj45')} &bull; ${escapeHtml(p.speed || '1G')} &bull; ${boundCable ? 'Tersambung' : 'Kosong'}</span>
        </div>
      `;
    }).join('');

    hostEl.innerHTML = `
      <div class="pt-dw-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:12.5px;font-weight:700;">Status Daya Perangkat (Power Switch)</div>
            <div style="font-size:11px;color:var(--text-muted);">Matikan daya untuk mensimulasikan gangguan Layer 1 di Mode Topologi &amp; 3D.</div>
          </div>
          <button type="button" id="pt-dw-power-toggle" class="btn ${isOnline ? 'btn-primary' : 'btn-secondary'} btn-sm">
            ${uiIcon('power', 13)} <span>${isOnline ? 'Power ON (Aktif)' : 'Power OFF (Mati)'}</span>
          </button>
        </div>
      </div>

      <div class="pt-dw-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:12.5px;font-weight:700;">Slot Model 3D (.GLB)</div>
            <div style="font-size:11px;color:var(--text-muted);">${glbUrl ? `Terpasang: ${escapeHtml(glbUrl)}` : 'Slot 3D Siap — Saat ini menggunakan placeholder mesh 3D standar sampai file .GLB Anda dimasukkan.'}</div>
          </div>
          <button type="button" id="pt-dw-link-glb-btn" class="btn btn-secondary btn-sm">
            ${uiIcon('box', 13)} <span>${glbUrl ? 'Ganti Model .GLB' : 'Pasang Model .GLB'}</span>
          </button>
        </div>
      </div>

      <div class="pt-dw-card">
        <div style="font-size:12.5px;font-weight:700;">Daftar Port Fisik (${ports.length} Port)</div>
        <div class="pt-dw-grid">${portBadges || '<span style="font-size:11px;color:var(--text-muted);">Belum ada port terdaftar.</span>'}</div>
      </div>
    `;

    hostEl.querySelector('#pt-dw-power-toggle')?.addEventListener('click', () => {
      this.deviceManager?.updateDevice?.(dev.id, { status: isOnline ? 'offline' : 'online' });
      this.render();
    });

    hostEl.querySelector('#pt-dw-link-glb-btn')?.addEventListener('click', () => {
      const modal = this.getDevice3DModelModal?.();
      if (modal?.show) {
        this.hide();
        modal.show(dev.id);
      } else {
        eventBus.emit('modal:open-device-3d-model', { deviceId: dev.id });
      }
    });
  }

  _renderConfigTab(hostEl, dev) {
    const ports = this.simulator?.getDevicePortList?.(dev) || [];
    const curPort = ports[0]?.name || 'ether1';
    const ifRows = ports.map((p) => {
      const cfg = this.simulator?.getEffectiveInterfaceConfig?.(dev, p.name) || {};
      const isUp = cfg.status !== 'down';
      return `
        <div class="pt-dw-card" data-cfg-iface="${escapeHtml(p.name)}" style="padding:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:12px;font-family:var(--font-mono);">${escapeHtml(p.name)} <span style="font-weight:400;color:var(--text-muted);">(${escapeHtml(p.type || 'rj45')})</span></strong>
            <label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;cursor:pointer;">
              <input type="checkbox" class="pt-cfg-if-up" ${isUp ? 'checked' : ''} style="accent-color:var(--accent-blue);">
              <span>Port Up (No Shutdown)</span>
            </label>
          </div>
          <div class="pt-dw-grid">
            <label class="pt-dw-field">
              <span>IP Address</span>
              <input type="text" class="pt-cfg-if-ip" value="${escapeHtml(cfg.ip || '')}" placeholder="192.168.10.1">
            </label>
            <label class="pt-dw-field">
              <span>Subnet Mask</span>
              <input type="text" class="pt-cfg-if-mask" value="${escapeHtml(cfg.subnet || prefixToSubnetMask(cfg.prefix ?? 24))}" placeholder="255.255.255.0">
            </label>
            <label class="pt-dw-field">
              <span>Mode &amp; VLAN</span>
              <div style="display:flex;gap:5px;">
                <select class="pt-cfg-if-mode" style="flex:1;">
                  <option value="routed" ${cfg.mode === 'routed' ? 'selected' : ''}>Routed</option>
                  <option value="access" ${cfg.mode === 'access' ? 'selected' : ''}>Access</option>
                  <option value="trunk" ${cfg.mode === 'trunk' ? 'selected' : ''}>Trunk</option>
                </select>
                <input type="number" class="pt-cfg-if-vlan" min="1" max="4094" value="${Number(cfg.vlan || dev.network?.vlan || 1)}" style="width:72px;">
              </div>
            </label>
          </div>
        </div>
      `;
    }).join('');

    hostEl.innerHTML = `
      <div class="pt-dw-card">
        <div style="font-size:12.5px;font-weight:700;">Identitas &amp; Global Routing</div>
        <div class="pt-dw-grid">
          <label class="pt-dw-field">
            <span>Nama Perangkat</span>
            <input type="text" id="pt-cfg-name" value="${escapeHtml(dev.name || '')}">
          </label>
          <label class="pt-dw-field">
            <span>Hostname CLI</span>
            <input type="text" id="pt-cfg-hostname" value="${escapeHtml(dev.network?.hostname || dev.name || '')}">
          </label>
          <label class="pt-dw-field">
            <span>Default Gateway</span>
            <input type="text" id="pt-cfg-gateway" value="${escapeHtml(dev.network?.gateway || '')}" placeholder="192.168.10.1">
          </label>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button type="button" id="pt-cfg-save-btn" class="btn btn-primary btn-sm">${uiIcon('save', 13)} Simpan Konfigurasi Config</button>
        </div>
      </div>

      ${ifRows || `<div class="pt-dw-card"><span style="font-size:11px;color:var(--text-muted);">Port default: ${escapeHtml(curPort)}</span></div>`}
    `;

    hostEl.querySelector('#pt-cfg-save-btn')?.addEventListener('click', () => {
      const nextName = hostEl.querySelector('#pt-cfg-name')?.value?.trim() || dev.name;
      const nextHost = hostEl.querySelector('#pt-cfg-hostname')?.value?.trim() || nextName;
      const nextGw = hostEl.querySelector('#pt-cfg-gateway')?.value?.trim() || '';

      this.deviceManager?.updateDevice?.(dev.id, {
        name: nextName,
        network: {
          hostname: nextHost,
          gateway: nextGw
        }
      });

      hostEl.querySelectorAll('[data-cfg-iface]')?.forEach((row) => {
        const ifName = row.getAttribute('data-cfg-iface');
        const ip = row.querySelector('.pt-cfg-if-ip')?.value?.trim() || '';
        const subnet = row.querySelector('.pt-cfg-if-mask')?.value?.trim() || '255.255.255.0';
        const up = Boolean(row.querySelector('.pt-cfg-if-up')?.checked);
        const mode = row.querySelector('.pt-cfg-if-mode')?.value || 'routed';
        const vlan = Math.max(1, Math.min(4094, Number(row.querySelector('.pt-cfg-if-vlan')?.value || 1)));
        this.simulator?.setInterfaceConfig?.(dev.id, ifName, {
          ip,
          subnet,
          status: up ? 'up' : 'down',
          mode,
          vlan
        });
      });

      this.render();
    });
  }

  /**
   * PLUGGABLE TERMINAL UI MOUNT POINT
   * Antarmuka konsol terminal asli (inline prompt + kursor blok berkedip + streaming I/O).
   * Seluruh logika eksekusi CLI berada di `this.terminalEngine` (`TerminalSessionEngine`).
   */
  renderTerminalMount(hostEl, dev, { forceFlavor = null } = {}) {
    if (!hostEl || !dev || !this.terminalEngine) return;
    if (forceFlavor) {
      this.terminalEngine.setFlavor(dev.id, forceFlavor);
    }
    const session = this.terminalEngine.getSession(dev.id);
    const activeFlavor = session.flavorOverride || 'auto';
    const resolvedOs = activeFlavor === 'auto' ? session.osType : activeFlavor;
    const devLabel = dev.network?.hostname || dev.name || 'Device';
    const windowTitle = resolvedOs === 'host-cmd'
      ? `Command Prompt -- ${devLabel}`
      : resolvedOs === 'mikrotik'
        ? `admin@${devLabel} -- MikroTik RouterOS`
        : `Console tty0 -- ${devLabel} -- Cisco IOS`;

    hostEl.innerHTML = `
      <div class="pt-terminal-shell" data-terminal-device="${escapeHtml(dev.id)}" data-terminal-os="${escapeHtml(resolvedOs)}">
        <div class="pt-terminal-titlebar">
          <div class="pt-term-title-left">
            <div class="pt-term-window-dots" aria-hidden="true">
              <span class="pt-term-dot is-red"></span>
              <span class="pt-term-dot is-amber"></span>
              <span class="pt-term-dot is-green"></span>
            </div>
            <span id="pt-term-window-title" class="pt-term-window-title">${escapeHtml(windowTitle)}</span>
          </div>
          <div class="pt-term-title-actions">
            <select id="pt-term-flavor-select" class="pt-term-os-select" title="Mode Sintaks Terminal">
              <option value="auto" ${activeFlavor === 'auto' ? 'selected' : ''}>Auto OS</option>
              <option value="mikrotik" ${activeFlavor === 'mikrotik' ? 'selected' : ''}>MikroTik ROS</option>
              <option value="cisco" ${activeFlavor === 'cisco' ? 'selected' : ''}>Cisco IOS</option>
              <option value="host-cmd" ${activeFlavor === 'host-cmd' ? 'selected' : ''}>Host CMD</option>
            </select>
            <button type="button" id="pt-term-copy-btn" class="pt-term-chrome-btn" title="Salin seluruh output terminal">${uiIcon('copy', 11)}<span>Copy</span></button>
            <button type="button" id="pt-term-help-btn" class="pt-term-chrome-btn" title="Tampilkan Daftar Perintah (?)">?</button>
            <button type="button" id="pt-term-clear-btn" class="pt-term-chrome-btn" title="Bersihkan Layar (Ctrl+L)">Clear</button>
          </div>
        </div>

        <div id="pt-term-screen" class="pt-terminal-screen" tabindex="-1">
          <div id="pt-term-history" class="pt-terminal-history"></div>
          <div id="pt-term-live-line" class="pt-terminal-live-line">
            <span id="pt-term-prompt" class="pt-terminal-prompt-prefix"></span><span class="pt-terminal-editor-wrap"><span id="pt-term-mirror-before" class="pt-terminal-mirror"></span><span id="pt-term-cursor" class="pt-terminal-cursor">&nbsp;</span><span id="pt-term-mirror-after" class="pt-terminal-mirror"></span><span id="pt-term-ghost" class="pt-terminal-ghost"></span><input id="pt-term-input" type="text" class="pt-terminal-hidden-input" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="send" aria-label="Terminal command input"></span>
          </div>
        </div>

        <div class="pt-terminal-statusbar">
          <span id="pt-term-status-left" class="pt-term-status-left">READY</span>
          <span class="pt-term-status-shortcuts">Tab: Complete | Up/Down: History | Ctrl+C: Stop | Ctrl+L: Clear</span>
        </div>
      </div>
    `;

    this._syncTerminalScreen();

    const shellEl = hostEl.querySelector('.pt-terminal-shell');
    const screenEl = hostEl.querySelector('#pt-term-screen');
    const inputEl = hostEl.querySelector('#pt-term-input');
    const flavorSel = hostEl.querySelector('#pt-term-flavor-select');
    const copyBtn = hostEl.querySelector('#pt-term-copy-btn');

    const focusInput = () => {
      inputEl?.focus?.();
      this._syncTerminalCursorMirror();
    };

    // Click anywhere inside console viewport to focus inline cursor (unless user highlighted text to copy)
    screenEl?.addEventListener('click', () => {
      const sel = typeof window !== 'undefined' ? window.getSelection?.()?.toString?.() : '';
      if (!sel) focusInput();
    });

    flavorSel?.addEventListener('change', (ev) => {
      this.terminalEngine.setFlavor(dev.id, ev.target.value || 'auto');
      this.render();
    });

    copyBtn?.addEventListener('click', () => {
      const lines = (this.terminalEngine.getSession(dev.id)?.bufferLines || []).map((l) =>
        l.type === 'input' ? `${l.prompt || ''}${l.text}` : l.text
      ).join('\n');
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(lines).catch(() => {});
      }
      const lbl = copyBtn.querySelector('span');
      if (lbl) {
        lbl.textContent = 'Copied';
        setTimeout(() => { lbl.textContent = 'Copy'; }, 1200);
      }
      focusInput();
    });

    hostEl.querySelector('#pt-term-clear-btn')?.addEventListener('click', () => {
      this.terminalEngine.clear(dev.id);
      this._syncTerminalCursorMirror();
      focusInput();
    });

    hostEl.querySelector('#pt-term-help-btn')?.addEventListener('click', () => {
      this.terminalEngine.showInlineHelp(dev.id, inputEl?.value || '');
      focusInput();
    });

    inputEl?.addEventListener('focus', () => {
      shellEl?.classList?.add('is-focused');
      this._syncTerminalCursorMirror();
    });
    inputEl?.addEventListener('blur', () => {
      shellEl?.classList?.remove('is-focused');
    });

    ['input', 'keyup', 'click', 'select'].forEach((evtName) => {
      inputEl?.addEventListener(evtName, () => this._syncTerminalCursorMirror());
    });

    inputEl?.addEventListener('keydown', (ev) => {
      const key = String(ev.key || '');
      if ((ev.ctrlKey || ev.metaKey) && key.toLowerCase() === 'c') {
        const sel = typeof window !== 'undefined' ? window.getSelection?.()?.toString?.() : '';
        if (!sel) {
          ev.preventDefault();
          const draft = inputEl.value || '';
          inputEl.value = '';
          this.terminalEngine.interrupt(dev.id, draft);
          this._syncTerminalCursorMirror();
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && key.toLowerCase() === 'l') {
        ev.preventDefault();
        this.terminalEngine.clear(dev.id);
        this._syncTerminalCursorMirror();
        return;
      }
      if (key === 'Enter') {
        ev.preventDefault();
        const cmd = inputEl.value || '';
        inputEl.value = '';
        this._syncTerminalCursorMirror();
        this.terminalEngine.executeInteractive(dev.id, cmd);
        focusInput();
        return;
      }
      if (key === 'Tab') {
        ev.preventDefault();
        const cur = inputEl.value || '';
        const res = this.terminalEngine.complete(dev.id, cur);
        if (res?.completed && res.completed !== cur) {
          inputEl.value = res.completed;
          const endPos = res.completed.length;
          inputEl.setSelectionRange?.(endPos, endPos);
        } else if (res?.suggestions?.length > 1) {
          this.terminalEngine.showTabCandidates(dev.id, cur, res.suggestions);
        }
        this._syncTerminalCursorMirror();
        return;
      }
      if (key === 'ArrowRight') {
        const cur = inputEl.value || '';
        const caret = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : cur.length;
        if (cur.length > 0 && caret === cur.length) {
          const ghostEl = this.backdropEl?.querySelector('#pt-term-ghost');
          const ghostText = ghostEl?.textContent || '';
          if (ghostText) {
            ev.preventDefault();
            inputEl.value = `${cur}${ghostText}`;
            const endPos = inputEl.value.length;
            inputEl.setSelectionRange?.(endPos, endPos);
            this._syncTerminalCursorMirror();
            return;
          }
        }
      }
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        ev.preventDefault();
        const recalled = this.terminalEngine.navigateHistory(dev.id, key === 'ArrowUp' ? -1 : 1);
        inputEl.value = recalled;
        const endPos = recalled.length;
        inputEl.setSelectionRange?.(endPos, endPos);
        this._syncTerminalCursorMirror();
        return;
      }
      if (key === '?' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        const cur = inputEl.value || '';
        const ses = this.terminalEngine.getSession(dev.id);
        const curOs = ses.flavorOverride === 'auto' ? ses.osType : ses.flavorOverride;
        if ((curOs === 'cisco' || curOs === 'mikrotik') && !cur.includes('"')) {
          ev.preventDefault();
          this.terminalEngine.showInlineHelp(dev.id, cur);
        }
      }
    });

    shellEl?.classList?.add('is-focused');
    focusInput();
  }

  _formatTerminalLineHtml(line, osType = 'cisco') {
    if (!line) return '';
    if (line.type === 'banner') {
      return `<div class="pt-term-line pt-term-banner">${escapeHtml(line.text || '')}</div>`;
    }
    if (line.type === 'input') {
      const promptCls = osType === 'mikrotik'
        ? 'pt-term-prompt-mt'
        : (osType === 'host-cmd' ? 'pt-term-prompt-cmd' : 'pt-term-prompt-cs');
      return `<div class="pt-term-line"><span class="pt-terminal-line-prompt ${promptCls}">${escapeHtml(line.prompt || '')}</span><span class="pt-term-entered-cmd">${escapeHtml(line.text || '')}</span></div>`;
    }
    if (line.type === 'error') {
      return `<div class="pt-term-line pt-terminal-line-error">${escapeHtml(line.text || '')}</div>`;
    }

    let safe = escapeHtml(line.text || '');
    safe = safe.replace(
      /\b(\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?)\b/g,
      '<span class="pt-term-kw-ip">$1</span>'
    );
    safe = safe.replace(
      /\b(Reply from|REACHABLE|Media Connected|0% loss|Success rate is 100|UP)\b/g,
      '<span class="pt-term-kw-ok">$1</span>'
    );
    safe = safe.replace(
      /\b(Request timed out|unreachable|100% loss|Disabled|DOWN|administratively down|FAILED)\b/gi,
      '<span class="pt-term-kw-err">$1</span>'
    );
    return `<div class="pt-term-line pt-term-output">${safe}</div>`;
  }

  _syncTerminalCursorMirror() {
    if (!this.backdropEl || !this.activeDeviceId || !this.terminalEngine) return;
    const inputEl = this.backdropEl.querySelector('#pt-term-input');
    const beforeEl = this.backdropEl.querySelector('#pt-term-mirror-before');
    const cursorEl = this.backdropEl.querySelector('#pt-term-cursor');
    const afterEl = this.backdropEl.querySelector('#pt-term-mirror-after');
    const ghostEl = this.backdropEl.querySelector('#pt-term-ghost');
    if (!inputEl || !beforeEl || !cursorEl || !afterEl) return;

    const val = String(inputEl.value || '');
    const caret = typeof inputEl.selectionStart === 'number'
      ? Math.max(0, Math.min(val.length, inputEl.selectionStart))
      : val.length;

    beforeEl.textContent = val.slice(0, caret);
    cursorEl.textContent = caret < val.length ? val[caret] : '\u00a0';
    cursorEl.classList?.toggle('is-char', caret < val.length);
    afterEl.textContent = caret < val.length ? val.slice(caret + 1) : '';

    if (ghostEl) {
      if (val.trim().length > 0 && caret === val.length) {
        const comp = this.terminalEngine.complete(this.activeDeviceId, val);
        const completed = String(comp?.completed || '');
        if (completed.toLowerCase().startsWith(val.toLowerCase()) && completed.length > val.length) {
          ghostEl.textContent = completed.slice(val.length);
        } else {
          ghostEl.textContent = '';
        }
      } else {
        ghostEl.textContent = '';
      }
    }
  }

  _syncTerminalScreen() {
    if (!this.backdropEl || !this.activeDeviceId || !this.terminalEngine) return;
    const screen = this.backdropEl.querySelector('#pt-term-screen');
    const historyEl = this.backdropEl.querySelector('#pt-term-history');
    const liveLineEl = this.backdropEl.querySelector('#pt-term-live-line');
    const promptEl = this.backdropEl.querySelector('#pt-term-prompt');
    const statusLeftEl = this.backdropEl.querySelector('#pt-term-status-left');

    const session = this.terminalEngine.getSession(this.activeDeviceId);
    const resolvedOs = session.flavorOverride === 'auto' ? session.osType : session.flavorOverride;
    const streaming = this.terminalEngine.isStreaming(this.activeDeviceId);
    const dev = this.deviceManager?.getDeviceById?.(this.activeDeviceId);
    const isOffline = dev?.status === 'offline';

    if (promptEl) {
      promptEl.textContent = this.terminalEngine.getPrompt(this.activeDeviceId);
      promptEl.className = `pt-terminal-prompt-prefix ${
        resolvedOs === 'mikrotik'
          ? 'pt-term-prompt-mt'
          : (resolvedOs === 'host-cmd' ? 'pt-term-prompt-cmd' : 'pt-term-prompt-cs')
      }`;
    }

    if (liveLineEl?.style) {
      liveLineEl.style.display = streaming ? 'none' : 'flex';
    }

    if (statusLeftEl) {
      const ipInfo = dev?.network?.ip || 'No IP';
      if (isOffline) {
        statusLeftEl.innerHTML = `<span class="pt-term-status-dot is-off"></span><span>POWER OFF -- Nyalakan perangkat di tab Physical</span>`;
      } else if (streaming) {
        statusLeftEl.innerHTML = `<span class="pt-term-status-dot is-run"></span><span>RUNNING: ${escapeHtml(session.activeStream?.cmd || 'command')} (Tekan Ctrl+C untuk berhenti)</span>`;
      } else {
        statusLeftEl.innerHTML = `<span class="pt-term-status-dot is-ready"></span><span>CONNECTED &bull; ${escapeHtml(resolvedOs.toUpperCase())} &bull; ${escapeHtml(ipInfo)}</span>`;
      }
    }

    if (historyEl) {
      historyEl.innerHTML = (session.bufferLines || [])
        .map((line) => this._formatTerminalLineHtml(line, resolvedOs))
        .join('');
    }
    if (screen) {
      screen.scrollTop = screen.scrollHeight;
    }
    this._syncTerminalCursorMirror();
  }

  _renderDesktopTab(hostEl, dev) {
    hostEl.innerHTML = `
      <div class="pt-desktop-launcher">
        <button type="button" class="pt-desktop-app-btn ${this.desktopApp === 'ipconfig' ? 'active' : ''}" data-pt-desktop-app="ipconfig">
          ${uiIcon('sliders', 18)}
          <span>IP Configuration</span>
        </button>
        <button type="button" class="pt-desktop-app-btn ${this.desktopApp === 'cmd' ? 'active' : ''}" data-pt-desktop-app="cmd">
          ${uiIcon('terminal', 18)}
          <span>Command Prompt</span>
        </button>
        <button type="button" class="pt-desktop-app-btn ${this.desktopApp === 'ping' ? 'active' : ''}" data-pt-desktop-app="ping">
          ${uiIcon('mail', 18)}
          <span>Quick Ping PDU</span>
        </button>
      </div>
      <div id="pt-desktop-app-host"></div>
    `;

    hostEl.querySelectorAll('[data-pt-desktop-app]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.desktopApp = btn.getAttribute('data-pt-desktop-app') || 'ipconfig';
        this.render();
      });
    });

    const appHost = hostEl.querySelector('#pt-desktop-app-host');
    if (this.desktopApp === 'cmd') {
      this.renderTerminalMount(appHost, dev, { forceFlavor: 'host-cmd' });
      return;
    }

    if (this.desktopApp === 'ping') {
      const others = (this.deviceManager?.getAllDevices?.() || []).filter((d) => d.id !== dev.id);
      const opts = others.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.network?.ip || 'no IP')})</option>`).join('');
      appHost.innerHTML = `
        <div class="pt-dw-card">
          <div style="font-size:12.5px;font-weight:700;">Kirim Simple PDU / Ping dari ${escapeHtml(dev.name)}</div>
          <div class="pt-dw-grid">
            <label class="pt-dw-field">
              <span>Pilih Perangkat Tujuan</span>
              <select id="pt-desk-ping-target">${opts || '<option value="">(belum ada target lain)</option>'}</select>
            </label>
            <label class="pt-dw-field">
              <span>Atau Ketik IP Tujuan</span>
              <input type="text" id="pt-desk-ping-ip" placeholder="mis. 192.168.10.1">
            </label>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button type="button" id="pt-desk-ping-run" class="btn btn-primary btn-sm">${uiIcon('play', 12)} Kirim Paket Ping</button>
          </div>
          <div id="pt-desk-ping-out" style="font-size:11.5px;color:var(--text-muted);">Pilih target lalu klik Kirim Paket Ping.</div>
        </div>
      `;

      appHost.querySelector('#pt-desk-ping-run')?.addEventListener('click', () => {
        const ipTyped = appHost.querySelector('#pt-desk-ping-ip')?.value?.trim();
        const selId = appHost.querySelector('#pt-desk-ping-target')?.value?.trim();
        const target = ipTyped || selId;
        const outEl = appHost.querySelector('#pt-desk-ping-out');
        if (!target) {
          if (outEl) outEl.textContent = 'Pilih perangkat atau masukkan IP tujuan terlebih dahulu.';
          return;
        }
        const res = this.simulator?.simulatePing?.(dev.id, target);
        if (res) {
          this.getJobsheetEngine?.()?.recordPingResult?.(res);
          eventBus.emit('topology:pdu-dispatched', { sourceId: dev.id, result: res });
          if (outEl) {
            outEl.innerHTML = res.success
              ? `<strong style="color:#16a34a;">BERHASIL:</strong> ${escapeHtml(res.summary)}`
              : `<strong style="color:#dc2626;">GAGAL:</strong> ${escapeHtml(res.reason || res.summary)}`;
          }
        }
      });
      return;
    }

    // Default: IP Configuration (DHCP vs Static)
    const isDhcp = dev.network?.connectionMode === 'dhcp';
    const primaryPort = (this.simulator?.getDevicePortList?.(dev) || [])[0]?.name || 'eth0';
    appHost.innerHTML = `
      <div class="pt-dw-card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <strong style="font-size:12.5px;">IP Configuration (${escapeHtml(primaryPort)})</strong>
          <div style="display:flex;align-items:center;gap:12px;font-size:12px;font-weight:600;">
            <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="radio" name="pt-desk-ipmode" value="dhcp" ${isDhcp ? 'checked' : ''} style="accent-color:var(--accent-blue);"> DHCP
            </label>
            <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="radio" name="pt-desk-ipmode" value="static" ${!isDhcp ? 'checked' : ''} style="accent-color:var(--accent-blue);"> Static
            </label>
          </div>
        </div>
        <div class="pt-dw-grid">
          <label class="pt-dw-field">
            <span>IPv4 Address</span>
            <input type="text" id="pt-desk-ip" value="${escapeHtml(dev.network?.ip || '')}" ${isDhcp ? 'readonly' : ''} placeholder="192.168.10.10">
          </label>
          <label class="pt-dw-field">
            <span>Subnet Mask</span>
            <input type="text" id="pt-desk-mask" value="${escapeHtml(dev.network?.subnet || '255.255.255.0')}" ${isDhcp ? 'readonly' : ''}>
          </label>
          <label class="pt-dw-field">
            <span>Default Gateway</span>
            <input type="text" id="pt-desk-gw" value="${escapeHtml(dev.network?.gateway || '')}" ${isDhcp ? 'readonly' : ''} placeholder="192.168.10.1">
          </label>
          <label class="pt-dw-field">
            <span>DNS Server</span>
            <input type="text" id="pt-desk-dns" value="${escapeHtml(dev.network?.dns || '')}" ${isDhcp ? 'readonly' : ''} placeholder="8.8.8.8">
          </label>
        </div>
        <div id="pt-desk-dhcp-status" style="font-size:11px;color:var(--text-muted);"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" id="pt-desk-dhcp-renew" class="btn btn-secondary btn-sm">${uiIcon('refresh-cw', 12)} Minta DHCP</button>
          <button type="button" id="pt-desk-ip-save" class="btn btn-primary btn-sm">${uiIcon('save', 12)} Simpan IP Static</button>
        </div>
      </div>
    `;

    const requestDhcp = () => {
      const lease = this.simulator?.requestDhcpLease?.(dev.id, primaryPort);
      const statusEl = appHost.querySelector('#pt-desk-dhcp-status');
      if (statusEl) {
        statusEl.innerHTML = lease?.success
          ? `<span style="color:#16a34a;font-weight:700;">DHCP Request Successful:</span> ${escapeHtml(lease.leasedIp || '')}`
          : `<span style="color:#dc2626;font-weight:700;">DHCP Failed:</span> ${escapeHtml((lease?.steps || []).slice(-1)[0] || 'Server DHCP tidak ditemukan')}`;
      }
      if (lease?.success) this.render();
    };

    appHost.querySelectorAll('input[name="pt-desk-ipmode"]')?.forEach((radio) => {
      radio.addEventListener('change', (ev) => {
        const mode = ev.target.value === 'dhcp' ? 'dhcp' : 'static';
        this.deviceManager?.updateDevice?.(dev.id, { network: { connectionMode: mode } });
        if (mode === 'dhcp') requestDhcp();
        else this.render();
      });
    });

    appHost.querySelector('#pt-desk-dhcp-renew')?.addEventListener('click', requestDhcp);

    appHost.querySelector('#pt-desk-ip-save')?.addEventListener('click', () => {
      const ip = appHost.querySelector('#pt-desk-ip')?.value?.trim() || '';
      const subnet = appHost.querySelector('#pt-desk-mask')?.value?.trim() || '255.255.255.0';
      const gateway = appHost.querySelector('#pt-desk-gw')?.value?.trim() || '';
      const dns = appHost.querySelector('#pt-desk-dns')?.value?.trim() || '';
      this.deviceManager?.updateDevice?.(dev.id, {
        network: { ip, subnet, gateway, dns, connectionMode: 'static' }
      });
      this.simulator?.setInterfaceConfig?.(dev.id, primaryPort, {
        ip,
        subnet,
        status: 'up',
        dhcpClient: false
      });
      this.render();
    });
  }
}
