package com.mar.addapp

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val REQUIRED_PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    )

    private fun getClient(): HealthConnectClient? {
        val ctx = context ?: return null
        return try {
            if (HealthConnectClient.getSdkStatus(ctx) != HealthConnectClient.SDK_AVAILABLE) null
            else HealthConnectClient.getOrCreate(ctx)
        } catch (e: Exception) { null }
    }

    // ── checkAvailability ────────────────────────────────────────────────────

    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        val ctx = context ?: run { call.resolve(JSObject().put("available", false)); return }
        val status = HealthConnectClient.getSdkStatus(ctx)
        call.resolve(JSObject()
            .put("available", status == HealthConnectClient.SDK_AVAILABLE)
            .put("status", status))
    }

    // ── requestPermissions ───────────────────────────────────────────────────

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        val client = getClient() ?: run {
            call.resolve(JSObject().put("granted", false).put("notInstalled", true))
            return
        }
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.containsAll(REQUIRED_PERMISSIONS)) {
                    call.resolve(JSObject().put("granted", true))
                    return@launch
                }
                // Launch the Health Connect permission dialog
                val intent = client.permissionController
                    .createRequestPermissionResultContract()
                    .createIntent(context, REQUIRED_PERMISSIONS)
                startActivityForResult(call, intent, "onPermissionResult")
            } catch (e: Exception) {
                call.resolve(JSObject().put("granted", false).put("error", e.message))
            }
        }
    }

    @ActivityCallback
    private fun onPermissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val client = getClient() ?: run { call.resolve(JSObject().put("granted", false)); return }
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                call.resolve(JSObject().put("granted", granted.containsAll(REQUIRED_PERMISSIONS)))
            } catch (e: Exception) {
                call.resolve(JSObject().put("granted", false).put("error", e.message))
            }
        }
    }

    // ── readTodaySteps ───────────────────────────────────────────────────────

    @PluginMethod
    fun readTodaySteps(call: PluginCall) {
        val client = getClient() ?: run { call.resolve(JSObject().put("steps", 0)); return }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val start = LocalDate.now(ZoneId.systemDefault())
                    .atStartOfDay(ZoneId.systemDefault()).toInstant()
                val resp = client.readRecords(
                    ReadRecordsRequest(StepsRecord::class,
                        TimeRangeFilter.between(start, Instant.now()))
                )
                call.resolve(JSObject().put("steps", resp.records.sumOf { it.count }))
            } catch (e: Exception) {
                call.resolve(JSObject().put("steps", 0).put("error", e.message))
            }
        }
    }

    // ── readLastNightSleep ───────────────────────────────────────────────────

    @PluginMethod
    fun readLastNightSleep(call: PluginCall) {
        val client = getClient() ?: run { call.resolve(JSObject().put("found", false)); return }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val now      = Instant.now()
                val dayAgo   = now.minusSeconds(86400)
                val resp     = client.readRecords(
                    ReadRecordsRequest(SleepSessionRecord::class,
                        TimeRangeFilter.between(dayAgo, now))
                )
                val session  = resp.records.maxByOrNull { it.endTime }
                val result   = JSObject()
                if (session != null) {
                    val ms      = session.endTime.toEpochMilli() - session.startTime.toEpochMilli()
                    val hours   = Math.round(ms / 360_000.0) / 10.0
                    val startZdt = session.startTime.atZone(ZoneId.systemDefault())
                    val endZdt   = session.endTime.atZone(ZoneId.systemDefault())
                    result.put("found",        true)
                    result.put("durationHours", hours)
                    result.put("sleepTime", "%02d:%02d".format(startZdt.hour, startZdt.minute))
                    result.put("wakeTime",  "%02d:%02d".format(endZdt.hour,   endZdt.minute))
                } else {
                    result.put("found", false)
                }
                call.resolve(result)
            } catch (e: Exception) {
                call.resolve(JSObject().put("found", false).put("error", e.message))
            }
        }
    }

    // ── readLatestHeartRate ──────────────────────────────────────────────────

    @PluginMethod
    fun readLatestHeartRate(call: PluginCall) {
        val client = getClient() ?: run { call.resolve(JSObject().put("bpm", 0)); return }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val now    = Instant.now()
                val dayAgo = now.minusSeconds(86400)
                val resp   = client.readRecords(
                    ReadRecordsRequest(HeartRateRecord::class,
                        TimeRangeFilter.between(dayAgo, now))
                )
                val samples = resp.records.flatMap { it.samples }
                val avg     = if (samples.isNotEmpty())
                    samples.map { it.beatsPerMinute }.average().toLong() else 0L
                call.resolve(JSObject().put("bpm", avg).put("sampleCount", samples.size))
            } catch (e: Exception) {
                call.resolve(JSObject().put("bpm", 0).put("error", e.message))
            }
        }
    }

    // ── readAllHealthData ────────────────────────────────────────────────────
    // One call to get everything — used by Health.jsx on mount.

    @PluginMethod
    fun readAllHealthData(call: PluginCall) {
        val client = getClient() ?: run { call.resolve(JSObject()); return }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val now       = Instant.now()
                val todayStart = LocalDate.now(ZoneId.systemDefault())
                    .atStartOfDay(ZoneId.systemDefault()).toInstant()
                val dayAgo    = now.minusSeconds(86400)
                val result    = JSObject()

                // Steps (today)
                val stepsResp = client.readRecords(
                    ReadRecordsRequest(StepsRecord::class,
                        TimeRangeFilter.between(todayStart, now))
                )
                result.put("steps", stepsResp.records.sumOf { it.count })

                // Sleep (last 24 h)
                val sleepResp = client.readRecords(
                    ReadRecordsRequest(SleepSessionRecord::class,
                        TimeRangeFilter.between(dayAgo, now))
                )
                val lastSleep = sleepResp.records.maxByOrNull { it.endTime }
                if (lastSleep != null) {
                    val ms   = lastSleep.endTime.toEpochMilli() - lastSleep.startTime.toEpochMilli()
                    val startZdt = lastSleep.startTime.atZone(ZoneId.systemDefault())
                    val endZdt   = lastSleep.endTime.atZone(ZoneId.systemDefault())
                    result.put("sleepHours", Math.round(ms / 360_000.0) / 10.0)
                    result.put("sleepTime", "%02d:%02d".format(startZdt.hour, startZdt.minute))
                    result.put("wakeTime",  "%02d:%02d".format(endZdt.hour,   endZdt.minute))
                }

                // Heart rate (24 h average)
                val hrResp  = client.readRecords(
                    ReadRecordsRequest(HeartRateRecord::class,
                        TimeRangeFilter.between(dayAgo, now))
                )
                val samples = hrResp.records.flatMap { it.samples }
                if (samples.isNotEmpty()) {
                    result.put("bpm", samples.map { it.beatsPerMinute }.average().toLong())
                }

                // Active calories (today)
                val calResp = client.readRecords(
                    ReadRecordsRequest(ActiveCaloriesBurnedRecord::class,
                        TimeRangeFilter.between(todayStart, now))
                )
                val totalCal = calResp.records.sumOf { it.energy.inKilocalories }
                result.put("activeCalories", Math.round(totalCal).toInt())

                call.resolve(result)
            } catch (e: Exception) {
                call.resolve(JSObject().put("error", e.message))
            }
        }
    }
}
