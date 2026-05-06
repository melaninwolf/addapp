import { useState, useEffect, useRef } from 'react'
import './Routines.css'

const SAMPLE_ROUTINES = [
  {
    id: 1, name: 'Morning Routine', time: '07:00', emoji: '🌅',
    steps: [
      { id: 1, name: 'Drink a glass of water', dur: 2 },
      { id: 2, name: 'Take medication', dur: 1 },
      { id: 3, name: 'Shower & get dressed', dur: 20 },
      { id: 4, name: 'Eat breakfast', dur: 15 },
      { id: 5, name: "Review today's tasks", dur: 5 },
    ]
  },
  {
    id: 2, name: 'Night Routine', time: '21:30', emoji: '🌙',
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
    onSave({ name: name.trim(), time, emoji, steps: steps.filter(s => s.name.trim()) })
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
  const timerRef = useRef(null)

  const step = queue[stepIdx]
  const isDeferred = step?.deferred || false
  const totalSecs = step ? step.dur * 60 : 0
  const isOverTime = elapsed > totalSecs
  const pct = totalSecs > 0 ? Math.min(100, Math.round((elapsed / totalSecs) * 100)) : 0
  const upcoming = queue.slice(stepIdx + 1)

  useEffect(() => {
    setElapsed(0)
  }, [stepIdx])

  useEffect(() => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [stepIdx])

  useEffect(() => {
    if (elapsed === totalSecs && step && totalSecs > 0) {
      showToast(`Time's up for "${step.name}" — mark done, skip, or do later!`)
    }
  }, [elapsed])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function advance(newQueue, newDeferred, newDoneCount, newSkipped) {
    const nextIdx = stepIdx + 1
    if (nextIdx >= newQueue.length) {
      clearInterval(timerRef.current)
      setQueue(newQueue)
      setDeferred(newDeferred)
      setDoneCount(newDoneCount)
      setSkipped(newSkipped)
      setFinished(true)
    } else {
      setQueue(newQueue)
      setDeferred(newDeferred)
      setDoneCount(newDoneCount)
      setSkipped(newSkipped)
      setStepIdx(nextIdx)
    }
  }

  function handleDone() {
    advance(queue, deferred, doneCount + 1, skipped)
  }

  function handleSkip() {
    advance(queue, deferred, doneCount, [...skipped, step])
  }

  function handleLater() {
    const newQueue = [...queue]
    newQueue.splice(stepIdx, 1)
    const deferredStep = { ...step, deferred: true }
    newQueue.push(deferredStep)
    const newDeferred = [...deferred, deferredStep]
    showToast(`"${step.name}" moved to end of routine`)
    // don't increment stepIdx — next step slides into current position
    if (stepIdx >= newQueue.length) {
      clearInterval(timerRef.current)
      setQueue(newQueue)
      setDeferred(newDeferred)
      setFinished(true)
    } else {
      setQueue(newQueue)
      setDeferred(newDeferred)
      setElapsed(0)
    }
  }

  if (finished) {
    const xp = doneCount * 10
    return (
      <div className="runner-complete">
        <div className="complete-emoji">{doneCount === routine.steps.length ? '🎉' : '✅'}</div>
        <h2 className="complete-title">
          {doneCount === routine.steps.length ? 'Perfect routine!' : 'Routine finished!'}
        </h2>
        <div className="complete-xp">+{xp} XP</div>
        {skipped.length > 0 && (
          <p className="complete-note">{skipped.length} step{skipped.length > 1 ? 's' : ''} skipped</p>
        )}
        {deferred.filter(d => !queue.some(q => q.id === d.id && !q.deferred)).length > 0 && (
          <p className="complete-note">{deferred.length} deferred — try to fit them in later!</p>
        )}
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
        <div className="step-card-label">{isDeferred ? '🔁 deferred step' : 'current step'}</div>
        <div className="step-card-name">{step?.name}</div>
        <div className="step-card-timer">{formatTimer(elapsed)}<span className="step-card-limit"> / {step?.dur}m</span></div>
        <div className="step-timer-track">
          <div className="step-timer-fill" style={{ width: pct + '%' }} />
        </div>
        <div className="step-actions">
          <button className="act-done" onClick={handleDone}>✓ Done</button>
          <button className="act-skip" onClick={handleSkip}>Skip</button>
          <button className="act-later" onClick={handleLater}>Do later ↓</button>
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
                  <div className="rc-meta">{fmtTime(r.time)} &middot; {r.steps.length} steps &middot; {totalMins(r.steps)} min</div>
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
                <button className="btn-danger btn-sm" onClick={() => deleteRoutine(r.id)}>Delete</button>
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
    </div>
  )
}
