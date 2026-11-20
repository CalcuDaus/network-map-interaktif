/**
 * NetMap — Multi-Page PDF Documentation Report Generator (Phase 8E)
 * Builds formal technical documentation using jsPDF & autoTable,
 * including Per-Building Infrastructure Summary, optional 3D X-Ray Campus Snapshot,
 * and 1-Page Printable Room/Rack Documentation Sheet.
 */

import { loadJsPdf } from './lazy-loader.js';
import { SnapshotExporter } from './snapshot-exporter.js';
import { stateManager } from '../core/state-manager.js';
import { buildAllBuildingsSummary } from '../map/room-spatial-index.js';

export class PdfReportGenerator {
  /**
   * Build table rows for Section 3 (Per-Building Infrastructure Summary).
   * Pure helper testable without jsPDF runtime.
   * @param {Object[]} rooms3d
   * @param {Object[]} devices
   * @param {Object[]} connections
   * @param {Object[]} [objects3d=[]]
   * @param {Object} [options={}]
   * @returns {Array<string[]>}
   */
  static buildBuildingsTableRows(rooms3d = [], devices = [], connections = [], objects3d = [], options = {}) {
    const summaries = buildAllBuildingsSummary(rooms3d, devices, connections, objects3d, options);
    return summaries.map((sum) => {
      const r = sum.room;
      const codePrefix = sum.doc.roomCode ? `[${sum.doc.roomCode}] ` : '';
      const statusDetail = `${sum.statusCounts.total} Unit (${sum.statusCounts.online} ON${sum.statusCounts.warning ? `, ${sum.statusCounts.warning} WARN` : ''}${sum.statusCounts.offline ? `, ${sum.statusCounts.offline} OFF` : ''})`;
      const netLines = [
        sum.networkSummary.vlans.length ? `VLAN: ${sum.networkSummary.vlans.join(', ')}` : '',
        sum.networkSummary.ssids.length ? `WiFi: ${sum.networkSummary.ssids.join(', ')}` : ''
      ].filter(Boolean).join(' | ') || '-';
      const cableDetail = `UTP ${sum.cableSummary.utpMeters.toFixed(1)}m | FO ${sum.cableSummary.fiberMeters.toFixed(1)}m (${sum.cableSummary.uplinkCount} uplink)`;
      const lastLog = sum.doc.maintenanceLogs[0];
      const noteText = [
        sum.doc.notes ? sum.doc.notes.slice(0, 90) : '',
        lastLog ? `Log ${lastLog.date}: ${lastLog.summary.slice(0, 65)}` : ''
      ].filter(Boolean).join(' / ') || '-';

      return [
        `${codePrefix}${r.name || r.id}`,
        sum.doc.zone || '-',
        statusDetail,
        netLines,
        cableDetail,
        sum.doc.picName || '-',
        noteText
      ];
    });
  }

  /**
   * Generate and download comprehensive multi-page PDF report
   * @param {Object} options
   * @param {Object} options.project
   * @param {Object[]} options.devices
   * @param {Object[]} options.connections
   * @param {Object[]} [options.rooms3d]
   * @param {Object[]} [options.objects3d]
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {Konva.Stage} options.stage
   * @param {Konva.Layer} options.interactionLayer
   * @param {string|null} [options.snapshot3dDataUrl=null]
   * @param {number} [options.mapWidthMeters=170]
   */
  static async generateReport({
    project,
    devices,
    connections,
    rooms3d = null,
    objects3d = null,
    deviceManager,
    stage,
    interactionLayer,
    snapshot3dDataUrl = null,
    mapWidthMeters = 170
  }) {
    const jspdfModule = await loadJsPdf();
    const jsPDF = jspdfModule.jsPDF;

    // Create A4 Landscape document (297 x 210 mm)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const safeRooms = Array.isArray(rooms3d)
      ? rooms3d
      : (Array.isArray(project?.rooms3d) ? project.rooms3d : (stateManager.getRooms3d?.() || []));
    const safeObjects = Array.isArray(objects3d)
      ? objects3d
      : (Array.isArray(project?.objects3d) ? project.objects3d : (stateManager.getObjects3d?.() || []));

    // =========================================================================
    // PAGE 1: Executive Summary & Map Snapshot
    // =========================================================================
    doc.setFillColor(15, 23, 42); // #0f172a
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(248, 250, 252);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('SmartSchool NetMap — Laporan Dokumentasi Infrastruktur Jaringan', 14, 13);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Proyek: ${project.name || 'SmartSchool NetMap'}   |   Tanggal: ${new Date().toLocaleDateString('id-ID')}   |   Status: Production Ready`, 14, 21);

    const totalDevices = devices.length;
    const onlineDevices = devices.filter((d) => d.status === 'online').length;
    const warningDevices = devices.filter((d) => d.status === 'warning').length;
    const totalCables = connections.length;
    const totalLength = connections.reduce((acc, c) => acc + (c.length || 0), 0);

    const cardY = 34;
    const cardWidth = 50;
    const cardHeight = 18;
    const cardGap = 8;
    let cardX = 14;

    const stats = [
      { label: 'Total Perangkat', val: `${totalDevices} Unit`, color: [59, 130, 246] },
      { label: 'Perangkat Online', val: `${onlineDevices} Unit`, color: [34, 197, 94] },
      { label: 'Perlu Perhatian', val: `${warningDevices} Unit`, color: [245, 158, 11] },
      { label: 'Total Link Kabel', val: `${totalCables} Jalur`, color: [6, 182, 212] },
      { label: 'Estimasi Panjang', val: `${Math.round(totalLength)} Meter`, color: [139, 92, 246] }
    ];

    stats.forEach((st) => {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, 'F');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(st.label, cardX + 4, cardY + 6);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(st.color[0], st.color[1], st.color[2]);
      doc.text(st.val, cardX + 4, cardY + 13);

      cardX += cardWidth + cardGap;
    });

    // Map Snapshot Image (2D Canvas)
    try {
      const snapshotUrl = SnapshotExporter.getSnapshotDataUrl(stage, interactionLayer);
      if (snapshotUrl) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Visualisasi Denah Peta Jaringan Kampus (2D):', 14, 59);
        doc.addImage(snapshotUrl, 'JPEG', 14, 62, 269, 138);
      }
    } catch (err) {
      console.warn('[PdfReport] Failed to capture canvas snapshot:', err);
    }

    // Optional Page 1b: 3D X-Ray Campus Snapshot
    if (snapshot3dDataUrl) {
      doc.addPage('a4', 'landscape');
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 18, 'F');
      doc.setTextColor(248, 250, 252);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Visualisasi 3D Kampus — Mode X-Ray Jalur Backbone & Gedung', 14, 12);
      try {
        doc.addImage(snapshot3dDataUrl, 'JPEG', 14, 24, 269, 172);
      } catch (err) {
        console.warn('[PdfReport] Failed to embed 3D X-Ray snapshot:', err);
      }
    }

    // =========================================================================
    // PAGE 2: Device Inventory Table
    // =========================================================================
    doc.addPage('a4', 'landscape');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 18, 'F');
    doc.setTextColor(248, 250, 252);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Tabel Inventaris Perangkat Jaringan (Device Inventory)', 14, 12);

    const deviceRows = devices.map((d) => [
      d.id,
      d.name,
      (d.category || '').toUpperCase(),
      `${d.brand || ''} ${d.model || ''}`.trim() || '-',
      d.network?.ip || '-',
      d.network?.vlan ? `VLAN ${d.network.vlan}` : '-',
      d.network?.mac || '-',
      (d.status || '').toUpperCase(),
      d.location || '-'
    ]);

    doc.autoTable({
      startY: 24,
      head: [['ID', 'Nama Perangkat', 'Kategori', 'Merek / Model', 'IP Address', 'VLAN', 'MAC Address', 'Status', 'Lokasi']],
      body: deviceRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    // =========================================================================
    // PAGE 3: Cable Connections & Routes
    // =========================================================================
    doc.addPage('a4', 'landscape');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 18, 'F');
    doc.setTextColor(248, 250, 252);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Tabel Dokumentasi Jalur Kabel & Konektivitas Fisik', 14, 12);

    const cableRows = connections.map((c) => {
      const src = deviceManager.getDeviceById(c.source);
      const dest = deviceManager.getDeviceById(c.destination);
      return [
        c.id,
        c.name,
        (c.cableCategory || c.type || '').toUpperCase(),
        src ? `${src.name} (${src.network?.ip || ''})` : c.source,
        dest ? `${dest.name} (${dest.network?.ip || ''})` : c.destination,
        `${c.length || 0} m`,
        (c.status || '').toUpperCase(),
        c.notes || '-'
      ];
    });

    doc.autoTable({
      startY: 24,
      head: [['ID Kabel', 'Nama Jalur', 'Tipe / Kategori', 'Perangkat Sumber', 'Perangkat Tujuan', 'Panjang', 'Status', 'Catatan Rute']],
      body: cableRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    // =========================================================================
    // PAGE 4: Per-Building Infrastructure Documentation Summary (Phase 8E)
    // =========================================================================
    const buildingRows = this.buildBuildingsTableRows(safeRooms, devices, connections, safeObjects, {
      mapWidthMeters,
      naturalWidth: project?.map?.naturalWidth || 1024,
      naturalHeight: project?.map?.naturalHeight || 1024
    });

    if (buildingRows.length > 0) {
      doc.addPage('a4', 'landscape');
      doc.setFillColor(20, 62, 18); // Botanical forest dark banner
      doc.rect(0, 0, pageWidth, 18, 'F');
      doc.setTextColor(248, 250, 252);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('3. Ringkasan Dokumentasi Infrastruktur per Gedung / Ruangan', 14, 12);

      doc.autoTable({
        startY: 24,
        head: [['Kode & Nama Gedung', 'Zona / Jurusan', 'Inventaris Unit', 'VLAN & SSID WiFi', 'Panjang Kabel & Uplink', 'PIC', 'Catatan & Maintenance Terakhir']],
        body: buildingRows,
        theme: 'grid',
        headStyles: { fillColor: [42, 124, 19], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 }
      });
    }

    const filename = `netmap-laporan-dokumentasi-${Date.now()}.pdf`;
    doc.save(filename);
  }

  /**
   * Generate a compact 1-Page A4 Portrait printable room/rack documentation sheet
   * suitable for taping onto a school server room door or network rack.
   * @param {{ project?: Object, roomSummary: Object }} options
   */
  static async generateSingleRoomSheet({ project = {}, roomSummary }) {
    if (!roomSummary?.room) return;
    const jspdfModule = await loadJsPdf();
    const jsPDF = jspdfModule.jsPDF;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const r = roomSummary.room;
    const rDoc = roomSummary.doc || {};
    const net = roomSummary.networkSummary || { vlans: [], subnets: [], ssids: [] };
    const cab = roomSummary.cableSummary || { utpMeters: 0, fiberMeters: 0, uplinkCables: [] };

    // Top Header Banner
    doc.setFillColor(42, 124, 19);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`KARTU DOKUMENTASI RUANGAN: ${r.name || r.id}`, 12, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `${project?.name || 'SmartSchool NetMap'}  |  Kode: ${rDoc.roomCode || '-'}  |  Zona: ${rDoc.zone || '-'}  |  Cetak: ${new Date().toLocaleDateString('id-ID')}`,
      12,
      20
    );

    // Building & Network Summary Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(12, 31, pageWidth - 24, 30, 2, 2, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('RINGKASAN JARINGAN & PENANGGUNG JAWAB', 16, 37);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`PIC / Teknisi : ${rDoc.picName || '-'}    |    Dimensi: ${Number(r.widthMeters || 0).toFixed(1)} x ${Number(r.depthMeters || 0).toFixed(1)} x ${Number(r.heightMeters || 0).toFixed(1)} m`, 16, 43);
    doc.text(`VLAN Aktif    : ${net.vlans.length ? net.vlans.map((v) => `VLAN ${v}`).join(', ') : '-'}`, 16, 48.5);
    doc.text(`Subnet / SSID : ${net.subnets.join(', ') || '-'}   |   WiFi: ${net.ssids.join(', ') || '-'}`, 16, 54);
    doc.text(`Total Kabel   : UTP ${cab.utpMeters.toFixed(1)} m  •  Fiber ${cab.fiberMeters.toFixed(1)} m  •  Uplink ${cab.uplinkCables.length} jalur`, 16, 59);

    // Devices Table
    const devRows = (roomSummary.devicesInside || []).map((d) => [
      d.name || d.id,
      `${d.brand || ''} ${d.model || ''}`.trim() || d.type,
      d.network?.ip || '-',
      d.network?.vlan ? `VLAN ${d.network.vlan}` : '-',
      `${Number(d.spatial3d?.elevationMeters || 0).toFixed(1)}m`,
      (d.status || 'unknown').toUpperCase()
    ]);

    doc.autoTable({
      startY: 66,
      head: [['Nama Perangkat', 'Merek / Model', 'IP Address', 'VLAN', 'Elev Z', 'Status']],
      body: devRows.length > 0 ? devRows : [['Belum ada perangkat terdeteksi di ruangan ini', '-', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      margin: { left: 12, right: 12 }
    });

    let cursorY = (doc.lastAutoTable?.finalY || 120) + 8;

    // Uplink / Backbone Table
    if (cab.uplinkCables.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('JALUR UPLINK / BACKBONE ANTAR-GEDUNG', 12, cursorY);

      doc.autoTable({
        startY: cursorY + 3,
        head: [['Nama Kabel', 'Media', 'Tujuan Gedung / Perangkat', 'Port Lokal', 'Panjang']],
        body: cab.uplinkCables.map((u) => [
          u.cable?.name || '-',
          String(u.media || 'utp').toUpperCase(),
          u.remoteBuilding ? `${u.remoteBuilding.name} (${u.remoteDevice?.name || '-'})` : (u.remoteDevice?.name || '-'),
          u.localPort || '-',
          `${u.lengthMeters.toFixed(1)} m`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [42, 124, 19], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        margin: { left: 12, right: 12 }
      });
      cursorY = (doc.lastAutoTable?.finalY || cursorY + 25) + 8;
    }

    // Technician Notes
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('CATATAN TEKNISI LAPANGAN', 12, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const wrappedNotes = doc.splitTextToSize(rDoc.notes || '(Belum ada catatan teknisi)', pageWidth - 24);
    doc.text(wrappedNotes, 12, cursorY + 5);
    cursorY += Math.max(12, wrappedNotes.length * 4.5 + 8);

    // Recent Maintenance Logs
    const logs = Array.isArray(rDoc.maintenanceLogs) ? rDoc.maintenanceLogs.slice(0, 6) : [];
    if (logs.length > 0 && cursorY < 255) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('RIWAYAT MAINTENANCE TERAKHIR', 12, cursorY);
      doc.autoTable({
        startY: cursorY + 3,
        head: [['Tanggal', 'Teknisi', 'Kategori', 'Status', 'Ringkasan']],
        body: logs.map((l) => [l.date || '-', l.technician || '-', l.category || '-', l.status || '-', l.summary || '-']),
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        margin: { left: 12, right: 12 }
      });
    }

    const safeSlug = String(rDoc.roomCode || r.name || 'ruangan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`kartu-ruangan-${safeSlug || 'gedung'}.pdf`);
  }

  /**
   * Generate an official 1-page A4 Portrait Student Practical Lab Submission Proof PDF
   * with verification checksum (Phase 9D).
   * @param {Object} report - Output of JobsheetEngine.generateSubmissionReport()
   */
  static async generateJobsheetSubmissionPdf(report) {
    if (!report) return;
    const jspdfModule = await loadJsPdf();
    const jsPDF = jspdfModule.jsPDF;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const isPassed = Number(report.score) >= 75;

    // Header Banner
    doc.setFillColor(20, 62, 18);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`${(report.schoolName || 'SMK NEGERI 1 BERINGIN').toUpperCase()}`, 12, 11);
    doc.setFontSize(10.5);
    doc.text('BUKTI PENILAIAN PRAKTIKUM SIMULATOR JARINGAN (SMARTSCHOOL NETMAP)', 12, 19);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Waktu Pengumpulan: ${new Date(report.submittedAt || Date.now()).toLocaleString('id-ID')}`, 12, 25);

    // Student & Score Card
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(12, 33, pageWidth - 62, 30, 2, 2, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('IDENTITAS PESERTA DIDIK & JOBSHEET', 16, 39);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Nama Siswa  : ${report.studentName || '-'}`, 16, 45);
    doc.text(`Kelas / No  : ${report.studentClass || '-'}  (Absen: ${report.studentNumber || '-'})`, 16, 50.5);
    doc.text(`Jobsheet    : [${report.jobsheetCode || 'LAB'}] ${report.jobsheetTitle || '-'}`, 16, 56);
    const durMin = Math.floor((Number(report.elapsedSeconds) || 0) / 60);
    const durSec = (Number(report.elapsedSeconds) || 0) % 60;
    doc.text(`Tingkat     : ${report.jobsheetLevel || '-'}  |  Durasi: ${durMin}m ${durSec}d`, 16, 61);

    // Score Box on Right
    doc.setFillColor(isPassed ? 34 : 217, isPassed ? 197 : 119, isPassed ? 94 : 6);
    doc.roundedRect(pageWidth - 46, 33, 34, 30, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SKOR AKHIR', pageWidth - 29, 40, { align: 'center' });
    doc.setFontSize(20);
    doc.text(`${report.score}`, pageWidth - 29, 52, { align: 'center' });
    doc.setFontSize(8);
    doc.text(isPassed ? 'TUNTAS' : 'PERLU REVISI', pageWidth - 29, 59.5, { align: 'center' });

    // Checklist Table
    const taskRows = (report.tasks || []).map((t, idx) => [
      String(idx + 1),
      t.label || '-',
      `${t.weight || 0}%`,
      t.passed ? 'LULUS' : 'BELUM',
      t.detail || '-'
    ]);

    doc.autoTable({
      startY: 69,
      head: [['No', 'Indikator Pencapaian Praktikum', 'Bobot', 'Status', 'Hasil Verifikasi Sistem']],
      body: taskRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      margin: { left: 12, right: 12 }
    });

    let yCursor = (doc.lastAutoTable?.finalY || 130) + 8;

    // Topology & Neatness Summary
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `RINGKASAN TOPOLOGI (${report.deviceCount || 0} Perangkat • ${report.cableCount || 0} Kabel • Rata-rata Kerapian: ${report.avgNeatness ?? 100}/100)`,
      12,
      yCursor
    );

    const devRows = (report.devicesSummary || []).slice(0, 12).map((d) => [
      d.name || '-',
      d.type || '-',
      d.ip || '-',
      d.vlan ? `VLAN ${d.vlan}` : '-',
      d.ssid || '-'
    ]);
    doc.autoTable({
      startY: yCursor + 3,
      head: [['Nama Perangkat', 'Tipe', 'IP Address', 'VLAN', 'SSID']],
      body: devRows.length > 0 ? devRows : [['Belum ada perangkat', '-', '-', '-', '-']],
      theme: 'grid',
      headStyles: { fillColor: [42, 124, 19], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 12, right: 12 }
    });

    // Verification Checksum Footer
    const footY = Math.min(278, Math.max((doc.lastAutoTable?.finalY || 220) + 12, 258));
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(12, footY, pageWidth - 24, 14, 2, 2, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`KODE VERIFIKASI CHECKSUM ASLI: ${report.checksum || '-'}`, 16, footY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Dokumen ini dihasilkan otomatis oleh SmartSchool NetMap Auto-Grader Engine.', 16, footY + 11);

    const slug = `${report.jobsheetCode || 'lab'}-${report.studentClass || 'kelas'}-${report.studentName || 'siswa'}`
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    doc.save(`bukti-praktikum-${slug || 'siswa'}.pdf`);
  }
}
