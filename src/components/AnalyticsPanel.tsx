import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { summarizeDealValue, calculateSequenceKpis, formatKpi } from '../lib/dashboard-metrics'
import type { SequenceKpis } from '../lib/dashboard-metrics'

type StageRow = { id: string; name: string; position: number }
type DealRow = { stage_id: string; amount: number | null; currency: string; status: string }
type EnrollmentRow = { state: string; stop_reason?: string | null; next_step_position: number; enrolled_at: string }

export function AnalyticsPanel({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contacts, setContacts] = useState(0)
  const [companies, setCompanies] = useState(0)
  const [tasksOpen, setTasksOpen] = useState(0)
  const [tasksDue, setTasksDue] = useState(0)
  const [deals, setDeals] = useState<DealRow[]>([])
  const [stages, setStages] = useState<StageRow[]>([])
  const [activityCount, setActivityCount] = useState(0)
  const [kpis, setKpis] = useState<SequenceKpis | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([])
  const [suppressed, setSuppressed] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      const orgId = membership.data.organization_id
      const pipe = await supabase!.from('pipelines').select('id').eq('organization_id', orgId).eq('is_default', true).maybeSingle()

      const [contactRes, companyRes, taskRes, dealRes, stageRes, activityRes, enrollRes, sentRes, suppRes] = await Promise.all([
        supabase!.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('archived_at', null),
        supabase!.from('companies').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('archived_at', null),
        supabase!.from('tasks').select('id,status,due_at').eq('organization_id', orgId),
        supabase!.from('deals').select('stage_id,amount,currency,status').eq('organization_id', orgId).is('archived_at', null),
        pipe.data ? supabase!.from('pipeline_stages').select('id,name,position').eq('pipeline_id', pipe.data.id).order('position') : Promise.resolve({ data: [], error: null }),
        supabase!.from('activity_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase!.from('sequence_enrollments').select('state,stop_reason,next_step_position,enrolled_at,contact_id').eq('organization_id', orgId).limit(2001),
        supabase!.from('activity_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).ilike('event_type', '%sent%'),
        supabase!.from('suppression_records').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      ])
      if (!active) return
      if (contactRes.error || companyRes.error || taskRes.error || dealRes.error) { setError('Analytics could not be loaded.'); setLoading(false); return }

      let stepStates: Array<{ state: string }> = []
      const enrollRows = (enrollRes.data ?? []) as EnrollmentRow[]
      if (enrollRows.length) {
        // enrollRes didn't fetch id; stepStates via enrollment lookup is optional fallback
        stepStates = []
      }

      setContacts(contactRes.count ?? 0)
      setCompanies(companyRes.count ?? 0)
      const tasks = (taskRes.data ?? []) as { status: string; due_at: string | null }[]
      setTasksOpen(tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length)
      const now = new Date().toISOString()
      setTasksDue(tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.due_at && t.due_at <= now).length)
      setDeals((dealRes.data ?? []) as DealRow[])
      setStages((stageRes.data ?? []) as StageRow[])
      setActivityCount(activityRes.count ?? 0)
      setEnrollments(enrollRows)
      setKpis(calculateSequenceKpis({ enrollments: enrollRows, stepStates, sentCount: sentRes.count ?? 0 }))
      setSuppressed(suppRes.count ?? 0)
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  const openDeals = deals.filter(d => d.status === 'open')
  const wonDeals = deals.filter(d => d.status === 'won')
  const totalOpenValue = summarizeDealValue(openDeals)
  const totalWonValue = summarizeDealValue(wonDeals)
  const formatValues = (values: ReturnType<typeof summarizeDealValue>) => values.length
    ? values.map(item => new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: 0 }).format(item.amount)).join(' · ')
    : '—'

  const kpiCards = kpis ? [
    ['Enrolled contacts', formatKpi(kpis.enrolled)],
    ['Active', formatKpi(kpis.active)],
    ['Waiting', formatKpi(kpis.waiting)],
    ['Emails sent', formatKpi(kpis.emailsSent)],
    ['Replied', formatKpi(kpis.replied)],
    ['Reply rate', formatKpi(kpis.replyRate, '%')],
    ['Positive reply rate', formatKpi(kpis.positiveReplyRate, '%')],
    ['Bounced', formatKpi(kpis.bounced)],
    ['Bounce rate', formatKpi(kpis.bounceRate, '%')],
    ['Unsubscribed', formatKpi(kpis.unsubscribed)],
    ['Completed', formatKpi(kpis.completed)],
    ['Completion rate', formatKpi(kpis.completionRate, '%')],
    ['Failed (enrollments)', formatKpi(kpis.failed)],
    ['Failure rate', formatKpi(kpis.failureRate, '%')],
    ['Suppressed', formatKpi(suppressed)],
  ] : []

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Analytics</h2><p>Workspace performance from connected, verified data. Sequence KPIs use unique contacts where applicable.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading analytics...</div> : <>
      <div className="metric-grid">
        {[['Contacts', contacts], ['Companies', companies], ['Open deals', openDeals.length], ['Open value', formatValues(totalOpenValue)], ['Won deals', wonDeals.length], ['Won value', formatValues(totalWonValue)], ['Open tasks', tasksOpen], ['Tasks due', tasksDue], ['Activity events', activityCount]].map(([label, value]) => <div className="metric panel" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {kpis && <>
        <h3 style={{ margin: '20px 0 8px' }}>Sequence KPIs</h3>
        <div className="metric-grid">{kpiCards.map(([label, value]) => <div className="metric panel" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
        {enrollments.length > 0 && <div className="contact-table-wrap" style={{ marginTop: 16 }}><table className="contact-table"><thead><tr><th>State</th><th>Count</th></tr></thead><tbody>{Array.from(new Set(enrollments.map(e => e.state))).sort().map(s => <tr key={s}><td>{s}</td><td>{enrollments.filter(e => e.state === s).length}</td></tr>)}</tbody></table></div>}
      </>}
      {stages.length > 0 && <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Stage</th><th>Deals</th><th>Value</th></tr></thead><tbody>{stages.map(stage => {
        const stageDeals = deals.filter(d => d.stage_id === stage.id)
        const value = summarizeDealValue(stageDeals)
        return <tr key={stage.id}><td>{stage.name}</td><td>{stageDeals.length}</td><td>{formatValues(value)}</td></tr>
      })}</tbody></table></div>}
    </>}
  </section>
}
