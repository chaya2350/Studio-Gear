import { HDate, months } from '@hebcal/core';

const HEBREW_MONTHS: Record<number, string> = {
  [months.TISHREI]: 'תשרי',
  [months.CHESHVAN]: 'חשוון',
  [months.KISLEV]: 'כסלו',
  [months.TEVET]: 'טבת',
  [months.SHVAT]: 'שבט',
  [months.ADAR_I]: 'אדר א׳',
  [months.ADAR_II]: 'אדר ב׳',
  [months.NISAN]: 'ניסן',
  [months.IYYAR]: 'אייר',
  [months.SIVAN]: 'סיוון',
  [months.TAMUZ]: 'תמוז',
  [months.AV]: 'אב',
  [months.ELUL]: 'אלול',
};

function toHebrewNumeral(value: number): string {
  const values: [number, string][] = [
    [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
    [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
    [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
    [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'],
    [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
  ];
  let remaining = value;
  let letters = '';

  for (const [amount, letter] of values) {
    if (remaining === 15) {
      letters += 'טו';
      break;
    }
    if (remaining === 16) {
      letters += 'טז';
      break;
    }
    while (remaining >= amount) {
      letters += letter;
      remaining -= amount;
    }
  }

  if (letters.length === 1) return `${letters}׳`;
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

export function formatHebrewDate(date: Date): string {
  const hebrewDate = new HDate(date);
  const year = hebrewDate.getFullYear();
  const month = hebrewDate.getMonth() === months.ADAR_I && !HDate.isLeapYear(year)
    ? 'אדר'
    : HEBREW_MONTHS[hebrewDate.getMonth()];
  const hebrewYear = year - 5000;

  return `${toHebrewNumeral(hebrewDate.getDate())} ב${month} ה׳${toHebrewNumeral(hebrewYear)}`;
}
