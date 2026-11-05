const test = require('node:test');
const assert = require('node:assert/strict');
const { validateScheduleChange, occurrenceChangeMetadata } = require('../schedule-change');

test('requires a valid scope, reason category, and written reason', () => {
  assert.match(validateScheduleChange({ scope: '', category: '', reason: '' }), /חד־פעמי או קבוע/);
  assert.match(validateScheduleChange({ scope: 'once', category: '', reason: 'פירוט' }), /סיבה/);
  assert.match(validateScheduleChange({ scope: 'permanent', category: 'absent_teacher', reason: '  ' }), /לפרט/);
  assert.equal(validateScheduleChange({ scope: 'once', category: 'seminary_constraints', reason: 'לו״ז סמינר' }), '');
  assert.equal(validateScheduleChange({ scope: 'permanent', category: 'replacement_teacher', reason: 'המורה צריכה להשלים חומר' }), '');
});

test('marks only the first week of a permanent teacher replacement', () => {
  const change = { scope: 'permanent', category: 'replacement_teacher', reason: 'החלפה' };
  const firstWeek = occurrenceChangeMetadata({
    change,
    changedWeekStart: '2026-11-01',
    occurrenceWeekStart: '2026-11-01',
    fromTeacherId: 1,
    fromTeacherName: 'מורה קודמת'
  });
  const nextWeek = occurrenceChangeMetadata({
    change,
    changedWeekStart: '2026-11-01',
    occurrenceWeekStart: '2026-11-08',
    fromTeacherId: 1,
    fromTeacherName: 'מורה קודמת'
  });

  assert.equal(firstWeek.change_from_teacher_name, 'מורה קודמת');
  assert.equal(firstWeek.change_reason, 'החלפה');
  assert.equal(nextWeek.change_from_teacher_name, null);
  assert.equal(nextWeek.change_reason, null);
});

test('keeps a one-time change marker on its single occurrence', () => {
  const metadata = occurrenceChangeMetadata({
    change: { scope: 'once', category: 'absent_teacher', reason: 'מחלה' },
    changedWeekStart: '2026-11-01',
    occurrenceWeekStart: '2026-11-01',
    fromTeacherId: 4,
    fromTeacherName: 'מורה מקורית'
  });

  assert.equal(metadata.change_from_teacher_name, 'מורה מקורית');
  assert.equal(metadata.change_reason, 'מחלה');
});