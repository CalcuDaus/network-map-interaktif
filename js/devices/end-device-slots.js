/**
 * NetMap — Extensible Packet Tracer End-Device & WAN Slots Registry
 * Menyediakan perangkat klien & WAN (PC, Laptop, Server Layanan, Smartphone Wi-Fi, Cloud/ISP)
 * dengan arsitektur slot 3D modular: siap pakai ikon 2D + mesh 3D placeholder sekarang,
 * dan otomatis memakai model .GLB buatan pengguna saat ditautkan nanti tanpa ubah logika simulasi.
 */

const SLOT_GLB_STORAGE_KEY = 'netmap_end_device_slot_glbs_v1';

const BASE_END_DEVICE_SLOTS = [
  {
    slotId: 'pt-pc',
    name: 'PC Desktop',
    brand: 'Generic',
    model: 'Workstation-PT',
    type: 'pc',
    category: 'end-device',
    customIcon: 'pc',
    badgeCode: 'PC',
    description: 'Komputer klien LAN dengan Command Prompt & konfigurasi IP Static/DHCP',
    ports: [{ name: 'eth0', type: 'rj45', speed: '1G', local3d: { x: 0, y: 0.14, z: -0.25 } }],
    network: { connectionMode: 'dhcp', vlan: 1 },
    spatial3d: { elevationMeters: 0.75, mountType: 'floor', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-laptop',
    name: 'Laptop Klien',
    brand: 'Generic',
    model: 'Laptop-PT',
    type: 'laptop',
    category: 'end-device',
    customIcon: 'laptop',
    badgeCode: 'LPT',
    description: 'Laptop dual-koneksi (RJ45 LAN & Wi-Fi wlan0) untuk uji praktikum',
    ports: [
      { name: 'eth0', type: 'rj45', speed: '1G', local3d: { x: -0.15, y: 0.08, z: -0.18 } },
      { name: 'wlan0', type: 'wireless', speed: '867M', local3d: { x: 0.15, y: 0.18, z: 0 } }
    ],
    network: { connectionMode: 'dhcp', vlan: 1 },
    spatial3d: { elevationMeters: 0.78, mountType: 'floor', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-server',
    name: 'Server Layanan',
    brand: 'Generic',
    model: 'Server-PT (DHCP/DNS/Web)',
    type: 'server',
    category: 'core',
    customIcon: 'server',
    badgeCode: 'SRV',
    description: 'Server layanan jaringan sekolah (DHCP, DNS, Web/LMS, Radius)',
    ports: [
      { name: 'eth0', type: 'rj45', speed: '1G', local3d: { x: -0.12, y: 0.16, z: -0.3 } },
      { name: 'eth1', type: 'rj45', speed: '1G', local3d: { x: 0.12, y: 0.16, z: -0.3 } }
    ],
    network: { connectionMode: 'static', vlan: 10 },
    spatial3d: { elevationMeters: 0.45, mountType: 'rack', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-smartphone',
    name: 'Smartphone Wi-Fi',
    brand: 'Generic',
    model: 'SmartPhone-PT',
    type: 'smartphone',
    category: 'end-device',
    customIcon: 'smartphone',
    badgeCode: 'HP',
    description: 'Perangkat mobile nirkabel untuk simulasi konektivitas Wi-Fi AP/Hotspot',
    ports: [{ name: 'wlan0', type: 'wireless', speed: '867M', local3d: { x: 0, y: 0.12, z: 0 } }],
    network: { connectionMode: 'dhcp', vlan: 1 },
    spatial3d: { elevationMeters: 0.9, mountType: 'floor', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-cloud-isp',
    name: 'Cloud / ISP Internet',
    brand: 'WAN',
    model: 'Cloud-ISP-PT',
    type: 'isp',
    category: 'core',
    customIcon: 'cloud',
    badgeCode: 'ISP',
    description: 'Gateway Internet / Cloud WAN publik untuk uji routing & NAT Masquerade',
    ports: [
      { name: 'wan0', type: 'rj45', speed: '1G', local3d: { x: -0.16, y: 0.18, z: 0.2 } },
      { name: 'sfp-wan1', type: 'sfp', speed: '10G', local3d: { x: 0.16, y: 0.18, z: 0.2 } }
    ],
    network: { ip: '8.8.8.8', subnet: '255.255.255.0', hostname: 'isp-gateway', connectionMode: 'static', vlan: 1 },
    spatial3d: { elevationMeters: 1.5, mountType: 'floor', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-printer',
    name: 'Printer Jaringan',
    brand: 'Generic',
    model: 'Printer-PT',
    type: 'printer',
    category: 'end-device',
    customIcon: 'printer',
    badgeCode: 'PRN',
    description: 'Printer jaringan LAN untuk cetak dokumen laboratorium/kantor',
    ports: [{ name: 'eth0', type: 'rj45', speed: '1G', local3d: { x: 0, y: 0.14, z: -0.22 } }],
    network: { connectionMode: 'dhcp', vlan: 1 },
    spatial3d: { elevationMeters: 0.78, mountType: 'floor', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-ont',
    name: 'ONT / ONU Fiber',
    brand: 'FTTH',
    model: 'ONT-WiFi-PT',
    type: 'ont',
    category: 'infrastructure',
    customIcon: 'ont',
    badgeCode: 'ONT',
    description: 'Terminal Fiber Optik pelanggan dengan port LAN dan Wi-Fi',
    ports: [
      { name: 'PON', type: 'fiber', speed: '2.5G', local3d: { x: -0.18, y: 0.08, z: -0.2 } },
      { name: 'LAN1', type: 'rj45', speed: '1G', local3d: { x: 0, y: 0.08, z: -0.2 } },
      { name: 'wlan0', type: 'wireless', speed: '867M', local3d: { x: 0.18, y: 0.18, z: 0 } }
    ],
    network: { connectionMode: 'static', vlan: 1 },
    spatial3d: { elevationMeters: 0.85, mountType: 'floor', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-olt',
    name: 'OLT PON Fiber',
    brand: 'FTTH',
    model: 'OLT-GPON-PT',
    type: 'olt',
    category: 'core',
    customIcon: 'olt',
    badgeCode: 'OLT',
    description: 'Optical Line Terminal distribusi jaringan fiber FTTH/sekolah',
    ports: [
      { name: 'uplink-SFP+1', type: 'sfp+', speed: '10G', local3d: { x: -0.25, y: 0.12, z: 0.34 } },
      { name: 'PON-1', type: 'fiber', speed: '2.5G', local3d: { x: 0, y: 0.12, z: 0.34 } },
      { name: 'PON-2', type: 'fiber', speed: '2.5G', local3d: { x: 0.25, y: 0.12, z: 0.34 } }
    ],
    network: { connectionMode: 'static', vlan: 1 },
    spatial3d: { elevationMeters: 1.2, mountType: 'rack', customModelUrl: '', modelScale: 1 }
  },
  {
    slotId: 'pt-hub',
    name: 'Hub Ethernet 4-Port',
    brand: 'Generic',
    model: 'Hub-PT',
    type: 'hub',
    category: 'distribution',
    customIcon: 'hub',
    badgeCode: 'HUB',
    description: 'Hub Ethernet 4-Port untuk simulasi topologi dasar / praktikum jaringan',
    ports: [
      { name: 'port1', type: 'rj45', speed: '100M', local3d: { x: -0.24, y: 0.09, z: 0.26 } },
      { name: 'port2', type: 'rj45', speed: '100M', local3d: { x: -0.08, y: 0.09, z: 0.26 } },
      { name: 'port3', type: 'rj45', speed: '100M', local3d: { x: 0.08, y: 0.09, z: 0.26 } },
      { name: 'port4', type: 'rj45', speed: '100M', local3d: { x: 0.24, y: 0.09, z: 0.26 } }
    ],
    network: { connectionMode: 'static', vlan: 1 },
    spatial3d: { elevationMeters: 0.8, mountType: 'floor', customModelUrl: '', modelScale: 1 }
  }
];

function readSavedSlotGlbMap() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SLOT_GLB_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Return cloned list of extensible Packet Tracer End-Device & WAN slots
 * merged with any user-linked .GLB model URLs.
 * @returns {Array<Object>}
 */
export function getEndDeviceSlots() {
  const customGlbMap = readSavedSlotGlbMap();
  return BASE_END_DEVICE_SLOTS.map((slot) => {
    const linkedGlb = String(customGlbMap[slot.slotId] || slot.spatial3d?.customModelUrl || '').trim();
    return {
      ...slot,
      isEndDeviceSlot: true,
      ports: slot.ports.map((p) => ({ ...p, local3d: { ...p.local3d } })),
      network: slot.network ? { ...slot.network } : {},
      spatial3d: {
        ...slot.spatial3d,
        customModelUrl: linkedGlb
      }
    };
  });
}

/**
 * Find a single End-Device slot definition by its slotId.
 * @param {string} slotId
 * @returns {Object|null}
 */
export function getEndDeviceSlotById(slotId) {
  if (!slotId) return null;
  return getEndDeviceSlots().find((s) => s.slotId === slotId) || null;
}

/**
 * Link (or clear) a custom .GLB 3D model URL for a built-in End-Device slot.
 * @param {string} slotId
 * @param {string} glbUrl
 * @returns {boolean}
 */
export function setEndDeviceSlotGlbUrl(slotId, glbUrl = '') {
  const exists = BASE_END_DEVICE_SLOTS.some((s) => s.slotId === slotId);
  if (!exists) return false;
  try {
    if (typeof localStorage !== 'undefined') {
      const map = readSavedSlotGlbMap();
      const clean = String(glbUrl || '').trim();
      if (clean) map[slotId] = clean;
      else delete map[slotId];
      localStorage.setItem(SLOT_GLB_STORAGE_KEY, JSON.stringify(map));
    }
    return true;
  } catch {
    return false;
  }
}
