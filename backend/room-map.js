const { DEFAULT_ROOMS } = require('./room-map-defaults');

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
  `);
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM room_map_settings WHERE key = 'initial_rooms'").get()) return;
    const insert = db.prepare(`
      INSERT INTO rooms (number, floor, name, capacity, projector, air_conditioner,
        computers, usable, capacity_needs_confirmation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const room of DEFAULT_ROOMS) {
      insert.run(room.number, room.floor, room.name, room.capacity, Number(room.projector),
        room.airConditioner, Number(room.computers), Number(room.usable), Number(room.capacityNeedsConfirmation));
    }
    db.prepare("INSERT INTO room_map_settings (key, value) VALUES ('initial_rooms', '1')").run();
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
    res.json({ success: true });
  });
}

module.exports = { initializeRoomMap, registerRoomMapRoutes, validateRoomUpdate };
