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
export const MAM_STEPS         = 5    // daily step goal reached via Health Connect

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

// ── Level titles tied to destinations ─────────────────────────
const LEVEL_TITLES = [
  { maxAU: 0.0025,   matter: 'Rookie',          anti: 'Beginner'        },
  { maxAU: 0.27,     matter: 'Moonwalker',       anti: 'Orbit Drifter'   },
  { maxAU: 0.51,     matter: 'Venus Gazer',      anti: 'Solar Surfer'    },
  { maxAU: 2.19,     matter: 'Mars Pioneer',     anti: 'Red Drifter'     },
  { maxAU: 4.19,     matter: 'Belt Miner',       anti: 'Rock Hopper'     },
  { maxAU: 8.49,     matter: 'Jupiter Rider',    anti: 'Storm Chaser'    },
  { maxAU: 18.19,    matter: 'Ring Walker',      anti: 'Titan Drifter'   },
  { maxAU: 29.09,    matter: 'Ice Giant',        anti: 'Teal Nomad'      },
  { maxAU: 39.49,    matter: 'Neptune Diver',    anti: 'Deep Traveler'   },
  { maxAU: 1999,     matter: 'Kuiper Ranger',    anti: 'Frost Walker'    },
  { maxAU: 268769,   matter: 'Oort Phantom',     anti: 'Cloud Whisperer' },
  { maxAU: Infinity, matter: 'Proxima Legend',   anti: 'Starborn'        },
]

export function getLevelTitle(xp = getXP()) {
  const level = getLevel(xp)
  const au    = getAUTraveled(xp)
  const isMatter = level % 2 === 1
  const tier = LEVEL_TITLES.find(t => au <= t.maxAU) || LEVEL_TITLES[LEVEL_TITLES.length - 1]
  return isMatter ? tier.matter : tier.anti
}

// ── Motivation Profiles ────────────────────────────────────────
export const MOTIVATION_PROFILES = [
  {
    id:          'explorer',
    name:        'Explorer',
    emoji:       '\u{1F52D}',
    tagline:     'Driven by curiosity and novelty',
    description: 'You love discovering new things. Variety keeps you going.',
    xpBonus:     'Bonus grams for trying new routines or hobbies',
  },
  {
    id:          'warrior',
    name:        'Warrior',
    emoji:       '\u2694\uFE0F',
    tagline:     'Fueled by challenge and conquest',
    description: 'You rise to challenges and compete with your past self.',
    xpBonus:     'Bonus grams for completing tasks marked high priority',
  },
  {
    id:          'builder',
    name:        'Builder',
    emoji:       '\u{1F3D7}\uFE0F',
    tagline:     'Motivated by milestones and systems',
    description: 'You love seeing progress accumulate into something real.',
    xpBonus:     'Bonus grams for completing project milestones',
  },
  {
    id:          'dreamer',
    name:        'Dreamer',
    emoji:       '\u{1F30C}',
    tagline:     'Inspired by vision and creativity',
    description: 'You think big. The destination matters more than the routine.',
    xpBonus:     'Bonus grams for journaling and creative sessions',
  },
  {
    id:          'protector',
    name:        'Protector',
    emoji:       '\u{1F6E1}\uFE0F',
    tagline:     'Moved by care for others and values',
    description: 'You stay consistent when it matters for the people you love.',
    xpBonus:     'Bonus grams for health tracking and self-care routines',
  },
]

const PROFILE_KEY = 'addapp-motivation-profile'

export function getMotivationProfile() {
  return localStorage.getItem(PROFILE_KEY) || 'explorer'
}

export function setMotivationProfile(id) {
  localStorage.setItem(PROFILE_KEY, id)
  window.dispatchEvent(new Event('profile-update'))
}

// ── MAM Space Conversion System ───────────────────────────────

export const DESTINATIONS = [
  { name: 'Launch Pad',       emoji: '\u{1F30D}', au: 0       },
  { name: 'Moon orbit',       emoji: '\u{1F315}', au: 0.0026  },
  { name: 'Venus flyby',      emoji: '\u{1F31F}', au: 0.28    },
  { name: 'Mars orbit',       emoji: '\u{1F534}', au: 0.52    },
  { name: 'Asteroid Belt',    emoji: '\u{1FAA8}', au: 2.2     },
  { name: 'Jupiter orbit',    emoji: '\u{1F7E0}', au: 4.2     },
  { name: 'Saturn orbit',     emoji: '\u{1F4AB}', au: 8.5     },
  { name: 'Uranus orbit',     emoji: '\u{1F535}', au: 18.2    },
  { name: 'Neptune orbit',    emoji: '\u{1F300}', au: 29.1    },
  { name: 'Kuiper Belt',      emoji: '\u2744\uFE0F', au: 39.5 },
  { name: 'Oort Cloud',       emoji: '\u2601\uFE0F', au: 2000 },
  { name: 'Proxima Centauri', emoji: '\u2B50',    au: 268770  },
]

const AU_PER_BURST = 2.5

export function getMatter(xp = getXP()) {
  const completed = Math.floor((xp || 0) / XP_PER_LEVEL)
  return Math.ceil(completed / 2)
}

export function getAntimatter(xp = getXP()) {
  const completed = Math.floor((xp || 0) / XP_PER_LEVEL)
  return Math.floor(completed / 2)
}

export function getEfficiency(xp = getXP()) {
  const tier = Math.floor((getLevel(xp) - 1) / 50)
  return Math.pow(2, tier)
}

export function getMatterProgress(xp = getXP()) {
  return getMatter(xp) % AU_PER_BURST
}

export function getAntimatterProgress(xp = getXP()) {
  return getAntimatter(xp) % AU_PER_BURST
}

export function getAUTraveled(xp = getXP()) {
  const bursts = Math.floor(Math.min(getMatter(xp), getAntimatter(xp)) / AU_PER_BURST)
  return +(bursts * getEfficiency(xp)).toFixed(4)
}

export function getCurrentDestination(xp = getXP()) {
  const au = getAUTraveled(xp)
  let dest = DESTINATIONS[0]
  for (const d of DESTINATIONS) {
    if (au >= d.au) dest = d
    else break
  }
  return dest
}

export function getNextDestination(xp = getXP()) {
  const au = getAUTraveled(xp)
  return DESTINATIONS.find(d => d.au > au) || null
}
