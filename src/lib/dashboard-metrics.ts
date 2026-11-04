export function summarizeDealValue(deals: Array<{ amount: number | null; currency: string }>) {
  const totals = new Map<string, number>()
  for (const deal of deals) {
    if (deal.amount === null || !Number.isFinite(Number(deal.amount))) continue
    const currency = deal.currency.toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + Number(deal.amount))
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }))
}

export type TaskUrgency = 'overdue' | 'today' | 'upcoming' | 'unscheduled'

export function taskUrgency(dueAt: string | null, now = new Date()): TaskUrgency {
  if (!dueAt) return 'unscheduled'
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return 'unscheduled'
  if (due.getTime() < now.getTime()) return 'overdue'
  if (
    due.getUTCFullYear() === now.getUTCFullYear()
    && due.getUTCMonth() === now.getUTCMonth()
    && due.getUTCDate() === now.getUTCDate()
  ) return 'today'
  return 'upcoming'
}

export type SequenceKpis = {
  enrolled: number
  active: number
  waiting: number
  replied: number
  completed: number
  bounced: number
  unsubscribed: number
  failed: number
  emailsSent: number
  emailsCompleted: number
  emailsFailed: number
  replyRate: number | null
  positiveReplyRate: number | null
  bounceRate: number | null
  completionRate: number | null
  failureRate: number | null
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return (numerator / denominator) * 100
}

export function calculateSequenceKpis(input: {
  enrollments: Array<{ state: string; stop_reason?: string | null }>
  stepStates: Array<{ state: string }>
  sentCount: number
}): SequenceKpis {
  const { enrollments, stepStates, sentCount } = input
  const count = (states: string[]) => enrollments.filter(e => states.includes(e.state)).length

  const replied = count(['replied', 'interested'])
  const bounced = enrollments.filter(e => e.state === 'bounced' || e.stop_reason === 'email_bounce' || e.stop_reason === 'hard_bounce' || e.stop_reason === 'bounce').length
  const unsubscribed = enrollments.filter(e => e.state === 'unsubscribed' || e.stop_reason === 'unsubscribe' || e.stop_reason === 'opt_out').length
  const failed = enrollments.filter(e => e.state === 'failed' || e.stop_reason === 'execution_failed').length
  const completed = count(['completed'])
  const emailsFailed = stepStates.filter(s => s.state === 'failed').length
  const emailsCompleted = stepStates.filter(s => s.state === 'completed').length

  const contacted = enrollments.filter(e => !['pending', 'paused'].includes(e.state) || (e as { next_step_position?: number }).next_step_position! > 0).length || sentCount

  return {
    enrolled: enrollments.length,
    active: count(['active', 'sending']),
    waiting: count(['pending', 'waiting', 'paused']),
    replied,
    completed,
    bounced,
    unsubscribed,
    failed,
    emailsSent: sentCount,
    emailsCompleted,
    emailsFailed,
    replyRate: pct(replied, contacted),
    positiveReplyRate: pct(count(['interested']), contacted),
    bounceRate: pct(bounced, sentCount || contacted),
    completionRate: pct(completed, enrollments.length),
    failureRate: pct(emailsFailed, emailsCompleted + emailsFailed || sentCount),
  }
}

export function formatKpi(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) return '—'
  if (suffix === '%') return `${value.toFixed(1)}%`
  return value.toLocaleString() + suffix
}
