
import Database from 'better-sqlite3';

const db = new Database('local.db');

try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      colors TEXT NOT NULL,
      created_at INTEGER DEFAULT (cast(strftime('%s', 'now') as integer)) NOT NULL
    );
  `);
    console.log('Themes table created successfully');
} catch (error) {
    console.error('Error creating themes table:', error);
    process.exit(1);
}
