# Rencana Implementasi Tahap 5: Penyimpanan Offline-First, Ekspor & Optimasi
**NetMap — Interactive Network Infrastructure Mapper**

*Dokumen Perencanaan Teknis — Fokus: Tahap 5 (IndexedDB Storage, Backup/Restore JSON, Multi-format Export & Performance Optimization)*  
*Tanggal: 12 November 2026*  
*Status: Ready for Implementation*

---

## 1. Tujuan & Ruang Lingkup Tahap 5

Tahap 5 merupakan fase penyempurnaan yang mengubah NetMap menjadi sistem dokumentasi jaringan mandiri (*standalone*), andal (*resilient*), dan siap produksi (*production-ready*). Fokus utamanya adalah **persistensi data lokal secara offline-first menggunakan IndexedDB**, fitur **auto-save cerdas**, **pencadangan (backup) dan pemulihan (restore) proyek berbasis JSON dengan validasi skema ketat**, **ekspor multi-format (CSV, High-Res PNG, PDF Report)**, serta **optimasi performa aplikasi (lazy-loading)**.

### Ruang Lingkup (In-Scope):
1. **Penyimpanan Lokal Offline-First (IndexedDB):**
   - Menggunakan IndexedDB (didukung library pembungkus ringan `idb`) sebagai media penyimpanan utama untuk proyek jaringan, konfigurasi denah, perangkat, dan koneksi kabel.
   - Mendukung multi-proyek (kemampuan membuat proyek baru, mengganti proyek aktif, dan menghapus proyek lokal).
   - **Auto-Save Mechanism:** Penyimpanan otomatis dengan teknik *debounce* (1,5 detik setelah interaksi terakhir seperti pemindahan marker, pengeditan properti, atau penarikan kabel) tanpa memblokir thread UI.
   - Indikator status penyimpanan di Toolbar/Status Bar ("Saved", "Saving...", "Unsaved changes").
2. **Pencadangan & Pemulihan JSON (Backup & Restore):**
   - **Ekspor JSON:** Mengunduh seluruh data proyek dalam satu file `.json` terstruktur lengkap dengan metadata versi, konfigurasi peta, daftar perangkat, rute kabel, dan pengaturan layer.
   - **Impor JSON:** Mengunggah file `.json` dengan validasi skema yang ketat (validasi tipe data, format IP/MAC, relasi kabel valid, sanitasi teks pencegah XSS) sebelum data diaplikasikan ke dalam state.
3. **Ekspor Inventaris ke CSV (SheetJS):**
   - Ekspor dua dataset tabular:
     - `devices-inventory.csv`: ID, Nama Perangkat, Kategori, Tipe, Merek, Model, IP Address, MAC Address, VLAN, Status, Lokasi, Catatan.
     - `cables-inventory.csv`: ID, Nama Kabel, Tipe Kabel, Kategori Kabel, Perangkat Sumber, Perangkat Tujuan, Estimasi Panjang (m), Status Jalur, Catatan.
4. **Ekspor Snapshot Denah ke Gambar (High-Resolution PNG):**
   - Menghasilkan tangkapan layar (snapshot) denah beserta seluruh perangkat dan kabel yang terlihat menggunakan `Konva.Stage.toDataURL()`.
   - Opsi konfigurasi ekspor: resolusi pengganda (1x, 2x untuk cetak tajam), opsi menyertakan/menyembunyikan grid atau selection handles.
5. **Ekspor Laporan Dokumentasi Komprehensif ke PDF (jsPDF + autoTable):**
   - Menghasilkan dokumen laporan resmi berformat PDF berorientasi Landscape A4 yang memuat:
     - **Halaman Judul & Ringkasan Eksekutif:** Nama proyek, tanggal dibuat, total perangkat, total panjang kabel, ringkasan status perangkat (persentase Online/Offline).
     - **Halaman Visualisasi Denah:** Snapshot peta beresolusi tinggi dengan legenda kategori perangkat.
     - **Tabel Inventaris Perangkat:** Rincian teknis lengkap setiap perangkat.
     - **Tabel Jalur Koneksi & Kabel:** Rute dan daftar penghubung antarperangkat.
     - **Tabel Ringkasan IPAM & VLAN:** Pembagian segmentasi VLAN dan alokasi IP Address.
6. **Optimasi Performa & Lazy-Loading (Performance Engineering):**
   - Library ekspor berukuran besar (`SheetJS` ~300KB, `jsPDF` ~350KB) **tidak dimuat pada awal inisialisasi aplikasi** melainkan di-load secara dinamis (*lazy load on-demand*) saat pengguna pertama kali membuka modal ekspor.
   - Initial JavaScript bundle aplikasi tetap berada di bawah target spesifikasi PRD (< 250 KB).
   - Render loop efisien: memanfaatkan `Konva.Layer.batchDraw()` terisolasi dan pembatasan frekuensi event scroll/drag.

---

## 2. Struktur Modul & File Tahap 5

File dan modul baru yang akan diimplementasikan pada tahap ini:

```text
network-map-interaktif/
├── docs/
│   ├── phase-1-implementation-plan.md
│   ├── phase-2-implementation-plan.md
│   ├── phase-3-implementation-plan.md
│   ├── phase-4-implementation-plan.md
│   └── phase-5-implementation-plan.md   # Rencana tahap 5 (file ini)
└── js/
    ├── storage/
    │   ├── database.js                  # Setup IndexedDB schema & connection lifecycle (idb wrapper)
    │   ├── project-storage.js           # Operasi CRUD proyek, debounced auto-save & metadata manager
    │   └── json-importer-exporter.js    # Serialisasi JSON, validasi skema ketat & sanitasi XSS
    ├── export/
    │   ├── lazy-loader.js               # Dinamic script loader untuk SheetJS & jsPDF (on-demand)
    │   ├── csv-exporter.js              # Formatting data tabular & trigger download CSV via SheetJS
    │   ├── snapshot-exporter.js         # Pengambilan snapshot canvas Konva ke PNG beresolusi tinggi
    │   └── pdf-report-generator.js      # Penyusunan multi-page PDF laporan dokumentasi via jsPDF
    └── ui/
        ├── export-modal.js              # Dialog pilihan ekspor (JSON, CSV, PNG, PDF) dengan opsi kustom
        └── project-modal.js             # Modal manajemen proyek (Buka Proyek, Proyek Baru, Hapus)
```

---

## 3. Rincian Teknis & Arsitektur Modul

### 3.1 Skema IndexedDB (`database.js`)
Penyimpanan lokal menggunakan database `NetMapDB` (versi 1) dengan struktur *object stores*:
- `projects`:
  - `keyPath: 'id'`
  - Indexes: `name`, `updatedAt`
  - Payload: Data proyek lengkap (`{ id, name, mapConfig, devices, connections, layers, updatedAt }`).
- `preferences`:
  - `keyPath: 'key'`
  - Menyimpan preferensi pengguna (tema gelap/terang, status panel terbuka/tutup, ID proyek aktif terakhir).

### 3.2 Siklus Auto-Save Cerdas (`project-storage.js`)
```text
  [State Mutation: Move Device / Add Cable / Edit Property]
     │
     ▼
  [EventBus emit 'state:changed']
     │
     ▼
  [Debounce Timer: 1500ms]
     │  (Jika ada perubahan baru sebelum 1.5 detik, reset timer)
     ▼
  [Update Status UI: "Saving..."]
     │
     ▼
  [Tulis ke IndexedDB (Async Transaction)]
     │
     ▼
  [Update Status UI: "All changes saved" (Centang Hijau)]
```

### 3.3 Validasi Ketat Impor JSON (`json-importer-exporter.js`)
Untuk menjaga integritas dan keamanan aplikasi dari file corrupt atau serangan injeksi:
1. **Pemeriksaan Header & Versi:** Memastikan properti `version` dan `id` tersedia.
2. **Validasi Perangkat (`devices`):**
   - Setiap item wajib memiliki `id`, `name`, dan `position.x`, `position.y` dalam rentang $0 \le x, y \le 1$.
   - Validasi format IP Address (jika ada) menggunakan regex standar IPv4.
3. **Validasi Koneksi (`connections`):**
   - Setiap kabel wajib merujuk ke `source` dan `destination` yang benar-benar ada dalam daftar ID perangkat yang diimpor.
4. **Sanitasi String:** Seluruh teks input (`name`, `notes`, `brand`, dll.) dibersihkan dari tag HTML berbahaya (`stripHtml` / text escaping) sebelum masuk ke DOM atau canvas.

### 3.4 Mekanisme Lazy-Loading Pustaka Ekspor (`lazy-loader.js`)
Agar aplikasi utama tetap ringan di awal:
```javascript
export async function loadExportLibraries() {
  const promises = [];
  if (!window.XLSX) {
    promises.push(loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'));
  }
  if (!window.jspdf) {
    promises.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));
    promises.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'));
  }
  await Promise.all(promises);
}
```

### 3.5 Pembuatan Laporan PDF Komprehensif (`pdf-report-generator.js`)
Laporan PDF disusun secara terstruktur untuk kebutuhan dokumentasi teknis atau audit:
1. **Header & Branding:** Logo NetMap, Nama Proyek, Tanggal Dokumen, Disiapkan oleh IT Infrastructure Team.
2. **Executive Summary Card:**
   - Total Perangkat Terpasang.
   - Status Ringkas: Online (Hijau), Offline (Merah), Warning (Kuning).
   - Total Panjang Kabel Fisik Terpasang (meter).
   - Jumlah Segmentasi VLAN Aktif.
3. **Visual Map Snapshot:** Gambar canvas denah di-render dalam orientasi penuh satu halaman landscape.
4. **Tabel Inventaris Perangkat (Device Table):** Menggunakan plugin `jspdf-autotable` dengan format kolom teratur, zebra striping, dan status badge berwarna.
5. **Tabel Dokumentasi Kabel (Cable Table):** Menampilkan rute antarperangkat, tipe kabel, dan estimasi panjang.
6. **Tabel Dokumentasi IP & VLAN:** Alokasi subnet dan daftar IP per departemen/zona.

---

## 4. Rincian Langkah Kerja (Step-by-Step Breakdown)

| Langkah | Item Pekerjaan | Output / Deliverable |
|:---|:---|:---|
| **Langkah 1** | Modul Database IndexedDB (`database.js`) | File `js/storage/database.js` dengan koneksi IndexedDB aman berbasis Promise (`idb`). |
| **Langkah 2** | Pengelola Proyek & Auto-Save Cerdas | File `js/storage/project-storage.js` untuk auto-save debounced dan indikator status simpan di UI. |
| **Langkah 3** | Backup & Restore JSON dengan Validasi | File `js/storage/json-importer-exporter.js` untuk download JSON, upload JSON, validasi skema & sanitasi. |
| **Langkah 4** | Modal Manajemen Proyek | File `js/ui/project-modal.js` untuk membuat proyek baru, membuka daftar proyek lokal, dan menghapus proyek. |
| **Langkah 5** | Dinamic Script Lazy-Loader | File `js/export/lazy-loader.js` untuk memuat library SheetJS dan jsPDF hanya saat diperlukan. |
| **Langkah 6** | Ekspor Snapshot Denah ke PNG Resolusi Tinggi | File `js/export/snapshot-exporter.js` via `stage.toDataURL()` dengan opsi skala 1x dan 2x. |
| **Langkah 7** | Ekspor Inventaris ke CSV/Excel (SheetJS) | File `js/export/csv-exporter.js` untuk mengunduh dataset `devices.csv` dan `cables.csv`. |
| **Langkah 8** | Generator Laporan PDF Multi-Halaman (jsPDF) | File `js/export/pdf-report-generator.js` yang menghasilkan laporan teknis PDF berstandar profesional. |
| **Langkah 9** | Modal Pilihan Ekspor & Pengaturan | File `js/ui/export-modal.js` di Toolbar untuk memilih format ekspor yang diinginkan. |
| **Langkah 10**| Optimasi Akhir, Bundling & Verifikasi DoD | Audit beban awal JavaScript (< 250 KB), uji persistensi data setelah refresh browser, dan verifikasi kriteria selesai seluruh PRD. |

---

## 5. Kriteria Selesai (Definition of Done — Tahap 5 & Keseluruhan MVP)

Tahap 5 dan keseluruhan rilis MVP NetMap dinyatakan selesai dan siap produksi jika memenuhi kriteria berikut:
- [ ] Proyek otomatis tersimpan ke IndexedDB saat ada perubahan, dan data tetap utuh ketika browser di-refresh.
- [ ] Pengguna dapat mengekspor seluruh proyek ke file `.json` dan mengimpor kembali file tersebut dengan pemulihan 100% posisi perangkat, rute kabel, dan atribut teknis.
- [ ] Sistem menolak file JSON yang rusak, tidak valid, atau tidak sesuai skema dengan pesan kesalahan yang jelas.
- [ ] Pengguna dapat mengunduh inventaris perangkat dan kabel dalam format file `.csv` yang dapat dibuka rapi di Microsoft Excel atau Google Sheets.
- [ ] Pengguna dapat mengunduh snapshot peta denah beresolusi tinggi dalam format `.png`.
- [ ] Pengguna dapat mengunduh dokumen laporan teknis resmi berformat `.pdf` multi-halaman yang mencakup ringkasan, peta denah, tabel perangkat, tabel kabel, dan alokasi IP/VLAN.
- [ ] Pustaka berat (SheetJS dan jsPDF) tidak membebani pemuatan halaman awal aplikasi (lazy loaded).
- [ ] Seluruh kriteria penerimaan MVP dari PRD (Section 11 & Section 12) terpenuhi tanpa adanya error kritis pada konsol browser.

