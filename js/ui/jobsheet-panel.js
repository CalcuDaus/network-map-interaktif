/**
 * NetMap — Guided Jobsheet Modal, Floating Live Checklist HUD,
 * Teacher Custom Jobsheet Authoring Lite & Practice Sandbox Fork Dialog (Phase 9D)
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { uiIcon, escapeHtml } from '../utils/helpers.js';
import { EVALUATOR_TEMPLATES } from '../learning/jobsheet-catalog.js';
import { PdfReportGenerator } from '../export/pdf-report-generator.js';

export class JobsheetPanel {
  /**
   * @param {Object} options
   * @param {import('../learning/jobsheet-engine.js').JobsheetEngine} options.jobsheetEngine
   * @param {import('../storage/project-storage.js').ProjectStorage} options.projectStorage
   * @param {() => import('../map/map-3d-engine.js').Map3DEngine} [options.getMap3DEngine]
   * @param {() => import('../core/workspace-controller.js').WorkspaceController} [options.getWorkspaceController]
   */
  constructor({
    jobsheetEngine,
    projectStorage,
    getMap3DEngine = null,
    getWorkspaceController = null
  }) {
    this.jobsheetEngine = jobsheetEngine;
    this.projectStorage = projectStorage;
    this.getMap3DEngine = getMap3DEngine;
    this.getWorkspaceController = getWorkspaceController;

    this.modalEl = null;
    this.trackerEl = null;
    this.forkModalEl = null;
    this.activeTab = 'catalog'; // 'catalog' | 'author' | 'submit'
    this.isTrackerMinimized = false;
    this.expandedHintIds = new Set();

    if (typeof document !== 'undefined' && document.body) {
      this._createModalDOM();
      this._createTrackerDOM();
      this._createSandboxForkModalDOM();
      this._bindEvents();
    }
  }

  _createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'jobsheet-modal';
    this.modalEl.className = 'modal-overlay js-modal-overlay';
    this.modalEl.style.display = 'none';
    this.modalEl.innerHTML = `
      <div class="modal-card js-modal-card">
        <div class="modal-header js-modal-header">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            ${uiIcon('clipboard-list', 18)}
            <div style="min-width:0;">
              <div class="js-modal-title">Jobsheet Praktikum Jaringan SMK</div>
              <div class="js-modal-subtitle">Latihan terpandu auto-graded berbasis gedung nyata SMKN 1 Beringin (Mode Sandbox Aman)</div>
            </div>
          </div>
          <button type="button" id="btn-js-modal-close" class="btn btn-icon btn-sm" title="Tutup">
            ${uiIcon('x', 16)}
          </button>
        </div>

        <div class="js-tab-bar" role="tablist">
          <button type="button" class="js-tab-btn active" data-js-tab="catalog">
            ${uiIcon('book-open', 13)} <span>Katalog Jobsheet</span>
          </button>
          <button type="button" class="js-tab-btn" data-js-tab="author">
            ${uiIcon('upload', 13)} <span>Impor / Buat Tugas Guru</span>
          </button>
          <button type="button" class="js-tab-btn" data-js-tab="submit">
            ${uiIcon('award', 13)} <span>Kumpulkan &amp; Cetak Nilai</span>
          </button>
        </div>

        <div id="js-tab-body" class="js-tab-body"></div>
      </div>
    `;
    document.body.appendChild(this.modalEl);
  }

  _createTrackerDOM() {
    this.trackerEl = document.createElement('div');
    this.trackerEl.id = 'hud-jobsheet-tracker';
    this.trackerEl.className = 'hud-jobsheet-tracker hidden';
    this.trackerEl.style.display = 'none';
    const host = document.getElementById('map-viewport') || document.body;
    host.appendChild(this.trackerEl);
  }

  _createSandboxForkModalDOM() {
    this.forkModalEl = document.createElement('div');
    this.forkModalEl.id = 'sandbox-fork-modal';
    this.forkModalEl.className = 'modal-overlay js-modal-overlay';
    this.forkModalEl.style.display = 'none';
    this.forkModalEl.innerHTML = `
      <div class="modal-card js-fork-card">
        <div class="modal-header js-modal-header">
          <div style="display:flex;align-items:center;gap:8px;">
            ${uiIcon('flask', 17)}
            <div>
              <div class="js-modal-title">Salin ke Sandbox Praktik Aman</div>
              <div class="js-modal-subtitle">Peta Master SMKN 1 Beringin tetap 100% terlindungi dari perubahan</div>
            </div>
          </div>
          <button type="button" id="btn-fork-close" class="btn btn-icon btn-sm" title="Tutup">
            ${uiIcon('x', 15)}
          </button>
        </div>
        <div class="js-fork-body">
          <button type="button" id="btn-fork-keep-devices" class="js-fork-option">
            <div class="js-fork-icon">${uiIcon('network', 20)}</div>
            <div class="js-fork-text">
              <div class="js-fork-opt-title">Salin Gedung + Perangkat Sekolah</div>
              <div class="js-fork-opt-desc">Cocok untuk latihan troubleshooting, uji Ping, konfigurasi VLAN/CLI, dan ekspansi jaringan yang sudah ada.</div>
            </div>
          </button>
          <button type="button" id="btn-fork-buildings-only" class="js-fork-option">
            <div class="js-fork-icon">${uiIcon('building', 20)}</div>
            <div class="js-fork-text">
              <div class="js-fork-opt-title">Salin Gedung Sekolah Saja (Kosongkan Perangkat)</div>
              <div class="js-fork-opt-desc">Seluruh gedung 3D SMKN 1 Beringin tetap utuh, perangkat &amp; kabel dikosongkan agar Anda bisa merakit dari nol!</div>
            </div>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(this.forkModalEl);
  }

  _bindEvents() {
    this.modalEl?.querySelector('#btn-js-modal-close')?.addEventListener('click', () => this.hide());
    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.hide();
    });
    this.modalEl?.querySelectorAll('[data-js-tab]')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.getAttribute('data-js-tab') || 'catalog';
        this._syncTabUI();
        this._renderModalBody();
      });
    });

    this.forkModalEl?.querySelector('#btn-fork-close')?.addEventListener('click', () => this.hideSandboxForkDialog());
    this.forkModalEl?.addEventListener('click', (e) => {
      if (e.target === this.forkModalEl) this.hideSandboxForkDialog();
    });
    this.forkModalEl?.querySelector('#btn-fork-keep-devices')?.addEventListener('click', () => {
      this.projectStorage?.forkToPracticeSandbox?.({
        keepDevices: true,
        sandboxId: 'student_full',
        label: 'Sandbox Praktik'
      });
      this.hideSandboxForkDialog();
    });
    this.forkModalEl?.querySelector('#btn-fork-buildings-only')?.addEventListener('click', () => {
      this.projectStorage?.forkToPracticeSandbox?.({
        keepDevices: false,
        sandboxId: 'student_clean',
        label: 'Sandbox Gedung Kosong'
      });
      this.hideSandboxForkDialog();
    });

    eventBus.on('jobsheet:started', ({ evaluation }) => {
      this.expandedHintIds.clear();
      this.isTrackerMinimized = false;
      this.renderTracker(evaluation);
    });

    eventBus.on('jobsheet:evaluated', (evaluation) => {
      this.renderTracker(evaluation);
      if (this.modalEl?.style?.display === 'flex' && this.activeTab === 'submit') {
        this._renderModalBody();
      }
    });

    eventBus.on('jobsheet:stopped', () => {
      this.renderTracker(null);
    });

    eventBus.on('jobsheet:catalog-updated', () => {
      if (this.modalEl?.style?.display === 'flex') {
        this._renderModalBody();
      }
    });

    eventBus.on('sandbox:exited', () => {
      this.jobsheetEngine?.stopJobsheet?.();
      this.renderTracker(null);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.modalEl?.style?.display === 'flex') this.hide();
        if (this.forkModalEl?.style?.display === 'flex') this.hideSandboxForkDialog();
      }
    });
  }

  show(tab = 'catalog') {
    this.activeTab = tab || 'catalog';
    this._syncTabUI();
    this._renderModalBody();
    if (this.modalEl) this.modalEl.style.display = 'flex';
  }

  hide() {
    if (this.modalEl) this.modalEl.style.display = 'none';
  }

  openSandboxForkDialog() {
    if (this.forkModalEl) this.forkModalEl.style.display = 'flex';
  }

  hideSandboxForkDialog() {
    if (this.forkModalEl) this.forkModalEl.style.display = 'none';
  }

  _syncTabUI() {
    this.modalEl?.querySelectorAll('[data-js-tab]')?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-js-tab') === this.activeTab);
    });
  }

  _renderModalBody() {
    const body = this.modalEl?.querySelector('#js-tab-body');
    if (!body) return;

    if (this.activeTab === 'catalog') {
      this._renderCatalogTab(body);
    } else if (this.activeTab === 'author') {
      this._renderAuthorTab(body);
    } else {
      this._renderSubmitTab(body);
    }
  }

  _renderCatalogTab(body) {
    const list = this.jobsheetEngine?.getAllJobsheets?.() || [];
    const activeId = this.jobsheetEngine?.activeJobsheet?.id || null;

    body.innerHTML = `
      <div class="js-catalog-grid">
        ${list.map((js) => {
          const isActive = js.id === activeId;
          return `
            <div class="js-card ${isActive ? 'is-active' : ''}">
              <div class="js-card-top">
                <span class="js-code-pill">${escapeHtml(js.code || 'LAB')}</span>
                <span class="js-level-pill">${escapeHtml(js.level || 'SMK TJKT')}</span>
                <span class="js-time-pill">${Number(js.estimatedMinutes || 20)} mnt</span>
                ${js.isCustom ? `<button type="button" class="js-del-custom-btn" data-del-js="${escapeHtml(js.id)}" title="Hapus jobsheet kustom">${uiIcon('trash-2', 12)}</button>` : ''}
              </div>
              <div class="js-card-title">${escapeHtml(js.title)}</div>
              <div class="js-card-desc">${escapeHtml(js.description)}</div>
              <div class="js-card-footer">
                <span class="js-task-count">${uiIcon('check-circle', 12)} ${js.tasks.length} Target Penilaian</span>
                <button type="button" class="btn ${isActive ? 'btn-secondary' : 'btn-primary'} btn-sm btn-js-start" data-start-js="${escapeHtml(js.id)}">
                  ${uiIcon('play', 12)}
                  <span>${isActive ? 'Ulangi Praktikum' : 'Mulai Praktikum'}</span>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    body.querySelectorAll('.btn-js-start').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-start-js');
        if (!id) return;
        this.getWorkspaceController?.()?.switchWorkspace?.('network', { open3D: true, silent: true });
        if (stateManager.getViewMode() !== '3d') {
          stateManager.setViewMode('3d');
        }
        const started = this.jobsheetEngine?.startJobsheet?.(id);
        this.hide();
        if (started?.targetRoom?.id) {
          setTimeout(() => {
            this.getMap3DEngine?.()?.focusOnRoom3d?.(started.targetRoom.id);
          }, 100);
        }
      });
    });

    body.querySelectorAll('.js-del-custom-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-del-js');
        if (id) this.jobsheetEngine?.deleteCustomJobsheet?.(id);
      });
    });
  }

  _renderAuthorTab(body) {
    const rooms = stateManager.getRooms3d?.() || [];
    const roomOptions = rooms
      .map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`)
      .join('');

    body.innerHTML = `
      <div class="js-author-layout">
        <!-- Import Section -->
        <div class="js-box">
          <div class="js-box-title">${uiIcon('upload', 14)} Impor Tugas Jobsheet dari Guru (.json)</div>
          <div class="js-box-desc">Punya file tugas <code>.json</code> dari grup kelas? Unggah di sini untuk langsung mempraktikkannya di Sandbox!</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0;">
              ${uiIcon('upload', 13)} <span>Pilih File Jobsheet (.json)</span>
              <input type="file" id="input-import-jobsheet-json" accept=".json" style="display:none;">
            </label>
            <span id="js-import-feedback" style="font-size:11.5px;color:var(--text-muted);"></span>
          </div>
        </div>

        <!-- Authoring Lite Form -->
        <div class="js-box">
          <div class="js-box-title">${uiIcon('pencil', 14)} Buat Lembar Jobsheet Guru (Authoring Lite)</div>
          <div class="js-form-grid">
            <label class="js-field">
              <span>Judul Jobsheet</span>
              <input type="text" id="js-auth-title" placeholder="Contoh: Praktik VLAN & Hotspot Lab PPLG">
            </label>
            <label class="js-field">
              <span>Kode &amp; Kelas</span>
              <input type="text" id="js-auth-level" placeholder="Contoh: Kelas XI TJKT 1" value="Kelas XI TJKT">
            </label>
            <label class="js-field">
              <span>Gedung Target SMKN 1 Beringin</span>
              <select id="js-auth-room">
                <option value="pplg">Lab PPLG (Default)</option>
                <option value="lab_kc">Lab KC</option>
                <option value="ruang_bk">Ruang BK / TU</option>
                <option value="perakitan">Lab Perakitan 1</option>
                ${roomOptions}
              </select>
            </label>
            <label class="js-field">
              <span>Mode Awal Sandbox</span>
              <select id="js-auth-setup">
                <option value="clear-target-room">Kosongkan Perangkat di Gedung Target</option>
                <option value="keep-current">Pertahankan Topologi Sekolah Saat Ini</option>
              </select>
            </label>
          </div>

          <div class="js-field" style="margin-top:6px;">
            <span>Pilih Syarat Penilaian Otomatis (Auto-Grader Checklist)</span>
            <div class="js-eval-checklist">
              ${EVALUATOR_TEMPLATES.map((tpl, idx) => `
                <label class="js-eval-check-row">
                  <input type="checkbox" class="js-auth-eval-cb" value="${escapeHtml(tpl.type)}" ${idx < 3 ? 'checked' : ''}>
                  <span>${escapeHtml(tpl.label)}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button type="button" id="btn-js-author-save" class="btn btn-primary btn-sm">
              ${uiIcon('download', 13)} <span>Simpan ke Katalog &amp; Unduh File (.json)</span>
            </button>
            <span id="js-author-feedback" style="font-size:11.5px;color:var(--accent-green);"></span>
          </div>
        </div>
      </div>
    `;

    // Handle Import JSON
    const fileInp = body.querySelector('#input-import-jobsheet-json');
    const impFb = body.querySelector('#js-import-feedback');
    fileInp?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const res = this.jobsheetEngine?.importCustomJobsheet?.(String(ev.target?.result || ''));
        if (res?.valid && res.jobsheet) {
          if (impFb) {
            impFb.style.color = '#16a34a';
            impFb.textContent = `Berhasil mengimpor "${res.jobsheet.title}"! Cek tab Katalog.`;
          }
        } else if (impFb) {
          impFb.style.color = '#dc2626';
          impFb.textContent = (res?.errors || ['Gagal mengimpor file.']).join(' ');
        }
      };
      reader.readAsText(file);
      fileInp.value = '';
    });

    // Handle Authoring Save & Download
    body.querySelector('#btn-js-author-save')?.addEventListener('click', () => {
      const title = String(body.querySelector('#js-auth-title')?.value || '').trim();
      const fb = body.querySelector('#js-author-feedback');
      if (!title) {
        if (fb) {
          fb.style.color = '#dc2626';
          fb.textContent = 'Isi Judul Jobsheet terlebih dahulu.';
        }
        return;
      }
      const level = String(body.querySelector('#js-auth-level')?.value || 'SMK TJKT').trim();
      const targetRoom = String(body.querySelector('#js-auth-room')?.value || 'pplg').trim();
      const setupMode = String(body.querySelector('#js-auth-setup')?.value || 'clear-target-room');
      const checkedTypes = Array.from(body.querySelectorAll('.js-auth-eval-cb:checked')).map((el) => el.value);
      if (checkedTypes.length === 0) {
        if (fb) {
          fb.style.color = '#dc2626';
          fb.textContent = 'Pilih minimal 1 syarat penilaian checklist.';
        }
        return;
      }

      const weightEach = Math.floor(100 / checkedTypes.length);
      const tasks = checkedTypes.map((type, idx) => {
        const tpl = EVALUATOR_TEMPLATES.find((t) => t.type === type);
        const params = { ...(tpl?.defaultParams || {}) };
        if (type === 'devices-in-room') params.roomMatch = targetRoom.toLowerCase();
        return {
          id: `ct-${idx + 1}`,
          label: tpl?.label || type,
          weight: idx === checkedTypes.length - 1 ? (100 - weightEach * (checkedTypes.length - 1)) : weightEach,
          hint: `Selesaikan syarat "${tpl?.label || type}" pada gedung ${targetRoom}.`,
          evaluator: { type, ...params }
        };
      });

      const payload = {
        id: `js-guru-${Date.now().toString(36)}`,
        code: 'GURU',
        title,
        level,
        estimatedMinutes: 25,
        targetRoomPreset: targetRoom.toLowerCase(),
        targetRoomKeywords: [targetRoom.toLowerCase()],
        setupMode,
        description: `Tugas praktikum jaringan dari Guru SMK untuk gedung ${targetRoom}.`,
        tasks
      };

      const res = this.jobsheetEngine?.importCustomJobsheet?.(payload);
      if (res?.valid && res.jobsheet) {
        this._downloadJson(res.jobsheet, `${res.jobsheet.id}.jobsheet.json`);
        if (fb) {
          fb.style.color = '#16a34a';
          fb.textContent = `Jobsheet "${res.jobsheet.title}" tersimpan & terunduh!`;
        }
      }
    });
  }

  _renderSubmitTab(body) {
    const evalState = this.jobsheetEngine?.evaluateAll?.();
    if (!evalState) {
      body.innerHTML = `
        <div class="js-empty-submit">
          ${uiIcon('clipboard-list', 28)}
          <div style="font-weight:700;font-size:13px;color:var(--text-primary);">Belum Ada Jobsheet Aktif</div>
          <div style="font-size:12px;color:var(--text-muted);max-width:360px;">
            Pilih salah satu praktikum di tab <strong>Katalog Jobsheet</strong> terlebih dahulu untuk mulai dinilai secara otomatis dan mencetak Bukti Praktikum PDF.
          </div>
          <button type="button" id="btn-js-go-catalog" class="btn btn-primary btn-sm">Buka Katalog Jobsheet</button>
        </div>
      `;
      body.querySelector('#btn-js-go-catalog')?.addEventListener('click', () => {
        this.activeTab = 'catalog';
        this._syncTabUI();
        this._renderModalBody();
      });
      return;
    }

    const savedName = (typeof localStorage !== 'undefined' ? localStorage.getItem('netmap_student_name') : '') || '';
    const savedClass = (typeof localStorage !== 'undefined' ? localStorage.getItem('netmap_student_class') : '') || '';
    const savedNum = (typeof localStorage !== 'undefined' ? localStorage.getItem('netmap_student_num') : '') || '';

    body.innerHTML = `
      <div class="js-submit-layout">
        <div class="js-score-banner ${evalState.isComplete ? 'is-complete' : ''}">
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;opacity:0.8;">${escapeHtml(evalState.jobsheet.code)} • ${escapeHtml(evalState.jobsheet.level)}</div>
            <div style="font-size:14px;font-weight:700;margin-top:2px;">${escapeHtml(evalState.jobsheet.title)}</div>
            <div style="font-size:11.5px;margin-top:2px;">Progres: ${evalState.passedCount}/${evalState.totalCount} target tuntas</div>
          </div>
          <div class="js-score-big">${evalState.score}<span>/100</span></div>
        </div>

        <div class="js-box">
          <div class="js-box-title">${uiIcon('user', 14)} Identitas Siswa (Untuk Bukti Penilaian Guru)</div>
          <div class="js-form-grid">
            <label class="js-field">
              <span>Nama Lengkap Siswa</span>
              <input type="text" id="js-sub-name" value="${escapeHtml(savedName)}" placeholder="Contoh: Ahmad Pratama">
            </label>
            <label class="js-field">
              <span>Kelas</span>
              <input type="text" id="js-sub-class" value="${escapeHtml(savedClass)}" placeholder="Contoh: XI TJKT 1">
            </label>
            <label class="js-field">
              <span>Nomor Absen</span>
              <input type="text" id="js-sub-num" value="${escapeHtml(savedNum)}" placeholder="Contoh: 12">
            </label>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button type="button" id="btn-js-export-pdf" class="btn btn-primary btn-sm" style="flex:1;">
              ${uiIcon('printer', 13)} <span>Cetak Bukti Praktikum PDF (1 Halaman)</span>
            </button>
            <button type="button" id="btn-js-export-submit-json" class="btn btn-secondary btn-sm">
              ${uiIcon('download', 13)} <span>Unduh Proyek Jawaban (.json)</span>
            </button>
          </div>
          <div id="js-sub-checksum-box" class="js-checksum-box" style="display:none;"></div>
        </div>
      </div>
    `;

    const collectStudentInfo = () => {
      const studentName = String(body.querySelector('#js-sub-name')?.value || '').trim() || 'Siswa TJKT';
      const studentClass = String(body.querySelector('#js-sub-class')?.value || '').trim() || '-';
      const studentNumber = String(body.querySelector('#js-sub-num')?.value || '').trim() || '-';
      try {
        localStorage.setItem('netmap_student_name', studentName);
        localStorage.setItem('netmap_student_class', studentClass);
        localStorage.setItem('netmap_student_num', studentNumber);
      } catch { /* ignore */ }
      return { studentName, studentClass, studentNumber };
    };

    body.querySelector('#btn-js-export-pdf')?.addEventListener('click', async () => {
      const info = collectStudentInfo();
      const report = this.jobsheetEngine?.generateSubmissionReport?.(info);
      if (!report) return;
      const box = body.querySelector('#js-sub-checksum-box');
      if (box) {
        box.style.display = 'block';
        box.innerHTML = `${uiIcon('shield-check', 13)} Kode Verifikasi Checksum: <code>${escapeHtml(report.checksum)}</code>`;
      }
      await PdfReportGenerator.generateJobsheetSubmissionPdf(report);
    });

    body.querySelector('#btn-js-export-submit-json')?.addEventListener('click', () => {
      const info = collectStudentInfo();
      const report = this.jobsheetEngine?.generateSubmissionReport?.(info);
      if (!report) return;
      const projectData = this.projectStorage?.serializeProject?.() || {};
      const bundle = {
        type: 'netmap-jobsheet-submission',
        submission: report,
        project: projectData
      };
      const slug = `${info.studentClass}-${info.studentName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
      this._downloadJson(bundle, `${report.jobsheetCode.toLowerCase()}-${slug || 'siswa'}.netmap-submit.json`);
    });
  }

  /**
   * Render or hide the Floating Live Checklist HUD (#hud-jobsheet-tracker).
   * @param {Object|null} evalState
   */
  renderTracker(evalState) {
    if (!this.trackerEl) return;
    if (!evalState?.jobsheet) {
      this.trackerEl.classList.add('hidden');
      this.trackerEl.style.display = 'none';
      this.trackerEl.innerHTML = '';
      return;
    }

    this.trackerEl.classList.remove('hidden');
    this.trackerEl.style.display = 'flex';
    this.trackerEl.classList.toggle('is-minimized', Boolean(this.isTrackerMinimized));

    const js = evalState.jobsheet;
    if (this.isTrackerMinimized) {
      this.trackerEl.innerHTML = `
        <button type="button" id="btn-tracker-expand" class="js-tracker-pill-btn" title="Buka Checklist Jobsheet">
          ${uiIcon('clipboard-list', 13)}
          <span>${escapeHtml(js.code || 'LAB')}: ${evalState.passedCount}/${evalState.totalCount} • <strong>${evalState.score}%</strong></span>
          ${uiIcon('chevron-up', 12)}
        </button>
      `;
      this.trackerEl.querySelector('#btn-tracker-expand')?.addEventListener('click', () => {
        this.isTrackerMinimized = false;
        this.renderTracker(this.jobsheetEngine?.lastEvaluation || evalState);
      });
      return;
    }

    this.trackerEl.innerHTML = `
      <div class="js-tracker-head">
        <div class="js-tracker-title-wrap">
          <span class="js-code-pill">${escapeHtml(js.code || 'LAB')}</span>
          <span class="js-tracker-title">${escapeHtml(js.title)}</span>
        </div>
        <div class="js-tracker-head-right">
          <span class="js-tracker-score ${evalState.isComplete ? 'is-complete' : ''}">${evalState.score}/100</span>
          <button type="button" id="btn-tracker-min" class="js-tracker-icon-btn" title="Kecilkan menjadi pill">${uiIcon('chevron-down', 13)}</button>
        </div>
      </div>

      <div class="js-tracker-progress-bar">
        <div class="js-tracker-progress-fill" style="width:${evalState.score}%;"></div>
      </div>

      <div class="js-tracker-tasks">
        ${evalState.tasks.map((t) => {
          const showHint = this.expandedHintIds.has(t.id);
          return `
            <div class="js-tracker-task ${t.passed ? 'is-passed' : ''}">
              <div class="js-task-row">
                <span class="js-task-check">${t.passed ? uiIcon('check', 12) : ''}</span>
                <div class="js-task-main">
                  <div class="js-task-label">${escapeHtml(t.label)}</div>
                  <div class="js-task-detail">${escapeHtml(t.detail)}</div>
                </div>
                <button type="button" class="js-hint-toggle" data-hint-task="${escapeHtml(t.id)}" title="Tampilkan petunjuk langkah">
                  ${uiIcon('lightbulb', 12)}
                </button>
              </div>
              ${showHint ? `<div class="js-task-hint">${escapeHtml(t.hint)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <div class="js-tracker-actions">
        <button type="button" id="btn-tracker-jump" class="btn btn-secondary btn-sm" title="Arahkan kamera 3D ke gedung target jobsheet">
          ${uiIcon('target', 12)} <span>Gedung</span>
        </button>
        <button type="button" id="btn-tracker-restart" class="btn btn-secondary btn-sm" title="Reset arena dan ulangi jobsheet">
          ${uiIcon('rotate-ccw', 12)} <span>Ulangi</span>
        </button>
        <button type="button" id="btn-tracker-submit" class="btn btn-primary btn-sm" style="flex:1;">
          ${uiIcon('award', 12)} <span>${evalState.isComplete ? 'Cetak Nilai PDF' : 'Kumpulkan'}</span>
        </button>
      </div>
    `;

    this.trackerEl.querySelector('#btn-tracker-min')?.addEventListener('click', () => {
      this.isTrackerMinimized = true;
      this.renderTracker(this.jobsheetEngine?.lastEvaluation || evalState);
    });

    this.trackerEl.querySelectorAll('.js-hint-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.getAttribute('data-hint-task');
        if (!tid) return;
        if (this.expandedHintIds.has(tid)) this.expandedHintIds.delete(tid);
        else this.expandedHintIds.add(tid);
        this.renderTracker(this.jobsheetEngine?.lastEvaluation || evalState);
      });
    });

    this.trackerEl.querySelector('#btn-tracker-jump')?.addEventListener('click', () => {
      if (stateManager.getViewMode() !== '3d') stateManager.setViewMode('3d');
      const roomId = evalState.targetRoomId || this.jobsheetEngine?.targetRoomId;
      setTimeout(() => {
        if (roomId) this.getMap3DEngine?.()?.focusOnRoom3d?.(roomId);
        else this.getMap3DEngine?.()?.zoomExtents?.();
      }, 60);
    });

    this.trackerEl.querySelector('#btn-tracker-restart')?.addEventListener('click', () => {
      this.jobsheetEngine?.restartActiveJobsheet?.();
    });

    this.trackerEl.querySelector('#btn-tracker-submit')?.addEventListener('click', () => {
      this.show('submit');
    });
  }

  _downloadJson(data, filename) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn('[JobsheetPanel] JSON download failed:', err);
    }
  }
}
