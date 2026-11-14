/**
 * NetMap — Device Schema & Data Validation
 * Implements schema definitions and validation rules specified in PRD Section 3.3 & 6.3
 */

import { generateId } from '../utils/helpers.js';

export const IPv4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
export const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

/**
 * Validate IPv4 format (allows empty string)
 * @param {string} ip 
 * @returns {boolean}
 */
export function validateIp(ip) {
  if (!ip || ip.trim() === '') return true;
  return IPv4_REGEX.test(ip.trim());
}

/**
 * Validate MAC address format (allows empty string)
 * @param {string} mac 
 * @returns {boolean}
 */
export function validateMac(mac) {
  if (!mac || mac.trim() === '') return true;
  return MAC_REGEX.test(mac.trim());
}

/**
 * Validate VLAN ID (1 - 4094)
 * @param {number|string} vlan 
 * @returns {boolean}
 */
export function validateVlan(vlan) {
  if (vlan === '' || vlan === null || vlan === undefined) return true;
  const num = parseInt(vlan, 10);
  return !isNaN(num) && num >= 1 && num <= 4094;
}

export function getDefaultSpatial3d(type = 'router') {
  if (['access-point', 'mikrotik-cap-ax', 'ruijie-rap2260', 'ruijie-rap2200'].includes(type)) {
    return { elevationMeters: 2.8, mountType: 'ceiling', rackUnit: null, customModelUrl: '', modelScale: 1, rotationY: 0 };
  }
  if (['mikrotik-hap-ax2', 'ruijie-rap1200', 'cctv'].includes(type)) {
    return { elevationMeters: 2.2, mountType: 'wall', rackUnit: null, customModelUrl: '', modelScale: 1, rotationY: 0 };
  }
  if ([
    'wireless-bridge', 'network-pole',
    'mikrotik-lhg5', 'mikrotik-sxtsq', 'mikrotik-mantbox',
    'ruijie-rap6260', 'ruijie-est350'
  ].includes(type)) {
    return { elevationMeters: 4.5, mountType: 'pole', rackUnit: null, customModelUrl: '', modelScale: 1, rotationY: 0 };
  }
  if (['server', 'nvr', 'storage', 'database'].includes(type)) {
    return { elevationMeters: 0.45, mountType: 'rack', rackUnit: 4, customModelUrl: '', modelScale: 1, rotationY: 0 };
  }
  if ([
    'core-switch', 'dist-switch', 'managed-switch', 'poe-switch', 'unmanaged-switch',
    'mikrotik-crs317', 'mikrotik-crs326', 'mikrotik-crs328', 'mikrotik-crs310',
    'ruijie-s5750', 'ruijie-nbs5200', 'ruijie-nbs3100', 'ruijie-nbs3100-poe', 'ruijie-es218gc', 'ruijie-es209gc',
    'tplink-ls1005g', 'tplink-sg1008d', 'tplink-sg108e', 'tplink-sg108pe', 'tplink-sg1016d',
    'tplink-sg1024d', 'tplink-sg1218mp', 'tplink-sg2210mp', 'tplink-sg2428p', 'tplink-sg3428x', 'tplink-sx3016f'
  ].includes(type)) {
    return { elevationMeters: 1.0, mountType: 'rack', rackUnit: 12, customModelUrl: '', modelScale: 1, rotationY: 0 };
  }
  if ([
    'router', 'main-router', 'firewall', 'gateway',
    'mikrotik-ccr2116', 'mikrotik-ccr2004', 'mikrotik-rb5009', 'mikrotik-rb4011', 'mikrotik-l009', 'mikrotik-hex',
    'ruijie-eg210g', 'ruijie-eg310gh', 'ruijie-nbr6210'
  ].includes(type)) {
    return { elevationMeters: 1.45, mountType: 'rack', rackUnit: 20, customModelUrl: '', modelScale: 1, rotationY: 0 };
  }
  if (['network-rack', 'patch-panel', 'odp', 'fo-terminal'].includes(type)) {
    return { elevationMeters: 0, mountType: 'floor', rackUnit: null, customModelUrl: '', modelScale: 1, rotationY: 0 };
  }
  return { elevationMeters: 0.75, mountType: 'floor', rackUnit: null, customModelUrl: '', modelScale: 1, rotationY: 0 };
}

export const BUILTIN_GLB_MODELS = [
  {
    id: 'rb1100ahx4',
    label: 'MikroTik RB1100AHx4 (13 Port 1U Rack)',
    url: 'assets/models/mikrotik_rb1100ahx4.glb',
    keywords: ['rb1100ahx4', 'rb1100', 'mikrotik_rb1100ahx4'],
    ports: [
      { name: 'ether1', type: 'rj45', speed: '1G', local3d: { x: -0.5361, y: 0.0404, z: 0.2009 } },
      { name: 'ether2', type: 'rj45', speed: '1G', local3d: { x: -0.4895, y: 0.0404, z: 0.2009 } },
      { name: 'ether3', type: 'rj45', speed: '1G', local3d: { x: -0.4429, y: 0.0404, z: 0.2009 } },
      { name: 'ether4', type: 'rj45', speed: '1G', local3d: { x: -0.3962, y: 0.0404, z: 0.2009 } },
      { name: 'ether5', type: 'rj45', speed: '1G', local3d: { x: -0.3496, y: 0.0404, z: 0.2009 } },
      { name: 'ether6', type: 'rj45', speed: '1G', local3d: { x: -0.2936, y: 0.0404, z: 0.2009 } },
      { name: 'ether7', type: 'rj45', speed: '1G', local3d: { x: -0.2470, y: 0.0404, z: 0.2009 } },
      { name: 'ether8', type: 'rj45', speed: '1G', local3d: { x: -0.2004, y: 0.0404, z: 0.2009 } },
      { name: 'ether9', type: 'rj45', speed: '1G', local3d: { x: -0.1538, y: 0.0404, z: 0.2009 } },
      { name: 'ether10', type: 'rj45', speed: '1G', local3d: { x: -0.1072, y: 0.0404, z: 0.2009 } },
      { name: 'ether11', type: 'rj45', speed: '1G', local3d: { x: -0.0391, y: 0.0404, z: 0.2009 } },
      { name: 'ether12', type: 'rj45', speed: '1G', local3d: { x: 0.0062, y: 0.0404, z: 0.2009 } },
      { name: 'ether13-PoE', type: 'rj45', speed: '1G', local3d: { x: 0.0582, y: 0.0404, z: 0.2009 } }
    ]
  },
  {
    id: 'ew1200g-pro',
    label: 'Ruijie RG-EW1200G PRO (4 Port + Dual-Band Wi-Fi)',
    url: 'assets/models/ruijie_rg_ew1200g_pro.glb',
    keywords: ['ew1200g', 'ruijie_rg_ew1200g_pro', 'rg-ew1200g'],
    ports: [
      { name: 'WAN', type: 'rj45', speed: '1G', local3d: { x: 0.0917, y: 0.0798, z: -0.3285 } },
      { name: 'LAN1', type: 'rj45', speed: '1G', local3d: { x: -0.1996, y: 0.0798, z: -0.3285 } },
      { name: 'LAN2', type: 'rj45', speed: '1G', local3d: { x: -0.1133, y: 0.0798, z: -0.3285 } },
      { name: 'LAN3', type: 'rj45', speed: '1G', local3d: { x: -0.0270, y: 0.0798, z: -0.3285 } },
      { name: 'WLAN', type: 'wireless', speed: '1.2G', local3d: { x: 0.0000, y: 0.1845, z: 0.0286 } }
    ]
  },
  {
    id: 'rap2260g',
    label: 'Ruijie RG-RAP2260(G) Ceiling AP (2 Port + Wi-Fi 6)',
    url: 'assets/models/ruijie_rg_rap2260g.glb',
    keywords: ['rap2260', 'ruijie_rg_rap2260g', 'rg-rap2260'],
    ports: [
      { name: 'LAN1-PoE', type: 'rj45', speed: '2.5G', local3d: { x: -0.0568, y: 0.3494, z: -0.0343 } },
      { name: 'LAN2', type: 'rj45', speed: '1G', local3d: { x: 0.0568, y: 0.3494, z: -0.0343 } },
      { name: 'WLAN', type: 'wireless', speed: '1.8G', local3d: { x: 0.0000, y: 0.6500, z: 0.1394 } }
    ]
  },
  {
    id: 'tl-sg108',
    label: 'TP-Link TL-SG108 (8-Port Gigabit Desktop Switch)',
    url: 'assets/models/tp_link_tl_sg108.glb',
    keywords: ['tl_sg108', 'tl-sg108', 'sg108e', 'sg108pe', 'sg1008d'],
    ports: [
      { name: 'port1', type: 'rj45', speed: '1G', local3d: { x: -0.3764, y: 0.1103, z: 0.4225 } },
      { name: 'port2', type: 'rj45', speed: '1G', local3d: { x: -0.2653, y: 0.1103, z: 0.4225 } },
      { name: 'port3', type: 'rj45', speed: '1G', local3d: { x: -0.1543, y: 0.1103, z: 0.4225 } },
      { name: 'port4', type: 'rj45', speed: '1G', local3d: { x: -0.0432, y: 0.1103, z: 0.4225 } },
      { name: 'port5', type: 'rj45', speed: '1G', local3d: { x: 0.0679, y: 0.1103, z: 0.4225 } },
      { name: 'port6', type: 'rj45', speed: '1G', local3d: { x: 0.1790, y: 0.1103, z: 0.4225 } },
      { name: 'port7', type: 'rj45', speed: '1G', local3d: { x: 0.2900, y: 0.1103, z: 0.4225 } },
      { name: 'port8', type: 'rj45', speed: '1G', local3d: { x: 0.4011, y: 0.1103, z: 0.4225 } }
    ]
  },
  {
    id: 'tl-sg1024d',
    label: 'TP-Link TL-SG1024D (24-Port Gigabit Switch)',
    url: 'assets/models/tp_link_tl_sg1024d.glb',
    keywords: ['tl_sg1024d', 'tl-sg1024d', 'sg1024d'],
    ports: [
      { name: 'port1', type: 'rj45', speed: '1G', local3d: { x: -0.1536, y: 0.1210, z: 0.4076 } },
      { name: 'port2', type: 'rj45', speed: '1G', local3d: { x: -0.1536, y: 0.0689, z: 0.4076 } },
      { name: 'port3', type: 'rj45', speed: '1G', local3d: { x: -0.0959, y: 0.1210, z: 0.4076 } },
      { name: 'port4', type: 'rj45', speed: '1G', local3d: { x: -0.0959, y: 0.0689, z: 0.4076 } },
      { name: 'port5', type: 'rj45', speed: '1G', local3d: { x: -0.0383, y: 0.1210, z: 0.4076 } },
      { name: 'port6', type: 'rj45', speed: '1G', local3d: { x: -0.0383, y: 0.0689, z: 0.4076 } },
      { name: 'port7', type: 'rj45', speed: '1G', local3d: { x: 0.0193, y: 0.1210, z: 0.4076 } },
      { name: 'port8', type: 'rj45', speed: '1G', local3d: { x: 0.0193, y: 0.0689, z: 0.4076 } },
      { name: 'port9', type: 'rj45', speed: '1G', local3d: { x: 0.0968, y: 0.1210, z: 0.4076 } },
      { name: 'port10', type: 'rj45', speed: '1G', local3d: { x: 0.0968, y: 0.0689, z: 0.4076 } },
      { name: 'port11', type: 'rj45', speed: '1G', local3d: { x: 0.1545, y: 0.1210, z: 0.4076 } },
      { name: 'port12', type: 'rj45', speed: '1G', local3d: { x: 0.1545, y: 0.0689, z: 0.4076 } },
      { name: 'port13', type: 'rj45', speed: '1G', local3d: { x: 0.2121, y: 0.1210, z: 0.4076 } },
      { name: 'port14', type: 'rj45', speed: '1G', local3d: { x: 0.2121, y: 0.0689, z: 0.4076 } },
      { name: 'port15', type: 'rj45', speed: '1G', local3d: { x: 0.2697, y: 0.1210, z: 0.4076 } },
      { name: 'port16', type: 'rj45', speed: '1G', local3d: { x: 0.2697, y: 0.0689, z: 0.4076 } },
      { name: 'port17', type: 'rj45', speed: '1G', local3d: { x: 0.3652, y: 0.1210, z: 0.4076 } },
      { name: 'port18', type: 'rj45', speed: '1G', local3d: { x: 0.3652, y: 0.0689, z: 0.4076 } },
      { name: 'port19', type: 'rj45', speed: '1G', local3d: { x: 0.4228, y: 0.1210, z: 0.4076 } },
      { name: 'port20', type: 'rj45', speed: '1G', local3d: { x: 0.4228, y: 0.0689, z: 0.4076 } },
      { name: 'port21', type: 'rj45', speed: '1G', local3d: { x: 0.4805, y: 0.1210, z: 0.4076 } },
      { name: 'port22', type: 'rj45', speed: '1G', local3d: { x: 0.4805, y: 0.0689, z: 0.4076 } },
      { name: 'port23', type: 'rj45', speed: '1G', local3d: { x: 0.5598, y: 0.1210, z: 0.4076 } },
      { name: 'port24', type: 'rj45', speed: '1G', local3d: { x: 0.5598, y: 0.0689, z: 0.4076 } }
    ]
  },
  {
    id: 'dl380p-gen8',
    label: 'HPE ProLiant DL380p Gen8 (2U Rack Server, 9 Port Rear)',
    url: 'assets/models/hpe_proliant_dl380p_gen8.glb',
    keywords: ['dl380p', 'proliant', 'hpe_proliant_dl380p_gen8'],
    ports: [
      { name: 'iLO', type: 'rj45', speed: '1G', local3d: { x: 0.0999, y: 0.0259, z: -0.6357 } },
      { name: 'nic1', type: 'rj45', speed: '1G', local3d: { x: 0.2533, y: 0.0259, z: -0.6357 } },
      { name: 'nic2', type: 'rj45', speed: '1G', local3d: { x: 0.2836, y: 0.0259, z: -0.6357 } },
      { name: 'nic3', type: 'rj45', speed: '1G', local3d: { x: 0.3140, y: 0.0259, z: -0.6357 } },
      { name: 'nic4', type: 'rj45', speed: '1G', local3d: { x: 0.3443, y: 0.0259, z: -0.6357 } },
      { name: 'nic5', type: 'rj45', speed: '1G', local3d: { x: 0.0553, y: 0.0259, z: -0.6357 } },
      { name: 'nic6', type: 'rj45', speed: '1G', local3d: { x: 0.0250, y: 0.0259, z: -0.6357 } },
      { name: 'nic7', type: 'rj45', speed: '1G', local3d: { x: -0.0054, y: 0.0259, z: -0.6357 } },
      { name: 'nic8', type: 'rj45', speed: '1G', local3d: { x: -0.0357, y: 0.0259, z: -0.6357 } }
    ]
  },
  {
    id: 'es216gc-v2',
    label: 'Ruijie RG-ES216GC-V2 (16-Port Gigabit Smart Switch)',
    url: 'assets/models/ruijie_rg_es216gc_v2.glb',
    keywords: ['es216gc', 'es218gc', 'ruijie_rg_es216gc_v2', 'rg-es216gc'],
    ports: [
      { name: 'Gi0/1', type: 'rj45', speed: '1G', local3d: { x: -0.5247, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/2', type: 'rj45', speed: '1G', local3d: { x: -0.5247, y: 0.0443, z: 0.2520 } },
      { name: 'Gi0/3', type: 'rj45', speed: '1G', local3d: { x: -0.4793, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/4', type: 'rj45', speed: '1G', local3d: { x: -0.4793, y: 0.0443, z: 0.2520 } },
      { name: 'Gi0/5', type: 'rj45', speed: '1G', local3d: { x: -0.4339, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/6', type: 'rj45', speed: '1G', local3d: { x: -0.4339, y: 0.0443, z: 0.2520 } },
      { name: 'Gi0/7', type: 'rj45', speed: '1G', local3d: { x: -0.3886, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/8', type: 'rj45', speed: '1G', local3d: { x: -0.3886, y: 0.0443, z: 0.2520 } },
      { name: 'Gi0/9', type: 'rj45', speed: '1G', local3d: { x: -0.3309, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/10', type: 'rj45', speed: '1G', local3d: { x: -0.3309, y: 0.0443, z: 0.2520 } },
      { name: 'Gi0/11', type: 'rj45', speed: '1G', local3d: { x: -0.2855, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/12', type: 'rj45', speed: '1G', local3d: { x: -0.2855, y: 0.0443, z: 0.2520 } },
      { name: 'Gi0/13', type: 'rj45', speed: '1G', local3d: { x: -0.2401, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/14', type: 'rj45', speed: '1G', local3d: { x: -0.2401, y: 0.0443, z: 0.2520 } },
      { name: 'Gi0/15', type: 'rj45', speed: '1G', local3d: { x: -0.1947, y: 0.0810, z: 0.2520 } },
      { name: 'Gi0/16', type: 'rj45', speed: '1G', local3d: { x: -0.1947, y: 0.0443, z: 0.2520 } }
    ]
  },
  {
    id: 'rb750gr3',
    label: 'MikroTik hEX RB750Gr3 (5-Port Gigabit Router)',
    name: 'MikroTik hEX RB750Gr3',
    brand: 'MikroTik',
    model: 'RB750Gr3',
    deviceType: 'mikrotik-hex',
    category: 'core',
    customIcon: 'router',
    url: 'assets/models/mikrotik_rb750gr3_hex.glb',
    keywords: ['rb750gr3', 'mikrotik_rb750gr3_hex', 'mikrotik-hex'],
    ports: [
      { name: 'ether1', type: 'rj45', speed: '1G', local3d: { x: -0.1069, y: 0.1561, z: 0.5042 } },
      { name: 'ether2', type: 'rj45', speed: '1G', local3d: { x: 0.0417, y: 0.1561, z: 0.5042 } },
      { name: 'ether3', type: 'rj45', speed: '1G', local3d: { x: 0.1904, y: 0.1561, z: 0.5042 } },
      { name: 'ether4', type: 'rj45', speed: '1G', local3d: { x: 0.3390, y: 0.1561, z: 0.5042 } },
      { name: 'ether5', type: 'rj45', speed: '1G', local3d: { x: 0.4876, y: 0.1561, z: 0.5042 } }
    ]
  },
  {
    id: 'tl-poe160s',
    label: 'TP-Link TL-PoE160S (PoE+ Injector 2-Port)',
    name: 'TP-Link TL-PoE160S',
    brand: 'TP-Link',
    model: 'TL-PoE160S',
    deviceType: 'poe-switch',
    category: 'infrastructure',
    customIcon: 'switch',
    url: 'assets/models/tp_link_tl_poe160s.glb',
    keywords: ['poe160s', 'tp_link_tl_poe160s'],
    ports: [
      { name: 'PoE-Out', type: 'rj45', speed: '1G', local3d: { x: -0.0104, y: 0.1255, z: 0.5724 } },
      { name: 'Data-In', type: 'rj45', speed: '1G', local3d: { x: 0.1368, y: 0.1255, z: 0.5724 } }
    ]
  },
  {
    id: 'dahua-ip-cam',
    label: 'Dahua Indoor Dome IP Camera (PoE)',
    name: 'Dahua IP Cam Indoor',
    brand: 'Dahua',
    model: 'IPC-HDW',
    deviceType: 'cctv',
    category: 'end-device',
    customIcon: 'cctv',
    url: 'assets/models/dahua_ip_cam_indoor.glb',
    keywords: ['dahua_ip_cam', 'dahua_ip_cam_indoor', 'ip cam'],
    ports: [
      { name: 'PoE', type: 'rj45', speed: '100M', local3d: { x: 0.0000, y: 0.7260, z: -0.6500 } }
    ]
  },
  {
    id: 'dahua-nvr',
    label: 'Dahua NVR (Network Video Recorder)',
    name: 'Dahua NVR',
    brand: 'Dahua',
    model: 'NVR4108HS',
    deviceType: 'nvr',
    category: 'core',
    customIcon: 'server',
    url: 'assets/models/dahua_nvr.glb',
    keywords: ['dahua_nvr', 'dahua nvr', 'nvr'],
    ports: [
      { name: 'LAN', type: 'rj45', speed: '1G', local3d: { x: 0.1103, y: 0.0741, z: -0.4819 } }
    ]
  }
];

const BUILTIN_META_BY_ID = {
  'rb1100ahx4': { name: 'MikroTik RB1100AHx4', brand: 'MikroTik', model: 'RB1100AHx4', deviceType: 'router', category: 'core', customIcon: 'router' },
  'ew1200g-pro': { name: 'Ruijie RG-EW1200G PRO', brand: 'Ruijie', model: 'RG-EW1200G PRO', deviceType: 'router', category: 'distribution', customIcon: 'router' },
  'rap2260g': { name: 'Ruijie RG-RAP2260(G)', brand: 'Ruijie', model: 'RG-RAP2260(G)', deviceType: 'ruijie-rap2260', category: 'distribution', customIcon: 'ap' },
  'tl-sg108': { name: 'TP-Link TL-SG108', brand: 'TP-Link', model: 'TL-SG108', deviceType: 'unmanaged-switch', category: 'distribution', customIcon: 'switch' },
  'tl-sg1024d': { name: 'TP-Link TL-SG1024D', brand: 'TP-Link', model: 'TL-SG1024D', deviceType: 'tplink-sg1024d', category: 'distribution', customIcon: 'switch' },
  'dl380p-gen8': { name: 'HPE ProLiant DL380p Gen8', brand: 'HPE', model: 'DL380p Gen8', deviceType: 'server', category: 'core', customIcon: 'server' },
  'es216gc-v2': { name: 'Ruijie RG-ES216GC-V2', brand: 'Ruijie', model: 'RG-ES216GC-V2', deviceType: 'managed-switch', category: 'distribution', customIcon: 'switch' }
};

export function getBuiltinGlbCustomTemplates() {
  return BUILTIN_GLB_MODELS.map((entry) => {
    const meta = BUILTIN_META_BY_ID[entry.id] || {};
    const type = entry.deviceType || meta.deviceType || 'custom';
    const spatial = getDefaultSpatial3d(type);
    return {
      id: `custom-glb-${entry.id}`,
      builtinGlbId: entry.id,
      isCustom: true,
      isUserGlb: true,
      name: entry.name || meta.name || entry.label,
      brand: entry.brand || meta.brand || '',
      model: entry.model || meta.model || '',
      type,
      category: entry.category || meta.category || 'core',
      status: 'online',
      markerStyle: 'rounded',
      customIcon: entry.customIcon || meta.customIcon || 'router',
      customImage: '',
      ports: entry.ports.map((p) => ({ ...p, local3d: { ...p.local3d } })),
      spatial3d: {
        ...spatial,
        customModelUrl: entry.url,
        modelScale: 1,
        rotationY: 0
      }
    };
  });
}

export function findBuiltinGlbModel(...hints) {
  const combined = hints
    .filter(Boolean)
    .map((h) => String(h).toLowerCase())
    .join(' ');
  if (!combined) return null;
  // Ignore huge base64 data URLs when matching keywords unless we check non-data hints
  const cleanCombined = combined.replace(/data:[^ ]+/g, '');
  for (const entry of BUILTIN_GLB_MODELS) {
    if (cleanCombined.includes(entry.id.toLowerCase())) return entry;
    if (entry.keywords.some((kw) => cleanCombined.includes(kw.toLowerCase()))) return entry;
  }
  return null;
}

/**
 * Generate default physical ports (with 3D local socket offsets on front/rear panel)
 * for Cisco Packet Tracer-style port mapping and 3D cable anchoring.
 * @param {string} type
 * @param {string} [preset]
 * @param {string} [customModelUrl]
 * @returns {Array<{name: string, type: string, speed: string, local3d: {x: number, y: number, z: number}}>}
 */
export function getDefaultDevicePorts(type = 'router', preset = '', customModelUrl = '') {
  const matchedGlb = findBuiltinGlbModel(preset, type, customModelUrl);
  if (matchedGlb) {
    return matchedGlb.ports.map((p) => ({
      name: p.name,
      type: p.type,
      speed: p.speed,
      local3d: { ...p.local3d }
    }));
  }

  const makeRow = (items, y = 0.12, z = 0.36, spanX = 0.88) => {
    const n = items.length;
    return items.map((item, i) => {
      const x = n === 1 ? 0 : Number(((-spanX / 2) + (i * (spanX / (n - 1)))).toFixed(3));
      return {
        name: item.name,
        type: item.type || 'rj45',
        speed: item.speed || '1G',
        local3d: item.local3d || { x, y, z }
      };
    });
  };

  if (preset === 'router-5p' || ['mikrotik-hex', 'router'].includes(type) && !preset) {
    return makeRow([
      { name: 'ether1-WAN', type: 'rj45', speed: '1G' },
      { name: 'ether2', type: 'rj45', speed: '1G' },
      { name: 'ether3', type: 'rj45', speed: '1G' },
      { name: 'ether4', type: 'rj45', speed: '1G' },
      { name: 'ether5', type: 'rj45', speed: '1G' }
    ], 0.11, 0.34, 0.72);
  }

  if (preset === 'router-ccr' || ['main-router', 'firewall', 'gateway', 'mikrotik-ccr2116', 'mikrotik-ccr2004', 'mikrotik-rb5009', 'mikrotik-rb4011', 'mikrotik-l009', 'ruijie-eg210g', 'ruijie-eg310gh', 'ruijie-nbr6210'].includes(type)) {
    return makeRow([
      { name: 'ether1', type: 'rj45', speed: '1G' },
      { name: 'ether2', type: 'rj45', speed: '1G' },
      { name: 'ether3', type: 'rj45', speed: '1G' },
      { name: 'ether4', type: 'rj45', speed: '1G' },
      { name: 'ether5', type: 'rj45', speed: '1G' },
      { name: 'ether6', type: 'rj45', speed: '1G' },
      { name: 'ether7', type: 'rj45', speed: '1G' },
      { name: 'ether8', type: 'rj45', speed: '2.5G' },
      { name: 'sfp-sfpplus1', type: 'sfp+', speed: '10G' },
      { name: 'sfp-sfpplus2', type: 'sfp+', speed: '10G' }
    ], 0.12, 0.36, 0.96);
  }

  if (preset === 'switch-24p' || ['core-switch', 'mikrotik-crs326', 'mikrotik-crs328', 'ruijie-rg-s2915-24gt4ms', 'tplink-t2600g-28ts', 'tplink-tl-sg3428'].includes(type)) {
    const ports = [];
    for (let i = 1; i <= 12; i++) {
      const x = Number((-0.48 + ((i - 1) * (0.76 / 11))).toFixed(3));
      ports.push({ name: `Gi0/${i * 2 - 1}`, type: 'rj45', speed: '1G', local3d: { x, y: 0.15, z: 0.36 } });
      ports.push({ name: `Gi0/${i * 2}`, type: 'rj45', speed: '1G', local3d: { x, y: 0.08, z: 0.36 } });
    }
    ports.push({ name: 'Te0/25-SFP+', type: 'sfp+', speed: '10G', local3d: { x: 0.38, y: 0.15, z: 0.36 } });
    ports.push({ name: 'Te0/26-SFP+', type: 'sfp+', speed: '10G', local3d: { x: 0.38, y: 0.08, z: 0.36 } });
    ports.push({ name: 'Te0/27-SFP+', type: 'sfp+', speed: '10G', local3d: { x: 0.48, y: 0.15, z: 0.36 } });
    ports.push({ name: 'Te0/28-SFP+', type: 'sfp+', speed: '10G', local3d: { x: 0.48, y: 0.08, z: 0.36 } });
    return ports;
  }

  if (preset === 'switch-8p' || type.includes('switch') || type.includes('crs') || type.includes('css') || type.includes('sg') || type.includes('es2')) {
    return makeRow([
      { name: 'Gi0/1', type: 'rj45', speed: '1G' },
      { name: 'Gi0/2', type: 'rj45', speed: '1G' },
      { name: 'Gi0/3', type: 'rj45', speed: '1G' },
      { name: 'Gi0/4', type: 'rj45', speed: '1G' },
      { name: 'Gi0/5', type: 'rj45', speed: '1G' },
      { name: 'Gi0/6', type: 'rj45', speed: '1G' },
      { name: 'Gi0/7', type: 'rj45', speed: '1G' },
      { name: 'Gi0/8', type: 'rj45', speed: '1G' },
      { name: 'SFP1', type: 'sfp+', speed: '10G' },
      { name: 'SFP2', type: 'sfp+', speed: '10G' }
    ], 0.12, 0.36, 0.94);
  }

  if (preset === 'ap-2p' || ['access-point', 'wireless-bridge', 'mikrotik-cap-ax', 'mikrotik-wap-ax'].includes(type) || type.includes('ap') || type.includes('eap') || type.includes('cpe')) {
    return makeRow([
      { name: 'eth1-PoE', type: 'rj45', speed: '2.5G' },
      { name: 'eth2-LAN', type: 'rj45', speed: '1G' },
      { name: 'wlan1-5G', type: 'wireless', speed: '1.2G' }
    ], 0.08, 0.25, 0.42);
  }

  if (preset === 'server-4p' || ['server', 'nas', 'nvr'].includes(type)) {
    return makeRow([
      { name: 'eno1-Mgmt', type: 'rj45', speed: '1G' },
      { name: 'eno2-LAN', type: 'rj45', speed: '2.5G' },
      { name: 'ens1f0-SFP+', type: 'sfp+', speed: '10G' },
      { name: 'ens1f1-SFP+', type: 'sfp+', speed: '10G' }
    ], 0.22, 0.42, 0.64);
  }

  if (['olt', 'odp', 'fo-terminal'].includes(type)) {
    return makeRow([
      { name: 'uplink-SFP+1', type: 'sfp+', speed: '10G' },
      { name: 'PON-1', type: 'fiber', speed: '2.5G' },
      { name: 'PON-2', type: 'fiber', speed: '2.5G' },
      { name: 'PON-3', type: 'fiber', speed: '2.5G' },
      { name: 'PON-4', type: 'fiber', speed: '2.5G' }
    ], 0.12, 0.34, 0.76);
  }

  // Default 2-port endpoint (PC, Laptop, Printer, CCTV, IP Phone, ONT)
  return makeRow([
    { name: 'eth0', type: 'rj45', speed: '1G' },
    { name: 'port1', type: 'rj45', speed: '1G' }
  ], 0.1, 0.28, 0.3);
}

export const DeviceSchema = {
  /**
   * Factory function to create a validated device object with default values
   * @param {Object} params 
   * @returns {Object}
   */
  create(params = {}) {
    const id = params.id || generateId('dev');
    const type = params.type || 'router';
    const defaultSpatial = getDefaultSpatial3d(type);
    const rawSpatial = params.spatial3d || {};
    const matchedGlb = findBuiltinGlbModel(params.model, params.name, type, rawSpatial.customModelUrl);
    const resolvedModelUrl = rawSpatial.customModelUrl || (matchedGlb ? matchedGlb.url : '');
    const rawPorts = Array.isArray(params.ports) && params.ports.length > 0
      ? params.ports
      : getDefaultDevicePorts(type, params.model || params.name || '', resolvedModelUrl);
    return {
      id: id,
      name: params.name || 'New Device',
      type: type,                              // router, switch, ap, server, cctv, etc.
      category: params.category || 'core',     // core, distribution, infrastructure, end-device
      brand: params.brand || '',
      model: params.model || '',
      customIcon: params.customIcon || '',
      customImage: params.customImage || '',
      markerStyle: params.markerStyle || 'rounded',
      ports: rawPorts.map((p, idx) => ({
        name: String(p.name || `port${idx + 1}`).trim(),
        type: p.type || 'rj45',
        speed: p.speed || '1G',
        local3d: {
          x: typeof p.local3d?.x === 'number' ? p.local3d.x : 0,
          y: typeof p.local3d?.y === 'number' ? p.local3d.y : 0.12,
          z: typeof p.local3d?.z === 'number' ? p.local3d.z : 0.35
        }
      })),
      spatial3d: {
        elevationMeters: typeof rawSpatial.elevationMeters === 'number' ? rawSpatial.elevationMeters : defaultSpatial.elevationMeters,
        mountType: rawSpatial.mountType || defaultSpatial.mountType,
        rackUnit: rawSpatial.rackUnit !== undefined ? rawSpatial.rackUnit : defaultSpatial.rackUnit,
        customModelUrl: resolvedModelUrl,
        modelScale: typeof rawSpatial.modelScale === 'number' ? rawSpatial.modelScale : 1,
        rotationY: typeof rawSpatial.rotationY === 'number' ? rawSpatial.rotationY : 0
      },
      wirelessCoverage: params.wirelessCoverage ? {
        enabled: Boolean(params.wirelessCoverage.enabled),
        radiusMeters: typeof params.wirelessCoverage.radiusMeters === 'number' ? params.wirelessCoverage.radiusMeters : 25,
        color: params.wirelessCoverage.color || '#76c457',
        opacity: typeof params.wirelessCoverage.opacity === 'number' ? params.wirelessCoverage.opacity : 0.18,
        hatch: params.wirelessCoverage.hatch !== undefined ? Boolean(params.wirelessCoverage.hatch) : true,
        band: params.wirelessCoverage.band || 'dual-band',
        showLabel: params.wirelessCoverage.showLabel !== undefined ? Boolean(params.wirelessCoverage.showLabel) : true
      } : (
        (params.type === 'access-point' || params.type === 'wireless-bridge' || params.type === 'network-pole') ? {
          enabled: true,
          radiusMeters: params.type === 'wireless-bridge' ? 80 : (params.type === 'access-point' ? 25 : 30),
          color: params.type === 'wireless-bridge' ? '#06b6d4' : '#76c457',
          opacity: 0.18,
          hatch: true,
          band: params.type === 'wireless-bridge' ? 'ptp' : 'dual-band',
          showLabel: true
        } : null
      ),
      position: {
        x: typeof params.position?.x === 'number' ? params.position.x : 0.5,
        y: typeof params.position?.y === 'number' ? params.position.y : 0.5
      },
      network: {
        ip: params.network?.ip || params.ip || '',
        mac: params.network?.mac || params.mac || '',
        subnet: params.network?.subnet || params.subnet || '255.255.255.0',
        vlan: params.network?.vlan !== undefined ? Number(params.network.vlan) : (params.vlan !== undefined ? Number(params.vlan) : 1),
        hostname: params.network?.hostname || params.hostname || ''
      },
      status: params.status || 'unknown',      // online, offline, warning, unknown
      layerVisible: params.layerVisible !== undefined ? Boolean(params.layerVisible) : true,
      layerLocked: Boolean(params.layerLocked),
      location: params.location || '',
      firmware: params.firmware || '',
      installedAt: params.installedAt || new Date().toISOString().split('T')[0],
      notes: params.notes || '',
      createdAt: params.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Validate a device object
   * @param {Object} device 
   * @returns {{isValid: boolean, errors: string[]}}
   */
  validate(device) {
    const errors = [];
    if (!device.id) errors.push('Device ID is required');
    if (!device.name || device.name.trim() === '') errors.push('Device name is required');
    if (!device.position || typeof device.position.x !== 'number' || typeof device.position.y !== 'number') {
      errors.push('Valid normalized coordinates (position.x and position.y) are required');
    }
    if (device.position && (device.position.x < 0 || device.position.x > 1 || device.position.y < 0 || device.position.y > 1)) {
      errors.push('Normalized coordinates must be within [0, 1]');
    }
    if (device.network?.ip && !validateIp(device.network.ip)) {
      errors.push('Invalid IPv4 address format');
    }
    if (device.network?.mac && !validateMac(device.network.mac)) {
      errors.push('Invalid MAC address format (e.g., 00:1A:2B:3C:4D:5E)');
    }
    if (device.network?.vlan && !validateVlan(device.network.vlan)) {
      errors.push('VLAN ID must be an integer between 1 and 4094');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};
