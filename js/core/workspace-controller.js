/**
 * NetMap — Dual-Workspace Controller
 * Memisahkan Studio Bangunan 3D ('build') dan Lab Engineering Jaringan ('network')
 * sehingga toolbar, sidebar, raycast lock, dan HUD edukasi tidak saling tumpang tindih.
 */

import { eventBus } from './event-bus.js';
import { stateManager } from './state-manager.js';
import { generateId, uiIcon } from '../utils/helpers.js';

const ONBOARDING_DISMISSED_KEY = 'netmap_workspace_onboarding_seen_v1';

export class WorkspaceController {
  /**
   * @param {Object} options
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   * @param {import('../ui/build-studio-palette.js').BuildStudioPalette} [options.buildStudioPalette]
   * @param {import('../ui/packet-tracer-panel.js').PacketTracerPanel} [options.packetTracerPanel]
   * @param {import('../gamification/quest-manager.js').QuestManager} [options.questManager]
   * @param {import('../devices/device-manager.js').DeviceManager} [options.deviceManager]
   */
  constructor({
    map3DEngine = null,
    buildStudioPalette = null,
    packetTracerPanel = null,
    questManager = null,
    deviceManager = null
  } = {}) {
    this.map3DEngine = map3DEngine;
    this.buildStudioPalette = buildStudioPalette;
    this.packetTracerPanel = packetTracerPanel;
    this.questManager = questManager;
    this.deviceManager = deviceManager;
    this.launcherModalEl = null;
    this._applying = false;
  }

  init() {
    if (typeof document !== 'undefined' && document.body) {
      this._createLauncherModal();
      this._bindControls();
    }

    eventBus.on('workspace:changed', ({ workspaceMode }) => {
      if (!this._applying) {
        this._applyWorkspaceEffects(workspaceMode, { open3D: false, silent: true });
      }
    });

    eventBus.on('viewmode:changed', () => {
      this._syncWorkspaceDOM();
    });

    const initialMode = stateManager.getWorkspaceMode();
    this._applyWorkspaceEffects(initialMode, { open3D: false, silent: true });

    if (typeof document !== 'undefined') {
      let seen = false;
      try {
        seen = typeof localStorage !== 'undefined' && localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
      } catch { /* ignore */ }
      if (!seen && !document.body?.classList?.contains('is-mobile-touch')) {
        this.showLauncherModal();
      }
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

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
      }
    } catch { /* ignore */ }

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
      this.map3DEngine?.setRoomsLocked?.(false, { silent: true });
      this.map3DEngine?.setBuildPlacementConfig?.({ buildModeEnabled: true }, { silent: true });
      this.map3DEngine?.setWorkspaceGhostDevices?.(true);
      if (!silent) {
        this.map3DEngine?.showStatusHint?.(
          'Studio Bangunan 3D aktif — Tambah/geser/putar gedung, fasilitas & jalan sekolah. Perangkat jaringan digelapkan.'
        );
      }
    } else {
      this.map3DEngine?.setRoomsLocked?.(true, { silent: true });
      this.map3DEngine?.setBuildPlacementConfig?.({ buildModeEnabled: false }, { silent: true });
      this.map3DEngine?.setWorkspaceGhostDevices?.(false);
      if (!silent) {
        this.map3DEngine?.showStatusHint?.(
          'Lab Jaringan (Packet Tracer) aktif — Bangunan terkunci otomatis; fokus pasang perangkat, kabel, CLI & Ping.'
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

    document.getElementById('btn-open-workspace-launcher')?.addEventListener('click', () => {
      this.showLauncherModal();
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

    document.getElementById('navbar-quest-btn')?.addEventListener('click', () => {
      this.questManager?.show();
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
  }

  _createLauncherModal() {
    this.launcherModalEl = document.createElement('div');
    this.launcherModalEl.id = 'workspace-launcher-modal';
    this.launcherModalEl.className = 'modal-overlay workspace-launcher-modal';
    this.launcherModalEl.style.display = 'none';
    this.launcherModalEl.innerHTML = `
      <div class="modal-card launcher-modal-card">
        <div class="launcher-header">
          <div>
            <div class="launcher-eyebrow">SmartSchool NetMap • Platform Belajar 3D</div>
            <h2 class="launcher-title">Pilih Mode Belajar Hari Ini</h2>
            <p class="launcher-subtitle">Dua lingkungan terpisah agar lebih fokus &amp; mudah dipahami — dilengkapi Avatar Jelajah Roblox &amp; Misi XP.</p>
          </div>
          <button type="button" id="btn-launcher-close" class="btn btn-icon btn-sm" title="Tutup">${uiIcon('x', 14)}</button>
        </div>

        <div class="launcher-cards">
          <button type="button" class="launcher-choice-card is-build" data-pick-workspace="build">
            <div class="launcher-choice-icon">${uiIcon('building', 26)}</div>
            <div class="launcher-choice-name">Studio Bangunan 3D</div>
            <div class="launcher-choice-desc">Susun gedung kelas PPLG, perpustakaan, taman, tandon air, tiang &amp; jalan kampus dengan Snap Grid, Gizmo RGB, serta jelajahi dengan Avatar.</div>
            <span class="launcher-choice-cta">Mulai Membangun -></span>
          </button>

          <button type="button" class="launcher-choice-card is-network" data-pick-workspace="network">
            <div class="launcher-choice-icon">${uiIcon('network', 26)}</div>
            <div class="launcher-choice-name">Lab Engineering Jaringan</div>
            <div class="launcher-choice-desc">Ala Cisco Packet Tracer 3D: pasang Router/Switch/AP, sambungkan kabel antar port, konfigurasi CLI Cisco &amp; MikroTik, serta animasi paket Ping.</div>
            <span class="launcher-choice-cta">Masuk Lab Jaringan -></span>
          </button>
        </div>

        <div class="launcher-footer">
          <span>Gedung terkunci otomatis saat berada di Lab Jaringan agar tidak tergeser.</span>
          <button type="button" id="btn-launcher-quests" class="btn btn-secondary btn-sm">${uiIcon('award', 13)} Lihat Misi Belajar</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.launcherModalEl);

    this.launcherModalEl.querySelector('#btn-launcher-close')?.addEventListener('click', () => {
      this.hideLauncherModal(true);
    });
    this.launcherModalEl.addEventListener('click', (ev) => {
      if (ev.target === this.launcherModalEl) this.hideLauncherModal(true);
    });
    this.launcherModalEl.querySelectorAll('[data-pick-workspace]')?.forEach((card) => {
      card.addEventListener('click', () => {
        const ws = card.getAttribute('data-pick-workspace') || 'network';
        this.hideLauncherModal(true);
        this.switchWorkspace(ws, { open3D: ws === 'build' });
      });
    });
    this.launcherModalEl.querySelector('#btn-launcher-quests')?.addEventListener('click', () => {
      this.hideLauncherModal(true);
      this.questManager?.show();
    });
  }

  showLauncherModal() {
    if (this.launcherModalEl) {
      this.launcherModalEl.style.display = 'flex';
    }
  }

  hideLauncherModal(markSeen = true) {
    if (this.launcherModalEl) {
      this.launcherModalEl.style.display = 'none';
    }
    if (markSeen) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
        }
      } catch { /* ignore */ }
    }
  }
}
