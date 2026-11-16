/**
 * SmartSchool NetMap — Multi-Technician Account & Main Server Workspace Modal
 * Handles Guest-to-Account Login, Technician Registration,
 * Workspace Switching ("Server Utama" shared template vs "Akun Pribadi"),
 * and 1-click template synchronization across multiple technicians.
 */

import { eventBus } from '../core/event-bus.js';

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

    this.activeGuestTab = 'login'; // 'login' | 'register'
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

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.hide();
      }
    });
  }

  bindGlobalEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.hide();
      }
    });

    eventBus.on('auth:changed', () => {
      if (this.isOpen()) {
        this.render();
      }
    });
  }

  isOpen() {
    return Boolean(this.modalEl && this.modalEl.style.display === 'flex');
  }

  show(initialTab = 'login') {
    this.activeGuestTab = initialTab === 'register' ? 'register' : 'login';
    this.statusMessage = '';
    this.modalEl.style.display = 'flex';
    this.render();
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
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
    const backendText = this.formatBackendLabel();
    const mainOwner = this.authManager.mainOwnerUsername || 'admin';

    if (!isAuth) {
      const hasWork = this.hasGuestCanvasContent();
      const isPublicPreview = this.authManager.isPublicPreviewActive?.();
      const defaultTargetWs = this.authManager.getWorkspaceMode();
      this.modalEl.innerHTML = `
        <div class="auth-modal-card">
          <div class="auth-modal-header">
            <div class="auth-modal-title-wrap">
              <span class="auth-modal-title">Akun Teknisi & Server Utama</span>
              <span class="auth-backend-pill">${escapeHtml(backendText)}</span>
            </div>
            <button type="button" id="auth-btn-close" class="btn btn-icon btn-sm" title="Tutup">
              <i data-lucide="x" style="width: 17px; height: 17px;"></i>
            </button>
          </div>

          <div class="auth-modal-body">
            <div class="auth-guest-notice">
              ${isPublicPreview
                ? `Anda sedang melihat <strong>Server Utama</strong> dalam mode <strong>Lihat Publik (Read-Only)</strong>. Anda tetap perlu login akun dan memasukkan <strong>Password Server Utama</strong> untuk mengedit atau menyimpan perubahan.`
                : `Saat ini Anda berada di <strong>Mode Tamu</strong>. Anda bebas memakai fitur peta 2D/3D atau melihat <strong>Server Utama</strong> secara publik, namun data tidak tersimpan sebelum login & membuka akses server.`
              }
              <div class="auth-public-preview-actions">
                ${isPublicPreview ? `
                  <button type="button" id="auth-btn-exit-public-preview" class="btn btn-secondary btn-sm">
                    <i data-lucide="arrow-left" style="width: 13px; height: 13px;"></i>
                    <span>Kembali ke Kanvas Kosong</span>
                  </button>
                ` : `
                  <button type="button" id="auth-btn-view-public-main" class="btn btn-secondary btn-sm">
                    <i data-lucide="eye" style="width: 13px; height: 13px;"></i>
                    <span>Lihat Publik Server Utama (Read-Only)</span>
                  </button>
                `}
              </div>
            </div>

            <div id="auth-modal-status-msg" class="auth-status-banner is-${this.statusTone}" style="display: ${this.statusMessage ? 'block' : 'none'};">
              ${escapeHtml(this.statusMessage)}
            </div>

            <div class="auth-tab-bar">
              <button type="button" class="auth-tab-btn ${this.activeGuestTab === 'login' ? 'active' : ''}" data-auth-tab="login">Masuk Akun</button>
              <button type="button" class="auth-tab-btn ${this.activeGuestTab === 'register' ? 'active' : ''}" data-auth-tab="register">Daftar Teknisi Baru</button>
            </div>

            ${this.activeGuestTab === 'login' ? `
              <form id="auth-login-form" class="auth-form">
                <div class="auth-field">
                  <label for="auth-login-username">Username Teknisi</label>
                  <input type="text" id="auth-login-username" placeholder="admin / teknisi1 / teknisi2" autocomplete="username" required>
                </div>
                <div class="auth-field">
                  <label for="auth-login-password">Password Akun Teknisi</label>
                  <input type="password" id="auth-login-password" placeholder="Masukkan password akun..." autocomplete="current-password" required>
                </div>
                <div class="auth-field">
                  <label for="auth-login-target-ws">Masuk ke Workspace Setelah Login</label>
                  <select id="auth-login-target-ws">
                    <option value="main" ${defaultTargetWs === 'main' ? 'selected' : ''}>Server Utama (Template Bersama Tim)</option>
                    <option value="personal" ${defaultTargetWs === 'personal' ? 'selected' : ''}>Workspace Pribadi Akun Ini</option>
                  </select>
                </div>
                <div id="auth-login-server-pass-group" class="auth-security-box" style="display: ${defaultTargetWs === 'main' ? 'flex' : 'none'};">
                  <div class="auth-field">
                    <label for="auth-login-server-pass">
                      <i data-lucide="lock" style="width: 12px; height: 12px; vertical-align: middle;"></i>
                      Password Akses Server Utama
                    </label>
                    <input type="password" id="auth-login-server-pass" placeholder="Masukkan password Server Utama (dikelola @${escapeHtml(mainOwner)})" autocomplete="off">
                  </div>
                  <label class="auth-checkbox-row">
                    <input type="checkbox" id="auth-login-main-readonly">
                    <span>Masuk untuk Lihat Publik saja (Read-Only) tanpa password server</span>
                  </label>
                </div>
                ${hasWork ? `
                  <label class="auth-checkbox-row">
                    <input type="checkbox" id="auth-preserve-canvas" checked>
                    <span>Simpan rancangan kanvas saat ini (${this.deviceManager.getAllDevices().length} perangkat) jika workspace dapat ditulis</span>
                  </label>
                ` : ''}
                <button type="submit" id="auth-login-submit" class="btn btn-primary btn-sm" style="width: 100%; justify-content: center; height: 34px;">
                  Masuk & Hubungkan Data
                </button>
              </form>

              <div class="auth-demo-box">
                <div class="auth-demo-label">Isi Cepat Akun Demo & Password Server Default (server123):</div>
                <div class="auth-demo-pills">
                  <button type="button" class="btn btn-secondary btn-sm" data-demo-user="admin" data-demo-pass="admin123" data-demo-server="server123">admin (Pembuat Server)</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-demo-user="teknisi1" data-demo-pass="teknisi123">teknisi1</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-demo-user="teknisi2" data-demo-pass="teknisi123">teknisi2</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-fill-server-pass="server123">Pass Server: server123</button>
                </div>
              </div>
            ` : `
              <form id="auth-register-form" class="auth-form">
                <div class="auth-field">
                  <label for="auth-reg-username">Username (tanpa spasi)</label>
                  <input type="text" id="auth-reg-username" placeholder="cth: teknisi3" required>
                </div>
                <div class="auth-field">
                  <label for="auth-reg-display">Nama Lengkap Teknisi</label>
                  <input type="text" id="auth-reg-display" placeholder="cth: Budi Santoso (NOC)" required>
                </div>
                <div class="auth-field">
                  <label for="auth-reg-role">Peran / Jabatan</label>
                  <select id="auth-reg-role">
                    <option value="teknisi" selected>Teknisi Jaringan</option>
                    <option value="admin">Admin Utama (Butuh Password Server)</option>
                  </select>
                </div>
                <div class="auth-field">
                  <label for="auth-reg-password">Password Akun (minimal 4 karakter)</label>
                  <input type="password" id="auth-reg-password" placeholder="Buat password akun..." required>
                </div>
                <div class="auth-field">
                  <label for="auth-reg-server-pass">Password Akses Server Utama (wajib untuk Admin Utama / buka edit server)</label>
                  <input type="password" id="auth-reg-server-pass" placeholder="Opsional untuk teknisi (kosongkan = Read-Only)" autocomplete="off">
                </div>
                ${hasWork ? `
                  <label class="auth-checkbox-row">
                    <input type="checkbox" id="auth-preserve-canvas-reg" checked>
                    <span>Simpan rancangan kanvas saat ini setelah mendaftar</span>
                  </label>
                ` : ''}
                <button type="submit" id="auth-reg-submit" class="btn btn-primary btn-sm" style="width: 100%; justify-content: center; height: 34px;">
                  Daftar Akun & Masuk
                </button>
              </form>
            `}
          </div>
        </div>
      `;
    } else {
      const wsMode = this.authManager.getWorkspaceMode();
      const isMainUnlocked = this.authManager.isMainWorkspaceUnlocked();
      const isMainAdmin = this.authManager.isMainServerAdmin();
      const technicians = await this.authManager.listTechnicians().catch(() => []);
      const lastSyncText = this.authManager.lastSyncedAt
        ? `${new Date(this.authManager.lastSyncedAt).toLocaleString('id-ID')}${this.authManager.lastUpdatedBy ? ` oleh @${this.authManager.lastUpdatedBy}` : ''}`
        : 'Belum ada penyimpanan';

      this.modalEl.innerHTML = `
        <div class="auth-modal-card auth-modal-card-wide">
          <div class="auth-modal-header">
            <div class="auth-modal-title-wrap">
              <span class="auth-modal-title">Workspace Teknisi & Server Utama</span>
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
                <div class="auth-profile-meta">@${escapeHtml(user.username)} • Role: ${escapeHtml(user.role || 'teknisi')}</div>
              </div>
              <button type="button" id="auth-btn-logout" class="btn btn-sm auth-logout-btn">Keluar Akun (Mode Tamu)</button>
            </div>

            <div id="auth-modal-status-msg" class="auth-status-banner is-${this.statusTone}" style="display: ${this.statusMessage ? 'block' : 'none'};">
              ${escapeHtml(this.statusMessage)}
            </div>

            <div class="auth-section-label">Target Penyimpanan Otomatis Saat Ini</div>
            <div class="auth-workspace-grid">
              <button type="button" class="auth-ws-card ${wsMode === 'main' ? 'active' : ''}" data-select-ws="main">
                <div class="auth-ws-title-row">
                  <span class="auth-ws-title">Server Utama (Main Template)</span>
                  <span class="auth-lock-badge ${isMainUnlocked ? 'is-unlocked' : 'is-locked'}">
                    <i data-lucide="${isMainUnlocked ? 'unlock' : 'lock'}" style="width: 11px; height: 11px;"></i>
                    <span>${isMainUnlocked ? 'Edit Terbuka' : 'Lihat Publik'}</span>
                  </span>
                </div>
                <div class="auth-ws-desc">
                  ${isMainUnlocked
                    ? `Akses edit terbuka. Perubahan tersimpan ke Server Utama (pemilik: @${escapeHtml(mainOwner)}).`
                    : `Dilindungi password server (oleh @${escapeHtml(mainOwner)}). Anda tetap bisa melihat publik (Read-Only).`
                  }
                </div>
              </button>
              <button type="button" class="auth-ws-card ${wsMode === 'personal' ? 'active' : ''}" data-select-ws="personal">
                <div class="auth-ws-title-row">
                  <span class="auth-ws-title">Akun Pribadi (@${escapeHtml(user.username)})</span>
                  <span class="auth-lock-badge is-unlocked">
                    <i data-lucide="user" style="width: 11px; height: 11px;"></i>
                    <span>Pribadi</span>
                  </span>
                </div>
                <div class="auth-ws-desc">Penyimpanan pribadi khusus akun ini untuk draf atau topologi terpisah.</div>
              </button>
            </div>

            <div class="auth-security-box">
              <div class="auth-security-header">
                <span class="auth-security-title">
                  <i data-lucide="${isMainUnlocked ? 'shield-check' : 'lock'}" style="width: 14px; height: 14px;"></i>
                  <span>Keamanan Akses Workspace Server Utama</span>
                </span>
                ${isMainUnlocked ? `
                  <button type="button" id="auth-btn-lock-server" class="btn btn-secondary btn-sm">Kunci Kembali Akses</button>
                ` : ''}
              </div>
              ${isMainUnlocked ? `
                <div class="auth-ws-desc">
                  Akses edit <strong>Server Utama</strong> saat ini sudah terbuka untuk sesi Anda. Setiap perubahan pada tab Server Utama otomatis tersimpan.
                </div>
              ` : `
                <form id="auth-unlock-server-form" class="auth-inline-form">
                  <input type="password" id="auth-unlock-server-pass" placeholder="Masukkan password akses Server Utama..." required>
                  <button type="submit" id="auth-btn-unlock-server" class="btn btn-primary btn-sm">Buka Kunci Server</button>
                </form>
                <div class="auth-ws-desc">
                  Server Utama tetap dapat dilihat secara publik, namun Anda wajib memasukkan password akses Server Utama untuk mengedit atau menyimpan perubahan ke server bersama.
                </div>
              `}
            </div>

            <div class="auth-sync-meta">
              Sinkronisasi terakhir: <strong>${escapeHtml(lastSyncText)}</strong>
            </div>

            <div class="auth-section-label">Sinkronisasi Template & Kolaborasi Tim</div>
            <div class="auth-actions-grid">
              <button type="button" id="auth-btn-pull-main" class="btn btn-secondary btn-sm">
                Muat Ulang dari Server Utama
              </button>
              <button type="button" id="auth-btn-push-main" class="btn btn-primary btn-sm" ${!isMainUnlocked ? 'title="Masukkan password akses Server Utama terlebih dahulu"' : ''}>
                Simpan Kanvas Ini ke Server Utama
              </button>
              <button type="button" id="auth-btn-clone-to-personal" class="btn btn-secondary btn-sm">
                Salin Server Utama ke Akun Saya
              </button>
              <button type="button" id="auth-btn-seed-sample" class="btn btn-secondary btn-sm">
                Muat Contoh Topologi Kampus
              </button>
            </div>

            <div class="auth-security-box">
              <div class="auth-security-header">
                <span class="auth-security-title">
                  <i data-lucide="key-round" style="width: 14px; height: 14px;"></i>
                  <span>Pengaturan Password Server Utama</span>
                </span>
                <span class="auth-role-pill">Pembuat: @${escapeHtml(mainOwner)}</span>
              </div>
              ${isMainAdmin ? `
                <form id="auth-change-server-pass-form" class="auth-form" style="gap: 8px;">
                  <div class="auth-actions-grid">
                    <div class="auth-field">
                      <label for="auth-server-new-pass">Password Server Baru (min 4 karakter)</label>
                      <input type="password" id="auth-server-new-pass" placeholder="Password baru..." required>
                    </div>
                    <div class="auth-field">
                      <label for="auth-server-confirm-pass">Konfirmasi Password Baru</label>
                      <input type="password" id="auth-server-confirm-pass" placeholder="Ulangi password baru..." required>
                    </div>
                  </div>
                  <div class="auth-inline-form">
                    <input type="password" id="auth-server-current-pass" placeholder="Password server saat ini (opsional verifikasi)">
                    <button type="submit" id="auth-btn-change-server-pass" class="btn btn-primary btn-sm">Ubah Password Server Utama</button>
                  </div>
                </form>
              ` : `
                <div class="auth-ws-desc">
                  Hanya <strong>Admin Utama / Pembuat Server (@${escapeHtml(mainOwner)})</strong> yang memiliki hak untuk mengubah password akses Server Utama.
                </div>
              `}
            </div>

            <div class="auth-section-label">Daftar Teknisi Terdaftar (${technicians.length})</div>
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

    this.modalEl.querySelectorAll('[data-auth-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeGuestTab = btn.getAttribute('data-auth-tab') || 'login';
        this.statusMessage = '';
        this.render();
      });
    });

    this.modalEl.querySelector('#auth-btn-view-public-main')?.addEventListener('click', async () => {
      const res = await this.projectStorage.loadPublicMainWorkspaceProject();
      this.historyManager?.initBaseline?.();
      this.statusMessage = res.loaded
        ? 'Server Utama ditampilkan dalam mode Lihat Publik (Read-Only). Login & masukkan password server untuk mengedit.'
        : 'Server Utama dibuka dalam mode Lihat Publik (saat ini masih kosong).';
      this.statusTone = 'info';
      this.render();
    });

    this.modalEl.querySelector('#auth-btn-exit-public-preview')?.addEventListener('click', () => {
      this.authManager.setPublicPreviewMode(false);
      this.projectStorage.clearCanvasToEmpty('SmartSchool NetMap');
      this.historyManager?.initBaseline?.();
      this.statusMessage = 'Kembali ke Mode Tamu (kanvas kosong).';
      this.statusTone = 'info';
      this.render();
    });

    const targetSelect = this.modalEl.querySelector('#auth-login-target-ws');
    const serverPassGroup = this.modalEl.querySelector('#auth-login-server-pass-group');
    targetSelect?.addEventListener('change', () => {
      if (serverPassGroup) {
        serverPassGroup.style.display = targetSelect.value === 'main' ? 'flex' : 'none';
      }
    });

    this.modalEl.querySelectorAll('[data-demo-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uInput = this.modalEl.querySelector('#auth-login-username');
        const pInput = this.modalEl.querySelector('#auth-login-password');
        const sInput = this.modalEl.querySelector('#auth-login-server-pass');
        if (uInput) uInput.value = btn.getAttribute('data-demo-user') || '';
        if (pInput) pInput.value = btn.getAttribute('data-demo-pass') || '';
        const demoSrv = btn.getAttribute('data-demo-server');
        if (sInput && demoSrv) sInput.value = demoSrv;
        uInput?.focus();
      });
    });

    this.modalEl.querySelectorAll('[data-fill-server-pass]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sInput = this.modalEl.querySelector('#auth-login-server-pass');
        const roCheck = this.modalEl.querySelector('#auth-login-main-readonly');
        if (sInput) {
          sInput.value = btn.getAttribute('data-fill-server-pass') || '';
          sInput.focus();
        }
        if (roCheck) roCheck.checked = false;
      });
    });

    this.modalEl.querySelector('#auth-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = this.modalEl.querySelector('#auth-login-username')?.value.trim() || '';
      const password = this.modalEl.querySelector('#auth-login-password')?.value || '';
      const targetWs = this.modalEl.querySelector('#auth-login-target-ws')?.value || 'main';
      const serverPass = this.modalEl.querySelector('#auth-login-server-pass')?.value || '';
      const readOnlyJoin = Boolean(this.modalEl.querySelector('#auth-login-main-readonly')?.checked);
      const preserve = Boolean(this.modalEl.querySelector('#auth-preserve-canvas')?.checked);

      try {
        await this.authManager.login(username, password, {
          workspacePassword: serverPass,
          requireMainUnlock: targetWs === 'main' && !readOnlyJoin
        });
        this.authManager.setWorkspaceMode(targetWs);
        await this.handlePostLoginLoad(preserve);
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
