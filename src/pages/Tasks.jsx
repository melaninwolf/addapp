import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
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
function TaskFormModal({ open, onClose, onSave, onDelete, task, categories, defaultStatus }) {
  const isEdit = !!task
  const [title,      setTitle]      = useState('')
  const [status,     setStatus]     = useState('todo')
  const [priority,   setPriority]   = useState('medium')
  const [categoryId, setCategoryId] = useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setTitle(task.title || '')
      setStatus(task.status || 'todo')
      setPriority(task.priority || 'medium')
      setCategoryId(task.category_id || '')
      setDueDate(task.due_date || '')
      setNotes(task.notes || '')
    } else {
      setTitle(''); setStatus(defaultStatus || 'todo'); setPriority('medium')
      setCategoryId(categories[0]?.id || ''); setDueDate(''); setNotes('')
    }
  }, [open, task]) // eslint-disable-line

  if (!open) return null

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), status, priority, category_id: categoryId || null, due_date: dueDate || null, notes: notes.trim() || null })
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
          {/* Title */}
          <input className="modal-input" style={{ fontSize: 15, fontWeight: 600 }}
            placeholder="Task title" value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />

          {/* Priority */}
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

          {/* Status + Category */}
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

          {/* Due date */}
          <div className="modal-field">
            <label className="modal-label">Due date</label>
            <input type="date" className="modal-input" value={dueDate}
              onChange={e => setDueDate(e.target.value)} style={{ maxWidth: 200 }} />
          </div>

          {/* Notes */}
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
function TaskCard({ task, categories, onEdit, onDragStart, onDragEnd, isDragging }) {
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
        <div className="tc-pri-dot" style={{ background: priColor(task.priority) }} />
        <div className="tc-title">{task.title}</div>
      </div>
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
function KanbanColumn({ status, tasks, categories, onAddTask, onEdit, dragId, dragTarget, onDragStart, onDragEnd, onDragOver, onDrop }) {
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
            {/* Drop indicator before this card */}
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
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={dragId === task.id}
              />
            </div>
          </div>
        ))}

        {/* Drop indicator at end */}
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

// ─── Tasks Page ───────────────────────────────────────────────
export default function Tasks({ userId }) {
  const [tasks,       setTasks]       = useState([])
  const [categories,  setCategories]  = useState([])
  const [loading,     setLoading]     = useState(true)
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
    const [catRes, taskRes] = await Promise.all([
      supabase.from('task_categories').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('tasks').select('*').eq('user_id', userId).order('sort_order'),
    ])

    let cats = catRes.data || []
    if (cats.length === 0) {
      const toInsert = DEFAULT_CATS.map((c, i) => ({ ...c, user_id: userId, sort_order: i * 10 }))
      const { data } = await supabase.from('task_categories').insert(toInsert).select()
      cats = data || []
    }

    setCategories(cats)
    setTasks(taskRes.data || [])
    setLoading(false)
  }

  // ── CRUD ─────────────────────────────────────────────────────
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

  // ── Drag & Drop ───────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────
  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.category_id === filter)
  const totalDone     = tasks.filter(t => t.status === 'done').length

  function openAdd(status) { setEditingTask(null); setDefStatus(status); setShowForm(true) }
  function openEdit(task)  { setEditingTask(task); setShowForm(true) }

  return (
    <div className="tasks-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">
            {tasks.length > 0
              ? `${totalDone} of ${tasks.length} done`
              : 'Your master task board.'}
          </p>
        </div>
        <button className="cal-add-btn" onClick={() => openAdd('todo')}>+ Add task</button>
      </div>

      {/* Category filter bar */}
      <div className="cat-bar">
        <button className={`cat-pill${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}>
          All
          <span className="cat-pill-count">{tasks.length}</span>
        </button>

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
        defaultStatus={defStatus}
      />
    </div>
  )
}
