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
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('יש להריץ את הפקודה בחלון טרמינל אינטראקטיבי'));
      return;
    }
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let password = '';
    const finish = (fn, value) => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stdout.write('\n');
      fn(value);
    };
    const onData = key => {
      if (key === '\u0003') finish(reject, new Error('הפעולה בוטלה'));
      else if (key === '\r' || key === '\n') finish(resolve, password);
      else if (key === '\u007f' || key === '\b') password = password.slice(0, -1);
      else if (key >= ' ') password += key;
    };
    input.on('data', onData);
  });
}

async function main() {
  initializeAuthSchema(db);
  const email = (await ask('אימייל החשבון: ')).toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) throw new Error('לא נמצא חשבון עם האימייל הזה.');

  const password = await askPassword('סיסמה חדשה (12 תווים לפחות): ');
  if (password.length < 12 || password.length > 128) {
    throw new Error('הסיסמה חייבת להכיל 12 עד 128 תווים.');
  }
  const confirm = await askPassword('הקלידי שוב את הסיסמה: ');
  if (confirm !== password) throw new Error('הסיסמאות אינן זהות.');

  const { salt, hash } = hashPassword(password);
  db.prepare('UPDATE users SET password_salt = ?, password_hash = ?, active = 1 WHERE id = ?')
    .run(salt, hash, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  console.log('הסיסמה עודכנה. אפשר להתחבר עם הסיסמה החדשה.');
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
