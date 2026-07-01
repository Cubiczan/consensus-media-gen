import { create } from 'zustand';

export type PipelineState =
  | 'PENDING'
  | 'GENERATING'
  | 'VALIDATING'
  | 'ADVERSARIAL_CHECK'
  | 'SELECTING'
  | 'STORING'
  | 'COMPLETED'
  | 'FAILED';

export interface Candidate {
  id: string;
  modelName: string;
  modelVersion: string;
  status: string;
  score?: number;
  qualityScore?: number;
  diversityScore?: number;
  adversarialScore?: number;
  b2Key?: string;
  b2Url?: string;
  latencyMs?: number;
  error?: string;
  metadata?: string;
}

export interface JobEvent {
  id: string;
  type: string;
  fromState?: string;
  toState?: string;
  candidateId?: string;
  details: string;
  createdAt: string;
}

export interface Job {
  id: string;
  prompt: string;
  status: PipelineState;
  mediaType: string;
  modelsUsed: string;
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
  candidates: Candidate[];
  events?: JobEvent[];
  _count?: { events: number; assets: number };
}

export interface B2Asset {
  id: string;
  jobId?: string;
  candidateId?: string;
  b2Key: string;
  fileName: string;
  contentType: string;
  size: number;
  checksum?: string;
  isWinner: boolean;
  createdAt: string;
  candidate?: { modelName: string; status: string };
}

interface AppState {
  // Jobs
  jobs: Job[];
  jobsTotal: number;
  isLoadingJobs: boolean;
  
  // Current job (detail view)
  currentJob: Job | null;
  isLoadingJob: boolean;
  
  // Generation form
  prompt: string;
  selectedModels: string[];
  isGenerating: boolean;
  
  // Active tab
  activeTab: string;
  
  // B2 Assets
  assets: B2Asset[];
  assetStats: { totalAssets: number; totalSize: number; winnerAssets: number };
  isLoadingAssets: boolean;
  
  // Actions
  setJobs: (jobs: Job[], total: number) => void;
  setLoadingJobs: (loading: boolean) => void;
  setCurrentJob: (job: Job | null) => void;
  setLoadingJob: (loading: boolean) => void;
  setPrompt: (prompt: string) => void;
  setSelectedModels: (models: string[]) => void;
  setGenerating: (generating: boolean) => void;
  setActiveTab: (tab: string) => void;
  setAssets: (assets: B2Asset[], stats: { totalAssets: number; totalSize: number; winnerAssets: number }) => void;
  setLoadingAssets: (loading: boolean) => void;
  updateJobInList: (jobId: string, updates: Partial<Job>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  jobs: [],
  jobsTotal: 0,
  isLoadingJobs: false,
  currentJob: null,
  isLoadingJob: false,
  prompt: '',
  selectedModels: ['flux-schnell', 'sdxl-turbo', 'playground-v2.5'],
  isGenerating: false,
  activeTab: 'studio',
  assets: [],
  assetStats: { totalAssets: 0, totalSize: 0, winnerAssets: 0 },
  isLoadingAssets: false,
  
  setJobs: (jobs, total) => set({ jobs, jobsTotal: total }),
  setLoadingJobs: (isLoadingJobs) => set({ isLoadingJobs }),
  setCurrentJob: (currentJob) => set({ currentJob }),
  setLoadingJob: (isLoadingJob) => set({ isLoadingJob }),
  setPrompt: (prompt) => set({ prompt }),
  setSelectedModels: (selectedModels) => set({ selectedModels }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setAssets: (assets, assetStats) => set({ assets, assetStats }),
  setLoadingAssets: (isLoadingAssets) => set({ isLoadingAssets }),
  updateJobInList: (jobId, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, ...updates } : j)),
    })),
}));