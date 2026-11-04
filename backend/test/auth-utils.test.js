const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeAuthSchema } = require('../auth-utils');

test('auth schema migration removes the fixed built-in role constraint safely', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'laborant', 'secretary')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    INSERT INTO users (name, email, password_salt, password_hash, role, created_at)
    VALUES ('Test', 'test@example.com', 'salt', 'hash', 'secretary', 'now');
    INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('token', 1, 'later');
  `);

  initializeAuthSchema(db);
  db.prepare(`
    INSERT INTO users (name, email, password_salt, password_hash, role, created_at)
    VALUES ('Custom', 'custom@example.com', 'salt', 'hash', 'custom_role', 'now')
  `).run();

  assert.equal(db.prepare('SELECT role FROM users WHERE email = ?').get('custom@example.com').role, 'custom_role');
  assert.equal(db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get('token').user_id, 1);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  db.close();
});
