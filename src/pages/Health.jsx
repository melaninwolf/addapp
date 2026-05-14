import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getSettings } from '../settings'
import './Health.css'

// ── Metric definitions ────────────────────────────────────────
const METRICS = {
  energy: {
    label: 'Energy',
    emoji: '⚡',
    unit: '/ 10',
    type: 'score10',
    color: '#f59e0b',
    desc: 'How energised do you feel today?',
  },
  sleep: {
    label: 'Sleep',
    emoji: '😴',
    unit: 'hrs',
    type: 'sleep',
    color: '#6366f1',
    desc: 'How long did you sleep?',
  },
  stress: {
    label: 'Stress',
    emoji: '🧘',
    unit: '/ 10',
    type: 'score10',
    color: '#10b981',
    desc: 'Stress level today (1 = calm, 10 = very stressed)',
  },
}

const QUALITY_LABELS = ['', 'Poor', 'Fair', 'OK', 'Good', 'Great']

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

// ── Log modal ─────────────────────────────────────────────────
function LogModal({ open, onClose, onSave, existing, enabledMetrics }) {
  const [energy,      setEnergy]      = useState('')
  const [sleepHrs,    setSleepHrs]    = useState('')
  const [sleepQual,   setSleepQual]   = useState('')
  const [stress,      setStress]      = useState('')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    if (!open) return
    setEnergy(existing?.energy_score ?? '')
    setSleepHrs(existing?.sleep_hours ?? '')
    setSleepQual(existing?.sleep_quality ?? '')
    setStress(existing?.stress_score ?? '')
    setNotes(existing?.notes ?? '')
  }, [open, existing])

  if (!open) return null

  async function handleSave() {
    setSaving(true)
    await onSave({
      energy_score:  energy  !== '' ? Number(energy)  : null,
      sleep_hours:   sleepHrs !== '' ? Number(sleepHrs) : null,
      sleep_quality: sleepQual !== '' ? Number(sleepQual) : null,
      stress_score:  stress  !== '' ? Number(stress)  : null,
      notes:         notes.trim() || null,
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

          {enabledMetrics.includes('energy') && (
            <div className="hlog-field">
              <label className="hlog-label">⚡ Energy score <span className="hlog-range">1–10</span></label>
              <div className="hlog-score-row">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n}
                    className={`hlog-score-btn${Number(energy) === n ? ' active' : ''}`}
                    style={Number(energy) === n ? { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' } : {}}
                    onClick={() => setEnergy(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {enabledMetrics.includes('sleep') && (
            <div className="hlog-field">
              <label className="hlog-label">😴 Sleep hours</label>
              <div className="hlog-row">
                <input className="modal-input hlog-num" type="number" min="0" max="24" step="0.5"
                  placeholder="e.g. 7.5" value={sleepHrs} onChange={e => setSleepHrs(e.target.value)} />
                <div className="hlog-qual-row">
                  {[1,2,3,4,5].map(q => (
                    <button key={q}
                      className={`hlog-qual-btn${Number(sleepQual) === q ? ' active' : ''}`}
                      style={Number(sleepQual) === q ? { background: '#6366f1', borderColor: '#6366f1', color: '#fff' } : {}}
                      onClick={() => setSleepQual(q)}
                      title={QUALITY_LABELS[q]}>
                      {QUALITY_LABELS[q]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {enabledMetrics.includes('stress') && (
            <div className="hlog-field">
              <label className="hlog-label">🧘 Stress level <span className="hlog-range">1 = calm · 10 = max stress</span></label>
              <div className="hlog-score-row">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n}
                    className={`hlog-score-btn${Number(stress) === n ? ' active' : ''}`}
                    style={Number(stress) === n ? { background: '#10b981', borderColor: '#10b981', color: '#fff' } : {}}
                    onClick={() => setStress(n)}>
                    {n}
                  </button>
                ))}
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
  const settings      = getSettings()
  const enabledMetrics = settings.healthMetrics || ['energy', 'sleep', 'stress']

  const [todayLog,   setTodayLog]   = useState(null)
  const [history,    setHistory]    = useState([])   // last 7 days
  const [showModal,  setShowModal]  = useState(false)
  const [loading,    setLoading]    = useState(true)

  const today = todayStr()

  async function loadData() {
    if (!userId) { setLoading(false); return }
    const from = new Date(); from.setDate(from.getDate() - 6)
    const fromStr = from.toISOString().split('T')[0]

    const { data } = await supabase
      .from('health_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', fromStr)
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
      const { data } = await supabase
        .from('health_logs').update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', todayLog.id).select().single()
      if (data) {
        setTodayLog(data)
        setHistory(prev => prev.map(l => l.id === data.id ? data : l))
      }
    } else {
      const { data } = await supabase
        .from('health_logs').insert({ ...payload, user_id: userId, log_date: today })
        .select().single()
      if (data) {
        setTodayLog(data)
        setHistory(prev => [data, ...prev])
      }
    }
    setShowModal(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', fontSize:14 }}>
      Loading…
    </div>
  )

  // Build 7-day strip (today → 6 days ago)
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    const log = history.find(l => l.log_date === ds)
    return { dateStr: ds, log, isToday: i === 0 }
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

      {/* ── Today's dashboard ── */}
      <div className="health-cards">
        {enabledMetrics.filter(m => METRICS[m]).map(m => {
          const meta = METRICS[m]
          const val  = todayLog?.[m === 'energy' ? 'energy_score' : m === 'sleep' ? 'sleep_hours' : 'stress_score']
          const qual = m === 'sleep' ? todayLog?.sleep_quality : null

          return (
            <div key={m} className="health-card" style={{ '--hc-color': meta.color }}>
              <div className="hc-top">
                <span className="hc-emoji">{meta.emoji}</span>
                <span className="hc-label">{meta.label}</span>
              </div>
              <div className="hc-val">
                {val != null ? (
                  <>
                    <span className="hc-num">{val}</span>
                    <span className="hc-unit">{meta.unit}</span>
                    <span className="hc-mood">
                      {m === 'stress' ? stressEmoji(val) : scoreEmoji(val, m === 'sleep' ? 12 : 10)}
                    </span>
                  </>
                ) : (
                  <span className="hc-empty">Not logged</span>
                )}
              </div>
              {qual != null && (
                <div className="hc-sub">{QUALITY_LABELS[qual]} quality</div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 7-day history strip ── */}
      <div className="health-section-title">Last 7 days</div>
      <div className="health-strip">
        {strip.map(({ dateStr, log, isToday }) => {
          const hasLog = !!log
          const energy = log?.energy_score
          const sleep  = log?.sleep_hours
          const stress = log?.stress_score
          return (
            <div key={dateStr} className={`hs-day${isToday ? ' hs-today' : ''}${hasLog ? ' hs-logged' : ''}`}>
              <div className="hs-date">
                {isToday ? 'Today' : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="hs-dots">
                {enabledMetrics.includes('energy') && (
                  <div className="hs-dot" style={{ background: energy ? '#f59e0b' : 'var(--border2)' }}
                    title={energy ? `Energy: ${energy}/10` : 'Energy not logged'} />
                )}
                {enabledMetrics.includes('sleep') && (
                  <div className="hs-dot" style={{ background: sleep ? '#6366f1' : 'var(--border2)' }}
                    title={sleep ? `Sleep: ${sleep}h` : 'Sleep not logged'} />
                )}
                {enabledMetrics.includes('stress') && (
                  <div className="hs-dot" style={{ background: stress ? '#10b981' : 'var(--border2)' }}
                    title={stress ? `Stress: ${stress}/10` : 'Stress not logged'} />
                )}
              </div>
              {hasLog && (
                <div className="hs-vals">
                  {energy != null && <span style={{ color:'#f59e0b' }}>{energy}</span>}
                  {sleep  != null && <span style={{ color:'#6366f1' }}>{sleep}h</span>}
                  {stress != null && <span style={{ color:'#10b981' }}>{stress}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Recent logs list ── */}
      {history.length > 0 && (
        <>
          <div className="health-section-title" style={{ marginTop:'1.5rem' }}>Log history</div>
          <div className="health-log-list">
            {history.map(log => (
              <div key={log.id} className="hll-row">
                <div className="hll-date">{fmtDate(log.log_date)}{log.log_date === today && <span className="hll-today-tag">Today</span>}</div>
                <div className="hll-metrics">
                  {log.energy_score != null && (
                    <span className="hll-chip" style={{ '--chip-c':'#f59e0b' }}>⚡ {log.energy_score}/10</span>
                  )}
                  {log.sleep_hours != null && (
                    <span className="hll-chip" style={{ '--chip-c':'#6366f1' }}>😴 {log.sleep_hours}h{log.sleep_quality ? ` · ${QUALITY_LABELS[log.sleep_quality]}` : ''}</span>
                  )}
                  {log.stress_score != null && (
                    <span className="hll-chip" style={{ '--chip-c':'#10b981' }}>🧘 {log.stress_score}/10</span>
                  )}
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
