package uk.co.personaltrainerapp.wear;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
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
 *  LIFT    "Next exercise up" / "Next set", the exercise, its reps and weight as numbers to tap, "Set 2 of 3", heart
 *          rate; "Log set · rest 1:30" logs the set (the phone saves it as its own tick does) and starts the rest.
 *  REST    the countdown (held and buzzed by WorkoutService, so it works with the screen off), −15s / +15s, what comes
 *          next, Next set or Next exercise, and Undo for the set just logged.
 *  EDIT    one number, its − and +, and the bezel; LIST every exercise, to take them in any order.
 *
 * Decisions (docs/plans/watch-app.md, his "go with your recommendations"): a workout starts on the watch; the cardio
 * screen holds nothing that needs reading mid-stride. REVERSED 27 Nov 2026 by his "Adjust reps and weight": the plan's
 * reps and weight are the default and one tap logs them, and a set that went differently is changed on the watch.
 *
 * THE LOOK (27 Nov 2026, his "the watch needs to look more high end"): the app's own colours, fonts and icons
 * (WatchStyle), and a ring round the screen's edge (RingView) carrying the progress: sets done, the rest running down,
 * the heart rate's zone.
 */
public class MainActivity extends Activity {
    private static WeakReference<MainActivity> open = new WeakReference<>(null);

    /** Today's session changed on the phone: redraw the home screen if it is showing. */
    static void refreshIfOpen() {
        MainActivity a = open.get();
        if (a != null) a.runOnUiThread(() -> { if (a.screen == Screen.HOME) a.showHome(); });
    }

    private enum Screen { HOME, CARDIO, LOGGED, LIFT, REST, DONE, EDIT, LIST }
    private Screen screen = Screen.HOME;
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout column;

    // The rest itself is held by WorkoutService (LIVE.restEndsAt, on the elapsed clock), which buzzes with the screen off.
    private long endArmedAt;

    private static final int MINT = WatchStyle.MINT;
    private static final int MUTED = WatchStyle.MUTED;
    private static final int FG = WatchStyle.FG;
    private RingView ring;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        FrameLayout root = new FrameLayout(this);
        ring = new RingView(this);
        root.addView(ring, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER);
        int pad = dp(26);
        // Round screens: generous side padding keeps text off the curve; the column centres when it is short.
        column.setPadding(pad, dp(30), pad, dp(34));
        scroll.addView(column, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(WatchStyle.BG_EDGE);
        setContentView(root);
        askPermissions();
    }

    @Override
    protected void onResume() {
        super.onResume();
        open = new WeakReference<>(this);
        WorkoutService.setOnChange(this::onLive);
        PhoneLink.flush(this);
        if (WorkoutService.LIVE.running) {
            if ("lift".equals(WorkoutService.LIVE.kind)) {
                // Back from a dark screen mid-rest: the rest is still counting in the service.
                if (resting() && WorkoutService.LIVE.restEndsAt > SystemClock.elapsedRealtime()) showRest();
                else if (screen != Screen.EDIT && screen != Screen.LIST) showLift();
            }
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
        clearLive();
        TodayStore.Session s = TodayStore.read(this);
        if (s != null) {
            int done = 0, total = 0;
            for (TodayStore.Exercise x : s.exercises) { done += TodayStore.done(this, x); total += x.sets; }
            ring.set(total > 0 ? done / (float) total : 0f, MINT);
            kicker("TODAY", MINT, 0);
            title(s.title, 21, true, 2);
            text(done + " of " + total + " sets done", 13, MUTED, 4);
            button(done >= total ? "Session done" : "Start session", true, 0, v -> startLift());
        } else {
            ring.set(0f, MINT);
            kicker("PERSONAL TRAINER", MINT, 0);
            text("Open Exercise in the phone app once, and your sessions for the week ahead come to your watch.", 13, MUTED, 6);
        }
        kicker("CARDIO", MINT, 18);
        tile(R.drawable.ic_walk, "Walk", "Steps · heart rate", v -> startCardio("Walk"));
        tile(R.drawable.ic_run, "Run", "Steps · heart rate", v -> startCardio("Run"));
        tile(R.drawable.ic_bike, "Bike", "Heart rate", v -> startCardio("Bike"));
        tile(R.drawable.ic_other, "Other", "Heart rate", v -> startCardio("Other"));
        int waiting = PhoneLink.waiting(this);
        if (waiting > 0) text(waiting + " waiting to reach your phone", 11, MUTED, 10);
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

    private TextView clock, nextLine, restClock, statA, statALabel, statB, statBLabel;
    private TextView heartBpm, heartZone;
    private LinearLayout heartRow;
    private TextView endButton;

    private void clearLive() {
        clock = null; nextLine = null; restClock = null; statA = null; statB = null; statALabel = null; statBLabel = null;
        heartBpm = null; heartZone = null; heartRow = null;
    }

    private void showCardio() {
        screen = Screen.CARDIO;
        endArmedAt = 0;
        column.removeAllViews();
        clearLive();
        ring.set(0f, WatchStyle.HEART);
        kicker(WorkoutService.LIVE.activity.toUpperCase(Locale.UK), MINT, 0);
        clock = mono("0:00", 54, WatchStyle.NUM, 2);
        heartRow(6);
        LinearLayout stats = row(12);
        LinearLayout a = stat(stats), b;
        statA = (TextView) a.getChildAt(0); statALabel = (TextView) a.getChildAt(1);
        View sep = new View(this);
        sep.setBackgroundColor(WatchStyle.BORDER);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(1), dp(28));
        sp.leftMargin = dp(16); sp.rightMargin = dp(16);
        stats.addView(sep, sp);
        b = stat(stats);
        statB = (TextView) b.getChildAt(0); statBLabel = (TextView) b.getChildAt(1);
        endButton = button("End", false, 0, v -> {
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
        clearLive();
        WorkoutService.Live l = WorkoutService.LIVE;
        long ms = System.currentTimeMillis() - l.startedAt;
        kicker(l.activity.toUpperCase(Locale.UK), MINT, 0);
        mono(duration(ms), 40, WatchStyle.NUM, 2);
        int zone = WorkoutService.mostlyZone();
        ring.set(zone / 5f, WatchStyle.HEART);
        if (zone > 0) {
            String effort = zone <= 2 ? "easy" : zone == 3 ? "steady" : "hard";
            text("Mostly zone " + zone + " · " + word(effort), 14, FG, 6);
            button("Log it", true, R.drawable.ic_check, v -> logCardio(effort, zone));
        } else {
            text("How did it feel?", 14, MUTED, 6);
            for (String e : new String[] { "easy", "steady", "hard" }) button(word(e), false, 0, v -> logCardio(e, 0));
        }
        quiet("Don't log it", v -> showHome());
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
        clearLive();
        screen = Screen.DONE;
        ring.set(1f, MINT);
        badge(R.drawable.ic_check);
        title("Sent to your phone", 19, false, 10);
        text("It's logged when the phone app has it.", 13, MUTED, 4);
        button("Done", false, 0, v -> showHome());
    }

    // ---------------------------------------------------------------- LIFT
    //
    // THE GYM FLOOR (27 Nov 2026, his "best in class ... think how a user would want to use it in the gym"): the
    // phone is in the locker, hands are chalky, the screen sleeps between sets. So: one big tap logs the set and
    // starts the rest (his "One tap, with options"); the reps and the weight are the plan's and change with a tap on
    // the number, − / + or the bezel (his "Adjust reps and weight"); the rest buzzes from the workout service with the
    // screen off, 10s before and at the end, and moves ±15s; the last set can be undone; "All exercises" takes them in
    // any order (the bench is taken). The decisions are LiftFlow's, which test:watch-flow runs.

    private void startLift() {
        TodayStore.Session s = TodayStore.read(this);
        if (s == null) { showHome(); return; }
        if (!WorkoutService.LIVE.running && nextExercise(s) != null) {
            if (!hasHeartPermission()) { askPermissions(); return; }
            WorkoutService.start(this, "lift", s.title);
        }
        showLift();
    }

    /** Today's sets done, moved on from and picked, as this watch keeps them: what LiftFlow decides with. */
    private final LiftFlow.State state = new LiftFlow.State() {
        @Override public int done(TodayStore.Exercise x) { return TodayStore.done(MainActivity.this, x); }
        @Override public boolean skipped(TodayStore.Exercise x) { return TodayStore.skipped(MainActivity.this, x); }
        @Override public String chosen() { return TodayStore.chosen(MainActivity.this); }
    };

    private TodayStore.Exercise nextExercise(TodayStore.Session s) { return LiftFlow.next(s.exercises, state); }

    private TodayStore.Exercise exerciseAfter(TodayStore.Session s, TodayStore.Exercise x) { return LiftFlow.after(s.exercises, x, state); }

    private TodayStore.Exercise find(TodayStore.Session s, String id) {
        if (s == null || id == null) return null;
        for (TodayStore.Exercise e : s.exercises) if (e.id.equals(id)) return e;
        return null;
    }

    private void showLift() {
        screen = Screen.LIFT;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        column.removeAllViews();
        clearLive();
        TodayStore.Session s = TodayStore.read(this);
        TodayStore.Exercise x = s == null ? null : nextExercise(s);
        if (x == null) { showSessionDone(); return; }
        ring.set(sessionFraction(s), MINT);
        int setNumber = TodayStore.done(this, x) + 1;
        // "Next exercise up is ..." on a new exercise's first set; "Next set" on the rest of it.
        kicker(LiftFlow.liftKicker(setNumber), MINT, 0);
        title(x.name, 20, false, 2);
        doneRow(x, 8);
        setDots(x, setNumber, 8);
        heartRow(6);
        // ONE TAP logs the set AND starts the rest (his ruling 27 Nov 2026, "One tap, with options").
        button(LiftFlow.logLabel(x), true, R.drawable.ic_check, v -> setDone(s, x));
        if (exerciseAfter(s, x) != null) quiet("Next exercise", v -> moveOn(x));
        quiet("All exercises", v -> showList());
        quiet("End workout", v -> endLift());
        redrawLive();
    }

    /**
     * The set as he will do it: two chips, "10 reps" and "100 kg", each opening its own − / + screen. A number he has
     * changed from the plan shows in violet. With no weight to change (bodyweight), the load is shown, not a chip.
     */
    private void doneRow(TodayStore.Exercise x, int topDp) {
        LinearLayout r = row(topDp);
        int reps = TodayStore.reps(this, x);
        boolean repsChanged = reps != LiftFlow.plannedReps(x.reps);
        chip(r, LiftFlow.repsText(reps, x.reps), repsChanged, v -> showEdit(x, false));
        if (x.kg >= 0) {
            double kg = TodayStore.kg(this, x);
            TextView at = inline(r, "@", 16, MUTED, WatchStyle.medium(this));
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) at.getLayoutParams();
            lp.leftMargin = dp(6); lp.rightMargin = dp(6);
            chip(r, LiftFlow.loadWith(x.load, kg), kg != x.kg, v -> showEdit(x, true));
        } else if (x.load != null && !x.load.isEmpty()) {
            TextView load = inline(r, "  " + x.load, 16, MUTED, WatchStyle.semibold(this));
            load.setGravity(Gravity.CENTER_VERTICAL);
        }
    }

    /** A number to tap: monospaced, in an outlined pill, violet once changed from the plan. */
    private void chip(LinearLayout parent, String value, boolean changed, View.OnClickListener onClick) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        t.setTypeface(WatchStyle.mono(this));
        t.setTextColor(changed ? WatchStyle.VIOLET : FG);
        t.setGravity(Gravity.CENTER);
        t.setMinHeight(dp(44));
        t.setPadding(dp(12), 0, dp(12), 0);
        t.setBackground(WatchStyle.ghostPill(dp(22), dp(1.5f)));
        t.setClickable(true);
        t.setOnClickListener(onClick);
        parent.addView(t, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    /** A small outlined button in a row ("−15s", "+15s"). */
    private void small(LinearLayout parent, String label, View.OnClickListener onClick) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        t.setTypeface(WatchStyle.semibold(this));
        t.setTextColor(FG);
        t.setGravity(Gravity.CENTER);
        t.setMinHeight(dp(40));
        t.setMinWidth(dp(64));
        t.setBackground(WatchStyle.ghostPill(dp(20), dp(1.5f)));
        t.setClickable(true);
        t.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = dp(4); lp.rightMargin = dp(4);
        parent.addView(t, lp);
    }

    /** A big round − or + (52dp, a gloved thumb's size). */
    private void round(LinearLayout parent, String label, View.OnClickListener onClick) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        t.setTypeface(WatchStyle.bold(this));
        t.setTextColor(FG);
        t.setGravity(Gravity.CENTER);
        t.setBackground(WatchStyle.ghostPill(dp(26), dp(1.5f)));
        t.setClickable(true);
        t.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(56), dp(56));
        lp.leftMargin = dp(10); lp.rightMargin = dp(10);
        parent.addView(t, lp);
    }

    private void setDone(TodayStore.Session s, TodayStore.Exercise x) {
        int setNumber = TodayStore.done(this, x) + 1;
        int reps = TodayStore.reps(this, x);
        double kg = TodayStore.kg(this, x);
        TodayStore.tick(this, x);
        try {
            JSONObject e = new JSONObject();
            e.put("type", "set");
            e.put("date", s.date);
            e.put("exerciseId", x.id);
            e.put("name", x.name);
            e.put("setNumber", setNumber);
            // What he did, ONLY where he changed it (his "Adjust reps and weight"): unchanged, the phone saves its own
            // number for the set, which is the right one even when this session came days ago with the week ahead.
            if (reps != LiftFlow.plannedReps(x.reps)) e.put("reps", reps);
            if (x.kg >= 0 && kg != x.kg) e.put("kg", kg);
            e.put("at", System.currentTimeMillis());
            PhoneLink.send(this, e);
        } catch (Exception ignored) { /* our own object */ }
        WorkoutService.LIVE.restAfterId = x.id;
        TodayStore.Session after = TodayStore.read(this);
        if (after == null || nextExercise(after) == null) { showSessionDone(); return; }
        if (x.restSeconds <= 0) { showLift(); return; }
        startRest(x.restSeconds * 1000L, x.restSeconds * 1000L, after);
        showRest();
    }

    /** The rest runs in the workout service, so it counts and buzzes with the screen off. */
    private void startRest(long leftMs, long totalMs, TodayStore.Session s) {
        TodayStore.Exercise next = s == null ? null : nextExercise(s);
        boolean same = next != null && next.id.equals(WorkoutService.LIVE.restAfterId);
        String line = next == null ? "" : LiftFlow.restLine(next, TodayStore.done(this, next) + 1, same);
        WorkoutService.rest(this, leftMs > 0 ? SystemClock.elapsedRealtime() + leftMs : 0, totalMs, null, line);
    }

    private void endRest() {
        WorkoutService.rest(this, 0, 0, null, null);
        showLift();
    }

    private boolean resting() { return WorkoutService.LIVE.restEndsAt > 0; }

    private void showRest() {
        screen = Screen.REST;
        column.removeAllViews();
        clearLive();
        kicker("REST", WatchStyle.VIOLET, 0);
        restClock = mono("", 56, WatchStyle.NUM, 2);
        // −15s / +15s: a set that needs longer, or a shorter rest on an easy accessory.
        LinearLayout nudge = row(4);
        small(nudge, "−15s", v -> nudgeRest(-1));
        small(nudge, "+15s", v -> nudgeRest(1));
        TodayStore.Session s = TodayStore.read(this);
        TodayStore.Exercise x = s == null ? null : nextExercise(s);
        // More of the same exercise, or a new one: the line and the button say which (his "Next set", "Next exercise").
        boolean same = x != null && x.id.equals(WorkoutService.LIVE.restAfterId);
        if (x != null) {
            int setNumber = TodayStore.done(this, x) + 1;
            nextLine = text(LiftFlow.restLine(x, setNumber, same), 13, MUTED, 6);
        }
        heartRow(6);
        button(LiftFlow.restButton(same), true, 0, v -> endRest());
        // Moving on early, mid-exercise: skips the rest AND this exercise's remaining sets.
        if (same && exerciseAfter(s, x) != null) quiet("Next exercise", v -> moveOn(x));
        TodayStore.Exercise last = find(s, WorkoutService.LIVE.restAfterId);
        if (last != null && TodayStore.done(this, last) > 0) quiet("Undo set " + TodayStore.done(this, last), v -> undoLast(s, last));
        redrawLive();
        tick();
    }

    private void nudgeRest(int dir) {
        long left = Math.max(0, WorkoutService.LIVE.restEndsAt - SystemClock.elapsedRealtime());
        long next = LiftFlow.nudgeRestMs(left, dir);
        long total = Math.max(WorkoutService.LIVE.restTotalMs + dir * 15_000L, next);
        startRest(next, total, TodayStore.read(this));
        redrawLive();
    }

    /**
     * Undo the last set: one fewer on the watch, and a "set-undo" to the phone, which takes the set off its list (or
     * out of the queue if it never got there). Back to that set, rest cancelled.
     */
    private void undoLast(TodayStore.Session s, TodayStore.Exercise x) {
        int setNumber = TodayStore.done(this, x);
        TodayStore.untick(this, x);
        TodayStore.choose(this, x);
        try {
            JSONObject e = new JSONObject();
            e.put("type", "set-undo");
            e.put("date", s.date);
            e.put("exerciseId", x.id);
            e.put("name", x.name);
            e.put("setNumber", setNumber);
            e.put("at", System.currentTimeMillis());
            PhoneLink.send(this, e);
        } catch (Exception ignored) { /* our own object */ }
        endRest();
    }

    // ---------------------------------------------------------------- EDIT: one number, − / + and the bezel

    private TodayStore.Exercise editing;
    private boolean editingKg;
    private TextView editValue;

    private void showEdit(TodayStore.Exercise x, boolean kg) {
        screen = Screen.EDIT;
        editing = x; editingKg = kg;
        column.removeAllViews();
        clearLive();
        kicker(kg ? "WEIGHT" : (LiftFlow.timed(x.reps) ? "TIME" : "REPS"), MINT, 0);
        text(x.name, 13, MUTED, 2);
        editValue = mono("", 44, WatchStyle.NUM, 6);
        LinearLayout r = row(8);
        round(r, "−", v -> stepEdit(-1));
        round(r, "+", v -> stepEdit(1));
        button("Done", true, 0, v -> showLift());
        quiet("Back to the plan", v -> {
            if (editingKg) TodayStore.setKg(this, x, x.kg); else TodayStore.setReps(this, x, LiftFlow.plannedReps(x.reps));
            drawEdit();
        });
        drawEdit();
    }

    private void drawEdit() {
        if (editing == null || editValue == null) return;
        editValue.setText(editingKg ? LiftFlow.loadWith(editing.load, TodayStore.kg(this, editing))
            : LiftFlow.repsText(TodayStore.reps(this, editing), editing.reps));
    }

    private void stepEdit(int dir) {
        if (editing == null) return;
        if (editingKg) TodayStore.setKg(this, editing, LiftFlow.stepKg(TodayStore.kg(this, editing), dir, editing.step));
        else TodayStore.setReps(this, editing, LiftFlow.stepReps(TodayStore.reps(this, editing), dir, editing.reps));
        drawEdit();
    }

    /** The bezel (the Galaxy Watch's touch bezel and a crown send the same events) turns the number being changed. */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (screen == Screen.EDIT && ev.getAction() == MotionEvent.ACTION_SCROLL
                && ev.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
            float delta = -ev.getAxisValue(MotionEvent.AXIS_SCROLL);
            if (delta != 0) stepEdit(delta > 0 ? 1 : -1);
            return true;
        }
        return super.dispatchGenericMotionEvent(ev);
    }

    // ---------------------------------------------------------------- LIST: any order

    private void showList() {
        screen = Screen.LIST;
        column.removeAllViews();
        clearLive();
        TodayStore.Session s = TodayStore.read(this);
        kicker("ALL EXERCISES", MINT, 0);
        if (s != null) for (TodayStore.Exercise e : s.exercises) {
            int done = TodayStore.done(this, e);
            boolean finished = done >= e.sets;
            String sub = finished ? "Done" : (TodayStore.skipped(this, e) ? "Moved on · " : "") + done + " of " + e.sets + " sets · " + LiftFlow.prescription(e);
            tile(finished ? R.drawable.ic_check : R.drawable.ic_lift, e.name, sub, finished ? null : v -> { TodayStore.choose(this, e); showLift(); });
        }
        quiet("Back", v -> showLift());
    }

    /** "Next exercise": leave x's remaining sets (the phone keeps them open) and go straight to what comes after. */
    private void moveOn(TodayStore.Exercise x) {
        TodayStore.skip(this, x);
        TodayStore.chooseNone(this);
        WorkoutService.rest(this, 0, 0, null, null);
        showLift();
    }

    /** Sets done today, of all the session's sets: the ring on the lifting screens. */
    private float sessionFraction(TodayStore.Session s) {
        if (s == null) return 0f;
        int done = 0, total = 0;
        for (TodayStore.Exercise x : s.exercises) { done += TodayStore.done(this, x); total += x.sets; }
        return total > 0 ? done / (float) total : 0f;
    }

    private void showSessionDone() {
        screen = Screen.DONE;
        column.removeAllViews();
        clearLive();
        ring.set(1f, MINT);
        badge(R.drawable.ic_check);
        title("Session done", 21, false, 10);
        TodayStore.Session s = TodayStore.read(this);
        boolean movedOn = false;
        if (s != null) for (TodayStore.Exercise e : s.exercises) if (TodayStore.skipped(this, e) && TodayStore.done(this, e) < e.sets) movedOn = true;
        text(movedOn ? "Sets you moved on from stay open on your phone. Your phone saves the rest as its own ticks."
            : "Every set is ticked. Your phone saves them as its own ticks.", 13, MUTED, 4);
        button("End workout", true, 0, v -> endLift());
        if (movedOn) quiet("All exercises", v -> showList());
    }

    private void endLift() {
        if (WorkoutService.LIVE.running) WorkoutService.end(this);
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
        int zone = liveZone(l);
        if (screen == Screen.CARDIO && clock != null) {
            clock.setText(duration(System.currentTimeMillis() - l.startedAt));
            if (l.steps >= 0) {
                statA.setText(String.format(Locale.UK, "%,d", l.steps)); statALabel.setText("STEPS");
                statB.setText(String.format(Locale.UK, "%.2f", Math.max(0, l.distanceM) / 1000)); statBLabel.setText("KM");
            } else {
                statA.setText(l.kcal > 0 ? String.format(Locale.UK, "%d", Math.round(l.kcal)) : "–"); statALabel.setText("KCAL");
                statB.setText(l.maxBpm > 0 ? String.valueOf(l.maxBpm) : "–"); statBLabel.setText("MAX ♥");
            }
            // The edge carries the zone, zone N of 5 in the heart's colour.
            ring.set(zone / 5f, WatchStyle.HEART);
        }
        drawHeart(l, zone);
        if (screen == Screen.REST && restClock != null) {
            // The service buzzes (10s before and at the end, screen on or off); the screen only shows it.
            WorkoutService.Live live = WorkoutService.LIVE;
            long left = live.restEndsAt - SystemClock.elapsedRealtime();
            if (left <= 0) {
                restClock.setText("Go");
                restClock.setTextColor(MINT);
                ring.set(1f, MINT);
            } else {
                restClock.setText(duration(left + 999));
                restClock.setTextColor(WatchStyle.NUM);
                ring.set(live.restTotalMs > 0 ? left / (float) live.restTotalMs : 0f, WatchStyle.VIOLET);
            }
        }
    }

    /** The live zone, or 0: none when the phone shows none, the reading is stale, or nothing is running. */
    private int liveZone(WorkoutService.Live l) {
        if (!l.running || l.bpm <= 0 || System.currentTimeMillis() - l.bpmAt > 5000) return 0;
        return Zones.zoneOf(l.bpm, TodayStore.estimatedMax(this));
    }

    /** "♥ 142  ZONE 3"; no zone when the phone shows none; a dash, never a stale number (the phone's five seconds). */
    private void drawHeart(WorkoutService.Live l, int zone) {
        if (heartRow == null) return;
        heartRow.setVisibility(l.running ? View.VISIBLE : View.INVISIBLE);
        boolean fresh = l.bpm > 0 && System.currentTimeMillis() - l.bpmAt <= 5000;
        heartBpm.setText(fresh ? String.valueOf(l.bpm) : "–");
        heartZone.setVisibility(zone > 0 ? View.VISIBLE : View.GONE);
        heartZone.setText("ZONE " + zone);
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

    // ---------------------------------------------------------------- drawing (WatchStyle: the app's own look)

    private LinearLayout.LayoutParams wide(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        return lp;
    }

    private TextView text(String value, int sp, int color, int topDp) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        t.setTypeface(WatchStyle.medium(this));
        t.setLineSpacing(0, 1.1f);
        column.addView(t, wide(topDp));
        return t;
    }

    /** The app's small capitals: semi-bold, widely spaced. */
    private TextView kicker(String value, int color, int topDp) {
        TextView t = text(value, 12, color, topDp);
        t.setTypeface(WatchStyle.semibold(this));
        t.setLetterSpacing(0.18f);
        return t;
    }

    /** A heading; the app draws a session's last word in mint ("Upper Push & Core"). */
    private TextView title(String value, int sp, boolean accentLastWord, int topDp) {
        TextView t = text(value, sp, FG, topDp);
        t.setTypeface(WatchStyle.bold(this));
        t.setLineSpacing(0, 1.0f);
        int cut = value.lastIndexOf(' ');
        if (accentLastWord && cut > 0) {
            SpannableString span = new SpannableString(value);
            span.setSpan(new ForegroundColorSpan(MINT), cut + 1, value.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            t.setText(span);
        }
        return t;
    }

    /** A number: monospaced, so the clock does not shuffle as it runs. */
    private TextView mono(String value, int sp, int color, int topDp) {
        TextView t = text(value, sp, color, topDp);
        t.setTypeface(WatchStyle.mono(this));
        t.setIncludeFontPadding(false);
        t.setLetterSpacing(-0.02f);
        return t;
    }

    private LinearLayout row(int topDp) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER);
        column.addView(r, wide(topDp));
        return r;
    }

    private TextView inline(LinearLayout parent, CharSequence value, int sp, int color, Typeface face) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(face);
        t.setIncludeFontPadding(false);
        parent.addView(t, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return t;
    }

    /** A figure over its label ("3,912" / "STEPS"). */
    private LinearLayout stat(LinearLayout parent) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER);
        inline(c, "–", 20, FG, WatchStyle.mono(this));
        TextView label = inline(c, "", 10, MUTED, WatchStyle.semibold(this));
        label.setLetterSpacing(0.16f);
        ((LinearLayout.LayoutParams) label.getLayoutParams()).topMargin = dp(3);
        parent.addView(c);
        return c;
    }

    /** "3 × 10 @ 100 kg": the reps in white, the weight in mint, its unit smaller. */
    private void prescriptionRow(TodayStore.Exercise x, int topDp) {
        LinearLayout r = row(topDp);
        r.setGravity(Gravity.CENTER | Gravity.BOTTOM);
        inline(r, x.sets + "×" + x.reps, 28, FG, WatchStyle.mono(this));
        if (x.load == null || x.load.isEmpty()) return;
        TextView at = inline(r, "@", 18, MUTED, WatchStyle.medium(this));
        LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) at.getLayoutParams();
        lp.leftMargin = dp(7); lp.rightMargin = dp(7);
        int space = x.load.indexOf(' ');
        SpannableString load = new SpannableString(x.load);
        if (space > 0) load.setSpan(new android.text.style.RelativeSizeSpan(0.5f), space, x.load.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        inline(r, load, 28, MINT, WatchStyle.mono(this));
    }

    /** One dot a set, the done ones lit, and "Set 2 of 3". */
    private void setDots(TodayStore.Exercise x, int setNumber, int topDp) {
        LinearLayout r = row(topDp);
        for (int i = 1; i <= Math.min(x.sets, 8); i++) {
            View dot = new View(this);
            android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
            g.setShape(android.graphics.drawable.GradientDrawable.OVAL);
            g.setColor(i < setNumber ? MINT : i == setNumber ? FG : WatchStyle.BORDER);
            dot.setBackground(g);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(7), dp(7));
            lp.rightMargin = dp(5);
            r.addView(dot, lp);
        }
        TextView t = inline(r, "Set " + setNumber + " of " + x.sets, 13, MUTED, WatchStyle.medium(this));
        ((LinearLayout.LayoutParams) t.getLayoutParams()).leftMargin = dp(4);
    }

    /** The heart, its number and its zone chip, drawn by drawHeart. */
    private void heartRow(int topDp) {
        heartRow = row(topDp);
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.ic_heart);
        icon.setImageTintList(android.content.res.ColorStateList.valueOf(WatchStyle.HEART));
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(20), dp(20));
        ip.rightMargin = dp(7);
        heartRow.addView(icon, ip);
        heartBpm = inline(heartRow, "–", 22, FG, WatchStyle.mono(this));
        heartZone = inline(heartRow, "", 10, WatchStyle.HEART, WatchStyle.semibold(this));
        heartZone.setLetterSpacing(0.14f);
        heartZone.setPadding(dp(8), dp(3), dp(8), dp(3));
        heartZone.setBackground(WatchStyle.chip(WatchStyle.HEART, dp(20), dp(1)));
        ((LinearLayout.LayoutParams) heartZone.getLayoutParams()).leftMargin = dp(9);
        heartZone.setVisibility(View.GONE);
    }

    /** The app's pill: mint and lit for the main action, an outline for the rest. */
    private TextView button(String label, boolean primary, int icon, View.OnClickListener onClick) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setGravity(Gravity.CENTER);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, primary ? 16 : 15);
        b.setTypeface(WatchStyle.bold(this));
        b.setTextColor(primary ? WatchStyle.ON_MINT : FG);
        b.setBackground(primary ? WatchStyle.primaryPill(dp(28)) : WatchStyle.ghostPill(dp(28), dp(1.5f)));
        b.setMinHeight(dp(primary ? 52 : 46));
        b.setPadding(dp(20), 0, dp(20), 0);
        b.setClickable(true);
        b.setFocusable(true);
        b.setOnClickListener(onClick);
        if (icon != 0) {
            android.graphics.drawable.Drawable d = getDrawable(icon);
            if (d != null) {
                d = d.mutate();
                d.setTint(primary ? WatchStyle.ON_MINT : FG);
                d.setBounds(0, 0, dp(18), dp(18));
                b.setCompoundDrawables(d, null, null, null);
                b.setCompoundDrawablePadding(dp(8));
            }
        }
        if (primary) {
            // The app's mint glow, as the button's own shadow.
            b.setElevation(dp(10));
            b.setOutlineSpotShadowColor(MINT);
            b.setOutlineAmbientShadowColor(MINT);
        }
        column.addView(b, wide(14));
        return b;
    }

    /** A small text action at the foot ("End workout", "Don't log it"). */
    private TextView quiet(String label, View.OnClickListener onClick) {
        TextView t = text(label, 13, MUTED, 8);
        t.setTypeface(WatchStyle.semibold(this));
        t.setMinHeight(dp(40));
        t.setGravity(Gravity.CENTER);
        t.setClickable(true);
        t.setOnClickListener(onClick);
        return t;
    }

    /** A cardio choice: the app's icon in a mint disc, the name, and what it records. */
    private void tile(int icon, String name, String sub, View.OnClickListener onClick) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.HORIZONTAL);
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(dp(12), dp(10), dp(14), dp(10));
        t.setBackground(WatchStyle.tile(dp(24), dp(1)));
        t.setClickable(onClick != null);
        if (onClick != null) t.setOnClickListener(onClick);
        else t.setAlpha(0.6f);
        ImageView ic = new ImageView(this);
        ic.setImageResource(icon);
        ic.setImageTintList(android.content.res.ColorStateList.valueOf(MINT));
        ic.setBackground(WatchStyle.iconDisc(MINT));
        ic.setPadding(dp(8), dp(8), dp(8), dp(8));
        t.addView(ic, new LinearLayout.LayoutParams(dp(36), dp(36)));
        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        wp.leftMargin = dp(12);
        t.addView(words, wp);
        inline(words, name, 16, FG, WatchStyle.bold(this));
        inline(words, sub, 11, MUTED, WatchStyle.medium(this));
        column.addView(t, wide(8));
    }

    /** A large icon in a mint disc, for a finished screen. */
    private void badge(int icon) {
        ImageView ic = new ImageView(this);
        ic.setImageResource(icon);
        ic.setImageTintList(android.content.res.ColorStateList.valueOf(MINT));
        ic.setBackground(WatchStyle.iconDisc(MINT));
        ic.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(52), dp(52));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        column.addView(ic, lp);
    }

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    static String duration(long ms) { return LiftFlow.duration(ms); }

    private static String word(String effort) {
        return "easy".equals(effort) ? "Easy" : "steady".equals(effort) ? "Steady" : "Hard";
    }
}
