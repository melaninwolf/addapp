import { useState, useEffect } from 'react'
import { getXP, getLevel, getXPIntoLevel,
         getMatter, getAntimatter, getMatterProgress, getAntimatterProgress,
         getAUTraveled, getCurrentDestination, getNextDestination } from '../xp'
import './Home.css'

const QUICK_LINKS = [
  { emoji: '⚡', label: 'Routines',      to: '/routines' },
  { emoji: '📅', label: 'Calendar',      to: '/calendar' },
  { emoji: '✅', label: 'Tasks',         to: '/tasks'    },
  { emoji: '📁', label: 'Projects',      to: '/projects' },
  { emoji: '🎯', label: 'Focus Session', to: '/focus'    },
]

// ── Current Mission Card ──────────────────────────────────────
function MissionCard() {
  const [xp, setXp] = useState(() => getXP())

  useEffect(() => {
    const handler = () => setXp(getXP())
    window.addEventListener('xp-update', handler)
    return () => window.removeEventListener('xp-update', handler)
  }, [])

  const level        = getLevel(xp)
  const gramsIn      = getXPIntoLevel(xp)
  const dest         = getCurrentDestination(xp)
  const next         = getNextDestination(xp)
  const matter       = getMatter(xp)
  const antimatter   = getAntimatter(xp)
  const matterProg   = getMatterProgress(xp)
  const antiProg     = getAntimatterProgress(xp)
  const au           = getAUTraveled(xp)
  const isMatter     = level % 2 === 1   // odd level = collecting matter

  // Progress toward next destination in AU
  const prevDest = next
    ? { au: dest.au }
    : null
  const destProgress = next
    ? Math.min(((au - dest.au) / (next.au - dest.au)) * 100, 100)
    : 100

  return (
    <div className="mission-card">
      {/* Header */}
      <div className="mission-header">
        <span className="mission-label">CURRENT MISSION</span>
        <span className="mission-lvl">LVL {level}</span>
      </div>

      {/* Destination */}
      <div className="mission-dest-row">
        <span className="mission-dest-icon">{dest.emoji}</span>
        <div className="mission-dest-info">
          <span className="mission-dest-name">{dest.name}</span>
          {next && (
            <span className="mission-dest-next">
              Next: {next.emoji} {next.name} ({next.au < 1 ? next.au.toFixed(4) : next.au.toLocaleString()} AU)
            </span>
          )}
        </div>
        <div className="mission-au">
          <span className="mission-au-val">{au < 1 ? au.toFixed(4) : au.toFixed(2)}</span>
          <span className="mission-au-unit">AU</span>
        </div>
      </div>

      {/* Destination progress bar */}
      {next && (
        <div className="mission-dest-bar-wrap">
          <div className="mission-dest-bar-track">
            <div className="mission-dest-bar-fill" style={{ width: `${destProgress}%` }} />
          </div>
          <span className="mission-dest-bar-pct">{destProgress.toFixed(0)}%</span>
        </div>
      )}

      {/* Fuel section */}
      <div className="mission-fuel-section">
        <div className="mission-fuel-title">
          {isMatter ? '⚛️ Collecting Matter' : '⚡ Collecting Antimatter'}
          <span className="mission-fuel-note"> · {gramsIn}g / 100g to next level</span>
        </div>

        <div className="mission-fuel-bars">
          {/* Matter */}
          <div className="mission-fuel-row">
            <span className="mission-fuel-icon">⚛️</span>
            <div className="mission-fuel-track">
              <div className="mission-fuel-fill mfill-matter"
                style={{ width: `${(matterProg / 2.5) * 100}%` }} />
            </div>
            <span className="mission-fuel-val">{matterProg.toFixed(1)} / 2.5g</span>
          </div>

          {/* Antimatter */}
          <div className="mission-fuel-row">
            <span className="mission-fuel-icon">⚡</span>
            <div className="mission-fuel-track">
              <div className="mission-fuel-fill mfill-anti"
                style={{ width: `${(antiProg / 2.5) * 100}%` }} />
            </div>
            <span className="mission-fuel-val">{antiProg.toFixed(1)} / 2.5g</span>
          </div>
        </div>

        <div className="mission-fuel-totals">
          <span>⚛️ {matter}g total matter</span>
          <span>⚡ {antimatter}g total antimatter</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function Home({ userId }) {
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
                'Good evening'

  return (
    <div className="home-page">

      {/* Greeting */}
      <div className="home-greeting">
        <h1 className="home-title">{greeting} 👋</h1>
        <p className="home-sub">Here's your overview for today.</p>
      </div>

      {/* Current Mission */}
      <MissionCard />

      {/* Quick nav */}
      <div className="home-section-label">Quick access</div>
      <div className="home-quick-links">
        {QUICK_LINKS.map(l => (
          <a key={l.to} href={l.to} className="home-quick-card">
            <span className="hqc-emoji">{l.emoji}</span>
            <span className="hqc-label">{l.label}</span>
            <span className="hqc-arrow">→</span>
          </a>
        ))}
      </div>

    </div>
  )
}
