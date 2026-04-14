import { performance } from 'node:perf_hooks';
import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';
import { db } from '../../db';
import { posts, users, activityLogs } from '@shared/schema';
import { count, desc, eq } from 'drizzle-orm';

export class DatabaseStressTest extends StressTest {
  async run(config: TestConfig, logger: Logger): Promise<TestResult> {
    const concurrency = this.getConcurrency(config.intensity);
    const testDuration = config.duration * 1000;
    const startTime = Date.now();
    
    const metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [] as number[],
      errors: new Map<string, number>()
    };

    logger.info(`Starting Database Stress Test [${config.intensity}]`);
    logger.log(`Active Drizzle workers: ${concurrency}`);

    const operations = [
      { name: 'read_feed', op: () => db.select().from(posts).orderBy(desc(posts.createdAt)).limit(20) },
      { name: 'read_user', op: () => db.select().from(users).where(eq(users.id, 1)) },
      { name: 'count_logs', op: () => db.select({ value: count() }).from(activityLogs) }
    ];

    const workers = Array(concurrency).fill(null).map(async () => {
      while (Date.now() - startTime < testDuration) {
        const operation = operations[Math.floor(Math.random() * operations.length)];
        const reqStart = performance.now();
        
        try {
          await operation.op();
          metrics.responseTimes.push(performance.now() - reqStart);
          metrics.successfulRequests++;
          metrics.totalRequests++;
        } catch (error: any) {
          metrics.failedRequests++;
          metrics.totalRequests++;
          const errType = error.code || 'DB_ERROR';
          metrics.errors.set(errType, (metrics.errors.get(errType) || 0) + 1);
        }

        await new Promise(r => setTimeout(r, 5));
      }
    });

    await Promise.all(workers);
    return this.calculateResults('database-connections', startTime, metrics);
  }

  private getConcurrency(intensity: string): number {
    switch (intensity) {
      case 'low': return 10;
      case 'medium': return 40;
      case 'high': return 100;
      case 'extreme': return 250;
      default: return 20;
    }
  }
}
