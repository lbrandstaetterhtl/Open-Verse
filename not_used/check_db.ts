
import { db } from "./server/db";
import { users, communityMembers, communities } from "./shared/schema";
import { eq } from "drizzle-orm";

async function check() {
  console.log("Checking database...");
  const allUsers = await db.select().from(users);
  console.log("Total users:", allUsers.length);
  
  const allComms = await db.select().from(communities);
  console.log("Total communities:", allComms.length);
  
  const allMembers = await db.select().from(communityMembers);
  console.log("Total members:", allMembers.length);

  for (const comm of allComms) {
    const members = await db
      .select()
      .from(communityMembers)
      .where(eq(communityMembers.communityId, comm.id));
    console.log(`Community ${comm.name} (ID: ${comm.id}) has ${members.length} members.`);
  }
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
