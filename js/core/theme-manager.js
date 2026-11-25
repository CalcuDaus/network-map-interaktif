/**
 * NetMap — Real-Time Theme & Custom Color Manager
 * Mengelola preset palet tema (Ocean Slate default) & kustomisasi warna mandiri Light/Dark mode.
 */

import { eventBus } from './event-bus.js';

const STORAGE_MODE_KEY = 'netmap-theme';
const STORAGE_CONFIG_KEY = 'netmap_theme_config_v1';
const STORAGE_VARS_CACHE_KEY = 'netmap_theme_vars_cache_v1';

export const THEME_PALETTES = [
  {
    id: 'ocean-slate',
    name: 'Ocean Slate',
    subtitle: 'Biru Laut & Abu Baja (Default)',
    swatches: ['#0b1620', '#183346', '#2a5367', '#537b8e', '#9ab7c1', '#e3edf0'],
    light: {
      bgPrimary: '#e3edf0',
      bgSecondary: '#d4e3e8',
      bgElevated: '#f5f9fa',
      border: '#9ab7c1',
      textPrimary: '#0b1620',
      textSecondary: '#183346',
      textMuted: '#537b8e',
      accentPrimary: '#2a5367',
      accentSecondary: '#537b8e'
    },
    dark: {
      bgPrimary: '#0b1620',
      bgSecondary: '#183346',
      bgElevated: '#2a5367',
      border: '#2a5367',
      textPrimary: '#e3edf0',
      textSecondary: '#c2d6de',
      textMuted: '#9ab7c1',
      accentPrimary: '#537b8e',
      accentSecondary: '#9ab7c1'
    }
  },
  {
    id: 'arctic-cobalt',
    name: 'Arctic Cobalt',
    subtitle: 'Biru Teknik Bersih',
    swatches: ['#0b1120', '#1e3a8a', '#2563eb', '#60a5fa', '#cbd5e1', '#f1f5f9'],
    light: {
      bgPrimary: '#f1f5f9',
      bgSecondary: '#e2e8f0',
      bgElevated: '#ffffff',
      border: '#94a3b8',
      textPrimary: '#0f172a',
      textSecondary: '#1e293b',
      textMuted: '#475569',
      accentPrimary: '#2563eb',
      accentSecondary: '#0284c7'
    },
    dark: {
      bgPrimary: '#0b1120',
      bgSecondary: '#131c31',
      bgElevated: '#1e293b',
      border: '#334155',
      textPrimary: '#f1f5f9',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      accentPrimary: '#3b82f6',
      accentSecondary: '#60a5fa'
    }
  },
  {
    id: 'emerald-sage',
    name: 'Emerald Sage',
    subtitle: 'Zamrud Kampus Modern',
    swatches: ['#0c1a14', '#143829', '#15803d', '#34d399', '#a7f3d0', '#ecfdf5'],
    light: {
      bgPrimary: '#ecfdf5',
      bgSecondary: '#d1fae5',
      bgElevated: '#f8fafc',
      border: '#6ee7b7',
      textPrimary: '#0c1a14',
      textSecondary: '#14532d',
      textMuted: '#15803d',
      accentPrimary: '#15803d',
      accentSecondary: '#059669'
    },
    dark: {
      bgPrimary: '#0c1a14',
      bgSecondary: '#132a20',
      bgElevated: '#1e4031',
      border: '#285e46',
      textPrimary: '#ecfdf5',
      textSecondary: '#d1fae5',
      textMuted: '#6ee7b7',
      accentPrimary: '#10b981',
      accentSecondary: '#34d399'
    }
  },
  {
    id: 'royal-amethyst',
    name: 'Royal Amethyst',
    subtitle: 'Ungu Elegan & Kontras',
    swatches: ['#130f24', '#261d47', '#6d28d9', '#a78bfa', '#ddd6fe', '#f5f3ff'],
    light: {
      bgPrimary: '#f5f3ff',
      bgSecondary: '#ede9fe',
      bgElevated: '#ffffff',
      border: '#c4b5fd',
      textPrimary: '#130f24',
      textSecondary: '#2e1065',
      textMuted: '#6d28d9',
      accentPrimary: '#6d28d9',
      accentSecondary: '#8b5cf6'
    },
    dark: {
      bgPrimary: '#130f24',
      bgSecondary: '#1e1738',
      bgElevated: '#2e2354',
      border: '#4c3d85',
      textPrimary: '#f5f3ff',
      textSecondary: '#ddd6fe',
      textMuted: '#c4b5fd',
      accentPrimary: '#7c3aed',
      accentSecondary: '#a78bfa'
    }
  },
  {
    id: 'warm-espresso',
    name: 'Warm Espresso',
    subtitle: 'Hangat Kuning Emas & Kopi',
    swatches: ['#1c1410', '#36261e', '#b45309', '#f59e0b', '#e7d5c5', '#faf5ef'],
    light: {
      bgPrimary: '#faf5ef',
      bgSecondary: '#f2e8dc',
      bgElevated: '#fffdf9',
      border: '#d6bfa6',
      textPrimary: '#1c1410',
      textSecondary: '#432818',
      textMuted: '#78350f',
      accentPrimary: '#b45309',
      accentSecondary: '#d97706'
    },
    dark: {
      bgPrimary: '#1c1410',
      bgSecondary: '#291e18',
      bgElevated: '#3d2c23',
      border: '#5c4438',
      textPrimary: '#faf5ef',
      textSecondary: '#e7d5c5',
      textMuted: '#d6bfa6',
      accentPrimary: '#d97706',
      accentSecondary: '#fbbf24'
    }
  },
  {
    id: 'graphite-teal',
    name: 'Graphite Teal',
    subtitle: 'Grafit Netral & Tosca',
    swatches: ['#111315', '#1f2428', '#0d9488', '#2dd4bf', '#d1d5db', '#f4f5f7'],
    light: {
      bgPrimary: '#f4f5f7',
      bgSecondary: '#e5e7eb',
      bgElevated: '#ffffff',
      border: '#9ca3af',
      textPrimary: '#111315',
      textSecondary: '#1f2937',
      textMuted: '#4b5563',
      accentPrimary: '#0d9488',
      accentSecondary: '#14b8a6'
    },
    dark: {
      bgPrimary: '#111315',
      bgSecondary: '#1a1d21',
      bgElevated: '#262b31',
      border: '#3e4750',
      textPrimary: '#f4f5f7',
      textSecondary: '#d1d5db',
      textMuted: '#9ca3af',
      accentPrimary: '#0d9488',
      accentSecondary: '#2dd4bf'
    }
  }
];

export function normalizeHex(hex, fallback = '#2a5367') {
  const s = String(hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function hexToRgb(hex) {
  const clean = normalizeHex(hex, '#2a5367').slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

export function mixHex(hexA, hexB, weightB = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, Number(weightB) || 0));
  const lerp = (x, y) => Math.round(x * (1 - w) + y * w).toString(16).padStart(2, '0');
  return `#${lerp(a.r, b.r)}${lerp(a.g, b.g)}${lerp(a.b, b.b)}`;
}

export function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Derive the complete set of CSS custom properties for a palette + optional custom overrides.
 * @param {Object} rawTokens
 * @param {'light'|'dark'} [mode='light']
 * @returns {Record<string, string>}
 */
export function deriveThemeCssVars(rawTokens = {}, mode = 'light') {
  const isDark = mode === 'dark';
  const basePalette = THEME_PALETTES[0][isDark ? 'dark' : 'light'];

  const bgPrimary = normalizeHex(rawTokens.bgPrimary, basePalette.bgPrimary);
  const bgSecondary = normalizeHex(rawTokens.bgSecondary, basePalette.bgSecondary);
  const bgElevated = rawTokens.bgElevated
    ? normalizeHex(rawTokens.bgElevated, basePalette.bgElevated)
    : (isDark ? mixHex(bgPrimary, '#ffffff', 0.12) : mixHex(bgPrimary, '#ffffff', 0.65));

  const border = rawTokens.border
    ? normalizeHex(rawTokens.border, basePalette.border)
    : (isDark ? mixHex(bgSecondary, '#ffffff', 0.18) : mixHex(bgSecondary, '#000000', 0.18));

  const textPrimary = normalizeHex(rawTokens.textPrimary, basePalette.textPrimary);
  const textSecondary = rawTokens.textSecondary
    ? normalizeHex(rawTokens.textSecondary, basePalette.textSecondary)
    : mixHex(textPrimary, bgPrimary, 0.22);
  const textMuted = rawTokens.textMuted
    ? normalizeHex(rawTokens.textMuted, basePalette.textMuted)
    : mixHex(textPrimary, bgPrimary, 0.45);

  const accentPrimary = normalizeHex(rawTokens.accentPrimary, basePalette.accentPrimary);
  const accentSecondary = normalizeHex(rawTokens.accentSecondary, basePalette.accentSecondary);

  const bgTertiary = isDark ? mixHex(bgSecondary, bgElevated, 0.45) : mixHex(bgSecondary, border, 0.24);
  const bgHover = isDark ? mixHex(bgElevated, accentPrimary, 0.22) : mixHex(bgSecondary, border, 0.44);
  const bgActive = isDark ? mixHex(bgElevated, accentPrimary, 0.38) : border;
  const borderLight = isDark ? mixHex(border, '#ffffff', 0.18) : mixHex(border, '#ffffff', 0.45);

  const textInverse = getLuminance(accentPrimary) > 0.52 ? '#0b1620' : '#f8fafc';
  const accentHover = isDark ? mixHex(accentPrimary, '#ffffff', 0.15) : mixHex(accentPrimary, '#000000', 0.22);
  const mossColor = isDark ? accentSecondary : mixHex(accentPrimary, '#000000', 0.26);

  const accRgb = hexToRgb(accentPrimary);
  const acc2Rgb = hexToRgb(accentSecondary);
  const bgRgb = hexToRgb(bgPrimary);

  return {
    '--bg-primary': bgPrimary,
    '--bg-secondary': bgSecondary,
    '--bg-tertiary': bgTertiary,
    '--bg-elevated': bgElevated,
    '--bg-hover': bgHover,
    '--bg-active': bgActive,
    '--border-color': border,
    '--border-light': borderLight,
    '--border-focus': accentPrimary,
    '--border-focus-glow': `rgba(${accRgb.r}, ${accRgb.g}, ${accRgb.b}, ${isDark ? 0.35 : 0.25})`,
    '--text-primary': textPrimary,
    '--text-secondary': textSecondary,
    '--text-muted': textMuted,
    '--text-inverse': textInverse,
    '--accent-blue': accentPrimary,
    '--accent-cyan': accentSecondary,
    '--accent-sky': accentSecondary,
    '--accent-green': accentPrimary,
    '--accent-leaf': accentSecondary,
    '--accent-moss': mossColor,
    '--accent-hover': accentHover,
    '--palette-forest': accentPrimary,
    '--palette-leaf': accentSecondary,
    '--palette-cream': bgPrimary,
    '--palette-sand': bgSecondary,
    '--cable-cat5e': accentPrimary,
    '--cable-cat6': mixHex(accentPrimary, '#000000', isDark ? 0.15 : 0.28),
    '--cable-cat6a': accentSecondary,
    '--cable-wireless': accentSecondary,
    '--modal-backdrop': `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${isDark ? 0.88 : 0.76})`,
    '--theme-accent-rgb': `${accRgb.r}, ${accRgb.g}, ${accRgb.b}`,
    '--theme-accent2-rgb': `${acc2Rgb.r}, ${acc2Rgb.g}, ${acc2Rgb.b}`
  };
}

export class ThemeManager {
  constructor() {
    this.mode = 'light';
    this.paletteId = 'ocean-slate';
    this.custom = { light: {}, dark: {} };
    this._loaded = false;
  }

  _readStorage() {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const savedMode = localStorage.getItem(STORAGE_MODE_KEY);
      if (savedMode === 'dark' || savedMode === 'light') {
        this.mode = savedMode;
      }
      const rawCfg = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (rawCfg) {
        const parsed = JSON.parse(rawCfg);
        if (parsed && typeof parsed === 'object') {
          if (THEME_PALETTES.some((p) => p.id === parsed.paletteId)) {
            this.paletteId = parsed.paletteId;
          }
          if (parsed.custom && typeof parsed.custom === 'object') {
            this.custom = {
              light: { ...(parsed.custom.light || {}) },
              dark: { ...(parsed.custom.dark || {}) }
            };
          }
        }
      }
    } catch {
      /* ignore storage errors */
    }
  }

  _saveStorage() {
    try {
      localStorage.setItem(STORAGE_MODE_KEY, this.mode);
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify({
        paletteId: this.paletteId,
        custom: this.custom
      }));
      const cache = {
        light: deriveThemeCssVars(this.getCurrentTokens('light'), 'light'),
        dark: deriveThemeCssVars(this.getCurrentTokens('dark'), 'dark')
      };
      localStorage.setItem(STORAGE_VARS_CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* ignore storage errors */
    }
  }

  init() {
    this._loaded = false;
    this._readStorage();
    return this.applyToDOM();
  }

  getMode() {
    this._readStorage();
    return this.mode;
  }

  setMode(mode) {
    this._readStorage();
    this.mode = mode === 'dark' ? 'dark' : 'light';
    this._saveStorage();
    return this.applyToDOM();
  }

  toggleMode() {
    return this.setMode(this.getMode() === 'dark' ? 'light' : 'dark');
  }

  getPaletteId() {
    this._readStorage();
    return this.paletteId;
  }

  getPalettes() {
    return THEME_PALETTES;
  }

  getActivePalette() {
    this._readStorage();
    return THEME_PALETTES.find((p) => p.id === this.paletteId) || THEME_PALETTES[0];
  }

  setPalette(paletteId) {
    this._readStorage();
    const found = THEME_PALETTES.find((p) => p.id === paletteId);
    if (!found) return null;
    this.paletteId = found.id;
    // Clear previous custom overrides so switching preset applies cleanly
    this.custom = { light: {}, dark: {} };
    this._saveStorage();
    return this.applyToDOM();
  }

  getCurrentTokens(mode = this.getMode()) {
    this._readStorage();
    const m = mode === 'dark' ? 'dark' : 'light';
    const palette = this.getActivePalette();
    const base = { ...(palette[m] || palette.light) };
    const overrides = this.custom[m] || {};
    const merged = { ...base, ...overrides };

    if (overrides.bgPrimary && !overrides.bgElevated) {
      delete merged.bgElevated;
    }
    if (overrides.bgSecondary && !overrides.border) {
      delete merged.border;
    }
    if (overrides.textPrimary) {
      if (!overrides.textSecondary) delete merged.textSecondary;
      if (!overrides.textMuted) delete merged.textMuted;
    }

    const cssVars = deriveThemeCssVars(merged, m);
    return {
      ...merged,
      bgPrimary: cssVars['--bg-primary'],
      bgSecondary: cssVars['--bg-secondary'],
      bgElevated: cssVars['--bg-elevated'],
      border: cssVars['--border-color'],
      textPrimary: cssVars['--text-primary'],
      textSecondary: cssVars['--text-secondary'],
      textMuted: cssVars['--text-muted'],
      accentPrimary: cssVars['--accent-blue'],
      accentSecondary: cssVars['--accent-cyan']
    };
  }

  hasCustomOverrides(mode = this.getMode()) {
    this._readStorage();
    const m = mode === 'dark' ? 'dark' : 'light';
    return Object.keys(this.custom[m] || {}).length > 0;
  }

  setCustomColor(key, hex, mode = this.getMode()) {
    this._readStorage();
    const allowedKeys = ['accentPrimary', 'accentSecondary', 'bgPrimary', 'bgSecondary', 'textPrimary'];
    if (!allowedKeys.includes(key)) return null;
    const m = mode === 'dark' ? 'dark' : 'light';
    const normalized = normalizeHex(hex, '');
    if (!normalized) return null;
    this.custom[m] = { ...(this.custom[m] || {}), [key]: normalized };
    this._saveStorage();
    return this.applyToDOM();
  }

  resetCustomColors(mode = null) {
    this._readStorage();
    if (mode === 'light' || mode === 'dark') {
      this.custom[mode] = {};
    } else {
      this.custom = { light: {}, dark: {} };
    }
    this._saveStorage();
    return this.applyToDOM();
  }

  applyToDOM() {
    this._readStorage();
    const m = this.mode === 'dark' ? 'dark' : 'light';
    const tokens = this.getCurrentTokens(m);
    const cssVars = deriveThemeCssVars(tokens, m);

    if (typeof document !== 'undefined' && document.documentElement) {
      const rootEl = document.documentElement;
      rootEl.setAttribute?.('data-theme', m);
      if (rootEl.style && typeof rootEl.style.setProperty === 'function') {
        Object.entries(cssVars).forEach(([prop, val]) => {
          rootEl.style.setProperty(prop, val);
        });
      }
      const themeMeta = typeof document.querySelector === 'function'
        ? document.querySelector('meta[name="theme-color"]')
        : null;
      if (themeMeta?.setAttribute) {
        themeMeta.setAttribute('content', tokens.bgSecondary);
      }
    }

    const detail = {
      mode: m,
      paletteId: this.paletteId,
      tokens,
      cssVars,
      hasCustom: this.hasCustomOverrides(m)
    };
    eventBus.emit('theme:changed', detail);
    return detail;
  }
}

export const themeManager = new ThemeManager();
