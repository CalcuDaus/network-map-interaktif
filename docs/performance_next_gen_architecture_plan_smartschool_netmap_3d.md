# Performance & Next-Gen Architecture Plan — SmartSchool NetMap 3D

Dokumen ini adalah panduan teknis (*engineering plan*) untuk mengoptimalkan performa aplikasi **SmartSchool NetMap 3D** (`heatmap.smknegeri1beringin.sch.id`) ke level paling mutakhir di ekosistem web 3D modern. Fokus utamanya adalah menjaga aplikasi tetap stabil di **60–120 FPS**, baik di PC lab sekolah (tanpa GPU diskrit / iGPU) maupun di ponsel siswa saat menggunakan kontrol joystick virtual.

---

## 0. Audit Bottleneck dari Kondisi Saat Ini

Berdasarkan fitur yang sudah berjalan pada aplikasi saat ini, terdapat lima titik rawan *bottleneck* terbesar seiring bertambahnya jumlah gedung, perangkat jaringan, dan kabel:

1. **Ledakan Draw Calls dari Library `.GLB`**: Fitur *drag & drop* serta mode `Multi` untuk 12+ perangkat `.GLB` (MikroTik RB1100AHx4, Ruijie RG-EW1200G PRO, TP-Link TL-SG1024D, HPE ProLiant DL380p Gen8, dll.) akan dengan cepat memicu ratusan hingga ribuan *draw calls* jika setiap perangkat di-*clone* sebagai `Mesh` biasa.
2. **Raycasting & Collision Berat di `Mode Teknisi`**: Interaksi `WASD`, buka pintu (`E`), membidik alat (`E`), menarik kabel 3D + pasang klem di dinding (`C`), dan mendeteksi perangkat terdekat (`F`) akan membebani *main thread* jika melakukan *raycast* terhadap seluruh geometri gedung pada setiap *frame*.
3. **Beban Bayangan & Lighting Statis**: Lingkungan kampus (gedung, pohon, lampu taman, jalan, rumput) sebagian besar bersifat statis, namun merender ulang *shadow map* setiap *frame* memboroskan 30–50% waktu GPU.
4. **Komputasi Simulasi di Main Thread**: Menjalankan logika `Simulasi & CLI`, `WinBox`, `Ping 3D`, `Jobsheet`, serta kalkulasi *Wi-Fi Heatmap* di *thread* yang sama dengan *render loop* akan memicu *micro-stutter* (*jank*).
5. **Toggle `X-Ray` & 9 `Layers`**: Mengubah material atau visibilitas objek satu per satu lewat rekursi `scene.traverse()` memicu lonjakan CPU (*CPU spike*) dan *shader recompilation*.

### Target Metrik Performa ("Gila" Standard)

| Metrik | Target PC Lab (iGPU) | Target Mobile (Mid-Range) |
| :--- | :--- | :--- |
| **Frame Rate** | Stabil 60–120 FPS | Stabil 60 FPS |
| **Frame Time** | $< 8\text{–}16\text{ ms}$ | $< 16.6\text{ ms}$ |
| **Draw Calls** | $< 80$ per frame | $< 50$ per frame |
| **Initial Load** | $< 2.5$ detik (LAN/4G) | $< 3.5$ detik |
| **GC Pause / Stutter** | $0\text{ ms}$ saat jalan & tarik kabel | $0\text{ ms}$ |

---

## Fase 1: Next-Gen GPU Rendering Pipeline (Dampak Terbesar)

### 1.1 WebGPU-First dengan Fallback WebGL2 + TSL
Gunakan *pipeline renderer* modern (`WebGPURenderer` di Three.js versi terbaru dengan *fallback* otomatis ke WebGL2) serta **TSL (Three Shading Language)** agar *shader* berjalan *native* di WGSL maupun GLSL.
- [ ] Aktifkan `WebGPURenderer` sebagai *default* untuk memangkas *CPU overhead* pada *draw call submission*.
- [ ] Pindahkan perhitungan **Wi-Fi Heatmap** dan visualisasi partikel **Ping 3D** ke **Compute Shaders** (WebGPU) atau *GPU Texture Ping-Pong* (*fallback* WebGL2), sehingga kalkulasi propagasi sinyal menembus dinding berlangsung di GPU dalam hitungan mikrodetik.

### 1.2 `BatchedMesh` & `InstancedMesh` untuk Perangkat & Infrastruktur
- [ ] **Objek Identik (`InstancedMesh`)**: Gunakan 1 `InstancedMesh` per jenis aset berulang: pohon, tiang lampu taman, jendela, kursi/meja lab, klem kabel dinding, serta perangkat `.GLB` yang dipasang massal via mode `Multi` (misalnya 30 unit Ruijie AP = cukup **1 draw call**).
- [ ] **Objek Beragam (`BatchedMesh`)**: Gabungkan geometri perangkat berbeda yang memiliki material PBR seragam (misal semua switch TP-Link, router MikroTik, dan server HPE ProLiant) ke dalam `THREE.BatchedMesh`. Fitur ini memungkinkan *per-instance frustum culling* dan *color/highlight* (saat dibidik di `Mode Teknisi`) dalam **1 draw call tunggal**.
- [ ] **Kabel 3D GPU-Driven**: Jangan buat ratusan `TubeGeometry` terpisah tiap kali pengguna menekan `C` untuk menarik kabel. Gunakan *instanced cylinder/ribbon segments* antar titik klem, lalu gerakkan animasi aliran paket `Ping 3D` menggunakan *UV scrolling* di *fragment shader* (0% beban CPU).

### 1.3 On-Demand Shadow Mapping & Baked Lighting
- [ ] Matikan pembaruan bayangan tiap *frame* dan perbarui hanya saat ada perubahan objek:
  ```javascript
  renderer.shadowMap.autoUpdate = false;
  // Panggil baris di bawah secara manual HANYA saat gedung diedit, pintu bergerak, atau alat dipindah
  renderer.shadowMap.needsUpdate = true;
  ```
- [ ] Untuk gedung statis, terapkan **Baked Ambient Occlusion (AO)** atau *vertex color shading* ringan bergaya *stylized/voxel* agar visual tetap tajam tanpa mengandalkan banyak lampu *real-time*.

---

## Fase 2: Sub-Millisecond Raycasting & Physics (`three-mesh-bvh`)

Saat karakter `@admin` berjalan (`WASD`), membidik perangkat (`E`), menarik kabel dan memasang klem pada dinding (`C`), atau mendekati port (`F`), hindari *raycast* bawaan yang memindai seluruh segitiga secara linear ($O(n)$).

- [ ] **Spatial Acceleration dengan `three-mesh-bvh`**: Bangun struktur *Bounding Volume Hierarchy* untuk seluruh geometri statis bangunan setelah peta selesai dimuat.
  - *Raycast* bidikan *crosshair* untuk pasang klem dinding & seleksi properti turun dari puluhan milidetik menjadi $< 0.1\text{ ms}$ ($O(\log n)$).
- [ ] **Capsule Collision Berbasis BVH**: Gunakan *capsule-vs-BVH collision* ringan untuk karakter `Mode Teknisi` dan `FPP` alih-alih memuat *physics engine* berat (seperti Ammo.js/Cannon.js) yang tidak dibutuhkan untuk game NetMap.
- [ ] **Spatial Hash Grid untuk Proximity Trigger**: Untuk interaksi jarak dekat seperti buka pintu (`E`) dan Quick Config (`F`), simpan koordinat pintu & perangkat dalam *2D Spatial Grid* (berdasarkan koordinat $X, Z$). Periksa hanya sel *grid* di sekitar karakter—jangan melakukan iterasi ke seluruh objek di area sekolah.

---

## Fase 3: Pipeline Optimasi Aset `.GLB` & Kompresi VRAM

Karena aplikasi menyediakan tombol `+ Tambah Perangkat 3D (.GLB)` untuk mengunggah model kustom, optimasi harus berjalan otomatis di sisi *pipeline/server* agar aset mentah tidak merusak performa.

- [ ] **Auto-Optimization Pipeline (`gltf-transform`)**: Setiap `.GLB` baru yang diunggah otomatis diproses oleh *worker*/*backend*:
  1. **Meshopt Compression (`EXT_meshopt_compression`)**: Pilih Meshopt dibanding Draco untuk perangkat yang sering di-*spawn* dinamis karena proses dekode WebAssembly-nya jauh lebih cepat dan tidak membuat layar membeku (*frame hitch*).
  2. **Tekstur KTX2 / Basis Universal**: Konversi semua tekstur PNG/JPG di dalam `.GLB` ke format `.ktx2` (ETC1S/UASTC). Tekstur tetap terkompresi di dalam **VRAM GPU**, memangkas penggunaan memori grafis hingga **75–85%**.
  3. **Texture Atlas untuk Lingkungan**: Gabungkan seluruh tekstur gedung (tembok hijau, kusen, jendela, pintu, paving, rumput) ke dalam 1 *Texture Atlas* sehingga seluruh blok kampus bisa dirender menggunakan 1 material yang sama.
- [ ] **Hierarchical LOD (Level of Detail)**:
  - `LOD 0` (jarak $< 4\text{ m}$, saat FPP / konfigurasi port `F`): Model detail penuh dengan port RJ45/SFP dan indikator LED.
  - `LOD 1` (jarak $4\text{ m} \text{–} 20\text{ m}$): Geometri disederhanakan 70% tanpa detail port kecil.
  - `LOD 2` (jarak $> 20\text{ m}$, mode `Orbit` overview): *Box proxy* sederhana dengan tekstur ikon/warna status perangkat.
- [ ] **IndexedDB Asset Caching**: Simpan `.GLB` yang sudah dikompresi di `IndexedDB` browser dengan *version hash*. Saat siswa membuka aplikasi kedua kalinya, seluruh *library* perangkat dimuat instan secara lokal tanpa mengunduh ulang.

---

## Fase 4: Multi-Threading & Zero-GC Game Loop

JavaScript bersifat *single-threaded*. Memisahkan *simulation engine* dari *rendering thread* adalah standar paling mutakhir pada game web modern.

### 4.1 Arsitektur Dual-Thread (Main Thread vs Web Workers)

```text
[ Main Thread (100% Fokus Rendering & Input) ]
  ├── Pointer Lock / WASD / Joystick Input
  ├── Three.js / WebGPU Render Loop (60-120 FPS)
  └── Overlay UI (Library, Properti, Layers, WinBox/CLI Modal)
          ▲                        │
          │ Float32Array / Events  │ Commands (Add Node, Ping, Edit CLI)
          │ (Zero-Copy Transfer)   ▼
[ Web Worker Thread (Otak Simulasi Jaringan) ]
  ├── Topologi Graph & Routing Engine (MikroTik/Ruijie/VLAN/STP)
  ├── CLI Parser & WinBox State Machine
  ├── Ping / Packet Path Solver & Jobsheet Evaluator
  └── Wi-Fi Signal Attenuation Matrix (Heatmap)
```

- [ ] Pindahkan seluruh logika `Simulasi Jaringan`, `Simulasi & CLI`, `WinBox`, serta evaluasi `Jobsheet` ke dalam **Web Worker**.
- [ ] Gunakan **Structure of Arrays (SoA)** memakai `TypedArray` (`Float32Array`, `Uint8Array`) untuk status paket data & *node* jaringan agar tidak menciptakan ribuan objek JSON sementara tiap detik.

### 4.2 Zero-Allocation Render Loop
- [ ] Audit fungsi `animate(time)` / `tick(dt)`: **dilarang keras** memanggil `new Vector3()`, `new Quaternion()`, `new Matrix4()`, `.map()`, atau `.filter()` di dalam *loop frame*.
- [ ] Pre-alokasikan semua variabel sementara (*scratch variables*) di luar fungsi *loop* untuk meniadakan *Garbage Collection stutter*:
  ```javascript
  const _tempVec = new THREE.Vector3();
  const _tempMat = new THREE.Matrix4();
  const _tempQuat = new THREE.Quaternion();
  ```

---

## Fase 5: GPU-Driven `X-Ray`, `Layers`, & Smart Culling

- [ ] **Shader-Driven `X-Ray` Mode**: Saat tombol `X-Ray` ditekan, jangan mengganti material dinding satu per satu. Cukup ubah 1 nilai *global uniform* `uXRayFactor` ($0.0 \rightarrow 1.0$) pada material bangunan. GPU langsung merender dinding menjadi transparan/*wireframe* dan menonjolkan jalur kabel + perangkat jaringan dalam 1 *frame* tanpa *CPU overhead*.
- [ ] **Bitmask `Layers` (9 Layer)**: Petakan 9 *layer* di panel kanan langsung ke `THREE.Layers` *bitmask* (`camera.layers.toggle(layerIndex)`). Mematikan *layer* tidak perlu memodifikasi `visible` tiap *mesh* secara manual—*renderer* otomatis melewati objek pada *bitmask* yang nonaktif.
- [ ] **Room / Portal Occlusion Culling**: Kelompokkan isi ruangan (rak server, switch, PC lab) per ruangan. Saat kamera berada di luar ruangan dan mode `X-Ray` mati, matikan *rendering* interior ruangan yang pintunya tertutup atau berada di luar *view frustum*.

---

## Fase 6: Dynamic Resolution Scaling (DRS) & UI Isolation

Agar aplikasi tetap mulus di HP siswa (yang menggunakan *joystick* virtual) maupun laptop lab sekolah:

- [ ] **Adaptive Pixel Ratio (DRS)**:
  - Pantau rata-rata berjalan (*rolling average*) `frameTime` selama 60 *frame*.
  - Jika FPS $< 50$ secara konsisten: turunkan `renderer.setPixelRatio()` bertahap ($\min(\text{dpr}, 2) \rightarrow 1.25 \rightarrow 1.0 \rightarrow 0.75$) dan matikan *anti-aliasing*/*post-processing* berat.
  - Jika FPS stabil $\ge 58$: naikkan kembali resolusi secara bertahap.
- [ ] **Strict UI/Canvas Isolation**: Panel `Library Perangkat`, `Properti`, `Layers`, dan `Tips Cepat` harus terisolasi dari *render loop*. Jangan pernah memicu *re-render* komponen DOM pada 60 FPS; gunakan *debounced event* atau *transient state* saat memperbarui teks posisi/ping di layar.
- [ ] **Strict GPU Memory Disposal**: Setiap kali pengguna menghapus gedung/perangkat di mode `Edit Bangunan` atau mereset peta, panggil `.dispose()` secara eksplisit pada `geometry`, `material`, dan `texture` yang tidak lagi direferensikan di *cache*.

---

## Urutan Eksekusi (Roadmap 4 Sprint)

| Sprint | Fokus Utama | Dampak Langsung yang Terasa |
| :--- | :--- | :--- |
| **Sprint 1 (Quick Wins)** | `shadowMap.autoUpdate = false`, Zero-Allocation Loop, batasi `pixelRatio`, `THREE.Layers` bitmask, & *Texture Atlas* bangunan | FPS langsung naik **40–70%** dengan perubahan kode minimal |
| **Sprint 2 (Geometry & Raycast)** | Implementasi `InstancedMesh` / `BatchedMesh` untuk perangkat `.GLB` & klem kabel + `three-mesh-bvh` untuk `Mode Teknisi` | Bisa menaruh ratusan perangkat & kabel tanpa *drop* FPS; klik & jalan mulus total |
| **Sprint 3 (Asset & Worker)** | Pipeline kompresi `Meshopt` + `KTX2` + `IndexedDB` cache + pindahkan engine `Simulasi & CLI` / `Heatmap` ke Web Worker | *Loading* awal instan di jaringan sekolah; simulasi jaringan 0% mengganggu FPS |
| **Sprint 4 (Next-Gen Polish)** | Migrasi `WebGPURenderer` + TSL *shader* untuk `X-Ray`, animasi paket `Ping 3D` di GPU, & Dynamic Resolution Scaling (DRS) | Performa kelas *AAA Web Engine* di desktop maupun *mobile* |