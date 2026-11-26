/**
 * NetMap — Building / Room Documentation Inspector Panel (Phase 8B)
 * Right-sidebar inspector displaying auto-detected inventory, VLAN/Subnet/SSID,
 * internal vs uplink/backbone cables, technician notes, maintenance log CRUD,
 * and 1-click FPP teleport / X-Ray / Cutaway / 1-Page PDF print actions.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { uiIcon, escapeHtml, debounce } from '../utils/helpers.js';
import {
  buildBuildingDocumentationSummary,
  isBuildingSignboardEligible,
  syncDeviceLocationsFromBuilding
} from '../map/room-spatial-index.js';
import { findCutawayPairPreset, getDefaultRoomPassThrough } from '../map/map-3d-models.js';
import { PdfReportGenerator } from '../export/pdf-report-generator.js';

const LOG_CATEGORY_LABELS = {
  general: 'Umum',
  fiber: 'Fiber Optik',
  utp: 'Kabel UTP',
  hardware: 'Perangkat',
  wifi: 'WiFi / AP'
};

const LOG_STATUS_LABELS = {
  ok: 'Selesai',
  pending: 'Tindak Lanjut',
  issue: 'Kendala'
};

export class RoomDocumentationPanel {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {() => import('../map/map-3d-engine.js').Map3DEngine} [options.getMap3DEngine]
   * @param {() => import('./room-3d-modal.js').Room3DModal} [options.getRoom3DModal]
   * @param {() => import('../storage/project-storage.js').ProjectStorage} [options.getProjectStorage]
   */
  constructor({
    container,
    deviceManager,
    cableManager,
    getMap3DEngine = null,
    getRoom3DModal = null,
    getProjectStorage = null
  }) {
    this.container = container;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.getMap3DEngine = getMap3DEngine;
    this.getRoom3DModal = getRoom3DModal;
    this.getProjectStorage = getProjectStorage;

    this.currentRoomId = null;
    this._logFormOpen = false;
    this._debouncedLiveRefresh = debounce(() => {
      if (!this.currentRoomId) return;
      // Avoid stealing focus while technician is actively typing in a form field
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active && this.container?.contains?.(active) && /^(INPUT|TEXTAREA|SELECT)$/i.test(active.tagName)) {
        return;
      }
      const room = stateManager.getRoom3dById?.(this.currentRoomId);
      if (room) {
        this.renderRoomCard(room, { skipSidebarOpen: true });
      }
    }, 120);

    this.bindEvents();
  }

  _getSpatialOptions() {
    const projectMap = stateManager.getState()?.project?.map || {};
    return {
      mapWidthMeters: this.cableManager?.mapWidthMeters || 170,
      naturalWidth: projectMap.naturalWidth || 1024,
      naturalHeight: projectMap.naturalHeight || 1024,
      allRooms: stateManager.getRooms3d?.() || []
    };
  }

  bindEvents() {
    eventBus.on('workspace:changed', () => {
      if (!this.currentRoomId) return;
      const room = stateManager.getRoom3dById?.(this.currentRoomId);
      if (room) this.renderRoomCard(room, { skipSidebarOpen: true });
    });
    eventBus.on('room3d:inspect', (room) => {
      if (!room?.id) return;
      this.currentRoomId = room.id;
      this.renderRoomCard(room);
    });

    eventBus.on('room3d:doc-updated', (room) => {
      if (!room?.id || this.currentRoomId !== room.id) return;
      this._debouncedLiveRefresh();
    });

    eventBus.on('room3d:inspect-closed', () => {
      const hadRoom = Boolean(this.currentRoomId);
      this.currentRoomId = null;
      this._logFormOpen = false;
      if (hadRoom && !this.deviceManager?.selectedDeviceId && !this.cableManager?.selectedCableId && !stateManager.getSelectedObject3dId?.()) {
        this.renderEmpty();
      }
    });

    eventBus.on('object3d:selected', () => {
      this.currentRoomId = null;
      this._logFormOpen = false;
    });

    eventBus.on('device:selected', () => {
      if (stateManager.getWorkspaceMode?.() === 'build') return;
      this.currentRoomId = null;
      this._logFormOpen = false;
    });

    eventBus.on('connection:selected', () => {
      if (stateManager.getWorkspaceMode?.() === 'build') return;
      this.currentRoomId = null;
      this._logFormOpen = false;
    });

    const liveEvents = [
      'device:added',
      'device:updated',
      'device:deleted',
      'device:moved',
      'connection:added',
      'connection:updated',
      'connection:deleted',
      'room3d:changed',
      'object3d:changed',
      'map3d:xray-changed',
      'rooms3d:lock-changed'
    ];
    liveEvents.forEach((evName) => {
      eventBus.on(evName, () => {
        if (this.currentRoomId) {
          this._debouncedLiveRefresh();
        }
      });
    });
  }

  renderEmpty() {
    if (!this.container) return;
    const isBuildWs = stateManager.getWorkspaceMode?.() === 'build';
    this.container.innerHTML = isBuildWs
      ? `
        <div class="empty-state">
          <div class="empty-state-icon">
            ${uiIcon('building', 22)}
          </div>
          <div class="empty-state-text">Mode Edit Bangunan &amp; Objek 3D</div>
          <div class="empty-state-hint">
            Klik bangunan, fasilitas, jalan, atau objek 3D pada kanvas untuk mengatur posisi, rotasi, dan opsi bisa ditembus (pass-through).
          </div>
        </div>
      `
      : `
        <div class="empty-state">
          <div class="empty-state-icon">
            ${uiIcon('building', 22)}
          </div>
          <div class="empty-state-text">Belum ada perangkat atau gedung terpilih</div>
          <div class="empty-state-hint">
            Klik marker perangkat, jalur kabel, atau gedung 3D untuk membuka properti &amp; kartu dokumentasi infrastruktur.
          </div>
        </div>
      `;
  }

  renderRoomCard(room, { skipSidebarOpen = false } = {}) {
    if (!this.container || !room) return;
    this.currentRoomId = room.id;

    // Ensure right sidebar is open & switched to Properti tab on desktop
    if (!skipSidebarOpen && typeof document !== 'undefined') {
      const isMobileTouch = document.body?.classList?.contains?.('is-mobile-touch');
      if (!stateManager.getState().ui.rightSidebarOpen && !isMobileTouch) {
        stateManager.toggleSidebar('right', true);
      }
      const propTabBtn = document.getElementById('tab-btn-properties');
      if (propTabBtn && !propTabBtn.classList.contains('active')) {
        propTabBtn.click();
      }
    }

    const map3d = this.getMap3DEngine?.() || null;
    const spatialOpts = this._getSpatialOptions();
    const summary = buildBuildingDocumentationSummary(
      room,
      this.deviceManager?.getAllDevices?.() || [],
      this.cableManager?.getAllConnections?.() || [],
      stateManager.getObjects3d?.() || [],
      spatialOpts
    );

    const doc = summary.doc;
    const isLocked = Boolean(map3d?.isRoomLocked?.(room));
    const isRoomXray = Boolean(map3d?.buildingXrayMode || map3d?.perRoomXrayIds?.has?.(room.id));
    const cutawayInfo = findCutawayPairPreset(room);
    if (stateManager.getWorkspaceMode?.() === 'build') {
      this._renderBuildRoomCard(room, { cutawayInfo });
      return;
    }
    const signboardOn = isBuildingSignboardEligible(room);
    const st = summary.statusCounts;
    const net = summary.networkSummary;
    const cab = summary.cableSummary;

    const vlanChipsHtml = net.vlans.length > 0
      ? net.vlans.map((v) => `<span class="roomdoc-chip roomdoc-chip-vlan">VLAN ${v}</span>`).join('')
      : '<span class="roomdoc-muted">Belum terdeteksi</span>';

    const subnetText = net.subnets.length > 0
      ? net.subnets.map((s) => `<span class="roomdoc-mono-pill">${escapeHtml(s)}</span>`).join(' ')
      : '<span class="roomdoc-muted">-</span>';

    const ssidText = net.ssids.length > 0
      ? net.ssids.map((s) => `<span class="roomdoc-chip roomdoc-chip-wifi">${uiIcon('wifi', 11)} ${escapeHtml(s)}</span>`).join('')
      : '<span class="roomdoc-muted">-</span>';

    const deviceListHtml = summary.devicesInside.length === 0
      ? `<div class="roomdoc-empty-box">Belum ada perangkat jaringan terdeteksi di dalam area gedung ini (${Number(room.widthMeters || 0).toFixed(1)} x ${Number(room.depthMeters || 0).toFixed(1)} m).</div>`
      : summary.floors.map((fl) => `
          ${summary.isMultiFloor ? `<div class="roomdoc-floor-heading">${uiIcon('layers', 11)} <span>${escapeHtml(fl.label)}</span> <span class="roomdoc-count-pill">${fl.devices.length}</span></div>` : ''}
          <div class="roomdoc-device-list">
            ${fl.devices.map((dev) => {
              const dotColor = dev.status === 'online'
                ? '#22c55e'
                : (dev.status === 'warning' ? '#f59e0b' : (dev.status === 'offline' ? '#ef4444' : '#94a3b8'));
              const ipStr = dev.network?.ip || 'Tanpa IP';
              const elev = Number(dev.spatial3d?.elevationMeters);
              const elevTag = Number.isFinite(elev) && elev > 0.05 ? `Z ${elev.toFixed(1)}m` : '';
              return `
                <div class="roomdoc-device-row" data-dev-id="${escapeHtml(dev.id)}">
                  <span class="roomdoc-status-dot" style="background:${dotColor};" title="${escapeHtml(dev.status || 'unknown')}"></span>
                  <div class="roomdoc-device-info">
                    <div class="roomdoc-device-name">${escapeHtml(dev.name || dev.id)}</div>
                    <div class="roomdoc-device-meta">
                      <span>${escapeHtml(ipStr)}</span>
                      ${dev.network?.vlan ? `<span>VLAN ${escapeHtml(String(dev.network.vlan))}</span>` : ''}
                      ${elevTag ? `<span>${elevTag}</span>` : ''}
                    </div>
                  </div>
                  <div class="roomdoc-device-actions">
                    <button type="button" class="btn btn-secondary btn-sm roomdoc-mini-btn btn-roomdoc-focus-dev" data-dev-id="${escapeHtml(dev.id)}" title="Fokus &amp; Pilih Perangkat">${uiIcon('target', 11)}</button>
                    <button type="button" class="btn btn-secondary btn-sm roomdoc-mini-btn btn-roomdoc-cli-dev" data-dev-id="${escapeHtml(dev.id)}" title="Buka WinBox / Terminal CLI">${uiIcon('terminal', 11)}</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `).join('');

    const uplinkListHtml = cab.uplinkCables.length === 0
      ? '<div class="roomdoc-empty-box">Belum ada jalur uplink/backbone terhubung keluar gedung ini.</div>'
      : `<div class="roomdoc-uplink-list">
          ${cab.uplinkCables.map((u) => {
            const mediaLabel = u.media === 'fiber' ? 'FO' : (u.media === 'wireless' ? 'WiFi' : 'UTP');
            const mediaCls = u.media === 'fiber' ? 'is-fiber' : (u.media === 'wireless' ? 'is-wifi' : 'is-utp');
            const targetLabel = u.remoteBuilding
              ? u.remoteBuilding.name
              : (u.remoteDevice?.name || 'Perangkat Luar');
            const portHint = u.localPort ? ` • ${u.localPort}` : '';
            return `
              <button type="button" class="roomdoc-uplink-row" data-cable-id="${escapeHtml(u.cable.id)}" title="Klik untuk inspeksi jalur kabel">
                <span class="roomdoc-media-badge ${mediaCls}">${mediaLabel}</span>
                <div class="roomdoc-uplink-info">
                  <div class="roomdoc-uplink-title">${uiIcon('arrow-right-left', 11)} <span>${escapeHtml(targetLabel)}</span></div>
                  <div class="roomdoc-uplink-sub">${escapeHtml(u.cable.name || u.cable.cableCategory)} • ${u.lengthMeters.toFixed(1)} m${escapeHtml(portHint)}</div>
                </div>
              </button>
            `;
          }).join('')}
        </div>`;

    const logsHtml = doc.maintenanceLogs.length === 0
      ? '<div class="roomdoc-empty-box">Belum ada catatan perawatan / maintenance untuk gedung ini.</div>'
      : `<div class="roomdoc-log-list">
          ${doc.maintenanceLogs.map((log) => {
            const catLabel = LOG_CATEGORY_LABELS[log.category] || log.category || 'Umum';
            const stCls = log.status === 'issue' ? 'is-issue' : (log.status === 'pending' ? 'is-pending' : 'is-ok');
            const stLabel = LOG_STATUS_LABELS[log.status] || log.status || 'Selesai';
            return `
              <div class="roomdoc-log-item">
                <div class="roomdoc-log-top">
                  <span class="roomdoc-log-date">${escapeHtml(log.date || '-')}</span>
                  <span class="roomdoc-log-cat">${escapeHtml(catLabel)}</span>
                  <span class="roomdoc-log-status ${stCls}">${escapeHtml(stLabel)}</span>
                  <button type="button" class="roomdoc-log-del" data-del-log-id="${escapeHtml(log.id)}" title="Hapus log">${uiIcon('trash-2', 11)}</button>
                </div>
                <div class="roomdoc-log-summary">${escapeHtml(log.summary)}</div>
                <div class="roomdoc-log-tech">${uiIcon('user', 10)} ${escapeHtml(log.technician || 'Teknisi')}</div>
              </div>
            `;
          }).join('')}
        </div>`;

    this.container.innerHTML = `
      <div class="room-doc-panel" data-room-id="${escapeHtml(room.id)}">
        <!-- Header Card -->
        <div class="roomdoc-header-card">
          <div class="roomdoc-header-top">
            <div class="roomdoc-title-wrap">
              <div class="roomdoc-eyebrow">
                ${uiIcon('building', 12)}
                <span>Dokumentasi Gedung</span>
                ${doc.roomCode ? `<span class="roomdoc-code-badge">${escapeHtml(doc.roomCode)}</span>` : ''}
                ${isLocked ? `<span class="roomdoc-lock-badge" title="Posisi gedung dikunci — aman diinspeksi tanpa bergeser">${uiIcon('lock', 10)} Terkunci</span>` : ''}
              </div>
              <div class="roomdoc-title">${escapeHtml(room.name || 'Gedung 3D')}</div>
              <div class="roomdoc-subtitle">
                ${doc.zone ? `<span>${escapeHtml(doc.zone)}</span> • ` : ''}
                <span>${Number(room.widthMeters || 0).toFixed(1)}×${Number(room.depthMeters || 0).toFixed(1)}×${Number(room.heightMeters || 0).toFixed(1)}m</span>
              </div>
            </div>
            <button type="button" id="btn-roomdoc-close" class="btn btn-icon btn-sm" title="Tutup Kartu Gedung">
              ${uiIcon('x', 14)}
            </button>
          </div>

          <div class="roomdoc-status-row">
            <span class="roomdoc-stat-pill is-online"><span class="roomdoc-dot"></span> ${st.online} Online</span>
            ${st.warning > 0 ? `<span class="roomdoc-stat-pill is-warning"><span class="roomdoc-dot"></span> ${st.warning} Warning</span>` : ''}
            ${st.offline > 0 ? `<span class="roomdoc-stat-pill is-offline"><span class="roomdoc-dot"></span> ${st.offline} Offline</span>` : ''}
            <span class="roomdoc-stat-pill is-neutral">${st.total} Unit</span>
          </div>

          <!-- Quick Actions -->
          <div class="roomdoc-action-grid">
            <button type="button" id="btn-roomdoc-enter-fpp" class="btn btn-primary btn-sm roomdoc-act-btn" title="Aktifkan Mode Teknisi FPP tepat di depan pintu masuk gedung ini">
              ${uiIcon('footprints', 12)}
              <span>Masuk FPP</span>
            </button>
            <button type="button" id="btn-roomdoc-focus" class="btn btn-secondary btn-sm roomdoc-act-btn" title="Arahkan kamera 3D ke gedung ini">
              ${uiIcon('target', 12)}
              <span>Fokus</span>
            </button>
            <button type="button" id="btn-roomdoc-xray" class="btn ${isRoomXray ? 'btn-primary' : 'btn-secondary'} btn-sm roomdoc-act-btn" title="Buat dinding gedung ini transparan (X-Ray) untuk audit kabel">
              ${uiIcon('scan-eye', 12)}
              <span>${isRoomXray ? 'X-Ray: ON' : 'X-Ray'}</span>
            </button>
            ${cutawayInfo ? `
              <button type="button" id="btn-roomdoc-cutaway" class="btn ${cutawayInfo.isCurrentlyCutaway ? 'btn-primary' : 'btn-secondary'} btn-sm roomdoc-act-btn" title="Tukar model antara Atap Penuh dan Cutaway tanpa kehilangan posisi">
                ${uiIcon('layers', 12)}
                <span>${cutawayInfo.isCurrentlyCutaway ? 'Atap Utuh' : 'Cutaway'}</span>
              </button>
            ` : ''}
            <button type="button" id="btn-roomdoc-edit-geo" class="btn btn-secondary btn-sm roomdoc-act-btn" title="Edit nama, ukuran, rotasi &amp; model GLB gedung">
              ${uiIcon('pencil', 12)}
              <span>Edit</span>
            </button>
            <button type="button" id="btn-roomdoc-print-pdf" class="btn btn-secondary btn-sm roomdoc-act-btn" title="Unduh kartu dokumentasi ruangan 1 halaman PDF (siap tempel di rak)">
              ${uiIcon('printer', 12)}
              <span>PDF 1-Hal</span>
            </button>
          </div>
        </div>

        <!-- Ringkasan Jaringan Ruangan -->
        <div class="roomdoc-section">
          <div class="roomdoc-section-head">
            <span>Ringkasan Jaringan Ruangan</span>
          </div>
          <div class="roomdoc-net-grid">
            <div class="roomdoc-net-row">
              <span class="roomdoc-net-label">VLAN</span>
              <div class="roomdoc-net-val">${vlanChipsHtml}</div>
            </div>
            <div class="roomdoc-net-row">
              <span class="roomdoc-net-label">Subnet</span>
              <div class="roomdoc-net-val">${subnetText}</div>
            </div>
            <div class="roomdoc-net-row">
              <span class="roomdoc-net-label">WiFi</span>
              <div class="roomdoc-net-val">${ssidText}</div>
            </div>
            <div class="roomdoc-net-row">
              <span class="roomdoc-net-label">Kabel</span>
              <div class="roomdoc-net-val roomdoc-cable-metrics">
                <span><strong>${cab.utpMeters.toFixed(1)} m</strong> UTP (${cab.internalUtpCount} int)</span>
                <span>•</span>
                <span><strong>${cab.fiberMeters.toFixed(1)} m</strong> Fiber (${cab.uplinkCount} uplink)</span>
              </div>
            </div>
            ${summary.objectsInside.length > 0 ? `
              <div class="roomdoc-net-row">
                <span class="roomdoc-net-label">Struktur</span>
                <div class="roomdoc-net-val">${summary.objectsInside.length} objek 3D (Rak / Meja / Tiang)</div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Perangkat di Dalam Gedung -->
        <div class="roomdoc-section">
          <div class="roomdoc-section-head">
            <span>Perangkat di Gedung (${st.total} Unit)</span>
            ${st.total > 0 ? `
              <button type="button" id="btn-roomdoc-sync-locations" class="roomdoc-inline-btn" title="Isi otomatis kolom lokasi semua perangkat di gedung ini">
                ${uiIcon('refresh-cw', 11)}
                <span>Sinkron Lokasi</span>
              </button>
            ` : ''}
          </div>
          ${deviceListHtml}
        </div>

        <!-- Uplink / Backbone Antar-Gedung -->
        <div class="roomdoc-section">
          <div class="roomdoc-section-head">
            <span>Uplink / Backbone Antar-Gedung (${cab.uplinkCount})</span>
          </div>
          ${uplinkListHtml}
        </div>

        <!-- Identitas & Pengaturan Dokumentasi Gedung -->
        <div class="roomdoc-section">
          <div class="roomdoc-section-head">
            <span>Identitas &amp; Label Ruangan</span>
          </div>
          <div class="roomdoc-meta-form">
            <div class="roomdoc-meta-row-2">
              <label class="roomdoc-field">
                <span>Kode Ruang</span>
                <input type="text" id="roomdoc-code" value="${escapeHtml(doc.roomCode)}" placeholder="GDG-PPLG-01">
              </label>
              <label class="roomdoc-field">
                <span>Zona / Jurusan</span>
                <input type="text" id="roomdoc-zone" value="${escapeHtml(doc.zone)}" placeholder="Jurusan PPLG / TJKT">
              </label>
            </div>
            <label class="roomdoc-field">
              <span>Penanggung Jawab (PIC)</span>
              <input type="text" id="roomdoc-pic" value="${escapeHtml(doc.picName)}" placeholder="Tim Teknisi TKJ SMKN 1 Beringin">
            </label>
            <label class="roomdoc-check-row">
              <input type="checkbox" id="roomdoc-show-signboard" ${signboardOn ? 'checked' : ''}>
              <span>Tampilkan Papan Nama 3D di atas atap gedung</span>
            </label>
          </div>
        </div>

        <!-- Catatan Teknisi & Log Maintenance -->
        <div class="roomdoc-section">
          <div class="roomdoc-section-head">
            <span>${uiIcon('clipboard-list', 12)} Catatan Teknisi &amp; Maintenance</span>
            <button type="button" id="btn-roomdoc-toggle-log-form" class="roomdoc-inline-btn">
              ${uiIcon('plus', 11)}
              <span>Tambah Log</span>
            </button>
          </div>

          <textarea id="roomdoc-notes" rows="3" class="roomdoc-notes-input"
            placeholder="Catat info lapangan: posisi ODP, redaman fiber (dBm), jalur ducting plafon, password AP, dsb...">${escapeHtml(doc.notes)}</textarea>

          <div id="roomdoc-add-log-box" class="roomdoc-add-log-box" style="display: ${this._logFormOpen ? 'flex' : 'none'};">
            <div class="roomdoc-meta-row-2">
              <label class="roomdoc-field">
                <span>Tanggal</span>
                <input type="date" id="roomdoc-log-date" value="${new Date().toISOString().slice(0, 10)}">
              </label>
              <label class="roomdoc-field">
                <span>Teknisi</span>
                <input type="text" id="roomdoc-log-tech" placeholder="Nama teknisi">
              </label>
            </div>
            <div class="roomdoc-meta-row-2">
              <label class="roomdoc-field">
                <span>Kategori</span>
                <select id="roomdoc-log-cat">
                  <option value="fiber">Fiber Optik</option>
                  <option value="utp">Kabel UTP</option>
                  <option value="hardware">Perangkat</option>
                  <option value="wifi">WiFi / AP</option>
                  <option value="general" selected>Umum</option>
                </select>
              </label>
              <label class="roomdoc-field">
                <span>Status</span>
                <select id="roomdoc-log-status">
                  <option value="ok" selected>Selesai</option>
                  <option value="pending">Tindak Lanjut</option>
                  <option value="issue">Kendala</option>
                </select>
              </label>
            </div>
            <label class="roomdoc-field">
              <span>Ringkasan Pekerjaan</span>
              <input type="text" id="roomdoc-log-summary" placeholder="Contoh: Cek redaman ODP-03 (-18.2 dBm) &amp; rapikan patch cord">
            </label>
            <div style="display:flex;gap:6px;">
              <button type="button" id="btn-roomdoc-save-log" class="btn btn-primary btn-sm" style="flex:1;">Simpan Log</button>
              <button type="button" id="btn-roomdoc-cancel-log" class="btn btn-secondary btn-sm">Batal</button>
            </div>
          </div>

          ${logsHtml}
        </div>
      </div>
    `;

    this._bindCardDOMEvents(room, summary);
  }

  _renderBuildRoomCard(room, { cutawayInfo = null } = {}) {
    if (!this.container || !room) return;
    const map3d = this.getMap3DEngine?.() || null;
    const isLocked = Boolean(map3d?.isRoomLocked?.(room));
    const selfLocked = Boolean(room.locked);
    const isPassThrough = getDefaultRoomPassThrough(room);
    const isRoomXray = Boolean(map3d?.buildingXrayMode || map3d?.perRoomXrayIds?.has?.(room.id));
    const dimsText = `${Number(room.widthMeters || 0).toFixed(1)} × ${Number(room.depthMeters || 0).toFixed(1)} × ${Number(room.heightMeters || 0).toFixed(1)} m`;
    const scalePct = Math.round((Number(room.modelScale) || 1) * 100);
    const rotDeg = Math.round(Number(room.rotationY) || 0);
    const elevMeters = Math.max(0, Number(room.elevationMeters) || 0);
    const subtitleParts = [
      dimsText,
      `Skala ${scalePct}%`,
      `Rotasi ${rotDeg}°`,
      `Z ${elevMeters.toFixed(2)}m`
    ];

    this.container.innerHTML = `
      <div class="roomdoc-panel" id="roomdoc-panel-root" data-room-id="${escapeHtml(room.id)}" data-workspace="build">
        <div class="roomdoc-header">
          <div class="roomdoc-title-wrap">
            <div class="roomdoc-eyebrow">Properti Bangunan / Fasilitas 3D</div>
            <h3 class="roomdoc-title">
              ${escapeHtml(room.name || 'Bangunan 3D')}
              ${isLocked ? `<span class="roomdoc-lock-badge" title="Posisi bangunan dikunci">${uiIcon('lock', 10)} Terkunci</span>` : ''}
              <span id="roomdoc-pass-status-badge" class="roomdoc-pass-badge ${isPassThrough ? '' : 'is-solid'}">
                ${uiIcon(isPassThrough ? 'wind' : 'shield', 10)} ${isPassThrough ? 'Bisa Ditembus' : 'Padat (Solid)'}
              </span>
            </h3>
            <div class="roomdoc-dims">${escapeHtml(subtitleParts.join(' • '))}</div>
          </div>
          <button type="button" id="btn-roomdoc-close" class="btn btn-icon btn-sm" title="Tutup Properti Bangunan">
            ${uiIcon('x', 14)}
          </button>
        </div>

        <div class="roomdoc-actions">
          <button type="button" id="btn-roomdoc-fpp" class="btn btn-primary btn-sm roomdoc-act-btn" title="Masuk Mode Teknisi (FPP) tepat di bangunan/objek ini">
            ${uiIcon('footprints', 13)} <span>Masuk FPP</span>
          </button>
          <button type="button" id="btn-roomdoc-focus" class="btn btn-secondary btn-sm roomdoc-act-btn" title="Arahkan kamera 3D ke bangunan/fasilitas ini">
            ${uiIcon('crosshair', 13)} <span>Fokus</span>
          </button>
          <button type="button" id="btn-roomdoc-xray" class="btn ${isRoomXray ? 'btn-primary' : 'btn-secondary'} btn-sm roomdoc-act-btn" title="Toggle dinding transparan (X-Ray) bangunan ini">
            ${uiIcon('scan', 13)} <span>X-Ray</span>
          </button>
          ${cutawayInfo?.pairPreset ? `
            <button type="button" id="btn-roomdoc-cutaway" class="btn ${cutawayInfo.isCurrentlyCutaway ? 'btn-primary' : 'btn-secondary'} btn-sm roomdoc-act-btn" title="Tukar model antara Atap Penuh dan Cutaway">
              ${uiIcon('layers', 13)} <span>${cutawayInfo.isCurrentlyCutaway ? 'Atap Penuh' : 'Cutaway'}</span>
            </button>
          ` : ''}
          <button type="button" id="btn-roomdoc-edit-geo" class="btn btn-secondary btn-sm roomdoc-act-btn" title="Edit nama, ukuran, skala, rotasi &amp; model GLB">
            ${uiIcon('pencil', 13)} <span>Edit 3D</span>
          </button>
          <button type="button" id="btn-roomdoc-delete" class="btn btn-secondary btn-sm roomdoc-act-btn" style="color: #dc2626;" title="Hapus bangunan / fasilitas ini dari peta">
            ${uiIcon('trash-2', 13)} <span>Hapus</span>
          </button>
        </div>

        <div class="roomdoc-section">
          <div class="roomdoc-section-title">
            ${uiIcon('shield', 12)} <span>Pengaturan Fisik &amp; Tabrakan (3D)</span>
          </div>
          <div class="roomdoc-collision-card">
            <label class="roomdoc-collision-toggle">
              <input type="checkbox" id="roomdoc-pass-through" ${isPassThrough ? 'checked' : ''}>
              <div>
                <strong>Bisa Ditembus (Pass-Through)</strong>
                <div class="roomdoc-collision-hint">
                  Aktifkan agar avatar dapat berjalan melewati objek kecil seperti pohon hias / semak. Matikan agar solid (tidak tembus) untuk bangunan, wastafel, atau keran.
                </div>
              </div>
            </label>
            <label class="roomdoc-collision-toggle">
              <input type="checkbox" id="roomdoc-locked" ${selfLocked ? 'checked' : ''}>
              <div>
                <strong>Kunci Posisi Objek Ini</strong>
                <div class="roomdoc-collision-hint">
                  Mencegah bangunan/fasilitas tergeser tanpa sengaja saat menyusun elemen lain.
                </div>
              </div>
            </label>
          </div>
        </div>

        <div class="roomdoc-section">
          <div class="roomdoc-section-title">
            ${uiIcon('arrow-up-down', 12)} <span>Ketinggian / Elevasi Z (3D)</span>
          </div>
          <div class="roomdoc-collision-card" style="gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="range" id="roomdoc-elev-slider" min="0" max="20" step="0.05" value="${Math.min(20, elevMeters)}"
                     style="flex: 1; accent-color: var(--accent-blue, #2a5367);">
              <input type="number" id="roomdoc-elev" min="0" max="40" step="0.05" value="${elevMeters.toFixed(2)}"
                     style="width: 74px; background: var(--bg-elevated, #ffffff); border: 1px solid var(--border-color, #9ab7c1); border-radius: 6px; padding: 4px 6px; font-size: 12px; font-family: var(--font-mono);">
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-sm btn-roomdoc-elev-step" data-delta="-0.5" style="flex: 1;">-0.5m</button>
              <button type="button" class="btn btn-secondary btn-sm btn-roomdoc-elev-step" data-delta="-0.1" style="flex: 1;">-0.1m</button>
              <button type="button" class="btn btn-secondary btn-sm btn-roomdoc-elev-step" data-reset="0" style="flex: 1;">0m</button>
              <button type="button" class="btn btn-secondary btn-sm btn-roomdoc-elev-step" data-delta="0.1" style="flex: 1;">+0.1m</button>
              <button type="button" class="btn btn-secondary btn-sm btn-roomdoc-elev-step" data-delta="0.5" style="flex: 1;">+0.5m</button>
            </div>
            <button type="button" id="btn-roomdoc-snap-surface" class="btn btn-secondary btn-sm" style="width: 100%; justify-content: center;">
              ${uiIcon('magnet', 12)} <span>Tempel ke Atas Permukaan</span>
            </button>
          </div>
        </div>

        <div class="roomdoc-section">
          <div class="roomdoc-section-title">
            ${uiIcon('rotate-cw', 12)} <span>Putar Cepat 3D</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-roomdoc-rot-left" class="btn btn-secondary btn-sm" style="flex: 1;">-15°</button>
            <button type="button" id="btn-roomdoc-rot-90" class="btn btn-secondary btn-sm" style="flex: 1;">+90°</button>
            <button type="button" id="btn-roomdoc-rot-right" class="btn btn-secondary btn-sm" style="flex: 1;">+15°</button>
          </div>
        </div>
      </div>
    `;

    this._bindBuildCardDOMEvents(room);
  }

  _bindBuildCardDOMEvents(room) {
    const root = this.container?.querySelector('#roomdoc-panel-root');
    if (!root || !room) return;
    const map3d = this.getMap3DEngine?.() || null;

    root.querySelector('#btn-roomdoc-close')?.addEventListener('click', () => {
      stateManager.clearInspectedRoom3d?.();
    });

    root.querySelector('#btn-roomdoc-fpp')?.addEventListener('click', () => {
      this.getMap3DEngine?.()?.teleportAvatarToRoom?.(room.id);
    });

    root.querySelector('#btn-roomdoc-focus')?.addEventListener('click', () => {
      this.getMap3DEngine?.()?.focusOnRoom3d?.(room.id);
    });

    root.querySelector('#btn-roomdoc-xray')?.addEventListener('click', () => {
      const engine = this.getMap3DEngine?.();
      if (engine?.toggleRoomXray) {
        engine.toggleRoomXray(room.id);
        const latest = stateManager.getRoom3dById?.(room.id);
        if (latest) this.renderRoomCard(latest, { skipSidebarOpen: true });
      }
    });

    root.querySelector('#btn-roomdoc-cutaway')?.addEventListener('click', () => {
      const engine = this.getMap3DEngine?.();
      engine?.toggleRoomCutawayVariant?.(room.id);
      const latest = stateManager.getRoom3dById?.(room.id);
      if (latest) this.renderRoomCard(latest, { skipSidebarOpen: true });
    });

    root.querySelector('#btn-roomdoc-edit-geo')?.addEventListener('click', () => {
      const modal = this.getRoom3DModal?.();
      if (modal?.openForRoom) {
        modal.openForRoom(room.id);
      } else if (modal?.show) {
        modal.show(room.id);
      } else {
        eventBus.emit('modal:open-room3d', { roomId: room.id });
      }
    });

    root.querySelector('#btn-roomdoc-delete')?.addEventListener('click', () => {
      stateManager.deleteRoom3d?.(room.id);
      stateManager.clearInspectedRoom3d?.();
    });

    root.querySelector('#roomdoc-pass-through')?.addEventListener('change', (e) => {
      const passThrough = Boolean(e.target.checked);
      stateManager.updateRoom3d?.(room.id, { passThrough });
      map3d?.showStatusHint?.(
        passThrough
          ? `"${room.name}" diatur Bisa Ditembus (Pass-Through).`
          : `"${room.name}" diatur Padat (Solid — tidak bisa ditembus).`
      );
      const latest = stateManager.getRoom3dById?.(room.id);
      if (latest) this.renderRoomCard(latest, { skipSidebarOpen: true });
    });

    root.querySelector('#roomdoc-locked')?.addEventListener('change', (e) => {
      stateManager.updateRoom3d?.(room.id, { locked: Boolean(e.target.checked) });
      const latest = stateManager.getRoom3dById?.(room.id);
      if (latest) this.renderRoomCard(latest, { skipSidebarOpen: true });
    });

    const applyRotDelta = (delta) => {
      const latest = stateManager.getRoom3dById?.(room.id) || room;
      const nextRot = (((Number(latest.rotationY) || 0) + delta) % 360 + 360) % 360;
      stateManager.updateRoom3d?.(room.id, { rotationY: nextRot });
    };
    root.querySelector('#btn-roomdoc-rot-left')?.addEventListener('click', () => applyRotDelta(-15));
    root.querySelector('#btn-roomdoc-rot-90')?.addEventListener('click', () => applyRotDelta(90));
    root.querySelector('#btn-roomdoc-rot-right')?.addEventListener('click', () => applyRotDelta(15));

    const elevInp = root.querySelector('#roomdoc-elev');
    const elevSlider = root.querySelector('#roomdoc-elev-slider');
    const previewElevMesh = (val) => {
      const grp = map3d?.room3dMeshMap?.get(room.id);
      if (grp) grp.position.y = val;
    };
    const normalizeElev = (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(40, Math.round(n * 100) / 100)) : 0;
    };
    const commitElev = (raw) => {
      const val = normalizeElev(raw);
      if (elevInp) elevInp.value = val.toFixed(2);
      if (elevSlider) elevSlider.value = String(Math.min(20, val));
      previewElevMesh(val);
      stateManager.updateRoom3d?.(room.id, { elevationMeters: val });
    };

    elevSlider?.addEventListener('input', (e) => {
      const val = normalizeElev(e.target.value);
      if (elevInp) elevInp.value = val.toFixed(2);
      previewElevMesh(val);
    });
    elevSlider?.addEventListener('change', (e) => commitElev(e.target.value));
    elevInp?.addEventListener('change', (e) => commitElev(e.target.value));

    root.querySelectorAll('.btn-roomdoc-elev-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        const latest = stateManager.getRoom3dById?.(room.id) || room;
        const resetAttr = btn.getAttribute('data-reset');
        const nextVal = resetAttr !== null
          ? Number(resetAttr)
          : (Number(latest.elevationMeters) || 0) + (parseFloat(btn.getAttribute('data-delta')) || 0);
        commitElev(nextVal);
        const refreshed = stateManager.getRoom3dById?.(room.id);
        if (refreshed) this.renderRoomCard(refreshed, { skipSidebarOpen: true });
      });
    });

    root.querySelector('#btn-roomdoc-snap-surface')?.addEventListener('click', () => {
      map3d?.snapRoom3dToSurface?.(room.id);
      const refreshed = stateManager.getRoom3dById?.(room.id);
      if (refreshed) this.renderRoomCard(refreshed, { skipSidebarOpen: true });
    });
  }

  _bindCardDOMEvents(room, summary) {
    const root = this.container.querySelector('.room-doc-panel');
    if (!root) return;
    const map3d = this.getMap3DEngine?.() || null;

    root.querySelector('#btn-roomdoc-close')?.addEventListener('click', () => {
      stateManager.deselectRoom3d?.();
      stateManager.clearInspectedRoom3d?.();
    });

    root.querySelector('#btn-roomdoc-enter-fpp')?.addEventListener('click', () => {
      if (stateManager.getViewMode?.() !== '3d') {
        stateManager.setViewMode?.('3d');
      }
      setTimeout(() => {
        this.getMap3DEngine?.()?.teleportAvatarToRoom?.(room.id);
      }, 60);
    });

    root.querySelector('#btn-roomdoc-focus')?.addEventListener('click', () => {
      if (stateManager.getViewMode?.() !== '3d') {
        stateManager.setViewMode?.('3d');
      }
      setTimeout(() => {
        this.getMap3DEngine?.()?.focusOnRoom3d?.(room.id);
      }, 60);
    });

    root.querySelector('#btn-roomdoc-xray')?.addEventListener('click', () => {
      if (stateManager.getViewMode?.() !== '3d') {
        stateManager.setViewMode?.('3d');
      }
      setTimeout(() => {
        const engine = this.getMap3DEngine?.();
        if (!engine) return;
        if (engine.buildingXrayMode) {
          engine.setBuildingXrayMode(false);
        } else {
          engine.toggleRoomXray(room.id);
        }
        const latest = stateManager.getRoom3dById?.(room.id);
        if (latest) this.renderRoomCard(latest, { skipSidebarOpen: true });
      }, 40);
    });

    root.querySelector('#btn-roomdoc-cutaway')?.addEventListener('click', () => {
      const engine = this.getMap3DEngine?.();
      engine?.toggleRoomCutawayVariant?.(room.id);
      const latest = stateManager.getRoom3dById?.(room.id);
      if (latest) this.renderRoomCard(latest, { skipSidebarOpen: true });
    });

    root.querySelector('#btn-roomdoc-edit-geo')?.addEventListener('click', () => {
      const modal = this.getRoom3DModal?.();
      if (modal?.openForRoom) {
        modal.openForRoom(room.id);
      } else {
        modal?.show?.();
      }
    });

    root.querySelector('#btn-roomdoc-print-pdf')?.addEventListener('click', async () => {
      const btn = root.querySelector('#btn-roomdoc-print-pdf');
      if (btn) btn.disabled = true;
      try {
        const project = this.getProjectStorage?.()?.serializeProject?.() || stateManager.getState().project;
        const freshSummary = buildBuildingDocumentationSummary(
          stateManager.getRoom3dById?.(room.id) || room,
          this.deviceManager?.getAllDevices?.() || [],
          this.cableManager?.getAllConnections?.() || [],
          stateManager.getObjects3d?.() || [],
          this._getSpatialOptions()
        );
        await PdfReportGenerator.generateSingleRoomSheet({
          project,
          roomSummary: freshSummary
        });
      } catch (err) {
        console.error('[RoomDocPanel] PDF single-room export failed:', err);
        map3d?.showStatusHint?.(`Gagal membuat PDF ruangan: ${err.message}`);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    root.querySelector('#btn-roomdoc-sync-locations')?.addEventListener('click', () => {
      const latest = stateManager.getRoom3dById?.(room.id) || room;
      const res = syncDeviceLocationsFromBuilding(latest, this.deviceManager, {
        ...this._getSpatialOptions(),
        overwriteExisting: true
      });
      map3d?.showStatusHint?.(
        res.updatedCount > 0
          ? `Lokasi ${res.updatedCount} perangkat disinkronkan ke "${latest.name}".`
          : `Semua ${res.totalInside} perangkat di "${latest.name}" sudah memiliki lokasi sesuai.`
      );
      this.renderRoomCard(latest, { skipSidebarOpen: true });
    });

    // Device quick actions
    root.querySelectorAll('.btn-roomdoc-focus-dev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.getAttribute('data-dev-id');
        if (!devId) return;
        this.deviceManager?.selectDevice?.(devId);
        eventBus.emit('map3d:focus-device', { deviceId: devId });
      });
    });

    root.querySelectorAll('.btn-roomdoc-cli-dev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.getAttribute('data-dev-id');
        if (!devId) return;
        this.deviceManager?.selectDevice?.(devId);
        eventBus.emit('modal:open-simulator', { deviceId: devId, tab: 'winbox' });
      });
    });

    // Uplink click -> select cable
    root.querySelectorAll('.roomdoc-uplink-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cabId = btn.getAttribute('data-cable-id');
        if (!cabId) return;
        this.cableManager?.selectConnection?.(cabId);
      });
    });

    // Doc metadata inputs
    const saveDocField = (patch) => {
      stateManager.updateRoom3dDoc?.(room.id, patch);
    };

    root.querySelector('#roomdoc-code')?.addEventListener('change', (e) => {
      saveDocField({ roomCode: String(e.target.value || '').trim() });
    });
    root.querySelector('#roomdoc-zone')?.addEventListener('change', (e) => {
      saveDocField({ zone: String(e.target.value || '').trim() });
    });
    root.querySelector('#roomdoc-pic')?.addEventListener('change', (e) => {
      saveDocField({ picName: String(e.target.value || '').trim() });
    });
    root.querySelector('#roomdoc-show-signboard')?.addEventListener('change', (e) => {
      saveDocField({ showSignboard: Boolean(e.target.checked) });
    });

    const notesEl = root.querySelector('#roomdoc-notes');
    const saveNotesDebounced = debounce((val) => {
      saveDocField({ notes: val });
    }, 350);
    notesEl?.addEventListener('input', (e) => saveNotesDebounced(e.target.value));
    notesEl?.addEventListener('blur', (e) => saveDocField({ notes: e.target.value }));

    // Maintenance log form toggle & submit
    const logBox = root.querySelector('#roomdoc-add-log-box');
    root.querySelector('#btn-roomdoc-toggle-log-form')?.addEventListener('click', () => {
      this._logFormOpen = !this._logFormOpen;
      if (logBox) logBox.style.display = this._logFormOpen ? 'flex' : 'none';
      if (this._logFormOpen) {
        root.querySelector('#roomdoc-log-summary')?.focus?.();
      }
    });

    root.querySelector('#btn-roomdoc-cancel-log')?.addEventListener('click', () => {
      this._logFormOpen = false;
      if (logBox) logBox.style.display = 'none';
    });

    root.querySelector('#btn-roomdoc-save-log')?.addEventListener('click', () => {
      const sumVal = String(root.querySelector('#roomdoc-log-summary')?.value || '').trim();
      if (!sumVal) {
        root.querySelector('#roomdoc-log-summary')?.focus?.();
        return;
      }
      const res = stateManager.addRoom3dMaintenanceLog?.(room.id, {
        date: root.querySelector('#roomdoc-log-date')?.value || new Date().toISOString().slice(0, 10),
        technician: root.querySelector('#roomdoc-log-tech')?.value || 'Teknisi',
        category: root.querySelector('#roomdoc-log-cat')?.value || 'general',
        status: root.querySelector('#roomdoc-log-status')?.value || 'ok',
        summary: sumVal
      });
      if (res?.room) {
        this._logFormOpen = false;
        this.renderRoomCard(res.room, { skipSidebarOpen: true });
      }
    });

    root.querySelectorAll('.roomdoc-log-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const logId = btn.getAttribute('data-del-log-id');
        if (!logId) return;
        stateManager.deleteRoom3dMaintenanceLog?.(room.id, logId);
        const latest = stateManager.getRoom3dById?.(room.id);
        if (latest) this.renderRoomCard(latest, { skipSidebarOpen: true });
      });
    });
  }
}
