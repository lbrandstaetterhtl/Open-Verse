export type SecurityEventType =
  | "AUTH_FAILURE"
  | "AUTH_SUCCESS"
  | "AUTH_BANNED_ATTEMPT"
  | "CSRF_FAILURE"
  | "FILE_UPLOAD_REJECTED"
  | "ADMIN_ACCESS"
  | "SENSITIVE_ACTION"
  | "RATE_LIMIT_EXCEEDED";

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
    level: "SECURITY",
    timestamp: event.timestamp || new Date().toISOString(),
    ...event,
  };

  // In a real production app, this would go to a secure log aggregator (Splunk, Datadog, etc.)
  // For now, we log to stdout but with a specific prefix for easy filtering.
  console.log(`[SECURITY] ${JSON.stringify(logEntry)}`);
}

/**
 * SSE-capable Logger class for streaming progress to web clients
 */
export class Logger {
  public isCancelled = false;

  constructor(private onLog: (message: string) => void) {}

  log(message: string) {
    if (this.isCancelled) {
      throw new Error("STRESS_TEST_CANCELLED");
    }
    const timestampedMessage = `[${new Date().toISOString()}] ${message}`;
    console.log(timestampedMessage);
    this.onLog(message);
  }

  error(message: string, error?: any) {
    const errorMessage = `❌ ERROR: ${message}${error ? ` - ${error.message || error}` : ''}`;
    this.log(errorMessage);
  }

  warn(message: string) {
    this.log(`⚠️  WARNING: ${message}`);
  }

  info(message: string) {
    this.log(`ℹ️  INFO: ${message}`);
  }
}
