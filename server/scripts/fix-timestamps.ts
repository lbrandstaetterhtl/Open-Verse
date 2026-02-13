// Temporary script to fix user timestamps
// Add this to routes.ts temporarily, then call via browser/curl

import { storage } from "../storage";

export async function fixUserTimestamps() {
  const users = await storage.getUsers();
  const currentTimestamp = Math.floor(Date.now() / 1000); // Current Unix timestamp in seconds

  console.log("Checking user timestamps...");
  console.log(
    "Current timestamp:",
    currentTimestamp,
    new Date(currentTimestamp * 1000).toISOString(),
  );

  const invalidUsers = [];

  for (const user of users) {
    const createdAtTimestamp = Math.floor(new Date(user.createdAt).getTime() / 1000);

    // Check if timestamp is before year 2020 (likely invalid)
    if (createdAtTimestamp < 1577836800) {
      // Jan 1, 2020
      console.log(
        `Invalid timestamp for user ${user.username} (ID: ${user.id}): ${createdAtTimestamp} (${new Date(createdAtTimestamp * 1000).toISOString()})`,
      );
      invalidUsers.push(user);
    }
  }

  if (invalidUsers.length > 0) {
    console.log(`\nFound ${invalidUsers.length} users with invalid timestamps. Updating...`);

    // Import getSqlite
    const { getSqlite } = await import("../db");
    const sqlite = getSqlite();

    if (sqlite && process.env.USE_SQLITE === "true") {
      const stmt = sqlite.prepare("UPDATE users SET created_at = ? WHERE id = ?");

      for (const user of invalidUsers) {
        stmt.run(currentTimestamp, user.id);
        console.log(
          `✅ Updated user ${user.username} (ID: ${user.id}) to ${new Date(currentTimestamp * 1000).toISOString()}`,
        );
      }

      console.log(`\n✅ Successfully updated ${invalidUsers.length} user(s)!`);
      return { success: true, updated: invalidUsers.length };
    } else {
      console.log("❌ SQLite not available or not in use");
      return { success: false, message: "SQLite not available" };
    }
  } else {
    console.log("✅ All user timestamps are valid!");
    return { success: true, updated: 0 };
  }
}
