// ---------------------------------------------------------------------------
// WHAT THE COACH KNOWS ABOUT CURRENT INJURIES.
//
// 22 Sep 2026, a systematic audit of every UserProfile field against what
// ChatAssistant.tsx sends: `injuries` reaches PLAN GENERATION (the exercise
// list the coach reads is already filtered around them) but never reached
// the CONVERSATION. Asked directly "are you still working around my knee?"
// the coach had nothing to check that against — the same "reaches the plan,
// never reaches the coach" gap as equipment_access/training_experience/
// training_style earlier the same day, on data that is safety-adjacent
// rather than a preference, which is why it went to Ashley before being
// wired through.
//
// READ ONLY, deliberately. This adds nothing the coach can DO — no new tool,
// no new write path, no change to what a plan generates or what the existing
// pain-triage rules (§1c/§3a) require before adjusting anything. It only
// lets the coach state a fact it is already acting on.
//
// Built from partitionInjuries (onboarding-slots.ts), the SAME function the
// Profile screen uses to turn stored injuries into what the plan engine
// actually acts on — never a second copy of that logic. Only the recognised
// codes are surfaced: the unrecognised (legacy free-text, pre-picker) half
// is real stored data but affects no exercise, and surfacing it here would
// risk the coach treating stale, unstructured text as something adjusted
// for when nothing was.
// ---------------------------------------------------------------------------

import { partitionInjuries } from './onboarding-slots'
import { INJURY_OPTIONS } from './picker-options'
import type { UserProfile } from './types'

/**
 * One plain line for the coach's context.
 *
 * `unrecognised` (legacy free text the plan engine cannot act on) is never
 * quoted back — that is the safety property this file exists to hold — but
 * its PRESENCE still changes the wording: claiming nothing is "on file" when
 * something genuinely is stored, just not actionable, would be the same
 * overclaim this codebase's honesty rules exist to catch, pointed at an
 * absence instead of a presence.
 */
export function buildCoachInjuriesSummary(profile: Pick<UserProfile, 'injuries'>): string {
  const { codes, unrecognised } = partitionInjuries(profile.injuries ?? [])
  if (codes.length === 0) {
    return unrecognised.length > 0
      ? 'Nothing on file that the plan currently adjusts for automatically.'
      : 'No injuries or sore areas currently on file.'
  }
  const labels = codes.map(c => INJURY_OPTIONS.find(o => o.value === c)?.label ?? c)
  const plural = labels.length > 1
  return `Currently working around: ${labels.join(', ')} — the plan already avoids exercises that load ${plural ? 'these' : 'this'}.`
}
