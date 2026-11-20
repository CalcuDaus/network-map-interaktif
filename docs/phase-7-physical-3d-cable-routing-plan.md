# Rencana Implementasi Tahap 7 (Masalah Utama 2): Instalasi & Kerapian Kabel Fisik 3D ala Roblox di Mode Teknisi
**SmartSchool NetMap — SMK Negeri 1 Beringin**

*Dokumen Perencanaan Teknis — Fokus: Menyelesaikan Masalah Utama 2 (Pengalaman Praktik Tarik Kabel Fisik 3D, Pemasangan Klem Dinding/Plafon, Ducting/Tray, dan Auto-Rapikan 90° di Mode Teknisi FPP/TPP)*  
*Tanggal: 20 November 2026*  
*Status: Planned (Siap Dieksekusi Bertahap)*

---

## 1. Latar Belakang & Rumusan Masalah

Salah satu keunggulan utama SmartSchool NetMap dibanding simulator topologi 2D biasa adalah **Mode Teknisi 3D (FPP/TPP ala Roblox / House Flipper)** yang memungkinkan siswa **SMK Negeri 1 Beringin** berjalan langsung mengelilingi seluruh gedung sekolah, membuka pintu ruangan, dan menata perangkat jaringan fisik secara 1-per-1.

Namun, pada kondisi kode saat ini ([map-3d-engine.js](../js/map/map-3d-engine.js), [cable-manager.js](../js/connections/cable-manager.js), [cable-schema.js](../js/connections/cable-schema.js)), pengalaman **menarik dan merapikan kabel fisik 3D** masih memiliki **5 celah krusial**:

1. **Penarikan Kabel 3D Masih Membuang Ketinggian Z & Permukaan Dinding**: Pada `map-3d-engine.js` (`pending3dWaypoints.push({ x: normX, y: normY })`), saat siswa mengklik di mode 3D *draw-cable*, nilai vertikal `hitPoint.y` (elevasi Z dinding/plafon) dan arah *normal* permukaan tidak disimpan. Pratinjau kabel sementara juga masih memakai elevasi statis (`srcPos.y * 0.4`), sehingga kabel tidak bisa benar-benar merambat naik ke dinding dan menempel di plafon.
2. **Belum Ada Mode "Bawa Gulungan Kabel" di Mode Teknisi (FPP/TPP)**: Saat ini teknisi sudah bisa mengangkat perangkat (`carriedObjects`) dengan viewmodel tangan (`createFppHandsViewmodelGroup`) dan membuka pintu otomatis, tetapi belum bisa **mengambil ujung kabel dari port Router/Switch, berjalan keluar ruangan membawa gulungan kabel live yang terulur dinamis, menempelkan klem sepanjang koridor/dinding, lalu mencolokkan ujungnya ke port tujuan**.
3. **Belum Ada Visual Klem Kabel 3D, Jalur Ducting/Conduit & Snap-to-Surface Saat Edit**: Titik belok (`waypoint`) saat ini hanya berupa bola kuning abstrak ketika kabel dipilih, bukan **Klem Kabel 3D nyata** (U-clip paku dinding / P-clamp / cable tray / PVC ducting). Selain itu, `updateCableHandleDrag()` masih menggeser titik pada bidang datar menghadap kamera (`camDir`), belum menempel otomatis (*surface snap*) ke permukaan dinding, plafon, atau tiang gedung.
4. **Kabel Antar-Perangkat Masih Sering Melayang Diagonal & Saling Tumpuk**: Belum ada fitur 1-klik **"Rapikan Kabel (90° Siku / Tempel Dinding & Plafon)"** maupun **Parallel Cable Bundling Offset** untuk memisahkan 2+ kabel yang lewat jalur koridor yang sama agar tidak saling tembus (*z-fighting*).
5. **Kalkulasi Panjang Kabel Belum Menghitung Segmen Vertikal 3D Nyata & Belum Ada Indikator Kerapian Praktikum**: `CableManager.calculateEstimatedLength()` saat ini hanya menjumlahkan jarak horizontal 2D (`dx, dy`) lalu menambah drop vertikal statis (`1.5m + 1.5m`), belum membaca perubahan elevasi `wp.z` di setiap klem 3D, serta belum memberi *real-time feedback* panjang batas standar IEEE 802.3 (100m UTP) maupun **Skor Kerapian Instalasi** saat siswa berlatih.

---

## 2. Tujuan & Prinsip Desain (Roblox / House-Flipper Cable Pulling Experience)

1. **Tarik Kabel Fisik yang Terasa Nyata & Menyenangkan**: Siswa benar-benar memegang **Gulungan Kabel 3D** di tangan (sesuai warna & kategori: UTP Cat6 biru, Fiber Optic kuning/oranye, dll.), berjalan membuka pintu antar-ruangan SMKN 1 Beringin, memasang klem di dinding/plafon/tiang, hingga mencolokkan konektor RJ45/LC ke port tujuan.
2. **Rapi Tanpa Frustrasi (Presisi + Auto-Tidy)**: Tersedia kunci sumbu 90° (`Shift`), penggeser tinggi klem (`Z- / Z+`), *snap* ke dinding/plafon/lantai, serta tombol 1-klik **Auto-Rapikan 90°** agar instalasi terlihat profesional seperti proyek jaringan sekolah sungguhan.
3. **100% Ramah Desktop & Layar Sentuh HP**: Seluruh aksi tarik kabel, pasang klem, undo klem, dan colok port memiliki tombol aksi besar di `#hud-3d-houseflipper-tip` & klaster sentuh mobile, sinkron dengan rencana Tahap 6 (Mobile-First).
4. **100% Backward-Compatible dengan Proyek Lama & Kanvas 2D**: Semua tambahan properti waypoint (`z`, `surface`, `normal`, `clipType`) dan properti kabel (`conduitType`, `showClips3d`, `bundleLane`) bersifat *opsional/additive*. File proyek dokumentasi SMKN 1 Beringin yang sudah ada tetap termuat mulus di mode 2D maupun 3D.

---

## 3. Ruang Lingkup Solusi (5 Pilar Utama)

### Pilar 1 — Skema Waypoint 3D Penuh & Kalkulasi Panjang Kabel 3D Akurat
**File target:** [js/connections/cable-schema.js](../js/connections/cable-schema.js), [js/connections/cable-manager.js](../js/connections/cable-manager.js), [js/map/map-3d-engine.js](../js/map/map-3d-engine.js)

Memperluas struktur titik belok (`cable.route`) agar menyimpan informasi permukaan 3D nyata sambil mempertahankan kompatibilitas 2D:

* **Format Waypoint 3D (`cable.route[i]`)**:
  ```json
  {
    "x": 0.4521,
    "y": 0.6184,
    "z": 2.65,
    "surface": "wall",
    "normal": { "x": 0, "y": 0, "z": 1 },
    "clipType": "u-clip"
  }
  ```
  * `surface`: `'wall' | 'ceiling' | 'floor' | 'pole' | 'tray' | 'air'` (dideteksi otomatis dari vektor normal *raycast* terhadap mesh gedung/ruangan).
  * `normal`: Vektor normal permukaan satuan (`{ x, y, z }`) agar model **Klem 3D** menempel rata dan menghadap arah dinding/plafon yang benar, serta memberi *clearance* otomatis `±1.5 cm` agar kabel tidak tenggelam ke dalam tembok!
  * `clipType`: `'u-clip'` (klem paku dinding UTP), `'p-clamp'` (klem bulat fiber/tiang), `'cable-tie'` (pengikat tray/rack), atau `'none'`.
* **Perluasan `cable.details` (Opsional / Additive)**:
  * `conduitType`: `'none' | 'pvc-duct' | 'cable-tray'` — opsi membungkus jalur lurus dinding/plafon dengan pipa ducting PVC putih atau *cable tray* besi berlubang.
  * `showClips3d`: `true` (default aktif untuk kabel yang memiliki waypoint permukaan).
  * `bundleLane`: indeks jalur paralel otomatis (0, ±1, ±2) saat beberapa kabel berbagi koridor/dinding yang sama.
  * `neatnessReport`: ringkasan skor kerapian & kepatuhan standar instalasi.
* **Kalkulasi Panjang 3D Nyata di `CableManager.calculateEstimatedLength()`**:
  * Saat titik rute memiliki elevasi `z`, hitung panjang segmen 3D sesungguhnya (`Math.hypot(dxMeters, dyMeters, dzMeters)`) — termasuk jarak naik/turun vertikal (*riser*) dari port perangkat ke klem pertama dan dari klem terakhir ke port tujuan.
  * Jika kabel masih berupa rute 2D lama tanpa `wp.z`, tetap menggunakan rumus fallback lama (`horizontal + verticalDropSource + verticalDropDest`) agar hasil BOM proyek lama tidak berubah tiba-tiba.
  * Memperbarui `insertWaypoint()`, `updateWaypoint()`, dan `addSmartWaypoint()` di `cable-manager.js` agar mempertahankan metadata `z`, `surface`, `normal`, dan `clipType`.
* **Perbaikan Render `pending3dWaypoints` & Tikungan Siku Halus di `syncCables()`**:
  * Menyimpan `hitPoint.y` (elevasi Z), `surface`, dan `normal` saat menggambar kabel di 3D.
  * Pada gaya `orthogonal`, menambahkan **corner fillet (tikungan membulat beradius kecil `4–8 cm`)** alih-alih sudut lancip patah agar memenuhi standar *minimum bend radius* kabel UTP/Fiber Optic secara visual maupun edukatif.

---

### Pilar 2 — Mode "Gulungan Kabel Teknisi" (First-Person Cable Spool Pulling) di Mode Teknisi (FPP/TPP)
**File target:** [js/map/map-3d-models.js](../js/map/map-3d-models.js), [js/map/map-3d-engine.js](../js/map/map-3d-engine.js)

Menghadirkan pengalaman fisik ala Roblox / House Flipper khusus penarikan kabel jaringan saat berada dalam **Mode Teknisi (FPP/TPP)**:

```text
[1] Bidik Perangkat / Port Sumber          [2] Jalan Kaki Membawa Gulungan Kabel Live
    Tekan [C] / klik "Tarik Kabel"  ───▶       • Viewmodel Gulungan Kabel + RJ45 di tangan
    (Pilih Kategori: Cat6 / FO / dll)          • Kabel live terulur dari port/klem terakhir ke tangan
                                               • Pintu ruangan otomatis terbuka saat didekati!
                                                             │
                                                             ▼
[4] Bidik Perangkat / Port Tujuan          [3] Bidik Dinding / Plafon / Tiang / Lantai
    Klik / tekan [E] "Colok Port"   ◀───       • Preview titik hijau + garis jalur 90°/lurus
    → Konektor terpasang & skor muncul!        • Klik kiri / [F] untuk Pasang Klem 3D
                                               • [Shift] Kunci Sumbu 90°/Vertikal
                                               • [Backspace / Z] Lepas Klem Terakhir
                                               • [PgUp / PgDn / Z+ / Z-] Geser Elevasi Klem
```

* **Viewmodel Gulungan Kabel 3D (`createFppCableSpoolViewmodelGroup`)**:
  * Ditampilkan di tangan kanan/kiri FPP (serta di tangan kanan avatar TPP) ketika `activeCablePull` aktif.
  * Terdiri dari **Spool/Gulungan Kabel** dengan warna lilitan dinamis sesuai kategori kabel terpilih (`Cat5e` biru muda, `Cat6` biru tua, `Cat6A` ungu, `Fiber SM` kuning, `Fiber MM` oranye) dan ujung **Konektor RJ45 / LC Duplex** di tangan lainnya.
  * Gulungan berputar perlahan (*spool spin animation*) ketika teknisi berjalan menjauh menarik kabel!
* **Live Dynamic Tether (Kabel Terulur Real-Time)**:
  * Setiap frame saat teknisi berjalan, kabel pratinjau tergambar mulus dari **Port Sumber → seluruh Klem 3D yang sudah dipasang → titik preview di crosshair → ujung gulungan di tangan teknisi**.
  * **Auto-Open Door Saat Tarik Kabel**: Memperluas logika *auto-open door* (yang saat ini aktif saat `carriedObjects.length > 0`) agar juga otomatis membuka pintu saat `activeCablePull` aktif, sehingga teknisi bisa berjalan menarik kabel dari Ruang Server melewati pintu koridor menuju Lab PPLG / Ruang Kelas tanpa terhenti.
* **Smart Surface Raycast & Reticle Indicator**:
  * Crosshair berubah ikon & warna sesuai permukaan yang dibidik:
    * **Hijau (`Dinding / Plafon / Lantai / Tiang`)**: Siap pasang Klem 3D — menampilkan *ghost clip* 3D + garis bantu sudut siku 90° (*alignment guide*) terhadap klem sebelumnya.
    * **Biru Berkedip (`Perangkat / Port Tujuan Valid`)**: Siap colok konektor (`Colok ke Port ether2 (Klik / E)`).
    * **Merah (`Batas Panjang > 100m UTP` atau `Port Penuh`)**: Peringatan instan sebelum siswa mencolokkan kabel.
* **Integrasi Penuh dengan `#hud-3d-houseflipper-tip`**:
  * Saat membidik perangkat di Mode Teknisi (tanpa membawa alat), muncul 2 tombol kontekstual berdampingan:
    * **`Angkat (E)`** (existing)
    * **`Tarik Kabel (C)`** (baru — langsung memulai sesi tarik kabel dari perangkat/port tersebut!)
  * Saat sedang menarik kabel (`activeCablePull !== null`), HUD bawah menampilkan pill lengkap:
    * Badge Live: **`Cat6 • 18.4 m / 100m • 4 Klem`**
    * Tombol: **`[Pasang Klem]`**, **`[Mode: 90° Siku / Bebas]`**, **`[Undo Klem]`**, **`[Ganti Kabel ▾]`**, **`[Batal (Esc)]`** (dan otomatis berganti **`[Colok Port (Klik/E)]`** saat membidik perangkat tujuan).

---

### Pilar 3 — Visual Klem Kabel 3D, Jalur Ducting/Tray & Edit Klem Tempel Dinding
**File target:** [js/map/map-3d-models.js](../js/map/map-3d-models.js), [js/map/map-3d-engine.js](../js/map/map-3d-engine.js), [js/ui/connection-panel.js](../js/ui/connection-panel.js)

Membuat hasil tarikan kabel di lingkungan 3D SMKN 1 Beringin tampak seperti instalasi teknisi profesional:

1. **Model 3D Klem Kabel (`createCableClip3DMesh`)**:
   * **U-Clip Paku Dinding (`u-clip`)**: Badan klip plastik putih/abu berbentuk huruf U yang memeluk diameter kabel + kepala paku baja kecil yang menancap ke dinding sesuai vektor `wp.normal`.
   * **P-Clamp / Klem Tiang (`p-clamp`)**: Cincin klem logam/hitam untuk kabel outdoor/fiber optic pada tiang dan sudut plafon.
   * **Cable Tie (`cable-tie`)**: Pengikat tipis untuk titik kabel di dalam *cable tray* atau rak server.
   * Menggunakan *shared geometry / instanced material caching* agar ratusan klem di satu sekolah tetap ringan di GPU (termasuk HP Android).
2. **Visual Ducting PVC & Cable Tray (`details.conduitType`)**:
   * **`pvc-duct`**: Membungkus segmen lurus antar-klem pada dinding/plafon dengan profil kotak *PVC Trunking* putih (`3.5 × 2.2 cm`) lengkap dengan tutup sambungan siku di sudut belokan.
   * **`cable-tray`**: Merender baki kabel logam (*perforated steel tray* abu metalik lebar `12 cm`) di bawah bundel kabel plafon/koridor, sangat cocok untuk dokumentasi jalur backbone utama SMKN 1 Beringin dari Ruang Server ke gedung kelas.
3. **Upgrade Interaksi Edit Klem 3D (`startCableHandleDrag` / `updateCableHandleDrag`)**:
   * Saat kabel dipilih di kamera bebas maupun Mode Teknisi, klem dapat **diseret langsung menempel di permukaan dinding/plafon** (memakai *raycast* ke `roomsGroup` & `groundGroup` terlebih dahulu, baru *fallback* ke bidang datar jika di ruang kosong).
   * Tahan **`Shift + Drag`** pada klem untuk menggeser ketinggian **Z vertikal murni** (sejajar tembok tanpa bergeser X/Y).
   * Klik ganda pada segmen kabel 3D → langsung menyisipkan klem baru tepat di titik klik dengan *surface snap*.
   * Klik kanan atau tekan **`Delete / Backspace`** saat mengarah ke klem → menghapus klem tersebut tanpa menghapus kabelnya.

---

### Pilar 4 — Auto-Tidy 90° Orthogonal, Snap-to-Wall & Parallel Cable Bundling
**File target:** Modul baru `js/connections/cable-routing-engine.js`, integrasi di [js/connections/cable-manager.js](../js/connections/cable-manager.js), [js/map/map-3d-engine.js](../js/map/map-3d-engine.js), [js/ui/connection-panel.js](../js/ui/connection-panel.js), [js/ui/context-menu.js](../js/ui/context-menu.js)

Agar kabel yang sudah terpasang maupun kabel dokumentasi sekolah lama bisa dirapikan dalam 1 detik:

1. **Engine Perapian Jalur 3D (`js/connections/cable-routing-engine.js`)**:
   * **`autoTidyCableRoute(cable, srcPos, dstPos, options)`** dengan 3 preset kerapian standar instalasi jaringan:
     * **Preset 1 — Jalur Plafon / Overhead Tray (`ceiling-run`, default 2.75 m)**: Dari Port A → keluar lurus searah soket → naik vertikal tegak lurus ke ketinggian plafon/tray → jalan mendatar siku-siku 90° (sumbu X lalu Z) → turun vertikal rapi ke Port B. Otomatis menempatkan klem di setiap tikungan vertikal & horizontal!
     * **Preset 2 — Jalur Dinding / List Bawah (`skirting-run`, 0.25 m)**: Turun rapi ke skirting lantai/dinding → jalan siku-siku 90° sepanjang tepi lantai → naik vertikal ke perangkat tujuan.
     * **Preset 3 — Rapikan Siku Klem Eksisting (`snap-90-existing`)**: Mempertahankan rute umum yang sudah ditarik siswa, namun meluruskan setiap segmen miring menjadi sudut siku 90° sejajar sumbu gedung dan menyamakan elevasi klem yang hampir sejajar (±15 cm disamakan otomatis).
   * **Surface Wall-Snapping Helper**: Saat `map3DEngine` tersedia, menggeser titik segmen horizontal ke dinding terdekat dalam radius `0.8 m` (*raycast* horizontal ±X / ±Z) sehingga kabel benar-benar menempel ke dinding kelas/koridor, tidak melayang di tengah ruangan!
2. **Parallel Cable Bundling (Anti-Tumpuk Multi-Kabel)**:
   * Saat beberapa kabel keluar dari Switch 24-port yang sama atau berjalan di koridor plafon yang sama (jarak segmen `< 6 cm`), engine secara otomatis menghitung **`bundleOffset`** paralel tipis (`±1.8 cm` per kabel) sehingga 8–24 kabel terlihat tersusun sejajar seperti sisir (*cable comb*) yang sangat rapi dan memuaskan dilihat!
3. **Aksi 1-Klik di UI**:
   * Tombol **"✨ Rapikan Kabel (90°)"** + pemilih preset (`Plafon 2.75m`, `Skirting Lantai`, `Siku 90°`) + pemilih **`Ducting / Tray`** di `ConnectionPanel` ([connection-panel.js](../js/ui/connection-panel.js)) dan `ContextMenu` ([context-menu.js](../js/ui/context-menu.js)).
   * Tombol batch **"Rapikan Semua Kabel Terpilih / Semua Kabel"** di dropdown menu 3D agar guru/admin bisa merapikan seluruh dokumentasi kabel SMKN 1 Beringin sekaligus.

---

### Pilar 5 — Validasi Kualitas Instalasi (Skor Praktikum SMK) & UX Sentuh HP
**File target:** `js/connections/cable-routing-engine.js`, [js/map/map-3d-engine.js](../js/map/map-3d-engine.js), [js/ui/connection-panel.js](../js/ui/connection-panel.js), [css/map.css](../css/map.css)

Mengubah aktivitas merapikan kabel menjadi pengalaman belajar berstandar industri (TIA/EIA-568 & IEEE 802.3) yang sekaligus menyenangkan seperti game:

1. **Live HUD Meteran Kabel & Peringatan Standar (Saat Menarik Kabel)**:
   * Menampilkan panjang kabel *real-time* dalam meter:
     * **Hijau (`≤ 85 m` UTP)**: Aman standar TIA/EIA-568.
     * **Kuning (`85–100 m` UTP)**: Mendekati batas maksimum 100 m — sarankan pindah jalur lebih efisien atau ganti Fiber Optic.
     * **Merah (`> 100 m` UTP)**: Melebihi batas IEEE 802.3! Tampilkan saran 1-klik *"Ganti ke Fiber Optic (SM/MM)"*.
2. **Skor Kerapian Instalasi Fisik (`evaluateCableNeatness`) — 0 s.d. 100 Poin**:
   * Dihitung otomatis berdasarkan 5 kriteria objektif praktikum TKJ/TJKT:
     1. **Kepatuhan Standar Panjang Media (25 poin)**: Tidak melebihi batas panjang kategori (UTP ≤ 100m, Fiber sesuai tipe).
     2. **Penempelan Permukaan / Tidak Melayang (25 poin)**: Proporsi klem yang menempel ke dinding/plafon/lantai/tray (bukan `air`).
     3. **Jarak Klem Teratur (20 poin)**: Jarak antar klem ideal (`≤ 2.5 m` untuk rute panjang) sehingga kabel tidak menjuntai semrawut.
     4. **Kesikuan & Kerapian Sudut (15 poin)**: Jalur mengikuti siku 90° / kurva rapi tanpa tekukan ekstrem `< 45°` (*bend radius*).
     5. **Kelengkapan Dokumentasi Port & Label (15 poin)**: Port sumber & tujuan terpasang spesifik (bukan kosong/auto) serta nama jalur/label terisi.
   * Ditampilkan sebagai **Badge Skor + Checklist Saran Perbaikan** saat siswa selesai mencolokkan kabel (toast meriah ala game) dan di kartu `ConnectionPanel` sebelah kanan.
3. **Kontrol Sentuh Khusus HP Android Saat Tarik Kabel**:
   * Saat `activeCablePull` aktif di layar sentuh HP (`isMobileTouchDevice()`):
     * Di sisi kanan (di atas area pandang sentuh), muncul 3 tombol besar ramah jempol (`>= 48×48 px`): **`📌 Klem`** (pasang klem di titik bidik crosshair), **`↩ Undo`** (lepas klem terakhir), dan **`🔌 Colok`** (aktif otomatis saat membidik perangkat tujuan).
     * Siswa cukup jalan pakai *virtual joystick* kiri, arahkan kamera ke dinding dengan geser layar kanan, lalu ketuk **`📌 Klem`** secara berurutan sampai ke perangkat tujuan!

---

## 4. Peta Perubahan File & Struktur Modul

```text
network-map-interaktif/
├── docs/
│   └── phase-7-physical-3d-cable-routing-plan.md   # Dokumen rencana ini
├── js/
│   ├── connections/
│   │   ├── cable-schema.js                         # [UPDATE] Tambah validasi field opsional waypoint (surface, normal, clipType) & details (conduitType, showClips3d, bundleLane)
│   │   ├── cable-manager.js                        # [UPDATE] Kalkulasi panjang 3D sejati (termasuk riser wp.z), pertahankan metadata klem di insert/updateWaypoint, metode applyAutoTidy()
│   │   └── cable-routing-engine.js                 # [NEW] Algoritma Auto-Tidy 90° (plafon/skirting/siku), parallel bundling offset, corner fillet, dan evaluator Skor Kerapian Instalasi
│   ├── map/
│   │   ├── map-3d-models.js                        # [UPDATE] Tambah createFppCableSpoolViewmodelGroup(), createCableClip3DMesh() (u-clip/p-clamp/cable-tie), createConduitSegmentMesh() (PVC/tray)
│   │   └── map-3d-engine.js                        # [UPDATE] State activeCablePull (FPP/TPP), live tether & ghost clip, auto-open pintu saat tarik kabel, surface-snap drag klem, render klem & conduit 3D, tombol sentuh HP
│   └── ui/
│       ├── connection-panel.js                     # [UPDATE] Bagian "Kerapian & Jalur Fisik 3D": tombol Auto-Rapikan 90°, pilih Ducting/Tray, toggle Klem 3D, kartu Skor Kerapian & daftar klem
│       └── context-menu.js                         # [UPDATE] Tambah aksi klik-kanan "Rapikan Kabel (90° Plafon)" & "Hapus Klem Ini"
├── css/
│   ├── map.css                                     # [UPDATE] Style HUD tarik kabel (#hud-3d-houseflipper-tip.is-pulling-cable), badge meteran panjang live, tombol sentuh HP (Klem/Undo/Colok)
│   └── components.css                              # [UPDATE] Style kartu Skor Kerapian Instalasi & daftar waypoint klem di ConnectionPanel
└── index.html / sw.js                              # [UPDATE] Rebuild bundle & bump cache-buster setelah implementasi selesai
```

---

## 5. Rencana Tahapan Eksekusi (Sub-Fase)

Agar setiap tahap terisolasi dengan baik, mudah diverifikasi, dan tidak merusak fitur yang sudah stabil (42+ automated tests), implementasi dibagi ke dalam **5 sub-fase berurutan**:

| Sub-Fase | Fokus Pekerjaan | Deliverable Utama |
| :--- | :--- | :--- |
| **7A** | **Skema Waypoint 3D, Panjang 3D & Render Klem/Conduit** (`cable-schema.js`, `cable-manager.js`, `map-3d-models.js`, `map-3d-engine.js`) | Penyimpanan penuh `{ x, y, z, surface, normal, clipType }`, kalkulasi panjang 3D akurat termasuk riser vertikal, tikungan siku ber-fillet, serta render model 3D Klem Kabel, PVC Duct & Cable Tray. |
| **7B** | **Mode "Gulungan Kabel Teknisi" di FPP/TPP** (`map-3d-models.js`, `map-3d-engine.js`) | Viewmodel gulungan kabel 3D berputar di tangan FPP/TPP, tombol `Tarik Kabel (C)`, kabel live terulur dari port ke tangan, pemasangan klem di dinding/plafon/tiang dengan *ghost preview* + kunci 90° (`Shift`), *auto-open* pintu saat bawa kabel, serta colok langsung ke port tujuan. |
| **7C** | **Edit Klem 3D Tempel Permukaan & Kontrol Sentuh HP** (`map-3d-engine.js`, `css/map.css`) | Upgrade `updateCableHandleDrag()` agar menempel otomatis ke dinding/plafon/tiang, `Shift+Drag` vertikal murni, double-click sisip klem, Delete hapus klem, serta 3 tombol sentuh HP (`📌 Klem`, `↩ Undo`, `🔌 Colok`). |
| **7D** | **Auto-Tidy 90°, Wall-Snap & Parallel Bundling** (`cable-routing-engine.js`, `cable-manager.js`, `connection-panel.js`, `context-menu.js`) | Modul `cable-routing-engine.js` dengan 3 preset rapi (Plafon 2.75m, Skirting Lantai, Siku 90°), snap ke dinding terdekat, jarak paralel otomatis untuk kabel sekoridor, dan tombol 1-klik di `ConnectionPanel` & menu klik-kanan. |
| **7E** | **Skor Kerapian Praktikum SMK, Integrasi Akhir & Verifikasi** (`cable-routing-engine.js`, `connection-panel.js`, `map-3d-engine.js`, `index.html`, `sw.js`) | Meteran live batas 100m IEEE + saran ganti Fiber, kartu Skor Kerapian (0–100 poin + checklist saran), tambah Test 47–50 di `test_object3d.mjs`, verifikasi visual di browser, build bundle ulang & bump cache-buster. |

---

## 6. Strategi Verifikasi & Kriteria Keberhasilan (Definition of Done)

### 6.1 Pengujian Otomatis (`test_object3d.mjs` — Tambahan Test 47–50)
1. **Test 47 — Validasi Waypoint 3D Penuh & Kalkulasi Panjang 3D Riser**:
   * Verifikasi `CableSchema.validate()` menerima waypoint `{ x, y, z, surface, normal, clipType }` dan `details.conduitType`, serta tetap menerima kabel 2D lama `{ x, y }` tanpa error.
   * Verifikasi `CableManager.calculateEstimatedLength()` menghitung kenaikan elevasi vertikal `z` secara akurat (mis. kabel dengan 2 klem naik `2.5 m` ke plafon memiliki panjang 3D lebih panjang tepat sesuai penjumlahan Euclidean 3D).
2. **Test 48 — Auto-Tidy 90° Orthogonal, Parallel Bundling & Skor Kerapian**:
   * Verifikasi `autoTidyCableRoute()` menghasilkan titik siku 90° di elevasi plafon/skirting yang valid, tidak keluar batas kanvas `[0.01, 0.99]`, dan memberi `bundleLane` berbeda bagi 2+ kabel pada koridor identik.
   * Verifikasi `evaluateCableNeatness()` memberi skor tinggi (`>= 85`) pada kabel rapi ber-klem dinding ≤ 100m, dan memberi peringatan + pengurangan skor pada kabel UTP > 100m atau kabel melayang tanpa klem.
3. **Test 49 — FPP/TPP Cable Spool Pulling Lifecycle**:
   * Verifikasi pemanggilan `startAvatarCablePull(devId, portName)` mengaktifkan viewmodel gulungan kabel, menambahkan klem 3D via `placeAvatarCableClip()`, mendukung `undoAvatarCableClip()`, membuka pintu otomatis saat teknisi berjalan membawa kabel, dan `finishAvatarCablePull(destDevId, destPort)` membuat koneksi tersimpan lengkap dengan seluruh klem 3D-nya.
4. **Test 50 — Render Klem 3D, Ducting PVC & Surface-Snap Drag**:
   * Verifikasi `syncCables()` merender mesh klem 3D berorientasi `wp.normal`, merender ducting/tray ketika `conduitType !== 'none'`, dan `updateCableHandleDrag()` memperbarui `wp.z`, `wp.surface`, dan `wp.normal` saat klem digeser.

### 6.2 Verifikasi Visual & Skenario Praktik di Browser (Desktop & Viewport HP)
1. **Skenario Tarik Kabel Antar-Ruangan (Mode Teknisi FPP)**:
   * Masuk Mode Teknisi FPP di dalam Ruang Server SMKN 1 Beringin → bidik MikroTik RB1100 → tekan **`C` / Tarik Kabel (Cat6)**.
   * Pastikan gulungan kabel biru muncul di tangan kanan dan kabel live terulur dari port.
   * Pasang klem naik lurus ke dinding (`Shift`), belok menyusuri plafon, berjalan keluar melewati pintu ruangan (pintu otomatis terbuka), lanjut pasang klem di koridor, lalu colokkan ke Switch di ruang sebelah.
   * Pastikan toast **Skor Kerapian** muncul, seluruh klem 3D menempel rata di dinding/plafon tanpa tembus tembok, dan panjang meter tercatat akurat.
2. **Skenario Auto-Rapikan & Ducting**:
   * Pilih kabel lama yang masih lurus diagonal → klik **`✨ Rapikan Kabel (Plafon 2.75m)`** → ubah Ducting ke **`PVC Duct`** → pastikan kabel langsung naik tegak lurus, siku 90° rapi di plafon dengan pipa putih, dan jika ada 3 kabel sejajar tidak saling menumpuk.
3. **Skenario HP Touch (`360 × 800` & `800 × 360`)**:
   * Masuk Mode Teknisi di viewport HP → ketuk perangkat → ketuk **`Tarik Kabel`** → jalan dengan joystick kiri sambil mengetuk **`📌 Klem`**, **`↩ Undo`**, dan **`🔌 Colok`** tanpa error atau elemen tumpang tindih.

---

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| Sekolah punya puluhan kabel dengan ratusan klem 3D + ducting sekaligus | FPS turun di HP Android entry-level | Gunakan *geometry & material pooling/caching* bersama untuk mesh klem & ducting; pada preset **Hemat Grafis HP** (Tahap 6), tampilkan klem hanya pada jarak dekat (`LOD` / kabel terpilih) atau kurangi segmen tabung kabel (`tubularSegments`). |
| Mesh `.glb` bangunan tertentu memiliki *face normal* terbalik atau dinding sangat tipis | Klem menempel menghadap ke dalam tembok atau kabel tenggelam di balik dinding | Normalisasi arah *world normal* agar selalu menghadap ke sisi kamera/raycast (`if (normal.dot(rayDir) > 0) normal.negate()`), lalu beri *offset clearance* `0.018 m` searah normal. |
| Konflik tombol `Klik Kiri / E` antara buka pintu, angkat perangkat, dan pasang klem saat tarik kabel | Siswa tidak sengaja mengangkat switch saat mau mencolok kabel | Beri prioritas state tegas: saat `activeCablePull` aktif, `Klik / E` pada perangkat/port = **Colok Kabel**, `Klik` pada dinding/plafon = **Pasang Klem**, pintu terbuka **otomatis** saat didekati, dan angkat perangkat dinonaktifkan sementara sampai kabel selesai/dibatalkan (`Esc`). |
| File proyek dokumentasi SMKN 1 Beringin lama belum punya `wp.z` atau `normal` | Kabel lama bisa melompat ketinggiannya | Pertahankan perilaku fallback 100%: kabel tanpa `wp.z` tetap memakai `trayY` dan rumus panjang lama, serta baru berubah menjadi jalur 3D ber-klem jika pengguna secara eksplisit menarik ulang atau menekan tombol **Auto-Rapikan**. |
