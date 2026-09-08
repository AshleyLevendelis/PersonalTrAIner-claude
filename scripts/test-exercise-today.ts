/**
 * Gate: the Exercise tab leads with today, and says one true thing about it.
 *
 * Three things this file holds down, each of which has already gone wrong
 * once in some form:
 *
 *  1. THE PRIMARY ACTION IS REACHABLE. "Start workout" was a small button in
 *     the hero, which scrolled off the moment anyone read past the first
 *     exercise — the one control the screen exists for, absent for most of
 *     the screen. It is a fixed bar now, and §1 asserts it stays fixed, stays
 *     clear of the tab bar, and rides above BottomDock using the height the
 *     dock already publishes rather than a second guess at it.
 *
 *  2. THE COACHING LINE HAS A PRECEDENCE, AND IT IS ASSERTABLE. Three
 *     candidate sentences, one slot. §2 tests session-nudge.ts directly,
 *     because "which of these three wins" cannot be read off JSX.
 *
 *  3. NOTHING IS SAID TWICE, AND NOTHING IS LOST. The week note can appear in
 *     the nudge or in the context row, never both; "Add unplanned work" moved
 *     out of the overflow menu and must be gone from it, not duplicated. §3
 *     asserts both halves of each, the same way test:tab-ownership does for a
 *     row that changes tabs.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { sessionNudge } from '../src/lib/session-nudge'
import { calibrationCueText } from '../src/components/exercise/CalibrationCue'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const today = read('src/components/exercise/TodayPanel.tsx')
const contextRow = read('src/components/exercise/WeekContextRow.tsx')
const cue = read('src/components/exercise/CalibrationCue.tsx')
const nudgeComponent = read('src/components/TrainerNudge.tsx')

/**
 * Comments stripped before any "is it gone?" check. A file that explains WHY
 * a control moved out of it names that control in prose — counting that as a
 * call site is how test-no-dead-code's own list came to include two functions
 * that were already wired up.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const contextRowCode = stripComments(contextRow)
const todayCode = stripComments(today)

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

// ---------------------------------------------------------------------------
console.log('\n1. Start workout is a fixed bar, and it does not sit on anything')
// ---------------------------------------------------------------------------
check('the CTA is fixed, not in the scroll', /className="fixed inset-x-0 z-40[^"]*"/.test(today))
// RE-ANCHORED 8 Sep 2026. This pinned the literal JSX `>Start workout<`, which
// stopped matching the moment the label became conditional — a day already
// swapped for something else now reads "Train it anyway" instead (§5). The
// property was never "this exact markup"; it is that an ORDINARY training day
// still offers Start workout, and that it is the default rather than the
// special case.
check('...and reads "Start workout" on an ordinary day',
  /: 'Start workout'\}/.test(today) || />\s*Start workout\s*</.test(today))
check('...at 52px', /h-\[52px\]/.test(today))
check('...clear of the tab bar and the home indicator',
  /TAB_BAR_HEIGHT_PX\}px \+ env\(safe-area-inset-bottom\)/.test(today))
// THE DOCK COLLISION. Both are fixed to the same baseline; the dock is z-50
// against this bar's z-40, so without the offset a running rest timer would
// sit directly on top of the button. Measured, never assumed — the dock has
// three shapes and the rest card's height depends on whether the exercise
// name wraps.
check('...and above BottomDock, using the height the dock publishes',
  /useBottomDockHeight\(\)/.test(today) && /dockHeightPx > 0 \? dockHeightPx \+ 12 : 0/.test(today))
check('...rather than a hard-coded guess at the dock height',
  !/bottom:\s*`calc\([^`]*\+ 6[048]px/.test(today))
// A fixed bar over the last row is the same bug in a nicer shirt.
check('the list is padded so the last row clears the bar', /className="h-\[100px\]"/.test(today))
// RE-ANCHORED 7 Sep 2026. The name of this check has always been right and
// the assertion was not: `status !== 'running'` is true of a FINISHED session
// as well as an unstarted one, so the bar came back over a day whose every
// exercise was struck through and ticked. Ashley saw it and reported it. The
// check now asserts what it always said it did.
check('the bar only exists before the session starts', /status === 'idle' && \(/.test(today))
// Finish is not duplicated into the bar: BottomDock's own comment promises it
// stays singly owned in the hero, and two Finish buttons is how a session gets
// closed by accident.
check('Finish stays in the hero, one of it', (today.match(/Finish session/g) ?? []).length === 1)
check('...and the hero no longer carries a Start button too',
  !/>Start session</.test(todayCode))

// ---------------------------------------------------------------------------
console.log('\n2. The coaching line: the most specific true thing, or nothing')
// ---------------------------------------------------------------------------
{
  const NOTE = 'Load goes up again this week.'
  const CUE = 'Calibration: leave 3-4 reps in reserve. Log what you actually do.'
  const base = { mainLiftName: 'Bench Press', progressionNote: null, calibrationCue: null, coachNote: null }

  check('nothing to say → silent', sessionNudge(base) === null)
  check('...and blank strings are nothing, not something',
    sessionNudge({ ...base, progressionNote: '  ', calibrationCue: '', coachNote: '   ' }) === null)

  const week = sessionNudge({ ...base, coachNote: NOTE })
  check('the week note is the floor', week?.source === 'week-note' && week.text === NOTE, week)

  const calib = sessionNudge({ ...base, calibrationCue: CUE, coachNote: NOTE })
  check('a calibration cue outranks the week note', calib?.source === 'calibration' && calib.text === CUE, calib)

  const prog = sessionNudge({ ...base, progressionNote: 'goes to 62.5 kg', calibrationCue: CUE, coachNote: NOTE })
  check('a progression note outranks both', prog?.source === 'progression', prog)
  check('...and is prefixed with the lift it is about', prog?.text === 'Bench Press: goes to 62.5 kg', prog)
  // "Bench Press — Bench Press goes to 62.5 kg" is what naive prefixing gives
  // on the notes that already name themselves.
  const named = sessionNudge({ ...base, progressionNote: 'Bench Press goes to 62.5 kg' })
  check('...but never twice when the note already names it',
    named?.text === 'Bench Press goes to 62.5 kg', named)
  const noLift = sessionNudge({ ...base, mainLiftName: null, progressionNote: 'goes to 62.5 kg' })
  check('...and a day with no main lift still speaks', noLift?.text === 'goes to 62.5 kg', noLift)

  check('TodayPanel uses the rule rather than an inline chain', /sessionNudge\(\{/.test(today))
  check('...and renders it through the shared nudge, never bare text',
    /\{todayNudge && \(/.test(today) && (today.match(/<TrainerNudge/g) ?? []).length === 2)
  // The cue is ONE string with two renderers, not two copies that drift.
  check('the calibration copy has a single source', /export function calibrationCueText/.test(cue))
  check('...and the row renders that, not its own copy',
    /<span>\{calibrationCueText\(hasLoad\)\}<\/span>/.test(cue))
  check('...and TodayPanel reads the same one', /calibrationCueText\(/.test(today))

  // THE CUE MUST NOT ARGUE WITH THE NUMBER ABOVE IT. Ashley, 7 Sep 2026:
  // "it tells the user to work up to a wight they could lift 3-4more times
  // but also has weights for the working sets, so its unclear if the user
  // should do the prescribed weights or work up".
  //
  // Note WHICH branch was doing it: the hasLoad one, which fires only where a
  // prescribed weight is on screen. So the loaded variant has to relate the
  // two — the printed number is the first rung — rather than issue a second,
  // unconnected instruction.
  const loaded = calibrationCueText(true)
  const loadless = calibrationCueText(false)
  check('the loaded cue names the printed weight as where to START',
    /start at the weight shown/i.test(loaded), loaded)
  check('...rather than sending them off to find one of their own',
    !/work up to a weight/i.test(loaded), loaded)
  check('...and still says where to finish', /3-4 reps in reserve/.test(loaded), loaded)
  // A blank weight box logs the PRESCRIBED number (SetGrid's defaultWeightFor,
  // which is Ashley's own ruling and the tour promises it). So a cue that says
  // "work up" and then "log what you do" is satisfied by a tap that records
  // 72.5 for a set performed at 100. It has to ask for the number.
  check('...and asks them to TYPE it, because tapping the tick logs the prescription',
    /type what you finish on/i.test(loaded), loaded)
  // One vocabulary. "3-4 more times" and "3-4 reps in reserve" were the same
  // instruction in two costumes, on two branches of one function.
  check('both variants use one effort target, worded one way',
    /3-4 reps in reserve/.test(loaded) && /3-4 reps in reserve/.test(loadless), { loaded, loadless })

  // The chip above the number carries the other half. Week 1 read exactly
  // like week 7 — "suggested" either way — which left the cue alone in saying
  // the number was a seed.
  const chip = read('src/components/exercise/LoadChip.tsx')
  check('a calibration week labels its number a starting point, not a suggestion',
    /source === 'estimate' && calibration\) return 'starting point'/.test(chip))
  check('...and only a calibration week does', /if \(source === 'estimate'\) return 'suggested'/.test(chip))
  check('...with an explainer that repeats the cue rather than competing with it',
    /calibration && source === 'estimate'/.test(chip) && /3-4 reps in reserve/.test(chip))
  // A flag, NOT a fifth PrescribedLoadSource: the number's provenance really
  // is an estimate, and inventing a fifth state would have rippled into
  // warmup, plan-adaptations, body-units, the weight-basis offer and the
  // coach's plan context for the sake of two words on a chip.
  check('...carried as a presentation flag, leaving load_source alone',
    !/'calibration'/.test(read('src/lib/load-prescription.ts').slice(0, 4000)))

  // EVERY ROW OF THE WEEK, not just the anchor. showCalibrationCue is true
  // for one row per session; a chip label wired to it would make some lifts
  // read as prescribed and others as seeds within one session.
  const row = read('src/components/exercise/ExerciseRow.tsx')
  check('the chip label is driven by the WEEK, not by which row got the cue',
    /loadSourceLabel\(loadSource, isCalibrationWeek\)/.test(row) && /calibration=\{isCalibrationWeek\}/.test(row))
  check('...and TodayPanel passes the week to every row',
    /isCalibrationWeek: !!currentMesoWeekObj\?\.isCalibrationWeek/.test(today))

  // The default that made "log what you do" ambiguous is deliberately UNCHANGED.
  const setGrid = read('src/components/exercise/SetGrid.tsx')
  // THE SAVE PATH, not merely a mention of the helper. A first version of
  // this check tested for /defaultWeightFor\(setNumber\)/ anywhere in the file
  // and passed with the save fallback replaced by '0' — the placeholder three
  // hundred lines below still named the function. Caught by mutation.
  check('a blank weight still logs the prescribed number, as ruled',
    /input\.weight \|\| \(ghost \? String\(ghost\.weight_kg\) : defaultWeightFor\(setNumber\)\)/.test(setGrid))
  check('...and the box shows that same number, so the tick keeps its promise',
    /placeholder=\{isBW \? 'BW' : \(ghost \? String\(ghost\.weight_kg\) : defaultWeightFor\(setNumber\)\)\}/.test(setGrid))
}

// ---------------------------------------------------------------------------
console.log('\n3. Said once: the week note, and the way into unplanned work')
// ---------------------------------------------------------------------------
check('the context row can be told the nudge is carrying the note',
  /coachNoteShownBelow/.test(contextRow))
check('...and suppresses its own copy when it is',
  /!expanded && coachNote && !coachNoteShownBelow/.test(contextRow))
check('...and TodayPanel tells it, from the source that actually won',
  /coachNoteShownBelow=\{todayNudge\?\.source === 'week-note'\}/.test(today))
// The other direction: with the nudge saying something else, the note must
// still be on screen untapped. Ashley, 3 Sep 2026: "the notes section doesn't
// populate" — that fix is not allowed to regress into "only behind a chevron".
check('...so the note is never only behind the chevron',
  /\{!expanded && coachNote && !coachNoteShownBelow && \(/.test(contextRow))
check('a long week note is capped rather than pushing the session off screen',
  /<TrainerNudge text=\{todayNudge\.text\} clamp=\{!weekNotesOpen\}/.test(today) && /clamp && 'line-clamp-3'/.test(nudgeComponent))
// ...and uncapped once it is opened, in place, rather than reprinted above.
check('...and expanding unclamps it rather than printing it twice',
  /clamp=\{!weekNotesOpen\}/.test(today)
  && /coachNote && !coachNoteShownBelow && <p/.test(contextRow))
// A CLAMPED LINE ENDS IN AN ELLIPSIS, AND AN ELLIPSIS IS A PROMISE. Its
// chevron opens the disclosure that holds the rest of the sentence, not the
// chat tab — which is why the disclosure's open state is controlled by
// TodayPanel rather than private to the row.
check('...and its chevron opens the rest of that sentence, not chat',
  /onOpen=\{weekNotesOpen \? undefined : \(\) => setWeekNotesOpen\(true\)\}/.test(today))
check('...which is the SAME state the week row\'s own chevron toggles',
  /expanded=\{weekNotesOpen\}/.test(today) && /onToggleExpanded=\{setWeekNotesOpen\}/.test(today))
check('...so the row keeps no private copy of it', !/useState\(false\)/.test(contextRowCode))
check('the chevron only ever has one destination',
  /onClick=\{openChat \? \(\) => \{ window\.location\.hash = tabHash\('chat'\) \} : onOpen\}/.test(nudgeComponent))

check('"Add unplanned work" is a visible control again', /＋ Add unplanned work/.test(today))
check('...on a 44px target', /hit-slop-44[\s\S]{0,200}＋ Add unplanned work/.test(today))
check('...and is GONE from the overflow menu, not duplicated',
  !/Add unplanned work/.test(contextRowCode) && !/ListPlus/.test(contextRowCode))
check('...while session history stays in it', /Session history/.test(contextRow))

// ---------------------------------------------------------------------------
console.log('\n4. The week context is context — no card, tertiary, strip under it')
// ---------------------------------------------------------------------------
check('the --surface-raised box is gone', !/var\(--surface-raised\)/.test(contextRowCode))
check('...and so is the rounded panel it sat in', !/rounded-2xl/.test(contextRowCode))
check('the context line is tertiary, not foreground', /text-\[0\.78125rem\] text-text-tertiary/.test(contextRow))
check('the tour anchor survived the restyle', /data-tour="extoday"/.test(contextRow))
check('the strip sits 12px under the line', /className="mt-3 flex items-start justify-between"/.test(contextRow))
// The assistant has one name in UI text.
check('nothing on this screen calls it "Coach"',
  !/Coach:/.test(contextRowCode) && !/Coach:/.test(todayCode), 'Coach: found')

// ---------------------------------------------------------------------------
console.log('\n5. The rest dock: one number, the lift it belongs to, and both directions')
// ---------------------------------------------------------------------------
{
  const dock = stripComments(read('src/components/BottomDock.tsx'))
  check('the running rest row is --surface-raised, not a card',
    /linear-gradient\(var\(--surface-raised\), var\(--surface-raised\)\)/.test(dock))
  // THE TINT IS 28% ALPHA. Painted alone it let the exercise row underneath
  // read straight through the dock — caught in the browser, not by tsc.
  check('...composited over an opaque surface, not floated on the tint alone',
    /var\(--surface-raised\)\), var\(--surface-deep\)/.test(dock))
  check('...at 44px', /minHeight: 44/.test(dock))
  check('the countdown is the one big mono number', /tabular-mono text-\[1\.125rem\] font-semibold/.test(dock))
  check('...and the lift sits under it rather than trailing the clock',
    /Rest · \{restLabel\}/.test(dock) && !/· rest · \{restLabel\}/.test(dock))
  // THE GAP THE RESTYLE CLOSED. adjustRest has always taken a negative
  // delta; nothing on this dock ever sent one, so "I'm ready sooner" meant
  // Skip — which also throws away the "ready for set N" prompt.
  check('rest can be shortened, not only extended', /adjustRest\(-30\)/.test(dock))
  check('...and is disabled when there is nothing left to take off',
    /disabled=\{restMs <= 30_000\}/.test(dock))
  check('...so a tap reading "a bit less" cannot flip the dock to overrun',
    /restMs <= 30_000/.test(dock) && /const isOverrun = hasRest && restMs <= 0/.test(dock))
  // `text-primary` became `text-primary-text` on 6 Sep 2026 when the accent
  // split into a fill and a text step; Skip is words, so it takes the text
  // one. The requirement is unchanged: of -30s / +30s / Skip, only Skip is
  // in the accent.
  check('Skip is still there and still the primary of the three',
    /text-primary-text" onClick=\{dismissRest\}/.test(dock)
    && /text-text-tertiary[^"]*"\s*\n?\s*disabled/.test(dock))
  check('the elapsed fill survived the restyle', /fillFraction \* 100/.test(dock))
}

// ---------------------------------------------------------------------------
// A DAY THEY SWAPPED SAYS SO — on this screen, not only on the strip.
//
// Ashley, 8 Sep 2026. She told the coach she had missed the morning session
// and done Muay Thai instead. Both writes landed (workout_sessions
// .swapped_for_activity, and a 60-minute cardio_log), and the week strip drew
// its swap glyph correctly. This panel read neither and went on offering
// "Start workout" for the session she had just replaced — the app agreeing
// with itself on one screen and not the other.
// ---------------------------------------------------------------------------
console.log('\n5. A swapped day says so')
{
  const strip = readFileSync(join(ROOT, 'src/hooks/useTrainingWeek.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const todayPanel = readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  // ONE SOURCE. The state and the activity name have to travel together, or
  // the next reader re-derives one of them and they drift apart again.
  check('the week day carries what they did instead, beside the state',
    /swappedForActivity\?: string \| null/.test(strip))
  check('...populated from the same row the state is derived from',
    /state, swappedForActivity: dashboardDay\?\.session\?\.swapped_for_activity/.test(strip))

  // The BINDING, not just the expression. A first version matched the lookup
  // anywhere in the file, and survived a mutation that left the lookup in
  // place on a dead variable while forcing swappedToday to null — the exact
  // defect being fixed, with the evidence still on screen.
  check('today\'s panel reads the swap from the week hook, not a second query',
    /const swappedToday = weekTrain\.days\.find\(d => d\.date === today\)\?\.state === 'swapped'/.test(todayPanel))
  check('...and the name it renders comes from that same lookup',
    /\?\.swappedForActivity \|\| 'something else'\)\s*:\s*null/.test(todayPanel))
  check('...and never queries workout_sessions itself',
    !/from\('workout_sessions'\)/.test(todayPanel))

  check('the screen names the activity',
    /You swapped today for <span className="font-semibold">\{swappedToday\}<\/span>/.test(todayPanel))
  check('...and still offers the session rather than hiding it',
    /This session is still here if you want it/.test(todayPanel))

  // THE ACTUAL DEFECT. Not that a banner is missing, but that the primary
  // action claimed the session was still ahead of her.
  check('the button stops saying "Start workout" on a day already swapped',
    /\{swappedToday \? 'Train it anyway' : 'Start workout'\}/.test(todayPanel))
  check('...and drops out of the accent, so it reads as the escape hatch it is',
    /variant=\{swappedToday \? 'outline' : 'default'\}/.test(todayPanel))
}

if (failures > 0) { console.error(`\n${failures} exercise-today check(s) FAILED\n`); process.exit(1) }
console.log('\nAll exercise-today checks passed.\n')
