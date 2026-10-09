/**
 * The training week, phrased for the coach.
 *
 * ROOT INCIDENT. Ashley told the coach she had trained, and it replied "I
 * don't actually have your past weights on hand to look up what was
 * prescribed" — while the Exercise tab, one tap away, was showing "Deadlifts
 * 72.5 kg SUGGESTED, S1/S2/S3 all 72.5kg". The coach was telling the truth.
 * The client's plan summary carried the day, the focus, the exercise name,
 * sets, reps and rest, and no load at all. The app was withholding a number
 * it had, and then apologising for not having it.
 *
 * It lived inline in ChatAssistant.buildContext, which is why nothing caught
 * it: a template literal inside a component is not something a gate can call.
 * It is a function here so `test:log-correction` can run it on a real week and
 * assert the weight comes out — the behavioural half, not a regex over source.
 *
 * Three rules this file exists to hold:
 *
 *   1. Send the FORMATTED load (`suggested_load`), never the bare
 *      `suggested_load_kg`. "~14kg per hand" and "14kg" are different
 *      prescriptions, and roughly half of every plan is per-hand work.
 *   2. Send the per-set breakdown when the sets are not all the same weight.
 *      A ramp is 60/65/72.5; a trainee who says "I used the prescribed
 *      weights" must not have 72.5x3 logged for them. That is the same
 *      invented-number defect as filling reps from the prescription.
 *   3. Send added load for weighted bodyweight work, where the whole
 *      prescription is the "+17.5kg" and `suggested_load` reads "Bodyweight".
 */
import type { Exercise, ExerciseSetLog, WorkoutDay } from './types'
import { filterLoggableSets, isDropRow } from './session-derive'
import { buildCoachTechniqueSummary } from './exercise-technique'
import { sessionForDate, dayNameOf, addDays, type SessionMove } from './session-move'
import { describeExerciseTempo } from './periodization'
import { ceilingNoteForCoach } from './progression-ceiling'

/** True when the per-set loads are not all the same — a ramp, not a straight-across weight. */
function isRamped(perSet: Exercise['per_set_load']): boolean {
  if (!perSet || perSet.length < 2) return false
  return perSet.some(s => s.load_kg !== perSet[0].load_kg)
}

/**
 * The strings the generator puts in `suggested_load` that are NOT weights.
 * `Light` is what every primer gets; `Choose by feel` is what an uncategorised
 * lift gets. Sent bare they read as prescribed loads — the prompt teaches the
 * "@" clause as THE prescribed weight — so they are labelled at source instead.
 */
const NOT_A_WEIGHT: Record<string, string> = {
  Light: 'Light — a primer, no prescribed weight',
  'Choose by feel': 'no prescribed weight, pick by feel',
  Bodyweight: 'Bodyweight',
}

/**
 * The load clause for one exercise, or '' when the movement genuinely carries
 * no prescribed load at all. '' means "there is no number" — it must never mean
 * "there is a number and we didn't send it", which is the defect this whole
 * file exists to close and which it reopened once already: an assisted pull-up
 * with 35kg of machine assistance was reaching the coach as " @ Bodyweight",
 * a phrase the prompt teaches it to read as NO EXTERNAL LOAD. Worse than
 * silence — a confident statement of the opposite.
 */
export function loadClauseForCoach(e: Exercise): string {
  const parts: string[] = []

  if (e.suggested_load) parts.push(NOT_A_WEIGHT[e.suggested_load] ?? e.suggested_load)

  // Assistance INVERTS the usual reading: less machine help is more real
  // strength. AssistanceChip says "less over time = stronger" beside it on the
  // Exercise tab; the coach is told the same thing so the two surfaces cannot
  // congratulate a trainee for the opposite of what happened.
  if (e.suggested_assistance_kg != null) {
    parts.push(e.assistance_ready_to_graduate
      ? 'machine assistance now 0kg — full bodyweight range, ready to try it unassisted'
      : `machine taking ${e.suggested_assistance_kg}kg (LESS assistance over time = stronger)`)
  }

  if (e.suggested_added_load_kg != null) parts.push(`+${e.suggested_added_load_kg}kg added`)

  if (parts.length === 0) return ''

  let clause = parts.join(', ')

  if (isRamped(e.per_set_load)) {
    const perSet = (e.per_set_load ?? []).map(s => s.display).join(', ')
    clause += ` top set (set by set: ${perSet})`
  }

  // The honesty hedge the Exercise tab already shows. LoadChip labels an
  // assumed_body load "starting light" and explains "it starts low on purpose
  // rather than guessing" — a guarantee built deliberately
  // (PLAN-honest-loads-without-a-body.md). Stripping it here would have the
  // coach read a deliberately conservative floor back as a firm prescription
  // and take a one-word yes, undoing in chat what the UI was fixed not to do.
  if (e.load_source === 'assumed_body') clause += ' [STARTING LIGHT — no body details, deliberately low, not a target]'

  return ` @ ${clause}`
}

/**
 * One exercise as the coach reads it. Tempo and intensity are here because for
 * a rep-based lift with no weight to add, the tempo IS the prescription — and
 * those are exactly the movements whose load clause is the uninformative
 * "Bodyweight". Both are rendered on the Exercise tab; withholding them left
 * the coach unable to answer "how hard should the push-ups be?" about a number
 * on the next screen.
 */
export function describeExerciseForCoach(e: Exercise): string {
  const tempo = describeExerciseTempo(e)
  return `${e.name} (${e.sets}x${e.reps}${loadClauseForCoach(e)}, rest ${e.rest}`
    + (e.intensity ? `, ${e.intensity}` : '')
    + (tempo ? `, tempo ${tempo}` : '')
    + ')'
    + (e.selection_note ? ` [why: ${e.selection_note}]` : '')
    + (e.block_hold_note ? ` [note: ${e.block_hold_note}]` : '')
    // THE COACH GETS THE SAME FACT THE CARD NOW SHOWS. Ashley's ruling,
    // 5 Sep 2026. An identical week reached the coach with nothing attached to
    // say it was identical, so it described a stalled lift as progression —
    // and the trainee reading that had no way to know the app had simply run
    // out of levers. Attached per exercise rather than as a week-level line
    // because it is true of one lift, not the session.
    + (ceilingNoteForCoach(e) ? ` [ceiling: ${ceilingNoteForCoach(e)}]` : '')
}

/**
 * A day with no gym session. Its whole prescription lives in fields the
 * exercise list does not carry, and sending `${day}: ${focus} - ` with nothing
 * after the separator read as an empty day the coach could say nothing about.
 */
function describeNonLiftingDay(d: WorkoutDay): string {
  const bits: string[] = []
  const activity = d.plannedActivity
  if (activity) {
    bits.push(`${activity.activity}, ${activity.duration} min`
      + (activity.targetRpe != null ? ` at RPE ${activity.targetRpe}/10` : '')
      + (activity.reason ? ` — ${activity.reason}` : ''))
  }
  const cardio = d.recommendedCardio
  if (cardio) {
    bits.push(`${cardio.activity}, ${cardio.duration} min at RPE ${cardio.targetRpe}/10 (${cardio.timing.replace(/_/g, ' ')})`
      + (cardio.reason ? ` — ${cardio.reason}` : ''))
  }
  const mobility = d.mobilityFiller
  if (mobility) {
    bits.push(`then optionally ${mobility.activity}, ${mobility.duration} min at RPE ${mobility.targetRpe}/10`
      + (mobility.reason ? ` — ${mobility.reason}` : ''))
  }
  if (d.conditioning_note) bits.push(d.conditioning_note)
  return bits.length > 0 ? bits.join(' | ') : 'no session prescribed'
}

/**
 * WHICH DAY IT IS, AND WHAT THAT MEANS — resolved here rather than left to the
 * model.
 *
 * Ashley, 7 Sep 2026, screenshot at 6:33 PM on a Monday. The coach said "let
 * me know how today's bench and shoulder press go" (that session is Tuesday's),
 * then, asked directly, said "today is Monday, so you've got Full Body Power"
 * and in the same breath "are you planning to head in for that session this
 * morning?" — of a session already finished, at half past six in the evening.
 *
 * THE CAUSE IS A JOIN NOBODY DID. The week reached the coach as seven
 * unmarked rows, and the prompt asked the model to work it out:
 * "Today is Monday. Cross-reference this with the user's exercise plan below."
 * The app knows the answer exactly — which day, which session, whether it is
 * logged, when the next one is — and was making the model re-derive it from a
 * list every turn. A model that gets that join right nine times in ten still
 * gets it wrong in front of the person whose training it is.
 *
 * So the facts are stated, and nothing is left to cross-reference. Facts only:
 * this is context, not instructions, and it must not start telling the coach
 * what to say.
 */
export interface CoachToday {
  /** Today's day name, from the app clock — the same one every write is stamped with. */
  dayName: string
  /** Local hour 0-23, for morning/afternoon/evening. */
  hour: number
  /** "6:33 PM", already formatted by the caller. */
  clock: string
  /** Today's row in the live week — its focus — or null when the week has no row for today at all. */
  focus: string | null
  /**
   * Whether today's row is a GYM session (it has exercises) as opposed to a
   * walk, a conditioning day or a note. Separate from `focus` because a
   * non-lifting day still has a name and a prescription, and calling it a rest
   * day here would contradict the tagged row for the same day two lines below.
   */
  isGymSession: boolean
  /** Sets logged today and planned for today — how "part-done" is known. */
  setsLogged: number
  setsPlanned: number
  /** True once the session has been closed out, not merely logged against. */
  finished: boolean
  /** The next scheduled session after today, when there is one within the week. */
  next: { dayName: string; focus: string; isTomorrow: boolean } | null
  /**
   * Set when today's prescribed session has been MOVED to another day, and
   * when today IS the day another day's session was moved onto.
   *
   * Stated rather than left to be inferred, for the reason this whole file
   * exists: without it a moved day reaches the model as `focus: null`, which
   * the header below reads as a rest day — the same false claim about her own
   * training that the plan-not-loaded case produced, from a different cause.
   */
  movedTo?: { dayName: string } | null
  movedFrom?: { dayName: string } | null
  /**
   * Today's session BY EXERCISE — logged working sets against planned, what
   * was added, the finisher, today's cardio. See CoachTodayWork. When present
   * the header's counts come from it, so "7 of 9" is like-for-like (working
   * sets on PLANNED exercises) and not "every row in the log against the plan".
   */
  work?: CoachTodayWork | null
}

// ---------------------------------------------------------------------------
// WHAT WAS ACTUALLY DONE TODAY, JOINED BY THE APP (H23, 9 Oct 2026).
//
// The tester finished a session at 7 of 9 sets with one exercise untouched and
// asked the coach what he had done. It listed the untouched exercise as done.
// It had been handed three things and no join between them: the PLAN row for
// today (every prescribed exercise, tagged TODAY), the 14-day LOG (one line a
// date), and a header written by the app that said "ALREADY DONE — finished
// and logged. There is nothing left to train today." `finished` was only "the
// session was closed", and `setsLogged` was every row in the log — warm-ups
// and added exercises included — against a plan count that had neither.
//
// The app knows the answer exactly, so it states it: each planned exercise
// with its logged working sets against its planned sets, anything logged that
// was not on the plan, the day's finisher, and the cardio logged today.
//
// "NOT LOGGED", never "skipped" (decided as a coach, basis in BACKLOG): the
// app knows it holds no record; it does not know the person did not do it,
// and the coach's own rule is that their memory outranks the list.
// ---------------------------------------------------------------------------
export interface CoachTodayExercise {
  name: string
  setsPlanned: number
  /** WORKING sets logged — no warm-up rows, no drops (filterLoggableSets, the same reader every tick on the Exercise tab uses). */
  setsLogged: number
  /** "20kg x 12, 20kg x 11" — '' when nothing is logged. */
  logged: string
}
export interface CoachTodayWork {
  exercises: CoachTodayExercise[]
  /** Logged today and not on today's plan. */
  added: { name: string; setsLogged: number; logged: string }[]
  /** The finisher the plan prescribes after today's lifting, in the plan's own words. Null when there is none. */
  finisher: string | null
  /** Cardio logged today, worded as the cardio history words it. Null when none is. */
  cardioLogged: string | null
}

function describeLoggedSet(l: ExerciseSetLog): string {
  const amount = l.unit === 'seconds' ? `${l.reps_completed}s` : l.unit === 'meters' ? `${l.reps_completed}m` : `${l.reps_completed}`
  return l.is_bodyweight || !(l.weight_kg > 0) ? `bodyweight x ${amount}` : `${l.weight_kg}kg x ${amount}`
}

/** A finisher as the coach reads it — the same fields describeNonLiftingDay prints for a cardio-only day. */
export function describeFinisherForCoach(d: Pick<WorkoutDay, 'recommendedCardio'>): string | null {
  const c = d.recommendedCardio
  if (!c) return null
  return `${c.activity}, ${c.duration} min at RPE ${c.targetRpe}/10`
}

/**
 * The join. `session` is the session RUN today (moves taken into account —
 * the caller holds the resolver's answer), `logs` are today's set rows, and
 * `cardioLoggedToday` is today's line from the cardio history the coach is
 * already sent, so the two can never word one walk two ways.
 */
export function summariseTodayWork(input: {
  session: WorkoutDay | null | undefined
  logs: ExerciseSetLog[]
  cardioLoggedToday?: string | null
}): CoachTodayWork | null {
  const { session, logs } = input
  const planned = session?.exercises ?? []
  const cardioLogged = input.cardioLoggedToday?.trim() || null
  if (planned.length === 0 && logs.length === 0 && !cardioLogged) return null

  const claimed = new Set<ExerciseSetLog>()
  const exercises: CoachTodayExercise[] = planned.map(e => {
    // THE SAME READER EVERY TICK ON THE EXERCISE TAB USES: by id where the row
    // has one, by name where it does not (a set logged through the chat),
    // warm-ups and drops left out. One definition of "a logged set".
    const rows = filterLoggableSets(logs, e.id ?? '', e.name)
    // Its warm-up and drop rows are this exercise's too — never "added work".
    for (const l of logs) if (l.exercise_id ? l.exercise_id === e.id : l.exercise_name === e.name) claimed.add(l)
    return { name: e.name, setsPlanned: e.sets ?? 0, setsLogged: rows.length, logged: rows.map(describeLoggedSet).join(', ') }
  })

  const extra = new Map<string, ExerciseSetLog[]>()
  for (const l of logs) {
    if (claimed.has(l) || l.is_warmup || isDropRow(l)) continue
    extra.set(l.exercise_name, [...(extra.get(l.exercise_name) ?? []), l])
  }
  const added = [...extra.entries()].map(([name, rows]) => ({ name, setsLogged: rows.length, logged: rows.map(describeLoggedSet).join(', ') }))

  return { exercises, added, finisher: session ? describeFinisherForCoach(session) : null, cardioLogged }
}

/** Planned sets and the working sets logged against them — the only like-for-like "N of M". */
export function todayWorkTotals(work: CoachTodayWork): { logged: number; planned: number; notLogged: CoachTodayExercise[] } {
  return {
    planned: work.exercises.reduce((n, e) => n + e.setsPlanned, 0),
    // Capped per exercise: a fourth set on a three-set lift is extra work, not
    // cover for a set missing somewhere else.
    logged: work.exercises.reduce((n, e) => n + Math.min(e.setsLogged, e.setsPlanned), 0),
    notLogged: work.exercises.filter(e => e.setsPlanned > 0 && e.setsLogged < e.setsPlanned),
  }
}

/** The block under the header. '' when there is nothing to say (no session, nothing logged). */
export function buildTodayByExercise(today: CoachToday): string {
  const work = today.work
  if (!work) return ''
  const anythingLogged = work.exercises.some(e => e.setsLogged > 0) || work.added.length > 0 || !!work.cardioLogged
  // Before anything is logged the header already says NOT LOGGED and the
  // TODAY row lists the session; seven "0 of 3" lines would only be length.
  if (!anythingLogged && !today.finished) return ''
  const lines: string[] = []
  for (const e of work.exercises) {
    lines.push(e.setsLogged === 0
      ? `- ${e.name}: 0 of ${e.setsPlanned} sets logged — NOT LOGGED`
      : `- ${e.name}: ${e.setsLogged} of ${e.setsPlanned} sets logged (${e.logged})`)
  }
  for (const a of work.added) lines.push(`- Added, not on today's plan — ${a.name}: ${a.setsLogged} set${a.setsLogged === 1 ? '' : 's'} logged (${a.logged})`)
  if (work.finisher) {
    lines.push(`- Finisher on the plan after the lifting: ${work.finisher} — ${work.cardioLogged ? `cardio logged today: ${work.cardioLogged}` : 'no cardio logged today'}`)
  } else if (work.cardioLogged) {
    lines.push(`- Cardio logged today: ${work.cardioLogged}`)
  }
  if (lines.length === 0) return ''
  return `TODAY, EXERCISE BY EXERCISE (the app's own record: working sets logged against sets planned. "NOT LOGGED" means the app holds no record of it — not that it was done, and not that it was skipped):\n${lines.join('\n')}`
}

// ---------------------------------------------------------------------------
// HOW A REQUEST ENDED, said on the turn that made it (H22.1, 9 Oct 2026).
//
// Confirming, declining and timing out changed the card on screen and nothing
// else; the text replayed to the coach next turn was still the card's own
// lead, "Want me to …?". A refusal was saved as an ordinary sentence. So on
// Friday the coach was shown Thursday's "I couldn't portion … salmon" as an
// open problem, and answered a question about today's workout with a dinner
// card for it. The app knows how each of those ended. It says so.
//
// FACTS, NOT INSTRUCTIONS — the same rule the header keeps. And like the time
// stamp beside it, this is client-side: the edge function replays each turn's
// content verbatim, so it reaches the coach on a frontend push.
// ---------------------------------------------------------------------------
export type TurnOutcome = 'open' | 'applied' | 'declined' | 'expired' | 'failed' | 'refused'

/** A card's stored status, and whether its window has passed, as the outcome the coach is told. */
export function outcomeOfCard(status: string, windowPassed: boolean): TurnOutcome {
  switch (status) {
    case 'done': case 'partial': return 'applied'
    case 'declined': return 'declined'
    case 'expired': case 'stale': return 'expired'
    case 'failed': return 'failed'
    // pending / claimed / executing: still open — unless the ten minutes have
    // gone, which nothing tells the card until somebody taps it.
    default: return windowPassed ? 'expired' : 'open'
  }
}

const OUTCOME_STAMP: Record<TurnOutcome, string> = {
  open: '[OPEN: the app is showing a card for this and they have not answered it yet]',
  applied: '[CLOSED: they tapped Apply and the app made this change]',
  declined: '[CLOSED: they declined this — nothing was changed]',
  expired: '[CLOSED: this offer timed out unanswered — nothing was changed]',
  failed: '[CLOSED: the app tried and could not apply this — nothing was changed]',
  refused: '[CLOSED: the app could not do this — nothing was changed]',
}

export function stampTurnOutcome(content: string, outcome: TurnOutcome | null | undefined): string {
  return outcome ? `${OUTCOME_STAMP[outcome]} ${content}` : content
}

/**
 * ONE PLACE DECIDES WHAT PART OF THE DAY IT IS. Exported 17 Sep 2026 so the
 * coach's own CONTEXT line reads from the same three thresholds this header
 * does — two copies of "when does the evening start" is exactly the shape
 * that lets the app say two different things about one moment.
 */
export function partOfDay(hour: number): string {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * A CONVERSATION IS NOT A FLAT LIST OF SENTENCES SAID JUST NOW.
 *
 * Ashley, 17 Sep 2026, at 17:58: the coach asked her three turns running
 * whether she was going to train "this morning". The clock reaching the model
 * was correct. What was not is that her chat history is restored with NO DATE
 * FILTER and sent as bare {role, content} — so a turn the coach itself wrote
 * at 8am, containing the words "this morning", sat in the window looking
 * exactly like the sentence before this one. Turn 2 mirrored turn 1, turn 3
 * mirrored turn 2, and one wrong reading of the clock became the whole day's.
 *
 * So each turn carries WHEN IT WAS SAID, from `created_at`, which the app has
 * held all along and already reads twenty lines away. Only turns that could be
 * misread are stamped — the last hour and a half of a live conversation is
 * left alone, because stamping every line would be noise and would change how
 * the model reads a normal back-and-forth.
 *
 * DELIBERATELY CLIENT-SIDE. The edge function replays each turn's `content`
 * verbatim, so this reaches the coach on a frontend push with no function
 * deploy — the same lever `buildTodayHeader` uses.
 */
export const STAMP_AFTER_MINUTES = 90

export function stampTurnTime(content: string, createdAt: string | null | undefined, now: Date): string {
  if (!createdAt) return content
  const said = new Date(createdAt)
  if (Number.isNaN(said.getTime())) return content
  const sameDay = said.getFullYear() === now.getFullYear() && said.getMonth() === now.getMonth() && said.getDate() === now.getDate()
  const clock = said.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (!sameDay) {
    const day = said.toLocaleDateString('en-US', { weekday: 'long' })
    return `[said on ${day} ${partOfDay(said.getHours())}, ${clock}] ${content}`
  }
  if (now.getTime() - said.getTime() < STAMP_AFTER_MINUTES * 60_000) return content
  return `[said earlier today, ${partOfDay(said.getHours())}, ${clock}] ${content}`
}

/**
 * The two or three lines that open the exercise summary. Kept inside
 * `exercise_summary` deliberately: that field is interpolated into the prompt
 * verbatim by the deployed edge function, so this reaches Ashley's phone on a
 * frontend push. A new context field would have needed a function deploy,
 * which only she can run — the fix would have sat undeployed behind the one
 * that is already waiting.
 */
export function buildTodayHeader(today: CoachToday): string {
  const when = `It is ${today.dayName} ${partOfDay(today.hour)} (${today.clock}).`

  // LIKE-FOR-LIKE COUNTS, when the caller has joined today's log to today's
  // plan: working sets on planned exercises. Without that join the two bare
  // numbers the caller sent are all there is, and they are used as they were.
  const totals = today.work ? todayWorkTotals(today.work) : null
  const setsLogged = totals ? totals.logged : today.setsLogged
  const setsPlanned = totals ? totals.planned : today.setsPlanned
  // CLOSED IS NOT THE SAME AS DONE (H23). A session finished at 7 of 9 sets
  // used to be announced as "ALREADY DONE — finished and logged", and the
  // coach then recited the two missing sets as work. "They closed it" and
  // "these were not logged" are both true and both said; "ALREADY DONE" is
  // kept for the session where every planned set really is in the log.
  const closedShort = today.finished && setsPlanned > 0 && setsLogged < setsPlanned
    ? `They CLOSED the session with ${setsLogged} of ${setsPlanned} planned sets logged${totals && totals.notLogged.length > 0
        ? `. NOT LOGGED: ${totals.notLogged.map(e => `${e.name} (${e.setsLogged} of ${e.setsPlanned})`).join(', ')}`
        : ''}. Nothing more is owed today, and the sets that are not logged were not recorded as done.`
    : null

  let session: string
  if (today.movedTo) {
    session = `Today, ${today.dayName}, had ${today.focus ?? 'a session'} on it and THEY MOVED IT TO ${today.movedTo.dayName.toUpperCase()} — they told you so. It is not a rest day and it is not missed; the session is still owed, on ${today.movedTo.dayName}. They can still do it today if they want to.`
  } else if (today.movedFrom) {
    session = `Today's session is ${today.movedFrom.dayName}'s ${today.focus}, MOVED TO TODAY at their request${today.finished ? (closedShort ? `. ${closedShort}` : ', and it is ALREADY DONE.') : setsLogged > 0 ? `, with ${setsLogged} of ${setsPlanned} sets logged.` : ', NOT LOGGED yet.'}`
  } else if (!today.focus) {
    session = `Today, ${today.dayName}, is a REST DAY on the plan — there is no session to do today.`
  } else if (!today.isGymSession) {
    session = `Today is ${today.dayName}: ${today.focus} — not a gym session; what it prescribes is on the ${today.dayName} row below.`
  } else if (today.finished && closedShort) {
    session = `Today's session is ${today.dayName}'s ${today.focus}. ${closedShort}`
  } else if (today.finished) {
    session = `Today's session is ${today.dayName}'s ${today.focus}, and it is ALREADY DONE — finished and logged. There is nothing left to train today.`
  } else if (setsLogged > 0 && setsPlanned > 0 && setsLogged < setsPlanned) {
    session = `Today's session is ${today.dayName}'s ${today.focus}, PART-DONE: ${setsLogged} of ${setsPlanned} sets logged.`
  } else if (setsLogged > 0) {
    session = `Today's session is ${today.dayName}'s ${today.focus}, and sets have been logged against it today.`
  } else {
    session = `Today's session is ${today.dayName}'s ${today.focus}, NOT LOGGED yet.`
  }

  const next = today.next
    ? ` The next session after today is ${today.next.isTomorrow ? 'tomorrow' : today.next.dayName}'s ${today.next.focus}.`
    : ''

  return `${when} ${session}${next}`
}

// ---------------------------------------------------------------------------
// THE ROWS HAVE TO KNOW ABOUT MOVES TOO.
//
// Ashley, 12 Sep 2026, from the live app: she moved today's session to another
// day, the card confirmed it, and the coach went on talking about "today's
// deadlifts". Measured before touching anything — the payload she got, in one
// piece:
//
//   It is Sunday morning. Today, Sunday, had Pull & Hinge on it and THEY MOVED
//   IT TO MONDAY ... The next session after today is Tuesday's Push & Press.
//
//   Monday (tomorrow): Rest - no session prescribed
//   Sunday (TODAY): Pull & Hinge - Deadlift (3x5), Barbell Row (3x8-10)
//
// Four statements; three of them say today is a deadlift day and Monday is
// rest. buildTodayHeader was the only part of this file that had ever heard of
// a move. The rows underneath were the plan's raw weekday list — the naive
// `plan.find(d => d.day === name)` that session-move.ts's own header says was
// eliminated everywhere — so the origin still printed its full session tagged
// (TODAY) and the day it landed on printed "Rest".
//
// And the deployed prompt points the model AT the rows, over the header:
// "every day row is tagged (TODAY) or (tomorrow). Read those and use them
// verbatim. A session on a row that is not tagged (TODAY) is NOT today's."
// So "today's deadlifts" was the app's own last line, read back.
//
// The week arrives already resolved rather than being resolved a second time
// here: useTrainingWeek has asked sessionForDate for all seven dates before
// this is called, and two readers of one fact is exactly how they come to
// disagree (the comment that hook already carries, for the same reason).
// ---------------------------------------------------------------------------
export interface CoachWeekRow {
  /**
   * THE DATE, and it is not decoration. Deciding whether a move's destination
   * is one of these rows by WEEKDAY NAME gets Monday the 7th confused with
   * Monday the 14th — measured while building this: a Sunday session moved to
   * the following Monday reported "it is listed on Monday" while the Monday
   * row three lines above said "Rest", and the exercises vanished from the
   * payload altogether. A weekday name is exactly the ambiguity this whole
   * file is here to remove, so the comparison is on dates.
   */
  date: string
  /** The weekday this row IS — Monday..Sunday, by date, not by whose session sits on it. */
  dayName: string
  /**
   * What actually runs here, moves taken into account. Null (or absent, which
   * TrainingWeekDay uses) on a move origin and on a true rest day.
   */
  session?: WorkoutDay | null
  /** Set when THIS day's session has gone elsewhere. */
  movedTo?: { date: string; dayName: string } | null
  /** Set when another day's session has arrived here. */
  movedFrom?: { date: string; dayName: string } | null
  /**
   * WHAT HAPPENED TO THE DAY, as the week strip draws it (useTrainingWeek's
   * own `state`): done, partial, missed, swapped, rest_chosen… Optional, and
   * absent means "say nothing about it", which is what every caller that
   * passes a bare row still gets.
   *
   * Added 9 Oct 2026 (H23/H22): the hook had handed these over all along and
   * rowFor read none of them, so a Tuesday swapped for football reached the
   * coach as "Tuesday: Back & Biceps - …", exactly like a session that was
   * done or was still to come.
   */
  state?: string
  /** "Football · 60 min · Hard" on a swapped day — the strip's own line. */
  swappedLine?: string | null
  swappedForActivity?: string | null
  /** They SAID it was missed — as opposed to the strip inferring it from an empty past day. */
  markedMissed?: boolean
}

export interface CoachWeekBrief {
  days: WorkoutDay[]
  /** The active mesocycle week's own note — where a block-boundary load-hold or a deload explains itself. */
  coachNote?: string | null
  /** Load suggestions sitting unanswered on the dashboard, so the coach doesn't re-offer what's already pending. */
  pendingLoadSuggestions?: string[] | null
  /** Which day it is and what is true of it — see CoachToday. Omitted only when the caller genuinely does not know yet. */
  today?: CoachToday | null
  /**
   * The seven dated cells of the week the trainee is actually in, already
   * resolved through sessionForDate — see CoachWeekRow.
   *
   * OPTIONAL, and absent means "render exactly as before". Every existing
   * caller and gate passes only `days`, including the load-bearing
   * `buildCoachExerciseSummary({ days: [] }) === ''` contract that a prompt
   * rule keys on. The caller also withholds it while the week read is still
   * in flight: a half-loaded week claims no moves, which is the very thing
   * this exists to stop it claiming.
   */
  week?: CoachWeekRow[] | null
}

/** The whole `exercise_summary` payload sent to chat-gemini. */
export function buildCoachExerciseSummary({ days, coachNote, pendingLoadSuggestions, today, week }: CoachWeekBrief): string {
  // HOW TO DO THEM, not just what they are. Added 5 Sep 2026 on Ashley's
  // "fix it": the app's 801 curated form cues had one reader in the whole
  // repo (the Exercise tab's How-to panel) and the coach was not it, so it
  // answered technique from the model's own knowledge while the app held its
  // answer one tap away. Same defect as the ingredients the coach could not
  // see, and as the intensity/tempo this very file's header records.
  //
  // A SEPARATE BLOCK, not more text on describeExerciseForCoach: a lift
  // programmed twice in a week would otherwise carry its cues twice.
  //
  // Deduplicated and capped inside buildCoachTechniqueSummary, which returns
  // '' when there is nothing — which is what keeps the empty-plan contract
  // below intact.
  const technique = buildCoachTechniqueSummary(
    days.flatMap(d => d.exercises.map(e => e.name)),
  )

  // EVERY ROW SAYS WHERE IT SITS RELATIVE TO NOW. Seven unmarked day names is
  // what made "today's bench and shoulder press" possible on a day whose
  // session was neither: the model had to match "today is Monday" against this
  // list itself, every turn, and once it matched the wrong row everything after
  // it was confidently wrong.
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const todayIdx = today ? dayNames.indexOf(today.dayName) : -1
  const tag = (day: string): string => {
    if (todayIdx === -1) return ''
    if (day === today!.dayName) return ' (TODAY)'
    const idx = dayNames.indexOf(day)
    if (idx === -1) return ''
    return idx === (todayIdx + 1) % 7 ? ' (tomorrow)' : ''
  }

  // A LIFTING DAY'S FINISHER IS PART OF THE DAY (H8/H23). The row listed the
  // exercises and stopped, so the coach did not know a 30-minute walk was
  // already prescribed after the session — and offered to schedule one, or
  // could not say whether it "counted". A cardio-only day already printed it.
  const listOf = (d: WorkoutDay): string => {
    if (d.exercises.length === 0) return describeNonLiftingDay(d)
    const finisher = describeFinisherForCoach(d)
    const mobility = d.mobilityFiller
    return d.exercises.map(describeExerciseForCoach).join(', ')
      + (finisher ? ` | then the finisher: ${finisher}` : '')
      + (mobility ? ` | then optionally ${mobility.activity}, ${mobility.duration} min` : '')
  }

  // WHAT HAPPENED TO THE DAY, in the row that names it. Empty for a day
  // nothing has happened to yet (due / rest / before the plan) and whenever
  // the caller sent no state.
  const happened = (r: CoachWeekRow): string => {
    // TODAY'S ROW SAYS NOTHING HERE: the header and the exercise-by-exercise
    // block above carry today exactly, and the strip's 'done' means "closed
    // with something logged" — on a session closed at 7 of 9 that word on the
    // TODAY row would contradict both.
    if (today && r.dayName === today.dayName) return ''
    switch (r.state) {
      // CLOSED, not "done": the strip's state says the session was finished
      // with work in it, not that every set was. The log lines say which.
      case 'done': return ' [CLOSED — work was logged that day]'
      case 'partial': return ' [PART-DONE — some sets logged, session not closed]'
      case 'swapped': return ` [NOT DONE AS PLANNED — they did ${r.swappedLine || r.swappedForActivity || 'something else'} instead, and said so; what the plan had is listed for reference]`
      case 'rest_chosen': return ' [RESTED ON PURPOSE — they said so; not missed; what the plan had is listed for reference]'
      case 'missed': return r.markedMissed
        ? ' [MISSED — they said so]'
        : ' [NOTHING LOGGED — the day has passed with no sets recorded]'
      default: return ''
    }
  }

  // WHICH ROWS ARE VISIBLE, BY DATE, so a session moved out of this window is
  // not simply lost. Ashley's Sunday moving to the following Monday is the
  // case: the destination is not one of the seven cells, so the origin keeps
  // the exercise list and says where it has gone. Dropping the list there
  // would trade one silent wrong answer for another — and matching on the
  // weekday NAME instead would find the wrong Monday (see CoachWeekRow.date).
  const shownDates = new Set((week ?? []).map(r => r.date))

  const rowFor = (r: CoachWeekRow): string => {
    const label = `${r.dayName}${tag(r.dayName)}`
    if (r.movedTo) {
      // The plan's OWN row for this weekday, read deliberately raw: it is the
      // only thing that can still say what the session is called now that
      // sessionForDate has (correctly) resolved this date to nothing.
      const own = days.find(d => d.day === r.dayName)
      const name = own?.focus ?? 'The session'
      // Off-window means no other row carries it, so this one has to. Neither
      // sentence says "below": a destination can sit EARLIER in the week than
      // its origin, and a row that points the wrong way is a fresh wrong
      // answer of the kind this whole change is removing.
      const offWindow = !shownDates.has(r.movedTo.date)
      if (offWindow) {
        return `${label}: ${name} - MOVED TO ${r.movedTo.dayName.toUpperCase()} ${r.movedTo.date}, which is outside the week listed here, so there is nothing to train here`
          + (own && own.exercises.length > 0 ? `. What moved: ${listOf(own)}` : '')
      }
      return `${label}: ${name} - MOVED TO ${r.movedTo.dayName.toUpperCase()}, so there is nothing to train here; it is listed on the ${r.movedTo.dayName} row`
    }
    if (r.movedFrom && r.session) {
      // Named by where it came from, never by the weekday it landed on —
      // calling it Monday's session would quietly rename the work, which is
      // the same rule sessionForDate states and buildTodayHeader already uses.
      return `${label}: ${r.movedFrom.dayName}'s ${r.session.focus}, MOVED HERE${happened(r)} - ${listOf(r.session)}`
    }
    if (!r.session) return `${label}: Rest - no session prescribed`
    return `${label}: ${r.session.focus}${happened(r)} - ${listOf(r.session)}`
  }

  // `days.length > 0` GUARDS THE ROWS, not just the header. An empty `days`
  // means the plan has not arrived — App holds [] until its read resolves —
  // and the resolved week is seven cells regardless, so rendering from it
  // would print seven "Rest - no session prescribed" lines and hand the coach
  // a rest week it invented. That is the same cold-load defect Home and the
  // opener have each been fixed for, and it is what keeps
  // `buildCoachExerciseSummary({ days: [] }) === ''` true with a week attached.
  const rows = days.length === 0
    ? ''
    : week && week.length > 0
      ? week.map(rowFor).join('\n')
      : days.map(d => `${d.day}${tag(d.day)}: ${d.focus} - ${listOf(d)}`).join('\n')

  const byExercise = today && days.length > 0 ? buildTodayByExercise(today) : ''

  return (today && days.length > 0 ? `${buildTodayHeader(today)}\n\n` : '')
    + (byExercise ? `${byExercise}\n\n` : '')
    + rows
    + (coachNote ? `\nThis week's coaching note: ${coachNote}` : '')
    + (pendingLoadSuggestions && pendingLoadSuggestions.length > 0
      ? `\nPending suggestion(s) waiting on the dashboard, not yet answered: ${pendingLoadSuggestions.join(' | ')}`
      : '')
    // EMPTY PLAN STILL RETURNS EXACTLY ''. test-log-correction.ts pins that
    // literally, and it is load-bearing: the prompt has a rule keyed on this
    // section being empty ("if the section above is EMPTY, say you don't have
    // their prescribed weights"). An unconditional header here would make the
    // coach think it had a plan it does not have.
    + (technique ? `\nHOW TO PERFORM THESE (the app's own cues, the same words shown on the Exercise tab):\n${technique}` : '')
}

/**
 * THE NEXT SESSION AFTER A GIVEN DATE, moves taken into account.
 *
 * Lifted out of ChatAssistant on 12 Sep 2026, where it was
 * `liveWeekDays.find(x => x.day === name && x.exercises.length > 0)` — the
 * fifth surviving instance of the naive weekday lookup session-move.ts's
 * header says was eliminated everywhere. On the day Ashley moved her Sunday
 * session to Monday it skipped Monday (a rest row in the plan) and announced
 * "the next session after today is Tuesday's Push & Press" — in the same
 * paragraph that had just said the session was owed on Monday.
 *
 * Pure, and here rather than in the component, so a gate can drive it
 * directly: a regex over a 4.6k-line component would prove nothing about what
 * it returns. One call site, three readers fixed at once — this sentence in
 * the coach's header, the chat opener, and the unprompted nudge.
 *
 * `dayName` is the weekday the session is actually DONE on, not the weekday it
 * was prescribed for: a session that travelled to Monday is reached by turning
 * up on Monday. `focus` still names the session itself, which is why a moved
 * session keeps the name it had.
 */
export function nextSessionAfter(input: {
  /** The day to look forward FROM — today, in YYYY-MM-DD. */
  date: string
  plan: WorkoutDay[]
  moves: SessionMove[]
  /** How far to look. Six keeps it inside the week the moves were read for. */
  lookaheadDays?: number
}): { dayName: string; focus: string; lead: string | null; isTomorrow: boolean } | null {
  const { date, plan, moves, lookaheadDays = 6 } = input
  for (let ahead = 1; ahead <= lookaheadDays; ahead++) {
    const on = addDays(date, ahead)
    const resolved = sessionForDate({ date: on, plan, moves })
    // A move ORIGIN resolves to nothing, which is the point: the session is
    // not run there, so it is not the next session.
    const day = resolved.movedTo ? null : resolved.day
    if (!day || day.exercises.length === 0) continue
    const lead = day.exercises.find(e => e.tier === 'tier_1_primary')?.name ?? day.exercises[0]?.name ?? null
    return { dayName: dayNameOf(on), focus: day.focus, lead, isTomorrow: ahead === 1 }
  }
  return null
}

// ---------------------------------------------------------------------------
// WHERE THEY ARE IN THE PROGRAMME.
//
// The coach's prompt has always carried a textbook — what Anatomical
// Adaptation, Hypertrophy Accumulation and Intensification each mean — and
// was never told which of them was happening. Every week in the plan carries
// phase_label, phase_focus, block_number, week_in_block, is_deload and
// isCalibrationWeek; not one of them reached the chat. So it could explain
// periodization in the abstract and could not say where the trainee stood in
// it, which is why it only ever sounded knowledgeable when asked a direct
// question.
//
// Ashley's ruling, 31 Aug 2026, on how forward the coach should be: "when a
// plan is built give a quick high level of the weeks to come, then when
// something changes." So this reports position AND the two moments worth
// speaking up at — nothing else. A coach that narrates the phase every day
// teaches people to skim the opening paragraph, which then hides the days it
// mattered.
// ---------------------------------------------------------------------------

export interface PhaseBriefInput {
  /** The week the trainee is actually in, 1-indexed. */
  activeWeek: number
  totalWeeks: number
  week: {
    phase_label?: string
    phase_focus?: string
    block_number?: number
    week_in_block?: number
    is_deload?: boolean
    isCalibrationWeek?: boolean
  } | undefined
  /** When the plan was generated. */
  planCreatedAt: string | null
  now: Date
  /** Timestamp of the most recent earlier message in this conversation, if any. */
  lastChatAt: string | null
}

const DAY_MS = 86_400_000

/**
 * Returns the block of context describing the trainee's position, or '' when
 * there is no plan to describe — never a guess and never a placeholder.
 */
export function buildCoachPhaseBrief({
  activeWeek, totalWeeks, week, planCreatedAt, now, lastChatAt,
}: PhaseBriefInput): string {
  if (!week || !planCreatedAt || activeWeek < 1 || totalWeeks < 1) return ''

  const lines: string[] = []
  const phase = week.phase_label?.trim()
  const position = `Week ${activeWeek} of ${totalWeeks}`
  const block = week.block_number != null && week.week_in_block != null
    ? ` — block ${week.block_number}, week ${week.week_in_block} of that block`
    : ''
  lines.push(`${position}${block}${phase ? ` — ${phase}` : ''}.`)
  if (week.phase_focus?.trim()) lines.push(`What this phase is for: ${week.phase_focus.trim()}`)
  if (week.is_deload) lines.push('THIS IS A DELOAD WEEK — reduced on purpose, for recovery. Say so if it comes up; do not let them read it as backsliding.')
  if (week.isCalibrationWeek) lines.push('THIS IS A CALIBRATION WEEK — loads are deliberately capped so they can find their working weights.')

  // MOMENT ONE: a plan they have not been walked through yet. Week 1 alone is
  // not enough — someone can sit in week 1 for a fortnight if they train
  // rarely — so the plan's own age has to agree.
  const planAgeDays = (now.getTime() - new Date(planCreatedAt).getTime()) / DAY_MS
  const planIsNew = activeWeek === 1 && planAgeDays >= 0 && planAgeDays <= 3

  // MOMENT TWO: the week turned over since they last spoke to you. Computed
  // from the plan's own start date rather than a stored flag, so it stays
  // right after a rebuild and cannot drift out of sync with the plan.
  const weekStart = new Date(planCreatedAt).getTime() + (activeWeek - 1) * 7 * DAY_MS
  const weekJustChanged = !!lastChatAt && new Date(lastChatAt).getTime() < weekStart && activeWeek > 1

  if (planIsNew) {
    lines.push(
      'SPEAK UP: this plan is new and they have not been walked through it. Somewhere in this reply, give a SHORT high-level shape of what is coming — how many weeks, what the blocks do, roughly when it gets harder and when it eases off. Three or four sentences, not a lecture, and not a week-by-week table.',
    )
  } else if (weekJustChanged) {
    lines.push(
      `SPEAK UP: the week has turned over since you last spoke${phase ? ` — they are now in ${phase}` : ''}. Say so briefly and name what actually changes for them this week. One or two sentences.`,
    )
  } else {
    lines.push('Do NOT volunteer the phase this turn — nothing has changed since you last spoke. Use it if they ask, or if it genuinely explains something they raised.')
  }

  return lines.join('\n')
}
