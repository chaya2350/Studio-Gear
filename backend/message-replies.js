function initializeMessageReplies(db) {
  const columns = db.prepare('PRAGMA table_info(messages)').all().map(column => column.name);
  if (!columns.includes('reply_to_id')) {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL');
  }
}

function findReplyTarget(db, messageId, userId, recipientIds) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return null;
  const target = db.prepare(`
    SELECT id, sender_id, recipient_id, group_id FROM messages
    WHERE id = ? AND (sender_id = ? OR recipient_id = ?)
  `).get(messageId, userId, userId);
  if (!target) return null;
  const participants = new Set([target.sender_id, target.recipient_id]);
  if (target.group_id) {
    const members = db.prepare('SELECT sender_id, recipient_id FROM messages WHERE group_id = ?').all(target.group_id);
    for (const member of members) {
      participants.add(member.sender_id);
      participants.add(member.recipient_id);
    }
  }
  return recipientIds.every(id => participants.has(id)) ? target : null;
}

function editOwnMessage(db, messageId, userId, body, editedAt) {
  const message = db.prepare('SELECT group_id FROM messages WHERE id = ? AND sender_id = ?').get(messageId, userId);
  if (!message) return false;
  if (message.group_id) {
    db.prepare('UPDATE messages SET body = ?, edited_at = ? WHERE group_id = ? AND sender_id = ?')
      .run(body, editedAt, message.group_id, userId);
  } else {
    db.prepare('UPDATE messages SET body = ?, edited_at = ? WHERE id = ? AND sender_id = ?')
      .run(body, editedAt, messageId, userId);
  }
  return true;
}

module.exports = { initializeMessageReplies, findReplyTarget, editOwnMessage };
