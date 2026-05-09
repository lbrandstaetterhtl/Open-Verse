
import { db, getSqlite } from "../server/db";
import { sql } from "drizzle-orm";

async function fixAdminGroups() {
  const useSqlite = process.env.USE_SQLITE === "true";
  console.log(`Checking for admin_groups table (Mode: ${useSqlite ? "SQLite" : "Postgres"})...`);
  
  try {
    if (useSqlite) {
      const sqlite = getSqlite();
      if (!sqlite) {
          console.error("SQLite instance not found!");
          process.exit(1);
      }

      // SQLite Migration
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS admin_groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          permissions TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#3b82f6',
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
      `);
      console.log("admin_groups table ready (SQLite).");

      try {
        sqlite.exec(`ALTER TABLE users ADD COLUMN admin_group_id INTEGER`);
        console.log("Column admin_group_id added to users (SQLite).");
      } catch (e) {
        // Column likely exists
      }

      const count = sqlite.prepare("SELECT count(*) as count FROM admin_groups").get() as { count: number };
      if (count.count === 0) {
          console.log("Creating default Super Admin group (SQLite)...");
          sqlite.prepare(`
              INSERT INTO admin_groups (name, description, permissions, color)
              VALUES (?, ?, ?, ?)
          `).run(
              'Super Admin', 
              'Full platform access with all permissions enabled.', 
              '["dashboard", "users", "reports", "tickets", "communities", "security", "logs", "settings", "groups"]', 
              '#ef4444'
          );
      }
    } else {
      // Postgres Migration
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_groups (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          permissions TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#3b82f6',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log("admin_groups table ready (Postgres).");

      await db.execute(sql`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_group_id INTEGER REFERENCES admin_groups(id);
      `);
      console.log("Column admin_group_id added to users (Postgres).");

      const existingGroups = await db.execute(sql`SELECT count(*) FROM admin_groups`);
      if (Number((existingGroups.rows[0] as any).count) === 0) {
          console.log("Creating default Super Admin group (Postgres)...");
          await db.execute(sql`
              INSERT INTO admin_groups (name, description, permissions, color)
              VALUES (
                  'Super Admin', 
                  'Full platform access with all permissions enabled.', 
                  '["dashboard", "users", "reports", "tickets", "communities", "security", "logs", "settings", "groups"]', 
                  '#ef4444'
              )
          `);
      }
    }

    console.log("Admin Group system initialized successfully.");
  } catch (error) {
    console.error("Failed to fix admin groups:", error);
  } finally {
    process.exit(0);
  }
}

fixAdminGroups();
