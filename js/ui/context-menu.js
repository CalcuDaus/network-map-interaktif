/**
 * NetMap — Interactive Context Menu
 * Provides right-click contextual shortcuts for Devices, Cables, and Canvas,
 * featuring direct deletion ("Hapus Perangkat" / "Hapus Jalur Kabel"),
 * inspection, connection initiation, and coordinate navigation.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { getDeviceDefByType, DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';
import { getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { CABLE_CATEGORIES } from '../connections/cable-library.js';

export class ContextMenu {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('./viewport-navigator.js').ViewportNavigator} [options.viewportNavigator]
   * @param {import('../map/map-engine.js').MapEngine} [options.mapEngine]
   * @param {Konva.Stage} [options.stage]
   */
  constructor({ deviceManager, cableManager, viewportNavigator = null, mapEngine = null, stage = null }) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.viewportNavigator = viewportNavigator;
    this.mapEngine = mapEngine;
    this.stage = stage;

    this.isOpen = false;
    this.activeTarget = null; // { type: 'device'|'cable'|'canvas', data: any }
    this._toastTimer = null;

    this.createDomElement();
    this.initEventListeners();
  }

  /**
   * Create singleton context menu DOM container attached to <body>
   */
  createDomElement() {
    let menu = document.getElementById('map-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'map-context-menu';
      menu.className = 'netmap-context-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-hidden', 'true');
      document.body.appendChild(menu);
    }
    this.element = menu;
  }

  /**
   * Bind event listeners from eventBus and window interactions
   */
  initEventListeners() {
    // 1. Listen for context menu requests from renderers
    eventBus.on('contextmenu:device', ({ device, screenX, screenY }) => {
      this.showDeviceMenu(device, screenX, screenY);
    });

    eventBus.on('contextmenu:cable', ({ cable, screenX, screenY }) => {
      this.showCableMenu(cable, screenX, screenY);
    });

    eventBus.on('contextmenu:canvas', ({ normX, normY, screenX, screenY }) => {
      this.showCanvasMenu({ normX, normY }, screenX, screenY);
    });

    // 2. Auto-dismiss on click outside or pointerdown
    document.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !this.element.contains(e.target)) {
        this.hide();
      }
    }, true);

    // 3. Auto-dismiss on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });

    // 4. Auto-dismiss on viewport navigation / zoom
    if (this.stage) {
      this.stage.on('dragstart wheel', () => {
        if (this.isOpen) {
          this.hide();
        }
      });
    }

    // 5. Auto-dismiss on window blur or resize
    window.addEventListener('resize', () => {
      if (this.isOpen) this.hide();
    });

    window.addEventListener('scroll', () => {
      if (this.isOpen) this.hide();
    }, true);

    // 6. Dismiss on mode changes or deletions
    eventBus.on('mode:changed', () => this.hide());
    eventBus.on('device:deleted', () => this.hide());
    eventBus.on('connection:deleted', () => this.hide());
  }

  /**
   * Display Context Menu for a Device
   * @param {Object} device 
   * @param {number} screenX 
   * @param {number} screenY 
   */
  showDeviceMenu(device, screenX, screenY) {
    if (!device) return;
    this.activeTarget = { type: 'device', data: device };

    // Select the device so that properties panel & visual focus activate
    this.deviceManager.selectDevice(device.id);

    const devDef = getDeviceDefByType(device.type) || { name: 'Perangkat Jaringan', category: 'core' };
    const catDef = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
    const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.online;

    // Header thumbnail: custom image or vector SVG
    let iconHtml = '';
    if (device.customImage) {
      iconHtml = `<img src="${device.customImage}" alt="${device.name}" />`;
    } else {
      const iconKey = device.icon || getDefaultIconForType(device.type);
      iconHtml = getDeviceIconSvg(iconKey, { color: '#2a7c13', size: 20 });
    }

    const ipText = device.network?.ip || device.ip || 'Tanpa Alamat IP';
    const statusColor = statusDef.color || '#2a7c13';

    // Build items
    const items = [
      {
        id: 'delete-device',
        icon: 'trash-2',
        label: 'Hapus Perangkat',
        shortcut: 'Del',
        danger: true,
        action: () => this.confirmAndDeleteDevice(device)
      },
      { isDivider: true },
      {
        id: 'inspect-device',
        icon: 'sliders',
        label: 'Properti & Konfigurasi',
        shortcut: 'Enter',
        action: () => {
          this.deviceManager.selectDevice(device.id);
          this.hide();
        }
      },
      {
        id: 'connect-cable',
        icon: 'network',
        label: 'Tarik Kabel dari Sini',
        action: () => this.startCableFromDevice(device)
      },
      {
        id: 'focus-device',
        icon: 'crosshair',
        label: 'Pusatkan di Layar',
        action: () => {
          if (this.viewportNavigator) {
            this.viewportNavigator.focusOnDevice(device);
          }
          this.hide();
        }
      },
      {
        id: 'duplicate-device',
        icon: 'copy',
        label: 'Duplikat Perangkat',
        shortcut: 'Ctrl+D',
        action: () => {
          this.hide();
          const clone = this.deviceManager.duplicateDevice(device.id);
          if (clone) {
            this.showToast(`📋 Perangkat diduplikat: "${clone.name}"`);
          }
        }
      },
      {
        id: 'copy-info',
        icon: 'clipboard-copy',
        label: (device.network?.ip || device.ip) ? `Salin IP (${device.network?.ip || device.ip})` : 'Salin Nama & ID',
        action: () => {
          this.hide();
          const devIp = device.network?.ip || device.ip;
          const copyVal = devIp ? devIp : `${device.name} [${device.id}]`;
          this.copyToClipboard(copyVal, devIp ? 'Alamat IP' : 'Info Perangkat');
        }
      }
    ];

    this.renderMenu({
      iconHtml,
      title: device.name,
      subtitle: `<span class="context-menu-status-dot" style="background-color: ${statusColor};"></span> ${statusDef.label} • ${ipText} • ${devDef.name}`,
      items
    });

    this.positionAt(screenX, screenY);
  }

  /**
   * Display Context Menu for a Cable / Connection
   * @param {Object} cable 
   * @param {number} screenX 
   * @param {number} screenY 
   */
  showCableMenu(cable, screenX, screenY) {
    if (!cable) return;
    this.activeTarget = { type: 'cable', data: cable };

    // Select cable so that connection panel & waypoint handles activate
    this.cableManager.selectConnection(cable.id);

    const catDef = CABLE_CATEGORIES[cable.category] || CABLE_CATEGORIES.cat6;
    const cableColor = cable.customColor || catDef.color;
    const lengthStr = cable.length ? `${cable.length.toFixed(1)} meter` : '0 m';
    const waypointsCount = Array.isArray(cable.route) ? cable.route.length : 0;

    // Header thumbnail: color circle
    const iconHtml = `<span style="width: 14px; height: 14px; border-radius: 50%; background: ${cableColor}; border: 2px solid #fff; box-shadow: 0 0 0 1px ${cableColor}; display: inline-block;"></span>`;

    const items = [
      {
        id: 'delete-cable',
        icon: 'trash-2',
        label: 'Hapus Jalur Kabel',
        shortcut: 'Del',
        danger: true,
        action: () => this.confirmAndDeleteCable(cable)
      },
      { isDivider: true },
      {
        id: 'inspect-cable',
        icon: 'sliders',
        label: 'Properti & Detail Kabel',
        shortcut: 'Enter',
        action: () => {
          this.cableManager.selectConnection(cable.id);
          this.hide();
        }
      }
    ];

    // If cable has waypoints, offer to straighten it
    if (waypointsCount > 0) {
      items.push({
        id: 'straighten-cable',
        icon: 'minimize-2',
        label: `Luruskan Jalur (${waypointsCount} belokan)`,
        action: () => {
          this.hide();
          this.cableManager.updateConnection(cable.id, { route: [] });
          this.showToast(`📏 Belokan jalur kabel "${cable.name}" direset ke garis lurus`);
        }
      });
    }

    items.push({
      id: 'copy-cable-info',
      icon: 'clipboard-copy',
      label: 'Salin Info Kabel',
      action: () => {
        this.hide();
        const copyVal = `${cable.name} (${catDef.name}, ${lengthStr})`;
        this.copyToClipboard(copyVal, 'Spesifikasi Kabel');
      }
    });

    this.renderMenu({
      iconHtml,
      title: cable.name,
      subtitle: `${catDef.name} • ${lengthStr}`,
      items
    });

    this.positionAt(screenX, screenY);
  }

  /**
   * Display Context Menu for Canvas Background
   * @param {{normX: number, normY: number}} coords 
   * @param {number} screenX 
   * @param {number} screenY 
   */
  showCanvasMenu({ normX, normY }, screenX, screenY) {
    this.activeTarget = { type: 'canvas', data: { normX, normY } };

    const posXStr = (normX * 100).toFixed(1);
    const posYStr = (normY * 100).toFixed(1);

    const hasSelection = Boolean(this.deviceManager?.selectedDeviceId || this.cableManager?.selectedCableId);

    const items = [
      {
        id: 'add-custom-device-here',
        icon: 'sparkles',
        label: 'Tambah Perangkat Kustom Disini...',
        action: () => {
          this.hide();
          eventBus.emit('modal:open-custom-device', { normX, normY });
        }
      },
      {
        id: 'add-device-here',
        icon: 'plus-circle',
        label: 'Tambah Perangkat Standar Disini...',
        action: () => {
          this.hide();
          stateManager.setMode('add-device');
          eventBus.emit('canvas:place-device', {
            normalizedX: normX,
            normalizedY: normY,
            isInside: true
          });
        }
      },
      {
        id: 'draw-cable-mode',
        icon: 'network',
        label: 'Mode Tarik Kabel',
        action: () => {
          this.hide();
          stateManager.setMode('draw-cable');
        }
      },
      { isDivider: true },
      {
        id: 'fit-screen',
        icon: 'maximize-2',
        label: 'Reset Tampilan (Fit Layar)',
        action: () => {
          this.hide();
          if (this.mapEngine?.interactions) {
            this.mapEngine.interactions.fitToScreen(30);
          }
        }
      },
      {
        id: 'calibrate-scale',
        icon: 'ruler',
        label: 'Kalibrasi Skala Peta...',
        action: () => {
          this.hide();
          eventBus.emit('modal:open-map-scale');
        }
      }
    ];

    if (hasSelection) {
      items.push({
        id: 'clear-selection',
        icon: 'x-circle',
        label: 'Batalkan Seleksi',
        action: () => {
          this.hide();
          this.deviceManager.deselectDevice();
          this.cableManager.deselectConnection();
        }
      });
    }

    this.renderMenu({
      iconHtml: `<i data-lucide="map-pin" style="width: 16px; height: 16px; color: var(--accent-blue);"></i>`,
      title: 'Denah Jaringan NetMap',
      subtitle: `Koordinat: X: ${posXStr}%, Y: ${posYStr}%`,
      items
    });

    this.positionAt(screenX, screenY);
  }

  /**
   * Render HTML content for the context menu
   * @param {Object} options 
   */
  renderMenu({ iconHtml, title, subtitle, items }) {
    let html = `
      <div class="context-menu-header">
        <div class="context-menu-header-icon">${iconHtml}</div>
        <div class="context-menu-header-info">
          <div class="context-menu-header-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
          <div class="context-menu-header-sub">${subtitle}</div>
        </div>
      </div>
      <div class="context-menu-body">
    `;

    items.forEach((item, index) => {
      if (item.isDivider) {
        html += `<div class="context-menu-divider"></div>`;
        return;
      }

      const dangerClass = item.danger ? ' danger' : '';
      const shortcutBadge = item.shortcut ? `<span class="context-menu-shortcut">${item.shortcut}</span>` : '';

      html += `
        <div class="context-menu-item${dangerClass}" data-index="${index}" role="menuitem" tabindex="0">
          <i data-lucide="${item.icon}"></i>
          <span class="context-menu-item-label">${escapeHtml(item.label)}</span>
          ${shortcutBadge}
        </div>
      `;
    });

    html += `</div>`;
    this.element.innerHTML = html;

    // Attach click handlers to items
    const itemEls = this.element.querySelectorAll('.context-menu-item');
    itemEls.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-index'), 10);
      const itemConfig = items[idx];
      if (itemConfig && itemConfig.action) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          itemConfig.action();
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            itemConfig.action();
          }
        });
      }
    });

    // Refresh Lucide icons inside menu
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({
        root: this.element
      });
    }
  }

  /**
   * Calculate position clamped to window viewport boundaries
   * @param {number} screenX 
   * @param {number} screenY 
   */
  positionAt(screenX, screenY) {
    this.element.style.display = 'block';
    this.element.style.visibility = 'hidden';
    this.element.style.top = '0px';
    this.element.style.left = '0px';

    const menuRect = this.element.getBoundingClientRect();
    const padding = 12;

    let posX = screenX;
    let posY = screenY;

    // Clamp horizontally
    if (posX + menuRect.width > window.innerWidth - padding) {
      posX = Math.max(padding, screenX - menuRect.width);
    }

    // Clamp vertically
    if (posY + menuRect.height > window.innerHeight - padding) {
      posY = Math.max(padding, window.innerHeight - menuRect.height - padding);
    }

    this.element.style.left = `${Math.round(posX)}px`;
    this.element.style.top = `${Math.round(posY)}px`;
    this.element.style.visibility = 'visible';
    this.element.classList.add('visible');
    this.element.setAttribute('aria-hidden', 'false');
    this.isOpen = true;
  }

  /**
   * Hide and dismiss the context menu
   */
  hide() {
    if (!this.isOpen) return;
    this.element.classList.remove('visible');
    this.element.style.display = 'none';
    this.element.setAttribute('aria-hidden', 'true');
    this.isOpen = false;
    this.activeTarget = null;
  }

  /**
   * Direct shortcut action: Confirm & Delete Device
   * @param {Object} device 
   */
  confirmAndDeleteDevice(device) {
    this.hide();
    if (!device) return;

    const connectedCables = this.cableManager ? this.cableManager.getConnectionsByDeviceId(device.id) : [];
    const cableCount = connectedCables.length;
    const cableWarning = cableCount > 0 ? `\n(termasuk ${cableCount} jalur kabel yang terhubung)` : '';

    const confirmFn = (typeof window !== 'undefined' && typeof window.confirm === 'function')
      ? window.confirm
      : (typeof confirm === 'function' ? confirm : () => true);

    const confirmed = confirmFn(
      `Hapus perangkat "${device.name}"${cableWarning}?\n\nTip: Tindakan ini dapat dibatalkan sewaktu-waktu dengan menekan Ctrl + Z (Undo).`
    );

    if (confirmed) {
      const devName = device.name;
      this.deviceManager.deleteDevice(device.id);
      this.showToast(`🗑️ Perangkat "${devName}" berhasil dihapus. Tekan Ctrl+Z untuk membatalkan.`);
    }
  }

  /**
   * Direct shortcut action: Confirm & Delete Cable
   * @param {Object} cable 
   */
  confirmAndDeleteCable(cable) {
    this.hide();
    if (!cable) return;

    const confirmFn = (typeof window !== 'undefined' && typeof window.confirm === 'function')
      ? window.confirm
      : (typeof confirm === 'function' ? confirm : () => true);

    const confirmed = confirmFn(
      `Hapus jalur kabel "${cable.name}"?\n\nTip: Tindakan ini dapat dibatalkan sewaktu-waktu dengan menekan Ctrl + Z (Undo).`
    );

    if (confirmed) {
      const cabName = cable.name;
      this.cableManager.deleteConnection(cable.id);
      this.showToast(`🗑️ Jalur kabel "${cabName}" berhasil dihapus. Tekan Ctrl+Z untuk membatalkan.`);
    }
  }

  /**
   * Shortcut action: Start Cable Drawing with this device as source
   * @param {Object} device 
   */
  startCableFromDevice(device) {
    this.hide();
    if (!device) return;

    stateManager.setMode('draw-cable');
    // Selecting device after switching mode engages CableDrawingTool source selection
    this.deviceManager.selectDevice(device.id);
    this.showToast(`🔌 Sumber kabel: "${device.name}". Klik perangkat tujuan untuk menghubungkan.`);
  }

  /**
   * Copy arbitrary text to clipboard with feedback toast
   * @param {string} text 
   * @param {string} label 
   */
  async copyToClipboard(text, label = 'Teks') {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.showToast(`📋 ${label} disalin ke clipboard: "${text}"`);
    } catch (err) {
      console.warn('[ContextMenu] Clipboard copy failed:', err);
      this.showToast(`Gagal menyalin ${label}`);
    }
  }

  /**
   * Display floating notification toast
   * @param {string} message 
   */
  showToast(message) {
    let toast = document.getElementById('netmap-action-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'netmap-action-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 45px;
        left: 50%;
        transform: translateX(-50%) translateY(8px);
        background: rgba(30, 41, 59, 0.94);
        color: #fff;
        padding: 8px 18px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        backdrop-filter: blur(4px);
        font-family: 'Poppins', sans-serif;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(8px)';
    }, 2400);
  }
}

/**
 * Helper to escape HTML characters
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
