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
const PRESENCE_TTL_MS = 15000;
const AVATAR_SCALE_MIN = 0.8;
const AVATAR_SCALE_MAX = 1.75;
const AVATAR_SCALE_DEFAULT = 1.0;

/**
 * Clamp technician avatar scale inside fair multiplayer limits on the server.
 * @param {*} rawScale
 * @returns {number}
 */
function clampAvatarScale(rawScale) {
  const n = Number(rawScale);
  if (!Number.isFinite(n) || n <= 0) return AVATAR_SCALE_DEFAULT;
  const clamped = Math.min(AVATAR_SCALE_MAX, Math.max(AVATAR_SCALE_MIN, n));
  return Math.round(clamped * 100) / 100;
}

const DEFAULT_SEED_SALT = 'netmap_salt_2026';
const DEFAULT_MAIN_SERVER_PASSWORD = 'server123';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsFrame(opcode, payloadInput = '') {
  const payload = Buffer.isBuffer(payloadInput)
    ? payloadInput
    : Buffer.from(String(payloadInput), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function getPresenceStore(store) {
  if (!store._presenceMap) {
    store._presenceMap = new Map();
  }
  if (!store._presenceSseClients) {
    store._presenceSseClients = new Set();
  }
  if (!store._presenceWsClients) {
    store._presenceWsClients = new Set();
  }
  const map = store._presenceMap;
  const sseClients = store._presenceSseClients;
  const wsClients = store._presenceWsClients;

  const broadcast = (workspaceKey, payloadObj, excludeClientId = '') => {
    const targetWs = workspaceKey || 'main';
    const jsonStr = JSON.stringify(payloadObj);

    if (wsClients.size > 0) {
      const frame = encodeWsFrame(0x1, jsonStr);
      for (const client of Array.from(wsClients)) {
        if (client.workspaceKey !== targetWs) continue;
        if (excludeClientId && client.clientId === excludeClientId) continue;
        try {
          if (!client.socket.destroyed && client.socket.writable) {
            client.socket.write(frame);
          } else {
            wsClients.delete(client);
          }
        } catch {
          wsClients.delete(client);
        }
      }
    }

    if (sseClients.size > 0) {
      const ssePayload = `event: presence\ndata: ${jsonStr}\n\n`;
      for (const client of Array.from(sseClients)) {
        if (client.workspaceKey !== targetWs) continue;
        if (excludeClientId && client.clientId === excludeClientId) continue;
        try {
          if (!client.res.writableEnded) {
            client.res.write(ssePayload);
          } else {
            sseClients.delete(client);
          }
        } catch {
          sseClients.delete(client);
        }
      }
    }
  };

  const prune = () => {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const expired = [];
    for (const [cid, entry] of map.entries()) {
      if (!entry || (entry.updatedAt || 0) < cutoff) {
        map.delete(cid);
        if (entry?.clientId) expired.push(entry);
      }
    }
    for (const item of expired) {
      broadcast(item.workspaceKey, { type: 'peer-remove', clientId: item.clientId });
    }
  };

  return {
    list(workspaceKey = 'main') {
      prune();
      const targetKey = workspaceKey || 'main';
      return Array.from(map.values()).filter((p) => p.workspaceKey === targetKey);
    },
    hasActiveWsClient(clientId) {
      if (!clientId) return false;
      for (const client of wsClients) {
        if (client.clientId === clientId && !client.socket.destroyed) return true;
      }
      return false;
    },
    upsert(sessionUser, payload = {}, token = '') {
      prune();
      const clientId = String(payload.clientId || '').trim();
      if (!clientId) return this.list(payload.workspaceKey || 'main');
      const requestedWs = String(payload.workspaceKey || 'main').trim();
      const workspaceKey = requestedWs === `user_${sessionUser.username}` ? requestedWs : 'main';
      const prevEntry = map.get(clientId);
      if (prevEntry && prevEntry.workspaceKey !== workspaceKey) {
        broadcast(prevEntry.workspaceKey, { type: 'peer-remove', clientId }, clientId);
      }
      const now = Date.now();
      const entry = {
        clientId,
        tokenHash: token ? hashSha256('pres', token).slice(0, 16) : '',
        username: sessionUser.username,
        displayName: sessionUser.displayName || sessionUser.username,
        role: sessionUser.role || 'teknisi',
        workspaceKey,
        viewMode: payload.viewMode === '2d' ? '2d' : '3d',
        avatarMode: Boolean(payload.avatarMode),
        perspective: payload.perspective === 'fpp' ? 'fpp' : 'tpp',
        x: Number.isFinite(Number(payload.x)) ? Number(payload.x) : 0,
        y: Number.isFinite(Number(payload.y)) ? Number(payload.y) : 0,
        z: Number.isFinite(Number(payload.z)) ? Number(payload.z) : 0,
        vx: Number.isFinite(Number(payload.vx)) ? Number(payload.vx) : 0,
        vy: Number.isFinite(Number(payload.vy)) ? Number(payload.vy) : 0,
        vz: Number.isFinite(Number(payload.vz)) ? Number(payload.vz) : 0,
        normX: Number.isFinite(Number(payload.normX)) ? Number(payload.normX) : 0.5,
        normY: Number.isFinite(Number(payload.normY)) ? Number(payload.normY) : 0.5,
        yaw: Number.isFinite(Number(payload.yaw)) ? Number(payload.yaw) : 0,
        isMoving: Boolean(payload.isMoving),
        isRunning: Boolean(payload.isRunning),
        isGrounded: payload.isGrounded !== false,
        isCarrying: Boolean(payload.isCarrying),
        walkPhase: Number.isFinite(Number(payload.walkPhase)) ? Number(payload.walkPhase) : 0,
        avatarScale: clampAvatarScale(payload.avatarScale),
        nearestDeviceId: payload.nearestDeviceId || null,
        colorHex: typeof payload.colorHex === 'string' ? payload.colorHex : '#2563eb',
        clientTs: Number.isFinite(Number(payload.clientTs)) ? Number(payload.clientTs) : now,
        updatedAt: now
      };
      map.set(clientId, entry);
      broadcast(workspaceKey, { type: 'peer-update', peer: entry }, clientId);
      return this.list(workspaceKey);
    },
    remove({ clientId = '', token = '', username = '' } = {}) {
      const removed = [];
      if (clientId && map.has(clientId)) {
        removed.push(map.get(clientId));
        map.delete(clientId);
      }
      if (token) {
        const th = hashSha256('pres', token).slice(0, 16);
        for (const [cid, entry] of map.entries()) {
          if (entry.tokenHash === th || (username && entry.username === username)) {
            removed.push(entry);
            map.delete(cid);
          }
        }
      }
      for (const item of removed) {
        if (item?.clientId) {
          broadcast(item.workspaceKey, { type: 'peer-remove', clientId: item.clientId });
        }
      }
    },
    subscribeSse(res, workspaceKey = 'main', clientId = '') {
      res.socket?.setNoDelay?.(true);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*'
      });
      const targetWs = workspaceKey || 'main';
      const clientRec = { res, workspaceKey: targetWs, clientId };
      sseClients.add(clientRec);

      const snapshot = JSON.stringify({
        type: 'peers-snapshot',
        peers: this.list(targetWs)
      });
      res.write(`event: presence\ndata: ${snapshot}\n\n`);

      const keepAlive = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(keepAlive);
          sseClients.delete(clientRec);
          return;
        }
        try {
          res.write(': ping\n\n');
        } catch {
          clearInterval(keepAlive);
          sseClients.delete(clientRec);
        }
      }, 15000);
      keepAlive.unref?.();

      res.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(clientRec);
      });
    },
    _wsClients: wsClients
  };
}

function attachPresenceRealtime(server, store) {
  if (!server || server._netmapWsAttached) return;
  server._netmapWsAttached = true;
  const presence = getPresenceStore(store);
  const wsClients = presence._wsClients;

  server.on('upgrade', async (req, socket, head) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      if (parsedUrl.pathname !== '/ws/presence') {
        socket.destroy();
        return;
      }

      const wsKey = req.headers['sec-websocket-key'];
      if (!wsKey || typeof wsKey !== 'string') {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const requestedWs = parsedUrl.searchParams.get('workspace') || 'main';
      const token = parsedUrl.searchParams.get('token') || extractBearerToken(req);
      const clientId = String(parsedUrl.searchParams.get('clientId') || '').trim();
      const sessionUser = token ? await store.getSessionUser(token) : null;

      if (requestedWs !== 'main' && (!sessionUser || requestedWs !== `user_${sessionUser.username}`)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      if (requestedWs === 'main' && !sessionUser) {
        const mainSec = await store.getMainWorkspaceSecurity();
        if (mainSec.isPublicViewable === false) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      const accept = crypto
        .createHash('sha1')
        .update(wsKey.trim() + WS_GUID)
        .digest('base64');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n'
        + 'Upgrade: websocket\r\n'
        + 'Connection: Upgrade\r\n'
        + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 15000);

      const clientRec = {
        socket,
        workspaceKey: requestedWs,
        clientId,
        token,
        sessionUser,
        hasPublished: false,
        lastPongAt: Date.now()
      };
      wsClients.add(clientRec);

      const snapshotMsg = JSON.stringify({
        type: 'peers-snapshot',
        peers: presence.list(requestedWs)
      });
      socket.write(encodeWsFrame(0x1, snapshotMsg));

      let rxBuf = Buffer.alloc(0);
      let fragOpcode = 0;
      let fragChunks = [];

      const handleJsonMessage = (rawText) => {
        try {
          const msg = JSON.parse(rawText);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'ping') {
            if (!socket.destroyed && socket.writable) {
              socket.write(encodeWsFrame(0x1, JSON.stringify({ type: 'pong', ts: Date.now() })));
            }
            return;
          }
          if (msg.type === 'presence' && clientRec.sessionUser) {
            if (msg.clientId) clientRec.clientId = String(msg.clientId).trim();
            if (msg.workspaceKey) {
              const reqKey = String(msg.workspaceKey).trim();
              clientRec.workspaceKey = reqKey === `user_${clientRec.sessionUser.username}` ? reqKey : 'main';
            }
            clientRec.hasPublished = true;
            presence.upsert(clientRec.sessionUser, msg, clientRec.token);
          } else if (msg.type === 'leave' && clientRec.sessionUser) {
            presence.remove({
              clientId: clientRec.clientId || String(msg.clientId || ''),
              token: clientRec.token,
              username: clientRec.sessionUser.username
            });
          }
        } catch {
          // ignore malformed JSON frames
        }
      };

      const processFrames = () => {
        while (rxBuf.length >= 2) {
          const b0 = rxBuf[0];
          const b1 = rxBuf[1];
          const fin = Boolean(b0 & 0x80);
          const opcode = b0 & 0x0f;
          const masked = Boolean(b1 & 0x80);
          let payloadLen = b1 & 0x7f;
          let offset = 2;

          if (payloadLen === 126) {
            if (rxBuf.length < 4) return;
            payloadLen = rxBuf.readUInt16BE(2);
            offset = 4;
          } else if (payloadLen === 127) {
            if (rxBuf.length < 10) return;
            const bigLen = rxBuf.readBigUInt64BE(2);
            if (bigLen > 262144n) {
              socket.destroy();
              return;
            }
            payloadLen = Number(bigLen);
            offset = 10;
          }

          if (!masked || payloadLen > 262144) {
            socket.destroy();
            return;
          }

          const totalLen = offset + 4 + payloadLen;
          if (rxBuf.length < totalLen) return;

          const mask = [rxBuf[offset], rxBuf[offset + 1], rxBuf[offset + 2], rxBuf[offset + 3]];
          const payload = Buffer.allocUnsafe(payloadLen);
          const dataStart = offset + 4;
          for (let i = 0; i < payloadLen; i++) {
            payload[i] = rxBuf[dataStart + i] ^ mask[i & 3];
          }
          rxBuf = rxBuf.subarray(totalLen);

          if (opcode === 0x8) {
            try { socket.write(encodeWsFrame(0x8, Buffer.alloc(0))); } catch {}
            socket.end();
            return;
          }
          if (opcode === 0x9) {
            try { socket.write(encodeWsFrame(0xA, payload)); } catch {}
            continue;
          }
          if (opcode === 0xA) {
            clientRec.lastPongAt = Date.now();
            continue;
          }

          if (opcode === 0x0) {
            fragChunks.push(payload);
          } else if (opcode === 0x1 || opcode === 0x2) {
            fragOpcode = opcode;
            fragChunks = [payload];
          } else {
            continue;
          }

          if (fin) {
            if (fragOpcode === 0x1) {
              const text = Buffer.concat(fragChunks).toString('utf8');
              fragChunks = [];
              fragOpcode = 0;
              handleJsonMessage(text);
            } else {
              fragChunks = [];
              fragOpcode = 0;
            }
          }
        }
      };

      socket.on('data', (chunk) => {
        rxBuf = rxBuf.length > 0 ? Buffer.concat([rxBuf, chunk]) : chunk;
        processFrames();
      });

      const pingTimer = setInterval(() => {
        if (socket.destroyed) {
          clearInterval(pingTimer);
          return;
        }
        if (Date.now() - clientRec.lastPongAt > 45000) {
          socket.destroy();
          return;
        }
        try {
          socket.write(encodeWsFrame(0x9, Buffer.from('hb')));
        } catch {
          socket.destroy();
        }
      }, 15000);
      pingTimer.unref?.();

      const cleanup = () => {
        clearInterval(pingTimer);
        wsClients.delete(clientRec);
        if (clientRec.hasPublished && clientRec.clientId && !presence.hasActiveWsClient(clientRec.clientId)) {
          presence.remove({ clientId: clientRec.clientId });
        }
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);

      if (head && head.length > 0) {
        rxBuf = head;
        processFrames();
      }
    } catch {
      try { socket.destroy(); } catch {}
    }
  });
}

function createNetMapRequestHandler(store, rootDir = ROOT_DIR) {
  const presence = getPresenceStore(store);
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
          let clientId = '';
          try {
            const body = await readJsonBody(req);
            clientId = String(body?.clientId || '');
          } catch { /* ignore empty body */ }
          const sessUser = token ? await store.getSessionUser(token) : null;
          presence.remove({ clientId, token, username: sessUser?.username || '' });
          await store.deleteSession(token);
          sendJson(res, 200, { ok: true });
          return;
        }

        // Real-time Server-Sent Events stream for workspace presence push
        if (req.method === 'GET' && rawPath === '/api/presence/stream') {
          const parsedUrl = new URL(reqUrl, 'http://localhost');
          const requestedWs = parsedUrl.searchParams.get('workspace') || 'main';
          const clientId = String(parsedUrl.searchParams.get('clientId') || '').trim();
          const token = parsedUrl.searchParams.get('token') || extractBearerToken(req);
          const sessionUser = token ? await store.getSessionUser(token) : null;
          if (requestedWs !== 'main' && (!sessionUser || requestedWs !== `user_${sessionUser.username}`)) {
            sendJson(res, 403, { error: 'Akses stream kehadiran workspace ditolak.' });
            return;
          }
          if (requestedWs === 'main' && !sessionUser) {
            const mainSec = await store.getMainWorkspaceSecurity();
            if (mainSec.isPublicViewable === false) {
              sendJson(res, 401, { error: 'Server Utama saat ini tidak dibuka untuk publik. Silakan login.' });
              return;
            }
          }
          presence.subscribeSse(res, requestedWs, clientId);
          return;
        }

        // Public Read-Only presence listing for Server Utama ('main')
        if (req.method === 'GET' && rawPath === '/api/presence') {
          const parsedUrl = new URL(reqUrl, 'http://localhost');
          const requestedWs = parsedUrl.searchParams.get('workspace') || 'main';
          const token = extractBearerToken(req);
          const sessionUser = token ? await store.getSessionUser(token) : null;
          if (requestedWs !== 'main' && (!sessionUser || requestedWs !== `user_${sessionUser.username}`)) {
            sendJson(res, 403, { error: 'Akses daftar kehadiran workspace ditolak.' });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            workspaceKey: requestedWs,
            peers: presence.list(requestedWs)
          });
          return;
        }

        // Beacon/tab-close cleanup endpoint (accepts token in body or query when sendBeacon is used)
        if (req.method === 'POST' && rawPath === '/api/presence/leave') {
          const body = await readJsonBody(req);
          const token = extractBearerToken(req) || String(body?.token || '');
          const sessUser = token ? await store.getSessionUser(token) : null;
          presence.remove({
            clientId: String(body?.clientId || ''),
            token,
            username: sessUser?.username || ''
          });
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

        if (rawPath === '/api/presence' && (req.method === 'POST' || req.method === 'PUT')) {
          const body = await readJsonBody(req);
          const peers = presence.upsert(sessionUser, body, token);
          sendJson(res, 200, { ok: true, peers });
          return;
        }

        if (req.method === 'DELETE' && rawPath === '/api/presence') {
          const parsedUrl = new URL(reqUrl, 'http://localhost');
          const clientId = parsedUrl.searchParams.get('clientId') || '';
          presence.remove({ clientId, token, username: sessionUser.username });
          sendJson(res, 200, { ok: true });
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
      const isManifest = reqPath === '/manifest.json' || ext === '.webmanifest';
      const isSw = reqPath === '/sw.js';
      const contentType = isManifest
        ? 'application/manifest+json; charset=utf-8'
        : (MIME_TYPES[ext] || 'application/octet-stream');
      const cacheControl = ext === '.html'
        ? 'no-store, no-cache, must-revalidate'
        : ((ext === '.css' || ext === '.js' || isManifest || isSw)
            ? 'no-cache, must-revalidate'
            : 'public, max-age=604800');
      const headers = {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Access-Control-Allow-Origin': '*'
      };
      if (isSw) {
        headers['Service-Worker-Allowed'] = '/';
      }
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    });
  };
}

async function startServer() {
  const store = await createStorageAdapter({
    mysqlRetries: Number(process.env.MYSQL_CONNECT_RETRIES) || (process.env.NODE_ENV === 'production' ? 12 : 1)
  });
  const server = http.createServer(createNetMapRequestHandler(store, ROOT_DIR));
  server.on('connection', (socket) => socket.setNoDelay(true));
  attachPresenceRealtime(server, store);
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
  attachPresenceRealtime,
  getPresenceStore,
  encodeWsFrame,
  clampAvatarScale,
  AVATAR_SCALE_MIN,
  AVATAR_SCALE_MAX,
  AVATAR_SCALE_DEFAULT,
  JsonFileStore,
  MySqlStore,
  verifyPassword,
  hashSha256
};
