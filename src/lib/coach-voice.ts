// ---------------------------------------------------------------------------
// THE COACH'S OWN WORDS — one voice, in the sentences the app writes itself.
//
// A large share of what a person reads as "the coach" never touches the model:
// every proposal card lead, every receipt title, every refusal, every save
// failure is a string in this repo. `docs/audits/the-coachs-own-words-2026-09-15.md`
// measured that surface before any of it was changed and found six things,
// of which two matter most:
//
//   - 18 proposal builders, 9 leads. Half the cards said NOTHING — including
//     the exercise swap, the most-used verb in the app.
//   - The nine that spoke used THREE grammars for one job: "I can X:" on
//     exercise edits, "I'll X. Shall I?" on day verbs, and "Want me to X?" on
//     the quick-reply chips for those very same day verbs, 945 lines away in
//     the same file. A person marking a rest day met two of them in one minute.
//
// ASHLEY'S RULING, 15 Sep 2026, from three options: **"Want me to X?"** — over
// "I'll X. Shall I?" and over "I can X:". It is the warmest of the three and
// reads least like an app, and it has a second effect she did not have to
// choose: the chips already spoke this way, so the card and the chip now agree
// instead of contradicting each other.
//
// WHY THE VERB PHRASE STAYS AT THE CALL SITE. This module does not hold 18
// finished sentences. It holds the SHAPE — `ask()` — and each builder passes
// the phrase describing its own change. A lookup table of whole sentences
// would drag every builder's facts (day names, exercise names, minute counts)
// into one file that knows nothing about them, and the first slot that did not
// fit would be written inline again, which is exactly how the drift above
// started.
//
// WHY THIS FILE STAYS CHEAP TO IMPORT. `tradeoff-shape.ts:1-22` records what a
// careless import here costs: pulling `edit-tradeoff` into the nutrition sheet
// dragged the 5,000-line exercise catalogue and the plan scorer into the main
// chunk and tripped `test:bundle`. This module is imported by BOTH the chat
// client and the nutrition sheet, so it must not become that seam again.
//
// The property is TRANSITIVE WEIGHT, not "no imports" — a rule of "type-only
// imports, nothing else" would be easy to state, easy to check and wrong, since
// the one runtime re-export below (`edit-reason`, itself a leaf that imports a
// single type) costs nothing and prevents a second copy of the safety text.
// `test:coach-voice` §1 walks the runtime import graph from here and fails if
// it reaches the exercise catalogue, the plan scorer, or the Supabase client.
//
// WHAT IS DELIBERATELY NOT HERE, each for its own reason:
//   - `edit-reason.ts` — already the right shape, and its safety text
//     (HURT_KINDS, RED_FLAG_ADVICE) is re-exported below BY REFERENCE, never
//     re-worded. Pain wording is Ashley's ruling of 15 Sep and copying it
//     would create a second version to drift.
//   - `accountability.ts` — third person, written for the MODEL to read.
//   - `tool-reply.ts`'s *_NUDGE constants — instructions to the model.
//   - `coach-tips.ts` — dashboard tiles, a different medium from a chat bubble.
// ---------------------------------------------------------------------------

import type { FitnessGoal, MacroTargets } from './types'

// ---------------------------------------------------------------------------
// TARGETS THAT MOVED ON THEIR OWN
// ---------------------------------------------------------------------------

/** Deterministic thousands separator. toLocaleString would read the machine's
 *  locale, and a gate that gives a different answer on a different machine is
 *  not a gate — the same rule as the harness clock, one level down. */
const grouped = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Every target that can move, in the order a person reads them. */
const TARGET_FIELDS: ReadonlyArray<{ key: keyof MacroTargets; label: string; unit: string }> = [
  { key: 'calories', label: 'calories', unit: '' },
  { key: 'protein', label: 'protein', unit: 'g' },
  { key: 'carbs', label: 'carbs', unit: 'g' },
  { key: 'fat', label: 'fat', unit: 'g' },
]

/**
 * WHAT CHANGED AND WHAT IT CHANGED FROM, when the app retunes daily targets
 * off a moved weight trend. Returns null when nothing actually moved, so a
 * caller cannot announce a change that did not happen.
 *
 * WHY IT NAMES THE OLD NUMBER. The two hand-written copies this replaces said
 * "Your calorie target updated to 2,400 kcal" — a figure with nothing to
 * measure it against. Ashley's ruling on the implement ceilings (13 Sep 2026)
 * generalises: if the app quotes a number, it says where that number sits, or
 * she cannot go and look at it.
 *
 * WHY IT NAMES MORE THAN CALORIES. Protein, carbs and fat are derived from the
 * same weight and move in the same instant. Announcing only the calorie change
 * tells someone tracking protein that nothing happened to their protein.
 *
 * WHY IT IS ONE SENTENCE AND NOT A LIST. This renders as a coach nudge on
 * Home, in the same strip as every other thing the coach says. A four-row
 * table there would read as a report, not as a trainer mentioning something.
 */
/**
 * WHY THE CAUSE IS AN ARGUMENT, added 17 Sep 2026 after shipping this broken.
 *
 * The sentence used to end with a hardcoded "moved with your recent weigh-ins",
 * and on 16 Sep this function gained a fourth caller: the effect that recomputes
 * targets when the GOAL, age, height, activity level or macro mode changes.
 * So switching from fat loss to muscle growth told somebody their weigh-ins had
 * done it. Nobody had weighed in.
 *
 * A single sentence with one cause baked into it is safe exactly until it gets
 * a second caller, and nothing about adding that caller makes the problem
 * visible — the sentence still reads perfectly. Any phrasebook line that
 * ASSERTS WHY should take the why from the caller that knows it.
 */
export type TargetMoveCause = 'weigh_in' | 'goal' | 'settings' | 'unknown'

const CAUSE_CLAUSE: Record<TargetMoveCause, string> = {
  // Named in the person's own terms, never the field that changed. "Recent"
  // rather than "your weigh-in" because the anchor moves on a seven-day
  // average, so no single reading is the one responsible.
  weigh_in: 'with your recent weigh-ins',
  goal: 'with your new goal',
  // The honest catch-all: age, height, activity level and macro mode all land
  // here, and naming them individually would be a list nobody reads. It still
  // says a CHANGE caused it rather than implying the app moved on its own.
  settings: "now you've changed your details",
  // A COLD START KNOWS NOTHING, and must not guess. restoreSession compares
  // today's targets against the last stored snapshot, which could have moved
  // for any reason, on any day, possibly on another device. Every other clause
  // here asserts a cause; this one asserts only elapsed time, which is the one
  // thing that path can actually stand behind.
  unknown: 'since you were last here',
}

export function targetsMoved(
  before: MacroTargets,
  after: MacroTargets,
  cause: TargetMoveCause,
): string | null {
  const moved = TARGET_FIELDS
    .filter(f => Math.round(before[f.key]) !== Math.round(after[f.key]))
    .map(f => `${f.label} ${grouped(before[f.key])}${f.unit} to ${grouped(after[f.key])}${f.unit}`)
  if (moved.length === 0) return null
  const list = moved.length === 1
    ? moved[0]
    : `${moved.slice(0, -1).join(', ')} and ${moved[moved.length - 1]}`
  // FALLBACK, NOT DECORATION. src/ is typechecked so every real caller passes
  // a cause — but scripts/ is not (tsconfig is include: ["src"]), and a gate
  // calling the old two-argument signature produced the user-facing sentence
  // "Your daily targets moved undefined — calories 2,200 to 2,400." while
  // still passing, because its assertions read the list and not the clause.
  // Measured 17 Sep 2026. A sentence that reaches a screen can never be
  // allowed to contain the word undefined; the gate below pins the clause so
  // this fallback cannot quietly become the normal path.
  return `Your daily targets moved ${CAUSE_CLAUSE[cause] ?? CAUSE_CLAUSE.unknown} — ${list}.`
}

/**
 * THE MEALS NO LONGER ADD UP TO THE TARGET, said once, with both numbers.
 *
 * Ashley's ruling, 17 Sep 2026: tell her and offer to refit — not silently,
 * not automatically. This is the telling half, and it deliberately asserts NO
 * CAUSE. targetsMoved above names why the target moved because its caller
 * knows; this one is reached from a drift that accumulated over weeks out of
 * every input at once, so "your meals no longer match" is the whole of what
 * the app can stand behind.
 *
 * Calories only, and that is a choice rather than an omission. The protein,
 * carb and fat bands are part of the same verdict, but four numbers against
 * four other numbers is a table, and the card's rows already carry the detail
 * for anyone who wants it.
 */
export function mealsDrifted(mealCalories: number, targetCalories: number): string {
  return `Your meals add up to ${grouped(mealCalories)} calories against a ${grouped(targetCalories)} target. I can resize them — same meals, different amounts.`
}

/**
 * MORE MEALS TO CHOOSE FROM — Ashley's ruling, 28 Sep 2026: "Button, keep
 * today". Offered, never done unasked (her standing ruling on running out of
 * swaps), and the offer states the promise that makes it safe to tap: today
 * and the days already shopped for do not move.
 *
 * `counts` are how many options each short meal has now.
 */
export function moreMealOptionsOffer(counts: number[], target: number): string {
  const fewest = Math.min(...counts)
  const have = counts.every(c => c === counts[0])
    ? `Your meals have ${fewest} options each.`
    : `Some of your meals have only ${fewest} options.`
  return `${have} I can top each one up to ${target}, so your week repeats less. Today, and any day on your shopping list, stay exactly as they are.`
}

const MEAL_PLURAL: Record<string, string> = { breakfast: 'breakfasts', lunch: 'lunches', dinner: 'dinners', snack: 'snacks' }
const joinPlain = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * THE OFFER FOR A MEAL WITH SEVEN DISHES AND FEW THAT FIT (30 Sep 2026): the
 * count above says "you have five", this says "you have seven and two of them
 * work". One meal gets its numbers; several get none, because a sentence
 * carrying three ratios is one nobody reads. "Fit" is the assembler's own
 * test (a day with that dish lands within the bands), so it is the word the
 * rest of the app uses for a day that works.
 */
export function moreMealFitOffer(items: { slot: string; fitting: number; have: number }[]): string {
  const promise = 'Today, and any day on your shopping list, stay exactly as they are.'
  if (items.length === 1) {
    const { slot, fitting, have } = items[0]
    const plural = MEAL_PLURAL[slot] ?? `${slot}s`
    const lead = fitting === 0
      ? `None of your ${have} ${plural} fit your targets right now, so your ${plural} keep repeating.`
      : `Only ${fitting} of your ${have} ${plural} ${fitting === 1 ? 'fits' : 'fit'} your targets right now, so your ${plural} keep repeating.`
    return `${lead} I can add some that do. ${promise}`
  }
  const names = joinPlain(items.map(i => MEAL_PLURAL[i.slot] ?? `${i.slot}s`))
  return `Very few of your ${names} fit your targets right now, so they keep repeating. I can add some that do. ${promise}`
}

/**
 * What happened when she tapped it. Every outcome says whether anything
 * changed, because "nothing has changed" is the fact she needs when it fails.
 * `startLabel` is "tomorrow", "on Thursday" or "on Monday 6 October".
 */
export function moreMealOptionsWhy(r: { reached: boolean; listUnreadable: boolean }): string {
  if (r.listUnreadable) return "I couldn't check your shopping list just then"
  return r.reached ? "I couldn't find new meals that fit your targets" : "I couldn't reach the meal generator just then"
}

export function moreMealOptionsDone(r: { added: number; asked: number; reached: boolean; listUnreadable: boolean; startLabel: string }): string {
  if (r.added === 0) {
    // Every failure says nothing changed, and the two that are about a
    // connection say to try again; "no meal fits" would not get better.
    const retry = r.listUnreadable || !r.reached ? ' Try again in a moment.' : ''
    return `${moreMealOptionsWhy(r)}, so nothing has changed.${retry}`
  }
  const lead = `Added ${r.added} new ${r.added === 1 ? 'meal' : 'meals'}. They start ${r.startLabel}; every day before then stays as it was.`
  // "There's room to try again" holds on both surfaces: the screen still
  // offers it, and the coach can be asked. Neither has to point at a control.
  return r.added < r.asked ? `${lead} That's fewer than I asked for, so there's room to try again.` : lead
}

/**
 * THE COACH'S CARD FOR "MORE OPTIONS FOR EVERY MEAL" (29 Sep 2026) — the same
 * change the Nutrition tab's "Get more options" makes, through the same
 * function, so the two are worded from one place. The card states before the
 * tap what it will NOT touch, because that promise is what makes it safe to
 * tap (Ashley's ruling of 28 Sep, "Button, keep today").
 */
export const MORE_MEALS = {
  /** Completes "Do you want me to ...". */
  lead: 'add more options to each of your meals',
  /**
   * Said on the card before the tap, as ONE item: the card prints its
   * unchanged items joined with commas after "Unchanged:", so two full
   * sentences read as ".,". This is the promise that makes the tap safe.
   */
  unchanged: 'Today and every day on your shopping list, and every option you already have — nothing is removed or resized.',
  starts: (startLabel: string) => `The new meals start ${startLabel}; every day before then stays as it was.`,
  takesAMoment: 'Finding new meals takes a moment.',
  /** Completes "Do you want me to ..." when a meal has dishes but too few that fit. */
  leadFit: 'add meals that fit your targets, where too few of your dishes do',
  /** A row's before and after. */
  options: (n: number) => `${n} option${n === 1 ? '' : 's'}`,
  /** The same row when it is about fit: what is there now, and what the top-up can reach. */
  fitBefore: (fitting: number, have: number) => `${fitting} of ${have} fit`,
  fitAfter: (fitting: number, have: number) => `up to ${fitting} of ${have} fit`,
  /** No card, and why: the three days the request cannot be met. */
  refusals: {
    full: (size: number) => `Every meal already has at least ${size} options, so there's nothing to add. If the same ones keep coming up, tell me which and I'll swap them.`,
    crowded: "Some of your meals have plenty of dishes but few that fit your targets, and adding more would slow the app down, so I can't top them up. If the same ones keep coming up, tell me which and I'll swap them.",
    building: "I'm still building your first set of meals — give me a moment and ask me again.",
    noBody: "I need your height, weight, age and sex before I can build meals around your targets — you can add them in Profile.",
    listUnreadable: "I couldn't check your shopping list just then, so I can't say which days would stay as they are. Try again in a moment.",
  },
} as const

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const poss = (day: string) => `${day}'s`

/**
 * SWAPPING A MEAL WITH ANOTHER DAY'S — Ashley's ruling, 29 Sep 2026, from three
 * options: they SWAP PLACES (Monday's dinner goes to Wednesday and Wednesday's
 * comes to Monday), over giving the emptied day a fresh dinner and over eating
 * the same dish on both. One phrasebook for the Move sheet and the coach's
 * card, because both are the same change through the same builder.
 *
 * `day` is a possessive that already reads as a sentence opener: "Today's",
 * "Wednesday's". Nothing here states a number the trial did not produce.
 */
export const DAY_MOVE = {
  /** Completes "Want me to ...". `day` is a plain label: "today" or "Wednesday". */
  lead: (slot: string, day: string, otherDay: string) => `swap ${poss(day)} ${slot} with ${poss(otherDay)}`,
  swapped: (slot: string, day: string, otherDay: string) =>
    `${cap(poss(day))} ${slot} and ${poss(otherDay)} swap places, so both days keep a ${slot}.`,
  /** Two DIFFERENT meals on two days (30 Sep 2026): Monday's dinner with Wednesday's lunch. */
  leadAcross: (slot: string, day: string, otherSlot: string, otherDay: string) =>
    `swap ${poss(day)} ${slot} with ${poss(otherDay)} ${otherSlot}`,
  swappedAcross: (slot: string, day: string, otherSlot: string, otherDay: string) =>
    `${cap(poss(day))} ${slot} and ${poss(otherDay)} ${otherSlot} swap places, and each is resized to fit the meal it lands in.`,
  unchangedAcross: 'The foods in each meal — only how much of each changes, to fit the meal it lands in',
  /** One item: the card prints these after "Unchanged:". */
  unchanged: 'The meals themselves, their foods and their amounts — only which day each one is on',
  /** A card row's label: "Today's dinner", "Wednesday's dinner". */
  rowLabel: (day: string, slot: string) => `${cap(poss(day))} ${slot}`,
  stillOnTarget: 'Both days are re-fitted around the swap and still land on your target.',
  offTarget: (day: string, kcal: number, offBy: number) =>
    `${cap(day)} would come to ${grouped(kcal)} kcal, about ${grouped(Math.abs(offBy))} ${offBy > 0 ? 'over' : 'under'} your target.`,
  /** A meal OTHER than the two named that changes with the swap: a different dish. */
  alsoLeftover: (day: string, slot: string, to: string) =>
    `${cap(poss(day))} ${slot} becomes ${to}, the leftovers of the dinner the night before.`,
  alsoFresh: (day: string, slot: string, to: string) =>
    `${cap(poss(day))} ${slot} becomes ${to}, cooked fresh instead of leftovers.`,
  alsoRefit: (day: string, slot: string, to: string) =>
    `${cap(poss(day))} ${slot} becomes ${to}, so the day still fits.`,
  /** ...or the same dish at a different size. */
  alsoResized: (day: string, slot: string, from: number, to: number) =>
    `${cap(poss(day))} ${slot} goes from ${grouped(from)} to ${grouped(to)} kcal so the day still fits.`,
  andMore: (n: number) => `${n} more ${n === 1 ? 'meal changes' : 'meals change'} too.`,
  listStale: (days: string[]) =>
    `${cap(days.join(' and '))} ${days.length === 1 ? 'is' : 'are'} on your shopping list, so rebuild the list afterwards to match.`,
  listUnknown: "I couldn't check your shopping list. If either day is on it, rebuild the list afterwards to match.",
  /** The receipt's per-day row detail. */
  became: (to: string) => `→ ${to}`,
  done: (slot: string, day: string, otherDay: string) =>
    `${cap(poss(day))} ${slot} and ${poss(otherDay)} have swapped places.`,
  doneAcross: (slot: string, day: string, otherSlot: string, otherDay: string) =>
    `${cap(poss(day))} ${slot} and ${poss(otherDay)} ${otherSlot} have swapped places, each resized to fit.`,
  /** No card, and why. None of these points at a control. */
  refusals: {
    noBody: "I need your height, weight, age and sex before I can work out how your days fit together — you can add them in Profile.",
    whichSlot: 'Which meal did you want to swap — breakfast, lunch, dinner or a snack?',
    whichDays: "Which two days did you mean? For example, Monday's dinner with Wednesday's.",
    outOfRange: 'I can only swap meals between today and the next six days — which days did you mean?',
    sameDay: "Those are the same day, so there's nothing to swap.",
    sameDayOtherMeal: "Those two meals are on the same day. To trade two meals within a day, ask for one to move into the other's slot.",
    noSuchMeal: (slot: string) => `Your plan doesn't have a ${slot} at the moment, so there's nothing to swap it with. You can change how many meals a day you eat in Profile.`,
    nothingThere: (slot: string, day: string) => `There's no ${slot} planned for ${day} to swap with.`,
    sameDish: (slot: string, day: string, otherDay: string) =>
      `${cap(poss(day))} ${slot} and ${poss(otherDay)} are already the same meal, so there's nothing to swap.`,
    leftover: (day: string) =>
      `${cap(poss(day))} lunch is leftovers of the dinner the night before, so it can't be moved on its own. Move that dinner and the leftovers are worked out again from it.`,
    eaten: (slot: string) => `You've already logged today's ${slot} as eaten, so it can't move.`,
    ledgerUnreadable: "I couldn't check what you've eaten today just then, so I can't move today's meals. Try again in a moment.",
    notInPlan: (day: string, slot: string) => `${cap(poss(day))} ${slot} isn't one of your saved options any more, so I can't move it.`,
    wouldNotHold: "I can't make that swap fit your plan.",
  },
  /** Putting a swap back. Every line says whether anything changed. */
  undo: {
    /** The claim alone, for a receipt whose title already says "Put back". */
    asTheyWere: (slot: string, day: string, otherSlot: string, otherDay: string) =>
      slot === otherSlot
        ? `${cap(poss(day))} ${slot} and ${poss(otherDay)} are as they were.`
        : `${cap(poss(day))} ${slot} and ${poss(otherDay)} ${otherSlot} are as they were.`,
    /** The sheet's note, which has no title to carry the words. */
    done: (slot: string, day: string, otherSlot: string, otherDay: string) =>
      `Put back: ${DAY_MOVE.undo.asTheyWere(slot, day, otherSlot, otherDay)}`,
    changed: "One of those meals has changed since, so I've left both as they are.",
    eaten: (slot: string) => `You've logged today's ${slot} as eaten since, so I've left both as they are.`,
    ledgerUnreadable: "I couldn't check what you've eaten today just then, so I've left both as they are. Try again in a moment.",
    saveFailed: "I couldn't put them back just then, so nothing has changed. Try again in a moment.",
    halfSaved: "Only half of it went back — try again to finish it.",
  },
  /** The sheet's line under a failed tap. `partial`: something did land, so it must not say "nothing". */
  failureLine: (why: string, partial: boolean) =>
    partial ? `${cap(why.replace(/[.!?]+$/, ''))}.` : `Nothing was swapped — ${why.replace(/[.!?]+$/, '')}.`,
  /** Why nothing changed, as a clause with no full stop (see moreMealOptionsWhy). */
  why: {
    changed: 'your meals changed since I asked',
    saveFailed: "the swap didn't save",
    halfSaved: 'only half of the swap saved — try it again to finish it',
  },
} as const

/**
 * WHAT A NOTIFICATION SAYS, and it is the coach saying it.
 *
 * Ashley chose notifications on 17 Sep 2026. These live here rather than beside
 * the sending code for the reason every other card lead does: a notification is
 * the coach speaking, and a second place to write the coach's words is a second
 * voice. `test:coach-voice` and the coach exam can only grade what is in the
 * phrasebook.
 *
 * SHORT, because a phone truncates. Lower case and no exclamation marks, which
 * is the house voice everywhere else — a notification that shouts is a
 * different personality arriving in someone's pocket.
 *
 * NO NUMBERS EXCEPT THE STREAK, deliberately. A notification is read on a lock
 * screen, out of context, possibly days late; a figure quoted there is one the
 * app cannot promise is still true when it is read. The streak is the
 * exception because it IS the subject of its own line.
 */
export function notification(key: string, streakDays = 0): string {
  switch (key) {
    case 'session_feel': return 'how did that session actually feel?'
    case 'session_not_logged': return "today's session is still waiting — got twenty minutes?"
    case 'missed_yesterday': return 'yesterday got away from you. want to move it or let it go?'
    case 'week_gone_quiet': return "it's been a quiet week. shall we pick something small to start again?"
    case 'streak_at_risk': return `${streakDays} days in a row so far — today would keep it going.`
    case 'block_review': return "that's a block done. come and see what moved."
    case 'beat_target': return "you're beating the weights I set you. want them raised?"
    // A KEY WITH NO SENTENCE IS NOT A SENTENCE. Returning something generic
    // here would let a new moment ship with placeholder words nobody wrote,
    // which is exactly how a screen ends up speaking in a voice no one chose.
    default: return ''
  }
}

// ---------------------------------------------------------------------------
// ASKING
// ---------------------------------------------------------------------------

/**
 * `ask('take **Lateral Raises** out of Monday')`
 *   → `'Want me to take **Lateral Raises** out of Monday?'`
 *
 * Pass a bare verb phrase: no leading capital, no trailing punctuation. Both
 * are added here, so a caller cannot half-apply the house style.
 *
 * The opener is inlined rather than held in an exported constant. A constant
 * would have been the obvious way to let a gate compare the chips against the
 * cards — but nothing in the app would have imported it, and `test:no-dead-code`
 * is right to call that out: an export no caller reads is how GOAL_NOUN ended up
 * written and dead. A gate can call ask('x') and read the prefix off the result,
 * which is a stronger check anyway because it exercises the function.
 */
/**
 * A PERSONAL BEST, WITH ITS UNIT ATTACHED. One function, because the three
 * places that show a PB — the badge on the set row, the end-of-session
 * summary and Home's recent list — each used to print `${newWeight}kg` and
 * would have rendered a 12-rep best as "12kg". A number in the wrong unit
 * is worse than no number: it looks right.
 *
 * Ashley's ruling, 16 Sep 2026: at bodyweight the record is the most reps
 * in one set; once a belt goes on, the record is the added weight. Hers of
 * 17 Sep added a fourth: a best the estimate found shows the whole SET. So
 * the readings are four sentences, not one sentence with a variable.
 */
export type BestReading =
  | { kind: 'load'; weightKg: number }
  | { kind: 'added_load'; addedKg: number }
  | { kind: 'reps'; reps: number }
  /**
   * A best the ESTIMATE found, not the bar. You lifted less weight for more
   * reps and worked harder for it — real progress that a heaviest-ever record
   * cannot see. It shows the whole set, because the alternative is what this
   * used to do: fire on the estimate and then print the lighter weight on its
   * own, so someone whose best is 100kg read "95kg" labelled as a best.
   * Ashley's ruling, 17 Sep 2026, from three options.
   */
  | { kind: 'best_set'; weightKg: number; reps: number }

/**
 * ONE ARGUMENT, NOT A METRIC AND A LOOSE NUMBER. The old signature was
 * (metric, value) and every one of its three call sites re-derived `value`
 * with its own ternary over four fields — which is the bug surface, not the
 * renderer. A caller that picked the wrong field passed a valid number for
 * the wrong kind and this function had no way to know.
 */
export function personalBest(reading: BestReading): string {
  if (reading.kind === 'reps') return `${reading.reps} reps`
  if (reading.kind === 'added_load') return `+${reading.addedKg}kg`
  if (reading.kind === 'best_set') return `${reading.weightKg}kg × ${reading.reps}`
  return `${reading.weightKg}kg`
}

/**
 * The words that go beside a best_set reading, so both screens that show one
 * say the same thing. Kept here rather than written twice: two copies of a
 * four-word qualifier is two things to drift, and the drifted one is the one
 * nobody re-reads.
 */
/**
 * WHAT YOU DID LAST TIME, said so it cannot be read as an instruction.
 *
 * Ashley, 17 Sep 2026, looking at her own dumbbell rows: *"Last sets
 * prescribed were sets of 11 reps. Is thay correct at the end of a
 * exercise?"* Nothing had prescribed 11. The faint numbers in the boxes were
 * her OWN last session — 9, 11, 11 — shown in the same grey the app uses for
 * a hint, with nothing saying which they were. She read her history as a
 * prescription, and it is the only reading the screen supported.
 *
 * Her ruling, 18 Sep 2026, from three options: **mark them "last time"** —
 * the numbers stay in the boxes where her thumb is, and the row says what
 * they are. She rejected moving them out of the boxes to a line above the
 * sets (history one glance further away mid-set) and emptying the boxes
 * entirely (a number to type on every set instead of a tap).
 *
 * ONE ARGUMENT OVER A UNION, the same shape as personalBest above and for the
 * same reason: a reps count and a kilo figure are different quantities, and a
 * caller holding a loose number must not be able to render it as either.
 */
export type LoggedSetReading =
  | { kind: 'loaded'; weightKg: number; reps: number }
  | { kind: 'bodyweight'; reps: number }
  | { kind: 'added_load'; addedKg: number; reps: number }

export function lastTime(reading: LoggedSetReading): string {
  // NEVER A BARE COUNT. "last time 9" beside a weight box reads as 9kg;
  // the kind travels with the number, same rule as personalBest.
  if (reading.kind === 'bodyweight') return `last time bodyweight × ${reading.reps}`
  if (reading.kind === 'added_load') return `last time +${reading.addedKg}kg × ${reading.reps}`
  return `last time ${reading.weightKg}kg × ${reading.reps}`
}

/**
 * The bridge from a stored set to the reading above, for the same reason
 * `bestReadingOf` exists: the caller must not rebuild it with a ternary.
 * That exact shape is what put "12 kg" on a reps record — three call sites,
 * each with its own ternary, two of them wrong.
 *
 * The order of the branches is the whole content of this function. A belted
 * dip carries `is_bodyweight: true` AND an added load, so added load must be
 * tested first or it renders as a plain bodyweight set with its belt lost.
 * And a row with no weight is a bodyweight row whether or not the flag was
 * set — the flag arrived later than the rows, so history predates it.
 */
export function loggedSetReading(log: {
  weight_kg: number
  reps_completed: number
  is_bodyweight?: boolean | null
  added_load_kg?: number | null
}): LoggedSetReading {
  if (log.added_load_kg != null && log.added_load_kg > 0) {
    return { kind: 'added_load', addedKg: log.added_load_kg, reps: log.reps_completed }
  }
  if (log.is_bodyweight || !(log.weight_kg > 0)) {
    return { kind: 'bodyweight', reps: log.reps_completed }
  }
  return { kind: 'loaded', weightKg: log.weight_kg, reps: log.reps_completed }
}

/**
 * The heading over the swap options that clear every constraint except the
 * trainee's training style. Ashley's ruling, 18 Sep 2026: show them, below
 * the ones that match, with a line saying what they are.
 *
 * IT DOES NOT NAME THE STYLE, deliberately. The four style labels are phrases
 * ("Functional / athletic", "Combat / conditioning") that do not fit inside a
 * possessive, and a second copy of them here would be a second thing to drift.
 * There is exactly one training style on a profile, so "your training style"
 * points at it without ambiguity.
 */
/**
 * COOK ONCE, EAT TWICE — the two sentences that keep a deliberate repeat from
 * reading as an accidental one.
 *
 * On 19 Sep 2026 the app was fixed to stop serving the same meals every day.
 * Hours later it was taught to serve tonight's dinner again at lunch, on
 * purpose. From the outside those are the same thing, so each side of the pair
 * has to say which it is: the dinner promises the repeat before it happens,
 * and the lunch names where it came from. A repeat the app cannot explain is
 * indistinguishable from the bug.
 *
 * Both are here rather than inline so test:coach-voice and the coach exam can
 * grade them alongside every other sentence the app writes.
 */
export const COOK_ONCE = {
  /** On the dinner that will be cooked in double. */
  dinner: 'Cook both portions together — tomorrow\'s lunch is this.',
  /** On the lunch that came out of last night's pan. */
  lunch: 'Last night\'s dinner.',
} as const

export const OUTSIDE_YOUR_STYLE = 'Outside your training style'

export const BEST_SET_QUALIFIER = 'best set'

/**
 * The bridge for callers that hold a PRMetric and its already-chosen number —
 * Home's recent list, which is built from the PR cache's heaviest-ever
 * figures and therefore can never be the estimate case.
 *
 * It exists so that caller does not rebuild a reading with a ternary, which
 * is exactly the shape that put "12 kg" on a reps record. There is no
 * 'best_set' branch here ON PURPOSE: a metric alone cannot express it, so a
 * caller holding only a metric must not be able to claim one.
 */
export function bestReadingOf(metric: 'load' | 'added_load' | 'reps', value: number): BestReading {
  if (metric === 'reps') return { kind: 'reps', reps: value }
  if (metric === 'added_load') return { kind: 'added_load', addedKg: value }
  return { kind: 'load', weightKg: value }
}

/**
 * "Back Squat at 62.5kg" / "Press-Up at 15 reps" / "Chin-Up at +10kg" — a
 * record named in a sentence, with its unit, in ONE place.
 *
 * Four sentence builders (the Home tip, the coach's two nudges, and the text
 * handed to the coach) each wrote `${name} at ${weightKg}kg` off a shape that
 * carried only a weight — so a reps record, whose weight is legitimately 0,
 * came out as "Standing Band Hip Abduction at 0kg" (M16/L32, 9 Oct 2026). The
 * kind travels with the number now and none of them can drop it: the shape
 * they are handed has no `weightKg` to reach for.
 */
export interface RecordFact { exerciseName: string; metric: 'load' | 'added_load' | 'reps'; value: number }
export function recordPhrase(pr: RecordFact): string {
  return `${pr.exerciseName} at ${personalBest(bestReadingOf(pr.metric, pr.value))}`
}

export function ask(verbPhrase: string): string {
  const trimmed = verbPhrase.trim().replace(/[.?!:]+$/, '')
  return `Want me to ${trimmed}?`
}

/**
 * "Which exercise did you want to take out?" — the five hand-written variants
 * of this question the audit found, as one shape.
 *
 * The verb is the caller's because it is the only part that differs, and
 * because a generic "which one did you mean?" is worse coaching: it makes the
 * person remember what they just asked for.
 */
export function whichOne(noun: string, verbPhrase: string): string {
  return `Which ${noun} did you want to ${verbPhrase}?`
}

// ---------------------------------------------------------------------------
// WHEN IT CANNOT
// ---------------------------------------------------------------------------

/**
 * The plan has not arrived yet. Five verbatim copies of this existed.
 *
 * NOT an apology: nothing is wrong, the data is in flight. An apology here
 * teaches people that the app is fragile.
 */
export const NOT_LOADED_YET = "Your plan hasn't loaded yet — give it a moment and ask me again."

/** The week specifically, which fails differently from the whole plan. */
export const WEEK_NOT_LOADED = "I can't see this week on your plan just now — give it a moment and ask me again."

/**
 * A write did not land. EIGHT wordings of this existed across 13 call sites —
 * "could not be saved", "didn't save", "Could not save this", with and without
 * a named subject and with three different tails.
 *
 * ONE SENTENCE, AND IT NAMES THE THING. Saying what failed matters more than
 * saying it warmly: a bare "that didn't save" leaves a person unsure which of
 * two taps to repeat.
 *
 * IT DELIBERATELY DOES NOT SAY "NOTHING HAS CHANGED", and that was a real bug
 * caught before it shipped. The first draft did, because it reads as reassuring
 * and is true at most call sites. It is false at
 * `pending-action-executor.ts:1025`: the shorten path pushes its result into
 * `landed` and returns the new mesocycle BEFORE attempting the save, so the
 * session on screen really is shorter and only the persistence failed. That
 * sentence would have contradicted the landed line printed directly beside it —
 * the app claiming a fact about its own state that its own receipt disproves,
 * which is the exact defect class the 15 Sep claim guard exists for.
 *
 * What is true at all 13 sites is only that the save failed. Whether anything
 * changed locally is knowable from the receipt's own `landed` list, so the
 * surface that has that list says it, and this sentence does not guess.
 */
/**
 * HOW TO TRAIN A SUPERSET, said once under the pair rather than on each row.
 *
 * The first half has always been there. The SECOND half is Ashley's handoff,
 * 19 Sep 2026: when a member of the pair has a build-up, the footnote says so
 * — because the alternation instruction, read literally, tells somebody to
 * alternate their warm-up sets with the other exercise, and that is not how
 * a superset is run. You ramp the loaded lift on its own, then start pairing.
 *
 * DECIDED HERE UNDER THE CSCS DELEGATION, and the basis rather than the
 * assertion: a build-up exists to prepare ONE movement's tissue and groove
 * its pattern at rising load. Alternating it with an unrelated exercise adds
 * fatigue and time between the very steps that are meant to run close
 * together, and the second exercise gets a warm-up it did not need. The
 * pairing begins once the ramp has done its job.
 *
 * Empty string when nothing ramps, so the caller renders one line rather
 * than a line with a trailing separator — the shape `couldNot` uses below.
 */
export function supersetAlternation(rampedLabels: string[] = []): string {
  const base = 'alternate — no rest between'
  if (rampedLabels.length === 0) return base
  const names = rampedLabels.length === 1
    ? rampedLabels[0]
    : `${rampedLabels.slice(0, -1).join(', ')} and ${rampedLabels[rampedLabels.length - 1]}`
  return `${base} · ramp ${names} first, then start the pairing`
}

export function didNotSave(thing: string): string {
  return `${thing} didn't save. Check your connection and give it another go.`
}

/**
 * WHY SOMETHING ON THE "DIDN'T SAVE" LIST DID NOT SAVE, in words — H20, 9 Oct
 * 2026.
 *
 * The card printed the failure exactly as the browser threw it: the tester
 * read "Dumbbell Floor Press · set 4 · TypeError: Failed to fetch". Nobody
 * should have to know what a TypeError is to find out whether their set is
 * safe, and `queue-health.ts` already said so about its own field ("the
 * underlying failure ... never the primary message") — the card ignored it.
 *
 * TWO SENTENCES, because there are two situations a person can act on
 * differently: there was no connection (try again when there is one), or the
 * app could not save it (trying again may not help). Everything else the raw
 * text might say — a constraint name, a column, a status — is for the console,
 * which still gets it.
 *
 * WHICH of the two applies is decided by `queue-health.plainSyncError`, which
 * can see the failure; this holds the words and nothing else, so the
 * phrasebook stays the leaf `test:coach-voice` §1 keeps it.
 */
export function didNotSaveReason(noConnection: boolean): string {
  return noConnection ? 'There was no connection when this was saved.' : "The app couldn't save this."
}

/**
 * What is true of ANYTHING on that list, whichever queue it came from: every
 * one of them keeps a refused item on the phone until it is retried or thrown
 * away. The same sentence the cardio notice has used since 30 Aug, so the two
 * surfaces that say it cannot drift.
 */
export const STILL_ON_THIS_DEVICE = 'Still saved on this device, but not in your history yet.'

/**
 * THE SESSION SCREEN WHEN IT CANNOT REACH THE SERVER — H20.
 *
 * `known` is the claim's licence. "Your sets are safe" is only said when the
 * rows on screen are ones this phone holds or the server has confirmed; when
 * the phone has never managed to read the day, it does not know what is saved
 * and says the one thing it does know — that whatever is logged now is kept.
 */
export function reconnectingLine(known: boolean): string {
  return known
    ? 'Reconnecting — your sets are safe.'
    : "Reconnecting — can't check today's sets yet. Anything you log now is kept on this phone."
}

/**
 * "3 working sets · 2 logged" — the second half, which is only a number when
 * the phone has something to count from. On a reload with a dead connection
 * and nothing remembered, "0 logged" is not a fact, it is the absence of one;
 * that is what the tester read as six lost sets.
 */
export function loggedCountLabel(count: number, state: { known: boolean; loading: boolean }): string {
  if (state.known || count > 0) return `${count} logged`
  return state.loading ? 'checking what’s logged…' : 'can’t check what’s logged yet'
}

/** Under a set row that has not reached the server yet. */
export const SET_WAITING_TO_SEND = 'on this phone, waiting to send'

/**
 * What the app says the first time a lift is logged, where it used to raise a
 * trophy. Decided unprompted on 9 Oct 2026 (reversible — the tracer's owner
 * question, default taken as instructed): nothing special beyond this one
 * quiet line. A first log is where a record STARTS; it is not one.
 */
/**
 * What the streak is CALLED, after its number: "2 sessions in a row".
 *
 * It said "2 days streak" over a count of planned sessions done — two
 * sessions a week apart are a streak of 2 and are not two days. Decided
 * unprompted on 9 Oct 2026, reversible (the owner question's default): keep
 * the idea of a streak, name the unit it actually counts.
 */
export function streakLabel(count: number): string {
  return `${count === 1 ? 'session' : 'sessions'} in a row`
}

/**
 * THE QUESTION BEFORE FINISHING WITH SETS STILL TO DO (M12, 9 Oct 2026).
 *
 * One tap on Finish ended a session at 9 of 24 sets with nothing asked. The
 * layout design drew this sheet (LAYOUT-DESIGN.md §3.7 — the partial variant
 * "lists the unlogged remainder ... without judgment") and it was never
 * built. Decided unprompted, reversible, from the brief's own wording: asked
 * only when planned sets remain; never when everything is done.
 */
export const FINISH_CHECK = {
  title: (done: number, planned: number) => `${done} of ${planned} sets done — finish anyway?`,
  finish: 'Finish',
  keepGoing: 'Keep going',
} as const

/** "+1 extra" — sets beyond the plan, said beside the fraction and never inside it. Empty when there are none. */
export function extraSetsNote(extraSets: number): string {
  return extraSets > 0 ? `+${extraSets} extra` : ''
}

/** "7/9 planned · +1 extra" — planned sets done over planned sets, and anything beyond the plan beside it. */
export function setsFraction(s: { setsCompleted: number; setsPrescribed: number; extraSets: number }): string {
  const extra = extraSetsNote(s.extraSets)
  return `${s.setsCompleted}/${s.setsPrescribed} planned${extra ? ` · ${extra}` : ''}`
}

/**
 * Finish tapped with cardio logged and no set. The card said "Nothing logged"
 * over a walk it had just listed as saved. Decided unprompted, reversible
 * (X1's owner question, option b): say what IS saved, without deciding that a
 * walk closes a lifting day.
 */
export function noSetsButCardio(activities: string[]): string {
  const what = activities.length === 1 ? activities[0].toLowerCase() : 'cardio'
  return `No sets logged — your ${what} is saved.`
}

/** The sync badge, in the words the waiting row itself uses ("on this phone, waiting to send"). It read "Saved Offline (2 sets queued)". */
export function setsWaitingToSend(count: number): string {
  return `${count} set${count === 1 ? '' : 's'} waiting to send`
}

export const FIRST_LOG_NOTE = 'First time logged — this is your baseline'
/**
 * Under an empty weight box whose faint number is the set she has JUST done,
 * carried down (tester's M11, 9 Oct 2026) — not last time's and not the plan's.
 * The kind travels with the number, as everywhere: a bodyweight set says so
 * rather than printing a 0.
 */
export function sameAsSetAbove(carry: { kg: number; isBodyweight: boolean; added?: boolean; fromSet: number }): string {
  return carry.isBodyweight
    ? `same as set ${carry.fromSet} · bodyweight`
    : `same as set ${carry.fromSet} · ${carry.added ? '+' : ''}${carry.kg}kg`
}
/** Under a set row the server refused, beside its Retry. */
export const SET_DID_NOT_SAVE = "didn't save"

/**
 * The narrator. The audit found "I", "We", "Couldn't" and the passive in one
 * file; a coach is one person, and that person is "I".
 */
export function couldNot(verbPhrase: string): string {
  return `I couldn't ${verbPhrase.trim().replace(/[.?!]+$/, '')}.`
}

// ---------------------------------------------------------------------------
// HOW FAR A CHANGE REACHES
//
// Three meanings, previously written six ways between them. The distinction is
// real coaching information — "just today" and "just this week" are different
// promises — so the fix is one sentence each, not one sentence for all three.
// ---------------------------------------------------------------------------

export const SCOPE = {
  /** Today's session only; tomorrow is untouched. */
  today: (day: string) => `Just today — ${day} is back to normal next week.`,
  /** This week only; the block continues as planned. */
  thisWeek: (day: string) => `Just this week — ${day} is back to normal from next week.`,
  /** Every remaining week of the current block. */
  restOfBlock: 'For the rest of this block — every week from here, not just today.',
  /** Everything already recorded survives. Said wherever a rebuild is offered. */
  historyKept: "Anything you've already logged stays exactly as it is.",
} as const

// ---------------------------------------------------------------------------
// THE PER-GOAL VOCABULARY
//
// CLAUDE.md lists "the per-goal phrasebook as one graded file" as STILL TO
// BUILD. Half of it was built and DEAD: `edit-tradeoff.ts:174` defines
// GOAL_NOUN with exactly one use site, inside a `reason` string that every
// reader re-wraps and nothing renders. Those words had never reached a person.
//
// Revived here, live, and widened to the four clauses the cards actually need.
// The four goals are fat loss, hypertrophy, functional and conditioning —
// there is no "strength" goal, which is why the strength vocabulary keys off
// the PHASE elsewhere and not off this table.
// ---------------------------------------------------------------------------

export interface GoalTerms {
  /** What they are training for, as they would say it. */
  noun: string
  /** Why the volume for a muscle group matters, in this goal's own terms. */
  whyVolume: (group: string) => string
  /** Why protein matters here specifically. */
  whyProtein: string
  /** The direction that works against this goal, named plainly. */
  wrongWay: string
}

export const GOAL_TERMS: Record<FitnessGoal, GoalTerms> = {
  hypertrophy: {
    noun: 'building muscle',
    whyVolume: g => `${g} grows from the work you do for it`,
    whyProtein: 'muscle is built from it — under-eating protein wastes the training',
    wrongWay: 'less work for a muscle than the week before',
  },
  fat_loss: {
    noun: 'losing fat while keeping muscle',
    whyVolume: g => `that work is what keeps ${g} on you while you're eating less`,
    whyProtein: "it's what stops the weight you lose coming off your muscle",
    wrongWay: 'cutting training volume at the same time as calories',
  },
  functional: {
    noun: 'getting stronger and moving well',
    whyVolume: g => `${g} carries a lot of what you're training for`,
    whyProtein: 'strength work needs something to rebuild with',
    wrongWay: 'dropping the movements that carry the most',
  },
  conditioning: {
    noun: 'your conditioning',
    whyVolume: g => `it's work your week is built around, and ${g} does a lot of it`,
    whyProtein: 'it keeps the muscle you have while you work on the engine',
    wrongWay: 'losing the sessions that build the engine',
  },
}

// ---------------------------------------------------------------------------
// RECEIPTS
//
// 44 titles across 20 confirm branches. The audit's finding was register
// collapse: bare verbs ('Swapped') beside a sentence ('Session shortened for
// today') beside a judgement ('Never again') — four lengths and two points of
// view in one column a person reads one row of at a time.
//
// THE RULE: a success is what HAPPENED, in one or two words, past tense. A
// failure is what DIDN'T, in the first person. The pairing is the point, which
// is why they live in one object and a gate can demand both.
// ---------------------------------------------------------------------------

export interface ReceiptTitles {
  /** Past tense, 1-3 words. What happened. */
  done: string
  /** First person. What didn't. */
  failed: string
}

export const RECEIPTS: Record<string, ReceiptTitles> = {
  propose_exercise_swap: { done: 'Swapped', failed: "I couldn't swap that" },
  propose_exercise_add: { done: 'Added', failed: "I couldn't add that" },
  propose_exercise_remove: { done: 'Removed', failed: "I couldn't remove that" },
  propose_exercise_reorder: { done: 'Reordered', failed: "I couldn't move that" },
  propose_exercise_ban: { done: 'Banned', failed: "I couldn't ban that" },
  propose_session_shorten: { done: 'Shortened', failed: "I couldn't shorten it" },
  propose_session_rebuild: { done: 'Rebuilt', failed: "I couldn't rebuild it" },
  propose_cardio_session: { done: 'Scheduled', failed: "I couldn't add that session" },
  propose_volume_change: { done: 'Adjusted', failed: "I couldn't adjust it" },
  propose_schedule_change: { done: 'Rescheduled', failed: "I couldn't change the schedule" },
  propose_session_length: { done: 'Sessions resized', failed: "I couldn't change your session length" },
  propose_style_change: { done: 'Restyled', failed: "I couldn't change the style" },
  // CAUGHT BY THIS FILE'S OWN GATE, 17 Sep 2026: my first title was "Rebuilt
  // for your new goal", a sentence where every sibling is a word or two, and
  // test:coach-voice failed it on the three-word ceiling. The ceiling is
  // right — a receipt says what happened, and the card above it already said
  // what that means.
  propose_goal_change: { done: 'Goal changed', failed: "I couldn't change your goal" },
  propose_rest_day: { done: 'Marked as rest', failed: "I couldn't mark that day" },
  propose_missed_session: { done: 'Marked as missed', failed: "I couldn't mark that day" },
  propose_session_move: { done: 'Moved', failed: "I couldn't move that session" },
  propose_session_activity_swap: { done: 'Swapped', failed: "I couldn't swap that day" },
  propose_injury_adaptation: { done: 'Adapted', failed: "I couldn't adapt it" },
  propose_injury_as_lasting: { done: 'Saved', failed: "I couldn't save that" },
  propose_injury_recovered: { done: 'Cleared', failed: "I couldn't clear that" },
  propose_equipment_adaptation: { done: 'Adapted', failed: "I couldn't adapt it" },
  propose_concurrent_activity: { done: 'Added', failed: "I couldn't add that" },
  propose_meal_swap: { done: 'Swapped', failed: "I couldn't swap that meal" },
  propose_meal_move: { done: 'Moved', failed: "I couldn't move that meal" },
  propose_meal_addition: { done: 'Added', failed: "I couldn't add that meal" },
  propose_meal_food_add: { done: 'Added', failed: "I couldn't add that" },
  propose_meal_food_remove: { done: 'Removed', failed: "I couldn't remove that" },
  propose_meal_food_replace: { done: 'Replaced', failed: "I couldn't replace that" },
  propose_meal_food_resize: { done: 'Resized', failed: "I couldn't change the amount" },
  propose_custom_meal: { done: 'Saved', failed: "I couldn't save that meal" },
  propose_meal_refit: { done: 'Resized', failed: "I couldn't resize your meals" },
  propose_meal_top_up: { done: 'Added', failed: "I couldn't add more meals" },
  propose_meal_day_move: { done: 'Swapped over', failed: "I couldn't swap those meals" },
}

// ---------------------------------------------------------------------------
// SAFETY TEXT LIVES IN edit-reason.ts, AND THIS FILE DOES NOT TOUCH IT.
//
// Ashley's pain ruling of 15 Sep 2026 is a rule about the APP: every surface
// where somebody says something hurts asks the same three questions, and the
// third answer names a professional and changes nothing. A second copy of those
// words would be a second thing to drift, and the half that drifted would be
// the half nobody re-read.
//
// THIS FILE FIRST RE-EXPORTED HURT_KINDS AND RED_FLAG_ADVICE, and that was
// wrong twice over. Nobody imported them from here — both screens take them
// straight from edit-reason, as they always did — so the re-export was dead.
// And it was not free: it was this module's only runtime edge, and test:bundle
// caught the app's re-download tipping to exactly its ceiling. Ashley's ruling
// of 14 Sep on that number was to take weight OFF the first-paint path rather
// than raise the ceiling a second time, so it came off.
//
// The rule it was meant to serve is unchanged and now sits where it belongs:
// test:coach-voice §5 asserts this file holds no copy of the safety text at
// all. That was always the real property; the re-export was a mechanism for it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WHAT PICKING KETO ACTUALLY BUYS — Ashley's ruling, 20 Sep 2026.
//
// Keto and Low-carb are offered at setup and DO filter food: bread, pasta,
// rice, potatoes, oats, beans and added sugar are all refused by
// `FORBIDDEN_TAGS`, measured rather than assumed. What they do NOT do is
// change the daily numbers — `computeMacroSplitTargets` derives carbs as the
// REMAINDER of calories after protein and fat, with a 50g floor, and
// `FAT_PERCENT_RANGE` is deliberately capped at 0.35 so the split can never be
// forced into a ketogenic shape through the wrong derivation order. Measured
// the same day: a keto profile's carb target is 150-370g, i.e. 25-57% of
// energy, against the under-50g/under-10% a ketogenic diet means.
//
// Her ruling, from four options — say it on the setup screen — over building a
// real ketogenic derivation, over removing Keto from the list, and over
// leaving it (where the coach tells the truth only when asked, and nothing
// says it where the choice is made).
//
// TWO THINGS THIS SENTENCE DELIBERATELY DOES NOT CLAIM, both measured before
// it was written:
//   - It does not say "sugary fruit". The filter blocks DRIED fruit (raisins,
//     dates, figs, dried apricots) and lets fresh banana, grapes and mango
//     through — so the coach prompt's own keto rule names three fruits the
//     code-level guard permits. Claiming them here would be the app asserting
//     a filter it does not have.
//   - It does not say "yet". "Not a keto split yet" is a promise to build one,
//     and nobody has decided to.
// ---------------------------------------------------------------------------

/** The two diets the food filter honours and the daily targets do not. */
const MACRO_BLIND_DIETS: Record<string, string> = { keto: 'Keto', 'low-carb': 'Low-carb' }

/**
 * The caveat for a dietary selection, or null when nothing selected needs one.
 * Returns null for every other diet — vegan, the allergen lanes and the rest
 * are enforced by the same ingredient filter AND need no target change, so
 * they are honoured in full and must not carry a warning that implies
 * otherwise.
 */
export function dietTargetCaveat(selected: readonly string[] = []): string | null {
  const named = Object.keys(MACRO_BLIND_DIETS)
    .filter(key => selected.includes(key))
    .map(key => MACRO_BLIND_DIETS[key])
  if (named.length === 0) return null
  const subject = named.join(' and ')
  const verb = named.length > 1 ? 'keep' : 'keeps'
  const split = named.length > 1 || named[0] === 'Keto' ? 'a keto split' : 'a low-carb split'
  return `${subject} ${verb} bread, pasta, rice, potatoes, beans and added sugar out of your meals — but not fresh fruit. Your daily carb target stays a standard one, not ${split}.`
}
