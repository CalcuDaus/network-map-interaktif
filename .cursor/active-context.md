> **BrainSync Context Pumper** 🧠
> Dynamically loaded for active file: `js\map\map-3d-models.js` (Domain: **Generic Logic**)

### 📐 Generic Logic Conventions & Fixes
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
