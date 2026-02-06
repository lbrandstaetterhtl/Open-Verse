import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'local.db');
console.log('Opening database at:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });

    const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
    const user = stmt.get('OwnerU') as any;

    if (user) {
        console.log('User found:', JSON.stringify(user, null, 2));
        if (user.role === 'Owner') {
            console.log('SUCCESS: User OwnerU exists and has role Owner.');
        } else {
            console.log(`FAILURE: User OwnerU exists but has role '${user.role}' instead of 'Owner'.`);
        }
    } else {
        console.log('FAILURE: User OwnerU not found in the database.');
    }

    // Also listing all users to be helpful if not found
    const allUsersArgs = process.argv.includes('--list-all');
    if (allUsersArgs || !user) {
        const allUsers = db.prepare("SELECT id, username, role FROM users LIMIT 10").all();
        console.log('First 10 users in DB:', JSON.stringify(allUsers, null, 2));
    }

} catch (error) {
    console.error('Error accessing database:', error);
}
