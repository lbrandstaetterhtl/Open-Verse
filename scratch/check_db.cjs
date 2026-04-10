const Database = require('better-sqlite3');
const db = new Database('local.db');
const rows = db.prepare("SELECT * FROM community_members;").all();
console.log(JSON.stringify(rows, null, 2));
