/**
 * NetMap — Search UI Component & Autocomplete Dropdown
 * Handles keyboard navigation, suggestion popups, and auto-focusing on canvas
 */

import { SearchEngine } from './search-engine.js';
import { DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';

export class SearchUI {
  /**
   * @param {Object} options
   * @param {HTMLInputElement} options.inputElement
   * @param {SearchEngine} options.searchEngine
   * @param {import('../ui/viewport-navigator.js').ViewportNavigator} options.viewportNavigator
   */
  constructor({ inputElement, searchEngine, viewportNavigator }) {
    this.input = inputElement;
    this.searchEngine = searchEngine;
    this.viewportNavigator = viewportNavigator;

    this.dropdown = null;
    this.results = [];
    this.selectedIndex = -1;

    this.createDropdown();
    this.bindEvents();
  }

  createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.id = 'search-suggestions-dropdown';
    this.dropdown.style.cssText = `
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      width: 320px;
      max-height: 380px;
      overflow-y: auto;
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      z-index: 100;
      display: none;
      flex-direction: column;
      gap: 2px;
      padding: 6px;
    `;

    // Append to search-box container
    const searchBox = this.input.closest('.search-box') || this.input.parentElement;
    searchBox.style.position = 'relative';
    searchBox.appendChild(this.dropdown);
  }

  bindEvents() {
    this.input.addEventListener('input', () => {
      const query = this.input.value;
      if (!query || query.trim().length === 0) {
        this.hideDropdown();
        return;
      }

      this.results = this.searchEngine.searchDevices(query);
      this.selectedIndex = -1;
      this.renderDropdown(this.results);
    });

    this.input.addEventListener('keydown', (e) => {
      if (this.dropdown.style.display === 'none') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
        this.updateActiveItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateActiveItem();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
          this.selectDevice(this.results[this.selectedIndex]);
        } else if (this.results.length > 0) {
          this.selectDevice(this.results[0]);
        }
      } else if (e.key === 'Escape') {
        this.hideDropdown();
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.hideDropdown();
      }
    });
  }

  renderDropdown(results) {
    if (results.length === 0) {
      this.dropdown.innerHTML = `
        <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px;">
          Tidak ada perangkat yang cocok dengan pencarian
        </div>
      `;
      this.dropdown.style.display = 'flex';
      return;
    }

    let html = '';
    results.slice(0, 10).forEach((dev, idx) => {
      const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
      const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.unknown;

      html += `
        <div class="search-item" data-index="${idx}" style="padding: 8px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: background 120ms ease;">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
            <span style="font-size: 9px; font-weight: 700; color: ${cat.color}; background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); text-transform: uppercase;">
              ${dev.type.substring(0, 3)}
            </span>
            <div style="display: flex; flex-direction: column; min-width: 0;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${this.escapeHtml(dev.name)}
              </span>
              <span style="font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${dev.location || dev.brand || ''}
              </span>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0;">
            <span style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-sky);">
              ${dev.network?.ip || 'No IP'}
            </span>
            <span style="font-size: 9px; color: ${statusDef.color}; font-weight: 600; text-transform: uppercase;">
              ● ${statusDef.name}
            </span>
          </div>
        </div>
      `;
    });

    this.dropdown.innerHTML = html;
    this.dropdown.style.display = 'flex';

    // Click handler for items
    this.dropdown.querySelectorAll('.search-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const idx = parseInt(itemEl.getAttribute('data-index'), 10);
        if (results[idx]) {
          this.selectDevice(results[idx]);
        }
      });

      itemEl.addEventListener('mouseenter', () => {
        itemEl.style.backgroundColor = 'var(--bg-tertiary)';
      });

      itemEl.addEventListener('mouseleave', () => {
        if (parseInt(itemEl.getAttribute('data-index'), 10) !== this.selectedIndex) {
          itemEl.style.backgroundColor = 'transparent';
        }
      });
    });
  }

  updateActiveItem() {
    const items = this.dropdown.querySelectorAll('.search-item');
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.style.backgroundColor = 'var(--bg-tertiary)';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.backgroundColor = 'transparent';
      }
    });
  }

  selectDevice(device) {
    this.hideDropdown();
    this.input.value = '';
    this.viewportNavigator.focusOnDevice(device, 1.4);
  }

  hideDropdown() {
    this.dropdown.style.display = 'none';
    this.selectedIndex = -1;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

