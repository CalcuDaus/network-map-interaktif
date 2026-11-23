/**
 * NetMap — Dual-Workspace Controller
 * Memisahkan Edit Bangunan 3D ('build') dan Simulasi Jaringan ('network')
 * sehingga toolbar, sidebar, raycast lock, dan HUD edukasi tidak saling tumpang tindih.
 */

import { eventBus } from './event-bus.js';
import { stateManager } from './state-manager.js';
import { generateId } from '../utils/helpers.js';

export class WorkspaceController {
  /**
   * @param {Object} options
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   * @param {import('../ui/build-studio-palette.js').BuildStudioPalette} [options.buildStudioPalette]
   * @param {import('../ui/packet-tracer-panel.js').PacketTracerPanel} [options.packetTracerPanel]
   * @param {import('../devices/device-manager.js').DeviceManager} [options.deviceManager]
   */
  constructor({
    map3DEngine = null,
    buildStudioPalette = null,
    packetTracerPanel = null,
    deviceManager = null,
    cableManager = null
  } = {}) {
    this.map3DEngine = map3DEngine;
    this.buildStudioPalette = buildStudioPalette;
    this.packetTracerPanel = packetTracerPanel;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this._applying = false;
  }

  init() {
    if (typeof document !== 'undefined' && document.body) {
      this._bindControls();
    }

    eventBus.on('workspace:changed', ({ workspaceMode }) => {
      if (!this._applying) {
        this._applyWorkspaceEffects(workspaceMode, { open3D: false, silent: true });
      }
    });

    eventBus.on('viewmode:changed', () => {
      this._syncWorkspaceDOM();
      this.close3dPopovers();
    });

    eventBus.on('session:mode-changed', () => {
      this.syncSessionGuardBanner();
    });

    eventBus.on('jobsheet:active-changed', () => {
      this.syncSessionGuardBanner();
    });

    eventBus.on('auth:changed', () => {
      this.syncSessionGuardBanner();
    });

    eventBus.on('map3d:avatar-toggled', ({ active } = {}) => {
      this.syncAvatarGroupUI(Boolean(active));
    });

    const initialMode = stateManager.getWorkspaceMode();
    this._applyWorkspaceEffects(initialMode, { open3D: false, silent: true });
    this.syncSessionGuardBanner();
  }

  /**
   * Close compact 3D HUD popovers ('Kamera' & 'Tampilan 3D').
   */
  close3dPopovers() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.hud-3d-popover-wrap.open')?.forEach((w) => {
      w.classList.remove('open');
      w.querySelector('.hud-3d-pop-trigger')?.setAttribute?.('aria-expanded', 'false');
    });
  }

  /**
   * Show contextual TPP/FPP toggle pill cleanly when Mode Teknisi is active.
   */
  syncAvatarGroupUI(avatarActive = false) {
    if (typeof document === 'undefined') return;
    const fppBtn = document.getElementById('btn-3d-fpp');
    if (fppBtn) {
      fppBtn.classList.toggle('is-contextual-active', Boolean(avatarActive));
    }
  }

  /**
   * Sync Master Read-Only / Student Practice Sandbox Guard Banner under top navbar.
   */
  syncSessionGuardBanner() {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('session-guard-banner');
    if (!banner) return;

    const sessionMode = stateManager.getSessionMode?.() || 'master-readonly';
    const isSandbox = sessionMode === 'student-sandbox';
    const activeJsId = stateManager.getActiveJobsheetId?.() || null;

    banner.classList.remove('is-readonly', 'is-sandbox', 'is-admin');

    const titleEl = document.getElementById('session-banner-text');
    const btnFork = document.getElementById('btn-banner-fork-sandbox');
    const btnJobsheet = document.getElementById('btn-banner-open-jobsheet');
    const btnReset = document.getElementById('btn-banner-reset-sandbox');
    const btnMaster = document.getElementById('btn-banner-return-master');

    if (isSandbox) {
      banner.classList.remove('hidden');
      banner.classList.add('is-sandbox');
      banner.style.display = 'flex';
      if (titleEl) {
        titleEl.textContent = activeJsId
          ? 'Mode Sandbox Praktikum Jobsheet Aktif — Master Sekolah Terlindungi'
          : 'Mode Sandbox Praktik (Aman — Perubahan Lokal)';
      }
      if (btnFork) btnFork.style.display = 'none';
      if (btnJobsheet) btnJobsheet.style.display = 'inline-flex';
      if (btnReset) btnReset.style.display = 'inline-flex';
      if (btnMaster) btnMaster.style.display = 'inline-flex';
    } else {
      banner.classList.add('hidden');
      banner.style.display = 'none';
      if (titleEl) titleEl.textContent = '';
    }
  }

  /**
   * Switch between 'build' (Studio Bangunan 3D) and 'network' (Lab Engineering Jaringan).
   * @param {'build'|'network'} mode
   * @param {{ open3D?: boolean, silent?: boolean }} [options]
   * @returns {'build'|'network'}
   */
  switchWorkspace(mode, { open3D = true, silent = false } = {}) {
    const normalized = mode === 'build' ? 'build' : 'network';
    this._applying = true;
    try {
      stateManager.setWorkspaceMode(normalized);
      this._applyWorkspaceEffects(normalized, { open3D, silent });
    } finally {
      this._applying = false;
    }

    return normalized;
  }

  _applyWorkspaceEffects(mode, { open3D = true, silent = false } = {}) {
    const isBuild = mode === 'build';

    if (typeof document !== 'undefined' && document.body) {
      document.body.setAttribute?.('data-workspace', mode);
      if (document.body.dataset) {
        document.body.dataset.workspace = mode;
      }
    }

    if (isBuild) {
      if (open3D && stateManager.getViewMode() !== '3d') {
        stateManager.setViewMode('3d');
      }
      const curMode = stateManager.getMode();
      if (curMode === 'add-device' || curMode === 'draw-cable') {
        stateManager.setMode('select');
      }
      this.packetTracerPanel?.hide?.();
      this.map3DEngine?.exitSimulatorFocus?.({ restoreCamera: false });
      this.map3DEngine?.cancelAvatarCablePull?.({ silent: true });
      this.map3DEngine?.dropCarriedDevicesOnly?.();
      this.deviceManager?.deselectDevice?.();
      this.cableManager?.deselectConnection?.();
      if (typeof document !== 'undefined') {
        document.getElementById('tab-btn-properties')?.click?.();
      }
      this.map3DEngine?.setRoomsLocked?.(false, { silent: true });
      this.map3DEngine?.setBuildPlacementConfig?.({ buildModeEnabled: true }, { silent: true });
      this.map3DEngine?.setWorkspaceGhostDevices?.(true);
      if (!silent) {
        this.map3DEngine?.showStatusHint?.(
          'Edit Bangunan aktif — Fokus susun gedung, fasilitas, objek 3D & jalan. Kontrol perangkat & jaringan dikunci.'
        );
      }
    } else {
      this.map3DEngine?.setRoomsLocked?.(true, { silent: true });
      this.map3DEngine?.setBuildPlacementConfig?.({ buildModeEnabled: false }, { silent: true });
      this.map3DEngine?.setWorkspaceGhostDevices?.(false);
      if (!silent) {
        this.map3DEngine?.showStatusHint?.(
          'Simulasi Jaringan aktif — Bangunan terkunci otomatis; fokus pasang perangkat, kabel, CLI & Ping.'
        );
      }
    }

    this._syncWorkspaceDOM();
    this.map3DEngine?.syncBuildPlacementHudUI?.();
  }

  _syncWorkspaceDOM() {
    if (typeof document === 'undefined') return;
    const mode = stateManager.getWorkspaceMode();
    const isBuild = mode === 'build';
    const is3d = stateManager.getViewMode() === '3d';

    document.getElementById('btn-workspace-build')?.classList?.toggle('active', isBuild);
    document.getElementById('btn-workspace-network')?.classList?.toggle('active', !isBuild);
    document.getElementById('btn-mob-ws-build')?.classList?.toggle('active', isBuild);
    document.getElementById('btn-mob-ws-network')?.classList?.toggle('active', !isBuild);

    const sidebarTitle = document.getElementById('left-sidebar-title-text');
    const sidebarBadge = document.getElementById('left-sidebar-mode-badge');
    if (sidebarTitle) {
      sidebarTitle.textContent = isBuild ? 'Katalog Bangunan 3D' : 'Library Perangkat';
    }
    if (sidebarBadge) {
      sidebarBadge.textContent = isBuild ? 'Klik Pasang' : 'Drag & Drop';
    }

    const devPalette = document.getElementById('device-palette-container');
    const buildPalette = document.getElementById('build-studio-palette-container');
    if (devPalette) devPalette.style.display = isBuild ? 'none' : '';
    if (buildPalette) buildPalette.style.display = isBuild ? 'block' : 'none';
    const leftScroll = document.querySelector?.('.sidebar-left .sidebar-content');
    if (leftScroll) leftScroll.scrollTop = 0;

    const buildBar = document.getElementById('hud-3d-build-studio');
    if (buildBar) {
      const showBar = isBuild && is3d;
      buildBar.classList?.toggle('hidden', !showBar);
      buildBar.style.display = showBar ? 'flex' : 'none';
    }
  }

  duplicateSelectedBuildingOrObject() {
    const selRoomId = stateManager.getSelectedRoom3dId?.();
    if (selRoomId) {
      const room = stateManager.getRoom3dById?.(selRoomId);
      if (room) {
        const clone = {
          ...room,
          id: generateId('room3d'),
          name: `${room.name} (Copy)`,
          x: Math.min(0.95, (Number(room.x) || 0.5) + 0.04),
          y: Math.min(0.95, (Number(room.y) || 0.5) + 0.04),
          locked: false
        };
        stateManager.setRooms3d([...stateManager.getRooms3d(), clone]);
        stateManager.selectRoom3d?.(clone.id);
        this.map3DEngine?.showStatusHint?.(`Duplikat "${clone.name}" dibuat.`);
        return clone;
      }
    }

    const selObjId = stateManager.getSelectedObject3dId?.();
    if (selObjId) {
      const obj = stateManager.getObject3dById?.(selObjId);
      if (obj) {
        const clone = stateManager.addObject3d({
          ...obj,
          id: generateId('obj3d'),
          name: `${obj.name} (Copy)`,
          x: Math.min(0.95, (Number(obj.x) || 0.5) + 0.03),
          y: Math.min(0.95, (Number(obj.y) || 0.5) + 0.03),
          locked: false
        });
        this.map3DEngine?.showStatusHint?.(`Duplikat "${clone.name}" dibuat.`);
        return clone;
      }
    }

    this.map3DEngine?.showStatusHint?.('Pilih gedung atau objek 3D terlebih dahulu untuk diduplikasi.');
    return null;
  }

  _bindControls() {
    document.querySelectorAll('[data-workspace-switch]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const ws = btn.getAttribute('data-workspace-switch');
        if (ws) this.switchWorkspace(ws, { open3D: ws === 'build' });
      });
    });

    document.getElementById('btn-open-packet-tracer')?.addEventListener('click', () => {
      if (stateManager.getWorkspaceMode() !== 'network') {
        this.switchWorkspace('network', { open3D: false, silent: true });
      }
      this.packetTracerPanel?.show('sim');
    });

    document.getElementById('btn-3d-packet-tracer')?.addEventListener('click', () => {
      if (stateManager.getWorkspaceMode() !== 'network') {
        this.switchWorkspace('network', { open3D: false, silent: true });
      }
      this.packetTracerPanel?.show('sim');
    });

    document.getElementById('btn-studio-grid-snap')?.addEventListener('click', () => {
      const cur = this.map3DEngine?.getBuildPlacementConfig?.();
      this.map3DEngine?.setBuildPlacementConfig?.({ gridSnapEnabled: !cur?.gridSnapEnabled });
    });
    document.getElementById('select-studio-grid-size')?.addEventListener('change', (ev) => {
      this.map3DEngine?.setBuildPlacementConfig?.({
        gridSnapMeters: Number(ev.target.value) || 0.5,
        gridSnapEnabled: true
      });
    });
    document.getElementById('select-studio-angle-snap')?.addEventListener('change', (ev) => {
      this.map3DEngine?.setBuildPlacementConfig?.({ angleSnapDeg: Number(ev.target.value) || 0 });
    });
    document.getElementById('btn-studio-rot-ccw')?.addEventListener('click', () => {
      const step = this.map3DEngine?.getBuildPlacementConfig?.()?.angleSnapDeg || 15;
      this.map3DEngine?.rotateSelectedIn3D?.({ dY: -step });
    });
    document.getElementById('btn-studio-rot-cw')?.addEventListener('click', () => {
      const step = this.map3DEngine?.getBuildPlacementConfig?.()?.angleSnapDeg || 15;
      this.map3DEngine?.rotateSelectedIn3D?.({ dY: step });
    });
    document.getElementById('btn-studio-collision')?.addEventListener('click', () => {
      const cur = this.map3DEngine?.getBuildPlacementConfig?.();
      this.map3DEngine?.setBuildPlacementConfig?.({ allowClipping: !cur?.allowClipping });
    });
    document.getElementById('btn-studio-surface-snap')?.addEventListener('click', () => {
      const cur = this.map3DEngine?.getBuildPlacementConfig?.();
      this.map3DEngine?.setBuildPlacementConfig?.({ surfaceSnapEnabled: !cur?.surfaceSnapEnabled });
    });
    document.getElementById('btn-studio-gizmo')?.addEventListener('click', () => {
      const cur = this.map3DEngine?.getBuildPlacementConfig?.();
      this.map3DEngine?.setBuildPlacementConfig?.({ gizmoEnabled: !cur?.gizmoEnabled });
    });
    document.getElementById('select-studio-gizmo-mode')?.addEventListener('change', (ev) => {
      this.map3DEngine?.setBuildPlacementConfig?.({ gizmoMode: ev.target.value, gizmoEnabled: true });
    });
    document.getElementById('btn-studio-road')?.addEventListener('click', () => {
      this.buildStudioPalette?.activateRoadStyle?.('stepping-slab');
    });
    document.getElementById('btn-studio-duplicate')?.addEventListener('click', () => {
      this.duplicateSelectedBuildingOrObject();
    });
    document.getElementById('btn-studio-to-network')?.addEventListener('click', () => {
      this.switchWorkspace('network', { open3D: false });
    });

    // Compact 3D HUD Popovers ('Kamera' & 'Tampilan 3D')
    const popWraps = document.querySelectorAll('.hud-3d-popover-wrap');
    popWraps.forEach((wrap) => {
      const trigger = wrap.querySelector('.hud-3d-pop-trigger');
      const panel = wrap.querySelector('.hud-3d-popover-panel');
      trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !wrap.classList.contains('open');
        this.close3dPopovers();
        if (willOpen) {
          wrap.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
      panel?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target?.closest?.('button') && !e.target.closest('.hud-3d-pop-keep-open')) {
          this.close3dPopovers();
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target?.closest?.('.hud-3d-popover-wrap')) {
        this.close3dPopovers();
      }
    });
  }
}
