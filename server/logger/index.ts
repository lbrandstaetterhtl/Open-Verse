// server/logger/index.ts
// DER zentrale Logger – alles läuft durch hier

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ────────────────────────────────────────────────────────
// TYPEN
// ────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'critical';

export type LogCategory =
  | 'auth'        // Login, Logout, Register
  | 'db'          // Datenbankoperationen
  | 'http'        // HTTP Requests
  | 'security'    // Bans, Anomalien, Verdächtiges
  | 'business'    // Posts, Likes, Follows, Content
  | 'system'      // Server-Start, -Stop, Migrations
  | 'performance' // Slow Queries, hohe Response Times
  | 'error'       // Unerwartete Fehler
  | 'dev';        // Nur Development

export interface LogEntry {
  level:      LogLevel;
  category:   LogCategory;
  message:    string;
  // Optionale strukturierte Daten
  userId?:    number | null;
  username?:  string | null;
  requestId?: string;
  ip?:        string;
  method?:    string;
  path?:      string;
  statusCode?: number;
  duration?:  number;        // in Millisekunden
  error?:     Error | unknown;
  data?:      Record<string, unknown>;
  // Stack Trace nur in Development oder bei Critical
  stack?:     string;
}

// ────────────────────────────────────────────────────────
// LOG LEVEL NUMMERN (für Vergleiche)
// ────────────────────────────────────────────────────────

const LOG_LEVEL_NUM: Record<LogLevel, number> = {
  trace:    0,
  debug:    1,
  info:     2,
  warn:     3,
  error:    4,
  critical: 5,
};

// ────────────────────────────────────────────────────────
// FARBEN FÜR DEVELOPMENT (Terminal-Output)
// ────────────────────────────────────────────────────────

const COLORS = {
  reset:    '\x1b[0m',
  bright:   '\x1b[1m',
  dim:      '\x1b[2m',
  // Level-Farben
  trace:    '\x1b[90m',   // Grau
  debug:    '\x1b[36m',   // Cyan
  info:     '\x1b[32m',   // Grün
  warn:     '\x1b[33m',   // Gelb
  error:    '\x1b[31m',   // Rot
  critical: '\x1b[35m',   // Magenta
  // Kategorie-Farben
  auth:        '\x1b[34m',  // Blau
  db:          '\x1b[36m',  // Cyan
  http:        '\x1b[90m',  // Grau
  security:    '\x1b[31m',  // Rot
  business:    '\x1b[32m',  // Grün
  system:      '\x1b[35m',  // Magenta
  performance: '\x1b[33m',  // Gelb
  error:       '\x1b[31m',  // Rot
  dev:         '\x1b[90m',  // Grau
} as const;

// ────────────────────────────────────────────────────────
// FILE WRITER
// ────────────────────────────────────────────────────────

class LogFileWriter {
  private streams: Map<string, fs.WriteStream> = new Map();
  private readonly logDir: string;
  private readonly maxFileSizeMB: number;
  private fileSizes: Map<string, number> = new Map();

  constructor(logDir: string, maxFileSizeMB = 50) {
    this.logDir = logDir;
    this.maxFileSizeMB = maxFileSizeMB;
    this.ensureLogDir();
  }

  private ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getStream(filename: string): fs.WriteStream {
    if (!this.streams.has(filename)) {
      const filepath = path.join(this.logDir, filename);
      const stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf8' });

      stream.on('error', (err) => {
        // Fehler beim Schreiben: Fallback zu console.error
        console.error(`[Logger] Failed to write to ${filename}:`, err.message);
      });

      this.streams.set(filename, stream);

      // Initiale Dateigröße ermitteln
      try {
        const stat = fs.statSync(filepath);
        this.fileSizes.set(filename, stat.size);
      } catch {
        this.fileSizes.set(filename, 0);
      }
    }
    return this.streams.get(filename)!;
  }

  write(filename: string, line: string) {
    const stream = this.getStream(filename);
    const bytes = Buffer.byteLength(line + '\n', 'utf8');

    // Log-Rotation wenn Datei zu groß
    const currentSize = this.fileSizes.get(filename) ?? 0;
    if (currentSize + bytes > this.maxFileSizeMB * 1024 * 1024) {
      this.rotate(filename);
    }

    stream.write(line + '\n');
    this.fileSizes.set(filename, (this.fileSizes.get(filename) ?? 0) + bytes);
  }

  private rotate(filename: string) {
    const stream = this.streams.get(filename);
    if (stream) {
      stream.end();
      this.streams.delete(filename);
    }

    const filepath = path.join(this.logDir, filename);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = filepath.replace('.log', `-${timestamp}.log`);

    try {
      if (fs.existsSync(filepath)) {
        fs.renameSync(filepath, rotatedPath);
      }
    } catch (err) {
      console.error(`[Logger] Rotation failed for ${filename}:`, err);
    }

    this.fileSizes.set(filename, 0);

    // Alte Rotationen löschen (behalte nur die letzten 5)
    this.cleanOldRotations(filename);
  }

  private cleanOldRotations(baseFilename: string) {
    const base = baseFilename.replace('.log', '');
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith(base) && f !== baseFilename)
        .sort()
        .reverse();

      // Behalte nur 5 alte Dateien
      files.slice(5).forEach(f => {
        try {
          fs.unlinkSync(path.join(this.logDir, f));
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  }

  close() {
    for (const stream of this.streams.values()) {
      stream.end();
    }
    this.streams.clear();
  }
}

// ────────────────────────────────────────────────────────
// HAUPT-LOGGER KLASSE
// ────────────────────────────────────────────────────────

class Logger {
  private readonly isDev: boolean;
  private readonly minLevel: LogLevel;
  private readonly fileWriter: LogFileWriter;
  private readonly logDir: string;

  constructor() {
    this.isDev   = process.env.NODE_ENV !== 'production';
    this.logDir  = path.join(process.cwd(), 'logs');
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) ?? (this.isDev ? 'debug' : 'info');

    this.fileWriter = new LogFileWriter(
      this.logDir,
      Number(process.env.LOG_MAX_SIZE_MB) || 50
    );

    // Startup-Banner
    this.writeStartupBanner();
  }

  private writeStartupBanner() {
    const banner = `
${'═'.repeat(60)}
  Open-Verse / Osiris – Logger gestartet
  Umgebung: ${this.isDev ? 'DEVELOPMENT' : 'PRODUCTION'}
  Log-Level: ${this.minLevel.toUpperCase()}
  Log-Verzeichnis: ${this.logDir}
  Zeitstempel: ${new Date().toISOString()}
${'═'.repeat(60)}
`;
    // Nur in Development als Banner, in Production als JSON
    if (this.isDev) {
      process.stdout.write(COLORS.dim + banner + COLORS.reset + '\n');
    }
    this.fileWriter.write('combined.log', banner);
    this.fileWriter.write('system.log', banner);
  }

  // ── Haupt-Log-Methode ────────────────────────────────
  log(entry: LogEntry): void {
    // Level-Filter
    if (LOG_LEVEL_NUM[entry.level] < LOG_LEVEL_NUM[this.minLevel]) return;

    // Trace nur in Development
    if (entry.level === 'trace' && !this.isDev) return;

    // Dev-Logs nur in Development
    if (entry.category === 'dev' && !this.isDev) return;

    const timestamp = new Date().toISOString();
    const jsonLine  = this.formatJson(entry, timestamp);
    const textLine  = this.isDev ? this.formatText(entry, timestamp) : null;

    // ── Terminal Output (Development) ────────────────
    if (textLine) {
      process.stdout.write(textLine + '\n');
    }

    // ── File Output ──────────────────────────────────
    // combined.log: ALLES
    this.fileWriter.write('combined.log', jsonLine);

    // error.log: nur ERROR und CRITICAL
    if (entry.level === 'error' || entry.level === 'critical') {
      this.fileWriter.write('error.log', jsonLine);
    }

    // Kategorie-spezifische Dateien
    switch (entry.category) {
      case 'auth':
        this.fileWriter.write('auth.log', jsonLine);
        break;
      case 'db':
      case 'performance':
        this.fileWriter.write('db.log', jsonLine);
        break;
      case 'http':
        this.fileWriter.write('access.log', jsonLine);
        break;
      case 'security':
        this.fileWriter.write('security.log', jsonLine);
        break;
      case 'business':
        this.fileWriter.write('business.log', jsonLine);
        break;
      case 'system':
      case 'error':
        this.fileWriter.write('system.log', jsonLine);
        break;
      case 'dev':
        this.fileWriter.write('dev.log', jsonLine);
        break;
    }
  }

  // ── JSON Format (Production / File) ─────────────────
  private formatJson(entry: LogEntry, timestamp: string): string {
    const obj: Record<string, unknown> = {
      timestamp,
      level:    entry.level.toUpperCase(),
      category: entry.category,
      message:  entry.message,
    };

    // Optionale Felder nur wenn vorhanden
    if (entry.userId    != null) obj.userId    = entry.userId;
    if (entry.username  != null) obj.username  = entry.username;
    if (entry.requestId != null) obj.requestId = entry.requestId;
    if (entry.ip        != null) obj.ip        = entry.ip;
    if (entry.method    != null) obj.method    = entry.method;
    if (entry.path      != null) obj.path      = entry.path;
    if (entry.statusCode != null) obj.statusCode = entry.statusCode;
    if (entry.duration  != null) obj.duration  = entry.duration;
    if (entry.data      != null) obj.data      = entry.data;

    // Error Details
    if (entry.error) {
      if (entry.error instanceof Error) {
        obj.error = {
          name:    entry.error.name,
          message: entry.error.message,
          // Stack nur in Development oder bei Critical
          ...(this.isDev || entry.level === 'critical'
            ? { stack: entry.error.stack }
            : {}),
        };
      } else {
        obj.error = String(entry.error);
      }
    }

    return JSON.stringify(obj);
  }

  // ── Text Format (Development Terminal) ──────────────
  private formatText(entry: LogEntry, timestamp: string): string {
    const time    = timestamp.replace('T', ' ').replace('Z', '').slice(0, 23);
    const level   = entry.level.toUpperCase().padEnd(8);
    const cat     = `[${entry.category}]`.padEnd(14);

    const levelColor = COLORS[entry.level] ?? COLORS.reset;
    const catColor   = COLORS[entry.category] ?? COLORS.dim;

    let line = [
      COLORS.dim + time + COLORS.reset,
      levelColor + COLORS.bright + level + COLORS.reset,
      catColor + cat + COLORS.reset,
      entry.message,
    ].join(' ');

    // Kontextinfos anhängen
    const ctx: string[] = [];
    if (entry.userId)     ctx.push(`user=${entry.userId}`);
    if (entry.ip)         ctx.push(`ip=${entry.ip}`);
    if (entry.method && entry.path) ctx.push(`${entry.method} ${entry.path}`);
    if (entry.statusCode) ctx.push(`status=${entry.statusCode}`);
    if (entry.duration != null) {
      const durationColor = entry.duration > 1000 ? COLORS.error
        : entry.duration > 200 ? COLORS.warn
        : COLORS.dim;
      ctx.push(durationColor + `${entry.duration}ms` + COLORS.reset);
    }

    if (ctx.length > 0) {
      line += COLORS.dim + '  ' + ctx.join(' ') + COLORS.reset;
    }

    // Error anhängen
    if (entry.error instanceof Error) {
      line += '\n' + COLORS.error + '  Error: ' + entry.error.message + COLORS.reset;
      if (this.isDev && entry.error.stack) {
        const stackLines = entry.error.stack.split('\n').slice(1, 4);
        line += '\n' + COLORS.dim + stackLines.map(l => '    ' + l.trim()).join('\n') + COLORS.reset;
      }
    }

    // Extra Data in Development
    if (entry.data && this.isDev && entry.level !== 'trace') {
      const dataStr = JSON.stringify(entry.data, null, 2);
      const indented = dataStr.split('\n').map(l => '  ' + l).join('\n');
      line += '\n' + COLORS.dim + indented + COLORS.reset;
    }

    return line;
  }

  // ── Convenience-Methoden ─────────────────────────────

  trace(message: string, data?: Record<string, unknown>) {
    this.log({ level: 'trace', category: 'dev', message, data });
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log({ level: 'debug', category: 'dev', message, data });
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log({ level: 'info', category, message, data });
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>) {
    this.log({ level: 'warn', category, message, data });
  }

  error(category: LogCategory, message: string, error?: unknown, data?: Record<string, unknown>) {
    this.log({ level: 'error', category, message, error, data });
  }

  critical(category: LogCategory, message: string, error?: unknown, data?: Record<string, unknown>) {
    this.log({ level: 'critical', category, message, error, data });
  }

  // ── HTTP Request Logger ──────────────────────────────
  http(data: {
    method:     string;
    path:       string;
    statusCode: number;
    duration:   number;
    userId?:    number | null;
    ip?:        string;
    requestId?: string;
    userAgent?: string;
  }) {
    const level: LogLevel =
      data.statusCode >= 500 ? 'error'
      : data.statusCode >= 400 ? 'warn'
      : data.duration > 2000 ? 'warn'
      : 'info';

    this.log({
      level,
      category:   'http',
      message:    `${data.method} ${data.path} ${data.statusCode} ${data.duration}ms`,
      method:     data.method,
      path:       data.path,
      statusCode: data.statusCode,
      duration:   data.duration,
      userId:     data.userId,
      ip:         data.ip,
      requestId:  data.requestId,
      data:       data.userAgent ? { userAgent: data.userAgent } : undefined,
    });
  }

  // ── DB Query Logger ──────────────────────────────────
  dbQuery(data: {
    query:    string;
    duration: number;
    rows?:    number;
    error?:   unknown;
  }) {
    if (data.error) {
      this.log({
        level:    'error',
        category: 'db',
        message:  `Query failed: ${data.query.slice(0, 100)}`,
        duration: data.duration,
        error:    data.error,
      });
      return;
    }

    if (data.duration > 1000) {
      this.log({
        level:    'warn',
        category: 'performance',
        message:  `Slow query detected: ${data.duration}ms`,
        duration: data.duration,
        data:     {
          query: data.query.slice(0, 200),
          rows:  data.rows,
        },
      });
    } else if (this.isDev && data.duration > 100) {
      // In Dev: auch mittellangsame Queries loggen
      this.log({
        level:    'debug',
        category: 'db',
        message:  `Query: ${data.duration}ms`,
        duration: data.duration,
        data:     { query: data.query.slice(0, 100) },
      });
    }
  }

  // ── Auth Event Logger ────────────────────────────────
  authEvent(data: {
    event:    'login' | 'logout' | 'register' | 'login_failed' | 'password_change' | 'locked';
    userId?:  number | null;
    email?:   string;
    username?: string;
    ip?:      string;
    reason?:  string;
  }) {
    const isFailure = data.event === 'login_failed' || data.event === 'locked';
    const level: LogLevel = data.event === 'locked' ? 'warn'
      : isFailure ? 'warn'
      : 'info';

    this.log({
      level,
      category: 'auth',
      message:  `Auth event: ${data.event}${data.username ? ` (${data.username})` : ''}`,
      userId:   data.userId,
      username: data.username,
      ip:       data.ip,
      data: {
        event:  data.event,
        email:  data.email ? data.email.replace(/(?<=.{3}).(?=.*@)/g, '*') : undefined, // Email maskieren
        reason: data.reason,
      },
    });
  }

  // ── Security Event Logger ────────────────────────────
  securityEvent(data: {
    type:     string;
    userId?:  number | null;
    ip?:      string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details:  Record<string, unknown>;
  }) {
    const level: LogLevel = data.severity === 'critical' ? 'critical'
      : data.severity === 'high' ? 'error'
      : data.severity === 'medium' ? 'warn'
      : 'info';

    this.log({
      level,
      category: 'security',
      message:  `Security event: ${data.type}`,
      userId:   data.userId,
      ip:       data.ip,
      data:     { type: data.type, severity: data.severity, ...data.details },
    });
  }

  // ── Business Event Logger ────────────────────────────
  businessEvent(data: {
    action:   string;
    userId?:  number | null;
    targetId?: number | string;
    details?: Record<string, unknown>;
  }) {
    this.log({
      level:    'info',
      category: 'business',
      message:  `Business: ${data.action}`,
      userId:   data.userId,
      data:     {
        action:   data.action,
        targetId: data.targetId,
        ...data.details,
      },
    });
  }

  // ── Unhandled Error Logger ───────────────────────────
  unhandledError(error: unknown, context: string) {
    this.log({
      level:    'critical',
      category: 'error',
      message:  `Unhandled error in ${context}`,
      error,
      data:     { context },
    });
  }

  // ── Graceful Shutdown ────────────────────────────────
  shutdown() {
    this.info('system', 'Logger shutting down');
    this.fileWriter.close();
  }
}

// ── Singleton Export ─────────────────────────────────────
export const logger = new Logger();

// ── Request-ID Generator ─────────────────────────────────
export function generateRequestId(): string {
  return crypto.randomBytes(8).toString('hex');
}
