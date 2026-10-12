/**
 * A REBUILD HONOURS WHAT SHE ASKED AND WHAT SHE HAS DONE — run 5 of the live-app test, 11 Oct 2026 (H28, H27).
 *
 * Mid-session on a Sunday she borrowed a session onto (a rest day on her plan), she asked the coach for
 * Mon/Wed/Fri/Sun "from next week". The rebuild started today, replaced the session in progress, handed back a lift
 * she had swapped out, reset a weight the plan had moved up to, and its card said none of it. Her rule, built here:
 * a rebuild honours the date asked for, never touches a day already trained or a session in progress, carries bans,
 * swaps, active temporary changes and logged weights through, and its card lists everything else it will change;
 * Undo says it undid. And H27: ending a temporary change early works by asking, and the generic "I couldn't find
 * that" is never the answer to a request the app understands.
 *
 *   1  the guard judges a day the plan never had by its DATE (today trained, a session running)
 *   2  the start she asked for ("next week", a date, today), and a refusal past the plan's end
 *   3  a rebuild leaves every row before that start exactly as it was
 *   4  a rebuild carries her swap and an earned weight through
 *   5  the card is read off the rebuild: start, days, what arrives, what leaves, weights
 *   6  the wiring: every coach rebuild runs the trial, the seed reaches confirm, kit changes are carried
 *   7  H27: the coach can end a temporary change; refusals in words; no silent success; Undo retitles
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { rebuildAgainstProfile, untrainedPlanContext, type PlanEditContext } from '../src/lib/plan-adaptations'
import { buildDayGuard, planDayDate, type PlanCalendar } from '../src/lib/plan-guard'
import { NO_ACTIVE_ADAPTATIONS } from '../src/lib/effective-constraints'
import { resolveRebuildStart, describeRebuild } from '../src/lib/rebuild-card'
import { getReplacementCandidates, swapExerciseInMesocycle } from '../src/lib/mesocycle-edit'
import { RECEIPTS_UNDONE } from '../src/lib/coach-voice'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let checks = 0
function check(label: string, condition: boolean, extra?: unknown) {
  checks++
  if (condition) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const quiet = console.log
const loud = console.warn
async function silently<T>(fn: () => T | Promise<T>): Promise<T> { console.log = () => {}; console.warn = () => {}; try { return await fn() } finally { console.log = quiet; console.warn = loud } }
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const sam = {
  id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', fitness_goal: 'fat_loss',
  preferred_time: 'evening', bmr: 1800, tdee: 2500, equipment_access: 'minimalist', injuries: [],
  training_style: 'bodybuilding', training_experience: 'intermediate', session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation', max_dumbbell_kg: 24,
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile
const newDays = { ...sam, training_days: sam.training_days!.map(d => ({ ...d, available: ['Monday', 'Wednesday', 'Friday', 'Sunday'].includes(d.day) })) } as UserProfile

async function main() {
  setRandomSource(seededRngFromKey('run5:sam'))
  const plan: MesocycleWeek[] = await silently(() => generateMesocycle(sam))
  resetRandomSource()
  // The plan began on Monday 5 Oct 2026; run 5 was Sunday 11 Oct, the last day of week 1.
  const CREATED = new Date(2026, 9, 5, 0, 0, 0).toISOString()
  const SUN = '2026-10-11'
  const cal = (today: string): PlanCalendar => ({ planCreatedAt: CREATED, today, moves: [] })
  const ctx = (today: string, logged: string[] = [], extra: Partial<PlanEditContext> = {}): PlanEditContext => ({
    isProtected: buildDayGuard(plan, { ...cal(today), loggedDates: logged, closedDates: [] }),
    constraints: NO_ACTIVE_ADAPTATIONS, calendar: cal(today), constrainedUntil: null, ...extra,
  })
  const hasDay = (w: number, d: string) => !!plan.find(x => x.week_number === w)?.days.some(x => x.day === d)

  console.log('\n1. A day the plan never had is judged by its date')
  {
    check('the fixture: week 1 has no Sunday session (she borrowed one onto it)', !hasDay(1, 'Sunday'), plan[0].days.map(d => d.day))
    check('planDayDate: week 1 Sunday is 11 Oct, week 2 Monday 12 Oct', planDayDate(CREATED, 1, 'Sunday') === SUN && planDayDate(CREATED, 2, 'Monday') === '2026-10-12')
    const plan2 = { ...ctx('2026-10-08') }
    check('a plan begun midweek counts its week from that day, not Monday', planDayDate(new Date(2026, 9, 8, 9, 0, 0).toISOString(), 1, 'Monday') === '2026-10-12')
    void plan2
    check('TODAY, TRAINED (sets logged on a borrowed session): a new Sunday row may not be written', ctx(SUN, [SUN]).isProtected(1, 'Sunday') === true)
    check('...today with nothing logged is still open', ctx(SUN).isProtected(1, 'Sunday') === false)
    check('...a day before today is history', ctx(SUN).isProtected(1, 'Wednesday') === true)
    check('...and a day later in the plan is open', ctx(SUN).isProtected(2, 'Wednesday') === false)
    // A plan begun on a THURSDAY: its week 1 runs Thu 8 to Wed 14 Oct. On Sunday 11 Oct, a Wednesday the plan never
    // had (a day a rebuild adds) is three days AHEAD — it read as past when weekdays were compared Monday-first.
    const THU_START = new Date(2026, 9, 8, 9, 0, 0).toISOString()
    const noWednesday = plan.map(w => (w.week_number === 1 ? { ...w, days: w.days.filter(d => d.day !== 'Wednesday') } : w))
    const midweek = buildDayGuard(noWednesday, { planCreatedAt: THU_START, today: SUN, moves: [], loggedDates: [], closedDates: [] })
    check('in a plan begun midweek, a new day later in the live week is open', midweek(1, 'Wednesday') === false)
    // No start date to count from: the live week is judged by weekday, and today only once trained.
    const noStart = (logged: string[]) => buildDayGuard(plan, { planCreatedAt: undefined, today: SUN, moves: [], loggedDates: logged, closedDates: [] })
    check('with no start date, today is open until trained...', noStart([])(1, 'Sunday') === false)
    check('...and protected once it is', noStart([SUN])(1, 'Sunday') === true)
    const src = code('src/lib/plan-edit-context.ts')
    check('a session running today counts as today trained, sets or not', /getActiveSessionRecord\(profile\.id, today\)\?\.status === 'running'\) logged\.add\(today\)/.test(src))
  }

  console.log('\n2. When it starts')
  {
    const at = { liveWeek: 1, today: SUN, planCreatedAt: CREATED, totalWeeks: plan.length }
    const next = resolveRebuildStart('next_week', at)
    check('"next week" starts the next PLAN week, on its first date', !('refusal' in next) && next.fromWeek === 2 && next.fromDate === '2026-10-12', next)
    check('...and says the date in words', !('refusal' in next) && /Mon 12 Oct/.test(next.said), next)
    const none = resolveRebuildStart(undefined, at)
    check('nothing said is from today', !('refusal' in none) && none.fromWeek === 1 && none.fromDate === SUN && none.said === 'from today', none)
    const named = resolveRebuildStart('2026-10-21', at)
    check('a named date starts there, in its own plan week', !('refusal' in named) && named.fromDate === '2026-10-21' && named.fromWeek === 3, named)
    const past = resolveRebuildStart('2026-10-01', at)
    check('a date already past is today, never yesterday', !('refusal' in past) && past.fromDate === SUN, past)
    const last = resolveRebuildStart('next_week', { ...at, liveWeek: plan.length })
    check('"next week" in the last week is refused, not quietly made today', 'refusal' in last, last)
  }

  console.log('\n3. Nothing before the start is touched')
  const nextWeekCtx = { ...ctx(SUN, [SUN]), fromDate: '2026-10-12' }
  const rebuilt = await silently(() => rebuildAgainstProfile(newDays, [], plan, plan.map(w => w.week_number), nextWeekCtx, 'gate:run5'))
  {
    check('week 1 is exactly as it was (every row before 12 Oct)', rebuilt[0] === plan[0] || JSON.stringify(rebuilt[0].days) === JSON.stringify(plan[0].days))
    check('...and no session appears on today, the borrowed Sunday', !rebuilt[0].days.some(d => d.day === 'Sunday'))
    check('week 2 does take the new days', ['Monday', 'Wednesday', 'Friday', 'Sunday'].every(d => rebuilt[1].days.some(x => x.day === d && x.exercises.length > 0)), rebuilt[1].days.map(d => d.day))
    // ON A WEDNESDAY, nothing trained yet that week's rest: "from next week" must leave Thursday and Saturday as
    // they are, though nothing protects them but the date she asked for.
    const WED = '2026-10-07'
    const asked = await silently(() => rebuildAgainstProfile(newDays, [], plan, plan.map(w => w.week_number), { ...ctx(WED), fromDate: '2026-10-12' }, 'gate:run5'))
    check('on a Wednesday, "from next week" leaves this week\'s untrained Thursday and Saturday as they were', JSON.stringify(asked[0].days) === JSON.stringify(plan[0].days))
    const notAsked = await silently(() => rebuildAgainstProfile(newDays, [], plan, plan.map(w => w.week_number), ctx(WED), 'gate:run5'))
    check('...the contrast: from today they do change (the date is what held them)', JSON.stringify(notAsked[0].days) !== JSON.stringify(plan[0].days))
    const fromToday = await silently(() => rebuildAgainstProfile(newDays, [], plan, plan.map(w => w.week_number), ctx(SUN, [SUN]), 'gate:run5'))
    check('the contrast: from today with today trained, still no Sunday session written over hers', !fromToday[0].days.some(d => d.day === 'Sunday' && !hasDay(1, 'Sunday')))
    const fromTodayOpen = await silently(() => rebuildAgainstProfile(newDays, [], plan, plan.map(w => w.week_number), ctx(SUN), 'gate:run5'))
    check('...and with today untouched it is written (the guard is not just refusing everything)', fromTodayOpen[0].days.some(d => d.day === 'Sunday'))
  }

  console.log('\n4. Her swap and her weights come through')
  {
    // A swap made for the rest of the block, on week 2's first lift that has candidates.
    const week2 = plan[1]
    let target: { day: string; idx: number; from: string; to: string } | null = null
    for (const day of week2.days) {
      for (let i = 0; i < day.exercises.length && !target; i++) {
        const ex = day.exercises[i]
        if (ex.suggested_load_kg == null) continue
        const c = getReplacementCandidates(ex.name, sam, []).find(x => !day.exercises.some(e => e.name === x.exercise.name))
        if (c) target = { day: day.day, idx: i, from: ex.name, to: c.exercise.name }
      }
      if (target) break
    }
    check('the fixture has a loaded lift with a swap candidate', !!target, target)
    const swapped = target ? await silently(() => swapExerciseInMesocycle({ mesocycle: plan, profile: sam, currentWeekNumber: 2, dayName: target!.day, exIndex: target!.idx, newExercise: getReplacementCandidates(target!.from, sam, []).find(x => x.exercise.name === target!.to)!.exercise, scope: 'permanent' })) : plan
    const stamped = swapped[1].days.find(d => d.day === target?.day)?.exercises[target?.idx ?? 0]
    check('a swap records what it replaced on the row', stamped?.swapped_for === target?.from, stamped && { name: stamped.name, swapped_for: stamped.swapped_for })
    // Rebuild the same days (only the swap and loads are in question), from week 2.
    const again = await silently(() => rebuildAgainstProfile(sam, [], swapped, [2, 3, 4], { ...untrainedPlanContext(cal(SUN)), fromDate: '2026-10-12' }, 'gate:swap'))
    const names2 = again[1].days.flatMap(d => d.exercises.map(e => e.name))
    check('after the rebuild her choice is in the plan and the lift she swapped away is not', !!target && names2.includes(target.to) && !names2.includes(target.from), { names2 })
    // An earned weight: raise one loaded lift in week 3, rebuild, and it keeps at least that much at the same reps.
    const w3 = swapped[2]
    // A dumbbell lift well under her 24 kg limit, so the earned weight is one the kit can carry (a bag's strap limit
    // would clamp it, rightly, and the check would be measuring the clamp).
    const lifted = w3.days.flatMap(d => d.exercises.map((e, i) => ({ d: d.day, i, e }))).find(x => /Dumbbell/.test(x.e.name) && x.e.suggested_load_kg != null && x.e.suggested_load_kg >= 6 && x.e.suggested_load_kg <= 16 && !x.e.swapped_for)
    const earnedKg = lifted ? lifted.e.suggested_load_kg! + 4 : 0
    const earned = lifted ? swapped.map(w => w.week_number !== 3 ? w : { ...w, days: w.days.map(d => d.day !== lifted.d ? d : { ...d, exercises: d.exercises.map((e, i) => i === lifted.i ? { ...e, suggested_load_kg: earnedKg, suggested_load: `${earnedKg}kg` } : e) }) }) : swapped
    const kept = await silently(() => rebuildAgainstProfile(sam, [], earned, [3], { ...untrainedPlanContext(cal(SUN)), fromDate: '2026-10-19' }, 'gate:load'))
    const after = kept[2].days.flatMap(d => d.exercises).find(e => e.name === lifted?.e.name && e.reps === lifted?.e.reps)
    check('a weight the plan had moved up to is kept at the same reps (never back to the estimate)', !!lifted && !!after && (after.suggested_load_kg ?? 0) >= earnedKg - 2.5, { lift: lifted?.e.name, earnedKg, after: after?.suggested_load_kg })
    const plainKg = (await silently(() => rebuildAgainstProfile(sam, [], swapped, [3], { ...untrainedPlanContext(cal(SUN)), fromDate: '2026-10-19' }, 'gate:load')))[2].days.flatMap(d => d.exercises).find(e => e.name === lifted?.e.name)?.suggested_load_kg
    check('...the contrast: without the earned weight the rebuild prints less', plainKg != null && plainKg < earnedKg, { plainKg, earnedKg })
  }

  console.log('\n5. The card is read off the rebuild')
  {
    const start = resolveRebuildStart('next_week', { liveWeek: 1, today: SUN, planCreatedAt: CREATED, totalWeeks: plan.length })
    const lines = 'refusal' in start ? [] : describeRebuild(plan, rebuilt, { start, planCreatedAt: CREATED })
    check('it starts with the date asked for, in words', /^Starts from Mon 12 Oct, when your next training week starts/.test(lines[0] ?? ''), lines[0])
    check('...says which weeks it changes', /changes weeks 2 to \d+/.test(lines[0] ?? ''), lines[0])
    check('...and lists the first changed week day by day, with what each day was', lines.some(l => /^Week 2: .*Wed 14 Oct: .+ \(was rest\)/.test(l)), lines)
    const names = (w: MesocycleWeek[], from: number) => new Set(w.filter(x => x.week_number >= from).flatMap(x => x.days.flatMap(d => d.exercises.map(e => e.name))))
    const arrived = [...names(rebuilt, 2)].filter(n => !names(plan, 2).has(n))
    const left = [...names(plan, 2)].filter(n => !names(rebuilt, 2).has(n))
    check('...names what comes INTO the plan (the fixture has some)', arrived.length > 0 && lines.some(l => l.startsWith('New in your plan: ') && l.includes(arrived[0])), { arrived: arrived.slice(0, 3), lines })
    check('...and what LEAVES it', left.length > 0 && lines.some(l => l.startsWith('Leaves your plan: ') && l.includes(left[0])), { left: left.slice(0, 3), lines })
    check('a rebuild that changes nothing has no card lines (the caller refuses then)', describeRebuild(plan, plan, { start: start as never, planCreatedAt: CREATED }).length === 0)
  }

  console.log('\n6. Every coach rebuild runs the trial, and confirm runs the same plan')
  {
    const chat = code('src/components/ChatAssistant.tsx')
    const kinds = /const REBUILD_CARD_KINDS = new Set\(\[([^\]]+)\]\)/.exec(chat)?.[1] ?? ''
    check('the five rebuild tools are finished by the trial', ['propose_schedule_change', 'propose_session_length', 'propose_style_change', 'propose_goal_change', 'propose_concurrent_activity'].every(k => kinds.includes(`'${k}'`)), kinds)
    check('...the dispatcher calls it before a card is made', /REBUILD_CARD_KINDS\.has\(result\.proposal\.kind\)\)[\s\S]{0,200}await finishRebuildCard\(/.test(chat))
    check('...the trial is the confirm path itself, seeded', /rebuildFromCurrentWeek\(after, exerciseExclusions, mesocycle, start\.fromWeek, context, \{ fromDate: start\.fromDate, seedKey \}\)/.test(chat))
    check('...and the seed and start reach the payload confirm reads', /payload: \{ \.\.\.p, fromWeek: start\.fromWeek, fromDate: start\.fromDate, seedKey \}/.test(chat))
    const exec = code('src/lib/pending-action-executor.ts')
    const runs = (exec.match(/rebuildFromCurrentWeek\(updated, exclusions, mesocycle, payload\.fromWeek, context, \{ fromDate: payload\.fromDate, seedKey: payload\.seedKey \}\)/g) ?? []).length
    check('every rebuild executor passes the start and the seed (6)', runs === 6, runs)
    const adapt = code('src/lib/plan-adaptations.ts')
    // Read inside the rebuild only: a TRAVEL substitution replaces the running travel kit on purpose, and the
    // kit list's own substitution sits beside it in the same file (11 Oct 2026, the kit-list merge).
    const rebuildBody = /export (?:async )?function rebuildAgainstProfile[\s\S]*?\n}\n/.exec(adapt)?.[0] ?? ''
    check('a temporary KIT change is carried through a rebuild, not dropped', rebuildBody.length > 0 && /constraintProfile\(clone, context\.constraints\)/.test(rebuildBody) && !/temporaryEquipment: null/.test(rebuildBody), rebuildBody.length)
    check('...for as long as any temporary change runs', /const injuryEnds = live\.map\(/.test(code('src/lib/plan-edit-context.ts')))
    check('the Profile rebuild offer lists the changes too, from the same seeded trial', /describeRebuild\(mesocycle, trial\.mesocycle/.test(code('src/App.tsx')) && /seedKey: rebuildPreview\?\.seedKey/.test(code('src/App.tsx')))
    const fn = code('supabase/functions/chat-gemini/index.ts')
    const withStarts = ['propose_schedule_change', 'propose_session_length', 'propose_style_change', 'propose_goal_change', 'propose_concurrent_activity']
      .filter(t => { const i = fn.indexOf(`name: "${t}"`); return i >= 0 && /starts: \{/.test(fn.slice(i, i + 4000)) })
    check('the coach can say when: all five tools take `starts`', withStarts.length === 5, withStarts)
    check('...and the function forwards it on all five', (fn.match(/starts: args\.starts/g) ?? []).length === 5)
    check('...and no longer claims "Weeks already underway or finished are never rewritten"', !/Weeks already underway or finished are never rewritten/.test(fn))
  }

  console.log('\n7. H27: ending a temporary change early, and refusals in words')
  {
    const chat = code('src/components/ChatAssistant.tsx')
    const at = chat.indexOf('const buildInjuryRecoveredProposal')
    const body = at >= 0 ? chat.slice(at, chat.indexOf('const buildEquipmentAdaptationProposal', at)) : ''
    check('the recovered builder never returns a bare null (every way out says why)', body.length > 500 && !/return null/.test(body))
    check('...with one temporary change running and no area named, it ends that one', /runningInjuries\.length === 1\)[\s\S]{0,80}injuryCode = runningInjuries\[0\]\.injury_code/.test(body))
    check('...and an area on the list AND being eased off ends both', /alsoEndAdaptationId: running\.id/.test(body) && /payload\.alsoEndAdaptationId[\s\S]{0,200}onEndAdaptation\(payload\.alsoEndAdaptationId\)/.test(chat))
    check('the temporary and lasting injury branches give their own reason', /else refusal = injuryAdaptationRefusal\(/.test(chat) && /That's already on your injuries list, so every plan already works around/.test(chat))
    check('the generic line is kept only for a proposal the client does not know', (chat.match(/I couldn't find that on your current plan/g) ?? []).length === 1 && /return \{ text: refusal \?\? UNKNOWN_PROPOSAL_REFUSAL/.test(chat))
    const app = code('src/App.tsx')
    const end = app.slice(app.indexOf('const handleEndAdaptation'), app.indexOf('const handleEndAdaptation') + 600)
    check('ending never reports success when it could not run', !/return null\s*\n\s*setEndingAdaptationId/.test(end) && /if \(endingAdaptationId\) return '/.test(end))
    const fn = code('supabase/functions/chat-gemini/index.ts')
    check('the coach is told its tool ends a temporary change early', /'end the two-week knee adjustment early'\) is ENDED TODAY/.test(fn) && /Never answer "I couldn't find that" for this/.test(fn))
    check('an undone card says so, not the old title', /title: RECEIPTS_UNDONE\.title, rows: \[\{ label: RECEIPTS_UNDONE\.label, detail: RECEIPTS_UNDONE\.detail\(m\.receipt\.title\) \}\]/.test(chat) && RECEIPTS_UNDONE.detail('Rescheduled') === 'Rescheduled was taken back. Everything is as it was before.')
  }

  console.log(`\n${checks} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('All passed.')
}

main().catch(err => { console.error('Crashed:', err); process.exit(1) })
