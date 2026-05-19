import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import './Projects.css'

export const PROJECT_STATUSES = [
  { key: 'not_started', label: 'Not started', color: '#378ADD' },
  { key: 'active',      label: 'Active',      color: '#1D9E75' },
  { key: 'hold',        label: 'On hold',     color: '#EF9F27' },
  { key: 'done',        label: 'Done',        color: '#639922' },
  { key: 'dnf',         label: 'DNF',         color: '#E24B4A' },
]

export const PROJECT_COLORS = [
  '#7F77DD', '#1D9E75', '#378ADD', '#D4537E',
  '#EF9F27', '#E24B4A', '#5DCAA5', '#888780',
]

const SORT_OPTIONS = [
  { key: 'created',    label: 'Date created' },
  { key: 'end_date',   label: 'Due date' },
  { key: 'start_date', label: 'Start date' },
  { key: 'status',     label: 'Status' },
  { key: 'tasks',      label: 'Task count' },
]

export function statusInfo(key) {
  return PROJECT_STATUSES.find(s => s.key === key) || PROJECT_STATUSES[0]
}

export function milestoneProgress(milestones) {
  if (!milestones?.length) return { total: 0, done: 0, pct: 0 }
  const total = milestones.length
  const done  = milestones.filter(m => m.done).length
  return { total, done, pct: Math.round((done / total) * 100) }
}

function fmtDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Project Form Modal ────────────────────────────────────────
function ProjectFormModal({ open, onClose, onSave, onDelete, initial, triggerRoutines }) {
  const isEdit = !!initial
  const [name,         setName]         = useState('')
  const [color,        setColor]        = useState(PROJECT_COLORS[0])
  const [status,       setStatus]       = useState('not_started')
  const [startDate,    setStartDate]    = useState('')
  const [endDate,      setEndDate]      = useState('')
  const [requirements, setRequirements] = useState('')
  const [triggerId,    setTriggerId]    = useState('')
  const [saving,       setSaving]       = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name || '')
      setColor(initial.color || PROJECT_COLORS[0])
      setStatus(initial.status || 'not_started')
      setStartDate(initial.start_date || '')
      setEndDate(initial.end_date || '')
      setRequirements(initial.requirements || '')
      setTriggerId(initial.trigger_id || '')
    } else {
      setName(''); setColor(PROJECT_COLORS[0]); setStatus('not_started')
      setStartDate(''); setEndDate(''); setRequirements(''); setTriggerId('')
    }
  }, [open, initial])

  if (!open) return null

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        name:         name.trim(),
        color,
        status,
        start_date:   startDate    || null,
        end_date:     endDate      || null,
        requirements: requirements.trim() || null,
        trigger_id:   triggerId    || null,
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title-text">{isEdit ? 'Edit project' : 'New project'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Color */}
          <div className="modal-field">
            <label className="modal-label">Color</label>
            <div className="proj-color-picker">
              {PROJECT_COLORS.map(c => (
                <button
                  key={c}
                  className={`proj-color-dot${color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="modal-field">
            <label className="modal-label">Name</label>
            <input
              className="modal-input"
              placeholder="Project name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>

          {/* Status */}
          <div className="modal-field">
            <label className="modal-label">Status</label>
            <div className="proj-status-picker">
              {PROJECT_STATUSES.map(s => (
                <button
                  key={s.key}
                  className={`proj-status-btn${status === s.key ? ' active' : ''}`}
                  style={{ '--s-color': s.color }}
                  onClick={() => setStatus(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="modal-row">
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Start date</label>
              <input type="date" className="modal-input" value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">End date</label>
              <input type="date" className="modal-input" value={endDate}
                onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>

          {/* Trigger */}
          <div className="modal-field">
            <label className="modal-label">Activation trigger</label>
            <select className="modal-input" value={triggerId}
              onChange={e => setTriggerId(e.target.value)}>
              <option value="">No trigger</option>
              {triggerRoutines.map(r => (
                <option key={r.id} value={r.id}>{r.emoji} {r.name}</option>
              ))}
            </select>
          </div>

          {/* Requirements */}
          <div className="modal-field">
            <label className="modal-label">Requirements</label>
            <textarea
              className="modal-input modal-textarea"
              placeholder="What needs to be done…"
              rows={3}
              value={requirements}
              onChange={e => setRequirements(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          {isEdit && onDelete && (
            <button className="modal-btn modal-btn-delete" onClick={onDelete}>Delete</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn-save"
            onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Project Card (grid) ───────────────────────────────────────
function ProjectCard({ project, onClick }) {
  const s = statusInfo(project.status)
  const { pct, done, total } = milestoneProgress(project.milestones)
  return (
    <div className="proj-card" onClick={onClick}>
      <div className="proj-card-top">
        <div className="proj-dot" style={{ background: project.color }} />
        <div className="proj-card-name">{project.name}</div>
        <span className="proj-badge" style={{ '--badge-color': s.color }}>{s.label}</span>
      </div>
      {total > 0 && (
        <>
          <div className="proj-prog-track" style={{ marginTop: 10 }}>
            <div className="proj-prog-fill" style={{ width: pct + '%', background: project.color }} />
          </div>
          <div className="proj-card-sub">{done}/{total} milestones · {pct}%</div>
        </>
      )}
      <div className="proj-card-meta">
        {project.end_date && <span>Due {fmtDate(project.end_date)}</span>}
        {project._taskCount > 0 && <span>{project._taskCount} task{project._taskCount !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}

// ── Project Row (list) ────────────────────────────────────────
function ProjectRow({ project, onClick }) {
  const s = statusInfo(project.status)
  const { pct, total } = milestoneProgress(project.milestones)
  return (
    <div className="proj-row" onClick={onClick}>
      <div className="proj-dot" style={{ background: project.color }} />
      <div className="proj-row-name">{project.name}</div>
      <span className="proj-badge" style={{ '--badge-color': s.color }}>{s.label}</span>
      <div className="proj-row-prog">
        <div className="proj-prog-track">
          <div className="proj-prog-fill" style={{ width: pct + '%', background: project.color }} />
        </div>
        <span className="proj-prog-pct">{total > 0 ? pct + '%' : '—'}</span>
      </div>
      <span className="proj-row-date">{fmtDate(project.start_date) || '—'}</span>
      <span className="proj-row-date">{fmtDate(project.end_date)   || '—'}</span>
      <span className="proj-row-tasks">{project._taskCount || 0}</span>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function Projects({ userId }) {
  const navigate = useNavigate()
  const [projects,        setProjects]       = useState([])
  const [taskCounts,      setTaskCounts]     = useState({})
  const [triggerRoutines, setTriggers]       = useState([])
  const [loading,         setLoading]        = useState(true)
  const [view,            setView]           = useState(() => localStorage.getItem('addapp_projects_view') || 'grid')
  const [filterStatus,    setFilterStatus]   = useState('all')
  const [sortBy,          setSortBy]         = useState('created')
  const [sortDir,         setSortDir]        = useState('desc')
  const [showModal,       setShowModal]      = useState(false)
  const [editingProject,  setEditingProject] = useState(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    Promise.all([
      supabase.from('projects').select('*, milestones(id, done)').eq('user_id', userId),
      supabase.from('tasks').select('id, project_id').eq('user_id', userId).not('project_id', 'is', null),
      supabase.from('routines').select('id, name, emoji').eq('user_id', userId).eq('type', 'trigger'),
    ]).then(([projRes, taskRes, trigRes]) => {
      setProjects(projRes.data || [])
      const counts = {}
      for (const t of (taskRes.data || [])) {
        counts[t.project_id] = (counts[t.project_id] || 0) + 1
      }
      setTaskCounts(counts)
      setTriggers(trigRes.data || [])
      setLoading(false)
    })
  }, [userId])

  function changeView(v) {
    setView(v)
    localStorage.setItem('addapp_projects_view', v)
  }

  const STATUS_ORDER = ['not_started', 'active', 'hold', 'done', 'dnf']

  const displayed = projects
    .map(p => ({ ...p, _taskCount: taskCounts[p.id] || 0 }))
    .filter(p => filterStatus === 'all' || p.status === filterStatus)
    .sort((a, b) => {
      let val = 0
      if (sortBy === 'created')    val = new Date(a.created_at) - new Date(b.created_at)
      if (sortBy === 'end_date')   val = (a.end_date   || '9999') > (b.end_date   || '9999') ? 1 : -1
      if (sortBy === 'start_date') val = (a.start_date || '9999') > (b.start_date || '9999') ? 1 : -1
      if (sortBy === 'status')     val = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      if (sortBy === 'tasks')      val = a._taskCount - b._taskCount
      return sortDir === 'asc' ? val : -val
    })

  async function createProject(payload) {
    const { data, error } = await supabase
      .from('projects')
      .insert([{ ...payload, user_id: userId }])
      .select('*, milestones(id, done)')
    if (!error && data) setProjects(prev => [data[0], ...prev])
  }

  async function updateProject(id, payload) {
    const { data, error } = await supabase
      .from('projects').update(payload)
      .eq('id', id).eq('user_id', userId)
      .select('*, milestones(id, done)')
    if (!error && data) {
      setProjects(prev => prev.map(p =>
        p.id === id ? { ...data[0], _taskCount: p._taskCount } : p
      ))
    }
  }

  async function deleteProject(id) {
    const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', userId)
    if (!error) setProjects(prev => prev.filter(p => p.id !== id))
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', fontSize:14 }}>
      Loading…
    </div>
  )

  const activeCount   = projects.filter(p => p.status === 'active').length
  const [search, setSearch] = useState('')
  const searchedDisplayed = displayed.filter(p =>
    !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="projects-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">
            {activeCount > 0 ? `${activeCount} active` : 'Track everything from idea to done.'}
          </p>
        </div>
        <button className="cal-add-btn" onClick={() => { setEditingProject(null); setShowModal(true) }}>
          + New project
        </button>
      </div>

      {/* Search bar */}
      <div className="proj-search-bar">
        <span className="proj-search-icon">🔍</span>
        <input
          className="proj-search-input"
          placeholder="Find a project…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="proj-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Toolbar */}
      <div className="proj-toolbar">
        <div className="proj-filter-pills">
          {[{ key: 'all', label: 'All' }, ...PROJECT_STATUSES].map(s => (
            <button
              key={s.key}
              className={`proj-filter-pill${filterStatus === s.key ? ' active' : ''}`}
              style={filterStatus === s.key && s.color ? { '--pill-color': s.color } : {}}
              onClick={() => setFilterStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="proj-toolbar-right">
          <div className="proj-sort-wrap">
            <select className="proj-sort-select" value={sortBy}
              onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button className="proj-sort-dir"
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          <div className="proj-view-toggle">
            <button className={`pvt-btn${view === 'grid' ? ' active' : ''}`}
              onClick={() => changeView('grid')} title="Grid view">⊞</button>
            <button className={`pvt-btn${view === 'list' ? ' active' : ''}`}
              onClick={() => changeView('list')} title="List view">☰</button>
          </div>
        </div>
      </div>

      {/* Empty */}
      {searchedDisplayed.length === 0 && (
        <div className="proj-empty">
          <span style={{ fontSize: 36 }}>📁</span>
          <p>{projects.length === 0
            ? 'No projects yet. Create one to get started.'
            : search ? 'No projects match that search.'
            : 'No projects match this filter.'}</p>
        </div>
      )}

      {/* Grid */}
      {view === 'grid' && searchedDisplayed.length > 0 && (
        <div className="proj-grid">
          {searchedDisplayed.map(p => (
            <ProjectCard key={p.id} project={p}
              onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}

      {/* List */}
      {view === 'list' && searchedDisplayed.length > 0 && (
        <div className="proj-list-wrap">
          <div className="proj-list-head">
            <div style={{ width: 12 }} />
            <div style={{ flex: 1 }}>Name</div>
            <div style={{ minWidth: 110 }}>Status</div>
            <div style={{ minWidth: 130 }}>Progress</div>
            <div style={{ minWidth: 110 }}>Start</div>
            <div style={{ minWidth: 110 }}>End</div>
            <div style={{ minWidth: 60, textAlign: 'right' }}>Tasks</div>
          </div>
          {searchedDisplayed.map(p => (
            <ProjectRow key={p.id} project={p}
              onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}

      <ProjectFormModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingProject(null) }}
        onSave={editingProject ? p => updateProject(editingProject.id, p) : createProject}
        onDelete={editingProject ? () => { deleteProject(editingProject.id); setShowModal(false); setEditingProject(null) } : null}
        initial={editingProject}
        triggerRoutines={triggerRoutines}
      />
    </div>
  )
}
