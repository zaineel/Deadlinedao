/**
 * Snowflake Cortex AI Integration
 * Main module for AI-powered proof validation
 */

// Core API Client
export {
  cortexComplete,
  cortexSentiment,
  cortexClassify,
  cortexSummarize,
  healthCheck,
  testCortexAvailability,
} from './client';

// Proof Validation (PRIMARY FEATURE)
export {
  validateProof,
  batchValidateProofs,
} from './validation';

// Image Analysis
export {
  analyzeProofImage,
  verifyImageAccessible,
  detectImageType,
  validateProofWithImage,
  detectImageManipulation,
} from './image-analysis';

export type { ImageAnalysisResult } from './image-analysis';

// Analytics and Monitoring
export {
  logValidation,
  getAIMetrics,
  getRecentValidations,
  calculateAccuracy,
  getCommonRedFlags,
  getStatsByCategory,
  AIPerformanceMonitor,
  exportValidationLogs,
  getSuccessRateTrend,
  detectAnomalies,
} from './analytics';

export type {
  AIValidationMetrics,
  ValidationLog,
  AccuracyMetrics,
} from './analytics';
