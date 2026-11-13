/**
 * NetMap — Top Toolbar & Map HUD Controls
 * Manages buttons, mode selectors, zoom actions, and panel toggles
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { formatZoomPercentage } from '../utils/helpers.js';

export class Toolbar {
  /**
   * @param {import('../map/map-engine.js').MapEngine} mapEngine 
   */
  constructor(mapEngine) {
    this.mapEngine = mapEngine;
    this.initElements();
    this.bindEvents();
    this.bindStateListeners();
  }

  initElements() {
    // Toolbar Zoom Buttons
    this.btnZoomIn = document.getElementById('btn-zoom-in');
    this.btnZoomOut = document.getElementById('btn-zoom-out');
    this.btnFitScreen = document.getElementById('btn-fit-screen');
    this.btnResetView = document.getElementById('btn-reset-view');
    this.zoomPercentageDisplay = document.getElementById('zoom-percentage');

    // Sidebar Toggles
    this.btnToggleLeft = document.getElementById('btn-toggle-left-sidebar');
    this.btnToggleRight = document.getElementById('btn-toggle-right-sidebar');

    // Theme Toggle
    this.btnToggleTheme = document.getElementById('btn-toggle-theme');
    this.initTheme();

    // Mode Selector Items
    this.modeButtons = document.querySelectorAll('[data-mode]');

    // Floating Map HUD Controls
    this.hudZoomIn = document.getElementById('hud-zoom-in');
    this.hudZoomOut = document.getElementById('hud-zoom-out');
    this.hudFitScreen = document.getElementById('hud-fit-screen');
    this.hudResetView = document.getElementById('hud-reset-view');
    this.hudCompass = document.getElementById('hud-compass');
    this.hudZoomBadge = document.getElementById('hud-zoom-badge');
  }

  bindEvents() {
    const interactions = this.mapEngine.interactions;

    // Zoom In
    const handleZoomIn = () => interactions.zoomIn();
    this.btnZoomIn?.addEventListener('click', handleZoomIn);
    this.hudZoomIn?.addEventListener('click', handleZoomIn);

    // Zoom Out
    const handleZoomOut = () => interactions.zoomOut();
    this.btnZoomOut?.addEventListener('click', handleZoomOut);
    this.hudZoomOut?.addEventListener('click', handleZoomOut);

    // Fit to Screen
    const handleFit = () => interactions.fitToScreen(30);
    this.btnFitScreen?.addEventListener('click', handleFit);
    this.hudFitScreen?.addEventListener('click', handleFit);

    // Reset 100%
    const handleReset = () => interactions.resetView();
    this.btnResetView?.addEventListener('click', handleReset);
    this.hudResetView?.addEventListener('click', handleReset);
    this.hudCompass?.addEventListener('click', handleReset);

    // Mode Selector Buttons
    this.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetMode = btn.getAttribute('data-mode');
        stateManager.setMode(targetMode);
      });
    });

    // Sidebar Toggles
    this.btnToggleLeft?.addEventListener('click', () => {
      stateManager.toggleSidebar('left');
    });

    this.btnToggleRight?.addEventListener('click', () => {
      stateManager.toggleSidebar('right');
    });

    // Theme Toggle
    this.btnToggleTheme?.addEventListener('click', () => {
      this.toggleTheme();
    });
  }

  initTheme() {
    const savedTheme = localStorage.getItem('netmap-theme') || 'light';
    this.applyTheme(savedTheme);
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('netmap-theme', theme);

    if (this.btnToggleTheme) {
      const isDark = theme === 'dark';
      this.btnToggleTheme.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}" id="theme-toggle-icon" style="width: 15px; height: 15px;"></i>`;
      this.btnToggleTheme.title = isDark ? 'Beralih ke Tema Botanical Cream (Terang)' : 'Beralih ke Tema Forest Pine (Gelap)';
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    }
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
  }

  bindStateListeners() {
    // Listen to Viewport changes to update zoom percentage readouts
    eventBus.on('viewport:changed', ({ scale }) => {
      const formatted = formatZoomPercentage(scale);
      if (this.zoomPercentageDisplay && this.zoomPercentageDisplay.textContent !== formatted) {
        this.zoomPercentageDisplay.textContent = formatted;
      }
      if (this.hudZoomBadge && this.hudZoomBadge.textContent !== formatted) {
        this.hudZoomBadge.textContent = formatted;
      }
    });

    // Listen to Mode changes to highlight active button
    eventBus.on('mode:changed', ({ mode }) => {
      this.modeButtons.forEach((btn) => {
        if (btn.getAttribute('data-mode') === mode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });

    // Listen to Sidebar collapse events
    eventBus.on('ui:sidebar-toggled', ({ side, open }) => {
      const sidebarEl = document.querySelector(`.sidebar-${side}`);
      if (sidebarEl) {
        if (open) {
          sidebarEl.classList.remove('collapsed');
        } else {
          sidebarEl.classList.add('collapsed');
        }
      }
    });
  }
}
