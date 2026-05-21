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
const PEN_SIZES = { thin: 1.2, medium: 2.5, thick: 5 }

function DrawCanvas({ data, onChange, height = 80, interactive = true, penColor = 'auto', penSize = 'medium', penTool = 'pen' }) {
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

  function resolveColor() {
    if (!penColor || penColor === 'auto')
      return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1a1a1a'
    return penColor
  }

  function getPos(e) {
    const r  = canvasRef.current.getBoundingClientRect()
    const sx = canvasRef.current.width  / r.width
    const sy = canvasRef.current.height / r.height
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  function beginStroke(ctx, e) {
    const base = PEN_SIZES[penSize] || 2.5
    ctx.lineCap  = 'round'
    ctx.lineJoin = 'round'
    if (penTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = 1
      ctx.lineWidth   = base * 6
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else if (penTool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 0.35
      ctx.lineWidth   = base * 5
      ctx.strokeStyle = resolveColor()
      ctx.lineCap     = 'square'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.lineWidth   = e.pointerType === 'pen' ? Math.max(0.8, (e.pressure || 0.5) * base * 1.6) : base
      ctx.strokeStyle = resolveColor()
    }
  }

  function onPointerDown(e) {
    if (!interactive) return
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    lastPt.current  = getPos(e)
    const ctx = ctxRef.current
    beginStroke(ctx, e)
    ctx.beginPath()
    ctx.moveTo(lastPt.current.x, lastPt.current.y)
  }

  function onPointerMove(e) {
    if (!drawing.current || !interactive) return
    e.preventDefault()
    const pos = getPos(e)
    const ctx = ctxRef.current
    if (penTool === 'pen' && e.pointerType === 'pen') {
      const base = PEN_SIZES[penSize] || 2.5
      ctx.lineWidth = Math.max(0.8, (e.pressure || 0.5) * base * 1.6)
    }
    const mx = (pos.x + lastPt.current.x) / 2
    const my = (pos.y + lastPt.current.y) / 2
    ctx.quadraticCurveTo(lastPt.current.x, lastPt.current.y, mx, my)
    ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx, my)
    lastPt.current = pos
  }

  function onPointerUp() {
    if (!drawing.current) return
    drawing.current = false
    const ctx = ctxRef.current
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    onChange(canvasRef.current.toDataURL())
  }

  const cursor = !interactive ? 'default' : penTool === 'eraser' ? 'cell' : 'crosshair'

  return (
    <div className="draw-canvas-wrap">
      <canvas ref={canvasRef} width={600} height={Math.round(height * 1.5)}
        className="draw-canvas"
        style={{ height, width: '100%', touchAction: interactive ? 'none' : 'auto', cursor }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={onPointerUp} />
    </div>
  )
}

// ── PenToolbar ────────────────────────────────────────────────
const PEN_COLORS = [
  { hex: 'auto',    label: 'Theme',  display: 'linear-gradient(135deg, #111 50%, #fff 50%)' },
  { hex: '#ef4444', label: 'Red'    },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green'  },
  { hex: '#3b82f6', label: 'Blue'   },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink'   },
  { hex: '#6b7280', label: 'Gray'   },
  { hex: '#92400e', label: 'Brown'  },
]
const PEN_TOOLS_LIST = [
  { id: 'pen',         label: 'Pen',         icon: '✏️' },
  { id: 'highlighter', label: 'Highlighter', icon: '🖊️' },
  { id: 'eraser',      label: 'Eraser',      icon: '⬜' },
]
const PEN_SIZES_LIST = [
  { id: 'thin',   dot: 4  },
  { id: 'medium', dot: 7  },
  { id: 'thick',  dot: 11 },
]

function PenToolbar({ settings, onChange }) {
  return (
    <div className="pen-toolbar">
      <div className="pen-tb-group">
        {PEN_TOOLS_LIST.map(t => (
          <button key={t.id}
            className={`pen-tb-btn${settings.tool === t.id ? ' active' : ''}`}
            onClick={() => onChange({ ...settings, tool: t.id })}
            title={t.label}
          >{t.icon}</button>
        ))}
      </div>
      <div className="pen-tb-sep" />
      <div className="pen-tb-group pen-color-group">
        {PEN_COLORS.map(c => (
          <button key={c.hex}
            className={`pen-color-swatch${settings.color === c.hex ? ' active' : ''}`}
            style={{ background: c.display || c.hex }}
            onClick={() => onChange({ ...settings, color: c.hex, tool: settings.tool === 'eraser' ? 'pen' : settings.tool })}
            title={c.label}
          />
        ))}
      </div>
      <div className="pen-tb-sep" />
      <div className="pen-tb-group">
        {PEN_SIZES_LIST.map(s => (
          <button key={s.id}
            className={`pen-tb-btn pen-size-btn${settings.size === s.id ? ' active' : ''}`}
            onClick={() => onChange({ ...settings, size: s.id })}
            title={s.id}
          >
            <span className="pen-size-dot" style={{ width: s.dot, height: s.dot }} />
          </button>
        ))}
      </div>
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
// penMode prop: external control (from global toggle). If undefined, uses internal toggle.
// penSettings: { tool, color, size } — passed from DailyEntry toolbar.
function PenField({ value, onChange, penData, onPenChange, placeholder, rows = 2, canvasHeight = 80, penMode: externalPen, penSettings }) {
  const [localPen, setLocalPen] = useState(false)
  const isGlobal = externalPen !== undefined
  const active   = isGlobal ? externalPen : localPen
  const ps = penSettings || {}
  return (
    <div className="pen-field">
      {!isGlobal && (
        <button className={`pen-toggle-btn${active ? ' pen-on' : ''}`}
          onClick={() => setLocalPen(p => !p)} title={active ? 'Switch to type' : 'Switch to pen'}>
          {active ? '⌨️' : '✏️'}
        </button>
      )}
      {active ? (
        <DrawCanvas data={penData} onChange={onPenChange} height={canvasHeight}
          interactive={true} penColor={ps.color} penSize={ps.size} penTool={ps.tool} />
      ) : (
        <div className="pen-field-over" style={{ '--ph': canvasHeight + 'px' }}>
          {penData && (
            <div className="pen-bg-slot">
              <DrawCanvas data={penData} onChange={() => {}} height={canvasHeight} interactive={false} />
            </div>
          )}
          <textarea className="journal-input pen-text-float" rows={rows} placeholder={placeholder}
            value={value || ''} onChange={e => onChange(e.target.value)} />
        </div>
      )}
    </div>
  )
}

// ── Schedule slot ─────────────────────────────────────────────
function ScheduleSlot({ hour, value, penData, onTextChange, onPenChange, penMode: externalPen, penSettings }) {
  const [localPen, setLocalPen] = useState(false)
  const isGlobal = externalPen !== undefined
  const active   = isGlobal ? externalPen : localPen
  const ps = penSettings || {}
  return (
    <div className="sched-slot">
      <div className="sched-hour">{hour.label}</div>
      <div className="sched-slot-body">
        {!isGlobal && (
          <button className={`pen-toggle-btn sml${active ? ' pen-on' : ''}`}
            onClick={() => setLocalPen(p => !p)}>
            {active ? '⌨️' : '✏️'}
          </button>
        )}
        {active ? (
          <DrawCanvas data={penData} onChange={onPenChange} height={36}
            interactive={true} penColor={ps.color} penSize={ps.size} penTool={ps.tool} />
        ) : (
          <div className="pen-field-over" style={{ '--ph': '36px' }}>
            {penData && (
              <div className="pen-bg-slot">
                <DrawCanvas data={penData} onChange={() => {}} height={36} interactive={false} />
              </div>
            )}
            <input className="journal-input sched-input" type="text" placeholder="—"
              value={value || ''} onChange={e => onTextChange(e.target.value)} />
          </div>
        )}
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
    onSelectDate(ds)
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
          return (
            <button key={ds}
              className={`cal-cell${isToday ? ' cal-today' : ''}${isSel ? ' cal-selected' : ''}${isLog ? ' cal-logged' : ''}`}
              onClick={() => selectDay(d)}>
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
  const [addingTask,  setAddingTask]  = useState(false)
  const [newTaskTitle,setNewTaskTitle]= useState('')
  const [weather,    setWeather]    = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [activeTab,  setActiveTab]  = useState('priorities')

  const [globalPen,   setGlobalPen]   = useState(false)
  const [penSettings, setPenSettings] = useState({ tool: 'pen', color: 'auto', size: 'medium' })
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
        // On Android the WebView will show the OS location permission dialog
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, enableHighAccuracy: false }))
        lat = pos.coords.latitude; lon = pos.coords.longitude
        localStorage.setItem('addapp-settings', JSON.stringify({ ...s, weatherLat: lat, weatherLon: lon }))
      }
      const tempUnit = s.tempUnit || 'celsius'
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=${tempUnit}`)
      if (!r.ok) return
      const d = await r.json()
      if (d.current?.temperature_2m != null) {
        setWeather({ temp: Math.round(d.current.temperature_2m), condition: WMO[d.current.weathercode] || '🌡️' })
      }
    } catch (e) {
      // Geolocation denied or offline — clear cached coords so next open retries
      try {
        const s = JSON.parse(localStorage.getItem('addapp-settings') || '{}')
        if (e?.code === 1) { // PERMISSION_DENIED
          const { weatherLat, weatherLon, ...rest } = s
          localStorage.setItem('addapp-settings', JSON.stringify(rest))
        }
      } catch {}
    }
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

  async function addTaskFromJournal(title) {
    if (!title.trim() || !userId) return
    const { data } = await supabase.from('tasks').insert([{
      user_id: userId,
      title: title.trim(),
      status: 'todo',
      priority: 'medium',
      due_date: date,
      recurrence: 'none',
      sort_order: tasks.length * 1000,
    }]).select()
    if (data) setTasks(prev => [...prev, ...data])
    setNewTaskTitle('')
    setAddingTask(false)
  }

  return (
    <div className="entry-panel">
      {/* Entry header */}
      <div className="entry-header">
        <div>
          <div className="entry-date">{fmtDateLong(date)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {isToday && <span className="journal-today-tag">Today</span>}
            {weather   && <span className="journal-chip">{weather.condition} {weather.temp}{(JSON.parse(localStorage.getItem('addapp-settings') || '{}').tempUnit || 'celsius') === 'fahrenheit' ? '°F' : '°C'}</span>}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="journal-mode-toggle">
            <button className={`mode-btn${!globalPen ? ' active' : ''}`} onClick={() => setGlobalPen(false)}>
              ⌨️ Write
            </button>
            <button className={`mode-btn${globalPen ? ' active' : ''}`} onClick={() => setGlobalPen(true)}>
              ✏️ Pen
            </button>
          </div>
          <button className="btn-primary entry-save-btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : entry ? 'Update' : 'Save entry'}
          </button>
        </div>
      </div>
      {globalPen && <PenToolbar settings={penSettings} onChange={setPenSettings} />}

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
                penMode={globalPen}
                penSettings={penSettings}
              />
            ))}
          </div>
        </div>

        {/* Tabbed right column */}
        <div className="entry-right-col">
          <div className="journal-tabs">
            <button className={`jtab${activeTab === 'priorities' ? ' active' : ''}`} onClick={() => setActiveTab('priorities')}>Priorities</button>
            <button className={`jtab${activeTab === 'reflections' ? ' active' : ''}`} onClick={() => setActiveTab('reflections')}>Reflections</button>
          </div>

          {activeTab === 'priorities' && (
            <div className="journal-panel">
              {(healthLog?.energy_score || healthLog?.sleep_hours) && (
                <div className="journal-health-snapshot">
                  <span className="jhs-label">From Health</span>
                  <div className="jhs-chips">
                    {healthLog.energy_score && (
                      <span className="jhs-chip">⚡ Energy {healthLog.energy_score} / 100</span>
                    )}
                    {healthLog.sleep_hours && (
                      <span className="jhs-chip">😴 Sleep {healthLog.sleep_hours}h</span>
                    )}
                  </div>
                </div>
              )}
              <div className="journal-col-title">Top priorities</div>
              {priorities.map((p, i) => (
                <div key={i} className="priority-row">
                  <div className="priority-num">{i + 1}</div>
                  <PenField value={p}
                    onChange={v => setPriorities(prev => { const n = [...prev]; n[i] = v; return n })}
                    penData={priPen[i]}
                    onPenChange={v => setPriPen(prev => { const n = [...prev]; n[i] = v; return n })}
                    placeholder={`Priority ${i + 1}…`} rows={1} canvasHeight={44} penMode={globalPen} penSettings={penSettings} />
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
                  placeholder="Anything on your mind today…" rows={4} canvasHeight={100} penMode={globalPen} penSettings={penSettings} />
              </div>
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
                    placeholder="Write here…" rows={2} canvasHeight={60} penMode={globalPen} penSettings={penSettings} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tasks for today — always visible ── */}
      <div className="entry-tasks-section">
        <div className="entry-tasks-head">
          <span className="journal-col-title">Tasks for today</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {tasks.length > 0 && (
              <span className="jtask-done-count">
                {tasks.filter(t => t.status === 'done').length}/{tasks.length} done
              </span>
            )}
            <button className="jtask-add-btn" onClick={() => setAddingTask(a => !a)}>+ Add</button>
          </div>
        </div>

        {addingTask && (
          <div className="jtask-add-row">
            <input
              className="jtask-add-input"
              placeholder="Task title…"
              autoFocus
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  addTaskFromJournal(newTaskTitle)
                if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') }
              }}
            />
            <button className="jtask-add-confirm" onClick={() => addTaskFromJournal(newTaskTitle)}>✓</button>
            <button className="jtask-add-cancel" onClick={() => { setAddingTask(false); setNewTaskTitle('') }}>✕</button>
          </div>
        )}

        {tasks.length === 0 && !addingTask ? (
          <p className="journal-empty" style={{ margin: '6px 0 0' }}>No tasks for today. Hit + Add to capture one.</p>
        ) : (
          <div className="jtask-list">
            {tasks.map(task => (
              <div key={task.id} className="jtask-row" onClick={() => toggleTask(task)}>
                <div className={`jtask-check${task.status === 'done' ? ' done' : ''}`}>
                  {task.status === 'done' && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 3L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className={`jtask-title${task.status === 'done' ? ' done' : ''}`}>{task.title}</span>
                {task.priority && task.priority !== 'medium' && (
                  <span className={`jtask-priority jtask-pri-${task.priority}`}>{task.priority}</span>
                )}
              </div>
            ))}
          </div>
        )}
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

// ── Year at a Glance ──────────────────────────────────────────
function YearAtAGlance({ year, onYearChange, onSelectDate, loggedDates = new Set() }) {
  const today    = todayStr()
  const DOW_HDR  = ['S','M','T','W','T','F','S']

  const yearEntries = [...loggedDates].filter(d => d.startsWith(`${year}-`)).length

  return (
    <div className="year-glance">
      {/* Header */}
      <div className="yg-header">
        <div className="yg-header-left">
          <span className="yg-headline">Every day, all at once</span>
          <span className="yg-entry-count">{year} · {yearEntries} {yearEntries === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div className="yg-year-nav">
          <button className="cal-nav-btn" onClick={() => onYearChange(year - 1)}>‹</button>
          <span className="year-nav-label">{year}</span>
          <button className="cal-nav-btn" onClick={() => onYearChange(year + 1)}>›</button>
        </div>
      </div>

      {/* 4 × 3 mini-calendar heatmap */}
      <div className="yg-months-grid">
        {MONTH_NAMES.map((monthName, mi) => {
          const m           = mi + 1
          const numDays     = daysInMonth(year, mi)
          const firstDow    = new Date(year, mi, 1).getDay()   // 0 = Sun
          const monthPrefix = `${year}-${String(m).padStart(2,'0')}-`
          const monthCount  = [...loggedDates].filter(d => d.startsWith(monthPrefix)).length

          return (
            <div key={mi} className="yg-mini-month">
              <div className="yg-mini-header">
                <span className="yg-mini-name">{monthName.slice(0,3).toUpperCase()}</span>
                {monthCount > 0 && <span className="yg-mini-count">{monthCount}</span>}
              </div>

              {/* Su Mo Tu We Th Fr Sa */}
              <div className="yg-dow-row">
                {DOW_HDR.map((l, i) => <span key={i} className="yg-dow-label">{l}</span>)}
              </div>

              {/* Day grid */}
              <div className="yg-cal-grid">
                {/* Empty cells before month starts */}
                {Array.from({ length: firstDow }, (_, i) => (
                  <div key={`e${i}`} className="yg-cal-empty" />
                ))}
                {Array.from({ length: numDays }, (_, i) => {
                  const d        = i + 1
                  const ds       = `${monthPrefix}${String(d).padStart(2,'0')}`
                  const isLogged = loggedDates.has(ds)
                  const isToday  = ds === today
                  const isFuture = ds > today
                  return (
                    <button key={d}
                      className={[
                        'yg-cal-day',
                        isLogged  && 'yg-logged',
                        isToday   && 'yg-cal-today',
                        isFuture  && 'yg-future',
                      ].filter(Boolean).join(' ')}
                      onClick={() => !isFuture && onSelectDate(ds)}
                      disabled={isFuture}
                      title={ds}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stub ──────────────────────────────────────────────────────
// ── Quarterly helpers ─────────────────────────────────────────
function getQuarterNum(date) { return Math.floor(date.getMonth() / 3) + 1 }
function quarterKey(year, q)  { return `${year}-Q${q}` }
function quarterRange(year, q) {
  const sm = (q - 1) * 3
  return {
    start:  new Date(year, sm, 1),
    end:    new Date(year, sm + 3, 0, 23, 59, 59),
    months: [sm, sm + 1, sm + 2],
  }
}
function fmtQMins(m) {
  if (!m) return '0'
  const h = Math.floor(m / 60), rem = m % 60
  if (h === 0) return `${rem}m`
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

const Q_LABELS = ['', 'Q1', 'Q2', 'Q3', 'Q4']
const Q_RANGES = ['', 'Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec']

// ── QuarterlyView ──────────────────────────────────────────────
function QuarterlyView({ userId, loggedDates }) {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [q,    setQ]          = useState(getQuarterNum(now))
  const [entry,      setEntry]      = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [theme,      setTheme]      = useState('')
  const [goals,      setGoals]      = useState([
    { text: '', done: false }, { text: '', done: false }, { text: '', done: false },
  ])
  const [wins,       setWins]       = useState('')
  const [challenges, setChallenges] = useState('')
  const [learnings,  setLearnings]  = useState('')
  const [nextQ,      setNextQ]      = useState('')
  const [stats,      setStats]      = useState(null)

  const key = quarterKey(year, q)
  const { start, end, months } = quarterRange(year, q)

  useEffect(() => { loadEntry() }, [key, userId]) // eslint-disable-line

  async function loadEntry() {
    if (!userId) return
    setStats(null)
    const { data } = await supabase.from('journal_quarterly_reviews')
      .select('*').eq('user_id', userId).eq('quarter', key).maybeSingle()
    if (data) {
      setEntry(data)
      setTheme(data.theme || '')
      setGoals(data.goals?.length ? data.goals : [
        { text: '', done: false }, { text: '', done: false }, { text: '', done: false },
      ])
      setWins(data.wins || '')
      setChallenges(data.challenges || '')
      setLearnings(data.learnings || '')
      setNextQ(data.next_quarter || '')
    } else {
      setEntry(null); setTheme(''); setWins(''); setChallenges(''); setLearnings(''); setNextQ('')
      setGoals([{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }])
    }
    // Load quarter stats from DB
    const si = start.toISOString(), ei = end.toISOString()
    const sd = start.toISOString().split('T')[0], ed = end.toISOString().split('T')[0]
    const [rLogs, tasks, focus, journal] = await Promise.all([
      supabase.from('routine_logs').select('id').eq('user_id', userId)
        .eq('status', 'completed').gte('started_at', si).lte('started_at', ei),
      supabase.from('tasks').select('id').eq('user_id', userId)
        .eq('status', 'done').gte('updated_at', si).lte('updated_at', ei),
      supabase.from('focus_sessions').select('duration_min').eq('user_id', userId)
        .gte('started_at', si).lte('started_at', ei),
      supabase.from('journal_days').select('id').eq('user_id', userId)
        .gte('entry_date', sd).lte('entry_date', ed),
    ])
    setStats({
      routines:    rLogs.data?.length   || 0,
      tasks:       tasks.data?.length   || 0,
      focusMins:   (focus.data || []).reduce((a, s) => a + (s.duration_min || 0), 0),
      journalDays: journal.data?.length || 0,
    })
  }

  async function save() {
    if (!userId || saving) return
    setSaving(true)
    const payload = {
      user_id: userId, quarter: key,
      theme, goals, wins, challenges, learnings, next_quarter: nextQ,
      updated_at: new Date().toISOString(),
    }
    if (entry) {
      const { data } = await supabase.from('journal_quarterly_reviews')
        .update(payload).eq('id', entry.id).select().single()
      if (data) setEntry(data)
    } else {
      const { data } = await supabase.from('journal_quarterly_reviews')
        .insert(payload).select().single()
      if (data) setEntry(data)
    }
    setSaving(false)
  }

  function navQ(dir) {
    if (dir === -1) { if (q === 1) { setYear(y => y - 1); setQ(4) } else setQ(v => v - 1) }
    else            { if (q === 4) { setYear(y => y + 1); setQ(1) } else setQ(v => v + 1) }
  }

  const todayDs = now.toISOString().split('T')[0]

  return (
    <div className="qr-page">
      {/* Header */}
      <div className="entry-header">
        <div>
          <div className="entry-date" style={{ fontSize: 18 }}>Quarterly Planner</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3 }}>
            {Q_LABELS[q]} {year} · {Q_RANGES[q]}
          </div>
        </div>
        <button className="btn-primary entry-save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : entry ? 'Update' : 'Save quarter'}
        </button>
      </div>

      {/* Quarter nav */}
      <div className="qr-nav">
        <button className="cal-nav-btn" onClick={() => navQ(-1)}>‹</button>
        {[1, 2, 3, 4].map(n => (
          <button key={n} className={`qr-tab${q === n ? ' active' : ''}`} onClick={() => setQ(n)}>
            {Q_LABELS[n]}
            <span className="qr-tab-range">{Q_RANGES[n]}</span>
          </button>
        ))}
        <button className="cal-nav-btn" onClick={() => navQ(1)}>›</button>
        <span className="monthly-year-label">{year}</span>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="qr-stats-strip">
          <div className="qr-stat">
            <span className="qr-stat-val">{stats.routines}</span>
            <span className="qr-stat-lbl">routines done</span>
          </div>
          <div className="qr-stat">
            <span className="qr-stat-val">{stats.tasks}</span>
            <span className="qr-stat-lbl">tasks done</span>
          </div>
          <div className="qr-stat">
            <span className="qr-stat-val">{fmtQMins(stats.focusMins)}</span>
            <span className="qr-stat-lbl">focus time</span>
          </div>
          <div className="qr-stat">
            <span className="qr-stat-val">{stats.journalDays}</span>
            <span className="qr-stat-lbl">days journaled</span>
          </div>
        </div>
      )}

      {/* 3 mini-month calendars */}
      <div className="qr-months-row">
        {months.map(mi => {
          const dim  = daysInMonth(year, mi)
          const fdow = firstDayOfMonth(year, mi)
          const cells = []
          for (let i = 0; i < fdow; i++) cells.push(null)
          for (let d = 1; d <= dim; d++) cells.push(d)
          return (
            <div key={mi} className="qr-mini-month">
              <div className="qr-mini-head">{MONTH_NAMES[mi]}</div>
              <div className="qr-mini-grid">
                {DAY_LABELS.map(dl => <div key={dl} className="qr-mini-dow">{dl}</div>)}
                {cells.map((d, i) => {
                  if (!d) return <div key={`e-${i}`} />
                  const ds = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                  const isLogged = loggedDates.has(ds)
                  const isToday  = ds === todayDs
                  const isFuture = ds > todayDs
                  return (
                    <div key={ds} className={
                      `qr-mini-day${isLogged ? ' logged' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`
                    }>{d}</div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Theme */}
      <div className="monthly-section">
        <div className="journal-col-title">🌟 Theme for this quarter</div>
        <input className="journal-input" value={theme}
          onChange={e => setTheme(e.target.value)}
          placeholder="One word or phrase that anchors this quarter…" />
      </div>

      {/* Goals */}
      <div className="monthly-section">
        <div className="journal-col-title">🎯 3 Goals for {Q_LABELS[q]} {year}</div>
        <div className="qr-goals">
          {goals.map((g, i) => (
            <div key={i} className="qr-goal-row">
              <button
                className={`qr-goal-check${g.done ? ' done' : ''}`}
                onClick={() => setGoals(gs => gs.map((x, j) => j === i ? { ...x, done: !x.done } : x))}>
                {g.done ? '✓' : i + 1}
              </button>
              <input className="journal-input" value={g.text}
                style={g.done ? { textDecoration: 'line-through', opacity: 0.5 } : {}}
                onChange={e => setGoals(gs => gs.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                placeholder={`Goal ${i + 1}…`} />
            </div>
          ))}
        </div>
      </div>

      {/* Reflection grid */}
      <div className="monthly-two-col">
        <div className="monthly-section">
          <div className="journal-col-title">🏆 Biggest wins</div>
          <textarea className="journal-textarea" rows={5} value={wins}
            onChange={e => setWins(e.target.value)}
            placeholder="What are you most proud of this quarter?" />
        </div>
        <div className="monthly-section">
          <div className="journal-col-title">⚡ Challenges faced</div>
          <textarea className="journal-textarea" rows={5} value={challenges}
            onChange={e => setChallenges(e.target.value)}
            placeholder="What was hard? What did you struggle with?" />
        </div>
      </div>

      <div className="monthly-section">
        <div className="journal-col-title">💡 Key learnings</div>
        <textarea className="journal-textarea" rows={4} value={learnings}
          onChange={e => setLearnings(e.target.value)}
          placeholder="What did you learn about yourself, your work, your patterns?" />
      </div>

      <div className="monthly-section">
        <div className="journal-col-title">➡️ Carrying into next quarter</div>
        <textarea className="journal-textarea" rows={4} value={nextQ}
          onChange={e => setNextQ(e.target.value)}
          placeholder="What intentions, habits, or focus areas do you want to take forward?" />
      </div>
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

// ── Pinch-to-zoom hook (mobile) ──────────────────────────────
function usePinchZoom(ref) {
  const lastDist = useRef(null)
  const scale    = useRef(1)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    // Apply zoom to the scrollable inner area, not the overflow:hidden wrapper
    const getTarget = () => container.querySelector('.journal-main') || container

    function dist(t) {
      const dx = t[0].clientX - t[1].clientX
      const dy = t[0].clientY - t[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    function onTouchStart(e) {
      if (e.touches.length === 2) lastDist.current = dist(e.touches)
    }

    function onTouchMove(e) {
      if (e.touches.length !== 2 || lastDist.current === null) return
      e.preventDefault()
      const d = dist(e.touches)
      const delta = d / lastDist.current
      // min 1 (no zoom-out past native), max 3
      scale.current = Math.min(Math.max(scale.current * delta, 1), 3)
      const target = getTarget()
      target.style.zoom = scale.current
      lastDist.current = d
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) {
        lastDist.current = null
        // Snap back to 1 if barely zoomed
        if (scale.current < 1.08) {
          scale.current = 1
          const target = getTarget()
          target.style.zoom = ''
        }
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove',  onTouchMove,  { passive: false })
    container.addEventListener('touchend',   onTouchEnd)
    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove',  onTouchMove)
      container.removeEventListener('touchend',   onTouchEnd)
    }
  }, [ref])
}

export default function Journal({ userId }) {
  const [view,           setView]           = useState('daily')
  const [selectedDate,   setSelectedDate]   = useState(todayStr())
  const [weekStart,      setWeekStart]      = useState(() => getWeekStart(todayStr()))
  const [loggedDates,    setLoggedDates]    = useState(new Set())
  const [healthLog,      setHealthLog]      = useState(null)
  const [monthlySubView, setMonthlySubView] = useState('review')
  const [monthlyMonth,   setMonthlyMonth]   = useState(() => todayStr().slice(0, 7))
  const [yearlyYear,     setYearlyYear]     = useState(() => new Date().getFullYear())
  // Collapse calendar by default on native (tablet/phone) to save space
  const [calCollapsed,   setCalCollapsed]   = useState(() => {
    try { return window.Capacitor?.isNativePlatform() ?? false } catch { return false }
  })

  const journalBodyRef = useRef(null)
  usePinchZoom(journalBodyRef)

  function openMonthly(month, subView) {
    setMonthlyMonth(month)
    setMonthlySubView(subView)
    setView('monthly')
  }

  function openDaily(ds) {
    setSelectedDate(ds)
    setWeekStart(getWeekStart(ds))
    setView('daily')
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

      <div className="journal-body" ref={journalBodyRef}>
        {/* Left: calendar (shown on daily + weekly view) */}
        {(view === 'daily' || view === 'weekly') && (
          <div className={`journal-cal-wrap${calCollapsed ? ' cal-collapsed' : ''}`}>
            <button
              className="cal-collapse-btn"
              onClick={() => setCalCollapsed(c => !c)}
              title={calCollapsed ? 'Show calendar' : 'Hide calendar'}
            >
              {calCollapsed ? '📅' : '×'}
            </button>
            {!calCollapsed && (
              <MonthCalendar
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                loggedDates={loggedDates}
              />
            )}
          </div>
        )}

        {/* Right: content */}
        <div className="journal-main">
          {view === 'daily'     && <DailyEntry key={selectedDate} date={selectedDate} userId={userId} healthLog={healthLog} onLogged={markLogged} onOpenMonthly={openMonthly} />}
          {view === 'weekly'    && <WeeklyView weekStart={weekStart} userId={userId} />}
          {view === 'monthly'   && <MonthlyPage month={monthlyMonth} onMonthChange={setMonthlyMonth} subView={monthlySubView} onSubViewChange={setMonthlySubView} userId={userId} />}
          {view === 'quarterly' && <QuarterlyView userId={userId} loggedDates={loggedDates} />}
          {view === 'yearly'    && <YearAtAGlance year={yearlyYear} onYearChange={setYearlyYear} onSelectDate={openDaily} loggedDates={loggedDates} />}
        </div>
      </div>
    </div>
  )
}
