// ---------------------------------------------------------------------------
// Gate: THE SWAP SHORTLIST SHOWS WHAT IT USED TO HIDE.
//
// Ashley, 18 Sep 2026, standing next to a leg-curl machine on a functional
// plan: the alternatives offered for her leg curl were two sliders, a band and
// a bodyweight curl. Not one of them carried weight. All three machine leg
// curls are tagged `bodybuilding` and nothing else, and the style stage of the
// pool filter removed them outright.
//
// MEASURED THAT DAY, twice, and the second measurement corrected the first:
//   - 31 of the catalogue's 45 machine and cable entries carry no `functional`
//     tag. It is a convention, not a slip, so retagging would change what
//     every functional trainee is PRESCRIBED.
//   - the all-unloaded list needs the outgoing lift to be the Dumbbell Leg
//     Curl — the only loaded on-style option. Swap a machine and the dumbbell
//     version is still offered. The earlier note said "functional and combat
//     produce an all-unloaded list" without naming that condition.
//
// HER RULING, from three options: SHOW THEM, LOWER DOWN. Options matching her
// style stay at the top, the rest sit below saying what they are, and no plan
// changes. She rejected retagging the machines and leaving the search box as
// the only route to one.
//
// AND HER SECOND RULING THE SAME DAY, because the first one broke an earlier
// one of hers. Sinking off-style options put a matching SLIDER above a
// non-matching MACHINE, so a loaded lift was again offered bodyweight
// replacements first — the exact thing her 10 Sep rule exists to prevent,
// measured at 8 movements in the hybrid catalogue. From three options:
// WEIGHT ALWAYS WINS. For a lift carrying a number every loaded alternative
// comes first whatever its style, each marked on its own row; the unloaded
// ones follow. She rejected keeping style outermost, and rejected a narrow
// override firing only where her style offered nothing loaded.
//
// WHAT THIS GATE HOLDS:
//   §1 her case, by calling the real builder
//   §2 the ordering — weight outermost, style within it — across the whole
//      catalogue and all four styles
//   §3 style is the ONLY stage relaxed — equipment, injury and skill still cut
//   §4 generation is untouched: the strict pool still is the strict pool
//   §5 the screen marks the row from the phrasebook, and no longer tells her
//      style filtered the list
//   §6 every source detector proven on something that should fail it
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { getConstrainedPool, getFlaggedJoints } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, contraindicatedJoints } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { OUTSIDE_YOUR_STYLE } from '../src/lib/coach-voice'
import type { UserProfile, TrainingStyle, TrainingExperience } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'p',
  training_style: 'functional',
  training_experience: 'intermediate',
  equipment_access: 'full_gym',
  fitness_goal: 'hypertrophy',
  injuries: [],
  workout_days_per_week: 4,
  session_duration_preference: '45-60',
  ...over,
} as unknown as UserProfile)

const STYLES: TrainingStyle[] = ['functional', 'bodybuilding', 'combat', 'hybrid']
const LEVELS: TrainingExperience[] = ['novice', 'intermediate', 'advanced']

// ---------------------------------------------------------------------------
console.log('\n[1] Her case: the leg curl, on a functional plan, in a full gym')
// ---------------------------------------------------------------------------
{
  const list = getReplacementCandidates('Dumbbell Leg Curl', profile(), [])
  const onStyle = list.filter(c => !c.offStyle)
  const offStyle = list.filter(c => c.offStyle)

  // THE FIXTURE IS UNDER PRESSURE, checked first. If the on-style half ever
  // gained a loaded option this section would pass while proving nothing —
  // the screen she reported would no longer be reachable from it.
  check('1a. the matching options really are all unloaded — the screen she hit',
    onStyle.length > 0 && onStyle.every(c => !isExternallyLoaded(c.exercise)),
    onStyle.map(c => c.exercise.name))

  check('1b. the machines are now on the list at all',
    offStyle.length >= 2 && offStyle.every(c => c.offStyle),
    offStyle.map(c => c.exercise.name))
  check('1c. ...and they carry weight, which is why she wanted one',
    offStyle.some(c => isExternallyLoaded(c.exercise)),
    offStyle.map(c => `${c.exercise.name}:${isExternallyLoaded(c.exercise)}`))
  // WEIGHT OUTRANKS STYLE — her second ruling of the day, settling the
  // collision the first one caused. The machines are LOADED and the outgoing
  // lift is loaded, so here they come FIRST, ahead of every matching option.
  check('1d. ...at the top, because weight outranks style for a loaded lift',
    list.slice(0, offStyle.length).every(c => c.offStyle),
    list.map(c => `${c.offStyle ? 'OFF' : 'on'} ${c.exercise.name}`))
}

// ---------------------------------------------------------------------------
console.log('\n[2] The ordering holds for every exercise and every style')
// ---------------------------------------------------------------------------
{
  // THE ORDER IS TWO KEYS, AND THEY ARE CHECKED SEPARATELY.
  //
  //   outer: loaded before unloaded, whenever the outgoing lift is loaded
  //   inner: within each of those bands, matching before off-style
  //
  // Checking them as one rule is what produced the wrong build the first time
  // round: "off-style never above on-style" is FALSE by design now, because a
  // loaded off-style machine outranks an unloaded matching slider.
  let lists = 0, outerBroken = 0, innerBroken = 0, gained = 0, mixedBands = 0
  const alive = EXERCISE_DATABASE.filter(e => !e.retired)
  const bandBroken = (band: { offStyle: boolean }[]) => {
    const firstOff = band.findIndex(c => c.offStyle)
    const lastOn = band.map(c => c.offStyle).lastIndexOf(false)
    return firstOff >= 0 && lastOn > firstOff
  }
  for (const style of STYLES) {
    const p = profile({ training_style: style })
    for (const e of alive) {
      const l = getReplacementCandidates(e.name, p, [])
      if (l.length === 0) continue
      lists++
      if (l.some(c => c.offStyle)) gained++
      const outgoingLoaded = isExternallyLoaded(e)
      if (outgoingLoaded) {
        const firstUnloaded = l.findIndex(c => !isExternallyLoaded(c.exercise))
        const lastLoaded = l.map(c => isExternallyLoaded(c.exercise)).lastIndexOf(true)
        if (firstUnloaded >= 0 && lastLoaded > firstUnloaded) outerBroken++
        const loaded = l.filter(c => isExternallyLoaded(c.exercise))
        const unloaded = l.filter(c => !isExternallyLoaded(c.exercise))
        if (loaded.length > 0 && unloaded.length > 0) mixedBands++
        if (bandBroken(loaded) || bandBroken(unloaded)) innerBroken++
      } else if (bandBroken(l)) innerBroken++
    }
  }
  console.log(`  ${lists} shortlists across 4 styles; ${gained} carry at least one off-style option`)
  check('2a. a loaded lift is never offered an unloaded option above a loaded one',
    outerBroken === 0, { outerBroken, lists })
  check('2b. ...and inside each of those bands, matching options come before off-style ones',
    innerBroken === 0, { innerBroken, lists })
  // Teeth, both keys. 2a is vacuous with no mixed list; 2b is vacuous with no
  // off-style option anywhere.
  check('2c. ...neither check is vacuous — mixed lists and off-style options both occur',
    gained > 0 && mixedBands > 0, { gained, mixedBands, lists })
}

// ---------------------------------------------------------------------------
console.log('\n[3] Style is the only stage relaxed')
// ---------------------------------------------------------------------------
{
  // EQUIPMENT. A machine cannot appear for somebody who owns no machine —
  // that is the "you physically do not have the kit" axis, untouched.
  const minimal = profile({ equipment_access: 'minimalist' })
  const machinesOffered = new Set<string>()
  for (const e of EXERCISE_DATABASE.filter(x => !x.retired).slice(0, 80)) {
    for (const c of getReplacementCandidates(e.name, minimal, [])) {
      if (c.exercise.equipment.some(q => /machine|cable/i.test(q))) machinesOffered.add(c.exercise.name)
    }
  }
  check('3a. a minimalist kit is never offered a machine, off-style or not',
    machinesOffered.size === 0, [...machinesOffered].slice(0, 5))

  // INJURY. Contraindicated movements stay out of the WHOLE list.
  const hurt = profile({ injuries: ['knees'] } as Partial<UserProfile>)
  const flagged = getFlaggedJoints(hurt.injuries ?? [])
  const wide = getConstrainedPool(hurt, [], { skipStyle: true })
  const unsafe = wide.filter(e =>
    contraindicatedJoints(e).some(j => flagged.has(j)) && !(e.indicated_joints ?? []).some(j => flagged.has(j)))
  check('3b. a flagged knee still excludes what loads it, style filter or not',
    flagged.size > 0 && unsafe.length === 0, unsafe.map(e => e.name).slice(0, 5))

  // SKILL. The widened pool is still the skill-filtered one.
  for (const level of LEVELS) {
    const p = profile({ training_experience: level })
    const skilled = getConstrainedPool(p, [], { skipStyle: true })
    const all = EXERCISE_DATABASE.filter(e => !e.retired)
    if (level === 'novice') {
      check('3c. a novice pool is still smaller than the catalogue after skipping style',
        skilled.length < all.length, { skilled: skilled.length, all: all.length })
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n[4] Generation is untouched — the strict pool is still strict')
// ---------------------------------------------------------------------------
{
  for (const style of STYLES) {
    const p = profile({ training_style: style })
    const strict = getConstrainedPool(p, [])
    const wide = getConstrainedPool(p, [], { skipStyle: true })
    const strictNames = new Set(strict.map(e => e.name))
    check(`4a. ${style}: the strict pool is a proper subset of the widened one`,
      strict.length < wide.length && wide.every(e => true) && strict.every(e => strictNames.has(e.name)),
      { strict: strict.length, wide: wide.length })
    // The default must stay strict. A flipped default would make these equal.
    check(`4b. ${style}: calling it with no options still applies the style stage`,
      strict.length !== wide.length, { strict: strict.length, wide: wide.length })
  }
}

// ---------------------------------------------------------------------------
console.log('\n[5] The screen marks the row, and stops blaming style')
// ---------------------------------------------------------------------------
const dialog = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SwapDialog.tsx'), 'utf8'))
{
  check('5a. an off-style option carries a marker on its own row',
    /data-testid="swap-off-style-mark"/.test(dialog))

  // AN IMPORT IS NOT A USE. A bare-name check over the whole file survives a
  // hand-written label, because the `import` line still carries the name.
  const markAt = dialog.indexOf('data-testid="swap-off-style-mark"')
  const markBlock = markAt > 0 ? dialog.slice(markAt, markAt + 200) : ''
  check('5b. its words are the phrasebook value RENDERED, not merely imported',
    /\{\s*OUTSIDE_YOUR_STYLE\s*\}/.test(markBlock) && /from '@\/lib\/coach-voice'/.test(dialog),
    markBlock.slice(0, 160))
  check('5c. the phrasebook says what it should', OUTSIDE_YOUR_STYLE === 'Outside your training style', OUTSIDE_YOUR_STYLE)

  // ONE LIST, NOT A GROUP. Her second ruling makes a grouped layout unable to
  // express the order — a loaded off-style option belongs above an unloaded
  // matching one, which no "matching group then the rest" layout can draw.
  check('5d. there is no separate group left behind for them',
    !/swap-off-style-group/.test(dialog))
  check('5e. the marker is rendered from the row\u2019s own flag, per option',
    /\{\s*exercise,\s*note,\s*offStyle\s*\}/.test(dialog) && /\boffStyle\s*&&\s*\(/.test(dialog))

  // The two sentences that used to name style as a filter.
  check('5f. no sentence still claims style filtered the list',
    !/equipment, injuries, style/i.test(dialog), (dialog.match(/.{0,60}injuries, style.{0,40}/gi) ?? []).slice(0, 3))
}

// ---------------------------------------------------------------------------
console.log('\n[6] The source detectors are proven on something that fails them')
// ---------------------------------------------------------------------------
{
  const broken = `
    <div data-testid="swap-off-style-group"><p>Outside your training style</p></div>
    {visibleReplacements.map(({ exercise, note }) => (<button data-testid="swap-option" />))}
    <p>that fit your equipment, injuries, style and skill level</p>
  `
  check('6a. the group detector fails on a file that still has one',
    /swap-off-style-group/.test(broken))
  check('6b. the per-row detector fails when the row never reads its own flag',
    !/\{\s*exercise,\s*note,\s*offStyle\s*\}/.test(broken))
  check('6c. the stale-sentence detector fails on the old wording',
    /equipment, injuries, style/i.test(broken))
  // The shape that fooled the first version of 5b: the import survives.
  const importedButNotRendered = `
    import { OUTSIDE_YOUR_STYLE } from '@/lib/coach-voice'
    <Badge data-testid="swap-off-style-mark">Outside your training style</Badge>
  `
  const at = importedButNotRendered.indexOf('data-testid="swap-off-style-mark"')
  check('6d. the phrasebook detector fails on a marker hand-written under a live import',
    /\bOUTSIDE_YOUR_STYLE\b/.test(importedButNotRendered) &&
    !/\{\s*OUTSIDE_YOUR_STYLE\s*\}/.test(importedButNotRendered.slice(at, at + 200)))
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
if (failures > 0) process.exit(1)
