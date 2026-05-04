import { getSqlite } from "../server/db";

async function fixTable() {
  const sqlite = getSqlite();
  if (!sqlite) return;

  console.log("Fixing activity_logs table...");
  try {
    sqlite.exec("ALTER TABLE activity_logs ADD COLUMN device_fingerprint TEXT");
    console.log("Column device_fingerprint added successfully.");
  } catch (e) {
    console.log("Column likely already exists or table doesn't exist.");
  }
}

fixTable().then(() => process.exit(0));
