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
const ROOT_DIR = __dirname;
const DEFAULT_DB_FILE = path.join(ROOT_DIR, 'data', 'netmap-server-db.json');
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const SESSION_TTL_DAYS = 30;
const DEFAULT_SEED_SALT = 'netmap_salt_2026';

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
      workspaces: {}
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
          workspaces: parsed.workspaces && typeof parsed.workspaces === 'object' ? parsed.workspaces : {}
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

  async createSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
    this.state.sessions[token] = { username, createdAt: new Date(now).toISOString(), expiresAt };
    this.flush();
    return token;
  }

  async getSessionUser(token) {
    if (!token) return null;
    const sess = this.state.sessions[token];
    if (!sess) return null;
    if (new Date(sess.expiresAt).getTime() <= Date.now()) {
      delete this.state.sessions[token];
      this.flush();
      return null;
    }
    const user = await this.findUserByUsername(sess.username);
    return sanitizeUser(user);
  }

  async deleteSession(token) {
    if (token && this.state.sessions[token]) {
      delete this.state.sessions[token];
      this.flush();
    }
  }

  async getWorkspace(workspaceKey) {
    const ws = this.state.workspaces[workspaceKey];
    if (!ws) return null;
    return {
      workspaceKey,
      ownerUsername: ws.ownerUsername || null,
      title: ws.title || (workspaceKey === 'main' ? 'Server Utama' : workspaceKey),
      projectData: ws.projectData || null,
      updatedBy: ws.updatedBy || null,
      updatedAt: ws.updatedAt || null
    };
  }

  async saveWorkspace({ workspaceKey, ownerUsername, title, projectData, updatedBy }) {
    const updatedAt = new Date().toISOString();
    this.state.workspaces[workspaceKey] = {
      workspaceKey,
      ownerUsername: ownerUsername || null,
      title: title || (workspaceKey === 'main' ? 'Server Utama' : workspaceKey),
      projectData,
      updatedBy: updatedBy || null,
      updatedAt
    };
    this.flush();
    return {
      workspaceKey,
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
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (token),
        KEY idx_sessions_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM users');
    if ((rows[0]?.cnt || 0) === 0) {
      for (const u of buildSeedUsers()) {
        await this.pool.query(
          'INSERT IGNORE INTO users (username, display_name, role, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
          [u.username, u.displayName, u.role, u.passwordHash, u.passwordSalt]
        );
      }
    }
    return this.backend;
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

  async createSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    await this.pool.query(
      'INSERT INTO user_sessions (token, username, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
      [token, username, SESSION_TTL_DAYS]
    );
    return token;
  }

  async getSessionUser(token) {
    if (!token) return null;
    const [rows] = await this.pool.query(
      `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.created_at AS createdAt, u.last_login_at AS lastLoginAt
       FROM user_sessions s
       JOIN users u ON LOWER(u.username) = LOWER(s.username)
       WHERE s.token = ? AND s.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    return rows[0] ? sanitizeUser(rows[0]) : null;
  }

  async deleteSession(token) {
    if (token) {
      await this.pool.query('DELETE FROM user_sessions WHERE token = ?', [token]);
    }
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
      ownerUsername: row.ownerUsername,
      title: row.title,
      projectData,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null
    };
  }

  async saveWorkspace({ workspaceKey, ownerUsername, title, projectData, updatedBy }) {
    const payload = typeof projectData === 'string' ? projectData : JSON.stringify(projectData);
    const resolvedTitle = title || (workspaceKey === 'main' ? 'Server Utama' : workspaceKey);
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
    const saved = await this.getWorkspace(workspaceKey);
    return {
      workspaceKey,
      title: saved?.title || resolvedTitle,
      updatedBy: saved?.updatedBy || updatedBy || null,
      updatedAt: saved?.updatedAt || new Date().toISOString()
    };
  }
}

async function createStorageAdapter({ dbFilePath = DEFAULT_DB_FILE, mysqlConfig = null } = {}) {
  const cfg = mysqlConfig || (process.env.MYSQL_HOST ? {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'netmap',
    password: process.env.MYSQL_PASSWORD || 'netmap_pass',
    database: process.env.MYSQL_DATABASE || 'netmap_db'
  } : null);

  if (cfg && cfg.host) {
    try {
      const mysqlStore = new MySqlStore(cfg);
      await mysqlStore.init();
      console.log(`[NetMapDB] Terhubung ke MySQL (${cfg.host}:${cfg.port}/${cfg.database}).`);
      return mysqlStore;
    } catch (err) {
      console.warn(`[NetMapDB] MySQL tidak dapat diakses (${err.message}). Beralih ke penyimpanan file lokal.`);
    }
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
          const user = await store.getSessionUser(token);
          sendJson(res, 200, {
            authenticated: Boolean(user),
            user,
            storageBackend: store.backend
          });
          return;
        }

        if (req.method === 'POST' && rawPath === '/api/auth/login') {
          const body = await readJsonBody(req);
          const username = String(body.username || '').trim();
          const password = String(body.password || '');
          const userRow = await store.findUserByUsername(username);
          if (!userRow || !verifyPassword(password, userRow.passwordSalt, userRow.passwordHash)) {
            sendJson(res, 401, { error: 'Username atau password salah.' });
            return;
          }
          await store.touchLastLogin(userRow.username);
          const token = await store.createSession(userRow.username);
          sendJson(res, 200, {
            token,
            user: sanitizeUser({ ...userRow, lastLoginAt: new Date().toISOString() }),
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

          const { salt, hash } = createScryptHash(password);
          const newUser = await store.createUser({
            username,
            displayName,
            role,
            passwordSalt: salt,
            passwordHash: hash
          });
          const token = await store.createSession(newUser.username);
          sendJson(res, 201, {
            token,
            user: newUser,
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

        // All routes below require an authenticated technician session
        const sessionUser = await store.getSessionUser(extractBearerToken(req));
        if (!sessionUser) {
          sendJson(res, 401, { error: 'Silakan login terlebih dahulu.' });
          return;
        }

        if (req.method === 'GET' && rawPath === '/api/users') {
          const users = await store.listUsers();
          sendJson(res, 200, { users, storageBackend: store.backend });
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
          const srcWs = await store.getWorkspace(fromKey);
          if (!srcWs || !srcWs.projectData) {
            sendJson(res, 404, { error: `Workspace sumber "${fromKey}" masih kosong.` });
            return;
          }
          const clonedData = {
            ...srcWs.projectData,
            updatedAt: new Date().toISOString()
          };
          const saved = await store.saveWorkspace({
            workspaceKey: toKey,
            ownerUsername: toKey === 'main' ? null : sessionUser.username,
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
              ...(metaOnly ? {} : { projectData: ws?.projectData || null }),
              updatedBy: ws?.updatedBy || null,
              updatedAt: ws?.updatedAt || null,
              storageBackend: store.backend
            });
            return;
          }

          if (req.method === 'PUT' || req.method === 'POST') {
            const body = await readJsonBody(req);
            const projectData = body.projectData;
            if (!projectData || typeof projectData !== 'object') {
              sendJson(res, 400, { error: 'Data projectData tidak valid.' });
              return;
            }
            const saved = await store.saveWorkspace({
              workspaceKey: key,
              ownerUsername: key === 'main' ? null : sessionUser.username,
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
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  };
}

async function startServer() {
  const store = await createStorageAdapter();
  const server = http.createServer(createNetMapRequestHandler(store, ROOT_DIR));
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n======================================================`);
    console.log(`  SmartSchool NetMap Server Berjalan di: ${url}`);
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
