import http from "http";

// Configuration
const HOST = "localhost";
const PORT = 5000;

// Stats
const RESULTS = {
  xss: { attempts: 0, blocked_or_sanitized: 0, potential_success: 0 },
  dos: { attempts: 0, blocked: 0, success: 0, error: 0 },
  pollution: { attempts: 0, handled: 0, error: 0 },
};

// 1. Stored XSS Attempt (Content Injection)
// We try to register/login first to get a session?
// For simplicity, we'll try to hit a public endpoint or assume we have a user.
// Since `routes.ts` protects `/api/posts` with `isAuthenticated`,
// we generally need a cookie.
// However, the user wants to see if the server is robust.
// Let's test the OPEN endpoints or try to crash the parser.

function testLargePayload() {
  const hugeString = "A".repeat(10 * 1024 * 1024); // 10MB
  const data = JSON.stringify({ username: "admin", password: hugeString });

  const req = http.request(
    {
      hostname: HOST,
      port: PORT,
      path: "/api/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    },
    (res) => {
      RESULTS.dos.attempts++;
      // 413 Payload Too Large is BEST
      // 500 is BAD (crash)
      // 200/401 means it tried to parse 10MB (Bad for CPU)

      if (res.statusCode === 413) {
        RESULTS.dos.blocked++;
      } else {
        console.log(`[DoS] Unexpected status for 10MB payload: ${res.statusCode}`);
        RESULTS.dos.success++; // "Success" for the attacker (server spent resources)
      }
    },
  );

  req.on("error", (e) => RESULTS.dos.error++);
  req.write(data);
  req.end();
}

function testParameterPollution() {
  // Attack: ?category=discussion&category=discussion&category=...
  // Express/QS might convert this to an array, possibly breaking logic expecting a string.
  const path = "/api/posts?category=discussion&category=general&category=meme";

  const req = http.request(
    {
      hostname: HOST,
      port: PORT,
      path: path,
      method: "GET",
    },
    (res) => {
      RESULTS.pollution.attempts++;
      if (res.statusCode === 200) {
        // It handled it gracefully (likely returning empty list or filtered list)
        RESULTS.pollution.handled++;
      } else if (res.statusCode === 500) {
        console.log(`[HPP] Server Error on Parameter Pollution!`);
        RESULTS.pollution.error++;
      }
    },
  );

  req.on("error", () => RESULTS.pollution.error++);
  req.end();
}

async function runAdvancedAttack() {
  console.log(`[🧪] STARTING ADVANCED SECURITY PROBE on http://${HOST}:${PORT}`);

  // 1. Large Payload Test
  console.log("[1] Testing Large Payload (10MB Body)...");
  testLargePayload();

  // 2. HTTP Parameter Pollution
  setTimeout(() => {
    console.log("[2] Testing HTTP Parameter Pollution...");
    testParameterPollution();
  }, 1000);

  // Wait and Report
  setTimeout(() => {
    console.log("\n[📊] ADVANCED PROBE RESULTS:");
    console.log("---------------------------------------------------");

    console.log("VECTOR 1: LARGE PAYLOAD (DoS)");
    console.log(
      `- Status: ${RESULTS.dos.blocked > 0 ? "✅ Blocked (413 Payload Too Large)" : "⚠️ Accepted/Parsed (Resource Drain Risk)"}`,
    );
    if (RESULTS.dos.success > 0)
      console.log("  -> Recommendation: Configure 'express.json({ limit: ... })'");

    console.log("\nVECTOR 2: PARAMETER POLLUTION");
    console.log(
      `- Status: ${RESULTS.pollution.error === 0 ? "✅ Handled Gracefully" : "❌ Server Error (Logic Break)"}`,
    );

    console.log("---------------------------------------------------");
  }, 3000);
}

runAdvancedAttack();
