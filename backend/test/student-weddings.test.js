const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeWeddings, updateDueWeddings, registerWedding } = require('../student-weddings');
const { getApiPermission } = require('../permissions');

function setup() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE students (id_number TEXT PRIMARY KEY, marital_status TEXT, wedding_date TEXT, wedding_venue TEXT);
    INSERT INTO students VALUES ('1', NULL, NULL, NULL), ('2', NULL, NULL, NULL);`);
  initializeWeddings(db);
  return db;
}

test('future wedding updates the student at the date and survives a restart', () => {
  const db = setup();
  try {
    const student = db.prepare("SELECT * FROM students WHERE id_number = '1'").get();
    registerWedding(db, student, '2026-11-10', 'אולם', '2026-11-08');
    assert.equal(db.prepare("SELECT marital_status FROM students WHERE id_number = '1'").get().marital_status, 'מאורסת');
    initializeWeddings(db);
    assert.equal(updateDueWeddings(db, '2026-11-09'), 0);
    assert.equal(updateDueWeddings(db, '2026-11-10'), 1);
    assert.equal(db.prepare("SELECT marital_status FROM students WHERE id_number = '1'").get().marital_status, 'נשואה');
    assert.equal(updateDueWeddings(db, '2026-11-11'), 0);
  } finally { db.close(); }
});

test('adding a wedding requires student change permission', () => {
  assert.deepEqual(getApiPermission('/students/123/wedding', 'POST'), { feature: 'students', action: 'change' });
});

test('manual changes are not overwritten and invalid or duplicate weddings are rejected', () => {
  const db = setup();
  try {
    const student = db.prepare("SELECT * FROM students WHERE id_number = '1'").get();
    assert.throws(() => registerWedding(db, student, '2026-02-30', '', '2026-01-01'), /תאריך/);
    registerWedding(db, student, '2026-11-10', '', '2026-11-08');
    const updated = db.prepare("SELECT * FROM students WHERE id_number = '1'").get();
    assert.throws(() => registerWedding(db, updated, '2026-11-12', '', '2026-11-08'), /כבר/);
    db.prepare("UPDATE students SET marital_status = 'רווקה' WHERE id_number = '1'").run();
    assert.equal(updateDueWeddings(db, '2026-11-10'), 0);
    assert.equal(db.prepare("SELECT marital_status FROM students WHERE id_number = '1'").get().marital_status, 'רווקה');
    registerWedding(db, db.prepare("SELECT * FROM students WHERE id_number = '2'").get(), '2026-11-08', '', '2026-11-08');
    assert.equal(db.prepare("SELECT marital_status FROM students WHERE id_number = '2'").get().marital_status, 'נשואה');
  } finally { db.close(); }
});
