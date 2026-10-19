const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseCalendarWorkbook } = require('../calendar-import');

function setCell(sheet, address, value) {
  sheet[address] = { t: typeof value === 'number' ? 'n' : 's', v: value };
}

test('imports Gregorian-date and Hebrew-only calendar sheets', async () => {
  const workbook = XLSX.utils.book_new();

  const currentYear = {};
  setCell(currentYear, 'B2', 'מערכת שנה תשפ״ז');
  ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'].forEach((day, index) =>
    setCell(currentYear, XLSX.utils.encode_cell({ r: 5, c: index + 2 }), day)
  );
  setCell(currentYear, 'B7', 'אלול 8-9/2026');
  [12, 13, 14].forEach((day, index) => setCell(currentYear, XLSX.utils.encode_cell({ r: 7, c: index + 2 }), day));
  setCell(currentYear, 'E9', 'כנס בדיקה');
  currentYear['!ref'] = 'B2:I9';
  XLSX.utils.book_append_sheet(workbook, currentYear, 'תשפז');

  const HebrewOnlyYear = {};
  setCell(HebrewOnlyYear, 'B2', 'מערכת שנה תשפ״ה');
  ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'].forEach((day, index) =>
    setCell(HebrewOnlyYear, XLSX.utils.encode_cell({ r: 4, c: index + 1 }), day)
  );
  setCell(HebrewOnlyYear, 'B6', 'אלול');
  ['א׳', 'ב׳', 'ג׳'].forEach((day, index) =>
    setCell(HebrewOnlyYear, XLSX.utils.encode_cell({ r: 6, c: index + 1 }), day)
  );
  setCell(HebrewOnlyYear, 'C8', 'יום היערכות');
  HebrewOnlyYear['!ref'] = 'B2:H8';
  XLSX.utils.book_append_sheet(workbook, HebrewOnlyYear, 'תשפה');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const result = await parseCalendarWorkbook(buffer);
  const event = result.events.find(item => item.source_sheet === 'תשפז');
  const HebrewEvent = result.events.find(item => item.source_sheet === 'תשפה');
  const { HDate, months } = await import('@hebcal/core');
  const expectedHebrewDate = new HDate(2, months.ELUL, 5785).greg();
  const expectedHebrewDateString = `${expectedHebrewDate.getFullYear()}-${String(expectedHebrewDate.getMonth() + 1).padStart(2, '0')}-${String(expectedHebrewDate.getDate()).padStart(2, '0')}`;

  assert.equal(result.sheetCount, 2);
  assert.equal(result.warnings.length, 0);
  assert.equal(event.event_date, '2026-08-14');
  assert.equal(event.hebrew_year, 5787);
  assert.equal(HebrewEvent.title, 'יום היערכות');
  assert.equal(HebrewEvent.event_date, expectedHebrewDateString);
});
