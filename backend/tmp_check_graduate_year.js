// בדיקה מלאה: DB זמני עם טבלאות קידום + נתונים
const Database = require('better-sqlite3');
const { graduateYearFor } = require('./graduate-year');
const { initializeStudentPromotionSchema, promoteStudentYears } = require('./student-promotion');

const db = new Database(':memory:');
initializeStudentPromotionSchema(db);
db.exec(`CREATE TABLE students (id_number TEXT, name TEXT, year TEXT, parallel TEXT, class_name TEXT)`);
db.prepare(`INSERT INTO students VALUES ('111', 'רבקי', 'ג', NULL, NULL)`).run();

// קידום לבוגרות
const result = promoteStudentYears(db);
console.log('promoted:', result);

const year = graduateYearFor(db, '111');
console.log('graduate year:', year, typeof year);
console.log('unknown student:', graduateYearFor(db, '999'));
