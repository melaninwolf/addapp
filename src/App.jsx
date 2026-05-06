import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Routines from './pages/Routines.jsx'
import './App.css'

export default function App() {
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
