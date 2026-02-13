import { generatePostContent } from "../server/services/openai";

async function testAIGeneration() {
  console.log("Testing AI Post Generation Service...");

  // Test 1: English
  console.log("\n[Test 1] English Generation");
  try {
    const content = await generatePostContent({
      topic: "Sunny Days",
      imageContext: "has_image",
      language: "english",
    });
    console.log("Result:", content.substring(0, 50) + "...");
  } catch (error) {
    console.error("Test 1 Failed:", error);
  }

  // Test 2: German
  console.log("\n[Test 2] German Generation");
  try {
    const content = await generatePostContent({
      topic: "Sommer",
      imageContext: "has_image",
      language: "german",
    });
    console.log("Result:", content);
    if (!content.includes("Hier ist ein Gedanke") && !content.includes("Habe gerade")) {
      console.warn("WARNING: Content might not be in German?");
    }
  } catch (error) {
    console.error("Test 2 Failed:", error);
  }

  // Test 3: No Image
  console.log("\n[Test 3] Topic Only (No Image)");
  try {
    const content = await generatePostContent({ topic: "Coding" });
    console.log("Result:", content.substring(0, 50) + "...");
  } catch (error) {
    console.error("Test 3 Failed:", error);
  }
}

testAIGeneration();
