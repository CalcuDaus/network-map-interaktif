/**
 * NetMap — WinBox / WebFig Quick-Config + Live CLI Mirror
 * Antarmuka GUI ringkas ramah HP Android untuk praktik konfigurasi jaringan nyata
 * (Interfaces, IP & Route, VLAN Access/Trunk, DHCP Server/Client, NAT Masquerade)
 * sambil menampilkan padanan perintah MikroTik RouterOS & Cisco IOS secara real-time.
 */

import { escapeHtml, uiIcon } from '../utils/helpers.js';
import {
  prefixToSubnetMask,
  parseIpv4Cidr,
  parseVlanList,
  isRouterDevice,
  isSwitchDevice,
  isClientDevice
} from '../simulation/network-simulator.js';

const CIDR_CHIPS = [24, 25, 26, 27, 28, 30];

export class WinBoxQuickConfig {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../simulation/network-simulator.js').NetworkSimulator} options.simulator
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {Function} [options.onOpenInTerminal] - (cmd, flavor, deviceId) => void
   * @param {Function} [options.onApplied] - ({ deviceId, mikrotikCmd, ciscoCmd, summary }) => void
   */
  constructor({ container, simulator, deviceManager, onOpenInTerminal = null, onApplied = null } = {}) {
    this.container = container;
    this.simulator = simulator;
    this.deviceManager = deviceManager;
    this.onOpenInTerminal = onOpenInTerminal;
    this.onApplied = onApplied;

    this.selectedDeviceId = '';
    this.activeSubTab = 'interfaces'; // 'interfaces' | 'ip-route' | 'vlan' | 'dhcp-nat'
    this.selectedIface = '';
    this.lastFeedback = null; // { ok: boolean, text: string }
    this.lastMirror = { mikrotik: '', cisco: '' };
  }

  setDeviceId(deviceId) {
    const changed = this.selectedDeviceId !== deviceId;
    this.selectedDeviceId = deviceId || '';
    if (changed) {
      this.selectedIface = '';
      this.lastFeedback = null;
    }
    this.render();
  }

  getSelectedDevice() {
    const devices = this.deviceManager?.getAllDevices?.() || [];
    if (this.selectedDeviceId) {
      const found = devices.find((d) => d.id === this.selectedDeviceId);
      if (found) return found;
    }
    const fallback = devices.find((d) => d.id === this.deviceManager?.selectedDeviceId) || devices[0] || null;
    this.selectedDeviceId = fallback?.id || '';
    return fallback;
  }

  _getPeerMapForDevice(deviceId) {
    const map = new Map();
    const cables = this.simulator?.cableManager?.getAllConnections?.() || [];
    cables.forEach((cab) => {
      if (cab.source === deviceId && cab.details?.portSource) {
        const peer = this.deviceManager?.getDeviceById?.(cab.destination);
        map.set(cab.details.portSource, peer?.name || cab.destination);
      }
      if (cab.destination === deviceId && cab.details?.portDestination) {
        const peer = this.deviceManager?.getDeviceById?.(cab.source);
        map.set(cab.details.portDestination, peer?.name || cab.source);
      }
    });
    return map;
  }

  /**
   * Build live MikroTik RouterOS & Cisco IOS mirror commands from current form state.
   * Exposed publicly so automated tests & copy actions can read exact generated commands.
   */
  buildLiveCliMirror(draft = null) {
    const dev = this.getSelectedDevice();
    if (!dev) return { mikrotik: '# Pilih perangkat terlebih dahulu', cisco: '! Pilih perangkat terlebih dahulu' };

    const d = draft || this._readCurrentDraftFromDOM(dev);
    const mtLines = [];
    const csLines = [];

    if (this.activeSubTab === 'interfaces') {
      const iface = d.iface || 'ether1';
      if (d.ip) {
        const prefix = Number(d.prefix ?? 24);
        const mask = prefixToSubnetMask(prefix);
        mtLines.push(`/ip address add address=${d.ip}/${prefix} interface=${iface}`);
        csLines.push(`interface ${iface} ; ip address ${d.ip} ${mask} ; ${d.status === 'down' ? 'shutdown' : 'no shutdown'}`);
      } else {
        mtLines.push(`/interface ethernet set ${iface} disabled=${d.status === 'down' ? 'yes' : 'no'}`);
        csLines.push(`interface ${iface} ; ${d.status === 'down' ? 'shutdown' : 'no shutdown'}`);
      }
      if (d.mode === 'access') {
        mtLines.push(`/interface bridge port set ${iface} pvid=${d.vlan || 1}`);
        csLines.push(`interface ${iface} ; switchport mode access ; switchport access vlan ${d.vlan || 1}`);
      } else if (d.mode === 'trunk') {
        const vlans = parseVlanList(d.allowedVlans || String(d.vlan || 1)).join(',') || '1';
        mtLines.push(`/interface bridge vlan add vlan-ids=${vlans} tagged=${iface}`);
        csLines.push(`interface ${iface} ; switchport mode trunk ; switchport trunk allowed vlan ${vlans}`);
      }
    } else if (this.activeSubTab === 'ip-route') {
      if (d.hostname) {
        mtLines.push(`/system identity set name=${d.hostname}`);
        csLines.push(`hostname ${d.hostname}`);
      }
      if (d.gateway) {
        mtLines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${d.gateway}`);
        csLines.push(`ip default-gateway ${d.gateway}`);
      }
      if (d.routeDst && d.routeGw) {
        const pref = Number(d.routePrefix ?? 24);
        mtLines.push(`/ip route add dst-address=${d.routeDst}/${pref} gateway=${d.routeGw}`);
        csLines.push(`ip route ${d.routeDst} ${prefixToSubnetMask(pref)} ${d.routeGw}`);
      }
      if (mtLines.length === 0) {
        mtLines.push('/ip route print');
        csLines.push('show ip route');
      }
    } else if (this.activeSubTab === 'vlan') {
      const iface = d.iface || 'ether1';
      if (d.mode === 'trunk') {
        const list = parseVlanList(d.allowedVlans || '10,20').join(',') || '1';
        mtLines.push(`/interface vlan add name=vlan${d.vlan || 10} vlan-id=${d.vlan || 10} interface=${iface}`);
        csLines.push(`interface ${iface} ; switchport mode trunk ; switchport trunk allowed vlan ${list}`);
      } else {
        const vid = Number(d.vlan || 1);
        mtLines.push(`/interface vlan add name=vlan${vid} vlan-id=${vid} interface=${iface}`);
        csLines.push(`interface ${iface} ; switchport mode access ; switchport access vlan ${vid}`);
      }
    } else if (this.activeSubTab === 'dhcp-nat') {
      if (d.dhcpEnabled && d.dhcpIface) {
        mtLines.push(
          `/ip dhcp-server setup interface=${d.dhcpIface} pool=${d.poolStart || '192.168.10.10'}-${d.poolEnd || '192.168.10.50'} gateway=${d.dhcpGateway || '192.168.10.1'} dns=${d.dhcpDns || '8.8.8.8'}`
        );
        csLines.push(
          `ip dhcp pool LAN_${d.dhcpIface} ; default-router ${d.dhcpGateway || '192.168.10.1'} ; dns-server ${d.dhcpDns || '8.8.8.8'}`
        );
      }
      if (d.natEnabled && d.natOutIface) {
        mtLines.push(`/ip firewall nat add chain=srcnat out-interface=${d.natOutIface} action=masquerade`);
        csLines.push(`interface ${d.natOutIface} ; ip nat outside`);
      }
      if (mtLines.length === 0) {
        mtLines.push('/ip dhcp-server print');
        csLines.push('show ip nat translations');
      }
    }

    this.lastMirror = {
      mikrotik: mtLines.join('\n'),
      cisco: csLines.join('\n')
    };
    return this.lastMirror;
  }

  _readCurrentDraftFromDOM(dev) {
    const root = this.container;
    const ports = this.simulator?.getDevicePortList(dev) || [];
    const activeIf = this.selectedIface || ports[0]?.name || 'ether1';
    const curCfg = this.simulator?.getEffectiveInterfaceConfig(dev, activeIf) || {};

    if (!root) {
      return {
        iface: activeIf,
        ip: curCfg.ip || '',
        prefix: curCfg.prefix ?? 24,
        status: curCfg.status || 'up',
        mode: curCfg.mode || 'routed',
        vlan: curCfg.vlan || 1,
        allowedVlans: (curCfg.allowedVlans || [1]).join(',')
      };
    }

    return {
      iface: root.querySelector('#wb-iface-select')?.value || activeIf,
      ip: root.querySelector('#wb-ip-input')?.value?.trim() ?? curCfg.ip ?? '',
      prefix: Number(root.querySelector('#wb-cidr-select')?.value ?? curCfg.prefix ?? 24),
      status: root.querySelector('#wb-status-toggle')?.checked === false ? 'down' : 'up',
      mode: root.querySelector('#wb-mode-select')?.value || curCfg.mode || 'routed',
      vlan: Number(root.querySelector('#wb-vlan-input')?.value || curCfg.vlan || 1),
      allowedVlans: root.querySelector('#wb-allowed-vlans-input')?.value?.trim() || (curCfg.allowedVlans || [1]).join(','),
      hostname: root.querySelector('#wb-hostname-input')?.value?.trim() || '',
      gateway: root.querySelector('#wb-gateway-input')?.value?.trim() || '',
      dns: root.querySelector('#wb-dns-input')?.value?.trim() || '',
      routeDst: root.querySelector('#wb-route-dst')?.value?.trim() || '',
      routePrefix: Number(root.querySelector('#wb-route-prefix')?.value ?? 24),
      routeGw: root.querySelector('#wb-route-gw')?.value?.trim() || '',
      dhcpIface: root.querySelector('#wb-dhcp-iface')?.value || activeIf,
      dhcpEnabled: Boolean(root.querySelector('#wb-dhcp-enabled')?.checked),
      poolStart: root.querySelector('#wb-dhcp-start')?.value?.trim() || '',
      poolEnd: root.querySelector('#wb-dhcp-end')?.value?.trim() || '',
      dhcpGateway: root.querySelector('#wb-dhcp-gw')?.value?.trim() || '',
      dhcpDns: root.querySelector('#wb-dhcp-dns')?.value?.trim() || '8.8.8.8',
      natEnabled: Boolean(root.querySelector('#wb-nat-enabled')?.checked),
      natOutIface: root.querySelector('#wb-nat-iface')?.value || ports[0]?.name || 'ether1'
    };
  }

  render() {
    if (!this.container) return;
    const devices = this.deviceManager?.getAllDevices?.() || [];
    const dev = this.getSelectedDevice();

    if (!dev) {
      this.container.innerHTML = `
        <div class="wb-empty">
          Belum ada perangkat pada peta. Tambahkan Router, Switch, atau PC terlebih dahulu untuk menggunakan <strong>WinBox Quick-Config</strong>.
        </div>
      `;
      return;
    }

    const ports = this.simulator?.getDevicePortList(dev) || [{ name: 'ether1', type: 'rj45', speed: '1G' }];
    if (!this.selectedIface || !ports.some((p) => p.name === this.selectedIface)) {
      this.selectedIface = ports[0]?.name || 'ether1';
    }
    const peerMap = this._getPeerMapForDevice(dev.id);
    const activeCfg = this.simulator?.getEffectiveInterfaceConfig(dev, this.selectedIface) || {};
    const roleLabel = isRouterDevice(dev) ? 'Router / L3' : (isSwitchDevice(dev) ? 'Switch / L2' : 'Client / Host');
    const isOnline = dev.status !== 'offline';

    const deviceOptions = devices.map((d) =>
      `<option value="${escapeHtml(d.id)}" ${d.id === dev.id ? 'selected' : ''}>${escapeHtml(d.name)} (${escapeHtml(d.network?.ip || 'no IP')})</option>`
    ).join('');

    let bodyHtml = '';
    if (this.activeSubTab === 'interfaces') {
      const peerName = peerMap.get(this.selectedIface);
      const ifaceOpts = ports.map((p) => {
        const cfg = this.simulator.getEffectiveInterfaceConfig(dev, p.name);
        const peer = peerMap.get(p.name);
        const ipTag = cfg.ip ? ` • ${cfg.ip}/${cfg.prefix}` : '';
        const peerTag = peer ? ` → ${peer}` : '';
        return `<option value="${escapeHtml(p.name)}" ${p.name === this.selectedIface ? 'selected' : ''}>${escapeHtml(p.name)}${escapeHtml(ipTag)}${escapeHtml(peerTag)}</option>`;
      }).join('');

      const curPrefix = Number(activeCfg.prefix ?? 24);
      const curMask = prefixToSubnetMask(curPrefix);

      bodyHtml = `
        <div class="wb-card">
          <div class="wb-card-head">
            <label class="wb-field-inline" style="flex:1;">
              <span>Interface</span>
              <select id="wb-iface-select" class="pt-select">${ifaceOpts}</select>
            </label>
            <label class="wb-switch-pill" title="Aktifkan / Matikan Interface (no shutdown / shutdown)">
              <input type="checkbox" id="wb-status-toggle" ${activeCfg.status !== 'down' ? 'checked' : ''}>
              <span class="wb-switch-label">${activeCfg.status !== 'down' ? 'UP ●' : 'DOWN ○'}</span>
            </label>
          </div>
          ${peerName ? `<div class="wb-peer-hint">${uiIcon('cable', 12)} Terhubung ke <strong>${escapeHtml(peerName)}</strong></div>` : ''}

          <div class="wb-form-grid">
            <label class="pt-field">
              <span>IPv4 Address</span>
              <input type="text" id="wb-ip-input" class="pt-cli-input wb-ip-field" inputmode="decimal"
                autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false"
                placeholder="192.168.10.1" value="${escapeHtml(activeCfg.ip || '')}">
            </label>
            <label class="pt-field">
              <span>Prefix CIDR <em id="wb-mask-preview" class="wb-mask-preview">(${escapeHtml(curMask)})</em></span>
              <select id="wb-cidr-select" class="pt-select">
                ${[8, 16, 20, 22, 24, 25, 26, 27, 28, 29, 30, 32].map((c) =>
                  `<option value="${c}" ${c === curPrefix ? 'selected' : ''}>/${c} (${prefixToSubnetMask(c)})</option>`
                ).join('')}
              </select>
            </label>
          </div>

          <div class="wb-cidr-chips" role="group" aria-label="Pilih Cepat Prefix CIDR">
            <span class="wb-chips-label">CIDR Cepat:</span>
            ${CIDR_CHIPS.map((c) =>
              `<button type="button" class="wb-chip ${c === curPrefix ? 'active' : ''}" data-wb-cidr="${c}">/${c}</button>`
            ).join('')}
          </div>

          <div class="wb-form-grid">
            <label class="pt-field">
              <span>Mode Port</span>
              <select id="wb-mode-select" class="pt-select">
                <option value="routed" ${activeCfg.mode === 'routed' ? 'selected' : ''}>Routed (Layer 3 / IP)</option>
                <option value="access" ${activeCfg.mode === 'access' ? 'selected' : ''}>Switchport Access (1 VLAN)</option>
                <option value="trunk" ${activeCfg.mode === 'trunk' ? 'selected' : ''}>Switchport Trunk (Multi VLAN)</option>
              </select>
            </label>
            <label class="pt-field">
              <span>${activeCfg.mode === 'trunk' ? 'Allowed VLAN (pisahkan koma)' : 'VLAN ID'}</span>
              ${activeCfg.mode === 'trunk'
                ? `<input type="text" id="wb-allowed-vlans-input" class="pt-cli-input" inputmode="decimal" placeholder="10,20,30" value="${escapeHtml((activeCfg.allowedVlans || [1]).join(','))}">`
                : `<input type="number" id="wb-vlan-input" class="pt-cli-input" inputmode="numeric" min="1" max="4094" value="${Number(activeCfg.vlan || 1)}">`
              }
            </label>
          </div>

          ${isClientDevice(dev) ? `
            <div class="wb-dhcp-client-bar">
              <button type="button" id="btn-wb-request-dhcp" class="btn btn-secondary btn-sm wb-touch-btn">
                ${uiIcon('zap', 13)} <span>Request IP Otomatis (DHCP Client)</span>
              </button>
              <span class="wb-subnote">Mode saat ini: <strong>${dev.network?.connectionMode === 'dhcp' ? 'DHCP' : 'Static'}</strong> • GW: <code>${escapeHtml(dev.network?.gateway || '-')}</code></span>
            </div>
          ` : ''}
        </div>
      `;
    } else if (this.activeSubTab === 'ip-route') {
      const routes = Array.isArray(dev.network?.routes) ? dev.network.routes : [];
      const routeRows = routes.length > 0
        ? routes.map((r, idx) => `
            <div class="wb-route-item">
              <code>${escapeHtml(r.dstNetwork)}/${r.prefix} → via ${escapeHtml(r.gateway)}</code>
              <button type="button" class="btn btn-icon btn-sm wb-route-del" data-wb-del-route="${idx}" title="Hapus Route">${uiIcon('trash-2', 12)}</button>
            </div>
          `).join('')
        : '<div class="wb-subnote">Belum ada static/default route tambahan.</div>';

      bodyHtml = `
        <div class="wb-card">
          <div class="wb-form-grid">
            <label class="pt-field">
              <span>Hostname / Identity</span>
              <input type="text" id="wb-hostname-input" class="pt-cli-input" autocorrect="off" autocapitalize="off"
                placeholder="R1-SMKN1" value="${escapeHtml(dev.network?.hostname || dev.name || '')}">
            </label>
            <label class="pt-field">
              <span>Default Gateway</span>
              <input type="text" id="wb-gateway-input" class="pt-cli-input" inputmode="decimal" autocorrect="off"
                placeholder="192.168.10.1" value="${escapeHtml(dev.network?.gateway || '')}">
            </label>
          </div>
          <label class="pt-field">
            <span>DNS Server</span>
            <input type="text" id="wb-dns-input" class="pt-cli-input" inputmode="decimal" autocorrect="off"
              placeholder="8.8.8.8" value="${escapeHtml(dev.network?.dns || '')}">
          </label>
        </div>

        <div class="wb-card">
          <div class="wb-card-head">
            <strong style="font-size:12px;">Tambah Static / Default Route</strong>
            <button type="button" class="wb-chip" id="btn-wb-default-route-fill">Isi Default 0.0.0.0/0</button>
          </div>
          <div class="wb-form-grid-3">
            <label class="pt-field">
              <span>Dst Network</span>
              <input type="text" id="wb-route-dst" class="pt-cli-input" inputmode="decimal" placeholder="0.0.0.0">
            </label>
            <label class="pt-field">
              <span>Prefix</span>
              <input type="number" id="wb-route-prefix" class="pt-cli-input" inputmode="numeric" min="0" max="32" value="24">
            </label>
            <label class="pt-field">
              <span>Gateway / Next-Hop</span>
              <input type="text" id="wb-route-gw" class="pt-cli-input" inputmode="decimal" placeholder="192.168.1.1">
            </label>
          </div>
          <div class="wb-route-list">${routeRows}</div>
        </div>
      `;
    } else if (this.activeSubTab === 'vlan') {
      const ifaceOpts = ports.map((p) => {
        const cfg = this.simulator.getEffectiveInterfaceConfig(dev, p.name);
        const modeTag = cfg.mode === 'trunk' ? `Trunk [${(cfg.allowedVlans || [1]).join(',')}]` : `Access VLAN ${cfg.vlan || 1}`;
        return `<option value="${escapeHtml(p.name)}" ${p.name === this.selectedIface ? 'selected' : ''}>${escapeHtml(p.name)} — ${escapeHtml(modeTag)}</option>`;
      }).join('');

      const portBadges = ports.slice(0, 16).map((p) => {
        const cfg = this.simulator.getEffectiveInterfaceConfig(dev, p.name);
        const isSel = p.name === this.selectedIface;
        const tag = cfg.mode === 'trunk' ? `T:${(cfg.allowedVlans || [1]).join(',')}` : `V${cfg.vlan || 1}`;
        return `<button type="button" class="wb-vlan-port-pill ${isSel ? 'active' : ''} ${cfg.mode === 'trunk' ? 'is-trunk' : ''}" data-wb-pick-iface="${escapeHtml(p.name)}"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(tag)}</span></button>`;
      }).join('');

      bodyHtml = `
        <div class="wb-card">
          <div class="wb-vlan-port-strip">${portBadges}</div>
          <div class="wb-form-grid">
            <label class="pt-field">
              <span>Port Target</span>
              <select id="wb-iface-select" class="pt-select">${ifaceOpts}</select>
            </label>
            <label class="pt-field">
              <span>Mode Switchport</span>
              <select id="wb-mode-select" class="pt-select">
                <option value="access" ${activeCfg.mode !== 'trunk' ? 'selected' : ''}>Access (1 VLAN)</option>
                <option value="trunk" ${activeCfg.mode === 'trunk' ? 'selected' : ''}>Trunk (Antar Switch / Router)</option>
              </select>
            </label>
          </div>
          <div class="wb-form-grid">
            <label class="pt-field">
              <span>VLAN ID Utama</span>
              <input type="number" id="wb-vlan-input" class="pt-cli-input" inputmode="numeric" min="1" max="4094" value="${Number(activeCfg.vlan || 1)}">
            </label>
            <label class="pt-field">
              <span>Allowed VLAN (untuk Trunk)</span>
              <input type="text" id="wb-allowed-vlans-input" class="pt-cli-input" inputmode="decimal" placeholder="10,20,30" value="${escapeHtml((activeCfg.allowedVlans || [10, 20]).join(','))}">
            </label>
          </div>
          <div class="wb-cidr-chips">
            <span class="wb-chips-label">Preset VLAN Sekolah:</span>
            <button type="button" class="wb-chip" data-wb-vlan-preset="10">VLAN 10 (Siswa)</button>
            <button type="button" class="wb-chip" data-wb-vlan-preset="20">VLAN 20 (Guru)</button>
            <button type="button" class="wb-chip" data-wb-vlan-preset="30">VLAN 30 (Lab)</button>
            <button type="button" class="wb-chip" data-wb-vlan-preset="99">VLAN 99 (Mgmt)</button>
          </div>
        </div>
      `;
    } else if (this.activeSubTab === 'dhcp-nat') {
      const dhcpServers = dev.network?.dhcp?.servers || {};
      const defaultDhcpIf = Object.keys(dhcpServers)[0] || ports[1]?.name || ports[0]?.name || 'ether1';
      const activeDhcpIf = (this._selectedDhcpIface && ports.some((p) => p.name === this._selectedDhcpIface))
        ? this._selectedDhcpIface
        : defaultDhcpIf;
      this._selectedDhcpIface = activeDhcpIf;
      const curDhcpCfg = dhcpServers[activeDhcpIf] || {};
      const ifCfg = this.simulator.getEffectiveInterfaceConfig(dev, activeDhcpIf);
      const parsedIf = parseIpv4Cidr(ifCfg?.ip, ifCfg?.subnet);
      const suggestedStart = curDhcpCfg.poolStart || (parsedIf ? `${parsedIf.networkStr.split('.').slice(0, 3).join('.')}.10` : '192.168.10.10');
      const suggestedEnd = curDhcpCfg.poolEnd || (parsedIf ? `${parsedIf.networkStr.split('.').slice(0, 3).join('.')}.50` : '192.168.10.50');
      const suggestedGw = curDhcpCfg.gateway || parsedIf?.ip || dev.network?.ip || '192.168.10.1';

      const natCfg = dev.network?.nat || { masquerade: false, outInterface: ports[0]?.name || 'ether1' };

      bodyHtml = `
        <div class="wb-card">
          <div class="wb-card-head">
            <strong style="font-size:12px;">DHCP Server Pool</strong>
            <label class="wb-switch-pill">
              <input type="checkbox" id="wb-dhcp-enabled" ${curDhcpCfg.enabled ? 'checked' : ''}>
              <span class="wb-switch-label">${curDhcpCfg.enabled ? 'AKTIF ●' : 'NONAKTIF'}</span>
            </label>
          </div>
          <div class="wb-form-grid">
            <label class="pt-field">
              <span>Interface LAN</span>
              <select id="wb-dhcp-iface" class="pt-select">
                ${ports.map((p) => `<option value="${escapeHtml(p.name)}" ${p.name === activeDhcpIf ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
              </select>
            </label>
            <label class="pt-field">
              <span>Gateway Klien</span>
              <input type="text" id="wb-dhcp-gw" class="pt-cli-input" inputmode="decimal" value="${escapeHtml(suggestedGw)}">
            </label>
          </div>
          <div class="wb-form-grid-3">
            <label class="pt-field">
              <span>Pool Awal</span>
              <input type="text" id="wb-dhcp-start" class="pt-cli-input" inputmode="decimal" value="${escapeHtml(suggestedStart)}">
            </label>
            <label class="pt-field">
              <span>Pool Akhir</span>
              <input type="text" id="wb-dhcp-end" class="pt-cli-input" inputmode="decimal" value="${escapeHtml(suggestedEnd)}">
            </label>
            <label class="pt-field">
              <span>DNS</span>
              <input type="text" id="wb-dhcp-dns" class="pt-cli-input" inputmode="decimal" value="${escapeHtml(curDhcpCfg.dns || '8.8.8.8')}">
            </label>
          </div>
        </div>

        <div class="wb-card">
          <div class="wb-card-head">
            <strong style="font-size:12px;">NAT Masquerade (Akses Internet / ISP)</strong>
            <label class="wb-switch-pill">
              <input type="checkbox" id="wb-nat-enabled" ${natCfg.masquerade ? 'checked' : ''}>
              <span class="wb-switch-label">${natCfg.masquerade ? 'MASQUERADE ●' : 'NONAKTIF'}</span>
            </label>
          </div>
          <label class="pt-field">
            <span>Out-Interface (WAN menuju ISP / Modem)</span>
            <select id="wb-nat-iface" class="pt-select">
              ${ports.map((p) => `<option value="${escapeHtml(p.name)}" ${p.name === (natCfg.outInterface || ports[0]?.name) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </label>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="wb-root">
        <div class="wb-top-bar">
          <label class="pt-field" style="flex:1;min-width:170px;">
            <span>Perangkat</span>
            <select id="wb-device-select" class="pt-select">${deviceOptions}</select>
          </label>
          <div class="wb-meta-badges">
            <span class="wb-status-badge ${isOnline ? 'is-online' : 'is-offline'}">${isOnline ? '● ONLINE' : '○ OFFLINE'}</span>
            <span class="wb-role-badge">${escapeHtml(roleLabel)}</span>
          </div>
        </div>

        <div class="wb-subtabs" role="tablist">
          <button type="button" class="wb-subtab ${this.activeSubTab === 'interfaces' ? 'active' : ''}" data-wb-subtab="interfaces">Interfaces</button>
          <button type="button" class="wb-subtab ${this.activeSubTab === 'ip-route' ? 'active' : ''}" data-wb-subtab="ip-route">IP &amp; Route</button>
          <button type="button" class="wb-subtab ${this.activeSubTab === 'vlan' ? 'active' : ''}" data-wb-subtab="vlan">VLAN</button>
          <button type="button" class="wb-subtab ${this.activeSubTab === 'dhcp-nat' ? 'active' : ''}" data-wb-subtab="dhcp-nat">DHCP / NAT</button>
        </div>

        ${bodyHtml}

        ${this.lastFeedback ? `
          <div class="wb-feedback ${this.lastFeedback.ok ? 'is-ok' : 'is-fail'}">
            ${escapeHtml(this.lastFeedback.text)}
          </div>
        ` : ''}

        <div class="wb-cli-mirror">
          <div class="wb-cli-mirror-head">
            <span>${uiIcon('terminal', 12)} <strong>Live CLI Mirror</strong> (Belajar Sintaks Industri)</span>
            <div class="wb-cli-mirror-actions">
              <button type="button" id="btn-wb-copy-cli" class="wb-mini-btn">Salin</button>
              <button type="button" id="btn-wb-open-cli" class="wb-mini-btn is-accent">Buka di Terminal</button>
            </div>
          </div>
          <div class="wb-mirror-line">
            <span class="wb-mirror-tag is-mt">MikroTik</span>
            <code id="wb-mirror-mikrotik"></code>
          </div>
          <div class="wb-mirror-line">
            <span class="wb-mirror-tag is-cs">Cisco IOS</span>
            <code id="wb-mirror-cisco"></code>
          </div>
        </div>

        <div class="wb-footer-actions">
          <button type="button" id="btn-wb-apply" class="btn btn-primary btn-sm wb-apply-btn">
            ${uiIcon('check', 14)} <span>Terapkan Konfigurasi</span>
          </button>
        </div>
      </div>
    `;

    this._updateLiveMirrorDOM();
    this._bindEvents(dev);
  }

  _updateLiveMirrorDOM() {
    const mirror = this.buildLiveCliMirror();
    const mtEl = this.container?.querySelector('#wb-mirror-mikrotik');
    const csEl = this.container?.querySelector('#wb-mirror-cisco');
    if (mtEl) mtEl.textContent = mirror.mikrotik;
    if (csEl) csEl.textContent = mirror.cisco;
  }

  _bindEvents(dev) {
    const root = this.container;
    if (!root) return;

    root.querySelector('#wb-device-select')?.addEventListener('change', (ev) => {
      this.setDeviceId(ev.target.value);
    });

    root.querySelectorAll('[data-wb-subtab]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeSubTab = btn.getAttribute('data-wb-subtab') || 'interfaces';
        this.lastFeedback = null;
        this.render();
      });
    });

    root.querySelector('#wb-iface-select')?.addEventListener('change', (ev) => {
      this.selectedIface = ev.target.value;
      this.render();
    });

    root.querySelector('#wb-dhcp-iface')?.addEventListener('change', (ev) => {
      this._selectedDhcpIface = ev.target.value;
      this.render();
    });

    root.querySelector('#wb-mode-select')?.addEventListener('change', (ev) => {
      // Update mirror and re-render if toggling trunk <-> access/routed in interfaces tab
      if (this.activeSubTab === 'interfaces') {
        const nextMode = ev.target.value;
        this.simulator.setInterfaceConfig(dev.id, this.selectedIface, { mode: nextMode });
        this.render();
      } else {
        this._updateLiveMirrorDOM();
      }
    });

    root.querySelectorAll('[data-wb-pick-iface]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedIface = btn.getAttribute('data-wb-pick-iface') || this.selectedIface;
        this.render();
      });
    });

    // CIDR 1-tap chips
    root.querySelectorAll('[data-wb-cidr]')?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const cidr = Number(chip.getAttribute('data-wb-cidr') || 24);
        const sel = root.querySelector('#wb-cidr-select');
        if (sel) sel.value = String(cidr);
        const maskPrev = root.querySelector('#wb-mask-preview');
        if (maskPrev) maskPrev.textContent = `(${prefixToSubnetMask(cidr)})`;
        root.querySelectorAll('[data-wb-cidr]').forEach((c) =>
          c.classList.toggle('active', Number(c.getAttribute('data-wb-cidr')) === cidr)
        );
        this._updateLiveMirrorDOM();
      });
    });

    root.querySelector('#wb-cidr-select')?.addEventListener('change', (ev) => {
      const cidr = Number(ev.target.value || 24);
      const maskPrev = root.querySelector('#wb-mask-preview');
      if (maskPrev) maskPrev.textContent = `(${prefixToSubnetMask(cidr)})`;
      root.querySelectorAll('[data-wb-cidr]').forEach((c) =>
        c.classList.toggle('active', Number(c.getAttribute('data-wb-cidr')) === cidr)
      );
      this._updateLiveMirrorDOM();
    });

    // VLAN quick school presets
    root.querySelectorAll('[data-wb-vlan-preset]')?.forEach((chip) => {
      chip.addEventListener('click', () => {
        const vid = chip.getAttribute('data-wb-vlan-preset') || '10';
        const vInp = root.querySelector('#wb-vlan-input');
        if (vInp) vInp.value = vid;
        this._updateLiveMirrorDOM();
      });
    });

    // Default route quick fill
    root.querySelector('#btn-wb-default-route-fill')?.addEventListener('click', () => {
      const dEl = root.querySelector('#wb-route-dst');
      const pEl = root.querySelector('#wb-route-prefix');
      if (dEl) dEl.value = '0.0.0.0';
      if (pEl) pEl.value = '0';
      this._updateLiveMirrorDOM();
    });

    // Delete route buttons
    root.querySelectorAll('[data-wb-del-route]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-wb-del-route'));
        this.simulator.removeStaticRoute(dev.id, idx);
        this.lastFeedback = { ok: true, text: 'Static route berhasil dihapus.' };
        this.render();
      });
    });

    // DHCP Client 1-tap Request IP (DORA)
    root.querySelector('#btn-wb-request-dhcp')?.addEventListener('click', () => {
      const leaseRes = this.simulator.requestDhcpLease(dev.id, this.selectedIface);
      this.lastFeedback = {
        ok: leaseRes.success,
        text: leaseRes.success
          ? `DHCP DORA Sukses: ${leaseRes.lease.ip}/${leaseRes.lease.prefix} (GW: ${leaseRes.lease.gateway || '-'}, Server: ${leaseRes.lease.serverName})`
          : `Gagal: ${leaseRes.reason}`
      };
      if (leaseRes.success) {
        this.onApplied?.({
          deviceId: dev.id,
          mikrotikCmd: `/ip dhcp-client add interface=${this.selectedIface}`,
          ciscoCmd: `dhcp request`,
          summary: this.lastFeedback.text
        });
      }
      this.render();
    });

    // Live input listeners to update CLI Mirror immediately
    root.querySelectorAll('input, select')?.forEach((el) => {
      if (el.id === 'wb-device-select' || el.id === 'wb-iface-select' || el.id === 'wb-dhcp-iface') return;
      el.addEventListener('input', () => this._updateLiveMirrorDOM());
      el.addEventListener('change', () => {
        if (el.id === 'wb-status-toggle') {
          const lbl = el.parentElement?.querySelector('.wb-switch-label');
          if (lbl) lbl.textContent = el.checked ? 'UP ●' : 'DOWN ○';
        }
        if (el.id === 'wb-dhcp-enabled') {
          const lbl = el.parentElement?.querySelector('.wb-switch-label');
          if (lbl) lbl.textContent = el.checked ? 'AKTIF ●' : 'NONAKTIF';
        }
        if (el.id === 'wb-nat-enabled') {
          const lbl = el.parentElement?.querySelector('.wb-switch-label');
          if (lbl) lbl.textContent = el.checked ? 'MASQUERADE ●' : 'NONAKTIF';
        }
        this._updateLiveMirrorDOM();
      });
    });

    // Copy & Open in Terminal buttons
    root.querySelector('#btn-wb-copy-cli')?.addEventListener('click', () => {
      const mirror = this.buildLiveCliMirror();
      const text = `# MikroTik\n${mirror.mikrotik}\n# Cisco IOS\n${mirror.cisco}`;
      navigator.clipboard?.writeText?.(text).catch(() => {});
      this.lastFeedback = { ok: true, text: 'Sintaks CLI disalin ke clipboard.' };
      this.render();
    });

    root.querySelector('#btn-wb-open-cli')?.addEventListener('click', () => {
      const mirror = this.buildLiveCliMirror();
      const preferMt = String(dev.brand || '').toLowerCase().includes('mikrotik');
      const cmd = preferMt ? mirror.mikrotik.split('\n')[0] : mirror.cisco.split('\n')[0];
      this.onOpenInTerminal?.(cmd, preferMt ? 'mikrotik' : 'cisco', dev.id);
    });

    // Apply button
    root.querySelector('#btn-wb-apply')?.addEventListener('click', () => {
      this.applyCurrentForm();
    });
  }

  /**
   * Apply current form values to device via NetworkSimulator and emit CLI mirror entry.
   */
  applyCurrentForm(customDraft = null) {
    const dev = this.getSelectedDevice();
    if (!dev || !this.simulator) return { ok: false, text: 'Perangkat tidak ditemukan.' };

    const d = customDraft || this._readCurrentDraftFromDOM(dev);
    const mirror = this.buildLiveCliMirror(d);

    if (this.activeSubTab === 'interfaces') {
      if (d.ip && !parseIpv4Cidr(d.ip, prefixToSubnetMask(d.prefix))) {
        this.lastFeedback = { ok: false, text: `Format IPv4 "${d.ip}" tidak valid.` };
        this.render();
        return this.lastFeedback;
      }
      this.simulator.setInterfaceConfig(dev.id, d.iface, {
        ip: d.ip,
        prefix: Number(d.prefix ?? 24),
        subnet: prefixToSubnetMask(Number(d.prefix ?? 24)),
        status: d.status,
        mode: d.mode,
        vlan: Number(d.vlan || 1),
        allowedVlans: d.mode === 'trunk' ? parseVlanList(d.allowedVlans) : [Number(d.vlan || 1)]
      });
      this.lastFeedback = {
        ok: true,
        text: `Interface ${d.iface} diperbarui (${d.ip ? `${d.ip}/${d.prefix}` : 'tanpa IP'}, ${d.mode}, ${d.status.toUpperCase()}).`
      };
    } else if (this.activeSubTab === 'ip-route') {
      const netPatch = {};
      if (d.hostname) netPatch.hostname = d.hostname;
      if (d.gateway !== undefined) {
        if (d.gateway && !parseIpv4Cidr(d.gateway)) {
          this.lastFeedback = { ok: false, text: `Format Default Gateway "${d.gateway}" tidak valid.` };
          this.render();
          return this.lastFeedback;
        }
        netPatch.gateway = d.gateway;
      }
      if (d.dns !== undefined) netPatch.dns = d.dns;
      if (Object.keys(netPatch).length > 0) {
        this.deviceManager.updateDevice(dev.id, { network: netPatch });
      }
      if (d.routeDst && d.routeGw) {
        const added = this.simulator.addStaticRoute(dev.id, {
          dstNetwork: d.routeDst,
          prefix: Number(d.routePrefix ?? 24),
          gateway: d.routeGw
        });
        if (!added) {
          this.lastFeedback = { ok: false, text: 'Format Static Route tidak valid.' };
          this.render();
          return this.lastFeedback;
        }
      }
      this.lastFeedback = { ok: true, text: 'Pengaturan IP, Gateway & Routing berhasil diterapkan.' };
    } else if (this.activeSubTab === 'vlan') {
      const allowed = d.mode === 'trunk' ? parseVlanList(d.allowedVlans) : [Number(d.vlan || 1)];
      this.simulator.setInterfaceConfig(dev.id, d.iface, {
        mode: d.mode,
        vlan: Number(d.vlan || 1),
        allowedVlans: allowed.length > 0 ? allowed : [Number(d.vlan || 1)]
      });
      this.lastFeedback = {
        ok: true,
        text: `Port ${d.iface} diset ke ${d.mode === 'trunk' ? `Trunk (VLAN ${allowed.join(', ')})` : `Access VLAN ${d.vlan || 1}`}.`
      };
    } else if (this.activeSubTab === 'dhcp-nat') {
      this.simulator.configureDhcpServer(dev.id, d.dhcpIface, {
        enabled: Boolean(d.dhcpEnabled),
        poolStart: d.poolStart,
        poolEnd: d.poolEnd,
        gateway: d.dhcpGateway,
        dns: d.dhcpDns
      });
      this.simulator.setNatMasquerade(dev.id, d.natOutIface, Boolean(d.natEnabled));
      this.lastFeedback = {
        ok: true,
        text: `DHCP Server (${d.dhcpEnabled ? 'Aktif' : 'Nonaktif'}) & NAT Masquerade (${d.natEnabled ? 'Aktif' : 'Nonaktif'}) disimpan.`
      };
    }

    this.onApplied?.({
      deviceId: dev.id,
      mikrotikCmd: mirror.mikrotik,
      ciscoCmd: mirror.cisco,
      summary: this.lastFeedback.text
    });
    this.render();
    return this.lastFeedback;
  }
}
