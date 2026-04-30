import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger';
import type { Itinerary, TripRequest } from '../types';
import { aiOrchestratorService } from './ai-orchestrator.service';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ItineraryJob {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  result?: Itinerary;
  error?: { code: string; message: string };
}

type JobTask = () => Promise<void>;

class InMemoryJobQueue {
  private readonly jobs = new Map<string, ItineraryJob>();
  private readonly idempotency = new Map<string, string>();
  private readonly tasks: Array<{ jobId: string; run: JobTask }> = [];
  private running = false;

  enqueueItinerary(request: TripRequest, options?: { idempotencyKey?: string; requestId?: string }): ItineraryJob {
    const idempotencyKey = options?.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existingJobId = this.idempotency.get(idempotencyKey);
      const existing = existingJobId ? this.jobs.get(existingJobId) : undefined;
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const job: ItineraryJob = {
      id: randomUUID(),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    if (idempotencyKey) this.idempotency.set(idempotencyKey, job.id);

    this.tasks.push({
      jobId: job.id,
      run: () => this.runItineraryJob(job.id, request, options?.requestId),
    });
    void this.drain();
    return job;
  }

  get(jobId: string): ItineraryJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      while (this.tasks.length) {
        const task = this.tasks.shift();
        if (!task) continue;
        await task.run();
      }
    } finally {
      this.running = false;
    }
  }

  private async runItineraryJob(jobId: string, request: TripRequest, requestId?: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    this.update(job, { status: 'running' });
    logger.info({ event: 'itinerary_job_started', jobId, requestId });

    try {
      for await (const event of aiOrchestratorService.streamItinerary(request, { requestId })) {
        if (event.type === 'done') {
          this.update(job, { status: 'succeeded', result: event.data.itinerary });
          logger.info({ event: 'itinerary_job_succeeded', jobId, requestId });
          return;
        }
      }

      this.update(job, { status: 'failed', error: { code: 'INTERNAL_ERROR', message: 'Job ended without itinerary' } });
    } catch (err) {
      const error = err as { code?: string; message?: string };
      this.update(job, {
        status: 'failed',
        error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Job failed' },
      });
      logger.warn({ event: 'itinerary_job_failed', jobId, requestId, message: String(err) });
    }
  }

  private update(job: ItineraryJob, changes: Partial<ItineraryJob>): void {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
  }
}

export const jobQueueService = new InMemoryJobQueue();
