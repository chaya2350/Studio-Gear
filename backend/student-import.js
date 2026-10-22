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
    'ראייתחשבון': 'ראיית חשבון',
    'ראיית חשבון': 'ראיית חשבון',
    'ספורט': 'ספורט טיפולי',
    'ספורטטיפולי': 'ספורט טיפולי',
    'הומ': 'הוראה מתקנת',
    'הוראה': 'הוראה מתקנת',
    'הוראהמתקנת': 'הוראה מתקנת',
    'הרמתקנת': 'הוראה מתקנת',
    'חמ': 'חינוך מיוחד',
    'חינוך': 'חינוך מיוחד',
    'חינוךמיוחד': 'חינוך מיוחד',
    'חינוךממיוחד': 'חינוך מיוחד',
    'ללאמיסים': 'ייעוץ מס',
    'ייעוץמס': 'ייעוץ מס',
    'הנדסתחשמל': 'הנדסת אנרגיה',
    'הנדסתאנרגיה': 'הנדסת אנרגיה',
    'אנרגיה': 'הנדסת אנרגיה',
    'רו"ח': 'ראיית חשבון',
    'רוחח': 'ראיית חשבון',
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
  birthDate: ['ת. לידה לועזי', 'תאריך לידה', 'birth_date', 'date_of_birth', 'ת. לידה עברי'],
  address: ['כתובת', 'כתובת מגורים', 'address'],
  house: ['מספר בית', 'מס בית', 'בית'],
  city: ['עיר', 'יישוב']
};

const knownHeaderSet = new Set(
  Object.values(knownHeaders)
    .flat()
    .map((header) => compactHeader(header))
);

function buildRowsFromSheet(sheetName, sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const headersCompact = new Set([...knownHeaderSet]);
  let headerRowIndex = -1;

  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const matches = row
      .map((cell) => compactHeader(cell))
      .filter((token) => token && headersCompact.has(token)).length;
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
        const cleanValue = String(value || '').trim();
        if (!cleanValue) return acc;
        acc[String(header).trim()] = cleanValue;
        return acc;
      }, {});

      return {
        id_number,
        name,
        phone,
        phone_code,
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
  normalizeAliasText
};
