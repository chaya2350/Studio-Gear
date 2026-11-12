const YEAR_MAP: Record<string, string> = {
  'א': 'א',
  'ב': 'ב',
  'ג': 'ג',
  'ד': 'עולה לשנה א׳',
  'ה': 'א',
  'ו': 'ב'
};

export function toStudyYear(value?: string): string {
const raw = value?.trim() || '';
const clean = raw.replace(/[\u2018\u2019\u05F3\u05F4"'`]/g, '').replace(/\s+/g, '');
if (clean === 'עולהלשנהא') return 'עולה לשנה א׳';
const match = raw.match(/^(?:(?:כיתה|שנה)\s*)?([א-ת])(?:[׳״']?)$/);
if (!match) return raw;

return YEAR_MAP[match[1]] ?? match[1];
}
