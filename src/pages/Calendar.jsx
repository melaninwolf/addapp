import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { loadGIS, connectGoogle, connectGoogleNative, silentReconnect, disconnectGoogle, fetchEvents, eventStartDate, eventTimeLabel, isConnected, getCachedToken, isNativeApp } from '../googleCalendar'
import EmojiPicker from '../components/EmojiPicker'
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

function minsToTime(totalMins) {
  const h = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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

// ─── Timezone & date helpers ──────────────────────────────────
function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function formatDateForInput(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateLocal(str) {
  if (!str) return null
  const [y, mo, d] = str.split('-').map(Number)
  return new Date(y, mo - 1, d)
}

// ─── Calendar event types ─────────────────────────────────────
const EVENT_TYPES = [
  { key: 'appointment', label: 'Appointment', emoji: '📅' },
  { key: 'task',        label: 'Task',        emoji: '✅' },
  { key: 'reminder',    label: 'Reminder',    emoji: '🔔' },
  { key: 'event',       label: 'Event',       emoji: '🎉' },
  { key: 'time_block',  label: 'Time Block',  emoji: '🧱', soon: true },
]

const REPEAT_OPTIONS = [
  { key: 'none',    label: 'No repeat' },
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly' },
]

const TYPE_BORDER = {
  appointment: 'var(--accent)',
  task:        'var(--green)',
  reminder:    'var(--amber)',
  event:       'var(--red)',
  time_block:  'var(--text2)',
}
const TYPE_BG = {
  appointment: 'var(--accent-glow)',
  task:        'var(--green-bg)',
  reminder:    'var(--amber-bg)',
  event:       'var(--red-bg)',
  time_block:  'var(--bg3)',
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

// ─── Google Calendar event card ───────────────────────────────
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
function MonthView({ today, selected, setSelected, routinesForDate, gcalEventsForDate, customEventsForDate, tasksForDate, onViewEvent, onEditLog }) {
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

  const cells      = getCalendarCells(year, month)
  const selRout    = routinesForDate(selected)
  const selGCal    = gcalEventsForDate(selected)
  const selCustom  = customEventsForDate(selected)
  const selTasks   = tasksForDate(selected)

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
            const dayCustom  = customEventsForDate(date)
            const dayTasks   = tasksForDate(date)
            const totalItems = dayRout.length + dayGCal.length + dayCustom.length + dayTasks.length
            return (
              <div
                key={i}
                className={['cal-day', !current && 'cal-day-out', isToday && 'cal-day-today', isSelected && 'cal-day-selected'].filter(Boolean).join(' ')}
                onClick={() => setSelected(date)}
              >
                <span className="cal-day-num">{date.getDate()}</span>
                <div className="cal-day-pills">
                  {[
                    ...dayCustom.slice(0,1).map(e => ({ key:`c${e.id}`, emoji: e.emoji, name: e.title, cls:'cal-pill-custom', bc: TYPE_BORDER[e.type] })),
                    ...dayTasks.slice(0,1).map(t  => ({ key:`t${t.id}`, emoji: '✅',   name: t.title,  cls:'cal-pill-custom', bc: t._catColor || 'var(--green)' })),
                    ...dayGCal.slice(0,1).map(e   => ({ key:`g${e.id}`, emoji: '📅',   name: e.summary || '(No title)', cls:'cal-pill-gcal' })),
                    ...dayRout.slice(0,1).map(r   => ({ key:`r${r.id}`, emoji: r.emoji, name: r.name, cls:'' })),
                  ].slice(0, 2).map(item => (
                    <div key={item.key} className={`cal-pill ${item.cls}`}
                      style={item.bc ? { borderLeft:`2px solid ${item.bc}` } : {}}>
                      <span className="cal-pill-emoji">{item.emoji}</span>
                      <span className="cal-pill-name">{item.name}</span>
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

        {selRout.length === 0 && selGCal.length === 0 && selCustom.length === 0 && selTasks.length === 0 ? (
          <div className="cal-detail-empty">
            <span className="cal-empty-icon">🗓</span>
            <span>Nothing scheduled</span>
          </div>
        ) : (
          <div className="cal-detail-list">
            {selCustom.map(e => (
              <div key={e.id} className="cal-detail-item cal-detail-item-click"
                style={{ borderLeft: `3px solid ${TYPE_BORDER[e.type] || 'var(--accent)'}` }}
                onClick={() => onViewEvent && onViewEvent(e)}>
                <div className="cdi-emoji" style={{ background: TYPE_BG[e.type] }}>{e.emoji}</div>
                <div className="cdi-info">
                  <div className="cdi-name">{e.title}</div>
                  <div className="cdi-meta">
                    {e.all_day ? 'All day' : [e.start_time && fmtTime(e.start_time), e.end_time && fmtTime(e.end_time)].filter(Boolean).join(' – ')}
                    {e.location && <> · 📍 {e.location}</>}
                  </div>
                  {e.repeat_type && e.repeat_type !== 'none' && <span className="ec-trigger-tag">🔁 {e.repeat_type}</span>}
                </div>
              </div>
            ))}
            {selTasks.map(t => (
              <div key={`task-${t.id}`} className="cal-detail-item"
                style={{ borderLeft: `3px solid ${t._catColor || 'var(--green)'}`, opacity: t._done ? 0.5 : 1 }}>
                <div className="cdi-emoji" style={{ background: t._catColor ? t._catColor + '20' : 'var(--green-bg)' }}>✅</div>
                <div className="cdi-info">
                  <div className="cdi-name" style={{ textDecoration: t._done ? 'line-through' : 'none' }}>{t.title}</div>
                  <div className="cdi-meta">{t.start_time ? fmtTime(t.start_time) : 'All day'}</div>
                </div>
              </div>
            ))}
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
                  <div className="cdi-name">
                    {r.name}
                    {r._logStatus && <span className="rout-done-tag">✓ done</span>}
                  </div>
                  <div className="cdi-meta">
                    {r._actualStart
                      ? <>{r._actualStart}{r._actualEnd ? ` – ${r._actualEnd}` : ''} <span className="rout-actual-tag">actual</span></>
                      : fmtTime(r.time)
                    }
                    {r.steps?.length > 0 && <> · {r.steps.length} steps · {totalMins(r.steps)} min</>}
                  </div>
                  {r.type === 'trigger' && <span className="ec-trigger-tag">🕹️ Trigger</span>}
                </div>
                {r._logId && (
                  <button className="cal-log-edit-btn" onClick={() => onEditLog && onEditLog(r)} title="Edit session times">✏️</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── WEEK VIEW ────────────────────────────────────────────────
// ─── Week-view time grid helpers ─────────────────────────────
const WV_START = 6    // 6 AM
const WV_END   = 22   // 10 PM
const WV_HOURS = WV_END - WV_START          // 16 visible hours
const WV_PX    = 56                          // px per hour

function timeStrToMins(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minsToTop(mins) {
  return ((mins / 60) - WV_START) * WV_PX
}

function minsToHeight(durationMins) {
  return Math.max(durationMins * (WV_PX / 60), 22)
}

function gcalTimeToMins(e) {
  if (!e.start?.dateTime) return null
  const d = new Date(e.start.dateTime)
  return d.getHours() * 60 + d.getMinutes()
}
function gcalDurationMins(e) {
  if (!e.start?.dateTime || !e.end?.dateTime) return 60
  return (new Date(e.end.dateTime) - new Date(e.start.dateTime)) / 60000
}

const WEEK_FILTERS = [
  { key: 'routines', label: 'Routines', emoji: '🔄' },
  { key: 'focus',    label: 'Focus',    emoji: '🎯' },
  { key: 'tasks',    label: 'Tasks',    emoji: '✅' },
  { key: 'events',   label: 'Events',   emoji: '📅' },
]

function WeekView({ today, selected, setSelected, routinesForDate, gcalEventsForDate, customEventsForDate, tasksForDate, onEditLog, onUpdateBlock }) {
  const [anchor,  setAnchor]  = useState(() => new Date(selected))
  const [filters, setFilters] = useState(new Set(['routines', 'focus', 'tasks', 'events']))
  const wvScrollRef = useRef(null)
  const wvGridRef   = useRef(null)
  const wvDragRef   = useRef(null)
  const [wvDragVis, setWvDragVis] = useState(null)
  const weekDays = getWeekDays(anchor)

  function prev() { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d) }
  function next() { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d) }

  function toggleFilter(key) {
    setFilters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Stats for today
  const todayRoutines = routinesForDate(today).length
  const todayTasks    = tasksForDate(today).length
  const todayEvents   = [...customEventsForDate(today), ...gcalEventsForDate(today)].length
  const totalItems    = todayRoutines + todayTasks + todayEvents

  const hours = Array.from({ length: WV_HOURS }, (_, i) => WV_START + i)

  // ── Week-view drag helpers ────────────────────────────────────────
  function getWvTarget(clientX, clientY) {
    const gridEl = wvGridRef.current
    if (!gridEl) return null
    const cols = gridEl.querySelectorAll('[data-wv-colidx]')
    let colIdx = -1; let timedRect = null
    for (const col of cols) {
      const r = col.getBoundingClientRect()
      if (clientX >= r.left && clientX < r.right) {
        colIdx = parseInt(col.dataset.wvColidx)
        const timedEl = col.querySelector('.wv-timed')
        if (timedEl) timedRect = timedEl.getBoundingClientRect()
        break
      }
    }
    if (colIdx === -1 || !timedRect) return null
    const relY    = clientY - timedRect.top
    const rawMins = WV_START * 60 + (relY / WV_PX) * 60
    const snapped = Math.round(rawMins / 15) * 15
    const clamped = Math.max(WV_START * 60, Math.min(WV_END * 60 - 30, snapped))
    return { colIdx, minutes: clamped }
  }

  function startWvBlockDrag(clientX, clientY, block, originalColIdx, isTouch, nativeEvent) {
    nativeEvent.stopPropagation()
    nativeEvent.preventDefault()

    const target    = getWvTarget(clientX, clientY)
    const offsetMin = target ? Math.max(0, target.minutes - block.startMin) : 0

    let dragBg, dragBorder
    if (block.type === 'routine') {
      dragBg = 'var(--accent-glow)'; dragBorder = 'var(--accent)'
    } else if (block.type === 'task') {
      const c = block.data._catColor
      dragBg = c ? `${c}18` : 'var(--green-bg)'; dragBorder = c || 'var(--green)'
    } else {
      dragBg = TYPE_BG[block.subtype] || 'var(--bg3)'
      dragBorder = TYPE_BORDER[block.subtype] || 'var(--accent)'
    }

    wvDragRef.current = {
      eventId:          block.data.id,
      blockType:        block.type,
      originalColIdx,
      originalStartMin: block.startMin,
      durMin:           block.durMin,
      offsetMin,
      currentColIdx:    originalColIdx,
      currentStartMin:  block.startMin,
      data:             block.data,
      subtype:          block.subtype,
      moved:            false,
    }
    setWvDragVis({
      eventId:   block.data.id,
      blockType: block.type,
      colIdx:    originalColIdx,
      startMin:  block.startMin,
      durMin:    block.durMin,
      emoji:     block.data.emoji || (block.type === 'task' ? '✅' : '📅'),
      title:     block.data.title || block.data.name || '',
      dragBg, dragBorder,
    })

    function onMove(ev) {
      const cx = isTouch ? ev.touches[0].clientX : ev.clientX
      const cy = isTouch ? ev.touches[0].clientY : ev.clientY
      const t  = getWvTarget(cx, cy)
      if (!t) return
      if (isTouch) ev.preventDefault()

      const d        = wvDragRef.current
      const rawSnap  = Math.round((t.minutes - d.offsetMin) / 15) * 15
      const clampMin = Math.max(WV_START * 60, Math.min(WV_END * 60 - d.durMin, rawSnap))

      if (Math.abs(clampMin - d.originalStartMin) > 5 || t.colIdx !== d.originalColIdx) d.moved = true
      d.currentStartMin = clampMin
      // Routines stay in original column (changing day would alter the weekly recurrence)
      d.currentColIdx = d.blockType === 'routine' ? d.originalColIdx : t.colIdx
      setWvDragVis(v => v ? { ...v, startMin: clampMin, colIdx: d.currentColIdx } : null)
    }

    function onUp() {
      const d = wvDragRef.current
      if (d?.moved) {
        const newTime   = minsToTime(d.currentStartMin)
        const targetDay = weekDays[d.currentColIdx]
        const payload   = {
          start_time: newTime,
          end_time:   minsToTime(d.currentStartMin + d.durMin),
          ...(d.blockType !== 'routine' && { new_date: formatDateForInput(targetDay) }),
        }
        onUpdateBlock && onUpdateBlock(d.blockType, d.eventId, payload)
      }
      wvDragRef.current = null
      setWvDragVis(null)
      if (isTouch) {
        document.removeEventListener('touchmove', onMove)
        document.removeEventListener('touchend', onUp)
      } else {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
    }

    if (isTouch) {
      document.addEventListener('touchmove', onMove, { passive: false })
      document.addEventListener('touchend', onUp)
    } else {
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }

  return (
    <div className="cal-week-layout">
      {/* Nav + filters bar */}
      <div className="wv-top-bar">
        <div className="wv-nav-row">
          <CalNav onPrev={prev} onNext={next} label={weekRangeLabel(weekDays)} />
          <div className="wv-stats">
            {totalItems > 0
              ? <span>{totalItems} items today · {todayRoutines} routine{todayRoutines !== 1 ? 's' : ''}</span>
              : <span className="wv-stats-empty">Nothing scheduled today</span>}
          </div>
        </div>
        <div className="wv-filter-pills">
          {WEEK_FILTERS.map(f => (
            <button
              key={f.key}
              className={`wv-pill${filters.has(f.key) ? ' wv-pill-on' : ''}`}
              onClick={() => toggleFilter(f.key)}
            >
              {f.emoji} {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time grid */}
      <div className="wv-scroll" ref={wvScrollRef}>
        <div className="wv-grid-wrap" ref={wvGridRef}>
          {/* Time gutter */}
          <div className="wv-gutter">
            {hours.map(h => (
              <div key={h} className="wv-hour-label">
                {h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((date, i) => {
            const isToday    = isSameDay(date, today)
            const isSelected = isSameDay(date, selected)
            const dayRout    = filters.has('routines') ? routinesForDate(date)    : []
            const dayGCal    = filters.has('events')   ? gcalEventsForDate(date)  : []
            const dayCustom  = filters.has('events')   ? customEventsForDate(date): []
            const dayTasks   = filters.has('tasks')    ? tasksForDate(date)       : []

            // Partition into timed vs all-day
            const timedRout   = dayRout.filter(r => r.time || r._actualStart)
            const timedCustom = dayCustom.filter(e => e.start_time)
            const timedGCal   = dayGCal.filter(e => e.start?.dateTime)
            const timedTasks  = dayTasks.filter(t => t.start_time)
            const allDayItems = [
              ...dayRout.filter(r => !r.time && !r._actualStart),
              ...dayCustom.filter(e => !e.start_time),
              ...dayGCal.filter(e => !e.start?.dateTime),
              ...dayTasks.filter(t => !t.start_time),
            ]

            return (
              <div
                key={i}
                data-wv-colidx={i}
                className={['wv-col', isToday && 'wv-col-today', isSelected && 'wv-col-selected'].filter(Boolean).join(' ')}
                onClick={() => setSelected(date)}
              >
                {/* Day header */}
                <div className="wv-col-head">
                  <span className="wv-col-dow">{DOW_SHORT[date.getDay()]}</span>
                  <span className={`wv-col-num${isToday ? ' wv-today-bubble' : ''}`}>
                    {date.getDate()}
                  </span>
                </div>

                {/* All-day area */}
                {allDayItems.length > 0 && (
                  <div className="wv-allday">
                    {allDayItems.slice(0, 2).map((item, j) => (
                      <div key={j} className="wv-allday-chip">
                        {item.emoji || (item.summary ? '📅' : '✅')} {item.name || item.title || item.summary || '—'}
                      </div>
                    ))}
                    {allDayItems.length > 2 && (
                      <div className="wv-allday-chip wv-allday-more">+{allDayItems.length - 2}</div>
                    )}
                  </div>
                )}

                {/* Timed grid */}
                <div className="wv-timed" style={{ height: WV_HOURS * WV_PX }}>
                  {/* Hour lines */}
                  {hours.map(h => (
                    <div key={h} className="wv-hour-line" style={{ top: (h - WV_START) * WV_PX }} />
                  ))}

                  {/* Current time indicator (today only) */}
                  {isToday && (() => {
                    const now = new Date()
                    const nowMins = now.getHours() * 60 + now.getMinutes()
                    const top = minsToTop(nowMins)
                    if (top >= 0 && top <= WV_HOURS * WV_PX) {
                      return (
                        <div className="wv-now-line" style={{ top }}>
                          <div className="wv-now-dot" />
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* Routine blocks */}
                  {timedRout.map(r => {
                    const startMins = timeStrToMins(r._actualStart || r.time)
                    if (startMins == null) return null
                    const dur = r._actualEnd
                      ? (timeStrToMins(r._actualEnd) - startMins)
                      : (r.steps?.reduce((a, s) => a + (s.dur || 0), 0) || 30)
                    const top = minsToTop(startMins)
                    if (top < -20 || top > WV_HOURS * WV_PX + 20) return null
                    const isWvDragging = wvDragVis?.eventId === r.id
                    return (
                      <div key={r.id}
                        className={`wv-block wv-block-routine ev-draggable${r._logStatus ? ' wv-done' : ''}${isWvDragging ? ' ev-dragging' : ''}`}
                        style={{ top, height: minsToHeight(dur), opacity: isWvDragging ? 0.3 : 1 }}
                        onMouseDown={ev => startWvBlockDrag(ev.clientX, ev.clientY, { type: 'routine', data: r, startMin: startMins, durMin: dur, subtype: null }, i, false, ev)}
                        onTouchStart={ev => startWvBlockDrag(ev.touches[0].clientX, ev.touches[0].clientY, { type: 'routine', data: r, startMin: startMins, durMin: dur, subtype: null }, i, true, ev)}
                        onClick={ev => ev.stopPropagation()}>
                        <span className="wvb-emoji">{r.emoji}</span>
                        <div className="wvb-body">
                          <div className="wvb-name">{r.name}</div>
                          {dur >= 30 && <div className="wvb-time">{r._actualStart || fmtTime(r.time)}</div>}
                        </div>
                        {r._logId && (
                          <button className="wvb-edit" onClick={ev => { ev.stopPropagation(); onEditLog && onEditLog(r) }}>✏️</button>
                        )}
                      </div>
                    )
                  })}

                  {/* Custom event blocks */}
                  {timedCustom.map(e => {
                    const startMins = timeStrToMins(e.start_time)
                    if (startMins == null) return null
                    const endMins = timeStrToMins(e.end_time)
                    const dur = endMins ? endMins - startMins : 60
                    const top = minsToTop(startMins)
                    if (top < -20 || top > WV_HOURS * WV_PX + 20) return null
                    const isWvDragging = wvDragVis?.eventId === e.id
                    return (
                      <div key={e.id}
                        className={`wv-block ev-draggable${isWvDragging ? ' ev-dragging' : ''}`}
                        style={{
                          top,
                          height: minsToHeight(dur),
                          borderLeft: `3px solid ${TYPE_BORDER[e.type] || 'var(--accent)'}`,
                          background: TYPE_BG[e.type] || 'var(--accent-glow)',
                          opacity: isWvDragging ? 0.3 : 1,
                        }}
                        onMouseDown={ev => startWvBlockDrag(ev.clientX, ev.clientY, { type: 'custom', data: e, startMin: startMins, durMin: dur, subtype: e.type }, i, false, ev)}
                        onTouchStart={ev => startWvBlockDrag(ev.touches[0].clientX, ev.touches[0].clientY, { type: 'custom', data: e, startMin: startMins, durMin: dur, subtype: e.type }, i, true, ev)}
                        onClick={ev => ev.stopPropagation()}>
                        <span className="wvb-emoji">{e.emoji}</span>
                        <div className="wvb-body">
                          <div className="wvb-name">{e.title}</div>
                          {dur >= 30 && <div className="wvb-time">{fmtTime(e.start_time)}</div>}
                        </div>
                      </div>
                    )
                  })}

                  {/* GCal event blocks */}
                  {timedGCal.map(e => {
                    const startMins = gcalTimeToMins(e)
                    if (startMins == null) return null
                    const dur = gcalDurationMins(e)
                    const top = minsToTop(startMins)
                    if (top < -20 || top > WV_HOURS * WV_PX + 20) return null
                    return (
                      <div key={e.id}
                        className="wv-block wv-block-gcal"
                        style={{ top, height: minsToHeight(dur) }}
                        onClick={ev => ev.stopPropagation()}>
                        <span className="wvb-emoji">📅</span>
                        <div className="wvb-body">
                          <div className="wvb-name">{e.summary || '(No title)'}</div>
                          {dur >= 30 && <div className="wvb-time">{eventTimeLabel(e)}</div>}
                        </div>
                      </div>
                    )
                  })}

                  {/* Task blocks */}
                  {timedTasks.map(t => {
                    const startMins = timeStrToMins(t.start_time)
                    if (startMins == null) return null
                    const top = minsToTop(startMins)
                    if (top < -20 || top > WV_HOURS * WV_PX + 20) return null
                    const isWvDragging = wvDragVis?.eventId === t.id
                    return (
                      <div key={t.id}
                        className={`wv-block wv-block-task ev-draggable${t._done ? ' wv-done' : ''}${isWvDragging ? ' ev-dragging' : ''}`}
                        style={{
                          top, height: minsToHeight(30),
                          borderLeft: `3px solid ${t._catColor || 'var(--green)'}`,
                          background: t._catColor ? `${t._catColor}18` : 'var(--green-bg)',
                          opacity: isWvDragging ? 0.3 : t._done ? 0.55 : 1,
                        }}
                        onMouseDown={ev => startWvBlockDrag(ev.clientX, ev.clientY, { type: 'task', data: t, startMin: startMins, durMin: 30, subtype: 'task' }, i, false, ev)}
                        onTouchStart={ev => startWvBlockDrag(ev.touches[0].clientX, ev.touches[0].clientY, { type: 'task', data: t, startMin: startMins, durMin: 30, subtype: 'task' }, i, true, ev)}
                        onClick={ev => ev.stopPropagation()}>
                        <span className="wvb-emoji">✅</span>
                        <div className="wvb-body">
                          <div className="wvb-name" style={{ textDecoration: t._done ? 'line-through' : 'none' }}>{t.title}</div>
                        </div>
                      </div>
                    )
                  })}
                  {/* Week-view drag ghost */}
                  {wvDragVis?.colIdx === i && (
                    <div className="wv-block ev-ghost"
                      style={{
                        top:             minsToTop(wvDragVis.startMin),
                        height:          minsToHeight(wvDragVis.durMin),
                        left: 4, right: 4,
                        background:      wvDragVis.dragBg,
                        borderColor:     wvDragVis.dragBorder,
                        borderLeftColor: wvDragVis.dragBorder,
                        pointerEvents:   'none',
                        zIndex:          10,
                      }}>
                      <span className="wvb-emoji">{wvDragVis.emoji}</span>
                      <div className="wvb-body">
                        <div className="wvb-name">{wvDragVis.title}</div>
                        <div className="wvb-time">{fmtTime(minsToTime(wvDragVis.startMin))}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Add / Edit Event Modal ───────────────────────────────────
function AddEventModal({ open, onClose, onSave, onDelete, defaultDate, initialEvent }) {
  const isEdit = !!initialEvent

  const [type,          setType]          = useState('appointment')
  const [title,         setTitle]         = useState('')
  const [emoji,         setEmoji]         = useState('📅')
  const [emojiTouched,  setEmojiTouched]  = useState(false)
  const [date,          setDate]          = useState('')
  const [endDate,       setEndDate]       = useState('')
  const [allDay,        setAllDay]        = useState(false)
  const [startTime,     setStartTime]     = useState('09:00')
  const [endTime,       setEndTime]       = useState('10:00')
  const [location,      setLocation]      = useState('')
  const [notes,         setNotes]         = useState('')
  const [repeatType,    setRepeatType]    = useState('none')
  const [repeatDays,    setRepeatDays]    = useState([])
  const [repeatEndDate, setRepeatEndDate] = useState('')
  const [saving,        setSaving]        = useState(false)

  // Initialise / reset when modal opens
  useEffect(() => {
    if (!open) return
    if (initialEvent) {
      setType(initialEvent.type || 'appointment')
      setTitle(initialEvent.title || '')
      setDate(initialEvent.date || formatDateForInput(new Date()))
      setEndDate(initialEvent.end_date || initialEvent.date || formatDateForInput(new Date()))
      setAllDay(initialEvent.all_day || false)
      setStartTime(initialEvent.start_time || '09:00')
      setEndTime(initialEvent.end_time || '10:00')
      setLocation(initialEvent.location || '')
      setNotes(initialEvent.notes || '')
      setRepeatType(initialEvent.repeat_type || 'none')
      setRepeatDays(initialEvent.repeat_days || [])
      setRepeatEndDate(initialEvent.repeat_end_date || '')
      setEmoji(initialEvent.emoji || EVENT_TYPES.find(t => t.key === initialEvent.type)?.emoji || '📌')
      setEmojiTouched(true)
    } else {
      const d = formatDateForInput(defaultDate || new Date())
      setDate(d); setEndDate(d)
      setTitle(''); setType('appointment'); setAllDay(false)
      setStartTime('09:00'); setEndTime('10:00')
      setLocation(''); setNotes('')
      setRepeatType('none'); setRepeatDays([]); setRepeatEndDate('')
      setEmoji(EVENT_TYPES[0].emoji); setEmojiTouched(false)
    }
  }, [open, initialEvent, defaultDate])

  // Auto-update emoji when type changes (unless user has manually picked one)
  useEffect(() => {
    if (!emojiTouched) {
      setEmoji(EVENT_TYPES.find(t => t.key === type)?.emoji || '📌')
    }
  }, [type]) // eslint-disable-line

  if (!open) return null

  function toggleDay(key) {
    setRepeatDays(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])
  }

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        type,
        title:           title.trim(),
        emoji,
        date,
        start_time:      allDay ? null : startTime || null,
        end_time:        allDay ? null : endTime   || null,
        end_date:        endDate && endDate !== date ? endDate : null,
        all_day:         allDay,
        location:        location.trim() || null,
        notes:           notes.trim()    || null,
        repeat_type:     repeatType,
        repeat_days:     repeatDays,
        repeat_end_date: repeatEndDate   || null,
        timezone:        getUserTimezone(),
      })
      onClose()
    } finally { setSaving(false) }
  }

  const showLocation = type === 'appointment' || type === 'event'
  const isComingSoon = type === 'time_block'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <span className="modal-title-text">{isEdit ? 'Edit event' : 'Add to calendar'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Type grid */}
        <div className="modal-type-grid">
          {EVENT_TYPES.map(t => (
            <button
              key={t.key}
              className={`modal-type-btn${type === t.key ? ' active' : ''}${t.soon ? ' soon' : ''}`}
              onClick={() => !t.soon && setType(t.key)}
            >
              <span className="mtb-emoji">{t.emoji}</span>
              <span className="mtb-label">{t.label}</span>
              {t.soon && <span className="mtb-soon">Soon</span>}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* Emoji + title */}
          <div className="modal-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label className="modal-label">Icon</label>
              <EmojiPicker
                value={emoji}
                onChange={v => { setEmoji(v); setEmojiTouched(true) }}
              />
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Title</label>
              <input
                className="modal-input modal-title-input"
                placeholder={`${EVENT_TYPES.find(t => t.key === type)?.label || 'Event'} title`}
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                autoFocus
              />
            </div>
          </div>

          {/* Date + all-day */}
          <div className="modal-row">
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Date</label>
              <input type="date" className="modal-input" value={date}
                onChange={e => setDate(e.target.value)} />
            </div>
            <button
              className={`modal-allday-btn${allDay ? ' on' : ''}`}
              onClick={() => setAllDay(v => !v)}
            >All day</button>
          </div>

          {/* Times + end date */}
          {!allDay && (
            <div className="modal-row">
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">Start</label>
                <input type="time" className="modal-input" value={startTime}
                  onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="modal-field" style={{ flex: 1.6 }}>
                <label className="modal-label">End</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="date" className="modal-input" value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    min={date} style={{ flex: 1 }} />
                  <input type="time" className="modal-input" value={endTime}
                    onChange={e => setEndTime(e.target.value)} style={{ flex: 1 }} />
                </div>
              </div>
            </div>
          )}

          {/* All-day end date */}
          {allDay && (
            <div className="modal-row">
              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label">End date</label>
                <input type="date" className="modal-input" value={endDate}
                  onChange={e => setEndDate(e.target.value)} min={date} />
              </div>
            </div>
          )}

          {/* Location */}
          {showLocation && (
            <input className="modal-input" placeholder="Location (optional)"
              value={location} onChange={e => setLocation(e.target.value)} />
          )}

          {/* Repeat */}
          <div className="modal-repeat-section">
            <div className="modal-label" style={{ marginBottom: 8 }}>🔁 Repeat</div>
            <div className="modal-repeat-opts">
              {REPEAT_OPTIONS.map(o => (
                <button key={o.key}
                  className={`modal-repeat-opt${repeatType === o.key ? ' active' : ''}`}
                  onClick={() => setRepeatType(o.key)}
                >{o.label}</button>
              ))}
            </div>

            {repeatType === 'weekly' && (
              <div className="modal-days-row">
                {DOW_SHORT.map((d, i) => {
                  const key = DOW_KEYS[i]
                  const on  = repeatDays.includes(key)
                  return (
                    <button key={key}
                      className={`modal-day-btn${on ? ' active' : ''}`}
                      onClick={() => toggleDay(key)}
                    >{d.slice(0,1)}</button>
                  )
                })}
              </div>
            )}

            {repeatType !== 'none' && (
              <div className="modal-field" style={{ marginTop: 10 }}>
                <label className="modal-label">Ends on (optional)</label>
                <input type="date" className="modal-input" style={{ maxWidth: 180 }}
                  value={repeatEndDate} onChange={e => setRepeatEndDate(e.target.value)} />
              </div>
            )}
          </div>

          {/* Notes */}
          <textarea className="modal-input modal-textarea"
            placeholder="Notes (optional)" rows={2}
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {isEdit && onDelete && (
            <button className="modal-btn modal-btn-delete" onClick={() => onDelete()}>
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn-save"
            onClick={handleSave}
            disabled={!title.trim() || saving || isComingSoon}
          >{saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Event Detail Popup ───────────────────────────────────────
function EventDetailModal({ event, onClose, onEdit, onDelete }) {
  if (!event) return null
  const typeInfo = EVENT_TYPES.find(t => t.key === event.type) || EVENT_TYPES[0]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet modal-sheet-detail" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="detail-emoji-bubble" style={{ background: TYPE_BG[event.type] }}>
              {event.emoji}
            </div>
            <div>
              <div className="modal-title-text" style={{ fontSize: 16 }}>{event.title}</div>
              <div className="detail-type-tag" style={{ borderColor: TYPE_BORDER[event.type], color: TYPE_BORDER[event.type] }}>
                {typeInfo.emoji} {typeInfo.label}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Date */}
          <div className="detail-row">
            <span className="detail-icon">📅</span>
            <div className="detail-val">
              {parseDateLocal(event.date)?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {event.end_date && event.end_date !== event.date && (
                <> → {parseDateLocal(event.end_date)?.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</>
              )}
            </div>
          </div>

          {/* Time */}
          {event.all_day ? (
            <div className="detail-row">
              <span className="detail-icon">⏰</span>
              <div className="detail-val">All day</div>
            </div>
          ) : (event.start_time || event.end_time) && (
            <div className="detail-row">
              <span className="detail-icon">⏰</span>
              <div className="detail-val">
                {[event.start_time && fmtTime(event.start_time), event.end_time && fmtTime(event.end_time)].filter(Boolean).join(' → ')}
              </div>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <div className="detail-row">
              <span className="detail-icon">📍</span>
              <div className="detail-val">{event.location}</div>
            </div>
          )}

          {/* Repeat */}
          {event.repeat_type && event.repeat_type !== 'none' && (
            <div className="detail-row">
              <span className="detail-icon">🔁</span>
              <div className="detail-val">
                Repeats {event.repeat_type}
                {event.repeat_end_date && ` until ${parseDateLocal(event.repeat_end_date)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </div>
            </div>
          )}

          {/* Notes */}
          {event.notes && (
            <div className="detail-row">
              <span className="detail-icon">📝</span>
              <div className="detail-val detail-notes">{event.notes}</div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn modal-btn-delete" onClick={() => onDelete(event.id)}>
            Delete
          </button>
          <div style={{ flex: 1 }} />
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Close</button>
          <button className="modal-btn modal-btn-save" onClick={() => onEdit(event)}>Edit</button>
        </div>
      </div>
    </div>
  )
}

// ─── Overlap layout ───────────────────────────────────────────
function layoutEvents(blocks) {
  if (!blocks.length) return []
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin)

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
    const colEnds = []
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

function DayView({ today, selected, setSelected, routinesForDate, gcalEventsForDate, customEventsForDate, tasksForDate, onUpdateBlock, onViewEvent, onEditLog }) {
  const [now, setNow] = useState(() => new Date())
  const scrollRef = useRef(null)
  const dragRef   = useRef(null)
  const [dragVis, setDragVis] = useState(null) // { eventId, startMin, durMin, emoji, title, subtype }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!scrollRef.current) return
    const isToday = isSameDay(selected, today)
    const scrollHour = isToday ? Math.max(0, now.getHours() - 1) : 7
    scrollRef.current.scrollTop = scrollHour * PX_PER_HOUR
  }, [selected]) // eslint-disable-line

  function prev() { const d = new Date(selected); d.setDate(d.getDate() - 1); setSelected(d) }
  function next() { const d = new Date(selected); d.setDate(d.getDate() + 1); setSelected(d) }

  const isToday      = isSameDay(selected, today)
  const nowMin       = isToday ? (now.getHours() * 60 + now.getMinutes()) : -1
  const dayRout      = routinesForDate(selected)
  const dayGCal      = gcalEventsForDate(selected)
  const dayCustom    = customEventsForDate(selected)
  const timedRout    = dayRout.filter(r => r.time)
  const flexRout     = dayRout.filter(r => !r.time)
  const timedGCal    = dayGCal.filter(e => e.start?.dateTime)
  const alldayGCal   = dayGCal.filter(e => e.start?.date && !e.start?.dateTime)
  const timedCustom  = dayCustom.filter(e => !e.all_day && e.start_time)
  const alldayCustom = dayCustom.filter(e => e.all_day || !e.start_time)
  const dayTasks     = tasksForDate(selected)
  const timedTasks   = dayTasks.filter(t => t.start_time)
  const alldayTasks  = dayTasks.filter(t => !t.start_time)

  const nowTop = (now.getHours() + now.getMinutes() / 60) * PX_PER_HOUR

  const rawBlocks = [
    ...timedRout.map(r => {
      // Use actual logged start time if available, else fall back to scheduled time
      const timeStr  = r._actualStart || r.time
      const [h, m]   = timeStr.split(':').map(Number)
      const startMin = h * 60 + m
      // Use actual duration if end time logged, else estimate from steps
      let durMin = Math.max(30, totalMins(r.steps))
      if (r._actualStart && r._actualEnd) {
        const [eh, em] = r._actualEnd.split(':').map(Number)
        durMin = Math.max(30, (eh * 60 + em) - startMin)
      }
      return { type: 'routine', startMin, durMin, data: r, key: `r-${r.id}` }
    }),
    ...timedGCal.map(e => {
      const start   = new Date(e.start.dateTime)
      const end     = e.end?.dateTime ? new Date(e.end.dateTime) : new Date(start.getTime() + 60 * 60000)
      const startMin = start.getHours() * 60 + start.getMinutes()
      const durMin   = Math.max(30, Math.round((end - start) / 60000))
      return { type: 'gcal', startMin, durMin, data: e, key: `g-${e.id}` }
    }),
    ...timedCustom.map(e => {
      const [h, m]   = e.start_time.split(':').map(Number)
      const startMin = h * 60 + m
      let durMin = 60
      if (e.end_time) {
        const [eh, em] = e.end_time.split(':').map(Number)
        durMin = Math.max(30, (eh * 60 + em) - startMin)
      }
      return { type: 'custom', subtype: e.type, startMin, durMin, data: e, key: `c-${e.id}` }
    }),
    ...timedTasks.map(t => {
      const [h, m] = t.start_time.split(':').map(Number)
      const startMin = h * 60 + m
      return { type: 'task', subtype: 'task', startMin, durMin: 60, data: t, key: `t-${t.id}` }
    }),
  ]
  const eventBlocks = layoutEvents(rawBlocks)

  // ── Drag handlers (mouse + touch, all non-gcal block types) ──────────
  function startBlockDrag(clientY, block, isTouch, nativeEvent) {
    if (block.type === 'gcal') return
    nativeEvent.preventDefault()
    nativeEvent.stopPropagation()

    const scrollEl  = scrollRef.current
    const gridRect  = scrollEl.getBoundingClientRect()
    const scrollTop = scrollEl.scrollTop
    const yInGrid   = clientY - gridRect.top + scrollTop
    const offsetMin = Math.max(0, (yInGrid / PX_PER_HOUR) * 60 - block.startMin)

    let dragBg, dragBorder
    if (block.type === 'routine') {
      dragBg = 'var(--accent-glow)'; dragBorder = 'var(--accent)'
    } else if (block.type === 'task') {
      const c = block.data._catColor
      dragBg = c ? `${c}18` : 'var(--green-bg)'; dragBorder = c || 'var(--green)'
    } else {
      dragBg = TYPE_BG[block.subtype] || 'var(--bg3)'
      dragBorder = TYPE_BORDER[block.subtype] || 'var(--accent)'
    }

    dragRef.current = {
      eventId:          block.data.id,
      blockType:        block.type,
      durMin:           block.durMin,
      originalStartMin: block.startMin,
      offsetMin,
      currentStartMin:  block.startMin,
      data:             block.data,
      subtype:          block.subtype,
      moved:            false,
    }
    setDragVis({
      eventId:   block.data.id,
      blockType: block.type,
      startMin:  block.startMin,
      durMin:    block.durMin,
      emoji:     block.data.emoji || (block.type === 'task' ? '✅' : '📅'),
      title:     block.data.title || block.data.name || '',
      subtype:   block.subtype,
      dragBg, dragBorder,
    })

    function onMove(ev) {
      const y    = isTouch ? ev.touches[0].clientY : ev.clientY
      const rect = scrollEl.getBoundingClientRect()
      const sTop = scrollEl.scrollTop
      const yVal = y - rect.top + sTop
      const raw  = (yVal / PX_PER_HOUR) * 60 - dragRef.current.offsetMin
      const snap = Math.round(raw / 15) * 15
      const clamp = Math.max(0, Math.min(1440 - dragRef.current.durMin, snap))
      if (Math.abs(clamp - dragRef.current.originalStartMin) > 5) dragRef.current.moved = true
      dragRef.current.currentStartMin = clamp
      setDragVis(v => v ? { ...v, startMin: clamp } : null)
      if (isTouch) ev.preventDefault()
    }

    function onUp() {
      const d = dragRef.current
      if (d) {
        if (!d.moved && d.blockType === 'custom') {
          onViewEvent && onViewEvent(d.data)
        } else if (d.moved && d.currentStartMin !== d.originalStartMin) {
          onUpdateBlock && onUpdateBlock(d.blockType, d.eventId, {
            start_time: minsToTime(d.currentStartMin),
            end_time:   minsToTime(d.currentStartMin + d.durMin),
          })
        }
      }
      dragRef.current = null
      setDragVis(null)
      if (isTouch) {
        document.removeEventListener('touchmove', onMove)
        document.removeEventListener('touchend', onUp)
      } else {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
    }

    if (isTouch) {
      document.addEventListener('touchmove', onMove, { passive: false })
      document.addEventListener('touchend', onUp)
    } else {
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
  }

  const dateLabel = (
    <>
      {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      {isToday && <span className="cal-today-tag">Today</span>}
    </>
  )

  return (
    <div className="cal-day-layout">
      <CalNav onPrev={prev} onNext={next} label={dateLabel} />

      {/* All-day / flexible chips */}
      {(alldayGCal.length > 0 || flexRout.length > 0 || alldayCustom.length > 0 || alldayTasks.length > 0) && (
        <div className="day-header-section">
          {(alldayCustom.length > 0 || alldayTasks.length > 0) && (
            <div className="day-allday-row">
              <div className="day-time-col-label">All day</div>
              <div className="day-chips">
                {alldayCustom.map(e => (
                  <div key={e.id} className="day-chip"
                    style={{ background: TYPE_BG[e.type], borderColor: TYPE_BORDER[e.type], color: TYPE_BORDER[e.type], cursor: 'pointer' }}
                    onClick={() => onViewEvent && onViewEvent(e)}>
                    {e.emoji} {e.title}
                  </div>
                ))}
                {alldayTasks.map(t => (
                  <div key={`task-${t.id}`} className="day-chip"
                    style={{
                      background:  t._catColor ? t._catColor + '18' : 'var(--green-bg)',
                      borderColor: t._catColor || 'var(--green)',
                      color:       t._catColor || 'var(--green)',
                      opacity:     t._done ? 0.5 : 1,
                      textDecoration: t._done ? 'line-through' : 'none',
                    }}>
                    ✅ {t.title}
                  </div>
                ))}
              </div>
            </div>
          )}
          {alldayGCal.length > 0 && (
            <div className="day-allday-row">
              <div className="day-time-col-label">{alldayCustom.length === 0 ? 'All day' : ''}</div>
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

          {HOURS.map(h => (
            <div key={h} className="day-hour-row" style={{ top: h * PX_PER_HOUR }}>
              <div className="day-hour-label">{hourLabel(h)}</div>
              <div className="day-hour-line" />
            </div>
          ))}

          <div className="day-events-col">
            {eventBlocks.map(block => {
              const top      = (block.startMin / 60) * PX_PER_HOUR
              const height   = Math.max(24, (block.durMin / 60) * PX_PER_HOUR - 2)
              const isShort  = height < 44
              const pct      = 100 / block.totalCols
              const colLeft  = `calc(${block.col * pct}% + 4px)`
              const colWidth = `calc(${pct}% - 8px)`

              // Past / missed state
              const blockEnd = block.startMin + block.durMin
              const isPast   = nowMin >= 0 && blockEnd <= nowMin
              const isMissed = isPast && (block.type === 'routine' || (block.type === 'custom' && block.subtype === 'task'))
              const pastCls  = isMissed ? ' ev-missed' : isPast ? ' ev-past' : ''

              // Whether this block is being dragged
              const isDragging = dragVis?.eventId === block.data?.id && block.type !== 'gcal'

              // Per-type style overrides
              const taskColor   = block.type === 'task' ? block.data._catColor : null
              const customStyle = (block.type === 'custom' && !isMissed) ? {
                background:      TYPE_BG[block.subtype]     || 'var(--bg3)',
                borderColor:     TYPE_BORDER[block.subtype] || 'var(--accent)',
                borderLeftColor: TYPE_BORDER[block.subtype] || 'var(--accent)',
              } : block.type === 'task' ? {
                background:      taskColor ? `${taskColor}18` : 'var(--green-bg)',
                borderColor:     taskColor || 'var(--green)',
                borderLeftColor: taskColor || 'var(--green)',
                opacity:         block.data._done ? 0.5 : 1,
              } : {}

              return (
                <div
                  key={block.key}
                  className={[
                    'day-event-block',
                    block.type === 'gcal'   ? 'day-event-gcal'   :
                    block.type === 'custom' ? 'day-event-custom' :
                    block.type === 'task'   ? 'day-event-custom' : 'day-event-routine',
                    pastCls,
                    isDragging ? 'ev-dragging' : '',
                    block.type !== 'gcal' ? 'ev-draggable' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ top, height, left: colLeft, width: colWidth, right: 'auto', ...customStyle }}
                  onMouseDown={block.type !== 'gcal' ? e => startBlockDrag(e.clientY, block, false, e) : undefined}
                  onTouchStart={block.type !== 'gcal' ? e => startBlockDrag(e.touches[0].clientY, block, true, e) : undefined}
                  onClick={block.type === 'gcal' ? () => onViewEvent && onViewEvent(block.data) : undefined}
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
                      {block.data._logId && (
                        <button className="cal-log-edit-btn" onClick={e => { e.stopPropagation(); onEditLog && onEditLog(block.data) }} title="Edit session times">✏️</button>
                      )}
                    </>
                  ) : block.type === 'gcal' ? (
                    <>
                      <span className="deb-emoji">📅</span>
                      <div className="deb-body">
                        <div className="deb-name">{block.data.summary || '(No title)'}</div>
                        {!isShort && (
                          <div className="deb-meta gcal-time">{eventTimeLabel(block.data)}</div>
                        )}
                      </div>
                    </>
                  ) : block.type === 'task' ? (
                    <>
                      <span className="deb-emoji">✅</span>
                      <div className="deb-body">
                        <div className="deb-name" style={{ textDecoration: block.data._done ? 'line-through' : 'none' }}>{block.data.title}</div>
                        {!isShort && block.data.start_time && (
                          <div className="deb-meta">{fmtTime(block.data.start_time)}</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="deb-emoji">{block.data.emoji}</span>
                      <div className="deb-body">
                        <div className="deb-name">{block.data.title}</div>
                        {!isShort && block.data.location && (
                          <div className="deb-meta">📍 {block.data.location}</div>
                        )}
                        {!isShort && block.data.notes && (
                          <div className="deb-meta">{block.data.notes}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}

            {/* Drag ghost */}
            {dragVis && (
              <div
                className="day-event-block day-event-custom ev-ghost"
                style={{
                  top:             (dragVis.startMin / 60) * PX_PER_HOUR,
                  height:          Math.max(24, (dragVis.durMin / 60) * PX_PER_HOUR - 2),
                  left: 6, right: 6,
                  background:      dragVis.dragBg,
                  borderColor:     dragVis.dragBorder,
                  borderLeftColor: dragVis.dragBorder,
                  pointerEvents:   'none',
                }}
              >
                <span className="deb-emoji">{dragVis.emoji}</span>
                <div className="deb-body">
                  <div className="deb-name">{dragVis.title}</div>
                  <div className="deb-meta">{fmtTime(minsToTime(dragVis.startMin))}</div>
                </div>
              </div>
            )}

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
  const [view,           setView]          = useState('day')
  const [selected,       setSelected]      = useState(today)
  const [routines,       setRoutines]      = useState([])
  const [loading,        setLoading]       = useState(!!userId)
  const [calEvents,      setCalEvents]     = useState([])
  const [showAddModal,   setShowAddModal]  = useState(false)
  const [viewingEvent,   setViewingEvent]  = useState(null)
  const [editingEvent,   setEditingEvent]  = useState(null)
  const [tasks,          setTasks]          = useState([])
  const [taskCategories, setTaskCategories] = useState([])
  const [routineLogs,    setRoutineLogs]    = useState([])
  const [editLogModal,   setEditLogModal]   = useState(null) // null | { logId, name, emoji }
  const [editLogStart,   setEditLogStart]   = useState('')
  const [editLogEnd,     setEditLogEnd]     = useState('')

  // Google Calendar state
  const [gisReady,    setGisReady]    = useState(false)
  const [gcalToken,   setGcalToken]   = useState(() => getCachedToken())
  const [gcalEvents,  setGcalEvents]  = useState([])
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalError,   setGcalError]   = useState('')

  useEffect(() => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID ||
        import.meta.env.VITE_GOOGLE_CLIENT_ID === 'PASTE_YOUR_CLIENT_ID_HERE') return

    loadGIS().then(() => {
      setGisReady(true)
      if (isConnected()) {
        silentReconnect(
          (token) => { setGcalToken(token); fetchGcalEvents(token) },
          ()      => { setGcalToken(null) }
        )
      }
    }).catch(() => {})
  }, [])

  // Load calendar events from Supabase
  useEffect(() => {
    if (!userId) return
    supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .then(({ data, error }) => { if (!error && data) setCalEvents(data) })
  }, [userId])

  // Load tasks with due dates + their categories
  useEffect(() => {
    if (!userId) return
    Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId).not('due_date', 'is', null),
      supabase.from('task_categories').select('*').eq('user_id', userId),
    ]).then(([taskRes, catRes]) => {
      setTasks(taskRes.data || [])
      setTaskCategories(catRes.data || [])
    })
  }, [userId])

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

  // Load routine logs (rolling 60-day window) so calendar can show actual times
  useEffect(() => {
    if (!userId) return
    const from = new Date(); from.setDate(from.getDate() - 60)
    supabase.from('routine_logs')
      .select('id, routine_id, started_at, ended_at, status')
      .eq('user_id', userId)
      .gte('started_at', from.toISOString())
      .in('status', ['completed', 'marked_done'])
      .then(({ data }) => setRoutineLogs(data || []))
  }, [userId])

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
        setGcalToken(null); setGcalEvents([])
        setGcalError('Google Calendar session expired. Reconnect to refresh.')
      } else {
        setGcalError('Could not load Google Calendar events.')
      }
    } finally { setGcalLoading(false) }
  }, [])

  function connectGcal() {
    setGcalError('')
    const onToken = (token) => { setGcalToken(token); fetchGcalEvents(token) }
    const onError = (err)   => setGcalError(String(err))
    if (isNativeApp()) {
      connectGoogleNative(onToken, onError)
    } else {
      connectGoogle(onToken, onError)
    }
  }

  function disconnectGcal() {
    disconnectGoogle(gcalToken)
    setGcalToken(null); setGcalEvents([]); setGcalError('')
  }

  function routinesForDate(date) {
    const dow     = DOW_KEYS[date.getDay()]
    const dateStr = formatDateForInput(date)
    return routines
      .filter(r => r.days?.includes(dow))
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
      .map(r => {
        const log = routineLogs.find(l =>
          l.routine_id === r.id && l.started_at?.startsWith(dateStr)
        )
        if (!log) return r
        const toHHMM = ts => {
          const d = new Date(ts)
          return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
        }
        return {
          ...r,
          _logId:       log.id,
          _actualStart: toHHMM(log.started_at),
          _actualEnd:   log.ended_at ? toHHMM(log.ended_at) : null,
          _logStatus:   log.status,
        }
      })
  }

  function openCalEditLog(r) {
    if (!r._logId) return
    setEditLogStart(r._actualStart || '')
    setEditLogEnd(r._actualEnd || '')
    setEditLogModal({ logId: r._logId, name: r.name, emoji: r.emoji })
  }

  async function saveCalEditLog() {
    if (!editLogModal) return
    const toISO = (hhmm, refDate) => {
      if (!hhmm) return null
      const [h, m] = hhmm.split(':').map(Number)
      const d = new Date(refDate); d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    const ref = selected
    const updates = {
      started_at: toISO(editLogStart, ref),
      ended_at:   toISO(editLogEnd, ref) || null,
    }
    await supabase.from('routine_logs').update(updates).eq('id', editLogModal.logId)
    setRoutineLogs(prev => prev.map(l =>
      l.id === editLogModal.logId ? { ...l, ...updates } : l
    ))
    setEditLogModal(null)
  }

  function customEventsForDate(date) {
    const normDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    return calEvents.filter(e => {
      const eventDate = parseDateLocal(e.date)
      if (!eventDate) return false
      if (!e.repeat_type || e.repeat_type === 'none') {
        const endDateVal = e.end_date ? parseDateLocal(e.end_date) : eventDate
        return normDate >= eventDate && normDate <= endDateVal
      }
      if (date < eventDate) return false
      if (e.repeat_end_date) {
        const endDate = parseDateLocal(e.repeat_end_date)
        if (endDate && date > endDate) return false
      }
      const dow = DOW_KEYS[date.getDay()]
      switch (e.repeat_type) {
        case 'daily':   return true
        case 'weekly':
          return e.repeat_days?.length > 0
            ? e.repeat_days.includes(dow)
            : date.getDay() === eventDate.getDay()
        case 'monthly': return date.getDate() === eventDate.getDate()
        case 'yearly':  return date.getDate() === eventDate.getDate() &&
                               date.getMonth() === eventDate.getMonth()
        default:        return false
      }
    })
  }

  function tasksForDate(date) {
    const dateStr = formatDateForInput(date)
    return tasks
      .filter(t => t.due_date === dateStr)
      .map(t => {
        const cat = taskCategories.find(c => c.id === t.category_id)
        return {
          id:         t.id,
          _isTask:    true,
          type:       'task',
          emoji:      '✅',
          title:      t.title,
          start_time: t.due_time || null,
          all_day:    !t.due_time,
          _catColor:  cat?.color || null,
          _done:      t.status === 'done',
        }
      })
  }

  // ── CRUD ─────────────────────────────────────────────────────
  async function saveCalendarEvent(payload) {
    if (!userId) return
    const { data, error } = await supabase
      .from('calendar_events')
      .insert([{ ...payload, user_id: userId }])
      .select()
    if (!error && data) setCalEvents(prev => [...prev, ...data])
  }

  async function updateCalendarEvent(id, payload) {
    if (!userId) return
    const { data, error } = await supabase
      .from('calendar_events')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
    if (!error && data) {
      setCalEvents(prev => prev.map(e => e.id === id ? { ...e, ...data[0] } : e))
    }
  }

  // ── Unified block update: routes to the right table by type ──────────
  async function updateBlock(type, id, payload) {
    if (!userId) return
    if (type === 'custom') {
      const update = { start_time: payload.start_time, end_time: payload.end_time }
      if (payload.new_date) { update.date = payload.new_date; update.end_date = payload.new_date }
      return updateCalendarEvent(id, update)
    }
    if (type === 'routine') {
      const { error } = await supabase.from('routines')
        .update({ time: payload.start_time })
        .eq('id', id).eq('user_id', userId)
      if (!error) setRoutines(prev => prev.map(r => r.id === id ? { ...r, time: payload.start_time } : r))
    }
    if (type === 'task') {
      const update = { due_time: payload.start_time }
      if (payload.new_date) update.due_date = payload.new_date
      const { error } = await supabase.from('tasks')
        .update(update).eq('id', id).eq('user_id', userId)
      if (!error) setTasks(prev => prev.map(t => t.id === id ? { ...t, ...update } : t))
    }
  }

  async function deleteCalendarEvent(id) {
    if (!userId) return
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (!error) {
      setCalEvents(prev => prev.filter(e => e.id !== id))
      setViewingEvent(null)
      setEditingEvent(null)
    }
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

  function handleViewEvent(eventOrRoutine) {
    if (eventOrRoutine.title !== undefined) {
      setViewingEvent(eventOrRoutine)
    }
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
          <button className="cal-add-btn" onClick={() => setShowAddModal(true)}>+ Add</button>

          {gcalConnected ? (
            <button className="gcal-btn gcal-btn-connected" onClick={disconnectGcal}>
              <span className="gcal-dot connected" />
              Google Calendar
            </button>
          ) : (
            <button className="gcal-btn" onClick={connectGcal}
              disabled={gcalLoading || !gisReady}
              title={!gisReady ? 'Loading Google...' : 'Connect Google Calendar'}>
              {gcalLoading ? 'Connecting...' : '+ Google Calendar'}
            </button>
          )}

          <div className="cal-view-switcher">
            {VIEWS.map(v => (
              <button key={v}
                className={'cal-view-btn' + (view === v.toLowerCase() ? ' active' : '')}
                onClick={() => setView(v.toLowerCase())}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {gcalError && <div className="gcal-error">{gcalError}</div>}

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', fontSize:14 }}>
          Loading...
        </div>
      ) : view === 'month' ? (
        <MonthView today={today} selected={selected} setSelected={setSelected}
          routinesForDate={routinesForDate} gcalEventsForDate={gcalEventsForDate}
          customEventsForDate={customEventsForDate} tasksForDate={tasksForDate}
          onViewEvent={handleViewEvent} onEditLog={openCalEditLog} />
      ) : view === 'week' ? (
        <WeekView  today={today} selected={selected} setSelected={setSelected}
          routinesForDate={routinesForDate} gcalEventsForDate={gcalEventsForDate}
          customEventsForDate={customEventsForDate} tasksForDate={tasksForDate}
          onEditLog={openCalEditLog} onUpdateBlock={updateBlock} />
      ) : (
        <DayView   today={today} selected={selected} setSelected={setSelected}
          routinesForDate={routinesForDate} gcalEventsForDate={gcalEventsForDate}
          customEventsForDate={customEventsForDate} tasksForDate={tasksForDate}
          onUpdateBlock={updateBlock}
          onViewEvent={handleViewEvent} onEditLog={openCalEditLog} />
      )}

      {/* Add modal */}
      <AddEventModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={saveCalendarEvent}
        defaultDate={selected}
      />

      {/* Detail popup */}
      <EventDetailModal
        event={viewingEvent}
        onClose={() => setViewingEvent(null)}
        onEdit={e => { setViewingEvent(null); setEditingEvent(e) }}
        onDelete={deleteCalendarEvent}
      />

      {/* Edit modal */}
      <AddEventModal
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={payload => updateCalendarEvent(editingEvent.id, payload)}
        onDelete={() => deleteCalendarEvent(editingEvent.id)}
        initialEvent={editingEvent}
      />

      {/* Edit routine log times modal */}
      {editLogModal && (
        <div className="modal-overlay" onClick={() => setEditLogModal(null)}>
          <div className="modal" style={{maxWidth: 360}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Edit session times</h2>
              <button className="modal-close" onClick={() => setEditLogModal(null)}>x</button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13, color:'var(--text2)', marginBottom:'1.25rem', lineHeight:1.5}}>
                {editLogModal.emoji} <strong>{editLogModal.name}</strong>
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
              <button className="modal-btn modal-btn-cancel" onClick={() => setEditLogModal(null)}>Cancel</button>
              <button className="modal-btn modal-btn-save" onClick={saveCalEditLog}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
