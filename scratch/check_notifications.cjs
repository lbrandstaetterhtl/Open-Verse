const Database = require('better-sqlite3');
const db = new Database('local.db');
const rows = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;").all();
console.log(JSON.stringify(rows, null, 2));
