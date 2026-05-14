import { ACCENT_COLORS, FONTS } from '../settings'
import './Settings.css'

const MODES = [
  { id: 'ocean', icon: '🌊', label: 'Ocean Calm' },
  { id: 'light', icon: '☀',  label: 'Light'      },
  { id: 'dark',  icon: '🌙', label: 'Dark'        },
]

const ALL_HEALTH_METRICS = [
  { id: 'energy',    label: 'Energy score',     emoji: '⚡', soon: false },
  { id: 'sleep',     label: 'Sleep',            emoji: '😴', soon: false },
  { id: 'stress',    label: 'Stress',           emoji: '🧘', soon: false },
  { id: 'workout',   label: 'Workout',          emoji: '🏋️', soon: true  },
  { id: 'steps',     label: 'Steps',            emoji: '👟', soon: true  },
  { id: 'meditation',label: 'Meditation',       emoji: '🧘‍♀️', soon: true  },
  { id: 'weight',    label: 'Body composition', emoji: '⚖️', soon: true  },
  { id: 'bpm',       label: 'Heart rate',       emoji: '❤️', soon: true  },
  { id: 'bp',        label: 'Blood pressure',   emoji: '🩺', soon: true  },
  { id: 'glucose',   label: 'Glucose',          emoji: '🩸', soon: true  },
  { id: 'period',    label: 'Period tracker',   emoji: '🌸', soon: true  },
  { id: 'medication',label: 'Medication',       emoji: '💊', soon: true  },
]

export default function Settings({ settings, onUpdate, onBack }) {
  const { mode, color, font, healthEnabled = true, healthMetrics = ['energy','sleep','stress'] } = settings

  function toggleMetric(id) {
    const next = healthMetrics.includes(id)
      ? healthMetrics.filter(m => m !== id)
      : [...healthMetrics, id]
    onUpdate({ healthMetrics: next })
  }

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

      {/* ── Health ── */}
      <section className="settings-section">
        <h2 className="section-title">Health</h2>

        <div className="setting-row" style={{ alignItems:'center' }}>
          <label className="setting-label">Health tracking</label>
          <button
            className={`settings-toggle${healthEnabled ? ' on' : ''}`}
            onClick={() => onUpdate({ healthEnabled: !healthEnabled })}
            aria-pressed={healthEnabled}
          >
            <span className="toggle-knob" />
          </button>
        </div>
        <p className="ocean-note" style={{ marginTop: 0 }}>
          {healthEnabled ? 'Health page is visible in the sidebar.' : 'Health page is hidden. Your data is preserved.'}
        </p>

        {healthEnabled && (
          <>
            <label className="setting-label" style={{ marginBottom: 10, display:'block' }}>Metrics to track</label>
            <div className="health-metric-grid">
              {ALL_HEALTH_METRICS.map(m => (
                <button
                  key={m.id}
                  className={`health-metric-opt${healthMetrics.includes(m.id) ? ' active' : ''}${m.soon ? ' soon' : ''}`}
                  onClick={() => !m.soon && toggleMetric(m.id)}
                  disabled={m.soon}
                  title={m.soon ? 'Coming soon' : undefined}
                >
                  <span>{m.emoji}</span>
                  <span>{m.label}</span>
                  {m.soon && <span className="soon">soon</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

    </div>
  )
}
