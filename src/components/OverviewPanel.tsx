import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, UsersRound } from 'lucide-react'
import { summarizeDealValue, taskUrgency, type TaskUrgency } from '../lib/dashboard-metrics'
import { supabase } from '../lib/supabase'

type Deal = {
  id: string
  name: string
  amount: number | null
  currency: string
  status: 'open' | 'won' | 'lost'
  stage_id: string
}

type Task = {
  id: string
  title: string
  due_at: string | null
  status: string
}

type Stage = {
  id: string
  name: string
  position: number
  probability: number
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

const urgencyLabels: Record<TaskUrgency, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  unscheduled: 'Unscheduled',
}

export function OverviewPanel({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contacts, setContacts] = useState(0)
  const [companies, setCompanies] = useState(0)
  const [activeSequences, setActiveSequences] = useState(0)
  const [deals, setDeals] = useState<Deal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [stages, setStages] = useState<Stage[]>([])

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships')
        .select('organization_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) {
        setError('Your account is not assigned to a workspace.')
        setLoading(false)
        return
      }
      const organizationId = membership.data.organization_id
      const pipeline = await supabase!.from('pipelines')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_default', true)
        .maybeSingle()

      const [contactResult, companyResult, sequenceResult, dealResult, taskResult, stageResult] = await Promise.all([
        supabase!.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('archived_at', null),
        supabase!.from('companies').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('archived_at', null),
        supabase!.from('sequences').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'active').is('archived_at', null),
        supabase!.from('deals').select('id,name,amount,currency,status,stage_id').eq('organization_id', organizationId).is('archived_at', null).order('created_at', { ascending: false }).limit(250),
        supabase!.from('tasks').select('id,title,due_at,status').eq('organization_id', organizationId).in('status', ['open', 'in_progress']).order('due_at', { ascending: true, nullsFirst: false }).limit(8),
        pipeline.data
          ? supabase!.from('pipeline_stages').select('id,name,position,probability').eq('pipeline_id', pipeline.data.id).order('position')
          : Promise.resolve({ data: [] as Stage[], error: null }),
      ])

      if (!active) return
      const firstError = [contactResult, companyResult, sequenceResult, dealResult, taskResult, stageResult]
        .find(result => result.error)?.error
      if (firstError) {
        setError('The workspace brief could not be loaded. Refresh or check database permissions.')
      } else {
        setContacts(contactResult.count ?? 0)
        setCompanies(companyResult.count ?? 0)
        setActiveSequences(sequenceResult.count ?? 0)
        setDeals((dealResult.data ?? []) as Deal[])
        setTasks((taskResult.data ?? []) as Task[])
        setStages((stageResult.data ?? []) as Stage[])
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  const openDeals = deals.filter(deal => deal.status === 'open')
  const wonDeals = deals.filter(deal => deal.status === 'won')
  const openValue = useMemo(() => summarizeDealValue(openDeals), [openDeals])
  const now = new Date()
  const overdueTasks = tasks.filter(task => taskUrgency(task.due_at, now) === 'overdue').length

  if (loading) return <div className="overview-loading" aria-label="Loading workspace brief">
    <div className="skeleton-line wide" /><div className="skeleton-metrics" />
  </div>

  if (error) return <section className="panel state-panel"><span className="section-kicker">Workspace brief</span><h2>We could not assemble today’s brief</h2><p>{error}</p></section>

  return <div className="overview-layout">
    <section className="daily-brief">
      <div className="brief-copy">
        <span className="section-kicker">Today’s operating brief</span>
        <h2>Revenue work, without the noise.</h2>
        <p>{openDeals.length
          ? `${openDeals.length} open opportunities and ${tasks.length} next actions are in motion.`
          : 'Your workspace is ready. Add the first opportunity to start the revenue rhythm.'}</p>
      </div>
      <div className="brief-signal">
        <span>Attention</span>
        <strong>{overdueTasks}</strong>
        <small>overdue follow-up{overdueTasks === 1 ? '' : 's'}</small>
      </div>
    </section>

    <section className="metric-ledger" aria-label="Workspace metrics">
      <div className="metric-ledger-item"><UsersRound size={17} /><span>Relationships</span><strong>{contacts}</strong><small>{companies} companies</small></div>
      <div className="metric-ledger-item"><BriefcaseBusiness size={17} /><span>Open pipeline</span><strong>{openDeals.length}</strong><small>{openValue.length ? openValue.map(item => formatMoney(item.amount, item.currency)).join(' · ') : 'No valued deals'}</small></div>
      <div className="metric-ledger-item"><CheckCircle2 size={17} /><span>Won</span><strong>{wonDeals.length}</strong><small>closed opportunities</small></div>
      <div className="metric-ledger-item"><Clock3 size={17} /><span>Sequences live</span><strong>{activeSequences}</strong><small>active automations</small></div>
    </section>

    <div className="overview-workbench">
      <section className="panel operational-panel pipeline-pulse">
        <header className="panel-heading"><div><span className="section-kicker">Pipeline pulse</span><h2>Stage distribution</h2></div><span className="quiet-label">{openDeals.length} open</span></header>
        {stages.length ? <div className="stage-ledger">{stages.map(stage => {
          const stageDeals = openDeals.filter(deal => deal.stage_id === stage.id)
          const stageValue = summarizeDealValue(stageDeals)
          return <div className="stage-ledger-row" key={stage.id}>
            <div><span className="stage-index">{String(stage.position + 1).padStart(2, '0')}</span><b>{stage.name}</b></div>
            <div className="stage-track"><i style={{ width: `${openDeals.length ? Math.max(4, (stageDeals.length / openDeals.length) * 100) : 0}%` }} /></div>
            <strong>{stageDeals.length}</strong>
            <small>{stageValue.map(item => formatMoney(item.amount, item.currency)).join(' · ') || '—'}</small>
          </div>
        })}</div> : <div className="state-inline">No default pipeline stages are configured.</div>}
      </section>

      <section className="panel operational-panel focus-queue">
        <header className="panel-heading"><div><span className="section-kicker">Focus queue</span><h2>Next actions</h2></div><span className="quiet-label">{tasks.length} visible</span></header>
        {tasks.length ? <ol className="focus-list">{tasks.map(task => {
          const urgency = taskUrgency(task.due_at, now)
          return <li key={task.id}><span className={`urgency-mark ${urgency}`} /><div><b>{task.title}</b><small>{task.due_at ? new Date(task.due_at).toLocaleString() : 'No due date'}</small></div><span className={`status-chip ${urgency}`}>{urgencyLabels[urgency]}</span><ArrowRight size={15} /></li>
        })}</ol> : <div className="state-inline"><CheckCircle2 size={18} /><span>No open follow-ups. Your queue is clear.</span></div>}
      </section>
    </div>
  </div>
}
