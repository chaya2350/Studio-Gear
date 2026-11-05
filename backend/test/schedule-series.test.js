const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { collectFutureScheduleOccurrences, scheduleOccurrenceWeeks } = require('../schedule-series');

function createDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE schedule_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_year TEXT NOT NULL,
      class_parallel TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      subject TEXT,
      week_start TEXT NOT NULL,
      series_id TEXT,
      change_scope TEXT,
      change_category TEXT,
      change_reason TEXT
    );
    CREATE TABLE schedule_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id TEXT,
      week_start TEXT NOT NULL,
      action TEXT NOT NULL,
      change_scope TEXT NOT NULL
    );
  `);
  return db;
}

function addSlot(db, { teacher = 1, week, series = null, scope = null }) {
  return db.prepare(`
    INSERT INTO schedule_slots
      (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, series_id, change_scope)
    VALUES (?, 'ה', '1', 1, '08:30', '09:10', 'הלכה', ?, ?, ?)
  `).run(teacher, week, series, scope).lastInsertRowid;
}

test('one-time additions return only the selected week', () => {
  assert.deepEqual(scheduleOccurrenceWeeks({
    startWeek: '2026-11-01', dayOfWeek: 1, scope: 'once',
    currentWeek: '2026-11-01', throughDate: '2027-08-31'
  }), ['2026-11-01']);
});

test('permanent additions include future weeks through the exact end date', () => {
  assert.deepEqual(scheduleOccurrenceWeeks({
    startWeek: '2026-11-01', dayOfWeek: 1, scope: 'permanent',
    currentWeek: '2026-11-01', throughDate: '2026-11-15'
  }), ['2026-11-01', '2026-11-08']);
});

test('plans missing future occurrences for a permanent series update', () => {
  const db = createDatabase();
  const sourceId = addSlot(db, { week: '2026-11-01' });
  const sourceSlot = db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(sourceId);

  const result = collectFutureScheduleOccurrences(db, {
    sourceSlot,
    seriesId: 'series-a',
    weeks: ['2026-11-01', '2026-11-08', '2026-11-15']
  });

  assert.equal(result.error, '');
  assert.deepEqual(result.targets.map(target => target.week_start), ['2026-11-01', '2026-11-08', '2026-11-15']);
  assert.equal(result.targets[0].id, sourceId);
  assert.equal(result.targets[1].isNewOccurrence, true);
  assert.equal(result.targets[2].isNewOccurrence, true);
  db.close();
});

test('preserves one-time edits and deletions while planning a permanent update', () => {
  const db = createDatabase();
  const sourceId = addSlot(db, { week: '2026-11-01', series: 'series-a' });
  addSlot(db, { teacher: 2, week: '2026-11-08', series: 'series-a', scope: 'once' });
  db.prepare(`
    INSERT INTO schedule_change_log (series_id, week_start, action, change_scope)
    VALUES ('series-a', '2026-11-15', 'delete', 'once')
  `).run();
  const sourceSlot = db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(sourceId);

  const result = collectFutureScheduleOccurrences(db, {
    sourceSlot,
    seriesId: 'series-a',
    weeks: ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22']
  });

  assert.deepEqual(result.targets.map(target => target.week_start), ['2026-11-01', '2026-11-22']);
  db.close();
});