import { storage } from "../server/storage";
import { users, posts, reports } from "@shared/schema";

async function main() {
  try {
    console.log("Starting verification...");

    // 1. Create a test user
    const username = `test_reporter_${Date.now()}`;
    const user = await storage.createUser({
      username,
      email: `${username}@example.com`,
      password: "password123",
    });
    console.log(`Created test user: ${user.id}`);

    // 2. Create a test post (needed for report)
    // Note: createPost expects Omit<Post, "id" | "createdAt" | "karma">
    const post = await storage.createPost({
      title: "Test Post",
      content: "This is a test post content",
      authorId: user.id,
      category: "discussion",
      mediaUrl: null,
      mediaType: null,
    });
    console.log(`Created test post: ${post.id}`);

    // 3. Create a report with IP address
    const testIp = "192.168.1.100";
    console.log(`Creating report with IP: ${testIp}`);

    // We need to bypass the storage.createReport interface limitation if it wasn't fully updated in runtime types?
    // Typescript should be fine if we updated the interface.
    const report = await storage.createReport({
      reason: "Test report for IP verification",
      reporterId: user.id,
      postId: post.id,
      commentId: null,
      discussionId: null,
      ipAddress: testIp,
    });

    console.log(`Created report: ${report.id}`);

    // 4. Verify IP address in returned object
    if (report.ipAddress === testIp) {
      console.log("SUCCESS: IP address matches in returned object.");
    } else {
      console.error(
        `FAILURE: Returned IP address mismatch. Expected ${testIp}, got ${report.ipAddress}`,
      );
    }

    // 5. Fetch all reports and verify persistence
    const allReports = await storage.getReports();
    const fetchedReport = allReports.find((r) => r.id === report.id);

    if (fetchedReport) {
      if (fetchedReport.ipAddress === testIp) {
        console.log("SUCCESS: IP address verified in database retrieval.");
      } else {
        console.error(
          `FAILURE: Database IP address mismatch. Expected ${testIp}, got ${fetchedReport.ipAddress}`,
        );
      }
    } else {
      console.error("FAILURE: Could not find the created report in database.");
    }
  } catch (err) {
    console.error("Verification script error:", err);
  }
}

main();
