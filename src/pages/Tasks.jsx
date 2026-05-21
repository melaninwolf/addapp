import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { addMAM, MAM_TASK } from '../xp'
import './Tasks.css'

// ─── Constants ───────────────────────────────────────────────
const DEFAULT_CATS = [
  { name: 'Projects',  color: '#818cf8' },
  { name: 'Personal',  color: '#4ade80' },
  { name: 'Household', color: '#fbbf24' },
  { name: 'Other',     color: '#94a3b8' },
]

const STATUSES = [
  { key: 'backlog',     label: 'Backlog',      accent: 'var(--text3)' },
  { key: 'todo',        label: 'To Do',        accent: 'var(--accent)' },
  { key: 'in_progress', label: 'In Progress',  accent: 'var(--amber)' },
  { key: 'done',        label: 'Done',         accent: 'var(--green)' },
]

const PRIORITIES = [
  { key: 'high',   label: 'High',   color: '#ef4444' },
  { key: 'medium', label: 'Medium', color: '#f59e0b' },
  { key: 'low',    label: 'Low',    color: '#4ade80' },
]

const RECURRENCES = [
  { key: 'none',    label: 'None' },
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

function nextDueDate(current, recurrence) {
  if (!current || recurrence === 'none') return null
  const today = new Date(); today.setHours(0, 0, 0, 0)

  if (recurrence === 'daily') {
    // Always schedule for tomorrow from today, not from (possibly overdue) due date
    const next = new Date(today)
    next.setDate(next.getDate() + 1)
    return next.toISOString().split('T')[0]
  }

  if (recurrence === 'weekly') {
    // Keep the original weekday anchor, but skip forward until future
    const next = new Date(current + 'T00:00:00')
    next.setDate(next.getDate() + 7)
    while (next <= today) next.setDate(next.getDate() + 7)
    return next.toISOString().split('T')[0]
  }

  if (recurrence === 'monthly') {
    // Keep the original day-of-month anchor, but skip to next future month
    const next = new Date(current + 'T00:00:00')
    next.setMonth(next.getMonth() + 1)
    while (next <= today) next.setMonth(next.getMonth() + 1)
    return next.toISOString().split('T')[0]
  }

  return null
}

function priColor(p) {
  return PRIORITIES.find(x => x.key === p)?.color || '#94a3b8'
}

function formatDue(d) {
  if (!d) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const date  = new Date(d + 'T00:00:00')
  const diff  = Math.round((date - today) / 86400000)
  if (diff === 0)  return 'Today'
  if (diff === 1)  return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff < 0)    return `${Math.abs(diff)}d overdue`
  if (diff < 7)    return `${diff}d`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isPastDue(d) {
  if (!d) return false
  const today = new Date(); today.setHours(0,0,0,0)
  return new Date(d + 'T00:00:00') < today
}

// ─── Task Form Modal ─────────────────────────────────────────
function TaskFormModal({ open, onClose, onSave, onDelete, task, categories, activeProjects, defaultStatus }) {
  const isEdit = !!task
  const [title,      setTitle]      = useState('')
  const [status,     setStatus]     = useState('todo')
  const [priority,   setPriority]   = useState('medium')
  const [categoryId, setCategoryId] = useState('')
  const [projectId,  setProjectId]  = useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [dueTime,    setDueTime]    = useState('')
  const [notes,      setNotes]      = useState('')
  const [recurrence, setRecurrence] = useState('none')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setTitle(task.title || '')
      setStatus(task.status || 'todo')
      setPriority(task.priority || 'medium')
      setCategoryId(task.category_id || '')
      setProjectId(task.project_id || '')
      setDueDate(task.due_date || '')
      setDueTime(task.due_time || '')
      setNotes(task.notes || '')
      setRecurrence(task.recurrence || 'none')
    } else {
      setTitle(''); setStatus(defaultStatus || 'todo'); setPriority('medium')
      setCategoryId(categories[0]?.id || ''); setProjectId(''); setDueDate(''); setDueTime(''); setNotes(''); setRecurrence('none')
    }
  }, [open, task]) // eslint-disable-line

  if (!open) return null

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), status, priority, category_id: categoryId || null, project_id: projectId || null, due_date: dueDate || null, due_time: dueTime || null, notes: notes.trim() || null, recurrence })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <span className="modal-title-text">{isEdit ? 'Edit task' : 'New task'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <input className="modal-input" style={{ fontSize: 15, fontWeight: 600 }}
            placeholder="Task title" value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />

          <div className="modal-field">
            <label className="modal-label">Priority</label>
            <div className="pri-picker">
              {PRIORITIES.map(p => (
                <button key={p.key}
                  className={`pri-btn${priority === p.key ? ' active' : ''}`}
                  style={{ '--pri': p.color }}
                  type="button"
                  onClick={() => setPriority(p.key)}>
                  <span className="pri-dot" style={{ background: p.color }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-row" style={{ gap: 8 }}>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Status</label>
              <select className="modal-input modal-select" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Category</label>
              <select className="modal-input modal-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {activeProjects?.length > 0 && (
            <div className="modal-field">
              <label className="modal-label">Project</label>
              <select className="modal-input modal-select" value={projectId}
                onChange={e => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {activeProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="modal-field">
            <label className="modal-label">Due date & time</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" className="modal-input" value={dueDate}
                onChange={e => setDueDate(e.target.value)} style={{ flex: 1, maxWidth: 200 }} />
              {dueDate && (
                <input type="time" className="modal-input" value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  style={{ flex: 1, maxWidth: 150 }} />
              )}
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Repeat</label>
            <div className="pri-picker">
              {RECURRENCES.map(r => (
                <button key={r.key}
                  className={`pri-btn${recurrence === r.key ? ' active' : ''}`}
                  type="button"
                  onClick={() => setRecurrence(r.key)}>
                  {r.key !== 'none' && <span style={{ marginRight: 4 }}>🔄</span>}
                  {r.label}
                </button>
              ))}
            </div>
            {recurrence !== 'none' && !dueDate && (
              <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 6, marginBottom: 0 }}>
                ⚠️ Set a due date so the next occurrence can be scheduled automatically.
              </p>
            )}
            {recurrence !== 'none' && dueDate && (
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, marginBottom: 0 }}>
                Next after completion: {formatDue(nextDueDate(dueDate, recurrence))}
              </p>
            )}
          </div>

          <textarea className="modal-input modal-textarea"
            placeholder="Notes (optional)" rows={3}
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="modal-footer">
          {isEdit && onDelete && (
            <button className="modal-btn modal-btn-delete" onClick={() => onDelete(task.id)}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn-save" onClick={handleSave}
            disabled={!title.trim() || saving}>
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Task Card ───────────────────────────────────────────────
function TaskCard({ task, categories, onEdit, onToggleDone, onDragStart, onDragEnd, isDragging }) {
  const cat  = categories.find(c => c.id === task.category_id)
  const late = isPastDue(task.due_date) && task.status !== 'done'
  const done = task.status === 'done'

  return (
    <div
      className={`task-card${isDragging ? ' tc-dragging' : ''}${done ? ' tc-done' : ''}`}
      draggable
      style={{ borderLeft: `3px solid ${cat?.color || 'var(--border2)'}` }}
      onDragStart={e => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(task)}
    >
      <div className="tc-top">
        <button
          className={`tc-check${done ? ' tc-check-done' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleDone(task) }}
          title={done ? 'Mark incomplete' : 'Mark done'}
        >
          {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 3L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <div className="tc-title">{task.title}</div>
      </div>
      {task.recurrence && task.recurrence !== 'none' && (
        <span className="tc-chip tc-recur" title={task.recurrence}>🔄 {task.recurrence}</span>
      )}
      {(task.due_date || cat) && (
        <div className="tc-meta">
          {task.due_date && (
            <span className={`tc-due${late ? ' tc-late' : ''}`}>
              📅 {formatDue(task.due_date)}
            </span>
          )}
          {cat && (
            <span className="tc-cat-badge"
              style={{ color: cat.color, background: cat.color + '18', border: `1px solid ${cat.color}40` }}>
              {cat.name}
            </span>
          )}
        </div>
      )}
      {task.notes && <div className="tc-notes">{task.notes}</div>}
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────
function KanbanColumn({ status, tasks, categories, onAddTask, onEdit, onToggleDone, dragId, dragTarget, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const colTasks = tasks
    .filter(t => t.status === status.key)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  const isActive = dragTarget?.status === status.key

  return (
    <div className="kb-col"
      onDragOver={e => { e.preventDefault(); if (!e.target.closest('.tc-wrap')) onDragOver(status.key, null) }}
      onDrop={e => { e.preventDefault(); if (!e.target.closest('.tc-wrap')) onDrop(status.key, null) }}
    >
      <div className="kb-col-head" style={{ '--col-accent': status.accent }}>
        <div className="kb-col-accent-bar" />
        <span className="kb-col-title">{status.label}</span>
        <span className="kb-col-count">{colTasks.length}</span>
      </div>

      <div className="kb-col-body">
        {colTasks.map(task => (
          <div key={task.id}>
            {dragId && isActive && dragTarget.insertBeforeId === task.id && (
              <div className="kb-drop-line" />
            )}
            <div className="tc-wrap"
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(status.key, task.id) }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(status.key, task.id) }}>
              <TaskCard
                task={task}
                categories={categories}
                onEdit={onEdit}
                onToggleDone={onToggleDone}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={dragId === task.id}
              />
            </div>
          </div>
        ))}

        {dragId && isActive && dragTarget.insertBeforeId === null && (
          <div className="kb-drop-line" />
        )}

        {colTasks.length === 0 && !dragId && (
          <div className="kb-empty">No tasks</div>
        )}

        <button className="kb-add-btn" onClick={() => onAddTask(status.key)}>
          + Add task
        </button>
      </div>
    </div>
  )
}

// ─── Daily List View ──────────────────────────────────────────
function DailyListView({ tasks, categories, onToggleDone, onEdit, onAdd }) {
  const today = new Date(); today.setHours(0,0,0,0)

  const overdue = tasks.filter(t => t.status !== 'done' && isPastDue(t.due_date))
  const dueToday = tasks.filter(t => {
    if (t.status === 'done' || !t.due_date) return false
    const d = new Date(t.due_date + 'T00:00:00')
    return d.getTime() === today.getTime()
  })
  const noDate = tasks.filter(t => t.status !== 'done' && !t.due_date)
  const done = tasks.filter(t => t.status === 'done' && t.due_date === new Date().toISOString().split('T')[0])

  function DLRow({ task }) {
    const cat  = categories.find(c => c.id === task.category_id)
    const done = task.status === 'done'
    return (
      <div className="dl-row">
        <button className={`dl-check${done ? ' done' : ''}`}
          onClick={() => onToggleDone(task)}>
          {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 3L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <div className="dl-info" onClick={() => onEdit(task)}>
          <span className={`dl-title${done ? ' done' : ''}`}>{task.title}</span>
          {task.recurrence && task.recurrence !== 'none' && (
            <span className="dl-recur" title={`Repeats ${task.recurrence}`}>🔄</span>
          )}
          {cat && <span className="dl-cat" style={{ color: cat.color, background: cat.color + '18' }}>{cat.name}</span>}
          {task.due_time && <span className="dl-time">⏰ {task.due_time.slice(0,5)}</span>}
        </div>
        {task.priority === 'high' && <span className="dl-pri high">!</span>}
      </div>
    )
  }

  function Section({ label, items, color }) {
    if (items.length === 0) return null
    return (
      <div className="dl-section">
        <div className="dl-section-label" style={{ color }}>{label} <span className="dl-section-count">{items.length}</span></div>
        {items.map(t => <DLRow key={t.id} task={t} />)}
      </div>
    )
  }

  const isEmpty = overdue.length + dueToday.length + noDate.length + done.length === 0

  return (
    <div className="daily-list">
      {isEmpty ? (
        <div className="dl-empty">
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>Nothing due today</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Enjoy the clear schedule — or add something.</div>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={onAdd}>+ Add task</button>
        </div>
      ) : (
        <>
          <Section label="Overdue" items={overdue} color="#ef4444" />
          <Section label="Due today" items={dueToday} color="var(--accent)" />
          <Section label="No date" items={noDate} color="var(--text3)" />
          <Section label="Done today" items={done} color="var(--green, #22c55e)" />
          <button className="dl-add-btn" onClick={onAdd}>+ Add task</button>
        </>
      )}
    </div>
  )
}

// ─── Tasks Page ───────────────────────────────────────────────
export default function Tasks({ userId }) {
  const [tasks,          setTasks]          = useState([])
  const [categories,     setCategories]     = useState([])
  const [activeProjects, setActiveProjects] = useState([])
  const [loading,        setLoading]        = useState(true)
  const [taskView,    setTaskView]    = useState('kanban') // 'kanban' | 'daily'
  const [filter,      setFilter]      = useState('all')
  const [showForm,    setShowForm]    = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [defStatus,   setDefStatus]   = useState('todo')
  const [addingCat,   setAddingCat]   = useState(false)
  const [newCatName,  setNewCatName]  = useState('')
  const [dragId,      setDragId]      = useState(null)
  const [dragTarget,  setDragTarget]  = useState(null)

  useEffect(() => { if (userId) loadAll() }, [userId]) // eslint-disable-line

  async function loadAll() {
    setLoading(true)
    const [catRes, taskRes, projRes] = await Promise.all([
      supabase.from('task_categories').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('tasks').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('projects').select('id, name, color').eq('user_id', userId)
        .in('status', ['not_started', 'active', 'hold']),
    ])

    let cats = catRes.data || []
    if (cats.length === 0) {
      const toInsert = DEFAULT_CATS.map((c, i) => ({ ...c, user_id: userId, sort_order: i * 10 }))
      const { data } = await supabase.from('task_categories').insert(toInsert).select()
      cats = data || []
    }

    setCategories(cats)
    setTasks(taskRes.data || [])
    setActiveProjects(projRes.data || [])
    setLoading(false)
  }

  async function saveTask(payload) {
    if (!userId) return
    if (editingTask) {
      const { data, error } = await supabase
        .from('tasks').update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingTask.id).eq('user_id', userId).select()
      if (!error && data) setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...data[0] } : t))
    } else {
      const colTasks = tasks.filter(t => t.status === (payload.status || 'todo'))
      const maxOrder = colTasks.reduce((m, t) => Math.max(m, t.sort_order || 0), -1000)
      const { data, error } = await supabase
        .from('tasks').insert([{ ...payload, user_id: userId, sort_order: maxOrder + 1000 }]).select()
      if (!error && data) setTasks(prev => [...prev, ...data])
    }
    setEditingTask(null)
  }

  async function deleteTask(id) {
    await supabase.from('tasks').delete().eq('id', id).eq('user_id', userId)
    setTasks(prev => prev.filter(t => t.id !== id))
    setEditingTask(null); setShowForm(false)
  }

  async function updateTaskField(id, payload) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...payload } : t))
    await supabase.from('tasks').update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId)
  }

  async function handleToggleDone(task) {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    if (newStatus === 'done') {
      addMAM(MAM_TASK)
      // Spawn next occurrence for recurring tasks
      if (task.recurrence && task.recurrence !== 'none' && task.due_date) {
        const nextDate = nextDueDate(task.due_date, task.recurrence)
        if (nextDate) {
          const { data } = await supabase.from('tasks').insert([{
            user_id: userId,
            title: task.title,
            status: 'todo',
            priority: task.priority,
            category_id: task.category_id,
            project_id: task.project_id,
            due_date: nextDate,
            due_time: task.due_time,
            notes: task.notes,
            recurrence: task.recurrence,
            sort_order: (task.sort_order || 0) + 1,
          }]).select()
          if (data) setTasks(prev => [...prev, ...data])
        }
      }
    }
    updateTaskField(task.id, { status: newStatus })
  }

  async function addCategory(name) {
    if (!name.trim()) return
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0)
    const palette  = ['#c084fc','#60a5fa','#34d399','#fb923c','#f87171','#a78bfa','#38bdf8']
    const color    = palette[categories.length % palette.length]
    const { data } = await supabase
      .from('task_categories').insert([{ name: name.trim(), color, user_id: userId, sort_order: maxOrder + 10 }]).select()
    if (data) setCategories(prev => [...prev, ...data])
  }

  async function deleteCategory(id) {
    await supabase.from('task_categories').delete().eq('id', id).eq('user_id', userId)
    setCategories(prev => prev.filter(c => c.id !== id))
    setTasks(prev => prev.map(t => t.category_id === id ? { ...t, category_id: null } : t))
    if (filter === id) setFilter('all')
  }

  function handleDragStart(e, taskId) {
    setDragId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDragId(null); setDragTarget(null)
  }

  function handleDragOver(status, insertBeforeId) {
    setDragTarget(prev => {
      if (prev?.status === status && prev?.insertBeforeId === insertBeforeId) return prev
      return { status, insertBeforeId }
    })
  }

  function handleDrop(status, insertBeforeId) {
    if (!dragId) return
    const colTasks = tasks
      .filter(t => t.status === status && t.id !== dragId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    let newOrder
    if (insertBeforeId === null) {
      newOrder = colTasks.length > 0 ? (colTasks[colTasks.length - 1].sort_order || 0) + 1000 : 0
    } else {
      const idx = colTasks.findIndex(t => t.id === insertBeforeId)
      if (idx === 0) {
        newOrder = (colTasks[0].sort_order || 0) - 500
      } else if (idx > 0) {
        newOrder = ((colTasks[idx - 1].sort_order || 0) + (colTasks[idx].sort_order || 0)) / 2
      } else {
        newOrder = colTasks.length > 0 ? (colTasks[colTasks.length - 1].sort_order || 0) + 1000 : 0
      }
    }

    updateTaskField(dragId, { status, sort_order: newOrder })
    setDragId(null); setDragTarget(null)
  }

  const filteredTasks = filter === 'all'       ? tasks
                      : filter === 'recurring' ? tasks.filter(t => t.recurrence && t.recurrence !== 'none')
                      : tasks.filter(t => t.category_id === filter)
  const totalDone     = tasks.filter(t => t.status === 'done').length

  function openAdd(status) { setEditingTask(null); setDefStatus(status); setShowForm(true) }
  function openEdit(task)  { setEditingTask(task); setShowForm(true) }

  // Count tasks done this week
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0,0,0,0)
  const doneThisWeek = tasks.filter(t => t.status === 'done' && new Date(t.updated_at) >= weekStart).length

  return (
    <div className="tasks-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">
            {doneThisWeek > 0
              ? `${doneThisWeek} done this week`
              : 'Your master task board.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="task-view-toggle">
            <button className={`tvt-btn${taskView === 'kanban' ? ' active' : ''}`}
              onClick={() => setTaskView('kanban')}>Board</button>
            <button className={`tvt-btn${taskView === 'daily' ? ' active' : ''}`}
              onClick={() => setTaskView('daily')}>Daily</button>
          </div>
          <button className="cal-add-btn" onClick={() => openAdd('todo')}>+ Add task</button>
        </div>
      </div>

      <div className="cat-bar">
        <button className={`cat-pill${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}>
          All
          <span className="cat-pill-count">{tasks.length}</span>
        </button>

        {tasks.some(t => t.recurrence && t.recurrence !== 'none') && (
          <button
            className={`cat-pill${filter === 'recurring' ? ' active' : ''}`}
            style={filter === 'recurring' ? { borderColor: '#818cf8', color: '#818cf8', background: '#818cf818' } : {}}
            onClick={() => setFilter(f => f === 'recurring' ? 'all' : 'recurring')}>
            🔄 Recurring
            <span className="cat-pill-count">
              {tasks.filter(t => t.recurrence && t.recurrence !== 'none').length}
            </span>
          </button>
        )}

        {categories.map(c => (
          <div key={c.id} className="cat-pill-wrap">
            <button
              className={`cat-pill${filter === c.id ? ' active' : ''}`}
              style={filter === c.id ? { borderColor: c.color, color: c.color, background: c.color + '18' } : {}}
              onClick={() => setFilter(f => f === c.id ? 'all' : c.id)}>
              <span className="cat-pill-dot" style={{ background: c.color }} />
              {c.name}
              <span className="cat-pill-count">{tasks.filter(t => t.category_id === c.id).length}</span>
            </button>
            <button className="cat-del-btn" title="Delete category"
              onClick={() => deleteCategory(c.id)}>×</button>
          </div>
        ))}

        {addingCat ? (
          <div className="cat-add-wrap">
            <input className="cat-add-input" autoFocus placeholder="Name…"
              value={newCatName} onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { addCategory(newCatName); setNewCatName(''); setAddingCat(false) }
                if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') }
              }} />
            <button className="cat-add-confirm"
              onClick={() => { addCategory(newCatName); setNewCatName(''); setAddingCat(false) }}>✓</button>
            <button className="cat-add-cancel" onClick={() => { setAddingCat(false); setNewCatName('') }}>✕</button>
          </div>
        ) : (
          <button className="cat-new-btn" onClick={() => setAddingCat(true)}>+ Category</button>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 14, padding: '3rem 0', textAlign: 'center' }}>Loading…</div>
      ) : taskView === 'daily' ? (
        <DailyListView
          tasks={tasks}
          categories={categories}
          onToggleDone={handleToggleDone}
          onEdit={openEdit}
          onAdd={() => openAdd('todo')}
        />
      ) : (
        <div className="kb-board"
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragTarget(null) }}>
          {STATUSES.map(status => (
            <KanbanColumn
              key={status.key}
              status={status}
              tasks={filteredTasks}
              categories={categories}
              onAddTask={openAdd}
              onEdit={openEdit}
              onToggleDone={handleToggleDone}
              dragId={dragId}
              dragTarget={dragTarget}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}

      <TaskFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingTask(null) }}
        onSave={saveTask}
        onDelete={deleteTask}
        task={editingTask}
        categories={categories}
        activeProjects={activeProjects}
        defaultStatus={defStatus}
      />
    </div>
  )
}
