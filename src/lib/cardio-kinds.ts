// ---------------------------------------------------------------------------
// THE CARDIO HE CAN START FROM EXERCISE (his words 27 Nov 2026: "log a cardio workout by going to exercise, clicking
// start workout, choosing a workout, i.e. walk, jog, run, hill sprints, assault bike etc. and pressing start and it
// picks up the steps or heart rate or both depending on which suits. Same as I can in Samsung Health or on iPhone").
//
// One list for the chooser. What is picked is the name the log carries. No imports, so the recorder, the late fill
// and the gates can all ask the same two questions of a name.
//
// WHICH FIGURES SUIT WHICH WORKOUT. Time, heart rate and calories suit every one. STEPS AND DISTANCE SUIT WORK ON
// FOOT ONLY: on a bike, a rower or in the pool the phone's step count is the phone being shaken, and a distance
// worked out from those steps is invented. So a ride records its time, heart rate and calories and says nothing of
// steps, and a distance for one comes only from a watch that measured it (watch-workouts.ts uses the watch's own).
//
// MACHINES ARE OFFERED TO A FULL GYM ONLY, the rule the quick cardio picks already keep (cardio-presets.ts, 9 Oct
// 2026: a modality he cannot do is not a suggestion). "Something else" takes any name, so nothing is out of reach.
// ---------------------------------------------------------------------------

import type { EquipmentAccess } from './types'

export interface CardioKind {
  /** The button's face. */
  label: string
  /** What the log is called. */
  activity: string
}

const ANYWHERE: readonly CardioKind[] = [
  { label: 'Walk', activity: 'Walk' },
  { label: 'Jog', activity: 'Jog' },
  { label: 'Run', activity: 'Run' },
  { label: 'Hill sprints', activity: 'Hill Sprints' },
  { label: 'Hike', activity: 'Hike' },
  { label: 'Cycling', activity: 'Cycling' },
  { label: 'Swim', activity: 'Swim' },
  { label: 'Skipping', activity: 'Skipping' },
]

const GYM_MACHINES: readonly CardioKind[] = [
  { label: 'Treadmill', activity: 'Treadmill' },
  { label: 'Assault bike', activity: 'Assault Bike' },
  { label: 'Exercise bike', activity: 'Exercise Bike' },
  { label: 'Rower', activity: 'Rowing Machine' },
  { label: 'Elliptical', activity: 'Elliptical' },
  { label: 'Stair climber', activity: 'Stair Climber' },
  { label: 'Ski erg', activity: 'Ski Erg' },
]

/** The cardio offered on the Start chooser for this kit. */
export function cardioKindsFor(equipment: EquipmentAccess | null | undefined): readonly CardioKind[] {
  return equipment === 'full_gym' ? [...ANYWHERE, ...GYM_MACHINES] : ANYWHERE
}

/** Work done on foot, where the phone's steps and the distance from them mean something. */
export function tracksSteps(activity: string | null | undefined): boolean {
  return /\b(walk|jog|run|sprint|hik|treadmill)/i.test(activity ?? '')
}

/** A name he typed for "Something else", tidied; null when it is not a name. */
export function customCardioName(typed: string): string | null {
  const name = typed.replace(/\s+/g, ' ').trim().slice(0, 40)
  return /[\p{L}]{2,}/u.test(name) ? name.charAt(0).toUpperCase() + name.slice(1) : null
}
