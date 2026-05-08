// ─── AddApp Settings System ───────────────────────────────────────────────
// Handles: mode (ocean / light / dark), accent color, font
// Persisted in localStorage under key 'addapp-settings'.
// Call initSettings() once on app load.

export const ACCENT_COLORS = [
  { name: 'Black',  hex: '#1a1a1a' },
  { name: 'White',  hex: '#f0f0f0' },
  { name: 'Red',    hex: '#ef4444' },
  { name: 'Green',  hex: '#22c55e' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Blue',   hex: '#3b82f6' },
  { name: 'Pink',   hex: '#ec4899' },
  { name: 'Gray',   hex: '#9ca3af' },
  { name: 'Brown',  hex: '#a16207' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Purple', hex: '#a855f7' },
]

export const FONTS = [
  { id: 'lexend',      name: 'Lexend',        family: "'Lexend', sans-serif"       },
  { id: 'verdana',     name: 'Verdana',        family: "'Verdana', sans-serif"      },
  { id: 'opendyslexic',name: 'OpenDyslexic',   family: "'OpenDyslexic', sans-serif" },
  { id: 'arial',       name: 'Arial',          family: "'Arial', sans-serif"        },
]

const DEFAULTS = {
  mode:  'ocean',
  color: '#3b82f6',
  font:  'lexend',
}

const KEY = 'addapp-settings'

// ── Read / write ──────────────────────────────────────────────────────────

export function getSettings() {
  try {
    const saved = localStorage.getItem(KEY)
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial) {
  const next = { ...getSettings(), ...partial }
  localStorage.setItem(KEY, JSON.stringify(next))
  applySettings(next)
  return next
}

// ── Apply to DOM ──────────────────────────────────────────────────────────
// Sets data-theme on <html> and overrides --accent / --font CSS variables.
// Ocean Calm keeps its fixed palette — accent override is skipped.

export function applySettings({ mode, color, font } = getSettings()) {
  const root = document.documentElement

  // Theme
  root.setAttribute('data-theme', mode)

  // Accent color (light + dark only — ocean uses its own fixed palette)
  if (mode !== 'ocean') {
    root.style.setProperty('--accent', color)
    root.style.setProperty('--accent2', color + 'cc')
    root.style.setProperty('--accent-glow', color + '22')
  } else {
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent2')
    root.style.removeProperty('--accent-glow')
  }

  // Font — uses the same --font variable the existing CSS already references
  const fontObj = FONTS.find(f => f.id === font) ?? FONTS[0]
  root.style.setProperty('--font', fontObj.family)
}

export function initSettings() {
  applySettings(getSettings())
}
