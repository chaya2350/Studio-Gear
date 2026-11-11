const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { saveStudentPhoto, clearStudentPhoto } = require('../student-photo');

test('student photo URL remains stored on the student record', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE students (id_number TEXT PRIMARY KEY, photo_url TEXT);
      INSERT INTO students (id_number) VALUES ('123');`);

    assert.equal(saveStudentPhoto(db, '123', '/uploads/student-photo.jpg'), true);
    assert.equal(db.prepare('SELECT photo_url FROM students WHERE id_number = ?').get('123').photo_url,
      '/uploads/student-photo.jpg');
    assert.equal(saveStudentPhoto(db, 'missing', '/uploads/orphan.jpg'), false);
  } finally {
    db.close();
  }
});

test('clearing a student photo removes its stored URL and reports missing students', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE students (id_number TEXT PRIMARY KEY, photo_url TEXT);
      INSERT INTO students VALUES ('123', '/uploads/student-photo.jpg');`);

    assert.deepEqual(clearStudentPhoto(db, '123'), { photoUrl: '/uploads/student-photo.jpg' });
    assert.equal(db.prepare('SELECT photo_url FROM students WHERE id_number = ?').get('123').photo_url, null);
    assert.equal(clearStudentPhoto(db, 'missing'), null);
  } finally {
    db.close();
  }
});
