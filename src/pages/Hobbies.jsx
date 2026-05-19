import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import { addMAM, MAM_HOBBY_PER_HR } from '../xp'
import './Hobbies.css'

// ─── Tree type configs ─────────────────────────────────────────────────────
const TREE_TYPES = {
  oak: {
    label: 'Oak',         emoji: '🌳',
    desc:  'Wide & majestic. Spreading branches, round canopy.',
    trunkLen: 88, trunkWidth: 11,
    spread: 1.30, splitAngle: 0.44, lengthDecay: 0.67,
    maxDepth: 6,  leafDepth: 5, splitChance: 0.38,
    branchColor: '#6b4c2a', leafColor: '#4a9640', leafR: 7,
  },
  pine: {
    label: 'Pine',        emoji: '🌲',
    desc:  'Tall & proud. Reaches for the sky with a triangular shape.',
    trunkLen: 108, trunkWidth: 9,
    spread: 0.62, splitAngle: 0.62, lengthDecay: 0.74,
    maxDepth: 7,  leafDepth: 5, splitChance: 0.18,
    branchColor: '#4a3820', leafColor: '#1d6b30', leafR: 5,
  },
  cherry: {
    label: 'Cherry Blossom', emoji: '🌸',
    desc:  'Delicate & beautiful. Blooms with soft pink blossoms.',
    trunkLen: 70, trunkWidth: 8,
    spread: 1.55, splitAngle: 0.50, lengthDecay: 0.64,
    maxDepth: 5,  leafDepth: 4, splitChance: 0.28,
    branchColor: '#7a3828', leafColor: '#f4a7c0', leafR: 6,
  },
  willow: {
    label: 'Willow',      emoji: '🌿',
    desc:  'Graceful & flowing. Drooping branches that sway gently.',
    trunkLen: 94, trunkWidth: 9,
    spread: 1.20, splitAngle: 0.28, lengthDecay: 0.76,
    maxDepth: 6,  leafDepth: 4, splitChance: 0.30,
    branchColor: '#5a4030', leafColor: '#7ec845', leafR: 5,
  },
  maple: {
    label: 'Maple',       emoji: '🍁',
    desc:  'Fiery & striking. Blazes with rich autumn colours.',
    trunkLen: 80, trunkWidth: 10,
    spread: 1.28, splitAngle: 0.52, lengthDecay: 0.65,
    maxDepth: 6,  leafDepth: 5, splitChance: 0.42,
    branchColor: '#5c3820', leafColor: '#d44a10', leafR: 7,
  },
  bonsai: {
    label: 'Bonsai',      emoji: '🪴',
    desc:  'Patient & precise. Slow to grow, endlessly refined.',
    trunkLen: 48, trunkWidth: 12,
    spread: 1.60, splitAngle: 0.55, lengthDecay: 0.60,
    maxDepth: 5,  leafDepth: 4, splitChance: 0.50,
    branchColor: '#7a5a38', leafColor: '#3a8a50', leafR: 6,
  },
  bamboo: {
    label: 'Bamboo',      emoji: '🎋',
    desc:  'Fast & flexible. Shoots up quickly, sways with ease.',
    trunkLen: 120, trunkWidth: 6,
    spread: 0.30, splitAngle: 0.25, lengthDecay: 0.88,
    maxDepth: 7,  leafDepth: 6, splitChance: 0.10,
    branchColor: '#4a7a30', leafColor: '#a0e050', leafR: 5,
  },
}

// ─── Seeded RNG (LCG) ──────────────────────────────────────────────────────
function seededRng(seed) {
  let s = 0
  const str = String(seed || 'default')
  for (let i = 0; i < str.length; i++) s = (Math.imul(31, s) + str.charCodeAt(i)) | 0
  s = Math.abs(s) || 1
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0
    return (s >>> 0) / 0x100000000
  }
}

// ─── Build full tree structure — BFS order ─────────────────────────────────
// BFS ensures branches[0]=trunk, branches[1..2]=symmetric depth-1 pair, etc.
// This makes growth reveal symmetric and natural (trunk → first fork → deeper)
function buildTree(treeType, seed) {
  const cfg    = TREE_TYPES[treeType] || TREE_TYPES.oak
  const rng    = seededRng(seed)
  const result = []

  // Queue entries: { x1, y1, angle, len, depth }
  const queue = [{ x1: 200, y1: 348, angle: Math.PI / 2, len: cfg.trunkLen, depth: 0 }]

  while (queue.length > 0) {
    const { x1, y1, angle, len, depth } = queue.shift()
    if (depth > cfg.maxDepth || len < 5) continue

    const x2 = x1 + Math.cos(angle) * len
    const y2 = y1 - Math.sin(angle) * len          // SVG y is inverted
    const strokeWidth = Math.max(1, cfg.trunkWidth * Math.pow(0.58, depth))
    const isLeaf      = depth >= cfg.leafDepth

    const leafClusters = isLeaf
      ? [0, 1, 2].map(() => ({
          dx: (rng() - 0.5) * cfg.leafR * 2.2,
          dy: (rng() - 0.5) * cfg.leafR * 2.2,
          r:  cfg.leafR * (0.7 + rng() * 0.55),
        }))
      : null

    result.push({
      id: result.length,
      x1, y1, x2, y2,
      depth, strokeWidth, isLeaf,
      len: Math.hypot(x2 - x1, y2 - y1),
      leafClusters,
    })

    if (isLeaf) continue

    // Decide number of children (trunk always forks into 2)
    const numKids = depth === 0 ? 2 : (rng() > cfg.splitChance ? 2 : 1)

    for (let k = 0; k < numKids; k++) {
      let da
      if (numKids === 2) {
        // Symmetric fork: left branch (+), right branch (-)
        const side = k === 0 ? 1 : -1
        da = side * (cfg.splitAngle + rng() * 0.22)
        if (treeType === 'willow' && depth > 2) da += rng() * 0.65 // droop
      } else {
        da = (rng() - 0.5) * cfg.spread * 0.55
      }
      if (treeType === 'pine' && depth > 2) da *= (1 - depth * 0.08) // stay narrow

      const childLen = len * cfg.lengthDecay * (0.80 + rng() * 0.40)
      // Add to END of queue → BFS: all depth-N before any depth-(N+1)
      queue.push({ x1: x2, y1: y2, angle: angle + da, len: childLen, depth: depth + 1 })
    }
  }

  return result
}

// ─── Vitality (leaf health based on recency) ──────────────────────────────
function getVitality(lastSessionAt) {
  if (!lastSessionAt) return 0.25
  const days = (Date.now() - new Date(lastSessionAt)) / 86400000
  if (days <= 3)  return 1.0
  if (days <= 7)  return 0.85
  if (days <= 14) return 0.65
  if (days <= 30) return 0.40
  if (days <= 60) return 0.18
  return 0.06
}

function vitalityLabel(v) {
  if (v >= 0.9) return { text: 'Thriving 🌟',  color: 'var(--green)' }
  if (v >= 0.7) return { text: 'Healthy 💚',   color: '#6abf69' }
  if (v >= 0.5) return { text: 'Fading 🍂',    color: '#e0a040' }
  if (v >= 0.2) return { text: 'Struggling 🍁', color: '#d4701a' }
  return              { text: 'Dormant 🪵',    color: 'var(--red)' }
}

// 1 point per 20 min — one 25-min focus session unlocks the trunk
function getGrowthPoints(totalMinutes) {
  return Math.floor((totalMinutes || 0) / 20)
}

function todayStr() { return new Date().toISOString().split('T')[0] }

function fmtDuration(mins) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// ─── HobbyTree SVG ─────────────────────────────────────────────────────────
function HobbyTree({ hobby, newBranchIds = new Set(), size = 'full' }) {
  const cfg        = TREE_TYPES[hobby.tree_type] || TREE_TYPES.oak
  const branches   = useMemo(() => buildTree(hobby.tree_type, hobby.id), [hobby.tree_type, hobby.id])
  const growthPts  = getGrowthPoints(hobby.total_minutes)
  // BFS order: 0 pts = seed, 1 pt = trunk, 2 pts = trunk+left, 3 pts = trunk+both, etc.
  const visibleCnt = Math.min(growthPts, branches.length)
  const vitality   = getVitality(hobby.last_session_at)
  const visible    = branches.slice(0, visibleCnt)
  const isSeed     = visibleCnt === 0

  if (size === 'mini') {
    // Compact 80×90 thumbnail for sidebar
    return (
      <svg viewBox="60 200 280 160" className="hobby-tree-mini" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="200" cy="354" rx="60" ry="6" className="tree-ground-mini" />
        {isSeed ? (
          <g>
            <circle cx="200" cy="350" r="4" fill={cfg.branchColor} />
            <line x1="200" y1="350" x2="200" y2="334" stroke={cfg.leafColor} strokeWidth="2" strokeLinecap="round" />
            <circle cx="200" cy="332" r="6" fill={cfg.leafColor} opacity="0.8" />
          </g>
        ) : visible.map(b => (
          <g key={b.id}>
            <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
              stroke={cfg.branchColor} strokeWidth={b.strokeWidth * 0.7} strokeLinecap="round" />
            {b.isLeaf && b.leafClusters?.map((lc, j) => (
              <circle key={j} cx={b.x2 + lc.dx} cy={b.y2 + lc.dy} r={lc.r * 0.7}
                fill={cfg.leafColor} opacity={vitality * 0.85} />
            ))}
          </g>
        ))}
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 400 380" className="hobby-tree-svg" xmlns="http://www.w3.org/2000/svg">
      {/* Ground */}
      <ellipse cx="200" cy="356" rx="90" ry="9" className="tree-ground" />

      {isSeed ? (
        <g className="tree-sprout">
          <circle cx="200" cy="350" r="6" fill={cfg.branchColor} className="seed-dot" />
          <line x1="200" y1="350" x2="200" y2="326" stroke={cfg.leafColor}
            strokeWidth="2.5" strokeLinecap="round" className="sprout-stem" />
          <circle cx="200" cy="322" r="10" fill={cfg.leafColor} opacity="0.75" className="sprout-bud" />
        </g>
      ) : (
        <g>
          {visible.map(b => {
            const isNew   = newBranchIds.has(b.id)
            const newIdx  = isNew
              ? [...newBranchIds].sort((a, z) => a - z).indexOf(b.id)
              : 0
            // Stagger: 80ms between each new branch; cap at 600ms so it doesn't drag
            const delay     = isNew ? Math.min(newIdx * 80, 600) : 0
            const leafDelay = delay + 580   // leaves pop after their branch finishes drawing

            return (
              <g key={b.id}>
                <line
                  x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
                  stroke={cfg.branchColor}
                  strokeWidth={b.strokeWidth}
                  strokeLinecap="round"
                  className={isNew ? 'branch-new' : undefined}
                  style={isNew ? {
                    // CSS var is read by @keyframes — the clean way to pass dynamic values
                    '--len': b.len,
                    animationDelay: `${delay}ms`,
                  } : undefined}
                />
                {b.isLeaf && b.leafClusters?.map((lc, j) => (
                  <circle key={j}
                    cx={b.x2 + lc.dx} cy={b.y2 + lc.dy} r={lc.r}
                    fill={cfg.leafColor}
                    opacity={vitality * 0.88}
                    className={isNew ? 'leaf-new' : undefined}
                    style={isNew ? { animationDelay: `${leafDelay + j * 35}ms` } : undefined}
                  />
                ))}
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}

// ─── AddHobbyModal ─────────────────────────────────────────────────────────
function AddHobbyModal({ userId, onClose, onAdd }) {
  const [name,      setName]      = useState('')
  const [treeType,  setTreeType]  = useState('oak')
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setErr('Give your hobby a name.'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('hobbies')
      .insert({ user_id: userId, name: name.trim(), tree_type: treeType, total_minutes: 0 })
      .select().single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    onAdd(data)
  }

  return (
    <div className="hobby-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hobby-modal">
        <div className="hmodal-header">
          <h2 className="hmodal-title">New hobby</h2>
          <button className="hmodal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="hmodal-body">
          <label className="hmodal-label">Hobby name</label>
          <input
            className="hmodal-input" autoFocus
            placeholder="e.g. Guitar, Watercolour, Spanish…"
            value={name} onChange={e => { setName(e.target.value); setErr('') }}
          />

          <label className="hmodal-label" style={{ marginTop: 20 }}>Choose your tree</label>
          <div className="tree-picker">
            {Object.entries(TREE_TYPES).map(([key, cfg]) => (
              <button key={key} type="button"
                className={`tree-pick-card${treeType === key ? ' active' : ''}`}
                onClick={() => setTreeType(key)}>
                <div className="tpc-preview">
                  <HobbyTree hobby={{ tree_type: key, total_minutes: 90, id: key }} size="mini" />
                </div>
                <span className="tpc-name">{cfg.emoji} {cfg.label}</span>
                <span className="tpc-desc">{cfg.desc}</span>
              </button>
            ))}
          </div>

          {err && <p className="hmodal-err">{err}</p>}

          <div className="hmodal-footer">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Planting…' : 'Plant tree 🌱'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── LogSessionModal ───────────────────────────────────────────────────────
const RATING_LABELS = ['', 'Rough', 'Okay', 'Good', 'Great', 'Amazing']

function LogSessionModal({ hobby, userId, onClose, onLogged }) {
  const [date,     setDate]     = useState(todayStr())
  const [hours,    setHours]    = useState(0)
  const [mins,     setMins]     = useState(30)
  const [notes,    setNotes]    = useState('')
  const [rating,   setRating]   = useState(0)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  const totalMins = hours * 60 + mins

  async function handleSubmit(e) {
    e.preventDefault()
    if (totalMins < 1) { setErr('Log at least 1 minute.'); return }
    setSaving(true)

    const { error: sessionErr } = await supabase.from('hobby_sessions').insert({
      hobby_id: hobby.id, user_id: userId,
      session_date: date, duration_minutes: totalMins,
      notes: notes.trim() || null,
      rating: rating || null,
    })
    if (sessionErr) { setSaving(false); setErr(sessionErr.message); return }

    // Update hobby totals
    const newTotal = (hobby.total_minutes || 0) + totalMins
    const { data: updated, error: updateErr } = await supabase
      .from('hobbies')
      .update({ total_minutes: newTotal, last_session_at: new Date().toISOString() })
      .eq('id', hobby.id)
      .select().single()

    setSaving(false)
    if (updateErr) { setErr(updateErr.message); return }

    // Award MAM: 10g per 60 min, pro-rated (6 min = 1g)
    const gramsEarned = Math.floor(totalMins / 6)
    if (gramsEarned > 0) addMAM(gramsEarned)

    onLogged(updated, totalMins)
  }

  return (
    <div className="hobby-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="hobby-modal hobby-modal-sm">
        <div className="hmodal-header">
          <h2 className="hmodal-title">Log session — {hobby.name}</h2>
          <button className="hmodal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="hmodal-body">

          <div className="hmodal-row">
            <div style={{ flex: 1 }}>
              <label className="hmodal-label">Date</label>
              <input type="date" className="hmodal-input"
                value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <label className="hmodal-label" style={{ marginTop: 16 }}>Duration</label>
          <div className="duration-row">
            <div className="dur-field">
              <button type="button" className="dur-btn" onClick={() => setHours(h => Math.max(0, h-1))}>−</button>
              <span className="dur-val">{hours}h</span>
              <button type="button" className="dur-btn" onClick={() => setHours(h => Math.min(12, h+1))}>+</button>
            </div>
            <div className="dur-field">
              <button type="button" className="dur-btn" onClick={() => setMins(m => Math.max(0, m-5))}>−</button>
              <span className="dur-val">{String(mins).padStart(2,'0')}m</span>
              <button type="button" className="dur-btn" onClick={() => setMins(m => Math.min(55, m+5))}>+</button>
            </div>
            <span className="dur-total">{totalMins > 0 ? fmtDuration(totalMins) : '—'}</span>
          </div>

          <label className="hmodal-label" style={{ marginTop: 16 }}>How did it go?</label>
          <div className="rating-row">
            {[1,2,3,4,5].map(r => (
              <button key={r} type="button"
                className={`rating-btn${rating >= r ? ' active' : ''}`}
                onClick={() => setRating(v => v === r ? 0 : r)}>
                ★
              </button>
            ))}
            {rating > 0 && <span className="rating-label">{RATING_LABELS[rating]}</span>}
          </div>

          <label className="hmodal-label" style={{ marginTop: 16 }}>Notes (optional)</label>
          <textarea className="hmodal-input hmodal-textarea" rows={3}
            placeholder="What did you work on? Any breakthroughs?"
            value={notes} onChange={e => setNotes(e.target.value)} />

          {err && <p className="hmodal-err">{err}</p>}

          <div className="hmodal-footer">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || totalMins < 1}>
              {saving ? 'Saving…' : `Log ${totalMins > 0 ? fmtDuration(totalMins) : 'session'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Streak calc ───────────────────────────────────────────────────────────
function calcStreak(sessions) {
  if (!sessions.length) return 0
  const dates = [...new Set(sessions.map(s => s.session_date))].sort().reverse()
  let streak = 0
  let prev = null
  for (const d of dates) {
    const curr = new Date(d + 'T12:00:00')
    if (!prev) { streak = 1; prev = curr; continue }
    const diff = (prev - curr) / 86400000
    if (diff <= 1.5) { streak++; prev = curr }
    else break
  }
  return streak
}

// ─── HobbyDetail ──────────────────────────────────────────────────────────
function HobbyDetail({ hobby, userId, onHobbyUpdate, onDelete }) {
  const [sessions,    setSessions]    = useState([])
  const [showLog,     setShowLog]     = useState(false)
  const [newBranchIds,setNewBranchIds]= useState(new Set())
  const prevMinsRef = useRef(hobby?.total_minutes || 0)

  useEffect(() => {
    if (!hobby) return
    loadSessions()
  }, [hobby?.id]) // eslint-disable-line

  async function loadSessions() {
    const { data } = await supabase
      .from('hobby_sessions').select('*')
      .eq('hobby_id', hobby.id).order('session_date', { ascending: false }).limit(20)
    setSessions(data || [])
  }

  function handleLogged(updatedHobby, addedMins) {
    setShowLog(false)
    // Compute newly visible branches for animation
    const prev    = prevMinsRef.current
    const curr    = updatedHobby.total_minutes
    const branches= buildTree(updatedHobby.tree_type, updatedHobby.id)
    const prevCnt = Math.min(getGrowthPoints(prev), branches.length)
    const currCnt = Math.min(getGrowthPoints(curr), branches.length)
    const ids = new Set()
    for (let i = prevCnt; i < currCnt; i++) ids.add(i)
    if (ids.size) {
      setNewBranchIds(ids)
      setTimeout(() => setNewBranchIds(new Set()), ids.size * 60 + 2000)
    }
    prevMinsRef.current = curr
    onHobbyUpdate(updatedHobby)
    loadSessions()
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${hobby.name}"? This removes all sessions and your tree.`)) return
    await supabase.from('hobbies').delete().eq('id', hobby.id)
    onDelete(hobby.id)
  }

  const vitality    = getVitality(hobby.last_session_at)
  const vLabel      = vitalityLabel(vitality)
  const growthPts   = getGrowthPoints(hobby.total_minutes)
  const cfg         = TREE_TYPES[hobby.tree_type] || TREE_TYPES.oak
  const streak      = calcStreak(sessions)
  const totalHours  = ((hobby.total_minutes || 0) / 60).toFixed(1)
  const allBranches = buildTree(hobby.tree_type, hobby.id)
  const pct         = Math.round(Math.min(growthPts + 1, allBranches.length) / allBranches.length * 100)

  return (
    <div className="hobby-detail">
      <div className="hd-header">
        <div>
          <h1 className="hd-name">{hobby.name}</h1>
          <span className="hd-tree-badge">{cfg.emoji} {cfg.label}</span>
        </div>
        <div className="hd-header-actions">
          <button className="btn-primary hd-log-btn" onClick={() => setShowLog(true)}>
            + Log session
          </button>
          <button className="btn-ghost hd-delete-btn" onClick={handleDelete} title="Delete hobby">🗑</button>
        </div>
      </div>

      {/* Tree stage label */}
      <div className="hd-stage">
        {growthPts === 0 && <span className="stage-chip stage-seed">🌱 Seed</span>}
        {growthPts >= 1  && growthPts < 5  && <span className="stage-chip stage-sprout">🌿 Sprout</span>}
        {growthPts >= 5  && growthPts < 15 && <span className="stage-chip stage-sapling">🪴 Sapling</span>}
        {growthPts >= 15 && growthPts < 40 && <span className="stage-chip stage-young">🌳 Young Tree</span>}
        {growthPts >= 40 && growthPts < 80 && <span className="stage-chip stage-mature">🌲 Mature Tree</span>}
        {growthPts >= 80 && <span className="stage-chip stage-ancient">✨ Ancient Tree</span>}
        <span className="hd-vitality" style={{ color: vLabel.color }}>{vLabel.text}</span>
      </div>

      {/* The tree */}
      <div className="hd-tree-wrap">
        <HobbyTree hobby={hobby} newBranchIds={newBranchIds} />
        <div className="hd-growth-bar">
          <div className="hd-growth-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="hd-growth-label">{pct}% grown · {growthPts} / {allBranches.length} branches</div>
      </div>

      {/* Stats */}
      <div className="hd-stats">
        <div className="hd-stat">
          <span className="hd-stat-val">{totalHours}h</span>
          <span className="hd-stat-key">Total time</span>
        </div>
        <div className="hd-stat">
          <span className="hd-stat-val">{sessions.length}</span>
          <span className="hd-stat-key">Sessions</span>
        </div>
        <div className="hd-stat">
          <span className="hd-stat-val">{streak}</span>
          <span className="hd-stat-key">Day streak</span>
        </div>
        <div className="hd-stat">
          <span className="hd-stat-val">
            {hobby.last_session_at
              ? Math.round((Date.now() - new Date(hobby.last_session_at)) / 86400000)
              : '—'}
          </span>
          <span className="hd-stat-key">Days since last</span>
        </div>
      </div>

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="hd-sessions">
          <div className="hd-section-title">Recent sessions</div>
          {sessions.slice(0, 8).map((s, i) => (
            <div key={s.id} className="session-row" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="session-date">{new Date(s.session_date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              <div className="session-dur">{fmtDuration(s.duration_minutes)}</div>
              {s.rating && (
                <div className="session-stars">
                  {'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}
                </div>
              )}
              {s.notes && <div className="session-notes">{s.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {showLog && (
        <LogSessionModal
          hobby={hobby} userId={userId}
          onClose={() => setShowLog(false)}
          onLogged={handleLogged}
        />
      )}
    </div>
  )
}

// ─── Main Hobbies page ─────────────────────────────────────────────────────
// ─── Growing Stages Chart ───────────────────────────────────────────────────
const STAGE_MINUTES = [
  { label: 'SEED',    sub: '< 10 min',  mins: 5   },
  { label: 'SAPLING', sub: '10–60 min', mins: 30  },
  { label: 'GROWING', sub: '1–5 hours', mins: 120 },
  { label: 'MATURE',  sub: '5+ hours',  mins: 360 },
]

function GrowingStagesChart({ onClose }) {
  const species = Object.entries(TREE_TYPES)
  return (
    <div className="stages-overlay" onClick={onClose}>
      <div className="stages-sheet" onClick={e => e.stopPropagation()}>
        <div className="stages-header">
          <div className="stages-header-text">
            <h2 className="stages-title">Growing stages</h2>
            <p className="stages-sub">Same species, four ages. Every tree earns its silhouette.</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="stages-grid">
          {/* Column headers */}
          <div className="stages-col-label" />
          {STAGE_MINUTES.map(s => (
            <div key={s.label} className="stages-col-header">
              <span className="stages-col-name">{s.label}</span>
              <span className="stages-col-sub">{s.sub}</span>
            </div>
          ))}

          {/* One row per species */}
          {species.map(([key, cfg]) => (
            <>
              <div key={`row-${key}`} className="stages-row-label">
                <span className="stages-species-emoji">{cfg.emoji}</span>
                <span className="stages-species-name">{cfg.label}</span>
              </div>
              {STAGE_MINUTES.map(stage => (
                <div key={`${key}-${stage.label}`} className="stages-cell">
                  <HobbyTree
                    hobby={{ tree_type: key, total_minutes: stage.mins, id: `${key}-${stage.label}` }}
                    size="mini"
                  />
                </div>
              ))}
            </>
          ))}
        </div>

        <div className="stages-footer">
          Seeds get a per-species sprout · Sapling: 45% scale · Growing: 82% scale · Mature: full canopy
        </div>
      </div>
    </div>
  )
}

export default function Hobbies({ userId }) {
  const [hobbies,       setHobbies]       = useState([])
  const [selected,      setSelected]      = useState(null)
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [showStages,    setShowStages]    = useState(false)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase.from('hobbies').select('*').eq('user_id', userId).order('created_at')
      .then(({ data }) => {
        const list = data || []
        setHobbies(list)
        if (list.length && !selected) setSelected(list[0])
        setLoading(false)
      })
  }, [userId]) // eslint-disable-line

  function handleAdd(hobby) {
    setHobbies(prev => [...prev, hobby])
    setSelected(hobby)
    setShowAddModal(false)
  }

  function handleHobbyUpdate(updated) {
    setHobbies(prev => prev.map(h => h.id === updated.id ? updated : h))
    setSelected(updated)
  }

  function handleDelete(id) {
    const remaining = hobbies.filter(h => h.id !== id)
    setHobbies(remaining)
    setSelected(remaining[0] || null)
  }

  if (loading) return <div className="hobbies-loading">Loading your trees…</div>

  return (
    <div className="hobbies-page">
      {/* ── Sidebar ── */}
      <aside className="hobbies-sidebar">
        <div className="hsb-head">
          <span className="hsb-title">My Hobbies</span>
          <button className="hsb-add-btn" onClick={() => setShowAddModal(true)} title="Add hobby">＋</button>
        </div>

        <div className="hsb-list">
          {hobbies.length === 0 ? (
            <div className="hsb-empty">
              <p>No hobbies yet.</p>
              <button className="btn-primary" style={{ marginTop: 8, fontSize: 12 }}
                onClick={() => setShowAddModal(true)}>
                Plant first tree 🌱
              </button>
            </div>
          ) : hobbies.map((h, i) => {
            const cfg = TREE_TYPES[h.tree_type] || TREE_TYPES.oak
            const v   = getVitality(h.last_session_at)
            return (
              <button key={h.id}
                className={`hsb-item${selected?.id === h.id ? ' active' : ''}`}
                onClick={() => setSelected(h)}
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className="hsb-tree-thumb">
                  <HobbyTree hobby={h} size="mini" />
                </div>
                <div className="hsb-item-info">
                  <div className="hsb-item-name">{h.name}</div>
                  <div className="hsb-item-meta">
                    {cfg.emoji} {cfg.label}
                    <span className="hsb-vitality-dot" style={{
                      background: v > 0.7 ? 'var(--green)' : v > 0.4 ? '#e0a040' : 'var(--red)'
                    }} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <button className="hsb-add-full" onClick={() => setShowAddModal(true)}>
          + New hobby
        </button>
        <button className="hsb-stages-btn" onClick={() => setShowStages(true)}>
          📊 Growing stages
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="hobbies-main">
        {selected ? (
          <HobbyDetail
            key={selected.id}
            hobby={hobbies.find(h => h.id === selected.id) || selected}
            userId={userId}
            onHobbyUpdate={handleHobbyUpdate}
            onDelete={handleDelete}
          />
        ) : (
          <div className="hobbies-empty-state">
            <div className="hes-icon">🌱</div>
            <h2>Start growing today</h2>
            <p>Every session makes your tree grow. Miss practice and it fades. Keep it alive.</p>
            <button className="btn-primary" onClick={() => setShowAddModal(true)}>
              Plant your first tree
            </button>
          </div>
        )}
      </main>

      {showAddModal && (
        <AddHobbyModal userId={userId} onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
      )}
      {showStages && <GrowingStagesChart onClose={() => setShowStages(false)} />}
    </div>
  )
}
