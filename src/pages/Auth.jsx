import { useState } from 'react'
import { supabase } from '../supabase'
import './Auth.css'

export default function Auth() {
  const [mode, setMode]       = useState('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  function switchMode(m) {
    setMode(m)
    setError('')
    setSuccess('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('Check your email to confirm your account, then sign in.')
    }

    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">add<span>app</span></div>
        <p className="auth-tagline">Your ADHD command center</p>

        <div className="auth-toggle">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >Sign in</button>
          <button
            type="button"
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => switchMode('signup')}
          >Create account</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error   && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
