// חישוב שנת גמר לבוגרת — מחפש את הקידום האחרון של התלמידה ל"בוגרות"
// בטוח: אם טבלאות הקידום עוד לא נוצרו (לא בוצעה אף העלאת שנה), מחזיר null בשקט.
const TABLES_EXIST_SQL = `
  SELECT COUNT(*) AS c FROM sqlite_master
  WHERE type = 'table' AND name IN ('student_year_promotions', 'student_year_promotion_students')
`;

function graduateYearFor(db, idNumber) {
  try {
    // לא לגעת בשאילתת ה-JOIN לפני ששתי הטבלאות באמת קיימות
    const { c } = db.prepare(TABLES_EXIST_SQL).get();
    if (c < 2) return null;

    const row = db.prepare(`
      SELECT p.created_at
      FROM student_year_promotion_students s
      JOIN student_year_promotions p ON p.id = s.promotion_id
      WHERE s.id_number = ? AND s.promoted_year = 'בוגרות'
      ORDER BY p.created_at DESC LIMIT 1
    `).get(String(idNumber));
    if (!row || !row.created_at) return null;

    const year = new Date(row.created_at).getFullYear();
    return Number.isFinite(year) ? year : null;
  } catch {
    // כל תקלה בלתי צפויה — לא להפיל את /api/students בגלל פיצ'ר קוסמטי
    return null;
  }
}

module.exports = { graduateYearFor };
