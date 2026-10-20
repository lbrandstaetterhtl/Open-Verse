import { WebSocket } from 'ws';

/**
 * The open sockets of one user (one per browser tab), each remembered with the session it was opened with.
 * It answers `readyState` and `send` like a single socket, so callers that look up a user and send to "the"
 * socket reach every tab.
 */
export class UserSockets {
    private readonly sockets = new Map<WebSocket, string | undefined>();

    add(ws: WebSocket, sessionId?: string) {
        this.sockets.set(ws, sessionId);
    }

    delete(ws: WebSocket) {
        this.sockets.delete(ws);
    }

    get size() {
        return this.sockets.size;
    }

    /** OPEN when at least one of the user's sockets is open. */
    get readyState(): number {
        let state: number = WebSocket.CLOSED;
        this.sockets.forEach((_sid, ws) => {
            if (ws.readyState === WebSocket.OPEN) state = WebSocket.OPEN;
        });
        return state;
    }

    send(message: string) {
        this.sockets.forEach((_sid, ws) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(message);
        });
    }

    /** Closes the sockets opened with `sessionId` (all sockets when it is omitted), except `exceptSessionId`'s. */
    close(code: number, reason: string, filter: { sessionId?: string; exceptSessionId?: string } = {}) {
        for (const [ws, sid] of Array.from(this.sockets.entries())) {
            if (filter.sessionId !== undefined && sid !== filter.sessionId) continue;
            if (filter.exceptSessionId !== undefined && sid === filter.exceptSessionId) continue;
            try {
                ws.close(code, reason);
            } catch {
                ws.terminate();
            }
            this.sockets.delete(ws);
        }
    }
}

// WebSocket connections store: user id -> that user's sockets
export const connections = new Map<number, UserSockets>();

export function addConnection(userId: number, ws: WebSocket, sessionId?: string) {
    let entry = connections.get(userId);
    if (!entry) {
        entry = new UserSockets();
        connections.set(userId, entry);
    }
    entry.add(ws, sessionId);
}

/** Removes only this socket; the user's other tabs stay registered. */
export function removeConnection(userId: number, ws: WebSocket) {
    const entry = connections.get(userId);
    if (!entry) return;
    entry.delete(ws);
    if (entry.size === 0) connections.delete(userId);
}

/** Logout: the sockets opened with this session stop receiving the user's events. */
export function closeSessionSockets(userId: number | undefined, sessionId: string) {
    const entries = userId !== undefined ? [connections.get(userId)] : Array.from(connections.values());
    for (const entry of entries) entry?.close(4001, "Logged out", { sessionId });
    if (userId !== undefined && connections.get(userId)?.size === 0) connections.delete(userId);
}

/** Password change, ban, deletion: close the user's sockets (optionally keeping one session's). */
export function closeUserSockets(userId: number, reason = "Session ended", exceptSessionId?: string) {
    const entry = connections.get(userId);
    if (!entry) return;
    entry.close(4001, reason, exceptSessionId !== undefined ? { exceptSessionId } : {});
    if (entry.size === 0) connections.delete(userId);
}

export function broadcastMessage(message: string) {
    connections.forEach((entry) => entry.send(message));
}

export function sendToUser(userId: number, message: string) {
    connections.get(userId)?.send(message);
}
