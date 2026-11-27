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
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import androidx.wear.ongoing.OngoingActivity;
import androidx.wear.ongoing.Status;
import androidx.health.services.client.ExerciseClient;
import androidx.health.services.client.ExerciseUpdateCallback;
import androidx.health.services.client.HealthServices;
import androidx.health.services.client.data.Availability;
import androidx.health.services.client.data.BatchingMode;
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
    static final String ACTION_REST = "uk.co.personaltrainerapp.wear.REST";
    static final String EXTRA_REST_ENDS = "restEnds";  // on the elapsed clock; 0 cancels
    static final String EXTRA_REST_NEXT = "restNext";  // what comes next, for the notification
    static final String EXTRA_KIND = "kind";         // "cardio" or "lift"
    static final String EXTRA_ACTIVITY = "activity"; // "Walk", "Run", "Bike", "Other", or the session's name
    // A PLANNED CARDIO SESSION (27 Nov 2026): its rounds, or minutes, run here so the buzzes come with the screen off.
    static final String EXTRA_ROUNDS = "rounds", EXTRA_WORK = "work", EXTRA_REST = "rest", EXTRA_MINUTES = "minutes", EXTRA_ON_FOOT = "onFoot";
    private static final String CHANNEL = "workout";
    private static final int NOTIFICATION_ID = 41;
    /** A reading counts for the time until the next one, never longer (the phone's LONGEST_HOLD_MS): a gap is not effort. */
    private static final long LONGEST_HOLD_MS = 5 * 60 * 1000;
    /**
     * How often readings go to the phone: every second while the app is on screen (the phone's number keeps up with the
     * wrist), every ten with it away or the screen off (27 Nov 2026, his "draining my watch battery fast": a Bluetooth
     * message a second for a whole session). The phone holds a watch reading 15 seconds (WATCH_STALE_MS).
     */
    private static final long BATCH_VISIBLE_MS = 1000;
    private static final long BATCH_HIDDEN_MS = 10_000;
    /** The watch app is on screen (MainActivity's resume and pause). */
    static volatile boolean appVisible;
    /**
     * A WEIGHTS WORKOUT LEFT RUNNING ENDS ITSELF (27 Nov 2026, the battery): a session finished on the phone and never on
     * the watch kept the heart rate sensor and the workout going for hours. No set or rest for this long ends it.
     */
    static final long LIFT_IDLE_END_MS = 90 * 60 * 1000;
    /** How long a reading stays on screen through a sensor skip: the phone's WATCH_STALE_MS (strap-live.ts). */
    static final long HR_HOLD_MS = 15_000;

    /** What the screens draw. Read on the main thread only. */
    static final class Live {
        boolean running;
        long lastActionAt; // elapsedRealtime of the last start, set or rest (a weights workout ends itself when idle)
        String kind = "";
        String activity = "";
        long startedAt;
        /**
         * When End was tapped (wall clock), 0 while running. THE WORKOUT ENDS THERE (27 Nov 2026, the cardio tail): the
         * summary, the logged time and the zones read this, never the moment Log was tapped a while later.
         */
        long endedAt;
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
        // THE REST, held by the service so it runs and buzzes with the screen off (27 Nov 2026, the gym-floor review:
        // the arm drops, the screen sleeps, and a buzz from the screen's own timer never came).
        long restEndsAt;      // on the elapsed clock; 0: no rest running
        long restTotalMs;
        String restAfterId;   // the exercise whose set was logged last
        // A planned cardio session's program (IntervalFlow): minutes 0 = none, a free workout
        int pRounds, pWork, pRest, pMinutes;
        long pStartedAt;      // on the elapsed clock
        String effort = "";
        String display = "";  // the plan's short name for the screens ("Assault Bike Rounds"); "" for a free workout
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
        LIVE.lastActionAt = SystemClock.elapsedRealtime();
        LIVE.pMinutes = 0; LIVE.pRounds = 0; LIVE.display = "";
        Intent i = new Intent(c, WorkoutService.class).setAction(ACTION_START).putExtra(EXTRA_KIND, kind).putExtra(EXTRA_ACTIVITY, activity);
        ContextCompat.startForegroundService(c, i);
    }

    /** The day's planned cardio: logged under its plan name, with its rounds or minutes run and buzzed here. */
    static void startPlanned(Context c, TodayStore.Cardio k) {
        LIVE.pRounds = k.rounds; LIVE.pWork = k.workSeconds; LIVE.pRest = k.restSeconds; LIVE.pMinutes = k.minutes;
        LIVE.pStartedAt = SystemClock.elapsedRealtime(); LIVE.effort = k.effort == null ? "" : k.effort;
        LIVE.display = k.name == null ? "" : k.name;
        Intent i = new Intent(c, WorkoutService.class).setAction(ACTION_START).putExtra(EXTRA_KIND, "cardio").putExtra(EXTRA_ACTIVITY, k.activity)
                .putExtra(EXTRA_ROUNDS, k.rounds).putExtra(EXTRA_WORK, k.workSeconds).putExtra(EXTRA_REST, k.restSeconds)
                .putExtra(EXTRA_MINUTES, k.minutes).putExtra(EXTRA_ON_FOOT, k.onFoot);
        ContextCompat.startForegroundService(c, i);
    }

    static void end(Context c) { endAt(c, System.currentTimeMillis()); }

    /** End the workout as of `wallMs` (an idle weights workout ends at its last set or rest, not when it was noticed). */
    static void endAt(Context c, long wallMs) {
        if (LIVE.running && LIVE.endedAt == 0) LIVE.endedAt = wallMs;
        c.startService(new Intent(c, WorkoutService.class).setAction(ACTION_END));
    }

    /** Start, move or (endsAt 0) cancel the rest: a short buzz LiftFlow.warnBeforeMs before the end, a long one at it. */
    static void rest(Context c, long endsAt, long totalMs, String afterId, String next) {
        LIVE.lastActionAt = SystemClock.elapsedRealtime();
        LIVE.restEndsAt = endsAt; LIVE.restTotalMs = totalMs; if (afterId != null) LIVE.restAfterId = afterId;
        c.startService(new Intent(c, WorkoutService.class).setAction(ACTION_REST).putExtra(EXTRA_REST_ENDS, endsAt).putExtra(EXTRA_REST_NEXT, next));
    }

    private PowerManager.WakeLock restLock;
    private boolean onFootPlanned;
    private final java.util.List<Runnable> programBuzzes = new java.util.ArrayList<>();

    /** Every buzz of a planned session, on time with the screen off (the CPU held for the session plus a minute). */
    private void scheduleProgram() {
        Live l = LIVE;
        long total = IntervalFlow.totalMs(l.pRounds, l.pWork, l.pRest, l.pMinutes);
        if (restLock == null) {
            restLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pt:rest");
            restLock.setReferenceCounted(false);
        }
        restLock.acquire(total + 60_000L);
        long since = SystemClock.elapsedRealtime() - l.pStartedAt;
        for (IntervalFlow.Buzz b : IntervalFlow.buzzes(l.pRounds, l.pWork, l.pRest, l.pMinutes)) {
            long in = b.atMs - since;
            if (in < 0) continue;
            long[] pattern = "work".equals(b.kind) ? new long[] { 0, 600 }
                : "rest".equals(b.kind) ? new long[] { 0, 150, 120, 150 }
                : "count".equals(b.kind) ? new long[] { 0, 60 }
                : new long[] { 0, 500, 200, 500 };
            Runnable r = () -> { vibrate(pattern); changed(); if ("end".equals(b.kind)) releaseRestLock(); };
            programBuzzes.add(r);
            main.postDelayed(r, in);
        }
    }
    private final Runnable warnBuzz = () -> vibrate(new long[] { 0, 120 });
    private final Runnable endBuzz = () -> { vibrate(new long[] { 0, 400, 200, 400 }); releaseRestLock(); showRunning(); changed(); };

    private void scheduleRest(long endsAt, String next) {
        main.removeCallbacks(warnBuzz);
        main.removeCallbacks(endBuzz);
        long left = endsAt - SystemClock.elapsedRealtime();
        if (endsAt <= 0 || left <= 0) { releaseRestLock(); showRunning(); return; }
        // The CPU stays awake for the rest (a few minutes at most) so the buzz is on time with the screen off.
        if (restLock == null) {
            restLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pt:rest");
            restLock.setReferenceCounted(false);
        }
        restLock.acquire(left + 15_000L);
        long warn = LiftFlow.warnBeforeMs(LIVE.restTotalMs);
        if (warn > 0 && left > warn) main.postDelayed(warnBuzz, left - warn);
        main.postDelayed(endBuzz, left);
        // The watch's own workout notification counts the rest down, and a tap on it opens the app.
        notify(LIVE.activity, next == null || next.isEmpty() ? "Rest" : next, System.currentTimeMillis() + left);
    }

    private void releaseRestLock() { if (restLock != null && restLock.isHeld()) restLock.release(); }

    private void showRunning() { notify(LIVE.activity, "Workout running", 0); }

    private void vibrate(long[] pattern) {
        Vibrator v = getSystemService(Vibrator.class);
        if (v == null || !v.hasVibrator()) return;
        // AS AN ALARM, so Do Not Disturb, Bedtime or Theatre mode does not swallow the end of his rest (27 Nov 2026).
        if (Build.VERSION.SDK_INT >= 33) v.vibrate(VibrationEffect.createWaveform(pattern, -1), android.os.VibrationAttributes.createForUsage(android.os.VibrationAttributes.USAGE_ALARM));
        else v.vibrate(VibrationEffect.createWaveform(pattern, -1));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) {
            if (LIVE.running) return START_NOT_STICKY; // one at a time
            String kind = intent.getStringExtra(EXTRA_KIND);
            String activity = intent.getStringExtra(EXTRA_ACTIVITY);
            goForeground(activity);
            onFootPlanned = intent.getBooleanExtra(EXTRA_ON_FOOT, false);
            begin(kind == null ? "cardio" : kind, activity == null ? "Workout" : activity);
            showRunning(); // again, now the workout's start is known: the face's clock counts from it
            if (intent.getIntExtra(EXTRA_MINUTES, 0) > 0) scheduleProgram();
        } else if (ACTION_END.equals(action)) {
            finish();
        } else if (ACTION_REST.equals(action)) {
            if (LIVE.running) scheduleRest(intent.getLongExtra(EXTRA_REST_ENDS, 0), intent.getStringExtra(EXTRA_REST_NEXT));
            else stopSelf(); // no workout running: never leave a plain service behind
        }
        return START_NOT_STICKY;
    }

    private void goForeground(String activity) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Workout", NotificationManager.IMPORTANCE_LOW));
        }
        Notification n = notification(activity, "Workout running", 0);
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
    }

    /** The ongoing notification; with countdownTo set (wall clock) it counts the rest down. */
    private Notification notification(String title, String text, long countdownTo) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setContentIntent(open);
        if (countdownTo > 0) b.setWhen(countdownTo).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        // ON THE WATCH FACE WHILE IT RUNS (27 Nov 2026, the watch leftovers): an ongoing activity puts the workout's
        // icon on the face and at the top of the recent apps, one tap back into it, as Samsung's own workouts do. It
        // shows the workout's clock, or the rest counting down. A failure here never costs the notification.
        try {
            long now = SystemClock.elapsedRealtime();
            boolean resting = LIVE.restEndsAt > now;
            Status status = resting
                    ? new Status.Builder().addTemplate("Rest #time#").addPart("time", new Status.TimerPart(LIVE.restEndsAt)).build()
                    : new Status.Builder().addTemplate("#type# #time#")
                        .addPart("type", new Status.TextPart(title == null ? "Workout" : title))
                        .addPart("time", new Status.StopwatchPart(now - (System.currentTimeMillis() - LIVE.startedAt))).build();
            new OngoingActivity.Builder(this, NOTIFICATION_ID, b)
                    .setStaticIcon(iconFor(LIVE.kind, LIVE.activity))
                    .setTouchIntent(open)
                    .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                    .setStatus(status)
                    .build()
                    .apply(this);
        } catch (Exception e) {
            Log.w(TAG, "ongoing activity", e);
        }
        return b.build();
    }

    /** The workout's own icon (the home screen's): weights, walk, run, bike, else the general one. */
    static int iconFor(String kind, String activity) {
        if ("lift".equals(kind)) return R.drawable.ic_lift;
        String a = activity == null ? "" : activity.toLowerCase(java.util.Locale.UK);
        if (a.matches(".*\\b(run|jog|sprint).*")) return R.drawable.ic_run;
        if (a.matches(".*\\b(walk|hik).*")) return R.drawable.ic_walk;
        if (a.matches(".*\\b(bike|cycl|spin).*")) return R.drawable.ic_bike;
        return R.drawable.ic_other;
    }

    private void notify(String title, String text, long countdownTo) {
        if (!LIVE.running) return;
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(title, text, countdownTo));
    }

    private void begin(String kind, String activity) {
        Live l = LIVE;
        l.running = true; l.kind = kind; l.activity = activity; l.startedAt = System.currentTimeMillis(); l.endedAt = 0;
        l.bpm = 0; l.bpmAt = 0; l.maxBpm = 0; l.sumBpm = 0; l.readings = 0; l.lastZoneAt = 0; l.lastZone = 0;
        java.util.Arrays.fill(l.zoneMs, 0);
        boolean onFoot = "cardio".equals(kind) && ("Walk".equals(activity) || "Run".equals(activity) || onFootPlanned);
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
                // A TYPE THIS WATCH DOES NOT LIST is asked for as a general workout: asking for its capabilities would
                // throw here, on the main thread, and take the app down (27 Nov 2026 review).
                ExerciseType use = caps.getSupportedExerciseTypes().contains(type) ? type : ExerciseType.WORKOUT;
                if (!caps.getSupportedExerciseTypes().contains(use)) { Log.w(TAG, "no supported exercise type"); return; }
                Set<DataType<?, ?>> supported = caps.getExerciseTypeCapabilities(use).getSupportedDataTypes();
                want.retainAll(supported);
                ExerciseConfig.Builder builder = new ExerciseConfig.Builder(use)
                        .setDataTypes(want)
                        .setIsAutoPauseAndResumeEnabled(false)
                        .setIsGpsEnabled(false);
                // HEART RATE EVERY FIVE SECONDS WITH THE SCREEN OFF (27 Nov 2026, his first walk: "when the watch screen
                // is off ... I think that might also be happening"). Left alone, the watch holds its readings back while
                // the screen is off and hands them over in long batches, so the phone's number went blank between them.
                // This override exists for exactly this, an app showing heart rate live on another device; it costs
                // battery, so only while a workout runs, and only where the watch says it can.
                // CARDIO ONLY (27 Nov 2026, the battery): Google's own note says this costs battery; a weights session's
                // heart rate on the phone can wait for the watch's ordinary batches.
                if ("cardio".equals(kind) && caps.getSupportedBatchingModeOverrides().contains(BatchingMode.HEART_RATE_5_SECONDS)) {
                    builder.setBatchingModeOverrides(java.util.Collections.singleton(BatchingMode.HEART_RATE_5_SECONDS));
                }
                ExerciseConfig config = builder.build();
                // An exercise left running by an earlier crash makes a new start fail: end it, then start once more.
                Futures.addCallback(exercise.startExerciseAsync(config), new FutureCallback<Void>() {
                    @Override public void onSuccess(Void r) {}
                    @Override public void onFailure(@NonNull Throwable t) {
                        Log.w(TAG, "start, ending any earlier exercise and trying once more", t);
                        Futures.addCallback(exercise.endExerciseAsync(), new FutureCallback<Void>() {
                            @Override public void onSuccess(Void r) {
                                if (LIVE.running) Futures.addCallback(exercise.startExerciseAsync(config), logFailure("start again"), ContextCompat.getMainExecutor(WorkoutService.this));
                            }
                            @Override public void onFailure(@NonNull Throwable t2) { Log.w(TAG, "end before restart", t2); }
                        }, ContextCompat.getMainExecutor(WorkoutService.this));
                    }
                }, ContextCompat.getMainExecutor(WorkoutService.this));
            }
            @Override public void onFailure(@NonNull Throwable t) { Log.w(TAG, "capabilities", t); }
        }, ContextCompat.getMainExecutor(this));
    }

    /** Walk, run and bike are the watch's own kinds; anything else is a general workout, a lifting session weights. */
    private static ExerciseType exerciseTypeFor(String kind, String activity) {
        if ("lift".equals(kind)) return ExerciseType.WEIGHTLIFTING;
        // A planned session is named by the plan ("Easy jog", "Assault Bike Rounds"): read by its words.
        String a = activity == null ? "" : activity.toLowerCase(java.util.Locale.UK);
        if (a.matches(".*\\b(run|jog|sprint).*")) return ExerciseType.RUNNING;
        if (a.matches(".*\\b(walk|hik).*")) return ExerciseType.WALKING;
        if (a.matches(".*\\b(bike|cycl|spin).*")) return ExerciseType.BIKING;
        return ExerciseType.WORKOUT;
    }

    private final ExerciseUpdateCallback callback = new ExerciseUpdateCallback() {
        @Override public void onExerciseUpdateReceived(@NonNull ExerciseUpdate update) {
            if (!LIVE.running && !finishing) return;
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
            sendBatch(finishing);
            changed();
            // THE WATCH'S LAST READINGS ARRIVE AFTER END (27 Nov 2026, the cardio tail): it hands over what it still
            // held with the ended update, so the service listens until then and sends them, calories included.
            if (finishing && update.getExerciseStateInfo().getState().isEnded()) { main.removeCallbacks(stopNow); stopNow.run(); return; }
            long idle = SystemClock.elapsedRealtime() - LIVE.lastActionAt;
            if ("lift".equals(LIVE.kind) && LIVE.running && idle > LIFT_IDLE_END_MS) {
                Log.i(TAG, "weights workout idle, ending it");
                endAt(WorkoutService.this, System.currentTimeMillis() - idle);
            }
        }
        @Override public void onLapSummaryReceived(@NonNull ExerciseLapSummary summary) {}
        @Override public void onRegistered() {}
        @Override public void onRegistrationFailed(@NonNull Throwable t) { Log.w(TAG, "registration", t); }
        @Override public void onAvailabilityChanged(@NonNull DataType<?, ?> type, @NonNull Availability availability) {}
    };

    private void onHeartRate(int bpm, long at) {
        if (bpm < 30 || bpm > 230) return; // the phone's own believable range (heart-series.ts)
        Live l = LIVE;
        if (l.endedAt > 0 && at > l.endedAt) return; // after End: not part of the workout
        if (l.lastZone > 0 && at > l.lastZoneAt) l.zoneMs[l.lastZone - 1] += Math.min(at - l.lastZoneAt, LONGEST_HOLD_MS);
        int z = Zones.zoneOf(bpm, estimatedMax);
        l.lastZone = z; l.lastZoneAt = at;
        l.bpm = bpm; l.bpmAt = at; l.maxBpm = Math.max(l.maxBpm, bpm); l.sumBpm += bpm; l.readings++;
        pending.put(new JSONArray().put(at).put(bpm));
    }

    /** Heart rate goes to the phone every few seconds, as one event. */
    private void sendBatch(boolean force) {
        long now = SystemClock.elapsedRealtime();
        // The last message goes even with no new readings: it carries the workout's final calories.
        if ((pending.length() == 0 && !(force && finishing)) || (!force && now - lastBatchAt < (appVisible ? BATCH_VISIBLE_MS : BATCH_HIDDEN_MS))) return;
        lastBatchAt = now;
        try {
            JSONObject e = new JSONObject();
            e.put("type", "hr");
            // WHAT THE WORKOUT HAS COUNTED SO FAR rides with its heart rate (27 Nov 2026, his "didn't log any calories"):
            // a session ended on the phone, never on the watch, still has the watch's calories.
            e.put("kind", LIVE.kind);
            e.put("activity", LIVE.activity);
            e.put("startedAt", LIVE.startedAt);
            e.put("date", TodayStore.today());
            if (LIVE.kcal > 0) e.put("kcal", Math.round(LIVE.kcal));
            if (finishing) e.put("final", true); // the workout's last count: the phone saves it at once
            e.put("samples", new JSONArray(pending.toString()));
            PhoneLink.send(this, e);
        } catch (Exception ignored) { /* our own object */ }
        while (pending.length() > 0) pending.remove(0);
    }

    /** Between End and the watch's ended update: still listening for the readings it held back. */
    private boolean finishing;
    /** Stop listening and close the service: on the ended update, or after a few seconds if it never comes. */
    private final Runnable stopNow = () -> {
        finishing = false;
        if (exercise != null) { exercise.clearUpdateCallbackAsync(callback); exercise = null; }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    };
    private static final long LAST_READINGS_WAIT_MS = 8_000;

    private void finish() {
        if (finishing) return;
        Live l = LIVE;
        if (l.endedAt == 0) l.endedAt = System.currentTimeMillis();
        sendBatch(true);
        l.running = false;
        l.restEndsAt = 0;
        for (Runnable r : programBuzzes) main.removeCallbacks(r);
        programBuzzes.clear();
        l.pMinutes = 0; l.pRounds = 0;
        main.removeCallbacks(warnBuzz);
        main.removeCallbacks(endBuzz);
        releaseRestLock();
        changed();
        if (exercise != null) {
            finishing = true;
            Futures.addCallback(exercise.endExerciseAsync(), logFailure("end"), ContextCompat.getMainExecutor(this));
            main.postDelayed(stopNow, LAST_READINGS_WAIT_MS);
        } else stopNow.run();
    }

    /** The zone that held the most time, a tie to the lower (the phone's mostlyZone), or 0 under half a minute. */
    static int mostlyZone() {
        Live l = LIVE;
        long[] ms = l.zoneMs.clone();
        // The last reading counts up to the end (or now), as every reading counts up to the next one.
        long upTo = l.endedAt > 0 ? l.endedAt : System.currentTimeMillis();
        if (l.lastZone > 0 && upTo > l.lastZoneAt) ms[l.lastZone - 1] += Math.min(upTo - l.lastZoneAt, LONGEST_HOLD_MS);
        int best = 0; long most = 0;
        for (int i = 0; i < 5; i++) if (ms[i] > most) { most = ms[i]; best = i + 1; }
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
