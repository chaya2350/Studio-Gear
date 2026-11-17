const db = require('better-sqlite3')('./studio.db', { readonly: true });
try {
  const rows = db.prepare("SELECT extra_data FROM students WHERE year = 'בוגרות' LIMIT 2").all();
  console.log(JSON.stringify(rows, null, 1));
  const cols = db.prepare('PRAGMA table_info(students)').all().map(c => c.name);
  console.log('COLS:', cols.join(','));
} catch (e) { console.log('ERR', e.message); }
