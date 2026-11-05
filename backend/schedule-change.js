const CHANGE_CATEGORIES = new Set(['seminary_constraints', 'absent_teacher', 'replacement_teacher']);
const CHANGE_SCOPES = new Set(['once', 'permanent']);

function validateScheduleChange({ scope, category, reason }) {
  if (!CHANGE_SCOPES.has(scope)) return 'יש לבחור אם השינוי חד־פעמי או קבוע';
  if (!CHANGE_CATEGORIES.has(category)) return 'יש לבחור סיבה לשינוי';
  if (!String(reason || '').trim()) return 'יש לפרט את סיבת השינוי';
  return '';
}

function occurrenceChangeMetadata({ change, changedWeekStart, occurrenceWeekStart, fromTeacherId, fromTeacherName }) {
  const markOccurrence = change.scope === 'once' || changedWeekStart === occurrenceWeekStart;
  return {
    change_scope: markOccurrence ? change.scope : null,
    change_category: markOccurrence ? change.category : null,
    change_reason: markOccurrence ? change.reason : null,
    change_from_teacher_id: markOccurrence ? fromTeacherId : null,
    change_from_teacher_name: markOccurrence ? fromTeacherName : null
  };
}

module.exports = { CHANGE_CATEGORIES, CHANGE_SCOPES, validateScheduleChange, occurrenceChangeMetadata };