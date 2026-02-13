const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../local.db');

// SEC-C2: Restrict to development only
if (process.env.NODE_ENV === 'production') {
  console.error('FATAL: This script is restricted to development environments only.');
  process.exit(1);
}

const db = new Database(dbPath);

console.log('Updating user AdminU to admin...');

const stmt = db.prepare(`
  UPDATE users 
  SET is_admin = 1, role = 'admin', verified = 1, email_verified = 1
  WHERE username = 'AdminU'
`);

const info = stmt.run();

if (info.changes > 0) {
  console.log('Success! AdminU is now an admin.');
} else {
  console.log('Error: User AdminU not found.');
}

db.close();
