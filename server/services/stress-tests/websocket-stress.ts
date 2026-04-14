import WebSocket from 'ws';
import { performance } from 'node:perf_hooks';
import { StressTest } from './base';
import type { TestConfig, TestResult } from '../../types/stress';
import type { Logger } from '../../utils/logger';

export class WebSocketStressTest extends StressTest {
  async run(config: TestConfig, logger: Logger): Promise<TestResult> {
    const connectionCount = this.getConnectionCount(config.intensity);
    const messageRate = this.getMessageRate(config.intensity); // msgs per second per connection
    
    const startTime = Date.now();
    const testDuration = config.duration * 1000;
    
    const metrics = {
      totalRequests: 0, // connections attempted
      successfulRequests: 0, // connections opened
      failedRequests: 0,
      responseTimes: [] as number[],
      errors: new Map<string, number>(),
      messagesSent: 0,
      messagesReceived: 0
    };

    logger.info(`Starting WebSocket Flood Test [${config.intensity}]`);
    logger.log(`Target: ${connectionCount} connections | ${messageRate} msg/s per client`);

    const sockets: WebSocket[] = [];
    
    // Phase 1: Establish connections
    for (let i = 0; i < connectionCount; i++) {
      this.checkCancellation(logger);
      if (Date.now() - startTime > testDuration) break;
      
      const ws = new WebSocket('ws://localhost:5000/ws');
      
      metrics.totalRequests++;
      
      ws.on('open', () => {
        metrics.successfulRequests++;
        if (metrics.successfulRequests % 50 === 0) {
          logger.log(`Active Connections: ${metrics.successfulRequests}/${connectionCount}`);
        }
      });

      ws.on('message', () => {
        metrics.messagesReceived++;
      });

      ws.on('error', (err: any) => {
        metrics.failedRequests++;
        const errType = err.message || 'WS_ERROR';
        metrics.errors.set(errType, (metrics.errors.get(errType) || 0) + 1);
      });

      sockets.push(ws);
      await new Promise(r => setTimeout(r, 5)); // Stagger
    }

    // Phase 2: Flood messages
    const floodInterval = setInterval(() => {
      try {
        this.checkCancellation(logger);
        sockets.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stress_test', data: 'x'.repeat(128) }));
            metrics.messagesSent++;
          }
        });
      } catch (e) {
        clearInterval(floodInterval);
      }
    }, 1000 / messageRate);

    // Run for duration - checking cancellation periodically
    const checkInterval = 500;
    while (Date.now() - startTime < testDuration) {
      this.checkCancellation(logger);
      await new Promise(r => setTimeout(r, checkInterval));
    }
    
    clearInterval(floodInterval);
    sockets.forEach(ws => ws.terminate());

    return this.calculateResults('websocket-flood', startTime, metrics);
  }

  private getConnectionCount(intensity: string): number {
    switch (intensity) {
      case 'low': return 20;
      case 'medium': return 100;
      case 'high': return 500;
      case 'extreme': return 2000;
      default: return 50;
    }
  }

  private getMessageRate(intensity: string): number {
    switch (intensity) {
      case 'low': return 1;
      case 'medium': return 5;
      case 'high': return 20;
      case 'extreme': return 100;
      default: return 5;
    }
  }
}
