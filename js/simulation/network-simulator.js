/**
 * NetMap — Deterministic L1–L3+ Network Simulation & Dual CLI Engine
 * Mendukung inspeksi PDU OSI Layer 1–3+, per-interface IP/VLAN/Access/Trunk,
 * validasi Gateway & Static Route, DHCP Server/Client (DORA), NAT Masquerade,
 * Ping/Traceroute, Wireless association, serta CLI Cisco IOS & MikroTik RouterOS.
 */

import { eventBus } from '../core/event-bus.js';
import { getDefaultDevicePorts } from '../devices/device-schema.js';

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
  'managed-switch',
  'unmanaged-switch',
  'poe-switch',
  'mikrotik-crs317',
  'mikrotik-crs326',
  'mikrotik-crs328',
  'mikrotik-crs310',
  'ruijie-s2910',
  'ruijie-s5750',
  'ruijie-nbs5200',
  'ruijie-nbs3100',
  'ruijie-nbs3100-poe',
  'ruijie-es208gc',
  'ruijie-es209gc',
  'ruijie-es218gc',
  'tplink-ls1005g',
  'tplink-sg1008d',
  'tplink-sg108e',
  'tplink-sg108pe',
  'tplink-sg1016d',
  'tplink-sg1024d',
  'tplink-sg1218mp',
  'tplink-sg2210mp',
  'tplink-sg2428p',
  'tplink-sg3428x',
  'tplink-sx3016f',
  'tplink-sg108',
  'hub',
  'ont',
  'onu'
]);

/**
 * Convert CIDR prefix (0-32) to dotted IPv4 subnet mask string.
 * @param {number} prefix
 * @returns {string}
 */
export function prefixToSubnetMask(prefix = 24) {
  const p = Math.max(0, Math.min(32, Number.isInteger(Number(prefix)) ? Number(prefix) : 24));
  const maskInt = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
  return [
    (maskInt >>> 24) & 255,
    (maskInt >>> 16) & 255,
    (maskInt >>> 8) & 255,
    maskInt & 255
  ].join('.');
}

/**
 * Convert unsigned 32-bit integer to dotted IPv4 string.
 * @param {number} ipInt
 * @returns {string}
 */
export function intToIpv4(ipInt) {
  const n = Number(ipInt) >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/**
 * Check if IPv4 address falls inside RFC1918 private address ranges.
 * @param {string} ipStr
 * @returns {boolean}
 */
export function isPrivateIpv4(ipStr) {
  const parsed = parseIpv4Cidr(ipStr);
  if (!parsed) return false;
  const a = (parsed.ipInt >>> 24) & 255;
  const b = (parsed.ipInt >>> 16) & 255;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Parse IPv4 string (supports optional /CIDR suffix or explicit mask).
 * @param {string} ipInput
 * @param {string} [subnetMask]
 * @returns {{ ip: string, prefix: number, maskInt: number, ipInt: number, networkInt: number, maskStr: string, networkStr: string } | null}
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
  const maskStr = intToIpv4(maskInt);
  const networkStr = intToIpv4(networkInt);

  return { ip: ipStr, prefix, maskInt, ipInt, networkInt, maskStr, networkStr };
}

export function isRouterDevice(dev) {
  if (!dev) return false;
  const type = String(dev.type || '').toLowerCase();
  if (isSwitchDevice(dev) || isIspDevice(dev)) return false;
  return (
    ROUTER_TYPES.has(type) ||
    type.includes('router') ||
    type.includes('firewall') ||
    type.includes('gateway') ||
    (dev.category === 'core' && !type.includes('server') && !type.includes('nvr') && !type.includes('storage'))
  );
}

export function isSwitchDevice(dev) {
  if (!dev) return false;
  const type = String(dev.type || '').toLowerCase();
  return SWITCH_TYPES.has(type) || type.includes('switch');
}

export function isApDevice(dev) {
  if (!dev) return false;
  const type = String(dev.type || '').toLowerCase();
  return type === 'access-point' || type.includes('ap') || type.includes('wifi');
}

export function isIspDevice(dev) {
  if (!dev) return false;
  const type = String(dev.type || '').toLowerCase();
  const name = String(dev.name || '').toLowerCase();
  return (
    type === 'isp' ||
    type === 'cloud' ||
    type === 'internet' ||
    type === 'modem' ||
    name.includes('isp') ||
    name.includes('internet') ||
    name.includes('cloud')
  );
}

export function isClientDevice(dev) {
  if (!dev) return false;
  return !isRouterDevice(dev) && !isSwitchDevice(dev) && !isIspDevice(dev);
}

/**
 * Parse comma-separated VLAN list string ("10,20,30" or "10-12") into sorted unique array.
 * @param {string|number[]} raw
 * @returns {number[]}
 */
export function parseVlanList(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 4094))].sort((a, b) => a - b);
  }
  const str = String(raw || '').trim();
  if (!str) return [];
  const out = new Set();
  str.split(/[,\s]+/).forEach((tok) => {
    if (!tok) return;
    const rangeMatch = tok.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = Math.max(1, Number(rangeMatch[1]));
      const b = Math.min(4094, Number(rangeMatch[2]));
      for (let v = a; v <= Math.min(b, a + 64); v++) out.add(v);
    } else {
      const n = Number(tok);
      if (Number.isInteger(n) && n >= 1 && n <= 4094) out.add(n);
    }
  });
  return [...out].sort((a, b) => a - b);
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
    this.staticRoutes = new Map(); // legacy mirror: deviceId -> [{ dstNetwork, prefix, gateway }]
    this.cliContextMap = new Map(); // deviceId -> { selectedInterface: string, configMode: boolean }
  }

  _getDeviceList() {
    return this.deviceManager?.getAllDevices?.() || [];
  }

  /**
   * Return normalized physical port list for a device.
   * @param {Object} dev
   * @returns {Array<{name: string, type: string, speed: string}>}
   */
  getDevicePortList(dev) {
    if (!dev) return [];
    if (Array.isArray(dev.ports) && dev.ports.length > 0) return dev.ports;
    return getDefaultDevicePorts(dev.type, dev.model, dev.spatial3d?.customModelUrl);
  }

  /**
   * Return all configured interface objects on a device, with fallback to legacy network.ip/vlan.
   * @param {Object} dev
   * @returns {Record<string, Object>}
   */
  getDeviceInterfacesMap(dev) {
    if (!dev) return {};
    const explicit = dev.network?.interfaces && typeof dev.network.interfaces === 'object'
      ? dev.network.interfaces
      : {};
    return explicit;
  }

  /**
   * Check whether a device has any explicit per-interface configurations saved.
   * @param {Object} dev
   * @returns {boolean}
   */
  hasExplicitInterfaces(dev) {
    const map = this.getDeviceInterfacesMap(dev);
    return Object.keys(map).length > 0;
  }

  /**
   * Get effective config for a specific port/interface (falls back to legacy device.network).
   * @param {Object} dev
   * @param {string} [portName]
   */
  getEffectiveInterfaceConfig(dev, portName = '') {
    if (!dev) return null;
    const explicitMap = this.getDeviceInterfacesMap(dev);
    if (portName && explicitMap[portName]) {
      return { name: portName, explicit: true, ...explicitMap[portName] };
    }
    const defaultPort = portName || this.getDevicePortList(dev)[0]?.name || 'ether1';
    const parsedLegacy = parseIpv4Cidr(dev.network?.ip, dev.network?.subnet);
    return {
      name: defaultPort,
      explicit: false,
      ip: parsedLegacy?.ip || '',
      prefix: parsedLegacy?.prefix ?? 24,
      subnet: parsedLegacy?.maskStr || dev.network?.subnet || '255.255.255.0',
      status: dev.status === 'offline' ? 'down' : 'up',
      mode: isSwitchDevice(dev) ? 'access' : 'routed',
      vlan: Number(dev.network?.vlan || 1),
      allowedVlans: [Number(dev.network?.vlan || 1)],
      dhcpClient: dev.network?.connectionMode === 'dhcp',
      natMasquerade: Boolean(dev.network?.nat?.masquerade && dev.network?.nat?.outInterface === defaultPort)
    };
  }

  /**
   * Collect all valid IPv4 CIDR entries configured on a device (both per-interface and legacy).
   * @param {Object} dev
   * @returns {Array<{ ifaceName: string, parsed: Object, vlan: number, status: string, mode: string, natMasquerade: boolean }>}
   */
  getAllDeviceIpEntries(dev) {
    if (!dev) return [];
    const results = [];
    const seenKeys = new Set();
    const explicitMap = this.getDeviceInterfacesMap(dev);
    Object.entries(explicitMap).forEach(([ifName, cfg]) => {
      if (!cfg?.ip) return;
      const parsed = parseIpv4Cidr(cfg.ip, cfg.subnet || prefixToSubnetMask(cfg.prefix ?? 24));
      if (!parsed) return;
      const key = `${ifName}:${parsed.ip}/${parsed.prefix}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      results.push({
        ifaceName: ifName,
        parsed,
        vlan: Number(cfg.vlan || dev.network?.vlan || 1),
        status: cfg.status === 'down' ? 'down' : 'up',
        mode: cfg.mode || 'routed',
        natMasquerade: Boolean(cfg.natMasquerade || (dev.network?.nat?.masquerade && dev.network?.nat?.outInterface === ifName))
      });
    });

    if (dev.network?.ip) {
      const legacyParsed = parseIpv4Cidr(dev.network.ip, dev.network.subnet);
      if (legacyParsed && !results.some((r) => r.parsed.ip === legacyParsed.ip)) {
        const primaryPort = this.getDevicePortList(dev)[0]?.name || 'ether1';
        results.push({
          ifaceName: primaryPort,
          parsed: legacyParsed,
          vlan: Number(dev.network?.vlan || 1),
          status: dev.status === 'offline' ? 'down' : 'up',
          mode: isSwitchDevice(dev) ? 'access' : 'routed',
          natMasquerade: Boolean(dev.network?.nat?.masquerade)
        });
      }
    }
    return results;
  }

  /**
   * Resolve a device by ID, primary IP, any interface IP, hostname, or name.
   */
  _findDevice(idOrIp) {
    const needle = String(idOrIp || '').trim();
    if (!needle) return null;
    const byId = this.deviceManager?.getDeviceById?.(needle);
    if (byId) return byId;
    const all = this._getDeviceList();
    const cleanNeedleIp = needle.split('/')[0].trim();
    return (
      all.find((d) => String(d.network?.ip || '').split('/')[0].trim() === cleanNeedleIp) ||
      all.find((d) => this.getAllDeviceIpEntries(d).some((e) => e.parsed.ip === cleanNeedleIp)) ||
      all.find((d) => String(d.network?.hostname || '').toLowerCase() === needle.toLowerCase()) ||
      all.find((d) => String(d.name || '').toLowerCase() === needle.toLowerCase()) ||
      null
    );
  }

  /**
   * Find first matching interface name on a device (case-insensitive & alias aware).
   */
  resolveInterfaceName(dev, rawIfaceName = '') {
    const ports = this.getDevicePortList(dev);
    const cleaned = String(rawIfaceName || '').trim();
    if (!cleaned) {
      return ports[0]?.name || 'ether1';
    }
    const lower = cleaned.toLowerCase();
    const exact = ports.find((p) => p.name.toLowerCase() === lower);
    if (exact) return exact.name;
    // Cisco short alias match: Gi0/1 <-> GigabitEthernet0/1, Fa0/1 <-> FastEthernet0/1
    const expanded = lower
      .replace(/^gigabitethernet/, 'gi')
      .replace(/^fastethernet/, 'fa')
      .replace(/^ethernet/, 'ether');
    const aliasMatch = ports.find((p) => {
      const pn = p.name.toLowerCase()
        .replace(/^gigabitethernet/, 'gi')
        .replace(/^fastethernet/, 'fa');
      return pn === expanded || pn.startsWith(lower);
    });
    return aliasMatch ? aliasMatch.name : cleaned;
  }

  /**
   * Update per-interface configuration and keep top-level device.network summary synced.
   */
  setInterfaceConfig(deviceId, rawIfaceName, patch = {}) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return null;

    const ifaceName = this.resolveInterfaceName(dev, rawIfaceName);
    const existingInterfaces = { ...(dev.network?.interfaces || {}) };
    const prevCfg = existingInterfaces[ifaceName] || this.getEffectiveInterfaceConfig(dev, ifaceName);

    let nextIp = patch.ip !== undefined ? String(patch.ip).trim() : (prevCfg.ip || '');
    let nextPrefix = patch.prefix !== undefined ? Number(patch.prefix) : (prevCfg.prefix ?? 24);
    let nextSubnet = patch.subnet !== undefined ? String(patch.subnet).trim() : (prevCfg.subnet || prefixToSubnetMask(nextPrefix));

    if (nextIp) {
      const parsed = parseIpv4Cidr(nextIp, patch.prefix !== undefined ? prefixToSubnetMask(nextPrefix) : nextSubnet);
      if (parsed) {
        nextIp = parsed.ip;
        nextPrefix = patch.prefix !== undefined ? Number(patch.prefix) : parsed.prefix;
        nextSubnet = prefixToSubnetMask(nextPrefix);
      }
    } else if (patch.prefix !== undefined) {
      nextSubnet = prefixToSubnetMask(nextPrefix);
    }

    const nextMode = (patch.mode === 'access' || patch.mode === 'trunk' || patch.mode === 'routed')
      ? patch.mode
      : (prevCfg.mode || (isSwitchDevice(dev) ? 'access' : 'routed'));
    const nextVlan = patch.vlan !== undefined && patch.vlan !== ''
      ? Math.max(1, Math.min(4094, Number(patch.vlan) || 1))
      : Number(prevCfg.vlan || dev.network?.vlan || 1);
    const nextAllowed = patch.allowedVlans !== undefined
      ? parseVlanList(patch.allowedVlans)
      : (Array.isArray(prevCfg.allowedVlans) && prevCfg.allowedVlans.length > 0 ? prevCfg.allowedVlans : [nextVlan]);
    const nextStatus = patch.status === 'down' ? 'down' : (patch.status === 'up' ? 'up' : (prevCfg.status || 'up'));

    const nextCfg = {
      ip: nextIp,
      prefix: nextPrefix,
      subnet: nextSubnet,
      status: nextStatus,
      mode: nextMode,
      vlan: nextVlan,
      allowedVlans: nextAllowed.length > 0 ? nextAllowed : [nextVlan],
      dhcpClient: patch.dhcpClient !== undefined ? Boolean(patch.dhcpClient) : Boolean(prevCfg.dhcpClient),
      natMasquerade: patch.natMasquerade !== undefined ? Boolean(patch.natMasquerade) : Boolean(prevCfg.natMasquerade)
    };

    existingInterfaces[ifaceName] = nextCfg;

    const firstPortName = this.getDevicePortList(dev)[0]?.name || 'ether1';
    const networkUpdate = {
      interfaces: existingInterfaces
    };

    // Sync top-level legacy network.ip/subnet/vlan for primary interface or when top-level IP is empty
    if (nextIp && (ifaceName === firstPortName || !dev.network?.ip || Object.keys(existingInterfaces).length === 1)) {
      networkUpdate.ip = nextIp;
      networkUpdate.subnet = nextSubnet;
    }
    if (ifaceName === firstPortName && patch.vlan !== undefined) {
      networkUpdate.vlan = nextVlan;
    }
    if (patch.natMasquerade !== undefined) {
      networkUpdate.nat = {
        masquerade: Boolean(patch.natMasquerade),
        outInterface: patch.natMasquerade ? ifaceName : (dev.network?.nat?.outInterface === ifaceName ? '' : (dev.network?.nat?.outInterface || ''))
      };
    }

    const updated = this.deviceManager.updateDevice(deviceId, { network: networkUpdate });
    eventBus.emit('simulator:config-updated', { deviceId, ifaceName, config: nextCfg });
    return updated;
  }

  /**
   * Remove IP assignment from a specific interface.
   */
  removeInterfaceIp(deviceId, rawIfaceName) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return null;
    const ifaceName = this.resolveInterfaceName(dev, rawIfaceName);
    const existingInterfaces = { ...(dev.network?.interfaces || {}) };
    if (existingInterfaces[ifaceName]) {
      existingInterfaces[ifaceName] = { ...existingInterfaces[ifaceName], ip: '' };
    }
    const remainingIp = Object.values(existingInterfaces).find((c) => c?.ip);
    return this.deviceManager.updateDevice(deviceId, {
      network: {
        interfaces: existingInterfaces,
        ip: remainingIp ? remainingIp.ip : '',
        subnet: remainingIp ? remainingIp.subnet : (dev.network?.subnet || '255.255.255.0')
      }
    });
  }

  /**
   * Add or update a static / default route on a device.
   */
  addStaticRoute(deviceId, { dstNetwork = '0.0.0.0', prefix = 0, gateway = '', interfaceName = '' } = {}) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return null;
    const parsedDst = parseIpv4Cidr(`${dstNetwork}/${prefix}`);
    const parsedGw = parseIpv4Cidr(gateway);
    if (!parsedDst || !parsedGw) return null;

    const routes = Array.isArray(dev.network?.routes) ? [...dev.network.routes] : [];
    const routeObj = {
      dstNetwork: parsedDst.networkStr,
      prefix: parsedDst.prefix,
      gateway: parsedGw.ip,
      interfaceName: interfaceName ? this.resolveInterfaceName(dev, interfaceName) : ''
    };

    const existingIdx = routes.findIndex((r) => r.dstNetwork === routeObj.dstNetwork && Number(r.prefix) === routeObj.prefix);
    if (existingIdx >= 0) routes[existingIdx] = routeObj;
    else routes.push(routeObj);

    this.staticRoutes.set(deviceId, routes);

    const netUpdate = { routes };
    if (routeObj.dstNetwork === '0.0.0.0' && routeObj.prefix === 0) {
      netUpdate.gateway = routeObj.gateway;
    }
    const updated = this.deviceManager.updateDevice(deviceId, { network: netUpdate });
    eventBus.emit('simulator:config-updated', { deviceId, routes });
    return updated;
  }

  removeStaticRoute(deviceId, index) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return null;
    const routes = Array.isArray(dev.network?.routes) ? [...dev.network.routes] : [];
    if (index < 0 || index >= routes.length) return dev;
    routes.splice(index, 1);
    this.staticRoutes.set(deviceId, routes);
    return this.deviceManager.updateDevice(deviceId, { network: { routes } });
  }

  /**
   * Configure DHCP Server Pool on a router/server interface.
   */
  configureDhcpServer(deviceId, rawIfaceName, config = {}) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return null;
    const ifaceName = this.resolveInterfaceName(dev, rawIfaceName);
    const ifCfg = this.getEffectiveInterfaceConfig(dev, ifaceName);
    const parsedIf = parseIpv4Cidr(ifCfg?.ip, ifCfg?.subnet);

    let defaultStart = '';
    let defaultEnd = '';
    if (parsedIf) {
      const octs = parsedIf.networkStr.split('.').map(Number);
      defaultStart = `${octs[0]}.${octs[1]}.${octs[2]}.${Math.min(254, octs[3] + 10)}`;
      defaultEnd = `${octs[0]}.${octs[1]}.${octs[2]}.${Math.min(254, octs[3] + 50)}`;
    }

    const prevDhcp = dev.network?.dhcp || { servers: {}, clientEnabled: false, clientInterface: '' };
    const servers = { ...(prevDhcp.servers || {}) };
    servers[ifaceName] = {
      enabled: config.enabled !== undefined ? Boolean(config.enabled) : true,
      poolStart: String(config.poolStart || servers[ifaceName]?.poolStart || defaultStart).trim(),
      poolEnd: String(config.poolEnd || servers[ifaceName]?.poolEnd || defaultEnd).trim(),
      gateway: String(config.gateway || servers[ifaceName]?.gateway || parsedIf?.ip || dev.network?.ip || '').trim(),
      dns: String(config.dns || servers[ifaceName]?.dns || '8.8.8.8').trim(),
      prefix: Number(config.prefix ?? parsedIf?.prefix ?? 24)
    };

    const updated = this.deviceManager.updateDevice(deviceId, {
      network: {
        dhcp: {
          ...prevDhcp,
          servers
        }
      }
    });
    eventBus.emit('simulator:config-updated', { deviceId, dhcpServer: servers[ifaceName] });
    return updated;
  }

  /**
   * Configure NAT Masquerade on an outbound WAN interface of a router.
   */
  setNatMasquerade(deviceId, rawOutInterface = '', enabled = true) {
    const dev = this.deviceManager?.getDeviceById?.(deviceId);
    if (!dev) return null;
    const outInterface = this.resolveInterfaceName(dev, rawOutInterface || dev.network?.nat?.outInterface || '');
    const existingInterfaces = { ...(dev.network?.interfaces || {}) };
    if (existingInterfaces[outInterface]) {
      existingInterfaces[outInterface] = {
        ...existingInterfaces[outInterface],
        natMasquerade: Boolean(enabled)
      };
    }
    const updated = this.deviceManager.updateDevice(deviceId, {
      network: {
        interfaces: existingInterfaces,
        nat: {
          masquerade: Boolean(enabled),
          outInterface: enabled ? outInterface : ''
        }
      }
    });
    eventBus.emit('simulator:config-updated', { deviceId, nat: { masquerade: Boolean(enabled), outInterface } });
    return updated;
  }

  /**
   * Simulate DHCP Client DORA (Discover -> Offer -> Request -> Ack) across L1/L2 broadcast domain.
   * @param {string} clientDeviceId
   * @param {string} [ifaceName]
   */
  requestDhcpLease(clientDeviceId, ifaceName = '') {
    const client = this.deviceManager?.getDeviceById?.(clientDeviceId);
    if (!client) {
      return { success: false, steps: [], reason: 'Perangkat klien tidak ditemukan.' };
    }
    if (client.status === 'offline') {
      return { success: false, steps: [], reason: `Perangkat "${client.name}" sedang OFFLINE.` };
    }

    const graph = this.buildAdjacencyGraph();
    const clientPort = this.resolveInterfaceName(client, ifaceName);
    const clientIfCfg = this.getEffectiveInterfaceConfig(client, clientPort);
    const clientVlan = Number(clientIfCfg?.vlan || client.network?.vlan || 1);

    // BFS across L2 domain (do not forward DHCP broadcast *past* a router, only *into* a router's receiving interface!)
    const queue = [{ devId: client.id, vlan: clientVlan, path: [client.id] }];
    const visited = new Set([client.id]);
    let foundOffer = null;

    while (queue.length > 0 && !foundOffer) {
      const cur = queue.shift();
      const curDev = this.deviceManager?.getDeviceById?.(cur.devId);
      const edges = graph.get(cur.devId) || [];

      for (const edge of edges) {
        // Validate L2 VLAN pass on current device exit port and neighbor ingress port
        const nextDev = this.deviceManager?.getDeviceById?.(edge.neighborId);
        if (!nextDev) continue;

        const l2Check = this._checkEdgeVlanPass(curDev, edge.srcPort, nextDev, edge.dstPort, cur.vlan);
        if (!l2Check.allowed) continue;

        // Check if neighbor has an enabled DHCP server on the receiving interface (or fallback server)
        const dhcpServers = nextDev.network?.dhcp?.servers || {};
        const matchingPoolEntry =
          (edge.dstPort && dhcpServers[edge.dstPort]?.enabled ? { iface: edge.dstPort, cfg: dhcpServers[edge.dstPort] } : null) ||
          Object.entries(dhcpServers)
            .filter(([, cfg]) => cfg?.enabled)
            .map(([iface, cfg]) => ({ iface, cfg }))
            .find(({ iface }) => {
              const ifCfg = this.getEffectiveInterfaceConfig(nextDev, iface);
              return !edge.dstPort || Number(ifCfg?.vlan || 1) === cur.vlan || Object.keys(dhcpServers).length === 1;
            }) || null;

        if (matchingPoolEntry) {
          foundOffer = { server: nextDev, ...matchingPoolEntry, path: [...cur.path, nextDev.id] };
          break;
        }

        // Continue flooding through switches/APs, stop at routers (L3 broadcast boundary)
        if (!visited.has(nextDev.id) && !isRouterDevice(nextDev)) {
          visited.add(nextDev.id);
          queue.push({ devId: nextDev.id, vlan: l2Check.outVlan, path: [...cur.path, nextDev.id] });
        }
      }
    }

    if (!foundOffer) {
      return {
        success: false,
        steps: ['DISCOVER (broadcast 255.255.255.255) — Tidak ada DHCP Server aktif di VLAN/segmen ini'],
        reason: `DHCP Timeout: Tidak ditemukan DHCP Server aktif yang terhubung ke "${client.name}" (VLAN ${clientVlan}).`
      };
    }

    const pool = foundOffer.cfg;
    const startParsed = parseIpv4Cidr(pool.poolStart);
    const endParsed = parseIpv4Cidr(pool.poolEnd);
    if (!startParsed || !endParsed || startParsed.ipInt > endParsed.ipInt) {
      return {
        success: false,
        steps: ['DISCOVER', 'OFFER gagal — rentang DHCP pool tidak valid'],
        reason: `Rentang DHCP pool pada "${foundOffer.server.name}" (${pool.poolStart} - ${pool.poolEnd}) tidak valid.`
      };
    }

    // Collect currently used IPs across all other devices
    const usedIps = new Set();
    this._getDeviceList().forEach((d) => {
      if (d.id === client.id) return;
      this.getAllDeviceIpEntries(d).forEach((entry) => usedIps.add(entry.parsed.ip));
    });

    let chosenIp = '';
    for (let ipInt = startParsed.ipInt; ipInt <= endParsed.ipInt; ipInt++) {
      const candidate = intToIpv4(ipInt);
      if (!usedIps.has(candidate)) {
        chosenIp = candidate;
        break;
      }
    }

    if (!chosenIp) {
      return {
        success: false,
        steps: ['DISCOVER', 'OFFER gagal — semua IP di DHCP pool sudah terpakai'],
        reason: `DHCP Pool penuh pada "${foundOffer.server.name}".`
      };
    }

    const prefix = Number(pool.prefix || 24);
    const subnet = prefixToSubnetMask(prefix);
    const gateway = pool.gateway || foundOffer.server.network?.ip || '';
    const dns = pool.dns || '8.8.8.8';

    // Apply lease to client device
    this.setInterfaceConfig(client.id, clientPort, {
      ip: chosenIp,
      prefix,
      subnet,
      status: 'up',
      dhcpClient: true
    });
    this.deviceManager.updateDevice(client.id, {
      network: {
        ip: chosenIp,
        subnet,
        gateway,
        dns,
        connectionMode: 'dhcp',
        dhcp: {
          ...(client.network?.dhcp || { servers: {} }),
          clientEnabled: true,
          clientInterface: clientPort
        }
      }
    });

    const lease = {
      ip: chosenIp,
      prefix,
      subnet,
      gateway,
      dns,
      serverId: foundOffer.server.id,
      serverName: foundOffer.server.name,
      ifaceName: clientPort
    };

    const steps = [
      `1. DISCOVER — ${client.name} [${clientPort}] mengirim DHCP Discover (VLAN ${clientVlan})`,
      `2. OFFER — ${foundOffer.server.name} [${foundOffer.iface}] menawarkan ${chosenIp}/${prefix}`,
      `3. REQUEST — ${client.name} meminta lease ${chosenIp}`,
      `4. ACK — Diterima! IP ${chosenIp}/${prefix}, GW ${gateway || '-'}, DNS ${dns}`
    ];

    eventBus.emit('simulator:dhcp-lease', { deviceId: client.id, lease, steps });
    return {
      success: true,
      steps,
      lease,
      hops: foundOffer.path,
      reason: `IP ${chosenIp}/${prefix} berhasil diperoleh dari DHCP Server ${foundOffer.server.name}.`
    };
  }

  /**
   * Check whether traffic on `vlan` is allowed across a physical link between two ports.
   * Preserves legacy pass-through when neither switchport has explicit interface config.
   */
  _checkEdgeVlanPass(devA, portA, devB, portB, activeVlan = 1) {
    const checkSide = (dev, portName, vlan) => {
      if (!dev || !portName) return { allowed: true, outVlan: vlan };
      const explicitMap = this.getDeviceInterfacesMap(dev);
      const cfg = explicitMap[portName];
      if (!cfg) return { allowed: true, outVlan: vlan };

      if (cfg.status === 'down') {
        return {
          allowed: false,
          layer: 'l1',
          reason: `Port ${portName} pada "${dev.name}" dalam status DOWN (administratively shutdown).`
        };
      }

      if (isSwitchDevice(dev)) {
        const mode = cfg.mode || 'access';
        if (mode === 'access') {
          const portVlan = Number(cfg.vlan || 1);
          if (portVlan !== vlan) {
            return {
              allowed: false,
              layer: 'l2',
              reason: `BLOCKED — Port ${portName} pada "${dev.name}" adalah mode access VLAN ${portVlan}, tidak mengizinkan VLAN ${vlan}.`
            };
          }
          return { allowed: true, outVlan: portVlan };
        }
        if (mode === 'trunk') {
          const allowed = Array.isArray(cfg.allowedVlans) && cfg.allowedVlans.length > 0 ? cfg.allowedVlans : [1];
          if (!allowed.includes(vlan)) {
            return {
              allowed: false,
              layer: 'l2',
              reason: `BLOCKED — Port ${portName} pada "${dev.name}" (trunk) tidak mengizinkan VLAN ${vlan} (hanya: ${allowed.join(', ')}).`
            };
          }
          return { allowed: true, outVlan: vlan };
        }
      }
      return { allowed: true, outVlan: vlan };
    };

    const aRes = checkSide(devA, portA, activeVlan);
    if (!aRes.allowed) return aRes;
    const bRes = checkSide(devB, portB, aRes.outVlan);
    if (!bRes.allowed) return bRes;
    return { allowed: true, outVlan: bRes.outVlan };
  }

  /**
   * Build active L1/L2 adjacency graph from cables + Access Point wireless coverage.
   * @returns {Map<string, Array<{ neighborId: string, medium: string, cableId?: string, srcPort?: string, dstPort?: string, label: string }>>}
   */
  buildAdjacencyGraph() {
    const graph = new Map();
    const devices = this._getDeviceList();
    devices.forEach((d) => graph.set(d.id, []));

    const cables = this.cableManager?.getAllConnections?.() || [];
    cables.forEach((cab) => {
      if (!cab || cab.status === 'offline' || cab.status === 'cut' || cab.status === 'damaged' || cab.status === 'inactive') return;
      const src = this.deviceManager?.getDeviceById?.(cab.source);
      const dst = this.deviceManager?.getDeviceById?.(cab.destination);
      if (!src || !dst || src.status === 'offline' || dst.status === 'offline') return;

      const portSrc = cab.details?.portSource || '';
      const portDst = cab.details?.portDestination || '';

      // Respect explicit administratively shutdown ports on either end
      const srcIfExplicit = portSrc ? this.getDeviceInterfacesMap(src)[portSrc] : null;
      const dstIfExplicit = portDst ? this.getDeviceInterfacesMap(dst)[portDst] : null;
      if (srcIfExplicit?.status === 'down' || dstIfExplicit?.status === 'down') return;

      const label = cab.name || `${portSrc || 'port'} <-> ${portDst || 'port'}`;
      graph.get(src.id)?.push({
        neighborId: dst.id,
        medium: cab.type || 'utp',
        cableId: cab.id,
        srcPort: portSrc,
        dstPort: portDst,
        label
      });
      graph.get(dst.id)?.push({
        neighborId: src.id,
        medium: cab.type || 'utp',
        cableId: cab.id,
        srcPort: portDst,
        dstPort: portSrc,
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
          graph.get(ap.id)?.push({ neighborId: client.id, medium: 'wireless', srcPort: 'WLAN', dstPort: 'WLAN', label: edgeLabel });
          graph.get(client.id)?.push({ neighborId: ap.id, medium: 'wireless', srcPort: 'WLAN', dstPort: 'WLAN', label: edgeLabel });
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
   * Check whether a router can route toward `dstNet` via direct connected interface or static/default route.
   */
  _routerHasRouteTo(routerDev, dstNet) {
    const entries = this.getAllDeviceIpEntries(routerDev);
    // Directly connected subnet on any UP interface
    if (entries.some((e) => e.status !== 'down' && ((dstNet.ipInt & e.parsed.maskInt) >>> 0) === e.parsed.networkInt)) {
      return { ok: true, via: 'connected' };
    }
    const routes = Array.isArray(routerDev.network?.routes) ? routerDev.network.routes : [];
    for (const r of routes) {
      const rParsed = parseIpv4Cidr(`${r.dstNetwork}/${r.prefix}`);
      if (!rParsed) continue;
      if (rParsed.prefix === 0 || ((dstNet.ipInt & rParsed.maskInt) >>> 0) === rParsed.networkInt) {
        return { ok: true, via: rParsed.prefix === 0 ? `default via ${r.gateway}` : `static via ${r.gateway}` };
      }
    }
    if (routerDev.network?.gateway) {
      return { ok: true, via: `gateway ${routerDev.network.gateway}` };
    }
    return { ok: false, via: '' };
  }

  /**
   * Simulate an ICMP Echo Request/Reply across physical & logical L1-L3+ state.
   * Supports per-port VLAN access/trunk, multi-interface routers, Gateway & Static Route checks, and NAT Masquerade.
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

    const pathRes = this._findShortestPath(src.id, dst.id);
    if (!pathRes) {
      const res = {
        success: false,
        sourceId: src.id,
        targetId: dst.id,
        targetIp: dst.network?.ip || '',
        hops: [src.id],
        reason: `Tidak ada jalur fisik kabel/WiFi aktif antara "${src.name}" dan "${dst.name}" (periksa kabel atau port yang shutdown).`,
        osiLayers: {
          l1: 'DISCONNECTED — Kabel putus / port shutdown / belum tersambung',
          l2: 'No switched/wireless path',
          l3: 'No route to host'
        },
        summary: `Destination unreachable: sambungkan kabel & pastikan port UP antara ${src.name} dan ${dst.name}.`
      };
      this.lastResult = res;
      return res;
    }

    // Resolve source & destination IP using connected ingress/egress port first, falling back to primary IP
    const firstEdge = pathRes.edges[0] || null;
    const lastEdge = pathRes.edges[pathRes.edges.length - 1] || null;
    const srcIfCfg = this.getEffectiveInterfaceConfig(src, firstEdge?.srcPort);
    const dstIfCfg = this.getEffectiveInterfaceConfig(dst, lastEdge?.dstPort);

    const srcEntries = this.getAllDeviceIpEntries(src);
    const dstEntries = this.getAllDeviceIpEntries(dst);
    const targetIpNeedle = String(targetIdOrIp || '').split('/')[0].trim();

    const srcNet = parseIpv4Cidr(srcIfCfg?.ip, srcIfCfg?.subnet) || srcEntries[0]?.parsed || parseIpv4Cidr(src.network?.ip, src.network?.subnet);
    const dstNet =
      dstEntries.find((e) => e.parsed.ip === targetIpNeedle)?.parsed ||
      parseIpv4Cidr(dstIfCfg?.ip, dstIfCfg?.subnet) ||
      dstEntries[0]?.parsed ||
      parseIpv4Cidr(dst.network?.ip, dst.network?.subnet);

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

    const hopDevices = pathRes.nodeIds.map((id) => this.deviceManager.getDeviceById(id)).filter(Boolean);
    const routersInPath = hopDevices.filter((d) => isRouterDevice(d));
    const hasRouterInPath = routersInPath.length > 0;
    const srcVlan = Number(srcIfCfg?.vlan || src.network?.vlan || 1);
    const dstVlan = Number(dstIfCfg?.vlan || dst.network?.vlan || 1);

    // Layer 2 Switchport Access / Trunk VLAN Validation hop-by-hop
    // Walk segment-by-segment; reset active VLAN across L3 router boundary
    let curVlan = srcVlan;
    for (let i = 0; i < pathRes.edges.length; i++) {
      const edge = pathRes.edges[i];
      const devA = hopDevices[i];
      const devB = hopDevices[i + 1];
      if (!devA || !devB) continue;

      if (isRouterDevice(devA) && i > 0) {
        // Router egress interface determines outgoing VLAN toward destination segment
        const outIf = this.getEffectiveInterfaceConfig(devA, edge.srcPort);
        if (outIf?.explicit && outIf.vlan) {
          curVlan = Number(outIf.vlan);
        } else {
          curVlan = dstVlan;
        }
      }

      const l2Pass = this._checkEdgeVlanPass(devA, edge.srcPort, devB, edge.dstPort, curVlan);
      if (!l2Pass.allowed) {
        const res = {
          success: false,
          sourceId: src.id,
          targetId: dst.id,
          targetIp: dstNet.ip,
          hops: pathRes.nodeIds.slice(0, i + 2),
          reason: l2Pass.reason,
          osiLayers: {
            l1: l2Pass.layer === 'l1' ? `DOWN — ${l2Pass.reason}` : `OK (${pathRes.edges.length} hop fisik)`,
            l2: l2Pass.layer === 'l2' ? l2Pass.reason : 'Blocked by Layer 1',
            l3: 'Packet dropped sebelum mencapai tujuan'
          },
          summary: `Ping diblokir di Layer ${l2Pass.layer === 'l1' ? '1' : '2'}: ${l2Pass.reason}`
        };
        this.lastResult = res;
        return res;
      }
      curVlan = l2Pass.outVlan;
    }

    const sameSubnet = srcNet.networkInt === dstNet.networkInt && srcNet.prefix === dstNet.prefix;

    // Inter-subnet requires Router/L3 Gateway
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

    // Layer 3+ Gateway, Routing Table & NAT Masquerade validation (when crossing subnets via Router)
    let natNote = '';
    if (!sameSubnet && hasRouterInPath) {
      const firstRouter = routersInPath[0];
      const routerHasMultiIface = this.hasExplicitInterfaces(firstRouter);

      // Validate source client Default Gateway when router uses explicit multi-interface OR client has explicit gateway
      if (!isRouterDevice(src)) {
        const srcGwRaw = String(src.network?.gateway || '').trim();
        if (srcGwRaw) {
          const gwParsed = parseIpv4Cidr(srcGwRaw);
          if (!gwParsed || ((gwParsed.ipInt & srcNet.maskInt) >>> 0) !== srcNet.networkInt) {
            const res = {
              success: false,
              sourceId: src.id,
              targetId: dst.id,
              targetIp: dstNet.ip,
              hops: [src.id],
              reason: `Default Gateway "${srcGwRaw}" pada "${src.name}" tidak berada satu subnet dengan IP ${srcNet.ip}/${srcNet.prefix}.`,
              osiLayers: {
                l1: `OK (${pathRes.edges.length} hop fisik)`,
                l2: `OK (VLAN ${srcVlan})`,
                l3: `FAIL — Gateway ${srcGwRaw} di luar subnet ${srcNet.networkStr}/${srcNet.prefix}`
              },
              summary: `Ping gagal di Layer 3: perbaiki Default Gateway pada ${src.name}.`
            };
            this.lastResult = res;
            return res;
          }
          if (routerHasMultiIface) {
            const routerIps = this.getAllDeviceIpEntries(firstRouter).map((e) => e.parsed.ip);
            if (routerIps.length > 0 && !routerIps.includes(gwParsed.ip)) {
              const res = {
                success: false,
                sourceId: src.id,
                targetId: dst.id,
                targetIp: dstNet.ip,
                hops: [src.id, firstRouter.id],
                reason: `Default Gateway ${gwParsed.ip} pada "${src.name}" tidak cocok dengan IP interface router "${firstRouter.name}" (${routerIps.join(', ')}).`,
                osiLayers: {
                  l1: `OK (${pathRes.edges.length} hop fisik)`,
                  l2: `OK (VLAN ${srcVlan})`,
                  l3: `FAIL — Gateway ${gwParsed.ip} tidak ditemukan di router ${firstRouter.name}`
                },
                summary: `Ping gagal: Gateway ${src.name} tidak sesuai dengan IP interface ${firstRouter.name}.`
              };
              this.lastResult = res;
              return res;
            }
          }
        } else if (routerHasMultiIface) {
          const matchingRouterIp = this.getAllDeviceIpEntries(firstRouter)
            .find((e) => ((e.parsed.ipInt & srcNet.maskInt) >>> 0) === srcNet.networkInt)?.parsed?.ip;
          const res = {
            success: false,
            sourceId: src.id,
            targetId: dst.id,
            targetIp: dstNet.ip,
            hops: [src.id],
            reason: `Default Gateway pada "${src.name}" belum diisi${matchingRouterIp ? ` (set ke ${matchingRouterIp})` : ''}.`,
            osiLayers: {
              l1: `OK (${pathRes.edges.length} hop fisik)`,
              l2: `OK (VLAN ${srcVlan})`,
              l3: `FAIL — Default Gateway kosong pada ${src.name}`
            },
            summary: `Ping gagal: atur Default Gateway pada ${src.name}${matchingRouterIp ? ` ke ${matchingRouterIp}` : ''}.`
          };
          this.lastResult = res;
          return res;
        }
      }

      // Validate routing table on explicit multi-interface routers (especially multi-router or ISP hops)
      for (const rtr of routersInPath) {
        if (!this.hasExplicitInterfaces(rtr)) continue;
        const routeCheck = this._routerHasRouteTo(rtr, dstNet);
        if (!routeCheck.ok) {
          const res = {
            success: false,
            sourceId: src.id,
            targetId: dst.id,
            targetIp: dstNet.ip,
            hops: pathRes.nodeIds.slice(0, pathRes.nodeIds.indexOf(rtr.id) + 1),
            reason: `Router "${rtr.name}" tidak memiliki rute ke ${dstNet.networkStr}/${dstNet.prefix} (tambahkan Static/Default Route 0.0.0.0/0).`,
            osiLayers: {
              l1: `OK (${pathRes.edges.length} hop fisik)`,
              l2: `OK (VLAN ${srcVlan})`,
              l3: `FAIL — No route to ${dstNet.networkStr}/${dstNet.prefix} on ${rtr.name}`
            },
            summary: `Ping gagal: tambahkan route ke ${dstNet.networkStr}/${dstNet.prefix} di ${rtr.name}.`
          };
          this.lastResult = res;
          return res;
        }
      }

      // NAT Masquerade enforcement when Private LAN client pings ISP/Cloud/Public IP
      const targetIsExternal = isIspDevice(dst) || !isPrivateIpv4(dstNet.ip);
      if (targetIsExternal && isPrivateIpv4(srcNet.ip) && !isRouterDevice(src)) {
        const edgeRouter = routersInPath[routersInPath.length - 1];
        if (this.hasExplicitInterfaces(edgeRouter) || edgeRouter.network?.nat !== undefined) {
          const natActive = Boolean(
            edgeRouter.network?.nat?.masquerade ||
            Object.values(this.getDeviceInterfacesMap(edgeRouter)).some((c) => c?.natMasquerade)
          );
          if (this.hasExplicitInterfaces(edgeRouter) && !natActive) {
            const res = {
              success: false,
              sourceId: src.id,
              targetId: dst.id,
              targetIp: dstNet.ip,
              hops: pathRes.nodeIds.slice(0, pathRes.nodeIds.indexOf(edgeRouter.id) + 1),
              reason: `NAT Masquerade belum aktif di router "${edgeRouter.name}" — IP privat ${srcNet.ip} tidak dapat mengakses Internet/ISP (${dstNet.ip}).`,
              osiLayers: {
                l1: `OK (${pathRes.edges.length} hop fisik)`,
                l2: `OK (VLAN ${srcVlan})`,
                l3: `FAIL — srcnat masquerade tidak aktif di ${edgeRouter.name}`
              },
              summary: `Ping ke ${dst.name} gagal: aktifkan NAT Masquerade pada router ${edgeRouter.name}.`
            };
            this.lastResult = res;
            return res;
          }
          if (natActive) {
            natNote = ` [NAT Masquerade via ${edgeRouter.name}]`;
          }
        }
      }
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
        l2: `FORWARDED — VLAN ${srcVlan}${dstVlan !== srcVlan ? ` -> Routed -> VLAN ${dstVlan}` : ''} (${hopDevices.map((d) => d.network?.mac || d.name).join(' -> ')})`,
        l3: `ICMP Echo Reply from ${dstNet.ip}: bytes=32 time=${latencyMs}ms TTL=${ttl}${natNote}`
      },
      summary: `Reply from ${dstNet.ip}: time=${latencyMs}ms TTL=${ttl} (${pathRes.nodeIds.length} node)${natNote}`
    };

    this.lastResult = res;
    eventBus.emit('simulator:ping-completed', res);
    return res;
  }

  /**
   * Simulate hop-by-hop Traceroute from source to target.
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
   */
  detectCliFlavor(cmd, deviceBrand = '', flavor = 'auto') {
    if (flavor === 'cisco' || flavor === 'mikrotik') return flavor;
    const trimmed = String(cmd || '').trim();
    if (trimmed.startsWith('/')) return 'mikrotik';
    if (/^(show|enable|conf|hostname|ip\s|no\s|vlan|int|interface|switchport|shutdown|copy run|exit|end)/i.test(trimmed)) return 'cisco';
    return String(deviceBrand || '').toLowerCase().includes('mikrotik') ? 'mikrotik' : 'cisco';
  }

  /**
   * Execute a dual-syntax (Cisco IOS & MikroTik RouterOS) CLI command on a target device.
   * Supports semicolon-chained commands (e.g. "int Gi0/1 ; switchport mode trunk ; switchport trunk allowed vlan 10,20").
   */
  executeCliCommand(deviceId, rawCommand, flavor = 'auto') {
    const raw = String(rawCommand || '').trim();
    if (!raw) return { output: '', updated: false, flavor: 'cisco' };

    // Support semicolon-chained commands (useful for Live CLI Mirror copy/paste!)
    if (raw.includes(';')) {
      const parts = raw.split(';').map((s) => s.trim()).filter(Boolean);
      const outputs = [];
      let anyUpdated = false;
      let lastFlavor = flavor;
      let lastPing = null;
      for (const part of parts) {
        const res = this._executeSingleCliCommand(deviceId, part, flavor);
        if (res.output) outputs.push(res.output);
        if (res.updated) anyUpdated = true;
        lastFlavor = res.flavor || lastFlavor;
        if (res.pingResult) lastPing = res.pingResult;
      }
      return { output: outputs.join('\n'), updated: anyUpdated, flavor: lastFlavor, ...(lastPing ? { pingResult: lastPing } : {}) };
    }

    return this._executeSingleCliCommand(deviceId, raw, flavor);
  }

  _executeSingleCliCommand(deviceId, rawCommand, flavor = 'auto') {
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
    const ctx = this.cliContextMap.get(dev.id) || { selectedInterface: this.getDevicePortList(dev)[0]?.name || 'ether1', configMode: false };

    if (cmd === '?' || cmd.toLowerCase() === 'help') {
      return {
        updated: false,
        flavor: activeFlavor,
        output: [
          '=== Daftar Perintah CLI Dual Mode (L1-L3+) ===',
          'MikroTik ROS:',
          '  /ip address print | /ip address add address=<ip/cidr> interface=<if> | /ip address remove <if>',
          '  /ip route print | /ip route add dst-address=0.0.0.0/0 gateway=<ip>',
          '  /ip dhcp-server setup interface=<if> pool=<start>-<end> [gateway=<ip>] [dns=<ip>]',
          '  /ip dhcp-client add interface=<if>',
          '  /ip firewall nat add chain=srcnat out-interface=<if> action=masquerade',
          '  /interface print | /interface vlan add name=vlan10 vlan-id=10 interface=<if>',
          '  /system identity set name=<nama> | /ping <ip> | /tool traceroute <ip>',
          'Cisco IOS:',
          '  show ip int brief | show vlan brief | show ip route | show arp | show run',
          '  interface <port> | ip address <ip> <mask> | shutdown | no shutdown',
          '  ip default-gateway <ip> | ip route <net> <mask> <nextHop>',
          '  switchport mode access|trunk | switchport access vlan <id> | switchport trunk allowed vlan <list>',
          '  hostname <nama> | vlan <id> | ping <ip> | traceroute <ip>'
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

    // =========================================================================
    // MikroTik RouterOS Commands
    // =========================================================================
    if (activeFlavor === 'mikrotik') {
      if (/^\/ip\s+address\s+print/i.test(cmd)) {
        const entries = this.getAllDeviceIpEntries(dev);
        const rows = entries.length > 0
          ? entries.map((e, i) => ` ${i} ${e.status === 'down' ? 'X' : ' '}  ${(e.parsed.ip + '/' + e.parsed.prefix).padEnd(18)} ${e.parsed.networkStr.padEnd(15)} ${e.ifaceName} (VLAN ${e.vlan})`)
          : [` 0   unassigned         --              ether1 (VLAN ${curVlan})`];
        return {
          updated: false,
          flavor: 'mikrotik',
          output: `Flags: X - disabled, I - invalid, D - dynamic\n #   ADDRESS            NETWORK         INTERFACE\n${rows.join('\n')}`
        };
      }

      const rosIpMatch = cmd.match(/^\/ip\s+address\s+add\s+.*address=([0-9.]+)(?:\/(\d+))?/i);
      if (rosIpMatch) {
        const ifMatch = cmd.match(/interface=([^\s]+)/i);
        const targetIf = this.resolveInterfaceName(dev, ifMatch ? ifMatch[1] : '');
        const parsed = parseIpv4Cidr(`${rosIpMatch[1]}/${rosIpMatch[2] || 24}`);
        if (!parsed) {
          return { output: 'failure: invalid IPv4 CIDR address', updated: false, flavor: 'mikrotik' };
        }
        this.setInterfaceConfig(dev.id, targetIf, {
          ip: parsed.ip,
          prefix: parsed.prefix,
          subnet: parsed.maskStr,
          status: 'up'
        });
        return {
          updated: true,
          flavor: 'mikrotik',
          output: `[admin@${hostLabel}] > IP ${parsed.ip}/${parsed.prefix} (${parsed.maskStr}) diterapkan ke interface ${targetIf}.`
        };
      }

      const rosIpRem = cmd.match(/^\/ip\s+address\s+remove\s+([^\s]+)/i);
      if (rosIpRem) {
        const tok = rosIpRem[1].replace(/^interface=/i, '');
        const targetIf = /^\d+$/.test(tok)
          ? (this.getAllDeviceIpEntries(dev)[Number(tok)]?.ifaceName || this.getDevicePortList(dev)[0]?.name || 'ether1')
          : this.resolveInterfaceName(dev, tok);
        this.removeInterfaceIp(dev.id, targetIf);
        return { updated: true, flavor: 'mikrotik', output: `[admin@${hostLabel}] > IP pada ${targetIf} dihapus.` };
      }

      if (/^\/ip\s+route\s+print/i.test(cmd)) {
        const routes = Array.isArray(dev.network?.routes) ? dev.network.routes : [];
        const direct = this.getAllDeviceIpEntries(dev).map((e, i) => ` ${i} DAC ${(e.parsed.networkStr + '/' + e.parsed.prefix).padEnd(18)} ${e.ifaceName} (connected)`);
        const stat = routes.map((r, i) => ` ${direct.length + i} AS  ${(r.dstNetwork + '/' + r.prefix).padEnd(18)} ${r.gateway}`);
        const allLines = [...direct, ...stat];
        return {
          updated: false,
          flavor: 'mikrotik',
          output: `Flags: A - active, C - connect, S - static, D - dynamic\n #     DST-ADDRESS        GATEWAY\n${allLines.join('\n') || ' (routing table kosong)'}`
        };
      }

      const rosRouteAdd = cmd.match(/^\/ip\s+route\s+add\s+.*gateway=([0-9.]+)/i);
      if (rosRouteAdd) {
        const dstMatch = cmd.match(/dst-address=([0-9.]+)(?:\/(\d+))?/i);
        const dstNet = dstMatch ? dstMatch[1] : '0.0.0.0';
        const dstPref = dstMatch && dstMatch[2] !== undefined ? Number(dstMatch[2]) : (dstMatch ? 24 : 0);
        const res = this.addStaticRoute(dev.id, { dstNetwork: dstNet, prefix: dstPref, gateway: rosRouteAdd[1] });
        if (!res) return { output: 'failure: dst-address atau gateway tidak valid', updated: false, flavor: 'mikrotik' };
        return {
          updated: true,
          flavor: 'mikrotik',
          output: `[admin@${hostLabel}] > Route ${dstNet}/${dstPref} -> gateway ${rosRouteAdd[1]} ditambahkan.`
        };
      }

      const rosDhcpClient = cmd.match(/^\/ip\s+dhcp-client\s+add(?:\s+.*interface=([^\s]+))?/i);
      if (rosDhcpClient) {
        const iface = rosDhcpClient[1] || '';
        const leaseRes = this.requestDhcpLease(dev.id, iface);
        return {
          updated: leaseRes.success,
          flavor: 'mikrotik',
          output: `[admin@${hostLabel}] > DHCP Client:\n${leaseRes.steps.join('\n')}`
        };
      }

      const rosDhcpSetup = cmd.match(/^\/ip\s+dhcp-server\s+setup/i);
      if (rosDhcpSetup) {
        const ifM = cmd.match(/interface=([^\s]+)/i);
        const poolM = cmd.match(/pool=([0-9.]+)-([0-9.]+)/i);
        const gwM = cmd.match(/gateway=([0-9.]+)/i);
        const dnsM = cmd.match(/dns=([0-9.]+)/i);
        const targetIf = this.resolveInterfaceName(dev, ifM ? ifM[1] : '');
        this.configureDhcpServer(dev.id, targetIf, {
          enabled: true,
          ...(poolM ? { poolStart: poolM[1], poolEnd: poolM[2] } : {}),
          ...(gwM ? { gateway: gwM[1] } : {}),
          ...(dnsM ? { dns: dnsM[1] } : {})
        });
        const savedPool = this.deviceManager.getDeviceById(dev.id)?.network?.dhcp?.servers?.[targetIf];
        return {
          updated: true,
          flavor: 'mikrotik',
          output: `[admin@${hostLabel}] > DHCP Server aktif di ${targetIf} (Pool: ${savedPool?.poolStart} - ${savedPool?.poolEnd}, GW: ${savedPool?.gateway || '-'}).`
        };
      }

      if (/^\/ip\s+firewall\s+nat\s+print/i.test(cmd)) {
        const nat = dev.network?.nat;
        return {
          updated: false,
          flavor: 'mikrotik',
          output: nat?.masquerade
            ? ` 0   chain=srcnat action=masquerade out-interface=${nat.outInterface || 'ether1'}`
            : ' (belum ada rule NAT)'
        };
      }

      const rosNatAdd = cmd.match(/^\/ip\s+firewall\s+nat\s+add\s+.*action=masquerade/i);
      if (rosNatAdd) {
        const outM = cmd.match(/out-interface=([^\s]+)/i);
        const outIf = this.resolveInterfaceName(dev, outM ? outM[1] : '');
        this.setNatMasquerade(dev.id, outIf, true);
        return {
          updated: true,
          flavor: 'mikrotik',
          output: `[admin@${hostLabel}] > Firewall NAT masquerade aktif pada out-interface=${outIf}.`
        };
      }

      const rosVlanAdd = cmd.match(/^\/interface\s+vlan\s+add\s+.*vlan-id=(\d+)/i);
      if (rosVlanAdd) {
        const vid = Number(rosVlanAdd[1]);
        const ifM = cmd.match(/interface=([^\s]+)/i);
        const targetIf = this.resolveInterfaceName(dev, ifM ? ifM[1] : '');
        const curIf = this.getEffectiveInterfaceConfig(dev, targetIf);
        const allowed = [...new Set([...(curIf.allowedVlans || []), vid])];
        this.setInterfaceConfig(dev.id, targetIf, { vlan: vid, allowedVlans: allowed });
        return {
          updated: true,
          flavor: 'mikrotik',
          output: `[admin@${hostLabel}] > VLAN ${vid} ditambahkan pada interface ${targetIf}.`
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
        const ports = this.getDevicePortList(dev);
        const lines = ports.length > 0
          ? ports.map((p, idx) => {
              const cfg = this.getEffectiveInterfaceConfig(dev, p.name);
              const flag = cfg.status === 'down' ? 'X' : 'R';
              const modeInfo = cfg.mode === 'trunk' ? `trunk[${(cfg.allowedVlans || []).join(',')}]` : `${cfg.mode}(v${cfg.vlan})`;
              return ` ${String(idx).padEnd(2)} ${flag}  ${p.name.padEnd(11)} ${(p.type || 'ether').padEnd(7)} ${modeInfo.padEnd(16)} ${cfg.ip ? `${cfg.ip}/${cfg.prefix}` : '--'}`;
            })
          : [` 0  R  ether1      ether   routed(v1)       ${curIp}`];
        return {
          updated: false,
          flavor: 'mikrotik',
          output: `Flags: D - dynamic, X - disabled, R - running\n #  F  NAME        TYPE    MODE             IP\n${lines.join('\n')}`
        };
      }
    }

    // =========================================================================
    // Cisco IOS Commands
    // =========================================================================
    if (/^(enable|configure\s+terminal|conf\s+t|exit|end)$/i.test(cmd)) {
      if (/^conf/i.test(cmd)) ctx.configMode = true;
      if (/^(exit|end)$/i.test(cmd)) ctx.configMode = false;
      this.cliContextMap.set(dev.id, ctx);
      return { updated: false, flavor: 'cisco', output: `${hostLabel}${ctx.configMode ? '(config)' : ''}#` };
    }

    const intMatch = cmd.match(/^int(?:erface)?\s+([^\s]+)/i);
    if (intMatch) {
      const resolved = this.resolveInterfaceName(dev, intMatch[1]);
      ctx.selectedInterface = resolved;
      ctx.configMode = true;
      this.cliContextMap.set(dev.id, ctx);
      return { updated: false, flavor: 'cisco', output: `${hostLabel}(config-if:${resolved})#` };
    }

    if (/^(no\s+)?shut(?:down)?$/i.test(cmd)) {
      const isDown = !/^no\s+/i.test(cmd);
      this.setInterfaceConfig(dev.id, ctx.selectedInterface, { status: isDown ? 'down' : 'up' });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config-if)# %LINK-5-CHANGED: Interface ${ctx.selectedInterface}, changed state to ${isDown ? 'administratively down' : 'up'}`
      };
    }

    const swModeMatch = cmd.match(/^switchport\s+mode\s+(access|trunk)/i);
    if (swModeMatch) {
      const mode = swModeMatch[1].toLowerCase();
      this.setInterfaceConfig(dev.id, ctx.selectedInterface, { mode });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config-if)# Port ${ctx.selectedInterface} diatur ke mode ${mode}.`
      };
    }

    const swAccVlanMatch = cmd.match(/^switchport\s+access\s+vlan\s+(\d+)/i);
    if (swAccVlanMatch) {
      const vid = Number(swAccVlanMatch[1]);
      if (vid < 1 || vid > 4094) return { output: '% VLAN ID harus 1 - 4094.', updated: false, flavor: 'cisco' };
      this.setInterfaceConfig(dev.id, ctx.selectedInterface, { mode: 'access', vlan: vid, allowedVlans: [vid] });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config-if)# Port ${ctx.selectedInterface} access VLAN ${vid}.`
      };
    }

    const swTrunkVlanMatch = cmd.match(/^switchport\s+trunk\s+allowed\s+vlan\s+(.+)$/i);
    if (swTrunkVlanMatch) {
      const list = parseVlanList(swTrunkVlanMatch[1].replace(/^add\s+/i, ''));
      if (list.length === 0) return { output: '% Daftar VLAN tidak valid.', updated: false, flavor: 'cisco' };
      this.setInterfaceConfig(dev.id, ctx.selectedInterface, { mode: 'trunk', allowedVlans: list });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config-if)# Port ${ctx.selectedInterface} trunk allowed VLAN: ${list.join(', ')}.`
      };
    }

    const defGwMatch = cmd.match(/^ip\s+default-gateway\s+([0-9.]+)/i);
    if (defGwMatch) {
      const parsedGw = parseIpv4Cidr(defGwMatch[1]);
      if (!parsedGw) return { output: '% Invalid gateway IP.', updated: false, flavor: 'cisco' };
      this.deviceManager.updateDevice(dev.id, { network: { gateway: parsedGw.ip } });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config)# Default gateway diset ke ${parsedGw.ip}.`
      };
    }

    const ciscoRouteMatch = cmd.match(/^ip\s+route\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
    if (ciscoRouteMatch) {
      const dstParsed = parseIpv4Cidr(ciscoRouteMatch[1], ciscoRouteMatch[2]);
      const gwParsed = parseIpv4Cidr(ciscoRouteMatch[3]);
      if (!dstParsed || !gwParsed) return { output: '% Invalid ip route syntax.', updated: false, flavor: 'cisco' };
      this.addStaticRoute(dev.id, { dstNetwork: dstParsed.networkStr, prefix: dstParsed.prefix, gateway: gwParsed.ip });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config)# Static route ${dstParsed.networkStr}/${dstParsed.prefix} via ${gwParsed.ip} ditambahkan.`
      };
    }

    if (/^show\s+ip\s+route/i.test(cmd)) {
      const connected = this.getAllDeviceIpEntries(dev).map((e) => `C    ${e.parsed.networkStr}/${e.parsed.prefix} is directly connected, ${e.ifaceName}`);
      const statics = (dev.network?.routes || []).map((r) => `S${r.prefix === 0 ? '*' : ' '}   ${r.dstNetwork}/${r.prefix} [1/0] via ${r.gateway}`);
      const gwLine = dev.network?.gateway ? `Gateway of last resort is ${dev.network.gateway}` : 'Gateway of last resort is not set';
      return {
        updated: false,
        flavor: 'cisco',
        output: `${gwLine}\n${[...connected, ...statics].join('\n') || '(belum ada rute)'}`
      };
    }

    if (/^show\s+ip\s+int(?:erface)?\s+brief/i.test(cmd)) {
      const ports = this.getDevicePortList(dev);
      const rows = ports.slice(0, 12).map((p) => {
        const cfg = this.getEffectiveInterfaceConfig(dev, p.name);
        const st = (dev.status === 'offline' || cfg.status === 'down') ? 'administratively down' : 'up';
        return `${p.name.padEnd(20)} ${(cfg.ip || 'unassigned').padEnd(16)} YES manual ${st.padEnd(21)} ${st === 'up' ? 'up' : 'down'}`;
      });
      return {
        updated: false,
        flavor: 'cisco',
        output: `Interface            IP-Address       OK? Method Status                Protocol\n${rows.join('\n')}`
      };
    }

    if (/^show\s+vlan\s+brief/i.test(cmd)) {
      const ports = this.getDevicePortList(dev);
      const vlanMap = new Map();
      ports.forEach((p) => {
        const cfg = this.getEffectiveInterfaceConfig(dev, p.name);
        const vids = cfg.mode === 'trunk' ? (cfg.allowedVlans || [1]) : [cfg.vlan || curVlan];
        vids.forEach((v) => {
          if (!vlanMap.has(v)) vlanMap.set(v, []);
          vlanMap.get(v).push(`${p.name}${cfg.mode === 'trunk' ? '(T)' : ''}`);
        });
      });
      if (vlanMap.size === 0) vlanMap.set(curVlan, ['Gi0/1', 'Gi0/2']);
      const rows = [...vlanMap.entries()].sort((a, b) => a[0] - b[0]).map(([vid, plist]) =>
        `${String(vid).padEnd(4)} VLAN_${String(vid).padEnd(27)} active    ${plist.slice(0, 6).join(', ')}`
      );
      return {
        updated: false,
        flavor: 'cisco',
        output: `VLAN Name                             Status    Ports\n---- -------------------------------- --------- -------------------------------\n${rows.join('\n')}`
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
      const ifaces = Object.entries(this.getDeviceInterfacesMap(dev));
      const ifLines = ifaces.length > 0
        ? ifaces.flatMap(([name, c]) => [
            `interface ${name}`,
            c.ip ? ` ip address ${c.ip} ${c.subnet}` : ` ! no ip address`,
            c.mode === 'trunk'
              ? ` switchport mode trunk\n switchport trunk allowed vlan ${(c.allowedVlans || [1]).join(',')}`
              : (c.mode === 'access' ? ` switchport mode access\n switchport access vlan ${c.vlan || 1}` : ''),
            c.status === 'down' ? ' shutdown' : ' no shutdown'
          ].filter(Boolean))
        : [
            `interface GigabitEthernet0/0`,
            ` ip address ${curIp} ${curMask}`,
            ` switchport access vlan ${curVlan}`,
            ` no shutdown`
          ];
      const routeLines = (dev.network?.routes || []).map((r) => `ip route ${r.dstNetwork} ${prefixToSubnetMask(r.prefix)} ${r.gateway}`);
      return {
        updated: false,
        flavor: 'cisco',
        output: [
          `! Running config for ${dev.name}`,
          `hostname ${hostLabel}`,
          ...ifLines,
          ...(dev.network?.gateway ? [`ip default-gateway ${dev.network.gateway}`] : []),
          ...routeLines,
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

    const ipMatch = cmd.match(/^ip\s+address\s+([0-9.]+)(?:\/(\d+)|\s+([0-9.]+))?/i);
    if (ipMatch) {
      const rawIp = ipMatch[2] ? `${ipMatch[1]}/${ipMatch[2]}` : ipMatch[1];
      const parsed = parseIpv4Cidr(rawIp, ipMatch[3] || curMask);
      if (!parsed) {
        return { output: '% Invalid IP address or subnet mask.', updated: false, flavor: 'cisco' };
      }
      this.setInterfaceConfig(dev.id, ctx.selectedInterface, {
        ip: parsed.ip,
        prefix: parsed.prefix,
        subnet: parsed.maskStr,
        status: 'up'
      });
      return {
        updated: true,
        flavor: 'cisco',
        output: `${hostLabel}(config-if:${ctx.selectedInterface})# IPv4 diset ke ${parsed.ip} ${parsed.maskStr} (/${parsed.prefix})`
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

    if (/^dhcp\s+request/i.test(cmd)) {
      const leaseRes = this.requestDhcpLease(dev.id, ctx.selectedInterface);
      return {
        updated: leaseRes.success,
        flavor: 'cisco',
        output: leaseRes.steps.join('\n')
      };
    }

    return {
      updated: false,
      flavor: activeFlavor,
      output: `% Invalid input detected at "${cmd}". Ketik "help" untuk daftar perintah Cisco IOS & MikroTik.`
    };
  }
}
