const KODESH_CUTOFFS = Object.freeze({
  'ה': Object.freeze({ 1: '12:20', 2: '13:15', 4: '13:15' }),
  'ו': Object.freeze({ 2: '12:20', 4: '14:10' })
});

const INSTRUCTION_WINDOWS = Object.freeze({
  'ה': Object.freeze({
    0: Object.freeze({ start: '00:00', end: '13:15' }),
    2: Object.freeze({ start: '13:15', end: '14:50' }),
    4: Object.freeze({ start: '13:15', end: '14:50' })
  }),
  'ו': Object.freeze({
    0: Object.freeze({ start: '00:00', end: '13:15' })
  })
});

function normalizeClassYear(year) {
  return String(year || '')
    .trim()
    .replace(/^שנה\s*/, '')
    .replace(/[\u05f3\u05f4'"]/g, '');
}

function getKodeshCutoff(classYear, dayOfWeek) {
  const year = normalizeClassYear(classYear);
  return KODESH_CUTOFFS[year]?.[Number(dayOfWeek)] || null;
}

function getInstructionWindow(classYear, dayOfWeek) {
  const year = normalizeClassYear(classYear);
  return INSTRUCTION_WINDOWS[year]?.[Number(dayOfWeek)] || null;
}

function getPeriodAvailability(classYear, dayOfWeek, period) {
  const start = String(period?.start_time || '');
  const end = String(period?.end_time || '');
  if (!start || !end || end <= start) return 'track';

  const kodeshCutoff = getKodeshCutoff(classYear, dayOfWeek);
  if (kodeshCutoff && end <= kodeshCutoff) return 'kodesh';

  const instruction = getInstructionWindow(classYear, dayOfWeek);
  if (instruction && start >= instruction.start && end <= instruction.end) return 'instruction';

  return 'track';
}

function validateKodeshSlot({ class_year, day_of_week, start_time, end_time }) {
  const cutoff = getKodeshCutoff(class_year, day_of_week);
  if (!cutoff) {
    return { valid: false, error: `לא מוגדרות שעות קודש לכיתה ${class_year} ביום זה` };
  }

  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(String(start_time || '')) || !timePattern.test(String(end_time || ''))) {
    return { valid: false, error: 'יש לבחור שעת התחלה וסיום תקינות מתוך מערכת השעות' };
  }
  if (end_time <= start_time) {
    return { valid: false, error: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' };
  }
  if (end_time > cutoff) {
    return { valid: false, error: `שיעור קודש לכיתה ${class_year} ביום זה יכול להסתיים עד ${cutoff} בלבד` };
  }

  return { valid: true, cutoff };
}

module.exports = {
  INSTRUCTION_WINDOWS,
  KODESH_CUTOFFS,
  getInstructionWindow,
  getKodeshCutoff,
  getPeriodAvailability,
  normalizeClassYear,
  validateKodeshSlot
};
