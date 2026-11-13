# Rencana Implementasi Tahap 1: Fondasi Peta Interaktif & Layout Aplikasi
**NetMap — Interactive Network Infrastructure Mapper**

*Dokumen Perencanaan Teknis — Fokus: Tahap 1 (Interactive Map Foundation)*  
*Tanggal: 12 November 2026*  
*Status: Ready for Implementation*

---

## 1. Tujuan & Ruang Lingkup Tahap 1

Tujuan utama dari Tahap 1 adalah membangun fondasi aplikasi NetMap yang solid, ringan, dan modular. Pada tahap ini, fokus difokuskan sepenuhnya pada **antarmuka aplikasi (shell layout)**, **integrasi mesin canvas (Konva.js)**, **pemuatan denah referensi sebagai background**, **navigasi peta (zoom, pan, fit-to-screen)**, serta **sistem koordinat ternormalisasi (0–1)**.

### Ruang Lingkup (In-Scope):
1. **Scaffolding Proyek:** Struktur folder modular berbasis Vanilla JavaScript ES Modules.
2. **Dashboard Shell Layout:**
   - Top Toolbar (identitas proyek, tombol navigasi zoom/pan/fit, indikator zoom level).
   - Left Sidebar (placeholder navigasi & library perangkat untuk tahap 2).
   - Main Canvas Area (area interaktif Konva.js seluas ~75-80% layar).
   - Right Properties Panel (placeholder panel inspeksi perangkat).
   - Bottom Status Bar (koordinat kursor ternormalisasi, status zoom, indikator resolusi denah).
3. **Background Map Integration:**
   - Memuat file denah referensi (`Gemini_Generated_Image_7rk72e7rk72e7rk7.jpg`) ke layer paling dasar.
   - Menjaga rasio aspek denah asli tanpa distorsi.
4. **Interactive Map Engine (Konva.js):**
   - Navigasi Pan (geser peta via mouse drag).
   - Smooth Zoom menggunakan scroll mouse yang berpusat pada posisi pointer cursor.
   - Tombol kontrol: Zoom In, Zoom Out, Reset (100%), Fit-to-Screen.
   - Batasan zoom minimum (misal: 0.1x) dan maksimum (misal: 5x) untuk kenyamanan visual.
5. **Layered Architecture:**
   - Inisialisasi 7 layer Konva terpisah sesuai PRD (Background, Building, Infrastructure, Device, Connection, Annotation, Interaction).
6. **Coordinate System (Normalized 0–1):**
   - Utilitas konversi bolak-balik:
     - *Screen Coordinate (DOM/Pointer)* $\leftrightarrow$ *Canvas Stage Coordinate* $\leftrightarrow$ *Normalized Coordinate (0.0000 – 1.0000)*.

### Di Luar Cakupan Tahap 1 (Out-of-Scope / Tahap Selanjutnya):
- Penambahan marker perangkat jaringan (Tahap 2).
- Penarikan kabel dan routing koneksi (Tahap 3).
- Visualisasi topologi Cytoscape.js (Tahap 4).
- Database IndexedDB & export/import JSON/PDF/CSV (Tahap 5).

---

## 2. Struktur File & Folder Tahap 1

Struktur direktori yang akan disiapkan:

```text
network-map-interaktif/
├── index.html                           # Entry point HTML dashboard
├── prd.md                               # Dokumen spesifikasi PRD
├── docs/
│   └── phase-1-implementation-plan.md   # Dokumen rencana tahap 1 (file ini)
├── assets/
│   ├── maps/
│   │   └── campus-map.jpg               # Salinan dari Gemini_Generated_Image_...
│   └── icons/                           # Ikon statis / SVG
├── css/
│   ├── main.css                         # Reset, variabel tema (dark mode), tipografi
│   ├── layout.css                       # Grid/flexbox dashboard 3 panel + toolbar + status bar
│   ├── components.css                   # Tombol, toolbar, card, badge, tooltip
│   └── map.css                          # Container canvas, cursor styles, overlay controls
└── js/
    ├── app.js                           # Entry point bootstrap aplikasi
    ├── core/
    │   ├── event-bus.js                 # Event bus terpusat (Pub/Sub)
    │   └── state-manager.js             # Pengelola state aplikasi (mode, zoom, project info)
    ├── map/
    │   ├── coordinate-system.js         # Konversi koordinat (Screen <-> Normalized)
    │   ├── map-engine.js                # Inisialisasi Konva.Stage, viewport handling & render loop
    │   ├── map-layers.js                # Pengelola 7 layer Konva
    │   └── map-interactions.js          # Pan, Wheel Zoom, Fit to Screen, Event Handlers
    ├── ui/
    │   ├── toolbar.js                   # Kontrol tombol zoom, reset, dan mode
    │   └── status-bar.js                # Tampilan koordinat X/Y & zoom level real-time
    └── utils/
        └── helpers.js                   # Fungsi throttle, debounce, math clamp
```

---

## 3. Rincian Teknis & Arsitektur Modul

### 3.1 Layout & Tema Visual (UI/UX)
- **Tema:** Dark Technical Theme (palette: slate `#0f172a`, panel `#1e293b`, border `#334155`, aksen biru elektrik `#3b82f6` & cyan `#06b6d4`).
- **Layout:** CSS Grid / Flexbox dengan layout:
  - Header (Toolbar): tinggi 48px, sticky di atas.
  - Body container: `display: flex; height: calc(100vh - 48px - 24px)`.
    - Left Sidebar (lebar 260px, collapsible).
    - Map Viewport (flex: 1, `overflow: hidden`, `position: relative`).
    - Right Panel (lebar 320px, collapsible).
  - Status Bar: tinggi 24px di bagian terbawah.

### 3.2 Library Dependencies (Tahap 1)
- **Konva.js (v9.x):** Dimuat melalui script tag CDN (`https://unpkg.com/konva@9/konva.min.js`) dengan opsi fallback lokal agar tetap offline-friendly.
- **Lucide Icons:** Untuk ikon antarmuka toolbar (zoom in, zoom out, maximize, crosshair, move, layers).

### 3.3 Sistem Koordinat Ternormalisasi (`coordinate-system.js`)
Konversi matematis untuk menjamin marker di masa depan tidak bergeser saat ukuran layar berubah:
$$\text{normalizedX} = \frac{\text{imageX}}{\text{imageWidth}}$$
$$\text{normalizedY} = \frac{\text{imageY}}{\text{imageHeight}}$$
Begitu pula saat mengambil koordinat pointer mouse:
1. Dari pointer DOM, kurangi offset stage (`stage.x()`, `stage.y()`).
2. Bagi dengan scale stage (`stage.scaleX()`).
3. Dapatkan koordinat lokal terhadap gambar peta denah.
4. Normalisasi dengan membagi terhadap lebar & tinggi asli gambar denah.

### 3.4 Mekanisme Navigasi Peta (`map-interactions.js`)
- **Pan (Drag):**
  - Mengaktifkan `draggable(true)` pada container layer atau `Konva.Stage` saat berada di mode *Navigate*.
  - Mengubah cursor menjadi `grab` dan `grabbing` saat proses drag berlangsung.
- **Zooming (Mouse Wheel):**
  - Menggunakan formula transformasi skala berbasis titik pointer kursor mouse:
    ```javascript
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    ```
- **Fit-to-Screen:**
  - Menghitung rasio `containerWidth / imageNaturalWidth` dan `containerHeight / imageNaturalHeight`.
  - Mengambil rasio terkecil (`Math.min`) dengan margin/padding 20px agar seluruh peta terlihat utuh di tengah layar.
- **Reset View:**
  - Mengembalikan skala ke 1.0 (skala 100%) dan memusatkan peta di viewport.

### 3.5 Layer Management (`map-layers.js`)
Sesuai section 2.2 PRD, 7 layer Konva dibuat berurutan:
1. `bgLayer`: Menampung objek `Konva.Image` peta denah. `listening: false` agar interaksi mouse tidak terhambat.
2. `buildingLayer`: Placeholder area poligon gedung.
3. `infrastructureLayer`: Jalur pipa/ducting, rack luar, tiang.
4. `deviceLayer`: Marker router, switch, AP, server (tahap 2).
5. `connectionLayer`: Garis kabel & koneksi jaringan (tahap 3).
6. `annotationLayer`: Label teks, nama gedung, catatan teknis.
7. `interactionLayer`: Preview garis saat menggambar, selection box.

---

## 4. Rincian Langkah Kerja (Step-by-Step Breakdown)

| Langkah | Item Pekerjaan | Output / Deliverable |
|:---|:---|:---|
| **Langkah 1** | Inisialisasi struktur direktori & aset peta | Folder `docs/`, `assets/maps/`, `css/`, `js/` siap; aset peta disalin ke `assets/maps/campus-map.jpg`. |
| **Langkah 2** | Pembuatan HTML Skeleton & Layout CSS | `index.html`, `css/main.css`, `css/layout.css`, `css/components.css`, `css/map.css`. Tampilan shell dashboard modern & responsif. |
| **Langkah 3** | Core Modules (`EventBus` & `StateManager`) | `js/core/event-bus.js` & `js/core/state-manager.js` untuk komunikasi antar-komponen tanpa coupling ketat. |
| **Langkah 4** | Utilitas Sistem Koordinat | `js/map/coordinate-system.js` dengan fungsi konversi akurat dan unit test logic. |
| **Langkah 5** | Inisialisasi Konva Map Engine & Background Layer | `js/map/map-engine.js` & `js/map/map-layers.js`. Gambar denah termuat di canvas dengan ukuran asli yang proporsional. |
| **Langkah 6** | Navigasi Peta Interaktif (Pan, Zoom, Bounds) | `js/map/map-interactions.js`. Mouse wheel zoom ke pointer, pan lancar, batas zoom min/max. |
| **Langkah 7** | Integrasi Toolbar, Tombol Aksi, & Status Bar | `js/ui/toolbar.js` & `js/ui/status-bar.js`. Tombol Zoom In/Out, Fit Screen, Reset berfungsi; Status Bar menampilkan `X: 0.xxxx, Y: 0.xxxx` dan `Zoom: 100%`. |
| **Langkah 8** | Pengujian & Verifikasi Kriteria Selesai (DoD) | Uji responsivitas window resize, zoom scroll, pan, dan akurasi titik koordinat. |

---

## 5. Kriteria Selesai (Definition of Done — Tahap 1)

Tahap 1 dinyatakan selesai dan siap melangkah ke Tahap 2 jika memenuhi checklist berikut:
- [ ] Denah kampus (`campus-map.jpg`) berhasil dimuat di canvas Konva tanpa distorsi rasio aspek.
- [ ] Peta dapat di-pan (digeser) dengan klik-tahan mouse secara mulus (target 60 FPS).
- [ ] Peta dapat di-zoom in dan zoom out menggunakan scroll wheel mouse secara presisi berpusat pada posisi cursor.
- [ ] Tombol **Zoom In**, **Zoom Out**, **Fit to Screen**, dan **Reset View** pada Toolbar berfungsi normal.
- [ ] Status bar menampilkan koordinat ternormalisasi $(0.0000 - 1.0000)$ yang berubah secara dinamis saat kursor mouse bergerak di atas peta denah.
- [ ] Saat ukuran jendela browser di-resize (Window Resize), canvas otomatis menyesuaikan diri tanpa merusak posisi peta (`ResizeObserver`).
- [ ] Gambar latar belakang denah tidak mengalami mutasi atau perubahan fisik.
- [ ] Seluruh kode tersusun modular menggunakan ES Modules tanpa error di console browser.

---

## 6. Persetujuan & Langkah Selanjutnya

Setelah dokumen rencana implementasi ini disepakati:
1. Kita akan langsung mengeksekusi **Langkah 1 hingga Langkah 7** untuk membangun fondasi Tahap 1 secara lengkap.
2. Melakukan pengetesan visual & interaksi di browser.
3. Setelah Tahap 1 terverifikasi 100% sesuai Definition of Done, kita siap melanjutkan ke **Tahap 2: Manajemen Perangkat Jaringan (Device Mapping & Properties)**.

