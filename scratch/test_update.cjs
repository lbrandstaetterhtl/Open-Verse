const Database = require('better-sqlite3');
const db = new Database('local.db');

console.log("Before:");
const before = db.prepare("SELECT * FROM community_members WHERE user_id = 11 AND community_id = 8").get();
console.log(before);

db.prepare("UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?").run('moderator', 8, 11);

console.log("After:");
const after = db.prepare("SELECT * FROM community_members WHERE user_id = 11 AND community_id = 8").get();
console.log(after);
