import "dotenv/config";
import pg from "pg";

async function fixReportsTable() {
  if (!process.env.DATABASE_URL || process.env.USE_SQLITE === "true") {
    console.log("Skipping Postgres fix (SQLite or no DATABASE_URL)");
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log("Checking reports table columns in Postgres...");
    
    // Check for discussion_id
    const hasDiscussionId = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='reports' AND column_name='discussion_id'
    `);
    
    if (hasDiscussionId.rowCount === 0) {
      console.log("Adding discussion_id to reports...");
      await client.query("ALTER TABLE reports ADD COLUMN discussion_id INTEGER");
    }

    // Check for ip_address
    const hasIpAddress = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='reports' AND column_name='ip_address'
    `);
    
    if (hasIpAddress.rowCount === 0) {
      console.log("Adding ip_address to reports...");
      await client.query("ALTER TABLE reports ADD COLUMN ip_address TEXT");
    }

    // Check for status
    const hasStatus = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='reports' AND column_name='status'
    `);
    
    if (hasStatus.rowCount === 0) {
      console.log("Adding status to reports...");
      await client.query("ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'pending'");
    }

    // Check for resolution columns
    const columnsToAdd = [
      ["resolved_by", "INTEGER"],
      ["resolved_at", "TIMESTAMP"],
      ["resolution_time_seconds", "INTEGER"]
    ];

    for (const [name, type] of columnsToAdd) {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='reports' AND column_name='${name}'
      `);
      if (check.rowCount === 0) {
        console.log(`Adding ${name} to reports...`);
        await client.query(`ALTER TABLE reports ADD COLUMN ${name} ${type}`);
      }
    }

    console.log("Reports table check completed successfully.");
  } catch (err) {
    console.error("Error fixing reports table:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixReportsTable();
