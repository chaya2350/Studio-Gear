const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeRoomMap } = require('../room-map');
const { initializeRoomBookings, registerRoomBookingRoutes, assignLesson, copyLessonRoom, findConflict } = require('../room-bookings');

function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE schedule_slots (id INTEGER PRIMARY KEY, week_start TEXT, day_of_week INTEGER,
      start_time TEXT, end_time TEXT, subject TEXT, class_year TEXT, class_parallel TEXT,
      teacher_id INTEGER, series_id TEXT);
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE calendar_events (event_date TEXT, source_sheet TEXT, class_scope TEXT,
      all_day INTEGER, start_time TEXT, end_time TEXT, class_year TEXT, class_parallel TEXT);
    INSERT INTO teachers VALUES (1, 'מורה');
  `);
  initializeRoomMap(db);
  initializeRoomBookings(db);
  return db;
}

function addSlot(db, id, week, start, end, series = null) {
  db.prepare('INSERT INTO schedule_slots VALUES (?, ?, 0, ?, ?, ?, ?, ?, 1, ?)')
    .run(id, week, start, end, 'מקצוע', 'א', '1', series);
  return db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(id);
}

function handlersFor(db, holiday = null) {
  const handlers = {};
  registerRoomBookingRoutes({
    get: (path, handler) => { handlers.get = handler; },
    post: (path, handler) => { handlers.post = handler; },
    put: (path, handler) => { handlers.put = handler; },
    delete: (path, handler) => { handlers.delete = handler; },
  }, db, { ensureHolidays: async () => {}, holidayForDate: () => holiday });
  return handlers;
}

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
}

test('lesson bookings block overlaps but allow touching time boundaries', () => {
  const db = setup();
  try {
    assignLesson(db, addSlot(db, 1, '2026-11-08', '08:00', '09:00'), '001');
    assert.ok(findConflict(db, '001', '2026-11-08', '08:30', '09:30'));
    assert.equal(findConflict(db, '001', '2026-11-08', '09:00', '10:00'), undefined);
    assert.throws(() => assignLesson(db, addSlot(db, 2, '2026-11-08', '08:30', '09:30'), '001'), /תפוס/);
    assert.throws(() => assignLesson(db, addSlot(db, 3, '2026-11-08', '10:00', null), '001'), /שעות/);
  } finally { db.close(); }
});

test('editing or deleting lessons preserves room invariants', () => {
  const db = setup();
  try {
    assignLesson(db, addSlot(db, 1, '2026-11-08', '08:00', '09:00'), '001');
    assignLesson(db, addSlot(db, 2, '2026-11-08', '09:00', '10:00'), '001');
    assert.throws(() => db.prepare("UPDATE schedule_slots SET start_time = '08:30' WHERE id = 2").run(), /ROOM_CONFLICT/);
    assert.throws(() => db.prepare('UPDATE schedule_slots SET end_time = NULL WHERE id = 2').run(), /ROOM_INVALID_TIME/);
    assert.throws(() => db.prepare("UPDATE schedule_slots SET end_time = '29:00' WHERE id = 2").run(), /ROOM_INVALID_TIME/);
    db.prepare('DELETE FROM schedule_slots WHERE id = 1').run();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM room_lesson_bookings WHERE slot_id = 1').get().n, 0);
  } finally { db.close(); }
});

test('manual weekly bookings detect future lessons and copy checks conflicts', async () => {
  const db = setup();
  try {
    const handlers = handlersFor(db);
    assignLesson(db, addSlot(db, 1, '2026-11-15', '08:00', '09:00'), '001');
    const conflicting = response();
    await handlers.post({ body: { room_number: '001', kind: 'manual', date: '2026-11-08', title: 'פגישה', start_time: '08:30', end_time: '09:30' } }, conflicting);
    assert.equal(conflicting.code, 409);
    const ok = response();
    await handlers.post({ body: { room_number: '001', kind: 'manual', date: '2026-11-08', title: 'פגישה', start_time: '09:00', end_time: '10:00' } }, ok);
    assert.equal(ok.code, 200);
    assert.ok(findConflict(db, '001', '2030-11-10', '09:15', '09:30'));
    addSlot(db, 2, '2026-11-22', '09:30', '10:30');
    assert.throws(() => copyLessonRoom(db, 1, 2), /תפוס/);
  } finally { db.close(); }
});

test('series assignment rolls back fully on conflict and holiday lessons cannot be assigned', async () => {
  const db = setup();
  try {
    addSlot(db, 1, '2026-11-08', '08:00', '09:00', 'series');
    addSlot(db, 2, '2026-11-15', '08:00', '09:00', 'series');
    db.prepare("INSERT INTO room_manual_bookings VALUES (1, '001', 'פגישה', '2026-11-15', 0, '08:30', '09:30')").run();
    const handlers = handlersFor(db);
    const res = response();
    await handlers.post({ body: { room_number: '001', kind: 'lesson', date: '2026-11-08', slot_id: 1, series: true } }, res);
    assert.equal(res.code, 409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM room_lesson_bookings').get().n, 0);
    const holiday = response();
    await handlersFor(db, { title: 'חג' }).post({ body: { room_number: '001', kind: 'lesson', date: '2026-11-08', slot_id: 1, series: false } }, holiday);
    assert.equal(holiday.code, 409);
  } finally { db.close(); }
});

test('editing a weekly booking rejects conflicts without losing the original', async () => {
  const db = setup();
  try {
    const handlers = handlersFor(db);
    db.prepare("INSERT INTO room_manual_bookings VALUES (1, '001', 'פגישה', '2026-11-08', 0, '08:00', '09:00')").run();
    assignLesson(db, addSlot(db, 2, '2026-11-15', '10:00', '11:00'), '001');
    const conflict = response();
    handlers.put({ params: { id: '1' }, body: { date: '2026-11-08', title: 'שינוי', start_time: '10:30', end_time: '11:30' } }, conflict);
    assert.equal(conflict.code, 409);
    assert.equal(db.prepare('SELECT start_time FROM room_manual_bookings WHERE id = 1').get().start_time, '08:00');
    const success = response();
    handlers.put({ params: { id: '1' }, body: { date: '2026-11-08', title: 'שינוי', start_time: '09:00', end_time: '10:00' } }, success);
    assert.equal(success.code, 200);
    assert.equal(db.prepare('SELECT title FROM room_manual_bookings WHERE id = 1').get().title, 'שינוי');
  } finally { db.close(); }
});

test('availability returns reservations and marks lessons cancelled on holidays', async () => {
  const db = setup();
  try {
    assignLesson(db, addSlot(db, 1, '2026-11-08', '08:00', '09:00'), '001');
    const res = response();
    await handlersFor(db, { title: 'חג' }).get({ query: { date: '2026-11-08', start: '08:15', end: '08:45' } }, res);
    assert.equal(res.body.holiday, 'חג');
    assert.equal(res.body.bookings.length, 1);
    assert.equal(res.body.bookings[0].cancelled, true);
    assert.equal(res.body.lessons.length, 0);
  } finally { db.close(); }
});
