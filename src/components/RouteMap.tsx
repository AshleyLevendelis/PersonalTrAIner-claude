import { useEffect, useId, useState } from 'react'
import { readRoute, deleteRoute, mapLayout, routeKm, subscribeRoutes, type WorkoutRoute } from '@/lib/workout-routes'

// ---------------------------------------------------------------------------
// A WALK, JOG OR RUN'S ROUTE, UNDER ITS LOGGED ROW (his request 28 Nov 2026, "map out your journey"; his ruling "Save
// the route"). The line the watch's GPS drew, north up, metres equal both ways, a mint dot where he started and a
// white one where he finished, its length along the line, and "Delete route", which takes the route away and leaves
// the walk logged. THE STREETS UNDER IT come from OpenStreetMap (his ruling 28 Nov 2026, "Streets, OpenStreetMap", over
// Google and over the plain line): map squares asked for by area only, darkened to the app's own night look, with the
// credit OpenStreetMap asks for. With no signal the squares stay blank and the line is still drawn.
// Nothing is drawn for a workout with no route (a bike, the phone's own recording, a watch without GPS).
// ---------------------------------------------------------------------------

const W = 320, H = 180

export function RouteMap({ profileId, activity, startedAt }: { profileId: string; activity: string; startedAt: string }) {
  const [route, setRoute] = useState<WorkoutRoute | null>(null)
  const clipId = `route-clip-${useId().replace(/:/g, '')}`
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const load = () => { void readRoute(profileId, activity, startedAt).then(r => { if (live) setRoute(r) }) }
    load()
    const off = subscribeRoutes(load)
    return () => { live = false; off() }
  }, [profileId, activity, startedAt])

  const drawn = route ? mapLayout(route.points, W, H) : null
  if (!route || !drawn) return null
  const km = routeKm(route.points)

  const onDelete = async () => {
    setDeleting(true)
    setError(null)
    const ok = await deleteRoute(profileId, route)
    setDeleting(false)
    if (!ok) setError("The route didn't delete from your account. Try again in a moment.")
  }

  return (
    <div className="mt-1.5 pl-2.5" data-testid="route-map">
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block rounded-[10px] bg-[color:var(--surface-raised)]" role="img"
        aria-label={`Your route, ${km.toFixed(2)} km`}>
        <defs><clipPath id={clipId}><rect width={W} height={H} rx="10" /></clipPath></defs>
        {/* The night look: the light map turned dark, its colours kept the right way round. */}
        <g clipPath={`url(#${clipId})`} style={{ filter: 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)' }} data-testid="route-streets">
          {drawn.tiles.map(t => <image key={t.url} href={t.url} x={t.x} y={t.y} width={t.size} height={t.size} preserveAspectRatio="none" />)}
        </g>
        <polyline points={drawn.line} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" data-testid="route-line" />
        <circle cx={drawn.start[0]} cy={drawn.start[1]} r="5" fill="var(--primary)" stroke="var(--background)" strokeWidth="2" data-testid="route-start" />
        <circle cx={drawn.end[0]} cy={drawn.end[1]} r="5" fill="var(--foreground)" stroke="var(--background)" strokeWidth="2" data-testid="route-end" />
      </svg>
      {/* OpenStreetMap's credit, in the map's corner where map credits sit, a full-size tap. */}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
        className="absolute bottom-0 right-0 inline-flex min-h-11 items-end px-2 pb-1 text-[0.625rem] text-muted-foreground underline-offset-2 hover:underline"
        data-testid="route-credit"><span className="rounded px-1 bg-[color:color-mix(in_srgb,var(--background)_70%,transparent)]">© OpenStreetMap contributors</span></a>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.75rem] text-muted-foreground tabular-mono" data-testid="route-km">Route · {km.toFixed(2)} km</p>
        <button type="button" onClick={() => void onDelete()} disabled={deleting}
          className="min-h-11 px-2 text-xs font-semibold text-muted-foreground disabled:opacity-50" data-testid="route-delete">
          {deleting ? 'Deleting…' : 'Delete route'}
        </button>
      </div>
      {error && <p className="text-[0.625rem] text-destructive" role="alert">{error}</p>}
    </div>
  )
}
