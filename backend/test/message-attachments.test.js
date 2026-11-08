const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeMessageAttachments, insertAttachment, findAttachment } = require('../message-attachments');

test('message files are available only to sender and recipient and removed with the message', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY, sender_id INTEGER, recipient_id INTEGER);
      INSERT INTO messages VALUES (1, 10, 20), (2, 10, 30);`);
    initializeMessageAttachments(db);
    const file = { originalname: 'image.png', mimetype: 'image/png', buffer: Buffer.from('file') };
    insertAttachment(db, 1, file);
    insertAttachment(db, 2, file);
    assert.equal(findAttachment(db, 1, 10).filename, 'image.png');
    assert.deepEqual(findAttachment(db, 1, 20).data, file.buffer);
    assert.equal(findAttachment(db, 1, 30), undefined);
    assert.equal(findAttachment(db, 2, 30).filename, 'image.png');
    db.prepare('DELETE FROM messages WHERE id = ?').run(1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM message_attachments').get().n, 1);
  } finally { db.close(); }
});

test('message attachment storage strips unsafe path components', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY, sender_id INTEGER, recipient_id INTEGER); INSERT INTO messages VALUES (1, 1, 2)');
    initializeMessageAttachments(db);
    insertAttachment(db, 1, { originalname: '..\\secret.txt', mimetype: 'text/plain', buffer: Buffer.from('x') });
    assert.equal(findAttachment(db, 1, 1).filename, 'secret.txt');
  } finally { db.close(); }
});
