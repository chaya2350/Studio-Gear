const YEAR_MAP: Record<string, string> = { 'א': 'ה', 'ב': 'ו' };

export function toStudyYear(value?: string): string {
const match = value?.trim().match(/^(?:(?:כיתה|שנה)\s*)?([א-ת])(?:[׳״']?)$/);
if (!match) return value?.trim() || '';

return YEAR_MAP[match[1]] ?? match[1];
}
