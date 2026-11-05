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
const { parseStudentWorkbook, normalizeIdNumber } = require('./student-import');
const { buildTrackReport, buildClassReport, splitTrackValues, studentHasTrack, resolveStudentTrackIds, buildClassName } = require('./database-report');
const { getWeekStart, collectTeacherUpcomingLessons } = require('./teacher-profile');
const { copyScheduleWeekIfEmpty } = require('./schedule-week-copy');
const { copyScheduleAcrossYear } = require('./schedule-year-copy');
const { findClassTimeConflict, findTeacherTimeConflicts } = require('./schedule-conflicts');
const { collectFutureScheduleOccurrences, scheduleOccurrenceWeeks } = require('./schedule-series');
const { validateScheduleChange, occurrenceChangeMetadata } = require('./schedule-change');
const { validateCalendarEventSettings, calendarEventAffectsLesson } = require('./calendar-event-schedule');
const { INSTRUCTION_WINDOWS, KODESH_CUTOFFS, validateKodeshSlot } = require('./schedule-availability');
const {
  PERMISSION_ACTIONS,
  PERMISSION_CATALOG,
  getApiPermission,
  permissionMapFromRows,
  initializePermissionSchema
} = require('./permissions');

const dataDir = process.env.STUDIO_DATA_DIR || __dirname;
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

// Student documents are private: stored outside /uploads and served only through an authenticated route
const requirementFilesDir = process.env.STUDIO_DATA_DIR
  ? path.join(dataDir, 'requirement-files')
  : path.join(__dirname, 'requirement-files');
fs.mkdirSync(requirementFilesDir, { recursive: true });
const FILE_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const requirementUpload = multer({
  storage: multer.diskStorage({
    destination: requirementFilesDir,
    filename: (req, file, cb) => cb(null, `${randomBytes(16).toString('hex')}${FILE_TYPES[file.mimetype] || ''}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(FILE_TYPES[file.mimetype]))
});

const xlsxUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const app = express();
const db = new Database(path.join(dataDir, 'studio.db'));
initializeAuthSchema(db);
initializePermissionSchema(db);
db.exec(`
  CREATE TABLE IF NOT EXISTS uploaded_file_permissions (
    filename TEXT PRIMARY KEY,
    permission_key TEXT NOT NULL
  );
`);
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (useHttps) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

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
const certDirForCheck = process.env.STUDIO_CERT_DIR || path.join(__dirname, 'certs');
const useHttps = fs.existsSync(path.join(certDirForCheck, 'key.pem')) && fs.existsSync(path.join(certDirForCheck, 'cert.pem'));

function appendSessionCookie(res, value, maxAge) {
  const secure = useHttps || process.env.NODE_ENV === 'production' ? '; Secure' : '';
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
    'http://localhost:4201',
    'http://localhost:4202',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:4201'
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

function getUserPermissions(role) {
  const rows = db.prepare(
    'SELECT permission_key, action, enabled FROM role_permissions WHERE role_key = ?'
  ).all(role);
  return permissionMapFromRows(rows, role);
}

function getItemFeature(itemType) {
  return ({ student: 'students', equipment: 'equipment' })[itemType] || null;
}

function registerUploadedFile(file, feature) {
  db.prepare('INSERT OR REPLACE INTO uploaded_file_permissions (filename, permission_key) VALUES (?, ?)')
    .run(file.filename, feature);
}

function getRoleName(role) {
  return db.prepare('SELECT name FROM system_roles WHERE role_key = ?').get(role)?.name || role;
}

function authorizeApi(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'מקור הבקשה אינו מורשה' });
  }
  if (/^\/(?:users|roles|permissions)(?:\/|$)/.test(req.path) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'פעולה זו מיועדת למנהלת מערכת בלבד' });
  }
  next();
}

function authorizePermission(req, res, next) {
  if (req.user.role === 'admin' || ['HEAD', 'OPTIONS'].includes(req.method) || req.path === '/auth/me' || req.path === '/stats') return next();
  const required = getApiPermission(req.path, req.method);
  if (!required) return res.status(403).json({ error: 'לא הוגדרה הרשאה לפעולה זו' });
  const permissions = getUserPermissions(req.user.role);
  if (!permissions[required.feature]?.[required.action]) {
    return res.status(403).json({ error: 'אין לך הרשאה לבצע פעולה זו' });
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
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, role_name: getRoleName(user.role), permissions: getUserPermissions(user.role) });
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

app.use('/api', authenticate, authorizeApi, authorizePermission);
app.use('/uploads', authenticate, (req, res, next) => {
  const filename = path.basename(req.path);
  const fileUrl = `/uploads/${filename}`;
  const registered = db.prepare('SELECT permission_key FROM uploaded_file_permissions WHERE filename = ?').get(filename);
  const feature = registered?.permission_key
    || (db.prepare('SELECT 1 FROM equipment WHERE image_url = ?').get(fileUrl) ? 'equipment' : null);
  if (!feature) return res.sendStatus(404);
  if (!getUserPermissions(req.user.role)[feature]?.view) {
    return res.status(403).json({ error: 'אין לך הרשאת צפייה בקובץ זה' });
  }
  next();
}, express.static(uploadsDir));

app.get('/api/permissions', (req, res) => {
  const roles = db.prepare('SELECT role_key, name, is_system FROM system_roles ORDER BY is_system DESC, name COLLATE NOCASE').all();
  const permissions = db.prepare('SELECT role_key, permission_key, action, enabled FROM role_permissions').all();
  res.json({
    actions: PERMISSION_ACTIONS,
    catalog: PERMISSION_CATALOG,
    roles: roles.map(role => ({
      ...role,
      permissions: permissionMapFromRows(permissions.filter(item => item.role_key === role.role_key), role.role_key)
    }))
  });
});

app.post('/api/roles', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 60) return res.status(400).json({ error: 'שם התפקיד חייב להכיל 1 עד 60 תווים' });
  try {
    const roleKey = `custom_${randomBytes(8).toString('hex')}`;
    const insertRole = db.prepare('INSERT INTO system_roles (role_key, name, is_system) VALUES (?, ?, 0)');
    const insert = db.prepare(
      'INSERT INTO role_permissions (role_key, permission_key, action, enabled) VALUES (?, ?, ?, 1)'
    );
    const createRole = db.transaction(() => {
      insertRole.run(roleKey, name);
      for (const { key } of PERMISSION_CATALOG) {
        for (const action of PERMISSION_ACTIONS) insert.run(roleKey, key, action);
      }
    });
    createRole();
    res.status(201).json({ role_key: roleKey, name, is_system: 0, permissions: getUserPermissions(roleKey) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'כבר קיים תפקיד בשם זה' });
    throw error;
  }
});

app.put('/api/roles/:roleKey/permissions', (req, res) => {
  const role = db.prepare('SELECT role_key, is_system FROM system_roles WHERE role_key = ?').get(req.params.roleKey);
  if (!role) return res.status(404).json({ error: 'התפקיד לא נמצא' });
  if (role.role_key === 'admin') return res.status(400).json({ error: 'הרשאות מנהלת המערכת קבועות ומלאות' });
  const permissions = req.body?.permissions;
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return res.status(400).json({ error: 'מבנה ההרשאות אינו תקין' });
  }
  for (const { key } of PERMISSION_CATALOG) {
    for (const action of PERMISSION_ACTIONS) {
      if (typeof permissions[key]?.[action] !== 'boolean') {
        return res.status(400).json({ error: `חסרה הרשאה תקינה עבור ${key}.${action}` });
      }
    }
  }
  const update = db.prepare(
    'UPDATE role_permissions SET enabled = ? WHERE role_key = ? AND permission_key = ? AND action = ?'
  );
  const save = db.transaction(() => {
    for (const { key } of PERMISSION_CATALOG) {
      for (const action of PERMISSION_ACTIONS) {
        update.run(permissions[key][action] ? 1 : 0, role.role_key, key, action);
      }
    }
  });
  save();
  res.json({ success: true, permissions: getUserPermissions(role.role_key) });
});

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
  CREATE TABLE IF NOT EXISTS user_favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('student', 'equipment')),
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, item_type, item_id)
  );
  CREATE TABLE IF NOT EXISTS staff_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('student', 'equipment')),
    item_id TEXT NOT NULL,
    body TEXT NOT NULL CHECK (length(body) <= 2000),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS staff_notes_item_idx ON staff_notes(item_type, item_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log(created_at DESC);
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
  CREATE TABLE IF NOT EXISTS page_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS personal_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL REFERENCES page_topics(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS personal_pages_topic_idx ON personal_pages(topic_id);
  CREATE TABLE IF NOT EXISTS page_access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES personal_pages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT,
    seen_at TEXT,
    granted_seen_at TEXT,
    UNIQUE (page_id, user_id)
  );
`);

// הוספת seen_at לטבלאות קיימות (CREATE IF NOT EXISTS לא מוסיף עמודות)
const requestCols = db.prepare('PRAGMA table_info(page_access_requests)').all().map((c) => c.name);
if (!requestCols.includes('seen_at')) db.exec('ALTER TABLE page_access_requests ADD COLUMN seen_at TEXT');
if (!requestCols.includes('granted_seen_at')) db.exec('ALTER TABLE page_access_requests ADD COLUMN granted_seen_at TEXT');

// Migration: calendar_events — הוספת עמודת notes
const calEventCols = db.prepare('PRAGMA table_info(calendar_events)').all().map(c => c.name);
if (!calEventCols.includes('notes')) db.exec("ALTER TABLE calendar_events ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
if (!calEventCols.includes('all_day')) db.exec('ALTER TABLE calendar_events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0');
if (!calEventCols.includes('start_time')) db.exec('ALTER TABLE calendar_events ADD COLUMN start_time TEXT');
if (!calEventCols.includes('end_time')) db.exec('ALTER TABLE calendar_events ADD COLUMN end_time TEXT');
if (!calEventCols.includes('class_scope')) db.exec("ALTER TABLE calendar_events ADD COLUMN class_scope TEXT NOT NULL DEFAULT 'none'");
if (!calEventCols.includes('class_year')) db.exec('ALTER TABLE calendar_events ADD COLUMN class_year TEXT');
if (!calEventCols.includes('class_parallel')) db.exec('ALTER TABLE calendar_events ADD COLUMN class_parallel TEXT');

// תיק סרוק — מסמכים של תלמידה
db.exec(`
  CREATE TABLE IF NOT EXISTS student_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number TEXT NOT NULL REFERENCES students(id_number) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url  TEXT NOT NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS student_documents_student_idx ON student_documents(id_number);
`);

// לוח מודעות לתלמידה
db.exec(`
  CREATE TABLE IF NOT EXISTS student_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number TEXT NOT NULL REFERENCES students(id_number) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    notice_date TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'staff' CHECK (visibility IN ('staff','student','all')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS student_notices_student_idx ON student_notices(id_number);
`);

// Migration: personal_tasks — הוספת עמודת visibility וביטול חובת source_message_id
const taskCols = db.prepare('PRAGMA table_info(personal_tasks)').all().map((c) => c.name);
if (!taskCols.includes('visibility')) db.exec("ALTER TABLE personal_tasks ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");

// Migration: student photo
// Migration: source_message_id — הפיכה ל-nullable (לאפשר משימות ישירות ללא הודעה)
// SQLite לא תומך ב-ALTER COLUMN, לכן נבצע recreate אם source_message_id עדיין NOT NULL
const srcCol = db.prepare('PRAGMA table_info(personal_tasks)').all().find(c => c.name === 'source_message_id');
if (srcCol && srcCol.notnull === 1) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    CREATE TABLE IF NOT EXISTS personal_tasks_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private'
    );
    INSERT INTO personal_tasks_new (id, user_id, source_message_id, title, due_date, completed_at, created_at, visibility)
      SELECT id, user_id, source_message_id, title, due_date, completed_at, created_at,
        COALESCE(visibility, 'private')
      FROM personal_tasks;
    DROP TABLE personal_tasks;
    ALTER TABLE personal_tasks_new RENAME TO personal_tasks;
    CREATE INDEX IF NOT EXISTS personal_tasks_user_due_idx ON personal_tasks(user_id, due_date);
    PRAGMA foreign_keys=ON;
  `);
}

// ── דפים אישיים (נושאים / דפים / הרשאות) ──────────────────
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS personal_tasks_user_source_message_unique_idx
  ON personal_tasks(user_id, source_message_id)
`);

// Task shares — allows sharing a personal task with specific users
db.exec(`
  CREATE TABLE IF NOT EXISTS task_shares (
    task_id INTEGER NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
  );
`);

function pageRow(row, userId) {
  if (!row) return row;
  return { ...row, is_owner: row.created_by === userId };
}

// מגדיר את הבקשות שהיוצר/ת כבר ראה/תה (לא חדשות יותר)
function markRequestsSeen(userId, topicId) {
  if (topicId) {
    db.prepare(`
      UPDATE page_access_requests SET seen_at = datetime('now')
      WHERE status = 'pending' AND seen_at IS NULL
        AND page_id IN (SELECT id FROM personal_pages WHERE created_by = ? AND topic_id = ?)
    `).run(userId, topicId);
  } else {
    db.prepare(`
      UPDATE page_access_requests SET seen_at = datetime('now')
      WHERE status = 'pending' AND seen_at IS NULL
        AND page_id IN (SELECT id FROM personal_pages WHERE created_by = ?)
    `).run(userId);
  }
}

app.get('/api/pages/topics', (req, res) => {
  const topics = db.prepare(`
    SELECT t.id, t.name, t.created_by,
      (SELECT COUNT(*) FROM personal_pages p WHERE p.topic_id = t.id AND (p.visibility = 'public' OR p.created_by = ? OR EXISTS (
        SELECT 1 FROM page_access_requests r WHERE r.page_id = p.id AND r.user_id = ? AND r.status = 'approved'))) AS page_count,
      (SELECT COUNT(*) FROM page_access_requests r JOIN personal_pages p ON p.id = r.page_id
        WHERE p.topic_id = t.id AND p.created_by = ? AND r.status = 'pending' AND r.seen_at IS NULL) AS pending_requests,
      (SELECT COUNT(*) FROM page_access_requests r JOIN personal_pages p ON p.id = r.page_id
        WHERE p.topic_id = t.id AND r.user_id = ? AND r.status = 'approved' AND r.granted_seen_at IS NULL) AS granted_requests
    FROM page_topics t ORDER BY t.name
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(topics);
});

app.post('/api/pages/topics', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'נא להזין שם נושא' });
  const existing = db.prepare('SELECT id FROM page_topics WHERE name = ?').get(name);
  if (existing) return res.json(existing);
  const result = db.prepare('INSERT INTO page_topics (name, created_by) VALUES (?, ?)').run(name, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid, name });
});

app.delete('/api/pages/topics/:id', (req, res) => {
  const topic = db.prepare('SELECT id, created_by FROM page_topics WHERE id = ?').get(Number(req.params.id));
  if (!topic) return res.status(404).json({ error: 'נושא לא נמצא' });
  if (topic.created_by !== req.user.id) return res.status(403).json({ error: 'רק היוצר/ת יכול/ה למחוק את הנושא' });
  const count = db.prepare('SELECT COUNT(*) AS c FROM personal_pages WHERE topic_id = ?').get(topic.id).c;
  if (count > 0 && !req.query.force) {
    return res.status(409).json({ error: `קיימים ${count} דפים בנושא. הוסיפי ?force=1 למחיקה מלאה.` });
  }
  db.prepare('DELETE FROM page_topics WHERE id = ?').run(topic.id);
  res.json({ success: true, deleted_pages: count });
});

app.get('/api/pages/topics/:id/pages', (req, res) => {
  const topicId = Number(req.params.id);
  markRequestsSeen(req.user.id, topicId);
  // מסמן שהמבקש/ת ראה/תה את האישורים בנושא הזה
  db.prepare(`
    UPDATE page_access_requests SET granted_seen_at = datetime('now')
    WHERE user_id = ? AND status = 'approved' AND granted_seen_at IS NULL
      AND page_id IN (SELECT id FROM personal_pages WHERE topic_id = ?)
  `).run(req.user.id, topicId);
  const rows = db.prepare(`
    SELECT p.*, u.name AS creator_name,
      (CASE WHEN p.created_by = ? THEN 1 ELSE 0 END) AS can_edit,
      (CASE WHEN p.visibility = 'public' OR p.created_by = ? OR EXISTS (
        SELECT 1 FROM page_access_requests r WHERE r.page_id = p.id AND r.user_id = ? AND r.status = 'approved')
        THEN 1 ELSE 0 END) AS can_view,
      (SELECT COUNT(*) FROM page_access_requests r WHERE r.page_id = p.id AND r.status = 'pending') AS pending_requests,
      (SELECT r.status FROM page_access_requests r WHERE r.page_id = p.id AND r.user_id = ?) AS my_request_status
    FROM personal_pages p JOIN users u ON u.id = p.created_by
    WHERE p.topic_id = ?
    ORDER BY p.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, topicId);
  res.json(rows);
});

app.post('/api/pages/topics/:id/pages', (req, res) => {
  const topicId = Number(req.params.id);
  const topic = db.prepare('SELECT id FROM page_topics WHERE id = ?').get(topicId);
  if (!topic) return res.status(404).json({ error: 'נושא לא נמצא' });
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '');
  const visibility = req.body?.visibility === 'public' ? 'public' : 'private';
  if (!title || !body.trim()) return res.status(400).json({ error: 'נא למלא כותרת ותוכן' });
  const result = db.prepare(`
    INSERT INTO personal_pages (topic_id, title, body, visibility, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(topicId, title, body, visibility, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get('/api/pages/:id', (req, res) => {
  const page = db.prepare(`
    SELECT p.*, u.name AS creator_name,
      (CASE WHEN p.created_by = ? THEN 1 ELSE 0 END) AS can_edit,
      (CASE WHEN p.visibility = 'public' OR p.created_by = ? OR EXISTS (
        SELECT 1 FROM page_access_requests r WHERE r.page_id = p.id AND r.user_id = ? AND r.status = 'approved')
        THEN 1 ELSE 0 END) AS can_view
    FROM personal_pages p JOIN users u ON u.id = p.created_by
    WHERE p.id = ?
  `).get(req.user.id, req.user.id, req.user.id, Number(req.params.id));
  if (!page) return res.status(404).json({ error: 'דף לא נמצא' });
  if (!page.can_view) return res.status(403).json({ error: 'אין לך הרשאת גישה לדף זה' });
  res.json(pageRow(page, req.user.id));
});

app.put('/api/pages/:id', (req, res) => {
  const page = db.prepare('SELECT * FROM personal_pages WHERE id = ?').get(Number(req.params.id));
  if (!page) return res.status(404).json({ error: 'דף לא נמצא' });
  if (page.created_by !== req.user.id) return res.status(403).json({ error: 'רק היוצר/ת יכול/ה לערוך את הדף' });
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '');
  const visibility = req.body?.visibility === 'public' ? 'public' : 'private';
  if (!title || !body.trim()) return res.status(400).json({ error: 'נא למלא כותרת ותוכן' });
  db.prepare(`
    UPDATE personal_pages SET title = ?, body = ?, visibility = ?, updated_at = datetime('now') WHERE id = ?
  `).run(title, body, visibility, page.id);
  res.json({ success: true });
});

app.delete('/api/pages/:id', (req, res) => {
  const page = db.prepare('SELECT * FROM personal_pages WHERE id = ?').get(Number(req.params.id));
  if (!page) return res.status(404).json({ error: 'דף לא נמצא' });
  if (page.created_by !== req.user.id) return res.status(403).json({ error: 'רק היוצר/ת יכול/ה למחוק את הדף' });
  db.prepare('DELETE FROM personal_pages WHERE id = ?').run(page.id);
  res.json({ success: true });
});

// הרשאות גישה לדפים פרטיים
app.post('/api/pages/:id/request-access', (req, res) => {
  const page = db.prepare('SELECT id, created_by FROM personal_pages WHERE id = ?').get(Number(req.params.id));
  if (!page) return res.status(404).json({ error: 'דף לא נמצא' });
  if (page.created_by === req.user.id) return res.status(400).json({ error: 'זה הדף שלך' });
  const existing = db.prepare('SELECT id, status FROM page_access_requests WHERE page_id = ? AND user_id = ?').get(page.id, req.user.id);
  if (existing) return res.json({ status: existing.status });
  db.prepare('INSERT INTO page_access_requests (page_id, user_id) VALUES (?, ?)').run(page.id, req.user.id);
  res.status(201).json({ status: 'pending' });
});

app.get('/api/pages/:id/requests', (req, res) => {
  const page = db.prepare('SELECT id, created_by FROM personal_pages WHERE id = ?').get(Number(req.params.id));
  if (!page) return res.status(404).json({ error: 'דף לא נמצא' });
  if (page.created_by !== req.user.id) return res.status(403).json({ error: 'רק היוצר/ת יכול/ה לצפות בבקשות' });
  const rows = db.prepare(`
    SELECT r.id, r.status, r.created_at, u.id AS user_id, u.name AS user_name
    FROM page_access_requests r JOIN users u ON u.id = r.user_id
    WHERE r.page_id = ? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
  `).all(page.id);
  res.json(rows);
});

app.put('/api/pages/requests/:id', (req, res) => {
  const request = db.prepare(`
    SELECT r.*, p.created_by AS page_owner FROM page_access_requests r
    JOIN personal_pages p ON p.id = r.page_id WHERE r.id = ?
  `).get(Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'בקשה לא נמצאה' });
  if (request.page_owner !== req.user.id) return res.status(403).json({ error: 'רק היוצר/ת יכול/ה לאשר בקשות' });
  const status = req.body?.status === 'approved' ? 'approved' : req.body?.status === 'denied' ? 'denied' : null;
  if (!status) return res.status(400).json({ error: 'ערך לא תקין' });
  db.prepare('UPDATE page_access_requests SET status = ?, decided_at = datetime(\'now\') WHERE id = ?').run(status, request.id);
  res.json({ success: true, status });
});

app.get('/api/pages/requests/incoming', (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.status, r.created_at, p.id AS page_id, p.title AS page_title, u.name AS user_name
    FROM page_access_requests r
    JOIN personal_pages p ON p.id = r.page_id
    JOIN users u ON u.id = r.user_id
    WHERE p.created_by = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

const allowedMessageReactions = new Set(['👍', '❤️', '😊', '😂', '🙏', '🎉', '✅', '❓']);

app.get('/api/calendar-events', (req, res) => {
  res.json(db.prepare(`
    SELECT id, title, event_date, hebrew_year, category, source_sheet, notes,
      all_day, start_time, end_time, class_scope, class_year, class_parallel
    FROM calendar_events
    ORDER BY event_date, category, title
  `).all());
});

// קבלת ארוע בודד לפי ID
app.get('/api/calendar-events/:id', (req, res) => {
  const event = db.prepare(
    `SELECT id, title, event_date, hebrew_year, category, source_sheet, notes,
      all_day, start_time, end_time, class_scope, class_year, class_parallel
     FROM calendar_events WHERE id = ?`
  ).get(Number(req.params.id));
  if (!event) return res.status(404).json({ error: 'הארוע לא נמצא' });
  res.json(event);
});

// עדכון ארוע
app.put('/api/calendar-events/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    if (!event) return res.status(404).json({ error: 'הארוע לא נמצא' });

    const notes = String(req.body?.notes ?? '');
    // כותרת, תאריך וקטגוריה ניתנים לעדכון רק לארועים ידניים
    if (event.source_sheet === 'ידני') {
      const title = String(req.body?.title || '').trim();
      const event_date = req.body?.event_date;
      const category = String(req.body?.category || 'כללי').trim();
      const isLegacyEvent = event.class_scope === 'none';
      const all_day = req.body?.all_day == null ? (isLegacyEvent ? 1 : event.all_day) : (req.body.all_day ? 1 : 0);
      const start_time = req.body?.start_time ?? event.start_time;
      const end_time = req.body?.end_time ?? event.end_time;
      const class_scope = req.body?.class_scope ?? (isLegacyEvent ? 'all' : event.class_scope);
      const class_year = req.body?.class_year ?? event.class_year;
      const class_parallel = req.body?.class_parallel ?? event.class_parallel;
      if (!title) return res.status(400).json({ error: 'כותרת האירוע חסרה' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date || ''))
        return res.status(400).json({ error: 'תאריך לא תקין' });
      const settingsError = validateCalendarEventSettings({ all_day, start_time, end_time, class_scope, class_year, class_parallel });
      if (settingsError) return res.status(400).json({ error: settingsError });
      let hebrewYear = 0;
      try {
        const { HDate } = await import('@hebcal/core');
        hebrewYear = new HDate(new Date(`${event_date}T12:00:00`)).getFullYear();
      } catch (_) {}
      db.prepare(`UPDATE calendar_events
        SET title=?, event_date=?, category=?, hebrew_year=?, notes=?, all_day=?, start_time=?, end_time=?,
          class_scope=?, class_year=?, class_parallel=? WHERE id=?`)
        .run(title, event_date, category, hebrewYear, notes, all_day, all_day ? null : start_time,
          all_day ? null : end_time, class_scope, class_year || null, class_scope === 'class' ? class_parallel : null, id);
    } else {
      // ארועים שיובאו — רק הערות ניתנות לעדכון
      db.prepare('UPDATE calendar_events SET notes=? WHERE id=?').run(notes, id);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('calendar-events PUT error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון האירוע: ' + (err.message || err) });
  }
});

// יצירת אירוע ידני מלוח השנה
app.post('/api/calendar-events', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const event_date = req.body?.event_date;
    const category = String(req.body?.category || 'כללי').trim();
    const source_sheet = String(req.body?.source_sheet || 'ידני').trim();
    const all_day = req.body?.all_day ? 1 : 0;
    const start_time = req.body?.start_time;
    const end_time = req.body?.end_time;
    const class_scope = req.body?.class_scope || 'none';
    const class_year = req.body?.class_year;
    const class_parallel = req.body?.class_parallel;
    if (!title) return res.status(400).json({ error: 'כותרת האירוע חסרה' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date || ''))
      return res.status(400).json({ error: 'תאריך לא תקין' });
    const settingsError = validateCalendarEventSettings({ all_day, start_time, end_time, class_scope, class_year, class_parallel });
    if (settingsError) return res.status(400).json({ error: settingsError });

    let hebrewYear = 0;
    try {
      const { HDate } = await import('@hebcal/core');
      hebrewYear = new HDate(new Date(`${event_date}T12:00:00`)).getFullYear();
    } catch (_) { /* fallback — hebrew year not critical */ }

    const existing = db.prepare(`
      SELECT id FROM calendar_events WHERE event_date = ? AND title = ? AND category = ? AND source_sheet = 'ידני'
    `).get(event_date, title, category);
    if (existing) return res.status(409).json({ error: 'אירוע עם אותה כותרת כבר קיים בתאריך זה' });

    const result = db.prepare(`
      INSERT INTO calendar_events
        (title, event_date, hebrew_year, category, source_sheet, created_at, all_day, start_time, end_time,
         class_scope, class_year, class_parallel)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
    `).run(title, event_date, hebrewYear, category, source_sheet, all_day, all_day ? null : start_time,
      all_day ? null : end_time, class_scope, class_year || null, class_scope === 'class' ? class_parallel : null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('calendar-events POST error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת האירוע: ' + (err.message || err) });
  }
});

// מחיקת אירוע ידני
app.delete('/api/calendar-events/:id', (req, res) => {
  db.prepare('DELETE FROM calendar_events WHERE id = ? AND source_sheet = ?')
    .run(Number(req.params.id), 'ידני');
  res.json({ success: true });
});

app.post('/api/calendar-events/import', xlsxUpload.single('file'), async (req, res) => {
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

function logActivity(userId, action, itemType, itemId, details = '') {
  db.prepare('INSERT INTO activity_log (user_id, action, item_type, item_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(userId || null, action, itemType, String(itemId), String(details).slice(0, 500));
}

app.get('/api/activity', (req, res) => {
  const permissions = getUserPermissions(req.user.role);
  const rows = db.prepare(`
    SELECT a.id, a.action, a.item_type, a.item_id, a.details, a.created_at, u.name AS user_name
    FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC, a.id DESC LIMIT 50
  `).all();
  const itemPermissions = {
    student: 'students',
    teacher: 'teachers',
    equipment: 'loans',
    loan: 'loans',
    exam: 'exams',
    schedule: 'schedule',
    calendar: 'calendar',
    page: 'pages',
    message: 'messages'
  };
  res.json(rows.filter(row => {
    const feature = itemPermissions[row.item_type];
    return feature && permissions[feature]?.view;
  }));
});

app.get('/api/favorites', (req, res) => {
  const permissions = getUserPermissions(req.user.role);
  const favorites = db.prepare('SELECT item_type, item_id, created_at FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id)
    .filter(item => permissions[getItemFeature(item.item_type)]?.view);
  res.json(favorites);
});

app.post('/api/favorites', (req, res) => {
  const itemType = req.body?.item_type;
  const itemId = String(req.body?.item_id ?? '').trim();
  if (!['student', 'equipment'].includes(itemType) || !itemId || itemId.length > 100) {
    return res.status(400).json({ error: 'פרטי המועדף אינם תקינים' });
  }
  if (!getUserPermissions(req.user.role)[getItemFeature(itemType)]?.view) {
    return res.status(403).json({ error: 'אין לך הרשאת צפייה בפריט זה' });
  }
  const exists = itemType === 'student'
    ? db.prepare('SELECT 1 FROM students WHERE id_number = ?').get(itemId)
    : db.prepare('SELECT 1 FROM equipment WHERE id = ?').get(Number(itemId));
  if (!exists) return res.status(404).json({ error: 'הפריט לא נמצא' });
  db.prepare('INSERT OR IGNORE INTO user_favorites (user_id, item_type, item_id) VALUES (?, ?, ?)')
    .run(req.user.id, itemType, itemId);
  res.status(201).json({ success: true });
});

app.delete('/api/favorites/:item_type/:item_id', (req, res) => {
  db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .run(req.user.id, req.params.item_type, req.params.item_id);
  res.json({ success: true });
});

app.get('/api/notes', (req, res) => {
  const itemType = String(req.query.item_type || '');
  const itemId = String(req.query.item_id || '').trim();
  if (!['student', 'equipment'].includes(itemType) || !itemId) return res.status(400).json({ error: 'יש לבחור פריט' });
  if (!getUserPermissions(req.user.role)[getItemFeature(itemType)]?.view) {
    return res.status(403).json({ error: 'אין לך הרשאת צפייה בפריט זה' });
  }
  res.json(db.prepare(`
    SELECT n.id, n.item_type, n.item_id, n.body, n.created_at, u.name AS author_name
    FROM staff_notes n JOIN users u ON u.id = n.user_id
    WHERE n.item_type = ? AND n.item_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 100
  `).all(itemType, itemId));
});

app.post('/api/notes', (req, res) => {
  const itemType = req.body?.item_type;
  const itemId = String(req.body?.item_id ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  if (!['student', 'equipment'].includes(itemType) || !itemId || itemId.length > 100 || !body || body.length > 2000) {
    return res.status(400).json({ error: 'הערה חייבת לכלול תוכן עד 2000 תווים ולהיות משויכת לפריט' });
  }
  if (!getUserPermissions(req.user.role)[getItemFeature(itemType)]?.view) {
    return res.status(403).json({ error: 'אין לך הרשאת צפייה בפריט זה' });
  }
  const exists = itemType === 'student'
    ? db.prepare('SELECT 1 FROM students WHERE id_number = ?').get(itemId)
    : db.prepare('SELECT 1 FROM equipment WHERE id = ?').get(Number(itemId));
  if (!exists) return res.status(404).json({ error: 'הפריט לא נמצא' });
  const result = db.prepare('INSERT INTO staff_notes (user_id, item_type, item_id, body) VALUES (?, ?, ?, ?)')
    .run(req.user.id, itemType, itemId, body);
  logActivity(req.user.id, 'הוסיפה הערת צוות', itemType, itemId, body.slice(0, 120));
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get('/api/reports/loans.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT l.id, e.name AS equipment, e.barcode, l.borrower_name, l.borrower_id_number,
      l.borrower_phone, l.loan_date, l.expected_return, l.actual_return, l.loan_type, l.payment_status
    FROM loans l JOIN equipment e ON e.id = l.equipment_id ORDER BY l.loan_date DESC
  `).all();
  const fields = ['id', 'equipment', 'barcode', 'borrower_name', 'borrower_id_number', 'borrower_phone', 'loan_date', 'expected_return', 'actual_return', 'loan_type', 'payment_status'];
  const csvCell = value => `"${String(value ?? '').replace(/"/g, '"')}"`;
  const csv = '\uFEFF' + [fields, ...rows.map(row => fields.map(key => row[key]))].map(row => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="loans-report.csv"');
  res.send(csv);
});

app.get('/api/messages/users', (req, res) => {
  res.json(db.prepare(`
    SELECT id, name, role FROM users
    WHERE active = 1 AND id != ?
    ORDER BY name
  `).all(req.user.id));
});

// ── Dashboard stats — endpoint ייעודי לדשבורד (קריאה אחת במקום 4) ──
app.get('/api/stats', (req, res) => {
  const permissions = getUserPermissions(req.user.role);
  const today = new Date().toISOString().split('T')[0];
  const stats = {};
  if (permissions.loans?.view) {
    stats.activeLoans = db.prepare(`
    SELECT COUNT(*) AS c FROM loans l
    JOIN equipment e ON e.id = l.equipment_id
    WHERE l.actual_return IS NULL AND l.loan_date <= ?
      AND NOT (e.category = 'מצלמות אישיות' OR (e.category = 'ציוד צילום' AND e.subcategory = 'מצלמות אישיות'))
    `).get(today).c;
    stats.overdueLoans = db.prepare(`
    SELECT COUNT(*) AS c FROM loans l
    JOIN equipment e ON e.id = l.equipment_id
    WHERE l.actual_return IS NULL AND l.loan_date <= ? AND l.expected_return < ?
      AND NOT (e.category = 'מצלמות אישיות' OR (e.category = 'ציוד צילום' AND e.subcategory = 'מצלמות אישיות'))
    `).get(today, today).c;
  }
  if (permissions.messages?.view) {
    stats.unreadMessages = db.prepare(
      'SELECT COUNT(*) AS c FROM messages WHERE recipient_id = ? AND read_at IS NULL'
    ).get(req.user.id).c;
  }
  if (permissions.students?.view) stats.totalStudents = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
  res.json(stats);
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
  // mark-as-read רק כשמועבר ?markRead=1 (מהפרונטאנד בעת פתיחת הדף בפועל)
  if (req.query.markRead === '1') {
    db.prepare('UPDATE messages SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL')
      .run(now, req.user.id);
  }
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

  // שאילתה אחת לכל ה-reactions במקום N+1
  if (!messages.length) return res.json([]);
  const ids = messages.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');
  const allReactions = db.prepare(`
    SELECT r.message_id, r.user_id, r.emoji, u.name AS user_name
    FROM message_reactions r JOIN users u ON u.id = r.user_id
    WHERE r.message_id IN (${placeholders})
    ORDER BY r.created_at
  `).all(...ids);

  // קיבוץ reactions לפי message_id
  const reactionsMap = new Map();
  for (const r of allReactions) {
    if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, []);
    reactionsMap.get(r.message_id).push(r);
  }

  res.json(messages.map(m => ({ ...m, reactions: reactionsMap.get(m.id) || [] })));
});

app.post('/api/messages', (req, res) => {
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 4000) {
    return res.status(400).json({ error: 'יש לכתוב הודעה עד 4000 תווים' });
  }
  let recipientIds = [];
  if (Array.isArray(req.body?.recipient_ids)) {
    recipientIds = req.body.recipient_ids.map(Number).filter(id => Number.isInteger(id) && id !== req.user.id);
  } else if (req.body?.recipient_id) {
    const single = Number(req.body.recipient_id);
    if (Number.isInteger(single) && single !== req.user.id) recipientIds = [single];
  }
  if (!recipientIds.length) return res.status(400).json({ error: 'יש לבחור לפחות נמענת אחת' });
  const activeIds = db.prepare(`SELECT id FROM users WHERE id IN (${recipientIds.map(() => '?').join(',')}) AND active = 1`)
    .all(...recipientIds).map(u => u.id);
  if (!activeIds.length) return res.status(400).json({ error: 'הנמענות שנבחרו אינן פעילות במערכת' });
  const now = new Date().toISOString();
  const insertMsg = db.prepare('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)');
  const ids = activeIds.map(rid => insertMsg.run(req.user.id, rid, body, now).lastInsertRowid);
  res.status(201).json({ id: ids[0], ids });
});

app.put('/api/messages/:id', (req, res) => {
  const messageId = Number(req.params.id);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 4000) return res.status(400).json({ error: 'תוכן ההודעה חסר או ארוך מ-4000 תווים' });
  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND sender_id = ?').get(messageId, req.user.id);
  if (!message) return res.status(404).json({ error: 'הודעה לא נמצאה' });
  if ((Date.now() - new Date(message.created_at).getTime()) / 60000 > 15)
    return res.status(403).json({ error: 'ניתן לערוך הודעה רק עד 15 דקות מהשליחה' });
  db.prepare('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?').run(body, new Date().toISOString(), messageId);
  res.json({ success: true });
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
    SELECT pt.id, pt.user_id, pt.source_message_id, pt.title, pt.due_date,
      pt.completed_at IS NOT NULL AS completed, pt.completed_at, pt.created_at,
      pt.visibility, u.name AS creator_name
    FROM personal_tasks pt
    JOIN users u ON u.id = pt.user_id
    WHERE (pt.user_id = ? OR pt.visibility = 'public'
      OR pt.id IN (SELECT task_id FROM task_shares WHERE user_id = ?))
      AND (? IS NULL OR pt.due_date >= ?) AND (? IS NULL OR pt.due_date <= ?)
    ORDER BY pt.due_date, pt.completed_at IS NOT NULL, pt.id DESC
  `).all(req.user.id, req.user.id, fromDate, fromDate, toDate, toDate);
  const enriched = tasks.map(task => {
    if (task.visibility === 'shared') {
      const sharedWith = db.prepare(`
        SELECT u.id, u.name FROM task_shares ts JOIN users u ON u.id = ts.user_id WHERE ts.task_id = ?
      `).all(task.id);
      return { ...task, shared_with: sharedWith, completed: Boolean(task.completed) };
    }
    return { ...task, completed: Boolean(task.completed) };
  });
  res.json(enriched);
});

// יצירת משימה ישירות (ללא הודעה) — לשימוש מלוח השנה
app.post('/api/tasks', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const dueDate = req.body?.due_date;
  const rawVisibility = String(req.body?.visibility || 'private');
  const visibility = ['private', 'public', 'shared'].includes(rawVisibility) ? rawVisibility : 'private';
  const sharedUserIds = Array.isArray(req.body?.shared_user_ids)
    ? [...new Set(req.body.shared_user_ids.map(Number).filter(n => Number.isFinite(n) && n > 0))]
    : [];
  if (!title || title.length > 200) return res.status(400).json({ error: 'כותרת המשימה חסרה או ארוכה מדי' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || '') ||
    Number.isNaN(Date.parse(`${dueDate}T12:00:00Z`)) ||
    new Date(`${dueDate}T12:00:00Z`).toISOString().slice(0, 10) !== dueDate) {
    return res.status(400).json({ error: 'יש לבחור תאריך יעד תקין' });
  }

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO personal_tasks (user_id, source_message_id, title, due_date, visibility, created_at)
      VALUES (?, NULL, ?, ?, ?, ?)
    `).run(req.user.id, title, dueDate, visibility, new Date().toISOString());

    const taskId = result.lastInsertRowid;
    const validShares = visibility === 'shared' && sharedUserIds.length
      ? sharedUserIds.filter(uid => db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').get(uid))
      : [];
    if (validShares.length) {
      const shareStmt = db.prepare('INSERT OR IGNORE INTO task_shares (task_id, user_id) VALUES (?, ?)');
      for (const uid of validShares) shareStmt.run(taskId, uid);
    }
    return taskId;
  });

  const taskId = tx();
  const task = db.prepare(`
    SELECT pt.id, pt.user_id, pt.source_message_id, pt.title, pt.due_date,
      pt.completed_at IS NOT NULL AS completed, pt.completed_at, pt.created_at,
      pt.visibility, u.name AS creator_name
    FROM personal_tasks pt JOIN users u ON u.id = pt.user_id
    WHERE pt.id = ?
  `).get(taskId);
  let sharedWith = [];
  if (task.visibility === 'shared') {
    sharedWith = db.prepare(`
      SELECT u.id, u.name FROM task_shares ts JOIN users u ON u.id = ts.user_id WHERE ts.task_id = ?
    `).all(taskId);
  }
  res.status(201).json({ ...task, shared_with: sharedWith, completed: Boolean(task.completed) });
});

// עדכון תאריך משימה (גרירה בלוח)
app.patch('/api/tasks/:id/due-date', (req, res) => {
  const dueDate = req.body?.due_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || '') ||
    Number.isNaN(Date.parse(`${dueDate}T12:00:00Z`)) ||
    new Date(`${dueDate}T12:00:00Z`).toISOString().slice(0, 10) !== dueDate) {
    return res.status(400).json({ error: 'תאריך לא תקין' });
  }
  const task = db.prepare('SELECT id FROM personal_tasks WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!task) return res.status(404).json({ error: 'המשימה לא נמצאה' });
  db.prepare('UPDATE personal_tasks SET due_date = ? WHERE id = ?').run(dueDate, task.id);
  res.json({ success: true });
});

// מחיקת משימה
app.delete('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT id FROM personal_tasks WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!task) return res.status(404).json({ error: 'המשימה לא נמצאה' });
  db.prepare('DELETE FROM personal_tasks WHERE id = ?').run(task.id);
  res.json({ success: true });
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
  res.json({ ...req.user, role_name: getRoleName(req.user.role), permissions: getUserPermissions(req.user.role) });
});

app.get('/api/users', (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.name, u.email, u.role, r.name AS role_name, u.active, u.created_at
    FROM users u LEFT JOIN system_roles r ON r.role_key = u.role ORDER BY u.name
  `).all());
});

app.get('/api/roles', (req, res) => {
  res.json(db.prepare('SELECT role_key, name, is_system FROM system_roles ORDER BY is_system DESC, name COLLATE NOCASE').all());
});

app.post('/api/users', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  const role = req.body?.role;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'נא להזין שם ואימייל תקין' });
  }
  if (typeof role !== 'string' || !db.prepare('SELECT 1 FROM system_roles WHERE role_key = ?').get(role)) {
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
  if (typeof role !== 'string' || !db.prepare('SELECT 1 FROM system_roles WHERE role_key = ?').get(role) || typeof active !== 'boolean') {
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

// עדכון פרטי משתמשת (שם, אימייל)
app.patch('/api/users/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'מנהלת מערכת בלבד' });
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'המשתמשת לא נמצאה' });

  const name  = String(req.body?.name  || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!name)                                          return res.status(400).json({ error: 'שם חובה' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))    return res.status(400).json({ error: 'אימייל לא תקין' });

  try {
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, id);
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'אימייל זה כבר בשימוש' });
    throw e;
  }
});

// מחיקת משתמשת
app.delete('/api/users/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'מנהלת מערכת בלבד' });
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'לא ניתן למחוק את החשבון המחובר' });

  const user = db.prepare('SELECT role, active FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'המשתמשת לא נמצאה' });

  if (user.role === 'admin' && user.active) {
    const activeAdmins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
    if (activeAdmins <= 1) return res.status(400).json({ error: 'חייבת להישאר לפחות מנהלת מערכת פעילה אחת' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/users/:id/password', (req, res) => {
  const id = Number(req.params.id);
  const password = req.body?.password;
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'מזהה משתמשת לא תקין' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return res.status(404).json({ error: 'המשתמשת לא נמצאה' });
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: 'הסיסמה חייבת להכיל 12 עד 128 תווים' });
  }
  const { salt, hash } = hashPassword(password);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?').run(salt, hash, id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  })();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true });
});

app.post('/api/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return res.status(404).json({ error: 'המשתמשת לא נמצאה' });
  if (id === req.user.id) return res.status(400).json({ error: 'לא ניתן לאפס את הסיסמה של החשבון המחובר' });
  // Characters without look-alikes (no 0/O, 1/l/I) so it is easy to read out
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const temporary = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  const { salt, hash } = hashPassword(temporary);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?').run(salt, hash, id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  })();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ password: temporary });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  registerUploadedFile(req.file, 'equipment');
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

const messageCols = db.prepare('PRAGMA table_info(messages)').all().map(c => c.name);
if (!messageCols.includes('edited_at')) db.exec('ALTER TABLE messages ADD COLUMN edited_at TEXT');
const studentCols = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
const studentColNames = db.prepare('PRAGMA table_info(students)').all().map(c => c.name);
if (!studentColNames.includes('photo_url')) db.exec('ALTER TABLE students ADD COLUMN photo_url TEXT');
if (!studentCols.includes('birth_date')) db.exec('ALTER TABLE students ADD COLUMN birth_date TEXT');
if (!studentCols.includes('address')) db.exec('ALTER TABLE students ADD COLUMN address TEXT');
if (!studentCols.includes('phone_code')) db.exec('ALTER TABLE students ADD COLUMN phone_code TEXT');
if (!studentCols.includes('extra_data')) db.exec("ALTER TABLE students ADD COLUMN extra_data TEXT NOT NULL DEFAULT '{}'");

function parseExtraData(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === 'object') return rawValue;
  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapStudentRow(row) {
  if (!row) return row;
  return {
    ...row,
    class_name: buildClassName(row.year, row.parallel) || String(row.class_name || '').trim(),
    track: row.track ? splitTrackValues(row.track).join(' / ') : row.track,
    extra_data: parseExtraData(row.extra_data)
  };
}

app.get('/api/students', (req, res) => {
  const { q } = req.query;
  if (q) {
    const rows = db.prepare(`SELECT * FROM students WHERE id_number LIKE ? OR name LIKE ? LIMIT 20`)
      .all(`%${q}%`, `%${q}%`);
    return res.json(rows.map(mapStudentRow));
  }
  res.json(db.prepare('SELECT * FROM students ORDER BY name').all().map(mapStudentRow));
});

// חיפוש גלובלי: תלמידות, ציוד, קודי מבחן, מורות, דפים, ארועים ומבחנים
app.get('/api/search', (req, res) => {
  const permissions = getUserPermissions(req.user.role);
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ students: [], equipment: [], examCodes: [], teachers: [], pages: [], calendarEvents: [], exams: [] });
  const like = `%${q}%`;
  const students = permissions.students?.view
    ? db.prepare('SELECT id_number, name, track, year FROM students WHERE name LIKE ? OR id_number LIKE ? LIMIT 5').all(like, like).map(mapStudentRow)
    : [];
  const equipment = permissions.equipment?.view
    ? db.prepare('SELECT id, name, category, barcode FROM equipment WHERE name LIKE ? OR barcode LIKE ? LIMIT 5').all(like, like)
    : [];
  const examCodes = permissions.exams?.view && permissions.students?.view ? db.prepare(`
    SELECT c.code, e.name AS exam_name, s.name AS student_name
    FROM exam_codes c JOIN exams e ON e.id = c.exam_id JOIN students s ON s.id_number = c.id_number
    WHERE c.code LIKE ? LIMIT 5
  `).all(like) : [];
  const teachers = permissions.teachers?.view
    ? db.prepare('SELECT * FROM teachers WHERE name LIKE ? OR subject LIKE ? ORDER BY name LIMIT 5').all(like, like)
    : [];
  // חיפוש בדפים אישיים — רק דפים שהמשתמשת רשאית לראות
  const pages = permissions.pages?.view ? db.prepare(`
    SELECT p.id, p.title, t.name AS topic_name
    FROM personal_pages p
    JOIN page_topics t ON t.id = p.topic_id
    WHERE (p.title LIKE ? OR p.body LIKE ?)
      AND (p.visibility = 'public' OR p.created_by = ? OR EXISTS (
        SELECT 1 FROM page_access_requests r
        WHERE r.page_id = p.id AND r.user_id = ? AND r.status = 'approved'
      ))
    LIMIT 5
  `).all(like, like, req.user.id, req.user.id) : [];
  // חיפוש ארועי לוח שנה
  const calendarEvents = permissions.calendar?.view ? db.prepare(`
    SELECT id, title, event_date, category, source_sheet
    FROM calendar_events
    WHERE title LIKE ? OR category LIKE ? OR notes LIKE ?
    ORDER BY event_date DESC LIMIT 5
  `).all(like, like, like) : [];
  // חיפוש מבחנים לפי שם
  const exams = permissions.exams?.view ? db.prepare(`
    SELECT id, name, exam_date, track
    FROM exams
    WHERE name LIKE ? OR track LIKE ?
    ORDER BY exam_date DESC LIMIT 5
  `).all(like, like) : [];
  res.json({ students, equipment, examCodes, teachers, pages, calendarEvents, exams });
});

// סיכום דרישות לכל התלמידות בקריאה אחת — לטבלת Excel
app.get('/api/students/requirements-summary', (req, res) => {
  const rows = db.prepare(`
    SELECT
      s.id_number,
      COUNT(tr.id) AS total_reqs,
      COUNT(sr.requirement_id) AS completed_reqs,
      SUM(CASE WHEN tr.required = 1 AND sr.requirement_id IS NULL
               AND (tr.years IS NULL OR tr.years LIKE '%' || s.year || '%')
               THEN 1 ELSE 0 END) AS missing_required
    FROM students s
    LEFT JOIN tracks t ON (s.track LIKE '%' || t.name || '%')
    LEFT JOIN track_requirements tr ON tr.track_id = t.id
      AND (tr.years IS NULL OR tr.years LIKE '%' || s.year || '%')
    LEFT JOIN student_requirements sr ON sr.id_number = s.id_number AND sr.requirement_id = tr.id
    GROUP BY s.id_number
  `).all();
  const map = {};
  for (const r of rows) {
    map[r.id_number] = { total: r.total_reqs, completed: r.completed_reqs, missing: r.missing_required };
  }
  res.json(map);
});

// רשימת כיתות (מקבילות) ייחודיות — חייב להיות לפני /:id_number
// יצירת תלמידה חדשה ידנית
app.post('/api/students', (req, res) => {
  const id_number = String(req.body?.id_number || '').trim();
  const name      = String(req.body?.name      || '').trim();
  const phone     = String(req.body?.phone     || '').trim() || null;
  const track     = String(req.body?.track     || '').trim() || null;
  const year      = String(req.body?.year      || '').trim() || null;
  const parallel  = String(req.body?.parallel  || '').trim() || null;
  const address   = String(req.body?.address   || '').trim() || null;
  const birth_date= String(req.body?.birth_date|| '').trim() || null;
  if (!id_number) return res.status(400).json({ error: 'מספר תעודת זהות הוא שדה חובה' });
  if (!name)      return res.status(400).json({ error: 'שם התלמידה הוא שדה חובה' });
  if (!/^\d{7,9}$/.test(id_number)) return res.status(400).json({ error: 'מספר תעודת זהות צריך להכיל 7–9 ספרות' });
  const existing = db.prepare('SELECT id_number FROM students WHERE id_number = ?').get(id_number);
  if (existing) return res.status(409).json({ error: 'תלמידה עם מספר תעודת זהות זה כבר קיימת במערכת' });
  const className = buildClassName(year, parallel);
  db.prepare(`
    INSERT INTO students (id_number, name, phone, track, year, parallel, class_name, address, birth_date, extra_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
  `).run(id_number, name, phone, track, year, parallel, className, address, birth_date);
  res.status(201).json({ id_number, name });
});

app.get('/api/students/classes', (req, res) => {  const rows = db.prepare(`
    SELECT year, parallel, COUNT(*) as count
    FROM students
    WHERE year IS NOT NULL AND year != ''
      AND parallel IS NOT NULL AND parallel != '' AND parallel != '0'
    GROUP BY year, parallel
    ORDER BY year, parallel
  `).all();
  const list = rows.map(r => ({
    parallel: `${r.year}_${r.parallel}`,
    label: `כיתה ${buildClassName(r.year, r.parallel)}`,
    class_name: r.year,
    parallel_num: r.parallel,
    count: r.count
  }));
  res.json(list);
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
  res.json({ ...mapStudentRow(student), loans });
});

app.put('/api/students/:id_number', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'שם התלמידה הוא שדה חובה' });
  const existing = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!existing) return res.status(404).json({ error: 'לא נמצאה תלמידה עם מספר זהות זה' });

  const optionalText = (value, currentValue) => {
    if (value === undefined) return currentValue ?? null;
    const text = String(value || '').trim();
    return text || null;
  };

  const sanitizeExtraData = (value, currentValue) => {
    if (value === undefined) return parseExtraData(currentValue);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const clean = {};
    for (const [key, raw] of Object.entries(value)) {
      const cleanKey = String(key || '').trim();
      const cleanValue = String(raw || '').trim();
      if (!cleanKey || !cleanValue) continue;
      clean[cleanKey] = cleanValue;
    }
    return clean;
  };

  const phone = optionalText(req.body?.phone, existing.phone);
  const track = optionalText(req.body?.track, existing.track);
  const year = optionalText(req.body?.year, existing.year);
  const phoneCode = optionalText(req.body?.phone_code, existing.phone_code);
  const parallel = optionalText(req.body?.parallel, existing.parallel);
  const extraData = sanitizeExtraData(req.body?.extra_data, existing.extra_data);
  const className = buildClassName(year, parallel);

  const result = db.prepare(`
    UPDATE students SET name = ?, phone = ?, phone_code = ?, track = ?, year = ?, parallel = ?, class_name = ?, extra_data = ?
    WHERE id_number = ?
  `).run(name, phone, phoneCode, track, year, parallel, className, JSON.stringify(extraData), req.params.id_number);  res.json({ success: true });
});

// העלאת תמונת פרופיל לתלמידה
app.post('/api/students/:id_number/photo', upload.single('image'), (req, res) => {
  const student = db.prepare('SELECT id_number FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'תלמידה לא נמצאה' });
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  const photoUrl = `/uploads/${req.file.filename}`;
  registerUploadedFile(req.file, 'students');
  res.json({ url: photoUrl });
});

// עדכון/הסרת תמונת פרופיל
app.patch('/api/students/:id_number/photo', (req, res) => {
  const student = db.prepare('SELECT id_number FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'תלמידה לא נמצאה' });
  res.json({ success: true });
});

app.get('/api/students/:id_number/details', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'לא נמצא' });
  res.json(mapStudentRow(student));
});

// ── תיק סרוק (מסמכים) ──────────────────────────────────────
app.get('/api/students/:id_number/documents', (req, res) => {
  const docs = db.prepare(`
    SELECT d.id, d.file_name, d.file_url, d.created_at, u.name AS uploaded_by_name
    FROM student_documents d LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.id_number = ? ORDER BY d.created_at DESC
  `).all(req.params.id_number);
  res.json(docs);
});

app.post('/api/students/:id_number/documents', xlsxUpload.single('file'), (req, res) => {
  const student = db.prepare('SELECT id_number FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'תלמידה לא נמצאה' });
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  const ALLOWED = ['application/pdf','image/jpeg','image/png','image/webp','image/gif',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ error: 'סוג קובץ לא מורשה' });
  // תיקון encoding של שם הקובץ (multer מקבל Latin-1, שם עברי צריך UTF-8)
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const ext = require('path').extname(originalName) || '';
  const fname = `${Date.now()}-doc${ext}`;
  require('fs').writeFileSync(require('path').join(uploadsDir, fname), req.file.buffer);
  const fileUrl = `/uploads/${fname}`;
  const result = db.prepare(`
    INSERT INTO student_documents (id_number, file_name, file_url, uploaded_by) VALUES (?, ?, ?, ?)
  `).run(req.params.id_number, originalName, fileUrl, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid, file_name: req.file.originalname, file_url: fileUrl });
});

app.delete('/api/students/:id_number/documents/:doc_id', (req, res) => {
  db.prepare('DELETE FROM student_documents WHERE id = ? AND id_number = ?')
    .run(Number(req.params.doc_id), req.params.id_number);
  res.json({ success: true });
});

// ── לוח מודעות ──────────────────────────────────────────────
app.get('/api/students/:id_number/notices', (req, res) => {
  const notices = db.prepare(`
    SELECT n.id, n.title, n.body, n.notice_date, n.visibility, n.created_at, u.name AS created_by_name
    FROM student_notices n LEFT JOIN users u ON u.id = n.created_by
    WHERE n.id_number = ? ORDER BY n.notice_date DESC, n.id DESC
  `).all(req.params.id_number);
  res.json(notices);
});

app.post('/api/students/:id_number/notices', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body  = String(req.body?.body  || '').trim();
  const notice_date = req.body?.notice_date;
  const visibility  = String(req.body?.visibility || 'staff');
  if (!title) return res.status(400).json({ error: 'כותרת חסרה' });
  if (!body)  return res.status(400).json({ error: 'תוכן חסר' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(notice_date || '')) return res.status(400).json({ error: 'תאריך לא תקין' });
  if (!['staff','student','all'].includes(visibility)) return res.status(400).json({ error: 'נראות לא תקינה' });
  const result = db.prepare(`
    INSERT INTO student_notices (id_number, title, body, notice_date, visibility, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id_number, title, body, notice_date, visibility, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete('/api/students/:id_number/notices/:notice_id', (req, res) => {
  db.prepare('DELETE FROM student_notices WHERE id = ? AND id_number = ?')
    .run(Number(req.params.notice_id), req.params.id_number);
  res.json({ success: true });
});

app.delete('/api/students/:id_number', (req, res) => {
  const idNumber = String(req.params.id_number || '').trim();
  const student = db.prepare('SELECT id_number, name FROM students WHERE id_number = ?').get(idNumber);
  if (!student) return res.status(404).json({ error: 'לא נמצאה תלמידה עם מספר זהות זה' });

  const activeLoan = db.prepare(`
    SELECT id FROM loans
    WHERE borrower_id_number = ? AND actual_return IS NULL
    LIMIT 1
  `).get(idNumber);
  if (activeLoan) {
    return res.status(400).json({ error: 'לא ניתן למחוק תלמידה עם השאלות פעילות' });
  }

  const removeStudent = db.transaction(() => {
    const files = db.prepare('SELECT file_stored FROM student_requirements WHERE id_number = ?').all(idNumber);
    removeStoredFiles(files);
    db.prepare('DELETE FROM student_requirements WHERE id_number = ?').run(idNumber);
    db.prepare('DELETE FROM students WHERE id_number = ?').run(idNumber);
  });

  removeStudent();
  res.json({ success: true, id_number: student.id_number, name: student.name });
});

app.post('/api/admin/reset-database', (req, res) => {
  const permissions = getUserPermissions(req.user.role);
  if (['students', 'tracks', 'exams'].some(feature => !permissions[feature]?.change)) {
    return res.status(403).json({ error: 'נדרשת הרשאת שינוי בכל התחומים שיימחקו' });
  }
  const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  const before = {
    students: count('students'),
    student_requirements: count('student_requirements'),
    tracks: count('tracks'),
    track_requirements: count('track_requirements'),
    exams: count('exams'),
    exam_codes: count('exam_codes'),
    exam_grades: count('exam_grades')
  };

  const resetTx = db.transaction(() => {
    const files = db.prepare('SELECT file_stored FROM student_requirements WHERE file_stored IS NOT NULL').all();
    removeStoredFiles(files);

    db.prepare('DELETE FROM student_requirements').run();
    db.prepare('DELETE FROM students').run();
    db.prepare('DELETE FROM track_requirements').run();
    db.prepare('DELETE FROM tracks').run();
    db.prepare('DELETE FROM exam_grades').run();
    db.prepare('DELETE FROM exam_codes').run();
    db.prepare('DELETE FROM exams').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('students','tracks','track_requirements','exams')").run();
  });

  resetTx();
  res.json({
    success: true,
    message: 'נתוני התלמידות והמסלולים אופסו בהצלחה',
    cleared: before
  });
});

// ── Tracks and requirements ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS track_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS student_requirements (
    id_number TEXT NOT NULL,
    requirement_id INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_by TEXT,
    PRIMARY KEY (id_number, requirement_id)
  );
`);
for (const [table, column, ddl] of [
  ['track_requirements', 'requires_file', 'INTEGER NOT NULL DEFAULT 0'],
  ['student_requirements', 'file_stored', 'TEXT'],
  ['student_requirements', 'file_name', 'TEXT'],
  ['student_requirements', 'file_mime', 'TEXT'],
  ['tracks', 'merged_into', 'INTEGER'],
  ['track_requirements', 'years', 'TEXT']
]) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function removeStoredFiles(rows) {
  for (const row of rows) {
    if (row.file_stored) fs.rm(path.join(requirementFilesDir, path.basename(row.file_stored)), { force: true }, () => {});
  }
}

// Student tracks come from free-text Excel cells, so extra spaces must not break matching
function normalizeTrackName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// years: null means every year; otherwise a comma list such as "ה" or "ה,ו"
const REQUIREMENT_YEARS = ['ה', 'ו'];
function normalizeYears(value) {
  const list = Array.isArray(value) ? value : [];
  const picked = REQUIREMENT_YEARS.filter((y) => list.includes(y));
  return picked.length && picked.length < REQUIREMENT_YEARS.length ? picked.join(',') : null;
}

function requirementAppliesTo(requirement, student) {
  if (!requirement.years) return true;
  return requirement.years.split(',').includes(normalizeTrackName(student.year));
}

function findStudentTrackIds(student) {
  if (!student?.track) return [];
  const tracks = db.prepare('SELECT id, name, merged_into FROM tracks').all();
  return resolveStudentTrackIds(student.track, tracks);
}

function validTrackName(value) {
  const name = normalizeTrackName(value);
  if (!name) return { error: 'שם המסלול הוא שדה חובה' };
  if (name.length > 100) return { error: 'שם המסלול ארוך מדי' };
  return { name };
}

function validRequirement(body) {
  const title = String(body?.title || '').replace(/\s+/g, ' ').trim();
  if (!title) return { error: 'שם הדרישה הוא שדה חובה' };
  if (title.length > 200) return { error: 'שם הדרישה ארוך מדי' };
  return { title, required: body?.required === false || body?.required === 0 ? 0 : 1,
    requires_file: body?.requires_file === true || body?.requires_file === 1 ? 1 : 0,
    years: normalizeYears(body?.years) };
}

app.get('/api/tracks', (req, res) => {
  const tracks = db.prepare('SELECT * FROM tracks ORDER BY name').all();
  const requirements = db.prepare('SELECT * FROM track_requirements ORDER BY sort_order, id').all();
  const counts = new Map();
  const rows = db.prepare("SELECT track, COUNT(*) AS n FROM students WHERE track IS NOT NULL GROUP BY track").all();
  for (const row of rows) {
    const names = splitTrackValues(row.track);
    for (const name of names) {
      if (name) counts.set(name, (counts.get(name) || 0) + row.n);
    }
  }
  const defined = new Set(tracks.map((t) => t.name));
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const ownCount = (t) => counts.get(t.name) || 0;
  res.json({
    tracks: tracks.map((t) => ({
      ...t,
      merged_into_name: t.merged_into ? trackById.get(t.merged_into)?.name || null : null,
      own_student_count: ownCount(t),
      student_count: ownCount(t) + tracks.filter((m) => m.merged_into === t.id).reduce((sum, m) => sum + ownCount(m), 0),
      merged_from: tracks.filter((m) => m.merged_into === t.id).map((m) => ({ id: m.id, name: m.name })),
      requirements: requirements.filter((r) => r.track_id === t.id),
    })),
    undefined_tracks: [...counts]
      .filter(([name]) => !defined.has(name))
      .map(([name, student_count]) => ({ name, student_count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he')),
  });
});

app.post('/api/tracks', (req, res) => {
  const checked = validTrackName(req.body?.name);
  if (checked.error) return res.status(400).json({ error: checked.error });
  if (db.prepare('SELECT 1 FROM tracks WHERE name = ?').get(checked.name)) {
    return res.status(409).json({ error: 'מסלול בשם הזה כבר קיים' });
  }
  const result = db.prepare('INSERT INTO tracks (name) VALUES (?)').run(checked.name);
  res.status(201).json({ id: Number(result.lastInsertRowid), name: checked.name });
});

app.put('/api/tracks/:id', (req, res) => {
  const checked = validTrackName(req.body?.name);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'המסלול לא נמצא' });
  if (db.prepare('SELECT 1 FROM tracks WHERE name = ? AND id != ?').get(checked.name, track.id)) {
    return res.status(409).json({ error: 'מסלול בשם הזה כבר קיים' });
  }
  db.transaction(() => {
    db.prepare('UPDATE tracks SET name = ? WHERE id = ?').run(checked.name, track.id);
    // Keep students attached to the track after a rename
    const updateStudents = db.prepare('UPDATE students SET track = ? WHERE track = ?');
    for (const { track: raw } of db.prepare('SELECT DISTINCT track FROM students WHERE track IS NOT NULL').all()) {
      if (normalizeTrackName(raw) === track.name) updateStudents.run(checked.name, raw);
    }
  })();
  res.json({ success: true });
});

app.put('/api/tracks/:id/merge', (req, res) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'המסלול לא נמצא' });
  const targetId = req.body?.target_id;
  if (targetId === null) {
    db.prepare('UPDATE tracks SET merged_into = NULL WHERE id = ?').run(track.id);
    return res.json({ success: true });
  }
  if (!Number.isInteger(targetId)) return res.status(400).json({ error: 'יש לבחור מסלול' });
  if (targetId === track.id) return res.status(400).json({ error: 'אי אפשר לאחד מסלול עם עצמו' });
  const target = db.prepare('SELECT * FROM tracks WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'מסלול היעד לא נמצא' });
  if (target.merged_into) return res.status(400).json({ error: `המסלול "${target.name}" עצמו מאוחד למסלול אחר. יש לבחור את המסלול הראשי.` });
  if (db.prepare('SELECT 1 FROM tracks WHERE merged_into = ?').get(track.id)) {
    return res.status(400).json({ error: 'מסלולים אחרים מאוחדים למסלול הזה. יש להפריד אותם קודם.' });
  }
  db.prepare('UPDATE tracks SET merged_into = ? WHERE id = ?').run(target.id, track.id);
  res.json({ success: true });
});

app.delete('/api/tracks/:id', (req, res) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'המסלול לא נמצא' });
  db.transaction(() => {
    db.prepare('UPDATE tracks SET merged_into = NULL WHERE merged_into = ?').run(track.id);
    removeStoredFiles(db.prepare('SELECT file_stored FROM student_requirements WHERE requirement_id IN (SELECT id FROM track_requirements WHERE track_id = ?)').all(track.id));
    db.prepare('DELETE FROM student_requirements WHERE requirement_id IN (SELECT id FROM track_requirements WHERE track_id = ?)').run(track.id);
    db.prepare('DELETE FROM track_requirements WHERE track_id = ?').run(track.id);
    db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
  })();
  res.json({ success: true });
});

app.post('/api/tracks/:id/requirements', (req, res) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'המסלול לא נמצא' });
  const checked = validRequirement(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const next = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM track_requirements WHERE track_id = ?').get(track.id).n;
  const result = db.prepare('INSERT INTO track_requirements (track_id, title, required, requires_file, years, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(track.id, checked.title, checked.required, checked.requires_file, checked.years, next);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.post('/api/track-requirements/bulk', (req, res) => {
  const checked = validRequirement(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const ids = Array.isArray(req.body?.track_ids) ? [...new Set(req.body.track_ids.map(Number))] : [];
  if (!ids.length || ids.length > 200 || ids.some((id) => !Number.isInteger(id))) {
    return res.status(400).json({ error: 'יש לבחור לפחות מסלול אחד' });
  }
  const tracks = ids.map((id) => db.prepare('SELECT id FROM tracks WHERE id = ?').get(id));
  if (tracks.some((t) => !t)) return res.status(404).json({ error: 'אחד המסלולים לא נמצא' });

  let added = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const { id } of tracks) {
      if (db.prepare('SELECT 1 FROM track_requirements WHERE track_id = ? AND title = ?').get(id, checked.title)) {
        skipped++;
        continue;
      }
      const next = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM track_requirements WHERE track_id = ?').get(id).n;
      db.prepare('INSERT INTO track_requirements (track_id, title, required, requires_file, years, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, checked.title, checked.required, checked.requires_file, checked.years, next);
      added++;
    }
  })();
  res.status(201).json({ added, skipped });
});

app.put('/api/track-requirements/:id', (req, res) => {
  const checked = validRequirement(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const result = db.prepare('UPDATE track_requirements SET title = ?, required = ?, requires_file = ?, years = ? WHERE id = ?')
    .run(checked.title, checked.required, checked.requires_file, checked.years, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'הדרישה לא נמצאה' });
  res.json({ success: true });
});

app.delete('/api/track-requirements/:id', (req, res) => {
  const found = db.prepare('SELECT id FROM track_requirements WHERE id = ?').get(req.params.id);
  if (!found) return res.status(404).json({ error: 'הדרישה לא נמצאה' });
  db.transaction(() => {
    removeStoredFiles(db.prepare('SELECT file_stored FROM student_requirements WHERE requirement_id = ?').all(found.id));
    db.prepare('DELETE FROM student_requirements WHERE requirement_id = ?').run(found.id);
    db.prepare('DELETE FROM track_requirements WHERE id = ?').run(found.id);
  })();
  res.json({ success: true });
});

app.get('/api/students/:id_number/requirements', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'לא נמצא' });
  const trackNames = splitTrackValues(student.track);
  const trackIds = findStudentTrackIds(student);
  if (!trackIds.length) return res.json({ track: trackNames.join(' / ') || null, defined: false, requirements: [] });
  const placeholders = trackIds.map(() => '?').join(', ');
  const requirements = db.prepare(`
    SELECT r.id, r.title, r.required, r.requires_file, r.years, sr.completed_at, sr.completed_by, sr.file_name
    FROM track_requirements r
    LEFT JOIN student_requirements sr ON sr.requirement_id = r.id AND sr.id_number = ?
    WHERE r.track_id IN (${placeholders})
    ORDER BY r.sort_order, r.id
  `).all(student.id_number, ...trackIds).filter((r) => requirementAppliesTo(r, student));
  res.json({ track: trackNames.join(' / '), defined: true, requirements });
});

app.put('/api/students/:id_number/requirements/:requirement_id', (req, res) => {
  if (typeof req.body?.completed !== 'boolean') return res.status(400).json({ error: 'ערך לא תקין' });
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'לא נמצאה תלמידה עם מספר זהות זה' });
  const trackIds = findStudentTrackIds(student);
  const requirement = trackIds.length && db.prepare(`SELECT * FROM track_requirements WHERE id = ? AND track_id IN (${trackIds.map(() => '?').join(', ')})`)
    .get(req.params.requirement_id, ...trackIds);
  if (!requirement || !requirementAppliesTo(requirement, student)) {
    return res.status(404).json({ error: 'הדרישה אינה שייכת למסלול של התלמידה' });
  }
  if (req.body.completed) {
    if (requirement.requires_file) return res.status(400).json({ error: 'דרישה זו מסתיימת בהעלאת קובץ' });
    db.prepare('INSERT OR REPLACE INTO student_requirements (id_number, requirement_id, completed_by) VALUES (?, ?, ?)')
      .run(student.id_number, requirement.id, req.user.name);
  } else {
    removeStoredFiles(db.prepare('SELECT file_stored FROM student_requirements WHERE id_number = ? AND requirement_id = ?')
      .all(student.id_number, requirement.id));
    db.prepare('DELETE FROM student_requirements WHERE id_number = ? AND requirement_id = ?')
      .run(student.id_number, requirement.id);
  }
  res.json({ success: true });
});

function findStudentFileRequirement(idNumber, requirementId) {
  const student = db.prepare('SELECT * FROM students WHERE id_number = ?').get(idNumber);
  const trackIds = student ? findStudentTrackIds(student) : [];
  const requirement = trackIds.length && db.prepare(`SELECT * FROM track_requirements WHERE id = ? AND track_id IN (${trackIds.map(() => '?').join(', ')})`)
    .get(requirementId, ...trackIds);
  return student && requirement && requirementAppliesTo(requirement, student) ? { student, requirement } : null;
}

app.post('/api/students/:id_number/requirements/:requirement_id/file', (req, res) => {
  requirementUpload.single('file')(req, res, (err) => {
    const discard = () => req.file && fs.rm(req.file.path, { force: true }, () => {});
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'הקובץ גדול מדי (עד 10MB)' : 'שגיאה בהעלאת הקובץ' });
    if (!req.file) return res.status(400).json({ error: 'יש לבחור קובץ PDF או תמונה' });
    const found = findStudentFileRequirement(req.params.id_number, req.params.requirement_id);
    if (!found || !found.requirement.requires_file) {
      discard();
      return res.status(404).json({ error: 'הדרישה אינה דורשת קובץ או אינה שייכת לתלמידה' });
    }
    const old = db.prepare('SELECT file_stored FROM student_requirements WHERE id_number = ? AND requirement_id = ?')
      .all(found.student.id_number, found.requirement.id);
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
    db.prepare(`INSERT OR REPLACE INTO student_requirements
      (id_number, requirement_id, completed_by, file_stored, file_name, file_mime) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(found.student.id_number, found.requirement.id, req.user.name, req.file.filename, originalName, req.file.mimetype);
    removeStoredFiles(old);
    res.status(201).json({ success: true });
  });
});

app.get('/api/students/:id_number/requirements/:requirement_id/file', (req, res) => {
  const row = db.prepare('SELECT file_stored, file_name, file_mime FROM student_requirements WHERE id_number = ? AND requirement_id = ?')
    .get(req.params.id_number, req.params.requirement_id);
  if (!row?.file_stored) return res.status(404).json({ error: 'הקובץ לא נמצא' });
  res.setHeader('Content-Type', row.file_mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.file_name || 'file')}`);
  res.sendFile(path.join(requirementFilesDir, path.basename(row.file_stored)), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'הקובץ לא נמצא' });
  });
});

app.get('/api/reports/track', (req, res) => {
  const track = String(req.query.track || '').trim();
  const year = String(req.query.year || '').trim();
  if (!track) return res.status(400).json({ error: 'יש לבחור מסלול' });
  if (!year) return res.status(400).json({ error: 'יש לבחור שנה' });

  const students = db.prepare('SELECT * FROM students ORDER BY name').all();
  const exams = db.prepare('SELECT * FROM exams ORDER BY created_at DESC').all();
  const gradeRows = db.prepare(`
    SELECT e.id AS exam_id, c.id_number, g.grade
    FROM exam_codes c
    JOIN exams e ON e.id = c.exam_id
    LEFT JOIN exam_grades g ON g.code = c.code
    WHERE e.track = ? OR e.track IS NULL
  `).all(track);

  const gradesByExam = {};
  for (const row of gradeRows) {
    if (!gradesByExam[row.exam_id]) gradesByExam[row.exam_id] = {};
    if (row.grade != null) gradesByExam[row.exam_id][row.id_number] = row.grade;
  }

  const report = buildTrackReport(students, exams, track, year, gradesByExam);
  res.json(report);
});

app.get('/api/reports/class', (req, res) => {
  const className = String(req.query.class_name || req.query.year || '').trim();
  if (!className) return res.status(400).json({ error: 'יש לבחור כיתה' });

  const { year } = (() => {
    const raw = className.replace(/\s+/g, ' ').trim();
    const match = raw.match(/^([א-ת]+)(\d+)?$/);
    return match ? { year: match[1] } : { year: raw };
  })();

  const students = db.prepare('SELECT * FROM students ORDER BY name').all();
  const exams = db.prepare('SELECT * FROM exams WHERE year IS NULL OR year = ? ORDER BY created_at DESC').all(year);
  const gradeRows = db.prepare(`
    SELECT e.id AS exam_id, c.id_number, g.grade
    FROM exam_codes c
    JOIN exams e ON e.id = c.exam_id
    LEFT JOIN exam_grades g ON g.code = c.code
    WHERE e.year IS NULL OR e.year = ?
  `).all(year);

  const gradesByExam = {};
  for (const row of gradeRows) {
    if (!gradesByExam[row.exam_id]) gradesByExam[row.exam_id] = {};
    if (row.grade != null) gradesByExam[row.exam_id][row.id_number] = row.grade;
  }

  const report = buildClassReport(students, exams, gradesByExam, className);
  res.json(report);
});

app.get('/api/tracks/:id/stats', (req, res) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.id);
  if (!track) return res.status(404).json({ error: 'המסלול לא נמצא' });
  const names = new Set([track.name, ...db.prepare('SELECT name FROM tracks WHERE merged_into = ?').all(track.id).map((t) => t.name)]);
  const students = db.prepare('SELECT id_number, name, track, year FROM students').all()
    .filter((s) => [...names].some((name) => studentHasTrack(s.track, name)));
  const requirements = db.prepare('SELECT id, title, required, requires_file, years FROM track_requirements WHERE track_id = ? ORDER BY sort_order, id').all(track.id);
  const done = new Set(
    db.prepare('SELECT id_number, requirement_id FROM student_requirements WHERE requirement_id IN (SELECT id FROM track_requirements WHERE track_id = ?)')
      .all(track.id).map((r) => `${r.id_number}:${r.requirement_id}`)
  );
  res.json({
    track: track.name,
    total_students: students.length,
    requirements: requirements.map((r) => {
      const applicable = students.filter((s) => requirementAppliesTo(r, s));
      return {
        ...r,
        applicable_count: applicable.length,
        completed_count: applicable.filter((s) => done.has(`${s.id_number}:${r.id}`)).length
      };
    }),
    students: students.map((s) => {
      const applicable = requirements.filter((r) => requirementAppliesTo(r, s));
      const completed = applicable.filter((r) => done.has(`${s.id_number}:${r.id}`)).map((r) => r.id);
      return {
        id_number: s.id_number,
        name: s.name,
        year: normalizeTrackName(s.year),
        applicable: applicable.map((r) => r.id),
        completed,
        missing_required: applicable.filter((r) => r.required && !completed.includes(r.id)).length
      };
    })
  });
});

app.post('/api/students/import', xlsxUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  try {
    const rows = parseStudentWorkbook(req.file.buffer);

    const upsert = db.prepare(`
      INSERT INTO students (id_number, name, phone, phone_code, track, year, birth_date, address, parallel, class_name, extra_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id_number) DO UPDATE SET
        name=excluded.name,
        phone=excluded.phone,
        phone_code=excluded.phone_code,
        track=excluded.track,
        year=excluded.year,
        birth_date=excluded.birth_date,
        address=excluded.address,
        parallel=excluded.parallel,
        class_name=excluded.class_name,
        extra_data=excluded.extra_data
    `);
    const getExistingStudent = db.prepare('SELECT * FROM students WHERE id_number = ?');

    let imported = 0, skipped = 0, withBirthDate = 0, withAddress = 0, withPhoneCode = 0, mergedExisting = 0, addedExtraFields = 0;

    const pickValue = (existingValue, incomingValue) => {
      const current = String(existingValue || '').trim();
      if (current) return current;
      const next = String(incomingValue || '').trim();
      return next || null;
    };

    const mergeTrackValues = (existingValue, incomingValue) => {
      const values = [];
      const add = (rawValue) => {
        const cleaned = normalizeTrackName(rawValue);
        if (!cleaned) return;
        const exists = values.some((value) => normalizeTrackName(value).toLocaleLowerCase() === cleaned.toLocaleLowerCase());
        if (!exists) values.push(cleaned);
      };
      add(existingValue);
      add(incomingValue);
      return values.join(' / ');
    };

    const mergeExtraFields = (existing, incoming) => {
      const merged = { ...existing };
      let added = 0;
      for (const [key, value] of Object.entries(incoming)) {
        const cleanKey = String(key || '').trim();
        const cleanValue = String(value || '').trim();
        if (!cleanKey || !cleanValue) continue;
        const existingValue = String(merged[cleanKey] || '').trim();
        if (!existingValue) {
          merged[cleanKey] = cleanValue;
          added++;
        }
      }
      return { merged, added };
    };

    const importMany = db.transaction((rows) => {
      for (const row of rows) {
        const id_number = normalizeIdNumber(row.id_number || '');
        const name = String(row.name || '').trim();
        const phone = String(row.phone || '').trim();
        const phone_code = String(row.phone_code || '').trim();
        const track = String(row.track || '').trim();
        const year = String(row.year || '').trim();
        const birth_date = String(row.birth_date || '').trim();
        const address = String(row.address || '').trim();
        const extraFields = row.extra_fields || {};

        const existing = getExistingStudent.get(id_number);
        if (!id_number) { skipped++; continue; }
        if (!name && !existing) { skipped++; continue; }
        if (existing) mergedExisting++;

        const existingExtra = parseExtraData(existing?.extra_data);
        const mergedExtra = mergeExtraFields(existingExtra, extraFields);
        addedExtraFields += mergedExtra.added;

        const mergedName = pickValue(existing?.name, name);
        const mergedPhone = pickValue(existing?.phone, phone);
        const mergedPhoneCode = pickValue(existing?.phone_code, phone_code);
        const mergedTrack = mergeTrackValues(existing?.track, track);
        const mergedYear = pickValue(existing?.year, year);
        const mergedParallel = pickValue(existing?.parallel, String(extraFields.parallel || extraFields['מקבילה'] || '').trim());
        const mergedBirthDate = pickValue(existing?.birth_date, birth_date);
        const mergedAddress = pickValue(existing?.address, address);
        const mergedClassName = buildClassName(mergedYear, mergedParallel);

        upsert.run(
          id_number,
          mergedName,
          mergedPhone,
          mergedPhoneCode,
          mergedTrack,
          mergedYear,
          mergedBirthDate,
          mergedAddress,
          mergedParallel || null,
          mergedClassName,
          JSON.stringify(mergedExtra.merged)
        );
        imported++;
        if (mergedBirthDate) withBirthDate++;
        if (mergedAddress) withAddress++;
        if (mergedPhoneCode) withPhoneCode++;
      }
    });
    importMany(rows);
    res.json({ imported, skipped, withBirthDate, withAddress, withPhoneCode, mergedExisting, addedExtraFields, total: rows.length });
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
function equipmentQuery(whereClause = '', date = null) {
  const d = date || "date('now')";
  return `
    SELECT e.*,
      CASE WHEN e.category = 'מצלמות אישיות' THEN 'ציוד צילום' ELSE e.category END as category,
      CASE WHEN e.category = 'מצלמות אישיות' THEN 'מצלמות אישיות' ELSE e.subcategory END as subcategory,
      CASE WHEN active.id IS NOT NULL THEN 1 ELSE 0 END as is_loaned,
      active.borrower_name, active.expected_return, active.loan_date, active.id as loan_id, active.borrower_phone, active.notes, active.track, active.location,
      CASE WHEN future.cnt > 0 THEN 1 ELSE 0 END as is_reserved
    FROM equipment e
    LEFT JOIN loans active ON active.equipment_id = e.id AND active.actual_return IS NULL
      AND active.loan_date <= ${d}
    LEFT JOIN (SELECT equipment_id, COUNT(*) as cnt FROM loans WHERE actual_return IS NULL AND loan_date > ${d} GROUP BY equipment_id) future
      ON future.equipment_id = e.id
    ${whereClause}
  `;
}

app.get('/api/equipment', (req, res) => {
  const date = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? `'${req.query.date}'` : null;
  res.json(db.prepare(equipmentQuery('', date)).all());
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'מזהה ציוד לא תקין' });

  try {
    db.transaction(() => {
      db.prepare('DELETE FROM loans WHERE equipment_id=?').run(id);
      db.prepare('DELETE FROM equipment WHERE id=?').run(id);
    })();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete equipment failed:', error);
    res.status(400).json({ error: 'לא ניתן למחוק ציוד עם השאלות שמורות' });
  }
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

  const eq = db.prepare('SELECT category, subcategory, overdue_price_per_day FROM equipment WHERE id=?').get(equipment_id);
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

  // קביעת סטטוס תשלום: רק השכרות וציוד עם קנס איחור מקבלים 'pending'
  const hasPotentialCharge = (loan_type || 'loan') === 'rental' || Number(eq?.overdue_price_per_day || overdue_price_per_day || 0) > 0;
  const initialPaymentStatus = hasPotentialCharge ? 'pending' : 'none';

  const result = db.prepare(
    `INSERT INTO loans (equipment_id, borrower_name, borrower_phone, borrower_id_number, loan_date, expected_return, notes,
      loan_type, price_per_day, card_last4, card_expiry, card_holder, payment_status, track, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(equipment_id, borrower_name, borrower_phone, borrower_id_number || null, loan_date, expected_return, notes,
        loan_type || 'loan', price_per_day || 0, card_last4, card_expiry, card_holder, initialPaymentStatus, track || null, location || null);
  logActivity(req.user.id, 'יצרה השאלת ציוד', 'equipment', equipment_id, borrower_name);
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
  logActivity(req.user.id, 'החזירה ציוד', 'equipment', loan.equipment_id, loan.borrower_name);
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
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'מזהה לא תקין' });
  const loan = db.prepare(`
    SELECT l.*, e.name AS equipment_name FROM loans l
    JOIN equipment e ON e.id = l.equipment_id WHERE l.id = ?
  `).get(id);
  if (!loan) return res.status(404).json({ error: 'השאלה לא נמצאה' });
  // מוחקים תמונת deposit אם קיימת
  if (loan.deposit_scan_url) {
    const fname = require('path').basename(loan.deposit_scan_url);
    require('fs').rm(require('path').join(uploadsDir, fname), { force: true }, () => {});
  }
  db.prepare('DELETE FROM loans WHERE id=?').run(id);
  logActivity(req.user.id, 'מחקה השאלה', 'equipment', loan.equipment_id, loan.borrower_name);
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
  const today = new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT l.*, e.name as equipment_name, e.category
    FROM loans l JOIN equipment e ON e.id = l.equipment_id
    WHERE e.category = 'מחשב נייד'
      AND l.actual_return IS NULL
      AND l.loan_date <= ?
  `).all(today);
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

// ── Exams & barcode grades ───────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    track TEXT,
    year TEXT,
    exam_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS exam_templates (
    exam_id INTEGER PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
    template_type TEXT NOT NULL DEFAULT 'open',
    questions TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS exam_codes (
    code TEXT PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    id_number TEXT NOT NULL,
    UNIQUE (exam_id, id_number)
  );
  CREATE TABLE IF NOT EXISTS exam_grades (
    code TEXT PRIMARY KEY REFERENCES exam_codes(code) ON DELETE CASCADE,
    grade REAL NOT NULL,
    graded_by INTEGER,
    graded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS exam_codes_student_idx ON exam_codes(id_number);
`);

// רשימת מבחנים + סטטיסטיקות בסיסיות
app.get('/api/exams', (req, res) => {
  res.json(db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM exam_codes c WHERE c.exam_id = e.id) AS codes_count,
      (SELECT COUNT(*) FROM exam_codes c JOIN exam_grades g ON g.code = c.code WHERE c.exam_id = e.id) AS graded_count,
      (SELECT ROUND(AVG(g.grade),1) FROM exam_codes c JOIN exam_grades g ON g.code = c.code WHERE c.exam_id = e.id) AS avg_grade
    FROM exams e ORDER BY e.created_at DESC
  `).all());
});

app.post('/api/exams', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'שם המבחן הוא שדה חובה' });
  const result = db.prepare('INSERT INTO exams (name, track, year, exam_date) VALUES (?, ?, ?, ?)')
    .run(name, req.body?.track || null, req.body?.year || null, req.body?.exam_date || null);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/exams/:id', (req, res) => {
  db.prepare('DELETE FROM exams WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// תבנית מבחן (שאלות)
app.get('/api/exams/:id/template', (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'מבחן לא נמצא' });
  const tmpl = db.prepare('SELECT * FROM exam_templates WHERE exam_id=?').get(req.params.id);
  if (!tmpl) return res.json({ exam_id: Number(req.params.id), template_type: 'open', questions: [] });
  let questions = [];
  try { questions = JSON.parse(tmpl.questions || '[]'); } catch { questions = []; }
  res.json({ ...tmpl, questions });
});

app.put('/api/exams/:id/template', (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'מבחן לא נמצא' });
  const { template_type, questions } = req.body || {};
  const type = ['multiple_choice', 'open'].includes(template_type) ? template_type : 'open';
  let qs = [];
  try { qs = Array.isArray(questions) ? questions : JSON.parse(questions || '[]'); } catch { qs = []; }
  db.prepare(`
    INSERT INTO exam_templates (exam_id, template_type, questions, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(exam_id) DO UPDATE SET template_type=excluded.template_type, questions=excluded.questions, updated_at=excluded.updated_at
  `).run(Number(req.params.id), type, JSON.stringify(qs));
  res.json({ success: true });
});

// פרטי מבחן: כל התלמידות עם קוד/ציון
app.get('/api/exams/:id', (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'מבחן לא נמצא' });
  const rows = db.prepare(`
    SELECT s.id_number, s.name, s.track, s.year, c.code, g.grade, g.graded_at
    FROM exam_codes c
    JOIN students s ON s.id_number = c.id_number
    LEFT JOIN exam_grades g ON g.code = c.code
    WHERE c.exam_id = ?
    ORDER BY s.name
  `).all(req.params.id);
  res.json({ ...exam, students: rows });
});

// הפקת ברקודים: לכיתה/מסלול ושנה או לתלמידה בודדת בכל המבחנים הפעילים
function encodeExamCode(examId, idNumber) {
  return `EX${examId}-${idNumber}`;
}

// רשימת כיתות (מקבילות) ייחודיות לסינון בהפקת מבחנים — הועבר לפני /:id_number

app.post('/api/exams/:id/codes', (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'מבחן לא נמצא' });
  const { track, year, id_number, class_num, parallel } = req.body || {};
  let students;
  if (id_number) {
    students = db.prepare('SELECT * FROM students WHERE id_number = ?').all(String(id_number));
  } else if (class_num || parallel) {
    // סינון לפי כיתה — parallel הוא מפתח "class_name_parallel_num" כמו "ה_3"
    const parallelKey = String(parallel || class_num || '').trim();
    const [className, parallelNum] = parallelKey.includes('_') ? parallelKey.split('_') : ['', parallelKey];
    let all = db.prepare('SELECT * FROM students ORDER BY name').all();
    if (track) all = all.filter(s => studentHasTrack(s.track, track));
    students = all.filter(s => {
      if (className && parallelNum) {
        return String(s.class_name || '').trim() === className &&
               String(s.parallel || '').trim() === parallelNum;
      }
      // fallback: רק parallel
      if (s.parallel && String(s.parallel).trim() === parallelKey) return true;
      try {
        const extra = JSON.parse(s.extra_data || '{}');
        return String(extra['מקבילה'] || '').trim() === parallelKey;
      } catch { return false; }
    });
  } else {
    const conds = [];
    const params = [];
    if (year) { conds.push('year = ?'); params.push(String(year)); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    students = db.prepare(`SELECT * FROM students ${where} ORDER BY name`).all(...params);
    if (track) students = students.filter((student) => studentHasTrack(student.track, track));
  }
  if (!students.length) return res.status(400).json({ error: 'לא נמצאו תלמידות מתאימות' });
  const insert = db.prepare('INSERT OR IGNORE INTO exam_codes (code, exam_id, id_number) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (const s of students) insert.run(encodeExamCode(exam.id, s.id_number), exam.id, s.id_number);
  });
  tx();
  res.json({ created: students.length, students: students.map(mapStudentRow) });
});

// תמונת ברקוד לקוד מבחן
app.get('/api/exam-codes/:code/barcode', async (req, res) => {
  const row = db.prepare(`
    SELECT c.code, c.id_number, s.name, e.name AS exam_name
    FROM exam_codes c
    JOIN exams e ON e.id = c.exam_id
    JOIN students s ON s.id_number = c.id_number
    WHERE c.code = ?
  `).get(req.params.code);
  if (!row) return res.status(404).json({ error: 'קוד לא נמצא' });
  try {
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: row.code, scale: 3, height: 12, includetext: false });
    res.type('image/png');
    res.set('X-Student-Name', encodeURIComponent(row.name));
    res.send(png);
  } catch {
    res.status(500).json({ error: 'Barcode generation failed' });
  }
});

// סריקה/הזנת קוד → פרטי המבחן והתלמידה + ציון קיים
app.get('/api/exam-codes/:code', (req, res) => {
  const row = db.prepare(`
    SELECT c.code, c.exam_id, c.id_number, s.name AS student_name, s.track, s.year,
      e.name AS exam_name, e.exam_date, g.grade, g.graded_at
    FROM exam_codes c
    JOIN exams e ON e.id = c.exam_id
    JOIN students s ON s.id_number = c.id_number
    LEFT JOIN exam_grades g ON g.code = c.code
    WHERE c.code = ?
  `).get(req.params.code.trim());
  if (!row) return res.status(404).json({ error: 'ברקוד לא מוכר' });
  res.json(row);
});

// רישום/עדכון ציון לברקוד
app.put('/api/exam-codes/:code/grade', (req, res) => {
  const code = req.params.code.trim();
  const row = db.prepare('SELECT code FROM exam_codes WHERE code = ?').get(code);
  if (!row) return res.status(404).json({ error: 'ברקוד לא מוכר' });
  const grade = Number(req.body?.grade);
  if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
    return res.status(400).json({ error: 'ציון חייב להיות מספר בין 0 ל-100' });
  }
  db.prepare(`
    INSERT INTO exam_grades (code, grade, graded_by) VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET grade = excluded.grade, graded_by = excluded.graded_by, graded_at = datetime('now')
  `).run(code, grade, req.user?.id || null);
  res.json({ success: true, grade });
});

// ממוצעים: לפי תלמידה, מבחן, מסלול-שנה
app.get('/api/exams-stats/summary', (req, res) => {
  const byStudent = db.prepare(`
    SELECT s.id_number, s.name, s.track, s.year,
      COUNT(g.grade) AS graded, ROUND(AVG(g.grade),1) AS avg_grade,
      SUM(CASE WHEN g.grade IS NULL THEN 1 ELSE 0 END) AS missing
    FROM students s
    LEFT JOIN exam_codes c ON c.id_number = s.id_number
    LEFT JOIN exam_grades g ON g.code = c.code
    GROUP BY s.id_number
    ORDER BY s.name
  `).all().map((student) => ({
    ...student,
    track: splitTrackValues(student.track).join(' / '),
  }));
  const byExam = db.prepare(`
    SELECT e.id, e.name,
      (SELECT COUNT(*) FROM exam_codes c WHERE c.exam_id = e.id) AS codes_count,
      (SELECT COUNT(*) FROM exam_codes c JOIN exam_grades g ON g.code = c.code WHERE c.exam_id = e.id) AS graded_count,
      (SELECT ROUND(AVG(g.grade),1) FROM exam_codes c JOIN exam_grades g ON g.code = c.code WHERE c.exam_id = e.id) AS avg_grade
    FROM exams e ORDER BY e.created_at DESC
  `).all();
  res.json({ byStudent, byExam });
});

// כל המבחנים והציונים של תלמידה אחת (להצגה בדף התלמידה)
app.get('/api/students/:id_number/exams', (req, res) => {
  const rows = db.prepare(`
    SELECT e.id AS exam_id, e.name AS exam_name, e.exam_date, c.code, g.grade, g.graded_at
    FROM exam_codes c
    JOIN exams e ON e.id = c.exam_id
    LEFT JOIN exam_grades g ON g.code = c.code
    WHERE c.id_number = ?
    ORDER BY e.created_at DESC
  `).all(req.params.id_number);
  res.json(rows);
});

// ── Attendance / Schedule ─────────────────────────────────────

// Migration: add parallel and class_name columns to students
const studentColsCheck = db.prepare('PRAGMA table_info(students)').all().map(c => c.name);
if (!studentColsCheck.includes('parallel')) db.exec("ALTER TABLE students ADD COLUMN parallel TEXT");
if (!studentColsCheck.includes('class_name')) db.exec("ALTER TABLE students ADD COLUMN class_name TEXT");

db.exec(`
  UPDATE students
  SET
    year = CASE
      WHEN TRIM(COALESCE(year, '')) = '' THEN
        CASE
          WHEN TRIM(COALESCE(json_extract(extra_data, '$.כיתה'), '')) <> '' THEN json_extract(extra_data, '$.כיתה')
          WHEN TRIM(COALESCE(json_extract(extra_data, '$.class'), '')) <> '' THEN json_extract(extra_data, '$.class')
          ELSE year
        END
      ELSE year
    END,
    parallel = CASE
      WHEN TRIM(COALESCE(parallel, '')) = '' THEN
        CASE
          WHEN TRIM(COALESCE(json_extract(extra_data, '$.מקבילה'), '')) <> '' THEN json_extract(extra_data, '$.מקבילה')
          WHEN TRIM(COALESCE(json_extract(extra_data, '$.parallel'), '')) <> '' THEN json_extract(extra_data, '$.parallel')
          WHEN TRIM(COALESCE(json_extract(extra_data, '$.כיתה'), '')) <> '' THEN json_extract(extra_data, '$.כיתה')
          ELSE parallel
        END
      ELSE parallel
    END,
    class_name = CASE
      WHEN TRIM(COALESCE(year, '')) <> '' OR TRIM(COALESCE(parallel, '')) <> '' THEN (TRIM(COALESCE(year, '')) || TRIM(COALESCE(parallel, '')))
      ELSE class_name
    END
  WHERE TRIM(COALESCE(year, '')) = '' OR TRIM(COALESCE(parallel, '')) = '' OR TRIM(COALESCE(class_name, '')) = '';
`);

// Teachers table
db.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    subject TEXT,
    specialization TEXT,
    phone TEXT,
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const teacherColumnNames = db.prepare('PRAGMA table_info(teachers)').all().map(column => column.name);
if (!teacherColumnNames.includes('specialization')) {
  db.exec('ALTER TABLE teachers ADD COLUMN specialization TEXT');
}

// Schedule slots: one row per scheduled class lesson
// day_of_week: 0=ראשון, 1=שני, 2=שלישי, 3=רביעי, 4=חמישי
db.exec(`
  CREATE TABLE IF NOT EXISTS schedule_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    class_year TEXT NOT NULL,
    class_parallel TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 4),
    start_time TEXT NOT NULL,
    end_time TEXT,
    subject TEXT,
    week_start TEXT NOT NULL,
    series_id TEXT,
    change_scope TEXT,
    change_category TEXT,
    change_reason TEXT,
    change_from_teacher_id INTEGER,
    change_from_teacher_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS schedule_slots_week_idx ON schedule_slots(week_start);
  CREATE INDEX IF NOT EXISTS schedule_slots_teacher_idx ON schedule_slots(teacher_id);
`);

const scheduleUniqueIndexes = db.prepare('PRAGMA index_list(schedule_slots)').all()
  .filter(index => index.unique)
  .map(index => db.prepare(`PRAGMA index_info("${index.name.replace(/"/g, '""')}")`).all().map(column => column.name));
const hasLegacyScheduleUnique = scheduleUniqueIndexes.some(columns =>
  columns.join(',') === 'teacher_id,class_year,class_parallel,day_of_week,week_start'
);
if (hasLegacyScheduleUnique) {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN;
    CREATE TABLE schedule_slots_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_year TEXT NOT NULL,
      class_parallel TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 4),
      start_time TEXT NOT NULL,
      end_time TEXT,
      subject TEXT,
      week_start TEXT NOT NULL,
      series_id TEXT,
      change_scope TEXT,
      change_category TEXT,
      change_reason TEXT,
      change_from_teacher_id INTEGER,
      change_from_teacher_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO schedule_slots_new
      (id, teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, created_at)
      SELECT id, teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, created_at
      FROM schedule_slots;
    DROP TABLE schedule_slots;
    ALTER TABLE schedule_slots_new RENAME TO schedule_slots;
    CREATE INDEX schedule_slots_week_idx ON schedule_slots(week_start);
    CREATE INDEX schedule_slots_teacher_idx ON schedule_slots(teacher_id);
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}

const scheduleSlotColumns = db.prepare('PRAGMA table_info(schedule_slots)').all().map(column => column.name);
if (!scheduleSlotColumns.includes('series_id')) db.exec('ALTER TABLE schedule_slots ADD COLUMN series_id TEXT');
if (!scheduleSlotColumns.includes('change_scope')) db.exec('ALTER TABLE schedule_slots ADD COLUMN change_scope TEXT');
if (!scheduleSlotColumns.includes('change_category')) db.exec('ALTER TABLE schedule_slots ADD COLUMN change_category TEXT');
if (!scheduleSlotColumns.includes('change_reason')) db.exec('ALTER TABLE schedule_slots ADD COLUMN change_reason TEXT');
if (!scheduleSlotColumns.includes('change_from_teacher_id')) db.exec('ALTER TABLE schedule_slots ADD COLUMN change_from_teacher_id INTEGER');
if (!scheduleSlotColumns.includes('change_from_teacher_name')) db.exec('ALTER TABLE schedule_slots ADD COLUMN change_from_teacher_name TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS schedule_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
  );
`);
db.prepare('INSERT OR IGNORE INTO schedule_settings (setting_key, setting_value) VALUES (?, ?)')
  .run('school_year_end', '2027-08-31');

db.exec(`
  CREATE TABLE IF NOT EXISTS schedule_change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER,
    series_id TEXT,
    class_year TEXT NOT NULL,
    class_parallel TEXT NOT NULL,
    week_start TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    subject TEXT,
    action TEXT NOT NULL CHECK (action IN ('add', 'update', 'delete')),
    change_scope TEXT NOT NULL CHECK (change_scope IN ('once', 'permanent')),
    change_category TEXT NOT NULL,
    change_reason TEXT NOT NULL,
    from_teacher_id INTEGER,
    from_teacher_name TEXT,
    to_teacher_id INTEGER,
    to_teacher_name TEXT,
    start_time TEXT,
    end_time TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS schedule_change_log_week_idx ON schedule_change_log(week_start, action);
`);

// Attendance sessions: one per teacher-class-date event
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER REFERENCES schedule_slots(id) ON DELETE SET NULL,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    class_year TEXT NOT NULL,
    class_parallel TEXT NOT NULL,
    lesson_date TEXT NOT NULL,
    subject TEXT,
    start_time TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (teacher_id, class_year, class_parallel, lesson_date)
  );
  CREATE INDEX IF NOT EXISTS attendance_sessions_date_idx ON attendance_sessions(lesson_date);
`);

// Attendance records: per student per session
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    id_number TEXT NOT NULL REFERENCES students(id_number) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late')),
    recorded_by INTEGER REFERENCES users(id),
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (session_id, id_number)
  );
  CREATE INDEX IF NOT EXISTS attendance_records_session_idx ON attendance_records(session_id);
  CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(id_number);
`);

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];

// Helper: build attendance barcode string
function encodeAttendanceCode(teacherId, classYear, classParallel, date) {
  return `ATT-T${teacherId}-${classYear}${classParallel}-${date}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function getLastNameFromName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function compareByLastName(a, b) {
  const aLast = getLastNameFromName(a.name || a);
  const bLast = getLastNameFromName(b.name || b);
  const lastNameCompare = aLast.localeCompare(bLast, 'he', { numeric: true });
  if (lastNameCompare !== 0) return lastNameCompare;
  return String(a.name || a).localeCompare(String(b.name || b), 'he', { numeric: true });
}

// ── Teachers CRUD ──────────────────────────────────────────────
app.get('/api/teachers', (req, res) => {
  const q = String(req.query.q || '').trim();
  const sql = q
    ? 'SELECT * FROM teachers WHERE name LIKE ? OR subject LIKE ? ORDER BY name LIMIT 20'
    : 'SELECT * FROM teachers ORDER BY name';
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  const teachers = db.prepare(sql).all(...params);
  res.json(teachers);
});

// ייצוא רשימת מורות לאקסל — חייב להיות לפני /:id
app.get('/api/teachers/export', (req, res) => {
  const XLSX = require('xlsx');
  const teachers = db.prepare('SELECT name, subject, phone, email, active FROM teachers ORDER BY name').all();
  const rows = teachers.map(t => ({
    'שם': t.name,
    'מקצוע': t.subject || '',
    'טלפון': t.phone || '',
    'אימייל': t.email || '',
    'פעיל': t.active ? 'כן' : 'לא',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 26 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'מורות');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="teachers.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.get('/api/teachers/:id', (req, res) => {
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
  if (!teacher) return res.status(404).json({ error: 'מורה לא נמצאה' });
  res.json(teacher);
});

app.get('/api/teachers/profile', (req, res) => {
  const teacher = db.prepare('SELECT * FROM teachers ORDER BY id LIMIT 1').get();
  if (!teacher) return res.status(404).json({ error: 'מורה לא נמצאה' });

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart(today);
  const lessons = db.prepare(`
    SELECT s.*, t.name AS teacher_name, t.subject AS teacher_subject
    FROM schedule_slots s
    JOIN teachers t ON t.id = s.teacher_id
    WHERE s.teacher_id = ?
      AND s.week_start >= ?
      AND s.week_start <= ?
    ORDER BY s.week_start, s.day_of_week, s.start_time
  `).all(teacher.id, weekStart, addDays(weekStart, 7));

  res.json({ teacher, lessons: collectTeacherUpcomingLessons(lessons, today), week_start: weekStart });
});

app.get('/api/teachers/:id/profile', (req, res) => {
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
  if (!teacher) return res.status(404).json({ error: 'מורה לא נמצאה' });

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart(today);
  const lessons = db.prepare(`
    SELECT s.*, t.name AS teacher_name, t.subject AS teacher_subject
    FROM schedule_slots s
    JOIN teachers t ON t.id = s.teacher_id
    WHERE s.teacher_id = ?
      AND s.week_start >= ?
      AND s.week_start <= ?
    ORDER BY s.week_start, s.day_of_week, s.start_time
  `).all(teacher.id, weekStart, addDays(weekStart, 7));

  res.json({ teacher, lessons: collectTeacherUpcomingLessons(lessons, today), week_start: weekStart });
});

app.post('/api/teachers', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'שם המורה הוא שדה חובה' });
  const subject = String(req.body?.subject || '').trim() || null;
  const specialization = String(req.body?.specialization || '').trim() || null;
  const phone = String(req.body?.phone || '').trim() || null;
  const email = String(req.body?.email || '').trim() || null;
  try {
    const result = db.prepare('INSERT INTO teachers (name, subject, specialization, phone, email) VALUES (?, ?, ?, ?, ?)')
      .run(name, subject, specialization, phone, email);
    res.json({ id: result.lastInsertRowid, name, subject, specialization, phone, email });
  } catch {
    res.status(400).json({ error: 'מורה עם שם זה כבר קיימת' });
  }
});

app.put('/api/teachers/:id', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'שם המורה הוא שדה חובה' });
  const subject = String(req.body?.subject || '').trim() || null;
  const specialization = String(req.body?.specialization || '').trim() || null;
  const phone = String(req.body?.phone || '').trim() || null;
  const email = String(req.body?.email || '').trim() || null;
  const result = db.prepare('UPDATE teachers SET name=?, subject=?, specialization=?, phone=?, email=?, active=? WHERE id=?')
    .run(name, subject, specialization, phone, email, req.body?.active ?? 1, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'מורה לא נמצאה' });
  res.json({ success: true });
});

app.delete('/api/teachers', (req, res) => {
  try {
    const tx = db.transaction(() => {
      const attendanceSessionIds = db.prepare('SELECT id FROM attendance_sessions WHERE teacher_id IN (SELECT id FROM teachers)').all().map(r => r.id);
      if (attendanceSessionIds.length) {
        const placeholders = attendanceSessionIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM attendance_records WHERE session_id IN (${placeholders})`).run(...attendanceSessionIds);
      }

      db.prepare('DELETE FROM attendance_sessions WHERE teacher_id IN (SELECT id FROM teachers)').run();
      db.prepare('DELETE FROM schedule_slots WHERE teacher_id IN (SELECT id FROM teachers)').run();

      const result = db.prepare('DELETE FROM teachers').run();
      return { deleted: result.changes };
    });

    const result = tx();
    res.json({ success: true, deleted: result.deleted });
  } catch (e) {
    res.status(400).json({ error: 'לא ניתן למחוק את כל המורות: ' + (e instanceof Error ? e.message : String(e)) });
  }
});

app.delete('/api/teachers/:id', (req, res) => {
  try {
    const tx = db.transaction(() => {
      const attendanceSessionIds = db.prepare('SELECT id FROM attendance_sessions WHERE teacher_id = ?').all(req.params.id).map(r => r.id);
      if (attendanceSessionIds.length) {
        const placeholders = attendanceSessionIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM attendance_records WHERE session_id IN (${placeholders})`).run(...attendanceSessionIds);
      }

      db.prepare('DELETE FROM attendance_sessions WHERE teacher_id = ?').run(req.params.id);
      db.prepare('DELETE FROM schedule_slots WHERE teacher_id = ?').run(req.params.id);
      const result = db.prepare('DELETE FROM teachers WHERE id=?').run(req.params.id);
      return result.changes;
    });

    tx();
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'לא ניתן למחוק מורה: ' + (e instanceof Error ? e.message : String(e)) });
  }
});

// ── Day structure (lesson periods and breaks) ──────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS lesson_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_break INTEGER NOT NULL DEFAULT 0
  );
`);

// Seed default lesson periods if the table is empty
{
  const count = db.prepare('SELECT COUNT(*) AS c FROM lesson_periods').get();
  if (count.c === 0) {
    const insertPeriod = db.prepare('INSERT INTO lesson_periods (name, start_time, end_time, is_break) VALUES (?, ?, ?, ?)');
    const seedPeriods = db.transaction(() => {
      insertPeriod.run('שיעור ראשון',     '08:30', '09:50', 0);
      insertPeriod.run('שיעור שני',       '09:45', '10:35', 0);
      insertPeriod.run('הפסקת אוכל',      '10:35', '10:55', 1);
      insertPeriod.run('שיעור שלישי',     '10:55', '11:40', 0);
      insertPeriod.run('שיעור רביעי',     '11:40', '12:20', 0);
      insertPeriod.run('הפסקה',           '12:20', '12:30', 1);
      insertPeriod.run('שיעור חמישי',     '12:30', '13:15', 0);
      insertPeriod.run('הפסקת מנחה',      '13:15', '13:30', 1);
      insertPeriod.run('שיעור שישי',      '13:30', '14:10', 0);
      insertPeriod.run('שיעור שביעי',     '14:10', '14:50', 0);
      insertPeriod.run('שיעור שמיני',     '14:50', '15:30', 0);
    });
    seedPeriods();
  }
}

function readPeriodBody(body = {}) {
  const name = String(body.name || '').trim();
  const start = String(body.start_time || '').trim();
  const end = String(body.end_time || '').trim();
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!name) return { error: 'יש להזין שם לשיעור/הפסקה' };
  if (!timeRe.test(start) || !timeRe.test(end)) return { error: 'שעות לא תקינות' };
  if (end <= start) return { error: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' };
  return { value: [name, start, end, body.is_break ? 1 : 0] };
}

app.get('/api/schedule/periods', (req, res) => {
  res.json(db.prepare('SELECT * FROM lesson_periods ORDER BY start_time, id').all());
});

app.post('/api/schedule/periods', (req, res) => {
  const { value, error } = readPeriodBody(req.body);
  if (error) return res.status(400).json({ error });
  const r = db.prepare('INSERT INTO lesson_periods (name, start_time, end_time, is_break) VALUES (?, ?, ?, ?)').run(...value);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/schedule/periods/:id', (req, res) => {
  const { value, error } = readPeriodBody(req.body);
  if (error) return res.status(400).json({ error });
  const r = db.prepare('UPDATE lesson_periods SET name=?, start_time=?, end_time=?, is_break=? WHERE id=?').run(...value, req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'לא נמצא' });
  res.json({ success: true });
});

app.delete('/api/schedule/periods/:id', (req, res) => {
  db.prepare('DELETE FROM lesson_periods WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Schedule Slots CRUD ────────────────────────────────────────
app.get('/api/schedule/kodesh-availability', (req, res) => {
  res.json({ kodesh: KODESH_CUTOFFS, instruction: INSTRUCTION_WINDOWS });
});

app.get('/api/schedule/school-year-end', (req, res) => {
  res.json({ through_date: getSchoolYearEnd() });
});

app.put('/api/schedule/school-year-end', (req, res) => {
  const throughDate = String(req.body?.through_date || '');
  const parsedDate = new Date(`${throughDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(throughDate) || Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== throughDate) {
    return res.status(400).json({ error: 'יש לבחור תאריך סיום תקין' });
  }
  if (throughDate < todayInIsrael()) return res.status(400).json({ error: 'תאריך הסיום צריך להיות היום או בעתיד' });
  db.prepare(`
    INSERT INTO schedule_settings (setting_key, setting_value) VALUES ('school_year_end', ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
  `).run(throughDate);
  res.json({ through_date: throughDate });
});

app.get('/api/schedule', (req, res) => {
  const { week } = req.query;
  const weekStart = week || getWeekStart(new Date().toISOString().split('T')[0]);
  const slots = db.prepare(`
    SELECT s.*, t.name AS teacher_name, t.subject AS teacher_subject
    FROM schedule_slots s
    JOIN teachers t ON t.id = s.teacher_id
    WHERE s.week_start = ?
    ORDER BY s.class_year, s.class_parallel, s.day_of_week, s.start_time
  `).all(weekStart);
  const events = db.prepare(`
    SELECT id, title, event_date, category, all_day, start_time, end_time, class_scope, class_year, class_parallel
    FROM calendar_events
    WHERE event_date >= ? AND event_date <= ?
  `).all(weekStart, addDays(weekStart, 4));
  res.json({ week_start: weekStart, slots, events });
});

function validateConfiguredKodeshSlot(slot) {
  const availability = validateKodeshSlot(slot);
  if (!availability.valid) return availability;

  const period = db.prepare(`
    SELECT 1 FROM lesson_periods
    WHERE is_break = 0 AND start_time = ? AND end_time = ?
  `).get(slot.start_time, slot.end_time);
  if (!period) {
    return { valid: false, error: 'יש לבחור שיעור מתוך שעות מערכת השעות' };
  }
  return availability;
}

function findTeacherClassDayConflict({ teacher_id, class_year, class_parallel, day_of_week, week_start, excludeId = 0 }) {
  return db.prepare(`
    SELECT 1 FROM schedule_slots
    WHERE week_start = ? AND teacher_id = ? AND class_year = ? AND class_parallel = ?
      AND day_of_week = ? AND id != ?
  `).get(week_start, Number(teacher_id), String(class_year), String(class_parallel), Number(day_of_week), Number(excludeId));
}

function scheduleConflictConfirmation(conflicts) {
  const messages = [];
  if (conflicts.has('sameClassDay')) messages.push('למורה כבר מופיע שיעור בכיתה זו היום');
  if (conflicts.has('teacher')) messages.push('השיעור כבר מופיע בכיתה אחרת באותה שעה');
  return {
    confirmationRequired: true,
    conflicts: Array.from(conflicts),
    message: `${messages.join(' וגם ')}. האם את בטוחה שברצונך לשמור?`
  };
}

function scheduleChangeInput(body) {
  const change = {
    scope: body?.change_scope,
    category: body?.change_category,
    reason: String(body?.change_reason || '').trim()
  };
  return { ...change, error: validateScheduleChange(change) };
}

function getSchoolYearEnd() {
  return db.prepare('SELECT setting_value FROM schedule_settings WHERE setting_key = ?')
    .get('school_year_end')?.setting_value || '2027-08-31';
}

function todayInIsrael() {
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function currentScheduleWeek() {
  return getWeekStart(todayInIsrael());
}

function weeksForScheduleChange(weekStart, dayOfWeek, scope) {
  return scheduleOccurrenceWeeks({
    startWeek: weekStart,
    dayOfWeek,
    scope,
    currentWeek: currentScheduleWeek(),
    throughDate: getSchoolYearEnd()
  });
}

function teacherName(teacherId) {
  if (!teacherId) return null;
  return db.prepare('SELECT name FROM teachers WHERE id = ?').get(teacherId)?.name || null;
}

function recordScheduleChange({ slot, action, change, fromTeacherId, toTeacherId, userId }) {
  db.prepare(`
    INSERT INTO schedule_change_log (
      slot_id, series_id, class_year, class_parallel, week_start, day_of_week, subject,
      action, change_scope, change_category, change_reason,
      from_teacher_id, from_teacher_name, to_teacher_id, to_teacher_name,
      start_time, end_time, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slot.id || null, slot.series_id || null, slot.class_year, slot.class_parallel,
    slot.week_start, slot.day_of_week, slot.subject || null, action, change.scope,
    change.category, change.reason, fromTeacherId || null, teacherName(fromTeacherId),
    toTeacherId || null, teacherName(toTeacherId), slot.start_time || null,
    slot.end_time || null, userId || null
  );
}

app.post('/api/schedule', (req, res) => {
  const { teacher_id, day_of_week, start_time, end_time, subject, week_start, allow_conflicts } = req.body || {};
  const classes = Array.isArray(req.body?.classes) ? req.body.classes : [{
    class_year: req.body?.class_year,
    class_parallel: req.body?.class_parallel
  }];
  if (!teacher_id || day_of_week == null || !start_time || !week_start ||
      !classes.length || classes.some(c => !c?.class_year || !c?.class_parallel)) {
    return res.status(400).json({ error: 'שדות חסרים: מורה, כיתה, יום, שעה, שבוע' });
  }
  const changeScope = req.body?.change_scope;
  if (!['once', 'permanent'].includes(changeScope)) {
    return res.status(400).json({ error: 'יש לבחור אם השיעור הוא רק לשבוע זה או קבוע' });
  }
  if (changeScope === 'permanent' && week_start < currentScheduleWeek()) {
    return res.status(400).json({ error: 'הוספה קבועה מתחילה מהשבוע הנוכחי או משבוע עתידי' });
  }
  if (changeScope === 'permanent' && addDays(week_start, Number(day_of_week)) > getSchoolYearEnd()) {
    return res.status(400).json({ error: 'תאריך ההתחלה מאוחר מסוף שנת הלימודים' });
  }
  const weeks = weeksForScheduleChange(week_start, day_of_week, changeScope);
  const classKeys = classes.map(c => `${String(c.class_year)}_${String(c.class_parallel)}`);
  if (new Set(classKeys).size !== classKeys.length) {
    return res.status(400).json({ error: 'כיתה נבחרה יותר מפעם אחת' });
  }
  const conflicts = new Set();
  for (const classInfo of classes) {
    for (const targetWeek of weeks) {
      const lessonDate = addDays(targetWeek, Number(day_of_week));
      const eventConflict = db.prepare(`
        SELECT * FROM calendar_events
        WHERE event_date = ? AND source_sheet = 'ידני' AND class_scope != 'none'
      `).all(lessonDate).find(event => calendarEventAffectsLesson(
        event, lessonDate, String(classInfo.class_year), String(classInfo.class_parallel), start_time, end_time
      ));
      if (eventConflict) return res.status(409).json({ error: `לא ניתן להוסיף שיעור בזמן האירוע "${eventConflict.title}"` });

      const availability = validateConfiguredKodeshSlot({ class_year: classInfo.class_year, day_of_week, start_time, end_time });
      if (!availability.valid) return res.status(400).json({ error: availability.error });
      if (findClassTimeConflict(db, {
        class_year: classInfo.class_year, class_parallel: classInfo.class_parallel,
        day_of_week, start_time, end_time, week_start: targetWeek
      })) {
        return res.status(409).json({ error: `כבר קיים שיעור לכיתה ${classInfo.class_year}${classInfo.class_parallel} בשעה זו בשבוע ${targetWeek}` });
      }
      if (findTeacherClassDayConflict({
        teacher_id, class_year: classInfo.class_year, class_parallel: classInfo.class_parallel,
        day_of_week, week_start: targetWeek
      })) conflicts.add('sameClassDay');
      const teacherConflicts = findTeacherTimeConflicts(db, { teacher_id, day_of_week, start_time, end_time, week_start: targetWeek });
      if (teacherConflicts.some(teacherConflict =>
        String(teacherConflict.class_year) !== String(classInfo.class_year) ||
        String(teacherConflict.class_parallel) !== String(classInfo.class_parallel)
      )) conflicts.add('teacher');
    }
  }
  if (conflicts.size && allow_conflicts !== true) {
    return res.status(409).json(scheduleConflictConfirmation(conflicts));
  }

  try {
    const insertSlot = db.prepare(`
      INSERT INTO schedule_slots (
        teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start,
        series_id, change_scope, change_category, change_reason, change_from_teacher_id, change_from_teacher_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAll = db.transaction(() => {
      const ids = [];
      for (const classInfo of classes) {
        const seriesId = randomBytes(12).toString('hex');
        for (const targetWeek of weeks) {
          const result = insertSlot.run(
            teacher_id, String(classInfo.class_year), String(classInfo.class_parallel), Number(day_of_week),
            start_time, end_time || null, subject || null, targetWeek, seriesId,
            null, null, null, null, null
          );
          ids.push(result.lastInsertRowid);
        }
      }
      return ids;
    });
    const ids = insertAll();
    res.json({ ids, count: ids.length, weeks: weeks.length });
  } catch {
    res.status(400).json({ error: 'שמירת השיעור נכשלה' });
  }
});

app.post('/api/schedule/copy-school-year', (req, res) => {
  const sourceDate = String(req.body?.source_week || '');
  const throughDate = String(req.body?.through_date || getSchoolYearEnd());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
    return res.status(400).json({ error: 'יש לבחור תאריך תקין לשבוע המקור' });
  }
  const parsedEndDate = new Date(`${throughDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(throughDate) || Number.isNaN(parsedEndDate.getTime()) ||
      parsedEndDate.toISOString().slice(0, 10) !== throughDate || throughDate < todayInIsrael()) {
    return res.status(400).json({ error: 'יש לבחור תאריך סיום תקין בעתיד' });
  }
  db.prepare(`
    INSERT INTO schedule_settings (setting_key, setting_value) VALUES ('school_year_end', ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
  `).run(throughDate);
  const sourceWeek = getWeekStart(sourceDate);
  if (sourceWeek > throughDate) return res.status(400).json({ error: 'שבוע המקור חייב להיות לפני סוף שנת הלימודים' });

  const today = todayInIsrael();
  const firstWeek = getWeekStart(today);
  if (firstWeek > throughDate) return res.status(400).json({ error: 'שנת הלימודים כבר הסתיימה' });

  try {
    const result = copyScheduleAcrossYear(db, {
      sourceWeek,
      firstWeek,
      throughDate,
      validateSlot: slot => validateConfiguredKodeshSlot(slot).valid,
      createSeriesId: () => randomBytes(12).toString('hex')
    });
    if (result.reason === 'source_empty') return res.status(404).json({ error: 'לא נמצאו שיעורים בשבוע המקור' });
    if (result.reason === 'source_has_one_time_changes') {
      return res.status(400).json({ error: 'שבוע המקור כולל שינויים חד־פעמיים; בחרי שבוע בסיס אחר' });
    }
    res.json({ ...result, source_week: sourceWeek, through_date: throughDate });
  } catch (error) {
    console.error('School-year schedule copy failed:', error);
    res.status(500).json({ error: 'שכפול המערכת לשנת הלימודים נכשל' });
  }
});

// Copy previous week's schedule to a new week
app.post('/api/schedule/copy-week', (req, res) => {
  const { from_week, to_week } = req.body || {};
  if (!from_week || !to_week) return res.status(400).json({ error: 'חסרים פרמטרים: from_week, to_week' });
  const change = scheduleChangeInput({ ...req.body, change_scope: 'once' });
  if (change.error) return res.status(400).json({ error: change.error });
  const existing = db.prepare('SELECT COUNT(*) AS c FROM schedule_slots WHERE week_start = ?').get(to_week);
  if (existing.c > 0) return res.status(400).json({ error: 'שבוע היעד כבר מכיל שיעורים' });

  const result = copyScheduleWeekIfEmpty(db, {
    fromWeek: from_week,
    toWeek: to_week,
    validateSlot: slot => validateConfiguredKodeshSlot(slot).valid,
    createSeriesId: () => randomBytes(12).toString('hex'),
    onCopied: slot => {
      db.prepare(`UPDATE schedule_slots SET change_scope = 'once', change_category = ?, change_reason = ? WHERE id = ?`)
        .run(change.category, change.reason, slot.id);
      recordScheduleChange({
        slot, action: 'add', change, fromTeacherId: slot.teacher_id,
        toTeacherId: slot.teacher_id, userId: req.user?.id
      });
    }
  });
  if (result.reason === 'source_empty') return res.status(404).json({ error: 'לא נמצאו שיעורים בשבוע המקור' });
  res.json({ copied: result.copied, skipped: result.skipped, to_week });
});

app.put('/api/schedule/:id', (req, res) => {
  const { teacher_id, start_time, end_time, subject, allow_conflicts } = req.body || {};
  const change = scheduleChangeInput(req.body);
  const current = db.prepare('SELECT * FROM schedule_slots WHERE id=?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'שיעור לא נמצא' });
  if (change.error) return res.status(400).json({ error: change.error });
  const { class_year, class_parallel, day_of_week } = current;
  if (change.scope === 'permanent' && current.week_start < currentScheduleWeek()) {
    return res.status(400).json({ error: 'שינוי קבוע מתחיל מהשבוע הנוכחי; בחרי שיעור מהשבוע הנוכחי או משבוע עתידי' });
  }
  const seriesId = current.series_id || randomBytes(12).toString('hex');
  let targets = [current];
  if (change.scope === 'permanent') {
    const planned = collectFutureScheduleOccurrences(db, {
      sourceSlot: current,
      seriesId,
      weeks: weeksForScheduleChange(current.week_start, current.day_of_week, change.scope)
    });
    if (planned.error) return res.status(409).json({ error: planned.error });
    targets = planned.targets;
  }
  const conflicts = new Set();
  for (const target of targets) {
    const targetDate = addDays(target.week_start, Number(target.day_of_week));
    const eventConflict = db.prepare(`
      SELECT * FROM calendar_events
      WHERE event_date = ? AND source_sheet = 'ידני' AND class_scope != 'none'
    `).all(targetDate).find(event => calendarEventAffectsLesson(
      event, targetDate, target.class_year, target.class_parallel, start_time, end_time
    ));
    if (eventConflict) return res.status(409).json({ error: `לא ניתן לקבוע שיעור בזמן האירוע "${eventConflict.title}" בתאריך ${targetDate}` });
    const availability = validateConfiguredKodeshSlot({ class_year: target.class_year, day_of_week: target.day_of_week, start_time, end_time });
    if (!availability.valid) return res.status(400).json({ error: availability.error });
    if (findClassTimeConflict(db, {
      class_year: target.class_year, class_parallel: target.class_parallel,
      day_of_week: target.day_of_week, start_time, end_time,
      week_start: target.week_start, excludeId: target.id || 0
    })) {
      return res.status(409).json({ error: `כבר קיים שיעור לכיתה ${target.class_year}${target.class_parallel} בשעה זו בשבוע ${target.week_start}` });
    }
    if (findTeacherClassDayConflict({
      teacher_id, class_year: target.class_year, class_parallel: target.class_parallel,
      day_of_week: target.day_of_week, week_start: target.week_start, excludeId: target.id || 0
    })) conflicts.add('sameClassDay');
    const teacherConflicts = findTeacherTimeConflicts(db, {
      teacher_id, day_of_week: target.day_of_week, start_time, end_time,
      week_start: target.week_start, excludeId: target.id || 0
    });
    if (teacherConflicts.some(teacherConflict =>
      String(teacherConflict.class_year) !== String(target.class_year) ||
      String(teacherConflict.class_parallel) !== String(target.class_parallel)
    )) conflicts.add('teacher');
  }
  if (conflicts.size && allow_conflicts !== true) {
    return res.status(409).json(scheduleConflictConfirmation(conflicts));
  }
  const update = db.prepare(`
    UPDATE schedule_slots SET teacher_id=?, start_time=?, end_time=?, subject=?, series_id=?,
      change_scope=?, change_category=?, change_reason=?, change_from_teacher_id=?, change_from_teacher_name=?
    WHERE id=?
  `);
  const insert = db.prepare(`
    INSERT INTO schedule_slots (
      teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject,
      week_start, series_id, change_scope, change_category, change_reason,
      change_from_teacher_id, change_from_teacher_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => targets.forEach(target => {
    let slotId = target.id;
    const occurrenceChange = occurrenceChangeMetadata({
      change, changedWeekStart: current.week_start, occurrenceWeekStart: target.week_start,
      fromTeacherId: target.teacher_id, fromTeacherName: teacherName(target.teacher_id)
    });
    if (target.isNewOccurrence) {
      slotId = insert.run(
        teacher_id, target.class_year, target.class_parallel, target.day_of_week,
        start_time, end_time, subject || null, target.week_start, seriesId, occurrenceChange.change_scope,
        occurrenceChange.change_category, occurrenceChange.change_reason,
        occurrenceChange.change_from_teacher_id, occurrenceChange.change_from_teacher_name
      ).lastInsertRowid;
    } else {
      update.run(teacher_id, start_time, end_time, subject || null, seriesId, occurrenceChange.change_scope,
        occurrenceChange.change_category, occurrenceChange.change_reason,
        occurrenceChange.change_from_teacher_id, occurrenceChange.change_from_teacher_name, target.id);
    }
    recordScheduleChange({
      slot: { ...target, id: slotId, series_id: seriesId, start_time, end_time, subject },
      action: 'update', change, fromTeacherId: target.teacher_id, toTeacherId: teacher_id,
      userId: req.user?.id
    });
  }))();
  res.json({ success: true, updated: targets.length });
});

app.delete('/api/schedule/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM schedule_slots WHERE id=?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'שיעור לא נמצא' });
  const change = scheduleChangeInput(req.body);
  if (change.error) return res.status(400).json({ error: change.error });
  if (change.scope === 'permanent' && current.week_start < currentScheduleWeek()) {
    return res.status(400).json({ error: 'מחיקה קבועה מתחילה מהשבוע הנוכחי; בחרי שיעור מהשבוע הנוכחי או משבוע עתידי' });
  }
  if (change.scope === 'permanent' && !current.series_id) {
    return res.status(400).json({ error: 'יש להשלים תחילה את המערכת לכל השנה כדי למחוק את כל ההופעות' });
  }
  const targets = change.scope === 'permanent' && current.series_id
    ? db.prepare('SELECT * FROM schedule_slots WHERE series_id = ? AND week_start >= ? AND week_start <= ? ORDER BY week_start')
      .all(current.series_id, current.week_start, getSchoolYearEnd())
      .filter(target => addDays(target.week_start, Number(target.day_of_week)) <= getSchoolYearEnd())
    : [current];
  db.transaction(() => targets.forEach(target => {
    recordScheduleChange({ slot: target, action: 'delete', change, fromTeacherId: target.teacher_id, userId: req.user?.id });
    db.prepare('DELETE FROM schedule_slots WHERE id=?').run(target.id);
  }))();
  res.json({ success: true, deleted: targets.length });
});

// Delete entire week
app.delete('/api/schedule/week/:week_start', (req, res) => {
  const change = scheduleChangeInput({ ...req.body, change_scope: 'once' });
  if (change.error) return res.status(400).json({ error: change.error });
  const slots = db.prepare('SELECT * FROM schedule_slots WHERE week_start=?').all(req.params.week_start);
  db.transaction(() => slots.forEach(slot => {
    recordScheduleChange({ slot, action: 'delete', change, fromTeacherId: slot.teacher_id, userId: req.user?.id });
    db.prepare('DELETE FROM schedule_slots WHERE id=?').run(slot.id);
  }))();
  res.json({ deleted: slots.length });
});

// ── Weekly Sheets – PDF Data ───────────────────────────────────
// Returns JSON with all data needed to render the printable sheets
app.get('/api/attendance/weekly-sheets', (req, res) => {
  const { week } = req.query;
  const weekStart = week || getWeekStart(new Date().toISOString().split('T')[0]);

  // Get all slots for this week grouped by teacher then by class
  const slots = db.prepare(`
    SELECT s.*, t.name AS teacher_name, t.subject AS teacher_subject
    FROM schedule_slots s
    JOIN teachers t ON t.id = s.teacher_id
    WHERE s.week_start = ?
    ORDER BY t.name, s.class_year, s.class_parallel, s.day_of_week
  `).all(weekStart);

  if (!slots.length) return res.json({ week_start: weekStart, sheets: [], changes: [] });

  // Build date for each day: weekStart + day_of_week
  function slotDate(slot) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + slot.day_of_week);
    return d.toISOString().split('T')[0];
  }

  // Group: teacher → class → days
  const teacherMap = new Map();
  const activeSlots = [];
  for (const slot of slots) {
    const lessonDate = slotDate(slot);
    const cancelledByEvent = db.prepare(`
      SELECT * FROM calendar_events
      WHERE event_date = ? AND source_sheet = 'ידני' AND class_scope != 'none'
    `).all(lessonDate).some(event => calendarEventAffectsLesson(
      event, lessonDate, slot.class_year, slot.class_parallel, slot.start_time, slot.end_time
    ));
    if (cancelledByEvent) continue;
    activeSlots.push(slot);
    if (!teacherMap.has(slot.teacher_id)) {
      teacherMap.set(slot.teacher_id, {
        teacher_id: slot.teacher_id,
        teacher_name: slot.teacher_name,
        classes: new Map()
      });
    }
    const teacher = teacherMap.get(slot.teacher_id);
    const classKey = `${slot.class_year}${slot.class_parallel}`;
    if (!teacher.classes.has(classKey)) {
      teacher.classes.set(classKey, {
        class_year: slot.class_year,
        class_parallel: slot.class_parallel,
        class_name: `${slot.class_year}${slot.class_parallel}`,
        days: []
      });
    }
    const cls = teacher.classes.get(classKey);
    cls.days.push({
      slot_id: slot.id,
      day_of_week: slot.day_of_week,
      day_name: DAYS_HE[slot.day_of_week],
      lesson_date: lessonDate,
      start_time: slot.start_time,
      end_time: slot.end_time,
      subject: slot.subject || slot.teacher_subject || '',
      barcode: encodeAttendanceCode(slot.teacher_id, slot.class_year, slot.class_parallel, lessonDate)
    });

    // Get students for this class
    teacher.classes.get(classKey)._studentsLoaded = true;
  }

  // Load students per class
  const sheets = [];
  for (const teacher of teacherMap.values()) {
    for (const cls of teacher.classes.values()) {
      const students = db.prepare(`
        SELECT id_number, name
        FROM students
        WHERE year = ? AND parallel = ?
      `).all(cls.class_year, cls.class_parallel).sort(compareByLastName);

      const studentBarcodes = students.map(s => ({
        id_number: s.id_number,
        name: s.name,
        barcode: `STU-${s.id_number}`
      }));

      sheets.push({
        teacher_id: teacher.teacher_id,
        teacher_name: teacher.teacher_name,
        class_year: cls.class_year,
        class_parallel: cls.class_parallel,
        class_name: cls.class_name,
        week_start: weekStart,
        days: cls.days,
        students: studentBarcodes
      });
    }
  }

  const changes = activeSlots.filter(slot => slot.change_reason).map(slot => {
    const lessonDate = slotDate(slot);
    const students = db.prepare(`
      SELECT id_number, name FROM students WHERE year = ? AND parallel = ?
    `).all(slot.class_year, slot.class_parallel).sort(compareByLastName).map(student => ({
      ...student, barcode: `STU-${student.id_number}`
    }));
    return {
      changed_slot_id: slot.id,
      teacher_id: slot.teacher_id,
      teacher_name: slot.teacher_name,
      class_year: slot.class_year,
      class_parallel: slot.class_parallel,
      class_name: `${slot.class_year}${slot.class_parallel}`,
      week_start: weekStart,
      change_category: slot.change_category,
      change_reason: slot.change_reason,
      change_from_teacher_name: slot.change_from_teacher_name,
      days: [{
        slot_id: slot.id,
        day_of_week: slot.day_of_week,
        day_name: DAYS_HE[slot.day_of_week],
        lesson_date: lessonDate,
        start_time: slot.start_time,
        end_time: slot.end_time,
        subject: slot.subject || slot.teacher_subject || '',
        barcode: encodeAttendanceCode(slot.teacher_id, slot.class_year, slot.class_parallel, lessonDate)
      }],
      students
    };
  });
  res.json({ week_start: weekStart, sheets, changes });
});

// ── Attendance Sessions CRUD ───────────────────────────────────

// Resolve or create a session from a scanned attendance barcode
// barcode format: ATT-T{teacherId}-{year}{parallel}-{date}
app.post('/api/attendance/scan-session', (req, res) => {
  const { barcode } = req.body || {};
  if (!barcode) return res.status(400).json({ error: 'ברקוד חסר' });

  const match = String(barcode).match(/^ATT-T(\d+)-([^-]+)-(\d{4}-\d{2}-\d{2})$/);
  if (!match) return res.status(400).json({ error: 'ברקוד לא מוכר — פורמט שגוי' });

  const [, teacherIdStr, classFull, lessonDate] = match;
  const teacherId = Number(teacherIdStr);

  // Split class into year + parallel (year = 'ה'/'ו', parallel = digits)
  const classMatch = classFull.match(/^([\u05d0-\u05ea]+)(\d+)$/);
  if (!classMatch) return res.status(400).json({ error: 'ברקוד לא מוכר — פורמט כיתה שגוי' });
  const [, classYear, classParallel] = classMatch;

  const teacher = db.prepare('SELECT * FROM teachers WHERE id=?').get(teacherId);
  if (!teacher) return res.status(404).json({ error: 'מורה לא נמצאה' });

  // Find matching slot for subject/time info
  const weekStart = getWeekStart(lessonDate);
  const dayOfWeek = new Date(lessonDate).getDay();
  const slot = db.prepare(`
    SELECT * FROM schedule_slots
    WHERE teacher_id=? AND class_year=? AND class_parallel=? AND day_of_week=? AND week_start=?
  `).get(teacherId, classYear, classParallel, dayOfWeek, weekStart);

  const cancelledEvent = db.prepare(`
    SELECT * FROM calendar_events
    WHERE event_date = ? AND source_sheet = 'ידני' AND class_scope != 'none'
  `).all(lessonDate).find(event => calendarEventAffectsLesson(
    event, lessonDate, classYear, classParallel, slot?.start_time, slot?.end_time
  ));
  if (cancelledEvent) {
    return res.status(409).json({ error: `אין שיעור בתאריך זה: ${cancelledEvent.title}` });
  }

  // Get or create session
  let session = db.prepare(`
    SELECT * FROM attendance_sessions
    WHERE teacher_id=? AND class_year=? AND class_parallel=? AND lesson_date=?
  `).get(teacherId, classYear, classParallel, lessonDate);

  if (!session) {
    const result = db.prepare(`
      INSERT INTO attendance_sessions (slot_id, teacher_id, class_year, class_parallel, lesson_date, subject, start_time, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(slot?.id || null, teacherId, classYear, classParallel, lessonDate,
           slot?.subject || teacher.subject || null,
           slot?.start_time || null, req.user?.id || null);
    session = db.prepare('SELECT * FROM attendance_sessions WHERE id=?').get(result.lastInsertRowid);
  }

  // Count students in class
  const studentCount = db.prepare(`SELECT COUNT(*) AS c FROM students WHERE year=? AND parallel=?`).get(classYear, classParallel).c;

  // Existing records
  const records = db.prepare(`
    SELECT r.id_number, r.status, s.name
    FROM attendance_records r
    JOIN students s ON s.id_number = r.id_number
    WHERE r.session_id=?
  `).all(session.id);

  res.json({
    session,
    teacher,
    class_name: `${classYear}${classParallel}`,
    lesson_date: lessonDate,
    student_count: studentCount,
    records,
    subject: session.subject || '',
    start_time: session.start_time || ''
  });
});

// Get session details with full student list
app.get('/api/attendance/sessions/:id', (req, res) => {
  const session = db.prepare(`
    SELECT s.*, t.name AS teacher_name
    FROM attendance_sessions s
    JOIN teachers t ON t.id = s.teacher_id
    WHERE s.id=?
  `).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'סשן לא נמצא' });

  const students = db.prepare(`
    SELECT st.id_number, st.name,
      COALESCE(r.status, 'present') AS status,
      r.recorded_at
    FROM students st
    LEFT JOIN attendance_records r ON r.id_number = st.id_number AND r.session_id = ?
    WHERE st.year = ? AND st.parallel = ?
  `).all(session.id, session.class_year, session.class_parallel).sort(compareByLastName);

  res.json({ session, students });
});

// Record absent students from barcode scan
app.post('/api/attendance/sessions/:id/absent', (req, res) => {
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id=?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'סשן לא נמצא' });
  if (session.locked) return res.status(400).json({ error: 'הסשן נעול ולא ניתן לעדכון' });

  const { id_number } = req.body || {};
  if (!id_number) return res.status(400).json({ error: 'מספר זהות חסר' });

  const student = db.prepare('SELECT id_number, name FROM students WHERE id_number=?').get(String(id_number));
  if (!student) return res.status(404).json({ error: 'תלמידה לא נמצאה' });

  db.prepare(`
    INSERT INTO attendance_records (session_id, id_number, status, recorded_by)
    VALUES (?, ?, 'absent', ?)
    ON CONFLICT(session_id, id_number) DO UPDATE SET status='absent', recorded_by=excluded.recorded_by, recorded_at=datetime('now')
  `).run(session.id, student.id_number, req.user?.id || null);

  res.json({ success: true, id_number: student.id_number, name: student.name, status: 'absent' });
});

// Record late students from barcode scan
app.post('/api/attendance/sessions/:id/late', (req, res) => {
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id=?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'סשן לא נמצא' });
  if (session.locked) return res.status(400).json({ error: 'הסשן נעול ולא ניתן לעדכון' });

  const { id_number } = req.body || {};
  if (!id_number) return res.status(400).json({ error: 'מספר זהות חסר' });

  const student = db.prepare('SELECT id_number, name FROM students WHERE id_number=?').get(String(id_number));
  if (!student) return res.status(404).json({ error: 'תלמידה לא נמצאה' });

  db.prepare(`
    INSERT INTO attendance_records (session_id, id_number, status, recorded_by)
    VALUES (?, ?, 'late', ?)
    ON CONFLICT(session_id, id_number) DO UPDATE SET status='late', recorded_by=excluded.recorded_by, recorded_at=datetime('now')
  `).run(session.id, student.id_number, req.user?.id || null);

  res.json({ success: true, id_number: student.id_number, name: student.name, status: 'late' });
});

// Lock/finalize a session (mark as done)
app.post('/api/attendance/sessions/:id/lock', (req, res) => {
  db.prepare('UPDATE attendance_sessions SET locked=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Bulk update: submit full session results at once
app.put('/api/attendance/sessions/:id/records', (req, res) => {
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id=?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'סשן לא נמצא' });

  const { records } = req.body || {};
  if (!Array.isArray(records)) return res.status(400).json({ error: 'רשימת רשומות חסרה' });

  const upsert = db.prepare(`
    INSERT INTO attendance_records (session_id, id_number, status, recorded_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, id_number) DO UPDATE SET status=excluded.status, recorded_by=excluded.recorded_by, recorded_at=datetime('now')
  `);
  const del = db.prepare('DELETE FROM attendance_records WHERE session_id=? AND id_number=?');

  const tx = db.transaction(() => {
    for (const r of records) {
      if (!r.id_number || !r.status) continue;
      if (r.status === 'present') {
        del.run(session.id, r.id_number); // present = no record needed
      } else {
        upsert.run(session.id, r.id_number, r.status, req.user?.id || null);
      }
    }
  });
  tx();
  db.prepare('UPDATE attendance_sessions SET locked=1 WHERE id=?').run(session.id);
  res.json({ success: true });
});

// ── Attendance Stats per student ───────────────────────────────
app.get('/api/students/:id_number/attendance', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id_number=?').get(req.params.id_number);
  if (!student) return res.status(404).json({ error: 'תלמידה לא נמצאה' });

  // All sessions the student should have attended (her class)
  const sessions = db.prepare(`
    SELECT s.id, s.lesson_date, s.subject, s.class_year, s.class_parallel,
      t.name AS teacher_name,
      COALESCE(r.status, 'present') AS status
    FROM attendance_sessions s
    JOIN teachers t ON t.id = s.teacher_id
    LEFT JOIN attendance_records r ON r.session_id = s.id AND r.id_number = ?
    WHERE s.class_year = ? AND s.class_parallel = ?
    ORDER BY s.lesson_date DESC
  `).all(student.id_number, student.year, student.parallel || '');

  // Summarize by subject
  const bySubject = {};
  for (const sess of sessions) {
    const key = sess.subject || 'כללי';
    if (!bySubject[key]) bySubject[key] = { subject: key, teacher_name: sess.teacher_name, total: 0, absent: 0, late: 0 };
    bySubject[key].total++;
    if (sess.status === 'absent') bySubject[key].absent++;
    if (sess.status === 'late') bySubject[key].late++;
  }

  const summary = Object.values(bySubject);
  const totalSessions = sessions.length;
  const totalAbsent = sessions.filter(s => s.status === 'absent').length;
  const totalLate = sessions.filter(s => s.status === 'late').length;

  res.json({
    student: { id_number: student.id_number, name: student.name, class_year: student.year, class_parallel: student.parallel },
    total_sessions: totalSessions,
    total_absent: totalAbsent,
    total_late: totalLate,
    attendance_pct: totalSessions > 0 ? Math.round((1 - totalAbsent / totalSessions) * 100) : 100,
    by_subject: summary,
    sessions
  });
});

// Barcode image for an attendance session slot
app.get('/api/attendance/barcode', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code חסר' });
  try {
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: String(code), scale: 3, height: 12, includetext: false });
    res.type('image/png');
    res.send(png);
  } catch {
    res.status(500).json({ error: 'שגיאה ביצירת הברקוד' });
  }
});

// Barcode image for a student (student barcode = STU-{id_number})
app.get('/api/attendance/student-barcode/:id_number', async (req, res) => {
  const code = `STU-${req.params.id_number}`;
  try {
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: code, scale: 3, height: 12, includetext: false });
    res.type('image/png');
    res.send(png);
  } catch {
    res.status(500).json({ error: 'שגיאה ביצירת הברקוד' });
  }
});

// Update student's parallel (class number)
app.put('/api/students/:id_number/parallel', (req, res) => {
  const parallel = String(req.body?.parallel || '').trim();
  const result = db.prepare('UPDATE students SET parallel=? WHERE id_number=?').run(parallel || null, req.params.id_number);
  if (!result.changes) return res.status(404).json({ error: 'תלמידה לא נמצאה' });
  res.json({ success: true });
});

// ── Import teachers from Excel ─────────────────────────────────
app.post('/api/teachers/import', xlsxUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'קובץ חסר' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const teacherSheetName = wb.SheetNames.find((name) => /מורות|teachers?|teacher/i.test(String(name || '')));
    const ws = teacherSheetName
      ? wb.Sheets[teacherSheetName]
      : wb.Sheets[wb.SheetNames.find((name) => {
          const sheet = wb.Sheets[name];
          if (!sheet) return false;
          const values = Object.values(XLSX.utils.sheet_to_json(sheet, { defval: '' }) || [])
            .flatMap((row) => Object.values(row || {}))
            .map((value) => String(value ?? '').trim().toLowerCase());
          return values.some((value) =>
            value.includes('שם פרטי') ||
            value.includes('first name') ||
            value.includes('מייל') ||
            value.includes('email') ||
            value.includes('תפקיד')
          );
        })] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const insert = db.prepare('INSERT OR IGNORE INTO teachers (name, subject, phone, email, active) VALUES (?, ?, ?, ?, 1)');
    const update = db.prepare('UPDATE teachers SET subject=?, phone=?, email=? WHERE name=?');

    const normalizeHeaderKey = (key) => String(key ?? '')
      .trim()
      .replace(/\uFEFF/g, '')
      .replace(/[\s\-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const normalizeRow = (row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row || {})) {
        normalized[normalizeHeaderKey(key)] = value;
      }
      return normalized;
    };

    const getValue = (row, aliases) => {
      const normalizedRow = normalizeRow(row);
      for (const alias of aliases) {
        const key = normalizeHeaderKey(alias);
        if (normalizedRow[key] !== undefined && normalizedRow[key] !== null && String(normalizedRow[key]).trim() !== '') {
          return normalizedRow[key];
        }
      }
      return '';
    };

    let imported = 0, skipped = 0;
    const tx = db.transaction(() => {
      for (const row of rows) {
        const fullName = String(getValue(row, ['שם מלא', 'מורה', 'teacher', 'full name', 'fullname'])).trim().replace(/\s+/g, ' ');
        const firstName = String(getValue(row, ['שם פרטי', 'first name', 'firstname', 'first_name', 'שם', 'name'])).trim().replace(/\s+/g, ' ');
        const lastName = String(getValue(row, ['משפחה','שם משפחה', 'last name', 'lastname', 'last_name', 'שם משפחה מורה', 'family name'])).trim().replace(/\s+/g, ' ');
        const explicitFullName = fullName && /\s+/.test(fullName) ? fullName : '';
        const reconstructedName = [lastName, firstName].filter(Boolean).join(' ').trim();
        const name = explicitFullName || reconstructedName || fullName;

        if (!name) { skipped++; continue; }
        const subject = String(getValue(row, ['תפקיד', 'מקצוע', 'subject', 'role', 'תפקיד מורה'])).trim().replace(/\s+/g, ' ') || null;
        const phone = String(getValue(row, ['טלפון', 'phone', 'מספר טלפון'])).trim() || null;
        const email = String(getValue(row, ['מייל', 'email', 'אימייל', 'mail'])).trim() || null;

        const existing = db.prepare('SELECT id FROM teachers WHERE name=?').get(name);
        if (existing) {
          if (subject || phone || email) update.run(subject, phone, email, name);
          skipped++;
        } else {
          insert.run(name, subject, phone, email);
          imported++;
        }
      }
    });
    tx();
    res.json({ imported, skipped });
  } catch (e) {
    res.status(400).json({ error: 'שגיאה בקריאת הקובץ: ' + (e instanceof Error ? e.message : String(e)) });
  }
});

// Add optional teacher columns if missing
const teacherCols = db.prepare('PRAGMA table_info(teachers)').all().map(c => c.name);
if (!teacherCols.includes('phone')) db.exec('ALTER TABLE teachers ADD COLUMN phone TEXT');
if (!teacherCols.includes('email')) db.exec('ALTER TABLE teachers ADD COLUMN email TEXT');

// ── Import schedule from Excel ──────────────────────────────────
// Expected columns: מורה/teacher, שנה/year, מקבילה/parallel, יום/day, שעה_התחלה/start_time, שעה_סיום/end_time, מקצוע/subject
// day values: ראשון/1, שני/2 etc. or number 0-4
app.post('/api/schedule/import', xlsxUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'קובץ חסר' });
  const weekStart = String(req.body?.week_start || '').trim();
  if (!weekStart) return res.status(400).json({ error: 'week_start חסר' });

  const DAY_MAP = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4,
    'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4,
    '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
    '0': 0, 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4 };

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let imported = 0, skipped = 0;
    const errors = [];

    const findImportedSlot = db.prepare(`
      SELECT id FROM schedule_slots
      WHERE teacher_id = ? AND class_year = ? AND class_parallel = ?
        AND day_of_week = ? AND start_time = ? AND week_start = ?
    `);
    const updateImportedSlot = db.prepare(`
      UPDATE schedule_slots SET end_time = ?, subject = ? WHERE id = ?
    `);
    const insertImportedSlot = db.prepare(`
      INSERT INTO schedule_slots (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const row of rows) {
        const teacherName = String(row['מורה'] || row['teacher'] || row['שם מורה'] || '').trim();
        const classYear   = String(row['שנה']   || row['year']   || row['כיתה שנה'] || '').trim();
        const classParallel = String(row['מקבילה'] || row['parallel'] || row['מס כיתה'] || row['מספר כיתה'] || '').trim();
        const dayRaw      = String(row['יום']    || row['day']    || '').trim().toLowerCase();
        const startTime   = String(row['שעה התחלה'] || row['שעה_התחלה'] || row['start_time'] || row['שעה'] || '').trim();
        const endTime     = String(row['שעה סיום'] || row['שעה_סיום'] || row['end_time'] || '').trim() || null;
        const subject     = String(row['מקצוע'] || row['subject'] || '').trim() || null;

        if (!teacherName || !classYear || !classParallel || !dayRaw || !startTime) {
          skipped++;
          continue;
        }

        const dayOfWeek = DAY_MAP[dayRaw] ?? DAY_MAP[dayRaw.replace('יום ', '')] ?? null;
        if (dayOfWeek === null || dayOfWeek === undefined) {
          errors.push(`שורה לא מוכרת: יום "${dayRaw}"`);
          skipped++;
          continue;
        }

        const availability = validateConfiguredKodeshSlot({
          class_year: classYear,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime
        });
        if (!availability.valid) {
          errors.push(`${classYear}${classParallel}: ${availability.error}`);
          skipped++;
          continue;
        }

        let teacher = db.prepare('SELECT id FROM teachers WHERE name=?').get(teacherName);
        if (!teacher) {
          const r = db.prepare('INSERT INTO teachers (name, active) VALUES (?, 1)').run(teacherName);
          teacher = { id: r.lastInsertRowid };
        }

        const existing = findImportedSlot.get(teacher.id, classYear, classParallel, dayOfWeek, startTime, weekStart);
        const classConflict = findClassTimeConflict(db, {
          class_year: classYear,
          class_parallel: classParallel,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          week_start: weekStart,
          excludeId: existing?.id || 0
        });
        if (classConflict) {
          errors.push(`${classYear}${classParallel}: כבר קיים שיעור באותה שעה`);
          skipped++;
          continue;
        }
        if (existing) {
          updateImportedSlot.run(endTime, subject, existing.id);
        } else {
          insertImportedSlot.run(teacher.id, classYear, classParallel, dayOfWeek, startTime, endTime, subject, weekStart);
        }
        imported++;
      }
    });
    tx();
    res.json({ imported, skipped, errors: errors.slice(0, 10) });
  } catch (e) {
    res.status(400).json({ error: 'שגיאה בקריאת הקובץ: ' + (e instanceof Error ? e.message : String(e)) });
  }
});

// ── Notifications ─────────────────────────────────────────────
// Returns a combined list of smart alerts across all modules
app.get('/api/notifications', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const notifications = [];

  // 1. ציוד שחזרתו עברה (overdueLoans)
  const overdueLoans = db.prepare(`
    SELECT l.id, l.borrower_name, l.expected_return, e.name AS equipment_name
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
    LIMIT 10
  `).all(today, today);
  for (const l of overdueLoans) {
    const days = Math.round((new Date(today) - new Date(l.expected_return)) / 86400000);
    notifications.push({
      id: `loan-overdue-${l.id}`,
      type: 'overdue',
      severity: days >= 3 ? 'danger' : 'warning',
      icon: '⚠️',
      title: 'ציוד לא הוחזר',
      body: `${l.equipment_name} — ${l.borrower_name} (${days} ימי איחור)`,
      link: '/loans',
      created_at: l.expected_return,
    });
  }

  // 2. מבחנים שיש להם ברקודים שלא הודפסו (קוד הופק אבל ציון לא נרשם כלל)
  const examsWithUngraded = db.prepare(`
    SELECT e.id, e.name, e.exam_date,
      (SELECT COUNT(*) FROM exam_codes c WHERE c.exam_id = e.id) AS total_codes,
      (SELECT COUNT(*) FROM exam_codes c JOIN exam_grades g ON g.code = c.code WHERE c.exam_id = e.id) AS graded_count
    FROM exams e
    WHERE (SELECT COUNT(*) FROM exam_codes c WHERE c.exam_id = e.id) > 0
      AND (SELECT COUNT(*) FROM exam_codes c JOIN exam_grades g ON g.code = c.code WHERE c.exam_id = e.id) = 0
    ORDER BY e.exam_date DESC
    LIMIT 5
  `).all();
  for (const ex of examsWithUngraded) {
    notifications.push({
      id: `exam-ungraded-${ex.id}`,
      type: 'exam',
      severity: 'info',
      icon: '',
      title: 'ברקודים ממתינים לציון',
      body: `${ex.name} — ${ex.total_codes} ברקודים עדיין ללא ציון`,
      link: '/exams',
      created_at: ex.exam_date || today,
    });
  }

  // 3. בקשות גישה לדפים שלי שממתינות לאישור
  const pendingPageRequests = db.prepare(`
    SELECT COUNT(*) AS c
    FROM page_access_requests r
    JOIN personal_pages p ON p.id = r.page_id
    WHERE p.created_by = ? AND r.status = 'pending' AND r.seen_at IS NULL
  `).get(req.user.id);
  if (pendingPageRequests.c > 0) {
    notifications.push({
      id: 'page-requests-pending',
      type: 'pages',
      severity: 'info',
      icon: '📄',
      title: 'בקשות גישה ממתינות',
      body: `${pendingPageRequests.c} בקשות גישה לדפים שלך ממתינות לאישור`,
      link: '/pages',
      created_at: today,
    });
  }

  // 4. הודעות שלא נקראו
  const unread = db.prepare(`
    SELECT COUNT(*) AS c FROM messages WHERE recipient_id = ? AND read_at IS NULL
  `).get(req.user.id);
  if (unread.c > 0) {
    notifications.push({
      id: 'messages-unread',
      type: 'messages',
      severity: 'info',
      icon: '💬',
      title: 'הודעות שלא נקראו',
      body: `${unread.c} הודעות חדשות ממתינות לך`,
      link: '/messages',
      created_at: today,
    });
  }

  // 5. משימות שתאריך היעד שלהן עבר
  const overdueTasks = db.prepare(`
    SELECT COUNT(*) AS c FROM personal_tasks
    WHERE user_id = ? AND completed_at IS NULL AND due_date < ?
  `).get(req.user.id, today);
  if (overdueTasks.c > 0) {
    notifications.push({
      id: 'tasks-overdue',
      type: 'tasks',
      severity: 'warning',
      icon: '⏰',
      title: 'משימות שפג מועדן',
      body: `${overdueTasks.c} משימות שלא הושלמו עברו את תאריך היעד`,
      link: '/messages',
      created_at: today,
    });
  }

  // 6. Students with incomplete mandatory requirements are shown only when both areas are accessible
  const permissions = getUserPermissions(req.user.role);
  if (permissions.students?.view && permissions.tracks?.view) {
    const incompleteMandatory = db.prepare(`
      SELECT COUNT(DISTINCT s.id_number) AS c
      FROM students s
      JOIN tracks t ON (
        s.track LIKE '%' || t.name || '%'
      )
      JOIN track_requirements tr ON tr.track_id = t.id AND tr.required = 1
      LEFT JOIN student_requirements sr ON sr.id_number = s.id_number AND sr.requirement_id = tr.id
      WHERE sr.id_number IS NULL
        AND (tr.years IS NULL OR tr.years LIKE '%' || s.year || '%')
    `).get();
    if (incompleteMandatory.c > 0) {
      notifications.push({
        id: 'requirements-incomplete',
        type: 'requirements',
        severity: 'warning',
        icon: '📁',
        title: 'דרישות חובה חסרות',
        body: `${incompleteMandatory.c} תלמידות עם דרישות חובה שלא הושלמו`,
        link: '/students',
        created_at: today,
      });
    }
  }

  // Sort by severity: danger first, then warning, then info
  const order = { danger: 0, warning: 1, info: 2 };
  notifications.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  const notificationPermissions = {
    overdue: ['loans'],
    exam: ['exams'],
    pages: ['pages'],
    messages: ['messages'],
    tasks: ['messages'],
    requirements: ['students', 'tracks']
  };
  res.json(notifications.filter(notification =>
    notificationPermissions[notification.type]?.every(feature => permissions[feature]?.view)
  ));
});

const port = process.env.PORT || 3000;
const keyFile = path.join(certDirForCheck, 'key.pem');
const certFile = path.join(certDirForCheck, 'cert.pem');
if (useHttps) {
  const httpsServer = require('https')
    .createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app);
  // A plain-HTTP request on the HTTPS port is answered with a redirect to the same address over HTTPS
  httpsServer.on('tlsClientError', (err, tlsSocket) => {
    if (err.code !== 'ERR_SSL_HTTP_REQUEST') return;
    const socket = tlsSocket._parent || tlsSocket;
    if (socket.destroyed || !socket.writable) return;
    const address = String(socket.localAddress || 'localhost').replace(/^::ffff:/, '');
    const host = address.includes(':') ? `[${address}]` : address;
    socket.end(
      `HTTP/1.1 301 Moved Permanently\r\nLocation: https://${host}:${port}/\r\n` +
      'Content-Length: 0\r\nConnection: close\r\n\r\n'
    );
  });
  httpsServer.listen(port, () => console.log(`Backend running securely (HTTPS) on port ${port}; HTTP requests are redirected to HTTPS`));
} else {
  app.listen(port, () => console.log(`Backend running on port ${port} (HTTP, not encrypted)`));
}
