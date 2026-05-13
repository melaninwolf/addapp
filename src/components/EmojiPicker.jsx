import { useState, useRef, useEffect } from 'react'
import './EmojiPicker.css'

const EMOJIS = [
  '📅','✅','🔔','🎉','⏰','💼','🏠','🏋️','📚','🍽️',
  '💊','🧘','🏃','🎯','📝','🌅','🌙','💻','🕹️','⚡',
  '🔥','💪','😊','😴','🤔','🎯','📌','⭐','❤️','🧩',
  '🎵','🎨','🏆','🌟','💡','🎮','📱','🚀','🍎','🥗',
  '💤','🌿','✨','🎂','✈️','🏖️','🎬','🛒','🧠','📊',
  '🔑','🌈','🦋','🐾','🌺','🍀','🎁','🏅','🧪','🎤',
]

export default function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="ep-wrap" ref={wrapRef}>
      <button
        className="ep-trigger"
        type="button"
        title="Change emoji"
        onClick={() => setOpen(v => !v)}
      >
        {value}
      </button>
      {open && (
        <div className="ep-panel">
          <div className="ep-grid">
            {EMOJIS.map(em => (
              <button
                key={em}
                className={`ep-opt${em === value ? ' ep-opt-active' : ''}`}
                type="button"
                onClick={() => { onChange(em); setOpen(false) }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
