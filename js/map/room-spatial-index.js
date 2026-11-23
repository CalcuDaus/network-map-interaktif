/**
 * NetMap — Room Spatial Index & Building Documentation Aggregator (Phase 8A)
 * Deterministic OBB point-in-rotated-building detection, device/cable/object grouping,
 * VLAN/Subnet/SSID extraction, and 1-click device location synchronization.
 */

const DECORATION_ROOM_RE = /pohon|bunga|kaktus|tong_sampah|keran_air|wastafel|plank_|banner_kejuruan|halte|rak_bunga|tempat_duduk|tiang_|bendera|taman_|pot_|lampu_taman|kandang_burung|lapangan_futsal|gawang_|lorong_bunga|dekorasi|decoration/i;

const DEVICE_TYPE_SORT_ORDER = {
  'main-router': 1,
  router: 2,
  firewall: 3,
  'core-switch': 4,
  'dist-switch': 5,
  'access-switch': 6,
  switch: 7,
  'access-point': 8,
  'ptp-dish': 9,
  server: 10,
  nvr: 11,
  nas: 12,
  rack: 13,
  ups: 14,
  pc: 15,
  laptop: 16,
  printer: 17,
  cctv: 18
};

/**
 * Normalize optional room.doc metadata while preserving backward compatibility.
 * @param {Object} [rawDoc]
 * @returns {Object}
 */
export function normalizeRoomDoc(rawDoc = {}) {
  const src = rawDoc && typeof rawDoc === 'object' ? rawDoc : {};
  const logs = Array.isArray(src.maintenanceLogs)
    ? src.maintenanceLogs
        .filter((l) => l && typeof l === 'object')
        .map((l, idx) => ({
          id: String(l.id || `mlog-${idx + 1}`),
          date: String(l.date || ''),
          technician: String(l.technician || ''),
          category: String(l.category || 'general'),
          status: String(l.status || 'ok'),
          summary: String(l.summary || '')
        }))
    : [];

  return {
    roomCode: String(src.roomCode || '').trim(),
    zone: String(src.zone || '').trim(),
    picName: String(src.picName || '').trim(),
    showSignboard: typeof src.showSignboard === 'boolean' ? src.showSignboard : null,
    isBuilding: typeof src.isBuilding === 'boolean' ? src.isBuilding : null,
    notes: String(src.notes || ''),
    maintenanceLogs: logs
  };
}

/**
 * Determine whether a room3d entry is an outdoor decorative prop (tree, trash bin, faucet, sign)
 * rather than a network-housing building.
 * @param {Object} room
 * @returns {boolean}
 */
export function isDecorationRoom(room) {
  if (!room || typeof room !== 'object') return true;
  if (room.doc?.isBuilding === true) return false;
  if (room.doc?.isBuilding === false) return true;
  if (String(room.category || '').toLowerCase() === 'decoration') return true;

  const probe = `${room.customModelUrl || ''} ${room.presetId || ''} ${room.name || ''}`;
  if (DECORATION_ROOM_RE.test(probe)) return true;

  const w = Number(room.widthMeters) || 0;
  const d = Number(room.depthMeters) || 0;
  if (w > 0 && d > 0 && w <= 1.6 && d <= 1.6) return true;

  return false;
}

/**
 * Determine whether a room3d should show a 3D roof signboard by default.
 * @param {Object} room
 * @returns {boolean}
 */
export function isBuildingSignboardEligible(room) {
  if (!room || typeof room !== 'object') return false;
  if (room.doc?.showSignboard === true) return true;
  if (room.doc?.showSignboard === false) return false;
  return !isDecorationRoom(room);
}

/**
 * Convert normalized map coordinates (0..1) to 3D world meters (X, Z) matching Map3DEngine.
 * @param {number} normX
 * @param {number} normY
 * @param {Object} [options]
 * @returns {{ x: number, z: number }}
 */
export function normToWorldMeters(normX, normY, options = {}) {
  const worldW = Number(options.mapWidthMeters) > 0 ? Number(options.mapWidthMeters) : 170;
  const natW = Number(options.naturalWidth) > 0 ? Number(options.naturalWidth) : 1024;
  const natH = Number(options.naturalHeight) > 0 ? Number(options.naturalHeight) : 1024;
  const worldD = Number(options.mapHeightMeters) > 0
    ? Number(options.mapHeightMeters)
    : worldW * (natH / natW);
  return {
    x: ((Number(normX) || 0.5) - 0.5) * worldW,
    z: ((Number(normY) || 0.5) - 0.5) * worldD
  };
}

/**
 * Project a normalized (0..1) map point into a rotated room's local meter coordinate frame.
 * Matches Three.js right-handed Y-up rotation (`group.rotation.y = rotY`).
 * @param {number} normX
 * @param {number} normY
 * @param {Object} room
 * @param {Object} [options]
 * @returns {{ inside: boolean, lx: number, lz: number, halfW: number, halfD: number, distSq: number, area: number }}
 */
export function computeLocalPointInRoom(normX, normY, room, options = {}) {
  const margin = Number.isFinite(options.marginMeters) ? Number(options.marginMeters) : 0.35;
  const pt = normToWorldMeters(normX, normY, options);
  const center = normToWorldMeters(room?.x ?? 0.5, room?.y ?? 0.5, options);

  const dx = pt.x - center.x;
  const dz = pt.z - center.z;
  const rotDeg = Number(room?.rotationY ?? room?.rotationDeg) || 0;
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Inverse of Three.js Y-rotation matrix:
  // worldX = lx*cos + lz*sin, worldZ = -lx*sin + lz*cos
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;

  const w = Math.max(0.5, Number(room?.widthMeters) || 14);
  const d = Math.max(0.5, Number(room?.depthMeters) || 12);
  const halfW = w * 0.5;
  const halfD = d * 0.5;

  const inside = Math.abs(lx) <= (halfW + margin) && Math.abs(lz) <= (halfD + margin);
  return {
    inside,
    lx,
    lz,
    halfW,
    halfD,
    distSq: (lx * lx) + (lz * lz),
    area: w * d
  };
}

/**
 * Test if a normalized point falls inside a rotated room's oriented bounding box (OBB).
 * @param {number} normX
 * @param {number} normY
 * @param {Object} room
 * @param {Object} [options]
 * @returns {boolean}
 */
export function isPointInsideRoomOBB(normX, normY, room, options = {}) {
  if (!room || typeof normX !== 'number' || typeof normY !== 'number') return false;
  return computeLocalPointInRoom(normX, normY, room, options).inside;
}

/**
 * Find the best-matching building containing a normalized point.
 * Excludes small decorative props by default. When buildings overlap slightly at margin boundaries,
 * prefers strictly-inside hits first, then smallest building footprint, then closest center.
 * @param {number} normX
 * @param {number} normY
 * @param {Object[]} rooms3d
 * @param {Object} [options]
 * @returns {Object|null}
 */
export function findBuildingForPoint(normX, normY, rooms3d = [], options = {}) {
  if (!Array.isArray(rooms3d) || rooms3d.length === 0) return null;
  if (typeof normX !== 'number' || typeof normY !== 'number') return null;

  const includeDecorations = Boolean(options.includeDecorations);
  let best = null;

  for (let i = 0; i < rooms3d.length; i++) {
    const room = rooms3d[i];
    if (!room) continue;
    if (!includeDecorations && isDecorationRoom(room)) continue;

    const hit = computeLocalPointInRoom(normX, normY, room, options);
    if (!hit.inside) continue;

    const strictlyInside = Math.abs(hit.lx) <= hit.halfW && Math.abs(hit.lz) <= hit.halfD;
    const candidate = { room, strictlyInside, area: hit.area, distSq: hit.distSq };

    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.strictlyInside !== best.strictlyInside) {
      if (candidate.strictlyInside) best = candidate;
      continue;
    }
    if (Math.abs(candidate.area - best.area) > 0.5) {
      if (candidate.area < best.area) best = candidate;
      continue;
    }
    if (candidate.distSq < best.distSq) {
      best = candidate;
    }
  }

  return best ? best.room : null;
}

/**
 * Find the building containing a given network device.
 * @param {Object} device
 * @param {Object[]} rooms3d
 * @param {Object} [options]
 * @returns {Object|null}
 */
export function findBuildingForDevice(device, rooms3d = [], options = {}) {
  const x = device?.position?.x;
  const y = device?.position?.y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return findBuildingForPoint(x, y, rooms3d, options);
}

/**
 * Derive a CIDR network string (e.g. "192.168.10.0/24") from IPv4 + dotted subnet mask or CIDR.
 * @param {string} ipRaw
 * @param {string} [maskRaw='255.255.255.0']
 * @returns {string}
 */
function deriveSubnetCidr(ipRaw, maskRaw = '255.255.255.0') {
  const clean = String(ipRaw || '').trim();
  if (!clean) return '';
  let ipPart = clean;
  let prefix = null;

  if (clean.includes('/')) {
    const [addr, pfxStr] = clean.split('/');
    ipPart = addr.trim();
    const p = parseInt(pfxStr, 10);
    if (Number.isFinite(p) && p >= 0 && p <= 32) prefix = p;
  }

  const octets = ipPart.split('.').map((n) => parseInt(n, 10));
  if (octets.length !== 4 || octets.some((o) => !Number.isFinite(o) || o < 0 || o > 255)) {
    return '';
  }

  let maskInt = 0xffffff00;
  if (prefix !== null) {
    maskInt = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  } else {
    const mOctets = String(maskRaw || '255.255.255.0').trim().split('.').map((n) => parseInt(n, 10));
    if (mOctets.length === 4 && !mOctets.some((o) => !Number.isFinite(o) || o < 0 || o > 255)) {
      maskInt = (((mOctets[0] << 24) | (mOctets[1] << 16) | (mOctets[2] << 8) | mOctets[3]) >>> 0);
      let bits = 0;
      let tmp = maskInt;
      while (tmp & 0x80000000) {
        bits++;
        tmp = (tmp << 1) >>> 0;
      }
      prefix = bits;
    } else {
      prefix = 24;
    }
  }

  const ipInt = (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
  const netInt = (ipInt & maskInt) >>> 0;
  const n0 = (netInt >>> 24) & 255;
  const n1 = (netInt >>> 16) & 255;
  const n2 = (netInt >>> 8) & 255;
  const n3 = netInt & 255;
  return `${n0}.${n1}.${n2}.${n3}/${prefix}`;
}

function classifyCableMedia(cable) {
  const type = String(cable?.type || '').toLowerCase();
  const cat = String(cable?.cableCategory || '').toLowerCase();
  if (type === 'fiber' || cat.startsWith('fiber')) return 'fiber';
  if (type === 'wireless' || cat.startsWith('wireless')) return 'wireless';
  return 'utp';
}

function getCablePhysicalMeters(cable) {
  const phys = Number(cable?.details?.totalPhysicalLength);
  if (Number.isFinite(phys) && phys > 0) return phys;
  const len = Number(cable?.length);
  return Number.isFinite(len) && len > 0 ? len : 0;
}

/**
 * Build a full live infrastructure documentation summary for a single building / room.
 * @param {Object} room
 * @param {Object[]} [devices=[]]
 * @param {Object[]} [connections=[]]
 * @param {Object[]} [objects3d=[]]
 * @param {Object} [options={}]
 * @returns {Object}
 */
export function buildBuildingDocumentationSummary(
  room,
  devices = [],
  connections = [],
  objects3d = [],
  options = {}
) {
  const doc = normalizeRoomDoc(room?.doc);
  const allRooms = Array.isArray(options.allRooms) && options.allRooms.length > 0
    ? options.allRooms
    : (room ? [room] : []);
  const exclusive = options.exclusiveAssignment !== false && allRooms.length > 1;
  const safeDevices = Array.isArray(devices) ? devices : [];
  const safeConnections = Array.isArray(connections) ? connections : [];
  const safeObjects = Array.isArray(objects3d) ? objects3d : [];

  const deviceById = new Map();
  safeDevices.forEach((d) => {
    if (d?.id) deviceById.set(d.id, d);
  });

  // 1. Devices inside this room
  const devicesInside = [];
  if (room) {
    for (const dev of safeDevices) {
      if (!dev?.position) continue;
      if (exclusive) {
        const owner = findBuildingForDevice(dev, allRooms, options);
        if (owner?.id === room.id) devicesInside.push(dev);
      } else if (isPointInsideRoomOBB(dev.position.x, dev.position.y, room, options)) {
        devicesInside.push(dev);
      }
    }
  }

  devicesInside.sort((a, b) => {
    const floorA = (Number(a.spatial3d?.elevationMeters) || 0) >= 3.2 ? 2 : 1;
    const floorB = (Number(b.spatial3d?.elevationMeters) || 0) >= 3.2 ? 2 : 1;
    if (floorA !== floorB) return floorA - floorB;
    const ordA = DEVICE_TYPE_SORT_ORDER[a.type] || 50;
    const ordB = DEVICE_TYPE_SORT_ORDER[b.type] || 50;
    if (ordA !== ordB) return ordA - ordB;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const isMultiFloor = Number(room?.heightMeters) >= 6.0;
  const floors = isMultiFloor
    ? [
        {
          floorNumber: 1,
          label: 'Lantai 1 (< 3.2m)',
          devices: devicesInside.filter((d) => (Number(d.spatial3d?.elevationMeters) || 0) < 3.2)
        },
        {
          floorNumber: 2,
          label: 'Lantai 2 (>= 3.2m)',
          devices: devicesInside.filter((d) => (Number(d.spatial3d?.elevationMeters) || 0) >= 3.2)
        }
      ].filter((f) => f.devices.length > 0)
    : (devicesInside.length > 0
        ? [{ floorNumber: 1, label: 'Lantai 1', devices: devicesInside }]
        : []);

  const statusCounts = { online: 0, warning: 0, offline: 0, unknown: 0, total: devicesInside.length };
  const vlanSet = new Set();
  const subnetSet = new Set();
  const ssidSet = new Set();

  const addVlanToken = (raw) => {
    if (raw === null || raw === undefined || raw === '') return;
    if (Array.isArray(raw)) {
      raw.forEach(addVlanToken);
      return;
    }
    const matches = String(raw).match(/\d+/g);
    if (!matches) return;
    matches.forEach((m) => {
      const n = parseInt(m, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 4094) vlanSet.add(n);
    });
  };

  for (const dev of devicesInside) {
    const st = String(dev.status || 'unknown').toLowerCase();
    if (st === 'online') statusCounts.online += 1;
    else if (st === 'warning') statusCounts.warning += 1;
    else if (st === 'offline') statusCounts.offline += 1;
    else statusCounts.unknown += 1;

    addVlanToken(dev.network?.vlan);
    addVlanToken(dev.network?.vlanList);

    const netCidr = deriveSubnetCidr(dev.network?.ip || dev.ip, dev.network?.subnet);
    if (netCidr) subnetSet.add(netCidr);

    const ifaces = dev.simConfig?.interfaces;
    if (ifaces && typeof ifaces === 'object') {
      Object.values(ifaces).forEach((ifc) => {
        if (!ifc) return;
        addVlanToken(ifc.accessVlan);
        addVlanToken(ifc.nativeVlan);
        addVlanToken(ifc.trunkVlans);
        const ifCidr = deriveSubnetCidr(ifc.ip, ifc.mask || dev.network?.subnet);
        if (ifCidr) subnetSet.add(ifCidr);
      });
    }

    const ssid1 = String(dev.network?.ssid || '').trim();
    const ssid2 = String(dev.network?.ssidSecondary || '').trim();
    if (ssid1) ssidSet.add(ssid1);
    if (ssid2) ssidSet.add(ssid2);
  }

  // 2. Internal vs Uplink/Backbone Cables
  const insideDevIds = new Set(devicesInside.map((d) => d.id));
  const internalCables = [];
  const uplinkCables = [];
  let utpMeters = 0;
  let fiberMeters = 0;
  let wirelessMeters = 0;
  let internalUtpCount = 0;
  let internalFiberCount = 0;

  for (const cable of safeConnections) {
    const srcIn = insideDevIds.has(cable.source);
    const dstIn = insideDevIds.has(cable.destination);
    if (!srcIn && !dstIn) continue;

    const lengthMeters = getCablePhysicalMeters(cable);
    const media = classifyCableMedia(cable);
    if (media === 'fiber') fiberMeters += lengthMeters;
    else if (media === 'wireless') wirelessMeters += lengthMeters;
    else utpMeters += lengthMeters;

    if (srcIn && dstIn) {
      if (media === 'fiber') internalFiberCount += 1;
      else if (media === 'utp') internalUtpCount += 1;
      internalCables.push({
        cable,
        sourceDevice: deviceById.get(cable.source) || null,
        destinationDevice: deviceById.get(cable.destination) || null,
        lengthMeters,
        media
      });
    } else {
      const localDev = deviceById.get(srcIn ? cable.source : cable.destination) || null;
      const remoteDev = deviceById.get(srcIn ? cable.destination : cable.source) || null;
      const remoteBuilding = remoteDev ? findBuildingForDevice(remoteDev, allRooms, options) : null;
      const localPort = srcIn
        ? (cable.details?.portSource || '')
        : (cable.details?.portDestination || '');
      const remotePort = srcIn
        ? (cable.details?.portDestination || '')
        : (cable.details?.portSource || '');
      uplinkCables.push({
        cable,
        localDevice: localDev,
        remoteDevice: remoteDev,
        remoteBuilding,
        localPort,
        remotePort,
        lengthMeters,
        media
      });
    }
  }

  // 3. 3D Objects inside this room (server racks, tables, ODP poles, etc.)
  const objectsInside = [];
  if (room) {
    for (const obj of safeObjects) {
      if (typeof obj?.x !== 'number' || typeof obj?.y !== 'number') continue;
      if (isPointInsideRoomOBB(obj.x, obj.y, room, options)) {
        objectsInside.push(obj);
      }
    }
  }

  const vlans = Array.from(vlanSet).sort((a, b) => a - b);
  const subnets = Array.from(subnetSet).sort();
  const ssids = Array.from(ssidSet).sort();

  const totalCableMeters = Math.round((utpMeters + fiberMeters + wirelessMeters) * 10) / 10;

  return {
    room,
    doc,
    isMultiFloor,
    devicesInside,
    floors,
    statusCounts,
    networkSummary: {
      vlans,
      subnets,
      ssids
    },
    cableSummary: {
      internalCables,
      uplinkCables,
      internalCount: internalCables.length,
      uplinkCount: uplinkCables.length,
      internalUtpCount,
      internalFiberCount,
      utpMeters: Math.round(utpMeters * 10) / 10,
      fiberMeters: Math.round(fiberMeters * 10) / 10,
      wirelessMeters: Math.round(wirelessMeters * 10) / 10,
      totalCableMeters
    },
    objectsInside
  };
}

/**
 * Build documentation summaries for all non-decorative buildings in the project.
 * @param {Object[]} rooms3d
 * @param {Object[]} devices
 * @param {Object[]} connections
 * @param {Object[]} [objects3d=[]]
 * @param {Object} [options={}]
 * @returns {Object[]}
 */
export function buildAllBuildingsSummary(
  rooms3d = [],
  devices = [],
  connections = [],
  objects3d = [],
  options = {}
) {
  const safeRooms = Array.isArray(rooms3d) ? rooms3d : [];
  const includeDecorations = Boolean(options.includeDecorations);
  const buildings = includeDecorations
    ? safeRooms
    : safeRooms.filter((r) => !isDecorationRoom(r));

  const summaries = buildings.map((room) =>
    buildBuildingDocumentationSummary(room, devices, connections, objects3d, {
      ...options,
      allRooms: buildings,
      exclusiveAssignment: true
    })
  );

  summaries.sort((a, b) => {
    const devDiff = b.devicesInside.length - a.devicesInside.length;
    if (devDiff !== 0) return devDiff;
    return String(a.room?.name || '').localeCompare(String(b.room?.name || ''));
  });

  return summaries;
}

/**
 * Synchronize `device.location` for all devices physically located inside a building.
 * @param {Object} room
 * @param {import('../devices/device-manager.js').DeviceManager} deviceManager
 * @param {Object} [options={}]
 * @param {Object[]} [options.allRooms]
 * @param {boolean} [options.overwriteExisting=true]
 * @returns {{ updatedCount: number, updatedIds: string[], totalInside: number }}
 */
export function syncDeviceLocationsFromBuilding(room, deviceManager, options = {}) {
  if (!room || !deviceManager) {
    return { updatedCount: 0, updatedIds: [], totalInside: 0 };
  }
  const overwriteExisting = options.overwriteExisting !== false;
  const devices = deviceManager.getAllDevices?.() || [];
  const summary = buildBuildingDocumentationSummary(room, devices, [], [], options);
  const label = room.doc?.roomCode
    ? `${room.name} (${room.doc.roomCode})`
    : (room.name || 'Ruangan 3D');

  const updatedIds = [];
  for (const dev of summary.devicesInside) {
    const curLoc = String(dev.location || '').trim();
    if (!overwriteExisting && curLoc) continue;
    if (curLoc === label) continue;
    deviceManager.updateDevice?.(dev.id, { location: label });
    updatedIds.push(dev.id);
  }

  return {
    updatedCount: updatedIds.length,
    updatedIds,
    totalInside: summary.devicesInside.length
  };
}
