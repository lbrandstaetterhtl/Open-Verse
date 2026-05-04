import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import type { StressTest } from './stress-tests/base';
import { ApiEndpointStressTest } from './stress-tests/api-endpoint-stress';
import { DatabaseStressTest } from './stress-tests/database-stress';
import { WebSocketStressTest } from './stress-tests/websocket-stress';
import { FileUploadStressTest } from './stress-tests/file-upload-stress';
import { AuthenticationStressTest } from './stress-tests/authentication-stress';
import { MemoryLeakTest } from './stress-tests/memory-leak-test';
import { CpuStressTest } from './stress-tests/cpu-stress';
import { ConcurrentUserTest } from './stress-tests/concurrent-user-test';
import type { TestConfig, TestResult } from '../types/stress';
import type { Logger } from '../utils/logger';
import { activityLogger } from './activity-logger';
import { logger as systemLogger } from '../logger';

export class StressTestRunner extends EventEmitter {
  private tests: Map<string, StressTest>;

  constructor() {
    super();
    this.tests = new Map();
    this.registerTests();
  }

  private registerTests() {
    this.tests.set('api-endpoints', new ApiEndpointStressTest());
    this.tests.set('database-connections', new DatabaseStressTest());
    this.tests.set('websocket-flood', new WebSocketStressTest());
    this.tests.set('file-upload', new FileUploadStressTest());
    this.tests.set('authentication', new AuthenticationStressTest());
    this.tests.set('memory-leak', new MemoryLeakTest());
    this.tests.set('cpu-intensive', new CpuStressTest());
    this.tests.set('concurrent-users', new ConcurrentUserTest());
  }

  async runTest(testName: string, config: TestConfig, logger: Logger, adminId?: number): Promise<TestResult> {
    const test = this.tests.get(testName);
    if (!test) throw new Error(`Stress test '${testName}' not found.`);

    logger.log(`🚀 Starting Stress Test: ${testName.toUpperCase()}`);
    logger.log(`📊 Parameters: Intensity=${config.intensity}, Duration=${config.duration}s`);
    logger.log(`💻 Node: ${process.version} | OS: ${os.type()} ${os.release()} | CPUs: ${os.cpus().length}`);
    logger.log('─'.repeat(50));

    const result = await test.run(config, logger);

    // PERSISTENCE [SEC-012]: Log stress test results to activity_logs
    try {
      await activityLogger.log('security.stress_test_complete', {
        userId: adminId,
        category: 'security',
        description: `Stress Test '${testName}' abgeschlossen`,
        targetType: 'StressTest',
        targetId: testName,
        severity: result.metrics.failedRequests > result.metrics.successfulRequests ? 'warning' : 'info',
        metadata: {
          testName,
          intensity: config.intensity,
          totalRequests: result.metrics.totalRequests,
          successRate: `${((result.metrics.successfulRequests / result.metrics.totalRequests) * 100).toFixed(2)}%`,
          avgLatency: `${result.metrics.avgResponseTime.toFixed(1)}ms`,
          errors: result.metrics.errors
        }
      });
    } catch (e) {
      systemLogger.error('performance', "Failed to archive stress test result", e, { testName });
    }

    logger.log('─'.repeat(50));
    logger.log(`✅ Stress Test Completed: ${testName}`);
    logger.log(`📈 Summary:`);
    logger.log(`   - Throughput: ${result.metrics.requestsPerSecond.toFixed(2)} req/s`);
    logger.log(`   - Success: ${result.metrics.successfulRequests} | Failure: ${result.metrics.failedRequests}`);
    logger.log(`   - Latency: Avg ${result.metrics.avgResponseTime.toFixed(1)}ms | Max ${result.metrics.maxResponseTime.toFixed(1)}ms`);
    
    return result;
  }

  async runAllTests(config: TestConfig, logger: Logger, adminId?: number): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const testNames = Array.from(this.tests.keys());
    
    logger.log(`🎯 TARGET ACQUIRED: Running full stress suite (${testNames.length} tests)`);
    logger.log('═'.repeat(60));

    for (let i = 0; i < testNames.length; i++) {
      const name = testNames[i];
      logger.info(`\n[Test ${i + 1}/${testNames.length}] Initializing ${name}...`);
      
      const result = await this.runTest(name, config, logger, adminId);
      results.push(result);

      if (i < testNames.length - 1) {
        logger.warn("Cooldown initiated (10s) to stabilize system resources...");
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    logger.log('═'.repeat(60));
    logger.log(`🎉 ALL STRESS TESTS COMPLETED SUCCESSFULLY`);
    return results;
  }

  getAvailableTests(): string[] {
    return Array.from(this.tests.keys());
  }
}
