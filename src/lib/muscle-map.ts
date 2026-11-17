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
import type { BodySlug, BodyView } from './body-paths'

// ---------------------------------------------------------------------------
// THE ONE MAPPING FILE: the catalogue's muscle names -> the drawing's slugs.
//
// The slugs are the body library's own (`BodySlug`, body-paths.ts), read from
// its published type, not guessed. THE LIBRARY HAS NO LATS, NO TERES, NO
// RHOMBOIDS, NO HIP FLEXORS, NO SERRATUS: where the catalogue names a muscle
// the drawing has no shape for, it maps to the NEAREST slug and says so in a
// comment. The caption under the figure always lists the catalogue's own
// words, so the drawing may approximate and the words never do.
//
// A muscle this file has never seen is not skipped quietly: it logs a warning
// the first time it is read and is listed in `unrecognised`, which
// `test:exercise-demo` turns into a failure for every live exercise.
// ---------------------------------------------------------------------------

/** Where on the drawing a muscle is painted. Display only — nothing is counted from these. */
export type MuscleSlug = BodySlug

/** A slug, optionally only on one view. Most muscles are lit wherever the drawing has them. */
type Target = MuscleSlug | { slug: MuscleSlug; only: BodyView }
const front = (slug: MuscleSlug): Target => ({ slug, only: 'front' })
const back = (slug: MuscleSlug): Target => ({ slug, only: 'back' })

/**
 * Free-text `primary_muscles` -> slugs. The catalogue writes anatomy by hand
 * (62 distinct spellings across 267 entries), so this is a lookup rather than
 * a rule. Anything absent is deliberate, not forgotten: see UNPAINTABLE.
 */
const SLUGS_BY_MUSCLE: Record<string, Target[]> = {
  // --- front -------------------------------------------------------------
  'chest': ['chest'], 'upper chest': ['chest'], 'lower chest': ['chest'],
  // No serratus slug. It sits on the side of the ribcage beside the external
  // obliques, which is the nearest shape the drawing has.
  'serratus anterior': ['obliques'],
  // "Shoulders" and the lateral head are visible from both sides. The
  // anterior head is the front of the shoulder and the rear head the back, so
  // those two are restricted to their view rather than lighting both.
  'shoulders': ['deltoids'], 'lateral deltoid': ['deltoids'],
  'anterior deltoid': [front('deltoids')], 'front deltoid': [front('deltoids')],
  'rear deltoid': [back('deltoids')],
  // The cuff lies under the deltoid; no slug of its own.
  'rotator cuff': ['deltoids'], 'external rotators': ['deltoids'],
  'biceps': ['biceps'], 'biceps brachii': ['biceps'],
  'biceps brachii (long head)': ['biceps'],
  // Deep to the biceps on the front of the upper arm, same visible region.
  'brachialis': ['biceps'],
  // The drawing has one forearm slug, so flexors, extensors, rotators and
  // grip all land on it.
  'forearms': ['forearm'], 'brachioradialis': ['forearm'], 'grip': ['forearm'],
  'wrist flexors': ['forearm'], 'wrist extensors': ['forearm'],
  'forearm flexors': ['forearm'], 'forearm extensors': ['forearm'],
  'forearm rotators': ['forearm'], 'pronator teres': ['forearm'],
  'supinator': ['forearm'], 'common extensor tendon': ['forearm'],
  // Core is the abs AND the obliques on the front of the drawing.
  'core': ['abs', 'obliques'], 'rectus abdominis': ['abs'],
  // Deepest abdominal layer, drawn under the abs.
  'transverse abdominis': ['abs'],
  'obliques': ['obliques'],
  'quadriceps': ['quadriceps'], 'quads': ['quadriceps'],
  // No hip-flexor slug; they sit at the top of the thigh, which is the quad shape.
  'hip flexors': ['quadriceps'],
  'adductors': ['adductors'],
  // Outer hip, no slug: the glute shape on the back is the nearest.
  'tensor fasciae latae': ['gluteal'],
  // --- back --------------------------------------------------------------
  'traps': ['trapezius'], 'upper traps': ['trapezius'], 'upper trapezius': ['trapezius'],
  // THERE IS NO LATS SLUG. The back's "upper-back" shape is the whole sheet of
  // back muscle between the shoulder blades and the waist, which is where the
  // lats, rhomboids and teres major are, so all of them land on it.
  'lats': ['upper-back'], 'teres major': ['upper-back'],
  'rhomboids': ['upper-back'], 'upper back': ['upper-back'],
  // The middle and lower trapezius are the lower half of the trapezius shape.
  'mid traps': ['trapezius'], 'lower trapezius': ['trapezius'],
  'triceps': ['triceps'], 'triceps (long head)': ['triceps'],
  'erectors': ['lower-back'], 'erector spinae': ['lower-back'],
  'quadratus lumborum': ['lower-back'],
  'glutes': ['gluteal'], 'glute max': ['gluteal'], 'glute medius': ['gluteal'],
  'glute minimus': ['gluteal'],
  'hamstrings': ['hamstring'],
  'calves': ['calves'], 'gastrocnemius': ['calves'], 'soleus': ['calves'],
  // Peroneals run down the outside of the shin and calf; nearest is the calf.
  'peroneals': ['calves'],
  'tibialis anterior': ['tibialis'],
  'ankle stabilisers': ['ankles'],
  // --- deliberately plural ------------------------------------------------
  'legs': ['quadriceps', 'hamstring', 'calves'],
}

/**
 * Muscles that cannot honestly be painted on a body: they name a system or
 * the whole of it, not a place. Listed rather than left to fall through, so
 * an unpaintable muscle is a decision and an UNKNOWN one is a gate failure.
 */
const UNPAINTABLE = new Set(['cardiovascular system', 'full body'])

export type MuscleTier = 'primary' | 'secondary'

/** What to fill on each view, and how strongly. */
export type LitSlugs = Record<BodyView, Partial<Record<MuscleSlug, MuscleTier>>>

export type MuscleMapReading = {
  /** Every slug to fill in, on either view. Empty when nothing can be painted. */
  regions: MuscleSlug[]
  /** The same, per view and tier: primary wins where both name one shape. */
  lit: LitSlugs
  /** The catalogue's own words, verbatim, sentence-cased for display. */
  names: string[]
  /** Secondary muscles in the catalogue's words. Empty for every entry today. */
  secondaryNames: string[]
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

/**
 * Which shapes each view of the drawing actually has: biceps exist on the
 * front only, glutes on the back only. WRITTEN OUT HERE, not read off the
 * shapes, so this file never imports the 45 kB of path data (which loads as
 * its own chunk when a figure is first drawn); `test:exercise-demo` fails if
 * this list and the data ever disagree.
 */
export const SHAPES_ON: Record<BodyView, ReadonlySet<MuscleSlug>> = {
  front: new Set<MuscleSlug>([
    'chest', 'obliques', 'abs', 'biceps', 'triceps', 'neck', 'trapezius', 'deltoids', 'adductors',
    'quadriceps', 'knees', 'tibialis', 'calves', 'forearm', 'hands', 'ankles', 'feet', 'head', 'hair',
  ]),
  back: new Set<MuscleSlug>([
    'neck', 'trapezius', 'deltoids', 'upper-back', 'triceps', 'lower-back', 'forearm', 'gluteal',
    'adductors', 'hamstring', 'calves', 'ankles', 'feet', 'hands', 'head', 'hair',
  ]),
}

const warned = new Set<string>()

/**
 * The catalogue has no secondary-muscle field today, so this reads one only
 * if an entry carries it. The type is declared here and not on the catalogue
 * entry, which this change does not touch.
 */
export type MuscleMapInput = Pick<ExerciseEntry, 'primary_muscles'> & { secondary_muscles?: string[] }

export function readMuscleMap(entry: MuscleMapInput): MuscleMapReading {
  const lit: LitSlugs = { front: {}, back: {} }
  const unrecognised: string[] = []

  const paint = (muscles: string[], tier: MuscleTier) => {
    for (const raw of muscles) {
      const m = raw.trim().toLowerCase()
      if (UNPAINTABLE.has(m)) continue
      const targets = SLUGS_BY_MUSCLE[m]
      if (!targets) {
        unrecognised.push(raw)
        if (!warned.has(m)) {
          warned.add(m)
          console.warn(`[muscle-map] no body shape mapped for muscle "${raw}" — it will not be highlighted`)
        }
        continue
      }
      for (const t of targets) {
        const slug = typeof t === 'string' ? t : t.slug
        const views: BodyView[] = typeof t === 'string' ? ['front', 'back'] : [t.only]
        for (const v of views) {
          if (!SHAPES_ON[v].has(slug)) continue
          lit[v][slug] = tier
        }
      }
    }
  }
  // ORDER IS THE RULE: primary is painted last, so where both name one shape
  // the primary wins and a secondary can never downgrade it.
  paint(entry.secondary_muscles ?? [], 'secondary')
  paint(entry.primary_muscles, 'primary')

  const regions: MuscleSlug[] = []
  for (const v of ['front', 'back'] as const) {
    for (const slug of Object.keys(lit[v]) as MuscleSlug[]) if (!regions.includes(slug)) regions.push(slug)
  }
  const names = entry.primary_muscles.map(tidy)
  return {
    regions,
    lit,
    names,
    secondaryNames: (entry.secondary_muscles ?? []).map(tidy),
    // "Works your whole body" is true of Burpees and says more than a grey
    // outline does. The words are the catalogue's, not a guess.
    wordsOnly: regions.length === 0 ? `Works ${names.join(' and ').toLowerCase()}.` : undefined,
    unrecognised,
  }
}
