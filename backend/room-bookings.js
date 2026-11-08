const { calendarEventAffectsLesson } = require('./calendar-event-schedule');

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateInfo(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const week = new Date(`${date}T12:00:00Z`);
  week.setUTCDate(week.getUTCDate() - day);
  return { day, week: week.toISOString().slice(0, 10) };
}

function validTime(start, end) {
  return typeof start === 'string' && typeof end === 'string' && TIME.test(start) && TIME.test(end) && start < end;
}

function initializeRoomBookings(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_manual_bookings (
      id INTEGER PRIMARY KEY,
      room_number TEXT NOT NULL REFERENCES rooms(number),
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS room_lesson_bookings (
      slot_id INTEGER PRIMARY KEY REFERENCES schedule_slots(id) ON DELETE CASCADE,
      room_number TEXT NOT NULL REFERENCES rooms(number)
    );
    CREATE TRIGGER IF NOT EXISTS room_slot_delete AFTER DELETE ON schedule_slots
      BEGIN DELETE FROM room_lesson_bookings WHERE slot_id = OLD.id; END;
    DROP TRIGGER IF EXISTS room_slot_update;
    CREATE TRIGGER room_slot_update BEFORE UPDATE OF week_start, day_of_week, start_time, end_time ON schedule_slots
    WHEN EXISTS (SELECT 1 FROM room_lesson_bookings WHERE slot_id = OLD.id)
    BEGIN
      SELECT CASE WHEN NEW.end_time IS NULL OR NEW.start_time NOT GLOB '[0-2][0-9]:[0-5][0-9]'
        OR NEW.end_time NOT GLOB '[0-2][0-9]:[0-5][0-9]'
        OR substr(NEW.start_time, 1, 2) > '23' OR substr(NEW.end_time, 1, 2) > '23'
        OR NEW.end_time <= NEW.start_time THEN RAISE(ABORT, 'ROOM_INVALID_TIME') END;
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM room_lesson_bookings mine JOIN room_lesson_bookings other
          ON other.room_number = mine.room_number AND other.slot_id != mine.slot_id
        JOIN schedule_slots s ON s.id = other.slot_id
        WHERE mine.slot_id = OLD.id AND s.week_start = NEW.week_start AND s.day_of_week = NEW.day_of_week
          AND NEW.start_time < s.end_time AND s.start_time < NEW.end_time
      ) OR EXISTS (
        SELECT 1 FROM room_lesson_bookings mine JOIN room_manual_bookings b ON b.room_number = mine.room_number
        WHERE mine.slot_id = OLD.id AND b.day_of_week = NEW.day_of_week
          AND date(NEW.week_start, '+' || NEW.day_of_week || ' days') >= b.start_date
          AND NEW.start_time < b.end_time AND b.start_time < NEW.end_time
      ) THEN RAISE(ABORT, 'ROOM_CONFLICT') END;
    END;
  `);
}

function findConflict(db, room, date, start, end, excludeSlot = 0, excludeManual = 0) {
  const { day, week } = dateInfo(date);
  const manual = db.prepare(`
    SELECT id, title FROM room_manual_bookings WHERE room_number = ? AND day_of_week = ?
      AND start_date <= ? AND start_time < ? AND end_time > ? AND id != ?
    LIMIT 1
  `).get(room, day, date, end, start, excludeManual);
  if (manual) return manual;
  return db.prepare(`
    SELECT s.id, s.subject AS title FROM room_lesson_bookings b
    JOIN schedule_slots s ON s.id = b.slot_id
    WHERE b.room_number = ? AND s.week_start = ? AND s.day_of_week = ?
      AND s.start_time < ? AND s.end_time > ? AND s.id != ?
    LIMIT 1
  `).get(room, week, day, end, start, excludeSlot);
}

function assignLesson(db, slot, room) {
  if (!validTime(slot.start_time, slot.end_time)) throw new Error('לשיעור חייבות להיות שעות התחלה וסיום תקינות');
  const date = new Date(`${slot.week_start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(slot.day_of_week));
  const dateString = date.toISOString().slice(0, 10);
  if (findConflict(db, room, dateString, slot.start_time, slot.end_time, slot.id))
    throw new Error(`החדר תפוס בתאריך ${dateString}`);
  db.prepare('INSERT INTO room_lesson_bookings (slot_id, room_number) VALUES (?, ?) ON CONFLICT(slot_id) DO UPDATE SET room_number = excluded.room_number')
    .run(slot.id, room);
}

function copyLessonRoom(db, fromId, toId) {
  const booking = db.prepare('SELECT room_number FROM room_lesson_bookings WHERE slot_id = ?').get(fromId);
  if (!booking) return;
  if (db.prepare('SELECT 1 FROM room_lesson_bookings WHERE slot_id = ?').get(toId)) return;
  const room = db.prepare('SELECT usable FROM rooms WHERE number = ?').get(booking.room_number);
  if (!room || !room.usable) throw new Error('החדר המשובץ אינו זמין לשימוש');
  const slot = db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(toId);
  assignLesson(db, slot, booking.room_number);
}

function saveManualBooking(db, room, date, start, end, title, id = 0) {
  if (!validDate(date) || !validTime(start, end) || typeof title !== 'string' || !title.trim() || title.length > 200)
    throw new Error('יש להזין תאריך, תיאור ושעות תקינות');
  const { day } = dateInfo(date);
  const overlap = db.prepare(`
    SELECT 1 FROM room_manual_bookings WHERE room_number = ? AND day_of_week = ?
      AND start_time < ? AND end_time > ? AND id != ? LIMIT 1
  `).get(room, day, end, start, id);
  if (overlap) throw new Error('קיים שיבוץ שבועי חופף בחדר זה');
  const future = db.prepare(`
    SELECT s.* FROM room_lesson_bookings b JOIN schedule_slots s ON s.id = b.slot_id
    WHERE b.room_number = ? AND s.day_of_week = ? AND date(s.week_start, '+' || s.day_of_week || ' days') >= ?
      AND s.start_time < ? AND s.end_time > ? LIMIT 1
  `).get(room, day, date, end, start);
  if (future) throw new Error('קיים שיעור משובץ בחדר בשעה זו באחד השבועות הבאים');
  if (id) {
    db.prepare('UPDATE room_manual_bookings SET title = ?, start_date = ?, day_of_week = ?, start_time = ?, end_time = ? WHERE id = ?')
      .run(title.trim(), date, day, start, end, id);
  } else {
    db.prepare('INSERT INTO room_manual_bookings (room_number, title, start_date, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)')
      .run(room, title.trim(), date, day, start, end);
  }
}

function registerRoomBookingRoutes(app, db, { ensureHolidays, holidayForDate }) {
  app.get('/api/schedule/room-bookings', async (req, res) => {
    const date = req.query.date;
    const start = req.query.start;
    const end = req.query.end;
    if (!validDate(date) || !validTime(start, end))
      return res.status(400).json({ error: 'יש לבחור תאריך ושעות תקינים' });
    await ensureHolidays();
    const { day, week } = dateInfo(date);
    const manual = db.prepare(`
      SELECT id, room_number, title, start_date, start_time, end_time FROM room_manual_bookings
      WHERE day_of_week = ? AND start_date <= ? AND start_time < ? AND end_time > ?
    `).all(day, date, end, start).map(b => ({ ...b, kind: 'manual' }));
    const lessons = db.prepare(`
      SELECT s.*, t.name AS teacher_name, b.room_number
      FROM schedule_slots s JOIN teachers t ON t.id = s.teacher_id
      LEFT JOIN room_lesson_bookings b ON b.slot_id = s.id
      WHERE s.week_start = ? AND s.day_of_week = ?
      ORDER BY s.start_time, s.class_year, s.class_parallel
    `).all(week, day);
    const events = db.prepare("SELECT * FROM calendar_events WHERE event_date = ? AND source_sheet = 'ידני' AND class_scope != 'none'").all(date);
    const holiday = holidayForDate(date);
    const cancelled = slot => Boolean(holiday || events.some(event => calendarEventAffectsLesson(
      event, date, slot.class_year, slot.class_parallel, slot.start_time, slot.end_time
    )));
    const occupied = lessons.filter(s => s.room_number && s.start_time < end && s.end_time > start)
      .map(s => ({ id: s.id, room_number: s.room_number, title: `${s.subject || 'שיעור'} · ${s.class_year}${s.class_parallel} · ${s.teacher_name}`,
        start_time: s.start_time, end_time: s.end_time, kind: 'lesson', cancelled: cancelled(s) }));
    const choices = lessons.filter(s => !s.room_number && !cancelled(s) && validTime(s.start_time, s.end_time));
    res.json({ bookings: [...manual, ...occupied], lessons: choices, holiday: holiday ? holiday.title : null });
  });

  app.post('/api/schedule/room-bookings', async (req, res) => {
    const { room_number, kind, date, start_time, end_time, title, slot_id, series } = req.body || {};
    if (typeof room_number !== 'string' || !validDate(date) || !['manual', 'lesson'].includes(kind))
      return res.status(400).json({ error: 'פרטי השיבוץ אינם תקינים' });
    if (kind === 'lesson') {
      if (!Number.isInteger(slot_id) || typeof series !== 'boolean')
        return res.status(400).json({ error: 'בחירת השיעור אינה תקינה' });
      await ensureHolidays();
      const slot = db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(slot_id);
      if (slot) {
        const events = db.prepare("SELECT * FROM calendar_events WHERE event_date = ? AND source_sheet = 'ידני' AND class_scope != 'none'").all(date);
        if (holidayForDate(date) || events.some(event => calendarEventAffectsLesson(
          event, date, slot.class_year, slot.class_parallel, slot.start_time, slot.end_time
        ))) return res.status(409).json({ error: 'לא ניתן לשבץ שיעור שבוטל או חל בחופשה' });
      }
    }
    const room = db.prepare('SELECT * FROM rooms WHERE number = ?').get(room_number);
    if (!room || !room.usable) return res.status(400).json({ error: 'החדר אינו זמין לשיבוץ' });
    try {
      db.transaction(() => {
        if (kind === 'manual') {
          saveManualBooking(db, room_number, date, start_time, end_time, title);
        } else {
          const slot = db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(slot_id);
          const info = dateInfo(date);
          if (!slot || slot.week_start !== info.week || slot.day_of_week !== info.day) throw new Error('השיעור אינו שייך ליום שנבחר');
          const targets = series && slot.series_id
            ? db.prepare(`
              SELECT s.* FROM schedule_slots s
              WHERE s.series_id = ? AND s.week_start >= ?
                AND (s.id = ? OR NOT EXISTS (SELECT 1 FROM room_lesson_bookings b WHERE b.slot_id = s.id))
              ORDER BY s.week_start
            `).all(slot.series_id, slot.week_start, slot.id)
            : [slot];
          for (const target of targets) assignLesson(db, target, room_number);
        }
      }).immediate();
      res.json({ success: true });
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });
  app.put('/api/schedule/room-bookings/manual/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'שיבוץ לא תקין' });
    const booking = db.prepare('SELECT * FROM room_manual_bookings WHERE id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'השיבוץ לא נמצא' });
    const { date, start_time, end_time, title } = req.body || {};
    try {
      db.transaction(() => saveManualBooking(db, booking.room_number, date, start_time, end_time, title, booking.id)).immediate();
      res.json({ success: true });
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });
  app.delete('/api/schedule/room-bookings/:kind/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id) || !['manual', 'lesson'].includes(req.params.kind))
      return res.status(400).json({ error: 'שיבוץ לא תקין' });
    const statement = req.params.kind === 'manual'
      ? 'DELETE FROM room_manual_bookings WHERE id = ?'
      : 'DELETE FROM room_lesson_bookings WHERE slot_id = ?';
    const result = db.prepare(statement).run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'השיבוץ לא נמצא' });
    res.json({ success: true });
  });
}

module.exports = { initializeRoomBookings, registerRoomBookingRoutes, assignLesson, copyLessonRoom, findConflict, validDate, validTime };
