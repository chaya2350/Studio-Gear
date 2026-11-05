function overlaps(aStart, aEnd, bStart, bEnd) {
  const normalizedAEnd = aEnd && aEnd > aStart ? aEnd : aStart;
  const normalizedBEnd = bEnd && bEnd > bStart ? bEnd : bStart;
  return aStart === bStart || (aStart < normalizedBEnd && bStart < normalizedAEnd);
}

function findClassTimeConflict(db, {
  class_year,
  class_parallel,
  day_of_week,
  start_time,
  end_time,
  week_start,
  excludeId = 0
}) {
  const slots = db.prepare(`
    SELECT * FROM schedule_slots
    WHERE week_start = ? AND class_year = ? AND class_parallel = ?
      AND day_of_week = ? AND id != ?
  `).all(
    week_start,
    String(class_year),
    String(class_parallel),
    Number(day_of_week),
    Number(excludeId)
  );

  return slots.find(slot =>
    overlaps(start_time, end_time, slot.start_time, slot.end_time)
  );
}

function findTeacherTimeConflicts(db, {
  teacher_id,
  day_of_week,
  start_time,
  end_time,
  week_start,
  excludeId = 0
}) {
  const slots = db.prepare(`
    SELECT * FROM schedule_slots
    WHERE week_start = ? AND teacher_id = ? AND day_of_week = ? AND id != ?
  `).all(week_start, Number(teacher_id), Number(day_of_week), Number(excludeId));

  return slots.filter(slot =>
    overlaps(start_time, end_time, slot.start_time, slot.end_time)
  );
}

module.exports = { findClassTimeConflict, findTeacherTimeConflicts };
