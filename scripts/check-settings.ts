import { db } from "../server/db";
import { adminSettings } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const settings = await db.select().from(adminSettings);
  console.log(JSON.stringify(settings, null, 2));
  process.exit(0);
}

main().catch(console.error);
