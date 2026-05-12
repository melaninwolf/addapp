import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import './Calendar.css'

const SAMPLE_ROUTINES = [
  { id: 1, type: 'routine', name: 'Morning Routine', time: '07:00', emoji: '🌅',
    days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [{ id:1, name:'Drink water', dur:2 },{ id:2, name:'Get dressed', dur:20 },{ id:3, name:'Eat breakfast', dur:15 }] },
  { id: 2, type: 'routine', name: 'Night Routine', time: '21:30', emoji: '🌙',
    days: ['mon','tue','wed','thu','fri','sat','sun'],
    steps: [{ id:1, name:'Put phone away', dur:1 },{ id:2, name:'Read', dur:20 }] },
  { id: 3, type: 'routine', name: 'Work Focus', time: '09:00', emoji: '💻',
    days: ['mon','tue','wed','thu','fri'],
    steps: [{ id:1, name:'Clear inbox', dur:10 },{ id:2, name:'Plan top 3', dur:5 }] },
  { id: 4, type: 'trigger', name: 'Deep Work Trigger', time: null, emoji: '🕹️',
    days: ['mon','wed','fri'],
    steps: [{ id:1, name:'Close all tabs', dur:2 },{ id:2, name:'Set timer', dur:1 }] },
]

const DOW_KEYS   = ['sun','mon','tue','wed','thu','fri','sat']
const DOW_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_FULL = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December']
const MONTH_ABR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtTime(t) {
  if (!t) return 'Flexible'
  const [h, m] = t.split(':')
  const hh = parseInt(h)
  return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`
}

function totalMins(steps) {
  if (!steps?.length) return 0
  return steps.reduce((a, s) => a + (s.dur || 0), 0)
}

function getCalendarCells(year, month) {
  const firstDow   = new Date(year, month, 1).getDay()
  const daysInMo   = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false })
  for (let d = 1; d <= daysInMo; d++)
    cells.push({ date: new Date(year, month, d), current: true })
  let next = 1
  while (cells.length < 42)
    cells.push({ date: new Date(year, month + 1, next++), current: false })
  return cells
}

function getWeekDays(anchor) {
  const d = new Date(anchor)
  d.setHours(0, 0, 0, 0)
  const sun = new Date(d)
  sun.setDate(d.getDate() - d.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sun)
    day.setDate(sun.getDate() + i)
    return day
  })
}

function weekRangeLabel(days) {
  const a = days[0], b = days[6]
  if (a.getMonth() === b.getMonth())
    return `${MONTH_ABR[a.getMonth()]} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`
  return `${MONTH_ABR[a.getMonth()]} ${a.getDate()} – ${MONTH_ABR[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`
}

// ─── Shared nav bar ───────────────────────────────────────────
function CalNav({ onPrev, onNext, label }) {
  return (
    <div className="cal-nav">
      <button className="cal-nav-btn" onClick={onPrev}>‹</button>
      <span className="cal-period-label">{label}</span>
      <button className="cal-nav-btn" onClick={onNext}>›</button>
    </div>
  )
}

// ─── Day event card (shared by Week + Day views) ──────────────
function EventCard({ r, showTime = false }) {
  return (
    <div className="event-card">
      <div className="ec-emoji">{r.emoji}</div>
      <div className="ec-body">
        <div className="ec-name">{r.name}</div>
        <div className="ec-meta">
          {showTime && <span>{fmtTime(r.time)} · </span>}
          {r.steps?.length > 0 && <>{r.steps.length} steps · {totalMins(r.steps)} min</>}
        </div>
        {r.type === 'trigger' && <span className="ec-trigger-tag">🕹️ Trigger</span>}
      </div>
    </div>
  )
}

// ─── MONTH VIEW ───────────────────────────────────────────────
function MonthView({ today, selected, setSelected, routinesForDate }) {
  const [year,  setYear]  = useState(selected.getFullYear())
  const [month, setMonth] = useState(selected.getMonth())

  function prev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function next() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const cells = getCalendarCells(year, month)
  const selRout = routinesForDate(selected)

  return (
    <div className="cal-month-layout">

      <div className="cal-main">
        <CalNav onPrev={prev} onNext={next} label={`${MONTH_FULL[month]} ${year}`} />

        <div className="cal-grid">
          {DOW_SHORT.map(d => <div key={d} className="cal-dow">{d}</div>)}

          {cells.map(({ date, current }, i) => {
            const isToday    = date.toDateString() === today.toDateString()
            const isSelected = date.toDateString() === selected.toDateString()
            const dayRout    = routinesForDate(date)
            return (
              <div
                key={i}
                className={['cal-day', !current && 'cal-day-out', isToday && 'cal-day-today', isSelected && 'cal-day-selected'].filter(Boolean).join(' ')}
                onClick={() => setSelected(date)}
              >
                <span className="cal-day-num">{date.getDate()}</span>
                {dayRout.length > 0 && (
                  <div className="cal-day-pills">
                    {dayRout.slice(0, 2).map(r => (
                      <div key={r.id} className="cal-pill">
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

      {/* Detail panel */}
      <div className="cal-detail">
        <div className="cal-detail-date">
          {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {selected.toDateString() === today.toDateString() && (
            <span className="cal-today-tag">Today</span>
          )}
        </div>
        {selRout.length === 0 ? (
          <div className="cal-detail-empty">
            <span className="cal-empty-icon">🗓</span>
            <span>No routines scheduled</span>
          </div>
        ) : (
          <div className="cal-detail-list">
            {selRout.map(r => (
              <div key={r.id} className="cal-detail-item">
                <div className="cdi-emoji">{r.emoji}</div>
                <div className="cdi-info">
                  <div className="cdi-name">{r.name}</div>
                  <div className="cdi-meta">
                    {fmtTime(r.time)}
                    {r.steps?.length > 0 && <> · {r.steps.length} steps · {totalMins(r.steps)} min</>}
                  </div>
                  {r.type === 'trigger' && <span className="ec-trigger-tag">🕹️ Trigger</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── WEEK VIEW ────────────────────────────────────────────────
function WeekView({ today, selected, setSelected, routinesForDate }) {
  const [anchor, setAnchor] = useState(() => new Date(selected))
  const weekDays = getWeekDays(anchor)

  function prev() {
    const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d)
  }
  function next() {
    const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d)
  }

  return (
    <div className="cal-week-layout">
      <CalNav onPrev={prev} onNext={next} label={weekRangeLabel(weekDays)} />

      <div className="week-grid">
        {weekDays.map((date, i) => {
          const isToday    = date.toDateString() === today.toDateString()
          const isSelected = date.toDateString() === selected.toDateString()
          const dayRout    = routinesForDate(date)
          return (
            <div
              key={i}
              className={['week-col', isToday && 'week-col-today', isSelected && 'week-col-selected'].filter(Boolean).join(' ')}
              onClick={() => setSelected(date)}
            >
              <div className="week-col-head">
                <span className="week-col-dow">{DOW_SHORT[date.getDay()]}</span>
                <span className={`week-col-num${isToday ? ' today-bubble' : ''}`}>
                  {date.getDate()}
                </span>
              </div>

              <div className="week-col-body">
                {dayRout.length === 0
                  ? <div className="week-no-rout" />
                  : dayRout.map(r => (
                    <div key={r.id} className="week-event">
                      <span className="we-emoji">{r.emoji}</span>
                      <div className="we-body">
                        <div className="we-name">{r.name}</div>
                        {r.time && <div className="we-time">{fmtTime(r.time)}</div>}
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── DAY VIEW ─────────────────────────────────────────────────
function DayView({ today, selected, setSelected, routinesForDate }) {
  function prev() {
    const d = new Date(selected); d.setDate(d.getDate() - 1); setSelected(d)
  }
  function next() {
    const d = new Date(selected); d.setDate(d.getDate() + 1); setSelected(d)
  }

  const isToday  = selected.toDateString() === today.toDateString()
  const dayRout  = routinesForDate(selected)
  const timed    = dayRout.filter(r => r.time).sort((a, b) => a.time.localeCompare(b.time))
  const flexible = dayRout.filter(r => !r.time)

  const dateLabel = (
    <>
      {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      {isToday && <span className="cal-today-tag">Today</span>}
    </>
  )

  return (
    <div className="cal-day-layout">
      <CalNav onPrev={prev} onNext={next} label={dateLabel} />

      {dayRout.length === 0 ? (
        <div className="day-empty">
          <span>🗓</span>
          <span>No routines scheduled for this day</span>
        </div>
      ) : (
        <div className="day-timeline">

          {flexible.length > 0 && (
            <div className="day-block">
              <div className="day-block-time">Flexible</div>
              <div className="day-block-events">
                {flexible.map(r => <EventCard key={r.id} r={r} />)}
              </div>
            </div>
          )}

          {timed.map(r => (
            <div key={r.id} className="day-block">
              <div className="day-block-time">{fmtTime(r.time)}</div>
              <div className="day-block-events">
                <EventCard r={r} />
              </div>
            </div>
          ))}

        </div>
      )}
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────
export default function Calendar({ userId }) {
  const today = new Date()
  const [view,     setView]     = useState('month')
  const [selected, setSelected] = useState(today)
  const [routines, setRoutines] = useState([])
  const [loading,  setLoading]  = useState(!!userId)

  useEffect(() => {
    if (!userId) { setRoutines(SAMPLE_ROUTINES); return }
    setLoading(true)
    supabase
      .from('routines')
      .select('*')
      .eq('user_id', userId)
      .order('time', { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (!error) setRoutines(data || [])
        setLoading(false)
      })
  }, [userId])

  function routinesForDate(date) {
    const dow = DOW_KEYS[date.getDay()]
    return routines
      .filter(r => r.days?.includes(dow))
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
  }

  const VIEWS = ['Day', 'Week', 'Month']

  return (
    <div className="calendar-page">

      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">Your routines mapped across the week.</p>
        </div>
        <div className="cal-view-switcher">
          {VIEWS.map(v => (
            <button
              key={v}
              className={`cal-view-btn${view === v.toLowerCase() ? ' active' : ''}`}
              onClick={() => setView(v.toLowerCase())}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', fontSize:14 }}>
          Loading…
        </div>
      ) : view === 'month' ? (
        <MonthView today={today} selected={selected} setSelected={setSelected} routinesForDate={routinesForDate} />
      ) : view === 'week' ? (
        <WeekView  today={today} selected={selected} setSelected={setSelected} routinesForDate={routinesForDate} />
      ) : (
        <DayView   today={today} selected={selected} setSelected={setSelected} routinesForDate={routinesForDate} />
      )}

    </div>
  )
}
