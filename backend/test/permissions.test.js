const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  PERMISSION_CATALOG,
  PERMISSION_ACTIONS,
  getApiPermission,
  permissionMapFromRows,
  initializePermissionSchema
} = require('../permissions');

test('permission setup seeds built-in roles and enables all actions by default', () => {
  const db = new Database(':memory:');
  initializePermissionSchema(db);
  const roles = db.prepare('SELECT role_key, name FROM system_roles ORDER BY role_key').all();
  assert.deepEqual(roles.map(role => role.role_key), ['admin', 'laborant', 'secretary']);

  const rows = db.prepare('SELECT permission_key, action, enabled FROM role_permissions WHERE role_key = ?').all('secretary');
  assert.equal(rows.length, PERMISSION_CATALOG.length * PERMISSION_ACTIONS.length);
  assert.deepEqual(PERMISSION_ACTIONS, ['view', 'create', 'edit', 'delete']);
  assert.equal(PERMISSION_CATALOG.some(feature => feature.key === 'home'), false);
  assert.ok(rows.every(row => row.enabled === 1));
  db.close();
});

test('permission setup migrates legacy create, update and delete actions independently', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE system_roles (role_key TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_system INTEGER NOT NULL DEFAULT 0);
    INSERT INTO system_roles (role_key, name) VALUES ('secretary', 'מזכירות');
    CREATE TABLE role_permissions (
      role_key TEXT NOT NULL REFERENCES system_roles(role_key) ON DELETE CASCADE,
      permission_key TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('view', 'create', 'update', 'delete')),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      PRIMARY KEY (role_key, permission_key, action)
    );
    INSERT INTO role_permissions VALUES ('secretary', 'students', 'view', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'students', 'create', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'students', 'update', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'students', 'delete', 0);
    INSERT INTO role_permissions VALUES ('secretary', 'home', 'view', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'home', 'create', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'home', 'update', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'home', 'delete', 1);
  `);

  initializePermissionSchema(db);
  const permissions = db.prepare(
    "SELECT permission_key, action, enabled FROM role_permissions WHERE role_key = 'secretary' AND permission_key = 'students' ORDER BY action"
  ).all();
  assert.deepEqual(permissions, [
    { permission_key: 'students', action: 'create', enabled: 1 },
    { permission_key: 'students', action: 'delete', enabled: 0 },
    { permission_key: 'students', action: 'edit', enabled: 1 },
    { permission_key: 'students', action: 'view', enabled: 1 }
  ]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM role_permissions WHERE permission_key = 'home'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM role_permissions WHERE action = 'update'").get().count, 0);
  db.close();
});

test('permission setup expands existing change access to all mutation actions', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE system_roles (role_key TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_system INTEGER NOT NULL DEFAULT 0);
    INSERT INTO system_roles (role_key, name) VALUES ('secretary', 'מזכירות');
    CREATE TABLE role_permissions (
      role_key TEXT NOT NULL REFERENCES system_roles(role_key) ON DELETE CASCADE,
      permission_key TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('view', 'change')),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      PRIMARY KEY (role_key, permission_key, action)
    );
    INSERT INTO role_permissions VALUES ('secretary', 'students', 'view', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'students', 'change', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'tracks', 'view', 1);
    INSERT INTO role_permissions VALUES ('secretary', 'tracks', 'change', 0);
  `);

  initializePermissionSchema(db);
  const permissions = db.prepare(
    "SELECT action, enabled FROM role_permissions WHERE role_key = 'secretary' AND permission_key = 'students' ORDER BY action"
  ).all();
  assert.deepEqual(permissions, [
    { action: 'create', enabled: 1 },
    { action: 'delete', enabled: 1 },
    { action: 'edit', enabled: 1 },
    { action: 'view', enabled: 1 }
  ]);
  const restrictedPermissions = db.prepare(
    "SELECT action, enabled FROM role_permissions WHERE role_key = 'secretary' AND permission_key = 'tracks' AND action != 'view' ORDER BY action"
  ).all();
  assert.deepEqual(restrictedPermissions, [
    { action: 'create', enabled: 0 },
    { action: 'delete', enabled: 0 },
    { action: 'edit', enabled: 0 }
  ]);
  db.close();
});

test('admin permissions remain fully enabled regardless of stored rows', () => {
  const permissions = permissionMapFromRows(
    [{ permission_key: 'students', action: 'delete', enabled: 0 }],
    'admin'
  );
  assert.equal(permissions.students.create, true);
  assert.equal(permissions.students.edit, true);
  assert.equal(permissions.students.delete, true);
  assert.equal(permissions.schedule.view, true);
});

test('API routes map to granular view, create, edit and delete permissions', () => {
  assert.deepEqual(getApiPermission('/students/123', 'GET'), { feature: 'students', action: 'view' });
  assert.deepEqual(getApiPermission('/students/123', 'POST'), { feature: 'students', action: 'create' });
  assert.deepEqual(getApiPermission('/students/123', 'PUT'), { feature: 'students', action: 'edit' });
  assert.deepEqual(getApiPermission('/schedule/4', 'DELETE'), { feature: 'schedule', action: 'delete' });
  assert.deepEqual(getApiPermission('/students/import', 'POST'), {
    feature: 'students',
    actions: ['create', 'edit']
  });
  assert.deepEqual(getApiPermission('/students/promote-year', 'POST'), {
    feature: 'students',
    actions: ['create', 'edit']
  });
  assert.deepEqual(getApiPermission('/students/undo-promotion', 'POST'), {
    feature: 'students',
    actions: ['create', 'edit']
  });
  assert.deepEqual(getApiPermission('/upload', 'POST'), {
    feature: 'equipment',
    actions: ['create', 'edit']
  });
  assert.deepEqual(getApiPermission('/students/123/photo', 'POST'), { feature: 'students', action: 'edit' });
  assert.deepEqual(getApiPermission('/students/123/wedding', 'POST'), { feature: 'students', action: 'edit' });
  assert.deepEqual(getApiPermission('/attendance/sessions/12/absent', 'POST'), { feature: 'attendance', action: 'edit' });
  assert.deepEqual(getApiPermission('/admin/reset-database', 'POST'), { feature: 'students', action: 'delete' });
  assert.deepEqual(getApiPermission('/reports/class', 'GET'), { feature: 'reports', action: 'view' });
  assert.equal(getApiPermission('/unmapped-endpoint', 'GET'), null);
});
