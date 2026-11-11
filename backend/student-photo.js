function saveStudentPhoto(db, idNumber, photoUrl) {
  return db.prepare('UPDATE students SET photo_url = ? WHERE id_number = ?')
    .run(photoUrl, idNumber).changes > 0;
}

function clearStudentPhoto(db, idNumber) {
  const student = db.prepare('SELECT photo_url FROM students WHERE id_number = ?').get(idNumber);
  if (!student) return null;
  db.prepare('UPDATE students SET photo_url = NULL WHERE id_number = ?').run(idNumber);
  return { photoUrl: student.photo_url || null };
}

module.exports = { saveStudentPhoto, clearStudentPhoto };
