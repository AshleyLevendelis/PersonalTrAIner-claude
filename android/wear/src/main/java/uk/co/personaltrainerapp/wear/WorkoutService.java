package uk.co.personaltrainerapp.wear;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import androidx.health.services.client.ExerciseClient;
import androidx.health.services.client.ExerciseUpdateCallback;
import androidx.health.services.client.HealthServices;
import androidx.health.services.client.data.Availability;
import androidx.health.services.client.data.CumulativeDataPoint;
import androidx.health.services.client.data.DataPointContainer;
import androidx.health.services.client.data.DataType;
import androidx.health.services.client.data.ExerciseCapabilities;
import androidx.health.services.client.data.ExerciseConfig;
import androidx.health.services.client.data.ExerciseLapSummary;
import androidx.health.services.client.data.ExerciseType;
import androidx.health.services.client.data.ExerciseUpdate;
import androidx.health.services.client.data.SampleDataPoint;

import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * ONE WORKOUT AT A TIME, RECORDED BY THE WATCH ITSELF (W1-W3 of docs/plans/watch-app.md). Health Services reads the
 * heart sensor about once a second while an exercise runs, which is the only way to get live heart rate from a Galaxy
 * Watch (Samsung passes a phone app its readings late). This service owns that exercise, keeps it running with the
 * screen off (a foreground service of the health type), sends each few seconds of heart rate to the phone (PhoneLink),
 * and keeps the figures the screens draw: the clock, heart rate and its zone, and on foot the steps and distance.
 *
 * Walk and run record steps and distance; a bike, the "Other" choice and a lifting session record heart rate and
 * calories only (the phone's rule: steps for work on foot only). Nothing here judges a reading or prescribes a zone.
 */
public class WorkoutService extends Service {
    private static final String TAG = "PtWorkout";
    static final String ACTION_START = "uk.co.personaltrainerapp.wear.START";
    static final String ACTION_END = "uk.co.personaltrainerapp.wear.END";
    static final String EXTRA_KIND = "kind";         // "cardio" or "lift"
    static final String EXTRA_ACTIVITY = "activity"; // "Walk", "Run", "Bike", "Other", or the session's name
    private static final String CHANNEL = "workout";
    private static final int NOTIFICATION_ID = 41;
    /** A reading counts for the time until the next one, never longer (the phone's LONGEST_HOLD_MS): a gap is not effort. */
    private static final long LONGEST_HOLD_MS = 5 * 60 * 1000;
    private static final long BATCH_MS = 5000;

    /** What the screens draw. Read on the main thread only. */
    static final class Live {
        boolean running;
        String kind = "";
        String activity = "";
        long startedAt;
        int bpm;
        long bpmAt;
        long steps = -1;      // -1: not recorded for this activity
        double distanceM = -1;
        double kcal = -1;
        final long[] zoneMs = new long[5];
        long lastZoneAt;
        int lastZone;
        int maxBpm;
        long sumBpm;
        int readings;
    }
    static final Live LIVE = new Live();
    private static Runnable onChange;
    static void setOnChange(Runnable r) { onChange = r; }

    private final Handler main = new Handler(Looper.getMainLooper());
    private ExerciseClient exercise;
    private final JSONArray pending = new JSONArray();
    private long lastBatchAt;
    private int estimatedMax;

    static void start(Context c, String kind, String activity) {
        Intent i = new Intent(c, WorkoutService.class).setAction(ACTION_START).putExtra(EXTRA_KIND, kind).putExtra(EXTRA_ACTIVITY, activity);
        ContextCompat.startForegroundService(c, i);
    }

    static void end(Context c) {
        c.startService(new Intent(c, WorkoutService.class).setAction(ACTION_END));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) {
            if (LIVE.running) return START_NOT_STICKY; // one at a time
            String kind = intent.getStringExtra(EXTRA_KIND);
            String activity = intent.getStringExtra(EXTRA_ACTIVITY);
            goForeground(activity);
            begin(kind == null ? "cardio" : kind, activity == null ? "Workout" : activity);
        } else if (ACTION_END.equals(action)) {
            finish();
        }
        return START_NOT_STICKY;
    }

    private void goForeground(String activity) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Workout", NotificationManager.IMPORTANCE_LOW));
        }
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(activity)
                .setContentText("Workout running")
                .setOngoing(true)
                .setContentIntent(open)
                .build();
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
    }

    private void begin(String kind, String activity) {
        Live l = LIVE;
        l.running = true; l.kind = kind; l.activity = activity; l.startedAt = System.currentTimeMillis();
        l.bpm = 0; l.bpmAt = 0; l.maxBpm = 0; l.sumBpm = 0; l.readings = 0; l.lastZoneAt = 0; l.lastZone = 0;
        java.util.Arrays.fill(l.zoneMs, 0);
        boolean onFoot = "cardio".equals(kind) && ("Walk".equals(activity) || "Run".equals(activity));
        l.steps = onFoot ? 0 : -1; l.distanceM = onFoot ? 0 : -1; l.kcal = 0;
        estimatedMax = TodayStore.estimatedMax(this);
        changed();

        if ("cardio".equals(kind)) {
            try {
                JSONObject e = new JSONObject();
                e.put("type", "cardio-start"); e.put("activity", activity); e.put("startedAt", l.startedAt);
                PhoneLink.send(this, e);
            } catch (Exception ignored) { /* our own object */ }
        }

        ExerciseType type = exerciseTypeFor(kind, activity);
        exercise = HealthServices.getClient(this).getExerciseClient();
        exercise.setUpdateCallback(ContextCompat.getMainExecutor(this), callback);
        Futures.addCallback(exercise.getCapabilitiesAsync(), new FutureCallback<ExerciseCapabilities>() {
            @Override public void onSuccess(ExerciseCapabilities caps) {
                Set<DataType<?, ?>> want = new HashSet<>();
                want.add(DataType.HEART_RATE_BPM);
                want.add(DataType.CALORIES_TOTAL);
                if (onFoot) { want.add(DataType.STEPS_TOTAL); want.add(DataType.DISTANCE_TOTAL); }
                Set<DataType<?, ?>> supported = caps.getExerciseTypeCapabilities(type).getSupportedDataTypes();
                want.retainAll(supported);
                ExerciseConfig config = new ExerciseConfig.Builder(type)
                        .setDataTypes(want)
                        .setIsAutoPauseAndResumeEnabled(false)
                        .setIsGpsEnabled(false)
                        .build();
                Futures.addCallback(exercise.startExerciseAsync(config), logFailure("start"), ContextCompat.getMainExecutor(WorkoutService.this));
            }
            @Override public void onFailure(@NonNull Throwable t) { Log.w(TAG, "capabilities", t); }
        }, ContextCompat.getMainExecutor(this));
    }

    /** Walk, run and bike are the watch's own kinds; anything else is a general workout, a lifting session weights. */
    private static ExerciseType exerciseTypeFor(String kind, String activity) {
        if ("lift".equals(kind)) return ExerciseType.WEIGHTLIFTING;
        if ("Walk".equals(activity)) return ExerciseType.WALKING;
        if ("Run".equals(activity)) return ExerciseType.RUNNING;
        if ("Bike".equals(activity)) return ExerciseType.BIKING;
        return ExerciseType.WORKOUT;
    }

    private final ExerciseUpdateCallback callback = new ExerciseUpdateCallback() {
        @Override public void onExerciseUpdateReceived(@NonNull ExerciseUpdate update) {
            DataPointContainer m = update.getLatestMetrics();
            Instant boot = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime());
            List<SampleDataPoint<Double>> hr = m.getData(DataType.HEART_RATE_BPM);
            for (SampleDataPoint<Double> p : hr) onHeartRate((int) Math.round(p.getValue()), p.getTimeInstant(boot).toEpochMilli());
            CumulativeDataPoint<Long> steps = m.getData(DataType.STEPS_TOTAL);
            if (steps != null && LIVE.steps >= 0) LIVE.steps = steps.getTotal();
            CumulativeDataPoint<Double> distance = m.getData(DataType.DISTANCE_TOTAL);
            if (distance != null && LIVE.distanceM >= 0) LIVE.distanceM = distance.getTotal();
            CumulativeDataPoint<Double> kcal = m.getData(DataType.CALORIES_TOTAL);
            if (kcal != null) LIVE.kcal = kcal.getTotal();
            sendBatch(false);
            changed();
        }
        @Override public void onLapSummaryReceived(@NonNull ExerciseLapSummary summary) {}
        @Override public void onRegistered() {}
        @Override public void onRegistrationFailed(@NonNull Throwable t) { Log.w(TAG, "registration", t); }
        @Override public void onAvailabilityChanged(@NonNull DataType<?, ?> type, @NonNull Availability availability) {}
    };

    private void onHeartRate(int bpm, long at) {
        if (bpm < 30 || bpm > 230) return; // the phone's own believable range (heart-series.ts)
        Live l = LIVE;
        if (l.lastZone > 0 && at > l.lastZoneAt) l.zoneMs[l.lastZone - 1] += Math.min(at - l.lastZoneAt, LONGEST_HOLD_MS);
        int z = Zones.zoneOf(bpm, estimatedMax);
        l.lastZone = z; l.lastZoneAt = at;
        l.bpm = bpm; l.bpmAt = at; l.maxBpm = Math.max(l.maxBpm, bpm); l.sumBpm += bpm; l.readings++;
        pending.put(new JSONArray().put(at).put(bpm));
    }

    /** Heart rate goes to the phone every few seconds, as one event. */
    private void sendBatch(boolean force) {
        long now = SystemClock.elapsedRealtime();
        if (pending.length() == 0 || (!force && now - lastBatchAt < BATCH_MS)) return;
        lastBatchAt = now;
        try {
            JSONObject e = new JSONObject();
            e.put("type", "hr");
            e.put("samples", new JSONArray(pending.toString()));
            PhoneLink.send(this, e);
        } catch (Exception ignored) { /* our own object */ }
        while (pending.length() > 0) pending.remove(0);
    }

    private void finish() {
        sendBatch(true);
        if (exercise != null) {
            Futures.addCallback(exercise.endExerciseAsync(), logFailure("end"), ContextCompat.getMainExecutor(this));
            exercise.clearUpdateCallbackAsync(callback);
        }
        Live l = LIVE;
        if (l.lastZone > 0) l.zoneMs[l.lastZone - 1] += Math.min(System.currentTimeMillis() - l.lastZoneAt, LONGEST_HOLD_MS);
        l.running = false;
        changed();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    /** The zone that held the most time, a tie to the lower (the phone's mostlyZone), or 0 under half a minute. */
    static int mostlyZone() {
        int best = 0; long most = 0;
        for (int i = 0; i < 5; i++) if (LIVE.zoneMs[i] > most) { most = LIVE.zoneMs[i]; best = i + 1; }
        return most >= 30_000 ? best : 0; // half a minute, as the phone asks
    }

    private <T> FutureCallback<T> logFailure(String what) {
        return new FutureCallback<T>() {
            @Override public void onSuccess(T r) {}
            @Override public void onFailure(@NonNull Throwable t) { Log.w(TAG, what, t); }
        };
    }

    private void changed() {
        Runnable r = onChange;
        if (r != null) main.post(r);
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
