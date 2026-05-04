import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function makeOwner() {
  const username = process.argv[2];

  if (!username) {
    console.error('❌ Error: Please provide a username.');
    console.log('Usage: npx tsx scripts/make_owner.ts <username>');
    process.exit(1);
  }

  console.log(`Promoting user '${username}' to OWNER...`);

  try {
    const existing = await db.select().from(users).where(eq(users.username, username)).execute();

    if (existing.length === 0) {
      console.error(`❌ Error: User '${username}' not found.`);
      process.exit(1);
    }

    const userId = existing[0].id;

    await db.update(users)
      .set({ 
        role: 'owner', 
        isAdmin: 1 as any, 
        verified: 1 as any,
        isFrozen: 0,
        isShadowBanned: 0,
        karma: Math.max(existing[0].karma, 1000) // Give them some starter karma if low
      })
      .where(eq(users.id, userId))
      .execute();

    console.log(`✅ Success! User '${username}' is now an OWNER.`);
    console.log('Please restart your session (logout and login) to see the changes.');

  } catch (error) {
    console.error('❌ Error promoting user:', error);
    process.exit(1);
  }
  process.exit(0);
}

makeOwner();
