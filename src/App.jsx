import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Home     from './pages/Home.jsx'
import Health   from './pages/Health.jsx'
import Routines from './pages/Routines.jsx'
import Calendar from './pages/Calendar.jsx'
import Tasks         from './pages/Tasks.jsx'
import Projects      from './pages/Projects.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import FocusSession  from './pages/FocusSession.jsx'
import Journal       from './pages/Journal.jsx'
import Settings      from './pages/Settings.jsx'
import Auth from './pages/Auth.jsx'
import { initSettings, getSettings, saveSettings } from './settings'
import { getXP, getLevel, getLevelProgress, getXPIntoLevel } from './xp'
import { supabase } from './supabase'
import { syncXPFromDb } from './xp'
import './App.css'
import './fonts/fonts.css'

function AccountPage({ user, onSignOut, onBack }) {
  const [newPw,   setNewPw]   = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [err,     setErr]     = useState('')

  async function handleChangePw(e) {
    e.preventDefault()
    setMsg(''); setErr('')
    if (newPw.length < 6)   { setErr('Password must be at least 6 characters.'); return }
    if (newPw !== confirm)  { setErr("Passwords don't match."); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) setErr(error.message)
    else { setMsg('Password updated! You can now log in with it.'); setNewPw(''); setConfirm('') }
  }

  return (
    <div className="placeholder-page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1>Account</h1>
      <p style={{ color:'var(--text2)', fontSize:14, marginBottom:'2rem' }}>{user?.email}</p>

      <div style={{ maxWidth: 360 }}>
        <h2 style={{ fontSize:15, fontWeight:600, color:'var(--text1)', marginBottom:'1rem' }}>Change password</h2>
        <form onSubmit={handleChangePw} style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <input
            type="password" placeholder="New password" minLength={6} required
            value={newPw} onChange={e => setNewPw(e.target.value)}
            style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border2)',
                     background:'var(--card)', color:'var(--text1)', fontSize:14, outline:'none' }}
          />
          <input
            type="password" placeholder="Confirm new password" minLength={6} required
            value={confirm} onChange={e => setConfirm(e.target.value)}
            style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border2)',
                     background:'var(--card)', color:'var(--text1)', fontSize:14, outline:'none' }}
          />
          {err && <p style={{ color:'var(--red)',   fontSize:13, margin:0 }}>{err}</p>}
          {msg && <p style={{ color:'var(--green)', fontSize:13, margin:0 }}>{msg}</p>}
          <button type="submit" disabled={saving}
            style={{ padding:'9px 16px', borderRadius:8, background:'var(--accent)',
                     color:'#fff', fontWeight:600, fontSize:14, border:'none',
                     cursor:'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>

      <div style={{ marginTop:'2.5rem' }}>
        <button className="btn-danger btn-sm" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  )
}

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

      <div className="mobile-header">
        <button className="hamburger-btn" onClick={() => setDrawerOpen(d => !d)} aria-label="Open menu">☰</button>
        <div className="logo">add<span>app</span></div>
      </div>

      {drawerOpen && <div className="drawer-backdrop" onClick={closeDrawer} />}

      <nav className="sidebar">
        <div className="sb-head">
          {showFull && <div className="logo">add<span>app</span></div>}
          <button className="sb-toggle" onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        <div className="nav-links">
          <NavLink to="/" end
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Home' : undefined} onClick={closeDrawer}>
            <span className="nav-icon">🏠</span>
            {showFull && <span>Home</span>}
          </NavLink>

          <NavLink to="/routines"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Routines' : undefined} onClick={closeDrawer}>
            <span className="nav-icon">⚡</span>
            {showFull && <span>Routines</span>}
          </NavLink>

          <NavLink to="/calendar"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Calendar' : undefined} onClick={closeDrawer}>
            <span className="nav-icon">📅</span>
            {showFull && <span>Calendar</span>}
          </NavLink>

          <NavLink to="/tasks"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Tasks' : undefined} onClick={closeDrawer}>
            <span className="nav-icon">✅</span>
            {showFull && <span>Tasks</span>}
          </NavLink>

          <NavLink to="/projects"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Projects' : undefined} onClick={closeDrawer}>
            <span className="nav-icon">📁</span>
            {showFull && <span>Projects</span>}
          </NavLink>

          <NavLink to="/focus"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Focus Session' : undefined} onClick={closeDrawer}>
            <span className="nav-icon">🎯</span>
            {showFull && <span>Focus Session</span>}
          </NavLink>

          {settings.healthEnabled !== false && (
            <NavLink to="/health"
              className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
              title={!showFull ? 'Health' : undefined} onClick={closeDrawer}>
              <span className="nav-icon">💚</span>
              {showFull && <span>Health</span>}
            </NavLink>
          )}

          <NavLink to="/journal"
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            title={!showFull ? 'Journal' : undefined} onClick={closeDrawer}>
            <span className="nav-icon">📓</span>
            {showFull && <span>Journal</span>}
          </NavLink>
        </div>

        <div className="sb-action-btns">
          <button className="sb-action-btn" onClick={() => navTo('/account')}
            title={!showFull ? 'Account' : undefined}>
            <span className="nav-icon">👤</span>
            {showFull && <span>Account</span>}
          </button>
          <button className="sb-action-btn" onClick={() => navTo('/settings')}
            title={!showFull ? 'Settings' : undefined}>
            <span className="nav-icon">⚙</span>
            {showFull && <span>Settings</span>}
          </button>
        </div>

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

      <main className="main">
        <Routes>
          <Route path="/"          element={<Home     userId={user?.id} />} />
          <Route path="/routines" element={<Routines userId={user?.id} />} />
          <Route path="/calendar" element={<Calendar userId={user?.id} />} />
          <Route path="/tasks"        element={<Tasks         userId={user?.id} />} />
          <Route path="/projects"     element={<Projects      userId={user?.id} />} />
          <Route path="/projects/:id" element={<ProjectDetail userId={user?.id} />} />
          <Route path="/focus"        element={<FocusSession  userId={user?.id} />} />
          <Route path="/health"       element={<Health        userId={user?.id} />} />
          <Route path="/journal"      element={<Journal       userId={user?.id} />} />
          <Route path="/settings" element={
            <Settings settings={settings} onUpdate={updateSettings} onBack={() => navigate('/')} />
          } />
          <Route path="/account" element={
            <AccountPage user={user} onSignOut={handleSignOut} onBack={() => navigate('/')} />
          } />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [user, setUser]               = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

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
        justifyContent: 'center', background: 'var(--bg)', color: 'var(--text3)', fontSize: 14
      }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return <BrowserRouter><Auth /></BrowserRouter>
  }

  return (
    <BrowserRouter>
      <AppShell user={user} />
    </BrowserRouter>
  )
}
