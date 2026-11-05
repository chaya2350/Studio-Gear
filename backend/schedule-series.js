function collectFutureScheduleOccurrences(db, { sourceSlot, seriesId, weeks }) {
  const linkedRows = db.prepare(`
    SELECT * FROM schedule_slots WHERE series_id = ? ORDER BY week_start
  `).all(seriesId);
  const byWeek = new Map(linkedRows.map(slot => [slot.week_start, slot]));
  const oneTimeDeletedWeeks = new Set(db.prepare(`
    SELECT DISTINCT week_start FROM schedule_change_log
    WHERE series_id = ? AND action = 'delete' AND change_scope = 'once'
  `).all(seriesId).map(row => row.week_start));
  const findLegacyOccurrences = db.prepare(`
    SELECT * FROM schedule_slots
    WHERE week_start = ? AND class_year = ? AND class_parallel = ? AND day_of_week = ?
      AND series_id IS NULL
    ORDER BY id
  `);
  const targets = [];

  for (const week of weeks) {
    if (week === sourceSlot.week_start) {
      targets.push({ ...sourceSlot, series_id: seriesId, isNewOccurrence: false });
      continue;
    }

    const linked = byWeek.get(week);
    if (linked) {
      if (linked.change_scope !== 'once') targets.push({ ...linked, isNewOccurrence: false });
      continue;
    }
    if (oneTimeDeletedWeeks.has(week)) continue;

    const legacy = findLegacyOccurrences.all(
      week, sourceSlot.class_year, sourceSlot.class_parallel, sourceSlot.day_of_week
    );
    let existing = legacy.length === 1 ? legacy[0] : null;
    if (legacy.length > 1) {
      const exactMatches = legacy.filter(slot =>
        Number(slot.teacher_id) === Number(sourceSlot.teacher_id) &&
        slot.start_time === sourceSlot.start_time &&
        String(slot.end_time || '') === String(sourceSlot.end_time || '') &&
        String(slot.subject || '') === String(sourceSlot.subject || '')
      );
      if (exactMatches.length === 1) existing = exactMatches[0];
      else return { targets: [], error: `נמצאו כמה שיעורים אפשריים באותה כיתה בשבוע ${week}` };
    }

    targets.push(existing
      ? { ...existing, series_id: seriesId, linkToSeries: true, isNewOccurrence: false }
      : { ...sourceSlot, id: null, week_start: week, series_id: seriesId, isNewOccurrence: true });
  }

  return { targets, error: '' };
}

module.exports = { collectFutureScheduleOccurrences };