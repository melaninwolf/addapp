package com.mar.addapp;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Process;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

@CapacitorPlugin(name = "UsageTracker")
public class UsageTrackerPlugin extends Plugin {

    public static final String PREFS_NAME        = "UsageTrackerPrefs";
    public static final String KEY_TRACKED_APPS  = "tracked_apps";
    public static final String KEY_PENDING_SHAME = "pending_shame";
    public static final String KEY_NOTIFIED_TODAY = "notified_today";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void checkUsagePermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasUsagePermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestUsagePermission(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        JSArray appsArray = call.getArray("apps");
        if (appsArray == null) {
            call.reject("apps parameter required");
            return;
        }
        prefs().edit()
            .putString(KEY_TRACKED_APPS, appsArray.toString())
            .putString(KEY_NOTIFIED_TODAY, "[]")
            .apply();

        Intent intent = new Intent(getContext(), UsageTrackerService.class);
        getContext().startForegroundService(intent);

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Intent intent = new Intent(getContext(), UsageTrackerService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @PluginMethod
    public void getTodayUsageMinutes(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null) {
            call.reject("packageName required");
            return;
        }
        if (!hasUsagePermission()) {
            JSObject ret = new JSObject();
            ret.put("minutes", -1);
            ret.put("permissionRequired", true);
            call.resolve(ret);
            return;
        }
        long minutes = UsageTrackerService.getTodayUsageMinutes(getContext(), packageName);
        JSObject ret = new JSObject();
        ret.put("minutes", minutes);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPendingShameData(PluginCall call) {
        String json = prefs().getString(KEY_PENDING_SHAME, "[]");
        try {
            JSArray arr = new JSArray(json);
            JSObject ret = new JSObject();
            ret.put("sessions", arr);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("sessions", new JSArray());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void clearPendingShameData(PluginCall call) {
        prefs().edit().putString(KEY_PENDING_SHAME, "[]").apply();
        call.resolve();
    }

    @PluginMethod
    public void isTracking(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("active", UsageTrackerService.isRunning);
        call.resolve(ret);
    }

    private boolean hasUsagePermission() {
        AppOpsManager appOps = (AppOpsManager) getContext()
            .getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) return false;
        @SuppressWarnings("deprecation")
        int mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            getContext().getPackageName()
        );
        return mode == AppOpsManager.MODE_ALLOWED;
    }
}
