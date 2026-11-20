/**
 * NetMap — Mobile CLI Command Builder & Smart Token Bar
 * Membantu siswa pengguna HP Android mengetik perintah Cisco IOS & MikroTik RouterOS
 * tanpa frustrasi keyboard virtual: tombol ↑ ↓ Tab ? Clear, 2 baris Smart Token Chips
 * (Sintaks + Konteks Topologi Aktif), dan Template Skenario 1-Tap.
 */

import { escapeHtml } from '../utils/helpers.js';

const MIKROTIK_SYNTAX_TOKENS = [
  '/ip', 'address', 'add', 'print', 'route', 'interface=', 'address=', 'gateway=',
  'dst-address=0.0.0.0/0', '/interface', 'vlan', 'dhcp-server', 'setup', 'dhcp-client',
  'firewall nat', 'action=masquerade', 'out-interface=', '/ping', '/24'
];

const CISCO_SYNTAX_TOKENS = [
  'show', 'ip int brief', 'vlan brief', 'ip route', 'interface', 'ip address',
  'no shutdown', 'shutdown', 'switchport mode', 'access', 'trunk', 'allowed vlan',
  'ip default-gateway', 'ip route', 'ping', '255.255.255.0', ';'
];

const CLI_TEMPLATES = [
  {
    label: 'MikroTik: Set IP Interface',
    flavor: 'mikrotik',
    cmd: '/ip address add address=192.168.10.1/24 interface=ether2'
  },
  {
    label: 'MikroTik: Default Route (Gateway)',
    flavor: 'mikrotik',
    cmd: '/ip route add dst-address=0.0.0.0/0 gateway=192.168.1.1'
  },
  {
    label: 'MikroTik: Aktifkan NAT Masquerade',
    flavor: 'mikrotik',
    cmd: '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade'
  },
  {
    label: 'MikroTik: Setup DHCP Server',
    flavor: 'mikrotik',
    cmd: '/ip dhcp-server setup interface=ether2 pool=192.168.10.10-192.168.10.50 gateway=192.168.10.1 dns=8.8.8.8'
  },
  {
    label: 'Cisco: Set IP Interface',
    flavor: 'cisco',
    cmd: 'interface Gi0/1 ; ip address 192.168.10.1 255.255.255.0 ; no shutdown'
  },
  {
    label: 'Cisco: Switchport Access VLAN',
    flavor: 'cisco',
    cmd: 'interface Gi0/1 ; switchport mode access ; switchport access vlan 10'
  },
  {
    label: 'Cisco: Switchport Trunk VLAN',
    flavor: 'cisco',
    cmd: 'interface Gi0/2 ; switchport mode trunk ; switchport trunk allowed vlan 10,20'
  }
];

export class CliTouchBar {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {HTMLInputElement} options.inputEl
   * @param {import('../simulation/network-simulator.js').NetworkSimulator} options.simulator
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {Function} [options.getFlavor] - () => 'auto' | 'cisco' | 'mikrotik'
   * @param {Function} [options.getDeviceId] - () => string
   * @param {Function} [options.onRunCommand] - (cmd) => void
   * @param {Function} [options.onClearOutput] - () => void
   */
  constructor({
    container,
    inputEl,
    simulator,
    deviceManager,
    getFlavor = () => 'auto',
    getDeviceId = () => '',
    onRunCommand = null,
    onClearOutput = null
  } = {}) {
    this.container = container;
    this.inputEl = inputEl;
    this.simulator = simulator;
    this.deviceManager = deviceManager;
    this.getFlavor = getFlavor;
    this.getDeviceId = getDeviceId;
    this.onRunCommand = onRunCommand;
    this.onClearOutput = onClearOutput;

    this.commandHistory = [];
    this.historyCursor = -1;

    this.sanitizeInputElement();
    this.render();
  }

  /**
   * Disable mobile autocorrect / auto-capitalize / spellcheck on CLI input.
   */
  sanitizeInputElement() {
    if (!this.inputEl) return;
    this.inputEl.setAttribute('autocorrect', 'off');
    this.inputEl.setAttribute('autocapitalize', 'off');
    this.inputEl.setAttribute('autocomplete', 'off');
    this.inputEl.setAttribute('spellcheck', 'false');
    this.inputEl.setAttribute('enterkeyhint', 'send');
  }

  recordCommand(cmd) {
    const clean = String(cmd || '').trim();
    if (!clean) return;
    if (this.commandHistory[this.commandHistory.length - 1] !== clean) {
      this.commandHistory.push(clean);
      if (this.commandHistory.length > 50) this.commandHistory.shift();
    }
    this.historyCursor = this.commandHistory.length;
  }

  navigateHistory(delta) {
    if (!this.inputEl || this.commandHistory.length === 0) return '';
    if (this.historyCursor < 0 || this.historyCursor > this.commandHistory.length) {
      this.historyCursor = this.commandHistory.length;
    }
    const nextIdx = Math.max(0, Math.min(this.commandHistory.length, this.historyCursor + delta));
    this.historyCursor = nextIdx;
    const nextVal = nextIdx < this.commandHistory.length ? this.commandHistory[nextIdx] : '';
    this.inputEl.value = nextVal;
    this.inputEl.focus?.();
    return nextVal;
  }

  /**
   * Insert a token chip cleanly at cursor/end of CLI input without double spacing after '=' or '/'.
   */
  insertToken(token) {
    if (!this.inputEl) return '';
    const cur = this.inputEl.value || '';
    const tok = String(token || '');
    if (!tok) return cur;

    const needsLeadingSpace = cur.length > 0 && !/[\s=/]$/.test(cur) && !tok.startsWith('/');
    const needsTrailingSpace = !tok.endsWith('=') && !tok.startsWith('/2');
    const nextVal = `${cur}${needsLeadingSpace ? ' ' : ''}${tok}${needsTrailingSpace ? ' ' : ''}`;
    this.inputEl.value = nextVal;
    this.inputEl.focus?.();
    return nextVal;
  }

  /**
   * Complete partial last token using syntax keywords, device ports, and topology IPs.
   */
  autocomplete() {
    if (!this.inputEl) return '';
    const raw = this.inputEl.value || '';
    const trimmedRight = raw.replace(/\s+$/, '');
    const parts = trimmedRight.split(/\s+/);
    const lastWord = parts[parts.length - 1] || '';
    if (!lastWord) return raw;

    const candidates = [
      ...this._getActiveSyntaxTokens(),
      ...this._getTopologyContextTokens().map((t) => t.value)
    ];

    const lower = lastWord.toLowerCase();
    const match = candidates.find((c) => c.toLowerCase().startsWith(lower) && c.toLowerCase() !== lower);
    if (!match) return raw;

    parts[parts.length - 1] = match;
    const completed = `${parts.join(' ')}${match.endsWith('=') ? '' : ' '}`;
    this.inputEl.value = completed;
    this.inputEl.focus?.();
    return completed;
  }

  _resolveEffectiveFlavor() {
    const flavor = this.getFlavor?.() || 'auto';
    if (flavor === 'mikrotik' || flavor === 'cisco') return flavor;
    const dev = this.deviceManager?.getDeviceById?.(this.getDeviceId?.());
    return String(dev?.brand || '').toLowerCase().includes('mikrotik') ? 'mikrotik' : 'cisco';
  }

  _getActiveSyntaxTokens() {
    return this._resolveEffectiveFlavor() === 'mikrotik'
      ? MIKROTIK_SYNTAX_TOKENS
      : CISCO_SYNTAX_TOKENS;
  }

  _getTopologyContextTokens() {
    const tokens = [];
    const seen = new Set();
    const addTok = (label, value, kind = 'ctx') => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      tokens.push({ label, value, kind });
    };

    const devId = this.getDeviceId?.();
    const activeDev = devId ? this.deviceManager?.getDeviceById?.(devId) : null;
    if (activeDev) {
      const ports = this.simulator?.getDevicePortList(activeDev) || [];
      ports.slice(0, 8).forEach((p) => addTok(p.name, p.name, 'port'));
    }

    const devices = this.deviceManager?.getAllDevices?.() || [];
    const vlans = new Set();
    devices.forEach((d) => {
      const ip = String(d.network?.ip || '').split('/')[0].trim();
      if (ip) addTok(`${ip} (${d.name})`, ip, 'ip');
      if (d.network?.vlan && Number(d.network.vlan) > 1) vlans.add(Number(d.network.vlan));
      Object.values(d.network?.interfaces || {}).forEach((cfg) => {
        if (cfg?.vlan && Number(cfg.vlan) > 1) vlans.add(Number(cfg.vlan));
      });
    });

    [...vlans].sort((a, b) => a - b).slice(0, 6).forEach((v) => {
      addTok(`VLAN ${v}`, String(v), 'vlan');
    });

    if (tokens.length === 0) {
      addTok('ether1', 'ether1', 'port');
      addTok('ether2', 'ether2', 'port');
      addTok('192.168.10.1', '192.168.10.1', 'ip');
    }

    return tokens;
  }

  render() {
    if (!this.container) return;
    const effFlavor = this._resolveEffectiveFlavor();
    const syntaxTokens = this._getActiveSyntaxTokens();
    const ctxTokens = this._getTopologyContextTokens();

    const tplOptions = CLI_TEMPLATES.map((t, idx) =>
      `<option value="${idx}">${escapeHtml(t.label)}</option>`
    ).join('');

    this.container.innerHTML = `
      <div class="cli-touch-wrapper">
        <div class="cli-control-row" role="toolbar" aria-label="Kontrol Terminal Sentuh">
          <button type="button" class="cli-ctrl-btn" data-cli-ctrl="prev" title="Perintah Sebelumnya (↑)">↑</button>
          <button type="button" class="cli-ctrl-btn" data-cli-ctrl="next" title="Perintah Berikutnya (↓)">↓</button>
          <button type="button" class="cli-ctrl-btn" data-cli-ctrl="tab" title="Auto-Complete (Tab)">Tab</button>
          <button type="button" class="cli-ctrl-btn" data-cli-ctrl="help" title="Bantuan Perintah (?)">?</button>
          <button type="button" class="cli-ctrl-btn" data-cli-ctrl="clear" title="Bersihkan Layar Terminal">Clear</button>
          <select id="cli-template-select" class="cli-template-select" title="Isi Template Skenario 1-Tap">
            <option value="">Isi Template ▾</option>
            ${tplOptions}
          </select>
        </div>

        <div class="cli-token-strip" aria-label="Token Sintaks ${effFlavor}">
          <span class="cli-strip-badge">${effFlavor === 'mikrotik' ? 'ROS' : 'IOS'}</span>
          ${syntaxTokens.map((tok) =>
            `<button type="button" class="cli-token-chip" data-cli-token="${escapeHtml(tok)}">${escapeHtml(tok)}</button>`
          ).join('')}
        </div>

        <div class="cli-token-strip is-context" aria-label="Token Konteks Topologi">
          <span class="cli-strip-badge is-ctx">Peta</span>
          ${ctxTokens.map((tok) =>
            `<button type="button" class="cli-token-chip is-${tok.kind}" data-cli-token="${escapeHtml(tok.value)}">${escapeHtml(tok.label)}</button>`
          ).join('')}
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.container) return;

    this.container.querySelectorAll('[data-cli-ctrl]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-cli-ctrl');
        if (act === 'prev') this.navigateHistory(-1);
        else if (act === 'next') this.navigateHistory(1);
        else if (act === 'tab') this.autocomplete();
        else if (act === 'help') this.onRunCommand?.('help');
        else if (act === 'clear') this.onClearOutput?.();
      });
    });

    this.container.querySelectorAll('[data-cli-token]')?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const tok = chip.getAttribute('data-cli-token') || '';
        this.insertToken(tok);
      });
    });

    this.container.querySelector('#cli-template-select')?.addEventListener('change', (ev) => {
      const idx = Number(ev.target.value);
      if (!Number.isNaN(idx) && CLI_TEMPLATES[idx] && this.inputEl) {
        this.inputEl.value = CLI_TEMPLATES[idx].cmd;
        this.inputEl.focus?.();
      }
      ev.target.value = '';
    });
  }
}
