import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import './Tracker.css'

// ── Constants ─────────────────────────────────────────────────
const COLORS = [
  '#3b82f6', '#22c55e', '#ef4444', '#f97316', '#a855f7',
  '#ec4899', '#eab308', '#14b8a6', '#8b5cf6', '#06b6d4',
  '#84cc16', '#f43f5e', '#fb923c', '#a3e635',
]

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ───────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0] }

function buildYearGrid(year) {
  const jan1   = new Date(year, 0, 1)
  const startPad = jan1.getDay() // 0 = Sun, pad so week col 0 starts on Sunday
  const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))
  const totalDays = isLeap ? 366 : 365

  const allDates = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(year, 0, 1 + i)
    allDates.push(
      `${year}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    )
  }

  // Pad to full weeks (Sunday-anchored)
  const padded = Array(startPad).fill(null).concat(allDates)
  while (padded.length % 7 !== 0) padded.push(null)

  const weeks = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }
  return { weeks, allDates }
}

function getMonthCols(weeks) {
  // Returns { monthIndex: weekColIndex } for the first week of each month
  const cols = {}
  weeks.forEach((week, wi) => {
    week.forEach(ds => {
      if (!ds) return
      const d = new Date(ds + 'T12:00:00')
      if (d.getDate() === 1) cols[d.getMonth()] = wi
    })
  })
  return cols
}

function calcStreak(logSet) {
  const today = todayStr()
  let streak = 0
  let d = new Date(today + 'T12:00:00')
  // If today not yet checked, start counting from yesterday
  if (!logSet.has(today)) d.setDate(d.getDate() - 1)
  while (true) {
    const ds = d.toISOString().split('T')[0]
    if (!logSet.has(ds)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// ── TrackerGrid ───────────────────────────────────────────────
function TrackerGrid({ tracker, logSet, year, onToggle }) {
  const today = todayStr()
  const { weeks } = buildYearGrid(year)
  const monthCols  = getMonthCols(weeks)

  return (
    <div className="trk-grid-outer">
      {/* Month labels */}
      <div className="trk-month-row">
        {weeks.map((_, wi) => {
          const monthEntry = Object.entries(monthCols).find(([, col]) => col === wi)
          return (
            <div key={wi} className="trk-month-cell">
              {monthEntry ? MONTH_ABBR[parseInt(monthEntry[0])] : ''}
            </div>
          )
        })}
      </div>

      {/* Day-of-week labels + grid side by side */}
      <div className="trk-grid-body">
        <div className="trk-dow-col">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} className="trk-dow-label">{i % 2 === 1 ? d : ''}</div>
          ))}
        </div>
        <div className="trk-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="trk-week-col">
              {week.map((ds, dow) => {
                if (!ds) return <div key={dow} className="trk-cell trk-cell-empty" />
                const done   = logSet.has(ds)
                const future = ds > today
                return (
                  <button
                    key={dow}
                    className={`trk-cell${done ? ' trk-done' : ''}${future ? ' trk-future' : ''}`}
                    style={done ? { background: tracker.color, borderColor: tracker.color } : {}}
                    title={ds}
                    disabled={future}
                    onClick={() => !future && onToggle(tracker.id, ds, done)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── TrackerForm (add / edit) ──────────────────────────────────
function TrackerForm({ initial, onSave, onCancel }) {
  const [name,   setName]   = useState(initial?.name  || '')
  const [color,  setColor]  = useState(initial?.color || COLORS[0])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    await onSave({ name: name.trim(), color })
    setSaving(false)
  }

  return (
    <div className="trk-form">
      <input
        className="trk-form-input"
        placeholder="What are you tracking? (e.g. Exercise, Reading, Water…)"
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
      />
      <div className="trk-color-row">
        <span className="trk-color-label">Color</span>
        <div className="trk-color-picker">
          {COLORS.map(c => (
            <button
              key={c}
              className={`trk-color-swatch${color === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
      </div>
      <div className="trk-form-actions">
        <button className="trk-btn-cancel" onClick={onCancel}>Cancel</button>
        <button
          className="trk-btn-save"
          onClick={handleSave}
          disabled={!name.trim() || saving}
        >
          {saving ? 'Saving…' : initial ? 'Update' : 'Add tracker'}
        </button>
      </div>
    </div>
  )
}

// ── Main Tracker page ─────────────────────────────────────────
export default function Tracker({ userId }) {
  const [trackers, setTrackers] = useState([])
  const [logsMap,  setLogsMap]  = useState({}) // trackerId → Set<dateStr>
  const [year,     setYear]     = useState(() => new Date().getFullYear())
  const [adding,   setAdding]   = useState(false)
  const [editing,  setEditing]  = useState(null) // tracker object or null
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { if (userId) load() }, [userId, year]) // eslint-disable-line

  async function load() {
    setLoading(true)
    const [tRes, lRes] = await Promise.all([
      supabase.from('habit_trackers').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('habit_logs').select('tracker_id, log_date')
        .eq('user_id', userId)
        .gte('log_date', `${year}-01-01`)
        .lte('log_date', `${year}-12-31`),
    ])
    const trks = tRes.data || []
    setTrackers(trks)

    const map = {}
    for (const t of trks) map[t.id] = new Set()
    for (const log of (lRes.data || [])) {
      if (map[log.tracker_id]) map[log.tracker_id].add(log.log_date)
    }
    setLogsMap(map)
    setLoading(false)
  }

  async function addTracker({ name, color }) {
    const { data } = await supabase.from('habit_trackers').insert([{
      user_id: userId, name, color, sort_order: trackers.length * 10,
    }]).select()
    if (data) {
      setTrackers(prev => [...prev, data[0]])
      setLogsMap(prev => ({ ...prev, [data[0].id]: new Set() }))
    }
    setAdding(false)
  }

  async function updateTracker({ name, color }) {
    const { data } = await supabase.from('habit_trackers')
      .update({ name, color }).eq('id', editing.id).select()
    if (data) setTrackers(prev => prev.map(t => t.id === editing.id ? data[0] : t))
    setEditing(null)
  }

  async function deleteTracker(id) {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Delete this tracker and all its history?')) return
    await supabase.from('habit_trackers').delete().eq('id', id)
    setTrackers(prev => prev.filter(t => t.id !== id))
    setLogsMap(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  async function toggleLog(trackerId, dateStr, wasDone) {
    // Optimistic UI update
    setLogsMap(prev => {
      const next = { ...prev, [trackerId]: new Set(prev[trackerId]) }
      if (wasDone) next[trackerId].delete(dateStr)
      else         next[trackerId].add(dateStr)
      return next
    })
    if (wasDone) {
      await supabase.from('habit_logs').delete()
        .eq('user_id', userId).eq('tracker_id', trackerId).eq('log_date', dateStr)
    } else {
      await supabase.from('habit_logs').upsert(
        { user_id: userId, tracker_id: trackerId, log_date: dateStr },
        { onConflict: 'user_id,tracker_id,log_date' }
      )
    }
  }

  return (
    <div className="tracker-page">

      {/* Header */}
      <div className="trk-header">
        <div>
          <h1 className="trk-title">Tracker</h1>
          <p className="trk-subtitle">Track habits across the year. Tap any day to check it off.</p>
        </div>
        <div className="trk-header-right">
          <div className="trk-year-nav">
            <button className="trk-nav-btn" onClick={() => setYear(y => y - 1)}>‹</button>
            <span className="trk-year-label">{year}</span>
            <button className="trk-nav-btn" onClick={() => setYear(y => y + 1)}>›</button>
          </div>
          {!adding && !editing && (
            <button className="trk-add-btn" onClick={() => setAdding(true)}>+ Add tracker</button>
          )}
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="trk-form-wrap">
          <TrackerForm onSave={addTracker} onCancel={() => setAdding(false)} />
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="trk-form-wrap">
          <TrackerForm initial={editing} onSave={updateTracker} onCancel={() => setEditing(null)} />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="trk-loading">Loading…</div>
      ) : trackers.length === 0 && !adding ? (
        <div className="trk-empty">
          <div className="trk-empty-icon">📋</div>
          <div className="trk-empty-title">Nothing tracked yet</div>
          <div className="trk-empty-sub">
            Add something you want to build — exercise, reading, no caffeine, anything.
          </div>
          <button className="trk-add-btn" onClick={() => setAdding(true)}>+ Add your first tracker</button>
        </div>
      ) : (
        <div className="trk-list">
          {trackers.map(t => {
            const logSet = logsMap[t.id] || new Set()
            const streak = calcStreak(logSet)
            const total  = logSet.size
            return (
              <div key={t.id} className="trk-card">
                <div className="trk-card-head">
                  <div className="trk-card-title-row">
                    <div className="trk-color-bar" style={{ background: t.color }} />
                    <span className="trk-name">{t.name}</span>
                    <div className="trk-stats-row">
                      {streak > 0 && <span className="trk-stat">🔥 {streak} streak</span>}
                      <span className="trk-stat">✅ {total} / {year === new Date().getFullYear() ? new Date().toISOString().split('T')[0].slice(8)*1 + new Date().toISOString().split('T')[0].slice(5,7)*1 : 365}</span>
                    </div>
                  </div>
                  <div className="trk-card-actions">
                    <button className="trk-action-btn" onClick={() => { setEditing(t); setAdding(false) }}>Edit</button>
                    <button className="trk-action-btn trk-del-btn" onClick={() => deleteTracker(t.id)}>Delete</button>
                  </div>
                </div>
                <TrackerGrid
                  tracker={t}
                  logSet={logSet}
                  year={year}
                  onToggle={toggleLog}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
