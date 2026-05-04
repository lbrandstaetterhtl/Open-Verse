// server/logger/dev-tools.ts
// NUR in Development verfügbar

import { logger } from './index';

const isDev = process.env.NODE_ENV !== 'production';

// Performance-Messung für Entwickler
export function measure<T>(name: string, fn: () => T): T {
  if (!isDev) return fn();

  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    logger.debug(`⏱  ${name}: ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    logger.debug(`⏱  ${name}: FAILED after ${duration.toFixed(2)}ms`);
    throw error;
  }
}

// Async Performance-Messung
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!isDev) return fn();

  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    logger.debug(`⏱  ${name}: ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    logger.debug(`⏱  ${name}: FAILED after ${duration.toFixed(2)}ms`);
    throw error;
  }
}

// Checkpoint für Step-by-Step Debugging
export function checkpoint(name: string, data?: Record<string, unknown>) {
  if (!isDev) return;
  logger.log({
    level:    'trace',
    category: 'dev',
    message:  `📍 Checkpoint: ${name}`,
    data,
  });
}

// Variablen-Dump in Development
export function dump(label: string, value: unknown) {
  if (!isDev) return;
  logger.log({
    level:    'trace',
    category: 'dev',
    message:  `🔍 ${label}:`,
    data:     { value },
  });
}

// Request-Tracing für komplexe Flows
export class RequestTracer {
  private steps: Array<{ name: string; duration: number; timestamp: number }> = [];
  private start: number;
  private lastStep: number;

  constructor(private readonly name: string) {
    this.start    = performance.now();
    this.lastStep = this.start;
  }

  step(stepName: string) {
    if (!isDev) return;
    const now      = performance.now();
    const duration = now - this.lastStep;
    this.steps.push({ name: stepName, duration, timestamp: now });
    this.lastStep = now;
    logger.trace(`  ${this.name} → ${stepName} (${duration.toFixed(1)}ms)`);
  }

  end() {
    if (!isDev) return;
    const total = performance.now() - this.start;
    logger.debug(`Trace "${this.name}" completed`, {
      totalMs: total.toFixed(2),
      steps:   this.steps.map(s => `${s.name}=${s.duration.toFixed(1)}ms`),
    });
  }
}
