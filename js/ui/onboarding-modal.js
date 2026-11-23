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
   * @param {() => import('./jobsheet-panel.js').JobsheetPanel} [options.getJobsheetPanel]
   * @param {() => import('../core/workspace-controller.js').WorkspaceController} [options.getWorkspaceController]
   * @param {() => import('./auth-modal.js').AuthModal} [options.getAuthModal]
   * @param {() => import('../map/map-3d-engine.js').Map3DEngine} [options.getMap3DEngine]
   */
  constructor({
    getJobsheetPanel = null,
    getWorkspaceController = null,
    getAuthModal = null,
    getMap3DEngine = null
  } = {}) {
    this.getJobsheetPanel = getJobsheetPanel;
    this.getWorkspaceController = getWorkspaceController;
    this.getAuthModal = getAuthModal;
    this.getMap3DEngine = getMap3DEngine;

    this.welcomeEl = null;
    this.shortcutsEl = null;
    this.coachmarkEl = null;
    this._shortcutTab = isMobileTouchDevice() ? 'mobile' : 'desktop';

    if (typeof document !== 'undefined' && document.body) {
      this._createWelcomeDOM();
      this._createShortcutsDOM();
      this._createFppCoachmarkDOM();
      this._bindEvents();
    }
  }

  shouldAutoShowWelcome() {
    try {
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem(SKIP_WELCOME_KEY) !== '1';
    } catch {
      return false;
    }
  }

  setSkipWelcome(skip) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SKIP_WELCOME_KEY, skip ? '1' : '0');
      }
    } catch { /* ignore */ }
    const cb = this.welcomeEl?.querySelector?.('#onb-skip-welcome-cb');
    if (cb) cb.checked = Boolean(skip);
  }

  _hasSeenFppCoachmark() {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(SEEN_FPP_COACH_KEY) === '1';
    } catch {
      return true;
    }
  }

  _markSeenFppCoachmark() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SEEN_FPP_COACH_KEY, '1');
      }
    } catch { /* ignore */ }
  }

  _createWelcomeDOM() {
    this.welcomeEl = document.createElement('div');
    this.welcomeEl.id = 'onboarding-welcome-modal';
    this.welcomeEl.className = 'modal-overlay onb-modal-overlay';
    this.welcomeEl.style.display = 'none';
    this.welcomeEl.innerHTML = `
      <div class="modal-card onb-welcome-card">
        <div class="onb-welcome-hero">
          <div class="onb-hero-badge">${uiIcon('school', 14)} <span>SMK Negeri 1 Beringin • SmartSchool NetMap</span></div>
          <div class="onb-hero-title">Selamat Datang di Simulator &amp; Digital Twin Jaringan</div>
          <div class="onb-hero-desc">Pilih mode mulai cepat di bawah ini. Dokumentasi asli sekolah selalu aman terlindungi.</div>
        </div>

        <div class="onb-role-grid onb-role-grid-2">
          <button type="button" id="btn-onb-role-explore" class="onb-role-card">
            <div class="onb-role-icon is-green">${uiIcon('building', 22)}</div>
            <div class="onb-role-title">Mode Jelajahi</div>
            <div class="onb-role-subbadge">Dokumentasi 3D SMKN 1 Beringin</div>
            <div class="onb-role-desc">Jelajahi peta 3D kampus secara aman: lihat Papan Nama Gedung, Kartu Dokumentasi Ruangan, Mode X-Ray, dan keliling FPP.</div>
          </button>

          <button type="button" id="btn-onb-role-build" class="onb-role-card is-featured">
            <div class="onb-role-icon is-amber">${uiIcon('wrench', 22)}</div>
            <div class="onb-role-title">Mode Build Sendiri</div>
            <div class="onb-role-subbadge">Bangunan 3D &amp; Arsitektur Jaringan</div>
            <div class="onb-role-desc">Susun gedung 3D, fasilitas kampus, sekaligus rancang arsitektur jaringan, tarik kabel fisik 3D, WinBox/CLI &amp; simulasi Ping.</div>
          </button>
        </div>

        <div class="onb-welcome-footer">
          <label class="onb-skip-label">
            <input type="checkbox" id="onb-skip-welcome-cb">
            <span>Ingat pilihan &amp; jangan tampilkan otomatis saat dibuka lagi</span>
          </label>
          <div style="display:flex;gap:8px;">
            <button type="button" id="btn-onb-open-shortcuts" class="btn btn-secondary btn-sm">
              ${uiIcon('keyboard', 13)} <span>Panduan Kontrol (?)</span>
            </button>
            <button type="button" id="btn-onb-close-welcome" class="btn btn-secondary btn-sm">Tutup</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.welcomeEl);
  }

  _createShortcutsDOM() {
    this.shortcutsEl = document.createElement('div');
    this.shortcutsEl.id = 'onboarding-shortcuts-modal';
    this.shortcutsEl.className = 'modal-overlay onb-modal-overlay';
    this.shortcutsEl.style.display = 'none';
    this.shortcutsEl.innerHTML = `
      <div class="modal-card onb-shortcuts-card">
        <div class="modal-header js-modal-header">
          <div style="display:flex;align-items:center;gap:8px;">
            ${uiIcon('help', 17)}
            <div>
              <div class="js-modal-title">Panduan Kontrol &amp; Cheat-Sheet Shortcut</div>
              <div class="js-modal-subtitle">Pintasan cepat untuk navigasi 3D, tarik kabel, Mode Teknisi &amp; Simulasi CLI</div>
            </div>
          </div>
          <button type="button" id="btn-onb-shortcuts-close" class="btn btn-icon btn-sm" title="Tutup">
            ${uiIcon('x', 15)}
          </button>
        </div>

        <div class="js-tab-bar">
          <button type="button" class="js-tab-btn" data-onb-tab="desktop">${uiIcon('keyboard', 13)} <span>Desktop / Laptop</span></button>
          <button type="button" class="js-tab-btn" data-onb-tab="mobile">${uiIcon('smartphone', 13)} <span>HP / Layar Sentuh</span></button>
        </div>

        <div id="onb-shortcuts-body" class="onb-shortcuts-body"></div>
      </div>
    `;
    document.body.appendChild(this.shortcutsEl);
  }

  _createFppCoachmarkDOM() {
    this.coachmarkEl = document.createElement('div');
    this.coachmarkEl.id = 'onboarding-fpp-coachmark';
    this.coachmarkEl.className = 'onb-fpp-coachmark hidden';
    this.coachmarkEl.style.display = 'none';
    this.coachmarkEl.innerHTML = `
      <div class="onb-coach-head">
        <span>${uiIcon('lightbulb', 13)} <strong>Tips Cepat Mode Teknisi (3 Langkah)</strong></span>
        <button type="button" id="btn-onb-coach-close" class="js-tracker-icon-btn" title="Tutup tips">${uiIcon('x', 12)}</button>
      </div>
      <ol class="onb-coach-steps">
        <li><strong>Jalan &amp; Buka Pintu:</strong> Gunakan <code>WASD</code> (atau Joystick kiri di HP), tekan <code>E</code> di depan pintu ruangan.</li>
        <li><strong>Angkat Alat &amp; Tarik Kabel 3D:</strong> Bidik alat lalu tekan <code>E</code> untuk angkat, atau <code>C</code> untuk menarik gulungan kabel + pasang klem di dinding!</li>
        <li><strong>Konfigurasi WinBox / CLI:</strong> Dekati perangkat lalu tekan <code>F</code> (atau tombol <strong>Port</strong>) untuk membuka Quick Config &amp; Ping 3D.</li>
      </ol>
    `;
    const host = document.getElementById('map-viewport') || document.body;
    host.appendChild(this.coachmarkEl);
  }

  _renderShortcutsBody() {
    const body = this.shortcutsEl?.querySelector('#onb-shortcuts-body');
    if (!body) return;
    this.shortcutsEl?.querySelectorAll('[data-onb-tab]')?.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-onb-tab') === this._shortcutTab);
    });

    if (this._shortcutTab === 'mobile') {
      body.innerHTML = `
        <div class="onb-shortcut-list">
          <div class="onb-sc-item"><span class="onb-key">Joystick Kiri</span><span>Jalan karakter teknisi di 3D (geser penuh ke tepi untuk lari otomatis)</span></div>
          <div class="onb-sc-item"><span class="onb-key">Geser Layar Kanan</span><span>Putar arah kamera 360 derajat di Mode Teknisi / FPP</span></div>
          <div class="onb-sc-item"><span class="onb-key">Klem / Undo / Colok</span><span>Tombol tarik kabel 3D: pasang klem ke tembok, lepas klem terakhir, atau colok ke port tujuan</span></div>
          <div class="onb-sc-item"><span class="onb-key">WinBox Quick Config</span><span>Isi IP, VLAN, DHCP &amp; NAT lewat formulir sentuh tanpa mengetik CLI panjang</span></div>
          <div class="onb-sc-item"><span class="onb-key">Smart Token Bar CLI</span><span>Ketuk chip perintah siap pakai di bawah terminal untuk praktik Cisco IOS &amp; MikroTik</span></div>
          <div class="onb-sc-item"><span class="onb-key">Lihat 3D (Peek)</span><span>Kecilkan modal Simulasi menjadi pita atas agar animasi paket Ping 3D tetap terlihat</span></div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="onb-shortcut-list">
          <div class="onb-sc-item"><span class="onb-key">O / H / Z / L</span><span>Alat Kamera 3D: Orbit, Pan, Zoom, dan Look Around</span></div>
          <div class="onb-sc-item"><span class="onb-key">M / R / [ ]</span><span>Geser objek (Move), Putar (Rotate), dan step putar 15 derajat</span></div>
          <div class="onb-sc-item"><span class="onb-key">X</span><span>Toggle 1-Klik Mode X-Ray Gedung (tembus pandang audit jalur backbone)</span></div>
          <div class="onb-sc-item"><span class="onb-key">G / V</span><span>Aktifkan Mode Teknisi 3D (TPP) dan ganti kamera Orang Pertama (FPP)</span></div>
          <div class="onb-sc-item"><span class="onb-key">W A S D + Spasi</span><span>Berjalan &amp; melompat dalam Mode Teknisi 3D</span></div>
          <div class="onb-sc-item"><span class="onb-key">E / C / F</span><span>Buka pintu atau angkat perangkat (E), Tarik gulungan kabel &amp; klem (C), Inspeksi Port (F)</span></div>
          <div class="onb-sc-item"><span class="onb-key">PgUp / PgDn</span><span>Atur ketinggian elevasi Z perangkat atau klem kabel secara live</span></div>
          <div class="onb-sc-item"><span class="onb-key">Ctrl+K / ?</span><span>Pencarian cepat (Gedung, Catatan ODP, IP, VLAN) &amp; Panduan Shortcut</span></div>
        </div>
      `;
    }
  }

  _bindEvents() {
    const persistSkipIfChecked = () => {
      const cb = this.welcomeEl?.querySelector('#onb-skip-welcome-cb');
      if (cb?.checked) this.setSkipWelcome(true);
    };

    this.welcomeEl?.querySelector('#btn-onb-close-welcome')?.addEventListener('click', () => {
      persistSkipIfChecked();
      this.hideWelcome();
    });
    this.welcomeEl?.addEventListener('click', (e) => {
      if (e.target === this.welcomeEl) {
        persistSkipIfChecked();
        this.hideWelcome();
      }
    });

    this.welcomeEl?.querySelector('#btn-onb-role-explore')?.addEventListener('click', () => {
      persistSkipIfChecked();
      this.hideWelcome();
      this.getWorkspaceController?.()?.switchWorkspace?.('network', { open3D: true, silent: true });
      if (stateManager.getViewMode() !== '3d') stateManager.setViewMode('3d');
      setTimeout(() => {
        this.getMap3DEngine?.()?.setShowBuildingSignboards?.(true);
        this.getMap3DEngine?.()?.zoomExtents?.();
      }, 80);
    });

    this.welcomeEl?.querySelector('#btn-onb-role-build')?.addEventListener('click', () => {
      persistSkipIfChecked();
      this.hideWelcome();
      this.getWorkspaceController?.()?.switchWorkspace?.('build', { open3D: true });
    });

    this.welcomeEl?.querySelector('#btn-onb-open-shortcuts')?.addEventListener('click', () => {
      this.hideWelcome();
      this.showShortcuts();
    });

    this.shortcutsEl?.querySelector('#btn-onb-shortcuts-close')?.addEventListener('click', () => this.hideShortcuts());
    this.shortcutsEl?.addEventListener('click', (e) => {
      if (e.target === this.shortcutsEl) this.hideShortcuts();
    });
    this.shortcutsEl?.querySelectorAll('[data-onb-tab]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._shortcutTab = btn.getAttribute('data-onb-tab') || 'desktop';
        this._renderShortcutsBody();
      });
    });

    this.coachmarkEl?.querySelector('#btn-onb-coach-close')?.addEventListener('click', () => {
      this.hideFppCoachmark();
    });

    // Show FPP Micro-Coachmark once on first avatar mode entry
    eventBus.on('map3d:avatar-toggled', ({ active } = {}) => {
      if (active && !this._hasSeenFppCoachmark()) {
        this.showFppCoachmark();
      } else if (!active) {
        this.hideFppCoachmark(false);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.welcomeEl?.style?.display === 'flex') this.hideWelcome();
        if (this.shortcutsEl?.style?.display === 'flex') this.hideShortcuts();
      }
    });
  }

  showWelcome() {
    if (!this.welcomeEl) return;
    const cb = this.welcomeEl.querySelector('#onb-skip-welcome-cb');
    if (cb) cb.checked = !this.shouldAutoShowWelcome();
    this.welcomeEl.style.display = 'flex';
  }

  hideWelcome() {
    if (this.welcomeEl) this.welcomeEl.style.display = 'none';
  }

  showShortcuts(tab = null) {
    if (!this.shortcutsEl) return;
    this._shortcutTab = tab || (isMobileTouchDevice() ? 'mobile' : 'desktop');
    this._renderShortcutsBody();
    this.shortcutsEl.style.display = 'flex';
  }

  hideShortcuts() {
    if (this.shortcutsEl) this.shortcutsEl.style.display = 'none';
  }

  showFppCoachmark() {
    if (!this.coachmarkEl) return;
    this.coachmarkEl.classList.remove('hidden');
    this.coachmarkEl.style.display = 'flex';
  }

  hideFppCoachmark(markSeen = true) {
    if (markSeen) this._markSeenFppCoachmark();
    if (!this.coachmarkEl) return;
    this.coachmarkEl.classList.add('hidden');
    this.coachmarkEl.style.display = 'none';
  }
}
