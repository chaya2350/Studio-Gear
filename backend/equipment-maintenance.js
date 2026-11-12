function initializeEquipmentMaintenance(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
      reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolution_notes TEXT
    );
    CREATE INDEX IF NOT EXISTS equipment_maintenance_active_idx
      ON equipment_maintenance(equipment_id, status, reported_at DESC);
  `);
}

function getEquipmentMaintenanceSummary(db, equipmentId) {
  return db.prepare(`
    SELECT COUNT(*) AS open_count
    FROM equipment_maintenance
    WHERE equipment_id = ? AND status != 'resolved'
  `).get(equipmentId).open_count;
}

function registerEquipmentMaintenanceRoutes(app, db) {
  app.get('/api/equipment/:id/maintenance', (req, res) => {
    const equipmentId = Number(req.params.id);
    if (!Number.isSafeInteger(equipmentId) || equipmentId < 1) {
      return res.status(400).json({ error: 'מזהה ציוד לא תקין' });
    }
    const records = db.prepare(`
      SELECT m.*, u.name AS reporter_name
      FROM equipment_maintenance m
      LEFT JOIN users u ON u.id = m.reported_by
      WHERE m.equipment_id = ?
      ORDER BY m.reported_at DESC, m.id DESC
    `).all(equipmentId);
    res.json(records);
  });

  app.post('/api/equipment/:id/maintenance', (req, res) => {
    const equipmentId = Number(req.params.id);
    const description = String(req.body?.description || '').trim();
    if (!Number.isSafeInteger(equipmentId) || equipmentId < 1) {
      return res.status(400).json({ error: 'מזהה ציוד לא תקין' });
    }
    if (!description || description.length > 2000) {
      return res.status(400).json({ error: 'יש לתאר את התקלה (עד 2,000 תווים)' });
    }
    if (!db.prepare('SELECT 1 FROM equipment WHERE id = ?').get(equipmentId)) {
      return res.status(404).json({ error: 'הציוד לא נמצא' });
    }
    const result = db.prepare(`
      INSERT INTO equipment_maintenance (equipment_id, description, reported_by)
      VALUES (?, ?, ?)
    `).run(equipmentId, description, req.user?.id || null);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.patch('/api/equipment/:equipmentId/maintenance/:id', (req, res) => {
    const equipmentId = Number(req.params.equipmentId);
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    const resolutionNotes = String(req.body?.resolution_notes || '').trim();
    if (!Number.isSafeInteger(equipmentId) || equipmentId < 1 || !Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'מזהה תקלה לא תקין' });
    }
    if (!['open', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'סטטוס תחזוקה לא תקין' });
    }
    if (resolutionNotes.length > 2000) {
      return res.status(400).json({ error: 'הערות התיקון ארוכות מדי' });
    }
    const result = db.prepare(`
      UPDATE equipment_maintenance
      SET status = ?, updated_at = datetime('now'),
          resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END,
          resolution_notes = ?
      WHERE id = ? AND equipment_id = ?
    `).run(status, status, resolutionNotes || null, id, equipmentId);
    if (!result.changes) return res.status(404).json({ error: 'דיווח התחזוקה לא נמצא' });
    res.json({ success: true });
  });
}

module.exports = {
  initializeEquipmentMaintenance,
  getEquipmentMaintenanceSummary,
  registerEquipmentMaintenanceRoutes
};