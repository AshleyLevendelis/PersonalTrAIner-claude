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
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { FIRST_RUN_QUICK_REPLIES, FIRST_RUN_QUICK_REPLIES_AHEAD, buildFirstRunIntro, planShapeFromMesocycle, type FirstRunPlanShape } from '../src/lib/first-run-intro'

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

console.log('\n3b. Resting a day is a tool too, and an intention is not an appointment')
{
  // 31 Aug 2026, live: Ashley said "Rest day today" and the coach replied "I
  // will mark today as a rest day for you". Nothing was marked — §2's tool
  // needs an ACTIVITY, and resting is the answer with no activity in it. The
  // honesty rule above already forbade that sentence in as many words; it had
  // nothing to call, and a rule with no tool behind it is one the model routes
  // around. So this section asserts the tool exists, not that the rule is
  // louder.
  check('propose_rest_day is declared', /name:\s*"propose_rest_day"/.test(chat))
  check('...and has a handler', /name === "propose_rest_day"/.test(chat))

  const body = chat.slice(chat.indexOf('name === "propose_rest_day"'), chat.indexOf('name === "log_workout_session"'))
  check('...which PROPOSES rather than writing — Ashley asked to confirm first',
    /proposal:[\s\S]{0,120}kind: "propose_rest_day"/.test(body), body.slice(0, 200))
  check('...and the server writes nothing itself',
    !body.includes('workout_sessions') && !body.includes('PATCH'), body.slice(0, 200))

  const rule = chat.slice(chat.indexOf('NEVER CLAIM AN ACTION'), chat.indexOf('NEVER CLAIM AN ACTION') + 2600)
  check('the honesty rule names propose_rest_day as the thing to call',
    /propose_rest_day/.test(rule), rule.slice(0, 200))
  check('...and says nothing has happened until the user confirms',
    /Until they do, nothing has happened/i.test(rule))

  // THE SECOND LIE IN THE SAME CONVERSATION. "Got tomorrow morning locked in
  // for your Push & Press session" — nothing anywhere stores an intended
  // training time, so that sentence was true of no field, no screen and no
  // row. Distinct from the rest-day lie: this one has no tool to add, because
  // there is nothing it would write to. The fix is the model not saying it.
  check('the prompt forbids "locked in" and its family',
    /INTENTIONS ARE NOT APPOINTMENTS/.test(chat))
  for (const phrase of ['locked in', 'booked in', 'scheduled']) {
    check(`...naming "${phrase}" specifically`, rule.includes(phrase), rule.slice(-400))
  }

  // ...and the client half. A proposal kind the server can emit but the
  // client cannot build is a card that never appears — the model would call
  // the tool, the user would see nothing, and the day would still show missed.
  const chatUi = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  check('the client builds the card', /buildRestDayProposal/.test(chatUi))
  check('...dispatches the proposal to it',
    /kind === 'propose_rest_day'[\s\S]{0,200}buildRestDayProposal/.test(chatUi))
  check('...executes it on confirm',
    /row\.kind === 'propose_rest_day'[\s\S]{0,200}executeRestDay/.test(chatUi))
  check('...and can undo it', /undoRestDay/.test(chatUi))

  // The write has to land where the week strip reads, same trap as §2.
  const exec = readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8')
  const tracking = readFileSync(join(ROOT, 'src/lib/daily-tracking.ts'), 'utf8')
  check('the executor goes through setDeliberateRest', /executeRestDay[\s\S]{0,600}setDeliberateRest/.test(exec))
  check('...which writes to workout_sessions — what the week strip reads',
    /setDeliberateRest[\s\S]{0,1800}workout_sessions/.test(tracking))
  check('...and reports a failed write rather than claiming success',
    /setDeliberateRest[\s\S]{0,400}if \(!ok\)[\s\S]{0,200}failed:/.test(exec), 'executeRestDay')

  // And the column exists. A client that reads a field no migration created
  // is the same two-halves defect from the other end.
  const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
    .join('\n')
  check('a migration adds deliberate_rest', /ADD COLUMN IF NOT EXISTS deliberate_rest/.test(migrations))
  check('classifyDay reads it', hook.includes('deliberate_rest'))
}

console.log('\n3c. A problem you can fix is never filed as a note instead')
{
  // record_fact's kind list includes "hard_constraint", so "I can't train on
  // Tuesdays" matches it on the words alone — and filing it only writes it
  // down while the plan carries on prescribing Tuesday. Two tools competing
  // for one sentence, with no rule saying which wins, is how the coach ends
  // up offering to REMEMBER a problem it has a tool to FIX.
  const memory = chat.slice(chat.indexOf('MEMORY & GOALS'), chat.indexOf('MEMORY & GOALS') + 4000)
  check('the memory rules resolve availability in favour of the schedule tool',
    /SCHEDULE CHANGE, NOT A MEMORY NOTE/.test(memory))
  check('...naming propose_schedule_change as the answer',
    /propose_schedule_change/.test(memory))
  check('...and propose_rest_day for a single day',
    /propose_rest_day/.test(memory))
  // The escape hatch has to stay open, or a genuinely unschedulable life
  // ("my shifts change every week") would have nowhere to go at all.
  check('...while leaving room for a constraint no schedule can express',
    /shifts change every week/.test(memory))
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
  // WITH a plan shape, because that is what a real user has. Without one the
  // structure message has nothing to say and folds into the welcome, which is
  // correct behaviour and two messages — see buildFirstRunIntro's own note.
  const fullShape: FirstRunPlanShape = { totalWeeks: 16, blocks: 4, startsLight: true }
  const intro = buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' }, fullShape)

  // THREE MESSAGES, on Ashley's ruling of 31 Aug 2026 — and this check used to
  // say ONE, on her ruling before that. Both are recorded because the reversal
  // is the interesting part: she cut four to one after reading it on a real
  // phone ("we dont need to say that much"), then later asked for a welcome
  // that also covers how the plan is structured and that they can ask about
  // anything in health and fitness. That does not fit in one bubble.
  //
  // Three of the four original messages stay cut regardless, and each for its
  // own reason: the "I'm your coach" line (the header says it permanently),
  // "talk to me like you'd talk to a person" (her objection, and the right
  // one), and "nothing moves without your say-so" (already said in onboarding;
  // twice made it a disclaimer). The count is still asserted because the
  // pressure is always to add one more line, and four is where this started.
  check('the opener is three messages', intro.length === 3, intro.length)
  check('...and every one of them has words in it', intro.every(m => m.content.trim().length > 0))

  // THE CHIPS ONLY RENDER ON THE LAST MESSAGE. getQuickRepliesForLastMessage
  // reads messages[messages.length - 1].quickReplies and nothing else, so any
  // attached above are a silent no-op. This was true by accident while the
  // intro was one message; with three it is a real constraint again.
  check('the last message carries the chips', (intro[intro.length - 1].quickReplies?.length ?? 0) > 0,
    intro.map(m => m.quickReplies?.length ?? 0))
  check('...and no earlier message pretends to',
    intro.slice(0, -1).every(m => m.quickReplies === undefined),
    intro.map(m => m.quickReplies?.length ?? 0))

  // THE ONE CAPABILITY THE COPY MUST NOT OFFER. 23 of the coach's 24 tools
  // act; log_meal is the exception and still replies that meal logging isn't
  // live yet. The three-message welcome invites the user to ask about "food",
  // which is honest — what they will and won't eat is handled, and a food
  // dislike is one of the three chips. An invitation to LOG a meal is not: it
  // would fail on the first thing a new user tried, which is the worst
  // possible place for the app's one declining tool to surface.
  const introCopy = intro.map(m => m.content).join(' ')
  check('the welcome never invites a meal log',
    !/log (a |your )?(meal|breakfast|lunch|dinner)|what you (ate|eat)|track your food/i.test(introCopy),
    introCopy)
  // ...and the reason that check can be trusted: log_meal really is still the
  // declining one. If it ever starts working, this comment is the thing that
  // says the copy may open up.
  check('...because log_meal is still the tool that declines',
    /log_meal[\s\S]{0,4000}(isn't live|not live)/i.test(chat))

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
  // Day one moved to the LAST message when the intro became three. Reading
  // [0] here went red for copy that was perfectly correct — the same
  // wrong-place failure the sign-in gate hit today.
  const lastContent = (when: string | null) => {
    const msgs = buildFirstRunIntro('Hey Ashley', when === null ? null : { ...squat, when })
    return msgs[msgs.length - 1].content
  }
  const today = lastContent('today')
  const later = lastContent('Monday')
  check('a session today is said to be today', /day one is today/i.test(today), today)
  check('a session later names the day instead', /day one is Monday/i.test(later), later)
  check('...and never claims it starts today', !/starts today/i.test(later), later)
  check('the no-session fallback invents no session', !/day one/i.test(lastContent(null)))

  // The chip has to agree with the sentence above it. "Talk me through today"
  // under "day one is Monday" is the app contradicting itself on one screen.
  const chipsFor = (when: string | null) => {
    const msgs = buildFirstRunIntro('Hey Ashley', when === null ? null : { ...squat, when })
    return msgs[msgs.length - 1].quickReplies ?? []
  }
  check('a session today offers "Talk me through today"',
    chipsFor('today').includes('Talk me through today'), chipsFor('today'))
  check('a session later offers "Talk me through day one" instead',
    chipsFor('Monday').includes('Talk me through day one') &&
    !chipsFor('Monday').includes('Talk me through today'), chipsFor('Monday'))

  // The ellipsis already ends the sentence; a full stop after it reads as a
  // typo, and it shipped that way ("Neutral-Grip Dumbbell Press….").
  const truncatedMsgs = buildFirstRunIntro('Hey Ashley', { focus: 'X', movements: 'A, B, C…', when: 'today' })
  const truncated = truncatedMsgs[truncatedMsgs.length - 1].content
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

  // ---------------------------------------------------------------------
  // THE PROGRAMME HAS A SHAPE, AND THE OPENER SAYS SO.
  //
  // Ashley, 31 Aug 2026: the opener named day one and nothing else, so
  // someone who read it and closed the app never learned the plan HAS a
  // shape. buildCoachPhaseBrief covers this the moment they SPEAK; this is
  // the half that lands before they do.
  //
  // Every number in it is read off the mesocycle. The checks below are as
  // much about what it must NOT say — no weeks, no blocks, no "steps up" —
  // when the plan can't back the claim.
  // ---------------------------------------------------------------------
  // ALL the messages joined: the shape is now spread across the welcome (how
  // long) and the structure message (what the blocks do), so reading [0]
  // alone would miss half of what these checks are about.
  const shaped = (shape: FirstRunPlanShape | null) =>
    buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' }, shape).map(m => m.content).join(' ')

  const sixteen: FirstRunPlanShape = { totalWeeks: 16, blocks: 4, startsLight: false }
  const withShape = shaped(sixteen)
  check('the opener says how long the plan runs', /16 weeks/.test(withShape), withShape)
  check('...and how many blocks it has', /4 blocks/.test(withShape), withShape)
  check('...and that the loads climb', /loads climb/i.test(withShape), withShape)
  check("...and promises to say when it changes", /tell you each time it changes/i.test(withShape), withShape)
  // THE ORDER FLIPPED, on Ashley's 31 Aug ruling, and this check flipped with
  // it. It used to assert day one came FIRST — momentum leading, shape as
  // context. The three-message welcome she asked for leads with what they now
  // have and lands on day one, so the assertion is inverted rather than
  // deleted: the ordering is still pinned, just to the order she now wants.
  check('day one lands LAST, after the welcome and the shape',
    withShape.indexOf('16 weeks') < withShape.indexOf('Squat & Carry'), withShape)

  // A calibration week is capped ON PURPOSE, so an unexplained easy week one
  // reads as the app getting it wrong. This is the branch that has to speak.
  const light = shaped({ totalWeeks: 16, blocks: 4, startsLight: true })
  check('a calibration first week is named as light',
    /start light on purpose/i.test(light), light)
  check('...and says what it is for', /find your working weights/i.test(light), light)
  check('a normal first week is NOT called light',
    !/light/i.test(withShape), withShape)

  // NO PLAN, NO NUMBERS. The same rule the day-one half already follows.
  const noShape = shaped(null)
  check('no mesocycle invents no week count', !/\\d+ weeks/.test(noShape), noShape)
  check('...and no block count', !/blocks/.test(noShape), noShape)
  check('...and still says day one', /Squat & Carry/.test(noShape), noShape)
  const oneWeek = shaped({ totalWeeks: 1, blocks: 1, startsLight: false })
  check('a one-week plan describes no shape', !/\\d+ weeks/.test(oneWeek), oneWeek)

  // Blocks are only mentioned when there is more than one, and "steps up as
  // you go" is a claim about later blocks — it must not be made without them.
  const oneBlock = shaped({ totalWeeks: 6, blocks: 1, startsLight: false })
  check('a single-block plan claims no blocks', !/blocks/.test(oneBlock), oneBlock)
  check('...and does not claim it steps up', !/getting harder/i.test(oneBlock), oneBlock)
  check('...but still says how long it runs', /6 weeks/.test(oneBlock), oneBlock)

  // A DESCRIBABLE PLAN GETS THREE MESSAGES; ONE WITH NOTHING TO DESCRIBE GETS
  // TWO. The structure message exists to say what the blocks do — with no
  // blocks it has one clause left, which folds into the welcome rather than
  // shipping as a lonely bubble between two full ones. Three is what Ashley
  // chose for the plan she has, not a quota to pad out.
  check('a plan with blocks gets three messages',
    buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' }, sixteen).length === 3)
  check('...and a plan with nothing to describe gets two, not a stub',
    buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' }, null).length === 2)

  // THE DERIVATION IS TESTED, NOT GREPPED FOR. The first version of this
  // block searched ChatAssistant.tsx for `totalWeeks: mesocycle.length` and
  // stayed GREEN when the function was mutated to a hardcoded 16 — because
  // buildCoachPhaseBrief's own wiring, 400 lines away, contains that exact
  // string. A second version scoped the search to the function and still
  // passed a mutation that assigned `blocks = 4` while leaving the Set
  // expression sitting unused beside it. Both are the same defect: a check
  // satisfied by something other than the thing it is about. So the
  // derivation moved into first-run-intro.ts as a pure function and is now
  // run against real plans, where a wrong number is a wrong number.
  const meso = (weeks: number, blocksIn: number, calibration: boolean) =>
    Array.from({ length: weeks }, (_, i) => ({
      week_number: i + 1,
      block_number: Math.floor(i / Math.ceil(weeks / blocksIn)) + 1,
      isCalibrationWeek: calibration && i === 0,
    }))

  const derived16 = planShapeFromMesocycle(meso(16, 4, true))
  check('the week count is the plan\'s own length', derived16?.totalWeeks === 16, derived16)
  check('the block count is the plan\'s own blocks', derived16?.blocks === 4, derived16)
  check('a calibration week 1 is carried through', derived16?.startsLight === true, derived16)

  const derived12 = planShapeFromMesocycle(meso(12, 3, false))
  check('a different plan gives different numbers',
    derived12?.totalWeeks === 12 && derived12?.blocks === 3, derived12)
  check('...and a non-calibration week 1 is not called light',
    derived12?.startsLight === false, derived12)
  check('an empty mesocycle derives nothing at all',
    planShapeFromMesocycle([]) === null)
  check('an unnumbered plan still reads week one off array order',
    planShapeFromMesocycle([{ isCalibrationWeek: true }, {}])?.startsLight === true)

  // End to end: a real plan in, the right sentence out.
  const endToEnd = buildFirstRunIntro('Hey Ashley', { ...squat, when: 'today' },
    planShapeFromMesocycle(meso(12, 3, false))).map(m => m.content).join(' ')
  check('a 12-week plan says twelve weeks, not sixteen',
    /12 weeks in 3 blocks/.test(endToEnd) && !/16/.test(endToEnd), endToEnd)

  // ...and the component actually calls it, on the mesocycle it was handed.
  check('ChatAssistant derives the shape from its own mesocycle prop',
    /buildFirstRunIntro\(greetName\(\), firstRunSessionBrief\(\), planShapeFromMesocycle\(mesocycle\)\)/.test(ui))

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

console.log('\nWANTING TO TRAIN IS NOT A SCHEDULE CHANGE\n')
{
  // MEASURED LIVE, 1 Sep 2026, from Ashley's screenshots. "I want to work
  // out today" made the coach call propose_schedule_change, and the app
  // rebuilt SIXTEEN WEEKS of her plan. Her follow-up — "not the schedule the
  // workout what's the exercises I should be doing today" — called it AGAIN,
  // and both times she was told "Those are already the days you're training
  // — nothing to change", an answer to a question she never asked.
  //
  // The tool worked correctly at every step: the no-op guard fired, nothing
  // was written twice, the confirm rail held. It was the wrong tool for the
  // sentence, which no amount of guarding inside it can fix — so the checks
  // are on the two places the model actually reads before choosing: the
  // declaration, and §3e.
  const decl = chat.slice(chat.indexOf('name: "propose_schedule_change"'), chat.indexOf('name: "propose_rest_day"'))
  check('the tool declaration says it is only for a LASTING weekday change',
    /LASTING change to which WEEKDAYS/i.test(decl))
  check('...and names the sentences that are NOT one',
    /work out today/i.test(decl) && /what should I do today/i.test(decl))
  check('...and says what to do instead — answer in text, no tool call',
    /in text, with no tool call/i.test(decl))

  const section = chat.slice(chat.indexOf('=== 3e.'), chat.indexOf('=== 4.'))
  check('§3e carries the same boundary', /NOT schedule changes/i.test(section))
  check('...points at this week\'s schedule for the answer', /THIS WEEK'S SCHEDULE/i.test(section))
  // The schedule sent to the coach describes non-lifting days too, so
  // "there was nothing to tell her" is never the excuse — a walking plan is
  // exactly the case that produced this.
  check('...and says a day with no gym session still has an answer in it',
    /walk with its minutes|no gym session/i.test(section))

  // AND THE DEAD END ITSELF. If the tool is ever called by mistake again,
  // the reply must not be a flat statement about days that reads as a
  // non-sequitur to whatever was asked.
  const ui = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  check('a no-op schedule call no longer answers with a bare "nothing to change"',
    !/refusal = "Those are already the days you're training — nothing to change\."/.test(ui))
  check('...it names the days and admits it may have misread',
    /If you were asking something else, like what today's session is/.test(ui))
}

console.log('\n7. A tool that declines says so in its own description')
{
  // THE OTHER HALF OF §1. That section proves every declared tool has a
  // handler; this one proves the handler does what the description says.
  //
  // Both instances were live on 5 Sep 2026. `ban_exercise` was described as
  // "permanently exclude this exercise from future plans" and the prompt told
  // the model to "confirm you've permanently removed it" — while the handler
  // returned "that's coming in an update soon". `log_meal` replied "meal
  // logging arrives in the next update" for a feature that had SHIPPED, on a
  // screen with a Log button, in the same prompt that forbids that exact
  // sentence. A model reading only the description has no way to know either.
  //
  // The rule: if a handler's reply declines, its description must open by
  // saying it does not do the thing. Detected from the reply text rather than
  // from whether the body writes — several tools legitimately write through
  // the client instead of the server, and "no supabase call here" would have
  // flagged six honest ones.
  const DECLINE_PHRASES = /can't [^"]{0,40}\byet\b|coming in an update|in the next update|arrives in the next/i
  const MARKS_ITSELF = /NOT WIRED UP YET|DOES NOT LOG ANYTHING|DOES NOT WRITE/

  const declared = [...chat.matchAll(/^\s*name:\s*"([a-z_]+)",\s*$/gm)].map(m => m[1])
  const descriptionOf = (tool: string): string => {
    const at = chat.indexOf(`name: "${tool}"`)
    if (at < 0) return ''
    const desc = chat.indexOf('description:', at)
    return desc < 0 ? '' : chat.slice(desc, chat.indexOf('parameters:', desc))
  }
  const handlerOf = (tool: string): string => {
    const at = chat.indexOf(`name === "${tool}"`)
    if (at < 0) return ''
    const next = chat.indexOf('if (name === "', at + 5)
    return chat.slice(at, next < 0 ? at + 6000 : next)
  }

  const decliners = declared.filter(t => DECLINE_PHRASES.test(handlerOf(t)))
  // Sanity check on this check: if the phrase list stops matching anything,
  // the loop below is vacuous and passes on a prompt full of false promises.
  // Two tools decline today and both are deliberate.
  check('the decline detector still finds the tools that decline', decliners.length >= 2, decliners)
  for (const tool of decliners) {
    check(`${tool} declines, and its description says so up front`,
      MARKS_ITSELF.test(descriptionOf(tool)), descriptionOf(tool).slice(0, 160))
  }

  // And the reverse: a tool that DOES write must not describe itself as
  // unavailable, which is how log_meal came to talk a user out of a button
  // that was right there.
  const liars = declared.filter(t => !decliners.includes(t) && /coming in an update|in the next update/i.test(descriptionOf(t)))
  check('no working tool describes itself as unbuilt', liars.length === 0, liars)

  // The prompt must not contradict a decline either — this is the sentence
  // that actually reached the user.
  check('the prompt does not tell the model to confirm a ban as done',
    !/confirm you've permanently removed/i.test(chat))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll coach-promise checks passed.\n')
