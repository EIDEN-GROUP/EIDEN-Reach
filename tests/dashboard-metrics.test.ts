import { describe, expect, it } from 'vitest'
import { summarizeDealValue, taskUrgency } from '../src/lib/dashboard-metrics.ts'

describe('dashboard metric helpers', () => {
  it('keeps currencies separate instead of adding incompatible amounts', () => {
    expect(summarizeDealValue([
      { amount: 1_000, currency: 'USD' },
      { amount: 500, currency: 'USD' },
      { amount: 800, currency: 'EUR' },
      { amount: null, currency: 'USD' },
    ])).toEqual([
      { currency: 'EUR', amount: 800 },
      { currency: 'USD', amount: 1_500 },
    ])
  })

  it('classifies task urgency from a deterministic clock', () => {
    const now = new Date('2026-10-30T12:00:00.000Z')
    expect(taskUrgency(null, now)).toBe('unscheduled')
    expect(taskUrgency('2026-10-30T11:59:59.000Z', now)).toBe('overdue')
    expect(taskUrgency('2026-10-30T16:00:00.000Z', now)).toBe('today')
    expect(taskUrgency('2026-11-02T12:00:00.000Z', now)).toBe('upcoming')
  })
})
