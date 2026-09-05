// ---------------------------------------------------------------------------
// A PROFILE CHANGE THAT MAKES THE PLAN WRONG — audit §2.1, item 11.
//
// ProfileScreen's savePatch wrote the field and did nothing else. So somebody
// could add a knee injury on the Profile screen and every squat, lunge and
// step-up already in their sixteen-week plan stayed exactly where it was —
// permanently, because nothing re-ran. The app knew about the injury and went
// on prescribing against it. Changing equipment away from a gym was the same:
// the plan kept prescribing barbells they had just said they do not have.
//
// The engine to fix it already existed and was already trusted — the coach
// uses it. What was missing was a route from the Profile screen to it.
//
// ASK, NEVER SILENTLY. A rebuild rewrites somebody's next sixteen weeks,
// possibly mid-block. Doing that as a side effect of a settings toggle would
// be the app changing their training under them. So this module only ever
// DETECTS and DESCRIBES; App.tsx asks, and only a confirm rebuilds.
//
// ONLY FORWARD. Past weeks hold logged sets — real work somebody actually
// did. Rewriting them would make their own history disagree with what they
// remember doing, which is the same rule the coach's injury rebuild follows.
// ---------------------------------------------------------------------------

import type { UserProfile, MesocycleWeek } from './types'
import { rebuildAgainstProfile } from './plan-adaptations'

/**
 * The fields that make an existing plan wrong, and nothing else.
 *
 * DELIBERATELY SHORT. Age, weight, name, dietary preferences and the rest
 * either feed macros — which already recompute on their own — or do not touch
 * exercise selection at all. Offering a plan rebuild after a name change
 * would teach people to dismiss the dialog without reading it, and then the
 * one that matters gets dismissed too.
 */
// training_style joined on 5 Sep 2026, found while building the chat tool for
// it: generation reads the style in three places (the pool's style filter,
// the base rep range per tier, STYLE_CONFIGS), and Settings saved the field
// without ever offering the rebuild — so the profile said "bodybuilding"
// while the plan on screen stayed the "combat" one until the next full
// regeneration. The same profile-disagrees-with-plan shape training_days had.
// fitness_goal joined on 5 Sep 2026, on Ashley's ruling. It had been kept OFF
// this list deliberately (test:rebuild-offer's own "nothing else does" section
// named it) on the reasoning that the goal feeds macros, which recompute on
// their own. That was half the picture: goal-policies.ts also sets the set
// volume, the rest multipliers and the loaded main-lift rest floor, the
// rep-range shift per tier, which phases are allowed, the split, and the
// conditioning profile — more of the programme than style touches. Put to her
// as a question; she chose to offer the rebuild, same as style.
export const PLAN_INVALIDATING_FIELDS = ['injuries', 'equipment_access', 'training_days', 'training_style', 'fitness_goal'] as const
export type PlanInvalidatingField = typeof PLAN_INVALIDATING_FIELDS[number]

export interface PlanInvalidation {
  field: PlanInvalidatingField
  /** What to tell the user, in their terms — never a field name. */
  title: string
  detail: string
}

/**
 * Does this patch invalidate the plan, and if so, what should we say?
 *
 * Compares against the profile as it was, so re-saving the same injuries
 * (which the picker does on every toggle) does not raise an offer when
 * nothing actually changed.
 */
export function detectPlanInvalidation(
  before: UserProfile,
  patch: Partial<UserProfile>,
): PlanInvalidation | null {
  if ('injuries' in patch) {
    const was = [...(before.injuries ?? [])].sort()
    const now = [...(patch.injuries ?? [])].sort()
    if (was.join('|') !== now.join('|')) {
      // Only an ADDED injury is a safety problem — removing one leaves a plan
      // that is merely more cautious than it needs to be, which is not
      // urgent and not worth a dialog.
      const added = now.filter(i => !was.includes(i))
      if (added.length > 0) {
        return {
          field: 'injuries',
          title: 'Rebuild your plan around this?',
          detail:
            'Your current plan was built before you added that, so it still includes exercises ' +
            'that work the area you just flagged. I can rebuild it from this week onwards to ' +
            'work around it. Everything you have already logged stays exactly as it is.',
        }
      }
    }
  }

  // The plan is built from the days marked available (exercise-plan.ts:4066),
  // so dropping a day leaves sessions scheduled on a day they have just said
  // they do not train. Same shape as the equipment case — added after the
  // audit's own probe caught it missing from the first pass.
  if ('training_days' in patch) {
    const dayKey = (days: UserProfile['training_days'] | undefined) =>
      (days ?? []).filter(d => d.available).map(d => d.day).sort().join('|')
    if (dayKey(before.training_days) !== dayKey(patch.training_days)) {
      return {
        field: 'training_days',
        title: 'Rebuild your plan around these days?',
        detail:
          'Your current plan was built around the days you had before, so it still puts sessions ' +
          'on days you have just changed. I can rebuild it from this week onwards to fit the new ' +
          'week. Everything you have already logged stays exactly as it is.',
      }
    }
  }

  if ('equipment_access' in patch && patch.equipment_access !== before.equipment_access) {
    return {
      field: 'equipment_access',
      title: 'Rebuild your plan for this equipment?',
      detail:
        'Your current plan was built for what you had before, so it still asks for equipment ' +
        'you have just told me you do not have. I can rebuild it from this week onwards. ' +
        'Everything you have already logged stays exactly as it is.',
    }
  }

  if ('training_style' in patch && patch.training_style !== before.training_style) {
    return {
      field: 'training_style',
      title: 'Rebuild your plan in this style?',
      detail:
        'Your current plan was built for the style you had before, so the exercises and rep ' +
        'ranges still follow it. I can rebuild it from this week onwards in the new style. ' +
        'Everything you have already logged stays exactly as it is.',
    }
  }

  if ('fitness_goal' in patch && patch.fitness_goal !== before.fitness_goal) {
    return {
      field: 'fitness_goal',
      title: 'Rebuild your plan for this goal?',
      detail:
        'Your current plan was built for the goal you had before, so how much you do, how long ' +
        'you rest, the rep ranges and the conditioning all still follow it. I can rebuild it ' +
        'from this week onwards for the new goal. Everything you have already logged stays ' +
        'exactly as it is.',
    }
  }

  return null
}

export interface RebuildResult {
  ok: boolean
  mesocycle?: MesocycleWeek[]
  /** Set when the rebuild could not run — shown, never swallowed. */
  error?: string
  /** How many weeks were regenerated, for telling the user what happened. */
  weeksRebuilt?: number
}

/**
 * Regenerate the plan from `currentWeek` forward against the UPDATED profile.
 *
 * The profile passed in is already the new one — App merges the patch before
 * calling — so there is no clone-building here and no second source of truth
 * about what the user's injuries are.
 */
export async function rebuildFromCurrentWeek(
  profile: UserProfile,
  exclusions: string[],
  mesocycle: MesocycleWeek[],
  currentWeek: number,
): Promise<RebuildResult> {
  const forward = mesocycle.filter(w => w.week_number >= currentWeek).map(w => w.week_number)
  if (forward.length === 0) {
    // The block is over. Nothing ahead to rebuild is a legitimate outcome,
    // not a failure — and saying "rebuilt 0 weeks" would be a lie about
    // having done something.
    return { ok: false, error: 'There are no weeks left in this plan to rebuild.' }
  }

  try {
    const rebuilt = await rebuildAgainstProfile(profile, exclusions, mesocycle, forward)
    return { ok: true, mesocycle: rebuilt, weeksRebuilt: forward.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
