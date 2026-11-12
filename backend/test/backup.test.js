const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createBackup } = require('../backup');

test('creates a daily database and files backup and retains only 30 backups', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-backup-'));
  const db = new Database(path.join(dataDir, 'studio.db'));
  db.exec('CREATE TABLE backup_probe (value TEXT); INSERT INTO backup_probe VALUES (\'saved\')');
  fs.mkdirSync(path.join(dataDir, 'uploads'));
  fs.mkdirSync(path.join(dataDir, 'requirement-files'));
  fs.writeFileSync(path.join(dataDir, 'uploads', 'photo.jpg'), 'image');
  fs.writeFileSync(path.join(dataDir, 'requirement-files', 'document.pdf'), 'document');

  const backupDate = new Date('2026-11-12T10:00:00.000Z');
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupsDir);
  for (let daysAgo = 1; daysAgo <= 31; daysAgo++) {
    const date = new Date(backupDate);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const backupName = date.toISOString().slice(0, 10);
    fs.mkdirSync(path.join(backupsDir, backupName));
  }

  try {
    const result = await createBackup({ db, dataDir, now: backupDate });
    const repeated = await createBackup({ db, dataDir, now: backupDate });
    const restoredDb = new Database(path.join(result.path, 'studio.db'), { readonly: true });
    const backupNames = fs.readdirSync(backupsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name));

    assert.equal(result.created, true);
    assert.equal(repeated.created, false);
    assert.equal(restoredDb.prepare('SELECT value FROM backup_probe').get().value, 'saved');
    assert.equal(fs.readFileSync(path.join(result.path, 'uploads', 'photo.jpg'), 'utf8'), 'image');
    assert.equal(fs.readFileSync(path.join(result.path, 'requirement-files', 'document.pdf'), 'utf8'), 'document');
    assert.equal(backupNames.length, 30);
    restoredDb.close();
  } finally {
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
