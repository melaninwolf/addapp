package com.mar.addapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

class UsageTrackerService : Service() {

    companion object {
        var isRunning = false

        const val CHANNEL_ID      = "usage_tracker_channel"
        const val NOTIF_FG_ID     = 9001   // persistent foreground notification
        const val NOTIF_SHAME_ID  = 9002   // shame alert notification
        const val POLL_INTERVAL   = 60_000L  // 1 minute

        fun getTodayUsageMinutes(context: Context, packageName: String): Long {
            val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val cal = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val start = cal.timeInMillis
            val end   = System.currentTimeMillis()

            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end)
            val appStat = stats?.find { it.packageName == packageName }
            return (appStat?.totalTimeInForeground ?: 0L) / 1000L / 60L
        }
    }

    private val handler     = Handler(Looper.getMainLooper())
    private lateinit var prefs: SharedPreferences

    private val pollRunnable = object : Runnable {
        override fun run() {
            checkUsage()
            handler.postDelayed(this, POLL_INTERVAL)
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────
    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(UsageTrackerPlugin.PREFS_NAME, Context.MODE_PRIVATE)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        isRunning = true
        startForeground(NOTIF_FG_ID, buildForegroundNotification())
        handler.post(pollRunnable)
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        handler.removeCallbacks(pollRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Core polling ──────────────────────────────────────────
    private fun checkUsage() {
        val appsJson = prefs.getString(UsageTrackerPlugin.KEY_TRACKED_APPS, "[]") ?: "[]"
        val apps     = JSONArray(appsJson)

        val notifiedJson = prefs.getString(UsageTrackerPlugin.KEY_NOTIFIED_TODAY, "[]") ?: "[]"
        val notifiedArr  = JSONArray(notifiedJson)
        val notifiedSet  = (0 until notifiedArr.length()).map { notifiedArr.getString(it) }.toMutableSet()

        // Reset notified set at midnight
        maybeResetNotified(notifiedSet)

        var changed = false

        for (i in 0 until apps.length()) {
            val app     = apps.getJSONObject(i)
            val pkg     = app.getString("packageName")
            val name    = app.getString("appName")
            val limit   = app.getInt("limitMinutes")
            val goal    = app.optString("majorGoal", "")
            val emoji   = app.optString("emoji", "📱")
            val appId   = app.optString("id", "")

            if (pkg.isBlank() || notifiedSet.contains(pkg)) continue

            val minutes = getTodayUsageMinutes(this, pkg)
            if (minutes >= limit) {
                // Mark as notified so we don't spam
                notifiedSet.add(pkg)
                changed = true

                // Save shame session to prefs for React to pick up
                addShameSession(appId, name, minutes, limit, goal, emoji)

                // Send a local notification to bring user back
                sendShameNotification(name, minutes, limit, goal, emoji)
            }
        }

        if (changed) {
            val newArr = JSONArray(notifiedSet)
            prefs.edit().putString(UsageTrackerPlugin.KEY_NOTIFIED_TODAY, newArr.toString()).apply()
        }
    }

    // ── Save shame session to SharedPreferences ───────────────
    private fun addShameSession(
        appId: String, appName: String,
        minutes: Long, limit: Int,
        goal: String, emoji: String
    ) {
        val existing = prefs.getString(UsageTrackerPlugin.KEY_PENDING_SHAME, "[]") ?: "[]"
        val arr = JSONArray(existing)
        val obj = JSONObject().apply {
            put("appId",        appId)
            put("appName",      appName)
            put("minutesUsed",  minutes)
            put("limitMinutes", limit)
            put("majorGoal",    goal)
            put("emoji",        emoji)
            put("shamedAt",     System.currentTimeMillis())
        }
        arr.put(obj)
        prefs.edit().putString(UsageTrackerPlugin.KEY_PENDING_SHAME, arr.toString()).apply()
    }

    // ── Local notification ────────────────────────────────────
    private fun sendShameNotification(
        appName: String, minutes: Long, limit: Int,
        goal: String, emoji: String
    ) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val overBy   = minutes - limit
        val goalLine = if (goal.isNotBlank()) "\nGoal waiting: $goal" else ""

        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("$emoji Time's up on $appName")
            .setContentText("${minutes}min used — ${overBy}min over your ${limit}min limit.$goalLine")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("You've spent ${minutes} min on $appName today (${overBy} min over your ${limit} min limit).${goalLine}\n\nTap to come back."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()

        nm.notify(NOTIF_SHAME_ID + appName.hashCode(), notif)
    }

    // ── Foreground notification ───────────────────────────────
    private fun buildForegroundNotification(): Notification {
        val tapIntent = Intent(this, MainActivity::class.java)
        val pi = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle("Screen Timer active")
            .setContentText("Watching for distraction apps")
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    // ── Notification channel ──────────────────────────────────
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Screen Timer",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Distraction app alerts"
        }
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(channel)
    }

    // ── Reset notified set at midnight ────────────────────────
    private fun maybeResetNotified(notifiedSet: MutableSet<String>) {
        val lastResetKey = "last_reset_day"
        val today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
        val lastReset = prefs.getInt(lastResetKey, -1)
        if (today != lastReset) {
            notifiedSet.clear()
            prefs.edit().putInt(lastResetKey, today).apply()
        }
    }
}
