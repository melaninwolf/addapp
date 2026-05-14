import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import './FocusSession.css'

const SESSION_TYPES = [
  { value: 'deep_work', label: 'Deep Work', emoji: '🧠' },
  { value: 'study',     label: 'Study',     emoji: '📚' },
  { value: 'creative',  label: 'Creative',  emoji: '🎨' },
  { value: 'admin',     label: 'Admin',     emoji: '📋' },
  { value: 'planning',  label: 'Planning',  emoji: '🗓️' },
  { value: 'other',     label: 'Other',     emoji: '⚡' },
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

  // ── Session record ──
  const [notes, setNotes]           = useState('')
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionId, setSessionId]   = useState(null)

  // ── UI ──
  const [confirmStop, setConfirmStop] = useState(false)

  const intervalRef = useRef(null)

  // ── Load active projects ──
  useEffect(() => {
    if (!userId) return
    supabase
      .from('projects')
      .select('id, name, color')
      .eq('user_id', userId)
      .in('status', ['not_started', 'active', 'hold'])
      .order('name')
      .then(({ data }) => setProjects(data || []))
  }, [userId])

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
    const { data } = await supabase
      .from('focus_sessions')
      .insert({
        user_id:          userId,
        project_id:       projectId || null,
        session_type:     sessionType,
        duration_minutes: FOCUS_MINS,
        started_at:       sessionStart,
        completed_at:     new Date().toISOString(),
        session_number:   (completedCount % SET_SIZE) + 1,
      })
      .select('id')
      .single()
    if (data) setSessionId(data.id)
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
          <h1 className="focus-heading">Focus Session</h1>

          {/* Session position dots */}
          <div className="focus-set-info">
            <span className="focus-set-label">
              Session {posInSet + 1} of {SET_SIZE}
            </span>
            <div className="focus-dots">
              {Array.from({ length: SET_SIZE }, (_, i) => (
                <div
                  key={i}
                  className={`focus-dot${i < posInSet ? ' focus-dot-done' : ''}${i === posInSet ? ' focus-dot-next' : ''}`}
                />
              ))}
            </div>
          </div>

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
                <span>{t.label}</span>
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
              <div className="focus-timer-label">focus</div>
            </div>
          </div>

          {/* Set position */}
          <div className="focus-set-row">
            <div className="focus-dots">
              {Array.from({ length: SET_SIZE }, (_, i) => (
                <div
                  key={i}
                  className={`focus-dot${i < posInSet ? ' focus-dot-done' : ''}${i === posInSet ? ' focus-dot-active' : ''}`}
                />
              ))}
            </div>
            <span className="focus-set-label">Session {posInSet + 1} of {SET_SIZE}</span>
          </div>

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
