const Database = require('better-sqlite3');

const db = new Database('studio.db');
const rows = db.prepare("SELECT id_number, name, track, year, extra_data FROM students WHERE track LIKE ? ORDER BY id DESC LIMIT 300").all('%רוח%');

for (const row of rows) {
  let extra = {};
  try { extra = JSON.parse(row.extra_data || '{}'); } catch { continue; }
  const entries = Object.entries(extra);
  if (!entries.length) continue;

  const maybeParallel = entries.filter(([k, v]) => {
    const key = String(k || '').trim();
    const val = String(v || '').trim();
    return /מקב|parallel|כיתה|class|230|^[0-9]{2,4}$/.test(key) || /^[0-9]{1,2}$/.test(val);
  });

  if (!maybeParallel.length) continue;

  console.log('---');
  console.log(`${row.id_number} | ${row.name} | track=${row.track || ''} | year=${row.year || ''}`);
  for (const [k, v] of maybeParallel) {
    console.log(`  ${k} = ${v}`);
  }
}
