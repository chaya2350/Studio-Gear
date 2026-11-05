const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { findClassTimeConflict, findTeacherTimeConflicts } = require('../schedule-conflicts');

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
      week_start TEXT NOT NULL
    )
  `);
  return db;
}

function addSlot(db, { year, parallel, day, start = '10:00', end = '10:40' }) {
  return db.prepare(`
    INSERT INTO schedule_slots
      (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, week_start)
    VALUES (7, ?, ?, ?, ?, ?, '2026-11-01')
  `).run(year, parallel, day, start, end).lastInsertRowid;
}

test('same teacher and time on a different weekday is not a conflict', () => {
  const db = createDatabase();
  addSlot(db, { year: 'ה', parallel: '3', day: 0 });

  const conflicts = findTeacherTimeConflicts(db, {
    teacher_id: 7,
    day_of_week: 4,
    start_time: '10:00',
    end_time: '10:40',
    week_start: '2026-11-01'
  });

  assert.deepEqual(conflicts, []);
  db.close();
});

test('overlapping lesson for the same teacher on the same weekday is a conflict', () => {
  const db = createDatabase();
  addSlot(db, { year: 'ה', parallel: '3', day: 4 });

  const conflicts = findTeacherTimeConflicts(db, {
    teacher_id: 7,
    day_of_week: 4,
    start_time: '10:20',
    end_time: '11:00',
    week_start: '2026-11-01'
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].class_parallel, '3');
  db.close();
});

test('teacher lessons in another week are not conflicts', () => {
  const db = createDatabase();
  const id = addSlot(db, { year: 'ה', parallel: '3', day: 4 });
  db.prepare('UPDATE schedule_slots SET week_start = ? WHERE id = ?').run('2026-10-25', id);

  const conflicts = findTeacherTimeConflicts(db, {
    teacher_id: 7,
    day_of_week: 4,
    start_time: '10:00',
    end_time: '10:40',
    week_start: '2026-11-01'
  });

  assert.deepEqual(conflicts, []);
  db.close();
});

test('a different teacher cannot be scheduled into the same class at the same time', () => {
  const db = createDatabase();
  addSlot(db, { year: 'ה', parallel: '3', day: 4 });

  const conflict = findClassTimeConflict(db, {
    class_year: 'ה',
    class_parallel: '3',
    day_of_week: 4,
    start_time: '10:00',
    end_time: '10:40',
    week_start: '2026-11-01'
  });

  assert.ok(conflict);
  db.close();
});

test('a class can have a lesson at the same time on a different day', () => {
  const db = createDatabase();
  addSlot(db, { year: 'ה', parallel: '3', day: 0 });

  const conflict = findClassTimeConflict(db, {
    class_year: 'ה',
    class_parallel: '3',
    day_of_week: 4,
    start_time: '10:00',
    end_time: '10:40',
    week_start: '2026-11-01'
  });

  assert.equal(conflict, undefined);
  db.close();
});

test('overlapping but not identical class periods conflict', () => {
  const db = createDatabase();
  addSlot(db, { year: 'ה', parallel: '3', day: 4, start: '10:00', end: '10:40' });

  const conflict = findClassTimeConflict(db, {
    class_year: 'ה',
    class_parallel: '3',
    day_of_week: 4,
    start_time: '10:20',
    end_time: '11:00',
    week_start: '2026-11-01'
  });

  assert.ok(conflict);
  db.close();
});
