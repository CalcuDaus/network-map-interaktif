# Rencana Implementasi Tahap 3: Pemetaan Jalur Kabel & Konektivitas
**NetMap — Interactive Network Infrastructure Mapper**

*Dokumen Perencanaan Teknis — Fokus: Tahap 3 (Cable Mapping & Connection Routing)*  
*Tanggal: 12 November 2026*  
*Status: Ready for Implementation*

---

## 1. Tujuan & Ruang Lingkup Tahap 3

Tahap 3 berfokus pada visualisasi dan dokumentasi **jalur kabel fisik serta koneksi nirkabel (wireless link)** antarperangkat jaringan. Kabel tidak hanya digambarkan sebagai garis lurus sederhana, melainkan mendukung **titik belok (waypoints / multi-segment polyline)** yang mencerminkan jalur instalasi fisik sebenarnya (misal: melalui tray, ducting, tiang luar, atau plafon gedung). Selain itu, ujung kabel terikat secara dinamis (*device anchor binding*) ke perangkat sumber dan tujuan.

### Ruang Lingkup (In-Scope):
1. **Dukungan Ragam Tipe & Kategori Kabel:**
   - **Twisted Pair (Ethernet):** UTP Cat5e, UTP Cat6, UTP Cat6A.
   - **Fiber Optic:** Singlemode (SMF), Multimode (MMF).
   - **Wireless Link:** Point-to-Point (PtP), Point-to-Multipoint (PtMP), Mesh Link.
   - **Coaxial:** RG6, RG11, CCTV Coaxial.
2. **Identitas Visual Berdasarkan Tipe & Status:**
   - **Warna Garis:**
     - Cat5e/Cat6: Biru (`#2563eb`) / Biru Langit (`#38bdf8`)
     - Cat6A: Ungu (`#8b5cf6`)
     - Fiber Optic Single Mode: Kuning (`#eab308`)
     - Fiber Optic Multi Mode: Oranye (`#f97316`)
     - Wireless Link: Cyan Putus-putus (`#06b6d4`, dashed)
     - Coaxial: Cokelat / Slate (`#64748b`)
   - **Status Jalur:**
     - Active / Normal: Garis solid / cerah.
     - Damaged / Broken: Garis merah (`#ef4444`) dengan indikator putus.
     - Inactive / Reserved: Garis redup / dashed abu-abu.
     - Maintenance: Garis kuning putus-putus (`#f59e0b`).
3. **Alur Interaksi Menggambar Kabel (Interactive Drawing Workflow):**
   - Aktifkan **Draw Cable Mode** dari toolbar atau shortcut.
   - **Langkah 1:** Pengguna mengklik perangkat sumber (*Source Device*). Perangkat ditandai aktif sebagai titik awal.
   - **Langkah 2:** Pengguna mengklik titik-titik di denah untuk menambahkan *Waypoints* (belokan jalur kabel). Garis preview sementara (*rubber-band*) mengikuti posisi kursor.
   - **Langkah 3:** Pengguna mengklik perangkat tujuan (*Destination Device*).
   - **Langkah 4:** Validasi koneksi (koneksi ke diri sendiri dicegah, ID sumber dan tujuan divalidasi).
   - **Langkah 5:** Kabel baru tersimpan dan dirender di `connectionLayer`.
4. **Dynamic Endpoint Binding (Reaktivitas Posisi Perangkat):**
   - Titik awal kabel terikat ke posisi `device-source`, dan titik akhir kabel terikat ke `device-destination`.
   - Jika pengguna memindahkan marker perangkat (di Tahap 2), titik ujung kabel yang terhubung otomatis ikut bergeser secara mulus tanpa merusak titik belok tengah (*intermediate waypoints*).
5. **Editing Jalur Kabel (Waypoint Manipulation):**
   - Saat kabel diklik/dipilih:
     - Garis kabel mendapatkan highlight/selection glow.
     - Handle titik kontrol (*waypoint circles*) muncul di setiap belokan.
     - Pengguna dapat menggeser waypoint untuk menyesuaikan jalur.
     - Pengguna dapat menambahkan waypoint baru (klik ganda pada segmen) atau menghapus waypoint (klik kanan pada titik).
6. **Properties & Documentation Panel (Koneksi):**
   - Menampilkan detail koneksi saat garis kabel dipilih di panel kanan:
     - Connection ID, Cable Name/Label.
     - Perangkat Sumber & Perangkat Tujuan (dengan tombol pintas lompat ke perangkat).
     - Tipe Kabel & Kategori (dropdown).
     - Estimasi Panjang Kabel (dihitung otomatis dari skala koordinat atau diinput manual dalam meter).
     - Status Kabel (Active, Damaged, Inactive, Maintenance).
     - Catatan Teknis (misal: "Lewat ducting bawah tanah gedung B").
     - Tombol **Delete Cable** dengan konfirmasi.

---

## 2. Struktur Modul & File Tahap 3

File dan modul baru yang akan diimplementasikan pada tahap ini:

```text
network-map-interaktif/
├── docs/
│   ├── phase-1-implementation-plan.md
│   ├── phase-2-implementation-plan.md
│   └── phase-3-implementation-plan.md   # Rencana tahap 3 (file ini)
└── js/
    ├── connections/
    │   ├── cable-schema.js              # Model data koneksi, default values & validator
    │   ├── cable-library.js             # Definisi visual warna, ketebalan, dash-pattern per jenis kabel
    │   ├── cable-renderer.js            # Engine render Konva.Line/Konva.Group untuk jalur kabel & waypoints
    │   ├── cable-manager.js             # Pengelola koleksi koneksi, reaktivitas posisi & CRUD
    │   └── cable-drawing-tool.js        # State machine & interaksi menggambar kabel (click source -> waypoints -> target)
    └── ui/
        └── connection-panel.js          # Form inspeksi & edit properti kabel di sidebar kanan
```

---

## 3. Rincian Teknis & Arsitektur Modul

### 3.1 Skema Data Koneksi (`cable-schema.js`)
Struktur data tunggal koneksi mengikuti spesifikasi PRD Section 6.3:

```javascript
export const CableSchema = {
  create(params = {}) {
    const id = params.id || `cab-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
    return {
      id: id,
      name: params.name || 'New Cable Link',
      source: params.source,                    // Device ID sumber (wajib)
      destination: params.destination,          // Device ID tujuan (wajib)
      type: params.type || 'ethernet',          // ethernet, fiber, wireless, coaxial
      cableCategory: params.cableCategory || 'cat6', // cat5e, cat6, cat6a, fiber-sm, fiber-mm, wireless-link, coaxial
      status: params.status || 'active',        // active, damaged, inactive, maintenance
      route: Array.isArray(params.route) ? params.route : [], // Array waypoint intermediate [{x, y}] (0.0000 - 1.0000)
      length: params.length || 0,               // Dalam meter (manual atau kalkulasi)
      lengthMode: params.lengthMode || 'auto',  // auto | manual
      notes: params.notes || '',
      createdAt: params.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
};
```

### 3.2 Katalog Gaya Visual Kabel (`cable-library.js`)
Pustaka definisi gaya rendering untuk setiap kategori kabel:

| Kategori Kabel | Tipe | Warna Utama | Stroke Width | Dash Pattern | Line Cap / Join |
|:---|:---|:---|:---:|:---:|:---:|
| `cat5e` | Ethernet | `#3b82f6` (Blue) | 3px | Solid `[]` | Round |
| `cat6` | Ethernet | `#2563eb` (Royal Blue) | 3.5px | Solid `[]` | Round |
| `cat6a` | Ethernet | `#8b5cf6` (Purple) | 4px | Solid `[]` | Round |
| `fiber-sm` | Fiber Optic | `#eab308` (Yellow) | 3px | Solid `[]` | Round |
| `fiber-mm` | Fiber Optic | `#f97316` (Orange) | 3px | Solid `[]` | Round |
| `wireless-link` | Wireless | `#06b6d4` (Cyan) | 2.5px | Dashed `[8, 6]` | Round |
| `coaxial` | Coaxial | `#64748b` (Slate) | 3px | Solid `[]` | Round |

### 3.3 Logika Penggambaran & Kalkulasi Jalur (`cable-renderer.js`)
Titik koordinat lengkap suatu kabel dihitung secara dinamis:
$$\text{Full Points} = [ \text{Posisi Source}, \text{Waypoint}_1, \text{Waypoint}_2, \dots, \text{Waypoint}_n, \text{Posisi Destination} ]$$

- Koordinat ternormalisasi $(x, y \in [0, 1])$ dikonversi ke koordinat piksel aktual canvas menggunakan utilitas `coordinate-system.js`.
- Jalur dirender menggunakan `Konva.Line`:
  ```javascript
  const line = new Konva.Line({
    points: flatPixelPoints, // [x1, y1, x2, y2, x3, y3, ...]
    stroke: cableStyle.stroke,
    strokeWidth: isSelected ? cableStyle.strokeWidth + 2 : cableStyle.strokeWidth,
    dash: cableStyle.dash,
    lineCap: 'round',
    lineJoin: 'round',
    hitStrokeWidth: 14, // Mempermudah klik pada garis tipis
    shadowColor: isSelected ? '#38bdf8' : null,
    shadowBlur: isSelected ? 10 : 0
  });
  ```
- **Waypoint Handles (Mode Seleksi):**
  Saat kabel dipilih, setiap waypoint tengah dirender sebagai lingkaran kecil (`Konva.Circle`, radius 6px) dengan `draggable: true`. Ketika handle digeser (`dragmove`/`dragend`), koordinat waypoint diperbarui dan garis kabel langsung ditarik ulang secara real-time.

### 3.4 State Machine Menggambar Kabel (`cable-drawing-tool.js`)
Alur kerja interaktif diatur dengan state machine yang aman:
```text
  [IDLE]
     │
     ▼ (Pilih Mode Draw Cable)
  [WAITING_FOR_SOURCE] ──(Batal / ESC)──► [IDLE]
     │
     ▼ (Klik Device A)
  [DRAWING_WAYPOINTS] ──(Klik Kanvas: Tambah Waypoint)──┐
     │  ▲                                               │
     │  └───────────────────────────────────────────────┘
     ▼ (Klik Device B)
  [VALIDATE_CONNECTION]
     │
     ├─► Jika Device A == Device B ──► Tampilkan Peringatan ──► Kembali ke DRAWING_WAYPOINTS
     │
     └─► Jika Valid ──► Simpan Koneksi ──► Kembali ke [IDLE]
```

### 3.5 Reaktivitas Pergeseran Perangkat (Anchor Binding)
Ketika perangkat digeser di `deviceLayer`:
1. `DeviceManager` memicu event `device:moved` dengan payload `{ deviceId, newPosition }`.
2. `CableManager` mendengarkan event tersebut dan mencari semua koneksi di mana `source === deviceId` atau `destination === deviceId`.
3. Titik awal/akhir dari garis kabel terkait langsung diperbarui ke koordinat baru perangkat.
4. `connectionLayer.batchDraw()` dipanggil untuk merender ulang garis kabel secara instan (60 FPS tanpa jeda).

---

## 4. Rincian Langkah Kerja (Step-by-Step Breakdown)

| Langkah | Item Pekerjaan | Output / Deliverable |
|:---|:---|:---|
| **Langkah 1** | Skema Data & Model Koneksi | File `js/connections/cable-schema.js` dengan atribut lengkap dan validasi source/destination. |
| **Langkah 2** | Definisi Visual & Tipe Kabel | File `js/connections/cable-library.js` berisi katalog warna, ketebalan, dan pola dash untuk UTP, FO, Wireless, Coaxial. |
| **Langkah 3** | Engine Render Jalur Kabel di Konva | File `js/connections/cable-renderer.js` untuk menggambar polyline kabel dan waypoint handle interaktif pada `connectionLayer`. |
| **Langkah 4** | Tool Menggambar Kabel Interaktif | File `js/connections/cable-drawing-tool.js` dengan alur: pilih sumber -> tambah titik belok -> pilih tujuan -> preview rubber-band. |
| **Langkah 5** | Reaktivitas Posisi Perangkat (Device Anchor) | Integrasi event listener di `cable-manager.js` agar ujung kabel otomatis mengikuti gerakan marker perangkat saat digeser. |
| **Langkah 6** | Manipulasi Waypoint & Edit Jalur | Interaksi memindahkan waypoint handle, menambah titik belok baru, dan menghapus belokan kabel. |
| **Langkah 7** | Panel Properti Koneksi (Right Panel) | File `js/ui/connection-panel.js` untuk melihat/mengubah nama, kategori kabel, status jalur, panjang kabel, dan catatan. |
| **Langkah 8** | Validasi & Penghapusan Koneksi | Logika pencegahan loop koneksi mandiri, dialog konfirmasi hapus kabel, dan pembersihan koneksi jika perangkat terkait dihapus. |
| **Langkah 9** | Pengujian Integrasi & Performa | Pengetesan puluhan jalur kabel bersamaan, drag perangkat berulang kali, dan verifikasi kelancaran render (60 FPS). |

---

## 5. Kriteria Selesai (Definition of Done — Tahap 3)

Tahap 3 dinyatakan selesai jika memenuhi checklist berikut:
- [ ] Pengguna dapat mengaktifkan mode **Draw Cable** dari toolbar.
- [ ] Pengguna dapat memilih perangkat awal (source), mengklik titik-titik belokan di peta (waypoints), dan mengklik perangkat akhir (destination) untuk membentuk koneksi.
- [ ] Garis kabel muncul di peta pada `connectionLayer` dengan warna dan gaya garis yang sesuai dengan tipe kabel yang dipilih (UTP, Fiber Optic, Wireless, Coaxial).
- [ ] Sistem menolak pembuatan koneksi yang tidak valid (misal: koneksi ke perangkat yang sama).
- [ ] Jika perangkat yang terhubung digeser posisinya di peta, garis kabel tetap terikat dan otomatis menyesuaikan posisinya secara real-time.
- [ ] Mengklik garis kabel membuka panel detail koneksi di sisi kanan dan memunculkan handle titik kontrol (waypoint handles).
- [ ] Waypoint dapat digeser untuk merapikan rute instalasi kabel di denah.
- [ ] Pengguna dapat mengubah tipe kabel, kategori, status (Active/Damaged/Maintenance), dan estimasi panjang kabel melalui panel properti.
- [ ] Jika perangkat dihapus, semua kabel yang terhubung ke perangkat tersebut ikut terhapus secara otomatis dengan peringatan yang jelas.
- [ ] Render kabel tetap lancar dan tidak menyebabkan penurunan frame rate pada interaksi pan & zoom.

---

## 6. Keterkaitan dengan Tahap Berikutnya

Setelah Tahap 3 selesai dan terverifikasi:
* Hubungan `source` $\rightarrow$ `destination` beserta data kategori kabel (`cat6`, `fiber-sm`, dll.) akan menjadi fondasi utama bagi **Tahap 4: Visualisasi Topologi Jaringan Fisik & Logis (Cytoscape.js & Dagre)**.
* Inventaris kabel (ID, nama, tipe, panjang, perangkat yang terhubung) akan dimasukkan ke dalam laporan pada **Tahap 5: Dokumentasi, Database IndexedDB, dan Ekspor (JSON, CSV, PDF)**.

