// ─── Google Calendar integration ────────────────────────────────────────────
//
// Current approach: GIS token model with silent re-auth.
//   - User connects once. A "gcal_connected" flag is saved to localStorage.
//   - On every Calendar mount, we silently request a fresh token with no popup.
//   - If silent re-auth fails (revoked, signed out of Google), we show the
//     connect button so the user can re-authorise.
//
// Future upgrade path (write access):
//   - Switch to authorization code + PKCE flow.
//   - Store the refresh token in Supabase user metadata.
//   - Silently refresh access tokens server-side forever.
//   - Change SCOPES below to include calendar (read + write).
// ────────────────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

// ── Scopes ───────────────────────────────────────────────────────────────────
// To add write access later, change to:
//   'https://www.googleapis.com/auth/calendar'
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

// ── In-memory token cache ─────────────────────────────────────────────────────
let _tokenClient  = null
let _accessToken  = null
let _tokenExpiry  = 0   // unix ms

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_CONNECTED = 'gcal_connected'   // 'true' | absent

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
 * First-time connect: shows the Google OAuth popup.
 * Saves the "connected" flag to localStorage on success.
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
 * Silent re-auth — call on every Calendar mount if isConnected() is true.
 * No popup shown. Calls onToken with a fresh token, or onFail if the
 * user needs to reconnect manually (revoked access, not signed in to Google).
 */
export function silentReconnect(onToken, onFail) {
  // Return cached token if still valid
  const cached = getCachedToken()
  if (cached) { onToken(cached); return }

  if (!window.google?.accounts) { onFail(); return }

  _initTokenClient('', (resp) => {
    if (resp.error || !resp.access_token) { onFail(); return }
    _saveToken(resp.access_token, resp.expires_in)
    onToken(resp.access_token)
  })
}

/**
 * Disconnect: revoke token and clear the "connected" flag.
 */
export function disconnectGoogle(token) {
  if (token && window.google?.accounts) {
    window.google.accounts.oauth2.revoke(token)
  }
  _accessToken = null
  _tokenExpiry  = 0
  localStorage.removeItem(LS_CONNECTED)
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

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok)           throw new Error('FETCH_FAILED')

  const json = await res.json()
  return json.items || []
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
