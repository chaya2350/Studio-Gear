const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bwipjs = require('bwip-js');
const multer = require('multer');

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

const app = express();
const db = new Database('studio.db');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  res.json({ url: `http://localhost:3000/uploads/${req.file.filename}` });
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
    icon TEXT DEFAULT '📦'
  );
`);

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
];
newLoanCols.forEach(([col, sql]) => { if (!loanCols.includes(col)) db.exec(sql); });

// Migration: rename singular categories to plural
const renameMap = [['מצלמה','מצלמות'],['עדשה','עדשות'],['חצובה','חצובות']];
renameMap.forEach(([from, to]) => {
  db.prepare('UPDATE categories SET name=? WHERE name=?').run(to, from);
  db.prepare('UPDATE equipment SET category=? WHERE category=?').run(to, from);
});

// Migration: add equipment columns if missing
const cols = db.prepare("PRAGMA table_info(equipment)").all();
const eqColNames = cols.map(c => c.name);
if (!eqColNames.includes('subcategory')) db.exec('ALTER TABLE equipment ADD COLUMN subcategory TEXT');
if (!eqColNames.includes('rental_price_per_day')) db.exec('ALTER TABLE equipment ADD COLUMN rental_price_per_day REAL DEFAULT 0');
if (!eqColNames.includes('overdue_price_per_day')) db.exec('ALTER TABLE equipment ADD COLUMN overdue_price_per_day REAL DEFAULT 0');

const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)');
  [['מצלמות','📷'],['עדשות','🔭'],['תאורה','💡'],['שמע','🎙️'],['חצובות','🎬'],['אחר','📦']]
    .forEach(([n, i]) => ins.run(n, i));
}

// ── Categories ─────────────────────────────────────────────
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});
app.post('/api/categories', (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'שם קטגוריה חובה' });
  try {
    const result = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)').run(name, icon || '📦');
    res.json({ id: result.lastInsertRowid, name, icon: icon || '📦' });
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

app.post('/api/equipment', (req, res) => {
  const { barcode, name, category, subcategory, description, image_url, rental_price_per_day, overdue_price_per_day } = req.body;
  try {
    const result = db.prepare(
      'INSERT INTO equipment (barcode, name, category, subcategory, description, image_url, rental_price_per_day, overdue_price_per_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(barcode, name, category, subcategory || null, description, image_url, rental_price_per_day || 0, overdue_price_per_day || 0);
    res.json({ id: result.lastInsertRowid });
  } catch { res.status(400).json({ error: 'Barcode already exists' }); }
});

app.put('/api/equipment/:id', (req, res) => {
  const { barcode, name, category, subcategory, description, image_url, rental_price_per_day, overdue_price_per_day } = req.body;
  db.prepare('UPDATE equipment SET barcode=?, name=?, category=?, subcategory=?, description=?, image_url=?, rental_price_per_day=?, overdue_price_per_day=? WHERE id=?')
    .run(barcode, name, category, subcategory || null, description, image_url, rental_price_per_day || 0, overdue_price_per_day || 0, req.params.id);
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
    WHERE l.actual_return IS NULL AND l.loan_date <= ? AND l.expected_return < ?
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
  const { equipment_id, borrower_name, borrower_phone, loan_date, expected_return, notes,
          loan_type, price_per_day, card_last4, card_expiry, card_holder, track, location } = req.body;
  const today = new Date().toISOString().split('T')[0];

  if (!loan_date || !expected_return) return res.status(400).json({ error: 'תאריכים חסרים' });
  if (loan_date < today) return res.status(400).json({ error: 'תאריך ההתחלה לא יכול להיות בעבר' });
  if (expected_return < loan_date) return res.status(400).json({ error: 'תאריך ההחזרה חייב להיות אחרי תאריך ההתחלה' });

  // Max 14 days
  const start = new Date(loan_date), end = new Date(expected_return);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (days > 14) return res.status(400).json({ error: 'לא ניתן להשאיל/להשכיר ליותר מ-14 יום' });

  // Credit card required (not for laptops)
  const eq = db.prepare('SELECT category FROM equipment WHERE id=?').get(equipment_id);
  const isLaptop = eq && eq.category === 'מחשב נייד';
  if (!isLaptop && (!card_last4 || !card_expiry || !card_holder)) return res.status(400).json({ error: 'פרטי אשראי חובה' });

  // Laptop: same-day only, no overlap check needed beyond active loan
  if (isLaptop) {
    const active = db.prepare('SELECT id FROM loans WHERE equipment_id=? AND actual_return IS NULL').get(equipment_id);
    if (active) return res.status(400).json({ error: 'המחשב כבר מושאל' });
    const result = db.prepare(
      `INSERT INTO loans (equipment_id, borrower_name, borrower_phone, loan_date, expected_return, notes, loan_type, payment_status, track, location)
       VALUES (?, ?, ?, ?, ?, ?, 'loan', 'none', ?, ?)`
    ).run(equipment_id, borrower_name, borrower_phone, loan_date, expected_return, notes, track || null, location || null);
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
    `INSERT INTO loans (equipment_id, borrower_name, borrower_phone, loan_date, expected_return, notes,
      loan_type, price_per_day, card_last4, card_expiry, card_holder, payment_status, track, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(equipment_id, borrower_name, borrower_phone, loan_date, expected_return, notes,
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

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));
