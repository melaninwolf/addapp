import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Routines from './pages/Routines.jsx'
import Settings from './pages/Settings.jsx'
import { initSettings, getSettings, saveSettings } from './settings'
import './App.css'
import './fonts/fonts.css'

function AppShell() {
  const [collapsed, setCollapsed]   = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth <= 768)
  const [settings,  setSettings]    = useState(() => getSettings())
  const navigate = useNavigate()

  useEffect(() => { initSettings() }, [])

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // On mobile the sidebar is never "collapsed" — it's a drawer that's open or shut
  const showFull = !collapsed || isMobile

  function updateSettings(partial) {
    const next = saveSettings(partial)
    setSettings(next)
  }

  function closeDrawer() { setDrawerOpen(false) }

  function navTo(path) {
    navigate(path)
    closeDrawer()
  }

  return (
    <div className={`layout${collapsed ? ' sb-collapsed' : ''}${drawerOpen ? ' sb-open' : ''}`}>

      {/* ── MOBILE HEADER ── */}
      <div className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(d => !d)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <div className="logo">add<span>app</span></div>
      </div>

      {/* ── DRAWER BACKDROP ── */}
      {drawerOpen && <div className="drawer-backdrop" onClick={closeDrawer} />}

      {/* ── SIDEBAR ── */}
      <nav className="sidebar">

        {/* Logo + collapse */}
        <div className="sb-head">
          {showFull && <div className="logo">add<span>app</span></div>}
          <button
            className="sb-toggle"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Nav links */}
        <div className="nav-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Routines' : undefined}
            onClick={closeDrawer}
          >
            <span className="nav-icon">⚡</span>
            {showFull && <span>Routines</span>}
          </NavLink>

          {[
            { icon: '✅', label: 'Tasks'         },
            { icon: '📅', label: 'Calendar'      },
            { icon: '💚', label: 'Health'        },
            { icon: '📓', label: 'Journal'       },
            { icon: '🎯', label: 'Focus Session'  },
          ].map(item => (
            <div key={item.label} className="nav-item disabled" title={!showFull ? item.label : undefined}>
              <span className="nav-icon">{item.icon}</span>
              {showFull && (
                <>
                  <span>{item.label}</span>
                  <span className="soon">soon</span>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Account + Settings */}
        <div className="sb-action-btns">
          <button
            className="sb-action-btn"
            onClick={() => navTo('/account')}
            title={!showFull ? 'Account' : undefined}
          >
            <span className="nav-icon">👤</span>
            {showFull && <span>Account</span>}
          </button>
          <button
            className="sb-action-btn"
            onClick={() => navTo('/settings')}
            title={!showFull ? 'Settings' : undefined}
          >
            <span className="nav-icon">⚙</span>
            {showFull && <span>Settings</span>}
          </button>
        </div>

        {/* Sidebar footer: XP bar */}
        <div className="sidebar-footer">
          <div className="xp-block">
            <div className="xp-top">
              <span className="xp-label">LVL 1</span>
              {showFull && <span className="xp-pts">0 XP</span>}
            </div>
            <div className="xp-track">
              <div className="xp-fill" style={{ width: '0%' }} />
            </div>
          </div>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main className="main">
        <Routes>
          <Route path="/"        element={<Routines />} />
          <Route path="/settings" element={
            <Settings
              settings={settings}
              onUpdate={updateSettings}
              onBack={() => navigate('/')}
            />
          } />
          <Route path="/account" element={
            <div className="placeholder-page">
              <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
              <h1>Account</h1>
              <p>Sign-in and profile settings coming in Phase 8 — Supabase auth.</p>
            </div>
          } />
        </Routes>
      </main>

    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
