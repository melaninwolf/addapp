import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { statusInfo, PROJECT_COLORS, PROJECT_STATUSES } from './Projects'
import './Projects.css'

function fmtDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Milestone item ────────────────────────────────────────────
function MilestoneItem({ milestone, onMarkDone, onAddMicro, onToggleMicro, onDeleteMilestone, onMakeTask }) {
  const [newMicro, setNewMicro] = useState('')
  const [adding,   setAdding]   = useState(false)

  const total = milestone.micro_milestones?.length || 0
  const done  = milestone.micro_milestones?.filter(m => m.done).length || 0
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  async function handleAddMicro(e) {
    if (e.key !== 'Enter' || !newMicro.trim()) return
    await onAddMicro(milestone.id, newMicro.trim())
    setNewMicro('')
    setAdding(false)
  }

  return (
    <div className={`ms-item${milestone.done ? ' ms-done' : ''}`}>
      <div className="ms-header">
        <div className="ms-header-left">
          <button
            className={`ms-check${milestone.done ? ' ms-check-done' : ''}`}
            onClick={() => onMarkDone(milestone)}
            title={milestone.done ? 'Mark incomplete' : 'Mark done'}
          >
            {milestone.done && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l2.5 3L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <span className="ms-name">{milestone.name}</span>
          {milestone.due_date && (
            <span className="ms-due">{fmtDate(milestone.due_date)}</span>
          )}
        </div>
        <div className="ms-header-right">
          {total > 0 && <span className="ms-pct">{pct}%</span>}
          <button className="ms-del-btn" onClick={() => onDeleteMilestone(milestone.id)}>✕</button>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="ms-prog-wrap">
          <div className="ms-prog-track">
            <div className="ms-prog-fill" style={{ width: pct + '%' }} />
          </div>
          <span className="ms-prog-label">{done}/{total}</span>
        </div>
      )}

      {/* Micro-milestones */}
      <div className="mm-list">
        {milestone.micro_milestones?.map(mm => (
          <div
            key={mm.id}
            className={`mm-item${mm.done ? ' mm-done' : ''}`}
            onClick={() => onToggleMicro(mm)}
          >
            <div className={`mm-dot${mm.done ? ' mm-dot-done' : ''}`} />
            <span className="mm-name">{mm.name}</span>
          </div>
        ))}
      </div>

      {/* Add micro */}
      {adding ? (
        <input
          className="mm-add-input"
          placeholder="Micro-milestone… (Enter to save, Esc to cancel)"
          value={newMicro}
          onChange={e => setNewMicro(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddMicro(e)
            if (e.key === 'Escape') { setAdding(false); setNewMicro('') }
          }}
          onBlur={() => { if (!newMicro.trim()) setAdding(false) }}
          autoFocus
        />
      ) : (
        <button className="mm-add-btn" onClick={() => setAdding(true)}>+ micro-milestone</button>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function ProjectDetail({ userId }) {
  const { id }    = useParams()
  const navigate  = useNavigate()

  const [project,    setProject]    = useState(null)
  const [milestones, setMilestones] = useState([])
  const [tasks,      setTasks]      = useState([])
  const [trigger,        setTrigger]        = useState(null)
  const [triggerRoutines,setTriggerRoutines]= useState([])  // all trigger-type routines
  const [editingTrigger, setEditingTrigger] = useState(false)
  const [showMindMap,    setShowMindMap]    = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [editing,    setEditing]    = useState(false)

  // Edit fields
  const [editName,    setEditName]    = useState('')
  const [editReqs,    setEditReqs]    = useState('')
  const [editColor,   setEditColor]   = useState('')
  const [editStatus,  setEditStatus]  = useState('')
  const [editStart,   setEditStart]   = useState('')
  const [editEnd,     setEditEnd]     = useState('')

  // New milestone
  const [newMs,    setNewMs]    = useState('')
  const [newMsDue, setNewMsDue] = useState('')
  const [addingMs, setAddingMs] = useState(false)

  // Focus sessions
  const [focusSessions, setFocusSessions] = useState([])

  // Task management
  const [addingTask,      setAddingTask]      = useState(false)
  const [newTaskTitle,    setNewTaskTitle]    = useState('')
  const [newTaskPri,      setNewTaskPri]      = useState('medium')
  const [showAssign,      setShowAssign]      = useState(false)
  const [unassignedTasks, setUnassignedTasks] = useState([])
  const [assignSearch,    setAssignSearch]    = useState('')

  const loadFocusSessions = useCallback(async () => {
    if (!userId || !id) return
    const { data } = await supabase
      .from('focus_sessions')
      .select('id, session_type, duration_minutes, started_at, completed_at, notes')
      .eq('user_id', userId)
      .eq('project_id', id)
      .order('completed_at', { ascending: false })
    setFocusSessions(data || [])
  }, [userId, id])

  const load = useCallback(async () => {
    if (!userId || !id) { setLoading(false); return }
    try {
      const [projRes, msRes, taskRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).eq('user_id', userId).single(),
        supabase.from('milestones').select('*').eq('project_id', id).order('order_index'),
        supabase.from('tasks').select('*').eq('project_id', id).eq('user_id', userId),
      ])
      // Load micro_milestones by milestone IDs (no project_id column on that table)
      const msIds = (msRes.data || []).map(m => m.id)
      let microData = []
      if (msIds.length > 0) {
        const { data } = await supabase.from('micro_milestones').select('*').in('milestone_id', msIds).order('order_index')
        microData = data || []
      }
      const microMap = {}
      for (const mm of microData) {
        if (!microMap[mm.milestone_id]) microMap[mm.milestone_id] = []
        microMap[mm.milestone_id].push(mm)
      }
      const milestones = (msRes.data || []).map(m => ({
        ...m,
        micro_milestones: microMap[m.id] || [],
      }))
      const proj = projRes.data
      setProject(proj)
      setMilestones(milestones)
      setTasks(taskRes.data || [])

      // Load all trigger-type routines for the selector
      const { data: triggers } = await supabase
        .from('routines').select('id, name, emoji, type')
        .eq('user_id', userId).eq('type', 'trigger').order('name')
      setTriggerRoutines(triggers || [])

      if (proj?.trigger_id) {
        const found = (triggers || []).find(t => t.id === proj.trigger_id)
        setTrigger(found || null)
      } else {
        setTrigger(null)
      }
    } catch (err) {
      console.error('ProjectDetail load error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, id])

  useEffect(() => { load(); loadFocusSessions() }, [load, loadFocusSessions])

  // Refresh focus sessions when one is saved from the Focus Session page
  useEffect(() => {
    function handleSaved(e) {
      if (e.detail?.projectId === id) loadFocusSessions()
    }
    window.addEventListener('focus-session-saved', handleSaved)
    return () => window.removeEventListener('focus-session-saved', handleSaved)
  }, [id, loadFocusSessions])

  function startEdit() {
    if (!project) return
    setEditName(project.name || '')
    setEditReqs(project.requirements || '')
    setEditColor(project.color || PROJECT_COLORS[0])
    setEditStatus(project.status || 'not_started')
    setEditStart(project.start_date || '')
    setEditEnd(project.end_date || '')
    setEditing(true)
  }

  async function saveEdit() {
    const payload = {
      name:         editName.trim(),
      requirements: editReqs.trim() || null,
      color:        editColor,
      status:       editStatus,
      start_date:   editStart || null,
      end_date:     editEnd   || null,
      updated_at:   new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('projects').update(payload)
      .eq('id', id).eq('user_id', userId).select().single()
    if (!error && data) { setProject(data); setEditing(false) }
  }

  async function saveTrigger(routineId) {
    const newId = routineId || null
    const { data, error } = await supabase
      .from('projects').update({ trigger_id: newId, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId).select().single()
    if (!error && data) {
      setProject(data)
      setTrigger(triggerRoutines.find(t => t.id === newId) || null)
    }
    setEditingTrigger(false)
  }

  // ── Milestone CRUD ────────────────────────────────────────
  async function addMilestone() {
    if (!newMs.trim()) return
    const { data, error } = await supabase
      .from('milestones')
      .insert([{ project_id: id, user_id: userId, name: newMs.trim(), due_date: newMsDue || null, order_index: milestones.length }])
      .select('*')
    if (!error && data) {
      setMilestones(prev => [...prev, { ...data[0], micro_milestones: [] }])
      setNewMs(''); setNewMsDue(''); setAddingMs(false)
    }
  }

  async function markMilestoneDone(milestone) {
    const newDone = !milestone.done
    await supabase.from('milestones').update({ done: newDone }).eq('id', milestone.id)
    if (newDone && milestone.micro_milestones?.length > 0) {
      await supabase.from('micro_milestones').update({ done: true }).eq('milestone_id', milestone.id)
    }
    const { data: msData2 } = await supabase.from('milestones').select('*').eq('project_id', id).order('order_index')
    const msIds2 = (msData2 || []).map(m => m.id)
    let microData2 = []
    if (msIds2.length > 0) {
      const { data } = await supabase.from('micro_milestones').select('*').in('milestone_id', msIds2).order('order_index')
      microData2 = data || []
    }
    const microMap2 = {}
    for (const mm of microData2) {
      if (!microMap2[mm.milestone_id]) microMap2[mm.milestone_id] = []
      microMap2[mm.milestone_id].push(mm)
    }
    setMilestones((msData2 || []).map(m => ({ ...m, micro_milestones: microMap2[m.id] || [] })))
  }

  async function deleteMilestone(msId) {
    await supabase.from('milestones').delete().eq('id', msId)
    setMilestones(prev => prev.filter(m => m.id !== msId))
  }

  // ── Micro-milestone CRUD ──────────────────────────────────
  async function addMicroMilestone(milestoneId, name) {
    const ms = milestones.find(m => m.id === milestoneId)
    const { data, error } = await supabase
      .from('micro_milestones')
      .insert([{ milestone_id: milestoneId, user_id: userId, name, order_index: ms?.micro_milestones?.length || 0 }])
      .select()
    if (!error && data) {
      setMilestones(prev => prev.map(m =>
        m.id === milestoneId
          ? { ...m, micro_milestones: [...(m.micro_milestones || []), data[0]] }
          : m
      ))
    }
  }

  async function makeTaskFromMicro(mm) {
    if (!userId) return
    await supabase.from('tasks').insert([{
      user_id: userId,
      title: mm.name,
      status: 'todo',
      priority: 'medium',
      project_id: project?.id || null,
      recurrence: 'none',
      sort_order: Date.now(),
    }])
    // mark the micro-milestone done
    await toggleMicroMilestone(mm)
  }

  async function toggleMicroMilestone(mm) {
    const newDone = !mm.done
    await supabase.from('micro_milestones').update({ done: newDone }).eq('id', mm.id)
    setMilestones(prev => prev.map(m => ({
      ...m,
      micro_milestones: m.micro_milestones?.map(x =>
        x.id === mm.id ? { ...x, done: newDone } : x
      ),
    })))
  }

  // ── Task functions ────────────────────────────────────────
  async function createTask() {
    if (!newTaskTitle.trim()) return
    const { data, error } = await supabase
      .from('tasks')
      .insert([{
        title:      newTaskTitle.trim(),
        project_id: id,
        user_id:    userId,
        status:     'todo',
        priority:   newTaskPri,
        sort_order: tasks.length * 10,
      }])
      .select()
    if (!error && data) {
      setTasks(prev => [...prev, data[0]])
      setNewTaskTitle('')
      setNewTaskPri('medium')
      setAddingTask(false)
    }
  }

  async function loadUnassigned() {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .is('project_id', null)
      .neq('status', 'done')
    setUnassignedTasks(data || [])
    setShowAssign(true)
  }

  async function assignExistingTask(task) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ project_id: id })
      .eq('id', task.id)
      .select()
    if (!error && data) {
      setTasks(prev => [...prev, data[0]])
      setUnassignedTasks(prev => prev.filter(t => t.id !== task.id))
    }
  }

  async function removeTaskFromProject(taskId) {
    await supabase.from('tasks').update({ project_id: null }).eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  // ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', color:'var(--text3)', fontSize:14 }}>
      Loading…
    </div>
  )

  if (!project) return (
    <div className="placeholder-page">
      <button className="back-btn" onClick={() => navigate('/projects')}>← Projects</button>
      <p>Project not found.</p>
    </div>
  )

  const s         = statusInfo(project.status)
  const totalMs   = milestones.length
  const doneMs    = milestones.filter(m => m.done).length
  const projPct   = totalMs > 0 ? Math.round((doneMs / totalMs) * 100) : 0
  const doneTasks = tasks.filter(t => t.status === 'done').length

  return (
    <div className="proj-detail-page">
      <button className="back-btn" onClick={() => navigate('/projects')}>← Projects</button>

      {/* ── Header ── */}
      <div className="pd-header">
        <div className="pd-header-left">
          <div className="pd-color-dot" style={{ background: project.color }} />
          <div>
            {editing ? (
              <input className="modal-input pd-name-input" value={editName}
                onChange={e => setEditName(e.target.value)} autoFocus />
            ) : (
              <h1 className="pd-title">{project.name}</h1>
            )}
            <div className="pd-meta-row">
              <span className="proj-badge" style={{ '--badge-color': s.color }}>{s.label}</span>
              {project.start_date && <span className="pd-date">{fmtDate(project.start_date)}</span>}
              {project.end_date && (
                <><span className="pd-date-sep">→</span><span className="pd-date">{fmtDate(project.end_date)}</span></>
              )}
            </div>
            <button className="pd-mindmap-btn" onClick={() => setShowMindMap(true)}>
              🗺️ Mind map
            </button>
          </div>
        </div>

        <div className="pd-header-right">
          {totalMs > 0 && (
            <div className="pd-progress">
              <div className="pd-prog-label">{projPct}% complete</div>
              <div className="pd-prog-track">
                <div className="pd-prog-fill" style={{ width: projPct + '%', background: project.color }} />
              </div>
              <div className="pd-prog-sub">{doneMs}/{totalMs} milestones</div>
            </div>
          )}
          {editing ? (
            <div style={{ display:'flex', gap:6 }}>
              <button className="modal-btn modal-btn-save" onClick={saveEdit}>Save</button>
              <button className="modal-btn modal-btn-cancel" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          ) : (
            <button className="pd-edit-btn" onClick={startEdit}>Edit</button>
          )}
        </div>
      </div>

      <div className="pd-body">

        {/* Edit panel */}
        {editing && (
          <div className="pd-section pd-edit-panel">
            <div className="modal-row" style={{ flexWrap:'wrap', gap:12 }}>
              <div className="modal-field">
                <label className="modal-label">Color</label>
                <div className="proj-color-picker">
                  {PROJECT_COLORS.map(c => (
                    <button key={c} className={`proj-color-dot${editColor === c ? ' selected' : ''}`}
                      style={{ background: c }} onClick={() => setEditColor(c)} />
                  ))}
                </div>
              </div>
              <div className="modal-field">
                <label className="modal-label">Status</label>
                <div className="proj-status-picker">
                  {PROJECT_STATUSES.map(st => (
                    <button key={st.key}
                      className={`proj-status-btn${editStatus === st.key ? ' active' : ''}`}
                      style={{ '--s-color': st.color }}
                      onClick={() => setEditStatus(st.key)}>
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-row">
              <div className="modal-field" style={{ flex:1 }}>
                <label className="modal-label">Start date</label>
                <input type="date" className="modal-input" value={editStart}
                  onChange={e => setEditStart(e.target.value)} />
              </div>
              <div className="modal-field" style={{ flex:1 }}>
                <label className="modal-label">End date</label>
                <input type="date" className="modal-input" value={editEnd}
                  onChange={e => setEditEnd(e.target.value)} min={editStart} />
              </div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Requirements</label>
              <textarea className="modal-input modal-textarea" rows={3} value={editReqs}
                onChange={e => setEditReqs(e.target.value)} placeholder="What needs to be done…" />
            </div>
          </div>
        )}

        {/* Requirements (read-only) */}
        {!editing && project.requirements && (
          <div className="pd-section">
            <div className="pd-section-title">Requirements</div>
            <div className="pd-requirements">{project.requirements}</div>
          </div>
        )}

        {/* Activation trigger — editable */}
        <div className="pd-section">
          <div className="pd-section-header">
            <div className="pd-section-title">Activation trigger</div>
            {!editingTrigger && (
              <button className="pd-section-add-btn" onClick={() => setEditingTrigger(true)}>
                {trigger ? 'Change' : '+ Link trigger'}
              </button>
            )}
          </div>

          {editingTrigger ? (
            <div className="pd-trigger-select">
              <select className="focus-select" defaultValue={trigger?.id || ''}
                onChange={e => saveTrigger(e.target.value || null)}>
                <option value="">— No trigger —</option>
                {triggerRoutines.map(t => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>
                ))}
              </select>
              <button className="modal-btn modal-btn-cancel" onClick={() => setEditingTrigger(false)}>Cancel</button>
            </div>
          ) : trigger ? (
            <div className="pd-trigger-chip">
              <span>{trigger.emoji}</span>
              <span>{trigger.name}</span>
              <span className="pd-trigger-tag">🕹️ Trigger</span>
              <button className="ms-del-btn" onClick={() => saveTrigger(null)} title="Remove trigger">✕</button>
            </div>
          ) : (
            <div className="pd-empty-field">No trigger linked</div>
          )}
        </div>

        {/* Milestones */}
        <div className="pd-section">
          <div className="pd-section-header">
            <div className="pd-section-title">Milestones</div>
            <button className="pd-section-add-btn" onClick={() => setAddingMs(true)}>+ Add milestone</button>
          </div>

          {addingMs && (
            <div className="ms-add-form">
              <input className="modal-input" placeholder="Milestone name" value={newMs}
                onChange={e => setNewMs(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMilestone()} autoFocus />
              <input type="date" className="modal-input" value={newMsDue}
                onChange={e => setNewMsDue(e.target.value)} style={{ maxWidth: 160 }} />
              <div style={{ display:'flex', gap:6 }}>
                <button className="modal-btn modal-btn-save" onClick={addMilestone}>Add</button>
                <button className="modal-btn modal-btn-cancel"
                  onClick={() => { setAddingMs(false); setNewMs(''); setNewMsDue('') }}>Cancel</button>
              </div>
            </div>
          )}

          {milestones.length === 0 && !addingMs && (
            <div className="pd-empty-field">No milestones yet</div>
          )}

          <div className="ms-list">
            {milestones.map(ms => (
              <MilestoneItem
                key={ms.id}
                milestone={ms}
                onMarkDone={markMilestoneDone}
                onAddMicro={addMicroMilestone}
                onToggleMicro={toggleMicroMilestone}
                onDeleteMilestone={deleteMilestone}
                onMakeTask={makeTaskFromMicro}
              />
            ))}
          </div>
        </div>

        {/* FOCUS SESSIONS — moved below Tasks, see after tasks section */}
        {false && (
        <div className="pd-section">
          <div className="pd-section-header">
            <div className="pd-section-title">Focus sessions</div>
            <span className="pd-section-count">{focusSessions.length} sessions</span>
          </div>

          {focusSessions.length === 0 ? (
            <div className="pd-empty-field">No focus sessions logged yet — start one from the Focus Session page</div>
          ) : (() => {
            const totalMins = focusSessions.reduce((a, s) => a + (s.duration_minutes || 0), 0)
            const hours = Math.floor(totalMins / 60)
            const mins  = totalMins % 60
            const timeStr = hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`

            const TYPE_EMOJI = { deep_work:'🧠', study:'📚', creative:'🎨', admin:'📋', planning:'🗓️', other:'⚡' }
            const TYPE_LABEL = { deep_work:'Deep Work', study:'Study', creative:'Creative', admin:'Admin', planning:'Planning', other:'Other' }

            // Count by type
            const byType = focusSessions.reduce((acc, s) => {
              acc[s.session_type] = (acc[s.session_type] || 0) + 1
              return acc
            }, {})

            return (
              <>
                {/* Stats row */}
                <div className="pd-focus-stats">
                  <div className="pd-focus-stat">
                    <div className="pd-focus-stat-val">{focusSessions.length}</div>
                    <div className="pd-focus-stat-lbl">sessions</div>
                  </div>
                  <div className="pd-focus-stat">
                    <div className="pd-focus-stat-val">{timeStr}</div>
                    <div className="pd-focus-stat-lbl">total time</div>
                  </div>
                  <div className="pd-focus-stat">
                    <div className="pd-focus-stat-val">{Math.round(totalMins / focusSessions.length)}m</div>
                    <div className="pd-focus-stat-lbl">avg session</div>
                  </div>
                </div>

                {/* Type breakdown */}
                <div className="pd-focus-types">
                  {Object.entries(byType).map(([type, count]) => (
                    <span key={type} className="pd-focus-type-chip">
                      {TYPE_EMOJI[type] || '⚡'} {TYPE_LABEL[type] || type} <strong>{count}</strong>
                    </span>
                  ))}
                </div>

                {/* Recent sessions */}
                <div className="pd-focus-list">
                  {focusSessions.slice(0, 8).map(s => {
                    const d = s.completed_at ? new Date(s.completed_at) : null
                    const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
                    const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
                    return (
                      <div key={s.id} className="pd-focus-row">
                        <span className="pd-focus-emoji">{TYPE_EMOJI[s.session_type] || '⚡'}</span>
                        <span className="pd-focus-type">{TYPE_LABEL[s.session_type] || s.session_type}</span>
                        <span className="pd-focus-dur">{s.duration_minutes}m</span>
                        <span className="pd-focus-date">{dateStr} {timeStr}</span>
                        {s.notes && <span className="pd-focus-notes" title={s.notes}>📝</span>}
                      </div>
                    )
                  })}
                  {focusSessions.length > 8 && (
                    <div className="pd-focus-more">+{focusSessions.length - 8} more sessions</div>
                  )}
                </div>
              </>
            )
          })()}
        </div>
        )} {/* end false && focus sessions placeholder */}

        {/* Tasks */}
        <div className="pd-section">
          <div className="pd-section-header">
            <div className="pd-section-title">Tasks</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span className="pd-section-count">{doneTasks}/{tasks.length}</span>
              <button className="pd-section-add-btn" onClick={() => { setAddingTask(true); setShowAssign(false) }}>+ New task</button>
              <button className="pd-section-add-btn" onClick={loadUnassigned}>Assign existing</button>
            </div>
          </div>

          {/* Quick-add task form */}
          {addingTask && (
            <div className="pd-task-add-form">
              <input
                className="modal-input"
                placeholder="Task title"
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createTask(); if (e.key === 'Escape') setAddingTask(false) }}
                autoFocus
              />
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {[{key:'high',color:'#ef4444'},{key:'medium',color:'#f59e0b'},{key:'low',color:'#4ade80'}].map(p => (
                  <button key={p.key}
                    className={`proj-status-btn${newTaskPri === p.key ? ' active' : ''}`}
                    style={{ '--s-color': p.color, fontSize:11 }}
                    onClick={() => setNewTaskPri(p.key)}>
                    {p.key}
                  </button>
                ))}
                <div style={{ flex:1 }} />
                <button className="modal-btn modal-btn-save" onClick={createTask}>Add</button>
                <button className="modal-btn modal-btn-cancel" onClick={() => { setAddingTask(false); setNewTaskTitle('') }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Assign existing picker */}
          {showAssign && (
            <div className="pd-assign-wrap">
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <input
                  className="modal-input"
                  placeholder="Search tasks…"
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  autoFocus
                />
                <button className="modal-btn modal-btn-cancel" onClick={() => { setShowAssign(false); setAssignSearch('') }}>✕</button>
              </div>
              {unassignedTasks.length === 0 ? (
                <div className="pd-empty-field">No unassigned tasks found</div>
              ) : (
                <div className="pd-assign-list">
                  {unassignedTasks
                    .filter(t => !assignSearch || t.title.toLowerCase().includes(assignSearch.toLowerCase()))
                    .map(t => (
                      <div key={t.id} className="pd-assign-row" onClick={() => assignExistingTask(t)}>
                        <span className="pd-task-name">{t.title}</span>
                        <span className="pd-assign-add">+ assign</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {tasks.length === 0 && !addingTask && !showAssign && (
            <div className="pd-empty-field">No tasks yet — create one or assign from existing</div>
          )}

          {tasks.length > 0 && (
            <div className="pd-task-list">
              {tasks.map(t => (
                <div key={t.id} className={`pd-task-row${t.status === 'done' ? ' pd-task-done' : ''}`}>
                  <div className={`pd-task-check${t.status === 'done' ? ' done' : ''}`}>
                    {t.status === 'done' && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3l1.8 2.2L7 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="pd-task-name">{t.title}</span>
                  {t.due_date && <span className="pd-task-due">{fmtDate(t.due_date)}</span>}
                  <span className={`pd-task-status-badge pd-task-${t.status}`}>{t.status.replace('_', ' ')}</span>
                  <button className="ms-del-btn" style={{ opacity:1 }} onClick={() => removeTaskFromProject(t.id)} title="Remove from project">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Focus sessions */}
        <div className="pd-section">
          <div className="pd-section-header">
            <div className="pd-section-title">Focus sessions</div>
            <span className="pd-section-count">{focusSessions.length} sessions</span>
          </div>

          {focusSessions.length === 0 ? (
            <div className="pd-empty-field">No focus sessions logged yet — start one from the Focus Session page</div>
          ) : (() => {
            const totalMins = focusSessions.reduce((a, s) => a + (s.duration_minutes || 0), 0)
            const hours = Math.floor(totalMins / 60)
            const mins  = totalMins % 60
            const timeStr = hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`

            const TYPE_EMOJI = { deep_work:'🧠', study:'📚', creative:'🎨', admin:'📋', planning:'🗓️', other:'⚡' }
            const TYPE_LABEL = { deep_work:'Deep Work', study:'Study', creative:'Creative', admin:'Admin', planning:'Planning', other:'Other' }

            const byType = focusSessions.reduce((acc, s) => {
              acc[s.session_type] = (acc[s.session_type] || 0) + 1
              return acc
            }, {})

            return (
              <>
                <div className="pd-focus-stats">
                  <div className="pd-focus-stat">
                    <div className="pd-focus-stat-val">{focusSessions.length}</div>
                    <div className="pd-focus-stat-lbl">sessions</div>
                  </div>
                  <div className="pd-focus-stat">
                    <div className="pd-focus-stat-val">{timeStr}</div>
                    <div className="pd-focus-stat-lbl">total time</div>
                  </div>
                  <div className="pd-focus-stat">
                    <div className="pd-focus-stat-val">{Math.round(totalMins / focusSessions.length)}m</div>
                    <div className="pd-focus-stat-lbl">avg session</div>
                  </div>
                </div>
                <div className="pd-focus-types">
                  {Object.entries(byType).map(([type, count]) => (
                    <span key={type} className="pd-focus-type-chip">
                      {TYPE_EMOJI[type] || '⚡'} {TYPE_LABEL[type] || type} <strong>{count}</strong>
                    </span>
                  ))}
                </div>
                <div className="pd-focus-list">
                  {focusSessions.slice(0, 8).map(s => {
                    const d = s.completed_at ? new Date(s.completed_at) : null
                    const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
                    const timeStr = d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
                    return (
                      <div key={s.id} className="pd-focus-row">
                        <span className="pd-focus-emoji">{TYPE_EMOJI[s.session_type] || '⚡'}</span>
                        <span className="pd-focus-type">{TYPE_LABEL[s.session_type] || s.session_type}</span>
                        <span className="pd-focus-dur">{s.duration_minutes}m</span>
                        <span className="pd-focus-date">{dateStr} {timeStr}</span>
                        {s.notes && <span className="pd-focus-notes" title={s.notes}>📝</span>}
                      </div>
                    )
                  })}
                  {focusSessions.length > 8 && (
                    <div className="pd-focus-more">+{focusSessions.length - 8} more sessions</div>
                  )}
                </div>
              </>
            )
          })()}
        </div>

      </div>

      {/* Mind map popup */}
      {showMindMap && (
        <div className="modal-overlay" onClick={() => setShowMindMap(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Mind map — {project.name}</h2>
              <button className="modal-close" onClick={() => setShowMindMap(false)}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <div style={{ fontSize: 40, marginBottom: '1rem' }}>🗺️</div>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
                Visual mind map is coming soon.<br />
                It will let you branch out ideas, connections, and notes for this project.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
