import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { addXP } from '../xp'
import { supabase } from '../supabase'
import EmojiPicker from '../components/EmojiPicker'
import './Routines.css'

const SAMPLE_ROUTINES = [
  {
    id: 1, type: 'routine', name: 'Morning Routine', time: '07:00', emoji: '🌅', days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [
      { id: 1, name: 'Drink a glass of water', dur: 2 },
      { id: 2, name: 'Take medication', dur: 1 },
      { id: 3, name: 'Shower & get dressed', dur: 20 },
      { id: 4, name: 'Eat breakfast', dur: 15 },
      { id: 5, name: "Review today's tasks", dur: 5 },
    ]
  },
  {
    id: 2, type: 'routine', name: 'Night Routine', time: '21:30', emoji: '🌙', days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [
      { id: 1, name: 'Put phone away', dur: 1 },
      { id: 2, name: 'Journal — 3 wins today', dur: 5 },
      { id: 3, name: "Lay out tomorrow's clothes", dur: 3 },
      { id: 4, name: 'Read (no screens)', dur: 20 },
      { id: 5, name: 'Lights out', dur: 1 },
    ]
  },
  {
    id: 3, type: 'routine', name: 'Test Routine', time: '12:00', emoji: '✅', days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [
      { id: 1, name: 'Test step one', dur: 1 },
      { id: 2, name: 'Test step two', dur: 1 },
      { id: 3, name: 'Test step three', dur: 1 },
    ]
  },
  {
    id: 4, type: 'trigger', name: 'Test Trigger', time: null, emoji: '🕹️', days: [],
    steps: [
      { id: 1, name: 'Test trigger step one', dur: 1 },
      { id: 2, name: 'Test trigger step two', dur: 1 },
      { id: 3, name: 'Test trigger step three', dur: 1 },
      { id: 4, name: 'Test trigger step four', dur: 1 },
      { id: 5, name: 'Test trigger step five', dur: 1 },
    ]
  }
]

function fmtTime(t) {
  if (!t) return 'Flexible'
  const [h, m] = t.split(':')
  const hh = parseInt(h)
  return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`
}


const ALL_DAYS = ['mon','tue','wed','thu','fri','sat','sun']
const DAY_LABELS = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' }

function fmtDays(days) {
  if (!days || days.length === 0) return 'Flexible'
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
  const [type, setType] = useState(routine?.type || 'routine')
  const [hasTime, setHasTime] = useState(!!routine?.time)
  const [hasDays, setHasDays] = useState(!!(routine?.days?.length))
  const [steps, setSteps] = useState(
    routine?.steps.map(s => ({ ...s })) || [{ id: Date.now(), name: '', dur: 5 }]
  )
  const [dragIdx,     setDragIdx]     = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  function moveStep(from, to) {
    if (from === to) return
    setSteps(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function addStep() {
    if (type === 'trigger' && steps.length >= 5) return
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
    onSave({ name: name.trim(), time: hasTime ? time : null, days: hasDays ? days : [], emoji, type, steps: steps.filter(s => s.name.trim()) })
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
              <EmojiPicker value={emoji} onChange={setEmoji} />
            </div>
            <div className="field" style={{flex:1}}>
              <label>Routine name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning routine" />
            </div>
            <div className="field" style={{width:140}}>
              <label>
                <input type="checkbox" checked={hasTime} onChange={e => setHasTime(e.target.checked)} style={{marginRight:6}} />
                Start time
              </label>
              {hasTime
                ? <input type="time" value={time} onChange={e => setTime(e.target.value)} />
                : <div className="flexible-badge">Flexible</div>
              }
            </div>
          </div>

          <div className="field" style={{marginBottom:'1rem'}}>
            <label>Type</label>
            <div className="type-toggle">
              <button
                type="button"
                className={`type-btn ${type === 'routine' ? 'active' : ''}`}
                onClick={() => setType('routine')}
              >📋 Routine</button>
              <button
                type="button"
                className={`type-btn ${type === 'trigger' ? 'active' : ''}`}
                onClick={() => setType('trigger')}
              >🕹️ Trigger</button>
            </div>
            {type === 'trigger' && (
              <p className="type-hint">Max 5 steps. Launches a Focus Session when complete.</p>
            )}
          </div>

          <div className="field" style={{marginBottom:'1rem'}}>
            <label>Repeat on</label>
            <div className="day-quick-row">
              <button type="button"
                className={`day-quick ${!hasDays ? 'active' : ''}`}
                onClick={() => setHasDays(false)}>flexible</button>
              {[['everyday',['mon','tue','wed','thu','fri','sat','sun']],['weekdays',['mon','tue','wed','thu','fri']],['weekends',['sat','sun']]].map(([label, val]) => (
                <button key={label} type="button"
                  className={`day-quick ${hasDays && JSON.stringify(days.sort()) === JSON.stringify([...val].sort()) ? 'active' : ''}`}
                  onClick={() => { setHasDays(true); setDays(val) }}>{label}</button>
              ))}
            </div>
            {hasDays && (
              <div className="day-picker">
                {ALL_DAYS.map(d => (
                  <button key={d} type="button"
                    className={`day-btn ${days.includes(d) ? 'active' : ''}`}
                    onClick={() => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}>
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="steps-section">
            <label className="steps-label">Steps</label>
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={`step-edit-row${dragIdx === i ? ' step-dragging' : ''}${dragOverIdx === i && dragIdx !== i ? ' step-drag-over' : ''}`}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(i) }}
                onDrop={() => { moveStep(dragIdx, i); setDragIdx(null); setDragOverIdx(null) }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
              >
                <span className="step-drag-handle" title="Drag to reorder">⠿</span>
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
            {type === 'trigger' && steps.length >= 5
              ? <p className="type-hint" style={{marginTop:'0.5rem'}}>Max 5 steps reached for triggers.</p>
              : <button className="add-step-btn" onClick={addStep}>+ Add step</button>
            }
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
function RoutineRunner({ routine, onFinish, onStartFocus, userId }) {
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
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  // ── Log / time tracking state ──
  const [initState, setInitState]   = useState('loading') // loading | restart | running
  const [existingLog, setExistingLog] = useState(null)
  const [logId, setLogId]           = useState(null)
  const [startedAt, setStartedAt]   = useState(null)
  const [autoPaused, setAutoPaused] = useState(false)
  const autoPausedRef               = useRef(false)

  const timerRef    = useRef(null)
  const hiddenAtRef = useRef(null)
  const pausedRef   = useRef(false)

  const step = queue[stepIdx]
  const isDeferred = step?.deferred || false
  const totalSecs = step ? step.dur * 60 : 0
  const isOverTime = elapsed > totalSecs
  const pct = totalSecs > 0 ? Math.min(100, Math.round((elapsed / totalSecs) * 100)) : 0
  const upcoming = queue.slice(stepIdx + 1)

  useEffect(() => { setElapsed(0); setPaused(false) }, [stepIdx])

  // Keep pausedRef in sync so the visibility handler always sees current value
  useEffect(() => { pausedRef.current = paused }, [paused])

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

  // Page Visibility API — recover time lost while tab was backgrounded on mobile
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
      } else {
        if (hiddenAtRef.current !== null && !pausedRef.current) {
          const secondsAway = Math.floor((Date.now() - hiddenAtRef.current) / 1000)
          if (secondsAway > 0) setElapsed(e => e + secondsAway)
        }
        hiddenAtRef.current = null
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // ── On mount: check for an existing unfinished log today ──
  useEffect(() => {
    if (!userId) { setInitState('running'); initFreshLog(); return }
    const todayStr = new Date().toISOString().split('T')[0]
    supabase.from('routine_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('routine_id', routine.id)
      .gte('started_at', todayStr + 'T00:00:00.000Z')
      .lte('started_at', todayStr + 'T23:59:59.999Z')
      .in('status', ['in_progress', 'auto_paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingLog(data)
          setInitState('restart')
        } else {
          setInitState('running')
          initFreshLog()
        }
      })
  }, []) // eslint-disable-line

  async function initFreshLog() {
    const now = new Date().toISOString()
    setStartedAt(now)
    if (!userId) return
    const { data } = await supabase.from('routine_logs')
      .insert({ user_id: userId, routine_id: routine.id, started_at: now, status: 'in_progress', step_index: 0 })
      .select('id').single()
    if (data) setLogId(data.id)
  }

  function continueFromLog() {
    setLogId(existingLog.id)
    setStartedAt(existingLog.started_at)
    setStepIdx(existingLog.step_index || 0)
    setInitState('running')
  }

  async function startFresh() {
    if (existingLog && userId) {
      supabase.from('routine_logs')
        .update({ status: 'abandoned', ended_at: new Date().toISOString() })
        .eq('id', existingLog.id)
    }
    setInitState('running')
    initFreshLog()
  }

  // ── Auto-pause: if a step runs 60+ min over its allocated time ──
  useEffect(() => {
    if (!step || paused || autoPausedRef.current || totalSecs === 0 || initState !== 'running') return
    if (elapsed - totalSecs >= 3600) {
      autoPausedRef.current = true
      setAutoPaused(true)
      setPaused(true)
      if (logId && userId) {
        supabase.from('routine_logs')
          .update({ status: 'auto_paused', ended_at: new Date().toISOString(), step_index: stepIdx })
          .eq('id', logId)
      }
    }
  }, [elapsed]) // eslint-disable-line

  // ── Save completed log + write calendar event when routine finishes ──
  useEffect(() => {
    if (!finished || !startedAt) return
    const endedAt = new Date().toISOString()
    if (logId && userId) {
      supabase.from('routine_logs')
        .update({ status: 'completed', ended_at: endedAt })
        .eq('id', logId)
    }
  }, [finished]) // eslint-disable-line

  // Keep logId current for auto-pause effect (update DB with step position)
  useEffect(() => {
    if (logId && userId && initState === 'running') {
      supabase.from('routine_logs').update({ step_index: stepIdx }).eq('id', logId)
    }
  }, [stepIdx]) // eslint-disable-line

  useEffect(() => {
    if (elapsed === totalSecs && step && totalSecs > 0) {
      showToast(`Time's up for "${step.name}" — mark done, skip, or do later!`)
      playSound('step')
      const nextStep = queue[stepIdx + 1]
      if (nextStep) {
        fireStepNotif(step.name, nextStep.name)
      } else {
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`${step.name} is done`, {
              body: 'Last step — mark done to finish your routine!',
              tag: 'addapp-step',
              renotify: true,
            })
          } catch(e) {}
        }
      }
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
      const xpEarned = newDoneCount * (routine.type === 'trigger' ? 3 : 5)
      addXP(xpEarned)
      fireNotif(xpEarned)
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
      const xpEarnedLater = doneCount * (routine.type === 'trigger' ? 3 : 5)
      addXP(xpEarnedLater)
      fireNotif(xpEarnedLater)
    } else {
      setQueue(newQueue)
      setDeferred(newDeferred)
      setElapsed(0)
    }
  }

  function moveStep(fromIdx, toIdx) {
    setQueue(q => {
      const newQ = [...q]
      const temp = newQ[fromIdx]
      newQ[fromIdx] = newQ[toIdx]
      newQ[toIdx] = temp
      return newQ
    })
  }

  function moveStepTo(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    setQueue(q => {
      const newQ = [...q]
      const [moved] = newQ.splice(fromIdx, 1)
      newQ.splice(toIdx, 0, moved)
      return newQ
    })
  }

  // ── Loading / restart prompt screens ──
  if (initState === 'loading') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', color:'var(--text3)', fontSize:14 }}>
        Loading…
      </div>
    )
  }

  if (initState === 'restart') {
    return (
      <div className="runner-restart-wrap">
        <div className="runner-restart-card">
          <div className="runner-restart-emoji">{routine.emoji}</div>
          <h2 className="runner-restart-title">{routine.name}</h2>
          <p className="runner-restart-msg">
            {existingLog?.status === 'auto_paused'
              ? 'This routine was auto-paused earlier today because a step ran 60+ minutes over.'
              : 'You have an unfinished session from earlier today.'}
          </p>
          <div className="runner-restart-actions">
            <button className="btn-primary" onClick={continueFromLog}>Continue where I left off</button>
            <button className="btn-ghost" onClick={startFresh}>Start fresh</button>
          </div>
          <button className="btn-ghost-sm" onClick={onFinish} style={{ marginTop: 8 }}>← Back to routines</button>
        </div>
      </div>
    )
  }

  if (finished) {
    const xpPerStep = routine.type === 'trigger' ? 3 : 5
    const xp = doneCount * xpPerStep
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
        {routine.type === 'trigger' ? (
          <div className="trigger-complete-actions">
            <button className="btn-primary trigger-launch-btn" onClick={onStartFocus}>
              🕹️ Start Focus Session
            </button>
            <button className="btn-ghost" onClick={onFinish}>Skip for now</button>
          </div>
        ) : (
          <button className="btn-primary" style={{marginTop:'1.5rem'}} onClick={onFinish}>Back to routines</button>
        )}
      </div>
    )
  }

  return (
    <div className="runner">
      {toast && <div className="runner-toast">{toast}</div>}
      {autoPaused && (
        <div className="runner-auto-pause-banner">
          ⏸ Auto-paused — this step ran 60+ minutes over. Resume or exit when ready.
        </div>
      )}

      <div className="runner-header">
        <button className="btn-ghost-sm" onClick={onFinish}>← Exit</button>
        <div className="runner-title">{routine.emoji} {routine.name}</div>
        <div className="runner-prog">{stepIdx + 1} / {queue.length}</div>
      </div>

      {/* TEMP: test notification button — remove before shipping */}
      <div style={{textAlign:'center', marginBottom:'0.75rem'}}>
        <button
          className="btn-ghost-sm"
          onClick={() => {
            playSound('step')
            const nextStep = queue[stepIdx + 1]
            if ('Notification' in window) {
              if (Notification.permission === 'granted') {
                try {
                  new Notification('Test: Step done', {
                    body: nextStep ? `Next: ${nextStep.name}` : 'Last step!',
                    tag: 'addapp-test',
                    renotify: true,
                  })
                  showToast('Test notification sent!')
                } catch(e) { showToast('Notification failed: ' + e.message) }
              } else if (Notification.permission === 'default') {
                Notification.requestPermission().then(p => {
                  showToast(p === 'granted' ? 'Permission granted! Try again.' : 'Notifications blocked.')
                })
              } else {
                showToast('Notifications are blocked. Enable in browser settings.')
              }
            } else {
              showToast('Notifications not supported in this browser.')
            }
          }}
        >🔔 Test notification</button>
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
          {upcoming.map((s, i) => {
            const qIdx = stepIdx + 1 + i
            return (
              <div
                key={s.id + '-' + i}
                className={`upcoming-item ${s.deferred ? 'up-deferred' : ''} ${dragIdx === qIdx ? 'up-dragging' : ''} ${dragOverIdx === qIdx && dragIdx !== qIdx ? 'up-drag-over' : ''}`}
                draggable
                onDragStart={() => setDragIdx(qIdx)}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(qIdx) }}
                onDrop={() => { if (dragIdx !== null) moveStepTo(dragIdx, qIdx); setDragIdx(null); setDragOverIdx(null) }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
              >
                <span className="up-n">{stepIdx + 2 + i}</span>
                <span className="up-name">{s.name}</span>
                {s.deferred && <span className="up-tag">deferred</span>}
                <span className="up-dur">{s.dur}m</span>
                <div className="up-reorder">
                  <button className="up-reorder-btn" onClick={() => moveStep(qIdx, qIdx - 1)} disabled={i === 0} title="Move up">▲</button>
                  <button className="up-reorder-btn" onClick={() => moveStep(qIdx, qIdx + 1)} disabled={i === upcoming.length - 1} title="Move down">▼</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Routines({ userId }) {
  const navigate = useNavigate()
  const [routines, setRoutines] = useState([])
  const [dbLoading, setDbLoading] = useState(!!userId)
  const [modal, setModal] = useState(null) // null | 'new' | routine obj
  const [running, setRunning] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // null | routine obj
  const [markDoneModal, setMarkDoneModal] = useState(null) // null | routine obj
  const [markDoneTime, setMarkDoneTime]   = useState('')
  const [todayLogs, setTodayLogs]         = useState([]) // { id, routine_id, status, started_at, ended_at }[]
  const [editLogModal, setEditLogModal]   = useState(null) // null | { log, routine }
  const [editLogStart, setEditLogStart]   = useState('')
  const [editLogEnd,   setEditLogEnd]     = useState('')

  // Load routines from Supabase on mount
  useEffect(() => {
    if (!userId) { setRoutines(SAMPLE_ROUTINES); return }
    setDbLoading(true)
    supabase
      .from('routines')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setRoutines(data || [])
        setDbLoading(false)
      })
  }, [userId])

  // Load today's routine logs so cards can show completion status
  useEffect(() => {
    if (!userId) return
    const todayStr = new Date().toISOString().split('T')[0]
    supabase.from('routine_logs')
      .select('id, routine_id, status, started_at, ended_at')
      .eq('user_id', userId)
      .gte('started_at', todayStr + 'T00:00:00.000Z')
      .lte('started_at', todayStr + 'T23:59:59.999Z')
      .then(({ data }) => setTodayLogs(data || []))
  }, [userId])

  async function saveRoutine(data) {
    if (modal?.id) {
      // Update existing
      const { error } = await supabase
        .from('routines')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', modal.id)
      if (!error) setRoutines(r => r.map(x => x.id === modal.id ? { ...x, ...data } : x))
    } else {
      // Create new
      const { data: created, error } = await supabase
        .from('routines')
        .insert({ ...data, user_id: userId })
        .select()
        .single()
      if (!error && created) setRoutines(r => [...r, created])
    }
    setModal(null)
  }

  async function deleteRoutine(id) {
    await supabase.from('routines').delete().eq('id', id)
    setRoutines(r => r.filter(x => x.id !== id))
  }

  function openMarkDone(r) {
    const now = new Date()
    setMarkDoneTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    setMarkDoneModal(r)
  }

  async function submitMarkDone() {
    if (!markDoneModal || !markDoneTime) return
    const r = markDoneModal
    const [h, m] = markDoneTime.split(':').map(Number)
    const endDate = new Date(); endDate.setHours(h, m, 0, 0)
    const endTs = endDate.toISOString()

    // Derive start: use routine's scheduled time, or estimate from step total
    let startDate
    if (r.time) {
      const [sh, sm] = r.time.split(':').map(Number)
      startDate = new Date(); startDate.setHours(sh, sm, 0, 0)
    } else {
      startDate = new Date(endDate)
      startDate.setMinutes(startDate.getMinutes() - totalMins(r.steps))
    }
    const startTs = startDate.toISOString()
    const toHHMM  = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    const dateStr = startTs.split('T')[0]

    const { data: newLog } = await supabase.from('routine_logs').insert({
      user_id: userId, routine_id: r.id,
      started_at: startTs, ended_at: endTs,
      status: 'marked_done', step_index: r.steps.length,
    }).select('id').single()

    setTodayLogs(prev => [...prev, { id: newLog?.id, routine_id: r.id, status: 'marked_done' }])
    setMarkDoneModal(null)
  }

  async function undoMarkDone(routineId) {
    const log = todayLogs.find(l => l.routine_id === routineId && l.status === 'marked_done')
    if (!log?.id) return
    await supabase.from('routine_logs').delete().eq('id', log.id)
    setTodayLogs(prev => prev.filter(l => l.routine_id !== routineId))
  }

  function openEditLog(routine) {
    const log = todayLogs.find(l => l.routine_id === routine.id)
    if (!log) return
    const toHHMM = ts => {
      if (!ts) return ''
      const d = new Date(ts)
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    }
    setEditLogStart(toHHMM(log.started_at))
    setEditLogEnd(toHHMM(log.ended_at))
    setEditLogModal({ log, routine })
  }

  async function saveEditLog() {
    if (!editLogModal) return
    const { log } = editLogModal
    const today = new Date()
    const toISO = (hhmm) => {
      if (!hhmm) return null
      const [h, m] = hhmm.split(':').map(Number)
      const d = new Date(today); d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    const updates = {
      started_at: toISO(editLogStart) || log.started_at,
      ended_at:   toISO(editLogEnd)   || null,
    }
    await supabase.from('routine_logs').update(updates).eq('id', log.id)
    setTodayLogs(prev => prev.map(l =>
      l.id === log.id ? { ...l, ...updates } : l
    ))
    setEditLogModal(null)
  }

  if (running) {
    return <RoutineRunner
      routine={running}
      userId={userId}
      onFinish={() => setRunning(null)}
      onStartFocus={() => { setRunning(null); navigate('/focus') }}
    />
  }

  if (dbLoading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', color:'var(--text3)', fontSize:14 }}>
        Loading routines…
      </div>
    )
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
      ) : (() => {
        const regularList = routines.filter(r => r.type !== 'trigger')
        const triggerList = routines.filter(r => r.type === 'trigger')
        const renderCard = r => {
          const todayLog = todayLogs.find(l => l.routine_id === r.id)
          const isDoneToday = todayLog && ['completed', 'marked_done'].includes(todayLog.status)
          return (
          <div key={r.id} className={`routine-card${isDoneToday ? ' rc-done-today' : ''}`}>
            <div className="rc-top">
              <div className="rc-emoji">{r.emoji}</div>
              <div className="rc-info">
                <div className="rc-name-row">
                  <div className="rc-name">{r.name}</div>
                  {r.type === 'trigger' && <span className="rc-trigger-badge">🕹️ Trigger</span>}
                  {isDoneToday && todayLog.status === 'marked_done' && (
                    <button className="rc-done-badge" onClick={() => undoMarkDone(r.id)} title="Click to undo">✓ done today ↩</button>
                  )}
                  {isDoneToday && todayLog.status === 'completed' && (
                    <span className="rc-done-badge">✓ done today</span>
                  )}
                </div>
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
              {!isDoneToday && (
                <button className="btn-ghost btn-sm" onClick={() => openMarkDone(r)} title="Log as done without running">✓ Mark done</button>
              )}
              {todayLog && (
                <button className="btn-ghost btn-sm" onClick={() => openEditLog(r)} title="Edit start/end times">✏️ Times</button>
              )}
              <button className="btn-danger btn-sm" onClick={() => setDeleteConfirm(r)}>Delete</button>
            </div>
          </div>
        )}

        return (
          <>
            {regularList.length > 0 && (
              <>
                <div className="section-label">Routines</div>
                <div className="routine-grid">{regularList.map(renderCard)}</div>
              </>
            )}
            {triggerList.length > 0 && (
              <>
                <div className="section-label section-label-trigger">🕹️ Triggers</div>
                <div className="routine-grid">{triggerList.map(renderCard)}</div>
              </>
            )}
          </>
        )
      })()}

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

      {editLogModal && (
        <div className="modal-overlay" onClick={() => setEditLogModal(null)}>
          <div className="modal" style={{maxWidth: 360}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Edit session times</h2>
              <button className="modal-close" onClick={() => setEditLogModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13, color:'var(--text2)', marginBottom:'1.25rem', lineHeight:1.5}}>
                {editLogModal.routine.emoji} <strong>{editLogModal.routine.name}</strong>
              </p>
              <div className="field">
                <label>Start time</label>
                <input type="time" value={editLogStart} onChange={e => setEditLogStart(e.target.value)} />
              </div>
              <div className="field" style={{marginTop:'0.75rem'}}>
                <label>End time</label>
                <input type="time" value={editLogEnd} onChange={e => setEditLogEnd(e.target.value)} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setEditLogModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEditLog}>Save</button>
            </div>
          </div>
        </div>
      )}

      {markDoneModal && (
        <div className="modal-overlay" onClick={() => setMarkDoneModal(null)}>
          <div className="modal" style={{maxWidth: 360}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Mark as done</h2>
              <button className="modal-close" onClick={() => setMarkDoneModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13, color:'var(--text2)', marginBottom:'1.25rem', lineHeight:1.5}}>
                {markDoneModal.emoji} <strong>{markDoneModal.name}</strong>
              </p>
              <div className="field">
                <label>What time did you finish?</label>
                <input
                  type="time"
                  value={markDoneTime}
                  onChange={e => setMarkDoneTime(e.target.value)}
                />
              </div>
              <p style={{fontSize:12, color:'var(--text3)', marginTop:'0.75rem'}}>
                This will log the routine as done and add it to your calendar.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setMarkDoneModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={submitMarkDone}>Log it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
