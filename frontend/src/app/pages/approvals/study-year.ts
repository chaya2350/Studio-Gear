const HEBREW_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת'];

export function toStudyYear(value?: string): string {
  const match = value?.trim().match(/^(?:(?:כיתה|שנה)\s*)?([א-ת])(?:[׳״']?)$/);
  if (!match) return value?.trim() || '';

  const gradeIndex = HEBREW_LETTERS.indexOf(match[1]);
  return gradeIndex >= 4 ? HEBREW_LETTERS[gradeIndex - 4] : match[1];
}
