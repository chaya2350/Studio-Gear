const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { addIsraeliHolidays, generateIsraeliHolidayEvents, getSchoolHoliday } = require('../calendar-holidays');

test('generates Hebrew holiday events for the requested Israeli date range', async () => {
  const events = await generateIsraeliHolidayEvents('2027-04-21', '2027-04-23');

  assert.ok(events.some(event => event.title === 'פסח' && event.event_date === '2027-04-21'));
  assert.ok(events.every(event => event.category === 'חג' && event.hebrew_year === 5787));
  assert.ok(events.every(event => event.event_date >= '2027-04-21' && event.event_date <= '2027-04-23'));
});

test('stores generated holidays only once', async () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE calendar_events (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      hebrew_year INTEGER NOT NULL,
      category TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      created_at TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      is_school_holiday INTEGER NOT NULL DEFAULT 0,
      UNIQUE (event_date, title, category, source_sheet)
    )
  `);

  const firstInsertCount = await addIsraeliHolidays(db, '2027-04-21', '2027-04-29');
  const secondInsertCount = await addIsraeliHolidays(db, '2027-04-21', '2027-04-29');
  const storedCount = db.prepare('SELECT COUNT(*) AS count FROM calendar_events').get().count;

  assert.ok(firstInsertCount > 0);
  assert.equal(secondInsertCount, 0);
  assert.equal(storedCount, firstInsertCount);
  assert.equal(
    db.prepare("SELECT is_school_holiday FROM calendar_events WHERE title = 'פסח'").get().is_school_holiday,
    1
  );
  assert.equal(getSchoolHoliday(db, '2027-04-21').title, 'פסח');
  assert.equal(getSchoolHoliday(db, '2027-04-22').title, 'חול המועד פסח');
  assert.equal(getSchoolHoliday(db, '2027-04-29'), null);
  db.close();
});