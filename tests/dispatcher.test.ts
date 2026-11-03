import { describe, expect, it } from 'vitest'
import { dispatchBatch, retryDelayMs, type DurableJob, type JobStore } from '../workers/dispatcher/src/engine'

function job(id: string, jobType = 'test'): DurableJob {
  return { id, job_type: jobType, attempts: 1, max_attempts: 8, claim_token: `claim-${id}`, payload: {} }
}

function fakeStore(jobs: DurableJob[]) {
  const events: string[] = []
  const store: JobStore = {
    async claim(limit) { events.push(`claim:${limit}`); return jobs.slice(0, limit) },
    async finish(current, result) { events.push(`finish:${current.id}:${result}`); return true },
    async retry(current, code, at) { events.push(`retry:${current.id}:${code}:${at}`) },
  }
  return { store, events }
}

describe('durable job dispatcher', () => {
  it('finishes a claimed job after its handler succeeds', async () => {
    const fake = fakeStore([job('one')])
    const result = await dispatchBatch(fake.store, { test: async () => 'ok' })
    expect(result).toEqual({ claimed: 1, succeeded: 1, retried: 0 })
    expect(fake.events).toEqual(['claim:5', 'finish:one:ok'])
  })

  it('schedules a retry after a handler throws', async () => {
    const fake = fakeStore([job('one')])
    const result = await dispatchBatch(fake.store, { test: async () => { throw new Error('private detail') } }, () => 1_000)
    expect(result.retried).toBe(1)
    expect(fake.events).toContain('retry:one:handler_failed:1970-01-01T00:00:31.000Z')
    expect(fake.events.join(' ')).not.toContain('private detail')
  })

  it('keeps unimplemented job types durable and retries them without claiming success', async () => {
    const fake = fakeStore([job('one', 'send_email')])
    const result = await dispatchBatch(fake.store, {}, () => 0)
    expect(result).toEqual({ claimed: 1, succeeded: 0, retried: 1 })
    expect(fake.events[1]).toBe('retry:one:handler_not_configured:1970-01-02T00:00:00.000Z')
  })

  it('clamps batches and exponential backoff', async () => {
    const fake = fakeStore(Array.from({ length: 8 }, (_, index) => job(String(index))))
    await dispatchBatch(fake.store, { test: async () => 'ok' }, Date.now, 8)
    expect(fake.events[0]).toBe('claim:5')
    expect(retryDelayMs(1)).toBe(30_000)
    expect(retryDelayMs(100)).toBe(6 * 60 * 60 * 1000)
  })
})
