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

    </div>
  )
}
