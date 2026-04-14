import axios from 'axios';
import { performance } from 'node:perf_hooks';
import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';

export class ConcurrentUserTest extends StressTest {
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

    logger.info(`Starting Concurrent User Simulation [${config.intensity}]`);
    logger.log(`Concurrecy: ${concurrency} users | Flow: Register -> Login -> Feed -> Post`);

    const workers = Array(concurrency).fill(null).map(async (_, idx) => {
      while (Date.now() - startTime < testDuration) {
        const userStart = performance.now();
        const api = axios.create({
          baseURL: 'http://localhost:5000',
          timeout: 10000,
          validateStatus: () => true,
          withCredentials: true // For session handling
        });

        // Use a persistent header or similar if needed for custom auth tracking
        const username = `bot_${Date.now()}_${idx}_${Math.random().toString(36).slice(7)}`;
        const email = `${username}@osiris.test`;
        const password = 'UserStress123!';

        try {
          // 1. Register
          await api.post('/api/register', { username, email, password, confirmPassword: password });
          
          // 2. Login
          const loginRes = await api.post('/api/login', { username, password });
          if (loginRes.status >= 400) throw new Error(`Login failed: ${loginRes.status}`);

          // 3. Fetch Feed
          await api.get('/api/posts');

          // 4. Create Post
          await api.post('/api/posts', {
            title: 'Automated Stress Post',
            content: 'Simulation message from concurrent user stress test.',
            category: 'discussion'
          });

          metrics.successfulRequests++;
          metrics.responseTimes.push(performance.now() - userStart);
        } catch (error: any) {
          metrics.failedRequests++;
          const errType = error.message || 'BOT_SESSION_ERROR';
          metrics.errors.set(errType, (metrics.errors.get(errType) || 0) + 1);
        }

        metrics.totalRequests++;
        await new Promise(r => setTimeout(r, 500)); // Delay between "users"
      }
    });

    await Promise.all(workers);
    return this.calculateResults('concurrent-users', startTime, metrics);
  }

  private getConcurrency(intensity: string): number {
    switch (intensity) {
      case 'low': return 5;
      case 'medium': return 20;
      case 'high': return 50;
      case 'extreme': return 150;
      default: return 10;
    }
  }
}
