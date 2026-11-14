/**
 * NetMap — Device Marker Canvas Renderer
 * Renders interactive Konva.Group markers for devices on deviceLayer
 */

import { DEVICE_CATEGORIES, DEVICE_STATUSES, getDeviceDefByType } from './device-library.js';
import { getDeviceIconImage, loadDeviceCustomImage, getDefaultIconForType } from './device-icon-factory.js';
import { WirelessCoverageRenderer } from './wireless-coverage.js';
import { clamp } from '../utils/helpers.js';

export class DeviceRenderer {
  /**
   * @param {Object} options
   * @param {number} options.naturalWidth
   * @param {number} options.naturalHeight
   * @param {Konva.Layer} [options.deviceLayer]
   * @param {Function} options.onSelect
   * @param {Function} options.onMove
   * @param {Function} [options.onGroupMove]
   * @param {Function} [options.onRadiusChange]
   * @param {Function} [options.onContextMenu]
   */
  constructor({ naturalWidth = 1024, naturalHeight = 1024, deviceLayer = null, onSelect, onMove, onGroupMove = null, onRadiusChange = null, onContextMenu = null }) {
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;
    this.deviceLayer = deviceLayer;
    this.onSelect = onSelect;
    this.onMove = onMove;
    this.onGroupMove = onGroupMove;
    this.onRadiusChange = onRadiusChange;
    this.onContextMenu = onContextMenu;

    this.selectedDeviceId = null;
    this.selectedDeviceIds = new Set();
    this.markerMap = new Map(); // deviceId -> Konva.Group
    this._groupDragState = null;

    // Wireless RF coverage zone renderer
    this.coverageRenderer = new WirelessCoverageRenderer({
      naturalWidth: this.naturalWidth,
      onRadiusChange: (devId, meters) => {
        if (this.onRadiusChange) {
          this.onRadiusChange(devId, meters);
        }
      }
    });
  }

  /**
   * Create or update a Konva.Group for a device
   * @param {Object} device 
   * @returns {Konva.Group}
   */
  renderDevice(device) {
    let group = this.markerMap.get(device.id);
    const posX = device.position.x * this.naturalWidth;
    const posY = device.position.y * this.naturalHeight;

    if (!group) {
      group = this.createDeviceGroup(device, posX, posY);
      this.markerMap.set(device.id, group);
    } else {
      group.position({ x: posX, y: posY });
      this.updateDeviceVisuals(group, device);
    }

    group.setAttr('deviceData', device);
    return group;
  }

  /**
   * Safely cache a static Konva node (like baseCard or selectionRing with shadowBlur)
   * so shadow blurs are rasterized once instead of every pan/zoom frame
   * @param {Konva.Node} node
   * @param {number} [offset=14]
   */
  cacheNodeSafe(node, offset = 14) {
    if (!node || typeof document === 'undefined' || typeof node.cache !== 'function') return;
    try {
      node.clearCache();
      node.cache({ offset, pixelRatio: 2 });
    } catch (e) {}
  }

  /**
   * Instantiate a new Konva.Group marker
   * @param {Object} device 
   * @param {number} x 
   * @param {number} y 
   * @returns {Konva.Group}
   */
  createDeviceGroup(device, x, y) {
    const isSelected = this.selectedDeviceIds.has(device.id) || this.selectedDeviceId === device.id;
    const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
    const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;
    const def = getDeviceDefByType(device.type);

    const group = new Konva.Group({
      id: `marker-${device.id}`,
      name: 'device-marker',
      x: x,
      y: y,
      visible: device.layerVisible !== false,
      draggable: !device.layerLocked
    });

    // Custom data reference on node
    group.setAttr('deviceId', device.id);

    // 0. Wireless RF Coverage Zone (Hatched Circle + Metric Label + Resize Handle)
    const coverageGroup = this.coverageRenderer.createCoverageGroup(device, isSelected);
    group.add(coverageGroup);
    coverageGroup.moveToBottom();

    // 1. Selection Ring (Glowing ring around marker)
    const selectionRing = new Konva.Rect({
      name: 'selection-ring',
      x: -24,
      y: -24,
      width: 48,
      height: 48,
      cornerRadius: 12,
      stroke: '#2a7c13',
      strokeWidth: 2,
      dash: [6, 4],
      visible: isSelected,
      shadowColor: '#76c457',
      shadowBlur: 10,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      listening: false
    });
    this.cacheNodeSafe(selectionRing, 14);
    group.add(selectionRing);

    // 2. Base Shape (Marker Background Card)
    const baseCard = new Konva.Rect({
      name: 'base-card',
      x: -18,
      y: -18,
      width: 36,
      height: 36,
      cornerRadius: 8,
      fill: '#18350d',
      stroke: cat.color,
      strokeWidth: 2,
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      shadowBlur: 8,
      shadowOffset: { x: 0, y: 3 },
      shadowOpacity: 0.5,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false
    });
    group.add(baseCard);

    // 3. Graphic Icon / Custom Image Node
    const iconImage = new Konva.Image({
      name: 'device-icon-image',
      x: -12,
      y: -12,
      width: 24,
      height: 24,
      perfectDrawEnabled: false,
      listening: false
    });
    group.add(iconImage);

    // Fallback Icon / Text
    const iconCode = this.getDeviceShortCode(device.type);
    const iconText = new Konva.Text({
      name: 'icon-text',
      x: -18,
      y: -10,
      width: 36,
      text: iconCode,
      fontSize: 11,
      fontFamily: 'ui-monospace, monospace',
      fontStyle: 'bold',
      fill: cat.color,
      align: 'center',
      visible: false,
      perfectDrawEnabled: false,
      listening: false
    });
    group.add(iconText);

    // Render graphic icon or custom uploaded image (also caches baseCard)
    this.updateMarkerGraphic(group, device, cat);

    // 4. Status Indicator Badge (Top-Right Corner)
    const statusDot = new Konva.Circle({
      name: 'status-dot',
      x: 16,
      y: -16,
      radius: 5,
      fill: statusDef.color,
      stroke: '#18350d',
      strokeWidth: 1.5,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      listening: false
    });
    group.add(statusDot);

    // 5. Label Container (Pill under marker)
    const labelGroup = new Konva.Group({
      name: 'label-group',
      y: 24,
      listening: false
    });

    const labelText = new Konva.Text({
      name: 'label-text',
      text: this.formatLabel(device),
      fontSize: 10,
      fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fill: '#fff8cf',
      padding: 3,
      align: 'center',
      perfectDrawEnabled: false,
      listening: false
    });

    // Center label relative to marker
    labelText.offsetX(labelText.width() / 2);

    labelGroup.add(labelText);
    group.add(labelGroup);

    // --- Interaction Events ---

    // Click / Tap to Select (supports Ctrl/Cmd toggle & Shift additive)
    group.on('click tap', (e) => {
      e.cancelBubble = true; // Stop event bubbling to stage
      if (Date.now() - (group._lastDragEndTime || 0) < 120) return;
      const evt = e.evt || {};
      if (this.onSelect) {
        this.onSelect(device.id, {
          toggle: Boolean(evt.ctrlKey || evt.metaKey),
          additive: Boolean(evt.shiftKey)
        });
      }
    });

    // Right-Click Context Menu
    group.on('contextmenu', (e) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      const currentDev = group.getAttr('deviceData') || device;
      if (this.onContextMenu) {
        this.onContextMenu(currentDev, e.evt.clientX, e.evt.clientY);
      }
    });

    // Hover State (instant scale without 60fps Tween timer overhead)
    group.on('mouseenter', () => {
      if (group.getStage()?.isDragging()) return;
      document.body.style.cursor = 'pointer';
      group.scale({ x: 1.08, y: 1.08 });
      this.deviceLayer?.batchDraw();
    });

    group.on('mouseleave', () => {
      if (group.getStage()?.isDragging()) return;
      document.body.style.cursor = 'default';
      group.scale({ x: 1.0, y: 1.0 });
      this.deviceLayer?.batchDraw();
    });

    // Dragging events (supports group move when multiple devices are selected)
    group.on('dragstart', (e) => {
      e.cancelBubble = true;
      group.moveToTop();
      const evt = e.evt || {};
      const isAlreadyInMulti = this.selectedDeviceIds.size > 1 && this.selectedDeviceIds.has(device.id);
      if (this.onSelect) {
        this.onSelect(device.id, {
          toggle: false,
          additive: Boolean(evt.shiftKey),
          preserveMultiOnDrag: isAlreadyInMulti
        });
      }

      const peers = [];
      if (this.selectedDeviceIds.has(device.id) && this.selectedDeviceIds.size > 1) {
        this.selectedDeviceIds.forEach((peerId) => {
          if (peerId === device.id) return;
          const peerGroup = this.markerMap.get(peerId);
          if (!peerGroup || !peerGroup.draggable() || !peerGroup.visible()) return;
          peerGroup.moveToTop();
          peers.push({
            id: peerId,
            group: peerGroup,
            startX: peerGroup.x(),
            startY: peerGroup.y()
          });
        });
      }

      this._groupDragState = {
        primaryId: device.id,
        startX: group.x(),
        startY: group.y(),
        peers
      };
    });

    group.on('dragmove', (e) => {
      e.cancelBubble = true;
      // Clamp within map bounds during drag
      const curX = clamp(group.x(), 0, this.naturalWidth);
      const curY = clamp(group.y(), 0, this.naturalHeight);
      group.position({ x: curX, y: curY });

      const state = this._groupDragState;
      if (state && state.primaryId === device.id && state.peers.length > 0) {
        const dx = curX - state.startX;
        const dy = curY - state.startY;
        state.peers.forEach((peer) => {
          peer.group.position({
            x: clamp(peer.startX + dx, 0, this.naturalWidth),
            y: clamp(peer.startY + dy, 0, this.naturalHeight)
          });
        });
      }
    });

    group.on('dragend', (e) => {
      e.cancelBubble = true;
      group._lastDragEndTime = Date.now();
      const finalX = clamp(group.x(), 0, this.naturalWidth);
      const finalY = clamp(group.y(), 0, this.naturalHeight);
      group.position({ x: finalX, y: finalY });

      const state = this._groupDragState;
      this._groupDragState = null;

      if (state && state.primaryId === device.id && state.peers.length > 0 && this.onGroupMove) {
        const dx = finalX - state.startX;
        const dy = finalY - state.startY;
        const moves = [
          {
            id: device.id,
            position: {
              x: finalX / this.naturalWidth,
              y: finalY / this.naturalHeight
            }
          }
        ];
        state.peers.forEach((peer) => {
          const px = clamp(peer.startX + dx, 0, this.naturalWidth);
          const py = clamp(peer.startY + dy, 0, this.naturalHeight);
          peer.group.position({ x: px, y: py });
          moves.push({
            id: peer.id,
            position: {
              x: px / this.naturalWidth,
              y: py / this.naturalHeight
            }
          });
        });
        this.deviceLayer?.batchDraw();
        this.onGroupMove(moves);
      } else if (this.onMove) {
        const normalizedX = finalX / this.naturalWidth;
        const normalizedY = finalY / this.naturalHeight;
        this.onMove(device.id, { x: normalizedX, y: normalizedY });
      }
    });

    return group;
  }

  /**
   * Update visual properties of an existing group
   * @param {Konva.Group} group 
   * @param {Object} device 
   */
  updateDeviceVisuals(group, device) {
    const isSelected = this.selectedDeviceIds.has(device.id) || this.selectedDeviceId === device.id;
    const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
    const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;

    // Layer visibility & lock state (Photoshop Layer controls)
    group.visible(device.layerVisible !== false);
    group.draggable(!device.layerLocked);

    // Selection ring
    const ring = group.findOne('.selection-ring');
    if (ring) ring.visible(isSelected);

    // Base card stroke
    const card = group.findOne('.base-card');
    if (card) card.stroke(cat.color);

    // Graphic Icon or Custom Image
    this.updateMarkerGraphic(group, device, cat);

    // Wireless RF Coverage Zone
    this.coverageRenderer.updateCoverageGroup(group, device, isSelected);

    // Status dot
    const statusDot = group.findOne('.status-dot');
    if (statusDot) statusDot.fill(statusDef.color);

    // Label text
    const labelText = group.findOne('.label-text');
    if (labelText) {
      labelText.text(this.formatLabel(device));
      labelText.offsetX(labelText.width() / 2);
    }
  }

  /**
   * Render either the vector network icon or the user's custom uploaded image
   * @param {Konva.Group} group 
   * @param {Object} device 
   * @param {Object} cat 
   */
  updateMarkerGraphic(group, device, cat) {
    const iconImage = group.findOne('.device-icon-image');
    const iconText = group.findOne('.icon-text');
    const baseCard = group.findOne('.base-card');

    // Handle marker shape style: 'rounded', 'circle', 'icon-only'
    const style = device.markerStyle || 'rounded';
    if (baseCard) {
      if (typeof baseCard.clearCache === 'function') baseCard.clearCache();
      if (style === 'circle') {
        baseCard.cornerRadius(18);
        baseCard.fill('#18350d');
        baseCard.stroke(cat.color);
        baseCard.shadowOpacity(0.5);
      } else if (style === 'icon-only') {
        baseCard.fill('rgba(24, 53, 13, 0.45)');
        baseCard.stroke('transparent');
        baseCard.shadowOpacity(0.2);
      } else {
        baseCard.cornerRadius(8);
        baseCard.fill('#18350d');
        baseCard.stroke(cat.color);
        baseCard.shadowOpacity(0.5);
      }
      this.cacheNodeSafe(baseCard, 14);
    }

    if (device.customImage) {
      // User uploaded custom image
      loadDeviceCustomImage(device.customImage, (img) => {
        if (!iconImage) return;
        iconImage.image(img);
        iconImage.visible(true);
        if (iconText) iconText.visible(false);
        this.deviceLayer?.batchDraw();
      });
    } else {
      // Vector network icon
      const iconKey = device.customIcon || getDefaultIconForType(device.type);
      getDeviceIconImage(iconKey, cat.color, (img) => {
        if (!iconImage) return;
        iconImage.image(img);
        iconImage.visible(true);
        if (iconText) iconText.visible(false);
        this.deviceLayer?.batchDraw();
      });
    }
  }

  /**
   * Synchronize marker position directly in Konva layer
   * @param {string} deviceId
   * @param {{x: number, y: number}} normalizedPos
   */
  setDevicePosition(deviceId, normalizedPos) {
    const group = this.markerMap.get(deviceId);
    if (!group || !normalizedPos) return;
    group.position({
      x: normalizedPos.x * this.naturalWidth,
      y: normalizedPos.y * this.naturalHeight
    });
  }

  /**
   * Set all currently selected device IDs and update selection rings
   * @param {Set<string>|string[]} selectedIds
   * @param {string|null} primaryId
   */
  setSelectedDevices(selectedIds, primaryId = null) {
    const nextSet = selectedIds instanceof Set
      ? new Set(selectedIds)
      : new Set(Array.isArray(selectedIds) ? selectedIds : (selectedIds ? [selectedIds] : []));
    this.selectedDeviceIds = nextSet;
    this.selectedDeviceId = primaryId || (nextSet.size > 0 ? Array.from(nextSet)[nextSet.size - 1] : null);

    this.markerMap.forEach((group, id) => {
      const isSelected = nextSet.has(id);
      const isPrimary = id === this.selectedDeviceId;
      const ring = group.findOne('.selection-ring');
      if (ring) {
        ring.visible(isSelected);
      }
      this.coverageRenderer.setSelection(group, isPrimary || isSelected);
    });
    this.deviceLayer?.batchDraw();
  }

  /**
   * Set currently selected device ID and update selection rings
   * @param {string|null} deviceId 
   */
  setSelectedDevice(deviceId) {
    this.setSelectedDevices(deviceId ? [deviceId] : [], deviceId || null);
  }

  /**
   * Set global visibility of all wireless coverage zones
   * @param {boolean} visible 
   */
  setCoverageVisibility(visible) {
    this.coverageRenderer.setGlobalVisibility(visible);
    this.markerMap.forEach((group) => {
      const covGroup = group.findOne('.wireless-coverage-group');
      const device = group.getAttr('deviceData');
      if (covGroup) {
        covGroup.visible(Boolean(visible && device?.wirelessCoverage?.enabled));
      }
    });
    this.deviceLayer?.batchDraw();
  }

  /**
   * Remove a device marker from canvas
   * @param {string} deviceId 
   */
  removeDevice(deviceId) {
    const group = this.markerMap.get(deviceId);
    if (group) {
      group.destroy();
      this.markerMap.delete(deviceId);
    }
  }

  /**
   * Format label string: Device Name + IP (if present)
   * @param {Object} device 
   * @returns {string}
   */
  formatLabel(device) {
    if (device.network?.ip) {
      return `${device.name}\n${device.network.ip}`;
    }
    return device.name;
  }

  /**
   * Get 2-3 letter short code for device marker badge
   * @param {string} type 
   * @returns {string}
   */
  getDeviceShortCode(type) {
    const map = {
      'router': 'RTR',
      'main-router': 'CCR',
      'core-switch': 'CSW',
      'dist-switch': 'DSW',
      'managed-switch': 'SW',
      'unmanaged-switch': 'SW',
      'poe-switch': 'PoE',
      'access-point': 'AP',
      'wireless-bridge': 'PtP',
      'firewall': 'FW',
      'gateway': 'GW',
      'network-rack': 'RCK',
      'patch-panel': 'PP',
      'odp': 'ODP',
      'fo-terminal': 'OTB',
      'network-pole': 'POL',
      'cctv': 'CAM',
      'nvr': 'NVR',
      'server': 'SRV',
      'computer': 'PC',
      'printer': 'PRN',
      'ip-phone': 'VOIP'
    };
    return map[type] || 'DEV';
  }
}
