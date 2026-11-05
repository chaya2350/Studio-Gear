const HOLIDAY_NAMES = [
  [/^Rosh Hashana \d+$/, 'ראש השנה'],
  [/^Rosh Hashana II$/, 'ראש השנה ב׳'],
  [/^Erev Rosh Hashana$/, 'ערב ראש השנה'],
  [/^Yom Kippur$/, 'יום כיפור'],
  [/^Erev Yom Kippur$/, 'ערב יום כיפור'],
  [/^Erev Sukkot$/, 'ערב סוכות'],
  [/^Sukkot I$/, 'סוכות'],
  [/^Sukkot II \(CH''M\)$/, 'חול המועד סוכות'],
  [/^Sukkot III \(CH''M\)$/, 'חול המועד סוכות'],
  [/^Sukkot IV \(CH''M\)$/, 'חול המועד סוכות'],
  [/^Sukkot V \(CH''M\)$/, 'חול המועד סוכות'],
  [/^Sukkot VI \(CH''M\)$/, 'חול המועד סוכות'],
  [/^Sukkot VII \(Hoshana Raba\)$/, 'הושענא רבה'],
  [/^Shmini Atzeret$/, 'שמיני עצרת ושמחת תורה'],
  [/^Pesach I$/, 'פסח'],
  [/^Pesach [IVX]+ \(CH''M\)$/, 'חול המועד פסח'],
  [/^Pesach VII$/, 'שביעי של פסח'],
  [/^Shavuot$/, 'שבועות'],
  [/^Erev Shavuot$/, 'ערב שבועות'],
  [/^Erev Pesach$/, 'ערב פסח'],
  [/^Tu BiShvat$/, 'ט״ו בשבט'],
  [/^Purim$/, 'פורים'],
  [/^Shushan Purim$/, 'שושן פורים'],
  [/^Purim Katan$/, 'פורים קטן'],
  [/^Shushan Purim Katan$/, 'שושן פורים קטן'],
  [/^Ta'anit Esther$/, 'תענית אסתר'],
  [/^Tzom Gedaliah$/, 'צום גדליה'],
  [/^Tzom Tammuz$/, 'י״ז בתמוז'],
  [/^Tish'a Av$/, 'תשעה באב'],
  [/^Lag BaOmer$/, 'ל״ג בעומר'],
  [/^Pesach Sheni$/, 'פסח שני'],
  [/^Tu B'Av$/, 'ט״ו באב'],
  [/^Chanukah: \d+ Candles$/, 'חנוכה'],
  [/^Yom HaShoah$/, 'יום הזיכרון לשואה ולגבורה'],
  [/^Yom HaZikaron$/, 'יום הזיכרון לחללי מערכות ישראל'],
  [/^Yom HaAtzma'ut$/, 'יום העצמאות'],
  [/^Yom Yerushalayim$/, 'יום ירושלים'],
  [/^Yom HaAliyah(?: School Observance)?$/, 'יום העלייה'],
  [/^Yitzhak Rabin Memorial Day$/, 'יום הזיכרון ליצחק רבין'],
  [/^Sigd$/, 'סיגד']
];

const SCHOOL_HOLIDAY_NAMES = [
  'ראש השנה', 'ראש השנה ב׳', 'ערב ראש השנה', 'יום כיפור', 'ערב יום כיפור',
  'ערב סוכות', 'סוכות', 'חול המועד סוכות', 'הושענא רבה', 'שמיני עצרת ושמחת תורה',
  'ערב פסח', 'פסח', 'חול המועד פסח', 'שביעי של פסח', 'שבועות', 'ערב שבועות',
  'פורים', 'שושן פורים', 'יום העצמאות'
];

function gregorianDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function generateIsraeliHolidayEvents(startDate, endDate) {
  const { HebrewCalendar, flags } = await import('@hebcal/core');
  const includedFlags = flags.CHAG | flags.MINOR_HOLIDAY | flags.MAJOR_FAST |
    flags.MINOR_FAST | flags.CHOL_HAMOED | flags.MODERN_HOLIDAY | flags.EREV;
  const holidays = [];

  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year++) {
    const events = HebrewCalendar.calendar({ year, isHebrewYear: false, il: true });
    for (const event of events) {
      if (!(event.getFlags() & includedFlags)) continue;
      const eventDate = gregorianDate(event.getDate().greg());
      if (eventDate < startDate || eventDate > endDate) continue;
      const title = HOLIDAY_NAMES.find(([pattern]) => pattern.test(event.getDesc()))?.[1];
      if (!title) continue;
      holidays.push({
        title,
        event_date: eventDate,
        hebrew_year: event.getDate().getFullYear(),
        category: 'חג',
        is_school_holiday: SCHOOL_HOLIDAY_NAMES.includes(title) ? 1 : 0
      });
    }
  }

  return holidays;
}

async function addIsraeliHolidays(db, startDate, endDate) {
  const holidays = await generateIsraeliHolidayEvents(startDate, endDate);
  return db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO calendar_events
        (title, event_date, hebrew_year, category, source_sheet, created_at, all_day, is_school_holiday)
      VALUES (?, ?, ?, ?, 'חגים אוטומטיים', datetime('now'), 1, ?)
      ON CONFLICT (event_date, title, category, source_sheet) DO UPDATE SET
        hebrew_year = excluded.hebrew_year,
        is_school_holiday = excluded.is_school_holiday,
        all_day = 1
      WHERE calendar_events.hebrew_year IS NOT excluded.hebrew_year
        OR calendar_events.is_school_holiday IS NOT excluded.is_school_holiday
        OR calendar_events.all_day != 1
    `);
    let added = 0;
    for (const event of holidays) {
      added += insert.run(
        event.title, event.event_date, event.hebrew_year, event.category, event.is_school_holiday
      ).changes;
    }
    return added;
  })();
}

function getSchoolHoliday(db, date) {
  return db.prepare(`
    SELECT title FROM calendar_events WHERE event_date = ? AND is_school_holiday = 1 LIMIT 1
  `).get(date) || null;
}

module.exports = { addIsraeliHolidays, generateIsraeliHolidayEvents, getSchoolHoliday };