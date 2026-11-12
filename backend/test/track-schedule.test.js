const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeRoomBookings } = require('../room-bookings');
const {
  initializeTrackSchedule, registerTrackScheduleRoutes, normalizeTrackSpecialization,
  teacherMatchesTrack
} = require('../track-schedule');

function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tracks (id INTEGER PRIMARY KEY, name TEXT NOT NULL, merged_into INTEGER);
    CREATE TABLE students (track TEXT, year TEXT);
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, subject TEXT, specialization TEXT, active INTEGER);
    CREATE TABLE lesson_periods (id INTEGER PRIMARY KEY, name TEXT, start_time TEXT, end_time TEXT, is_break INTEGER);
    CREATE TABLE rooms (number TEXT PRIMARY KEY, name TEXT, usable INTEGER, floor INTEGER);
    CREATE TABLE schedule_room_defaults (
      kind TEXT NOT NULL, class_year TEXT NOT NULL, class_parallel TEXT NOT NULL,
      track_id INTEGER NOT NULL, study_year TEXT NOT NULL, room_number TEXT NOT NULL
    );
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE schedule_slots (
      id INTEGER PRIMARY KEY, week_start TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT,
      subject TEXT, class_year TEXT, class_parallel TEXT, teacher_id INTEGER, series_id TEXT
    );
    INSERT INTO tracks VALUES
      (1, 'ייעוץ', NULL), (2, 'ייעוץ ישן', 1), (3, 'טיפול', NULL),
      (4, 'ראיית חשבון', NULL), (5, 'חינוך מיוחד', NULL);
    INSERT INTO students VALUES ('ייעוץ', 'ה'), ('ייעוץ ישן', 'ה'), ('ייעוץ', 'ו');
    INSERT INTO teachers VALUES
      (1, 'מורה א', 'מקצוע', 'ייעוץ', 1),
      (2, 'מורה ב', 'מקצוע', 'ייעוץ', 1),
      (3, 'מורה ג', 'מקצוע', 'טיפול', 1),
      (4, 'מורה ד', 'מקצוע', 'רו"ח', 1),
      (5, 'מורה ה', 'מקצוע', 'מת׳', 1),
      (6, 'מורה ו', 'מקצוע', 'ספורט', 1),
      (8, 'מורה ח', 'מקצוע', 'רו"ח, חנ"מ', 1);
    INSERT INTO lesson_periods VALUES
      (1, 'שיעור ראשון', '09:00', '09:45', 0),
      (2, 'הפסקה', '09:45', '10:00', 1),
      (3, 'שיעור מאוחר', '13:30', '14:15', 0);
    INSERT INTO rooms VALUES ('101', 'חדר א', 1, 1);
    INSERT INTO users VALUES (1);
  `);
  initializeRoomBookings(db);
  initializeTrackSchedule(db);
  return db;
}

function routesFor(db) {
  const handlers = new Map();
  const app = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    app[method] = (path, handler) => handlers.set(`${method} ${path}`, handler);
  }
  let holidaysLoaded = false;
  registerTrackScheduleRoutes(app, db, {
    getSchoolYearEnd: () => '2027-06-30',
    todayInIsrael: () => '2026-09-01',
    holidayForDate: () => null,
    ensureHolidays: async () => { holidaysLoaded = true; },
    getRoomDefault: () => '101'
  });
  return { handlers, holidaysLoaded: () => holidaysLoaded };
}

function response() {
  return {
    code: 200,
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('track schedule metadata includes merged-track counts and break periods for filtering', () => {
  const db = setup();
  try {
    const { handlers } = routesFor(db);
    const res = response();
    handlers.get('get /api/track-schedules')({}, res);
    assert.deepEqual(res.body.tracks.find(track => track.id === 1).years, [
      { year: 'ה', student_count: 2 },
      { year: 'ו', student_count: 1 }
    ]);
    assert.equal(res.body.tracks.some(track => track.id === 2), false);
    assert.equal(res.body.periods.find(period => period.id === 2).is_break, 1);
    assert.ok(res.body.teachers.find(teacher => teacher.id === 4).track_ids.includes(4));
    assert.ok(res.body.teachers.find(teacher => teacher.id === 5).track_ids.every(id => id !== 4));
    assert.ok(res.body.teachers.find(teacher => teacher.id === 8).track_ids.includes(4));
    assert.ok(res.body.teachers.find(teacher => teacher.id === 8).track_ids.includes(5));
  } finally { db.close(); }
});

test('normalizes specialization aliases to their track names', () => {
  assert.equal(normalizeTrackSpecialization('מת׳'), normalizeTrackSpecialization('מתמטיקה'));
  assert.equal(normalizeTrackSpecialization('ספורט'), normalizeTrackSpecialization('ספורט טיפולי'));
  assert.equal(normalizeTrackSpecialization('רו"ח'), normalizeTrackSpecialization('ראיית חשבון'));
  assert.equal(normalizeTrackSpecialization('חנ"מ'), normalizeTrackSpecialization('חינוך מיוחד'));
  assert.equal(normalizeTrackSpecialization('הו"מ'), normalizeTrackSpecialization('הוראה מתקנת'));
  assert.equal(normalizeTrackSpecialization('תכנות'), normalizeTrackSpecialization('הנדסאים'));
  assert.equal(normalizeTrackSpecialization('תיכנות'), normalizeTrackSpecialization('הנדסאים'));
  assert.equal(teacherMatchesTrack('רו"ח, חנ"מ', ['ראיית חשבון']), true);
  assert.equal(teacherMatchesTrack('רו"ח, חנ"מ', ['חינוך מיוחד']), true);
  assert.equal(teacherMatchesTrack('רו"ח, חנ"מ', ['הנדסאים']), false);
});

test('allows an accountant-specialized teacher to be scheduled in the accounting track', async () => {
  const db = setup();
  try {
    db.prepare('INSERT INTO teachers VALUES (?, ?, ?, ?, ?)').run(7, 'מורה בדיקה', 'מקצוע', 'רו"ח', 1);
    const { handlers } = routesFor(db);
    const res = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '4', studyYear: 'ה' },
      body: { teacher_id: 7, day_of_week: 1, period_id: 3 }
    }, res);

    assert.equal(res.code, 201);
  } finally { db.close(); }
});

test('track schedule creation rejects breaks and unavailable periods, and blocks overlaps', async () => {
  const db = setup();
  try {
    const { handlers, holidaysLoaded } = routesFor(db);
    const breakRes = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 1, period_id: 2 }
    }, breakRes);
    assert.equal(breakRes.code, 400);

    const kodeshRes = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 1, period_id: 1 }
    }, kodeshRes);
    assert.equal(kodeshRes.code, 400);

    const instructionRes = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 2, period_id: 3 }
    }, instructionRes);
    assert.equal(instructionRes.code, 400);

    const valid = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 1, period_id: 3 }
    }, valid);
    assert.equal(valid.code, 201);
    assert.equal(holidaysLoaded(), true);
    assert.equal(db.prepare('SELECT room_number FROM track_schedule_slots WHERE id = ?').get(valid.body.id).room_number, '101');

    const duplicate = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 2, day_of_week: 1, period_id: 3 }
    }, duplicate);
    assert.equal(duplicate.code, 409);
  } finally { db.close(); }
});

test('track schedules accept custom late hours but reject Kodesh and instruction overlaps', async () => {
  const db = setup();
  try {
    const { handlers } = routesFor(db);
    const create = handlers.get('post /api/track-schedules/:trackId/:studyYear');

    const lateLesson = response();
    await create({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 1, start_time: '18:30', end_time: '20:45' }
    }, lateLesson);
    assert.equal(lateLesson.code, 201);
    assert.deepEqual(
      db.prepare('SELECT start_time, end_time FROM track_schedule_slots WHERE id = ?').get(lateLesson.body.id),
      { start_time: '18:30', end_time: '20:45' }
    );

    const kodeshOverlap = response();
    await create({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 1, start_time: '12:00', end_time: '12:45' }
    }, kodeshOverlap);
    assert.equal(kodeshOverlap.code, 400);
    assert.match(kodeshOverlap.body.error, /קודש/);

    const instructionOverlap = response();
    await create({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 2, start_time: '14:30', end_time: '15:30' }
    }, instructionOverlap);
    assert.equal(instructionOverlap.code, 400);
    assert.match(instructionOverlap.body.error, /הוראה/);
  } finally { db.close(); }
});

test('track schedule only accepts active teachers specialized in the selected track', async () => {
  const db = setup();
  try {
    const { handlers } = routesFor(db);
    const mismatch = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 3, day_of_week: 1, period_id: 3 }
    }, mismatch);
    assert.equal(mismatch.code, 400);
    assert.match(mismatch.body.error, /ייעוץ/);

    const matching = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 1, period_id: 3 }
    }, matching);
    assert.equal(matching.code, 201);
  } finally { db.close(); }
});

test('track lessons reject teacher and room conflicts with existing schedules', async () => {
  const db = setup();
  try {
    const { handlers } = routesFor(db);
    db.prepare(`
      INSERT INTO schedule_slots VALUES (1, '2026-09-06', 1, '13:30', '14:15',
        'מקצוע', 'א', '1', 1, NULL)
    `).run();
    const teacherConflict = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '1', studyYear: 'ה' },
      body: { teacher_id: 1, day_of_week: 1, period_id: 3 }
    }, teacherConflict);
    assert.equal(teacherConflict.code, 409);

    db.prepare(`
      INSERT INTO room_manual_bookings (room_number, title, start_date, day_of_week, start_time, end_time)
      VALUES ('101', 'ישיבה', '2026-09-01', 1, '13:30', '14:15')
    `).run();
    const roomConflict = response();
    await handlers.get('post /api/track-schedules/:trackId/:studyYear')({
      params: { trackId: '3', studyYear: 'ה' },
      body: { teacher_id: 3, day_of_week: 1, period_id: 3, room_number: '101' }
    }, roomConflict);
    assert.equal(roomConflict.code, 409);
  } finally { db.close(); }
});
