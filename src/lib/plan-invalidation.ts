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

import type { UserProfile, MesocycleWeek, SessionDuration } from './types'
import { rebuildAgainstProfile } from './plan-adaptations'
import { getDurationBudgetSeconds } from './session-duration'

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
// start_preference joined 14 Sep 2026, on Ashley's instruction to close the
// setup answers that could never be changed. It is the most plan-shaping of the
// four remaining locked ones: 'move_more' produces the starting-out walking plan
// (starting-out.ts reads exactly this field), 'train' produces a lifting plan.
// Changing it is therefore not a re-price — it is a different plan — so it
// belongs here with goal and style rather than on the ceilings path.
// The three known lifts joined 14 Sep 2026, on Ashley's ruling "rebuild only
// when it matters", chosen over always offering and over never offering.
//
// THEY ARE CONDITIONAL, which nothing else on this list is, and the condition
// is the whole point. `knownWorkingWeights` (exercise-plan.ts) is packed from
// these three ONLY when `skip_calibration_week` is set — otherwise the plan is
// anchored to what was actually lifted in the calibration week and these
// numbers are a record. So correcting one after a calibration week changes no
// weight, and offering to rebuild would be the app asking someone to give up
// their progression for nothing. See detectPlanInvalidation's branch.
export const KNOWN_LIFT_FIELDS = ['known_squat_kg', 'known_bench_kg', 'known_deadlift_kg'] as const
// `session_duration_preference` ADDED 16 Sep 2026. Its absence was not an
// oversight to tidy — it was the whole defect. Changing session length on
// Profile wrote the number and touched nothing else: no rebuild, no re-price.
// The only visible effect was today's card starting to say the session runs
// over (TodayPanel's shortfall line). So "you can set your session length"
// was true about the NUMBER and false about the PLAN.
//
// ASHLEY'S RULING, 16 Sep 2026, from three options: rebuild the rest of the
// block around the new length. Over trimming what is already there (a
// 60-minute session with its end chopped off is not a session designed for
// 45) and over waiting for the next block. Being in this list is what makes
// that happen — everything below reuses the road goal and style already take.
export const PLAN_INVALIDATING_FIELDS = ['injuries', 'equipment_access', 'training_days', 'training_style', 'fitness_goal', 'start_preference', 'session_duration_preference', ...KNOWN_LIFT_FIELDS] as const
export type PlanInvalidatingField = typeof PLAN_INVALIDATING_FIELDS[number] | 'concurrent_activities'

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
  // The week is BUILT AROUND a second sport (concurrent-activity.ts steers the
  // lighter sessions onto its days). Removing it from the Profile leaves a
  // plan arranged around evenings that no longer have a class — not unsafe,
  // but not the plan they would get now, so offer the rebuild the same way a
  // dropped training day does.
  if ('concurrent_activities' in patch) {
    const key = (list: UserProfile['concurrent_activities']) =>
      (list ?? []).map(a => `${a.name.toLowerCase()}:${[...(a.days ?? [])].sort().join(',')}`).sort().join('|')
    if (key(before.concurrent_activities) !== key(patch.concurrent_activities)) {
      return {
        field: 'concurrent_activities',
        title: 'Rebuild your plan around this?',
        detail:
          'Your current plan was arranged around your other training — the lighter gym days ' +
          'sit on those class days. Now that has changed, I can rebuild from this week onwards ' +
          'to match. Everything you have already logged stays exactly as it is.',
      }
    }
  }

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

  // THE THREE KNOWN LIFTS — and the condition is her ruling, not an
  // optimisation. See KNOWN_LIFT_FIELDS above for why a calibrated plan must
  // NOT be offered a rebuild over these.
  const movedLifts = KNOWN_LIFT_FIELDS.filter(f => f in patch && patch[f] != null && patch[f] !== before[f])
  if (movedLifts.length > 0 && before.skip_calibration_week) {
    const LIFT_WORDS: Record<string, string> = {
      known_squat_kg: 'squat', known_bench_kg: 'bench press', known_deadlift_kg: 'deadlift',
    }
    const named = movedLifts.map(f => LIFT_WORDS[f]).join(' and ')
    return {
      field: movedLifts[0] as PlanInvalidatingField,
      title: `Rebuild around your ${named}?`,
      detail: `You skipped the first week's testing, so your weights were worked out from the numbers `
        + `you gave at setup — including that one. I can rebuild your plan from this week onwards `
        + `around the corrected figure. Everything you have already logged stays exactly as it is.`,
    }
  }

  if ('start_preference' in patch && patch.start_preference !== before.start_preference) {
    const toTraining = patch.start_preference === 'train'
    return {
      field: 'start_preference',
      title: toTraining ? 'Build you a training plan?' : 'Go back to easing in?',
      detail: toTraining
        ? 'Your current plan is the easing-in one — walks and easy movement, built for starting '
          + 'from scratch. I can build you a proper training plan from this week onwards. '
          + 'Everything you have already logged stays exactly as it is.'
        : 'Your current plan is a training plan. I can rebuild it from this week onwards as the '
          + 'easing-in one — walks and easy movement, building a little at a time. Everything '
          + 'you have already logged stays exactly as it is.',
    }
  }

  // AFTER the others deliberately. This function returns the FIRST match, and
  // a patch that changes goal AND length is really about the goal — that
  // rebuild covers the length anyway, and offering the smaller reason would
  // describe the change wrongly.
  if ('session_duration_preference' in patch
      && patch.session_duration_preference !== before.session_duration_preference) {
    // ASKED OF THE ENGINE, NOT OF THE STRING. Comparing '30-45' < '45-60'
    // lexicographically gives the right answer for all four current values
    // by pure coincidence of their first digits — and a future '100-120'
    // would sort BELOW '30-45' and silently invert the sentence. The budget
    // function is the app's own source of truth for how long each tier is,
    // so it is the thing to ask.
    const shorter = getDurationBudgetSeconds(patch.session_duration_preference as SessionDuration)
      < getDurationBudgetSeconds(before.session_duration_preference as SessionDuration)
    return {
      field: 'session_duration_preference',
      title: 'Rebuild your sessions around the time you have?',
      detail:
        'Your current plan was built around your old session length, so the number of exercises, '
        + 'how many sets and how long you rest all still follow it. I can rebuild it from this week '
        + 'onwards to fit the time you actually have'
        + (shorter
          ? ' — sessions designed to be shorter, rather than the same ones with the end cut off.'
          : ' — with the extra time used properly, rather than left over.')
        + ' Everything you have already logged stays exactly as it is.',
    }
  }

  // LAST, and the order matters for the same reason session length sits above
  // it: this function returns the FIRST match, and the goal is the answer the
  // others qualify. A patch that changes the goal alone reaches here; a patch
  // that changes the goal AND something smaller is described by the smaller
  // one only if that one is genuinely a different request. Nothing today
  // produces such a patch — each row on Profile saves one field — so this
  // ordering is a statement of intent rather than a live branch.
  if ('fitness_goal' in patch && patch.fitness_goal !== before.fitness_goal) {
    return {
      field: 'fitness_goal',
      title: 'Rebuild your plan for this goal?',
      // BOTH HALVES, BEFORE THE TAP — Ashley's ruling, 17 Sep 2026, from three
      // options: training and food, from this week. The goal is the only
      // invalidating field that is also an input to the calorie and macro
      // calculation, so it is the only one whose offer has a food sentence.
      // Saying "your plan" and quietly rebuilding the meals too would be the
      // silent change the whole propose-then-confirm rail exists to prevent.
      detail:
        'Your current plan was built for the goal you had before, so how much you do, how long ' +
        'you rest, the rep ranges and the conditioning all still follow it. I can rebuild it ' +
        'from this week onwards for the new goal, and rebuild your meals around the new ' +
        'calorie and macro targets at the same time — that part takes a moment. Everything you ' +
        'have already logged stays exactly as it is.',
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
