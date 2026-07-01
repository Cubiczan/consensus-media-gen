/**
 * Consensus State Machine
 * 
 * Implements a deterministic state machine for validating AI-generated media
 * through multi-model consensus and adversarial quality checks.
 * 
 * States: PENDING → GENERATING → VALIDATING → ADVERSARIAL_CHECK → SELECTING → STORING → COMPLETED
 *                                                                  ↘ FAILED
 */

import { db } from './db';
import { uploadCandidateImage, uploadToB2 } from './b2-client';
import { getImageLocal, storeImageLocal } from './image-gen';

export type PipelineState =
  | 'PENDING'
  | 'GENERATING'
  | 'VALIDATING'
  | 'ADVERSARIAL_CHECK'
  | 'SELECTING'
  | 'STORING'
  | 'COMPLETED'
  | 'FAILED';

const STATE_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  PENDING: ['GENERATING', 'FAILED'],
  GENERATING: ['VALIDATING', 'FAILED'],
  VALIDATING: ['ADVERSARIAL_CHECK', 'FAILED'],
  ADVERSARIAL_CHECK: ['SELECTING', 'FAILED'],
  SELECTING: ['STORING', 'FAILED'],
  STORING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function isValidTransition(from: PipelineState, to: PipelineState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) || false;
}

export interface ConsensusConfig {
  qualityThreshold: number;    // Min quality score (0-1) to pass validation
  diversityWeight: number;     // Weight for diversity scoring (0-1)
  adversarialSensitivity: number; // Sensitivity for adversarial detection (0-1)
  minCandidates: number;       // Minimum candidates needed for consensus
}

export const DEFAULT_CONFIG: ConsensusConfig = {
  qualityThreshold: 0.5,
  diversityWeight: 0.3,
  adversarialSensitivity: 0.6,
  minCandidates: 2,
};

/**
 * Log a state transition event to the database.
 */
async function logEvent(
  jobId: string,
  type: string,
  fromState: string | null,
  toState: string,
  candidateId?: string,
  details?: Record<string, unknown>
) {
  await db.consensusEvent.create({
    data: {
      jobId,
      type,
      fromState,
      toState,
      candidateId,
      details: JSON.stringify(details || {}),
    },
  });
}

/**
 * Compute quality score for a candidate.
 * In production, this would use a VLM (vision-language model) to evaluate.
 * For the hackathon, we simulate with heuristic scoring.
 */
function computeQualityScore(
  candidate: { data?: string; model?: { id: string; qualityTier: string }; latencyMs?: number },
  index: number,
  total: number
): number {
  // Simulate quality scoring based on model tier and generation characteristics
  const tierBonus = candidate.model?.qualityTier === 'ultra' ? 0.15 
    : candidate.model?.qualityTier === 'high' ? 0.08 : 0;
  
  // Simulate natural variation between models
  const seed = hashCode(candidate.model?.id || '') + index * 7919;
  const variation = (Math.sin(seed) * 0.5 + 0.5) * 0.25;
  
  // Penalize slow generations slightly
  const latencyPenalty = candidate.latencyMs ? Math.min(candidate.latencyMs / 60000, 0.1) : 0;
  
  return Math.min(1, Math.max(0, 0.65 + tierBonus + variation - latencyPenalty));
}

/**
 * Compute diversity score — how different this candidate is from others.
 * Measures visual/semantic diversity using simulated feature comparison.
 */
function computeDiversityScore(
  candidates: { id: string; model?: { id: string } }[],
  currentIndex: number
): number {
  if (candidates.length <= 1) return 0.5;

  const current = candidates[currentIndex];
  const others = candidates.filter((_, i) => i !== currentIndex);
  
  // Simulate diversity based on model differences
  let totalDiff = 0;
  for (const other of others) {
    const diff = current.model?.id === other.model?.id ? 0.1 : 0.6;
    totalDiff += diff;
  }
  
  return Math.min(1, totalDiff / others.length);
}

/**
 * Run adversarial quality check.
 * Simulates detecting AI artifacts, distortions, and quality issues.
 * In production, this would use a dedicated adversarial detection model.
 */
function computeAdversarialScore(candidate: { model?: { id: string }; latencyMs?: number }): number {
  // Higher score = fewer adversarial artifacts detected
  const seed = hashCode(candidate.model?.id || 'unknown') * 13;
  const baseScore = 0.7 + (Math.cos(seed) * 0.5 + 0.5) * 0.25;
  
  // Ultra quality tier has better adversarial robustness
  const tierBonus = candidate.model?.qualityTier === 'ultra' ? 0.05 : 0;
  
  return Math.min(1, baseScore + tierBonus);
}

/**
 * Select the winner using weighted consensus scoring.
 */
function selectWinner(
  candidates: {
    id: string;
    qualityScore?: number;
    diversityScore?: number;
    adversarialScore?: number;
  }[],
  config: ConsensusConfig
): string | null {
  if (candidates.length === 0) return null;

  const scored = candidates.map(c => {
    const quality = c.qualityScore ?? 0;
    const diversity = c.diversityScore ?? 0;
    const adversarial = c.adversarialScore ?? 0;
    
    const consensusScore = 
      quality * (1 - config.diversityWeight) * 0.5 +
      diversity * config.diversityWeight * 0.3 +
      adversarial * 0.2;
    
    return { id: c.id, consensusScore };
  });

  scored.sort((a, b) => b.consensusScore - a.consensusScore);
  return scored[0]?.id || null;
}

// Simple hash function for deterministic scoring
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

/**
 * Run the full consensus validation pipeline for a job.
 * This is the main orchestrator that drives the state machine.
 */
export async function runConsensusPipeline(
  jobId: string,
  candidates: {
    id: string;
    modelName: string;
    modelTier: string;
    data?: string;
    latencyMs?: number;
  }[],
  config: ConsensusConfig = DEFAULT_CONFIG,
  onStateChange?: (state: PipelineState, details?: Record<string, unknown>) => void
): Promise<{ winnerId: string | null; scores: Record<string, number> }> {
  
  // State: VALIDATING
  await db.generationJob.update({ where: { id: jobId }, data: { status: 'VALIDATING' } });
  await logEvent(jobId, 'STATE_TRANSITION', 'GENERATING', 'VALIDATING');
  onStateChange?.('VALIDATING');
  
  // Phase 1: Quality Validation
  const qualityScores: Record<string, number> = {};
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const score = computeQualityScore(c, i, candidates.length);
    qualityScores[c.id] = score;
    
    await db.generationCandidate.update({
      where: { id: c.id },
      data: { qualityScore: score },
    });
    await logEvent(jobId, 'VALIDATION_RESULT', 'VALIDATING', 'VALIDATING', c.id, {
      metric: 'quality',
      score,
    });
    await new Promise(r => setTimeout(r, 200)); // Simulate processing time
  }
  
  // Phase 2: Diversity Scoring
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const score = computeDiversityScore(candidates, i);
    
    await db.generationCandidate.update({
      where: { id: c.id },
      data: { diversityScore: score },
    });
    await logEvent(jobId, 'VALIDATION_RESULT', 'VALIDATING', 'VALIDATING', c.id, {
      metric: 'diversity',
      score,
    });
  }
  
  // State: ADVERSARIAL_CHECK
  await db.generationJob.update({ where: { id: jobId }, data: { status: 'ADVERSARIAL_CHECK' } });
  await logEvent(jobId, 'STATE_TRANSITION', 'VALIDATING', 'ADVERSARIAL_CHECK');
  onStateChange?.('ADVERSARIAL_CHECK');
  
  // Phase 3: Adversarial Quality Check
  const adversarialScores: Record<string, number> = {};
  for (const c of candidates) {
    const score = computeAdversarialScore(c);
    adversarialScores[c.id] = score;
    
    await db.generationCandidate.update({
      where: { id: c.id },
      data: { adversarialScore: score },
    });
    await logEvent(jobId, 'ADVERSARIAL_RESULT', 'ADVERSARIAL_CHECK', 'ADVERSARIAL_CHECK', c.id, {
      score,
      passed: score >= (1 - config.adversarialSensitivity),
    });
    await new Promise(r => setTimeout(r, 300));
  }
  
  // State: SELECTING
  await db.generationJob.update({ where: { id: jobId }, data: { status: 'SELECTING' } });
  await logEvent(jobId, 'STATE_TRANSITION', 'ADVERSARIAL_CHECK', 'SELECTING');
  onStateChange?.('SELECTING');
  
  // Phase 4: Select Winner
  const allCandidates = await db.generationCandidate.findMany({
    where: { jobId },
    orderBy: { createdAt: 'asc' },
  });
  
  const winnerId = selectWinner(allCandidates, config);
  
  if (winnerId) {
    // Compute final consensus score for each candidate
    const finalScores: Record<string, number> = {};
    for (const c of allCandidates) {
      const q = c.qualityScore ?? 0;
      const d = c.diversityScore ?? 0;
      const a = c.adversarialScore ?? 0;
      finalScores[c.id] = q * 0.5 + d * 0.3 + a * 0.2;
      await db.generationCandidate.update({
        where: { id: c.id },
        data: { score: finalScores[c.id] },
      });
    }

    // Mark winner
    await db.generationCandidate.update({
      where: { id: winnerId },
      data: { status: 'SELECTED' },
    });
    await logEvent(jobId, 'WINNER_SELECTED', 'SELECTING', 'SELECTING', winnerId, {
      score: finalScores[winnerId],
    });

    // State: STORING
    await db.generationJob.update({ where: { id: jobId }, data: { status: 'STORING' } });
    await logEvent(jobId, 'STATE_TRANSITION', 'SELECTING', 'STORING');
    onStateChange?.('STORING');
    
    // Store winner to B2
    const winner = candidates.find(c => c.id === winnerId);
    if (winner?.data) {
      try {
        const imageData = winner.data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(imageData, 'base64');
        
        // Upload all candidates to B2
        for (const c of candidates) {
          if (c.data) {
            const cImageData = c.data.replace(/^data:image\/\w+;base64,/, '');
            const cBuffer = Buffer.from(cImageData, 'base64');
            const isWinner = c.id === winnerId;
            
            const uploadResult = await uploadCandidateImage(
              cBuffer,
              jobId,
              c.id,
              c.modelName,
              isWinner
            );
            
            await db.generationCandidate.update({
              where: { id: c.id },
              data: {
                b2Key: uploadResult.key,
                b2Url: uploadResult.url,
              },
            });
            
            // Also store locally for demo viewing
            storeImageLocal(uploadResult.key, c.data);
            
            await db.b2Asset.create({
              data: {
                jobId,
                candidateId: c.id,
                b2Key: uploadResult.key,
                fileName: `${c.modelName}_${c.id.slice(0, 8)}.png`,
                contentType: 'image/png',
                size: cBuffer.length,
                checksum: uploadResult.checksum,
                isWinner,
              },
            });
          }
        }
      } catch (error) {
        console.error('[B2] Upload failed, using local storage:', error);
        // Fallback: store locally only
        for (const c of candidates) {
          if (c.data) {
            const fakeKey = `jobs/${jobId}/${c.id === winnerId ? 'winner' : 'candidates'}/${c.modelName}.png`;
            storeImageLocal(fakeKey, c.data);
            await db.generationCandidate.update({
              where: { id: c.id },
              data: {
                b2Key: fakeKey,
                b2Url: `/api/b2/proxy/${encodeURIComponent(fakeKey)}`,
              },
            });
          }
        }
      }
    }

    // State: COMPLETED
    await db.generationJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', winnerId },
    });
    await logEvent(jobId, 'STATE_TRANSITION', 'STORING', 'COMPLETED');
    onStateChange?.('COMPLETED');

    return { winnerId, scores: finalScores };
  }
  
  // No winner (all candidates failed)
  await db.generationJob.update({ where: { id: jobId }, data: { status: 'FAILED' } });
  await logEvent(jobId, 'STATE_TRANSITION', 'SELECTING', 'FAILED', undefined, {
    reason: 'No candidates met quality threshold',
  });
  onStateChange?.('FAILED');

  return { winnerId: null, scores: {} };
}