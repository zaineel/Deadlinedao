import { cortexComplete, cortexSentiment, cortexClassify } from './client';
import type { Goal, ValidationResult } from '@/types';

/**
 * AI-powered proof validation using Snowflake Cortex
 * This is the CORE feature for the Snowflake track
 */

interface ValidationContext {
  goal: Goal;
  proofText: string;
  imageUrl?: string;
}

/**
 * Main validation function - orchestrates all AI checks
 * Uses Snowflake Cortex AI models to validate proof submissions
 */
export async function validateProof(
  goal: Goal,
  proofText: string,
  imageUrl?: string
): Promise<ValidationResult> {
  try {
    console.log(`[Snowflake AI] Validating proof for goal: ${goal.title}`);

    // Run validation checks in parallel for speed
    const [
      textAnalysis,
      sentimentScore,
      fraudCheck,
      specificityCheck,
    ] = await Promise.all([
      analyzeProofText(goal, proofText),
      analyzeSentiment(proofText),
      detectFraud(goal, proofText),
      checkSpecificity(proofText),
    ]);

    // Calculate overall quality score
    const qualityScore = calculateQualityScore({
      textMatchScore: textAnalysis.matchScore,
      sentimentScore,
      fraudScore: fraudCheck.fraudScore,
      specificityScore: specificityCheck.score,
    });

    // Determine verdict
    const verdict = determineVerdict({
      textMatch: textAnalysis.isMatch,
      fraudDetected: fraudCheck.isFraud,
      qualityScore,
      confidence: textAnalysis.confidence,
    });

    // Compile red flags
    const redFlags = [
      ...fraudCheck.redFlags,
      ...specificityCheck.issues,
      ...(textAnalysis.concerns || []),
    ];

    // Generate reasoning
    const reasoning = await generateReasoning({
      goal,
      proofText,
      verdict,
      textAnalysis,
      sentimentScore,
      fraudCheck,
      qualityScore,
      redFlags,
    });

    console.log(`[Snowflake AI] Verdict: ${verdict} (confidence: ${textAnalysis.confidence}, quality: ${qualityScore})`);

    return {
      verdict,
      confidence: textAnalysis.confidence,
      quality_score: qualityScore,
      text_match_score: textAnalysis.matchScore,
      specificity_score: specificityCheck.score,
      red_flags: redFlags,
      reasoning: reasoning || 'AI validation completed',
    };
  } catch (error) {
    console.error('[Snowflake AI] Validation error:', error);

    // Return needs_review on error (fail-safe)
    return {
      verdict: 'needs_review',
      confidence: 0,
      quality_score: 0,
      text_match_score: 0,
      specificity_score: 0,
      red_flags: ['AI validation error - manual review required'],
      reasoning: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Analyze if proof text matches the goal using Snowflake Cortex LLM
 */
async function analyzeProofText(
  goal: Goal,
  proofText: string
): Promise<{
  isMatch: boolean;
  matchScore: number;
  confidence: number;
  concerns: string[];
}> {
  const prompt = `You are an AI validator for a goal accountability platform. Analyze if the proof description demonstrates completion of the goal.

GOAL:
Title: ${goal.title}
Description: ${goal.description}
Category: ${goal.category}

PROOF SUBMITTED:
${proofText}

Analyze:
1. Does the proof demonstrate the goal was actually completed?
2. Is the proof specific and credible?
3. Are there any concerns or red flags?

Respond in JSON format:
{
  "is_match": true/false,
  "match_score": 0-100,
  "confidence": 0-100,
  "concerns": ["list of concerns if any"]
}`;

  const { completion, error } = await cortexComplete(
    'claude-3-5-sonnet',
    prompt,
    { temperature: 0.3, maxTokens: 500 }
  );

  if (error || !completion) {
    console.error('[Snowflake AI] Text analysis failed:', error);
    return {
      isMatch: false,
      matchScore: 0,
      confidence: 0,
      concerns: ['Failed to analyze proof text'],
    };
  }

  try {
    // Extract JSON from response (handles markdown code blocks)
    const jsonMatch = completion.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(completion);

    return {
      isMatch: parsed.is_match || false,
      matchScore: parsed.match_score || 0,
      confidence: parsed.confidence || 0,
      concerns: parsed.concerns || [],
    };
  } catch (parseError) {
    console.error('[Snowflake AI] Failed to parse text analysis:', parseError);
    return {
      isMatch: false,
      matchScore: 0,
      confidence: 0,
      concerns: ['Failed to parse AI response'],
    };
  }
}

/**
 * Analyze sentiment to detect emotional manipulation or fake enthusiasm
 */
async function analyzeSentiment(proofText: string): Promise<number> {
  const { sentiment, error } = await cortexSentiment(proofText);

  if (error || sentiment === null) {
    console.error('[Snowflake AI] Sentiment analysis failed:', error);
    return 0;
  }

  // Normalize to 0-100 scale
  return Math.round((sentiment + 1) * 50);
}

/**
 * Detect potential fraud using AI pattern recognition
 */
async function detectFraud(
  goal: Goal,
  proofText: string
): Promise<{
  isFraud: boolean;
  fraudScore: number;
  redFlags: string[];
}> {
  const prompt = `You are a fraud detection AI. Analyze this proof submission for signs of fraud or deception.

GOAL: ${goal.title}

PROOF: ${proofText}

Check for:
- Generic/vague descriptions that could apply to anything
- Copy-pasted content or AI-generated text
- Contradictions or inconsistencies
- Excessive claims without specific details
- Suspicious patterns

Respond in JSON:
{
  "is_fraud": true/false,
  "fraud_score": 0-100,
  "red_flags": ["specific issues found"]
}`;

  const { completion, error } = await cortexComplete(
    'mistral-large',
    prompt,
    { temperature: 0.2, maxTokens: 400 }
  );

  if (error || !completion) {
    return {
      isFraud: false,
      fraudScore: 0,
      redFlags: [],
    };
  }

  try {
    const jsonMatch = completion.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(completion);

    return {
      isFraud: parsed.is_fraud || false,
      fraudScore: parsed.fraud_score || 0,
      redFlags: parsed.red_flags || [],
    };
  } catch (parseError) {
    return {
      isFraud: false,
      fraudScore: 0,
      redFlags: [],
    };
  }
}

/**
 * Check specificity - vague proofs get lower scores
 */
async function checkSpecificity(proofText: string): Promise<{
  score: number;
  issues: string[];
}> {
  const prompt = `Rate the specificity and detail level of this proof description (0-100).

Specific proofs include:
- Concrete details, numbers, dates, times
- Specific outcomes or results
- Verifiable information
- Personal insights

Vague proofs have:
- Generic statements
- No concrete details
- Could apply to anything
- Overly brief

PROOF: ${proofText}

Respond in JSON:
{
  "score": 0-100,
  "issues": ["list specific problems"]
}`;

  const { completion, error } = await cortexComplete(
    'mistral-large',
    prompt,
    { temperature: 0.3, maxTokens: 300 }
  );

  if (error || !completion) {
    return { score: 50, issues: [] };
  }

  try {
    const jsonMatch = completion.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(completion);

    return {
      score: parsed.score || 50,
      issues: parsed.issues || [],
    };
  } catch (parseError) {
    return { score: 50, issues: [] };
  }
}

/**
 * Calculate overall quality score from multiple factors
 */
function calculateQualityScore(factors: {
  textMatchScore: number;
  sentimentScore: number;
  fraudScore: number;
  specificityScore: number;
}): number {
  // Weighted average
  const weights = {
    textMatch: 0.40,    // 40% - most important
    specificity: 0.30,   // 30%
    sentiment: 0.15,     // 15%
    fraud: 0.15,         // 15% (inverted - lower fraud = higher quality)
  };

  const score = (
    factors.textMatchScore * weights.textMatch +
    factors.specificityScore * weights.specificity +
    factors.sentimentScore * weights.sentiment +
    (100 - factors.fraudScore) * weights.fraud
  );

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Determine final verdict based on all checks
 */
function determineVerdict(checks: {
  textMatch: boolean;
  fraudDetected: boolean;
  qualityScore: number;
  confidence: number;
}): 'approved' | 'rejected' | 'needs_review' {
  // Auto-reject if fraud detected
  if (checks.fraudDetected) {
    return 'rejected';
  }

  // Auto-reject if text doesn't match
  if (!checks.textMatch) {
    return 'rejected';
  }

  // Auto-approve if high quality and confidence
  if (checks.qualityScore >= 75 && checks.confidence >= 70) {
    return 'approved';
  }

  // Auto-reject if very low quality
  if (checks.qualityScore < 40 || checks.confidence < 40) {
    return 'rejected';
  }

  // Everything else needs manual review
  return 'needs_review';
}

/**
 * Generate human-readable reasoning using AI
 */
async function generateReasoning(context: {
  goal: Goal;
  proofText: string;
  verdict: 'approved' | 'rejected' | 'needs_review';
  textAnalysis: any;
  sentimentScore: number;
  fraudCheck: any;
  qualityScore: number;
  redFlags: string[];
}): Promise<string | null> {
  const prompt = `Generate a brief explanation (2-3 sentences) for this proof validation decision.

GOAL: ${context.goal.title}
PROOF: ${context.proofText}
VERDICT: ${context.verdict}
QUALITY SCORE: ${context.qualityScore}/100
RED FLAGS: ${context.redFlags.join(', ') || 'None'}

Explain why this proof was ${context.verdict}. Be professional and constructive.`;

  const { completion } = await cortexComplete(
    'mistral-large',
    prompt,
    { temperature: 0.5, maxTokens: 150 }
  );

  return completion;
}

/**
 * Batch validate multiple proofs (for efficiency)
 */
export async function batchValidateProofs(
  validations: Array<{ goal: Goal; proofText: string; imageUrl?: string }>
): Promise<ValidationResult[]> {
  const results = await Promise.all(
    validations.map(v => validateProof(v.goal, v.proofText, v.imageUrl))
  );

  return results;
}
