import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import sharp from "sharp";
import { logSecurityEvent } from "./logger";

// SEC-002: File Signature Verification Helper
export async function checkFileSignature(filepath: string, mimetype: string): Promise<boolean> {
    try {
        const buffer = Buffer.alloc(4100);
        const fd = await fs.promises.open(filepath, 'r');
        await fd.read(buffer, 0, 4100, 0);
        await fd.close();

        // Common signatures
        const signatures: Record<string, string[]> = {
            'image/jpeg': ['ffd8ff'],
            'image/png': ['89504e470d0a1a0a'],
            'image/gif': ['47494638'],
            'video/webm': ['1a45dfa3']
        };

        const hex = buffer.toString('hex', 0, 32); // Check first 32 bytes

        // SEC-FIX [SEC-007]: Strict offset check for MP4 atoms (usually starts at offset 4)
        // Offset 4 bytes = index 8 in hex string
        const ftypMatch = hex.slice(8, 16) === "66747970";
        if (mimetype === 'video/mp4' && ftypMatch) {
            return true;
        }

        // Check for WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
        const riff = hex.slice(0, 8); // 4 bytes * 2 hex chars
        const webp = hex.slice(16, 24); // bytes 8-11
        if (mimetype === 'image/webp' && riff === '52494646' && webp === '57454250') {
            return true;
        }

        // Flatten and use strict prefix matching for other types
        const expectedSignatures = signatures[mimetype] || [];
        const matches = expectedSignatures.some(sig => hex.startsWith(sig));

        if (!matches) {
            console.warn(`[SEC] checkFileSignature: Signature mismatch for ${mimetype}. Header: ${hex.slice(0, 16)}...`);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error in checkFileSignature:", error);
        return false;
    }
}

/** Largest image (width × height × frames) that is decoded at all; stops decompression bombs (ATK-UPLOAD-3). */
export const MAX_IMAGE_PIXELS = 50_000_000;

/** Thrown by sanitizeImage: the upload is not a usable image. `code` tells the route which answer to give. */
export class ImageRejectedError extends Error {
    constructor(public code: "IMAGE_TOO_LARGE" | "INVALID_IMAGE", message: string) {
        super(message);
        this.name = "ImageRejectedError";
    }
}

// SEC-003: Image sanitization. Every image is decoded and re-encoded in its own format (so the file name's
// extension, and with it the served Content-Type, keeps matching the bytes — CONTENT-15 / ATK-UPLOAD-7).
// Re-encoding drops EXIF/XMP and anything appended to the image data (polyglots, ATK-UPLOAD-6), GIFs included.
// Throws ImageRejectedError when the file cannot be decoded (CONTENT-14) or is too large in pixels.
export async function sanitizeImage(filepath: string): Promise<void> {
    const ext = path.extname(filepath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        return; // not an image (videos are only signature-checked)
    }
    const animated = ext === '.gif' || ext === '.webp';
    const tmpPath = `${filepath}.sanitized`;

    let meta: sharp.Metadata;
    try {
        meta = await sharp(filepath, { limitInputPixels: false }).metadata();
    } catch (error) {
        throw new ImageRejectedError("INVALID_IMAGE", `not a decodable image: ${(error as Error).message}`);
    }
    const pixels = (meta.width ?? 0) * (meta.height ?? 0) * (animated ? meta.pages ?? 1 : 1);
    if (!meta.width || !meta.height) throw new ImageRejectedError("INVALID_IMAGE", "image without dimensions");
    if (pixels > MAX_IMAGE_PIXELS) throw new ImageRejectedError("IMAGE_TOO_LARGE", `image has ${pixels} pixels`);

    try {
        // Write to a temporary file first: sharp refuses to use the same file as input and output.
        let img = sharp(filepath, { limitInputPixels: MAX_IMAGE_PIXELS, animated, failOn: "error" });
        if (ext === '.gif') {
            img = img.gif();
        } else if (ext === '.webp') {
            img = img.webp({ quality: 80, effort: 4, smartSubsample: true });
        } else if (ext === '.png') {
            img = img.rotate().png({ compressionLevel: 9 });
        } else {
            img = img.rotate().jpeg({ quality: 85, mozjpeg: true });
        }
        await img.toFile(tmpPath);
        await fs.promises.rename(tmpPath, filepath);
    } catch (error) {
        await fs.promises.unlink(tmpPath).catch(() => {});
        console.error(`[sanitizeImage] Failed to process ${filepath}:`, error);
        throw new ImageRejectedError("INVALID_IMAGE", `image could not be re-encoded: ${(error as Error).message}`);
    }
}

// Ensure absolute uploads path
const UPLOADS_DEST = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DEST)) {
    fs.mkdirSync(UPLOADS_DEST, { recursive: true });
}

export const POST_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/webm"];
export const POST_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

/** A file whose MIME type is not accepted by the upload. */
export class UploadTypeError extends Error {
    constructor(public mimetype: string) {
        super(`file type not allowed: ${mimetype}`);
        this.name = "UploadTypeError";
    }
}

// Dedicated multer config for posts
export const postUpload = multer({
    storage: multer.diskStorage({
        destination: UPLOADS_DEST,
        filename: function (req, file, cb) {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

            // SEC-001 FIX: Force extension based on MIME type
            let ext = '.bin';
            if (file.mimetype === 'image/jpeg') ext = '.jpg';
            else if (file.mimetype === 'image/png') ext = '.png';
            else if (file.mimetype === 'image/gif') ext = '.gif';
            else if (file.mimetype === 'video/mp4') ext = '.mp4';
            else if (file.mimetype === 'video/webm') ext = '.webm';

            if (ext === '.bin') {
                const err = new Error("Invalid file type");
                logSecurityEvent({ type: 'FILE_UPLOAD_REJECTED', details: { reason: 'Invalid extension/MIME (Post)', originalName: file.originalname, mime: file.mimetype } });
                return cb(err, "");
            }

            cb(null, `${uniqueSuffix}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        if (POST_MEDIA_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            // Rejected with an error (→ 400 INVALID_TYPE in routes/posts.ts) instead of being dropped silently,
            // which published the post without its media (CONTENT-16).
            cb(new UploadTypeError(file.mimetype));
        }
    },
    // One file per post (CONTENT-20); text fields stay small (the post body itself is limited by its schema).
    limits: { fileSize: POST_MEDIA_MAX_BYTES, files: 1, fields: 20, fieldSize: 256 * 1024 }
});

// Dedicated multer config for theme background images
export const themeBackgroundUpload = multer({
    storage: multer.diskStorage({
        destination: UPLOADS_DEST,
        filename: function (req, file, cb) {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

            let ext = '.bin';
            if (file.mimetype === 'image/jpeg') ext = '.jpg';
            else if (file.mimetype === 'image/png') ext = '.png';
            else if (file.mimetype === 'image/gif') ext = '.gif';
            else if (file.mimetype === 'image/webp') ext = '.webp';

            if (ext === '.bin') {
                const err = new Error("Invalid file type for theme background");
                logSecurityEvent({ type: 'FILE_UPLOAD_REJECTED', details: { reason: 'Invalid type (Theme BG)', originalName: file.originalname, mime: file.mimetype } });
                return cb(err, "");
            }

            cb(null, `theme-bg-${uniqueSuffix}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max for theme backgrounds
});
export const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

// Dedicated multer config for user profile images (avatars, cover images)
export const profileUpload = multer({
    storage: multer.diskStorage({
        destination: UPLOADS_DEST,
        filename: function (req, file, cb) {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

            let ext = '.bin';
            if (file.mimetype === 'image/jpeg') ext = '.jpg';
            else if (file.mimetype === 'image/png') ext = '.png';
            else if (file.mimetype === 'image/webp') ext = '.webp';

            if (ext === '.bin') {
                const err = new Error("Invalid file type for profile image");
                logSecurityEvent({ type: 'FILE_UPLOAD_REJECTED', details: { reason: 'Invalid type (Profile)', originalName: file.originalname, mime: file.mimetype } });
                return cb(err, "");
            }

            cb(null, `profile-${uniqueSuffix}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    },
    // Phone photos are often several MB; they are shrunk by processProfileImage afterwards.
    limits: { fileSize: PROFILE_IMAGE_MAX_BYTES, files: 1 }
});

// Final size of stored profile images. Avatars are square, covers keep their aspect ratio.
const PROFILE_IMAGE_SIZE = {
    avatar: { width: 512, height: 512, fit: "cover" as const },
    cover: { width: 1800, height: 1800, fit: "inside" as const },
};

/**
 * Turns an uploaded profile image into a stripped, resized WebP file next to the original and
 * deletes the original. Returns the new file name (inside the uploads folder).
 * Throws if the file is not a readable image.
 */
export async function processProfileImage(filepath: string, type: "avatar" | "cover"): Promise<string> {
    const { width, height, fit } = PROFILE_IMAGE_SIZE[type];
    const target = filepath.replace(/\.[^./\\]+$/, "") + ".webp";
    try {
        await sharp(filepath, { limitInputPixels: MAX_IMAGE_PIXELS })
            .rotate() // apply EXIF orientation, metadata is dropped on output
            .resize({ width, height, fit, position: "attention", withoutEnlargement: true })
            .webp({ quality: 82, effort: 4, smartSubsample: true })
            .toFile(target === filepath ? `${target}.tmp` : target);
        if (target === filepath) await fs.promises.rename(`${target}.tmp`, target);
        else await fs.promises.unlink(filepath).catch(() => {});
        return path.basename(target);
    } catch (error) {
        await fs.promises.unlink(filepath).catch(() => {});
        await fs.promises.unlink(`${target}.tmp`).catch(() => {});
        if (target !== filepath) await fs.promises.unlink(target).catch(() => {});
        throw error;
    }
}
