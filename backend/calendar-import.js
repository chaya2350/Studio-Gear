const XLSX = require('xlsx');

const HEBREW_VALUES = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80,
  צ: 90, ק: 100, ר: 200, ש: 300, ת: 400
};

const WEEKDAYS = new Set(['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']);
const HEBREW_DAY_VALUES = new Map([
  ['א', 1], ['ב', 2], ['ג', 3], ['ד', 4], ['ה', 5], ['ו', 6], ['ז', 7],
  ['ח', 8], ['ט', 9], ['י', 10], ['יא', 11], ['יב', 12], ['יג', 13],
  ['יד', 14], ['טו', 15], ['טז', 16], ['יז', 17], ['יח', 18], ['יט', 19],
  ['כ', 20], ['כא', 21], ['כב', 22], ['כג', 23], ['כד', 24], ['כה', 25],
  ['כו', 26], ['כז', 27], ['כח', 28], ['כט', 29], ['ל', 30]
]);

function cellText(cell) {
  return cell && cell.v !== undefined && cell.v !== null ? String(cell.w ?? cell.v).trim() : '';
}

function parseHebrewYear(text) {
  const match = String(text).match(/תשפ[\u05d0-\u05ea'״׳"]{1,5}/);
  if (!match) return null;
  const letters = match[0].replace(/[^\u05d0-\u05ea]/g, '');
  if (!letters.startsWith('תשפ') || letters.length < 4) return null;
  const yearPart = [...letters.slice(0, 3)].reduce((sum, letter) => sum + HEBREW_VALUES[letter], 0);
  const lastPart = [...letters.slice(3)].reduce((sum, letter) => sum + HEBREW_VALUES[letter], 0);
  return 5000 + yearPart + lastPart;
}

function monthInfo(text, year, HDate, months) {
  const monthNames = [
    { month: months.TISHREI, names: ['תשרי'] },
    { month: months.CHESHVAN, names: ['חשוון', 'חשון'] },
    { month: months.KISLEV, names: ['כסלו'] },
    { month: months.TEVET, names: ['טבת'] },
    { month: months.SHVAT, names: ['שבט'] },
    { month: months.ADAR_II, names: ['אדר ב'] },
    { month: months.ADAR_I, names: ['אדר א', 'אדר'] },
    { month: months.NISAN, names: ['ניסן'] },
    { month: months.IYYAR, names: ['אייר'] },
    { month: months.SIVAN, names: ['סיוון', 'סיון'] },
    { month: months.TAMUZ, names: ['תמוז'] },
    { month: months.AV, names: ['אב'] },
    { month: months.ELUL, names: ['אלול'] }
  ];
  const normalized = String(text).replace(/[\u05f3\u05f4'"'`]/g, '').trim();
  const entry = monthNames.find(candidate => candidate.names.some(name => normalized.startsWith(name)));
  if (!entry) return null;
  const gregorianRange = normalized.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*\/\s*(\d{4})/);
  const firstGregorianMonth = gregorianRange
    ? Number(gregorianRange[1])
    : new HDate(1, entry.month, year).greg().getMonth() + 1;
  const gregorianYear = gregorianRange
    ? Number(gregorianRange[3])
    : new HDate(1, entry.month, year).greg().getFullYear();
  return { hebrewMonth: entry.month, gregorianMonth: firstGregorianMonth, gregorianYear };
}

function parseHebrewDay(text) {
  const normalized = String(text).trim().replace(/[״׳'"]/g, '');
  const match = normalized.match(/^([\u05d0-\u05ea]{1,3})(?=[\s״׳'".,]|$)/);
  if (!match) return null;
  return HEBREW_DAY_VALUES.get(match[1]) ?? null;
}

function cellFill(cell) {
  const color = cell?.s?.fgColor;
  if (!color) return '';
  return String(color.rgb || color.argb || color.indexed || '').toUpperCase();
}

function calendarCategoryColors(sheet, range) {
  const matches = new Map();
  const startRow = range.s.r;
  const endRow = Math.min(range.e.r, startRow + 5);
  for (let row = startRow; row <= endRow; row++) {
    const labels = [];
    for (let column = 2; column <= Math.min(range.e.c, 9); column++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      const label = cellText(cell);
      if (label.length > 3 && cellFill(cell)) labels.push({ label, color: cellFill(cell) });
    }
    if (labels.length >= 3) {
      for (const { label, color } of labels) matches.set(color, label);
    }
  }
  return matches;
}

function findCalendarColumns(sheet, range) {
  const endRow = Math.min(range.e.r, range.s.r + 12);
  for (let row = range.s.r; row <= endRow; row++) {
    for (let firstColumn = range.s.c; firstColumn <= range.e.c - 6; firstColumn++) {
      let matches = 0;
      for (let offset = 0; offset < 7; offset++) {
        const value = cellText(sheet[XLSX.utils.encode_cell({ r: row, c: firstColumn + offset })]);
        if (WEEKDAYS.has(value)) matches++;
      }
      if (matches >= 5) return Array.from({ length: 7 }, (_, offset) => firstColumn + offset);
    }
  }
  return null;
}

async function parseCalendarWorkbook(buffer) {
  const { HDate, months } = await import('@hebcal/core');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true, cellDates: false });
  const events = [];
  const warnings = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const columns = findCalendarColumns(sheet, range);
    if (!columns) {
      warnings.push(`לא זוהו ימי שבוע בגיליון ${sheetName}`);
      continue;
    }
    const yearText = [
      sheetName,
      ...Array.from({ length: Math.min(range.e.r + 1, 8) }, (_, row) =>
        Array.from({ length: range.e.c - range.s.c + 1 }, (_, offset) =>
          cellText(sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + offset })])
        ).join(' ')
      ),
      ...columns.flatMap(column => Array.from({ length: Math.min(range.e.r + 1, 8) }, (_, row) =>
        cellText(sheet[XLSX.utils.encode_cell({ r: row, c: column })])
      ))
    ].join(' ');
    const hebrewYear = parseHebrewYear(yearText);
    if (!hebrewYear) {
      warnings.push(`לא זוהתה שנה עברית בגיליון ${sheetName}`);
      continue;
    }

    const categoryColors = calendarCategoryColors(sheet, range);
    let activeMonth = null;
    let gregorianMonth = null;
    let gregorianYear = null;
    let previousGregorianDay = null;
    let currentDates = new Map();
    let foundCalendarDays = false;

    for (let row = range.s.r; row <= range.e.r; row++) {
      const parsedMonth = Array.from({ length: range.e.c - range.s.c + 1 }, (_, offset) =>
        sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + offset })]
      ).map(cell => monthInfo(cellText(cell), hebrewYear, HDate, months)).find(Boolean);
      if (parsedMonth) {
        activeMonth = parsedMonth.hebrewMonth;
        gregorianMonth = parsedMonth.gregorianMonth;
        gregorianYear = parsedMonth.gregorianYear;
        previousGregorianDay = null;
        currentDates = new Map();
      }

      if (activeMonth === null) continue;

      const hebrewDays = new Map();
      const gregorianDays = new Map();
      for (const column of columns) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        const text = cellText(cell);
        const day = parseHebrewDay(text);
        if (day !== null) hebrewDays.set(column, day);
        const numeric = cell && typeof cell.v === 'number' && Number.isInteger(cell.v) ? cell.v : null;
        if (numeric !== null && numeric >= 1 && numeric <= 31) gregorianDays.set(column, numeric);
      }

      if (hebrewDays.size >= 2) {
        for (const [column, day] of hebrewDays) {
          if (day <= HDate.daysInMonth(activeMonth, hebrewYear)) {
            const gregorian = new HDate(day, activeMonth, hebrewYear).greg();
            currentDates.set(column, gregorian);
          }
        }
        foundCalendarDays = true;
      }

      if (gregorianDays.size >= 2 && gregorianMonth !== null && gregorianYear !== null) {
        for (const [column, day] of gregorianDays) {
          if (previousGregorianDay !== null && day < previousGregorianDay) {
            gregorianMonth++;
            if (gregorianMonth > 12) {
              gregorianMonth = 1;
              gregorianYear++;
            }
          }
          currentDates.set(column, new Date(gregorianYear, gregorianMonth - 1, day, 12));
          previousGregorianDay = day;
        }
        foundCalendarDays = true;
      }

      if (hebrewDays.size >= 2 || gregorianDays.size >= 2) continue;

      for (const column of columns) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        const title = cellText(cell);
        const date = currentDates.get(column);
        if (!title || !date || parseHebrewDay(title) !== null || /^\d+(\.\d+)?$/.test(title)) continue;
        events.push({
          title,
          event_date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          hebrew_year: hebrewYear,
          category: categoryColors.get(cellFill(cell)) || 'אירוע',
          source_sheet: sheetName
        });
      }
    }

    if (!foundCalendarDays) warnings.push(`לא זוהו תאריכים בגיליון ${sheetName}`);
  }

  const uniqueEvents = new Map();
  for (const event of events) {
    const key = `${event.source_sheet}\u0000${event.event_date}\u0000${event.title}`;
    uniqueEvents.set(key, event);
  }
  return { events: [...uniqueEvents.values()], warnings, sheetCount: workbook.SheetNames.length };
}

module.exports = { parseCalendarWorkbook };
