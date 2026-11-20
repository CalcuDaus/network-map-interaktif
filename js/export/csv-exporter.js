/**
 * NetMap — CSV Inventory & Building Documentation Exporter (SheetJS)
 * Generates and downloads tabular CSV files for devices, cables, and per-building summaries
 */

import { loadSheetJs } from './lazy-loader.js';
import { stateManager } from '../core/state-manager.js';
import {
  findBuildingForDevice,
  buildAllBuildingsSummary
} from '../map/room-spatial-index.js';

export class CsvExporter {
  static _resolveSpatialOpts(options = {}) {
    const projectMap = stateManager.getState?.()?.project?.map || {};
    return {
      mapWidthMeters: Number(options.mapWidthMeters) > 0 ? Number(options.mapWidthMeters) : 170,
      naturalWidth: Number(options.naturalWidth) > 0 ? Number(options.naturalWidth) : (projectMap.naturalWidth || 1024),
      naturalHeight: Number(options.naturalHeight) > 0 ? Number(options.naturalHeight) : (projectMap.naturalHeight || 1024)
    };
  }

  /**
   * Build tabular device rows with auto-detected building ownership column.
   * @param {Object[]} devices
   * @param {Object[]} [rooms3d]
   * @param {Object} [options]
   * @returns {Object[]}
   */
  static buildDevicesCsvRows(devices = [], rooms3d = null, options = {}) {
    const rooms = Array.isArray(rooms3d) ? rooms3d : (stateManager.getRooms3d?.() || []);
    const spatialOpts = this._resolveSpatialOpts(options);

    return devices.map((d) => {
      const autoRoom = findBuildingForDevice(d, rooms, spatialOpts);
      return {
        'Device ID': d.id,
        'Device Name': d.name,
        'Gedung / Ruangan (Auto-Detect)': autoRoom ? autoRoom.name : '',
        'Category': d.category,
        'Type': d.type,
        'Brand': d.brand || '',
        'Model': d.model || '',
        'Purchase Year': d.inventory?.purchaseYear || '',
        'Funding Source': d.inventory?.fundingSource || '',
        'Inventory Code': d.inventory?.inventoryCode || '',
        'Condition': d.inventory?.condition || '',
        'Serial Number': d.inventory?.serialNumber || '',
        'Specifications': d.specs?.summary || '',
        'IP Address': d.network?.ip || '',
        'Subnet': d.network?.subnet || '',
        'Gateway': d.network?.gateway || '',
        'VLAN ID': d.network?.vlan || '',
        'SSID': d.network?.ssid || '',
        'Secondary SSID': d.network?.ssidSecondary || '',
        'Management Access': d.network?.managementAccess || '',
        'MAC Address': d.network?.mac || '',
        'Hostname': d.network?.hostname || '',
        'Status': d.status || '',
        'Location': d.location || '',
        'Firmware': d.firmware || '',
        'Installed Date': d.installedAt || '',
        'Notes': d.notes || ''
      };
    });
  }

  /**
   * Export device inventory to CSV
   * @param {Object[]} devices
   * @param {string} [filename]
   * @param {Object} [options]
   */
  static async exportDevicesCsv(devices, filename = 'devices-inventory.csv', options = {}) {
    const XLSX = await loadSheetJs();
    const rows = this.buildDevicesCsvRows(devices, options.rooms3d ?? null, options);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Devices');
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  }

  /**
   * Build tabular cable rows with auto-detected source & destination buildings.
   * @param {Object[]} cables
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager
   * @param {Object[]} [rooms3d]
   * @param {Object} [options]
   * @returns {Object[]}
   */
  static buildCablesCsvRows(cables = [], deviceManager, rooms3d = null, options = {}) {
    const rooms = Array.isArray(rooms3d) ? rooms3d : (stateManager.getRooms3d?.() || []);
    const spatialOpts = this._resolveSpatialOpts(options);

    return cables.map((c) => {
      const src = deviceManager?.getDeviceById?.(c.source) || null;
      const dest = deviceManager?.getDeviceById?.(c.destination) || null;
      const srcRoom = src ? findBuildingForDevice(src, rooms, spatialOpts) : null;
      const destRoom = dest ? findBuildingForDevice(dest, rooms, spatialOpts) : null;
      const scopeLabel = (srcRoom && destRoom && srcRoom.id === destRoom.id)
        ? 'Internal Gedung'
        : ((srcRoom || destRoom) ? 'Backbone Antar-Gedung' : 'Area Luar');

      return {
        'Cable ID': c.id,
        'Cable Name': c.name,
        'Cakupan Jalur': scopeLabel,
        'Gedung Sumber (Auto-Detect)': srcRoom ? srcRoom.name : '',
        'Gedung Tujuan (Auto-Detect)': destRoom ? destRoom.name : '',
        'Type': c.type,
        'Category': c.cableCategory,
        'Source ID': c.source,
        'Source Device': src ? src.name : '',
        'Destination ID': c.destination,
        'Destination Device': dest ? dest.name : '',
        'Length (m)': c.length || 0,
        'Color': c.customColor || 'Auto (Standar Kategori)',
        'Color Mode': c.customColor ? 'Custom' : 'Auto',
        'Status': c.status,
        'Waypoints Count': Array.isArray(c.route) ? c.route.length : 0,
        'Notes': c.notes || ''
      };
    });
  }

  /**
   * Export cable inventory to CSV
   * @param {Object[]} cables
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager
   * @param {string} [filename]
   * @param {Object} [options]
   */
  static async exportCablesCsv(cables, deviceManager, filename = 'cables-inventory.csv', options = {}) {
    const XLSX = await loadSheetJs();
    const rows = this.buildCablesCsvRows(cables, deviceManager, options.rooms3d ?? null, options);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cables');
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  }

  /**
   * Build tabular per-building infrastructure documentation rows.
   * @param {Object[]} rooms3d
   * @param {Object[]} devices
   * @param {Object[]} connections
   * @param {Object[]} [objects3d=[]]
   * @param {Object} [options={}]
   * @returns {Object[]}
   */
  static buildBuildingsCsvRows(rooms3d = [], devices = [], connections = [], objects3d = [], options = {}) {
    const spatialOpts = this._resolveSpatialOpts(options);
    const summaries = buildAllBuildingsSummary(rooms3d, devices, connections, objects3d, spatialOpts);

    return summaries.map((sum) => {
      const r = sum.room;
      const lastLog = sum.doc.maintenanceLogs[0] || null;
      return {
        'Kode Ruang': sum.doc.roomCode || '-',
        'Nama Gedung / Ruangan': r.name || r.id,
        'Zona / Jurusan': sum.doc.zone || '-',
        'Penanggung Jawab (PIC)': sum.doc.picName || '-',
        'Dimensi (m)': `${Number(r.widthMeters || 0).toFixed(1)} x ${Number(r.depthMeters || 0).toFixed(1)} x ${Number(r.heightMeters || 0).toFixed(1)}`,
        'Total Perangkat': sum.statusCounts.total,
        'Online': sum.statusCounts.online,
        'Warning': sum.statusCounts.warning,
        'Offline': sum.statusCounts.offline,
        'VLAN Aktif': sum.networkSummary.vlans.map((v) => `VLAN ${v}`).join(', '),
        'Subnet': sum.networkSummary.subnets.join(', '),
        'SSID WiFi': sum.networkSummary.ssids.join(', '),
        'Kabel UTP (m)': sum.cableSummary.utpMeters,
        'Kabel Fiber (m)': sum.cableSummary.fiberMeters,
        'Total Kabel (m)': sum.cableSummary.totalCableMeters,
        'Jalur Uplink': sum.cableSummary.uplinkCount,
        'Objek 3D (Rak/Meja)': sum.objectsInside.length,
        'Catatan Teknisi': sum.doc.notes || '',
        'Maintenance Terakhir': lastLog ? `${lastLog.date} (${lastLog.technician}): ${lastLog.summary}` : ''
      };
    });
  }

  /**
   * Export per-building documentation summary to CSV (`buildings-documentation.csv`).
   * @param {Object[]} rooms3d
   * @param {Object[]} devices
   * @param {Object[]} connections
   * @param {Object[]} [objects3d=[]]
   * @param {string} [filename='buildings-documentation.csv']
   * @param {Object} [options={}]
   */
  static async exportBuildingsCsv(
    rooms3d,
    devices,
    connections,
    objects3d = [],
    filename = 'buildings-documentation.csv',
    options = {}
  ) {
    const XLSX = await loadSheetJs();
    const rows = this.buildBuildingsCsvRows(rooms3d, devices, connections, objects3d, options);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Buildings');
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  }
}
