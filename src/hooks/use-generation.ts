import { useCallback } from 'react';
import { useAppStore, type Job } from '@/store/app-store';

export function useGeneration() {
  const { prompt, selectedModels, isGenerating, setGenerating, setActiveTab } = useAppStore();

  const startGeneration = useCallback(async (): Promise<string | null> => {
    if (!prompt.trim() || selectedModels.length < 2) return null;

    setGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          mediaType: 'image',
          modelIds: selectedModels,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      // Switch to gallery tab to watch progress
      setTimeout(() => setActiveTab('gallery'), 500);
      return data.jobId;
    } catch (err) {
      console.error('Generation failed:', err);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [prompt, selectedModels, setGenerating, setActiveTab]);

  return { isGenerating, startGeneration };
}