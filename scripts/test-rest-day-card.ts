// ---------------------------------------------------------------------------
// THE REST DAY CARD (design 4a) — the half a browser cannot reach.
//
// `verify:rest-day` drives the real card at 390x844 and owns everything
// geometric: no dotted underline survives, no two plan actions share a line,
// one tap logs. It cannot reach two things, and they are what this holds:
//
//   - THE MINT-WHEN-DONE SEGMENT. The harness fixture has nothing logged, so
//     `done` is 0 and the driver only ever sees the unfilled branch.
//   - THE DURATION DEFAULT. A chip offers the person's own last duration for
//     that activity. Proving that needs history, which the fixture has none of,
//     so the rounding and the fallback are CALLED here instead.
//
// Plus the two structural promises the handoff makes that no screenshot shows:
// the three cards stay three cards, and the cardio sheet's trigger moved
// without the sheet's own form changing.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { roundToNearestFive, DEFAULT_ACTIVITY_MINUTES, CARDIO_UNDO_WINDOW_MS } from '../src/lib/cardio-log-store'

const read = (f: string) => readFileSync(f, 'utf8')
/** Comments explaining a removal would otherwise satisfy a check that it was removed. */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const CARD = 'src/components/exercise/RestDayCard.tsx'
const SHEET = 'src/components/exercise/AddCardioSessionSheet.tsx'
const card = read(CARD)
const cardBare = strip(card)
const sheet = read(SHEET)
// THE SHARED CARDIO ROW, since 24 Sep 2026 (Ashley's "like a lifting set"):
// the chips, the typed "Other", the refusal and the undo moved out of this card
// into CardioSetRow, so the properties section 5 holds are asked of it.
const row = strip(read('src/components/exercise/CardioSetRow.tsx'))

console.log('rest-day-card gate\n')

// ===========================================================================
console.log('1. The duration on a chip is the person\'s own, rounded')
// ===========================================================================
check('a duration rounds to the nearest five', roundToNearestFive(28) === 30 && roundToNearestFive(32) === 30, [roundToNearestFive(28), roundToNearestFive(32)])
check('...rounding down as well as up', roundToNearestFive(52) === 50, roundToNearestFive(52))
// NEVER ZERO. saveCardioLog refuses a duration below 1, so a chip offering 0
// would be a control that cannot succeed — the one thing the must-have list
// forbids outright.
check('...and never below five, so a chip can never offer a duration the store would refuse',
  roundToNearestFive(1) === 5 && roundToNearestFive(0) === 5, [roundToNearestFive(1), roundToNearestFive(0)])
check('the fallback is thirty minutes, for somebody with no history', DEFAULT_ACTIVITY_MINUTES === 30, DEFAULT_ACTIVITY_MINUTES)
// A LITERAL ON ONE SIDE. Comparing the window against its own constant would
// agree with itself however it moved.
check('undo stays open for ten minutes, not until the next navigation',
  CARDIO_UNDO_WINDOW_MS === 10 * 60 * 1000 && CARDIO_UNDO_WINDOW_MS >= 60_000, CARDIO_UNDO_WINDOW_MS)

const store = strip(read('src/lib/cardio-log-store.ts'))
const reader = store.slice(store.indexOf('export async function getRecentActivityDurations'), store.indexOf('export function roundToNearestFive'))
check('the reader was located (sanity check on this section)', reader.length > 400, reader.length)
check('...it reads the pending queue as well as the server, so a just-logged tap is remembered',
  /loadPending\(\)/.test(reader) && /from\('cardio_logs'\)/.test(reader))
// THE MIGRATION RULE, one file over: naming a column is a dependency, and a
// failure here must cost the default rather than the screen.
check('...naming no column, so a pending migration costs the default and not the card',
  /\.select\('\*'\)/.test(reader) && !/\.select\('[^']*activity_name/.test(reader))
check('...and refuses an implausible stored duration rather than putting it on a chip',
  /isPlausibleCardioDuration/.test(reader))

// ===========================================================================
console.log('\n2. The week track, including the branch no fixture reaches')
// ===========================================================================
const track = cardBare.slice(cardBare.indexOf('function WeekTrack'), cardBare.indexOf('const QUICK_ACTIVITIES'))
check('the track was located (sanity check on this section)', track.length > 300, track.length)
check('it draws one segment per PLANNED session', /length: planned/.test(track), track.slice(0, 0))
check('...marks the done ones in mint and the rest faint — the branch the driver cannot see',
  /i < done \? 'var\(--primary\)'/.test(track) && /color-mix\(in srgb, var\(--primary\)/.test(track))
check('...and renders nothing at all when the week has no planned sessions',
  /if \(planned <= 0\) return null/.test(track))
check('the two ends of the track say different things at zero and at full',
  /week complete/.test(track) && /to go/.test(track))
// The sentence it replaces must be gone from the whole file, not just this card.
check('no card still prints the old "sessions done." sentence',
  !/sessions done\./.test(cardBare))

// ===========================================================================
console.log('\n3. The defect, held by source as well as by screen')
// ===========================================================================
// verify:rest-day measures this on a real screen. Here it is a grep, and the
// two are not redundant: the driver proves the RENDERED card is clean, this
// proves nobody reintroduces the class in a branch the fixture never renders.
check('not one dotted underline is left anywhere in the three cards',
  !/decoration-dotted/.test(cardBare),
  cardBare.split('\n').filter(l => /decoration-dotted/.test(l)))
check('the plan actions are rows with a 44px floor', /min-h-11/.test(cardBare))
check('...each carrying a subtitle prop, which is what stops them reading as duplicates',
  /subtitle:\s*string/.test(cardBare) && (cardBare.match(/subtitle=/g) ?? []).length >= 3,
  (cardBare.match(/subtitle=/g) ?? []).length)
check('...and the cardio one is plural and block-scoped, matching what it writes',
  /Make \$\{dayName\}s a cardio day/.test(cardBare) && /Every \$\{dayName\} for the rest of this block/.test(cardBare))
check('...while "Train anyway" is scoped to today alone',
  /Borrow another day's session — today only/.test(cardBare))

// ===========================================================================
console.log('\n4. Who owns the cardio trigger')
// ===========================================================================
// The sheet kept its own dotted link for ActiveRecoveryCard, where the control
// is an aside. RestDayCard took it over, because there it was one of three
// identical links. Both halves are asserted: a regression either way is a
// defect — a second trigger on the rest day, or none on active recovery.
check('the sheet still offers its own trigger by default, for the sibling card',
  /startOpen = false/.test(sheet) && /Make \{dayName\} a cardio day/.test(strip(sheet)))
check('...and renders nothing rather than a stray link when its owner supplies one',
  /if \(startOpen\) return null/.test(strip(sheet)))
const restBody = cardBare.slice(cardBare.indexOf('export function RestDayCard'), cardBare.indexOf('export function MovedDayCard'))
const recoveryBody = cardBare.slice(cardBare.indexOf('export function ActiveRecoveryCard'))
check('the rest day owns the trigger itself', /startOpen/.test(restBody))
check('...and active recovery deliberately does not', !/startOpen/.test(recoveryBody))
check('the sheet is still lazily loaded on both, so its weight stays off first paint',
  (cardBare.match(/<Suspense/g) ?? []).length >= 2 && /lazy\(\(\) => import\('\.\/AddCardioSessionSheet'\)/.test(cardBare))
// The form itself is UNCHANGED — the handoff moved the trigger, not the form.
check('the form still says what it reaches, before the tap',
  /rest of this block — not just today/.test(sheet))
check('...and still validates its minutes', /isPlausibleCardioDuration/.test(sheet))

// ===========================================================================
console.log('\n5. Everything the rebuild had to keep')
// ===========================================================================
const entry = row.slice(row.indexOf('export function UnplannedCardioEntry'))
check('the entry sections were located (sanity check on this section)', entry.length > 1500 && row.indexOf('export function UnplannedCardioEntry') > 0, entry.length)
check('the rest-day card draws its logging from the shared row, not its own form',
  /<UnplannedCardioEntry /.test(cardBare) && !/saveCardioLog\(/.test(cardBare))
check('the typed form survives as the "Other" path, validation and all',
  /pick === 'other'/.test(entry) && /isPlausibleCardioDuration\(mins\)/.test(entry) && /MAX_PLAUSIBLE_CARDIO_MINUTES/.test(entry))
check('...reporting a refusal on screen rather than reverting silently',
  /if \(!view\) \{ setError\(/.test(entry))
check('a one-tap log reports a failed write too, not just the typed form',
  /That didn't save — try again in a moment\./.test(entry))
const readbackFn = row.slice(row.indexOf('export function CardioReadback'), row.indexOf('export function EffortBox'))
check('undo still deletes by the client id the write returned',
  /deleteCardioLog\(log\.clientId\)/.test(readbackFn))
check('...and is only OFFERED while the store can still honour it, so it never pretends',
  /const undoable = isCardioLogUndoable\(log\.clientId\)/.test(readbackFn) && /\{undoable && \(/.test(readbackFn))
check('the tomorrow preview is still disabled when there is nowhere to peek',
  /disabled=\{!onPeek\}/.test(cardBare))
check('...and still prints the caller\'s own detail string rather than reformatting it',
  /\{tomorrow\.detail\}/.test(cardBare))
check('the train-anyway row is hidden entirely when there is nothing to borrow',
  /trainAnywayOptions\.length > 0/.test(restBody))
// alsoLabel is what keeps ActiveRecoveryCard from asking the same question twice.
check('a day that already prescribes something asks a different question',
  /const asked = alsoLabel \|\|/.test(cardBare) && /asked \? 'Did anything else\?' : 'Did you move today\?'/.test(cardBare))
check('...and drops the "your plan doesn\'t change" caption there, because it already did',
  /!alsoLabel && \(/.test(cardBare))

// ===========================================================================
console.log('\n6. Three cards, still three cards')
// ===========================================================================
for (const name of ['RestDayCard', 'MovedDayCard', 'ActiveRecoveryCard']) {
  check(`${name} is still its own export`, new RegExp(`export function ${name}\\(`).test(cardBare))
}
check('active recovery keeps its warn-role colouring rather than inheriting the violet',
  /var\(--role-warn-bg\)/.test(recoveryBody) && /var\(--role-warn\)/.test(recoveryBody))
// BOTH of them: the walk the plan prescribes AND the suggestion an otherwise
// empty day gets. The first version asked for one row and so passed with the
// suggestion deleted — found by mutation.
check('...and its prescribed rows, drawn by the shared cardio row — the planned session and the suggestion',
  /<PlannedCardioRow prescription=\{planned\}/.test(recoveryBody) && /<PlannedCardioRow prescription=\{cardio\}/.test(recoveryBody))
// The violet is the recovery role, from the token rather than the mock's hex.
check('the rest day wears the violet role from the token, not a literal',
  /var\(--role-ai-text\)/.test(restBody) && !/#B4A9FF/.test(card))

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
console.log('\nOne job, and plan actions that say what they reach.\n')
