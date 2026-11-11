const { buildStudentUpdateNotice } = require('./student-update-notice');

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function initializeWeddings(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_wedding_status (
      id_number TEXT PRIMARY KEY REFERENCES students(id_number) ON DELETE CASCADE,
      wedding_date TEXT NOT NULL
    )
  `);
}

function updateDueWeddings(db, today) {
  return db.transaction(() => {
    const dueWeddings = db.prepare(`
      SELECT s.* FROM students s
      JOIN scheduled_wedding_status w
        ON w.id_number = s.id_number AND w.wedding_date = s.wedding_date
      WHERE s.marital_status = 'מאורסת' AND s.wedding_date <= ?
    `).all(today);
    const updateStudent = db.prepare("UPDATE students SET marital_status = 'נשואה' WHERE id_number = ?");
    const insertNotice = db.prepare(`
      INSERT INTO student_notices (id_number, title, body, notice_date, visibility)
      VALUES (?, ?, ?, ?, 'staff')
    `);
    for (const student of dueWeddings) {
      updateStudent.run(student.id_number);
      const updatedStudent = { ...student, marital_status: 'נשואה' };
      const notice = buildStudentUpdateNotice(student, updatedStudent);
      if (notice) insertNotice.run(student.id_number, notice.title, notice.body, today);
    }
    db.prepare(`
      DELETE FROM scheduled_wedding_status WHERE wedding_date <= ?
        OR NOT EXISTS (SELECT 1 FROM students s WHERE s.id_number = scheduled_wedding_status.id_number
          AND s.marital_status = 'מאורסת' AND s.wedding_date = scheduled_wedding_status.wedding_date)
    `).run(today);
    return dueWeddings.length;
  })();
}

function registerWedding(db, student, date, venue, today, createdBy = null) {
  if (!validDate(date)) throw new Error('יש לבחור תאריך חתונה תקין');
  if (typeof venue !== 'string' || venue.length > 200) throw new Error('מקום החתונה אינו תקין');
  if (student.wedding_date || student.marital_status === 'נשואה')
    throw new Error('לתלמידה כבר מוגדרת חתונה או שהיא מסומנת כנשואה. יש לעדכן את הפרטים בכרטיס התלמידה');
  db.transaction(() => {
    const before = db.prepare('SELECT * FROM students WHERE id_number = ?').get(student.id_number);
    if (!before) throw new Error('תלמידה לא נמצאה');
    db.prepare('UPDATE students SET wedding_date = ?, wedding_venue = ?, marital_status = ? WHERE id_number = ?')
      .run(date, venue.trim() || null, date <= today ? 'נשואה' : 'מאורסת', student.id_number);
    const after = db.prepare('SELECT * FROM students WHERE id_number = ?').get(student.id_number);
    const notice = buildStudentUpdateNotice(before, after);
    if (notice) {
      db.prepare(`
        INSERT INTO student_notices (id_number, title, body, notice_date, visibility, created_by)
        VALUES (?, ?, ?, ?, 'staff', ?)
      `).run(student.id_number, notice.title, notice.body, today, createdBy);
    }
    if (date > today) db.prepare('INSERT OR REPLACE INTO scheduled_wedding_status (id_number, wedding_date) VALUES (?, ?)')
      .run(student.id_number, date);
  })();
}

module.exports = { initializeWeddings, updateDueWeddings, registerWedding, validDate };
