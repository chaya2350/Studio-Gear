const { buildClassName } = require('./database-report');

function initializeStudentPromotionSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_year_promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      undone_at TEXT
    );
    CREATE TABLE IF NOT EXISTS student_year_promotion_students (
      promotion_id INTEGER NOT NULL REFERENCES student_year_promotions(id) ON DELETE CASCADE,
      id_number TEXT NOT NULL,
      previous_year TEXT NOT NULL,
      promoted_year TEXT NOT NULL,
      previous_parallel TEXT,
      promoted_parallel TEXT,
      previous_class_name TEXT,
      promoted_class_name TEXT,
      class_snapshot INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (promotion_id, id_number)
    );
  `);
  const columns = db.prepare('PRAGMA table_info(student_year_promotion_students)').all().map(column => column.name);
  if (!columns.includes('previous_parallel')) db.exec('ALTER TABLE student_year_promotion_students ADD COLUMN previous_parallel TEXT');
  if (!columns.includes('promoted_parallel')) db.exec('ALTER TABLE student_year_promotion_students ADD COLUMN promoted_parallel TEXT');
  if (!columns.includes('previous_class_name')) db.exec('ALTER TABLE student_year_promotion_students ADD COLUMN previous_class_name TEXT');
  if (!columns.includes('promoted_class_name')) db.exec('ALTER TABLE student_year_promotion_students ADD COLUMN promoted_class_name TEXT');
  if (!columns.includes('class_snapshot')) db.exec('ALTER TABLE student_year_promotion_students ADD COLUMN class_snapshot INTEGER NOT NULL DEFAULT 0');
}

function canUndoStudentYearPromotion(db) {
  const latest = db.prepare(`
    SELECT undone_at FROM student_year_promotions ORDER BY id DESC LIMIT 1
  `).get();
  return Boolean(latest && latest.undone_at === null);
}

const NEXT_YEAR = {
  'עולה לשנה א': 'א',
  'ד': 'א',
  'א': 'ב',
  'ה': 'ב',
  'ב': 'ג',
  'ו': 'ג',
  'ג': 'בוגרות'
};

function normalizePromotionYear(value) {
  return String(value || '').trim().replace(/[\u2018\u2019\u05F3\u05F4"'`]/g, '').replace(/\s+/g, ' ');
}

function promoteStudentYears(db) {
  return db.transaction(() => {
    const students = db.prepare(`
      SELECT id_number, year, parallel, class_name
      FROM students
      WHERE year IN ('עולה לשנה א׳', 'עולה לשנה א', 'ד', 'א', 'ה', 'ב', 'ו', 'ג')
    `).all();
    const graduated = students.filter(student => student.year === 'ג').length;
    if (!students.length) return { updated: 0, graduated: 0, can_undo: false };

    const promotion = db.prepare('INSERT INTO student_year_promotions DEFAULT VALUES').run();
    const insertStudent = db.prepare(`
      INSERT INTO student_year_promotion_students (
        promotion_id, id_number, previous_year, promoted_year,
        previous_parallel, promoted_parallel, previous_class_name, promoted_class_name, class_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const updateStudent = db.prepare(`
      UPDATE students SET year = ?, parallel = ?, class_name = ?
      WHERE id_number = ? AND year = ?
    `);
    for (const student of students) {
      const promotedYear = NEXT_YEAR[normalizePromotionYear(student.year)];
      const promotedParallel = promotedYear === 'ג' ? null : student.parallel;
      const promotedClassName = promotedYear === 'ג' ? null : buildClassName(promotedYear, promotedParallel);
      insertStudent.run(
        promotion.lastInsertRowid, student.id_number, student.year, promotedYear,
        student.parallel, promotedParallel, student.class_name, promotedClassName
      );
      updateStudent.run(promotedYear, promotedParallel, promotedClassName, student.id_number, student.year);
    }
    return { updated: students.length, graduated, can_undo: true };
  })();
}

function undoStudentYearPromotion(db) {
  return db.transaction(() => {
    const promotion = db.prepare(`
      SELECT id, undone_at FROM student_year_promotions ORDER BY id DESC LIMIT 1
    `).get();
    if (!promotion || promotion.undone_at !== null) return { undone: false, updated: 0 };

    const students = db.prepare(`
      SELECT id_number, previous_year, promoted_year, previous_parallel, promoted_parallel,
        previous_class_name, promoted_class_name, class_snapshot
      FROM student_year_promotion_students WHERE promotion_id = ?
    `).all(promotion.id);
    const restoreYear = db.prepare(`
      UPDATE students SET year = ? WHERE id_number = ? AND year = ?
    `);
    const restoreClass = db.prepare(`
      UPDATE students SET year = ?, parallel = ?, class_name = ?
      WHERE id_number = ? AND year = ? AND parallel IS ? AND class_name IS ?
    `);
    let updated = 0;
    for (const student of students) {
      if (student.class_snapshot) {
        updated += restoreClass.run(
          student.previous_year, student.previous_parallel, student.previous_class_name,
          student.id_number, student.promoted_year, student.promoted_parallel, student.promoted_class_name
        ).changes;
      } else {
        updated += restoreYear.run(student.previous_year, student.id_number, student.promoted_year).changes;
      }
    }
    db.prepare(`
      UPDATE student_year_promotions SET undone_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(promotion.id);
    return { undone: true, updated };
  })();
}

module.exports = {
  initializeStudentPromotionSchema,
  canUndoStudentYearPromotion,
  promoteStudentYears,
  undoStudentYearPromotion
};
