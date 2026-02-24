import fs from "fs";
import path from "path";
import { Blob } from "buffer";
import { fileURLToPath } from "url";

// Node 18+ has native fetch/FormData.

const BASE_URL = "http://127.0.0.1:5000";

// Helper for cookies and CSRF
let cookieJar = "";
let csrfToken = "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function request(url: string, options: any = {}) {
  const headers = options.headers || {};
  if (cookieJar) {
    headers["Cookie"] = cookieJar;
  }
  if (csrfToken && !headers["x-csrf-token"]) {
    // Add CSRF if we have it
    headers["x-csrf-token"] = csrfToken;
  }

  options.headers = headers;

  const response = await fetch(BASE_URL + url, options);

  // Update cookies if present (simple storage)
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    const parts = setCookie.split(";")[0];
    cookieJar = parts;
  }

  return response;
}

async function initCsrf() {
  // Determine CSRF token mechanism.
  // Usually it's in a meta tag or specific endpoint.
  // server/routes.ts has app.get("/api/csrf-token")
  try {
    const res = await request("/api/csrf-token");
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.csrfToken;
      console.log("CSRF Token acquired:", csrfToken);
    }
  } catch (e) {
    console.log("Failed to get CSRF token:", e);
  }
}

async function runVerification() {
  console.log("Starting Security Verification (Fixed)...");

  // 0. Get initial CSRF
  await initCsrf();

  // --- TEST 1: Password Policy ---
  console.log("\n[TEST 1] Password Policy");
  try {
    const weakPayload = {
      username: `weak_${Date.now()}`,
      email: `weak_${Date.now()}@test.com`,
      password: "weak",
    };

    const res = await request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(weakPayload),
    });

    const txt = await res.text();
    // Expect 400 or 500 (Zod error)
    if (res.status === 400 || res.status === 500) {
      console.log(`✅ PASSED: Weak password rejected (Status ${res.status})`);
    } else {
      console.log(`❌ FAILED: Weak password accepted (Status ${res.status}) - ${txt}`);
    }
  } catch (e: any) {
    console.log("Error in Test 1:", e.message);
  }

  // --- TEST 2: File Upload (Magic Bytes) ---
  console.log("\n[TEST 2] File Upload Spoofing");
  try {
    await initCsrf(); // Refresh CSRF just in case

    // Register valid user
    const strongUser = {
      username: `strong_${Date.now()}`,
      email: `strong_${Date.now()}@test.com`,
      password: "StrongPass1!",
    };

    const regRes = await request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(strongUser),
    });

    if (regRes.status !== 201) {
      // If already exists or fail, try login
      await request("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: strongUser.username, password: strongUser.password }),
      });
    }

    // Update CSRF after login/register if it rotates (passport often regenerates session)
    await initCsrf();

    // Prepare fake file
    const fakePath = path.join(__dirname, "fake_img.jpg");
    fs.writeFileSync(fakePath, "Fake content");

    const fileBuffer = fs.readFileSync(fakePath);
    const blob = new Blob([fileBuffer], { type: "image/jpeg" });

    const formData = new FormData();
    formData.append("title", "Spoof");
    formData.append("content", "Text");
    formData.append("file", blob, "fake_img.jpg");

    const upRes = await request("/api/posts", {
      method: "POST",
      body: formData,
    });

    const upTxt = await upRes.text();

    if (upRes.status === 400 && upTxt.includes("File content does not match extension")) {
      console.log("✅ PASSED: Fake image rejected correctly.");
    } else {
      console.log(`❌ FAILED: Status ${upRes.status} - ${upTxt}`);
    }

    if (fs.existsSync(fakePath)) fs.unlinkSync(fakePath);
  } catch (e: any) {
    console.log("Error in Test 2:", e.message);
  }

  // --- TEST 3: Race Condition ---
  console.log("\n[TEST 3] Race Condition");
  try {
    await initCsrf(); // Ensure we valid token

    // Create Post
    const postRes = await request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Race Test",
        content: "Testing races",
        category: "discussion",
      }),
    });

    if (postRes.status !== 201) {
      console.log(
        `Skipping Race Test (Create Post Failed): ${postRes.status} - ${await postRes.text()}`,
      );
      return;
    }

    const postData = await postRes.json();
    const postId = postData.id;
    console.log(`Target Post: ${postId}`);

    // Concurrent Likes
    const requests = Array(5)
      .fill(0)
      .map(() =>
        request(`/api/posts/${postId}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isLike: true }),
        }),
      );

    const responses = await Promise.all(requests);
    const successCount = responses.filter((r) => r.status === 200).length;

    console.log(`Concurrent Requests: 5. Successes: ${successCount}`);

    // Check DB count
    const getRes = await request(`/api/posts/${postId}`);
    const getData = await getRes.json();
    const likes = getData.reactions?.likes || 0;

    console.log(`Final DB Likes: ${likes}`);

    if (likes === 1) {
      console.log("✅ PASSED: Race condition prevented.");
    } else {
      console.log(`❌ FAILED: Race condition detected (Likes: ${likes})`);
    }
  } catch (e: any) {
    console.log("Error in Test 3:", e.message);
  }
}

runVerification();
