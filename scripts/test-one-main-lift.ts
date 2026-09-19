// ---------------------------------------------------------------------------
// Gate: ONE MAIN LIFT PER DAY.
//
// getExerciseCountForDuration returns `tier1: 1` for all four session lengths,
// so exactly one flagship lift per day is the design rather than a
// coincidence — and the goal-alignment scorer counts main-compound SLOTS, so a
// day holding two reads as a different kind of day than it is.
//
// MEASURED 18 Sep 2026 (docs/audits/weekly-volume-2026-09-18.md), across 9,216
// profiles x 16 weeks: 49,988 of 589,824 days carried a second tier-1,
// touching 2,477 profiles — 26.9%. The commonest shape was `Pull-Ups +
// Chin-Ups` on the same day, both at five or six sets: the same movement twice,
// as two separate main lifts. On a full-gym functional beginner it was
// `Deadlifts + Barbell Squats`, every week of the block.
//
// THE CONSTRAINT WAS ALREADY ASSERTED AT SOME PATHS AND MISSED AT OTHERS, which
// is the shape this repo keeps relearning. `ensurePatternPresent` excluded
// tier1_compound with a comment saying exactly why, and both weekly-coverage
// fills excluded it too; the six paths that actually fill an ordinary day did
// not.
//
// AND THE FIRST FIX WAS WRONG, which is why §3 exists in the form it does. I
// guarded the four FALLBACK paths, reasoning from the one comment that already
// mentioned the rule, and §3 came back still holding `Pull-Ups + Chin-Ups`.
// The pair never came from a fallback: `fillSlot` takes the track's own tier-1
// slot and `pickFromTier('tier1_compound', ...)` then takes another, on the
// path every single day runs. A source-shaped check written from the same
// reasoning would have passed and shipped the defect.
//
// HOW MUCH EACH SECTION IS WORTH, said plainly rather than implied:
//   §2 pins that the KNOWN paths ask the predicate. It cannot catch a FIFTH
//      path added later — a source check never can.
//   §3 is the general catch. It generates real plans from the combinations the
//      measurement named and asserts no day holds two. A new unguarded path
//      fails here, wherever it is written.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import {
  generateExercisePlan, setRandomSource, resetRandomSource, isSecondMainLift,
} from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, type ExerciseEntry } from '../src/lib/exercise-db'
import { generateAllCombinations, buildProfile, comboKey } from './quality-grid'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const tier = (t: string) => ({ mechanics_tier: t } as unknown as ExerciseEntry)

// ---------------------------------------------------------------------------
console.log('\n[1] The rule itself')
// ---------------------------------------------------------------------------
check('1a. the first main lift of the day is allowed',
  isSecondMainLift([], tier('tier1_compound')) === false)
check('1b. a second main lift is refused',
  isSecondMainLift([tier('tier1_compound')], tier('tier1_compound')) === true)
check('1c. an accessory is allowed beside a main lift',
  isSecondMainLift([tier('tier1_compound')], tier('tier2_compound')) === false)
check('1d. a day whose tier-1 slot came up empty may still be given one',
  isSecondMainLift([tier('tier2_compound'), tier('tier3_isolation')], tier('tier1_compound')) === false,
  { why: 'no barbell, or an injury ruling every press out — the fallback working, not the defect' })

// ---------------------------------------------------------------------------
console.log('\n[2] The known fill paths ask it')
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/exercise-plan.ts'), 'utf8')
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

  const start = noComments.indexOf('function selectExercisesForTrack(')
  check('2a. the selector was found', start > 0)
  const body = noComments.slice(start, noComments.indexOf('\nfunction ', start + 10))

  // PER PATH, NOT A TOTAL — and the mutation round is why.
  //
  // A count (`>= 7`) passed every time one individual site was unguarded,
  // because the guards OVERLAP: strip pickFromTier's filter and its in-loop
  // re-check still catches it; strip fillSlot's pick and pickFromTier declines
  // the second anyway. Four separate mutations came back MISSED with all
  // checks running. Defence in depth is good for the app and blinding for a
  // gate, so the property is asked of each path by name instead.
  //
  // Anchored on CODE, never on the section comments above each one — a comment
  // can be reworded and the check would then enforce the wording.
  const REGIONS: [string, string][] = [
    ['the track-slot fill', 'function fillSlot('],
    ['the tier pass', 'function pickFromTier('],
    ['the refill fallback', 'const refill = ('],
    ['the track required-pattern fill', 'for (const reqPattern of track.required_patterns)'],
    ['the style required-pattern fill', 'for (const reqPattern of requiredPatterns)'],
    // Last, and deliberately a region of its own. It guards by a different
    // mechanism — excluding tier-1 outright rather than asking the predicate —
    // so it is exempt from the per-push rule below and pinned by 2f instead.
    // It is listed HERE because without it the style region ran to the end of
    // the function and swallowed this push, which the per-push count caught
    // immediately: 3 pushes against 2 asks.
    ['the pattern-label fill', 'const ensurePatternPresent = ('],
  ]
  const ASKS_THE_PREDICATE = REGIONS.slice(0, -1).map(([label]) => label)
  const regionText = (src: string, anchors: [string, string][]) => {
    const found = anchors
      .map(([label, a]) => ({ label, at: src.indexOf(a) }))
      .sort((x, y) => x.at - y.at)
    return found.map((f, i) => ({
      label: f.label,
      at: f.at,
      text: f.at < 0 ? '' : src.slice(f.at, i + 1 < found.length ? found[i + 1].at : src.length),
    }))
  }
  const regions = regionText(body, REGIONS)
  const missingAnchor = regions.filter(r => r.at < 0).map(r => r.label)
  check('2b. every named filling path was located', missingAnchor.length === 0, missingAnchor)
  // ONE GUARD PER PUSH, not one per region — and again the mutation round is
  // why. `fillSlot` pushes twice (its pick, and its nearest-pattern
  // substitute) and the style fill pushes twice (strict, then relaxed); with a
  // per-region check, removing ONE of a region's two guards left the other
  // still spelling the name and the check still green. Three more MISSED.
  //
  // So: count the pushes in each region and require at least that many asks.
  // It is the same property said precisely — every path that can put an
  // exercise in a day asks first — and it does not care where the calls sit.
  const counts = regions.filter(r => r.at >= 0).map(r => ({
    label: r.label,
    pushes: (r.text.match(/selected\.push\(/g) ?? []).length,
    // CALLS only. The hoisted `function wouldBeSecondMainLift(` declaration
    // sits inside the first region and counted as an ask, which gave that
    // region a spare and let one of its two real guards be removed unnoticed —
    // two more MISSED mutations, and the same "your own edit satisfied the
    // search" shape the rules here already warn about.
    asks: (r.text.match(/(?<!function )wouldBeSecondMainLift\(/g) ?? []).length,
  }))
  check('2c. every region was read and holds at least one push',
    counts.length === REGIONS.length && counts.every(c => c.pushes >= 1), counts)
  const short = counts.filter(c => ASKS_THE_PREDICATE.includes(c.label) && c.asks < c.pushes)
  check('2d. and every push in them is guarded', short.length === 0, short)

  // pickFromTier needs TWO asks for ONE push: the candidate list is built once,
  // so the filter cannot see a main lift the SAME loop claims a moment later —
  // exactly why the family re-check already sits beside it.
  const tierPass = counts.find(c => c.label === 'the tier pass')
  check('2e. the tier pass asks both before and inside its loop',
    (tierPass?.asks ?? 0) >= 2, tierPass)

  // Prove the counter can come back short, so 2b cannot go vacuous.
  const synthetic = 'function fake() { pool.filter(e => e.ok) }\nfunction other() { pool.find(e => e.ok) }'
  // The pattern-label fill guards by the OTHER mechanism — excluding tier-1
  // outright — and its own comment is the record of why. Pinned so a later
  // tidy-up cannot relax it to match the rest.
  //
  // THIS CHECK WENT MISSING once already, dropped by one of my own rewrites
  // while I still believed it was there; the mutation round is what noticed,
  // because breaking ensurePatternPresent came back MISSED. Read off the region
  // now rather than a character window, so it moves with the code.
  const labelFill = regions.find(r => r.label === 'the pattern-label fill')
  check('2f. the pattern-label fill still refuses tier-1 outright',
    !!labelFill && labelFill.at >= 0 && labelFill.text.includes("mechanics_tier !== 'tier1_compound'"),
    labelFill?.text.slice(0, 160))

  check('2g. the region reader names a path that does not ask',
    regionText(synthetic, [['a', 'function fake('], ['b', 'function other(']])
      .filter(r => r.at >= 0 && !r.text.includes('wouldBeSecondMainLift(')).length === 2)
}

// ---------------------------------------------------------------------------
console.log('\n[3] Real plans, from the combinations the measurement named')
// ---------------------------------------------------------------------------
{
  // NOT profiles that looked likely. These are offenders the 9,216-profile run
  // printed by name, pinned with the key it seeded them with — the only honest
  // way to know a fixture is actually under pressure.
  const OFFENDERS = [
    'full_gym|none|30-45|bodybuilding|intermediate|hypertrophy|low|avoid',
    'full_gym|none|30-45|bodybuilding|advanced|fat_loss|high|love',
    'full_gym|none|60-90|functional|beginner|hypertrophy|high|love',
    'bodyweight|none|90+|combat|advanced|functional|high|tolerate',
  ]
  const combos = new Map(generateAllCombinations().map(c => [comboKey(c), c]))

  let checkedDays = 0
  let daysWithAMainLift = 0
  const twoMainDays: string[] = []

  for (const key of OFFENDERS) {
    const combo = combos.get(key)
    check(`3a. fixture resolves in the grid: ${key.slice(0, 44)}`, !!combo)
    if (!combo) continue
    setRandomSource(seededRngFromKey(key))
    let plan
    try { plan = generateExercisePlan(buildProfile(combo)).plan } finally { resetRandomSource() }
    for (const day of plan) {
      if (day.exercises.length === 0) continue
      checkedDays++
      const mains = day.exercises.filter(e => getExerciseEntry(e.name)?.mechanics_tier === 'tier1_compound')
      if (mains.length >= 1) daysWithAMainLift++
      if (mains.length > 1) twoMainDays.push(`${key} ${day.day}: ${mains.map(m => m.name).join(' + ')}`)
    }
  }

  // Both halves, or a run that lost every main lift would pass the real check.
  check(`3b. the fixtures produced training days (${checkedDays})`, checkedDays > 0)
  check(`3c. and days that still carry a main lift (${daysWithAMainLift})`, daysWithAMainLift > 0,
    { why: 'refusing a SECOND main lift must not cost the first' })
  check('3d. no day carries two main lifts', twoMainDays.length === 0, twoMainDays.slice(0, 5))
}

// ---------------------------------------------------------------------------
console.log('\n[4] The detector can fail')
// ---------------------------------------------------------------------------
{
  // §3d passing means nothing unless the scan behind it would notice. Hand it a
  // day that genuinely holds two, built from catalogue names so the same lookup
  // runs.
  const planted = [{ name: 'Barbell Squats' }, { name: 'Deadlifts' }, { name: 'Dumbbell Curls' }]
  const resolved = planted.map(p => getExerciseEntry(p.name))
  check('4a. the planted names resolve', resolved.every(Boolean),
    planted.map((p, i) => resolved[i] ? null : p.name).filter(Boolean))
  const mains = planted.filter(p => getExerciseEntry(p.name)?.mechanics_tier === 'tier1_compound')
  check('4b. and the scan reports them as two main lifts', mains.length === 2,
    resolved.map(r => r?.mechanics_tier))
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
if (failures > 0) process.exit(1)
