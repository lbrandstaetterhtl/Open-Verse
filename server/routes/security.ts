import { Router } from 'express';
import { z } from 'zod';
import { hasPermission } from '../middleware/auth';
import { StressTestRunner } from '../services/stress-test-runner';
import { Logger } from '../utils/logger';
import { sendValidationError } from '../utils/http-errors';

const router = Router();
const testRunner = new StressTestRunner();

// Stress tests load the live server (API, DB, CPU, memory, sockets): own permission, bounded input and
// only one run at a time.
const MAX_DURATION_S = 300;
const stressSchema = z.object({
  intensity: z.enum(['low', 'medium', 'high', 'extreme']).optional().default('medium'),
  duration: z.number().int().min(1).max(MAX_DURATION_S).optional().default(30),
}).strip();
let running = false;

router.post('/stress-test/:testName?', hasPermission('stress_test'), async (req, res) => {
  const { testName } = req.params;
  if (testName && testName !== 'all' && !testRunner.getAvailableTests().includes(testName)) {
    return res.status(404).json({ error: "Stress test not found", code: "STRESS_TEST_NOT_FOUND" });
  }
  const parsed = stressSchema.safeParse(req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (running) return res.status(409).json({ error: "A stress test is already running", code: "STRESS_TEST_RUNNING" });

  const { intensity, duration } = parsed.data;
  const config = {};
  const adminId = (req.user as any)?.id;
  running = true;

  // Stream results to client using Server-Sent Events (SSE)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const logger = new Logger((message) => {
    res.write(`data: ${JSON.stringify({ message, timestamp: new Date() })}\n\n`);
  });

  req.on('close', () => {
    logger.isCancelled = true;
    console.log(`[StressTest] Connection closed by client. Aborting test...`);
  });

  try {
    if (testName && testName !== 'all') {
      await testRunner.runTest(testName, { intensity, duration, config } as any, logger, adminId);
    } else {
      await testRunner.runAllTests({ intensity, duration, config } as any, logger, adminId);
    }
    res.write(`data: ${JSON.stringify({ complete: true })}\n\n`);
  } catch (error: any) {
    logger.error("Stress Test Framework Execution Failed", error);
    res.write(`data: ${JSON.stringify({ error: "Stress test failed" })}\n\n`);
  } finally {
    running = false;
    res.end();
  }
});

router.get('/stress-test/available', hasPermission('stress_test'), (req, res) => {
  res.json({ tests: testRunner.getAvailableTests() });
});

export default router;
