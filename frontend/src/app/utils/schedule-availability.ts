export interface ScheduleAvailabilityMap {
  kodesh: Record<string, Record<string, string>>;
  instruction: Record<string, Record<string, { start: string; end: string }>>;
}

export type PeriodAvailability = 'kodesh' | 'instruction' | 'track';

export function getPeriodAvailability(
  classYear: string,
  day: number,
  period: { start_time?: string; end_time?: string } | null | undefined,
  availability: ScheduleAvailabilityMap,
): PeriodAvailability {
  const year = String(classYear || '').trim().replace(/^שנה\s*/, '').replace(/[\u05f3\u05f4'"]/g, '');
  const normalizedDay = String(Number(day));
  const start = String(period?.start_time || '');
  const end = String(period?.end_time || '');
  if (!start || !end || end <= start) return 'track';

  const kodeshCutoff = availability.kodesh[year]?.[normalizedDay];
  if (kodeshCutoff && end <= kodeshCutoff) return 'kodesh';

  const instruction = availability.instruction[year]?.[normalizedDay];
  if (instruction && start >= instruction.start && end <= instruction.end) return 'instruction';

  return 'track';
}
