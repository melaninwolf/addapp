package com.mar.addapp

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(name = "UsageTracker")
class UsageTrackerPlugin : Plugin() {

    companion object {
        const val PREFS_NAME       = "UsageTrackerPrefs"
        const val KEY_TRACKED_APPS = "tracked_apps"
        const val KEY_PENDING_SHAME = "pending_shame"
        const val KEY_NOTIFIED_TODAY = "notified_today"
    }

    private fun prefs(): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ── Check if Usage Access permission is granted ───────────
    @PluginMethod
    fun checkUsagePermission(call: PluginCall) {
        val granted = hasUsagePermission()
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    // ── Open the Usage Access settings screen ─────────────────
    @PluginMethod
    fun requestUsagePermission(call: PluginCall) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        activity.startActivity(intent)
        call.resolve()
    }

    // ── Start tracking ────────────────────────────────────────
    // Expects: { apps: [ { packageName, appName, limitMinutes, majorGoal, emoji } ] }
    @PluginMethod
    fun startTracking(call: PluginCall) {
        val appsArray = call.getArray("apps") ?: run {
            call.reject("apps parameter required")
            return
        }

        // Persist tracked app list for the service to read
        prefs().edit().putString(KEY_TRACKED_APPS, appsArray.toString()).apply()

        // Reset notified-today set so limits can fire again
        prefs().edit().putString(KEY_NOTIFIED_TODAY, "[]").apply()

        // Start the foreground service
        val intent = Intent(context, UsageTrackerService::class.java)
        context.startForegroundService(intent)

        val ret = JSObject()
        ret.put("started", true)
        call.resolve(ret)
    }

    // ── Stop tracking ─────────────────────────────────────────
    @PluginMethod
    fun stopTracking(call: PluginCall) {
        val intent = Intent(context, UsageTrackerService::class.java)
        context.stopService(intent)
        call.resolve()
    }

    // ── Get today's usage for a specific package ──────────────
    // Expects: { packageName: "com.zhiliaoapp.musically" }
    @PluginMethod
    fun getTodayUsageMinutes(call: PluginCall) {
        val packageName = call.getString("packageName") ?: run {
            call.reject("packageName required")
            return
        }
        if (!hasUsagePermission()) {
            val ret = JSObject()
            ret.put("minutes", -1)
            ret.put("permissionRequired", true)
            call.resolve(ret)
            return
        }
        val minutes = UsageTrackerService.getTodayUsageMinutes(context, packageName)
        val ret = JSObject()
        ret.put("minutes", minutes)
        call.resolve(ret)
    }

    // ── Get all pending shame events ──────────────────────────
    @PluginMethod
    fun getPendingShameData(call: PluginCall) {
        val json = prefs().getString(KEY_PENDING_SHAME, "[]") ?: "[]"
        val arr  = JSArray(json)
        val ret  = JSObject()
        ret.put("sessions", arr)
        call.resolve(ret)
    }

    // ── Clear pending shame events ────────────────────────────
    @PluginMethod
    fun clearPendingShameData(call: PluginCall) {
        prefs().edit().putString(KEY_PENDING_SHAME, "[]").apply()
        call.resolve()
    }

    // ── Is service currently running ──────────────────────────
    @PluginMethod
    fun isTracking(call: PluginCall) {
        val ret = JSObject()
        ret.put("active", UsageTrackerService.isRunning)
        call.resolve(ret)
    }

    // ── Helpers ───────────────────────────────────────────────
    private fun hasUsagePermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }
}
