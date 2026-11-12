const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  initializeRoomMap, registerRoomMapRoutes, validateRoomUpdate, getRoomDefault,
  applyRoomDefaultsToExistingLessons
} = require('../room-map');
const { initializeRoomBookings } = require('../room-bookings');
const { initializeTrackSchedule } = require('../track-schedule');
const { getApiPermission } = require('../permissions');

test('room map initializes once and preserves changes', () => {
  const db = new Database(':memory:');
  try {
    initializeRoomMap(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count, 49);
    assert.equal(db.prepare('SELECT usable FROM rooms WHERE number = ?').get('051').usable, 0);
    db.prepare('UPDATE rooms SET name = ? WHERE number = ?').run('Updated', '001');
    initializeRoomMap(db);
    assert.equal(db.prepare('SELECT name FROM rooms WHERE number = ?').get('001').name, 'Updated');
  } finally {
    db.close();
  }
});

test('one-time room map update refreshes rooms on an existing database', () => {
  const db = new Database(':memory:');
  try {
    initializeRoomMap(db);
    db.prepare("UPDATE rooms SET name = 'שם ישן' WHERE number = '401'").run();
    db.prepare("DELETE FROM rooms WHERE number = '351'").run();
    db.prepare('DELETE FROM room_map_settings WHERE key = ?').run('tashpaz_2027');

    initializeRoomMap(db);

    assert.equal(db.prepare("SELECT name FROM rooms WHERE number = '401'").get().name, "הנדסאים ב'");
    assert.equal(db.prepare("SELECT name FROM rooms WHERE number = '351'").get().name, "חדר תה - ה' ו'");
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count, 49);
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
      CREATE TABLE students (track TEXT, year TEXT, parallel TEXT);
      INSERT INTO tracks VALUES (1, 'גרפיקה', NULL);
      INSERT INTO students VALUES ('גרפיקה', 'ה', '1');
    `);
    const handlers = {};
    registerRoomMapRoutes({
      get: (route, handler) => { handlers[`GET ${route}`] = handler; },
      put: (route, handler) => { handlers[`PUT ${route}`] = handler; },
      post: (route, handler) => { handlers[`POST ${route}`] = handler; },
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
    assert.deepEqual(defaultsResponse.body.tracks[0].years, [
      { year: 'ה', student_count: 1 },
      { year: 'ו', student_count: 0 }
    ]);
    assert.equal(defaultsResponse.body.class_defaults[0].room_number, '001');

    const applyResponse = response();
    handlers['POST /api/schedule/room-defaults/apply']({}, applyResponse);
    assert.deepEqual(applyResponse.body, {
      success: true, kodeshAssigned: 0, trackAssigned: 0, skippedConflicts: 0
    });
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
      post: (route, handler) => { handlers[`POST ${route}`] = handler; },
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

test('existing lessons receive missing room defaults without replacing manual rooms or causing conflicts', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE tracks (id INTEGER PRIMARY KEY, name TEXT NOT NULL, merged_into INTEGER);
      CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE lesson_periods (id INTEGER PRIMARY KEY, name TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, is_break INTEGER NOT NULL);
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE schedule_slots (
        id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL, class_year TEXT NOT NULL,
        class_parallel TEXT NOT NULL, day_of_week INTEGER NOT NULL, start_time TEXT NOT NULL,
        end_time TEXT, subject TEXT, week_start TEXT NOT NULL, series_id TEXT
      );
      INSERT INTO tracks VALUES (1, 'גרפיקה', NULL);
      INSERT INTO teachers VALUES (1, 'מורה');
      INSERT INTO lesson_periods VALUES (1, 'שיעור', '08:00', '09:00', 0);
      INSERT INTO users VALUES (1);
    `);
    initializeRoomMap(db);
    initializeRoomBookings(db);
    initializeTrackSchedule(db);
    db.prepare(`
      INSERT INTO schedule_room_defaults (kind, class_year, class_parallel, track_id, study_year, room_number)
      VALUES ('class', 'ה', '1', 0, '', '001'), ('track', '', '', 1, 'ה', '001')
    `).run();
    const insertClassSlot = db.prepare(`
      INSERT INTO schedule_slots (id, teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start)
      VALUES (?, 1, 'ה', '1', 0, ?, ?, 'קודש', '2027-01-03')
    `);
    insertClassSlot.run(1, '08:00', '09:00');
    insertClassSlot.run(2, '09:00', '10:00');
    insertClassSlot.run(3, '10:00', '11:00');
    db.prepare('INSERT INTO room_lesson_bookings (slot_id, room_number) VALUES (2, ?)').run('011');
    db.prepare(`
      INSERT INTO track_schedule_slots
        (id, track_id, study_year, teacher_id, day_of_week, period_name, start_time, end_time, room_number)
      VALUES (1, 1, 'ה', 1, 0, 'שיעור', '11:00', '12:00', NULL),
        (2, 1, 'ה', 1, 1, 'שיעור', '12:00', '13:00', '011'),
        (3, 1, 'ה', 1, 0, 'שיעור', '10:00', '11:00', NULL)
    `).run();
    db.prepare(`
      INSERT INTO room_manual_bookings (id, room_number, title, start_date, day_of_week, start_time, end_time)
      VALUES (1, '001', 'פגישה', '2027-01-03', 0, '10:00', '11:00')
    `).run();

    const result = applyRoomDefaultsToExistingLessons(db);

    assert.deepEqual(result, { kodeshAssigned: 1, trackAssigned: 1, skippedConflicts: 2 });
    assert.equal(db.prepare('SELECT room_number FROM room_lesson_bookings WHERE slot_id = 1').get().room_number, '001');
    assert.equal(db.prepare('SELECT room_number FROM room_lesson_bookings WHERE slot_id = 2').get().room_number, '011');
    assert.equal(db.prepare('SELECT room_number FROM track_schedule_slots WHERE id = 1').get().room_number, '001');
    assert.equal(db.prepare('SELECT room_number FROM track_schedule_slots WHERE id = 2').get().room_number, '011');
    assert.equal(db.prepare('SELECT room_number FROM track_schedule_slots WHERE id = 3').get().room_number, null);
  } finally {
    db.close();
  }
});
