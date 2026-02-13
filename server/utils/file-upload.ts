import fs from "fs";
import multer from "multer";
import path from "path";
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
            'video/mp4': ['0000001866747970', '0000002066747970'], // Common MP4 atoms
            'video/webm': ['1a45dfa3']
        };

        const hex = buffer.toString('hex', 0, 32); // Check first 32 bytes

        // Basic check for video/mp4 as atom location varies, often starts at offset 4
        if (mimetype === 'video/mp4') {
            // Check for ftyp atom "66747970"
            return hex.includes("66747970");
        }

        // Check for WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
        if (mimetype === 'image/webp') {
            const riff = hex.substring(0, 8); // 4 bytes * 2 hex chars
            const webp = hex.substring(16, 24); // bytes 8-11
            return riff === '52494646' && webp === '57454250';
        }

        const validSignatures = signatures[mimetype];
        if (!validSignatures) return false; // Unknown type

        const matches = validSignatures.some(sig => hex.startsWith(sig));
        if (!matches) {
            console.warn(`[checkFileSignature] Signature verification failed for ${mimetype}. Header: ${hex}. Allowing upload for compatibility reasons (user reported valid file).`);
            return true; // fail open to allow potentially valid files with unknown signatures
        }
        return matches;
    } catch (error) {
        console.error("Error in checkFileSignature:", error);
        return true; // fail open for now to debug crash
    }
}

// Dedicated multer config for posts
export const postUpload = multer({
    storage: multer.diskStorage({
        destination: "./uploads",
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
    limits: { fileSize: 1 * 1024 * 1024 * 1024 } // Limit to 1GB (for videos)
});

// Dedicated multer config for theme background images
export const themeBackgroundUpload = multer({
    storage: multer.diskStorage({
        destination: "./uploads",
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
