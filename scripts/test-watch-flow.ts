/**
 * THE WATCH'S LIFTING FLOW, RUN (27 Nov 2026). His words: "next exercise up is ..., Log set, Next set, Start rest
 * timer, Next set, Next exercise", and his ruling "One tap, with options": Log set saves the set and starts the rest;
 * the rest offers Next set (or Next exercise when the next set is a new one) and, mid-exercise, Next exercise to move
 * on early, leaving that exercise's sets open on the phone.
 *
 * The decisions live in android/wear/.../LiftFlow.java, plain Java with no Android in it. This compiles THAT FILE as it
 * is, beside a stand-in for the watch's exercise record (just its fields), and plays a session through it with the
 * JDK. It needs `javac` and `java`; without them it fails, never skips.
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let ran = 0
let failures = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const PKG = 'uk/co/personaltrainerapp/wear'
const dir = mkdtempSync(join(tmpdir(), 'watch-flow-'))
const src = join(dir, 'src', PKG)
mkdirSync(src, { recursive: true })
copyFileSync(`android/wear/src/main/java/${PKG}/LiftFlow.java`, join(src, 'LiftFlow.java'))
copyFileSync(`android/wear/src/main/java/${PKG}/IntervalFlow.java`, join(src, 'IntervalFlow.java'))
// The watch's exercise record, fields only (the real TodayStore reads Android's storage, which a JDK does not have).
writeFileSync(join(src, 'TodayStore.java'), `package uk.co.personaltrainerapp.wear;
final class TodayStore {
    static final class Exercise { String id; String name; int sets; String reps; String load; int restSeconds; }
}
`)
// Plays a session: Bench 3 x 10 @ 100 kg (rest 2:00), Row 3 x 10 @ 60 kg (rest 1:30), Curl 2 x 12, no rest.
// Each line out is "key=value", read below.
writeFileSync(join(src, 'FlowCheck.java'), `package uk.co.personaltrainerapp.wear;
import java.util.*;
public final class FlowCheck {
    static final Map<String, Integer> done = new HashMap<>();
    static final Set<String> skipped = new HashSet<>();
    static final LiftFlow.State st = new LiftFlow.State() {
        public int done(TodayStore.Exercise x) { return done.getOrDefault(x.id, 0); }
        public boolean skipped(TodayStore.Exercise x) { return skipped.contains(x.id); }
        public String chosen() { return chosen; }
    };
    static String chosen;
    static TodayStore.Exercise ex(String id, String name, int sets, String reps, String load, int rest) {
        TodayStore.Exercise x = new TodayStore.Exercise();
        x.id = id; x.name = name; x.sets = sets; x.reps = reps; x.load = load; x.restSeconds = rest; return x;
    }
    static void out(String k, Object v) { System.out.println(k + "=" + v); }
    static String name(TodayStore.Exercise x) { return x == null ? "none" : x.name; }
    // The screens, as MainActivity draws them from LiftFlow.
    static void lift(String tag, List<TodayStore.Exercise> all) {
        TodayStore.Exercise x = LiftFlow.next(all, st);
        out(tag + ".exercise", name(x));
        if (x == null) return;
        int setNumber = st.done(x) + 1;
        out(tag + ".kicker", LiftFlow.liftKicker(setNumber));
        out(tag + ".log", LiftFlow.logLabel(x));
        out(tag + ".nextExercise", LiftFlow.after(all, x, st) != null);
    }
    static void logSet(List<TodayStore.Exercise> all) {
        TodayStore.Exercise x = LiftFlow.next(all, st);
        done.put(x.id, st.done(x) + 1);
        last = x.id;
    }
    static String last;
    static void rest(String tag, List<TodayStore.Exercise> all) {
        TodayStore.Exercise x = LiftFlow.next(all, st);
        out(tag + ".next", name(x));
        if (x == null) return;
        boolean same = x.id.equals(last);
        out(tag + ".line", LiftFlow.restLine(x, st.done(x) + 1, same));
        out(tag + ".button", LiftFlow.restButton(same));
        out(tag + ".moveOn", same && LiftFlow.after(all, x, st) != null);
    }
    public static void main(String[] a) {
        List<TodayStore.Exercise> all = Arrays.asList(
            ex("bench", "Bench Press", 3, "10", "100 kg", 120),
            ex("row", "Cable Row", 3, "10", "60 kg", 90),
            ex("curl", "Curl", 2, "12", "", 0));
        lift("start", all);
        logSet(all); rest("rest1", all); lift("set2", all);
        logSet(all); logSet(all); rest("rest3", all); lift("row1", all);
        logSet(all); rest("rowRest", all);
        skipped.add("row");                       // "Next exercise" during the rest, Row's sets 2 and 3 left open
        lift("afterMoveOn", all);
        out("row.done", done.get("row"));
        logSet(all); rest("curlRest", all); logSet(all);
        lift("end", all);
        // The phone had already logged all of Bench: the watch starts at the next exercise.
        done.clear(); skipped.clear(); done.put("bench", 3);
        lift("phoneAhead", all);
        // "All exercises": he picks Curl first (the bench is taken); Bench comes back once Curl is done.
        done.clear(); skipped.clear(); chosen = "curl";
        lift("picked", all);
        done.put("curl", 2);
        lift("pickedDone", all);
        chosen = null;
        // Undo: the phone still counts 3 until it deletes the set; the watch shows 2, then follows the phone again.
        out("undo.held", LiftFlow.doneCount(3, 2, 2, 3));
        out("undo.none", LiftFlow.doneCount(2, 3, -1, 3));
        out("undo.capped", LiftFlow.doneCount(1, 5, -1, 3));
        // His reps and weight (his ruling "Adjust reps and weight").
        out("reps.planned", LiftFlow.plannedReps("8-12"));
        out("reps.down", LiftFlow.stepReps(8, -1, "8-12"));
        out("reps.floor", LiftFlow.stepReps(1, -1, "10"));
        out("reps.timed", LiftFlow.timed("30s") + "," + LiftFlow.timed("8-12") + "," + LiftFlow.timed("45 s"));
        out("reps.timedStep", LiftFlow.stepReps(30, 1, "30s"));
        out("reps.text", LiftFlow.repsText(1, "10") + "|" + LiftFlow.repsText(8, "10") + "|" + LiftFlow.repsText(35, "30s"));
        out("kg.down", LiftFlow.kgText(LiftFlow.stepKg(100, -1, 2.5)));
        out("kg.dumbbell", LiftFlow.kgText(LiftFlow.stepKg(20, 1, 2)));
        out("kg.floor", LiftFlow.kgText(LiftFlow.stepKg(1, -1, 2.5)));
        out("kg.load", LiftFlow.loadWith("100 kg", 97.5) + "|" + LiftFlow.loadWith("20 kg per hand", 18));
        // His mock's set line, "3 × 10 @ 100kg" (28 Nov 2026): the count alone, and the weight split three ways.
        out("count.text", LiftFlow.countText(8, "8-12") + "|" + LiftFlow.countText(35, "30s"));
        out("load.parts", String.join(",", LiftFlow.loadParts("100 kg", 97.5)) + "|" + String.join(",", LiftFlow.loadParts("16 kg (single side)", 14))
            + "|" + String.join(",", LiftFlow.loadParts("20 kg per hand", 18)) + "|" + String.join(",", LiftFlow.loadParts("", 40)));
        // The rest: ±15s, never below zero or above ten minutes; the early buzz only on a rest of 30s or more.
        out("rest.plus", LiftFlow.nudgeRestMs(60_000, 1));
        out("rest.floor", LiftFlow.nudgeRestMs(10_000, -1));
        out("rest.cap", LiftFlow.nudgeRestMs(595_000, 1));
        out("rest.warn", LiftFlow.warnBeforeMs(90_000) + "," + LiftFlow.warnBeforeMs(20_000));
        // A PLANNED CARDIO SESSION (IntervalFlow): 4 x 3 min work, 1 min rest; and a steady 20 min.
        IntervalFlow.Phase pa = IntervalFlow.at(0, 4, 180, 60, 16);
        out("iv.start", pa.round + "," + pa.work + "," + pa.leftMs + "," + IntervalFlow.kicker(pa, "Hard") + "|" + IntervalFlow.line(pa, 16));
        IntervalFlow.Phase b = IntervalFlow.at(200_000, 4, 180, 60, 16);
        out("iv.rest", b.round + "," + b.work + "," + b.leftMs + "," + IntervalFlow.kicker(b, "Hard") + "|" + IntervalFlow.line(b, 16));
        IntervalFlow.Phase c = IntervalFlow.at(240_000, 4, 180, 60, 16);
        out("iv.round2", c.round + "," + c.work);
        out("iv.total", IntervalFlow.totalMs(4, 180, 60, 16));
        out("iv.done", IntervalFlow.at(900_000, 4, 180, 60, 16).done + "," + IntervalFlow.at(899_999, 4, 180, 60, 16).done);
        IntervalFlow.Phase d = IntervalFlow.at(60_000, 0, 0, 0, 20);
        out("iv.steady", d.work + "," + d.leftMs + "," + IntervalFlow.kicker(d, "Easy") + "|" + IntervalFlow.line(d, 20));
        StringBuilder bz = new StringBuilder();
        for (IntervalFlow.Buzz z : IntervalFlow.buzzes(3, 60, 30, 4)) bz.append(z.atMs / 1000).append(z.kind.charAt(0)).append(' ');
        out("iv.buzz", bz.toString().trim());
        StringBuilder bz2 = new StringBuilder();
        for (IntervalFlow.Buzz z : IntervalFlow.buzzes(2, 30, 5, 2)) bz2.append(z.atMs / 1000).append(z.kind.charAt(0)).append(' ');
        out("iv.buzzShortRest", bz2.toString().trim());
        StringBuilder bz3 = new StringBuilder();
        for (IntervalFlow.Buzz z : IntervalFlow.buzzes(0, 0, 0, 20)) bz3.append(z.atMs / 1000).append(z.kind.charAt(0)).append(' ');
        out("iv.buzzSteady", bz3.toString().trim());
        out("duration.65s", LiftFlow.duration(65_000));
        out("duration.1h", LiftFlow.duration(3_723_000));
    }
}
`)

let lines: string[] = []
try {
  const files = ['LiftFlow.java', 'IntervalFlow.java', 'TodayStore.java', 'FlowCheck.java'].map(f => join(src, f))
  execFileSync('javac', ['-encoding', 'UTF-8', '-d', join(dir, 'out'), ...files], { stdio: 'pipe' })
  lines = execFileSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', join(dir, 'out'), 'uk.co.personaltrainerapp.wear.FlowCheck'], { encoding: 'utf8' }).trim().split(/\r?\n/)
} catch (e) {
  console.error(`  could not compile or run the watch's flow with the JDK: ${String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 400)}`)
}
const got = Object.fromEntries(lines.map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] }))
const is = (k: string, v: string) => got[k] === v

console.log('\n1. "Next exercise up is ..." and the one tap')
check('the session opens on its first exercise, as "next exercise up"', is('start.exercise', 'Bench Press') && is('start.kicker', 'NEXT EXERCISE UP'), got)
check('one tap logs the set and starts the plan\'s rest: "Log set · rest 2:00"', is('start.log', 'Log set · rest 2:00'))
check('"Next exercise" is offered while another exercise is still to come', is('start.nextExercise', 'true'))

console.log('\n2. The rest: "Next set" or "Next exercise"')
check('after set 1 the rest says what comes next and offers "Next set"', is('rest1.line', 'Then set 2 of 3 · Bench Press') && is('rest1.button', 'Next set'))
check('...and "Next exercise" to move on early', is('rest1.moveOn', 'true'))
check('set 2 is "next set", not a new exercise', is('set2.kicker', 'NEXT SET'))
check('after the last set of an exercise the rest names the next one, its sets, reps and weight', is('rest3.line', 'Next exercise up: Cable Row · 3 × 10 @ 60 kg') && is('rest3.button', 'Next exercise'))
check('...and offers no second "Next exercise" (the main button already is it)', is('rest3.moveOn', 'false'))
check('the next exercise opens on its first set', is('row1.exercise', 'Cable Row') && is('row1.kicker', 'NEXT EXERCISE UP'))

console.log('\n3. Moving on early')
check('"Next exercise" mid-exercise goes to the one after', is('afterMoveOn.exercise', 'Curl'))
check('...and the sets left behind are not counted as done (they stay open on the phone)', is('row.done', '1'))
check('the last exercise offers no "Next exercise"', is('afterMoveOn.nextExercise', 'false'))
check('an exercise with no rest says "Log set" alone', is('afterMoveOn.log', 'Log set'))
check('the session ends once every exercise is done or moved on from', is('end.exercise', 'none'))

console.log('\n4. The phone wins')
check('sets the phone already logged are skipped on the watch', is('phoneAhead.exercise', 'Cable Row'))
console.log('\n5. Any order ("All exercises")')
check('a picked exercise comes first, out of the plan\'s order', is('picked.exercise', 'Curl') && is('picked.kicker', 'NEXT EXERCISE UP'))
check('...and once it is done the plan\'s order resumes', is('pickedDone.exercise', 'Bench Press'))

console.log('\n6. Undo')
check('an undone set is held off the count until the phone has deleted it', is('undo.held', '2'))
check('with no undo waiting, the higher of the phone\'s and the watch\'s counts', is('undo.none', '3'))
check('never more than the sets prescribed', is('undo.capped', '3'))

console.log('\n7. Reps and weight as done (his "Adjust reps and weight")')
check('the planned count is the first of a range, as the phone\'s box saves it', is('reps.planned', '8'))
check('a rep step is one, never below one', is('reps.down', '7') && is('reps.floor', '1'))
check('a held exercise counts in seconds, stepped in fives', is('reps.timed', 'true,false,true') && is('reps.timedStep', '35'))
check('the count reads as words ("1 rep", "8 reps", "35s")', is('reps.text', '1 rep|8 reps|35s'))
check('the weight steps by the implement\'s notch (2.5 a bar, 2 a dumbbell), never below zero', is('kg.down', '97.5') && is('kg.dumbbell', '22') && is('kg.floor', '0'))
check('the load keeps its words ("97.5 kg", "18 kg per hand")', is('kg.load', '97.5 kg|18 kg per hand'))

check('the set line prints the count alone ("8", "35s")', is('count.text', '8|35s'), got['count.text'])
check('the weight splits into the number he taps, its unit, and its other words ("single side", "per hand")',
  is('load.parts', '97.5,kg,|14,kg,single side|18,kg,per hand|40,kg,'), got['load.parts'])

console.log('\n8. The rest')
check('+15s adds fifteen seconds', is('rest.plus', '75000'))
check('−15s never goes below zero, +15s never past ten minutes', is('rest.floor', '0') && is('rest.cap', '600000'))
check('a short buzz 10s before the end, on a rest of 30s or more only', is('rest.warn', '10000,0'))
console.log('\n9. A planned cardio session on the wrist (IntervalFlow)')
check('it opens on round 1 of work, the whole 3 minutes left, "WORK" and "Round 1 of 4"', is('iv.start', '1,true,180000,WORK|Round 1 of 4'))
check('20s into the rest: "REST", 40s left, and what comes next', is('iv.rest', '1,false,40000,REST|Next: round 2 of 4'))
check('a minute\'s rest later it is round 2 of work', is('iv.round2', '2,true'))
check('the session is 4 × 3 min with three rests between (no rest after the last): 15 min', is('iv.total', '900000'))
check('...and it is done at 15 minutes, not a moment before', is('iv.done', 'true,false'))
check('a steady session counts its minutes down under its effort', is('iv.steady', 'true,1140000,EASY|20 min session'))
check('the buzzes: rest at each round\'s end, 3-2-1 before work after a rest of 10s or more, work, and the end', is('iv.buzz', '60r 87c 88c 89c 90w 150r 177c 178c 179c 180w 240e'), got['iv.buzz'])
check('...no countdown after a rest under 10s', is('iv.buzzShortRest', '30r 35w 65e'), got['iv.buzzShortRest'])
check('...and a steady session buzzes once, at its end', is('iv.buzzSteady', '1200e'))
check('times read as the app prints them (1:05, 1:02:03)', is('duration.65s', '1:05') && is('duration.1h', '1:02:03'))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1) }
console.log('The watch\'s lifting flow plays through as he set it out.')
