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

// SEC-003: Image Sanitization (Strip EXIF, etc.)
export async function sanitizeImage(filepath: string): Promise<void> {
    const ext = path.extname(filepath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        return; // Skip for non-image files or gifs
    }

    try {
        const tempPath = `${filepath}.tmp`;
        await sharp(filepath)
            .rotate() // Auto-rotate based on EXIF before stripping
            .toFile(tempPath);
        
        // Overwrite original with sanctioned version
        if (fs.existsSync(tempPath)) {
            await fs.promises.rename(tempPath, filepath);
        }
    } catch (error) {
        console.error(`[sanitizeImage] Failed to sanitize ${filepath}. Keeping original as fallback:`, error);
        // We don't throw here to prevent deleting the file if sharp just has a minor issue
    }
}

// Ensure absolute uploads path
const UPLOADS_DEST = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DEST)) {
    fs.mkdirSync(UPLOADS_DEST, { recursive: true });
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
        const allowedTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/webm"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // Limit to 50MB
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
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB max for profile images
});
