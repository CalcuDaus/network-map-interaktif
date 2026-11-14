/**
 * NetMap — Search UI Component & Autocomplete Dropdown
 * Handles interactive IP / Device / VLAN search, keyboard navigation,
 * 2D/3D focus navigation, and quick Device Detail inspection
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';

const FILTER_OPTIONS = [
  { id: 'all', label: 'Semua' },
  { id: 'ip', label: 'IP Address' },
  { id: 'device', label: 'Perangkat' },
  { id: 'vlan', label: 'VLAN/SSID' }
];

export class SearchUI {
  /**
   * @param {Object} options
   * @param {HTMLInputElement} options.inputElement
   * @param {import('./search-engine.js').SearchEngine} options.searchEngine
   * @param {import('../ui/viewport-navigator.js').ViewportNavigator} options.viewportNavigator
   * @param {import('../devices/device-manager.js').DeviceManager} [options.deviceManager]
   */
  constructor({ inputElement, searchEngine, viewportNavigator, deviceManager }) {
    this.input = inputElement;
    this.searchEngine = searchEngine;
    this.viewportNavigator = viewportNavigator;
    this.deviceManager = deviceManager || searchEngine?.deviceManager || null;

    this.filterMode = 'all';
    this.dropdown = null;
    this.clearBtn = null;
    this.results = [];
    this.selectedIndex = -1;

    this.createDropdown();
    this.bindEvents();
  }

  createDropdown() {
    const searchBox = this.input.closest?.('.search-box') || this.input.parentElement;

    if (searchBox && typeof document.createElement === 'function') {
      if (!searchBox.querySelector?.('.search-input-clear-btn')) {
        this.clearBtn = document.createElement('button');
        this.clearBtn.type = 'button';
        this.clearBtn.className = 'search-input-clear-btn';
        this.clearBtn.title = 'Bersihkan pencarian';
        this.clearBtn.textContent = '×';
        searchBox.appendChild(this.clearBtn);
      } else {
        this.clearBtn = searchBox.querySelector('.search-input-clear-btn');
      }

      if (!searchBox.querySelector?.('.search-shortcut-hint')) {
        const hint = document.createElement('span');
        hint.className = 'search-shortcut-hint';
        hint.title = 'Tekan Ctrl+K atau / untuk membuka pencarian cepat';
        hint.textContent = 'Ctrl+K';
        searchBox.appendChild(hint);
      }
    }

    this.dropdown = document.createElement('div');
    this.dropdown.id = 'search-suggestions-dropdown';

    if (searchBox) {
      searchBox.style.position = 'relative';
      searchBox.appendChild(this.dropdown);
    }
  }

  bindEvents() {
    this.input.addEventListener('input', () => {
      this.selectedIndex = -1;
      this.refreshResults();
    });

    this.input.addEventListener('focus', () => {
      this.refreshResults();
    });

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.input.value = '';
        this.selectedIndex = -1;
        this.input.focus();
        this.refreshResults();
      });
    }

    this.input.addEventListener('keydown', (e) => {
      if (this.dropdown.style.display === 'none') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.refreshResults();
        }
        return;
      }

      const maxVisible = Math.min(this.results.length, 15);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (maxVisible > 0) {
          this.selectedIndex = Math.min(this.selectedIndex + 1, maxVisible - 1);
          this.updateActiveItem();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (maxVisible > 0) {
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
          this.updateActiveItem();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
          this.selectDevice(this.results[this.selectedIndex]);
        } else if (this.results.length > 0) {
          this.selectDevice(this.results[0]);
        }
      } else if (e.key === 'Escape') {
        this.hideDropdown();
        this.closeNavbarSearchWrapper();
      }
    });

    // Open search results immediately when toolbar Search icon or Ctrl+K opens panel
    eventBus.on('search:opened', () => {
      this.refreshResults();
    });

    // Refresh live results if device metadata changes while dropdown is visible
    const refreshIfOpen = () => {
      if (this.dropdown && this.dropdown.style.display === 'flex') {
        this.refreshResults();
      }
    };
    eventBus.on('device:added', refreshIfOpen);
    eventBus.on('device:updated', refreshIfOpen);
    eventBus.on('device:deleted', refreshIfOpen);

    // Close when clicking outside search box & dropdown
    document.addEventListener('click', (e) => {
      const target = e.target;
      const wrapper = this.input.closest?.('#navbar-search-wrapper');
      if (wrapper && wrapper.contains(target)) return;
      if (!this.input.contains(target) && !this.dropdown.contains(target)) {
        this.hideDropdown();
      }
    });
  }

  refreshResults() {
    const query = this.input?.value || '';
    const trimmed = query.trim();

    if (this.clearBtn?.classList) {
      this.clearBtn.classList.toggle('visible', trimmed.length > 0);
    }

    this.results = this.searchEngine.searchDevices(query, {
      filterMode: this.filterMode,
      browseWhenEmpty: true,
      limit: 25
    });

    if (this.selectedIndex >= Math.min(this.results.length, 15)) {
      this.selectedIndex = -1;
    }

    this.renderDropdown(this.results, query);
  }

  renderDropdown(results, query = '') {
    const filterPillsHtml = FILTER_OPTIONS.map((opt) => `
      <button type="button"
        class="search-filter-pill ${this.filterMode === opt.id ? 'active' : ''}"
        data-filter-mode="${opt.id}">
        ${opt.label}
      </button>
    `).join('');

    const trimmed = String(query || '').trim();
    const countText = trimmed
      ? `${results.length} cocok`
      : `${results.length} perangkat${results.length > 15 ? ' (tampil 15 teratas)' : ''}`;

    let bodyHtml = '';
    if (results.length === 0) {
      bodyHtml = `
        <div class="search-empty-state">
          Tidak ada perangkat atau IP yang cocok${trimmed ? ` untuk "<strong>${this.escapeHtml(trimmed)}</strong>"` : ''}.<br>
          Coba ubah kata kunci atau pilih tab filter <strong>Semua</strong>.
        </div>
      `;
    } else {
      bodyHtml = results.slice(0, 15).map((dev, idx) => {
        const cat = DEVICE_CATEGORIES[dev.category] || DEVICE_CATEGORIES.core;
        const statusDef = DEVICE_STATUSES[dev.status] || DEVICE_STATUSES.online;
        const ip = dev.network?.ip || dev.ip || '';
        const vlan = dev.network?.vlan;
        const ssid = dev.network?.ssid || '';
        const subParts = [
          dev.brand && dev.model ? `${dev.brand} ${dev.model}` : (dev.model || dev.brand || ''),
          dev.location || '',
          dev.inventory?.purchaseYear ? `Thn ${dev.inventory.purchaseYear}` : '',
          dev.inventory?.fundingSource || ''
        ].filter(Boolean);

        return `
          <div class="search-item-card ${idx === this.selectedIndex ? 'active' : ''}" data-index="${idx}" title="Klik untuk memilih & mengarahkan kamera ke perangkat ini">
            <div class="search-item-main">
              <span class="search-cat-tag" style="color: ${cat.color};">
                ${this.escapeHtml((dev.type || 'DEV').substring(0, 4))}
              </span>
              <div class="search-item-info">
                <div class="search-item-title-row">
                  <span class="search-item-name">${this.highlightText(dev.name || dev.id, query)}</span>
                </div>
                ${subParts.length > 0 ? `<div class="search-item-sub">${this.highlightText(subParts.join(' • '), query)}</div>` : ''}
                <div class="search-item-badges">
                  <span class="search-ip-pill ${ip ? '' : 'no-ip'}">
                    ${ip ? `IP: ${this.highlightText(ip, query)}` : 'Tanpa IP'}
                  </span>
                  ${vlan ? `<span class="search-vlan-pill">VLAN ${this.escapeHtml(String(vlan))}</span>` : ''}
                  ${ssid ? `<span class="search-ssid-pill">SSID: ${this.highlightText(ssid, query)}</span>` : ''}
                  ${dev.layerVisible === false ? `<span class="search-hidden-pill">Tersembunyi</span>` : ''}
                </div>
              </div>
            </div>

            <div class="search-item-side">
              <span class="search-status-dot" style="color: ${statusDef.color};">● ${statusDef.name}</span>
              <div class="search-item-actions">
                <button type="button" class="search-action-btn" data-detail-index="${idx}" title="Buka Detail & Konfigurasi Perangkat">Detail</button>
                <button type="button" class="search-action-btn" data-focus-index="${idx}" title="Langsung menuju perangkat ini di peta">Fokus</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    this.dropdown.innerHTML = `
      <div class="search-filter-bar">
        <div class="search-filter-pills">${filterPillsHtml}</div>
        <div class="search-meta-hint">
          <span>${countText}</span>
          <span>Klik IP / perangkat → Fokus Peta 2D/3D</span>
        </div>
      </div>
      <div class="search-results-list">
        ${bodyHtml}
      </div>
    `;
    this.dropdown.style.display = 'flex';

    // Filter pill click
    this.dropdown.querySelectorAll('[data-filter-mode]').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.filterMode = pill.getAttribute('data-filter-mode') || 'all';
        this.selectedIndex = -1;
        this.refreshResults();
        this.input?.focus();
      });
    });

    // Item click -> Focus & Select
    this.dropdown.querySelectorAll('.search-item-card').forEach((itemEl) => {
      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target?.closest?.('[data-detail-index]')) return;
        const idx = parseInt(itemEl.getAttribute('data-index'), 10);
        if (results[idx]) {
          this.selectDevice(results[idx]);
        }
      });
    });

    // Detail quick button click -> Select, Focus & Open Detail Modal
    this.dropdown.querySelectorAll('[data-detail-index]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-detail-index'), 10);
        if (results[idx]) {
          this.selectDevice(results[idx], { openDetail: true });
        }
      });
    });
  }

  updateActiveItem() {
    const items = this.dropdown.querySelectorAll('.search-item-card');
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('active');
        item.scrollIntoView?.({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Reveal (if hidden), select, and navigate camera to the chosen device in 2D and 3D.
   * @param {Object} device
   * @param {Object} [options={}]
   * @param {boolean} [options.openDetail=false]
   */
  selectDevice(device, options = {}) {
    if (!device) return;

    this.hideDropdown();
    this.closeNavbarSearchWrapper();

    if (this.input) {
      this.input.value = '';
    }
    if (this.clearBtn?.classList) {
      this.clearBtn.classList.remove('visible');
    }

    if (this.deviceManager) {
      if (device.layerVisible === false && typeof this.deviceManager.updateDevice === 'function') {
        this.deviceManager.updateDevice(device.id, { layerVisible: true });
      }
      if (typeof this.deviceManager.selectDevice === 'function') {
        this.deviceManager.selectDevice(device.id);
      }
    }

    if (this.viewportNavigator && typeof this.viewportNavigator.focusOnDevice === 'function') {
      this.viewportNavigator.focusOnDevice(device, 1.6, 400, { skip3dEmit: true });
    }

    if (stateManager.getViewMode() === '3d') {
      eventBus.emit('map3d:focus-device', { deviceId: device.id });
    }

    if (options.openDetail) {
      eventBus.emit('modal:open-device-detail', { deviceId: device.id });
    }
  }

  closeNavbarSearchWrapper() {
    const wrapper = this.input?.closest?.('#navbar-search-wrapper')
      || (typeof document !== 'undefined' ? document.getElementById('navbar-search-wrapper') : null);
    wrapper?.classList?.remove('open');
    const toggleBtn = typeof document !== 'undefined' ? document.getElementById('btn-toggle-search') : null;
    toggleBtn?.setAttribute?.('aria-expanded', 'false');
  }

  hideDropdown() {
    if (this.dropdown) {
      this.dropdown.style.display = 'none';
    }
    this.selectedIndex = -1;
  }

  highlightText(text, query) {
    const str = String(text ?? '');
    const tokens = String(query || '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || str === '') {
      return this.escapeHtml(str);
    }

    const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');

    let out = '';
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIdx) {
        out += this.escapeHtml(str.slice(lastIdx, match.index));
      }
      out += `<mark class="search-highlight">${this.escapeHtml(match[0])}</mark>`;
      lastIdx = regex.lastIndex;
      if (match[0].length === 0) break;
    }
    if (lastIdx < str.length) {
      out += this.escapeHtml(str.slice(lastIdx));
    }
    return out;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
