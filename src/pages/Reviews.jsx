import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import './Reviews.css'

// ── Helpers ───────────────────────────────────────────────────
function fmt(n, unit) { return `${n} ${unit}${n !== 1 ? 's' : ''}` }
function fmtMins(m) {
  if (!m) return '—'
  const h = Math.floor(m / 60), r = m % 60
  return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${r}m`
}
function useDebounce(fn, delay) {
  const t = useRef(null)
  return useCallback((...args) => {
    clearTimeout(t.current)
    t.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

// ── Period math ───────────────────────────────────────────────
function getWeekBounds(offset = 0) {
  const now = new Date()
  const mon = new Date(now)
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { start: mon, end: sun }
}
function getMonthBounds(offset = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start, end }
}
function getQuarterBounds(offset = 0) {
  const now = new Date()
  const q   = Math.floor(now.getMonth() / 3) + offset
  const yr  = now.getFullYear() + Math.floor(q / 4)
  const qn  = ((q % 4) + 4) % 4
  const start = new Date(yr, qn * 3, 1)
  const end   = new Date(yr, qn * 3 + 3, 0)
  return { start, end, label: `Q${qn + 1} ${yr}` }
}
function getYearBounds(offset = 0) {
  const yr = new Date().getFullYear() + offset
  return { start: new Date(yr, 0, 1), end: new Date(yr, 11, 31), label: `${yr}` }
}
function ds(d) { return d.toISOString().split('T')[0] }
function inRange(dateStr, start, end) {
  if (!dateStr) return false
  const d = new Date(dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr)
  return d >= start && d <= end
}
function fmtPeriodLabel(type, start, end, extra) {
  const opts = { month: 'short', day: 'numeric' }
  if (type === 'weekly')    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
  if (type === 'monthly')   return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  if (type === 'quarterly') return extra?.label || ''
  if (type === 'yearly')    return extra?.label || ''
  return ''
}

// ── Stats loader ──────────────────────────────────────────────
async function loadStatsForPeriod(userId, start, end) {
  const s = ds(start), e = ds(end)
  const [tasksRes, routinesRes, focusRes, healthRes] = await Promise.all([
    supabase.from('tasks').select('id,status,updated_at').eq('user_id', userId),
    supabase.from('routine_logs').select('id,status,actual_duration_min,started_at').eq('user_id', userId),
    supabase.from('focus_sessions').select('id,duration_min,started_at').eq('user_id', userId),
    supabase.from('health_logs').select('id,date,water_ml,water_goal_ml,sleep_score,energy_level,mood').eq('user_id', userId),
  ])
  const tasks    = (tasksRes.data || [])
  const routines = (routinesRes.data || [])
  const focus    = (focusRes.data || [])
  const health   = (healthRes.data || [])

  const doneTasks     = tasks.filter(t => t.status === 'done' && inRange(t.updated_at, start, end))
  const doneRoutines  = routines.filter(r => r.status === 'completed' && inRange(r.started_at, start, end))
  const focusSessions = focus.filter(f => inRange(f.started_at, start, end))
  const healthLogs    = health.filter(h => inRange(h.date + 'T12:00:00', start, end))
  const waterGoalHits = healthLogs.filter(h => h.water_ml >= (h.water_goal_ml || 2000)).length
  const focusMins     = focusSessions.reduce((a, f) => a + (f.duration_min || 0), 0)
  const routineMins   = doneRoutines.reduce((a, r) => a + (r.actual_duration_min || 0), 0)
  const avgSleep      = healthLogs.filter(h => h.sleep_score).length
    ? Math.round(healthLogs.filter(h => h.sleep_score).reduce((a, h) => a + h.sleep_score, 0) / healthLogs.filter(h => h.sleep_score).length)
    : null
  const avgEnergy     = healthLogs.filter(h => h.energy_level).length
    ? Math.round(healthLogs.filter(h => h.energy_level).reduce((a, h) => a + h.energy_level, 0) / healthLogs.filter(h => h.energy_level).length)
    : null
  return {
    tasksDone: doneTasks.length, routinesDone: doneRoutines.length,
    focusSessions: focusSessions.length, focusMins, routineMins,
    healthDays: healthLogs.length, waterGoalHits,
    avgSleep, avgEnergy,
  }
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ emoji, label, value, sub }) {
  return (
    <div className="rv-stat-card">
      <span className="rv-stat-emoji">{emoji}</span>
      <div className="rv-stat-val">{value}</div>
      <div className="rv-stat-label">{label}</div>
      {sub && <div className="rv-stat-sub">{sub}</div>}
    </div>
  )
}

// ── Reflection field ──────────────────────────────────────────
function ReflectField({ label, placeholder, value, onChange }) {
  return (
    <div className="rv-field">
      <label className="rv-field-label">{label}</label>
      <textarea className="rv-textarea" placeholder={placeholder}
        value={value || ''} onChange={e => onChange(e.target.value)} rows={3} />
    </div>
  )
}

// ── Mood / energy picker ──────────────────────────────────────
function RatingRow({ label, value, onChange }) {
  return (
    <div className="rv-rating-row">
      <span className="rv-rating-label">{label}</span>
      <div className="rv-rating-btns">
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n}
            className={`rv-rating-btn${value === n ? ' active' : ''}`}
            onClick={() => onChange(value === n ? null : n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}

// ── Single review period ──────────────────────────────────────
function ReviewPeriod({ userId, type, start, end, label }) {
  const [review,   setReview]   = useState(null)
  const [stats,    setStats]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved')

  useEffect(() => {
    if (!userId) return
    load()
  }, [userId, ds(start)])  // eslint-disable-line

  async function load() {
    setLoading(true)
    const [revRes, statsData] = await Promise.all([
      supabase.from('reviews').select('*')
        .eq('user_id', userId).eq('review_type', type).eq('period_start', ds(start))
        .maybeSingle(),
      loadStatsForPeriod(userId, start, end),
    ])
    setReview(revRes.data || {
      wins: '', challenges: '', learnings: '', gratitude: '',
      next_period_goals: '', intentions: '', highlights: '',
      mood_rating: null, energy_rating: null,
    })
    setStats(statsData)
    setLoading(false)
  }

  const persist = useCallback(async (data) => {
    if (!userId) return
    setSaveStatus('saving')
    await supabase.from('reviews').upsert({
      user_id: userId, review_type: type,
      period_start: ds(start), period_end: ds(end),
      ...data, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,review_type,period_start' })
    setSaveStatus('saved')
  }, [userId, type, start, end])

  const debouncedSave = useDebounce(persist, 1200)

  function update(field, val) {
    const next = { ...review, [field]: val }
    setReview(next)
    setSaveStatus('unsaved')
    debouncedSave(next)
  }

  if (loading) return <div className="rv-loading">Loading…</div>

  const isCurrentPeriod = ds(new Date()) >= ds(start) && ds(new Date()) <= ds(end)

  return (
    <div className="rv-period">
      <div className="rv-period-header">
        <div className="rv-period-label">{label}</div>
        {isCurrentPeriod && <span className="rv-current-badge">Current</span>}
        <span className={`rv-save-status ${saveStatus}`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? '●' : '✓ Saved'}
        </span>
      </div>

      {/* Auto stats */}
      {stats && (
        <div className="rv-stats-row">
          <StatCard emoji="✅" label="tasks done"     value={stats.tasksDone} />
          <StatCard emoji="🔁" label="routines done"  value={stats.routinesDone}
            sub={stats.routineMins > 0 ? fmtMins(stats.routineMins) : null} />
          <StatCard emoji="🎯" label="focus sessions" value={stats.focusSessions}
            sub={stats.focusMins > 0 ? fmtMins(stats.focusMins) : null} />
          <StatCard emoji="💚" label="health days"    value={stats.healthDays}
            sub={stats.waterGoalHits > 0 ? `💧×${stats.waterGoalHits}` : null} />
          {stats.avgSleep  && <StatCard emoji="😴" label="avg sleep score"  value={`${stats.avgSleep}%`} />}
          {stats.avgEnergy && <StatCard emoji="⚡" label="avg energy"       value={`${stats.avgEnergy}/100`} />}
        </div>
      )}

      {/* Mood + energy */}
      <div className="rv-ratings">
        <RatingRow label="Overall mood"   value={review.mood_rating}   onChange={v => update('mood_rating',   v)} />
        <RatingRow label="Overall energy" value={review.energy_rating} onChange={v => update('energy_rating', v)} />
      </div>

      {/* Reflection */}
      <div className="rv-fields">
        {(type === 'weekly' || type === 'monthly') && (
          <>
            <ReflectField label="🏆 Wins"          placeholder="What went well this period?"
              value={review.wins}       onChange={v => update('wins', v)} />
            <ReflectField label="🪨 Challenges"    placeholder="What was hard? What held you back?"
              value={review.challenges} onChange={v => update('challenges', v)} />
            <ReflectField label="💡 Learnings"     placeholder="What did you figure out or realise?"
              value={review.learnings}  onChange={v => update('learnings', v)} />
            <ReflectField label="🙏 Grateful for"  placeholder="3 things you're grateful for this period…"
              value={review.gratitude}  onChange={v => update('gratitude', v)} />
          </>
        )}
        {(type === 'monthly' || type === 'quarterly' || type === 'yearly') && (
          <ReflectField label="✨ Highlights"
            placeholder="Best moments, proudest achievements…"
            value={review.highlights} onChange={v => update('highlights', v)} />
        )}
        <ReflectField label={type === 'weekly' ? '🎯 Focus for next week' : '🎯 Goals for next period'}
          placeholder="What are you aiming for?"
          value={review.next_period_goals} onChange={v => update('next_period_goals', v)} />
        <ReflectField label="🌱 Intentions"
          placeholder="How do you want to show up? What energy do you want to carry?"
          value={review.intentions} onChange={v => update('intentions', v)} />
      </div>
    </div>
  )
}

// ── Main Reviews page ─────────────────────────────────────────
export default function Reviews({ userId }) {
  const [activeTab, setActiveTab] = useState('weekly')

  // Offsets for navigating periods
  const [weekOff,    setWeekOff]    = useState(0)
  const [monthOff,   setMonthOff]   = useState(0)
  const [quarterOff, setQuarterOff] = useState(0)
  const [yearOff,    setYearOff]    = useState(0)

  const tabs = [
    { key: 'weekly',    label: '📅 Weekly'    },
    { key: 'monthly',   label: '📆 Monthly'   },
    { key: 'quarterly', label: '🗓 Quarterly' },
    { key: 'yearly',    label: '🌟 Yearly'    },
  ]

  function renderContent() {
    if (activeTab === 'weekly') {
      const { start, end } = getWeekBounds(weekOff)
      return (
        <div>
          <PeriodNav offset={weekOff} setOffset={setWeekOff} maxOffset={0}
            label={fmtPeriodLabel('weekly', start, end)} />
          <ReviewPeriod key={weekOff} userId={userId} type="weekly"
            start={start} end={end} label={fmtPeriodLabel('weekly', start, end)} />
        </div>
      )
    }
    if (activeTab === 'monthly') {
      const { start, end } = getMonthBounds(monthOff)
      return (
        <div>
          <PeriodNav offset={monthOff} setOffset={setMonthOff} maxOffset={0}
            label={fmtPeriodLabel('monthly', start, end)} />
          <ReviewPeriod key={monthOff} userId={userId} type="monthly"
            start={start} end={end} label={fmtPeriodLabel('monthly', start, end)} />
        </div>
      )
    }
    if (activeTab === 'quarterly') {
      const bounds = getQuarterBounds(quarterOff)
      return (
        <div>
          <PeriodNav offset={quarterOff} setOffset={setQuarterOff} maxOffset={0}
            label={bounds.label} />
          <ReviewPeriod key={quarterOff} userId={userId} type="quarterly"
            start={bounds.start} end={bounds.end} label={bounds.label} />
        </div>
      )
    }
    if (activeTab === 'yearly') {
      const bounds = getYearBounds(yearOff)
      return (
        <div>
          <PeriodNav offset={yearOff} setOffset={setYearOff} maxOffset={0}
            label={bounds.label} />
          <ReviewPeriod key={yearOff} userId={userId} type="yearly"
            start={bounds.start} end={bounds.end} label={bounds.label} />
        </div>
      )
    }
  }

  return (
    <div className="rv-page">
      <div className="rv-header">
        <p className="page-tagline">Reflect. Adjust. Keep going.</p>
        <h1 className="page-title">Reviews</h1>
      </div>

      <div className="rv-tabs">
        {tabs.map(t => (
          <button key={t.key}
            className={`rv-tab${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="rv-content">
        {renderContent()}
      </div>
    </div>
  )
}

// ── Period navigator ──────────────────────────────────────────
function PeriodNav({ offset, setOffset, maxOffset, label }) {
  return (
    <div className="rv-period-nav">
      <button className="rv-nav-btn" onClick={() => setOffset(o => o - 1)}>‹ Prev</button>
      <span className="rv-nav-label">{label}</span>
      <button className="rv-nav-btn" onClick={() => setOffset(o => o + 1)}
        disabled={offset >= maxOffset}>Next ›</button>
    </div>
  )
}
