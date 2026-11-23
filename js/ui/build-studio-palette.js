/**
 * NetMap — Studio Bangunan 3D Asset Catalog (Left Sidebar Component)
 * Dedicated catalog for school buildings (full + cutaway), campus facilities,
 * 3D modular objects, and City-Builder roads/walkways.
 */

import { stateManager } from '../core/state-manager.js';
import {
  BUILTIN_ROOM_BUILDING_PRESETS,
  OBJECT3D_PRESETS,
  ROAD3D_PRESETS,
  createBuildingRoomPresetData
} from '../map/map-3d-models.js';
import { escapeHtml, generateId, uiIcon } from '../utils/helpers.js';

const FACILITY_PRESET_IDS = new Set([
  'parkiran-motor',
  'parkiran-motor-cutaway',
  'pos-security',
  'pos-security-cutaway',
  'mading-pusat-informasi',
  'greenhouse',
  'pendopo-kecil',
  'tandon-air',
  'halte-tempat-duduk',
  'penunjuk-arah',
  'kandang-burung',
  'kandang-burung-2',
  'joglo-belakang',
  'halte-tempat-duduk-2',
  'tong-sampah',
  'wastafel-semen-corak-kayu',
  'keran-air-kecil',
  'plank-motivasi',
  'banner-kejuruan',
  'pohon-mahoni-kecil',
  'pohon-pinus-kecil',
  'pendopo-kolam-ikan',
  'halte-tempat-duduk-saung',
  'tempat-duduk-corak-kayu',
  'rak-bunga-lapangan',
  'wastafel-batang-kayu',
  'pohon-cemara-pinus-besar',
  'pohon-mangga-sedang',
  'pohon-palem-hiasan-sedang',
  'pohon-rindang-besar',
  'pohon-kaktus',
  'bunga-keladi',
  'bunga-pucuk-merah',
  'bunga-taman-merah',
  'bunga-bonsai-taman',
  'kaktus-karang-taman',
  'kandang-burung-samping-futsal',
  'lapangan-futsal',
  'gawang-lapangan-futsal',
  'lorong-bunga-anggrek',
  'tong-sampah-krisbow-hijau',
  'tiang-pull-up-bar',
  'lampu-taman',
  'plank-dasa-pesona',
  'plank-nilai-karakter',
  'plank-tjkt',
  'pohon-pinang',
  'pohon-mahoni-super-besar',
  'pohon-rindang-super-besar',
  'pohon-pinus-ekstra-besar'
]);

const OBJECT_ICON_MAP = {
  pole: 'radio',
  'server-rack': 'server',
  'tower-lattice': 'radio',
  box: 'box',
  cylinder: 'box',
  wall: 'layers',
  table: 'columns',
  cabinet: 'sliders'
};

export class BuildStudioPalette {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   * @param {import('./room-3d-modal.js').Room3DModal} [options.room3DModal]
   * @param {import('./object-3d-modal.js').Object3DModal} [options.object3DModal]
   */
  constructor({ container, map3DEngine = null, room3DModal = null, object3DModal = null } = {}) {
    this.container = container || null;
    this.map3DEngine = map3DEngine;
    this.room3DModal = room3DModal;
    this.object3DModal = object3DModal;
    this.searchQuery = '';
    this.activeCategory = 'all';

    if (this.container) {
      this.render();
    }
  }

  /**
   * Categorize every asset from BUILTIN_ROOM_BUILDING_PRESETS, OBJECT3D_PRESETS, and ROAD3D_PRESETS.
   * @returns {Array<Object>}
   */
  getCatalogEntries() {
    const entries = [];

    BUILTIN_ROOM_BUILDING_PRESETS.forEach((preset) => {
      const isFacility = FACILITY_PRESET_IDS.has(preset.id);
      const category = isFacility
        ? 'facility'
        : (preset.isCutaway ? 'building-cutaway' : 'building-full');
      const badge = isFacility
        ? 'Fasilitas'
        : (preset.isCutaway ? 'Cutaway' : 'Gedung Utuh');
      entries.push({
        kind: 'building',
        id: preset.id,
        category,
        badge,
        icon: uiIcon(isFacility ? 'trees' : 'building', 15),
        color: preset.wallColor || '#2a7c13',
        name: preset.name,
        subtitle: preset.subtitle || `${preset.widthMeters}×${preset.depthMeters}×${preset.heightMeters}m`,
        dimsText: `${Number(preset.widthMeters).toFixed(1)}×${Number(preset.depthMeters).toFixed(1)}×${Number(preset.heightMeters).toFixed(1)}m`,
        preset
      });
    });

    Object.entries(OBJECT3D_PRESETS).forEach(([shape, preset]) => {
      entries.push({
        kind: 'structure',
        id: shape,
        category: 'structure',
        badge: 'Struktur',
        icon: uiIcon(OBJECT_ICON_MAP[shape] || 'box', 15),
        color: preset.accentColor || preset.color || '#64748b',
        name: preset.name || shape,
        subtitle: `Bentuk 3D modular (${preset.widthMeters}×${preset.depthMeters}×${preset.heightMeters}m)`,
        dimsText: `${preset.widthMeters}×${preset.depthMeters}×${preset.heightMeters}m`,
        preset
      });
    });

    Object.entries(ROAD3D_PRESETS).forEach(([style, preset]) => {
      entries.push({
        kind: 'road',
        id: style,
        category: 'road',
        badge: 'Jalan 3D',
        icon: uiIcon('route', 15),
        color: preset.slabColor || '#94a3b8',
        name: preset.name || style,
        subtitle: `Lebar ${preset.widthMeters}m • Jalur ${preset.pathMode === 'smooth' ? 'Lengkung' : 'Lurus'}`,
        dimsText: `L ${preset.widthMeters}m`,
        preset
      });
    });

    return entries;
  }

  /**
   * Filter entries by activeCategory and searchQuery.
   * @param {string} [category]
   * @param {string} [query]
   * @returns {Array<Object>}
   */
  getFilteredEntries(category = this.activeCategory, query = this.searchQuery) {
    const q = String(query || '').trim().toLowerCase();
    return this.getCatalogEntries().filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }

  _getPlacementNormPoint() {
    if (this.map3DEngine?.controls?.target && this.map3DEngine?.worldToNorm) {
      const t = this.map3DEngine.controls.target;
      const n = this.map3DEngine.worldToNorm(t.x, t.z);
      if (n && Number.isFinite(n.normX) && Number.isFinite(n.normY)) {
        return { x: n.normX, y: n.normY };
      }
    }
    return { x: 0.5, y: 0.5 };
  }

  placeBuildingPreset(presetId) {
    const pt = this._getPlacementNormPoint();
    const existingRooms = stateManager.getRooms3d();
    const roomData = createBuildingRoomPresetData(presetId, {
      x: pt.x,
      y: pt.y,
      existingRooms
    });
    if (!roomData) return null;

    stateManager.setRooms3d([...existingRooms, roomData]);
    if (stateManager.getViewMode() !== '3d') {
      stateManager.setViewMode('3d');
    }
    this.map3DEngine?.setRoomsLocked?.(false, { silent: true });
    stateManager.selectRoom3d?.(roomData.id);
    this.map3DEngine?.setNavTool?.('move');
    this.map3DEngine?.focusOnRoom3d?.(roomData.id);
    this.map3DEngine?.showStatusHint?.(
      `"${roomData.name}" dipasang — Geser di lantai (M), Putar [ / ] atau gunakan Gizmo.`
    );
    return roomData;
  }

  placeStructurePreset(shape) {
    const preset = OBJECT3D_PRESETS[shape];
    if (!preset) return null;
    const pt = this._getPlacementNormPoint();
    const existing = stateManager.getObjects3d();
    const countSame = existing.filter((o) => o.shape === shape).length;
    const objData = stateManager.addObject3d({
      ...preset,
      id: generateId('obj3d'),
      name: countSame > 0 ? `${preset.name} #${countSame + 1}` : preset.name,
      x: pt.x,
      y: pt.y
    });
    if (stateManager.getViewMode() !== '3d') {
      stateManager.setViewMode('3d');
    }
    this.map3DEngine?.setRoomsLocked?.(false, { silent: true });
    this.map3DEngine?.setNavTool?.('move');
    this.map3DEngine?.showStatusHint?.(
      `Objek "${objData.name}" ditempatkan — Gunakan Move (M) atau Rotate (R) untuk menata.`
    );
    return objData;
  }

  activateRoadStyle(style) {
    const preset = ROAD3D_PRESETS[style];
    if (!preset) return false;
    if (stateManager.getViewMode() !== '3d') {
      stateManager.setViewMode('3d');
    }
    this.map3DEngine?.setBuildPlacementConfig?.({ buildModeEnabled: true }, { silent: true });
    const styleSelect = typeof document !== 'undefined' ? document.getElementById('select-road3d-style') : null;
    if (styleSelect) {
      styleSelect.value = style;
      styleSelect.dispatchEvent?.(new Event('change'));
    } else if (this.map3DEngine?.setRoadBuildStyle) {
      this.map3DEngine.setRoadBuildStyle(style);
    }
    this.map3DEngine?.setNavTool?.('road3d');
    this.map3DEngine?.showStatusHint?.(
      `Alat Jalan "${preset.name}" siap — Klik titik-titik jalur di permukaan kampus.`
    );
    return true;
  }

  render() {
    if (!this.container) return;
    const filtered = this.getFilteredEntries();
    const categories = [
      { id: 'all', label: 'Semua' },
      { id: 'building-full', label: 'Gedung Utuh' },
      { id: 'building-cutaway', label: 'Cutaway' },
      { id: 'facility', label: 'Fasilitas' },
      { id: 'structure', label: 'Struktur' },
      { id: 'road', label: 'Jalan 3D' }
    ];

    this.container.innerHTML = `
      <div class="build-studio-palette">
        <div class="build-studio-actions">
          <button type="button" id="btn-bsp-quick-road" class="btn btn-primary btn-sm" title="Aktifkan Alat Gambar Jalan 3D">
            ${uiIcon('route', 12)} Jalan 3D
          </button>
          <button type="button" id="btn-bsp-room-mgr" class="btn btn-secondary btn-sm" title="Kelola Ruangan 3D / Upload Model .GLB">
            ${uiIcon('building', 12)} Kelola .GLB
          </button>
          <button type="button" id="btn-bsp-obj-mgr" class="btn btn-secondary btn-sm" title="Buka Studio Objek 3D Custom">
            ${uiIcon('box', 12)} Objek Custom
          </button>
        </div>

        <div class="palette-search-wrapper" style="margin-top: 8px;">
          <input type="text" id="build-studio-search" class="palette-search-input"
            placeholder="Cari gedung, kantin, tiang, jalan..."
            value="${escapeHtml(this.searchQuery)}" autocomplete="off">
        </div>

        <div class="build-studio-cats" role="tablist" aria-label="Kategori Bangunan &amp; Properti">
          ${categories.map((c) => `
            <button type="button" class="build-cat-chip ${this.activeCategory === c.id ? 'active' : ''}" data-build-cat="${c.id}">
              ${escapeHtml(c.label)}
            </button>
          `).join('')}
        </div>

        <div class="build-studio-count">
          Menampilkan <strong>${filtered.length}</strong> aset bangunan &amp; properti sekolah
        </div>

        <div id="build-studio-list" class="build-studio-list">
          ${filtered.length === 0 ? `
            <div class="build-studio-empty">Tidak ada aset yang cocok dengan pencarian "${escapeHtml(this.searchQuery)}".</div>
          ` : filtered.map((item) => `
            <button type="button" class="build-asset-card" data-kind="${item.kind}" data-id="${escapeHtml(item.id)}"
              title="Klik untuk memasang ${escapeHtml(item.name)} ke kanvas 3D">
              <span class="build-asset-thumb" style="border-color: ${escapeHtml(item.color)};">${item.icon}</span>
              <span class="build-asset-meta">
                <span class="build-asset-title">${escapeHtml(item.name)}</span>
                <span class="build-asset-sub">${escapeHtml(item.subtitle)}</span>
              </span>
              <span class="build-asset-badge">${escapeHtml(item.badge)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    this.container.querySelector('#btn-bsp-quick-road')?.addEventListener('click', () => {
      this.activateRoadStyle('stepping-slab');
    });

    this.container.querySelector('#btn-bsp-room-mgr')?.addEventListener('click', () => {
      this.room3DModal?.show?.();
    });

    this.container.querySelector('#btn-bsp-obj-mgr')?.addEventListener('click', () => {
      this.object3DModal?.show?.();
    });

    const searchInp = this.container.querySelector('#build-studio-search');
    if (searchInp) {
      searchInp.addEventListener('input', (ev) => {
        this.searchQuery = ev.target?.value || '';
        const listEl = this.container.querySelector('#build-studio-list');
        const countEl = this.container.querySelector('.build-studio-count strong');
        const filtered = this.getFilteredEntries();
        if (countEl) countEl.textContent = String(filtered.length);
        if (listEl) {
          listEl.innerHTML = filtered.length === 0
            ? `<div class="build-studio-empty">Tidak ada aset yang cocok dengan pencarian "${escapeHtml(this.searchQuery)}".</div>`
            : filtered.map((item) => `
              <button type="button" class="build-asset-card" data-kind="${item.kind}" data-id="${escapeHtml(item.id)}">
                <span class="build-asset-thumb" style="border-color: ${escapeHtml(item.color)};">${item.icon}</span>
                <span class="build-asset-meta">
                  <span class="build-asset-title">${escapeHtml(item.name)}</span>
                  <span class="build-asset-sub">${escapeHtml(item.subtitle)}</span>
                </span>
                <span class="build-asset-badge">${escapeHtml(item.badge)}</span>
              </button>
            `).join('');
          this._bindCardClicks();
        }
      });
    }

    this.container.querySelectorAll('[data-build-cat]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.getAttribute('data-build-cat') || 'all';
        this.render();
      });
    });

    this._bindCardClicks();
  }

  _bindCardClicks() {
    this.container?.querySelectorAll('.build-asset-card')?.forEach((card) => {
      card.addEventListener('click', () => {
        const kind = card.getAttribute('data-kind');
        const id = card.getAttribute('data-id');
        if (!id) return;
        if (kind === 'building') this.placeBuildingPreset(id);
        else if (kind === 'structure') this.placeStructurePreset(id);
        else if (kind === 'road') this.activateRoadStyle(id);
      });
    });
  }
}
