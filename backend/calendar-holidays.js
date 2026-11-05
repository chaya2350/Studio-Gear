const HOLIDAY_NAMES = [
  [/^Rosh Hashana \d+$/, 'ראש השנה'],
  [/^Rosh Hashana II$/, 'ראש השנה ב׳'],
  [/^Yom Kippur$/, 'יום כיפור'],
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

function gregorianDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function generateIsraeliHolidayEvents(startDate, endDate) {
  const { HebrewCalendar, flags } = await import('@hebcal/core');
  const includedFlags = flags.CHAG | flags.MINOR_HOLIDAY | flags.MAJOR_FAST |
    flags.MINOR_FAST | flags.CHOL_HAMOED | flags.MODERN_HOLIDAY;
  const holidays = [];

  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year++) {
    const events = HebrewCalendar.calendar({ year, isHebrewYear: false, il: true });
    for (const event of events) {
      if (!(event.getFlags() & includedFlags)) continue;
      const eventDate = gregorianDate(event.getDate().greg());
      if (eventDate < startDate || eventDate > endDate) continue;
      const title = HOLIDAY_NAMES.find(([pattern]) => pattern.test(event.getDesc()))?.[1];
      if (!title) continue;
      holidays.push({ title, event_date: eventDate, hebrew_year: event.getDate().getFullYear(), category: 'חג' });
    }
  }

  return holidays;
}

module.exports = { generateIsraeliHolidayEvents };