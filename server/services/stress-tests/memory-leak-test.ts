import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';

export class MemoryLeakTest extends StressTest {
  private leakedMemory: any[] = [];

  async run(config: TestConfig, logger: Logger): Promise<TestResult> {
    const intensityMap = { low: 10, medium: 50, high: 200, extreme: 500 };
    const mbPerStep = intensityMap[config.intensity] || 50;
    const testDuration = config.duration * 1000;
    const startTime = Date.now();
    
    const metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [] as number[],
      errors: new Map<string, number>()
    };

    logger.info(`Starting Memory Stress Test [${config.intensity}]`);
    logger.log(`Allocation: ${mbPerStep}MB per step | Tracking RSS/Heap`);

    const interval = setInterval(() => {
      try {
        const mem = process.memoryUsage();
        logger.log(`Memory Usage: RSS=${Math.round(mem.rss / 1024 / 1024)}MB | Heap=${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
        
        // Simulate a "leak" by holding references
        const chunk = Buffer.alloc(mbPerStep * 1024 * 1024, 'leak');
        this.leakedMemory.push(chunk);
        
        metrics.successfulRequests++;
        metrics.totalRequests++;
      } catch (error: any) {
        metrics.failedRequests++;
        metrics.totalRequests++;
        metrics.errors.set('OOM_OR_LIMIT', 1);
        logger.error(`Memory Allocation Failed: ${error.message}`);
      }
    }, 2000);

    await new Promise(resolve => setTimeout(resolve, testDuration));
    
    clearInterval(interval);
    
    logger.info("Cleaning up leaked references...");
    this.leakedMemory = [];
    if (global.gc) {
      logger.log("Forcing Garbage Collection..."); // Needs --expose-gc
      global.gc();
    }

    return this.calculateResults('memory-leak', startTime, metrics);
  }
}
