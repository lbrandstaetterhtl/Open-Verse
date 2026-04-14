import axios from 'axios';
import { performance } from 'node:perf_hooks';
import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';

export class ApiEndpointStressTest extends StressTest {
  async run(config: TestConfig, logger: Logger): Promise<TestResult> {
    const endpoints = [
      { method: 'GET' as const, path: '/api/posts', weight: 40 },
      { method: 'GET' as const, path: '/api/communities', weight: 20 },
      { method: 'GET' as const, path: '/api/public/settings', weight: 30 },
      { method: 'GET' as const, path: '/api/feed/communities', weight: 10 }
    ];

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

    logger.info(`Starting API Load Test [${config.intensity}]`);
    logger.log(`Concurrency: ${concurrency} | Target: http://localhost:5000`);

    const workers = Array(concurrency).fill(null).map(async () => {
      while (Date.now() - startTime < testDuration) {
        this.checkCancellation(logger);
        const endpoint = this.selectWeightedEndpoint(endpoints);
        const reqStart = performance.now();
        
        try {
          const response = await axios({
            method: endpoint.method,
            url: `http://localhost:5000${endpoint.path}`,
            timeout: 5000,
            validateStatus: () => true
          });

          metrics.responseTimes.push(performance.now() - reqStart);
          metrics.totalRequests++;

          if (response.status < 400) {
            metrics.successfulRequests++;
          } else {
            metrics.failedRequests++;
            const errKey = `HTTP_${response.status}`;
            metrics.errors.set(errKey, (metrics.errors.get(errKey) || 0) + 1);
          }
          
          if (metrics.totalRequests % 500 === 0) {
            const rps = metrics.totalRequests / ((Date.now() - startTime) / 1000);
            logger.log(`Progress: ${metrics.totalRequests} reqs | ${rps.toFixed(1)} req/s`);
          }
        } catch (error: any) {
          metrics.failedRequests++;
          metrics.totalRequests++;
          const errType = error.code || 'UNKNOWN';
          metrics.errors.set(errType, (metrics.errors.get(errType) || 0) + 1);
        }

        // Adaptive pacing
        await new Promise(r => setTimeout(r, Math.random() * 50));
      }
    });

    await Promise.all(workers);
    return this.calculateResults('api-endpoints', startTime, metrics);
  }

  private getConcurrency(intensity: string): number {
    switch (intensity) {
      case 'low': return 5;
      case 'medium': return 25;
      case 'high': return 75;
      case 'extreme': return 200;
      default: return 10;
    }
  }
}
