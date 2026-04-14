import axios from 'axios';
import { performance } from 'node:perf_hooks';
import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';
import FormData from 'form-data';

export class FileUploadStressTest extends StressTest {
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

    logger.info(`Starting File Upload Stress Test [${config.intensity}]`);
    logger.log(`Concurrecy: ${concurrency} | Data: 1MB per upload`);

    // Create a dummy buffer (1MB)
    const dummyBuffer = Buffer.alloc(1024 * 1024, 'osiris-stress-test');

    const workers = Array(concurrency).fill(null).map(async () => {
      while (Date.now() - startTime < testDuration) {
        const reqStart = performance.now();
        const form = new FormData();
        form.append('file', dummyBuffer, { filename: 'stress.jpg', contentType: 'image/jpeg' });

        try {
          // Note: This endpoint might require auth or a specific key in production
          // We target the generic upload endpoint if applicable, or a dummy one
          const response = await axios.post('http://localhost:5000/api/upload', form, {
            headers: form.getHeaders(),
            timeout: 10000,
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
        } catch (error: any) {
          metrics.failedRequests++;
          metrics.totalRequests++;
          const errType = error.code || 'UPLOAD_ERROR';
          metrics.errors.set(errType, (metrics.errors.get(errType) || 0) + 1);
        }

        await new Promise(r => setTimeout(r, 100)); // Pacing
      }
    });

    await Promise.all(workers);
    return this.calculateResults('file-upload', startTime, metrics);
  }

  private getConcurrency(intensity: string): number {
    switch (intensity) {
      case 'low': return 2;
      case 'medium': return 10;
      case 'high': return 30;
      case 'extreme': return 100;
      default: return 5;
    }
  }
}
