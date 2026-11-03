function copyScheduleWeekIfEmpty(db, { fromWeek, toWeek, validateSlot }) {
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
        (teacher_id, class_year, class_parallel, day_of_week, start_time, end_time, subject, week_start)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let copied = 0;
    let skipped = 0;
    for (const slot of sourceSlots) {
      if (!validateSlot(slot)) {
        skipped++;
        continue;
      }
      copied += insert.run(
        slot.teacher_id, slot.class_year, slot.class_parallel, slot.day_of_week,
        slot.start_time, slot.end_time, slot.subject, toWeek
      ).changes;
    }

    return {
      copied,
      skipped,
      reason: copied ? 'copied' : 'no_valid_slots'
    };
  })();
}

module.exports = { copyScheduleWeekIfEmpty };
