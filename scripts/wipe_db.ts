import { db } from "../server/db";
import {
    users,
    verificationTokens,
    posts,
    comments,
    reports,
    followers,
    notifications,
    messages,
    postLikes,
    commentLikes,
    communities,
    communityMembers,
    communityBans,
    themes,
} from "@shared/schema";
import { notInArray } from "drizzle-orm";

async function runCleanup() {
    console.log("Starting database cleanup...");

    try {
        // Delete all dependent/content data first
        console.log("Deleting verificationTokens...");
        await db.delete(verificationTokens);

        console.log("Deleting reports...");
        await db.delete(reports);

        console.log("Deleting notifications...");
        await db.delete(notifications);

        console.log("Deleting messages...");
        await db.delete(messages);

        console.log("Deleting postLikes...");
        await db.delete(postLikes);

        console.log("Deleting commentLikes...");
        await db.delete(commentLikes);

        console.log("Deleting communityMembers...");
        await db.delete(communityMembers);

        console.log("Deleting communityBans...");
        await db.delete(communityBans);

        console.log("Deleting followers...");
        await db.delete(followers);

        console.log("Deleting themes...");
        await db.delete(themes);

        console.log("Deleting comments...");
        await db.delete(comments);

        console.log("Deleting posts...");
        await db.delete(posts);

        console.log("Deleting communities...");
        await db.delete(communities);

        // Delete users EXCEPT OwnerU and AdminU
        console.log("Deleting users (except OwnerU and AdminU)...");
        await db.delete(users).where(
            notInArray(users.username, ["OwnerU", "AdminU"])
        );

        console.log("Database cleanup completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Failed to clean up database:", error);
        process.exit(1);
    }
}

runCleanup();
