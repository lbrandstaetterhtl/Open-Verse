import { db } from "../server/db";
import { users, anomalyEvents, activityLogs, bans } from "../shared/schema";
import { eq, and, count } from "drizzle-orm";
import { activityLogger } from "../server/services/activity-logger";

async function verifyFixes() {
  console.log("🔍 Auto-Punishment Fix Verification\n");

  const testUserId = 999; 
  const now = Math.floor(Date.now() / 1000);

  // Ensure test user exists
  const existingUser = await db.select().from(users).where(eq(users.id, testUserId)).get();
  if (!existingUser) {
    await db.insert(users).values({
      id: testUserId,
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'hashed_password',
      createdAt: now
    });
  }

  // Helper to simulate activity
  const simulateAction = async (action: any, status: any = 'success', ip: string = '1.1.1.1') => {
    await activityLogger.log({
      userId: testUserId,
      action,
      category: 'content', // APE-FIX: Valid category
      description: `Test ${action}`,
      status,
      req: { ip, headers: { 'user-agent': 'Mozilla/5.0 Test' } } as any
    });
    // Wait for logger batch flush
    await new Promise(r => setTimeout(r, 100));
  };

  // TEST 1: Normal Login (No Anomaly)
  console.log("TEST 1: 3 Successful Logins...");
  for(let i=0; i<3; i++) await simulateAction('auth.login', 'success');
  const anomalies1 = await db.select().from(anomalyEvents).where(eq(anomalyEvents.userId, testUserId));
  console.log(anomalies1.length === 0 ? "✅ Passed: No anomalies created." : "❌ Failed: Anomalies created for normal behavior.");

  // TEST 2: High Activity (Realistier Threshold)
  console.log("TEST 2: 20 Likes (Should not trigger anymore)...");
  for(let i=0; i<20; i++) await simulateAction('like.add');
  const anomalies2 = await db.select().from(anomalyEvents).where(and(eq(anomalyEvents.userId, testUserId), eq(anomalyEvents.anomalyType, 'mass_action')));
  console.log(anomalies2.length === 0 ? "✅ Passed: No mass_action for 20 likes." : "❌ Failed: mass_action triggered too early.");

  // TEST 3: Account Sharing (Mobile IP check)
  console.log("TEST 3: 10 different IPs in 1h (Should not trigger anymore)...");
  for(let i=0; i<10; i++) await simulateAction('auth.login', 'success', `10.0.0.${i}`);
  const anomalies3 = await db.select().from(anomalyEvents).where(and(eq(anomalyEvents.userId, testUserId), eq(anomalyEvents.anomalyType, 'account_sharing')));
  console.log(anomalies3.length === 0 ? "✅ Passed: No account_sharing for 10 IPs." : "❌ Failed: account_sharing still too sensitive.");

  console.log("\nVerification Finished.");
}

verifyFixes().then(() => process.exit(0));
