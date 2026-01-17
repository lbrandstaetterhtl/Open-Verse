/**
 * Script to clean up all content from currently banned users
 * Run with: node scripts/db/cleanup-banned-users.cjs
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../local.db');
console.log('Cleaning up content from banned users in:', dbPath);

try {
    const db = new Database(dbPath);

    // Find all banned users (karma < 0)
    const bannedUsers = db.prepare('SELECT id, username, karma FROM users WHERE karma < 0').all();

    if (bannedUsers.length === 0) {
        console.log('No banned users found.');
        db.close();
        process.exit(0);
    }

    console.log(`Found ${bannedUsers.length} banned user(s):`, bannedUsers.map(u => u.username).join(', '));

    for (const user of bannedUsers) {
        console.log(`\nCleaning up content for ${user.username} (ID: ${user.id})...`);

        // Delete posts
        const postsResult = db.prepare('DELETE FROM posts WHERE author_id = ?').run(user.id);
        console.log(`  Deleted ${postsResult.changes} post(s)`);

        // Delete comments
        const commentsResult = db.prepare('DELETE FROM comments WHERE author_id = ?').run(user.id);
        console.log(`  Deleted ${commentsResult.changes} comment(s)`);
    }

    console.log('\n✅ Cleanup completed successfully!');
    db.close();
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
}
