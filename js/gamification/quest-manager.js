/**
 * NetMap — Gamification & Educational Quest System (Roblox-style XP, Level & Badges)
 * Menilai misi Studio Bangunan 3D, Lab Jaringan Packet Tracer, dan Eksplorasi Avatar secara otomatis.
 */

import { eventBus } from '../core/event-bus.js';
import { stateManager } from '../core/state-manager.js';
import { escapeHtml, uiIcon } from '../utils/helpers.js';

const GAMIFICATION_STORAGE_KEY = 'netmap_gamification_v1';

export const BUILTIN_QUESTS = [
  {
    id: 'quest-build-campus',
    title: 'Arsitek Kampus Sekolah 3D',
    description: 'Buka Studio Bangunan, pasang minimal 2 gedung/properti 3D dan bangun 1 jalur jalan 3D kampus.',
    workspace: 'build',
    xp: 150,
    badge: 'Arsitek Kampus',
    check: ({ stateManager: sm }) => {
      const rooms = sm.getRooms3d().length;
      const roads = sm.getRoads3d().length;
      return {
        completed: rooms >= 2 && roads >= 1,
        progressText: `Gedung ${Math.min(rooms, 2)}/2 • Jalan ${Math.min(roads, 1)}/1`
      };
    }
  },
  {
    id: 'quest-net-backbone',
    title: 'Rakit Backbone Lab Jaringan',
    description: 'Di Lab Jaringan, pasang minimal 3 perangkat jaringan dan hubungkan minimal 2 segmen kabel.',
    workspace: 'network',
    xp: 200,
    badge: 'Teknisi Backbone',
    check: ({ deviceManager: dm, cableManager: cm }) => {
      const devs = dm?.getAllDevices?.().length || 0;
      const cables = cm?.getAllConnections?.().length || 0;
      return {
        completed: devs >= 3 && cables >= 2,
        progressText: `Perangkat ${Math.min(devs, 3)}/3 • Kabel ${Math.min(cables, 2)}/2`
      };
    }
  },
  {
    id: 'quest-pt-ping',
    title: 'Uji Koneksi Packet Tracer',
    description: 'Gunakan Simulasi & CLI untuk mengirim paket Ping antar perangkat hingga status REPLY berhasil.',
    workspace: 'network',
    xp: 250,
    badge: 'Master Packet Tracer',
    check: ({ progress }) => {
      const ok = Boolean(progress.pingSucceeded);
      return {
        completed: ok,
        progressText: ok ? 'Ping REPLY 1/1' : 'Ping REPLY 0/1'
      };
    }
  },
  {
    id: 'quest-avatar-inspect',
    title: 'Eksplorasi Teknisi Roblox 3D',
    description: 'Aktifkan karakter avatar 3D (TPP/FPP) untuk menjelajahi kampus atau memeriksa port perangkat.',
    workspace: 'any',
    xp: 150,
    badge: 'Explorer Roblox',
    check: ({ progress }) => {
      const ok = Boolean(progress.avatarVisited);
      return {
        completed: ok,
        progressText: ok ? 'Avatar Aktif 1/1' : 'Avatar Aktif 0/1'
      };
    }
  }
];

export class QuestManager {
  /**
   * @param {Object} options
   * @param {import('../devices/device-manager.js').DeviceManager} options.deviceManager
   * @param {import('../connections/cable-manager.js').CableManager} options.cableManager
   * @param {import('../map/map-3d-engine.js').Map3DEngine} [options.map3DEngine]
   * @param {Function} [options.onSwitchWorkspace]
   */
  constructor({ deviceManager, cableManager, map3DEngine = null, onSwitchWorkspace = null } = {}) {
    this.deviceManager = deviceManager;
    this.cableManager = cableManager;
    this.map3DEngine = map3DEngine;
    this.onSwitchWorkspace = onSwitchWorkspace;
    this.modalEl = null;

    this.profile = this._loadProfile();
    this._bindEventListeners();
    if (typeof document !== 'undefined' && document.body) {
      this.createModalDOM();
    }
    this.syncNavbarUI();
  }

  _loadProfile() {
    const defaults = {
      xp: 0,
      completedQuestIds: [],
      badges: [],
      progress: {
        pingSucceeded: false,
        avatarVisited: false
      }
    };
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(GAMIFICATION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            xp: Number(parsed.xp) || 0,
            completedQuestIds: Array.isArray(parsed.completedQuestIds) ? parsed.completedQuestIds : [],
            badges: Array.isArray(parsed.badges) ? parsed.badges : [],
            progress: {
              ...defaults.progress,
              ...(parsed.progress || {})
            }
          };
        }
      }
    } catch { /* ignore storage errors */ }
    return defaults;
  }

  _saveProfile() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(GAMIFICATION_STORAGE_KEY, JSON.stringify(this.profile));
      }
    } catch { /* ignore storage errors */ }
  }

  getLevel(xp = this.profile.xp) {
    return Math.floor(Math.max(0, Number(xp) || 0) / 200) + 1;
  }

  _bindEventListeners() {
    eventBus.on('simulator:ping-completed', (res) => {
      if (res?.success) {
        this.profile.progress.pingSucceeded = true;
        this.evaluateQuests();
      }
    });

    eventBus.on('map3d:avatar-toggled', ({ active }) => {
      if (active) {
        this.profile.progress.avatarVisited = true;
        this.evaluateQuests();
      }
    });

    const evalEvents = [
      'room3d:changed',
      'road3d:changed',
      'device:added',
      'device:deleted',
      'connection:added',
      'connection:deleted'
    ];
    evalEvents.forEach((ev) => eventBus.on(ev, () => this.evaluateQuests()));
  }

  recordAvatarActivity() {
    if (!this.profile.progress.avatarVisited) {
      this.profile.progress.avatarVisited = true;
      this.evaluateQuests();
    }
  }

  /**
   * Evaluate all BUILTIN_QUESTS against live state and unlock newly completed quests/badges.
   * @returns {{ xp: number, level: number, newlyCompleted: Array<Object>, questStates: Array<Object> }}
   */
  evaluateQuests() {
    const newlyCompleted = [];
    const questStates = BUILTIN_QUESTS.map((q) => {
      const checkRes = q.check({
        stateManager,
        deviceManager: this.deviceManager,
        cableManager: this.cableManager,
        map3DEngine: this.map3DEngine,
        progress: this.profile.progress
      });
      const alreadyDone = this.profile.completedQuestIds.includes(q.id);
      if (checkRes.completed && !alreadyDone) {
        this.profile.completedQuestIds.push(q.id);
        this.profile.xp += q.xp;
        if (!this.profile.badges.includes(q.badge)) {
          this.profile.badges.push(q.badge);
        }
        newlyCompleted.push(q);
      }
      return {
        ...q,
        completed: alreadyDone || checkRes.completed,
        progressText: checkRes.progressText
      };
    });

    if (newlyCompleted.length > 0) {
      this._saveProfile();
      eventBus.emit('quest:completed', {
        quests: newlyCompleted,
        xp: this.profile.xp,
        level: this.getLevel()
      });
      const top = newlyCompleted[0];
      this.map3DEngine?.showStatusHint?.(
        `Misi Selesai: "${top.title}" (+${top.xp} XP, Lencana ${top.badge})!`
      );
    }

    this.syncNavbarUI();
    if (this.modalEl && this.modalEl.style.display !== 'none') {
      this.renderQuestList(questStates);
    }

    return {
      xp: this.profile.xp,
      level: this.getLevel(),
      newlyCompleted,
      questStates
    };
  }

  syncNavbarUI() {
    if (typeof document === 'undefined') return;
    const lvlEl = document.getElementById('navbar-quest-level');
    const xpEl = document.getElementById('navbar-quest-xp');
    if (lvlEl) lvlEl.textContent = `Lv.${this.getLevel()}`;
    if (xpEl) xpEl.textContent = `${this.profile.xp} XP`;
  }

  createModalDOM() {
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'quest-gamification-modal';
    this.modalEl.className = 'modal-overlay quest-gamification-modal';
    this.modalEl.style.display = 'none';
    this.modalEl.innerHTML = `
      <div class="modal-card quest-modal-card">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:8px;">
            ${uiIcon('award', 18)}
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);">Misi Belajar, XP &amp; Lencana Roblox</div>
              <div style="font-size:11px;color:var(--text-muted);">Selesaikan misi Studio Bangunan &amp; Lab Jaringan untuk menaikkan Level Teknisi</div>
            </div>
          </div>
          <button type="button" id="btn-quest-close" class="btn btn-icon btn-sm" title="Tutup">${uiIcon('x', 14)}</button>
        </div>
        <div id="quest-summary-banner" class="quest-summary-banner"></div>
        <div id="quest-badges-strip" class="quest-badges-strip"></div>
        <div id="quest-cards-list" class="quest-cards-list"></div>
      </div>
    `;
    document.body.appendChild(this.modalEl);

    this.modalEl.querySelector('#btn-quest-close')?.addEventListener('click', () => this.hide());
    this.modalEl.addEventListener('click', (ev) => {
      if (ev.target === this.modalEl) this.hide();
    });
  }

  renderQuestList(questStates = null) {
    if (!this.modalEl) return;
    const evaluated = questStates || this.evaluateQuests().questStates;
    const lvl = this.getLevel();
    const xpIntoLevel = this.profile.xp % 200;

    const banner = this.modalEl.querySelector('#quest-summary-banner');
    if (banner) {
      banner.innerHTML = `
        <div class="quest-lvl-pill">Level ${lvl}</div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;">
            <span>Total XP: ${this.profile.xp}</span>
            <span>${xpIntoLevel}/200 XP ke Level ${lvl + 1}</span>
          </div>
          <div class="quest-xp-bar"><div class="quest-xp-fill" style="width:${Math.round((xpIntoLevel / 200) * 100)}%;"></div></div>
        </div>
      `;
    }

    const badgeStrip = this.modalEl.querySelector('#quest-badges-strip');
    if (badgeStrip) {
      badgeStrip.innerHTML = this.profile.badges.length === 0
        ? '<span style="font-size:11px;color:var(--text-muted);">Belum ada lencana terbuka — selesaikan misi pertamamu!</span>'
        : this.profile.badges.map((b) => `<span class="quest-badge-chip">${uiIcon('award', 11)} ${escapeHtml(b)}</span>`).join('');
    }

    const listEl = this.modalEl.querySelector('#quest-cards-list');
    if (listEl) {
      listEl.innerHTML = evaluated.map((q) => `
        <div class="quest-item-card ${q.completed ? 'is-done' : ''}">
          <div class="quest-item-head">
            <span class="quest-item-title">${q.completed ? uiIcon('check', 13) : uiIcon('target', 13)} ${escapeHtml(q.title)}</span>
            <span class="quest-item-xp">+${q.xp} XP</span>
          </div>
          <div class="quest-item-desc">${escapeHtml(q.description)}</div>
          <div class="quest-item-foot">
            <span class="quest-item-prog">${escapeHtml(q.progressText)}</span>
            ${q.workspace !== 'any' && !q.completed
              ? `<button type="button" class="btn btn-secondary btn-sm btn-quest-go" data-go-ws="${q.workspace}">Buka ${q.workspace === 'build' ? 'Studio Bangunan' : 'Lab Jaringan'}</button>`
              : `<span class="quest-item-badge">${escapeHtml(q.badge)}</span>`}
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-quest-go')?.forEach((btn) => {
        btn.addEventListener('click', () => {
          const ws = btn.getAttribute('data-go-ws');
          this.hide();
          if (ws && typeof this.onSwitchWorkspace === 'function') {
            this.onSwitchWorkspace(ws);
          } else if (ws) {
            stateManager.setWorkspaceMode(ws);
          }
        });
      });
    }
  }

  show() {
    if (!this.modalEl) return;
    this.evaluateQuests();
    this.renderQuestList();
    this.modalEl.style.display = 'flex';
  }

  hide() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }
}
