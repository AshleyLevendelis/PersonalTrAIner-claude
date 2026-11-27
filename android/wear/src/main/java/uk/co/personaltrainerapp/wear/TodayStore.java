package uk.co.personaltrainerapp.wear;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * TODAY'S SESSION AS THE PHONE LAST SENT IT, kept on the watch, plus the sets ticked on the watch since. The phone's
 * numbers always win (decision 3 of docs/plans/watch-app.md): the watch shows the phone's prescription and only ticks
 * it; a different weight is changed on the phone. A session for another date is never shown.
 */
final class TodayStore {
    private TodayStore() {}
    private static final String PREFS = "pt_today";

    static final class Exercise {
        String id;
        String name;
        int sets;
        String reps;      // "10", "8-12", "30s"
        String load;      // "100 kg", "20 kg per hand", "BW", "" (none)
        int restSeconds;
        int phoneDone;    // sets done as the phone last saw them
        double kg = -1;   // the planned weight as a number (the "100" of "100 kg"); -1: no weight to change (BW, none)
        double step = 2.5; // the implement's notch, from the phone (2.5 a bar or a stack, 2 a dumbbell)
        int nextReps = -1;   // the phone's next set, when this is the exercise it is on: the reps its Log set would save
        double nextKg = Double.NaN; // ...and the weight; NaN: the plan's
    }

    /** The day's planned cardio session, run on the wrist (IntervalFlow) and logged under `activity`, the plan's name. */
    static final class Cardio {
        String activity;  // exactly what the phone logs it under, so the day reads done
        String name;      // "Assault Bike Rounds"
        String effort;    // "Hard", or "" for none
        String line;      // "4 × 3 min hard · 1 min rest"
        int minutes;
        int rounds;       // 0: a steady session of `minutes`
        int workSeconds;
        int restSeconds;
        boolean onFoot;   // steps and distance (the phone's tracksSteps)
    }

    static final class Session {
        String date;
        String title;
        int estimatedMax; // 0: no zones
        final List<Exercise> exercises = new ArrayList<>();
        Cardio cardio;    // null: no cardio planned
        String nowId;     // the exercise the phone is on, or null
    }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    /**
     * A NEW SESSION FROM THE PHONE IS THE TRUTH (27 Nov 2026, his gym report: "the watch and phone disagree"). The watch's
     * own moves for today ("Next exercise", a pick from "All exercises", a changed reps or weight) are cleared, so it
     * follows the phone's exercise and next set; a set he logs on the watch reaches the phone and comes back in the next
     * one. The sets ticked on the watch and an Undo held down are kept (LiftFlow.doneCount).
     */
    static void save(Context c, String json) {
        SharedPreferences.Editor e = prefs(c).edit().putString("json", json);
        String day = today();
        for (String k : prefs(c).getAll().keySet()) {
            if (k.equals("chosen:" + day) || k.startsWith("skip:" + day + ":") || k.startsWith("reps:" + day + ":") || k.startsWith("kg:" + day + ":")) e.remove(k);
        }
        e.apply();
    }

    /** The exercise the phone is on today, or null. */
    static String nowId(Context c) { Session s = read(c); return s == null ? null : s.nowId; }

    /** The reps a set of this exercise is offered at: the phone's next set where it is on it, else the plan's first. */
    static int plannedReps(Exercise x) { return x.nextReps > 0 ? x.nextReps : LiftFlow.plannedReps(x.reps); }

    /** ...and the weight: the phone's next set's, else the plan's. */
    static double plannedKg(Exercise x) { return x.kg >= 0 && !Double.isNaN(x.nextKg) ? x.nextKg : x.kg; }

    /** His estimated maximum for the zones, from the last thing the phone sent, whatever its date; 0 for none. */
    static int estimatedMax(Context c) {
        try {
            String raw = prefs(c).getString("json", null);
            return raw == null ? 0 : new JSONObject(raw).optInt("estimatedMax", 0);
        } catch (Exception e) { return 0; }
    }

    /**
     * The phone's session for a date: today's own (with today's exact weights) when the phone sent it today, else the
     * day out of the week ahead it sent with it ("days"), so the watch has the plan when the phone is in the locker.
     * 27 Nov 2026, the gym-floor review: it had only ever had a session once Exercise was opened that very day.
     */
    static JSONObject dayFor(JSONObject sent, String date) {
        if (date.equals(sent.optString("date"))) return sent;
        JSONArray days = sent.optJSONArray("days");
        if (days == null) return null;
        for (int i = 0; i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            if (d != null && date.equals(d.optString("date"))) return d;
        }
        return null;
    }

    /** Today's session, or null when the phone sent none for today. */
    static Session read(Context c) {
        try {
            String raw = prefs(c).getString("json", null);
            if (raw == null) return null;
            JSONObject sent = new JSONObject(raw);
            JSONObject o = dayFor(sent, today());
            if (o == null) return null;
            Session s = new Session();
            s.date = o.optString("date");
            s.title = o.optString("title", "Today's session");
            s.estimatedMax = o.optInt("estimatedMax", 0);
            JSONObject cj = o.optJSONObject("cardio");
            if (cj != null && cj.optInt("minutes", 0) > 0) {
                Cardio k = new Cardio();
                k.activity = cj.optString("activity");
                k.name = cj.optString("name", k.activity);
                k.effort = cj.isNull("effort") ? "" : cj.optString("effort", "");
                k.line = cj.optString("line", "");
                k.minutes = cj.optInt("minutes");
                k.rounds = Math.max(0, cj.optInt("rounds", 0));
                k.workSeconds = Math.max(0, cj.optInt("workSeconds", 0));
                k.restSeconds = Math.max(0, cj.optInt("restSeconds", 0));
                k.onFoot = cj.optBoolean("onFoot", false);
                if (!k.activity.isEmpty()) s.cardio = k;
            }
            // Only today's own entry carries it: a day out of the week ahead has no "now".
            JSONObject now = o == sent ? o.optJSONObject("now") : null;
            if (now != null && !now.optString("id").isEmpty()) s.nowId = now.optString("id");
            JSONArray arr = o.optJSONArray("exercises");
            if ((arr == null || arr.length() == 0) && s.cardio == null) return null;
            if (arr != null) for (int i = 0; i < arr.length(); i++) {
                JSONObject e = arr.getJSONObject(i);
                Exercise x = new Exercise();
                x.id = e.optString("id");
                x.name = e.optString("name");
                x.sets = Math.max(1, e.optInt("sets", 1));
                x.reps = e.optString("reps", "");
                x.load = e.optString("load", "");
                x.restSeconds = Math.max(0, e.optInt("restSeconds", 60));
                x.phoneDone = Math.max(0, e.optInt("done", 0));
                x.kg = e.has("kg") && !e.isNull("kg") ? e.optDouble("kg", -1) : -1;
                x.step = e.optDouble("step", 2.5);
                if (x.id.equals(s.nowId)) {
                    x.nextReps = now.optInt("reps", -1);
                    if (now.has("kg") && !now.isNull("kg")) x.nextKg = now.optDouble("kg", Double.NaN);
                }
                s.exercises.add(x);
            }
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    /** Sets done: the more of the phone's count and the watch's own ticks today, held down after an Undo (LiftFlow). */
    static int done(Context c, Exercise x) {
        int cap = prefs(c).getInt(capKey(x), -1);
        // The phone has caught up with the Undo (its count is back at or under the cap): nothing left to hold down.
        if (cap >= 0 && x.phoneDone <= cap) { prefs(c).edit().remove(capKey(x)).apply(); cap = -1; }
        return LiftFlow.doneCount(x.phoneDone, prefs(c).getInt(watchKey(x), 0), cap, x.sets);
    }

    static void tick(Context c, Exercise x) {
        int n = done(c, x) + 1;
        SharedPreferences.Editor e = prefs(c).edit().putInt(watchKey(x), n);
        if (prefs(c).contains(capKey(x))) e.putInt(capKey(x), n);
        e.apply();
    }

    /** Undo the last set logged on the watch: one fewer, held there until the phone has deleted it too. */
    static void untick(Context c, Exercise x) {
        int n = Math.max(0, done(c, x) - 1);
        prefs(c).edit().putInt(watchKey(x), n).putInt(capKey(x), n).apply();
    }

    /** The exercise picked from "All exercises", today; picking one he had moved on from brings it back. */
    static String chosen(Context c) { return prefs(c).getString("chosen:" + today(), null); }

    static void chooseNone(Context c) { prefs(c).edit().remove("chosen:" + today()).apply(); }

    static void choose(Context c, Exercise x) {
        prefs(c).edit().putString("chosen:" + today(), x.id).remove(skipKey(x)).apply();
    }

    /** The reps and weight he set for this exercise today (carried to its next sets), or the plan's when unchanged. */
    static int reps(Context c, Exercise x) { return prefs(c).getInt("reps:" + today() + ":" + x.id, plannedReps(x)); }

    static double kg(Context c, Exercise x) {
        String v = prefs(c).getString("kg:" + today() + ":" + x.id, null);
        return v == null ? plannedKg(x) : Double.parseDouble(v);
    }

    static void setReps(Context c, Exercise x, int reps) { prefs(c).edit().putInt("reps:" + today() + ":" + x.id, reps).apply(); }

    static void setKg(Context c, Exercise x, double kg) { prefs(c).edit().putString("kg:" + today() + ":" + x.id, LiftFlow.kgText(kg)).apply(); }

    private static String capKey(Exercise x) { return "cap:" + today() + ":" + x.id; }

    /**
     * "Next exercise" moved on from this one today with sets left (his 27 Nov 2026 flow: "Log set, Next set, Start rest
     * timer, Next exercise"). Kept on the watch only: nothing is sent, so the phone's list keeps those sets open and
     * they can still be done there. Today only.
     */
    static boolean skipped(Context c, Exercise x) { return prefs(c).getBoolean(skipKey(x), false); }

    static void skip(Context c, Exercise x) { prefs(c).edit().putBoolean(skipKey(x), true).apply(); }

    private static String watchKey(Exercise x) { return "done:" + today() + ":" + x.id; }

    private static String skipKey(Exercise x) { return "skip:" + today() + ":" + x.id; }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
