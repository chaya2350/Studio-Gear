const path = require('path');
const readline = require('readline');
const Database = require('better-sqlite3');
const { hashPassword, initializeAuthSchema } = require('./auth-utils');

const dataDir = process.env.STUDIO_DATA_DIR || process.cwd();
const db = new Database(path.join(dataDir, 'studio.db'));

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

function askPassword(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('יש להריץ את הפקודה בחלון טרמינל אינטראקטיבי'));
      return;
    }

    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let password = '';
    const onData = key => {
      if (key === '\u0003') {
        input.setRawMode(false);
        input.pause();
        input.off('data', onData);
        output.write('\n');
        reject(new Error('הפעולה בוטלה'));
      } else if (key === '\r' || key === '\n') {
        input.setRawMode(false);
        input.pause();
        input.off('data', onData);
        output.write('\n');
        resolve(password);
      } else if (key === '\u007f' || key === '\b') {
        password = password.slice(0, -1);
      } else if (key >= ' ') {
        password += key;
      }
    };
    input.on('data', onData);
  });
}

async function main() {
  initializeAuthSchema(db);
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get()) {
    throw new Error('כבר קיים חשבון מנהלת. אין צורך בהרצה נוספת.');
  }

  const name = await ask('שם המנהלת: ');
  const email = (await ask('אימייל: ')).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('יש להזין שם ואימייל תקין.');
  }

  const password = await askPassword('סיסמה (12 תווים לפחות): ');
  if (password.length < 12 || password.length > 128) {
    throw new Error('הסיסמה חייבת להכיל 12 עד 128 תווים.');
  }

  const { salt, hash } = hashPassword(password);
  db.prepare(`
    INSERT INTO users (name, email, password_salt, password_hash, role, active, created_at)
    VALUES (?, ?, ?, ?, 'admin', 1, ?)
  `).run(name, email, salt, hash, new Date().toISOString());
  console.log('חשבון מנהלת המערכת נוצר בהצלחה.');
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
