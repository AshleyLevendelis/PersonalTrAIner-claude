// ---------------------------------------------------------------------------
// WHY ARE YOU DROPPING THIS? — the question, its answers, and where each one
// goes.
//
// `docs/how-the-app-talks-about-a-change.md` §3 calls this "the single
// highest-value change", and the argument is short: "the bench is busy", "my
// shoulder hurts" and "I hate this exercise" are three different problems, and
// without the reason all three are answered with the same swap. Two of those
// three answers are wrong.
//
// THE QUESTION WAS ALREADY BEING ASKED. Removing a main lift in a strength
// block has said this since 14 Sep 2026 (edit-tradeoff.ts, case 2):
//
//     "…What's going on with it — is it the exercise itself, or something
//      else?"
//
// and offered three chips — Swap it instead / Just today / Do it anyway — none
// of which answers it. So this module is not a new question bolted on beside
// the trade-off. It is the missing ANSWER SET for one the app already asks,
// which is also why there is never a second question: the reason chips ARE the
// tier-2 chips wherever both apply.
//
// FOUR CHIPS PER VERB, NOT SIX. §3 lists six reasons, and two of them are
// already marked as belonging to one verb ("don't have it (swap only)", "too
// tired (remove/lighter)"). Splitting the rest the same way gives four each,
// which is also what the rest of the app can render: the coach's own prompt
// caps a chip row at "2-4 options, each under 4 words" and `askText` slices to
// four. A six-chip row would have been silently truncated to four by
// machinery neither surface controls.
//
// THE CHIPS ARE `TradeoffAlternative`s, deliberately. That shape already flows
// through `askText` into the `[QUICK_REPLIES: …]` channel on the coach side and
// through ProposalCard's alternatives, so no new plumbing exists to go wrong.
// `label` is what the button says AND what gets sent as a chat message
// (ChatAssistant's handleQuickReply puts the label in the composer), so labels
// are written as things a person would actually type.
//
// NOTHING HERE DECIDES ANYTHING ABOUT SAFETY. `hurts` routes to the injury
// path, and what that path then asks is the caller's business — see
// `HURT_KINDS` below and Ashley's 15 Sep 2026 ruling recorded with it.
// ---------------------------------------------------------------------------

import type { TradeoffAlternative } from './tradeoff-shape'

/** The verb the person reached for. Only these two ask why. */
export type ReasonedEditKind = 'swap' | 'remove'

/**
 * The six answers from §3. The codes are stable; the wording is not, which is
 * why every surface reads its words from here rather than writing its own.
 */
export type EditReason = 'busy' | 'dislike' | 'hurts' | 'no_time' | 'no_kit' | 'tired'

/**
 * Where a reason goes. Each names a capability that ALREADY EXISTS on both
 * surfaces — this module routes, it does not build.
 *
 *   swap_today       the ordinary swap, scope pinned to today
 *   swap_block       the ordinary swap, scope pinned to the rest of the block
 *   ban              the swap plus a permanent dislike, so it never returns
 *   injury           the triage below, then substitute or rebuild
 *   shorten          shortenDayTo — the main lift survives, accessories go
 *   lighter          adjustDayVolume down, today only
 *   equipment        the equipment adaptation
 */
export type ReasonRoute =
  | 'swap_today' | 'swap_block' | 'ban' | 'injury' | 'shorten' | 'lighter' | 'equipment'

export interface ReasonSpec {
  reason: EditReason
  route: ReasonRoute
  /** The chip. `label` is both the button text and the words sent to the coach. */
  chip: TradeoffAlternative
  /**
   * The sentence the resulting card adds, from §3's last column. Empty string
   * where §3 says "nothing extra" — an empty string, not null, so a caller
   * cannot accidentally render "null" and a gate can tell "deliberately
   * silent" from "forgot to write one".
   */
  cardLine: string
}

/**
 * Every reason, once. Order within a verb is the order the chips render, and
 * it is not arbitrary: the cheapest, most common answer leads, and `hurts`
 * sits third on both so it lands in the same place whichever verb you came
 * from — muscle memory on a gym floor is worth more than a tidy frequency
 * sort.
 */
const SPECS: Record<EditReason, ReasonSpec> = {
  busy: {
    reason: 'busy',
    route: 'swap_today',
    chip: {
      label: "It's busy or broken",
      note: 'just for today',
      prompt: 'the machine is taken — swap it for today',
    },
    // §3: "Nothing extra — Tier 0". A one-day swap around a taken machine
    // costs the plan nothing, and saying so anyway would be the nagging the
    // 14 Sep decision exists to prevent.
    cardLine: '',
  },
  dislike: {
    reason: 'dislike',
    route: 'ban',
    chip: {
      label: "I don't like it",
      note: 'and not again',
      prompt: "I don't like this exercise — replace it for good",
    },
    cardLine: "I'll keep it out of your plans from now on.",
  },
  hurts: {
    reason: 'hurts',
    route: 'injury',
    chip: {
      label: 'It hurts',
      note: 'let me ask about that',
      prompt: 'this one hurts',
    },
    cardLine: '',
  },
  no_time: {
    reason: 'no_time',
    route: 'shorten',
    chip: {
      label: "I'm short on time",
      note: 'shorten today instead',
      prompt: "I'm short on time today",
    },
    cardLine: 'Your main lift stays as it is — the accessory work at the end goes.',
  },
  no_kit: {
    reason: 'no_kit',
    route: 'equipment',
    chip: {
      label: "I haven't got the kit",
      note: 'rebuild around what you have',
      prompt: "I haven't got the equipment for this",
    },
    cardLine: "Tell me what you have and I'll build around it.",
  },
  tired: {
    reason: 'tired',
    route: 'lighter',
    chip: {
      label: "I'm wiped today",
      note: 'lighter, just today',
      prompt: "I'm too tired for this today",
    },
    cardLine: 'Today only — back to normal next week.',
  },
}

/**
 * WHICH FOUR, PER VERB.
 *
 * Swap and remove genuinely have different answer sets, and §3 already said so
 * for two of the six. The rest follow the same test: would this reason make
 * someone reach for THIS verb? Nobody swaps an exercise because they are short
 * on time — a swap takes exactly as long. Nobody removes one because the
 * machine is taken — they would put something else there, which is a swap.
 */
const BY_KIND: Record<ReasonedEditKind, EditReason[]> = {
  swap: ['busy', 'dislike', 'hurts', 'no_kit'],
  remove: ['no_time', 'tired', 'hurts', 'dislike'],
}

/** Every reason this verb offers, in render order. */
export function reasonsFor(kind: ReasonedEditKind): ReasonSpec[] {
  return BY_KIND[kind].map(r => SPECS[r])
}

/**
 * The chips, in the shape `askText` and ProposalCard already render.
 *
 * Exactly four, which is the cap both of those enforce — so what is written
 * here is what appears, rather than what survives a slice somewhere else.
 */
export function reasonChipsFor(kind: ReasonedEditKind): TradeoffAlternative[] {
  return reasonsFor(kind).map(s => s.chip)
}

/** Where one reason goes. */
export function routeFor(reason: EditReason): ReasonRoute {
  return SPECS[reason].route
}

/** What the card says once the reason is known. Empty means deliberately silent. */
export function cardLineFor(reason: EditReason): string {
  return SPECS[reason].cardLine
}

/** The reason a chip label belongs to, for the surface that only has the text back. */
export function reasonForLabel(label: string): EditReason | null {
  const want = label.trim().toLowerCase()
  const hit = (Object.keys(SPECS) as EditReason[]).find(
    r => SPECS[r].chip.label.toLowerCase() === want || SPECS[r].chip.prompt.toLowerCase() === want,
  )
  return hit ?? null
}

/** The question itself. One sentence, the exercise named, no jargon. */
export function reasonQuestion(kind: ReasonedEditKind, exerciseName: string): string {
  return kind === 'swap'
    ? `Happy to swap ${exerciseName} out. What's going on with it?`
    : `Happy to take ${exerciseName} out. What's going on with it?`
}

// ---------------------------------------------------------------------------
// THE HURTS BRANCH — Ashley's ruling, 15 Sep 2026, from three options:
// **ask, then act.**
//
//   "A niggle today"        ease that area off for a few days, then it comes
//                           back on its own
//   "It's been there a while"  add it to her injuries so every future plan
//                           avoids it
//   "Sharp / one-sided / getting worse"  a professional, and NO PLAN CHANGE
//
// Rejected: acting today-only and recording nothing (the app never learns and
// she has to say it again next session), and treating every ache as an injury
// (one sore session rewrites the rest of the block).
//
// WHY ONE QUESTION WITH THREE ANSWERS rather than a safety screen first. My
// call. Opening with "is it sharp?" is an alarming way to answer "it hurts",
// and it costs a tap on the common case to serve the rare one. Three answers
// on one question loses nothing: the dangerous branch is still unmissable, and
// it is still the only one that cannot reach the plan.
//
// THIS IS THE SAME LINE THE COACH ALREADY HOLDS in words — its injury tools
// require both the area and the niggle-vs-lasting answer before they may be
// called, and say "never call this for sharp/joint/one-sided/worsening pain —
// redirect to a professional instead, no tool call". The screen now holds it
// in code.
// ---------------------------------------------------------------------------

export type HurtKind = 'niggle' | 'lasting' | 'red_flag'

export interface HurtOption {
  kind: HurtKind
  label: string
  note: string
}

export const HURT_KINDS: HurtOption[] = [
  { kind: 'niggle', label: 'Just a niggle today', note: "I'll ease that area off for a few days" },
  { kind: 'lasting', label: "It's been there a while", note: "I'll keep it out of your plans" },
  { kind: 'red_flag', label: 'Sharp, one-sided or getting worse', note: 'worth getting looked at' },
]

/**
 * HOW LONG A NIGGLE EASES OFF FOR. Seven days.
 *
 * My call, and the reasoning is that the screen has no free text to say
 * otherwise: the coach can hear "a few days" or "a fortnight" and pass
 * `duration_days` through, a row of buttons cannot without becoming a second
 * question. A week is the modal answer, it spans one training cycle of every
 * split the app builds, and it is undoable — `revertAdaptation` ends one early
 * from the same place that started it.
 */
export const NIGGLE_EASE_OFF_DAYS = 7

/**
 * HOW LONG A KIT CHANGE LASTS. Seven days, for the same reason and with one
 * more: "I haven't got the kit" is nearly always a trip, and a permanent
 * answer to a temporary problem is how somebody comes home to a bodyweight
 * plan. Changing it for good is the Profile screen's Equipment row, which is a
 * more deliberate act than a chip on a sheet.
 */
export const EQUIPMENT_SWITCH_DAYS = 7

/**
 * What the app says when someone picks the red-flag answer.
 *
 * NOTHING IS CHANGED AND NOTHING IS RECORDED, and both halves matter. Not
 * changed, because guessing at a plan adaptation for pain nobody has examined
 * is exactly the line the app holds everywhere else. Not recorded, because a
 * row in `injuries` would quietly reshape every future plan off a symptom
 * description, which is a diagnosis this app is not allowed to make.
 */
export const RED_FLAG_ADVICE =
  "That's worth getting looked at rather than trained around — sharp, one-sided or worsening pain is a physio's call, not mine. I've left your plan exactly as it is. Once you know what it is, tell me and I'll build around it properly."
