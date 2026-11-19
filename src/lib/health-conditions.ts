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

import { allergiesOf, allergyRestrictions } from './allergies'

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

/** Pregnant (the "Pregnant" tap, or said in setup): the plan's pregnancy rules and the held calorie target read this. */
export function isPregnant(profile: { health_conditions?: readonly string[] | null } | null | undefined): boolean {
  return healthConditionsOf(profile).includes('pregnancy')
}

// ---------------------------------------------------------------------------
// PREGNANCY AS ONE SWITCH (his rulings 15 Nov 2026; docs/plans/pregnancy-one-switch.md). The tick drives the exercise
// rules (stagePregnancyFilter), the calorie rule (nutritionGoalOf), the food rule (mealRestrictionsOf) and the late
// pregnancy effort rule (pregnancyWeeksOn), so the three can never disagree again (the browser test of 15 Nov found a
// 363 kcal deficit beside the coach's own "weight loss is not appropriate").
// ---------------------------------------------------------------------------

/**
 * THE GOAL CALORIES AND MACROS ARE WORKED OUT FROM. "Maintenance + midwife": while pregnant, fat loss and muscle gain
 * count as maintenance (no deficit, no surplus); the stored goal is kept and comes back when the tick goes. The app
 * never adds pregnancy extra calories: that is the midwife's number.
 */
export function nutritionGoalOf<G extends string>(profile: { fitness_goal: G; health_conditions?: readonly string[] | null }): G | 'functional' {
  if (isPregnant(profile) && (profile.fitness_goal === 'fat_loss' || profile.fitness_goal === 'hypertrophy')) return 'functional'
  return profile.fitness_goal
}

/** Said wherever the calorie target is shown while pregnant. */
export const PREGNANCY_CALORIE_LINE = 'While you\'re pregnant your target is maintenance, with no deficit. Check your calories with your midwife or GP.'

/**
 * EVERY FOOD RULE THE MEALS OBEY: the diets he picked, plus the pregnancy rule while the tick is on ("NHS list,
 * auto-on") and the rules his recorded allergies switch on. Never saved: the picker edits `dietary_preferences`, this reads it.
 */
export function mealRestrictionsOf(profile: { dietary_preferences?: readonly string[] | null; health_conditions?: readonly string[] | null; allergies?: unknown } | null | undefined): string[] {
  const picked = [...(profile?.dietary_preferences ?? [])].filter(p => !DERIVED_RULES.includes(p))
  const out = isPregnant(profile) ? [...picked, 'pregnancy'] : picked
  // The allergy card's rules (his ruling 15 Nov 2026): never saved among the picks, switched on by what is recorded.
  for (const rule of allergyRestrictions(allergiesOf(profile))) if (!out.includes(rule)) out.push(rule)
  return out
}

/** Rules nobody picks: a stored copy of one is ignored, only the tick or the allergy card switches it on. */
const DERIVED_RULES: readonly string[] = ['pregnancy', 'peanut-free', 'tree-nut-free', 'oat-free']

/**
 * HOW FAR ALONG, from the due date ("Ask due date"): whole weeks, 40 at the due date. Null with no date, and the app
 * then treats the pregnancy as past 16 weeks, as before.
 */
export function pregnancyWeeksOn(dueDate: string | null | undefined, today: string): number | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null
  const days = Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (!Number.isFinite(days)) return null
  return Math.max(0, 40 - Math.ceil(days / 7))
}

/**
 * A WEEK NOTE WITHOUT DIETING TALK WHILE PREGNANT (the browser test: "…while you're in a deficit" on a pregnant plan).
 * Drops every sentence about a deficit or fat loss; the rest of the note stands. Unchanged when not pregnant.
 */
export function noteForProfile(note: string | null | undefined, profile: { health_conditions?: readonly string[] | null } | null | undefined): string | null {
  if (!note) return note ?? null
  if (!isPregnant(profile)) return note
  const kept = note.split(/(?<=[.!?])\s+/).filter(s => !/\bdeficit\b|\bfat[- ]loss\b|\blose (?:fat|weight)\b/i.test(s))
  return kept.join(' ').trim() || null
}

/** From this many weeks the effort is capped one notch lower and no load is added (CSCS; the plan doc). */
const LATE_PREGNANCY_WEEKS = 28
/** The working-set ceiling from 28 weeks: one notch below the health ceiling. */
export const LATE_PREGNANCY_SET_RPE_CEILING = 7

/** Said on a lift held at last time's weight from 28 weeks. */
export const PREGNANCY_HOLD_NOTE = 'Same weight as last time: from 28 weeks the weights hold, and the effort stays comfortable.'

/** Pregnant and 28 weeks or more by the due date. False with no date. */
export function lateInPregnancy(profile: { health_conditions?: readonly string[] | null; due_date?: string | null } | null | undefined, today: string): boolean {
  if (!isPregnant(profile)) return false
  const weeks = pregnancyWeeksOn(profile?.due_date ?? null, today)
  return weeks != null && weeks >= LATE_PREGNANCY_WEEKS
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
  // TRUE WHETHER OR NOT THE REBUILD WAS TAKEN (15 Nov 2026, browser test: after "Leave it as it is" the line still said
  // "I'll keep your sets short of all-out", which only a rebuilt plan does). What applies at once is said as fact.
  const pregnant = codes.includes('pregnancy')
  return `With ${healthConditionsInWords(codes)}, check with your ${pregnant ? 'midwife or GP' : 'GP'} before you start a new exercise plan. A plan built with this ticked keeps your sets short of all-out and your cardio by effort, not heart rate.${pregnant ? ' Your calories are maintenance and your meals leave out the NHS foods to avoid in pregnancy, from now.' : ''}`
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

/** The chat's offer to tick Pregnant, and what it says after (15 Nov 2026). */
export const PREGNANCY_TICK_WORDS = {
  offer: 'Shall I tick Pregnant on your profile? Your calories become maintenance, your meals leave out the NHS foods to avoid in pregnancy, and I\'ll offer to rebuild your training without jumping or lying-flat moves. Check any of it with your midwife or GP.',
  unchanged: 'Your history and your other settings stay as they are.',
  done: 'Ticked. You can add your due date on Profile.',
  failed: "I couldn't save that to your profile. Nothing has changed.",
}

/** "I'm pregnant", "I'm 20 weeks pregnant", "we're expecting": said about themselves, not denied. */
export function saidPregnant(text: string): boolean {
  const t = text.toLowerCase()
  if (/\b(not|no longer|isn'?t|wasn'?t|aren'?t)\s+(\w+\s+)?pregnant\b/.test(t)) return false
  return /\b(i'?m|i am|we'?re|we are)\s+(about\s+|around\s+)?(\d+\s+weeks?\s+|\d+\s+months?\s+)?pregnant\b/.test(t)
    || /\b\d+\s*(weeks?|wks?|months?)\s+pregnant\b/.test(t)
    || /\b(i'?m|we'?re)\s+expecting\s+(a\s+)?(baby|twins)\b/.test(t)
}

