package uk.co.personaltrainerapp.wear;

import java.util.List;
import java.util.Locale;

/**
 * WHAT COMES NEXT IN A LIFTING SESSION ON THE WATCH, AND WHAT EACH SCREEN SAYS (27 Nov 2026). His words: "next exercise
 * up is ...; Log set; Next set; Start rest timer; Next set; Next exercise", and his ruling "One tap, with options":
 * Log set saves the set AND starts the rest; the rest offers Next set (or Next exercise when the next set is a new one)
 * and, mid-exercise, Next exercise to move on early.
 *
 * Plain Java with no Android in it, so scripts/test-watch-flow runs it on any machine with a JDK: the screens read
 * their words and their order from here, and the check plays whole sessions through it.
 */
final class LiftFlow {
    private LiftFlow() {}

    /** Sets done, "moved on from" and the one he picked, today, as the watch keeps them (TodayStore; a map in the check). */
    interface State {
        int done(TodayStore.Exercise x);
        boolean skipped(TodayStore.Exercise x);
        /** The exercise he picked from "All exercises" (the bench was taken), or null to go in the plan's order. */
        String chosen();
        /**
         * The exercise the PHONE is on (its Log set button's), or null (27 Nov 2026, his gym report: "the watch and phone
         * disagree with each other"). After his own pick, it outranks the plan's order, so both screens name one lift.
         */
        default String now() { return null; }
    }

    static boolean open(TodayStore.Exercise x, State st) { return st.done(x) < x.sets && !st.skipped(x); }

    /** The exercise he picked while it has sets left, else the phone's, else the first with sets left in the plan's order. */
    static TodayStore.Exercise next(List<TodayStore.Exercise> all, State st) {
        String pick = st.chosen();
        if (pick != null) for (TodayStore.Exercise x : all) if (x.id.equals(pick) && st.done(x) < x.sets) return x;
        String now = st.now();
        if (now != null) for (TodayStore.Exercise x : all) if (x.id.equals(now) && open(x, st)) return x;
        for (TodayStore.Exercise x : all) if (open(x, st)) return x;
        return null;
    }

    /**
     * Sets done on the watch's screens: the more of the phone's count and the watch's own, held down to `cap` after an
     * Undo until the phone has caught up (the phone's count still holds the undone set until it deletes it and sends
     * the session again). cap < 0: no undo waiting.
     */
    static int doneCount(int phoneDone, int watchDone, int cap, int sets) {
        int n = Math.max(phoneDone, watchDone);
        if (cap >= 0) n = Math.min(n, cap);
        return Math.max(0, Math.min(sets, n));
    }

    // ------------------------------------------------------------ the set as done (his ruling "Adjust reps and weight")

    /** A held exercise ("30s", "45 s"): its count is seconds, stepped in fives. */
    static boolean timed(String reps) { return reps != null && reps.trim().matches("\\d+(\\s*-\\s*\\d+)?\\s*s(ec.*)?"); }

    /** The count the phone's own box would save untouched: the first number of "8-12" (SetGrid's defaultRepsFor). */
    static int plannedReps(String reps) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\d+").matcher(reps == null ? "" : reps);
        return m.find() ? Integer.parseInt(m.group()) : 0;
    }

    /** One step of the count: a rep, or five seconds; never below one step. */
    static int stepReps(int value, int dir, String reps) {
        int step = timed(reps) ? 5 : 1;
        return Math.max(step, value + dir * step);
    }

    /** One step of the weight on the implement's own notch (2.5 kg a bar or a stack, 2 kg a dumbbell); never below 0. */
    static double stepKg(double kg, int dir, double step) {
        double s = step > 0 ? step : 2.5;
        double v = Math.round((kg + dir * s) * 2) / 2.0;
        return Math.max(0, v);
    }

    /** "100", "47.5": the weight as the phone's box takes it. */
    static String kgText(double kg) {
        return kg == Math.rint(kg) ? String.valueOf((long) kg) : String.valueOf(Math.round(kg * 10) / 10.0);
    }

    /** The load line with the weight he chose: "100 kg" becomes "90 kg", "20 kg per hand" "18 kg per hand". */
    static String loadWith(String load, double kg) {
        if (load == null || load.isEmpty()) return kgText(kg) + " kg";
        return load.replaceFirst("^\\s*\\d+(\\.\\d+)?", kgText(kg));
    }

    /** The count alone, as the set line prints it beside "3 ×": "10", or "30s" for a hold (28 Nov 2026, his mock). */
    /**
     * The set line's number size, so "3 × 10 @ 100kg" fits across the round face on ONE line (his gym photo, 27 Nov 2026:
     * a weight that did not fit wrapped one letter per line, "4 / 0 / k / g"). Counted in characters of the mono face,
     * the unit at half size: 26sp up to 10, 22sp up to 13, else 18sp.
     */
    static int setLineSp(int sets, String count, String kg, String unit) {
        double chars = (sets + " ×").length() + count.length() + 1 + kg.length() + (unit == null ? 0 : unit.length() / 2.0);
        return chars <= 10 ? 26 : chars <= 13 ? 22 : 18;
    }

    static String countText(int value, String reps) {
        return timed(reps) ? value + "s" : String.valueOf(value);
    }

    /**
     * The weight split for the set line (his mock, "3 × 10 @ 100kg"): the number he can tap, its unit small beside it,
     * and what else the load says ("per hand", "single side") for the line under it. "16 kg (single side)" gives
     * {"16", "kg", "single side"}; an empty load gives {number, "kg", ""}.
     */
    static String[] loadParts(String load, double kg) {
        String rest = load == null ? "" : load.replaceFirst("^\\s*\\d+(\\.\\d+)?\\s*", "").trim();
        String unit = "kg", extra = "";
        if (!rest.isEmpty()) {
            int sp = rest.indexOf(' ');
            unit = sp < 0 ? rest : rest.substring(0, sp);
            extra = sp < 0 ? "" : rest.substring(sp + 1).replaceAll("[()]", "").trim();
        }
        return new String[] { kgText(kg), unit, extra };
    }

    /** The count as words: "10 reps", "1 rep", "30s". */
    static String repsText(int value, String reps) {
        if (timed(reps)) return value + "s";
        return value == 1 ? "1 rep" : value + " reps";
    }

    // ------------------------------------------------------------ rest

    /** The rest after a nudge (his −15s / +15s): never below zero left, never above ten minutes in all. */
    static long nudgeRestMs(long leftMs, int dir) {
        long v = leftMs + dir * 15_000L;
        return Math.max(0, Math.min(600_000L, v));
    }

    /** A short buzz this long before the rest ends, so he is under the bar when it does; none on a rest under 30s. */
    static long warnBeforeMs(long totalMs) { return totalMs >= 30_000L ? 10_000L : 0; }

    /** The exercise after x with sets left: where "Next exercise" goes, or null when x is the last one left. */
    static TodayStore.Exercise after(List<TodayStore.Exercise> all, TodayStore.Exercise x, State st) {
        boolean past = false;
        for (TodayStore.Exercise e : all) {
            if (past && open(e, st)) return e;
            if (e.id.equals(x.id)) past = true;
        }
        return null;
    }

    /** The lift screen's kicker: "next exercise up" on a new exercise's first set, "next set" on the rest of it. */
    static String liftKicker(int setNumber) { return setNumber == 1 ? "NEXT EXERCISE UP" : "NEXT SET"; }

    /** The one tap: "Log set · rest 2:00", or "Log set" when the plan gives this exercise no rest. */
    static String logLabel(TodayStore.Exercise x) {
        return x.restSeconds > 0 ? "Log set · rest " + duration(x.restSeconds * 1000L) : "Log set";
    }

    /** The rest's main button: more of the same exercise, or the next one. */
    static String restButton(boolean same) { return same ? "Next set" : "Next exercise"; }

    /** The line under the rest clock. */
    static String restLine(TodayStore.Exercise x, int setNumber, boolean same) {
        return same ? "Then set " + setNumber + " of " + x.sets + " · " + x.name
            : "Next exercise up: " + x.name + " · " + prescription(x);
    }

    /** "3 × 10 @ 100 kg", "3 × 8-12", "3 × 30s" — the phone's prescription, as the Exercise tab prints it. */
    static String prescription(TodayStore.Exercise x) {
        String base = x.sets + " × " + x.reps;
        return x.load == null || x.load.isEmpty() ? base : base + " @ " + x.load;
    }

    /** "1:05", "12:30", "1:02:03". */
    static String duration(long ms) {
        long s = Math.max(0, ms / 1000);
        if (s >= 3600) return String.format(Locale.UK, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60);
        return String.format(Locale.UK, "%d:%02d", s / 60, s % 60);
    }
}
