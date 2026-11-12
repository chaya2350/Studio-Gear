const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeRoomMap, registerRoomMapRoutes, validateRoomUpdate, getRoomDefault } = require('../room-map');
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
  assert.deepEqual(getApiPermission('/schedule/room-defaults', 'PUT'), { feature: 'schedule', action: 'change' });
});

test('room defaults can be saved per class and track year', () => {
  const db = new Database(':memory:');
  try {
    initializeRoomMap(db);
    db.exec(`
      CREATE TABLE tracks (id INTEGER PRIMARY KEY, name TEXT NOT NULL, merged_into INTEGER);
      CREATE TABLE students (year TEXT, parallel TEXT);
      INSERT INTO tracks VALUES (1, 'גרפיקה', NULL);
      INSERT INTO students VALUES ('ה', '1');
    `);
    const handlers = {};
    registerRoomMapRoutes({
      get: (route, handler) => { handlers[`GET ${route}`] = handler; },
      put: (route, handler) => { handlers[`PUT ${route}`] = handler; },
    }, db);
    const response = () => ({
      code: 200,
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; },
    });

    const classResponse = response();
    handlers['PUT /api/schedule/room-defaults']({ body: {
      kind: 'class', class_year: 'ה', class_parallel: '1', room_number: '001'
    } }, classResponse);
    assert.equal(classResponse.code, 200);
    assert.equal(getRoomDefault(db, { kind: 'class', classYear: 'ה', classParallel: '1' }), '001');

    const trackResponse = response();
    handlers['PUT /api/schedule/room-defaults']({ body: {
      kind: 'track', track_id: 1, study_year: 'ו', room_number: '001'
    } }, trackResponse);
    assert.equal(trackResponse.code, 200);
    assert.equal(getRoomDefault(db, { kind: 'track', trackId: 1, studyYear: 'ו' }), '001');

    const unusableRoom = response();
    handlers['PUT /api/schedule/room-defaults']({ body: {
      kind: 'class', class_year: 'ה', class_parallel: '1', room_number: '051'
    } }, unusableRoom);
    assert.equal(unusableRoom.code, 400);

    const defaultsResponse = response();
    handlers['GET /api/schedule/room-defaults']({}, defaultsResponse);
    assert.equal(defaultsResponse.body.classes.length, 1);
    assert.equal(defaultsResponse.body.tracks.length, 1);
    assert.equal(defaultsResponse.body.class_defaults[0].room_number, '001');
  } finally {
    db.close();
  }
});

test('room update persists changes and rejects missing rooms', () => {
  const db = new Database(':memory:');
  try {
    initializeRoomMap(db);
    const handlers = {};
    registerRoomMapRoutes({
      get: (route, handler) => { handlers[`GET ${route}`] = handler; },
      put: (route, handler) => { handlers[`PUT ${route}`] = handler; },
    }, db);
    const body = { name: 'סטודיו חדש', capacity: 30, projector: true, air_conditioner: '',
      computers: false, usable: true, capacity_needs_confirmation: false };
    const response = () => ({
      code: 200,
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; },
    });
    const res = response();
    handlers['PUT /api/schedule/room-map/:number']({ params: { number: '001' }, body }, res);
    assert.equal(res.code, 200);
    assert.equal(db.prepare('SELECT name FROM rooms WHERE number = ?').get('001').name, body.name);
    const missing = response();
    handlers['PUT /api/schedule/room-map/:number']({ params: { number: '999' }, body }, missing);
    assert.equal(missing.code, 404);
    const bad = response();
    handlers['PUT /api/schedule/room-map/:number']({ params: { number: '001' }, body: { ...body, capacity: -1 } }, bad);
    assert.equal(bad.code, 400);
  } finally {
    db.close();
  }
});
