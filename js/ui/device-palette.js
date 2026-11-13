/**
 * NetMap — Device Library Palette (Left Sidebar Component)
 * Renders draggable device components categorized into Core, Distribution, Infra, End Devices,
 * and User-Defined Custom Devices with instant creation & persistent template library.
 */

import { DEVICE_CATEGORIES, DEVICE_CATALOG } from '../devices/device-library.js';
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
    this.customTemplates = this.loadCustomTemplates();

    this.render();
    this.bindEvents();
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
    this.render();
    this.bindEvents();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.container });
    }

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
    this.render();
    this.bindEvents();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.container });
    }
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

    let html = `<div class="device-palette-wrapper" style="display: flex; flex-direction: column; gap: 14px;">`;

    // 1. Prominent "+ Tambah Perangkat Kustom" Button at Top
    html += `
      <div style="padding-bottom: 2px;">
        <button id="btn-add-custom-device" class="btn btn-secondary btn-sm" 
                title="Buka dialog untuk membuat perangkat jaringan kustom dengan ikon atau gambar sendiri"
                style="width: 100%; justify-content: center; gap: 8px; font-weight: 700; padding: 9px 12px; border: 1.5px dashed var(--accent-blue, #2a7c13); background: var(--bg-tertiary, #f2dac8); color: var(--accent-blue, #2a7c13); cursor: pointer; border-radius: 8px; box-shadow: var(--shadow-sm); transition: all 0.15s ease;">
          <i data-lucide="plus-circle" style="width: 16px; height: 16px; color: var(--accent-blue, #2a7c13);"></i>
          <span>+ Tambah Perangkat Kustom</span>
        </button>
      </div>
    `;

    // 2. Custom Device Category Group (if user has custom templates)
    if (this.customTemplates.length > 0) {
      html += `
        <div class="palette-category-group" style="display: flex; flex-direction: column; gap: 6px;">
          <div class="category-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent-blue, #2a7c13); display: flex; align-items: center; gap: 5px;">
              <i data-lucide="sparkles" style="width: 13px; height: 13px; color: var(--status-warning, #d97706);"></i>
              <span>Perangkat Kustom</span>
            </span>
            <span style="font-size: 10px; color: var(--accent-blue, #2a7c13); background: rgba(42, 124, 19, 0.12); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
              ${this.customTemplates.length}
            </span>
          </div>
          <div class="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      `;

      this.customTemplates.forEach((tmpl) => {
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
            <div class="palette-item-sub" title="${tmpl.brand || ''} ${tmpl.model || ''}">
              ${tmpl.brand ? `${escapeHtml(tmpl.brand)} ${escapeHtml(tmpl.model || '')}` : (escapeHtml(tmpl.model) || 'Custom')}
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // 3. Built-in Catalog Groups
    const grouped = {
      core: [],
      distribution: [],
      infrastructure: [],
      endDevice: []
    };

    DEVICE_CATALOG.forEach((item) => {
      if (grouped[item.category]) {
        grouped[item.category].push(item);
      }
    });

    Object.keys(DEVICE_CATEGORIES).forEach((catKey) => {
      const cat = DEVICE_CATEGORIES[catKey];
      const items = grouped[catKey] || [];

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
        html += `
          <div class="palette-item" 
               draggable="true" 
               data-device-type="${item.type}"
               data-category="${item.category}"
               style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; cursor: grab; transition: all 150ms ease;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.06); border-radius: 4px; flex-shrink: 0;">
                  ${getDeviceIconSvg(getDefaultIconForType(item.type), { color: cat.color, size: 16 })}
                </div>
                <span style="font-size: 9px; font-weight: 700; color: ${cat.color}; font-family: var(--font-mono); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${item.type.substring(0, 4)}
                </span>
              </div>
              <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${cat.color}; opacity: 0.8; flex-shrink: 0;"></span>
            </div>
            <div class="palette-item-name" title="${item.name}">
              ${item.name}
            </div>
            <div class="palette-item-sub" title="${item.defaultBrand} ${item.defaultModel}">
              ${item.defaultBrand} ${item.defaultModel}
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.container.innerHTML = html;

    // Refresh Lucide icons inside palette
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: this.container });
    }
  }

  bindEvents() {
    // 1. Add Custom Device Button
    const btnAddCustom = this.container.querySelector('#btn-add-custom-device');
    btnAddCustom?.addEventListener('click', () => {
      eventBus.emit('modal:open-custom-device');
    });

    // 2. Delete Custom Template Buttons
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
      btn.addEventListener('mouseenter', () => {
        btn.style.color = '#dc2626';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.color = 'var(--text-muted)';
      });
    });

    // 3. Bind Drag-and-Drop and Click-to-Place for all items (built-in and custom)
    const items = this.container.querySelectorAll('.palette-item');

    items.forEach((itemEl) => {
      // HTML5 Drag and Drop Start
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

      // Click to place mode
      itemEl.addEventListener('click', () => {
        const customTmplId = itemEl.getAttribute('data-custom-template-id');

        if (customTmplId) {
          const tmpl = this.customTemplates.find((t) => t.id === customTmplId);
          this.activeCustomTemplateToPlace = tmpl;
          this.activeTypeToPlace = tmpl.type || 'custom';
          stateManager.setMode('add-device');

          items.forEach((el) => el.classList.remove('active-placement'));
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

          items.forEach((el) => el.classList.remove('active-placement'));
          itemEl.classList.add('active-placement');

          eventBus.emit('palette:selected-to-place', { type });
        }
      });
    });

    // Reset active placement styling when mode changes away from add-device
    eventBus.on('mode:changed', ({ mode }) => {
      if (mode !== 'add-device') {
        this.activeTypeToPlace = null;
        this.activeCustomTemplateToPlace = null;
        items.forEach((el) => el.classList.remove('active-placement'));
      }
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
