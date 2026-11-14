/**
 * NetMap — Photoshop-Style Device Layers Panel (Right Sidebar Tab Component)
 * Displays all devices placed on the map organized by Device Library groups/models,
 * with Photoshop-style Eye (visibility), Lock (position lock), Folder collapse,
 * sub-model chips, camera focus, and instant selection.
 */

import {
  DEVICE_CATEGORIES,
  DEVICE_STATUSES,
  MIKROTIK_CATALOG,
  RUIJIE_CATALOG,
  TPLINK_CATALOG,
  getDeviceDefByType
} from '../devices/device-library.js';
import { getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';

const MIKROTIK_TYPES = new Set(MIKROTIK_CATALOG.map((i) => i.type));
const RUIJIE_TYPES = new Set(RUIJIE_CATALOG.map((i) => i.type));
const TPLINK_TYPES = new Set(TPLINK_CATALOG.map((i) => i.type));

export class DeviceLayersPanel {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('./viewport-navigator.js').ViewportNavigator} [options.viewportNavigator]
   * @param {Function} [options.getMap3DEngine]
   */
  constructor({ container, deviceManager, viewportNavigator = null, getMap3DEngine = null }) {
    this.container = container;
    this.deviceManager = deviceManager;
    this.viewportNavigator = viewportNavigator;
    this.getMap3DEngine = getMap3DEngine;

    this.activeTab = 'properties'; // 'properties' | 'layers'
    this.searchQuery = '';
    this.libraryFilter = 'all'; // 'all' | 'custom' | 'mikrotik' | 'ruijie' | 'tplink' | 'standard'
    this.groupByMode = 'library-group'; // 'library-group' | 'library-type' | 'category' | 'location' | 'status'
    this.collapsedGroups = new Set();
    this.groupSubTypeFilter = new Map(); // groupId -> 'all' | deviceType
    this.autoFocusOnSelect = true;

    this.initSidebarTabs();
    this.render();
    this.bindEvents();
  }

  initSidebarTabs() {
    const tabBtns = document.querySelectorAll('[data-right-tab]');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-right-tab');
        if (targetTab) {
          this.switchTab(targetTab);
        }
      });
    });

    eventBus.on('sidebar-right:switch-tab', ({ tab, deviceId }) => {
      if (tab) {
        this.switchTab(tab);
      }
      if (deviceId && tab === 'layers') {
        requestAnimationFrame(() => {
          const row = this.container?.querySelector(`[data-layer-device-id="${deviceId}"]`);
          row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    });
  }

  /**
   * Switch between 'properties' and 'layers' tab in the right sidebar
   * @param {'properties'|'layers'} tabName
   */
  switchTab(tabName) {
    this.activeTab = tabName;

    // Ensure right sidebar is open
    if (!stateManager.getState().ui.rightSidebarOpen) {
      stateManager.toggleSidebar('right');
    }

    const tabBtns = document.querySelectorAll('[data-right-tab]');
    tabBtns.forEach((btn) => {
      const isMatch = btn.getAttribute('data-right-tab') === tabName;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    const panels = document.querySelectorAll('[data-right-tab-panel]');
    panels.forEach((panel) => {
      const isMatch = panel.getAttribute('data-right-tab-panel') === tabName;
      panel.style.display = isMatch ? 'block' : 'none';
    });

    if (tabName === 'layers') {
      this.renderLayerList();
    }
  }

  /**
   * Determine which Library Perangkat group a placed device belongs to
   * @param {Object} device
   * @returns {{id: string, title: string, icon: string, color: string, order: number, filterClass: string}}
   */
  resolveLibraryGroup(device) {
    const type = device.type || 'router';
    const brandLower = (device.brand || '').toLowerCase();
    const isCustom =
      type === 'custom' ||
      Boolean(device.customImage) ||
      Boolean(device.spatial3d?.customModelUrl);

    if (isCustom) {
      return {
        id: 'lib-custom',
        title: 'Perangkat Kustom',
        icon: 'sparkles',
        color: '#d97706',
        order: 1,
        filterClass: 'custom'
      };
    }

    if (MIKROTIK_TYPES.has(type) || brandLower.includes('mikrotik')) {
      return {
        id: 'lib-mikrotik',
        title: 'MikroTik Series',
        icon: 'router',
        color: '#2a7c13',
        order: 2,
        filterClass: 'mikrotik'
      };
    }

    if (RUIJIE_TYPES.has(type) || brandLower.includes('ruijie') || brandLower.includes('reyee')) {
      return {
        id: 'lib-ruijie',
        title: 'Ruijie / Reyee Series',
        icon: 'cpu',
        color: '#0284c7',
        order: 3,
        filterClass: 'ruijie'
      };
    }

    if (TPLINK_TYPES.has(type) || brandLower.includes('tp-link') || brandLower.includes('tplink')) {
      return {
        id: 'lib-tplink',
        title: 'TP-Link Switch & Hub',
        icon: 'network',
        color: '#059669',
        order: 4,
        filterClass: 'tplink'
      };
    }

    const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
    const catOrderMap = { core: 5, distribution: 6, infrastructure: 7, endDevice: 8 };
    return {
      id: `lib-std-${cat.id}`,
      title: cat.name,
      icon: cat.icon || 'box',
      color: cat.color || '#2a7c13',
      order: catOrderMap[cat.id] || 9,
      filterClass: 'standard'
    };
  }

  /**
   * Resolve group metadata for a device based on current groupByMode
   * @param {Object} device
   */
  resolveGroupForDevice(device) {
    const libGroup = this.resolveLibraryGroup(device);

    if (this.groupByMode === 'library-type') {
      const def = getDeviceDefByType(device.type);
      const typeLabel = def ? def.name : (device.model || device.type || 'Perangkat Kustom');
      const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
      return {
        id: `type-${device.type || 'custom'}-${device.model || ''}`,
        title: typeLabel,
        icon: def?.lucideIcon || cat.icon || 'cpu',
        color: cat.color || libGroup.color,
        order: libGroup.order,
        filterClass: libGroup.filterClass
      };
    }

    if (this.groupByMode === 'category') {
      const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
      const catOrderMap = { core: 1, distribution: 2, infrastructure: 3, endDevice: 4 };
      return {
        id: `cat-${cat.id}`,
        title: cat.name,
        icon: cat.icon || 'layers',
        color: cat.color || '#2a7c13',
        order: catOrderMap[cat.id] || 5,
        filterClass: libGroup.filterClass
      };
    }

    if (this.groupByMode === 'location') {
      const loc = (device.location || '').trim() || 'Tanpa Lokasi / Outdoor';
      return {
        id: `loc-${loc.toLowerCase()}`,
        title: loc,
        icon: 'map-pin',
        color: '#2a7c13',
        order: loc === 'Tanpa Lokasi / Outdoor' ? 99 : 1,
        filterClass: libGroup.filterClass
      };
    }

    if (this.groupByMode === 'status') {
      const st = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;
      const stOrder = { online: 1, warning: 2, offline: 3, unknown: 4 };
      return {
        id: `status-${st.id}`,
        title: `Status: ${st.name}`,
        icon: 'activity',
        color: st.color,
        order: stOrder[st.id] || 5,
        filterClass: libGroup.filterClass
      };
    }

    // Default: 'library-group' (Grup Library Perangkat)
    return libGroup;
  }

  /**
   * Check whether a device matches current search query & library filter pill
   * @param {Object} device
   * @returns {boolean}
   */
  matchesFilter(device) {
    const libGroup = this.resolveLibraryGroup(device);
    if (this.libraryFilter !== 'all' && libGroup.filterClass !== this.libraryFilter) {
      return false;
    }

    if (!this.searchQuery) return true;
    const q = this.searchQuery.toLowerCase();
    const def = getDeviceDefByType(device.type);
    const haystack = [
      device.name,
      device.id,
      device.type,
      device.brand,
      device.model,
      device.location,
      device.network?.ip,
      device.network?.hostname,
      device.network?.vlan ? `vlan ${device.network.vlan}` : '',
      def?.name,
      libGroup.title
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="ps-layers-panel">
        <!-- Top Controls: Search, Library Filter Pills, & Grouping Mode -->
        <div class="ps-layers-controls">
          <div class="ps-layers-search-wrap">
            <i data-lucide="search" class="ps-layers-search-icon"></i>
            <input type="text" id="ps-layers-search-input" class="ps-layers-search-input"
                   placeholder="Cari layer perangkat, IP, model, gedung..."
                   value="${this.escapeHtml(this.searchQuery)}">
            <button type="button" id="btn-clear-ps-layers-search" class="ps-layers-search-clear"
                    title="Bersihkan pencarian" style="display: ${this.searchQuery ? 'inline-flex' : 'none'};">&times;</button>
          </div>

          <!-- Library Filter Pills (Matching Library Perangkat) -->
          <div id="ps-layers-filter-pills" class="ps-layers-filter-pills">
            ${this.renderLibraryFilterPills()}
          </div>

          <!-- Photoshop Layer Bar: Group By + Global Eye/Expand -->
          <div class="ps-layers-toolbar-row">
            <div style="display: flex; align-items: center; gap: 5px; flex: 1; min-width: 0;">
              <i data-lucide="folder-tree" style="width: 13px; height: 13px; color: var(--accent-blue); flex-shrink: 0;"></i>
              <select id="ps-layers-groupby-select" class="ps-layers-groupby-select" title="Kelompokkan Layer Perangkat Berdasarkan">
                <option value="library-group" ${this.groupByMode === 'library-group' ? 'selected' : ''}>Grup: Library Perangkat</option>
                <option value="library-type" ${this.groupByMode === 'library-type' ? 'selected' : ''}>Grup: Tipe / Model Library</option>
                <option value="category" ${this.groupByMode === 'category' ? 'selected' : ''}>Grup: Kategori Jaringan</option>
                <option value="location" ${this.groupByMode === 'location' ? 'selected' : ''}>Grup: Lokasi / Gedung</option>
                <option value="status" ${this.groupByMode === 'status' ? 'selected' : ''}>Grup: Status Online/Offline</option>
              </select>
            </div>
            <div style="display: flex; align-items: center; gap: 3px;">
              <button type="button" id="btn-ps-show-all" class="ps-layer-mini-btn" title="Tampilkan / Sembunyikan Semua Perangkat di Peta">
                <i data-lucide="eye" style="width: 13px; height: 13px;"></i>
              </button>
              <button type="button" id="btn-ps-unlock-all" class="ps-layer-mini-btn" title="Buka Kunci / Kunci Posisi Semua Perangkat">
                <i data-lucide="unlock" style="width: 13px; height: 13px;"></i>
              </button>
              <button type="button" id="btn-ps-collapse-all" class="ps-layer-mini-btn" title="Buka / Tutup Semua Folder Grup">
                <i data-lucide="chevrons-up-down" style="width: 13px; height: 13px;"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Photoshop Layer Tree List -->
        <div id="ps-layers-tree-container" class="ps-layers-tree"></div>

        <!-- Photoshop Layer Window Bottom Dock Footer -->
        <div class="ps-layers-footer">
          <label class="ps-layers-autofocus-toggle" title="Otomatis arahkan kamera 2D/3D saat memilih layer perangkat">
            <input type="checkbox" id="ps-layers-autofocus-cb" ${this.autoFocusOnSelect ? 'checked' : ''}>
            <span>Auto-Fokus Peta</span>
          </label>
          <div class="ps-layers-footer-actions">
            <button type="button" id="btn-ps-footer-focus" class="ps-layer-mini-btn" title="Fokus Kamera ke Perangkat Terpilih">
              <i data-lucide="crosshair" style="width: 13px; height: 13px;"></i>
            </button>
            <button type="button" id="btn-ps-footer-props" class="ps-layer-mini-btn" title="Buka Konfigurasi Properti Perangkat Terpilih">
              <i data-lucide="sliders" style="width: 13px; height: 13px;"></i>
            </button>
            <button type="button" id="btn-ps-footer-duplicate" class="ps-layer-mini-btn" title="Duplikat Perangkat Terpilih">
              <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
            </button>
            <button type="button" id="btn-ps-footer-delete" class="ps-layer-mini-btn ps-layer-mini-btn-danger" title="Hapus Perangkat Terpilih">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindStaticControls();
    this.renderLayerList();
  }

  renderLibraryFilterPills() {
    const pills = [
      { id: 'all', label: 'Semua' },
      { id: 'custom', label: 'Kustom' },
      { id: 'mikrotik', label: 'MikroTik' },
      { id: 'ruijie', label: 'Ruijie' },
      { id: 'tplink', label: 'TP-Link' },
      { id: 'standard', label: 'Umum' }
    ];

    return pills
      .map((p) => {
        const isActive = this.libraryFilter === p.id;
        return `
          <button type="button" class="ps-filter-pill ${isActive ? 'active' : ''}" data-lib-filter="${p.id}">
            ${p.label}
          </button>
        `;
      })
      .join('');
  }

  bindStaticControls() {
    const searchInput = this.container.querySelector('#ps-layers-search-input');
    const clearBtn = this.container.querySelector('#btn-clear-ps-layers-search');

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value || '';
      if (clearBtn) {
        clearBtn.style.display = this.searchQuery ? 'inline-flex' : 'none';
      }
      this.renderLayerList();
    });

    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      if (searchInput) searchInput.value = '';
      clearBtn.style.display = 'none';
      this.renderLayerList();
    });

    this.container.querySelector('#ps-layers-groupby-select')?.addEventListener('change', (e) => {
      this.groupByMode = e.target.value || 'library-group';
      this.collapsedGroups.clear();
      this.renderLayerList();
    });

    this.container.querySelector('#ps-layers-autofocus-cb')?.addEventListener('change', (e) => {
      this.autoFocusOnSelect = Boolean(e.target.checked);
    });

    // Global Show/Hide All
    this.container.querySelector('#btn-ps-show-all')?.addEventListener('click', () => {
      const allDevs = this.deviceManager.getAllDevices();
      if (allDevs.length === 0) return;
      const anyHidden = allDevs.some((d) => d.layerVisible === false);
      const nextVis = anyHidden ? true : false;
      allDevs.forEach((d) => {
        this.deviceManager.updateDevice(d.id, { layerVisible: nextVis });
      });
      this.renderLayerList();
    });

    // Global Lock/Unlock All
    this.container.querySelector('#btn-ps-unlock-all')?.addEventListener('click', () => {
      const allDevs = this.deviceManager.getAllDevices();
      if (allDevs.length === 0) return;
      const anyLocked = allDevs.some((d) => d.layerLocked === true);
      const nextLocked = anyLocked ? false : true;
      allDevs.forEach((d) => {
        this.deviceManager.updateDevice(d.id, { layerLocked: nextLocked });
      });
      this.renderLayerList();
    });

    // Expand / Collapse All Groups
    this.container.querySelector('#btn-ps-collapse-all')?.addEventListener('click', () => {
      const allGroupEls = this.container.querySelectorAll('[data-ps-group-id]');
      if (this.collapsedGroups.size > 0) {
        this.collapsedGroups.clear();
      } else {
        allGroupEls.forEach((el) => {
          const gid = el.getAttribute('data-ps-group-id');
          if (gid) this.collapsedGroups.add(gid);
        });
      }
      this.renderLayerList();
    });

    // Footer Actions for Selected Device
    this.container.querySelector('#btn-ps-footer-focus')?.addEventListener('click', () => {
      const selId = this.deviceManager.selectedDeviceId;
      if (!selId) return;
      this.focusCameraOnDevice(selId);
    });

    this.container.querySelector('#btn-ps-footer-props')?.addEventListener('click', () => {
      const selId = this.deviceManager.selectedDeviceId;
      if (!selId) return;
      const dev = this.deviceManager.getDeviceById(selId);
      if (dev) {
        this.deviceManager.selectDevice(selId, { preserveMultiOnDrag: true });
        this.switchTab('properties');
      }
    });

    this.container.querySelector('#btn-ps-footer-duplicate')?.addEventListener('click', () => {
      const selId = this.deviceManager.selectedDeviceId;
      if (!selId) return;
      this.deviceManager.duplicateDevice(selId);
    });

    this.container.querySelector('#btn-ps-footer-delete')?.addEventListener('click', () => {
      const selectedIds = this.deviceManager.getSelectedDeviceIds?.() || [];
      if (selectedIds.length > 1) {
        if (confirm(`Hapus ${selectedIds.length} perangkat terpilih dari peta?`)) {
          this.deviceManager.deleteSelectedDevices();
        }
        return;
      }
      const selId = this.deviceManager.selectedDeviceId;
      if (!selId) return;
      const dev = this.deviceManager.getDeviceById(selId);
      if (dev && confirm(`Hapus perangkat "${dev.name}" dari peta?`)) {
        this.deviceManager.deleteDevice(selId);
      }
    });
  }

  bindFilterPillEvents() {
    const pillContainer = this.container.querySelector('#ps-layers-filter-pills');
    if (!pillContainer) return;
    pillContainer.innerHTML = this.renderLibraryFilterPills();
    pillContainer.querySelectorAll('[data-lib-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.libraryFilter = btn.getAttribute('data-lib-filter') || 'all';
        this.bindFilterPillEvents();
        this.renderLayerList();
      });
    });
  }

  focusCameraOnDevice(deviceId) {
    const dev = this.deviceManager.getDeviceById(deviceId);
    if (!dev) return;

    if (this.viewportNavigator && typeof this.viewportNavigator.focusOnCoordinates === 'function') {
      this.viewportNavigator.focusOnCoordinates(dev.position, 1.4);
    } else {
      eventBus.emit('viewport:center-on', dev.position);
    }

    const map3d = typeof this.getMap3DEngine === 'function' ? this.getMap3DEngine() : null;
    if (map3d && map3d.isActive) {
      map3d.focusOnDevice(deviceId);
    }
  }

  updateBadgeCount() {
    const totalCount = this.deviceManager.getAllDevices().length;
    const badgeEl = document.getElementById('sidebar-layers-count-badge');
    if (badgeEl) {
      badgeEl.textContent = String(totalCount);
    }
  }

  renderLayerList() {
    this.updateBadgeCount();
    this.bindFilterPillEvents();

    const treeContainer = this.container?.querySelector('#ps-layers-tree-container');
    if (!treeContainer) return;

    const allDevices = this.deviceManager.getAllDevices();
    if (allDevices.length === 0) {
      treeContainer.innerHTML = `
        <div class="ps-layers-empty">
          <i data-lucide="layers" style="width: 24px; height: 24px; color: var(--text-muted); opacity: 0.7;"></i>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 12.5px;">Belum Ada Layer Perangkat</div>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">
            Seret perangkat dari <strong>Library Perangkat</strong> di kiri ke atas peta untuk mulai menyusun layer jaringan.
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ root: treeContainer });
      return;
    }

    const matchedDevices = allDevices.filter((d) => this.matchesFilter(d));
    if (matchedDevices.length === 0) {
      treeContainer.innerHTML = `
        <div class="ps-layers-empty">
          <i data-lucide="search-x" style="width: 22px; height: 22px; color: var(--text-muted);"></i>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 12px;">Tidak Ada Perangkat Cocok</div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Ubah filter kategori Library atau kata kunci pencarian.
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ root: treeContainer });
      return;
    }

    // Group devices into Photoshop-style Layer Folders
    const groupsMap = new Map();
    matchedDevices.forEach((dev) => {
      const grpMeta = this.resolveGroupForDevice(dev);
      if (!groupsMap.has(grpMeta.id)) {
        groupsMap.set(grpMeta.id, {
          ...grpMeta,
          devices: []
        });
      }
      groupsMap.get(grpMeta.id).devices.push(dev);
    });

    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });

    const selectedDeviceId = this.deviceManager.selectedDeviceId;

    let html = '';
    sortedGroups.forEach((group) => {
      const isCollapsed = this.collapsedGroups.has(group.id);
      const allGroupVisible = group.devices.every((d) => d.layerVisible !== false);
      const anyGroupLocked = group.devices.length > 0 && group.devices.every((d) => d.layerLocked === true);
      const hasSelectedInGroup = group.devices.some((d) =>
        this.deviceManager.isDeviceSelected ? this.deviceManager.isDeviceSelected(d.id) : d.id === selectedDeviceId
      );

      // Build sub-model chips inside this group so user can filter by specific Library Item
      const subTypesMap = new Map();
      group.devices.forEach((d) => {
        const def = getDeviceDefByType(d.type);
        const typeKey = d.model || def?.name || d.type || 'Custom';
        subTypesMap.set(typeKey, (subTypesMap.get(typeKey) || 0) + 1);
      });
      const activeSubType = this.groupSubTypeFilter.get(group.id) || 'all';
      const filteredGroupDevices =
        activeSubType === 'all'
          ? group.devices
          : group.devices.filter((d) => {
              const def = getDeviceDefByType(d.type);
              const typeKey = d.model || def?.name || d.type || 'Custom';
              return typeKey === activeSubType;
            });

      html += `
        <div class="ps-layer-group ${hasSelectedInGroup ? 'has-selected' : ''}" data-ps-group-id="${group.id}">
          <!-- Photoshop Group Folder Header -->
          <div class="ps-layer-group-header">
            <button type="button" class="ps-eye-btn ${allGroupVisible ? 'is-visible' : 'is-hidden'}"
                    data-group-eye="${group.id}" title="Tampilkan / Sembunyikan Seluruh Grup ${this.escapeHtml(group.title)}">
              <i data-lucide="${allGroupVisible ? 'eye' : 'eye-off'}" style="width: 13px; height: 13px;"></i>
            </button>
            <button type="button" class="ps-lock-btn ${anyGroupLocked ? 'is-locked' : ''}"
                    data-group-lock="${group.id}" title="Kunci / Buka Kunci Posisi Seluruh Grup ${this.escapeHtml(group.title)}">
              <i data-lucide="${anyGroupLocked ? 'lock' : 'unlock'}" style="width: 12px; height: 12px;"></i>
            </button>
            <button type="button" class="ps-folder-toggle" data-group-toggle="${group.id}">
              <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" style="width: 13px; height: 13px; flex-shrink: 0;"></i>
              <i data-lucide="${isCollapsed ? 'folder' : 'folder-open'}" style="width: 14px; height: 14px; color: ${group.color}; flex-shrink: 0;"></i>
              <span class="ps-folder-title">${this.escapeHtml(group.title)}</span>
              <span class="ps-folder-count" style="color: ${group.color}; border-color: ${group.color}40;">
                ${group.devices.length}
              </span>
            </button>
          </div>

          ${
            !isCollapsed && subTypesMap.size > 1
              ? `
            <div class="ps-group-subtype-bar">
              <button type="button" class="ps-subtype-chip ${activeSubType === 'all' ? 'active' : ''}"
                      data-subtype-group="${group.id}" data-subtype-val="all">
                Semua (${group.devices.length})
              </button>
              ${Array.from(subTypesMap.entries())
                .map(
                  ([sKey, sCount]) => `
                <button type="button" class="ps-subtype-chip ${activeSubType === sKey ? 'active' : ''}"
                        data-subtype-group="${group.id}" data-subtype-val="${this.escapeHtml(sKey)}">
                  ${this.escapeHtml(sKey)} (${sCount})
                </button>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }

          <!-- Group Child Device Layers -->
          <div class="ps-layer-group-children" style="display: ${isCollapsed ? 'none' : 'flex'};">
            ${filteredGroupDevices.map((dev) => this.renderDeviceLayerRow(dev, selectedDeviceId)).join('')}
          </div>
        </div>
      `;
    });

    treeContainer.innerHTML = html;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: treeContainer });
    }

    this.bindTreeInteractions(treeContainer);
  }

  renderDeviceLayerRow(device, selectedDeviceId) {
    const isSelected = this.deviceManager.isDeviceSelected
      ? this.deviceManager.isDeviceSelected(device.id)
      : device.id === selectedDeviceId;
    const isVisible = device.layerVisible !== false;
    const isLocked = device.layerLocked === true;
    const cat = DEVICE_CATEGORIES[device.category] || DEVICE_CATEGORIES.core;
    const statusDef = DEVICE_STATUSES[device.status] || DEVICE_STATUSES.unknown;
    const def = getDeviceDefByType(device.type);

    let thumbHtml = '';
    if (device.customImage) {
      thumbHtml = `<img src="${device.customImage}" style="width: 18px; height: 18px; object-fit: contain; border-radius: 3px;" alt="${this.escapeHtml(device.name)}">`;
    } else {
      const iconKey = device.customIcon || getDefaultIconForType(device.type || 'router');
      thumbHtml = getDeviceIconSvg(iconKey, { color: cat.color, size: 16 });
    }

    const modelText = [device.brand, device.model].filter(Boolean).join(' ') || def?.name || device.type;
    const ipText = device.network?.ip ? ` • ${device.network.ip}` : '';
    const has3dGlb = Boolean(device.spatial3d?.customModelUrl);

    return `
      <div class="ps-layer-row ${isSelected ? 'is-selected' : ''} ${!isVisible ? 'is-hidden-layer' : ''}"
           data-layer-device-id="${device.id}"
           title="Klik: Pilih di Peta • Double-Klik: Buka Properti">
        <!-- Eye Visibility Toggle -->
        <button type="button" class="ps-eye-btn ${isVisible ? 'is-visible' : 'is-hidden'}"
                data-dev-eye="${device.id}"
                title="${isVisible ? 'Sembunyikan layer perangkat ini di peta' : 'Tampilkan layer perangkat ini di peta'}">
          <i data-lucide="${isVisible ? 'eye' : 'eye-off'}" style="width: 13px; height: 13px;"></i>
        </button>

        <!-- Lock Position Toggle -->
        <button type="button" class="ps-lock-btn ${isLocked ? 'is-locked' : ''}"
                data-dev-lock="${device.id}"
                title="${isLocked ? 'Buka kunci posisi perangkat' : 'Kunci posisi perangkat agar tidak tergeser'}">
          <i data-lucide="${isLocked ? 'lock' : 'unlock'}" style="width: 12px; height: 12px;"></i>
        </button>

        <!-- Layer Thumbnail + Status Dot -->
        <div class="ps-layer-thumb" style="border-color: ${cat.color};">
          ${thumbHtml}
          <span class="ps-layer-status-dot" style="background-color: ${statusDef.color};" title="Status: ${statusDef.name}"></span>
        </div>

        <!-- Layer Name & Library Subtitle -->
        <div class="ps-layer-info">
          <div class="ps-layer-name-row">
            <span class="ps-layer-name">${this.escapeHtml(device.name)}</span>
            ${has3dGlb ? `<span class="ps-layer-badge-3d" title="Menggunakan Model 3D .GLB Kustom">3D</span>` : ''}
          </div>
          <div class="ps-layer-meta">
            ${this.escapeHtml(modelText)}${this.escapeHtml(ipText)}
          </div>
        </div>

        <!-- Quick Row Actions (Focus & Open Properties) -->
        <div class="ps-layer-actions">
          <button type="button" class="ps-row-action-btn" data-dev-focus="${device.id}" title="Fokus Kamera ke Perangkat Ini">
            <i data-lucide="crosshair" style="width: 12px; height: 12px;"></i>
          </button>
          <button type="button" class="ps-row-action-btn" data-dev-props="${device.id}" title="Edit Properti & Konfigurasi">
            <i data-lucide="sliders" style="width: 12px; height: 12px;"></i>
          </button>
        </div>
      </div>
    `;
  }

  bindTreeInteractions(treeContainer) {
    // 1. Group Collapse / Expand Toggle
    treeContainer.querySelectorAll('[data-group-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = btn.getAttribute('data-group-toggle');
        if (!groupId) return;
        if (this.collapsedGroups.has(groupId)) {
          this.collapsedGroups.delete(groupId);
        } else {
          this.collapsedGroups.add(groupId);
        }
        this.renderLayerList();
      });
    });

    // 2. Group Eye Visibility Toggle
    treeContainer.querySelectorAll('[data-group-eye]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = btn.getAttribute('data-group-eye');
        const groupEl = treeContainer.querySelector(`[data-ps-group-id="${groupId}"]`);
        if (!groupEl) return;
        const devIds = Array.from(groupEl.querySelectorAll('[data-layer-device-id]')).map((el) =>
          el.getAttribute('data-layer-device-id')
        );
        const devices = devIds.map((id) => this.deviceManager.getDeviceById(id)).filter(Boolean);
        const allVisible = devices.every((d) => d.layerVisible !== false);
        const nextVis = !allVisible;
        devices.forEach((d) => {
          this.deviceManager.updateDevice(d.id, { layerVisible: nextVis });
        });
        this.renderLayerList();
      });
    });

    // 3. Group Lock Toggle
    treeContainer.querySelectorAll('[data-group-lock]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = btn.getAttribute('data-group-lock');
        const groupEl = treeContainer.querySelector(`[data-ps-group-id="${groupId}"]`);
        if (!groupEl) return;
        const devIds = Array.from(groupEl.querySelectorAll('[data-layer-device-id]')).map((el) =>
          el.getAttribute('data-layer-device-id')
        );
        const devices = devIds.map((id) => this.deviceManager.getDeviceById(id)).filter(Boolean);
        const allLocked = devices.every((d) => d.layerLocked === true);
        const nextLocked = !allLocked;
        devices.forEach((d) => {
          this.deviceManager.updateDevice(d.id, { layerLocked: nextLocked });
        });
        this.renderLayerList();
      });
    });

    // 4. Sub-Type Filter Chips inside a Group
    treeContainer.querySelectorAll('[data-subtype-group]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = chip.getAttribute('data-subtype-group');
        const val = chip.getAttribute('data-subtype-val') || 'all';
        if (groupId) {
          this.groupSubTypeFilter.set(groupId, val);
          this.renderLayerList();
        }
      });
    });

    // 5. Individual Device Eye Visibility Toggle
    treeContainer.querySelectorAll('[data-dev-eye]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.getAttribute('data-dev-eye');
        const dev = devId ? this.deviceManager.getDeviceById(devId) : null;
        if (!dev) return;
        const nextVis = dev.layerVisible === false ? true : false;
        this.deviceManager.updateDevice(devId, { layerVisible: nextVis });
        this.renderLayerList();
      });
    });

    // 6. Individual Device Lock Toggle
    treeContainer.querySelectorAll('[data-dev-lock]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.getAttribute('data-dev-lock');
        const dev = devId ? this.deviceManager.getDeviceById(devId) : null;
        if (!dev) return;
        const nextLocked = !dev.layerLocked;
        this.deviceManager.updateDevice(devId, { layerLocked: nextLocked });
        this.renderLayerList();
      });
    });

    // 7. Quick Focus Button on Row
    treeContainer.querySelectorAll('[data-dev-focus]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.getAttribute('data-dev-focus');
        if (!devId) return;
        this.deviceManager.selectDevice(devId);
        this.focusCameraOnDevice(devId);
      });
    });

    // 8. Quick Open Properties Button on Row
    treeContainer.querySelectorAll('[data-dev-props]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.getAttribute('data-dev-props');
        if (!devId) return;
        this.deviceManager.selectDevice(devId);
        this.switchTab('properties');
      });
    });

    // 9. Click & Double-Click on Layer Row (Ctrl/Shift multi-select supported)
    treeContainer.querySelectorAll('[data-layer-device-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        const devId = row.getAttribute('data-layer-device-id');
        if (!devId) return;
        this.deviceManager.selectDevice(devId, {
          toggle: Boolean(e.ctrlKey || e.metaKey),
          additive: Boolean(e.shiftKey)
        });
        if (this.autoFocusOnSelect && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          this.focusCameraOnDevice(devId);
        }
      });

      row.addEventListener('dblclick', () => {
        const devId = row.getAttribute('data-layer-device-id');
        if (!devId) return;
        this.deviceManager.selectDevice(devId);
        this.focusCameraOnDevice(devId);
        this.switchTab('properties');
      });
    });
  }

  bindEvents() {
    const refresh = () => {
      this.updateBadgeCount();
      if (this.activeTab === 'layers') {
        this.renderLayerList();
      }
    };

    eventBus.on('device:added', refresh);
    eventBus.on('device:updated', refresh);
    eventBus.on('device:deleted', refresh);
    eventBus.on('device:selected', (device) => {
      this.updateBadgeCount();
      if (this.activeTab === 'layers') {
        this.renderLayerList();
        requestAnimationFrame(() => {
          const row = this.container?.querySelector(`[data-layer-device-id="${device?.id}"]`);
          row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    });
    eventBus.on('device:selection-changed', () => {
      this.updateBadgeCount();
      if (this.activeTab === 'layers') {
        this.renderLayerList();
      }
    });
    eventBus.on('device:deselected', refresh);

    // When a cable is selected, switch to the Properties tab so user can configure the cable
    eventBus.on('connection:selected', () => {
      if (this.activeTab !== 'properties') {
        this.switchTab('properties');
      }
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
