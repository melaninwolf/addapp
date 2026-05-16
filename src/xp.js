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
