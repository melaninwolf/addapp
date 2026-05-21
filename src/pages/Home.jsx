import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { getXP, getLevel, getXPIntoLevel,
         getMatter, getAntimatter, getMatterProgress, getAntimatterProgress,
         getAUTraveled, getCurrentDestination, getNextDestination } from '../xp'
import './Home.css'

// ── ADHD-friendly sub-greetings ────────────────────────────────
const SUB = {
  early:     ['Slow burn.', 'Easy start.', 'One breath first.'],
  morning:   ['You\'ve got time.', 'One thing at a time.', 'No rush.'],
  afternoon: ['Still going.', 'Good pace.', 'Keep the thread.'],
  evening:   ['Winding down.', 'Rest is productive.', 'What landed today?'],
}
function getSub(h) {
  const pool = h < 8 ? SUB.early : h < 12 ? SUB.morning : h < 17 ? SUB.afternoon : SUB.evening
  return pool[new Date().getDate() % pool.length]
}

// ── Key orbit waypoints ────────────────────────────────────────
const ORBIT_STOPS = [
  { name: 'Moon',    emoji: '🌕', au: 0.0026 },
  { name: 'Mars',    emoji: '🔴', au: 0.52   },
  { name: 'Jupiter', emoji: '🟠', au: 4.2    },
  { name: 'Saturn',  emoji: '💫', au: 8.5    },
]

// ── Orbit map SVG ──────────────────────────────────────────────
function OrbitMap({ au }) {
  const n     = ORBIT_STOPS.length
  const pcts  = ORBIT_STOPS.map((_, i) => i / (n - 1))          // 0 → 1 evenly
  const maxAu = ORBIT_STOPS[n - 1].au

  // Which segment are we in?
  let posX = 0
  const idx = ORBIT_STOPS.reduce((acc, s, i) => (au >= s.au ? i : acc), 0)
  if (idx < n - 1) {
    const frac = (au - ORBIT_STOPS[idx].au) / (ORBIT_STOPS[idx + 1].au - ORBIT_STOPS[idx].au)
    posX = pcts[idx] + Math.min(frac, 1) * (pcts[idx + 1] - pcts[idx])
  } else {
    posX = 1
  }

  const W = 360, PAD = 20
  const trackW = W - PAD * 2
  const cx = x => PAD + x * trackW

  return (
    <svg viewBox={`0 0 ${W} 64`} className="orbit-svg" aria-hidden="true">
      {/* Background track */}
      <line x1={cx(0)} y1={28} x2={cx(1)} y2={28} stroke="var(--border2)" strokeWidth="1.5" />

      {/* Completed track */}
      <line x1={cx(0)} y1={28} x2={cx(posX)} y2={28}
        stroke="var(--accent)" strokeWidth="2"
        strokeLinecap="round" />

      {/* Milestone dots */}
      {ORBIT_STOPS.map((stop, i) => {
        const x       = cx(pcts[i])
        const visited = au >= stop.au
        return (
          <g key={stop.name}>
            <circle cx={x} cy={28} r={5}
              fill={visited ? 'var(--accent)' : 'var(--bg3)'}
              stroke={visited ? 'var(--accent)' : 'var(--border2)'}
              strokeWidth="1.5" />
            <text x={x} y={50} textAnchor="middle" fontSize="9"
              fill={visited ? 'var(--text2)' : 'var(--text3)'}
              fontFamily="inherit">
              {stop.name}
            </text>
          </g>
        )
      })}

      {/* Current position — glowing dot */}
      <circle cx={cx(posX)} cy={28} r={9} fill="var(--accent)" opacity="0.18" />
      <circle cx={cx(posX)} cy={28} r={5.5} fill="var(--accent)" />
      <circle cx={cx(posX)} cy={28} r={2.5} fill="#fff" opacity="0.85" />
    </svg>
  )
}

// ── Stats helpers ──────────────────────────────────────────────
function fmtMins(m) {
  if (!m) return '—'
  const h   = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}m`
  if (rem === 0) return `${h}h`
  return `${h}h ${rem}m`
}

function parseLocalDate(str) {
  if (!str) return new Date(0)
  if (str.length === 10) {
    const [y, mo, d] = str.split('-').map(Number)
    return new Date(y, mo - 1, d)
  }
  return new Date(str)
}

function computeStreak(dateStrings) {
  const s = new Set(dateStrings)
  const today = new Date()
  let cursor = new Date(today)
  // If today has no entry yet, start from yesterday
  if (!s.has(cursor.toISOString().split('T')[0])) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  for (let i = 0; i < 400; i++) {
    const ds = cursor.toISOString().split('T')[0]
    if (s.has(ds)) { streak++; cursor.setDate(cursor.getDate() - 1) }
    else break
  }
  return streak
}

function hobbyStage(mins) {
  if (mins >= 360) return 'mature'
  if (mins >= 120) return 'growing'
  if (mins >= 10)  return 'sapling'
  return 'seed'
}

// ── Stats grid ─────────────────────────────────────────────────
function StatsGrid({ userId }) {
  const [period,  setPeriod]  = useState('week')
  const [raw,     setRaw]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    loadAll()
  }, [userId]) // eslint-disable-line

  async function loadAll() {
    const [rLogs, tasks, projects, focus, health, hobbies] = await Promise.all([
      supabase.from('routine_logs').select('id,status,actual_duration_min,started_at').eq('user_id', userId),
      supabase.from('tasks').select('id,status,updated_at').eq('user_id', userId),
      supabase.from('projects').select('id,status').eq('user_id', userId),
      supabase.from('focus_sessions').select('id,duration_min,started_at').eq('user_id', userId),
      supabase.from('health_logs').select('id,date,water_ml,water_goal_ml').eq('user_id', userId),
      supabase.from('hobbies').select('id,name,total_minutes').eq('user_id', userId),
    ])
    setRaw({
      routineLogs: rLogs.data    || [],
      tasks:       tasks.data    || [],
      projects:    projects.data || [],
      focus:       focus.data    || [],
      health:      health.data   || [],
      hobbies:     hobbies.data  || [],
    })
    setLoading(false)
  }

  if (loading) return <div className="stats-loading">Loading stats…</div>
  if (!raw)    return null

  // Period boundaries
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  function inPeriod(dateStr) {
    const d = parseLocalDate(dateStr)
    if (period === 'week')  return d >= weekStart
    if (period === 'month') return d >= monthStart
    return true
  }

  // ── Routines ──
  const completedLogs    = raw.routineLogs.filter(r => r.status === 'completed')
  const routinesInPeriod = completedLogs.filter(r => inPeriod(r.started_at))
  const routineMins      = routinesInPeriod.reduce((a, r) => a + (r.actual_duration_min || 0), 0)
  const routineDates     = completedLogs.map(r => r.started_at?.split('T')[0]).filter(Boolean)
  const routineStreak    = computeStreak(routineDates)

  // ── Tasks ──
  const doneTasks       = raw.tasks.filter(t => t.status === 'done')
  const doneInPeriod    = doneTasks.filter(t => inPeriod(t.updated_at)).length
  const completionRate  = raw.tasks.length > 0
    ? Math.round((doneTasks.length / raw.tasks.length) * 100) : 0
  const liveProjects    = raw.projects.filter(p => p.status !== 'done').length

  // ── Focus ──
  const focusInPeriod  = raw.focus.filter(s => inPeriod(s.started_at))
  const focusTotalMins = raw.focus.reduce((a, s) => a + (s.duration_min || 0), 0)
  const focusPeriodMins = focusInPeriod.reduce((a, s) => a + (s.duration_min || 0), 0)
  const avgFocus = focusInPeriod.length > 0
    ? Math.round(focusPeriodMins / focusInPeriod.length) : 0

  // ── Health ──
  const healthInPeriod = raw.health.filter(h => inPeriod(h.date))
  const waterHitsAll   = raw.health.filter(h => h.water_ml >= (h.water_goal_ml || 2000)).length
  const healthDates    = raw.health.map(h => h.date).filter(Boolean)
  const healthStreak   = computeStreak(healthDates)

  // ── Hobbies ──
  const totalHobbyMins = raw.hobbies.reduce((a, h) => a + (h.total_minutes || 0), 0)
  const matureCount    = raw.hobbies.filter(h => hobbyStage(h.total_minutes) === 'mature').length
  const growingCount   = raw.hobbies.filter(h => ['growing', 'sapling'].includes(hobbyStage(h.total_minutes))).length

  const PERIODS = [
    { key: 'week',  label: 'Week'  },
    { key: 'month', label: 'Month' },
    { key: 'all',   label: 'All'   },
  ]

  return (
    <div className="stats-section">
      <div className="stats-header">
        <span className="section-label">What you've built</span>
        <div className="stats-period-tabs">
          {PERIODS.map(p => (
            <button key={p.key}
              className={`stats-period-btn${period === p.key ? ' active' : ''}`}
              onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-grid">

        {/* Routines */}
        <div className="stats-card sc-routines">
          <div className="sc-head"><span>🔁</span> Routines</div>
          <div className="sc-stats">
            <div className="sc-stat">
              <span className="sc-val">{routinesInPeriod.length}</span>
              <span className="sc-lbl">done</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{routineMins > 0 ? fmtMins(routineMins) : '—'}</span>
              <span className="sc-lbl">logged</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{routineStreak > 0 ? `🔥${routineStreak}` : '—'}</span>
              <span className="sc-lbl">day streak</span>
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="stats-card sc-tasks">
          <div className="sc-head"><span>✅</span> Tasks</div>
          <div className="sc-stats">
            <div className="sc-stat">
              <span className="sc-val">{period === 'all' ? doneTasks.length : doneInPeriod}</span>
              <span className="sc-lbl">done</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{completionRate}%</span>
              <span className="sc-lbl">rate</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{liveProjects}</span>
              <span className="sc-lbl">projects</span>
            </div>
          </div>
        </div>

        {/* Focus */}
        <div className="stats-card sc-focus">
          <div className="sc-head"><span>🎯</span> Focus</div>
          <div className="sc-stats">
            <div className="sc-stat">
              <span className="sc-val">{focusInPeriod.length}</span>
              <span className="sc-lbl">sessions</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{fmtMins(period === 'all' ? focusTotalMins : focusPeriodMins)}</span>
              <span className="sc-lbl">total time</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{avgFocus > 0 ? `${avgFocus}m` : '—'}</span>
              <span className="sc-lbl">avg length</span>
            </div>
          </div>
        </div>

        {/* Health */}
        <div className="stats-card sc-health">
          <div className="sc-head"><span>💚</span> Health</div>
          <div className="sc-stats">
            <div className="sc-stat">
              <span className="sc-val">{healthInPeriod.length}</span>
              <span className="sc-lbl">days logged</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{waterHitsAll}</span>
              <span className="sc-lbl">💧 goal hits</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{healthStreak > 0 ? `🔥${healthStreak}` : '—'}</span>
              <span className="sc-lbl">day streak</span>
            </div>
          </div>
        </div>

        {/* Hobbies — full width */}
        <div className="stats-card sc-hobbies sc-wide">
          <div className="sc-head"><span>🌳</span> Hobbies</div>
          <div className="sc-stats">
            <div className="sc-stat">
              <span className="sc-val">{raw.hobbies.length}</span>
              <span className="sc-lbl">active</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{fmtMins(totalHobbyMins)}</span>
              <span className="sc-lbl">total time</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{matureCount}</span>
              <span className="sc-lbl">🌳 mature</span>
            </div>
            <div className="sc-stat">
              <span className="sc-val">{growingCount}</span>
              <span className="sc-lbl">🌱 growing</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Today section ──────────────────────────────────────────────
function TodaySection({ userId }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    load()
  }, [userId]) // eslint-disable-line

  async function load() {
    const today   = new Date().toISOString().split('T')[0]
    const dayOfWk = new Date().getDay() // 0=Sun

    const [routRes, taskRes] = await Promise.all([
      supabase.from('routines').select('id,title,time_of_day,steps')
        .eq('user_id', userId).contains('repeat_days', [dayOfWk])
        .order('time_of_day', { nullsFirst: false }).limit(4),
      supabase.from('tasks').select('id,title,priority')
        .eq('user_id', userId).eq('due_date', today)
        .neq('status', 'done').order('sort_order').limit(3),
    ])

    const routines = (routRes.data || []).map(r => ({
      id:    'r-' + r.id,
      type:  'routine',
      time:  r.time_of_day ? r.time_of_day.slice(0, 5) : null,
      title: r.title,
      sub:   Array.isArray(r.steps) && r.steps[0] ? r.steps[0].title : null,
      to:    '/routines',
    }))
    const tasks = (taskRes.data || []).map(t => ({
      id:    't-' + t.id,
      type:  'task',
      time:  null,
      title: t.title,
      sub:   t.priority ? `${t.priority} priority` : null,
      to:    '/tasks',
    }))

    // Merge, sort by time, cap at 3
    const all = [...routines, ...tasks]
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
      .slice(0, 3)

    setItems(all)
    setLoading(false)
  }

  if (loading) return <div className="today-empty">Loading…</div>
  if (!userId || items.length === 0) return (
    <div className="today-empty">Nothing scheduled — free day ✨</div>
  )

  return (
    <div className="today-list">
      {items.map(item => (
        <button key={item.id} className="today-item" onClick={() => navigate(item.to)}>
          {item.time && <span className="today-time">{item.time}</span>}
          <div className="today-item-body">
            <span className="today-item-title">{item.title}</span>
            {item.sub && <span className="today-item-sub">{item.sub}</span>}
          </div>
          <span className="today-item-arrow">→</span>
        </button>
      ))}
    </div>
  )
}

// ── Mission log ────────────────────────────────────────────────
function MissionLog({ userId }) {
  const [log, setLog] = useState([])

  useEffect(() => {
    if (!userId) return
    load()
  }, [userId]) // eslint-disable-line

  async function load() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [focusRes, taskRes] = await Promise.all([
      supabase.from('focus_sessions').select('id,started_at,duration_min,notes,project_id')
        .eq('user_id', userId).gte('started_at', since).order('started_at', { ascending: false }).limit(5),
      supabase.from('tasks').select('id,title,updated_at')
        .eq('user_id', userId).eq('status', 'done').gte('updated_at', since)
        .order('updated_at', { ascending: false }).limit(5),
    ])

    const focusItems = (focusRes.data || []).map(s => ({
      id:   'f-' + s.id,
      time: new Date(s.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      text: `${s.duration_min || 25}-min focus session`,
      sub:  s.notes || null,
      mam:  '+5g',
      isMatter: false,
    }))
    const taskItems = (taskRes.data || []).map(t => ({
      id:   'ta-' + t.id,
      time: new Date(t.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      text: t.title,
      sub:  'Task done',
      mam:  '+10g',
      isMatter: true,
    }))

    const all = [...focusItems, ...taskItems]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 6)

    setLog(all)
  }

  if (log.length === 0) return (
    <div className="today-empty">No activity yet today — get that first gram 🚀</div>
  )

  return (
    <div className="mission-log-list">
      {log.map(item => (
        <div key={item.id} className="log-row">
          <span className="log-time">{item.time}</span>
          <div className="log-body">
            <span className="log-text">{item.text}</span>
            {item.sub && <span className="log-sub">{item.sub}</span>}
          </div>
          <span className={`log-mam${item.isMatter ? ' matter' : ' anti'}`}>{item.mam} {item.isMatter ? 'matter' : 'antimatter'}</span>
        </div>
      ))}
    </div>
  )
}

// ── Quick capture modal ────────────────────────────────────────
function CaptureModal({ userId, onClose }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!text.trim() || !userId || saving) return
    setSaving(true)
    await supabase.from('tasks').insert({
      user_id: userId, title: text.trim(),
      status: 'backlog', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    setSaving(false)
    onClose()
  }

  function onKey(e) {
    if (e.key === 'Enter')  save()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="capture-backdrop" onClick={onClose}>
      <div className="capture-modal" onClick={e => e.stopPropagation()}>
        <div className="capture-label">Quick capture</div>
        <input
          className="capture-input"
          placeholder="What's on your mind…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKey}
          autoFocus
        />
        <div className="capture-hint">Enter to save · Esc to dismiss · Saves to Backlog</div>
      </div>
    </div>
  )
}


// ── Badge definitions ─────────────────────────────────────────
const BADGE_DEFS = [
  { key:'first_task',      emoji:'✅', name:'First Launch',      desc:'Complete your first task' },
  { key:'tasks_10',        emoji:'🔟', name:'Momentum',          desc:'10 tasks done' },
  { key:'tasks_50',        emoji:'💯', name:'Executor',          desc:'50 tasks done' },
  { key:'tasks_100',       emoji:'🏆', name:'Century',           desc:'100 tasks done' },
  { key:'first_routine',   emoji:'🔁', name:'First Ritual',      desc:'Complete a routine' },
  { key:'streak_7',        emoji:'🔥', name:'Week Streak',       desc:'7-day routine streak' },
  { key:'streak_30',       emoji:'🌋', name:'Month Streak',      desc:'30-day routine streak' },
  { key:'first_focus',     emoji:'🎯', name:'Zone In',           desc:'First focus session' },
  { key:'focus_10h',       emoji:'⏱',  name:'Deep Worker',       desc:'10 hours of focus' },
  { key:'first_journal',   emoji:'📓', name:'Inner Voice',       desc:'First journal entry' },
  { key:'journal_30',      emoji:'📚', name:'Chronicler',        desc:'30 journal entries' },
  { key:'first_hobby',     emoji:'🌱', name:'New Leaf',          desc:'Log a hobby session' },
  { key:'hobby_10h',       emoji:'🌳', name:'Dedicated',         desc:'10 hours on a hobby' },
  { key:'water_7',         emoji:'💧', name:'Hydrated',          desc:'Water goal 7 days running' },
  { key:'first_project',   emoji:'📁', name:'Builder',           desc:'Create a project' },
  { key:'project_done',    emoji:'🎖', name:'Shipped',           desc:'Complete a project' },
  { key:'level_10',        emoji:'🚀', name:'Liftoff',           desc:'Reach level 10' },
  { key:'level_25',        emoji:'🌕', name:'Moonwalker',        desc:'Reach level 25' },
  { key:'first_review',    emoji:'🔍', name:'Reflector',         desc:'Complete a review' },
  { key:'brain_dump_10',   emoji:'🧠', name:'Mind Cleared',      desc:'10 brain dump items' },
]

// ── Badge checker (pure, no side effects) ─────────────────────
function checkEarned(key, data) {
  const { doneTasks, routineLogs, focusSessions, journals, projects, badges, xp, brainItems } = data
  const streak = computeStreakFromLogs(routineLogs)
  switch (key) {
    case 'first_task':    return doneTasks >= 1
    case 'tasks_10':      return doneTasks >= 10
    case 'tasks_50':      return doneTasks >= 50
    case 'tasks_100':     return doneTasks >= 100
    case 'first_routine': return routineLogs >= 1
    case 'streak_7':      return streak >= 7
    case 'streak_30':     return streak >= 30
    case 'first_focus':   return focusSessions.count >= 1
    case 'focus_10h':     return focusSessions.totalMins >= 600
    case 'first_journal': return journals >= 1
    case 'journal_30':    return journals >= 30
    case 'first_hobby':   return data.hobbySessions >= 1
    case 'hobby_10h':     return data.hobbyMins >= 600
    case 'water_7':       return data.waterStreak >= 7
    case 'first_project': return projects.total >= 1
    case 'project_done':  return projects.done >= 1
    case 'level_10':      return xp >= 1000
    case 'level_25':      return xp >= 2500
    case 'first_review':  return data.reviews >= 1
    case 'brain_dump_10': return brainItems >= 10
    default: return false
  }
}

function computeStreakFromLogs(logCount) {
  // Simplified — actual streak calculated from dates in StatsGrid
  // Here we just use count as a proxy, real streak is in HabitTracker
  return 0
}

// ── Habit Tracker ─────────────────────────────────────────────
function HabitTracker({ userId }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [routines,    setRoutines]    = useState([])
  const [logDates,    setLogDates]    = useState({})   // routineId → Set of date strings
  const [healthDates, setHealthDates] = useState(new Set())
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    load()
  }, [userId, monthOffset])  // eslint-disable-line

  async function load() {
    setLoading(true)
    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + monthOffset
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    const start = firstDay.toISOString().split('T')[0]
    const end   = lastDay.toISOString().split('T')[0]

    const [routRes, logRes, healthRes] = await Promise.all([
      supabase.from('routines').select('id,title').eq('user_id', userId).limit(8),
      supabase.from('routine_logs').select('routine_id,started_at,status')
        .eq('user_id', userId).eq('status', 'completed')
        .gte('started_at', start).lte('started_at', end + 'T23:59:59'),
      supabase.from('health_logs').select('date')
        .eq('user_id', userId).gte('date', start).lte('date', end),
    ])

    const routs = routRes.data || []
    const logs  = logRes.data  || []
    const health = healthRes.data || []

    const dateMap = {}
    routs.forEach(r => { dateMap[r.id] = new Set() })
    logs.forEach(l => {
      const d = l.started_at?.split('T')[0]
      if (d && dateMap[l.routine_id]) dateMap[l.routine_id].add(d)
    })

    setRoutines(routs)
    setLogDates(dateMap)
    setHealthDates(new Set(health.map(h => h.date)))
    setLoading(false)
  }

  const now      = new Date()
  const year     = now.getFullYear()
  const month    = now.getMonth() + monthOffset
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = now.toISOString().split('T')[0]
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    return d.toISOString().split('T')[0]
  })

  // Grid columns: name col + one per day
  const colCount = 1 + days.length
  const gridStyle = {
    gridTemplateColumns: `100px repeat(${days.length}, 22px)`,
  }

  const rows = [
    ...routines.map(r => ({ id: r.id, label: r.title, type: 'routine', dates: logDates[r.id] || new Set() })),
    ...(healthDates.size > 0 || !loading ? [{ id: 'health', label: '💚 Health', type: 'health', dates: healthDates }] : []),
  ]

  return (
    <div className="habit-section">
      <div className="habit-section-head">
        <span className="section-label">Habit tracker</span>
        <div className="habit-month-nav">
          <button className="habit-month-btn" onClick={() => setMonthOffset(o => o - 1)}>‹</button>
          <span className="habit-month-label">{monthLabel}</span>
          <button className="habit-month-btn" onClick={() => setMonthOffset(o => o + 1)}
            disabled={monthOffset >= 0}>›</button>
        </div>
      </div>

      <div className="habit-grid-wrap">
        {loading ? (
          <div className="habit-loading">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="habit-empty">Add routines to start tracking habits</div>
        ) : (
          <>
            <div className="habit-grid" style={gridStyle}>
              {/* Header row — day numbers */}
              <div className="habit-header-cell" />
              {days.map(d => (
                <div key={d} className="habit-header-cell">
                  {parseInt(d.split('-')[2], 10)}
                </div>
              ))}
              {/* Data rows */}
              {rows.map(row => (
                <div key={row.id} className="habit-grid-row">
                  <div className="habit-name-cell" title={row.label}>{row.label}</div>
                  {days.map(d => {
                    const done   = row.dates.has(d)
                    const future = d > todayStr
                    const today  = d === todayStr
                    return (
                      <div key={d}
                        className={[
                          'habit-day-cell',
                          done  ? (row.type === 'health' ? 'done-health' : 'done') : '',
                          future ? 'future' : '',
                          today  ? 'today'  : '',
                        ].filter(Boolean).join(' ')}
                        title={`${row.label} · ${d}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="habit-legend">
              <div className="habit-legend-item">
                <div className="habit-legend-dot" style={{ background: 'var(--accent)' }} />
                Routine done
              </div>
              <div className="habit-legend-item">
                <div className="habit-legend-dot" style={{ background: '#10b981' }} />
                Health logged
              </div>
              <div className="habit-legend-item">
                <div className="habit-legend-dot" style={{ background: 'var(--bg3)', border: '1px solid var(--border2)' }} />
                Not done
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Badges panel ──────────────────────────────────────────────
function BadgesPanel({ userId, xp }) {
  const [earned,  setEarned]  = useState(new Set())
  const [dates,   setDates]   = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    checkAndAwardBadges()
  }, [userId, xp])  // eslint-disable-line

  async function checkAndAwardBadges() {
    setLoading(true)
    // Load all data needed for badge checks
    const [
      tasksRes, routineLogsRes, focusRes,
      journalsRes, hobbiesRes, projectsRes,
      waterRes, reviewsRes, brainRes, existingRes
    ] = await Promise.all([
      supabase.from('tasks').select('id,status').eq('user_id', userId),
      supabase.from('routine_logs').select('id,started_at,status').eq('user_id', userId),
      supabase.from('focus_sessions').select('id,duration_min').eq('user_id', userId),
      supabase.from('journal_entries').select('id').eq('user_id', userId),
      supabase.from('hobby_sessions').select('id,duration_min').eq('user_id', userId),
      supabase.from('projects').select('id,status').eq('user_id', userId),
      supabase.from('health_logs').select('date,water_ml,water_goal_ml').eq('user_id', userId).order('date', { ascending: false }),
      supabase.from('reviews').select('id').eq('user_id', userId),
      supabase.from('brain_dump_items').select('id').eq('user_id', userId),
      supabase.from('user_badges').select('badge_key,earned_at').eq('user_id', userId),
    ])

    const existingBadges = existingRes.data || []
    const earnedSet  = new Set(existingBadges.map(b => b.badge_key))
    const dateMap    = {}
    existingBadges.forEach(b => { dateMap[b.badge_key] = b.earned_at })

    // Compute stats
    const doneTasks    = (tasksRes.data || []).filter(t => t.status === 'done').length
    const completedLogs= (routineLogsRes.data || []).filter(r => r.status === 'completed')
    const logDateSet   = new Set(completedLogs.map(l => l.started_at?.split('T')[0]).filter(Boolean))
    const routineStreak = computeStreakDates([...logDateSet])
    const focusSessions = {
      count:     (focusRes.data || []).length,
      totalMins: (focusRes.data || []).reduce((a, s) => a + (s.duration_min || 0), 0),
    }
    const journals   = (journalsRes.data || []).length
    const hobbySessions = (hobbiesRes.data || []).length
    const hobbyMins  = (hobbiesRes.data || []).reduce((a, h) => a + (h.duration_min || 0), 0)
    const projects   = {
      total: (projectsRes.data || []).length,
      done:  (projectsRes.data || []).filter(p => p.status === 'done').length,
    }
    const reviews    = (reviewsRes.data || []).length
    const brainItems = (brainRes.data || []).length

    // Water streak
    const waterLogs   = (waterRes.data || [])
    const waterStreak = computeStreakDates(
      waterLogs.filter(h => h.water_ml >= (h.water_goal_ml || 2000)).map(h => h.date)
    )

    const data = {
      doneTasks, routineLogs: completedLogs.length,
      focusSessions, journals, hobbySessions, hobbyMins,
      projects, xp, reviews, brainItems, waterStreak,
      streak: routineStreak,
    }

    // Check which badges are newly earned
    const newBadges = []
    for (const def of BADGE_DEFS) {
      if (!earnedSet.has(def.key) && checkEarned(def.key, data)) {
        newBadges.push(def.key)
      }
    }

    // Also fix checkEarned to use real streak
    // Re-check streak badges with real value
    if (!earnedSet.has('streak_7')  && routineStreak >= 7)  newBadges.push('streak_7')
    if (!earnedSet.has('streak_30') && routineStreak >= 30) newBadges.push('streak_30')
    const uniqueNew = [...new Set(newBadges)]

    if (uniqueNew.length > 0) {
      await supabase.from('user_badges').upsert(
        uniqueNew.map(key => ({ user_id: userId, badge_key: key, earned_at: new Date().toISOString() })),
        { onConflict: 'user_id,badge_key' }
      )
      uniqueNew.forEach(key => {
        earnedSet.add(key)
        dateMap[key] = new Date().toISOString()
      })
    }

    setEarned(earnedSet)
    setDates(dateMap)
    setLoading(false)
  }

  if (loading) return null
  const earnedBadges = BADGE_DEFS.filter(b => earned.has(b.key))
  const lockedBadges = BADGE_DEFS.filter(b => !earned.has(b.key))

  return (
    <div className="badges-section">
      <div className="home-section-head">
        <span className="section-label">Badges</span>
        <span className="section-sub">{earnedBadges.length} / {BADGE_DEFS.length} earned</span>
      </div>
      <div className="badges-grid">
        {[...earnedBadges, ...lockedBadges].map(b => (
          <div key={b.key} className={`badge-card ${earned.has(b.key) ? 'earned' : 'locked'}`}>
            <span className="badge-emoji">{b.emoji}</span>
            <span className="badge-name">{b.name}</span>
            <span className="badge-desc">{b.desc}</span>
            {earned.has(b.key) && dates[b.key] && (
              <span className="badge-date">
                {new Date(dates[b.key]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function computeStreakDates(dateStrings) {
  if (!dateStrings.length) return 0
  const s = new Set(dateStrings)
  const today = new Date()
  let cursor = new Date(today)
  if (!s.has(cursor.toISOString().split('T')[0])) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  for (let i = 0; i < 400; i++) {
    const ds = cursor.toISOString().split('T')[0]
    if (s.has(ds)) { streak++; cursor.setDate(cursor.getDate() - 1) }
    else break
  }
  return streak
}

// ── Main Home ──────────────────────────────────────────────────
export default function Home({ userId }) {
  const [xp,       setXp]       = useState(() => getXP())
  const [capture,  setCapture]  = useState(false)

  useEffect(() => {
    const handler = () => setXp(getXP())
    window.addEventListener('xp-update', handler)
    return () => window.removeEventListener('xp-update', handler)
  }, [])

  const hour       = new Date().getHours()
  const greeting   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const sub        = getSub(hour)
  const dateStr    = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const level      = getLevel(xp)
  const gramsIn    = getXPIntoLevel(xp)
  const dest       = getCurrentDestination(xp)
  const next       = getNextDestination(xp)
  const matter     = getMatter(xp)
  const antimatter = getAntimatter(xp)
  const matterProg = getMatterProgress(xp)
  const antiProg   = getAntimatterProgress(xp)
  const au         = getAUTraveled(xp)
  const isMatter   = level % 2 === 1

  // How many grams until next level
  const gramsLeft  = 100 - gramsIn

  return (
    <div className="home-page">

      {capture && <CaptureModal userId={userId} onClose={() => setCapture(false)} />}

      {/* ── Greeting ── */}
      <div className="home-header">
        <div className="home-header-left">
          <div className="home-date">{dateStr}</div>
          <h1 className="home-title">{greeting}.</h1>
          <p className="home-sub">{sub}</p>
        </div>
        <button className="capture-btn" onClick={() => setCapture(true)}>
          + Capture
        </button>
      </div>

      {/* ── Where you're orbiting ── */}
      <div className="orbit-section">
        <div className="orbit-section-header">
          <span className="section-label">Where you're orbiting</span>
          <span className="orbit-au">{au < 1 ? au.toFixed(4) : au.toFixed(2)} AU traveled</span>
        </div>

        <OrbitMap au={au} />

        <div className="orbit-details">
          <div className="orbit-waypoint">
            <span className="orbit-dest-icon">{dest.emoji}</span>
            <div>
              <div className="orbit-dest-name">
                Current waypoint · {dest.name}
              </div>
              {next && (
                <div className="orbit-dest-next">
                  {next.emoji} {next.name} at {next.au < 1 ? next.au.toFixed(4) : next.au.toLocaleString()} AU
                </div>
              )}
            </div>
          </div>

          <div className="orbit-lvl-row">
            <span className="orbit-lvl">Level {level}</span>
            <span className="orbit-grams-sub">· {gramsIn}g toward the next burst</span>
          </div>

          <div className="orbit-fuel-bars">
            <div className="orbit-fuel-row">
              <span className="orbit-fuel-label">⚛️ Matter</span>
              <div className="orbit-fuel-track">
                <div className="orbit-fuel-fill fill-matter" style={{ width: `${(matterProg / 2.5) * 100}%` }} />
              </div>
              <span className="orbit-fuel-val">{matterProg.toFixed(1)} / 2.5</span>
            </div>
            <div className="orbit-fuel-row">
              <span className="orbit-fuel-label">⚡ Antimatter</span>
              <div className="orbit-fuel-track">
                <div className="orbit-fuel-fill fill-anti" style={{ width: `${(antiProg / 2.5) * 100}%` }} />
              </div>
              <span className="orbit-fuel-val">{antiProg.toFixed(1)} / 2.5</span>
            </div>
          </div>

          <div className="orbit-hint">
            {gramsLeft <= 10
              ? `🔥 ${gramsLeft}g to level ${level + 1} — you're close.`
              : `You're ${gramsLeft}g from level ${level + 1}. ${isMatter ? 'Collecting ⚛️ matter' : 'Collecting ⚡ antimatter'} this level.`
            }
          </div>
        </div>
      </div>

      {/* ── Today, gently ── */}
      <div className="home-section">
        <div className="home-section-head">
          <span className="section-label">Today, gently</span>
          <span className="section-sub">3 things · skip anything</span>
        </div>
        <TodaySection userId={userId} />
      </div>

      {/* ── Mission log ── */}
      <div className="home-section">
        <div className="home-section-head">
          <span className="section-label">Mission log</span>
          <span className="section-sub">last 24h</span>
        </div>
        <MissionLog userId={userId} />
      </div>

      {/* ── Stats dashboard ── */}
      <StatsGrid userId={userId} />

      <BadgesPanel userId={userId} xp={xp} />

    </div>
  )
}
