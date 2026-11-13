/**
 * NetMap — CSV Inventory Exporter (SheetJS)
 * Generates and downloads tabular CSV files for devices and cables
 */

import { loadSheetJs } from './lazy-loader.js';

export class CsvExporter {
  /**
   * Export device inventory to CSV
   * @param {Object[]} devices 
   * @param {string} [filename] 
   */
  static async exportDevicesCsv(devices, filename = 'devices-inventory.csv') {
    const XLSX = await loadSheetJs();

    const rows = devices.map((d) => ({
      'Device ID': d.id,
      'Device Name': d.name,
      'Category': d.category,
      'Type': d.type,
      'Brand': d.brand || '',
      'Model': d.model || '',
      'IP Address': d.network?.ip || '',
      'Subnet': d.network?.subnet || '',
      'VLAN ID': d.network?.vlan || '',
      'MAC Address': d.network?.mac || '',
      'Hostname': d.network?.hostname || '',
      'Status': d.status || '',
      'Location': d.location || '',
      'Firmware': d.firmware || '',
      'Installed Date': d.installedAt || '',
      'Notes': d.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Devices');
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  }

  /**
   * Export cable inventory to CSV
   * @param {Object[]} cables 
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
   * @param {string} [filename] 
   */
  static async exportCablesCsv(cables, deviceManager, filename = 'cables-inventory.csv') {
    const XLSX = await loadSheetJs();

    const rows = cables.map((c) => {
      const src = deviceManager.getDeviceById(c.source);
      const dest = deviceManager.getDeviceById(c.destination);

      return {
        'Cable ID': c.id,
        'Cable Name': c.name,
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

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cables');
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  }
}

