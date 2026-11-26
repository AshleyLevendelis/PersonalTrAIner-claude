package uk.co.personaltrainerapp.wear;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * THE WATCH'S SCREENS (27 Nov 2026; his vision: "Track workouts steps and heart rate. On a weight workout see 'next
 * exercise 3x10 bench press @100kg' then start rest from watch, start next set"). Plain views, built in code, one
 * screen at a time:
 *
 *  HOME    today's session from the phone (when it sent one for today) and the cardio choices.
 *  CARDIO  the clock, heart rate with its zone, and on foot steps and distance; End, tapped twice.
 *  LOGGED  after End: "Mostly zone 3 · Steady" and Log it, or Easy / Steady / Hard with no zone; the phone logs it.
 *  LIFT    "Next" exercise, "3 × 10 @ 100 kg", "Set 2 of 3", heart rate; "Set done · rest 1:30" ticks the set (sent to
 *          the phone, which saves it as its own tick does) and starts the rest.
 *  REST    the countdown, what comes next, a buzz when it ends, and Start next set (which also ends it early).
 *
 * Decisions (docs/plans/watch-app.md, his "go with your recommendations"): a workout starts on the watch; the cardio
 * screen holds nothing that needs reading mid-stride; no weight is typed on the watch, the phone's number is ticked.
 */
public class MainActivity extends Activity {
    private static WeakReference<MainActivity> open = new WeakReference<>(null);

    /** Today's session changed on the phone: redraw the home screen if it is showing. */
    static void refreshIfOpen() {
        MainActivity a = open.get();
        if (a != null) a.runOnUiThread(() -> { if (a.screen == Screen.HOME) a.showHome(); });
    }

    private enum Screen { HOME, CARDIO, LOGGED, LIFT, REST, DONE }
    private Screen screen = Screen.HOME;
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout column;

    // Rest, held here: the deadline on the watch's clock that elapses, never the wall clock.
    private long restEndsAt;
    private boolean restBuzzed;
    private long endArmedAt;

    private static final int MINT = Color.rgb(94, 234, 196);
    private static final int INK = Color.rgb(21, 20, 46);
    private static final int MUTED = Color.rgb(170, 168, 200);

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(INK);
        column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(22);
        // Round screens: generous side padding keeps text off the curve.
        column.setPadding(pad, dp(28), pad, dp(36));
        scroll.addView(column);
        setContentView(scroll);
        askPermissions();
    }

    @Override
    protected void onResume() {
        super.onResume();
        open = new WeakReference<>(this);
        WorkoutService.setOnChange(this::onLive);
        PhoneLink.flush(this);
        if (WorkoutService.LIVE.running) {
            if ("lift".equals(WorkoutService.LIVE.kind)) { if (screen != Screen.REST) showLift(); }
            else showCardio();
        } else if (screen != Screen.LOGGED && screen != Screen.DONE) {
            showHome();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        WorkoutService.setOnChange(null);
    }

    private void onLive() {
        if (screen == Screen.CARDIO || screen == Screen.LIFT || screen == Screen.REST) redrawLive();
    }

    // ---------------------------------------------------------------- HOME

    private void showHome() {
        screen = Screen.HOME;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        column.removeAllViews();
        label("Personal TrAIner", 13, MUTED, false);
        TodayStore.Session s = TodayStore.read(this);
        if (s != null) {
            int done = 0, total = 0;
            for (TodayStore.Exercise x : s.exercises) { done += TodayStore.done(this, x); total += x.sets; }
            label("TODAY", 11, MINT, true);
            label(s.title, 18, Color.WHITE, true);
            label(done + " of " + total + " sets done", 12, MUTED, false);
            button(done >= total ? "Session done" : "Start session", true, v -> startLift());
        } else {
            label("Today's session shows here once you open Exercise in the phone app today.", 12, MUTED, false);
        }
        label("CARDIO", 11, MINT, true);
        for (String a : new String[] { "Walk", "Run", "Bike", "Other" }) button(a, false, v -> startCardio(a));
        int waiting = PhoneLink.waiting(this);
        if (waiting > 0) label(waiting + " waiting to reach your phone", 11, MUTED, false);
    }

    // ---------------------------------------------------------------- CARDIO

    private void startCardio(String activity) {
        if (!hasHeartPermission()) { askPermissions(); return; }
        WorkoutService.start(this, "cardio", activity);
        // The service flips LIVE.running on its own thread of events; draw the running screen now.
        WorkoutService.LIVE.activity = activity;
        WorkoutService.LIVE.startedAt = System.currentTimeMillis();
        showCardio();
    }

    private TextView clock, heart, extra, setLine, nextLine, restClock;
    private Button endButton;

    private void showCardio() {
        screen = Screen.CARDIO;
        endArmedAt = 0;
        column.removeAllViews();
        label(WorkoutService.LIVE.activity, 13, MINT, true);
        clock = label("0:00", 34, Color.WHITE, true);
        heart = label("", 18, Color.WHITE, false);
        extra = label("", 13, MUTED, false);
        endButton = button("End", false, v -> {
            long now = SystemClock.elapsedRealtime();
            if (now - endArmedAt < 3000) { endCardio(); return; }
            endArmedAt = now;
            endButton.setText("Tap again to end");
        });
        redrawLive();
        tick();
    }

    private void endCardio() {
        WorkoutService.end(this);
        showLogged();
    }

    private void showLogged() {
        screen = Screen.LOGGED;
        column.removeAllViews();
        WorkoutService.Live l = WorkoutService.LIVE;
        long ms = System.currentTimeMillis() - l.startedAt;
        label(l.activity + " · " + duration(ms), 15, Color.WHITE, true);
        int zone = WorkoutService.mostlyZone();
        if (zone > 0) {
            String effort = zone <= 2 ? "easy" : zone == 3 ? "steady" : "hard";
            label("Mostly zone " + zone + " · " + word(effort), 14, MINT, false);
            button("Log it", true, v -> logCardio(effort, zone));
        } else {
            label("How did it feel?", 14, MUTED, false);
            for (String e : new String[] { "easy", "steady", "hard" }) button(word(e), false, v -> logCardio(e, 0));
        }
        button("Don't log it", false, v -> showHome());
    }

    private void logCardio(String effort, int zone) {
        WorkoutService.Live l = WorkoutService.LIVE;
        try {
            JSONObject e = new JSONObject();
            e.put("type", "cardio-end");
            e.put("activity", l.activity);
            e.put("startedAt", l.startedAt);
            e.put("endedAt", System.currentTimeMillis());
            e.put("effort", effort);
            if (zone > 0) e.put("zone", zone);
            if (l.steps >= 0) e.put("steps", l.steps);
            if (l.distanceM >= 0) e.put("distanceM", Math.round(l.distanceM));
            if (l.kcal > 0) e.put("kcal", Math.round(l.kcal));
            if (l.readings > 0) { e.put("avgBpm", Math.round(l.sumBpm / (double) l.readings)); e.put("maxBpm", l.maxBpm); }
            PhoneLink.send(this, e);
        } catch (Exception ignored) { /* our own object */ }
        column.removeAllViews();
        screen = Screen.DONE;
        label("Sent to your phone", 15, MINT, true);
        label("It's logged when the phone app has it.", 12, MUTED, false);
        button("Done", false, v -> showHome());
    }

    // ---------------------------------------------------------------- LIFT

    private void startLift() {
        TodayStore.Session s = TodayStore.read(this);
        if (s == null) { showHome(); return; }
        if (!WorkoutService.LIVE.running && nextExercise(s) != null) {
            if (!hasHeartPermission()) { askPermissions(); return; }
            WorkoutService.start(this, "lift", s.title);
        }
        showLift();
    }

    private TodayStore.Exercise nextExercise(TodayStore.Session s) {
        for (TodayStore.Exercise x : s.exercises) if (TodayStore.done(this, x) < x.sets) return x;
        return null;
    }

    /** "3 × 10 @ 100 kg", "3 × 8-12", "3 × 30s" — the phone's prescription, as the Exercise tab prints it. */
    static String prescription(TodayStore.Exercise x) {
        String base = x.sets + " × " + x.reps;
        return x.load == null || x.load.isEmpty() ? base : base + " @ " + x.load;
    }

    private void showLift() {
        screen = Screen.LIFT;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        column.removeAllViews();
        TodayStore.Session s = TodayStore.read(this);
        TodayStore.Exercise x = s == null ? null : nextExercise(s);
        if (x == null) { showSessionDone(); return; }
        int setNumber = TodayStore.done(this, x) + 1;
        label("NEXT", 11, MINT, true);
        label(x.name, 18, Color.WHITE, true);
        label(prescription(x), 16, Color.WHITE, false);
        setLine = label("Set " + setNumber + " of " + x.sets, 13, MUTED, false);
        heart = label("", 15, Color.WHITE, false);
        String rest = x.restSeconds > 0 ? " · rest " + duration(x.restSeconds * 1000L) : "";
        button("Set done" + rest, true, v -> setDone(s, x));
        button("End workout", false, v -> endLift());
        redrawLive();
    }

    private void setDone(TodayStore.Session s, TodayStore.Exercise x) {
        int setNumber = TodayStore.done(this, x) + 1;
        TodayStore.tick(this, x);
        try {
            JSONObject e = new JSONObject();
            e.put("type", "set");
            e.put("date", s.date);
            e.put("exerciseId", x.id);
            e.put("name", x.name);
            e.put("setNumber", setNumber);
            e.put("at", System.currentTimeMillis());
            PhoneLink.send(this, e);
        } catch (Exception ignored) { /* our own object */ }
        TodayStore.Session after = TodayStore.read(this);
        if (after == null || nextExercise(after) == null) { showSessionDone(); return; }
        if (x.restSeconds <= 0) { showLift(); return; }
        restEndsAt = SystemClock.elapsedRealtime() + x.restSeconds * 1000L;
        restBuzzed = false;
        showRest();
    }

    private void showRest() {
        screen = Screen.REST;
        column.removeAllViews();
        label("REST", 11, MINT, true);
        restClock = label("", 40, Color.WHITE, true);
        TodayStore.Session s = TodayStore.read(this);
        TodayStore.Exercise x = s == null ? null : nextExercise(s);
        if (x != null) {
            int setNumber = TodayStore.done(this, x) + 1;
            nextLine = label(setNumber == 1 ? "Next: " + x.name + " · " + prescription(x) : "Then set " + setNumber + " of " + x.sets + " · " + x.name, 13, MUTED, false);
        }
        heart = label("", 15, Color.WHITE, false);
        button("Start next set", true, v -> { restEndsAt = 0; showLift(); });
        redrawLive();
        tick();
    }

    private void showSessionDone() {
        screen = Screen.DONE;
        column.removeAllViews();
        label("Session done", 18, MINT, true);
        label("Every set is ticked. Your phone saves them as its own ticks.", 12, MUTED, false);
        button("End workout", true, v -> endLift());
    }

    private void endLift() {
        if (WorkoutService.LIVE.running) WorkoutService.end(this);
        restEndsAt = 0;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        showHome();
    }

    // ---------------------------------------------------------------- live figures

    private void tick() {
        main.removeCallbacksAndMessages(null);
        main.postDelayed(new Runnable() {
            @Override public void run() {
                if (screen != Screen.CARDIO && screen != Screen.REST) return;
                redrawLive();
                main.postDelayed(this, 500);
            }
        }, 500);
    }

    private void redrawLive() {
        WorkoutService.Live l = WorkoutService.LIVE;
        if (screen == Screen.CARDIO && clock != null) {
            clock.setText(duration(System.currentTimeMillis() - l.startedAt));
            List<String> parts = new ArrayList<>();
            if (l.steps >= 0) parts.add(String.format(Locale.UK, "%,d steps", l.steps));
            if (l.distanceM > 0) parts.add(String.format(Locale.UK, "%.2f km", l.distanceM / 1000));
            extra.setText(String.join(" · ", parts));
        }
        if (heart != null) heart.setText(heartLine(l));
        if (screen == Screen.REST && restClock != null) {
            long left = restEndsAt - SystemClock.elapsedRealtime();
            if (left <= 0) {
                restClock.setText("Go");
                if (!restBuzzed) { restBuzzed = true; buzz(); }
            } else {
                restClock.setText(duration(left + 999));
            }
        }
    }

    /** "♥ 142 · Zone 3"; no zone when the phone shows none; nothing stale (the phone's five seconds). */
    private String heartLine(WorkoutService.Live l) {
        if (!l.running) return "";
        if (l.bpm <= 0 || System.currentTimeMillis() - l.bpmAt > 5000) return "♥ –";
        int zone = Zones.zoneOf(l.bpm, TodayStore.estimatedMax(this));
        return zone > 0 ? "♥ " + l.bpm + " · Zone " + zone : "♥ " + l.bpm;
    }

    private void buzz() {
        Vibrator v = getSystemService(Vibrator.class);
        if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createWaveform(new long[] { 0, 400, 200, 400 }, -1));
    }

    // ---------------------------------------------------------------- permissions

    private boolean hasHeartPermission() {
        return checkSelfPermission(heartPermission()) == PackageManager.PERMISSION_GRANTED;
    }

    /** Wear OS 6 (Android 16) reads heart rate under a health permission; older under BODY_SENSORS. */
    private static String heartPermission() {
        return Build.VERSION.SDK_INT >= 36 ? "android.permission.health.READ_HEART_RATE" : Manifest.permission.BODY_SENSORS;
    }

    private void askPermissions() {
        List<String> want = new ArrayList<>();
        want.add(heartPermission());
        want.add(Manifest.permission.ACTIVITY_RECOGNITION);
        if (Build.VERSION.SDK_INT >= 33) want.add(Manifest.permission.POST_NOTIFICATIONS);
        List<String> missing = new ArrayList<>();
        for (String p : want) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        if (!missing.isEmpty()) requestPermissions(missing.toArray(new String[0]), 7);
    }

    // ---------------------------------------------------------------- drawing

    private TextView label(String text, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(4);
        column.addView(t, lp);
        return t;
    }

    private Button button(String text, boolean primary, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTextColor(primary ? INK : Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(26));
        if (primary) bg.setColor(MINT); else { bg.setColor(Color.TRANSPARENT); bg.setStroke(dp(1), MUTED); }
        b.setBackground(bg);
        b.setMinHeight(dp(48));
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        column.addView(b, lp);
        return b;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    static String duration(long ms) {
        long s = Math.max(0, ms / 1000);
        long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.UK, "%d:%02d:%02d", h, m, sec) : String.format(Locale.UK, "%d:%02d", m, sec);
    }

    private static String word(String effort) {
        return "easy".equals(effort) ? "Easy" : "steady".equals(effort) ? "Steady" : "Hard";
    }
}
