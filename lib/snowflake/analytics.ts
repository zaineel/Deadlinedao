/**
 * AI Analytics and Monitoring for Snowflake Cortex
 * Track AI performance, accuracy, and usage
 */

export interface AIValidationMetrics {
  totalValidations: number;
  approved: number;
  rejected: number;
  needsReview: number;
  avgConfidence: number;
  avgQualityScore: number;
  avgProcessingTime: number;
  fraudDetectionRate: number;
}

export interface ValidationLog {
  timestamp: Date;
  goalId: string;
  verdict: 'approved' | 'rejected' | 'needs_review';
  confidence: number;
  qualityScore: number;
  processingTimeMs: number;
  redFlags: string[];
  model: string;
}

// In-memory storage (in production, use Supabase)
const validationLogs: ValidationLog[] = [];

/**
 * Log a validation result for analytics
 */
export function logValidation(log: Omit<ValidationLog, 'timestamp'>): void {
  validationLogs.push({
    ...log,
    timestamp: new Date(),
  });

  // Keep only last 1000 logs in memory
  if (validationLogs.length > 1000) {
    validationLogs.shift();
  }
}

/**
 * Get AI validation metrics
 */
export function getAIMetrics(timeframeMinutes?: number): AIValidationMetrics {
  let logs = validationLogs;

  // Filter by timeframe if specified
  if (timeframeMinutes) {
    const cutoff = new Date(Date.now() - timeframeMinutes * 60 * 1000);
    logs = validationLogs.filter(log => log.timestamp >= cutoff);
  }

  if (logs.length === 0) {
    return {
      totalValidations: 0,
      approved: 0,
      rejected: 0,
      needsReview: 0,
      avgConfidence: 0,
      avgQualityScore: 0,
      avgProcessingTime: 0,
      fraudDetectionRate: 0,
    };
  }

  const approved = logs.filter(l => l.verdict === 'approved').length;
  const rejected = logs.filter(l => l.verdict === 'rejected').length;
  const needsReview = logs.filter(l => l.verdict === 'needs_review').length;

  const totalConfidence = logs.reduce((sum, l) => sum + l.confidence, 0);
  const totalQuality = logs.reduce((sum, l) => sum + l.qualityScore, 0);
  const totalTime = logs.reduce((sum, l) => sum + l.processingTimeMs, 0);

  const fraudFlags = logs.filter(l =>
    l.redFlags.some(flag => flag.toLowerCase().includes('fraud'))
  ).length;

  return {
    totalValidations: logs.length,
    approved,
    rejected,
    needsReview,
    avgConfidence: Math.round(totalConfidence / logs.length),
    avgQualityScore: Math.round(totalQuality / logs.length),
    avgProcessingTime: Math.round(totalTime / logs.length),
    fraudDetectionRate: logs.length > 0 ? (fraudFlags / logs.length) * 100 : 0,
  };
}

/**
 * Get recent validation logs
 */
export function getRecentValidations(limit: number = 10): ValidationLog[] {
  return validationLogs.slice(-limit).reverse();
}

/**
 * Get validation accuracy (requires manual verification data)
 */
export interface AccuracyMetrics {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Calculate model performance metrics
 */
export function calculateAccuracy(
  predictions: Array<{ predicted: boolean; actual: boolean }>
): AccuracyMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const pred of predictions) {
    if (pred.predicted && pred.actual) tp++;
    else if (pred.predicted && !pred.actual) fp++;
    else if (!pred.predicted && !pred.actual) tn++;
    else if (!pred.predicted && pred.actual) fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  return {
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1Score: Math.round(f1Score * 100) / 100,
  };
}

/**
 * Get common red flags across validations
 */
export function getCommonRedFlags(limit: number = 10): Array<{ flag: string; count: number }> {
  const flagCounts = new Map<string, number>();

  for (const log of validationLogs) {
    for (const flag of log.redFlags) {
      flagCounts.set(flag, (flagCounts.get(flag) || 0) + 1);
    }
  }

  return Array.from(flagCounts.entries())
    .map(([flag, count]) => ({ flag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get validation statistics by category
 */
export function getStatsByCategory(): Record<string, {
  count: number;
  avgQuality: number;
  approvalRate: number;
}> {
  // This would require goal category info
  // Placeholder for future implementation
  return {};
}

/**
 * Monitor AI performance in real-time
 */
export class AIPerformanceMonitor {
  private startTime: number;
  private operationName: string;

  constructor(operationName: string) {
    this.operationName = operationName;
    this.startTime = Date.now();
  }

  /**
   * Complete monitoring and log performance
   */
  complete(metadata?: Record<string, any>): void {
    const duration = Date.now() - this.startTime;
    console.log(`[Snowflake AI] ${this.operationName} completed in ${duration}ms`, metadata);
  }

  /**
   * Log an error
   */
  error(error: Error): void {
    const duration = Date.now() - this.startTime;
    console.error(`[Snowflake AI] ${this.operationName} failed after ${duration}ms:`, error);
  }
}

/**
 * Export validation logs for analysis
 */
export function exportValidationLogs(format: 'json' | 'csv' = 'json'): string {
  if (format === 'json') {
    return JSON.stringify(validationLogs, null, 2);
  }

  // CSV format
  const header = 'timestamp,goalId,verdict,confidence,qualityScore,processingTimeMs,redFlagsCount\n';
  const rows = validationLogs.map(log =>
    `${log.timestamp.toISOString()},${log.goalId},${log.verdict},${log.confidence},${log.qualityScore},${log.processingTimeMs},${log.redFlags.length}`
  ).join('\n');

  return header + rows;
}

/**
 * Get validation success rate over time
 */
export function getSuccessRateTrend(
  intervalMinutes: number = 60
): Array<{ time: Date; successRate: number }> {
  if (validationLogs.length === 0) return [];

  const intervals = new Map<number, { total: number; successful: number }>();

  for (const log of validationLogs) {
    const intervalKey = Math.floor(log.timestamp.getTime() / (intervalMinutes * 60 * 1000));

    const current = intervals.get(intervalKey) || { total: 0, successful: 0 };
    current.total += 1;
    if (log.verdict === 'approved') {
      current.successful += 1;
    }

    intervals.set(intervalKey, current);
  }

  return Array.from(intervals.entries())
    .map(([key, stats]) => ({
      time: new Date(key * intervalMinutes * 60 * 1000),
      successRate: (stats.successful / stats.total) * 100,
    }))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

/**
 * Detect anomalies in AI behavior
 */
export function detectAnomalies(): {
  anomalies: string[];
  severity: 'low' | 'medium' | 'high';
} {
  const recentMetrics = getAIMetrics(60); // Last hour
  const anomalies: string[] = [];
  let severity: 'low' | 'medium' | 'high' = 'low';

  // Check for unusual patterns
  if (recentMetrics.avgConfidence < 40) {
    anomalies.push('Low average confidence detected');
    severity = 'high';
  }

  if (recentMetrics.fraudDetectionRate > 50) {
    anomalies.push('Unusually high fraud detection rate');
    severity = 'medium';
  }

  if (recentMetrics.avgProcessingTime > 10000) {
    anomalies.push('Slow processing times detected');
    severity = 'medium';
  }

  if (recentMetrics.needsReview / recentMetrics.totalValidations > 0.5) {
    anomalies.push('High rate of manual review needed');
    severity = 'medium';
  }

  return { anomalies, severity };
}
