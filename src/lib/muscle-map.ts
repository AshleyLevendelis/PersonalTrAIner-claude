// ---------------------------------------------------------------------------
// WHICH MUSCLES LIGHT UP — the data half of the muscle map.
//
// Ashley, 5 Sep 2026: "we need to be able to demonstrate how to do an exercise
// in the app… users should also be able to see in the app". She chose a muscle
// map on every exercise plus a video on the ones we have checked.
//
// TWO VOCABULARIES, DELIBERATELY KEPT APART.
//
//   MUSCLE_GROUPS in exercise-db.ts is a MEASUREMENT vocabulary. It is the
//   denominator for weekly per-muscle volume and it feeds test:muscle-balance.
//   Adding a group there to make a picture nicer would silently change what
//   that metric measures and make every prior number non-comparable.
//
//   REGIONS below is a DISPLAY vocabulary. It exists only to decide which
//   shape on a drawing gets filled in. It may be coarser or finer than the
//   measurement one and it may approximate, because nothing is counted from
//   it.
//
// So this file has its own mapping and never touches MUSCLE_GROUPS. The gate
// asserts both halves of that: every exercise resolves here, and the
// measurement vocabulary still has exactly its eleven entries.
//
// THE APPROXIMATION RULE. The drawing is schematic — a rotator cuff sits under
// the deltoid, hip flexors are painted with the front of the thigh, the
// tibialis is painted with the calf. That is fine for a shape and NOT fine for
// a word, so the caption always lists the exercise's real `primary_muscles`
// verbatim. Paint approximately, name exactly.
// ---------------------------------------------------------------------------

import type { ExerciseEntry } from './exercise-db'

/** Where on the drawing a muscle is painted. Display only — nothing is counted from these. */
export type MuscleRegion =
  | 'chest' | 'shoulders' | 'biceps' | 'forearms' | 'abs' | 'quads'
  | 'traps' | 'lats' | 'upperBack' | 'rearDelts' | 'triceps' | 'erectors'
  | 'glutes' | 'hamstrings' | 'calves'

/**
 * Free-text `primary_muscles` -> region. The catalogue writes anatomy by hand
 * (62 distinct spellings across 200 entries), so this is a lookup rather than
 * a rule. Anything absent is deliberate, not forgotten: see UNPAINTABLE.
 */
const REGION_BY_MUSCLE: Record<string, MuscleRegion[]> = {
  // --- front -------------------------------------------------------------
  'chest': ['chest'], 'upper chest': ['chest'], 'lower chest': ['chest'],
  'serratus anterior': ['chest'],
  'shoulders': ['shoulders'], 'anterior deltoid': ['shoulders'],
  'front deltoid': ['shoulders'], 'lateral deltoid': ['shoulders'],
  // Under the deltoid on a drawing this size; named exactly in the caption.
  'rotator cuff': ['shoulders'], 'external rotators': ['shoulders'],
  'biceps': ['biceps'], 'biceps brachii': ['biceps'],
  'biceps brachii (long head)': ['biceps'],
  'forearms': ['forearms'], 'brachioradialis': ['forearms'], 'grip': ['forearms'],
  'wrist flexors': ['forearms'], 'wrist extensors': ['forearms'],
  'forearm flexors': ['forearms'], 'forearm extensors': ['forearms'],
  'forearm rotators': ['forearms'], 'pronator teres': ['forearms'],
  'supinator': ['forearms'], 'common extensor tendon': ['forearms'],
  'core': ['abs'], 'rectus abdominis': ['abs'], 'transverse abdominis': ['abs'],
  'obliques': ['abs'],
  'quadriceps': ['quads'], 'quads': ['quads'],
  'hip flexors': ['quads'], 'adductors': ['quads'],
  'tensor fasciae latae': ['glutes'],
  // --- back --------------------------------------------------------------
  'traps': ['traps'], 'upper traps': ['traps'], 'upper trapezius': ['traps'],
  'lats': ['lats'],
  'rhomboids': ['upperBack'], 'mid traps': ['upperBack'],
  'lower trapezius': ['upperBack'], 'teres major': ['upperBack'],
  'upper back': ['upperBack'],
  'rear deltoid': ['rearDelts'],
  'triceps': ['triceps'], 'triceps (long head)': ['triceps'],
  'erectors': ['erectors'], 'erector spinae': ['erectors'],
  'quadratus lumborum': ['erectors'],
  'glutes': ['glutes'], 'glute max': ['glutes'], 'glute medius': ['glutes'],
  'glute minimus': ['glutes'],
  'hamstrings': ['hamstrings'],
  'calves': ['calves'], 'gastrocnemius': ['calves'], 'soleus': ['calves'],
  'tibialis anterior': ['calves'], 'peroneals': ['calves'],
  'ankle stabilisers': ['calves'],
  // --- deliberately plural ------------------------------------------------
  'legs': ['quads', 'hamstrings', 'calves'],
}

/**
 * Muscles that cannot honestly be painted on a body: they name a system or
 * the whole of it, not a place. Listed rather than left to fall through, so
 * an unpaintable muscle is a decision and an UNKNOWN one is a gate failure.
 */
const UNPAINTABLE = new Set(['cardiovascular system', 'full body'])

export type MuscleMapReading = {
  /** Regions to fill in. Empty when nothing can be painted. */
  regions: MuscleRegion[]
  /** The catalogue's own words, verbatim, sentence-cased for display. */
  names: string[]
  /**
   * Set only when nothing can be painted — the honest sentence to show
   * INSTEAD of an unlit figure, which reads as a bug rather than as an answer.
   */
  wordsOnly?: string
  /** Spellings this file has never seen. Non-empty is a gate failure, never a silent skip. */
  unrecognised: string[]
}

/** Sentence case for a hand-written anatomy tag. */
function tidy(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function readMuscleMap(entry: Pick<ExerciseEntry, 'primary_muscles'>): MuscleMapReading {
  const regions: MuscleRegion[] = []
  const unrecognised: string[] = []
  for (const raw of entry.primary_muscles) {
    const m = raw.trim().toLowerCase()
    if (UNPAINTABLE.has(m)) continue
    const mapped = REGION_BY_MUSCLE[m]
    if (!mapped) { unrecognised.push(raw); continue }
    for (const r of mapped) if (!regions.includes(r)) regions.push(r)
  }
  const names = entry.primary_muscles.map(tidy)
  return {
    regions,
    names,
    // "Works your whole body" is true of Burpees and says more than a grey
    // outline does. The words are the catalogue's, not a guess.
    wordsOnly: regions.length === 0 ? `Works ${names.join(' and ').toLowerCase()}.` : undefined,
    unrecognised,
  }
}
