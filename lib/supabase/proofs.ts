import { supabase, Database } from './client';
import type { Proof, ValidationResult } from '@/types';

type ProofInsert = Database['public']['Tables']['proofs']['Insert'];
type ProofUpdate = Database['public']['Tables']['proofs']['Update'];

/**
 * Create a new proof submission
 */
export async function createProof(proofData: ProofInsert): Promise<{ data: Proof | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('proofs')
      .insert(proofData)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Proof, error: null };
  } catch (error) {
    console.error('Error creating proof:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get proof by ID
 */
export async function getProofById(proofId: string): Promise<{ data: Proof | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('proofs')
      .select('*')
      .eq('id', proofId)
      .single();

    if (error) throw error;

    return { data: data as Proof, error: null };
  } catch (error) {
    console.error('Error fetching proof:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get proofs for a specific goal
 */
export async function getProofsByGoal(goalId: string): Promise<{ data: Proof[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('proofs')
      .select('*')
      .eq('goal_id', goalId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    return { data: data as Proof[], error: null };
  } catch (error) {
    console.error('Error fetching proofs by goal:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get the latest proof for a goal
 */
export async function getLatestProofForGoal(goalId: string): Promise<{ data: Proof | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('proofs')
      .select('*')
      .eq('goal_id', goalId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // If no proof exists, return null data (not an error)
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      throw error;
    }

    return { data: data as Proof, error: null };
  } catch (error) {
    console.error('Error fetching latest proof:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update proof with AI validation results
 */
export async function updateProofWithValidation(
  proofId: string,
  validationResult: ValidationResult
): Promise<{ data: Proof | null; error: Error | null }> {
  try {
    const updates: ProofUpdate = {
      ai_verdict: validationResult.verdict,
      ai_confidence: validationResult.confidence,
      quality_score: validationResult.quality_score,
      ai_reasoning: validationResult.reasoning,
    };

    const { data, error } = await supabase
      .from('proofs')
      .update(updates)
      .eq('id', proofId)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Proof, error: null };
  } catch (error) {
    console.error('Error updating proof with validation:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update proof (generic update)
 */
export async function updateProof(
  proofId: string,
  updates: ProofUpdate
): Promise<{ data: Proof | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('proofs')
      .update(updates)
      .eq('id', proofId)
      .select()
      .single();

    if (error) throw error;

    return { data: data as Proof, error: null };
  } catch (error) {
    console.error('Error updating proof:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get proofs that need review (AI verdict is 'needs_review')
 */
export async function getProofsNeedingReview(): Promise<{ data: Proof[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('proofs')
      .select('*')
      .eq('ai_verdict', 'needs_review')
      .order('submitted_at', { ascending: true });

    if (error) throw error;

    return { data: data as Proof[], error: null };
  } catch (error) {
    console.error('Error fetching proofs needing review:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get proofs by verdict (for analytics)
 */
export async function getProofsByVerdict(
  verdict: 'approved' | 'rejected' | 'needs_review',
  limit?: number
): Promise<{ data: Proof[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('proofs')
      .select('*')
      .eq('ai_verdict', verdict)
      .order('submitted_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as Proof[], error: null };
  } catch (error) {
    console.error('Error fetching proofs by verdict:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get high-quality proofs (quality_score >= threshold)
 */
export async function getHighQualityProofs(
  qualityThreshold: number = 80,
  limit?: number
): Promise<{ data: Proof[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('proofs')
      .select('*')
      .gte('quality_score', qualityThreshold)
      .order('quality_score', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as Proof[], error: null };
  } catch (error) {
    console.error('Error fetching high-quality proofs:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Delete proof
 */
export async function deleteProof(proofId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('proofs')
      .delete()
      .eq('id', proofId);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error deleting proof:', error);
    return { error: error as Error };
  }
}

/**
 * Check if a goal already has a proof submitted
 */
export async function hasProofForGoal(goalId: string): Promise<{ hasProof: boolean; error: Error | null }> {
  try {
    const { count, error } = await supabase
      .from('proofs')
      .select('id', { count: 'exact', head: true })
      .eq('goal_id', goalId);

    if (error) throw error;

    return { hasProof: (count ?? 0) > 0, error: null };
  } catch (error) {
    console.error('Error checking proof existence:', error);
    return { hasProof: false, error: error as Error };
  }
}
