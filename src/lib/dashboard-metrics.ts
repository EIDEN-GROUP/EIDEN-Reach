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
