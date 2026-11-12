const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  initializeStudentPromotionSchema,
  canUndoStudentYearPromotion,
  promoteStudentYears,
  undoStudentYearPromotion
} = require('../student-promotion');

function createDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE students (
      id_number TEXT PRIMARY KEY,
      year TEXT,
      parallel TEXT,
      class_name TEXT,
      address TEXT,
      phone TEXT,
      personal_phone TEXT,
      extra_data TEXT,
      graduate_address TEXT
    );
    INSERT INTO students VALUES
      ('1', 'ד', '4', 'ד4', 'כתובת הורים ד', '02-111', '050-111', '{"נייד אבא":"050-222"}', 'כתובת קיימת'),
      ('2', 'א', '2', 'ה2', 'כתובת הורים א', '02-333', '050-333', '{}', NULL),
      ('3', 'ה', '3', 'ה3', 'כתובת הורים ה', '02-444', '050-444', '{}', NULL),
      ('4', 'ב', '5', 'ו5', 'כתובת הורים ב', '02-555', '050-555', '{}', NULL),
      ('5', 'ו', '6', 'ו6', 'כתובת הורים ו', '02-666', '050-666', '{}', NULL),
      ('6', 'ג', NULL, 'ג', 'כתובת הורים ג', '02-777', '050-777', '{"נייד אמא":"050-888"}', 'כתובת בוגרת קיימת'),
      ('7', 'בוגרות', NULL, 'בוגרות', 'כתובת הורים בוגרת', '02-999', '050-999', '{}', 'כתובת בוגרת'),
      ('8', NULL, NULL, NULL, 'כתובת אחרת', '02-000', '050-000', '{}', NULL),
      ('9', 'עולה לשנה א׳', '1', 'ה1', 'כתובת הורים עולה', '02-123', '050-123', '{}', NULL);
  `);
  initializeStudentPromotionSchema(db);
  return db;
}

test('advances study years and legacy classes, removing parallel in year ג', () => {
  const db = createDatabase();

  assert.deepEqual(promoteStudentYears(db), { updated: 7, graduated: 1, can_undo: true });
  assert.equal(canUndoStudentYearPromotion(db), true);
  assert.deepEqual(db.prepare(`
    SELECT id_number, year, parallel, class_name FROM students ORDER BY id_number
  `).all(), [
    { id_number: '1', year: 'א', parallel: '4', class_name: 'ה4' },
    { id_number: '2', year: 'ב', parallel: '2', class_name: 'ו2' },
    { id_number: '3', year: 'ב', parallel: '3', class_name: 'ו3' },
    { id_number: '4', year: 'ג', parallel: null, class_name: null },
    { id_number: '5', year: 'ג', parallel: null, class_name: null },
    { id_number: '6', year: 'בוגרות', parallel: null, class_name: 'בוגרות' },
    { id_number: '7', year: 'בוגרות', parallel: null, class_name: 'בוגרות' },
    { id_number: '8', year: null, parallel: null, class_name: null },
    { id_number: '9', year: 'א', parallel: '1', class_name: 'ה1' }
  ]);
  assert.deepEqual(db.prepare(`
    SELECT address, phone, personal_phone, extra_data, graduate_address
    FROM students WHERE id_number = '6'
  `).get(), {
    address: 'כתובת הורים ג',
    phone: '02-777',
    personal_phone: '050-777',
    extra_data: '{"נייד אמא":"050-888"}',
    graduate_address: 'כתובת בוגרת קיימת'
  });
  db.close();
});

test('undo restores the previous class year and parallel, leaving existing graduates untouched', () => {
  const db = createDatabase();
  promoteStudentYears(db);

  assert.deepEqual(undoStudentYearPromotion(db), { undone: true, updated: 7 });
  assert.equal(canUndoStudentYearPromotion(db), false);
  assert.deepEqual(db.prepare(`
    SELECT id_number, year, parallel, class_name FROM students ORDER BY id_number
  `).all(), [
    { id_number: '1', year: 'ד', parallel: '4', class_name: 'ד4' },
    { id_number: '2', year: 'א', parallel: '2', class_name: 'ה2' },
    { id_number: '3', year: 'ה', parallel: '3', class_name: 'ה3' },
    { id_number: '4', year: 'ב', parallel: '5', class_name: 'ו5' },
    { id_number: '5', year: 'ו', parallel: '6', class_name: 'ו6' },
    { id_number: '6', year: 'ג', parallel: null, class_name: 'ג' },
    { id_number: '7', year: 'בוגרות', parallel: null, class_name: 'בוגרות' },
    { id_number: '8', year: null, parallel: null, class_name: null },
    { id_number: '9', year: 'עולה לשנה א׳', parallel: '1', class_name: 'ה1' }
  ]);
  assert.deepEqual(undoStudentYearPromotion(db), { undone: false, updated: 0 });
  db.close();
});

test('undo does not overwrite a class number changed after promotion', () => {
  const db = createDatabase();
  promoteStudentYears(db);
  db.prepare("UPDATE students SET parallel = '9', class_name = 'ו9' WHERE id_number = '2'").run();

  assert.deepEqual(undoStudentYearPromotion(db), { undone: true, updated: 6 });
  assert.deepEqual(db.prepare('SELECT year, parallel, class_name FROM students WHERE id_number = ?').get('2'), {
    year: 'ב',
    parallel: '9',
    class_name: 'ו9'
  });
  db.close();
});

test('migrates older promotion history so its year changes remain undoable', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE students (
      id_number TEXT PRIMARY KEY, year TEXT, parallel TEXT, class_name TEXT
    );
    INSERT INTO students VALUES ('1', 'ב', '2', 'ו2');
    CREATE TABLE student_year_promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone_at TEXT
    );
    INSERT INTO student_year_promotions (id) VALUES (1);
    CREATE TABLE student_year_promotion_students (
      promotion_id INTEGER NOT NULL,
      id_number TEXT NOT NULL,
      previous_year TEXT NOT NULL,
      promoted_year TEXT NOT NULL,
      PRIMARY KEY (promotion_id, id_number)
    );
    INSERT INTO student_year_promotion_students VALUES (1, '1', 'א', 'ב');
  `);
  initializeStudentPromotionSchema(db);

  assert.deepEqual(undoStudentYearPromotion(db), { undone: true, updated: 1 });
  assert.deepEqual(db.prepare('SELECT year, parallel, class_name FROM students WHERE id_number = ?').get('1'), {
    year: 'א',
    parallel: '2',
    class_name: 'ו2'
  });
  db.close();
});
