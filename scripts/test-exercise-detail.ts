/**
 * Gate: the technique panel, and the 635 cues that had no reader.
 *
 * Ashley: "I want there to be exercise demonstrations in the app and form
 * cues, currently the chat can link to a YouTube video but there's nowhere in
 * the app to see an exercise."
 *
 * She was right that there was nowhere — and the striking part is that the
 * content was already written. All 158 catalogue entries carry `form_cues`,
 * 635 of them, and NOTHING IN THE REPO READ THEM: not the UI, not a prompt,
 * not a test. They shipped in every bundle and were never shown to anyone.
 * `coach_note_swap` was barely better, rendered only on the ALTERNATIVES in
 * the swap dialog — so the app would explain a movement you were considering
 * and never the one you were about to perform.
 *
 * §1 protects the data the panel needs. §3 protects the wiring, because a
 * correct dialog nothing opens is the failure mode this repo keeps producing.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { EXERCISE_DATABASE, getExerciseEntry, jointListDisplay } from '../src/lib/exercise-db'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const panel = read('src/components/exercise/ExerciseDetailDialog.tsx')
const row = read('src/components/exercise/ExerciseRow.tsx')
const peek = read('src/components/exercise/PeekPanel.tsx')
const dayList = read('src/components/exercise/ReadOnlyDayList.tsx')
const program = read('src/components/exercise/ProgramBrowse.tsx')
const tab = read('src/components/exercise/ExerciseTab.tsx')
const today = read('src/components/exercise/TodayPanel.tsx')
const swap = read('src/components/exercise/SwapDialog.tsx')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

console.log('\n1. Every exercise can answer "how do I do this?"\n')
const missing = EXERCISE_DATABASE.filter(e => !e.form_cues || e.form_cues.length === 0)
check(`all ${EXERCISE_DATABASE.length} entries have cues`, missing.length === 0, missing.map(e => e.name))
const thin = EXERCISE_DATABASE.filter(e => (e.form_cues ?? []).length < 3)
check('...and none has fewer than three', thin.length === 0, thin.map(e => e.name))
check('every entry has its one-line rationale too',
  EXERCISE_DATABASE.every(e => !!e.coach_note_swap?.trim()))
// The cues were written as internal notes. They are shown to users now, so
// the absence of internal vocabulary is a property worth holding, not luck.
const jargon = EXERCISE_DATABASE.filter(e =>
  (e.form_cues ?? []).some(c => /_|tier[0-9]|substitution|RPE\b|null|undefined/.test(c)))
check('no cue leaks internal vocabulary to the screen', jargon.length === 0,
  jargon.slice(0, 3).map(e => ({ [e.name]: e.form_cues })))

console.log('\n2. The panel shows what it has, and admits what it does not\n')
check('it reads cues from the catalogue', /entry\.form_cues\.map/.test(panel))
check('it shows the rationale that used to appear only on other exercises',
  /entry\.coach_note_swap/.test(panel))
check('it shows muscles and equipment', /primary_muscles/.test(panel) && /entry\.equipment/.test(panel))
// jointListDisplay exists because `lower_back_axial` is not a phrase — anyone
// with a bad back once read "Loads your lower back axial" on a real screen.
check('joint names go through jointListDisplay, never the raw tag',
  /jointListDisplay\(entry\.indicated_joints/.test(panel)
  && /jointListDisplay\(entry\.contraindicated_joints/.test(panel)
  && !/\{entry\.contraindicated_joints\.join/.test(panel))
check('...and that helper really does render English',
  jointListDisplay(['lower_back_axial', 'knee']) === 'lower back and knee',
  jointListDisplay(['lower_back_axial', 'knee']))
check('an unknown exercise is admitted, not rendered blank', /isn&apos;t in the exercise catalogue/.test(panel))
check('it says what it is not — cues are a reminder, not coaching',
  /reminders, not coaching/.test(panel) && /reason to stop/.test(panel))
// The panel must survive the real data for every entry.
const sample = getExerciseEntry('Deadlifts')
check('a known lift resolves with cues', !!sample && sample.form_cues.length >= 3, sample?.form_cues)

console.log('\n3. It is reachable — from BOTH menus\n')
check('ExerciseTab owns one instance', /<ExerciseDetailDialog/.test(tab) && /detailTarget/.test(tab))
check("today's session menu opens it", /onOpenDetail\(ex\.name\)/.test(row) && /How to do it/.test(row))
// THE MENU MOVED, AND THIS CHECK MOVED WITH IT. It read PeekPanel, which no
// longer draws its own menu — every browse surface renders through
// ReadOnlyDayList now, so the peek's copy went with the table it was fixing.
// Reading the old file went red for a feature that works, so assert the menu
// where it lives AND the prop threading that reaches it, rather than either
// half alone.
check('the shared browse menu opens it', /onOpenDetail\(ex\.name\)/.test(dayList) && /How to do it/.test(dayList))
check('...and the peek threads the prop into that menu',
  /onOpenDetail=\{onOpenDetail\}/.test(peek))
// The program view deliberately does NOT pass onOpenDetail today — it has no
// dialog wired to it, and a menu item that opens nothing is worse than an
// absent one. Asserted so its absence reads as a decision, not an omission.
check('...while the program view offers history instead, not technique',
  /onOpenHistory=\{onOpenHistory\}/.test(program) && !/onOpenDetail=/.test(program))
// The prop has to survive the whole thread or the menu item never renders:
// ExerciseTab -> TodayPanel -> ExerciseList -> rowProps -> ExerciseRow.
// SLICED, not windowed. Two earlier versions of this check used a character
// budget — one matched the same three names in ExerciseList's destructuring
// and stayed green when the forwarding was deleted; the next guessed 1200
// when the real distance was 1406 and went red on a correct file. A magic
// number is not a bound. Take the function body and look inside it.
const rowPropsStart = today.indexOf('const rowProps = (')
const rowPropsBody = rowPropsStart < 0 ? '' : today.slice(rowPropsStart, today.indexOf('\n  }', rowPropsStart))
check('rowProps exists to be checked (sanity check on this check)', rowPropsBody.length > 200, rowPropsBody.length)
check('TodayPanel forwards it into rowProps — the line that makes it appear',
  /onOpenDetail/.test(rowPropsBody))
check('...and into the peek', /<PeekPanel[\s\S]{0,400}?onOpenDetail=\{onOpenDetail\}/.test(today))

console.log('\n4. Searching the catalogue no longer tells you less than browsing it\n')
// The two lists use different loop variables, and that is the discriminator:
// ranked candidates render `c.note` (assembled by getSmartReplacements),
// searched ones map over `exercise`. So `exercise.coach_note_swap` appearing
// at all means the search branch has it. Deliberately NOT a distance-based
// regex — the first version used a 1400-char window, the real gap was 1481,
// and it failed on a correct file.
// The GUARD, not just the string. Replacing the condition with `false` leaves
// `exercise.coach_note_swap` sitting in the unreachable body, and a presence
// check passes on markup that never renders — the dead-code failure again,
// one layer down. Caught by mutation.
check('free-search results carry the coaching note',
  /\{exercise\.coach_note_swap && \(/.test(swap))
check('...and the ranked list still has its own', /\{note\}/.test(swap))

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\n635 cues, finally with a reader.\n')
