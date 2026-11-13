# Rencana Implementasi Tahap 2: Manajemen & Pemetaan Perangkat Jaringan
**NetMap — Interactive Network Infrastructure Mapper**

*Dokumen Perencanaan Teknis — Fokus: Tahap 2 (Device Mapping & Properties Management)*  
*Tanggal: 12 November 2026*  
*Status: Ready for Implementation*

---

## 1. Tujuan & Ruang Lingkup Tahap 2

Tahap 2 berfokus pada kemampuan menambahkan, memposisikan, mengelola, dan mendokumentasikan **seluruh perangkat jaringan** pada peta denah interaktif. Perangkat akan ditampilkan sebagai marker grafis yang kaya informasi, dapat digeser secara interaktif, dipilih untuk diinspeksi, dan dikonfigurasi melalui panel properti.

### Ruang Lingkup (In-Scope):
1. **Device Library (Sidebar Kiri):**
   - Katalog komponen jaringan terkelompok dalam 4 kategori utama:
     - **Core Network:** Router, Main Router, Core Switch, Distribution Switch, Firewall, Gateway.
     - **Network Distribution:** Managed Switch, Unmanaged Switch, PoE Switch, Access Point, Wireless Bridge, Repeater.
     - **Infrastructure:** Network Rack, Patch Panel, ODP, ODC, Fiber Optic Terminal, Network Pole.
     - **End Devices:** CCTV, NVR, Server, Computer, Printer, IP Phone, IoT Device.
   - Setiap tipe perangkat memiliki ikon khusus (Lucide Icons) dan badge visual tersendiri.
2. **Penambahan Perangkat ke Peta (Placement Modes):**
   - **Mode Drag-and-Drop:** Pengguna menarik item perangkat dari sidebar kiri dan menjatuhkannya di atas denah peta.
   - **Mode Click-to-Place:** Pengguna memilih tipe perangkat, lalu klik langsung pada titik target di denah.
   - Konversi otomatis posisi jatuhan (drop coordinate) ke koordinat ternormalisasi $(0.0000 - 1.0000)$.
3. **Visual Marker Rendering (Konva `deviceLayer`):**
   - Render marker interaktif menggunakan `Konva.Group` yang memuat:
     - Background shape / badge lingkaran atau rounded rectangle dengan border kontras.
     - Ikon perangkat (Lucide SVG/Canvas icon).
     - Label nama perangkat dan/atau IP address di bawah icon.
     - Status Indicator badge (lingkaran warna di sudut marker: Hijau = Online, Merah = Offline, Kuning = Warning, Abu-abu = Unknown).
     - Selection ring / highlight saat perangkat dipilih.
     - Hover animation / tooltip ringkas (Nama, IP, Status).
4. **Interaksi & Manipulasi Marker:**
   - **Drag & Reposition:** Marker dapat digeser di atas denah. Saat `dragend`, koordinat baru otomatis diperbarui dan dinormalisasi.
   - **Selection:** Klik marker untuk memilih perangkat (menampilkan selection border dan membuka Properties Panel di sisi kanan).
   - **Multi-select / Deselect:** Klik area kosong peta untuk membatalkan seleksi.
5. **Properties Panel (Sidebar Kanan):**
   - Form komprehensif untuk melihat dan mengedit atribut perangkat:
     - **Identitas:** Device ID (auto-generated, unik), Device Name, Category, Brand/Vendor, Model, Lokasi Fisik.
     - **Jaringan:** IP Address, MAC Address, Subnet Mask/CIDR, VLAN ID, Hostname.
     - **Operasional & Status:** Status (Online/Offline/Warning/Unknown), Versi Firmware, Tanggal Instalasi, Catatan Teknis (Notes).
   - Aksi cepat perangkat:
     - Tombol **Save Changes** (dengan validasi format IP & MAC).
     - Tombol **Duplicate Device** (membuat salinan perangkat di dekat posisi aktif).
     - Tombol **Delete Device** (dialog konfirmasi sebelum penghapusan).
     - Tombol **Center on Map** (memusatkan viewport ke marker perangkat).
6. **Data Validation & State Synchronization:**
   - Skema validasi format IP (IPv4 regex), MAC address, dan VLAN range (1–4094).
   - Sinkronisasi instan antara state aplikasi (`state-manager.js`) dan tampilan canvas Konva.

---

## 2. Struktur Modul & File Tahap 2

File dan modul baru yang akan diimplementasikan pada tahap ini:

```text
network-map-interaktif/
├── docs/
│   ├── phase-1-implementation-plan.md   # Rencana tahap 1
│   └── phase-2-implementation-plan.md   # Rencana tahap 2 (file ini)
└── js/
    ├── devices/
    │   ├── device-schema.js             # Skema data, default values & validator (IP, MAC, VLAN)
    │   ├── device-library.js            # Definisi katalog perangkat, kategori, dan icon mapping
    │   ├── device-renderer.js           # Engine render Konva.Group untuk marker perangkat & status
    │   └── device-manager.js            # Logika CRUD perangkat (add, update, delete, duplicate, query)
    └── ui/
        ├── device-palette.js            # Komponen UI katalog perangkat di Left Sidebar (drag source)
        └── properties-panel.js          # Komponen UI form inspeksi & edit di Right Sidebar
```

---

## 3. Rincian Teknis & Arsitektur Modul

### 3.1 Skema Data Perangkat (`device-schema.js`)
Struktur data tunggal perangkat mengikuti spesifikasi PRD Section 6.3:

```javascript
export const DeviceSchema = {
  create(params = {}) {
    const id = params.id || `dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
    return {
      id: id,
      name: params.name || 'New Device',
      type: params.type || 'router',           // router, switch, ap, server, cctv, dll.
      category: params.category || 'core',     // core, distribution, infrastructure, end-device
      brand: params.brand || '',
      model: params.model || '',
      position: {
        x: params.position?.x ?? 0.5,          // 0.0000 - 1.0000
        y: params.position?.y ?? 0.5           // 0.0000 - 1.0000
      },
      network: {
        ip: params.network?.ip || '',
        mac: params.network?.mac || '',
        subnet: params.network?.subnet || '255.255.255.0',
        vlan: params.network?.vlan || 1,
        hostname: params.network?.hostname || ''
      },
      status: params.status || 'unknown',      // online, offline, warning, unknown
      location: params.location || '',
      firmware: params.firmware || '',
      installedAt: params.installedAt || new Date().toISOString().split('T')[0],
      notes: params.notes || '',
      createdAt: params.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
};
```

### 3.2 Katalog & Definisi Visual Perangkat (`device-library.js`)
Setiap tipe perangkat memiliki metadata visual yang konsisten:
- **Ikon Lucide:**
  - Router: `router`
  - Switch: `network`
  - Access Point: `wifi`
  - Server: `server`
  - CCTV: `camera`
  - Firewall: `shield`
  - Rack: `server-rack` / `layers`
  - Network Pole / ODP: `radio-tower` / `box`
- **Warna Aksen Kategori:**
  - Core Network: Blue Accent (`#3b82f6`)
  - Network Distribution: Cyan/Teal (`#06b6d4`)
  - Infrastructure: Orange/Amber (`#f59e0b`)
  - End Devices: Emerald/Green (`#10b981`)
- **Status Colors:**
  - Online: `#22c55e` (Green)
  - Offline: `#ef4444` (Red)
  - Warning: `#f59e0b` (Amber/Yellow)
  - Unknown: `#64748b` (Slate Gray)

### 3.3 Anatomi Marker Konva (`device-renderer.js`)
Setiap marker dirender sebagai `Konva.Group`:
```text
┌─────────────────────────────────┐
│         Konva.Group             │
│  ┌───────────────────────────┐  │
│  │ Base Shape (Circle/Rect)  │  │
│  │   [Lucide Device Icon]    │  │
│  │                           │  │
│  │          (●) Status Badge │  │
│  └───────────────────────────┘  │
│      [ Device Name Label ]      │
│      [   192.168.1.1     ]      │
└─────────────────────────────────┘
```
- **Optimasi Kinerja (200+ Marker):**
  - Menggunakan icon rendering berbasis path canvas atau SVG pre-cached Image agar tidak memberatkan DOM.
  - Layer redraw terbatas: hanya `deviceLayer.batchDraw()` saat perangkat bergerak, bukan redraw keseluruhan stage.
  - Ukuran marker diatur tetap proporsional (konstan di layar) atau scaling adaptif saat zoom in/out.

### 3.4 Mekanisme Drag-and-Drop dari HTML ke Konva Canvas
1. Elemen di Left Sidebar memiliki atribut `draggable="true"`.
2. Event `dragstart` menyimpan data tipe perangkat (`dataTransfer.setData('device-type', type)`).
3. Kontainer Canvas menangani event `dragover` (`e.preventDefault()`) dan `drop`.
4. Pada saat `drop`:
   - Ambil koordinat pointer mouse dari layar.
   - Konversi koordinat layar ke koordinat stage Konva.
   - Konversi koordinat stage ke *Normalized Coordinates* $(0-1)$ denah.
   - Panggil `DeviceManager.addDevice(...)`.
   - Render marker baru di `deviceLayer`.
   - Buka panel properti perangkat yang baru dibuat.

### 3.5 Interaksi Properties Panel (`properties-panel.js`)
- Panel di sisi kanan akan otomatis memunculkan data dari perangkat yang sedang aktif/dipilih (`activeDeviceId`).
- Input formulir menggunakan event `input`/`change` dengan debounce atau tombol **"Save Changes"**.
- Perubahan properti langsung mengupdate visual marker (misalnya: nama label berubah, atau warna status indicator berubah jika status diubah dari Unknown ke Online).

---

## 4. Rincian Langkah Kerja (Step-by-Step Breakdown)

| Langkah | Item Pekerjaan | Output / Deliverable |
|:---|:---|:---|
| **Langkah 1** | Skema Data & Validasi Perangkat | File `js/devices/device-schema.js` dengan model data lengkap dan helper validasi IP/MAC/VLAN. |
| **Langkah 2** | Katalog Perangkat & Icon Registry | File `js/devices/device-library.js` berisi daftar 20+ tipe perangkat, kategori, dan pemetaan ikon Lucide. |
| **Langkah 3** | Komponen Palette Perangkat di Sidebar | File `js/ui/device-palette.js` untuk merender daftar kartu perangkat yang dapat di-drag dari sidebar kiri. |
| **Langkah 4** | Engine Render Marker Konva | File `js/devices/device-renderer.js` untuk menggambar marker perangkat, label nama, IP, dan badge status di `deviceLayer`. |
| **Langkah 5** | Interaksi Drag & Drop ke Canvas | Penanganan drop event pada viewport peta, konversi koordinat, dan auto-placement perangkat baru. |
| **Langkah 6** | Manipulasi Marker di Canvas (Drag, Move, Select) | Kemampuan memindahkan marker perangkat dengan drag-and-drop di canvas, hover tooltip, dan highlight saat dipilih. |
| **Langkah 7** | Panel Properti Perangkat (Right Sidebar) | File `js/ui/properties-panel.js` berisi formulir edit lengkap, tombol duplikasi, dan tombol hapus perangkat. |
| **Langkah 8** | Device Manager & State Integration | File `js/devices/device-manager.js` untuk mengelola array perangkat dalam state terpusat, event dispatching (`device:added`, `device:updated`, `device:deleted`). |
| **Langkah 9** | Verifikasi & Pengujian Beban Marker | Pengetesan CRUD perangkat, persistensi koordinat, dan rendering mulus hingga 200+ marker marker pada canvas. |

---

## 5. Kriteria Selesai (Definition of Done — Tahap 2)

Tahap 2 dinyatakan selesai jika memenuhi checklist berikut:
- [ ] Tersedia katalog perangkat lengkap (Core, Distribution, Infrastructure, End Devices) di Sidebar Kiri dengan ikon visual yang jelas.
- [ ] Pengguna dapat menambahkan perangkat ke peta melalui drag-and-drop dari sidebar maupun mode klik pada peta.
- [ ] Marker perangkat muncul di canvas pada layer perangkat (`deviceLayer`) dengan ikon, label nama, dan status badge yang tepat.
- [ ] Marker perangkat dapat digeser (drag & drop) secara mulus di atas peta, dan posisi barunya tersimpan dalam koordinat ternormalisasi $(0.0000 - 1.0000)$.
- [ ] Mengklik marker perangkat membuka panel properti di sisi kanan dengan data lengkap perangkat terkait.
- [ ] Pengguna dapat mengedit nama, IP address, MAC, VLAN, merek, model, status, dan catatan teknis melalui panel properti.
- [ ] Perubahan properti (seperti nama atau status) langsung terefleksi secara real-time pada tampilan marker di canvas.
- [ ] Perangkat dapat diduplikasi atau dihapus dengan konfirmasi aman.
- [ ] Mengklik area kosong canvas membatalkan seleksi perangkat (deselect) dan menutup panel properti.
- [ ] Kinerja canvas tetap responsif (minimal 50-60 FPS) saat memuat puluhan hingga 200 marker perangkat.

---

## 6. Keterkaitan dengan Tahap Berikutnya

Setelah Tahap 2 selesai dan terverifikasi:
* Data perangkat (`devices[]`) yang tersimpan dengan koordinat valid akan menjadi titik awal (source) dan titik akhir (destination) untuk **Tahap 3: Pemetaan Jalur Kabel (Cable Mapping & Connection Routing)**.
* Properti VLAN, Subnet, dan IP yang diinput pada Tahap 2 akan digunakan langsung untuk **Tahap 4: Visualisasi Topologi Fisik & Logis (Cytoscape.js)**.

