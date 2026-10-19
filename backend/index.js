const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bwipjs = require('bwip-js');
const multer = require('multer');
const XLSX = require('xlsx');
const { createHash, randomBytes } = require('crypto');
const { hashPassword, verifyPassword, initializeAuthSchema } = require('./auth-utils');
const { parseCalendarWorkbook } = require('./calendar-import');

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
initializeAuthSchema(db);
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());

app.use(cors());
app.use(express.json());

const frontendDir = path.join(__dirname, '../frontend/dist/frontend/browser');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

const sessionCookie = 'studio_session';
const sessionDurationSeconds = 7 * 24 * 60 * 60;

function appendSessionCookie(res, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${sessionCookie}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function getSessionToken(req) {
  const cookie = req.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${sessionCookie}=`));
  return cookie ? cookie.slice(sessionCookie.length + 1) : null;
}

function isAllowedOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  const host = req.get('host');
  const configuredOrigin = process.env.APP_ORIGIN?.replace(/\/$/, '');
  const allowedOrigins = new Set([
    configuredOrigin,
    `http://${host}`,
    `https://${host}`,
    'http://localhost:4200',
    'http://127.0.0.1:4200'
  ].filter(Boolean));
  return allowedOrigins.has(origin);
}

function authenticate(req, res, next) {
  const token = getSessionToken(req);
  if (!token) return res.status(401).json({ error: 'נדרשת התחברות' });

  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `).get(createHash('sha256').update(token).digest('hex'), new Date().toISOString());
  if (!user) return res.status(401).json({ error: 'פג תוקף ההתחברות, יש להתחבר מחדש' });
  req.user = user;
  next();
}

function authorizeApi(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'מקור הבקשה אינו מורשה' });
  }
  if (req.user.role === 'secretary' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const allowed = /^\/(students(?:\/[^/]+)?|approval-types(?:\/\d+)?|calendar-events\/import|messages(?:\/\d+\/(?:reactions|tasks))?|tasks\/\d+\/completion)\/?$/.test(req.path);
    if (!allowed) return res.status(403).json({ error: 'אין הרשאה לבצע פעולה זו' });
  }
  if (req.path.startsWith('/users') && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'פעולה זו מיועדת למנהלת מערכת בלבד' });
  }
  next();
}

app.post('/api/auth/login', (req, res) => {
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'מקור הבקשה אינו מורשה' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!email || typeof password !== 'string') {
    return res.status(400).json({ error: 'נא להזין אימייל וסיסמה' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1').get(email);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: 'האימייל או הסיסמה שגויים' });
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), user.id, expiresAt);
  appendSessionCookie(res, token, sessionDurationSeconds);
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.post('/api/auth/logout', (req, res) => {
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: 'מקור הבקשה אינו מורשה' });
  const token = getSessionToken(req);
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .run(createHash('sha256').update(token).digest('hex'));
  }
  appendSessionCookie(res, '', 0);
  res.json({ success: true });
});

app.use('/api', authenticate, authorizeApi);
app.use('/uploads', authenticate, express.static(uploadsDir));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id, created_at);
  CREATE INDEX IF NOT EXISTS messages_recipient_id_idx ON messages(recipient_id, created_at);
  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );
  CREATE TABLE IF NOT EXISTS personal_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, source_message_id)
  );
  CREATE INDEX IF NOT EXISTS personal_tasks_user_due_idx ON personal_tasks(user_id, due_date);
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_date TEXT NOT NULL,
    hebrew_year INTEGER NOT NULL,
    category TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (event_date, title, category, source_sheet)
  );
  CREATE INDEX IF NOT EXISTS calendar_events_date_idx ON calendar_events(event_date);
`);

const allowedMessageReactions = new Set(['👍', '❤️', '😊', '😂', '🙏', '🎉', '✅', '❓']);

app.get('/api/calendar-events', (req, res) => {
  res.json(db.prepare(`
    SELECT id, title, event_date, hebrew_year, category, source_sheet
    FROM calendar_events
    ORDER BY event_date, category, title
  `).all());
});

app.post('/api/calendar-events/import', xlsxUpload.single('file'), async (req, res) => {
  if (!['admin', 'secretary'].includes(req.user.role)) {
    return res.status(403).json({ error: 'ייבוא נתונים ללוח השנה מיועד למנהלת או למזכירות' });
  }
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ אקסל' });
  if (path.extname(req.file.originalname).toLowerCase() !== '.xlsx') {
    return res.status(400).json({ error: 'יש לבחור קובץ Excel מסוג xlsx' });
  }

  let parsed;
  try {
    parsed = await parseCalendarWorkbook(req.file.buffer);
  } catch (error) {
    console.error('Calendar workbook parsing failed:', error);
    return res.status(400).json({ error: 'לא ניתן לקרוא את קובץ האקסל. בדקי שהוא תקין ונסי שוב.' });
  }

  if (!parsed.events.length) {
    return res.status(400).json({
      error: 'לא נמצאו אירועים בלוחות השנה בקובץ',
      warnings: parsed.warnings
    });
  }

  const importEvents = db.transaction(events => {
    const insert = db.prepare(`
      INSERT INTO calendar_events (title, event_date, hebrew_year, category, source_sheet, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (event_date, title, category, source_sheet) DO UPDATE SET
        hebrew_year = excluded.hebrew_year
    `);
    const importedAt = new Date().toISOString();
    for (const event of events) {
      insert.run(event.title, event.event_date, event.hebrew_year, event.category, event.source_sheet, importedAt);
    }
  });

  try {
    importEvents(parsed.events);
  } catch (error) {
    console.error('Calendar workbook import failed:', error);
    return res.status(500).json({ error: 'לא ניתן לשמור את אירועי הקובץ בלוח השנה' });
  }

  res.json({
    imported: parsed.events.length,
    sheets: parsed.sheetCount,
    warnings: parsed.warnings
  });
});

app.get('/api/messages/users', (req, res) => {
  res.json(db.prepare(`
    SELECT id, name, role FROM users
    WHERE active = 1 AND id != ?
    ORDER BY name
  `).all(req.user.id));
});

app.get('/api/messages/unread-count', (req, res) => {
  const { count } = db.prepare(`
    SELECT COUNT(*) AS count FROM messages
    WHERE recipient_id = ? AND read_at IS NULL
  `).get(req.user.id);
  res.json({ count });
});

app.get('/api/messages', (req, res) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE messages SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL')
    .run(now, req.user.id);
  const messages = db.prepare(`
    SELECT m.id, m.sender_id, m.recipient_id, sender.name AS sender_name,
      recipient.name AS recipient_name, m.body, m.created_at, m.read_at
    FROM messages m
    JOIN users sender ON sender.id = m.sender_id
    JOIN users recipient ON recipient.id = m.recipient_id
    WHERE m.sender_id = ? OR m.recipient_id = ?
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 300
  `).all(req.user.id, req.user.id);
  const getReactions = db.prepare(`
    SELECT r.message_id, r.user_id, r.emoji, u.name AS user_name
    FROM message_reactions r JOIN users u ON u.id = r.user_id
    WHERE r.message_id = ?
    ORDER BY r.created_at
  `);
  res.json(messages.map(message => ({ ...message, reactions: getReactions.all(message.id) })));
});

app.post('/api/messages', (req, res) => {
  const recipientId = Number(req.body?.recipient_id);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(recipientId) || recipientId === req.user.id || !body || body.length > 4000) {
    return res.status(400).json({ error: 'יש לבחור משתמשת ולכתוב הודעה עד 4000 תווים' });
  }
  if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').get(recipientId)) {
    return res.status(400).json({ error: 'המשתמשת שנבחרה אינה פעילה במערכת' });
  }
  const result = db.prepare(`
    INSERT INTO messages (sender_id, recipient_id, body, created_at)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, recipientId, body, new Date().toISOString());
  res.status(201).json({ id: result.lastInsertRowid });
});

app.post('/api/messages/:id/reactions', (req, res) => {
  const messageId = Number(req.params.id);
  const emoji = req.body?.emoji;
  const message = db.prepare(`
    SELECT id FROM messages WHERE id = ? AND (sender_id = ? OR recipient_id = ?)
  `).get(messageId, req.user.id, req.user.id);
  if (!message) return res.status(404).json({ error: 'ההודעה לא נמצאה' });
  if (!allowedMessageReactions.has(emoji)) {
    return res.status(400).json({ error: 'תגובת האימוג׳י אינה נתמכת' });
  }
  const existing = db.prepare(`
    SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?
  `).get(messageId, req.user.id, emoji);
  if (existing) {
    db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .run(messageId, req.user.id, emoji);
    return res.json({ added: false });
  }
  db.prepare(`
    INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
    VALUES (?, ?, ?, ?)
  `).run(messageId, req.user.id, emoji, new Date().toISOString());
  res.json({ added: true });
});

app.get('/api/tasks', (req, res) => {
  const { from, to } = req.query;
  const validDate = value => typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if ((from !== undefined && !validDate(from)) || (to !== undefined && !validDate(to))) {
    return res.status(400).json({ error: 'טווח התאריכים אינו תקין' });
  }
  const fromDate = from || null;
  const toDate = to || null;
  const tasks = db.prepare(`
    SELECT id, user_id, source_message_id, title, due_date,
      completed_at IS NOT NULL AS completed, completed_at, created_at
    FROM personal_tasks
    WHERE user_id = ? AND (? IS NULL OR due_date >= ?) AND (? IS NULL OR due_date <= ?)
    ORDER BY due_date, completed_at IS NOT NULL, id DESC
  `).all(req.user.id, fromDate, fromDate, toDate, toDate);
  res.json(tasks.map(task => ({ ...task, completed: Boolean(task.completed) })));
});

app.post('/api/messages/:id/tasks', (req, res) => {
  const messageId = Number(req.params.id);
  const dueDate = req.body?.due_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || '') ||
    Number.isNaN(Date.parse(`${dueDate}T12:00:00Z`)) ||
    new Date(`${dueDate}T12:00:00Z`).toISOString().slice(0, 10) !== dueDate) {
    return res.status(400).json({ error: 'יש לבחור תאריך יעד תקין' });
  }
  const message = db.prepare(`
    SELECT id, body FROM messages
    WHERE id = ? AND (sender_id = ? OR recipient_id = ?)
  `).get(messageId, req.user.id, req.user.id);
  if (!message) return res.status(404).json({ error: 'ההודעה לא נמצאה' });
  const title = message.body.trim() || 'משימה מהודעה';
  const result = db.prepare(`
    INSERT INTO personal_tasks (user_id, source_message_id, title, due_date, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, source_message_id) DO UPDATE SET due_date = excluded.due_date
  `).run(req.user.id, messageId, title, dueDate, new Date().toISOString());
  const task = db.prepare(`
    SELECT id, user_id, source_message_id, title, due_date,
      completed_at IS NOT NULL AS completed, completed_at, created_at
    FROM personal_tasks WHERE user_id = ? AND source_message_id = ?
  `).get(req.user.id, messageId);
  res.status(result.changes ? 201 : 200).json({ ...task, completed: Boolean(task.completed) });
});

app.patch('/api/tasks/:id/completion', (req, res) => {
  if (typeof req.body?.completed !== 'boolean') {
    return res.status(400).json({ error: 'מצב ביצוע המשימה אינו תקין' });
  }
  const task = db.prepare('SELECT id FROM personal_tasks WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!task) return res.status(404).json({ error: 'המשימה לא נמצאה' });
  db.prepare('UPDATE personal_tasks SET completed_at = ? WHERE id = ? AND user_id = ?')
    .run(req.body.completed ? new Date().toISOString() : null, task.id, req.user.id);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json(req.user);
});

app.get('/api/users', (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY name').all());
});

app.post('/api/users', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  const role = req.body?.role;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'נא להזין שם ואימייל תקין' });
  }
  if (!['admin', 'laborant', 'secretary'].includes(role)) {
    return res.status(400).json({ error: 'תפקיד לא תקין' });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: 'הסיסמה חייבת להכיל 12 עד 128 תווים' });
  }
  const { salt, hash } = hashPassword(password);
  try {
    const result = db.prepare(`
      INSERT INTO users (name, email, password_salt, password_hash, role, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(name, email, salt, hash, role, new Date().toISOString());
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'כבר קיים חשבון עם האימייל הזה' });
    }
    throw error;
  }
});

app.put('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id, role, active FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'המשתמשת לא נמצאה' });

  const role = req.body?.role;
  const active = req.body?.active;
  if (!['admin', 'laborant', 'secretary'].includes(role) || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'נתוני החשבון אינם תקינים' });
  }
  if (id === req.user.id && (!active || role !== 'admin')) {
    return res.status(400).json({ error: 'לא ניתן לשנות או להשבית את חשבון המנהלת המחוברת' });
  }

  if (user.role === 'admin' && user.active && (!active || role !== 'admin')) {
    const activeAdmins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
    if (activeAdmins <= 1) return res.status(400).json({ error: 'חייבת להישאר לפחות מנהלת מערכת פעילה אחת' });
  }

  db.prepare('UPDATE users SET role = ?, active = ? WHERE id = ?').run(role, Number(active), id);
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ success: true });
});

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
    year TEXT,
    birth_date TEXT,
    address TEXT
  );
`);

const studentCols = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
if (!studentCols.includes('birth_date')) db.exec('ALTER TABLE students ADD COLUMN birth_date TEXT');
if (!studentCols.includes('address')) db.exec('ALTER TABLE students ADD COLUMN address TEXT');

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

app.put('/api/students/:id_number', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'שם התלמידה הוא שדה חובה' });
  const result = db.prepare(`
    UPDATE students SET name = ?, phone = ?, track = ?, year = ?
    WHERE id_number = ?
  `).run(name, req.body.phone || null, req.body.track || null, req.body.year || null, req.params.id_number);
  if (!result.changes) return res.status(404).json({ error: 'לא נמצאה תלמידה עם מספר זהות זה' });
  res.json({ success: true });
});

app.get('/api/students/:id_number/details', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'לא נמצא' });
  res.json(student);
});

app.post('/api/students/import', xlsxUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    let allRows = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (rows.length > 0) console.log(`Sheet "${sheetName}" columns:`, Object.keys(rows[0]));
      allRows = allRows.concat(rows);
    }
    const rows = allRows;
    const normalizeHeader = (value) => String(value || '')
      .replace(/[\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase();
    const compactHeader = (value) => normalizeHeader(value).replace(/[^\p{L}\p{N}]/gu, '');

    const insert = db.prepare(`
      INSERT INTO students (id_number, name, phone, track, year, birth_date, address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id_number) DO UPDATE SET
        name=excluded.name,
        phone=excluded.phone,
        track=excluded.track,
        year=excluded.year,
        birth_date=COALESCE(excluded.birth_date, students.birth_date),
        address=COALESCE(excluded.address, students.address)
    `);

    let imported = 0, skipped = 0, withBirthDate = 0, withAddress = 0;
    const importMany = db.transaction((rows) => {
      for (const row of rows) {
        const getValue = (...headers) => {
          for (const header of headers) {
            const normalized = normalizeHeader(header);
            const compact = compactHeader(header);
            const key = Object.keys(row).find((column) =>
              normalizeHeader(column) === normalized || compactHeader(column) === compact
            );
            if (key !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
              return row[key];
            }
          }
          return '';
        };
        const id_number = String(getValue("מס' זהות", 'ת. זהות', 'ת.ז', 'ת.ז.', 'תז', 'id_number', 'ID')).trim();
        const firstName = String(getValue('שם פרטי')).trim();
        const lastName = String(getValue('משפחה')).trim();
        const name = [lastName, firstName].filter(Boolean).join(' ') || String(getValue('שם', 'שם מלא', 'name')).trim();
        const phone = String(getValue('נייד אישי', 'טלפון', 'phone')).trim();
        const track = String(getValue('התמחות', 'מסלול', 'התמחות 1', 'מגמה', 'track')).trim();
        const year = String(getValue('כיתה', 'שנה', 'year')).trim();
        const birthDateValue = getValue(
          'ת. לידה לועזי',
          'תאריך לידה',
          'birth_date',
          'date_of_birth',
          'ת. לידה עברי'
        ) || Object.keys(row)
          .filter((header) => compactHeader(header).includes('לידה'))
          .sort((a, b) => Number(compactHeader(b).includes('לועזי')) - Number(compactHeader(a).includes('לועזי')))
          .map((header) => row[header])
          .find((value) => value !== null && String(value).trim() !== '') || '';
        const parsedBirthDate = typeof birthDateValue === 'number'
          ? XLSX.SSF.parse_date_code(birthDateValue, {
            date1904: Boolean(wb.Workbook?.WBProps?.date1904)
          })
          : null;
        const birth_date = birthDateValue instanceof Date && !Number.isNaN(birthDateValue.getTime())
          ? `${String(birthDateValue.getDate()).padStart(2, '0')}/${String(birthDateValue.getMonth() + 1).padStart(2, '0')}/${birthDateValue.getFullYear()}`
          : parsedBirthDate
            ? `${String(parsedBirthDate.d).padStart(2, '0')}/${String(parsedBirthDate.m).padStart(2, '0')}/${parsedBirthDate.y}`
            : String(birthDateValue || '').trim();
        const address = [
          getValue('כתובת', 'כתובת מגורים', 'address'),
          getValue('מספר בית', 'מספר'),
          getValue('עיר', 'יישוב')
        ].map(value => String(value || '').trim()).filter(Boolean).join(' ');
        if (!id_number || !name) { skipped++; continue; }
        insert.run(id_number, name, phone, track, year, birth_date || null, address || null);
        imported++;
        if (birth_date) withBirthDate++;
        if (address) withAddress++;
      }
    });
    importMany(rows);
    res.json({ imported, skipped, withBirthDate, withAddress, total: rows.length });
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
    'לכל המעוניין,\n\nהרני לאשר בי התלמידה: {{שם}} מס\' ת.ז: {{תז}}\nלומדת כתלמידה מן המנין במוסדנו\nבין השנים: {{שנה}}\nבמגמת: {{מסלול}}\nבס"ך כולל של 2100 שעות\ל"הנ זכאית לדיפלמה מטעם מה"ט לאחר שתגיש פרויקט גמר.\n\nבברכה,\nההנהלה',
    'principal');
  db.prepare('INSERT INTO approval_types (name, template, signature, type) VALUES (?, ?, ?, ?)').run(
    'אישור 12 שנות לימוד',
    'לכל המעוניין,\n\nהתלמידה-{{שם}}\nמס\' זהות-{{תז}}\nסיימה במוסדנו, סמינר גור ירושלים\nאת 12 שנות תיכון בשנת {{שנה}},\nסמל מוסד 142075.\n\nבברכה,\nהמנהלת-גב\' דינה כהן',
    'principal', 'regular');
}

db.prepare(`
  UPDATE approval_types
  SET template = REPLACE(template, 'תשפ"ו', '{{שנה}}')
  WHERE name = 'אישור 12 שנות לימוד'
    AND template LIKE '%תשפ"ו%'
`).run();

app.get('/api/approval-types', (req, res) => {
  res.json(db.prepare('SELECT * FROM approval_types ORDER BY id').all());
});

app.post('/api/approval-types', (req, res) => {
  const { name, template, signature, type } = req.body;
  if (!name || !template) return res.status(400).json({ error: 'שם ותבנית חובה' });
  const approvalType = type === 'single' ? 'single' : 'regular';
  const selectedSignature = signature || 'principal';
  const result = db.prepare('INSERT INTO approval_types (name, template, signature, type) VALUES (?, ?, ?, ?)')
    .run(name, template, selectedSignature, approvalType);
  res.json({ id: result.lastInsertRowid, name, template, signature: selectedSignature, type: approvalType });
});

app.put('/api/approval-types/:id', (req, res) => {
  const { name, template, signature, type } = req.body;
  if (!name || !template) return res.status(400).json({ error: 'שם ותבנית חובה' });
  const result = db.prepare('UPDATE approval_types SET name=?, template=?, signature=?, type=? WHERE id=?')
    .run(name, template, signature || 'principal', type === 'single' ? 'single' : 'regular', req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'סוג האישור לא נמצא' });
  res.json({ success: true });
});

app.delete('/api/approval-types/:id', (req, res) => {
  db.prepare('DELETE FROM approval_types WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Backend running on port ${port}`));
