> **BrainSync Context Pumper** 🧠
> Dynamically loaded for active file: `js\map\map-3d-models.js` (Domain: **Generic Logic**)

### 📐 Generic Logic Conventions & Fixes
- **[what-changed] 🟢 Edited js/map/map-3d-models.js (5 changes, 145min)**: Active editing session on js/map/map-3d-models.js.
5 content changes over 145 minutes.
- **[what-changed] 🟢 Edited js/map/map-3d-engine.js (8 changes, 73min)**: Active editing session on js/map/map-3d-engine.js.
8 content changes over 73 minutes.
- **[problem-fix] Fixed null crash in MikroTik**: -     'printer': 'printer',
+     'pc': 'pc',
-     'ip-phone': 'ip-phone',
+     'workstation': 'pc',
-     'storage': 'storage',
+     'smartphone': 'smartphone',
-     'nas': 'storage',
+     'isp': 'isp',
-     'laptop': 'laptop',
+     'cloud': 'cloud',
-     'iot': 'iot',
+     'internet': 'isp',
-     'custom': 'custom',
+     'printer': 'printer',
-     // MikroTik Hardware Presets
+     'ip-phone': 'ip-phone',
-     'mikrotik-ccr2116': 'mikrotik-ccr',
+     'storage': 'storage',
-     'mikrotik-ccr2004': 'mikrotik-ccr',
+     'nas': 'storage',
-     'mikrotik-rb5009': 'mikrotik-rb',
+     'laptop': 'laptop',
-     'mikrotik-rb4011': 'mikrotik-rb',
+     'iot': 'iot',
-     'mikrotik-l009': 'mikrotik-rb',
+     'custom': 'custom',
-     'mikrotik-hex': 'mikrotik-rb',
+     // MikroTik Hardware Presets
-     'mikrotik-crs317': 'mikrotik-crs',
+     'mikrotik-ccr2116': 'mikrotik-ccr',
-     'mikrotik-crs326': 'mikrotik-crs',
+     'mikrotik-ccr2004': 'mikrotik-ccr',
-     'mikrotik-crs328': 'mikrotik-crs',
+     'mikrotik-rb5009': 'mikrotik-rb',
-     'mikrotik-crs310': 'mikrotik-crs',
+     'mikrotik-rb4011': 'mikrotik-rb',
-     'mikrotik-cap-ax': 'mikrotik-cap',
+     'mikrotik-l009': 'mikrotik-rb',
-     'mikrotik-hap-ax2': 'mikrotik-cap',
+     'mikrotik-hex': 'mikrotik-rb',
-     'mikrotik-lhg5': 'mikrotik-lhg',
+     'mikrotik-crs317': 'mikrotik-crs',
-     'mikrotik-sxtsq': 'mikrotik-sxt',
+     'mikrotik-crs326': 'mikrotik-crs',
-     'mikrotik-mantbox': 'mikrotik-sxt',
+     'mikrotik-crs328': 'mikrotik-crs',
-     // Ruijie & Reyee Hardware Presets
+     'mikrotik-crs310': 'mikrotik-crs',
-     'ruijie-eg210g': 'ruijie-gateway',
+     'mikrotik-cap-ax': 'mikrotik-cap',
-     'ruijie-eg310gh': 'ruijie-gateway',
+     'mikrotik-hap-ax2': 'mikrotik-cap',
-     'ruijie-nbr6210': 'ruijie-gateway',
+     'mikrotik-lhg5': 'mikrotik-lhg',
-     'ruijie-s5750': 'ruijie-switch',
+     'mikrotik-sxtsq': 'mikrotik-sxt',
-     'ruijie-nbs5200': 'ruijie-switch',

… [diff truncated]
- **[what-changed] what-changed in device-icon-factory.js**: File updated (external): js/devices/device-icon-factory.js

Content summary (674 lines):
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
    svg: (color = '#76c457', 
- **[discovery] discovery in project-storage.js**: File updated (external): js/storage/project-storage.js

Content summary (629 lines):
/**
 * NetMap — Project Storage & Debounced Auto-Save
 * Coordinates serialization of devices, connections, and state to IndexedDB
 */

import { database } from './database.js';
import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { debounce } from '../utils/helpers.js';

export class ProjectStorage {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {
- **[discovery] discovery in history-manager.js**: File updated (external): js/core/history-manager.js

Content summary (346 lines):
/**
 * NetMap — Undo / Redo History Manager
 * Implements Memento-based state history tracking with Ctrl+Z / Ctrl+Y shortcuts
 */

import { eventBus } from './event-bus.js';
import { stateManager } from './state-manager.js';
import { debounce } from '../utils/helpers.js';

export class HistoryManager {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} opt
- **[discovery] discovery in device-manager.js**: File updated (external): js/devices/device-manager.js

Content summary (570 lines):
/**
 * NetMap — Device Manager (CRUD & Collection Controller)
 * Orchestrates device lifecycle, state synchronization, and canvas rendering
 */

import { eventBus } from '../core/event-bus.js';
import { DeviceSchema } from './device-schema.js';
import { DeviceRenderer } from './device-renderer.js';
import { getDeviceDefByType } from './device-library.js';
import { clamp } from '../utils/helpers.js';

export class DeviceManager {
  /**
   * @param {Object} options
   * @param {Konva.Layer} option
- **[discovery] discovery in device-schema.js**: File updated (external): js/devices/device-schema.js

Content summary (1009 lines):
/**
 * NetMap — Device Schema & Data Validation
 * Implements schema definitions and validation rules specified in PRD Section 3.3 & 6.3
 */

import { generateId } from '../utils/helpers.js';

export const IPv4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
export const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

/**
 * Validate IPv4 format (allows empty stri
- **[what-changed] what-changed in custom-device-modal.js**: File updated (external): js/ui/custom-device-modal.js

Content summary (966 lines):
/**
 * NetMap — Custom Device Modal
 * Interactive dialog to create custom network devices with vector icons or custom uploaded images,
 * save them to the custom device library palette, and directly place them onto the map.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { DEVICE_CATEGORIES, DEVICE_STATUSES } from '../devices/device-library.js';
import { NETWORK_ICON_DEFS, getDeviceIconSvg, getDefaultIconForType } from '../de
- **[what-changed] what-changed in device-palette.js**: File updated (external): js/ui/device-palette.js

Content summary (619 lines):
/**
 * NetMap — Device Library Palette (Left Sidebar Component)
 * Renders ONLY 3D .GLB hardware device models (built-in & user-uploaded),
 * with real-time search, brand filters, delete/restore management, and multi-click placement mode.
 */

import { DEVICE_CATEGORIES } from '../devices/device-library.js';
import { getDeviceIconSvg, getDefaultIconForType } from '../devices/device-icon-factory.js';
import { getBuiltinGlbCustomTemplates } from '../devices/device-schema.js';
import { eventBus } f
- **[discovery] discovery in onboarding-modal.js**: File updated (external): js/ui/onboarding-modal.js

Content summary (322 lines):
/**
 * NetMap — Quick-Start Welcome Launcher, FPP Micro-Coachmark & Adaptive Shortcut Cheat-Sheet (Phase 9E)
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { uiIcon, isMobileTouchDevice } from '../utils/helpers.js';

const SKIP_WELCOME_KEY = 'netmap_skip_welcome_v1';
const SEEN_FPP_COACH_KEY = 'netmap_seen_fpp_coach_v1';

export class OnboardingModal {
  /**
   * @param {Object} options
   * @param {() => import('./jobsheet-p
- **[what-changed] 🟢 Edited js/ui/port-picker-modal.js (162 changes, 103min)**: Active editing session on js/ui/port-picker-modal.js.
162 content changes over 103 minutes.
- **[convention] Fixed null crash in Quick — prevents XSS injection attacks — confirmed 4x**: -         <!-- Quick Row Actions (Focus & Open Properties) -->
+         <!-- Quick Row Actions (Detail, Focus & Open Properties) -->
-         <!-- Quick Row Actions (Detail, Focus & Open Properties) -->
+         <div class="ps-layer-actions">
-         <div class="ps-layer-actions">
+           <button type="button" class="ps-row-action-btn" data-dev-detail="${device.id}" title="Detail, Spesifikasi, Anggaran &amp; SSID">
-           <button type="button" class="ps-row-action-btn" data-dev-detail="${device.id}" title="Detail, Spesifikasi, Anggaran &amp; SSID">
+             <i data-lucide="file-text" style="width: 12px; height: 12px;"></i>
-             <i data-lucide="file-text" style="width: 12px; height: 12px;"></i>
+           </button>
-           </button>
+           <button type="button" class="ps-row-action-btn" data-dev-focus="${device.id}" title="Fokus Kamera ke Perangkat Ini">
-           <button type="button" class="ps-row-action-btn" data-dev-focus="${device.id}" title="Fokus Kamera ke Perangkat Ini">
+             <i data-lucide="crosshair" style="width: 12px; height: 12px;"></i>
-             <i data-lucide="crosshair" style="width: 12px; height: 12px;"></i>
+           </button>
-           </button>
+           <button type="button" class="ps-row-action-btn" data-dev-props="${device.id}" title="Edit Properti & Konfigurasi">
-           <button type="button" class="ps-row-action-btn" data-dev-props="${device.id}" title="Edit Properti & Konfigurasi">
+             <i data-lucide="sliders" style="width: 12px; height: 12px;"></i>
-             <i data-lucide="sliders" style="width: 12px; height: 12px;"></i>
+           </button>
-           </button>
+         </div>
-         </div>
+       </div>
-       </div>
+     `;
-     `;
+   }
-   }
+ 
- 
+   bindTreeInteractions(treeContainer) {
-   bindTreeInteractions(treeContainer) {
+     // 1. Group Collapse / Expand Toggle
-     // 1. Group Collapse / Expand Toggle
+     treeContainer.querySelectorAl
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [MIKROTIK_TYPES, RUIJIE_TYPES, TPLINK_TYPES, DeviceLayersPanel]
- **[problem-fix] Patched security issue Detail — prevents XSS injection attacks**: -           <td style="padding: 10px 12px; text-align: right;">
+           <td style="padding: 10px 12px; text-align: right; white-space: nowrap;">
-           <td style="padding: 10px 12px; text-align: right; white-space: nowrap;">
+             <button class="btn btn-secondary btn-sm" data-detail-id="${dev.id}" style="font-size: 11px; margin-right: 4px;">
-             <button class="btn btn-secondary btn-sm" data-detail-id="${dev.id}" style="font-size: 11px; margin-right: 4px;">
+               Detail
-               Detail
+             </button>
-             </button>
+             <button class="btn btn-secondary btn-sm" data-goto-id="${dev.id}" style="font-size: 11px;">
-             <button class="btn btn-secondary btn-sm" data-goto-id="${dev.id}" style="font-size: 11px;">
+               Fokus
-               Fokus
+             </button>
-             </button>
+           </td>
-           </td>
+         </tr>
-         </tr>
+       `;
-       `;
+     });
-     });
+ 
- 
+     html += `</tbody></table>`;
-     html += `</tbody></table>`;
+     container.innerHTML = html;
-     container.innerHTML = html;
+ 
- 
+     // Attach detail click
-     // Attach detail click
+     container.querySelectorAll('[data-detail-id]').forEach((btn) => {
-     container.querySelectorAll('[data-detail-id]').forEach((btn) => {
+       btn.addEventListener('click', () => {
-       btn.addEventListener('click', () => {
+         const id = btn.getAttribute('data-detail-id');
-         const id = btn.getAttribute('data-detail-id');
+         if (id) {
-         if (id) {
+           this.hide();
-           this.hide();
+           eventBus.emit('modal:open-device-detail', { deviceId: id, tab: 'network' });
-           eventBus.emit('modal:open-device-detail', { deviceId: id, tab: 'network' });
+         }
-         }
+       });
-       });
+     });
-     });
+ 
- 
+     // Attach goto click
-     // Attach goto click
+     container.querySelectorAll('[data-goto-id]').f
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [IpVlanModal]
