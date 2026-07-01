'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, type Job, type Candidate, type B2Asset, type PipelineState } from '@/store/app-store';
import { useJobs } from '@/hooks/use-jobs';
import { useGeneration } from '@/hooks/use-generation';
import { AVAILABLE_MODELS, getModelRecommendations } from '@/lib/genblaze';

// ─── Icons ───────────────────────────────────────────────────────────────────
import {
  Zap, Shield, Check, Layers, Upload, Image as ImageIcon,
  Play, Loader2, Trophy, AlertTriangle, Clock, RefreshCw,
  ChevronRight, ExternalLink, Server, BarChart3, Eye,
  CircleDot, GitBranch, Database, ArrowRight, Sparkles,
  X, Star, Hash, HardDrive, FolderOpen, Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─── Constants ───────────────────────────────────────────────────────────────
const STATE_COLORS: Record<PipelineState, string> = {
  PENDING: 'bg-zinc-500',
  GENERATING: 'bg-amber-500',
  VALIDATING: 'bg-cyan-500',
  ADVERSARIAL_CHECK: 'bg-orange-500',
  SELECTING: 'bg-violet-500',
  STORING: 'bg-emerald-500',
  COMPLETED: 'bg-emerald-600',
  FAILED: 'bg-red-500',
};

const STATE_LABELS: Record<PipelineState, string> = {
  PENDING: 'Queued',
  GENERATING: 'Generating',
  VALIDATING: 'Validating',
  ADVERSARIAL_CHECK: 'Adversarial Check',
  SELECTING: 'Selecting Winner',
  STORING: 'Storing to B2',
  COMPLETED: 'Complete',
  FAILED: 'Failed',
};

const PIPELINE_STEPS: PipelineState[] = [
  'PENDING', 'GENERATING', 'VALIDATING', 'ADVERSARIAL_CHECK', 'SELECTING', 'STORING', 'COMPLETED'
];

function getStateProgress(status: PipelineState): number {
  const idx = PIPELINE_STEPS.indexOf(status);
  if (status === 'FAILED') return 0;
  return Math.round((idx / (PIPELINE_STEPS.length - 1)) * 100);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ─── Header ──────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-card animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">CVMG</h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5 tracking-wide uppercase">Consensus-Verified Media Generator</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hidden sm:flex items-center gap-1.5">
              <Server className="w-3 h-3" /> Backblaze B2
            </Badge>
            <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400 bg-violet-500/5 hidden sm:flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Genblaze SDK
            </Badge>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/5">
              <Zap className="w-3 h-3" /> Hackathon
            </Badge>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Pipeline Progress Visualization ─────────────────────────────────────────
function PipelineViz({ status }: { status: PipelineState }) {
  const currentIdx = PIPELINE_STEPS.indexOf(status);
  const isFailed = status === 'FAILED';
  const progress = getStateProgress(status);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">Consensus Pipeline</span>
        <span className="font-mono">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2 bg-muted/50" />
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {PIPELINE_STEPS.map((step, i) => {
          const isCompleted = i < currentIdx;
          const isCurrent = i === currentIdx;
          const Icon = getStepIcon(step);

          return (
            <TooltipProvider key={step}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    className={`
                      flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap
                      transition-colors
                      ${isCompleted ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                        isCurrent ? (isFailed ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20') :
                        'bg-muted/30 text-muted-foreground/50 border border-transparent'}
                    `}
                    animate={isCurrent ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ repeat: isCurrent && !isFailed ? Infinity : 0, duration: 2 }}
                  >
                    {isCompleted ? (
                      <Check className="w-3 h-3" />
                    ) : isFailed && isCurrent ? (
                      <AlertTriangle className="w-3 h-3" />
                    ) : (
                      <Icon className="w-3 h-3" />
                    )}
                    <span className="hidden sm:inline">{STATE_LABELS[step]}</span>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">{STATE_LABELS[step]}</p>
                  {isCompleted && <p className="text-muted-foreground">Completed</p>}
                  {isCurrent && !isFailed && <p className="text-amber-400">In progress...</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );
}

function getStepIcon(step: PipelineState) {
  switch (step) {
    case 'PENDING': return Clock;
    case 'GENERATING': return Sparkles;
    case 'VALIDATING': return Eye;
    case 'ADVERSARIAL_CHECK': return Shield;
    case 'SELECTING': return Trophy;
    case 'STORING': return Upload;
    case 'COMPLETED': return Check;
    case 'FAILED': return AlertTriangle;
  }
}

// ─── Candidate Card ──────────────────────────────────────────────────────────
function CandidateCard({ candidate, isWinner, onClick }: { candidate: Candidate; isWinner: boolean; onClick?: () => void }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = candidate.b2Url || null;

  const scoreColor = candidate.score !== null && candidate.score !== undefined
    ? candidate.score >= 0.8 ? 'text-emerald-400' : candidate.score >= 0.6 ? 'text-amber-400' : 'text-red-400'
    : 'text-muted-foreground';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:shadow-black/20 ${isWinner ? 'ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/10' : ''}`} onClick={onClick}>
        <div className="relative aspect-square bg-muted/30 overflow-hidden">
          {candidate.status === 'GENERATING' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/50">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <span className="text-xs text-muted-foreground">Generating...</span>
            </div>
          ) : candidate.status === 'FAILED' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-500/5">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <span className="text-xs text-red-400">Failed</span>
            </div>
          ) : imgSrc && !imgError ? (
            <img
              src={imgSrc}
              alt={`Generated by ${candidate.modelName}`}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : candidate.status === 'COMPLETED' || candidate.status === 'SELECTED' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/30">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Processing...</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Clock className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}
          
          {isWinner && (
            <div className="absolute top-2 left-2">
              <Badge className="bg-emerald-500 text-white text-[10px] gap-1 shadow-lg">
                <Trophy className="w-3 h-3" /> Winner
              </Badge>
            </div>
          )}
          
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="bg-black/60 text-white text-[10px] backdrop-blur-sm border-0">
              {candidate.modelName}
            </Badge>
          </div>
        </div>
        
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{candidate.modelName}</span>
            {candidate.latencyMs && (
              <span className="text-[10px] text-muted-foreground font-mono">{(candidate.latencyMs / 1000).toFixed(1)}s</span>
            )}
          </div>
          
          {candidate.score !== null && candidate.score !== undefined && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${candidate.score >= 0.8 ? 'bg-emerald-500' : candidate.score >= 0.6 ? 'bg-amber-500' : 'bg-red-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${candidate.score * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              <span className={`text-xs font-mono font-bold ${scoreColor}`}>
                {candidate.score.toFixed(2)}
              </span>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-1 text-[9px] text-muted-foreground">
            <div className="text-center">
              <div className="font-mono">{candidate.qualityScore?.toFixed(2) ?? '—'}</div>
              <div>Quality</div>
            </div>
            <div className="text-center">
              <div className="font-mono">{candidate.diversityScore?.toFixed(2) ?? '—'}</div>
              <div>Diversity</div>
            </div>
            <div className="text-center">
              <div className="font-mono">{candidate.adversarialScore?.toFixed(2) ?? '—'}</div>
              <div>Adversarial</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Studio Tab ──────────────────────────────────────────────────────────────
function StudioTab() {
  const { prompt, selectedModels, setPrompt, setSelectedModels } = useAppStore();
  const { isGenerating, startGeneration } = useGeneration();
  const { fetchJobs, pollJob } = useJobs();
  const [error, setError] = useState<string | null>(null);

  const recommendations = getModelRecommendations();

  const handleGenerate = async () => {
    setError(null);
    try {
      const jobId = await startGeneration();
      if (jobId) {
        pollJob(jobId, () => fetchJobs());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels(
      selectedModels.includes(modelId)
        ? selectedModels.filter(id => id !== modelId)
        : [...selectedModels, modelId]
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Prompt & Config */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Generation Prompt</CardTitle>
                <CardDescription className="text-xs">Describe the media you want to generate</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="A futuristic cityscape at sunset with flying vehicles, neon lights reflecting off glass skyscrapers, cinematic composition..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px] resize-none text-sm"
              disabled={isGenerating}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{prompt.length}/1000</span>
              {selectedModels.length < 2 && (
                <span className="text-xs text-amber-400">Select at least 2 models</span>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || selectedModels.length < 2}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating with {selectedModels.length} models...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Consensus Generation
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Model Selection */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                <Layers className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base">Model Selection</CardTitle>
                <CardDescription className="text-xs">Choose models for consensus validation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick presets */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Presets</p>
              <div className="flex flex-wrap gap-2">
                {recommendations.map((rec) => (
                  <Button
                    key={rec.label}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setSelectedModels(rec.models.map(m => m.id))}
                    disabled={isGenerating}
                  >
                    {rec.label}
                    <Badge variant="secondary" className="ml-1.5 text-[9px] px-1.5">{rec.models.length}</Badge>
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Individual models */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_MODELS.map((model) => {
                const isSelected = selectedModels.includes(model.id);
                return (
                  <motion.div
                    key={model.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <button
                      onClick={() => toggleModel(model.id)}
                      disabled={isGenerating}
                      className={`
                        w-full text-left p-3 rounded-lg border transition-all text-sm
                        ${isSelected
                          ? 'border-emerald-500/50 bg-emerald-500/5 shadow-sm shadow-emerald-500/10'
                          : 'border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40'}
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground/30'}`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div>
                            <div className="font-medium text-xs">{model.name}</div>
                            <div className="text-[10px] text-muted-foreground">{model.provider}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[9px] ${model.qualityTier === 'ultra' ? 'border-amber-500/30 text-amber-400' : model.qualityTier === 'high' ? 'border-violet-500/30 text-violet-400' : 'border-muted-foreground/30'}`}>
                          {model.qualityTier}
                        </Badge>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: How It Works */}
      <div className="space-y-4">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              How Consensus Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { icon: Layers, label: 'Multi-Model Generate', desc: 'Multiple AI models generate from your prompt in parallel', color: 'text-amber-400' },
              { icon: Eye, label: 'Quality Validate', desc: 'Each output scored on visual quality metrics', color: 'text-cyan-400' },
              { icon: BarChart3, label: 'Diversity Score', desc: 'Measure how unique each candidate is from the others', color: 'text-violet-400' },
              { icon: Shield, label: 'Adversarial Check', desc: 'Detect artifacts, distortions, and quality issues', color: 'text-orange-400' },
              { icon: Trophy, label: 'Select Winner', desc: 'Weighted consensus picks the highest-scoring result', color: 'text-emerald-400' },
              { icon: Upload, label: 'Store on B2', desc: 'All candidates + winner stored on Backblaze B2', color: 'text-teal-400' },
            ].map((step, i) => (
              <div key={step.label} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    <step.icon className={`w-3.5 h-3.5 ${step.color}`} />
                  </div>
                  {i < 5 && <div className="w-px h-3 bg-border/50 mt-1" />}
                </div>
                <div className="pt-0.5">
                  <div className="text-xs font-medium">{step.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed">{step.desc}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold">Backblaze B2 Integration</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Every generation stores all candidates and the consensus winner on Backblaze B2 
              S3-compatible cloud storage with full provenance tracking and organized by job ID.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold">Genblaze SDK Orchestration</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Uses the Genblaze SDK pattern for multi-model pipeline orchestration with
              context passing between generation, validation, and selection stages.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Gallery Tab ─────────────────────────────────────────────────────────────
function GalleryTab() {
  const { jobs, isLoadingJobs, fetchJobs, pollJob } = useJobs();
  const { setCurrentJob, setActiveTab } = useAppStore();
  const [inspectingJobId, setInspectingJobId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchJobs();
    }
    // Poll active jobs
    const interval = setInterval(() => {
      const activeJobs = jobs.filter(j => !['COMPLETED', 'FAILED'].includes(j.status));
      if (activeJobs.length > 0) {
        fetchJobs();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchJobs, jobs]);

  const handleInspect = (job: Job) => {
    setCurrentJob(job);
    setActiveTab('inspector');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Generation Gallery</h2>
          <p className="text-xs text-muted-foreground">
            {jobs.length} generation{jobs.length !== 1 ? 's' : ''} · {jobs.filter(j => j.status === 'COMPLETED').length} completed
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchJobs()} className="text-xs">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {isLoadingJobs && jobs.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-border/50">
              <Skeleton className="h-40 w-full rounded-t-lg" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-16 text-center">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground">No generations yet</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Go to the Studio tab to create your first consensus-verified generation
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setActiveTab('studio')}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Start Creating
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onInspect={handleInspect} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, onInspect }: { job: Job; onInspect: (job: Job) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = !['COMPLETED', 'FAILED'].includes(job.status);
  const winner = job.candidates?.find(c => c.id === job.winnerId);
  const modelsUsed: string[] = job.modelsUsed ? JSON.parse(job.modelsUsed) : [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`border-border/50 overflow-hidden transition-all hover:shadow-lg hover:shadow-black/10 ${isActive ? 'ring-1 ring-amber-500/30' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{job.prompt}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground">{formatDate(job.createdAt)}</span>
                <Badge variant="outline" className="text-[9px] h-4">
                  {modelsUsed.length} models
                </Badge>
              </div>
            </div>
            <Badge className={`${STATE_COLORS[job.status as PipelineState]} text-white text-[9px] shrink-0`}>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse mr-1" />}
              {STATE_LABELS[job.status as PipelineState]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Pipeline progress for active jobs */}
          {isActive && <PipelineViz status={job.status as PipelineState} />}

          {/* Winner preview */}
          {winner?.b2Url && (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted/30">
              <img
                src={winner.b2Url}
                alt="Winner"
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="absolute bottom-2 left-2">
                <Badge className="bg-emerald-500 text-white text-[9px] gap-1 shadow-lg">
                  <Trophy className="w-2.5 h-2.5" /> Winner: {winner.modelName}
                </Badge>
              </div>
              {winner.score !== null && winner.score !== undefined && (
                <div className="absolute top-2 right-2">
                  <Badge className="bg-black/60 text-white text-[9px] backdrop-blur-sm border-0">
                    Score: {winner.score.toFixed(3)}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Candidate thumbnails for expanded view */}
          {expanded && job.candidates && job.candidates.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {job.candidates.map(c => (
                <CandidateCard key={c.id} candidate={c} isWinner={c.id === job.winnerId} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={() => onInspect(job)}
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Full Inspector
            </Button>
            {job.candidates && job.candidates.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Hide' : 'Show'} All ({job.candidates.length})
                <ChevronRight className={`w-3.5 h-3.5 ml-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Inspector Tab ───────────────────────────────────────────────────────────
function InspectorTab() {
  const { currentJob, setCurrentJob, isLoadingJob, setLoadingJob } = useAppStore();

  useEffect(() => {
    if (currentJob?.id) {
      const loadFullJob = async () => {
        setLoadingJob(true);
        try {
          const res = await fetch(`/api/jobs/${currentJob.id}`);
          const fullJob = await res.json();
          setCurrentJob(fullJob);
        } finally {
          setLoadingJob(false);
        }
      };
      if (!currentJob.events || currentJob.events.length === 0) {
        loadFullJob();
      }
    }
  }, [currentJob?.id, setCurrentJob, setLoadingJob]);

  if (!currentJob) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-16 text-center">
          <Eye className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-sm font-medium text-muted-foreground">No job selected</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Click &quot;Full Inspector&quot; on a gallery item to view detailed pipeline analysis
          </p>
        </CardContent>
      </Card>
    );
  }

  const job = currentJob;
  const winner = job.candidates?.find(c => c.id === job.winnerId);
  const events = job.events || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-bold">Pipeline Inspector</h2>
            <Badge className={`${STATE_COLORS[job.status as PipelineState]} text-white text-[10px]`}>
              {STATE_LABELS[job.status as PipelineState]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">&quot;{job.prompt}&quot;</p>
          <p className="text-[10px] text-muted-foreground mt-1 font-mono">Job ID: {job.id} · Created {formatDate(job.createdAt)}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentJob(null)}
          className="text-xs"
        >
          <X className="w-3.5 h-3.5 mr-1" /> Close
        </Button>
      </div>

      {/* Pipeline Progress */}
      <PipelineViz status={job.status as PipelineState} />

      {/* Candidates Comparison */}
      {job.candidates && job.candidates.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              Candidate Comparison ({job.candidates.length} models)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {job.candidates.map(c => (
                <CandidateCard key={c.id} candidate={c} isWinner={c.id === job.winnerId} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              State Machine Timeline ({events.length} events)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {events.map((event, i) => {
                  let details: Record<string, unknown> = {};
                  try { details = JSON.parse(event.details); } catch { /* empty */ }

                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-start gap-3 text-xs"
                    >
                      <div className="flex flex-col items-center mt-0.5">
                        <CircleDot className="w-3 h-3 text-muted-foreground" />
                        {i < events.length - 1 && <div className="w-px h-full min-h-[24px] bg-border/50" />}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] h-4">
                            {event.type}
                          </Badge>
                          {event.fromState && (
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {event.fromState} → {event.toState}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {formatDate(event.createdAt)}
                          </span>
                        </div>
                        {event.candidateId && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            Candidate: {event.candidateId.slice(-12)}
                          </p>
                        )}
                        {Object.keys(details).length > 0 && (
                          <pre className="mt-1 text-[10px] text-muted-foreground/70 bg-muted/30 rounded px-2 py-1 overflow-x-auto">
                            {JSON.stringify(details, null, 2).slice(0, 200)}
                          </pre>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Storage Tab ─────────────────────────────────────────────────────────────
function StorageTab() {
  const { assets, assetStats, isLoadingAssets, setAssets, setLoadingAssets } = useAppStore();
  const mountedRef = useRef(false);

  const fetchAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const res = await fetch('/api/b2/assets');
      const data = await res.json();
      if (data.assets) {
        setAssets(data.assets, data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  }, [setAssets, setLoadingAssets]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchAssets();
    }
  }, [fetchAssets]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">B2 Storage Browser</h2>
          <p className="text-xs text-muted-foreground">
            Backblaze B2 S3-compatible cloud storage
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAssets} className="text-xs">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{assetStats.totalAssets}</div>
                <div className="text-xs text-muted-foreground">Total Assets</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{formatBytes(assetStats.totalSize)}</div>
                <div className="text-xs text-muted-foreground">Total Storage</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{assetStats.winnerAssets}</div>
                <div className="text-xs text-muted-foreground">Winners Stored</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Asset List */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-teal-400" />
            Stored Assets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingAssets && assets.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-2 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="py-8 text-center">
              <Database className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No assets stored yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Complete a generation to see assets here
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${asset.isWinner ? 'bg-emerald-500/10' : 'bg-muted/50'}`}>
                      <ImageIcon className={`w-5 h-5 ${asset.isWinner ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{asset.fileName}</span>
                        {asset.isWinner && (
                          <Badge className="bg-emerald-500 text-white text-[8px] h-3.5 px-1.5">
                            <Trophy className="w-2 h-2 mr-0.5" /> Winner
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>{asset.contentType}</span>
                        <span>{formatBytes(asset.size)}</span>
                        <span className="font-mono">{asset.b2Key.slice(0, 40)}...</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-muted-foreground">{formatDate(asset.createdAt)}</div>
                      {asset.candidate && (
                        <div className="text-[10px] text-muted-foreground">{asset.candidate.modelName}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* B2 Architecture Info */}
      <Card className="border-border/50 bg-gradient-to-br from-teal-500/5 to-emerald-500/5">
        <CardContent className="p-5">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-teal-400" />
            B2 Storage Architecture
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div className="space-y-1">
              <div className="font-medium text-foreground">Organization Structure</div>
              <code className="block text-[10px] bg-muted/30 rounded p-2 font-mono">
                jobs/&#123;jobId&#125;/candidates/&#123;model&#125;.png<br />
                jobs/&#123;jobId&#125;/winner/&#123;model&#125;.png
              </code>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-foreground">S3-Compatible Operations</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {['PutObject', 'GetObject', 'ListObjects', 'HeadObject', 'GetSignedUrl'].map(op => (
                  <Badge key={op} variant="outline" className="text-[9px]">{op}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Home() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-muted/30 border border-border/50 p-1 h-auto">
              <TabsTrigger value="studio" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Studio
              </TabsTrigger>
              <TabsTrigger value="gallery" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
                <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
                Gallery
              </TabsTrigger>
              <TabsTrigger value="inspector" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                Inspector
              </TabsTrigger>
              <TabsTrigger value="storage" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
                <HardDrive className="w-3.5 h-3.5 mr-1.5" />
                B2 Storage
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TabsContent value="studio" className="mt-0">
                  <StudioTab />
                </TabsContent>
                <TabsContent value="gallery" className="mt-0">
                  <GalleryTab />
                </TabsContent>
                <TabsContent value="inspector" className="mt-0">
                  <InspectorTab />
                </TabsContent>
                <TabsContent value="storage" className="mt-0">
                  <StorageTab />
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </main>

        <footer className="border-t border-border/50 py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium">CVMG</span>
              <span>·</span>
              <span>Backblaze Generative Media Hackathon</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Server className="w-3 h-3" /> Backblaze B2</span>
              <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Genblaze SDK</span>
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Consensus VM</span>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}