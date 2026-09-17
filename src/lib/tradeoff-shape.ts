// ---------------------------------------------------------------------------
// THE SHAPE OF A VERDICT, AND WHAT TO DO WITH ONE — with no opinion about
// exercise or food.
//
// Split out of edit-tradeoff.ts on 14 Sep 2026, and the reason is measured
// rather than aesthetic. Wiring the Nutrition screen's food sheet to the
// trade-off made it import `applyTradeoff` and `downgradeToCard` — two pure
// functions over a Tradeoff — and that dragged edit-tradeoff's OWN imports into
// the main app chunk behind them: the 5,000-line exercise CATALOGUE and the
// plan-quality SCORER. The app chunk went 920 -> 944 kB and test:bundle caught
// it.
//
// Raising the budget would have been the wrong fix twice over. The main chunk
// is what every person downloads before they see anything, and a nutrition
// sheet has no business depending on the exercise catalogue at all — the size
// was the symptom, the dependency was the defect.
//
// So the VERDICT and its plumbing live here, where nothing heavy is needed.
// The exercise ASSESSMENT stays in edit-tradeoff.ts, which is the only thing
// that needs the catalogue and the scorer, and is only reached from the coach.
// edit-tradeoff re-exports all of this, so every existing import still works.
// ---------------------------------------------------------------------------

/** 0 free · 1 costs something · 2 against the goal. Unsafe is refused elsewhere. */
export type EditTier = 0 | 1 | 2

/** 'today' touches this week only; 'permanent' reaches the rest of the block. */
export type EditScope = 'today' | 'permanent'

export interface TradeoffAlternative {
  label: string
  note: string
  /** What tapping it asks for, in the user's words — so one list serves the card and the screen. */
  prompt: string
}

export interface Tradeoff {
  tier: EditTier
  /**
   * What it costs, in the goal's own terms. One sentence. Null at tier 0.
   * Rendered `warn` on the card at tier 1, and inside the question at tier 2.
   */
  cost: string | null
  /** The cheaper route. Empty when there genuinely isn't one. */
  alternatives: TradeoffAlternative[]
  /**
   * TIER 2 ONLY. The question the coach asks BEFORE a card exists. Null at
   * every other tier. The caller is responsible for offering "do it anyway"
   * alongside — see DO_IT_ANYWAY.
   */
  question: string | null
  /**
   * Why this tier, for the log and the gate. NEVER SHOWN. A reason string on
   * screen is the app explaining its own internals in front of someone.
   */
  reason: string
}

/**
 * The chip that must accompany every tier-2 question. Exported rather than
 * written out at each call site, because "the change is exactly one tap
 * further away, never blocked" is the whole of the decision and a call site
 * that forgot this chip would quietly turn an ask into a block.
 */
export const DO_IT_ANYWAY = 'Do it anyway'

export interface TradeoffCardFields {
  implications?: { severity: 'info' | 'warn'; text: string }[]
  alternatives?: TradeoffAlternative[]
}

/**
 * The tier-1 sentence, on the card, in the same amber the balance cost uses.
 *
 * ONE AMBER LINE, NOT TWO — and this is a correction, made 14 Sep 2026 when
 * `verify:swap-request` went red and was right to. The first version appended,
 * on the reasoning that the balance cost is what the app COULD NOT FIX and
 * this is what the edit COST, so a person needs both. On a real card that read:
 *
 *   That leaves your week push-heavy — 5 pushing sets to 3 pulling.
 *   Your back goes from 14 sets this week to 9 — back grows from the work
 *   you do for it.
 *
 * Which is the same fact twice: the back work leaving IS why the week went
 * push-heavy. Two amber lines about one edit is the "a list is not a nudge"
 * failure `macro-shortfall.ts` already names, and it is exactly what
 * `docs/how-the-app-talks-about-a-change.md` §5 forbids — "never the same
 * warning twice".
 *
 * So the trade-off's cost REPLACES an existing warning rather than joining it:
 * both describe the same edit, and the goal's terms are the more useful of the
 * two. When the trade-off has nothing to say, the balance cost stands exactly
 * as it did before — nothing is lost, it is chosen between.
 *
 * INFO lines are untouched. "Load recomputed once you confirm" and "I'll trim
 * a set on Sunday to keep your week balanced" are what the app DID, not what
 * it cost, and a person needs those alongside.
 */
export function applyTradeoff<T extends TradeoffCardFields>(diff: T, t: Tradeoff): T {
  if (t.tier === 0 || !t.cost) return diff
  const kept = (diff.implications ?? []).filter(i => i.severity !== 'warn')
  return {
    ...diff,
    implications: [...kept, { severity: 'warn' as const, text: t.cost }],
    // The existing alternatives win their places: a meal removal's verified
    // swaps are specific to the food that left, and this must not push them
    // off the card.
    alternatives: [...(diff.alternatives ?? []), ...t.alternatives],
  }
}

/**
 * The tier-2 question, as a chat turn — with the chips the existing
 * `[QUICK_REPLIES: ...]` pipeline already extracts.
 *
 * NO NEW PLUMBING, and that is deliberate: the coach has rendered chips from
 * this tag since the equipment question, so a tier-2 ask arrives through the
 * path that is already proven rather than a second one written for it.
 *
 * DO_IT_ANYWAY IS ALWAYS LAST AND ALWAYS PRESENT. It is the whole of the
 * decision — the change is one tap further away, never blocked — so it is
 * added here rather than left to each call site to remember.
 */
export function askText(t: Tradeoff): string {
  if (t.tier !== 2 || !t.question) return ''
  // THE SLICE COMES BEFORE THE ESCAPE CHIP, NOT AFTER IT. Corrected 15 Sep
  // 2026, found while giving the main-lift question its reason chips.
  //
  // This used to append DO_IT_ANYWAY and then slice the whole list to four —
  // so a verdict with four alternatives silently lost the one chip the
  // decision guarantees, and the question became a block instead of a
  // one-tap-further-away ask. Nothing had four alternatives yet, so it had
  // never fired; it would have fired the moment anything did.
  //
  // Four ALTERNATIVES plus the escape, so at most five chips. The cap exists
  // to stop a long list, and a curated five is not a long list — the four-chip
  // convention in the coach's prompt governs what the MODEL should write, not
  // what the app may render.
  const chips = [...t.alternatives.slice(0, 4).map(a => a.label), DO_IT_ANYWAY]
    .map(c => `"${c}"`)
    .join(' | ')
  return `${t.question}\n[QUICK_REPLIES: ${chips}]`
}

export interface AskGuards {
  /** Keys already asked about this block. */
  alreadyAsked: ReadonlySet<string>
  /** True while a session is actually running — no coaching questions between sets. */
  sessionRunning: boolean
}

/**
 * Whether to ASK, or to fall through to a normal card.
 *
 * The three guards that stop "ask first" becoming nagging, all from the
 * recorded decision. Separated from `assessEdit` because they need state a
 * pure assessment must not carry: what has been asked, and whether someone is
 * mid-set right now.
 *
 * TAKES THE KEY, NOT THE CONTEXT. The first version took an EditContext and
 * recomputed `askKey` from it — so a caller that already had the key had to
 * either pass the whole context a second time or fake one, and I wrote exactly
 * that fake at the first call site. A function that is awkward to call
 * correctly gets called incorrectly.
 */
export function shouldAsk(t: Tradeoff, key: string, scope: EditScope, guards: AskGuards): boolean {
  if (t.tier !== 2 || !t.question) return false
  return askIsAllowed(key, scope, guards)
}

/**
 * THE TWO GUARDS ON THEIR OWN, for a question that is not a tier-2 verdict.
 *
 * Split out 15 Sep 2026 for the reason ask ("why are you dropping this?"),
 * which needs the same two rules and has no verdict to carry them on. The
 * first version of that call built a fake `{...verdict, tier: 2, question:
 * 'x'}` to get in through `shouldAsk` — which is precisely what that
 * function's own note warns about ("a function that is awkward to call
 * correctly gets called incorrectly"), so the note won and the guards moved
 * out here.
 *
 * Both asks share ONE store of keys on purpose. Two counters would let
 * somebody be asked twice about one exercise in one block by two different
 * mechanisms, which is the nagging the shape rules exist to prevent.
 */
export function askIsAllowed(key: string, scope: EditScope, guards: AskGuards): boolean {
  // NEVER BETWEEN SETS. A today-scoped change made during a live session is a
  // person standing in a gym solving a problem now.
  if (guards.sessionRunning && scope === 'today') return false
  // ONCE PER BLOCK, PER THING. The second time, they get a plain card: say it
  // once, then trust them.
  return !guards.alreadyAsked.has(key)
}

/**
 * A tier-2 that is NOT being asked (guarded out above) must not go silent —
 * it still cost something. This is what the card carries instead.
 */
export function downgradeToCard(t: Tradeoff): Tradeoff {
  return t.tier === 2 ? { ...t, tier: 1, question: null, reason: `${t.reason} (asked already, or mid-session)` } : t
}
