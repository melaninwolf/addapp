// ─── Google Calendar integration ───────────────────────────────
// Wraps the Google Identity Services (GIS) token model.
// Access tokens are short-lived (~1 hour) — re-request on expiry.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPE     = 'https://www.googleapis.com/auth/calendar.readonly'

let _tokenClient = null

/** Dynamically load the GIS script. Safe to call multiple times. */
export function loadGIS() {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('gis-script')
    if (existing) { existing.addEventListener('load', resolve); return }
    const s = document.createElement('script')
    s.id  = 'gis-script'
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload  = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
}

/**
 * Open the Google OAuth popup and return the access token via callback.
 * @param {(token: string) => void} onToken
 * @param {(err: string) => void}   onError
 */
export function requestToken(onToken, onError) {
  if (!CLIENT_ID || CLIENT_ID === 'PASTE_YOUR_CLIENT_ID_HERE') {
    onError('Google Client ID not configured. Add VITE_GOOGLE_CLIENT_ID to your .env.local file.')
    return
  }
  if (!window.google?.accounts) {
    onError('Google Identity Services not loaded yet. Try again in a moment.')
    return
  }

  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope:     SCOPE,
    callback:  (resp) => {
      if (resp.error) { onError(resp.error); return }
      // Persist token + expiry so it survives navigation
      const expiry = Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000
      sessionStorage.setItem('gcal_token', resp.access_token)
      sessionStorage.setItem('gcal_token_expiry', String(expiry))
      onToken(resp.access_token)
    },
  })
  _tokenClient.requestAccessToken({ prompt: 'consent' })
}

/** Read a previously saved token from sessionStorage (returns null if missing/expired). */
export function getSavedToken() {
  const token  = sessionStorage.getItem('gcal_token')
  const expiry = sessionStorage.getItem('gcal_token_expiry')
  if (!token || !expiry) return null
  if (Date.now() > parseInt(expiry)) {
    sessionStorage.removeItem('gcal_token')
    sessionStorage.removeItem('gcal_token_expiry')
    return null
  }
  return token
}

/** Clear persisted token. */
export function clearSavedToken() {
  sessionStorage.removeItem('gcal_token')
  sessionStorage.removeItem('gcal_token_expiry')
}

/**
 * Revoke the current token and disconnect.
 * @param {string} token
 */
export function revokeToken(token) {
  if (token && window.google?.accounts) {
    window.google.accounts.oauth2.revoke(token)
  }
}

/**
 * Fetch events from the user's primary Google Calendar.
 * Returns an array of event objects.
 */
export async function fetchEvents(token, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin:       timeMin.toISOString(),
    timeMax:       timeMax.toISOString(),
    singleEvents:  'true',
    orderBy:       'startTime',
    maxResults:    '250',
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

/** Extract a JS Date from an event's start field (handles dateTime and all-day date). */
export function eventStartDate(event) {
  const raw = event.start?.dateTime || event.start?.date
  return raw ? new Date(raw) : null
}

/** Extract a JS Date from an event's end field. */
export function eventEndDate(event) {
  const raw = event.end?.dateTime || event.end?.date
  return raw ? new Date(raw) : null
}

/** Format an event's start time as "10:30 AM", or "All day" for all-day events. */
export function eventTimeLabel(event) {
  if (event.start?.date && !event.start?.dateTime) return 'All day'
  const d = new Date(event.start.dateTime)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}
