import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function listTables() {
  const useSqlite = process.env.USE_SQLITE === "true";
  
  console.log(`--- Database Tables (${useSqlite ? 'SQLite' : 'Postgres'}) ---`);

  try {
    if (useSqlite) {
      const tables = await db.run(sql`SELECT name FROM sqlite_master WHERE type='table'`);
      // SQLite return format varies, usually it's an array of objects
      console.log(tables);
    } else {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
      
      console.table(result.rows);
    }
  } catch (error) {
    console.error('❌ Error listing tables:', error);
  }
  process.exit(0);
}

listTables();
