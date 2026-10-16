export const BASE_URL = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:5000").replace(/\/$/, "");
export const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
export const RUN_ID = Date.now().toString(36);

type RequestOptions = {
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  csrf?: boolean;
};

let ipCounter = 0;

// Each client gets its own X-Forwarded-For address so per-IP rate limits don't bleed between
// tests. This requires the server to run with TRUST_PROXY=true, as it does behind nginx.
export function freshIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.${Math.floor(Math.random() * 250) + 1}`;
}

export class Client {
  readonly cookies = new Map<string, string>();
  csrfToken: string | undefined;

  constructor(readonly ip: string = freshIp()) {}

  async request(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...opts.headers };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    if (opts.csrf !== false && method !== "GET" && this.csrfToken) {
      headers["x-csrf-token"] = this.csrfToken;
    }
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = opts.form;
    }
    const res = await fetch(BASE_URL + path, { method, headers, body, redirect: "manual" });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const eq = pair.indexOf("=");
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return res;
  }

  get(path: string, opts?: RequestOptions) {
    return this.request("GET", path, opts);
  }
  post(path: string, json?: unknown, opts?: RequestOptions) {
    return this.request("POST", path, { json, ...opts });
  }
  patch(path: string, json?: unknown, opts?: RequestOptions) {
    return this.request("PATCH", path, { json, ...opts });
  }
  delete(path: string, opts?: RequestOptions) {
    return this.request("DELETE", path, opts);
  }

  async refreshCsrf(): Promise<string> {
    const res = await this.get("/api/csrf-token");
    const data = await res.json();
    this.csrfToken = data.csrfToken;
    return data.csrfToken;
  }

  async login(username: string, password: string): Promise<Response> {
    await this.refreshCsrf();
    const res = await this.post("/api/login", { username, password });
    if (res.ok) await this.refreshCsrf();
    return res;
  }

  async register(username: string, password: string, extra: Record<string, unknown> = {}): Promise<Response> {
    await this.refreshCsrf();
    const res = await this.post("/api/register", {
      username,
      email: `${username}@e2e.test`,
      password,
      ...extra,
    });
    if (res.ok) await this.refreshCsrf();
    return res;
  }
}

export async function newUser(prefix: string, password = "E2e-Passw0rd!") {
  const client = new Client();
  const username = `${prefix}_${RUN_ID}`.slice(0, 30);
  const res = await client.register(username, password);
  if (res.status !== 201) {
    throw new Error(`register ${username} failed: ${res.status} ${await res.text()}`);
  }
  const user = await res.json();
  return { client, username, password, id: user.id as number };
}

// Smallest valid PNG (1x1 transparent pixel).
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export async function expectStatus(res: Response, ...expected: number[]): Promise<void> {
  if (!expected.includes(res.status)) {
    throw new Error(`expected HTTP ${expected.join(" or ")}, got ${res.status}: ${await res.text()}`);
  }
}

export async function uploadProfileImage(
  client: Client,
  type: string,
  data: Buffer,
  mime: string,
  filename: string,
): Promise<Response> {
  const form = new FormData();
  form.append("type", type);
  form.append("image", new Blob([data], { type: mime }), filename);
  return client.request("POST", "/api/profile-upload", { form });
}

// A real, noisy test image (noise keeps encoders from shrinking it to almost nothing).
export async function makeImage(format: "png" | "jpeg" | "webp", width: number, height: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width, height, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 40 } } })
    .toFormat(format)
    .toBuffer();
}
