const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseTeacherWorkbook } = require('../teacher-import');

function setCell(sheet, address, value) {
  sheet[address] = { t: typeof value === 'number' ? 'n' : 's', v: value };
}

test('parses teacher workbook with split first/last name and email columns', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};

  setCell(sheet, 'A1', 'שם פרטי');
  setCell(sheet, 'B1', 'שם משפחה');
  setCell(sheet, 'C1', 'מייל');
  setCell(sheet, 'D1', 'טלפון');
  setCell(sheet, 'E1', 'תפקיד');

  setCell(sheet, 'A2', 'שירה');
  setCell(sheet, 'B2', 'כהן');
  setCell(sheet, 'C2', 'shira@example.com');
  setCell(sheet, 'D2', '050-1234567');
  setCell(sheet, 'E2', 'מתמטיקה');

  sheet['!ref'] = 'A1:E2';

  XLSX.utils.book_append_sheet(workbook, sheet, 'מורות');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseTeacherWorkbook(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'כהן שירה');
  assert.equal(rows[0].email, 'shira@example.com');
  assert.equal(rows[0].phone, '050-1234567');
  assert.equal(rows[0].subject, 'מתמטיקה');
});

test('prefers the populated teacher sheet when a workbook starts with a short summary sheet', () => {
  const workbook = XLSX.utils.book_new();

  const summarySheet = {};
  setCell(summarySheet, 'A1', 'דוח');
  setCell(summarySheet, 'B1', 'כמות');
  setCell(summarySheet, 'A2', 'סה"כ');
  setCell(summarySheet, 'B2', '2');
  summarySheet['!ref'] = 'A1:B2';
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const dataSheet = {};
  setCell(dataSheet, 'A1', 'שם פרטי');
  setCell(dataSheet, 'B1', 'שם משפחה');
  setCell(dataSheet, 'C1', 'מייל');
  setCell(dataSheet, 'D1', 'טלפון');
  setCell(dataSheet, 'E1', 'תפקיד');

  setCell(dataSheet, 'A2', 'שירה');
  setCell(dataSheet, 'B2', 'כהן');
  setCell(dataSheet, 'C2', 'shira@example.com');
  setCell(dataSheet, 'D2', '050-1234567');
  setCell(dataSheet, 'E2', 'מתמטיקה');

  setCell(dataSheet, 'A3', 'רחל');
  setCell(dataSheet, 'B3', 'לוי');
  setCell(dataSheet, 'C3', 'rachel@example.com');
  setCell(dataSheet, 'D3', '050-7654321');
  setCell(dataSheet, 'E3', 'אנגלית');

  dataSheet['!ref'] = 'A1:E3';
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'מורות');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseTeacherWorkbook(buffer);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'כהן שירה');
  assert.equal(rows[1].name, 'לוי רחל');
});

test('keeps a full-name cell as a full name instead of splitting it into family-name field', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};

  setCell(sheet, 'A1', 'שם מלא');
  setCell(sheet, 'B1', 'תפקיד');
  setCell(sheet, 'A2', 'איידי גרינבוים');
  setCell(sheet, 'B2', 'מזכירה');
  sheet['!ref'] = 'A1:B2';

  XLSX.utils.book_append_sheet(workbook, sheet, 'מורות');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseTeacherWorkbook(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'איידי גרינבוים');
  assert.equal(rows[0].subject, 'מזכירה');
});

test('prefers a full-name column over split-name columns when both are present', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};

  setCell(sheet, 'A1', 'שם פרטי');
  setCell(sheet, 'B1', 'שם מלא');
  setCell(sheet, 'C1', 'תפקיד');
  setCell(sheet, 'A2', 'ליבי');
  setCell(sheet, 'B2', 'ליבי כהן');
  setCell(sheet, 'C2', 'מורה');
  sheet['!ref'] = 'A1:C2';

  XLSX.utils.book_append_sheet(workbook, sheet, 'מורות');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseTeacherWorkbook(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'ליבי כהן');
  assert.equal(rows[0].subject, 'מורה');
});

test('rebuilds full name from family + first name when the full-name cell is only a first name', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = {};

  setCell(sheet, 'A1', 'שם פרטי');
  setCell(sheet, 'B1', 'שם משפחה');
  setCell(sheet, 'C1', 'שם מלא');
  setCell(sheet, 'A2', 'אסתי');
  setCell(sheet, 'B2', 'גור');
  setCell(sheet, 'C2', 'אסתי');
  sheet['!ref'] = 'A1:C2';

  XLSX.utils.book_append_sheet(workbook, sheet, 'מורות');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const rows = parseTeacherWorkbook(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'גור אסתי');
});
