// ---------------------------------------------------------------------------
// HEALTH CONDITIONS, folded into the injuries question (his ruling 14 Nov 2026, "Fold into injuries"; "Yes, build it"
// the same day). No new question: the "anything that bothers you" card also offers five taps for what a doctor has said
// to watch. They are NOT joints, so they are kept apart from `injuries` (the injury filter reads joint codes) in their
// own column, `fitness_profiles.health_conditions` (migration 20261114150000).
//
// What a tap does, and no more:
//   - the GP line, in setup and on Profile;
//   - the plan: no working set above RPE 8 (two or more reps in reserve), conditioning capped at RPE 7, no "max
//     effort" intervals, and conditioning described in effort words, never a heart rate;
//   - the coach is told, with the rule to send anything about the condition itself to their GP.
// It never changes food (clinical nutrition is outside the CSCS delegation and the app's scope), and it never
// prescribes anything specific to pregnancy (the app does not know the stage; that is the GP's).
//
// CSCS BASIS (mine to decide under his 18 Sep delegation; recorded in BACKLOG): the ACSM's guidance for hypertension
// and cardiovascular disease is moderate intensity with no maximal efforts and no breath-holding strain; RPE rather than
// heart rate where medication (beta blockers, which also come with heart conditions) blunts the heart's response; ACOG
// for pregnancy is moderate intensity by the talk test. RPE 8 on a set and RPE 7 on conditioning sit at the top of
// "moderate to vigorous" without reaching maximal, and every phase still trains.
// ---------------------------------------------------------------------------

export const HEALTH_CONDITION_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'high_blood_pressure', icon: '🩺', label: 'High blood pressure' },
  { value: 'heart_condition', icon: '❤️', label: 'A heart condition' },
  { value: 'diabetes', icon: '🩸', label: 'Diabetes or pre-diabetes' },
  { value: 'blood_thinners', icon: '💊', label: 'On blood thinners' },
  { value: 'pregnancy', icon: '🤰', label: 'Pregnant' },
]

const CODES = new Set(HEALTH_CONDITION_OPTIONS.map(o => o.value))

export function isHealthCondition(code: unknown): code is string {
  return typeof code === 'string' && CODES.has(code)
}

/** The conditions on a profile, known codes only, in the options' order. */
export function healthConditionsOf(profile: { health_conditions?: readonly string[] | null } | null | undefined): string[] {
  // Unknown codes drop out because only the options are read back (a mutation proved a second filter here did nothing).
  const have = new Set(profile?.health_conditions ?? [])
  return HEALTH_CONDITION_OPTIONS.map(o => o.value).filter(v => have.has(v))
}

export function hasHealthCondition(profile: { health_conditions?: readonly string[] | null } | null | undefined): boolean {
  return healthConditionsOf(profile).length > 0
}

/** No working set above this with a condition ticked: two or more reps left in the tank. */
export const HEALTH_SET_RPE_CEILING = 8
/** No conditioning above this with a condition ticked: hard, never all-out. */
export const HEALTH_CONDITIONING_RPE_CEILING = 7

/** "High blood pressure and diabetes or pre-diabetes", lower-cased after the first word, for sentences. */
export function healthConditionsInWords(codes: readonly string[]): string {
  const labels = HEALTH_CONDITION_OPTIONS.filter(o => codes.includes(o.value)).map(o => o.label.toLowerCase())
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * The GP line for a ticked condition, shown under the card in setup and on Profile. Says what the app changes and no
 * more; it gives no advice about the condition itself.
 */
export function healthConditionLine(codes: readonly string[]): string {
  if (codes.length === 0) return ''
  return `With ${healthConditionsInWords(codes)}, check with your GP before you start a new exercise plan. I'll keep your sets short of all-out and your cardio by effort, not heart rate.`
}

/**
 * A conditioning prescription in effort words only: every heart-rate figure removed (BPM, % of max HR, "HR below …"),
 * and "max effort" becomes "hard but controlled". The modality, the rounds and the timing are kept.
 */
export function effortWordsOnly(activity: string): string {
  return activity
    .replace(/\s*\(\s*~?\d+\s*-\s*\d+%\s*max HR\s*\)/gi, '')
    .replace(/,?\s*~?\d+\s*-\s*\d+%\s*max HR/gi, '')
    .replace(/\s*\(\s*\d+\s*-\s*\d+\s*BPM,\s*/gi, ' (')
    .replace(/\s*\(\s*\d+\s*-\s*\d+\s*BPM\s*\)/gi, '')
    .replace(/,?\s*\d+\s*-\s*\d+\s*BPM/gi, '')
    .replace(/\s*—\s*HR below \d+\s*BPM/gi, ' — easy effort')
    .replace(/\bmax effort\b/gi, 'hard but controlled')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
