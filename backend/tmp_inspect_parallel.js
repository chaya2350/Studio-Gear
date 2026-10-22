const Database = require('better-sqlite3');

const db = new Database('studio.db');
const rows = db.prepare('SELECT id_number, name, year, extra_data FROM students ORDER BY id DESC LIMIT 2000').all();

let printed = 0;
for (const r of rows) {
  let extra = {};
  try {
    extra = JSON.parse(r.extra_data || '{}');
  } catch {
    continue;
  }

  const keys = Object.keys(extra);
  const match = keys.filter((k) => /מקב|parallel|כיתה|class|שכבה|grade|התמח/i.test(String(k)));
  if (!match.length) continue;

  console.log('---');
  console.log(`${r.id_number} | ${r.name} | year=${r.year || ''}`);
  for (const key of match) {
    console.log(`  ${key} = ${extra[key]}`);
  }
  printed++;
  if (printed >= 40) break;
}

console.log('MATCHED_ROWS=', printed);
