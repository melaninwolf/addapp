import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { loadGIS, connectGoogle, silentReconnect, disconnectGoogle, fetchEvents, eventStartDate, eventTimeLabel, isConnected, getCachedToken } from '../googleCalendar'
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

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString()
}

// ─── Shared nav ──────────────────────────────────────────────
function CalNav({ onPrev, onNext, label }) {
  return (
    <div className="cal-nav">
      <button className="cal-nav-btn" onClick={onPrev}>‹</button>
      <span className="cal-period-label">{label}</span>
      <button className="cal-nav-btn" onClick={onNext}>›</button>
    </div>
  )
}

// ─── Routine card (used in Month detail + Week views) ────────
function RoutineCard({ r }) {
  return (
    <div className="event-card routine-card-cal">
      <div className="ec-emoji">{r.emoji}</div>
      <div className="ec-body">
        <div className="ec-name">{r.name}</div>
        <div className="ec-meta">
          {r.steps?.length > 0 && <>{r.steps.length} steps · {totalMins(r.steps)} min</>}
        </div>
        {r.type === 'trigger' && <span className="ec-trigger-tag">🕹️ Trigger</span>}
      </div>
    </div>
  )
}

// ─── Google Calendar event card (Month detail + Week) ────────
function GCalEventCard({ event }) {
  const timeLabel = eventTimeLabel(event)
  return (
    <div className="event-card gcal-card">
      <div className="ec-emoji gcal-icon">📅</div>
      <div className="ec-body">
        <div className="ec-name">{event.summary || '(No title)'}</div>
        <div className="ec-meta gcal-time">{timeLabel}</div>
      </div>
    </div>
  )
}

// ─── MONTH VIEW ───────────────────────────────────────────────
function MonthView({ today, selected, setSelected, routinesForDate, gcalEventsForDate }) {
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

  const cells    = getCalendarCells(year, month)
  const selRout  = routinesForDate(selected)
  const selGCal  = gcalEventsForDate(selected)

  return (
    <div className="cal-month-layout">
      <div className="cal-main">
        <CalNav onPrev={prev} onNext={next} label={`${MONTH_FULL[month]} ${year}`} />

        <div className="cal-grid">
          {DOW_SHORT.map(d => <div key={d} className="cal-dow">{d}</div>)}

          {cells.map(({ date, current }, i) => {
            const isToday    = isSameDay(date, today)
            const isSelected = isSameDay(date, selected)
            const dayRout    = routinesForDate(date)
            const dayGCal    = gcalEventsForDate(date)
            const totalItems = dayRout.length + dayGCal.length
            return (
              <div
                key={i}
                className={['cal-day', !current && 'cal-day-out', isToday && 'cal-day-today', isSelected && 'cal-day-selected'].filter(Boolean).join(' ')}
                onClick={() => setSelected(date)}
              >
                <span className="cal-day-num">{date.getDate()}</span>
                <div className="cal-day-pills">
                  {dayGCal.slice(0, 1).map(e => (
                    <div key={e.id} className="cal-pill cal-pill-gcal">
                      <span className="cal-pill-emoji">📅</span>
                      <span className="cal-pill-name">{e.summary || '(No title)'}</span>
                    </div>
                  ))}
                  {dayRout.slice(0, dayGCal.length > 0 ? 1 : 2).map(r => (
                    <div key={r.id} className="cal-pill">
                      <span className="cal-pill-emoji">{r.emoji}</span>
                      <span className="cal-pill-name">{r.name}</span>
                    </div>
                  ))}
                  {totalItems > 2 && (
                    <div className="cal-pill cal-pill-more">+{totalItems - 2} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="cal-detail">
        <div className="cal-detail-date">
          {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {isSameDay(selected, today) && <span className="cal-today-tag">Today</span>}
        </div>

        {selRout.length === 0 && selGCal.length === 0 ? (
          <div className="cal-detail-empty">
            <span className="cal-empty-icon">🗓</span>
            <span>Nothing scheduled</span>
          </div>
        ) : (
          <div className="cal-detail-list">
            {selGCal.map(e => (
              <div key={e.id} className="cal-detail-item gcal-detail-item">
                <div className="cdi-emoji gcal-cdi-icon">📅</div>
                <div className="cdi-info">
                  <div className="cdi-name">{e.summary || '(No title)'}</div>
                  <div className="cdi-meta gcal-time">{eventTimeLabel(e)}</div>
                </div>
              </div>
            ))}
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
function WeekView({ today, selected, setSelected, routinesForDate, gcalEventsForDate }) {
  const [anchor, setAnchor] = useState(() => new Date(selected))
  const weekDays = getWeekDays(anchor)

  function prev() { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d) }
  function next() { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d) }

  return (
    <div className="cal-week-layout">
      <CalNav onPrev={prev} onNext={next} label={weekRangeLabel(weekDays)} />

      <div className="week-grid">
        {weekDays.map((date, i) => {
          const isToday    = isSameDay(date, today)
          const isSelected = isSameDay(date, selected)
          const dayRout    = routinesForDate(date)
          const dayGCal    = gcalEventsForDate(date)
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
                {dayGCal.map(e => (
                  <div key={e.id} className="week-event week-event-gcal">
                    <span className="we-emoji">📅</span>
                    <div className="we-body">
                      <div className="we-name">{e.summary || '(No title)'}</div>
                      <div className="we-time gcal-time">{eventTimeLabel(e)}</div>
                    </div>
                  </div>
                ))}
                {dayRout.map(r => (
                  <div key={r.id} className="week-event">
                    <span className="we-emoji">{r.emoji}</span>
                    <div className="we-body">
                      <div className="we-name">{r.name}</div>
                      {r.time && <div className="we-time">{fmtTime(r.time)}</div>}
                    </div>
                  </div>
                ))}
                {dayRout.length === 0 && dayGCal.length === 0 && <div className="week-no-rout" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Overlap layout ───────────────────────────────────────────
// Groups overlapping events and assigns each a column index so
// they can be rendered side-by-side instead of on top of each other.
function layoutEvents(blocks) {
  if (!blocks.length) return []
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin)

  // Split into non-overlapping clusters
  const clusters = []
  let cluster = [sorted[0]]
  let clusterEnd = sorted[0].startMin + sorted[0].durMin

  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i]
    if (b.startMin < clusterEnd) {
      cluster.push(b)
      clusterEnd = Math.max(clusterEnd, b.startMin + b.durMin)
    } else {
      clusters.push(cluster)
      cluster = [b]
      clusterEnd = b.startMin + b.durMin
    }
  }
  clusters.push(cluster)

  const layoutMap = new Map()
  for (const grp of clusters) {
    const colEnds = []  // colEnds[i] = minute at which column i becomes free
    const assignments = []
    for (const b of grp) {
      let col = colEnds.findIndex(end => end <= b.startMin)
      if (col === -1) { col = colEnds.length; colEnds.push(0) }
      colEnds[col] = b.startMin + b.durMin
      assignments.push({ key: b.key, col })
    }
    const totalCols = colEnds.length
    for (const { key, col } of assignments) layoutMap.set(key, { col, totalCols })
  }

  return blocks.map(b => ({ ...b, ...layoutMap.get(b.key) }))
}

// ─── DAY VIEW (time-block grid) ───────────────────────────────
const PX_PER_HOUR = 64
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function hourLabel(h) {
  if (h === 0)  return '12 AM'
  if (h < 12)   return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function DayView({ today, selected, setSelected, routinesForDate, gcalEventsForDate }) {
  const [now, setNow] = useState(() => new Date())
  const scrollRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Scroll to 1 hour before now (today) or 7 AM (other days) on mount/date change
  useEffect(() => {
    if (!scrollRef.current) return
    const isToday = isSameDay(selected, today)
    const scrollHour = isToday ? Math.max(0, now.getHours() - 1) : 7
    scrollRef.current.scrollTop = scrollHour * PX_PER_HOUR
  }, [selected])

  function prev() { const d = new Date(selected); d.setDate(d.getDate() - 1); setSelected(d) }
  function next() { const d = new Date(selected); d.setDate(d.getDate() + 1); setSelected(d) }

  const isToday    = isSameDay(selected, today)
  const dayRout    = routinesForDate(selected)
  const dayGCal    = gcalEventsForDate(selected)
  const timedRout  = dayRout.filter(r => r.time)
  const flexRout   = dayRout.filter(r => !r.time)
  const timedGCal  = dayGCal.filter(e => e.start?.dateTime)
  const alldayGCal = dayGCal.filter(e => e.start?.date && !e.start?.dateTime)

  // Now-line position (pixels from midnight)
  const nowTop = (now.getHours() + now.getMinutes() / 60) * PX_PER_HOUR

  // Build positioned event blocks with overlap columns
  const rawBlocks = [
    ...timedRout.map(r => {
      const [h, m] = r.time.split(':').map(Number)
      const startMin = h * 60 + m
      const durMin = Math.max(30, totalMins(r.steps))
      return { type: 'routine', startMin, durMin, data: r, key: `r-${r.id}` }
    }),
    ...timedGCal.map(e => {
      const start   = new Date(e.start.dateTime)
      const end     = e.end?.dateTime ? new Date(e.end.dateTime) : new Date(start.getTime() + 60 * 60000)
      const startMin = start.getHours() * 60 + start.getMinutes()
      const durMin   = Math.max(30, Math.round((end - start) / 60000))
      return { type: 'gcal', startMin, durMin, data: e, key: `g-${e.id}` }
    }),
  ]
  const eventBlocks = layoutEvents(rawBlocks)

  const dateLabel = (
    <>
      {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      {isToday && <span className="cal-today-tag">Today</span>}
    </>
  )

  return (
    <div className="cal-day-layout">
      <CalNav onPrev={prev} onNext={next} label={dateLabel} />

      {/* All-day & flexible chips */}
      {(alldayGCal.length > 0 || flexRout.length > 0) && (
        <div className="day-header-section">
          {alldayGCal.length > 0 && (
            <div className="day-allday-row">
              <div className="day-time-col-label">All day</div>
              <div className="day-chips">
                {alldayGCal.map(e => (
                  <div key={e.id} className="day-chip day-chip-gcal">📅 {e.summary || '(No title)'}</div>
                ))}
              </div>
            </div>
          )}
          {flexRout.length > 0 && (
            <div className="day-allday-row">
              <div className="day-time-col-label">Flexible</div>
              <div className="day-chips">
                {flexRout.map(r => (
                  <div key={r.id} className="day-chip">{r.emoji} {r.name}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Time grid */}
      <div className="day-grid-scroll" ref={scrollRef}>
        <div className="day-grid" style={{ height: `${24 * PX_PER_HOUR}px` }}>

          {/* Hour rows */}
          {HOURS.map(h => (
            <div key={h} className="day-hour-row" style={{ top: h * PX_PER_HOUR }}>
              <div className="day-hour-label">{hourLabel(h)}</div>
              <div className="day-hour-line" />
            </div>
          ))}

          {/* Events */}
          <div className="day-events-col">
            {eventBlocks.map(block => {
              const top      = (block.startMin / 60) * PX_PER_HOUR
              const height   = Math.max(24, (block.durMin / 60) * PX_PER_HOUR - 2)
              const isShort  = height < 44
              const pct      = 100 / block.totalCols
              const colLeft  = `calc(${block.col * pct}% + 4px)`
              const colWidth = `calc(${pct}% - 8px)`
              return (
                <div
                  key={block.key}
                  className={`day-event-block${block.type === 'gcal' ? ' day-event-gcal' : ' day-event-routine'}`}
                  style={{ top, height, left: colLeft, width: colWidth, right: 'auto' }}
                >
                  {block.type === 'routine' ? (
                    <>
                      <span className="deb-emoji">{block.data.emoji}</span>
                      <div className="deb-body">
                        <div className="deb-name">{block.data.name}</div>
                        {!isShort && block.data.steps?.length > 0 && (
                          <div className="deb-meta">{block.data.steps.length} steps · {block.durMin} min</div>
                        )}
                        {!isShort && block.data.type === 'trigger' && (
                          <div className="deb-meta">🕹️ Trigger</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="deb-emoji">📅</span>
                      <div className="deb-body">
                        <div className="deb-name">{block.data.summary || '(No title)'}</div>
                        {!isShort && (
                          <div className="deb-meta gcal-time">{eventTimeLabel(block.data)}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}

            {/* Now line */}
            {isToday && (
              <div className="day-now-line" style={{ top: nowTop }}>
                <div className="day-now-dot" />
                <div className="day-now-track" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────
export default function Calendar({ userId }) {
  const today = new Date()
  const [view,        setView]        = useState('day')
  const [selected,    setSelected]    = useState(today)
  const [routines,    setRoutines]    = useState([])
  const [loading,     setLoading]     = useState(!!userId)

  // Google Calendar state
  const [gisReady,    setGisReady]    = useState(false)
  const [gcalToken,   setGcalToken]   = useState(() => getCachedToken())
  const [gcalEvents,  setGcalEvents]  = useState([])
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalError,   setGcalError]   = useState('')

  // Load GIS script on mount, then silently reconnect if previously connected
  useEffect(() => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID ||
        import.meta.env.VITE_GOOGLE_CLIENT_ID === 'PASTE_YOUR_CLIENT_ID_HERE') return

    loadGIS().then(() => {
      setGisReady(true)
      // If user has connected before, silently get a fresh token
      if (isConnected()) {
        silentReconnect(
          (token) => { setGcalToken(token); fetchGcalEvents(token) },
          ()      => { setGcalToken(null) } // silent fail — show connect button
        )
      }
    }).catch(() => {})
  }, [])

  // Load routines
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

  // Fetch Google Calendar events (~3 month window around today)
  const fetchGcalEvents = useCallback(async (token) => {
    setGcalLoading(true)
    setGcalError('')
    try {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end   = new Date(today.getFullYear(), today.getMonth() + 3, 0)
      const events = await fetchEvents(token, start, end)
      setGcalEvents(events)
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED') {
        setGcalToken(null)
        setGcalEvents([])
        setGcalError('Google Calendar session expired. Reconnect to refresh.')
      } else {
        setGcalError('Could not load Google Calendar events.')
      }
    } finally {
      setGcalLoading(false)
    }
  }, [])

  function connectGcal() {
    setGcalError('')
    connectGoogle(
      (token) => { setGcalToken(token); fetchGcalEvents(token) },
      (err)   => setGcalError(err)
    )
  }

  function disconnectGcal() {
    disconnectGoogle(gcalToken)
    setGcalToken(null)
    setGcalEvents([])
    setGcalError('')
  }

  function routinesForDate(date) {
    const dow = DOW_KEYS[date.getDay()]
    return routines
      .filter(r => r.days?.includes(dow))
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
  }

  function gcalEventsForDate(date) {
    return gcalEvents.filter(e => {
      const start = eventStartDate(e)
      return start && isSameDay(start, date)
    }).sort((a, b) => {
      const ta = a.start?.dateTime || a.start?.date || ''
      const tb = b.start?.dateTime || b.start?.date || ''
      return ta.localeCompare(tb)
    })
  }

  const VIEWS = ['Day', 'Week', 'Month']
  const gcalConnected = !!gcalToken

  return (
    <div className="calendar-page">

      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">Your routines and events in one place.</p>
        </div>
        <div className="cal-header-right">
          {/* Google Calendar connect/disconnect */}
          {gcalConnected ? (
            <button className="gcal-btn gcal-btn-connected" onClick={disconnectGcal}>
              <span className="gcal-dot connected" />
              Google Calendar
            </button>
          ) : (
            <button
              className="gcal-btn"
              onClick={connectGcal}
              disabled={gcalLoading || !gisReady}
              title={!gisReady ? 'Loading Google…' : 'Connect Google Calendar'}
            >
              {gcalLoading ? 'Connecting…' : '+ Google Calendar'}
            </button>
          )}

          {/* View switcher */}
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
      </div>

      {gcalError && (
        <div className="gcal-error">{gcalError}</div>
      )}

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', fontSize:14 }}>
          Loading…
        </div>
      ) : view === 'month' ? (
        <MonthView today={today} selected={selected} setSelected={setSelected}
          routinesForDate={routinesForDate} gcalEventsForDate={gcalEventsForDate} />
      ) : view === 'week' ? (
        <WeekView  today={today} selected={selected} setSelected={setSelected}
          routinesForDate={routinesForDate} gcalEventsForDate={gcalEventsForDate} />
      ) : (
        <DayView   today={today} selected={selected} setSelected={setSelected}
          routinesForDate={routinesForDate} gcalEventsForDate={gcalEventsForDate} />
      )}

    </div>
  )
}
