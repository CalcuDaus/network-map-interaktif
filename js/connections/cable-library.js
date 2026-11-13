/**
 * NetMap — Cable Categories & Visual Styles Library
 * Defines styles, colors, stroke widths, and dash patterns according to PRD Section 3.4
 */

export const CABLE_CATEGORIES = {
  'cat5e': {
    id: 'cat5e',
    name: 'UTP Cat5e (1 Gbps)',
    type: 'ethernet',
    color: '#3b82f6', // Electric Blue
    strokeWidth: 3,
    dash: [],
    description: 'Kabel tembaga twisted pair 1 Gbps max 100m'
  },
  'cat6': {
    id: 'cat6',
    name: 'UTP Cat6 (10 Gbps)',
    type: 'ethernet',
    color: '#2563eb', // Royal Blue
    strokeWidth: 3.5,
    dash: [],
    description: 'Kabel tembaga standar gigabit & 10G jarak pendek'
  },
  'cat6a': {
    id: 'cat6a',
    name: 'UTP Cat6A (10 Gbps 100m)',
    type: 'ethernet',
    color: '#8b5cf6', // Violet / Purple
    strokeWidth: 4,
    dash: [],
    description: 'Kabel shielded 10 Gbps full 100 meter'
  },
  'fiber-sm': {
    id: 'fiber-sm',
    name: 'Fiber Optic Single Mode',
    type: 'fiber',
    color: '#eab308', // Yellow (Standard Singlemode Jacket)
    strokeWidth: 3,
    dash: [],
    description: 'Kabel optik jarak jauh antargedung (core 9/125 um)'
  },
  'fiber-mm': {
    id: 'fiber-mm',
    name: 'Fiber Optic Multi Mode',
    type: 'fiber',
    color: '#f97316', // Orange (Standard Multimode Jacket)
    strokeWidth: 3,
    dash: [],
    description: 'Kabel optik jarak menengah dalam gedung (core 50/125 um)'
  },
  'wireless-link': {
    id: 'wireless-link',
    name: 'Wireless Link (PtP / PtMP)',
    type: 'wireless',
    color: '#06b6d4', // Cyan
    strokeWidth: 2.5,
    dash: [8, 6],
    description: 'Koneksi nirkabel jarak jauh antar tiang/gedung'
  },
  'coaxial': {
    id: 'coaxial',
    name: 'Coaxial Cable (RG6/RG11)',
    type: 'coaxial',
    color: '#64748b', // Slate Gray
    strokeWidth: 3,
    dash: [],
    description: 'Kabel tembaga coaxial CCTV analog atau RF'
  }
};

export const CABLE_STATUSES = {
  active: {
    id: 'active',
    name: 'Active / Normal',
    color: '#22c55e',
    dash: []
  },
  damaged: {
    id: 'damaged',
    name: 'Damaged / Cut',
    color: '#ef4444',
    dash: [8, 6]
  },
  maintenance: {
    id: 'maintenance',
    name: 'Under Maintenance',
    color: '#f59e0b',
    dash: [6, 4]
  },
  inactive: {
    id: 'inactive',
    name: 'Inactive / Reserved',
    color: '#64748b',
    dash: [4, 4]
  }
};

/**
 * Get category metadata
 * @param {string} category 
 * @returns {Object}
 */
export function getCableDefByCategory(category) {
  return CABLE_CATEGORIES[category] || CABLE_CATEGORIES['cat6'];
}

/**
 * Determine high-level media type group for UI rendering
 * @param {string} category 
 * @returns {'fiber'|'twisted-pair'|'coaxial'|'wireless'}
 */
export function getMediaTypeByCableCategory(category) {
  if (category === 'fiber-sm' || category === 'fiber-mm') return 'fiber';
  if (category === 'coaxial') return 'coaxial';
  if (category === 'wireless-link') return 'wireless';
  return 'twisted-pair';
}

/**
 * Calculate estimated optical loss / attenuation in dB
 * Formula: (Length_km * alpha) + (Connectors * 0.5dB) + (Splices * 0.1dB)
 * @param {number} lengthMeters 
 * @param {'sm'|'mm'} fiberType 
 * @param {number} [connectors=2] 
 * @param {number} [splices=2] 
 * @returns {number}
 */
export function estimateFiberAttenuation(lengthMeters, fiberType = 'sm', connectors = 2, splices = 2) {
  const km = Math.max(0, lengthMeters) / 1000;
  // SM (1310/1550nm): ~0.35 dB/km, MM (850nm): ~2.5 dB/km
  const alpha = fiberType === 'sm' ? 0.35 : 2.5;
  const loss = (km * alpha) + (connectors * 0.5) + (splices * 0.1);
  return Math.round(loss * 100) / 100;
}

/**
 * Calculate accurate physical cable length factoring in:
 * - 2D horizontal route on floor plan
 * - Vertical drops (ceiling tray / raised floor to rack, patch panel, or wall outlet)
 * - Service loops (coiled maintenance reserves at endpoints)
 * - Slack margin (conduit curves, tray bending, pulling allowance)
 * @param {Object} options
 * @param {number} options.horizontalMeters
 * @param {number} [options.verticalDropSource=1.5]
 * @param {number} [options.verticalDropDest=1.5]
 * @param {number} [options.serviceLoopMeters=2.0]
 * @param {number} [options.slackMarginPercent=5]
 * @returns {{horizontalMeters: number, verticalTotal: number, serviceLoopMeters: number, slackAmount: number, totalPhysical: number}}
 */
export function calculateAccurateCableLength({
  horizontalMeters = 0,
  verticalDropSource = 1.5,
  verticalDropDest = 1.5,
  serviceLoopMeters = 2.0,
  slackMarginPercent = 5
} = {}) {
  const horizontal = Math.max(0, Number(horizontalMeters) || 0);
  const vSrc = Math.max(0, Number(verticalDropSource) || 0);
  const vDest = Math.max(0, Number(verticalDropDest) || 0);
  const vTotal = vSrc + vDest;
  const loop = Math.max(0, Number(serviceLoopMeters) || 0);
  const slackPct = Math.max(0, Math.min(30, Number(slackMarginPercent) || 0));

  const subtotal = horizontal + vTotal + loop;
  const slackAmount = subtotal * (slackPct / 100);
  const totalPhysical = Math.round((subtotal + slackAmount) * 10) / 10;

  return {
    horizontalMeters: Math.round(horizontal * 10) / 10,
    verticalTotal: Math.round(vTotal * 10) / 10,
    verticalDropSource: Math.round(vSrc * 10) / 10,
    verticalDropDest: Math.round(vDest * 10) / 10,
    serviceLoopMeters: Math.round(loop * 10) / 10,
    slackMarginPercent: slackPct,
    slackAmount: Math.round(slackAmount * 10) / 10,
    totalPhysical
  };
}

/**
 * Calculate comprehensive network performance metrics for a given cable run:
 * - IEEE 802.3 Compliance (90m Permanent Link / 100m Channel Link)
 * - Propagation delay (latency in nanoseconds)
 * - Total signal insertion loss / attenuation in dB
 * - DC loop resistance & PoE voltage drop
 * @param {Object} options
 * @param {number} options.totalLength
 * @param {number} options.horizontalLength
 * @param {string} options.category
 * @param {string} [options.poeSupport='poe+']
 * @returns {Object}
 */
export function calculateNetworkPerformanceMetrics({
  totalLength = 0,
  horizontalLength = 0,
  category = 'cat6',
  poeSupport = 'poe+'
} = {}) {
  const len = Math.max(0, Number(totalLength) || 0);
  const mediaType = getMediaTypeByCableCategory(category);

  // 1. IEEE 802.3 Ethernet Compliance
  let ethernetCompliance = {
    isEthernet: mediaType === 'twisted-pair',
    status: 'pass', // 'pass' | 'warning' | 'exceeded'
    permanentLinkMax: 90,
    channelLinkMax: 100,
    marginMeters: Math.round((100 - len) * 10) / 10,
    badgeText: 'Lolos Standar IEEE (Optimal)',
    badgeColor: 'var(--status-online, #22c55e)',
    message: `Normal (${len.toFixed(1)}m / maks 100m standar IEEE 802.3).`
  };

  if (mediaType === 'twisted-pair') {
    if (len > 100) {
      ethernetCompliance.status = 'exceeded';
      ethernetCompliance.badgeText = 'Melebihi Batas 100m!';
      ethernetCompliance.badgeColor = 'var(--status-offline, #ef4444)';
      ethernetCompliance.message = `Panjang fisik (${len.toFixed(1)}m) melebihi batas 100m IEEE 802.3! Sinyal berisiko degradasi, packet loss tinggi, atau negosiasi link drop ke 100 Mbps.`;
    } else if (len >= 90) {
      ethernetCompliance.status = 'warning';
      ethernetCompliance.badgeText = 'Mendekati Batas (90-100m)';
      ethernetCompliance.badgeColor = 'var(--status-warning, #f59e0b)';
      ethernetCompliance.message = `Panjang fisik (${len.toFixed(1)}m) mendekati batas channel 100m. Melebihi batas Permanent Link (90m). Hindari penambahan patch cord panjang.`;
    }
  }

  // 2. Physical Propagation Delay & Latency
  // NVP (Nominal Velocity of Propagation)
  let nvp = 0.68; // Cat6 / Cat6A standard ~68% speed of light
  if (category === 'cat5e') nvp = 0.65;
  if (category === 'fiber-sm' || category === 'fiber-mm') nvp = 0.67;
  if (category === 'coaxial') nvp = 0.82;
  if (category === 'wireless-link') nvp = 1.0;

  // c = 299,792,458 m/s -> (c * nvp) / 10^9 meters per nanosecond
  const speedMetersPerNs = 0.299792458 * nvp;
  const delayNs = len > 0 ? len / speedMetersPerNs : 0;
  const delayUs = delayNs / 1000;

  // 3. Attenuation / Insertion Loss in dB
  let attenuationDb = 0;
  if (mediaType === 'fiber') {
    const fiberType = category === 'fiber-mm' ? 'mm' : 'sm';
    attenuationDb = estimateFiberAttenuation(len, fiberType);
  } else if (mediaType === 'twisted-pair') {
    // Copper loss at standard frequencies:
    // Cat5e ~2.2 dB/100m at 100MHz
    // Cat6 ~1.9 dB/100m at 250MHz
    // Cat6A ~1.7 dB/100m at 500MHz
    let lossPer100m = 2.1;
    if (category === 'cat6') lossPer100m = 1.9;
    if (category === 'cat6a') lossPer100m = 1.7;
    attenuationDb = Math.round((len / 100 * lossPer100m + 0.4) * 100) / 100; // +0.4dB for 2 RJ45 jacks
  } else if (mediaType === 'coaxial') {
    attenuationDb = Math.round((len / 100 * 6.5 + 0.3) * 100) / 100;
  }

  // 4. DC Resistance & PoE Voltage Drop (for twisted-pair)
  let poeAnalysis = null;
  if (mediaType === 'twisted-pair' && poeSupport !== 'none') {
    const rPer100m = category === 'cat6a' ? 13.5 : (category === 'cat6' ? 14.5 : 18.0); // Ohms loop per 100m
    const totalResistance = Math.round((len / 100 * rPer100m) * 10) / 10;

    let psePowerWatts = 15.4;
    let pseVoltage = 48.0;
    let currentAmps = 0.35;

    if (poeSupport === 'poe+') {
      psePowerWatts = 30.0;
      pseVoltage = 54.0;
      currentAmps = 0.60;
    } else if (poeSupport === 'poe++') {
      psePowerWatts = 60.0;
      pseVoltage = 54.0;
      currentAmps = 1.20;
    }

    const voltageDrop = Math.round((currentAmps * totalResistance) * 10) / 10;
    const powerLossWatts = Math.round((currentAmps * currentAmps * totalResistance) * 10) / 10;
    const deliveredVoltage = Math.max(0, Math.round((pseVoltage - voltageDrop) * 10) / 10);
    const deliveredPowerWatts = Math.max(0, Math.round((psePowerWatts - powerLossWatts) * 10) / 10);

    poeAnalysis = {
      standard: poeSupport,
      totalResistanceOhm: totalResistance,
      voltageDropVolts: voltageDrop,
      deliveredVoltageVolts: deliveredVoltage,
      powerLossWatts,
      deliveredPowerWatts,
      efficiencyPercent: Math.round(((psePowerWatts - powerLossWatts) / psePowerWatts) * 100)
    };
  }

  return {
    mediaType,
    totalLength: len,
    horizontalLength: Math.round(horizontalLength * 10) / 10,
    ethernetCompliance,
    latency: {
      delayNanoseconds: Math.round(delayNs * 10) / 10,
      delayMicroseconds: Math.round(delayUs * 100) / 100,
      nvpPercent: Math.round(nvp * 100)
    },
    attenuationDb,
    poeAnalysis
  };
}

/**
 * Check if copper twisted-pair cable length exceeds IEEE 802.3 100-meter standard
 * @param {number} lengthMeters 
 * @returns {{isExceeded: boolean, message: string}}
 */
export function checkEthernetLengthLimit(lengthMeters) {
  if (lengthMeters > 100) {
    return {
      isExceeded: true,
      message: `Panjang (${lengthMeters.toFixed(1)}m) melebihi batas 100m IEEE 802.3! Sinyal berisiko degradasi atau packet drop.`
    };
  }
  return {
    isExceeded: false,
    message: `Normal (${lengthMeters.toFixed(1)}m / maks 100m standar ethernet).`
  };
}



