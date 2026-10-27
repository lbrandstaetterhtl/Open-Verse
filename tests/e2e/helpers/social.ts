import WebSocket from "ws";
import { BASE_URL, Client, newUser, expectStatus } from "../client";

export type TestUser = Awaited<ReturnType<typeof newUser>>;

let counter = 0;

/** A fresh user with a unique, short prefix (newUser cuts names at 30 characters). */
export function socialUser(tag: string): Promise<TestUser> {
  counter++;
  return newUser(`s${counter}${tag}`.slice(0, 12));
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function notificationsOf(client: Client, query = ""): Promise<any[]> {
  const res = await client.get(`/api/notifications${query}`);
  await expectStatus(res, 200);
  return res.json();
}

/** Raises a user's karma via the admin API so they may create communities (needs 200). */
export async function giveKarma(admin: Client, userId: number, karma: number): Promise<void> {
  await expectStatus(await admin.patch(`/api/admin/users/${userId}`, { karma }), 200);
}

export async function createCommunity(owner: Client, body: Record<string, unknown>): Promise<any> {
  const res = await owner.post("/api/communities", body);
  await expectStatus(res, 201);
  return res.json();
}

export async function membersOf(client: Client, communityId: number): Promise<any[]> {
  const res = await client.get(`/api/communities/${communityId}/members`);
  await expectStatus(res, 200);
  return res.json();
}

export const WS_URL = BASE_URL.replace(/^http/, "ws") + "/ws";

export type Socket = {
  ws: WebSocket;
  messages: any[];
  notifications: () => any[];
  close: () => Promise<void>;
};

function cookieHeader(client: Client): string {
  return [...client.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Opens /ws with the client's session cookie. Resolves with the socket or the HTTP status of the refusal. */
export function openSocket(
  client: Client | null,
  headers: Record<string, string> = {},
): Promise<{ socket?: Socket; status?: number }> {
  return new Promise((resolve) => {
    const allHeaders: Record<string, string> = { ...headers };
    if (client) {
      allHeaders.cookie = cookieHeader(client);
      allHeaders["x-forwarded-for"] = client.ip;
    }
    const ws = new WebSocket(WS_URL, { headers: allHeaders });
    const messages: any[] = [];
    ws.on("message", (data) => {
      try {
        messages.push(JSON.parse(String(data)));
      } catch {
        messages.push(String(data));
      }
    });
    ws.on("open", () =>
      resolve({
        socket: {
          ws,
          messages,
          notifications: () => messages.filter((m) => m?.type === "notification"),
          close: () =>
            new Promise<void>((done) => {
              if (ws.readyState === WebSocket.CLOSED) return done();
              ws.once("close", () => done());
              ws.close();
            }),
        },
      }),
    );
    ws.on("unexpected-response", (_req, res) => {
      resolve({ status: res.statusCode });
      res.resume();
    });
    ws.on("error", () => resolve({ status: -1 }));
  });
}
