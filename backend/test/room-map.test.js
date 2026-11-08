const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeRoomMap, registerRoomMapRoutes, validateRoomUpdate } = require('../room-map');
const { getApiPermission } = require('../permissions');

test('room map initializes once and preserves changes', () => {
  const db = new Database(':memory:');
  try {
    initializeRoomMap(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count, 47);
    assert.equal(db.prepare('SELECT usable FROM rooms WHERE number = ?').get('051').usable, 0);
    db.prepare('UPDATE rooms SET name = ? WHERE number = ?').run('Updated', '001');
    initializeRoomMap(db);
    assert.equal(db.prepare('SELECT name FROM rooms WHERE number = ?').get('001').name, 'Updated');
  } finally {
    db.close();
  }
});

test('room edits validate all fields', () => {
  const valid = { name: 'חדר', capacity: null, projector: false, air_conditioner: '',
    computers: true, usable: false, capacity_needs_confirmation: false };
  assert.equal(validateRoomUpdate(valid), '');
  assert.notEqual(validateRoomUpdate({ ...valid, capacity: -1 }), '');
  assert.notEqual(validateRoomUpdate({ ...valid, capacity: 1.5 }), '');
  assert.notEqual(validateRoomUpdate({ ...valid, usable: 1 }), '');
  assert.notEqual(validateRoomUpdate({ ...valid, name: ' ' }), '');
});

test('room API uses schedule view and change permissions', () => {
  assert.deepEqual(getApiPermission('/schedule/room-map', 'GET'), { feature: 'schedule', action: 'view' });
  assert.deepEqual(getApiPermission('/schedule/room-map/001', 'PUT'), { feature: 'schedule', action: 'change' });
});

test('room update persists changes and rejects missing rooms', () => {
  const db = new Database(':memory:');
  try {
    initializeRoomMap(db);
    const handlers = {};
    registerRoomMapRoutes({
      get: (path, handler) => { handlers.get = handler; },
      put: (path, handler) => { handlers.put = handler; },
    }, db);
    const body = { name: 'סטודיו חדש', capacity: 30, projector: true, air_conditioner: '',
      computers: false, usable: true, capacity_needs_confirmation: false };
    const response = () => ({
      code: 200,
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; },
    });
    const res = response();
    handlers.put({ params: { number: '001' }, body }, res);
    assert.equal(res.code, 200);
    assert.equal(db.prepare('SELECT name FROM rooms WHERE number = ?').get('001').name, body.name);
    const missing = response();
    handlers.put({ params: { number: '999' }, body }, missing);
    assert.equal(missing.code, 404);
    const bad = response();
    handlers.put({ params: { number: '001' }, body: { ...body, capacity: -1 } }, bad);
    assert.equal(bad.code, 400);
  } finally {
    db.close();
  }
});
