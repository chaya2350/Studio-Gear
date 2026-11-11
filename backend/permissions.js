const PERMISSION_ACTIONS = ['view', 'change'];

const PERMISSION_CATALOG = [
  { key: 'students', label: 'תלמידות', description: 'צפייה בכרטיסי תלמידות, בפרטים, בתמונות וברשימות; שינוי נתוני תלמידות.' },
  { key: 'tracks', label: 'מסלולים ודרישות', description: 'צפייה במסלולי לימוד, בדרישות ובהתקדמות; שינוי מסלולים ודרישות.' },
  { key: 'approvals', label: 'אישורים', description: 'צפייה בסוגי אישורים ובבקשות; שינוי סוגי אישורים והפקת אישורים.' },
  { key: 'teachers', label: 'מורות', description: 'צפייה בפרטי המורות וברשימה; שינוי פרטי מורות וייבוא נתונים.' },
  { key: 'schedule', label: 'מערכת שעות', description: 'צפייה בשיעורים ובמערכת השעות; שינוי שיעורים ומבנה שעות.' },
  { key: 'equipment', label: 'ציוד', description: 'צפייה בפריטי ציוד, בקטגוריות ובתמונות; שינוי פרטי הציוד והקטגוריות.' },
  { key: 'loans', label: 'השאלות', description: 'צפייה בהשאלות ובהחזרות; פתיחה, עדכון וביטול של השאלות.' },
  { key: 'calendar', label: 'לוח שנה ואירועים', description: 'צפייה באירועים; הוספה, עדכון וייבוא של אירועים.' },
  { key: 'attendance', label: 'נוכחות', description: 'צפייה ברישומי נוכחות; עדכון היעדרויות ואיחורים.' },
  { key: 'exams', label: 'מבחנים וציונים', description: 'צפייה במבחנים, בקודים ובציונים; יצירה ועדכון של נתוני מבחנים.' },
  { key: 'messages', label: 'הודעות ומשימות', description: 'צפייה בהודעות ובמשימות; שליחה ועדכון שלהן.' },
  { key: 'pages', label: 'דפים ובקשות גישה', description: 'צפייה בדפים ובבקשות; שינוי דפים והרשאות גישה אליהם.' },
  { key: 'reports', label: 'דוחות', description: 'צפייה והפקת דוחות. אין באזור זה פעולות שינוי.', supportsChange: false },
  { key: 'search', label: 'חיפוש כללי', description: 'חיפוש וצפייה בתוצאות מהאזורים המותרים. החיפוש אינו משנה נתונים.', supportsChange: false },
  { key: 'favorites', label: 'מועדפים והערות צוות', description: 'צפייה במועדפים ובהערות צוות; הוספה והסרה של מועדפים והערות.' },
  { key: 'notifications', label: 'התראות ופעילות', description: 'צפייה בהתראות וברשימת הפעילות. אין באזור זה פעולות שינוי.', supportsChange: false },
  { key: 'admin_panel', label: 'מסכי ניהול', description: 'כניסה למסכי הניהול המותרים לתפקיד; כל מסך עדיין כפוף להרשאת התחום שלו.', supportsChange: false },
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
    return { feature: importFeatures[pathname], action: 'change' };
  }
  if (/^\/students\/[^/]+\/photo\/?$/.test(pathname) && method === 'POST') {
    return { feature: 'students', action: 'change' };
  }
  if (pathname === '/admin/reset-database' && method === 'POST') {
    return { feature: 'students', action: 'change' };
  }
  const route = apiRoutes.find(([pattern]) => pattern.test(pathname));
  if (!route) return null;
  const action = ['GET', 'HEAD'].includes(method) ? 'view'
    : ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 'change' : null;
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
      action TEXT NOT NULL CHECK (action IN ('view', 'change')),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      PRIMARY KEY (role_key, permission_key, action)
    );
  `);
  const permissionsSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'role_permissions'"
  ).get()?.sql || '';
  if (/['"]create['"]/.test(permissionsSchema) || /['"]delete['"]/.test(permissionsSchema)) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE role_permissions_migration_new (
          role_key TEXT NOT NULL REFERENCES system_roles(role_key) ON DELETE CASCADE,
          permission_key TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('view', 'change')),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          PRIMARY KEY (role_key, permission_key, action)
        );
        INSERT INTO role_permissions_migration_new (role_key, permission_key, action, enabled)
        SELECT role_key, permission_key, 'view', MAX(enabled)
        FROM role_permissions
        WHERE action = 'view'
        GROUP BY role_key, permission_key;
        INSERT INTO role_permissions_migration_new (role_key, permission_key, action, enabled)
        SELECT role_key, permission_key, 'change',
          CASE
            WHEN SUM(CASE WHEN action IN ('create', 'update', 'delete') THEN 1 ELSE 0 END) = 3
              AND MIN(CASE WHEN action IN ('create', 'update', 'delete') THEN enabled ELSE 0 END) = 1
            THEN 1
            ELSE 0
          END
        FROM role_permissions
        GROUP BY role_key, permission_key;
        DROP TABLE role_permissions;
        ALTER TABLE role_permissions_migration_new RENAME TO role_permissions;
      `);
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
