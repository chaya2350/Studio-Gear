const Database = require('better-sqlite3');
const db = new Database('studio.db');

function parseExtra(raw) {
  if (!raw) return {};
  try {
    const obj = JSON.parse(String(raw));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function norm(v) {
  return String(v || '').trim();
}

function isNumericOnlyAddress(v) {
  const t = norm(v);
  return !!t && /^\d+$/.test(t);
}

const rows = db.prepare('SELECT id_number, name, address, extra_data FROM students').all();

let nameCandidates = 0;
let nameUpdated = 0;
let addressNumericCandidates = 0;
let addressCleared = 0;

const updateName = db.prepare('UPDATE students SET name = ? WHERE id_number = ?');
const updateAddress = db.prepare('UPDATE students SET address = NULL WHERE id_number = ?');

const tx = db.transaction(() => {
  for (const row of rows) {
    const extra = parseExtra(row.extra_data);
    const currentName = norm(row.name);
    const currentAddress = norm(row.address);

    const firstFromExtra = norm(extra['שם']);

    // Safe name repair: when DB name is one token (likely surname) and extra_data has a different first name.
    if (firstFromExtra && currentName && !currentName.includes(' ') && firstFromExtra !== currentName) {
      nameCandidates++;
      const repaired = `${firstFromExtra} ${currentName}`.replace(/\s+/g, ' ').trim();
      updateName.run(repaired, row.id_number);
      nameUpdated++;
    }

    // Safe address repair: numeric-only address is clearly wrong after old import mapping.
    if (isNumericOnlyAddress(currentAddress)) {
      addressNumericCandidates++;
      updateAddress.run(row.id_number);
      addressCleared++;
    }
  }
});

tx();

console.log(JSON.stringify({
  totalStudents: rows.length,
  nameCandidates,
  nameUpdated,
  addressNumericCandidates,
  addressCleared
}, null, 2));
