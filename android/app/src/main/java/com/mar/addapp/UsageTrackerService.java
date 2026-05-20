package com.mar.addapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class UsageTrackerService extends Service {

    public static boolean isRunning = false;

    private static final String CHANNEL_ID       = "usage_tracker_channel";
    private static final int    NOTIF_FG_ID      = 9001;
    private static final long   POLL_INTERVAL    = 5_000L;
    private static final long   OVERLAY_COOLDOWN = 10 * 60_000L;

    private static final long SYNC_INTERVAL = 60_000L;

    private Handler handler;
    private WindowManager windowManager;
    private android.view.View overlayView = null;
    private String overlayPkg = null;
    private final Map<String, Long> lastOverlayTime   = new HashMap<>();
    private final Map<String, Long> cachedTotalMinutes = new HashMap<>();
    private long lastSyncTime = 0;

    private final Runnable pollRunnable = new Runnable() {
        @Override public void run() {
            checkUsage();
            handler.postDelayed(this, POLL_INTERVAL);
        }
    };

    public static long getTodayUsageMinutes(Context context, String packageName) {
        try {
            UsageStatsManager usm = (UsageStatsManager)
                context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return 0;
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);      cal.set(Calendar.MILLISECOND, 0);
            List<UsageStats> stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                cal.getTimeInMillis(), System.currentTimeMillis());
            if (stats == null) return 0;
            for (UsageStats s : stats)
                if (s.getPackageName().equals(packageName))
                    return s.getTotalTimeInForeground() / 60_000L;
        } catch (Exception ignored) {}
        return 0;
    }

    private String getForegroundApp() {
        try {
            UsageStatsManager usm = (UsageStatsManager)
                getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return null;
            long now = System.currentTimeMillis();
            UsageEvents events = usm.queryEvents(now - 5_000L, now);
            UsageEvents.Event event = new UsageEvents.Event();
            String fg = null;
            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND)
                    fg = event.getPackageName();
            }
            return fg;
        } catch (Exception ignored) { return null; }
    }

    @Override public void onCreate() {
        super.onCreate();
        handler       = new Handler(Looper.getMainLooper());
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        isRunning = true;
        startForeground(NOTIF_FG_ID, buildForegroundNotification());
        handler.post(pollRunnable);
        return START_STICKY;
    }

    @Override public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (handler != null) handler.removeCallbacks(pollRunnable);
        removeOverlay();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void checkUsage() {
        SharedPreferences prefs = getSharedPreferences(
            UsageTrackerPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String appsJson     = prefs.getString(UsageTrackerPlugin.KEY_TRACKED_APPS, "[]");
        String notifiedJson = prefs.getString(UsageTrackerPlugin.KEY_NOTIFIED_TODAY, "[]");
        try {
            JSONArray apps     = new JSONArray(appsJson);
            JSONArray notified = new JSONArray(notifiedJson);
            Set<String> notifiedSet = new HashSet<>();
            for (int i = 0; i < notified.length(); i++) notifiedSet.add(notified.getString(i));
            maybeResetNotified(prefs, notifiedSet);

            // Kick off background sync to Supabase every 60s
            maybeSyncToSupabase(apps, prefs);

            String foregroundPkg = getForegroundApp();
            boolean changed = false;

            for (int i = 0; i < apps.length(); i++) {
                JSONObject app = apps.getJSONObject(i);
                String pkg   = app.optString("packageName", "");
                String name  = app.optString("appName", "App");
                int    limit = app.optInt("limitMinutes", 10);
                String goal  = app.optString("majorGoal", "");
                String emoji = app.optString("emoji", "📱");
                String appId = app.optString("id", "");
                if (pkg.isEmpty()) continue;

                long localMinutes = getTodayUsageMinutes(this, pkg);
                // Use cross-device total if available, otherwise fall back to local
                long minutes;
                synchronized (cachedTotalMinutes) {
                    minutes = cachedTotalMinutes.containsKey(pkg)
                        ? Math.max(localMinutes, cachedTotalMinutes.get(pkg))
                        : localMinutes;
                }

                if (minutes < limit) {
                    if (pkg.equals(overlayPkg)) removeOverlay();
                    continue;
                }

                // First crossing — add shame session + notification (once per day)
                if (!notifiedSet.contains(pkg)) {
                    notifiedSet.add(pkg);
                    changed = true;
                    addShameSession(prefs, appId, name, minutes, limit, goal, emoji);
                    sendShameNotification(name, minutes, limit, goal, emoji);
                }

                // If this app is foreground and cooldown elapsed → show overlay
                boolean isFg = pkg.equals(foregroundPkg);
                if (isFg) {
                    long last = lastOverlayTime.containsKey(pkg) ? lastOverlayTime.get(pkg) : 0L;
                    if (System.currentTimeMillis() - last >= OVERLAY_COOLDOWN) {
                        showOverlay(pkg, name, minutes, limit, goal, emoji);
                        lastOverlayTime.put(pkg, System.currentTimeMillis());
                    }
                } else if (pkg.equals(overlayPkg)) {
                    removeOverlay();
                }
            }

            if (changed)
                prefs.edit().putString(UsageTrackerPlugin.KEY_NOTIFIED_TODAY,
                    new JSONArray(notifiedSet).toString()).apply();

        } catch (Exception ignored) {}
    }

    // ── Cross-device sync ────────────────────────────────────────────────────

    private void maybeSyncToSupabase(final JSONArray apps, SharedPreferences prefs) {
        long now = System.currentTimeMillis();
        if (now - lastSyncTime < SYNC_INTERVAL) return;
        lastSyncTime = now;

        final String userId      = prefs.getString(UsageTrackerPlugin.KEY_USER_ID, "");
        final String supabaseUrl = prefs.getString(UsageTrackerPlugin.KEY_SUPABASE_URL, "");
        final String supabaseKey = prefs.getString(UsageTrackerPlugin.KEY_SUPABASE_KEY, "");
        final String deviceId    = prefs.getString(UsageTrackerPlugin.KEY_DEVICE_ID, "unknown");

        if (userId.isEmpty() || supabaseUrl.isEmpty() || supabaseKey.isEmpty()) return;

        new Thread(() -> {
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            for (int i = 0; i < apps.length(); i++) {
                try {
                    JSONObject app = apps.getJSONObject(i);
                    String pkg = app.optString("packageName", "");
                    if (pkg.isEmpty()) continue;

                    long localMins = getTodayUsageMinutes(UsageTrackerService.this, pkg);

                    // Push this device's count
                    upsertUsageSync(supabaseUrl, supabaseKey, userId, deviceId, pkg, today, localMins);

                    // Fetch total across all devices
                    long total = fetchTotalUsage(supabaseUrl, supabaseKey, userId, pkg, today);
                    if (total >= 0) {
                        synchronized (cachedTotalMinutes) {
                            cachedTotalMinutes.put(pkg, total);
                        }
                    }
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private void upsertUsageSync(String baseUrl, String key, String userId,
            String deviceId, String pkg, String date, long minutes) {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("user_id",      userId);
            body.put("device_id",    deviceId);
            body.put("package_name", pkg);
            body.put("date",         date);
            body.put("minutes",      minutes);
            body.put("updated_at",
                new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(new Date()));

            URL url = new URL(baseUrl + "/rest/v1/device_usage_sync");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey",         key);
            conn.setRequestProperty("Authorization",  "Bearer " + key);
            conn.setRequestProperty("Content-Type",   "application/json");
            conn.setRequestProperty("Prefer",         "resolution=merge-duplicates,return=minimal");
            conn.setDoOutput(true);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);

            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.flush();
            conn.getResponseCode(); // send request
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private long fetchTotalUsage(String baseUrl, String key, String userId,
            String pkg, String date) {
        HttpURLConnection conn = null;
        try {
            String endpoint = baseUrl + "/rest/v1/device_usage_sync"
                + "?select=minutes"
                + "&user_id=eq."      + URLEncoder.encode(userId, "UTF-8")
                + "&package_name=eq." + URLEncoder.encode(pkg,    "UTF-8")
                + "&date=eq."         + date;

            URL url = new URL(endpoint);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey",        key);
            conn.setRequestProperty("Authorization", "Bearer " + key);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);

            InputStream is = conn.getInputStream();
            String response = new Scanner(is, "UTF-8").useDelimiter("\\A").next();
            conn.disconnect();

            // Response: [{"minutes":10},{"minutes":20}] — sum them
            JSONArray arr = new JSONArray(response);
            long total = 0;
            for (int i = 0; i < arr.length(); i++)
                total += arr.getJSONObject(i).optLong("minutes", 0);
            return total;
        } catch (Exception ignored) {
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void showOverlay(final String pkg, final String appName,
            final long minutes, final int limit, final String goal, final String emoji) {
        if (!Settings.canDrawOverlays(this)) return;
        handler.post(() -> {
            removeOverlay();

            LinearLayout root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setGravity(Gravity.CENTER);
            root.setBackgroundColor(Color.argb(235, 8, 8, 18));
            int p = dp(24);
            root.setPadding(p, p, p, p);

            TextView emojiTv = new TextView(this);
            emojiTv.setText(emoji);
            emojiTv.setTextSize(56);
            emojiTv.setGravity(Gravity.CENTER);
            root.addView(emojiTv);

            TextView titleTv = new TextView(this);
            titleTv.setText("Time's up on " + appName);
            titleTv.setTextColor(Color.WHITE);
            titleTv.setTextSize(22);
            titleTv.setTypeface(null, Typeface.BOLD);
            titleTv.setGravity(Gravity.CENTER);
            titleTv.setPadding(0, dp(12), 0, dp(6));
            root.addView(titleTv);

            long over = minutes - limit;
            TextView statsTv = new TextView(this);
            statsTv.setText(minutes + " min used · " + over + " min over your " + limit + " min limit");
            statsTv.setTextColor(Color.argb(220, 255, 100, 100));
            statsTv.setTextSize(14);
            statsTv.setGravity(Gravity.CENTER);
            root.addView(statsTv);

            if (!goal.isEmpty()) {
                TextView goalTv = new TextView(this);
                goalTv.setText("🎯 " + goal);
                goalTv.setTextColor(Color.argb(210, 130, 220, 130));
                goalTv.setTextSize(14);
                goalTv.setGravity(Gravity.CENTER);
                goalTv.setPadding(0, dp(10), 0, 0);
                root.addView(goalTv);
            }

            TextView reminderTv = new TextView(this);
            reminderTv.setText("This reminder will reappear every 10 minutes.");
            reminderTv.setTextColor(Color.argb(140, 200, 200, 200));
            reminderTv.setTextSize(12);
            reminderTv.setGravity(Gravity.CENTER);
            reminderTv.setPadding(0, dp(18), 0, dp(22));
            root.addView(reminderTv);

            // Go back button
            Button goBackBtn = new Button(this);
            goBackBtn.setText("← Go back to AddApp");
            goBackBtn.setTextColor(Color.WHITE);
            goBackBtn.setBackgroundColor(Color.argb(255, 99, 102, 241));
            LinearLayout.LayoutParams bp =
                new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            bp.setMargins(0, 0, 0, dp(10));
            root.addView(goBackBtn, bp);
            goBackBtn.setOnClickListener(v -> {
                removeOverlay();
                Intent launch = new Intent(UsageTrackerService.this, MainActivity.class);
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(launch);
            });

            // Snooze button
            Button snoozeBtn = new Button(this);
            snoozeBtn.setText("Continue (back in 10 min)");
            snoozeBtn.setTextColor(Color.argb(180, 255, 255, 255));
            snoozeBtn.setBackgroundColor(Color.argb(70, 255, 255, 255));
            root.addView(snoozeBtn, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
            snoozeBtn.setOnClickListener(v -> {
                removeOverlay();
                lastOverlayTime.put(pkg, System.currentTimeMillis());
            });

            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.TOP | Gravity.START;

            try {
                windowManager.addView(root, params);
                overlayView = root;
                overlayPkg  = pkg;
            } catch (Exception ignored) {}
        });
    }

    private void removeOverlay() {
        if (overlayView != null) {
            try { windowManager.removeView(overlayView); } catch (Exception ignored) {}
            overlayView = null;
            overlayPkg  = null;
        }
    }

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private void addShameSession(SharedPreferences prefs, String appId,
            String appName, long minutes, int limit, String goal, String emoji) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(UsageTrackerPlugin.KEY_PENDING_SHAME, "[]"));
            JSONObject obj = new JSONObject();
            obj.put("appId", appId); obj.put("appName", appName);
            obj.put("minutesUsed", minutes); obj.put("limitMinutes", limit);
            obj.put("majorGoal", goal); obj.put("emoji", emoji);
            obj.put("shamedAt", System.currentTimeMillis());
            arr.put(obj);
            prefs.edit().putString(UsageTrackerPlugin.KEY_PENDING_SHAME, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    private void sendShameNotification(String appName, long minutes,
            int limit, String goal, String emoji) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long over = minutes - limit;
        String body = "You've spent " + minutes + " min on " + appName +
            " (" + over + " min over your " + limit + " min limit)." +
            (goal.isEmpty() ? "" : "\nGoal waiting: " + goal) +
            "\n\nAn overlay will appear every 10 minutes while you're in the app.";
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(emoji + " Time's up on " + appName)
            .setContentText(minutes + "min · " + over + "min over your " + limit + "min limit")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi).setAutoCancel(true).build();
        nm.notify((int)(NOTIF_FG_ID + appName.hashCode()), notif);
    }

    private Notification buildForegroundNotification() {
        Intent tapIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle("Screen Timer active")
            .setContentText("Watching for distraction apps")
            .setContentIntent(pi).setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN).build();
    }

    private void createNotificationChannel() {
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Screen Timer", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Distraction app alerts");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private void maybeResetNotified(SharedPreferences prefs, Set<String> notifiedSet) {
        final String KEY = "last_reset_day";
        int today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
        if (prefs.getInt(KEY, -1) != today) {
            notifiedSet.clear();
            lastOverlayTime.clear();
            prefs.edit().putInt(KEY, today).apply();
        }
    }
}
            LinearLayout.LayoutParams bp =
                new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            bp.setMargins(0, 0, 0, dp(10));
            root.addView(goBackBtn, bp);
            goBackBtn.setOnClickListener(v -> {
                removeOverlay();
                Intent launch = new Intent(UsageTrackerService.this, MainActivity.class);
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(launch);
            });

            // Snooze button
            Button snoozeBtn = new Button(this);
            snoozeBtn.setText("Continue (back in 10 min)");
            snoozeBtn.setTextColor(Color.argb(180, 255, 255, 255));
            snoozeBtn.setBackgroundColor(Color.argb(70, 255, 255, 255));
            root.addView(snoozeBtn, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
            snoozeBtn.setOnClickListener(v -> {
                removeOverlay();
                lastOverlayTime.put(pkg, System.currentTimeMillis());
            });

            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.TOP | Gravity.START;

            try {
                windowManager.addView(root, params);
                overlayView = root;
                overlayPkg  = pkg;
            } catch (Exception ignored) {}
        });
    }

    private void removeOverlay() {
        if (overlayView != null) {
            try { windowManager.removeView(overlayView); } catch (Exception ignored) {}
            overlayView = null;
            overlayPkg  = null;
        }
    }

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private void addShameSession(SharedPreferences prefs, String appId,
            String appName, long minutes, int limit, String goal, String emoji) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(UsageTrackerPlugin.KEY_PENDING_SHAME, "[]"));
            JSONObject obj = new JSONObject();
            obj.put("appId", appId); obj.put("appName", appName);
            obj.put("minutesUsed", minutes); obj.put("limitMinutes", limit);
            obj.put("majorGoal", goal); obj.put("emoji", emoji);
            obj.put("shamedAt", System.currentTimeMillis());
            arr.put(obj);
            prefs.edit().putString(UsageTrackerPlugin.KEY_PENDING_SHAME, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    private void sendShameNotification(String appName, long minutes,
            int limit, String goal, String emoji) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long over = minutes - limit;
        String body = "You've spent " + minutes + " min on " + appName +
            " (" + over + " min over your " + limit + " min limit)." +
            (goal.isEmpty() ? "" : "\nGoal waiting: " + goal) +
            "\n\nAn overlay will appear every 10 minutes while you're in the app.";
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(emoji + " Time's up on " + appName)
            .setContentText(minutes + "min · " + over + "min over your " + limit + "min limit")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi).setAutoCancel(true).build();
        nm.notify((int)(NOTIF_FG_ID + appName.hashCode()), notif);
    }

    private Notification buildForegroundNotification() {
        Intent tapIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent, PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle("Screen Timer active")
            .setContentText("Watching for distraction apps")
            .setContentIntent(pi).setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN).build();
    }

    private void createNotificationChannel() {
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Screen Timer", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Distraction app alerts");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private void maybeResetNotified(SharedPreferences prefs, Set<String> notifiedSet) {
        final String KEY = "last_reset_day";
        int today = Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
        if (prefs.getInt(KEY, -1) != today) {
            notifiedSet.clear();
            lastOverlayTime.clear();
            prefs.edit().putInt(KEY, today).apply();
        }
    }
}
