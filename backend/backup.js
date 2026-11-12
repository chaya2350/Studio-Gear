const fs = require('fs');
const path = require('path');

const BACKUP_RETENTION_COUNT = 30;

function israelDate(date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function pruneBackups(backupsDir) {
  const backupNames = fs.readdirSync(backupsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse();

  for (const backupName of backupNames.slice(BACKUP_RETENTION_COUNT)) {
    fs.rmSync(path.join(backupsDir, backupName), { recursive: true, force: true });
  }
}

async function createBackup({ db, dataDir, now = new Date() }) {
  const backupsDir = path.join(dataDir, 'backups');
  const backupName = israelDate(now);
  const backupPath = path.join(backupsDir, backupName);
  fs.mkdirSync(backupsDir, { recursive: true });

  if (fs.existsSync(backupPath)) return { created: false, path: backupPath };

  const temporaryPath = path.join(backupsDir, `.tmp-${backupName}-${process.pid}`);
  fs.rmSync(temporaryPath, { recursive: true, force: true });
  fs.mkdirSync(temporaryPath, { recursive: true });

  try {
    await db.backup(path.join(temporaryPath, 'studio.db'));
    for (const directory of ['uploads', 'requirement-files']) {
      const source = path.join(dataDir, directory);
      const destination = path.join(temporaryPath, directory);
      if (fs.existsSync(source)) fs.cpSync(source, destination, { recursive: true });
      else fs.mkdirSync(destination);
    }
    fs.renameSync(temporaryPath, backupPath);
    pruneBackups(backupsDir);
    return { created: true, path: backupPath };
  } catch (error) {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { createBackup };