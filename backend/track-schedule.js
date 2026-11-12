const { studentHasTrack } = require('./database-report');
const { getPeriodAvailability } = require('./schedule-availability');
const { findConflict, validTime } = require('./room-bookings');

const STUDY_YEARS = ['ה', 'ו'];
const DAYS = [0, 1, 2, 3, 4];
const SPECIALIZATION_ALIASES = new Map([
  ['מת', 'מתמטיקה'],
  ['מתמטיקה', 'מתמטיקה'],
  ['ספורט', 'ספורטטיפולי'],
  ['ספורטטיפולי', 'ספורטטיפולי'],
  ['חנמ', 'חינוךמיוחד'],
  ['חנם', 'חינוךמיוחד'],
  ['חינוךמיוחד', 'חינוךמיוחד'],
  ['תכנות', 'הנדסאים'],
  ['הנדסאים', 'הנדסאים'],
  ['רוח', 'ראייתחשבון'],
  ['ראייתחשבון', 'ראייתחשבון']
]);

function normalizeTrackSpecialization(value) {
  const compact = String(value || '').normalize('NFKC').toLocaleLowerCase('he')
    .replace(/[\s\-־.'"׳״`]/g, '');
  return SPECIALIZATION_ALIASES.get(compact) || compact;
}

function teacherMatchesTrack(specialization, trackNames) {
  const teacherSpecializations = String(specialization || '').split(/[;,،]/)
    .map(normalizeTrackSpecialization).filter(Boolean);
  return teacherSpecializations.some(teacherSpecialization => trackNames.some(name =>
    normalizeTrackSpecialization(name) === teacherSpecialization
  ));
}

function initializeTrackSchedule(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS track_schedule_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      study_year TEXT NOT NULL CHECK (study_year IN ('ה', 'ו')),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 4),
      period_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      subject TEXT,
      room_number TEXT REFERENCES rooms(number) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS track_schedule_lookup_idx
      ON track_schedule_slots(track_id, study_year, day_of_week, start_time);
    CREATE INDEX IF NOT EXISTS track_schedule_teacher_idx
      ON track_schedule_slots(teacher_id, day_of_week, start_time);
    CREATE INDEX IF NOT EXISTS track_schedule_room_idx
      ON track_schedule_slots(room_number, day_of_week, start_time);
  `);
}

function validScheduleInput(input) {
  const trackId = Number(input?.track_id);
  const teacherId = Number(input?.teacher_id);
  const day = Number(input?.day_of_week);
  const periodId = input?.period_id == null || input.period_id === '' ? null : Number(input.period_id);
  const year = String(input?.study_year || '').trim();
  if (!Number.isSafeInteger(trackId) || trackId < 1 ||
      !Number.isSafeInteger(teacherId) || teacherId < 1 ||
      (periodId !== null && (!Number.isSafeInteger(periodId) || periodId < 1)) ||
      !DAYS.includes(day) || !STUDY_YEARS.includes(year)) {
    return { error: 'יש לבחור מסלול, שנה, מורה, יום ושיעור תקינים' };
  }
  const startTime = String(input?.start_time || '').trim();
  const endTime = String(input?.end_time || '').trim();
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!periodId && (!timePattern.test(startTime) || !timePattern.test(endTime) || endTime <= startTime)) {
    return { error: 'יש לבחור שעת התחלה וסיום תקינות' };
  }
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  if (subject.length > 120) return { error: 'שם המקצוע ארוך מדי' };
  const roomNumber = input.room_number == null || input.room_number === ''
    ? null
    : String(input.room_number).trim();
  if (roomNumber && roomNumber.length > 30) return { error: 'בחירת החדר אינה תקינה' };
  return {
    value: {
      trackId, teacherId, day, periodId, year, startTime, endTime,
      subject: subject || null, roomNumber
    }
  };
}

function dateAtWeekDay(week, day) {
  const date = new Date(`${week}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day);
  return date.toISOString().slice(0, 10);
}

function weekStart(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - value.getUTCDay());
  return value.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function eachFutureOccurrence(day, today, throughDate, visit) {
  let week = weekStart(today);
  for (; week <= throughDate; week = addDays(week, 7)) {
    const date = dateAtWeekDay(week, day);
    if (date >= today && date <= throughDate) visit(week, date);
  }
}

function getTrack(db, trackId) {
  return db.prepare('SELECT * FROM tracks WHERE id = ? AND merged_into IS NULL').get(trackId);
}

function getTrackAliases(db, trackId) {
  const track = getTrack(db, trackId);
  if (!track) return null;
  return [track.name, ...db.prepare('SELECT name FROM tracks WHERE merged_into = ?').all(trackId).map(row => row.name)];
}

function studentTrackCounts(db) {
  const tracks = db.prepare('SELECT id, name FROM tracks WHERE merged_into IS NULL ORDER BY name COLLATE NOCASE').all();
  const students = db.prepare('SELECT track, year FROM students WHERE track IS NOT NULL').all();
  const aliasesByTrack = new Map(tracks.map(track => [
    track.id,
    [track.name, ...db.prepare('SELECT name FROM tracks WHERE merged_into = ?').all(track.id).map(row => row.name)]
  ]));
  return tracks.map(track => {
    const aliases = aliasesByTrack.get(track.id);
    const counts = Object.fromEntries(STUDY_YEARS.map(year => [year, 0]));
    for (const student of students) {
      const year = String(student.year || '').trim();
      if (STUDY_YEARS.includes(year) && aliases.some(name => studentHasTrack(student.track, name))) {
        counts[year]++;
      }
    }
    return {
      id: track.id,
      name: track.name,
      years: STUDY_YEARS.map(year => ({ year, student_count: counts[year] }))
    };
  });
}

function prepareInput(db, input) {
  const checked = validScheduleInput(input);
  if (checked.error) return checked;
  const value = checked.value;
  const track = getTrack(db, value.trackId);
  if (!track) return { error: 'המסלול לא נמצא או שהוא מאוחד למסלול אחר' };

  let period;
  if (value.periodId) {
    period = db.prepare('SELECT * FROM lesson_periods WHERE id = ? AND is_break = 0').get(value.periodId);
    if (!period || !validTime(period.start_time, period.end_time)) {
      return { error: 'יש לבחור שיעור תקין מתוך שעות המערכת' };
    }
  } else {
    period = { name: 'שיעור', start_time: value.startTime, end_time: value.endTime };
  }
  const teacher = db.prepare('SELECT id, specialization FROM teachers WHERE id = ? AND active = 1').get(value.teacherId);
  if (!teacher) return { error: 'יש לבחור מורה פעילה' };
  if (!teacherMatchesTrack(teacher.specialization, getTrackAliases(db, value.trackId) || [])) {
    return { error: `יש לבחור מורה שתחום ההתמחות שלה הוא ${track.name}` };
  }
  if (value.roomNumber) {
    const room = db.prepare('SELECT number FROM rooms WHERE number = ? AND usable = 1').get(value.roomNumber);
    if (!room) return { error: 'החדר שנבחר אינו זמין לשיבוץ' };
  }
  const availability = getPeriodAvailability(value.year, value.day, period);
  if (availability !== 'track') {
    return { error: availability === 'kodesh'
      ? 'השעה שנבחרה מיועדת ללימודי קודש'
      : 'השעה שנבחרה מיועדת ללימודי הוראה' };
  }
  return {
    value: {
      ...value,
      periodName: period.name,
      startTime: period.start_time,
      endTime: period.end_time
    }
  };
}

function findScheduleConflict(db, value, throughDate, today, excludeId, holidayForDate) {
  const params = [
    value.trackId, value.year, value.day, value.endTime, value.startTime, excludeId
  ];
  const cohortConflict = db.prepare(`
    SELECT 1 FROM track_schedule_slots
    WHERE track_id = ? AND study_year = ? AND day_of_week = ?
      AND start_time < ? AND end_time > ? AND id != ?
    LIMIT 1
  `).get(...params);
  if (cohortConflict) return 'למסלול ולשנה זו כבר משובץ שיעור בחלק מהשעה שנבחרה';

  const teacherTrackConflict = db.prepare(`
    SELECT s.*, t.name AS teacher_name, tr.name AS track_name
    FROM track_schedule_slots s
    JOIN teachers t ON t.id = s.teacher_id
    JOIN tracks tr ON tr.id = s.track_id
    WHERE s.teacher_id = ? AND s.day_of_week = ?
      AND s.start_time < ? AND s.end_time > ? AND s.id != ?
    LIMIT 1
  `).get(value.teacherId, value.day, value.startTime, value.endTime, excludeId);
  if (teacherTrackConflict) {
    return `למורה ${teacherTrackConflict.teacher_name} כבר יש שיעור במסלול ${teacherTrackConflict.track_name} באותה שעה`;
  }

  let classConflict = null;
  let roomConflict = null;
  eachFutureOccurrence(value.day, today, throughDate, (week, date) => {
    if (holidayForDate(date)) return;
    if (!classConflict) {
      const rows = db.prepare(`
        SELECT s.*, t.name AS teacher_name
        FROM schedule_slots s
        JOIN teachers t ON t.id = s.teacher_id
        WHERE s.teacher_id = ? AND s.day_of_week = ? AND s.week_start = ?
          AND s.start_time < ? AND COALESCE(s.end_time, s.start_time) > ?
        ORDER BY s.start_time
      `).all(value.teacherId, value.day, week, value.endTime, value.startTime);
      classConflict = rows[0] || null;
    }
    if (value.roomNumber && !roomConflict) {
      roomConflict = findConflict(db, value.roomNumber, date, value.startTime, value.endTime, 0, 0, excludeId) || null;
    }
  });
  if (classConflict) {
    return `למורה ${classConflict.teacher_name} כבר יש שיעור בכיתה ${classConflict.class_year}${classConflict.class_parallel} בשעה זו`;
  }
  if (roomConflict) {
    return `החדר תפוס בשעה זו${roomConflict.title ? ` (${roomConflict.title})` : ''}`;
  }

  if (value.roomNumber) {
    const roomTrackConflict = db.prepare(`
      SELECT s.*, t.name AS teacher_name, tr.name AS track_name
      FROM track_schedule_slots s
      JOIN teachers t ON t.id = s.teacher_id
      JOIN tracks tr ON tr.id = s.track_id
      WHERE s.room_number = ? AND s.day_of_week = ?
        AND s.start_time < ? AND s.end_time > ? AND s.id != ?
      LIMIT 1
    `).get(value.roomNumber, value.day, value.startTime, value.endTime, excludeId);
    if (roomTrackConflict) {
      return `החדר משובץ למסלול ${roomTrackConflict.track_name} באותה שעה`;
    }
  }
  return '';
}

function registerTrackScheduleRoutes(app, db, {
  getSchoolYearEnd, todayInIsrael, holidayForDate, ensureHolidays, getRoomDefault = () => null
}) {
  app.get('/api/track-schedules', (req, res) => {
    const tracks = studentTrackCounts(db);
    const activeTracks = db.prepare('SELECT id FROM tracks WHERE merged_into IS NULL').all()
      .map(track => ({ id: track.id, aliases: getTrackAliases(db, track.id) || [] }));
    const teachers = db.prepare(`
      SELECT id, name, subject, specialization FROM teachers WHERE active = 1 ORDER BY name COLLATE NOCASE
    `).all().map(teacher => ({
      ...teacher,
      track_ids: activeTracks.filter(track =>
        teacherMatchesTrack(teacher.specialization, track.aliases)
      ).map(track => track.id)
    }));
    const periods = db.prepare('SELECT id, name, start_time, end_time, is_break FROM lesson_periods ORDER BY start_time, id').all();
    const rooms = db.prepare('SELECT number, name FROM rooms WHERE usable = 1 ORDER BY floor DESC, number').all();
    const roomDefaults = db.prepare("SELECT track_id, study_year, room_number FROM schedule_room_defaults WHERE kind = 'track'").all();
    res.json({ tracks, teachers, periods, rooms, room_defaults: roomDefaults });
  });

  app.get('/api/track-schedules/:trackId/:studyYear', (req, res) => {
    const trackId = Number(req.params.trackId);
    const year = String(req.params.studyYear || '');
    if (!Number.isSafeInteger(trackId) || !STUDY_YEARS.includes(year)) {
      return res.status(400).json({ error: 'בחירת המסלול או השנה אינה תקינה' });
    }
    const track = getTrack(db, trackId);
    if (!track) return res.status(404).json({ error: 'המסלול לא נמצא או שהוא מאוחד למסלול אחר' });
    const aliases = getTrackAliases(db, trackId);
    const students = db.prepare('SELECT track, year FROM students WHERE year = ? AND track IS NOT NULL').all(year)
      .filter(student => aliases.some(name => studentHasTrack(student.track, name))).length;
    const slots = db.prepare(`
      SELECT s.*, t.name AS teacher_name, t.subject AS teacher_subject, r.name AS room_name
      FROM track_schedule_slots s
      JOIN teachers t ON t.id = s.teacher_id
      LEFT JOIN rooms r ON r.number = s.room_number
      WHERE s.track_id = ? AND s.study_year = ?
      ORDER BY s.day_of_week, s.start_time
    `).all(trackId, year);
    res.json({ track, study_year: year, student_count: students, slots });
  });

  app.post('/api/track-schedules/:trackId/:studyYear', async (req, res) => {
    const input = prepareInput(db, {
      ...req.body,
      track_id: req.params.trackId,
      study_year: req.params.studyYear
    });
    if (input.error) return res.status(400).json({ error: input.error });
    const value = input.value;
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'room_number')) {
      value.roomNumber = getRoomDefault({ kind: 'track', trackId: value.trackId, studyYear: value.year });
    }
    await ensureHolidays();
    const conflict = findScheduleConflict(db, value, getSchoolYearEnd(), todayInIsrael(), 0, holidayForDate);
    if (conflict) return res.status(409).json({ error: conflict });
    const result = db.prepare(`
      INSERT INTO track_schedule_slots (
        track_id, study_year, teacher_id, day_of_week, period_name, start_time, end_time,
        subject, room_number, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.trackId, value.year, value.teacherId, value.day, value.periodName,
      value.startTime, value.endTime, value.subject, value.roomNumber, req.user?.id || null);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/track-schedules/slots/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'השיעור אינו תקין' });
    const current = db.prepare('SELECT * FROM track_schedule_slots WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'השיעור לא נמצא' });
    const input = prepareInput(db, {
      ...req.body,
      track_id: current.track_id,
      study_year: current.study_year,
      day_of_week: current.day_of_week
    });
    if (input.error) return res.status(400).json({ error: input.error });
    const value = input.value;
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'room_number')) {
      value.roomNumber = current.room_number || null;
    }
    await ensureHolidays();
    const conflict = findScheduleConflict(db, value, getSchoolYearEnd(), todayInIsrael(), id, holidayForDate);
    if (conflict) return res.status(409).json({ error: conflict });
    db.prepare(`
      UPDATE track_schedule_slots
      SET teacher_id = ?, period_name = ?, start_time = ?, end_time = ?, subject = ?,
        room_number = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(value.teacherId, value.periodName, value.startTime, value.endTime, value.subject, value.roomNumber, id);
    res.json({ success: true });
  });

  app.delete('/api/track-schedules/slots/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'השיעור אינו תקין' });
    const result = db.prepare('DELETE FROM track_schedule_slots WHERE id = ?').run(id);
    if (!result.changes) return res.status(404).json({ error: 'השיעור לא נמצא' });
    res.json({ success: true });
  });
}

module.exports = {
  initializeTrackSchedule,
  registerTrackScheduleRoutes,
  studentTrackCounts,
  findScheduleConflict,
  validScheduleInput,
  normalizeTrackSpecialization,
  teacherMatchesTrack
};
