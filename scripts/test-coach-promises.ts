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
/**
 * The same file with its comments removed.
 *
 * Added 7 Sep 2026 after finding a check in this very file satisfied by a
 * COMMENT: "log_meal is still the tool that declines" matched a note
 * explaining why it declines, not the reply that does it, so the reply could
 * have been rewritten to anything without the check noticing. Anything
 * asserting what the coach SAYS reads this, not `chat`.
 */
const chatCode = chat.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
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

console.log('\n2. Skipping a day for something else is a CARD, not a sentence and not a silent write')
{
  // REWRITTEN 15 Sep 2026. This section used to pin the opposite: that the
  // handler wrote workout_sessions and cardio_logs itself. It did, and that
  // was the 25 Aug fix for the coach SAYING a day was marked when nothing
  // could mark it. What it left standing is the thing Ashley reported on the
  // 15th — her record changed with no card and no tap. Her ruling, from three
  // options: ask first, like the others. So the property inverts: this handler
  // must now write NOTHING.
  check('propose_session_activity_swap is declared', /name:\s*"propose_session_activity_swap"/.test(chat))
  check('...and executed', /name === "propose_session_activity_swap"/.test(chat))
  // IT SITS WITH ITS SIBLINGS. The name and the neighbourhood are both signals
  // to the model, and this tool being declared among the log_* writers is how
  // it came to be treated as one.
  const decls = [...chat.matchAll(/name:\s*"(propose_[a-z_]+|log_[a-z_]+)"/g)].map(m => m[1])
  const i = decls.indexOf('propose_session_activity_swap')
  check('...declared among the propose_* tools, not the log_* ones',
    i > 0 && decls[i - 1].startsWith('propose_'), { before: decls[i - 1], after: decls[i + 1] })

  const start = chat.indexOf('name === "propose_session_activity_swap"')
  // TERMINATED ON THE NEXT HANDLER IN THE FILE, not on a name picked from the
  // DECLARATION order — those two orders are different, and slicing to a
  // handler that sits earlier gives a negative length and an empty body that
  // passes every "does NOT contain" check vacuously.
  const body = chat.slice(start, start + chat.slice(start).indexOf('if (name === "log_meal")'))
  check('...and the slice really holds the handler', body.length > 500 && body.includes('activityName'), body.length)
  // COMMENTS STRIPPED BEFORE ANY ABSENCE CLAIM. The handler's own header now
  // explains where those writes WENT — a note about a removal must not satisfy
  // the check that it was removed. Caught here on the first run.
  const bodyCode = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('the handler writes NOTHING to workout_sessions', !bodyCode.includes('workout_sessions'), bodyCode.length)
  check('...and nothing to cardio_logs', !bodyCode.includes('cardio_logs'))
  check('...and nothing to fitness_profiles, the field update_workout_schedule died on',
    !bodyCode.includes('fitness_profiles'))
  check('it returns a proposal for the user to confirm', /kind: "propose_session_activity_swap"/.test(body))
  // D1: a turn carrying a proposal returns NO prose, so there is no sentence
  // left on this path for the model to get wrong.
  check('...and no prose of its own', /reply: ""/.test(body))

  // THE 8 SEP RULE SURVIVES THE MOVE. The model invented 60 minutes for a
  // class still hours away; a duration counts only when it echoes one in her
  // own message. That rule now guards a card instead of a row.
  check('a duration is only forwarded when she actually said it',
    /statedDurationsMinutes\(message\)/.test(body) && /saidMinutes\.some/.test(body))
  check('...and whether the activity has happened yet is read, not assumed',
    /eventTiming\(message, activityName\)/.test(body))
}

console.log('\n3. The prompt forbids claiming an untaken action')
{
  check('the honesty rule is present', chat.includes('NEVER CLAIM AN ACTION YOU DID NOT TAKE'))
  // THE WHOLE SECTION, not a fixed number of characters from its heading.
  // 15 Sep 2026: rule 2 gained three sentences (the measured live example, and
  // the carve-out saying a plain statement is enough to call the tool) and
  // pushed rules 5 and 6 past the 1600-char window three checks used — so the
  // checks went red over a rule that had not changed, and the only way to make
  // them green would have been to say LESS about honesty. A window is a
  // mechanism; the property is "it is in this section".
  const honestyStart = chat.indexOf('NEVER CLAIM AN ACTION')
  const honestyEnd = (() => {
    const rest = chat.slice(honestyStart)
    const next = rest.indexOf('\n=== ', 40)
    return next > 0 ? honestyStart + next : chat.length
  })()
  const honesty = chat.slice(honestyStart, honestyEnd)
  check('...it names the tool to use instead', /propose_session_activity_swap/.test(honesty))
  check('...and tells it to say so plainly when it has no tool',
    /cannot do it from chat|can't do that from here/i.test(honesty))
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

  // Same re-anchor as §3: the section, not a character count.
  const ruleStart = chat.indexOf('NEVER CLAIM AN ACTION')
  const ruleEnd = (() => {
    const rest = chat.slice(ruleStart)
    const next = rest.indexOf('\n=== ', 40)
    return next > 0 ? ruleStart + next : chat.length
  })()
  const rule = chat.slice(ruleStart, ruleEnd)
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
  const findDecliners = (src: string): string[] => {
    const at = [...src.matchAll(/if \(name === "([a-z_]+)"\)/g)]
    return at.filter((m, i) => {
      const body = src.slice(m.index!, at[i + 1]?.index ?? m.index! + 2000)
      return /coming in an update soon/.test(body)
    }).map(m => m[1])
  }
  const decliningStubs = findDecliners(chat)
  // THE TEETH USED TO BE "at least one tool still declines", which is a check
  // that depends on a defect existing. On 14 Sep ban_exercise was wired —
  // Ashley's instruction, and the last screen-only capability — so nothing
  // declines any more and that guard went red for being right.
  //
  // The detector is proved on a synthetic handler instead, so it cannot go
  // vacuous, and the real count being ZERO is now the property rather than the
  // failure. If a declining stub is ever added back, the second check catches
  // it and names it.
  const SYNTHETIC = 'if (name === "synthetic_decliner") { return json({ reply: "coming in an update soon" }) }\nif (name === "other") { return json({ reply: "" }) }'
  check('the decline detector actually detects (proved on a synthetic stub)',
    findDecliners(SYNTHETIC).includes('synthetic_decliner'), findDecliners(SYNTHETIC))
  check('...and no declared tool declines any more', decliningStubs.length === 0, decliningStubs)
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
  // THE PREMISE CHANGED ON 7 Sep 2026 AND THE CHECK HAD TO CHANGE WITH IT.
  // This used to read "...because log_meal is still the tool that declines" —
  // true while its handler pointed at a table that had never existed. It now
  // proposes a confirmation card and the app writes the meal on the tap, so
  // the old assertion would be pinning a state that is gone.
  //
  // What still matters is the harm the welcome check exists to prevent: the
  // coach must not claim a meal is recorded, because at the moment it replies
  // it is not — the write happens after her tap. That is what is asserted now.
  check('...and log_meal never claims to have recorded anything itself',
    /YOU never record anything and must never say you have/.test(chatCode)
    && /never report a meal as logged, added or saved/.test(chatCode))
  check('...with the same rule stated in the prompt, not only the tool',
    /Never say a meal is logged, saved or added/.test(chatCode))

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

console.log('\n6b. A second sport is a tool, not a memory note — and not the one-off swap')
{
  // 6 Sep 2026. "I also do Muay Thai on Tuesday and Thursday evenings" had
  // exactly one tool that knew the phrase: swap_session_for_activity, which
  // marks ONE day as swapped. A standing commitment filed through it would
  // have marked one Tuesday and left the plan prescribing heavy legs the
  // morning of every class. record_fact would have written it down and
  // changed nothing. The rule has to separate three sentences that look
  // alike, and the tool has to exist and be executed.
  check('propose_concurrent_activity is declared', /name:\s*"propose_concurrent_activity"/.test(chat))
  check('...and has a handler', /name === "propose_concurrent_activity"/.test(chat))
  check('...which PROPOSES rather than writing',
    /kind: "propose_concurrent_activity"/.test(chat) && !/name === "propose_concurrent_activity"[\s\S]{0,900}fitness_profiles/.test(chat))
  const g = chat.slice(chat.indexOf('=== 3g.'), chat.indexOf('=== 4. TAG HYGIENE'))
  check('§3g exists', g.length > 200, g.length)
  check('...and names all three look-alike sentences with their tools',
    /propose_session_activity_swap/.test(g) && /propose_schedule_change/.test(g) && /propose_concurrent_activity/.test(g))
  check('...says it never guesses the days', /Never guess days/.test(g))
  check('...and that one class day may still carry a heavy session', /still carries a heavy session/.test(g))
  check('the memory-note precedence rule names it too',
    /SECOND SPORT on set days[\s\S]{0,200}propose_concurrent_activity/.test(chat))
  check('the coach context block carries a rule, not just data',
    /RULES FOR THESE DAYS/.test(chat) && /never call one of these nights a "rest day"/.test(chat))
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
  // READS THE CODE, NOT THE COMMENTARY. This sliced `chat` until 7 Sep 2026,
  // and a note in log_meal's handler recording what its old reply used to say
  // ("I can't log food from chat yet") was enough to classify the tool as a
  // decliner long after it had stopped declining. A detector that a comment
  // can trip is a detector that reports the past.
  const handlerOf = (tool: string): string => {
    const at = chatCode.indexOf(`name === "${tool}"`)
    if (at < 0) return ''
    const next = chatCode.indexOf('if (name === "', at + 5)
    return chatCode.slice(at, next < 0 ? at + 6000 : next)
  }

  const decliners = declared.filter(t => DECLINE_PHRASES.test(handlerOf(t)))
  // Sanity check on this check: if the phrase list stops matching anything,
  // the loop below is vacuous and passes on a prompt full of false promises.
  //
  // Was ">= 2" until 7 Sep 2026 when log_meal stopped declining, then ">= 1".
  // On 14 Sep ban_exercise was wired too — Ashley's instruction — and the last
  // decliner went with it, so a floor of 1 would demand that a defect exist in
  // order for the check to pass.
  //
  // The phrase list is proved against a synthetic handler instead. The loop
  // below then runs over however many real decliners there are, which is now
  // none — and the count is asserted, so adding one back is visible rather
  // than silent.
  check('the decline phrases still match a decline (proved on a synthetic handler)',
    DECLINE_PHRASES.test('I can\'t do that through chat yet — that\'s coming in an update soon.'))
  check('...and no declared tool declines any more', decliners.length === 0, decliners)
  for (const tool of decliners) {
    check(`${tool} declines, and its description says so up front`,
      MARKS_ITSELF.test(descriptionOf(tool)), descriptionOf(tool).slice(0, 160))
  }

  // And the reverse: a tool that DOES write must not describe itself as
  // unavailable, which is how log_meal came to talk a user out of a button
  // that was right there.
  //
  // THE TWO HALVES OF THIS RULE USED DIFFERENT WORD LISTS, and that is exactly
  // how the next one got through. A decliner had to say "NOT WIRED UP YET"
  // (MARKS_ITSELF above) while a worker was only forbidden from saying "coming
  // in an update" — so the sentence a decliner was REQUIRED to carry was not
  // one a worker was forbidden to keep. `ban_exercise` was wired on 14 Sep
  // 2026 and its description kept "NOT WIRED UP YET — calling this returns a
  // decline... never tell the user you have banned anything", about a tool
  // that by then proposed a real card. The whole section went green, because
  // the only list that contained that phrase pointed the other way.
  // ONE VOCABULARY, BOTH DIRECTIONS. Found by reading the tool list against
  // the handlers, not by a check — which is what made it worth fixing here.
  const CLAIMS_UNBUILT = (desc: string) =>
    MARKS_ITSELF.test(desc) ||
    /coming in an update|in the next update|arrives in the next|not (?:yet )?wired up/i.test(desc)
  const liars = declared.filter(t => !decliners.includes(t) && CLAIMS_UNBUILT(descriptionOf(t)))
  check('no working tool describes itself as unbuilt', liars.length === 0, liars)

  // The prompt must not contradict a decline either — this is the sentence
  // that actually reached the user.
  check('the prompt does not tell the model to confirm a ban as done',
    !/confirm you've permanently removed/i.test(chat))
}

console.log('\nA macro QUESTION is answered, not apologised for\n')
{
  // Ashley, 7 Sep 2026: "asking a simple question about macros and the app is
  // trying to log it." Three attempts, three byte-identical replies, because
  // log_meal's handler opened with "I can't log food from chat yet" whatever
  // brought it there — and that string is server-authored, so no amount of
  // "that was a question" could move it.
  //
  // The ROUTING was right and stays: a macro question goes through log_meal so
  // the numbers come from the verified food database rather than the model's
  // arithmetic. What was wrong is that one route produced one reply.
  const schema = chatCode.slice(chatCode.indexOf('name: "log_meal"'), chatCode.indexOf('name: "log_workout_set"'))
  check('the log_meal schema was located (sanity check on this check)', schema.length > 500, schema.length)
  check('log_meal is told WHY it is being called', /intent: \{[\s\S]{0,200}enum: \["question", "logging"\]/.test(schema))
  // Optional would make it optional in practice: the model omits what it can.
  check('...and cannot leave it out', /required: \["intent",/.test(schema))
  check('the prompt says which is which', /SET log_meal's intent ARGUMENT TO WHAT THEY ACTUALLY DID/.test(chatCode))
  check('...and rules on the ambiguous case rather than leaving it open',
    /it is a QUESTION: they asked, so answer/.test(chatCode))

  // THE HANDLER. One route, two outcomes — and after 7 Sep 2026 only ONE of
  // them is prose. Logging returns a proposal for the app to render as a
  // confirmation card; the reply is deliberately empty, because the client
  // authors the text for a proposal turn and the model must not be able to
  // describe a meal as recorded.
  const handler = chatCode.slice(chatCode.indexOf('const asked = args.intent === "question"'), chatCode.indexOf('if (name === "log_workout")'))
  check('the handler was located (sanity check on this check)', handler.length > 200, handler.length)

  const proposalBranch = handler.slice(handler.indexOf('if (!asked)'), handler.indexOf('const parts'))
  check('a logging intent returns a proposal rather than prose',
    /kind: "propose_meal_log"/.test(proposalBranch), proposalBranch.slice(0, 200))
  check('...with an empty reply, so the model cannot narrate the write',
    /reply: ""/.test(proposalBranch))
  check('...carrying the numbers already computed from the verified food database',
    /computed: \{[\s\S]{0,200}kcal: computed\.kcal/.test(proposalBranch))
  // NOTHING IS WRITTEN HERE. Same shape test-meal-addition.ts pins for its own
  // courier: the confirmed write belongs to the client, after the tap.
  check('...and writes nothing itself', !/method:\s*"(POST|PATCH|PUT)"/.test(handler), handler.slice(0, 120))

  const askedReply = /`\*\*\$\{args\.food_name\}\*\* is ([^`]+)`/.exec(handler)?.[0] ?? ''
  check('a question is still answered with the numbers, in prose', /macroLine/.test(askedReply), askedReply)
  // THE PROPERTY THAT STARTED ALL THIS. She asked what something came to;
  // logging was never the subject, and an apology for not doing it is not an
  // answer to her question.
  check("...and says nothing about logging, which she never asked about",
    !/\blog\b|Nutrition tab|can't|cannot/i.test(askedReply), askedReply)
  check('...and the rule it is obeying is still in the prompt',
    /NEVER lead with what the app can't do/.test(chatCode))

  // A field name is not a word. "keep an eye on your snack_1 against its
  // budget" was reaching the screen verbatim.
  // Re-anchored 7 Sep 2026: this pinned the phrase "first snack", which was
  // the mapping for a slot key that no longer exists. What matters is that the
  // key is translated at all, and that the four the ledger accepts all have a
  // word — "snack" was missing from the map when the enum was corrected, which
  // silently dropped the budget clause off every snack answer. test:meal-log
  // holds the full list against the migration.
  check('slot keys are turned into words before they reach a reply',
    /humanSlot\(args\.meal_slot\)/.test(chatCode) && /snack: "snack"/.test(chatCode))
  check('...and an unknown key is dropped rather than echoed',
    /return known\[slot\.toLowerCase\(\)\] \?\? ""/.test(chatCode))
  check('...with no raw key left in the reply, nor interpolated straight in',
    !/snack_1/.test(askedReply) && !/\$\{args\.meal_slot\}/.test(handler))
  // AND THE LIST THE MODEL IS GIVEN MATCHES THE DATABASE. snack_1/snack_2 were
  // in the tool's slot description until 7 Sep 2026; meal_events accepts
  // breakfast/lunch/dinner/snack and nothing else, so every snack log would
  // have been rejected on arrival the moment logging was wired up. Held
  // against the migration in test:meal-log; named here because this is where
  // the leak was first seen.
  check('the slot list offered to the model has no snack_1/snack_2 left in it',
    !/snack_1|snack_2/.test(schema), schema.slice(schema.indexOf('meal_slot'), schema.indexOf('meal_slot') + 200))
}

console.log('\nThe coach speaks after a tool runs, and the server reads the message first (9 Sep 2026)\n')
{
  // Ashley, 8 Sep 2026, 22:16: a "what should I eat" answered with macros for
  // a banana the model invented; "roughly 0 kcal … 0% of the meal by weight"
  // for rice cakes the database did not know; "Done — … and the session is
  // logged" for a class that had not happened, at a duration nobody stated.
  // Nothing in these handlers read the message; every reply was a template.
  const code = chatCode

  // ONE FUNCTION FOR EVERY MODEL CALL, tools off on the second pass.
  check('the Gemini call is one function, with tools optional', /const callGemini = async \(turns: unknown\[\], withTools = true\)/.test(code))
  check('...tools are attached only when asked for', /\.\.\.\(withTools \? \{ tools: \[\{ functionDeclarations: toolDeclarations \}\] \} : \{\}\)/.test(code))
  check('...and the second pass is capped short', /maxOutputTokens: withTools \? 4096 : 512/.test(code))
  // Anchored on WHAT is imported, not on which name happens to come first:
  // adding resolvePlainReply to the same import broke the old regex without
  // changing anything it was there to protect.
  check('the second pass comes from tool-reply.ts, not an inline fetch', /import \{[^}]*\bresolveToolReply\b[^}]*\} from "\.\/tool-reply\.ts"/.test(code))
  check('...and every use logs where the words came from', /tool-reply tool=\$\{o\.outcome\.name\} source=\$\{r\.source\} legs=\$\{r\.legs\}/.test(code))

  // log_meal reads the message.
  const meal = code.slice(code.indexOf('const asked = args.intent === "question"'), code.indexOf('if (name === "log_workout")'))
  check('log_meal asks whether SHE named the food', /const evidence = userNamedFood\(\{/.test(meal))
  check('...whether it was an advice question', /const advice = isAdviceQuestion\(message\)/.test(meal))
  check('...whether it was a judgement question', /const evaluation = isEvaluationQuestion\(message\)/.test(meal))
  check('...and whether the database recognised anything at all', /const nothingIdentified = computed\.lines\.every\(\(l\) => !l\.entry\)/.test(meal))
  const adviceArm = meal.slice(meal.indexOf('if (advice || !evidence.named)'), meal.indexOf('if (nothingIdentified)'))
  check('an advice question, or a food the model invented, gets words and the one-line offer', adviceArm.length > 0 && /Say "add it" and I'll put it in\./.test(adviceArm))
  check('...with the model\'s own arithmetic forbidden', /forbid: \[macroArithmetic/.test(adviceArm))
  check('...and no "Assumptions:" line', !/Assumptions/.test(adviceArm))
  const nothingArm = meal.slice(meal.indexOf('if (nothingIdentified)'), meal.indexOf('if (evaluation)'))
  check('nothing identified → no number at all, and a way to get one', /well enough to put numbers on it/.test(nothingArm) && !/\$\{computed\.kcal\}/.test(nothingArm) && !/%/.test(nothingArm))
  check('...ahead of the numbers template, so "roughly 0 kcal" is unreachable', meal.indexOf('if (nothingIdentified)') < meal.lastIndexOf('mustContain: [`${computed.kcal} kcal`]'))
  const evalArm = meal.slice(meal.indexOf('if (evaluation)'), meal.lastIndexOf('const spoken = await toolReply'))
  check('a judgement question gets a verdict, steered by its own nudge', /nudge: EVALUATION_NUDGE/.test(evalArm) && /floor: numbersTemplate/.test(evalArm))
  check('the numbers answer must quote the figure she asked for, or the template does', /mustContain: \[`\$\{computed\.kcal\} kcal`\]/.test(meal))
  check('the tool no longer accepts a dish the model made up', /in the USER'S OWN WORDS — never a dish you invented/.test(code))
  check('the prompt names the judgement question', /is a COACHING question about food they named/.test(code))
  check('...and tells the model what a tool result is for', /=== 1f\. AFTER A TOOL RUNS ===/.test(code))

  // THE SWAP TOOL IS A COURIER NOW, so what it must be honest about changed.
  // REWRITTEN 15 Sep 2026 with the rail. Four of these checks used to pin the
  // write path — the read-before-insert, the no-double-insert, the "may not
  // say logged" forbid — and every one of them was correct about code that has
  // moved to the client's confirm arm. What SURVIVES the move is the pair of
  // rules the 8 Sep incident bought: a duration only when she said it, and
  // nothing logged for a class that has not happened. Those now guard a card.
  const swap = code.slice(code.indexOf('name === "propose_session_activity_swap"'), code.indexOf('if (name === "log_meal")'))
  check('the swap handler slice is real', swap.length > 500, swap.length)
  check('a combined sentence — session later, activity today — becomes a move card, not a swap', /if \(sessionStillHappening\) \{[\s\S]{0,700}kind: "propose_session_move"/.test(swap))
  // ORDER, NOT TEXT: the move re-route has to be tested BEFORE the swap
  // proposal returns, or a sentence that says both writes the day off.
  check('...and that test comes first', swap.indexOf('sessionStillHappening') < swap.indexOf('kind: "propose_session_activity_swap"'))
  check('whether the activity has happened yet is read, not assumed', /activity_planned: eventTiming\(message, activityName\) === "future"/.test(swap))
  check('a duration is forwarded only at a figure SHE stated',
    /saidMinutes = statedDurationsMinutes\(message\)/.test(swap) && /saidMinutes\.some\(\(d\) => Math\.abs\(d - modelMinutes\) <= 1\)/.test(swap))
  check('...and never a guess: no stated figure means null, not a number', /: null,/.test(swap))
  // D1: a proposal turn returns no prose, so there is no sentence on this path
  // for the model to get wrong. That is what replaces the old forbid-list.
  check('the turn carries no prose of its own', /reply: "",/.test(swap))

  // The two other handlers that author English go through the same pass.
  check('a weigh-in reply must quote her number', /mustContain: \[`\$\{weightKg\}`\]/.test(code))
  check('a logged set must quote the weight it wrote', /mustContain: \[`\$\{resolved\.weightKg\}`\]/.test(code))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// PHASE 3 — the last handlers that spoke for the coach, and the voice itself.
// ---------------------------------------------------------------------------
{
  console.log('\nPhase 3. The app stops talking over the coach')
  const src = chatCode

  // log_workout_session was the worst §1 violator in the file: a markdown
  // bullet list, bold exercise names and up to three paragraphs, answering a
  // rule that says one to three sentences and never a list.
  const session = src.slice(src.indexOf('name === "log_workout_session"'), src.indexOf('name === "log_weight"'))
  // Pinned as the ASSIGNMENT, not the mere presence of the call: a mutation
  // that left `await toolReply(` in the file behind a dead branch survived the
  // first version of this check. Same failure shape as the comment-satisfied
  // check this file already carries a note about.
  check('log_workout_session goes through the second pass',
    /confirmText = insertedSets > 0\s*\n\s*\? \(await toolReply\(/.test(session), null)
  check('...with the old template kept as the floor', /floor: sessionFloor/.test(session), null)
  check('...quoting the number of sets it actually saved', /mustContain: \[`\$\{insertedSets\}`\]/.test(session), null)
  check('...and refusing a reply that reintroduces a list or bold', /forbid: \[\/\^\\s\*\[-\*\]/.test(session) && /\\\*\\\*/.test(session), null)

  // Two handlers interpolated the raw Postgres message into her chat.
  check('no handler pastes a database error into the reply',
    !/save failed\$\{dbError/.test(src) && !/failed\$\{dbError \? `: \$\{dbError\}`/.test(src), null)
  check('...and both still log it server-side',
    (src.match(/console\.error\("log_workout_(session|set) save failed:/g) || []).length === 2, null)

  // The catch-all claimed a change for a tool that never ran.
  check('the undeclared-tool fall-through no longer claims a change',
    !/Your plan has been updated/.test(src), null)
  check('...and ships no action envelope for something that did not happen',
    !/generateConfirmation/.test(src), null)
  check('...and is logged so a hallucinated tool name is visible',
    /functionCall for an undeclared tool/.test(src), null)
  check('the dead ban_exercise branch that would claim a removal is gone',
    !/I've permanently removed/.test(src), null)
  // FLIPPED 14 Sep 2026. This used to assert the decline still stood — "I
  // can't ban exercises through chat yet" — which was correct while the ban
  // was deliberately unavailable from chat. Ashley asked for it wired, so the
  // decline is now the regression and the courier is the property.
  check('...and ban_exercise is a courier now, not a decline',
    /kind: "propose_exercise_ban"/.test(src) && !/can't ban exercises through chat yet/.test(src), null)

  // A plain question turn had no second chance at all.
  check('a plain turn gets the reply guarantee',
    /const plain = await resolvePlainReply\(\{/.test(src), null)
  check('...and its answer is what actually ships', /reply: plain\.reply/.test(src), null)
  check('...and no longer tells her to rephrase', !/try rephrasing/.test(src), null)
  check('...with a floor that does not blame her',
    /I'm not sure I followed that one/.test(src), null)
  check('...and one log line per plain turn', /plain-reply source=/.test(src), null)

  // §1's length rule now depends on the kind of turn.
  check('confirmations keep the one-to-three-sentence ceiling',
    /CONFIRMING SOMETHING THAT JUST HAPPENED[\s\S]{0,400}ONE to THREE short sentences/.test(src), null)
  check('questions and advice are allowed to explain why',
    /ANSWERING A QUESTION, OR GIVING ADVICE[\s\S]{0,400}say WHY/.test(src), null)
  // 26 Sep 2026: the ceiling was there and four-paragraph answers came back
  // anyway, so it gained the same cut-before-sending default confirmations
  // already had — a ceiling the model is told to enforce on its own draft.
  check('...with a ceiling of its own, and a cut-before-sending default, so it cannot become an essay',
    /ANSWERING A QUESTION, OR GIVING ADVICE[\s\S]{0,700}two SHORT ones is the ceiling/.test(src)
      && /if your draft runs to three paragraphs or more, cut it before sending/.test(src)
      && /A caveat is a clause, never a paragraph of its own/.test(src), null)
  // AMENDED 24 Sep 2026, Ashley's "short steps": the ban on formatting stays,
  // with exactly two shapes let through — a how-to capped at three lines, and
  // one line per thing when several were asked. Each half is checked, because
  // "lists are allowed now" with no cap is how the four-paragraph essays come
  // back as eight bullet points.
  check('no documents: headers and bold section titles are still banned',
    /NO DOCUMENTS: never use headers, bold section titles/.test(src), null)
  check('a how-to is capped at three short steps, with the rest offered on a tap',
    /"1\." to "3\." at most/.test(src) && /\[QUICK_REPLIES: "Full form guide" \| "Got it"\]/.test(src), null)
  check('several asks in one message get one line each, never a header',
    /SEVERAL THINGS ASKED IN ONE MESSAGE[\s\S]{0,500}never a header/.test(src), null)
  check('...and every other reply is still speech',
    /Everything else is speech/.test(src), null)
  // 25 Sep 2026: the exam's several-things case came back as four paragraphs
  // and a bulleted recipe, so the rule now carries the exact shape to copy —
  // three lines, one per thing asked — and names the recipe list as wrong.
  // RE-ANCHORED 26 Sep 2026 on the SHAPE, not on three labels: the example
  // that stood here was the exam's own question with its answer, which is
  // the exam grading the coach on its memory (see the integrity check below).
  {
    const at = src.indexOf('SEVERAL THINGS ASKED IN ONE MESSAGE')
    const block = at < 0 ? '' : src.slice(at, src.indexOf('Everything else is speech', at))
    check('the several-things rule shows the shape: three lines, one per thing, each opening with what it answers',
      /ONE LINE EACH means one or two sentences per line/.test(block) && /never set out as an ingredient list/.test(block)
        && /\n\s+[A-Z][^\n—]{2,30} — [^\n]+\n\s+[A-Z][^\n—]{2,30} — [^\n]+\n\s+[A-Z][^\n—]{2,30} — [^\n]+/.test(block), block.slice(0, 120))
    check('...and each line leans on what the coach can see about them, not advice for anyone',
      /leans on what you can SEE about them/.test(block), null)
  }

  // THE EXAM IS NOT IN THE COACH'S INSTRUCTIONS. 26 Sep 2026: the several-
  // things example above was the exam's own message, paraphrased, with the
  // answer written out — and the graded run's reply copied its three labels.
  // An exam the coach has the answers to measures its memory. Seven-word runs
  // after normalising, which caught that example (it shared "need more carbs
  // what should i have before training") and nothing that is merely the same
  // topic. The detector is proven on a planted copy first so it cannot go
  // vacuous if the cases move.
  {
    const norm = (x: string) => x.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
    const runs = (x: string, n = 7) => { const w = norm(x).split(' '); const out: string[] = []; for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' ')); return out }
    // NO EXCEPTIONS LEFT. The allergy example in the prompt ("I've got a nut
    // allergy — is my lunch today nut free?", with WRONG and RIGHT replies) was
    // word for word the exam's allergen case. The example is safety wording and
    // stays; Ashley ruled on 26 Sep 2026 that the EXAM question is reworded
    // instead, so the case tests understanding rather than recall. The set is
    // kept so a future exception has to be named here, and the check below
    // still fails if a named one stops being true.
    const KNOWN_LEAKS = new Set<string>([])
    const caseDir = join(ROOT, 'scripts/exam-cases')
    const cases = readdirSync(caseDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => ({ name: f.replace(/\.json$/, ''), messages: (JSON.parse(readFileSync(join(caseDir, f), 'utf8')).messages ?? []) as string[] }))
    const leaks = (text: string, pool: typeof cases) => { const hay = ' ' + norm(text) + ' '; return pool.filter(c => c.messages.some(m => runs(m).some(r => hay.includes(' ' + r + ' ')))).map(c => c.name) }
    const open = cases.filter(c => !KNOWN_LEAKS.has(c.name))
    const planted = src + '\n' + (open[0]?.messages[0] ?? '')
    check('exam-integrity detector: finds an exam message planted in the prompt', cases.length >= 20 && leaks(planted, open).length >= 1, cases.length)
    const found = leaks(src, open)
    check('no exam question appears in the coach\'s instructions', found.length === 0, found)
    const stillKnown = leaks(src, cases.filter(c => KNOWN_LEAKS.has(c.name)))
    check('...and the named exception is still real, so the list cannot rot', stillKnown.length === KNOWN_LEAKS.size, stillKnown)
  }

  // OPTIONS ARE NOT STEPS. 26 Sep 2026: "three ways to unstick it" and "a few
  // ways to make 24kg heavy again" came back as numbered lists — neither of
  // the two allowed shapes. A CSCS call as much as a voice one: a coach who
  // can see the lift picks the lever, and asks when it can't tell.
  check('a menu of options is not a list: pick the one that fits and say why',
    /OPTIONS ARE NOT STEPS/.test(src) && /Pick the ONE that fits this person best/.test(src), null)
  check('a route is one sentence, never a numbered list of the ways in',
    /A ROUTE IS ONE SENTENCE/.test(src) && /never a numbered list of the ways in/.test(src), null)
  check('the full form guide is still texting: no section titles, no nested bullets',
    /still texting: short numbered lines, one cue per line — no section titles, no bullets under a line/.test(src), null)
  // NEVER OFFER WHAT NO TOOL DOES — 26 Sep 2026, "want me to add these tempo
  // cues to next week's session?" with no tool that writes one. And the prompt
  // must name no tool that does not exist: it named "log_history" twice, a tool
  // nothing declares, for as long as anyone can tell.
  check('the coach may not offer a change no tool can make',
    /4b\. NEVER OFFER WHAT NO TOOL DOES/.test(src) && /Before any "want me to…\?", know which of your tools would do it/.test(src), null)
  {
    const declared = new Set([...src.matchAll(/\bname:\s*"([a-z][a-z_]+)"/g)].map(m => m[1]))
    const params = new Set([...src.matchAll(/\b([a-z][a-z_]+):\s*\{\s*type:/g)].map(m => m[1]))
    const sp = src.indexOf('const systemPrompt = `')
    const prompt = sp < 0 ? '' : src.slice(sp, src.indexOf('`;', sp))
    const descs = [...src.matchAll(/description:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).join('\n')
    const named = (text: string) => [...new Set([...text.matchAll(/\b(?:log|propose|record|ban|add|check|set)_[a-z_]*[a-z](?!_?\*)\b/g)].map(m => m[0]))]
      .filter(t => !declared.has(t) && !params.has(t))
    check('tool-name detector: finds a tool that does not exist when one is planted', named(prompt + ' call log_history ').includes('log_history'), null)
    const ghosts = named(prompt + '\n' + descs)
    check('the coach\'s instructions name no tool it does not have', ghosts.length === 0, ghosts)
  }

  // A CSCS call, basis in BACKLOG: single-leg is its own pattern; a goblet
  // squat for a lunge keeps the load and loses the one-leg work.
  check('a lunge is swapped for a single-leg lift, never a two-legged squat',
    /Single-leg is its own pattern, not a kind of squat/.test(src) && /never by a two-legged squat/.test(src), null)
  // The contradiction that produced the essays: §1 said "offer the rest", the
  // triggers section said "give step-by-step cues, target muscles, common
  // mistakes and coaching tips". The model obeyed the more specific one.
  check('the technique line no longer asks for everything at once',
    !/Provide step-by-step form cues, target muscles, common mistakes, and coaching tips/.test(src)
      && /in the how-to shape §1 gives/.test(src), null)

  // Warmth, as Ashley asked for it — and not as the tone probe penalises it.
  check('warmth is defined as attention, not praise', /WARMTH IS ATTENTION, NOT PRAISE/.test(src), null)
  check('grading openers are still banned by name',
    /Never open by grading them/.test(src), null)
  check('nothing tells the coach to congratulate any more',
    !/congratulate/i.test(src), null)
  check('a bad week is acknowledged before it is fixed',
    /acknowledge it before you fix it/.test(src), null)
  // REVERSED 24 Sep 2026 by Ashley, from three options: a question only when
  // the answer changes what happens next — over "keep one every time" (her
  // 15 Sep rule) and over "never ask". Both halves held: the old every-time
  // rule is gone, and "never more than one" survives it.
  check('a question only when the answer matters — the every-time rule is gone',
    /ASK ONLY WHEN THEIR ANSWER CHANGES WHAT HAPPENS NEXT/.test(src)
      && !/ONE QUESTION AT THE END, EVERY TIME/.test(src)
      && !/End most turns with a SPECIFIC question/.test(src), null)
  check('...never more than one, and one tap where it can be',
    /NEVER MORE THAN ONE/.test(src) && /MAKE IT ONE TAP/.test(src), null)
  // 26 Sep 2026: "every question goes LAST" was the prompt telling the coach
  // to do what the rubric marks 1 — a full prescription with the deciding
  // question hung on the end. The two kinds now go in two places.
  check('a question that decides the answer goes FIRST and ALONE, with no prescription beside it',
    /A QUESTION YOU NEED BEFORE YOU CAN ADVISE WELL[\s\S]{0,500}Ask it FIRST and ALONE/.test(src)
      && /No\s+prescription in the same turn/.test(src), null)
  check('...a follow-up after a complete answer goes last, and the blanket "it goes LAST" is gone',
    /A FOLLOW-UP AFTER A COMPLETE ANSWER[\s\S]{0,160}goes LAST/.test(src)
      && !/no list, no praise opener, and it goes LAST/.test(src), null)
  check('...and what is already in their plan is used, not asked',
    /If what decides the answer IS in their plan, logs or profile, do not ask it/.test(src), null)

  // THE EXAMPLES TEACH MORE THAN THE RULES. 26 Sep 2026: 12 of the 16
  // worked replies ended on a question, several of them filler under her 24
  // Sep ruling, and the graded run ended nearly every reply the same way. The
  // floor is a literal, not the count on the day it was written.
  {
    const a = src.indexOf('=== FEW-SHOT EXAMPLES ===')
    const b = src.indexOf('=== TEMPORAL AWARENESS ===', a)
    const sec = a < 0 || b < 0 ? '' : src.slice(a, b)
    const endings = [...sec.matchAll(/\nAssistant(?:, RIGHT)?: ([\s\S]*?)(?=\n\s*\n|\nUser:|\nAssistant, |$)/g)].map(m => {
      const lines = m[1].split('\n').map(l => l.trim()).filter(l => l && !/^\[(?:QUICK_REPLIES|BREAK|ACTION)/.test(l))
      return /\?["”]?$/.test(lines[lines.length - 1] ?? '')
    })
    const onAnswer = endings.filter(q => !q).length
    check('the worked examples mostly end on the answer (at least 40% of at least 12)',
      endings.length >= 12 && onAnswer / endings.length >= 0.4, `${onAnswer} of ${endings.length}`)
    const askFirst = sec.indexOf('A question that decides the answer goes FIRST and ALONE')
    const next = askFirst < 0 ? '' : (sec.slice(askFirst).match(/\nAssistant: ([^\n]+)/) ?? ['', ''])[1]
    check('...and one of them shows the deciding question asked first, with nothing prescribed',
      /^[^.!]*\?/.test(next), next)
  }
}

console.log('\nEVERY EDIT CARD SAYS WHAT IT COSTS THE WEEK — including the swap (14 Sep 2026)\n')
{
  // THE LAST SILENT SURFACE. CLAUDE.md named it: every other edit path states
  // its cost before the tap — removing an exercise, changing volume, adding
  // one, moving a meal — and the coach's SWAP said nothing. The reason was real
  // but narrow: its builder was synchronous and a faithful trial needs the
  // async load recompute, so it stayed quiet rather than guess. What did not
  // follow is that it had to stay quiet; the one dispatch site is already async
  // and already awaits two sibling builders.
  //
  // MEASURED BEFORE BUILDING: no check anywhere referenced describeEditImpact,
  // and nothing asserted the swap was silent. So this adds the guarantee rather
  // than flipping one.
  // Comments stripped before any absence is asserted — the note explaining a
  // removal must not satisfy the check that it was removed.
  const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const at = chat.indexOf('const buildExerciseSwapProposal')
  const body = at === -1 ? '' : chat.slice(at, chat.indexOf('const buildExerciseAddProposal', at + 10))
  check('the swap builder was found and bounded (sanity check on this check)', body.length > 400, body.length)

  check('the swap card reads its cost from a real trial, not a second guess',
    /await swapExerciseInMesocycle\(/.test(body), body.slice(0, 200))
  check('...turned into words by the one shared describer',
    /describeEditImpact\(/.test(body))
  check('...and both halves reach the card — what was fixed, and what it cost',
    /impact\.balancing/.test(body) && /impact\.cost/.test(body), body.slice(-400))
  // SEVERITY IS THE DIFFERENCE BETWEEN A NOTE AND A WARNING, and the cost is
  // the half she needs to actually see.
  check('...with the cost carried as a warning, not a footnote',
    /impact\.cost \?[^\n]*severity: 'warn'/.test(body), body.slice(-400))

  // THE TRIAL IS READ, NEVER SAVED. It produces a whole mesocycle; two
  // sentences come off it. A builder that persisted it would be doing the edit
  // at propose time, which is the one thing a proposal must not do.
  check('...and the trial is never persisted from the builder',
    !/saveMesocycle|onMesocycleUpdated|saveMesocycleWeek/.test(body), body)

  // THE WEIGHT STAYS DEFERRED. The original refusal was right about this half:
  // the trial's weights are real, but confirm re-runs against the live plan,
  // and a number here that confirm supersedes is worse than no number.
  check('...while the weight is still left to confirm rather than quoted',
    /Load recomputed for the new movement once you confirm/.test(body), body.slice(-400))

  // AND THE CALL SITE ACTUALLY AWAITS IT. Without this the card renders from a
  // Promise and every field reads undefined — the failure that would look like
  // "the coach stopped proposing swaps" rather than like a missing await.
  check('the one dispatch site awaits the builder',
    /const swap = await buildExerciseSwapProposal\(/.test(chat))
}

console.log('\nA change that works against the goal is ASKED about, not just warned')
{
  // THE CLIENT, not the edge function. `chat` in this file is
  // chat-gemini/index.ts; every rule below is about ChatAssistant.tsx, and
  // the first version of this section read `chat` and failed twelve checks
  // against a file that could never contain any of them.
  const ui = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  // The decision recorded in CLAUDE.md, 14 Sep 2026, taken on Ashley's
  // explicit delegation. The rules themselves live in edit-tradeoff.ts and
  // test:edit-tradeoff runs them; this section guards the WIRING — that the
  // client actually consults the verdict, and that a tier-2 ask does not
  // quietly write a card anyway.

  // EVERY BUILDER THAT RUNS A TRIAL READS IT. A builder that computed its own
  // opinion of the cost instead would be the two-implementations defect this
  // codebase keeps finding.
  for (const [label, kind] of [['swap', 'swap'], ['remove', 'remove'], ['add', 'add']] as const) {
    check(`the ${label} builder asks the engine what it costs the goal`,
      new RegExp(`adviseEdit\\(\\{[\\s\\S]{0,400}?kind: '${kind}'`).test(ui))
  }
  check('...from the SAME trial the confirm will apply, never a second guess',
    /adviseEdit\(\{[\s\S]{0,200}?after: trial/.test(ui))

  // THE ORDER IS THE BEHAVIOUR. The verdict must be consulted AFTER the
  // builders have run (so a trial exists) and BEFORE createPendingAction (so
  // a tier-2 can decline to make a card at all). Pinned as an ORDER rather
  // than on the text of either, per CLAUDE.md's property-not-mechanism rule.
  const askAt = ui.indexOf('if (shouldAsk(advice.verdict')
  const rowAt = ui.indexOf('const row = await createPendingAction(')
  const builtAt = ui.indexOf('if (!built) {')
  check('the verdict is consulted after the builders have run', askAt > builtAt && builtAt > 0, { builtAt, askAt })
  check('...and BEFORE any pending action is written', askAt < rowAt && rowAt > 0, { askAt, rowAt })

  // AND THE STEP IS REACHABLE — the one thing every check around it cannot
  // see. Measured 14 Sep 2026: changing the guard to `if (false && advice)`
  // disabled the whole trade-off step and all twelve checks in this section
  // still passed, because the source text they read was all still there. That
  // is CLAUDE.md's dead-branch trap, and a source gate cannot escape it.
  //
  // So this pins the guard's exact shape, which catches the realistic drift,
  // and `verify:tradeoff` drives a REAL tier-2 in a browser, which is the only
  // thing that actually proves the branch runs. Neither alone is enough; the
  // comment says so rather than letting the next reader assume this is proof.
  check('...and the step is not disabled by a constant',
    /\n      if \(advice\) \{\n/.test(ui), ui.slice(askAt - 200, askAt).slice(-120))

  // A TIER-2 ASK RETURNS A QUESTION AND NO ROW. An ask that still wrote a
  // pending action would be a warning with a Confirm button under it — the
  // thing "ask first" was chosen over.
  const askBlock = ui.slice(askAt, rowAt)
  check('the ask returns text only — no pendingAction in that branch',
    /return \{ text: askText\(advice\.verdict\) \}/.test(askBlock) && !/pendingAction/.test(askBlock), askBlock.slice(0, 200))
  check('...and records that it asked, so it asks once per block',
    /markAsked\(advice\.key\)/.test(askBlock))

  // A GUARDED-OUT TIER 2 STILL SAYS WHAT IT COST. Silence here would be the
  // regression: the ask suppressed AND the cost dropped.
  check('an ask that is guarded out falls through to a card that still states the cost',
    /applyTradeoff\(built\.diff, downgradeToCard\(advice\.verdict\)\)/.test(ui))

  // THE TWO GUARDS THAT KEEP IT FROM NAGGING, read off the real signals
  // rather than trusted to the engine, which cannot see either.
  check('mid-session is read from the live session, not guessed',
    /sessionRunning: activeSession\.status === 'running'/.test(ui))
  check('...and "asked already" survives a reload',
    /localStorage\.setItem\(ASKED_STORE/.test(ui) && /localStorage\.getItem\(ASKED_STORE/.test(ui))
  check('...failing safe — a storage error means ask again, never go quiet',
    /catch \{ seed = \[\] \}/.test(ui))
}

// THE AUTHORITATIVE EXIT, and it was missing.
//
// There is an earlier `if (failures > 0) process.exit(1)` part-way up this
// file — a fail-fast after the first phases. Everything added BELOW it
// accumulated into `failures` and was never read again, and the last line of
// the file said "All coach-promise checks passed" unconditionally. So every
// check in the last third of this gate printed FAIL and exited 0.
//
// FOUND 14 Sep 2026 by writing a section that failed twelve checks and
// watching the gate report success. It had been true of the swap-card section
// added the day before, which means those checks have never been able to fail
// a sweep. Both are live from here.
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}

console.log('\nAll coach-promise checks passed.\n')
