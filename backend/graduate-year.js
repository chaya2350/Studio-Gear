// חישוב שנת גמר לבוגרת — מחפש את הקידום האחרון של התלמידה ל"בוגרות"
function graduateYearFor(db, idNumber) {
  const row = db.prepare(`
    SELECT p.created_at
    FROM student_year_promotion_students s
    JOIN student_year_promotions p ON p.id = s.promotion_id
    WHERE s.id_number = ? AND s.promoted_year = 'בוגרות'
    ORDER BY p.created_at DESC LIMIT 1
  `).get(String(idNumber));
  if (!row) return null;
  const year = new Date(row.created_at).getFullYear();
  return Number.isFinite(year) ? year : null;
}

module.exports = { graduateYearFor };
