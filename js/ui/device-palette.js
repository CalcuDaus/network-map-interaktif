/**
 * NetMap — Device Library Palette (Left Sidebar Component)
 * Renders ONLY 3D .GLB hardware device models (built-in & user-uploaded),
 * with real-time search, brand filters, delete/restore management, and multi-click placement mode.
 */

import { DEVICE_CATEGORIES } from '../devices/device-library.js';
import { getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { getBuiltinGlbCustomTemplates } from '../devices/device-schema.js';
import { getEndDeviceSlots } from '../devices/end-device-slots.js';
import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { isMobileTouchDevice } from '../utils/helpers.js';

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
    this.activeFilter = 'all'; // 'all' | 'mikrotik' | 'ruijie' | 'tplink' | 'other'
    this.customTemplates = this.loadCustomTemplates();

    this.render();
    this.bindStaticEvents();
    this.bindCatalogItemEvents();
  }

  _hasGlbModel(item) {
    return Boolean(item?.spatial3d?.customModelUrl && String(item.spatial3d.customModelUrl).trim());
  }

  /**
   * Load saved .GLB custom device templates from localStorage and ensure built-in .GLB models
   * are registered in the Library Perangkat (excluding any non-.GLB procedural devices).
   * @returns {Object[]}
   */
  loadCustomTemplates() {
    let saved = [];
    let dismissed = [];
    try {
      const raw = localStorage.getItem('netmap_custom_templates');
      saved = raw ? JSON.parse(raw) : [];
      const rawDismissed = localStorage.getItem('netmap_dismissed_builtin_glbs');
      dismissed = rawDismissed ? JSON.parse(rawDismissed) : [];
    } catch (err) {
      console.warn('[DevicePalette] Failed to load custom templates from localStorage:', err);
    }

    const dismissedSet = new Set(Array.isArray(dismissed) ? dismissed : []);
    const builtinGlbs = getBuiltinGlbCustomTemplates();
    const builtinMap = new Map(builtinGlbs.map((b) => [b.builtinGlbId, b]));

    // Keep only .GLB models; drop legacy non-.GLB custom templates from palette UI
    const merged = (Array.isArray(saved) ? saved : [])
      .filter((item) => this._hasGlbModel(item) || (item?.builtinGlbId && builtinMap.has(item.builtinGlbId)))
      .map((item) => {
        if (item.builtinGlbId && builtinMap.has(item.builtinGlbId)) {
          return { ...builtinMap.get(item.builtinGlbId) };
        }
        return item;
      });

    const existingIds = new Set(merged.map((t) => t.builtinGlbId || t.id));
    builtinGlbs.forEach((entry) => {
      if (!existingIds.has(entry.builtinGlbId) && !dismissedSet.has(entry.builtinGlbId)) {
        merged.push(entry);
      }
    });

    return merged;
  }

  /**
   * Restore any previously removed built-in .GLB templates back into the library.
   */
  restoreBuiltinGlbTemplates() {
    try {
      localStorage.removeItem('netmap_dismissed_builtin_glbs');
    } catch { /* ignore */ }
    const builtinGlbs = getBuiltinGlbCustomTemplates();
    const existingIds = new Set(this.customTemplates.map((t) => t.builtinGlbId || t.id));
    builtinGlbs.forEach((entry) => {
      if (!existingIds.has(entry.builtinGlbId)) {
        this.customTemplates.push(entry);
      }
    });
    this.saveCustomTemplates();
    this.renderCatalogLists();
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
      spatial3d: data.spatial3d ? { ...data.spatial3d } : null,
      ports: Array.isArray(data.ports) ? data.ports.map((p) => ({ ...p, local3d: p.local3d ? { ...p.local3d } : undefined })) : null,
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
    const target = this.customTemplates.find((t) => t.id === templateId);
    if (target?.builtinGlbId) {
      try {
        const raw = localStorage.getItem('netmap_dismissed_builtin_glbs');
        const arr = raw ? JSON.parse(raw) : [];
        if (!arr.includes(target.builtinGlbId)) {
          arr.push(target.builtinGlbId);
          localStorage.setItem('netmap_dismissed_builtin_glbs', JSON.stringify(arr));
        }
      } catch (e) { /* ignore */ }
    }
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
        <!-- Quick Action: Add Custom .GLB 3D Device -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-add-custom-device" class="btn btn-secondary btn-sm" 
                  title="Tambahkan perangkat jaringan 3D (.GLB) kustom Anda sendiri ke library"
                  style="width: 100%; justify-content: center; gap: 6px; font-weight: 700; padding: 8px 10px; height: auto; border: 1.5px dashed var(--accent-blue, #2a5367); background: var(--bg-tertiary, #c4d7df); color: var(--accent-blue, #2a5367); cursor: pointer; border-radius: 8px; box-shadow: var(--shadow-sm);">
            <i data-lucide="plus-circle" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
            <span>Tambah Perangkat 3D (.GLB)</span>
          </button>
        </div>

        <!-- Search & Brand Filter Bar -->
        <div style="display: flex; flex-direction: column; gap: 6px; padding-bottom: 2px;">
          <div style="position: relative; display: flex; align-items: center;">
            <i data-lucide="search" style="width: 13px; height: 13px; color: var(--text-muted); position: absolute; left: 8px; pointer-events: none;"></i>
            <input type="text" id="palette-search-input" placeholder="Cari perangkat 3D .GLB (MikroTik, Ruijie, TP-Link, Dahua...)"
                   value="${escapeHtml(this.searchQuery)}"
                   style="width: 100%; padding: 5px 26px 5px 26px; font-size: 11.5px; border-radius: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
            <button type="button" id="btn-clear-palette-search" title="Hapus pencarian"
                    style="position: absolute; right: 6px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px; line-height: 1; display: ${this.searchQuery ? 'block' : 'none'};">
              &times;
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; flex-wrap: wrap;">
            <div style="display: flex; gap: 3px; flex: 1; flex-wrap: wrap; min-width: 0;">
              ${this.renderFilterPill('all', 'Semua .GLB')}
              ${this.renderFilterPill('mikrotik', 'MikroTik')}
              ${this.renderFilterPill('ruijie', 'Ruijie')}
              ${this.renderFilterPill('tplink', 'TP-Link')}
              ${this.renderFilterPill('other', 'Server / CCTV')}
            </div>
            <label title="Tetap aktif di mode tambah perangkat setelah klik di peta agar bisa insert banyak unit berturut-turut"
                   style="display: flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; flex-shrink: 0;">
              <input type="checkbox" id="toggle-multi-place" ${this.multiPlaceMode ? 'checked' : ''} style="accent-color: var(--accent-blue); margin: 0;">
              <span>Multi</span>
            </label>
          </div>
        </div>

        <!-- Dynamic Catalog Lists (.GLB 3D Hardware Only) -->
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

  matchesBrandFilter(item) {
    if (this.activeFilter === 'all') return true;
    const probe = `${item?.brand || ''} ${item?.name || ''} ${item?.model || ''} ${item?.type || ''}`;
    if (this.activeFilter === 'mikrotik') return /mikrotik/i.test(probe);
    if (this.activeFilter === 'ruijie') return /ruijie|reyee/i.test(probe);
    if (this.activeFilter === 'tplink') return /tp-?link/i.test(probe);
    if (this.activeFilter === 'other') return !/mikrotik|ruijie|reyee|tp-?link/i.test(probe);
    return true;
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
    const allGlbItems = this.customTemplates.filter((t) => this._hasGlbModel(t));
    const matchedCustom = allGlbItems.filter((t) => this.matchesBrandFilter(t) && this.matchesSearch(t));

    const endDeviceSlots = getEndDeviceSlots().filter((slot) => {
      if (this.activeFilter === 'mikrotik' || this.activeFilter === 'ruijie' || this.activeFilter === 'tplink') {
        return false;
      }
      return this.matchesSearch(slot);
    });

    if (matchedCustom.length === 0 && endDeviceSlots.length === 0) {
      return `
        <div style="padding: 18px 12px; text-align: center; color: var(--text-muted); font-size: 11.5px; background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color); display: flex; flex-direction: column; gap: 8px; align-items: center;">
          <span>${this.searchQuery
            ? `Tidak ada model perangkat .GLB yang cocok dengan "${escapeHtml(this.searchQuery)}".`
            : 'Belum ada perangkat 3D (.GLB) di kategori ini.'}</span>
          ${allGlbItems.length < getBuiltinGlbCustomTemplates().length ? `
            <button type="button" class="btn-restore-builtin-glbs"
                    style="font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--accent-blue, #2a5367); background: rgba(42, 83, 103,0.08); color: var(--accent-blue, #2a5367); font-weight: 600; cursor: pointer;">
              Pulihkan Model .GLB Bawaan
            </button>
          ` : ''}
        </div>
      `;
    }

    let html = '';
    if (matchedCustom.length > 0) {
      html += `
        <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
          <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent-blue, #2a5367); display: flex; align-items: center; gap: 5px;">
              <i data-lucide="box" style="width: 13px; height: 13px; color: var(--accent-blue, #2a5367);"></i>
              <span>Perangkat 3D (.GLB)</span>
            </span>
            <span style="font-size: 10px; color: var(--accent-blue, #2a5367); background: rgba(42, 83, 103, 0.12); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
              ${matchedCustom.length}
            </span>
          </div>
          <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      `;

      matchedCustom.forEach((tmpl) => {
        const catKey = tmpl.category === 'end-device' ? 'endDevice' : tmpl.category;
        const cat = DEVICE_CATEGORIES[catKey] || DEVICE_CATEGORIES.core;
        const catColor = cat.color || '#2a5367';
        const isSelected = this.activeCustomTemplateToPlace?.id === tmpl.id;
        let thumbHtml = '';
        if (tmpl.customImage) {
          thumbHtml = `<img src="${tmpl.customImage}" style="width: 24px; height: 24px; object-fit: contain; border-radius: 3px;" alt="${escapeHtml(tmpl.name)}" />`;
        } else {
          const iconKey = tmpl.customIcon || getDefaultIconForType(tmpl.type || 'router');
          thumbHtml = getDeviceIconSvg(iconKey, { color: catColor, size: 24 });
        }

        html += `
          <div class="palette-item palette-item-custom ${isSelected ? 'active-placement' : ''}" 
               draggable="true" 
               data-custom-template-id="${tmpl.id}"
               data-device-type="${tmpl.type || 'custom'}"
               data-category="${catKey || 'core'}"
               style="background-color: var(--bg-primary); border: 1.5px solid var(--accent-cyan, #537b8e); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; cursor: grab; transition: all 150ms ease; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.75); border-radius: 5px; flex-shrink: 0; overflow: hidden;">
                  ${thumbHtml}
                </div>
                <span style="font-size: 9px; font-weight: 700; color: ${catColor}; font-family: var(--font-mono); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${(tmpl.brand || tmpl.type || 'GLB').substring(0, 4)}
                </span>
              </div>
              <button class="btn-delete-template" data-template-id="${tmpl.id}" title="Hapus model .GLB ini dari Library" 
                      style="background: transparent; border: none; padding: 0 2px; cursor: pointer; color: var(--text-muted); font-size: 15px; line-height: 1; border-radius: 3px; transition: color 0.1s ease;">
                &times;
              </button>
            </div>
            <div class="palette-item-name" title="${escapeHtml(tmpl.name)}">
              ${escapeHtml(tmpl.name)}
            </div>
            <div class="palette-item-sub" style="display: flex; align-items: center; justify-content: space-between; gap: 4px;" title="${escapeHtml(tmpl.brand || '')} ${escapeHtml(tmpl.model || '')}">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tmpl.brand ? `${escapeHtml(tmpl.brand)} ${escapeHtml(tmpl.model || '')}` : (escapeHtml(tmpl.model) || '3D Model')}</span>
              <span style="font-size: 8.5px; font-weight: 700; color: var(--accent-blue, #2a5367); background: rgba(42, 83, 103,0.12); padding: 0 4px; border-radius: 3px; flex-shrink: 0;">3D .GLB</span>
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
    }

    if (endDeviceSlots.length > 0) {
      html += `
        <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
          <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-secondary); display: flex; align-items: center; gap: 5px;">
              <i data-lucide="monitor-smartphone" style="width: 13px; height: 13px; color: var(--accent-blue, #2a5367);"></i>
              <span>End-Device &amp; WAN (Slot Siap 3D)</span>
            </span>
            <span style="font-size: 10px; color: var(--text-secondary); background: var(--bg-primary); border: 1px solid var(--border-color); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
              ${endDeviceSlots.length}
            </span>
          </div>
          <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      `;

      endDeviceSlots.forEach((slot) => {
        const catKey = slot.category === 'end-device' ? 'endDevice' : slot.category;
        const cat = DEVICE_CATEGORIES[catKey] || DEVICE_CATEGORIES.endDevice || DEVICE_CATEGORIES.core;
        const catColor = cat?.color || '#059669';
        const hasLinkedGlb = Boolean(slot.spatial3d?.customModelUrl);
        const isSelected = this.activeCustomTemplateToPlace?.slotId === slot.slotId;
        const iconKey = slot.customIcon || getDefaultIconForType(slot.type);
        const thumbHtml = getDeviceIconSvg(iconKey, { color: catColor, size: 24 });

        html += `
          <div class="palette-item palette-item-slot ${isSelected ? 'active-placement' : ''}"
               draggable="true"
               data-end-device-slot-id="${slot.slotId}"
               data-device-type="${slot.type}"
               data-category="${catKey || 'endDevice'}"
               title="${escapeHtml(slot.description || slot.name)}"
               style="background-color: var(--bg-primary); border: 1.5px ${hasLinkedGlb ? 'solid' : 'dashed'} ${hasLinkedGlb ? 'var(--accent-cyan, #537b8e)' : 'var(--border-color)'}; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; cursor: grab; transition: all 150ms ease; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.75); border-radius: 5px; flex-shrink: 0; overflow: hidden;">
                  ${thumbHtml}
                </div>
                <span style="font-size: 9px; font-weight: 700; color: ${catColor}; font-family: var(--font-mono); text-transform: uppercase;">
                  ${escapeHtml(slot.badgeCode || 'END')}
                </span>
              </div>
            </div>
            <div class="palette-item-name" title="${escapeHtml(slot.name)}">
              ${escapeHtml(slot.name)}
            </div>
            <div class="palette-item-sub" style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(slot.model || 'End-Device')}</span>
              <span style="font-size: 8px; font-weight: 700; color: ${hasLinkedGlb ? 'var(--accent-blue, #2a5367)' : 'var(--text-muted)'}; background: ${hasLinkedGlb ? 'rgba(42, 83, 103,0.12)' : 'rgba(100,116,139,0.14)'}; padding: 0 4px; border-radius: 3px; flex-shrink: 0;">
                ${hasLinkedGlb ? '3D .GLB' : 'Slot 3D'}
              </span>
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
    }

    return html;
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
    // 1. Add Custom .GLB Device Button
    this.container.querySelector('#btn-add-custom-device')?.addEventListener('click', () => {
      eventBus.emit('modal:open-custom-device');
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
    // Restore built-in GLBs button (shown if user deleted all built-in items)
    this.container.querySelector('.btn-restore-builtin-glbs')?.addEventListener('click', () => {
      this.restoreBuiltinGlbTemplates();
    });

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
        const slotId = itemEl.getAttribute('data-end-device-slot-id');
        let payload;

        if (customTmplId) {
          const tmpl = this.customTemplates.find((t) => t.id === customTmplId);
          payload = JSON.stringify({ isCustom: true, ...tmpl });
        } else if (slotId) {
          const slotTmpl = getEndDeviceSlots().find((s) => s.slotId === slotId);
          payload = JSON.stringify(slotTmpl || { type: itemEl.getAttribute('data-device-type') });
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
        const slotId = itemEl.getAttribute('data-end-device-slot-id');

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
        } else if (slotId) {
          const slotTmpl = getEndDeviceSlots().find((s) => s.slotId === slotId);
          this.activeCustomTemplateToPlace = slotTmpl;
          this.activeTypeToPlace = slotTmpl?.type || itemEl.getAttribute('data-device-type') || 'pc';
          stateManager.setMode('add-device');

          this.container.querySelectorAll('.palette-item').forEach((el) => el.classList.remove('active-placement'));
          itemEl.classList.add('active-placement');

          eventBus.emit('palette:selected-to-place', {
            type: this.activeTypeToPlace,
            customDeviceData: slotTmpl
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

        // On mobile drawer mode, collapse sidebar automatically so user can tap the map right away
        if ((typeof document !== 'undefined' && document.body?.classList?.contains('is-mobile-touch')) || isMobileTouchDevice()) {
          stateManager.toggleSidebar('left', false);
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
