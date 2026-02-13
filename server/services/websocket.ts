import { WebSocket } from 'ws';

// WebSocket connections store
export const connections = new Map<number, WebSocket>();

export function broadcastMessage(message: string) {
    connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

export function sendToUser(userId: number, message: string) {
    const ws = connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
    }
}
