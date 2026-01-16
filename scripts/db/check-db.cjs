const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../local.db');
console.log('Inspecting database:', dbPath);
console.log('');

const db = new Database(dbPath);

try {
    console.log('=== USERS ===');
    const users = db.prepare('SELECT id, username, email, karma, is_admin, role, verified FROM users').all();
    console.log(JSON.stringify(users, null, 2));
    console.log('Total users:', users.length);
    console.log('');

    console.log('=== POSTS ===');
    const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
    console.log('Total posts:', postCount.count);
    console.log('');

    console.log('=== REPORTS ===');
    const reportCount = db.prepare('SELECT COUNT(*) as count FROM reports').get();
    console.log('Total reports:', reportCount.count);
    const reports = db.prepare('SELECT * FROM reports').all();
    console.log('Reports:', JSON.stringify(reports, null, 2));
    console.log('');

    console.log('=== NOTIFICATIONS ===');
    const notifCount = db.prepare('SELECT COUNT(*) as count FROM notifications').get();
    console.log('Total notifications:', notifCount.count);
    console.log('');

    console.log('=== MESSAGES ===');
    const msgCount = db.prepare('SELECT COUNT(*) as count FROM messages').get();
    console.log('Total messages:', msgCount.count);

} catch (error) {
    console.error('Error:', error);
} finally {
    db.close();
}
