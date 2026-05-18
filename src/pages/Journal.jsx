import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import './Journal.css'

// ── Constants ─────────────────────────────────────────────────
const HOURS = Array.from({ length: 19 }, (_, i) => {
  const h = i + 5
  return { h, label: h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`, key: `${String(h).padStart(2, '0')}:00` }
})

const MOODS      = ['😔', '😕', '😐', '🙂', '😄']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS  = ['Mo','Tu','We','Th','Fr','Sa','Su']

const WMO = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',
  45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌧️',
  61:'🌧️',63:'🌧️',65:'🌧️',
  71:'🌨️',73:'🌨️',75:'❄️',
  80:'🌦️',81:'🌧️',82:'⛈️',
  95:'⛈️',96:'⛈️',99:'⛈️',
}

const VIEWS = [
  { key: 'daily',     label: 'Daily'     },
  { key: 'weekly',    label: 'Weekly'    },
  { key: 'monthly',   label: 'Monthly'   },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly',    label: 'Yearly'    },
]

// ── Helpers ───────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0] }

function addDays(ds, n) {
  const d = new Date(ds + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function fmtDateLong(ds) {
  const [y, m, d] = ds.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function getWeekStart(ds) {
  const d = new Date(ds + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().split('T')[0]
}

function fmtWeekRange(ws) {
  const s = new Date(ws + 'T12:00:00')
  const e = new Date(ws + 'T12:00:00'); e.setDate(e.getDate() + 6)
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }

function firstDayOfMonth(y, m) {
  const day = new Date(y, m, 1).getDay() // 0=Sun
  return day === 0 ? 6 : day - 1         // Monday = 0
}

// ── DrawCanvas ────────────────────────────────────────────────
function DrawCanvas({ data, onChange, height = 80 }) {
  const canvasRef = useRef(null)
  const ctxRef    = useRef(null)
  const drawing   = useRef(false)
  const lastPt    = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    ctxRef.current = canvas.getContext('2d')
    ctxRef.current.clearRect(0, 0, canvas.width, canvas.height)
    if (data) {
      const img = new Image()
      img.onload = () => ctxRef.current?.drawImage(img, 0, 0)
      img.src = data
    }
  }, [data]) // eslint-disable-line

  function getPos(e) {
    const r  = canvasRef.current.getBoundingClientRect()
    const sx = canvasRef.current.width  / r.width
    const sy = canvasRef.current.height / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  function onPointerDown(e) {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    lastPt.current  = getPos(e)
    const ctx = ctxRef.current
    ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y)
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1a1a1a'
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.lineWidth = e.pointerType === 'pen' ? Math.max(0.8, (e.pressure || 0.5) * 2.5) : 1.8
  }

  function onPointerMove(e) {
    if (!drawing.current) return
    e.preventDefault()
    const pos = getPos(e)
    const ctx = ctxRef.current
    ctx.lineWidth = e.pointerType === 'pen' ? Math.max(0.8, (e.pressure || 0.5) * 2.5) : 1.8
    const mx = (pos.x + lastPt.current.x) / 2
    const my = (pos.y + lastPt.current.y) / 2
    ctx.quadraticCurveTo(lastPt.current.x, lastPt.current.y, mx, my)
    ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx, my)
    lastPt.current = pos
  }

  function onPointerUp() {
    if (!drawing.current) return
    drawing.current = false
    ctxRef.current.stroke()
    onChange(canvasRef.current.toDataURL())
  }

  return (
    <div className="draw-canvas-wrap">
      <canvas ref={canvasRef} width={600} height={Math.round(height * 1.5)}
        className="draw-canvas" style={{ height, width: '100%', touchAction: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={onPointerUp} />
      <button className="draw-clear-btn" onClick={() => {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        onChange(null)
      }}>Clear</button>
    </div>
  )
}

// ── BulletList ────────────────────────────────────────────────
function BulletList({ items, onChange, placeholder = 'Add item…', numbered = false }) {
  const inputRefs = useRef([])

  function update(i, val) {
    const n = [...items]; n[i] = val; onChange(n)
  }
  function addAfter(i) {
    const n = [...items]; n.splice(i + 1, 0, ''); onChange(n)
    setTimeout(() => inputRefs.current[i + 1]?.focus(), 0)
  }
  function remove(i) {
    if (items.length === 1) { onChange(['']); return }
    const n = items.filter((_, idx) => idx !== i); onChange(n)
    setTimeout(() => inputRefs.current[Math.min(i, n.length - 1)]?.focus(), 0)
  }
  function onKeyDown(e, i) {
    if (e.key === 'Enter')     { e.preventDefault(); addAfter(i) }
    if (e.key === 'Backspace' && items[i] === '' && items.length > 1) { e.preventDefault(); remove(i) }
  }

  return (
    <div className="bullet-list">
      {items.map((item, i) => (
        <div key={i} className="bullet-row">
          <span className="bullet-marker">{numbered ? `${i + 1}` : '·'}</span>
          <input
            ref={el => inputRefs.current[i] = el}
            className="journal-input bullet-input"
            placeholder={placeholder}
            value={item}
            onChange={e => update(i, e.target.value)}
            onKeyDown={e => onKeyDown(e, i)}
          />
          <button className="bullet-remove" onClick={() => remove(i)} tabIndex={-1} aria-label="Remove">×</button>
        </div>
      ))}
      <button className="bullet-add" onClick={() => addAfter(items.length - 1)}>+ Add</button>
    </div>
  )
}

// ── PenField ──────────────────────────────────────────────────
function PenField({ value, onChange, penData, onPenChange, placeholder, rows = 2, canvasHeight = 80 }) {
  const [penMode, setPenMode] = useState(false)
  return (
    <div className="pen-field">
      <button className={`pen-toggle-btn${penMode ? ' pen-on' : ''}`}
        onClick={() => setPenMode(p => !p)} title={penMode ? 'Switch to type' : 'Switch to pen'}>
        {penMode ? '⌨️' : '✏️'}
      </button>
      {penMode
        ? <DrawCanvas data={penData} onChange={onPenChange} height={canvasHeight} />
        : <textarea className="journal-input" rows={rows} placeholder={placeholder}
            value={value || ''} onChange={e => onChange(e.target.value)} />
      }
    </div>
  )
}

// ── Schedule slot ─────────────────────────────────────────────
function ScheduleSlot({ hour, value, penData, onTextChange, onPenChange }) {
  const [penMode, setPenMode] = useState(false)
  return (
    <div className="sched-slot">
      <div className="sched-hour">{hour.label}</div>
      <div className="sched-slot-body">
        <button className={`pen-toggle-btn sml${penMode ? ' pen-on' : ''}`}
          onClick={() => setPenMode(p => !p)}>
          {penMode ? '⌨️' : '✏️'}
        </button>
        {penMode
          ? <DrawCanvas data={penData} onChange={onPenChange} height={36} />
          : <input className="journal-input sched-input" type="text" placeholder="—"
              value={value || ''} onChange={e => onTextChange(e.target.value)} />
        }
      </div>
    </div>
  )
}

// ── Month Calendar (left panel) ───────────────────────────────
function MonthCalendar({ selectedDate, onSelectDate, loggedDates }) {
  const today        = todayStr()
  const [y, m]       = selectedDate.split('-').map(Number)
  const [calYear,  setCalYear]  = useState(y)
  const [calMonth, setCalMonth] = useState(m - 1) // 0-indexed
  const [pickingMonth, setPickingMonth] = useState(false)
  const [pickingYear,  setPickingYear]  = useState(false)

  const dim    = daysInMonth(calYear, calMonth)
  const first  = firstDayOfMonth(calYear, calMonth)
  const cells  = Array(first).fill(null).concat(Array.from({ length: dim }, (_, i) => i + 1))

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  function goMonth(delta) {
    let nm = calMonth + delta, ny = calYear
    if (nm < 0)  { nm = 11; ny-- }
    if (nm > 11) { nm = 0;  ny++ }
    setCalMonth(nm); setCalYear(ny)
  }

  function selectDay(d) {
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (ds <= today) onSelectDate(ds)
  }

  const yearOpts = Array.from({ length: 10 }, (_, i) => today.split('-')[0] * 1 - 4 + i)

  return (
    <div className="cal-panel">
      {/* Month + year header */}
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={() => goMonth(-1)}>‹</button>

        <div className="cal-title-group">
          {/* Month picker */}
          <div className="cal-picker-wrap">
            <button className="cal-title-btn" onClick={() => { setPickingMonth(p => !p); setPickingYear(false) }}>
              {MONTH_NAMES[calMonth]} <span className="cal-title-caret">▾</span>
            </button>
            {pickingMonth && (
              <div className="cal-dropdown">
                {MONTH_NAMES.map((name, i) => (
                  <button key={i}
                    className={`cal-dd-item${i === calMonth ? ' active' : ''}`}
                    onClick={() => { setCalMonth(i); setPickingMonth(false) }}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Year picker */}
          <div className="cal-picker-wrap">
            <button className="cal-title-btn" onClick={() => { setPickingYear(p => !p); setPickingMonth(false) }}>
              {calYear} <span className="cal-title-caret">▾</span>
            </button>
            {pickingYear && (
              <div className="cal-dropdown cal-dropdown-year">
                {yearOpts.map(yr => (
                  <button key={yr}
                    className={`cal-dd-item${yr === calYear ? ' active' : ''}`}
                    onClick={() => { setCalYear(yr); setPickingYear(false) }}>
                    {yr}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button className="cal-nav-btn" onClick={() => goMonth(1)}>›</button>
      </div>

      {/* Day labels */}
      <div className="cal-day-labels">
        {DAY_LABELS.map(d => <div key={d} className="cal-day-label">{d}</div>)}
      </div>

      {/* Day grid */}
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} className="cal-cell empty" />
          const ds      = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const isToday = ds === today
          const isSel   = ds === selectedDate
          const isLog   = loggedDates.has(ds)
          const isFuture = ds > today
          return (
            <button key={ds}
              className={`cal-cell${isToday ? ' cal-today' : ''}${isSel ? ' cal-selected' : ''}${isFuture ? ' cal-future' : ''}${isLog ? ' cal-logged' : ''}`}
              onClick={() => selectDay(d)}
              disabled={isFuture}>
              <span className="cal-day-num">{d}</span>
              {isLog && <span className="cal-dot" />}
            </button>
          )
        })}
      </div>

      {/* Today shortcut */}
      {(calYear !== y || calMonth !== m - 1) && (
        <button className="cal-today-btn" onClick={() => {
          const [ty, tm] = todayStr().split('-').map(Number)
          setCalYear(ty); setCalMonth(tm - 1)
          onSelectDate(todayStr())
        }}>
          Go to today
        </button>
      )}

      {/* Logged count */}
      <div className="cal-logged-count">
        {loggedDates.size} {loggedDates.size === 1 ? 'entry' : 'entries'} logged
      </div>
    </div>
  )
}

// ── Daily entry panel ─────────────────────────────────────────
function DailyEntry({ date, userId, healthLog, onOpenMonthly }) {
  const [entry,      setEntry]      = useState(null)
  const [tasks,      setTasks]      = useState([])
  const [weather,    setWeather]    = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [activeTab,  setActiveTab]  = useState('priorities')

  const [schedule,    setSchedule]    = useState({})
  const [schedulePen, setSchedulePen] = useState({})
  const [priorities,  setPriorities]  = useState(['', '', '', ''])
  const [priPen,      setPriPen]      = useState([null, null, null, null])
  const [mood,        setMood]        = useState(null)
  const [gratitude,   setGratitude]   = useState('')
  const [proudOf,     setProudOf]     = useState('')
  const [affirmation, setAffirmation] = useState('')
  const [excited,     setExcited]     = useState('')
  const [lookFwd,     setLookFwd]     = useState('')
  const [notes,       setNotes]       = useState('')
  const [refPen,      setRefPen]      = useState({})

  const isToday = date === todayStr()
  const [_y, _m, _d] = date.split('-').map(Number)
  const isFirstOfMonth = _d === 1
  const isLastOfMonth  = _d === daysInMonth(_y, _m - 1)

  useEffect(() => { loadEntry() }, [date, userId]) // eslint-disable-line

  async function loadEntry() {
    if (!userId) return
    const [entryRes, tasksRes] = await Promise.all([
      supabase.from('journal_days').select('*').eq('user_id', userId).eq('entry_date', date).maybeSingle(),
      supabase.from('tasks').select('*').eq('user_id', userId).eq('due_date', date).neq('status', 'backlog').order('sort_order'),
    ])
    const e = entryRes.data
    setEntry(e || null)
    setTasks(tasksRes.data || [])
    if (e) {
      setSchedule(e.schedule || {})
      setSchedulePen((e.pen_data || {}).schedule || {})
      setPriorities(Array.isArray(e.priorities) && e.priorities.length > 0 ? e.priorities : ['', '', '', ''])
      setPriPen((e.pen_data || {}).priorities || Array(Math.max((e.priorities?.length || 4), 4)).fill(null))
      setMood(e.mood ?? null)
      setGratitude(e.gratitude || ''); setProudOf(e.proud_of || '')
      setAffirmation(e.affirmation || ''); setExcited(e.excited_about || '')
      setLookFwd(e.look_forward || ''); setNotes(e.notes || '')
      setRefPen((e.pen_data || {}).reflections || {})
      if (e.weather_temp != null) setWeather({ temp: e.weather_temp, condition: e.weather_condition || '🌡️' })
    } else {
      setSchedule({}); setSchedulePen({})
      setPriorities(['', '', '', '']); setPriPen([null, null, null, null])
      setMood(null); setGratitude(''); setProudOf('')
      setAffirmation(''); setExcited(''); setLookFwd(''); setNotes('')
      setRefPen({})
      if (isToday) fetchWeather()
      else setWeather(null)
    }
  }

  async function fetchWeather() {
    try {
      const s = JSON.parse(localStorage.getItem('addapp-settings') || '{}')
      let lat = s.weatherLat, lon = s.weatherLon
      if (!lat || !lon) {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }))
        lat = pos.coords.latitude; lon = pos.coords.longitude
        localStorage.setItem('addapp-settings', JSON.stringify({ ...s, weatherLat: lat, weatherLon: lon }))
      }
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=celsius`)
      const d = await r.json()
      setWeather({ temp: Math.round(d.current.temperature_2m), condition: WMO[d.current.weathercode] || '🌡️' })
    } catch { /* denied or offline */ }
  }

  async function save() {
    if (!userId || saving) return
    setSaving(true)
    const payload = {
      user_id: userId, entry_date: date,
      schedule, priorities, mood,
      weather_temp: weather?.temp ?? null,
      weather_condition: weather?.condition ?? null,
      gratitude, proud_of: proudOf, affirmation,
      excited_about: excited, look_forward: lookFwd, notes,
      pen_data: { schedule: schedulePen, priorities: priPen, reflections: refPen },
      updated_at: new Date().toISOString(),
    }
    if (entry) {
      const { data } = await supabase.from('journal_days').update(payload).eq('id', entry.id).select().single()
      if (data) setEntry(data)
    } else {
      const { data } = await supabase.from('journal_days').insert(payload).select().single()
      if (data) setEntry(data)
    }
    setSaving(false)
  }

  async function toggleTask(task) {
    const ns = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('tasks').update({ status: ns, updated_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: ns } : t))
  }

  return (
    <div className="entry-panel">
      {/* Entry header */}
      <div className="entry-header">
        <div>
          <div className="entry-date">{fmtDateLong(date)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {isToday && <span className="journal-today-tag">Today</span>}
            {weather   && <span className="journal-chip">{weather.condition} {weather.temp}°C</span>}
            {healthLog?.energy_score && <span className="journal-chip">⚡ {healthLog.energy_score}</span>}
            {healthLog?.sleep_hours  && <span className="journal-chip">😴 {healthLog.sleep_hours}h</span>}
            {isFirstOfMonth && onOpenMonthly && (
              <button className="journal-monthly-btn"
                onClick={() => onOpenMonthly(date.slice(0, 7), 'review')}>
                📋 Monthly Review
              </button>
            )}
            {isLastOfMonth && onOpenMonthly && (
              <button className="journal-monthly-btn"
                onClick={() => onOpenMonthly(date.slice(0, 7), 'glance')}>
                📊 Month at a Glance
              </button>
            )}
          </div>
        </div>
        <button className="btn-primary entry-save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : entry ? 'Update' : 'Save entry'}
        </button>
      </div>

      {/* Two-column layout */}
      <div className="entry-layout">

        {/* Schedule */}
        <div className="entry-schedule-col">
          <div className="journal-col-title">Schedule</div>
          <div className="sched-list">
            {HOURS.map(hour => (
              <ScheduleSlot key={hour.key} hour={hour}
                value={schedule[hour.key]}
                penData={schedulePen[hour.key]}
                onTextChange={v => setSchedule(s => ({ ...s, [hour.key]: v }))}
                onPenChange={v => setSchedulePen(s => ({ ...s, [hour.key]: v }))}
              />
            ))}
          </div>
        </div>

        {/* Tabbed right column */}
        <div className="entry-right-col">
          <div className="journal-tabs">
            <button className={`jtab${activeTab === 'priorities' ? ' active' : ''}`} onClick={() => setActiveTab('priorities')}>Priorities</button>
            <button className={`jtab${activeTab === 'tasks' ? ' active' : ''}`} onClick={() => setActiveTab('tasks')}>
              Tasks {tasks.length > 0 && <span className="jtab-badge">{tasks.length}</span>}
            </button>
            <button className={`jtab${activeTab === 'reflections' ? ' active' : ''}`} onClick={() => setActiveTab('reflections')}>Reflections</button>
          </div>

          {activeTab === 'priorities' && (
            <div className="journal-panel">
              <div className="journal-col-title">Top priorities</div>
              {priorities.map((p, i) => (
                <div key={i} className="priority-row">
                  <div className="priority-num">{i + 1}</div>
                  <PenField value={p}
                    onChange={v => setPriorities(prev => { const n = [...prev]; n[i] = v; return n })}
                    penData={priPen[i]}
                    onPenChange={v => setPriPen(prev => { const n = [...prev]; n[i] = v; return n })}
                    placeholder={`Priority ${i + 1}…`} rows={1} canvasHeight={44} />
                  {priorities.length > 1 && (
                    <button className="bullet-remove" onClick={() => {
                      setPriorities(prev => prev.filter((_,idx) => idx !== i))
                      setPriPen(prev => prev.filter((_,idx) => idx !== i))
                    }} tabIndex={-1}>×</button>
                  )}
                </div>
              ))}
              <button className="bullet-add" onClick={() => {
                setPriorities(prev => [...prev, ''])
                setPriPen(prev => [...prev, null])
              }}>+ Add priority</button>
              <div className="journal-subsection">
                <div className="journal-col-title">Mood</div>
                <div className="mood-row">
                  {MOODS.map((m, i) => (
                    <button key={i} className={`mood-btn${mood === i + 1 ? ' active' : ''}`}
                      onClick={() => setMood(n => n === i + 1 ? null : i + 1)}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="journal-subsection">
                <div className="journal-col-title">Notes</div>
                <PenField value={notes} onChange={setNotes}
                  penData={refPen.notes} onPenChange={v => setRefPen(p => ({ ...p, notes: v }))}
                  placeholder="Anything on your mind today…" rows={4} canvasHeight={100} />
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="journal-panel">
              <div className="journal-col-title">Tasks due today</div>
              {tasks.length === 0
                ? <p className="journal-empty">No tasks due today.</p>
                : tasks.map(task => (
                    <div key={task.id} className="jtask-row" onClick={() => toggleTask(task)}>
                      <div className={`jtask-check${task.status === 'done' ? ' done' : ''}`}>
                        {task.status === 'done' && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 3L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className={`jtask-title${task.status === 'done' ? ' done' : ''}`}>{task.title}</span>
                    </div>
                  ))
              }
            </div>
          )}

          {activeTab === 'reflections' && (
            <div className="journal-panel">
              {[
                { key: 'gratitude',   label: '🙏 Today I\'m grateful for',    val: gratitude,   set: setGratitude   },
                { key: 'proud',       label: '💪 Something I\'m proud of',    val: proudOf,     set: setProudOf     },
                { key: 'affirmation', label: '✨ Affirmation',                 val: affirmation, set: setAffirmation },
                { key: 'excited',     label: '🌟 What I\'m excited about',    val: excited,     set: setExcited     },
                { key: 'lookfwd',     label: '🌅 Tomorrow I look forward to', val: lookFwd,     set: setLookFwd     },
              ].map(f => (
                <div key={f.key} className="reflection-field">
                  <div className="journal-col-title" style={{ fontSize: 11, marginBottom: 6 }}>{f.label}</div>
                  <PenField value={f.val} onChange={f.set}
                    penData={refPen[f.key]} onPenChange={v => setRefPen(p => ({ ...p, [f.key]: v }))}
                    placeholder="Write here…" rows={2} canvasHeight={60} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Weekly view ───────────────────────────────────────────────
function parseLines(val) {
  if (!val) return ['']
  if (Array.isArray(val)) return val.length ? val : ['']
  const items = val.split('\n').filter(Boolean)
  return items.length ? items : ['']
}

function WeeklyView({ weekStart, userId }) {
  const [entry,      setEntry]      = useState(null)
  const [stats,      setStats]      = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [goingWell,  setGoingWell]  = useState([''])
  const [notWorking, setNotWorking] = useState([''])
  const [improveOn,  setImproveOn]  = useState([''])
  const [nextFocus,  setNextFocus]  = useState([''])
  const [lessons,    setLessons]    = useState([''])
  const [gratitude,  setGratitude]  = useState([''])
  const [highlights, setHighlights] = useState([''])

  useEffect(() => { loadWeek() }, [weekStart, userId]) // eslint-disable-line

  async function loadWeek() {
    if (!userId) return
    const weekEnd = addDays(weekStart, 6)
    const [weekRes, tasksRes, healthRes] = await Promise.all([
      supabase.from('journal_weeks').select('*').eq('user_id', userId).eq('week_start', weekStart).maybeSingle(),
      supabase.from('tasks').select('status').eq('user_id', userId).gte('due_date', weekStart).lte('due_date', weekEnd),
      supabase.from('health_logs').select('energy_score,sleep_hours').eq('user_id', userId).gte('log_date', weekStart).lte('log_date', weekEnd),
    ])
    const e = weekRes.data
    setEntry(e || null)
    if (e) {
      setGoingWell(parseLines(e.going_well))
      setNotWorking(parseLines(e.not_working))
      setImproveOn(parseLines(e.improve_on))
      setNextFocus(parseLines(e.next_focus))
      setLessons(parseLines(e.lessons))
      setGratitude(parseLines(e.gratitude))
      setHighlights(parseLines(e.highlights))
    } else {
      setGoingWell(['']); setNotWorking(['']); setImproveOn([''])
      setNextFocus(['']); setLessons(['']); setGratitude(['']); setHighlights([''])
    }
    const tAll = tasksRes.data || [], hAll = healthRes.data || []
    const eArr = hAll.filter(l => l.energy_score), sArr = hAll.filter(l => l.sleep_hours)
    setStats({
      tasksDone: tAll.filter(t => t.status==='done').length, tasksTotal: tAll.length,
      avgEnergy: eArr.length ? Math.round(eArr.reduce((s,l)=>s+l.energy_score,0)/eArr.length) : null,
      avgSleep:  sArr.length ? (sArr.reduce((s,l)=>s+l.sleep_hours,0)/sArr.length).toFixed(1)  : null,
      daysLogged: hAll.length,
    })
  }

  async function save() {
    if (!userId || saving) return
    setSaving(true)
    const payload = {
      user_id: userId, week_start: weekStart,
      going_well:  goingWell.filter(Boolean).join('\n'),
      not_working: notWorking.filter(Boolean).join('\n'),
      improve_on:  improveOn.filter(Boolean).join('\n'),
      next_focus:  nextFocus.filter(Boolean).join('\n'),
      lessons:     lessons.filter(Boolean).join('\n'),
      gratitude:   gratitude.filter(Boolean),
      highlights:  highlights.filter(Boolean),
      updated_at:  new Date().toISOString(),
    }
    if (entry) {
      const { data } = await supabase.from('journal_weeks').update(payload).eq('id', entry.id).select().single()
      if (data) setEntry(data)
    } else {
      const { data } = await supabase.from('journal_weeks').insert(payload).select().single()
      if (data) setEntry(data)
    }
    setSaving(false)
  }

  const reflectionFields = [
    { label: '✅ What\'s going well?',  items: goingWell,  set: setGoingWell  },
    { label: '⚠️ What\'s not working?', items: notWorking, set: setNotWorking },
    { label: '📈 What to improve on',   items: improveOn,  set: setImproveOn  },
    { label: '🎯 Next week focus',      items: nextFocus,  set: setNextFocus  },
    { label: '📚 Lessons learned',      items: lessons,    set: setLessons    },
  ]

  return (
    <div className="journal-weekly">
      <div className="entry-header">
        <div className="entry-date" style={{ fontSize: 16 }}>Week of {fmtWeekRange(weekStart)}</div>
        <button className="btn-primary entry-save-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save review'}</button>
      </div>
      {stats && (
        <div className="weekly-stats">
          <div className="wstat-card"><div className="wstat-num">{stats.tasksDone}/{stats.tasksTotal}</div><div className="wstat-label">Tasks done</div></div>
          {stats.avgEnergy && <div className="wstat-card"><div className="wstat-num">{stats.avgEnergy}</div><div className="wstat-label">Avg energy</div></div>}
          {stats.avgSleep  && <div className="wstat-card"><div className="wstat-num">{stats.avgSleep}h</div><div className="wstat-label">Avg sleep</div></div>}
          <div className="wstat-card"><div className="wstat-num">{stats.daysLogged}/7</div><div className="wstat-label">Health logged</div></div>
        </div>
      )}
      <div className="weekly-grid">
        {reflectionFields.map(f => (
          <div key={f.label} className="weekly-field">
            <div className="journal-col-title" style={{ fontSize: 11, marginBottom: 6 }}>{f.label}</div>
            <BulletList items={f.items} onChange={f.set} placeholder="Write here…" />
          </div>
        ))}
      </div>
      <div className="weekly-lists">
        <div className="weekly-list-col">
          <div className="journal-col-title" style={{ marginBottom: 10 }}>🙏 Grateful for</div>
          <BulletList items={gratitude} onChange={setGratitude} placeholder="I'm grateful for…" numbered />
        </div>
        <div className="weekly-list-col">
          <div className="journal-col-title" style={{ marginBottom: 10 }}>⭐ Highlights</div>
          <BulletList items={highlights} onChange={setHighlights} placeholder="Highlight of the week…" numbered />
        </div>
      </div>
    </div>
  )
}

// ── Stub ──────────────────────────────────────────────────────
function StubView({ title, icon }) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'50vh',flexDirection:'column',gap:12}}>
      <div style={{fontSize:42}}>{icon}</div>
      <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>{title}</div>
      <div style={{fontSize:13,color:'var(--text3)'}}>Coming in the next update</div>
    </div>
  )
}

// ── Monthly ratings row ────────────────────────────────────────
const RATING_CATEGORIES = [
  'Personal Growth', 'Career', 'Friends & Family',
  'Physical & Environment', 'Finances', 'Fun & Recreation',
  'Health', 'Spirituality',
]

function RatingRow({ label, value, onChange }) {
  return (
    <div className="rating-row">
      <span className="rating-label">{label}</span>
      <div className="rating-cells">
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n}
            className={`rating-cell${value === n ? ' active' : ''}`}
            onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Monthly Review ─────────────────────────────────────────────
function MonthlyReview({ month, userId }) {
  const [entry,       setEntry]       = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [howWasMonth, setHowWasMonth] = useState('')
  const [howPen,      setHowPen]      = useState(null)
  const [grateful,    setGrateful]    = useState([''])
  const [highlights,  setHighlights]  = useState([''])
  const [goingWell,   setGoingWell]   = useState([''])
  const [notWorking,  setNotWorking]  = useState([''])
  const [thingsStop,  setThingsStop]  = useState([''])
  const [thingsStart, setThingsStart] = useState([''])
  const [thingsKeep,  setThingsKeep]  = useState([''])
  const [ratings,     setRatings]     = useState({})
  const [improveOn,   setImproveOn]   = useState([''])
  const [nextFocus,   setNextFocus]   = useState([''])

  useEffect(() => { load() }, [month, userId]) // eslint-disable-line

  async function load() {
    if (!userId) return
    const { data } = await supabase.from('journal_monthly_reviews').select('*')
      .eq('user_id', userId).eq('month', month).maybeSingle()
    setEntry(data || null)
    if (data) {
      setHowWasMonth(data.how_was_month || '')
      setHowPen((data.pen_data || {}).how || null)
      setGrateful(parseLines(data.grateful));    setHighlights(parseLines(data.highlights))
      setGoingWell(parseLines(data.going_well)); setNotWorking(parseLines(data.not_working))
      setThingsStop(parseLines(data.things_stop)); setThingsStart(parseLines(data.things_start))
      setThingsKeep(parseLines(data.things_keep))
      setRatings(data.ratings || {})
      setImproveOn(parseLines(data.improve_on)); setNextFocus(parseLines(data.next_month_focus))
    } else {
      setHowWasMonth(''); setHowPen(null)
      setGrateful(['']); setHighlights(['']); setGoingWell(['']); setNotWorking([''])
      setThingsStop(['']); setThingsStart(['']); setThingsKeep([''])
      setRatings({}); setImproveOn(['']); setNextFocus([''])
    }
  }

  async function save() {
    if (!userId || saving) return
    setSaving(true)
    const payload = {
      user_id: userId, month,
      how_was_month: howWasMonth,
      grateful: grateful.filter(Boolean),   highlights: highlights.filter(Boolean),
      going_well:  goingWell.filter(Boolean).join('\n'),
      not_working: notWorking.filter(Boolean).join('\n'),
      things_stop:  thingsStop.filter(Boolean),
      things_start: thingsStart.filter(Boolean),
      things_keep:  thingsKeep.filter(Boolean),
      ratings,
      improve_on:       improveOn.filter(Boolean).join('\n'),
      next_month_focus: nextFocus.filter(Boolean).join('\n'),
      pen_data: { how: howPen },
      updated_at: new Date().toISOString(),
    }
    if (entry) {
      const { data } = await supabase.from('journal_monthly_reviews').update(payload).eq('id', entry.id).select().single()
      if (data) setEntry(data)
    } else {
      const { data } = await supabase.from('journal_monthly_reviews').insert(payload).select().single()
      if (data) setEntry(data)
    }
    setSaving(false)
  }

  const [y, m] = month.split('-').map(Number)

  return (
    <div className="monthly-review">
      <div className="entry-header">
        <div>
          <div className="entry-date" style={{ fontSize: 18 }}>Monthly Review</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3 }}>{MONTH_NAMES[m - 1]} {y}</div>
        </div>
        <button className="btn-primary entry-save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : entry ? 'Update' : 'Save review'}
        </button>
      </div>

      <div className="monthly-review-grid">
        {/* ── Left column ── */}
        <div className="monthly-col">
          <div className="monthly-section">
            <div className="journal-col-title">How was my month?</div>
            <PenField value={howWasMonth} onChange={setHowWasMonth}
              penData={howPen} onPenChange={setHowPen}
              placeholder="Reflect on your month overall…" rows={5} canvasHeight={120} />
          </div>

          <div className="monthly-two-col">
            <div className="monthly-section">
              <div className="journal-col-title">🙏 Grateful for</div>
              <BulletList items={grateful} onChange={setGrateful} placeholder="I'm grateful for…" numbered />
            </div>
            <div className="monthly-section">
              <div className="journal-col-title">⭐ Highlights</div>
              <BulletList items={highlights} onChange={setHighlights} placeholder="Highlight…" numbered />
            </div>
          </div>

          <div className="monthly-section">
            <div className="journal-col-title">✅ What's going well?</div>
            <BulletList items={goingWell} onChange={setGoingWell} placeholder="Write here…" />
          </div>

          <div className="monthly-section">
            <div className="journal-col-title">⚠️ What's not working?</div>
            <BulletList items={notWorking} onChange={setNotWorking} placeholder="Write here…" />
          </div>

          <div className="monthly-section">
            <div className="journal-col-title">Things to</div>
            <div className="stop-start-keep">
              <div className="ssk-col">
                <div className="ssk-header ssk-stop">🚫 Stop doing</div>
                <BulletList items={thingsStop} onChange={setThingsStop} placeholder="Stop…" />
              </div>
              <div className="ssk-col">
                <div className="ssk-header ssk-start">✨ Start doing</div>
                <BulletList items={thingsStart} onChange={setThingsStart} placeholder="Start…" />
              </div>
              <div className="ssk-col">
                <div className="ssk-header ssk-keep">🔄 Keep doing</div>
                <BulletList items={thingsKeep} onChange={setThingsKeep} placeholder="Keep…" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="monthly-col">
          <div className="monthly-section">
            <div className="journal-col-title">Monthly ratings (1–10)</div>
            <div className="rating-num-row">
              <span className="rating-label-spacer" />
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <span key={n} className="rating-num-hdr">{n}</span>
              ))}
            </div>
            {RATING_CATEGORIES.map(cat => (
              <RatingRow key={cat} label={cat}
                value={ratings[cat] ?? null}
                onChange={v => setRatings(p => ({ ...p, [cat]: v }))} />
            ))}
          </div>

          <div className="monthly-section">
            <div className="journal-col-title">📈 What I need to improve on</div>
            <BulletList items={improveOn} onChange={setImproveOn} placeholder="Write here…" />
          </div>

          <div className="monthly-section">
            <div className="journal-col-title">🎯 Next month I'll be focusing on</div>
            <BulletList items={nextFocus} onChange={setNextFocus} placeholder="Write here…" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Month at a Glance ──────────────────────────────────────────
function MonthAtAGlance({ month, userId }) {
  const [entry,        setEntry]        = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [mainFocus,    setMainFocus]    = useState('')
  const [focusPen,     setFocusPen]     = useState(null)
  const [goals,        setGoals]        = useState([''])
  const [priorities,   setPriorities]   = useState([''])
  const [todos,        setTodos]        = useState([{ text: '', done: false }])
  const [appointments, setAppointments] = useState([{ event: '', datetime: '' }])
  const [dayNotes,     setDayNotes]     = useState({})
  const [note,         setNote]         = useState('')

  useEffect(() => { load() }, [month, userId]) // eslint-disable-line

  async function load() {
    if (!userId) return
    const { data } = await supabase.from('journal_monthly_glance').select('*')
      .eq('user_id', userId).eq('month', month).maybeSingle()
    setEntry(data || null)
    if (data) {
      setMainFocus(data.main_focus || '')
      setFocusPen((data.pen_data || {}).focus || null)
      setGoals(parseLines(data.goals)); setPriorities(parseLines(data.priorities))
      setTodos(data.todos?.length ? data.todos : [{ text: '', done: false }])
      setAppointments(data.appointments?.length ? data.appointments : [{ event: '', datetime: '' }])
      setDayNotes(data.day_notes || {}); setNote(data.note || '')
    } else {
      setMainFocus(''); setFocusPen(null)
      setGoals(['']); setPriorities([''])
      setTodos([{ text: '', done: false }])
      setAppointments([{ event: '', datetime: '' }])
      setDayNotes({}); setNote('')
    }
  }

  async function save() {
    if (!userId || saving) return
    setSaving(true)
    const payload = {
      user_id: userId, month,
      main_focus: mainFocus,
      goals: goals.filter(Boolean), priorities: priorities.filter(Boolean),
      todos: todos.filter(t => t.text),
      appointments: appointments.filter(a => a.event),
      day_notes: dayNotes, note,
      pen_data: { focus: focusPen },
      updated_at: new Date().toISOString(),
    }
    if (entry) {
      const { data } = await supabase.from('journal_monthly_glance').update(payload).eq('id', entry.id).select().single()
      if (data) setEntry(data)
    } else {
      const { data } = await supabase.from('journal_monthly_glance').insert(payload).select().single()
      if (data) setEntry(data)
    }
    setSaving(false)
  }

  const [y, m]  = month.split('-').map(Number)
  const numDays = daysInMonth(y, m - 1)
  const first   = firstDayOfMonth(y, m - 1)
  const calCells = Array(first).fill(null).concat(Array.from({ length: numDays }, (_, i) => i + 1))
  while (calCells.length % 7 !== 0) calCells.push(null)

  function addTodo(afterIdx) {
    setTodos(prev => { const n = [...prev]; n.splice(afterIdx + 1, 0, { text: '', done: false }); return n })
  }
  function addAppt(afterIdx) {
    setAppointments(prev => { const n = [...prev]; n.splice(afterIdx + 1, 0, { event: '', datetime: '' }); return n })
  }

  return (
    <div className="monthly-glance">
      <div className="entry-header">
        <div>
          <div className="entry-date" style={{ fontSize: 18 }}>Month at a Glance</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3 }}>{MONTH_NAMES[m - 1]} {y}</div>
        </div>
        <button className="btn-primary entry-save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : entry ? 'Update' : 'Save'}
        </button>
      </div>

      <div className="glance-grid">
        {/* ── Left: mini-cal + goals + todos ── */}
        <div className="glance-left">
          <div className="glance-section">
            <div className="glance-mini-cal">
              <div className="glance-cal-title">{MONTH_NAMES[m - 1]} {y}</div>
              <div className="glance-cal-days">
                {DAY_LABELS.map(d => <div key={d} className="glance-cal-label">{d}</div>)}
              </div>
              <div className="glance-cal-grid">
                {calCells.map((d, i) => (
                  <div key={i} className={`glance-cal-cell${!d ? ' empty' : ''}`}>{d || ''}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="glance-section">
            <div className="journal-col-title">Goals</div>
            <BulletList items={goals} onChange={setGoals} placeholder="Goal…" numbered />
          </div>

          <div className="glance-section">
            <div className="journal-col-title">To Do</div>
            {todos.map((todo, i) => (
              <div key={i} className="glance-todo-row">
                <button className={`glance-todo-check${todo.done ? ' done' : ''}`}
                  onClick={() => setTodos(prev => prev.map((t, idx) => idx === i ? { ...t, done: !t.done } : t))}>
                  {todo.done && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2.5L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </button>
                <input className="journal-input bullet-input"
                  placeholder="To do…" value={todo.text}
                  style={{ textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? 'var(--text3)' : 'var(--text)' }}
                  onChange={e => setTodos(prev => prev.map((t, idx) => idx === i ? { ...t, text: e.target.value } : t))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTodo(i) }
                    if (e.key === 'Backspace' && todo.text === '' && todos.length > 1) { e.preventDefault(); setTodos(prev => prev.filter((_,idx) => idx !== i)) }
                  }}
                />
                {todos.length > 1 && (
                  <button className="bullet-remove" onClick={() => setTodos(prev => prev.filter((_,idx) => idx !== i))} tabIndex={-1}>×</button>
                )}
              </div>
            ))}
            <button className="bullet-add" onClick={() => addTodo(todos.length - 1)}>+ Add</button>
          </div>
        </div>

        {/* ── Center: main focus + priorities + appointments ── */}
        <div className="glance-center">
          <div className="glance-section">
            <div className="journal-col-title">Main focus this month</div>
            <PenField value={mainFocus} onChange={setMainFocus}
              penData={focusPen} onPenChange={setFocusPen}
              placeholder="What matters most this month…" rows={4} canvasHeight={100} />
          </div>

          <div className="glance-section">
            <div className="journal-col-title">Top priorities</div>
            <BulletList items={priorities} onChange={setPriorities} placeholder="Priority…" numbered />
          </div>

          <div className="glance-section">
            <div className="journal-col-title">Appointments / Events</div>
            <div className="appt-table">
              <div className="appt-header-row">
                <span className="appt-n">#</span>
                <span className="appt-event-hdr">Appointment / Event</span>
                <span className="appt-dt-hdr">Date / Time</span>
              </div>
              {appointments.map((a, i) => (
                <div key={i} className="appt-row">
                  <span className="appt-n">{i + 1}</span>
                  <input className="journal-input appt-event-input"
                    placeholder="Event…" value={a.event}
                    onChange={e => setAppointments(prev => prev.map((x,idx) => idx===i ? {...x,event:e.target.value} : x))}
                    onKeyDown={e => e.key === 'Enter' && addAppt(i)}
                  />
                  <input className="journal-input appt-dt-input"
                    placeholder="Date / time…" value={a.datetime}
                    onChange={e => setAppointments(prev => prev.map((x,idx) => idx===i ? {...x,datetime:e.target.value} : x))}
                  />
                  {appointments.length > 1 && (
                    <button className="bullet-remove" onClick={() => setAppointments(prev => prev.filter((_,idx) => idx!==i))} tabIndex={-1}>×</button>
                  )}
                </div>
              ))}
              <button className="bullet-add" onClick={() => addAppt(appointments.length - 1)}>+ Add</button>
            </div>
          </div>
        </div>

        {/* ── Right: day-by-day notes ── */}
        <div className="glance-right">
          <div className="glance-section">
            <div className="journal-col-title">Day notes</div>
            <div className="day-notes-grid">
              {Array.from({ length: numDays }, (_, i) => i + 1).map(d => (
                <div key={d} className="day-note-row">
                  <span className="day-note-num">{d}</span>
                  <input className="journal-input bullet-input day-note-input"
                    placeholder="—"
                    value={dayNotes[d] || ''}
                    onChange={e => setDayNotes(p => ({ ...p, [d]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="glance-section" style={{ marginTop: 16 }}>
            <div className="journal-col-title">Notes</div>
            <textarea className="journal-input" rows={4} placeholder="Notes…" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Monthly page wrapper (tabs + month bar) ────────────────────
function MonthlyPage({ month, onMonthChange, subView, onSubViewChange, userId }) {
  const [y, m] = month.split('-').map(Number)

  function setYear(delta) {
    onMonthChange(`${y + delta}-${String(m).padStart(2, '0')}`)
  }

  return (
    <div className="monthly-page">
      {/* Sub-view tabs */}
      <div className="monthly-sub-tabs">
        <button className={`msub-tab${subView === 'review' ? ' active' : ''}`}
          onClick={() => onSubViewChange('review')}>📋 Monthly Review</button>
        <button className={`msub-tab${subView === 'glance' ? ' active' : ''}`}
          onClick={() => onSubViewChange('glance')}>📊 Month at a Glance</button>
      </div>

      {/* Month picker bar */}
      <div className="monthly-month-bar">
        <button className="cal-nav-btn" onClick={() => setYear(-1)} title="Previous year">‹‹</button>
        {MONTH_NAMES.map((name, i) => {
          const mm = `${y}-${String(i + 1).padStart(2, '0')}`
          return (
            <button key={i} className={`month-chip${mm === month ? ' active' : ''}`}
              onClick={() => onMonthChange(mm)}>
              {name.slice(0, 3)}
            </button>
          )
        })}
        <button className="cal-nav-btn" onClick={() => setYear(1)} title="Next year">››</button>
        <span className="monthly-year-label">{y}</span>
      </div>

      <div className="monthly-body">
        {subView === 'review' && <MonthlyReview key={month} month={month} userId={userId} />}
        {subView === 'glance' && <MonthAtAGlance key={month} month={month} userId={userId} />}
      </div>
    </div>
  )
}

// ── Main Journal ──────────────────────────────────────────────
export default function Journal({ userId }) {
  const [view,           setView]           = useState('daily')
  const [selectedDate,   setSelectedDate]   = useState(todayStr())
  const [weekStart,      setWeekStart]      = useState(() => getWeekStart(todayStr()))
  const [loggedDates,    setLoggedDates]    = useState(new Set())
  const [healthLog,      setHealthLog]      = useState(null)
  const [monthlySubView, setMonthlySubView] = useState('review')
  const [monthlyMonth,   setMonthlyMonth]   = useState(() => todayStr().slice(0, 7))

  function openMonthly(month, subView) {
    setMonthlyMonth(month)
    setMonthlySubView(subView)
    setView('monthly')
  }

  // Load all logged dates for dot indicators
  useEffect(() => {
    if (!userId) return
    supabase.from('journal_days').select('entry_date').eq('user_id', userId)
      .then(({ data }) => setLoggedDates(new Set((data || []).map(r => r.entry_date))))
  }, [userId])

  // Load health log for selected date
  useEffect(() => {
    if (!userId) return
    supabase.from('health_logs').select('energy_score,sleep_hours')
      .eq('user_id', userId).eq('log_date', selectedDate).maybeSingle()
      .then(({ data }) => setHealthLog(data || null))
  }, [userId, selectedDate])

  function handleSelectDate(ds) {
    setSelectedDate(ds)
    setWeekStart(getWeekStart(ds))
  }

  // After saving an entry, mark that date as logged
  function markLogged(ds) {
    setLoggedDates(prev => new Set([...prev, ds]))
  }

  return (
    <div className="journal-page">
      {/* View tabs at top */}
      <div className="journal-view-tabs">
        {VIEWS.map(v => (
          <button key={v.key} className={`jview-tab${view === v.key ? ' active' : ''}`}
            onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </div>

      <div className="journal-body">
        {/* Left: calendar (shown on daily + weekly view) */}
        {(view === 'daily' || view === 'weekly') && (
          <MonthCalendar
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            loggedDates={loggedDates}
          />
        )}

        {/* Right: content */}
        <div className="journal-main">
          {view === 'daily'     && <DailyEntry key={selectedDate} date={selectedDate} userId={userId} healthLog={healthLog} onLogged={markLogged} onOpenMonthly={openMonthly} />}
          {view === 'weekly'    && <WeeklyView weekStart={weekStart} userId={userId} />}
          {view === 'monthly'   && <MonthlyPage month={monthlyMonth} onMonthChange={setMonthlyMonth} subView={monthlySubView} onSubViewChange={setMonthlySubView} userId={userId} />}
          {view === 'quarterly' && <StubView title="Quarterly Planner" icon="🔷" />}
          {view === 'yearly'    && <StubView title="Yearly Planner" icon="⭐" />}
        </div>
      </div>
    </div>
  )
}
