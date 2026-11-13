/**
 * NetMap — Wireless Coverage Zone Engine & Renderer
 * Provides physical distance/area calculations, hatched RF coverage visualization,
 * interactive radius manipulation, and real-time metric badges.
 */

import { clamp } from '../utils/helpers.js';

// Physical campus scale: 1024px represents 400 meters
export const CAMPUS_PHYSICAL_WIDTH_METERS = 400;

/**
 * Convert real-world meters to stage pixels
 * @param {number} meters 
 * @param {number} [mapWidth=1024] 
 * @returns {number}
 */
export function metersToPixels(meters, mapWidth = 1024) {
  const pixelsPerMeter = mapWidth / CAMPUS_PHYSICAL_WIDTH_METERS;
  return meters * pixelsPerMeter;
}

/**
 * Convert stage pixels to real-world meters
 * @param {number} pixels 
 * @param {number} [mapWidth=1024] 
 * @returns {number}
 */
export function pixelsToMeters(pixels, mapWidth = 1024) {
  const metersPerPixel = CAMPUS_PHYSICAL_WIDTH_METERS / mapWidth;
  return pixels * metersPerPixel;
}

/**
 * Calculate coverage surface area in square meters (m²)
 * @param {number} radiusMeters 
 * @returns {number}
 */
export function calculateCoverageArea(radiusMeters) {
  return Math.PI * radiusMeters * radiusMeters;
}

/**
 * Format square meters with Indonesian locale formatting
 * @param {number} areaM2 
 * @returns {string}
 */
export function formatCoverageArea(areaM2) {
  return Math.round(areaM2).toLocaleString('id-ID') + ' m²';
}

/**
 * Preset wireless coverage templates for network engineers
 */
export const WIRELESS_PRESETS = [
  { id: 'indoor-small', name: 'Indoor AP Ringan (15 m)', meters: 15, band: '5ghz', color: '#76c457' },
  { id: 'indoor-std', name: 'Standard Enterprise AP (25 m)', meters: 25, band: 'dual-band', color: '#76c457' },
  { id: 'indoor-high', name: 'High-Density Gedung (35 m)', meters: 35, band: 'dual-band', color: '#06b6d4' },
  { id: 'outdoor-ap', name: 'Outdoor AP Lapangan (50 m)', meters: 50, band: '2.4ghz', color: '#f59e0b' },
  { id: 'ptp-bridge', name: 'PtP Wireless Bridge (100 m)', meters: 100, band: 'ptp', color: '#a855f7' }
];

export class WirelessCoverageRenderer {
  /**
   * @param {Object} options
   * @param {number} [options.naturalWidth=1024]
   * @param {Function} [options.onRadiusChange]
   */
  constructor({ naturalWidth = 1024, onRadiusChange = null } = {}) {
    this.naturalWidth = naturalWidth;
    this.onRadiusChange = onRadiusChange;
    this.globalVisible = true;
  }

  /**
   * Set global visibility of all coverage zones
   * @param {boolean} visible 
   */
  setGlobalVisibility(visible) {
    this.globalVisible = visible;
  }

  /**
   * Cache coverage shape bitmap so pan/zoom doesn't re-run clip & hatch paths every frame
   * @param {Konva.Shape} shape
   * @param {number} radiusPixels
   */
  cacheShape(shape, radiusPixels) {
    if (!shape || typeof document === 'undefined' || typeof shape.cache !== 'function' || radiusPixels <= 0) return;
    try {
      const pad = 4;
      const size = (radiusPixels + pad) * 2;
      shape.clearCache();
      shape.cache({
        x: -(radiusPixels + pad),
        y: -(radiusPixels + pad),
        width: size,
        height: size,
        pixelRatio: 1.5
      });
    } catch (e) {}
  }

  /**
   * Create a Konva.Group containing the coverage shape, perimeter, measurement label, and resize handle
   * @param {Object} device 
   * @param {boolean} isSelected 
   * @returns {Konva.Group}
   */
  createCoverageGroup(device, isSelected) {
    const cov = device.wirelessCoverage;
    const group = new Konva.Group({
      name: 'wireless-coverage-group',
      x: 0,
      y: 0,
      visible: Boolean(this.globalVisible && cov && cov.enabled)
    });

    if (!cov || !cov.enabled) {
      return group;
    }

    const radiusMeters = cov.radiusMeters || 25;
    const radiusPixels = metersToPixels(radiusMeters, this.naturalWidth);
    const color = cov.color || '#76c457';
    const opacity = typeof cov.opacity === 'number' ? cov.opacity : 0.18;
    const hatch = cov.hatch !== undefined ? Boolean(cov.hatch) : true;
    const band = cov.band || 'dual-band';

    // 1. Hatched & Filled Coverage Circle Shape
    const coverageShape = new Konva.Shape({
      name: 'coverage-shape',
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      sceneFunc: (context, shape) => {
        const r = shape.getAttr('radiusPixels') || radiusPixels;
        const curColor = shape.getAttr('color') || color;
        const curOpacity = shape.getAttr('opacity') || opacity;
        const curHatch = shape.getAttr('hatch') !== undefined ? shape.getAttr('hatch') : hatch;
        const curBand = shape.getAttr('band') || band;

        context.save();
        context.beginPath();
        context.arc(0, 0, r, 0, Math.PI * 2, false);
        context.closePath();

        // Base translucent fill
        context.fillStyle = curColor;
        context.globalAlpha = curOpacity;
        context.fill();

        // Diagonal Hatching (Arsiran) in a SINGLE batched path call
        if (curHatch) {
          context.save();
          context.clip();
          context.strokeStyle = curColor;
          context.lineWidth = 1;
          context.globalAlpha = curOpacity * 1.6;
          const step = 14;
          context.beginPath();
          for (let x = -r * 2; x <= r * 2; x += step) {
            context.moveTo(x - r, -r);
            context.lineTo(x + r, r);
          }
          context.stroke();
          context.restore();
        }

        // Inner Core Ring for Dual-Band 5GHz
        if (curBand === 'dual-band') {
          context.save();
          context.beginPath();
          context.arc(0, 0, r * 0.55, 0, Math.PI * 2, false);
          context.strokeStyle = curColor;
          context.lineWidth = 1;
          context.globalAlpha = 0.45;
          context.setLineDash([4, 4]);
          context.stroke();
          context.restore();
        }

        // Outer Dashed Perimeter
        context.save();
        context.beginPath();
        context.arc(0, 0, r, 0, Math.PI * 2, false);
        context.strokeStyle = curColor;
        context.lineWidth = 1.6;
        context.globalAlpha = 0.85;
        context.setLineDash([6, 4]);
        context.stroke();
        context.restore();

        context.restore();
      },
      listening: false
    });

    coverageShape.setAttr('radiusPixels', radiusPixels);
    coverageShape.setAttr('color', color);
    coverageShape.setAttr('opacity', opacity);
    coverageShape.setAttr('hatch', hatch);
    coverageShape.setAttr('band', band);
    this.cacheShape(coverageShape, radiusPixels);
    group.add(coverageShape);

    // 2. Metric Label Pill (Displays Radius, Area, Band)
    const labelGroup = new Konva.Group({
      name: 'coverage-label-group',
      y: -radiusPixels - 14,
      visible: Boolean(cov.showLabel !== false),
      listening: false
    });

    const areaM2 = calculateCoverageArea(radiusMeters);
    const bandLabel = band === 'dual-band' ? 'Dual-Band' : (band === '5ghz' ? '5 GHz' : (band === 'ptp' ? 'PtP' : '2.4 GHz'));
    const labelTextContent = `📶 ${radiusMeters}m • ${formatCoverageArea(areaM2)} (${bandLabel})`;

    const labelBg = new Konva.Tag({
      fill: 'rgba(24, 53, 13, 0.92)',
      stroke: color,
      strokeWidth: 1.1,
      cornerRadius: 4,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false
    });

    const labelText = new Konva.Text({
      name: 'coverage-label-text',
      text: labelTextContent,
      fontSize: 10,
      fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
      fontStyle: '600',
      fill: '#fff8cf',
      padding: 4,
      align: 'center',
      perfectDrawEnabled: false
    });

    const labelLabel = new Konva.Label({
      name: 'coverage-label-bubble'
    });
    labelLabel.add(labelBg);
    labelLabel.add(labelText);
    labelLabel.offsetX(labelText.width() / 2);
    labelGroup.add(labelLabel);
    group.add(labelGroup);

    // 3. Interactive Resize Handle (Shown when device is selected)
    const handle = new Konva.Circle({
      name: 'coverage-resize-handle',
      x: radiusPixels,
      y: 0,
      radius: 6,
      fill: '#ffffff',
      stroke: color,
      strokeWidth: 2,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      draggable: true,
      visible: isSelected,
      cursor: 'ew-resize'
    });

    // Handle cursor styles
    handle.on('mouseenter', () => {
      document.body.style.cursor = 'ew-resize';
      handle.scale({ x: 1.25, y: 1.25 });
      handle.getLayer()?.batchDraw();
    });

    handle.on('mouseleave', () => {
      document.body.style.cursor = 'default';
      handle.scale({ x: 1.0, y: 1.0 });
      handle.getLayer()?.batchDraw();
    });

    // Drag-to-resize logic
    handle.on('dragmove', (e) => {
      e.cancelBubble = true;
      const dx = handle.x();
      const dy = handle.y();
      let curRadiusPx = Math.sqrt(dx * dx + dy * dy);
      
      // Clamp between 5m (~13px) and 150m (~384px)
      curRadiusPx = clamp(curRadiusPx, 15, 384);
      handle.position({ x: curRadiusPx, y: 0 });

      // Update shape live (uncached while dragging handle for instant visual feedback)
      if (typeof coverageShape.clearCache === 'function') {
        coverageShape.clearCache();
      }
      coverageShape.setAttr('radiusPixels', curRadiusPx);

      // Update label
      const curMeters = Math.round(pixelsToMeters(curRadiusPx, this.naturalWidth));
      const curArea = calculateCoverageArea(curMeters);
      labelText.text(`📶 ${curMeters}m • ${formatCoverageArea(curArea)} (${bandLabel})`);
      labelLabel.offsetX(labelText.width() / 2);
      labelGroup.y(-curRadiusPx - 14);

      group.getLayer()?.batchDraw();
    });

    handle.on('dragend', (e) => {
      e.cancelBubble = true;
      const finalRadiusPx = handle.x();
      const finalMeters = Math.round(pixelsToMeters(finalRadiusPx, this.naturalWidth));
      this.cacheShape(coverageShape, finalRadiusPx);

      if (this.onRadiusChange) {
        this.onRadiusChange(device.id, finalMeters);
      }
    });

    group.add(handle);
    return group;
  }

  /**
   * Update visuals of an existing coverage group
   * @param {Konva.Group} deviceGroup 
   * @param {Object} device 
   * @param {boolean} isSelected 
   */
  updateCoverageGroup(deviceGroup, device, isSelected) {
    const cov = device.wirelessCoverage;
    let group = deviceGroup.findOne('.wireless-coverage-group');

    if (!cov || !cov.enabled) {
      if (group) group.visible(false);
      return;
    }

    if (!group) {
      group = this.createCoverageGroup(device, isSelected);
      deviceGroup.add(group);
      group.moveToBottom();
      return;
    }

    group.visible(Boolean(this.globalVisible && cov.enabled));

    const radiusMeters = cov.radiusMeters || 25;
    const radiusPixels = metersToPixels(radiusMeters, this.naturalWidth);
    const color = cov.color || '#76c457';
    const opacity = typeof cov.opacity === 'number' ? cov.opacity : 0.18;
    const hatch = cov.hatch !== undefined ? Boolean(cov.hatch) : true;
    const band = cov.band || 'dual-band';

    // Update Shape & Re-cache bitmap
    const shape = group.findOne('.coverage-shape');
    if (shape) {
      if (typeof shape.clearCache === 'function') shape.clearCache();
      shape.setAttr('radiusPixels', radiusPixels);
      shape.setAttr('color', color);
      shape.setAttr('opacity', opacity);
      shape.setAttr('hatch', hatch);
      shape.setAttr('band', band);
      this.cacheShape(shape, radiusPixels);
    }

    // Update Label
    const labelGroup = group.findOne('.coverage-label-group');
    if (labelGroup) {
      labelGroup.visible(Boolean(cov.showLabel !== false));
      labelGroup.y(-radiusPixels - 14);

      const labelText = labelGroup.findOne('.coverage-label-text');
      const labelBubble = labelGroup.findOne('.coverage-label-bubble');
      if (labelText) {
        const areaM2 = calculateCoverageArea(radiusMeters);
        const bandLabel = band === 'dual-band' ? 'Dual-Band' : (band === '5ghz' ? '5 GHz' : (band === 'ptp' ? 'PtP' : '2.4 GHz'));
        labelText.text(`📶 ${radiusMeters}m • ${formatCoverageArea(areaM2)} (${bandLabel})`);
        if (labelBubble) {
          labelBubble.offsetX(labelText.width() / 2);
        }
      }
    }

    // Update Resize Handle
    const handle = group.findOne('.coverage-resize-handle');
    if (handle) {
      handle.position({ x: radiusPixels, y: 0 });
      handle.stroke(color);
      handle.visible(isSelected);
    }
  }

  /**
   * Set selection state on coverage group
   * @param {Konva.Group} deviceGroup 
   * @param {boolean} isSelected 
   */
  setSelection(deviceGroup, isSelected) {
    const handle = deviceGroup.findOne('.coverage-resize-handle');
    if (handle) {
      handle.visible(isSelected);
    }
  }
}

