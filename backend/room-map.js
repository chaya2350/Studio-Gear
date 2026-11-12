const { DEFAULT_ROOMS } = require('./room-map-defaults');
const { studentHasTrack } = require('./database-report');
const { assignLesson } = require('./room-bookings');

const CURRENT_ROOM_MAP_REVISION = 'tashpaz_2027';

function initializeRoomMap(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      number TEXT PRIMARY KEY,
      floor REAL NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
      projector INTEGER NOT NULL CHECK (projector IN (0, 1)),
      air_conditioner TEXT NOT NULL DEFAULT '',
      computers INTEGER NOT NULL CHECK (computers IN (0, 1)),
      usable INTEGER NOT NULL CHECK (usable IN (0, 1)),
      capacity_needs_confirmation INTEGER NOT NULL CHECK (capacity_needs_confirmation IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS room_map_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schedule_room_defaults (
      kind TEXT NOT NULL CHECK (kind IN ('class', 'track')),
      class_year TEXT NOT NULL DEFAULT '',
      class_parallel TEXT NOT NULL DEFAULT '',
      track_id INTEGER NOT NULL DEFAULT 0,
      study_year TEXT NOT NULL DEFAULT '',
      room_number TEXT NOT NULL REFERENCES rooms(number) ON DELETE CASCADE,
      PRIMARY KEY (kind, class_year, class_parallel, track_id, study_year)
    );
  `);
  db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO rooms (number, floor, name, capacity, projector, air_conditioner,
        computers, usable, capacity_needs_confirmation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    if (!db.prepare("SELECT 1 FROM room_map_settings WHERE key = 'initial_rooms'").get()) {
      for (const room of DEFAULT_ROOMS) {
        insert.run(room.number, room.floor, room.name, room.capacity, Number(room.projector),
          room.airConditioner, Number(room.computers), Number(room.usable), Number(room.capacityNeedsConfirmation));
      }
      db.prepare("INSERT INTO room_map_settings (key, value) VALUES ('initial_rooms', '1')").run();
    }

    if (db.prepare('SELECT 1 FROM room_map_settings WHERE key = ?').get(CURRENT_ROOM_MAP_REVISION)) return;
    const update = db.prepare(`
      INSERT INTO rooms (number, floor, name, capacity, projector, air_conditioner,
        computers, usable, capacity_needs_confirmation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(number) DO UPDATE SET floor = excluded.floor, name = excluded.name,
        capacity = excluded.capacity, projector = excluded.projector,
        air_conditioner = excluded.air_conditioner, computers = excluded.computers,
        usable = excluded.usable, capacity_needs_confirmation = excluded.capacity_needs_confirmation
    `);
    for (const room of DEFAULT_ROOMS) {
      update.run(room.number, room.floor, room.name, room.capacity, Number(room.projector),
        room.airConditioner, Number(room.computers), Number(room.usable), Number(room.capacityNeedsConfirmation));
    }
    db.prepare('DELETE FROM schedule_room_defaults WHERE room_number IN (SELECT number FROM rooms WHERE usable = 0)').run();
    db.prepare('INSERT INTO room_map_settings (key, value) VALUES (?, ?)').run(CURRENT_ROOM_MAP_REVISION, '1');
  })();
}

function validateRoomUpdate(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100)
    return 'יש להזין שם חדר באורך של עד 100 תווים';
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 0 || input.capacity > 10000))
    return 'מספר המקומות חייב להיות מספר שלם שאינו שלילי';
  if (typeof input.air_conditioner !== 'string' || input.air_conditioner.length > 100)
    return 'מספר המזגן אינו תקין';
  for (const key of ['projector', 'computers', 'usable', 'capacity_needs_confirmation']) {
    if (typeof input[key] !== 'boolean') return 'פרטי החדר אינם תקינים';
  }
  return '';
}

function getRoomDefault(db, { kind, classYear = '', classParallel = '', trackId = 0, studyYear = '' }) {
  return db.prepare(`
    SELECT room_number FROM schedule_room_defaults
    WHERE kind = ? AND class_year = ? AND class_parallel = ? AND track_id = ? AND study_year = ?
  `).get(kind, classYear, classParallel, trackId, studyYear)?.room_number || null;
}

function applyRoomDefaultsToExistingLessons(db) {
  const result = { kodeshAssigned: 0, trackAssigned: 0, skippedConflicts: 0 };
  const hasTable = name => Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name));

  if (hasTable('schedule_slots') && hasTable('room_lesson_bookings')) {
    const slots = db.prepare(`
      SELECT s.*, d.room_number
      FROM schedule_slots s
      JOIN schedule_room_defaults d ON d.kind = 'class'
        AND d.class_year = s.class_year AND d.class_parallel = s.class_parallel
      LEFT JOIN room_lesson_bookings b ON b.slot_id = s.id
      WHERE b.slot_id IS NULL
    `).all();
    for (const slot of slots) {
      try {
        assignLesson(db, slot, slot.room_number);
        result.kodeshAssigned++;
      } catch {
        result.skippedConflicts++;
      }
    }
  }

  if (hasTable('track_schedule_slots') && hasTable('room_manual_bookings')) {
    const slots = db.prepare(`
      SELECT s.id, s.day_of_week, s.start_time, s.end_time, s.room_number,
        d.room_number AS default_room_number
      FROM track_schedule_slots s
      JOIN schedule_room_defaults d ON d.kind = 'track'
        AND d.track_id = s.track_id AND d.study_year = s.study_year
      WHERE s.room_number IS NULL
    `).all();
    const trackConflict = db.prepare(`
      SELECT 1 FROM track_schedule_slots
      WHERE room_number = ? AND day_of_week = ?
        AND start_time < ? AND end_time > ? AND id != ? LIMIT 1
    `);
    const manualConflict = db.prepare(`
      SELECT 1 FROM room_manual_bookings
      WHERE room_number = ? AND day_of_week = ? AND start_time < ? AND end_time > ? LIMIT 1
    `);
    const kodeshConflict = db.prepare(`
      SELECT 1 FROM room_lesson_bookings b
      JOIN schedule_slots s ON s.id = b.slot_id
      WHERE b.room_number = ? AND s.day_of_week = ?
        AND s.start_time < ? AND COALESCE(s.end_time, s.start_time) > ?
        AND date(s.week_start, '+' || s.day_of_week || ' days') >= date('now')
      LIMIT 1
    `);
    const usableRoom = db.prepare('SELECT 1 FROM rooms WHERE number = ? AND usable = 1');
    const update = db.prepare(`
      UPDATE track_schedule_slots SET room_number = ?, updated_at = datetime('now')
      WHERE id = ? AND room_number IS NULL
    `);
    for (const slot of slots) {
      const roomNumber = slot.default_room_number;
      if (!usableRoom.get(roomNumber) ||
          trackConflict.get(roomNumber, slot.day_of_week, slot.end_time, slot.start_time, slot.id) ||
          manualConflict.get(roomNumber, slot.day_of_week, slot.end_time, slot.start_time) ||
          kodeshConflict.get(roomNumber, slot.day_of_week, slot.end_time, slot.start_time)) {
        result.skippedConflicts++;
        continue;
      }
      result.trackAssigned += update.run(roomNumber, slot.id).changes;
    }
  }

  return result;
}

function registerRoomMapRoutes(app, db) {
  app.get('/api/schedule/room-map', (req, res) => {
    res.json(db.prepare('SELECT * FROM rooms ORDER BY floor DESC, number DESC').all());
  });
  app.put('/api/schedule/room-map/:number', (req, res) => {
    const error = validateRoomUpdate(req.body);
    if (error) return res.status(400).json({ error });
    const room = req.body;
    const result = db.prepare(`
      UPDATE rooms SET name = ?, capacity = ?, projector = ?, air_conditioner = ?,
        computers = ?, usable = ?, capacity_needs_confirmation = ? WHERE number = ?
    `).run(room.name.trim(), room.capacity, Number(room.projector), room.air_conditioner.trim(),
      Number(room.computers), Number(room.usable), Number(room.capacity_needs_confirmation), req.params.number);
    if (!result.changes) return res.status(404).json({ error: 'החדר לא נמצא' });
    if (!room.usable) db.prepare('DELETE FROM schedule_room_defaults WHERE room_number = ?').run(req.params.number);
    res.json({ success: true });
  });
  app.get('/api/schedule/room-defaults', (req, res) => {
    const classes = db.prepare(`
      SELECT DISTINCT TRIM(year) AS class_year, TRIM(parallel) AS class_parallel
      FROM students
      WHERE TRIM(COALESCE(year, '')) <> '' AND TRIM(COALESCE(parallel, '')) <> ''
      ORDER BY class_year, class_parallel
    `).all();
    const activeTracks = db.prepare(`
      SELECT id, name FROM tracks WHERE merged_into IS NULL ORDER BY name COLLATE NOCASE
    `).all();
    const students = db.prepare('SELECT track, year FROM students WHERE track IS NOT NULL').all();
    const tracks = activeTracks.map(track => {
      const aliases = [track.name, ...db.prepare('SELECT name FROM tracks WHERE merged_into = ?').all(track.id).map(row => row.name)];
      return {
        ...track,
        years: ['ה', 'ו'].map(year => ({
          year,
          student_count: students.filter(student => student.year === year &&
            aliases.some(alias => studentHasTrack(student.track, alias))).length
        }))
      };
    });
    res.json({
      rooms: db.prepare('SELECT number, name FROM rooms WHERE usable = 1 ORDER BY floor DESC, number').all(),
      classes,
      tracks,
      class_defaults: db.prepare("SELECT class_year, class_parallel, room_number FROM schedule_room_defaults WHERE kind = 'class'").all(),
      track_defaults: db.prepare("SELECT track_id, study_year, room_number FROM schedule_room_defaults WHERE kind = 'track'").all()
    });
  });
  app.put('/api/schedule/room-defaults', (req, res) => {
    const { kind, room_number: rawRoomNumber } = req.body || {};
    const roomNumber = rawRoomNumber == null || rawRoomNumber === '' ? null : String(rawRoomNumber).trim();
    let key;
    if (kind === 'class') {
      const classYear = String(req.body.class_year || '').trim();
      const classParallel = String(req.body.class_parallel || '').trim();
      if (!classYear || !classParallel || classYear.length > 20 || classParallel.length > 20) {
        return res.status(400).json({ error: 'יש לבחור כיתה תקינה' });
      }
      key = ['class', classYear, classParallel, 0, ''];
    } else if (kind === 'track') {
      const trackId = Number(req.body.track_id);
      const studyYear = String(req.body.study_year || '').trim();
      if (!Number.isSafeInteger(trackId) || trackId < 1 || !['ה', 'ו'].includes(studyYear) ||
          !db.prepare('SELECT 1 FROM tracks WHERE id = ? AND merged_into IS NULL').get(trackId)) {
        return res.status(400).json({ error: 'יש לבחור מסלול ושנה תקינים' });
      }
      key = ['track', '', '', trackId, studyYear];
    } else {
      return res.status(400).json({ error: 'סוג ברירת המחדל אינו תקין' });
    }
    if (roomNumber) {
      const room = db.prepare('SELECT 1 FROM rooms WHERE number = ? AND usable = 1').get(roomNumber);
      if (!room) return res.status(400).json({ error: 'החדר שנבחר אינו זמין לשיבוץ' });
      db.prepare(`
        INSERT INTO schedule_room_defaults (kind, class_year, class_parallel, track_id, study_year, room_number)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(kind, class_year, class_parallel, track_id, study_year)
        DO UPDATE SET room_number = excluded.room_number
      `).run(...key, roomNumber);
    } else {
      db.prepare(`
        DELETE FROM schedule_room_defaults
        WHERE kind = ? AND class_year = ? AND class_parallel = ? AND track_id = ? AND study_year = ?
      `).run(...key);
    }
    res.json({ success: true });
  });
  app.post('/api/schedule/room-defaults/apply', (req, res) => {
    res.json({ success: true, ...applyRoomDefaultsToExistingLessons(db) });
  });
}

module.exports = {
  initializeRoomMap, registerRoomMapRoutes, validateRoomUpdate, getRoomDefault,
  applyRoomDefaultsToExistingLessons
};
