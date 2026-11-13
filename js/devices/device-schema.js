/**
 * NetMap — Device Schema & Data Validation
 * Implements schema definitions and validation rules specified in PRD Section 3.3 & 6.3
 */

import { generateId } from '../utils/helpers.js';

export const IPv4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
export const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

/**
 * Validate IPv4 format (allows empty string)
 * @param {string} ip 
 * @returns {boolean}
 */
export function validateIp(ip) {
  if (!ip || ip.trim() === '') return true;
  return IPv4_REGEX.test(ip.trim());
}

/**
 * Validate MAC address format (allows empty string)
 * @param {string} mac 
 * @returns {boolean}
 */
export function validateMac(mac) {
  if (!mac || mac.trim() === '') return true;
  return MAC_REGEX.test(mac.trim());
}

/**
 * Validate VLAN ID (1 - 4094)
 * @param {number|string} vlan 
 * @returns {boolean}
 */
export function validateVlan(vlan) {
  if (vlan === '' || vlan === null || vlan === undefined) return true;
  const num = parseInt(vlan, 10);
  return !isNaN(num) && num >= 1 && num <= 4094;
}

export const DeviceSchema = {
  /**
   * Factory function to create a validated device object with default values
   * @param {Object} params 
   * @returns {Object}
   */
  create(params = {}) {
    const id = params.id || generateId('dev');
    return {
      id: id,
      name: params.name || 'New Device',
      type: params.type || 'router',           // router, switch, ap, server, cctv, etc.
      category: params.category || 'core',     // core, distribution, infrastructure, end-device
      brand: params.brand || '',
      model: params.model || '',
      customIcon: params.customIcon || '',
      customImage: params.customImage || '',
      markerStyle: params.markerStyle || 'rounded',
      wirelessCoverage: params.wirelessCoverage ? {
        enabled: Boolean(params.wirelessCoverage.enabled),
        radiusMeters: typeof params.wirelessCoverage.radiusMeters === 'number' ? params.wirelessCoverage.radiusMeters : 25,
        color: params.wirelessCoverage.color || '#76c457',
        opacity: typeof params.wirelessCoverage.opacity === 'number' ? params.wirelessCoverage.opacity : 0.18,
        hatch: params.wirelessCoverage.hatch !== undefined ? Boolean(params.wirelessCoverage.hatch) : true,
        band: params.wirelessCoverage.band || 'dual-band',
        showLabel: params.wirelessCoverage.showLabel !== undefined ? Boolean(params.wirelessCoverage.showLabel) : true
      } : (
        (params.type === 'access-point' || params.type === 'wireless-bridge' || params.type === 'network-pole') ? {
          enabled: true,
          radiusMeters: params.type === 'wireless-bridge' ? 80 : (params.type === 'access-point' ? 25 : 30),
          color: params.type === 'wireless-bridge' ? '#06b6d4' : '#76c457',
          opacity: 0.18,
          hatch: true,
          band: params.type === 'wireless-bridge' ? 'ptp' : 'dual-band',
          showLabel: true
        } : null
      ),
      position: {
        x: typeof params.position?.x === 'number' ? params.position.x : 0.5,
        y: typeof params.position?.y === 'number' ? params.position.y : 0.5
      },
      network: {
        ip: params.network?.ip || params.ip || '',
        mac: params.network?.mac || params.mac || '',
        subnet: params.network?.subnet || params.subnet || '255.255.255.0',
        vlan: params.network?.vlan !== undefined ? Number(params.network.vlan) : (params.vlan !== undefined ? Number(params.vlan) : 1),
        hostname: params.network?.hostname || params.hostname || ''
      },
      status: params.status || 'unknown',      // online, offline, warning, unknown
      location: params.location || '',
      firmware: params.firmware || '',
      installedAt: params.installedAt || new Date().toISOString().split('T')[0],
      notes: params.notes || '',
      createdAt: params.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Validate a device object
   * @param {Object} device 
   * @returns {{isValid: boolean, errors: string[]}}
   */
  validate(device) {
    const errors = [];
    if (!device.id) errors.push('Device ID is required');
    if (!device.name || device.name.trim() === '') errors.push('Device name is required');
    if (!device.position || typeof device.position.x !== 'number' || typeof device.position.y !== 'number') {
      errors.push('Valid normalized coordinates (position.x and position.y) are required');
    }
    if (device.position && (device.position.x < 0 || device.position.x > 1 || device.position.y < 0 || device.position.y > 1)) {
      errors.push('Normalized coordinates must be within [0, 1]');
    }
    if (device.network?.ip && !validateIp(device.network.ip)) {
      errors.push('Invalid IPv4 address format');
    }
    if (device.network?.mac && !validateMac(device.network.mac)) {
      errors.push('Invalid MAC address format (e.g., 00:1A:2B:3C:4D:5E)');
    }
    if (device.network?.vlan && !validateVlan(device.network.vlan)) {
      errors.push('VLAN ID must be an integer between 1 and 4094');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};
