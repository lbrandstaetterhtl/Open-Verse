const db = require('better-sqlite3')('local.db');
const iso = new Date(Date.now() - 86400000).toISOString();
const logs = db.prepare(`SELECT severity, created_at, category FROM activity_logs WHERE created_at >= '${iso}'`).all();
console.log('Logs returned:', logs.length);
const now = Date.now();
logs.forEach(log => {
    let t = new Date(log.created_at).getTime();
    console.log('diffMs:', t - (now - 86400000), 'bucket:', Math.min(Math.floor((t - (now - 86400000)) / (86400000/8)), 7))
});
