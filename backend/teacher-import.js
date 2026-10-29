const XLSX = require('xlsx');

function normalizeTeacherValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeHeaderKey(key) {
  return String(key ?? '')
    .trim()
    .replace(/\uFEFF/g, '')
    .replace(/[\s\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[normalizeHeaderKey(key)] = value;
  }
  return normalized;
}

function teacherRowValue(row, aliases) {
  const normalizedRow = normalizeRow(row);
  for (const alias of aliases) {
    const key = normalizeHeaderKey(alias);
    const value = normalizedRow[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function parseTeacherWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const teacherSheetName = workbook.SheetNames.find((name) =>
    /מורות|teachers?|teacher/i.test(String(name || ''))
  );

  const sheet = teacherSheetName
    ? workbook.Sheets[teacherSheetName]
    : workbook.Sheets[workbook.SheetNames.find((name) => {
        const ws = workbook.Sheets[name];
        if (!ws) return false;
        const values = Object.values(XLSX.utils.sheet_to_json(ws, { defval: '' }) || [])
          .flatMap((row) => Object.values(row || {}))
          .map((value) => String(value ?? '').trim().toLowerCase());
        return values.some((value) =>
          value.includes('שם פרטי') ||
          value.includes('first name') ||
          value.includes('מייל') ||
          value.includes('email') ||
          value.includes('תפקיד')
        );
      })] || workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map((row) => {
    const fullName = normalizeTeacherValue(
      teacherRowValue(row, ['שם מלא', 'מורה', 'teacher', 'full name', 'fullname'])
    );

    const firstName = normalizeTeacherValue(
      teacherRowValue(row, ['שם פרטי', 'first name', 'firstname', 'first_name', 'שם', 'name'])
    );

    const lastName = normalizeTeacherValue(
      teacherRowValue(row, ['שם משפחה', 'last name', 'lastname', 'last_name', 'שם משפחה מורה', 'family name'])
    );

    const explicitFullName = fullName && /\s+/.test(fullName) ? fullName : '';
    const reconstructedName = [lastName, firstName].filter(Boolean).join(' ').trim();
    const name = explicitFullName || reconstructedName || fullName;

    const subject = normalizeTeacherValue(
      teacherRowValue(row, ['תפקיד', 'מקצוע', 'subject', 'role', 'תפקיד מורה'])
    ) || null;

    const phone = normalizeTeacherValue(
      teacherRowValue(row, ['טלפון', 'phone', 'מספר טלפון'])
    ) || null;

    const email = normalizeTeacherValue(
      teacherRowValue(row, ['מייל', 'email', 'אימייל', 'mail'])
    ) || null;

    const specialization = normalizeTeacherValue(
      teacherRowValue(row, ['התמחות', 'specialization', 'מגמה', 'תחום'])
    ) || null;

    return { name, subject, phone, email, specialization };
  });
}

module.exports = {
  parseTeacherWorkbook,
};
