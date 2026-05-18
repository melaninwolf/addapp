import { supabase } from './supabase'

const XP_KEY = 'addapp-xp'
const XP_PER_LEVEL = 100

// ── MAM gram reward constants ──────────────────────────────
export const MAM_TASK          = 10   // any task completed
export const MAM_FOCUS         = 5    // per 25-min focus session
export const MAM_ROUTINE       = 5    // per routine step (regular)
export const MAM_TRIGGER       = 3    // per routine step (trigger)
export const MAM_HOBBY_PER_HR  = 10   // per 60 min of hobby time
export const MAM_WATER         = 3    // daily water goal met

export function getXP() {
  return parseInt(localStorage.getItem(XP_KEY) || '0', 10)
}

export function addXP(amount) {
  const current = getXP()
  const next = current + amount
  localStorage.setItem(XP_KEY, next)
  window.dispatchEvent(new Event('xp-update'))

  // Sync to Supabase if logged in
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return
    supabase
      .from('user_xp')
      .upsert({ user_id: user.id, total_xp: next, updated_at: new Date().toISOString() })
      .then(() => {})
  })

  return next
}

// Alias — use addMAM going forward
export const addMAM = addXP

// Call on login to sync Supabase XP → localStorage
export async function syncXPFromDb() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase
    .from('user_xp')
    .select('total_xp')
    .eq('user_id', user.id)
    .single()
  if (data?.total_xp != null) {
    localStorage.setItem(XP_KEY, data.total_xp)
    window.dispatchEvent(new Event('xp-update'))
  }
}

export function getLevel(xp = getXP()) {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function getLevelProgress(xp = getXP()) {
  return (xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100
}

export function getXPIntoLevel(xp = getXP()) {
  return xp % XP_PER_LEVEL
}

// ── MAM Space Conversion System ───────────────────────────────

// Real astronomical destinations with AU distances
export const DESTINATIONS = [
  { name: 'Launch Pad',       emoji: '🌍', au: 0       },
  { name: 'Moon orbit',       emoji: '🌕', au: 0.0026  },
  { name: 'Venus flyby',      emoji: '🌟', au: 0.28    },
  { name: 'Mars orbit',       emoji: '🔴', au: 0.52    },
  { name: 'Asteroid Belt',    emoji: '🪨', au: 2.2     },
  { name: 'Jupiter orbit',    emoji: '🟠', au: 4.2     },
  { name: 'Saturn orbit',     emoji: '💫', au: 8.5     },
  { name: 'Uranus orbit',     emoji: '🔵', au: 18.2    },
  { name: 'Neptune orbit',    emoji: '🌀', au: 29.1    },
  { name: 'Kuiper Belt',      emoji: '❄️', au: 39.5    },
  { name: 'Oort Cloud',       emoji: '☁️', au: 2000    },
  { name: 'Proxima Centauri', emoji: '⭐', au: 268770  },
]

const AU_PER_BURST = 2.5  // grams of each fuel type needed per 1 AU (tier 0)

// Odd-numbered levels completed → matter (g)
export function getMatter(xp = getXP()) {
  const completed = Math.floor((xp || 0) / XP_PER_LEVEL)
  return Math.ceil(completed / 2)
}

// Even-numbered levels completed → antimatter (g)
export function getAntimatter(xp = getXP()) {
  const completed = Math.floor((xp || 0) / XP_PER_LEVEL)
  return Math.floor(completed / 2)
}

// Efficiency doubles every 50 levels: 2^tier where tier = floor((level-1)/50)
export function getEfficiency(xp = getXP()) {
  const tier = Math.floor((getLevel(xp) - 1) / 50)
  return Math.pow(2, tier)
}

// Matter grams toward the next 2.5g launch threshold (0 → 2.5, repeating)
export function getMatterProgress(xp = getXP()) {
  return getMatter(xp) % AU_PER_BURST
}

// Antimatter grams toward the next 2.5g launch threshold
export function getAntimatterProgress(xp = getXP()) {
  return getAntimatter(xp) % AU_PER_BURST
}

// Total AU traveled (each completed 2.5g pair × efficiency at time of burst)
// Simplified: uses current efficiency for display
export function getAUTraveled(xp = getXP()) {
  const bursts = Math.floor(Math.min(getMatter(xp), getAntimatter(xp)) / AU_PER_BURST)
  return +(bursts * getEfficiency(xp)).toFixed(4)
}

// Destination you're currently at
export function getCurrentDestination(xp = getXP()) {
  const au = getAUTraveled(xp)
  let dest = DESTINATIONS[0]
  for (const d of DESTINATIONS) {
    if (au >= d.au) dest = d
    else break
  }
  return dest
}

// Next destination to reach
export function getNextDestination(xp = getXP()) {
  const au = getAUTraveled(xp)
  return DESTINATIONS.find(d => d.au > au) || null
}
