import './Home.css'

const STAT_CARDS = [
  { emoji: '⚡', label: 'Routines completed',  key: 'routines' },
  { emoji: '🎯', label: 'Focus sessions',       key: 'focus'    },
  { emoji: '✅', label: 'Tasks done',           key: 'tasks'    },
  { emoji: '📁', label: 'Active projects',      key: 'projects' },
]

const QUICK_LINKS = [
  { emoji: '⚡', label: 'Routines',      to: '/routines' },
  { emoji: '📅', label: 'Calendar',      to: '/calendar' },
  { emoji: '✅', label: 'Tasks',         to: '/tasks'    },
  { emoji: '📁', label: 'Projects',      to: '/projects' },
  { emoji: '🎯', label: 'Focus Session', to: '/focus'    },
]

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

      {/* Stat cards — placeholder until dashboard is built */}
      <div className="home-stats-grid">
        {STAT_CARDS.map(c => (
          <div key={c.key} className="home-stat-card">
            <div className="hsc-emoji">{c.emoji}</div>
            <div className="hsc-body">
              <div className="hsc-label">{c.label}</div>
              <div className="hsc-val hsc-soon">Coming soon</div>
            </div>
          </div>
        ))}
      </div>

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
