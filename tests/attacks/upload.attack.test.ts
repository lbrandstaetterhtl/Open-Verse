// UPLOAD attack scenarios (audit #2).
//
// Routes under test (enumerated from code via `npx tsx tests/security/routes.ts`):
//   POST   /api/posts                               postUpload.any()           (server/routes/posts.ts:21)
//   POST   /api/profile-upload (+ /api/user, /api/users)  receiveProfileImage  (server/routes/users.ts:338)
//   POST   /api/user/themes/background              themeBackgroundUpload       (server/routes/themes.ts:94)
//   DELETE /api/user/themes/background/:fileRef                                 (server/routes/themes.ts:130)
//   GET    /uploads/*                               express.static hardening    (server/index.ts:69)
//
// Each test asserts the SAFE outcome. A test that currently fails documents a live finding
// (see docs/audit/attacks/findings-upload.json) that must pass once fixed.

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client, newUser, PNG_1X1, makeImage, uploadProfileImage } from "../e2e/client";
import {
  UPLOADS_DIR,
  uploadPostMedia,
  uploadThemeBackground,
  deleteThemeBackground,
  makePixelBomb,
  makeJpegWithExif,
  makeGifPolyglot,
} from "./helpers/upload";

function snapshotUploads(): Set<string> {
  try {
    return new Set(fs.readdirSync(UPLOADS_DIR));
  } catch {
    return new Set();
  }
}
function newFilesSince(before: Set<string>): string[] {
  return [...snapshotUploads()].filter((f) => !before.has(f));
}

// A real PNG with real pixel data (PNG_1X1 is valid but trivially small; use a noisy one where size matters).
async function realPng(w = 32, h = 32): Promise<Buffer> {
  return makeImage("png", w, h);
}

describe("Angriff: Dateien anderer Nutzer oder des Servers loeschen", () => {
  // Attacker: any logged-in user. Goal: delete files they do not own, or any file on the
  // server's filesystem, via DELETE /api/user/themes/background/:fileRef.

  it("Pfad-Traversal im fileRef darf keine Datei ausserhalb von /uploads loeschen", async () => {
    const { client } = await newUser("atk_trav");
    // A sentinel file well outside the uploads directory.
    const sentinelDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-upload-"));
    const sentinel = path.join(sentinelDir, "do-not-delete.txt");
    fs.writeFileSync(sentinel, "sentinel");

    // "theme-bg-" prefix satisfies the guard; the rest is ../ traversal (encoded as %2F per segment).
    const rel = "theme-bg-" + "../".repeat(12) + sentinel.replace(/^\/+/, "");
    const res = await deleteThemeBackground(client, rel);

    const survived = fs.existsSync(sentinel);
    if (fs.existsSync(sentinel)) fs.rmSync(sentinelDir, { recursive: true, force: true });
    assert.ok(
      survived,
      `path traversal deleted a file outside /uploads (DELETE returned ${res.status}); ` +
        "the :fileRef guard only checks the 'theme-bg-' prefix, not traversal segments",
    );
  });

  it("ein Nutzer darf das Hintergrundbild eines anderen Nutzers nicht loeschen", async () => {
    const victim = await newUser("atk_victim");
    const attacker = await newUser("atk_thief");

    const up = await uploadThemeBackground(victim.client, await realPng(24, 24), "image/png", "bg.png");
    assert.equal(up.res.status, 200, "victim background upload should succeed");
    const fileRef: string = up.body.fileRef;
    assert.ok(fileRef && fs.existsSync(path.join(UPLOADS_DIR, fileRef)), "victim file must exist on disk");

    const del = await deleteThemeBackground(attacker.client, fileRef);

    const stillThere = fs.existsSync(path.join(UPLOADS_DIR, fileRef));
    assert.ok(
      stillThere,
      `attacker deleted another user's upload (DELETE returned ${del.status}); ` +
        "the route only checks that the CALLER's themes reference the file, not file ownership",
    );
  });
});

describe("Angriff: Server mit einer Bild-Bombe lahmlegen", () => {
  // Attacker: a logged-in user. Goal: exhaust CPU/memory by uploading a tiny file that decodes
  // to a gigantic bitmap. sanitizeImage() (posts + theme bg) calls sharp() with no
  // limitInputPixels, so images up to sharp's ~268MP default are fully decoded.

  it("riesige Pixel-Dimensionen muessen beim Theme-Background schnell abgelehnt werden", async () => {
    const { client } = await newUser("atk_bomb_t");
    const bomb = await makePixelBomb(9000, 9000); // 81 MP, a few hundred KB on disk
    assert.ok(bomb.length < 5 * 1024 * 1024, "bomb must fit under the 5MB theme limit to reach sanitizeImage");

    const t0 = Date.now();
    const { res } = await uploadThemeBackground(client, bomb, "image/png", "bomb.png");
    const ms = Date.now() - t0;

    assert.ok(
      res.status >= 400 && res.status < 500,
      `81MP image was accepted (status ${res.status} in ${ms}ms); huge dimensions must be rejected ` +
        "(sanitizeImage lacks limitInputPixels in server/utils/file-upload.ts)",
    );
  });

  it("riesige Pixel-Dimensionen muessen bei Post-Medien schnell abgelehnt werden", async () => {
    const { client } = await newUser("atk_bomb_p");
    const bomb = await makePixelBomb(9000, 9000); // 81 MP, well under the 10MB image cap
    assert.ok(bomb.length < 10 * 1024 * 1024, "bomb must fit under the 10MB image limit");

    const t0 = Date.now();
    const { res } = await uploadPostMedia(client, bomb, "image/png", "bomb.png", { content: "bomb post" });
    const ms = Date.now() - t0;

    assert.ok(
      res.status >= 400 && res.status < 500,
      `81MP post image was accepted (status ${res.status} in ${ms}ms); huge dimensions must be rejected`,
    );
  });
});

describe("Angriff: Festplatte mit Waisen-Dateien fluten", () => {
  // Attacker: a logged-in user. Goal: fill the disk by triggering uploads that are written by
  // multer but then abandoned by an early return in the handler (no cleanup).

  it("ein durch Moderation abgelehnter Post darf keine Waisen-Datei hinterlassen", async () => {
    const { client } = await newUser("atk_orph_m");
    const img = await realPng(40, 40);
    const before = snapshotUploads();
    // "porn" is in BANNED_WORDS -> checkContent blocks BEFORE file cleanup (posts.ts:82).
    const { res } = await uploadPostMedia(client, img, "image/png", "m.png", { content: "this is porn content" });
    assert.ok(res.status >= 400, `expected moderation to block the post, got ${res.status}`);

    const leftovers = newFilesSince(before);
    assert.deepEqual(
      leftovers,
      [],
      `a rejected post left orphan file(s) on disk: ${leftovers.join(", ")}; ` +
        "multer writes the file before the moderation check and the early return never deletes it",
    );
  });

  it("ein durch Cooldown abgelehnter Post darf keine Waisen-Datei hinterlassen", async () => {
    const { client } = await newUser("atk_orph_c");
    const img = await realPng(40, 40);
    // First post succeeds and starts the cooldown window.
    const first = await uploadPostMedia(client, img, "image/png", "c1.png", { content: "first legit post" });
    assert.equal(first.res.status, 201, `first post should succeed, got ${first.res.status}`);

    const before = snapshotUploads();
    // Second post within the cooldown window: rejected with 429, but the file is already written.
    const second = await uploadPostMedia(client, img, "image/png", "c2.png", { content: "second post too soon" });
    assert.equal(second.res.status, 429, `expected cooldown rejection, got ${second.res.status}`);

    const leftovers = newFilesSince(before);
    assert.deepEqual(
      leftovers,
      [],
      `a cooldown-rejected post left orphan file(s): ${leftovers.join(", ")}; ` +
        "the 429 early return (posts.ts) does not delete the already-written upload",
    );
  });
});

describe("Angriff: aktives Script ueber einen Upload ausliefern", () => {
  // Attacker: a logged-in user. Goal: get HTML/SVG/JS stored and served executable from the app origin.

  it("SVG (mit <script>) wird als Profilbild abgelehnt", async () => {
    const { client } = await newUser("atk_svg");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await uploadProfileImage(client, "avatar", svg, "image/svg+xml", "x.svg");
    assert.ok(res.status >= 400, `SVG upload was accepted (status ${res.status}); SVG must never be stored`);
  });

  it("HTML-Inhalt mit image/png-Header wird am Signatur-Check abgelehnt", async () => {
    const { client } = await newUser("atk_htmlpng");
    const html = Buffer.from("<html><script>alert(document.cookie)</script></html>");
    const res = await uploadProfileImage(client, "avatar", html, "image/png", "fake.png");
    assert.ok(res.status >= 400, `HTML-with-png-mime was accepted (status ${res.status}); content signature must be verified`);
  });

  it("ausgelieferte Uploads tragen nosniff und einen nicht-aktiven Content-Type", async () => {
    const { client } = await newUser("atk_served");
    const res = await uploadProfileImage(client, "avatar", await realPng(20, 20), "image/png", "ok.png");
    assert.equal(res.status, 200, "valid image upload should succeed");
    const url: string = (await res.json()).url;

    const got = await new Client(client.ip).get(url);
    assert.equal(got.status, 200, "uploaded image should be retrievable");
    const ct = got.headers.get("content-type") || "";
    const nosniff = got.headers.get("x-content-type-options") || "";
    assert.equal(nosniff.toLowerCase(), "nosniff", "served upload must carry X-Content-Type-Options: nosniff");
    assert.ok(
      /^image\//.test(ct) || /^video\//.test(ct),
      `served upload must have an image/* or video/* Content-Type, got '${ct}'`,
    );
    assert.ok(!/text\/html|application\/xhtml|image\/svg/.test(ct), `served upload must not be an active document type ('${ct}')`);
  });

  it("ein GIF-Polyglot wird nicht als aktives HTML ausgeliefert (und sollte re-encoded werden)", async () => {
    const { client } = await newUser("atk_gif");
    const { buf, marker } = makeGifPolyglot();
    const up = await uploadPostMedia(client, buf, "image/gif", "p.gif", { content: "gif polyglot" });

    if (up.res.status === 201) {
      // Critical requirement: even if stored, it must be served as an inert image, never HTML.
      const mediaUrl = `/uploads/${up.body.mediaUrl}`;
      const got = await new Client(client.ip).get(mediaUrl);
      const ct = got.headers.get("content-type") || "";
      const nosniff = (got.headers.get("x-content-type-options") || "").toLowerCase();
      assert.equal(nosniff, "nosniff", "served GIF must carry nosniff so it cannot be sniffed as HTML");
      assert.ok(!/text\/html|image\/svg/.test(ct), `GIF must not be served as an active document ('${ct}')`);

      // Hardening: the stored bytes should be re-encoded, not kept verbatim with the raw payload.
      const onDisk = fs.readFileSync(path.join(UPLOADS_DIR, up.body.mediaUrl));
      assert.ok(
        !onDisk.includes(Buffer.from(marker)),
        "GIF is stored byte-for-byte including the raw HTML payload; sanitizeImage() skips GIFs",
      );
    } else {
      // Rejecting the polyglot outright is also a safe outcome.
      assert.ok(up.res.status >= 400, `unexpected status ${up.res.status}`);
    }
  });

  it("GET /uploads mit (encodierten) Traversal-Segmenten liefert keine Server-Datei aus", async () => {
    // Only encoded forms are meaningful: a literal "../" is collapsed by the HTTP client before
    // it ever reaches the server, so these keep the traversal encoded end-to-end.
    const anon = new Client();
    for (const p of [
      "/uploads/..%2f..%2fserver%2findex.ts",
      "/uploads/..%2f..%2fpackage.json",
      "/uploads/%2e%2e%2f%2e%2e%2fpackage.json",
      "/uploads/..%5c..%5cpackage.json",
    ]) {
      const res = await anon.get(p);
      const body = await res.text();
      assert.ok(res.status >= 400, `${p} returned ${res.status}; must not serve files outside /uploads`);
      assert.ok(!/"dependencies"\s*:/.test(body) && !/registerRoutes/.test(body), `${p} leaked a server file`);
    }
  });
});

describe("Angriff: EXIF/GPS-Metadaten aus Uploads auslesen", () => {
  // Attacker: a viewer of someone's profile/post. Goal: recover GPS/EXIF left in an uploaded image.

  it("GPS/EXIF wird aus Profilbildern entfernt", async () => {
    const { client } = await newUser("atk_exif_p");
    const { buf, marker } = await makeJpegWithExif();
    const res = await uploadProfileImage(client, "avatar", buf, "image/jpeg", "exif.jpg");
    assert.equal(res.status, 200, "exif image upload should succeed");
    const url: string = (await res.json()).url;

    const onDisk = fs.readFileSync(path.join(process.cwd(), url.replace(/^\//, "")));
    const sharp = (await import("sharp")).default;
    const meta = await sharp(onDisk).metadata();
    assert.ok(!meta.exif, "stored profile image must not contain an EXIF block");
    assert.ok(!onDisk.includes(Buffer.from(marker)), "stored profile image must not contain the EXIF Copyright/GPS marker");
  });

  it("GPS/EXIF wird aus Post-Bildern entfernt", async () => {
    const { client } = await newUser("atk_exif_post");
    const { buf, marker } = await makeJpegWithExif();
    const up = await uploadPostMedia(client, buf, "image/jpeg", "exif.jpg", { content: "exif post" });
    assert.equal(up.res.status, 201, `post upload should succeed, got ${up.res.status}`);

    const onDisk = fs.readFileSync(path.join(UPLOADS_DIR, up.body.mediaUrl));
    const sharp = (await import("sharp")).default;
    const meta = await sharp(onDisk).metadata();
    assert.ok(!meta.exif, "stored post image must not contain an EXIF block");
    assert.ok(!onDisk.includes(Buffer.from(marker)), "stored post image must not contain the EXIF Copyright/GPS marker");
  });
});

describe("Angriff: Upload-Ordner verlassen oder Groessenlimits umgehen", () => {
  // Attacker: a logged-in user. Goal: control the stored path/name, or bypass size limits.

  it("ein bosartiger Dateiname kann den Upload-Ordner nicht verlassen", async () => {
    const { client } = await newUser("atk_fname");
    const res = await uploadProfileImage(client, "avatar", await realPng(16, 16), "image/png", "../../evil.png");
    assert.equal(res.status, 200, "upload with a hostile filename should still succeed (name is forced)");
    const url: string = (await res.json()).url;
    assert.match(url, /^\/uploads\/[\w.-]+$/, `stored URL escaped the uploads folder: ${url}`);
    const resolved = path.resolve(process.cwd(), url.replace(/^\//, ""));
    assert.ok(resolved.startsWith(UPLOADS_DIR + path.sep), `stored file resolved outside uploads: ${resolved}`);
  });

  it("PATCH /api/profile lehnt eine avatarUrl ausserhalb von /uploads ab", async () => {
    const { client } = await newUser("atk_urlinj");
    const res = await client.patch("/api/profile", { avatarUrl: "/etc/passwd" });
    assert.ok(res.status >= 400, `avatarUrl pointing outside /uploads was accepted (status ${res.status})`);
    const res2 = await client.patch("/api/profile", { avatarUrl: "https://evil.example/x.png" });
    assert.ok(res2.status >= 400, `external avatarUrl was accepted (status ${res2.status})`);
  });

  it("eine ueber dem Limit liegende Profilbild-Datei wird mit 413 abgelehnt", async () => {
    const { client } = await newUser("atk_big");
    // Noisy PNG well over the 10MB profile limit (noise defeats PNG compression).
    const big = await makeImage("png", 3000, 3000);
    assert.ok(big.length > 10 * 1024 * 1024, `precondition: test image must exceed 10MB, got ${big.length}`);
    const res = await uploadProfileImage(client, "avatar", big, "image/png", "big.png");
    assert.ok(
      res.status === 413 || res.status === 400,
      `oversized profile upload should be rejected (413/400), got ${res.status}`,
    );
  });
});
