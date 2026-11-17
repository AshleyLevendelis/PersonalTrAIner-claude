// ---------------------------------------------------------------------------
// THE MUSCLE MAP — what this exercise works, on a body.
//
// Ashley, 5 Sep 2026, with two reference screenshots: "we need to be able to
// demonstrate how to do an exercise in the app… users should also be able to
// see in the app". She chose a muscle map on every exercise plus a video on
// the ones we have checked. This is the half that works for all of them.
//
// DRAWN IN THE BUNDLE, NO FETCH, NO PACKAGE. The shapes are the male body from
// react-native-body-highlighter (MIT), vendored as path data in
// lib/body-paths.ts; this component is the renderer. The package itself needs
// react-native, which this web app does not have. It also buys the thing that
// actually matters here: the service worker deliberately never caches
// anything cross-origin (public/sw.js), so anything fetched from elsewhere is
// blank on a gym floor with no signal. Drawn in the bundle, this works with no
// signal at all. VISION.md: "It has to work wherever the user trains."
//
// WHAT THIS IS NOT, and the screen says so: a schematic body with the working
// muscles filled in shows WHAT a lift trains, not HOW to perform it. The cues
// carry the how in words and the video carries it in motion.
//
// THREE FILLS: the working muscle in the accent, a secondary one in a paler
// tint of it, everything else in the panel's own dark purple. NOT THE
// REFERENCE'S RED. Her screenshot lights the working
// muscles in red. Red already means danger on this very panel — "Avoid with"
// renders contraindicated joints in --role-warn-text — so painting the muscles
// you are about to train in the same colour that elsewhere means "don't" would
// collide. Mint is the app's "this is yours" accent and is used instead.
//
// STATIC, NOT ANIMATED. Animating it would mean 200 distinct movements, which
// is the licensed-library route that was not chosen. Nothing here moves, so
// there is nothing for prefers-reduced-motion to suppress.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { readMuscleMap, type MuscleTier } from '@/lib/muscle-map'
import type { BodyView } from '@/lib/body-paths'

type Shapes = typeof import('@/lib/body-paths').BODY_SHAPES

// THE SHAPES ARE THEIR OWN CHUNK, loaded the first time a figure is drawn. They
// are about 45 kB of path data and nobody needs them until an exercise sheet
// opens, so they stay off first paint. This is still "drawn in the bundle, not
// fetched": the build lists every file it makes and the service worker saves
// them all to the phone (vite-asset-manifest.ts), so the chunk is there with no
// signal. `import(` below is the ONE dynamic import in this file and names an
// own-bundle module, never a host.
let loaded: Shapes | null = null
let loading: Promise<Shapes> | null = null
function loadShapes(): Promise<Shapes> {
  loading ??= import('@/lib/body-paths').then(m => (loaded = m.BODY_SHAPES))
  return loading
}

/** The shapes once the chunk is in, and `failed` if it could not be had (a stale tab, a cleared cache). */
function useBodyShapes(): { shapes: Shapes | null; failed: boolean } {
  const [shapes, setShapes] = useState<Shapes | null>(loaded)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loaded) return
    let live = true
    loadShapes().then(s => { if (live) setShapes(s) }).catch(() => { loading = null; if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  return { shapes, failed }
}

/**
 * Each figure is cropped to its own body (the library's sheet puts the front
 * in x 0..724 and the back in x 724..1448, with room around both).
 */
const VIEWBOX: Record<BodyView, string> = {
  front: '40 90 646 1260',
  back: '760 90 646 1260',
}
const VIEWS: BodyView[] = ['front', 'back']

/** Unworked is the panel's own raised purple; primary is the accent; secondary is the accent, paler. */
const FILL: Record<MuscleTier | 'off', { fill: string; opacity: number }> = {
  primary: { fill: 'var(--primary)', opacity: 1 },
  secondary: { fill: 'var(--primary)', opacity: 0.45 },
  off: { fill: 'var(--surface-raised)', opacity: 1 },
}

export function MuscleMap({ entry }: { entry: Parameters<typeof readMuscleMap>[0] }) {
  const { lit, names, secondaryNames, wordsOnly } = readMuscleMap(entry)
  const { shapes, failed } = useBodyShapes()

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

  return (
    <div className="rounded-xl py-3" style={{ background: 'var(--surface-deep)' }}>
      {/* The figure is decorative on its own — the muscles are named in text
          directly underneath, so a screen reader gets the fact rather than a
          description of a drawing. role/aria-label say the same thing for
          anyone who lands on the graphic itself. */}
      <div
        className="mx-auto flex w-full max-w-[15rem] justify-center gap-6"
        role="img" aria-label={`Muscles worked: ${names.join(', ')}`}
      >
        {VIEWS.map(view => (
          <div key={view} className="flex flex-col items-center" data-testid={`muscle-map-${view}`}>
            <svg viewBox={VIEWBOX[view]} className="block h-[210px] w-auto" aria-hidden="true">
              {(shapes?.[view] ?? []).map(([slug, paths]) => {
                const f = FILL[lit[view][slug] ?? 'off']
                return paths.map((d, i) => (
                  <path key={`${slug}-${i}`} data-slug={slug} d={d} fill={f.fill} fillOpacity={f.opacity} />
                ))
              })}
            </svg>
            <span className="mt-1.5 text-[0.625rem] uppercase tracking-[.14em] text-muted-foreground">
              {view === 'front' ? 'Front' : 'Back'}
            </span>
          </div>
        ))}
      </div>
      {failed && (
        <p className="mt-1 px-4 text-center text-[0.6875rem] text-muted-foreground">
          The drawing couldn&apos;t load. The muscles are listed below.
        </p>
      )}
      <p className="mt-2 px-4 text-center text-[0.75rem] leading-[1.45] text-text-tertiary">
        {names.join(', ')}
      </p>
      {secondaryNames.length > 0 && (
        <p className="px-4 text-center text-[0.6875rem] leading-[1.45] text-muted-foreground">
          Also: {secondaryNames.join(', ')}
        </p>
      )}
    </div>
  )
}
