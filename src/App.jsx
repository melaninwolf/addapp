import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Routines from './pages/Routines.jsx'
import Settings from './pages/Settings.jsx'
import { initSettings, getSettings, saveSettings } from './settings'
import './App.css'
import './fonts/fonts.css'

function AppShell() {
  const [collapsed, setCollapsed]   = useState(false)
  const [settings,  setSettings]    = useState(() => getSettings())
  const navigate = useNavigate()

  useEffect(() => { initSettings() }, [])

  function updateSettings(partial) {
    const next = saveSettings(partial)
    setSettings(next)
  }

  const { mode } = settings

  return (
    <div className={`layout${collapsed ? ' sb-collapsed' : ''}`}>

      {/* ── SIDEBAR ── */}
      <nav className="sidebar">

        {/* Logo + collapse */}
        <div className="sb-head">
          {!collapsed && <div className="logo">add<span>app</span></div>}
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
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={collapsed ? 'Routines' : undefined}>
            <span className="nav-icon">⚡</span>
            {!collapsed && <span>Routines</span>}
          </NavLink>

          {[
            { icon: '✅', label: 'Tasks'        },
            { icon: '📅', label: 'Calendar'     },
            { icon: '💚', label: 'Health'       },
            { icon: '📓', label: 'Journal'      },
            { icon: '🎯', label: 'Focus Session' },
          ].map(item => (
            <div key={item.label} className="nav-item disabled" title={collapsed ? item.label : undefined}>
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && (
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
            onClick={() => navigate('/account')}
            title={collapsed ? 'Account' : undefined}
          >
            <span className="nav-icon">👤</span>
            {!collapsed && <span>Account</span>}
          </button>
          <button
            className="sb-action-btn"
            onClick={() => navigate('/settings')}
            title={collapsed ? 'Settings' : undefined}
          >
            <span className="nav-icon">⚙</span>
            {!collapsed && <span>Settings</span>}
          </button>
        </div>

        {/* Sidebar footer: XP + mode strip */}
        <div className="sidebar-footer">

          <div className="xp-block">
            <div className="xp-top">
              <span className="xp-label">LVL 1</span>
              {!collapsed && <span className="xp-pts">0 XP</span>}
            </div>
            <div className="xp-track">
              <div className="xp-fill" style={{ width: '0%' }} />
            </div>
          </div>

          {/* Quick mode toggle */}
          <div className="mode-strip">
            {[
              { id: 'ocean', icon: '🌊', label: 'Ocean' },
              { id: 'light', icon: '☀',  label: 'Light' },
              { id: 'dark',  icon: '🌙', label: 'Dark'  },
            ].map(m => (
              <button
                key={m.id}
                className={`mode-pill${mode === m.id ? ' active' : ''}`}
                onClick={() => updateSettings({ mode: m.id })}
                title={collapsed ? m.label : undefined}
              >
                <span>{m.icon}</span>
                {!collapsed && <span>{m.label}</span>}
              </button>
            ))}
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
