import {
  orderCandidates, scoreCandidate, explainWinner,
  setRandomSource, resetRandomSource,
  type ScoreContext, type ScoredCandidate,
} from '../src/lib/exercise-plan'
import { getGoalPolicy } from '../src/lib/goal-policies'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { EXERCISE_DATABASE, type ExerciseEntry } from '../src/lib/exercise-db'
import type { MovementPattern, TrainingExperience } from '../src/lib/types'

// ---------------------------------------------------------------------------
// CHOSEN, NOT SHUFFLED — the claim the whole plan rests on, and until now the
// one with no check behind it.
//
// VISION.md: "score eligible candidates on quality, goal fit, experience fit,
// what's already in the session, and variety across the block — then pick the
// best, not any valid one." CLAUDE.md carried that line tagged UNGUARDED:
// the "Why this exercise" screen exists, but nothing would notice if the
// ranking underneath it quietly became a coin flip.
//
// THAT IS NOT HYPOTHETICAL. exercise-plan.ts's own comments record it
// happening: 906 of 18,909 main/secondary slots (4.79%) resolved to a
// resistance band on a day that already had a real load, because Dumbbell
// Shoulder Press and Band Shoulder Press scored IDENTICALLY on every factor
// and the winner fell out of the tie-break jitter. "A coin flip, 906 times."
//
// SO THE JITTER IS WHAT THIS FILE WATCHES HARDEST. It is deliberate and it is
// load-bearing — without it two genuinely equal candidates always resolve the
// same way, which is its own defect. But it is ±0.3 against factor steps of 1,
// and NOTHING enforced that relationship. Widen it to ±5 and every plan
// becomes a shuffle with all 240 gates still green.
//
// IT CALLS THE RANKER RATHER THAN READING IT. A regex over scoreCandidate can
// be satisfied by a factor that is computed and then never summed — this file
// asserts on what comes back, which is the only form of the claim a dead
// branch cannot satisfy.
// ---------------------------------------------------------------------------

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
/** One exit, so a bail-out can never print FAIL and still exit 0. */
function finish(): never {
  console.log('')
  if (failures > 0) { console.error(`chosen-not-shuffled: ${failures} check(s) failed`); process.exit(1) }
  console.log('chosen-not-shuffled: all checks passed')
  process.exit(0)
}

const POLICY = getGoalPolicy('build_muscle')
const EXPERIENCE: TrainingExperience = 'intermediate'
const byName = (n: string) => EXERCISE_DATABASE.find(e => e.name === n)

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  trackPatterns: ['horizontal_push', 'horizontal_pull'] as MovementPattern[],
  selectedSoFar: [],
  ...over,
})

/** Deterministic per call site, so a failure is reproducible rather than a mood. */
const seeded = <T>(key: string, fn: () => T): T => {
  setRandomSource(seededRngFromKey(key))
  try { return fn() } finally { resetRandomSource() }
}
const rank = (pool: ExerciseEntry[], key: string, over: Partial<ScoreContext> = {}) =>
  seeded(key, () => orderCandidates(pool, POLICY, EXPERIENCE, ctx(over)))
const posOf = (list: ScoredCandidate[], name: string) => list.findIndex(c => c.e.name === name)

console.log('chosen, not shuffled')

// ---------------------------------------------------------------------------
console.log('\n1. The ranker discriminates — a ranking over a constant is a shuffle')
// ---------------------------------------------------------------------------
const PUSH_POOL = EXERCISE_DATABASE.filter(e => e.movement_pattern === 'horizontal_push')
check('the fixture pool is a real slot with real choice', PUSH_POOL.length >= 8, PUSH_POOL.length)
if (PUSH_POOL.length < 8) finish()

// THE PAIR IS FOUND, NOT ASSUMED. My first version took PUSH_POOL[0]'s tier
// and expected two candidates in it — there is exactly ONE tier1 horizontal
// push in the catalogue (Barbell Bench Press), so the fixture could not express
// what it was testing. Same lesson as every other fixture this week: measure it.
const SAME_TIER_PAIR: ExerciseEntry[] = (() => {
  const byTier = new Map<string, ExerciseEntry[]>()
  for (const e of PUSH_POOL) byTier.set(e.mechanics_tier, [...(byTier.get(e.mechanics_tier) ?? []), e])
  const biggest = [...byTier.values()].sort((a, b) => b.length - a.length)[0] ?? []
  return biggest.slice(0, 2)
})()

const ranked = rank(PUSH_POOL, 'discriminate')
const scores = ranked.map(c => c.score)
const spread = Math.max(...scores) - Math.min(...scores)
check('scores spread across the pool rather than clustering on one value', spread > 5, { spread: spread.toFixed(2), n: scores.length })
check('...and the list comes back in descending order', scores.every((s, i) => i === 0 || scores[i - 1] >= s))
check('...with the winner at index 0, which is the one findForSlot takes', ranked[0].score === Math.max(...scores))

// ---------------------------------------------------------------------------
console.log('\n2. The tie-break breaks TIES — it never overturns a real difference')
// ---------------------------------------------------------------------------
// THE CORE ANTI-SHUFFLE PROPERTY, and it is measured rather than read off a
// constant: a check that asserted "jitter === 0.3" would pass a rewrite that
// renamed the constant and pass nothing else.
{
  const SEEDS = Array.from({ length: 60 }, (_, i) => `jitter-${i}`)

  // SEPARATED BY EXACTLY ONE FACTOR POINT — the smallest real difference the
  // scorer can express, and the hardest for a tie-break to respect.
  //
  // MY FIRST VERSION CLAIMED THIS AND DID NOT DO IT: it compared two different
  // TIERS, a 30-point gap, so a tie-break ten times too wide still could not
  // flip it and the mutation went MISSED. The check said "one factor step" in
  // its own comment while the code picked a tier. A fixture has to express the
  // defect it is named for.
  //
  // The pair is one exercise and an identical twin, so NOTHING about the two
  // movements can explain the order — the only difference is that the twin has
  // appeared once this week, which is worth exactly -1.
  const base = PUSH_POOL[0]
  const twin: ExerciseEntry = { ...base, name: `${base.name} (twin)`, id: `${base.id}-twin` }
  const onePoint = { weeklyAppearanceCount: new Map([[twin.name, 1]]) }

  const gaps = SEEDS.map(sd => {
    const l = rank([base, twin], sd, onePoint)
    return { winner: l[0].e.name, gap: Math.abs(l[0].score - l[1].score) }
  })
  check('the fixture really is a one-point difference', gaps.every(g => g.gap < 2), gaps[0])
  const flipped = gaps.filter(g => g.winner !== base.name).length
  check('a one-point difference survives every seed the tie-break can throw', flipped === 0,
    { flipped, of: SEEDS.length, example: gaps.find(g => g.winner !== base.name) })

  // THE DETECTOR, PROVEN. If the tie-break were dead the check above would pass
  // for the wrong reason, so two IDENTICAL candidates must sometimes come back
  // in a different order. Its absence is its own defect — the 906 band slots
  // all resolved the same way.
  const orders = new Set(SEEDS.map(sd => rank([base, { ...twin }], sd)[0].e.name))
  check('...while two identical candidates do NOT always resolve the same way', orders.size === 2, [...orders])
}

// ---------------------------------------------------------------------------
console.log('\n3. A bigger movement never loses to a smaller one')
// ---------------------------------------------------------------------------
// exercise-plan.ts states this as absolute: "a tier1 main lift must never lose
// a comparison to a tier2/tier3 accessory, in ANY call site". Tested with every
// other factor pushed AGAINST the tier1 candidate at once.
{
  const tier1 = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier1_compound' && e.movement_pattern === 'horizontal_push')
  const tier3 = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier3_isolation' && e.movement_pattern === 'horizontal_push')
  check('the catalogue has both a main lift and an accessory for this pattern', !!tier1 && !!tier3, { tier1: tier1?.name, tier3: tier3?.name })
  if (!tier1 || !tier3) finish()

  const stacked = ctx({
    // Every knob turned against the main lift: it repeats muscles already
    // picked, it has appeared three times this week, and it is off-style.
    selectedSoFar: [tier1, tier1],
    weeklyAppearanceCount: new Map([[tier1.name, 3]]),
    trainingStyle: tier3.style_tags[0],
    trackPatterns: [] as MovementPattern[],
  })
  const worstCase = seeded('tier-gap', () => orderCandidates([tier3, tier1], POLICY, EXPERIENCE, stacked))
  check('the main lift still wins with every other factor against it', worstCase[0].e.name === tier1.name,
    worstCase.map(c => ({ n: c.e.name, s: Number(c.score.toFixed(2)) })))
}

// ---------------------------------------------------------------------------
console.log('\n4. The ranking answers to the person, one factor at a time')
// ---------------------------------------------------------------------------
{
  check('two same-tier candidates exist, so a factor can decide between them', SAME_TIER_PAIR.length === 2, SAME_TIER_PAIR.map(e => e.name))
  if (SAME_TIER_PAIR.length !== 2) finish()
  const [x, y] = SAME_TIER_PAIR

  // Variety: an exercise already used this week loses to an equal one.
  const fresh = rank([x, y], 'variety', { weeklyAppearanceCount: new Map([[x.name, 2]]) })
  check('an exercise already used this week ranks below an equal one', posOf(fresh, y.name) < posOf(fresh, x.name), fresh.map(c => c.e.name))

  // Session balance: one that repeats a muscle already worked today loses.
  // ASSERTED ON THE FACTOR, not on a position. The first version compared
  // ranks with <=, which is satisfied by nothing moving at all — zeroing the
  // whole factor went MISSED.
  const balanced = seeded('balance', () => scoreCandidate(x, POLICY, EXPERIENCE, ctx({ selectedSoFar: [x, x] })))
  const unbalanced = seeded('balance', () => scoreCandidate(x, POLICY, EXPERIENCE, ctx()))
  check('repeating a muscle already worked today costs the candidate',
    balanced.factors.session_balance < 0 && balanced.factors.session_balance < unbalanced.factors.session_balance,
    { withOverlap: balanced.factors.session_balance, without: unbalanced.factors.session_balance })

  // Experience: a regression is penalised for someone past it. Compared
  // against the SAME candidate at a different experience level, so nothing
  // about the two exercises can explain the move.
  const beginnerFirst = seeded('exp', () => orderCandidates([x, y], POLICY, 'beginner', ctx()))
  const advancedFirst = seeded('exp', () => orderCandidates([x, y], POLICY, 'advanced', ctx()))
  const expFactors = (l: ScoredCandidate[]) => l.map(c => c.factors.experience_fit)
  check('experience changes the scoring, not just the labels',
    JSON.stringify(expFactors(beginnerFirst)) !== JSON.stringify(expFactors(advancedFirst))
    || expFactors(beginnerFirst).every(v => v === 0),
    { beginner: expFactors(beginnerFirst), advanced: expFactors(advancedFirst) })

  // Style: an off-style candidate is penalised, and by a real amount.
  // A CANDIDATE THAT IS ACTUALLY OFF-STYLE. The first version branched on
  // whether x happened to be on-style and asserted `=== 0` when it was — which
  // zeroing the factor also satisfies. Find one that is genuinely off-style, or
  // say the catalogue cannot express this rather than passing vacuously.
  // Searched across the whole catalogue, not this slot's pool: every
  // horizontal push happens to carry the bodybuilding tag, and style fit does
  // not depend on the movement pattern.
  const offStyle = EXERCISE_DATABASE.find(e => !e.style_tags.includes('bodybuilding'))
  check('the catalogue has an off-style movement for this slot', !!offStyle, offStyle?.name)
  if (offStyle) {
    const styled = seeded('style', () => scoreCandidate(offStyle, POLICY, EXPERIENCE, ctx({ trainingStyle: 'bodybuilding' })))
    const unstyled = seeded('style', () => scoreCandidate(offStyle, POLICY, EXPERIENCE, ctx()))
    check('an off-style movement is penalised, and only when a style is set',
      styled.factors.style_fit < 0 && unstyled.factors.style_fit === 0,
      { exercise: offStyle.name, tags: offStyle.style_tags, withStyle: styled.factors.style_fit, without: unstyled.factors.style_fit })
  }
}

// ---------------------------------------------------------------------------
console.log('\n5. The reason on screen is the factor that actually decided it')
// ---------------------------------------------------------------------------
{
  // explainWinner only speaks when ONE factor accounts for at least half the
  // gap, and the tier bonus and band penalty are deliberately kept OUT of
  // `factors` so they can never be quoted at a trainee as coaching.
  const tier1 = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier1_compound' && e.movement_pattern === 'horizontal_push')!
  const tier3 = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier3_isolation' && e.movement_pattern === 'horizontal_push')!
  const tierOnly = seeded('explain-tier', () => orderCandidates([tier1, tier3], POLICY, EXPERIENCE, ctx({ trackPatterns: [] as MovementPattern[] })))
  const tierNote = explainWinner(tierOnly[0], tierOnly[1], POLICY)
  check('a pick separated only by size says nothing — that is structure, not coaching', tierNote === undefined, tierNote)

  // A pick separated by a REAL factor speaks, and names that factor's reason.
  const varietyRanked = rank(SAME_TIER_PAIR, 'explain-variety', { weeklyAppearanceCount: new Map([[SAME_TIER_PAIR[0].name, 3]]) })
  const note = explainWinner(varietyRanked[0], varietyRanked[1], POLICY)
  check('a pick decided by freshness says so, naming both exercises',
    !!note && /fresher/i.test(note) && note.includes(varietyRanked[0].e.name) && note.includes(varietyRanked[1].e.name), note)

  // A FACTOR THAT APPLIED BUT DID NOT DECIDE MUST STAY SILENT — the "quieter"
  // design call, and the half-the-gap threshold is the whole of it. Without
  // this fixture, removing that threshold changed nothing any check could see.
  // Here the winner leads on one small factor while the real gap is a tier,
  // so one point against ~30 is nowhere near half.
  const freshMain = rank([tier1, tier3], 'explain-threshold', { weeklyAppearanceCount: new Map([[tier3.name, 1]]) })
  const quiet = explainWinner(freshMain[0], freshMain[1], POLICY)
  check('a factor that applied but did not decide the pick stays quiet', quiet === undefined, quiet)

  // And it never cites a factor the winner did not actually beat the runner-up on.
  if (note) {
    const decisive = (Object.keys(varietyRanked[0].factors) as (keyof typeof varietyRanked[0].factors)[])
      .filter(k => varietyRanked[0].factors[k] > varietyRanked[1].factors[k])
    check('...and only ever cites a factor it genuinely won on', decisive.length > 0, decisive)
  }
}

finish()
