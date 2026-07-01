/**
 * Genblaze SDK — TypeScript Orchestration Layer
 * 
 * This module implements the Genblaze orchestration pattern for generative media workflows.
 * In production, this would interface with the Python Genblaze SDK via API.
 * For the hackathon demo, it orchestrates multi-model generation using z-ai-web-dev-sdk.
 * 
 * Key Genblaze Concepts Implemented:
 * - Pipeline: A sequence of generation/processing steps
 * - Node: Individual step in a pipeline (generate, validate, transform)
 * - Context: Shared state passed between pipeline nodes
 * - Multi-model routing: Dispatch to multiple generation models concurrently
 */

export interface GenblazeModel {
  id: string;
  name: string;
  provider: string;
  capabilities: ('image' | 'video' | 'audio')[];
  qualityTier: 'standard' | 'high' | 'ultra';
}

export interface GenblazeContext {
  jobId: string;
  prompt: string;
  mediaType: 'image' | 'video' | 'audio';
  models: GenblazeModel[];
  candidates: GenblazeCandidate[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface GenblazeCandidate {
  id: string;
  model: GenblazeModel;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  data?: string; // base64 or URL
  latencyMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface GenblazePipelineStep {
  id: string;
  name: string;
  type: 'generate' | 'validate' | 'transform' | 'select' | 'store';
  execute: (context: GenblazeContext) => Promise<GenblazeContext>;
}

// Available models for the consensus pipeline
export const AVAILABLE_MODELS: GenblazeModel[] = [
  {
    id: 'flux-schnell',
    name: 'FLUX.schnell',
    provider: 'Black Forest Labs',
    capabilities: ['image'],
    qualityTier: 'standard',
  },
  {
    id: 'flux-pro',
    name: 'FLUX.pro',
    provider: 'Black Forest Labs',
    capabilities: ['image'],
    qualityTier: 'ultra',
  },
  {
    id: 'sdxl-turbo',
    name: 'SDXL Turbo',
    provider: 'Stability AI',
    capabilities: ['image'],
    qualityTier: 'high',
  },
  {
    id: 'playground-v2.5',
    name: 'Playground v2.5',
    provider: 'Playground AI',
    capabilities: ['image'],
    qualityTier: 'high',
  },
  {
    id: 'ideogram-v2',
    name: 'Ideogram v2',
    provider: 'Ideogram',
    capabilities: ['image'],
    qualityTier: 'high',
  },
];

/**
 * Create a Genblaze context for a new generation job.
 */
export function createContext(
  jobId: string,
  prompt: string,
  mediaType: 'image' | 'video' | 'audio',
  selectedModels: GenblazeModel[]
): GenblazeContext {
  return {
    jobId,
    prompt,
    mediaType,
    models: selectedModels,
    candidates: selectedModels.map(model => ({
      id: `${jobId}_${model.id}`,
      model,
      status: 'pending',
    })),
    metadata: {
      pipelineVersion: '1.0.0',
      consensusThreshold: 0.7,
    },
    createdAt: new Date(),
  };
}

/**
 * Build the complete Genblaze pipeline for consensus-verified generation.
 * Note: Actual generation is handled server-side via API routes.
 * This defines the pipeline structure for orchestration.
 */
export function buildConsensusPipeline(): GenblazePipelineStep[] {
  // The generation step is executed server-side in /api/generate
  // Client-side only needs the orchestration metadata
  return [
    {
      id: 'generate',
      name: 'Multi-Model Generation',
      type: 'generate',
      execute: async (ctx) => ctx, // No-op on client; server handles actual gen
    },
  ];
}

/**
 * Get recommended model combinations for optimal consensus.
 * Different combinations provide different trade-offs of speed vs. diversity.
 */
export function getModelRecommendations(): { label: string; models: GenblazeModel[]; description: string }[] {
  return [
    {
      label: 'Fast Consensus (2 models)',
      models: [AVAILABLE_MODELS[0], AVAILABLE_MODELS[2]], // FLUX.schnell + SDXL Turbo
      description: 'Quick dual-model validation for rapid iteration',
    },
    {
      label: 'Balanced (3 models)',
      models: [AVAILABLE_MODELS[0], AVAILABLE_MODELS[1], AVAILABLE_MODELS[2]],
      description: 'Good diversity with FLUX.schnell, FLUX.pro, and SDXL Turbo',
    },
    {
      label: 'Full Consensus (5 models)',
      models: AVAILABLE_MODELS,
      description: 'Maximum validation across all available models',
    },
  ];
}