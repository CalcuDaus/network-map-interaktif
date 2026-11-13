# Rencana Implementasi Tahap 4: Topologi Jaringan, Layer Control & Pencarian
**NetMap — Interactive Network Infrastructure Mapper**

*Dokumen Perencanaan Teknis — Fokus: Tahap 4 (Topology Visualization, Layer Management, Search & IP/VLAN Documentation)*  
*Tanggal: 12 November 2026*  
*Status: Ready for Implementation*

---

## 1. Tujuan & Ruang Lingkup Tahap 4

Tahap 4 berfokus pada **pemahaman hubungan arsitektur jaringan secara menyeluruh**, melengkapi peta fisik dengan **visualisasi topologi terstruktur (Cytoscape.js & Dagre)**, **kendali visibilitas layer peta (Layer Management)**, **pencarian multi-kriteria pintar dengan navigasi otomatis ke perangkat**, serta **tabel dokumentasi alokasi IP Address dan segmentasi VLAN**.

### Ruang Lingkup (In-Scope):
1. **Visualisasi Topologi Jaringan (Cytoscape.js + Dagre):**
   - Modal/dialog diagram interaktif yang menyajikan dua mode topologi:
     - **Topologi Fisik (Physical Topology):** Menggambarkan hierarki koneksi perangkat berdasarkan kabel riil:  
       `Gateway/ISP` $\rightarrow$ `Core Router` $\rightarrow$ `Core Switch` $\rightarrow$ `Distribution Switch` $\rightarrow$ `Access Points / Servers / End Devices`.
     - **Topologi Logis (Logical Topology):** Mengelompokkan perangkat dalam klaster logis berdasarkan **VLAN ID** dan **Network Subnet/CIDR** menggunakan compound/parent nodes di Cytoscape.
   - Tata letak otomatis hirarkis menggunakan algoritma **Dagre Layout** (*directed graph layout*).
   - Fitur topologi: Zoom, Pan, Fit, Search node di dalam diagram, dan Ekspor diagram topologi ke gambar (PNG/SVG).
2. **Manajemen Layer Peta (Layer Management):**
   - Panel toggle layer di Sidebar Kiri untuk menampilkan atau menyembunyikan komponen visual secara independen tanpa menghapus data:
     - `[x] Denah Latar Belakang (Background)`
     - `[x] Objek Bangunan & Fasilitas (Buildings)`
     - `[x] Seluruh Perangkat Jaringan (Network Devices)`
     - `[x] Jalur Kabel UTP / Ethernet (Ethernet Cables)`
     - `[x] Jalur Kabel Fiber Optik (Fiber Optic)`
     - `[x] Jalur Nirkabel (Wireless Links)`
     - `[x] Kamera CCTV & NVR (CCTV Systems)`
     - `[x] Infrastruktur (Rack, Patch Panel, Tiang)`
     - `[x] Label & Anotasi Teks (Labels & Text)`
   - Visibilitas layer diterapkan langsung pada layer Konva (`layer.visible(boolean)`) atau filtering rendering node.
3. **Sistem Pencarian Cepat & Filter Multi-Kriteria (Smart Search & Filter):**
   - Kotak pencarian global di Toolbar Atas / Sidebar Kiri dengan auto-complete suggestions.
   - Pencarian cerdas mencakup:
     - Nama Perangkat (`name`)
     - Device ID (`id`)
     - IP Address (`ip`)
     - MAC Address (`mac`)
     - VLAN ID (`vlan`)
     - Kategori & Tipe (`category`, `type`)
     - Merek/Vendor (`brand`, `model`)
     - Lokasi fisik (`location`)
     - Status perangkat (`status`: online, offline, warning)
   - **Auto-Pan & Viewport Navigation:** Saat pengguna memilih salah satu hasil pencarian, viewport peta bergeser dan melakukan zoom secara halus (*smooth tween animation*) langsung berpusat pada marker perangkat terkait, lalu memberikan efek highlight/pulse.
4. **Dokumentasi Terstruktur IP Address & VLAN:**
   - Tabel ringkasan alokasi IP Address: daftar IP terpakai, IP kosong (jika ada rentang), gateway, subnet mask, perangkat pemilik, dan status.
   - Tabel segmentasi VLAN: daftar VLAN ID, VLAN Name, jumlah perangkat terhubung, dan subnet terkait.

---

## 2. Struktur Modul & File Tahap 4

File dan modul baru yang akan diimplementasikan pada tahap ini:

```text
network-map-interaktif/
├── docs/
│   ├── phase-1-implementation-plan.md
│   ├── phase-2-implementation-plan.md
│   ├── phase-3-implementation-plan.md
│   └── phase-4-implementation-plan.md   # Rencana tahap 4 (file ini)
└── js/
    ├── topology/
    │   ├── topology-generator.js        # Konversi data internal (devices & cables) ke format Cytoscape elements
    │   ├── topology-layout.js           # Konfigurasi Dagre hierarchical layout (direction, spacing, ranking)
    │   └── topology-modal.js            # Komponen UI modal fullscreen untuk diagram topologi fisik & logika
    ├── search/
    │   ├── search-engine.js             # Logika indexing, pencarian multi-kriteria & filter predicate
    │   └── search-ui.js                 # Komponen UI input search, dropdown suggestions & filter chips
    └── ui/
        ├── layer-controls.js            # Komponen checklist toggle visibilitas layer di sidebar kiri
        ├── ip-vlan-modal.js             # Modal viewer untuk tabel inventaris IP Address & segmentasi VLAN
        └── viewport-navigator.js        # Utilitas animasi halus (Konva.Tween) pan & zoom ke koordinat target
```

---

## 3. Rincian Teknis & Arsitektur Modul

### 3.1 Integrasi Cytoscape.js & Dagre (`topology-generator.js` & `topology-layout.js`)
Diagram topologi menggunakan data aktif dari `DeviceManager` dan `CableManager`:
1. **Transformasi Node:**
   ```javascript
   const nodes = devices.map(dev => ({
     data: {
       id: dev.id,
       label: `${dev.name}\n${dev.network.ip || ''}`,
       type: dev.type,
       category: dev.category,
       status: dev.status,
       parent: mode === 'logical' ? `vlan-${dev.network.vlan}` : undefined
     }
   }));
   ```
2. **Transformasi Edge (Koneksi):**
   ```javascript
   const edges = connections.map(conn => ({
     data: {
       id: conn.id,
       source: conn.source,
       target: conn.destination,
       label: conn.cableCategory.toUpperCase(),
       category: conn.cableCategory,
       status: conn.status
     }
   }));
   ```
3. **Konfigurasi Dagre Layout:**
   - Mengatur hierarki otomatis dengan urutan ranking:
     - Rank 1: Firewall / Gateway / Main Router
     - Rank 2: Core Switch
     - Rank 3: Distribution / PoE Switches
     - Rank 4: Access Points / Server
     - Rank 5: End Devices (CCTV, PC, IP Phone, Printer)
   - Layout parameters: `rankDir: 'TB'` (Top to Bottom), `nodeSep: 50`, `rankSep: 80`.

### 3.2 Modal Diagram Topologi (`topology-modal.js`)
- Disediakan tombol **"Network Topology"** di Toolbar Atas.
- Membuka modal berukuran besar / layar penuh (full-screen overlay).
- Toolbar internal di dalam modal:
  - Tab Switch: **[Physical Topology]** vs **[Logical Topology (VLAN)]**.
  - Tombol **Fit View**, **Zoom In**, **Zoom Out**.
  - Tombol **Export PNG/SVG** (menggunakan API built-in Cytoscape `cy.png()` / `cy.svg()`).
  - Klik pada node topologi memberikan opsi untuk menutup modal dan melompat langsung ke perangkat terkait pada denah peta.

### 3.3 Manajemen Layer Peta (`layer-controls.js`)
Konva menyediakan pemisahan layer yang terisolasi. Pengaturan visibilitas diimplementasikan secara efisien:
- Layer fisik Konva:
  - `bgLayer.visible(state.layers.background)`
  - `buildingLayer.visible(state.layers.buildings)`
  - `infrastructureLayer.visible(state.layers.infrastructure)`
  - `deviceLayer.visible(state.layers.devices)`
  - `connectionLayer.visible(state.layers.connections)`
  - `annotationLayer.visible(state.layers.annotations)`
- Filtering berbasis tipe (sub-layer):
  - Jika pengguna mematikan checkbox **CCTV**, objek marker dengan `type === 'cctv'` pada `deviceLayer` disembunyikan.
  - Jika pengguna mematikan checkbox **Fiber Optic**, garis kabel dengan `cableCategory.includes('fiber')` pada `connectionLayer` disembunyikan.
  - Perubahan visibilitas hanya memicu `batchDraw()` pada layer terkait tanpa reload canvas.

### 3.4 Mesin Pencarian & Navigasi Viewport (`search-engine.js` & `viewport-navigator.js`)
1. **Search Indexing:**
   Pencarian melakukan tokenisasi terhadap query pengguna dan mencocokkannya dengan field: `name`, `id`, `network.ip`, `network.mac`, `network.vlan`, `brand`, `model`, `location`.
2. **Animasi Auto-Pan & Zoom (Smooth Viewport Navigation):**
   Ketika item hasil pencarian diklik:
   ```javascript
   export function focusOnDevice(stage, device, mapImageDimensions) {
     const targetX = device.position.x * mapImageDimensions.width;
     const targetY = device.position.y * mapImageDimensions.height;
     const targetScale = 1.5; // Zoom yang ideal untuk inspeksi

     const viewportWidth = stage.width();
     const viewportHeight = stage.height();

     const newStageX = viewportWidth / 2 - targetX * targetScale;
     const newStageY = viewportHeight / 2 - targetY * targetScale;

     // Animasi halus menggunakan Konva.Tween
     new Konva.Tween({
       node: stage,
       duration: 0.6,
       easing: Konva.Easings.EaseInOut,
       x: newStageX,
       y: newStageY,
       scaleX: targetScale,
       scaleY: targetScale,
       onFinish: () => {
         // Sorot marker & buka panel properti
         EventBus.emit('device:selected', device.id);
       }
     }).play();
   }
   ```

### 3.5 Modal Dokumentasi IP & VLAN (`ip-vlan-modal.js`)
- Tab **IP Address Manager (IPAM):**
  - Tabel interaktif yang mengurutkan alamat IP secara numerik (natural IP sort).
  - Kolom: IP Address, Subnet, Device Name, Device Type, Status, Lokasi.
  - Filter pencarian cepat dalam tabel.
- Tab **VLAN Segmentasi:**
  - Kartu / accordion per VLAN ID (misal: VLAN 10 - Management, VLAN 20 - Staff, VLAN 30 - Guest WiFi, VLAN 100 - CCTV).
  - Menampilkan jumlah perangkat di tiap VLAN dan total konsumsi IP.

---

## 4. Rincian Langkah Kerja (Step-by-Step Breakdown)

| Langkah | Item Pekerjaan | Output / Deliverable |
|:---|:---|:---|
| **Langkah 1** | Panel Kontrol Layer di Sidebar Kiri | File `js/ui/layer-controls.js` dengan checkbox toggle visibilitas layer dan sub-kategori (CCTV, FO, Wireless). |
| **Langkah 2** | Integrasi Visibilitas Layer ke Konva Engine | Handler reaktif untuk menampilkan/menyembunyikan Konva Layers dan node filtered tanpa kehilangan state data. |
| **Langkah 3** | Engine Pencarian Multi-Kriteria | File `js/search/search-engine.js` untuk pencarian instan nama, ID, IP, MAC, VLAN, merek, dan status perangkat. |
| **Langkah 4** | Komponen UI Search & Suggestion Dropdown | File `js/search/search-ui.js` di Toolbar/Sidebar dengan hasil pencarian interaktif dan penandaan kategori. |
| **Langkah 5** | Utilitas Animasi Navigasi Viewport (Auto-Pan) | File `js/ui/viewport-navigator.js` berbasis `Konva.Tween` untuk memusatkan kamera secara mulus ke perangkat hasil pencarian. |
| **Langkah 6** | Generator Model Graf Topologi Cytoscape | File `js/topology/topology-generator.js` yang mengonversi daftar perangkat dan koneksi menjadi node & edge Cytoscape. |
| **Langkah 7** | Tata Letak Hirarkis Topologi (Dagre Layout) | File `js/topology/topology-layout.js` untuk pengaturan hierarki otomatis dari Gateway ke Core, Distribution, hingga End Devices. |
| **Langkah 8** | Modal Interaktif Topologi (Fisik & Logis) | File `js/topology/topology-modal.js` dengan dukungan tab Physical/Logical, zoom/pan topologi, dan ekspor gambar. |
| **Langkah 9** | Modal Dokumentasi Tabel IP & VLAN | File `js/ui/ip-vlan-modal.js` berisi tabel ringkasan inventaris IP Address dan segmentasi VLAN terstruktur. |
| **Langkah 10**| Verifikasi & Pengujian Integrasi | Pengujian konsistensi data antara peta kanvas, topologi Cytoscape, pencarian, dan tabel IP/VLAN. |

---

## 5. Kriteria Selesai (Definition of Done — Tahap 4)

Tahap 4 dinyatakan selesai jika memenuhi checklist berikut:
- [ ] Pengguna dapat menyalakan/mematikan visibilitas layer (Denah, Perangkat, Jalur Kabel, CCTV, FO, Label) secara instan melalui sidebar layer controls.
- [ ] Sistem pencarian mampu menemukan perangkat secara akurat berdasarkan Nama, IP Address, MAC Address, VLAN, tipe, maupun status.
- [ ] Memilih perangkat dari hasil pencarian otomatis menggerakkan kamera peta (*smooth pan & zoom*) tepat ke tengah perangkat dengan efek sorotan visual.
- [ ] Modal Topologi Jaringan dapat dibuka melalui tombol toolbar.
- [ ] Topologi Fisik menampilkan hierarki relasi antarperangkat secara rapi menggunakan Cytoscape.js & Dagre.
- [ ] Topologi Logis mengelompokkan perangkat berdasarkan segmentasi VLAN / Subnet secara visual.
- [ ] Diagram topologi dapat di-export ke format gambar (PNG).
- [ ] Tabel dokumentasi IP Address dan VLAN menyajikan alokasi jaringan secara rapi, terurut, dan mudah dibaca.
- [ ] Perubahan data perangkat atau kabel di peta langsung terbarui secara otomatis pada visualisasi topologi dan tabel dokumentasi.

---

## 6. Keterkaitan dengan Tahap Berikutnya

Setelah Tahap 4 selesai dan terverifikasi:
* Seluruh data perangkat, rute kabel, layer state, konfigurasi topologi, dan tabel IP/VLAN yang telah terstruktur secara matang akan disimpan secara persisten dan diekspor ke berbagai format pada **Tahap 5: Penyimpanan Lokal Offline-First (IndexedDB), Backup & Restore JSON, serta Ekspor Laporan (PDF, CSV, PNG)**.

