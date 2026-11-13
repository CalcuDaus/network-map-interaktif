# PRD — Network Infrastructure Mapping & Documentation System

**Project Name:** NetMap — Interactive Network Infrastructure Mapper  
**Document Version:** 1.0  
**Status:** Initial Product Specification  
**Platform:** Web Application  
**Primary Language:** HTML, CSS, JavaScript  
**Development Philosophy:** Lightweight, Fast, Modular, Offline-First

---

# 1. Product Overview

## 1.1 Background

Pengelolaan infrastruktur jaringan di suatu area atau lingkungan sering kali memiliki kendala dalam dokumentasi perangkat, jalur kabel, koneksi antarperangkat, dan lokasi fisik instalasi.

Dokumentasi yang hanya berupa spreadsheet, gambar statis, atau diagram konvensional menyulitkan teknisi untuk mengetahui kondisi jaringan secara menyeluruh.

NetMap hadir sebagai aplikasi web interaktif yang menggunakan denah lokasi sebagai visualisasi utama untuk memetakan infrastruktur jaringan secara visual dan terstruktur.

Pengguna dapat mengklik bangunan, menambahkan perangkat jaringan, menggambar jalur kabel, menghubungkan perangkat, serta melihat dokumentasi setiap komponen jaringan.

## 1.2 Product Vision

Membangun sistem dokumentasi infrastruktur jaringan berbasis visual yang memungkinkan administrator dan teknisi memahami, mengelola, serta melakukan troubleshooting jaringan melalui satu peta interaktif.

## 1.3 Main Objectives

1. Memvisualisasikan lokasi seluruh perangkat jaringan pada denah.
2. Mendokumentasikan perangkat dan spesifikasi teknisnya.
3. Memvisualisasikan hubungan koneksi antarperangkat.
4. Memetakan jalur kabel jaringan berdasarkan jalur fisik.
5. Menyediakan dokumentasi topologi jaringan secara terstruktur.
6. Mempermudah identifikasi perangkat bermasalah.
7. Menyediakan fitur ekspor dan impor dokumentasi jaringan.

---

# 2. Reference Map

## 2.1 Primary Reference

Gambar denah yang disediakan pengguna menjadi background utama aplikasi.

Karakteristik gambar:
- Tampilan top-down / bird's-eye view.
- Bangunan berwarna biru dan cokelat.
- Jalan berwarna abu-abu.
- Area lingkungan berwarna hijau.
- Lapangan olahraga dan fasilitas umum.
- Pepohonan sebagai elemen visual.

## 2.2 Map Architecture

Peta harus menggunakan pendekatan layered rendering.

Urutan layer dari bawah ke atas:

1. Background Layer — gambar denah asli.
2. Building Layer — objek bangunan.
3. Infrastructure Layer — lokasi tiang, ducting, jalur kabel, dan fasilitas jaringan.
4. Network Device Layer — router, switch, access point, server, CCTV, dan perangkat lainnya.
5. Connection Layer — garis koneksi dan jalur kabel.
6. Annotation Layer — label, nomor identifikasi, dan informasi.
7. Interaction Layer — selection, hover, drawing, dan editing.

Setiap layer harus dapat diaktifkan atau dinonaktifkan secara independen.

**Important:** Background map tidak boleh berubah ketika pengguna menambahkan atau mengedit perangkat jaringan.

## 2.3 Coordinate System

Gunakan normalized coordinates agar posisi objek tetap konsisten pada berbagai resolusi layar.

Contoh:

```javascript
{
  id: "device-001",
  type: "access-point",
  position: {
    x: 0.45,
    y: 0.32
  }
}
```

Nilai X dan Y berada pada rentang 0–1.

Dengan demikian, posisi perangkat dapat disesuaikan terhadap ukuran asli gambar tanpa bergantung pada resolusi monitor.

---

# 3. Core Features

## 3.1 Interactive Map

Fitur utama aplikasi.

Requirements:

- Menampilkan denah sebagai background.
- Zoom in dan zoom out.
- Pan atau menggeser peta.
- Zoom menggunakan scroll mouse.
- Fit map to screen.
- Reset map position.
- Menampilkan tooltip ketika perangkat diarahkan.
- Klik objek untuk membuka detail.
- Drag and drop perangkat.
- Multi-selection jika diperlukan.
- Mendukung layar desktop dan tablet.

Interaction modes:

- Navigate Mode
- Select Mode
- Add Device Mode
- Draw Cable Mode
- Edit Mode
- Delete Mode

## 3.2 Network Device Management

Pengguna dapat menambahkan perangkat jaringan melalui toolbar atau context menu.

Device categories:

### Core Network
- Router
- Main Router
- Core Switch
- Distribution Switch
- Firewall
- Gateway

### Network Distribution
- Managed Switch
- Unmanaged Switch
- PoE Switch
- Access Point
- Wireless Bridge
- Repeater

### Infrastructure
- Network Rack
- Patch Panel
- ODP
- ODC
- Fiber Optic Terminal
- Network Pole

### End Devices
- CCTV
- NVR
- Server
- Computer
- Printer
- IP Phone
- IoT Device

Setiap perangkat harus memiliki identitas visual atau icon tersendiri.

## 3.3 Device Information

Ketika perangkat diklik, tampilkan panel detail perangkat.

Data yang harus tersedia:

| Field | Description |
|---|---|
| Device ID | Unique identifier |
| Device Name | Nama perangkat |
| Category | Kategori perangkat |
| Brand | Merek perangkat |
| Model | Model perangkat |
| IP Address | IP perangkat |
| MAC Address | MAC address |
| Location | Lokasi fisik |
| Status | Online, Offline, Unknown |
| Hostname | Hostname perangkat |
| VLAN | VLAN perangkat |
| Subnet | Network subnet |
| Firmware | Versi firmware |
| Installation Date | Tanggal instalasi |
| Notes | Catatan teknis |

Tambahkan fitur:
- Edit device.
- Delete device.
- Duplicate device.
- View connection.
- View device history.

Data sensitif seperti password dan credential tidak boleh ditampilkan secara terbuka atau disimpan dalam plaintext.

## 3.4 Cable Mapping

Fitur untuk menggambarkan jalur kabel pada denah.

Cable types:

- UTP Cat5e
- UTP Cat6
- UTP Cat6A
- Fiber Optic Single Mode
- Fiber Optic Multi Mode
- Wireless Link
- Coaxial

Cable attributes:

- Cable ID
- Cable Name
- Cable Type
- Source Device
- Destination Device
- Cable Length
- Installation Route
- Cable Status
- Notes

Interaction:

1. Pilih Draw Cable Mode.
2. Pilih perangkat sumber.
3. Tentukan titik-titik jalur kabel.
4. Pilih perangkat tujuan.
5. Simpan koneksi.
6. Tampilkan garis kabel pada peta.

Gunakan warna berbeda berdasarkan jenis kabel atau statusnya.

Pengguna dapat mengedit jalur kabel dengan memindahkan control points.

## 3.5 Network Topology Visualization

Fitur untuk melihat hubungan antarperangkat dalam bentuk diagram topologi.

Sediakan dua visualisasi:

**A. Physical Topology**

Menggambarkan hubungan fisik perangkat dan jalur instalasi.

Contoh:

Internet → Main Router → Core Switch → Distribution Switch → Access Point

**B. Logical Topology**

Menggambarkan hubungan logis jaringan, misalnya:
- VLAN.
- Subnet.
- IP Address.
- Gateway.
- Routing relationships.
- Network segments.

Pengguna dapat membuka visualisasi topologi melalui tombol khusus pada perangkat.

## 3.6 Network Status

Setiap perangkat mempunyai indikator status:

- Green: Online.
- Red: Offline.
- Yellow: Warning.
- Gray: Unknown.

Status awal dapat diubah secara manual.

Integrasi monitoring otomatis melalui ICMP Ping, SNMP, atau API monitoring merupakan pengembangan tahap berikutnya.

Jangan mengklaim perangkat online hanya berdasarkan keberadaan datanya di peta.

## 3.7 Layer Management

Pengguna dapat mengontrol layer visualisasi.

Contoh:

- [ ] Buildings
- [ ] Network Devices
- [ ] Cable Routes
- [ ] Wireless Links
- [ ] CCTV
- [ ] Fiber Optic
- [ ] Labels
- [ ] Infrastructure

Layer harus dapat dinyalakan dan dimatikan tanpa menghapus data.

## 3.8 Search and Filter

Sediakan pencarian berdasarkan:

- Device Name
- Device ID
- IP Address
- MAC Address
- Device Category
- Building
- Device Status
- VLAN

Ketika hasil pencarian dipilih, peta otomatis mengarahkan viewport ke posisi perangkat terkait.

## 3.9 Documentation and Export

Fitur dokumentasi meliputi:

- Device inventory.
- Cable inventory.
- Network topology.
- IP Address documentation.
- VLAN documentation.
- Device status report.
- Installation notes.

Export formats:

- JSON — backup dan restore seluruh data.
- CSV — inventaris perangkat dan kabel.
- PNG — snapshot peta.
- PDF — laporan dokumentasi.

Import JSON harus memvalidasi struktur data sebelum melakukan perubahan.

---

# 4. User Interface Requirements

## 4.1 Main Layout

Gunakan dashboard dengan tiga area utama.

### A. Left Sidebar

Berisi:
- Device Library.
- Network Components.
- Layer Controls.
- Map Tools.
- Search.

### B. Main Canvas

Berisi:
- Interactive Map.
- Device Markers.
- Cable Routes.
- Building Objects.
- Connection Lines.

### C. Right Properties Panel

Berisi:
- Selected Device Details.
- Device Configuration.
- Connection Information.
- Location Information.
- Technical Notes.

### D. Top Toolbar

Berisi:
- Project Name.
- Save.
- Undo / Redo.
- Zoom Controls.
- Search.
- Export.
- Settings.

## 4.2 Design Direction

Visual direction:

- Modern technical infrastructure dashboard.
- Clean and professional.
- Minimalist interface.
- Dark or light theme support.
- Clear visual hierarchy.
- Avoid excessive gradients.
- Avoid unnecessary animations.
- Prioritize map visibility.

The map should occupy approximately 70–80% of the available working area.

---

# 5. Technology Stack

## 5.1 Core Technologies

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Styling and layout |
| JavaScript ES Modules | Application logic |
| IndexedDB | Local persistent storage |
| LocalStorage | UI preferences |
| JSON | Data interchange |

No frontend framework is required for the initial MVP.

## 5.2 Recommended Libraries

### 1. Konva.js — Primary Canvas Engine

Purpose:
- Interactive 2D map.
- Object selection.
- Drag and drop.
- Layer management.
- Shape rendering.
- Drawing cable routes.
- Zoom and pan.

Website: https://konvajs.org/

Konva.js is the primary recommendation because the reference map is a 2D image and the application requires many interactive objects.

### 2. Lucide

Purpose:
- Device icons.
- Toolbar icons.
- Navigation icons.
- UI controls.

Website: https://lucide.dev/

### 3. Dagre

Purpose:
- Automatic graph layout.
- Network topology arrangement.
- Node positioning.

Website: https://github.com/dagrejs/dagre

### 4. Cytoscape.js

Purpose:
- Physical and logical network topology visualization.
- Node and edge relationships.
- Graph interaction.

Website: https://js.cytoscape.org/

### 5. jsPDF

Purpose:
- Generate PDF reports.
- Device inventory reports.
- Documentation exports.

Website: https://github.com/parallax/jsPDF

### 6. SheetJS

Purpose:
- CSV and spreadsheet import/export.
- Device inventory export.

Website: https://sheetjs.com/

### 7. IDB

Purpose:
- Simplify IndexedDB operations.
- Persist network projects locally.

Website: https://github.com/jakearchibald/idb

## 5.3 Optional Libraries

### Three.js

Website: https://threejs.org/

Three.js is NOT required for MVP.

Potential future applications:
- 3D infrastructure visualization.
- 3D building visualization.
- Network rack visualization.
- 3D cable routing.

Keep Three.js outside the main application bundle until 3D functionality is genuinely needed.

### Leaflet

Website: https://leafletjs.com/

Optional if future development requires geographic maps, GPS coordinates, or integration with real-world geographic data.

It is not necessary for the current static floor-plan reference.

---

# 6. System Architecture

## 6.1 Architecture Principles

- Modular JavaScript.
- Separation of application logic and rendering logic.
- Data-driven rendering.
- Event-based interaction.
- Local-first storage.
- Minimal dependencies.
- Lazy loading for optional modules.

## 6.2 Suggested Folder Structure

```text
netmap/
│
├── index.html
│
├── assets/
│   ├── maps/
│   │   └── campus-map.png
│   ├── icons/
│   └── fonts/
│
├── css/
│   ├── main.css
│   ├── layout.css
│   ├── components.css
│   └── map.css
│
├── js/
│   ├── app.js
│   │
│   ├── core/
│   │   ├── event-bus.js
│   │   ├── state-manager.js
│   │   └── project-manager.js
│   │
│   ├── map/
│   │   ├── map-engine.js
│   │   ├── map-layers.js
│   │   ├── map-interactions.js
│   │   └── coordinate-system.js
│   │
│   ├── devices/
│   │   ├── device-manager.js
│   │   ├── device-renderer.js
│   │   └── device-schema.js
│   │
│   ├── connections/
│   │   ├── cable-manager.js
│   │   └── topology-manager.js
│   │
│   ├── storage/
│   │   ├── database.js
│   │   ├── project-storage.js
│   │   └── import-export.js
│   │
│   ├── ui/
│   │   ├── toolbar.js
│   │   ├── sidebar.js
│   │   ├── properties-panel.js
│   │   └── notification.js
│   │
│   └── utils/
│       ├── helpers.js
│       └── validators.js
│
└── README.md
```

## 6.3 Data Model

### Project

```json
{
  "id": "project-001",
  "name": "Campus Network",
  "map": {
    "image": "campus-map.png",
    "width": 2048,
    "height": 2048
  },
  "devices": [],
  "connections": [],
  "buildings": [],
  "layers": {},
  "updatedAt": "2026-11-12T00:00:00Z"
}
```

### Device

```json
{
  "id": "device-001",
  "name": "Main Router",
  "type": "router",
  "brand": "MikroTik",
  "model": "RB4011",
  "position": {
    "x": 0.45,
    "y": 0.32
  },
  "network": {
    "ip": "192.168.1.1",
    "mac": "",
    "subnet": "192.168.1.0/24",
    "vlan": 1
  },
  "status": "online",
  "notes": ""
}
```

### Connection

```json
{
  "id": "connection-001",
  "source": "device-001",
  "destination": "device-002",
  "type": "ethernet",
  "cableCategory": "cat6",
  "status": "active",
  "route": [
    { "x": 0.45, "y": 0.32 },
    { "x": 0.52, "y": 0.40 },
    { "x": 0.65, "y": 0.45 }
  ],
  "notes": ""
}
```

The source and destination must reference existing device IDs.

---

# 7. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Display background map | Must |
| FR-002 | Zoom and pan map | Must |
| FR-003 | Add network devices | Must |
| FR-004 | Move device markers | Must |
| FR-005 | Edit device properties | Must |
| FR-006 | Delete devices | Must |
| FR-007 | Draw cable connections | Must |
| FR-008 | Display connection information | Must |
| FR-009 | Manage map layers | Must |
| FR-010 | Search devices | Must |
| FR-011 | Save projects locally | Must |
| FR-012 | Import/export JSON | Must |
| FR-013 | Generate topology diagrams | Should |
| FR-014 | Export PDF documentation | Should |
| FR-015 | Device status indicators | Should |
| FR-016 | Undo and redo | Should |
| FR-017 | Automatic network monitoring | Future |
| FR-018 | Multi-user collaboration | Future |
| FR-019 | 3D visualization | Future |

---

# 8. Performance Requirements

Performance is a primary requirement.

Targets:

- Initial application bundle should remain small.
- Target initial JavaScript payload: under 250 KB compressed, excluding the map image and optional libraries.
- Map interaction should remain responsive with 200+ device markers.
- Target 60 FPS during normal pan and zoom on supported desktop hardware.
- Avoid unnecessary full-canvas redraws.
- Use lazy loading for reporting and topology modules.
- Use image optimization where possible.
- Avoid loading Three.js in the MVP.
- Persist data without blocking map interactions.

These are engineering targets and must be validated through actual performance testing.

---

# 9. Data Persistence and Security

## MVP

Use IndexedDB for:
- Project information.
- Device inventory.
- Cable information.
- Map annotations.
- Application configuration.

Use LocalStorage only for:
- Theme preferences.
- Sidebar state.
- Last selected project.

Provide JSON backup and restore.

## Future Backend

If multi-user functionality is required, consider:

- Node.js.
- REST API.
- PostgreSQL.
- Authentication and role-based authorization.

Security requirements:
- Validate imported JSON.
- Prevent arbitrary HTML execution.
- Avoid storing plaintext credentials.
- Validate IP and MAC address formats.
- Implement project backup.
- Restrict access to sensitive network documentation.

---

# 10. Development Roadmap

## Phase 1 — Interactive Map Foundation

Deliverables:
- Application layout.
- Background map integration.
- Zoom and pan.
- Coordinate system.
- Basic map layers.

Acceptance criteria:
- The map can be navigated smoothly.
- The original map image remains unchanged.
- Coordinates remain accurate after zooming and resizing.

## Phase 2 — Device Mapping

Deliverables:
- Device library.
- Add device.
- Drag and drop.
- Device properties panel.
- Device editing and deletion.
- Device status indicators.

Acceptance criteria:
- Users can add and move devices.
- Device positions persist after refreshing.
- Device details can be edited.

## Phase 3 — Cable Mapping

Deliverables:
- Draw cable routes.
- Connect source and destination devices.
- Cable categories.
- Cable editing.
- Connection details.

Acceptance criteria:
- A connection must have valid source and destination devices.
- Cable routes remain attached to their respective devices.
- Invalid connections are rejected.

## Phase 4 — Topology Documentation

Deliverables:
- Physical topology.
- Logical topology.
- VLAN documentation.
- IP address inventory.
- Search and filtering.

Acceptance criteria:
- Users can inspect relationships between network devices.
- Topology changes reflect the underlying connection data.

## Phase 5 — Export and Optimization

Deliverables:
- JSON backup.
- JSON restore.
- CSV export.
- PNG export.
- PDF documentation.
- Performance optimization.

Acceptance criteria:
- Imported projects restore their original device and connection information.
- Exported documentation is readable.
- No major performance degradation with the target dataset.

---

# 11. MVP Scope

The first release must focus on five core capabilities:

1. Display and navigate the provided map.
2. Add, edit, move, and delete network devices.
3. Draw cable routes between devices.
4. Store device and network documentation.
5. Save and restore projects using IndexedDB and JSON.

Do not implement 3D visualization, real-time SNMP monitoring, authentication, or multi-user collaboration in the initial release.

The goal is to deliver a functional and reliable network mapping application before expanding its capabilities.

---

# 12. Definition of Done

The MVP is considered complete when:

- [ ] The provided map is displayed correctly.
- [ ] Users can zoom and pan.
- [ ] Users can add network devices.
- [ ] Device markers can be moved.
- [ ] Device information can be edited.
- [ ] Users can create cable routes.
- [ ] Devices and connections are saved.
- [ ] The project survives browser refresh.
- [ ] JSON export and import work correctly.
- [ ] Search can locate devices.
- [ ] Layer visibility can be controlled.
- [ ] The application remains responsive with at least 200 device markers.
- [ ] No critical errors occur during normal operation.

---

# 13. Final Technical Recommendation

For the first implementation, use:

- HTML5
- CSS3
- Vanilla JavaScript ES Modules
- Konva.js
- Cytoscape.js
- Dagre
- Lucide
- IndexedDB via IDB
- jsPDF
- SheetJS

**Rendering Strategy:**

Use Konva.js as the primary rendering engine for the map and its interactive objects. Use Cytoscape.js for topology diagrams. Load reporting libraries only when required.

**Avoid overengineering.**

The application should begin as a lightweight 2D network documentation tool. Its architecture should allow future integration with network monitoring systems and 3D visualization without requiring a complete rewrite.

**Product Principle:**

"One Map. Complete Network Visibility. Structured Documentation."