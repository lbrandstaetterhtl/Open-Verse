const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../local.db');
console.log('Deleting TestU from database:', dbPath);

const db = new Database(dbPath);

try {
    // Find TestU
    const testUser = db.prepare('SELECT id FROM users WHERE username = ?').get('TestU');

    if (!testUser) {
        console.log('TestU not found in database.');
        process.exit(0);
    }

    const userId = testUser.id;
    console.log('Found TestU with ID:', userId);

    // Delete user's data in proper order (to avoid FK constraints)
    console.log('Deleting messages...');
    db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(userId, userId);

    console.log('Deleting notifications...');
    db.prepare('DELETE FROM notifications WHERE user_id = ? OR from_user_id = ?').run(userId, userId);

    console.log('Deleting followers...');
    db.prepare('DELETE FROM followers WHERE follower_id = ? OR following_id = ?').run(userId, userId);

    console.log('Deleting comment_likes...');
    db.prepare('DELETE FROM comment_likes WHERE user_id = ?').run(userId);

    console.log('Deleting post_likes...');
    db.prepare('DELETE FROM post_likes WHERE user_id = ?').run(userId);

    console.log('Deleting comments...');
    db.prepare('DELETE FROM comments WHERE author_id = ?').run(userId);

    console.log('Deleting reports...');
    db.prepare('DELETE FROM reports WHERE reporter_id = ?').run(userId);

    console.log('Deleting posts...');
    db.prepare('DELETE FROM posts WHERE author_id = ?').run(userId);

    console.log('Deleting TestU user...');
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    console.log(`TestU deleted successfully! (${result.changes} user deleted)`);

} catch (error) {
    console.error('Error during deletion:', error);
    process.exit(1);
} finally {
    db.close();
}
