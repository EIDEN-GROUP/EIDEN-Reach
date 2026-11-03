export type DurableJob = {
  id: string
  job_type: string
  attempts: number
  max_attempts: number
  claim_token: string
  payload: Record<string, unknown>
}

export type JobStore = {
  claim(limit: number, leaseSeconds: number): Promise<DurableJob[]>
  finish(job: DurableJob, resultCode: string): Promise<boolean>
  retry(job: DurableJob, errorCode: string, retryAt: string): Promise<void>
}

export type JobHandler = (job: DurableJob) => Promise<string>
export type JobHandlers = Record<string, JobHandler>

export function retryDelayMs(attempt: number): number {
  return Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.max(0, Math.min(attempt - 1, 10)))
}

export async function dispatchBatch(
  store: JobStore,
  handlers: JobHandlers,
  now: () => number = Date.now,
  limit = 5,
): Promise<{ claimed: number; succeeded: number; retried: number }> {
  const jobs = await store.claim(Math.max(1, Math.min(5, limit)), 120)
  let succeeded = 0
  let retried = 0
  for (const job of jobs) {
    const handler = handlers[job.job_type]
    if (!handler) {
      await store.retry(job, 'handler_not_configured', new Date(now() + 24 * 60 * 60 * 1000).toISOString())
      retried += 1
      continue
    }
    try {
      const resultCode = await handler(job)
      const completed = await store.finish(job, resultCode.slice(0, 120))
      if (completed) succeeded += 1
      else retried += 1
    } catch {
      const delay = retryDelayMs(job.attempts)
      await store.retry(job, 'handler_failed', new Date(now() + delay).toISOString())
      retried += 1
    }
  }
  return { claimed: jobs.length, succeeded, retried }
}
