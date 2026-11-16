/**
 * SmartSchool NetMap — Multi-Technician Auth & Shared Workspace Manager
 * Supports MySQL / Node.js HTTP backend (/api/*) with automatic browser-local fallback
 * for file:// offline usage and cross-tab BroadcastChannel sync.
 *
 * Workspace Modes:
 *  - 'main'     => workspaceKey 'main' ("Server Utama" main template shared across all technicians)
 *  - 'personal' => workspaceKey 'user_<username>' (private storage per technician account)
 */

import { eventBus } from '../core/event-bus.js';

const LOCAL_DB_STORAGE_KEY = 'netmap_multi_db_v1';
const LOCAL_TOKEN_STORAGE_KEY = 'netmap_auth_token_v1';
const LOCAL_WS_MODE_STORAGE_KEY = 'netmap_workspace_mode_v1';
const DEFAULT_SEED_SALT = 'netmap_salt_2026';

// Standard FIPS 180-4 SHA-256 so offline file:// hashing matches MySQL SHA2() & Node crypto identically
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

export function sha256Hex(message) {
  const bytes = new TextEncoder().encode(String(message));
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const W = new Uint32Array(64);
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H).map((v) => v.toString(16).padStart(8, '0')).join('');
}

function defaultOfflineSeedState() {
  const now = new Date().toISOString();
  return {
    nextUserId: 4,
    users: [
      {
        id: 1,
        username: 'admin',
        displayName: 'Admin Utama Jaringan',
        role: 'admin',
        passwordSalt: DEFAULT_SEED_SALT,
        passwordHash: sha256Hex(`${DEFAULT_SEED_SALT}:admin123`),
        createdAt: now,
        lastLoginAt: null
      },
      {
        id: 2,
        username: 'teknisi1',
        displayName: 'Teknisi Lapangan 1',
        role: 'teknisi',
        passwordSalt: DEFAULT_SEED_SALT,
        passwordHash: sha256Hex(`${DEFAULT_SEED_SALT}:teknisi123`),
        createdAt: now,
        lastLoginAt: null
      },
      {
        id: 3,
        username: 'teknisi2',
        displayName: 'Teknisi Lapangan 2',
        role: 'teknisi',
        passwordSalt: DEFAULT_SEED_SALT,
        passwordHash: sha256Hex(`${DEFAULT_SEED_SALT}:teknisi123`),
        createdAt: now,
        lastLoginAt: null
      }
    ],
    sessions: {},
    workspaces: {}
  };
}

export class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authToken = '';
    this.workspaceMode = 'main'; // 'main' (Server Utama) | 'personal' (Akun Pribadi)
    this.apiAvailable = false;
    this.storageBackend = 'local'; // 'mysql' | 'file' | 'local'
    this.lastUpdatedBy = null;
    this.lastSyncedAt = null;
    this._channel = null;
    this._pollTimer = null;
    this._memoryStore = null;

    this.restoreLocalMeta();
    this.initSyncChannel();
  }

  restoreLocalMeta() {
    try {
      if (typeof localStorage !== 'undefined') {
        this.authToken = localStorage.getItem(LOCAL_TOKEN_STORAGE_KEY) || '';
        const savedMode = localStorage.getItem(LOCAL_WS_MODE_STORAGE_KEY);
        if (savedMode === 'personal' || savedMode === 'main') {
          this.workspaceMode = savedMode;
        }
      }
    } catch { /* ignore storage restrictions */ }
  }

  initSyncChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this._channel = new BroadcastChannel('netmap_multiplayer_sync');
        if (typeof this._channel.unref === 'function') {
          this._channel.unref();
        }
        this._channel.onmessage = (evt) => {
          const msg = evt?.data;
          if (!msg || !this.isAuthenticated()) return;
          if (msg.type === 'workspace-updated' && msg.workspaceKey === this.getActiveWorkspaceKey()) {
            if (msg.updatedAt && msg.updatedAt !== this.lastSyncedAt) {
              this.lastUpdatedBy = msg.updatedBy || this.lastUpdatedBy;
              eventBus.emit('workspace:remote-updated', {
                workspaceKey: msg.workspaceKey,
                updatedBy: msg.updatedBy,
                updatedAt: msg.updatedAt
              });
            }
          }
        };
      } catch { /* ignore BroadcastChannel failure */ }
    }
  }

  readLocalDb() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.users)) {
            return parsed;
          }
        }
        const seeded = defaultOfflineSeedState();
        localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(seeded));
        return seeded;
      }
    } catch { /* fallback to in-memory store for non-browser tests */ }
    if (!this._memoryStore) {
      this._memoryStore = defaultOfflineSeedState();
    }
    return this._memoryStore;
  }

  writeLocalDb(dbState) {
    this._memoryStore = dbState;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(dbState));
      }
    } catch { /* ignore quota limits */ }
  }

  persistToken(token) {
    this.authToken = token || '';
    try {
      if (typeof localStorage !== 'undefined') {
        if (this.authToken) {
          localStorage.setItem(LOCAL_TOKEN_STORAGE_KEY, this.authToken);
        } else {
          localStorage.removeItem(LOCAL_TOKEN_STORAGE_KEY);
        }
      }
    } catch { /* ignore */ }
  }

  isAuthenticated() {
    return Boolean(this.currentUser && this.currentUser.username);
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getWorkspaceMode() {
    return this.workspaceMode === 'personal' ? 'personal' : 'main';
  }

  setWorkspaceMode(mode) {
    const next = mode === 'personal' ? 'personal' : 'main';
    this.workspaceMode = next;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_WS_MODE_STORAGE_KEY, next);
      }
    } catch { /* ignore */ }
    eventBus.emit('auth:workspace-mode-changed', {
      workspaceMode: next,
      workspaceKey: this.getActiveWorkspaceKey()
    });
    return next;
  }

  getActiveWorkspaceKey() {
    if (!this.isAuthenticated()) return null;
    if (this.workspaceMode === 'personal') {
      return `user_${this.currentUser.username}`;
    }
    return 'main';
  }

  async apiFetch(apiPath, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    const resp = await fetch(apiPath, {
      ...options,
      headers
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(payload.error || `HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return payload;
  }

  async initSession() {
    const isHttpOrigin = typeof window !== 'undefined' &&
      (window.location?.protocol === 'http:' || window.location?.protocol === 'https:') &&
      typeof fetch === 'function';

    if (isHttpOrigin) {
      try {
        const health = await this.apiFetch('/api/health');
        if (health && health.ok) {
          this.apiAvailable = true;
          this.storageBackend = health.storageBackend || 'file';
          if (this.authToken) {
            const sess = await this.apiFetch('/api/auth/session');
            if (sess.authenticated && sess.user) {
              this.currentUser = sess.user;
            } else {
              this.currentUser = null;
              this.persistToken('');
            }
          }
          eventBus.emit('auth:changed', this.getAuthStateSnapshot());
          if (this.isAuthenticated()) this.startRemoteSyncPolling();
          return this.getAuthStateSnapshot();
        }
      } catch {
        this.apiAvailable = false;
      }
    }

    // Offline file:// or static server fallback
    this.apiAvailable = false;
    this.storageBackend = 'local';
    if (this.authToken) {
      const db = this.readLocalDb();
      const sess = db.sessions?.[this.authToken];
      const user = sess ? db.users.find((u) => u.username.toLowerCase() === String(sess.username).toLowerCase()) : null;
      if (user) {
        this.currentUser = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          lastLoginAt: user.lastLoginAt
        };
      } else {
        this.currentUser = null;
        this.persistToken('');
      }
    }
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return this.getAuthStateSnapshot();
  }

  getAuthStateSnapshot() {
    return {
      authenticated: this.isAuthenticated(),
      user: this.currentUser,
      workspaceMode: this.getWorkspaceMode(),
      workspaceKey: this.getActiveWorkspaceKey(),
      storageBackend: this.storageBackend,
      apiAvailable: this.apiAvailable,
      lastUpdatedBy: this.lastUpdatedBy,
      lastSyncedAt: this.lastSyncedAt
    };
  }

  async login(username, password) {
    const cleanUser = String(username || '').trim();
    const rawPass = String(password || '');
    if (!cleanUser || !rawPass) {
      throw new Error('Username dan password wajib diisi.');
    }

    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: cleanUser, password: rawPass })
      });
      this.persistToken(res.token);
      this.currentUser = res.user;
      this.storageBackend = res.storageBackend || this.storageBackend;
      this.startRemoteSyncPolling();
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
      return res.user;
    }

    // Offline local storage fallback
    const db = this.readLocalDb();
    const userRow = db.users.find((u) => u.username.toLowerCase() === cleanUser.toLowerCase());
    if (!userRow || sha256Hex(`${userRow.passwordSalt}:${rawPass}`) !== userRow.passwordHash) {
      throw new Error('Username atau password salah.');
    }
    userRow.lastLoginAt = new Date().toISOString();
    const token = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    db.sessions[token] = { username: userRow.username, createdAt: userRow.lastLoginAt };
    this.writeLocalDb(db);
    this.persistToken(token);
    this.currentUser = {
      id: userRow.id,
      username: userRow.username,
      displayName: userRow.displayName,
      role: userRow.role,
      lastLoginAt: userRow.lastLoginAt
    };
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return this.currentUser;
  }

  async register({ username, displayName, password, role = 'teknisi' }) {
    const cleanUser = String(username || '').trim();
    const cleanName = String(displayName || cleanUser).trim() || cleanUser;
    const rawPass = String(password || '');

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUser)) {
      throw new Error('Username harus 3-32 karakter (huruf, angka, titik, _ atau -).');
    }
    if (rawPass.length < 4) {
      throw new Error('Password minimal 4 karakter.');
    }

    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username: cleanUser, displayName: cleanName, password: rawPass, role })
      });
      this.persistToken(res.token);
      this.currentUser = res.user;
      this.storageBackend = res.storageBackend || this.storageBackend;
      this.startRemoteSyncPolling();
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
      return res.user;
    }

    const db = this.readLocalDb();
    if (db.users.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
      throw new Error(`Username "${cleanUser}" sudah terdaftar.`);
    }
    const salt = `${DEFAULT_SEED_SALT}_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const newUser = {
      id: db.nextUserId++,
      username: cleanUser,
      displayName: cleanName,
      role: role === 'admin' ? 'admin' : 'teknisi',
      passwordSalt: salt,
      passwordHash: sha256Hex(`${salt}:${rawPass}`),
      createdAt: now,
      lastLoginAt: now
    };
    db.users.push(newUser);
    const token = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    db.sessions[token] = { username: newUser.username, createdAt: now };
    this.writeLocalDb(db);
    this.persistToken(token);
    this.currentUser = {
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
      lastLoginAt: now
    };
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return this.currentUser;
  }

  async logout() {
    if (this.apiAvailable && this.authToken) {
      try {
        await this.apiFetch('/api/auth/logout', { method: 'POST' });
      } catch { /* ignore network errors during logout */ }
    } else if (this.authToken) {
      const db = this.readLocalDb();
      if (db.sessions?.[this.authToken]) {
        delete db.sessions[this.authToken];
        this.writeLocalDb(db);
      }
    }
    this.currentUser = null;
    this.lastUpdatedBy = null;
    this.lastSyncedAt = null;
    this.stopRemoteSyncPolling();
    this.persistToken('');
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
  }

  startRemoteSyncPolling() {
    this.stopRemoteSyncPolling();
    if (!this.apiAvailable || !this.isAuthenticated() || typeof setInterval === 'undefined') return;
    this._pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      this.checkRemoteWorkspaceUpdate().catch(() => {});
    }, 12000);
  }

  stopRemoteSyncPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async checkRemoteWorkspaceUpdate() {
    if (!this.apiAvailable || !this.isAuthenticated()) return false;
    const key = this.getActiveWorkspaceKey();
    if (key !== 'main') return false;
    const meta = await this.apiFetch(`/api/workspaces/${encodeURIComponent(key)}?meta=1`);
    if (meta?.updatedAt && this.lastSyncedAt && meta.updatedAt !== this.lastSyncedAt) {
      eventBus.emit('workspace:remote-updated', {
        workspaceKey: key,
        updatedBy: meta.updatedBy,
        updatedAt: meta.updatedAt
      });
      return true;
    }
    return false;
  }

  async listTechnicians() {
    if (!this.isAuthenticated()) return [];
    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/users');
      return Array.isArray(res.users) ? res.users : [];
    }
    const db = this.readLocalDb();
    return db.users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      lastLoginAt: u.lastLoginAt
    }));
  }

  async loadWorkspaceProject(workspaceKey = this.getActiveWorkspaceKey()) {
    if (!this.isAuthenticated() || !workspaceKey) return null;

    if (this.apiAvailable) {
      const res = await this.apiFetch(`/api/workspaces/${encodeURIComponent(workspaceKey)}`);
      this.lastUpdatedBy = res.updatedBy || null;
      this.lastSyncedAt = res.updatedAt || null;
      return res;
    }

    const db = this.readLocalDb();
    const ws = db.workspaces?.[workspaceKey] || null;
    this.lastUpdatedBy = ws?.updatedBy || null;
    this.lastSyncedAt = ws?.updatedAt || null;
    return ws ? { ...ws, storageBackend: 'local' } : { workspaceKey, projectData: null, updatedBy: null, updatedAt: null, storageBackend: 'local' };
  }

  async saveWorkspaceProject(workspaceKey = this.getActiveWorkspaceKey(), projectData) {
    if (!this.isAuthenticated() || !workspaceKey || !projectData) return null;

    let savedMeta;
    if (this.apiAvailable) {
      savedMeta = await this.apiFetch(`/api/workspaces/${encodeURIComponent(workspaceKey)}`, {
        method: 'PUT',
        body: JSON.stringify({ projectData })
      });
    } else {
      const db = this.readLocalDb();
      const updatedAt = new Date().toISOString();
      db.workspaces[workspaceKey] = {
        workspaceKey,
        ownerUsername: workspaceKey === 'main' ? null : this.currentUser.username,
        title: workspaceKey === 'main' ? 'Server Utama' : (projectData.name || this.currentUser.displayName),
        projectData,
        updatedBy: this.currentUser.username,
        updatedAt
      };
      this.writeLocalDb(db);
      savedMeta = {
        ok: true,
        workspaceKey,
        updatedBy: this.currentUser.username,
        updatedAt,
        storageBackend: 'local'
      };
    }

    this.lastUpdatedBy = savedMeta.updatedBy || this.currentUser.username;
    this.lastSyncedAt = savedMeta.updatedAt || new Date().toISOString();

    this._channel?.postMessage({
      type: 'workspace-updated',
      workspaceKey,
      updatedBy: this.lastUpdatedBy,
      updatedAt: this.lastSyncedAt
    });

    return savedMeta;
  }

  async copyWorkspaceProject(fromKey, toKey) {
    if (!this.isAuthenticated() || !fromKey || !toKey) return null;

    let res;
    if (this.apiAvailable) {
      res = await this.apiFetch('/api/workspaces/clone', {
        method: 'POST',
        body: JSON.stringify({ fromKey, toKey })
      });
    } else {
      const db = this.readLocalDb();
      const src = db.workspaces?.[fromKey];
      if (!src || !src.projectData) {
        throw new Error(`Workspace sumber "${fromKey}" masih kosong.`);
      }
      const clonedData = {
        ...JSON.parse(JSON.stringify(src.projectData)),
        updatedAt: new Date().toISOString()
      };
      const updatedAt = new Date().toISOString();
      db.workspaces[toKey] = {
        workspaceKey: toKey,
        ownerUsername: toKey === 'main' ? null : this.currentUser.username,
        title: toKey === 'main' ? 'Server Utama' : `Workspace ${this.currentUser.displayName}`,
        projectData: clonedData,
        updatedBy: this.currentUser.username,
        updatedAt
      };
      this.writeLocalDb(db);
      res = {
        ok: true,
        workspaceKey: toKey,
        projectData: clonedData,
        updatedBy: this.currentUser.username,
        updatedAt,
        storageBackend: 'local'
      };
    }

    if (toKey === this.getActiveWorkspaceKey()) {
      this.lastUpdatedBy = res.updatedBy;
      this.lastSyncedAt = res.updatedAt;
    }

    this._channel?.postMessage({
      type: 'workspace-updated',
      workspaceKey: toKey,
      updatedBy: res.updatedBy,
      updatedAt: res.updatedAt
    });

    return res;
  }
}

export const authManager = new AuthManager();
