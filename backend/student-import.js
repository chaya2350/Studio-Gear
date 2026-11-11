const XLSX = require('xlsx');

function normalizeHeader(value) {
  return String(value || '')
    .replace(/[\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function compactHeader(value) {
  return normalizeHeader(value).replace(/[^\p{L}\p{N}]/gu, '');
}

function normalizeBirthDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const validDate = (year, month, day) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = /^(\d{1,2})[/.\\-](\d{1,2})[/.\\-](\d{4})$/.exec(raw);
  if (local) return validDate(Number(local[3]), Number(local[2]), Number(local[1]));

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 0 && serial <= 73415) {
      const parsed = XLSX.SSF.parse_date_code(serial);
      if (parsed && parsed.y >= 1900 && parsed.y <= 2100) {
        return validDate(parsed.y, parsed.m, parsed.d);
      }
    }
  }
  return null;
}

function normalizeHebrewBirthDate(value) {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw) return null;
  const compact = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (compact && Number(compact[1]) >= 1 && Number(compact[1]) <= 30 && Number(compact[2]) >= 1 && Number(compact[2]) <= 14) {
    return `${Number(compact[1])}-${Number(compact[2])}`;
  }

  const adar = /אדר/.test(raw);
  let month = null;
  if (adar) {
    if (/אדר\s*(?:ב|׳ב|ב׳|שני|2)/.test(raw)) month = 13;
    else if (/אדר\s*(?:א|׳א|א׳|ראשון|1)/.test(raw)) month = 12;
    else month = 14;
  } else {
    const monthAliases = [
      [/אלול/, 6], [/אב/, 5], [/תמוז/, 4], [/אייר/, 2], [/סיון|סיוון/, 3],
      [/ניסן/, 1], [/שבט/, 11], [/טבת/, 10], [/כסלו/, 9], [/חשון|חשוון/, 8],
      [/תשרי/, 7]
    ];
    month = monthAliases.find(([pattern]) => pattern.test(raw))?.[1] ?? null;
  }
  if (month === null) return null;

  const hebrewValues = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30 };
  const dayTokens = raw.replace(/[׳״"'`.,]/g, '').split(/\s+/).filter(Boolean);
  let day = null;
  for (const token of dayTokens) {
    const numeric = /^(\d{1,2})$/.exec(token);
    if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 30) {
      day = Number(numeric[1]);
      break;
    }
    if (/^[אבגדהוזחטיכךל]+$/.test(token)) {
      const value = [...token].reduce((sum, letter) => sum + (hebrewValues[letter] || 0), 0);
      if (value >= 1 && value <= 30) {
        day = value;
        break;
      }
    }
  }
  if (!day) {
    return null;
  }
  return `${day}-${month}`;
}

function normalizeAliasText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u05f3\u05f4'"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function canonicalTrackValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = normalizeAliasText(raw).replace(/[-_]/g, '');
  const aliases = {
    'רוח': 'רוח',
    'ורוח': 'רוח',
    'רווח': 'רוח',
    'רוחח': 'רוח',
    'רוחה': 'רוח',
    'ראייתחשבון': 'רוח',
    'ראיית חשבון': 'רוח',
    'רו"ח': 'רוח',
    'ספורט': 'ספורט טיפולי',
    'ספורטטיפולי': 'ספורט טיפולי',
    'הומ': 'הוראה מתקנת',
    'הוראהמתקנת': 'הוראה מתקנת',
    'הרמתקנת': 'הוראה מתקנת',
    'חמ': 'חינוך מיוחד',
    'חינוך': 'חינוך מיוחד',
    'חינוךמיוחד': 'חינוך מיוחד',
    'חינוךממיוחד': 'חינוך מיוחד',
    'ללאמיסים': 'ייעוץ מס',
    'ייעוץמס': 'ייעוץ מס',
    'יעוץמס': 'ייעוץ מס',
    'יעוץ מס': 'ייעוץ מס',
    'הנדסתחשמל': 'הנדסת אנרגיה',
    'הנדסת חשמל': 'הנדסת אנרגיה',
    'הנדסתאנרגיה': 'הנדסת אנרגיה',
    'אנרגיה': 'הנדסת אנרגיה',
    'תיכנות': 'תכנות',
    'תכנות': 'תכנות'
  };
  return aliases[normalized] || raw;
}

function canonicalYearValue(value, sheetName = '') {
  const raw = String(value ?? '').trim();
  const sheetNormalized = normalizeAliasText(sheetName).replace(/[\s_-]/g, '');

  if (!raw) {
    if (sheetNormalized.includes('שנהא')) return 'א';
    if (sheetNormalized.includes('שנהב')) return 'ב';
    return '';
  }

  const normalized = normalizeAliasText(raw).replace(/[\s_-]/g, '');
  if (normalized === 'התמחות') {
    if (sheetNormalized.includes('שנהא')) return 'א';
    if (sheetNormalized.includes('שנהב')) return 'ב';
    return 'א';
  }
  if (normalized === 'יב' || normalized === 'י"ב') return 'יב';
  if (normalized === 'יא' || normalized === 'י"א') return 'יא';
  if (normalized === 'א' || normalized === 'שנהא') return 'א';
  if (normalized === 'ב' || normalized === 'שנהב') return 'ב';
  return raw;
}

function normalizeIdNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits && /^[\d\s-]+$/.test(raw) && digits.length >= 8 && digits.length <= 10) {
    return digits;
  }
  return raw;
}

function isLikelyIdHeader(column) {
  if (!column || column === '__sheetName') return false;
  const compact = compactHeader(column);
  const normalized = normalizeHeader(column);
  return [
    'מסזהות', 'מסזיהות', 'מספרזהות', 'מספרתעודתזהות', 'תעודתזהות',
    'תזהות', 'תז', 'idnumber', 'id', 'studentid', 'studentidnumber'
  ].includes(compact) || /^(?:מס(?:\s|\p{Zs})*זהות|מס(?:\s|\p{Zs})*פר(?:\s|\p{Zs})*זהות|t?z|id(?:_number|number)?)$/u.test(normalized);
}

function findIdCandidateFromRow(row) {
  for (const [key, value] of Object.entries(row)) {
    if (!isLikelyIdHeader(key)) continue;
    const normalized = normalizeIdNumber(value);
    if (/^\d{8,10}$/.test(normalized)) return normalized;
  }
  return '';
}

const knownHeaders = {
  id: [
    "מס' זהות", 'מס זהות', 'מספר זהות', 'מספר תעודת זהות', 'תעודת זהות',
    'ת. זהות', 'ת.ז', 'ת.ז.', 'תז', 'תז תלמידה', 'ת.ז תלמידה',
    'id_number', 'ID', 'id'
  ],
  firstName: ['שם פרטי', 'שם פרטי תלמידה', 'פרטי'],
  lastName: ['משפחה', 'שם משפחה', 'משפחה תלמידה', 'שם משפחה תלמידה'],
  name: ['שם מלא', 'שם תלמידה', 'name', 'student_name'],
  phone: ['נייד אישי', 'טלפון', 'phone'],
  phoneCode: ['קוד לטלפון', 'קידומת', 'קוד טלפון', 'phone code', 'phone_code', 'קוד-טלפון'],
  track: ['התמחות', 'מסלול', 'התמחות 1', 'מגמה', 'track', 'מסלול/התמחות'],
  year: ['כיתה', 'שנה', 'year', 'class'],
  birthDate: ['ת. לידה לועזי', 'תאריך לידה לועזי', 'תאריך לידה', 'birth_date', 'date_of_birth'],
  birthDateHebrew: ['ת. לידה עברי', 'תאריך לידה עברי', 'birth_date_hebrew', 'hebrew_birth_date'],
  address: ['כתובת', 'כתובת מגורים', 'address'],
  house: ['מספר בית', 'מס בית', 'בית'],
  city: ['עיר', 'יישוב']
};

const knownHeaderSet = new Set(
  Object.values(knownHeaders)
    .flat()
    .map((header) => compactHeader(header))
);

function isPasswordHeader(value) {
  const header = compactHeader(value);
  return header.includes('סיסמ') || header.includes('ססמ')
    || header.includes('password') || header.includes('passwd') || header === 'pass';
}

function mergeStudentExtraFields(existing, incoming) {
  const merged = { ...existing };
  let added = 0;
  for (const [rawKey, rawValue] of Object.entries(incoming || {})) {
    const key = String(rawKey || '').trim();
    const value = String(rawValue ?? '').trim();
    if (!key || !value) continue;

    if (isPasswordHeader(key)) {
      const oldPasswordKeys = Object.keys(merged).filter(isPasswordHeader);
      if (!oldPasswordKeys.length) added++;
      for (const oldKey of oldPasswordKeys) delete merged[oldKey];
      merged[key] = value;
      continue;
    }

    if (!String(merged[key] ?? '').trim()) {
      merged[key] = value;
      added++;
    }
  }
  return { merged, added };
}

function buildRowsFromSheet(sheetName, sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  let headerRowIndex = -1;

  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const matches = row
      .map((cell) => compactHeader(cell))
      .filter((token) => token && (knownHeaderSet.has(token) || isPasswordHeader(token))).length;
    if (matches >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex >= 0) {
    const rawHeaders = matrix[headerRowIndex] || [];
    const headers = rawHeaders.map((value, index) => {
      const text = String(value || '').trim();
      return text || `__COL_${index + 1}`;
    });
    const rows = [];
    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
      const rowValues = Array.isArray(matrix[r]) ? matrix[r] : [];
      if (!rowValues.some((value) => String(value || '').trim() !== '')) continue;
      const rowObj = { __sheetName: sheetName };
      headers.forEach((header, index) => {
        rowObj[header] = rowValues[index] ?? '';
      });
      rows.push(rowObj);
    }
    return rows;
  }

  const rows = [];
  for (const rowValues of matrix) {
    if (!Array.isArray(rowValues)) continue;
    if (!rowValues.some((value) => String(value || '').trim() !== '')) continue;
    const rowObj = { __sheetName: sheetName };
    rowValues.forEach((value, index) => {
      rowObj[`__COL_${index + 1}`] = value ?? '';
    });
    rows.push(rowObj);
  }
  return rows;
}

function parseStudentWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const extracted = buildRowsFromSheet(sheetName, sheet);
    rows.push(...extracted);
  }

  return rows
    .map((row) => {
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

      const id_number = normalizeIdNumber(getValue(...knownHeaders.id)) || findIdCandidateFromRow(row);
      if (!id_number) return null;

      const rowKeys = Object.keys(row);
      const hasFamilyColumn = rowKeys.some((column) => {
        const token = compactHeader(column);
        return ['משפחה', 'שםמשפחה', 'משפחהתלמידה', 'שםמשפחהתלמידה'].includes(token);
      });

      const explicitFirstName = String(getValue(...knownHeaders.firstName)).trim();
      const explicitLastName = String(getValue(...knownHeaders.lastName)).trim();
      const genericName = String(getValue('שם')).trim();
      const firstName = explicitFirstName || (hasFamilyColumn ? genericName : '');
      const lastName = explicitLastName || (!hasFamilyColumn ? genericName : '');
      const name = [firstName, lastName].filter(Boolean).join(' ') || String(getValue(...knownHeaders.name)).trim();
      const phone = String(getValue(...knownHeaders.phone)).trim();
      const phone_code = String(getValue(...knownHeaders.phoneCode)).trim();
      const birth_date = normalizeBirthDate(getValue(...knownHeaders.birthDate));
      const birth_date_hebrew = normalizeHebrewBirthDate(getValue(...knownHeaders.birthDateHebrew));
      const trackValue = String(getValue(...knownHeaders.track)).trim() || String(row.__sheetName || '').trim();
      const track = canonicalTrackValue(trackValue);
      const year = canonicalYearValue(String(getValue(...knownHeaders.year)).trim(), String(row.__sheetName || ''));
      const address = [
        getValue(...knownHeaders.address),
        getValue(...knownHeaders.house),
        getValue(...knownHeaders.city)
      ].map((value) => String(value || '').trim()).filter(Boolean).join(' ');

      const extra_fields = Object.entries(row).reduce((acc, [header, value]) => {
        if (header === '__sheetName') return acc;
        if (/^__COL_\d+$/i.test(header) || /^__EMPTY/i.test(header)) return acc;
        const normalizedHeader = compactHeader(header);
        if (!normalizedHeader || knownHeaderSet.has(normalizedHeader)) return acc;
        const cleanValue = String(value ?? '').trim();
        if (!cleanValue) return acc;
        acc[String(header).trim()] = cleanValue;
        return acc;
      }, {});
      if (firstName) extra_fields['שם פרטי'] = firstName;
      if (lastName) extra_fields['שם משפחה'] = lastName;

      return {
        id_number,
        name,
        phone,
        phone_code,
        birth_date,
        birth_date_hebrew,
        track,
        year,
        address,
        extra_fields,
        original_row: row
      };
    })
    .filter(Boolean);
}

module.exports = {
  parseStudentWorkbook,
  normalizeIdNumber,
  findIdCandidateFromRow,
  compactHeader,
  normalizeHeader,
  knownHeaders,
  canonicalTrackValue,
  canonicalYearValue,
  normalizeAliasText,
  normalizeBirthDate,
  normalizeHebrewBirthDate,
  isPasswordHeader,
  mergeStudentExtraFields
};
