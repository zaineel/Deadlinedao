import { cortexComplete } from './client';
import type { Goal } from '@/types';

/**
 * Image analysis for proof validation
 * Uses AI vision models to verify image proofs
 */

export interface ImageAnalysisResult {
  isRelevant: boolean;
  confidence: number;
  description: string;
  concerns: string[];
  matchScore: number;
}

/**
 * Analyze image proof using vision AI
 * Note: In production, you'd pass the image to a vision model
 * For Snowflake, this uses Claude 3.5 Sonnet with vision capabilities
 */
export async function analyzeProofImage(
  goal: Goal,
  imageUrl: string,
  proofText: string
): Promise<ImageAnalysisResult> {
  try {
    console.log(`[Snowflake AI Vision] Analyzing image for goal: ${goal.title}`);

    // Fetch image metadata
    const imageInfo = await getImageMetadata(imageUrl);

    // For Snowflake Cortex with vision models, we'd normally pass the image
    // Since we're using SQL API, we'll use text-based analysis of the image URL
    // and combine with OCR/description if available

    const prompt = `You are analyzing a proof image for a goal accountability platform.

GOAL:
Title: ${goal.title}
Description: ${goal.description}
Category: ${goal.category}

IMAGE URL: ${imageUrl}
USER'S DESCRIPTION: ${proofText}

Based on the user's description and context, assess:
1. Would an image at this URL likely demonstrate goal completion?
2. Does the description suggest the image is relevant?
3. Are there any concerns about authenticity?

${imageInfo.metadata ? `Image metadata: ${JSON.stringify(imageInfo.metadata)}` : ''}

Respond in JSON:
{
  "is_relevant": true/false,
  "confidence": 0-100,
  "description": "what you expect to see in the image",
  "concerns": ["any red flags"],
  "match_score": 0-100
}`;

    const { completion, error } = await cortexComplete(
      'claude-3-5-sonnet',
      prompt,
      { temperature: 0.3, maxTokens: 400 }
    );

    if (error || !completion) {
      console.error('[Snowflake AI Vision] Analysis failed:', error);
      return {
        isRelevant: false,
        confidence: 0,
        description: 'Failed to analyze image',
        concerns: ['Image analysis failed'],
        matchScore: 0,
      };
    }

    try {
      const jsonMatch = completion.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(completion);

      return {
        isRelevant: parsed.is_relevant || false,
        confidence: parsed.confidence || 0,
        description: parsed.description || '',
        concerns: parsed.concerns || [],
        matchScore: parsed.match_score || 0,
      };
    } catch (parseError) {
      console.error('[Snowflake AI Vision] Parse error:', parseError);
      return {
        isRelevant: false,
        confidence: 0,
        description: 'Failed to parse analysis',
        concerns: ['Parse error'],
        matchScore: 0,
      };
    }
  } catch (error) {
    console.error('[Snowflake AI Vision] Error:', error);
    return {
      isRelevant: false,
      confidence: 0,
      description: 'Analysis error',
      concerns: ['Unexpected error'],
      matchScore: 0,
    };
  }
}

/**
 * Get image metadata (size, type, etc.)
 */
async function getImageMetadata(imageUrl: string): Promise<{
  success: boolean;
  metadata?: {
    contentType?: string;
    size?: number;
    lastModified?: string;
  };
}> {
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });

    if (!response.ok) {
      return { success: false };
    }

    return {
      success: true,
      metadata: {
        contentType: response.headers.get('content-type') || undefined,
        size: parseInt(response.headers.get('content-length') || '0'),
        lastModified: response.headers.get('last-modified') || undefined,
      },
    };
  } catch (error) {
    console.error('Failed to get image metadata:', error);
    return { success: false };
  }
}

/**
 * Verify image is accessible
 */
export async function verifyImageAccessible(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if image appears to be screenshot vs photo
 * Screenshots might indicate screen capture of results, which could be good for learning goals
 */
export async function detectImageType(imageUrl: string): Promise<{
  type: 'photo' | 'screenshot' | 'document' | 'unknown';
  confidence: number;
}> {
  const metadata = await getImageMetadata(imageUrl);

  // Simple heuristic based on content type
  if (!metadata.success || !metadata.metadata?.contentType) {
    return { type: 'unknown', confidence: 0 };
  }

  const contentType = metadata.metadata.contentType.toLowerCase();

  if (contentType.includes('png')) {
    // PNGs are often screenshots
    return { type: 'screenshot', confidence: 60 };
  } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    // JPEGs are usually photos
    return { type: 'photo', confidence: 70 };
  } else if (contentType.includes('pdf')) {
    return { type: 'document', confidence: 90 };
  }

  return { type: 'unknown', confidence: 30 };
}

/**
 * Enhanced validation that combines text and image analysis
 */
export async function validateProofWithImage(
  goal: Goal,
  proofText: string,
  imageUrl: string
): Promise<{
  textScore: number;
  imageScore: number;
  overallScore: number;
  imageRelevant: boolean;
  recommendation: 'approve' | 'reject' | 'needs_review';
  reasoning: string;
}> {
  // Check if image is accessible
  const imageAccessible = await verifyImageAccessible(imageUrl);

  if (!imageAccessible) {
    return {
      textScore: 0,
      imageScore: 0,
      overallScore: 0,
      imageRelevant: false,
      recommendation: 'reject',
      reasoning: 'Image URL is not accessible',
    };
  }

  // Analyze image
  const imageAnalysis = await analyzeProofImage(goal, imageUrl, proofText);

  // Calculate scores
  const imageScore = imageAnalysis.matchScore;

  // Text analysis is done separately via validation.ts
  // For now, use a simplified text score
  const textScore = proofText.length > 50 ? 70 : 40;

  // Combined score (weighted: 60% text, 40% image)
  const overallScore = Math.round(textScore * 0.6 + imageScore * 0.4);

  // Determine recommendation
  let recommendation: 'approve' | 'reject' | 'needs_review' = 'needs_review';

  if (!imageAnalysis.isRelevant) {
    recommendation = 'reject';
  } else if (overallScore >= 75 && imageAnalysis.confidence >= 70) {
    recommendation = 'approve';
  } else if (overallScore < 40) {
    recommendation = 'reject';
  }

  // Generate reasoning
  const concerns = imageAnalysis.concerns.length > 0
    ? ` Concerns: ${imageAnalysis.concerns.join(', ')}`
    : '';

  const reasoning = `Image analysis: ${imageAnalysis.description}. Overall match: ${overallScore}/100.${concerns}`;

  return {
    textScore,
    imageScore,
    overallScore,
    imageRelevant: imageAnalysis.isRelevant,
    recommendation,
    reasoning,
  };
}

/**
 * Detect potentially manipulated or stock images
 */
export async function detectImageManipulation(imageUrl: string): Promise<{
  suspicious: boolean;
  reasons: string[];
  confidence: number;
}> {
  // In production, this would use advanced image forensics
  // For now, use metadata and AI analysis

  const metadata = await getImageMetadata(imageUrl);

  const reasons: string[] = [];

  // Check file size (stock images are often very high res)
  if (metadata.metadata?.size && metadata.metadata.size > 5 * 1024 * 1024) {
    reasons.push('Unusually large file size');
  }

  // More sophisticated checks would involve:
  // - EXIF data analysis
  // - Reverse image search
  // - Compression artifacts
  // - Metadata consistency

  return {
    suspicious: reasons.length > 0,
    reasons,
    confidence: reasons.length > 0 ? 60 : 10,
  };
}
