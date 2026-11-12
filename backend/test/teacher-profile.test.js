const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getWeekStart, collectTeacherUpcomingLessons, collectTeacherTrackOccurrences
} = require('../teacher-profile');

test('calculates the week start based on Israel week schedule', () => {
  assert.equal(getWeekStart('2026-10-29'), '2026-10-25');
  assert.equal(getWeekStart('2026-10-26'), '2026-10-25');
});

test('keeps only upcoming teacher lessons in the near future and sorts them by date', () => {
  const slots = [
    { id: 5, teacher_id: 7, class_year: 'ז', class_parallel: '1', day_of_week: 2, start_time: '09:00', end_time: '10:00', subject: 'תנ"ך', room_number: '312', room_name: 'כיתה ד׳', week_start: '2026-10-25' },
    { id: 6, teacher_id: 7, class_year: 'ז', class_parallel: '1', day_of_week: 4, start_time: '11:00', end_time: '12:00', subject: 'תנ"ך', week_start: '2026-10-25' },
    { id: 7, teacher_id: 7, class_year: 'ח', class_parallel: '2', day_of_week: 1, start_time: '14:00', end_time: '15:00', subject: 'אנגלית', week_start: '2026-11-01' },
    { id: 8, teacher_id: 7, class_year: 'ח', class_parallel: '2', day_of_week: 3, start_time: '07:00', end_time: '08:00', subject: 'אנגלית', week_start: '2026-11-01' },
    { id: 9, teacher_id: 7, class_year: 'ט', class_parallel: '3', day_of_week: 0, start_time: '08:30', end_time: '09:30', subject: 'גיאוגרפיה', week_start: '2026-10-18' }
  ];

  const lessons = collectTeacherUpcomingLessons(slots, '2026-10-29');

  assert.equal(lessons.length, 4);
  assert.deepEqual(lessons.map(l => l.class_name), ['ז1', 'ז1', 'ח2', 'ח2']);
  assert.deepEqual(lessons.map(l => l.week_start), ['2026-10-25', '2026-10-25', '2026-11-01', '2026-11-01']);
  assert.equal(lessons[0].room_number, '312');
  assert.equal(lessons[0].room_name, 'כיתה ד׳');
});

test('expands recurring track lessons for both weeks and preserves room details', () => {
  const slots = [{
    id: 8, teacher_id: 7, track_name: 'גרפיקה', study_year: 'ה', day_of_week: 2,
    start_time: '09:00', end_time: '10:00', subject: 'עיצוב',
    room_number: '312', room_name: 'כיתה ד׳',
  }];

  const recurring = collectTeacherTrackOccurrences(slots, '2026-10-25');
  const lessons = collectTeacherUpcomingLessons(recurring, '2026-10-29');

  assert.equal(lessons.length, 2);
  assert.deepEqual(lessons.map(lesson => lesson.week_start), ['2026-10-25', '2026-11-01']);
  assert.deepEqual(lessons.map(lesson => lesson.room_number), ['312', '312']);
  assert.deepEqual(lessons.map(lesson => lesson.room_name), ['כיתה ד׳', 'כיתה ד׳']);
  assert.ok(lessons.every(lesson => lesson.class_name === 'מסלול גרפיקה · שנה ה׳'));
});
