import { db } from "../server/db";
import { adminSettings } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  await db.update(adminSettings)
    .set({ value: "Osiris" })
    .where(eq(adminSettings.key, "site_name"));
    
  await db.update(adminSettings)
    .set({ value: "support@osiris.com" })
    .where(eq(adminSettings.key, "support_email"));

  await db.update(adminSettings)
    .set({ value: "© 2024 Osiris. All rights reserved." })
    .where(eq(adminSettings.key, "custom_footer_text"));

  console.log("Updated database settings to Osiris");
  process.exit(0);
}

main().catch(console.error);
