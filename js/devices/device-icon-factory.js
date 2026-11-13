/**
 * NetMap — Device Icon & Graphics Factory
 * Provides vector SVG network icons, custom image loaders, and canvas texture caching
 */

// In-memory cache for HTMLImageElement instances to guarantee 60fps canvas performance
const iconImageCache = new Map();
const customImageCache = new Map();

/**
 * Built-in Network Icon Definitions (32x32 Vector SVG)
 */
export const NETWORK_ICON_DEFS = {
  'router': {
    id: 'router',
    name: 'Router',
    category: 'core',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="16" r="13" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M16 6v7m0 0l-2.5-2.5m2.5 2.5l2.5-2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 26v-7m0 0l-2.5 2.5m2.5-2.5l2.5 2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 16h7m0 0l-2.5-2.5m2.5 2.5l-2.5 2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M26 16h-7m0 0l2.5-2.5m-2.5 2.5l2.5 2.5" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
  },
  'main-router': {
    id: 'main-router',
    name: 'Core Router / CCR',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="3" width="26" height="26" rx="6" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="16" r="7.5" stroke="${color}" stroke-width="1.8"/>
        <path d="M16 5v4M16 23v4M5 16h4M23 16h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M13 16l3-3 3 3M19 16l-3 3-3-3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
  },
  'switch': {
    id: 'switch',
    name: 'Switch',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="6" width="26" height="20" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 12h16m0 0l-3.5-3m3.5 3l-3.5 3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 20H8m0 0l3.5-3m-3.5 3l3.5 3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `
  },
  'core-switch': {
    id: 'core-switch',
    name: 'Core / L3 Switch',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="5" width="26" height="22" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M7 11h7m0 0l-2.5-2.5m2.5 2.5l-2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M25 11h-7m0 0l2.5-2.5m-2.5 2.5l2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M7 21h7m0 0l-2.5-2.5m2.5 2.5l-2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M25 21h-7m0 0l2.5-2.5m-2.5 2.5l2.5 2.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `
  },
  'poe-switch': {
    id: 'poe-switch',
    name: 'PoE Switch',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="6" width="26" height="20" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 12h9M6 20h9" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M22 8l-5 8h4.5l-4 8" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="${color}"/>
      </svg>
    `
  },
  'access-point': {
    id: 'access-point',
    name: 'Wi-Fi Access Point',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="24" r="2.5" fill="${color}"/>
        <path d="M10.5 18.5a7.8 7.8 0 0 1 11 0" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M6.5 14a13.5 13.5 0 0 1 19 0" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M2.5 9.5a19 19 0 0 1 27 0" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `
  },
  'wireless-bridge': {
    id: 'wireless-bridge',
    name: 'Wireless PtP Bridge',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M16 4v11m-6 13l6-13 6 13m-9-6h6" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="16" cy="4" r="2" fill="${color}"/>
        <path d="M10 7a8 8 0 0 1 12 0" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
  },
  'firewall': {
    id: 'firewall',
    name: 'Firewall',
    category: 'core',
    svg: (color = '#d97706', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="6" width="24" height="20" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M4 12h24M4 18h24M12 6v6M20 6v6M8 12v6M16 12v6M24 12v6M12 18v8M20 18v8" stroke="${color}" stroke-width="1.6"/>
      </svg>
    `
  },
  'gateway': {
    id: 'gateway',
    name: 'Internet Gateway',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="16" r="12" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M4 16h24M16 4a15 15 0 0 1 0 24M16 4a15 15 0 0 0 0 24" stroke="${color}" stroke-width="1.8"/>
      </svg>
    `
  },
  'server': {
    id: 'server',
    name: 'Physical Server',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="5" width="24" height="9" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <rect x="4" y="18" width="24" height="9" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="8" cy="9.5" r="1.5" fill="${color}"/>
        <circle cx="13" cy="9.5" r="1.5" fill="${color}"/>
        <path d="M20 9.5h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="8" cy="22.5" r="1.5" fill="${color}"/>
        <circle cx="13" cy="22.5" r="1.5" fill="${color}"/>
        <path d="M20 22.5h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
  },
  'cctv': {
    id: 'cctv',
    name: 'IP Camera (CCTV)',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M5 8h9l12 6-4 8-12-6z" stroke="${color}" stroke-width="2" stroke-linejoin="round" fill="${bg}"/>
        <circle cx="21" cy="17" r="2.5" fill="${color}"/>
        <path d="M9 10v10m-3 0h6m-3 0v4m-3 0h6" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
  },
  'computer': {
    id: 'computer',
    name: 'PC / Komputer',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="5" width="26" height="17" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M16 22v5M10 27h12" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="19.5" r="1" fill="${color}"/>
      </svg>
    `
  },
  'printer': {
    id: 'printer',
    name: 'Network Printer',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M8 9V4h16v5" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <rect x="4" y="9" width="24" height="13" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 18h16v10H8z" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="22" cy="13.5" r="1.5" fill="${color}"/>
      </svg>
    `
  },
  'ip-phone': {
    id: 'ip-phone',
    name: 'VoIP Phone',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="6" y="6" width="21" height="21" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 4a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v25a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <rect x="16" y="9" width="8" height="6" rx="1" stroke="${color}" stroke-width="1.5"/>
        <circle cx="17.5" cy="18" r="1" fill="${color}"/>
        <circle cx="20.5" cy="18" r="1" fill="${color}"/>
        <circle cx="17.5" cy="22" r="1" fill="${color}"/>
        <circle cx="20.5" cy="22" r="1" fill="${color}"/>
      </svg>
    `
  },
  'network-rack': {
    id: 'network-rack',
    name: 'Network Rack 19"',
    category: 'infrastructure',
    svg: (color = '#d97706', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="6" y="3" width="20" height="26" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 9h20M6 15h20M6 21h20M10 3v26M22 3v26" stroke="${color}" stroke-width="1.6"/>
      </svg>
    `
  },
  'odp': {
    id: 'odp',
    name: 'ODP / OTB Fiber',
    category: 'infrastructure',
    svg: (color = '#d97706', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="5" width="22" height="22" rx="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="11" cy="11" r="2" fill="${color}"/>
        <circle cx="16" cy="11" r="2" fill="${color}"/>
        <circle cx="21" cy="11" r="2" fill="${color}"/>
        <circle cx="11" cy="16" r="2" fill="${color}"/>
        <circle cx="16" cy="16" r="2" fill="${color}"/>
        <circle cx="21" cy="16" r="2" fill="${color}"/>
        <path d="M11 22h10" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
  },
  'cloud': {
    id: 'cloud',
    name: 'Cloud / Internet WAN',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M8 23h16a5.5 5.5 0 0 0 2-10.7 7.5 7.5 0 0 0-14.6-1.5A5.5 5.5 0 0 0 8 23z" stroke="${color}" stroke-width="2" fill="${bg}" stroke-linejoin="round"/>
      </svg>
    `
  },
  'database': {
    id: 'database',
    name: 'Database Storage',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <ellipse cx="16" cy="8" rx="10" ry="4" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 8v8c0 2.2 4.5 4 10 4s10-1.8 10-4V8" stroke="${color}" stroke-width="2"/>
        <path d="M6 16v8c0 2.2 4.5 4 10 4s10-1.8 10-4v-8" stroke="${color}" stroke-width="2"/>
      </svg>
    `
  },
  'storage': {
    id: 'storage',
    name: 'NAS / Storage',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="4" width="22" height="24" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5 11h22M5 18h22M10 8h4M10 15h4M10 22h4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="22" cy="7.5" r="1.2" fill="${color}"/>
        <circle cx="22" cy="14.5" r="1.2" fill="${color}"/>
        <circle cx="22" cy="21.5" r="1.2" fill="${color}"/>
      </svg>
    `
  },
  'laptop': {
    id: 'laptop',
    name: 'Laptop / Notebook',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="6" width="22" height="15" rx="2" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M2 24h28a1 1 0 0 1-1 2H3a1 1 0 0 1-1-2z" stroke="${color}" stroke-width="2" fill="${bg}"/>
      </svg>
    `
  },
  'iot': {
    id: 'iot',
    name: 'IoT / Smart Device',
    category: 'endDevice',
    svg: (color = '#059669', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <circle cx="16" cy="16" r="6" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
  },
  'custom': {
    id: 'custom',
    name: 'Perangkat Kustom',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <polygon points="16,3 28,10 28,22 16,29 4,22 4,10" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="16" r="4" fill="${color}"/>
      </svg>
    `
  },
  'mikrotik-ccr': {
    id: 'mikrotik-ccr',
    name: 'MikroTik CCR Rack',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="9" width="28" height="14" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5.5 20V12l2.5 4.2L10.5 12v8" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="13" y="13" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="17" y="13" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="21" y="13" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="25" y="13" width="2.8" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="13" y="17.5" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="17" y="17.5" width="2.8" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="21" y="17.5" width="2.8" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="25" y="17.5" width="2.8" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
      </svg>
    `
  },
  'mikrotik-rb': {
    id: 'mikrotik-rb',
    name: 'MikroTik RouterBOARD',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="3" y="8" width="26" height="16" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M6 12h6M6 15.5h4" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="24" cy="12" r="1.4" fill="${color}"/>
        <rect x="6" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="10.8" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="15.6" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="20.4" y="18.5" width="3.2" height="3" rx="0.5" fill="${color}"/>
        <rect x="24.8" y="18.5" width="2.2" height="3" rx="0.5" stroke="${color}" stroke-width="1.3"/>
      </svg>
    `
  },
  'mikrotik-crs': {
    id: 'mikrotik-crs',
    name: 'MikroTik CRS Switch',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5 12h2.2v2.2H5zm3.4 0h2.2v2.2H8.4zm3.4 0H14v2.2h-2.2zm3.4 0h2.2v2.2h-2.2z" fill="${color}"/>
        <path d="M5 16.5h2.2v2.2H5zm3.4 0h2.2v2.2H8.4zm3.4 0H14v2.2h-2.2zm3.4 0h2.2v2.2h-2.2z" fill="${color}"/>
        <rect x="20" y="12" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="24.2" y="12" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="20" y="16.4" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <rect x="24.2" y="16.4" width="3" height="2.6" rx="0.5" stroke="${color}" stroke-width="1.4"/>
        <path d="M6 21.5h12" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `
  },
  'mikrotik-cap': {
    id: 'mikrotik-cap',
    name: 'MikroTik cAP / hAP Wi-Fi',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <ellipse cx="16" cy="21" rx="11" ry="5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="21" r="2" fill="${color}"/>
        <path d="M11 14a7.5 7.5 0 0 1 10 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M7.5 10a12.5 12.5 0 0 1 17 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 6a17.5 17.5 0 0 1 24 0" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
  },
  'mikrotik-lhg': {
    id: 'mikrotik-lhg',
    name: 'MikroTik LHG PtP Dish',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M6 22C6 13.5 12.5 7 21 7" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M8.5 23.5L22.5 9.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M14 18l5-5m0 0h3.5m-3.5 0V9.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="23" cy="9" r="2" fill="${color}"/>
        <path d="M9 26h10M14 23v3" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M25.5 4.5a6 6 0 0 1 2 4.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
  },
  'mikrotik-sxt': {
    id: 'mikrotik-sxt',
    name: 'MikroTik SXT / mANTBox',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="7" width="12" height="18" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M8 11v10M12 11v10" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M10 25v4M6 29h8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M20 12a6.5 6.5 0 0 1 0 8" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M23.5 9a11 11 0 0 1 0 14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M27 6a15.5 15.5 0 0 1 0 20" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
  },
  'ruijie-gateway': {
    id: 'ruijie-gateway',
    name: 'Ruijie EG / NBR Gateway',
    category: 'core',
    svg: (color = '#2a7c13', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5.5 20V12h3a2.5 2.5 0 0 1 0 5h-3m2.2 0L10 20" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="14.5" cy="13.5" r="1.4" fill="${color}"/>
        <circle cx="18.5" cy="13.5" r="1.4" fill="${color}"/>
        <rect x="13" y="17.5" width="3" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="17.2" y="17.5" width="3" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="21.4" y="17.5" width="3" height="2.6" rx="0.5" fill="${color}"/>
        <rect x="25.2" y="13" width="2.4" height="7" rx="0.5" stroke="${color}" stroke-width="1.3"/>
      </svg>
    `
  },
  'ruijie-switch': {
    id: 'ruijie-switch',
    name: 'Ruijie NBS / ES Switch',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <path d="M5 12h2v2H5zm3 0h2v2H8zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2z" fill="${color}"/>
        <path d="M5 16h2v2H5zm3 0h2v2H8zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2z" fill="${color}"/>
        <rect x="21.5" y="11.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="25" y="11.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="21.5" y="15.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="25" y="15.8" width="2.6" height="2.6" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <path d="M5.5 21h21" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    `
  },
  'ruijie-rap': {
    id: 'ruijie-rap',
    name: 'Ruijie Reyee RAP AP',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="5" y="12" width="22" height="15" rx="5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="16" cy="19.5" r="2.2" fill="${color}"/>
        <path d="M11.5 9.5a6.8 6.8 0 0 1 9 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 6a11.5 11.5 0 0 1 16 0" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
  },
  'ruijie-est': {
    id: 'ruijie-est',
    name: 'Ruijie EST Wireless Bridge',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="4" y="6" width="12" height="19" rx="3" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="10" cy="12" r="2" stroke="${color}" stroke-width="1.6"/>
        <path d="M7.5 18h5M10 25v4M6 29h8" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M20 11a7 7 0 0 1 0 9" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M24 8a11.5 11.5 0 0 1 0 15" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
  },
  'tplink-hub': {
    id: 'tplink-hub',
    name: 'TP-Link Desktop Switch / Hub',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <path d="M5 12h22l2 5v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7l2-5z" stroke="${color}" stroke-width="2" stroke-linejoin="round" fill="${bg}"/>
        <path d="M3 17h26" stroke="${color}" stroke-width="1.6"/>
        <circle cx="7" cy="14.5" r="1.1" fill="${color}"/>
        <rect x="6" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="10.8" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="15.6" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="20.4" y="19.5" width="3.2" height="3.2" rx="0.5" fill="${color}"/>
        <rect x="24.8" y="19.5" width="2.2" height="3.2" rx="0.5" stroke="${color}" stroke-width="1.2"/>
      </svg>
    `
  },
  'tplink-switch': {
    id: 'tplink-switch',
    name: 'TP-Link JetStream Switch',
    category: 'distribution',
    svg: (color = '#76c457', bg = 'none') => `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
        <rect x="2" y="8" width="28" height="16" rx="2.5" stroke="${color}" stroke-width="2" fill="${bg}"/>
        <circle cx="5.5" cy="12" r="1.2" fill="${color}"/>
        <circle cx="5.5" cy="16" r="1.2" fill="${color}"/>
        <path d="M8.5 11.5h2.2v2.2H8.5zm3.3 0H14v2.2h-2.2zm3.3 0h2.2v2.2h-2.2zm3.3 0h2.2v2.2h-2.2z" fill="${color}"/>
        <path d="M8.5 15.5h2.2v2.2H8.5zm3.3 0H14v2.2h-2.2zm3.3 0h2.2v2.2h-2.2zm3.3 0h2.2v2.2h-2.2z" fill="${color}"/>
        <rect x="22.5" y="11.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="26" y="11.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="22.5" y="15.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <rect x="26" y="15.5" width="2.5" height="2.5" rx="0.4" stroke="${color}" stroke-width="1.3"/>
        <path d="M5.5 21h21" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    `
  }
};

/**
 * Get default icon key based on device type
 * @param {string} type 
 * @returns {string}
 */
export function getDefaultIconForType(type) {
  const map = {
    'router': 'router',
    'main-router': 'main-router',
    'core-switch': 'core-switch',
    'dist-switch': 'switch',
    'firewall': 'firewall',
    'gateway': 'gateway',
    'managed-switch': 'switch',
    'poe-switch': 'poe-switch',
    'access-point': 'access-point',
    'wireless-bridge': 'wireless-bridge',
    'unmanaged-switch': 'switch',
    'network-rack': 'network-rack',
    'patch-panel': 'switch',
    'odp': 'odp',
    'fo-terminal': 'odp',
    'network-pole': 'wireless-bridge',
    'cctv': 'cctv',
    'nvr': 'server',
    'server': 'server',
    'computer': 'computer',
    'printer': 'printer',
    'ip-phone': 'ip-phone',
    'storage': 'storage',
    'nas': 'storage',
    'laptop': 'laptop',
    'iot': 'iot',
    'custom': 'custom',
    // MikroTik Hardware Presets
    'mikrotik-ccr2116': 'mikrotik-ccr',
    'mikrotik-ccr2004': 'mikrotik-ccr',
    'mikrotik-rb5009': 'mikrotik-rb',
    'mikrotik-rb4011': 'mikrotik-rb',
    'mikrotik-l009': 'mikrotik-rb',
    'mikrotik-hex': 'mikrotik-rb',
    'mikrotik-crs317': 'mikrotik-crs',
    'mikrotik-crs326': 'mikrotik-crs',
    'mikrotik-crs328': 'mikrotik-crs',
    'mikrotik-crs310': 'mikrotik-crs',
    'mikrotik-cap-ax': 'mikrotik-cap',
    'mikrotik-hap-ax2': 'mikrotik-cap',
    'mikrotik-lhg5': 'mikrotik-lhg',
    'mikrotik-sxtsq': 'mikrotik-sxt',
    'mikrotik-mantbox': 'mikrotik-sxt',
    // Ruijie & Reyee Hardware Presets
    'ruijie-eg210g': 'ruijie-gateway',
    'ruijie-eg310gh': 'ruijie-gateway',
    'ruijie-nbr6210': 'ruijie-gateway',
    'ruijie-s5750': 'ruijie-switch',
    'ruijie-nbs5200': 'ruijie-switch',
    'ruijie-nbs3100': 'ruijie-switch',
    'ruijie-nbs3100-poe': 'ruijie-switch',
    'ruijie-es218gc': 'ruijie-switch',
    'ruijie-es209gc': 'ruijie-switch',
    'ruijie-rap2260': 'ruijie-rap',
    'ruijie-rap2200': 'ruijie-rap',
    'ruijie-rap1200': 'ruijie-rap',
    'ruijie-rap6260': 'ruijie-rap',
    'ruijie-est350': 'ruijie-est',
    // TP-Link Switch & Hub Presets
    'tplink-ls1005g': 'tplink-hub',
    'tplink-sg1008d': 'tplink-hub',
    'tplink-sg108e': 'tplink-hub',
    'tplink-sg108pe': 'tplink-hub',
    'tplink-sg1016d': 'tplink-switch',
    'tplink-sg1024d': 'tplink-switch',
    'tplink-sg1218mp': 'tplink-switch',
    'tplink-sg2210mp': 'tplink-switch',
    'tplink-sg2428p': 'tplink-switch',
    'tplink-sg3428x': 'tplink-switch',
    'tplink-sx3016f': 'tplink-switch'
  };
  return map[type] || 'router';
}

/**
 * Generate raw SVG markup string for a given icon
 * @param {string} iconKey 
 * @param {Object} [options]
 * @param {string} [options.color]
 * @param {string} [options.bg]
 * @returns {string}
 */
export function getDeviceIconSvg(iconKey, { color = '#76c457', bg = 'none', size } = {}) {
  const def = NETWORK_ICON_DEFS[iconKey] || NETWORK_ICON_DEFS.router;
  let svg = def.svg(color, bg);
  if (size) {
    svg = svg.replace('width="32" height="32"', `width="${size}" height="${size}"`);
  }
  return svg;
}

/**
 * Asynchronously load and cache an HTMLImageElement for an icon
 * @param {string} iconKey 
 * @param {string} color 
 * @param {Function} callback (HTMLImageElement)
 */
export function getDeviceIconImage(iconKey, color = '#76c457', callback) {
  const cacheKey = `${iconKey}:${color}`;
  if (iconImageCache.has(cacheKey)) {
    callback(iconImageCache.get(cacheKey));
    return;
  }

  const svgStr = getDeviceIconSvg(iconKey, { color, bg: 'none' });
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

  const img = new Image();
  img.onload = () => {
    iconImageCache.set(cacheKey, img);
    callback(img);
  };
  img.onerror = (err) => {
    console.warn(`[IconFactory] Failed to rasterize icon "${iconKey}":`, err);
  };
  img.src = dataUrl;
}

/**
 * Asynchronously load and cache an arbitrary custom user image (Data URL or URL)
 * @param {string} src 
 * @param {Function} callback (HTMLImageElement)
 */
export function loadDeviceCustomImage(src, callback) {
  if (!src) return;

  if (customImageCache.has(src)) {
    callback(customImageCache.get(src));
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    customImageCache.set(src, img);
    callback(img);
  };
  img.onerror = (err) => {
    console.warn('[IconFactory] Failed to load custom device image:', err);
  };
  img.src = src;
}
