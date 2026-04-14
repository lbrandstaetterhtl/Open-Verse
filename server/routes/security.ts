import { Router } from 'express';
import { isAdmin } from '../middleware/auth';
import { StressTestRunner } from '../services/stress-test-runner';
import { Logger } from '../utils/logger';

const router = Router();
const testRunner = new StressTestRunner();

router.post('/stress-test/:testName?', isAdmin, async (req, res) => {
  const { testName } = req.params;
  const { intensity = 'medium', duration = 30, config = {} } = req.body;
  const adminId = (req.user as any)?.id;

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
      await testRunner.runTest(testName, { intensity, duration, config }, logger, adminId);
    } else {
      await testRunner.runAllTests({ intensity, duration, config }, logger, adminId);
    }
    res.write(`data: ${JSON.stringify({ complete: true })}\n\n`);
  } catch (error: any) {
    logger.error("Stress Test Framework Execution Failed", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
});

router.get('/stress-test/available', isAdmin, (req, res) => {
  res.json({ tests: testRunner.getAvailableTests() });
});

export default router;
