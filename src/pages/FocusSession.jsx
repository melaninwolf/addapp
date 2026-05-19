import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { addMAM, MAM_FOCUS } from '../xp'
import './FocusSession.css'

const SESSION_TYPES = [
  { value: 'deep_work', label: 'Deep work',  emoji: '🧠', sub: 'High-effort thinking' },
  { value: 'study',     label: 'Study',      emoji: '📚', sub: 'Learning something'   },
  { value: 'creative',  label: 'Creative',   emoji: '🎨', sub: 'Making something'     },
  { value: 'admin',     label: 'Admin',      emoji: '📋', sub: 'Logistics, email'     },
  { value: 'planning',  label: 'Planning',   emoji: '🗓️', sub: 'Mapping things out'  },
  { value: 'other',     label: 'Other',      emoji: '⚡', sub: 'Something else'       },
]

const FOCUS_MOTTOS = [
  'Phone in another room? Tabs closed? You\'re doing great.',
  'One thing. Just this.',
  'The work is the point. Keep going.',
  'Every minute here counts.',
  'Deep in it. Stay.',
]

const FOCUS_MINS       = 25
const SHORT_BREAK_MINS = 5
const LONG_BREAK_MINS  = 15
const FOCUS_SECS       = FOCUS_MINS * 60
const SHORT_BREAK_SECS = SHORT_BREAK_MINS * 60
const LONG_BREAK_SECS  = LONG_BREAK_MINS * 60
const SET_SIZE         = 4

// Ring constants
const R    = 88
const CIRC = 2 * Math.PI * R

function fmt(secs) {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
}

function notify(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  }
}

export default function FocusSession({ userId }) {
  // ── Core state ──
  const [phase, setPhase]                   = useState('idle')   // idle | focusing | done | break
  const [timeLeft, setTimeLeft]             = useState(FOCUS_SECS)
  const [running, setRunning]               = useState(false)
  const [timerEnded, setTimerEnded]         = useState(false)
  const [completedCount, setCompletedCount] = useState(0)        // sessions done this streak
  const [breakTotal, setBreakTotal]         = useState(SHORT_BREAK_SECS)

  // ── Session config ──
  const [sessionType, setSessionType] = useState('deep_work')
  const [projectId, setProjectId]     = useState('')
  const [projects, setProjects]       = useState([])
  const [hobbyId,  setHobbyId]        = useState('')
  const [hobbies,  setHobbies]        = useState([])
  const [hobbyCredited, setHobbyCredited] = useState(null) // { name, minutes } shown on done screen

  // ── Session record ──
  const [notes, setNotes]           = useState('')
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionId, setSessionId]   = useState(null)

  // ── UI ──
  const [confirmStop, setConfirmStop] = useState(false)

  const intervalRef = useRef(null)
  const hiddenAtRef = useRef(null)   // Page Visibility: when tab was hidden
  const runningRef  = useRef(false)  // always-current mirror of running state

  // ── Load active projects + hobbies ──
  useEffect(() => {
    if (!userId) return
    supabase
      .from('projects')
      .select('id, name, color')
      .eq('user_id', userId)
      .in('status', ['not_started', 'active', 'hold'])
      .order('name')
      .then(({ data }) => setProjects(data || []))
    supabase
      .from('hobbies')
      .select('id, name, tree_type')
      .eq('user_id', userId)
      .order('name')
      .then(({ data }) => setHobbies(data || []))
  }, [userId])

  // Keep runningRef in sync so visibility handler always sees current value
  useEffect(() => { runningRef.current = running }, [running])

  // Page Visibility API — recover time lost while tab was backgrounded on mobile
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
      } else {
        if (hiddenAtRef.current !== null && runningRef.current) {
          const secondsAway = Math.floor((Date.now() - hiddenAtRef.current) / 1000)
          if (secondsAway > 0) {
            setTimeLeft(t => {
              const next = t - secondsAway
              if (next <= 0) {
                // Timer would have expired while away — trigger natural end
                setRunning(false)
                setTimerEnded(true)
                return 0
              }
              return next
            })
          }
        }
        hiddenAtRef.current = null
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // ── Timer tick ──
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            setTimerEnded(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  // ── Handle natural timer end ──
  useEffect(() => {
    if (!timerEnded) return
    setTimerEnded(false)
    if (phase === 'focusing') {
      setPhase('done')
      doSaveSession()
      notify('Session complete! 🎉', 'Time for a well-earned break.')
    } else if (phase === 'break') {
      setPhase('idle')
      setTimeLeft(FOCUS_SECS)
      notify('Break over!', 'Ready for your next session?')
    }
  }, [timerEnded, phase]) // eslint-disable-line

  // ── Supabase: save session on completion ──
  async function doSaveSession() {
    if (!userId) return
    const completedAt = new Date().toISOString()

    const { data } = await supabase
      .from('focus_sessions')
      .insert({
        user_id:          userId,
        project_id:       projectId || null,
        session_type:     sessionType,
        duration_minutes: FOCUS_MINS,
        started_at:       sessionStart,
        completed_at:     completedAt,
        session_number:   (completedCount % SET_SIZE) + 1,
      })
      .select('id')
      .single()
    if (data) setSessionId(data.id)

    // Credit minutes to hobby if one was selected
    if (hobbyId) {
      const hobby = hobbies.find(h => h.id === hobbyId)
      if (hobby) {
        // Insert session log
        await supabase.from('hobby_sessions').insert({
          hobby_id:         hobbyId,
          user_id:          userId,
          session_date:     completedAt.split('T')[0],
          duration_minutes: FOCUS_MINS,
          notes:            `Focus session — ${SESSION_TYPES.find(t => t.value === sessionType)?.label || sessionType}`,
        })
        // Update hobby totals
        await supabase.from('hobbies').update({
          total_minutes:   (hobby.total_minutes || 0) + FOCUS_MINS,
          last_session_at: completedAt,
        }).eq('id', hobbyId)
        setHobbyCredited({ name: hobby.name, minutes: FOCUS_MINS })
      }
    }

    // Award MAM grams for completing the session
    addMAM(MAM_FOCUS)

    // Let project detail page know to refresh its counter
    window.dispatchEvent(new CustomEvent('focus-session-saved', { detail: { projectId } }))
  }

  // ── Supabase: patch notes onto saved session ──
  async function patchNotes(text) {
    if (!sessionId || !text.trim()) return
    await supabase.from('focus_sessions').update({ notes: text.trim() }).eq('id', sessionId)
  }

  // ── Actions ──
  function startSession() {
    setPhase('focusing')
    setTimeLeft(FOCUS_SECS)
    setSessionStart(new Date().toISOString())
    setNotes('')
    setSessionId(null)
    setConfirmStop(false)
    setHobbyCredited(null)
    setRunning(true)
  }

  function startBreak(currentNotes) {
    if (currentNotes?.trim()) patchNotes(currentNotes)
    const newCount = completedCount + 1
    setCompletedCount(newCount)
    const isLong    = newCount % SET_SIZE === 0
    const breakSecs = isLong ? LONG_BREAK_SECS : SHORT_BREAK_SECS
    setBreakTotal(breakSecs)
    setTimeLeft(breakSecs)
    setPhase('break')
    setRunning(true)
  }

  function skipBreak() {
    clearInterval(intervalRef.current)
    setRunning(false)
    setPhase('idle')
    setTimeLeft(FOCUS_SECS)
  }

  function stopAll(currentNotes) {
    if (currentNotes?.trim()) patchNotes(currentNotes)
    clearInterval(intervalRef.current)
    setRunning(false)
    setPhase('idle')
    setTimeLeft(FOCUS_SECS)
    setCompletedCount(0)
    setNotes('')
    setSessionId(null)
    setConfirmStop(false)
  }

  // ── Derived ──
  const motto = FOCUS_MOTTOS[Math.floor(Date.now() / 1000 / 60) % FOCUS_MOTTOS.length]
  const posInSet       = completedCount % SET_SIZE              // 0-3 done in current set
  const nextBreakMins  = (completedCount + 1) % SET_SIZE === 0  // after NEXT session
    ? LONG_BREAK_MINS : SHORT_BREAK_MINS
  const isLongBreak    = breakTotal === LONG_BREAK_SECS

  const ringTotal  = phase === 'break' ? breakTotal : FOCUS_SECS
  const progress   = ringTotal > 0 ? (ringTotal - timeLeft) / ringTotal : 0
  const dashOffset = CIRC * (1 - progress)

  const typeInfo    = SESSION_TYPES.find(t => t.value === sessionType) || SESSION_TYPES[0]
  const projectInfo = projects.find(p => p.id === projectId)

  // ── Render ──
  return (
    <div className="focus-page">

      {/* ════════════ IDLE ════════════ */}
      {phase === 'idle' && (
        <div className="focus-idle">
          {/* Session position */}
          <div className="focus-set-info">
            <span className="focus-session-counter">SESSION {posInSet + 1} OF {SET_SIZE}</span>
            <div className="focus-dots">
              {Array.from({ length: SET_SIZE }, (_, i) => (
                <div
                  key={i}
                  className={`focus-dot${i < posInSet ? ' focus-dot-done' : ''}${i === posInSet ? ' focus-dot-next' : ''}`}
                />
              ))}
            </div>
            <p className="focus-long-break-hint">
              {posInSet === SET_SIZE - 1 ? '🌿 Long break after this one' : `Long break after #${SET_SIZE}`}
            </p>
          </div>

          <div className="focus-duration-label">{FOCUS_MINS} minutes of one thing</div>

          {/* Session type */}
          <div className="focus-section-label">Session type</div>
          <div className="focus-types">
            {SESSION_TYPES.map(t => (
              <button
                key={t.value}
                className={`focus-type-btn${sessionType === t.value ? ' active' : ''}`}
                onClick={() => setSessionType(t.value)}
              >
                <span className="fs-type-emoji">{t.emoji}</span>
                <div className="fs-type-text">
                  <span className="fs-type-label">{t.label}</span>
                  <span className="fs-type-sub">{t.sub}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Project */}
          {projects.length > 0 && (
            <div className="focus-field">
              <label className="focus-section-label">
                Log against project
                <span className="focus-optional"> — optional</span>
              </label>
              <select
                className="focus-select"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">— No project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Hobby dedication */}
          {hobbies.length > 0 && (
            <div className="focus-field">
              <label className="focus-section-label">
                Dedicate to a hobby
                <span className="focus-optional"> — optional</span>
              </label>
              <select
                className="focus-select"
                value={hobbyId}
                onChange={e => setHobbyId(e.target.value)}
              >
                <option value="">— No hobby —</option>
                {hobbies.map(h => (
                  <option key={h.id} value={h.id}>🌳 {h.name}</option>
                ))}
              </select>
              {hobbyId && (
                <p className="focus-hobby-hint">
                  {FOCUS_MINS} min will grow your {hobbies.find(h => h.id === hobbyId)?.name} tree 🌱
                </p>
              )}
            </div>
          )}

          {/* Break hint */}
          <p className="focus-break-hint">
            Next break: <strong>{nextBreakMins} min</strong>
            {nextBreakMins === LONG_BREAK_MINS ? ' 🌿 long break' : ' ☕ short break'}
          </p>

          <button className="focus-start-btn" onClick={startSession}>
            Start {FOCUS_MINS} min session
          </button>
        </div>
      )}

      {/* ════════════ FOCUSING ════════════ */}
      {phase === 'focusing' && (
        <div className="focus-active">
          {/* Meta row */}
          <div className="focus-meta-row">
            <span className="focus-meta-badge">{typeInfo.emoji} {typeInfo.label}</span>
            {projectInfo && (
              <span className="focus-meta-badge focus-meta-project">📁 {projectInfo.name}</span>
            )}
          </div>

          {/* Ring timer */}
          <div className="focus-ring-wrap">
            <svg className="focus-ring-svg" viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r={R} className="focus-ring-track" />
              <circle
                cx="100" cy="100" r={R}
                className="focus-ring-fill"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="focus-ring-inner">
              <div className="focus-timer-display">{fmt(timeLeft)}</div>
              <div className="focus-timer-label">remaining · focus</div>
            </div>
          </div>

          {/* Set position */}
          <div className="focus-set-row">
            <span className="focus-session-counter">SESSION {posInSet + 1} OF {SET_SIZE}</span>
          </div>

          {/* Motivational nudge */}
          <p className="focus-motto">● {motto}</p>

          {/* Controls */}
          <div className="focus-controls">
            <button
              className="focus-ctrl-btn"
              onClick={() => { setRunning(r => !r); setConfirmStop(false) }}
            >
              {running ? '⏸ Pause' : '▶ Resume'}
            </button>

            {!confirmStop ? (
              <button
                className="focus-ctrl-btn focus-ctrl-danger"
                onClick={() => setConfirmStop(true)}
              >
                ✕ Stop
              </button>
            ) : (
              <div className="focus-confirm-row">
                <span className="focus-confirm-text">End this session?</span>
                <button className="focus-confirm-yes" onClick={() => stopAll('')}>Yes, stop</button>
                <button className="focus-confirm-no" onClick={() => setConfirmStop(false)}>Keep going</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ DONE ════════════ */}
      {phase === 'done' && (
        <div className="focus-done">
          <div className="focus-done-icon">🎉</div>
          <h2 className="focus-done-title">Session {posInSet + 1} complete!</h2>
          <p className="focus-done-sub">
            {typeInfo.emoji} {typeInfo.label}
            {projectInfo && <> · 📁 {projectInfo.name}</>}
          </p>

          {hobbyCredited && (
            <div className="focus-hobby-credit">
              🌳 <strong>+{hobbyCredited.minutes} min</strong> added to <em>{hobbyCredited.name}</em>
            </div>
          )}

          {/* Notes */}
          <div className="focus-field">
            <label className="focus-section-label">
              Session notes
              <span className="focus-optional"> — optional</span>
            </label>
            <textarea
              className="focus-notes-ta"
              placeholder="What did you work on? Any blockers?"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="focus-done-actions">
            <button className="focus-start-btn" onClick={() => startBreak(notes)}>
              Start {(completedCount + 1) % SET_SIZE === 0 ? `${LONG_BREAK_MINS} min` : `${SHORT_BREAK_MINS} min`} break
              {(completedCount + 1) % SET_SIZE === 0 ? ' 🌿' : ' ☕'}
            </button>
            <button className="focus-secondary-btn" onClick={() => stopAll(notes)}>
              Stop here
            </button>
          </div>
        </div>
      )}

      {/* ════════════ BREAK ════════════ */}
      {phase === 'break' && (
        <div className="focus-break">
          <p className="focus-break-heading">
            {isLongBreak ? '🌿 Long break' : '☕ Short break'}
          </p>
          <p className="focus-break-sub">
            {completedCount} of {SET_SIZE} sessions done
            {completedCount % SET_SIZE === 0 && completedCount > 0 && ' · set complete!'}
          </p>

          {/* Ring timer */}
          <div className="focus-ring-wrap">
            <svg className="focus-ring-svg" viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r={R} className="focus-ring-track" />
              <circle
                cx="100" cy="100" r={R}
                className={`focus-ring-fill${isLongBreak ? ' focus-ring-long' : ' focus-ring-short'}`}
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="focus-ring-inner">
              <div className="focus-timer-display">{fmt(timeLeft)}</div>
              <div className="focus-timer-label">break</div>
            </div>
          </div>

          {/* Controls */}
          <div className="focus-controls">
            <button
              className="focus-ctrl-btn"
              onClick={() => setRunning(r => !r)}
            >
              {running ? '⏸ Pause' : '▶ Resume'}
            </button>
            <button className="focus-ctrl-btn" onClick={skipBreak}>
              Skip →
            </button>
          </div>

          <button
            className="focus-secondary-btn"
            style={{ marginTop: '1.5rem' }}
            onClick={() => stopAll('')}
          >
            End session streak
          </button>
        </div>
      )}

    </div>
  )
}
