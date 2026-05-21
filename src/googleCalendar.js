// ─── Google Calendar integration ────────────────────────────────────────────
//
// Web:    GIS token model (popup) — works in browser.
// Native: @capacitor/browser opens Chrome Custom Tabs for OAuth (PKCE flow),
//         then the deep-link com.mar.addapp://oauth2callback returns the code.
//         The code is exchanged for an access + refresh token at the token
//         endpoint — no client secret required for Desktop-type OAuth clients.
//
// Google Console setup required:
//   Client type:          Desktop app  (not Web application)
//   Authorized redirect:  com.mar.addapp://oauth2callback
// ────────────────────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core'

const CLIENT_ID        = import.meta.env.VITE_GOOGLE_CLIENT_ID          // Web application client (GIS popup)
const CLIENT_ID_NATIVE = import.meta.env.VITE_GOOGLE_CLIENT_ID_NATIVE   // Desktop app client (PKCE / Android)
const REDIRECT_URI = 'com.mar.addapp://oauth2callback'
const TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const GCAL_BASE    = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

// ── Scopes ──────────────────────────────────────────────────────────────────
// calendar.events = read + create/edit/delete events (no calendar management)
const SCOPES = 'https://www.googleapis.com/auth/calendar.events'

// ── In-memory token cache ────────────────────────────────────────────────────
let _tokenClient = null
let _accessToken = null
let _tokenExpiry = 0   // unix ms

// ── localStorage keys ────────────────────────────────────────────────────────
const LS_CONNECTED     = 'gcal_connected'       // 'true' | absent
const LS_REFRESH_TOKEN = 'gcal_refresh_token'   // stored after first native login

// ── PKCE helpers ─────────────────────────────────────────────────────────────
function _randomBytes(len) {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return arr
}

function _base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function _generateVerifier() {
  return _base64url(_randomBytes(32))
}

async function _generateChallenge(verifier) {
  const data    = new TextEncoder().encode(verifier)
  const digest  = await crypto.subtle.digest('SHA-256', data)
  return _base64url(new Uint8Array(digest))
}

// ── GIS (web flow) ───────────────────────────────────────────────────────────
/** Dynamically load the GIS script. Safe to call multiple times. */
export function loadGIS() {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('gis-script')
    if (existing) {
      if (window.google?.accounts) resolve()
      else existing.addEventListener('load', resolve)
      return
    }
    const s    = document.createElement('script')
    s.id       = 'gis-script'
    s.src      = 'https://accounts.google.com/gsi/client'
    s.async    = true
    s.defer    = true
    s.onload   = resolve
    s.onerror  = reject
    document.head.appendChild(s)
  })
}

/** Returns true if the user has previously connected Google Calendar. */
export function isConnected() {
  return localStorage.getItem(LS_CONNECTED) === 'true'
}

/** Returns a valid in-memory access token, or null if expired / not yet set. */
export function getCachedToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken
  return null
}

function _saveToken(token, expiresIn) {
  _accessToken = token
  _tokenExpiry = Date.now() + ((expiresIn ?? 3600) - 60) * 1000
}

function _initTokenClient(prompt, callback) {
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope:     SCOPES,
    callback,
  })
  _tokenClient.requestAccessToken({ prompt })
}

/**
 * Web flow: shows the Google OAuth popup.
 */
export function connectGoogle(onToken, onError) {
  if (!CLIENT_ID || CLIENT_ID === 'PASTE_YOUR_CLIENT_ID_HERE') {
    onError('Google Client ID not configured.')
    return
  }
  if (!window.google?.accounts) {
    onError('Google Identity Services not loaded. Try again in a moment.')
    return
  }
  _initTokenClient('consent', (resp) => {
    if (resp.error) { onError(resp.error); return }
    _saveToken(resp.access_token, resp.expires_in)
    localStorage.setItem(LS_CONNECTED, 'true')
    onToken(resp.access_token)
  })
}

/**
 * Native OAuth — PKCE authorization code flow via Chrome Custom Tabs.
 *
 * Requirements:
 *   1. Google Console client type must be "Desktop app"
 *   2. com.mar.addapp://oauth2callback added as Authorized redirect URI
 *   3. AndroidManifest.xml intent filter for com.mar.addapp scheme (already done)
 */
export async function connectGoogleNative(onToken, onError) {
  const nativeId = CLIENT_ID_NATIVE || CLIENT_ID
  if (!nativeId || nativeId === 'PASTE_YOUR_CLIENT_ID_HERE') {
    onError('Google Client ID not configured.')
    return
  }
  try {
    const { Browser } = await import(/* @vite-ignore */ '@capacitor/browser')
    const { App }     = await import(/* @vite-ignore */ '@capacitor/app')

    // Generate PKCE verifier + challenge
    const verifier   = _generateVerifier()
    const challenge  = await _generateChallenge(verifier)
    sessionStorage.setItem('gcal_pkce_verifier', verifier)

    const params = new URLSearchParams({
      client_id:             nativeId,
      redirect_uri:          REDIRECT_URI,
      response_type:         'code',
      scope:                 SCOPES,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
      access_type:           'offline',   // request refresh token
      prompt:                'consent',   // force consent to always get refresh_token
    })
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

    // Track whether the deep-link fired so browserFinished can distinguish
    // "user completed auth" from "user closed tab / Google showed an error page"
    let codeReceived = false

    // Register deep-link listener BEFORE opening browser
    const urlListener = await App.addListener('appUrlOpen', async (event) => {
      codeReceived = true
      await urlListener.remove()
      try { browserFinishedListener.remove() } catch (_) {}
      try { await Browser.close() } catch (_) {}

      const url = event.url || ''
      if (!url.startsWith(REDIRECT_URI)) {
        onError('Unexpected redirect URL: ' + url)
        return
      }

      // Code lives in query string: ?code=xxx&scope=...
      const qs   = url.includes('?') ? url.split('?')[1] : ''
      const p    = new URLSearchParams(qs)
      const code = p.get('code')

      if (!code) {
        const err = p.get('error') || 'No authorization code in redirect'
        onError(err)
        return
      }

      // Exchange code for access + refresh tokens (no client secret for Desktop clients)
      try {
        const storedVerifier = sessionStorage.getItem('gcal_pkce_verifier') || verifier
        const res = await fetch(TOKEN_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id:     nativeId,
            redirect_uri:  REDIRECT_URI,
            grant_type:    'authorization_code',
            code_verifier: storedVerifier,
          }),
        })
        const data = await res.json()

        if (data.error) {
          onError(`Token exchange failed: ${data.error_description || data.error}`)
          return
        }

        _saveToken(data.access_token, data.expires_in)
        if (data.refresh_token) {
          localStorage.setItem(LS_REFRESH_TOKEN, data.refresh_token)
        }
        localStorage.setItem(LS_CONNECTED, 'true')
        onToken(data.access_token)
      } catch (fetchErr) {
        onError(`Token exchange network error: ${fetchErr.message}`)
      }
    })

    // If the browser closes without a redirect (user cancelled, or Google showed
    // an error page like redirect_uri_mismatch), surface a clear error message.
    const browserFinishedListener = await Browser.addListener('browserFinished', () => {
      browserFinishedListener.remove()
      if (!codeReceived) {
        urlListener.remove()
        onError('Google sign-in was cancelled or failed. If this keeps happening, the OAuth client may need to be reconfigured.')
      }
    })

    await Browser.open({ url: authUrl })
  } catch (err) {
    onError(`Native OAuth failed: ${err.message}`)
  }
}

/**
 * Use a stored refresh token to get a new access token silently (native only).
 */
async function _refreshNativeToken(onToken, onFail) {
  const refreshToken = localStorage.getItem(LS_REFRESH_TOKEN)
  if (!refreshToken) { onFail(); return }

  try {
    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CLIENT_ID_NATIVE || CLIENT_ID,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    })
    const data = await res.json()
    if (data.error || !data.access_token) { onFail(); return }
    _saveToken(data.access_token, data.expires_in)
    onToken(data.access_token)
  } catch {
    onFail()
  }
}

/**
 * Silent re-auth — call on every Calendar mount if isConnected() is true.
 * On web:    uses GIS silent token request (no popup).
 * On native: uses stored refresh token.
 */
export function silentReconnect(onToken, onFail) {
  // Return cached token if still valid
  const cached = getCachedToken()
  if (cached) { onToken(cached); return }

  if (isNativeApp()) {
    _refreshNativeToken(onToken, onFail)
    return
  }

  if (!window.google?.accounts) { onFail(); return }

  _initTokenClient('', (resp) => {
    if (resp.error || !resp.access_token) { onFail(); return }
    _saveToken(resp.access_token, resp.expires_in)
    onToken(resp.access_token)
  })
}

/**
 * Disconnect: revoke token and clear all stored state.
 */
export function disconnectGoogle(token) {
  if (token && window.google?.accounts) {
    window.google.accounts.oauth2.revoke(token)
  }
  const refreshToken = localStorage.getItem(LS_REFRESH_TOKEN)
  if (refreshToken) {
    // Best-effort revoke of refresh token too
    fetch(`https://oauth2.googleapis.com/revoke?token=${refreshToken}`, { method: 'POST' }).catch(() => {})
  }
  _accessToken = null
  _tokenExpiry  = 0
  localStorage.removeItem(LS_CONNECTED)
  localStorage.removeItem(LS_REFRESH_TOKEN)
}

/**
 * Fetch events from the user's primary Google Calendar.
 */
export async function fetchEvents(token, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin:      timeMin.toISOString(),
    timeMax:      timeMax.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '250',
  })

  const res = await fetch(`${GCAL_BASE}?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok)           throw new Error('FETCH_FAILED')

  const json = await res.json()
  return json.items || []
}


// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Convert a local calendar_events row into a Google Calendar event body.
 */
export function toGCalBody(ev) {
  if (ev.all_day) {
    return {
      summary:     ev.title,
      description: ev.notes   || undefined,
      location:    ev.location || undefined,
      start: { date: ev.date },
      end:   { date: ev.end_date || ev.date },
    }
  }
  const tz = ev.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  return {
    summary:     ev.title,
    description: ev.notes    || undefined,
    location:    ev.location || undefined,
    start: { dateTime: `${ev.date}T${ev.start_time || '00:00'}:00`, timeZone: tz },
    end:   { dateTime: `${ev.date}T${ev.end_time   || '01:00'}:00`, timeZone: tz },
  }
}

/**
 * Create an event in the user's primary Google Calendar.
 * Returns the created GCal event object (including its `id`).
 */
export async function createGCalEvent(token, localEvent) {
  const res = await fetch(GCAL_BASE, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toGCalBody(localEvent)),
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (res.status === 403) throw new Error('PERMISSION_DENIED')
  if (!res.ok)            throw new Error('CREATE_FAILED')
  return res.json()
}

/**
 * Update an existing GCal event by its GCal event ID.
 */
export async function updateGCalEvent(token, gcalEventId, localEvent) {
  const res = await fetch(`${GCAL_BASE}/${gcalEventId}`, {
    method:  'PUT',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toGCalBody(localEvent)),
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (res.status === 403) throw new Error('PERMISSION_DENIED')
  if (res.status === 404) return null
  if (!res.ok)            throw new Error('UPDATE_FAILED')
  return res.json()
}

/**
 * Delete a GCal event by its GCal event ID.
 */
export async function deleteGCalEvent(token, gcalEventId) {
  const res = await fetch(`${GCAL_BASE}/${gcalEventId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (res.status === 403) throw new Error('PERMISSION_DENIED')
  if (res.status === 404) return
  if (res.status !== 204 && !res.ok) throw new Error('DELETE_FAILED')
}

/** Extract a JS Date from an event's start (handles dateTime + all-day). */
export function eventStartDate(event) {
  const raw = event.start?.dateTime || event.start?.date
  return raw ? new Date(raw) : null
}

/** Format an event's start time as "10:30 AM", or "All day". */
export function eventTimeLabel(event) {
  if (event.start?.date && !event.start?.dateTime) return 'All day'
  const d = new Date(event.start.dateTime)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}
