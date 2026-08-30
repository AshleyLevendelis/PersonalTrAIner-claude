/**
 * Gate for the coach not promising what it cannot do.
 *
 * Root incident: Ashley told the coach, in advance, that she was skipping her
 * weights day for Muay Thai. It replied "Since you're skipping the weights,
 * I'll make sure today is marked as a rest day for lifting so we stay on
 * track" — and did nothing, because no tool touched a day's status at all.
 * Worse than a no-op: classifyDay ends `dateStr < todayStr ? 'missed' : 'due'`
 * with nothing between, so the day she announced IN ADVANCE showed as missed
 * the next morning, and the Muay Thai was recorded nowhere.
 *
 * The lesson was already written down and ignored. update_workout_schedule is
 * disabled with this in its own description: "It used to write to a profile
 * field the app doesn't actually render from, so schedule 'changes' looked
 * applied in chat but never showed up on the Exercise tab."
 *
 * Static text checks rather than imports, for the reason
 * test-chat-app-reality.ts already gives: a Deno edge function can't import
 * across the src/lib boundary, so this is the next-best thing to "cannot
 * drift".
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { FIRST_RUN_QUICK_REPLIES, FIRST_RUN_QUICK_REPLIES_AHEAD, buildFirstRunIntro } from '../src/lib/first-run-intro'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) console.log(`  ok: ${label}`)
  else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
const hook = readFileSync(join(ROOT, 'src/hooks/useTrainingWeek.ts'), 'utf8')

console.log('\n1. Every tool the coach is offered can actually be executed')
{
  // The general form of the bug. A tool the model can see but nothing
  // implements is a promise with no delivery — the model will call it, the
  // call will fall through, and the reply will describe an action that never
  // happened. Currently 22 declared, all wired.
  const declared = [...chat.matchAll(/^\s*name:\s*"([a-z_]+)",\s*$/gm)].map(m => m[1])
  const executed = new Set([...chat.matchAll(/name\s*===\s*"([a-z_]+)"/g)].map(m => m[1]))
  const orphans = declared.filter(n => !executed.has(n))
  check(`all ${declared.length} declared tools have an executor branch`, orphans.length === 0, orphans)
  check('...and there are tools to check, so this has teeth', declared.length > 10, declared.length)
}

console.log('\n2. Skipping a day for something else is a tool, not a sentence')
{
  check('swap_session_for_activity is declared', /name:\s*"swap_session_for_activity"/.test(chat))
  check('...and executed', /name === "swap_session_for_activity"/.test(chat))

  // The update_workout_schedule trap: write only where the app reads. The
  // Exercise tab's week strip reads workout_sessions (via getWeeklyDashboard);
  // the streak reads cardio_logs. Anything else is a write nobody renders.
  const body = chat.slice(chat.indexOf('name === "swap_session_for_activity"'))
    .slice(0, chat.slice(chat.indexOf('name === "swap_session_for_activity"')).indexOf('if (name === "log_meal")'))
  check('it writes to workout_sessions — what the week strip reads', body.includes('workout_sessions'))
  check('it writes to cardio_logs — what the streak reads', body.includes('cardio_logs'))
  check('it does NOT write to fitness_profiles, the field update_workout_schedule died on',
    !body.includes('fitness_profiles'))

  // A failed write must never produce a success sentence. This is the exact
  // shape of the original defect, one layer down.
  check('a failed write reports failure rather than claiming success',
    /!dbSuccess[\s\S]{0,120}couldn't/.test(body))
}

console.log('\n3. The prompt forbids claiming an untaken action')
{
  check('the honesty rule is present', chat.includes('NEVER CLAIM AN ACTION YOU DID NOT TAKE'))
  check('...it names the tool to use instead', /swap_session_for_activity/.test(chat.slice(chat.indexOf('NEVER CLAIM AN ACTION'), chat.indexOf('NEVER CLAIM AN ACTION') + 1600)))
  check('...and tells it to say so plainly when it has no tool',
    /cannot do it from chat|can't do that from here/i.test(chat.slice(chat.indexOf('NEVER CLAIM AN ACTION'), chat.indexOf('NEVER CLAIM AN ACTION') + 1600)))
}

console.log('\n4. The app can render what the tool writes')
{
  // The other half of the update_workout_schedule trap: a column written by
  // the edge function that no client code reads is the same failure wearing
  // different clothes.
  check("classifyDay reads swapped_for_activity", hook.includes('swapped_for_activity'))
  check("'swapped' is a real day state", /DayGlyphState[\s\S]{0,200}'swapped'/.test(hook))
  check('the tally predicate excludes it', /countsTowardWeekTally[\s\S]{0,600}!== 'swapped'/.test(hook))

  // Every glyph/label map is Record<DayGlyphState, …>, so the compiler already
  // forces them to cover the new state — but a missing entry would render an
  // empty cell or announce an identifier to a screen reader, so it is worth
  // saying out loud which files carry them.
  // THE MAPS MOVED, and this check moved with them. The week strip now exists
  // on two tabs — Home's record and Exercise's navigator — so the glyphs and
  // their spoken labels live in src/lib/week-glyphs.ts, imported by both. A
  // mark that meant one thing on Home and another on Exercise would be worse
  // than having no strip on Home at all.
  // ONE definer, and it is the shared module. The strips import; they no longer
  // carry a copy, so looking for the literal in them is looking in the wrong
  // place — the check below asserts the import instead.
  for (const rel of ['src/lib/week-glyphs.ts']) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    check(`${rel} has a glyph for it`, /swapped:\s*'/.test(src))
  }
  const glyphs = readFileSync(join(ROOT, 'src/lib/week-glyphs.ts'), 'utf8')
  check('the screen-reader label is English, not the identifier',
    /swapped:\s*'swapped for another activity'/.test(glyphs))
  // ...and that BOTH strips read that one module rather than a local copy.
  // WeekStrip.tsx was deleted — it was dead code no file imported, and the
  // shared-vocabulary extraction had been wired into it rather than into the
  // strip users see. WeekContextRow.tsx is the live one.
  for (const rel of ['src/components/exercise/WeekContextRow.tsx', 'src/components/HomeWeekStrip.tsx']) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    check(`${rel} imports the shared vocabulary rather than redefining it`,
      /from '@\/lib\/week-glyphs'/.test(src) && !/const GLYPH\s*[:=]/.test(src))
  }
}

console.log('\n5. The migration exists and is additive')
{
  const migration = readFileSync(join(ROOT, 'supabase/migrations/20260824210000_add_swapped_for_activity.sql'), 'utf8')
  check('adds the column with IF NOT EXISTS', /ADD COLUMN IF NOT EXISTS swapped_for_activity/.test(migration))
  check('no destructive statement', !/DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM/i.test(migration))
}

console.log('\n6. The first-run starter chips only offer things that work')
{
  // A quick-reply chip is a promise in the app's OWN voice, not the model's —
  // which makes it the strongest form of the bug this file exists for. The
  // model at least has the honesty rule; a hardcoded chip has nothing. Tapping
  // one is the new user's first-ever sentence to the coach, so a chip that
  // lands on a declining stub teaches them, in their first interaction, that
  // the coach says no to obvious asks.
  //
  // Two independent checks, because neither alone is enough:
  //   (a) every chip must NAME the tool it routes to, and that tool must be
  //       declared, executed, and not one of the two stubs. This is the check
  //       with teeth: adding a chip without declaring where it lands fails.
  //   (b) a keyword screen for schedule/volume vocabulary. Weaker — routing is
  //       the model's decision and no static check can prove it — but it
  //       catches the chip that was never thought about at all.
  const ui = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  // Both lists: the ahead variant renders for anyone whose first session
  // is not today, and an unvetted chip there is just as live as one here.
  const chips = [...new Set([...FIRST_RUN_QUICK_REPLIES, ...FIRST_RUN_QUICK_REPLIES_AHEAD])]
  check('there are chips to check, so this has teeth', chips.length > 0, chips.length)

  // (a) Each chip's destination, declared here on purpose. `null` = answered
  // from the plan context the request already carries, with no tool call.
  const CHIP_DESTINATION: Record<string, string | null> = {
    'Talk me through today': null,
    'Talk me through day one': null,
    'Swap an exercise': 'propose_exercise_swap',
    "There's a food I won't eat": 'record_fact',
  }
  // The declining set is DERIVED from the function, not listed here. It was
  // listed here, and §2.4 wired both of the tools on that list — so the list
  // became a claim about the source that the source had stopped making, and
  // the check guarding it went red for being right. A handler that declines
  // says so in its own reply string; read that instead. The window is cut at
  // the NEXT handler so one decliner cannot make its neighbour look like one.
  const handlerAt = [...chat.matchAll(/if \(name === "([a-z_]+)"\)/g)]
  const decliningStubs = handlerAt.filter((m, i) => {
    const body = chat.slice(m.index!, handlerAt[i + 1]?.index ?? m.index! + 2000)
    return /coming in an update soon/.test(body)
  }).map(m => m[1])
  check('something still declines, so this check has teeth', decliningStubs.length > 0, decliningStubs)
  const declared = new Set([...chat.matchAll(/^\s*name:\s*"([a-z_]+)",\s*$/gm)].map(m => m[1]))
  const executed = new Set([...chat.matchAll(/name\s*===\s*"([a-z_]+)"/g)].map(m => m[1]))

  for (const chip of chips) {
    if (!(chip in CHIP_DESTINATION)) {
      check(`chip "${chip}" declares which tool it routes to`, false)
      continue
    }
    const tool = CHIP_DESTINATION[chip]
    if (tool === null) {
      check(`chip "${chip}" is answered from context, no tool needed`, true)
      continue
    }
    check(`chip "${chip}" -> ${tool} is declared`, declared.has(tool))
    check(`chip "${chip}" -> ${tool} has an executor`, executed.has(tool))
    check(`chip "${chip}" -> ${tool} is not a declining stub`, !decliningStubs.includes(tool))
  }

  // (b) Vocabulary that would pull the model toward a stub whatever the chip
  // was written to mean. Deliberately narrow: "3 sets of squats" is a LOG and
  // works fine, so bare "sets" is not the trigger — a change verb next to it
  // is.
  const PULLS_TOWARD: Array<[RegExp, string]> = [
    [/\bre-?schedul/i, 'propose_schedule_change'],
    [/\bschedule\b/i, 'propose_schedule_change'],
    [/\brest day\b/i, 'propose_schedule_change'],
    [/\bday off\b/i, 'propose_schedule_change'],
    [/\b(add|drop|move|remove|clear|skip)\s+(a\s+|the\s+)?(training\s+|gym\s+)?day\b/i, 'propose_schedule_change'],
    [/\bvolume\b/i, 'propose_volume_change'],
    [/\b(more|fewer|less|extra|cut|reduce|increase|add|drop)\s+\w*\s*\breps?\b/i, 'propose_volume_change'],
    [/\b(more|fewer|less|extra|cut|reduce|increase|add|drop)\s+\w*\s*\bsets?\b/i, 'propose_volume_change'],
    [/\b(ban|never give me|blacklist)\b/i, 'ban_exercise'],
  ]
  // The rule is unchanged — a chip must not invite a request the app then
  // refuses. What changed is which tools refuse: volume and schedule now
  // execute, so that vocabulary is no longer an overclaim, and the check
  // says so by asking the derived set rather than by having those lines
  // deleted (deleting them would have quietly retired the rule as well).
  for (const chip of chips) {
    const hit = PULLS_TOWARD.find(([re]) => re.test(chip))
    check(`chip "${chip}" doesn't invite a tool that declines`,
      hit === undefined || !decliningStubs.includes(hit[1]), hit?.[1])
  }

  // The chips only render if they are on the LAST message — getQuickReplies-
  // ForLastMessage reads messages[messages.length - 1].quickReplies and
  // nothing else. Attaching them to the first or middle intro message is a
  // silent no-op, which is exactly the kind of half-landed feature that keeps
  // recurring here.
  const squat = { focus: 'Squat & Carry', movements: 'Barbell Squats, Loaded Backpack Walk…' }
  const intro = buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' })

  // ONE MESSAGE, on Ashley's ruling after seeing four on a real phone. The
  // count is asserted because the pressure is always to add "just one more
  // line" back, and four is where this started.
  check('the opener is a single message', intro.length === 1, intro.length)
  check('it carries the chips — the only message that can render them',
    (intro[0].quickReplies?.length ?? 0) > 0, intro.map(m => m.quickReplies?.length ?? 0))
  check('every intro message has words in it', intro.every(m => m.content.trim().length > 0))

  // THE WORDING SHE REJECTED, held so it cannot come back: "as far as the
  // user is concerned it is a person, so I dont like this wording." Naming
  // the thing it is pretending not to be is the one line that breaks it.
  const allCopy = [
    ...buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' }),
    ...buildFirstRunIntro('Hey Ashley', { ...squat, when: 'whenever' }),
    ...buildFirstRunIntro('Hey Ashley', { ...squat, when: 'Monday' }),
    ...buildFirstRunIntro('Hey Ashley', null),
  ].map(m => m.content).join(' ')
  check('the opener never says "like a person" / "like a real person"',
    !/like (you.?d talk to )?an? (real )?person/i.test(allCopy), allCopy.slice(0, 120))

  // DAY ONE HAS TO BE TRUE FOR THIS USER. Ashley's sketch was "day one starts
  // right now"; that is wrong for anyone whose first training day is not
  // today, and the code it replaced was worse there — a brand-new user with
  // no session today was asked "how's the recovery going?".
  const today = buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' })[0].content
  const later = buildFirstRunIntro('Hey Ashley', { ...squat, when: 'Monday' })[0].content
  check('a session today is said to be today', /day one starts today/i.test(today), today)
  check('a session later names the day instead', /day one is Monday/i.test(later), later)
  check('...and never claims it starts today', !/starts today/i.test(later), later)
  check('the no-session fallback invents no session',
    !/day one/i.test(buildFirstRunIntro('Hey Ashley', null)[0].content))

  // The chip has to agree with the sentence above it. "Talk me through today"
  // under "day one is Monday" is the app contradicting itself on one screen.
  const chipsFor = (when: string | null) =>
    buildFirstRunIntro('Hey Ashley', when === null ? null : { ...squat, when })[0].quickReplies ?? []
  check('a session today offers "Talk me through today"',
    chipsFor('today').includes('Talk me through today'), chipsFor('today'))
  check('a session later offers "Talk me through day one" instead',
    chipsFor('Monday').includes('Talk me through day one') &&
    !chipsFor('Monday').includes('Talk me through today'), chipsFor('Monday'))

  // The ellipsis already ends the sentence; a full stop after it reads as a
  // typo, and it shipped that way ("Neutral-Grip Dumbbell Press….").
  const truncated = buildFirstRunIntro('Hey Ashley', { focus: 'X', movements: 'A, B, C…', when: 'today' })[0].content
  check('a truncated movement list is not followed by a full stop',
    !truncated.includes('….'), truncated)
  for (const c of [today, later]) {
    check(`the session is named in the opener — "${c.slice(0, 40)}…"`,
      c.includes('Squat & Carry') && c.includes('Barbell Squats'))
  }

  // ...and the component actually renders the builder's output in order. The
  // builder being right is worthless if ChatAssistant hand-rolls the array
  // beside it — that is the two-halves defect this repo keeps hitting.
  check('ChatAssistant builds the intro from buildFirstRunIntro',
    /setMessages\(buildFirstRunIntro\(/.test(ui))
  check('...and does not also hand-roll the chips beside it',
    !/quickReplies:\s*FIRST_RUN_QUICK_REPLIES/.test(ui))

  // Why the restriction exists, asserted rather than assumed — and now the
  // other direction too. §2.4 moved volume and schedule OFF the declining
  // list, so the gate has to state that as a fact about the source rather
  // than let their absence pass silently: a re-disabled tool must fail here,
  // not just stop being checked.
  for (const wired of ['propose_volume_change', 'propose_schedule_change']) {
    check(`${wired} is declared`, declared.has(wired))
    check(`${wired} has a handler`, executed.has(wired))
    check(`${wired} no longer declines`, !decliningStubs.includes(wired), decliningStubs)
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll coach-promise checks passed.\n')
