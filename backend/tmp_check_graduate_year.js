// בדיקת חוסן: מה קורה כשהטבלה לא קיימת בכלל?
const Database = require('better-sqlite3');
const { graduateYearFor } = require('./graduate-year');

const db = new Database('./studio.db', { readonly: true });
try {
  const result = graduateYearFor(db, '123456789');
  console.log('OK, returned:', result);
} catch (e) {
  console.log('CRASH:', e.message);
}

// בדיקת פורמט תאריך CURRENT_TIMESTAMP
const d = new Date('2026-11-11 19:34:58');
console.log('date parse:', d.getFullYear());
