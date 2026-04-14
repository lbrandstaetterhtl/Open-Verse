import * as os from 'node:os';
import type { TestConfig, TestResult, WeightedEndpoint } from '../../types/stress';
import type { Logger } from '../../utils/logger';

export abstract class StressTest {
  abstract run(config: TestConfig, logger: Logger): Promise<TestResult>;

  protected checkCancellation(logger: Logger) {
    if (logger.isCancelled) {
      throw new Error("STRESS_TEST_CANCELLED");
    }
  }

  protected getSystemMetrics() {
    return {
      cpuUsage: os.loadavg()[0], // 1 minute load average
      memoryUsage: process.memoryUsage().rss / 1024 / 1024, // MB
      activeConnections: 0 // Will be updated by modules if applicable
    };
  }

  protected calculateResults(
    testName: string,
    startTime: number,
    metrics: {
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      responseTimes: number[];
      errors: Map<string, number>;
    }
  ): TestResult {
    const duration = (Date.now() - startTime) / 1000;
    const sortedTimes = [...metrics.responseTimes].toSorted((a, b) => a - b);
    
    return {
      testName,
      startTime: new Date(startTime),
      endTime: new Date(),
      metrics: {
        totalRequests: metrics.totalRequests,
        successfulRequests: metrics.successfulRequests,
        failedRequests: metrics.failedRequests,
        avgResponseTime: metrics.responseTimes.length > 0 
          ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length 
          : 0,
        maxResponseTime: sortedTimes.length > 0 ? sortedTimes.at(-1) : 0,
        minResponseTime: sortedTimes.length > 0 ? sortedTimes[0] : 0,
        requestsPerSecond: duration > 0 ? metrics.totalRequests / duration : 0,
        errors: Array.from(metrics.errors.entries()).map(([type, count]) => ({ type, count })),
        systemMetrics: this.getSystemMetrics()
      }
    };
  }

  protected selectWeightedEndpoint(endpoints: WeightedEndpoint[]): WeightedEndpoint {
    const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const endpoint of endpoints) {
      if (random < endpoint.weight) return endpoint;
      random -= endpoint.weight;
    }
    
    return endpoints[0];
  }
}
