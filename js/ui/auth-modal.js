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
    if (hasGuestWork) {
      await this.projectStorage.saveCurrentProject();
      this.setStatus('Rancangan kanvas saat ini berhasil disimpan ke akun/server.', 'success');
    } else {
      await this.projectStorage.loadActiveWorkspaceProject();
    }
    this.historyManager?.initBaseline?.();
  }

  async render() {
    const isAuth = this.authManager.isAuthenticated();
    const user = this.authManager.getCurrentUser();
    const backendText = this.formatBackendLabel();

    if (!isAuth) {
      const hasWork = this.hasGuestCanvasContent();
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
              Saat ini Anda berada di <strong>Mode Tamu</strong>. Anda bebas memakai seluruh fitur peta 2D/3D, namun data tidak tersimpan sebelum login ke akun teknisi atau <strong>Server Utama</strong>.
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
                  <label for="auth-login-password">Password</label>
                  <input type="password" id="auth-login-password" placeholder="Masukkan password..." autocomplete="current-password" required>
                </div>
                <div class="auth-field">
                  <label>Masuk ke Workspace Setelah Login</label>
                  <select id="auth-login-target-ws">
                    <option value="main" ${this.authManager.getWorkspaceMode() === 'main' ? 'selected' : ''}>Server Utama (Template Bersama Tim)</option>
                    <option value="personal" ${this.authManager.getWorkspaceMode() === 'personal' ? 'selected' : ''}>Workspace Pribadi Akun Ini</option>
                  </select>
                </div>
                ${hasWork ? `
                  <label class="auth-checkbox-row">
                    <input type="checkbox" id="auth-preserve-canvas" checked>
                    <span>Simpan rancangan kanvas tamu saat ini (${this.deviceManager.getAllDevices().length} perangkat) setelah masuk</span>
                  </label>
                ` : ''}
                <button type="submit" id="auth-login-submit" class="btn btn-primary btn-sm" style="width: 100%; justify-content: center; height: 34px;">
                  Masuk & Hubungkan Data
                </button>
              </form>

              <div class="auth-demo-box">
                <div class="auth-demo-label">Isi Cepat Akun Demo Bawaan:</div>
                <div class="auth-demo-pills">
                  <button type="button" class="btn btn-secondary btn-sm" data-demo-user="admin" data-demo-pass="admin123">admin</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-demo-user="teknisi1" data-demo-pass="teknisi123">teknisi1</button>
                  <button type="button" class="btn btn-secondary btn-sm" data-demo-user="teknisi2" data-demo-pass="teknisi123">teknisi2</button>
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
                    <option value="admin">Admin Utama</option>
                  </select>
                </div>
                <div class="auth-field">
                  <label for="auth-reg-password">Password (minimal 4 karakter)</label>
                  <input type="password" id="auth-reg-password" placeholder="Buat password..." required>
                </div>
                ${hasWork ? `
                  <label class="auth-checkbox-row">
                    <input type="checkbox" id="auth-preserve-canvas-reg" checked>
                    <span>Simpan rancangan kanvas tamu saat ini setelah mendaftar</span>
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
                <div class="auth-ws-title">Server Utama (Main Template)</div>
                <div class="auth-ws-desc">Template utama bersama. Perubahan tersimpan & dapat diakses seluruh akun teknisi lain.</div>
              </button>
              <button type="button" class="auth-ws-card ${wsMode === 'personal' ? 'active' : ''}" data-select-ws="personal">
                <div class="auth-ws-title">Akun Pribadi (@${escapeHtml(user.username)})</div>
                <div class="auth-ws-desc">Penyimpanan pribadi khusus akun ini untuk draf atau topologi terpisah.</div>
              </button>
            </div>

            <div class="auth-sync-meta">
              Sinkronisasi terakhir: <strong>${escapeHtml(lastSyncText)}</strong>
            </div>

            <div class="auth-section-label">Sinkronisasi Template & Kolaborasi Tim</div>
            <div class="auth-actions-grid">
              <button type="button" id="auth-btn-pull-main" class="btn btn-secondary btn-sm">
                Muat Ulang dari Server Utama
              </button>
              <button type="button" id="auth-btn-push-main" class="btn btn-primary btn-sm">
                Simpan Kanvas Ini ke Server Utama
              </button>
              <button type="button" id="auth-btn-clone-to-personal" class="btn btn-secondary btn-sm">
                Salin Server Utama ke Akun Saya
              </button>
              <button type="button" id="auth-btn-seed-sample" class="btn btn-secondary btn-sm">
                Muat Contoh Topologi Kampus
              </button>
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

    this.modalEl.querySelectorAll('[data-demo-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uInput = this.modalEl.querySelector('#auth-login-username');
        const pInput = this.modalEl.querySelector('#auth-login-password');
        if (uInput) uInput.value = btn.getAttribute('data-demo-user') || '';
        if (pInput) pInput.value = btn.getAttribute('data-demo-pass') || '';
        uInput?.focus();
      });
    });

    this.modalEl.querySelector('#auth-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = this.modalEl.querySelector('#auth-login-username')?.value.trim() || '';
      const password = this.modalEl.querySelector('#auth-login-password')?.value || '';
      const targetWs = this.modalEl.querySelector('#auth-login-target-ws')?.value || 'main';
      const preserve = Boolean(this.modalEl.querySelector('#auth-preserve-canvas')?.checked);
      try {
        this.authManager.setWorkspaceMode(targetWs);
        await this.authManager.login(username, password);
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
      const preserve = Boolean(this.modalEl.querySelector('#auth-preserve-canvas-reg')?.checked);
      try {
        this.authManager.setWorkspaceMode('main');
        await this.authManager.register({ username, displayName, password, role });
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
        await this.projectStorage.saveCurrentProject();
        this.authManager.setWorkspaceMode(mode);
        await this.projectStorage.loadActiveWorkspaceProject();
        this.historyManager?.initBaseline?.();
        this.setStatus(
          mode === 'main'
            ? 'Beralih ke Server Utama (Template Bersama).'
            : `Beralih ke Akun Pribadi (@${this.authManager.getCurrentUser()?.username}).`,
          'success'
        );
        this.render();
      });
    });

    this.modalEl.querySelector('#auth-btn-pull-main')?.addEventListener('click', async () => {
      this.authManager.setWorkspaceMode('main');
      const res = await this.projectStorage.loadActiveWorkspaceProject();
      this.historyManager?.initBaseline?.();
      this.setStatus(
        res.loaded
          ? 'Konfigurasi terbaru dari Server Utama berhasil dimuat.'
          : 'Server Utama masih kosong. Tambahkan perangkat lalu simpan.',
        res.loaded ? 'success' : 'info'
      );
      this.render();
    });

    this.modalEl.querySelector('#auth-btn-push-main')?.addEventListener('click', async () => {
      const projectData = this.projectStorage.serializeProject();
      projectData.workspaceKey = 'main';
      await this.authManager.saveWorkspaceProject('main', projectData);
      this.authManager.setWorkspaceMode('main');
      this.projectStorage.updateStatusIndicator('saved');
      this.setStatus('Kanvas saat ini berhasil dipublikasikan ke Server Utama untuk seluruh teknisi.', 'success');
      this.render();
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
        this.setStatus('Template Server Utama berhasil disalin ke Akun Pribadi Anda.', 'success');
        this.render();
      } catch (err) {
        this.setStatus(err.message || 'Gagal menyalin Server Utama.', 'error');
      }
    });

    this.modalEl.querySelector('#auth-btn-seed-sample')?.addEventListener('click', async () => {
      if (typeof this.onSeedSample === 'function') {
        this.onSeedSample();
        await this.projectStorage.saveCurrentProject();
        this.historyManager?.initBaseline?.();
        this.setStatus('Contoh topologi kampus dimuat & disimpan ke workspace aktif.', 'success');
        this.render();
      }
    });
  }
}
