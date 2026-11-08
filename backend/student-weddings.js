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
    const updated = db.prepare(`
      UPDATE students SET marital_status = 'נשואה'
      WHERE marital_status = 'מאורסת' AND wedding_date <= ?
        AND EXISTS (SELECT 1 FROM scheduled_wedding_status w
          WHERE w.id_number = students.id_number AND w.wedding_date = students.wedding_date)
    `).run(today).changes;
    db.prepare(`
      DELETE FROM scheduled_wedding_status WHERE wedding_date <= ?
        OR NOT EXISTS (SELECT 1 FROM students s WHERE s.id_number = scheduled_wedding_status.id_number
          AND s.marital_status = 'מאורסת' AND s.wedding_date = scheduled_wedding_status.wedding_date)
    `).run(today);
    return updated;
  })();
}

function registerWedding(db, student, date, venue, today) {
  if (!validDate(date)) throw new Error('יש לבחור תאריך חתונה תקין');
  if (typeof venue !== 'string' || venue.length > 200) throw new Error('מקום החתונה אינו תקין');
  if (student.wedding_date || student.marital_status === 'נשואה')
    throw new Error('לתלמידה כבר מוגדרת חתונה או שהיא מסומנת כנשואה. יש לעדכן את הפרטים בכרטיס התלמידה');
  db.transaction(() => {
    db.prepare('UPDATE students SET wedding_date = ?, wedding_venue = ?, marital_status = ? WHERE id_number = ?')
      .run(date, venue.trim() || null, date <= today ? 'נשואה' : 'מאורסת', student.id_number);
    if (date > today) db.prepare('INSERT OR REPLACE INTO scheduled_wedding_status (id_number, wedding_date) VALUES (?, ?)')
      .run(student.id_number, date);
  })();
}

module.exports = { initializeWeddings, updateDueWeddings, registerWedding, validDate };
