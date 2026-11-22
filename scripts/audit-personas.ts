// audit:personas — EVERY KIND OF PERSON, EVERY RULE, ONE RUN (his "why are we testing one scenario at a time? do a
// full audit of all possible profiles", 22 Nov 2026).
//
// Six one-person reads (60 and 70-year-old beginners, a 25-year-old advanced man, a 40-year-old intermediate woman, a
// 30 and a 35-year-old pregnant woman, a 50-year-old man with a bad back) each found three to five things a coach
// would not sign. Each was fixed and gated for that person. This asks the same questions of everyone at once: a
// seeded, stratified sample of profiles, every special group (pregnancy at three stages, older beginners, 65+, each
// of the eight injuries and common pairs, the health conditions, the walking start) drawn several hundred times with
// every other answer random, and every rule below run against every plan.
//
// It REPORTS, it does not gate: each rule prints how many plans it applies to, how many break it, and examples. The
// rules are the CSCS reads already made in this repo, written as detectors; the number to act on is the breach rate.
//
//   npx tsx scripts/audit-personas.ts            (4 shards in parallel, ~6,000 profiles)
//   AUDIT_N=800 npx tsx scripts/audit-personas.ts (a quick run)
import { spawnSync, spawn } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { generateMesocycle, setRandomSource, getConstrainedPool, getFlaggedJoints, beginnerWorkingSets, OPTIONAL_CARDIO_FOCUS, daysDroppedForRecovery } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, isContraindicatedFor, isIndicatedFor, getMovementFamily, isBallisticMovement, isGenuineDuplicate } from '../src/lib/exercise-db'
import { pregnancyExclusion, PREGNANCY_LATE_EXCLUDED, PREGNANCY_REP_FLOOR } from '../src/lib/pregnancy-rules'
import { lateInPregnancy, isPregnant, hasHealthCondition, HEALTH_SET_RPE_CEILING, HEALTH_CONDITIONING_RPE_CEILING, LATE_PREGNANCY_SET_RPE_CEILING } from '../src/lib/health-conditions'
import { needsBeginnerSafeguards, beginnerSafeguardExclusion, olderAdultExclusion, isOlderBeginner } from '../src/lib/older-beginner'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { estimateDaySeconds, getSessionMinimumSeconds, getSessionMaximumSeconds } from '../src/lib/session-duration'
import { getLocalDateString, getAppNow } from '../src/lib/dev-clock'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

const N = Number(process.env.AUDIT_N ?? 6000)
const SHARDS = Number(process.env.AUDIT_SHARDS ?? 4)
const OUT = process.env.AUDIT_OUT ?? 'scratch-audit-personas'

// ---------------------------------------------------------------------------------------------------------------------
// The population
// ---------------------------------------------------------------------------------------------------------------------
const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SETS: Record<number, string[]> = {
  2: ['Monday', 'Thursday'], 3: ['Monday', 'Wednesday', 'Friday'], 4: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
  5: ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'], 6: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}
const INJURIES = ['lower_back', 'knees', 'shoulders', 'neck', 'wrists', 'hips', 'elbows', 'ankles']
const PAIRS = [['lower_back', 'knees'], ['shoulders', 'wrists'], ['hips', 'ankles'], ['lower_back', 'shoulders'], ['knees', 'ankles']]
type Group = { name: string; make: (r: () => number) => Partial<UserProfile> & { pregWeeks?: number } }
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const GROUPS: Group[] = [
  { name: 'anyone', make: () => ({}) },
  { name: 'pregnant, no due date', make: r => ({ gender: 'female', age: pick(r, [22, 28, 33, 38, 42]), health_conditions: ['pregnancy'] }) },
  { name: 'pregnant, 14 weeks', make: r => ({ gender: 'female', age: pick(r, [22, 28, 33, 38, 42]), health_conditions: ['pregnancy'], pregWeeks: 14 }) },
  { name: 'pregnant, 24 weeks', make: r => ({ gender: 'female', age: pick(r, [22, 28, 33, 38, 42]), health_conditions: ['pregnancy'], pregWeeks: 24 }) },
  { name: 'pregnant, 31 weeks', make: r => ({ gender: 'female', age: pick(r, [22, 28, 33, 38, 42]), health_conditions: ['pregnancy'], pregWeeks: 31 }) },
  { name: 'pregnant beginner', make: r => ({ gender: 'female', age: pick(r, [24, 30, 36]), health_conditions: ['pregnancy'], training_experience: 'beginner' }) },
  { name: 'beginner 60-64', make: r => ({ age: pick(r, [60, 62, 64]), training_experience: 'beginner' }) },
  { name: 'beginner 65-80', make: r => ({ age: pick(r, [65, 70, 75, 80]), training_experience: 'beginner' }) },
  { name: '65+ trained', make: r => ({ age: pick(r, [65, 68, 72, 76]), training_experience: pick(r, ['novice', 'intermediate', 'advanced'] as const) }) },
  ...INJURIES.map(i => ({ name: `injury: ${i}`, make: () => ({ injuries: [i] }) })),
  { name: 'two injuries', make: r => ({ injuries: pick(r, PAIRS) }) },
  { name: 'high blood pressure', make: () => ({ health_conditions: ['high_blood_pressure'] }) },
  { name: 'heart condition', make: r => ({ health_conditions: ['heart_condition'], age: pick(r, [45, 55, 65, 72]) }) },
  { name: 'diabetes', make: () => ({ health_conditions: ['diabetes'] }) },
  { name: 'older with an injury', make: r => ({ age: pick(r, [62, 68, 74]), injuries: [pick(r, INJURIES)] }) },
  { name: 'walking start', make: () => ({ start_preference: 'move_more' as const, training_experience: 'beginner' as const }) },
]

export function profileFor(i: number): { p: UserProfile; group: string; key: string } {
  const g = GROUPS[i % GROUPS.length]
  const r = seededRngFromKey(`persona|${i}`)
  const gender = pick(r, ['male', 'female'] as const)
  const base: UserProfile = {
    age: pick(r, [19, 25, 32, 40, 48, 55]), gender, height_cm: gender === 'male' ? pick(r, [170, 178, 186]) : pick(r, [158, 165, 172]),
    weight_kg: gender === 'male' ? pick(r, [68, 82, 95, 118]) : pick(r, [55, 66, 78, 98]),
    activity_level: pick(r, ['sedentary', 'lightly_active', 'moderately_active', 'very_active']), start_preference: 'train',
    fitness_goal: pick(r, ['fat_loss', 'hypertrophy', 'functional', 'conditioning'] as const),
    equipment_access: pick(r, ['full_gym', 'full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const),
    training_style: pick(r, ['functional', 'bodybuilding', 'combat', 'hybrid'] as const),
    training_experience: pick(r, ['beginner', 'novice', 'intermediate', 'advanced'] as const),
    session_duration_preference: pick(r, ['20-30', '30-45', '45-60', '45-60', '60-90'] as const),
    recovery_capacity: pick(r, ['low', 'moderate', 'moderate', 'high'] as const),
    conditioning_preference: pick(r, ['avoid', 'tolerate', 'enjoy', 'love'] as const),
    workout_split_preference: 'ai_recommendation', injuries: [], health_conditions: [], dietary_preferences: [],
    training_days: [],
  } as unknown as UserProfile
  const over = g.make(r)
  const nd = pick(r, [2, 3, 3, 4, 4, 5, 6])
  const p = { ...base, ...over, training_days: ALL.map(d => ({ day: d, available: DAY_SETS[nd].includes(d) })) } as UserProfile & { pregWeeks?: number }
  if (over.pregWeeks != null) {
    const due = new Date(getAppNow(undefined).getTime() + (40 - over.pregWeeks) * 7 * 86_400_000)
    ;(p as { due_date?: string }).due_date = getLocalDateString(due)
  }
  delete p.pregWeeks
  return { p, group: g.name, key: `persona|${i}` }
}

// ---------------------------------------------------------------------------------------------------------------------
// The rules. Each takes a plan and returns the breaches it finds (an empty list is a pass); `applies` says whether the
// rule is about this person at all, so a rate is breaches over the plans it applies to.
// ---------------------------------------------------------------------------------------------------------------------
type Breach = string
type Rule = { id: string; kind: 'safety' | 'coaching'; text: string; applies: (p: UserProfile) => boolean; check: (p: UserProfile, m: MesocycleWeek[], ctx: Ctx) => Breach[] }
type Ctx = { poolPatterns: Set<string>; poolNames: Set<string> }
const entry = (n: string) => getExerciseEntry(n)
const loading = (m: MesocycleWeek[]) => m.filter(w => !w.is_deload)
const lifting = (w: MesocycleWeek) => w.days.filter(d => d.exercises.length > 0)
const repsHigh = (r: unknown) => { const m = String(r).match(/(\d+)(?:\s*-\s*(\d+))?$/); return m ? Number(m[2] ?? m[1]) : null }
const repsLow = (r: unknown) => { const m = String(r).match(/^(\d+)/); return m ? Number(m[1]) : null }
const rpeHigh = (s: unknown) => { const m = String(s ?? '').match(/RPE\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/i); return m ? Number(m[2] ?? m[1]) : null }
const isPrimer = (n: string) => entry(n)?.mechanics_tier === 'primer'
const weekDate = (p: UserProfile, w: number) => getLocalDateString(new Date(getAppNow(p.id).getTime() + (w - 1) * 7 * 86_400_000))

const RULES: Rule[] = [
  { id: 'S1', kind: 'safety', text: 'no exercise contraindicated for an injury on the list', applies: p => (p.injuries ?? []).length > 0,
    check: (p, m) => { const j = getFlaggedJoints(p.injuries ?? []); const out = new Set<string>(); for (const w of m) for (const d of w.days) for (const e of d.exercises) { const x = entry(e.name); if (x && isContraindicatedFor(x, j)) out.add(e.name) } return [...out] } },
  { id: 'S2', kind: 'safety', text: 'pregnant: no jumping, lying flat or hard-ab move', applies: p => isPregnant(p),
    check: (_p, m) => [...new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => pregnancyExclusion({ name: e.name, parent: entry(e.name)?.parent })).map(e => e.name))))] },
  { id: 'S3', kind: 'safety', text: 'pregnant: 8 reps or more on every rep-counted lift', applies: p => isPregnant(p),
    check: (_p, m) => [...new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => !isPrimer(e.name) && entry(e.name)?.prescription_type === 'reps' && (repsLow(e.reps) ?? 99) < PREGNANCY_REP_FLOOR).map(e => `${e.name} ${e.reps}`))))] },
  { id: 'S4', kind: 'safety', text: 'pregnant from 28 weeks: none of the late-pregnancy moves, sets at RPE 7 or less', applies: p => isPregnant(p) && !!(p as { due_date?: string }).due_date,
    check: (p, m) => { const out: string[] = []; for (const w of m) { if (!lateInPregnancy(p, weekDate(p, w.week_number))) continue; for (const d of w.days) for (const e of d.exercises) { if (PREGNANCY_LATE_EXCLUDED.has(e.name)) out.push(`w${w.week_number} ${e.name}`); const r = rpeHigh(e.intensity); if (!isPrimer(e.name) && r != null && r > LATE_PREGNANCY_SET_RPE_CEILING) out.push(`w${w.week_number} ${e.name} ${e.intensity}`) } } return [...new Set(out)].slice(0, 5) } },
  { id: 'S5', kind: 'safety', text: 'pregnant: pelvic floor work in every training day\'s warm-up', applies: p => isPregnant(p),
    check: (_p, m) => { const days = m.flatMap(w => lifting(w).filter(d => !(d.warmup?.general ?? []).concat(d.warmup?.mobility ?? []).some(x => /pelvic floor/i.test(x.name))).map(d => `w${w.week_number} ${d.day}`)); return days.slice(0, 3) } },
  { id: 'S6', kind: 'safety', text: 'beginner from 60 / pregnant beginner: the safer list (no barbell, technique, hanging, jump, balance-heavy)', applies: p => needsBeginnerSafeguards(p),
    check: (p, m, ctx) => { const out = new Set<string>(); for (const w of m) for (const d of w.days) for (const e of d.exercises) { const x = entry(e.name); if (!x) continue; const why = beginnerSafeguardExclusion(p, x); if (!why) continue; // a pattern with no other option keeps one (the pattern floor), named apart
        const alternatives = [...ctx.poolNames].some(n => { const y = entry(n); return !!y && y.movement_pattern === x.movement_pattern && !beginnerSafeguardExclusion(p, y) }); if (alternatives || why === 'hanging' || why === 'impact') out.add(`${e.name} (${why})`) } return [...out] } },
  { id: 'S7', kind: 'safety', text: 'from 65: no jump with a real landing', applies: p => (p.age ?? 0) >= 65,
    check: (p, m) => [...new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => { const x = entry(e.name); return !!x && olderAdultExclusion(p, x) }).map(e => e.name))))] },
  { id: 'S8', kind: 'safety', text: 'health condition: sets at RPE 8 or less, conditioning 7 or less', applies: p => hasHealthCondition(p),
    check: (_p, m) => { const out = new Set<string>(); for (const w of m) for (const d of w.days) { for (const e of d.exercises) { const r = rpeHigh(e.intensity); if (!isPrimer(e.name) && r != null && r > HEALTH_SET_RPE_CEILING) out.add(`${e.name} ${e.intensity}`) } const c = d.recommendedCardio?.targetRpe; if (c != null && c > HEALTH_CONDITIONING_RPE_CEILING) out.add(`${d.day} cardio RPE ${c}`) } return [...out].slice(0, 5) } },
  { id: 'S9', kind: 'safety', text: 'working sets per session: beginner 18, bad back 22', applies: p => p.training_experience === 'beginner' || (p.injuries ?? []).includes('lower_back'),
    check: (p, m) => { const cap = p.training_experience === 'beginner' ? 18 : 22; return m.flatMap(w => lifting(w).filter(d => beginnerWorkingSets(d) > cap).map(d => `w${w.week_number} ${d.day} ${beginnerWorkingSets(d)}`)).slice(0, 3) } },
  { id: 'C1', kind: 'coaching', text: 'every loading week squats, hinges, pushes and pulls (where the kit and injuries allow)', applies: () => true,
    check: (_p, m, ctx) => { const want: [string, string[]][] = [['squat', ['knee_dominant', 'single_leg']], ['hinge', ['hip_hinge']], ['push', ['horizontal_push', 'vertical_push']], ['pull', ['horizontal_pull', 'vertical_pull']]]; const out: string[] = []
        for (const w of loading(m)) { if (!lifting(w).length) continue; const pats = new Set(w.days.flatMap(d => d.exercises.filter(e => !isPrimer(e.name)).map(e => entry(e.name)?.movement_pattern ?? ''))); for (const [name, ps] of want) if (ps.some(x => ctx.poolPatterns.has(x)) && !ps.some(x => pats.has(x))) out.push(`w${w.week_number} no ${name}`) } return out.slice(0, 3) } },
  { id: 'C2', kind: 'coaching', text: 'trunk work at least twice a loading week', applies: p => p.start_preference !== 'move_more',
    check: (_p, m, ctx) => ctx.poolPatterns.has('core') ? loading(m).filter(w => lifting(w).length && w.days.reduce((n, d) => n + d.exercises.filter(e => entry(e.name)?.movement_pattern === 'core').length, 0) < 2).map(w => `w${w.week_number}`).slice(0, 3) : [] },
  { id: 'C3', kind: 'coaching', text: 'one heavy floor pull (deadlift family, tier 1) a week at most', applies: () => true,
    check: (_p, m) => loading(m).filter(w => w.days.filter(d => d.exercises.some(e => { const x = entry(e.name); return !!x && x.mechanics_tier === 'tier1_compound' && getMovementFamily(x) === 'deadlift' })).length >= 2).map(w => `w${w.week_number}`).slice(0, 3) },
  { id: 'C4', kind: 'coaching', text: 'no lift with a weight on it past 20 reps', applies: () => true,
    check: (_p, m) => [...new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => (e.suggested_load_kg ?? 0) > 0 && (repsHigh(e.reps) ?? 0) > 20 && entry(e.name)?.prescription_type === 'reps').map(e => `${e.name} ${e.reps}`))))].slice(0, 3) },
  { id: 'C5', kind: 'coaching', text: 'the same exercise never twice in one session', applies: () => true,
    check: (_p, m) => m.flatMap(w => w.days.filter(d => new Set(d.exercises.map(e => e.name)).size < d.exercises.length).map(d => `w${w.week_number} ${d.day}`)).slice(0, 3) },
  { id: 'C6', kind: 'coaching', text: 'a deload week is lighter than the week before, lift by lift', applies: () => true,
    check: (_p, m) => { const out: string[] = []; for (let i = 1; i < m.length; i++) { if (!m[i].is_deload) continue; const before = new Map(m[i - 1].days.flatMap(d => d.exercises.map(e => [e.name, e.suggested_load_kg ?? 0] as const))); for (const d of m[i].days) for (const e of d.exercises) { const b = before.get(e.name) ?? 0, now = e.suggested_load_kg ?? 0; if (b > 0 && now > b) out.push(`w${m[i].week_number} ${e.name} ${b}->${now}`) } } return out.slice(0, 3) } },
  { id: 'C7', kind: 'coaching', text: 'no lift jumps more than 20% (and 5 kg) week to week inside a block, and one lift has one weight a week (same reps)', applies: () => true,
    check: (_p, m) => { const out: string[] = []
      for (const w of m) { const seen = new Map<string, number>(); for (const d of w.days) for (const e of d.exercises) { if (!(e.suggested_load_kg ?? 0)) continue; const k = `${e.name}|${e.reps}`; const o = seen.get(k); if (o != null && o !== e.suggested_load_kg) out.push(`w${w.week_number} ${e.name} two weights ${o}/${e.suggested_load_kg}`); seen.set(k, e.suggested_load_kg as number) } }
      for (let i = 1; i < m.length; i++) { if (m[i].is_deload || m[i - 1].is_deload || (m[i] as { block_number?: number }).block_number !== (m[i - 1] as { block_number?: number }).block_number) continue
        for (const d of m[i].days) { const prev = m[i - 1].days.find(x => x.day === d.day); if (!prev) continue; for (const e of d.exercises) { const b = prev.exercises.find(x => x.name === e.name)?.suggested_load_kg ?? 0, now = e.suggested_load_kg ?? 0; if (b > 0 && now > b * 1.2 && now - b > 5) out.push(`w${m[i].week_number} ${e.name} ${b}->${now}`) } } }
      return out.slice(0, 3) } },
  { id: 'C8a', kind: 'coaching', text: 'a loading-week session reaches the minimum time asked for', applies: p => p.start_preference !== 'move_more',
    check: (p, m) => { const lo = getSessionMinimumSeconds((p.session_duration_preference ?? '45-60') as never); return loading(m).flatMap(w => lifting(w).filter(d => estimateDaySeconds(d) < lo).map(d => `w${w.week_number} ${d.day} ${(estimateDaySeconds(d) / 60).toFixed(0)} min`)).slice(0, 3) } },
  { id: 'C8b', kind: 'coaching', text: 'a loading-week session never runs past the time asked for', applies: () => true,
    check: (p, m) => { const hi = getSessionMaximumSeconds((p.session_duration_preference ?? '45-60') as never); return loading(m).flatMap(w => lifting(w).filter(d => estimateDaySeconds(d) > hi).map(d => `w${w.week_number} ${d.day} ${(estimateDaySeconds(d) / 60).toFixed(0)} min`)).slice(0, 3) } },
  { id: 'C9', kind: 'coaching', text: 'every chosen training day holds a session (low recovery rests the days his ruling names)', applies: p => p.start_preference !== 'move_more',
    check: (p, m) => { const rested = new Set(daysDroppedForRecovery(p)); const chosen = (p.training_days ?? []).filter(d => d.available && !rested.has(d.day)).map(d => d.day); return loading(m).flatMap(w => chosen.filter(c => !w.days.some(d => d.day === c && (d.exercises.length > 0 || d.plannedActivity))).map(c => `w${w.week_number} ${c}`)).slice(0, 3) } },
  { id: 'C10', kind: 'coaching', text: 'fat loss or conditioning: some cardio in the week', applies: p => p.fitness_goal === 'fat_loss' || p.fitness_goal === 'conditioning',
    check: (_p, m) => loading(m).filter(w => !w.days.some(d => d.recommendedCardio || d.plannedActivity || d.exercises.some(e => { const x = entry(e.name); return x?.movement_pattern === 'cardio' || x?.mechanics_tier === 'cardio' }))).map(w => `w${w.week_number}`).slice(0, 3) },
  { id: 'C11', kind: 'coaching', text: 'a beginner from 60 or a pregnant beginner: two optional rest-day walks (not with low recovery)', applies: p => needsBeginnerSafeguards(p) && p.recovery_capacity !== 'low' && p.start_preference !== 'move_more',
    check: (_p, m) => m.filter(w => w.days.filter(d => d.focus === OPTIONAL_CARDIO_FOCUS).length < 1).map(w => `w${w.week_number}`).slice(0, 3) },
  { id: 'C12', kind: 'coaching', text: 'a loaded lift carries a weight (no blank box on a lift that needs one)', applies: () => true,
    check: (_p, m) => [...new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => { const x = entry(e.name); return !!x && !isPrimer(e.name) && isExternallyLoaded(x) && !isBallisticMovement(x) && x.prescription_type === 'reps' && e.suggested_load_kg == null && e.suggested_assistance_kg == null && !/feel/i.test(String(e.suggested_load ?? ''))}).map(e => e.name))))].slice(0, 3) },
  // ---- THE REST OF A COACH'S CHECKLIST (22 Nov 2026, his "why are we still finding issues? run tests on all cases"):
  // the six one-person reads kept finding what no rule above asked. These ask it of everyone.
  { id: 'C13', kind: 'coaching', text: 'front and back of the thigh in balance (neither more than 2.5x the other, weekly sets; single-leg work counts half to each)', applies: () => true,
    check: (_p, m, ctx) => { if (!['knee_dominant', 'single_leg', 'isolation_quad'].some(x => ctx.poolPatterns.has(x)) || !['hip_hinge', 'isolation_hamstring'].some(x => ctx.poolPatterns.has(x))) return []
      return loading(m).flatMap(w => { const sum = (ps: string[]) => w.days.reduce((n, d) => n + d.exercises.filter(e => !isPrimer(e.name) && ps.includes(entry(e.name)?.movement_pattern ?? '')).reduce((a, e) => a + (e.sets ?? 0), 0), 0)
        const sl = sum(['single_leg']) / 2, q = sum(['knee_dominant', 'isolation_quad']) + sl, h = sum(['hip_hinge', 'isolation_hamstring']) + sl; return q + h >= 8 && (q > h * 2.5 || h > q * 2.5) ? [`w${w.week_number} quad ${q} / hamstring ${h}`] : [] }).slice(0, 3) } },
  { id: 'C14', kind: 'coaching', text: 'a trained lifter\'s unweighted leg compound gets weight (or a tempo) at some point in the plan', applies: p => p.training_experience === 'intermediate' || p.training_experience === 'advanced',
    check: (p, m) => { if (p.equipment_access === 'bodyweight' || isPregnant(p) || !m.some(w => /hypertrophy|strength/i.test(w.phase_label ?? ''))) return []; const by = new Map<string, { n: number; loaded: boolean }>()
      for (const w of loading(m)) for (const d of w.days) for (const e of d.exercises) { const x = entry(e.name); if (!x || x.mechanics_tier !== 'tier2_compound' || !['knee_dominant', 'single_leg'].includes(x.movement_pattern) || x.prescription_type !== 'reps' || e.tempo) continue
        const r = by.get(e.name) ?? { n: 0, loaded: false }; r.n++; if ((e.suggested_load_kg ?? 0) > 0 || (e.suggested_added_load_kg ?? 0) > 0) r.loaded = true; by.set(e.name, r) }
      return [...by.entries()].filter(([, r]) => r.n >= 12 && !r.loaded).map(([n, r]) => `${n} (${r.n} sessions, never weighted)`) } },
  { id: 'C15', kind: 'coaching', text: 'an even week: no lifting day under 60% of the heaviest day\'s working sets AND under 75% of its minutes (conditioning days aside)', applies: () => true,
    check: (_p, m) => loading(m).flatMap(w => { const ds = lifting(w).filter(d => d.focus !== 'Conditioning & Core' && !d.exercises.some(e => entry(e.name)?.mechanics_tier === 'cardio' || entry(e.name)?.movement_pattern === 'cardio'))
      if (ds.length < 2) return []; const sets = ds.map(d => beginnerWorkingSets(d)), mins = ds.map(d => estimateDaySeconds(d) / 60); const ms = Math.max(...sets), mm = Math.max(...mins)
      return ds.some((_, k) => sets[k] < ms * 0.6 && mins[k] < mm * 0.75) ? [`w${w.week_number} ${sets.join('/')} sets, ${mins.map(x => x.toFixed(0)).join('/')} min`] : [] }).slice(0, 3) },
  { id: 'C16', kind: 'coaching', text: 'an injury gets its rehab work every loading week (where the pool has some)', applies: p => (p.injuries ?? []).length > 0,
    check: (p, m, ctx) => { const j = getFlaggedJoints(p.injuries ?? []); const rehab = [...ctx.poolNames].filter(n => { const e = entry(n); return !!e && isIndicatedFor(e, j) }); if (!rehab.length) return []
      return loading(m).filter(w => lifting(w).length && !w.days.some(d => d.exercises.some(e => { const x = entry(e.name); return !!x && isIndicatedFor(x, j) }))).map(w => `w${w.week_number}`).slice(0, 3) } },
  { id: 'C17', kind: 'coaching', text: 'enough work per muscle: chest, back and legs each at least 4 working sets a loading week (3+ days, not a walking start)', applies: p => p.start_preference !== 'move_more' && (p.training_days ?? []).filter(d => d.available).length >= 3,
    check: (_p, m, ctx) => { const groups: [string, string[]][] = [['chest', ['horizontal_push', 'isolation_chest']], ['back', ['horizontal_pull', 'vertical_pull']], ['legs', ['knee_dominant', 'single_leg', 'hip_hinge']]]
      return loading(m).flatMap(w => groups.filter(([, ps]) => ps.some(x => ctx.poolPatterns.has(x))).filter(([, ps]) => w.days.reduce((n, d) => n + d.exercises.filter(e => !isPrimer(e.name) && ps.includes(entry(e.name)?.movement_pattern ?? '')).reduce((a, e) => a + (e.sets ?? 0), 0), 0) < 4).map(([g]) => `w${w.week_number} ${g}`)).slice(0, 3) } },
  { id: 'C18', kind: 'coaching', text: 'pushing never more than 1.5x pulling, weekly sets', applies: () => true,
    check: (_p, m) => loading(m).flatMap(w => { const sum = (ps: string[]) => w.days.reduce((n, d) => n + d.exercises.filter(e => !isPrimer(e.name) && ps.includes(entry(e.name)?.movement_pattern ?? '')).reduce((a, e) => a + (e.sets ?? 0), 0), 0)
      const push = sum(['horizontal_push', 'vertical_push']), pull = sum(['horizontal_pull', 'vertical_pull']); return pull > 0 && push > pull * 1.5 ? [`w${w.week_number} push ${push} / pull ${pull}`] : [] }).slice(0, 3) },
  { id: 'C19', kind: 'coaching', text: 'a main (tier-1) lift rests at least 90 seconds in a heavy block (muscle-building, strength), 60 in a light one (a conditioning plan\'s bodyweight main lift aside: his short-rest ruling)', applies: () => true,
    check: (p, m) => [...new Set(m.flatMap(w => { const heavy = /hypertrophy|strength|consolidation|power/i.test(w.phase_label ?? ''); return w.days.flatMap(d => d.exercises.filter(e => entry(e.name)?.mechanics_tier === 'tier1_compound' && e.rest !== 'alternate' && !(p.fitness_goal === 'conditioning' && !isExternallyLoaded(entry(e.name)!)) && (parseInt(String(e.rest)) || 999) < (heavy ? 90 : 60)).map(e => `${w.phase_label}: ${e.name} ${e.rest}`)) }))].slice(0, 3) },
  { id: 'C20', kind: 'coaching', text: 'every lifting day has a warm-up', applies: () => true,
    check: (_p, m) => m.flatMap(w => lifting(w).filter(d => !d.warmup || ((d.warmup.general ?? []).length + (d.warmup.mobility ?? []).length) === 0).map(d => `w${w.week_number} ${d.day}`)).slice(0, 3) },
  { id: 'C21', kind: 'coaching', text: 'no session repeats itself: never the same movement twice (two angles, two implements or two planes of one family are fine)', applies: () => true,
    check: (_p, m) => [...new Set(m.flatMap(w => w.days.flatMap(d => { const xs = d.exercises.filter(e => !isPrimer(e.name)).map(e => entry(e.name)).filter((x): x is NonNullable<typeof x> => !!x && x.movement_pattern !== 'cardio')
      const out: string[] = []; xs.forEach((a, i) => xs.slice(i + 1).forEach(b => { if (getMovementFamily(a) !== getMovementFamily(b)) return
        if (isGenuineDuplicate(a, b)) out.push(`${d.day}: ${a.name} + ${b.name}`) })); return out })))].slice(0, 3) },
]

// ---------------------------------------------------------------------------------------------------------------------
// One shard: generate, check, write JSON
// ---------------------------------------------------------------------------------------------------------------------
type Row = { i: number; group: string; crash?: string; breaches: Record<string, Breach[]>; applies: string[]; summary: string }
function describe(p: UserProfile): string {
  const days = (p.training_days ?? []).filter(d => d.available).length
  const due = (p as { due_date?: string }).due_date
  return [`${p.age} ${p.gender}`, p.training_experience, p.fitness_goal, p.equipment_access, p.training_style, `${days} days`, p.session_duration_preference,
    p.recovery_capacity && `recovery ${p.recovery_capacity}`, p.conditioning_preference && `cardio ${p.conditioning_preference}`, (p.injuries ?? []).length ? `injuries ${(p.injuries ?? []).join('+')}` : '',
    (p.health_conditions ?? []).length ? (p.health_conditions ?? []).join('+') + (due ? ` due ${due}` : '') : '', p.start_preference === 'move_more' ? 'walking start' : ''].filter(Boolean).join(', ')
}
function runShard(shard: number): Row[] {
  const rows: Row[] = []
  const quiet = console.log, warn = console.warn
  for (let i = shard; i < N; i += SHARDS) {
    const { p, group, key } = profileFor(i)
    const row: Row = { i, group, breaches: {}, applies: [], summary: describe(p) }
    try {
      console.log = () => {}; console.warn = () => {}
      setRandomSource(seededRngFromKey(key))
      const m = generateMesocycle(p)
      const pool = getConstrainedPool(p)
      console.log = quiet; console.warn = warn
      const ctx: Ctx = { poolPatterns: new Set(pool.map(e => e.movement_pattern)), poolNames: new Set(pool.map(e => e.name)) }
      for (const r of RULES) {
        if (!r.applies(p)) continue
        row.applies.push(r.id)
        const b = r.check(p, m, ctx)
        if (b.length) row.breaches[r.id] = b
      }
    } catch (e) {
      console.log = quiet; console.warn = warn
      row.crash = String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')
    }
    rows.push(row)
  }
  return rows
}

if (process.env.AUDIT_LIB) { /* imported for its profiles only */ } else if (process.env.AUDIT_SHARD != null) {
  const s = Number(process.env.AUDIT_SHARD)
  writeFileSync(`${OUT}/shard-${s}.json`, JSON.stringify(runShard(s)))
  process.exit(0)
}

// ---------------------------------------------------------------------------------------------------------------------
// THE DETECTORS ARE PROVEN BEFORE THEY ARE BELIEVED. A rule that reads 0% could be a plan that never breaks it or a
// detector that cannot fire, and both print the same zero. Each rule is handed a plan built to break it and must
// fire, or the audit stops.
// ---------------------------------------------------------------------------------------------------------------------
function selfTest(): string[] {
  const failures: string[] = []
  const ex = (name: string, o: Record<string, unknown> = {}) => ({ name, sets: 3, reps: '8-10', rest: '60s', ...o })
  const day = (d: string, exercises: unknown[], o: Record<string, unknown> = {}) => ({ day: d, focus: 'Full Body Strength', exercises, warmup: { general: [], mobility: [{ name: 'Pelvic Floor Exercises' }], ramp_ups: [] }, ...o })
  const good = [ex('Goblet Squats', { suggested_load_kg: 10 }), ex('Machine Hip Thrust', { suggested_load_kg: 30 }), ex('Chest Press Machine', { suggested_load_kg: 20 }), ex('Lat Pulldown', { suggested_load_kg: 25 }), ex('Side Plank', { reps: '30-45s' }), ex('Bird Dog', { reps: '10-12' })]
  const week = (n: number, days: unknown[], o: Record<string, unknown> = {}) => ({ week_number: n, block_number: 1, is_deload: false, days, ...o })
  const plan = (days: unknown[], o: Record<string, unknown> = {}) => [week(1, days, o)] as unknown as MesocycleWeek[]
  const base = { age: 35, gender: 'female', training_experience: 'intermediate', injuries: [], health_conditions: [], session_duration_preference: '45-60', fitness_goal: 'hypertrophy', training_days: [{ day: 'Monday', available: true }], recovery_capacity: 'moderate' } as unknown as UserProfile
  const ctx: Ctx = { poolPatterns: new Set(['knee_dominant', 'hip_hinge', 'horizontal_push', 'vertical_pull', 'horizontal_pull', 'core']), poolNames: new Set(['Goblet Squats', 'Machine Hip Thrust', 'Chest Press Machine', 'Lat Pulldown', 'Bird Dog', 'Leg Press', 'Banded Terminal Knee Extension']) }
  const cases: [string, UserProfile, MesocycleWeek[]][] = [
    ['S1', { ...base, injuries: ['lower_back'] }, plan([day('Monday', [...good, ex('Barbell Squats', { suggested_load_kg: 60 })])])],
    ['S2', { ...base, health_conditions: ['pregnancy'] }, plan([day('Monday', [...good, ex('Box Jumps')])])],
    ['S3', { ...base, health_conditions: ['pregnancy'] }, plan([day('Monday', [...good, ex('Leg Press', { reps: '4-6', suggested_load_kg: 60 })])])],
    ['S4', { ...base, health_conditions: ['pregnancy'], due_date: weekDate(base, 4) } as UserProfile, plan([day('Monday', [...good, ex('Walking Lunges')])])],
    ['S5', { ...base, health_conditions: ['pregnancy'] }, plan([day('Monday', good, { warmup: { general: [], mobility: [], ramp_ups: [] } })])],
    ['S6', { ...base, age: 70, training_experience: 'beginner' }, plan([day('Monday', [...good, ex('Barbell Squats', { suggested_load_kg: 20 })])])],
    ['S7', { ...base, age: 70 }, plan([day('Monday', [...good, ex('Box Jumps')])])],
    ['S8', { ...base, health_conditions: ['high_blood_pressure'] }, plan([day('Monday', [...good, ex('Leg Press', { intensity: 'RPE 8-9', suggested_load_kg: 60 })])])],
    ['S9', { ...base, training_experience: 'beginner' }, plan([day('Monday', [...good, ...['Leg Press', 'Seated Cable Row', 'Shoulder Press Machine', 'Leg Curl Machine'].map(n => ex(n, { sets: 4, suggested_load_kg: 20 }))])])],
    ['C1', base, plan([day('Monday', good.filter(e => e.name !== 'Machine Hip Thrust'))])],
    ['C2', base, plan([day('Monday', good.filter(e => !['Side Plank', 'Bird Dog'].includes(e.name)))])],
    ['C3', base, plan([day('Monday', [...good, ex('Deadlifts', { suggested_load_kg: 80 })]), day('Thursday', [...good, ex('Sumo Deadlift', { suggested_load_kg: 80 })])])],
    ['C4', base, plan([day('Monday', [...good, ex('Leg Press', { reps: '20-25', suggested_load_kg: 60 })])])],
    ['C5', base, plan([day('Monday', [...good, ex('Goblet Squats', { suggested_load_kg: 10 })])])],
    ['C6', base, [week(1, [day('Monday', good)]), week(2, [day('Monday', good.map(e => ({ ...e, suggested_load_kg: (Number(e.suggested_load_kg) || 0) + 5 })))], { is_deload: true })] as unknown as MesocycleWeek[]],
    ['C7', base, [week(1, [day('Monday', good)]), week(2, [day('Monday', good.map(e => ({ ...e, suggested_load_kg: (Number(e.suggested_load_kg) || 0) * 2 })))])] as unknown as MesocycleWeek[]],
    ['C8a', { ...base, session_duration_preference: '60-90' } as UserProfile, plan([day('Monday', good.slice(0, 2))])],
    ['C8b', { ...base, session_duration_preference: '20-30' } as UserProfile, plan([day('Monday', [...good, ...good.map(e => ({ ...e, name: e.name === 'Goblet Squats' ? 'Leg Press' : e.name === 'Machine Hip Thrust' ? 'Hip Thrust' : e.name === 'Chest Press Machine' ? 'Pec Deck' : e.name === 'Lat Pulldown' ? 'Seated Cable Row' : e.name + ' ', sets: 5 }))])])],
    ['C9', { ...base, training_days: [{ day: 'Monday', available: true }, { day: 'Friday', available: true }] } as UserProfile, plan([day('Monday', good)])],
    ['C10', { ...base, fitness_goal: 'fat_loss' } as UserProfile, plan([day('Monday', good)])],
    ['C11', { ...base, age: 70, training_experience: 'beginner' } as UserProfile, plan([day('Monday', good)])],
    ['C12', base, plan([day('Monday', [...good, ex('Leg Press')])])],
    ['C13', base, plan([day('Monday', [...good.filter(e => e.name !== 'Goblet Squats'), ex('Romanian Deadlifts', { sets: 6, suggested_load_kg: 50 }), ex('Goblet Squats', { sets: 1, suggested_load_kg: 10 })])])],
    ['C14', base, Array.from({ length: 12 }, (_, k) => week(k + 1, [day('Monday', [...good, ex('Low Box Step-Up')])], { phase_label: 'Hypertrophy' })) as unknown as MesocycleWeek[]],
    ['C15', base, plan([day('Monday', good.map(e => ({ ...e, sets: 5 }))), day('Wednesday', good.map(e => ({ ...e, sets: 2 })))])],
    ['C16', { ...base, injuries: ['knees'] } as UserProfile, plan([day('Monday', good)])],
    ['C17', { ...base, training_days: ['Monday', 'Wednesday', 'Friday'].map(d => ({ day: d, available: true })) } as UserProfile, plan([day('Monday', good.map(e => e.name === 'Chest Press Machine' ? { ...e, sets: 2 } : e))])],
    ['C18', base, plan([day('Monday', [...good, ex('Shoulder Press Machine', { sets: 4, suggested_load_kg: 20 }), ex('Pec Deck', { sets: 4 })])])],
    ['C19', base, plan([day('Monday', [...good, ex('Barbell Squats', { rest: '45s', suggested_load_kg: 60 })])], { phase_label: 'Hypertrophy' })],
    ['C20', base, plan([day('Monday', good, { warmup: { general: [], mobility: [], ramp_ups: [] } })])],
    ['C21', base, plan([day('Monday', [...good, ex('Barbell Curls'), ex('Hammer Curls')])])],
  ]
  for (const r of RULES) {
    const c = cases.find(x => x[0] === r.id)
    if (!c) { failures.push(`${r.id}: no self-test case`); continue }
    if (!r.applies(c[1])) { failures.push(`${r.id}: the case is not one the rule applies to`); continue }
    if (r.check(c[1], c[2], ctx).length === 0) failures.push(`${r.id}: did not fire on a plan built to break it`)
  }
  // ...and a clean plan breaks none of the safety rules (the detectors do not fire on everything).
  const clean = plan([day('Monday', good)])
  for (const r of RULES.filter(x => x.kind === 'safety')) for (const c of cases.filter(x => x[0] === r.id)) if (r.applies(c[1]) && r.check(c[1], clean, ctx).length) failures.push(`${r.id}: fired on a clean plan`)
  return failures
}

// ---------------------------------------------------------------------------------------------------------------------
// The driver: shards in parallel, then the report
// ---------------------------------------------------------------------------------------------------------------------
if (!process.env.AUDIT_LIB) {
const st = selfTest()
if (st.length) { console.error('DETECTOR SELF-TEST FAILED:\n  ' + st.join('\n  ')); process.exit(1) }
console.log(`Detector self-test: all ${RULES.length} rules fire on a plan built to break them.`)
mkdirSync(OUT, { recursive: true })
const t0 = Date.now()
await Promise.all(Array.from({ length: SHARDS }, (_, s) => new Promise<void>((res, rej) => {
  const c = spawn('npx', ['tsx', 'scripts/audit-personas.ts'], { env: { ...process.env, AUDIT_SHARD: String(s) }, stdio: ['ignore', 'ignore', 'inherit'] })
  c.on('exit', code => code === 0 ? res() : rej(new Error(`shard ${s} exited ${code}`)))
})))
const rows: Row[] = Array.from({ length: SHARDS }, (_, s) => JSON.parse(readFileSync(`${OUT}/shard-${s}.json`, 'utf8')) as Row[]).flat().sort((a, b) => a.i - b.i)
void spawnSync
const lines: string[] = []
const say = (s = '') => { lines.push(s); console.log(s) }
say(`# Persona audit — ${rows.length} plans, ${GROUPS.length} groups, ${RULES.length} rules (${((Date.now() - t0) / 60000).toFixed(1)} min)`)
const crashes = rows.filter(r => r.crash)
say(`\nPlans that failed to generate: ${crashes.length}${crashes.length ? ` (e.g. #${crashes[0].i} ${crashes[0].summary}: ${crashes[0].crash})` : ''}`)
say('\n## Rules, worst first\n')
say('| Rule | Kind | Plans it applies to | Plans breaking it | Rate |')
say('|---|---|---|---|---|')
const stats = RULES.map(r => { const ap = rows.filter(x => x.applies.includes(r.id)); const br = ap.filter(x => x.breaches[r.id]); return { r, ap: ap.length, br } })
  .sort((a, b) => (b.br.length / Math.max(1, b.ap)) - (a.br.length / Math.max(1, a.ap)))
for (const s of stats) say(`| ${s.r.id} ${s.r.text} | ${s.r.kind} | ${s.ap} | ${s.br.length} | ${(100 * s.br.length / Math.max(1, s.ap)).toFixed(1)}% |`)
say('\n## Where each breach falls (group: plans breaking / plans in group)\n')
for (const s of stats.filter(x => x.br.length)) {
  const byGroup = new Map<string, number>()
  for (const x of s.br) byGroup.set(x.group, (byGroup.get(x.group) ?? 0) + 1)
  const inGroup = (g: string) => rows.filter(x => x.group === g && x.applies.includes(s.r.id)).length
  say(`### ${s.r.id} — ${s.r.text}`)
  say([...byGroup.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}: ${n}/${inGroup(g)}`).join(' · '))
  const what = new Map<string, number>()
  for (const x of s.br) for (const b of x.breaches[s.r.id]) { const k = b.replace(/^w\d+ /, '').replace(/^(\w+day) \d+ min$/, 'session (time)').replace(/\d+(\.\d+)?->\d+(\.\d+)?/, 'jump'); what.set(k, (what.get(k) ?? 0) + 1) }
  say(`Most common: ${[...what.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} (${n})`).join('; ')}`)
  for (const x of s.br.slice(0, 3)) say(`- #${x.i} ${x.summary}: ${x.breaches[s.r.id].join('; ')}`)
  say()
}
writeFileSync(`${OUT}/report.md`, lines.join('\n'))
console.log(`\nReport: ${OUT}/report.md`)

}
