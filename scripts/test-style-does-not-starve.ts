// ---------------------------------------------------------------------------
// A STYLE PREFERENCE MAY NOT STARVE A MOVEMENT — and improvised kit may not
// beat the real thing you own.
//
// Ashley, 8 Sep 2026. Her Tuesday prescribed a BACKPACK Lateral Raise beside a
// barbell bench press, and tapping swap offered exactly one alternative. Her
// profile is full_gym / advanced / functional, no injuries. Of the catalogue's
// seven isolation_shoulder entries, two carry the 'functional' tag — so
// selection chose from a shortlist of two, and the swap had one left to give.
//
// Two things had to be true for that, and this gate holds both:
//
//   §1  the style filter leaves every movement a real choice. MIN_VIABLE_POOL
//       could never see this: it counts the WHOLE pool, and 151 of 199 entries
//       carry 'functional'.
//   §2  a 'low'-rank implement never wins while an equivalent 'high'-rank one
//       is on the same shortlist — at selection, at rotation, and in the swap
//       dialog. Before this, only selection had an equipment term at all, and
//       there it was +/-1, which two prior weekly appearances cancel exactly.
//
//   §3  the movement-family map does not list half a family.
//   §4  the measurement instrument itself covers every style. Every existing
//       swap probe builds its profile as 'hybrid' — the widest tag in the
//       catalogue — so the style filter was inert in every number this repo
//       took.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  getConstrainedPool, generateMesocycle, setRandomSource, resetRandomSource,
  bestEquipmentRank, isEquipmentQualityExempt, EQUIPMENT_QUALITY_TIERS, poolForRotation,
} from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { EXERCISE_DATABASE, getMovementFamily } from '../src/lib/exercise-db'
import { ALL_EQUIPMENT, ALL_STYLES } from '../src/lib/dev-constraint-audit'
import type { UserProfile, EquipmentAccess, TrainingStyle, TrainingExperience } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function profileFor(equipment: EquipmentAccess, style: TrainingStyle, experience: TrainingExperience = 'advanced'): UserProfile {
  return {
    age: 30, gender: 'female', height_cm: 168, weight_kg: 70, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1500, tdee: 2100,
    equipment_access: equipment, injuries: [], training_style: style,
    training_experience: experience, session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower', recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate', coaching_persona: 'supportive',
    training_days: DAYS.map((day, i) => ({ day, available: i % 2 === 1 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    created_at: new Date().toISOString(),
  } as unknown as UserProfile
}

/** How many ways to train one movement the filter must leave. Mirrors MIN_VIABLE_PER_PATTERN. */
const WORKABLE = 4

console.log('\n1. A style may not starve a movement')
{
  // HER CASE, named, so a regression is recognisable rather than a number.
  const hers = profileFor('full_gym', 'functional')
  const pool = getConstrainedPool(hers, [])
  const shoulders = pool.filter(e => e.movement_pattern === 'isolation_shoulder')
  check('a functional full-gym trainee can be given a dumbbell lateral raise',
    shoulders.some(e => e.name === 'Lateral Raises'), shoulders.map(e => e.name))
  check('...and a cable one', shoulders.some(e => e.name === 'Cable Lateral Raises'))
  check('...and the shortlist is a real choice, not two',
    shoulders.length >= WORKABLE, shoulders.length)

  // The general rule, over every style and equipment tier.
  const catalogueByPattern = new Map<string, number>()
  for (const e of EXERCISE_DATABASE) {
    if (e.retired) continue
    catalogueByPattern.set(e.movement_pattern, (catalogueByPattern.get(e.movement_pattern) ?? 0) + 1)
  }
  const starved: string[] = []
  for (const equipment of ALL_EQUIPMENT) {
    // THE FLOOR DOES NOT APPLY AT BODYWEIGHT, on purpose. Checked explicitly
    // below rather than skipped silently: applying it there turned a
    // bodyweight plan from one loaded backpack item a week into five to
    // eight, because every entry it reinstated was a weighted backpack. At
    // that tier a thin movement is the KIT talking, and the app already says
    // so — see EQUIPMENT_QUALITY_TIERS.
    if (!EQUIPMENT_QUALITY_TIERS.has(equipment)) continue
    for (const style of ALL_STYLES) {
      const p = getConstrainedPool(profileFor(equipment, style), [])
      const byPattern = new Map<string, number>()
      for (const e of p) byPattern.set(e.movement_pattern, (byPattern.get(e.movement_pattern) ?? 0) + 1)
      // Compared against what THIS TIER could offer, not the whole catalogue:
      // equipment is a hard constraint and a bodyweight trainee having two
      // vertical pulls is the kit talking, not the style.
      const tierPool = getConstrainedPool(profileFor(equipment, 'hybrid'), [])
      const tierByPattern = new Map<string, number>()
      for (const e of tierPool) tierByPattern.set(e.movement_pattern, (tierByPattern.get(e.movement_pattern) ?? 0) + 1)
      for (const [pattern, atTier] of tierByPattern) {
        const kept = byPattern.get(pattern) ?? 0
        if (kept < Math.min(WORKABLE, atTier)) starved.push(`${equipment}/${style}/${pattern}: ${kept} of ${atTier}`)
      }
    }
  }
  check('no movement is starved below a workable choice, wherever the trainee has real kit',
    starved.length === 0, starved.slice(0, 8))

  // ...and the bodyweight tier is left alone, which is what keeps a bodyweight
  // plan a bodyweight plan. Asserted as a PROPERTY of the output, not by
  // reading the guard: the reinstated entries there were all improvised, so
  // the thing to hold is that the pool has not filled up with them.
  const bwStyled = getConstrainedPool(profileFor('bodyweight', 'bodybuilding'), [])
  check('the floor is not applied at bodyweight — style still filters there',
    bwStyled.some(e => !e.style_tags.includes('bodybuilding')) === false,
    bwStyled.filter(e => !e.style_tags.includes('bodybuilding')).map(e => e.name).slice(0, 6))
  void catalogueByPattern
}

console.log('\n2. Improvised kit never beats the real thing you own')
{
  const hers = profileFor('full_gym', 'functional')
  const swaps = getReplacementCandidates('Backpack Lateral Raise', hers, [])
  check('the swap dialog offers more than the one option Ashley saw', swaps.length > 1, swaps.length)
  check('...and leads with real kit, not a band or a backpack',
    bestEquipmentRank(swaps[0].exercise) === 'high', swaps.map(s => s.exercise.name))
  // Sinks, does not vanish: her gym could be busy.
  check('...while still offering the improvised ones further down',
    swaps.some(s => bestEquipmentRank(s.exercise) === 'low'), swaps.map(s => s.exercise.name))
  const ranks = swaps.map(s => bestEquipmentRank(s.exercise))
  check('...with every low-rank option below every high-rank one',
    ranks.lastIndexOf('high') < ranks.indexOf('low') || !ranks.includes('low'), ranks)

  // The rotation pool, which had no equipment term at all until 8 Sep 2026.
  const pool = getConstrainedPool(hers, [])
  const rotation = poolForRotation(pool, 'full_gym')
  check('a rotation cannot land on a backpack lateral raise at a full gym',
    !rotation.some(e => e.name === 'Backpack Lateral Raise'), rotation.filter(e => e.movement_pattern === 'isolation_shoulder').map(e => e.name))
  check('...and the dumbbell one is still there to rotate to',
    rotation.some(e => e.name === 'Lateral Raises'))

  // The trainee whose kit really IS a backpack keeps it — the preference must
  // never become a ban for someone with nothing better.
  const bodyweight = profileFor('bodyweight', 'functional')
  const bwPool = getConstrainedPool(bodyweight, [])
  check('a bodyweight trainee keeps their improvised options',
    poolForRotation(bwPool, 'bodyweight').length === bwPool.length)

  // ...and an improvised entry with NO better peer survives at a tier where
  // the preference IS active. The first version of this only checked that
  // everything DROPPED had a peer, which a mutation dropping everything
  // passed trivially — it had nothing to say about what must be kept.
  const fullPool = getConstrainedPool(hers, [])
  const noPeer = fullPool.filter(e =>
    bestEquipmentRank(e) === 'low' && !isEquipmentQualityExempt(e) &&
    !fullPool.some(o => o.substitution_group === e.substitution_group &&
      o.mechanics_tier === e.mechanics_tier && bestEquipmentRank(o) === 'high'))
  check('improvised kit with no better peer is KEPT, not swept up',
    noPeer.length > 0 && noPeer.every(e => rotation.some(r => r.name === e.name)),
    { checked: noPeer.length, missing: noPeer.filter(e => !rotation.some(r => r.name === e.name)).map(e => e.name) })

  // ...and so does anyone whose only option in that group is improvised.
  const minimal = getConstrainedPool(profileFor('minimalist', 'functional'), [])
  const kept = poolForRotation(minimal, 'minimalist')
  for (const dropped of minimal.filter(e => !kept.includes(e))) {
    check(`only dropped where a better peer exists: ${dropped.name}`,
      minimal.some(o => o.substitution_group === dropped.substitution_group &&
        o.mechanics_tier === dropped.mechanics_tier && bestEquipmentRank(o) === 'high'))
  }

  // ALL WEEKS, which is the half no gate could see: quality-score's own
  // worse_implement_than_available rule scans week 1 only, and 309 of the 310
  // occurrences measured on 8 Sep were in week 2 and later.
  const offenders: string[] = []
  for (const equipment of ALL_EQUIPMENT) {
    if (!EQUIPMENT_QUALITY_TIERS.has(equipment)) continue
    for (const style of ALL_STYLES) {
      const p = getConstrainedPool(profileFor(equipment, style), [])
      setRandomSource(seededRngFromKey(`starve:${equipment}:${style}`))
      const meso = generateMesocycle(profileFor(equipment, style))
      resetRandomSource()
      for (const week of meso) {
        for (const day of week.days) {
          for (const ex of day.exercises) {
            const entry = p.find(e => e.name === ex.name)
            if (!entry || isEquipmentQualityExempt(entry) || bestEquipmentRank(entry) !== 'low') continue
            if (p.some(o => o.substitution_group === entry.substitution_group &&
              o.mechanics_tier === entry.mechanics_tier && bestEquipmentRank(o) === 'high')) {
              offenders.push(`${equipment}/${style} wk${week.week_number} ${day.day} ${ex.name}`)
            }
          }
        }
      }
    }
  }
  check('no week of any plan reaches for improvised kit when a real peer was available',
    offenders.length === 0, offenders.slice(0, 10))

  // REINSTATED IS NOT UNFILTERED. The floor widens the choice; style_fit is
  // what stops it erasing the preference. Without the ranking half, a
  // functional trainee's plan would simply become everyone else's.
  const src = readFileSync(join(ROOT, 'src/lib/exercise-plan.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('an off-style candidate is ranked below an on-style one',
    /if \(ctx\.trainingStyle && !candidate\.style_tags\.includes\(ctx\.trainingStyle\)\) \{[\s\S]{0,80}?style_fit = -/.test(src))
  check('...and the trainee\'s own style reaches the scorer',
    /trainingStyle\b[\s\S]{0,200}?equipmentAccess, trainingStyle \}/.test(src) || /equipmentAccess, trainingStyle \}/.test(src))
  check('the improvised penalty is decisive, not a tie-break',
    /IMPROVISED_OVER_REAL_PENALTY = ([2-9]\d*)/.test(src), src.match(/IMPROVISED_OVER_REAL_PENALTY = \d+/)?.[0])
  check('...and only when a better peer is on the same shortlist',
    /rank === 'low' && ctx\.betterImplementInList\?\.has\(candidate\.name\)/.test(src))

  // A short list explains itself. One suggestion above a search box that turns
  // up three more is the screen Ashley met; the list is honest now, and this
  // is what keeps it honest when a movement genuinely has few alternatives.
  const dialog = readFileSync(join(ROOT, 'src/components/exercise/SwapDialog.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('a short suggestion list says why it is short',
    /replacements\.length < INITIAL_SHOWN && \(/.test(dialog) && /equipment, injuries, style and skill level/.test(dialog))
}

console.log('\n3. A movement family is listed whole, or not at all')
{
  const bySig = new Map<string, string[]>()
  for (const e of EXERCISE_DATABASE) {
    if (e.retired) continue
    const sig = `${e.substitution_group}|${e.mechanics_tier}|${e.movement_pattern}`
    if (!bySig.has(sig)) bySig.set(sig, [])
    bySig.get(sig)!.push(e.name)
  }
  // The splits this map makes ON PURPOSE — a push-up is not a dumbbell bench
  // press, single-leg calf work is not bilateral. Listed so a NEW implement
  // variant added to the catalogue fails this gate until someone decides
  // which side of the line it belongs on, rather than silently getting an
  // identity of its own.
  const DELIBERATE = new Set([
    // Push-Ups is pulled out of 'bench_press' to bind it to Plyo Push-Ups, a
    // PRIMER in a different tier and pattern. Linking across tiers is the
    // map's other job, and rotateVariation's own comment records that Deficit
    // and Archer Push-Ups are meant to stay in 'bench_press'.
    'bench_press|tier2_compound|horizontal_push',
    'explosive_upper|primer|activation',
    // Pull-Ups (Assisted) bound to Pull-Ups, and Kettlebell Swing (Heavy) to
    // Kettlebell Swings — the same across-tier linking.
    'vertical_pull|tier2_compound|vertical_pull',
    'vertical_pull|tier1_compound|vertical_pull',
    'hip_hinge|tier2_compound|hip_hinge',
    // Single-leg calf work apart from bilateral. Settled in its own round with
    // Ashley and deliberately not reopened here.
    'calf|tier3_isolation|isolation_calf',
  ])
  const split: string[] = []
  for (const [sig, names] of bySig) {
    if (DELIBERATE.has(sig) || names.length < 2) continue
    const families = new Set(names.map(n => getMovementFamily(EXERCISE_DATABASE.find(e => e.name === n)!)))
    if (families.size > 1) split.push(`${sig}: ${[...families].join(' vs ')}`)
  }
  check('no family is half-listed outside the deliberate splits', split.length === 0, split.slice(0, 8))
  const lateral = EXERCISE_DATABASE.filter(e => e.name.includes('Lateral Raise'))
  check('every lateral raise is one movement', new Set(lateral.map(getMovementFamily)).size === 1,
    lateral.map(e => `${e.name}=${getMovementFamily(e)}`))
  const shrugs = EXERCISE_DATABASE.filter(e => e.name.includes('Shrug'))
  check('every shrug is one movement', new Set(shrugs.map(getMovementFamily)).size === 1,
    shrugs.map(e => `${e.name}=${getMovementFamily(e)}`))
}

console.log('\n4. The instrument covers every style')
{
  const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  const report = src('scripts/report-style-and-implement.ts')
  check('the before/after instrument sweeps all styles', /ALL_STYLES/.test(report))
  check('...and every week, not just week 1', /all weeks, not just week 1/.test(report))
  // The reason this defect had no number for months.
  const quality = src('src/lib/quality-score.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('the quality rule sweeps the whole mesocycle, not week 1',
    /for \(const week of mesocycle\) \{\s*\n\s*for \(const day of week\.days\) \{/.test(quality))
  check('...and reports the week it actually found the pick in',
    /rule: 'worse_implement_than_available'[\s\S]{0,60}?weekNumber: week\.week_number/.test(quality))
}

console.log(failures === 0 ? '\nStyle leaves every movement a choice, and the real implement wins.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
