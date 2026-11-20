# Rencana Implementasi Tahap 9 (Masalah Utama 4): Penyederhanaan UI/UX 3D, Sandbox Praktik Aman & Jobsheet Terpandu SMK
**SmartSchool NetMap — SMK Negeri 1 Beringin**

*Dokumen Perencanaan Teknis — Fokus: Menyelesaikan Masalah Utama 4 (Penyederhanaan Sub-Toolbar 3D Kontekstual, Pemisahan Master Dokumentasi Sekolah vs Sandbox Praktik Siswa, Sistem Jobsheet Praktikum Auto-Graded, serta Onboarding Ramah Pemula)*  
*Tanggal: 20 November 2026*  
*Status: Planned (Siap Dieksekusi Bertahap)*

---

## 1. Latar Belakang & Rumusan Masalah

Setelah kemampuan simulator mobile (Tahap 6), tarik kabel fisik 3D ber-klem (Tahap 7), dan dokumentasi Digital Twin SMKN 1 Beringin (Tahap 8) terintegrasi, aplikasi akan menjadi sangat kaya fitur. Namun, **aplikasi yang sangat kaya fitur bisa justru membingungkan siswa SMK baru atau berisiko mengacaukan data sekolah** jika arsitektur UI/UX dan alur belajarnya tidak ditata dengan tegas.

Berdasarkan audit kode saat ini ([index.html](../index.html), [workspace-controller.js](../js/core/workspace-controller.js), [project-storage.js](../js/storage/project-storage.js), [auth-manager.js](../js/storage/auth-manager.js)), terdapat **4 tantangan utama UI/UX & alur pembelajaran**:

1. **Sub-Toolbar 3D (`#hud-3d-controls`) Terlalu Padat (~23 Kontrol Sekaligus)**: Saat masuk ke mode 3D, pengguna langsung disuguhi deretan panjang tombol (`Orbit, Pan, Zoom, Look, Move, Rotate, Pilih Box, Extents, Iso, Atas, Depan, Samping, Fokus, Auto-Fokus, Skala, Kabel, Regangkan, Label, Mode Teknisi, Mode FPP, Model 3D Device, Simulasi & CLI...`). Di layar laptop 1366×768 maupun HP, bar ini membungkus menjadi 2–3 baris yang menutupi viewport dan membuat siswa bingung tombol mana yang harus diklik dulu.
2. **Belum Ada Pemisahan Pengalaman yang Tegas antara "Peta Master Sekolah" vs "Ruang Praktik Siswa (Sandbox)"**: Meskipun `AuthManager` sudah memiliki mekanisme *Server Utama (`main`)* vs *Akun Pribadi (`personal`)*, belum ada **Banner Perlindungan Master** dan aksi 1-klik **"Salin ke Sandbox Praktik"** yang memungkinkan siswa langsung berlatih merakit jaringan di dalam gedung SMKN 1 Beringin tanpa pernah berisiko merusak dokumentasi asli sekolah.
3. **Siswa Pemula Bingung Harus Mulai Praktik Dari Mana (Belum Ada Jobsheet Terpandu)**: Ketika membuka kanvas kosong atau peta sekolah lengkap, siswa kelas X/XI belum memiliki panduan tugas bertahap seperti *Cisco Packet Tracer Activity (`.pka`)* yang memeriksa pekerjaan mereka secara otomatis dan memberi nilai + petunjuk perbaikan.
4. **Belum Ada Pintu Masuk (*Quick-Start*) Berbasis Peran & Fitur Pembuatan Tugas oleh Guru**: Guru/Teknisi membutuhkan akses cepat ke dokumentasi & *Edit Bangunan*, sedangkan siswa membutuhkan akses cepat ke *Jobsheet Praktikum* serta kemampuan mengimpor tugas `.json` yang dibagikan guru lewat grup kelas.

---

## 2. Tujuan & Prinsip Desain (Clarity-First Educational UX)

1. **Progressive Disclosure (Sederhana di Depan, Lengkap di Dalam)**: Bar 3D utama hanya menampilkan **7–8 aksi inti** yang paling sering dipakai; alat kamera sekunder dan penyetelan tampilan dirapikan ke dalam 2 popover dropdown (`Kamera ▾` dan `Tampilan 3D ▾`) tanpa menghilangkan 1 pun fitur lama.
2. **Zero-Risk Master Protection**: Dokumentasi jaringan asli SMKN 1 Beringin selalu terlindungi dari edit tidak sengaja oleh siswa, namun siswa tetap bisa memakai seluruh gedung 3D sekolah sebagai arena praktik melalui **Sandbox Salinan Instan**.
3. **Belajar Aktif dengan Umpan Balik Otomatis (Packet Tracer `.pka` Style)**: Setiap praktikum memiliki **Checklist Target Live**, tombol **Hint Bertahap**, **Skor Otomatis (0–100)**, serta **Bukti Laporan Praktikum PDF** siap kumpul ke guru.
4. **Zero Breaking Changes**: Seluruh ID DOM tombol 3D lama (`#btn-3d-iso`, `#btn-3d-top`, `#select-3d-scale`, dll.) tetap dipertahankan di dalam struktur popover baru agar semua *event listener* lama dan seluruh automated tests tetap lulus 100%.

---

## 3. Ruang Lingkup Solusi (5 Pilar Utama)

### Pilar 1 — Penyederhanaan Sub-Toolbar 3D Kontekstual (Compact 3D HUD)
**File target:** [index.html](../index.html), [css/map.css](../css/map.css), [js/core/workspace-controller.js](../js/core/workspace-controller.js), [js/app.js](../js/app.js)

Merampingkan `#hud-3d-controls` dari ~23 kontrol datar menjadi **1 baris ramping & bersih** dengan pengelompokan logis berbasis tugas:

```text
Mode Simulasi Jaringan (Bar Utama — 1 Baris Bersih):
┌──────────────────────────────────────────────────────────────────────────────┐
│ [⌃] [Orbit][Move][Rotate][Tarik Kabel] │ [Mode Teknisi (FPP/TPP)] [X-Ray]   │
│     │ [Kamera ▾] [Tampilan 3D ▾] │ [📋 Jobsheet] [⚡ Simulasi & CLI]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

* **Isi Popover `Kamera ▾`** (semua ID lama dipertahankan):
  * Alat Navigasi Tambahan: `Pan (H)`, `Zoom (Z)`, `Look Around (L)`, `Pilih Box (B)`.
  * Sudut Pandang Preset: `Extents`, `Iso`, `Atas`, `Depan`, `Samping`, `Fokus Perangkat`, toggle `Auto-Fokus`.
* **Isi Popover `Tampilan 3D ▾`** (semua ID lama dipertahankan):
  * `Skala Perangkat` (`#select-3d-scale`), `Ukuran Kabel` (`#select-3d-cable-size`), `Regangkan Tumpukan` (`#btn-3d-explode`).
  * Toggle `Label Perangkat` (`#btn-3d-labels`), `Label Gedung 3D`, `Klem & Ducting 3D`, `Model 3D Device` (`#btn-3d-device-models`), serta `Kualitas Grafis HP`.
* **Gabungan Smart Toggle `Mode Teknisi`**:
  * Menggabungkan tombol `Mode Teknisi` + pilihan kamera `TPP / FPP` secara kontekstual (tombol `TPP / FPP` muncul langsung di pill saat Mode Teknisi aktif, tidak memakan tempat saat sedang di kamera bebas).
* **Adaptif Mode `Edit Bangunan`**:
  * Saat berpindah ke `Edit Bangunan`, bar otomatis hanya menonjolkan alat bangunan (`Orbit`, `Move`, `Rotate`, `Buat 3D`, `Jalan 3D`, `Ruangan 3D`, `Kunci Ruangan`, `Kamera ▾`, `Tampilan 3D ▾`) sehingga bersih dari tombol simulator.

---

### Pilar 2 — Pemisahan Tegas "Peta Master Sekolah" vs "Sandbox Praktik Siswa"
**File target:** [js/storage/project-storage.js](../js/storage/project-storage.js), [js/core/state-manager.js](../js/core/state-manager.js), [js/ui/project-modal.js](../js/ui/project-modal.js), [index.html](../index.html), [css/layout.css](../css/layout.css)

Menghilangkan rasa takut "merusak peta dokumentasi sekolah" saat siswa membuka aplikasi:

1. **Status Session Mode Eksplisit (`state.sessionMode`)**:
   * **`master-readonly`**: Membuka Peta Master Dokumentasi SMKN 1 Beringin (Server Utama) dalam mode baca/inspeksi — pengguna bebas keliling FPP, membuka pintu, klik gedung untuk membaca Kartu Dokumentasi, mengaktifkan X-Ray, dan mengetes Ping, **namun perubahan tidak dapat menimpa data Master**.
   * **`master-admin`**: Khusus akun Guru/Teknisi dengan hak tulis ke Server Utama untuk memperbarui dokumentasi resmi SMKN 1 Beringin.
   * **`student-sandbox`**: Salinan praktik terisolasi di penyimpanan lokal (`IndexedDB` / `localStorage` key `sandbox_<id>`) di mana siswa bebas memasang/menghapus perangkat, menarik kabel 3D, dan mengonfigurasi MikroTik/Cisco sepuasnya.
2. **Master Guard Banner & 1-Klik "Fork ke Sandbox Praktik"**:
   * Saat berada di `master-readonly`, tampilkan banner tipis non-intrusif di bawah navbar:
     * `🔒 Peta Master SMKN 1 Beringin (Mode Baca)` + tombol **`🧪 Praktik di Salinan Sandbox`** + **`📋 Buka Jobsheet`**.
   * Saat siswa klik **`🧪 Praktik di Salinan Sandbox`**, muncul dialog cepat 2 pilihan:
     * **Salin Gedung + Perangkat Sekolah** (cocok untuk latihan *troubleshooting* & ekspansi jaringan).
     * **Salin Gedung Sekolah Saja (Kosongkan Perangkat)** (cocok untuk latihan merakit jaringan SMKN 1 Beringin dari nol!).
   * Saat berada di `student-sandbox`, banner berganti warna ramah:
     * `🧪 Mode Sandbox Praktik (Aman — Master Sekolah Terlindungi)` + tombol **`↺ Reset Sandbox`** & **`🏫 Kembali ke Peta Master`**.

---

### Pilar 3 — Engine Jobsheet Praktikum Otomatis Berbasis Gedung SMKN 1 Beringin
**File target:** Modul baru `js/learning/jobsheet-catalog.js`, `js/learning/jobsheet-engine.js`, `js/ui/jobsheet-panel.js`

Menghadirkan pengalaman praktikum terpandu ala *Cisco Packet Tracer Activity (`.pka`)* yang memanfaatkan langsung 3D gedung SMKN 1 Beringin, engine simulasi Tahap 6, kerapian kabel Tahap 7, dan deteksi ruangan Tahap 8:

* **Struktur Data Jobsheet Standar (`JobsheetSchema`)**:
  ```json
  {
    "id": "js-01-lab-pplg-basic",
    "title": "Jobsheet 1: Instalasi LAN & Pengkabelan Rapi Lab PPLG",
    "level": "Dasar (Kelas X TJKT)",
    "estimatedMinutes": 20,
    "targetRoomPreset": "lab_pplg",
    "setupMode": "clear-target-room",
    "starterDevices": [],
    "tasks": [
      {
        "id": "t1",
        "label": "Pasang 1 Router & 1 Switch di dalam Gedung Lab PPLG",
        "weight": 20,
        "hint": "Buka Library Perangkat (kiri), pilih MikroTik/Router lalu taruh di dalam Lab PPLG.",
        "evaluator": { "type": "devices-in-room", "roomMatch": "pplg", "requires": ["router", "switch"] }
      },
      {
        "id": "t2",
        "label": "Hubungkan Router ke Switch & 2 PC dengan kabel UTP rapi (Skor Kerapian >= 75)",
        "weight": 25,
        "hint": "Gunakan Mode Teknisi -> Tarik Kabel (C) atau tombol Auto-Rapikan 90° di Properti Kabel.",
        "evaluator": { "type": "neat-cables-count", "minCount": 3, "minNeatness": 75 }
      },
      {
        "id": "t3",
        "label": "Konfigurasi IP Router (192.168.10.1/24) & IP PC satu subnet",
        "weight": 25,
        "hint": "Klik perangkat -> buka Simulasi & CLI -> tab Quick Config (WinBox) atau ketik /ip address add.",
        "evaluator": { "type": "subnet-configured", "cidr": "192.168.10.0/24", "minHosts": 3 }
      },
      {
        "id": "t4",
        "label": "Uji konektivitas Ping berhasil dari PC ke Router",
        "weight": 30,
        "hint": "Buka tab Ping & PDU 3D lalu kirim paket Ping dari PC ke Router hingga status BERHASIL.",
        "evaluator": { "type": "ping-success", "fromCategory": "end", "toCategory": "core" }
      }
    ]
  }
  ```
* **5 Paket Jobsheet Bawaan Kurikulum SMK TKJ/TJKT**:
  1. **Jobsheet 1 (Dasar) — Instalasi Fisik & LAN Dasar di Lab PPLG**: Pasang perangkat fisik, tarik kabel UTP rapi ber-klem 3D, atur IPv4 `/24`, dan verifikasi Ping.
  2. **Jobsheet 2 (Menengah) — VLAN & Trunking Ruang Server → Lab KC**: Atur VLAN 10 (Siswa) & VLAN 20 (Guru), konfigurasi port `trunk` pada switch penghubung, serta verifikasi isolasi & routing antar-VLAN.
  3. **Jobsheet 3 (Menengah) — DHCP Server & NAT Internet MikroTik (Ruang BK / TU)**: Aktifkan DHCP Pool pada interface LAN router, aktifkan *NAT Masquerade* ke WAN/ISP, lalu tes client memperoleh IP otomatis & Ping `8.8.8.8`.
  4. **Jobsheet 4 (Menengah) — Backbone Fiber Optic & Access Point Plafon (Ruang Server → Lab Perakitan 1)**: Tarik kabel Fiber Optic Single Mode dengan ducting/tray rapi, pasang AP di plafon (`elevasi ≥ 2.5m`), atur SSID, dan koneksikan klien nirkabel.
  5. **Jobsheet 5 (Lanjutan / UKK) — Detektif Troubleshooting Jaringan SMKN 1 Beringin**: Sistem otomatis menyuntikkan 3 kesalahan nyata (kabel `damaged`, kesalahan subnet/gateway, dan VLAN mismatch) ke salinan topologi; siswa mencari penyebabnya memakai Mode Teknisi + Inspektor Port + CLI/WinBox hingga seluruh jaringan kembali hijau 100%!
* **Floating Live Checklist HUD & Auto-Grader**:
  * Panel ringkas mengambang (`#hud-jobsheet-tracker`) yang bisa di-minimize menjadi pill progres (`📋 JS-1: 3/4 • 70%`) — sangat bersahabat di layar HP maupun desktop.
  * Setiap kali terjadi event `device:*`, `connection:*`, `simulation:ping-completed`, atau `cli:executed`, `JobsheetEngine.evaluateAll()` berjalan cepat (< 5ms) dan memicu animasi centang hijau **`[✓]`** + progress bar naik secara *real-time*!
  * Tersedia tombol **`🎯 Lompat ke Gedung Tugas`** (otomatis menerbangkan kamera/FPP ke gedung target jobsheet), **`💡 Petunjuk`**, dan **`↺ Ulangi Jobsheet`**.

---

### Pilar 4 — Bukti Penilaian Praktikum (Student Submission Report) & Mode Pembuat Jobsheet Guru
**File target:** `js/learning/jobsheet-engine.js`, `js/ui/jobsheet-panel.js`, [js/export/pdf-report-generator.js](../js/export/pdf-report-generator.js)

Membuat hasil praktik siswa bisa langsung dinilai oleh guru tanpa memerlukan server LMS tambahan:

1. **Form Identitas & Cetak Sertifikat/Bukti Praktikum (PDF & File `.netmap-submit.json`)**:
   * Saat skor jobsheet mencapai batas tuntas (atau kapan saja siswa ingin mengumpulkan), siswa mengisi **Nama Lengkap, Kelas (mis. XI TJKT 1), dan Nomor Absen**.
   * **Ekspor Bukti Praktikum PDF (1 Halaman Resmi)**: Memuat Kop *SMK Negeri 1 Beringin — Laporan Praktikum Jaringan*, Nama/Kelas Siswa, Judul Jobsheet, **Skor Akhir (0–100)**, Durasi Pengerjaan, Tabel Checklist Lulus/Belum, Daftar Konfigurasi IP/VLAN & Skor Kerapian Kabel yang dikerjakan, serta **Hash Verifikasi Sederhana (Checksum)** untuk memastikan laporan asli dari simulator.
   * **Ekspor File Proyek Jawaban (`.json`)**: Agar guru bisa membuka ulang hasil rakitan 3D siswa di komputernya jika ingin memeriksa kerapian kabel 3D secara langsung.
2. **Pembuat & Pengimpor Jobsheet Kustom untuk Guru (`Jobsheet Authoring Lite`)**:
   * Di dalam modal `📋 Jobsheet Praktikum`, sediakan tab **`Impor / Buat Jobsheet Guru`**:
     * Guru dapat membuat lembar tugas baru lewat form sederhana (Judul, Gedung Target SMKN 1 Beringin, pilih syarat checklist dari template evaluator yang tersedia) lalu klik **`Ekspor File Tugas (.json)`**.
     * File ringan (< 10 KB) tersebut dapat dikirim ke grup WhatsApp kelas; siswa cukup membuka aplikasi di HP → klik **`Impor Tugas Guru`** → langsung masuk ke Sandbox Jobsheet yang dibuat gurunya!

---

### Pilar 5 — Welcome Quick-Start Chooser, Onboarding 60 Detik & Panduan Shortcut
**File target:** Modul baru `js/ui/onboarding-modal.js`, [js/app.js](../js/app.js), [css/components.css](../css/components.css)

Memastikan pengguna baru (siswa kelas X maupun kepala sekolah/tamu yang ingin melihat dokumentasi SMKN 1 Beringin) langsung paham dalam 10 detik pertama:

1. **Quick-Start Welcome Launcher** (tampil sekali saat kunjungan pertama, atau bisa dibuka kembali via menu `Bantuan / Mulai Cepat`):
   * Menampilkan 3 kartu pilihan visual yang jelas:
     1. **`🏫 Jelajahi Dokumentasi SMKN 1 Beringin`**: Langsung buka 3D Overview dengan Label Gedung aktif (Mode Baca Aman).
     2. **`🧪 Mulai Praktik Jobsheet Siswa`**: Langsung buka katalog 5 Jobsheet Praktikum TKJ/TJKT di Sandbox aman.
     3. **`🛠️ Mode Edit Bangunan & Admin`**: Beralih ke Workspace *Edit Bangunan* / Login Akun Teknisi.
   * Checkbox *"Ingat pilihan & jangan tampilkan otomatis saat dibuka lagi"* (`localStorage`).
2. **Micro-Coachmark Kontekstual (3 Langkah Singkat — Non-Mengganggu)**:
   * Hanya muncul pertama kali saat siswa masuk ke **Mode Teknisi FPP/TPP** (menjelaskan: 1. Jalan & Buka Pintu `WASD / Joystick`, 2. Angkat Alat `E` & Tarik Kabel `C`, 3. Buka `WinBox / CLI`). Bisa ditutup sekali klik.
3. **Modal Bantuan & Cheat-Sheet Shortcut (`?`)**:
   * Kartu referensi bersih yang otomatis menyesuaikan perangkat: di Desktop menampilkan shortcut keyboard (`W/A/S/D`, `E`, `C`, `R`, `X`, `Shift+Drag`, `PgUp/PgDn`), sedangkan di HP menampilkan panduan gestur sentuh (*Joystick kiri, geser kamera kanan, tombol Klem/Colok, WinBox Quick-Config*).

---

## 4. Peta Perubahan File & Struktur Modul

```text
network-map-interaktif/
├── docs/
│   └── phase-9-ux-clarity-and-guided-labs-plan.md  # Dokumen rencana ini
├── js/
│   ├── learning/
│   │   ├── jobsheet-catalog.js                     # [NEW] 5 paket Jobsheet bawaan TKJ/TJKT berbasis gedung nyata SMKN 1 Beringin + skenario troubleshooting
│   │   └── jobsheet-engine.js                      # [NEW] Evaluator otomatis real-time (perangkat per ruang, kerapian kabel, subnet/VLAN/DHCP/NAT, Ping) + generator checksum nilai
│   ├── ui/
│   │   ├── jobsheet-panel.js                       # [NEW] Modal katalog Jobsheet, Floating Live Checklist HUD (#hud-jobsheet-tracker), impor/buat tugas guru & dialog cetak bukti nilai
│   │   ├── onboarding-modal.js                     # [NEW] Quick-Start Welcome Launcher (3 peran), micro-coachmark FPP & Cheat-Sheet Shortcut (Desktop vs HP)
│   │   └── project-modal.js                        # [UPDATE] Tampilkan status Master vs Sandbox, tombol Fork Sandbox & Reset Sandbox
│   ├── storage/
│   │   └── project-storage.js                      # [UPDATE] Metode forkToPracticeSandbox(), resetPracticeSandbox(), returnToMasterProject(), isolasi autosave sandbox
│   ├── core/
│   │   ├── state-manager.js                        # [UPDATE] Tambah state sessionMode ('master-readonly' | 'master-admin' | 'student-sandbox') & activeJobsheetId
│   │   └── workspace-controller.js                 # [UPDATE] Kelola state compact 3D toolbar popover (Kamera ▾ & Tampilan 3D ▾) serta visibilitas banner Master/Sandbox
│   ├── export/
│   │   └── pdf-report-generator.js                 # [UPDATE] Tambah generateJobsheetSubmissionPdf() untuk bukti praktikum siswa 1-halaman
│   └── app.js                                      # [UPDATE] Wiring JobsheetPanel, OnboardingModal, Master/Sandbox banner & dropdown toolbar 3D
├── css/
│   ├── map.css                                     # [UPDATE] Style Compact 3D Bar, popover Kamera & Tampilan 3D, dan Floating Jobsheet Tracker HUD
│   ├── layout.css                                  # [UPDATE] Style Master Read-Only / Sandbox Guard Banner di bawah navbar
│   └── components.css                              # [UPDATE] Style Quick-Start Welcome Modal, kartu Jobsheet, badge skor & Cheat-Sheet Shortcut
└── index.html / sw.js                              # [UPDATE] Struktur ulang #hud-3d-controls menjadi Compact Bar + 2 Popover (mempertahankan seluruh ID tombol lama), tambah banner Master/Sandbox, rebuild bundle & bump cache-buster
```

---

## 5. Rencana Tahapan Eksekusi (Sub-Fase)

Implementasi dibagi menjadi **5 sub-fase berurutan** agar setiap peningkatan UI/UX langsung teruji tanpa mengganggu stabilitas 42+ test sebelumnya:

| Sub-Fase | Fokus Pekerjaan | Deliverable Utama |
| :--- | :--- | :--- |
| **9A** | **Penyederhanaan Sub-Toolbar 3D Kontekstual** (`index.html`, `css/map.css`, `workspace-controller.js`, `app.js`) | Merampingkan `#hud-3d-controls` menjadi 1 baris inti + 2 popover (`Kamera ▾` dan `Tampilan 3D ▾`) dengan tetap mempertahankan semua ID tombol eksisting agar 0 regresi. |
| **9B** | **Pemisahan Master Sekolah vs Sandbox Praktik** (`state-manager.js`, `project-storage.js`, `project-modal.js`, `css/layout.css`) | State `sessionMode`, banner perlindungan Master Read-Only, aksi 1-klik **Fork ke Sandbox** (opsi pertahankan perangkat atau kosongkan perangkat), tombol **Reset Sandbox**, dan **Kembali ke Master**. |
| **9C** | **Engine Jobsheet & 5 Lab Praktik SMKN 1 Beringin** (`jobsheet-catalog.js`, `jobsheet-engine.js`) | 5 paket Jobsheet kurikulum TKJ/TJKT (LAN Dasar, VLAN/Trunk, DHCP/NAT, FO+WiFi, Troubleshooting Bug), auto-setup sandbox per gedung target, serta evaluator real-time deterministik. |
| **9D** | **UI Jobsheet, Live Checklist HUD & Bukti Nilai PDF** (`jobsheet-panel.js`, `pdf-report-generator.js`) | Modal Katalog Jobsheet, Floating Live Checklist HUD ramah desktop & HP, tombol *Hint* & *Lompat ke Gedung*, form Pembuat/Impor Tugas Guru (`.json`), serta cetak **Bukti Praktikum PDF 1-Halaman**. |
| **9E** | **Quick-Start Onboarding, Cheat-Sheet & Verifikasi Akhir** (`onboarding-modal.js`, `app.js`, `sw.js`) | Quick-Start Welcome Launcher 3 pilihan, micro-coachmark FPP, modal Cheat-Sheet Shortcut (adaptif Desktop vs HP), tambah Test 55–58 di `test_object3d.mjs`, uji lengkap browser, rebuild bundle & bump cache-buster. |

---

## 6. Strategi Verifikasi & Kriteria Keberhasilan (Definition of Done)

### 6.1 Pengujian Otomatis (`test_object3d.mjs` — Tambahan Test 55–58)
1. **Test 55 — Compact 3D Toolbar Backward Compatibility**:
   * Verifikasi `index.html` merender `#hud-3d-controls` dengan popover `Kamera ▾` & `Tampilan 3D ▾`, sementara seluruh ID tombol & kontrol lama (`#btn-3d-iso`, `#btn-3d-top`, `#select-3d-scale`, `#btn-3d-explode`, `#btn-3d-labels`, dll.) tetap tersedia dan terikat fungsi dengan benar.
2. **Test 56 — Isolasi Master Read-Only vs Sandbox Praktik**:
   * Verifikasi saat `sessionMode === 'master-readonly'`, mutasi perangkat/kabel tidak menimpa data proyek Master; memanggil `forkToPracticeSandbox()` membuat salinan terpisah yang bebas diedit; dan `returnToMasterProject()` memulihkan data Master utuh 100%.
3. **Test 57 — Jobsheet Engine Auto-Grading & Troubleshooting Injector**:
   * Verifikasi ke-5 Jobsheet di `jobsheet-catalog.js` valid, `JobsheetEngine.evaluateAll()` secara otomatis menaikkan skor dari `0` → `100` saat syarat perangkat, kabel rapi, IP/VLAN/DHCP, dan Ping dipenuhi, serta Jobsheet 5 berhasil menyuntikkan 3 bug dan mendeteksi saat ketiga bug diperbaiki.
4. **Test 58 — Impor Jobsheet Guru, Checksum Bukti Nilai & Quick-Start State**:
   * Verifikasi validasi & impor file Jobsheet kustom `.json`, pembuatan ringkasan laporan + checksum deterministik, serta persistensi flag *skip welcome* di `OnboardingModal`.

### 6.2 Verifikasi Visual & Skenario Pengguna di Browser (Desktop & HP)
1. **Pengalaman Siswa Baru (Viewport HP `360×800` & Laptop `1366×768`)**:
   * Buka aplikasi baru → pilih **`🧪 Mulai Praktik Jobsheet Siswa`** di Quick-Start → pilih **Jobsheet 1 (Lab PPLG)**.
   * Pastikan banner **`🧪 Mode Sandbox Praktik`** tampil jelas, bar 3D tetap rapi **1 baris tanpa menumpuk**, dan Floating Checklist HUD muncul ringkas di pojok tanpa menutupi area kerja.
   * Selesaikan langkah 1–4 → pastikan tiap baris checklist otomatis berubah menjadi **`[✓]`** hijau dan skor mencapai **100/100** → uji ekspor **Bukti Praktikum PDF**.
2. **Keamanan Master Dokumentasi Sekolah**:
   * Klik **`🏫 Kembali ke Peta Master`** → pastikan seluruh tata letak gedung & perangkat asli SMKN 1 Beringin kembali 100% bersih tanpa tercampur perangkat percobaan dari Jobsheet siswa.

---

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| Siswa memodifikasi halaman atau nilai JSON secara manual sebelum ekspor PDF | Laporan nilai kurang akurat | Sertakan kode *verifikasi checksum* berbasis `(studentName + jobsheetId + score + timestamp + topologySignature)` pada PDF bukti praktikum serta opsi ekspor file `.json` topologi yang bisa dicek ulang langsung oleh guru. |
| Popover `Kamera ▾` / `Tampilan 3D ▾` tertutup atau terpotong di viewport HP landscape (`800×360`) | Tombol di dalam dropdown sulit dijangkau | Batasi `max-height: 70dvh; overflow-y: auto` pada popover dan otomatis tutup popover saat tombol di dalamnya diklik atau saat pengguna mengetuk kanvas 3D. |
| Proyek Master SMKN 1 Beringin belum memiliki nama gedung yang persis cocok dengan `targetRoomPreset` Jobsheet (mis. user mengganti nama *Lab PPLG*) | Evaluator `devices-in-room` tidak menemukan gedung target | Cocokkan gedung target menggunakan urutan prioritas: (1) `room.presetId`, (2) kecocokan kata kunci nama gedung (*case-insensitive*), dan (3) fallback ke gedung pertama yang tersedia atau area tengah kanvas jika proyek belum memiliki gedung tersebut. |
| Pengguna lama merasa bingung mencari tombol `Iso / Atas / Skala` yang berpindah ke dropdown | Kurva adaptasi singkat | Pertahankan shortcut keyboard asli (`O, H, Z, L, M, R, B, G, V, Shift+Z`) tetap aktif 100% dan tampilkan label jelas pada tombol **`Kamera ▾`** dan **`Tampilan 3D ▾`**. |
