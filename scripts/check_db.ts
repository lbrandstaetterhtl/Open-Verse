import { db } from "./server/db";
import { users } from "./shared/schema";
import { count } from "drizzle-orm";

async function main() {
    const allUsers = await db.select().from(users);
    console.log("All users in DB:", allUsers.map(u => u.username));
    const c = await db.select({ count: count() }).from(users);
    console.log("User count:", c[0].count);
    process.exit(0);
}
main();
