import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function recover() {
  const email = 'owner@open-verse.com';
  const username = 'owner';
  const password = 'OwnerPassword123!';
  
  console.log('Checking for owner account...');
  
  try {
    // SECURITY-FIX: Use execute() instead of .get() for cross-db compatibility
    const existing = await db.select().from(users).where(eq(users.email, email)).execute();
    
    if (existing.length > 0) {
      console.log('Owner exists. Unbanning and resetting status...');
      await db.update(users)
        .set({ 
          role: 'owner', 
          isAdmin: 1 as any, 
          isFrozen: 0,
          isShadowBanned: 0 
        })
        .where(eq(users.id, existing[0].id))
        .execute();
      console.log('✅ Owner account restored.');
    } else {
      console.log('Owner missing. Creating new owner account...');
      const hashedPassword = await bcrypt.hash(password, 12);
      await db.insert(users).values({
        username,
        email,
        password: hashedPassword,
        role: 'owner',
        isAdmin: 1 as any,
        karma: 999,
        verified: 1 as any,
        emailVerified: 1 as any,
        bio: 'Platform Owner Recovery Account'
      }).execute();
      console.log(`✅ New owner created: ${email} / ${password}`);
    }
  } catch (error) {
    console.error('❌ Recovery failed:', error);
  }
  process.exit(0);
}

recover();
