import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { getSettings } from '../settings'
import './Health.css'

// ── Constants ─────────────────────────────────────────────────
const METRICS = {
  energy:    { label: 'Energy',           emoji: '⚡', color: '#f59e0b' },
  sleep:     { label: 'Sleep',            emoji: '😴', color: '#6366f1' },
  stress:    { label: 'Stress',           emoji: '🧘', color: '#10b981' },
  workout:   { label: 'Workout',          emoji: '🏋️', color: '#ef4444' },
  steps:     { label: 'Steps',            emoji: '👟', color: '#06b6d4' },
  meditation:{ label: 'Meditation',       emoji: '🧘‍♀️', color: '#8b5cf6' },
  weight:    { label: 'Body composition', emoji: '⚖️', color: '#f97316' },
  bpm:       { label: 'Heart rate',       emoji: '❤️', color: '#ec4899' },
  bp:        { label: 'Blood pressure',   emoji: '🩺', color: '#14b8a6' },
  glucose:   { label: 'Glucose',          emoji: '🩸', color: '#f43f5e' },
  period:    { label: 'Period',           emoji: '🌸', color: '#e879f9' },
  medication:{ label: 'Medication',       emoji: '💊', color: '#22d3ee' },
}
const PERIOD_LABELS    = ['', 'Spotting', 'Light', 'Medium', 'Heavy']
const WORKOUT_STATUS   = ['', 'Yes', 'No', 'Rest day']
const WORKOUT_INTENSITY = ['', 'Light', 'Moderate', 'Intense', 'Max']
const SCHEDULES = [
  { id: 'morning',    label: '🌅 Morning'    },
  { id: 'afternoon',  label: '☀️ Afternoon'  },
  { id: 'evening',    label: '🌆 Evening'    },
  { id: 'bedtime',    label: '🌙 Bedtime'    },
  { id: 'with_meals', label: '🍽️ With meals' },
  { id: 'as_needed',  label: '⚡ As needed'  },
]

// ── Helpers ───────────────────────────────────────────────────
function sleepScoreInfo(score) {
  if (score == null) return null
  if (score < 65) return { label: 'Poor',  color: '#ef4444' }
  if (score < 80) return { label: 'Fair',  color: '#f59e0b' }
  if (score < 92) return { label: 'Good',  color: '#10b981' }
  return              { label: 'Great', color: '#6366f1' }
}
function energyEmoji(v) {
  if (!v) return ''
  if (v <= 25) return '😔'; if (v <= 50) return '😐'
  if (v <= 75) return '🙂'; return '😄'
}
function stressEmoji(v) {
  if (!v) return ''
  if (v <= 3) return '😌'; if (v <= 6) return '😐'
  if (v <= 8) return '😰'; return '🤯'
}
function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function calcSleepHours(s, w) {
  if (!s || !w) return null
  const [sh, sm] = s.split(':').map(Number)
  const [wh, wm] = w.split(':').map(Number)
  let sm2 = sh*60+sm, wm2 = wh*60+wm
  if (wm2 <= sm2) wm2 += 1440
  return Math.round((wm2-sm2)/6)/10
}
function lbToKg(lb) { return Math.round(lb*453.592)/1000 }
function kgToLb(kg) { return Math.round(kg*2204.62)/1000 }
function fmtDate(ds) {
  const [y,m,d] = ds.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function getMetricVal(m, log) {
  if (!log) return null
  const map = {
    energy: log.energy_score, sleep: log.sleep_start ?? log.sleep_hours,
    stress: log.stress_score, workout: log.workout_status ?? (log.workout_done ? 1 : null),
    steps: log.steps, meditation: log.meditation_mins, weight: log.weight_kg,
    bpm: log.bpm_resting, bp: log.bp_systolic, glucose: log.glucose_mmol,
    period: log.period_flow, medication: log.medication_taken,
  }
  return map[m] ?? null
}

// ── Card value ────────────────────────────────────────────────
function MetricCardVal({ m, log, medLogs, medications }) {
  if (!log && m !== 'medication') return <span className="hc-empty">Not logged</span>

  if (m === 'energy') {
    const v = log?.energy_score
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">/ 100</span><span className="hc-mood">{energyEmoji(v)}</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'sleep') {
    const hasTime = log?.sleep_start && log?.wake_time
    const hrs = hasTime ? calcSleepHours(log.sleep_start, log.wake_time) : log?.sleep_hours
    const si = sleepScoreInfo(log?.sleep_score)
    if (!hasTime && hrs == null) return <span className="hc-empty">Not logged</span>
    return (
      <div style={{display:'flex',flexDirection:'column',gap:4}}>
        {hasTime && <span style={{fontSize:13,color:'var(--text2)'}}>{fmtTime(log.sleep_start)} → {fmtTime(log.wake_time)}</span>}
        {hrs != null && <span><span className="hc-num">{hrs}</span><span className="hc-unit">hrs</span></span>}
        {si && <span style={{fontSize:12,fontWeight:600,color:si.color}}>{log.sleep_score} — {si.label}</span>}
      </div>
    )
  }
  if (m === 'stress') {
    const v = log?.stress_score
    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">/ 10</span><span className="hc-mood">{stressEmoji(v)}</span></> : <span className="hc-empty">Not logged</span>
  }
  if (m === 'workout') {
    const ws = log?.workout_status ?? (log?.workout_done === true ? 1 : null)
    if (ws == null) return <span className="hc-empty">Not logged</span>
    if (ws === 3) return <span className="hc-empty">Rest day</span>
    if (ws === 2) return <span className="hc-empty">Skipped</span>
    return <div style={{display:'flex',flexDirection:'column',gap:3}}><span style={{fontSize:14,fontWeight:700,color:'#ef4444'}}>💪 Done</span>{log.workout_intensity && <span style={{fontSize:12,color:'var(--text3)'}}>{WORKOUT_INTENSITY[log.workout_intensity]}{log.workout_mins ? ` · ${log.workout_mins}min` : ''}</span>}</div>
  }
  if (m === 'steps')      { const v = log?.steps;          return v != null ? <><span className="hc-num">{v.toLocaleString()}</span><span className="hc-unit">steps</span></> : <span className="hc-empty">Not logged</span> }
  if (m === 'meditation') { const v = log?.meditation_mins; return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">min</span></> : <span className="hc-empty">Not logged</span> }
  if (m === 'weight')     { const v = log?.weight_kg;       return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">kg</span></> : <span className="hc-empty">Not logged</span> }
  if (m === 'bpm')        { const v = log?.bpm_resting;     return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">bpm</span></> : <span className="hc-empty">Not logged</span> }
  if (m === 'bp')         { const s = log?.bp_systolic, d = log?.bp_diastolic; return (s!=null&&d!=null) ? <><span className="hc-num">{s}/{d}</span><span className="hc-unit">mmHg</span></> : <span className="hc-empty">Not logged</span> }
  if (m === 'glucose')    { const v = log?.glucose_mmol;    return v != null ? <><span className="hc-num">{v}</span><span className="hc-unit">mmol</span></> : <span className="hc-empty">Not logged</span> }
  if (m === 'period')     { const v = log?.period_flow;     return v != null ? <><span className="hc-num">{PERIOD_LABELS[v]}</span><span className="hc-mood">🌸</span></> : <span className="hc-empty">Not logged</span> }

  if (m === 'medication') {
    if (!medications || medications.length === 0) return <span className="hc-empty">No meds set up</span>
    const taken  = medications.filter(med => medLogs[med.id] === true).length
    const missed = medications.filter(med => medLogs[med.id] === false).length
    const total  = medications.length
    if (taken === 0 && missed === 0) return <span className="hc-empty">Not logged</span>
    return (
      <div style={{display:'flex',flexDirection:'column',gap:3}}>
        <span><span className="hc-num" style={{fontSize:22}}>{taken}</span><span className="hc-unit">/ {total} taken</span></span>
        {missed > 0 && <span style={{fontSize:12,color:'#ef4444'}}>{missed} missed</span>}
      </div>
    )
  }
  return <span className="hc-empty">Not logged</span>
}

// ── Medication form (add / edit) ──────────────────────────────
function MedForm({ initial, onSave, onCancel }) {
  const [name,     setName]     = useState(initial?.name     ?? '')
  const [dosage,   setDosage]   = useState(initial?.dosage   ?? '')
  const [schedule, setSchedule] = useState(initial?.schedule ?? '')

  return (
    <div className="med-form">
      <input className="modal-input" placeholder="Medication name *" value={name}
        onChange={e => setName(e.target.value)} />
      <input className="modal-input" placeholder="Dosage (e.g. 10mg, 2 tablets)" value={dosage}
        onChange={e => setDosage(e.target.value)} />
      <div className="med-schedule-grid">
        {SCHEDULES.map(s => (
          <button key={s.id}
            className={`hlog-qual-btn${schedule === s.id ? ' active' : ''}`}
            style={schedule === s.id ? {background:'var(--accent)',borderColor:'var(--accent)',color:'#fff'} : {}}
            onClick={() => setSchedule(sc => sc === s.id ? '' : s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="med-form-foot">
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn-primary btn-sm" disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), dosage: dosage.trim(), schedule })}>
          {initial ? 'Update' : 'Add medication'}
        </button>
      </div>
    </div>
  )
}

// ── Log modal ─────────────────────────────────────────────────
function LogModal({ open, onClose, onSave, existing, existingMedLogs, enabledMetrics, medications }) {
  const [energy,          setEnergy]          = useState('')
  const [sleepTime,       setSleepTime]       = useState('')
  const [wakeTime,        setWakeTime]        = useState('')
  const [sleepScore,      setSleepScore]      = useState('')
  const [stress,          setStress]          = useState('')
  const [workoutStatus,   setWorkoutStatus]   = useState(0)
  const [workoutIntensity,setWorkoutIntensity]= useState(0)
  const [workoutMins,     setWorkoutMins]     = useState('')
  const [steps,           setSteps]           = useState('')
  const [meditationMins,  setMeditationMins]  = useState('')
  const [weightVal,       setWeightVal]       = useState('')
  const [weightUnit,      setWeightUnit]      = useState('kg')
  const [bpm,             setBpm]             = useState('')
  const [bpSys,           setBpSys]           = useState('')
  const [bpDia,           setBpDia]           = useState('')
  const [glucose,         setGlucose]         = useState('')
  const [onPeriod,        setOnPeriod]        = useState(null)
  const [periodFlow,      setPeriodFlow]      = useState(0)
  const [medLogs,         setMedLogs]         = useState({})
  const [notes,           setNotes]           = useState('')
  const [saving,          setSaving]          = useState(false)

  useEffect(() => {
    if (!open) return
    setEnergy(existing?.energy_score ?? '')
    setSleepTime(existing?.sleep_start?.slice(0,5) ?? '')
    setWakeTime(existing?.wake_time?.slice(0,5) ?? '')
    setSleepScore(existing?.sleep_score ?? '')
    setStress(existing?.stress_score ?? '')
    const ws = existing?.workout_status ?? (existing?.workout_done === true ? 1 : 0)
    setWorkoutStatus(ws)
    setWorkoutIntensity(existing?.workout_intensity ?? 0)
    setWorkoutMins(existing?.workout_mins ?? '')
    setSteps(existing?.steps ?? '')
    setMeditationMins(existing?.meditation_mins ?? '')
    setWeightVal(existing?.weight_kg ?? ''); setWeightUnit('kg')
    setBpm(existing?.bpm_resting ?? '')
    setBpSys(existing?.bp_systolic ?? ''); setBpDia(existing?.bp_diastolic ?? '')
    setGlucose(existing?.glucose_mmol ?? '')
    const pf = existing?.period_flow ?? 0
    setOnPeriod(pf > 0 ? true : null); setPeriodFlow(pf)
    setMedLogs({ ...existingMedLogs })
    setNotes(existing?.notes ?? '')
  }, [open, existing, existingMedLogs])

  if (!open) return null

  const show = id => enabledMetrics.includes(id)
  const sleepHrsCalc = calcSleepHours(sleepTime, wakeTime)

  async function handleSave() {
    setSaving(true)
    const weightKg = weightVal !== '' ? (weightUnit === 'lb' ? lbToKg(Number(weightVal)) : Number(weightVal)) : null
    await onSave({
      energy_score:      energy        !== '' ? Number(energy)        : null,
      sleep_start:       sleepTime     || null,
      wake_time:         wakeTime      || null,
      sleep_hours:       sleepHrsCalc,
      sleep_score:       sleepScore    !== '' ? Number(sleepScore)    : null,
      stress_score:      stress        !== '' ? Number(stress)        : null,
      workout_status:    show('workout') && workoutStatus > 0 ? workoutStatus : null,
      workout_done:      show('workout') ? workoutStatus === 1 : null,
      workout_intensity: workoutStatus === 1 && workoutIntensity > 0 ? workoutIntensity : null,
      workout_mins:      workoutMins   !== '' ? Number(workoutMins)   : null,
      steps:             steps         !== '' ? Number(steps)         : null,
      meditation_mins:   meditationMins !== '' ? Number(meditationMins) : null,
      weight_kg:         weightKg,
      bpm_resting:       bpm           !== '' ? Number(bpm)           : null,
      bp_systolic:       bpSys         !== '' ? Number(bpSys)         : null,
      bp_diastolic:      bpDia         !== '' ? Number(bpDia)         : null,
      glucose_mmol:      glucose       !== '' ? Number(glucose)       : null,
      period_flow:       onPeriod === true && periodFlow > 0 ? periodFlow : null,
      medication_taken:  show('medication') && medications.length > 0
                           ? Object.values(medLogs).some(v => v === true)
                           : null,
      notes:             notes.trim() || null,
    }, medLogs)
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

          {/* Energy 1-100 */}
          {show('energy') && (
            <div className="hlog-field">
              <label className="hlog-label">⚡ Energy score <span className="hlog-range">1–100</span></label>
              <div className="hlog-slider-row">
                <input type="range" min="1" max="100" className="hlog-slider"
                  value={energy || 50} onChange={e => setEnergy(e.target.value)} />
                <input type="number" min="1" max="100" className="modal-input hlog-num-sm"
                  value={energy} onChange={e => setEnergy(e.target.value)} placeholder="—" />
                <span className="hlog-emoji">{energyEmoji(Number(energy))}</span>
              </div>
            </div>
          )}

          {/* Sleep */}
          {show('sleep') && (
            <div className="hlog-field">
              <label className="hlog-label">😴 Sleep</label>
              <div className="hlog-sleep-row">
                <div className="hlog-time-group">
                  <span className="hlog-time-label">Slept at</span>
                  <input type="time" className="modal-input hlog-time"
                    value={sleepTime} onChange={e => setSleepTime(e.target.value)} />
                </div>
                <span className="hlog-arrow">→</span>
                <div className="hlog-time-group">
                  <span className="hlog-time-label">Woke up</span>
                  <input type="time" className="modal-input hlog-time"
                    value={wakeTime} onChange={e => setWakeTime(e.target.value)} />
                </div>
                {sleepHrsCalc != null && <span className="hlog-sleep-calc">{sleepHrsCalc}h</span>}
              </div>
              <div style={{ marginTop:10 }}>
                <label className="hlog-label" style={{ fontSize:12, marginBottom:6, display:'block' }}>
                  Sleep score <span className="hlog-range">0–100 · &lt;65 Poor · 65–79 Fair · 80–91 Good · 92+ Great</span>
                </label>
                <div className="hlog-slider-row">
                  <input type="range" min="0" max="100" className="hlog-slider"
                    value={sleepScore || 0} onChange={e => setSleepScore(e.target.value)} />
                  <input type="number" min="0" max="100" className="modal-input hlog-num-sm"
                    value={sleepScore} onChange={e => setSleepScore(e.target.value)} placeholder="—" />
                  {sleepScore !== '' && (
                    <span className="hlog-sleep-badge" style={{ color: sleepScoreInfo(Number(sleepScore))?.color }}>
                      {sleepScoreInfo(Number(sleepScore))?.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stress */}
          {show('stress') && (
            <div className="hlog-field">
              <label className="hlog-label">🧘 Stress level <span className="hlog-range">1 = calm · 10 = max stress</span></label>
              <div className="hlog-score-row">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n}
                    className={`hlog-score-btn${Number(stress) === n ? ' active' : ''}`}
                    style={Number(stress) === n ? {background:'#10b981',borderColor:'#10b981',color:'#fff'} : {}}
                    onClick={() => setStress(n)}>{n}</button>
                ))}
              </div>
            </div>
          )}

          {/* Workout */}
          {show('workout') && (
            <div className="hlog-field">
              <label className="hlog-label">🏋️ Workout</label>
              <div className="hlog-qual-row" style={{ marginBottom: workoutStatus===1 ? 10:0 }}>
                {[1,2,3].map(s => (
                  <button key={s}
                    className={`hlog-qual-btn${workoutStatus === s ? ' active' : ''}`}
                    style={workoutStatus === s ? {
                      background: s===1?'#ef4444':s===2?'#6b7280':'#10b981',
                      borderColor:s===1?'#ef4444':s===2?'#6b7280':'#10b981', color:'#fff'
                    } : {}}
                    onClick={() => setWorkoutStatus(s)}>
                    {s===1?'💪 Yes':s===2?'✗ No':'😴 Rest day'}
                  </button>
                ))}
              </div>
              {workoutStatus === 1 && (
                <div className="hlog-workout-detail">
                  <div className="hlog-qual-row">
                    {[1,2,3,4].map(i => (
                      <button key={i}
                        className={`hlog-qual-btn${workoutIntensity === i ? ' active' : ''}`}
                        style={workoutIntensity === i ? {background:'#ef4444',borderColor:'#ef4444',color:'#fff'} : {}}
                        onClick={() => setWorkoutIntensity(i)}>
                        {WORKOUT_INTENSITY[i]}
                      </button>
                    ))}
                  </div>
                  <input className="modal-input hlog-num" type="number" min="0" max="600"
                    placeholder="Minutes (optional)" style={{ marginTop:8 }}
                    value={workoutMins} onChange={e => setWorkoutMins(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {/* Steps */}
          {show('steps') && (
            <div className="hlog-field">
              <label className="hlog-label">👟 Steps</label>
              <input className="modal-input hlog-num" style={{width:160}} type="number" min="0"
                placeholder="e.g. 8000" value={steps} onChange={e => setSteps(e.target.value)} />
            </div>
          )}

          {/* Meditation */}
          {show('meditation') && (
            <div className="hlog-field">
              <label className="hlog-label">🧘‍♀️ Meditation <span className="hlog-range">minutes</span></label>
              <input className="modal-input hlog-num" type="number" min="0"
                placeholder="e.g. 10" value={meditationMins} onChange={e => setMeditationMins(e.target.value)} />
            </div>
          )}

          {/* Body weight */}
          {show('weight') && (
            <div className="hlog-field">
              <label className="hlog-label">⚖️ Body weight</label>
              <div className="hlog-row" style={{gap:8,alignItems:'center'}}>
                <input className="modal-input hlog-num" type="number" min="0" step="0.1"
                  placeholder={weightUnit==='kg'?'e.g. 72.5':'e.g. 160'}
                  value={weightVal} onChange={e => setWeightVal(e.target.value)} />
                <div className="hlog-unit-toggle">
                  {['kg','lb'].map(u => (
                    <button key={u} className={`hlog-unit-btn${weightUnit===u?' active':''}`}
                      onClick={() => {
                        if (weightVal!=='' && weightUnit!==u)
                          setWeightVal(String(u==='lb' ? kgToLb(Number(weightVal)) : lbToKg(Number(weightVal))))
                        setWeightUnit(u)
                      }}>{u}</button>
                  ))}
                </div>
                {weightVal && weightUnit==='lb' && (
                  <span style={{fontSize:12,color:'var(--text3)'}}>= {lbToKg(Number(weightVal))} kg</span>
                )}
              </div>
            </div>
          )}

          {/* Heart rate */}
          {show('bpm') && (
            <div className="hlog-field">
              <label className="hlog-label">❤️ Resting heart rate <span className="hlog-range">bpm</span></label>
              <input className="modal-input hlog-num" type="number" min="30" max="220"
                placeholder="e.g. 68" value={bpm} onChange={e => setBpm(e.target.value)} />
            </div>
          )}

          {/* Blood pressure */}
          {show('bp') && (
            <div className="hlog-field">
              <label className="hlog-label">🩺 Blood pressure <span className="hlog-range">mmHg</span></label>
              <div className="hlog-row" style={{gap:8}}>
                <input className="modal-input hlog-num" type="number" min="60" max="250"
                  placeholder="Systolic" value={bpSys} onChange={e => setBpSys(e.target.value)} />
                <span style={{color:'var(--text3)',fontSize:18}}>/</span>
                <input className="modal-input hlog-num" type="number" min="40" max="150"
                  placeholder="Diastolic" value={bpDia} onChange={e => setBpDia(e.target.value)} />
              </div>
            </div>
          )}

          {/* Glucose */}
          {show('glucose') && (
            <div className="hlog-field">
              <label className="hlog-label">🩸 Glucose <span className="hlog-range">mmol/L</span></label>
              <input className="modal-input hlog-num" type="number" min="0" step="0.1"
                placeholder="e.g. 5.4" value={glucose} onChange={e => setGlucose(e.target.value)} />
            </div>
          )}

          {/* Period */}
          {show('period') && (
            <div className="hlog-field">
              <label className="hlog-label">🌸 Period</label>
              <div className="hlog-qual-row" style={{marginBottom: onPeriod ? 8:0}}>
                <button className={`hlog-qual-btn${onPeriod===true?' active':''}`}
                  style={onPeriod===true?{background:'#e879f9',borderColor:'#e879f9',color:'#fff'}:{}}
                  onClick={() => setOnPeriod(p => p===true?null:true)}>Yes, on period</button>
                <button className={`hlog-qual-btn${onPeriod===false?' active':''}`}
                  style={onPeriod===false?{background:'var(--border2)',borderColor:'var(--border2)',color:'var(--text2)'}:{}}
                  onClick={() => { setOnPeriod(p => p===false?null:false); setPeriodFlow(0) }}>Not on period</button>
              </div>
              {onPeriod === true && (
                <div className="hlog-qual-row">
                  {[1,2,3,4].map(q => (
                    <button key={q}
                      className={`hlog-qual-btn${periodFlow===q?' active':''}`}
                      style={periodFlow===q?{background:'#e879f9',borderColor:'#e879f9',color:'#fff'}:{}}
                      onClick={() => setPeriodFlow(pf => pf===q?0:q)}>
                      {PERIOD_LABELS[q]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Medication — per-medication checkboxes */}
          {show('medication') && (
            <div className="hlog-field">
              <label className="hlog-label">💊 Medications</label>
              {medications.length === 0 ? (
                <p style={{fontSize:13,color:'var(--text3)'}}>No medications set up yet. Add them in the Medications section below.</p>
              ) : (
                <div className="hlog-med-list">
                  {medications.map(med => {
                    const val = medLogs[med.id] ?? null
                    const sch = SCHEDULES.find(s => s.id === med.schedule)
                    return (
                      <div key={med.id} className="hlog-med-row">
                        <div className="hlog-med-info">
                          <span className="hlog-med-name">{med.name}</span>
                          {med.dosage   && <span className="hlog-med-sub">{med.dosage}</span>}
                          {sch          && <span className="hlog-med-sub">{sch.label}</span>}
                        </div>
                        <div className="hlog-med-btns">
                          <button
                            className={`hlog-med-btn taken${val===true?' active':''}`}
                            onClick={() => setMedLogs(l => ({...l,[med.id]:l[med.id]===true?null:true}))}>
                            ✓
                          </button>
                          <button
                            className={`hlog-med-btn missed${val===false?' active':''}`}
                            onClick={() => setMedLogs(l => ({...l,[med.id]:l[med.id]===false?null:false}))}>
                            ✗
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
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
  const enabledMetrics = settings.healthMetrics || ['energy','sleep','stress']

  const [todayLog,     setTodayLog]     = useState(null)
  const [history,      setHistory]      = useState([])
  const [showModal,    setShowModal]    = useState(false)
  const [loading,      setLoading]      = useState(true)

  // Medications state
  const [medications,  setMedications]  = useState([])
  const [todayMedLogs, setTodayMedLogs] = useState({})
  const [showMedForm,  setShowMedForm]  = useState(false)
  const [editingMed,   setEditingMed]   = useState(null) // med object being edited

  const today = todayStr()

  const loadMedications = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('user_medications')
      .select('*').eq('user_id', userId).eq('active', true).order('sort_order').order('created_at')
    setMedications(data || [])
  }, [userId])

  const loadTodayMedLogs = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('medication_logs')
      .select('*').eq('user_id', userId).eq('log_date', today)
    const map = {}
    ;(data || []).forEach(l => { map[l.medication_id] = l.taken })
    setTodayMedLogs(map)
  }, [userId, today])

  async function loadData() {
    if (!userId) { setLoading(false); return }
    const from = new Date(); from.setDate(from.getDate() - 6)
    const { data } = await supabase.from('health_logs').select('*')
      .eq('user_id', userId).gte('log_date', from.toISOString().split('T')[0])
      .order('log_date', { ascending: false })
    const logs = data || []
    setTodayLog(logs.find(l => l.log_date === today) || null)
    setHistory(logs)
    await Promise.all([loadMedications(), loadTodayMedLogs()])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [userId]) // eslint-disable-line

  async function saveLog(payload, medLogsToSave) {
    if (!userId) return
    let saved
    if (todayLog) {
      const { data } = await supabase.from('health_logs')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', todayLog.id).select().single()
      saved = data
      if (saved) { setTodayLog(saved); setHistory(prev => prev.map(l => l.id===saved.id?saved:l)) }
    } else {
      const { data } = await supabase.from('health_logs')
        .insert({ ...payload, user_id: userId, log_date: today }).select().single()
      saved = data
      if (saved) { setTodayLog(saved); setHistory(prev => [saved,...prev]) }
    }
    // Save per-medication logs
    const entries = Object.entries(medLogsToSave).filter(([,v]) => v !== null)
    if (entries.length > 0) {
      await supabase.from('medication_logs').upsert(
        entries.map(([medId, taken]) => ({ user_id: userId, medication_id: medId, log_date: today, taken })),
        { onConflict: 'user_id,medication_id,log_date' }
      )
      await loadTodayMedLogs()
    }
    setShowModal(false)
  }

  async function saveMedication(data) {
    if (!userId) return
    if (editingMed) {
      await supabase.from('user_medications').update(data).eq('id', editingMed.id)
    } else {
      await supabase.from('user_medications').insert({ ...data, user_id: userId })
    }
    setShowMedForm(false); setEditingMed(null)
    await loadMedications()
  }

  async function deleteMedication(id) {
    await supabase.from('user_medications').update({ active: false }).eq('id', id)
    await loadMedications()
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'40vh',color:'var(--text3)',fontSize:14}}>
      Loading…
    </div>
  )

  const strip = Array.from({ length:7 }, (_,i) => {
    const d = new Date(); d.setDate(d.getDate()-i)
    const ds = d.toISOString().split('T')[0]
    return { dateStr:ds, log:history.find(l=>l.log_date===ds), isToday:i===0 }
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

      {/* Dashboard cards */}
      <div className="health-cards">
        {enabledMetrics.filter(m => METRICS[m]).map(m => (
          <div key={m} className="health-card" style={{'--hc-color': METRICS[m].color}}>
            <div className="hc-top">
              <span className="hc-emoji">{METRICS[m].emoji}</span>
              <span className="hc-label">{METRICS[m].label}</span>
            </div>
            <div className="hc-val">
              <MetricCardVal m={m} log={todayLog} medLogs={todayMedLogs} medications={medications} />
            </div>
          </div>
        ))}
      </div>

      {/* 7-day strip */}
      <div className="health-section-title">Last 7 days</div>
      <div className="health-strip">
        {strip.map(({ dateStr, log, isToday }) => (
          <div key={dateStr} className={`hs-day${isToday?' hs-today':''}${log?' hs-logged':''}`}>
            <div className="hs-date">
              {isToday ? 'Today' : new Date(dateStr+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'})}
            </div>
            <div className="hs-dots">
              {enabledMetrics.slice(0,5).filter(m => METRICS[m]).map(m => (
                <div key={m} className="hs-dot"
                  style={{ background: getMetricVal(m,log)!=null ? METRICS[m].color : 'var(--border2)' }}
                  title={`${METRICS[m].label}${getMetricVal(m,log)!=null?': logged':': not logged'}`} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── My Medications ── */}
      {enabledMetrics.includes('medication') && (
        <div className="health-meds-section">
          <div className="health-meds-header">
            <span className="health-section-title" style={{marginBottom:0}}>My medications</span>
            {!showMedForm && (
              <button className="btn-ghost btn-sm" onClick={() => { setEditingMed(null); setShowMedForm(true) }}>
                + Add
              </button>
            )}
          </div>

          {medications.length === 0 && !showMedForm && (
            <p className="health-meds-empty">No medications added yet. Add one to track daily intake.</p>
          )}

          {medications.length > 0 && (
            <div className="health-med-list">
              {medications.map(med => {
                const sch = SCHEDULES.find(s => s.id === med.schedule)
                const taken = todayMedLogs[med.id]
                return editingMed?.id === med.id ? (
                  <MedForm key={med.id} initial={med}
                    onSave={saveMedication}
                    onCancel={() => { setEditingMed(null); setShowMedForm(false) }} />
                ) : (
                  <div key={med.id} className="health-med-row">
                    <div className="health-med-info">
                      <span className="health-med-name">💊 {med.name}</span>
                      <div className="health-med-meta">
                        {med.dosage   && <span className="health-med-chip">{med.dosage}</span>}
                        {sch          && <span className="health-med-chip">{sch.label}</span>}
                        {taken === true  && <span className="health-med-chip" style={{color:'#22d3ee',borderColor:'#22d3ee33',background:'#22d3ee11'}}>✓ Taken today</span>}
                        {taken === false && <span className="health-med-chip" style={{color:'#ef4444',borderColor:'#ef444433',background:'#ef444411'}}>✗ Missed today</span>}
                      </div>
                    </div>
                    <div className="health-med-actions">
                      <button className="icon-btn" title="Edit"
                        onClick={() => { setEditingMed(med); setShowMedForm(false) }}>✏️</button>
                      <button className="icon-btn" title="Remove"
                        onClick={() => deleteMedication(med.id)}>🗑</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {showMedForm && !editingMed && (
            <MedForm
              onSave={saveMedication}
              onCancel={() => setShowMedForm(false)} />
          )}
        </div>
      )}

      {/* Log history */}
      {history.length > 0 && (
        <>
          <div className="health-section-title" style={{marginTop:'1.5rem'}}>Log history</div>
          <div className="health-log-list">
            {history.map(log => {
              const ws = log.workout_status ?? (log.workout_done===true?1:null)
              const si = sleepScoreInfo(log.sleep_score)
              const hrs = log.sleep_start && log.wake_time
                ? calcSleepHours(log.sleep_start, log.wake_time) : log.sleep_hours
              return (
                <div key={log.id} className="hll-row">
                  <div className="hll-date">
                    {fmtDate(log.log_date)}
                    {log.log_date===today && <span className="hll-today-tag">Today</span>}
                  </div>
                  <div className="hll-metrics">
                    {log.energy_score    != null && <span className="hll-chip" style={{'--chip-c':'#f59e0b'}}>⚡ {log.energy_score}/100</span>}
                    {(log.sleep_start||hrs!=null) && <span className="hll-chip" style={{'--chip-c':'#6366f1'}}>😴 {log.sleep_start?`${fmtTime(log.sleep_start)}→${fmtTime(log.wake_time)} `:''}{hrs?`${hrs}h`:''}{si?` · ${si.label}`:''}</span>}
                    {log.stress_score    != null && <span className="hll-chip" style={{'--chip-c':'#10b981'}}>🧘 {log.stress_score}/10</span>}
                    {ws===1 && <span className="hll-chip" style={{'--chip-c':'#ef4444'}}>🏋️ {log.workout_intensity?WORKOUT_INTENSITY[log.workout_intensity]:'Done'}{log.workout_mins?` · ${log.workout_mins}min`:''}</span>}
                    {ws===2 && <span className="hll-chip" style={{'--chip-c':'#6b7280'}}>🏋️ Skipped</span>}
                    {ws===3 && <span className="hll-chip" style={{'--chip-c':'#10b981'}}>😴 Rest day</span>}
                    {log.steps           != null && <span className="hll-chip" style={{'--chip-c':'#06b6d4'}}>👟 {log.steps.toLocaleString()}</span>}
                    {log.meditation_mins != null && <span className="hll-chip" style={{'--chip-c':'#8b5cf6'}}>🧘‍♀️ {log.meditation_mins}min</span>}
                    {log.weight_kg       != null && <span className="hll-chip" style={{'--chip-c':'#f97316'}}>⚖️ {log.weight_kg}kg</span>}
                    {log.bpm_resting     != null && <span className="hll-chip" style={{'--chip-c':'#ec4899'}}>❤️ {log.bpm_resting}bpm</span>}
                    {log.bp_systolic     != null && <span className="hll-chip" style={{'--chip-c':'#14b8a6'}}>🩺 {log.bp_systolic}/{log.bp_diastolic}</span>}
                    {log.glucose_mmol    != null && <span className="hll-chip" style={{'--chip-c':'#f43f5e'}}>🩸 {log.glucose_mmol}mmol</span>}
                    {log.period_flow     != null && <span className="hll-chip" style={{'--chip-c':'#e879f9'}}>🌸 {PERIOD_LABELS[log.period_flow]}</span>}
                  </div>
                  {log.notes && <div className="hll-notes">📝 {log.notes}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      <LogModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSave={saveLog}
        existing={todayLog}
        existingMedLogs={todayMedLogs}
        enabledMetrics={enabledMetrics}
        medications={medications}
      />
    </div>
  )
}
