/**
 * NetMap — Interactive Cisco Packet Tracer Logical Topology Canvas
 * Menangani visualisasi topologi interaktif ala Cisco Packet Tracer (`viewMode === 'topology'`):
 * - Koordinat logis terpisah (`device.logicalPosition`) sehingga tidak merusak letak fisik 2D/3D gedung
 * - Auto-Connect ("Petir") & Pilihan Port Manual via popup mengambang
 * - Indikator Lampu Link (Hijau = Up, Merah = Down/Shutdown/Offline, Oranye = Warning/VLAN Mismatch)
 * - Simple PDU Realtime (Klik Sumber -> Tujuan -> Animasi Amplop Paket & Rekap OSI L1–L3)
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { themeManager } from '../core/theme-manager.js';
import { DEVICE_CATEGORIES } from '../devices/device-library.js';
import { getDeviceIconImage, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { getCableDefByCategory } from '../connections/cable-library.js';
import { escapeHtml, uiIcon } from '../utils/helpers.js';

export const TOPOLOGY_CURSORS = {
  select: 'default',
  selectHover: 'grab',
  selectGrabbing: 'grabbing',
  addDevice: 'copy',
  autoConnect: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M5 1v8M1 5h8' stroke='%23ffffff' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M5 1v8M1 5h8' stroke='%231e293b' stroke-width='1.5' stroke-linecap='round'/%3E%3Cpath d='M18 4l-7 11h5l-2 9 8-12h-5z' fill='%23f59e0b' stroke='%23ffffff' stroke-width='2.6' stroke-linejoin='round'/%3E%3Cpath d='M18 4l-7 11h5l-2 9 8-12h-5z' fill='%23f59e0b' stroke='%231e293b' stroke-width='1.1' stroke-linejoin='round'/%3E%3C/svg%3E") 5 5, crosshair`,
  autoConnectTarget: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='5' cy='5' r='3.6' fill='%2322c55e' stroke='%23ffffff' stroke-width='1.8'/%3E%3Cpath d='M18 4l-7 11h5l-2 9 8-12h-5z' fill='%23f59e0b' stroke='%23ffffff' stroke-width='2.6' stroke-linejoin='round'/%3E%3Cpath d='M18 4l-7 11h5l-2 9 8-12h-5z' fill='%23f59e0b' stroke='%231e293b' stroke-width='1.1' stroke-linejoin='round'/%3E%3C/svg%3E") 5 5, pointer`,
  manualCable: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M5 1v8M1 5h8' stroke='%23ffffff' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M5 1v8M1 5h8' stroke='%231e293b' stroke-width='1.5' stroke-linecap='round'/%3E%3Cpath d='M11 8h10v7l-2 2v4h-6v-4l-2-2z' fill='%232563eb' stroke='%23ffffff' stroke-width='2.4' stroke-linejoin='round'/%3E%3Cpath d='M11 8h10v7l-2 2v4h-6v-4l-2-2z' fill='%232563eb' stroke='%230f172a' stroke-width='1' stroke-linejoin='round'/%3E%3Cpath d='M13 8v4M16 8v4M19 8v4M16 21v5' stroke='%23facc15' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") 5 5, crosshair`,
  manualCableTarget: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='5' cy='5' r='3.6' fill='%2316a34a' stroke='%23ffffff' stroke-width='1.8'/%3E%3Cpath d='M11 8h10v7l-2 2v4h-6v-4l-2-2z' fill='%232563eb' stroke='%23ffffff' stroke-width='2.4' stroke-linejoin='round'/%3E%3Cpath d='M11 8h10v7l-2 2v4h-6v-4l-2-2z' fill='%232563eb' stroke='%230f172a' stroke-width='1' stroke-linejoin='round'/%3E%3Cpath d='M13 8v4M16 8v4M19 8v4M16 21v5' stroke='%23facc15' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") 5 5, pointer`,
  simplePdu: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='5' cy='5' r='3' fill='%2316a34a' stroke='%23ffffff' stroke-width='1.8'/%3E%3Crect x='7' y='9' width='18' height='13' rx='2.5' fill='%23fef08a' stroke='%23ffffff' stroke-width='2.6'/%3E%3Crect x='7' y='9' width='18' height='13' rx='2.5' fill='%23fef08a' stroke='%2316a34a' stroke-width='1.4'/%3E%3Cpath d='M8.5 11l7.5 6 7.5-6' fill='none' stroke='%2316a34a' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 5 5, pointer`,
  simplePduSend: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Ccircle cx='5' cy='5' r='3.6' fill='%230284c7' stroke='%23ffffff' stroke-width='1.8'/%3E%3Crect x='7' y='9' width='18' height='13' rx='2.5' fill='%2322c55e' stroke='%23ffffff' stroke-width='2.6'/%3E%3Crect x='7' y='9' width='18' height='13' rx='2.5' fill='%2322c55e' stroke='%2314532d' stroke-width='1.2'/%3E%3Cpath d='M8.5 11l7.5 6 7.5-6' fill='none' stroke='%23ffffff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 5 5, pointer`
};

/**
 * Resolve the active mouse cursor CSS value for Mode Topologi.
 * @param {Object} [opts]
 * @param {string} [opts.activeTool='select']
 * @param {string} [opts.appMode='select']
 * @param {string|null} [opts.dragKind=null]
 * @param {boolean} [opts.hoverNode=false]
 * @param {boolean} [opts.hasPendingSource=false]
 * @returns {string}
 */
export function resolveTopologyCursor({
  activeTool = 'select',
  appMode = 'select',
  dragKind = null,
  hoverNode = false,
  hasPendingSource = false
} = {}) {
  if (appMode === 'add-device') {
    return TOPOLOGY_CURSORS.addDevice;
  }
  if (activeTool === 'auto-connect') {
    return hoverNode ? TOPOLOGY_CURSORS.autoConnectTarget : TOPOLOGY_CURSORS.autoConnect;
  }
  if (activeTool === 'manual-cable') {
    return hoverNode ? TOPOLOGY_CURSORS.manualCableTarget : TOPOLOGY_CURSORS.manualCable;
  }
  if (activeTool === 'simple-pdu') {
    return hasPendingSource ? TOPOLOGY_CURSORS.simplePduSend : TOPOLOGY_CURSORS.simplePdu;
  }
  if (dragKind === 'node' || dragKind === 'pan') {
    return TOPOLOGY_CURSORS.selectGrabbing;
  }
  if (hoverNode) {
    return TOPOLOGY_CURSORS.selectHover;
  }
  return TOPOLOGY_CURSORS.select;
}

/**
 * Collect all port names already occupied by active connections on a given device.
 * @param {string} deviceId
 * @param {Array<Object>} cables
 * @returns {Set<string>}
 */
export function getOccupiedPortsForDevice(deviceId, cables = []) {
  const occupied = new Set();
  (Array.isArray(cables) ? cables : []).forEach((c) => {
    if (!c) return;
    if (c.source === deviceId && c.details?.portSource) {
      occupied.add(c.details.portSource);
    }
    if (c.destination === deviceId && c.details?.portDestination) {
      occupied.add(c.details.portDestination);
    }
  });
  return occupied;
}

/**
 * Automatically pick compatible cable category and first free ports between two devices
 * (Packet Tracer "Petir" Auto-Connect behavior).
 * @param {Object} sourceDev
 * @param {Object} destDev
 * @param {Array<Object>} cables
 * @param {import('../simulation/network-simulator.js').NetworkSimulator|null} [simulator=null]
 */
export function resolveAutoConnectPorts(sourceDev, destDev, cables = [], simulator = null) {
  if (!sourceDev || !destDev) {
    return { ok: false, reason: 'Perangkat sumber atau tujuan tidak ditemukan.' };
  }
  if (sourceDev.id === destDev.id) {
    return { ok: false, reason: 'Tidak dapat menyambungkan perangkat ke dirinya sendiri.' };
  }

  const getPorts = (d) => {
    const raw = simulator?.getDevicePortList?.(d) || d.ports || [];
    return raw.length > 0 ? raw : [{ name: 'eth0', type: 'rj45', speed: '1G' }];
  };

  const srcUsed = getOccupiedPortsForDevice(sourceDev.id, cables);
  const dstUsed = getOccupiedPortsForDevice(destDev.id, cables);

  const srcFree = getPorts(sourceDev).filter((p) => !srcUsed.has(p.name));
  const dstFree = getPorts(destDev).filter((p) => !dstUsed.has(p.name));

  const isWireless = (p) => String(p?.type || '').toLowerCase() === 'wireless' || /^wlan/i.test(p?.name || '');
  const isFiber = (p) => ['sfp', 'sfp+', 'fiber', 'qsfp'].includes(String(p?.type || '').toLowerCase()) || /sfp|pon/i.test(p?.name || '');
  const isCopper = (p) => !isWireless(p) && !isFiber(p);

  const srcHasOnlyWireless = getPorts(sourceDev).every(isWireless);
  const dstHasOnlyWireless = getPorts(destDev).every(isWireless);

  // 1. Wireless pair if either device is wireless-only or both prefer wireless
  const srcWifi = srcFree.find(isWireless);
  const dstWifi = dstFree.find(isWireless);
  if ((srcHasOnlyWireless || dstHasOnlyWireless) && srcWifi && dstWifi) {
    return {
      ok: true,
      type: 'wireless',
      cableCategory: 'wireless-link',
      portSource: srcWifi.name,
      portDestination: dstWifi.name
    };
  }

  // 2. Standard Copper Ethernet (Cat6)
  const srcCop = srcFree.find(isCopper);
  const dstCop = dstFree.find(isCopper);
  if (srcCop && dstCop) {
    return {
      ok: true,
      type: 'ethernet',
      cableCategory: 'cat6',
      portSource: srcCop.name,
      portDestination: dstCop.name
    };
  }

  // 3. Fiber Optic (SFP / Fiber)
  const srcFib = srcFree.find(isFiber);
  const dstFib = dstFree.find(isFiber);
  if (srcFib && dstFib) {
    return {
      ok: true,
      type: 'fiber',
      cableCategory: 'fiber-sm',
      portSource: srcFib.name,
      portDestination: dstFib.name
    };
  }

  // 4. General wireless fallback
  if (srcWifi && dstWifi) {
    return {
      ok: true,
      type: 'wireless',
      cableCategory: 'wireless-link',
      portSource: srcWifi.name,
      portDestination: dstWifi.name
    };
  }

  return {
    ok: false,
    reason: `Tidak ada pasangan port kosong yang kompatibel antara "${sourceDev.name}" dan "${destDev.name}".`
  };
}

/**
 * Compute Cisco Packet Tracer-style link status light states ('up' | 'down' | 'warn') for both ends of a cable.
 * @param {Object} cable
 * @param {Object} sourceDev
 * @param {Object} destDev
 * @param {import('../simulation/network-simulator.js').NetworkSimulator|null} [simulator=null]
 * @returns {{ srcState: 'up'|'down'|'warn', dstState: 'up'|'down'|'warn', srcColor: string, dstColor: string, reason: string }}
 */
export function computeLinkLightStates(cable, sourceDev, destDev, simulator = null) {
  const palette = {
    up: '#22c55e',
    warn: '#f59e0b',
    down: '#ef4444'
  };

  if (!cable || !sourceDev || !destDev) {
    return { srcState: 'down', dstState: 'down', srcColor: palette.down, dstColor: palette.down, reason: 'Perangkat tidak ditemukan' };
  }

  if (cable.status === 'damaged' || cable.status === 'inactive') {
    return { srcState: 'down', dstState: 'down', srcColor: palette.down, dstColor: palette.down, reason: 'Kabel terputus / non-aktif' };
  }

  const srcPort = cable.details?.portSource || '';
  const dstPort = cable.details?.portDestination || '';
  const srcIf = simulator?.getEffectiveInterfaceConfig?.(sourceDev, srcPort);
  const dstIf = simulator?.getEffectiveInterfaceConfig?.(destDev, dstPort);

  if (sourceDev.status === 'offline' || destDev.status === 'offline' || srcIf?.status === 'down' || dstIf?.status === 'down') {
    return { srcState: 'down', dstState: 'down', srcColor: palette.down, dstColor: palette.down, reason: 'Power OFF atau port Shutdown' };
  }

  if (cable.status === 'maintenance') {
    return { srcState: 'warn', dstState: 'warn', srcColor: palette.warn, dstColor: palette.warn, reason: 'Dalam pemeliharaan' };
  }

  if (srcIf?.mode === 'access' && dstIf?.mode === 'access' && Number(srcIf.vlan || 1) !== Number(dstIf.vlan || 1)) {
    return {
      srcState: 'warn',
      dstState: 'warn',
      srcColor: palette.warn,
      dstColor: palette.warn,
      reason: `VLAN Access Mismatch (${srcIf.vlan} vs ${dstIf.vlan})`
    };
  }

  return { srcState: 'up', dstState: 'up', srcColor: palette.up, dstColor: palette.up, reason: 'Link Up (Connected)' };
}

export class PacketTracerTopologyEngine {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('../simulation/network-simulator.js').NetworkSimulator} options.simulator
   * @param {import('../ui/pt-device-window.js').PtDeviceWindow} [options.ptDeviceWindow]
   * @param {import('../ui/device-palette.js').DevicePalette} [options.devicePalette]
   * @param {() => import('../learning/jobsheet-engine.js').JobsheetEngine} [options.getJobsheetEngine]
   */
  constructor({
    container,
    deviceManager,
    cableManager,
    simulator,
    ptDeviceWindow = null,
    devicePalette = null,
    getJobsheetEngine = null
  } = {}) {
    this.container = container;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.simulator = simulator;
    this.ptDeviceWindow = ptDeviceWindow;
    this.devicePalette = devicePalette;
    this.getJobsheetEngine = getJobsheetEngine;

    this.isActive = false;
    this.activeTool = 'select'; // 'select' | 'auto-connect' | 'manual-cable' | 'simple-pdu'
    this.selectedManualCategory = 'cat6';
    this.showPortLabels = true;

    this.pan = { x: 0, y: 0 };
    this.zoom = 1.0;
    this.pendingCableSource = null; // { deviceId, portName }
    this.pendingPduSourceId = null;
    this.pointerWorld = null;
    this.dragState = null;
    this.activePacketAnim = null;
    this._animFrameId = null;
    this._portPopupState = null;

    this.canvas = null;
    this.ctx = null;
    this.dockEl = null;
    this.hintEl = null;
    this.portPopupEl = null;
    this.nodeQuickBarEl = null;
    this.pduBarEl = null;
    this.resizeObserver = null;

    if (typeof document !== 'undefined' && this.container) {
      this._buildUI();
      this._bindCanvasEvents();
      this._bindAppEvents();
    }
  }

  _buildUI() {
    this.container.innerHTML = '';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'topology-canvas-el';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext?.('2d') || null;

    // 1. Top Packet Tracer Tool Dock
    this.dockEl = document.createElement('div');
    this.dockEl.className = 'pt-topo-dock';
    this.dockEl.innerHTML = `
      <div class="pt-topo-tool-group">
        <button type="button" class="pt-topo-btn active" data-pt-tool="select" title="Pilih &amp; Geser Node Topologi (S)">
          ${uiIcon('mouse-pointer', 13)} <span>Select</span>
        </button>
        <button type="button" class="pt-topo-btn" data-pt-tool="auto-connect" title="Auto-Connect Petir (A) — Sambungkan port kompatibel otomatis">
          ${uiIcon('zap', 13)} <span>Auto-Connect</span>
        </button>
        <button type="button" class="pt-topo-btn" data-pt-tool="manual-cable" title="Kabel Manual + Pilih Port (C)">
          ${uiIcon('cable', 13)} <span>Kabel Manual</span>
        </button>
        <select id="pt-topo-cable-cat" class="pt-topo-select" title="Media Kabel Manual">
          <option value="cat6" selected>UTP Cat6</option>
          <option value="cat5e">UTP Cat5e</option>
          <option value="fiber-sm">Fiber SM</option>
          <option value="fiber-mm">Fiber MM</option>
          <option value="wireless-link">Wireless Wi-Fi</option>
        </select>
        <button type="button" class="pt-topo-btn" data-pt-tool="simple-pdu" title="Kirim Simple PDU / Ping (P)">
          ${uiIcon('mail', 13)} <span>Simple PDU</span>
        </button>
      </div>
      <div class="pt-topo-divider"></div>
      <div class="pt-topo-tool-group">
        <button type="button" id="pt-topo-btn-labels" class="pt-topo-btn active" title="Tampilkan / Sembunyikan Label Port &amp; IP">
          ${uiIcon('tag', 13)} <span>Label Port</span>
        </button>
        <button type="button" id="pt-topo-btn-arrange" class="pt-topo-btn" title="Auto-Rapikan Susunan Hierarki Topologi">
          ${uiIcon('sparkles', 13)} <span>Auto-Rapikan</span>
        </button>
        <button type="button" id="pt-topo-btn-fit" class="pt-topo-btn" title="Sesuaikan Semua Node ke Layar">
          ${uiIcon('maximize', 13)} <span>Fit</span>
        </button>
      </div>
    `;
    this.container.appendChild(this.dockEl);

    // 2. Hint Pill
    this.hintEl = document.createElement('div');
    this.hintEl.className = 'pt-topo-hint-pill hidden';
    this.container.appendChild(this.hintEl);

    // 3. Floating Port Picker Popup
    this.portPopupEl = document.createElement('div');
    this.portPopupEl.className = 'pt-port-popup hidden';
    this.container.appendChild(this.portPopupEl);

    // 4. Selected Node Quick Action Bar
    this.nodeQuickBarEl = document.createElement('div');
    this.nodeQuickBarEl.className = 'pt-node-quickbar hidden';
    this.container.appendChild(this.nodeQuickBarEl);

    // 5. Bottom Realtime PDU Status Bar
    this.pduBarEl = document.createElement('div');
    this.pduBarEl.className = 'pt-pdu-bar hidden';
    this.container.appendChild(this.pduBarEl);

    // Bind dock buttons
    this.dockEl.querySelectorAll('[data-pt-tool]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTool(btn.getAttribute('data-pt-tool') || 'select');
      });
    });

    this.dockEl.querySelector('#pt-topo-cable-cat')?.addEventListener('change', (ev) => {
      this.selectedManualCategory = ev.target.value || 'cat6';
      this.setTool('manual-cable');
    });

    this.dockEl.querySelector('#pt-topo-btn-labels')?.addEventListener('click', (ev) => {
      this.showPortLabels = !this.showPortLabels;
      ev.currentTarget.classList.toggle('active', this.showPortLabels);
      this.requestRender();
    });

    this.dockEl.querySelector('#pt-topo-btn-arrange')?.addEventListener('click', () => {
      this.autoArrangeLogicalLayout();
    });

    this.dockEl.querySelector('#pt-topo-btn-fit')?.addEventListener('click', () => {
      this.fitToScreen();
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.isActive) this._resizeCanvas();
      });
      this.resizeObserver.observe(this.container);
    }

    this.syncCanvasCursor(false);
  }

  _bindCanvasEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('pointerdown', (ev) => {
      if (!this.isActive) return;
      this.closePortPopup();
      const pt = this._getLocalPointer(ev);
      const world = this.screenToWorld(pt.x, pt.y);
      this.pointerWorld = world;

      // Mode add-device (click-to-place from left DevicePalette)
      if (stateManager.getMode?.() === 'add-device') {
        this._placePaletteDeviceAtWorld(world);
        return;
      }

      const hitDev = this.getNodeAtWorldPos(world.x, world.y);

      if (this.activeTool === 'auto-connect') {
        if (!hitDev) {
          this.pendingCableSource = null;
          this.updateHint('');
          this.requestRender();
          return;
        }
        if (!this.pendingCableSource) {
          this.pendingCableSource = { deviceId: hitDev.id, portName: '' };
          this.updateHint(`Auto-Connect: "${hitDev.name}" dipilih — klik perangkat tujuan.`);
          this.requestRender();
        } else {
          const srcDev = this.deviceManager?.getDeviceById?.(this.pendingCableSource.deviceId);
          this.pendingCableSource = null;
          this.updateHint('');
          if (srcDev && srcDev.id !== hitDev.id) {
            const resolved = resolveAutoConnectPorts(
              srcDev,
              hitDev,
              this.cableManager?.getAllConnections?.() || [],
              this.simulator
            );
            if (resolved.ok) {
              this._createTopologyCable(srcDev, hitDev, resolved);
            } else {
              this.updateHint(resolved.reason);
            }
          }
          this.requestRender();
        }
        this.syncCanvasCursor(Boolean(hitDev));
        return;
      }

      if (this.activeTool === 'manual-cable') {
        if (!hitDev) {
          this.pendingCableSource = null;
          this.updateHint('');
          this.syncCanvasCursor(false);
          this.requestRender();
          return;
        }
        this._openPortPickerPopup(hitDev, pt.x, pt.y, (portObj) => {
          if (!this.pendingCableSource) {
            this.pendingCableSource = { deviceId: hitDev.id, portName: portObj.name };
            this.updateHint(`Port ${hitDev.name} [${portObj.name}] dipilih — klik perangkat tujuan.`);
            this.syncCanvasCursor(true);
            this.requestRender();
          } else {
            const srcDev = this.deviceManager?.getDeviceById?.(this.pendingCableSource.deviceId);
            const srcPort = this.pendingCableSource.portName;
            this.pendingCableSource = null;
            this.updateHint('');
            if (srcDev && srcDev.id !== hitDev.id) {
              const cat = this.selectedManualCategory || 'cat6';
              const catDef = getCableDefByCategory(cat);
              this._createTopologyCable(srcDev, hitDev, {
                type: catDef.type || 'ethernet',
                cableCategory: cat,
                portSource: srcPort,
                portDestination: portObj.name
              });
            }
            this.syncCanvasCursor(true);
            this.requestRender();
          }
        });
        return;
      }

      if (this.activeTool === 'simple-pdu') {
        if (!hitDev) {
          this.pendingPduSourceId = null;
          this.updateHint('');
          this.syncCanvasCursor(false);
          return;
        }
        if (!this.pendingPduSourceId) {
          this.pendingPduSourceId = hitDev.id;
          this.updateHint(`Simple PDU: "${hitDev.name}" (Sumber) — klik perangkat tujuan untuk Ping.`);
          this.syncCanvasCursor(true);
          this.requestRender();
        } else {
          const srcId = this.pendingPduSourceId;
          this.pendingPduSourceId = null;
          this.updateHint('');
          this.runSimplePdu(srcId, hitDev.id);
          this.syncCanvasCursor(true);
        }
        return;
      }

      // Default 'select' tool
      if (hitDev) {
        this.deviceManager?.selectDevice?.(hitDev.id, { additive: ev.shiftKey });
        const curPos = this.getDeviceCanvasPos(hitDev);
        this.dragState = {
          kind: 'node',
          deviceId: hitDev.id,
          startWorld: { ...world },
          origPos: { ...curPos },
          moved: false
        };
        this._syncNodeQuickBar(hitDev);
      } else {
        this.deviceManager?.deselectDevice?.();
        this.cableManager?.deselectConnection?.();
        this._syncNodeQuickBar(null);
        this.dragState = {
          kind: 'pan',
          startClient: { x: ev.clientX, y: ev.clientY },
          origPan: { ...this.pan }
        };
      }
      this.syncCanvasCursor(Boolean(hitDev));
      this.requestRender();
    });

    this.canvas.addEventListener('pointermove', (ev) => {
      if (!this.isActive) return;
      const pt = this._getLocalPointer(ev);
      const world = this.screenToWorld(pt.x, pt.y);
      this.pointerWorld = world;

      if (this.dragState?.kind === 'node') {
        const dx = world.x - this.dragState.startWorld.x;
        const dy = world.y - this.dragState.startWorld.y;
        if (Math.hypot(dx, dy) > 2) this.dragState.moved = true;
        const nextPos = {
          x: this.dragState.origPos.x + dx,
          y: this.dragState.origPos.y + dy
        };
        this.deviceManager?.updateDeviceLogicalPosition?.(this.dragState.deviceId, nextPos);
        this.syncCanvasCursor(false);
        this.requestRender();
      } else if (this.dragState?.kind === 'pan') {
        this.pan.x = this.dragState.origPan.x + (ev.clientX - this.dragState.startClient.x);
        this.pan.y = this.dragState.origPan.y + (ev.clientY - this.dragState.startClient.y);
        this.syncCanvasCursor(false);
        this.requestRender();
      } else {
        const hoverDev = this.getNodeAtWorldPos(world.x, world.y);
        this.syncCanvasCursor(Boolean(hoverDev));
        if (this.pendingCableSource) {
          this.requestRender();
        }
      }
    });

    const endDrag = () => {
      this.dragState = null;
      this.syncCanvasCursor(false);
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.dragState) {
        this.syncCanvasCursor(false);
      }
    });

    this.canvas.addEventListener('dblclick', (ev) => {
      if (!this.isActive || this.activeTool !== 'select') return;
      const pt = this._getLocalPointer(ev);
      const world = this.screenToWorld(pt.x, pt.y);
      const hitDev = this.getNodeAtWorldPos(world.x, world.y);
      if (hitDev) {
        this.ptDeviceWindow?.show?.(hitDev.id);
      }
    });

    this.canvas.addEventListener('wheel', (ev) => {
      if (!this.isActive) return;
      ev.preventDefault();
      const pt = this._getLocalPointer(ev);
      const factor = ev.deltaY < 0 ? 1.12 : 0.89;
      this.zoomAtScreenPoint(factor, pt.x, pt.y);
    }, { passive: false });

    // HTML5 Drag & Drop directly from Left DevicePalette onto Topology Canvas
    this.container.addEventListener('dragover', (ev) => {
      if (!this.isActive) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    });

    this.container.addEventListener('drop', (ev) => {
      if (!this.isActive) return;
      ev.preventDefault();
      ev.stopPropagation();
      const raw = ev.dataTransfer.getData('application/json') || ev.dataTransfer.getData('text/plain');
      if (!raw) return;
      try {
        const tmpl = JSON.parse(raw);
        const pt = this._getLocalPointer(ev);
        const world = this.screenToWorld(pt.x, pt.y);
        this._spawnDeviceFromTemplate(tmpl, world);
      } catch (err) {
        console.warn('[PacketTracerTopology] Drop failed:', err);
      }
    });
  }

  _bindAppEvents() {
    const refresh = () => {
      if (this.isActive) {
        this.requestRender();
        const selId = this.deviceManager?.selectedDeviceId;
        this._syncNodeQuickBar(selId ? this.deviceManager.getDeviceById(selId) : null);
      }
    };
    eventBus.on('device:added', refresh);
    eventBus.on('device:updated', refresh);
    eventBus.on('device:deleted', refresh);
    eventBus.on('device:logical-moved', refresh);
    eventBus.on('connection:added', refresh);
    eventBus.on('connection:updated', refresh);
    eventBus.on('connection:deleted', refresh);
    eventBus.on('device:selected', (dev) => {
      if (this.isActive) {
        this._syncNodeQuickBar(dev);
        this.requestRender();
      }
    });
    eventBus.on('topology:pdu-dispatched', ({ result }) => {
      if (this.isActive && result) {
        this._startPduAnimation(result);
        this._showPduSummaryBar(result);
      }
    });
    eventBus.on('mode:changed', () => {
      if (this.isActive) {
        this.syncCanvasCursor(false);
      }
    });
    eventBus.on('theme:changed', () => {
      if (this.isActive) {
        this.requestRender();
      }
    });
  }

  _placePaletteDeviceAtWorld(world) {
    const tmpl = this.devicePalette?.activeCustomTemplateToPlace;
    const type = this.devicePalette?.activeTypeToPlace || 'pc';
    const payload = tmpl ? { ...tmpl } : { type };
    this._spawnDeviceFromTemplate(payload, world);
    if (!this.devicePalette?.multiPlaceMode) {
      stateManager.setMode?.('select');
    }
  }

  _spawnDeviceFromTemplate(tmpl, world) {
    if (!this.deviceManager) return null;
    const devices = this.deviceManager.getAllDevices?.() || [];
    const idx = devices.length;
    const clean = {
      ...tmpl,
      logicalPosition: { x: Math.round(world.x), y: Math.round(world.y) },
      position: {
        x: Math.max(0.08, Math.min(0.92, 0.25 + ((idx % 5) * 0.12))),
        y: Math.max(0.08, Math.min(0.92, 0.25 + (Math.floor(idx / 5) * 0.12)))
      }
    };
    delete clean.templateId;
    delete clean.isCustom;
    delete clean.id;

    const added = this.deviceManager.addDevice(clean);
    if (added) {
      this.deviceManager.selectDevice?.(added.id);
      this._syncNodeQuickBar(added);
      this.requestRender();
    }
    return added;
  }

  _createTopologyCable(srcDev, dstDev, { type, cableCategory, portSource, portDestination }) {
    if (!this.cableManager) return null;
    const cable = this.cableManager.addConnection({
      name: `${srcDev.name} (${portSource || '-'}) <-> ${dstDev.name} (${portDestination || '-'})`,
      source: srcDev.id,
      destination: dstDev.id,
      type: type || 'ethernet',
      cableCategory: cableCategory || 'cat6',
      status: 'active',
      details: {
        portSource: portSource || '',
        portDestination: portDestination || ''
      }
    });
    this.requestRender();
    return cable;
  }

  _openPortPickerPopup(dev, screenX, screenY, onPicked) {
    if (!this.portPopupEl) return;
    const ports = this.simulator?.getDevicePortList?.(dev) || dev.ports || [{ name: 'eth0', type: 'rj45', speed: '1G' }];
    const cables = this.cableManager?.getAllConnections?.() || [];
    const occupied = getOccupiedPortsForDevice(dev.id, cables);

    const rowsHtml = ports.map((p) => {
      const used = occupied.has(p.name);
      return `
        <button type="button" class="pt-port-popup-item" data-pick-port="${escapeHtml(p.name)}" ${used ? 'disabled' : ''}>
          <span>${escapeHtml(p.name)}</span>
          <span style="font-size:9.5px;color:${used ? '#ef4444' : 'var(--accent-blue)'};">${escapeHtml(p.type || 'rj45')} &bull; ${used ? 'Terpakai' : 'Kosong'}</span>
        </button>
      `;
    }).join('');

    this.portPopupEl.innerHTML = `
      <div class="pt-port-popup-header">
        <span>Pilih Port: ${escapeHtml(dev.name)}</span>
        <button type="button" id="pt-port-popup-close" style="background:transparent;border:none;color:#fff;cursor:pointer;font-size:14px;line-height:1;">&times;</button>
      </div>
      <div class="pt-port-popup-list">${rowsHtml}</div>
    `;

    const cw = this.container.clientWidth || 800;
    const ch = this.container.clientHeight || 600;
    this.portPopupEl.style.left = `${Math.max(8, Math.min(cw - 246, Math.round(screenX + 12)))}px`;
    this.portPopupEl.style.top = `${Math.max(8, Math.min(ch - 268, Math.round(screenY - 16)))}px`;
    this.portPopupEl.classList.remove('hidden');

    this.portPopupEl.querySelector('#pt-port-popup-close')?.addEventListener('click', () => {
      this.closePortPopup();
    });

    this.portPopupEl.querySelectorAll('[data-pick-port]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const portName = btn.getAttribute('data-pick-port');
        const portObj = ports.find((p) => p.name === portName) || { name: portName };
        this.closePortPopup();
        onPicked?.(portObj);
      });
    });
  }

  closePortPopup() {
    this.portPopupEl?.classList?.add('hidden');
  }

  _syncNodeQuickBar(dev) {
    if (!this.nodeQuickBarEl) return;
    if (!dev || !this.isActive) {
      this.nodeQuickBarEl.classList.add('hidden');
      return;
    }
    this.nodeQuickBarEl.classList.remove('hidden');
    this.nodeQuickBarEl.innerHTML = `
      <span class="pt-node-quick-title" title="${escapeHtml(dev.name)}">${escapeHtml(dev.name)}</span>
      <button type="button" class="pt-topo-btn" data-pt-quick-tab="cli">${uiIcon('terminal', 12)} <span>Terminal</span></button>
      <button type="button" class="pt-topo-btn" data-pt-quick-tab="config">${uiIcon('sliders', 12)} <span>Config</span></button>
      <button type="button" class="pt-topo-btn" data-pt-quick-tab="physical">${uiIcon('cpu', 12)} <span>Physical</span></button>
      ${['pc', 'computer', 'laptop', 'smartphone', 'server', 'nvr'].includes(String(dev.type || '').toLowerCase())
        ? `<button type="button" class="pt-topo-btn" data-pt-quick-tab="desktop">${uiIcon('monitor', 12)} <span>Desktop</span></button>`
        : ''}
    `;

    this.nodeQuickBarEl.querySelectorAll('[data-pt-quick-tab]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.ptDeviceWindow?.show?.(dev.id, btn.getAttribute('data-pt-quick-tab'));
      });
    });
  }

  setTool(tool) {
    const allowed = ['select', 'auto-connect', 'manual-cable', 'simple-pdu'];
    this.activeTool = allowed.includes(tool) ? tool : 'select';
    this.pendingCableSource = null;
    this.pendingPduSourceId = null;
    this.closePortPopup();

    this.dockEl?.querySelectorAll('[data-pt-tool]')?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-pt-tool') === this.activeTool);
    });

    if (this.activeTool === 'auto-connect') {
      this.updateHint('Auto-Connect (Petir): Klik perangkat sumber, lalu klik perangkat tujuan.');
    } else if (this.activeTool === 'manual-cable') {
      this.updateHint('Kabel Manual: Klik perangkat sumber untuk memilih port, lalu pilih port tujuan.');
    } else if (this.activeTool === 'simple-pdu') {
      this.updateHint('Simple PDU (Ping): Klik perangkat sumber, lalu klik perangkat tujuan.');
    } else {
      this.updateHint('');
    }
    this.syncCanvasCursor(false);
    this.requestRender();
  }

  /**
   * Synchronize canvas mouse cursor & container data attribute with active topology tool.
   * @param {boolean} [hoverNode=false]
   * @returns {string}
   */
  syncCanvasCursor(hoverNode = false) {
    const cursor = resolveTopologyCursor({
      activeTool: this.activeTool,
      appMode: stateManager.getMode?.() || 'select',
      dragKind: this.dragState?.kind || null,
      hoverNode: Boolean(hoverNode),
      hasPendingSource: Boolean(this.pendingCableSource || this.pendingPduSourceId)
    });
    this.container?.setAttribute?.('data-topo-tool', this.activeTool);
    if (this.canvas?.style) {
      this.canvas.style.cursor = cursor;
    }
    return cursor;
  }

  updateHint(text = '') {
    if (!this.hintEl) return;
    if (!text) {
      this.hintEl.classList.add('hidden');
      this.hintEl.textContent = '';
    } else {
      this.hintEl.textContent = text;
      this.hintEl.classList.remove('hidden');
    }
  }

  /**
   * Dispatch a Realtime Simple PDU (Ping) from source device to destination device
   * and trigger animated packet traversal on the Topology Canvas.
   * @param {string} srcId
   * @param {string} dstId
   */
  runSimplePdu(srcId, dstId) {
    if (!this.simulator || !srcId || !dstId) return null;
    const res = this.simulator.simulatePing(srcId, dstId);
    if (res) {
      this.getJobsheetEngine?.()?.recordPingResult?.(res);
      eventBus.emit('topology:pdu-dispatched', { sourceId: srcId, result: res });
    }
    return res;
  }

  _startPduAnimation(pingResult) {
    const hops = Array.isArray(pingResult?.hops) ? pingResult.hops : [];
    if (hops.length < 1) return;
    this.activePacketAnim = {
      hops,
      success: Boolean(pingResult.success),
      startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      durationMs: Math.max(700, (hops.length - 1) * 520)
    };
    this._tickAnimation();
  }

  _tickAnimation() {
    if (this._animFrameId || typeof requestAnimationFrame !== 'function') return;
    const step = () => {
      this._animFrameId = null;
      this.render();
      if (this.activePacketAnim && this.isActive) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - this.activePacketAnim.startedAt < this.activePacketAnim.durationMs + 500) {
          this._animFrameId = requestAnimationFrame(step);
        } else {
          this.activePacketAnim = null;
          this.render();
        }
      }
    };
    this._animFrameId = requestAnimationFrame(step);
  }

  _showPduSummaryBar(res) {
    if (!this.pduBarEl || !res) return;
    const srcDev = this.deviceManager?.getDeviceById?.(res.sourceId);
    const dstDev = this.deviceManager?.getDeviceById?.(res.targetId);
    this.pduBarEl.classList.remove('hidden');
    this.pduBarEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span class="pt-pdu-status-badge ${res.success ? 'is-ok' : 'is-fail'}">${res.success ? 'Successful' : 'Failed'}</span>
        <span style="font-weight:700;white-space:nowrap;">${escapeHtml(srcDev?.name || res.sourceId)} &rarr; ${escapeHtml(dstDev?.name || res.targetId)}</span>
        <span style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(res.success ? res.summary : res.reason)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <span style="font-size:10.5px;color:var(--text-muted);font-family:var(--font-mono);">${res.success ? `${res.latencyMs}ms | TTL=${res.ttl}` : 'Drop L1-L3'}</span>
        <button type="button" id="pt-pdu-close-bar" class="btn btn-icon btn-sm" title="Tutup status">&times;</button>
      </div>
    `;
    this.pduBarEl.querySelector('#pt-pdu-close-bar')?.addEventListener('click', () => {
      this.pduBarEl.classList.add('hidden');
    });
  }

  /**
   * Resolve logical diagram coordinates for a device, falling back cleanly
   * to scaled physical position if `logicalPosition` has not been customized yet.
   * @param {Object} dev
   * @returns {{ x: number, y: number }}
   */
  getDeviceCanvasPos(dev) {
    if (dev?.logicalPosition && Number.isFinite(Number(dev.logicalPosition.x)) && Number.isFinite(Number(dev.logicalPosition.y))) {
      return { x: Number(dev.logicalPosition.x), y: Number(dev.logicalPosition.y) };
    }
    const nx = Number(dev?.position?.x ?? 0.5);
    const ny = Number(dev?.position?.y ?? 0.5);
    return {
      x: Math.round((nx - 0.5) * 900),
      y: Math.round((ny - 0.5) * 600)
    };
  }

  /**
   * Auto-arrange all devices into neat Cisco Packet Tracer hierarchical tiers
   * (ISP/Cloud -> Core Router -> Distribution Switch -> AP -> End-Devices)
   * updating ONLY `logicalPosition` so 3D buildings stay untouched.
   */
  autoArrangeLogicalLayout() {
    const devices = this.deviceManager?.getAllDevices?.() || [];
    if (devices.length === 0) return [];

    const tierOf = (d) => {
      const t = String(d.type || '').toLowerCase();
      if (['isp', 'cloud', 'internet', 'modem'].includes(t)) return 0;
      if (t.includes('router') || t === 'gateway' || t === 'firewall' || d.category === 'core' && !t.includes('server')) return 1;
      if (t.includes('switch') || t.includes('crs') || t.includes('sg') || t.includes('es2') || t === 'odp' || t === 'olt') return 2;
      if (t.includes('ap') || t.includes('access-point') || t.includes('wireless') || t.includes('rap')) return 3;
      return 4;
    };

    const tiers = [[], [], [], [], []];
    devices.forEach((d) => tiers[tierOf(d)].push(d));

    const moves = [];
    const tierGapY = 145;
    const nodeGapX = 155;
    const activeRows = tiers.filter((arr) => arr.length > 0);
    const totalH = Math.max(0, activeRows.length - 1) * tierGapY;

    activeRows.forEach((rowDevs, rIdx) => {
      const y = Math.round(-totalH * 0.5 + rIdx * tierGapY);
      const rowW = Math.max(0, rowDevs.length - 1) * nodeGapX;
      rowDevs.forEach((dev, cIdx) => {
        const x = Math.round(-rowW * 0.5 + cIdx * nodeGapX);
        moves.push({ id: dev.id, logicalPosition: { x, y } });
      });
    });

    const res = this.deviceManager?.moveDeviceLogicalGroup?.(moves) || [];
    this.fitToScreen();
    return res;
  }

  screenToWorld(sx, sy) {
    const w = this.canvas?.clientWidth || 800;
    const h = this.canvas?.clientHeight || 600;
    return {
      x: (sx - w * 0.5 - this.pan.x) / this.zoom,
      y: (sy - h * 0.5 - this.pan.y) / this.zoom
    };
  }

  worldToScreen(wx, wy) {
    const w = this.canvas?.clientWidth || 800;
    const h = this.canvas?.clientHeight || 600;
    return {
      x: wx * this.zoom + w * 0.5 + this.pan.x,
      y: wy * this.zoom + h * 0.5 + this.pan.y
    };
  }

  zoomAtScreenPoint(factor, sx, sy) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.max(0.28, Math.min(2.6, this.zoom * factor));
    const w = this.canvas?.clientWidth || 800;
    const h = this.canvas?.clientHeight || 600;
    this.pan.x = sx - w * 0.5 - before.x * this.zoom;
    this.pan.y = sy - h * 0.5 - before.y * this.zoom;
    this.requestRender();
  }

  fitToScreen() {
    const devices = this.deviceManager?.getAllDevices?.() || [];
    if (devices.length === 0) {
      this.pan = { x: 0, y: 0 };
      this.zoom = 1.0;
      this.requestRender();
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    devices.forEach((d) => {
      const p = this.getDeviceCanvasPos(d);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const cw = Math.max(320, this.container?.clientWidth || 800);
    const ch = Math.max(240, this.container?.clientHeight || 600);
    const spanW = Math.max(220, (maxX - minX) + 180);
    const spanH = Math.max(200, (maxY - minY) + 180);
    this.zoom = Math.max(0.35, Math.min(1.4, Math.min((cw - 80) / spanW, (ch - 140) / spanH)));
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    this.pan.x = -cx * this.zoom;
    this.pan.y = -cy * this.zoom;
    this.requestRender();
  }

  getNodeAtWorldPos(wx, wy) {
    const devices = this.deviceManager?.getAllDevices?.() || [];
    for (let i = devices.length - 1; i >= 0; i--) {
      const dev = devices[i];
      if (dev.layerVisible === false) continue;
      const p = this.getDeviceCanvasPos(dev);
      if (Math.abs(wx - p.x) <= 35 && Math.abs(wy - p.y) <= 35) {
        return dev;
      }
    }
    return null;
  }

  _getLocalPointer(ev) {
    const rect = this.canvas?.getBoundingClientRect?.() || { left: 0, top: 0 };
    return {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top
    };
  }

  _resizeCanvas() {
    if (!this.canvas || !this.container) return;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    const dpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.requestRender();
  }

  activate() {
    this.isActive = true;
    this._resizeCanvas();
    this.fitToScreen();
    this.syncCanvasCursor(false);
    const selId = this.deviceManager?.selectedDeviceId;
    this._syncNodeQuickBar(selId ? this.deviceManager.getDeviceById(selId) : null);
    this.requestRender();
  }

  deactivate() {
    this.isActive = false;
    this.pendingCableSource = null;
    this.pendingPduSourceId = null;
    this.closePortPopup();
    this.nodeQuickBarEl?.classList?.add('hidden');
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  requestRender() {
    if (!this.isActive) return;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 600;
    const dpr = canvas.width / Math.max(1, w);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.translate(w * 0.5 + this.pan.x, h * 0.5 + this.pan.y);
    ctx.scale(this.zoom, this.zoom);

    const devices = this.deviceManager?.getAllDevices?.() || [];
    const cables = this.cableManager?.getAllConnections?.() || [];
    const devPosMap = new Map();
    devices.forEach((d) => devPosMap.set(d.id, this.getDeviceCanvasPos(d)));

    // 1. Render Cables & Cisco Link Status Lights
    cables.forEach((cable) => {
      const src = this.deviceManager?.getDeviceById?.(cable.source);
      const dst = this.deviceManager?.getDeviceById?.(cable.destination);
      if (!src || !dst) return;
      const p1 = devPosMap.get(src.id);
      const p2 = devPosMap.get(dst.id);
      if (!p1 || !p2) return;

      const catDef = getCableDefByCategory(cable.cableCategory);
      const lightInfo = computeLinkLightStates(cable, src, dst, this.simulator);
      const isWireless = catDef.type === 'wireless';

      ctx.save();
      ctx.beginPath();
      if (isWireless || cable.cableCategory === 'fiber-sm') {
        if (isWireless) ctx.setLineDash([7, 6]);
      }
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineWidth = cable.id === this.cableManager?.selectedCableId ? 4 : 2.5;
      ctx.strokeStyle = lightInfo.srcState === 'down' ? '#dc2626' : (cable.customColor || catDef.color || '#2563eb');
      ctx.stroke();
      ctx.restore();

      // Link Lights near both endpoints
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const lightOffset = Math.min(dist * 0.34, 48);

      this._drawLinkLight(ctx, p1.x + ux * lightOffset, p1.y + uy * lightOffset, lightInfo.srcColor);
      this._drawLinkLight(ctx, p2.x - ux * lightOffset, p2.y - uy * lightOffset, lightInfo.dstColor);

      if (this.showPortLabels) {
        if (cable.details?.portSource) {
          this._drawMiniPill(ctx, p1.x + ux * (lightOffset + 14), p1.y + uy * (lightOffset + 14), cable.details.portSource);
        }
        if (cable.details?.portDestination) {
          this._drawMiniPill(ctx, p2.x - ux * (lightOffset + 14), p2.y - uy * (lightOffset + 14), cable.details.portDestination);
        }
      }
    });

    // 2. Rubber-band preview while drawing cable
    if (this.pendingCableSource && this.pointerWorld) {
      const pSrc = devPosMap.get(this.pendingCableSource.deviceId);
      if (pSrc) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(pSrc.x, pSrc.y);
        ctx.lineTo(this.pointerWorld.x, this.pointerWorld.y);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#16a34a';
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Render Device Nodes
    const isDark = typeof document !== 'undefined' && document.documentElement?.getAttribute?.('data-theme') === 'dark';
    const themeTokens = themeManager.getCurrentTokens(isDark ? 'dark' : 'light');
    devices.forEach((dev) => {
      if (dev.layerVisible === false) return;
      const pos = devPosMap.get(dev.id);
      const isSelected = this.deviceManager?.isDeviceSelected?.(dev.id) || this.deviceManager?.selectedDeviceId === dev.id;
      const catKey = dev.category === 'end-device' ? 'endDevice' : dev.category;
      const cat = DEVICE_CATEGORIES[catKey] || DEVICE_CATEGORIES.core;
      const accent = dev.status === 'offline' ? '#ef4444' : (cat?.color || themeTokens.accentPrimary || '#2a5367');

      ctx.save();
      ctx.translate(pos.x, pos.y);

      if (isSelected) {
        ctx.beginPath();
        ctx.roundRect(-36, -35, 72, 70, 15);
        ctx.fillStyle = 'rgba(42, 83, 103, 0.18)';
        ctx.strokeStyle = themeTokens.accentPrimary || '#2a5367';
        ctx.lineWidth = 2.4;
        ctx.fill();
        ctx.stroke();
      }

      // High-contrast frosted pedestal card so isometric dark hardware pops cleanly in Light & Dark mode
      ctx.save();
      ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(15, 23, 42, 0.12)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.roundRect(-29, -29, 58, 58, 13);
      ctx.fillStyle = isDark ? 'rgba(227, 237, 240, 0.92)' : 'rgba(245, 249, 250, 0.96)';
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.roundRect(-29, -29, 58, 58, 13);
      ctx.strokeStyle = accent;
      ctx.lineWidth = isSelected ? 2.4 : 1.9;
      ctx.stroke();

      // Isometric Icon / Vector Icon raster cache
      const iconKey = dev.customIcon || getDefaultIconForType(dev.type);
      getDeviceIconImage(iconKey, accent, (img) => {
        if (img && this.isActive && this.ctx) {
          this.ctx.save();
          // Trigger repaint once cached image resolves
          if (!img._topoRepainted) {
            img._topoRepainted = true;
            requestAnimationFrame(() => this.render());
          }
          this.ctx.restore();
        }
      });

      this._drawCachedNodeIcon(ctx, iconKey, accent);

      // Power indicator dot
      ctx.beginPath();
      ctx.arc(23, -23, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = dev.status === 'offline' ? '#ef4444' : '#22c55e';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Name & IP caption
      ctx.font = '700 11px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = themeTokens.textPrimary || (isDark ? '#e3edf0' : '#0b1620');
      ctx.fillText(dev.name || 'Device', 0, 43);

      if (this.showPortLabels && dev.network?.ip) {
        ctx.font = '600 9.5px ui-monospace, monospace';
        ctx.fillStyle = isDark ? (themeTokens.accentSecondary || '#9ab7c1') : (themeTokens.accentPrimary || '#2a5367');
        ctx.fillText(`${dev.network.ip}${dev.network?.vlan > 1 ? ` [V${dev.network.vlan}]` : ''}`, 0, 56);
      }

      ctx.restore();
    });

    // 4. Realtime Animated Simple PDU Envelope
    if (this.activePacketAnim) {
      this._drawActivePduEnvelope(ctx, devPosMap);
    }

    ctx.restore();
  }

  _drawCachedNodeIcon(ctx, iconKey, color) {
    let drawn = false;
    getDeviceIconImage(iconKey, color, (img) => {
      // Only runs synchronously if already cached; async callback handled above
      if (img && img.complete && img.naturalWidth > 0) {
        const prevSmooth = ctx.imageSmoothingEnabled;
        const prevQual = ctx.imageSmoothingQuality;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, -25, -25, 50, 50);
        ctx.imageSmoothingEnabled = prevSmooth;
        if (prevQual) ctx.imageSmoothingQuality = prevQual;
        drawn = true;
      }
    });
    if (!drawn) {
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  _drawLinkLight(ctx, x, y, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }

  _drawMiniPill(ctx, x, y, text) {
    ctx.save();
    ctx.font = '600 9px ui-monospace, monospace';
    const w = Math.max(24, ctx.measureText(text).width + 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, y - 7, w, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  _drawActivePduEnvelope(ctx, devPosMap) {
    const anim = this.activePacketAnim;
    const hops = anim.hops;
    if (hops.length === 0) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const t = Math.max(0, Math.min(1, (now - anim.startedAt) / anim.durationMs));
    let px = 0;
    let py = 0;

    if (hops.length === 1) {
      const p = devPosMap.get(hops[0]) || { x: 0, y: 0 };
      px = p.x;
      py = p.y - 26;
    } else {
      const segFloat = t * (hops.length - 1);
      const segIdx = Math.min(hops.length - 2, Math.floor(segFloat));
      const localT = segFloat - segIdx;
      const pA = devPosMap.get(hops[segIdx]) || { x: 0, y: 0 };
      const pB = devPosMap.get(hops[segIdx + 1]) || { x: 0, y: 0 };
      px = pA.x + (pB.x - pA.x) * localT;
      py = pA.y + (pB.y - pA.y) * localT;
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.roundRect(-13, -9, 26, 18, 4);
    ctx.fillStyle = anim.success ? '#22c55e' : '#ef4444';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Envelope flap
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(0, 2);
    ctx.lineTo(12, -8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
