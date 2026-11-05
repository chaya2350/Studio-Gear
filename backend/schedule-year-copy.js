const { findClassTimeConflict } = require('./schedule-conflicts');

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function copyScheduleAcrossYear(db, { sourceWeek, firstWeek, throughDate, validateSlot, createSeriesId }) {
  return db.transaction(() => {
    const sourceSlots = db.prepare('SELECT * FROM schedule_slots WHERE week_start = ? ORDER BY id').all(sourceWeek);
    if (!sourceSlots.length) return { inserted: 0, linked: 0, skipped: 0, reason: 'source_empty' };
    if (sourceSlots.some(slot => slot.change_scope === 'once')) {
      return { inserted: 0, linked: 0, skipped: 0, reason: 'source_has_one_time_changes' };
    }

    const updateSeries = db.prepare('UPDATE schedule_slots SET series_id = ? WHERE id = ?');
    const templates = sourceSlots.map(slot => {
      const seriesId = slot.series_id || createSeriesId();
      if (!slot.series_id) updateSeries.run(seriesId, slot.id);
      return { ...slot, series_id: seriesId };
    });
    const insertSlot = db.prepare(`
      INSERT INTO schedule_slots
        (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, series_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findSeries = db.prepare('SELECT id FROM schedule_slots WHERE week_start = ? AND series_id = ?');
    const findUnlinkedMatch = db.prepare(`
      SELECT id FROM schedule_slots
      WHERE week_start = ? AND class_year = ? AND class_parallel = ? AND day_of_week = ?
        AND series_id IS NULL
      ORDER BY id
    `);

    let inserted = 0;
    let linked = 0;
    let skipped = 0;
    for (let week = firstWeek; week <= throughDate; week = addDays(week, 7)) {
      if (week === sourceWeek) continue;
      const claimed = new Set();
      for (const slot of templates) {
        if (addDays(week, Number(slot.day_of_week)) > throughDate) continue;
        if (findSeries.get(week, slot.series_id)) continue;
        const candidates = findUnlinkedMatch.all(
          week, slot.class_year, slot.class_parallel, slot.day_of_week
        ).filter(candidate => !claimed.has(candidate.id));
        if (candidates.length === 1) {
          updateSeries.run(slot.series_id, candidates[0].id);
          claimed.add(candidates[0].id);
          linked++;
          continue;
        }
        if (!validateSlot(slot) || findClassTimeConflict(db, {
          class_year: slot.class_year,
          class_parallel: slot.class_parallel,
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
          week_start: week
        })) {
          skipped++;
          continue;
        }
        inserted += insertSlot.run(
          slot.teacher_id, slot.class_year, slot.class_parallel, slot.day_of_week,
          slot.start_time, slot.end_time, slot.subject, week, slot.series_id
        ).changes;
      }
    }
    return { inserted, linked, skipped, reason: 'completed' };
  })();
}

module.exports = { copyScheduleAcrossYear };