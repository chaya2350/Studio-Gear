const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'];

const PERMISSION_CATALOG = [
  { key: 'students', label: 'תלמידות', group: 'לימודים ותלמידות', description: 'כרטיסי תלמידות, פרטים אישיים, תמונות, רשימות ונתוני רישום.' },
  { key: 'tracks', label: 'מסלולים ודרישות', group: 'לימודים ותלמידות', description: 'מסלולי לימוד, דרישות, התקדמות ושיוך תלמידות למסלולים.' },
  { key: 'approvals', label: 'אישורים', group: 'לימודים ותלמידות', description: 'סוגי אישורים, בקשות והפקת אישורים.' },
  { key: 'attendance', label: 'נוכחות', group: 'לימודים ותלמידות', description: 'רישומי נוכחות, היעדרויות ואיחורים.' },
  { key: 'exams', label: 'מבחנים וציונים', group: 'לימודים ותלמידות', description: 'מבחנים, קודים, ציונים וסטטיסטיקות.' },
  { key: 'teachers', label: 'מורות', group: 'צוות ומערכת', description: 'פרטי המורות, הרשימות וייבוא נתונים.' },
  { key: 'schedule', label: 'מערכת שעות', group: 'צוות ומערכת', description: 'שיעורים, חדרים, שיבוצים ומבנה מערכת השעות.' },
  { key: 'equipment', label: 'ציוד', group: 'ציוד והשאלות', description: 'פריטי ציוד, קטגוריות, תמונות ופרטי מלאי.' },
  { key: 'loans', label: 'השאלות', group: 'ציוד והשאלות', description: 'השאלות, החזרות וציוד נייד.' },
  { key: 'calendar', label: 'לוח שנה ואירועים', group: 'תקשורת ומעקב', description: 'אירועים בלוח השנה וייבוא אירועים.' },
  { key: 'messages', label: 'הודעות ומשימות', group: 'תקשורת ומעקב', description: 'הודעות, שליחה ומשימות צוות.' },
  { key: 'favorites', label: 'מועדפים והערות צוות', group: 'תקשורת ומעקב', description: 'מועדפים והערות פנימיות לצוות.' },
  { key: 'notifications', label: 'התראות ופעילות', group: 'תקשורת ומעקב', description: 'התראות ורשימת הפעילות. צפייה בלבד.', supportsChange: false },
  { key: 'pages', label: 'דפים ובקשות גישה', group: 'כלים וניהול', description: 'דפים, בקשות גישה והרשאות לדפים.' },
  { key: 'reports', label: 'דוחות', group: 'כלים וניהול', description: 'צפייה והפקת דוחות. צפייה בלבד.', supportsChange: false },
  { key: 'search', label: 'חיפוש כללי', group: 'כלים וניהול', description: 'חיפוש וצפייה בתוצאות מהתחומים המותרים. צפייה בלבד.', supportsChange: false },
  { key: 'admin_panel', label: 'מסכי ניהול', group: 'כלים וניהול', description: 'כניסה למסכי ניהול; כל מסך כפוף להרשאה של התחום המתאים.', supportsChange: false },
];

const apiRoutes = [
  [/^\/users(?:\/|$)/, 'users'],
  [/^\/roles(?:\/|$)/, 'roles'],
  [/^\/permissions(?:\/|$)/, 'roles'],
  [/^\/admin\/reset-database\/?$/, 'students'],
  [/^\/students\/[^/]+\/exams(?:\/|$)/, 'exams'],
  [/^\/students\/[^/]+\/attendance\/?$/, 'attendance'],
  [/^\/students\/[^/]+\/requirements(?:\/|$)/, 'tracks'],
  [/^\/students(?:\/|$)/, 'students'],
  [/^\/track-requirements(?:\/|$)/, 'tracks'],
  [/^\/tracks(?:\/|$)/, 'tracks'],
  [/^\/track-schedules(?:\/|$)/, 'schedule'],
  [/^\/approval-types(?:\/|$)/, 'approvals'],
  [/^\/teachers(?:\/|$)/, 'teachers'],
  [/^\/schedule(?:\/|$)/, 'schedule'],
  [/^\/attendance(?:\/|$)/, 'attendance'],
  [/^\/exam-codes(?:\/|$)/, 'exams'],
  [/^\/exams(?:\/|$)/, 'exams'],
  [/^\/exams-stats(?:\/|$)/, 'exams'],
  [/^\/calendar-events(?:\/|$)/, 'calendar'],
  [/^\/categories(?:\/|$)/, 'equipment'],
  [/^\/subcategories(?:\/|$)/, 'equipment'],
  [/^\/equipment(?:\/|$)/, 'equipment'],
  [/^\/upload(?:\/|$)/, 'equipment'],
  [/^\/loans(?:\/|$)/, 'loans'],
  [/^\/laptops(?:\/|$)/, 'loans'],
  [/^\/messages(?:\/|$)/, 'messages'],
  [/^\/tasks(?:\/|$)/, 'messages'],
  [/^\/pages(?:\/|$)/, 'pages'],
  [/^\/reports\/loans\.csv\/?$/, 'loans'],
  [/^\/reports(?:\/|$)/, 'reports'],
  [/^\/search\/?$/, 'search'],
  [/^\/favorites(?:\/|$)/, 'favorites'],
  [/^\/notes(?:\/|$)/, 'favorites'],
  [/^\/notifications(?:\/|$)/, 'notifications'],
  [/^\/activity\/?$/, 'notifications'],
];

function getApiPermission(pathname, method) {
  const importFeatures = {
    '/calendar-events/import': 'calendar',
    '/students/import': 'students',
    '/teachers/import': 'teachers',
    '/schedule/import': 'schedule',
  };
  if (method === 'POST' && importFeatures[pathname]) {
    return { feature: importFeatures[pathname], actions: ['create', 'edit'] };
  }
  if (pathname === '/upload' && method === 'POST') {
    return { feature: 'equipment', actions: ['create', 'edit'] };
  }
  if (/^\/students\/[^/]+\/wedding\/?$/.test(pathname) && method === 'POST') {
    return { feature: 'students', action: 'edit' };
  }
  if (/^\/students\/[^/]+\/photo\/?$/.test(pathname) && method === 'POST') {
    return { feature: 'students', action: 'edit' };
  }
  if (pathname === '/admin/reset-database' && method === 'POST') {
    return { feature: 'students', action: 'delete' };
  }
  if (/^\/attendance\/sessions\/[^/]+\/(absent|late|lock)\/?$/.test(pathname) && method === 'POST') {
    return { feature: 'attendance', action: 'edit' };
  }
  const route = apiRoutes.find(([pattern]) => pattern.test(pathname));
  if (!route) return null;
  const action = ['GET', 'HEAD'].includes(method) ? 'view'
    : method === 'POST' ? 'create'
      : ['PUT', 'PATCH'].includes(method) ? 'edit'
        : method === 'DELETE' ? 'delete' : null;
  if (!action) return null;
  return { feature: route[1], action };
}

function permissionMapFromRows(rows, role) {
  const result = {};
  for (const { key } of PERMISSION_CATALOG) {
    result[key] = Object.fromEntries(PERMISSION_ACTIONS.map(action => [action, role === 'admin']));
  }
  for (const row of rows) {
    if (result[row.permission_key]) result[row.permission_key][row.action] = Boolean(row.enabled);
  }
  if (role === 'admin') {
    for (const key of Object.keys(result)) {
      for (const action of PERMISSION_ACTIONS) result[key][action] = true;
    }
  }
  return result;
}

function initializePermissionSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_roles (
      role_key TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_system INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_key TEXT NOT NULL REFERENCES system_roles(role_key) ON DELETE CASCADE,
      permission_key TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('view', 'create', 'edit', 'delete')),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      PRIMARY KEY (role_key, permission_key, action)
    );
  `);
  const permissionsSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'role_permissions'"
  ).get()?.sql || '';
  if (!permissionsSchema.includes("'view', 'create', 'edit', 'delete'")) {
    const oldPermissions = db.prepare(
      'SELECT role_key, permission_key, action, enabled FROM role_permissions'
    ).all();
    db.transaction(() => {
      db.exec(`
        CREATE TABLE role_permissions_migration_new (
          role_key TEXT NOT NULL REFERENCES system_roles(role_key) ON DELETE CASCADE,
          permission_key TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('view', 'create', 'edit', 'delete')),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          PRIMARY KEY (role_key, permission_key, action)
        );
        DROP TABLE role_permissions;
        ALTER TABLE role_permissions_migration_new RENAME TO role_permissions;
      `);
      const insert = db.prepare(
        'INSERT OR REPLACE INTO role_permissions (role_key, permission_key, action, enabled) VALUES (?, ?, ?, ?)'
      );
      for (const row of oldPermissions) {
        const action = row.action === 'update' ? 'edit' : row.action;
        if (row.action === 'change') {
          for (const granularAction of ['create', 'edit', 'delete']) {
            insert.run(row.role_key, row.permission_key, granularAction, row.enabled);
          }
        } else if (PERMISSION_ACTIONS.includes(action)) {
          insert.run(row.role_key, row.permission_key, action, row.enabled);
        }
      }
    })();
  }
  const catalogKeys = PERMISSION_CATALOG.map(({ key }) => key);
  db.prepare(`DELETE FROM role_permissions WHERE permission_key NOT IN (${catalogKeys.map(() => '?').join(', ')})`)
    .run(...catalogKeys);

  const insertRole = db.prepare('INSERT OR IGNORE INTO system_roles (role_key, name, is_system) VALUES (?, ?, 1)');
  insertRole.run('admin', 'מנהלת מערכת');
  insertRole.run('secretary', 'מזכירות');
  insertRole.run('laborant', 'לבורנטית');

  const existingRoles = db.prepare('SELECT role_key FROM system_roles').all();
  const insertPermission = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_key, permission_key, action, enabled) VALUES (?, ?, ?, 1)'
  );
  const seed = db.transaction(() => {
    for (const { role_key: role } of existingRoles) {
      for (const { key } of PERMISSION_CATALOG) {
        for (const action of PERMISSION_ACTIONS) insertPermission.run(role, key, action);
      }
    }
  });
  seed();
}

module.exports = {
  PERMISSION_ACTIONS,
  PERMISSION_CATALOG,
  getApiPermission,
  permissionMapFromRows,
  initializePermissionSchema,
};
