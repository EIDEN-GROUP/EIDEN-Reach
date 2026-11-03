import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { summarizeDealValue } from '../lib/dashboard-metrics'

type StageRow = { id: string; name: string; position: number }
type DealRow = { stage_id: string; amount: number | null; currency: string; status: string }

export function AnalyticsPanel({ userId }: { userId: string }) {
  // orgId is derived from membership but not stored; queries use membership.data.organization_id directly.
  // pipelineId is not needed; stages are loaded from the default pipeline.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contacts, setContacts] = useState(0)
  const [companies, setCompanies] = useState(0)
  const [tasksOpen, setTasksOpen] = useState(0)
  const [tasksDue, setTasksDue] = useState(0)
  const [deals, setDeals] = useState<DealRow[]>([])
  const [stages, setStages] = useState<StageRow[]>([])
  const [activityCount, setActivityCount] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      const pipe = await supabase!.from('pipelines').select('id').eq('organization_id', membership.data.organization_id).eq('is_default', true).maybeSingle()
      // stages are loaded below from pipe.data.

      const [contactRes, companyRes, taskRes, dealRes, stageRes, activityRes] = await Promise.all([
        supabase!.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', membership.data.organization_id).is('archived_at', null),
        supabase!.from('companies').select('id', { count: 'exact', head: true }).eq('organization_id', membership.data.organization_id).is('archived_at', null),
        supabase!.from('tasks').select('id,status,due_at').eq('organization_id', membership.data.organization_id),
        supabase!.from('deals').select('stage_id,amount,currency,status').eq('organization_id', membership.data.organization_id).is('archived_at', null),
        pipe.data ? supabase!.from('pipeline_stages').select('id,name,position').eq('pipeline_id', pipe.data.id).order('position') : Promise.resolve({ data: [], error: null }),
        supabase!.from('activity_events').select('id', { count: 'exact', head: true }).eq('organization_id', membership.data.organization_id),
      ])
      if (!active) return
      if (contactRes.error || companyRes.error || taskRes.error || dealRes.error) { setError('Analytics could not be loaded.'); setLoading(false); return }
      setContacts(contactRes.count ?? 0)
      setCompanies(companyRes.count ?? 0)
      const tasks = (taskRes.data ?? []) as { status: string; due_at: string | null }[]
      setTasksOpen(tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length)
      const now = new Date().toISOString()
      setTasksDue(tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.due_at && t.due_at <= now).length)
      setDeals((dealRes.data ?? []) as DealRow[])
      setStages((stageRes.data ?? []) as StageRow[])
      setActivityCount(activityRes.count ?? 0)
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

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Analytics</h2><p>Workspace performance from connected, verified data.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading analytics...</div> : <>
      <div className="metric-grid">
        {[['Contacts', contacts], ['Companies', companies], ['Open deals', openDeals.length], ['Open value', formatValues(totalOpenValue)], ['Won deals', wonDeals.length], ['Won value', formatValues(totalWonValue)], ['Open tasks', tasksOpen], ['Tasks due', tasksDue], ['Activity events', activityCount]].map(([label, value]) => <div className="metric panel" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {stages.length > 0 && <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Stage</th><th>Deals</th><th>Value</th></tr></thead><tbody>{stages.map(stage => {
        const stageDeals = deals.filter(d => d.stage_id === stage.id)
        const value = summarizeDealValue(stageDeals)
        return <tr key={stage.id}><td>{stage.name}</td><td>{stageDeals.length}</td><td>{formatValues(value)}</td></tr>
      })}</tbody></table></div>}
    </>}
  </section>
}
