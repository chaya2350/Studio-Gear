const { findClassTimeConflict } = require('./schedule-conflicts');

function copyScheduleWeekIfEmpty(db, { fromWeek, toWeek, validateSlot, createSeriesId = () => null, onCopied = () => {} }) {
  return db.transaction(() => {
    const destination = db.prepare(
      'SELECT 1 FROM schedule_slots WHERE week_start = ? LIMIT 1'
    ).get(toWeek);
    if (destination) return { copied: 0, skipped: 0, reason: 'destination_not_empty' };

    const sourceSlots = db.prepare(
      'SELECT * FROM schedule_slots WHERE week_start = ?'
    ).all(fromWeek);
    if (!sourceSlots.length) return { copied: 0, skipped: 0, reason: 'source_empty' };

    const insert = db.prepare(`
      INSERT INTO schedule_slots
          (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start, series_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateSeries = db.prepare('UPDATE schedule_slots SET series_id = ? WHERE id = ?');
    let copied = 0;
    let skipped = 0;
    for (const slot of sourceSlots) {
      if (!validateSlot(slot) || findClassTimeConflict(db, {
        class_year: slot.class_year,
        class_parallel: slot.class_parallel,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        week_start: toWeek
      })) {
        skipped++;
        continue;
      }
      const seriesId = slot.series_id || createSeriesId();
      if (!slot.series_id) updateSeries.run(seriesId, slot.id);
      const result = insert.run(
        slot.teacher_id, slot.class_year, slot.class_parallel, slot.day_of_week,
        slot.start_time, slot.end_time, slot.subject, toWeek, seriesId
      );
      copied += result.changes;
      onCopied({ ...slot, id: result.lastInsertRowid, series_id: seriesId, week_start: toWeek });
    }

    return {
      copied,
      skipped,
      reason: copied ? 'copied' : 'no_valid_slots'
    };
  })();
}

module.exports = { copyScheduleWeekIfEmpty };
