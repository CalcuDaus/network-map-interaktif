/**
 * NetMap — Deterministic L1–L3 Network Simulation & Dual CLI Engine
 * Mendukung inspeksi PDU OSI Layer 1–3, Ping, Traceroute, Wireless association,
 * validasi VLAN/IPv4/Gateway, serta CLI Cisco IOS & MikroTik RouterOS.
 */

import { eventBus } from '../core/event-bus.js';

const ROUTER_TYPES = new Set([
  'router',
  'main-router',
  'firewall',
  'gateway',
  'mikrotik-ccr2116',
  'mikrotik-ccr2004',
  'mikrotik-rb5009',
  'mikrotik-rb4011',
  'mikrotik-l009',
  'mikrotik-hex',
  'ruijie-eg210g',
  'ruijie-eg310gh',
  'ruijie-nbr6210',
  'tplink-er605',
  'tplink-er7206'
]);

const SWITCH_TYPES = new Set([
  'core-switch',
  'dist-switch',
  'switch',
  'switch-managed',
  'switch-unmanaged',
  'ruijie-s2910',
  'ruijie-nbs3100',
  'ruijie-es208gc',
  'tplink-sg2428p',
  'tplink-sg108'
]);

/**
 * Parse IPv4 string (supports optional /CIDR suffix or explicit mask).
 * @param {string} ipInput
 * @param {string} [subnetMask]
 * @returns {{ ip: string, prefix: number, maskInt: number, ipInt: number, networkInt: number, maskStr: string } | null}
 */
export function parseIpv4Cidr(ipInput, subnetMask = '') {
  const raw = String(ipInput || '').trim();
  if (!raw) return null;
  const parts = raw.split('/');
  const ipStr = parts[0].trim();
  const octets = ipStr.split('.');
  if (octets.length !== 4) return null;
  const nums = octets.map((o) => Number(o));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;

  let prefix = 24;
  if (parts[1] !== undefined) {
    const parsedPrefix = Number(parts[1]);
    if (!Number.isInteger(parsedPrefix) || parsedPrefix < 0 || parsedPrefix > 32) return null;
    prefix = parsedPrefix;
  } else if (subnetMask) {
    const maskOcts = String(subnetMask).trim().split('.').map(Number);
    if (maskOcts.length === 4 && maskOcts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const mInt = ((maskOcts[0] << 24) | (maskOcts[1] << 16) | (maskOcts[2] << 8) | maskOcts[3]) >>> 0;
      let count = 0;
      for (let bit = 31; bit >= 0; bit--) {
        if ((mInt >>> bit) & 1) count++;
        else break;
      }
      prefix = count;
    }
  }

  const ipInt = ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
  const maskInt = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const maskStr = [
    (maskInt >>> 24) & 255,
    (maskInt >>> 16) & 255,
    (maskInt >>> 8) & 255,
    maskInt & 255
  ].join('.');

  return { ip: ipStr, prefix, maskInt, ipInt, networkInt, maskStr };
}

function isRouterDevice(dev) {
  if (!dev) return false;
  const type = String(dev.type || '').toLowerCase();
  return (
    ROUTER_TYPES.has(type) ||
    type.includes('router') ||
    type.includes('firewall') ||
    type.includes('gateway') ||
    dev.category === 'core'
  );
}

function isSwitchDevice(dev) {
  if (!dev) return false;
  const type = String(dev.type || '').toLowerCase();
  return SWITCH_TYPES.has(type) || type.includes('switch');
}

function isApDevice(dev) {
  if (!dev) return false;
  const type = String(dev.type || '').toLowerCase();
  return type === 'access-point' || type.includes('ap') || type.includes('wifi');
}

export class NetworkSimulator {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   */
  constructor({ deviceManager, cableManager, map3DEngine = null } = {}) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.map3DEngine = map3DEngine;
    this.lastResult = null;
    this.staticRoutes = new Map(); // deviceId -> [{ dstNetwork, prefix, nextHop }]
  }

  _getDeviceList() {
    return this.deviceManager?.getAllDevices?.() || [];
  }

  _findDevice(idOrIp) {
    const needle = String(idOrIp || '').trim();
    if (!needle) return null;
    const byId = this.deviceManager?.getDeviceById?.(needle);
    if (byId) return byId;
    const all = this._getDeviceList();
    return (
      all.find((d) => String(d.network?.ip || '').split('/')[0].trim() === needle) ||
      all.find((d) => String(d.network?.hostname || '').toLowerCase() === needle.toLowerCase()) ||
      all.find((d) => String(d.name || '').toLowerCase() === needle.toLowerCase()) ||
      null
    );
  }

  /**
   * Build active L1/L2 adjacency graph from cables + Access Point wireless coverage.
   * @returns {Map<string, Array<{ neighborId: string, medium: string, cableId?: string, label: string }>>}
   */
  buildAdjacencyGraph() {
    const graph = new Map();
    const devices = this._getDeviceList();
    devices.forEach((d) => graph.set(d.id, []));

    const cables = this.cableManager?.getAllConnections?.() || [];
    cables.forEach((cab) => {
      if (!cab || cab.status === 'offline' || cab.status === 'cut') return;
      const src = this.deviceManager?.getDeviceById?.(cab.source);
      const dst = this.deviceManager?.getDeviceById?.(cab.destination);
      if (!src || !dst || src.status === 'offline' || dst.status === 'offline') return;

      const label = cab.name || `${cab.details?.portSource || 'port'} ↔ ${cab.details?.portDestination || 'port'}`;
      graph.get(src.id)?.push({
        neighborId: dst.id,
        medium: cab.type || 'utp',
        cableId: cab.id,
        label
      });
      graph.get(dst.id)?.push({
        neighborId: src.id,
        medium: cab.type || 'utp',
        cableId: cab.id,
        label
      });
    });

    // Wireless AP association based on wirelessCoverage.radiusMeters
    const mapMeters = Number(this.cableManager?.mapWidthMeters) || 170;
    const aps = devices.filter((d) => isApDevice(d) && d.status !== 'offline' && d.wirelessCoverage?.enabled !== false);
    aps.forEach((ap) => {
      const radiusMeters = Number(ap.wirelessCoverage?.radiusMeters) || 25;
      const ax = (ap.position?.x ?? 0.5) * mapMeters;
      const ay = (ap.position?.y ?? 0.5) * mapMeters;
      devices.forEach((client) => {
        if (client.id === ap.id || client.status === 'offline' || isApDevice(client)) return;
        const alreadyWired = graph.get(ap.id)?.some((e) => e.neighborId === client.id);
        if (alreadyWired) return;
        const cx = (client.position?.x ?? 0.5) * mapMeters;
        const cy = (client.position?.y ?? 0.5) * mapMeters;
        const dist = Math.hypot(cx - ax, cy - ay);
        if (dist <= radiusMeters) {
          const edgeLabel = `WiFi ${ap.name} (${dist.toFixed(1)}m)`;
          graph.get(ap.id)?.push({ neighborId: client.id, medium: 'wireless', label: edgeLabel });
          graph.get(client.id)?.push({ neighborId: ap.id, medium: 'wireless', label: edgeLabel });
        }
      });
    });

    return graph;
  }

  _findShortestPath(sourceId, targetId) {
    const graph = this.buildAdjacencyGraph();
    if (!graph.has(sourceId) || !graph.has(targetId)) return null;
    if (sourceId === targetId) return { nodeIds: [sourceId], edges: [] };

    const queue = [[sourceId]];
    const visited = new Set([sourceId]);
    const edgeUsed = new Map();

    while (queue.length > 0) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      const neighbors = graph.get(cur) || [];
      for (const edge of neighbors) {
        if (visited.has(edge.neighborId)) continue;
        visited.add(edge.neighborId);
        edgeUsed.set(`${cur}->${edge.neighborId}`, edge);
        const nextPath = [...path, edge.neighborId];
        if (edge.neighborId === targetId) {
          const edges = [];
          for (let i = 0; i < nextPath.length - 1; i++) {
            edges.push(edgeUsed.get(`${nextPath[i]}->${nextPath[i + 1]}`));
          }
          return { nodeIds: nextPath, edges };
        }
        queue.push(nextPath);
      }
    }
    return null;
  }

  /**
   * Simulate an ICMP Echo Request/Reply across physical & logical L1-L3 state.
   * @param {string} sourceId
   * @param {string} targetIdOrIp
   * @returns {Object}
   */
  simulatePing(sourceId, targetIdOrIp) {
    const src = this._findDevice(sourceId);
    const dst = this._findDevice(targetIdOrIp);

    if (!src) {
      const res = {
        success: false,
        sourceId,
        targetId: targetIdOrIp,
        hops: [],
        reason: 'Perangkat sumber tidak ditemukan.',
        osiLayers: { l1: 'FAIL — Source missing', l2: 'N/A', l3: 'N/A' },
        summary: 'Ping gagal: sumber tidak ditemukan.'
      };
      this.lastResult = res;
      return res;
    }

    if (src.status === 'offline') {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: dst?.id || targetIdOrIp,
        hops: [src.id],
        reason: `Perangkat sumber "${src.name}" sedang OFFLINE / mati.`,
        osiLayers: { l1: `DOWN — ${src.name} status offline`, l2: 'Blocked', l3: 'No interface up' },
        summary: `Request failed: ${src.name} sedang offline.`
      };
      this.lastResult = res;
      return res;
    }

    if (!dst) {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: targetIdOrIp,
        hops: [src.id],
        reason: `Host tujuan "${targetIdOrIp}" tidak ditemukan di topologi.`,
        osiLayers: { l1: 'OK', l2: 'ARP unresolved', l3: `Request timed out ke ${targetIdOrIp}` },
        summary: `Destination host "${targetIdOrIp}" unreachable.`
      };
      this.lastResult = res;
      return res;
    }

    if (dst.status === 'offline') {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: dst.id,
        targetIp: dst.network?.ip || '',
        hops: [src.id],
        reason: `Tujuan "${dst.name}" sedang OFFLINE.`,
        osiLayers: { l1: `Link down di ${dst.name}`, l2: 'No MAC response', l3: 'Request timed out' },
        summary: `Request timed out: ${dst.name} dalam status offline.`
      };
      this.lastResult = res;
      return res;
    }

    const srcNet = parseIpv4Cidr(src.network?.ip, src.network?.subnet);
    const dstNet = parseIpv4Cidr(dst.network?.ip, dst.network?.subnet);
    if (!srcNet || !dstNet) {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: dst.id,
        hops: [src.id],
        reason: !srcNet
          ? `IP address pada "${src.name}" belum dikonfigurasi.`
          : `IP address pada "${dst.name}" belum dikonfigurasi.`,
        osiLayers: { l1: 'Up', l2: 'Up', l3: 'FAIL — Alamat IPv4 tidak valid/kosong' },
        summary: 'Ping gagal: alamat IP sumber atau tujuan belum dikonfigurasi.'
      };
      this.lastResult = res;
      return res;
    }

    const pathRes = this._findShortestPath(src.id, dst.id);
    if (!pathRes) {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: dst.id,
        targetIp: dstNet.ip,
        hops: [src.id],
        reason: `Tidak ada jalur fisik kabel/WiFi aktif antara "${src.name}" dan "${dst.name}".`,
        osiLayers: {
          l1: 'DISCONNECTED — Kabel putus / belum tersambung',
          l2: 'No switched/wireless path',
          l3: 'No route to host'
        },
        summary: `Destination unreachable: sambungkan kabel antara ${src.name} dan ${dst.name}.`
      };
      this.lastResult = res;
      return res;
    }

    const hopDevices = pathRes.nodeIds.map((id) => this.deviceManager.getDeviceById(id)).filter(Boolean);
    const sameSubnet = srcNet.networkInt === dstNet.networkInt && srcNet.prefix === dstNet.prefix;
    const hasRouterInPath = hopDevices.some((d) => isRouterDevice(d));
    const srcVlan = Number(src.network?.vlan || 1);
    const dstVlan = Number(dst.network?.vlan || 1);

    // Inter-subnet or inter-VLAN requires at least one Router/L3 Gateway along the path
    if (!sameSubnet && !hasRouterInPath) {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: dst.id,
        targetIp: dstNet.ip,
        hops: pathRes.nodeIds,
        reason: `Beda subnet (${srcNet.ip}/${srcNet.prefix} vs ${dstNet.ip}/${dstNet.prefix}) tanpa Router/Gateway L3 di jalur.`,
        osiLayers: {
          l1: `OK (${pathRes.edges.length} hop fisik)`,
          l2: `Switching OK (VLAN ${srcVlan})`,
          l3: 'FAIL — Beda subnet tanpa routing L3 / Default Gateway'
        },
        summary: `Ping gagal di Layer 3: berbeda subnet tanpa Router di antara ${src.name} dan ${dst.name}.`
      };
      this.lastResult = res;
      return res;
    }

    if (sameSubnet && srcVlan !== dstVlan && !hasRouterInPath) {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: dst.id,
        targetIp: dstNet.ip,
        hops: pathRes.nodeIds,
        reason: `Isolasi VLAN: "${src.name}" di VLAN ${srcVlan} sedangkan "${dst.name}" di VLAN ${dstVlan} tanpa Router-on-a-Stick.`,
        osiLayers: {
          l1: `OK (${pathRes.edges.length} hop fisik)`,
          l2: `BLOCKED — Mismatch VLAN ${srcVlan} ≠ VLAN ${dstVlan}`,
          l3: 'ARP gagal melintasi broadcast domain'
        },
        summary: `Ping diblokir oleh VLAN (${srcVlan} ≠ ${dstVlan}) tanpa routing antar-VLAN.`
      };
      this.lastResult = res;
      return res;
    }

    const hopMedia = pathRes.edges.map((e) => e.medium).join(' → ') || 'local';
    const hasFiber = pathRes.edges.some((e) => String(e.medium).includes('fiber'));
    const hasWifi = pathRes.edges.some((e) => e.medium === 'wireless');
    const latencyMs = Number(
      (0.8 + pathRes.edges.length * (hasWifi ? 2.8 : hasFiber ? 0.45 : 0.9)).toFixed(2)
    );
    const ttl = Math.max(1, 64 - Math.max(0, pathRes.nodeIds.length - 1));

    const res = {
      success: true,
      sourceId: src.id,
      targetId: dst.id,
      sourceIp: srcNet.ip,
      targetIp: dstNet.ip,
      hops: pathRes.nodeIds,
      edges: pathRes.edges,
      latencyMs,
      ttl,
      osiLayers: {
        l1: `UP — ${pathRes.edges.length} segmen (${hopMedia})`,
        l2: `FORWARDED — VLAN ${srcVlan}${dstVlan !== srcVlan ? ` → Routed → VLAN ${dstVlan}` : ''} (${hopDevices.map((d) => d.network?.mac || d.name).join(' ➔ ')})`,
        l3: `ICMP Echo Reply from ${dstNet.ip}: bytes=32 time=${latencyMs}ms TTL=${ttl}`
      },
      summary: `Reply from ${dstNet.ip}: time=${latencyMs}ms TTL=${ttl} (${pathRes.nodeIds.length} node)`
    };

    this.lastResult = res;
    eventBus.emit('simulator:ping-completed', res);
    return res;
  }

  /**
   * Simulate hop-by-hop Traceroute from source to target.
   * @param {string} sourceId
   * @param {string} targetIdOrIp
   */
  simulateTraceroute(sourceId, targetIdOrIp) {
    const ping = this.simulatePing(sourceId, targetIdOrIp);
    const traceHops = (ping.hops || []).map((devId, idx) => {
      const dev = this.deviceManager?.getDeviceById?.(devId);
      const rttMs = Number((0.4 + idx * 0.9).toFixed(2));
      return {
        hopIndex: idx + 1,
        deviceId: devId,
        deviceName: dev?.name || devId,
        ip: dev?.network?.ip || '--',
        rttMs
      };
    });
    return {
      ...ping,
      traceHops
    };
  }

  /**
   * Detect whether raw CLI input looks like Cisco IOS or MikroTik RouterOS.
   * @param {string} cmd
   * @param {string} [deviceBrand]
   * @param {'auto'|'cisco'|'mikrotik'} [flavor]
   */
  detectCliFlavor(cmd, deviceBrand = '', flavor = 'auto') {
    if (flavor === 'cisco' || flavor === 'mikrotik') return flavor;
    const trimmed = String(cmd || '').trim();
    if (trimmed.startsWith('/')) return 'mikrotik';
    if (/^(show|enable|conf|hostname|ip address|vlan|no shutdown|copy run)/i.test(trimmed)) return 'cisco';
    return String(deviceBrand || '').toLowerCase().includes('mikrotik') ? 'mikrotik' : 'cisco';
  }

  /**
   * Execute a dual-syntax (Cisco IOS & MikroTik RouterOS) CLI command on a target device.
   * @param {string} deviceId
   * @param {string} rawCommand
   * @param {'auto'|'cisco'|'mikrotik'} [flavor]
   * @returns {{ output: string, updated: boolean, flavor: string, pingResult?: Object }}
   */
  executeCliCommand(deviceId, rawCommand, flavor = 'auto') {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    const cmd = String(rawCommand || '').trim();
    if (!dev) {
      return { output: '% Error: Pilih perangkat terlebih dahulu.', updated: false, flavor: 'cisco' };
    }
    if (!cmd) {
      return { output: '', updated: false, flavor: 'cisco' };
    }

    const activeFlavor = this.detectCliFlavor(cmd, dev.brand, flavor);
    const hostLabel = dev.network?.hostname || dev.name || dev.id;
    const curIp = dev.network?.ip || 'unassigned';
    const curMask = dev.network?.subnet || '255.255.255.0';
    const curVlan = dev.network?.vlan || 1;

    if (cmd === '?' || cmd.toLowerCase() === 'help') {
      return {
        updated: false,
        flavor: activeFlavor,
        output: [
          '=== Daftar Perintah CLI Dual Mode ===',
          'Cisco IOS   : show ip interface brief | show vlan brief | show arp | hostname <nama> | ip address <ip> [mask] | vlan <id> | ping <ip> | traceroute <ip>',
          'MikroTik ROS: /ip address print | /ip address add address=<ip/cidr> | /interface print | /system identity set name=<nama> | /ping <ip> | /tool traceroute <ip>'
        ].join('\n')
      };
    }

    // Ping & Traceroute (both Cisco & MikroTik syntax)
    const pingMatch = cmd.match(/^\/?ping\s+([^\s]+)/i);
    if (pingMatch) {
      const targetToken = pingMatch[1].replace(/^address=/i, '');
      const pingRes = this.simulatePing(dev.id, targetToken);
      const out = pingRes.success
        ? `Pinging ${pingRes.targetIp} from ${hostLabel}:\nReply from ${pingRes.targetIp}: bytes=32 time=${pingRes.latencyMs}ms TTL=${pingRes.ttl}\n[OSI L3] ${pingRes.osiLayers.l3}`
        : `Pinging ${targetToken} from ${hostLabel}:\n% Ping gagal: ${pingRes.reason}`;
      return { output: out, updated: false, flavor: activeFlavor, pingResult: pingRes };
    }

    const traceMatch = cmd.match(/^(?:\/tool\s+)?traceroute\s+([^\s]+)/i);
    if (traceMatch) {
      const tr = this.simulateTraceroute(dev.id, traceMatch[1]);
      const lines = tr.traceHops.map((h) => `  ${h.hopIndex}   ${h.rttMs} ms   ${h.ip} (${h.deviceName})`);
      return {
        output: `Tracing route to ${traceMatch[1]}:\n${lines.join('\n')}\nStatus: ${tr.success ? 'REACHABLE' : tr.reason}`,
        updated: false,
        flavor: activeFlavor,
        pingResult: tr
      };
    }

    // MikroTik RouterOS commands
    if (activeFlavor === 'mikrotik') {
      if (/^\/ip\s+address\s+print/i.test(cmd)) {
        return {
          updated: false,
          flavor: 'mikrotik',
          output: `Flags: X - disabled, I - invalid, D - dynamic\n #   ADDRESS            NETWORK         INTERFACE\n 0   ${curIp}${String(curIp).includes('/') ? '' : '/24'}   ${dev.network?.gateway || '--'}   ether1 (VLAN ${curVlan})`
        };
      }

      const rosIpMatch = cmd.match(/^\/ip\s+address\s+add\s+.*address=([0-9.]+)(?:\/(\d+))?/i);
      if (rosIpMatch) {
        const parsed = parseIpv4Cidr(`${rosIpMatch[1]}/${rosIpMatch[2] || 24}`);
        if (!parsed) {
          return { output: 'failure: invalid IPv4 CIDR address', updated: false, flavor: 'mikrotik' };
        }
        this.deviceManager.updateDevice(dev.id, {
          network: { ip: parsed.ip, subnet: parsed.maskStr }
        });
        return {
          updated: true,
          flavor: 'mikrotik',
          output: `[admin@${hostLabel}] > IP ${parsed.ip}/${parsed.prefix} (${parsed.maskStr}) berhasil diterapkan.`
        };
      }

      const rosIdentityMatch = cmd.match(/^\/system\s+identity\s+set\s+name=([^\s]+)/i);
      if (rosIdentityMatch) {
        const nextName = rosIdentityMatch[1].replace(/^["']|["']$/g, '');
        this.deviceManager.updateDevice(dev.id, {
          network: { hostname: nextName }
        });
        return {
          updated: true,
          flavor: 'mikrotik',
          output: `[admin@${nextName}] > system identity diperbarui ke "${nextName}".`
        };
      }

      if (/^\/interface\s+print/i.test(cmd)) {
        const ports = dev.ports || [];
        const lines = ports.length > 0
          ? ports.map((p, idx) => ` ${idx}  ${p.status === 'offline' ? 'X' : 'R'}  ${p.name}    ${p.type || 'ether'}   MTU=1500`)
          : [` 0  R  ether1   ether   MTU=1500`];
        return {
          updated: false,
          flavor: 'mikrotik',
          output: `Flags: D - dynamic, X - disabled, R - running\n #     NAME     TYPE    ACTUAL-MTU\n${lines.join('\n')}`
        };
      }
    }

    // Cisco IOS commands
    if (/^enable$/i.test(cmd)) {
      return { updated: false, flavor: 'cisco', output: `${hostLabel}#` };
    }

    if (/^show\s+ip\s+int(?:erface)?\s+brief/i.test(cmd)) {
      const st = dev.status === 'offline' ? 'administratively down' : 'up';
      return {
        updated: false,
        flavor: 'cisco',
        output: `Interface              IP-Address      OK? Method Status                Protocol\nGigabitEthernet0/0     ${curIp.padEnd(15)} YES manual ${st.padEnd(21)} ${st}\nVlan${String(curVlan).padEnd(19)}${curIp.padEnd(15)} YES manual ${st.padEnd(21)} ${st}`
      };
    }

    if (/^show\s+vlan\s+brief/i.test(cmd)) {
      return {
        updated: false,
        flavor: 'cisco',
        output: `VLAN Name                             Status    Ports\n---- -------------------------------- --------- -------------------------------\n${String(curVlan).padEnd(4)} VLAN_${String(curVlan).padEnd(27)} active    ${(dev.ports || []).map((p) => p.name).slice(0, 4).join(', ') || 'Gi0/1, Gi0/2'}`
      };
    }

    if (/^show\s+arp/i.test(cmd)) {
      const all = this._getDeviceList().filter((d) => d.network?.ip);
      const lines = all.slice(0, 8).map((d) => `Internet  ${String(d.network.ip).padEnd(16)} -   ${d.network.mac || '0000.0c11.2233'}  ARPA   ${d.name}`);
      return {
        updated: false,
        flavor: 'cisco',
        output: `Protocol  Address          Age (min)  Hardware Addr   Type   Interface\n${lines.join('\n') || '(tabel ARP kosong)'}`
      };
    }

    if (/^show\s+run(?:ning-config)?/i.test(cmd)) {
      return {
        updated: false,
        flavor: 'cisco',
        output: [
          `! Running config for ${dev.name}`,
          `hostname ${hostLabel}`,
          `interface GigabitEthernet0/0`,
          ` ip address ${curIp} ${curMask}`,
          ` switchport access vlan ${curVlan}`,
          ` no shutdown`,
          `end`
        ].join('\n')
      };
    }

    const hostMatch = cmd.match(/^hostname\s+([^\s]+)/i);
    if (hostMatch) {
      const nextHost = hostMatch[1];
      this.deviceManager.updateDevice(dev.id, { network: { hostname: nextHost } });
      return { updated: true, flavor: 'cisco', output: `${nextHost}(config)# Hostname diubah ke "${nextHost}".` };
    }

    const ipMatch = cmd.match(/^ip\s+address\s+([0-9.]+)(?:\s+([0-9.]+))?/i);
    if (ipMatch) {
      const parsed = parseIpv4Cidr(ipMatch[1], ipMatch[2] || curMask);
      if (!parsed) {
        return { output: '% Invalid IP address or subnet mask.', updated: false, flavor: 'cisco' };
      }
      this.deviceManager.updateDevice(dev.id, {
        network: { ip: parsed.ip, subnet: parsed.maskStr }
      });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config-if)# IPv4 diset ke ${parsed.ip} ${parsed.maskStr}`
      };
    }

    const vlanMatch = cmd.match(/^vlan\s+(\d+)/i);
    if (vlanMatch) {
      const nextVlan = Number(vlanMatch[1]);
      if (nextVlan < 1 || nextVlan > 4094) {
        return { output: '% VLAN ID harus antara 1 - 4094.', updated: false, flavor: 'cisco' };
      }
      this.deviceManager.updateDevice(dev.id, { network: { vlan: nextVlan } });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config-vlan)# Perangkat dipindahkan ke VLAN ${nextVlan}.`
      };
    }

    return {
      updated: false,
      flavor: activeFlavor,
      output: `% Invalid input detected at "${cmd}". Ketik "help" untuk daftar perintah Cisco IOS & MikroTik.`
    };
  }
}
