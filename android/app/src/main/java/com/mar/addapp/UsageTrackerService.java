package com.mar.addapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

public class UsageTrackerService extends Service {

    public static boolean isRunning = false;

    private static final String CHANNEL_ID     = "usage_tracker_channel";
    private static final int    NOTIF_FG_ID    = 9001;
    private static final long   POLL_INTERVAL  = 60_000L;

    private Handler handler;
    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            checkUsage();
            handler.postDelayed(this, POLL_INTERVAL);
        }
    };

    // ── Static helper called by plugin ────────────────────────
    public static long getTodayUsageMinutes(Context context, String packageName) {
        try {
            UsageStatsManager usm = (UsageStatsManager)
                context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return 0;

            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            long start = cal.getTimeInMillis();
            long end   = System.currentTimeMillis();

            List<UsageStats> stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY, start, end);
            if (stats == null) return 0;

            for (UsageStats s : stats) {
                if (s.getPackageName().equals(packageName)) {
                    return s.getTotalTimeInForeground() / 1000L / 60L;
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return 0;
    }

    // ── Lifecycle ─────────────────────────────────────────────
    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        isRunning = true;
        startForeground(NOTIF_FG_ID, buildForegroundNotification());
        handler.post(pollRunnable);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (handler != null) handler.removeCallbacks(pollRunnable);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ── Core polling ──────────────────────────────────────────
    private void checkUsage() {
        SharedPreferences prefs = getSharedPreferences(
            UsageTrackerPlugin.PREFS_NAME, Context.MODE_PRIVATE);

        String appsJson = prefs.getString(UsageTrackerPlugin.KEY_TRACKED_APPS, "[]");
        String notifiedJson = prefs.getString(UsageTrackerPlugin.KEY_NOTIFIED_TODAY, "[]");

        try {
            JSONArray apps     = new JSONArray(appsJson);
            JSONArray notified = new JSONArray(notifiedJson);

            // Build set of already-notified packages
            Set<String> notifiedSet = new HashSet<>();
            for (int i = 0; i < notified.length(); i++) {
                notifiedSet.add(notified.getString(i));
            }

            maybeResetNotified(prefs, notifiedSet);

            boolean changed = false;

            for (int i = 0; i < apps.length(); i++) {
                JSONObject app  = apps.getJSONObject(i);
                String pkg      = app.optString("packageName", "");
                String name     = app.optString("appName", "App");
                int limit       = app.optInt("limitMinutes", 10);
                String goal     = app.optString("majorGoal", "");
                String emoji    = app.optString("emoji", "📱");
                String appId    = app.optString("id", "");

                if (pkg.isEmpty() || notifiedSet.contains(pkg)) continue;

                long minutes = getTodayUsageMinutes(this, pkg);
                if (minutes >= limit) {
                    notifiedSet.add(pkg);
                    changed = true;
                    addShameSession(prefs, appId, name, minutes, limit, goal, emoji);
                    sendShameNotification(name, minutes, limit, goal, emoji);
                }
            }

            if (changed) {
                JSONArray newArr = new JSONArray(notifiedSet);
                prefs.edit()
                    .putString(UsageTrackerPlugin.KEY_NOTIFIED_TODAY, newArr.toString())
                    .apply();
            }

        } catch (Exception e) {
            // ignore parse errors
        }
    }

    private void addShameSession(SharedPreferences prefs,
            String appId, String appName, long minutes, int limit,
            String goal, String emoji) {
        try {
            String existing = prefs.getString(UsageTrackerPlugin.KEY_PENDING_SHAME, "[]");
            JSONArray arr = new JSONArray(existing);
            JSONObject obj = new JSONObject();
            obj.put("appId",        appId);
            obj.put("appName",      appName);
            obj.put("minutesUsed",  minutes);
            obj.put("limitMinutes", limit);
            obj.put("majorGoal",    goal);
            obj.put("emoji",        emoji);
            obj.put("shamedAt",     System.currentTimeMillis());
            arr.put(obj);
            prefs.edit().putString(UsageTrackerPlugin.KEY_PENDING_SHAME, arr.toString()).apply();
        } catch (Exception e) {
            // ignore
        }
    }

    private void sendShameNotification(String appName, long minutes,
            int limit, String goal, String emoji) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        long overBy = minutes - limit;
        String goalLine = goal.isEmpty() ? "" : "\nGoal waiting: " + goal;
        String body = "You've spent " + minutes + " min on " + appName +
            " (" + overBy + " min over your " + limit + " min limit)." +
            goalLine + "\n\nTap to come back.";

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(emoji + " Time's up on " + appName)
            .setContentText(minutes + "min used — " + overBy + "min over your " + limit + "min limit.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build();

        nm.notify((int)(NOTIF_FG_ID + appName.hashCode()), notif);
    }

    private Notification buildForegroundNotification() {
        Intent tapIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent,
            PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle("Screen Timer active")
            .setContentText("Watching for distraction apps")
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Screen Timer", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Distraction app alerts");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    private void maybeResetNotified(SharedPreferences prefs, Set<String> notifiedSet) {
        final String KEY = "last_reset_day";
        int today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
        if (prefs.getInt(KEY, -1) != today) {
            notifiedSet.clear();
            prefs.edit().putInt(KEY, today).apply();
        }
    }
}
