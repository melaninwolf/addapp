import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Routines from './pages/Routines.jsx'
import Settings from './pages/Settings.jsx'
import Auth from './pages/Auth.jsx'
import { initSettings, getSettings, saveSettings } from './settings'
import { getXP, getLevel, getLevelProgress, getXPIntoLevel } from './xp'
import { supabase } from './supabase'
import { syncXPFromDb } from './xp'
import './App.css'
import './fonts/fonts.css'

function AppShell({ user }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth <= 768)
  const [settings,  setSettings]    = useState(() => getSettings())
  const [xp,        setXp]          = useState(() => getXP())
  const navigate = useNavigate()

  useEffect(() => { initSettings() }, [])

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const handler = () => setXp(getXP())
    window.addEventListener('xp-update', handler)
    return () => window.removeEventListener('xp-update', handler)
  }, [])

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

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className={`layout${collapsed ? ' sb-collapsed' : ''}${drawerOpen ? ' sb-open' : ''}`}>

      {/* ── MOBILE HEADER ── */}
      <div className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(d => !d)}
          aria-label="Open menu"
        >☰</button>
        <div className="logo">add<span>app</span></div>
      </div>

      {/* ── DRAWER BACKDROP ── */}
      {drawerOpen && <div className="drawer-backdrop" onClick={closeDrawer} />}

      {/* ── SIDEBAR ── */}
      <nav className="sidebar">

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
              <span className="xp-label">LVL {getLevel(xp)}</span>
              {showFull && <span className="xp-pts">{getXPIntoLevel(xp)} / 100 XP</span>}
            </div>
            <div className="xp-track">
              <div className="xp-fill" style={{ width: getLevelProgress(xp) + '%' }} />
            </div>
          </div>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main className="main">
        <Routes>
          <Route path="/"        element={<Routines userId={user?.id} />} />
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
              <p style={{color:'var(--text2)', fontSize:14, marginBottom:'1.5rem'}}>{user?.email}</p>
              <button className="btn-danger btn-sm" onClick={handleSignOut}>Sign out</button>
            </div>
          } />
        </Routes>
      </main>

    </div>
  )
}

export default function App() {
  const [user, setUser]           = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN') syncXPFromDb()
    })

    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)', color: 'var(--text3)',
        fontSize: 14
      }}>
        Loading…
      </div>
    )
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Auth />
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <AppShell user={user} />
    </BrowserRouter>
  )
}
