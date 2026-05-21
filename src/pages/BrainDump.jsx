import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'
import './BrainDump.css'

// ── Debounce helper ──────────────────────────────────────────
function useDebounce(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

export default function BrainDump({ userId }) {
  const [noteText,     setNoteText]     = useState('')
  const [items,        setItems]        = useState([])
  const [newItem,      setNewItem]      = useState('')
  const [loading,      setLoading]      = useState(true)
  const [saveStatus,   setSaveStatus]   = useState('saved') // 'saved' | 'saving' | 'unsaved'
  const [clearConfirm, setClearConfirm] = useState(false)
  const [penMode,      setPenMode]      = useState(false)
  const textareaRef = useRef(null)
  const penCanvasRef = useRef(null)
  const penDrawing  = useRef(false)
  const penLastPos  = useRef(null)

  // ── Pen canvas drawing ────────────────────────────────────
  function getPenPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches?.[0] || e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }
  function penStart(e) {
    penDrawing.current = true
    penLastPos.current = getPenPos(e, penCanvasRef.current)
  }
  function penMove(e) {
    if (!penDrawing.current) return
    e.preventDefault()
    const canvas = penCanvasRef.current
    const ctx    = canvas.getContext('2d')
    const pos    = getPenPos(e, canvas)
    ctx.beginPath()
    ctx.strokeStyle = 'var(--text1, #e5e5e5)'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.moveTo(penLastPos.current.x, penLastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    penLastPos.current = pos
  }
  function penEnd() { penDrawing.current = false; penLastPos.current = null }
  function clearPen() {
    const canvas = penCanvasRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  // ── Load data ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setLoading(false); return }
    Promise.all([
      supabase.from('brain_dump_notes').select('content').eq('user_id', userId).single(),
      supabase.from('brain_dump_items').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    ]).then(([noteRes, itemsRes]) => {
      setNoteText(noteRes.data?.content || '')
      setItems(itemsRes.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [userId])

  // ── Auto-resize textarea ──────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [noteText])

  // ── Save note (debounced) ─────────────────────────────────
  const persistNote = useCallback(async (text) => {
    if (!userId) return
    setSaveStatus('saving')
    await supabase.from('brain_dump_notes').upsert(
      { user_id: userId, content: text, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    setSaveStatus('saved')
  }, [userId])

  const debouncedSave = useDebounce(persistNote, 1200)

  function handleNoteChange(e) {
    setNoteText(e.target.value)
    setSaveStatus('unsaved')
    debouncedSave(e.target.value)
  }

  // ── Add item ──────────────────────────────────────────────
  async function addItem() {
    const text = newItem.trim()
    if (!text || !userId) return
    setNewItem('')
    const { data } = await supabase.from('brain_dump_items')
      .insert({ user_id: userId, content: text, order_index: items.length })
      .select().single()
    if (data) setItems(prev => [...prev, data])
  }

  function handleItemKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addItem() }
  }

  // ── Delete item ───────────────────────────────────────────
  async function deleteItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('brain_dump_items').delete().eq('id', id)
  }

  // ── Clear all items ───────────────────────────────────────
  async function clearAllItems() {
    if (!userId) return
    setItems([])
    setClearConfirm(false)
    await supabase.from('brain_dump_items').delete().eq('user_id', userId)
  }

  // ── Save status label ─────────────────────────────────────
  const statusLabel = saveStatus === 'saving'  ? 'Saving…'
                    : saveStatus === 'unsaved' ? 'Unsaved'
                    : '✓ Saved'

  if (loading) return (
    <div className="bd-loading">Loading…</div>
  )

  return (
    <div className="bd-page">
      <div className="bd-header">
        <div>
          <p className="page-tagline">Clear your head. Capture everything.</p>
          <h1 className="page-title">Brain Dump</h1>
        </div>
      </div>

      {/* ── Freeform dump area ─────────────────────────── */}
      <div className="bd-section">
        <div className="bd-section-label">
          <span>📝 Dump it all out</span>
          <div className="bd-section-right">
            <button
              className={`bd-pen-btn${penMode ? ' active' : ''}`}
              onClick={() => setPenMode(m => !m)}
              title={penMode ? 'Switch to text mode' : 'Switch to pen mode'}
            >✏️ {penMode ? 'Pen On' : 'Pen'}</button>
            {penMode && (
              <button className="bd-pen-clear" onClick={clearPen} title="Clear drawing">🗑 Clear</button>
            )}
            {!penMode && (
              <span className={`bd-save-status ${saveStatus}`}>{statusLabel}</span>
            )}
          </div>
        </div>
        <div className="bd-dump-wrap">
          <textarea
            ref={textareaRef}
            className="bd-textarea"
            placeholder="What's swirling around in your head? Just get it out — no structure needed. Worries, ideas, half-thoughts, things you need to do, random observations… all of it."
            value={noteText}
            onChange={handleNoteChange}
            spellCheck={false}
            style={penMode ? { pointerEvents: 'none', userSelect: 'none' } : {}}
          />
          {penMode && (
            <canvas
              ref={penCanvasRef}
              className="bd-pen-canvas"
              width={760}
              height={400}
              onMouseDown={penStart}
              onMouseMove={penMove}
              onMouseUp={penEnd}
              onMouseLeave={penEnd}
              onTouchStart={penStart}
              onTouchMove={penMove}
              onTouchEnd={penEnd}
            />
          )}
        </div>
      </div>

      {/* ── Quick-capture list ─────────────────────────── */}
      <div className="bd-section">
        <div className="bd-section-label">
          <span>⚡ Quick capture</span>
          {items.length > 0 && (
            <button className="bd-clear-btn" onClick={() => setClearConfirm(true)}>
              Clear all
            </button>
          )}
        </div>

        <div className="bd-input-row">
          <input
            className="bd-item-input"
            placeholder="One thought, one line — hit Enter to add"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={handleItemKeyDown}
          />
          <button
            className="bd-add-btn"
            onClick={addItem}
            disabled={!newItem.trim()}
          >Add</button>
        </div>

        {items.length > 0 ? (
          <ul className="bd-items">
            {items.map(item => (
              <li key={item.id} className="bd-item">
                <span className="bd-item-dot" />
                <span className="bd-item-text">{item.content}</span>
                <button
                  className="bd-item-del"
                  onClick={() => deleteItem(item.id)}
                  title="Remove"
                >✕</button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bd-items-empty">
            Nothing captured yet — type something above and hit Enter.
          </div>
        )}
      </div>

      {/* ── Clear confirm ──────────────────────────────── */}
      {clearConfirm && (
        <div className="modal-overlay" onClick={() => setClearConfirm(false)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Clear all items?</h2>
              <button className="modal-close" onClick={() => setClearConfirm(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
                This will delete all {items.length} quick-capture item{items.length !== 1 ? 's' : ''}. The freeform dump above stays untouched.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setClearConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={clearAllItems}>Clear all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
