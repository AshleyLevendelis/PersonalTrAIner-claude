// ---------------------------------------------------------------------------
// THE MUSCLE MAP, REAL, ON THE REAL EXERCISE SHEET — verify:muscle-map.
//
// Mounts the real ExerciseDetailPanel (the Summary tab the user opens) for the
// exercise named in ?ex=, so what is measured is the component the app ships
// and the catalogue's own entry for it. `?secondary=1` instead mounts the bare
// MuscleMap with a SYNTHETIC entry carrying a secondary muscle, because no
// catalogue entry has one yet and the paler tier would otherwise never be seen
// to render. WHAT IS NOT REAL: the Radix dialog around the panel (a portal) and
// the history behind it (no profile id, so none is fetched).
// ---------------------------------------------------------------------------
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ExerciseDetailPanel } from '@/components/exercise/ExerciseDetailDialog'
import { MuscleMap } from '@/components/exercise/MuscleMap'
import '@/index.css'

const q = new URLSearchParams(location.search)

function Harness() {
  if (q.get('secondary')) {
    return (
      <div className="mx-auto max-w-[390px] p-4">
        <MuscleMap entry={{ primary_muscles: ['chest'], secondary_muscles: ['triceps', 'anterior deltoid', 'chest'] }} />
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-[390px] p-4">
      <ExerciseDetailPanel exerciseName={q.get('ex') ?? 'Chin-Ups'} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
