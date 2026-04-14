import axios from 'axios';
import { performance } from 'node:perf_hooks';
import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';

export class AuthenticationStressTest extends StressTest {
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

    logger.info(`Starting Authentication Stress Test [${config.intensity}]`);
    logger.log(`Concurrency: ${concurrency} | Method: Register + Login Cycle`);

    const workers = Array(concurrency).fill(null).map(async (_, idx) => {
      while (Date.now() - startTime < testDuration) {
        const username = `stress_user_${Date.now()}_${idx}_${Math.random().toString(36).slice(7)}`;
        const email = `${username}@osiris.test`;
        const password = 'StressTestPassword123!';
        
        const reqStart = performance.now();
        try {
          // 1. Register
          const regResponse = await axios.post('http://localhost:5000/api/register', {
            username, email, password, confirmPassword: password
          }, { timeout: 10000, validateStatus: () => true });

          // 2. Login (if registration succeeded)
          if (regResponse.status < 400) {
            await axios.post('http://localhost:5000/api/login', {
              username, password
            }, { timeout: 5000, validateStatus: () => true });
            
            metrics.successfulRequests++;
          } else {
            metrics.failedRequests++;
            metrics.errors.set(`REG_${regResponse.status}`, (metrics.errors.get(`REG_${regResponse.status}`) || 0) + 1);
          }
          
          metrics.responseTimes.push(performance.now() - reqStart);
          metrics.totalRequests++;
          
        } catch (error: any) {
          metrics.failedRequests++;
          metrics.totalRequests++;
          const errType = error.code || 'AUTH_CONN_ERROR';
          metrics.errors.set(errType, (metrics.errors.get(errType) || 0) + 1);
        }

        await new Promise(r => setTimeout(r, 100));
      }
    });

    await Promise.all(workers);
    return this.calculateResults('authentication', startTime, metrics);
  }

  private getConcurrency(intensity: string): number {
    switch (intensity) {
      case 'low': return 2;
      case 'medium': return 10;
      case 'high': return 25;
      case 'extreme': return 60; // Auth is heavy due to bcrypt
      default: return 5;
    }
  }
}
