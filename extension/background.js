// ── AddApp Chrome Extension — Background Service Worker ──────────────────────

const SUPABASE_URL  = 'https://jcqsqebenwmxpmhuuihp.supabase.co'
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcXNxZWJlbndteHBtaHV1aWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTcwNTQsImV4cCI6MjA5MzU5MzA1NH0.VV2PKzCpsNK_72blJBzI53Fg75EJBV21vQ9pi7RNylg'
const MIN_LOG_SECS  = 30   // ignore visits shorter than 30s
const ALARM_TICK    = 'focus-tick'

// ── Supabase REST helpers ─────────────────────────────────────────────────────
async function getSession() {
  return new Promise(resolve => chrome.storage.local.get('sb_session', d => resolve(d.sb_session || null)))
}

async function sbFetch(path, options = {}) {
  const session = await getSession()
  const headers = {
    'apikey':        SUPABASE_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
    ...(options.headers || {}),
  }
  return fetch(`${SUPABASE_URL}${path}`, { ...options, headers })
}

async function sbSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return res.json()
}

async function sbSignOut() {
  const session = await getSession()
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${session.access_token}` },
    })
  }
  await chrome.storage.local.remove('sb_session')
}

// ── Site time tracking ────────────────────────────────────────────────────────
let activeTabId   = null
let activeUrl     = null
let activeStart   = null  // Date.now() when tab became active

function getDomain(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.replace(/^www\./, '')
  } catch { return null }
}

function getAppName(domain) {
  const MAP = {
    'instagram.com': 'Instagram',
    'tiktok.com': 'TikTok',
    'youtube.com': 'YouTube',
    'twitter.com': 'Twitter/X',
    'x.com': 'Twitter/X',
    'reddit.com': 'Reddit',
    'netflix.com': 'Netflix',
    'facebook.com': 'Facebook',
    'linkedin.com': 'LinkedIn',
    'slack.com': 'Slack',
    'mail.google.com': 'Gmail',
    'gmail.com': 'Gmail',
    'news.google.com': 'Google News',
    'nytimes.com': 'NY Times',
    'cnn.com': 'CNN',
    'bbc.com': 'BBC',
    'whatsapp.com': 'WhatsApp',
    'discord.com': 'Discord',
    'twitch.tv': 'Twitch',
    'pinterest.com': 'Pinterest',
    'snapchat.com': 'Snapchat',
  }
  return MAP[domain] || domain
}

function getCategory(domain) {
  const SOCIAL  = ['instagram.com','tiktok.com','twitter.com','x.com','facebook.com','linkedin.com','reddit.com','snapchat.com','pinterest.com','discord.com']
  const ENTMT   = ['youtube.com','netflix.com','twitch.tv','hulu.com','disneyplus.com','spotify.com']
  const COMMS   = ['mail.google.com','gmail.com','slack.com','whatsapp.com','teams.microsoft.com','outlook.live.com']
  const NEWS    = ['news.google.com','nytimes.com','cnn.com','bbc.com','theguardian.com','washingtonpost.com','reddit.com']
  if (SOCIAL.includes(domain))  return 'social'
  if (ENTMT.includes(domain))   return 'entertainment'
  if (COMMS.includes(domain))   return 'comms'
  if (NEWS.includes(domain))    return 'news'
  return 'other'
}

function isDistraction(domain) {
  const DISTRACTIONS = ['instagram.com','tiktok.com','twitter.com','x.com','reddit.com','facebook.com','youtube.com','twitch.tv','pinterest.com','snapchat.com']
  return DISTRACTIONS.includes(domain)
}

async function flushActiveTab() {
  if (!activeUrl || !activeStart) return
  const domain = getDomain(activeUrl)
  if (!domain) { activeUrl = null; activeStart = null; return }

  const durationSecs = Math.floor((Date.now() - activeStart) / 1000)
  if (durationSecs < MIN_LOG_SECS) { activeUrl = null; activeStart = null; return }

  const session = await getSession()
  if (!session?.user?.id) { activeUrl = null; activeStart = null; return }

  const durationMin = Math.max(1, Math.round(durationSecs / 60))
  const today = new Date().toISOString().split('T')[0]

  await sbFetch('/rest/v1/usage_logs', {
    method: 'POST',
    body: JSON.stringify({
      user_id:       session.user.id,
      log_date:      today,
      app_name:      getAppName(domain),
      category:      getCategory(domain),
      duration_min:  durationMin,
      is_distraction: isDistraction(domain),
      note:          'auto-tracked',
    }),
  })

  activeUrl = null
  activeStart = null
}

async function startTracking(tabId, url) {
  await flushActiveTab()
  activeTabId = tabId
  activeUrl   = url
  activeStart = Date.now()
}

// ── Focus session state ───────────────────────────────────────────────────────
async function getFocusState() {
  return new Promise(resolve => chrome.storage.session.get('focus', d => resolve(d.focus || null)))
}

async function setFocusState(state) {
  return new Promise(resolve => chrome.storage.session.set({ focus: state }, resolve))
}

async function startFocusSession(label, durationMins) {
  const session = await getSession()
  if (!session?.user?.id) return { error: 'Not signed in' }

  const now = new Date().toISOString()
  const { data, error } = await (async () => {
    const res = await sbFetch('/rest/v1/focus_sessions', {
      method: 'POST',
      body: JSON.stringify({
        user_id:    session.user.id,
        label:      label || 'Focus Session',
        started_at: now,
        duration_target_min: durationMins || 25,
        status:     'active',
      }),
    })
    const data = await res.json()
    return { data: Array.isArray(data) ? data[0] : data, error: res.ok ? null : data }
  })()

  if (error) return { error }

  const state = {
    id:          data.id,
    label:       label || 'Focus Session',
    startedAt:   Date.now(),
    durationMins: durationMins || 25,
    endsAt:      Date.now() + (durationMins || 25) * 60 * 1000,
  }
  await setFocusState(state)
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1/60 }) // every second approx
  broadcastFocusState(state)
  return { data: state }
}

async function stopFocusSession() {
  const focus = await getFocusState()
  if (!focus) return

  const session = await getSession()
  if (session?.user?.id && focus.id) {
    const elapsed = Math.round((Date.now() - focus.startedAt) / 60000)
    await sbFetch(`/rest/v1/focus_sessions?id=eq.${focus.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ended_at:     new Date().toISOString(),
        duration_min: elapsed,
        status:       'completed',
      }),
    })
  }

  await setFocusState(null)
  chrome.alarms.clear(ALARM_TICK)
  broadcastFocusState(null)
}

function broadcastFocusState(state) {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'FOCUS_STATE', focus: state }).catch(() => {})
    })
  })
}

// ── Distraction check ─────────────────────────────────────────────────────────
async function checkDistraction(tabId, url) {
  const focus = await getFocusState()
  if (!focus) return

  const domain = getDomain(url)
  if (!domain) return

  // Check user's custom limits list too
  const session = await getSession()
  let customDistractions = []
  if (session?.user?.id) {
    const res = await sbFetch(`/rest/v1/usage_limits?user_id=eq.${session.user.id}&is_active=eq.true&select=app_name`)
    const limits = await res.json()
    customDistractions = (limits || []).map(l => l.app_name.toLowerCase())
  }

  const appName = getAppName(domain)
  const isDist  = isDistraction(domain) || customDistractions.includes(appName.toLowerCase())

  if (isDist) {
    chrome.tabs.sendMessage(tabId, {
      type:   'DISTRACTION_BLOCK',
      domain,
      appName,
      focus:  focus.label,
    }).catch(() => {})
  }
}

// ── Context menu (text selection → task) ─────────────────────────────────────
chrome.contextMenus.create({
  id:       'save-as-task',
  title:    '📋 Save as AddApp task',
  contexts: ['selection'],
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-as-task') return
  const text = info.selectionText?.trim()
  if (!text) return

  const session = await getSession()
  if (!session?.user?.id) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: 'AddApp', message: 'Sign in to AddApp extension first.',
    })
    return
  }

  const res = await sbFetch('/rest/v1/tasks', {
    method: 'POST',
    body: JSON.stringify({
      user_id:    session.user.id,
      title:      text.length > 120 ? text.slice(0, 120) + '…' : text,
      status:     'todo',
      priority:   'medium',
      source_url: tab?.url || null,
    }),
  })

  if (res.ok) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: 'Task saved!',
      message: text.length > 60 ? text.slice(0, 60) + '…' : text,
    })
  }
})

// ── Tab event listeners ───────────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (tab?.url) await startTracking(tabId, tab.url)
  if (tab?.url) await checkDistraction(tabId, tab.url)
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (tab.active && tab.url) {
    await startTracking(tabId, tab.url)
    await checkDistraction(tabId, tab.url)
  }
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId) await flushActiveTab()
})

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushActiveTab()
  } else {
    const tabs = await chrome.tabs.query({ active: true, windowId })
    if (tabs[0]?.url) await startTracking(tabs[0].id, tabs[0].url)
  }
})

// ── Alarm: focus session tick ─────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_TICK) return
  const focus = await getFocusState()
  if (!focus) return

  if (Date.now() >= focus.endsAt) {
    await stopFocusSession()
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: '🎯 Focus session complete!',
      message: `Great work on: ${focus.label}`,
    })
    return
  }

  broadcastFocusState(focus)
})

// ── Message handler (from popup / content) ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    switch (msg.type) {

      case 'SIGN_IN': {
        const result = await sbSignIn(msg.email, msg.password)
        if (result.access_token) {
          await chrome.storage.local.set({ sb_session: result })
          sendResponse({ ok: true, user: result.user })
        } else {
          sendResponse({ ok: false, error: result.error_description || result.msg || 'Sign-in failed' })
        }
        break
      }

      case 'SIGN_OUT': {
        await sbSignOut()
        sendResponse({ ok: true })
        break
      }

      case 'GET_SESSION': {
        const session = await getSession()
        sendResponse({ session })
        break
      }

      case 'GET_FOCUS': {
        const focus = await getFocusState()
        sendResponse({ focus })
        break
      }

      case 'START_FOCUS': {
        const result = await startFocusSession(msg.label, msg.durationMins)
        sendResponse(result)
        break
      }

      case 'STOP_FOCUS': {
        await stopFocusSession()
        sendResponse({ ok: true })
        break
      }

      case 'GET_TASKS': {
        const session = await getSession()
        if (!session?.user?.id) { sendResponse({ tasks: [] }); break }
        const res = await sbFetch(
          `/rest/v1/tasks?user_id=eq.${session.user.id}&status=neq.done&order=created_at.desc&limit=10`
        )
        const tasks = await res.json()
        sendResponse({ tasks: tasks || [] })
        break
      }

      case 'COMPLETE_TASK': {
        await sbFetch(`/rest/v1/tasks?id=eq.${msg.taskId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'done' }),
        })
        sendResponse({ ok: true })
        break
      }

      case 'ADD_TASK': {
        const session = await getSession()
        if (!session?.user?.id) { sendResponse({ ok: false }); break }
        const res = await sbFetch('/rest/v1/tasks', {
          method: 'POST',
          body: JSON.stringify({
            user_id:  session.user.id,
            title:    msg.title,
            status:   'todo',
            priority: 'medium',
          }),
        })
        sendResponse({ ok: res.ok })
        break
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' })
    }
  })()
  return true // async response
})

// ── On install: set up alarms & context menu ──────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('AddApp extension installed')
})
