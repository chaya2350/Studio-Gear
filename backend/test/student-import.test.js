const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {
  parseStudentWorkbook, canonicalTrackValue, normalizeBirthDate, normalizeHebrewBirthDate,
  mergeStudentExtraFields
} = require('../student-import');

test('keeps הוראה distinct from הוראה מתקנת when normalizing imported track values', () => {
  assert.equal(canonicalTrackValue('הוראה'), 'הוראה');
  assert.equal(canonicalTrackValue('הוראה מתקנת'), 'הוראה מתקנת');
});

test('normalizes imported birth dates from ISO, Israeli, and Excel serial formats', () => {
  assert.equal(normalizeBirthDate('2001-02-03'), '2001-02-03');
  assert.equal(normalizeBirthDate('3/2/2001'), '2001-02-03');
  assert.equal(normalizeBirthDate('29.02.2000'), '2000-02-29');
  assert.equal(normalizeBirthDate('31/02/2001'), null);
  assert.equal(normalizeBirthDate(''), null);
});

test('normalizes Hebrew birthdays to recurring Hebrew day and month', () => {
  assert.equal(normalizeHebrewBirthDate('כ״ג שבט תשפ״ז'), '23-11');
  assert.equal(normalizeHebrewBirthDate('כ״ה חשוון תשפ״ז'), '25-8');
  assert.equal(normalizeHebrewBirthDate('ט״ו אדר ב׳ תשפ״ד'), '15-13');
  assert.equal(normalizeHebrewBirthDate('א׳ אדר תשפ״ה'), '1-14');
  assert.equal(normalizeHebrewBirthDate('31 שבט'), null);
});

test('parses imported Gregorian and Hebrew birth dates separately', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};
  setCell(sheet, 'A1', 'מספר זהות');
  setCell(sheet, 'B1', 'שם מלא');
  setCell(sheet, 'C1', 'ת. לידה לועזי');
  setCell(sheet, 'D1', 'ת. לידה עברי');
  setCell(sheet, 'A2', '123456789');
  setCell(sheet, 'B2', 'עדי כהן');
  setCell(sheet, 'C2', '3/2/2001');
  setCell(sheet, 'D2', 'כ״ג שבט תשס״א');
  sheet['!ref'] = 'A1:D2';

  XLSX.utils.book_append_sheet(workbook, sheet, 'תלמידות');
  const rows = parseStudentWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(rows[0].birth_date, '2001-02-03');
  assert.equal(rows[0].birth_date_hebrew, '23-11');
});

test('detects the exact government-password header and retains numeric values', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};
  setCell(sheet, 'A1', 'מספר זהות');
  setCell(sheet, 'B1', 'סיסמא לגוב');
  setCell(sheet, 'A2', '123456789');
  setCell(sheet, 'B2', 0);
  sheet['!ref'] = 'A1:B2';

  XLSX.utils.book_append_sheet(workbook, sheet, 'שנה א');
  const rows = parseStudentWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id_number, '123456789');
  assert.equal(rows[0].extra_fields['סיסמא לגוב'], '0');
});

test('reimported password replaces an older password header spelling', () => {
  const result = mergeStudentExtraFields(
    { 'סיסמה לגוב': 'old', 'פרט אחר': 'keep' },
    { 'סיסמא לגוב': 'new' }
  );

  assert.deepEqual(result, {
    merged: { 'פרט אחר': 'keep', 'סיסמא לגוב': 'new' },
    added: 0
  });
});

function setCell(sheet, address, value) {
  sheet[address] = { t: typeof value === 'number' ? 'n' : 's', v: value };
}

test('parses student workbook and ignores numeric-only false positives as IDs', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};

  setCell(sheet, 'A1', 'מספר זהות');
  setCell(sheet, 'B1', 'שם פרטי');
  setCell(sheet, 'C1', 'שם משפחה');
  setCell(sheet, 'D1', 'מסלול');
  setCell(sheet, 'E1', 'כיתה');
  setCell(sheet, 'F1', 'מיקום מדף');
  setCell(sheet, 'A2', '123456789');
  setCell(sheet, 'B2', 'עדי');
  setCell(sheet, 'C2', 'כהן');
  setCell(sheet, 'D2', 'רוח');
  setCell(sheet, 'E2', 'יב');
  setCell(sheet, 'F2', '230');
  setCell(sheet, 'A3', '987654321');
  setCell(sheet, 'B3', 'רוני');
  setCell(sheet, 'C3', 'לוי');
  setCell(sheet, 'D3', 'תיאטרון');
  setCell(sheet, 'E3', 'יא');
  setCell(sheet, 'F3', '120');
  sheet['!ref'] = 'A1:F3';

  XLSX.utils.book_append_sheet(workbook, sheet, 'תלמידות');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseStudentWorkbook(buffer);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].id_number, '123456789');
  assert.equal(rows[0].name, 'עדי כהן');
  assert.equal(rows[0].extra_fields['שם פרטי'], 'עדי');
  assert.equal(rows[0].extra_fields['שם משפחה'], 'כהן');
  assert.equal(rows[0].track, 'רוח');
  assert.equal(rows[0].year, 'יב');
  assert.equal(rows[0].extra_fields['מיקום מדף'], '230');
  assert.equal(rows[1].id_number, '987654321');
  assert.equal(rows[1].name, 'רוני לוי');
  assert.equal(rows[1].track, 'תיאטרון');
  assert.equal(rows[1].year, 'יא');
  assert.equal(rows[1].extra_fields['מיקום מדף'], '120');
});

test('normalizes Hebrew aliases for track and phone-code fields', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};

  setCell(sheet, 'A1', 'מספר זהות');
  setCell(sheet, 'B1', 'שם מלא');
  setCell(sheet, 'C1', 'קוד לטלפון');
  setCell(sheet, 'D1', 'מסלול');
  setCell(sheet, 'E1', 'כיתה');
  setCell(sheet, 'A2', '555666777');
  setCell(sheet, 'B2', 'נועה לוי');
  setCell(sheet, 'C2', '02');
  setCell(sheet, 'D2', 'ורו"ח');
  setCell(sheet, 'E2', 'י"ב');
  sheet['!ref'] = 'A1:E2';

  XLSX.utils.book_append_sheet(workbook, sheet, 'תלמידות');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseStudentWorkbook(buffer);

  assert.equal(rows[0].phone_code, '02');
  assert.equal(rows[0].track, 'רוח');
  assert.equal(rows[0].year, 'יב');
});

test('normalizes electrical engineering track alias to energy engineering', () => {
  assert.equal(canonicalTrackValue('הנדסת חשמל'), 'הנדסת אנרגיה');
});

test('converts specialization year values to the real workbook year names: שנה א תשפז and שנה ב תשפז', () => {
  const workbook = XLSX.utils.book_new();

  const sheetA = {};
  setCell(sheetA, 'A1', 'מספר זהות');
  setCell(sheetA, 'B1', 'שם מלא');
  setCell(sheetA, 'C1', 'כיתה');
  setCell(sheetA, 'A2', '111');
  setCell(sheetA, 'B2', 'אילה כהן');
  setCell(sheetA, 'C2', 'התמחות');
  sheetA['!ref'] = 'A1:C2';
  XLSX.utils.book_append_sheet(workbook, sheetA, 'שנה א תשפז');

  const sheetB = {};
  setCell(sheetB, 'A1', 'מספר זהות');
  setCell(sheetB, 'B1', 'שם מלא');
  setCell(sheetB, 'C1', 'כיתה');
  setCell(sheetB, 'A2', '222');
  setCell(sheetB, 'B2', 'בנה כהן');
  setCell(sheetB, 'C2', 'התמחות');
  sheetB['!ref'] = 'A1:C2';
  XLSX.utils.book_append_sheet(workbook, sheetB, 'שנה ב תשפז');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseStudentWorkbook(buffer);

  assert.equal(rows[0].year, 'א');
  assert.equal(rows[1].year, 'ב');
});

test('imports birth dates from the second workbook sheet and resolves its year from the sheet name', () => {
  const workbook = XLSX.utils.book_new();
  const sheetA = {};
  setCell(sheetA, 'A1', 'מספר זהות');
  setCell(sheetA, 'B1', 'שם מלא');
  setCell(sheetA, 'C1', 'ת. לידה לועזי');
  setCell(sheetA, 'D1', 'ת. לידה עברי');
  setCell(sheetA, 'E1', 'כיתה');
  setCell(sheetA, 'A2', '111');
  setCell(sheetA, 'B2', 'אילה כהן');
  setCell(sheetA, 'C2', '3/2/2001');
  setCell(sheetA, 'D2', 'כ״ג שבט תשס״א');
  setCell(sheetA, 'E2', 'התמחות');
  sheetA['!ref'] = 'A1:E2';
  XLSX.utils.book_append_sheet(workbook, sheetA, 'שנה א תשפז');

  const sheetB = {};
  setCell(sheetB, 'A1', 'מספר זהות');
  setCell(sheetB, 'B1', 'שם מלא');
  setCell(sheetB, 'C1', 'ת. לידה לועזי');
  setCell(sheetB, 'D1', 'ת. לידה עברי');
  setCell(sheetB, 'E1', 'כיתה');
  setCell(sheetB, 'A2', '222');
  setCell(sheetB, 'B2', 'בנה כהן');
  setCell(sheetB, 'C2', '4/5/2002');
  setCell(sheetB, 'D2', 'ט״ו אדר ב׳ תשס״ב');
  setCell(sheetB, 'E2', 'התמחות');
  sheetB['!ref'] = 'A1:E2';
  XLSX.utils.book_append_sheet(workbook, sheetB, 'שנה ב תשפז');

  const rows = parseStudentWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const yearB = rows.find((row) => row.id_number === '222');

  assert.ok(yearB);
  assert.equal(yearB.year, 'ב');
  assert.equal(yearB.birth_date, '2002-05-04');
  assert.equal(yearB.birth_date_hebrew, '15-13');
});
