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

    // Workspace Fullscreen Toggles
    this.btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
    this.btnExitWorkspaceFullscreen = document.getElementById('btn-exit-workspace-fullscreen');

    // Navbar Dropdowns (Feature Menu, View Filter, Compact Search & General Settings)
    this.navbarMenuWrapper = document.getElementById('navbar-menu-wrapper');
    this.btnNavbarMenu = document.getElementById('btn-navbar-menu');
    this.navbarViewFilterWrapper = document.getElementById('navbar-view-filter-wrapper');
    this.btnNavbarViewFilter = document.getElementById('btn-navbar-view-filter');
    this.navbarSearchWrapper = document.getElementById('navbar-search-wrapper');
    this.btnToggleSearch = document.getElementById('btn-toggle-search');
    this.globalSearchInput = document.getElementById('global-search-input');
    this.navbarSettingsWrapper = document.getElementById('navbar-settings-wrapper');
    this.btnNavbarSettings = document.getElementById('btn-navbar-settings');
    this.toggleSettingFooter = document.getElementById('toggle-setting-footer');
    this.toggleSettingMapHud = document.getElementById('toggle-setting-map-hud');
    this.btnSettingsMapScale = document.getElementById('btn-settings-map-scale');

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

    // Workspace Fullscreen Toggles
    this.btnToggleFullscreen?.addEventListener('click', () => {
      this.toggleWorkspaceFullscreen();
    });
    this.btnExitWorkspaceFullscreen?.addEventListener('click', () => {
      this.setWorkspaceFullscreen(false);
    });
    document.getElementById('btn-3d-exit-fullscreen')?.addEventListener('click', () => {
      this.setWorkspaceFullscreen(false);
    });

    document.addEventListener('fullscreenchange', () => {
      const isNativeFs = Boolean(document.fullscreenElement);
      if (!isNativeFs && document.body.classList.contains('workspace-fullscreen')) {
        this.syncWorkspaceFullscreenUI(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeNavbarDropdowns();
        if (document.body.classList.contains('workspace-fullscreen') && !document.fullscreenElement) {
          this.setWorkspaceFullscreen(false);
        }
      }
    });

    // Navbar Feature Menu Dropdown
    this.btnNavbarMenu?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !this.navbarMenuWrapper?.classList.contains('open');
      this.closeNavbarDropdowns();
      if (willOpen && this.navbarMenuWrapper) {
        this.navbarMenuWrapper.classList.add('open');
        this.btnNavbarMenu?.setAttribute('aria-expanded', 'true');
      }
    });

    this.navbarMenuWrapper?.querySelectorAll('.navbar-dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.closeNavbarDropdowns();
      });
    });

    // Navbar View & Layer Filter Dropdown (stays open while toggling multiple checkboxes)
    this.btnNavbarViewFilter?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !this.navbarViewFilterWrapper?.classList.contains('open');
      this.closeNavbarDropdowns();
      if (willOpen && this.navbarViewFilterWrapper) {
        this.navbarViewFilterWrapper.classList.add('open');
        this.btnNavbarViewFilter?.setAttribute('aria-expanded', 'true');
      }
    });

    this.navbarViewFilterWrapper?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Navbar Compact Search Dropdown
    this.btnToggleSearch?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !this.navbarSearchWrapper?.classList.contains('open');
      this.closeNavbarDropdowns();
      if (willOpen) {
        this.openSearchDropdown();
      }
    });

    this.navbarSearchWrapper?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Modular General Settings Dropdown (stays open while adjusting multiple toggles)
    this.btnNavbarSettings?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !this.navbarSettingsWrapper?.classList.contains('open');
      this.closeNavbarDropdowns();
      if (willOpen && this.navbarSettingsWrapper) {
        this.navbarSettingsWrapper.classList.add('open');
        this.btnNavbarSettings?.setAttribute('aria-expanded', 'true');
      }
    });

    this.navbarSettingsWrapper?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    this.setupGeneralSettings();

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (
        !this.navbarMenuWrapper?.contains(target) &&
        !this.navbarViewFilterWrapper?.contains(target) &&
        !this.navbarSearchWrapper?.contains(target) &&
        !this.navbarSettingsWrapper?.contains(target)
      ) {
        this.closeNavbarDropdowns();
      }
    });

    // Global Search Shortcut: Ctrl+K or '/' (outside form inputs)
    window.addEventListener('keydown', (e) => {
      const isCtrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      const isSlash = !inInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/';

      if (isCtrlK || isSlash) {
        e.preventDefault();
        this.closeNavbarDropdowns();
        this.openSearchDropdown();
      }
    });
  }

  /** Initializes General Settings UI preferences (hidden footer by default, map HUD, scale button). */
  setupGeneralSettings() {
    let showFooter = false;
    let showMapHud = true;
    try {
      showFooter = localStorage.getItem('netmap_show_footer_v1') === '1';
      showMapHud = localStorage.getItem('netmap_show_map_hud_v1') !== '0';
    } catch { /* ignore storage errors */ }

    this.setFooterVisible(showFooter, { persist: false, emitResize: false });
    this.setMapInfoHudVisible(showMapHud, { persist: false });

    this.toggleSettingFooter?.addEventListener('change', (e) => {
      this.setFooterVisible(Boolean(e.target.checked));
    });

    this.toggleSettingMapHud?.addEventListener('change', (e) => {
      this.setMapInfoHudVisible(Boolean(e.target.checked));
    });

    this.btnSettingsMapScale?.addEventListener('click', () => {
      this.closeNavbarDropdowns();
      eventBus.emit('modal:open-map-scale');
    });
  }

  /** Shows or hides the bottom footer status bar cleanly & notifies canvases to resize. */
  setFooterVisible(visible, { persist = true, emitResize = true } = {}) {
    const show = Boolean(visible);
    if (typeof document !== 'undefined' && document.body?.classList) {
      document.body.classList.toggle('hide-footer-status', !show);
    }
    if (this.toggleSettingFooter) {
      this.toggleSettingFooter.checked = show;
    }
    if (persist) {
      try { localStorage.setItem('netmap_show_footer_v1', show ? '1' : '0'); } catch { /* ignore */ }
    }
    if (emitResize && typeof window !== 'undefined') {
      const dispatch = () => window.dispatchEvent(new Event('resize'));
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(dispatch);
      else dispatch();
    }
    return show;
  }

  /** Shows or hides the bottom-left floating map scale/count HUD badge. */
  setMapInfoHudVisible(visible, { persist = true } = {}) {
    const show = Boolean(visible);
    if (typeof document !== 'undefined' && document.body?.classList) {
      document.body.classList.toggle('hide-map-info-hud', !show);
    }
    if (this.toggleSettingMapHud) {
      this.toggleSettingMapHud.checked = show;
    }
    if (persist) {
      try { localStorage.setItem('netmap_show_map_hud_v1', show ? '1' : '0'); } catch { /* ignore */ }
    }
    return show;
  }

  openSearchDropdown() {
    if (!this.navbarSearchWrapper) return;
    this.navbarSearchWrapper.classList.add('open');
    this.btnToggleSearch?.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      this.globalSearchInput?.focus();
      eventBus.emit('search:opened');
    }, 20);
  }

  closeNavbarDropdowns() {
    this.navbarMenuWrapper?.classList.remove('open');
    this.btnNavbarMenu?.setAttribute('aria-expanded', 'false');
    this.navbarViewFilterWrapper?.classList.remove('open');
    this.btnNavbarViewFilter?.setAttribute('aria-expanded', 'false');
    this.navbarSearchWrapper?.classList.remove('open');
    this.btnToggleSearch?.setAttribute('aria-expanded', 'false');
    this.navbarSettingsWrapper?.classList.remove('open');
    this.btnNavbarSettings?.setAttribute('aria-expanded', 'false');
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
      this.btnToggleTheme.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}" id="theme-toggle-icon" style="width: 13px; height: 13px;"></i><span>${isDark ? 'Mode Terang' : 'Mode Gelap'}</span>`;
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

  toggleWorkspaceFullscreen() {
    const isActive = document.body.classList.contains('workspace-fullscreen');
    this.setWorkspaceFullscreen(!isActive);
  }

  requestNativeFullscreenAndLandscape() {
    const tryLockOrientation = () => {
      try {
        const res = screen?.orientation?.lock?.('landscape');
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            try {
              const resPrimary = screen?.orientation?.lock?.('landscape-primary');
              if (resPrimary && typeof resPrimary.catch === 'function') resPrimary.catch(() => {});
            } catch { /* ignore */ }
          });
        }
      } catch { /* ignore browsers without orientation lock */ }
    };

    if (!document.fullscreenElement && document.documentElement?.requestFullscreen) {
      try {
        let reqPromise;
        try {
          reqPromise = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        } catch {
          reqPromise = document.documentElement.requestFullscreen();
        }
        Promise.resolve(reqPromise)
          .then(tryLockOrientation)
          .catch(tryLockOrientation);
        return;
      } catch { /* fall through */ }
    }
    tryLockOrientation();
  }

  setWorkspaceFullscreen(enabled, { requestNative = true, lockLandscape = false } = {}) {
    this.syncWorkspaceFullscreenUI(enabled);

    if (enabled) {
      if (requestNative) {
        if (lockLandscape) {
          this.requestNativeFullscreenAndLandscape();
        } else if (!document.fullscreenElement && document.documentElement?.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      try { screen?.orientation?.unlock?.(); } catch { /* ignore */ }
      document.exitFullscreen().catch(() => {});
    }
  }

  syncWorkspaceFullscreenUI(enabled) {
    document.body.classList.toggle('workspace-fullscreen', enabled);
    if (this.btnToggleFullscreen) {
      this.btnToggleFullscreen.classList.toggle('active', enabled);
      this.btnToggleFullscreen.innerHTML = `<i data-lucide="${enabled ? 'minimize-2' : 'maximize-2'}" style="width: 15px; height: 15px;"></i>`;
      this.btnToggleFullscreen.title = enabled
        ? 'Keluar dari Fullscreen Workspace (Esc)'
        : 'Mode Fullscreen Workspace (Esc untuk keluar)';
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
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

    // Sync initial & subsequent Sidebar collapse events
    const applySidebarCollapsedClass = (side, open) => {
      const sidebarEl = document.querySelector(`.sidebar-${side}`);
      if (sidebarEl) {
        sidebarEl.classList.toggle('collapsed', !open);
      }
    };
    const uiState = stateManager.getState().ui || {};
    applySidebarCollapsedClass('left', Boolean(uiState.leftSidebarOpen));
    applySidebarCollapsedClass('right', Boolean(uiState.rightSidebarOpen));

    eventBus.on('ui:sidebar-toggled', ({ side, open }) => {
      applySidebarCollapsedClass(side, Boolean(open));
    });
  }
}
