/**
 * NetMap — Auto-Graded Jobsheet Practical Lab Engine (Phase 9C & 9D)
 * Orchestrates sandbox setup per SMKN 1 Beringin target room, troubleshooting fault injection,
 * fast real-time task evaluation (0-100 score), custom teacher jobsheet storage, and verification checksums.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { generateId } from '../utils/helpers.js';
import { sha256Hex } from '../storage/auth-manager.js';
import { DeviceSchema } from '../devices/device-schema.js';
import { CableSchema } from '../connections/cable-schema.js';
import { evaluateCableNeatness } from '../connections/cable-routing-engine.js';
import {
  isDecorationRoom,
  isPointInsideRoomOBB,
  buildBuildingDocumentationSummary
} from '../map/room-spatial-index.js';
import { BUILTIN_JOBSHEETS, validateCustomJobsheet } from './jobsheet-catalog.js';

const CUSTOM_JOBSHEETS_KEY = 'netmap_custom_jobsheets_v1';

function parseIpOctets(ipStr) {
  const clean = String(ipStr || '').trim().split('/')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null;
  return parts;
}

function ipInCidr(ipStr, cidrStr) {
  const ip = parseIpOctets(ipStr);
  if (!ip) return false;
  const [netRaw, pfxRaw] = String(cidrStr || '').split('/');
  const net = parseIpOctets(netRaw);
  const pfx = parseInt(pfxRaw || '24', 10);
  if (!net || !Number.isFinite(pfx) || pfx < 0 || pfx > 32) return false;
  const mask = pfx === 0 ? 0 : ((0xffffffff << (32 - pfx)) >>> 0);
  const ipInt = (((ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3]) >>> 0);
  const netInt = (((net[0] << 24) | (net[1] << 16) | (net[2] << 8) | net[3]) >>> 0);
  return ((ipInt & mask) >>> 0) === ((netInt & mask) >>> 0);
}

function matchesDeviceRole(device, roleToken) {
  const token = String(roleToken || '').toLowerCase();
  const type = String(device?.type || '').toLowerCase();
  const cat = String(device?.category || '').toLowerCase();
  if (token === 'router') return type.includes('router');
  if (token === 'switch') return type.includes('switch');
  if (token === 'ap' || token === 'access-point') return type.includes('access-point') || type === 'ap';
  if (token === 'pc' || token === 'end') return cat === 'enddevice' || type === 'pc' || type === 'laptop' || type === 'server';
  if (token === 'core') return cat === 'core' || type.includes('router') || type.includes('core-switch');
  if (token === 'any') return true;
  return type === token || cat === token;
}

export class JobsheetEngine {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('../storage/project-storage.js').ProjectStorage} [options.projectStorage]
   * @param {() => import('../map/map-3d-engine.js').Map3DEngine} [options.getMap3DEngine]
   */
  constructor({ deviceManager, cableManager, projectStorage = null, getMap3DEngine = null }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.projectStorage = projectStorage;
    this.getMap3DEngine = getMap3DEngine;

    this.customJobsheets = this._loadCustomJobsheets();
    this.activeJobsheet = null;
    this.targetRoomId = null;
    this.startedAt = null;
    this.pingHistory = [];
    this.dhcpLeasedDeviceIds = new Set();
    this.injectedBugMeta = null;
    this.lastEvaluation = null;

    this.bindEvents();
  }

  _loadCustomJobsheets() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(CUSTOM_JOBSHEETS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  _saveCustomJobsheets() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(CUSTOM_JOBSHEETS_KEY, JSON.stringify(this.customJobsheets));
    } catch { /* ignore */ }
  }

  getAllJobsheets() {
    return [...BUILTIN_JOBSHEETS, ...this.customJobsheets];
  }

  getJobsheetById(id) {
    return this.getAllJobsheets().find((j) => j.id === id) || null;
  }

  /**
   * Validate and register a Teacher Custom Jobsheet JSON into catalog.
   * @param {Object|string} rawJsonOrObj
   * @returns {{ valid: boolean, errors: string[], jobsheet: Object|null }}
   */
  importCustomJobsheet(rawJsonOrObj) {
    let obj = rawJsonOrObj;
    if (typeof rawJsonOrObj === 'string') {
      try {
        obj = JSON.parse(rawJsonOrObj);
      } catch {
        return { valid: false, errors: ['Teks JSON tidak valid (syntax error).'], jobsheet: null };
      }
    }
    const res = validateCustomJobsheet(obj);
    if (!res.valid || !res.jobsheet) return res;

    const idx = this.customJobsheets.findIndex((j) => j.id === res.jobsheet.id);
    if (idx >= 0) this.customJobsheets[idx] = res.jobsheet;
    else this.customJobsheets.push(res.jobsheet);
    this._saveCustomJobsheets();
    eventBus.emit('jobsheet:catalog-updated', { jobsheets: this.getAllJobsheets() });
    return res;
  }

  deleteCustomJobsheet(id) {
    const before = this.customJobsheets.length;
    this.customJobsheets = this.customJobsheets.filter((j) => j.id !== id);
    if (this.customJobsheets.length !== before) {
      this._saveCustomJobsheets();
      eventBus.emit('jobsheet:catalog-updated', { jobsheets: this.getAllJobsheets() });
      return true;
    }
    return false;
  }

  /**
   * Resolve the best matching SMKN 1 Beringin target building with 3-tier graceful fallback:
   * (1) presetId match -> (2) keyword match on name/URL -> (3) first non-decoration building or null.
   * @param {Object} jobsheet
   * @param {string} [roomMatchOverride='']
   * @returns {Object|null}
   */
  resolveTargetRoom(jobsheet, roomMatchOverride = '') {
    const rooms = (stateManager.getRooms3d?.() || []).filter((r) => !isDecorationRoom(r));
    if (rooms.length === 0) return null;

    const matchKey = String(roomMatchOverride || jobsheet?.targetRoomPreset || '').trim().toLowerCase();
    const keywords = [
      ...(matchKey ? [matchKey] : []),
      ...(Array.isArray(jobsheet?.targetRoomKeywords) ? jobsheet.targetRoomKeywords : [])
    ].filter(Boolean);

    // Tier 1: presetId / URL match
    if (matchKey) {
      const byPreset = rooms.find((r) =>
        String(r.presetId || '').toLowerCase().includes(matchKey)
        || String(r.customModelUrl || '').toLowerCase().includes(matchKey)
      );
      if (byPreset) return byPreset;
    }

    // Tier 2: case-insensitive keyword match on room name or doc.roomCode
    for (const kw of keywords) {
      const byName = rooms.find((r) =>
        String(r.name || '').toLowerCase().includes(kw)
        || String(r.doc?.roomCode || '').toLowerCase().includes(kw)
      );
      if (byName) return byName;
    }

    // Tier 3: graceful fallback to first main building
    return rooms[0];
  }

  _getSpatialOptions() {
    const projectMap = stateManager.getState?.()?.project?.map || {};
    return {
      mapWidthMeters: this.cableManager?.mapWidthMeters || 170,
      naturalWidth: projectMap.naturalWidth || 1024,
      naturalHeight: projectMap.naturalHeight || 1024,
      allRooms: stateManager.getRooms3d?.() || []
    };
  }

  /**
   * Start a guided Jobsheet inside an isolated Student Practice Sandbox.
   * @param {string|Object} jobsheetOrId
   * @returns {{ jobsheet: Object, targetRoom: Object|null, evaluation: Object }|null}
   */
  startJobsheet(jobsheetOrId) {
    const js = typeof jobsheetOrId === 'string'
      ? this.getJobsheetById(jobsheetOrId)
      : jobsheetOrId;
    if (!js) return null;

    const keepDevices = js.setupMode === 'keep-current' || js.setupMode === 'clear-target-room';
    if (this.projectStorage?.forkToPracticeSandbox) {
      this.projectStorage.forkToPracticeSandbox({
        keepDevices,
        sandboxId: js.id,
        label: `Jobsheet ${js.code || js.id}`,
        jobsheetId: js.id
      });
    } else {
      stateManager.setSessionMode?.('student-sandbox', { jobsheetId: js.id });
    }

    const targetRoom = this.resolveTargetRoom(js);
    this.activeJobsheet = js;
    this.targetRoomId = targetRoom?.id || null;
    this.startedAt = Date.now();
    this.pingHistory = [];
    this.dhcpLeasedDeviceIds.clear();
    this.injectedBugMeta = null;

    const anchorX = typeof targetRoom?.x === 'number' ? targetRoom.x : 0.50;
    const anchorY = typeof targetRoom?.y === 'number' ? targetRoom.y : 0.50;

    // Setup arena according to setupMode
    if (js.setupMode === 'clear-target-room' && targetRoom) {
      const opts = this._getSpatialOptions();
      const devs = this.deviceManager?.getAllDevices?.() || [];
      devs.forEach((d) => {
        if (d?.position && isPointInsideRoomOBB(d.position.x, d.position.y, targetRoom, opts)) {
          this.deviceManager.deleteDevice(d.id);
        }
      });
    } else if (js.setupMode === 'starter-topology' || js.setupMode === 'inject-troubleshooting-bugs') {
      this._seedStarterTopology(js, anchorX, anchorY);
    }

    if (js.setupMode === 'inject-troubleshooting-bugs') {
      this.injectedBugMeta = this._injectThreeTroubleshootingBugs();
    }

    this.projectStorage?.captureSandboxBaseline?.();
    stateManager.setActiveJobsheetId?.(js.id);

    const evaluation = this.evaluateAll();
    eventBus.emit('jobsheet:started', { jobsheet: js, targetRoom, evaluation });
    return { jobsheet: js, targetRoom, evaluation };
  }

  _seedStarterTopology(js, anchorX, anchorY) {
    const keyToId = new Map();
    const starterDevs = Array.isArray(js.starterDevices) ? js.starterDevices : [];
    const starterCabs = Array.isArray(js.starterCables) ? js.starterCables : [];

    starterDevs.forEach((sd) => {
      const id = generateId(`jsdev-${sd.key || 'd'}`);
      const devObj = DeviceSchema.create({
        id,
        name: sd.name,
        type: sd.type,
        category: sd.category || 'core',
        position: {
          x: Math.max(0.05, Math.min(0.95, anchorX + (Number(sd.offsetX) || 0))),
          y: Math.max(0.05, Math.min(0.95, anchorY + (Number(sd.offsetY) || 0)))
        },
        spatial3d: { elevationMeters: Number(sd.elevation) || 1.0 },
        network: {
          ip: sd.ip || '',
          subnet: '255.255.255.0',
          vlan: Number(sd.vlan) || 1,
          gateway: sd.gateway || ''
        },
        status: 'online'
      });
      this.deviceManager?.addDevice?.(devObj);
      keyToId.set(sd.key, id);
    });

    starterCabs.forEach((sc) => {
      const srcId = keyToId.get(sc.from);
      const dstId = keyToId.get(sc.to);
      if (!srcId || !dstId) return;
      const cabObj = CableSchema.create({
        id: generateId('jscab'),
        name: sc.name || `Link ${sc.from} -> ${sc.to}`,
        source: srcId,
        destination: dstId,
        type: sc.type || 'ethernet',
        cableCategory: sc.cableCategory || 'cat6',
        status: 'active',
        details: {
          portSource: sc.portSource || '',
          portDestination: sc.portDestination || ''
        }
      });
      this.cableManager?.addConnection?.(cabObj);
    });
  }

  /**
   * Inject 3 realistic troubleshooting faults for Jobsheet 5 (UKK):
   * 1) Layer 1: mark backbone cable as 'damaged'
   * 2) Layer 2: set first PC to mismatched VLAN 999
   * 3) Layer 3: set second PC to wrong subnet 10.99.99.50 / wrong gateway 10.99.99.1
   */
  _injectThreeTroubleshootingBugs() {
    const cables = this.cableManager?.getAllConnections?.() || [];
    const devices = this.deviceManager?.getAllDevices?.() || [];
    const meta = { bugCableId: null, bugVlanDeviceId: null, bugIpDeviceId: null };

    const backbone = cables.find((c) => c.type === 'fiber') || cables[0] || null;
    if (backbone) {
      this.cableManager.updateConnection(backbone.id, { status: 'damaged' });
      meta.bugCableId = backbone.id;
    }

    const endDevs = devices.filter((d) => d.category === 'endDevice' || d.type === 'pc' || d.type === 'laptop');
    if (endDevs[0]) {
      this.deviceManager.updateDevice(endDevs[0].id, {
        network: { ...(endDevs[0].network || {}), vlan: 999 }
      });
      meta.bugVlanDeviceId = endDevs[0].id;
    }
    if (endDevs[1]) {
      this.deviceManager.updateDevice(endDevs[1].id, {
        network: {
          ...(endDevs[1].network || {}),
          ip: '10.99.99.50',
          gateway: '10.99.99.1'
        }
      });
      meta.bugIpDeviceId = endDevs[1].id;
    }
    return meta;
  }

  restartActiveJobsheet() {
    if (!this.activeJobsheet) return null;
    return this.startJobsheet(this.activeJobsheet);
  }

  stopJobsheet() {
    const prev = this.activeJobsheet;
    this.activeJobsheet = null;
    this.targetRoomId = null;
    this.startedAt = null;
    this.pingHistory = [];
    this.dhcpLeasedDeviceIds.clear();
    this.injectedBugMeta = null;
    this.lastEvaluation = null;
    stateManager.setActiveJobsheetId?.(null);
    eventBus.emit('jobsheet:stopped', { prevJobsheet: prev });
  }

  recordPingResult(res) {
    if (!res) return;
    this.pingHistory.push({
      success: Boolean(res.success),
      sourceId: res.sourceId || '',
      targetId: res.targetId || '',
      sourceIp: res.sourceIp || '',
      targetIp: res.targetIp || '',
      at: Date.now()
    });
    if (this.activeJobsheet) {
      this.evaluateAll();
    }
  }

  recordDhcpLease(deviceId) {
    if (deviceId) this.dhcpLeasedDeviceIds.add(deviceId);
    if (this.activeJobsheet) {
      this.evaluateAll();
    }
  }

  /**
   * Evaluate all tasks of the active Jobsheet deterministically in < 5ms.
   * @returns {Object|null}
   */
  evaluateAll() {
    if (!this.activeJobsheet) return null;
    const js = this.activeJobsheet;
    const devices = this.deviceManager?.getAllDevices?.() || [];
    const connections = this.cableManager?.getAllConnections?.() || [];
    const rooms = stateManager.getRooms3d?.() || [];
    const spatialOpts = this._getSpatialOptions();

    const evaluatedTasks = js.tasks.map((task) => {
      const res = this._evaluateSingleTask(task.evaluator || {}, {
        js,
        devices,
        connections,
        rooms,
        spatialOpts
      });
      return {
        ...task,
        passed: Boolean(res.passed),
        detail: String(res.detail || '')
      };
    });

    const totalWeight = evaluatedTasks.reduce((acc, t) => acc + (Number(t.weight) || 0), 0) || 100;
    const earnedWeight = evaluatedTasks.reduce((acc, t) => acc + (t.passed ? (Number(t.weight) || 0) : 0), 0);
    const score = Math.round((earnedWeight / totalWeight) * 100);
    const passedCount = evaluatedTasks.filter((t) => t.passed).length;
    const elapsedSeconds = this.startedAt ? Math.max(0, Math.round((Date.now() - this.startedAt) / 1000)) : 0;

    const summary = {
      jobsheet: js,
      targetRoomId: this.targetRoomId,
      tasks: evaluatedTasks,
      passedCount,
      totalCount: evaluatedTasks.length,
      score,
      isComplete: passedCount === evaluatedTasks.length && evaluatedTasks.length > 0,
      elapsedSeconds
    };
    this.lastEvaluation = summary;
    eventBus.emit('jobsheet:evaluated', summary);
    return summary;
  }

  _evaluateSingleTask(ev, { js, devices, connections, spatialOpts }) {
    const type = String(ev?.type || '');

    if (type === 'devices-in-room') {
      const targetRoom = (this.targetRoomId && stateManager.getRoom3dById?.(this.targetRoomId))
        || this.resolveTargetRoom(js, ev.roomMatch);
      const candidates = targetRoom
        ? buildBuildingDocumentationSummary(targetRoom, devices, connections, [], spatialOpts).devicesInside
        : devices;
      const reqs = Array.isArray(ev.requires) ? ev.requires : ['router', 'switch'];
      const missing = reqs.filter((role) => !candidates.some((d) => matchesDeviceRole(d, role)));
      return {
        passed: missing.length === 0,
        detail: missing.length === 0
          ? `${candidates.length} perangkat terdeteksi di ${targetRoom?.name || 'area praktik'}`
          : `Kurang: ${missing.join(', ')}`
      };
    }

    if (type === 'neat-cables-count') {
      const minCount = Number(ev.minCount) || 1;
      const minNeat = Number(ev.minNeatness) || 75;
      let neatCount = 0;
      for (const c of connections) {
        if (c.status === 'damaged') continue;
        const rep = evaluateCableNeatness(c, {
          devices,
          mapWidthMeters: spatialOpts.mapWidthMeters
        });
        if ((rep?.score ?? 0) >= minNeat) neatCount += 1;
      }
      return {
        passed: neatCount >= minCount,
        detail: `${neatCount}/${minCount} kabel rapi (skor >= ${minNeat})`
      };
    }

    if (type === 'subnet-configured') {
      const cidr = ev.cidr || '192.168.10.0/24';
      const minHosts = Number(ev.minHosts) || 2;
      const matchedIps = new Set();
      for (const d of devices) {
        if (ipInCidr(d.network?.ip, cidr)) matchedIps.add(d.network.ip);
        Object.values(d.simConfig?.interfaces || {}).forEach((ifc) => {
          if (ipInCidr(ifc?.ip, cidr)) matchedIps.add(String(ifc.ip).split('/')[0]);
        });
      }
      return {
        passed: matchedIps.size >= minHosts,
        detail: `${matchedIps.size}/${minHosts} host aktif di ${cidr}`
      };
    }

    if (type === 'multi-subnet-configured') {
      const cidrs = Array.isArray(ev.cidrs) ? ev.cidrs : [];
      const missing = cidrs.filter((cidr) => !devices.some((d) => {
        if (ipInCidr(d.network?.ip, cidr)) return true;
        return Object.values(d.simConfig?.interfaces || {}).some((ifc) => ipInCidr(ifc?.ip, cidr));
      }));
      return {
        passed: missing.length === 0 && cidrs.length > 0,
        detail: missing.length === 0 ? 'Semua subnet aktif' : `Belum aktif: ${missing.join(', ')}`
      };
    }

    if (type === 'vlans-configured') {
      const reqVlans = Array.isArray(ev.vlans) ? ev.vlans.map(Number) : [10, 20];
      const present = new Set();
      for (const d of devices) {
        if (Number(d.network?.vlan) > 0) present.add(Number(d.network.vlan));
        Object.values(d.simConfig?.interfaces || {}).forEach((ifc) => {
          if (Number(ifc?.accessVlan) > 0) present.add(Number(ifc.accessVlan));
          if (Number(ifc?.nativeVlan) > 0) present.add(Number(ifc.nativeVlan));
          if (Array.isArray(ifc?.trunkVlans)) ifc.trunkVlans.forEach((v) => present.add(Number(v)));
        });
      }
      const missing = reqVlans.filter((v) => !present.has(v));
      return {
        passed: missing.length === 0,
        detail: missing.length === 0 ? `VLAN ${reqVlans.join(', ')} aktif` : `Kurang VLAN: ${missing.join(', ')}`
      };
    }

    if (type === 'trunk-port-configured') {
      const minCount = Number(ev.minCount) || 1;
      let count = 0;
      for (const d of devices) {
        Object.values(d.simConfig?.interfaces || {}).forEach((ifc) => {
          if (String(ifc?.mode || '').toLowerCase() === 'trunk') count += 1;
        });
      }
      return {
        passed: count >= minCount,
        detail: `${count}/${minCount} port mode trunk`
      };
    }

    if (type === 'dhcp-server-enabled') {
      const ok = devices.some((d) =>
        Object.values(d.simConfig?.dhcpServers || {}).some((s) => Boolean(s?.enabled))
      );
      return { passed: ok, detail: ok ? 'DHCP Server aktif' : 'DHCP Server belum aktif' };
    }

    if (type === 'nat-masquerade-enabled') {
      const ok = devices.some((d) => Boolean(d.simConfig?.nat?.masquerade));
      return { passed: ok, detail: ok ? 'NAT Masquerade aktif' : 'NAT Masquerade belum aktif' };
    }

    if (type === 'dhcp-client-leased') {
      const leased = this.dhcpLeasedDeviceIds.size > 0
        || devices.some((d) => Boolean(d.simConfig?.dhcpLease?.ip) || (d.category === 'endDevice' && parseIpOctets(d.network?.ip)));
      return { passed: leased, detail: leased ? 'Client memperoleh IP otomatis' : 'Belum ada lease DHCP client' };
    }

    if (type === 'fiber-backbone-ducted') {
      const minNeat = Number(ev.minNeatness) || 75;
      const foLinks = connections.filter((c) => c.type === 'fiber' || String(c.cableCategory || '').startsWith('fiber'));
      const goodFo = foLinks.find((c) => {
        const hasConduit = Boolean(c.details?.conduitType && c.details.conduitType !== 'none');
        const rep = evaluateCableNeatness(c, { devices, mapWidthMeters: spatialOpts.mapWidthMeters });
        return hasConduit && (rep?.score ?? 0) >= minNeat;
      });
      return {
        passed: Boolean(goodFo),
        detail: goodFo ? 'Backbone FO ber-ducting rapi' : 'Belum ada kabel FO dengan ducting/tray & skor >= 75'
      };
    }

    if (type === 'ceiling-ap-mounted') {
      const minZ = Number(ev.minElevation) || 2.5;
      const ap = devices.find((d) =>
        matchesDeviceRole(d, 'access-point') && (Number(d.spatial3d?.elevationMeters) || 0) >= minZ
      );
      return {
        passed: Boolean(ap),
        detail: ap ? `${ap.name} terpasang di Z=${Number(ap.spatial3d.elevationMeters).toFixed(1)}m` : `Pasang AP dengan elevasi Z >= ${minZ}m`
      };
    }

    if (type === 'ssid-configured') {
      const ap = devices.find((d) => matchesDeviceRole(d, 'access-point') && String(d.network?.ssid || '').trim().length > 0);
      return {
        passed: Boolean(ap),
        detail: ap ? `SSID: ${ap.network.ssid}` : 'Belum ada SSID WiFi dikonfigurasi pada AP'
      };
    }

    if (type === 'no-damaged-cables') {
      const damaged = connections.filter((c) => c.status === 'damaged');
      return {
        passed: connections.length > 0 && damaged.length === 0,
        detail: damaged.length === 0 ? 'Semua kabel aktif normal' : `Masih ada ${damaged.length} kabel berstatus Damaged`
      };
    }

    if (type === 'no-vlan-mismatch') {
      const expVlan = Number(ev.expectedVlan) || 50;
      const badDevs = devices.filter((d) => Number(d.network?.vlan) === 999 || (this.injectedBugMeta?.bugVlanDeviceId === d.id && Number(d.network?.vlan) !== expVlan));
      return {
        passed: badDevs.length === 0,
        detail: badDevs.length === 0 ? `Semua perangkat pada VLAN ${expVlan}` : `${badDevs.length} perangkat masih VLAN mismatch`
      };
    }

    if (type === 'gateway-subnet-valid') {
      const expCidr = ev.expectedCidr || '192.168.50.0/24';
      const expGw = ev.expectedGateway || '192.168.50.1';
      const endDevs = devices.filter((d) => d.category === 'endDevice' || d.type === 'pc');
      const ok = endDevs.length > 0 && endDevs.every((d) =>
        ipInCidr(d.network?.ip, expCidr) && (!expGw || String(d.network?.gateway || '').trim() === expGw || ipInCidr(d.network?.gateway, expCidr))
      );
      return {
        passed: ok,
        detail: ok ? `Semua PC valid pada ${expCidr}` : `Periksa IP & gateway PC (${expCidr})`
      };
    }

    if (type === 'ping-success') {
      const fromCat = ev.fromCategory || 'any';
      const toCat = ev.toCategory || 'any';
      const hit = this.pingHistory.find((p) => {
        if (!p.success) return false;
        const srcDev = this.deviceManager?.getDeviceById?.(p.sourceId);
        const dstDev = this.deviceManager?.getDeviceById?.(p.targetId);
        const okSrc = fromCat === 'any' || (srcDev && matchesDeviceRole(srcDev, fromCat));
        const okDst = toCat === 'any' || (dstDev && matchesDeviceRole(dstDev, toCat)) || (ev.targetIp && p.targetIp === ev.targetIp);
        return okSrc && okDst;
      });
      return {
        passed: Boolean(hit),
        detail: hit ? `Ping sukses (${hit.sourceIp || 'src'} -> ${hit.targetIp || 'dst'})` : 'Belum ada hasil Ping sukses'
      };
    }

    return { passed: false, detail: `Evaluator tidak dikenal: ${type}` };
  }

  /**
   * Generate an official student practical submission report with deterministic anti-tamper checksum.
   * @param {{ studentName: string, studentClass: string, studentNumber?: string }} studentInfo
   * @returns {Object|null}
   */
  generateSubmissionReport({ studentName = '', studentClass = '', studentNumber = '' } = {}) {
    const evaluation = this.evaluateAll();
    if (!evaluation) return null;

    const devices = this.deviceManager?.getAllDevices?.() || [];
    const connections = this.cableManager?.getAllConnections?.() || [];
    const spatialOpts = this._getSpatialOptions();

    const neatScores = connections.map((c) =>
      evaluateCableNeatness(c, { devices, mapWidthMeters: spatialOpts.mapWidthMeters })?.score ?? 100
    );
    const avgNeatness = neatScores.length > 0
      ? Math.round(neatScores.reduce((a, b) => a + b, 0) / neatScores.length)
      : 100;

    const submittedAt = new Date().toISOString();
    const topologySignature = [
      devices.length,
      connections.length,
      devices.map((d) => `${d.type}:${d.network?.ip || ''}:${d.network?.vlan || ''}`).sort().join(','),
      avgNeatness
    ].join('|');

    const checksumRaw = sha256Hex(
      `${String(studentName).trim()}|${String(studentClass).trim()}|${evaluation.jobsheet.id}|${evaluation.score}|${submittedAt}|${topologySignature}`
    ).toUpperCase();
    const checksum = `SMKN1-${checksumRaw.slice(0, 4)}-${checksumRaw.slice(4, 8)}-${checksumRaw.slice(8, 12)}`;

    return {
      schoolName: 'SMK Negeri 1 Beringin',
      studentName: String(studentName || 'Siswa TJKT').trim(),
      studentClass: String(studentClass || '-').trim(),
      studentNumber: String(studentNumber || '-').trim(),
      jobsheetId: evaluation.jobsheet.id,
      jobsheetCode: evaluation.jobsheet.code,
      jobsheetTitle: evaluation.jobsheet.title,
      jobsheetLevel: evaluation.jobsheet.level,
      score: evaluation.score,
      passedCount: evaluation.passedCount,
      totalCount: evaluation.totalCount,
      elapsedSeconds: evaluation.elapsedSeconds,
      tasks: evaluation.tasks,
      deviceCount: devices.length,
      cableCount: connections.length,
      avgNeatness,
      devicesSummary: devices.map((d) => ({
        name: d.name,
        type: d.type,
        ip: d.network?.ip || '-',
        vlan: d.network?.vlan || '-',
        ssid: d.network?.ssid || '-'
      })),
      submittedAt,
      checksum
    };
  }

  bindEvents() {
    const reEval = () => {
      if (this.activeJobsheet) {
        this.evaluateAll();
      }
    };
    eventBus.on('device:added', reEval);
    eventBus.on('device:updated', reEval);
    eventBus.on('device:deleted', reEval);
    eventBus.on('device:moved', reEval);
    eventBus.on('connection:added', reEval);
    eventBus.on('connection:updated', reEval);
    eventBus.on('connection:deleted', reEval);
    eventBus.on('simulator:config-updated', reEval);
    eventBus.on('simulator:dhcp-lease', ({ deviceId } = {}) => {
      this.recordDhcpLease(deviceId);
    });
    eventBus.on('simulator:ping-completed', (res) => {
      this.recordPingResult(res);
    });
  }
}
