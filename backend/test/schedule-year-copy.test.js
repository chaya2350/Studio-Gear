const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { copyScheduleAcrossYear } = require('../schedule-year-copy');

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
    )
  `);
  return db;
}

function addSlot(db, values) {
  db.prepare(`
    INSERT INTO schedule_slots
      (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(values.teacher, values.year, values.parallel, values.day, values.start, values.end, values.subject, values.week);
}

test('fills future weeks and links existing matching occurrences without overwriting edits', () => {
  const db = createDatabase();
  addSlot(db, { teacher: 1, year: 'ה', parallel: '1', day: 1, start: '08:30', end: '09:10', subject: 'הלכה', week: '2026-11-01' });
  addSlot(db, { teacher: 2, year: 'ה', parallel: '1', day: 1, start: '09:10', end: '09:50', subject: 'תנ״ך', week: '2026-11-01' });
  addSlot(db, { teacher: 3, year: 'ה', parallel: '1', day: 1, start: '08:30', end: '09:10', subject: 'הלכה', week: '2026-11-08' });

  const result = copyScheduleAcrossYear(db, {
    sourceWeek: '2026-11-01',
    firstWeek: '2026-11-01',
    throughDate: '2026-11-17',
    validateSlot: () => true,
    createSeriesId: (() => { let n = 0; return () => `series-${++n}`; })()
  });

  assert.deepEqual(result, { inserted: 3, linked: 1, skipped: 0, reason: 'completed' });
  const lessons = db.prepare(`
    SELECT teacher_id, subject, week_start, series_id
    FROM schedule_slots WHERE subject = 'הלכה' ORDER BY week_start
  `).all();
  assert.deepEqual(lessons.map(lesson => lesson.teacher_id), [1, 3, 1]);
  assert.equal(lessons[0].series_id, lessons[1].series_id);
  assert.equal(lessons[1].series_id, lessons[2].series_id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schedule_slots').get().count, 6);
  db.close();
});

test('leaves conflicting occurrences untouched', () => {
  const db = createDatabase();
  addSlot(db, { teacher: 1, year: 'ה', parallel: '1', day: 1, start: '08:30', end: '09:10', subject: 'הלכה', week: '2026-11-01' });
  addSlot(db, { teacher: 2, year: 'ה', parallel: '1', day: 1, start: '08:30', end: '09:10', subject: 'אחר', week: '2026-11-08' });

  const result = copyScheduleAcrossYear(db, {
    sourceWeek: '2026-11-01', firstWeek: '2026-11-01', throughDate: '2026-11-10',
    validateSlot: () => true, createSeriesId: () => 'series-1'
  });

  assert.equal(result.linked, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schedule_slots WHERE week_start = ?').get('2026-11-08').count, 1);
  assert.equal(db.prepare('SELECT teacher_id FROM schedule_slots WHERE week_start = ?').get('2026-11-08').teacher_id, 2);
  db.close();
});

test('does not use a week with one-time changes as the annual template', () => {
  const db = createDatabase();
  addSlot(db, { teacher: 1, year: 'ה', parallel: '1', day: 1, start: '08:30', end: '09:10', subject: 'הלכה', week: '2026-11-01' });
  db.prepare("UPDATE schedule_slots SET change_scope = 'once' WHERE week_start = ?").run('2026-11-01');

  const result = copyScheduleAcrossYear(db, {
    sourceWeek: '2026-11-01', firstWeek: '2026-11-01', throughDate: '2026-11-10',
    validateSlot: () => true, createSeriesId: () => 'series-1'
  });

  assert.equal(result.reason, 'source_has_one_time_changes');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schedule_slots').get().count, 1);
  db.close();
});

test('does not copy a lesson that falls after the selected end date within the final week', () => {
  const db = createDatabase();
  addSlot(db, { teacher: 1, year: 'ה', parallel: '1', day: 1, start: '08:30', end: '09:10', subject: 'הלכה', week: '2026-11-01' });

  const result = copyScheduleAcrossYear(db, {
    sourceWeek: '2026-11-01', firstWeek: '2026-11-01', throughDate: '2026-11-08',
    validateSlot: () => true, createSeriesId: () => 'series-1'
  });

  assert.equal(result.inserted, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schedule_slots').get().count, 1);
  db.close();
});