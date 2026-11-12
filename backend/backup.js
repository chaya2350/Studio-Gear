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
  return fs.promises.readdir(backupsDir, { withFileTypes: true })
    .then(entries => entries
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse())
    .then(backupNames => Promise.all(backupNames.slice(BACKUP_RETENTION_COUNT).map(backupName =>
      fs.promises.rm(path.join(backupsDir, backupName), { recursive: true, force: true })
    )));
}

async function createBackup({ db, dataDir, now = new Date() }) {
  const backupsDir = path.join(dataDir, 'backups');
  const backupName = israelDate(now);
  const backupPath = path.join(backupsDir, backupName);
  await fs.promises.mkdir(backupsDir, { recursive: true });

  try {
    await fs.promises.access(backupPath);
    return { created: false, path: backupPath };
  } catch {}

  const temporaryPath = path.join(backupsDir, `.tmp-${backupName}-${process.pid}`);
  await fs.promises.rm(temporaryPath, { recursive: true, force: true });
  await fs.promises.mkdir(temporaryPath, { recursive: true });

  try {
    await db.backup(path.join(temporaryPath, 'studio.db'));
    for (const directory of ['uploads', 'requirement-files']) {
      const source = path.join(dataDir, directory);
      const destination = path.join(temporaryPath, directory);
      try {
        await fs.promises.access(source);
        await fs.promises.cp(source, destination, { recursive: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await fs.promises.mkdir(destination);
      }
    }
    await fs.promises.rename(temporaryPath, backupPath);
    await pruneBackups(backupsDir);
    return { created: true, path: backupPath };
  } catch (error) {
    await fs.promises.rm(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { createBackup };