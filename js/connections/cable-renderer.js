/**
 * NetMap — Cable Canvas Renderer
 * Renders dynamic polyline cable routes on connectionLayer and waypoint handles on interactionLayer
 */

import { getCableDefByCategory, CABLE_STATUSES, getMediaTypeByCableCategory } from './cable-library.js';
import { clamp } from '../utils/helpers.js';

export class CableRenderer {
  /**
   * @param {Object} options
   * @param {Konva.Layer} options.connectionLayer
   * @param {Konva.Layer} options.interactionLayer
   * @param {number} options.naturalWidth
   * @param {number} options.naturalHeight
   * @param {Function} options.onSelect
   * @param {Function} [options.onContextMenu]
   * @param {Function} options.onWaypointMoved
   * @param {Function} options.onWaypointDeleted
   */
  constructor({
    connectionLayer,
    interactionLayer,
    naturalWidth = 1024,
    naturalHeight = 1024,
    onSelect,
    onContextMenu = null,
    onWaypointMoved,
    onWaypointDeleted
  }) {
    this.connectionLayer = connectionLayer;
    this.interactionLayer = interactionLayer;
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;
    this.onSelect = onSelect;
    this.onContextMenu = onContextMenu;
    this.onWaypointMoved = onWaypointMoved;
    this.onWaypointDeleted = onWaypointDeleted;

    this.selectedCableId = null;
    this.lineMap = new Map(); // cableId -> Konva.Line
    this.labelMap = new Map(); // cableId -> Konva.Label
    this.waypointHandles = []; // Array of Konva.Circle
    this.showDistanceLabels = true;
  }

  /**
   * Calculate exact coordinate (x, y) along polyline midpoint
   * @param {number[]} flatPoints [x0, y0, x1, y1, ...]
   * @returns {{x: number, y: number}}
   */
  calculatePathMidpoint(flatPoints) {
    if (!flatPoints || flatPoints.length < 4) {
      return { x: flatPoints?.[0] || 0, y: flatPoints?.[1] || 0 };
    }

    let totalLength = 0;
    const segLengths = [];
    for (let i = 0; i < flatPoints.length - 2; i += 2) {
      const x1 = flatPoints[i];
      const y1 = flatPoints[i + 1];
      const x2 = flatPoints[i + 2];
      const y2 = flatPoints[i + 3];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      segLengths.push(len);
      totalLength += len;
    }

    if (totalLength === 0) {
      return { x: flatPoints[0], y: flatPoints[1] };
    }

    const halfDist = totalLength / 2;
    let accumulated = 0;

    for (let i = 0; i < segLengths.length; i++) {
      const segLen = segLengths[i];
      if (accumulated + segLen >= halfDist) {
        const remaining = halfDist - accumulated;
        const ratio = segLen > 0 ? remaining / segLen : 0;
        const pIndex = i * 2;
        const x1 = flatPoints[pIndex];
        const y1 = flatPoints[pIndex + 1];
        const x2 = flatPoints[pIndex + 2];
        const y2 = flatPoints[pIndex + 3];
        return {
          x: x1 + (x2 - x1) * ratio,
          y: y1 + (y2 - y1) * ratio
        };
      }
      accumulated += segLen;
    }

    return {
      x: flatPoints[flatPoints.length - 2],
      y: flatPoints[flatPoints.length - 1]
    };
  }

  /**
   * Render or update a cable polyline on connectionLayer
   * @param {Object} cable 
   * @param {Object} sourceDev 
   * @param {Object} destDev 
   * @returns {Konva.Line|null}
   */
  renderCable(cable, sourceDev, destDev) {
    if (!sourceDev || !destDev) return null;

    const isSelected = this.selectedCableId === cable.id;
    const catDef = getCableDefByCategory(cable.cableCategory);
    const statusDef = CABLE_STATUSES[cable.status] || CABLE_STATUSES.active;

    // Calculate flat points: [srcX, srcY, wp1X, wp1Y, ..., destX, destY]
    const flatPoints = this.calculateFlatPixelPoints(cable, sourceDev, destDev);

    let line = this.lineMap.get(cable.id);

    // Determine visual style based on category, customColor & status
    let strokeColor = (cable.customColor && cable.customColor.trim()) ? cable.customColor.trim() : catDef.color;
    let dashPattern = catDef.dash;

    if (cable.status === 'damaged') {
      strokeColor = statusDef.color;
      dashPattern = statusDef.dash;
    } else if (cable.status === 'maintenance') {
      strokeColor = statusDef.color;
      dashPattern = statusDef.dash;
    } else if (cable.status === 'inactive') {
      dashPattern = statusDef.dash;
    }

    const strokeWidth = isSelected ? catDef.strokeWidth + 2 : catDef.strokeWidth;

    if (!line) {
      line = new Konva.Line({
        id: `cable-${cable.id}`,
        name: 'cable-line',
        points: flatPoints,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        dash: dashPattern,
        lineCap: 'round',
        lineJoin: 'round',
        hitStrokeWidth: 16, // Generous hit area for clicking
        shadowColor: isSelected ? '#76c457' : null,
        shadowBlur: isSelected ? 6 : 0,
        perfectDrawEnabled: false,
        opacity: cable.status === 'inactive' ? 0.45 : 1.0
      });

      line.setAttr('baseStrokeWidth', strokeWidth);
      line.setAttr('cableData', cable);

      // Click to select
      line.on('click tap', (e) => {
        e.cancelBubble = true;
        if (this.onSelect) {
          this.onSelect(cable.id);
        }
      });

      // Right-Click Context Menu
      line.on('contextmenu', (e) => {
        e.evt.preventDefault();
        e.cancelBubble = true;
        const cur = line.getAttr('cableData') || cable;
        if (this.onContextMenu) {
          this.onContextMenu(cur, e.evt.clientX, e.evt.clientY);
        }
      });

      // Hover glow
      line.on('mouseenter', () => {
        if (line.getStage()?.isDragging()) return;
        document.body.style.cursor = 'pointer';
        const currentBase = line.getAttr('baseStrokeWidth') || catDef.strokeWidth;
        line.strokeWidth(currentBase + 1.5);
        this.connectionLayer.batchDraw();
      });

      line.on('mouseleave', () => {
        if (line.getStage()?.isDragging()) return;
        document.body.style.cursor = 'default';
        const currentBase = line.getAttr('baseStrokeWidth') || catDef.strokeWidth;
        line.strokeWidth(currentBase);
        this.connectionLayer.batchDraw();
      });

      this.connectionLayer.add(line);
      this.lineMap.set(cable.id, line);
    } else {
      line.setAttr('cableData', cable);
      line.points(flatPoints);
      line.stroke(strokeColor);
      line.strokeWidth(strokeWidth);
      line.setAttr('baseStrokeWidth', strokeWidth);
      line.dash(dashPattern);
      line.shadowColor(isSelected ? '#76c457' : null);
      line.shadowBlur(isSelected ? 6 : 0);
      line.opacity(cable.status === 'inactive' ? 0.45 : 1.0);
    }

    // Render / update on-canvas distance badge at polyline midpoint
    this.renderDistanceBadge(cable, flatPoints, strokeColor, isSelected);

    // If selected, refresh waypoint handles
    if (isSelected) {
      this.renderWaypointHandles(cable, sourceDev, destDev);
    }

    return line;
  }

  /**
   * Render or update distance badge on canvas at midpoint of cable
   * @param {Object} cable 
   * @param {number[]} flatPoints 
   * @param {string} strokeColor 
   * @param {boolean} isSelected 
   */
  renderDistanceBadge(cable, flatPoints, strokeColor, isSelected) {
    const mid = this.calculatePathMidpoint(flatPoints);
    const mediaType = getMediaTypeByCableCategory(cable.cableCategory);
    const cableLen = Number(cable.length) || 0;
    const isOverLimit = mediaType === 'twisted-pair' && (cableLen > 100);
    const labelText = isOverLimit 
      ? `⚠️ ${cableLen.toFixed(1)}m` 
      : `${cableLen.toFixed(1)}m`;

    let badge = this.labelMap.get(cable.id);

    if (!badge) {
      badge = new Konva.Label({
        name: 'cable-distance-label',
        listening: false,
        visible: this.showDistanceLabels !== false
      });

      const tag = new Konva.Tag({
        name: 'cable-distance-tag',
        fill: isOverLimit ? 'rgba(80, 10, 10, 0.94)' : 'rgba(20, 36, 14, 0.94)',
        stroke: isOverLimit ? '#ef4444' : strokeColor,
        strokeWidth: isSelected ? 1.5 : 1.1,
        cornerRadius: 4,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false
      });

      const text = new Konva.Text({
        name: 'cable-distance-text',
        text: labelText,
        fontSize: 10,
        fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
        fontStyle: '600',
        fill: isOverLimit ? '#fca5a5' : '#fff8cf',
        padding: 3,
        align: 'center',
        perfectDrawEnabled: false
      });

      badge.add(tag);
      badge.add(text);
      this.connectionLayer.add(badge);
      this.labelMap.set(cable.id, badge);
    } else {
      const tag = badge.findOne('.cable-distance-tag');
      const text = badge.findOne('.cable-distance-text');
      if (text) {
        text.text(labelText);
        text.fill(isOverLimit ? '#fca5a5' : '#fff8cf');
      }
      if (tag) {
        tag.fill(isOverLimit ? 'rgba(80, 10, 10, 0.92)' : 'rgba(20, 36, 14, 0.92)');
        tag.stroke(isOverLimit ? '#ef4444' : strokeColor);
        tag.strokeWidth(isSelected ? 1.5 : 1);
      }
      badge.visible(this.showDistanceLabels !== false);
    }

    // Center badge at midpoint
    const textNode = badge.findOne('.cable-distance-text');
    const badgeW = textNode ? textNode.width() : 40;
    const badgeH = textNode ? textNode.height() : 16;
    badge.position({
      x: mid.x - badgeW / 2,
      y: mid.y - badgeH / 2
    });
  }

  /**
   * Set visibility of all on-canvas distance labels
   * @param {boolean} visible 
   */
  setDistanceLabelsVisible(visible) {
    this.showDistanceLabels = Boolean(visible);
    this.labelMap.forEach((badge) => {
      badge.visible(this.showDistanceLabels);
    });
    this.connectionLayer.batchDraw();
  }

  /**
   * Convert source, waypoints, and destination to flat pixel points array
   * @param {Object} cable 
   * @param {Object} sourceDev 
   * @param {Object} destDev 
   * @returns {number[]}
   */
  calculateFlatPixelPoints(cable, sourceDev, destDev) {
    const points = [];

    // 1. Source point
    points.push(
      sourceDev.position.x * this.naturalWidth,
      sourceDev.position.y * this.naturalHeight
    );

    // 2. Intermediate waypoints
    if (Array.isArray(cable.route)) {
      cable.route.forEach((wp) => {
        points.push(
          wp.x * this.naturalWidth,
          wp.y * this.naturalHeight
        );
      });
    }

    // 3. Destination point
    points.push(
      destDev.position.x * this.naturalWidth,
      destDev.position.y * this.naturalHeight
    );

    return points;
  }

  /**
   * Render interactive draggable waypoint handles on interactionLayer
   * @param {Object} cable 
   * @param {Object} sourceDev 
   * @param {Object} destDev 
   */
  renderWaypointHandles(cable, sourceDev, destDev) {
    this.clearWaypointHandles();

    if (!Array.isArray(cable.route) || cable.route.length === 0) {
      this.interactionLayer.batchDraw();
      return;
    }

    cable.route.forEach((wp, index) => {
      const px = wp.x * this.naturalWidth;
      const py = wp.y * this.naturalHeight;

      const handle = new Konva.Circle({
        name: 'waypoint-handle',
        x: px,
        y: py,
        radius: 6,
        fill: '#76c457',
        stroke: '#18350d',
        strokeWidth: 2,
        draggable: true,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false
      });

      // Dragging handle updates cable route in real-time
      handle.on('dragmove', () => {
        const clampedX = clamp(handle.x(), 0, this.naturalWidth);
        const clampedY = clamp(handle.y(), 0, this.naturalHeight);
        handle.position({ x: clampedX, y: clampedY });

        // Update temporary point in line
        cable.route[index].x = clampedX / this.naturalWidth;
        cable.route[index].y = clampedY / this.naturalHeight;

        const updatedPoints = this.calculateFlatPixelPoints(cable, sourceDev, destDev);
        const line = this.lineMap.get(cable.id);
        if (line) {
          line.points(updatedPoints);
          this.connectionLayer.batchDraw();
        }

        // Keep distance badge centered during dragging
        const badge = this.labelMap.get(cable.id);
        if (badge) {
          const mid = this.calculatePathMidpoint(updatedPoints);
          const textNode = badge.findOne('.cable-distance-text');
          const badgeW = textNode ? textNode.width() : 40;
          const badgeH = textNode ? textNode.height() : 16;
          badge.position({
            x: mid.x - badgeW / 2,
            y: mid.y - badgeH / 2
          });
        }
      });

      handle.on('dragend', () => {
        const norm = {
          x: handle.x() / this.naturalWidth,
          y: handle.y() / this.naturalHeight
        };
        if (this.onWaypointMoved) {
          this.onWaypointMoved(cable.id, index, norm);
        }
      });

      // Double click or right-click to delete waypoint
      handle.on('dblclick dbltap contextmenu', (e) => {
        e.evt.preventDefault();
        e.cancelBubble = true;
        if (this.onWaypointDeleted) {
          this.onWaypointDeleted(cable.id, index);
        }
      });

      this.interactionLayer.add(handle);
      this.waypointHandles.push(handle);
    });

    this.interactionLayer.batchDraw();
  }

  /**
   * Clear waypoint handles from interactionLayer
   */
  clearWaypointHandles() {
    this.waypointHandles.forEach((handle) => handle.destroy());
    this.waypointHandles = [];
    this.interactionLayer.batchDraw();
  }

  /**
   * Set currently selected cable ID
   * @param {string} cableId 
   */
  setSelectedCable(cableId) {
    this.selectedCableId = cableId;
    if (!cableId) {
      this.clearWaypointHandles();
    }
  }

  /**
   * Remove a cable line and its distance badge from canvas
   * @param {string} cableId 
   */
  removeCable(cableId) {
    const line = this.lineMap.get(cableId);
    if (line) {
      line.destroy();
      this.lineMap.delete(cableId);
    }
    const badge = this.labelMap.get(cableId);
    if (badge) {
      badge.destroy();
      this.labelMap.delete(cableId);
    }
    this.connectionLayer.batchDraw();

    if (this.selectedCableId === cableId) {
      this.clearWaypointHandles();
    }
  }
}
