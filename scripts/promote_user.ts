import { storage } from "../server/storage";

async function main() {
  // SEC-C2: Restrict to development only
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: This script is restricted to development environments only.");
    process.exit(1);
  }

  const targetUsername = "admin_test";
  try {
    console.log(`Searching for user: ${targetUsername}...`);
    const user = await storage.getUserByUsername(targetUsername);

    if (!user) {
      console.log(`User '${targetUsername}' not found. Please register first.`);
      process.exit(1);
    }

    console.log(`Found user ${user.id}. Promoting to admin/owner...`);
    await storage.updateUserProfile(user.id, {
      isAdmin: true,
      role: "owner", // or 'admin'
      verified: true,
    });

    console.log("User promoted successfully!");
  } catch (err) {
    console.error("Error promoting user:", err);
    process.exit(1);
  }
}

main();
