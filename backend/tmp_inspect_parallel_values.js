const Database = require('better-sqlite3');

const db = new Database('studio.db');
const rows = db.prepare(`
  SELECT id_number, name, track, year, extra_data
  FROM students
  WHERE extra_data IS NOT NULL AND extra_data <> '{}' AND TRIM(extra_data) <> ''
  ORDER BY id DESC
  LIMIT 80
`).all();

for (const row of rows) {
  let extra = {};
  try { extra = JSON.parse(row.extra_data || '{}'); } catch { continue; }
  const hasInteresting = Object.keys(extra).some((k) => /עמודה|מקב|parallel|230|כיתה/i.test(k));
  if (!hasInteresting) continue;

  const picks = Object.entries(extra)
    .filter(([k]) => /עמודה|מקב|parallel|230|כיתה/i.test(k))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' | ');

  console.log('---');
  console.log(`${row.id_number} | ${row.name} | track=${row.track || ''} | year=${row.year || ''}`);
  console.log(picks);
}
