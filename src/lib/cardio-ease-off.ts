// ---------------------------------------------------------------------------
// A RUN WHILE A KNEE IS BEING EASED OFF: ASK, NEVER BLOCK (Sam live test, 20 Oct 2026).
//
// She had a knee ease-off running until 22 Oct, logged a 40-minute hard run, and nothing was said. Her answer to my
// proposal, 22 Oct: build it, as one question after the log, and the pain rules take it from there. So after a
// cardio log on either surface, if the activity loads the legs on impact and a TEMPORARY ease-off of the knees,
// ankles or hips is running, the app asks one question with two answers. Nothing is blocked, nothing changes.
//
// CSCS basis (recorded in BACKLOG): running, jumping and field or court sport load the knee, ankle and hip on every
// stride or landing, which is the load an ease-off of those areas is taking out of the lifting. A coach who had
// eased someone's knee off would ask how it went after a hard run; they would not stop the run being logged.
// A lasting injury is not asked about: the plan is already built around it, and asking after every run for ever
// would nag. The lower back is not on the list: running is not what an ease-off of it is about.
//
// A LEAF: types and the injury labels only, so the screen row and the chat can both import it.
// ---------------------------------------------------------------------------

import { INJURY_OPTIONS } from './picker-options'
import { endsOn, isAdaptationActive, type ActiveAdaptationLike } from './effective-constraints'

/** The areas an impact activity loads, by the app's own injury codes. */
const IMPACT_AREAS = ['knees', 'ankles', 'hips'] as const

/** Activities that land on the legs, by the words people log them under. Walking, cycling, rowing, swimming are not. */
const IMPACT_RE = /\b(run|runs|running|ran|jog|jogs|jogging|sprint|sprints|sprinting|hike|hikes|hiking|trail|skip|skipping|jump|jumps|jumping|rope|plyo|plyometrics?|football|soccer|rugby|netball|basketball|tennis|squash|badminton|hockey|parkrun|5k|10k|marathon)\b/i

function isImpactActivity(activityName: string): boolean {
  return IMPACT_RE.test(activityName)
}

/** "the run", "the hike", "that session": what the question calls the activity. */
function activityNoun(activityName: string): string {
  if (/\b(run|runs|running|ran|jog|jogs|jogging|sprint|parkrun|5k|10k|marathon)\b/i.test(activityName)) return 'the run'
  if (/\b(hike|hikes|hiking|trail)\b/i.test(activityName)) return 'the hike'
  if (/\b(skip|skipping|rope)\b/i.test(activityName)) return 'the skipping'
  return 'that session'
}

export interface EaseOffQuestion {
  /** "How did your knees feel on the run? They're being eased off until 22 Oct." */
  text: string
  /** The two answers, in order: fine, then hurt. */
  fine: string
  hurt: string
  /** What "It hurt" hands the coach, in her voice, ready to send. */
  hurtMessage: string
}

/**
 * The one question after a cardio log, or null when there is nothing to ask. `now` is the app's clock, the same one
 * the ease-off's end is measured on everywhere else.
 */
export function easeOffQuestion(activityName: string, adaptations: readonly ActiveAdaptationLike[], now: Date): EaseOffQuestion | null {
  if (!isImpactActivity(activityName)) return null
  const running = adaptations.filter(a =>
    a.kind === 'injury' && !!a.injury_code && (IMPACT_AREAS as readonly string[]).includes(a.injury_code) && isAdaptationActive(a, now))
  if (running.length === 0) return null
  // One question, about the area ending soonest if two are running (the one most likely to be tested by the run).
  const first = [...running].sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0]
  const label = (INJURY_OPTIONS.find(o => o.value === first.injury_code)?.label ?? first.injury_code!).toLowerCase()
  const noun = activityNoun(activityName)
  return {
    text: `How did your ${label} feel on ${noun}? They're being eased off until ${endsOn(first.expires_at)}.`,
    fine: 'Felt fine',
    hurt: 'It hurt',
    hurtMessage: `My ${label} hurt on ${noun}`,
  }
}
