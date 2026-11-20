# Rencana Implementasi Tahap 6 (Masalah Utama 1): Simulator Jaringan Mobile-First untuk Siswa Tanpa Laptop
**SmartSchool NetMap — SMK Negeri 1 Beringin**

*Dokumen Perencanaan Teknis — Fokus: Menyelesaikan Masalah Utama 1 (Pengalaman Praktik Simulator Jaringan ala Packet Tracer & WinBox yang Nyaman di HP Android Tanpa Laptop)*  
*Tanggal: 20 November 2026*  
*Status: Planned (Siap Dieksekusi Bertahap)*

---

## 1. Latar Belakang & Rumusan Masalah

Sebagian besar siswa **SMK Negeri 1 Beringin** belum memiliki laptop pribadi dan mengandalkan **smartphone Android (layar 5.8"–6.7", RAM 3–6 GB)** untuk belajar di rumah maupun saat giliran praktikum. Meskipun SmartSchool NetMap saat ini sudah memiliki engine 3D, *virtual joystick* Mode Teknisi, serta modal `Simulasi & CLI` ([packet-tracer-panel.js](../js/ui/packet-tracer-panel.js)), pengalaman praktik jaringan inti di layar HP masih menghadapi **5 hambatan utama**:

1. **Mengetik CLI Panjang di Keyboard HP Sangat Rawan Error**: Keyboard HP memiliki *autocorrect*, *auto-capitalize*, tidak memiliki tombol `Tab` / Panah `↑↓`, serta memakan 45–55% tinggi layar sehingga menutupi output terminal.
2. **Belum Ada Antarmuka GUI Ringkas ala WinBox / WebFig yang Terhubung dengan CLI**: Di dunia nyata (praktikum MikroTik / Cisco SMK), pemula belajar jauh lebih cepat jika bisa mengonfigurasi IP/VLAN/Gateway/DHCP lewat form visual **sambil melihat langsung padanan perintah CLI-nya**.
3. **Engine Simulasi Belum Mendukung Multi-Interface, Gateway, Static Route, DHCP & NAT**: Saat ini [network-simulator.js](../js/simulation/network-simulator.js) baru menyimpan 1 IP per perangkat (`device.network.ip`) sehingga belum bisa mensimulasikan router dengan 2+ subnet nyata (mis. `ether1` ke ISP/Core dan `ether2` ke LAN Lab PPLG) maupun praktik DHCP & NAT standar UKK TKJ/TJKT.
4. **Pemilihan Port Fisik Terlalu Rapat untuk Jari di Layar Kecil**: [port-picker-modal.js](../js/ui/port-picker-modal.js) memakai layout 2 kolom berdampingan yang menyempit di HP *portrait*, dan lubang port 3D pada switch 24-port sulit ditekan jari secara akurat.
5. **Modal Simulator Menutupi Animasi Paket 3D & Berat di HP Entry-Level**: Ketika siswa menekan *Kirim Paket Ping* dari modal di HP, animasi paket 3D berjalan di belakang backdrop modal yang penuh, dan *shadow map* 3D tetap aktif penuh di latar belakang sehingga membuat HP low-end panas/lag.

---

## 2. Tujuan & Prinsip Desain (Mobile-First Lab Experience)

1. **Zero Friction Typing di HP**: Siswa dapat menyelesaikan 100% praktikum konfigurasi IP, VLAN, Gateway, Static Route, DHCP, dan Ping/Traceroute di HP tanpa frustrasi oleh keyboard virtual.
2. **Belajar Nyata, Bukan Sekadar Klik**: Setiap aksi GUI di mode *Quick Config (WinBox)* selalu menampilkan **Live CLI Mirror** (sintaks MikroTik RouterOS & Cisco IOS yang ekuivalen), sehingga siswa tetap hafal sintaks industri.
3. **Touch Target Standar Minimal 44×44 px**: Seluruh tombol port, chip token CLI, dan kontrol navigasi di layar sentuh dirancang ramah ibu jari (*thumb-friendly*).
4. **Backward-Compatible 100% dengan Dokumentasi Sekolah**: Semua perluasan skema jaringan (`interfaces`, `routes`, `dhcp`, `nat`) bersifat *additive* dan kompatibel penuh dengan data proyek dokumentasi SMKN 1 Beringin yang sudah tersusun.

---

## 3. Ruang Lingkup Solusi (5 Pilar Utama)

### Pilar 1 — Peningkatan Engine Simulasi L1–L3+ Standar Praktikum SMK
**File target:** [js/simulation/network-simulator.js](../js/simulation/network-simulator.js), [js/devices/device-schema.js](../js/devices/device-schema.js)

Memperluas kemampuan simulator agar mendukung skenario praktikum nyata TKJ/TJKT tanpa merusak struktur `device.network` yang lama:

* **Per-Interface Configuration (`device.network.interfaces`)**:
  ```json
  {
    "ether1": {
      "ip": "192.168.1.2",
      "prefix": 24,
      "subnet": "255.255.255.0",
      "status": "up",
      "mode": "routed",
      "vlan": 1,
      "allowedVlans": [1],
      "dhcpClient": false
    },
    "ether2": {
      "ip": "192.168.10.1",
      "prefix": 24,
      "subnet": "255.255.255.0",
      "status": "up",
      "mode": "access",
      "vlan": 10,
      "allowedVlans": [10],
      "dhcpClient": false
    }
  }
  ```
  *Sinkronisasi otomatis:* Jika `interfaces` kosong, simulator tetap membaca `device.network.ip` / `subnet` / `vlan` lama sebagai fallback. Jika `ether1` diubah, ringkasan `device.network.ip` otomatis tersinkron.
* **Validasi Gateway & Routing Table (`device.network.routes`)**:
  * Validasi bahwa perangkat klien lintas-subnet **wajib** memiliki `gateway` yang satu subnet dengan IP klien dan cocok dengan IP interface router terhubung.
  * Mendukung **Static Route** (`dstNetwork/prefix -> nextHop`) serta **Default Route** (`0.0.0.0/0 -> gateway`).
* **Switchport Mode (`access` vs `trunk`) & Validasi VLAN Per-Port**:
  * Pada perangkat Switch/Core Switch, tiap port bisa diset `access` (1 VLAN) atau `trunk` (`allowedVlans`, mis. `10,20,30`).
  * Jika kabel antar-switch membawa VLAN 10 namun port belum *trunk* atau VLAN 10 tidak diizinkan, simulasi Ping menampilkan diagnosis akurat di Layer 2 (`BLOCKED — Port ether2 tidak mengizinkan VLAN 10`).
* **Simulasi DHCP Server & DHCP Client**:
  * Router/Server dapat mengaktifkan **DHCP Pool** per interface (mis. `192.168.10.10 - 192.168.10.50`, gateway `192.168.10.1`, DNS `8.8.8.8`).
  * Perangkat klien (PC, Laptop, HP, AP) memiliki tombol 1-tap **"Request IP (DHCP)"** yang mensimulasikan *DORA* (*Discover → Offer → Request → Ack*) dan mengisi IP + Subnet + Gateway klien secara otomatis.
* **NAT Masquerade (Simulasi Akses Internet / ISP)**:
  * Flag `natMasquerade: true` pada interface WAN router untuk praktik standar MikroTik agar klien LAN bisa *ping* ke node `ISP / Cloud 8.8.8.8`.
* **Perluasan Perintah Dual-CLI (MikroTik RouterOS & Cisco IOS)**:
  * **MikroTik**: `/ip address add address=X/Y interface=ether2`, `/ip address remove`, `/ip route add dst-address=0.0.0.0/0 gateway=X`, `/ip route print`, `/ip dhcp-server setup`, `/ip dhcp-client add interface=ether1`, `/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade`, `/interface vlan add name=vlan10 vlan-id=10 interface=ether2`.
  * **Cisco IOS**: `interface Gi0/1`, `ip address <ip> <mask>`, `no shutdown` / `shutdown`, `ip default-gateway <ip>`, `ip route <net> <mask> <nh>`, `switchport mode access|trunk`, `switchport access vlan <id>`, `switchport trunk allowed vlan <list>`, `show ip route`.

---

### Pilar 2 — Antarmuka "WinBox / WebFig Quick-Config + Live CLI Mirror"
**File target:** Modul baru `js/ui/winbox-quick-config.js`, integrasi di [js/ui/packet-tracer-panel.js](../js/ui/packet-tracer-panel.js)

Menambahkan tab baru **`Quick Config (WinBox)`** di dalam modal Simulator sehingga siswa HP tidak perlu mengetik panjang untuk praktik konfigurasi nyata:

```text
┌──────────────────────────────────────────────────────────┐
│ [Quick Config (WinBox)]  [Terminal CLI]  [Ping & PDU 3D] │
├──────────────────────────────────────────────────────────┤
│ Perangkat: [MikroTik RB1100AHx4 ▾]   Status: [● ONLINE]  │
├──────────────────────────────────────────────────────────┤
│ Sub-Menu: [Interfaces] [IP & Route] [VLAN] [DHCP/NAT]    │
│                                                          │
│ ┌─ ether1 (Terhubung → ISP Modem) ────────── [UP ●] ─┐   │
│ │ IPv4   : [ 192.168.1.2  ]  CIDR: [/24 ▾]           │   │
│ │ Mode   : [Routed ▾]        VLAN: [ 1  ]            │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Live CLI Mirror (Belajar Sintaks) ────────────────┐   │
│ │ MikroTik: /ip address add address=192.168.1.2/24   │   │
│ │           interface=ether1                         │   │
│ │ Cisco   : int Gi0/0 ; ip addr 192.168.1.2 255...   │   │
│ │                         [Salin] [Buka di Terminal] │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│                   [✓ Terapkan Konfigurasi]               │
└──────────────────────────────────────────────────────────┘
```

* **Input Khusus Mobile**:
  * Field IPv4 menggunakan `inputmode="decimal"` agar keyboard HP Android otomatis memunculkan keypad angka + titik (`.`).
  * Chip cepat prefix CIDR: `/24`, `/25`, `/26`, `/27`, `/28`, `/30` (1-tap, tidak perlu hitung subnet mask manual kalau baru belajar, sambil tetap menampilkan subnet mask `255.255.255.x` secara *real-time*).
  * Tombol **"Request IP Otomatis (DHCP)"** khusus saat perangkat terpilih adalah PC/Laptop/Client.
* **Live CLI Mirror**:
  * Setiap kali siswa mengubah form, kotak pratinjau langsung mencetak perintah **MikroTik RouterOS** dan **Cisco IOS** yang sesuai, lalu mencatatnya juga ke riwayat Terminal CLI saat tombol *Terapkan* ditekan.

---

### Pilar 3 — Mobile CLI Command Builder & Smart Token Bar
**File target:** Modul baru `js/ui/cli-touch-bar.js`, integrasi di [js/ui/packet-tracer-panel.js](../js/ui/packet-tracer-panel.js)

Mengubah tab **Terminal CLI** agar nyaman dipakai di layar sentuh seperti aplikasi *Termux / Mimo*:

1. **Sanitasi Input Keyboard Mobile**:
   * Wajib menambahkan atribut `autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="send"` pada `#pt-cli-input`.
2. **Bar Kontrol Terminal Sentuh (Pengganti Tombol Fisik Laptop)**:
   * Tombol fisik khusus di atas baris input: **`↑` (Prev Cmd)**, **`↓` (Next Cmd)**, **`Tab` (Auto-Complete)**, **`?` (Help)**, **`Clear`**.
3. **2-Baris Smart Token Chips (Scroll Horizontal, 1-Tap Insert)**:
   * **Baris 1 — Sintaks Perintah** (berubah otomatis sesuai pilihan MikroTik/Cisco):
     * *MikroTik*: `/ip`, `address`, `add`, `print`, `route`, `interface`, `vlan`, `dhcp-server`, `firewall nat`, `/ping`, `address=`, `gateway=`, `interface=`.
     * *Cisco IOS*: `show`, `ip`, `int brief`, `vlan brief`, `route`, `interface`, `ip address`, `no shut`, `switchport`, `ping`, `255.255.255.0`.
   * **Baris 2 — Konteks Topologi Aktif** (dibangkitkan dinamis dari perangkat & kabel di kanvas):
     * Daftar port perangkat aktif (`ether1`, `ether2`, `sfp1`, `Gi0/1`), daftar IP perangkat lain yang bisa di-ping (`192.168.10.1`, `192.168.10.2`), serta VLAN aktif (`10`, `20`).
4. **Template Skenario 1-Tap (Command Templates)**:
   * Dropdown / tombol cepat *"Isi Template"* yang mengisi format perintah siap edit ke kotak input (mis. `/ip address add address=192.168.10.1/24 interface=ether2`), lalu siswa tinggal mengganti angkanya dan tekan *Jalankan*.

---

### Pilar 4 — Touch-Friendly Port Strip & Mobile Port-Picker Wizard
**File target:** [js/ui/port-picker-modal.js](../js/ui/port-picker-modal.js), [js/map/map-3d-engine.js](../js/map/map-3d-engine.js) (`renderSimulatorInspectorHud`), [css/components.css](../css/components.css), [css/map.css](../css/map.css)

1. **Responsive Step-by-Step Port Picker di Layar Portrait (`<= 680px`)**:
   * Di desktop/landscape: tetap tampilan 2 kolom (Sumber | Tujuan).
   * Di HP *portrait*: berubah otomatis menjadi **Wizard 2 Tab/Langkah** berlebar penuh:
     * **Langkah 1 — Pilih Port Sumber** (dengan badge hijau/merah + nama perangkat peer). Begitu siswa mengetuk 1 port kosong, otomatis lanjut ke Langkah 2.
     * **Langkah 2 — Pilih Port Tujuan** → tombol besar **`✓ Hubungkan Kabel`** di footer.
   * Tinggi minimum setiap tombol port ditingkatkan menjadi **`min-height: 44px`** agar nyaman ditekan ibu jari.
2. **Visual Port Faceplate Strip dengan LED Real-Time pada 3D Port Inspector (`#hud-3d-sim-inspector`)**:
   * Ketika siswa mengetuk perangkat di mode 3D pada HP (tanpa harus membidik lubang RJ45 mikroskopis di model 3D), tampilkan **Strip Port Horizontal Besar (48×44px per soket)** di bagian bawah layar:
     * Menampilkan ikon soket RJ45 / SFP+ / Fiber + nomor port (`e1`, `e2`, ..., `sfp1`) + lampu LED status (**Hijau menyala** = *Link UP*, **Merah** = *Link DOWN/Port mati*, **Abu** = *Kosong*, **Biru berkedip** = *Sedang ditarik kabel*).
     * Tap 1x pada port kosong → mulai tarik kabel / colokkan ujung kabel aktif.
     * Tap 1x pada port terpakai → sorot kabel terkait + opsi **Lepas Kabel** atau **Lihat Perangkat Tujuan**.
   * Tambahkan 2 tombol pintasan langsung di header `#hud-3d-sim-inspector`:
     * **`⚙ WinBox / CLI`** (langsung membuka modal simulator pada perangkat ini).
     * **`⚡ Ping Dari Sini`** (langsung membuka tab Ping dengan perangkat ini sebagai *Source*).

---

### Pilar 5 — Mobile Bottom-Sheet, Keyboard Viewport Guard & Mode Hemat Grafis HP
**File target:** [css/components.css](../css/components.css), [css/layout.css](../css/layout.css), [css/map.css](../css/map.css), [js/ui/packet-tracer-panel.js](../js/ui/packet-tracer-panel.js), [js/map/map-3d-engine.js](../js/map/map-3d-engine.js)

1. **Floating Peek / Minimize Simulator Saat Melihat Animasi Paket 3D**:
   * Ketika siswa menekan **`Kirim Paket Ping (Animasi 3D)`** di layar HP:
     * Modal simulator otomatis menyusut menjadi **Compact Result Banner di bagian bawah layar** (menampilkan status `✓ PING BERHASIL • 2.4ms` + tombol **`Detail OSI`** & **`Buka Kembali`**) sehingga siswa bisa **melihat langsung bola paket data mengalir di kabel 3D antar-ruangan SMKN 1 Beringin**!
2. **Keyboard Viewport Guard (`window.visualViewport`)**:
   * Menambahkan listener `visualViewport.addEventListener('resize', ...)` pada `#packet-tracer-modal` (meniru pola yang sudah sukses dipakai di `AuthModal`):
     * Saat *soft-keyboard* HP naik, tinggi modal otomatis menyesuaikan `visualViewport.height - 16px`, header diringkas, dan area output terminal otomatis *auto-scroll* ke baris terakhir agar kotak input + token bar selalu terlihat jelas di atas keyboard.
3. **Mode Hemat Grafis HP ("Performa 3D: Hemat / Standar")**:
   * Deteksi otomatis perangkat *mobile touch* (`isMobileTouchDevice()`):
     * Secara default di HP, batasi `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.15))` dan turunkan resolusi *shadow map* (`512×512` atau nonaktif saat mode hemat aktif) — dapat diubah kapan saja oleh pengguna di dropdown **`⚙ Pengaturan`** (*Kualitas 3D: Hemat HP / Standar*).
     * **Auto-Pause Render Loop 3D** saat modal simulator layar penuh terbuka di HP (`this.isPausedByModal = true`), sehingga baterai HP hemat dan pengetikan di WinBox/CLI terasa 100% responsif tanpa *frame drop*.

---

## 4. Peta Perubahan File & Struktur Modul

```text
network-map-interaktif/
├── docs/
│   └── phase-6-mobile-simulator-ux-plan.md   # Dokumen rencana ini
├── js/
│   ├── devices/
│   │   └── device-schema.js                  # [UPDATE] Tambah field opsional interfaces, routes, dhcp, nat
│   ├── simulation/
│   │   └── network-simulator.js              # [UPDATE] Engine L1–L3+ (per-port VLAN/IP, Gateway, Static Route, DHCP, NAT, CLI baru)
│   ├── ui/
│   │   ├── winbox-quick-config.js            # [NEW] Komponen UI WinBox/WebFig Quick-Config + Live CLI Mirror
│   │   ├── cli-touch-bar.js                  # [NEW] Bar token CLI kontekstual, history ↑↓, Tab autocomplete & template
│   │   ├── packet-tracer-panel.js            # [UPDATE] Integrasi 3 tab (WinBox / CLI / Ping), VisualViewport guard & Peek mode 3D
│   │   └── port-picker-modal.js              # [UPDATE] Wizard 2-langkah mobile portrait & touch target >= 44px
│   ├── map/
│   │   └── map-3d-engine.js                  # [UPDATE] Mobile Port Strip di #hud-3d-sim-inspector, tombol WinBox/Ping, Lite 3D preset & pause saat modal penuh
│   └── app.js                                # [UPDATE] Event wiring modal:open-simulator(deviceId, tab) & toggle kualitas 3D
├── css/
│   ├── components.css                        # [UPDATE] Style WinBox Quick-Config, CLI Touch Bar, Mobile Bottom-Sheet & Port Wizard
│   ├── layout.css                            # [UPDATE] Penyesuaian visualViewport & drawer mobile
│   └── map.css                               # [UPDATE] Style LED Port Faceplate Strip pada #hud-3d-sim-inspector
└── index.html                                # [UPDATE] Tambah opsi Kualitas 3D di dropdown Pengaturan + bump cache-buster
```

---

## 5. Rencana Tahapan Eksekusi (Sub-Fase)

Agar implementasi rapi, mudah diuji, dan bebas regresi terhadap 42 test yang sudah berjalan, eksekusi dibagi menjadi **5 sub-fase berurutan**:

| Sub-Fase | Fokus Pekerjaan | Deliverable Utama |
| :--- | :--- | :--- |
| **6A** | **Upgrade Engine Simulasi L1–L3+** (`device-schema.js`, `network-simulator.js`) | Per-interface IP/VLAN/Access/Trunk, validasi Gateway & Static Route, DHCP Server/Client (DORA), NAT Masquerade, serta perluasan parser CLI MikroTik & Cisco. |
| **6B** | **WinBox Quick-Config + Live CLI Mirror** (`winbox-quick-config.js`, `packet-tracer-panel.js`) | Tab *Quick Config (WinBox)* ramah HP (`inputmode="decimal"`, chip CIDR, tombol Request DHCP) + kotak *Live CLI Mirror* (MikroTik & Cisco). |
| **6C** | **Mobile CLI Command Builder & Touch Bar** (`cli-touch-bar.js`, `packet-tracer-panel.js`) | Bar kontrol `↑ ↓ Tab ? Clear`, 2 baris Smart Token Chips (sintaks + IP/port dari kanvas), template 1-tap, serta `autocorrect="off"`. |
| **6D** | **Touch-Friendly Port Strip & Port-Picker Wizard** (`port-picker-modal.js`, `map-3d-engine.js`) | Wizard 2-langkah portrait pada `PortPickerModal`, faceplate LED strip besar (`>=44px`) di `#hud-3d-sim-inspector`, dan pintasan 1-tap ke WinBox/CLI & Ping. |
| **6E** | **Mobile Bottom-Sheet, Keyboard Guard & Mode Hemat HP** (`css/*`, `map-3d-engine.js`, `index.html`, `sw.js`) | Auto-minimize *Peek Banner* saat Ping 3D berjalan, `visualViewport` keyboard resize guard, preset *Hemat Grafis HP* + auto-pause render saat modal penuh, bundle ulang & bump cache-buster. |

---

## 6. Strategi Verifikasi & Kriteria Keberhasilan (Definition of Done)

### 6.1 Pengujian Otomatis (`test_object3d.mjs` — Tambahan Test 43–46)
1. **Test 43 — Multi-Interface, Gateway, Static Route, Switchport Trunk/Access & DHCP/NAT**:
   * Verifikasi PC1 (VLAN 10) tidak bisa ping PC2 (VLAN 20) jika port switch belum di-set `trunk` / mengizinkan VLAN terkait, lalu **berhasil** setelah port di-set `trunk` dan router dikonfigurasi gateway kedua VLAN.
   * Verifikasi DHCP Client otomatis memperoleh IP/Subnet/Gateway dari DHCP Server Router, serta Ping ke `ISP` berhasil setelah NAT Masquerade aktif.
2. **Test 44 — WinBox Quick-Config & Live CLI Mirror**:
   * Verifikasi perubahan form WinBox memperbarui state `device.network.interfaces`, menghasilkan sintaks MikroTik & Cisco yang akurat di Live CLI Mirror, dan dapat dieksekusi ulang lewat `executeCliCommand()`.
3. **Test 45 — Mobile CLI Touch Bar & History/Autocomplete**:
   * Verifikasi penyisipan token 1-tap, navigasi riwayat `↑`/`↓`, `Tab` autocomplete, serta atribut anti-autocorrect (`autocorrect="off"`) pada `#pt-cli-input`.
4. **Test 46 — Mobile Port Picker Wizard, Port Strip & Peek Banner**:
   * Verifikasi `PortPickerModal` mendukung navigasi langkah Sumber → Tujuan, `#hud-3d-sim-inspector` merender tombol *WinBox/CLI* & *Ping*, serta mode *Hemat 3D* menurunkan `pixelRatio` & menjeda render loop saat modal terbuka.

### 6.2 Verifikasi Visual & Interaksi Browser (Simulasi Viewport HP)
* Uji langsung pada 2 ukuran layar HP nyata via DevTools:
  * **Portrait HP (`360 × 800`)**: Pastikan tidak ada *horizontal overflow*, tombol port minimal `44×44px`, dan *CLI Touch Bar* tidak terpotong.
  * **Landscape HP (`800 × 360`)**: Pastikan modal *WinBox* & *Terminal CLI* tetap bisa di-scroll nyaman dan tombol `Jalankan` / `Terapkan` selalu terjangkau ibu jari.
* Uji skenario lengkap **tanpa keyboard fisik** (hanya klik/tap):
  1. Buka perangkat Router di 3D → tap **`⚙ WinBox / CLI`** → atur IP `ether1` & `ether2` + aktifkan DHCP Pool → lihat Live CLI Mirror.
  2. Buka perangkat PC → tap **`Request IP (DHCP)`** → dapat IP otomatis.
  3. Tap **`⚡ Ping`** → modal otomatis mengecil menjadi *Peek Banner* dan animasi paket data terlihat berjalan mulus pada kabel 3D menuju Router.

---

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| Proyek dokumentasi SMKN 1 Beringin lama hanya punya `device.network.ip` (belum ada `interfaces`) | Simulasi bisa gagal membaca IP lama | Fallback transparan di `NetworkSimulator`: jika `interfaces` kosong, otomatis memetakan `device.network.ip/subnet/vlan` ke interface utama. |
| Keyboard virtual Android berbeda-beda perilakunya antar Chrome/MIUI/OneUI | Input CLI bisa terdorong keluar layar | Kombinasikan `window.visualViewport` + CSS `dvh` (`max-height: 92dvh`) + `scrollIntoView({ block: 'nearest' })` saat input fokus. |
| Terlalu banyak tombol di modal HP membuat tampilan penuh | Siswa pemula bingung | Kelompokkan WinBox ke 4 sub-tab kecil (`Interfaces`, `IP/Route`, `VLAN`, `DHCP/NAT`) dan sembunyikan opsi lanjutan di balik toggle ringkas. |
