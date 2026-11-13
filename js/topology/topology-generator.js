/**
 * NetMap — Cytoscape Topology Elements Generator
 * Converts devices and connections into Physical and Logical Cytoscape graphs
 */

import { DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';
import { getCableDefByCategory } from '../connections/cable-library.js';

export class TopologyGenerator {
  /**
   * @param {import('../devices/device-manager.js').DeviceManager} deviceManager 
   * @param {import('../connections/cable-manager.js').CableManager} cableManager 
   */
  constructor(deviceManager, cableManager) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
  }

  /**
   * Generate Cytoscape elements for Physical Topology
   * @returns {Object[]}
   */
  generatePhysicalElements() {
    const devices = this.deviceManager.getAllDevices();
    const cables = this.cableManager.getAllConnections();

    const elements = [];

    // 1. Nodes
    devices.forEach((dev) => {
      const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;

      elements.push({
        group: 'nodes',
        data: {
          id: dev.id,
          name: dev.name,
          label: `${dev.name}\n${dev.network?.ip || ''}`,
          category: dev.category,
          type: dev.type,
          status: dev.status,
          statusColor: statusDef.color,
          catColor: cat.color,
          location: dev.location,
          ip: dev.network?.ip || ''
        }
      });
    });

    // 2. Edges
    cables.forEach((cable) => {
      const catDef = getCableDefByCategory(cable.cableCategory);
      const edgeColor = (cable.customColor && cable.customColor.trim()) ? cable.customColor.trim() : catDef.color;

      elements.push({
        group: 'edges',
        data: {
          id: cable.id,
          source: cable.source,
          target: cable.destination,
          label: catDef.name,
          cableCategory: cable.cableCategory,
          status: cable.status,
          lineColor: edgeColor,
          length: cable.length
        }
      });
    });

    return elements;
  }

  /**
   * Generate Cytoscape elements for Logical Topology (Grouped by VLAN)
   * @returns {Object[]}
   */
  generateLogicalElements() {
    const devices = this.deviceManager.getAllDevices();
    const cables = this.cableManager.getAllConnections();

    const elements = [];
    const vlanMap = new Map();

    // Map VLANs from devices
    devices.forEach((dev) => {
      const vlanId = dev.network?.vlan || 1;
      if (!vlanMap.has(vlanId)) {
        vlanMap.set(vlanId, []);
      }
      vlanMap.get(vlanId).push(dev);
    });

    // 1. Compound / Group Nodes for each VLAN
    vlanMap.forEach((devs, vlanId) => {
      const groupNodeId = `vlan-group-${vlanId}`;
      const vlanName = this.getVlanFriendlyName(vlanId);

      elements.push({
        group: 'nodes',
        data: {
          id: groupNodeId,
          label: `VLAN ${vlanId} — ${vlanName} (${devs.length} Perangkat)`,
          isGroup: true
        }
      });

      // Child nodes
      devs.forEach((dev) => {
        const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
        const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;

        elements.push({
          group: 'nodes',
          data: {
            id: dev.id,
            parent: groupNodeId,
            name: dev.name,
            label: `${dev.name}\n${dev.network?.ip || ''}`,
            category: dev.category,
            type: dev.type,
            status: dev.status,
            statusColor: statusDef.color,
            catColor: cat.color,
            location: dev.location,
            ip: dev.network?.ip || ''
          }
        });
      });
    });

    // 2. Edges
    cables.forEach((cable) => {
      const catDef = getCableDefByCategory(cable.cableCategory);
      const edgeColor = (cable.customColor && cable.customColor.trim()) ? cable.customColor.trim() : catDef.color;

      elements.push({
        group: 'edges',
        data: {
          id: cable.id,
          source: cable.source,
          target: cable.destination,
          label: catDef.name,
          cableCategory: cable.cableCategory,
          status: cable.status,
          lineColor: edgeColor,
          length: cable.length
        }
      });
    });

    return elements;
  }

  getVlanFriendlyName(vlanId) {
    const names = {
      1: 'Default / Management',
      10: 'Servers & Core Infrastructure',
      20: 'Staff & Ruang Dosen',
      30: 'Mahasiswa & Wi-Fi Public',
      100: 'CCTV Surveillance & Security'
    };
    return names[vlanId] || `Network Segment ${vlanId}`;
  }
}

