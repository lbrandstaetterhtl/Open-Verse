export interface TestConfig {
  intensity: 'low' | 'medium' | 'high' | 'extreme';
  duration: number; // seconds
  config: Record<string, any>;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
}

export interface TestResult {
  testName: string;
  startTime: Date;
  endTime: Date;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    requestsPerSecond: number;
    errors: Array<{ type: string; count: number }>;
    systemMetrics: SystemMetrics;
  };
}

export interface WeightedEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  weight: number;
  body?: any;
}
