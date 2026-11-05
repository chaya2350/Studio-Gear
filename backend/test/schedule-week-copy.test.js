const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { copyScheduleWeekIfEmpty } = require('../schedule-week-copy');

function createDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE schedule_slots (
      id INTEGER PRIMARY KEY,
      teacher_id INTEGER NOT NULL,
      class_year TEXT NOT NULL,
      class_parallel TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      subject TEXT,
      week_start TEXT NOT NULL,
      series_id TEXT
    )
  `);
  return db;
}

test('copies valid lessons to an empty week and skips invalid lessons', () => {
  const db = createDatabase();
  const insert = db.prepare(`
    INSERT INTO schedule_slots
      (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, series_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(1, 'ה', '1', 1, '08:30', '09:10', 'הלכה', '2026-11-01', 'series-1');
  insert.run(2, 'ה', '2', 1, '09:10', '09:50', 'תנ״ך', '2026-11-01', 'series-2');

  const result = copyScheduleWeekIfEmpty(db, {
    fromWeek: '2026-11-01',
    toWeek: '2026-11-08',
    validateSlot: slot => slot.teacher_id === 1
  });

  assert.deepEqual(result, { copied: 1, skipped: 1, reason: 'copied' });
  assert.deepEqual(
    db.prepare('SELECT teacher_id, week_start FROM schedule_slots ORDER BY week_start').all(),
    [
      { teacher_id: 1, week_start: '2026-11-01' },
      { teacher_id: 2, week_start: '2026-11-01' },
      { teacher_id: 1, week_start: '2026-11-08' }
    ]
  );
  db.close();
});

test('does not overwrite a week that already has lessons', () => {
  const db = createDatabase();
  const insert = db.prepare(`
    INSERT INTO schedule_slots
      (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, series_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(1, 'ה', '1', 1, '08:30', '09:10', 'ישן', '2026-11-01', 'series-1');
  insert.run(2, 'ה', '1', 1, '08:30', '09:10', 'ערוך', '2026-11-08', 'series-2');

  const result = copyScheduleWeekIfEmpty(db, {
    fromWeek: '2026-11-01',
    toWeek: '2026-11-08',
    validateSlot: () => true
  });

  assert.deepEqual(result, { copied: 0, skipped: 0, reason: 'destination_not_empty' });
  assert.equal(
    db.prepare('SELECT subject FROM schedule_slots WHERE week_start = ?').get('2026-11-08').subject,
    'ערוך'
  );
  db.close();
});

test('reports when there is no previous-week schedule to copy', () => {
  const db = createDatabase();
  const result = copyScheduleWeekIfEmpty(db, {
    fromWeek: '2026-11-01',
    toWeek: '2026-11-08',
    validateSlot: () => true
  });

  assert.deepEqual(result, { copied: 0, skipped: 0, reason: 'source_empty' });
  db.close();
});

test('skips copied lessons that overlap another lesson for the same class', () => {
  const db = createDatabase();
  const insert = db.prepare(`
    INSERT INTO schedule_slots
      (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, series_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(1, 'ה', '1', 1, '08:30', '09:10', 'הלכה', '2026-11-01', 'series-1');
  insert.run(2, 'ה', '1', 1, '08:30', '09:10', 'תנ״ך', '2026-11-01', 'series-2');

  const result = copyScheduleWeekIfEmpty(db, {
    fromWeek: '2026-11-01',
    toWeek: '2026-11-08',
    validateSlot: () => true
  });

  assert.deepEqual(result, { copied: 1, skipped: 1, reason: 'copied' });
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM schedule_slots WHERE week_start = ?').get('2026-11-08').count,
    1
  );
  db.close();
});

test('skips copied lessons that land on a school holiday', () => {
  const db = createDatabase();
  db.prepare(`
    INSERT INTO schedule_slots
      (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, series_id)
    VALUES (1, 'ה', '1', 1, '08:30', '09:10', 'הלכה', '2026-11-01', 'series-1')
  `).run();

  const result = copyScheduleWeekIfEmpty(db, {
    fromWeek: '2026-11-01', toWeek: '2026-11-08', validateSlot: () => true,
    isSchoolHoliday: (week, day) => week === '2026-11-08' && day === 1
  });

  assert.deepEqual(result, { copied: 0, skipped: 1, reason: 'no_valid_slots' });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schedule_slots WHERE week_start = ?').get('2026-11-08').count, 0);
  db.close();
});
