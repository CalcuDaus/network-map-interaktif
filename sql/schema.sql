-- ============================================================================
-- SmartSchool NetMap — Multi-Technician MySQL Database Schema
-- Stores technician accounts, active sessions, and shared/personal workspaces
-- ("main" = Server Utama template bersama, "user_<username>" = akun pribadi)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS netmap_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE netmap_db;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  token VARCHAR(128) NOT NULL,
  username VARCHAR(64) NOT NULL,
  main_unlocked TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_sessions_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Multi-Technician Accounts (admin/admin123, teknisi1/teknisi123, teknisi2/teknisi123)
INSERT IGNORE INTO users (username, display_name, role, password_hash, password_salt)
VALUES
  ('admin', 'Admin Utama Jaringan', 'admin', SHA2(CONCAT('netmap_salt_2026', ':', 'admin123'), 256), 'netmap_salt_2026'),
  ('teknisi1', 'Teknisi Lapangan 1', 'teknisi', SHA2(CONCAT('netmap_salt_2026', ':', 'teknisi123'), 256), 'netmap_salt_2026'),
  ('teknisi2', 'Teknisi Lapangan 2', 'teknisi', SHA2(CONCAT('netmap_salt_2026', ':', 'teknisi123'), 256), 'netmap_salt_2026');

-- Default Protected Server Utama Workspace (password: server123, publicly viewable, managed by @admin)
INSERT IGNORE INTO workspaces (
  workspace_key, owner_username, title, project_data, access_password_hash, access_password_salt, is_public_viewable, updated_by
)
VALUES (
  'main',
  'admin',
  'Server Utama',
  'null',
  SHA2(CONCAT('netmap_salt_2026', ':', 'server123'), 256),
  'netmap_salt_2026',
  1,
  'admin'
);
