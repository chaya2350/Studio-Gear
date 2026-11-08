const multer = require('multer');
const path = require('path');

const TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'text/plain',
]);
const LIMIT = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMIT, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!TYPES.has(file.mimetype)) return callback(new Error('סוג הקובץ אינו נתמך'));
    callback(null, true);
  },
}).single('attachment');

function initializeMessageAttachments(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, content_type TEXT NOT NULL, data BLOB NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS message_attachment_delete AFTER DELETE ON messages
      BEGIN DELETE FROM message_attachments WHERE message_id = OLD.id; END;
  `);
}

function attachmentUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  upload(req, res, error => {
    if (error) return res.status(400).json({
      error: error.code === 'LIMIT_FILE_SIZE' ? 'גודל הקובץ המרבי הוא 10MB' : error.message,
    });
    if (typeof req.body.recipient_ids === 'string') {
      try { req.body.recipient_ids = JSON.parse(req.body.recipient_ids); }
      catch { return res.status(400).json({ error: 'רשימת הנמענות אינה תקינה' }); }
    }
    next();
  });
}

function attachmentName(originalName) {
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  const name = decoded.includes('\ufffd') ? originalName : decoded;
  return path.win32.basename(name).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'attachment';
}

function insertAttachment(db, messageId, file) {
  db.prepare('INSERT INTO message_attachments (message_id, filename, content_type, data) VALUES (?, ?, ?, ?)')
    .run(messageId, attachmentName(file.originalname), file.mimetype, file.buffer);
}

function findAttachment(db, messageId, userId) {
  return db.prepare(`
    SELECT a.filename, a.content_type, a.data FROM message_attachments a
    JOIN messages m ON m.id = a.message_id
    WHERE m.id = ? AND (m.sender_id = ? OR m.recipient_id = ?)
  `).get(messageId, userId, userId);
}

module.exports = { initializeMessageAttachments, attachmentUpload, insertAttachment, findAttachment };
