import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getSettings } from '../settings'
import './Health.css'

// ── Metric definitions ────────────────────────────────────────
const METRICS = {
  energy:    { label: 'Energy',           emoji: '⚡', unit: '/ 10',  type: 'score10',  color: '#f59e0b' },
  sleep:     { label: 'Sleep',            emoji: '😴', unit: 'hrs',   type: 'sleep',    color: '#6366f1' },
  stress:    { label: 'Stress',           emoji: '🧘', unit: '/ 10',  type: 'score10',  color: '#10b981' },
  workout:   { label: 'Workout',          emoji: '🏋️', unit: 'min',   type: 'workout',  color: '#ef4444' },
  steps:     { label: 'Steps',            emoji: '👟', unit: 'steps', type: 'number',   color: '#06b6d4' },
  meditation:{ label: 'Meditation',       emoji: '🧘‍♀️', unit: 'min',   type: 'number',   color: '#8b5cf6' },
  weight:    { label: 'Body composition', emoji: '⚖️', unit: 'kg',    type: 'decimal',  color: '#f97316' },
  bpm:       { label: 'Heart rate',       emoji: '❤️', unit: 'bpm',   type: 'number',   color: '#ec4899' },
  bp:        { label: 'Blood pressure',   emoji: '🩺', unit: 'mmHg',  type: 'bp',       color: '#14b8a6' },
  glucose:   { label: 'Glucose',          emoji: '🩸', unit: 'mmol',  type: 'decimal',  color: '#f43f5e' },
  period:    { label: 'Period',           emoji: '🌸', unit: '',      type: 'period',   color: '#e879f9' },
  medication:{ label: 'Medication',       emoji: '💊', unit: '',      type: 'toggle',   color: '#22d3ee' },
}

const QUALITY_LABELS = ['', 'Poor', 'Fair', 'OK', 'Good', 'Great']
const PERIOD_LABELS  = ['', 'Spotting', 'Light', 'Medium', 'Heavy']

function scoreEmoji(val, max = 10) {
  if (!val) return '—'
  const pct = val / max
  if (pct <= 0.3) return '😔'
  if (pct <= 0.5) return '😐'
  if (pct <= 0.7) return '🙂'
  return '😄'
}
function stressEmoji(val) {
  if (!val) return '—'
  if (val <= 3) return '😌'
  if (val <= 6) return '😐'
  if (val <= 8) return '😰'
  return '🤯'
}
function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function getMetricVal(m, log) {
  if (!log) return null
  const map = {
    energy: log.energy_score, sleep: log.sleep_hours, stress: log.stress_score,
    workout: log.workout_done, steps: log.steps, meditation: log.meditation_mins,
    weight: log.weight_kg, bpm: log.bpm_resting, bp: log.bp_systolic,
    glucose: log.glucose_mmol, period: log.period_flow, medication: log.medication_taken,
  }
  return map[m] ?? null
}

// ── Today card value ──────────────────────────────────────────
function MetricCardVal({ m, log }) {
  if (!log) return <span className="hc-empty">Not logged</span>
  if (m === 'energy') {
    const v = log.energy_score
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">/ 10</span><span className="hc-mood">{scoreEmoji(v)}</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'sleep') {
    const v = log.sleep_hours
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">hrs</span><span className="hc-mood">{scoreEmoji(v, 12)}</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'stress') {
    const v = log.stress_score
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">/ 10</span><span className="hc-mood">{stressEmoji(v)}</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'workout') {
    if (log.workout_done == null && log.workout_mins == null) return <span className="hc-empty">Not logged</span>
    return log.workout_done
      ? <><span className="hc-num">{log.workout_mins ?? '—'}</span><span className="hc-unit">min</span><span className="hc-mood">💪</span></>
      : <span className="hc-empty">Rest day</span>
  }
  if (m === 'steps') {
    const v = log.steps
    return v != null ? <><span className="hc-num">{v.toLocaleString()}</span><span className="hc-unit">steps</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'meditation') {
    const v = log.meditation_mins
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">min</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'weight') {
    const v = log.weight_kg
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">kg</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'bpm') {
    const v = log.bpm_resting
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">bpm</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'bp') {
    const s = log.bp_systolic, d = log.bp_diastolic
    return (s != null && d != null) ? <><span className="hc-num">{s}/{d}</span><span className="hc-unit">mmHg</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'glucose') {
    const v = log.glucose_mmol
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">mmol</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'period') {
    const v = log.period_flow
    return v != null ? <><span className="hc-num">{PERIOD_LABELS[v]}</span><span className="hc-mood">🌸</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'medication') {
    if (log.medication_taken == null) return <span className="hc-empty">Not logged</span>
    return log.medication_taken
      ? <span className="hc-num" style={{ fontSize: 16 }}>✓ Taken</span>
      : <span className="hc-num" style={{ fontSize: 16, color: '#ef4444' }}>✗ Missed</span>
  }
  return <span className="hc-empty">Not logged</span>
}

// ── Log modal ─────────────────────────────────────────────────
function LogModal({ open, onClose, onSave, existing, enabledMetrics }) {
  const [energy,         setEnergy]         = useState('')
  const [sleepHrs,       setSleepHrs]       = useState('')
  const [sleepQual,      setSleepQual]      = useState('')
  const [stress,         setStress]         = useState('')
  const [workoutDone,    setWorkoutDone]    = useState(false)
  const [workoutMins,    setWorkoutMins]    = useState('')
  const [steps,          setSteps]          = useState('')
  const [meditationMins, setMeditationMins] = useState('')
  const [weightKg,       setWeightKg]       = useState('')
  const [bpm,            setBpm]            = useState('')
  const [bpSys,          setBpSys]          = useState('')
  const [bpDia,          setBpDia]          = useState('')
  const [glucose,        setGlucose]        = useState('')
  const [periodFlow,     setPeriodFlow]     = useState('')
  const [medTaken,       setMedTaken]       = useState(null)
  const [notes,          setNotes]          = useState('')
  const [saving,         setSaving]         = useState(false)

  useEffect(() => {
    if (!open) return
    setEnergy(existing?.energy_score ?? '')
    setSleepHrs(existing?.sleep_hours ?? '')
    setSleepQual(existing?.sleep_quality ?? '')
    setStress(existing?.stress_score ?? '')
    setWorkoutDone(existing?.workout_done ?? false)
    setWorkoutMins(existing?.workout_mins ?? '')
    setSteps(existing?.steps ?? '')
    setMeditationMins(existing?.meditation_mins ?? '')
    setWeightKg(existing?.weight_kg ?? '')
    setBpm(existing?.bpm_resting ?? '')
    setBpSys(existing?.bp_systolic ?? '')
    setBpDia(existing?.bp_diastolic ?? '')
    setGlucose(existing?.glucose_mmol ?? '')
    setPeriodFlow(existing?.period_flow ?? '')
    setMedTaken(existing?.medication_taken ?? null)
    setNotes(existing?.notes ?? '')
  }, [open, existing])

  if (!open) return null

  const show = (id) => enabledMetrics.includes(id)

  async function handleSave() {
    setSaving(true)
    await onSave({
      energy_score:    energy         !== '' ? Number(energy)         : null,
      sleep_hours:     sleepHrs       !== '' ? Number(sleepHrs)       : null,
      sleep_quality:   sleepQual      !== '' ? Number(sleepQual)      : null,
      stress_score:    stress         !== '' ? Number(stress)         : null,
      workout_done:    show('workout') ? workoutDone : null,
      workout_mins:    workoutMins    !== '' ? Number(workoutMins)    : null,
      steps:           steps          !== '' ? Number(steps)          : null,
      meditation_mins: meditationMins !== '' ? Number(meditationMins) : null,
      weight_kg:       weightKg       !== '' ? Number(weightKg)       : null,
      bpm_resting:     bpm            !== '' ? Number(bpm)            : null,
      bp_systolic:     bpSys          !== '' ? Number(bpSys)          : null,
      bp_diastolic:    bpDia          !== '' ? Number(bpDia)          : null,
      glucose_mmol:    glucose        !== '' ? Number(glucose)        : null,
      period_flow:     periodFlow     !== '' ? Number(periodFlow)     : null,
      medication_taken: show('medication') ? medTaken : null,
      notes:           notes.trim() || null,
    })
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal health-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{existing ? 'Update' : 'Log'} today's health</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body health-modal-body">

          {show('energy') && (
            <div className="hlog-field">
              <label className="hlog-label">⚡ Energy score <span className="hlog-range">1–10</span></label>
              <div className="hlog-score-row">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n}
                    className={`hlog-score-btn${Number(energy) === n ? ' active' : ''}`}
                    style={Number(energy) === n ? { background:'#f59e0b', borderColor:'#f59e0b', color:'#fff' } : {}}
                    onClick={() => setEnergy(n)}>{n}</button>
                ))}
              </div>
            </div>
          )}

          {show('sleep') && (
            <div className="hlog-field">
              <label className="hlog-label">😴 Sleep hours</label>
              <div className="hlog-row">
                <input className="modal-input hlog-num" type="number" min="0" max="24" step="0.5"
                  placeholder="e.g. 7.5" value={sleepHrs} onChange={e => setSleepHrs(e.target.value)} />
                <div className="hlog-qual-row">
                  {[1,2,3,4,5].map(q => (
                    <button key={q}
                      className={`hlog-qual-btn${Number(sleepQual) === q ? ' active' : ''}`}
                      style={Number(sleepQual) === q ? { background:'#6366f1', borderColor:'#6366f1', color:'#fff' } : {}}
                      onClick={() => setSleepQual(q)} title={QUALITY_LABELS[q]}>
                      {QUALITY_LABELS[q]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {show('stress') && (
            <div className="hlog-field">
              <label className="hlog-label">🧘 Stress level <span className="hlog-range">1 = calm · 10 = max stress</span></label>
              <div className="hlog-score-row">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n}
                    className={`hlog-score-btn${Number(stress) === n ? ' active' : ''}`}
                    style={Number(stress) === n ? { background:'#10b981', borderColor:'#10b981', color:'#fff' } : {}}
                    onClick={() => setStress(n)}>{n}</button>
                ))}
              </div>
            </div>
          )}

          {show('workout') && (
            <div className="hlog-field">
              <label className="hlog-label">🏋️ Workout</label>
              <div className="hlog-row" style={{ gap: 12 }}>
                <button
                  className={`hlog-toggle-btn${workoutDone ? ' active' : ''}`}
                  style={workoutDone ? { background:'#ef4444', borderColor:'#ef4444', color:'#fff' } : {}}
                  onClick={() => setWorkoutDone(d => !d)}>
                  {workoutDone ? '💪 Done' : 'Rest day'}
                </button>
                {workoutDone && (
                  <input className="modal-input hlog-num" type="number" min="0" max="600"
                    placeholder="Minutes" value={workoutMins} onChange={e => setWorkoutMins(e.target.value)} />
                )}
              </div>
            </div>
          )}

          {show('steps') && (
            <div className="hlog-field">
              <label className="hlog-label">👟 Steps</label>
              <input className="modal-input hlog-num" style={{ width: 160 }} type="number" min="0"
                placeholder="e.g. 8000" value={steps} onChange={e => setSteps(e.target.value)} />
            </div>
          )}

          {show('meditation') && (
            <div className="hlog-field">
              <label className="hlog-label">🧘‍♀️ Meditation <span className="hlog-range">minutes</span></label>
              <input className="modal-input hlog-num" type="number" min="0"
                placeholder="e.g. 10" value={meditationMins} onChange={e => setMeditationMins(e.target.value)} />
            </div>
          )}

          {show('weight') && (
            <div className="hlog-field">
              <label className="hlog-label">⚖️ Body weight <span className="hlog-range">kg</span></label>
              <input className="modal-input hlog-num" type="number" min="0" step="0.1"
                placeholder="e.g. 72.5" value={weightKg} onChange={e => setWeightKg(e.target.value)} />
            </div>
          )}

          {show('bpm') && (
            <div className="hlog-field">
              <label className="hlog-label">❤️ Resting heart rate <span className="hlog-range">bpm</span></label>
              <input className="modal-input hlog-num" type="number" min="30" max="220"
                placeholder="e.g. 68" value={bpm} onChange={e => setBpm(e.target.value)} />
            </div>
          )}

          {show('bp') && (
            <div className="hlog-field">
              <label className="hlog-label">🩺 Blood pressure <span className="hlog-range">mmHg</span></label>
              <div className="hlog-row" style={{ gap: 8 }}>
                <input className="modal-input hlog-num" type="number" min="60" max="250"
                  placeholder="Systolic" value={bpSys} onChange={e => setBpSys(e.target.value)} />
                <span style={{ color:'var(--text3)', fontSize:18 }}>/</span>
                <input className="modal-input hlog-num" type="number" min="40" max="150"
                  placeholder="Diastolic" value={bpDia} onChange={e => setBpDia(e.target.value)} />
              </div>
            </div>
          )}

          {show('glucose') && (
            <div className="hlog-field">
              <label className="hlog-label">🩸 Glucose <span className="hlog-range">mmol/L</span></label>
              <input className="modal-input hlog-num" type="number" min="0" step="0.1"
                placeholder="e.g. 5.4" value={glucose} onChange={e => setGlucose(e.target.value)} />
            </div>
          )}

          {show('period') && (
            <div className="hlog-field">
              <label className="hlog-label">🌸 Period flow</label>
              <div className="hlog-qual-row">
                {[1,2,3,4].map(q => (
                  <button key={q}
                    className={`hlog-qual-btn${Number(periodFlow) === q ? ' active' : ''}`}
                    style={Number(periodFlow) === q ? { background:'#e879f9', borderColor:'#e879f9', color:'#fff' } : {}}
                    onClick={() => setPeriodFlow(periodFlow === q ? '' : q)}>
                    {PERIOD_LABELS[q]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {show('medication') && (
            <div className="hlog-field">
              <label className="hlog-label">💊 Medication taken today?</label>
              <div className="hlog-row" style={{ gap: 8 }}>
                <button
                  className={`hlog-qual-btn${medTaken === true ? ' active' : ''}`}
                  style={medTaken === true ? { background:'#22d3ee', borderColor:'#22d3ee', color:'#000' } : {}}
                  onClick={() => setMedTaken(t => t === true ? null : true)}>
                  ✓ Taken
                </button>
                <button
                  className={`hlog-qual-btn${medTaken === false ? ' active' : ''}`}
                  style={medTaken === false ? { background:'#ef4444', borderColor:'#ef4444', color:'#fff' } : {}}
                  onClick={() => setMedTaken(t => t === false ? null : false)}>
                  ✗ Missed
                </button>
              </div>
            </div>
          )}

          <div className="hlog-field">
            <label className="hlog-label">📝 Notes <span className="hlog-range">optional</span></label>
            <textarea className="modal-input modal-textarea" rows={2}
              placeholder="Anything worth noting today…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Update' : 'Save log'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function Health({ userId }) {
  const settings       = getSettings()
  const enabledMetrics = settings.healthMetrics || ['energy', 'sleep', 'stress']

  const [todayLog,  setTodayLog]  = useState(null)
  const [history,   setHistory]   = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading,   setLoading]   = useState(true)

  const today = todayStr()

  async function loadData() {
    if (!userId) { setLoading(false); return }
    const from = new Date(); from.setDate(from.getDate() - 6)
    const fromStr = from.toISOString().split('T')[0]
    const { data } = await supabase
      .from('health_logs').select('*')
      .eq('user_id', userId).gte('log_date', fromStr)
      .order('log_date', { ascending: false })
    const logs = data || []
    setTodayLog(logs.find(l => l.log_date === today) || null)
    setHistory(logs)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [userId]) // eslint-disable-line

  async function saveLog(payload) {
    if (!userId) return
    if (todayLog) {
      const { data } = await supabase.from('health_logs')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', todayLog.id).select().single()
      if (data) { setTodayLog(data); setHistory(prev => prev.map(l => l.id === data.id ? data : l)) }
    } else {
      const { data } = await supabase.from('health_logs')
        .insert({ ...payload, user_id: userId, log_date: today })
        .select().single()
      if (data) { setTodayLog(data); setHistory(prev => [data, ...prev]) }
    }
    setShowModal(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', fontSize:14 }}>
      Loading…
    </div>
  )

  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    return { dateStr: ds, log: history.find(l => l.log_date === ds), isToday: i === 0 }
  }).reverse()

  return (
    <div className="health-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Health</h1>
          <p className="page-sub">Optional daily check-in. Your data, your pace.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          {todayLog ? 'Update today' : '+ Log today'}
        </button>
      </div>

      {/* Today's dashboard */}
      <div className="health-cards">
        {enabledMetrics.filter(m => METRICS[m]).map(m => {
          const meta = METRICS[m]
          return (
            <div key={m} className="health-card" style={{ '--hc-color': meta.color }}>
              <div className="hc-top">
                <span className="hc-emoji">{meta.emoji}</span>
                <span className="hc-label">{meta.label}</span>
              </div>
              <div className="hc-val">
                <MetricCardVal m={m} log={todayLog} />
              </div>
              {m === 'sleep' && todayLog?.sleep_quality != null && (
                <div className="hc-sub">{QUALITY_LABELS[todayLog.sleep_quality]} quality</div>
              )}
            </div>
          )
        })}
      </div>

      {/* 7-day strip */}
      <div className="health-section-title">Last 7 days</div>
      <div className="health-strip">
        {strip.map(({ dateStr, log, isToday }) => (
          <div key={dateStr} className={`hs-day${isToday ? ' hs-today' : ''}${log ? ' hs-logged' : ''}`}>
            <div className="hs-date">
              {isToday ? 'Today' : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="hs-dots">
              {enabledMetrics.slice(0, 5).filter(m => METRICS[m]).map(m => (
                <div key={m} className="hs-dot"
                  style={{ background: getMetricVal(m, log) != null ? METRICS[m].color : 'var(--border2)' }}
                  title={`${METRICS[m].label}${getMetricVal(m, log) != null ? ': logged' : ': not logged'}`} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Log history */}
      {history.length > 0 && (
        <>
          <div className="health-section-title" style={{ marginTop:'1.5rem' }}>Log history</div>
          <div className="health-log-list">
            {history.map(log => (
              <div key={log.id} className="hll-row">
                <div className="hll-date">
                  {fmtDate(log.log_date)}
                  {log.log_date === today && <span className="hll-today-tag">Today</span>}
                </div>
                <div className="hll-metrics">
                  {log.energy_score     != null && <span className="hll-chip" style={{'--chip-c':'#f59e0b'}}>⚡ {log.energy_score}/10</span>}
                  {log.sleep_hours      != null && <span className="hll-chip" style={{'--chip-c':'#6366f1'}}>😴 {log.sleep_hours}h{log.sleep_quality ? ` · ${QUALITY_LABELS[log.sleep_quality]}` : ''}</span>}
                  {log.stress_score     != null && <span className="hll-chip" style={{'--chip-c':'#10b981'}}>🧘 {log.stress_score}/10</span>}
                  {log.workout_done               && <span className="hll-chip" style={{'--chip-c':'#ef4444'}}>🏋️ {log.workout_mins ? `${log.workout_mins}min` : 'Done'}</span>}
                  {log.steps            != null && <span className="hll-chip" style={{'--chip-c':'#06b6d4'}}>👟 {log.steps.toLocaleString()}</span>}
                  {log.meditation_mins  != null && <span className="hll-chip" style={{'--chip-c':'#8b5cf6'}}>🧘‍♀️ {log.meditation_mins}min</span>}
                  {log.weight_kg        != null && <span className="hll-chip" style={{'--chip-c':'#f97316'}}>⚖️ {log.weight_kg}kg</span>}
                  {log.bpm_resting      != null && <span className="hll-chip" style={{'--chip-c':'#ec4899'}}>❤️ {log.bpm_resting}bpm</span>}
                  {log.bp_systolic      != null && <span className="hll-chip" style={{'--chip-c':'#14b8a6'}}>🩺 {log.bp_systolic}/{log.bp_diastolic}</span>}
                  {log.glucose_mmol     != null && <span className="hll-chip" style={{'--chip-c':'#f43f5e'}}>🩸 {log.glucose_mmol}mmol</span>}
                  {log.period_flow      != null && <span className="hll-chip" style={{'--chip-c':'#e879f9'}}>🌸 {PERIOD_LABELS[log.period_flow]}</span>}
                  {log.medication_taken != null && <span className="hll-chip" style={{'--chip-c': log.medication_taken ? '#22d3ee' : '#ef4444'}}>💊 {log.medication_taken ? 'Taken' : 'Missed'}</span>}
                </div>
                {log.notes && <div className="hll-notes">📝 {log.notes}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <LogModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSave={saveLog}
        existing={todayLog}
        enabledMetrics={enabledMetrics}
      />
    </div>
  )
}
