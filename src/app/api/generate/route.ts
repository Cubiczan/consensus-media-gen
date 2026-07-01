import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { createContext, AVAILABLE_MODELS, type GenblazeContext, type GenblazeModel } from '@/lib/genblaze';
import { runConsensusPipeline } from '@/lib/consensus';

// In-memory notification channel for WebSocket service
export const jobNotifications = new Map<string, (data: Record<string, unknown>) => void>();

function notify(jobId: string, data: Record<string, unknown>) {
  const handler = jobNotifications.get(jobId);
  if (handler) handler(data);
  // Also broadcast to global listeners
  const globalHandler = jobNotifications.get('*');
  if (globalHandler) globalHandler({ ...data, jobId });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, mediaType = 'image', modelIds } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (prompt.length > 1000) {
      return NextResponse.json({ error: 'Prompt must be under 1000 characters' }, { status: 400 });
    }

    // Select models
    const selectedModels: GenblazeModel[] = modelIds && modelIds.length > 0
      ? AVAILABLE_MODELS.filter(m => modelIds.includes(m.id))
      : AVAILABLE_MODELS.slice(0, 3); // Default: first 3 models

    if (selectedModels.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 models are required for consensus validation' },
        { status: 400 }
      );
    }

    const jobId = uuidv4();

    // Create job in database
    const job = await db.generationJob.create({
      data: {
        id: jobId,
        prompt: prompt.trim(),
        status: 'PENDING',
        mediaType,
        modelsUsed: JSON.stringify(selectedModels.map(m => m.id)),
      },
    });

    // Create candidate records
    for (const model of selectedModels) {
      await db.generationCandidate.create({
        data: {
          id: `${jobId}_${model.id}`,
          jobId,
          modelName: model.name,
          modelVersion: model.qualityTier,
          status: 'PENDING',
        },
      });
    }

    // Start pipeline asynchronously (fire and forget)
    runPipelineAsync(jobId, prompt, selectedModels);

    return NextResponse.json({ 
      jobId: job.id, 
      status: 'PENDING',
      message: 'Generation pipeline started' 
    }, { status: 201 });
  } catch (error) {
    console.error('[Generate API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start generation pipeline' },
      { status: 500 }
    );
  }
}

async function runPipelineAsync(
  jobId: string,
  prompt: string,
  models: GenblazeModel[]
) {
  try {
    const { executeGenerationStep } = await import('@/lib/genblaze');
    const { generateImage, storeImageLocal } = await import('@/lib/image-gen');

    // State: GENERATING
    await db.generationJob.update({ where: { id: jobId }, data: { status: 'GENERATING' } });
    const { logEvent } = await import('@/lib/consensus');
    await logEvent(jobId, 'STATE_TRANSITION', 'PENDING', 'GENERATING');
    notify(jobId, { type: 'STATE_CHANGE', state: 'GENERATING' });

    // Execute generation for each model concurrently
    const genPromises = models.map(async (model) => {
      const candidateId = `${jobId}_${model.id}`;
      const start = Date.now();
      
      await db.generationCandidate.update({
        where: { id: candidateId },
        data: { status: 'GENERATING' },
      });

      notify(jobId, { type: 'CANDIDATE_UPDATE', candidateId, model: model.name, status: 'GENERATING' });

      try {
        const imageData = await generateImage(prompt, model);
        const latencyMs = Date.now() - start;

        // Store locally for immediate viewing
        const localKey = `jobs/${jobId}/candidates/${model.id}.png`;
        storeImageLocal(localKey, imageData);

        await db.generationCandidate.update({
          where: { id: candidateId },
          data: {
            status: 'COMPLETED',
            b2Key: localKey,
            b2Url: `/api/b2/proxy/${encodeURIComponent(localKey)}`,
            latencyMs,
            metadata: JSON.stringify({ localKey, generatedAt: new Date().toISOString() }),
          },
        });

        notify(jobId, { 
          type: 'CANDIDATE_UPDATE', 
          candidateId, 
          model: model.name, 
          status: 'COMPLETED',
          latencyMs,
        });

        return { id: candidateId, modelName: model.name, modelTier: model.qualityTier, data: imageData, latencyMs };
      } catch (error) {
        const latencyMs = Date.now() - start;
        const errorMsg = error instanceof Error ? error.message : 'Generation failed';
        
        await db.generationCandidate.update({
          where: { id: candidateId },
          data: { status: 'FAILED', error: errorMsg, latencyMs },
        });

        notify(jobId, { 
          type: 'CANDIDATE_UPDATE', 
          candidateId, 
          model: model.name, 
          status: 'FAILED',
          error: errorMsg,
        });

        return { id: candidateId, modelName: model.name, modelTier: model.qualityTier, latencyMs };
      }
    });

    const candidates = await Promise.all(genPromises);

    // Run consensus pipeline
    const completedCandidates = candidates.filter(c => c.data);
    if (completedCandidates.length < 2) {
      await db.generationJob.update({ where: { id: jobId }, data: { status: 'FAILED' } });
      await logEvent(jobId, 'STATE_TRANSITION', 'GENERATING', 'FAILED', undefined, {
        reason: 'Not enough candidates completed for consensus',
      });
      notify(jobId, { type: 'STATE_CHANGE', state: 'FAILED', reason: 'Insufficient candidates' });
      return;
    }

    const result = await runConsensusPipeline(
      jobId,
      completedCandidates as { id: string; modelName: string; modelTier: string; data: string; latencyMs?: number }[],
      undefined,
      (state, details) => {
        notify(jobId, { type: 'STATE_CHANGE', state, ...details });
      }
    );

    notify(jobId, { type: 'PIPELINE_COMPLETE', winnerId: result.winnerId, scores: result.scores });
  } catch (error) {
    console.error(`[Pipeline] Job ${jobId} failed:`, error);
    await db.generationJob.update({ where: { id: jobId }, data: { status: 'FAILED' } });
    notify(jobId, { type: 'STATE_CHANGE', state: 'FAILED', error: 'Pipeline execution failed' });
  }
}