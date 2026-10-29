const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];

function toDateAtNoon(dateLike) {
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    return new Date(`${dateLike}T12:00:00`);
  }
  return new Date(dateLike);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekStart(dateStr) {
  const d = toDateAtNoon(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return formatDate(d);
}

function addDays(dateStr, days) {
  const d = toDateAtNoon(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function collectTeacherUpcomingLessons(slots = [], asOfDateStr) {
  const referenceWeekStart = getWeekStart(asOfDateStr || new Date().toISOString().slice(0, 10));
  const maxWeekStart = addDays(referenceWeekStart, 7);

  return slots
    .filter((slot) => slot && slot.week_start >= referenceWeekStart && slot.week_start <= maxWeekStart)
    .map((slot) => ({
      id: slot.id,
      teacher_id: slot.teacher_id,
      class_year: slot.class_year,
      class_parallel: slot.class_parallel,
      class_name: `${slot.class_year}${slot.class_parallel}`,
      day_of_week: Number(slot.day_of_week),
      day_name: DAYS_HE[Number(slot.day_of_week)] || '',
      lesson_date: addDays(slot.week_start, Number(slot.day_of_week)),
      start_time: slot.start_time,
      end_time: slot.end_time || '',
      subject: slot.subject || slot.teacher_subject || '',
      week_start: slot.week_start
    }))
    .sort((a, b) => (a.lesson_date + a.start_time).localeCompare(b.lesson_date + b.start_time));
}

module.exports = {
  getWeekStart,
  addDays,
  collectTeacherUpcomingLessons
};
