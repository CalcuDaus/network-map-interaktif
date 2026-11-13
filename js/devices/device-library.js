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

export const STANDARD_DEVICE_CATALOG = [
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
 * Dedicated MikroTik Hardware Presets (CCR, RB, CRS, cAP/hAP, LHG/SXT/mANTBox)
 */
export const MIKROTIK_CATALOG = [
  {
    type: 'mikrotik-ccr2116',
    brandGroup: 'MikroTik',
    badgeCode: 'CCR',
    category: 'core',
    name: 'MikroTik CCR2116',
    lucideIcon: 'cpu',
    defaultBrand: 'MikroTik',
    defaultModel: 'CCR2116-12G-4S+',
    description: 'Core Router 16-Core ARM, 12x GbE + 4x 10G SFP+'
  },
  {
    type: 'mikrotik-ccr2004',
    brandGroup: 'MikroTik',
    badgeCode: 'CCR',
    category: 'core',
    name: 'MikroTik CCR2004',
    lucideIcon: 'cpu',
    defaultBrand: 'MikroTik',
    defaultModel: 'CCR2004-16G-2S+',
    description: 'Core / Edge Router 16x GbE + 2x 10G SFP+'
  },
  {
    type: 'mikrotik-rb5009',
    brandGroup: 'MikroTik',
    badgeCode: 'RB',
    category: 'core',
    name: 'MikroTik RB5009',
    lucideIcon: 'router',
    defaultBrand: 'MikroTik',
    defaultModel: 'RB5009UG+S+IN',
    description: 'Heavy Duty Router 7x GbE + 2.5G + 10G SFP+'
  },
  {
    type: 'mikrotik-rb4011',
    brandGroup: 'MikroTik',
    badgeCode: 'RB',
    category: 'core',
    name: 'MikroTik RB4011',
    lucideIcon: 'router',
    defaultBrand: 'MikroTik',
    defaultModel: 'RB4011iGS+RM',
    description: 'Rackmount Router 10x GbE + 10G SFP+'
  },
  {
    type: 'mikrotik-l009',
    brandGroup: 'MikroTik',
    badgeCode: 'L009',
    category: 'core',
    name: 'MikroTik L009',
    lucideIcon: 'router',
    defaultBrand: 'MikroTik',
    defaultModel: 'L009UiGS-RM',
    description: 'Router 8x GbE + 2.5G SFP Port (PoE Out Port 8)'
  },
  {
    type: 'mikrotik-hex',
    brandGroup: 'MikroTik',
    badgeCode: 'hEX',
    category: 'core',
    name: 'MikroTik hEX',
    lucideIcon: 'router',
    defaultBrand: 'MikroTik',
    defaultModel: 'RB750Gr3',
    description: 'Router Gigabit 5-Port kompak untuk cabang / gedung'
  },
  {
    type: 'mikrotik-crs317',
    brandGroup: 'MikroTik',
    badgeCode: 'CRS',
    category: 'core',
    name: 'MikroTik CRS317',
    lucideIcon: 'server',
    defaultBrand: 'MikroTik',
    defaultModel: 'CRS317-1G-16S+RM',
    description: 'Core Fiber Switch 16x 10G SFP+ & 1x GbE Mgmt'
  },
  {
    type: 'mikrotik-crs326',
    brandGroup: 'MikroTik',
    badgeCode: 'CRS',
    category: 'distribution',
    name: 'MikroTik CRS326',
    lucideIcon: 'network',
    defaultBrand: 'MikroTik',
    defaultModel: 'CRS326-24G-2S+RM',
    description: 'Managed Switch 24x GbE + 2x 10G SFP+ Uplink'
  },
  {
    type: 'mikrotik-crs328',
    brandGroup: 'MikroTik',
    badgeCode: 'PoE',
    category: 'distribution',
    name: 'MikroTik CRS328 PoE',
    lucideIcon: 'zap',
    defaultBrand: 'MikroTik',
    defaultModel: 'CRS328-24P-4S+RM',
    description: 'PoE+ Switch 24x GbE PoE Out + 4x 10G SFP+'
  },
  {
    type: 'mikrotik-crs310',
    brandGroup: 'MikroTik',
    badgeCode: 'CRS',
    category: 'distribution',
    name: 'MikroTik CRS310',
    lucideIcon: 'network',
    defaultBrand: 'MikroTik',
    defaultModel: 'CRS310-8G+2S+IN',
    description: 'Switch 8x 2.5G RJ45 + 2x 10G SFP+'
  },
  {
    type: 'mikrotik-cap-ax',
    brandGroup: 'MikroTik',
    badgeCode: 'cAP',
    category: 'distribution',
    name: 'MikroTik cAP ax',
    lucideIcon: 'wifi',
    defaultBrand: 'MikroTik',
    defaultModel: 'cAPGi-5HaxD2HaxD',
    description: 'Ceiling Access Point Wi-Fi 6 Dual-Band',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 30,
      color: '#76c457',
      opacity: 0.18,
      hatch: true,
      band: 'dual-band',
      showLabel: true
    }
  },
  {
    type: 'mikrotik-hap-ax2',
    brandGroup: 'MikroTik',
    badgeCode: 'hAP',
    category: 'distribution',
    name: 'MikroTik hAP ax²',
    lucideIcon: 'wifi',
    defaultBrand: 'MikroTik',
    defaultModel: 'C52iG-5HaxD2HaxD-TC',
    description: 'Indoor Wi-Fi 6 Router / Access Point 5x GbE',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 25,
      color: '#76c457',
      opacity: 0.18,
      hatch: true,
      band: 'dual-band',
      showLabel: true
    }
  },
  {
    type: 'mikrotik-lhg5',
    brandGroup: 'MikroTik',
    badgeCode: 'LHG',
    category: 'distribution',
    name: 'MikroTik LHG 5 ac',
    lucideIcon: 'radio',
    defaultBrand: 'MikroTik',
    defaultModel: 'RBLHGG-5acD',
    description: 'Radio Dish Grid PtP Jarak Jauh 5GHz 24.5dBi',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 120,
      color: '#06b6d4',
      opacity: 0.16,
      hatch: true,
      band: 'ptp',
      showLabel: true
    }
  },
  {
    type: 'mikrotik-sxtsq',
    brandGroup: 'MikroTik',
    badgeCode: 'SXT',
    category: 'distribution',
    name: 'MikroTik SXTsq 5 ac',
    lucideIcon: 'radio',
    defaultBrand: 'MikroTik',
    defaultModel: 'RBSXTsqG-5acD',
    description: 'Outdoor CPE / Wireless PtP Bridge 5GHz 16dBi',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 80,
      color: '#06b6d4',
      opacity: 0.16,
      hatch: true,
      band: 'ptp',
      showLabel: true
    }
  },
  {
    type: 'mikrotik-mantbox',
    brandGroup: 'MikroTik',
    badgeCode: 'mANT',
    category: 'distribution',
    name: 'MikroTik mANTBox',
    lucideIcon: 'radio-tower',
    defaultBrand: 'MikroTik',
    defaultModel: 'RB921GS-5HPacD-15S',
    description: 'Base Station Sector AP Outdoor 120° 5GHz',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 100,
      color: '#0ea5e9',
      opacity: 0.16,
      hatch: true,
      band: 'ptp',
      showLabel: true
    }
  }
];

/**
 * Dedicated Ruijie & Ruijie Reyee Hardware Presets (EG/NBR, NBS/ES/S, RAP, EST)
 */
export const RUIJIE_CATALOG = [
  {
    type: 'ruijie-eg210g',
    brandGroup: 'Ruijie',
    badgeCode: 'EG',
    category: 'core',
    name: 'Ruijie RG-EG210G-P',
    lucideIcon: 'router',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-EG210G-P',
    description: 'Cloud Managed PoE Router 10x GbE (8x PoE+) Dual-WAN'
  },
  {
    type: 'ruijie-eg310gh',
    brandGroup: 'Ruijie',
    badgeCode: 'EG',
    category: 'core',
    name: 'Ruijie RG-EG310GH',
    lucideIcon: 'cpu',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-EG310GH-P-E',
    description: 'High-Perf Cloud Gateway 10x GbE + 2x SFP Multi-WAN'
  },
  {
    type: 'ruijie-nbr6210',
    brandGroup: 'Ruijie',
    badgeCode: 'NBR',
    category: 'core',
    name: 'Ruijie RG-NBR6210',
    lucideIcon: 'shield',
    defaultBrand: 'Ruijie',
    defaultModel: 'RG-NBR6210-E',
    description: 'Enterprise Gateway Router & Firewall Multi-WAN'
  },
  {
    type: 'ruijie-s5750',
    brandGroup: 'Ruijie',
    badgeCode: 'L3',
    category: 'core',
    name: 'Ruijie RG-S5750V2',
    lucideIcon: 'server',
    defaultBrand: 'Ruijie',
    defaultModel: 'RG-S5750V2-28GT4XS',
    description: 'Core L3 Switch 24x GbE + 4x 10G SFP+ Backbone'
  },
  {
    type: 'ruijie-nbs5200',
    brandGroup: 'Ruijie',
    badgeCode: 'NBS',
    category: 'distribution',
    name: 'Ruijie NBS5200-24GT',
    lucideIcon: 'network',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-NBS5200-24GT4XS',
    description: 'L2+ Managed Switch 24x GbE + 4x 10G SFP+ Uplink'
  },
  {
    type: 'ruijie-nbs3100',
    brandGroup: 'Ruijie',
    badgeCode: 'NBS',
    category: 'distribution',
    name: 'Ruijie NBS3100-24GT',
    lucideIcon: 'network',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-NBS3100-24GT4SFP',
    description: 'Cloud Managed Switch 24x GbE + 4x SFP'
  },
  {
    type: 'ruijie-nbs3100-poe',
    brandGroup: 'Ruijie',
    badgeCode: 'PoE',
    category: 'distribution',
    name: 'Ruijie NBS3100 PoE+',
    lucideIcon: 'zap',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-NBS3100-24GT4SFP-P',
    description: 'Cloud PoE+ Switch 24x PoE+ + 4x SFP (370W)'
  },
  {
    type: 'ruijie-es218gc',
    brandGroup: 'Ruijie',
    badgeCode: 'ES',
    category: 'distribution',
    name: 'Ruijie ES218GC-P',
    lucideIcon: 'zap',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-ES218GC-P',
    description: 'Smart Cloud PoE+ Switch 16x PoE+ + 2x SFP'
  },
  {
    type: 'ruijie-es209gc',
    brandGroup: 'Ruijie',
    badgeCode: 'ES',
    category: 'distribution',
    name: 'Ruijie ES209GC-P',
    lucideIcon: 'zap',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-ES209GC-P',
    description: 'Smart Cloud PoE+ Switch 8x PoE+ + 1x GbE Uplink'
  },
  {
    type: 'ruijie-rap2260',
    brandGroup: 'Ruijie',
    badgeCode: 'RAP',
    category: 'distribution',
    name: 'Ruijie RAP2260(G)',
    lucideIcon: 'wifi',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-RAP2260(G)',
    description: 'Ceiling Access Point Wi-Fi 6 AX1800 Dual-Band',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 30,
      color: '#76c457',
      opacity: 0.18,
      hatch: true,
      band: 'dual-band',
      showLabel: true
    }
  },
  {
    type: 'ruijie-rap2200',
    brandGroup: 'Ruijie',
    badgeCode: 'RAP',
    category: 'distribution',
    name: 'Ruijie RAP2200(F)',
    lucideIcon: 'wifi',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-RAP2200(F)',
    description: 'Ceiling Access Point AC1300 Dual-Band Wi-Fi 5',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 25,
      color: '#76c457',
      opacity: 0.18,
      hatch: true,
      band: 'dual-band',
      showLabel: true
    }
  },
  {
    type: 'ruijie-rap1200',
    brandGroup: 'Ruijie',
    badgeCode: 'Wall',
    category: 'distribution',
    name: 'Ruijie RAP1200(F)',
    lucideIcon: 'wifi',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-RAP1200(F)',
    description: 'In-Wall Access Point AC1300 untuk Ruangan / Hotel',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 15,
      color: '#76c457',
      opacity: 0.18,
      hatch: true,
      band: 'dual-band',
      showLabel: true
    }
  },
  {
    type: 'ruijie-rap6260',
    brandGroup: 'Ruijie',
    badgeCode: 'Out',
    category: 'distribution',
    name: 'Ruijie RAP6260(G)',
    lucideIcon: 'wifi',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-RAP6260(G)',
    description: 'Outdoor Omni Access Point Wi-Fi 6 IP68',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 60,
      color: '#76c457',
      opacity: 0.16,
      hatch: true,
      band: 'outdoor',
      showLabel: true
    }
  },
  {
    type: 'ruijie-est350',
    brandGroup: 'Ruijie',
    badgeCode: 'EST',
    category: 'distribution',
    name: 'Ruijie RG-EST350 V2',
    lucideIcon: 'radio',
    defaultBrand: 'Ruijie Reyee',
    defaultModel: 'RG-EST350 V2',
    description: 'Wireless Bridge PtP 5GHz Jarak Jauh hingga 5KM',
    defaultWirelessCoverage: {
      enabled: true,
      radiusMeters: 120,
      color: '#06b6d4',
      opacity: 0.16,
      hatch: true,
      band: 'ptp',
      showLabel: true
    }
  }
];

/**
 * Dedicated TP-Link Switch & Desktop Hub Presets (LiteWave, Unmanaged, Easy Smart, PoE+, Omada JetStream)
 */
export const TPLINK_CATALOG = [
  {
    type: 'tplink-ls1005g',
    brandGroup: 'TP-Link',
    badgeCode: '5P',
    category: 'distribution',
    name: 'TP-Link LS1005G Hub',
    lucideIcon: 'server',
    defaultBrand: 'TP-Link',
    defaultModel: 'LS1005G (5-Port GbE)',
    description: 'Desktop Switch / Hub Gigabit 5-Port Plug & Play'
  },
  {
    type: 'tplink-sg1008d',
    brandGroup: 'TP-Link',
    badgeCode: '8P',
    category: 'distribution',
    name: 'TP-Link TL-SG1008D',
    lucideIcon: 'server',
    defaultBrand: 'TP-Link',
    defaultModel: 'TL-SG1008D (8-Port GbE)',
    description: 'Desktop Switch / Hub Gigabit 8-Port Unmanaged'
  },
  {
    type: 'tplink-sg108e',
    brandGroup: 'TP-Link',
    badgeCode: '8E',
    category: 'distribution',
    name: 'TP-Link TL-SG108E',
    lucideIcon: 'network',
    defaultBrand: 'TP-Link',
    defaultModel: 'TL-SG108E Easy Smart',
    description: 'Easy Smart Switch 8-Port Gigabit (VLAN & QoS)'
  },
  {
    type: 'tplink-sg108pe',
    brandGroup: 'TP-Link',
    badgeCode: 'PoE',
    category: 'distribution',
    name: 'TP-Link TL-SG108PE',
    lucideIcon: 'zap',
    defaultBrand: 'TP-Link',
    defaultModel: 'TL-SG108PE (4x PoE+)',
    description: 'Easy Smart 8-Port Gigabit Switch dengan 4 Port PoE+'
  },
  {
    type: 'tplink-sg1016d',
    brandGroup: 'TP-Link',
    badgeCode: '16P',
    category: 'distribution',
    name: 'TP-Link TL-SG1016D',
    lucideIcon: 'server',
    defaultBrand: 'TP-Link',
    defaultModel: 'TL-SG1016D (16-Port)',
    description: 'Unmanaged 16-Port Gigabit Rack/Desktop Switch'
  },
  {
    type: 'tplink-sg1024d',
    brandGroup: 'TP-Link',
    badgeCode: '24P',
    category: 'distribution',
    name: 'TP-Link TL-SG1024D',
    lucideIcon: 'server',
    defaultBrand: 'TP-Link',
    defaultModel: 'TL-SG1024D (24-Port)',
    description: 'Unmanaged 24-Port Gigabit Rackmount Switch'
  },
  {
    type: 'tplink-sg1218mp',
    brandGroup: 'TP-Link',
    badgeCode: 'PoE',
    category: 'distribution',
    name: 'TP-Link TL-SG1218MP',
    lucideIcon: 'zap',
    defaultBrand: 'TP-Link',
    defaultModel: 'TL-SG1218MP (16 PoE+ 2SFP)',
    description: 'Switch PoE+ 16-Port + 2 Combo SFP (250W Budget)'
  },
  {
    type: 'tplink-sg2210mp',
    brandGroup: 'TP-Link',
    badgeCode: 'Omada',
    category: 'distribution',
    name: 'TP-Link SG2210MP',
    lucideIcon: 'zap',
    defaultBrand: 'TP-Link Omada',
    defaultModel: 'TL-SG2210MP (8 PoE+ 2SFP)',
    description: 'Omada Smart PoE+ Switch 8x GbE + 2x SFP (150W)'
  },
  {
    type: 'tplink-sg2428p',
    brandGroup: 'TP-Link',
    badgeCode: 'Omada',
    category: 'distribution',
    name: 'TP-Link SG2428P',
    lucideIcon: 'zap',
    defaultBrand: 'TP-Link Omada',
    defaultModel: 'TL-SG2428P (24 PoE+ 4SFP)',
    description: 'Omada JetStream 24x GbE PoE+ + 4x SFP Managed Switch'
  },
  {
    type: 'tplink-sg3428x',
    brandGroup: 'TP-Link',
    badgeCode: '10G',
    category: 'core',
    name: 'TP-Link SG3428X',
    lucideIcon: 'network',
    defaultBrand: 'TP-Link Omada',
    defaultModel: 'TL-SG3428X (24G + 4x10G)',
    description: 'JetStream L2+ Switch 24x GbE + 4x 10G SFP+ Uplink'
  },
  {
    type: 'tplink-sx3016f',
    brandGroup: 'TP-Link',
    badgeCode: 'SFP+',
    category: 'core',
    name: 'TP-Link SX3016F',
    lucideIcon: 'server',
    defaultBrand: 'TP-Link Omada',
    defaultModel: 'TL-SX3016F (16x 10G SFP+)',
    description: 'Core Fiber L2+ Switch 16-Port Full 10G SFP+'
  }
];

export const DEVICE_CATALOG = [
  ...STANDARD_DEVICE_CATALOG,
  ...MIKROTIK_CATALOG,
  ...RUIJIE_CATALOG,
  ...TPLINK_CATALOG
];

/**
 * Get item metadata by its type string
 * @param {string} type 
 * @returns {Object|null}
 */
export function getDeviceDefByType(type) {
  return DEVICE_CATALOG.find((d) => d.type === type) || null;
}
