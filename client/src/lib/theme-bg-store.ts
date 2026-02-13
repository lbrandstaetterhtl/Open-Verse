/**
 * IndexedDB storage for theme background images (guest users).
 * Avoids localStorage size limits by storing blobs in IndexedDB.
 */

const DB_NAME = "osiris-theme-backgrounds";
const DB_VERSION = 1;
const STORE_NAME = "backgrounds";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error("IndexedDB not supported"));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Save a background image blob under a generated key */
export async function saveBgBlob(key: string, blob: Blob): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Retrieve a background image as an object URL. Caller must revoke when done. */
export async function getBgBlobUrl(key: string): Promise<string | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => {
            const blob = request.result as Blob | undefined;
            if (blob) {
                resolve(URL.createObjectURL(blob));
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/** Delete a specific background blob */
export async function deleteBgBlob(key: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Remove all blobs whose keys are NOT in the usedKeys set */
export async function cleanupUnreferencedBlobs(usedKeys: string[]): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const cursorReq = store.openCursor();
        const keySet = new Set(usedKeys);

        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
                if (!keySet.has(cursor.key as string)) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Generate a unique key for a new background blob */
export function generateBgKey(): string {
    return `theme-bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
