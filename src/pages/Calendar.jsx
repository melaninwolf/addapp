import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import './Calendar.css'

// Lightweight sample data for logged-out preview
const SAMPLE_ROUTINES = [
  { id: 1, type: 'routine', name: 'Morning Routine', time: '07:00', emoji: '🌅',
    days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [{ id:1, name:'Drink water', dur:2 },{ id:2, name:'Get dressed', dur:20 }] },
  { id: 2, type: 'routine', name: 'Night Routine', time: '21:30', emoji: '🌙',
    days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [{ id:1, name:'Put phone away', dur:1 },{ id:2, name:'Read', dur:20 }] },
  { id: 3, type: 'routine', name: 'Work Focus', time: '09:00', emoji: '💻',
    days: ['mon','tue','wed','thu','fri'],
    steps: [{ id:1, name:'Clear inbox', dur:10 },{ id:2, name:'Plan top 3 tasks', dur:5 }] },
]

const DOW_KEYS   = ['sun','mon','tue','wed','thu','fri','sat']
const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

function fmtTime(t) {
  if (!t) return 'Flexible'
  const [h, m] = t.split(':')
  const hh = parseInt(h)
  return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`
}

function totalMins(steps) {
  if (!steps || !steps.length) return 0
  return steps.reduce((a, s) => a + (s.dur || 0), 0)
}

function getCalendarCells(year, month) {
  const firstDow   = new Date(year, month, 1).getDay()          // 0 = Sun
  const daysInMo   = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const cells = []

  // Tail of previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false })
  }
  // Current month
  for (let d = 1; d <= daysInMo; d++) {
    cells.push({ date: new Date(year, month, d), current: true })
  }
  // Head of next month — fill to 42 cells (6 rows)
  let next = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, next++), current: false })
  }
  return cells
}

export default function Calendar({ userId }) {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selected,  setSelected]  = useState(today)
  const [routines,  setRoutines]  = useState([])
  const [loading,   setLoading]   = useState(!!userId)

  useEffect(() => {
    if (!userId) { setRoutines(SAMPLE_ROUTINES); return }
    setLoading(true)
    supabase
      .from('routines')
      .select('*')
      .eq('user_id', userId)
      .order('time', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setRoutines(data || [])
        setLoading(false)
      })
  }, [userId])

  const cells = getCalendarCells(viewYear, viewMonth)

  function routinesForDate(date) {
    const dow = DOW_KEYS[date.getDay()]
    return routines
      .filter(r => r.days && r.days.includes(dow))
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelected(today)
  }

  const selectedRoutines = routinesForDate(selected)
  const isThisMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  return (
    <div className="calendar-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">Your routines mapped across the week.</p>
        </div>
        {!isThisMonth && (
          <button className="btn-ghost" onClick={goToday}>Today</button>
        )}
      </div>

      <div className="cal-layout">

        {/* ── LEFT: month grid ── */}
        <div className="cal-main">

          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
            <span className="cal-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          </div>

          <div className="cal-grid">

            {/* Day-of-week headers */}
            {DOW_LABELS.map(d => (
              <div key={d} className="cal-dow">{d}</div>
            ))}

            {/* Day cells */}
            {cells.map(({ date, current }, i) => {
              const isToday    = date.toDateString() === today.toDateString()
              const isSelected = date.toDateString() === selected.toDateString()
              const dayRout    = routinesForDate(date)
              return (
                <div
                  key={i}
                  className={[
                    'cal-day',
                    !current    && 'cal-day-out',
                    isToday     && 'cal-day-today',
                    isSelected  && 'cal-day-selected',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelected(date)}
                >
                  <span className="cal-day-num">{date.getDate()}</span>

                  {dayRout.length > 0 && (
                    <div className="cal-day-pills">
                      {dayRout.slice(0, 2).map(r => (
                        <div key={r.id} className="cal-pill" title={r.name}>
                          <span className="cal-pill-emoji">{r.emoji}</span>
                          <span className="cal-pill-name">{r.name}</span>
                        </div>
                      ))}
                      {dayRout.length > 2 && (
                        <div className="cal-pill cal-pill-more">+{dayRout.length - 2} more</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT: selected day panel ── */}
        <div className="cal-detail">
          <div className="cal-detail-date">
            {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {selected.toDateString() === today.toDateString() && (
              <span className="cal-today-tag">Today</span>
            )}
          </div>

          {loading ? (
            <div className="cal-detail-empty">Loading…</div>
          ) : selectedRoutines.length === 0 ? (
            <div className="cal-detail-empty">
              <span className="cal-empty-icon">🗓</span>
              <span>No routines scheduled</span>
            </div>
          ) : (
            <div className="cal-detail-list">
              {selectedRoutines.map(r => (
                <div key={r.id} className="cal-detail-item">
                  <div className="cdi-emoji">{r.emoji}</div>
                  <div className="cdi-info">
                    <div className="cdi-name">{r.name}</div>
                    <div className="cdi-meta">
                      {fmtTime(r.time)}
                      {r.steps && r.steps.length > 0 && (
                        <> · {r.steps.length} steps · {totalMins(r.steps)} min</>
                      )}
                    </div>
                    {r.type === 'trigger' && (
                      <span className="cdi-trigger-badge">🕹️ Trigger</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
