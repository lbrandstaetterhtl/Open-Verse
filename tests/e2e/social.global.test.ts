// Tests in this file take the whole server down when the bug is present (they were NOT run against the
// shared audit server). Run them only against a private instance.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { BASE_URL, Client } from "./client";

function rawUpgrade(origin: string): Promise<string> {
  const { hostname, port } = new URL(BASE_URL);
  return new Promise((resolve) => {
    const socket = net.connect(Number(port || 80), hostname, () => {
      socket.write(
        "GET /ws HTTP/1.1\r\n" +
          `Host: ${hostname}:${port}\r\n` +
          "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
          `Origin: ${origin}\r\n` +
          "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
      );
    });
    let data = "";
    socket.on("data", (chunk) => (data += chunk));
    socket.on("close", () => resolve(data));
    socket.on("error", () => resolve(data));
    setTimeout(() => {
      socket.destroy();
      resolve(data);
    }, 3000);
  });
}

describe("websocket upgrade robustness", () => {
  test("an unparsable Origin header on /ws does not crash the server", async () => {
    // Browsers send "Origin: null" from sandboxed iframes and file:// pages; no login is needed.
    for (const origin of ["null", "not a url"]) {
      await rawUpgrade(origin);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const res = await new Client().get("/api/health").catch(() => null);
      assert.equal(res?.status, 200, `server is down after an upgrade with Origin: ${origin}`);
    }
  });
});
