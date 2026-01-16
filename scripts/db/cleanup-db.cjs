const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../local.db');
console.log('Cleaning up database:', dbPath);

const db = new Database(dbPath);

try {
    // Find AdminU's ID
    const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('AdminU');

    if (!adminUser) {
        console.error('AdminU not found! Aborting cleanup.');
        process.exit(1);
    }

    const adminId = adminUser.id;
    console.log('AdminU ID:', adminId);

    // Delete in proper order to avoid FK constraints
    console.log('Deleting messages...');
    db.prepare('DELETE FROM messages').run();

    console.log('Deleting notifications...');
    db.prepare('DELETE FROM notifications').run();

    console.log('Deleting followers...');
    db.prepare('DELETE FROM followers').run();

    console.log('Deleting comment_likes...');
    db.prepare('DELETE FROM comment_likes').run();

    console.log('Deleting post_likes...');
    db.prepare('DELETE FROM post_likes').run();

    console.log('Deleting comments...');
    db.prepare('DELETE FROM comments').run();

    console.log('Deleting reports...');
    db.prepare('DELETE FROM reports').run();

    console.log('Deleting posts...');
    db.prepare('DELETE FROM posts').run();

    console.log('Deleting users (except AdminU)...');
    const result = db.prepare('DELETE FROM users WHERE id != ?').run(adminId);
    console.log(`Deleted ${result.changes} users`);

    console.log('Database cleanup completed successfully!');

} catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
} finally {
    db.close();
}
