/**
 * NetMap — Built-in SMK TKJ/TJKT Curriculum Jobsheet Catalog (Phase 9C)
 * 5 Packet-Tracer-style auto-graded practical labs anchored to real SMKN 1 Beringin buildings,
 * plus validator & templates for Teacher Custom Jobsheet Authoring (.json).
 */

export const EVALUATOR_TEMPLATES = [
  {
    type: 'devices-in-room',
    label: 'Perangkat Terpasang di Gedung Target',
    defaultParams: { roomMatch: 'pplg', requires: ['router', 'switch'] }
  },
  {
    type: 'neat-cables-count',
    label: 'Minimal Kabel Rapi (Skor Kerapian >= 75)',
    defaultParams: { minCount: 2, minNeatness: 75 }
  },
  {
    type: 'subnet-configured',
    label: 'Konfigurasi IPv4 Satu Subnet',
    defaultParams: { cidr: '192.168.10.0/24', minHosts: 2 }
  },
  {
    type: 'vlans-configured',
    label: 'Konfigurasi VLAN Aktif',
    defaultParams: { vlans: [10, 20] }
  },
  {
    type: 'trunk-port-configured',
    label: 'Konfigurasi Port Mode Trunk',
    defaultParams: { minCount: 1 }
  },
  {
    type: 'dhcp-server-enabled',
    label: 'Aktifkan DHCP Server di Router',
    defaultParams: {}
  },
  {
    type: 'nat-masquerade-enabled',
    label: 'Aktifkan NAT Masquerade di Router',
    defaultParams: {}
  },
  {
    type: 'ceiling-ap-mounted',
    label: 'Pasang Access Point di Plafon (>= 2.5m)',
    defaultParams: { minElevation: 2.5 }
  },
  {
    type: 'ssid-configured',
    label: 'Konfigurasi SSID WiFi pada AP',
    defaultParams: {}
  },
  {
    type: 'ping-success',
    label: 'Uji Ping Berhasil (Simulator PDU 3D)',
    defaultParams: { fromCategory: 'end', toCategory: 'core' }
  }
];

export const BUILTIN_JOBSHEETS = [
  {
    id: 'js-01-lab-pplg-basic',
    code: 'JS-1',
    title: 'Jobsheet 1: Instalasi LAN & Pengkabelan Rapi Lab PPLG',
    level: 'Dasar (Kelas X TJKT)',
    estimatedMinutes: 20,
    targetRoomPreset: 'pplg',
    targetRoomKeywords: ['pplg', 'lab komputer', 'lab'],
    setupMode: 'clear-target-room',
    description: 'Merakit jaringan LAN dasar di dalam Gedung Lab PPLG: memasang Router, Switch, dan 2 PC, menarik kabel UTP rapi (skor >= 75), mengonfigurasi IPv4 192.168.10.0/24, serta verifikasi Ping.',
    starterDevices: [],
    starterCables: [],
    tasks: [
      {
        id: 't1',
        label: 'Pasang 1 Router & 1 Switch di dalam Gedung Lab PPLG',
        weight: 20,
        hint: 'Buka Library Perangkat di sidebar kiri, drag Router (MikroTik) dan Switch ke area Gedung Lab PPLG.',
        evaluator: { type: 'devices-in-room', roomMatch: 'pplg', requires: ['router', 'switch'] }
      },
      {
        id: 't2',
        label: 'Hubungkan Router -> Switch -> 2 PC dengan minimal 3 kabel UTP rapi (Skor >= 75)',
        weight: 25,
        hint: 'Tarik kabel lewat Draw Cable atau Mode Teknisi (C), lalu klik Auto-Rapikan 90 derajat di Properti Kabel.',
        evaluator: { type: 'neat-cables-count', minCount: 3, minNeatness: 75 }
      },
      {
        id: 't3',
        label: 'Konfigurasi IP Router (192.168.10.1/24) & minimal 2 host lain pada subnet 192.168.10.0/24',
        weight: 25,
        hint: 'Klik perangkat -> buka Simulasi & CLI -> tab Quick Config (WinBox) atau ketik /ip address add address=192.168.10.1/24.',
        evaluator: { type: 'subnet-configured', cidr: '192.168.10.0/24', minHosts: 3 }
      },
      {
        id: 't4',
        label: 'Uji konektivitas Ping berhasil dari PC ke Router',
        weight: 30,
        hint: 'Buka Simulasi & CLI -> tab Ping & PDU 3D -> pilih PC sebagai Sumber dan Router sebagai Tujuan lalu klik Jalankan Ping.',
        evaluator: { type: 'ping-success', fromCategory: 'end', toCategory: 'core' }
      }
    ]
  },
  {
    id: 'js-02-vlan-trunk-kc',
    code: 'JS-2',
    title: 'Jobsheet 2: VLAN & Trunking Ruang Server -> Lab KC',
    level: 'Menengah (Kelas XI TJKT)',
    estimatedMinutes: 25,
    targetRoomPreset: 'lab_kc',
    targetRoomKeywords: ['kc', 'lab kc', 'komputer'],
    setupMode: 'starter-topology',
    description: 'Memisahkan segmen jaringan Siswa (VLAN 10) dan Guru (VLAN 20) menggunakan port Trunk antar-switch dari Ruang Server menuju Lab KC, lengkap dengan routing antar-VLAN.',
    starterDevices: [
      { key: 'rtr', name: 'Core Router SMKN1', type: 'main-router', category: 'core', offsetX: -0.05, offsetY: -0.03, elevation: 1.0, ip: '192.168.10.1', vlan: 10 },
      { key: 'sw1', name: 'Switch Core Server', type: 'core-switch', category: 'core', offsetX: -0.02, offsetY: -0.02, elevation: 1.0, ip: '192.168.10.2', vlan: 1 },
      { key: 'sw2', name: 'Switch Dist Lab KC', type: 'access-switch', category: 'distribution', offsetX: 0.0, offsetY: 0.0, elevation: 1.0, ip: '192.168.10.3', vlan: 1 },
      { key: 'pc1', name: 'PC Siswa Lab KC', type: 'pc', category: 'endDevice', offsetX: 0.02, offsetY: 0.01, elevation: 0.8, ip: '192.168.10.11', vlan: 1 },
      { key: 'pc2', name: 'PC Guru Lab KC', type: 'pc', category: 'endDevice', offsetX: 0.02, offsetY: -0.015, elevation: 0.8, ip: '192.168.20.11', vlan: 1 }
    ],
    starterCables: [
      { from: 'rtr', to: 'sw1', type: 'ethernet', cableCategory: 'cat6', portSource: 'ether1', portDestination: 'Gi0/1' },
      { from: 'sw1', to: 'sw2', type: 'fiber', cableCategory: 'fiber-sm', portSource: 'sfp1', portDestination: 'sfp1' },
      { from: 'sw2', to: 'pc1', type: 'ethernet', cableCategory: 'cat6', portSource: 'Fa0/1', portDestination: 'eth0' },
      { from: 'sw2', to: 'pc2', type: 'ethernet', cableCategory: 'cat6', portSource: 'Fa0/2', portDestination: 'eth0' }
    ],
    tasks: [
      {
        id: 't1',
        label: 'Konfigurasi VLAN 10 (Siswa) & VLAN 20 (Guru) pada perangkat Lab KC',
        weight: 25,
        hint: 'Atur VLAN 10 pada PC Siswa / port Fa0/1 dan VLAN 20 pada PC Guru / port Fa0/2 lewat Quick Config (WinBox) atau CLI.',
        evaluator: { type: 'vlans-configured', vlans: [10, 20] }
      },
      {
        id: 't2',
        label: 'Konfigurasi minimal 1 port mode Trunk pada Switch penghubung',
        weight: 25,
        hint: 'Buka Switch -> tab Quick Config -> Interface -> ubah mode port uplink (sfp1 / Gi0/1) menjadi Trunk dengan VLAN 10,20.',
        evaluator: { type: 'trunk-port-configured', minCount: 1 }
      },
      {
        id: 't3',
        label: 'Konfigurasi subnet 192.168.10.0/24 dan 192.168.20.0/24 aktif pada perangkat',
        weight: 25,
        hint: 'Pastikan IP PC Siswa di 192.168.10.x/24 dan PC Guru di 192.168.20.x/24.',
        evaluator: { type: 'multi-subnet-configured', cidrs: ['192.168.10.0/24', '192.168.20.0/24'] }
      },
      {
        id: 't4',
        label: 'Uji Ping berhasil antar perangkat pada topologi VLAN',
        weight: 25,
        hint: 'Buka tab Ping & PDU 3D lalu kirim paket Ping dari PC Siswa ke Router atau antar PC.',
        evaluator: { type: 'ping-success', fromCategory: 'any', toCategory: 'any' }
      }
    ]
  },
  {
    id: 'js-03-dhcp-nat-bk',
    code: 'JS-3',
    title: 'Jobsheet 3: DHCP Server & NAT Internet MikroTik (Ruang BK / TU)',
    level: 'Menengah (Kelas XI TJKT)',
    estimatedMinutes: 25,
    targetRoomPreset: 'ruang_bk',
    targetRoomKeywords: ['bk', 'kepsek', 'tu'],
    setupMode: 'starter-topology',
    description: 'Mengaktifkan layanan DHCP Server otomatis bagi komputer Ruang BK/TU dan mengonfigurasi NAT Masquerade di MikroTik agar klien dapat mengakses internet (8.8.8.8).',
    starterDevices: [
      { key: 'isp', name: 'Gateway ISP / Internet', type: 'main-router', category: 'core', offsetX: -0.05, offsetY: -0.03, elevation: 1.0, ip: '8.8.8.8', vlan: 1 },
      { key: 'rtr', name: 'MikroTik Gateway BK', type: 'router', category: 'core', offsetX: -0.01, offsetY: 0.0, elevation: 1.0, ip: '192.168.30.1', vlan: 1 },
      { key: 'sw1', name: 'Switch Ruang BK', type: 'access-switch', category: 'distribution', offsetX: 0.01, offsetY: 0.0, elevation: 1.0, ip: '192.168.30.2', vlan: 1 },
      { key: 'pc1', name: 'PC Administrasi BK', type: 'pc', category: 'endDevice', offsetX: 0.03, offsetY: 0.01, elevation: 0.8, ip: '', vlan: 1 }
    ],
    starterCables: [
      { from: 'isp', to: 'rtr', type: 'fiber', cableCategory: 'fiber-sm', portSource: 'sfp1', portDestination: 'ether1' },
      { from: 'rtr', to: 'sw1', type: 'ethernet', cableCategory: 'cat6', portSource: 'ether2', portDestination: 'Gi0/1' },
      { from: 'sw1', to: 'pc1', type: 'ethernet', cableCategory: 'cat6', portSource: 'Fa0/1', portDestination: 'eth0' }
    ],
    tasks: [
      {
        id: 't1',
        label: 'Aktifkan DHCP Server Pool pada Router MikroTik Gateway BK',
        weight: 25,
        hint: 'Pilih MikroTik Gateway BK -> Simulasi & CLI -> tab Quick Config -> sub-tab DHCP Server -> Aktifkan Pool LAN.',
        evaluator: { type: 'dhcp-server-enabled' }
      },
      {
        id: 't2',
        label: 'Aktifkan NAT Masquerade pada Router MikroTik menuju WAN/ISP',
        weight: 25,
        hint: 'Pada tab Quick Config -> sub-tab NAT / Firewall -> nyalakan toggle NAT Masquerade.',
        evaluator: { type: 'nat-masquerade-enabled' }
      },
      {
        id: 't3',
        label: 'Dapatkan IP otomatis pada PC Administrasi BK via DHCP Client',
        weight: 25,
        hint: 'Pilih PC Administrasi BK -> jalankan perintah DHCP Client (DORA) di Quick Config atau CLI agar memperoleh IP otomatis.',
        evaluator: { type: 'dhcp-client-leased' }
      },
      {
        id: 't4',
        label: 'Uji Ping berhasil dari PC Administrasi BK ke Gateway / ISP',
        weight: 25,
        hint: 'Buka tab Ping & PDU 3D -> kirim Ping dari PC Administrasi BK ke MikroTik Gateway BK atau Gateway ISP (8.8.8.8).',
        evaluator: { type: 'ping-success', fromCategory: 'end', toCategory: 'core' }
      }
    ]
  },
  {
    id: 'js-04-fo-wifi-perakitan',
    code: 'JS-4',
    title: 'Jobsheet 4: Backbone Fiber Optic & Access Point Plafon (Lab Perakitan)',
    level: 'Menengah (Kelas XI TJKT)',
    estimatedMinutes: 25,
    targetRoomPreset: 'perakitan',
    targetRoomKeywords: ['perakitan', 'bengkel', 'lab'],
    setupMode: 'starter-topology',
    description: 'Menghubungkan gedung Lab Perakitan 1 ke Ruang Server dengan jalur Fiber Optic ber-ducting rapi, memasang Access Point di plafon (>= 2.5m), dan mengatur SSID WiFi sekolah.',
    starterDevices: [
      { key: 'core', name: 'Core Switch Ruang Server', type: 'core-switch', category: 'core', offsetX: -0.05, offsetY: -0.02, elevation: 1.2, ip: '192.168.40.1', vlan: 40 },
      { key: 'dist', name: 'Dist Switch Lab Perakitan', type: 'dist-switch', category: 'distribution', offsetX: 0.0, offsetY: 0.0, elevation: 1.0, ip: '192.168.40.2', vlan: 40 }
    ],
    starterCables: [],
    tasks: [
      {
        id: 't1',
        label: 'Tarik kabel Fiber Optic Single Mode dengan Ducting/Tray rapi (Skor >= 75) ke Lab Perakitan',
        weight: 25,
        hint: 'Hubungkan Core Switch ke Dist Switch dengan kabel Fiber Optic, lalu aktifkan PVC Duct / Cable Tray & Auto-Rapikan 90 derajat.',
        evaluator: { type: 'fiber-backbone-ducted', minNeatness: 75 }
      },
      {
        id: 't2',
        label: 'Pasang minimal 1 Access Point pada elevasi plafon (>= 2.5 meter)',
        weight: 25,
        hint: 'Drag Access Point ke dalam Lab Perakitan lalu naikkan Ketinggian Z >= 2.5m di Panel Properti (atau PageUp di 3D).',
        evaluator: { type: 'ceiling-ap-mounted', minElevation: 2.5 }
      },
      {
        id: 't3',
        label: 'Konfigurasi nama SSID WiFi sekolah pada Access Point',
        weight: 25,
        hint: 'Pilih Access Point -> isi kolom SSID WiFi di Panel Properti (mis. SMKN1-Perakitan-5G).',
        evaluator: { type: 'ssid-configured' }
      },
      {
        id: 't4',
        label: 'Hubungkan Access Point ke Switch & uji Ping berhasil ke Core Switch',
        weight: 25,
        hint: 'Pastikan AP terhubung kabel UTP ke Dist Switch, atur IP satu subnet 192.168.40.x, lalu jalankan Ping ke Core Switch.',
        evaluator: { type: 'ping-success', fromCategory: 'any', toCategory: 'core' }
      }
    ]
  },
  {
    id: 'js-05-troubleshooting-ukk',
    code: 'JS-5',
    title: 'Jobsheet 5 (UKK): Detektif Troubleshooting Jaringan SMKN 1 Beringin',
    level: 'Lanjutan / UKK (Kelas XII TJKT)',
    estimatedMinutes: 30,
    targetRoomPreset: 'server',
    targetRoomKeywords: ['server', 'noc', 'pplg', 'lab'],
    setupMode: 'inject-troubleshooting-bugs',
    description: 'Sistem menyuntikkan 3 gangguan nyata (kabel putus/damaged, VLAN mismatch, dan salah subnet/gateway) ke salinan topologi sekolah. Temukan dan perbaiki semuanya hingga Ping 100% hijau!',
    starterDevices: [
      { key: 'rtr', name: 'Core Router SMKN1', type: 'main-router', category: 'core', offsetX: -0.04, offsetY: -0.02, elevation: 1.2, ip: '192.168.50.1', vlan: 50 },
      { key: 'sw1', name: 'Switch Distribusi Lab', type: 'dist-switch', category: 'distribution', offsetX: 0.0, offsetY: 0.0, elevation: 1.0, ip: '192.168.50.2', vlan: 50 },
      { key: 'pc1', name: 'PC Lab Ujian 01', type: 'pc', category: 'endDevice', offsetX: 0.03, offsetY: -0.01, elevation: 0.8, ip: '192.168.50.11', vlan: 50, gateway: '192.168.50.1' },
      { key: 'pc2', name: 'PC Lab Ujian 02', type: 'pc', category: 'endDevice', offsetX: 0.03, offsetY: 0.02, elevation: 0.8, ip: '192.168.50.12', vlan: 50, gateway: '192.168.50.1' }
    ],
    starterCables: [
      { from: 'rtr', to: 'sw1', type: 'fiber', cableCategory: 'fiber-sm', portSource: 'sfp1', portDestination: 'sfp1' },
      { from: 'sw1', to: 'pc1', type: 'ethernet', cableCategory: 'cat6', portSource: 'Fa0/1', portDestination: 'eth0' },
      { from: 'sw1', to: 'pc2', type: 'ethernet', cableCategory: 'cat6', portSource: 'Fa0/2', portDestination: 'eth0' }
    ],
    tasks: [
      {
        id: 't1',
        label: 'Bug 1 (Layer 1): Temukan & perbaiki kabel backbone yang rusak (Damaged -> Active)',
        weight: 30,
        hint: 'Periksa warna/status kabel antara Core Router dan Switch Distribusi -> ubah status kabel dari Damaged menjadi Active.',
        evaluator: { type: 'no-damaged-cables' }
      },
      {
        id: 't2',
        label: 'Bug 2 (Layer 2): Perbaiki kesalahan VLAN Mismatch pada perangkat PC Lab Ujian',
        weight: 30,
        hint: 'Cek VLAN ID pada PC Lab Ujian 01 (saat ini terisolasi di VLAN 999) dan samakan dengan VLAN jaringan utama (VLAN 50).',
        evaluator: { type: 'no-vlan-mismatch', expectedVlan: 50 }
      },
      {
        id: 't3',
        label: 'Bug 3 (Layer 3): Perbaiki IP Address / Gateway yang salah subnet pada PC Lab Ujian 02',
        weight: 20,
        hint: 'PC Lab Ujian 02 memakai IP 10.99.99.50; ubah ke subnet 192.168.50.0/24 dengan gateway 192.168.50.1.',
        evaluator: { type: 'gateway-subnet-valid', expectedCidr: '192.168.50.0/24', expectedGateway: '192.168.50.1' }
      },
      {
        id: 't4',
        label: 'Verifikasi perbaikan: Jalankan Ping berhasil dari PC Lab Ujian menuju Core Router',
        weight: 20,
        hint: 'Buka tab Ping & PDU 3D -> tes Ping dari PC Lab Ujian 01 / 02 ke Core Router SMKN1 hingga status BERHASIL.',
        evaluator: { type: 'ping-success', fromCategory: 'end', toCategory: 'core' }
      }
    ]
  }
];

/**
 * Validate a Teacher Custom Jobsheet JSON payload before importing.
 * @param {Object} raw
 * @returns {{ valid: boolean, errors: string[], jobsheet: Object|null }}
 */
export function validateCustomJobsheet(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Format file JSON Jobsheet tidak valid.'], jobsheet: null };
  }
  const title = String(raw.title || '').trim();
  if (!title) errors.push('Judul Jobsheet wajib diisi.');

  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  if (tasks.length === 0) {
    errors.push('Jobsheet minimal harus memiliki 1 tugas checklist.');
  }

  const normalizedTasks = tasks.map((t, idx) => {
    const label = String(t?.label || '').trim();
    if (!label) errors.push(`Tugas #${idx + 1} belum memiliki deskripsi label.`);
    const ev = t?.evaluator && typeof t.evaluator === 'object' ? t.evaluator : null;
    if (!ev || !ev.type) errors.push(`Tugas #${idx + 1} belum memiliki evaluator.type.`);
    return {
      id: String(t?.id || `t${idx + 1}`),
      label,
      weight: Math.max(1, Number(t?.weight) || Math.round(100 / Math.max(1, tasks.length))),
      hint: String(t?.hint || 'Periksa kembali konfigurasi perangkat dan kabel pada topologi Anda.'),
      evaluator: ev || { type: 'ping-success' }
    };
  });

  if (errors.length > 0) {
    return { valid: false, errors, jobsheet: null };
  }

  const normalized = {
    id: String(raw.id || `js-custom-${Date.now().toString(36)}`).trim(),
    code: String(raw.code || 'TUGAS').trim().slice(0, 10),
    title,
    level: String(raw.level || 'Tugas Kustom Guru').trim(),
    estimatedMinutes: Math.max(5, Number(raw.estimatedMinutes) || 20),
    targetRoomPreset: String(raw.targetRoomPreset || '').trim(),
    targetRoomKeywords: Array.isArray(raw.targetRoomKeywords)
      ? raw.targetRoomKeywords.map((k) => String(k).toLowerCase())
      : (raw.targetRoomPreset ? [String(raw.targetRoomPreset).toLowerCase()] : []),
    setupMode: ['clear-target-room', 'starter-topology', 'inject-troubleshooting-bugs', 'keep-current'].includes(raw.setupMode)
      ? raw.setupMode
      : 'keep-current',
    description: String(raw.description || 'Lembar kerja praktikum jaringan kustom dari Guru SMK.').trim(),
    starterDevices: Array.isArray(raw.starterDevices) ? raw.starterDevices : [],
    starterCables: Array.isArray(raw.starterCables) ? raw.starterCables : [],
    tasks: normalizedTasks,
    isCustom: true,
    author: String(raw.author || 'Guru TKJ/TJKT').trim()
  };

  return { valid: true, errors: [], jobsheet: normalized };
}
