
export type SecurityEventType =
    | 'AUTH_FAILURE'
    | 'AUTH_SUCCESS'
    | 'AUTH_BANNED_ATTEMPT'
    | 'CSRF_FAILURE'
    | 'FILE_UPLOAD_REJECTED'
    | 'ADMIN_ACCESS'
    | 'SENSITIVE_ACTION'
    | 'RATE_LIMIT_EXCEEDED';

export interface SecurityEvent {
    type: SecurityEventType;
    userId?: number;
    ip?: string;
    resource?: string;
    details?: Record<string, any>;
    timestamp?: string;
}

export function logSecurityEvent(event: SecurityEvent) {
    const logEntry = {
        level: 'SECURITY',
        timestamp: event.timestamp || new Date().toISOString(),
        ...event
    };

    // In a real production app, this would go to a secure log aggregator (Splunk, Datadog, etc.)
    // For now, we log to stdout but with a specific prefix for easy filtering.
    console.log(`[SECURITY] ${JSON.stringify(logEntry)}`);
}
