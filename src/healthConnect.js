// ─── Health Connect bridge ───────────────────────────────────────────────────
// Talks to the native HealthConnectPlugin (Android only).
// All functions are safe to call on web / iOS — they return null gracefully.
// ─────────────────────────────────────────────────────────────────────────────

import { Capacitor, registerPlugin } from '@capacitor/core'

// Lazily registered — avoids errors on web where the plugin doesn't exist
let _plugin = null
function getPlugin() {
  if (!_plugin) _plugin = registerPlugin('HealthConnect')
  return _plugin
}

/** True only on Android native builds */
export function isHealthConnectSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/**
 * Check whether Health Connect is installed and available on this device.
 * Returns { available: bool, status: int }
 */
export async function checkHealthConnectAvailability() {
  if (!isHealthConnectSupported()) return { available: false }
  try {
    return await getPlugin().checkAvailability()
  } catch {
    return { available: false }
  }
}

/**
 * Request Health Connect read permissions.
 * On first call this opens the Health Connect permission dialog.
 * Returns { granted: bool }
 */
export async function requestHealthPermissions() {
  if (!isHealthConnectSupported()) return { granted: false }
  try {
    return await getPlugin().requestHealthPermissions()
  } catch (e) {
    return { granted: false, error: e?.message }
  }
}

/**
 * Read all health data in one shot.
 * Returns an object with any subset of:
 *   steps          number   — today's step count
 *   sleepHours     number   — last night's sleep duration in hours (1 dp)
 *   sleepTime      string   — sleep start "HH:MM"
 *   wakeTime       string   — sleep end "HH:MM"
 *   bpm            number   — average heart rate over last 24 h
 *   activeCalories number   — active kcal burned today
 */
export async function readAllHealthData() {
  if (!isHealthConnectSupported()) return {}
  try {
    const result = await getPlugin().readAllHealthData()
    return result || {}
  } catch {
    return {}
  }
}

/**
 * Convenience: read today's steps only.
 */
export async function readTodaySteps() {
  if (!isHealthConnectSupported()) return null
  try {
    const r = await getPlugin().readTodaySteps()
    return r?.steps ?? null
  } catch {
    return null
  }
}

/**
 * Convenience: read last night's sleep.
 * Returns { durationHours, sleepTime, wakeTime, found } or null.
 */
export async function readLastNightSleep() {
  if (!isHealthConnectSupported()) return null
  try {
    const r = await getPlugin().readLastNightSleep()
    return r?.found ? r : null
  } catch {
    return null
  }
}

/**
 * Convenience: read average heart rate from the last 24 hours.
 */
export async function readLatestHeartRate() {
  if (!isHealthConnectSupported()) return null
  try {
    const r = await getPlugin().readLatestHeartRate()
    return r?.bpm > 0 ? r.bpm : null
  } catch {
    return null
  }
}
