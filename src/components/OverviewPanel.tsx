import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, UsersRound } from 'lucide-react'
import { summarizeDealValue, taskUrgency, calculateSequenceKpis, formatKpi, type TaskUrgency, type SequenceKpis } from '../lib/dashboard-metrics'
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
  const [kpis, setKpis] = useState<SequenceKpis | null>(null)
  const [mailableSuppressed, setMailableSuppressed] = useState(0)

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

      const [contactResult, companyResult, sequenceResult, dealResult, taskResult, stageResult, enrollmentResult, activityResult, suppressionResult] = await Promise.all([
        supabase!.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('archived_at', null),
        supabase!.from('companies').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('archived_at', null),
        supabase!.from('sequences').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'active').is('archived_at', null),
        supabase!.from('deals').select('id,name,amount,currency,status,stage_id').eq('organization_id', organizationId).is('archived_at', null).order('created_at', { ascending: false }).limit(250),
        supabase!.from('tasks').select('id,title,due_at,status').eq('organization_id', organizationId).in('status', ['open', 'in_progress']).order('due_at', { ascending: true, nullsFirst: false }).limit(8),
        pipeline.data
          ? supabase!.from('pipeline_stages').select('id,name,position,probability').eq('pipeline_id', pipeline.data.id).order('position')
          : Promise.resolve({ data: [] as Stage[], error: null }),
        supabase!.from('sequence_enrollments').select('state,stop_reason,next_step_position').eq('organization_id', organizationId).limit(2001),
        supabase!.from('activity_events').select('event_type', { count: 'exact' }).eq('organization_id', organizationId).ilike('event_type', '%sent%').limit(1),
        supabase!.from('suppression_records').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      ])

      let stepStates: Array<{ state: string }> = []
      if (enrollmentResult.data?.length) {
        const ids = (enrollmentResult.data as Array<{ id?: string }>).map(e => e.id).filter(Boolean) as string[]
        if (ids.length) {
          const ss = await supabase!.from('enrollment_step_states').select('state').in('enrollment_id', ids).limit(501)
          if (!ss.error && ss.data) stepStates = ss.data as Array<{ state: string }>
        }
      }

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
        const enrollments = (enrollmentResult.data ?? []) as Array<{ state: string; stop_reason?: string | null; next_step_position: number }>
        const sentCount = activityResult.count ?? 0
        setKpis(calculateSequenceKpis({ enrollments, stepStates, sentCount }))
        setMailableSuppressed(suppressionResult.count ?? 0)
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
  // outreachHealth — complements campaign analytics
  const outreachHealth = kpis ? [
    { label: 'Enrolled', value: formatKpi(kpis.enrolled), hint: `${formatKpi(kpis.active)} active`, tone: 'neutral' as const },
    { label: 'Emails sent', value: formatKpi(kpis.emailsSent), hint: `${formatKpi(kpis.emailsCompleted)} completed`, tone: 'neutral' as const },
    { label: 'Reply rate', value: formatKpi(kpis.replyRate, '%'), hint: `${formatKpi(kpis.replied)} replied`, tone: 'good' as const },
    { label: 'Positive reply', value: formatKpi(kpis.positiveReplyRate, '%'), hint: 'interested / contacted', tone: 'good' as const },
    { label: 'Bounce rate', value: formatKpi(kpis.bounceRate, '%'), hint: `${formatKpi(kpis.bounced)} bounced`, tone: (kpis.bounceRate && kpis.bounceRate > 5 ? 'bad' : 'neutral') as 'bad' | 'neutral' },
    { label: 'Unsubscribed', value: formatKpi(kpis.unsubscribed), hint: 'opted out', tone: 'neutral' as const },
    { label: 'Completion', value: formatKpi(kpis.completionRate, '%'), hint: `${formatKpi(kpis.completed)} finished`, tone: 'neutral' as const },
    { label: 'Failure rate', value: formatKpi(kpis.failureRate, '%'), hint: `${formatKpi(kpis.emailsFailed)} failed`, tone: (kpis.failureRate && kpis.failureRate > 5 ? 'bad' : 'neutral') as 'bad' | 'neutral' },
  ] : []

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

    {kpis && <section className="panel outreach-health" aria-label="Outreach health">
      <header className="panel-heading"><div><span className="section-kicker">Outreach health</span><h2>Sequence KPIs</h2></div><span className="quiet-label">{mailableSuppressed} suppressed</span></header>
      <div className="outreach-grid">{outreachHealth.map(m => (
        <div key={m.label} className={`outreach-card tone-${m.tone}`}><span>{m.label}</span><strong>{m.value}</strong><small>{m.hint}</small></div>
      ))}</div>
    </section>}
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
