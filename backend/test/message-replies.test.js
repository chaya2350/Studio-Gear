const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeMessageReplies, findReplyTarget, editOwnMessage } = require('../message-replies');

function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY, sender_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL,
      body TEXT NOT NULL, edited_at TEXT, group_id TEXT
    );
    INSERT INTO messages VALUES
      (1, 10, 20, 'private', NULL, NULL),
      (2, 10, 20, 'group', NULL, 'g1'),
      (3, 10, 30, 'group', NULL, 'g1'),
      (4, 40, 50, 'other', NULL, NULL);
  `);
  initializeMessageReplies(db);
  initializeMessageReplies(db);
  return db;
}

test('only the author can edit, including every copy of a group message', () => {
  const db = setup();
  try {
    assert.equal(editOwnMessage(db, 1, 20, 'unauthorized', 'now'), false);
    assert.equal(editOwnMessage(db, 2, 30, 'unauthorized', 'now'), false);
    assert.equal(db.prepare('SELECT body FROM messages WHERE id = 1').get().body, 'private');
    assert.equal(editOwnMessage(db, 2, 10, 'updated', 'now'), true);
    assert.deepEqual(db.prepare('SELECT body, edited_at FROM messages WHERE group_id = ? ORDER BY id').all('g1'), [
      { body: 'updated', edited_at: 'now' }, { body: 'updated', edited_at: 'now' },
    ]);
    assert.equal(editOwnMessage(db, 1, 10, 'edited', 'now'), true);
    assert.equal(db.prepare('SELECT body FROM messages WHERE id = 1').get().body, 'edited');
  } finally { db.close(); }
});

test('replies can reference only accessible messages and their original participants', () => {
  const db = setup();
  try {
    assert.equal(findReplyTarget(db, 1, 20, [10]).id, 1);
    assert.equal(findReplyTarget(db, 1, 20, [10, 30]), null);
    assert.equal(findReplyTarget(db, 1, 30, [10]), null);
    assert.equal(findReplyTarget(db, 2, 20, [10, 30]).id, 2);
    assert.equal(findReplyTarget(db, 2, 20, [10, 40]), null);
    assert.equal(findReplyTarget(db, 2, 30, [10]), null);
    assert.equal(findReplyTarget(db, NaN, 20, [10]), null);
    db.prepare('INSERT INTO messages (id, sender_id, recipient_id, body, reply_to_id) VALUES (6, 20, 10, ?, ?)').run('reply', 1);
    initializeMessageReplies(db);
    const reply = db.prepare(`
      SELECT original.body AS original_body FROM messages m
      JOIN messages original ON original.id = m.reply_to_id WHERE m.id = 6
    `).get();
    assert.equal(reply.original_body, 'private');
  } finally { db.close(); }
});
