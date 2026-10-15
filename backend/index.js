const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bwipjs = require('bwip-js');
const multer = require('multer');
const XLSX = require('xlsx');

const dataDir = process.env.STUDIO_DATA_DIR || process.cwd();
const uploadsDir = process.env.STUDIO_DATA_DIR
  ? path.join(dataDir, 'uploads')
  : path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

const xlsxUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const app = express();
const db = new Database(path.join(dataDir, 'studio.db'));

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

const frontendDir = path.join(__dirname, '../frontend/dist/frontend/browser');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

db.exec(`
  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    description TEXT,
    image_url TEXT,
    rental_price_per_day REAL DEFAULT 0,
    overdue_price_per_day REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL,
    borrower_name TEXT NOT NULL,
    borrower_phone TEXT,
    loan_date TEXT NOT NULL,
    expected_return TEXT NOT NULL,
    actual_return TEXT,
    notes TEXT,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '📦',
    parent_id INTEGER DEFAULT NULL
  );
`);

db.prepare("UPDATE equipment SET image_url = REPLACE(image_url, 'http://localhost:3000', '') WHERE image_url LIKE 'http://localhost:3000/uploads/%'").run();

// Migration: add new loan columns if missing
const loanCols = db.prepare("PRAGMA table_info(loans)").all().map((c) => c.name);
const newLoanCols = [
  ['loan_type', "ALTER TABLE loans ADD COLUMN loan_type TEXT DEFAULT 'loan'"],
  ['price_per_day', "ALTER TABLE loans ADD COLUMN price_per_day REAL DEFAULT 0"],
  ['card_last4', "ALTER TABLE loans ADD COLUMN card_last4 TEXT"],
  ['card_expiry', "ALTER TABLE loans ADD COLUMN card_expiry TEXT"],
  ['card_holder', "ALTER TABLE loans ADD COLUMN card_holder TEXT"],
  ['payment_status', "ALTER TABLE loans ADD COLUMN payment_status TEXT DEFAULT 'pending'"],
  ['track', "ALTER TABLE loans ADD COLUMN track TEXT"],
  ['location', "ALTER TABLE loans ADD COLUMN location TEXT"],
  ['borrower_id_number', "ALTER TABLE loans ADD COLUMN borrower_id_number TEXT"],
  ['deposit_check', "ALTER TABLE loans ADD COLUMN deposit_check INTEGER DEFAULT 0"],
  ['deposit_scan_url', "ALTER TABLE loans ADD COLUMN deposit_scan_url TEXT"],
  ['hebrew_year', "ALTER TABLE loans ADD COLUMN hebrew_year TEXT"],
];
newLoanCols.forEach(([col, sql]) => { if (!loanCols.includes(col)) db.exec(sql); });

const categoryCols = db.prepare("PRAGMA table_info(categories)").all().map((c) => c.name);
if (!categoryCols.includes('parent_id')) db.exec('ALTER TABLE categories ADD COLUMN parent_id INTEGER DEFAULT NULL');

// Migration: rename singular categories to plural
const renameMap = [['מצלמה','מצלמות'],['עדשה','עדשות'],['חצובה','חצובות']];
renameMap.forEach(([from, to]) => {
  db.prepare('UPDATE categories SET name=? WHERE name=?').run(to, from);
  db.prepare('UPDATE equipment SET category=? WHERE category=?').run(to, from);
});

db.prepare("UPDATE equipment SET category='ציוד צילום', subcategory='מצלמות אישיות' WHERE category='מצלמות אישיות'").run();

// Migration: add equipment columns if missing
const cols = db.prepare("PRAGMA table_info(equipment)").all();
const eqColNames = cols.map(c => c.name);
if (!eqColNames.includes('subcategory')) db.exec('ALTER TABLE equipment ADD COLUMN subcategory TEXT');
if (!eqColNames.includes('rental_price_per_day')) db.exec('ALTER TABLE equipment ADD COLUMN rental_price_per_day REAL DEFAULT 0');
if (!eqColNames.includes('overdue_price_per_day')) db.exec('ALTER TABLE equipment ADD COLUMN overdue_price_per_day REAL DEFAULT 0');

const defaultCategories = [
  ['ציוד צילום','📷', null],
  ['מצלמות','📷', null],
  ['עדשות','🔭', null],
  ['תאורה','💡', null],
  ['שמע','🎙️', null],
  ['חצובות','🎬', null],
  ['גימבל','🎥', null],
  ['נק','📦', null],
  ['אחר','📦', null],
  ['מחשבים ניידים','🖥️', null],
  ['מחשב נייד','💻', null],
];
const ins = db.prepare('INSERT OR IGNORE INTO categories (name, icon, parent_id) VALUES (?, ?, ?)');
defaultCategories.forEach(([n, i, p]) => ins.run(n, i, p));

const photoGroupId = db.prepare("SELECT id FROM categories WHERE name = 'ציוד צילום'").get()?.id;
if (photoGroupId) {
  db.prepare("UPDATE categories SET parent_id = ? WHERE name IN ('מצלמות','עדשות','תאורה','שמע','חצובות','גימבל','נק','אחר','מצלמות אישיות') AND parent_id IS NULL").run(photoGroupId);
}
const laptopGroupId = db.prepare("SELECT id FROM categories WHERE name = 'מחשבים ניידים'").get()?.id;
if (laptopGroupId) {
  db.prepare("UPDATE categories SET parent_id = ? WHERE name = 'מחשב נייד' AND parent_id IS NULL").run(laptopGroupId);
}

const legacyPhotoCategory = db.prepare("SELECT id FROM categories WHERE name = 'מצלמות אישיות'").get()?.id;
if (legacyPhotoCategory && photoGroupId) {
  db.prepare("UPDATE categories SET parent_id = ? WHERE id = ?").run(photoGroupId, legacyPhotoCategory);
}

// ── Students ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    track TEXT,
    year TEXT
  );
`);

app.get('/api/students', (req, res) => {
  const { q } = req.query;
  if (q) {
    const rows = db.prepare(`SELECT * FROM students WHERE id_number LIKE ? OR name LIKE ? LIMIT 20`)
      .all(`%${q}%`, `%${q}%`);
    return res.json(rows);
  }
  res.json(db.prepare('SELECT * FROM students ORDER BY name').all());
});

app.get('/api/students/:id_number', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'לא נמצא' });
  const loans = db.prepare(`
    SELECT l.*, e.name as equipment_name, e.barcode, e.category
    FROM loans l JOIN equipment e ON e.id = l.equipment_id
    WHERE l.borrower_id_number = ?
    ORDER BY l.loan_date DESC
  `).all(req.params.id_number);
  res.json({ ...student, loans });
});

app.post('/api/students/import', xlsxUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    let allRows = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length > 0) console.log(`Sheet "${sheetName}" columns:`, Object.keys(rows[0]));
      allRows = allRows.concat(rows);
    }
    const rows = allRows;

    const insert = db.prepare(`
      INSERT INTO students (id_number, name, phone, track, year)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id_number) DO UPDATE SET name=excluded.name, phone=excluded.phone, track=excluded.track, year=excluded.year
    `);

    let imported = 0, skipped = 0;
    const importMany = db.transaction((rows) => {
      for (const row of rows) {
        const id_number = String(row["מס' זהות"] || row['ת. זהות'] || row['ת.ז'] || row['ת.ז.'] || row['תז'] || row['id_number'] || row['ID'] || '').trim();
        const firstName = String(row['שם פרטי'] || '').trim();
        const lastName = String(row['משפחה'] || '').trim();
        const name = [lastName, firstName].filter(Boolean).join(' ') || String(row['שם'] || row['שם מלא'] || row['name'] || '').trim();
        const phone = String(row['נייד אישי'] || row['טלפון'] || row['phone'] || '').trim();
        const track = String(row['התמחות'] ||  row['מסלול'] || row['התמחות 1'] || row['מגמה'] || row['מגמה '] || row['track'] || '').trim();
        const year = String(row['כיתה'] || row['שנה'] || row['year'] || '').trim();
        if (!id_number || !name) { skipped++; continue; }
        insert.run(id_number, name, phone, track, year);
        imported++;
      }
    });
    importMany(rows);
    res.json({ imported, skipped, total: rows.length });
  } catch (e) {
    console.error('Import error:', e);
    res.status(500).json({ error: 'שגיאה בקריאת הקובץ: ' + e.message });
  }
});

// ── Categories ─────────────────────────────────────────────
app.get('/api/categories', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, p.name as parent_name
    FROM categories c
    LEFT JOIN categories p ON p.id = c.parent_id
    ORDER BY COALESCE(p.name, c.name), c.name
  `).all());
});
app.post('/api/categories', (req, res) => {
  const { name, icon, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: 'שם קטגוריה חובה' });
  try {
    const result = db.prepare('INSERT INTO categories (name, icon, parent_id) VALUES (?, ?, ?)')
      .run(name, icon || '📦', parent_id ?? null);
    res.json({ id: result.lastInsertRowid, name, icon: icon || '📦', parent_id: parent_id ?? null });
  } catch { res.status(400).json({ error: 'קטגוריה כבר קיימת' }); }
});
app.delete('/api/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Equipment ──────────────────────────────────────────────
// Helper: build equipment status for a given date
function equipmentQuery(whereClause = '') {
  return `
    SELECT e.*,
      CASE WHEN e.category = 'מצלמות אישיות' THEN 'ציוד צילום' ELSE e.category END as category,
      CASE WHEN e.category = 'מצלמות אישיות' THEN 'מצלמות אישיות' ELSE e.subcategory END as subcategory,
      CASE WHEN active.id IS NOT NULL THEN 1 ELSE 0 END as is_loaned,
      active.borrower_name, active.expected_return, active.loan_date, active.id as loan_id, active.borrower_phone, active.notes, active.track, active.location,
      CASE WHEN future.cnt > 0 THEN 1 ELSE 0 END as is_reserved
    FROM equipment e
    LEFT JOIN loans active ON active.equipment_id = e.id AND active.actual_return IS NULL AND active.loan_date <= date('now')
    LEFT JOIN (SELECT equipment_id, COUNT(*) as cnt FROM loans WHERE actual_return IS NULL AND loan_date > date('now') GROUP BY equipment_id) future
      ON future.equipment_id = e.id
    ${whereClause}
  `;
}

app.get('/api/equipment', (req, res) => {
  res.json(db.prepare(equipmentQuery()).all());
});

// Generate a new unique barcode number
app.get('/api/equipment/new-barcode', (req, res) => {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  res.json({ barcode: `SG-${ts}${rand}` });
});

app.get('/api/equipment/barcode/:barcode', (req, res) => {
  const row = db.prepare(equipmentQuery('WHERE e.barcode = ?')).get(req.params.barcode);
  if (!row) return res.status(404).json({ error: 'Equipment not found' });
  res.json(row);
});

app.get('/api/equipment/:id', (req, res) => {
  const row = db.prepare(equipmentQuery('WHERE e.id = ?')).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Equipment not found' });
  res.json(row);
});

function normalizeEquipmentName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function ensureUniqueEquipmentName(name, excludeId = null) {
  const trimmed = normalizeEquipmentName(name);
  if (!trimmed) return null;
  const existing = db.prepare(
    'SELECT id FROM equipment WHERE lower(name) = lower(?) AND (? IS NULL OR id != ?)' 
  ).get(trimmed, excludeId, excludeId);
  return existing ? 'שם הציוד כבר קיים במערכת' : null;
}

app.post('/api/equipment', (req, res) => {
  const { barcode, name, category, subcategory, description, image_url, rental_price_per_day, overdue_price_per_day } = req.body;
  const normalizedName = normalizeEquipmentName(name);
  if (!normalizedName) return res.status(400).json({ error: 'שם הציוד הוא שדה חובה' });
  const duplicateError = ensureUniqueEquipmentName(normalizedName);
  if (duplicateError) return res.status(409).json({ error: duplicateError });

  try {
    const finalCategory = category === 'מחשב נייד' ? 'מחשב נייד' : category;
    const finalSubcategory = finalCategory === 'מחשב נייד' ? null : (subcategory || null);
    const finalRental = finalCategory === 'מחשב נייד' ? 0 : (rental_price_per_day || 0);
    const finalOverdue = finalCategory === 'מחשב נייד' ? 0 : (overdue_price_per_day || 0);

    const result = db.prepare(
      'INSERT INTO equipment (barcode, name, category, subcategory, description, image_url, rental_price_per_day, overdue_price_per_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(barcode, normalizedName, finalCategory, finalSubcategory, description, image_url, finalRental, finalOverdue);
    res.json({ id: result.lastInsertRowid });
  } catch { res.status(400).json({ error: 'Barcode already exists' }); }
});

app.put('/api/equipment/:id', (req, res) => {
  const { barcode, name, category, subcategory, description, image_url, rental_price_per_day, overdue_price_per_day } = req.body;
  const normalizedName = normalizeEquipmentName(name);
  if (!normalizedName) return res.status(400).json({ error: 'שם הציוד הוא שדה חובה' });
  const duplicateError = ensureUniqueEquipmentName(normalizedName, Number(req.params.id));
  if (duplicateError) return res.status(409).json({ error: duplicateError });

  const finalCategory = category === 'מחשב נייד' ? 'מחשב נייד' : category;
  const finalSubcategory = finalCategory === 'מחשב נייד' ? null : (subcategory || null);
  const finalRental = finalCategory === 'מחשב נייד' ? 0 : (rental_price_per_day || 0);
  const finalOverdue = finalCategory === 'מחשב נייד' ? 0 : (overdue_price_per_day || 0);

  db.prepare('UPDATE equipment SET barcode=?, name=?, category=?, subcategory=?, description=?, image_url=?, rental_price_per_day=?, overdue_price_per_day=? WHERE id=?')
    .run(barcode, normalizedName, finalCategory, finalSubcategory, description, image_url, finalRental, finalOverdue, req.params.id);
  res.json({ success: true });
});

app.delete('/api/equipment/:id', (req, res) => {
  db.prepare('DELETE FROM equipment WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/equipment/:id/barcode', async (req, res) => {
  const row = db.prepare('SELECT * FROM equipment WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: row.barcode,
      scale: 3,
      height: 14,
      includetext: false,
      backgroundcolor: 'ffffff',
    });
    res.set('Content-Type', 'image/png');
    res.set('X-Equipment-Name', encodeURIComponent(row.name));
    res.set('X-Equipment-Barcode', row.barcode);
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: 'Barcode generation failed' });
  }
});

// Subcategories per category
app.get('/api/subcategories/:category', (req, res) => {
  const rows = db.prepare(
    "SELECT DISTINCT subcategory FROM equipment WHERE category=? AND subcategory IS NOT NULL AND subcategory != '' ORDER BY subcategory"
  ).all(req.params.category);
  res.json(rows.map(r => r.subcategory));
});

// ── Loans ──────────────────────────────────────────────────
app.get('/api/loans', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT l.*, e.name as equipment_name, e.barcode, e.category,
      CASE WHEN l.actual_return IS NULL AND l.loan_date > ? THEN 1 ELSE 0 END as is_future
    FROM loans l
    JOIN equipment e ON e.id = l.equipment_id
    WHERE NOT (
      e.category = 'מצלמות אישיות' OR
      (e.category = 'ציוד צילום' AND e.subcategory = 'מצלמות אישיות')
    )
    ORDER BY l.actual_return IS NULL DESC, l.loan_date ASC, l.expected_return ASC
  `).all(today);
  res.json(rows);
});

app.get('/api/loans/overdue', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const rows = db.prepare(`
    SELECT l.*, e.name as equipment_name, e.barcode, e.category
    FROM loans l
    JOIN equipment e ON e.id = l.equipment_id
    WHERE l.actual_return IS NULL
      AND l.loan_date <= ?
      AND l.expected_return < ?
      AND NOT (
        e.category = 'מצלמות אישיות' OR
        (e.category = 'ציוד צילום' AND e.subcategory = 'מצלמות אישיות')
      )
    ORDER BY l.expected_return ASC
  `).all(today, today);
  res.json(rows);
});

app.get('/api/loans/equipment/:equipmentId', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const rows = db.prepare('SELECT * FROM loans WHERE equipment_id = ? ORDER BY loan_date DESC')
    .all(req.params.equipmentId);
  // tag each loan as future or not
  res.json(rows.map(l => ({ ...l, is_future: l.actual_return === null && l.loan_date > today ? 1 : 0 })));
});

app.post('/api/loans', (req, res) => {
  const { equipment_id, borrower_name, borrower_phone, borrower_id_number, loan_date, expected_return, notes,
          loan_type, price_per_day, card_last4, card_expiry, card_holder, track, location,
          deposit_check, deposit_scan_url, hebrew_year } = req.body;
  const today = new Date().toISOString().split('T')[0];

  const eq = db.prepare('SELECT category, subcategory FROM equipment WHERE id=?').get(equipment_id);
  const isLaptop = eq && eq.category === 'מחשב נייד';
  const isPersonalCamera = eq && (
    eq.category === 'מצלמות אישיות' ||
    (eq.category === 'ציוד צילום' && eq.subcategory === 'מצלמות אישיות')
  );

  if (isPersonalCamera) {
    if (!borrower_name) return res.status(400).json({ error: 'שם השואל חובה' });
    if (!notes || !String(notes).trim()) return res.status(400).json({ error: 'חובה לכתוב מה קיבלה בנוסף למצלמה' });
    if (deposit_check && !deposit_scan_url) return res.status(400).json({ error: 'נא להעלות סריקת שיק/פיקדון' });

    const active = db.prepare('SELECT id FROM loans WHERE equipment_id=? AND actual_return IS NULL').get(equipment_id);
    if (active) return res.status(400).json({ error: 'המצלמה כבר הוזמנה' });

    const loanStart = '2026-09-01';
    const loanEnd = '2027-06-30';

    const result = db.prepare(
      `INSERT INTO loans (equipment_id, borrower_name, borrower_phone, borrower_id_number, loan_date, expected_return, notes,
        loan_type, payment_status, track, location, deposit_check, deposit_scan_url, hebrew_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'loan', 'none', ?, ?, ?, ?, ?)`
    ).run(equipment_id, borrower_name, borrower_phone || '', borrower_id_number || null, loanStart, loanEnd, notes,
      track || 'גרפיקה א', location || null, Number(Boolean(deposit_check)), deposit_scan_url || null, hebrew_year || 'תשפ"ז');
    return res.json({ id: result.lastInsertRowid });
  }

  if (!loan_date || !expected_return) return res.status(400).json({ error: 'תאריכים חסרים' });
  if (loan_date < today) return res.status(400).json({ error: 'תאריך ההתחלה לא יכול להיות בעבר' });
  if (expected_return < loan_date) return res.status(400).json({ error: 'תאריך ההחזרה חייב להיות אחרי תאריך ההתחלה' });

  const start = new Date(loan_date), end = new Date(expected_return);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (days > 14) return res.status(400).json({ error: 'לא ניתן להשאיל/להשכיר ליותר מ-14 יום' });

  if (!isLaptop && (!card_last4 || !card_expiry || !card_holder)) return res.status(400).json({ error: 'פרטי אשראי חובה' });

  if (isLaptop) {
    const active = db.prepare('SELECT id FROM loans WHERE equipment_id=? AND actual_return IS NULL').get(equipment_id);
    if (active) return res.status(400).json({ error: 'המחשב כבר מושאל' });
    const result = db.prepare(
      `INSERT INTO loans (equipment_id, borrower_name, borrower_phone, borrower_id_number, loan_date, expected_return, notes, loan_type, payment_status, track, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'loan', 'none', ?, ?)`
    ).run(equipment_id, borrower_name, borrower_phone, borrower_id_number || null, loan_date, expected_return, notes, track || null, location || null);
    return res.json({ id: result.lastInsertRowid });
  }

  const overlap = db.prepare(`
    SELECT id FROM loans
    WHERE equipment_id = ?
      AND actual_return IS NULL
      AND loan_date <= ?
      AND expected_return >= ?
  `).get(equipment_id, expected_return, loan_date);
  if (overlap) return res.status(400).json({ error: 'הציוד כבר תפוס בתאריכים אלו' });

  const result = db.prepare(
    `INSERT INTO loans (equipment_id, borrower_name, borrower_phone, borrower_id_number, loan_date, expected_return, notes,
      loan_type, price_per_day, card_last4, card_expiry, card_holder, payment_status, track, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(equipment_id, borrower_name, borrower_phone, borrower_id_number || null, loan_date, expected_return, notes,
        loan_type || 'loan', price_per_day || 0, card_last4, card_expiry, card_holder, 'pending', track || null, location || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/loans/:id/return', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const loan = db.prepare('SELECT l.*, e.rental_price_per_day, e.overdue_price_per_day FROM loans l JOIN equipment e ON e.id = l.equipment_id WHERE l.id=?').get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'השאלה לא נמצאה' });
  if (loan.loan_date > today) return res.status(400).json({ error: 'לא ניתן להחזיר לפני תאריך ההשאלה' });

  const isOverdue = today > loan.expected_return;
  let chargeAmount = 0;

  if (loan.loan_type === 'rental') {
    const start = new Date(loan.loan_date), end = new Date(today);
    const days = Math.max(1, Math.round((end - start) / (1000*60*60*24)));
    chargeAmount = days * (loan.price_per_day || loan.rental_price_per_day || 0);
  } else if (isOverdue) {
    const end = new Date(today), expected = new Date(loan.expected_return);
    const overdueDays = Math.round((end - expected) / (1000*60*60*24));
    chargeAmount = overdueDays * (loan.overdue_price_per_day || 0);
  }

  // Block return if there's a charge and payment not yet done
  if (chargeAmount > 0 && loan.payment_status !== 'charged') {
    return res.status(402).json({ error: 'נדרש תשלום לפני החזרה', chargeAmount, isOverdue });
  }

  const paymentStatus = chargeAmount > 0 ? 'charged' : 'none';
  db.prepare('UPDATE loans SET actual_return=?, payment_status=? WHERE id=?').run(today, paymentStatus, req.params.id);
  res.json({ success: true, chargeAmount, isOverdue });
});

app.put('/api/loans/:id/charge', (req, res) => {
  const { amount } = req.body;
  const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'השאלה לא נמצאה' });
  // Simulate charge — replace with real payment gateway call
  db.prepare('UPDATE loans SET payment_status=? WHERE id=?').run('charged', req.params.id);
  res.json({ success: true, amount, card_last4: loan.card_last4, message: `חוייב סך של ${amount} שקל לכרטיס *${loan.card_last4}` });
});

app.delete('/api/loans/:id', (req, res) => {
  db.prepare('DELETE FROM loans WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Order receipt barcode ────────────────────────────────
app.get('/api/loans/receipt-barcode/:id', async (req, res) => {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: `ORDER-${req.params.id}`,
      scale: 3,
      height: 16,
      includetext: true,
      textxalign: 'center',
      backgroundcolor: 'ffffff',
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: 'Barcode generation failed' });
  }
});

// ── Laptop overdue ────────────────────────────────────────

function getLaptopOverdue() {
  return db.prepare(`
    SELECT l.*, e.name as equipment_name, e.category
    FROM loans l JOIN equipment e ON e.id = l.equipment_id
    WHERE e.category = 'מחשב נייד'
      AND l.actual_return IS NULL
  `).all();
}

app.get('/api/laptops/overdue', (req, res) => {
  res.json(getLaptopOverdue());
});

// ── Approval Types ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS approval_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template TEXT NOT NULL,
    signature TEXT NOT NULL DEFAULT 'principal',
    type TEXT NOT NULL DEFAULT 'regular'
  );
`);

const approvalTypeCols = db.prepare("PRAGMA table_info(approval_types)").all().map(c => c.name);
if (!approvalTypeCols.includes('type')) db.exec("ALTER TABLE approval_types ADD COLUMN type TEXT NOT NULL DEFAULT 'regular'");

// Migration: ensure אישור רווקה exists as single type
const singleExists = db.prepare("SELECT id FROM approval_types WHERE type='single'").get();
if (!singleExists) {
  db.prepare('INSERT INTO approval_types (name, template, signature, type) VALUES (?, ?, ?, ?)').run(
    'אישור רווקה',
    'מוסד לימודים: סמינר גור ירושלים\nשנת לימודים: {{שנה}}\n\nמאשרים בזאת כי הגב\' {{שם}}, ת.ז. {{תז}},\nילידת {{תאריך לידה}}, המתגוררת ב{{כתובת}},\nהינה תלמידה במוסדנו במסלול {{מסלול}}\nולמיטב ידיעתנו הינה רווקה.\n\nהאישור ניתן לפי בקשתה לצורך הגשה לרשויות.',
    'principal', 'single');
}

// seed default approval types if empty
const approvalCount = db.prepare('SELECT COUNT(*) as c FROM approval_types').get().c;
if (approvalCount === 0) {
  const ins = db.prepare('INSERT INTO approval_types (name, template, signature) VALUES (?, ?, ?)');
  ins.run('אישור נוכחות',
    'לכל המעוניין,\n\nהנני לאשר שהתלמידה:\n\n{{שם}}\nמספר זהות: {{תז}}\nסטודנטית במוסדנו\nבשנת הלימודים {{שנה}}\nבסמינר גור ירושלים',
    'principal');
  ins.run('אישור לימודים',
    'לכל המעוניין,\n\nהרני לאשר בי התלמידה: {{שם}} מס\' ת.ז: {{תז}}\nלומדת כתלמידה מן המנין במוסדנו\nבין השנים: {{שנה}}\nבמגמת: {{מסלול}}\nבס"ך כולל של 2100 שעות\nהכל ונאיות לדיפלמה מטעם מה"ט לאחר שתגיש פרויקט גמר.\n\nבברכה,\nההנהלה',
    'principal');
  db.prepare('INSERT INTO approval_types (name, template, signature, type) VALUES (?, ?, ?, ?)').run(
    'אישור 12 שנות לימוד',
    'לכל המעוניין,\n\nהתלמידה-{{שם}}\nמס\' זהות-{{תז}}\nסיימה במוסדנו, סמינר גור ירושלים\nאת 12 שנות תיכון בשנת תשפ"ו,\nסמל מוסד 142075.\n\nבברכה,\nהמנהלת-גב\' דינה כהן',
    'principal', 'regular');
}

app.get('/api/approval-types', (req, res) => {
  res.json(db.prepare('SELECT * FROM approval_types ORDER BY id').all());
});

app.post('/api/approval-types', (req, res) => {
  const { name, template, signature } = req.body;
  if (!name || !template) return res.status(400).json({ error: 'שם ותבנית חובה' });
  const result = db.prepare('INSERT INTO approval_types (name, template, signature) VALUES (?, ?, ?)')
    .run(name, template, signature || 'principal');
  res.json({ id: result.lastInsertRowid, name, template, signature: signature || 'principal' });
});

app.put('/api/approval-types/:id', (req, res) => {
  const { name, template, signature } = req.body;
  db.prepare('UPDATE approval_types SET name=?, template=?, signature=? WHERE id=?')
    .run(name, template, signature, req.params.id);
  res.json({ success: true });
});

app.delete('/api/approval-types/:id', (req, res) => {
  db.prepare('DELETE FROM approval_types WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Backend running on port ${port}`));
