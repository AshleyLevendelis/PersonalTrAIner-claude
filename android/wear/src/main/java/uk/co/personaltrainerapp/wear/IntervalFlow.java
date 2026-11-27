package uk.co.personaltrainerapp.wear;

/**
 * A PLANNED CARDIO SESSION RUN ON THE WRIST (27 Nov 2026, his "plans integrate well" with the watch): the rounds of an
 * interval session ("4 × 3 min hard · 1 min rest") or the minutes of a steady one, as the phone's card prescribes them.
 * Where in the session a moment falls, what the screen says about it, and when the watch buzzes: work starts (long),
 * rest starts (two short), three short taps before a work round after a rest of 10s or more, and a long double at the
 * end. Plain Java with no Android in it, so scripts/test-watch-flow compiles and runs it with the JDK.
 */
final class IntervalFlow {
    private IntervalFlow() {}

    /** Where the session stands at a moment: the round, work or rest, the time left in it, and whether it is over. */
    static final class Phase {
        int round;        // 1-based; for a steady session always 1
        int rounds;       // 0 for a steady session
        boolean work;     // a steady session is one long "work"
        long leftMs;      // in this work or rest
        long phaseMs;     // the whole of this work or rest
        boolean done;
    }

    /** Whole session length: rounds of work with the rests between them (none after the last), or the minutes. */
    static long totalMs(int rounds, int workSec, int restSec, int minutes) {
        if (rounds > 0) return rounds * workSec * 1000L + Math.max(0, rounds - 1) * restSec * 1000L;
        return Math.max(0, minutes) * 60_000L;
    }

    static Phase at(long elapsedMs, int rounds, int workSec, int restSec, int minutes) {
        Phase p = new Phase();
        p.rounds = rounds;
        long total = totalMs(rounds, workSec, restSec, minutes);
        long t = Math.max(0, elapsedMs);
        if (t >= total) { p.done = true; p.round = Math.max(1, rounds); p.work = rounds == 0; return p; }
        if (rounds <= 0) { p.round = 1; p.work = true; p.phaseMs = total; p.leftMs = total - t; return p; }
        long work = workSec * 1000L, rest = restSec * 1000L, cycle = work + rest;
        int i = (int) (t / cycle);
        long into = t - i * cycle;
        p.round = i + 1;
        if (into < work) { p.work = true; p.phaseMs = work; p.leftMs = work - into; }
        else { p.work = false; p.phaseMs = rest; p.leftMs = cycle - into; }
        return p;
    }

    /** A buzz: when (ms from the start) and which ("work", "rest", "count", "end"). */
    static final class Buzz {
        final long atMs; final String kind;
        Buzz(long atMs, String kind) { this.atMs = atMs; this.kind = kind; }
    }

    /** Every buzz of the session in order; the first work round starts with no buzz (he pressed Start). */
    static java.util.List<Buzz> buzzes(int rounds, int workSec, int restSec, int minutes) {
        java.util.List<Buzz> out = new java.util.ArrayList<>();
        long total = totalMs(rounds, workSec, restSec, minutes);
        if (rounds > 0) {
            long work = workSec * 1000L, rest = restSec * 1000L;
            for (int i = 0; i < rounds; i++) {
                long start = i * (work + rest);
                if (i > 0) {
                    if (rest >= 10_000L) for (int k = 3; k >= 1; k--) out.add(new Buzz(start - k * 1000L, "count"));
                    out.add(new Buzz(start, "work"));
                }
                if (i < rounds - 1 && rest > 0) out.add(new Buzz(start + work, "rest"));
            }
        }
        out.add(new Buzz(total, "end"));
        return out;
    }

    /** The kicker over the clock: "WORK", "REST", "DONE", or for a steady session its effort or "GO". */
    static String kicker(Phase p, String effort) {
        if (p.done) return "DONE";
        if (p.rounds <= 0) return effort == null || effort.isEmpty() ? "GO" : effort.toUpperCase(java.util.Locale.UK);
        return p.work ? "WORK" : "REST";
    }

    /** The line under the clock: "Round 2 of 4", "Next: round 3 of 4", "20 min session", "Session done". */
    static String line(Phase p, int minutes) {
        if (p.done) return "Session done · End to log it";
        if (p.rounds <= 0) return minutes + " min session";
        return p.work ? "Round " + p.round + " of " + p.rounds : "Next: round " + (p.round + 1) + " of " + p.rounds;
    }
}
