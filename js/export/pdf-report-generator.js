/**
 * NetMap — Multi-Page PDF Documentation Report Generator
 * Builds formal technical documentation using jsPDF & autoTable
 */

import { loadJsPdf } from './lazy-loader.js';
import { SnapshotExporter } from './snapshot-exporter.js';

export class PdfReportGenerator {
  /**
   * Generate and download comprehensive PDF report
   * @param {Object} options
   * @param {Object} options.project
   * @param {Object[]} options.devices
   * @param {Object[]} options.connections
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {Konva.Stage} options.stage
   * @param {Konva.Layer} options.interactionLayer
   */
  static async generateReport({
    project,
    devices,
    connections,
    deviceManager,
    stage,
    interactionLayer
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
    const pageHeight = doc.internal.pageSize.getHeight();

    // =========================================================================
    // PAGE 1: Executive Summary & Map Snapshot
    // =========================================================================
    // Header Banner
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

    // Summary Statistics Cards
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

    // Map Snapshot Image
    try {
      const snapshotUrl = SnapshotExporter.getSnapshotDataUrl(stage, interactionLayer);
      if (snapshotUrl) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Visualisasi Denah Peta Jaringan Kampus:', 14, 59);

        // Place image: 269mm wide x 140mm high centered
        doc.addImage(snapshotUrl, 'JPEG', 14, 62, 269, 138);
      }
    } catch (err) {
      console.warn('[PdfReport] Failed to capture canvas snapshot:', err);
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
      d.category.toUpperCase(),
      `${d.brand || ''} ${d.model || ''}`,
      d.network?.ip || '-',
      d.network?.vlan ? `VLAN ${d.network.vlan}` : '-',
      d.network?.mac || '-',
      d.status.toUpperCase(),
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
        c.cableCategory.toUpperCase(),
        src ? `${src.name} (${src.network?.ip || ''})` : c.source,
        dest ? `${dest.name} (${dest.network?.ip || ''})` : c.destination,
        `${c.length || 0} m`,
        c.status.toUpperCase(),
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

    // Save PDF
    const filename = `netmap-laporan-dokumentasi-${Date.now()}.pdf`;
    doc.save(filename);
  }
}

