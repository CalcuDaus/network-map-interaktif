# Rencana Implementasi Tahap 8 (Masalah Utama 3): Digital Twin & Dokumentasi Infrastruktur Nyata SMK Negeri 1 Beringin
**SmartSchool NetMap — SMK Negeri 1 Beringin**

*Dokumen Perencanaan Teknis — Fokus: Menyelesaikan Masalah Utama 3 (Auto-Deteksi Inventaris per Gedung, Kartu Dokumentasi Ruangan & Log Maintenance, Mode X-Ray Gedung 1-Klik, Label Nama Gedung 3D, serta Ekspor Laporan Per-Gedung)*  
*Tanggal: 20 November 2026*  
*Status: Planned (Siap Dieksekusi Bertahap)*

---

## 1. Latar Belakang & Rumusan Masalah

Seluruh gedung dan fasilitas fisik **SMK Negeri 1 Beringin** (55 preset bangunan/fasilitas termasuk *Ruang Server, Lab PPLG, Lab KC, Lab Perakitan 1 & 2, Ruang BK, Gedung Kelas, Perpustakaan, Mushola, Kepsek/TU*, dsb.) kini telah ter-render secara realistis di SmartSchool NetMap. Tujuan besar di balik usaha tersebut adalah menjadikan aplikasi ini sebagai **buku induk digital (Digital Twin) dokumentasi topologi & infrastruktur jaringan sekolah**.

Namun, pada kondisi kode saat ini ([state-manager.js](../js/core/state-manager.js), [map-3d-engine.js](../js/map/map-3d-engine.js), [properties-panel.js](../js/ui/properties-panel.js), [pdf-report-generator.js](../js/export/pdf-report-generator.js)), fungsi **dokumentasi infrastruktur per gedung** masih memiliki **5 keterbatasan utama**:

1. **Gedung (`rooms3d`) & Perangkat (`devices`) Masih Berdiri Terpisah**: Belum ada pemetaan spasial otomatis (*point-in-rotated-building*) yang mengetahui perangkat, kabel, dan rak mana saja yang berada di dalam *Gedung Lab PPLG*, *Ruang BK*, atau *Ruang Server*. Akibatnya, saat mengklik sebuah gedung, belum ada ringkasan inventaris, IP, VLAN, SSID, maupun total panjang kabel untuk ruangan tersebut.
2. **Gedung yang Dikunci di Mode "Simulasi Jaringan" Tidak Bisa Diinspeksi**: Saat ini `isRoomLocked(room)` mencegah gedung dipilih di mode Simulasi Jaringan agar tidak tergeser, tetapi efek sampingnya pengguna **tidak bisa mengklik gedung untuk membaca catatan dokumentasinya**.
3. **Belum Ada Catatan Teknisi & Log Maintenance Per-Gedung**: Objek `room` di `state-manager.js` baru menyimpan properti geometri visual (`widthMeters`, `depthMeters`, `customModelUrl`, warna), belum memiliki kolom dokumentasi operasional sekolah seperti kode ruang, penanggung jawab (PIC), catatan teknis lapangan (mis. *"ODP-03 di tiang belakang Lab KC, redaman -18 dBm"*), serta riwayat perawatan berkala.
4. **Belum Ada Mode "X-Ray Gedung" 1-Klik untuk Melihat Jalur Backbone Antar-Gedung**: Saat seluruh gedung tampil solid dari udara, jalur kabel *backbone* Fiber Optik dan UTP yang masuk menembus dinding antar-ruangan tertutup oleh atap dan tembok, sehingga menyulitkan penelusuran topologi kampus secara menyeluruh.
5. **Belum Ada Label Nama Gedung 3D Mengambang & Laporan PDF/CSV Per-Gedung**: Peta 3D kampus belum menampilkan papan nama gedung (*Building Signboard 3D*) di atas atap (dengan jumlah perangkat & VLAN), serta ekspor PDF/CSV ([pdf-report-generator.js](../js/export/pdf-report-generator.js), [csv-exporter.js](../js/export/csv-exporter.js)) masih berupa daftar datar tanpa pengelompokan resmi per gedung/ruangan.

---

## 2. Tujuan & Prinsip Desain (School Digital Twin Documentation)

1. **1-Klik Tahu Isi Setiap Gedung**: Mengklik gedung atau papan nama 3D-nya (baik di mode *Simulasi Jaringan* maupun *Edit Bangunan*) langsung membuka **Kartu Dokumentasi Gedung** lengkap dengan daftar perangkat, ringkasan IP/VLAN/SSID, panjang kabel, dan catatan teknisi — tanpa risiko gedung ikut tergeser!
2. **Transparan Seketika Saat Audit Jalur Backbone**: Tombol 1-klik **Mode X-Ray Gedung** mengubah seluruh bangunan menjadi *translucent blueprint* (~20% opasitas) agar jalur Fiber Optik, UTP, dan posisi perangkat di seluruh kompleks SMKN 1 Beringin tampak menyala tembus pandang, dan kembali 100% lossless saat dimatikan.
3. **Peta Kampus Langsung Mudah Dibaca Siapa Saja**: Papan nama gedung 3D yang bersih, bisa di-toggle on/off, dan tidak mengganggu saat berjalan di dalam ruangan (FPP).
4. **100% Backward-Compatible dengan Data Proyek Lama**: Semua field dokumentasi pada `room` (`doc`) bersifat opsional (*additive*); proyek SMKN 1 Beringin yang sudah disusun langsung otomatis mendapatkan deteksi perangkat per gedung tanpa perlu input ulang manual.

---

## 3. Ruang Lingkup Solusi (5 Pilar Utama)

### Pilar 1 — Engine Pemetaan Spasial Perangkat per Gedung & Skema Dokumentasi Gedung
**File target:** Modul baru `js/map/room-spatial-index.js`, [js/core/state-manager.js](../js/core/state-manager.js)

Membangun engine pemetaan spasial deterministik agar setiap gedung otomatis mengetahui seluruh aset jaringan yang ada di dalamnya:

* **Perluasan Skema Opsional `room.doc` di `rooms3d`**:
  ```json
  {
    "id": "room-lab-pplg",
    "name": "Lab PPLG 2 Lantai",
    "doc": {
      "roomCode": "GDG-PPLG-01",
      "zone": "Jurusan PPLG / TJKT",
      "picName": "Tim Teknisi TKJ SMKN 1 Beringin",
      "showSignboard": true,
      "notes": "ODP-03 di tiang belakang Lab KC, redaman -18.2 dBm, jalur FO masuk lewat plafon sisi timur.",
      "maintenanceLogs": [
        {
          "id": "log-1",
          "date": "2026-11-15",
          "technician": "Pak Fikri",
          "category": "fiber",
          "status": "ok",
          "summary": "Cek redaman ODP-03 & rapikan patch cord switch rack lt. 1"
        }
      ]
    }
  }
  ```
* **Algoritma Auto-Deteksi Spasial (`RoomSpatialIndex`)**:
  * Menghitung *Oriented Bounding Box (OBB)* 2D/3D setiap gedung berdasarkan pusat `(room.x, room.y)`, ukuran meter `(widthMeters, depthMeters, heightMeters)`, serta sudut putar `rotationY` (ditambah toleransi margin tepi dinding `0.35 m` agar Access Point / CCTV yang menempel di tembok luar gedung tetap terdeteksi masuk gedung tersebut).
  * Mengecualikan properti dekorasi kecil non-gedung (mis. preset kategori `decoration` seperti `pohon_*`, `tong_sampah`, `keran_air_kecil`, `plank_motivasi`) dari klaim kepemilikan perangkat, kecuali pengguna menandai secara eksplisit.
  * Untuk setiap gedung, fungsi `buildBuildingDocumentationSummary(room, devices, connections, objects3d)` menghasilkan secara *real-time*:
    1. **`devicesInside`**: Daftar perangkat di dalam gedung (diurutkan per elevasi/lantai & kategori: Router → Switch → AP → Server → PC → CCTV) beserta hitungan `online / warning / offline`.
    2. **`networkSummary`**: Daftar unik **Subnet/IP Range**, **VLAN ID aktif**, dan **SSID WiFi** yang melayani gedung tersebut.
    3. **`cableSummary`**: Pemisahan **Kabel Internal Gedung** (kedua ujung di dalam gedung ini) vs **Kabel Uplink / Backbone Keluar-Masuk** (menghubungkan gedung ini ke gedung lain seperti *Ruang Server*), lengkap dengan total panjang meter per kategori (`UTP` vs `Fiber Optic` vs `Wireless`).
    4. **`objectsInside`**: Daftar struktur fisik di dalam gedung (mis. `Server Rack 42U`, `Meja Praktik`, `Tiang ODP`).
* **Sinkronisasi Otomatis Field `device.location` (Opsional 1-Klik)**:
  * Menyediakan utilitas `syncDeviceLocationsFromBuildings()` yang dapat mengisi kolom `device.location` kosong secara otomatis dengan nama gedung tempat perangkat berada (atau tombol **"Sinkronkan Nama Ruangan ke Semua Perangkat"** di Kartu Gedung).

---

### Pilar 2 — Kartu Dokumentasi Gedung (Room Documentation Inspector Panel)
**File target:** Modul baru `js/ui/room-doc-panel.js`, integrasi di [js/map/map-3d-engine.js](../js/map/map-3d-engine.js), [js/ui/properties-panel.js](../js/ui/properties-panel.js), [js/app.js](../js/app.js)

Memungkinkan pengguna mengklik gedung mana saja di 3D (termasuk saat gedung terkunci di mode **Simulasi Jaringan**!) untuk membuka **Kartu Dokumentasi Gedung** di panel kanan:

```text
┌──────────────────────────────────────────────────────────┐
│ 🏢 Lab PPLG 2 Lantai   [GDG-PPLG-01]             [✕]     │
│ Zona: Jurusan PPLG / TJKT  •  ● 6 Online  ▲ 1 Warning    │
├──────────────────────────────────────────────────────────┤
│ [🚶 Masuk FPP]  [🎯 Fokus]  [👁 X-Ray/Cutaway]  [✎ Edit] │
├──────────────────────────────────────────────────────────┤
│ RINGKASAN JARINGAN RUANGAN                               │
│ VLAN   : [VLAN 10] [VLAN 20] [VLAN 99]                   │
│ Subnet : 192.168.10.0/24 • 192.168.20.0/24               │
│ WiFi   : SMKN1-PPLG-5G, SMKN1-Guru                       │
│ Kabel  : 84.5 m UTP (6 link) • 42.0 m Fiber (1 uplink)   │
├──────────────────────────────────────────────────────────┤
│ PERANGKAT DI DALAM GEDUNG (7 Unit)  [Sinkron Lokasi]     │
│ • MikroTik RB4011      192.168.10.1   [●] [Fokus] [CLI]  │
│ • Ruijie S2910-24P     192.168.10.2   [●] [Fokus] [CLI]  │
│ • AP Plafon Lt.1       192.168.10.10  [●] [Fokus] [CLI]  │
│ ...                                                      │
├──────────────────────────────────────────────────────────┤
│ UPLINK / BACKBONE ANTAR-GEDUNG (1 Jalur)                 │
│ ⇄ Ruang Server Utama (FO Single Mode • 42.0 m • sfp1)    │
├──────────────────────────────────────────────────────────┤
│ CATATAN TEKNISI & LOG MAINTENANCE                        │
│ [Textarea: ODP-03 tiang belakang, redaman -18.2 dBm...]  │
│ [+ Tambah Log Maintenance]                               │
│ • 15/11/2026 [Fiber] Pak Fikri — Cek redaman ODP-03  [✓] │
└──────────────────────────────────────────────────────────┘
```

* **Pemisahan Jelas antara "Inspeksi Dokumentasi" vs "Edit Posisi Gedung"**:
  * Di mode **Simulasi Jaringan** (`roomsLocked === true`): Mengklik gedung **hanya membuka Kartu Dokumentasi Gedung** dan menyorot tipis garis tepi gedung (tidak menampilkan *drag handle* atau memindahkan gedung).
  * Di mode **Edit Bangunan** (`roomsLocked === false`): Mengklik gedung tetap memungkinkan geser/putar gedung sekaligus membuka kartu dokumentasi + tombol **`✎ Edit Geometri / Skala`**.
* **Tombol Aksi Cepat Gedung**:
  * **`🚶 Masuk ke Ruangan Ini (FPP)`**: Langsung mengaktifkan Mode Teknisi FPP dan memindahkan karakter tepat di depan/dalam pintu masuk gedung terpilih (`teleportAvatarToRoom(roomId)`)! Sangat cepat untuk keliling kampus SMKN 1 Beringin yang luas.
  * **`👁 X-Ray / Cutaway Gedung Ini`**: Jika gedung memiliki pasangan model `_cutaway.glb` (mis. `ruang_bk` ↔ `ruang_bk_cutaway`, `lab_kc` ↔ `lab_kc_cutaway`, `gedung_kelas_4_ruangan` ↔ `_cutaway`), tombol dapat langsung menukar tampilan cutaway *atau* menjadikan dinding gedung itu saja semi-transparan 20%!
  * **`🖨 Cetak Ringkasan Ruangan`**: Mengunduh lembar dokumentasi 1 halaman PDF khusus ruangan tersebut (cocok ditempel di pintu ruang server / rak switch sekolah!).

---

### Pilar 3 — 1-Klik "Mode X-Ray Infrastruktur Gedung" (Global & Per-Gedung)
**File target:** [js/map/map-3d-engine.js](../js/map/map-3d-engine.js), [index.html](../index.html), [css/map.css](../css/map.css)

Menambahkan tombol cepat **`X-Ray Gedung`** (pintasan keyboard **`X`**) di bar 3D dan menu `View`:

1. **Mekanisme Material Snapshot & Restore Lossless**:
   * Sebelum mengubah material mesh gedung (baik kotak prosedural maupun model `.glb` SMKN 1 Beringin), simpan kondisi asli setiap material (`opacity`, `transparent`, `depthWrite`, `color`, `wireframe`) ke `WeakMap` / `userData._origMatState`.
   * Saat **Mode X-Ray Aktif (`buildingXrayMode = true`)**:
     * Seluruh dinding, jendela, dan atap pada `roomsGroup` berubah mulus menjadi *translucent blueprint* (`opacity: 0.18`, `transparent: true`, `depthWrite: false`, warna sedikit kebiruan/hijau transparan) dengan *edge outline* halus agar bentuk gedung tetap terbaca.
     * **Perangkat (`devicesGroup`)** dan **Kabel (`cablesGroup`)** diberi penekanan kontras (*emissive boost* + `renderOrder` lebih tinggi) sehingga seluruh jaringan *backbone* Fiber Optik kuning/oranye & distribusi UTP biru dari Ruang Server ke seluruh gedung kelas terlihat **menyala tembus pandang dari pandangan udara**!
     * **Pintu & Lantai Dasar**: Lantai tetap cukup terlihat (`opacity: 0.35`) sebagai referensi ruang, sementara atap & dinding tembus pandang penuh.
   * Saat **Mode X-Ray Dimatikan**: Seluruh material dikembalikan persis 100% ke snapshot aslinya tanpa perlu memuat ulang file `.glb`!
2. **X-Ray Per-Gedung & Auto-Swap Cutaway**:
   * Mendukung `perRoomXrayIds` (Set ID gedung) sehingga admin bisa membuat hanya *Ruang Server* dan *Lab PPLG* yang transparan sementara gedung lain tetap solid.
   * Integrasi pasangan otomatis `cutawayPairPresetId` pada preset bangunan di [map-3d-models.js](../js/map/map-3d-models.js) (sudah tersedia untuk `ruang_bk`, `gedung_kelas_4_ruangan`, `ruang_perakitan_1`, `lab_kc`, `gedung_kelas_belakang`, `lab_perakitan_2`, dll.).

---

### Pilar 4 — Label Nama Gedung 3D Mengambang (Floating Building Signboards)
**File target:** [js/map/map-3d-engine.js](../js/map/map-3d-engine.js), [js/map/map-3d-models.js](../js/map/map-3d-models.js), [index.html](../index.html)

Menambahkan papan nama 3D modern di atas atap setiap gedung SMKN 1 Beringin:

* **Desain Visual Signboard (High-DPI Canvas Sprite)**:
  * Pill elegan bertema *Botanical Cream / Forest Dark* (sinkron dengan tema aktif aplikasi!) berisi:
    * **Baris 1 (Bold)**: Nama Gedung (mis. `Lab PPLG 2 Lantai`) + kode ruang opsional.
    * **Baris 2 (Chip Ringkas)**: Indikator dot status + jumlah perangkat (`● 7 Unit`) + tag VLAN utama (`VLAN 10, 20`) + ikon warning merah jika ada perangkat *offline/damaged* di dalam gedung tersebut!
  * Garis pin vertikal halus dari atap gedung menuju papan nama agar jelas menunjuk gedung yang mana.
* **Smart Visibility & Anti-Clutter**:
  * Otomatis **tidak ditampilkan** untuk objek dekorasi kecil (`pohon_*`, `tong_sampah`, `keran_air_kecil`, `wastafel_*`, `plank_motivasi`) kecuali pengguna mengaktifkan `doc.showSignboard = true`.
  * **Auto-Hide di Dalam Ruangan (FPP)**: Ketika teknisi masuk ke dalam gedung dalam Mode FPP, papan nama gedung di atas atap otomatis disembunyikan atau diredupkan agar tidak menghalangi pandangan dalam ruangan.
  * **Skala Adaptif Jarak Kamera**: Ukuran papan nama disesuaikan agar tetap terbaca jelas dari sudut pandang udara (*overview kampus*) tanpa saling menutupi (*clamped world scale*).
  * **Toggle Kontrol Lengkap**: Checkbox baru **`Label Nama Gedung 3D`** di dropdown **`View`** ([index.html](../index.html)) serta sinkron dengan tombol `Label` di bar 3D.
* **Interaksi Klik Langsung**:
  * Mengklik papan nama 3D di udara langsung **memfokuskan kamera ke gedung tersebut** dan **membuka Kartu Dokumentasi Gedung** di panel kanan!

---

### Pilar 5 — Pencarian Gedung/Catatan & Ekspor Laporan Dokumentasi Resmi Per-Gedung (PDF / CSV / Snapshot 3D)
**File target:** [js/search/search-engine.js](../js/search/search-engine.js), [js/search/search-ui.js](../js/search/search-ui.js), [js/export/pdf-report-generator.js](../js/export/pdf-report-generator.js), [js/export/csv-exporter.js](../js/export/csv-exporter.js), [js/ui/export-modal.js](../js/ui/export-modal.js)

Menyempurnakan fungsi aplikasi sebagai dokumen resmi infrastruktur jaringan SMKN 1 Beringin:

1. **Upgrade Pencarian Global (`SearchEngine` & `SearchUI`)**:
   * Pencarian di navbar kini mencari tidak hanya Perangkat & IP/VLAN, tetapi juga **Nama Gedung, Kode Ruang, Zona Jurusan, dan Isi Catatan Teknisi / Log Maintenance** (mis. ketik `"ODP-03"`, `"Lab KC"`, atau `"Ruang BK"`).
   * Mengklik hasil gedung langsung berpindah ke peta 3D (jika belum di 3D), mengarahkan kamera ke gedung tersebut, dan membuka **Kartu Dokumentasi Gedung**.
2. **Upgrade Laporan PDF Resmi (`PdfReportGenerator`)**:
   * Menambahkan **Halaman/Bab Baru: "Ringkasan Infrastruktur per Gedung / Ruangan"** (autoTable rapi per gedung: Kode & Nama Gedung, Jumlah Perangkat, Daftar VLAN/SSID, Panjang Kabel Internal & Backbone, Catatan Teknisi, & Log Maintenance Terakhir).
   * Menambahkan opsi di [export-modal.js](../js/ui/export-modal.js): **"Sertakan Snapshot 3D Mode X-Ray Kampus"** (menangkap tangkapan layar WebGL 3D kampus dalam mode X-Ray + label gedung langsung ke halaman PDF!).
   * Menambahkan tombol **"Cetak Kartu Ruangan (1-Halaman PDF)"** dari `RoomDocumentationPanel` untuk dicetak dan ditempel di rak/ruang server tiap gedung.
3. **Upgrade Ekspor CSV / Excel (`CsvExporter`)**:
   * Menambahkan kolom **`Gedung / Ruangan (Auto-Detect)`** pada ekspor CSV perangkat dan kabel.
   * Menambahkan sheet/file ekspor baru **`buildings-documentation.csv`** (rekap seluruh gedung, total perangkat, panjang UTP/FO, PIC, catatan, dan tanggal maintenance terakhir).

---

## 4. Peta Perubahan File & Struktur Modul

```text
network-map-interaktif/
├── docs/
│   └── phase-8-school-digital-twin-docs-plan.md    # Dokumen rencana ini
├── js/
│   ├── core/
│   │   └── state-manager.js                        # [UPDATE] Dukungan metadata opsional room.doc + event room3d:inspect
│   ├── map/
│   │   ├── room-spatial-index.js                   # [NEW] Engine deteksi spasial OBB (perangkat, objek & kabel per gedung) + rekap VLAN/SSID/panjang/backbone
│   │   ├── map-3d-models.js                        # [UPDATE] Metadata pasangan cutawayPairPresetId & isSignboardEligible pada preset gedung, helper sprite signboard 3D
│   │   └── map-3d-engine.js                        # [UPDATE] Mode X-Ray global & per-gedung (lossless snapshot), Building Signboard 3D klik-able, klik gedung saat terkunci (inspect), teleport FPP ke pintu gedung, capture 3D snapshot
│   ├── ui/
│   │   ├── room-doc-panel.js                       # [NEW] Panel kanan "Kartu Dokumentasi Gedung" (inventaris, IP/VLAN/SSID, uplink, catatan teknisi, log maintenance, tombol Masuk FPP & X-Ray)
│   │   ├── properties-panel.js                     # [UPDATE] Koordinasi tampilan panel kanan antara Device, Cable, dan Room Documentation
│   │   ├── room-3d-modal.js                        # [UPDATE] Tambah field kode ruangan, zona, PIC, dan toggle label papan nama gedung
│   │   └── export-modal.js                         # [UPDATE] Tambah opsi ekspor CSV Per-Gedung & Snapshot 3D X-Ray di PDF
│   ├── search/
│   │   ├── search-engine.js                        # [UPDATE] Indeks pencarian gedung, kode ruang, dan catatan maintenance
│   │   └── search-ui.js                            # [UPDATE] Tampilkan hasil kategori Gedung & fokus 3D + buka Kartu Dokumentasi saat diklik
│   ├── export/
│   │   ├── pdf-report-generator.js                 # [UPDATE] Bab Inventaris Per-Gedung, lampiran Snapshot 3D X-Ray & fungsi generateSingleRoomSheet()
│   │   └── csv-exporter.js                         # [UPDATE] Kolom auto-detect gedung + fungsi exportBuildingsCsv()
│   └── app.js                                      # [UPDATE] Wiring RoomDocumentationPanel, tombol X-Ray, toggle Label Gedung di View menu & shortcut keyboard X
├── css/
│   ├── components.css                              # [UPDATE] Style Kartu Dokumentasi Gedung, badge VLAN/SSID, timeline Log Maintenance
│   └── map.css                                     # [UPDATE] Style tombol X-Ray aktif di toolbar 3D & indikator mode X-Ray
└── index.html / sw.js                              # [UPDATE] Tambah tombol X-Ray Gedung di bar 3D, checkbox Label Gedung di dropdown View, rebuild bundle & bump cache-buster
```

---

## 5. Rencana Tahapan Eksekusi (Sub-Fase)

Implementasi dibagi menjadi **5 sub-fase berurutan** agar setiap modul dapat diuji mandiri dan bebas regresi:

| Sub-Fase | Fokus Pekerjaan | Deliverable Utama |
| :--- | :--- | :--- |
| **8A** | **Engine Spasial Per-Gedung & Skema `room.doc`** (`room-spatial-index.js`, `state-manager.js`, `map-3d-models.js`) | Deteksi akurat perangkat, objek & kabel (internal vs uplink/backbone) di dalam OBB gedung terputar, agregasi IP/VLAN/SSID/meter kabel, serta penyimpanan catatan & log maintenance di `room.doc`. |
| **8B** | **Kartu Dokumentasi Gedung & Klik Inspeksi Saat Terkunci** (`room-doc-panel.js`, `map-3d-engine.js`, `properties-panel.js`, `app.js`) | Klik gedung di mode *Simulasi Jaringan* membuka Kartu Dokumentasi Gedung di panel kanan tanpa menggeser gedung; form catatan & log maintenance CRUD tersimpan otomatis; tombol **Masuk FPP** (teleport ke pintu gedung) & **Sinkron Lokasi**. |
| **8C** | **Mode X-Ray Gedung 1-Klik & Cutaway Pairing** (`map-3d-engine.js`, `index.html`, `css/map.css`) | Tombol **`X-Ray Gedung (X)`** global + per-gedung dengan *lossless material snapshot/restore*, penekanan kontras kabel backbone & perangkat saat X-Ray aktif, serta toggle cepat ke varian `_cutaway.glb` bila tersedia. |
| **8D** | **Floating Building Signboard 3D** (`map-3d-models.js`, `map-3d-engine.js`, `index.html`) | Papan nama gedung 3D mengambang (Nama + jumlah unit + status dot + VLAN) di atas atap bangunan utama, bisa diklik untuk buka Kartu Dokumentasi, auto-hide saat FPP di dalam ruangan, dan toggle di menu `View`. |
| **8E** | **Pencarian Gedung & Ekspor Dokumentasi Resmi PDF/CSV** (`search-engine.js`, `search-ui.js`, `pdf-report-generator.js`, `csv-exporter.js`, `export-modal.js`, `sw.js`) | Cari nama gedung/kode/catatan ODP dari navbar, laporan PDF multi-halaman dengan rekap per gedung + Snapshot 3D X-Ray + Cetak 1-Halaman Kartu Ruangan, CSV per gedung, tambah Test 51–54 di `test_object3d.mjs`, bundle ulang & bump cache-buster. |

---

## 6. Strategi Verifikasi & Kriteria Keberhasilan (Definition of Done)

### 6.1 Pengujian Otomatis (`test_object3d.mjs` — Tambahan Test 51–54)
1. **Test 51 — Spatial OBB Detection & Rekap Dokumentasi Gedung**:
   * Verifikasi `RoomSpatialIndex` mendeteksi perangkat di dalam gedung yang diputar (mis. `rotationY = 45°` atau `90°`), tidak salah menangkap perangkat di gedung tetangga, memisahkan kabel internal vs kabel *backbone* antar-gedung, serta mengecualikan properti dekorasi kecil (`pohon_*`, `tong_sampah`).
2. **Test 52 — Room Documentation Schema, Maintenance Log & Locked-Room Inspect**:
   * Verifikasi `room.doc` (`roomCode`, `zone`, `notes`, `maintenanceLogs`) tersimpan dan dipulihkan via `ProjectStorage` & `HistoryManager` (Undo/Redo), serta mengklik gedung saat `roomsLocked === true` memicu inspeksi dokumentasi tanpa menggeser koordinat gedung.
3. **Test 53 — Mode X-Ray Gedung Lossless Toggle & Cutaway Pair**:
   * Verifikasi `setBuildingXrayMode(true)` menurunkan opasitas mesh dinding/atap ke ~0.18 (`depthWrite: false`) sambil menjaga perangkat & kabel tetap solid penuh, dan `setBuildingXrayMode(false)` mengembalikan 100% nilai `opacity`, `transparent`, dan `depthWrite` asli setiap material.
4. **Test 54 — Building Signboard 3D, Search Gedung & Ekspor Per-Gedung**:
   * Verifikasi papan nama 3D hanya muncul untuk bangunan (bukan dekorasi kecil), merespons toggle `showBuildingSignboards` & auto-hide saat FPP indoor, `SearchEngine` menemukan gedung dari nama maupun kata kunci catatan teknisi (`"ODP-03"`), serta `CsvExporter` & `PdfReportGenerator` memproses data rekap per gedung tanpa error.

### 6.2 Verifikasi Visual & Skenario Penggunaan di Browser
1. **Audit Peta Kampus SMKN 1 Beringin dari Udara**:
   * Buka peta 3D kampus penuh → pastikan setiap gedung utama menampilkan **Papan Nama 3D** bersih di atas atap dengan jumlah perangkat yang cocok.
   * Klik tombol **`X-Ray Gedung (X)`** → pastikan seluruh gedung berubah tembus pandang *blueprint* dan kabel *backbone* Fiber Optik & UTP antar-gedung terlihat menyala jelas. Matikan X-Ray → pastikan tekstur asli semua gedung kembali mulus 100%.
2. **Inspeksi Dokumentasi & Masuk Ruangan**:
   * Pastikan mode aktif adalah **Simulasi Jaringan** (gedung terkunci) → klik papan nama atau dinding *Lab PPLG* → pastikan **Kartu Dokumentasi Gedung** terbuka di panel kanan (gedung tidak ikut bergeser).
   * Tambah 1 catatan maintenance baru → cari kata kunci catatan tersebut di kotak pencarian atas → pastikan hasil gedung muncul.
   * Klik tombol **`🚶 Masuk FPP`** pada Kartu Gedung → pastikan teknisi langsung berpindah ke depan pintu gedung tersebut dengan papan nama atap otomatis tersembunyi saat masuk ke dalam.
3. **Uji Ekspor Laporan Resmi**:
   * Buka menu **`Ekspor`** → unduh **Laporan PDF** (dengan Snapshot 3D X-Ray aktif) & **CSV Rekap Gedung** → pastikan tabel inventaris per gedung, total meter kabel, dan catatan teknisi tampil rapi.

---

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| Peta SMKN 1 Beringin memiliki 30+ bangunan; 30+ canvas sprite resolusi tinggi sekaligus bisa memakan VRAM di HP | FPS turun saat kamera overview | Batasi ukuran tekstur sprite signboard ke `512×160 px`, hanya buat ulang tekstur saat data perangkat/nama gedung berubah (*dirty-flag caching*), dan nonaktifkan untuk objek dekorasi non-gedung. |
| Beberapa material `.glb` berbagi instance `MeshStandardMaterial` yang sama antar-mesh | Mengubah transparansi X-Ray pada 1 gedung bisa tidak sengaja memengaruhi gedung lain | Saat X-Ray per-gedung diaktifkan, kloning material hanya untuk gedung yang di-override sementara dan kembalikan referensi material asli saat dinonaktifkan (sambil `dispose()` kloningan sementara agar tidak *memory leak*). |
| Gedung bertingkat 2 lantai (*Lab PPLG 2 Lantai*, *Perhotelan 2 Lantai*) menampung perangkat di Lt. 1 & Lt. 2 pada koordinat X/Y sama | Daftar perangkat di Kartu Gedung bercampur antar lantai | Kelompokkan tampilan daftar perangkat di `RoomDocumentationPanel` berdasarkan `spatial3d.elevationMeters` (`Lantai 1 < 3.2m` vs `Lantai 2 ≥ 3.2m`) secara otomatis jika `room.heightMeters >= 6.0m`. |
| WebGL canvas secara default mengosongkan *drawing buffer* setelah frame dirender | Snapshot 3D X-Ray untuk PDF bisa menghasilkan gambar hitam kosong | Lakukan render eksplisit 1 frame (`this.renderer.render(this.scene, this.camera)`) tepat sebelum memanggil `this.renderer.domElement.toDataURL('image/jpeg', 0.92)` pada fungsi `capture3DSnapshot()`. |
