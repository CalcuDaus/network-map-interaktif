/**
 * SmartSchool NetMap — Multi-Technician Backend & Static Server
 * Serves static app assets and provides MySQL-backed (with persistent JSON file fallback)
 * REST APIs for multi-technician accounts, login sessions, and shared/personal workspaces:
 *  - "main" = Server Utama (Main Template Bersama untuk seluruh teknisi)
 *  - "user_<username>" = Workspace pribadi masing-masing teknisi
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;
const DEFAULT_DB_FILE = path.join(ROOT_DIR, 'data', 'netmap-server-db.json');
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const SESSION_TTL_DAYS = 30;
const DEFAULT_SEED_SALT = 'netmap_salt_2026';
const DEFAULT_MAIN_SERVER_PASSWORD = 'server123';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm'
};

function hashSha256(salt, password) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function createScryptHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: `scrypt:${hash}` };
}

function verifyPassword(password, salt, storedHash) {
  if (!storedHash || typeof password !== 'string') return false;
  if (storedHash.startsWith('scrypt:')) {
    const expectedHex = storedHash.slice(7);
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }
  const actual = hashSha256(salt, password);
  return actual.length === storedHash.length &&
    crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(storedHash));
}

function buildSeedUsers() {
  const now = new Date().toISOString();
  return [
    {
      id: 1,
      username: 'admin',
      displayName: 'Admin Utama Jaringan',
      role: 'admin',
      passwordSalt: DEFAULT_SEED_SALT,
      passwordHash: hashSha256(DEFAULT_SEED_SALT, 'admin123'),
      createdAt: now,
      lastLoginAt: null
    },
    {
      id: 2,
      username: 'teknisi1',
      displayName: 'Teknisi Lapangan 1',
      role: 'teknisi',
      passwordSalt: DEFAULT_SEED_SALT,
      passwordHash: hashSha256(DEFAULT_SEED_SALT, 'teknisi123'),
      createdAt: now,
      lastLoginAt: null
    },
    {
      id: 3,
      username: 'teknisi2',
      displayName: 'Teknisi Lapangan 2',
      role: 'teknisi',
      passwordSalt: DEFAULT_SEED_SALT,
      passwordHash: hashSha256(DEFAULT_SEED_SALT, 'teknisi123'),
      createdAt: now,
      lastLoginAt: null
    }
  ];
}

function buildDefaultMainSecurity() {
  return {
    ownerUsername: 'admin',
    passwordSalt: DEFAULT_SEED_SALT,
    passwordHash: hashSha256(DEFAULT_SEED_SALT, DEFAULT_MAIN_SERVER_PASSWORD),
    isPublicViewable: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin'
  };
}

function canManageMainServer(user, mainSecurity) {
  if (!user || !user.username) return false;
  const uname = String(user.username).toLowerCase();
  const owner = String(mainSecurity?.ownerUsername || 'admin').toLowerCase();
  return uname === 'admin' || user.role === 'admin' || uname === owner;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.display_name || user.username,
    role: user.role || 'teknisi',
    createdAt: user.createdAt || user.created_at || null,
    lastLoginAt: user.lastLoginAt || user.last_login_at || null
  };
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

function isAllowedWorkspaceKey(key, username) {
  return key === 'main' || key === `user_${username}`;
}

/**
 * Persistent JSON File Store Adapter (zero-dependency fallback when MySQL daemon is absent)
 */
class JsonFileStore {
  constructor(filePath = DEFAULT_DB_FILE) {
    this.filePath = filePath;
    this.backend = 'file';
    this.state = {
      nextUserId: 4,
      users: buildSeedUsers(),
      sessions: {},
      workspaces: {},
      mainSecurity: buildDefaultMainSecurity()
    };
  }

  async init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.state = {
          nextUserId: parsed.nextUserId || 4,
          users: Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : buildSeedUsers(),
          sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
          workspaces: parsed.workspaces && typeof parsed.workspaces === 'object' ? parsed.workspaces : {},
          mainSecurity: parsed.mainSecurity && parsed.mainSecurity.passwordHash
            ? {
                ownerUsername: parsed.mainSecurity.ownerUsername || 'admin',
                passwordSalt: parsed.mainSecurity.passwordSalt || DEFAULT_SEED_SALT,
                passwordHash: parsed.mainSecurity.passwordHash,
                isPublicViewable: parsed.mainSecurity.isPublicViewable !== false,
                updatedAt: parsed.mainSecurity.updatedAt || null,
                updatedBy: parsed.mainSecurity.updatedBy || 'admin'
              }
            : buildDefaultMainSecurity()
        };
      } catch (err) {
        console.warn('[NetMapDB] Failed to parse local store JSON, reinitializing:', err.message);
        this.flush();
      }
    } else {
      this.flush();
    }
    return this.backend;
  }

  flush() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  async findUserByUsername(username) {
    const normalized = String(username || '').toLowerCase();
    return this.state.users.find((u) => u.username.toLowerCase() === normalized) || null;
  }

  async createUser({ username, displayName, role, passwordSalt, passwordHash }) {
    const user = {
      id: this.state.nextUserId++,
      username,
      displayName,
      role: role || 'teknisi',
      passwordSalt,
      passwordHash,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    this.state.users.push(user);
    this.flush();
    return sanitizeUser(user);
  }

  async touchLastLogin(username) {
    const u = await this.findUserByUsername(username);
    if (u) {
      u.lastLoginAt = new Date().toISOString();
      this.flush();
    }
  }

  async listUsers() {
    return this.state.users.map(sanitizeUser);
  }

  async createSession(username, mainUnlocked = false) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
    this.state.sessions[token] = {
      username,
      mainUnlocked: Boolean(mainUnlocked),
      createdAt: new Date(now).toISOString(),
      expiresAt
    };
    this.flush();
    return token;
  }

  async getSessionInfo(token) {
    if (!token) return null;
    const sess = this.state.sessions[token];
    if (!sess) return null;
    if (new Date(sess.expiresAt).getTime() <= Date.now()) {
      delete this.state.sessions[token];
      this.flush();
      return null;
    }
    const user = await this.findUserByUsername(sess.username);
    if (!user) return null;
    return {
      token,
      user: sanitizeUser(user),
      mainUnlocked: Boolean(sess.mainUnlocked)
    };
  }

  async getSessionUser(token) {
    const info = await this.getSessionInfo(token);
    return info?.user || null;
  }

  async setSessionMainUnlocked(token, unlocked) {
    if (token && this.state.sessions[token]) {
      this.state.sessions[token].mainUnlocked = Boolean(unlocked);
      this.flush();
    }
  }

  async deleteSession(token) {
    if (token && this.state.sessions[token]) {
      delete this.state.sessions[token];
      this.flush();
    }
  }

  async getMainWorkspaceSecurity() {
    const sec = this.state.mainSecurity || buildDefaultMainSecurity();
    return {
      ownerUsername: sec.ownerUsername || 'admin',
      isPublicViewable: sec.isPublicViewable !== false,
      isProtected: Boolean(sec.passwordHash),
      updatedAt: sec.updatedAt || null,
      updatedBy: sec.updatedBy || 'admin'
    };
  }

  async verifyMainWorkspacePassword(password) {
    const sec = this.state.mainSecurity || buildDefaultMainSecurity();
    if (!sec.passwordHash) return true;
    return verifyPassword(String(password || ''), sec.passwordSalt || DEFAULT_SEED_SALT, sec.passwordHash);
  }

  async updateMainWorkspacePassword({ passwordSalt, passwordHash, ownerUsername, updatedBy }) {
    const existing = this.state.mainSecurity || buildDefaultMainSecurity();
    const updatedAt = new Date().toISOString();
    this.state.mainSecurity = {
      ownerUsername: existing.ownerUsername || ownerUsername || 'admin',
      passwordSalt,
      passwordHash,
      isPublicViewable: existing.isPublicViewable !== false,
      updatedAt,
      updatedBy: updatedBy || existing.ownerUsername || 'admin'
    };
    if (this.state.workspaces.main) {
      this.state.workspaces.main.ownerUsername = this.state.mainSecurity.ownerUsername;
    }
    // Revoke previously unlocked sessions so other users must enter the new password
    Object.values(this.state.sessions).forEach((s) => {
      if (s && typeof s === 'object') s.mainUnlocked = false;
    });
    this.flush();
    return this.getMainWorkspaceSecurity();
  }

  async getWorkspace(workspaceKey) {
    const ws = this.state.workspaces[workspaceKey];
    if (!ws) return null;
    const mainOwner = this.state.mainSecurity?.ownerUsername || 'admin';
    return {
      workspaceKey,
      ownerUsername: workspaceKey === 'main' ? (ws.ownerUsername || mainOwner) : (ws.ownerUsername || null),
      title: ws.title || (workspaceKey === 'main' ? 'Server Utama' : workspaceKey),
      projectData: ws.projectData || null,
      updatedBy: ws.updatedBy || null,
      updatedAt: ws.updatedAt || null
    };
  }

  async saveWorkspace({ workspaceKey, ownerUsername, title, projectData, updatedBy }) {
    const updatedAt = new Date().toISOString();
    const existing = this.state.workspaces[workspaceKey];
    const resolvedOwner = workspaceKey === 'main'
      ? (existing?.ownerUsername || this.state.mainSecurity?.ownerUsername || ownerUsername || 'admin')
      : (ownerUsername || existing?.ownerUsername || null);
    this.state.workspaces[workspaceKey] = {
      workspaceKey,
      ownerUsername: resolvedOwner,
      title: title || (workspaceKey === 'main' ? 'Server Utama' : workspaceKey),
      projectData,
      updatedBy: updatedBy || null,
      updatedAt
    };
    this.flush();
    return {
      workspaceKey,
      ownerUsername: resolvedOwner,
      title: this.state.workspaces[workspaceKey].title,
      updatedBy: updatedBy || null,
      updatedAt
    };
  }
}

/**
 * MySQL 8 Pool Store Adapter
 */
class MySqlStore {
  constructor(config) {
    this.config = config;
    this.backend = 'mysql';
    this.pool = null;
  }

  async init() {
    const mysql = require('mysql2/promise');
    this.pool = mysql.createPool({
      host: this.config.host,
      port: Number(this.config.port) || 3306,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: 'Z'
    });

    await this.pool.query('SELECT 1');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR(64) NOT NULL,
        display_name VARCHAR(120) NOT NULL,
        role VARCHAR(64) NOT NULL DEFAULT 'teknisi',
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_users_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        workspace_key VARCHAR(96) NOT NULL,
        owner_username VARCHAR(64) NULL,
        title VARCHAR(160) NOT NULL DEFAULT 'Server Utama',
        project_data LONGTEXT NOT NULL,
        access_password_hash VARCHAR(255) NULL,
        access_password_salt VARCHAR(64) NULL,
        is_public_viewable TINYINT(1) NOT NULL DEFAULT 1,
        updated_by VARCHAR(64) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_key),
        KEY idx_workspaces_owner (owner_username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(128) NOT NULL,
        username VARCHAR(64) NOT NULL,
        main_unlocked TINYINT(1) NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (token),
        KEY idx_sessions_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.ensureColumn('workspaces', 'access_password_hash', 'VARCHAR(255) NULL AFTER project_data');
    await this.ensureColumn('workspaces', 'access_password_salt', 'VARCHAR(64) NULL AFTER access_password_hash');
    await this.ensureColumn('workspaces', 'is_public_viewable', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER access_password_salt');
    await this.ensureColumn('user_sessions', 'main_unlocked', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER username');

    const [rows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM users');
    if ((rows[0]?.cnt || 0) === 0) {
      for (const u of buildSeedUsers()) {
        await this.pool.query(
          'INSERT IGNORE INTO users (username, display_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
          [u.username, u.displayName, u.role, u.passwordHash, u.passwordSalt]
        );
      }
    }

    const defSec = buildDefaultMainSecurity();
    await this.pool.query(
      `INSERT IGNORE INTO workspaces (workspace_key, owner_username, title, project_data, access_password_hash, access_password_salt, is_public_viewable, updated_by)
       VALUES ('main', ?, 'Server Utama', 'null', ?, ?, 1, ?)`,
      [defSec.ownerUsername, defSec.passwordHash, defSec.passwordSalt, defSec.ownerUsername]
    );
    await this.pool.query(
      `UPDATE workspaces
       SET owner_username = COALESCE(owner_username, ?),
           access_password_salt = COALESCE(access_password_salt, ?),
           access_password_hash = COALESCE(access_password_hash, ?)
       WHERE workspace_key = 'main'`,
      [defSec.ownerUsername, defSec.passwordSalt, defSec.passwordHash]
    );
    return this.backend;
  }

  async ensureColumn(tableName, colName, colDefSql) {
    const [cols] = await this.pool.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [colName]);
    if (cols.length === 0) {
      await this.pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${colDefSql}`);
    }
  }

  async findUserByUsername(username) {
    const [rows] = await this.pool.query(
      'SELECT id, username, display_name AS displayName, role, password_hash AS passwordHash, password_salt AS passwordSalt, created_at AS createdAt, last_login_at AS lastLoginAt FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1',
      [String(username || '')]
    );
    return rows[0] || null;
  }

  async createUser({ username, displayName, role, passwordSalt, passwordHash }) {
    const [res] = await this.pool.query(
      'INSERT INTO users (username, display_name, role, password_hash, password_salt, last_login_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [username, displayName, role || 'teknisi', passwordHash, passwordSalt]
    );
    return sanitizeUser({
      id: res.insertId,
      username,
      displayName,
      role: role || 'teknisi',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    });
  }

  async touchLastLogin(username) {
    await this.pool.query('UPDATE users SET last_login_at = NOW() WHERE username = ?', [username]);
  }

  async listUsers() {
    const [rows] = await this.pool.query(
      'SELECT id, username, display_name AS displayName, role, created_at AS createdAt, last_login_at AS lastLoginAt FROM users ORDER BY id ASC'
    );
    return rows.map(sanitizeUser);
  }

  async createSession(username, mainUnlocked = false) {
    const token = crypto.randomBytes(32).toString('hex');
    await this.pool.query(
      'INSERT INTO user_sessions (token, username, main_unlocked, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
      [token, username, mainUnlocked ? 1 : 0, SESSION_TTL_DAYS]
    );
    return token;
  }

  async getSessionInfo(token) {
    if (!token) return null;
    const [rows] = await this.pool.query(
      `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.created_at AS createdAt, u.last_login_at AS lastLoginAt, s.main_unlocked AS mainUnlocked
       FROM user_sessions s
       JOIN users u ON LOWER(u.username) = LOWER(s.username)
       WHERE s.token = ? AND s.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    if (!rows[0]) return null;
    return {
      token,
      user: sanitizeUser(rows[0]),
      mainUnlocked: Boolean(rows[0].mainUnlocked)
    };
  }

  async getSessionUser(token) {
    const info = await this.getSessionInfo(token);
    return info?.user || null;
  }

  async setSessionMainUnlocked(token, unlocked) {
    if (token) {
      await this.pool.query('UPDATE user_sessions SET main_unlocked = ? WHERE token = ?', [unlocked ? 1 : 0, token]);
    }
  }

  async deleteSession(token) {
    if (token) {
      await this.pool.query('DELETE FROM user_sessions WHERE token = ?', [token]);
    }
  }

  async getMainWorkspaceSecurity() {
    const [rows] = await this.pool.query(
      "SELECT owner_username AS ownerUsername, access_password_hash AS passwordHash, access_password_salt AS passwordSalt, is_public_viewable AS isPublicViewable, updated_by AS updatedBy, updated_at AS updatedAt FROM workspaces WHERE workspace_key = 'main' LIMIT 1"
    );
    const row = rows[0];
    if (!row) {
      return {
        ownerUsername: 'admin',
        isPublicViewable: true,
        isProtected: true,
        updatedAt: null,
        updatedBy: 'admin'
      };
    }
    return {
      ownerUsername: row.ownerUsername || 'admin',
      isPublicViewable: row.isPublicViewable !== 0,
      isProtected: Boolean(row.passwordHash),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      updatedBy: row.updatedBy || 'admin'
    };
  }

  async verifyMainWorkspacePassword(password) {
    const [rows] = await this.pool.query(
      "SELECT access_password_hash AS passwordHash, access_password_salt AS passwordSalt FROM workspaces WHERE workspace_key = 'main' LIMIT 1"
    );
    const row = rows[0];
    if (!row || !row.passwordHash) {
      const defSec = buildDefaultMainSecurity();
      return verifyPassword(String(password || ''), defSec.passwordSalt, defSec.passwordHash);
    }
    return verifyPassword(String(password || ''), row.passwordSalt || DEFAULT_SEED_SALT, row.passwordHash);
  }

  async updateMainWorkspacePassword({ passwordSalt, passwordHash, ownerUsername, updatedBy }) {
    const [existingRows] = await this.pool.query(
      "SELECT owner_username AS ownerUsername FROM workspaces WHERE workspace_key = 'main' LIMIT 1"
    );
    const owner = existingRows[0]?.ownerUsername || ownerUsername || 'admin';
    await this.pool.query(
      `INSERT INTO workspaces (workspace_key, owner_username, title, project_data, access_password_hash, access_password_salt, is_public_viewable, updated_by)
       VALUES ('main', ?, 'Server Utama', 'null', ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         owner_username = COALESCE(owner_username, VALUES(owner_username)),
         access_password_hash = VALUES(access_password_hash),
         access_password_salt = VALUES(access_password_salt),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [owner, passwordHash, passwordSalt, updatedBy || owner]
    );
    await this.pool.query('UPDATE user_sessions SET main_unlocked = 0');
    return this.getMainWorkspaceSecurity();
  }

  async getWorkspace(workspaceKey) {
    const [rows] = await this.pool.query(
      'SELECT workspace_key AS workspaceKey, owner_username AS ownerUsername, title, project_data AS projectDataRaw, updated_by AS updatedBy, updated_at AS updatedAt FROM workspaces WHERE workspace_key = ? LIMIT 1',
      [workspaceKey]
    );
    const row = rows[0];
    if (!row) return null;
    let projectData = null;
    try {
      projectData = typeof row.projectDataRaw === 'string' ? JSON.parse(row.projectDataRaw) : row.projectDataRaw;
    } catch {
      projectData = null;
    }
    return {
      workspaceKey: row.workspaceKey,
      ownerUsername: row.ownerUsername || (row.workspaceKey === 'main' ? 'admin' : null),
      title: row.title,
      projectData,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null
    };
  }

  async saveWorkspace({ workspaceKey, ownerUsername, title, projectData, updatedBy }) {
    const payload = typeof projectData === 'string' ? projectData : JSON.stringify(projectData);
    const resolvedTitle = title || (workspaceKey === 'main' ? 'Server Utama' : workspaceKey);
    const defSec = buildDefaultMainSecurity();
    if (workspaceKey === 'main') {
      await this.pool.query(
        `INSERT INTO workspaces (workspace_key, owner_username, title, project_data, access_password_hash, access_password_salt, is_public_viewable, updated_by)
         VALUES ('main', ?, ?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
           owner_username = COALESCE(owner_username, VALUES(owner_username)),
           title = VALUES(title),
           project_data = VALUES(project_data),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
        [ownerUsername || defSec.ownerUsername, resolvedTitle, payload, defSec.passwordHash, defSec.passwordSalt, updatedBy || null]
      );
    } else {
      await this.pool.query(
        `INSERT INTO workspaces (workspace_key, owner_username, title, project_data, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           owner_username = VALUES(owner_username),
           title = VALUES(title),
           project_data = VALUES(project_data),
           updated_by = VALUES(updated_by),
           updated_at = CURRENT_TIMESTAMP`,
        [workspaceKey, ownerUsername || null, resolvedTitle, payload, updatedBy || null]
      );
    }
    const saved = await this.getWorkspace(workspaceKey);
    return {
      workspaceKey,
      ownerUsername: saved?.ownerUsername || (workspaceKey === 'main' ? defSec.ownerUsername : ownerUsername || null),
      title: saved?.title || resolvedTitle,
      updatedBy: saved?.updatedBy || updatedBy || null,
      updatedAt: saved?.updatedAt || new Date().toISOString()
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

async function createStorageAdapter({
  dbFilePath = DEFAULT_DB_FILE,
  mysqlConfig = null,
  mysqlRetries = Number(process.env.MYSQL_CONNECT_RETRIES) || 1,
  mysqlRetryDelayMs = Number(process.env.MYSQL_RETRY_DELAY_MS) || 2000
} = {}) {
  const cfg = mysqlConfig || (process.env.MYSQL_HOST ? {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'netmap',
    password: process.env.MYSQL_PASSWORD || 'netmap_pass',
    database: process.env.MYSQL_DATABASE || 'netmap_db'
  } : null);

  if (cfg && cfg.host) {
    const maxAttempts = Math.max(1, Number(mysqlRetries) || (process.env.NODE_ENV === 'production' ? 10 : 1));
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const mysqlStore = new MySqlStore(cfg);
        await mysqlStore.init();
        console.log(`[NetMapDB] Terhubung ke MySQL (${cfg.host}:${cfg.port}/${cfg.database}).`);
        return mysqlStore;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          console.warn(`[NetMapDB] Menunggu MySQL siap (${attempt}/${maxAttempts}): ${err.message}`);
          await new Promise((r) => setTimeout(r, mysqlRetryDelayMs));
        }
      }
    }
    console.warn(`[NetMapDB] MySQL tidak dapat diakses (${lastErr?.message || 'unknown'}). Beralih ke penyimpanan file lokal.`);
  }

  const fileStore = new JsonFileStore(dbFilePath);
  await fileStore.init();
  console.log(`[NetMapDB] Menggunakan server file store: ${dbFilePath}`);
  return fileStore;
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Payload terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function extractBearerToken(req) {
  const auth = req.headers?.authorization || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function createNetMapRequestHandler(store, rootDir = ROOT_DIR) {
  return async (req, res) => {
    const reqUrl = req.url || '/';
    const rawPath = decodeURI(reqUrl.split('?')[0]);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    // --- API Endpoints ---
    if (rawPath.startsWith('/api/')) {
      try {
        if (req.method === 'GET' && rawPath === '/api/health') {
          sendJson(res, 200, { ok: true, storageBackend: store.backend });
          return;
        }

        if (req.method === 'GET' && rawPath === '/api/auth/session') {
          const token = extractBearerToken(req);
          const sessionInfo = await store.getSessionInfo(token);
          const mainSec = await store.getMainWorkspaceSecurity();
          sendJson(res, 200, {
            authenticated: Boolean(sessionInfo?.user),
            user: sessionInfo?.user || null,
            mainUnlocked: Boolean(sessionInfo?.mainUnlocked),
            mainOwnerUsername: mainSec?.ownerUsername || 'admin',
            canManageServerPassword: Boolean(canManageMainServer(sessionInfo?.user, mainSec)),
            storageBackend: store.backend
          });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/auth/login') {
          const body = await readJsonBody(req);
          const username = String(body.username || '').trim();
          const password = String(body.password || '');
          const workspacePassword = typeof body.workspacePassword === 'string' ? body.workspacePassword : '';
          const requireMainUnlock = Boolean(body.requireMainUnlock);

          const userRow = await store.findUserByUsername(username);
          if (!userRow || !verifyPassword(password, userRow.passwordSalt, userRow.passwordHash)) {
            sendJson(res, 401, { error: 'Username atau password salah.' });
            return;
          }

          let mainUnlocked = false;
          if (workspacePassword) {
            const okServerPass = await store.verifyMainWorkspacePassword(workspacePassword);
            if (!okServerPass) {
              sendJson(res, 403, { error: 'Password akses Server Utama salah.' });
              return;
            }
            mainUnlocked = true;
          } else if (requireMainUnlock) {
            sendJson(res, 403, { error: 'Masukkan password akses Server Utama untuk menggunakan workspace Server Utama.' });
            return;
          }

          await store.touchLastLogin(userRow.username);
          const token = await store.createSession(userRow.username, mainUnlocked);
          const user = sanitizeUser({ ...userRow, lastLoginAt: new Date().toISOString() });
          const mainSec = await store.getMainWorkspaceSecurity();
          sendJson(res, 200, {
            token,
            user,
            mainUnlocked,
            mainOwnerUsername: mainSec?.ownerUsername || 'admin',
            canManageServerPassword: Boolean(canManageMainServer(user, mainSec)),
            storageBackend: store.backend
          });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/auth/register') {
          const body = await readJsonBody(req);
          const username = String(body.username || '').trim();
          const displayName = String(body.displayName || username).trim() || username;
          const password = String(body.password || '');
          const role = body.role === 'admin' ? 'admin' : 'teknisi';
          const workspacePassword = typeof body.workspacePassword === 'string' ? body.workspacePassword : '';
          const requireMainUnlock = Boolean(body.requireMainUnlock);

          if (!isValidUsername(username)) {
            sendJson(res, 400, { error: 'Username harus 3-32 karakter (huruf, angka, titik, garis bawah, atau tanda hubung).' });
            return;
          }
          if (password.length < 4) {
            sendJson(res, 400, { error: 'Password minimal 4 karakter.' });
            return;
          }
          const existing = await store.findUserByUsername(username);
          if (existing) {
            sendJson(res, 409, { error: `Username "${username}" sudah terdaftar.` });
            return;
          }

          if (role === 'admin') {
            const okAdminPass = workspacePassword ? await store.verifyMainWorkspacePassword(workspacePassword) : false;
            if (!okAdminPass) {
              sendJson(res, 403, { error: 'Password Server Utama diperlukan untuk mendaftar sebagai Admin Utama.' });
              return;
            }
          }

          let mainUnlocked = false;
          if (workspacePassword) {
            const okServerPass = await store.verifyMainWorkspacePassword(workspacePassword);
            if (!okServerPass) {
              sendJson(res, 403, { error: 'Password akses Server Utama salah.' });
              return;
            }
            mainUnlocked = true;
          } else if (requireMainUnlock) {
            sendJson(res, 403, { error: 'Masukkan password akses Server Utama untuk menggunakan workspace Server Utama.' });
            return;
          }

          const { salt, hash } = createScryptHash(password);
          const newUser = await store.createUser({
            username,
            displayName,
            role,
            passwordSalt: salt,
            passwordHash: hash
          });
          const token = await store.createSession(newUser.username, mainUnlocked);
          const mainSec = await store.getMainWorkspaceSecurity();
          sendJson(res, 201, {
            token,
            user: newUser,
            mainUnlocked,
            mainOwnerUsername: mainSec?.ownerUsername || 'admin',
            canManageServerPassword: Boolean(canManageMainServer(newUser, mainSec)),
            storageBackend: store.backend
          });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/auth/logout') {
          const token = extractBearerToken(req);
          await store.deleteSession(token);
          sendJson(res, 200, { ok: true });
          return;
        }

        // Public Read-Only endpoint for Server Utama (anyone can view publicly, writes still require auth + server password)
        if (req.method === 'GET' && rawPath === '/api/workspaces/main') {
          const token = extractBearerToken(req);
          const sessionInfo = await store.getSessionInfo(token);
          const mainSec = await store.getMainWorkspaceSecurity();
          if (mainSec.isPublicViewable === false && !sessionInfo?.user) {
            sendJson(res, 401, { error: 'Server Utama saat ini tidak dibuka untuk publik. Silakan login.' });
            return;
          }
          const ws = await store.getWorkspace('main');
          const metaOnly = reqUrl.includes('meta=1');
          sendJson(res, 200, {
            workspaceKey: 'main',
            title: ws?.title || 'Server Utama',
            ownerUsername: ws?.ownerUsername || mainSec?.ownerUsername || 'admin',
            ...(metaOnly ? {} : { projectData: ws?.projectData || null }),
            updatedBy: ws?.updatedBy || null,
            updatedAt: ws?.updatedAt || null,
            isProtected: Boolean(mainSec?.isProtected),
            isPublicViewable: mainSec?.isPublicViewable !== false,
            mainUnlocked: Boolean(sessionInfo?.mainUnlocked),
            canManageServerPassword: Boolean(canManageMainServer(sessionInfo?.user, mainSec)),
            storageBackend: store.backend
          });
          return;
        }

        // All routes below require an authenticated technician session
        const token = extractBearerToken(req);
        const sessionInfo = await store.getSessionInfo(token);
        const sessionUser = sessionInfo?.user || null;
        if (!sessionUser) {
          sendJson(res, 401, { error: 'Silakan login terlebih dahulu.' });
          return;
        }

        if (req.method === 'GET' && rawPath === '/api/users') {
          const users = await store.listUsers();
          sendJson(res, 200, { users, storageBackend: store.backend });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/workspaces/main/unlock') {
          const body = await readJsonBody(req);
          const serverPassword = String(body.password || '');
          const valid = await store.verifyMainWorkspacePassword(serverPassword);
          if (!valid) {
            sendJson(res, 403, { error: 'Password akses Server Utama salah.' });
            return;
          }
          await store.setSessionMainUnlocked(token, true);
          const mainSec = await store.getMainWorkspaceSecurity();
          sendJson(res, 200, {
            ok: true,
            mainUnlocked: true,
            mainOwnerUsername: mainSec?.ownerUsername || 'admin',
            canManageServerPassword: Boolean(canManageMainServer(sessionUser, mainSec)),
            storageBackend: store.backend
          });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/workspaces/main/lock') {
          await store.setSessionMainUnlocked(token, false);
          sendJson(res, 200, { ok: true, mainUnlocked: false, storageBackend: store.backend });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/workspaces/main/password') {
          const mainSec = await store.getMainWorkspaceSecurity();
          if (!canManageMainServer(sessionUser, mainSec)) {
            sendJson(res, 403, { error: 'Hanya Admin Utama atau pembuat server yang boleh mengubah password Server Utama.' });
            return;
          }
          const body = await readJsonBody(req);
          if (typeof body.currentPassword === 'string' && body.currentPassword.length > 0) {
            const okCurrent = await store.verifyMainWorkspacePassword(body.currentPassword);
            if (!okCurrent) {
              sendJson(res, 403, { error: 'Password server saat ini salah.' });
              return;
            }
          }
          const newPassword = String(body.newPassword || '');
          if (newPassword.length < 4) {
            sendJson(res, 400, { error: 'Password server baru minimal 4 karakter.' });
            return;
          }
          const { salt, hash } = createScryptHash(newPassword);
          const updatedSec = await store.updateMainWorkspacePassword({
            passwordSalt: salt,
            passwordHash: hash,
            ownerUsername: mainSec?.ownerUsername || sessionUser.username,
            updatedBy: sessionUser.username
          });
          await store.setSessionMainUnlocked(token, true);
          sendJson(res, 200, {
            ok: true,
            mainUnlocked: true,
            ownerUsername: updatedSec.ownerUsername,
            updatedBy: sessionUser.username,
            updatedAt: updatedSec.updatedAt,
            storageBackend: store.backend
          });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/workspaces/clone') {
          const body = await readJsonBody(req);
          const fromKey = String(body.fromKey || '').trim();
          const toKey = String(body.toKey || '').trim();
          if (!isAllowedWorkspaceKey(fromKey, sessionUser.username) || !isAllowedWorkspaceKey(toKey, sessionUser.username)) {
            sendJson(res, 403, { error: 'Akses workspace ditolak.' });
            return;
          }
          if (toKey === 'main' && !sessionInfo.mainUnlocked) {
            const suppliedPass = typeof body.workspacePassword === 'string' ? body.workspacePassword : '';
            if (!suppliedPass || !(await store.verifyMainWorkspacePassword(suppliedPass))) {
              sendJson(res, 403, { error: 'Workspace Server Utama terkunci. Masukkan password akses Server Utama terlebih dahulu.' });
              return;
            }
            await store.setSessionMainUnlocked(token, true);
          }
          const srcWs = await store.getWorkspace(fromKey);
          if (!srcWs || !srcWs.projectData) {
            sendJson(res, 404, { error: `Workspace sumber "${fromKey}" masih kosong.` });
            return;
          }
          const clonedData = {
            ...srcWs.projectData,
            updatedAt: new Date().toISOString()
          };
          const mainSec = toKey === 'main' ? await store.getMainWorkspaceSecurity() : null;
          const saved = await store.saveWorkspace({
            workspaceKey: toKey,
            ownerUsername: toKey === 'main' ? (mainSec?.ownerUsername || 'admin') : sessionUser.username,
            title: toKey === 'main' ? 'Server Utama' : `Workspace ${sessionUser.displayName}`,
            projectData: clonedData,
            updatedBy: sessionUser.username
          });
          sendJson(res, 200, {
            ok: true,
            workspaceKey: toKey,
            projectData: clonedData,
            updatedBy: saved.updatedBy,
            updatedAt: saved.updatedAt,
            storageBackend: store.backend
          });
          return;
        }

        if (rawPath.startsWith('/api/workspaces/')) {
          const key = decodeURIComponent(rawPath.slice('/api/workspaces/'.length)).trim();
          if (!isAllowedWorkspaceKey(key, sessionUser.username)) {
            sendJson(res, 403, { error: 'Anda hanya dapat mengakses Server Utama atau workspace akun sendiri.' });
            return;
          }

          if (req.method === 'GET') {
            const ws = await store.getWorkspace(key);
            const metaOnly = reqUrl.includes('meta=1');
            sendJson(res, 200, {
              workspaceKey: key,
              title: ws?.title || (key === 'main' ? 'Server Utama' : sessionUser.displayName),
              ownerUsername: ws?.ownerUsername || (key === 'main' ? 'admin' : sessionUser.username),
              ...(metaOnly ? {} : { projectData: ws?.projectData || null }),
              updatedBy: ws?.updatedBy || null,
              updatedAt: ws?.updatedAt || null,
              storageBackend: store.backend
            });
            return;
          }

          if (req.method === 'PUT' || req.method === 'POST') {
            const body = await readJsonBody(req);
            if (key === 'main' && !sessionInfo.mainUnlocked) {
              const suppliedPass = typeof body.workspacePassword === 'string' ? body.workspacePassword : '';
              if (!suppliedPass || !(await store.verifyMainWorkspacePassword(suppliedPass))) {
                sendJson(res, 403, { error: 'Workspace Server Utama terkunci. Masukkan password akses Server Utama terlebih dahulu.' });
                return;
              }
              await store.setSessionMainUnlocked(token, true);
            }
            const projectData = body.projectData;
            if (!projectData || typeof projectData !== 'object') {
              sendJson(res, 400, { error: 'Data projectData tidak valid.' });
              return;
            }
            const mainSec = key === 'main' ? await store.getMainWorkspaceSecurity() : null;
            const saved = await store.saveWorkspace({
              workspaceKey: key,
              ownerUsername: key === 'main' ? (mainSec?.ownerUsername || 'admin') : sessionUser.username,
              title: key === 'main' ? 'Server Utama' : (projectData.name || sessionUser.displayName),
              projectData,
              updatedBy: sessionUser.username
            });
            sendJson(res, 200, {
              ok: true,
              ...saved,
              storageBackend: store.backend
            });
            return;
          }
        }

        sendJson(res, 404, { error: 'Endpoint API tidak ditemukan.' });
      } catch (err) {
        sendJson(res, 500, { error: err.message || 'Internal Server Error' });
      }
      return;
    }

    // --- Static Files ---
    let reqPath = rawPath;
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const filePath = path.resolve(rootDir, '.' + reqPath);
    if (!filePath.startsWith(path.resolve(rootDir))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${reqPath}`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const cacheControl = ext === '.html'
        ? 'no-store, no-cache, must-revalidate'
        : ((ext === '.css' || ext === '.js')
            ? 'no-cache, must-revalidate'
            : 'public, max-age=604800');
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  };
}

async function startServer() {
  const store = await createStorageAdapter({
    mysqlRetries: Number(process.env.MYSQL_CONNECT_RETRIES) || (process.env.NODE_ENV === 'production' ? 12 : 1)
  });
  const server = http.createServer(createNetMapRequestHandler(store, ROOT_DIR));
  server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n======================================================`);
    console.log(`  SmartSchool NetMap Server Berjalan di: ${url} (bind ${HOST}:${PORT})`);
    console.log(`  Database Mode: ${store.backend === 'mysql' ? 'MySQL 8' : 'Local Server File DB'}`);
    console.log(`  Tekan Ctrl + C untuk menghentikan server.`);
    console.log(`======================================================\n`);

    if (process.env.NODE_ENV !== 'production' && !process.env.NO_BROWSER) {
      const openCmd = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
      exec(openCmd, (err) => {
        if (err) {
          console.log(`Silakan buka browser manual di: ${url}`);
        }
      });
    }
  });

  const shutdown = (signal) => {
    console.log(`\n[NetMapServer] Menerima ${signal}, menutup server dengan aman...`);
    server.close(async () => {
      try {
        await store.close?.();
      } catch { /* ignore */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return { server, store };
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[NetMapServer] Gagal menjalankan server:', err);
    process.exit(1);
  });
}

module.exports = {
  createStorageAdapter,
  createNetMapRequestHandler,
  JsonFileStore,
  MySqlStore,
  verifyPassword,
  hashSha256
};
