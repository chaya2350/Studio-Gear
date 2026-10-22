const Database = require('better-sqlite3');

const db = new Database('studio.db');

const totals = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN extra_data IS NULL OR extra_data = '{}' OR TRIM(extra_data) = '' THEN 1 ELSE 0 END) AS empty_extra
  FROM students
`).get();

console.log('TOTAL=', totals.total, 'EMPTY_EXTRA=', totals.empty_extra, 'NON_EMPTY=', totals.total - (totals.empty_extra || 0));

const sample = db.prepare(`
  SELECT id_number, name, track, year, extra_data
  FROM students
  WHERE extra_data IS NOT NULL AND extra_data <> '{}' AND TRIM(extra_data) <> ''
  ORDER BY id DESC
  LIMIT 20
`).all();

for (const row of sample) {
  let extra = {};
  try { extra = JSON.parse(row.extra_data || '{}'); } catch { extra = {}; }
  const keys = Object.keys(extra);
  console.log('---');
  console.log(`${row.id_number} | ${row.name} | track=${row.track || ''} | year=${row.year || ''}`);
  console.log('keys:', keys.join(' | '));
}
