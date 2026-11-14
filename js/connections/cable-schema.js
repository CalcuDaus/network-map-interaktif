/**
 * NetMap — Cable Connection Schema & Validation
 * Implements schema definitions and validation rules specified in PRD Section 3.4 & 6.3
 */

import { generateId } from '../utils/helpers.js';

export const CableSchema = {
  /**
   * Factory function to create a validated cable connection object
   * @param {Object} params 
   * @returns {Object}
   */
  create(params = {}) {
    const id = params.id || generateId('cab');
    return {
      id: id,
      name: params.name || 'New Cable Link',
      source: params.source,                           // Device ID sumber (wajib)
      destination: params.destination,                 // Device ID tujuan (wajib)
      type: params.type || 'ethernet',                 // ethernet, fiber, wireless, coaxial
      cableCategory: params.cableCategory || 'cat6',    // cat5e, cat6, cat6a, fiber-sm, fiber-mm, wireless-link, coaxial
      customColor: params.customColor || '',           // Hex warna custom (opsional, jika kosong gunakan warna standar tipe kabel)
      status: params.status || 'active',               // active, damaged, inactive, maintenance
      route: Array.isArray(params.route) ? params.route : [], // Array [{x, y}] (0.0000 - 1.0000)
      length: typeof params.length === 'number' ? params.length : 0, // Dalam meter
      lengthMode: params.lengthMode || 'auto',         // auto | manual
      details: {
        // Universal port endpoints & 3D diameter scale (1.0 = matches port socket)
        portSource: params.details?.portSource || '',
        portDestination: params.details?.portDestination || '',
        cableDiameterScale: typeof params.details?.cableDiameterScale === 'number' ? params.details.cableDiameterScale : 1.0,
        elevationZ: (typeof params.details?.elevationZ === 'number' && !isNaN(params.details.elevationZ)) ? params.details.elevationZ : null,
        pathStyle: params.details?.pathStyle || 'curve', // 'curve' (Bezier Pen Tool) | 'straight' (Corner) | 'orthogonal' (90° Tray)
        curveTension: typeof params.details?.curveTension === 'number' ? params.details.curveTension : 0.38,
        jacketType: params.details?.jacketType || 'indoor-pvc',

        // Accurate physical measurement fields (real-world network installation)
        horizontalLength: typeof params.details?.horizontalLength === 'number' ? params.details.horizontalLength : (typeof params.length === 'number' ? params.length : 0),
        verticalDropSource: typeof params.details?.verticalDropSource === 'number' ? params.details.verticalDropSource : 1.5,
        verticalDropDest: typeof params.details?.verticalDropDest === 'number' ? params.details.verticalDropDest : 1.5,
        serviceLoopMeters: typeof params.details?.serviceLoopMeters === 'number' ? params.details.serviceLoopMeters : 2.0,
        slackMarginPercent: typeof params.details?.slackMarginPercent === 'number' ? params.details.slackMarginPercent : 5,
        segmentLengths: Array.isArray(params.details?.segmentLengths) ? params.details.segmentLengths : [],
        calculatedMetrics: params.details?.calculatedMetrics || null,

        // Fiber optic details
        fiberCoreCount: params.details?.fiberCoreCount ? Number(params.details.fiberCoreCount) : (params.type === 'fiber' || params.cableCategory?.startsWith('fiber') ? 12 : 2),
        fiberActiveCores: params.details?.fiberActiveCores || 'Core 1-2 (Rx/Tx)',
        connectorSource: params.details?.connectorSource || 'LC/UPC',
        connectorDest: params.details?.connectorDest || 'LC/UPC',
        wavelength: params.details?.wavelength || (params.cableCategory === 'fiber-mm' ? '850/1300nm (OM3)' : '1310/1550nm (OS2)'),
        attenuationDb: typeof params.details?.attenuationDb === 'number' ? params.details.attenuationDb : null,
        tubeColor: params.details?.tubeColor || 'Biru (Tube 1)',

        // LAN / Twisted Pair details
        shielding: params.details?.shielding || (params.cableCategory === 'cat6a' ? 'S/FTP' : 'U/UTP'),
        wiringStandard: params.details?.wiringStandard || 'T568B',
        maxBandwidth: params.details?.maxBandwidth || (params.cableCategory === 'cat5e' ? '1 Gbps' : '10 Gbps'),
        poeSupport: params.details?.poeSupport || 'poe+',

        // Coaxial details
        coaxType: params.details?.coaxType || 'RG-6',
        impedance: params.details?.impedance || '75 Ohm',
        coaxConnector: params.details?.coaxConnector || 'BNC Compression',
        isSiamese: Boolean(params.details?.isSiamese),

        // Wireless details
        frequency: params.details?.frequency || '5 GHz',
        channelWidth: params.details?.channelWidth || '40 MHz',
        signalRssi: params.details?.signalRssi || '-58 dBm'
      },
      notes: params.notes || '',
      createdAt: params.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Validate a cable connection object
   * @param {Object} cable 
   * @returns {{isValid: boolean, errors: string[]}}
   */
  validate(cable) {
    const errors = [];
    if (!cable.id) errors.push('Cable ID is required');
    if (!cable.source) errors.push('Source device ID is required');
    if (!cable.destination) errors.push('Destination device ID is required');
    if (cable.source && cable.destination && cable.source === cable.destination) {
      errors.push('Source and destination devices cannot be the same');
    }
    if (cable.route && !Array.isArray(cable.route)) {
      errors.push('Route must be an array of waypoint coordinates');
    }
    if (Array.isArray(cable.route)) {
      for (let i = 0; i < cable.route.length; i++) {
        const pt = cable.route[i];
        if (typeof pt.x !== 'number' || typeof pt.y !== 'number' || pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) {
          errors.push(`Waypoint at index ${i} has invalid normalized coordinates`);
          break;
        }
        if (pt.z !== undefined && pt.z !== null && (typeof pt.z !== 'number' || isNaN(pt.z))) {
          errors.push(`Waypoint at index ${i} has invalid Z elevation`);
          break;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

