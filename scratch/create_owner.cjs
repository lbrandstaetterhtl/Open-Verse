const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

async function main() {
  const hash = await bcrypt.hash('OWNER!!!!', 12);
  const db = new Database('./local.db');
  db.prepare(
    `INSERT INTO users (username, email, password, karma, email_verified, is_admin, role, verified)
     VALUES (?, ?, ?, 0, 1, 1, 'owner', 1)`
  ).run('OwnerU', 'owner@openverse.local', hash);
  console.log('Owner account created successfully!');
  console.log('Username: OwnerU');
  console.log('Password: OWNER!!!!');
  console.log('Role: owner');
  db.close();
}

main().catch(console.error);
