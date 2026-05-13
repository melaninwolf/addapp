import { ACCENT_COLORS, FONTS } from '../settings'
import './Settings.css'

const MODES = [
  { id: 'ocean', icon: '🌊', label: 'Ocean Calm' },
  { id: 'light', icon: '☀',  label: 'Light'      },
  { id: 'dark',  icon: '🌙', label: 'Dark'        },
]

export default function Settings({ settings, onUpdate, onBack }) {
  const { mode, color, font } = settings

  return (
    <div className="settings-page">

      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1>Settings</h1>
      </div>

      {/* ── Appearance ── */}
      <section className="settings-section">
        <h2 className="section-title">Appearance</h2>

        <div className="setting-row">
          <label className="setting-label">Mode</label>
          <div className="mode-row">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`settings-mode-btn${mode === m.id ? ' active' : ''}`}
                onClick={() => onUpdate({ mode: m.id })}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {mode === 'ocean' ? (
          <p className="ocean-note">
            Ocean Calm uses its own carefully chosen palette — no custom colour needed.
          </p>
        ) : (
          <div className="setting-row">
            <label className="setting-label">Accent colour</label>
            <div className="swatch-grid">
              {ACCENT_COLORS.map(c => (
                <button
                  key={c.hex}
                  className={`swatch${color === c.hex ? ' selected' : ''}`}
                  style={{
                    background: c.hex,
                    outline: c.name === 'White' ? '1.5px solid #999' : 'none',
                    outlineOffset: '1px',
                  }}
                  title={c.name}
                  onClick={() => onUpdate({ color: c.hex })}
                  aria-label={c.name}
                  aria-pressed={color === c.hex}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Font ── */}
      <section className="settings-section">
        <h2 className="section-title">Font</h2>
        <div className="font-grid">
          {FONTS.map(f => (
            <button
              key={f.id}
              className={`font-opt${font === f.id ? ' active' : ''}`}
              onClick={() => onUpdate({ font: f.id })}
              aria-pressed={font === f.id}
            >
              <span className="font-preview" style={{ fontFamily: f.family }}>Aa</span>
              <span className="font-name">{f.name}</span>
              <span className="font-sample" style={{ fontFamily: f.family }}>
                The quick brown fox
              </span>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
