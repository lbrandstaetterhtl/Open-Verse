
import { apiRequest } from "./test_utils"; // Assuming a helper exists or I'll mock it
import { checkContent } from "../server/services/moderation";

async function testModeration() {
    console.log("Testing Moderation Service...");

    // 1. Direct Service Test
    const badText = "This contains a bad word: porn";
    const result = checkContent(badText);
    if (!result.allowed) {
        console.log("✅ Service check passed: 'porn' was blocked.");
    } else {
        console.error("❌ Service check failed: 'porn' was allowed.");
        process.exit(1);
    }

    const goodText = "This is a clean post about coffee.";
    const resultGood = checkContent(goodText);
    if (resultGood.allowed) {
        console.log("✅ Service check passed: Clean text allowed.");
    } else {
        console.error("❌ Service check failed: Clean text blocked.");
        process.exit(1);
    }

    console.log("Moderation logic verification complete.");
}

testModeration();
