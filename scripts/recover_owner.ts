// Owner recovery for host installs: restores (or creates) an owner account.
//   RECOVER_OWNER_PASSWORD='...' npx tsx --env-file=.env scripts/recover_owner.ts
// The password is read from RECOVER_OWNER_PASSWORD or asked for on the terminal (at least 12 characters); it
// is never printed. Optional: RECOVER_OWNER_USERNAME (default "owner"), RECOVER_OWNER_EMAIL.
// In Docker use INITIAL_OWNER_USERNAME / INITIAL_OWNER_PASSWORD / INITIAL_OWNER_RESET_PASSWORD instead
// (see DEPLOYMENT.md); this script is not part of the image.
import { createInterface } from 'node:readline';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../server/utils/password-hash';

async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Set RECOVER_OWNER_PASSWORD (no terminal to ask on)');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as any;
  const write = out._writeToOutput?.bind(out);
  out._writeToOutput = (s: string) => { if (!out.muted) write?.(s); };
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
    out.muted = true;
  });
}

async function recover() {
  const username = process.env.RECOVER_OWNER_USERNAME?.trim() || 'owner';
  const email = process.env.RECOVER_OWNER_EMAIL?.trim() || `${username}@localhost`;
  const password = process.env.RECOVER_OWNER_PASSWORD ?? await askHidden(`New password for owner "${username}": `);
  if (password.length < 12) throw new Error('The password must be at least 12 characters long');

  const [existing] = await db.select().from(users).where(eq(users.username, username));
  if (existing) {
    await db.update(users)
      .set({ role: 'owner', isAdmin: 1, isFrozen: 0, isShadowBanned: 0, password: await hashPassword(password) })
      .where(eq(users.id, existing.id));
    console.log(`Owner "${username}" restored and its password replaced.`);
  } else {
    await db.insert(users).values({
      username,
      email,
      password: await hashPassword(password),
      role: 'owner',
      isAdmin: 1,
      verified: 1,
      emailVerified: 1,
    });
    console.log(`Owner "${username}" created (email ${email}).`);
  }
}

recover()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Recovery failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
