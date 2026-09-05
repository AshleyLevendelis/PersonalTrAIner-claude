// ---------------------------------------------------------------------------
// THE MUSCLE MAP — what this exercise works, on a body.
//
// Ashley, 5 Sep 2026, with two reference screenshots: "we need to be able to
// demonstrate how to do an exercise in the app… users should also be able to
// see in the app". She chose a muscle map on every exercise plus a video on
// the ones we have checked. This is the half that works for all of them.
//
// HAND-ROLLED SVG, NO DEPENDENCY, NO ASSET FILE. ExerciseStrengthChart.tsx
// says it for the chart — "no charting library — none is a dependency and none
// should be added for one chart" — and the same holds for one diagram. It also
// buys the thing that actually matters here: the service worker deliberately
// never caches anything cross-origin (public/sw.js), so anything fetched from
// elsewhere is blank on a gym floor with no signal. Drawn in the bundle, this
// works with no signal at all. VISION.md: "It has to work wherever the user
// trains."
//
// WHAT THIS IS NOT, and the screen says so: a schematic body with the working
// muscles filled in shows WHAT a lift trains, not HOW to perform it. The cues
// carry the how in words and the video carries it in motion.
//
// TWO COLOURS, AND NOT THE REFERENCE'S RED. Her screenshot lights the working
// muscles in red. Red already means danger on this very panel — "Avoid with"
// renders contraindicated joints in --role-warn-text — so painting the muscles
// you are about to train in the same colour that elsewhere means "don't" would
// collide. Mint is the app's "this is yours" accent and is used instead.
//
// STATIC, NOT ANIMATED. Animating it would mean 200 distinct movements, which
// is the licensed-library route that was not chosen. Nothing here moves, so
// there is nothing for prefers-reduced-motion to suppress.
// ---------------------------------------------------------------------------

import { readMuscleMap, type MuscleRegion } from '@/lib/muscle-map'
import type { ExerciseEntry } from '@/lib/exercise-db'

type Shape =
  | { kind: 'rect'; region: MuscleRegion; x: number; y: number; w: number; h: number; r?: number }
  | { kind: 'ellipse'; region: MuscleRegion; x: number; y: number; rx: number; ry: number }

/** Centre lines of the two figures inside the viewBox. */
const FRONT_CX = 38
const BACK_CX = 112

const rect = (region: MuscleRegion, x: number, y: number, w: number, h: number, r = 3): Shape =>
  ({ kind: 'rect', region, x, y, w, h, r })
const ell = (region: MuscleRegion, x: number, y: number, rx: number, ry: number): Shape =>
  ({ kind: 'ellipse', region, x, y, rx, ry })

// Painted approximately, named exactly — see muscle-map.ts. A rotator cuff
// sits under the deltoid here and the tibialis is painted with the calf;
// the caption underneath always lists the catalogue's own words.
const FRONT: Shape[] = [
  ell('shoulders', FRONT_CX - 13, 25, 5.5, 5), ell('shoulders', FRONT_CX + 13, 25, 5.5, 5),
  rect('chest', FRONT_CX - 10.5, 21, 9.5, 11), rect('chest', FRONT_CX + 1, 21, 9.5, 11),
  rect('abs', FRONT_CX - 6, 33.5, 12, 17),
  rect('biceps', FRONT_CX - 18.5, 30, 6, 13), rect('biceps', FRONT_CX + 12.5, 30, 6, 13),
  rect('forearms', FRONT_CX - 20, 44.5, 6, 14), rect('forearms', FRONT_CX + 14, 44.5, 6, 14),
  rect('quads', FRONT_CX - 9.5, 55.5, 8.5, 22), rect('quads', FRONT_CX + 1, 55.5, 8.5, 22),
  rect('calves', FRONT_CX - 8.5, 79, 7, 20), rect('calves', FRONT_CX + 1.5, 79, 7, 20),
]

const BACK: Shape[] = [
  ell('rearDelts', BACK_CX - 13, 25, 5.5, 5), ell('rearDelts', BACK_CX + 13, 25, 5.5, 5),
  rect('traps', BACK_CX - 10, 20.5, 20, 7),
  rect('upperBack', BACK_CX - 10.5, 28, 21, 7),
  rect('lats', BACK_CX - 11, 35.5, 7.5, 14), rect('lats', BACK_CX + 3.5, 35.5, 7.5, 14),
  rect('erectors', BACK_CX - 3, 35.5, 6, 15),
  rect('triceps', BACK_CX - 18.5, 30, 6, 13), rect('triceps', BACK_CX + 12.5, 30, 6, 13),
  rect('forearms', BACK_CX - 20, 44.5, 6, 14), rect('forearms', BACK_CX + 14, 44.5, 6, 14),
  rect('glutes', BACK_CX - 10, 55.5, 9.5, 10), rect('glutes', BACK_CX + 0.5, 55.5, 9.5, 10),
  rect('hamstrings', BACK_CX - 9.5, 66, 8.5, 12), rect('hamstrings', BACK_CX + 1, 66, 8.5, 12),
  rect('calves', BACK_CX - 8.5, 79, 7, 20), rect('calves', BACK_CX + 1.5, 79, 7, 20),
]

/**
 * Head, neck and pelvis: silhouette only, never a region — nothing trains
 * them. The pelvis block is not decoration: without it the thighs float free
 * of the torso and the drawing stops reading as one body.
 */
function Silhouette({ cx }: { cx: number }) {
  return (
    <g fill="var(--surface-raised)">
      <ellipse cx={cx} cy={11} rx={6.5} ry={7.5} />
      <rect x={cx - 3} y={17.5} width={6} height={5} rx={2} />
      <rect x={cx - 9.5} y={50} width={19} height={5} rx={2} />
    </g>
  )
}

export function MuscleMap({ entry }: { entry: Pick<ExerciseEntry, 'primary_muscles'> }) {
  const { regions, names, wordsOnly } = readMuscleMap(entry)
  const lit = new Set(regions)

  // NOTHING PAINTABLE IS ITS OWN ANSWER, not a grey body. Burpees lists
  // "cardiovascular system, full body" — true, and not a place on a drawing.
  // An unlit figure would read as a rendering failure; the sentence does not.
  if (wordsOnly) {
    return (
      <div className="rounded-xl px-4 py-6 text-center" style={{ background: 'var(--surface-deep)' }}>
        <p className="text-[0.8125rem] text-text-tertiary">{wordsOnly}</p>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          Nothing to highlight — this one isn&apos;t about a single muscle.
        </p>
      </div>
    )
  }

  const draw = (shapes: Shape[]) =>
    shapes.map((s, i) =>
      s.kind === 'rect' ? (
        <rect
          key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r}
          fill={lit.has(s.region) ? 'var(--primary)' : 'var(--surface-raised)'}
          opacity={lit.has(s.region) ? 0.9 : 1}
        />
      ) : (
        <ellipse
          key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry}
          fill={lit.has(s.region) ? 'var(--primary)' : 'var(--surface-raised)'}
          opacity={lit.has(s.region) ? 0.9 : 1}
        />
      ),
    )

  return (
    <div className="rounded-xl py-3" style={{ background: 'var(--surface-deep)' }}>
      {/* The figure is decorative on its own — the muscles are named in text
          directly underneath, so a screen reader gets the fact rather than a
          description of a drawing. role/aria-label say the same thing for
          anyone who lands on the graphic itself. */}
      <svg
        viewBox="0 0 150 105" className="mx-auto block h-[150px] w-full max-w-[15rem]"
        role="img" aria-label={`Muscles worked: ${names.join(', ')}`}
      >
        <Silhouette cx={FRONT_CX} />
        {draw(FRONT)}
        <Silhouette cx={BACK_CX} />
        {draw(BACK)}
      </svg>
      <div className="mx-auto flex w-full max-w-[15rem] text-[0.625rem] uppercase tracking-[.14em] text-muted-foreground">
        <span className="flex-1 text-center">Front</span>
        <span className="flex-1 text-center">Back</span>
      </div>
      <p className="mt-2 px-4 text-center text-[0.75rem] leading-[1.45] text-text-tertiary">
        {names.join(', ')}
      </p>
    </div>
  )
}
