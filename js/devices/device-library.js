/**
 * NetMap — Device Library Catalog & Visual Taxonomy
 * Categorizes all network devices according to PRD Section 3.2
 */

export const DEVICE_CATEGORIES = {
  core: {
    id: 'core',
    name: 'Core Network',
    color: '#2a7c13', // Deep Forest Green (Palette #2a7c13)
    badgeBg: 'rgba(42, 124, 19, 0.15)',
    icon: 'cpu'
  },
  distribution: {
    id: 'distribution',
    name: 'Network Distribution',
    color: '#76c457', // Leaf Meadow Green (Palette #76c457)
    badgeBg: 'rgba(118, 196, 87, 0.18)',
    icon: 'network'
  },
  infrastructure: {
    id: 'infrastructure',
    name: 'Infrastructure & Cabling',
    color: '#d97706', // Warm Amber (Complements Sand #fbe6c2)
    badgeBg: 'rgba(217, 119, 6, 0.15)',
    icon: 'box'
  },
  endDevice: {
    id: 'endDevice',
    name: 'End Devices',
    color: '#059669', // Emerald Green
    badgeBg: 'rgba(5, 150, 105, 0.15)',
    icon: 'monitor'
  }
};

export const DEVICE_STATUSES = {
  online: {
    id: 'online',
    name: 'Online',
    color: '#22c55e', // Bright Green
    bg: 'rgba(34, 197, 94, 0.15)'
  },
  offline: {
    id: 'offline',
    name: 'Offline',
    color: '#ef4444', // Red
    bg: 'rgba(239, 68, 68, 0.15)'
  },
  warning: {
    id: 'warning',
    name: 'Warning',
    color: '#f59e0b', // Amber / Yellow
    bg: 'rgba(245, 158, 11, 0.15)'
  },
  unknown: {
    id: 'unknown',
    name: 'Unknown',
    color: '#64748b', // Slate Gray
    bg: 'rgba(100, 116, 139, 0.15)'
  }
};

export const DEVICE_CATALOG = [
  // --- Core Network ---
  {
    type: 'router',
    category: 'core',
    name: 'Router',
    lucideIcon: 'router',
    defaultBrand: 'MikroTik',
    defaultModel: 'RB4011',
    description: 'Routing antar segmen jaringan dan NAT gateway'
  },
  {
    type: 'main-router',
    category: 'core',
    name: 'Main Router / CCR',
    lucideIcon: 'cpu',
    defaultBrand: 'MikroTik',
    defaultModel: 'CCR2004',
    description: 'Core router gateway utama kampus/gedung'
  },
  {
    type: 'core-switch',
    category: 'core',
    name: 'Core Switch',
    lucideIcon: 'server',
    defaultBrand: 'Cisco',
    defaultModel: 'Catalyst 3850',
    description: 'Switch tulang punggung (backbone) berkecepatan tinggi'
  },
  {
    type: 'dist-switch',
    category: 'core',
    name: 'Distribution Switch',
    lucideIcon: 'network',
    defaultBrand: 'Cisco',
    defaultModel: 'Catalyst 2960',
    description: 'Switch agregasi distribusi antargedung'
  },
  {
    type: 'firewall',
    category: 'core',
    name: 'Firewall',
    lucideIcon: 'shield',
    defaultBrand: 'Fortinet',
    defaultModel: 'FortiGate 60F',
    description: 'Perangkat keamanan jaringan & inspeksi paket'
  },
  {
    type: 'gateway',
    category: 'core',
    name: 'Internet Gateway',
    lucideIcon: 'globe',
    defaultBrand: 'MikroTik',
    defaultModel: 'RB750Gr3',
    description: 'Perangkat gateway koneksi ISP'
  },

  // --- Network Distribution ---
  {
    type: 'managed-switch',
    category: 'distribution',
    name: 'Managed Switch',
    lucideIcon: 'network',
    defaultBrand: 'Ruijie',
    defaultModel: 'RG-NBS3100',
    description: 'Switch layer-2/3 dengan konfigurasi VLAN'
  },
  {
    type: 'poe-switch',
    category: 'distribution',
    name: 'PoE Switch',
    lucideIcon: 'zap',
    defaultBrand: 'Ruijie',
    defaultModel: 'RG-ES218GC-P',
    description: 'Switch penyuplai daya ke AP dan IP Camera'
  },
  {
    type: 'access-point',
    category: 'distribution',
    name: 'Access Point (Wi-Fi)',
    lucideIcon: 'wifi',
    defaultBrand: 'Ubiquiti UniFi',
    defaultModel: 'U6-Pro',
    description: 'Pemancar sinyal nirkabel pengguna'
  },
  {
    type: 'wireless-bridge',
    category: 'distribution',
    name: 'Wireless Bridge (PtP)',
    lucideIcon: 'radio',
    defaultBrand: 'Ubiquiti',
    defaultModel: 'AirMax NanoBeam',
    description: 'Link nirkabel antar gedung tanpa kabel'
  },
  {
    type: 'unmanaged-switch',
    category: 'distribution',
    name: 'Unmanaged Switch',
    lucideIcon: 'server',
    defaultBrand: 'TP-Link',
    defaultModel: 'TL-SG1016',
    description: 'Switch distribusi sederhana tanpa VLAN'
  },

  // --- Infrastructure & Cabling ---
  {
    type: 'network-rack',
    category: 'infrastructure',
    name: 'Network Rack',
    lucideIcon: 'layers',
    defaultBrand: 'Indorack',
    defaultModel: 'Rack 19" 15U',
    description: 'Lemari kabinet perangkat jaringan'
  },
  {
    type: 'patch-panel',
    category: 'infrastructure',
    name: 'Patch Panel',
    lucideIcon: 'align-justify',
    defaultBrand: 'AMP/CommScope',
    defaultModel: '24-Port Cat6',
    description: 'Panel terminasi kabel tembaga RJ45'
  },
  {
    type: 'odp',
    category: 'infrastructure',
    name: 'ODP (Optic Dist. Point)',
    lucideIcon: 'box',
    defaultBrand: 'Huawei',
    defaultModel: 'ODP 16 Port',
    description: 'Titik terminasi distribusi fiber optik luar'
  },
  {
    type: 'fo-terminal',
    category: 'infrastructure',
    name: 'OTB (Fiber Terminal)',
    lucideIcon: 'git-commit',
    defaultBrand: 'Panduit',
    defaultModel: 'Rack Mount OTB 24C',
    description: 'Kotak terminasi kabel fiber optik gedung'
  },
  {
    type: 'network-pole',
    category: 'infrastructure',
    name: 'Network Pole / Tiang',
    lucideIcon: 'radio-tower',
    defaultBrand: 'Custom',
    defaultModel: 'Tiang Besi 7m',
    description: 'Tiang jalur kabel udara atau radio link'
  },

  // --- End Devices ---
  {
    type: 'cctv',
    category: 'endDevice',
    name: 'IP Camera (CCTV)',
    lucideIcon: 'camera',
    defaultBrand: 'Hikvision',
    defaultModel: 'DS-2CD1023G0E',
    description: 'Kamera pengawas keamanan jaringan'
  },
  {
    type: 'nvr',
    category: 'endDevice',
    name: 'NVR Server',
    lucideIcon: 'hard-drive',
    defaultBrand: 'Hikvision',
    defaultModel: 'DS-7616NI-Q2',
    description: 'Perekam rekaman CCTV berbasis jaringan'
  },
  {
    type: 'server',
    category: 'endDevice',
    name: 'Physical Server',
    lucideIcon: 'server',
    defaultBrand: 'Dell',
    defaultModel: 'PowerEdge R440',
    description: 'Server aplikasi lokal atau basis data'
  },
  {
    type: 'computer',
    category: 'endDevice',
    name: 'Computer / PC',
    lucideIcon: 'monitor',
    defaultBrand: 'Lenovo',
    defaultModel: 'ThinkCentre M70q',
    description: 'Komputer pengguna / workstation teknisi'
  },
  {
    type: 'printer',
    category: 'endDevice',
    name: 'Network Printer',
    lucideIcon: 'printer',
    defaultBrand: 'Epson',
    defaultModel: 'WorkForce Pro',
    description: 'Printer jaringan terpusat'
  },
  {
    type: 'ip-phone',
    category: 'endDevice',
    name: 'VoIP / IP Phone',
    lucideIcon: 'phone-call',
    defaultBrand: 'Grandstream',
    defaultModel: 'GRP2601P',
    description: 'Telepon jaringan berbasis protokol SIP'
  }
];

/**
 * Get item metadata by its type string
 * @param {string} type 
 * @returns {Object|null}
 */
export function getDeviceDefByType(type) {
  return DEVICE_CATALOG.find((d) => d.type === type) || null;
}
