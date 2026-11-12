const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  initializeEquipmentMaintenance, getEquipmentMaintenanceSummary,
  registerEquipmentMaintenanceRoutes
} = require('../equipment-maintenance');

function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE equipment (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO users VALUES (1, 'מנהלת');
    INSERT INTO equipment VALUES (10, 'מצלמה');
  `);
  initializeEquipmentMaintenance(db);
  return db;
}

function createRoutes(db) {
  const handlers = new Map();
  const app = {};
  for (const method of ['get', 'post', 'patch']) {
    app[method] = (route, handler) => handlers.set(`${method.toUpperCase()} ${route}`, handler);
  }
  registerEquipmentMaintenanceRoutes(app, db);
  return handlers;
}

function response() {
  return {
    code: 200,
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('maintenance reports keep history and determine equipment availability', () => {
  const db = setup();
  try {
    const handlers = createRoutes(db);
    const created = response();
    handlers.get('POST /api/equipment/:id/maintenance')({
      params: { id: '10' }, body: { description: 'תקלה במחבר החשמל' }, user: { id: 1 }
    }, created);

    assert.equal(created.code, 201);
    assert.equal(getEquipmentMaintenanceSummary(db, 10), 1);

    const inProgress = response();
    handlers.get('PATCH /api/equipment/:equipmentId/maintenance/:id')({
      params: { equipmentId: '10', id: String(created.body.id) },
      body: { status: 'in_progress' }
    }, inProgress);
    assert.equal(inProgress.code, 200);
    assert.equal(getEquipmentMaintenanceSummary(db, 10), 1);

    const resolved = response();
    handlers.get('PATCH /api/equipment/:equipmentId/maintenance/:id')({
      params: { equipmentId: '10', id: String(created.body.id) },
      body: { status: 'resolved', resolution_notes: 'המחבר הוחלף' }
    }, resolved);
    assert.equal(resolved.code, 200);
    assert.equal(getEquipmentMaintenanceSummary(db, 10), 0);

    const history = response();
    handlers.get('GET /api/equipment/:id/maintenance')({ params: { id: '10' } }, history);
    assert.equal(history.body.length, 1);
    assert.equal(history.body[0].resolution_notes, 'המחבר הוחלף');
    assert.equal(history.body[0].reporter_name, 'מנהלת');
  } finally {
    db.close();
  }
});

test('maintenance API validates report contents and status updates', () => {
  const db = setup();
  try {
    const handlers = createRoutes(db);
    const empty = response();
    handlers.get('POST /api/equipment/:id/maintenance')({ params: { id: '10' }, body: {} }, empty);
    assert.equal(empty.code, 400);

    const invalidStatus = response();
    handlers.get('PATCH /api/equipment/:equipmentId/maintenance/:id')({
      params: { equipmentId: '10', id: '1' }, body: { status: 'broken' }
    }, invalidStatus);
    assert.equal(invalidStatus.code, 400);
  } finally {
    db.close();
  }
});