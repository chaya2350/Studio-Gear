const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseStudentWorkbook, canonicalTrackValue } = require('../student-import');

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
