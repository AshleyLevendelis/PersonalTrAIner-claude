// ---------------------------------------------------------------------------
// ONE ANSWER TO "WHAT MUST THIS PERSON'S PLAN AVOID RIGHT NOW".
//
// docs/plans/adaptations-respect-the-week-already-trained.md, rule 5. Test log
// H11 and H17, 9 Oct 2026. A temporary change ("ease off my knees for two
// weeks", "bodyweight only while I'm away") is deliberately NEVER written to
// the profile, which is right: it ends on its own and must not become a
// lasting injury. But it meant nothing else knew it existed. Five minutes
// after the knee adaptation the travel card put Box Squat back, the swap list
// offered it, and the coach was told "No injuries or sore areas currently on
// file".
//
// So: the profile's own injuries PLUS every active time-boxed injury
// adaptation, and the profile's kit unless an active kit adaptation covers
// today. Built once (App loads the adaptations with the plan) and READ by
// everything that builds a pool of exercises or describes the person to the
// coach.
//
// READ, NEVER WRITTEN. `constraintProfile` returns a clone for pool-building.
// Nothing saves it: a profile write uses the real profile, so a temporary
// adaptation still never lands in `fitness_profiles.injuries`
// (`test:injury-separation`, `test:plan-adaptations-separation`).
// ---------------------------------------------------------------------------

import type { EquipmentAccess, UserProfile } from './types'
import { INJURY_OPTIONS } from './picker-options'
import { travelProfile } from './kit-list'

/** The fields of a stored adaptation this file reads. `PlanAdaptationRow` satisfies it. */
export interface ActiveAdaptationLike {
  id?: string
  kind: 'injury' | 'equipment'
  status: string
  injury_code: string | null
  equipment_override: string | null
  starts_at: string
  expires_at: string
}

export interface EffectiveConstraints {
  /** Injury codes being eased off temporarily that are NOT on the profile. */
  temporaryInjuries: string[]
  /** The kit tier a temporary change puts the person on today, or null. */
  temporaryEquipment: EquipmentAccess | null
}

export const NO_ACTIVE_ADAPTATIONS: EffectiveConstraints = { temporaryInjuries: [], temporaryEquipment: null }

/** Still running at `now`: marked active and not past its end. */
export function isAdaptationActive(a: ActiveAdaptationLike, now: Date): boolean {
  return a.status === 'active' && new Date(a.expires_at).getTime() > now.getTime()
}

export function effectiveConstraints(
  profile: Pick<UserProfile, 'injuries'>,
  adaptations: ActiveAdaptationLike[],
  now: Date,
): EffectiveConstraints {
  const live = adaptations.filter(a => isAdaptationActive(a, now))
  const own = new Set(profile.injuries ?? [])
  const temporaryInjuries = [...new Set(
    live.filter(a => a.kind === 'injury' && a.injury_code).map(a => a.injury_code as string),
  )].filter(code => !own.has(code))
  // The most recently started kit change wins when two overlap.
  const kit = live
    .filter(a => a.kind === 'equipment' && a.equipment_override && new Date(a.starts_at).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0]
  return { temporaryInjuries, temporaryEquipment: (kit?.equipment_override as EquipmentAccess | undefined) ?? null }
}

/**
 * The profile a POOL is built from: the real one, with the temporary
 * constraints laid over it. Returns the same object when there are none, so a
 * person with no adaptation running gets byte-identical behaviour.
 */
export function constraintProfile<P extends Pick<UserProfile, 'injuries' | 'equipment_access' | 'kit_statements'>>(
  profile: P,
  constraints: EffectiveConstraints,
): P {
  if (constraints.temporaryInjuries.length === 0 && !constraints.temporaryEquipment) return profile
  // A TEMPORARY KIT CHANGE DESCRIBES SOMEWHERE ELSE ("bodyweight only while
  // I'm away", "the hotel has a gym"), so it is that tier's plain set and the
  // person's own kit list does not come with them — see `travelProfile`. A
  // temporary injury leaves the kit exactly as it is.
  const kitted = constraints.temporaryEquipment ? travelProfile(profile, constraints.temporaryEquipment) : profile
  return {
    ...kitted,
    injuries: [...(profile.injuries ?? []), ...constraints.temporaryInjuries.filter(c => !(profile.injuries ?? []).includes(c))],
  }
}

/** "your knees", "your lower back" — the area as the app already names it, in a sentence. */
export function areaInWords(injuryCode: string | null | undefined): string {
  if (!injuryCode) return 'that area'
  const label = INJURY_OPTIONS.find(o => o.value === injuryCode)?.label ?? injuryCode.replace(/_/g, ' ')
  return `your ${label.toLowerCase()}`
}

/** "22 Oct" — the day a temporary change ends. */
export function endsOn(expiresAt: string): string {
  const d = new Date(expiresAt)
  // Spelled out, not left to the phone's locale, so every phone prints the same line.
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`
}

/**
 * The line Profile and the Exercise tab both show while a temporary change is
 * running. One function, so the two screens cannot word it differently.
 */
export function describeActiveAdaptation(a: ActiveAdaptationLike, equipmentLabel?: (tier: string) => string): string {
  if (a.kind === 'injury') return `Easing off ${areaInWords(a.injury_code)} until ${endsOn(a.expires_at)}`
  const tier = a.equipment_override ?? ''
  const label = (equipmentLabel?.(tier) ?? tier.replace(/_/g, ' ')).toLowerCase()
  return `Training with ${label} until ${endsOn(a.expires_at)}`
}
