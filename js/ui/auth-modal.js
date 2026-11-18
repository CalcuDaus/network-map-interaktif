/**
 * SmartSchool NetMap — Multi-Technician Account & Main Server Workspace Modal
 * Handles Guest-to-Account Login, Technician Registration,
 * Workspace Switching ("Server Utama" shared template vs "Akun Pribadi"),
 * and 1-click template synchronization across multiple technicians.
 */

import { eventBus } from '../core/event-bus.js';

const AUTH_DRAFT_STORAGE_KEY = 'netmap_auth_modal_draft_v1';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class AuthModal {
  /**
   * @param {Object} options
   * @param {import('../storage/auth-manager.js').AuthManager} options.authManager
   * @param {import('../storage/project-storage.js').ProjectStorage} options.projectStorage
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('../core/history-manager.js').HistoryManager} [options.historyManager]
   * @param {Function} [options.onSeedSample]
   */
  constructor({ authManager, projectStorage, deviceManager, cableManager, historyManager = null, onSeedSample = null }) {
    this.authManager = authManager;
    this.projectStorage = projectStorage;
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.historyManager = historyManager;
    this.onSeedSample = onSeedSample;

    this.draftForm = {
      activeGuestTab: 'login',
      loginTargetWs: authManager?.getWorkspaceMode?.() || 'main',
      loginUsername: '',
      loginPassword: '',
      loginServerPass: '',
      loginReadonly: false,
      preserveCanvas: true,
      regUsername: '',
      regDisplay: '',
      regRole: 'teknisi',
      regPassword: '',
      regServerPass: '',
      preserveCanvasReg: true,
      unlockServerPass: ''
    };
    this._backdropPointerDownTarget = null;
    this.loadDraftFromStorage();

    this.activeGuestTab = this.draftForm.activeGuestTab === 'register' ? 'register' : 'login';
    this.loginTargetWs = this.draftForm.loginTargetWs || authManager?.getWorkspaceMode?.() || 'main';
    this.statusMessage = '';
    this.statusTone = 'info'; // 'info' | 'success' | 'error'
    this.modalEl = null;

    this.createModalDOM();
    this.bindGlobalEvents();
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'auth-account-modal';
    this.modalEl.className = 'auth-modal-backdrop';
    this.modalEl.style.display = 'none';
    document.body.appendChild(this.modalEl);

    this.modalEl.addEventListener('pointerdown', (e) => {
      this._backdropPointerDownTarget = e.target;
    });

    this.modalEl.addEventListener('click', (e) => {
      if (e.target !== this.modalEl) return;
      if (this._backdropPointerDownTarget && this._backdropPointerDownTarget !== this.modalEl) {
        this._backdropPointerDownTarget = null;
        return;
      }
      this._backdropPointerDownTarget = null;
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (activeEl && this.modalEl.contains?.(activeEl) && /^(INPUT|SELECT|TEXTAREA)$/i.test(activeEl.tagName || '')) {
        activeEl.blur?.();
        return;
      }
      this.hide();
    });
  }

  bindGlobalEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.hide();
      }
    });

    const onViewportChange = () => {
      if (this.isOpen()) {
        this.syncVisualViewportMetrics();
      }
    };
    window.addEventListener('resize', onViewportChange);
    if (window.visualViewport?.addEventListener) {
      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', onViewportChange);
    }

    eventBus.on('auth:changed', () => {
      if (this.isOpen()) {
        this.render();
      }
    });
  }

  syncVisualViewportMetrics() {
    if (!this.modalEl || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const vvHeight = vv?.height ? Math.round(vv.height) : (window.innerHeight || 0);
    const vvTop = vv?.offsetTop ? Math.round(vv.offsetTop) : 0;
    const winHeight = window.innerHeight || vvHeight;
    const kbOpen = Boolean(vv && winHeight > 0 && (winHeight - vv.height) > 100);
    if (vvHeight > 0) {
      this.modalEl.style.setProperty?.('--auth-vv-height', `${vvHeight}px`);
    }
    this.modalEl.style.setProperty?.('--auth-vv-top', `${vvTop}px`);
    this.modalEl.classList?.toggle('is-keyboard-open', kbOpen);
  }

  loadDraftFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(AUTH_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(this.draftForm).forEach((key) => {
          if (key in parsed && parsed[key] !== undefined) {
            this.draftForm[key] = parsed[key];
          }
        });
      }
    } catch { /* ignore corrupt draft storage */ }
  }

  saveDraftToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(AUTH_DRAFT_STORAGE_KEY, JSON.stringify(this.draftForm));
    } catch { /* ignore storage quota errors */ }
  }

  captureDraftFromDOM() {
    if (!this.modalEl) return;
    const readInput = (sel, prop) => {
      const el = this.modalEl.querySelector(sel);
      if (el) this.draftForm[prop] = el.value ?? '';
    };
    const readCheck = (sel, prop) => {
      const el = this.modalEl.querySelector(sel);
      if (el) this.draftForm[prop] = Boolean(el.checked);
    };

    readInput('#auth-login-username', 'loginUsername');
    readInput('#auth-login-password', 'loginPassword');
    readInput('#auth-login-server-pass', 'loginServerPass');
    readCheck('#auth-login-main-readonly', 'loginReadonly');
    readCheck('#auth-preserve-canvas', 'preserveCanvas');

    readInput('#auth-reg-username', 'regUsername');
    readInput('#auth-reg-display', 'regDisplay');
    readInput('#auth-reg-role', 'regRole');
    readInput('#auth-reg-password', 'regPassword');
    readInput('#auth-reg-server-pass', 'regServerPass');
    readCheck('#auth-preserve-canvas-reg', 'preserveCanvasReg');

    readInput('#auth-unlock-server-pass', 'unlockServerPass');

    this.draftForm.activeGuestTab = this.activeGuestTab;
    this.draftForm.loginTargetWs = this.loginTargetWs;
    this.saveDraftToStorage();
  }

  clearDraft({ keepUsername = true } = {}) {
    const savedUser = keepUsername ? (this.draftForm.loginUsername || '') : '';
    this.draftForm = {
      ...this.draftForm,
      activeGuestTab: 'login',
      loginUsername: savedUser,
      loginPassword: '',
      loginServerPass: '',
      loginReadonly: false,
      regUsername: '',
      regDisplay: '',
      regRole: 'teknisi',
      regPassword: '',
      regServerPass: '',
      unlockServerPass: ''
    };
    this.activeGuestTab = 'login';
    this.saveDraftToStorage();
  }

  isOpen() {
    return Boolean(this.modalEl && this.modalEl.style.display === 'flex');
  }

  show(initialTab = 'login') {
    this.loadDraftFromStorage();
    const hasRegDraft = Boolean(
      this.draftForm.regUsername ||
      this.draftForm.regDisplay ||
      this.draftForm.regPassword ||
      this.draftForm.regServerPass
    );
    if (initialTab === 'register') {
      this.activeGuestTab = 'register';
    } else if (this.draftForm.activeGuestTab === 'register' && hasRegDraft) {
      this.activeGuestTab = 'register';
    } else {
      this.activeGuestTab = 'login';
    }
    this.loginTargetWs = this.draftForm.loginTargetWs || this.authManager?.getWorkspaceMode?.() || 'main';
    this.statusMessage = '';
    this.modalEl.style.display = 'flex';
    this.syncVisualViewportMetrics();
    this.render();
  }

  hide() {
    this.captureDraftFromDOM();
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
      this.modalEl.classList?.remove('is-keyboard-open');
    }
  }

  setStatus(message, tone = 'info') {
    this.statusMessage = message;
    this.statusTone = tone;
    const statusBox = this.modalEl.querySelector('#auth-modal-status-msg');
    if (statusBox) {
      statusBox.textContent = message;
      statusBox.className = `auth-status-banner is-${tone}`;
      statusBox.style.display = message ? 'block' : 'none';
    }
  }

  hasGuestCanvasContent() {
    return (this.deviceManager?.getAllDevices?.()?.length || 0) > 0 ||
      (this.cableManager?.getAllConnections?.()?.length || 0) > 0;
  }

  formatBackendLabel() {
    if (this.authManager.storageBackend === 'mysql') return 'MySQL Database Server';
    if (this.authManager.storageBackend === 'file') return 'Node.js Server Storage';
    return 'Browser Lokal Offline';
  }

  async handlePostLoginLoad(preserveGuestCanvas = false) {
    const hasGuestWork = preserveGuestCanvas && this.hasGuestCanvasContent();
    if (hasGuestWork && this.authManager.canWriteActiveWorkspace()) {
      await this.projectStorage.saveCurrentProject();
      this.setStatus('Rancangan kanvas saat ini berhasil disimpan ke akun/server.', 'success');
    } else {
      await this.projectStorage.loadActiveWorkspaceProject();
      if (hasGuestWork && !this.authManager.canWriteActiveWorkspace()) {
        this.setStatus('Server Utama sedang terkunci (Read-Only). Masukkan password server untuk menyimpan kanvas ke Server Utama.', 'info');
      }
    }
    this.historyManager?.initBaseline?.();
  }

  async render() {
    const isAuth = this.authManager.isAuthenticated();
    const user = this.authManager.getCurrentUser();
    const mainOwner = this.authManager.mainOwnerUsername || 'admin';

    if (!isAuth) {
      const hasWork = this.hasGuestCanvasContent();
      const isPublicPreview = this.authManager.isPublicPreviewActive?.();
      const targetWs = this.loginTargetWs === 'personal' ? 'personal' : 'main';

      this.modalEl.innerHTML = `
        <div class="auth-modal-card auth-glass-card">
          <button type="button" id="auth-btn-close" class="auth-glass-close" title="Tutup">
            <i data-lucide="x" style="width: 16px; height: 16px;"></i>
          </button>

          <div class="auth-brand-circle">
            <i data-lucide="network" style="width: 22px; height: 22px;"></i>
          </div>

          <h2 class="auth-glass-title">${this.activeGuestTab === 'login' ? 'Selamat datang' : 'Buat akun'}</h2>
          <p class="auth-glass-subtitle">
            ${this.activeGuestTab === 'login'
              ? 'Masuk ke workspace SmartSchool NetMap.'
              : 'Daftar akun teknisi atau admin server.'}
          </p>

          <div id="auth-modal-status-msg" class="auth-status-banner is-${this.statusTone}" style="display: ${this.statusMessage ? 'block' : 'none'};">
            ${escapeHtml(this.statusMessage)}
          </div>

          ${this.activeGuestTab === 'login' ? `
            <div class="auth-quick-pills" role="group" aria-label="Pilih Akses">
              <button type="button" id="auth-btn-view-public-main" class="auth-pill-btn ${isPublicPreview ? 'active' : ''}" title="Lihat Server Utama tanpa login (Read-Only)">
                <i data-lucide="eye" style="width: 15px; height: 15px;"></i>
                <span>Publik</span>
              </button>
              <button type="button" class="auth-pill-btn ${targetWs === 'main' ? 'active' : ''}" data-login-ws="main" title="Masuk ke Server Utama Tim">
                <i data-lucide="server" style="width: 15px; height: 15px;"></i>
                <span>Server</span>
              </button>
              <button type="button" class="auth-pill-btn ${targetWs === 'personal' ? 'active' : ''}" data-login-ws="personal" title="Masuk ke Workspace Pribadi">
                <i data-lucide="user" style="width: 15px; height: 15px;"></i>
                <span>Pribadi</span>
              </button>
            </div>

            <div class="auth-or-divider"><span>ATAU</span></div>

            <form id="auth-login-form" class="auth-glass-form">
              <div class="auth-form-grid">
                <div class="auth-glass-field">
                  <label for="auth-login-username">Username</label>
                  <input type="text" id="auth-login-username" value="${escapeHtml(this.draftForm.loginUsername)}" placeholder="Masukkan username..." autocomplete="username" required>
                </div>

                <div class="auth-glass-field">
                  <label for="auth-login-password">Password</label>
                  <div class="auth-pass-wrap">
                    <input type="password" id="auth-login-password" value="${escapeHtml(this.draftForm.loginPassword)}" placeholder="Masukkan password..." autocomplete="current-password" required>
                    <button type="button" class="auth-pass-toggle" data-toggle-pass="auth-login-password" title="Tampilkan / Sembunyikan">
                      <i data-lucide="eye" style="width: 15px; height: 15px;"></i>
                    </button>
                  </div>
                </div>
              </div>

              <div id="auth-login-server-pass-group" class="auth-glass-field" style="display: ${targetWs === 'main' ? 'flex' : 'none'};">
                <label for="auth-login-server-pass">Password Server Utama</label>
                <div class="auth-pass-wrap">
                  <input type="password" id="auth-login-server-pass" value="${escapeHtml(this.draftForm.loginServerPass)}" placeholder="Masukkan password server..." autocomplete="off" ${this.draftForm.loginReadonly ? 'disabled' : ''}>
                  <button type="button" class="auth-pass-toggle" data-toggle-pass="auth-login-server-pass" title="Tampilkan / Sembunyikan">
                    <i data-lucide="eye" style="width: 15px; height: 15px;"></i>
                  </button>
                </div>
              </div>

              <div class="auth-meta-row">
                <label id="auth-login-main-readonly-wrap" class="auth-check-inline" style="display: ${targetWs === 'main' ? 'inline-flex' : 'none'};">
                  <input type="checkbox" id="auth-login-main-readonly" ${this.draftForm.loginReadonly ? 'checked' : ''}>
                  <span>Lihat saja (Read-Only)</span>
                </label>
                ${isPublicPreview ? `
                  <button type="button" id="auth-btn-exit-public-preview" class="auth-subtle-link">Keluar Publik</button>
                ` : `
                  <button type="button" id="auth-btn-guest-close" class="auth-subtle-link">Mode Tamu</button>
                `}
              </div>

              ${hasWork ? `
                <label class="auth-check-inline">
                  <input type="checkbox" id="auth-preserve-canvas" ${this.draftForm.preserveCanvas !== false ? 'checked' : ''}>
                  <span>Simpan kanvas saat ini (${this.deviceManager.getAllDevices().length} dev)</span>
                </label>
              ` : ''}

              <button type="submit" id="auth-login-submit" class="auth-submit-btn">Masuk</button>
            </form>

            <div class="auth-glass-footer">
              <span>Belum punya akun?</span>
              <button type="button" class="auth-link-btn" data-auth-tab="register">Daftar</button>
            </div>
          ` : `
            <form id="auth-register-form" class="auth-glass-form">
              <div class="auth-glass-field">
                <label for="auth-reg-username">Username</label>
                <input type="text" id="auth-reg-username" value="${escapeHtml(this.draftForm.regUsername)}" placeholder="cth: teknisi3" autocomplete="username" required>
              </div>

              <div class="auth-two-col">
                <div class="auth-glass-field">
                  <label for="auth-reg-display">Nama Lengkap</label>
                  <input type="text" id="auth-reg-display" value="${escapeHtml(this.draftForm.regDisplay)}" placeholder="Nama teknisi" required>
                </div>
                <div class="auth-glass-field">
                  <label for="auth-reg-role">Peran</label>
                  <select id="auth-reg-role">
                    <option value="teknisi" ${this.draftForm.regRole !== 'admin' ? 'selected' : ''}>Teknisi</option>
                    <option value="admin" ${this.draftForm.regRole === 'admin' ? 'selected' : ''}>Admin</option>
                  </select>
                </div>
              </div>

              <div class="auth-glass-field">
                <label for="auth-reg-password">Password Akun</label>
                <div class="auth-pass-wrap">
                  <input type="password" id="auth-reg-password" value="${escapeHtml(this.draftForm.regPassword)}" placeholder="Min. 4 karakter" autocomplete="new-password" required>
                  <button type="button" class="auth-pass-toggle" data-toggle-pass="auth-reg-password" title="Tampilkan / Sembunyikan">
                    <i data-lucide="eye" style="width: 15px; height: 15px;"></i>
                  </button>
                </div>
              </div>

              <div class="auth-glass-field">
                <label for="auth-reg-server-pass">Password Server Utama</label>
                <div class="auth-pass-wrap">
                  <input type="password" id="auth-reg-server-pass" value="${escapeHtml(this.draftForm.regServerPass)}" placeholder="Wajib untuk Admin / edit server" autocomplete="off">
                  <button type="button" class="auth-pass-toggle" data-toggle-pass="auth-reg-server-pass" title="Tampilkan / Sembunyikan">
                    <i data-lucide="eye" style="width: 15px; height: 15px;"></i>
                  </button>
                </div>
              </div>

              ${hasWork ? `
                <label class="auth-check-inline">
                  <input type="checkbox" id="auth-preserve-canvas-reg" ${this.draftForm.preserveCanvasReg !== false ? 'checked' : ''}>
                  <span>Simpan kanvas saat ini</span>
                </label>
              ` : ''}

              <button type="submit" id="auth-reg-submit" class="auth-submit-btn">Daftar</button>
            </form>

            <div class="auth-glass-footer">
              <span>Sudah punya akun?</span>
              <button type="button" class="auth-link-btn" data-auth-tab="login">Masuk</button>
            </div>
          `}
        </div>
      `;
    } else {
      const wsMode = this.authManager.getWorkspaceMode();
      const isMainUnlocked = this.authManager.isMainWorkspaceUnlocked();
      const isMainAdmin = this.authManager.isMainServerAdmin();
      const backendText = this.formatBackendLabel();
      const technicians = await this.authManager.listTechnicians().catch(() => []);
      const lastSyncText = this.authManager.lastSyncedAt
        ? `${new Date(this.authManager.lastSyncedAt).toLocaleString('id-ID')}${this.authManager.lastUpdatedBy ? ` (@${this.authManager.lastUpdatedBy})` : ''}`
        : '-';

      this.modalEl.innerHTML = `
        <div class="auth-modal-card auth-glass-card auth-modal-card-wide">
          <div class="auth-modal-header">
            <div class="auth-modal-title-wrap">
              <span class="auth-modal-title">Workspace & Akun</span>
              <span class="auth-backend-pill">${escapeHtml(backendText)}</span>
            </div>
            <button type="button" id="auth-btn-close" class="btn btn-icon btn-sm" title="Tutup">
              <i data-lucide="x" style="width: 17px; height: 17px;"></i>
            </button>
          </div>

          <div class="auth-modal-body">
            <div class="auth-profile-banner">
              <div>
                <div class="auth-profile-name">${escapeHtml(user.displayName || user.username)}</div>
                <div class="auth-profile-meta">@${escapeHtml(user.username)} • ${escapeHtml(user.role || 'teknisi')} • Sync: ${escapeHtml(lastSyncText)}</div>
              </div>
              <button type="button" id="auth-btn-logout" class="btn btn-sm auth-logout-btn">Keluar</button>
            </div>

            <div id="auth-modal-status-msg" class="auth-status-banner is-${this.statusTone}" style="display: ${this.statusMessage ? 'block' : 'none'};">
              ${escapeHtml(this.statusMessage)}
            </div>

            <div class="auth-workspace-grid">
              <button type="button" class="auth-ws-card ${wsMode === 'main' ? 'active' : ''}" data-select-ws="main">
                <div class="auth-ws-title-row">
                  <span class="auth-ws-title">Server Utama</span>
                  <span class="auth-lock-badge ${isMainUnlocked ? 'is-unlocked' : 'is-locked'}">
                    <i data-lucide="${isMainUnlocked ? 'unlock' : 'lock'}" style="width: 11px; height: 11px;"></i>
                    <span>${isMainUnlocked ? 'Edit' : 'Read-Only'}</span>
                  </span>
                </div>
                <div class="auth-ws-desc">Template bersama (@${escapeHtml(mainOwner)})</div>
              </button>
              <button type="button" class="auth-ws-card ${wsMode === 'personal' ? 'active' : ''}" data-select-ws="personal">
                <div class="auth-ws-title-row">
                  <span class="auth-ws-title">Pribadi</span>
                  <span class="auth-lock-badge is-unlocked">
                    <i data-lucide="user" style="width: 11px; height: 11px;"></i>
                    <span>@${escapeHtml(user.username)}</span>
                  </span>
                </div>
                <div class="auth-ws-desc">Workspace privat akun ini</div>
              </button>
            </div>

            <div class="auth-security-box">
              <div class="auth-security-header">
                <span class="auth-security-title">
                  <i data-lucide="${isMainUnlocked ? 'shield-check' : 'lock'}" style="width: 14px; height: 14px;"></i>
                  <span>Akses Server Utama</span>
                </span>
                ${isMainUnlocked ? `
                  <button type="button" id="auth-btn-lock-server" class="btn btn-secondary btn-sm">Kunci Server</button>
                ` : ''}
              </div>
              ${isMainUnlocked ? '' : `
                <form id="auth-unlock-server-form" class="auth-inline-form">
                  <input type="password" id="auth-unlock-server-pass" value="${escapeHtml(this.draftForm.unlockServerPass)}" placeholder="Password akses Server Utama..." required>
                  <button type="submit" id="auth-btn-unlock-server" class="btn btn-primary btn-sm">Buka Kunci</button>
                </form>
              `}
            </div>

            <div class="auth-actions-grid">
              <button type="button" id="auth-btn-pull-main" class="btn btn-secondary btn-sm">Muat Server Utama</button>
              <button type="button" id="auth-btn-push-main" class="btn btn-primary btn-sm">Simpan ke Server Utama</button>
              <button type="button" id="auth-btn-clone-to-personal" class="btn btn-secondary btn-sm">Salin ke Pribadi</button>
              <button type="button" id="auth-btn-seed-sample" class="btn btn-secondary btn-sm">Contoh Kampus</button>
            </div>

            <div class="auth-security-box">
              <div class="auth-security-header">
                <span class="auth-security-title">
                  <i data-lucide="key-round" style="width: 14px; height: 14px;"></i>
                  <span>Password Server Utama</span>
                </span>
                <span class="auth-role-pill">Admin: @${escapeHtml(mainOwner)}</span>
              </div>
              ${isMainAdmin ? `
                <form id="auth-change-server-pass-form" class="auth-form" style="gap: 8px;">
                  <div class="auth-actions-grid">
                    <div class="auth-field">
                      <input type="password" id="auth-server-new-pass" placeholder="Password server baru..." required>
                    </div>
                    <div class="auth-field">
                      <input type="password" id="auth-server-confirm-pass" placeholder="Konfirmasi password..." required>
                    </div>
                  </div>
                  <div class="auth-inline-form">
                    <input type="password" id="auth-server-current-pass" placeholder="Password lama (opsional)">
                    <button type="submit" id="auth-btn-change-server-pass" class="btn btn-primary btn-sm">Ubah Password</button>
                  </div>
                </form>
              ` : `
                <div class="auth-ws-desc">Hanya @${escapeHtml(mainOwner)} / Admin yang dapat mengubah password server.</div>
              `}
            </div>

            <div class="auth-section-label">Teknisi Terdaftar (${technicians.length})</div>
            <div class="auth-users-list">
              ${technicians.map((t) => `
                <div class="auth-user-row ${t.username === user.username ? 'is-self' : ''}">
                  <div>
                    <strong>${escapeHtml(t.displayName || t.username)}</strong>
                    <span class="auth-user-handle">@${escapeHtml(t.username)}</span>
                  </div>
                  <span class="auth-role-pill">${escapeHtml(t.role || 'teknisi')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    this.bindRenderedEvents();
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({ nodes: [this.modalEl] });
    }
  }

  bindRenderedEvents() {
    this.modalEl.querySelector('#auth-btn-close')?.addEventListener('click', () => this.hide());
    this.modalEl.querySelector('#auth-btn-guest-close')?.addEventListener('click', () => this.hide());

    this.modalEl.querySelectorAll('input, select, textarea').forEach((fieldEl) => {
      const saveDraft = () => this.captureDraftFromDOM();
      fieldEl.addEventListener('input', saveDraft);
      fieldEl.addEventListener('change', saveDraft);
      fieldEl.addEventListener('focus', (ev) => {
        this.syncVisualViewportMetrics();
        const targetEl = ev.currentTarget || ev.target;
        setTimeout(() => {
          targetEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }, 100);
      });
    });

    this.modalEl.querySelectorAll('[data-auth-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.captureDraftFromDOM();
        this.activeGuestTab = btn.getAttribute('data-auth-tab') === 'register' ? 'register' : 'login';
        this.draftForm.activeGuestTab = this.activeGuestTab;
        this.saveDraftToStorage();
        this.statusMessage = '';
        this.render();
      });
    });

    this.modalEl.querySelectorAll('[data-toggle-pass]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-toggle-pass');
        const input = targetId ? this.modalEl.querySelector(`#${targetId}`) : null;
        if (!input) return;
        const nextType = input.type === 'password' ? 'text' : 'password';
        input.type = nextType;
        btn.innerHTML = `<i data-lucide="${nextType === 'password' ? 'eye' : 'eye-off'}" style="width: 15px; height: 15px;"></i>`;
        if (window.lucide?.createIcons) {
          window.lucide.createIcons({ nodes: [btn] });
        }
      });
    });

    this.modalEl.querySelector('#auth-btn-view-public-main')?.addEventListener('click', async () => {
      await this.projectStorage.loadPublicMainWorkspaceProject();
      this.historyManager?.initBaseline?.();
      this.hide();
    });

    this.modalEl.querySelector('#auth-btn-exit-public-preview')?.addEventListener('click', () => {
      this.authManager.setPublicPreviewMode(false);
      this.projectStorage.clearCanvasToEmpty('SmartSchool NetMap');
      this.historyManager?.initBaseline?.();
      this.statusMessage = '';
      this.render();
    });

    const serverPassGroup = this.modalEl.querySelector('#auth-login-server-pass-group');
    const readonlyWrap = this.modalEl.querySelector('#auth-login-main-readonly-wrap');
    const serverPassInput = this.modalEl.querySelector('#auth-login-server-pass');
    const readonlyCheck = this.modalEl.querySelector('#auth-login-main-readonly');

    this.modalEl.querySelectorAll('[data-login-ws]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ws = btn.getAttribute('data-login-ws') === 'personal' ? 'personal' : 'main';
        this.loginTargetWs = ws;
        this.draftForm.loginTargetWs = ws;
        this.saveDraftToStorage();
        this.modalEl.querySelectorAll('[data-login-ws]').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-login-ws') === ws);
        });
        if (serverPassGroup) {
          serverPassGroup.style.display = ws === 'main' ? 'flex' : 'none';
        }
        if (readonlyWrap) {
          readonlyWrap.style.display = ws === 'main' ? 'inline-flex' : 'none';
        }
      });
    });

    readonlyCheck?.addEventListener('change', () => {
      if (serverPassInput) {
        serverPassInput.disabled = readonlyCheck.checked;
        if (!readonlyCheck.checked) {
          serverPassInput.focus();
        }
      }
      this.captureDraftFromDOM();
    });

    this.modalEl.querySelector('#auth-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = this.modalEl.querySelector('#auth-login-username')?.value.trim() || '';
      const password = this.modalEl.querySelector('#auth-login-password')?.value || '';
      const targetWs = this.loginTargetWs === 'personal' ? 'personal' : 'main';
      const serverPass = serverPassInput?.value || '';
      const readOnlyJoin = Boolean(readonlyCheck?.checked);
      const preserve = Boolean(this.modalEl.querySelector('#auth-preserve-canvas')?.checked);

      try {
        await this.authManager.login(username, password, {
          workspacePassword: serverPass,
          requireMainUnlock: targetWs === 'main' && !readOnlyJoin
        });
        this.authManager.setWorkspaceMode(targetWs);
        await this.handlePostLoginLoad(preserve);
        this.clearDraft({ keepUsername: true });
        this.render();
      } catch (err) {
        this.setStatus(err.message || 'Gagal login.', 'error');
      }
    });

    this.modalEl.querySelector('#auth-register-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = this.modalEl.querySelector('#auth-reg-username')?.value.trim() || '';
      const displayName = this.modalEl.querySelector('#auth-reg-display')?.value.trim() || '';
      const role = this.modalEl.querySelector('#auth-reg-role')?.value || 'teknisi';
      const password = this.modalEl.querySelector('#auth-reg-password')?.value || '';
      const serverPass = this.modalEl.querySelector('#auth-reg-server-pass')?.value || '';
      const preserve = Boolean(this.modalEl.querySelector('#auth-preserve-canvas-reg')?.checked);

      try {
        await this.authManager.register({
          username,
          displayName,
          password,
          role,
          workspacePassword: serverPass,
          requireMainUnlock: false
        });
        this.authManager.setWorkspaceMode('main');
        await this.handlePostLoginLoad(preserve);
        this.clearDraft({ keepUsername: true });
        this.render();
      } catch (err) {
        this.setStatus(err.message || 'Gagal mendaftar.', 'error');
      }
    });

    this.modalEl.querySelector('#auth-btn-logout')?.addEventListener('click', async () => {
      await this.authManager.logout();
      this.projectStorage.clearCanvasToEmpty('SmartSchool NetMap');
      this.historyManager?.initBaseline?.();
      this.statusMessage = 'Anda telah keluar. Kanvas kembali ke Mode Tamu (kosong).';
      this.statusTone = 'info';
      this.render();
    });

    this.modalEl.querySelectorAll('[data-select-ws]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-select-ws');
        if (!mode || mode === this.authManager.getWorkspaceMode()) return;
        if (this.authManager.canWriteActiveWorkspace()) {
          await this.projectStorage.saveCurrentProject();
        }
        this.authManager.setWorkspaceMode(mode);
        await this.projectStorage.loadActiveWorkspaceProject();
        this.historyManager?.initBaseline?.();
        if (mode === 'main') {
          this.setStatus(
            this.authManager.isMainWorkspaceUnlocked()
              ? 'Beralih ke Server Utama (Akses Edit Terbuka).'
              : 'Beralih ke Server Utama (Lihat Publik / Terkunci). Masukkan password server untuk mengedit.',
            this.authManager.isMainWorkspaceUnlocked() ? 'success' : 'info'
          );
        } else {
          this.setStatus(`Beralih ke Akun Pribadi (@${this.authManager.getCurrentUser()?.username}).`, 'success');
        }
        this.render();
      });
    });

    this.modalEl.querySelector('#auth-unlock-server-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const serverPass = this.modalEl.querySelector('#auth-unlock-server-pass')?.value || '';
      try {
        await this.authManager.unlockMainWorkspace(serverPass);
        this.projectStorage.updateStatusIndicator(
          this.authManager.canWriteActiveWorkspace() ? 'saved' : 'readonly-main'
        );
        this.draftForm.unlockServerPass = '';
        this.saveDraftToStorage();
        this.statusMessage = 'Password server valid. Akses edit & simpan ke Server Utama sekarang terbuka!';
        this.statusTone = 'success';
        this.render();
      } catch (err) {
        this.setStatus(err.message || 'Password akses Server Utama salah.', 'error');
      }
    });

    this.modalEl.querySelector('#auth-btn-lock-server')?.addEventListener('click', async () => {
      await this.authManager.lockMainWorkspace();
      this.projectStorage.updateStatusIndicator(
        this.authManager.canWriteActiveWorkspace() ? 'saved' : 'readonly-main'
      );
      this.statusMessage = 'Akses edit Server Utama dikunci kembali (mode Lihat Publik / Read-Only).';
      this.statusTone = 'info';
      this.render();
    });

    this.modalEl.querySelector('#auth-change-server-pass-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = this.modalEl.querySelector('#auth-server-new-pass')?.value || '';
      const confirmPass = this.modalEl.querySelector('#auth-server-confirm-pass')?.value || '';
      const currentPass = this.modalEl.querySelector('#auth-server-current-pass')?.value || '';
      if (newPass !== confirmPass) {
        this.setStatus('Konfirmasi password server baru tidak cocok.', 'error');
        return;
      }
      try {
        await this.authManager.changeMainWorkspacePassword(newPass, currentPass);
        this.statusMessage = 'Password akses Server Utama berhasil diperbarui. Teknisi lain wajib memasukkan password baru saat mengakses Server Utama.';
        this.statusTone = 'success';
        this.render();
      } catch (err) {
        this.setStatus(err.message || 'Gagal mengubah password Server Utama.', 'error');
      }
    });

    this.modalEl.querySelector('#auth-btn-pull-main')?.addEventListener('click', async () => {
      this.authManager.setWorkspaceMode('main');
      const res = await this.projectStorage.loadActiveWorkspaceProject();
      this.historyManager?.initBaseline?.();
      this.statusMessage = res.loaded
        ? (this.authManager.isMainWorkspaceUnlocked()
            ? 'Konfigurasi terbaru dari Server Utama berhasil dimuat.'
            : 'Server Utama dimuat (Read-Only). Masukkan password server untuk mengedit.')
        : 'Server Utama masih kosong.';
      this.statusTone = res.loaded ? (this.authManager.isMainWorkspaceUnlocked() ? 'success' : 'info') : 'info';
      this.render();
    });

    this.modalEl.querySelector('#auth-btn-push-main')?.addEventListener('click', async () => {
      if (!this.authManager.isMainWorkspaceUnlocked()) {
        this.setStatus('Server Utama masih terkunci. Masukkan Password Akses Server Utama di atas terlebih dahulu.', 'error');
        return;
      }
      try {
        const projectData = this.projectStorage.serializeProject();
        projectData.workspaceKey = 'main';
        await this.authManager.saveWorkspaceProject('main', projectData);
        this.authManager.setWorkspaceMode('main');
        this.projectStorage.updateStatusIndicator('saved');
        this.statusMessage = 'Kanvas saat ini berhasil dipublikasikan ke Server Utama untuk seluruh teknisi.';
        this.statusTone = 'success';
        this.render();
      } catch (err) {
        this.setStatus(err.message || 'Gagal menyimpan ke Server Utama.', 'error');
      }
    });

    this.modalEl.querySelector('#auth-btn-clone-to-personal')?.addEventListener('click', async () => {
      const user = this.authManager.getCurrentUser();
      if (!user) return;
      try {
        const res = await this.authManager.copyWorkspaceProject('main', `user_${user.username}`);
        this.authManager.setWorkspaceMode('personal');
        if (res?.projectData) {
          this.projectStorage.deserializeProject(res.projectData);
          this.historyManager?.initBaseline?.();
        }
        this.statusMessage = 'Template Server Utama berhasil disalin ke Akun Pribadi Anda.';
        this.statusTone = 'success';
        this.render();
      } catch (err) {
        this.setStatus(err.message || 'Gagal menyalin Server Utama.', 'error');
      }
    });

    this.modalEl.querySelector('#auth-btn-seed-sample')?.addEventListener('click', async () => {
      if (typeof this.onSeedSample === 'function') {
        this.onSeedSample();
        const saved = await this.projectStorage.saveCurrentProject();
        this.historyManager?.initBaseline?.();
        this.statusMessage = saved
          ? 'Contoh topologi kampus dimuat & disimpan ke workspace aktif.'
          : 'Contoh topologi dimuat dalam pratinjau (buka kunci Server Utama atau pilih Akun Pribadi untuk menyimpan).';
        this.statusTone = saved ? 'success' : 'info';
        this.render();
      }
    });
  }
}
