import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Routines from './pages/Routines.jsx'
import './App.css'

const THEMES = [
  { id: 'ocean',  label: 'Ocean Calm',    dot: '#38BDF8' },
  { id: 'dark',   label: 'Dark Focus',    dot: '#8B7EFF' },
  { id: 'light',  label: 'Light & Clean', dot: '#6355E8' },
  { id: 'energy', label: 'Energy',        dot: '#F59E0B' },
  { id: 'soft',   label: 'Soft',          dot: '#E879F9' },
]

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('addapp-theme') || 'ocean')
  const [themeOpen, setThemeOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('addapp-theme', theme)
  }, [theme])

  function pickTheme(id) {
    setTheme(id)
    setThemeOpen(false)
  }

  const currentTheme = THEMES.find(t => t.id === theme)

  return (
    <BrowserRouter>
      <div className="layout">
        <nav className="sidebar">
          <div className="logo">add<span>app</span></div>
          <div className="nav-links">
            <NavLink to="/" end className={({isActive})=>isActive?'nav-item active':'nav-item'}>
              <span className="nav-icon">⚡</span>
              <span>Routines</span>
            </NavLink>
            <div className="nav-item disabled">
              <span className="nav-icon">✅</span>
              <span>Tasks</span>
              <span className="soon">soon</span>
            </div>
            <div className="nav-item disabled">
              <span className="nav-icon">📅</span>
              <span>Calendar</span>
              <span className="soon">soon</span>
            </div>
            <div className="nav-item disabled">
              <span className="nav-icon">💚</span>
              <span>Health</span>
              <span className="soon">soon</span>
            </div>
            <div className="nav-item disabled">
              <span className="nav-icon">📓</span>
              <span>Journal</span>
              <span className="soon">soon</span>
            </div>
          </div>

          <div className="sidebar-footer">
            <div className="theme-switcher">
              <button className="theme-trigger" onClick={() => setThemeOpen(o => !o)}>
                <span className="theme-dot" style={{background: currentTheme.dot}} />
                <span className="theme-trigger-label">{currentTheme.label}</span>
                <span className="theme-caret">{themeOpen ? '▴' : '▾'}</span>
              </button>
              {themeOpen && (
                <div className="theme-dropdown">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      className={`theme-option ${theme === t.id ? 'active' : ''}`}
                      onClick={() => pickTheme(t.id)}
                    >
                      <span className="theme-dot" style={{background: t.dot}} />
                      <span>{t.label}</span>
                      {theme === t.id && <span className="theme-check">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="xp-block">
              <div className="xp-top">
                <span className="xp-label">LVL 1</span>
                <span className="xp-pts">0 XP</span>
              </div>
              <div className="xp-track">
                <div className="xp-fill" style={{width:'0%'}}></div>
              </div>
            </div>
          </div>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Routines />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
