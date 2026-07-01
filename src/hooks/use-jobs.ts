import { useCallback } from 'react';
import { useAppStore, type Job } from '@/store/app-store';

export function useJobs() {
  const { jobs, jobsTotal, isLoadingJobs, setJobs, setLoadingJobs, updateJobInList } = useAppStore();

  const fetchJobs = useCallback(async (limit = 20, offset = 0) => {
    setLoadingJobs(true);
    try {
      const res = await fetch(`/api/jobs?limit=${limit}&offset=${offset}`);
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs, data.total);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoadingJobs(false);
    }
  }, [setJobs, setLoadingJobs]);

  const pollJob = useCallback(async (jobId: string, onUpdate?: (job: Job) => void) => {
    const maxAttempts = 60; // 2 minutes max
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job: Job = await res.json();
        updateJobInList(jobId, job);
        onUpdate?.(job);

        if (job.status === 'COMPLETED' || job.status === 'FAILED') break;
        await new Promise(r => setTimeout(r, 2000));
      } catch {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }, [updateJobInList]);

  return { jobs, jobsTotal, isLoadingJobs, fetchJobs, pollJob };
}