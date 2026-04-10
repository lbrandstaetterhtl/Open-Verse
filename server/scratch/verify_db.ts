
import Database from 'better-sqlite3';
import path from 'path';

async function verify() {
  const dbPath = path.join(process.cwd(), 'local.db');
  console.log('Checking database at:', dbPath);
  const db = new Database(dbPath);

  console.log('\n--- Notifications Table Info ---');
  const info = db.prepare('PRAGMA table_info(notifications)').all();
  console.table(info);

  console.log('\n--- First 2 Notifications ---');
  try {
    const rows = db.prepare('SELECT * FROM notifications LIMIT 2').all();
    console.log(rows);
  } catch (e) {
    console.error('Error reading notifications:', e.message);
  }

  db.close();
}

verify().catch(console.error);
