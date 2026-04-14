import { performance } from 'node:perf_hooks';
import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';

export class CpuStressTest extends StressTest {
  async run(config: TestConfig, logger: Logger): Promise<TestResult> {
    const intensityMap = { low: 1000, medium: 10000, high: 50000, extreme: 200000 };
    const iterations = intensityMap[config.intensity] || 10000;
    const testDuration = config.duration * 1000;
    const startTime = Date.now();
    
    const metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [] as number[],
      errors: new Map<string, number>()
    };

    logger.info(`Starting CPU Stress Test [${config.intensity}]`);
    logger.log(`Performing blocking computations (${iterations} iterations per block)`);

    // Track event loop lag
    let lastTime = performance.now();
    const lagMonitor = setInterval(() => {
      const now = performance.now();
      const lag = now - lastTime - 1000; // 1000ms is the interval
      if (lag > 50) {
        logger.warn(`Event Loop Lag Detected: ${lag.toFixed(2)}ms`);
      }
      lastTime = now;
    }, 1000);

    while (Date.now() - startTime < testDuration) {
      const blockStart = performance.now();
      
      // Intensive blocking computation: Recursive Fibonacci or heavy hashing
      this.blockingTask(iterations);
      
      const elapsed = performance.now() - blockStart;
      metrics.responseTimes.push(elapsed);
      metrics.successfulRequests++;
      metrics.totalRequests++;

      if (metrics.totalRequests % 10 === 0) {
        logger.info(`CPU Load Block ${metrics.totalRequests} completed in ${elapsed.toFixed(1)}ms`);
      }

      // Briefly yield to let SSE logs through
      await new Promise(r => setTimeout(r, 10));
    }

    clearInterval(lagMonitor);
    return this.calculateResults('cpu-intensive', startTime, metrics);
  }

  private blockingTask(iters: number): number {
    let result = 0;
    for (let i = 0; i < iters; i++) {
      result += Math.sqrt(Math.random() * i) * Math.atan(i);
    }
    return result;
  }
}
