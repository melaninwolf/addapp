import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import './UsageTracker.css'

// ── Constants ─────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'social',         label: 'Social',         emoji: '📱', color: '#f59e0b' },
  { key: 'entertainment',  label: 'Entertainment',  emoji: '🎬', color: '#ef4444' },
  { key: 'work',           label: 'Work',           emoji: '💼', color: '#3b82f6' },
  { key: 'comms',          label: 'Comms',          emoji: '💬', color: '#10b981' },
  { key: 'news',           label: 'News',           emoji: '📰', color: '#8b5cf6' },
  { key: 'other',          label: 'Other',          emoji: '📌', color: '#6b7280' },
]

const QUICK_APPS = [
  { name: 'Instagram',  category: 'social',        emoji: '📸', distraction: true  },
  { name: 'TikTok',     category: 'social',        emoji: '🎵', distraction: true  },
  { name: 'YouTube',    category: 'entertainment', emoji: '▶️', distraction: true  },
  { name: 'Twitter/X',  category: 'social',        emoji: '🐦', distraction: true  },
  { name: 'Reddit',     category: 'social',        emoji: '🔶', distraction: true  },
  { name: 'Netflix',    category: 'entertainment', emoji: '🎞', distraction: false },
  { name: 'Email',      category: 'comms',         emoji: '📧', distraction: false },
  { name: 'Slack',      category: 'comms',         emoji: '💬', distraction: false },
  { name: 'WhatsApp',   category: 'comms',         emoji: '📲', distraction: false },
  { name: 'News sites', category: 'news',          emoji: '📰', distraction: true  },
]

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120]

function todayStr() { return new Date().toISOString().split('T')[0] }

function fmtMins(m) {
  if (!m) return '0m'
  const h = Math.floor(m / 60), rem = m % 60
  if (h === 0) return `${rem}m`
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

function getCatColor(key) {
  return CATEGORIES.find(c => c.key === key)?.color || '#6b7280'
}
function getCatEmoji(key) {
  return CATEGORIES.find(c => c.key === key)?.emoji || '📌'
}

// ── Log modal ─────────────────────────────────────────────────
function LogModal({ onSave, onClose, limits }) {
  const [appName,     setAppName]     = useState('')
  const [customApp,   setCustomApp]   = useState('')
  const [category,    setCategory]    = useState('social')
  const [duration,    setDuration]    = useState(30)
  const [customDur,   setCustomDur]   = useState('')
  const [distraction, setDistraction] = useState(false)
  const [note,        setNote]        = useState('')
  const [step,        setStep]        = useState('app') // app | details

  function selectQuickApp(qa) {
    setAppName(qa.name)
    setCategory(qa.category)
    setDistraction(qa.distraction)
    setStep('details')
  }

  function selectCustomApp() {
    if (!customApp.trim()) return
    setAppName(customApp.trim())
    setStep('details')
  }

  const finalDur = customDur !== '' ? parseInt(customDur) || 0 : duration
  const limit = limits.find(l => l.app_name.toLowerCase() === appName.toLowerCase())
  const overLimit = limit && finalDur > limit.daily_limit_min

  function submit() {
    if (!appName || !finalDur) return
    onSave({ app_name: appName, category, duration_min: finalDur, is_distraction: distraction, note: note.trim() || null })
  }

  return (
    <div className="ut-overlay" onClick={onClose}>
      <div className="ut-modal" onClick={e => e.stopPropagation()}>
        <div className="ut-modal-head">
          <span className="ut-modal-title">{step === 'app' ? 'What did you use?' : `Log · ${appName}`}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {step === 'app' && (
          <div className="ut-modal-body">
            <div className="ut-quick-grid">
              {QUICK_APPS.map(qa => (
                <button key={qa.name} className="ut-quick-btn" onClick={() => selectQuickApp(qa)}>
                  <span>{qa.emoji}</span>
                  <span className="ut-quick-name">{qa.name}</span>
                </button>
              ))}
            </div>
            <div className="ut-custom-row">
              <input className="ut-input" placeholder="Other app or website…"
                value={customApp} onChange={e => setCustomApp(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && selectCustomApp()} />
              <button className="btn-primary btn-sm" onClick={selectCustomApp} disabled={!customApp.trim()}>
                Next →
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="ut-modal-body">
            {/* Duration */}
            <div className="ut-field">
              <label className="ut-label">How long?</label>
              <div className="ut-dur-grid">
                {DURATION_PRESETS.map(d => (
                  <button key={d}
                    className={`ut-dur-btn${duration === d && customDur === '' ? ' active' : ''}`}
                    onClick={() => { setDuration(d); setCustomDur('') }}>
                    {fmtMins(d)}
                  </button>
                ))}
              </div>
              <input className="ut-input ut-dur-custom" type="number" min="1" max="480"
                placeholder="Custom minutes…" value={customDur}
                onChange={e => setCustomDur(e.target.value)} />
            </div>

            {/* Category */}
            <div className="ut-field">
              <label className="ut-label">Category</label>
              <div className="ut-cat-row">
                {CATEGORIES.map(c => (
                  <button key={c.key}
                    className={`ut-cat-btn${category === c.key ? ' active' : ''}`}
                    style={category === c.key ? { borderColor: c.color, background: c.color + '22', color: c.color } : {}}
                    onClick={() => setCategory(c.key)}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Distraction toggle */}
            <div className="ut-field">
              <label className="ut-label">Was this a distraction?</label>
              <div className="ut-toggle-row">
                <button className={`ut-toggle-btn${!distraction ? ' active' : ''}`}
                  onClick={() => setDistraction(false)}>✅ Intentional</button>
                <button className={`ut-toggle-btn${distraction ? ' active-red' : ''}`}
                  onClick={() => setDistraction(true)}>⚠️ Distraction</button>
              </div>
            </div>

            {/* Note */}
            <div className="ut-field">
              <label className="ut-label">Note (optional)</label>
              <input className="ut-input" placeholder="e.g. mindless scroll before bed…"
                value={note} onChange={e => setNote(e.target.value)} />
            </div>

            {overLimit && (
              <div className="ut-over-limit">
                ⚠️ Over your {fmtMins(limit.daily_limit_min)} daily limit for {appName}
              </div>
            )}

            <div className="ut-modal-foot">
              <button className="btn-ghost btn-sm" onClick={() => setStep('app')}>← Back</button>
              <button className="btn-primary" onClick={submit} disabled={!finalDur}>
                Log {fmtMins(finalDur)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Limit modal ───────────────────────────────────────────────
function LimitModal({ onSave, onClose }) {
  const [appName,  setAppName]  = useState('')
  const [category, setCategory] = useState('social')
  const [limit,    setLimit]    = useState(30)

  return (
    <div className="ut-overlay" onClick={onClose}>
      <div className="ut-modal" onClick={e => e.stopPropagation()}>
        <div className="ut-modal-head">
          <span className="ut-modal-title">Set daily limit</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ut-modal-body">
          <div className="ut-field">
            <label className="ut-label">App or site</label>
            <input className="ut-input" placeholder="e.g. Instagram" value={appName}
              onChange={e => setAppName(e.target.value)} />
          </div>
          <div className="ut-field">
            <label className="ut-label">Category</label>
            <div className="ut-cat-row">
              {CATEGORIES.map(c => (
                <button key={c.key}
                  className={`ut-cat-btn${category === c.key ? ' active' : ''}`}
                  style={category === c.key ? { borderColor: c.color, background: c.color + '22', color: c.color } : {}}
                  onClick={() => setCategory(c.key)}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ut-field">
            <label className="ut-label">Daily limit</label>
            <div className="ut-dur-grid">
              {[15, 20, 30, 45, 60, 90, 120].map(d => (
                <button key={d}
                  className={`ut-dur-btn${limit === d ? ' active' : ''}`}
                  onClick={() => setLimit(d)}>{fmtMins(d)}</button>
              ))}
            </div>
          </div>
          <div className="ut-modal-foot">
            <button className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={!appName.trim()}
              onClick={() => onSave({ app_name: appName.trim(), category, daily_limit_min: limit })}>
              Save limit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Bar chart ─────────────────────────────────────────────────
function UsageBar({ label, emoji, mins, limitMins, color }) {
  const pct    = limitMins ? Math.min((mins / limitMins) * 100, 100) : 0
  const over   = limitMins && mins > limitMins
  return (
    <div className="ut-bar-row">
      <div className="ut-bar-info">
        <span className="ut-bar-emoji">{emoji}</span>
        <span className="ut-bar-label">{label}</span>
        <span className="ut-bar-time">{fmtMins(mins)}</span>
        {limitMins && <span className={`ut-bar-limit${over ? ' over' : ''}`}>/ {fmtMins(limitMins)}</span>}
      </div>
      {limitMins > 0 && (
        <div className="ut-bar-track">
          <div className="ut-bar-fill" style={{
            width: `${pct}%`,
            background: over ? '#ef4444' : color,
          }} />
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function UsageTracker({ userId }) {
  const [date,         setDate]         = useState(todayStr())
  const [logs,         setLogs]         = useState([])
  const [limits,       setLimits]       = useState([])
  const [showLog,      setShowLog]      = useState(false)
  const [showLimit,    setShowLimit]    = useState(false)
  const [activeTab,    setActiveTab]    = useState('today') // today | week | limits

  useEffect(() => { loadAll() }, [userId, date]) // eslint-disable-line

  async function loadAll() {
    if (!userId) return
    const now  = new Date()
    const wks  = new Date(now); wks.setDate(now.getDate() - 6)
    const [logsRes, limitsRes] = await Promise.all([
      supabase.from('usage_logs').select('*').eq('user_id', userId)
        .gte('log_date', wks.toISOString().split('T')[0])
        .order('created_at', { ascending: false }),
      supabase.from('usage_limits').select('*').eq('user_id', userId).eq('is_active', true),
    ])
    setLogs(logsRes.data || [])
    setLimits(limitsRes.data || [])
  }

  async function saveLog(payload) {
    if (!userId) return
    await supabase.from('usage_logs').insert({ ...payload, user_id: userId, log_date: date })
    setShowLog(false)
    loadAll()
  }

  async function deleteLog(id) {
    await supabase.from('usage_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  async function saveLimit(payload) {
    if (!userId) return
    await supabase.from('usage_limits').upsert(
      { ...payload, user_id: userId },
      { onConflict: 'user_id,app_name' }
    )
    setShowLimit(false)
    loadAll()
  }

  async function deleteLimit(id) {
    await supabase.from('usage_limits').delete().eq('id', id)
    setLimits(prev => prev.filter(l => l.id !== id))
  }

  // ── Derived: today's stats ──
  const todayLogs = logs.filter(l => l.log_date === date)
  const todayTotal = todayLogs.reduce((a, l) => a + l.duration_min, 0)
  const todayDistraction = todayLogs.filter(l => l.is_distraction).reduce((a, l) => a + l.duration_min, 0)

  // Group today by app for bar chart
  const appTotals = {}
  todayLogs.forEach(l => {
    if (!appTotals[l.app_name]) appTotals[l.app_name] = { mins: 0, category: l.category }
    appTotals[l.app_name].mins += l.duration_min
  })

  // ── Derived: week stats ──
  const weekLogs = logs
  const weekTotal = weekLogs.reduce((a, l) => a + l.duration_min, 0)
  const weekDistraction = weekLogs.filter(l => l.is_distraction).reduce((a, l) => a + l.duration_min, 0)

  // Group by day for week
  const weekByDay = {}
  weekLogs.forEach(l => {
    if (!weekByDay[l.log_date]) weekByDay[l.log_date] = 0
    weekByDay[l.log_date] += l.duration_min
  })
  const maxDayMins = Math.max(...Object.values(weekByDay), 1)

  // Group by category for week
  const weekByCat = {}
  weekLogs.forEach(l => {
    if (!weekByCat[l.category]) weekByCat[l.category] = 0
    weekByCat[l.category] += l.duration_min
  })

  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })

  return (
    <div className="ut-page">
      {showLog   && <LogModal   onSave={saveLog}   onClose={() => setShowLog(false)}   limits={limits} />}
      {showLimit && <LimitModal onSave={saveLimit} onClose={() => setShowLimit(false)} />}

      {/* Header */}
      <div className="ut-header">
        <div>
          <div className="page-tagline">Productivity Tracker</div>
          <h1 className="page-title">Screen time</h1>
        </div>
        <div className="ut-header-actions">
          <button className="btn-ghost btn-sm" onClick={() => setShowLimit(true)}>⏱ Set limit</button>
          <button className="btn-primary btn-sm" onClick={() => setShowLog(true)}>+ Log usage</button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="ut-summary-strip">
        <div className="ut-sum-stat">
          <span className="ut-sum-val">{fmtMins(todayTotal)}</span>
          <span className="ut-sum-lbl">today total</span>
        </div>
        <div className="ut-sum-stat">
          <span className="ut-sum-val" style={{ color: todayDistraction > 0 ? '#ef4444' : 'var(--text)' }}>
            {fmtMins(todayDistraction)}
          </span>
          <span className="ut-sum-lbl">distractions</span>
        </div>
        <div className="ut-sum-stat">
          <span className="ut-sum-val">{todayLogs.length}</span>
          <span className="ut-sum-lbl">logged today</span>
        </div>
        <div className="ut-sum-stat">
          <span className="ut-sum-val">{fmtMins(weekTotal)}</span>
          <span className="ut-sum-lbl">this week</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="ut-tabs">
        {[['today','📅 Today'], ['week','📊 Week'], ['limits','⏱ Limits']].map(([k, lbl]) => (
          <button key={k} className={`ut-tab${activeTab === k ? ' active' : ''}`}
            onClick={() => setActiveTab(k)}>{lbl}</button>
        ))}
      </div>

      {/* ── TODAY TAB ── */}
      {activeTab === 'today' && (
        <div className="ut-tab-content">
          {/* Date nav */}
          <div className="ut-date-nav">
            <button className="cal-nav-btn" onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().split('T')[0])
            }}>‹</button>
            <span className="ut-date-label">
              {date === todayStr() ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
            </span>
            <button className="cal-nav-btn" onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() + 1);
              const nd = d.toISOString().split('T')[0]
              if (nd <= todayStr()) setDate(nd)
            }} disabled={date >= todayStr()}>›</button>
          </div>

          {todayLogs.length === 0 ? (
            <div className="ut-empty">
              <div style={{ fontSize: 36 }}>📱</div>
              <p>No usage logged for this day.</p>
              <button className="btn-primary" onClick={() => setShowLog(true)}>+ Log usage</button>
            </div>
          ) : (
            <>
              {/* App bars */}
              <div className="ut-section">
                <div className="ut-section-title">By app</div>
                {Object.entries(appTotals)
                  .sort((a, b) => b[1].mins - a[1].mins)
                  .map(([app, { mins, category }]) => {
                    const limit = limits.find(l => l.app_name.toLowerCase() === app.toLowerCase())
                    return (
                      <UsageBar key={app} label={app}
                        emoji={getCatEmoji(category)}
                        mins={mins}
                        limitMins={limit?.daily_limit_min}
                        color={getCatColor(category)} />
                    )
                  })}
              </div>

              {/* Log entries */}
              <div className="ut-section">
                <div className="ut-section-title">Log entries</div>
                {todayLogs.map(l => (
                  <div key={l.id} className={`ut-entry${l.is_distraction ? ' distraction' : ''}`}>
                    <span className="ut-entry-emoji">{getCatEmoji(l.category)}</span>
                    <div className="ut-entry-body">
                      <span className="ut-entry-app">{l.app_name}</span>
                      {l.note && <span className="ut-entry-note">{l.note}</span>}
                    </div>
                    <span className="ut-entry-dur">{fmtMins(l.duration_min)}</span>
                    {l.is_distraction && <span className="ut-distraction-tag">distraction</span>}
                    <button className="ut-del-btn" onClick={() => deleteLog(l.id)} title="Remove">✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── WEEK TAB ── */}
      {activeTab === 'week' && (
        <div className="ut-tab-content">
          <div className="ut-section">
            <div className="ut-section-title">Last 7 days</div>
            <div className="ut-week-bars">
              {days7.map(d => {
                const mins = weekByDay[d] || 0
                const pct  = (mins / maxDayMins) * 100
                const isToday = d === todayStr()
                return (
                  <div key={d} className="ut-week-col">
                    <div className="ut-week-bar-wrap">
                      <div className="ut-week-bar-fill"
                        style={{ height: `${pct}%`, background: isToday ? 'var(--accent)' : 'var(--border2)' }} />
                    </div>
                    <span className="ut-week-day">
                      {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}
                    </span>
                    {mins > 0 && <span className="ut-week-mins">{fmtMins(mins)}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="ut-two-col">
            <div className="ut-section">
              <div className="ut-section-title">By category</div>
              {Object.entries(weekByCat)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, mins]) => (
                  <UsageBar key={cat}
                    label={CATEGORIES.find(c => c.key === cat)?.label || cat}
                    emoji={getCatEmoji(cat)}
                    mins={mins}
                    limitMins={null}
                    color={getCatColor(cat)} />
                ))}
            </div>
            <div className="ut-section">
              <div className="ut-section-title">Stats</div>
              <div className="ut-week-stats">
                <div className="ut-week-stat">
                  <span className="ut-ws-val">{fmtMins(weekTotal)}</span>
                  <span className="ut-ws-lbl">total screen time</span>
                </div>
                <div className="ut-week-stat">
                  <span className="ut-ws-val" style={{ color: '#ef4444' }}>{fmtMins(weekDistraction)}</span>
                  <span className="ut-ws-lbl">distraction time</span>
                </div>
                <div className="ut-week-stat">
                  <span className="ut-ws-val">
                    {weekTotal > 0 ? Math.round(((weekTotal - weekDistraction) / weekTotal) * 100) : 0}%
                  </span>
                  <span className="ut-ws-lbl">intentional use</span>
                </div>
                <div className="ut-week-stat">
                  <span className="ut-ws-val">{Math.round(weekTotal / 7)}m</span>
                  <span className="ut-ws-lbl">daily average</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LIMITS TAB ── */}
      {activeTab === 'limits' && (
        <div className="ut-tab-content">
          {limits.length === 0 ? (
            <div className="ut-empty">
              <div style={{ fontSize: 36 }}>⏱</div>
              <p>No limits set yet. Set daily limits to stay aware of your usage.</p>
              <button className="btn-primary" onClick={() => setShowLimit(true)}>Set first limit</button>
            </div>
          ) : (
            <div className="ut-section">
              <div className="ut-section-title">Daily limits</div>
              {limits.map(l => {
                const todayUsed = appTotals[l.app_name]?.mins || 0
                return (
                  <div key={l.id} className="ut-limit-row">
                    <span className="ut-entry-emoji">{getCatEmoji(l.category)}</span>
                    <div className="ut-entry-body">
                      <span className="ut-entry-app">{l.app_name}</span>
                      <div className="ut-bar-track" style={{ marginTop: 4 }}>
                        <div className="ut-bar-fill" style={{
                          width: `${Math.min((todayUsed / l.daily_limit_min) * 100, 100)}%`,
                          background: todayUsed > l.daily_limit_min ? '#ef4444' : getCatColor(l.category),
                        }} />
                      </div>
                    </div>
                    <span className="ut-entry-dur">
                      {fmtMins(todayUsed)} / {fmtMins(l.daily_limit_min)}
                    </span>
                    <button className="ut-del-btn" onClick={() => deleteLimit(l.id)} title="Remove limit">✕</button>
                  </div>
                )
              })}
            </div>
          )}
          <button className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => setShowLimit(true)}>+ Add another limit</button>
        </div>
      )}
    </div>
  )
}
