/**
 * NetMap — Device Library Palette (Left Sidebar Component)
 * Renders draggable device components categorized into MikroTik Hardware Series,
 * Core, Distribution, Infra, End Devices, and User-Defined Custom Devices,
 * with real-time search, brand filters, and multi-click placement mode.
 */

import { DEVICE_CATEGORIES, STANDARD_DEVICE_CATALOG, MIKROTIK_CATALOG, RUIJIE_CATALOG, TPLINK_CATALOG } from '../devices/device-library.js';
import { getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';

export class DevicePalette {
  /**
   * @param {HTMLElement} container 
   */
  constructor(container) {
    this.container = container;
    this.activeTypeToPlace = null;
    this.activeCustomTemplateToPlace = null;
    this.multiPlaceMode = false;
    this.searchQuery = '';
    this.activeFilter = 'all'; // 'all' | 'mikrotik' | 'standard'
    this.customTemplates = this.loadCustomTemplates();

    this.render();
    this.bindStaticEvents();
    this.bindCatalogItemEvents();
  }

  /**
   * Load saved custom device templates from localStorage
   * @returns {Object[]}
   */
  loadCustomTemplates() {
    try {
      const raw = localStorage.getItem('netmap_custom_templates');
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn('[DevicePalette] Failed to load custom templates from localStorage:', err);
      return [];
    }
  }

  /**
   * Persist custom templates to localStorage
   */
  saveCustomTemplates() {
    try {
      localStorage.setItem('netmap_custom_templates', JSON.stringify(this.customTemplates));
    } catch (err) {
      console.warn('[DevicePalette] Failed to save custom templates to localStorage:', err);
    }
  }

  /**
   * Add a new user-defined custom device template to the library palette
   * @param {Object} data 
   * @returns {Object} Created template
   */
  addCustomTemplate(data) {
    const template = {
      id: `custom-tmpl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      isCustom: true,
      name: data.name || 'Perangkat Kustom',
      category: data.category || 'core',
      type: data.type || 'custom',
      brand: data.brand || '',
      model: data.model || '',
      status: data.status || 'online',
      markerStyle: data.markerStyle || 'rounded',
      customIcon: data.customIcon || '',
      customImage: data.customImage || '',
      network: data.network || {},
      wirelessCoverage: data.wirelessCoverage || null,
      createdAt: new Date().toISOString()
    };

    this.customTemplates.unshift(template);
    this.saveCustomTemplates();
    this.renderCatalogLists();

    return template;
  }

  /**
   * Remove a custom template from the library palette
   * @param {string} templateId 
   */
  removeCustomTemplate(templateId) {
    this.customTemplates = this.customTemplates.filter((t) => t.id !== templateId);
    if (this.activeCustomTemplateToPlace?.id === templateId) {
      this.activeCustomTemplateToPlace = null;
    }
    this.saveCustomTemplates();
    this.renderCatalogLists();
  }

  /**
   * Get all custom device templates
   * @returns {Object[]}
   */
  getCustomTemplates() {
    return this.customTemplates;
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="device-palette-wrapper" style="display: flex; flex-direction: column; gap: 10px;">
        <!-- Quick Actions Row: Custom Device & MikroTik Batch Insert -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-add-custom-device" class="btn btn-secondary btn-sm" 
                  title="Buka dialog untuk membuat perangkat jaringan kustom dengan ikon atau gambar sendiri"
                  style="width: 100%; justify-content: center; gap: 6px; font-weight: 700; padding: 8px 10px; height: auto; border: 1.5px dashed var(--accent-blue, #2a7c13); background: var(--bg-tertiary, #f2dac8); color: var(--accent-blue, #2a7c13); cursor: pointer; border-radius: 8px; box-shadow: var(--shadow-sm);">
            <i data-lucide="plus-circle" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
            <span>+ Tambah Perangkat Kustom</span>
          </button>

          <button id="btn-open-mikrotik-insert" class="btn btn-primary btn-sm"
                  title="Sisipkan 1 atau banyak perangkat MikroTik, Ruijie, atau TP-Link sekaligus lengkap dengan auto IP"
                  style="width: 100%; justify-content: center; gap: 6px; font-weight: 700; padding: 8px 10px; height: auto; border-radius: 8px;">
            <i data-lucide="zap" style="width: 14px; height: 14px; flex-shrink: 0;"></i>
            <span>Insert Cepat Vendor (Batch)</span>
          </button>
        </div>

        <!-- Search & Brand Filter Bar -->
        <div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 2px;">
          <div style="position: relative; display: flex; align-items: center;">
            <i data-lucide="search" style="width: 13px; height: 13px; color: var(--text-muted); position: absolute; left: 8px; pointer-events: none;"></i>
            <input type="text" id="palette-search-input" placeholder="Cari MikroTik, Ruijie, TP-Link, Hub..."
                   value="${escapeHtml(this.searchQuery)}"
                   style="width: 100%; padding: 5px 26px 5px 26px; font-size: 11.5px; border-radius: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
            <button type="button" id="btn-clear-palette-search" title="Hapus pencarian"
                    style="position: absolute; right: 6px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px; line-height: 1; display: ${this.searchQuery ? 'block' : 'none'};">
              &times;
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; flex-wrap: wrap;">
            <div style="display: flex; gap: 3px; flex: 1; flex-wrap: wrap; min-width: 0;">
              ${this.renderFilterPill('all', 'Semua')}
              ${this.renderFilterPill('mikrotik', 'MikroTik')}
              ${this.renderFilterPill('ruijie', 'Ruijie')}
              ${this.renderFilterPill('tplink', 'TP-Link')}
              ${this.renderFilterPill('standard', 'Umum')}
            </div>
            <label title="Tetap aktif di mode tambah perangkat setelah klik di peta agar bisa insert banyak unit berturut-turut"
                   style="display: flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; flex-shrink: 0;">
              <input type="checkbox" id="toggle-multi-place" ${this.multiPlaceMode ? 'checked' : ''} style="accent-color: var(--accent-blue); margin: 0;">
              <span>Multi</span>
            </label>
          </div>
        </div>

        <!-- Dynamic Catalog Lists -->
        <div id="palette-catalog-lists" style="display: flex; flex-direction: column; gap: 14px;">
          ${this.buildCatalogListsHtml()}
        </div>
      </div>
    `;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.container });
    }
  }

  renderFilterPill(filterId, label) {
    const isActive = this.activeFilter === filterId;
    return `
      <button type="button" class="btn-palette-filter" data-filter="${filterId}"
              style="flex: 1 1 auto; min-width: 46px; padding: 3px 6px; font-size: 10px; font-weight: 600; border-radius: 5px; cursor: pointer; white-space: nowrap; border: 1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-color)'}; background: ${isActive ? 'var(--accent-blue)' : 'var(--bg-primary)'}; color: ${isActive ? 'var(--text-inverse)' : 'var(--text-secondary)'}; transition: all 0.15s ease;">
        ${label}
      </button>
    `;
  }

  matchesSearch(item) {
    if (!this.searchQuery) return true;
    const q = this.searchQuery.toLowerCase();
    const haystack = [
      item.name,
      item.type,
      item.brand,
      item.model,
      item.defaultBrand,
      item.defaultModel,
      item.badgeCode,
      item.description
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  }

  buildCatalogListsHtml() {
    let html = '';
    const hasFilterMatches = { count: 0 };

    // 1. Custom Device Category Group (when filter is all)
    if (this.activeFilter === 'all' && this.customTemplates.length > 0) {
      const matchedCustom = this.customTemplates.filter((t) => this.matchesSearch(t));
      if (matchedCustom.length > 0) {
        hasFilterMatches.count += matchedCustom.length;
        html += `
          <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
            <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent-blue, #2a7c13); display: flex; align-items: center; gap: 5px;">
                <i data-lucide="sparkles" style="width: 13px; height: 13px; color: var(--status-warning, #d97706);"></i>
                <span>Perangkat Kustom</span>
              </span>
              <span style="font-size: 10px; color: var(--accent-blue, #2a7c13); background: rgba(42, 124, 19, 0.12); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
                ${matchedCustom.length}
              </span>
            </div>
            <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
        `;

        matchedCustom.forEach((tmpl) => {
          const cat = DEVICE_CATEGORIES[tmpl.category] || DEVICE_CATEGORIES.core;
          const catColor = cat.color || '#2a7c13';
          let thumbHtml = '';
          if (tmpl.customImage) {
            thumbHtml = `<img src="${tmpl.customImage}" style="width: 18px; height: 18px; object-fit: contain; border-radius: 2px;" alt="${escapeHtml(tmpl.name)}" />`;
          } else {
            const iconKey = tmpl.customIcon || getDefaultIconForType(tmpl.type || 'router');
            thumbHtml = getDeviceIconSvg(iconKey, { color: catColor, size: 16 });
          }

          html += `
            <div class="palette-item palette-item-custom" 
                 draggable="true" 
                 data-custom-template-id="${tmpl.id}"
                 data-device-type="${tmpl.type || 'custom'}"
                 data-category="${tmpl.category || 'core'}"
                 style="background-color: var(--bg-primary); border: 1.5px solid var(--accent-cyan, #76c457); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; cursor: grab; transition: all 150ms ease; position: relative;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                  <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.06); border-radius: 4px; flex-shrink: 0; overflow: hidden;">
                    ${thumbHtml}
                  </div>
                  <span style="font-size: 9px; font-weight: 700; color: ${catColor}; font-family: var(--font-mono); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${(tmpl.brand || tmpl.type || 'CUST').substring(0, 4)}
                  </span>
                </div>
                <button class="btn-delete-template" data-template-id="${tmpl.id}" title="Hapus template kustom ini dari library" 
                        style="background: transparent; border: none; padding: 0 2px; cursor: pointer; color: var(--text-muted); font-size: 15px; line-height: 1; border-radius: 3px; transition: color 0.1s ease;">
                  &times;
                </button>
              </div>
              <div class="palette-item-name" title="${escapeHtml(tmpl.name)}">
                ${escapeHtml(tmpl.name)}
              </div>
              <div class="palette-item-sub" title="${escapeHtml(tmpl.brand || '')} ${escapeHtml(tmpl.model || '')}">
                ${tmpl.brand ? `${escapeHtml(tmpl.brand)} ${escapeHtml(tmpl.model || '')}` : (escapeHtml(tmpl.model) || 'Custom')}
              </div>
            </div>
          `;
        });

        html += `</div></div>`;
      }
    }

    // 2. Dedicated Vendor Hardware Series (MikroTik, Ruijie & TP-Link)
    const vendorSections = [
      { id: 'mikrotik', title: 'MikroTik Series', icon: 'router', catalog: MIKROTIK_CATALOG, fallbackBadge: 'MT' },
      { id: 'ruijie', title: 'Ruijie / Reyee Series', icon: 'cpu', catalog: RUIJIE_CATALOG, fallbackBadge: 'RG' },
      { id: 'tplink', title: 'TP-Link Switch & Hub', icon: 'network', catalog: TPLINK_CATALOG, fallbackBadge: 'TPL' }
    ];

    vendorSections.forEach((sec) => {
      if (this.activeFilter !== 'all' && this.activeFilter !== sec.id) return;
      const matched = sec.catalog.filter((item) => this.matchesSearch(item));
      if (matched.length === 0) return;

      hasFilterMatches.count += matched.length;
      html += `
        <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
          <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent-blue, #2a7c13); display: flex; align-items: center; gap: 5px;">
              <i data-lucide="${sec.icon}" style="width: 13px; height: 13px;"></i>
              <span>${sec.title}</span>
            </span>
            <span style="font-size: 10px; color: var(--accent-blue, #2a7c13); background: rgba(42, 124, 19, 0.12); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
              ${matched.length}
            </span>
          </div>
          <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      `;

      matched.forEach((item) => {
        const cat = DEVICE_CATEGORIES[item.category] || DEVICE_CATEGORIES.core;
        const isSelected = this.activeTypeToPlace === item.type && !this.activeCustomTemplateToPlace;
        html += this.renderBuiltInItemCard(item, cat, item.badgeCode || sec.fallbackBadge, isSelected);
      });

      html += `</div></div>`;
    });

    // 3. Standard Built-in Catalog Groups
    if (this.activeFilter === 'all' || this.activeFilter === 'standard') {
      const grouped = {
        core: [],
        distribution: [],
        infrastructure: [],
        endDevice: []
      };

      STANDARD_DEVICE_CATALOG.forEach((item) => {
        if (grouped[item.category] && this.matchesSearch(item)) {
          grouped[item.category].push(item);
        }
      });

      Object.keys(DEVICE_CATEGORIES).forEach((catKey) => {
        const cat = DEVICE_CATEGORIES[catKey];
        const items = grouped[catKey] || [];
        if (items.length === 0) return;

        hasFilterMatches.count += items.length;
        html += `
          <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
            <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: ${cat.color};">
                ${cat.name}
              </span>
              <span style="font-size: 10px; color: var(--text-muted); background: var(--bg-primary); padding: 1px 6px; border-radius: 4px;">
                ${items.length}
              </span>
            </div>
            <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
        `;

        items.forEach((item) => {
          const isSelected = this.activeTypeToPlace === item.type && !this.activeCustomTemplateToPlace;
          html += this.renderBuiltInItemCard(item, cat, item.type.substring(0, 4), isSelected);
        });

        html += `</div></div>`;
      });
    }

    if (hasFilterMatches.count === 0) {
      html = `
        <div style="padding: 20px 10px; text-align: center; color: var(--text-muted); font-size: 11.5px; background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color);">
          Tidak ada perangkat yang cocok dengan pencarian "<strong>${escapeHtml(this.searchQuery)}</strong>".
        </div>
      `;
    }

    return html;
  }

  renderBuiltInItemCard(item, cat, badgeText, isSelected = false) {
    return `
      <div class="palette-item ${isSelected ? 'active-placement' : ''}" 
           draggable="true" 
           data-device-type="${item.type}"
           data-category="${item.category}"
           title="${escapeHtml(item.description || item.name)} — Drag ke peta atau klik lalu klik di peta"
           style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; cursor: grab; transition: all 150ms ease;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.06); border-radius: 4px; flex-shrink: 0;">
              ${getDeviceIconSvg(getDefaultIconForType(item.type), { color: cat.color, size: 16 })}
            </div>
            <span style="font-size: 9px; font-weight: 700; color: ${cat.color}; font-family: var(--font-mono); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(badgeText)}
            </span>
          </div>
          <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${cat.color}; opacity: 0.8; flex-shrink: 0;"></span>
        </div>
        <div class="palette-item-name" title="${escapeHtml(item.name)}">
          ${escapeHtml(item.name)}
        </div>
        <div class="palette-item-sub" title="${escapeHtml(item.defaultBrand)} ${escapeHtml(item.defaultModel)}">
          ${item.brandGroup ? escapeHtml(item.defaultModel) : `${escapeHtml(item.defaultBrand)} ${escapeHtml(item.defaultModel)}`}
        </div>
      </div>
    `;
  }

  renderCatalogLists() {
    const listContainer = this.container.querySelector('#palette-catalog-lists');
    if (!listContainer) return;
    listContainer.innerHTML = this.buildCatalogListsHtml();
    this.bindCatalogItemEvents();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: listContainer });
    }
  }

  bindStaticEvents() {
    // 1. Add Custom Device Button
    this.container.querySelector('#btn-add-custom-device')?.addEventListener('click', () => {
      eventBus.emit('modal:open-custom-device');
    });

    // 2. Vendor Batch Insert Button (MikroTik / Ruijie / TP-Link)
    this.container.querySelector('#btn-open-mikrotik-insert')?.addEventListener('click', () => {
      const targetVendor = (this.activeFilter === 'ruijie' || this.activeFilter === 'tplink')
        ? this.activeFilter
        : 'mikrotik';
      eventBus.emit('modal:open-vendor-insert', { vendor: targetVendor });
    });

    // 3. Search Input
    const searchInput = this.container.querySelector('#palette-search-input');
    const clearBtn = this.container.querySelector('#btn-clear-palette-search');

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value || '';
      if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
      this.renderCatalogLists();
    });

    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      clearBtn.style.display = 'none';
      this.renderCatalogLists();
    });

    // 4. Filter Pills
    const filterButtons = this.container.querySelectorAll('.btn-palette-filter');
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeFilter = btn.getAttribute('data-filter') || 'all';
        filterButtons.forEach((b) => {
          const active = b.getAttribute('data-filter') === this.activeFilter;
          b.style.borderColor = active ? 'var(--accent-blue)' : 'var(--border-color)';
          b.style.background = active ? 'var(--accent-blue)' : 'var(--bg-primary)';
          b.style.color = active ? 'var(--text-inverse)' : 'var(--text-secondary)';
        });
        this.renderCatalogLists();
      });
    });

    // 5. Multi-click placement toggle
    this.container.querySelector('#toggle-multi-place')?.addEventListener('change', (e) => {
      this.multiPlaceMode = Boolean(e.target.checked);
    });

    // 6. Reset active placement styling when mode changes away from add-device
    eventBus.on('mode:changed', ({ mode }) => {
      if (mode !== 'add-device') {
        this.activeTypeToPlace = null;
        this.activeCustomTemplateToPlace = null;
        this.container.querySelectorAll('.palette-item').forEach((el) => el.classList.remove('active-placement'));
      }
    });
  }

  bindCatalogItemEvents() {
    // Delete Custom Template Buttons
    const deleteBtns = this.container.querySelectorAll('.btn-delete-template');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tmplId = btn.getAttribute('data-template-id');
        const tmpl = this.customTemplates.find((t) => t.id === tmplId);
        const name = tmpl?.name || 'ini';
        if (confirm(`Hapus template perangkat kustom "${name}" dari Library?`)) {
          this.removeCustomTemplate(tmplId);
        }
      });
      btn.addEventListener('mouseenter', () => { btn.style.color = '#dc2626'; });
      btn.addEventListener('mouseleave', () => { btn.style.color = 'var(--text-muted)'; });
    });

    // Bind Drag-and-Drop and Click-to-Place for all items
    const items = this.container.querySelectorAll('.palette-item');

    items.forEach((itemEl) => {
      itemEl.addEventListener('dragstart', (e) => {
        itemEl.classList.add('dragging');

        const customTmplId = itemEl.getAttribute('data-custom-template-id');
        let payload;

        if (customTmplId) {
          const tmpl = this.customTemplates.find((t) => t.id === customTmplId);
          payload = JSON.stringify({ isCustom: true, ...tmpl });
        } else {
          const type = itemEl.getAttribute('data-device-type');
          const category = itemEl.getAttribute('data-category');
          payload = JSON.stringify({ type, category });
        }

        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.effectAllowed = 'copy';
      });

      itemEl.addEventListener('dragend', () => {
        itemEl.classList.remove('dragging');
      });

      itemEl.addEventListener('click', () => {
        const customTmplId = itemEl.getAttribute('data-custom-template-id');

        if (customTmplId) {
          const tmpl = this.customTemplates.find((t) => t.id === customTmplId);
          this.activeCustomTemplateToPlace = tmpl;
          this.activeTypeToPlace = tmpl.type || 'custom';
          stateManager.setMode('add-device');

          this.container.querySelectorAll('.palette-item').forEach((el) => el.classList.remove('active-placement'));
          itemEl.classList.add('active-placement');

          eventBus.emit('palette:selected-to-place', {
            type: this.activeTypeToPlace,
            customDeviceData: tmpl
          });
        } else {
          const type = itemEl.getAttribute('data-device-type');
          this.activeCustomTemplateToPlace = null;
          this.activeTypeToPlace = type;
          stateManager.setMode('add-device');

          this.container.querySelectorAll('.palette-item').forEach((el) => el.classList.remove('active-placement'));
          itemEl.classList.add('active-placement');

          eventBus.emit('palette:selected-to-place', { type });
        }
      });
    });
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
