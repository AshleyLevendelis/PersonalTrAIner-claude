// ---------------------------------------------------------------------------
// Gate: the coach can change volume and schedule, and cannot do it unsafely.
//
// Audit §2.4. Both tools have been declared and DECLINED on every call since
// they were written — chat-gemini's own description says "NOT SAFELY WIRED UP
// YET", and the prompt tells the model to describe what it would do and send
// the user to in-app controls instead. (Controls which, for volume, do not
// exist: setExtraSets is live-session state, gone tomorrow.)
//
// They were unsafe for a specific reason worth keeping in view: the original
// adjust_volume multiplied a day's sets by a MODEL-CHOSEN factor, respecting
// neither the per-role floors and ceilings nor the session's time budget.
//
// So the property this holds is not "volume can change" — it is that every
// bound belongs to the engine and none of them can be talked past. Section 1
// runs the real adjuster against real exercises.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { adjustDayVolume, describeVolumeChange, isVolumeAdjustable } from '../src/lib/volume-adjust'
import { getRoleSetFloor, getRoleSetCeiling } from '../src/lib/exercise-plan'
import { getExerciseEntry, getVolumeRole } from '../src/lib/exercise-db'
import { estimateDaySeconds, getSessionMaximumSeconds } from '../src/lib/session-duration'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const profile = { session_duration_preference: '60-75' } as unknown as UserProfile

const day = (exercises: { name: string; sets: number }[]): WorkoutDay => ({
  day: 'Tuesday',
  exercises: exercises.map(e => ({
    // `rest` is a STRING on Exercise ('90s'), and estimateDaySeconds parses
    // it — a fixture using rest_seconds threw inside the estimator rather
    // than failing a check, which is how this fixture found the real bug
    // below: adjustDayVolume had no guard for a malformed exercise.
    name: e.name, sets: e.sets, reps: '8-10', rest: '90s',
  })),
} as unknown as WorkoutDay)

const NAMES = ['Barbell Bench Press', 'Dumbbell Rows', 'Lateral Raises']
for (const n of NAMES) {
  const entry = getExerciseEntry(n)
  if (!entry) { console.error(`Fixture exercise missing from the database: ${n}`); process.exit(1) }
}
const roleOf = (n: string) => getVolumeRole(getExerciseEntry(n)!)

console.log('\n1. A step down stops at the floor the generator set')
{
  const start = day(NAMES.map(n => ({ name: n, sets: getRoleSetFloor(roleOf(n)) })))
  const r = adjustDayVolume(start, 'lighter', profile)
  check('nothing moves when everything is already at its floor', !r.changed, r)
  check('...and it says so rather than claiming a change',
    /already where it should be/.test(describeVolumeChange(r, 'Tuesday')), describeVolumeChange(r, 'Tuesday'))

  const higher = day(NAMES.map(n => ({ name: n, sets: getRoleSetCeiling(roleOf(n), false) })))
  const down = adjustDayVolume(higher, 'lighter', profile)
  check('from the ceiling, a step down works', down.changed && down.setsAfter < down.setsBefore, down)
  for (const ex of down.day.exercises) {
    const floor = getRoleSetFloor(roleOf(ex.name))
    check(`  ${ex.name} never goes below its floor of ${floor}`, (ex.sets ?? 0) >= floor, ex.sets)
  }
}

console.log('\n2. A step up stops at the ceiling for that exercise\'s role')
{
  const start = day(NAMES.map(n => ({ name: n, sets: getRoleSetFloor(roleOf(n)) })))
  const up = adjustDayVolume(start, 'heavier', profile)
  check('a step up works from the floor', up.changed && up.setsAfter > up.setsBefore, up)
  for (const ex of up.day.exercises) {
    const ceiling = getRoleSetCeiling(roleOf(ex.name), false)
    check(`  ${ex.name} never goes above its ceiling of ${ceiling}`, (ex.sets ?? 0) <= ceiling, ex.sets)
  }

  const atCeiling = day(NAMES.map(n => ({ name: n, sets: getRoleSetCeiling(roleOf(n), false) })))
  const blocked = adjustDayVolume(atCeiling, 'heavier', profile)
  check('at the ceiling, nothing moves', !blocked.changed, blocked)
  check('...and the reason names the role limit, not a vague failure',
    blocked.blocked.every(b => b.reason === 'at the maximum for its role'), blocked.blocked)
}

console.log('\n3. It will not push a session past the length that was asked for')
{
  // A day that genuinely has no room. SIZED AGAINST THE REAL ESTIMATOR
  // rather than guessed — the first version of this fixture was three
  // exercises at 1,566s against a 2,700s ceiling, so the check passed the
  // budget test by never approaching the budget, and reported the bound as
  // broken when it was simply never reached.
  const short = { session_duration_preference: '30-45' } as unknown as UserProfile
  const packed = day([
    { name: 'Barbell Bench Press', sets: 4 },
    { name: 'Dumbbell Rows', sets: 4 },
    { name: 'Barbell Squats', sets: 4 },
    { name: 'Overhead Press', sets: 4 },
    { name: 'Bicep Curls', sets: 3 },
    { name: 'Tricep Pushdowns', sets: 3 },
  ])
  const before = estimateDaySeconds(packed)
  const max = getSessionMaximumSeconds('30-45')
  check(`the fixture really is over its budget (${Math.round(before)}s vs ${max}s)`, before > max, { before, max })

  const up = adjustDayVolume(packed, 'heavier', short)
  check('adding sets is refused when the session has no room', !up.changed, up)
  check('...and says exactly that', up.blocked.some(b => b.reason === 'no room in the session'), up.blocked)

  // And the budget must NOT block going down — refusing to shorten an
  // already-long day would be the check working against its own purpose.
  const down = adjustDayVolume(packed, 'lighter', short)
  check('trimming an over-long day is still allowed', down.changed && down.setsAfter < down.setsBefore, down)
}

console.log('\n4. Deload weeks are left alone')
{
  check('a deload week is not adjustable', isVolumeAdjustable({ is_deload: true }) === false)
  check('an ordinary week is', isVolumeAdjustable({ is_deload: false }) === true)
  check('...and an unknown week does not silently block the feature', isVolumeAdjustable(undefined) === true)
}

console.log('\n5. The magnitude is the app\'s, never the model\'s')
{
  const src = stripComments(readFileSync(join(ROOT, 'src/lib/volume-adjust.ts'), 'utf8'))
  // A model-chosen multiplier is a volume prescription made by something with
  // no view of the floors — the same reasoning that keeps load out of the
  // prompt. The signature must not accept one.
  check('the adjuster takes a direction, not a factor',
    /direction: VolumeDirection/.test(src) && !/multiplier|factor|ratio\s*:/.test(src))
  check('...and a direction is only ever lighter or heavier',
    /export type VolumeDirection = 'lighter' \| 'heavier'/.test(src))
  check('one step at a time, so a single call cannot gut a day',
    /current - 1/.test(src) && /current \+ 1/.test(src))

  // The bounds must be the GENERATOR'S, not a second copy living here.
  check('bounds come from the generator, not re-implemented',
    /from '\.\/exercise-plan'/.test(src) && /clampToVolumeRole/.test(src))
  check('...and no local floor or ceiling numbers are hardcoded',
    !/=\s*[2-9]\s*;?\s*\/\/.*(floor|ceiling)/i.test(src))
}

console.log('\n6. A clamped change reports what it really did')
{
  const mixed = day([
    { name: 'Barbell Bench Press', sets: getRoleSetFloor(roleOf('Barbell Bench Press')) },
    { name: 'Dumbbell Rows', sets: getRoleSetCeiling(roleOf('Dumbbell Rows'), false) },
    { name: 'Lateral Raises', sets: getRoleSetCeiling(roleOf('Lateral Raises'), false) },
  ])
  const r = adjustDayVolume(mixed, 'lighter', profile)
  const line = describeVolumeChange(r, 'Tuesday')
  check('the receipt names the real before and after', /\d+ sets to \d+/.test(line), line)
  check('...and mentions what was left alone', r.blocked.length === 0 || /left alone/.test(line), line)
  check('...without ever claiming more than happened',
    !r.changed || r.setsAfter !== r.setsBefore, r)
}

console.log('\n7. Nothing applies without a Confirm, and the server writes nothing')
{
  const chat = stripComments(readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8'))

  for (const tool of ['propose_volume_change', 'propose_schedule_change']) {
    check(`${tool} is declared to the model`, new RegExp(`name: "${tool}"`).test(chat))
    // The handler must forward a PROPOSAL, not act. A handler that reached
    // for the database here would be the exact defect §2.4 closed: the old
    // update_workout_schedule PATCHed fitness_profiles server-side on every
    // call, with no confirm step anywhere.
    const at = chat.indexOf(`if (name === "${tool}")`)
    const body = at === -1 ? '' : chat.slice(at, at + 1400)
    check(`...and its handler forwards a proposal`, new RegExp(`kind: "${tool}"`).test(body), body.slice(0, 120))
    check(`...and writes nothing itself`, !/supabase\s*\n?\s*\.from\(/.test(body) && !/\.update\(|\.insert\(|\.upsert\(/.test(body))
    check(`...and puts no words in the model's mouth`, /reply: ""/.test(body))
  }

  // The old tools are gone by NAME, not merely unreferenced: a stale
  // declaration left beside the new one is a tool the model can still call.
  check('adjust_volume is no longer declared', !/name: "adjust_volume"/.test(chat))
  check('update_workout_schedule is no longer declared', !/name: "update_workout_schedule"/.test(chat))
  check('...and neither has a handler left behind',
    !/name === "adjust_volume"/.test(chat) && !/name === "update_workout_schedule"/.test(chat))

  // The magnitude enum the model used to choose from must not survive
  // anywhere in the tool surface — that is the model prescribing volume.
  for (const magnitude of ['reduce_light', 'reduce_half', 'reduce_heavy', 'increase_moderate', 'increase_heavy']) {
    check(`the model cannot ask for "${magnitude}" any more`, !chat.includes(magnitude))
  }
  check('the volume tool takes a direction and nothing numeric',
    /enum: \["lighter", "heavier"\]/.test(chat))

  // The prompt must not still be telling the model these decline. A rule
  // that says "calling either will always decline" outlives the code that
  // made it true, and the model believes the prompt.
  check('the prompt no longer says plan changes are unsafe',
    !/NOT SAFELY WIRED UP YET|not safely wired up yet|PLAN CHANGES NOT YET SAFE/.test(chat))
  check('...and both tools have a prompt section telling the model how to use them',
    /=== 3d\..*propose_volume_change/.test(chat) && /=== 3e\..*propose_schedule_change/.test(chat))
}

console.log('\n8. The client can actually execute what the server proposes')
{
  const ui = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  const exec = stripComments(readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8'))

  // THE FAILURE THIS WHOLE SECTION IS ABOUT: a server that proposes a change
  // the client has no branch for. The proposal would render a Confirm button
  // that falls through to "Not available yet".
  //
  // The confirm branch is located and then read, rather than matched by
  // name anywhere in the file. Renaming the branch to something dead first
  // left this GREEN: the UNDO branch names the same kinds, so a check for
  // the bare string was satisfied by a completely different code path — the
  // same "satisfied by the wrong thing" shape this repo keeps producing.
  const EXECUTOR: Record<string, string> = {
    propose_volume_change: 'executeVolumeChange',
    propose_schedule_change: 'executeScheduleChange',
  }
  for (const [kind, executor] of Object.entries(EXECUTOR)) {
    check(`${kind} has a propose branch`, ui.includes(`result.proposal.kind === '${kind}'`))
    const at = ui.indexOf(`} else if (row.kind === '${kind}') {`)
    check(`${kind} has a confirm branch`, at !== -1)
    check(`...that calls ${executor}`, at !== -1 && ui.slice(at, at + 700).includes(`${executor}(`))
    check(`...and hands the new plan back to the app`, at !== -1 && ui.slice(at, at + 700).includes('onMesocycleUpdated('))
  }

  // Undo is claimed on the card (reversible: true), so it has to exist.
  check('both kinds require a pre_image to be stored',
    /propose_volume_change/.test(readFileSync(join(ROOT, 'src/lib/pending-actions-store.ts'), 'utf8'))
    && /propose_schedule_change/.test(readFileSync(join(ROOT, 'src/lib/pending-actions-store.ts'), 'utf8')))
  check('...and undo has a branch that restores it', /undoWeekRangeChange\(/.test(ui))
  check('...which really writes the pre-image back', /export async function undoWeekRangeChange/.test(exec))

  // FORWARD ONLY. Past weeks hold sets somebody actually did.
  check('the volume executor never touches a week outside the payload',
    /payload\.weekNumbers\.includes\(week\.week_number\)/.test(exec))
  check('the schedule executor rebuilds from a week, not from week 1',
    /rebuildFromCurrentWeek\(updated, exclusions, mesocycle, payload\.fromWeek\)/.test(exec))
  check('...and only saves from that week forward',
    /week\.week_number < payload\.fromWeek/.test(exec))
  check('undo is forward-only too', /week\.week_number < fromWeek/.test(exec))

  // The schedule change writes training_days — the field the plan generator
  // actually reads. weekly_schedule is the column the old tool wrote and
  // nothing rendered; it must not come back on this path.
  check('the schedule executor writes training_days', /training_days: updated\.training_days/.test(exec))
  check('...and never weekly_schedule', !/weekly_schedule/.test(exec))
}

console.log('\n9. A deload week is excluded from the proposal, not just at execute time')
{
  const ui = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  const exec = stripComments(readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8'))
  // Both halves, because either one alone is a lie somewhere: filtering only
  // at execute time makes the card count a week it will not touch, and
  // filtering only at propose time trusts a payload built minutes ago.
  //
  // Anchored to the line that BUILDS THE PAYLOAD, not to the name appearing
  // anywhere in the file. Deleting the filter first left this green, because
  // the card's own "your deload week is left alone" note calls the same
  // function two lines further down — a check satisfied by the sentence
  // about the rule instead of by the rule.
  const builderAt = ui.indexOf('const buildVolumeChangeProposal')
  const weeksAt = builderAt === -1 ? -1 : ui.indexOf('const weekNumbers =', builderAt)
  check('the proposal builder exists to check', weeksAt !== -1)
  check('the weeks it carries are filtered for deloads',
    weeksAt !== -1 && ui.slice(weeksAt, weeksAt + 220).includes('isVolumeAdjustable'),
    weeksAt === -1 ? null : ui.slice(weeksAt, weeksAt + 220))
  check('the executor filters them again at confirm time',
    /isVolumeAdjustable\(week\)/.test(exec))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll coach volume/schedule checks passed.')
