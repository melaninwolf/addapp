import { useState, useEffect, useRef } from 'react'
import './Routines.css'

const SAMPLE_ROUTINES = [
  {
    id: 1, name: 'Morning Routine', time: '07:00', emoji: '🌅', days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [
      { id: 1, name: 'Drink a glass of water', dur: 2 },
      { id: 2, name: 'Take medication', dur: 1 },
      { id: 3, name: 'Shower & get dressed', dur: 20 },
      { id: 4, name: 'Eat breakfast', dur: 15 },
      { id: 5, name: "Review today's tasks", dur: 5 },
    ]
  },
  {
    id: 2, name: 'Night Routine', time: '21:30', emoji: '🌙', days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [
      { id: 1, name: 'Put phone away', dur: 1 },
      { id: 2, name: 'Journal — 3 wins today', dur: 5 },
      { id: 3, name: "Lay out tomorrow's clothes", dur: 3 },
      { id: 4, name: 'Read (no screens)', dur: 20 },
      { id: 5, name: 'Lights out', dur: 1 },
    ]
  }
]

function fmtTime(t) {
  const [h, m] = t.split(':')
  const hh = parseInt(h)
  return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`
}


const ALL_DAYS = ['mon','tue','wed','thu','fri','sat','sun']
const DAY_LABELS = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' }

function fmtDays(days) {
  if (!days || days.length === 0) return 'No days'
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) return 'Weekdays'
  if (days.length === 2 && days.includes('sat') && days.includes('sun')) return 'Weekends'
  return days.map(d => DAY_LABELS[d]).join(', ')
}

function totalMins(steps) {
  return steps.reduce((a, s) => a + s.dur, 0)
}

function formatTimer(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function RoutineModal({ routine, onSave, onClose }) {
  const [name, setName] = useState(routine?.name || '')
  const [time, setTime] = useState(routine?.time || '07:00')
  const [emoji, setEmoji] = useState(routine?.emoji || '⚡')
  const [days, setDays] = useState(routine?.days || ['mon','tue','wed','thu','fri','sat','sun'])
  const [steps, setSteps] = useState(
    routine?.steps.map(s => ({ ...s })) || [{ id: Date.now(), name: '', dur: 5 }]
  )

  function addStep() {
    setSteps(s => [...s, { id: Date.now(), name: '', dur: 5 }])
  }
  function removeStep(id) {
    setSteps(s => s.filter(x => x.id !== id))
  }
  function updateStep(id, field, val) {
    setSteps(s => s.map(x => x.id === id ? { ...x, [field]: val } : x))
  }

  function save() {
    if (!name.trim() || steps.filter(s => s.name.trim()).length === 0) return
    onSave({ name: name.trim(), time, days, emoji, steps: steps.filter(s => s.name.trim()) })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{routine ? 'Edit routine' : 'New routine'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-row-inline">
            <div className="field" style={{width:52}}>
              <label>Icon</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2} className="emoji-input" />
            </div>
            <div className="field" style={{flex:1}}>
              <label>Routine name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning routine" />
            </div>
            <div className="field" style={{width:120}}>
              <label>Start time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          <div className="field" style={{marginBottom:'1rem'}}>
            <label>Repeat on</label>
            <div className="day-quick-row">
              {[['everyday',['mon','tue','wed','thu','fri','sat','sun']],['weekdays',['mon','tue','wed','thu','fri']],['weekends',['sat','sun']]].map(([label, val]) => (
                <button key={label} type="button"
                  className={`day-quick ${JSON.stringify(days.sort()) === JSON.stringify([...val].sort()) ? 'active' : ''}`}
                  onClick={() => setDays(val)}>{label}</button>
              ))}
            </div>
            <div className="day-picker">
              {ALL_DAYS.map(d => (
                <button key={d} type="button"
                  className={`day-btn ${days.includes(d) ? 'active' : ''}`}
                  onClick={() => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}>
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="steps-section">
            <label className="steps-label">Steps</label>
            {steps.map((s, i) => (
              <div key={s.id} className="step-edit-row">
                <span className="step-num">{i + 1}</span>
                <input
                  className="step-name-input"
                  value={s.name}
                  onChange={e => updateStep(s.id, 'name', e.target.value)}
                  placeholder="Step name"
                />
                <input
                  type="number"
                  className="step-dur-input"
                  value={s.dur}
                  min={1} max={120}
                  onChange={e => updateStep(s.id, 'dur', Math.max(1, parseInt(e.target.value) || 1))}
                />
                <span className="step-min-label">min</span>
                <button className="step-remove" onClick={() => removeStep(s.id)}>×</button>
              </div>
            ))}
            <button className="add-step-btn" onClick={addStep}>+ Add step</button>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save routine</button>
        </div>
      </div>
    </div>
  )
}

// ─── RUNNER ──────────────────────────────────────────────────────────────────
function RoutineRunner({ routine, onFinish }) {
  const [queue, setQueue] = useState(routine.steps.map(s => ({ ...s, deferred: false })))
  const [deferred, setDeferred] = useState([])
  const [stepIdx, setStepIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const [skipped, setSkipped] = useState([])
  const [finished, setFinished] = useState(false)
  const [toast, setToast] = useState('')
  const [stepLog, setStepLog] = useState([])
  const [paused, setPaused] = useState(false)
  const timerRef = useRef(null)

  const step = queue[stepIdx]
  const isDeferred = step?.deferred || false
  const totalSecs = step ? step.dur * 60 : 0
  const isOverTime = elapsed > totalSecs
  const pct = totalSecs > 0 ? Math.min(100, Math.round((elapsed / totalSecs) * 100)) : 0
  const upcoming = queue.slice(stepIdx + 1)

  useEffect(() => { setElapsed(0); setPaused(false) }, [stepIdx])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    clearInterval(timerRef.current)
    if (!paused) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [stepIdx, paused])

  useEffect(() => {
    if (elapsed === totalSecs && step && totalSecs > 0) {
      showToast(`Time's up for "${step.name}" — mark done, skip, or do later!`)
    }
  }, [elapsed])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      if (type === 'step') {
        osc.frequency.setValueAtTime(660, ctx.currentTime)
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.3)
      } else {
        osc.frequency.setValueAtTime(523, ctx.currentTime)
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15)
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.6)
      }
    } catch(e) {}
  }

  function resetTimer() { setElapsed(0) }

  function fireStepNotif(currentName, nextName) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    try {
      new Notification(`${currentName} is done`, {
        body: `Next: ${nextName}`,
        tag: 'addapp-step',
        renotify: true,
      })
    } catch(e) {}
  }

  function fireNotif(xp) {
    if (!('Notification' in window)) return
    const send = () => {
      try {
        new Notification(`${routine.name} complete! 🎉`, {
          body: `You earned +${xp} XP. Tap to see your breakdown.`,
          requireInteraction: true,
          tag: 'addapp-routine-complete',
          renotify: true,
        })
      } catch(e) { console.log('Notification error:', e) }
    }
    if (Notification.permission === 'granted') send()
    else if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { if (p === 'granted') send() })
    }
  }

  function advance(newQueue, newDeferred, newDoneCount, newSkipped, logEntry) {
    const newLog = logEntry ? [...stepLog, logEntry] : stepLog
    const nextIdx = stepIdx + 1
    if (nextIdx >= newQueue.length) {
      clearInterval(timerRef.current)
      setStepLog(newLog)
      setQueue(newQueue)
      setDeferred(newDeferred)
      setDoneCount(newDoneCount)
      setSkipped(newSkipped)
      setFinished(true)
      playSound('finish')
      fireNotif(newDoneCount * 10)
    } else {
      setStepLog(newLog)
      setQueue(newQueue)
      setDeferred(newDeferred)
      setDoneCount(newDoneCount)
      setSkipped(newSkipped)
      playSound('step')
      setStepIdx(nextIdx)
    }
  }

  function handleDone() {
    const nextStep = queue[stepIdx + 1]
    if (nextStep) fireStepNotif(step.name, nextStep.name)
    const log = { name: step.name, target: step.dur * 60, actual: elapsed, status: 'done' }
    advance(queue, deferred, doneCount + 1, skipped, log)
  }

  function handleSkip() {
    const log = { name: step.name, target: step.dur * 60, actual: elapsed, status: 'skipped' }
    advance(queue, deferred, doneCount, [...skipped, step], log)
  }

  function handleLater() {
    const newQueue = [...queue]
    newQueue.splice(stepIdx, 1)
    const deferredStep = { ...step, deferred: true }
    newQueue.push(deferredStep)
    const newDeferred = [...deferred, deferredStep]
    showToast(`"${step.name}" moved to end of routine`)
    if (stepIdx >= newQueue.length) {
      clearInterval(timerRef.current)
      const log = { name: step.name, target: step.dur * 60, actual: elapsed, status: 'deferred' }
      const newLog = [...stepLog, log]
      setStepLog(newLog)
      setQueue(newQueue)
      setDeferred(newDeferred)
      setFinished(true)
      fireNotif(doneCount * 10)
    } else {
      setQueue(newQueue)
      setDeferred(newDeferred)
      setElapsed(0)
    }
  }

  if (finished) {
    const xp = doneCount * 10
    const totalTarget = stepLog.reduce((a, s) => a + s.target, 0)
    const totalActual = stepLog.reduce((a, s) => a + s.actual, 0)
    const allPerfect = doneCount === routine.steps.length
    return (
      <div className="runner-complete">
        <div className="complete-emoji">{allPerfect ? '🎉' : '✅'}</div>
        <h2 className="complete-title">{allPerfect ? 'Perfect routine!' : 'Routine finished!'}</h2>
        <div className="complete-xp">+{xp} XP</div>
        <div className="analysis-totals">
          <div className="analysis-total-item">
            <span className="at-label">Time planned</span>
            <span className="at-value">{formatTimer(totalTarget)}</span>
          </div>
          <div className="analysis-divider">vs</div>
          <div className="analysis-total-item">
            <span className="at-label">Time taken</span>
            <span className={`at-value ${totalActual > totalTarget ? 'over' : 'under'}`}>{formatTimer(totalActual)}</span>
          </div>
        </div>
        <div className="analysis-list">
          <div className="analysis-list-label">Step breakdown</div>
          {stepLog.map((s, i) => {
            const diff = s.actual - s.target
            const isOver = diff > 0
            const maxVal = Math.max(s.target, s.actual, 1)
            const actualPct = Math.round((s.actual / maxVal) * 100)
            const targetPct = Math.round((s.target / maxVal) * 100)
            return (
              <div key={i} className="analysis-row">
                <div className="analysis-row-top">
                  <span className="analysis-step-name">{s.name}</span>
                  <span className={`analysis-badge ${s.status === 'done' ? (isOver ? 'over' : 'ontime') : s.status}`}>
                    {s.status === 'done' ? (isOver ? 'over time' : 'on time') : s.status}
                  </span>
                </div>
                <div className="analysis-bar-track">
                  <div className={`analysis-bar-fill ${isOver ? 'over' : 'under'}`} style={{width: actualPct+'%'}} />
                  <div className="analysis-bar-marker" style={{left: targetPct+'%'}} />
                </div>
                <div className="analysis-row-times">
                  <span className="art-actual">{formatTimer(s.actual)} taken</span>
                  <span className={`art-diff ${isOver ? 'over' : 'under'}`}>
                    {isOver ? '+' : '-'}{formatTimer(Math.abs(diff))} {isOver ? 'over' : 'under'}
                  </span>
                  <span className="art-target">{formatTimer(s.target)} planned</span>
                </div>
              </div>
            )
          })}
        </div>
        <button className="btn-primary" style={{marginTop:'1.5rem'}} onClick={onFinish}>Back to routines</button>
      </div>
    )
  }

  return (
    <div className="runner">
      {toast && <div className="runner-toast">{toast}</div>}

      <div className="runner-header">
        <button className="btn-ghost-sm" onClick={onFinish}>← Exit</button>
        <div className="runner-title">{routine.emoji} {routine.name}</div>
        <div className="runner-prog">{stepIdx + 1} / {queue.length}</div>
      </div>

      <div className={`step-card ${isDeferred ? 'deferred' : ''} ${isOverTime ? 'overtime' : ''}`}>
        <div className="step-card-top-row">
          <div className="step-card-label">{isDeferred ? '🔁 deferred step' : 'current step'}</div>
          <button className="pause-timer-btn" onClick={() => setPaused(p => !p)} title={paused ? 'Resume' : 'Pause'}>
            {paused ? '▶' : '⏸'}
          </button>
          <button className="reset-timer-btn" onClick={resetTimer} title="Reset timer">↺</button>
        </div>
        <div className="step-card-name">{step?.name}</div>
        <div className="step-card-timer">{formatTimer(elapsed)}<span className="step-card-limit"> / {step?.dur}m</span></div>
        <div className="step-timer-track">
          <div className="step-timer-fill" style={{ width: pct + '%' }} />
        </div>
        <div className="step-actions">
          <button className="act-done" onClick={handleDone}>✓ Done</button>
          <button className="act-skip" onClick={handleSkip}>Skip</button>
          {upcoming.length > 0 && (
            <button className="act-later" onClick={handleLater}>Do later ↓</button>
          )}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="upcoming">
          <div className="upcoming-label">Up next</div>
          {upcoming.map((s, i) => (
            <div key={s.id + '-' + i} className={`upcoming-item ${s.deferred ? 'up-deferred' : ''}`}>
              <span className="up-n">{stepIdx + 2 + i}</span>
              <span className="up-name">{s.name}</span>
              {s.deferred && <span className="up-tag">deferred</span>}
              <span className="up-dur">{s.dur}m</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Routines() {
  const [routines, setRoutines] = useState(SAMPLE_ROUTINES)
  const [modal, setModal] = useState(null) // null | 'new' | routine obj
  const [running, setRunning] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // null | routine obj
  const nextId = useRef(10)

  function saveRoutine(data) {
    if (modal?.id) {
      setRoutines(r => r.map(x => x.id === modal.id ? { ...x, ...data } : x))
    } else {
      setRoutines(r => [...r, { id: nextId.current++, ...data }])
    }
    setModal(null)
  }

  function deleteRoutine(id) {
    setRoutines(r => r.filter(x => x.id !== id))
  }

  if (running) {
    return <RoutineRunner routine={running} onFinish={() => setRunning(null)} />
  }

  return (
    <div className="routines-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Routines</h1>
          <p className="page-sub">Build habits that stick. One step at a time.</p>
        </div>
        <button className="btn-primary" onClick={() => setModal('new')}>+ New routine</button>
      </div>

      {routines.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">⚡</div>
          <h3>No routines yet</h3>
          <p>Create your first routine to get started</p>
          <button className="btn-primary" onClick={() => setModal('new')}>Create routine</button>
        </div>
      ) : (
        <div className="routine-grid">
          {routines.map(r => (
            <div key={r.id} className="routine-card">
              <div className="rc-top">
                <div className="rc-emoji">{r.emoji}</div>
                <div className="rc-info">
                  <div className="rc-name">{r.name}</div>
                  <div className="rc-meta">{fmtTime(r.time)} &middot; {fmtDays(r.days)}</div>
                  <div className="rc-meta">{r.steps.length} steps &middot; {totalMins(r.steps)} min</div>
                </div>
              </div>
              <div className="rc-steps">
                {r.steps.slice(0, 4).map((s, i) => (
                  <div key={i} className="rc-step-row">
                    <span className="rc-step-dot" />
                    <span className="rc-step-name">{s.name}</span>
                    <span className="rc-step-dur">{s.dur}m</span>
                  </div>
                ))}
                {r.steps.length > 4 && (
                  <div className="rc-more">+{r.steps.length - 4} more steps</div>
                )}
              </div>
              <div className="rc-actions">
                <button className="btn-primary btn-sm" onClick={() => setRunning(r)}>Start</button>
                <button className="btn-ghost btn-sm" onClick={() => setModal(r)}>Edit</button>
                <button className="btn-danger btn-sm" onClick={() => setDeleteConfirm(r)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <RoutineModal
          routine={modal === 'new' ? null : modal}
          onSave={saveRoutine}
          onClose={() => setModal(null)}
        />
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" style={{maxWidth: 400}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Delete routine</h2>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{fontSize: 14, color: 'var(--text2)', lineHeight: 1.6}}>
                Are you sure you want to delete <strong style={{color: 'var(--text)'}}>"{deleteConfirm.name}"</strong> routine? This can't be undone.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => { deleteRoutine(deleteConfirm.id); setDeleteConfirm(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
