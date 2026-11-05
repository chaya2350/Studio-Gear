const test = require('node:test');
const assert = require('node:assert/strict');
const { generateIsraeliHolidayEvents } = require('../calendar-holidays');

test('generates Hebrew holiday events for the requested Israeli date range', async () => {
  const events = await generateIsraeliHolidayEvents('2027-04-21', '2027-04-23');

  assert.ok(events.some(event => event.title === 'פסח' && event.event_date === '2027-04-21'));
  assert.ok(events.every(event => event.category === 'חג' && event.hebrew_year === 5787));
  assert.ok(events.every(event => event.event_date >= '2027-04-21' && event.event_date <= '2027-04-23'));
});