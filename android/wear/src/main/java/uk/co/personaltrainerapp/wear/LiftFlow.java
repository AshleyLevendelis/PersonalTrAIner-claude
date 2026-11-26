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

    /** Sets done and "moved on from" today, as the watch keeps them (TodayStore on the watch, a map in the check). */
    interface State {
        int done(TodayStore.Exercise x);
        boolean skipped(TodayStore.Exercise x);
    }

    static boolean open(TodayStore.Exercise x, State st) { return st.done(x) < x.sets && !st.skipped(x); }

    /** The first exercise with sets left that has not been moved on from; null when the session is done. */
    static TodayStore.Exercise next(List<TodayStore.Exercise> all, State st) {
        for (TodayStore.Exercise x : all) if (open(x, st)) return x;
        return null;
    }

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
