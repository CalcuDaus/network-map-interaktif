/**
 * NetMap — Decoupled Headless Terminal Session Engine
 * 100% DOM-free state machine per-device untuk Terminal CLI (Cisco IOS, MikroTik RouterOS, & Host Command Prompt).
 *
 * Cara integrasi dengan UI Terminal kustom di masa depan:
 * 1. Ambil state/buffer per perangkat: `terminalEngine.getSession(deviceId)`
 * 2. Ambil prompt aktif: `terminalEngine.getPrompt(deviceId)`
 * 3. Kirim perintah: `terminalEngine.execute(deviceId, commandString)`
 * 4. Autocomplete Tab: `terminalEngine.complete(deviceId, partialInput)`
 * 5. Context Help (?): `terminalEngine.getContextHelp(deviceId, partialInput)`
 * 6. History Up/Down: `terminalEngine.navigateHistory(deviceId, -1 | 1)`
 * 7. Berlangganan event `terminal:updated` di `eventBus` untuk me-render ulang tampilan.
 */

import { eventBus } from '../core/event-bus.js';

const MAX_BUFFER_LINES = 200;

const HOST_CMD_CATALOG = [
  { cmd: 'ipconfig', desc: 'Tampilkan ringkasan IPv4, Subnet Mask, dan Default Gateway' },
  { cmd: 'ipconfig /all', desc: 'Tampilkan informasi lengkap adaptor (MAC, DHCP, DNS, Interface)' },
  { cmd: 'ipconfig /renew', desc: 'Minta IP Address baru dari DHCP Server (DORA)' },
  { cmd: 'ipconfig /release', desc: 'Lepaskan IP Address DHCP pada adaptor aktif' },
  { cmd: 'ping ', desc: 'Uji konektivitas ICMP (4 paket) ke IP atau nama perangkat tujuan' },
  { cmd: 'tracert ', desc: 'Lacak hop jalur paket ke tujuan (Traceroute)' },
  { cmd: 'arp -a', desc: 'Tampilkan tabel ARP alamat IP & MAC di jaringan' },
  { cmd: 'route print', desc: 'Tampilkan tabel routing IPv4 aktif host ini' },
  { cmd: 'nslookup ', desc: 'Cek resolusi nama host atau IP pada jaringan' },
  { cmd: 'ver', desc: 'Tampilkan versi sistem operasi Command Prompt' },
  { cmd: 'whoami', desc: 'Tampilkan identitas user & domain aktif' },
  { cmd: 'hostname', desc: 'Tampilkan nama host perangkat' },
  { cmd: 'cls', desc: 'Bersihkan layar terminal' },
  { cmd: 'clear', desc: 'Bersihkan layar terminal' },
  { cmd: 'help', desc: 'Tampilkan daftar perintah Command Prompt' }
];

const MIKROTIK_CMD_CATALOG = [
  { cmd: '/ip address print', desc: 'Lihat daftar IP address pada semua interface' },
  { cmd: '/ip address add address=', desc: 'Tambahkan IP CIDR ke interface tertentu' },
  { cmd: '/ip address remove ', desc: 'Hapus IP address pada interface' },
  { cmd: '/ip route print', desc: 'Lihat tabel routing aktif' },
  { cmd: '/ip route add dst-address=0.0.0.0/0 gateway=', desc: 'Tambahkan default/static route' },
  { cmd: '/ip dhcp-server setup interface=', desc: 'Aktifkan DHCP Server & pool IP' },
  { cmd: '/ip dhcp-client add interface=', desc: 'Minta IP dinamis via DHCP Client' },
  { cmd: '/ip firewall nat add chain=srcnat out-interface=', desc: 'Tambahkan rule NAT Masquerade' },
  { cmd: '/interface print', desc: 'Lihat status & mode semua port fisik' },
  { cmd: '/interface vlan add name=', desc: 'Tambahkan tag VLAN ke interface' },
  { cmd: '/system identity set name=', desc: 'Ubah identitas hostname router' },
  { cmd: '/ping ', desc: 'Kirim paket ICMP ping' },
  { cmd: '/tool traceroute ', desc: 'Lacak hop rute paket' }
];

const CISCO_CMD_CATALOG = [
  { cmd: 'enable', desc: 'Masuk ke Privileged EXEC mode' },
  { cmd: 'configure terminal', desc: 'Masuk ke Global Configuration mode' },
  { cmd: 'interface ', desc: 'Pilih interface/port yang akan dikonfigurasi' },
  { cmd: 'ip address ', desc: 'Tetapkan IP dan Subnet Mask pada interface terpilih' },
  { cmd: 'no shutdown', desc: 'Aktifkan port secara administratif (UP)' },
  { cmd: 'shutdown', desc: 'Nonaktifkan port secara administratif (DOWN)' },
  { cmd: 'switchport mode access', desc: 'Atur port sebagai access port' },
  { cmd: 'switchport mode trunk', desc: 'Atur port sebagai 802.1Q trunk' },
  { cmd: 'switchport access vlan ', desc: 'Tetapkan VLAN ID untuk access port' },
  { cmd: 'switchport trunk allowed vlan ', desc: 'Tentukan daftar VLAN yang diizinkan di trunk' },
  { cmd: 'ip default-gateway ', desc: 'Atur Default Gateway L2/Host' },
  { cmd: 'ip route ', desc: 'Tambahkan static route L3' },
  { cmd: 'hostname ', desc: 'Ubah nama host perangkat' },
  { cmd: 'show ip interface brief', desc: 'Ringkasan IP & status semua interface' },
  { cmd: 'show vlan brief', desc: 'Tampilkan daftar VLAN dan keanggotaan port' },
  { cmd: 'show ip route', desc: 'Tampilkan tabel routing' },
  { cmd: 'show arp', desc: 'Tampilkan tabel ARP' },
  { cmd: 'show running-config', desc: 'Tampilkan konfigurasi berjalan' },
  { cmd: 'ping ', desc: 'Kirim paket ICMP ping' },
  { cmd: 'traceroute ', desc: 'Lacak rute hop ke tujuan' }
];

function isEndHostType(dev) {
  const t = String(dev?.type || '').toLowerCase();
  const cat = String(dev?.category || '').toLowerCase();
  return (
    t === 'pc' ||
    t === 'computer' ||
    t === 'workstation' ||
    t === 'laptop' ||
    t === 'smartphone' ||
    t === 'printer' ||
    t === 'ip-phone' ||
    t === 'cctv' ||
    (cat === 'end-device' || cat === 'enddevice')
  );
}

export class TerminalSessionEngine {
  /**
   * @param {Object} options
   * @param {import('./network-simulator.js').NetworkSimulator} options.simulator
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {() => import('../learning/jobsheet-engine.js').JobsheetEngine} [options.getJobsheetEngine]
   */
  constructor({ simulator, deviceManager, getJobsheetEngine = null } = {}) {
    this.simulator = simulator;
    this.deviceManager = deviceManager;
    this.getJobsheetEngine = getJobsheetEngine;
    this.sessions = new Map(); // deviceId -> SessionState
  }

  /**
   * Determine default OS terminal flavor for a device.
   * @param {Object} dev
   * @returns {'host-cmd'|'mikrotik'|'cisco'}
   */
  resolveDefaultOsType(dev) {
    if (!dev) return 'cisco';
    if (isEndHostType(dev)) return 'host-cmd';
    const probe = `${dev.brand || ''} ${dev.model || ''} ${dev.type || ''}`.toLowerCase();
    if (probe.includes('mikrotik') || probe.includes('routeros') || probe.includes('rb') || probe.includes('ccr')) {
      return 'mikrotik';
    }
    return 'cisco';
  }

  /**
   * Build authentic OS startup banner for the active terminal flavor.
   * @param {'host-cmd'|'mikrotik'|'cisco'} osType
   * @param {string} [devLabel='Device']
   * @returns {string}
   */
  _buildOsBanner(osType, devLabel = 'Device') {
    if (osType === 'host-cmd') {
      return `Microsoft Windows [Version 10.0.22631.4317]\n(c) Microsoft Corporation. All rights reserved. [${devLabel}]`;
    }
    if (osType === 'mikrotik') {
      return [
        '  MMM      MMM       KKK                          TTTTTTTTTTT      KKK',
        '  MMMM    MMMM       KKK                          TTTTTTTTTTT      KKK',
        '  MMM MMMM MMM  III  KKK  KKK  RRRRRR     OOOOOO      TTT     III  KKK  KKK',
        '  MMM  MM  MMM  III  KKKKK     RRR  RRR  OOO  OOO     TTT     III  KKKKK',
        '  MMM      MMM  III  KKK KKK   RRRRRR    OOO  OOO     TTT     III  KKK KKK',
        '  MMM      MMM  III  KKK  KKK  RRR  RRR   OOOOOO      TTT     III  KKK  KKK',
        '',
        `  MikroTik RouterOS 7.14.3 (${devLabel})`,
        '  [?] Gives the list of available commands  |  [Tab] Autocomplete'
      ].join('\n');
    }
    return [
      'Cisco IOS Software, C2900/Catalyst Software (UNIVERSAL9-M), Version 15.2(4)M7',
      'Technical Support: http://www.cisco.com/techsupport',
      `Copyright (c) 1986-2026 by Cisco Systems, Inc. [${devLabel}]`,
      '',
      'Press RETURN or type "show ip int brief", "conf t", "?" to start.'
    ].join('\n');
  }

  /**
   * Retrieve (or lazily initialize) isolated terminal session state for a device.
   * @param {string} deviceId
   */
  getSession(deviceId) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId) || null;
    if (!this.sessions.has(deviceId)) {
      const osType = this.resolveDefaultOsType(dev);
      const devLabel = dev?.network?.hostname || dev?.name || deviceId || 'Device';
      const banner = this._buildOsBanner(osType, devLabel);

      this.sessions.set(deviceId, {
        deviceId,
        osType,
        flavorOverride: 'auto', // 'auto' | 'host-cmd' | 'mikrotik' | 'cisco'
        history: [],
        historyCursor: 0,
        activeStream: null,
        bufferLines: [
          { type: 'banner', text: banner, ts: Date.now() }
        ]
      });
    }
    return this.sessions.get(deviceId);
  }

  /**
   * Override active terminal OS syntax flavor for a device session.
   * @param {string} deviceId
   * @param {'auto'|'host-cmd'|'mikrotik'|'cisco'} flavor
   */
  setFlavor(deviceId, flavor = 'auto') {
    const session = this.getSession(deviceId);
    const allowed = ['auto', 'host-cmd', 'mikrotik', 'cisco'];
    session.flavorOverride = allowed.includes(flavor) ? flavor : 'auto';
    const dev = this.deviceManager?.getDeviceById?.(deviceId) || null;
    if (session.flavorOverride !== 'auto') {
      session.osType = session.flavorOverride;
    } else {
      session.osType = this.resolveDefaultOsType(dev);
    }
    if (session.history.length === 0 && session.bufferLines.length <= 1) {
      const devLabel = dev?.network?.hostname || dev?.name || deviceId || 'Device';
      session.bufferLines = [
        { type: 'banner', text: this._buildOsBanner(session.osType, devLabel), ts: Date.now() }
      ];
    }
    eventBus.emit('terminal:updated', { deviceId, session });
    return session;
  }

  /**
   * Compute Packet Tracer-accurate CLI prompt for the device's current mode.
   * @param {string} deviceId
   * @returns {string}
   */
  getPrompt(deviceId) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    const session = this.getSession(deviceId);
    const host = dev?.network?.hostname || dev?.name || 'Device';
    const cleanHost = String(host).replace(/\s+/g, '-');
    const os = session.flavorOverride === 'auto' ? session.osType : session.flavorOverride;

    if (os === 'host-cmd') {
      return `C:\\Users\\${cleanHost}> `;
    }
    if (os === 'mikrotik') {
      return `[admin@${cleanHost}] > `;
    }
    const ctx = this.simulator?.cliContextMap?.get?.(deviceId);
    if (ctx?.configMode) {
      return ctx.selectedInterface
        ? `${cleanHost}(config-if:${ctx.selectedInterface})# `
        : `${cleanHost}(config)# `;
    }
    return `${cleanHost}# `;
  }

  _appendLine(session, entry) {
    session.bufferLines.push({ ...entry, ts: Date.now() });
    while (session.bufferLines.length > MAX_BUFFER_LINES) {
      session.bufferLines.shift();
    }
  }

  /**
   * Check whether a progressive command output stream (like ping/tracert) is currently running.
   * @param {string} deviceId
   * @returns {boolean}
   */
  isStreaming(deviceId) {
    return Boolean(this.getSession(deviceId)?.activeStream);
  }

  _clearActiveStream(session) {
    if (!session?.activeStream) return false;
    (session.activeStream.timers || []).forEach((tid) => clearTimeout(tid));
    session.activeStream = null;
    return true;
  }

  /**
   * Clear terminal output buffer for a device.
   * @param {string} deviceId
   */
  clear(deviceId) {
    const session = this.getSession(deviceId);
    this._clearActiveStream(session);
    session.bufferLines = [];
    eventBus.emit('terminal:updated', { deviceId, session });
    return session;
  }

  /**
   * Submit an empty Enter press (prints fresh prompt line in scrollback like a real CLI).
   * @param {string} deviceId
   */
  submitEmptyEnter(deviceId) {
    const session = this.getSession(deviceId);
    this._appendLine(session, { type: 'input', prompt: this.getPrompt(deviceId), text: '' });
    eventBus.emit('terminal:updated', { deviceId, session });
  }

  /**
   * Interrupt current command / stream (Ctrl+C).
   * @param {string} deviceId
   * @param {string} [currentDraft='']
   */
  interrupt(deviceId, currentDraft = '') {
    const session = this.getSession(deviceId);
    const wasStreaming = this._clearActiveStream(session);
    if (wasStreaming) {
      this._appendLine(session, { type: 'error', text: '^C' });
    } else {
      this._appendLine(session, {
        type: 'input',
        prompt: this.getPrompt(deviceId),
        text: `${String(currentDraft || '')}^C`
      });
    }
    eventBus.emit('terminal:updated', { deviceId, session, interrupted: true });
    return { interruptedStream: wasStreaming };
  }

  /**
   * Show inline '?' context help directly inside the terminal scrollback.
   * @param {string} deviceId
   * @param {string} [partialInput='']
   */
  showInlineHelp(deviceId, partialInput = '') {
    const session = this.getSession(deviceId);
    const entries = this.getContextHelp(deviceId, partialInput);
    this._appendLine(session, {
      type: 'input',
      prompt: this.getPrompt(deviceId),
      text: `${String(partialInput || '')}?`
    });
    const table = entries.slice(0, 14).map((c) => `  ${c.cmd.padEnd(28)} ${c.desc}`).join('\n');
    this._appendLine(session, { type: 'output', text: table || '  (tidak ada saran perintah)' });
    eventBus.emit('terminal:updated', { deviceId, session });
    return entries;
  }

  /**
   * Print Tab completion candidates cleanly in scrollback when multiple matches share a prefix.
   * @param {string} deviceId
   * @param {string} [partialInput='']
   * @param {string[]} [suggestions=[]]
   */
  showTabCandidates(deviceId, partialInput = '', suggestions = []) {
    const session = this.getSession(deviceId);
    if (!Array.isArray(suggestions) || suggestions.length === 0) return;
    this._appendLine(session, {
      type: 'input',
      prompt: this.getPrompt(deviceId),
      text: String(partialInput || '')
    });
    this._appendLine(session, { type: 'output', text: suggestions.join('    ') });
    eventBus.emit('terminal:updated', { deviceId, session });
  }

  _runCommandCore(deviceId, cmd) {
    const session = this.getSession(deviceId);
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    const activeOs = session.flavorOverride === 'auto'
      ? (session.osType === 'host-cmd' ? 'host-cmd' : this.simulator?.detectCliFlavor?.(cmd, dev?.brand, 'auto') || session.osType)
      : session.flavorOverride;

    if (activeOs === 'host-cmd') {
      return this._executeHostCmd(dev, cmd);
    }
    const simRes = this.simulator?.executeCliCommand?.(dev.id, cmd, activeOs) || {
      output: '% Simulator belum tersedia.',
      updated: false,
      flavor: activeOs
    };
    const isPingLike = /^(\/ping|ping|\/tool\s+traceroute|traceroute)\s+/i.test(cmd);
    const rawLines = simRes.output ? String(simRes.output).split('\n') : [];
    return {
      output: simRes.output || '',
      updated: Boolean(simRes.updated),
      osType: simRes.flavor || activeOs,
      pingResult: simRes.pingResult || null,
      streamLines: (isPingLike && rawLines.length > 2) ? rawLines : null
    };
  }

  /**
   * Execute a command interactively with progressive line streaming for ping/traceroute.
   * @param {string} deviceId
   * @param {string} rawCommand
   * @param {{ stepDelayMs?: number }} [options]
   */
  executeInteractive(deviceId, rawCommand, { stepDelayMs = 240 } = {}) {
    const session = this.getSession(deviceId);
    const cmd = String(rawCommand || '').trim();
    if (!cmd) {
      this.submitEmptyEnter(deviceId);
      return { output: '', updated: false, osType: session.osType, prompt: this.getPrompt(deviceId) };
    }

    if (this.isStreaming(deviceId)) {
      this.interrupt(deviceId);
    }

    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    const isStreamable = /^(ping|\/ping|tracert|traceroute|\/tool\s+traceroute)\s+/i.test(cmd);
    if (!isStreamable || !dev || dev.status === 'offline' || /^(cls|clear)$/i.test(cmd) || stepDelayMs <= 0) {
      return this.execute(deviceId, cmd);
    }

    const promptBefore = this.getPrompt(deviceId);
    if (session.history[session.history.length - 1] !== cmd) {
      session.history.push(cmd);
      if (session.history.length > 80) session.history.shift();
    }
    session.historyCursor = session.history.length;

    this._appendLine(session, { type: 'input', prompt: promptBefore, text: cmd });
    const result = this._runCommandCore(deviceId, cmd);

    if (result.pingResult) {
      this.getJobsheetEngine?.()?.recordPingResult?.(result.pingResult);
      eventBus.emit('topology:pdu-dispatched', {
        sourceId: dev.id,
        result: result.pingResult
      });
    }

    const chunks = Array.isArray(result.streamLines) && result.streamLines.length > 1
      ? result.streamLines
      : (result.output ? [result.output] : []);

    if (chunks.length <= 1) {
      if (chunks[0]) {
        const isErr = /^(%|failure:|invalid|error)/i.test(chunks[0].trim());
        this._appendLine(session, { type: isErr ? 'error' : 'output', text: chunks[0] });
      }
      eventBus.emit('terminal:updated', { deviceId, session, result });
      return { ...result, prompt: this.getPrompt(deviceId) };
    }

    // Emit header line immediately, then stream replies progressively
    this._appendLine(session, { type: 'output', text: chunks[0] });
    const timers = [];
    session.activeStream = { cmd, timers };
    eventBus.emit('terminal:updated', { deviceId, session, streaming: true });

    for (let i = 1; i < chunks.length; i++) {
      const lineText = chunks[i];
      const isLast = i === chunks.length - 1;
      const tid = setTimeout(() => {
        if (!session.activeStream) return;
        const isErrLine = /(timed out|unreachable|100%\s*loss|^%|failure:|error)/i.test(lineText.trim());
        this._appendLine(session, { type: isErrLine ? 'error' : 'output', text: lineText });
        if (isLast) {
          session.activeStream = null;
        }
        eventBus.emit('terminal:updated', { deviceId, session, streaming: !isLast, result: isLast ? result : null });
      }, i * stepDelayMs);
      timers.push(tid);
    }

    return {
      ...result,
      streaming: true,
      prompt: this.getPrompt(deviceId)
    };
  }

  /**
   * Execute a command inside a device's terminal session.
   * Returns both the command result and updates history + bufferLines.
   * @param {string} deviceId
   * @param {string} rawCommand
   */
  execute(deviceId, rawCommand) {
    const session = this.getSession(deviceId);
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    const cmd = String(rawCommand || '').trim();
    const promptBefore = this.getPrompt(deviceId);

    if (!cmd) {
      return { output: '', updated: false, osType: session.osType, prompt: promptBefore };
    }

    if (session.history[session.history.length - 1] !== cmd) {
      session.history.push(cmd);
      if (session.history.length > 80) session.history.shift();
    }
    session.historyCursor = session.history.length;

    if (/^(cls|clear)$/i.test(cmd)) {
      this.clear(deviceId);
      return { output: '', cleared: true, updated: false, osType: session.osType, prompt: this.getPrompt(deviceId) };
    }

    this._appendLine(session, { type: 'input', prompt: promptBefore, text: cmd });

    if (!dev) {
      const errText = '% Error: Perangkat tidak ditemukan.';
      this._appendLine(session, { type: 'error', text: errText });
      eventBus.emit('terminal:updated', { deviceId, session });
      return { output: errText, updated: false, osType: session.osType, prompt: promptBefore };
    }

    if (dev.status === 'offline') {
      const offMsg = `% Perangkat "${dev.name}" dalam keadaan mati (Power OFF). Nyalakan di tab Physical.`;
      this._appendLine(session, { type: 'error', text: offMsg });
      eventBus.emit('terminal:updated', { deviceId, session });
      return { output: offMsg, updated: false, osType: session.osType, prompt: promptBefore };
    }

    const result = this._runCommandCore(deviceId, cmd);

    if (result.output) {
      const isErr = /^(%|failure:|invalid|error)/i.test(result.output.trim());
      this._appendLine(session, { type: isErr ? 'error' : 'output', text: result.output });
    }

    if (result.pingResult) {
      this.getJobsheetEngine?.()?.recordPingResult?.(result.pingResult);
      eventBus.emit('topology:pdu-dispatched', {
        sourceId: dev.id,
        result: result.pingResult
      });
    }

    eventBus.emit('terminal:updated', { deviceId, session, result });
    return {
      ...result,
      prompt: this.getPrompt(deviceId)
    };
  }

  _executeHostCmd(dev, cmd) {
    const hostLabel = dev.network?.hostname || dev.name || dev.id;
    const ports = this.simulator?.getDevicePortList?.(dev) || [];
    const primaryPort = ports[0]?.name || 'eth0';

    if (cmd === '?' || /^help$/i.test(cmd)) {
      return {
        updated: false,
        osType: 'host-cmd',
        output: HOST_CMD_CATALOG.map((c) => `  ${c.cmd.padEnd(20)} ${c.desc}`).join('\n')
      };
    }

    if (/^hostname$/i.test(cmd)) {
      return { updated: false, osType: 'host-cmd', output: String(hostLabel) };
    }

    if (/^ver$/i.test(cmd)) {
      return { updated: false, osType: 'host-cmd', output: 'Microsoft Windows [Version 10.0.22631.4317]' };
    }

    if (/^whoami$/i.test(cmd)) {
      return { updated: false, osType: 'host-cmd', output: `smartschool\\${String(hostLabel).toLowerCase().replace(/\s+/g, '-')}` };
    }

    if (/^date$/i.test(cmd)) {
      return { updated: false, osType: 'host-cmd', output: `The current date is: ${new Date().toLocaleString('id-ID')}` };
    }

    if (/^echo\s+/i.test(cmd)) {
      return { updated: false, osType: 'host-cmd', output: cmd.slice(5) };
    }

    if (/^dir$/i.test(cmd)) {
      return {
        updated: false,
        osType: 'host-cmd',
        output: [
          ` Directory of C:\\Users\\${String(hostLabel).replace(/\s+/g, '-')}`,
          '',
          '25/11/2026  14:00    <DIR>          .',
          '25/11/2026  14:00    <DIR>          ..',
          '25/11/2026  13:45             1.024 network-config.txt',
          '25/11/2026  13:50    <DIR>          Downloads',
          '               1 File(s)          1.024 bytes'
        ].join('\n')
      };
    }

    if (/^(route\s+print|netstat\s+-rn)$/i.test(cmd)) {
      const ip = dev.network?.ip || '0.0.0.0';
      const mask = dev.network?.subnet || '255.255.255.0';
      const gw = dev.network?.gateway || 'On-link';
      return {
        updated: false,
        osType: 'host-cmd',
        output: [
          'IPv4 Route Table',
          '===========================================================================',
          'Active Routes:',
          'Network Destination        Netmask          Gateway       Interface  Metric',
          `          0.0.0.0          0.0.0.0    ${String(gw).padEnd(13)} ${String(ip).padEnd(15)} 25`,
          `        127.0.0.0        255.0.0.0          On-link       127.0.0.1    331`,
          `   ${String(ip).padEnd(14)} ${String(mask).padEnd(16)} On-link       ${String(ip).padEnd(15)} 281`,
          '==========================================================================='
        ].join('\n')
      };
    }

    const nslookupM = cmd.match(/^nslookup\s+([^\s]+)/i);
    if (nslookupM) {
      const query = nslookupM[1];
      const match = (this.deviceManager?.getAllDevices?.() || []).find((d) =>
        String(d.name || '').toLowerCase() === query.toLowerCase() ||
        String(d.network?.hostname || '').toLowerCase() === query.toLowerCase() ||
        String(d.network?.ip || '') === query
      );
      const dnsIp = dev.network?.dns || '8.8.8.8';
      return {
        updated: false,
        osType: 'host-cmd',
        output: match
          ? `Server:  dns.smartschool.local\nAddress:  ${dnsIp}\n\nName:    ${match.network?.hostname || match.name}\nAddress:  ${match.network?.ip || '0.0.0.0'}`
          : `Server:  dns.smartschool.local\nAddress:  ${dnsIp}\n\n*** dns.smartschool.local can't find ${query}: Non-existent domain`
      };
    }

    if (/^ipconfig\s+\/renew$/i.test(cmd)) {
      const lease = this.simulator?.requestDhcpLease?.(dev.id, primaryPort);
      return {
        updated: Boolean(lease?.success),
        osType: 'host-cmd',
        output: lease?.steps ? lease.steps.join('\n') : 'DHCP request gagal: simulator tidak tersedia.'
      };
    }

    if (/^ipconfig\s+\/release$/i.test(cmd)) {
      this.simulator?.removeInterfaceIp?.(dev.id, primaryPort);
      this.deviceManager?.updateDevice?.(dev.id, {
        network: { ip: '', gateway: '', connectionMode: 'dhcp' }
      });
      return {
        updated: true,
        osType: 'host-cmd',
        output: `Windows IP Configuration\n\nEthernet adapter ${primaryPort}:\n   IPv4 Address. . . . . . . . . . . : 0.0.0.0 (Released)`
      };
    }

    if (/^ipconfig(\s+\/all)?$/i.test(cmd)) {
      const showAll = /\/all/i.test(cmd);
      const ifEntries = ports.map((p) => {
        const cfg = this.simulator?.getEffectiveInterfaceConfig?.(dev, p.name) || {};
        return [
          `Adapter ${p.name} (${p.type || 'rj45'}):`,
          `   Connection Status . . . . . . . : ${cfg.status === 'down' ? 'Disabled' : 'Media Connected'}`,
          ...(showAll ? [
            `   Physical Address (MAC). . . . . : ${dev.network?.mac || '02:00:5E:10:00:01'}`,
            `   DHCP Enabled. . . . . . . . . . : ${dev.network?.connectionMode === 'dhcp' || cfg.dhcpClient ? 'Yes' : 'No'}`
          ] : []),
          `   IPv4 Address. . . . . . . . . . : ${cfg.ip || dev.network?.ip || '(belum diatur)'}`,
          `   Subnet Mask . . . . . . . . . . : ${cfg.subnet || dev.network?.subnet || '255.255.255.0'}`,
          `   Default Gateway . . . . . . . . : ${dev.network?.gateway || '(kosong)'}`,
          ...(showAll ? [`   DNS Servers . . . . . . . . . . : ${dev.network?.dns || '(kosong)'}`] : [])
        ].join('\n');
      });
      return {
        updated: false,
        osType: 'host-cmd',
        output: `Windows IP Configuration (${hostLabel})\n\n${ifEntries.join('\n\n')}`
      };
    }

    if (/^arp\s+-a$/i.test(cmd)) {
      const all = (this.deviceManager?.getAllDevices?.() || []).filter((d) => d.network?.ip);
      const rows = all.slice(0, 10).map((d) =>
        `  ${String(d.network.ip).padEnd(16)} ${String(d.network.mac || '02-00-5e-11-22-33').padEnd(20)} dynamic (${d.name})`
      );
      return {
        updated: false,
        osType: 'host-cmd',
        output: `Interface: ${dev.network?.ip || '0.0.0.0'}\n  Internet Address      Physical Address      Type\n${rows.join('\n') || '  No ARP Entries Found.'}`
      };
    }

    const pingM = cmd.match(/^ping\s+([^\s]+)/i);
    if (pingM) {
      const target = pingM[1];
      const pingRes = this.simulator?.simulatePing?.(dev.id, target);
      if (!pingRes) {
        return { updated: false, osType: 'host-cmd', output: 'Ping gagal: Simulator tidak tersedia.' };
      }
      if (pingRes.success) {
        const baseRtt = Math.max(0.4, Number(pingRes.latencyMs) || 1.5);
        const rtts = [0, 0.2, -0.1, 0.1].map((delta) => Number(Math.max(0.3, baseRtt + delta).toFixed(1)));
        const minRtt = Math.min(...rtts);
        const maxRtt = Math.max(...rtts);
        const avgRtt = Number((rtts.reduce((a, b) => a + b, 0) / rtts.length).toFixed(1));
        const header = `Pinging ${pingRes.targetIp} with 32 bytes of data:`;
        const replyLines = rtts.map((ms) => `Reply from ${pingRes.targetIp}: bytes=32 time=${ms}ms TTL=${pingRes.ttl}`);
        const stats = [
          '',
          `Ping statistics for ${pingRes.targetIp}:`,
          '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
          'Approximate round trip times in milli-seconds:',
          `    Minimum = ${minRtt}ms, Maximum = ${maxRtt}ms, Average = ${avgRtt}ms`
        ].join('\n');
        const streamLines = [header, ...replyLines, stats];
        return { updated: false, osType: 'host-cmd', output: streamLines.join('\n'), streamLines, pingResult: pingRes };
      }
      const headerFail = `Pinging ${target} with 32 bytes of data:`;
      const failLines = [
        'Request timed out.',
        'Request timed out.',
        'Request timed out.',
        'Request timed out.'
      ];
      const failStats = [
        '',
        `Ping statistics for ${target}:`,
        `    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss) -- ${pingRes.reason || 'Destination host unreachable'}`
      ].join('\n');
      const streamLines = [headerFail, ...failLines, failStats];
      return { updated: false, osType: 'host-cmd', output: streamLines.join('\n'), streamLines, pingResult: pingRes };
    }

    const traceM = cmd.match(/^tracert?\s+([^\s]+)|^traceroute\s+([^\s]+)/i);
    if (traceM) {
      const target = traceM[1] || traceM[2];
      const tr = this.simulator?.simulateTraceroute?.(dev.id, target);
      if (!tr) {
        return { updated: false, osType: 'host-cmd', output: 'Traceroute gagal: Simulator tidak tersedia.' };
      }
      const header = `Tracing route to ${target} over a maximum of 30 hops:`;
      const hopLines = (tr.traceHops || []).map((h) => {
        const ms = String(h.rttMs).padEnd(5);
        return `  ${String(h.hopIndex).padStart(2)}   ${ms} ms   ${ms} ms   ${ms} ms  ${h.ip} [${h.deviceName}]`;
      });
      const footer = `\nTrace complete (${tr.success ? 'REACHABLE' : tr.reason}).`;
      const streamLines = [header, ...hopLines, footer];
      return {
        updated: false,
        osType: 'host-cmd',
        output: streamLines.join('\n'),
        streamLines,
        pingResult: tr
      };
    }

    // Fallback: allow Cisco/MikroTik commands if user explicitly runs them
    const fallback = this.simulator?.executeCliCommand?.(dev.id, cmd, 'auto');
    if (fallback && !String(fallback.output || '').startsWith('% Invalid input')) {
      return {
        output: fallback.output,
        updated: Boolean(fallback.updated),
        osType: fallback.flavor || 'host-cmd',
        pingResult: fallback.pingResult || null
      };
    }

    return {
      updated: false,
      osType: 'host-cmd',
      output: `'${cmd}' tidak dikenali sebagai perintah Host CMD. Ketik "help" untuk daftar perintah.`
    };
  }

  /**
   * Tab Autocomplete for current device OS flavor + port names.
   * @param {string} deviceId
   * @param {string} partialInput
   * @returns {{ completed: string, suggestions: string[] }}
   */
  complete(deviceId, partialInput = '') {
    const raw = String(partialInput || '');
    const lower = raw.trim().toLowerCase();
    const session = this.getSession(deviceId);
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    const ports = this.simulator?.getDevicePortList?.(dev) || [];

    const activeOs = session.flavorOverride === 'auto' ? session.osType : session.flavorOverride;
    const catalog =
      activeOs === 'host-cmd'
        ? HOST_CMD_CATALOG
        : activeOs === 'mikrotik'
          ? MIKROTIK_CMD_CATALOG
          : CISCO_CMD_CATALOG;

    const candidates = [
      ...catalog.map((c) => c.cmd),
      ...ports.map((p) => `interface ${p.name}`)
    ];

    if (!lower) {
      return { completed: raw, suggestions: candidates.slice(0, 8) };
    }

    const matches = candidates.filter((c) => c.toLowerCase().startsWith(lower));
    if (matches.length === 1) {
      return { completed: matches[0], suggestions: matches };
    }
    if (matches.length > 1) {
      // Longest common prefix among matches
      let prefix = matches[0];
      for (let i = 1; i < matches.length; i++) {
        while (!matches[i].toLowerCase().startsWith(prefix.toLowerCase()) && prefix.length > 0) {
          prefix = prefix.slice(0, -1);
        }
      }
      return {
        completed: prefix.length > raw.length ? prefix : raw,
        suggestions: matches.slice(0, 8)
      };
    }
    return { completed: raw, suggestions: [] };
  }

  /**
   * Return context-sensitive command help entries matching partial input.
   * @param {string} deviceId
   * @param {string} [partialInput='']
   * @returns {Array<{ cmd: string, desc: string }>}
   */
  getContextHelp(deviceId, partialInput = '') {
    const lower = String(partialInput || '').trim().toLowerCase();
    const session = this.getSession(deviceId);
    const activeOs = session.flavorOverride === 'auto' ? session.osType : session.flavorOverride;
    const catalog =
      activeOs === 'host-cmd'
        ? HOST_CMD_CATALOG
        : activeOs === 'mikrotik'
          ? MIKROTIK_CMD_CATALOG
          : CISCO_CMD_CATALOG;

    if (!lower) return catalog.slice();
    const filtered = catalog.filter((c) => c.cmd.toLowerCase().startsWith(lower));
    return filtered.length > 0 ? filtered : catalog.slice();
  }

  /**
   * Navigate per-device command history (-1 = older, +1 = newer).
   * @param {string} deviceId
   * @param {number} direction
   * @returns {string}
   */
  navigateHistory(deviceId, direction = -1) {
    const session = this.getSession(deviceId);
    if (session.history.length === 0) return '';
    if (direction < 0) {
      session.historyCursor = Math.max(0, session.historyCursor - 1);
      return session.history[session.historyCursor] || '';
    }
    session.historyCursor = Math.min(session.history.length, session.historyCursor + 1);
    return session.historyCursor >= session.history.length ? '' : (session.history[session.historyCursor] || '');
  }
}
