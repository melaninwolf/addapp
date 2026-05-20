import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from '../supabase'
import './UsageTracker.css'

// ── Native plugin bridge (Android only) ───────────────────────
const NativeUT = Capacitor.isNativePlatform()
  ? registerPlugin('UsageTracker')
  : null

// ── Constants ─────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'social',        label: 'Social',        emoji: '📱', color: '#f59e0b' },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#ef4444' },
  { key: 'work',          label: 'Work',          emoji: '💼', color: '#3b82f6' },
  { key: 'comms',         label: 'Comms',         emoji: '💬', color: '#10b981' },
  { key: 'news',          label: 'News',          emoji: '📰', color: '#8b5cf6' },
  { key: 'other',         label: 'Other',         emoji: '📌', color: '#6b7280' },
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

const BLOCKER_PRESETS = [
  { name: 'TikTok',    pkg: 'com.zhiliaoapp.musically',  emoji: '🎵' },
  { name: 'Instagram', pkg: 'com.instagram.android',     emoji: '📸' },
  { name: 'YouTube',   pkg: 'com.google.android.youtube',emoji: '▶️' },
  { name: 'Twitter/X', pkg: 'com.twitter.android',       emoji: '🐦' },
  { name: 'Facebook',  pkg: 'com.facebook.katana',       emoji: '👍' },
  { name: 'Snapchat',  pkg: 'com.snapchat.android',      emoji: '👻' },
  { name: 'Reddit',    pkg: 'com.reddit.frontpage',      emoji: '🔶' },
  { name: 'BeReal',    pkg: 'com.bereal.ft',             emoji: '📷' },
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
  const [step,        setStep]        = useState('app')

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
              <label className="ut-label">Was this a distraction?</label>
              <div className="ut-toggle-row">
                <button className={`ut-toggle-btn${!distraction ? ' active' : ''}`}
                  onClick={() => setDistraction(false)}>✅ Intentional</button>
                <button className={`ut-toggle-btn${distraction ? ' active-red' : ''}`}
                  onClick={() => setDistraction(true)}>⚠️ Distraction</button>
              </div>
            </div>
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

// ── Add Blocker modal ─────────────────────────────────────────
function AddBlockerModal({ onSave, onClose }) {
  const [step,        setStep]        = useState('pick')   // pick | details
  const [appName,     setAppName]     = useState('')
  const [pkg,         setPkg]         = useState('')
  const [emoji,       setEmoji]       = useState('📱')
  const [limitMins,   setLimitMins]   = useState(10)
  const [customLimit, setCustomLimit] = useState('')
  const [goal,        setGoal]        = useState('')

  function pickPreset(p) {
    setAppName(p.name)
    setPkg(p.pkg)
    setEmoji(p.emoji)
    setStep('details')
  }

  function pickCustom() {
    if (!appName.trim()) return
    setStep('details')
  }

  const finalLimit = customLimit !== '' ? parseInt(customLimit) || limitMins : limitMins

  function submit() {
    if (!appName.trim() || !goal.trim()) return
    onSave({
      app_name:            appName.trim(),
      package_name:        pkg.trim(),
      emoji,
      daily_limit_minutes: finalLimit,
      major_goal:          goal.trim(),
    })
  }

  return (
    <div className="ut-overlay" onClick={onClose}>
      <div className="ut-modal" onClick={e => e.stopPropagation()}>
        <div className="ut-modal-head">
          <span className="ut-modal-title">
            {step === 'pick' ? 'Which app distracts you?' : `🚨 Block ${appName}`}
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {step === 'pick' && (
          <div className="ut-modal-body">
            <div className="ut-quick-grid">
              {BLOCKER_PRESETS.map(p => (
                <button key={p.name} className="ut-quick-btn" onClick={() => pickPreset(p)}>
                  <span style={{ fontSize: 22 }}>{p.emoji}</span>
                  <span className="ut-quick-name">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="ut-custom-row">
              <input className="ut-input" placeholder="Other app name…"
                value={appName} onChange={e => setAppName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && pickCustom()} />
              <button className="btn-primary btn-sm" onClick={pickCustom} disabled={!appName.trim()}>
                Next →
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="ut-modal-body">
            {/* Major goal — first and most prominent */}
            <div className="ut-field">
              <label className="ut-label">🎯 What should you be doing instead?</label>
              <input className="ut-input ut-goal-input"
                placeholder="e.g. Finish my side project, Study for exams…"
                value={goal} onChange={e => setGoal(e.target.value)} autoFocus />
              <span className="ut-field-hint">This is what we'll shame you with when you go over your limit.</span>
            </div>

            {/* Daily limit */}
            <div className="ut-field">
              <label className="ut-label">Daily time limit</label>
              <div className="ut-dur-grid">
                {[5, 10, 15, 20, 30, 45, 60].map(d => (
                  <button key={d}
                    className={`ut-dur-btn${limitMins === d && customLimit === '' ? ' active' : ''}`}
                    onClick={() => { setLimitMins(d); setCustomLimit('') }}>
                    {fmtMins(d)}
                  </button>
                ))}
              </div>
              <input className="ut-input ut-dur-custom" type="number" min="1" max="480"
                placeholder="Custom minutes…" value={customLimit}
                onChange={e => setCustomLimit(e.target.value)} />
            </div>

            {/* Package name (optional, for native tracking) */}
            {Capacitor.isNativePlatform() && (
              <div className="ut-field">
                <label className="ut-label">Android package name (auto-filled for presets)</label>
                <input className="ut-input" placeholder="e.g. com.zhiliaoapp.musically"
                  value={pkg} onChange={e => setPkg(e.target.value)} />
                <span className="ut-field-hint">Required for automatic detection.</span>
              </div>
            )}

            <div className="ut-modal-foot">
              <button className="btn-ghost btn-sm" onClick={() => setStep('pick')}>← Back</button>
              <button className="btn-primary" onClick={submit}
                disabled={!appName.trim() || !goal.trim()}>
                Add blocker
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shame Screen ──────────────────────────────────────────────
function ShameScreen({ session, tasks, routines, shameHistory, onDismiss, onGoToTasks }) {
  const overBy = (session.minutesUsed || 0) - (session.limitMinutes || 0)
  const timesThisWeek = shameHistory.filter(s => s.app_name === session.appName).length

  return (
    <div className="shame-overlay">
      <div className="shame-content">

        {/* App icon + headline */}
        <div className="shame-hero">
          <div className="shame-emoji">{session.emoji || '📱'}</div>
          <h1 className="shame-headline">{session.appName} just stole your time</h1>
          <div className="shame-time-badge">
            <span className="shame-time-val">{session.minutesUsed} min</span>
            <span className="shame-time-sub">
              {overBy > 0 ? `${overBy} min over your ${session.limitMinutes}-min limit` : `at your ${session.limitMinutes}-min limit`}
            </span>
          </div>
        </div>

        {/* Major goal */}
        {session.majorGoal && (
          <div className="shame-goal-block">
            <div className="shame-goal-label">Instead, you could have been working on:</div>
            <div className="shame-goal-text">🎯 {session.majorGoal}</div>
          </div>
        )}

        {/* Unfinished tasks */}
        {tasks.length > 0 && (
          <div className="shame-section">
            <div className="shame-section-title">Your unfinished tasks right now</div>
            <ul className="shame-list">
              {tasks.slice(0, 5).map(t => (
                <li key={t.id} className="shame-list-item">
                  <span className="shame-dot" />
                  <span>{t.title}</span>
                </li>
              ))}
              {tasks.length > 5 && (
                <li className="shame-list-more">+ {tasks.length - 5} more tasks waiting…</li>
              )}
            </ul>
          </div>
        )}

        {/* Incomplete routines */}
        {routines.length > 0 && (
          <div className="shame-section">
            <div className="shame-section-title">Today's routines not done yet</div>
            <ul className="shame-list">
              {routines.map(r => (
                <li key={r.id} className="shame-list-item">
                  <span className="shame-dot shame-dot-routine" />
                  <span>{r.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Streak */}
        {timesThisWeek > 0 && (
          <div className="shame-streak">
            📊 Caught on {session.appName} <strong>{timesThisWeek} time{timesThisWeek !== 1 ? 's' : ''}</strong> this week
          </div>
        )}

        {/* Actions */}
        <div className="shame-actions">
          <button className="shame-btn-back" onClick={onDismiss}>
            😓 Ok, I'm back
          </button>
          {tasks.length > 0 && (
            <button className="shame-btn-tasks" onClick={onGoToTasks}>
              → Go to Tasks
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Bar chart ─────────────────────────────────────────────────
function UsageBar({ label, emoji, mins, limitMins, color }) {
  const pct  = limitMins ? Math.min((mins / limitMins) * 100, 100) : 0
  const over = limitMins && mins > limitMins
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
          <div className="ut-bar-fill" style={{ width: `${pct}%`, background: over ? '#ef4444' : color }} />
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function UsageTracker({ userId }) {
  const navigate = useNavigate()

  // Manual log state
  const [date,         setDate]         = useState(todayStr())
  const [logs,         setLogs]         = useState([])
  const [limits,       setLimits]       = useState([])
  const [showLog,      setShowLog]      = useState(false)
  const [showLimit,    setShowLimit]    = useState(false)
  const [activeTab,    setActiveTab]    = useState('blockers')

  // Blocker state
  const [blockers,      setBlockers]      = useState([])
  const [nativeUsage,   setNativeUsage]   = useState({})     // pkg → minutes
  const [permGranted,   setPermGranted]   = useState(false)
  const [isTracking,    setIsTracking]    = useState(false)
  const [showAddBlocker,setShowAddBlocker]= useState(false)
  const [trackLoading,  setTrackLoading]  = useState(false)

  // Shame state
  const [shameSession,   setShameSession]   = useState(null)   // current shame to show
  const [shameTasks,     setShameTasks]     = useState([])
  const [shameRoutines,  setShameRoutines]  = useState([])
  const [shameHistory,   setShameHistory]   = useState([])

  // ── Load everything on mount ──────────────────────────────
  useEffect(() => {
    if (!userId) return
    loadAll()
    if (Capacitor.isNativePlatform()) {
      checkNativePermission()
      checkTrackingStatus()
    }
  }, [userId])

  // ── Detect app coming back to foreground ──────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handleVisibility = () => {
      if (!document.hidden) {
        checkPendingShame()
        loadNativeUsage()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [userId, blockers])

  async function loadAll() {
    const now = new Date()
    const wks = new Date(now); wks.setDate(now.getDate() - 6)
    const [logsRes, limitsRes, blockersRes] = await Promise.all([
      supabase.from('usage_logs').select('*').eq('user_id', userId)
        .gte('log_date', wks.toISOString().split('T')[0])
        .order('created_at', { ascending: false }),
      supabase.from('usage_limits').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('distraction_apps').select('*').eq('user_id', userId).eq('is_active', true)
        .order('created_at', { ascending: true }),
    ])
    setLogs(logsRes.data || [])
    setLimits(limitsRes.data || [])
    setBlockers(blockersRes.data || [])
    if (Capacitor.isNativePlatform() && blockersRes.data?.length) {
      loadNativeUsage(blockersRes.data)
    }
  }

  async function checkNativePermission() {
    try {
      const res = await NativeUT?.checkUsagePermission()
      setPermGranted(res?.granted === true)
    } catch {}
  }

  async function checkTrackingStatus() {
    try {
      const res = await NativeUT?.isTracking()
      setIsTracking(res?.active === true)
    } catch {}
  }

  async function loadNativeUsage(appsOverride) {
    const apps = appsOverride || blockers
    if (!apps.length || !NativeUT) return
    const usageMap = {}
    await Promise.all(apps.map(async app => {
      if (!app.package_name) return
      try {
        const res = await NativeUT.getTodayUsageMinutes({ packageName: app.package_name })
        if (res?.minutes >= 0) usageMap[app.package_name] = res.minutes
      } catch {}
    }))
    setNativeUsage(usageMap)
  }

  async function checkPendingShame() {
    if (!NativeUT || !userId) return
    try {
      const res = await NativeUT.getPendingShameData()
      const sessions = res?.sessions || []
      if (sessions.length === 0) return

      // Load context for the first session
      const first = sessions[0]
      await loadShameContext()

      // Record to Supabase
      const blocker = blockers.find(b => b.app_name === first.appName)
      await supabase.from('shame_sessions').insert({
        user_id:       userId,
        app_id:        blocker?.id || null,
        app_name:      first.appName,
        minutes_used:  first.minutesUsed,
        limit_minutes: first.limitMinutes,
      })

      // Load shame history
      const { data: hist } = await supabase.from('shame_sessions')
        .select('app_name, shamed_at')
        .eq('user_id', userId)
        .gte('shamed_at', new Date(Date.now() - 7 * 86400000).toISOString())
      setShameHistory(hist || [])

      setShameSession({
        appName:      first.appName,
        minutesUsed:  first.minutesUsed,
        limitMinutes: first.limitMinutes,
        majorGoal:    first.majorGoal || blocker?.major_goal || '',
        emoji:        first.emoji || blocker?.emoji || '📱',
      })

      await NativeUT.clearPendingShameData()
    } catch (err) {
      console.error('checkPendingShame error', err)
    }
  }

  async function loadShameContext() {
    if (!userId) return
    const today = todayStr()
    const [tasksRes, routinesRes] = await Promise.all([
      supabase.from('tasks').select('id, title')
        .eq('user_id', userId).neq('status', 'done')
        .order('created_at', { ascending: true }).limit(20),
      supabase.from('routines').select('id, name').eq('user_id', userId)
        .not('id', 'in', `(select routine_id from routine_logs where user_id='${userId}' and log_date='${today}' and status='done')`)
        .limit(10),
    ])
    setShameTasks(tasksRes.data || [])
    setShameRoutines(routinesRes.data || [])
  }

  // ── Tracking controls ─────────────────────────────────────
  async function enableTracking() {
    if (!permGranted) {
      await NativeUT?.requestUsagePermission()
      setTimeout(() => checkNativePermission(), 2000)
      return
    }
    if (!blockers.length) { setShowAddBlocker(true); return }

    setTrackLoading(true)
    try {
      const apps = blockers.map(b => ({
        id:           b.id,
        packageName:  b.package_name,
        appName:      b.app_name,
        limitMinutes: b.daily_limit_minutes,
        majorGoal:    b.major_goal || '',
        emoji:        b.emoji || '📱',
      }))
      await NativeUT?.startTracking({ apps })
      setIsTracking(true)
    } catch (err) {
      console.error(err)
    } finally {
      setTrackLoading(false)
    }
  }

  async function disableTracking() {
    setTrackLoading(true)
    try {
      await NativeUT?.stopTracking()
      setIsTracking(false)
    } catch {} finally {
      setTrackLoading(false)
    }
  }

  // ── Blocker CRUD ──────────────────────────────────────────
  async function saveBlocker(payload) {
    if (!userId) return
    const { data } = await supabase.from('distraction_apps')
      .insert({ ...payload, user_id: userId })
      .select().single()
    if (data) {
      const updated = [...blockers, data]
      setBlockers(updated)
      if (isTracking) {
        const apps = updated.map(b => ({
          id: b.id, packageName: b.package_name, appName: b.app_name,
          limitMinutes: b.daily_limit_minutes, majorGoal: b.major_goal || '', emoji: b.emoji || '📱',
        }))
        await NativeUT?.startTracking({ apps })
      }
    }
    setShowAddBlocker(false)
  }

  async function deleteBlocker(id) {
    await supabase.from('distraction_apps').delete().eq('id', id)
    setBlockers(prev => prev.filter(b => b.id !== id))
  }

  // ── Manual log CRUD ───────────────────────────────────────
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

  // ── Derived: manual log stats ─────────────────────────────
  const todayLogs        = logs.filter(l => l.log_date === date)
  const todayTotal       = todayLogs.reduce((a, l) => a + l.duration_min, 0)
  const todayDistraction = todayLogs.filter(l => l.is_distraction).reduce((a, l) => a + l.duration_min, 0)
  const appTotals = {}
  todayLogs.forEach(l => {
    if (!appTotals[l.app_name]) appTotals[l.app_name] = { mins: 0, category: l.category }
    appTotals[l.app_name].mins += l.duration_min
  })
  const weekLogs         = logs
  const weekTotal        = weekLogs.reduce((a, l) => a + l.duration_min, 0)
  const weekDistraction  = weekLogs.filter(l => l.is_distraction).reduce((a, l) => a + l.duration_min, 0)
  const weekByDay = {}
  weekLogs.forEach(l => { weekByDay[l.log_date] = (weekByDay[l.log_date] || 0) + l.duration_min })
  const maxDayMins = Math.max(...Object.values(weekByDay), 1)
  const weekByCat = {}
  weekLogs.forEach(l => { weekByCat[l.category] = (weekByCat[l.category] || 0) + l.duration_min })
  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="ut-page">
      {/* Modals */}
      {showLog        && <LogModal      onSave={saveLog}    onClose={() => setShowLog(false)}        limits={limits} />}
      {showLimit      && <LimitModal    onSave={saveLimit}  onClose={() => setShowLimit(false)} />}
      {showAddBlocker && <AddBlockerModal onSave={saveBlocker} onClose={() => setShowAddBlocker(false)} />}

      {/* Shame screen overlay */}
      {shameSession && (
        <ShameScreen
          session={shameSession}
          tasks={shameTasks}
          routines={shameRoutines}
          shameHistory={shameHistory}
          onDismiss={() => setShameSession(null)}
          onGoToTasks={() => { setShameSession(null); navigate('/tasks') }}
        />
      )}

      {/* Header */}
      <div className="ut-header">
        <div>
          <div className="page-tagline">Productivity Tracker</div>
          <h1 className="page-title">Screen Time</h1>
        </div>
        <div className="ut-header-actions">
          <button className="btn-ghost btn-sm" onClick={() => setShowLimit(true)}>⏱ Limit</button>
          <button className="btn-primary btn-sm" onClick={() => setShowLog(true)}>+ Log</button>
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
          <span className="ut-sum-val">{blockers.length}</span>
          <span className="ut-sum-lbl">blockers</span>
        </div>
        <div className="ut-sum-stat">
          <span className="ut-sum-val">{fmtMins(weekTotal)}</span>
          <span className="ut-sum-lbl">this week</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="ut-tabs">
        {[['blockers','🚨 Blockers'],['today','📅 Today'],['week','📊 Week'],['limits','⏱ Limits']].map(([k, lbl]) => (
          <button key={k} className={`ut-tab${activeTab === k ? ' active' : ''}`}
            onClick={() => setActiveTab(k)}>{lbl}</button>
        ))}
      </div>

      {/* ── BLOCKERS TAB ── */}
      {activeTab === 'blockers' && (
        <div className="ut-tab-content">

          {/* Android-only notice on web */}
          {!Capacitor.isNativePlatform() && (
            <div className="ut-blocker-webnotice">
              <span>📱</span>
              <span>Automatic tracking works in the Android app. On web you can still set up your blockers and goals.</span>
            </div>
          )}

          {/* Permission banner */}
          {Capacitor.isNativePlatform() && !permGranted && (
            <div className="ut-perm-banner">
              <div className="ut-perm-text">
                <strong>Usage Access required</strong>
                <span>To automatically track distractions, grant Usage Access in Android settings.</span>
              </div>
              <button className="btn-primary btn-sm" onClick={enableTracking}>
                Grant access →
              </button>
            </div>
          )}

          {/* Tracking status */}
          {Capacitor.isNativePlatform() && permGranted && (
            <div className={`ut-tracking-status ${isTracking ? 'active' : ''}`}>
              <div className="ut-tracking-dot" />
              <span className="ut-tracking-label">{isTracking ? 'Tracking active' : 'Tracking off'}</span>
              <button
                className={isTracking ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                disabled={trackLoading}
                onClick={isTracking ? disableTracking : enableTracking}>
                {trackLoading ? '…' : isTracking ? 'Stop' : 'Start tracking'}
              </button>
            </div>
          )}

          {/* Blockers list */}
          {blockers.length === 0 ? (
            <div className="ut-empty">
              <div style={{ fontSize: 40 }}>🚫</div>
              <p>No distraction apps added yet. Add one and we'll track it — and shame you when you go over your limit.</p>
              <button className="btn-primary" onClick={() => setShowAddBlocker(true)}>
                + Add distraction app
              </button>
            </div>
          ) : (
            <div className="ut-section">
              <div className="ut-section-title">Distraction apps</div>
              {blockers.map(b => {
                const usedMin = nativeUsage[b.package_name] ?? null
                const overLimit = usedMin !== null && usedMin >= b.daily_limit_minutes
                return (
                  <div key={b.id} className={`ut-blocker-row${overLimit ? ' over-limit' : ''}`}>
                    <span className="ut-blocker-emoji">{b.emoji}</span>
                    <div className="ut-blocker-info">
                      <div className="ut-blocker-name">{b.app_name}</div>
                      <div className="ut-blocker-goal">🎯 {b.major_goal}</div>
                      <div className="ut-blocker-meta">
                        Limit: {fmtMins(b.daily_limit_minutes)}
                        {usedMin !== null && (
                          <span className={`ut-blocker-usage ${overLimit ? 'over' : ''}`}>
                            · {fmtMins(usedMin)} used today{overLimit ? ' ⚠️' : ''}
                          </span>
                        )}
                      </div>
                      {usedMin !== null && (
                        <div className="ut-bar-track" style={{ marginTop: 4, maxWidth: 200 }}>
                          <div className="ut-bar-fill" style={{
                            width: `${Math.min((usedMin / b.daily_limit_minutes) * 100, 100)}%`,
                            background: overLimit ? '#ef4444' : 'var(--accent)',
                          }} />
                        </div>
                      )}
                    </div>
                    <button className="ut-del-btn" style={{ opacity: 1 }}
                      onClick={() => deleteBlocker(b.id)} title="Remove">✕</button>
                  </div>
                )
              })}
            </div>
          )}

          {blockers.length > 0 && (
            <button className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => setShowAddBlocker(true)}>+ Add another app</button>
          )}
        </div>
      )}

      {/* ── TODAY TAB ── */}
      {activeTab === 'today' && (
        <div className="ut-tab-content">
          <div className="ut-date-nav">
            <button className="cal-nav-btn" onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().split('T')[0])
            }}>‹</button>
            <span className="ut-date-label">
              {date === todayStr() ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
            </span>
            <button className="cal-nav-btn" onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() + 1)
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
              <div className="ut-section">
                <div className="ut-section-title">By app</div>
                {Object.entries(appTotals)
                  .sort((a, b) => b[1].mins - a[1].mins)
                  .map(([app, { mins, category }]) => {
                    const limit = limits.find(l => l.app_name.toLowerCase() === app.toLowerCase())
                    return (
                      <UsageBar key={app} label={app}
                        emoji={getCatEmoji(category)} mins={mins}
                        limitMins={limit?.daily_limit_min} color={getCatColor(category)} />
                    )
                  })}
              </div>
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
                    emoji={getCatEmoji(cat)} mins={mins} limitMins={null} color={getCatColor(cat)} />
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
              <p>No limits set yet.</p>
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
                    <span className="ut-entry-dur">{fmtMins(todayUsed)} / {fmtMins(l.daily_limit_min)}</span>
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
