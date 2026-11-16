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
const LOCAL_PRESENCE_STORAGE_KEY = 'netmap_presence_peers_v1';
const DEFAULT_SEED_SALT = 'netmap_salt_2026';
const DEFAULT_MAIN_SERVER_PASSWORD = 'server123';
const PRESENCE_TTL_MS = 15000;
const PEER_COLOR_PALETTE = [
  '#2563eb', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#ea580c', '#4f46e5'
];

export function getPeerColorHex(seed = '') {
  const str = String(seed || 'peer');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return PEER_COLOR_PALETTE[Math.abs(h) % PEER_COLOR_PALETTE.length];
}

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
    workspaces: {},
    mainSecurity: {
      ownerUsername: 'admin',
      passwordSalt: DEFAULT_SEED_SALT,
      passwordHash: sha256Hex(`${DEFAULT_SEED_SALT}:${DEFAULT_MAIN_SERVER_PASSWORD}`),
      isPublicViewable: true,
      updatedAt: now,
      updatedBy: 'admin'
    }
  };
}

export class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authToken = '';
    this.workspaceMode = 'main'; // 'main' (Server Utama) | 'personal' (Akun Pribadi)
    this.mainWorkspaceUnlocked = false;
    this.mainOwnerUsername = 'admin';
    this.publicPreviewMode = false;
    this.apiAvailable = false;
    this.storageBackend = 'local'; // 'mysql' | 'file' | 'local'
    this.lastUpdatedBy = null;
    this.lastSyncedAt = null;
    this._channel = null;
    this._pollTimer = null;
    this._memoryStore = null;

    // Multi-technician real-time avatar & cursor presence
    this.clientId = `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.remotePeers = new Map();
    this._presenceTimer = null;
    this._presenceInFlight = false;
    this._lastPresencePushAt = 0;
    this._lastWsPushAt = 0;
    this._lastLocalStorageSyncAt = 0;
    this._presenceDirty = false;
    this._presenceWs = null;
    this._presenceWsUrl = '';
    this._presenceSse = null;
    this._presenceSseUrl = '';
    this._presenceReconnectTimer = null;
    this._presenceReconnectAttempt = 0;
    this._lastTransitionState = { isMoving: false, isGrounded: true };
    this.localPresenceState = {
      viewMode: '2d',
      avatarMode: false,
      perspective: 'tpp',
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      normX: 0.5,
      normY: 0.5,
      yaw: 0,
      isMoving: false,
      isRunning: false,
      isGrounded: true,
      isCarrying: false,
      walkPhase: 0,
      nearestDeviceId: null
    };

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
          if (!msg) return;
          if (msg.type === 'presence-heartbeat' && msg.peer && msg.peer.clientId !== this.clientId) {
            this.applySingleRemotePeer(msg.peer);
            return;
          }
          if (msg.type === 'presence-leave' && msg.clientId) {
            if (this.remotePeers.delete(msg.clientId)) {
              const peers = this.getRemotePeers();
              eventBus.emit('presence:updated', { peers, deltaClientId: msg.clientId, deltaType: 'remove' });
            }
            return;
          }
          if (!this.isAuthenticated()) return;
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

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (evt) => {
        if (evt.key === LOCAL_PRESENCE_STORAGE_KEY) {
          this._syncPresenceFromLocalStorage();
        }
      });
      window.addEventListener('beforeunload', () => {
        this.leavePresence();
      });
    }
  }

  readLocalDb() {
    const ensureDefaults = (db) => {
      if (!db.mainSecurity || !db.mainSecurity.passwordHash) {
        db.mainSecurity = defaultOfflineSeedState().mainSecurity;
      }
      if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
      if (!db.workspaces || typeof db.workspaces !== 'object') db.workspaces = {};
      return db;
    };
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.users)) {
            return ensureDefaults(parsed);
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
    return ensureDefaults(this._memoryStore);
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

  isMainWorkspaceUnlocked() {
    return Boolean(this.isAuthenticated() && this.mainWorkspaceUnlocked);
  }

  isMainServerAdmin() {
    if (!this.isAuthenticated()) return false;
    const uname = String(this.currentUser?.username || '').toLowerCase();
    const owner = String(this.mainOwnerUsername || 'admin').toLowerCase();
    return uname === 'admin' || this.currentUser?.role === 'admin' || uname === owner;
  }

  isPublicPreviewActive() {
    return Boolean(!this.isAuthenticated() && this.publicPreviewMode);
  }

  setPublicPreviewMode(active) {
    this.publicPreviewMode = Boolean(active) && !this.isAuthenticated();
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return this.publicPreviewMode;
  }

  canWriteActiveWorkspace() {
    if (!this.isAuthenticated()) return false;
    if (this.getWorkspaceMode() === 'personal') return true;
    return this.mainWorkspaceUnlocked === true;
  }

  getWorkspaceMode() {
    return this.workspaceMode === 'personal' ? 'personal' : 'main';
  }

  setWorkspaceMode(mode) {
    const next = mode === 'personal' ? 'personal' : 'main';
    const prev = this.workspaceMode;
    this.workspaceMode = next;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_WS_MODE_STORAGE_KEY, next);
      }
    } catch { /* ignore */ }
    if (prev !== next) {
      this.remotePeers.clear();
      eventBus.emit('presence:updated', { peers: [] });
      if (this.isAuthenticated()) {
        this.pushPresenceNow({ force: true }).catch(() => {});
      }
    }
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

  _verifyLocalMainPassword(db, rawPassword) {
    const sec = db?.mainSecurity;
    if (!sec || !sec.passwordHash) return true;
    return sha256Hex(`${sec.passwordSalt || DEFAULT_SEED_SALT}:${String(rawPassword || '')}`) === sec.passwordHash;
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
              this.mainWorkspaceUnlocked = Boolean(sess.mainUnlocked);
              this.mainOwnerUsername = sess.mainOwnerUsername || 'admin';
              this.publicPreviewMode = false;
            } else {
              this.currentUser = null;
              this.mainWorkspaceUnlocked = false;
              this.persistToken('');
            }
          }
          eventBus.emit('auth:changed', this.getAuthStateSnapshot());
          if (this.isAuthenticated()) {
            this.startRemoteSyncPolling();
            this.startPresenceSync();
          }
          return this.getAuthStateSnapshot();
        }
      } catch {
        this.apiAvailable = false;
      }
    }

    // Offline file:// or static server fallback
    this.apiAvailable = false;
    this.storageBackend = 'local';
    const db = this.readLocalDb();
    this.mainOwnerUsername = db.mainSecurity?.ownerUsername || 'admin';
    if (this.authToken) {
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
        this.mainWorkspaceUnlocked = Boolean(sess?.mainUnlocked);
        this.publicPreviewMode = false;
      } else {
        this.currentUser = null;
        this.mainWorkspaceUnlocked = false;
        this.persistToken('');
      }
    } else {
      this.mainWorkspaceUnlocked = false;
    }
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    if (this.isAuthenticated()) {
      this.startPresenceSync();
    }
    return this.getAuthStateSnapshot();
  }

  getAuthStateSnapshot() {
    return {
      authenticated: this.isAuthenticated(),
      user: this.currentUser,
      workspaceMode: this.getWorkspaceMode(),
      workspaceKey: this.getActiveWorkspaceKey(),
      mainUnlocked: this.isMainWorkspaceUnlocked(),
      mainOwnerUsername: this.mainOwnerUsername,
      canManageServerPassword: this.isMainServerAdmin(),
      canWriteActive: this.canWriteActiveWorkspace(),
      publicPreviewMode: this.isPublicPreviewActive(),
      storageBackend: this.storageBackend,
      apiAvailable: this.apiAvailable,
      lastUpdatedBy: this.lastUpdatedBy,
      lastSyncedAt: this.lastSyncedAt
    };
  }

  async login(username, password, options = {}) {
    const cleanUser = String(username || '').trim();
    const rawPass = String(password || '');
    const workspacePassword = typeof options.workspacePassword === 'string' ? options.workspacePassword : '';
    const requireMainUnlock = Boolean(options.requireMainUnlock);

    if (!cleanUser || !rawPass) {
      throw new Error('Username dan password wajib diisi.');
    }

    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: cleanUser,
          password: rawPass,
          workspacePassword,
          requireMainUnlock
        })
      });
      this.persistToken(res.token);
      this.currentUser = res.user;
      this.mainWorkspaceUnlocked = Boolean(res.mainUnlocked);
      this.mainOwnerUsername = res.mainOwnerUsername || 'admin';
      this.publicPreviewMode = false;
      this.storageBackend = res.storageBackend || this.storageBackend;
      this.startRemoteSyncPolling();
      this.startPresenceSync();
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
      return res.user;
    }

    // Offline local storage fallback
    const db = this.readLocalDb();
    const userRow = db.users.find((u) => u.username.toLowerCase() === cleanUser.toLowerCase());
    if (!userRow || sha256Hex(`${userRow.passwordSalt}:${rawPass}`) !== userRow.passwordHash) {
      throw new Error('Username atau password salah.');
    }

    let mainUnlocked = false;
    if (workspacePassword) {
      if (!this._verifyLocalMainPassword(db, workspacePassword)) {
        throw new Error('Password akses Server Utama salah.');
      }
      mainUnlocked = true;
    } else if (requireMainUnlock) {
      throw new Error('Masukkan password akses Server Utama untuk menggunakan workspace Server Utama.');
    }

    userRow.lastLoginAt = new Date().toISOString();
    const token = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    db.sessions[token] = {
      username: userRow.username,
      mainUnlocked,
      createdAt: userRow.lastLoginAt
    };
    this.writeLocalDb(db);
    this.persistToken(token);
    this.currentUser = {
      id: userRow.id,
      username: userRow.username,
      displayName: userRow.displayName,
      role: userRow.role,
      lastLoginAt: userRow.lastLoginAt
    };
    this.mainWorkspaceUnlocked = mainUnlocked;
    this.mainOwnerUsername = db.mainSecurity?.ownerUsername || 'admin';
    this.publicPreviewMode = false;
    this.startPresenceSync();
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return this.currentUser;
  }

  async register({ username, displayName, password, role = 'teknisi', workspacePassword = '', requireMainUnlock = false }) {
    const cleanUser = String(username || '').trim();
    const cleanName = String(displayName || cleanUser).trim() || cleanUser;
    const rawPass = String(password || '');
    const serverPass = typeof workspacePassword === 'string' ? workspacePassword : '';

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUser)) {
      throw new Error('Username harus 3-32 karakter (huruf, angka, titik, _ atau -).');
    }
    if (rawPass.length < 4) {
      throw new Error('Password minimal 4 karakter.');
    }

    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: cleanUser,
          displayName: cleanName,
          password: rawPass,
          role,
          workspacePassword: serverPass,
          requireMainUnlock: Boolean(requireMainUnlock)
        })
      });
      this.persistToken(res.token);
      this.currentUser = res.user;
      this.mainWorkspaceUnlocked = Boolean(res.mainUnlocked);
      this.mainOwnerUsername = res.mainOwnerUsername || 'admin';
      this.publicPreviewMode = false;
      this.storageBackend = res.storageBackend || this.storageBackend;
      this.startRemoteSyncPolling();
      this.startPresenceSync();
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
      return res.user;
    }

    const db = this.readLocalDb();
    if (db.users.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
      throw new Error(`Username "${cleanUser}" sudah terdaftar.`);
    }
    if (role === 'admin') {
      if (!serverPass || !this._verifyLocalMainPassword(db, serverPass)) {
        throw new Error('Password Server Utama diperlukan untuk mendaftar sebagai Admin Utama.');
      }
    }

    let mainUnlocked = false;
    if (serverPass) {
      if (!this._verifyLocalMainPassword(db, serverPass)) {
        throw new Error('Password akses Server Utama salah.');
      }
      mainUnlocked = true;
    } else if (requireMainUnlock) {
      throw new Error('Masukkan password akses Server Utama untuk menggunakan workspace Server Utama.');
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
    db.sessions[token] = {
      username: newUser.username,
      mainUnlocked,
      createdAt: now
    };
    this.writeLocalDb(db);
    this.persistToken(token);
    this.currentUser = {
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
      lastLoginAt: now
    };
    this.mainWorkspaceUnlocked = mainUnlocked;
    this.mainOwnerUsername = db.mainSecurity?.ownerUsername || 'admin';
    this.publicPreviewMode = false;
    this.startPresenceSync();
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return this.currentUser;
  }

  async logout() {
    this.leavePresence();
    this.stopPresenceSync();
    if (this.apiAvailable && this.authToken) {
      try {
        await this.apiFetch('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ clientId: this.clientId })
        });
      } catch { /* ignore network errors during logout */ }
    } else if (this.authToken) {
      const db = this.readLocalDb();
      if (db.sessions?.[this.authToken]) {
        delete db.sessions[this.authToken];
        this.writeLocalDb(db);
      }
    }
    this.currentUser = null;
    this.mainWorkspaceUnlocked = false;
    this.publicPreviewMode = false;
    this.lastUpdatedBy = null;
    this.lastSyncedAt = null;
    this.remotePeers.clear();
    this.stopRemoteSyncPolling();
    this.persistToken('');
    eventBus.emit('presence:updated', { peers: [] });
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
  }

  async unlockMainWorkspace(password) {
    if (!this.isAuthenticated()) {
      throw new Error('Silakan login akun terlebih dahulu untuk membuka akses edit Server Utama.');
    }
    const rawServerPass = String(password || '');
    if (!rawServerPass) {
      throw new Error('Password akses Server Utama wajib diisi.');
    }

    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/workspaces/main/unlock', {
        method: 'POST',
        body: JSON.stringify({ password: rawServerPass })
      });
      this.mainWorkspaceUnlocked = Boolean(res.mainUnlocked);
      this.mainOwnerUsername = res.mainOwnerUsername || this.mainOwnerUsername;
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
      return true;
    }

    const db = this.readLocalDb();
    if (!this._verifyLocalMainPassword(db, rawServerPass)) {
      throw new Error('Password akses Server Utama salah.');
    }
    if (this.authToken && db.sessions[this.authToken]) {
      db.sessions[this.authToken].mainUnlocked = true;
      this.writeLocalDb(db);
    }
    this.mainWorkspaceUnlocked = true;
    this.mainOwnerUsername = db.mainSecurity?.ownerUsername || 'admin';
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return true;
  }

  async lockMainWorkspace() {
    if (!this.isAuthenticated()) return false;
    if (this.apiAvailable) {
      await this.apiFetch('/api/workspaces/main/lock', { method: 'POST' });
    } else {
      const db = this.readLocalDb();
      if (this.authToken && db.sessions[this.authToken]) {
        db.sessions[this.authToken].mainUnlocked = false;
        this.writeLocalDb(db);
      }
    }
    this.mainWorkspaceUnlocked = false;
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return true;
  }

  async changeMainWorkspacePassword(newPassword, currentPassword = '') {
    if (!this.isAuthenticated()) {
      throw new Error('Silakan login terlebih dahulu.');
    }
    if (!this.isMainServerAdmin()) {
      throw new Error('Hanya Admin Utama atau pembuat server yang boleh mengubah password Server Utama.');
    }
    const cleanNew = String(newPassword || '');
    if (cleanNew.length < 4) {
      throw new Error('Password server baru minimal 4 karakter.');
    }

    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/workspaces/main/password', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: cleanNew,
          currentPassword: String(currentPassword || '')
        })
      });
      this.mainWorkspaceUnlocked = Boolean(res.mainUnlocked ?? true);
      this.mainOwnerUsername = res.ownerUsername || this.mainOwnerUsername;
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
      return res;
    }

    const db = this.readLocalDb();
    if (typeof currentPassword === 'string' && currentPassword.length > 0) {
      if (!this._verifyLocalMainPassword(db, currentPassword)) {
        throw new Error('Password server saat ini salah.');
      }
    }
    const salt = `${DEFAULT_SEED_SALT}_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const ownerUsername = db.mainSecurity?.ownerUsername || this.currentUser.username || 'admin';
    db.mainSecurity = {
      ownerUsername,
      passwordSalt: salt,
      passwordHash: sha256Hex(`${salt}:${cleanNew}`),
      isPublicViewable: true,
      updatedAt: now,
      updatedBy: this.currentUser.username
    };
    Object.entries(db.sessions || {}).forEach(([tok, sess]) => {
      if (sess && typeof sess === 'object') {
        sess.mainUnlocked = tok === this.authToken;
      }
    });
    this.writeLocalDb(db);
    this.mainWorkspaceUnlocked = true;
    this.mainOwnerUsername = ownerUsername;
    eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    return {
      ok: true,
      mainUnlocked: true,
      ownerUsername,
      updatedBy: this.currentUser.username,
      updatedAt: now,
      storageBackend: 'local'
    };
  }

  async loadPublicMainWorkspace() {
    if (this.apiAvailable) {
      const res = await this.apiFetch('/api/workspaces/main');
      this.lastUpdatedBy = res.updatedBy || null;
      this.lastSyncedAt = res.updatedAt || null;
      this.mainOwnerUsername = res.ownerUsername || this.mainOwnerUsername;
      if (typeof res.mainUnlocked === 'boolean') {
        this.mainWorkspaceUnlocked = res.mainUnlocked;
      }
      if (!this.isAuthenticated()) {
        this.publicPreviewMode = true;
        this.startPresenceSync();
        eventBus.emit('auth:changed', this.getAuthStateSnapshot());
      }
      return res;
    }

    const db = this.readLocalDb();
    const ws = db.workspaces?.main || null;
    this.lastUpdatedBy = ws?.updatedBy || null;
    this.lastSyncedAt = ws?.updatedAt || null;
    this.mainOwnerUsername = db.mainSecurity?.ownerUsername || 'admin';
    if (!this.isAuthenticated()) {
      this.publicPreviewMode = true;
      this.startPresenceSync();
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    }
    return ws
      ? {
          ...ws,
          ownerUsername: this.mainOwnerUsername,
          isProtected: true,
          isPublicViewable: true,
          mainUnlocked: this.isMainWorkspaceUnlocked(),
          storageBackend: 'local'
        }
      : {
          workspaceKey: 'main',
          title: 'Server Utama',
          ownerUsername: this.mainOwnerUsername,
          projectData: null,
          updatedBy: null,
          updatedAt: null,
          isProtected: true,
          isPublicViewable: true,
          mainUnlocked: this.isMainWorkspaceUnlocked(),
          storageBackend: 'local'
        };
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

  // --------------------------------------------------------------------------
  // Real-Time Multi-Technician Character & Cursor Presence Sync
  // --------------------------------------------------------------------------
  getRemotePeers() {
    const now = Date.now();
    const targetWs = this.isAuthenticated()
      ? this.getActiveWorkspaceKey()
      : (this.isPublicPreviewActive() ? 'main' : null);
    if (!targetWs) return [];
    const list = [];
    for (const [cid, peer] of this.remotePeers.entries()) {
      if (!peer || cid === this.clientId) continue;
      if ((now - (peer.updatedAt || 0)) > PRESENCE_TTL_MS) {
        this.remotePeers.delete(cid);
        continue;
      }
      if (peer.workspaceKey === targetWs) {
        list.push(peer);
      }
    }
    return list;
  }

  _pruneAndEmitPresence() {
    const peers = this.getRemotePeers();
    eventBus.emit('presence:updated', { peers });
    return peers;
  }

  _buildLocalPresencePayload() {
    if (!this.isAuthenticated()) return null;
    const wsKey = this.getActiveWorkspaceKey() || 'main';
    return {
      clientId: this.clientId,
      username: this.currentUser.username,
      displayName: this.currentUser.displayName || this.currentUser.username,
      role: this.currentUser.role || 'teknisi',
      workspaceKey: wsKey,
      colorHex: getPeerColorHex(this.currentUser.username || this.clientId),
      ...this.localPresenceState,
      updatedAt: Date.now()
    };
  }

  _syncPresenceFromLocalStorage(ownPayload = null) {
    try {
      if (typeof localStorage === 'undefined') return;
      const now = Date.now();
      const raw = localStorage.getItem(LOCAL_PRESENCE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const store = (parsed && typeof parsed === 'object') ? parsed : {};
      let dirtyStorage = false;

      Object.keys(store).forEach((cid) => {
        const entry = store[cid];
        if (!entry || (now - (entry.updatedAt || 0)) > PRESENCE_TTL_MS) {
          delete store[cid];
          dirtyStorage = true;
        }
      });

      if (ownPayload) {
        store[ownPayload.clientId] = ownPayload;
        dirtyStorage = true;
      }

      if (dirtyStorage) {
        localStorage.setItem(LOCAL_PRESENCE_STORAGE_KEY, JSON.stringify(store));
      }

      const targetWs = this.isAuthenticated()
        ? this.getActiveWorkspaceKey()
        : (this.isPublicPreviewActive() ? 'main' : null);
      if (!targetWs) return;

      for (const [cid, peer] of Object.entries(store)) {
        if (cid !== this.clientId && peer?.workspaceKey === targetWs) {
          this.remotePeers.set(cid, peer);
        }
      }
      this._pruneAndEmitPresence();
    } catch { /* ignore storage errors */ }
  }

  isPresenceRealtimeConnected() {
    const wsOpen = typeof WebSocket !== 'undefined' && this._presenceWs?.readyState === 1;
    const sseOpen = typeof EventSource !== 'undefined' && this._presenceSse?.readyState === 1;
    return wsOpen || sseOpen;
  }

  applySingleRemotePeer(peer) {
    if (!peer || !peer.clientId || peer.clientId === this.clientId) return [];
    const targetWs = this.isAuthenticated()
      ? this.getActiveWorkspaceKey()
      : (this.isPublicPreviewActive() ? 'main' : null);
    if (!targetWs || peer.workspaceKey !== targetWs) return this.getRemotePeers();

    const updatedPeer = { ...peer, updatedAt: Date.now() };
    this.remotePeers.set(peer.clientId, updatedPeer);
    const peers = this.getRemotePeers();
    eventBus.emit('presence:updated', {
      peers,
      deltaPeer: updatedPeer,
      deltaType: 'update'
    });
    return peers;
  }

  _handleRealtimePresencePayload(rawData) {
    if (!rawData) return;
    try {
      const msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'peers-snapshot') {
        this.applyRemotePeerList(msg.peers || []);
      } else if (msg.type === 'peer-update' && msg.peer) {
        this.applySingleRemotePeer(msg.peer);
      } else if (msg.type === 'peer-remove' && msg.clientId && msg.clientId !== this.clientId) {
        if (this.remotePeers.delete(msg.clientId)) {
          const peers = this.getRemotePeers();
          eventBus.emit('presence:updated', {
            peers,
            deltaClientId: msg.clientId,
            deltaType: 'remove'
          });
        }
      }
    } catch { /* ignore malformed push frames */ }
  }

  _closePresenceWs() {
    if (this._presenceWs) {
      try {
        this._presenceWs.onopen = null;
        this._presenceWs.onmessage = null;
        this._presenceWs.onerror = null;
        this._presenceWs.onclose = null;
        this._presenceWs.close();
      } catch { /* ignore */ }
      this._presenceWs = null;
      this._presenceWsUrl = '';
    }
  }

  _closePresenceSse() {
    if (this._presenceSse) {
      try {
        this._presenceSse.onopen = null;
        this._presenceSse.onmessage = null;
        this._presenceSse.onerror = null;
        this._presenceSse.close();
      } catch { /* ignore */ }
      this._presenceSse = null;
      this._presenceSseUrl = '';
    }
  }

  _disconnectPresenceStreams() {
    if (this._presenceReconnectTimer) {
      clearTimeout(this._presenceReconnectTimer);
      this._presenceReconnectTimer = null;
    }
    this._closePresenceWs();
    this._closePresenceSse();
  }

  _openPresenceSse(wsKey) {
    if (!this.apiAvailable || typeof EventSource !== 'function') return;
    if (typeof window === 'undefined' || !window.location?.host) return;
    const qs = new URLSearchParams({ workspace: wsKey || 'main', clientId: this.clientId });
    if (this.authToken) qs.set('token', this.authToken);
    const sseUrl = `/api/presence/stream?${qs.toString()}`;
    if (this._presenceSse && this._presenceSseUrl === sseUrl && this._presenceSse.readyState !== 2) {
      return;
    }
    this._closePresenceSse();
    try {
      const es = new EventSource(sseUrl);
      this._presenceSse = es;
      this._presenceSseUrl = sseUrl;
      es.addEventListener('presence', (evt) => this._handleRealtimePresencePayload(evt.data));
      es.onmessage = (evt) => this._handleRealtimePresencePayload(evt.data);
      es.onerror = () => {
        if (this._presenceSse !== es) return;
        if (es.readyState === 2) {
          this._closePresenceSse();
        }
      };
    } catch { /* fallback to polling if EventSource unsupported */ }
  }

  _connectPresenceStream() {
    if (!this.apiAvailable || (!this.isAuthenticated() && !this.isPublicPreviewActive())) {
      this._disconnectPresenceStreams();
      return;
    }
    if (typeof window === 'undefined' || !window.location?.host) return;

    const wsKey = this.isAuthenticated() ? (this.getActiveWorkspaceKey() || 'main') : 'main';

    if (typeof WebSocket !== 'function') {
      this._openPresenceSse(wsKey);
      return;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = new URLSearchParams({ workspace: wsKey, clientId: this.clientId });
    if (this.authToken) qs.set('token', this.authToken);
    const wsUrl = `${wsProto}//${window.location.host}/ws/presence?${qs.toString()}`;

    if (this._presenceWs && this._presenceWsUrl === wsUrl && (this._presenceWs.readyState === 0 || this._presenceWs.readyState === 1)) {
      return;
    }

    this._closePresenceWs();
    try {
      const ws = new WebSocket(wsUrl);
      this._presenceWs = ws;
      this._presenceWsUrl = wsUrl;

      ws.onopen = () => {
        if (this._presenceWs !== ws) return;
        this._presenceReconnectAttempt = 0;
        this._closePresenceSse();
        const ownPayload = this.isAuthenticated() ? this._buildLocalPresencePayload() : null;
        if (ownPayload) {
          this._lastWsPushAt = Date.now();
          this._presenceDirty = false;
          try {
            ws.send(JSON.stringify({ type: 'presence', ...ownPayload }));
          } catch { /* ignore */ }
        }
      };

      ws.onmessage = (evt) => {
        if (this._presenceWs !== ws) return;
        this._handleRealtimePresencePayload(evt.data);
      };

      const scheduleReconnect = () => {
        if (this._presenceWs !== ws) return;
        this._presenceWs = null;
        this._presenceWsUrl = '';
        if (!this.apiAvailable || (!this.isAuthenticated() && !this.isPublicPreviewActive())) return;

        // Open SSE stream immediately so downstream updates keep arriving at <5ms while WS backs off
        this._openPresenceSse(wsKey);

        if (this._presenceReconnectTimer) return;
        const delay = Math.min(5000, 600 * Math.pow(1.6, this._presenceReconnectAttempt++));
        this._presenceReconnectTimer = setTimeout(() => {
          this._presenceReconnectTimer = null;
          this._connectPresenceStream();
        }, delay);
        this._presenceReconnectTimer?.unref?.();
      };

      ws.onclose = scheduleReconnect;
      ws.onerror = () => {
        if (ws.readyState !== 1) scheduleReconnect();
      };
    } catch {
      this._openPresenceSse(wsKey);
    }
  }

  updateLocalPresence(partialState = {}, { immediate = false } = {}) {
    if (!partialState || typeof partialState !== 'object') return;
    const prevMoving = this._lastTransitionState.isMoving;
    const prevGrounded = this._lastTransitionState.isGrounded;

    Object.assign(this.localPresenceState, partialState);
    this._presenceDirty = true;

    const nowMoving = Boolean(this.localPresenceState.isMoving);
    const nowGrounded = this.localPresenceState.isGrounded !== false;
    const stateTransition = (prevMoving !== nowMoving) || (prevGrounded !== nowGrounded);
    this._lastTransitionState.isMoving = nowMoving;
    this._lastTransitionState.isGrounded = nowGrounded;

    if (!this.isAuthenticated()) return;
    const payload = this._buildLocalPresencePayload();
    if (!payload) return;

    const now = Date.now();
    const shouldForce = immediate || stateTransition;

    if (shouldForce || now - (this._lastBroadcastAt || 0) >= 25) {
      this._lastBroadcastAt = now;
      this._channel?.postMessage({ type: 'presence-heartbeat', peer: payload });
      // Throttle synchronous localStorage JSON writes to avoid main-thread stutter during movement
      if (shouldForce || now - (this._lastLocalStorageSyncAt || 0) >= 600) {
        this._lastLocalStorageSyncAt = now;
        this._syncPresenceFromLocalStorage(payload);
      }
    }

    if (!this.apiAvailable) return;

    // Fast path: push directly over open WebSocket at ~35Hz with zero HTTP overhead
    if (this._presenceWs && this._presenceWs.readyState === 1) {
      if (shouldForce || now - (this._lastWsPushAt || 0) >= 28) {
        this._lastWsPushAt = now;
        this._presenceDirty = false;
        try {
          this._presenceWs.send(JSON.stringify({ type: 'presence', ...payload }));
        } catch {
          this.pushPresenceNow({ force: shouldForce }).catch(() => {});
        }
      }
      return;
    }

    // Fallback HTTP POST when WebSocket isn't open (throttled to ~18Hz or immediate on stop/jump)
    if (shouldForce || now - (this._lastPresencePushAt || 0) >= 55) {
      this.pushPresenceNow({ force: shouldForce }).catch(() => {});
    }
  }

  async pushPresenceNow({ force = false } = {}) {
    const isAuth = this.isAuthenticated();
    const isPublic = !isAuth && this.isPublicPreviewActive();
    if (!isAuth && !isPublic) return [];

    const wsKey = isAuth ? (this.getActiveWorkspaceKey() || 'main') : 'main';
    const ownPayload = isAuth ? this._buildLocalPresencePayload() : null;

    if (ownPayload && this._presenceWs && this._presenceWs.readyState === 1) {
      this._lastWsPushAt = Date.now();
      this._presenceDirty = false;
      try {
        this._presenceWs.send(JSON.stringify({ type: 'presence', ...ownPayload }));
        return this.getRemotePeers();
      } catch { /* fall through to HTTP */ }
    }

    if (this._presenceInFlight) return this.getRemotePeers();

    if (ownPayload) {
      this._channel?.postMessage({ type: 'presence-heartbeat', peer: ownPayload });
      this._syncPresenceFromLocalStorage(ownPayload);
    } else if (isPublic) {
      this._syncPresenceFromLocalStorage(null);
    }

    if (!this.apiAvailable) {
      return this.getRemotePeers();
    }

    const now = Date.now();
    if (!force && !this._presenceDirty && (now - this._lastPresencePushAt < 450)) {
      return this.getRemotePeers();
    }

    this._presenceInFlight = true;
    this._lastPresencePushAt = now;
    this._presenceDirty = false;
    try {
      const res = isAuth
        ? await this.apiFetch('/api/presence', {
            method: 'POST',
            body: JSON.stringify(ownPayload)
          })
        : await this.apiFetch(`/api/presence?workspace=${encodeURIComponent(wsKey)}`);

      const peers = Array.isArray(res?.peers) ? res.peers : [];
      this.applyRemotePeerList(peers);
      return this.getRemotePeers();
    } catch {
      return this.getRemotePeers();
    } finally {
      this._presenceInFlight = false;
    }
  }

  applyRemotePeerList(peers = []) {
    const incomingIds = new Set();
    const now = Date.now();
    for (const peer of peers) {
      if (!peer || !peer.clientId || peer.clientId === this.clientId) continue;
      incomingIds.add(peer.clientId);
      this.remotePeers.set(peer.clientId, { ...peer, updatedAt: peer.updatedAt || now });
    }
    for (const [cid, existing] of Array.from(this.remotePeers.entries())) {
      if (!incomingIds.has(cid) && (!existing || (now - (existing.updatedAt || 0)) > 2000)) {
        this.remotePeers.delete(cid);
      }
    }
    return this._pruneAndEmitPresence();
  }

  leavePresence() {
    this._channel?.postMessage({ type: 'presence-leave', clientId: this.clientId });
    if (this._presenceWs && this._presenceWs.readyState === 1) {
      try {
        this._presenceWs.send(JSON.stringify({ type: 'leave', clientId: this.clientId }));
      } catch { /* ignore */ }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LOCAL_PRESENCE_STORAGE_KEY);
        if (raw) {
          const store = JSON.parse(raw);
          if (store && store[this.clientId]) {
            delete store[this.clientId];
            localStorage.setItem(LOCAL_PRESENCE_STORAGE_KEY, JSON.stringify(store));
          }
        }
      }
    } catch { /* ignore */ }

    if (this.apiAvailable && this.authToken && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([JSON.stringify({ clientId: this.clientId, token: this.authToken })], { type: 'application/json' });
        navigator.sendBeacon('/api/presence/leave', blob);
      } catch { /* ignore */ }
    }
  }

  startPresenceSync() {
    this.stopPresenceSync();
    const isBrowserRuntime = typeof window !== 'undefined' && typeof window.location === 'object' && typeof setTimeout !== 'undefined';
    if (!isBrowserRuntime) return;
    if (!this.isAuthenticated() && !this.isPublicPreviewActive()) return;

    this._connectPresenceStream();
    this.pushPresenceNow({ force: true }).catch(() => {});

    const tick = () => {
      if (!this.isAuthenticated() && !this.isPublicPreviewActive()) {
        this.stopPresenceSync();
        return;
      }
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const hasRealtime = this.isPresenceRealtimeConnected();
      const fastMode = !isHidden && (this.localPresenceState.avatarMode || this.localPresenceState.isMoving);
      // When WS or SSE push is active, timer is only a lightweight 4s reconcile heartbeat
      const delayMs = hasRealtime
        ? (isHidden ? 10000 : 4000)
        : (isHidden ? 4000 : (fastMode ? 65 : 480));
      this._presenceTimer = setTimeout(async () => {
        await this.pushPresenceNow({ force: !hasRealtime }).catch(() => {});
        if (this._presenceTimer !== null) {
          tick();
        }
      }, delayMs);
      if (typeof this._presenceTimer?.unref === 'function') {
        this._presenceTimer.unref();
      }
    };
    tick();
  }

  stopPresenceSync() {
    if (this._presenceTimer !== null && this._presenceTimer !== undefined) {
      clearTimeout(this._presenceTimer);
      this._presenceTimer = null;
    }
    this._disconnectPresenceStreams();
  }

  async checkRemoteWorkspaceUpdate() {
    if (!this.apiAvailable || !this.isAuthenticated()) return false;
    const key = this.getActiveWorkspaceKey();
    if (key !== 'main') return false;
    const meta = await this.apiFetch(`/api/workspaces/${encodeURIComponent(key)}?meta=1`);
    if (typeof meta?.mainUnlocked === 'boolean' && meta.mainUnlocked !== this.mainWorkspaceUnlocked) {
      this.mainWorkspaceUnlocked = meta.mainUnlocked;
      eventBus.emit('auth:changed', this.getAuthStateSnapshot());
    }
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
    if (workspaceKey === 'main' && !this.isAuthenticated()) {
      return this.loadPublicMainWorkspace();
    }
    if (!this.isAuthenticated() || !workspaceKey) return null;

    if (this.apiAvailable) {
      const res = await this.apiFetch(`/api/workspaces/${encodeURIComponent(workspaceKey)}`);
      this.lastUpdatedBy = res.updatedBy || null;
      this.lastSyncedAt = res.updatedAt || null;
      if (workspaceKey === 'main') {
        this.mainOwnerUsername = res.ownerUsername || this.mainOwnerUsername;
        if (typeof res.mainUnlocked === 'boolean') {
          this.mainWorkspaceUnlocked = res.mainUnlocked;
        }
      }
      return res;
    }

    const db = this.readLocalDb();
    const ws = db.workspaces?.[workspaceKey] || null;
    this.lastUpdatedBy = ws?.updatedBy || null;
    this.lastSyncedAt = ws?.updatedAt || null;
    if (workspaceKey === 'main') {
      this.mainOwnerUsername = db.mainSecurity?.ownerUsername || 'admin';
    }
    return ws ? { ...ws, storageBackend: 'local' } : { workspaceKey, projectData: null, updatedBy: null, updatedAt: null, storageBackend: 'local' };
  }

  async saveWorkspaceProject(workspaceKey = this.getActiveWorkspaceKey(), projectData) {
    if (!this.isAuthenticated() || !workspaceKey || !projectData) return null;
    if (workspaceKey === 'main' && !this.isMainWorkspaceUnlocked()) {
      throw new Error('Workspace Server Utama terkunci. Masukkan password akses Server Utama terlebih dahulu.');
    }

    let savedMeta;
    if (this.apiAvailable) {
      savedMeta = await this.apiFetch(`/api/workspaces/${encodeURIComponent(workspaceKey)}`, {
        method: 'PUT',
        body: JSON.stringify({ projectData })
      });
    } else {
      const db = this.readLocalDb();
      const updatedAt = new Date().toISOString();
      const mainOwner = db.mainSecurity?.ownerUsername || 'admin';
      db.workspaces[workspaceKey] = {
        workspaceKey,
        ownerUsername: workspaceKey === 'main' ? mainOwner : this.currentUser.username,
        title: workspaceKey === 'main' ? 'Server Utama' : (projectData.name || this.currentUser.displayName),
        projectData,
        updatedBy: this.currentUser.username,
        updatedAt
      };
      this.writeLocalDb(db);
      savedMeta = {
        ok: true,
        workspaceKey,
        ownerUsername: workspaceKey === 'main' ? mainOwner : this.currentUser.username,
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
    if (toKey === 'main' && !this.isMainWorkspaceUnlocked()) {
      throw new Error('Workspace Server Utama terkunci. Masukkan password akses Server Utama terlebih dahulu.');
    }

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
      const mainOwner = db.mainSecurity?.ownerUsername || 'admin';
      db.workspaces[toKey] = {
        workspaceKey: toKey,
        ownerUsername: toKey === 'main' ? mainOwner : this.currentUser.username,
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
