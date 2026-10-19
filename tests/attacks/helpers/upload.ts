// Helpers for the UPLOAD attack suite. Kept separate from tests/e2e/* so the existing
// helper files stay untouched (per the audit brief).
import path from "node:path";
import { Client } from "../../e2e/client";

// The folder every multer config writes to (server/utils/file-upload.ts: path.join(process.cwd(), "uploads")).
// Tests run with cwd = repo root, so this resolves to the same directory the server uses.
export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export type UploadResult = { res: Response; body: any };

async function parse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// POST /api/posts with a single media file (field name "media").
export async function uploadPostMedia(
  client: Client,
  data: Buffer,
  mime: string,
  filename: string,
  extra: Record<string, string> = {},
): Promise<UploadResult> {
  const form = new FormData();
  form.append("content", extra.content ?? `atk ${Math.random().toString(36).slice(2)}`);
  for (const [k, v] of Object.entries(extra)) if (k !== "content") form.append(k, v);
  form.append("media", new Blob([data], { type: mime }), filename);
  const res = await client.request("POST", "/api/posts", { form });
  return { res, body: await parse(res) };
}

// POST /api/user/themes/background (field name "background").
export async function uploadThemeBackground(
  client: Client,
  data: Buffer,
  mime: string,
  filename: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("background", new Blob([data], { type: mime }), filename);
  const res = await client.request("POST", "/api/user/themes/background", { form });
  return { res, body: await parse(res) };
}

export async function deleteThemeBackground(client: Client, fileRef: string): Promise<Response> {
  // fileRef is placed raw into a single path segment; encodeURIComponent keeps "/" as %2F so
  // Express still matches one segment but decodes it back to a slash in req.params.
  return client.request("DELETE", `/api/user/themes/background/${encodeURIComponent(fileRef)}`);
}

// A highly compressible, large-dimension image: a decompression / pixel bomb. Small on disk,
// enormous once decoded (width*height*channels bytes in memory).
export async function makePixelBomb(width: number, height: number, format: "png" | "webp" = "png"): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .toFormat(format, format === "png" ? { compressionLevel: 9 } : { lossless: true })
    .toBuffer();
}

// A real JPEG carrying GPS + Copyright EXIF, to check metadata is stripped on store.
export async function makeJpegWithExif(): Promise<{ buf: Buffer; marker: string }> {
  const sharp = (await import("sharp")).default;
  const marker = "ATK_SECRET_GPS_MARKER";
  const buf = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .withExif({ IFD0: { Copyright: marker }, GPS: { GPSLatitude: "1/1 2/1 3/1", GPSLongitude: "4/1 5/1 6/1" } })
    .jpeg()
    .toBuffer();
  return { buf, marker };
}

// A valid GIF header followed by an HTML/script polyglot payload. The GIF magic bytes pass the
// signature check; the trailing bytes are the "active" payload we do not want served executable.
export function makeGifPolyglot(): { buf: Buffer; marker: string } {
  const marker = "ATK_POLYGLOT_SCRIPT";
  // Minimal but valid GIF89a header + logical screen descriptor, then junk HTML.
  const header = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00", "binary");
  const payload = Buffer.from(`<html><script>/*${marker}*/alert(1)</script></html>`, "utf8");
  const trailer = Buffer.from("\x3b", "binary"); // GIF trailer
  return { buf: Buffer.concat([header, payload, trailer]), marker };
}
