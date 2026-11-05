function validateCalendarEventSettings({ all_day, start_time, end_time, class_scope, class_year, class_parallel }) {
  if (![0, 1, false, true].includes(all_day)) return 'בחירת משך האירוע אינה תקינה';
  if (!['all', 'grade', 'class'].includes(class_scope)) return 'יש לבחור לאילו כיתות האירוע מיועד';
  if (class_scope !== 'all' && !['ה', 'ו'].includes(String(class_year || ''))) {
    return 'יש לבחור שכבת גיל ה או ו';
  }
  if (class_scope === 'class' && !String(class_parallel || '').trim()) return 'יש לבחור כיתה';
  if (!all_day) {
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(String(start_time || '')) || !timePattern.test(String(end_time || '')) || start_time >= end_time) {
      return 'יש לבחור שעות תקינות, ושעת הסיום צריכה להיות מאוחרת משעת ההתחלה';
    }
  }
  return '';
}

function calendarEventAffectsLesson(event, lessonDate, classYear, classParallel, startTime, endTime) {
  if (event.event_date !== lessonDate || event.class_scope === 'none') return false;
  if (event.class_scope === 'grade' && event.class_year !== classYear) return false;
  if (event.class_scope === 'class' && (event.class_year !== classYear || String(event.class_parallel) !== String(classParallel))) return false;
  if (event.all_day) return true;
  return Boolean(event.start_time && event.end_time && endTime && event.start_time < endTime && event.end_time > startTime);
}

module.exports = { validateCalendarEventSettings, calendarEventAffectsLesson };