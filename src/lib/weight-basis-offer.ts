// ---------------------------------------------------------------------------
// "You've told me your weight — shall I redo your starting weights?"
//
// Backlog item 2b made a declined bodyweight honest rather than invisible:
// when we don't know someone's weight/age/sex, loads come from a deliberately
// light stand-in (50kg/female/60 — see load-prescription.ts's ASSUMED_BODY)
// and are labelled 'assumed_body' instead of passing as an ordinary estimate.
//
// What 2b did NOT do is release that state. Food targets follow later
// weigh-ins on their own — computeTargets prefers the latest daily_metrics
// reading over the immutable signup weight — but the training side reads only
// profile.weight_kg, and generateMesocycle runs exactly once, at onboarding.
// So the sixteen weeks of loads written at signup are the loads forever.
// Measured: a 100kg man who declines is prescribed 0.35x his real loads, and
// weighing in every day for a year would not move a single number.
//
// Ashley's ruling was to ASK, not to rebuild silently. Two properties follow,
// and this module exists for both:
//
//   1. The offer survives being ignored. It is a durable
//      pending/confirmed/declined row re-surfaced on every app load, not a
//      pending_actions proposal (10-minute expiry, bound to a chat message) —
//      a one-shot that vanished would quietly restore the very problem the
//      ruling was avoiding.
//   2. The offer names the real numbers. Asking first is only meaningful if
//      they can see what they are agreeing to, and the move can be large: a
//      squat going 20kg -> 55kg is correct arithmetic and still not something
//      to spring on someone. The message states the single largest change.
//
// Shaped throughout on load-suggestions.ts, which is the same pattern for a
// single exercise: propose, never auto-apply, decline permanently. The pure
// halves below are exported so the gate can assert the rules without a
// database.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, UserProfile } from './types'
import { getActiveMesocycleWeek } from './calculations'
import { rebuildForWeightBasis } from './plan-adaptations'
import { saveMesocycle } from './mesocycle-persistence'
import { supabase } from './supabase'

export interface WeightBasisOfferRow {
  id: string
  profile_id: string
  basis_weight_kg: number
  headline_exercise: string
  headline_from_kg: number
  headline_to_kg: number
  applied_from_week: number | null
  status: 'pending' | 'confirmed' | 'declined'
  created_at: string
  resolved_at: string | null
}

/** What App.tsx renders: a banner id plus the sentence the trainee reads. */
export interface PendingWeightBasisOffer {
  id: string
  text: string
}

export interface LoadChange {
  exercise: string
  fromKg: number
  toKg: number
  weekNumber: number
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/**
 * Does this stored plan contain loads derived from a body we invented?
 *
 * A NECESSARY BUT NOT SUFFICIENT condition — the cheap short-circuit only.
 * If the plan was never built on a guess there is nothing to offer, and no
 * reason to spend a sixteen-week regeneration working that out on every app
 * load. But passing this does NOT mean offer: see rebuildChangesAnything,
 * which is the real test.
 *
 * The distinction is not academic, and a gate caught it: a trainee who
 * declined weight, age AND sex, and then weighs in, still has an unknown sex
 * afterwards. Their rebuilt loads are correctly still marked 'assumed_body'
 * — we genuinely are still guessing at half their body — so this predicate
 * stays true forever and, used alone as the eligibility rule, would re-offer
 * the same rebuild on every single app load.
 *
 * Deliberately keys on 'assumed_body' exactly rather than
 * isUnverifiedLoadSource: a plain 'estimate' came from body metrics the user
 * DID give us, and rebuilding those is ordinary weight drift, which this
 * feature deliberately does not touch (see the plan doc's out-of-scope note).
 */
export function planHasAssumedBodyLoads(mesocycle: MesocycleWeek[], fromWeek = 0): boolean {
  return mesocycle.some(week =>
    week.week_number >= fromWeek &&
    week.days.some(day => day.exercises.some(ex => ex.load_source === 'assumed_body')),
  )
}

/**
 * Which weeks a rebuild may touch: the live week and everything after it.
 *
 * A past week is history. Its numbers may have been wrong, but they are what
 * the trainee actually trained against, and rewriting them would silently
 * disagree with their own logged sets.
 */
export function rebuildableWeekNumbers(mesocycle: MesocycleWeek[], liveWeek: number): number[] {
  return mesocycle.filter(w => w.week_number >= liveWeek).map(w => w.week_number)
}

/**
 * The single largest load change between the stored plan and a rebuild, over
 * the weeks the rebuild covers — by ABSOLUTE size, in either direction.
 *
 * An earlier cut reported only increases, on the reasoning that being handed
 * something heavier is what needs consent. That was backwards on the case
 * that matters most: the stand-in body is a light one, so the trainee whose
 * loads would go DOWN is the one it is currently too heavy for — a 45kg woman
 * carrying a 50kg woman's numbers. Skipping her because the change was
 * negative would have hidden the one direction with a real safety cost.
 *
 * Matched by exercise NAME within a week rather than by slot index: a rebuild
 * can reorder or re-select slots (exercise selection reads the same body
 * metrics the loads do), so an index-matched comparison would report changes
 * that are really two different exercises.
 */
export function headlineChange(
  before: MesocycleWeek[],
  after: MesocycleWeek[],
  weekNumbers: number[],
): LoadChange | null {
  const wanted = new Set(weekNumbers)
  const afterByWeek = new Map(after.map(w => [w.week_number, w]))
  let best: LoadChange | null = null

  for (const week of before) {
    if (!wanted.has(week.week_number)) continue
    const rebuiltWeek = afterByWeek.get(week.week_number)
    if (!rebuiltWeek) continue

    const rebuiltByName = new Map<string, number>()
    for (const day of rebuiltWeek.days) {
      for (const ex of day.exercises) {
        if (ex.suggested_load_kg != null && !rebuiltByName.has(ex.name)) {
          rebuiltByName.set(ex.name, ex.suggested_load_kg)
        }
      }
    }

    for (const day of week.days) {
      for (const ex of day.exercises) {
        if (ex.suggested_load_kg == null) continue
        const toKg = rebuiltByName.get(ex.name)
        if (toKg == null) continue
        const delta = Math.abs(toKg - ex.suggested_load_kg)
        if (delta === 0) continue
        if (!best || delta > Math.abs(best.toKg - best.fromKg)) {
          best = { exercise: ex.name, fromKg: ex.suggested_load_kg, toKg, weekNumber: week.week_number }
        }
      }
    }
  }

  return best
}

/**
 * Would a rebuild actually change anything the trainee can see?
 *
 * THE eligibility test, and the one that stops the offer re-asking forever.
 * planHasAssumedBodyLoads says the plan was built on a guess; this says the
 * guess is still costing them something. After a confirmed rebuild the two
 * diverge — the loads are now derived from their real weight, but with an
 * unknown sex they stay marked 'assumed_body' — and only this one goes
 * quiet.
 *
 * Counts a provenance change as well as a weight change, because the label is
 * a claim in its own right. Someone who declined only their weight and later
 * gives it has a rebuild that may barely move a kilo while flipping every
 * chip from "starting light" to "suggested" — the numbers were fine, the
 * caption was not, and staying silent would leave a false one on screen.
 */
export function rebuildChangesAnything(
  before: MesocycleWeek[],
  after: MesocycleWeek[],
  weekNumbers: number[],
): boolean {
  const wanted = new Set(weekNumbers)
  const afterByWeek = new Map(after.map(w => [w.week_number, w]))

  for (const week of before) {
    if (!wanted.has(week.week_number)) continue
    const rebuiltWeek = afterByWeek.get(week.week_number)
    if (!rebuiltWeek) continue

    const rebuilt = new Map<string, { kg: number | null | undefined; source: string | undefined }>()
    for (const day of rebuiltWeek.days) {
      for (const ex of day.exercises) {
        if (!rebuilt.has(ex.name)) rebuilt.set(ex.name, { kg: ex.suggested_load_kg, source: ex.load_source })
      }
    }

    for (const day of week.days) {
      for (const ex of day.exercises) {
        const now = rebuilt.get(ex.name)
        if (!now) continue
        if (ex.suggested_load_kg !== now.kg) return true
        if (ex.suggested_load_kg != null && ex.load_source !== now.source) return true
      }
    }
  }
  return false
}

/**
 * What the banner says.
 *
 * Two shapes, because the honest sentence differs. When something genuinely
 * moves, name it — that is the whole point of asking first. When nothing
 * does (their real body turns out to be close to the light stand-in), say
 * THAT plainly rather than staying silent: the loads may be fine, but every
 * chip on the plan still reads "starting light" and its explainer still says
 * we don't have their body details, which stopped being true the moment they
 * weighed in. Offering with an accurate "barely changes" beats leaving a
 * false label on screen.
 *
 * Deliberately does NOT say "because I didn't know what you weighed". This
 * offer can fire more than once: a trainee who declined weight, age AND sex
 * and accepts a rebuild still has an unknown sex afterwards — sex is the
 * LARGER term in the standards model (female standards are 0.53-0.67x male),
 * so a weigh-in closes only about half their gap, measured. Fill the sex in
 * later and this offers again, and "I didn't know what you weighed" would be
 * false the second time. "Based on a stand-in body rather than yours" is true
 * every time it appears.
 */
export function offerText(basisWeightKg: number, change: LoadChange | null): string {
  const weight = `${Math.round(basisWeightKg * 10) / 10}kg`
  const opener = `I've got you at ${weight} now. Your starting weights are still based on a stand-in body rather than yours`
  if (!change) {
    return `${opener} — rebuilding them barely changes the numbers, but they'd be worked out from what you've actually told me. Want me to?`
  }
  return `${opener} — rebuilding them would take ${change.exercise} from ${change.fromKg}kg to ${change.toKg}kg. Want me to?`
}

// ---------------------------------------------------------------------------
// Stored offer
// ---------------------------------------------------------------------------

async function findOffer(profileId: string, status: WeightBasisOfferRow['status']): Promise<WeightBasisOfferRow | null> {
  const { data } = await supabase
    .from('weight_basis_offers')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', status)
    .limit(1)
  return data && data.length > 0 ? (data[0] as WeightBasisOfferRow) : null
}

export interface CheckWeightBasisOfferParams {
  profileId: string
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  /**
   * The rolling-average anchor from getEffectiveTargetWeightKg, NOT a single
   * raw reading — passed in rather than read here so the caller's existing
   * resolution (App.tsx's handleWeightLogged already computes it for the
   * nutrition side) is reused instead of duplicated, and so this module stays
   * testable without a database.
   */
  basisWeightKg: number | null | undefined
  exclusions: string[]
  planCreatedAt: string
  now?: Date
}

/**
 * Check-on-load sweep, run as a sibling of checkForLoadSuggestions. Reads and
 * inserts `weight_basis_offers` rows; never patches or saves the mesocycle
 * itself — that only happens on an explicit confirm.
 */
export async function checkForWeightBasisOffer(
  params: CheckWeightBasisOfferParams,
): Promise<PendingWeightBasisOffer | null> {
  const { profileId, profile, mesocycle, basisWeightKg, exclusions, planCreatedAt, now } = params
  if (mesocycle.length === 0) return null
  if (basisWeightKg == null || basisWeightKg <= 0) return null

  const liveWeek = getActiveMesocycleWeek(planCreatedAt, now, mesocycle.length)
  const weekNumbers = rebuildableWeekNumbers(mesocycle, liveWeek)
  if (weekNumbers.length === 0) return null

  // Cheapest check first — see planHasAssumedBodyLoads' doc comment for why
  // this must gate the regeneration below rather than follow it.
  if (!planHasAssumedBodyLoads(mesocycle, liveWeek)) return null

  // A decline is permanent, the same weight as a banned exercise staying
  // banned. Checked before the pending lookup so a declined profile never
  // reaches a rebuild.
  if (await findOffer(profileId, 'declined')) return null

  // Already outstanding: return the stored row rather than regenerating and
  // risking a duplicate. This is what makes the offer survive being ignored —
  // it keeps reappearing, unchanged, until answered.
  const existing = await findOffer(profileId, 'pending')
  if (existing) {
    return {
      id: existing.id,
      text: offerText(existing.basis_weight_kg, {
        exercise: existing.headline_exercise,
        fromKg: existing.headline_from_kg,
        toKg: existing.headline_to_kg,
        weekNumber: liveWeek,
      }),
    }
  }

  // Compute the rebuild WITHOUT applying it, purely to show them what they
  // would be agreeing to.
  const preview = await rebuildForWeightBasis({ profile, basisWeightKg, exclusions, mesocycle, weekNumbers })
  // Nothing on screen would move, so there is nothing to consent to. This is
  // also what makes a confirmed offer stay answered: a second preview built
  // from the same weight reproduces the stored plan exactly.
  if (!rebuildChangesAnything(mesocycle, preview, weekNumbers)) return null
  const change = headlineChange(mesocycle, preview, weekNumbers)

  const { data, error } = await supabase
    .from('weight_basis_offers')
    .insert({
      profile_id: profileId,
      basis_weight_kg: basisWeightKg,
      // A null change still records a row: the offer is real (the labels are
      // wrong even when the numbers aren't), and the columns are NOT NULL, so
      // "no movement" is stored as from === to rather than as an absence.
      headline_exercise: change?.exercise ?? '',
      headline_from_kg: change?.fromKg ?? 0,
      headline_to_kg: change?.toKg ?? 0,
    })
    .select()
    .single()

  if (error || !data) return null
  const row = data as WeightBasisOfferRow
  return { id: row.id, text: offerText(row.basis_weight_kg, change) }
}

export interface ConfirmWeightBasisOfferParams {
  offerId: string
  profileId: string
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  exclusions: string[]
  planCreatedAt: string
  /** The plan's ORIGINAL creation time — see the save call below for why this is not optional in practice. */
  mesocycleCreatedAt?: string
  now?: Date
}

/**
 * The "yes" branch. Rebuilds the live week onward from the weight the offer
 * was made on, persists it, and closes the row.
 *
 * The live week is recomputed here rather than taken from the offer: they may
 * have left the banner sitting for a fortnight, and a rebuild that started at
 * the week the offer was CREATED would rewrite weeks they have since trained.
 */
export async function confirmWeightBasisOffer(
  params: ConfirmWeightBasisOfferParams,
): Promise<MesocycleWeek[] | null> {
  const { offerId, profileId, profile, mesocycle, exclusions, planCreatedAt, mesocycleCreatedAt, now } = params
  const { data: row } = await supabase.from('weight_basis_offers').select('*').eq('id', offerId).maybeSingle()
  if (!row || row.status !== 'pending') return null
  const offer = row as WeightBasisOfferRow

  const liveWeek = getActiveMesocycleWeek(planCreatedAt, now, mesocycle.length)
  const weekNumbers = rebuildableWeekNumbers(mesocycle, liveWeek)
  if (weekNumbers.length === 0) return null

  const rebuilt = await rebuildForWeightBasis({
    profile,
    basisWeightKg: offer.basis_weight_kg,
    exclusions,
    mesocycle,
    weekNumbers,
  })

  // Preserve the plan's original creation time. This is an EDIT of the live
  // plan, not a new plan; without it the resave rewinds live-week detection
  // to week 1 and the trainee is sent back to their calibration week.
  await saveMesocycle(profileId, rebuilt, mesocycleCreatedAt ?? profile.created_at)
  await supabase
    .from('weight_basis_offers')
    .update({ status: 'confirmed', applied_from_week: liveWeek, resolved_at: new Date().toISOString() })
    .eq('id', offerId)

  return rebuilt
}

/**
 * Declining is permanent — checkForWeightBasisOffer's own declined-row check
 * skips this profile forever after. The manual route stays open and the app
 * already points at it: the "starting light" chip explainer ends "…or add
 * your weight in Profile."
 */
export async function declineWeightBasisOffer(offerId: string): Promise<void> {
  await supabase
    .from('weight_basis_offers')
    .update({ status: 'declined', resolved_at: new Date().toISOString() })
    .eq('id', offerId)
}
