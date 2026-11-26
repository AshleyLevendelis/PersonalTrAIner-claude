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
    };
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
        out("duration.65s", LiftFlow.duration(65_000));
        out("duration.1h", LiftFlow.duration(3_723_000));
    }
}
`)

let lines: string[] = []
try {
  const files = ['LiftFlow.java', 'TodayStore.java', 'FlowCheck.java'].map(f => join(src, f))
  execFileSync('javac', ['-encoding', 'UTF-8', '-d', join(dir, 'out'), ...files], { stdio: 'pipe' })
  lines = execFileSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', join(dir, 'out'), 'uk.co.personaltrainerapp.wear.FlowCheck'], { encoding: 'utf8' }).trim().split('\n')
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
check('times read as the app prints them (1:05, 1:02:03)', is('duration.65s', '1:05') && is('duration.1h', '1:02:03'))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1) }
console.log('The watch\'s lifting flow plays through as he set it out.')
