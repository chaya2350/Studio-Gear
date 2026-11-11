const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCalendarEventSettings, validateOptionalTimeRange, calendarEventAffectsLesson
} = require('../calendar-event-schedule');

const lesson = {
  event_date: '2026-11-05',
  all_day: 0,
  start_time: '10:00',
  end_time: '11:00',
  class_scope: 'all',
  class_year: null,
  class_parallel: null
};

test('all-class events affect every class during overlapping lesson times', () => {
  assert.equal(calendarEventAffectsLesson(lesson, '2026-11-05', 'ה', '1', '10:30', '11:10'), true);
  assert.equal(calendarEventAffectsLesson(lesson, '2026-11-05', 'ו', '4', '09:00', '10:00'), false);
});

test('grade and specific-class events only affect their selected classes', () => {
  assert.equal(calendarEventAffectsLesson({ ...lesson, class_scope: 'grade', class_year: 'ה' }, '2026-11-05', 'ה', '1', '10:00', '10:40'), true);
  assert.equal(calendarEventAffectsLesson({ ...lesson, class_scope: 'grade', class_year: 'ה' }, '2026-11-05', 'ו', '1', '10:00', '10:40'), false);
  assert.equal(calendarEventAffectsLesson({ ...lesson, class_scope: 'class', class_year: 'ו', class_parallel: '2' }, '2026-11-05', 'ו', '2', '10:00', '10:40'), true);
  assert.equal(calendarEventAffectsLesson({ ...lesson, class_scope: 'class', class_year: 'ו', class_parallel: '2' }, '2026-11-05', 'ו', '3', '10:00', '10:40'), false);
});

test('all-day events affect the selected class for the whole date', () => {
  assert.equal(calendarEventAffectsLesson({ ...lesson, all_day: 1 }, '2026-11-05', 'ה', '1', '08:00', '08:40'), true);
  assert.equal(calendarEventAffectsLesson({ ...lesson, all_day: 1 }, '2026-11-06', 'ה', '1', '10:00', '10:40'), false);
});

test('event settings reject missing classes and invalid time ranges', () => {
  assert.match(validateCalendarEventSettings({ all_day: 1, class_scope: 'none' }), /כיתות/);
  assert.match(validateCalendarEventSettings({ all_day: 0, start_time: '11:00', end_time: '10:00', class_scope: 'all' }), /שעות תקינות/);
  assert.equal(validateCalendarEventSettings({ all_day: 0, start_time: '10:00', end_time: '11:00', class_scope: 'all' }), '');
});

test('optional task and exam times require a valid complete range when either time is entered', () => {
  assert.equal(validateOptionalTimeRange('', ''), '');
  assert.equal(validateOptionalTimeRange('10:00', ''), 'יש לבחור שעות תקינות, ושעת הסיום צריכה להיות מאוחרת משעת ההתחלה');
  assert.equal(validateOptionalTimeRange('10:00', '11:00'), '');
  assert.match(validateOptionalTimeRange('', '', true), /להזין שעת התחלה וסיום/);
});